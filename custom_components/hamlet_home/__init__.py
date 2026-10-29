"""Hamlet Home: one app for energy, geyser and (soon) water and controls."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, PANEL_COMPONENT, PANEL_URL_PATH, STATIC_URL, VERSION
from .controller import EnergyController
from .water_controller import WaterController
from .solar_manager import SolarManager
from .irrigation_controller import IrrigationController

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SENSOR]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    for handler in (ws_state, ws_subscribe, ws_set_tariff, ws_water_action, ws_water_settings, ws_solar_settings,
                    ws_irrigation_action, ws_irrigation_settings, ws_irrigation_entities, ws_battery_settings):
        websocket_api.async_register_command(hass, handler)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    controller = EnergyController(hass, entry)
    hass.data[DOMAIN]["controller"] = controller
    water = WaterController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["water"] = water
    irrigation = IrrigationController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["irrigation"] = irrigation
    solar = SolarManager(hass, entry, controller, water)
    hass.data[DOMAIN]["solar"] = solar
    await controller.async_start()
    await irrigation.async_start()
    await water.async_start()
    await solar.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        controller: EnergyController = hass.data[DOMAIN].pop("controller")
        await controller.async_stop()
        await hass.data[DOMAIN].pop("solar").async_stop()
        await hass.data[DOMAIN].pop("water").async_stop()
        await hass.data[DOMAIN].pop("irrigation").async_stop()
        if hass.data[DOMAIN].pop("_panel", False):
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return ok


async def _async_register_panel(hass: HomeAssistant) -> None:
    data = hass.data[DOMAIN]
    if not data.get("_static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), cache_headers=False)])
        data["_static"] = True
    if data.get("_panel"):
        return
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        module_url=f"{STATIC_URL}/hamlet-home-panel.js?v={VERSION}",
        sidebar_title="Hamlet Home",
        sidebar_icon="mdi:home-lightning-bolt",
        require_admin=False,
        embed_iframe=False,
    )
    data["_panel"] = True


def _controller(hass, connection, msg) -> EnergyController | None:
    controller = hass.data.get(DOMAIN, {}).get("controller")
    if controller is None:
        connection.send_error(msg["id"], "not_found", "Hamlet Home is not set up")
    return controller


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/state"})
@websocket_api.async_response
async def ws_state(hass, connection, msg):
    if c := _controller(hass, connection, msg):
        from homeassistant.loader import IntegrationNotFound, async_get_integration  # noqa: PLC0415
        try:
            await async_get_integration(hass, "hamlet_geyser")
            geyser_available = True
        except IntegrationNotFound:
            geyser_available = False
        connection.send_result(msg["id"], {**c.snapshot(history=True), "water": hass.data[DOMAIN]["water"].snapshot(history=True),
                                           "solar_loads": hass.data[DOMAIN]["solar"].snapshot(),
                                           "irrigation": hass.data[DOMAIN]["irrigation"].snapshot(),
                                           "is_admin": connection.user.is_admin,
                                           "geyser_available": geyser_available,
                                           "geyser_count": len(hass.config_entries.async_entries("hamlet_geyser")),
                                           "geyser_installed": "hamlet_geyser" in hass.config.components})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass, connection, msg):
    c = _controller(hass, connection, msg)
    if c is None:
        return

    @callback
    def forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {**c.snapshot(), "water": hass.data[DOMAIN]["water"].snapshot(),
                                                                         "solar_loads": hass.data[DOMAIN]["solar"].snapshot(),
                                                                         "irrigation": hass.data[DOMAIN]["irrigation"].snapshot()}))

    connection.subscriptions[msg["id"]] = c.add_listener(forward)
    connection.send_result(msg["id"])
    forward()


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/set_tariff",
    vol.Required("tariff"): dict,
})
@websocket_api.async_response
async def ws_set_tariff(hass, connection, msg):
    if c := _controller(hass, connection, msg):
        try:
            await c.async_set_tariff(msg["tariff"])
        except (ValueError, TypeError) as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], c.snapshot(history=True))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/water_action",
    vol.Required("action"): vol.In(["pump", "reset", "pool_mode"]),
    vol.Optional("value"): vol.Any(bool, str),
})
@websocket_api.async_response
async def ws_water_action(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    w: WaterController = hass.data[DOMAIN]["water"]
    try:
        await w.async_action(msg["action"], msg.get("value"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], w.snapshot(history=True))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/water_settings",
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def ws_water_settings(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    w: WaterController = hass.data[DOMAIN]["water"]
    try:
        await w.async_save_settings(msg["settings"], connection.user.is_admin)
    except (ValueError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], w.snapshot(history=True))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/solar_settings",
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def ws_solar_settings(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    solar: SolarManager = hass.data[DOMAIN]["solar"]
    new = msg["settings"]
    if not connection.user.is_admin and set(new) - {"order", "enabled"}:
        connection.send_error(msg["id"], "unauthorized", "Only an administrator can change the battery settings")
        return
    try:
        await solar.async_save_settings(new)
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], solar.snapshot())


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/irrigation_action",
    vol.Required("action"): vol.In(["run_all", "run_zone", "run_program", "stop", "skip_zone", "rain_delay"]),
    vol.Optional("zone"): str,
    vol.Optional("program"): str,
    vol.Optional("minutes"): vol.Coerce(float),
    vol.Optional("hours"): vol.Coerce(float),
})
@websocket_api.async_response
async def ws_irrigation_action(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    irr: IrrigationController = hass.data[DOMAIN]["irrigation"]
    try:
        await irr.async_action(msg["action"], msg)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], irr.snapshot())


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/irrigation_settings",
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def ws_irrigation_settings(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    irr: IrrigationController = hass.data[DOMAIN]["irrigation"]
    try:
        await irr.async_save_settings(msg["settings"], connection.user.is_admin)
    except (ValueError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], irr.snapshot())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/irrigation_entities"})
@websocket_api.require_admin
@callback
def ws_irrigation_entities(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    connection.send_result(msg["id"], hass.data[DOMAIN]["irrigation"].entity_options())


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/battery_settings",
    vol.Required("settings"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_battery_settings(hass, connection, msg):
    if c := _controller(hass, connection, msg):
        try:
            await c.async_set_battery(msg["settings"])
        except (ValueError, TypeError) as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], c.snapshot(history=True))
