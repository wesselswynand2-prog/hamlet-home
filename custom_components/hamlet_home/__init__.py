"""Hamlet Home: one app for energy, water, geyser and controls."""
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
from .controls_manager import ControlsManager
from .devices_controller import DevicesController
from .alarms_controller import AlarmsController

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SENSOR, Platform.UPDATE]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    for handler in (ws_state, ws_subscribe, ws_set_tariff, ws_water_action, ws_water_settings, ws_solar_settings,
                    ws_irrigation_action, ws_irrigation_settings, ws_irrigation_entities, ws_battery_settings,
                    ws_controls, ws_controls_settings, ws_controls_pulse, ws_weather, ws_weather_settings,
                    ws_costs, ws_costs_settings,
                    ws_devices_save, ws_devices_remove, ws_devices_entities, ws_update_check, ws_help_contact,
                    ws_alarms, ws_alarms_save, ws_alarms_ack, ws_alarms_test):
        websocket_api.async_register_command(hass, handler)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    controller = EnergyController(hass, entry)
    hass.data[DOMAIN]["controller"] = controller
    water = WaterController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["water"] = water
    irrigation = IrrigationController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["irrigation"] = irrigation
    devices = DevicesController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["devices"] = devices
    solar = SolarManager(hass, entry, controller, water, devices)
    hass.data[DOMAIN]["solar"] = solar
    ctrl = ControlsManager(hass, entry, water, irrigation)
    hass.data[DOMAIN]["controls"] = ctrl
    alarms = AlarmsController(hass, entry, notify=controller._notify)
    hass.data[DOMAIN]["alarms"] = alarms
    await controller.async_start()
    await irrigation.async_start()
    await water.async_start()
    await devices.async_start()
    await solar.async_start()
    await ctrl.async_start()
    await alarms.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_register_panel(hass, entry)
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
        await hass.data[DOMAIN].pop("devices").async_stop()
        if (al := hass.data[DOMAIN].pop("alarms", None)) is not None:
            await al.async_stop()
        hass.data[DOMAIN].pop("updates", None)
        hass.data[DOMAIN].pop("controls", None)
        if hass.data[DOMAIN].pop("_panel", False):
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return ok


