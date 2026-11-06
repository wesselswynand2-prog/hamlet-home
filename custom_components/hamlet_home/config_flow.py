"""Setup wizard. Pre-fills from an existing Hamlet Geyser install when there is one."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from .const import (
    CONF_PV_REMAINING, CONF_PV_TODAY, CONF_PV_TOMORROW, CONF_WEATHER, CONF_WEATHER_EXTRAS, WEATHER_KEYS, CONF_WIND_SPEED, CONF_WIND_GUST, CONF_WIND_DIR,
    CONF_BATTERY_INVERT,
    CONF_BATTERY_POWER,
    CONF_BATTERY_SOC,
    CONF_EXTRA_LOADS,
    CONF_GRID_INVERT,
    CONF_GRID_POWER,
    CONF_GRID_STATUS,
    CONF_LOAD_POWER,
    CONF_NAME,
    CONF_PRESET,
    CONF_SOLAR_AC,
    CONF_SOLAR_DC,
    CONF_SOLAR_POWER,
    DOMAIN,
    PRESET_INVERT,
    PRESETS,
    WATER_KEYS,
    CONF_WATER_PRESSURE, CONF_WATER_SETPOINT, CONF_PUMP_SWITCH, CONF_PUMP_POWER, CONF_PUMP_HZ,
    CONF_PUMP_AMPS, CONF_PUMP_SPEED, CONF_POOL_SWITCH, CONF_POOL_POWER, CONF_TANK_LEVEL, CONF_POOL_TEMP,
)

SHARED_KEYS = (CONF_PRESET, CONF_SOLAR_POWER, CONF_LOAD_POWER, CONF_GRID_POWER, CONF_GRID_STATUS,
               CONF_BATTERY_POWER, CONF_BATTERY_SOC, CONF_BATTERY_INVERT, CONF_GRID_INVERT)
OPTIONAL_KEYS = (CONF_SOLAR_POWER, CONF_SOLAR_AC, CONF_SOLAR_DC, CONF_LOAD_POWER, CONF_GRID_POWER, CONF_GRID_STATUS, CONF_BATTERY_POWER, CONF_BATTERY_SOC, CONF_EXTRA_LOADS)


def _sensor(multiple: bool = False) -> selector.EntitySelector:
    return selector.EntitySelector(selector.EntitySelectorConfig(domain=["sensor", "input_number"], multiple=multiple))


def _energy_schema() -> vol.Schema:
    return vol.Schema({
        vol.Required(CONF_NAME, default="Home"): str,
        vol.Required(CONF_PRESET, default="victron"): selector.SelectSelector(
            selector.SelectSelectorConfig(options=PRESETS, translation_key="preset", mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Optional(CONF_SOLAR_POWER): _sensor(multiple=True),
        vol.Optional(CONF_SOLAR_AC): _sensor(multiple=True),
        vol.Optional(CONF_SOLAR_DC): _sensor(multiple=True),
        vol.Optional(CONF_LOAD_POWER): _sensor(multiple=True),
        vol.Optional(CONF_GRID_POWER): _sensor(multiple=True),
        vol.Optional(CONF_GRID_STATUS): selector.EntitySelector(
            selector.EntitySelectorConfig(domain=["binary_sensor", "sensor", "switch", "input_boolean"])),
        vol.Optional(CONF_BATTERY_POWER): _sensor(),
        vol.Optional(CONF_BATTERY_SOC): _sensor(),
    })


def _solar_errors(data: dict) -> dict:
    if not (data.get(CONF_SOLAR_POWER) or data.get(CONF_SOLAR_AC) or data.get(CONF_SOLAR_DC)):
        return {"base": "solar_required"}
    return {}


def _extras_schema() -> vol.Schema:
    from .const import CONF_FLOW_INFO, CONF_FLOW_INFO_EDIT  # noqa: PLC0415
    return vol.Schema({
        vol.Optional(CONF_EXTRA_LOADS): _sensor(multiple=True),
        vol.Optional("load_essential"): _sensor(multiple=True),
        vol.Optional("load_nonessential"): _sensor(multiple=True),
        vol.Optional("extra_loads_nonessential"): _sensor(multiple=True),
        vol.Optional(CONF_FLOW_INFO): selector.EntitySelector(selector.EntitySelectorConfig(domain=["sensor", "number", "input_number"], multiple=True)),
        vol.Optional(CONF_FLOW_INFO_EDIT, default=False): selector.BooleanSelector(),
        vol.Required(CONF_BATTERY_INVERT, default=False): selector.BooleanSelector(),
        vol.Required(CONF_GRID_INVERT, default=False): selector.BooleanSelector(),
    })


def _water_schema() -> vol.Schema:
    sw = selector.EntitySelector(selector.EntitySelectorConfig(domain=["switch", "input_boolean", "light", "fan"]))
    sens = _sensor()
    return vol.Schema({
        vol.Optional(CONF_WATER_PRESSURE): sens,
        vol.Optional(CONF_WATER_SETPOINT): selector.EntitySelector(selector.EntitySelectorConfig(domain=["sensor", "number", "input_number"])),
        vol.Optional(CONF_PUMP_SWITCH): sw,
        vol.Optional(CONF_PUMP_POWER): sens,
        vol.Optional(CONF_PUMP_HZ): sens,
        vol.Optional(CONF_PUMP_AMPS): sens,
        vol.Optional(CONF_PUMP_SPEED): sens,
        vol.Optional(CONF_POOL_SWITCH): sw,
        vol.Optional(CONF_POOL_POWER): sens,
        vol.Optional(CONF_TANK_LEVEL): sens,
        vol.Optional(CONF_POOL_TEMP): sens,
    })


def geyser_defaults(hass: HomeAssistant) -> dict:
    """Energy mapping from the first Hamlet Geyser entry, if installed."""
    for entry in hass.config_entries.async_entries("hamlet_geyser"):
        merged = {**entry.data, **entry.options}
        return {k: merged[k] for k in SHARED_KEYS if merged.get(k) not in (None, "", [])}
    return {}


def _weather_schema() -> vol.Schema:
    return vol.Schema({
        vol.Optional(CONF_WEATHER): selector.EntitySelector(selector.EntitySelectorConfig(domain="weather")),
        vol.Optional(CONF_PV_TODAY): _sensor(),
        vol.Optional(CONF_PV_TOMORROW): _sensor(),
        vol.Optional(CONF_PV_REMAINING): _sensor(),
        vol.Optional(CONF_WEATHER_EXTRAS): _sensor(multiple=True),
        vol.Optional(CONF_WIND_SPEED): _sensor(),
        vol.Optional(CONF_WIND_GUST): _sensor(),
        vol.Optional(CONF_WIND_DIR): _sensor(),
    })


class HamletHomeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        errors = _solar_errors(user_input) if user_input is not None else {}
        if user_input is not None and not errors:
            self._data.update(user_input)
            return await self.async_step_extras()
        defaults = user_input or geyser_defaults(self.hass)
        schema = self.add_suggested_values_to_schema(_energy_schema(), defaults)
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors,
                                    description_placeholders={"prefill": "Filled in from your Hamlet Geyser setup – check and continue." if defaults else ""})

    async def async_step_extras(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update(user_input)
            return self.async_create_entry(title=self._data[CONF_NAME], data=self._data)
        defaults = {**PRESET_INVERT.get(self._data.get(CONF_PRESET), {}), **{k: v for k, v in geyser_defaults(self.hass).items() if k in (CONF_BATTERY_INVERT, CONF_GRID_INVERT)}}
        return self.async_show_form(step_id="extras", data_schema=self.add_suggested_values_to_schema(_extras_schema(), defaults))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HamletHomeOptionsFlow()


class HamletHomeOptionsFlow(OptionsFlow):
    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    @property
    def _current(self) -> dict:
        return {**self.config_entry.data, **self.config_entry.options}

    async def async_step_init(self, user_input: dict | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["energy", "water", "weather", "costs", "details", "app"])

    async def async_step_energy(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None and _solar_errors(user_input):
            return self.async_show_form(step_id="energy", data_schema=self.add_suggested_values_to_schema(_energy_schema(), user_input), errors=_solar_errors(user_input))
        if user_input is not None:
            self._data.update({k: None for k in OPTIONAL_KEYS})
            self._data.update(user_input)
            return await self.async_step_extras()
        return self.async_show_form(step_id="energy", data_schema=self.add_suggested_values_to_schema(_energy_schema(), self._current))

    async def async_step_water(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update({k: None for k in WATER_KEYS})
            self._data.update(user_input)
            return self._save()
        return self.async_show_form(step_id="water", data_schema=self.add_suggested_values_to_schema(_water_schema(), self._current))

    async def async_step_weather(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update({k: None for k in WEATHER_KEYS})
            self._data.update(user_input)
            return self._save()
        from .weather import autodetect  # noqa: PLC0415
        found = {k: v for k, v in autodetect(self.hass.states.async_entity_ids()).items() if v}
        current = {k: v for k, v in self._current.items() if k in WEATHER_KEYS and v}
        return self.async_show_form(step_id="weather", data_schema=self.add_suggested_values_to_schema(_weather_schema(), {**found, **current}))

    async def async_step_costs(self, user_input: dict | None = None) -> ConfigFlowResult:
        from .const import CONF_COST_LOADS, MAX_COST_LOADS  # noqa: PLC0415
        if user_input is not None:
            if len(user_input.get(CONF_COST_LOADS) or []) > MAX_COST_LOADS:
                return self.async_show_form(step_id="costs", data_schema=self.add_suggested_values_to_schema(
                    vol.Schema({vol.Optional(CONF_COST_LOADS): _sensor(multiple=True)}), user_input), errors={"base": "too_many_loads"})
            self._data[CONF_COST_LOADS] = user_input.get(CONF_COST_LOADS) or []
            return self._save()
        current = self.hass.data.get(DOMAIN, {}).get("controller")
        suggested = {CONF_COST_LOADS: self._current.get(CONF_COST_LOADS) or (current.cost_loads if current else [])}
        return self.async_show_form(step_id="costs", data_schema=self.add_suggested_values_to_schema(
            vol.Schema({vol.Optional(CONF_COST_LOADS): _sensor(multiple=True)}), suggested))

    async def async_step_details(self, user_input: dict | None = None) -> ConfigFlowResult:
        """Extra readings for the Victron-style Blocks power flow (all optional)."""
        from .const import FLOW_DETAIL_KEYS  # noqa: PLC0415
        any_sensor = selector.EntitySelector(selector.EntitySelectorConfig(domain=["sensor", "input_number", "input_select"]))
        mode_sel = selector.EntitySelector(selector.EntitySelectorConfig(domain=["select", "input_select"]))
        schema = vol.Schema({vol.Optional(k): (mode_sel if k == "inverter_mode" else any_sensor) for k in FLOW_DETAIL_KEYS})
        if user_input is not None:
            self._data.update({k: None for k in FLOW_DETAIL_KEYS})
            self._data.update(user_input)
            return self._save()
        return self.async_show_form(step_id="details", data_schema=self.add_suggested_values_to_schema(schema, self._current))

    async def async_step_app(self, user_input: dict | None = None) -> ConfigFlowResult:
        """Name and icon in the sidebar and at the top of the page (e.g. the client's name)."""
        from .const import CONF_APP_ICON, CONF_APP_TITLE, DEFAULT_APP_ICON, DEFAULT_APP_TITLE  # noqa: PLC0415
        schema = vol.Schema({
            vol.Optional(CONF_APP_TITLE): selector.TextSelector(),
            vol.Optional(CONF_APP_ICON): selector.IconSelector(),
        })
        if user_input is not None:
            self._data[CONF_APP_TITLE] = (user_input.get(CONF_APP_TITLE) or "").strip()[:40] or DEFAULT_APP_TITLE
            self._data[CONF_APP_ICON] = user_input.get(CONF_APP_ICON) or DEFAULT_APP_ICON
            return self._save()
        current = {CONF_APP_TITLE: self._current.get(CONF_APP_TITLE) or DEFAULT_APP_TITLE,
                   CONF_APP_ICON: self._current.get(CONF_APP_ICON) or DEFAULT_APP_ICON}
        return self.async_show_form(step_id="app", data_schema=self.add_suggested_values_to_schema(schema, current))

    def _save(self) -> ConfigFlowResult:
        return self.async_create_entry(title="", data={**self.config_entry.options, **self._data})

    async def async_step_extras(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update({k: None for k in (CONF_EXTRA_LOADS, "load_essential", "load_nonessential", "extra_loads_nonessential", "flow_info")})
            self._data.update(user_input)
            return self._save()
        return self.async_show_form(step_id="extras", data_schema=self.add_suggested_values_to_schema(_extras_schema(), self._current))
