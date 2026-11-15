"""Irrigation controller: valves one after another, programs, rain skip, pump / master valve."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import irrigation as irr
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
TICK = timedelta(seconds=5)
PAUSE_MAX = timedelta(hours=2)
HOSE_MAX_MIN = 12 * 60          # a hose run (e.g. filling the pool) is never left open longer than this    # a paused run that isn't resumed ends by itself
ON_STATES = {"on", "open", "opening"}
BAD = (STATE_UNAVAILABLE, STATE_UNKNOWN, None)


class IrrigationController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, notify: Callable[[], None]) -> None:
        self.hass, self.entry = hass, entry
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.irrigation")
        self.settings: dict = dict(irr.DEFAULT_IRRIGATION)
        self.log: dict[str, list] = {}           # day -> [{zone, start, secs, by}]
        self.last_watered: dict[str, str] = {}   # zone id -> iso time
        self.run: dict | None = None             # {"queue", "current", "end", "by", "total", "done"}
        self.manual_off: dict[str, datetime] = {}
        self.hose: dict | None = None            # hose tap open on its own: {"zone", "started", "end", "minutes", "litres"}
        self.sp_note = ""
        self.last_note = ""
        self._expect: dict[str, tuple[bool, datetime]] = {}
        self._last_check: datetime | None = None
        self._notify_ui = notify
        self._unsubs: list[CALLBACK_TYPE] = []
        self._state_unsub: CALLBACK_TYPE | None = None

    # ------------------------------------------------------------- lifecycle
    @property
    def zones(self) -> list[dict]:
        return self.settings.get("zones", [])

    @property
    def active(self) -> bool:
        return self.run is not None or bool(self.manual_off) or self.hose is not None

    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.settings = {**irr.DEFAULT_IRRIGATION, **data.get("settings", {})}
        self.log = data.get("log", {})
        self.last_watered = data.get("last_watered", {})
        self._last_check = dt_util.now()
        self._track_states()
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, TICK))
        # a valve left open (e.g. across a restart) closes after its time
        now = dt_util.now()
        for z in self.zones:
            if z.get("entity") and self._is_on(z["entity"]):
                self.manual_off[z["entity"]] = now + timedelta(seconds=irr.zone_seconds(z, 100, self.settings["max_minutes"]) or 60)
        if self.manual_off and self.settings.get("pump_entity") and not self._is_on(self.settings["pump_entity"]):
            pass  # leave the pump alone: someone else may be using it

    async def async_stop(self) -> None:
        for u in self._unsubs:
            u()
        self._unsubs.clear()
        if self._state_unsub:
            self._state_unsub()
            self._state_unsub = None
        if self.run is not None:
            await self._stop_run("Home Assistant stopping")
        await self.store.async_save(self._store_data())

    def _store_data(self) -> dict:
        cutoff = (dt_util.now().date() - timedelta(days=14)).isoformat()
        self.log = {d: v for d, v in self.log.items() if d >= cutoff}
        return {"settings": self.settings, "log": self.log, "last_watered": self.last_watered}

    def _save(self, delay: float = 5) -> None:
        self.store.async_delay_save(self._store_data, delay)

    def _track_states(self) -> None:
        if self._state_unsub:
            self._state_unsub()
            self._state_unsub = None
        ids = [z["entity"] for z in self.zones if z.get("entity")]
        if ids:
            self._state_unsub = async_track_state_change_event(self.hass, ids, self._on_valve_change)

    # --------------------------------------------------------------- helpers
    def _is_on(self, entity_id: str) -> bool:
        st = self.hass.states.get(entity_id)
        return st is not None and st.state in ON_STATES

    async def _set(self, entity_id: str, on: bool) -> None:
        if not entity_id:
            return
        self._expect[entity_id] = (on, dt_util.now())
        domain = entity_id.split(".")[0]
        if domain == "valve":
            await self.hass.services.async_call("valve", "open_valve" if on else "close_valve", {"entity_id": entity_id}, blocking=False)
        else:
            await self.hass.services.async_call("homeassistant", "turn_on" if on else "turn_off", {"entity_id": entity_id}, blocking=False)

    # ------------------------------------------------- pressure set point per station
    def _sp_entity(self) -> str | None:
        water = self.hass.data.get(DOMAIN, {}).get("water")
        eid = (water.conf.get("water_setpoint") if water is not None else None) or None
        return eid if eid and eid.split(".")[0] in ("number", "input_number") else None

    @staticmethod
    def _to_unit(bar: float, unit: str) -> float:
        u = (unit or "bar").strip().lower()
        return round(bar * 100, 1) if u == "kpa" else round(bar * 14.5038, 1) if u == "psi" else round(bar * 1e5) if u == "pa" else round(bar, 2)

    @staticmethod
    def _from_unit(v: float, unit: str) -> float:
        u = (unit or "bar").strip().lower()
        return v / 100 if u == "kpa" else v / 14.5038 if u == "psi" else v / 1e5 if u == "pa" else v

    async def _sync_setpoint(self) -> None:
        """While a station with its own set point waters, the booster runs at that pressure; afterwards it goes back."""
        eid = self._sp_entity()
        if not eid:
            return
        st = self.hass.states.get(eid)
        if st is None or st.state in BAD:
            return
        unit = st.attributes.get("unit_of_measurement") or "bar"
        try:
            cur = float(st.state)
        except ValueError:
            return
        want = None
        if self.run and self.run.get("current") and not self.run.get("paused"):
            want = (self._zone(self.run["current"]) or {}).get("setpoint")
        if want is None:
            for z in self.zones:
                if z.get("setpoint") and z.get("entity") and self._is_on(z["entity"]):
                    want = z["setpoint"]
                    break
        if want is not None:
            if self.settings.get("sp_restore") is None:
                self.settings["sp_restore"] = round(self._from_unit(cur, unit), 2)   # the house pressure, to go back to
                self._save()
            target = self._to_unit(want, unit)
        elif self.settings.get("sp_restore") is not None:
            target = self._to_unit(self.settings["sp_restore"], unit)
            self.settings["sp_restore"] = None
            self._save()
        else:
            return
        if abs(target - cur) < 1e-6:
            return
        try:
            await self.hass.services.async_call(eid.split(".")[0], "set_value", {"entity_id": eid, "value": target}, blocking=False)
            self.sp_note = f"Pump set point {self._from_unit(target, unit):.1f} bar"
        except Exception as err:  # noqa: BLE001 - watering must carry on even if the set point can't be changed
            _LOGGER.warning("Hamlet Home: could not set %s to %s: %s", eid, target, err)

    def _zone(self, zid: str) -> dict | None:
        return next((z for z in self.zones if z["id"] == zid), None)

    def _zone_by_entity(self, entity_id: str) -> dict | None:
        return next((z for z in self.zones if z.get("entity") == entity_id), None)

    def pump_tripped(self) -> bool:
        wc = self.hass.data.get(DOMAIN, {}).get("water")
        return bool(wc is not None and getattr(wc, "guard", None) is not None and wc.guard.tripped)

    async def async_pump_tripped(self) -> None:
        """The booster pump's dry-run protection tripped: pause the run (resumed on Reset) and close hand-opened valves."""
        now = dt_util.now()
        if self.run is not None and self.run.get("current") and self.run.get("paused") is None:
            await self._pause(now)
            self.run["by_trip"] = True
            z = self._zone(self.run["current"]) or {}
            self.last_note = f"Paused {z.get('name', 'watering')} – the booster pump tripped (no water). Reset the pump to carry on."
        for entity_id in list(self.manual_off):
            self.manual_off.pop(entity_id, None)
            await self._set(entity_id, False)
        if self.hose:
            await self.async_hose_stop("the booster pump tripped")
        self._notify_ui()

    async def async_pump_reset(self) -> None:
        """The pump was reset: carry on with a run that the trip paused."""
        if self.run is not None and self.run.pop("by_trip", False) and self.run.get("paused") is not None:
            await self._resume(dt_util.now())

    def skip_reason(self, now: datetime) -> str | None:
        if self.pump_tripped():
            return "the booster pump is tripped (no water) – reset it on the Pump tab"
        s = self.settings
        delay = dt_util.parse_datetime(s["rain_delay_until"]) if s.get("rain_delay_until") else None
        rain = s.get("rain_entity") or ""
        st = self.hass.states.get(rain) if rain else None
        return irr.rain_reason(None if st is None or st.state in BAD else st.state, rain.split(".")[0] if rain else None,
                               delay, now, bool(s.get("skip_when_raining", True)))

    # ------------------------------------------------------------------- run
    async def async_start_run(self, queue: list[list], by: str) -> None:
        if not queue:
            raise ValueError("No valves to water – check the times and that each valve has a switch")
        if self.run is not None:
            await self._stop_run("replaced")
        self.run = {"queue": [list(q) for q in queue], "current": None, "end": None, "by": by, "total": len(queue), "done": 0, "started": None}
        await self._advance(dt_util.now())
        self._notify_ui()

    async def _advance(self, now: datetime) -> None:
        """Open the next valve (before closing the previous one, so the pump never dead-heads)."""
        run = self.run
        if run is None:
            return
        prev = self._zone(run["current"]) if run["current"] else None
        if prev is not None:
            self._log(prev, run)
            run["done"] += 1
        while run["queue"]:
            zid, secs = run["queue"].pop(0)
            z = self._zone(zid)
            if z is None or not z.get("entity"):
                continue
            await self._set(z["entity"], True)
            if self.settings.get("pump_entity") and not self._is_on(self.settings["pump_entity"]):
                await self._set(self.settings["pump_entity"], True)
            if prev is not None and prev["entity"] != z["entity"]:
                await self._set(prev["entity"], False)
            run.update(current=zid, end=now + timedelta(seconds=secs), started=now, secs=secs)
            await self._sync_setpoint()
            return
        # finished: pump off first, then the last valve
        if self.settings.get("pump_entity"):
            await self._set(self.settings["pump_entity"], False)
        if prev is not None:
            await self._set(prev["entity"], False)
        self.last_note = f"Finished {run['by']} – {run['done']} valve{'s' if run['done'] != 1 else ''}"
        self.run = None
        await self._sync_setpoint()
        self._save()

    def _log(self, z: dict, run: dict) -> None:
        now = dt_util.now()
        started = run.get("started") or now
        secs = int((now - started).total_seconds())
        self.log.setdefault(now.date().isoformat(), []).append(
            {"zone": z["id"], "name": z["name"], "start": started.isoformat(), "secs": secs, "by": run["by"]})
        self.last_watered[z["id"]] = started.isoformat()

    async def _stop_run(self, why: str) -> None:
        run = self.run
        if run is None:
            return
        cur = self._zone(run["current"]) if run.get("current") else None
        if self.settings.get("pump_entity"):
            await self._set(self.settings["pump_entity"], False)
        if cur is not None:
            self._log(cur, run)
            await self._set(cur["entity"], False)
        self.run = None
        self.last_note = f"Stopped ({why})"
        await self._sync_setpoint()
        self._save()

    # ------------------------------------------------------------------ tick
    def given(self, zid: str, since: datetime | None = None) -> float | None:
        """Litres this valve has given since it last opened (from the water counter), None without it.
        `since`: a count that started before this (an earlier opening, not yet reset) counts as 0."""
        wc = self.hass.data.get(DOMAIN, {}).get("water")
        if wc is None or not wc.settings.get("flow_enabled"):
            return None
        last = wc.meter.last.get(zid)
        if not last:
            return 0.0
        if since is not None:
            at = dt_util.parse_datetime(last.get("at") or "")
            if at is None or at < since - timedelta(seconds=15):
                return 0.0
        return float(last["l"])

    async def _pause(self, now: datetime) -> None:
        """Close the watering valve but keep its place and time left; Resume carries on from there."""
        run = self.run
        if run is None or not run.get("current") or run.get("paused") is not None:
            return
        z = self._zone(run["current"]) or {}
        run["paused"] = max(int((run["end"] - now).total_seconds()), 1) if run.get("end") else 60
        run["paused_at"] = now
        run["l_before"] = float(run.get("l_before") or 0) + float(self.given(run["current"], run.get("started")) or 0)
        run["end"] = None
        if self.settings.get("pump_entity"):
            await self._set(self.settings["pump_entity"], False)
        if z.get("entity"):
            await self._set(z["entity"], False)
        await self._sync_setpoint()
        self.last_note = f"Paused {z.get('name', 'watering')}"
        self._notify_ui()

    async def _resume(self, now: datetime) -> None:
        run = self.run
        if run is None or run.get("paused") is None:
            return
        z = self._zone(run["current"]) or {}
        if z.get("entity"):
            await self._set(z["entity"], True)
        if self.settings.get("pump_entity"):
            await self._set(self.settings["pump_entity"], True)
        run.update(end=now + timedelta(seconds=run["paused"]), started=now, paused=None, paused_at=None)
        await self._sync_setpoint()
        self.last_note = f"Resumed {z.get('name', 'watering')}"
        self._notify_ui()

    # ----------------------------------------------------------------- hose tap
    async def async_hose_start(self, zid: str, minutes: float | None, litres: float | None) -> None:
        """Open a hose tap on its own (next to any irrigation run) until the time or the litres are reached."""
        z = self._zone(zid)
        if z is None or not z.get("entity"):
            raise ValueError("Unknown tap")
        if self.pump_tripped():
            raise ValueError("The booster pump is tripped (no water) – check the water, then Reset it on the Pump tab")
        if litres is not None and not 1 <= float(litres) <= 1_000_000:
            raise ValueError("Litres must be 1 … 1 000 000")
        if minutes is not None and not 0 < float(minutes) <= HOSE_MAX_MIN:
            raise ValueError(f"Time must be 1 … {HOSE_MAX_MIN} minutes")
        if litres is not None and self.given(zid) is None:
            raise ValueError("Litres need the water counter – switch on Count the water (Pump tab → Water use)")
        now = dt_util.now()
        mins = float(minutes) if minutes else HOSE_MAX_MIN
        if self.hose and self.hose["zone"] != zid:
            await self.async_hose_stop("another tap opened")
        self.hose = {"zone": zid, "started": now, "end": now + timedelta(minutes=mins), "minutes": float(minutes) if minutes else None,
                     "litres": float(litres) if litres else None}
        await self._set(z["entity"], True)
        self.manual_off.pop(z["entity"], None)
        if self.settings.get("pump_entity") and not self._is_on(self.settings["pump_entity"]):
            await self._set(self.settings["pump_entity"], True)
        self.last_watered[zid] = now.isoformat()
        self.last_note = f"{z['name']} open" + (f" for {float(litres):.0f} L" if litres else "") + (f" – at most {mins:.0f} min" if minutes else "")
        self._notify_ui()

    async def async_hose_stop(self, why: str = "stopped") -> None:
        h, self.hose = self.hose, None
        if not h:
            return
        z = self._zone(h["zone"]) or {}
        got = self.given(h["zone"], h["started"])
        if z.get("entity") and self._is_on(z["entity"]):
            await self._set(z["entity"], False)
        if self.settings.get("pump_entity") and self.run is None and self._is_on(self.settings["pump_entity"]):
            await self._set(self.settings["pump_entity"], False)
        self.last_note = f"{z.get('name', 'Tap')} closed ({why})" + (f" – {got:.0f} L" if got else "")
        self._notify_ui()

    async def _check_hose(self, now: datetime) -> None:
        h = self.hose
        if not h:
            return
        got = self.given(h["zone"], h["started"])
        if h.get("litres") and got is not None and got >= h["litres"]:
            await self.async_hose_stop(f"{h['litres']:.0f} L reached")
        elif now >= h["end"]:
            await self.async_hose_stop("time up")

    def hose_info(self) -> dict | None:
        h = self.hose
        if not h:
            return None
        z = self._zone(h["zone"]) or {}
        got = self.given(h["zone"], h["started"])
        wc = self.hass.data.get(DOMAIN, {}).get("water")
        return {"zone": h["zone"], "name": z.get("name"), "since": h["started"].isoformat(),
                "remaining": max(int((h["end"] - dt_util.now()).total_seconds()), 0), "minutes": h.get("minutes"),
                "litres_limit": h.get("litres"), "litres": None if got is None else round(got),
                "lpm": getattr(wc, "live", {}).get("flow_lpm") if wc is not None else None}

    def run_litres(self) -> float | None:
        """Litres the valve of the run has given this time (across pauses)."""
        run = self.run
        if not run or not run.get("current"):
            return None
        now_l = self.given(run["current"], run.get("started")) if run.get("paused") is None else 0.0
        if now_l is None:
            return None
        return float(run.get("l_before") or 0) + now_l

    async def _check_litres(self, now: datetime) -> None:
        """Close a valve once it has given its litres – in a run (go to the next valve) or opened by hand."""
        cur = self.run.get("current") if self.run else None
        if cur and self.run.get("paused") is not None:
            if now - self.run.get("paused_at", now) > PAUSE_MAX:      # forgotten pause: end the run
                await self._stop_run("paused too long")
            return
        if cur:
            z = self._zone(cur) or {}
            got = self.run_litres()
            if z.get("litres") and got is not None and got >= z["litres"]:
                self.last_note = f"Closed {z.get('name')} after {got:.0f} L"
                await self._advance(now)
        for z in self.zones:
            if not z.get("litres") or (cur and z["id"] == cur) or not self._is_on(z.get("entity", "")):
                continue
            got = self.given(z["id"])
            if got is not None and got >= z["litres"]:
                self.manual_off.pop(z["entity"], None)
                await self._set(z["entity"], False)
                self.last_note = f"Closed {z['name']} after {got:.0f} L"

    async def _tick(self, _now=None) -> None:
        now = dt_util.now()
        last, self._last_check = self._last_check or now, now
        s = self.settings
        for prog in irr.due_programs(s.get("programs", []), last, now):
            reason = self.skip_reason(now)
            if reason:
                self.last_note = f"Skipped {prog['start']} program – {reason}"
                continue
            if self.run is not None:
                self.last_note = f"Skipped {prog['start']} program – already watering"
                continue
            queue = irr.program_queue(prog, self.zones, float(s["amount"]), float(s["max_minutes"]))
            if queue:
                await self.async_start_run(queue, f"{prog['start']} program")
        if self.run is not None and self.run.get("end") and now >= self.run["end"]:
            await self._advance(now)
        await self._check_litres(now)
        await self._check_hose(now)
        for entity_id, due in list(self.manual_off.items()):
            if now >= due:
                self.manual_off.pop(entity_id, None)
                if self._is_on(entity_id):
                    await self._set(entity_id, False)
                    z = self._zone_by_entity(entity_id)
                    self.last_note = f"Closed {z['name'] if z else entity_id} after its time"
        if self.run is not None or self.manual_off or self.hose:
            self._notify_ui()

    async def _on_valve_change(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        new = event.data.get("new_state")
        if new is None or new.state in BAD:
            return
        on = new.state in ON_STATES
        wc = self.hass.data.get(DOMAIN, {}).get("water")
        if wc is not None and getattr(wc, "enabled", False):   # book the water up to now on the valves that were open
            await wc.async_evaluate()
        expected = self._expect.get(entity_id)
        ours = expected is not None and expected[0] == on and (dt_util.now() - expected[1]).total_seconds() < 60
        run_entity = (self._zone(self.run["current"]) or {}).get("entity") if self.run and self.run.get("current") else None
        hose_entity = (self._zone(self.hose["zone"]) or {}).get("entity") if self.hose else None
        if on and not ours and entity_id not in (run_entity, hose_entity) and self.settings.get("manual_auto_off", True):
            z = self._zone_by_entity(entity_id)
            if z is not None:
                secs = irr.zone_seconds(z, 100, self.settings["max_minutes"]) or 60
                self.manual_off[entity_id] = dt_util.now() + timedelta(seconds=secs)
                self.last_watered[z["id"]] = dt_util.now().isoformat()
        if not on:
            self.manual_off.pop(entity_id, None)
            if self.hose and not ours and (self._zone(self.hose["zone"]) or {}).get("entity") == entity_id:
                self.hose = None          # closed at the tap itself
            if entity_id == run_entity and not ours:
                # closed by hand during a run: carry on with the next valve
                await self._advance(dt_util.now())
        if self._zone_by_entity(entity_id) is not None:
            await self._sync_setpoint()
        self._notify_ui()

    # --------------------------------------------------------------- actions
    async def async_action(self, action: str, data: dict) -> None:
        s = self.settings
        now = dt_util.now()
        if action == "hose_start":
            await self.async_hose_start(str(data.get("zone")), data.get("minutes") or None, data.get("litres") or None)
            return
        if action == "hose_stop":
            await self.async_hose_stop("stopped by hand")
            return
        if action in ("run_zone", "run_all", "run_program", "resume") and self.pump_tripped():
            raise ValueError("The booster pump is tripped (no water) – check the water, then Reset it on the Pump tab")
        if action == "run_all":
            await self.async_start_run(irr.program_queue(None, self.zones, float(s["amount"]), float(s["max_minutes"])), "Run all")
        elif action == "run_zone":
            z = self._zone(str(data.get("zone")))
            if z is None or not z.get("entity"):
                raise ValueError("Unknown valve")
            minutes = float(data.get("minutes") or z["minutes"] or 5)
            secs = int(min(minutes, float(s["max_minutes"])) * 60)
            await self.async_start_run([[z["id"], secs]], f"{z['name']} by hand")
        elif action == "run_program":
            prog = next((p for p in s.get("programs", []) if p["id"] == data.get("program")), None)
            if prog is None:
                raise ValueError("Unknown program")
            await self.async_start_run(irr.program_queue(prog, self.zones, float(s["amount"]), float(s["max_minutes"])), f"{prog['start']} program (now)")
        elif action == "stop":
            await self._stop_run("stopped by hand")
            for entity_id in list(self.manual_off):
                self.manual_off.pop(entity_id, None)
                await self._set(entity_id, False)
        elif action == "pause":
            await self._pause(now)
        elif action == "resume":
            await self._resume(now)
        elif action == "skip_zone":
            if self.run is not None:
                await self._advance(now)
        elif action == "rain_delay":
            hours = float(data.get("hours") or 0)
            s["rain_delay_until"] = (now + timedelta(hours=hours)).isoformat() if hours > 0 else None
            self._save(1)
        else:
            raise ValueError(f"Unknown action {action}")
        self._notify_ui()

    async def async_save_settings(self, new: dict, admin: bool) -> None:
        had_zones = bool(self.zones)
        clean = irr.validate(new, self.settings, admin)
        self.settings.update(clean)
        await self.store.async_save(self._store_data())
        if "zones" in clean:
            self._track_states()
            if not had_zones and self.zones:
                # first valves added: reload so the irrigation sensor appears
                self.hass.config_entries.async_schedule_reload(self.entry.entry_id)
        self._notify_ui()

    # -------------------------------------------------------------- snapshot
    def snapshot(self) -> dict:
        now = dt_util.now()
        run = None
        if self.run is not None and self.run.get("current"):
            z = self._zone(self.run["current"]) or {}
            run = {"zone": self.run["current"], "name": z.get("name"), "by": self.run["by"],
                   "remaining": max(int((self.run["end"] - now).total_seconds()), 0) if self.run.get("end") else self.run.get("paused"),
                   "paused": self.run.get("paused") is not None, "by_trip": bool(self.run.get("by_trip")),
                   "secs": self.run.get("secs"), "index": self.run["done"] + 1, "total": self.run["total"],
                   "litres": None if self.run_litres() is None else round(self.run_litres()), "litres_limit": z.get("litres"),
                   "next": [self._zone(q[0])["name"] for q in self.run["queue"] if self._zone(q[0])]}
        zones = []
        for z in self.zones:
            ent = z.get("entity")
            st = self.hass.states.get(ent) if ent else None
            zones.append({**z, "on": bool(st and st.state in ON_STATES), "available": bool(st and st.state not in BAD),
                          "last": self.last_watered.get(z["id"]), "is_hose": irr.is_hose(z),
                          "closes": self.manual_off[ent].isoformat() if ent in self.manual_off else None})
        nxt = irr.next_program_start(self.settings.get("programs", []), now)
        today = now.date().isoformat()
        return {
            "zones": zones, "run": run, "hose": self.hose_info(), "settings": {k: v for k, v in self.settings.items() if k != "zones"},
            "skip": self.skip_reason(now), "next_program": nxt.isoformat() if nxt else None, "note": self.last_note,
            "today": [{**e} for e in self.log.get(today, [])],
            "today_minutes": round(sum(e["secs"] for e in self.log.get(today, [])) / 60),
            "pump_on": self._is_on(self.settings["pump_entity"]) if self.settings.get("pump_entity") else None,
            # per-station set point works when the booster's set point can be written (a number / input_number)
            "setpoint_ok": self._sp_entity() is not None, "sp_note": self.sp_note,
        }

    def entity_options(self) -> dict:
        """Candidates for valves, pump and rain sensor (admin pickers)."""
        from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
        ents, devs, areas = er.async_get(self.hass), dr.async_get(self.hass), ar.async_get(self.hass)

        def area_of(eid: str) -> str:
            e = ents.async_get(eid)
            aid = e.area_id if e else None
            if e and not aid and e.device_id:
                d = devs.async_get(e.device_id)
                aid = d.area_id if d else None
            a = areas.async_get_area(aid) if aid else None
            return a.name if a else ""

        valves, rain = [], []
        for st in self.hass.states.async_all():
            domain = st.domain
            name = st.attributes.get("friendly_name") or st.entity_id
            if domain in ("switch", "valve", "input_boolean"):
                valves.append({"id": st.entity_id, "name": name, "area": area_of(st.entity_id)})
            if domain == "weather" or (domain in ("binary_sensor", "sensor") and any(w in st.entity_id for w in ("rain", "reen", "moist", "wet", "precip"))):
                rain.append({"id": st.entity_id, "name": name})
        return {"valves": sorted(valves, key=lambda x: x["name"].lower()), "rain": sorted(rain, key=lambda x: x["name"].lower())}
