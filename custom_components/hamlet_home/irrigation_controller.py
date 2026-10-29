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
        return self.run is not None or bool(self.manual_off)

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

    def _zone(self, zid: str) -> dict | None:
        return next((z for z in self.zones if z["id"] == zid), None)

    def _zone_by_entity(self, entity_id: str) -> dict | None:
        return next((z for z in self.zones if z.get("entity") == entity_id), None)

    def skip_reason(self, now: datetime) -> str | None:
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
            return
        # finished: pump off first, then the last valve
        if self.settings.get("pump_entity"):
            await self._set(self.settings["pump_entity"], False)
        if prev is not None:
            await self._set(prev["entity"], False)
        self.last_note = f"Finished {run['by']} – {run['done']} valve{'s' if run['done'] != 1 else ''}"
        self.run = None
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
        self._save()

    # ------------------------------------------------------------------ tick
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
        for entity_id, due in list(self.manual_off.items()):
            if now >= due:
                self.manual_off.pop(entity_id, None)
                if self._is_on(entity_id):
                    await self._set(entity_id, False)
                    z = self._zone_by_entity(entity_id)
                    self.last_note = f"Closed {z['name'] if z else entity_id} after its time"
        if self.run is not None or self.manual_off:
            self._notify_ui()

    async def _on_valve_change(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        new = event.data.get("new_state")
        if new is None or new.state in BAD:
            return
        on = new.state in ON_STATES
        expected = self._expect.get(entity_id)
        ours = expected is not None and expected[0] == on and (dt_util.now() - expected[1]).total_seconds() < 60
        run_entity = (self._zone(self.run["current"]) or {}).get("entity") if self.run and self.run.get("current") else None
        if on and not ours and entity_id != run_entity and self.settings.get("manual_auto_off", True):
            z = self._zone_by_entity(entity_id)
            if z is not None:
                secs = irr.zone_seconds(z, 100, self.settings["max_minutes"]) or 60
                self.manual_off[entity_id] = dt_util.now() + timedelta(seconds=secs)
                self.last_watered[z["id"]] = dt_util.now().isoformat()
        if not on:
            self.manual_off.pop(entity_id, None)
            if entity_id == run_entity and not ours:
                # closed by hand during a run: carry on with the next valve
                await self._advance(dt_util.now())
        self._notify_ui()

    # --------------------------------------------------------------- actions
    async def async_action(self, action: str, data: dict) -> None:
        s = self.settings
        now = dt_util.now()
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
                   "remaining": max(int((self.run["end"] - now).total_seconds()), 0) if self.run.get("end") else None,
                   "secs": self.run.get("secs"), "index": self.run["done"] + 1, "total": self.run["total"],
                   "next": [self._zone(q[0])["name"] for q in self.run["queue"] if self._zone(q[0])]}
        zones = []
        for z in self.zones:
            ent = z.get("entity")
            st = self.hass.states.get(ent) if ent else None
            zones.append({**z, "on": bool(st and st.state in ON_STATES), "available": bool(st and st.state not in BAD),
                          "last": self.last_watered.get(z["id"]),
                          "closes": self.manual_off[ent].isoformat() if ent in self.manual_off else None})
        nxt = irr.next_program_start(self.settings.get("programs", []), now)
        today = now.date().isoformat()
        return {
            "zones": zones, "run": run, "settings": {k: v for k, v in self.settings.items() if k != "zones"},
            "skip": self.skip_reason(now), "next_program": nxt.isoformat() if nxt else None, "note": self.last_note,
            "today": [{**e} for e in self.log.get(today, [])],
            "today_minutes": round(sum(e["secs"] for e in self.log.get(today, [])) / 60),
            "pump_on": self._is_on(self.settings["pump_entity"]) if self.settings.get("pump_entity") else None,
        }

    def entity_options(self) -> dict:
        """Candidates for valves, pump and rain sensor (admin pickers)."""
        valves, rain = [], []
        for st in self.hass.states.async_all():
            domain = st.domain
            name = st.attributes.get("friendly_name") or st.entity_id
            if domain in ("switch", "valve", "input_boolean"):
                valves.append({"id": st.entity_id, "name": name})
            if domain == "weather" or (domain in ("binary_sensor", "sensor") and any(w in st.entity_id for w in ("rain", "reen", "moist", "wet", "precip"))):
                rain.append({"id": st.entity_id, "name": name})
        return {"valves": sorted(valves, key=lambda x: x["name"].lower()), "rain": sorted(rain, key=lambda x: x["name"].lower())}
