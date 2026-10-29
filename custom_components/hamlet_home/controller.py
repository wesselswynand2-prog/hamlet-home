"""Energy controller: live power, history backfill, daily kWh and cost."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, State, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import energy
from .const import (
    CONF_BATTERY_INVERT,
    CONF_BATTERY_POWER,
    CONF_BATTERY_SOC,
    CONF_EXTRA_LOADS,
    CONF_GRID_INVERT,
    CONF_GRID_POWER,
    CONF_GRID_STATUS,
    CONF_LOAD_POWER,
    CONF_NAME,
    CONF_SOLAR_AC,
    CONF_SOLAR_DC,
    CONF_SOLAR_POWER,
    DOMAIN,
    KEEP_DAYS,
    PUSH_MIN_SECONDS,
    SIGNAL_UPDATE,
    TICK_SECONDS,
)

_LOGGER = logging.getLogger(__name__)
BAD = (STATE_UNAVAILABLE, STATE_UNKNOWN, None, "", "none")
GRID_UP_WORDS = {"on", "true", "connected", "available", "grid", "ok", "online", "1", "yes"}
POWER_FACTORS = {"W": 1.0, "kW": 1000.0, "MW": 1_000_000.0, "mW": 0.001}


def _list(value: Any) -> list[str]:
    if not value:
        return []
    return [value] if isinstance(value, str) else list(value)


def to_number(state: State | dict | None, kind: str) -> float | None:
    """State -> float in W (power) or % (soc)."""
    if state is None:
        return None
    if isinstance(state, dict):
        raw, unit = state.get("state"), (state.get("attributes") or {}).get("unit_of_measurement")
    else:
        raw, unit = state.state, state.attributes.get("unit_of_measurement")
    if raw in BAD:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if kind == "power":
        value *= POWER_FACTORS.get((unit or "W").strip(), 1.0)
    return value


class EnergyController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.tariff: dict = dict(energy.DEFAULT_TARIFF)
        self.acc = energy.Accumulator(max_gap=600)
        self.live: dict[str, Any] = {}
        self.battery: dict = dict(energy.DEFAULT_BATTERY)
        self.learned_capacity: float | None = None
        self._smooth: dict[str, float] = {}
        self._smooth_t: float | None = None
        self.extras: list[dict] = []
        self.ready = False  # history backfill finished
        self.backfill_note: str | None = None
        self._units: dict[str, str] = {}
        self._unsubs: list[CALLBACK_TYPE] = []
        self._listeners: list[Callable[[], None]] = []
        self._last_push = 0.0
        self._push_pending: CALLBACK_TYPE | None = None

    # ----------------------------------------------------------------- config
    @property
    def conf(self) -> dict:
        return {**self.entry.data, **self.entry.options}

    @property
    def name(self) -> str:
        return self.conf.get(CONF_NAME) or "Home"

    @property
    def mapping(self) -> energy.Mapping:
        c = self.conf
        return energy.Mapping(
            solar=_list(c.get(CONF_SOLAR_POWER)), load=_list(c.get(CONF_LOAD_POWER)),
            solar_ac=_list(c.get(CONF_SOLAR_AC)), solar_dc=_list(c.get(CONF_SOLAR_DC)),
            grid=_list(c.get(CONF_GRID_POWER)), battery=_list(c.get(CONF_BATTERY_POWER)),
            soc=_list(c.get(CONF_BATTERY_SOC)),
            battery_invert=bool(c.get(CONF_BATTERY_INVERT)), grid_invert=bool(c.get(CONF_GRID_INVERT)),
        )

    def _kind(self, entity_id: str) -> str:
        return "soc" if entity_id in self.mapping.soc else "power"

    # -------------------------------------------------------------- lifecycle
    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.tariff = {**energy.DEFAULT_TARIFF, **data.get("tariff", {})}
        self.battery = {**energy.DEFAULT_BATTERY, **data.get("battery", {})}
        self.learned_capacity = data.get("learned_capacity")
        self.acc.days = data.get("days", {})
        self.acc.load_buckets(data.get("buckets", {}))
        self._read_live()
        self.entry.async_create_background_task(self.hass, self._async_backfill_then_live(), f"{DOMAIN}_backfill")

    async def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._push_pending:
            self._push_pending()
        if self.ready:
            self.acc.advance(dt_util.now())
        await self.store.async_save(self._store_data())

    def _store_data(self) -> dict:
        today = dt_util.now().date()
        keep = {(today - timedelta(days=n)).isoformat() for n in range(2)}
        cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
        self.acc.days = {d: v for d, v in self.acc.days.items() if d >= cutoff}
        self.acc.buckets = {d: v for d, v in self.acc.buckets.items() if d in keep}
        return {"tariff": self.tariff, "battery": self.battery, "learned_capacity": self.learned_capacity, "days": self.acc.days, "buckets": self.acc.dump_buckets(keep)}

    def _save(self, delay: float = 30) -> None:
        self.store.async_delay_save(self._store_data, delay)

    async def _async_backfill_then_live(self) -> None:
        try:
            await self._async_backfill()
        except Exception:  # noqa: BLE001 - history is a nice-to-have; never block live data
            _LOGGER.exception("Hamlet Home: could not read history, continuing with live data only")
            self.backfill_note = "History could not be read – charts start from now."
        now = dt_util.now()
        self.acc.set(now, energy.combine(self._raw_now(), self.mapping))
        self.ready = True
        self._learn_capacity()
        ids = self.mapping.all_entities() + _list(self.conf.get(CONF_EXTRA_LOADS)) + _list(self.conf.get(CONF_GRID_STATUS))
        self._unsubs.append(async_track_state_change_event(self.hass, ids, self._on_change))
        self._unsubs.append(async_track_time_interval(self.hass, self._on_tick, timedelta(seconds=TICK_SECONDS)))
        self._save(5)
        self._notify(force=True)

    # --------------------------------------------------------------- history
    async def _async_backfill(self) -> None:
        if "recorder" not in self.hass.config.components:
            self.backfill_note = "Recorder is off – charts start from now."
            return
        from homeassistant.components.recorder import get_instance, history, statistics  # noqa: PLC0415

        m = self.mapping
        ids = m.all_entities()
        if not ids:
            return
        now = dt_util.now()
        today_start = dt_util.start_of_local_day(now)
        y_start = today_start - timedelta(days=1)
        rec = get_instance(self.hass)

        def _states() -> dict[str, list]:
            return history.get_significant_states(
                self.hass, y_start.astimezone(dt_util.UTC), now.astimezone(dt_util.UTC), ids,
                include_start_time_state=True, significant_changes_only=False,
                minimal_response=True, no_attributes=True,
            )

        result = await rec.async_add_executor_job(_states)
        events: list[tuple[datetime, str, float | None]] = []
        initial: dict[str, float | None] = {}
        for entity_id, states in result.items():
            kind = self._kind(entity_id)
            current = self.hass.states.get(entity_id)
            unit = current.attributes.get("unit_of_measurement") if current else None  # history rows carry no attributes
            for st in states:
                if isinstance(st, State):
                    raw_state, changed = st.state, st.last_changed
                else:  # minimal dict
                    raw_state = st.get("state")
                    changed = st.get("last_changed")
                    changed = dt_util.parse_datetime(changed) if isinstance(changed, str) else dt_util.utc_from_timestamp(changed)
                t = dt_util.as_local(changed)
                value = to_number({"state": raw_state, "attributes": {"unit_of_measurement": unit}}, kind)
                if t <= y_start:
                    initial[entity_id] = value
                    continue
                events.append((t, entity_id, value))
        events.sort(key=lambda e: e[0])
        if events or initial:
            events.insert(0, (y_start, "__start__", None))
            replayed = energy.replay(events, m, now, initial)
            for day in (y_start.date().isoformat(), today_start.date().isoformat()):
                if day in replayed.days:
                    self.acc.replace_day(day, replayed)

        # Older days from long-term statistics (hourly means), only for days we don't have yet
        if len([d for d in self.acc.days if d < y_start.date().isoformat()]) < 25:
            start = today_start - timedelta(days=31)

            def _stats() -> dict:
                return statistics.statistics_during_period(
                    self.hass, start.astimezone(dt_util.UTC), y_start.astimezone(dt_util.UTC), set(ids), "hour",
                    {"power": "W"}, {"mean"},
                )

            stats = await rec.async_add_executor_job(_stats)
            hours: dict[datetime, dict[str, float | None]] = {}
            for entity_id, rows in stats.items():
                for row in rows:
                    t = row["start"]
                    t = dt_util.as_local(dt_util.utc_from_timestamp(t) if isinstance(t, (int, float)) else t)
                    hours.setdefault(t, {})[entity_id] = row.get("mean")
            for day, totals in energy.hourly_energy(hours, m).items():
                self.acc.days.setdefault(day, totals)
            if not stats:
                self.backfill_note = "No long-term statistics for these sensors – the 30-day history fills in from today."

    # ------------------------------------------------------------------ live
    def _raw_now(self) -> dict[str, float | None]:
        raw = {}
        for entity_id in self.mapping.all_entities():
            raw[entity_id] = to_number(self.hass.states.get(entity_id), self._kind(entity_id))
        return raw

    def _grid_available(self) -> bool | None:
        entity_id = self.conf.get(CONF_GRID_STATUS)
        if not entity_id:
            return None
        state = self.hass.states.get(entity_id)
        if state is None or state.state in BAD:
            return None
        raw = str(state.state).strip().lower()
        name = f"{entity_id} {state.attributes.get('friendly_name', '')}".lower()
        if state.attributes.get("device_class") == "problem" or any(w in name for w in ("alarm", "lost", "loss", "fail", "outage")):
            try:
                return float(raw) == 0
            except ValueError:
                return raw in {"off", "false", "ok", "no alarm", "none", "normal"}
        try:
            number = float(raw)
            return number > 40 if state.attributes.get("unit_of_measurement") == "Hz" else number > 150
        except ValueError:
            return raw in GRID_UP_WORDS

    def _read_live(self) -> dict:
        values = energy.combine(self._raw_now(), self.mapping)
        extras = []
        for entity_id in _list(self.conf.get(CONF_EXTRA_LOADS)):
            st = self.hass.states.get(entity_id)
            name = (st.attributes.get("friendly_name") if st else None) or entity_id.split(".")[-1].replace("_", " ").title()
            extras.append({"entity_id": entity_id, "name": name, "w": to_number(st, "power")})
        self.extras = extras
        self.live = {**values, "grid_available": self._grid_available()}
        self._update_smooth(values)
        return values

    def _update_smooth(self, values: dict) -> None:
        """~1 minute average of load / solar / battery so the battery times don't jump around."""
        now = time.monotonic()
        k = 1.0 if self._smooth_t is None else min(max(now - self._smooth_t, 0) / 60, 1.0)
        self._smooth_t = now
        for key in ("load", "solar", "battery"):
            v = values.get(key)
            if v is None:
                self._smooth.pop(key, None)
            elif key not in self._smooth:
                self._smooth[key] = v
            else:
                self._smooth[key] += (v - self._smooth[key]) * k

    def _learn_capacity(self) -> None:
        today = dt_util.now().date()
        days = [self.acc.rows((today - timedelta(days=n)).isoformat()) for n in (1, 0)]
        cap = energy.estimate_capacity(days)
        if cap is not None:
            self.learned_capacity = cap

    @property
    def capacity_kwh(self) -> float | None:
        return self.battery.get("capacity_kwh") or self.learned_capacity

    def outlook(self) -> dict:
        live = {**self.live, **{k: round(v, 1) for k, v in self._smooth.items()}}
        out = energy.battery_outlook(live, self.capacity_kwh, float(self.battery.get("reserve", 20)))
        out["capacity_source"] = "set" if self.battery.get("capacity_kwh") else ("learned" if self.learned_capacity else None)
        out["learned_kwh"] = self.learned_capacity
        return out

    async def _on_change(self, event: Event) -> None:
        values = self._read_live()
        if self.ready:
            self.acc.set(dt_util.now(), values)
        self._notify()

    async def _on_tick(self, now: datetime) -> None:
        values = self._read_live()
        if self.ready:
            self.acc.set(dt_util.now(), values)
            self._tick_count = getattr(self, "_tick_count", 0) + 1
            if self._tick_count % 10 == 1:   # every ~5 minutes
                self._learn_capacity()
            self._save()
        self._notify(force=True)

    # ------------------------------------------------------------- listeners
    @callback
    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)
        return lambda: cb in self._listeners and self._listeners.remove(cb)

    @callback
    def _notify(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_push < PUSH_MIN_SECONDS:
            if self._push_pending is None:
                self._push_pending = async_call_later(self.hass, PUSH_MIN_SECONDS, self._delayed_push)
            return
        self._last_push = now
        async_dispatcher_send(self.hass, SIGNAL_UPDATE)
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # noqa: BLE001
                _LOGGER.exception("listener failed")

    @callback
    def _delayed_push(self, _now) -> None:
        self._push_pending = None
        self._notify(force=True)

    # ------------------------------------------------------------- settings
    async def async_set_tariff(self, tariff: dict) -> None:
        clean = {}
        for key in ("import", "export", "daily_fixed"):
            if key in tariff:
                value = float(tariff[key])
                if not 0 <= value <= 1000:
                    raise ValueError(f"{key} must be between 0 and 1000")
                clean[key] = value
        if "currency" in tariff:
            clean["currency"] = str(tariff["currency"])[:4] or "R"
        self.tariff.update(clean)
        self._save(1)
        self._notify(force=True)

    async def async_set_battery(self, new: dict) -> None:
        clean = {}
        if "capacity_kwh" in new:
            cap = new["capacity_kwh"]
            if cap in (None, "", 0):
                clean["capacity_kwh"] = None
            else:
                cap = float(cap)
                if not 0.5 <= cap <= 1000:
                    raise ValueError("Battery size must be between 0.5 and 1000 kWh")
                clean["capacity_kwh"] = round(cap, 2)
        if "reserve" in new:
            r = float(new["reserve"])
            if not 0 <= r <= 90:
                raise ValueError("Reserve must be between 0 and 90 %")
            clean["reserve"] = round(r)
        self.battery.update(clean)
        self._save(1)
        self._notify(force=True)

    # ------------------------------------------------------------- snapshot
    def today(self) -> dict:
        if self.ready:
            self.acc.advance(dt_util.now())
        day = dt_util.now().date().isoformat()
        totals = {k: round(v, 3) for k, v in self.acc.days.get(day, {}).items()}
        return {**totals, **energy.money(totals, self.tariff)} if totals else {}

    def snapshot(self, history: bool = False) -> dict:
        c = self.conf
        snap: dict[str, Any] = {
            "entry_id": self.entry.entry_id,
            "name": self.name,
            "ready": self.ready,
            "note": self.backfill_note,
            "live": self.live,
            "extras": self.extras,
            "today": self.today(),
            "tariff": self.tariff,
            "battery": self.outlook() if (c.get(CONF_BATTERY_SOC) and c.get(CONF_BATTERY_POWER)) else None,
            "features": {
                "battery": bool(c.get(CONF_BATTERY_POWER) or c.get(CONF_BATTERY_SOC)),
                "soc": bool(c.get(CONF_BATTERY_SOC)),
                "grid": bool(c.get(CONF_GRID_POWER)),
                "grid_status": bool(c.get(CONF_GRID_STATUS)),
                "load_meter": bool(c.get(CONF_LOAD_POWER)),
                "pv_ac": bool(c.get(CONF_SOLAR_AC)),
                "pv_dc": bool(c.get(CONF_SOLAR_DC)),
            },
        }
        if history:
            today = dt_util.now().date()
            yday = (today - timedelta(days=1)).isoformat()
            snap["rows"] = {"today": self.acc.rows(today.isoformat()), "yesterday": self.acc.rows(yday)}
            days = []
            for n in range(29, -1, -1):
                d = (today - timedelta(days=n)).isoformat()
                totals = self.acc.days.get(d)
                if totals:
                    days.append({"day": d, **{k: round(v, 2) for k, v in totals.items()}, **energy.money(totals, self.tariff)})
                else:
                    days.append({"day": d})
            snap["days"] = days
            snap["raw"] = {
                entity_id: (st.state + (" " + st.attributes.get("unit_of_measurement", "") if st.attributes.get("unit_of_measurement") else "")) if (st := self.hass.states.get(entity_id)) else "missing"
                for entity_id in self.mapping.all_entities() + _list(c.get(CONF_GRID_STATUS))
            }
        return snap
