"""Water & pump controller: booster pump monitoring + dry-run protection, pool pump timer."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import water
from .const import (
    CONF_POOL_POWER,
    CONF_POOL_SWITCH,
    CONF_PUMP_AMPS,
    CONF_PUMP_HZ,
    CONF_PUMP_POWER,
    CONF_PUMP_SPEED,
    CONF_PUMP_SWITCH,
    CONF_TANK_LEVEL,
    CONF_WATER_PRESSURE,
    CONF_WATER_SETPOINT,
    DOMAIN,
    WATER_KEYS,
)

_LOGGER = logging.getLogger(__name__)
BAD = (STATE_UNAVAILABLE, STATE_UNKNOWN, None, "", "none")
PRESSURE_FACTORS = {"bar": 1.0, "kPa": 0.01, "Pa": 0.00001, "psi": 0.0689476, "mbar": 0.001, "MPa": 10.0}
EVENT_TEXT = {
    "dry_run": ("Pump stopped – no water?", "The booster pump was running but the pressure stayed below {bar} bar for {secs} s, "
                "so Hamlet Home switched it off. Check the water supply, then press Reset on the Water page."),
    "long_run": ("Pump running non-stop", "The booster pump has been running for {mins} minutes without stopping. "
                 "Check for an open tap, a leak or a burst pipe."),
    "low_pressure": ("Low water pressure", "Water pressure is {now} bar (alert below {bar} bar)."),
}


class WaterController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, notify: Callable[[], None]) -> None:
        self.hass = hass
        self.entry = entry
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.water")
        self.settings: dict = dict(water.DEFAULT_WATER_SETTINGS)
        self.guard = water.Guard()
        self.pump = water.RunCounter()
        self.pool = water.RunCounter()
        self.buckets = water.PressureBuckets()
        self.live: dict[str, Any] = {}
        self.pool_reason = ""
        self._pool_last_desired: bool | None = None
        self._pool_last_switch: datetime | None = None
        self.pool_solar_grant: bool | None = None
        self.pool_solar_why = ""
        self.pool_via_full = False
        self._notify_ui = notify
        self._unsubs: list[CALLBACK_TYPE] = []

    @property
    def conf(self) -> dict:
        return {**self.entry.data, **self.entry.options}

    @property
    def enabled(self) -> bool:
        return any(self.conf.get(k) for k in WATER_KEYS)

    # -------------------------------------------------------------- lifecycle
    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.settings = {**water.DEFAULT_WATER_SETTINGS, **data.get("settings", {})}
        self.pump.days = data.get("pump_days", {})
        self.pool.days = data.get("pool_days", {})
        self.buckets.data = {d: {int(k): v for k, v in slots.items()} for d, slots in data.get("buckets", {}).items()}
        g = data.get("guard", {})
        if g.get("tripped"):
            self.guard.tripped = True
            self.guard.tripped_at = dt_util.parse_datetime(g.get("tripped_at") or "") or dt_util.now()
        if not self.enabled:
            return
        ids = [self.conf[k] for k in WATER_KEYS if self.conf.get(k)]
        self._unsubs.append(async_track_state_change_event(self.hass, ids, self._on_change))
        self._unsubs.append(async_track_time_interval(self.hass, self._on_tick, timedelta(seconds=20)))
        await self.async_evaluate()

    async def async_stop(self) -> None:
        for u in self._unsubs:
            u()
        self._unsubs.clear()
        await self.store.async_save(self._store_data())

    def _store_data(self) -> dict:
        today = dt_util.now().date()
        keep = {(today - timedelta(days=n)).isoformat() for n in range(2)}
        cutoff = (today - timedelta(days=60)).isoformat()
        self.pump.days = {d: v for d, v in self.pump.days.items() if d >= cutoff}
        self.pool.days = {d: v for d, v in self.pool.days.items() if d >= cutoff}
        self.buckets.data = {d: v for d, v in self.buckets.data.items() if d in keep}
        return {
            "settings": self.settings, "pump_days": self.pump.days, "pool_days": self.pool.days,
            "buckets": {d: {str(k): v for k, v in slots.items()} for d, slots in self.buckets.data.items()},
            "guard": {"tripped": self.guard.tripped, "tripped_at": self.guard.tripped_at.isoformat() if self.guard.tripped_at else None},
        }

    def _save(self, delay: float = 30) -> None:
        self.store.async_delay_save(self._store_data, delay)

    # ---------------------------------------------------------------- reading
    def _num(self, key: str) -> float | None:
        entity_id = self.conf.get(key)
        if not entity_id:
            return None
        st = self.hass.states.get(entity_id)
        if st is None or st.state in BAD:
            return None
        try:
            v = float(st.state)
        except (TypeError, ValueError):
            return None
        unit = (st.attributes.get("unit_of_measurement") or "").strip()
        if key in (CONF_WATER_PRESSURE, CONF_WATER_SETPOINT):
            v *= PRESSURE_FACTORS.get(unit, 1.0)
        elif key in (CONF_PUMP_POWER, CONF_POOL_POWER) and unit == "kW":
            v *= 1000
        return v

    def _switch(self, key: str) -> bool | None:
        entity_id = self.conf.get(key)
        if not entity_id:
            return None
        st = self.hass.states.get(entity_id)
        if st is None or st.state in BAD:
            return None
        if entity_id.split(".")[0] in ("sensor",):
            try:
                return float(st.state) > 0
            except ValueError:
                return st.state.lower() in ("on", "running", "true")
        return st.state == STATE_ON

    def _read(self) -> dict:
        s = self.settings
        pump_sw, pool_sw = self._switch(CONF_PUMP_SWITCH), self._switch(CONF_POOL_SWITCH)
        pump_w, pool_w = self._num(CONF_PUMP_POWER), self._num(CONF_POOL_POWER)
        hz = self._num(CONF_PUMP_HZ)
        live = {
            "pressure": self._num(CONF_WATER_PRESSURE), "setpoint": self._num(CONF_WATER_SETPOINT),
            "pump_switch": pump_sw, "pump_w": pump_w, "pump_hz": hz, "pump_a": self._num(CONF_PUMP_AMPS),
            "pump_speed": self._num(CONF_PUMP_SPEED), "pool_switch": pool_sw, "pool_w": pool_w,
            "tank": self._num(CONF_TANK_LEVEL),
        }
        live["pump_running"] = water.is_running(pump_sw, pump_w, hz, s["running_watts"]) if (pump_sw is not None or pump_w is not None or hz is not None) else None
        live["pool_running"] = water.is_running(pool_sw, pool_w, None, s["running_watts"]) if (pool_sw is not None or pool_w is not None) else None
        return live

    # ---------------------------------------------------------------- control
    async def _on_change(self, event: Event) -> None:
        await self.async_evaluate()

    async def _on_tick(self, now: datetime) -> None:
        await self.async_evaluate()
        self._save()

    async def async_evaluate(self) -> None:
        now = dt_util.now()
        live = self._read()
        s = self.settings

        # pool pump timer: act only when the wanted state changes, so manual switching is respected
        if self.conf.get(CONF_POOL_SWITCH):
            hours = self.pool.days.get(now.date().isoformat(), {}).get("seconds", 0) / 3600
            want, self.pool_reason = water.pool_desired(s["pool_mode"], s["pool_schedules"], now, self.pool_solar_grant,
                                                         self.pool_solar_why, hours, float(s["pool_hours"]))
            hold = (s["pool_mode"] == "solar" and self._pool_last_switch is not None
                    and (now - self._pool_last_switch).total_seconds() < s["pool_min_switch_s"])
            if want != self._pool_last_desired and live["pool_switch"] is not None and not hold:
                if want != live["pool_switch"]:
                    await self._switch_to(CONF_POOL_SWITCH, want)
                    live["pool_switch"] = want
                    self._pool_last_switch = now
                self._pool_last_desired = want
            elif hold and want != live["pool_switch"]:
                self.pool_reason += " (waiting a few minutes to protect the pump)"

        # booster pump watchdog
        irr = self.hass.data.get(DOMAIN, {}).get("irrigation")
        guard_settings = {**s, "long_run_minutes": 0} if irr is not None and irr.active else s
        for ev in self.guard.check(now, live["pump_running"], live["pressure"], guard_settings):
            if ev == "dry_run" and self.conf.get(CONF_PUMP_SWITCH):
                await self._switch_to(CONF_PUMP_SWITCH, False)
            if ev in EVENT_TEXT:
                await self._alert(ev, live)
            elif ev == "pressure_ok":
                await self.hass.services.async_call("persistent_notification", "dismiss", {"notification_id": f"{DOMAIN}_low_pressure"}, blocking=False)
            if ev == "dry_run":
                self._save(1)
        if self.guard.tripped and live["pump_switch"] and self.conf.get(CONF_PUMP_SWITCH):
            # someone switched it back on outside the app: keep protecting until reset
            await self._switch_to(CONF_PUMP_SWITCH, False)

        self.pump.update(now, bool(live["pump_running"]) if live["pump_running"] is not None else None)
        self.pool.update(now, bool(live["pool_running"]) if live["pool_running"] is not None else None)
        self.buckets.set(now, live["pressure"], bool(live["pump_running"]), bool(live["pool_running"]))
        self.live = live
        self._notify_ui()

    async def _switch_to(self, key: str, on: bool) -> None:
        await self.hass.services.async_call("homeassistant", "turn_on" if on else "turn_off", {"entity_id": self.conf[key]}, blocking=False)

    async def _alert(self, ev: str, live: dict) -> None:
        title, text = EVENT_TEXT[ev]
        s = self.settings
        msg = text.format(bar=s["dry_run_bar"] if ev == "dry_run" else s["low_pressure_bar"], secs=int(s["dry_run_seconds"]),
                          mins=int(s["long_run_minutes"]), now=f"{live['pressure']:.2f}" if live["pressure"] is not None else "?")
        await self.hass.services.async_call("persistent_notification", "create",
                                            {"title": f"Hamlet Home: {title}", "message": msg, "notification_id": f"{DOMAIN}_{ev}"}, blocking=False)
        svc = s.get("notify_service")
        if svc and "." in svc:
            domain, name = svc.split(".", 1)
            if self.hass.services.has_service(domain, name):
                await self.hass.services.async_call(domain, name, {"title": title, "message": msg}, blocking=False)
        _LOGGER.warning("%s: %s", title, msg)

    # ---------------------------------------------------------------- actions
    async def async_action(self, action: str, value: Any = None) -> None:
        if action == "pump":
            if not self.conf.get(CONF_PUMP_SWITCH):
                raise ValueError("No pump switch set up")
            if value and self.guard.tripped:
                self.guard.reset()
            await self._switch_to(CONF_PUMP_SWITCH, bool(value))
        elif action == "reset":
            self.guard.reset()
            await self.hass.services.async_call("persistent_notification", "dismiss", {"notification_id": f"{DOMAIN}_dry_run"}, blocking=False)
            if self.conf.get(CONF_PUMP_SWITCH):
                await self._switch_to(CONF_PUMP_SWITCH, True)
        elif action == "pool_mode":
            self.settings.update(water.validate_water_settings({"pool_mode": value}, admin=True))
            self._pool_last_desired = None  # apply the new mode now
        else:
            raise ValueError(f"Unknown action {action}")
        self._save(1)
        await self.async_evaluate()

    async def async_save_settings(self, new: dict, admin: bool) -> None:
        clean = water.validate_water_settings(new, admin)
        if "pool_schedules" in clean or "pool_mode" in clean:
            self._pool_last_desired = None
        self.settings.update(clean)
        self._save(1)
        await self.async_evaluate()

    # ------------------------------------------------------ solar sharing
    def solar_load(self) -> dict | None:
        """The pool pump as a switchable solar load (only in Solar mode)."""
        if not self.conf.get(CONF_POOL_SWITCH) or self.settings["pool_mode"] != "solar":
            return None
        now = dt_util.now()
        s = self.settings
        hours = self.pool.days.get(now.date().isoformat(), {}).get("seconds", 0) / 3600
        wants, _ = water.pool_solar_wants(s["pool_schedules"], now, hours, float(s["pool_hours"]))
        running = bool(self.live.get("pool_switch"))
        rated = float(s["pool_rated_w"])
        measured = self.live.get("pool_w")
        return {
            "id": "pool", "name": "Pool pump", "kind": "pool",
            "wants": wants, "running": running,
            "power": (measured or rated) if running else rated,
            "draw": (measured if measured is not None else rated) if running else 0.0,
            "start_w": float(s["pool_solar_start_w"]), "keep_w": float(s["pool_solar_keep_w"]),
            "via_full": self.pool_via_full,
        }

    async def async_set_solar_grant(self, grant: bool | None, why: str = "", via_full: bool = False) -> None:
        changed = grant != self.pool_solar_grant or why != self.pool_solar_why
        self.pool_solar_grant, self.pool_solar_why, self.pool_via_full = grant, why, via_full
        if changed:
            await self.async_evaluate()

    # --------------------------------------------------------------- snapshot
    def snapshot(self, history: bool = False) -> dict | None:
        if not self.enabled:
            return None
        today = dt_util.now().date()
        t = today.isoformat()
        c = self.conf
        snap = {
            "live": self.live,
            "pool_reason": self.pool_reason,
            "tripped": self.guard.tripped,
            "tripped_at": self.guard.tripped_at.isoformat() if self.guard.tripped_at else None,
            "run_since": self.guard.run_since.isoformat() if self.guard.run_since else None,
            "pump_today": self.pump.days.get(t, {}),
            "pool_today": self.pool.days.get(t, {}),
            "settings": self.settings,
            "features": {k: bool(c.get(k)) for k in WATER_KEYS},
        }
        if history:
            y = (today - timedelta(days=1)).isoformat()
            snap["rows"] = {"today": self.buckets.rows(t), "yesterday": self.buckets.rows(y)}
            snap["pump_week"] = [{"day": (today - timedelta(days=n)).isoformat(), **self.pump.days.get((today - timedelta(days=n)).isoformat(), {})} for n in range(6, -1, -1)]
        return snap
