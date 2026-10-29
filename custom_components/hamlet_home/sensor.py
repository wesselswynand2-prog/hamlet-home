"""Today's energy and money sensors (usable on any dashboard or in the Energy dashboard)."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE, UnitOfEnergy
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_UPDATE, VERSION

ENERGY = [("solar", "mdi:solar-power-variant"), ("load", "mdi:home-lightning-bolt"), ("import", "mdi:transmission-tower-import"),
          ("export", "mdi:transmission-tower-export"), ("charge", "mdi:battery-arrow-up"), ("discharge", "mdi:battery-arrow-down")]


async def async_setup_entry(hass, entry, async_add_entities):
    c = hass.data[DOMAIN]["controller"]
    entities = [EnergyToday(c, k, icon) for k, icon in ENERGY]
    entities += [MoneyToday(c, "cost", "mdi:cash-minus"), MoneyToday(c, "saved", "mdi:cash-plus"), SelfSufficiency(c)]
    w = hass.data[DOMAIN].get("water")
    if w is not None and w.enabled:
        from .const import CONF_POOL_POWER, CONF_POOL_SWITCH, CONF_PUMP_HZ, CONF_PUMP_POWER, CONF_PUMP_SWITCH  # noqa: PLC0415
        if any(w.conf.get(k) for k in (CONF_PUMP_SWITCH, CONF_PUMP_POWER, CONF_PUMP_HZ)):
            entities += [PumpToday(c, w, "pump", "hours", "mdi:pump"), PumpToday(c, w, "pump", "starts", "mdi:counter")]
        if any(w.conf.get(k) for k in (CONF_POOL_SWITCH, CONF_POOL_POWER)):
            entities.append(PumpToday(c, w, "pool", "hours", "mdi:pool"))
    if c.conf.get("battery_soc") and c.conf.get("battery_power"):
        entities += [BatteryTime(c, "backup_h", "battery_backup", "mdi:battery-clock"),
                     BatteryTime(c, "full_h", "battery_full_in", "mdi:battery-charging-high")]
    irr = hass.data[DOMAIN].get("irrigation")
    if irr is not None and irr.zones:
        entities.append(IrrigationStatus(c, irr))
    async_add_entities(entities)


class _Base(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, controller, key: str) -> None:
        self.c = controller
        self.key = key
        self._attr_unique_id = f"{controller.entry.entry_id}_{key}_today"
        self._attr_translation_key = f"{key}_today"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, controller.entry.entry_id)}, name=controller.name,
                                            manufacturer="Hamlet Elektries", model="Hamlet Home", sw_version=VERSION)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self.async_write_ha_state))

    @property
    def available(self) -> bool:
        return self.c.ready


class EnergyToday(_Base):
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_state_class = SensorStateClass.TOTAL_INCREASING
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_suggested_display_precision = 2

    def __init__(self, controller, key, icon):
        super().__init__(controller, key)
        self._attr_icon = icon

    @property
    def native_value(self):
        return round(self.c.today().get(self.key, 0.0), 3)


class MoneyToday(_Base):
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 2

    def __init__(self, controller, key, icon):
        super().__init__(controller, key)
        self._attr_icon = icon

    @property
    def native_unit_of_measurement(self):
        return "ZAR" if self.c.tariff.get("currency", "R") == "R" else self.c.tariff.get("currency")

    @property
    def native_value(self):
        return self.c.today().get(self.key, 0.0)


class SelfSufficiency(_Base):
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:home-battery"

    def __init__(self, controller):
        super().__init__(controller, "self_sufficiency")

    @property
    def native_value(self):
        return self.c.today().get("self_sufficiency")


class PumpToday(_Base):
    _attr_state_class = SensorStateClass.TOTAL_INCREASING

    def __init__(self, controller, water, which: str, kind: str, icon: str):
        super().__init__(controller, f"{which}_{kind}")
        self.w, self.which, self.kind = water, which, kind
        self._attr_icon = icon
        if kind == "hours":
            self._attr_device_class = SensorDeviceClass.DURATION
            self._attr_native_unit_of_measurement = "h"
            self._attr_suggested_display_precision = 2

    @property
    def available(self) -> bool:
        return True

    @property
    def native_value(self):
        from homeassistant.util import dt as dt_util  # noqa: PLC0415
        counter = self.w.pump if self.which == "pump" else self.w.pool
        d = counter.days.get(dt_util.now().date().isoformat(), {})
        if self.kind == "hours":
            return round(d.get("seconds", 0) / 3600, 3)
        return int(d.get("starts", 0))


class IrrigationStatus(_Base):
    """Idle / Watering <zone>, with time left and the next program as attributes."""

    _attr_icon = "mdi:sprinkler-variant"

    def __init__(self, controller, irr):
        super().__init__(controller, "irrigation")
        self.irr = irr
        self._attr_unique_id = f"{controller.entry.entry_id}_irrigation_status"
        self._attr_translation_key = "irrigation"

    @property
    def available(self) -> bool:
        return True

    @property
    def native_value(self):
        snap = self.irr.snapshot()
        if snap["run"]:
            return f"Watering {snap['run']['name']}"
        if any(z["on"] for z in snap["zones"]):
            return "Watering (by hand)"
        return "Skipping – " + snap["skip"] if snap["skip"] else "Idle"

    @property
    def extra_state_attributes(self):
        snap = self.irr.snapshot()
        run = snap["run"] or {}
        return {"zone": run.get("name"), "remaining_seconds": run.get("remaining"), "next_program": snap["next_program"],
                "watered_today_minutes": snap["today_minutes"], "note": snap["note"]}


class BatteryTime(_Base):
    """Hours the battery would carry the house now / hours until it's full."""

    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = "h"
    _attr_suggested_display_precision = 1
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, controller, field: str, key: str, icon: str):
        super().__init__(controller, key)
        self.field = field
        self._attr_unique_id = f"{controller.entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_icon = icon

    @property
    def available(self) -> bool:
        return bool(self.c.capacity_kwh)

    @property
    def native_value(self):
        return self.c.outlook().get(self.field)

    @property
    def extra_state_attributes(self):
        o = self.c.outlook()
        return {k: o.get(k) for k in ("state", "drain_w", "charge_w", "usable_kwh", "capacity_kwh", "capacity_source", "reserve", "grid_off")}
