"""Share spare solar between the pool pump and geysers by priority."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from . import solar_loads
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
RUN_SECONDS = 15


class SolarManager:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, energy, water) -> None:
        self.hass, self.entry, self.energy, self.water = hass, entry, energy, water
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.solar")
        self.settings: dict = dict(solar_loads.DEFAULT_SOLAR_SETTINGS)
        self.status: list[dict] = []
        self.spare_w: float | None = None
        self._unsub: CALLBACK_TYPE | None = None
        self._running = False

    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.settings = {**solar_loads.DEFAULT_SOLAR_SETTINGS, **data.get("settings", {})}
        self._unsub = async_track_time_interval(self.hass, self._tick, timedelta(seconds=RUN_SECONDS))

    async def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        for g in self._geysers():
            await g.async_set_solar_grant(None)
        await self.store.async_save({"settings": self.settings})

    def _geysers(self) -> list:
        data = self.hass.data.get("hamlet_geyser", {})
        return [c for c in data.values() if hasattr(c, "solar_load") and hasattr(c, "async_set_solar_grant")]

    async def _tick(self, _now=None) -> None:
        await self.async_run()

    async def async_run(self) -> None:
        if self._running:
            return
        self._running = True
        try:
            await self._run()
        except Exception:  # noqa: BLE001 - never break the house over a sharing hiccup
            _LOGGER.exception("Hamlet Home: solar sharing failed")
        finally:
            self._running = False

    async def _run(self) -> None:
        targets: dict[str, Any] = {}
        loads: dict[str, dict] = {}
        pool = self.water.solar_load()
        if pool:
            loads["pool"], targets["pool"] = pool, self.water
        elif self.water.pool_solar_grant is not None:
            await self.water.async_set_solar_grant(None)
        for g in self._geysers():
            info = g.solar_load()
            if info:
                loads[info["id"]], targets[info["id"]] = info, g

        live = self.energy.live or {}
        solar, load = live.get("solar"), live.get("load")
        dispatchable_draw = sum(l["draw"] for l in loads.values() if l["running"])
        self.spare_w = None if solar is None or load is None else solar - (load - dispatchable_draw)
        s = self.settings
        order = solar_loads.ordered(loads, s["order"])

        if s["enabled"]:
            result = solar_loads.allocate(order, self.spare_w, live.get("soc"), live.get("battery"), s)
        else:
            # every load on its own: each sees all the spare solar
            result = {l["id"]: solar_loads.allocate([l], self.spare_w, live.get("soc"), live.get("battery"), s)[l["id"]] for l in order}

        status = []
        for rank, l in enumerate(order, 1):
            r = result[l["id"]]
            target = targets[l["id"]]
            why = r["why"] + (f" · priority {rank}" if s["enabled"] and len(order) > 1 and r["grant"] else "")
            if l["kind"] == "geyser" and not s["enabled"]:
                await target.async_set_solar_grant(None)   # geyser uses its own solar rules
            else:
                await target.async_set_solar_grant(r["grant"], why, r["via_full"])
            status.append({"id": l["id"], "name": l["name"], "kind": l["kind"], "wants": l["wants"], "running": l["running"],
                           "grant": r["grant"], "why": r["why"], "power": round(l["power"])})
        self.status = status

    # ------------------------------------------------------------- settings
    async def async_save_settings(self, new: dict) -> None:
        clean: dict = {}
        if "enabled" in new:
            clean["enabled"] = bool(new["enabled"])
        if "order" in new:
            clean["order"] = [str(x) for x in new["order"]][:20]
        for key in ("soc_full_on", "soc_full_off"):
            if key in new:
                v = float(new[key])
                if not 0 <= v <= 100:
                    raise ValueError(f"{key} must be 0–100 %")
                clean[key] = v
        if "max_battery_discharge_w" in new:
            v = float(new["max_battery_discharge_w"])
            if not 0 <= v <= 20000:
                raise ValueError("max_battery_discharge_w out of range")
            clean["max_battery_discharge_w"] = v
        self.settings.update(clean)
        await self.store.async_save({"settings": self.settings})
        await self.async_run()

    def known_loads(self) -> list[dict]:
        """Every load that could take part (even when not in Solar mode right now), in saved order."""
        loads: dict[str, dict] = {}
        if self.water.conf.get("pool_switch"):
            loads["pool"] = {"id": "pool", "name": "Pool pump", "kind": "pool",
                             "active": self.water.settings.get("pool_mode") == "solar"}
        for g in self._geysers():
            gid = f"geyser:{g.entry.entry_id}"
            loads[gid] = {"id": gid, "name": g.name, "kind": "geyser", "active": bool(g.settings.get("solar_enabled", True))}
        return solar_loads.ordered(loads, self.settings["order"])

    def snapshot(self) -> dict:
        by_id = {x["id"]: x for x in self.status}
        return {
            "settings": self.settings,
            "spare_w": None if self.spare_w is None else round(self.spare_w),
            "loads": [{**l, **by_id.get(l["id"], {})} for l in self.known_loads()],
        }
