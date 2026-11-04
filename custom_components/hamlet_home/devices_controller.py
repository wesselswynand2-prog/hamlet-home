"""Runs the Shelly devices (heat pumps, heaters, aircons …): Timer / Solar / On / Off, like the pool pump."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import devices as dv
from . import water
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
TICK = timedelta(seconds=30)
BAD = ("unavailable", "unknown", "")


class _DeviceState:
    def __init__(self) -> None:
        self.counter = water.RunCounter()
        self.reason = ""
        self.last_desired: bool | None = None
        self.last_switch: datetime | None = None
        self.grant: bool | None = None
        self.why = ""
        self.via_full = False
        self.live: dict[str, Any] = {}


class DevicesController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, notify: Callable[[], None]) -> None:
        self.hass, self.entry, self._notify = hass, entry, notify
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.devices")
        self.devices: list[dict] = []
        self.state: dict[str, _DeviceState] = {}
        self._unsubs: list[CALLBACK_TYPE] = []
        self._watch: CALLBACK_TYPE | None = None

    # ------------------------------------------------------------ lifecycle
    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.devices = [{**dv.DEFAULT_DEVICE, **d} for d in data.get("devices", [])]
        for d in self.devices:
            st = self.state.setdefault(d["id"], _DeviceState())
            st.counter.days = data.get("days", {}).get(d["id"], {})
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, TICK))
        self._rewatch()
        await self.async_evaluate()

    async def async_stop(self) -> None:
        for u in self._unsubs:
            u()
        self._unsubs.clear()
        if self._watch:
            self._watch()
            self._watch = None
        await self.store.async_save(self._store_data())

    def _store_data(self) -> dict:
        cutoff = (dt_util.now().date() - timedelta(days=400)).isoformat()
        days = {}
        for d in self.devices:
            st = self.state.get(d["id"])
            if st:
                days[d["id"]] = {k: v for k, v in st.counter.days.items() if k >= cutoff}
        return {"devices": self.devices, "days": days}

    def _save(self, delay: float = 30) -> None:
        self.store.async_delay_save(self._store_data, delay)

    def _rewatch(self) -> None:
        if self._watch:
            self._watch()
            self._watch = None
        ids = [x for d in self.devices for x in (d.get("switch"), d.get("power")) if x]
        if ids:
            self._watch = async_track_state_change_event(self.hass, ids, self._on_change)

    async def _on_change(self, event: Event) -> None:
        await self.async_evaluate()

    async def _tick(self, _now=None) -> None:
        await self.async_evaluate()
        self._save()

    # ------------------------------------------------------------- reading
    def _switch_on(self, eid: str) -> bool | None:
        st = self.hass.states.get(eid) if eid else None
        if st is None or st.state in BAD:
            return None
        if eid.startswith("climate."):
            return st.state != "off"
        return st.state == "on"

    def _watts(self, eid: str) -> float | None:
        st = self.hass.states.get(eid) if eid else None
        if st is None or st.state in BAD:
            return None
        try:
            v = float(st.state)
        except ValueError:
            return None
        unit = (st.attributes.get("unit_of_measurement") or "W").strip()
        return v * 1000 if unit == "kW" else v

    def _device(self, did: str) -> dict:
        d = next((x for x in self.devices if x["id"] == did), None)
        if d is None:
            raise ValueError("No such device")
        return d

    def hours_today(self, did: str) -> float:
        st = self.state.get(did)
        return (st.counter.days.get(dt_util.now().date().isoformat(), {}).get("seconds", 0) / 3600) if st else 0.0

    # ------------------------------------------------------------ deciding
    async def async_evaluate(self) -> None:
        now = dt_util.now()
        for d in self.devices:
            st = self.state.setdefault(d["id"], _DeviceState())
            on = self._switch_on(d["switch"])
            w = self._watts(d.get("power"))
            st.live = {"on": on, "w": w}
            want, st.reason = water.pool_desired(d["mode"], d["schedules"], now, st.grant, st.why,
                                                 self.hours_today(d["id"]), float(d["hours"]))
            hold = (d["mode"] == "solar" and st.last_switch is not None
                    and (now - st.last_switch).total_seconds() < float(d["min_switch_s"]))
            # act only when the wanted state changes, so switching it by hand is respected
            if want != st.last_desired and on is not None and not hold:
                if want != on:
                    try:
                        await self.hass.services.async_call("homeassistant", "turn_on" if want else "turn_off",
                                                            {"entity_id": d["switch"]}, blocking=False)
                    except Exception as err:  # noqa: BLE001 - one device must never stop the others
                        _LOGGER.warning("Hamlet Home: could not switch %s: %s", d["switch"], err)
                    st.live["on"] = want
                    st.last_switch = now
                st.last_desired = want
            elif hold and want != on:
                st.reason += " (waiting a few minutes to protect it)"
            running = on if w is None else (w > 20 if on is not False else False)
            st.counter.update(now, running)
        self._notify()

    # ------------------------------------------------------ solar sharing
    def solar_loads(self) -> list[dict]:
        out = []
        now = dt_util.now()
        for d in self.devices:
            if d["mode"] != "solar":
                continue
            st = self.state.setdefault(d["id"], _DeviceState())
            wants, _ = water.pool_solar_wants(d["schedules"], now, self.hours_today(d["id"]), float(d["hours"]))
            running = bool(st.live.get("on"))
            rated, measured = float(d["rated_w"]), st.live.get("w")
            out.append({"id": f"dev:{d['id']}", "name": d["name"], "kind": "device",
                        "wants": wants, "running": running,
                        "power": (measured or rated) if running else rated,
                        "draw": (measured if measured is not None else rated) if running else 0.0,
                        "start_w": float(d["solar_start_w"]), "keep_w": float(d["solar_keep_w"]), "via_full": st.via_full,
                        "stop_deficit_min": float(d.get("stop_deficit_min", 10)), "stop_discharge_min": float(d.get("stop_discharge_min", 5)),
                        "discharge_w": float(d.get("discharge_w", 200))})
        return out

    def grant_target(self, load_id: str):
        did = load_id.split(":", 1)[1]
        ctl = self

        class _Target:
            async def async_set_solar_grant(self, grant, why="", via_full=False):
                await ctl.async_set_solar_grant(did, grant, why, via_full)
        return _Target()

    async def async_set_solar_grant(self, did: str, grant: bool | None, why: str = "", via_full: bool = False) -> None:
        st = self.state.setdefault(did, _DeviceState())
        changed = grant != st.grant or why != st.why
        st.grant, st.why, st.via_full = grant, why, via_full
        if changed:
            await self.async_evaluate()

    async def async_clear_grants(self, keep: set[str]) -> None:
        for d in self.devices:
            if f"dev:{d['id']}" not in keep and self.state.get(d["id"]) and self.state[d["id"]].grant is not None:
                await self.async_set_solar_grant(d["id"], None)

    # ------------------------------------------------------------- changes
    async def async_save_device(self, did: str | None, new: dict, admin: bool) -> str:
        if did is None:
            if not admin:
                raise ValueError("Only an administrator can add devices")
            if len(self.devices) >= dv.MAX_DEVICES:
                raise ValueError(f"At most {dv.MAX_DEVICES} devices")
            clean = dv.validate({**{k: v for k, v in dv.DEFAULT_DEVICE.items() if k in ("name", "switch")}, **new}, admin=True)
            if "switch" not in clean or not clean.get("name"):
                raise ValueError("A new device needs a name and a switch")
            if any(x["switch"] == clean["switch"] for x in self.devices):
                raise ValueError("That switch already runs another device")
            did = dv.new_id(clean["name"], {x["id"] for x in self.devices})
            self.devices.append({**dv.DEFAULT_DEVICE, **clean, "id": did})
            self.state[did] = _DeviceState()
        else:
            d = self._device(did)
            clean = dv.validate(new, admin, d)
            if "switch" in clean and any(x["switch"] == clean["switch"] and x["id"] != did for x in self.devices):
                raise ValueError("That switch already runs another device")
            if {"mode", "schedules"} & set(clean):
                self.state.setdefault(did, _DeviceState()).last_desired = None   # apply now
            d.update(clean)
        self._rewatch()
        self._save(1)
        await self.async_evaluate()
        return did

    async def async_remove(self, did: str) -> None:
        self._device(did)
        self.devices = [x for x in self.devices if x["id"] != did]
        self.state.pop(did, None)
        self._rewatch()
        self._save(1)
        self._notify()

    def used_entities(self) -> set[str]:
        return {d["switch"] for d in self.devices if d.get("switch")}

    def power_sensors(self) -> list[str]:
        return [d["power"] for d in self.devices if d.get("power")]

    # ------------------------------------------------------------ snapshot
    def snapshot(self) -> list[dict]:
        t = dt_util.now().date().isoformat()
        out = []
        for d in self.devices:
            st = self.state.get(d["id"]) or _DeviceState()
            label, icon = dv.KINDS.get(d["kind"], dv.KINDS["other"])
            out.append({**d, "kind_label": label, "icon": icon, "on": st.live.get("on"), "w": st.live.get("w"),
                        "reason": st.reason, "today": st.counter.days.get(t, {}),
                        "available": st.live.get("on") is not None})
        return out

    def entity_options(self) -> dict:
        """Candidates for the admin's pickers."""
        def name(eid):
            s = self.hass.states.get(eid)
            return (s.attributes.get("friendly_name") if s else None) or eid
        switches = sorted((e for e in self.hass.states.async_entity_ids(dv.SWITCH_DOMAINS)), key=lambda e: name(e).lower())
        power = sorted((s.entity_id for s in self.hass.states.async_all("sensor")
                        if s.attributes.get("device_class") == "power" or s.attributes.get("unit_of_measurement") in ("W", "kW")),
                       key=lambda e: name(e).lower())
        return {"switches": [{"id": e, "name": name(e)} for e in switches], "power": [{"id": e, "name": name(e)} for e in power],
                "kinds": [{"id": k, "name": v[0], "icon": v[1]} for k, v in dv.KINDS.items()]}
