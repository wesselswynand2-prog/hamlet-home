"""Shelly devices (heat pump, heater, aircon …) with Timer / Solar / On / Off."""
import importlib.util
import pathlib
import sys
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed, async_mock_service

_dir = pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home"
sys.path.insert(0, str(_dir))
for name in ("water", "devices"):
    spec = importlib.util.spec_from_file_location(name, _dir / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
sys.path.remove(str(_dir))
dv = sys.modules["devices"]
DOMAIN = "hamlet_home"


def test_validate():
    assert dv.validate({"name": " Heat pump ", "switch": "switch.hp", "kind": "heatpump", "rated_w": "2500"}, admin=True) == {
        "name": "Heat pump", "switch": "switch.hp", "kind": "heatpump", "rated_w": 2500.0}
    assert dv.validate({"mode": "solar", "hours": 4}, admin=False) == {"mode": "solar", "hours": 4.0}
    for bad, admin in (({"switch": "sensor.x"}, True), ({"kind": "rocket"}, True), ({"rated_w": 5}, False),
                       ({"solar_start_w": 500, "solar_keep_w": 900}, True), ({"name": ""}, True), ({"mode": "max"}, False)):
        try:
            dv.validate(bad, admin)
            raise AssertionError(bad)
        except ValueError:
            pass
    assert dv.new_id("Pool Heat-Pump", {"pool_heat_pump"}) == "pool_heat_pump_2"


async def test_devices_in_home_assistant(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, freezer):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    on = async_mock_service(hass, "homeassistant", "turn_on")
    off = async_mock_service(hass, "homeassistant", "turn_off")
    hass.states.async_set("sensor.pv", "4000", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.load", "1000", {"unit_of_measurement": "W"})
    hass.states.async_set("switch.heatpump", "off", {"friendly_name": "Heatpump"})
    hass.states.async_set("sensor.heatpump_power", "0", {"unit_of_measurement": "W", "device_class": "power"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/devices_entities"})
    opts = (await ws.receive_json())["result"]
    assert any(o["id"] == "switch.heatpump" for o in opts["switches"]) and any(o["id"] == "sensor.heatpump_power" for o in opts["power"])
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/devices_save", "device": None, "settings": {
        "name": "Heat pump", "kind": "heatpump", "switch": "switch.heatpump", "power": "sensor.heatpump_power", "rated_w": 2000}})
    r = await ws.receive_json()
    assert r["success"], r
    did = r["result"]["id"]
    assert did == "heat_pump" and r["result"]["devices"][0]["mode"] == "off"
    # same switch twice is refused
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/devices_save", "device": None, "settings": {"name": "Again", "switch": "switch.heatpump"}})
    assert not (await ws.receive_json())["success"]

    # Timer mode inside a run time -> switched on
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/devices_save", "device": did, "settings": {
        "mode": "auto", "schedules": [{"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": (dt_util.now() - timedelta(minutes=30)).strftime("%H:%M"),
                                       "end": (dt_util.now() + timedelta(minutes=40)).strftime("%H:%M")}]}})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert any(c.data["entity_id"] == "switch.heatpump" for c in on)

    # Solar mode: 3 kW spare >= 1.5 kW start -> solar sharing switches it on; it takes part in Solar priority
    hass.states.async_set("switch.heatpump", "off")
    on.clear(); off.clear()
    await ws.send_json({"id": 5, "type": f"{DOMAIN}/devices_save", "device": did, "settings": {"mode": "solar", "schedules": []}})
    r = await ws.receive_json()
    assert r["success"]
    solar = hass.data[DOMAIN]["solar"]
    await solar.async_run()
    await hass.async_block_till_done()
    assert not on                                   # the timer switched it < 5 min ago: compressor protection waits
    assert "protect" in hass.data[DOMAIN]["devices"].snapshot()[0]["reason"]
    freezer.tick(timedelta(minutes=6))
    async_fire_time_changed(hass)                   # the device's own 30 s check
    await hass.async_block_till_done()
    assert any(c.data["entity_id"] == "switch.heatpump" for c in on)
    known = solar.snapshot()["loads"]
    assert known[0]["id"] == f"dev:{did}" and known[0]["active"] and known[0]["device_kind"] == "heatpump"

    # not on the Controls tab (it would fight the timer); in the Costs breakdown by its power sensor
    lay = hass.data[DOMAIN]["controls"].layout(admin=True)
    assert "switch.heatpump" not in [i["entity_id"] for i in lay["all"]]
    assert "sensor.heatpump_power" in hass.data[DOMAIN]["controller"].cost_loads

    # run time is counted while it draws power
    hass.states.async_set("switch.heatpump", "on")
    hass.states.async_set("sensor.heatpump_power", "1900", {"unit_of_measurement": "W"})
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=5))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    snap = hass.data[DOMAIN]["devices"].snapshot()[0]
    assert snap["on"] and snap["w"] == 1900 and snap["today"]["seconds"] >= 290

    # admins can remove it (fresh connection: the test socket drops after clock jumps)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 6, "type": f"{DOMAIN}/devices_remove", "device": did})
    assert (await ws.receive_json())["success"]
    assert hass.data[DOMAIN]["devices"].snapshot() == []
    await hass.config_entries.async_unload(entry.entry_id)
