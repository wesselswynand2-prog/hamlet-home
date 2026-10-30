"""Controls tab: reads Home Assistant's areas / devices / entities and keeps the installer's choices."""
from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store

from . import controls
from .const import CONF_POOL_SWITCH, CONF_PUMP_SWITCH, DOMAIN

OWN_PLATFORMS = {"hamlet_home", "hamlet_geyser"}


class ControlsManager:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, water, irrigation) -> None:
        self.hass = hass
        self.entry = entry
        self.water = water
        self.irrigation = irrigation
        self.store: Store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.controls")
        self.settings: dict[str, Any] = dict(controls.DEFAULT_SETTINGS)

    async def async_start(self) -> None:
        data = await self.store.async_load() or {}
        self.settings = {**controls.DEFAULT_SETTINGS, **data}

    # ------------------------------------------------------------ entities
    def _used_elsewhere(self) -> set[str]:
        """Switches the Water / Geyser tabs already run (they'd fight the automation if switched here)."""
        used: set[str] = set()
        conf = getattr(self.water, "conf", {}) or {}
        used |= {conf.get(CONF_PUMP_SWITCH), conf.get(CONF_POOL_SWITCH)}
        settings = getattr(self.irrigation, "settings", {}) or {}
        used |= {z.get("entity") for z in settings.get("zones", [])}
        used.add(settings.get("pump_entity"))
        for g in self.hass.config_entries.async_entries("hamlet_geyser"):
            c = {**g.data, **g.options}
            used |= {c.get("geyser_switch"), c.get("pump_entity")}
        used.discard(None)
        used.discard("")
        return used

    def _entities(self) -> list[dict]:
        ent_reg = er.async_get(self.hass)
        dev_reg = dr.async_get(self.hass)
        used = self._used_elsewhere()
        power_by_device: dict[str, str] = {}
        for e in ent_reg.entities.values():
            if (e.domain == "sensor" and e.device_id and not e.disabled_by
                    and (e.device_class or e.original_device_class) == "power" and e.device_id not in power_by_device):
                power_by_device[e.device_id] = e.entity_id
        out = []
        for state in self.hass.states.async_all(controls.DOMAINS):
            eid = state.entity_id
            if eid in used:
                continue
            entry = ent_reg.async_get(eid)
            area_id = device_id = device_class = None
            if entry is not None:
                if entry.disabled_by or entry.hidden_by or entry.entity_category or entry.platform in OWN_PLATFORMS:
                    continue
                device_id = entry.device_id
                device_class = entry.device_class or entry.original_device_class
                area_id = entry.area_id
                if area_id is None and device_id and (dev := dev_reg.async_get(device_id)):
                    area_id = dev.area_id
            out.append({"entity_id": eid, "name": state.name or eid, "area_id": area_id, "device_class": device_class,
                        "attrs": {"device_class": state.attributes.get("device_class")},
                        "power_entity": power_by_device.get(device_id) if device_id and state.domain == "switch" else None})
        return out

    def _areas(self) -> dict[str, dict]:
        return {a.id: {"name": a.name, "icon": a.icon} for a in ar.async_get(self.hass).async_list_areas()}

    def layout(self, admin: bool = False) -> dict:
        return controls.build(self._entities(), self._areas(), self.settings, admin=admin)

    # ------------------------------------------------------------ actions
    async def async_save_settings(self, new: dict) -> None:
        known = {e["entity_id"] for e in self._entities()}
        clean = controls.validate(new, known)
        self.settings.update(clean)
        await self.store.async_save(self.settings)

    async def async_pulse(self, entity_id: str) -> None:
        """Gate / garage motor on a relay: on, wait, off (works even if the relay has no auto-off)."""
        lay = self.layout()
        item = next((g for g in lay["gates"] if g["entity_id"] == entity_id), None)
        if item is None:
            raise ValueError("That gate isn't on the Controls page")
        domain = entity_id.split(".", 1)[0]
        if domain == "button":
            await self.hass.services.async_call("button", "press", {"entity_id": entity_id}, blocking=True)
        elif domain in ("switch", "input_boolean"):
            await self.hass.services.async_call(domain, "turn_on", {"entity_id": entity_id}, blocking=True)
            await asyncio.sleep(float(self.settings.get("pulse_seconds", 1.0)))
            await self.hass.services.async_call(domain, "turn_off", {"entity_id": entity_id}, blocking=True)
        elif domain == "cover":
            await self.hass.services.async_call("cover", "toggle", {"entity_id": entity_id}, blocking=True)
        else:
            raise ValueError("Not a gate")
