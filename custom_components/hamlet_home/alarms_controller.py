"""Runs the client's alarms: checks every 15 s, pops up in the app, posts a Home Assistant notification
and (optionally) pushes to phones through notify services. Acknowledging silences the pop-up until it clears."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Callable

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import alarms as al
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
TICK = timedelta(seconds=15)
DEFAULT_TYPES = ("battery_current", "battery_power", "load_high", "soc_low", "grid_down", "geyser_cold", "pump_trip", "inverter_fault")


class AlarmsController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, notify: Callable[[], None]) -> None:
        self.hass, self.entry, self._notify = hass, entry, notify
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.alarms")
        self.rules: list[dict] = []
        self.targets: list[str] = []          # notify services, e.g. "mobile_app_wynand"
        self.history: list[dict] = []
        self.state: dict[str, dict] = {}      # rule id -> {since, active, acked, text, at}
        self._unsub: CALLBACK_TYPE | None = None

    # ------------------------------------------------------------ lifecycle
    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        if "rules" in data:
            self.rules = [r for r in data["rules"] if r.get("type") in al.PRESETS]
        else:   # first time: the usual alarms, switched off – the client switches on what they want
            self.rules = []
            for t in DEFAULT_TYPES:
                r = al.new_rule(t)
                r["enabled"] = False
                self.rules.append(r)
        self.targets = list(data.get("targets", []))
        self.history = list(data.get("history", []))[-50:]
        self._unsub = async_track_time_interval(self.hass, self._tick, TICK)

    async def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        await self.store.async_save(self._data())

    def _data(self) -> dict:
        return {"rules": self.rules, "targets": self.targets, "history": self.history[-50:]}

    def _save(self) -> None:
        self.store.async_delay_save(self._data, 2)

    # ------------------------------------------------------------- reading
    def _num_state(self, eid: str | None) -> float | None:
        st = self.hass.states.get(eid) if eid else None
        if st is None:
            return None
        try:
            return float(st.state)
        except ValueError:
            return None

    def context(self) -> dict:
        d = self.hass.data.get(DOMAIN, {})
        ctl, water = d.get("controller"), d.get("water")
        live = getattr(ctl, "live", {}) or {}
        conf = getattr(ctl, "conf", {}) or {}
        geys = []
        if ctl is not None:
            for g in ctl.geyser_info():
                geys.append({"entry_id": g["entry_id"], "name": g["name"], "temp": self._num_state(g.get("temp"))})
        inv = self.hass.states.get(conf.get("inverter_state")) if conf.get("inverter_state") else None
        ids = {r.get("entity") for r in self.rules if r["type"] == "sensor" and r.get("entity")}
        states = {}
        for eid in ids:
            st = self.hass.states.get(eid)
            if st is not None:
                states[eid] = (st.state, st.attributes.get("unit_of_measurement") or "")
        now = dt_util.now()
        has_pump = water is not None and any(water.conf.get(k) for k in ("pump_switch", "pump_power", "pump_hz", "water_pressure")) if hasattr(water, "conf") else False
        return {
            "battery_current": self._num_state(conf.get("battery_current")),
            "battery": live.get("battery"), "load": live.get("load"), "soc": live.get("soc"),
            "grid_available": live.get("grid_available"),
            "geysers": geys,
            "pump_tripped": bool(water.guard.tripped) if has_pump and hasattr(water, "guard") else None,
            "inverter_state": inv.state if inv is not None and inv.state not in ("unavailable", "unknown") else None,
            "minutes_now": now.hour * 60 + now.minute,
            "states": states,
        }

    def available(self, ctx: dict) -> dict[str, bool]:
        return {
            "battery_current": ctx["battery_current"] is not None, "battery_power": ctx["battery"] is not None,
            "load_high": ctx["load"] is not None, "soc_low": ctx["soc"] is not None,
            "grid_down": ctx["grid_available"] is not None, "geyser_cold": any(g["temp"] is not None for g in ctx["geysers"]),
            "pump_trip": ctx["pump_tripped"] is not None, "inverter_fault": ctx["inverter_state"] is not None, "sensor": True,
        }

    # ------------------------------------------------------------ checking
    async def _tick(self, _now=None) -> None:
        await self.async_evaluate()

    async def async_evaluate(self) -> None:
        ctx = self.context()
        now = dt_util.now()
        changed = False
        for r in self.rules:
            st = self.state.setdefault(r["id"], {"since": None, "active": False, "acked": False, "text": "", "at": None})
            if not r["enabled"]:
                if st["active"]:
                    await self._clear(r, st, now)
                    changed = True
                st["since"] = None
                continue
            try:
                hit, text = al.check(r, ctx)
            except Exception as err:  # noqa: BLE001 - one bad rule must never stop the others
                _LOGGER.debug("alarm %s: %s", r["name"], err)
                hit, text = None, ""
            if hit:
                st["since"] = st["since"] or now
                st["text"] = text
                if not st["active"] and (now - st["since"]).total_seconds() >= r["minutes"] * 60:
                    st.update(active=True, acked=False, at=now)
                    await self._fire(r, st)
                    changed = True
            else:
                st["since"] = None
                if st["active"] and hit is False:
                    await self._clear(r, st, now)
                    changed = True
        if changed:
            self._save()
            self._notify()

    async def _fire(self, r: dict, st: dict) -> None:
        level = al.PRESETS[r["type"]]["level"]
        title = f"⚠️ {r['name']}" if level == "critical" else r["name"]
        msg = st["text"] or r["name"]
        self.history.append({"id": r["id"], "name": r["name"], "text": msg, "level": level, "at": st["at"].isoformat(), "cleared": None})
        self.history = self.history[-50:]
        persistent_notification.async_create(self.hass, msg, title=f"Hamlet Home: {title}", notification_id=f"hamlet_alarm_{r['id']}")
        await self._push(title, msg, level)

    async def _clear(self, r: dict, st: dict, now) -> None:
        st.update(active=False, acked=False)
        for h in reversed(self.history):
            if h["id"] == r["id"] and not h.get("cleared"):
                h["cleared"] = now.isoformat()
                break
        persistent_notification.async_dismiss(self.hass, f"hamlet_alarm_{r['id']}")

    async def _push(self, title: str, msg: str, level: str) -> None:
        for svc in self.targets:
            data: dict[str, Any] = {"title": title, "message": msg}
            if level == "critical":   # louder on phones (iOS critical / Android high priority)
                data["data"] = {"push": {"sound": {"name": "default", "critical": 1, "volume": 1.0}}, "ttl": 0, "priority": "high"}
            try:
                await self.hass.services.async_call("notify", svc, data, blocking=False)
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Hamlet Home alarm: could not notify %s: %s", svc, err)

    # ------------------------------------------------------------- changes
    async def async_save(self, rules: list, targets: list | None) -> None:
        self.rules = al.validate_rules(rules)
        if targets is not None:
            ok = set(self.notify_options())
            self.targets = [t for t in targets if t in ok]
        keep = {r["id"] for r in self.rules}
        for rid in [k for k in self.state if k not in keep]:
            persistent_notification.async_dismiss(self.hass, f"hamlet_alarm_{rid}")
            self.state.pop(rid)
        self._save()
        await self.async_evaluate()
        self._notify()

    def acknowledge(self, rid: str | None) -> None:
        for k, st in self.state.items():
            if st["active"] and (rid is None or k == rid):
                st["acked"] = True
        self._notify()

    async def async_test(self) -> None:
        await self._push("Hamlet Home test alarm", "This is how alarms will reach this phone.", "warning")

    def notify_options(self) -> list[str]:
        svcs = self.hass.services.async_services().get("notify", {})
        return sorted(s for s in svcs if s not in ("persistent_notification", "send_message", "notify"))

    # ------------------------------------------------------------ snapshot
    def snapshot(self, full: bool = False) -> dict:
        active = []
        for r in self.rules:
            st = self.state.get(r["id"])
            if st and st["active"]:
                active.append({"id": r["id"], "name": r["name"], "text": st["text"], "level": al.PRESETS[r["type"]]["level"],
                               "since": st["at"].isoformat() if st["at"] else None, "acked": st["acked"]})
        out: dict[str, Any] = {"active": active}
        if full:
            ctx = self.context()
            out.update(rules=self.rules, targets=self.targets, history=list(reversed(self.history))[:20],
                       presets={k: {kk: vv for kk, vv in v.items()} for k, v in al.PRESETS.items()},
                       available=self.available(ctx), notify_options=self.notify_options(),
                       geysers=[{"entry_id": g["entry_id"], "name": g["name"]} for g in ctx["geysers"]])
        return out