async def _async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    from .const import CONF_APP_ICON, CONF_APP_TITLE, DEFAULT_APP_ICON, DEFAULT_APP_TITLE  # noqa: PLC0415
    conf = {**entry.data, **entry.options}
    title = (conf.get(CONF_APP_TITLE) or "").strip() or DEFAULT_APP_TITLE
    icon = (conf.get(CONF_APP_ICON) or "").strip() or DEFAULT_APP_ICON
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
        sidebar_title=title,
        sidebar_icon=icon,
        require_admin=False,
        embed_iframe=False,
        config={"title": title},
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
        geyser_version = None
        try:
            geyser_version = str((await async_get_integration(hass, "hamlet_geyser")).version or "")
            geyser_available = True
        except IntegrationNotFound:
            geyser_available = False
        connection.send_result(msg["id"], {**c.snapshot(history=True), "water": hass.data[DOMAIN]["water"].snapshot(history=True),
                                           "solar_loads": hass.data[DOMAIN]["solar"].snapshot(),
                                           "irrigation": hass.data[DOMAIN]["irrigation"].snapshot(),
                                           "devices": hass.data[DOMAIN]["devices"].snapshot(),
                                           "alarms": hass.data[DOMAIN]["alarms"].snapshot(),
                                           "is_admin": connection.user.is_admin,
                                           "geyser_available": geyser_available,
                                           "geyser_version": geyser_version,
                                           "geyser_count": len(hass.config_entries.async_entries("hamlet_geyser")),
                                           "geyser_installed": "hamlet_geyser" in hass.config.components,
                                           "help_contact": c.help_contact,
                                           "updates": [u.status() for u in hass.data[DOMAIN].get("updates", [])] if connection.user.is_admin else [],
                                           "weather_available": bool(_weather_conf(hass, c)["weather_entity"] or _weather_conf(hass, c)["pv_forecast_today"])})


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
                                                                         "irrigation": hass.data[DOMAIN]["irrigation"].snapshot(),
                                                                         "devices": hass.data[DOMAIN]["devices"].snapshot(),
                                                                         "alarms": hass.data[DOMAIN]["alarms"].snapshot()}))

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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/controls"})
@callback
def ws_controls(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    lay = hass.data[DOMAIN]["controls"].layout(admin=connection.user.is_admin)
    connection.send_result(msg["id"], {**lay, "is_admin": connection.user.is_admin,
                                       "grid_available": c.live.get("grid_available")})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/controls_settings",
    vol.Required("settings"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_controls_settings(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    ctrl: ControlsManager = hass.data[DOMAIN]["controls"]
    try:
        await ctrl.async_save_settings(msg["settings"])
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {**ctrl.layout(admin=True), "is_admin": True, "grid_available": c.live.get("grid_available")})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/controls_pulse",
    vol.Required("entity_id"): str,
})
@websocket_api.async_response
async def ws_controls_pulse(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    try:
        await hass.data[DOMAIN]["controls"].async_pulse(msg["entity_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"])


def _weather_conf(hass, c) -> dict:
    """Configured weather / PV forecast entities, falling back to what's found automatically."""
    from .const import WEATHER_KEYS  # noqa: PLC0415
    from .weather import autodetect  # noqa: PLC0415
    conf = c.conf
    found = autodetect(hass.states.async_entity_ids())
    out = {k: conf.get(k) or found.get(k) for k in WEATHER_KEYS}
    out["weather_extras"] = [e for e in (conf.get("weather_extras") or []) if e]
    return out


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/weather"})
@callback
def ws_weather(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    from homeassistant.util import dt as dt_util  # noqa: PLC0415
    from . import weather as wx  # noqa: PLC0415
    from datetime import timedelta  # noqa: PLC0415
    conf = _weather_conf(hass, c)
    now = dt_util.now()
    tz = dt_util.get_default_time_zone()

    def kwh(eid):
        st = hass.states.get(eid) if eid else None
        try:
            return round(float(st.state), 2) if st else None
        except (TypeError, ValueError):
            return None

    today_st = hass.states.get(conf["pv_forecast_today"]) if conf["pv_forecast_today"] else None
    tom_st = hass.states.get(conf["pv_forecast_tomorrow"]) if conf["pv_forecast_tomorrow"] else None
    series_today = wx.detailed(dict(today_st.attributes), now.date(), tz) if today_st else []
    series_tom = wx.detailed(dict(tom_st.attributes), (now + timedelta(days=1)).date(), tz) if tom_st else []
    remaining = kwh(conf["pv_forecast_remaining"])
    if remaining is None and series_today:
        remaining = wx.remaining_kwh(series_today, now.hour * 60 + now.minute)
    rows = c.acc.rows(now.date().isoformat())
    connection.send_result(msg["id"], {
        "conf": conf,
        "prefs": c.weather_prefs,
        "is_admin": connection.user.is_admin,
        "pv": {"today": kwh(conf["pv_forecast_today"]), "tomorrow": kwh(conf["pv_forecast_tomorrow"]), "remaining": remaining,
               "series_today": series_today, "series_tomorrow": series_tom},
        "solar_today_kwh": round(c.today().get("solar", 0.0), 2) if c.ready else None,
        "solar_rows": [[r[0], r[1]] for r in rows if r[1] is not None],
        "live_solar": c.live.get("solar"),
    })


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/weather_settings",
    vol.Required("settings"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_weather_settings(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    try:
        await c.async_set_weather_prefs(msg["settings"])
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], c.weather_prefs)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/costs"})
@callback
def ws_costs(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    from homeassistant.util import dt as dt_util  # noqa: PLC0415
    from homeassistant.helpers import entity_registry as er  # noqa: PLC0415
    from . import costs  # noqa: PLC0415
    if c.ready:
        c.acc.advance(dt_util.now())
    today = dt_util.now().date()
    days = c.acc.days
    loads = []
    for eid in c.cost_loads:
        st = hass.states.get(eid)
        name = (st.attributes.get("friendly_name") if st else None) or eid.split(".")[-1].replace("_", " ").title()
        reg_entry = er.async_get(hass).async_get(eid)
        if reg_entry and reg_entry.platform == "hamlet_geyser" and (g := hass.config_entries.async_get_entry(reg_entry.config_entry_id)):
            name = {**g.data, **g.options}.get("name") or g.title     # "Geyser", not "Geyser Geyser power"
        for suffix in (" power", " Power", " Krag", " krag"):
            if name.endswith(suffix) and len(name) > len(suffix) + 1:
                name = name[: -len(suffix)]
        loads.append({"entity_id": eid, "name": name})
    connection.send_result(msg["id"], {
        "periods": costs.periods(days, c.tariff, today, c.costs.get("history_start")),
        "daily": costs.daily(days, c.tariff, today, 31),
        "monthly": costs.monthly(days, c.tariff, today, 24),
        "battery": costs.battery_life(days, c.costs, c.tariff, today),
        "loads": loads,
        "settings": c.costs,
        "tariff": c.tariff,
        "first_day": min(days) if days else None,
        "note": c.deep_note,
        "ready": c.ready,
        "is_admin": connection.user.is_admin,
    })


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/costs_settings",
    vol.Required("settings"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_costs_settings(hass, connection, msg):
    if (c := _controller(hass, connection, msg)) is None:
        return
    try:
        await c.async_set_costs(msg["settings"])
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"settings": c.costs, "tariff": c.tariff})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/devices_save",
    vol.Optional("device"): vol.Any(str, None),
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def ws_devices_save(hass, connection, msg):
    """Add a device (admin, no id) or change one (clients: mode, run times, solar levels)."""
    if _controller(hass, connection, msg) is None:
        return
    dev: DevicesController = hass.data[DOMAIN]["devices"]
    try:
        did = await dev.async_save_device(msg.get("device"), msg["settings"], connection.user.is_admin)
    except (ValueError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    await hass.data[DOMAIN]["solar"].async_run()
    connection.send_result(msg["id"], {"id": did, "devices": dev.snapshot(), "solar_loads": hass.data[DOMAIN]["solar"].snapshot()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/devices_remove", vol.Required("device"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_devices_remove(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    dev: DevicesController = hass.data[DOMAIN]["devices"]
    try:
        await dev.async_remove(msg["device"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    await hass.data[DOMAIN]["solar"].async_run()
    connection.send_result(msg["id"], {"devices": dev.snapshot()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/devices_entities"})
@websocket_api.require_admin
@callback
def ws_devices_entities(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    connection.send_result(msg["id"], hass.data[DOMAIN]["devices"].entity_options())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/update_check"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update_check(hass, connection, msg):
    """'Check now' on the page: ask GitHub right away and return what was found."""
    if _controller(hass, connection, msg) is None:
        return
    ents = hass.data[DOMAIN].get("updates", [])
    for u in ents:
        await u.async_check()
    connection.send_result(msg["id"], [u.status() for u in ents])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/help_contact", vol.Required("contact"): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_help_contact(hass, connection, msg):
    """Installer's name / phone / email shown on the Help page."""
    if (c := _controller(hass, connection, msg)) is None:
        return
    try:
        await c.async_set_help_contact(msg["contact"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], c.help_contact)


# ------------------------------------------------------------------ alarms (clients may set them up)
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/alarms"})
@websocket_api.async_response
async def ws_alarms(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    connection.send_result(msg["id"], hass.data[DOMAIN]["alarms"].snapshot(full=True))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/alarms_save", vol.Required("rules"): list, vol.Optional("targets"): list})
@websocket_api.async_response
async def ws_alarms_save(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    a: AlarmsController = hass.data[DOMAIN]["alarms"]
    try:
        await a.async_save(msg["rules"], msg.get("targets"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], a.snapshot(full=True))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/alarms_ack", vol.Optional("alarm"): str})
@websocket_api.async_response
async def ws_alarms_ack(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    a: AlarmsController = hass.data[DOMAIN]["alarms"]
    a.acknowledge(msg.get("alarm"))
    connection.send_result(msg["id"], a.snapshot())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/alarms_test"})
@websocket_api.async_response
async def ws_alarms_test(hass, connection, msg):
    if _controller(hass, connection, msg) is None:
        return
    await hass.data[DOMAIN]["alarms"].async_test()
    connection.send_result(msg["id"], {"ok": True})
