"""Weather tab: entity detection, Solcast detail, settings."""
import importlib.util
import pathlib
from datetime import date, datetime, timedelta, timezone

from homeassistant import data_entry_flow
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

_spec = importlib.util.spec_from_file_location("hh_weather", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/weather.py")
wx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wx)

DOMAIN = "hamlet_home"
SAST = timezone(timedelta(hours=2))


def test_autodetect():
    ids = ["weather.forecast_home", "weather.wynand_huis", "sensor.solcast_pv_forecast_forecast_today",
           "sensor.solcast_pv_forecast_forecast_tomorrow", "sensor.pv"]
    out = wx.autodetect(ids)
    assert out["weather_entity"] == "weather.wynand_huis"
    assert out["pv_forecast_today"] == "sensor.solcast_pv_forecast_forecast_today"
    assert out["pv_forecast_remaining"] is None
    assert wx.autodetect(["weather.forecast_home"])["weather_entity"] == "weather.forecast_home"
    assert wx.autodetect([])["weather_entity"] is None


def test_detailed_and_remaining():
    d = date(2026, 11, 4)
    attrs = {"detailedForecast": [
        {"period_start": datetime(2026, 11, 4, 12, 0, tzinfo=SAST), "pv_estimate": 6.0, "pv_estimate10": 4.0, "pv_estimate90": 7.0},
        {"period_start": "2026-11-04T10:30:00+00:00", "pv_estimate": 5.0},           # 12:30 local, string form
        {"period_start": datetime(2026, 11, 5, 12, 0, tzinfo=SAST), "pv_estimate": 9.0},  # tomorrow: skipped
        {"period_start": "junk", "pv_estimate": 1}, "junk"]}
    s = wx.detailed(attrs, d, SAST)
    assert s == [[720, 6.0, 4.0, 7.0], [750, 5.0, 5.0, 5.0]]
    assert wx.remaining_kwh(s, 0) == 5.5                 # (6 + 5) kW x 0.5 h
    assert wx.remaining_kwh(s, 735) == 4.0               # half of the 12:00 period + all of 12:30
    assert wx.remaining_kwh(s, 800) == 0
    assert wx.validate_prefs({"rain_unit": "mm", "wind_unit": "km/h"}) == {"rain_unit": "mm", "wind_unit": "km/h"}
    try:
        wx.validate_prefs({"wind_unit": "beaufort"})
        raise AssertionError
    except ValueError:
        pass


async def test_weather_ws_and_options(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    await hass.config.async_set_time_zone("Africa/Johannesburg")
    now = dt_util.now()
    hass.states.async_set("weather.wynand_huis", "partlycloudy", {"temperature": 34.4, "cloud_coverage": 95.3})
    hass.states.async_set("sensor.solcast_pv_forecast_forecast_today", "63.96", {
        "unit_of_measurement": "kWh",
        "detailedForecast": [{"period_start": now.replace(hour=23, minute=0, second=0, microsecond=0), "pv_estimate": 2.0}]})
    hass.states.async_set("sensor.solcast_pv_forecast_forecast_tomorrow", "59.39", {"unit_of_measurement": "kWh"})
    hass.states.async_set("sensor.forecast_soc", "12", {"unit_of_measurement": "%"})
    hass.states.async_set("sensor.pv", "1", {"unit_of_measurement": "kW"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/weather"})
    r = (await ws.receive_json())["result"]
    assert r["conf"]["weather_entity"] == "weather.wynand_huis"         # found automatically
    assert r["pv"]["today"] == 63.96 and r["pv"]["tomorrow"] == 59.39
    assert r["pv"]["series_today"] == [[1380, 2.0, 2.0, 2.0]] and r["pv"]["remaining"] == 1.0
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/state"})
    assert (await ws.receive_json())["result"]["weather_available"]
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/weather_settings", "settings": {"rain_unit": "mm"}})
    assert (await ws.receive_json())["result"]["rain_unit"] == "mm"

    # Configure -> Weather: suggested values come from what was found; saving keeps the other sections
    hass.config_entries.async_update_entry(entry, options={"pool_switch": "switch.swembad"})
    await hass.async_block_till_done()
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(flow["flow_id"], {"next_step_id": "weather"})
    assert flow["step_id"] == "weather"
    flow = await hass.config_entries.options.async_configure(flow["flow_id"], {
        "weather_entity": "weather.wynand_huis", "weather_extras": ["sensor.forecast_soc"]})
    assert flow["type"] == data_entry_flow.FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options["pool_switch"] == "switch.swembad" and entry.options["weather_extras"] == ["sensor.forecast_soc"]
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/weather"})
    assert (await ws.receive_json())["result"]["conf"]["weather_extras"] == ["sensor.forecast_soc"]
    await hass.config_entries.async_unload(entry.entry_id)
