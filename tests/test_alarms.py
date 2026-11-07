"""Alarms: the ready-made checks, the for-X-minutes timing, pop-up data, notifications and the websocket."""
import importlib.util
import pathlib
from datetime import timedelta

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import async_mock_service

from .test_integration import DOMAIN, _water_entry

_spec = importlib.util.spec_from_file_location("hh_alarms", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/alarms.py")
al = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(al)


def rule(t, **kw):
    r = al.new_rule(t)
    r.update(kw)
    return al.validate_rule(r)


def test_checks():
    ctx = {"battery_current": -180.0, "battery": -6500, "load": 8200, "soc": 18, "grid_available": False,
           "geysers": [{"entry_id": "g1", "name": "Geyser 1", "temp": 41}, {"entry_id": "g2", "name": "Geyser 2", "temp": 60}],
           "pump_tripped": True, "inverter_state": "Fault", "minutes_now": 18 * 60, "states": {"sensor.x": ("31", "°C")}}
    assert al.check(rule("battery_current", value=150), ctx)[0] is True
    assert "180 A discharging" in al.check(rule("battery_current", value=150), ctx)[1]
    assert al.check(rule("load_high", value=7000), ctx)[0] is True
    assert al.check(rule("soc_low", value=20), ctx)[0] is True
    assert al.check(rule("grid_down"), ctx)[0] is True
    hit, text = al.check(rule("geyser_cold", value=50, time="17:00"), ctx)
    assert hit and "Geyser 1 41°C" in text and "Geyser 2" not in text
    assert al.check(rule("geyser_cold", value=50, time="19:00"), ctx)[0] is False      # not that late yet
    assert al.check(rule("pump_trip"), ctx)[0] is True
    assert al.check(rule("inverter_fault"), ctx)[0] is True
    assert al.check(rule("sensor", entity="sensor.x", op="above", value=30), ctx)[0] is True
    assert al.check(rule("sensor", entity="sensor.missing", op="above", value=30), ctx)[0] is None
    assert al.check(rule("battery_current", value=150), {"battery_current": None})[0] is None


def test_validation():
    try:
        al.validate_rule({"type": "sensor", "entity": "", "op": "above", "value": 1})
        raise AssertionError
    except ValueError:
        pass
    try:
        al.validate_rule({"type": "load_high", "value": "lots"})
        raise AssertionError
    except ValueError:
        pass


async def test_alarm_fires_pops_up_and_clears(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user):
    entry, *_ = await _water_entry(hass)
    a = hass.data[DOMAIN]["alarms"]
    pushes = async_mock_service(hass, "notify", "mobile_app_test")
    assert {r["type"] for r in a.rules} >= {"load_high", "soc_low", "grid_down"} and not any(r["enabled"] for r in a.rules)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/alarms"})
    full = (await ws.receive_json())["result"]
    assert full["available"]["load_high"] and "mobile_app_test" in full["notify_options"]
    rules = [{**r, "enabled": r["type"] == "load_high", "value": 300, "minutes": 0} for r in full["rules"]]
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/alarms_save", "rules": rules, "targets": ["mobile_app_test", "nope"]})
    res = await ws.receive_json()
    assert res["success"], res
    # load is 500 W (> 300): fires straight away (minutes 0)
    assert [x["name"] for x in a.snapshot()["active"]] == ["Too much load"]
    assert pushes and pushes[-1].data["title"] == "Too much load" and a.targets == ["mobile_app_test"]
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/alarms_ack"})
    assert (await ws.receive_json())["success"] and a.snapshot()["active"][0]["acked"]
    # load drops: clears
    hass.states.async_set("sensor.load", "100", {"unit_of_measurement": "W"})
    await hass.async_block_till_done()
    await a.async_evaluate()
    assert a.snapshot()["active"] == [] and a.history[-1]["cleared"]
    # for-X-minutes: a 5 min rule doesn't fire on the first look
    hass.states.async_set("sensor.load", "500", {"unit_of_measurement": "W"})
    await hass.async_block_till_done()
    rules = [{**r, "enabled": r["type"] == "load_high", "value": 300, "minutes": 5} for r in a.rules]
    await a.async_save(rules, None)
    assert a.snapshot()["active"] == []
    st = a.state[[r for r in a.rules if r["type"] == "load_high"][0]["id"]]
    st["since"] -= timedelta(minutes=6)
    await a.async_evaluate()
    assert [x["name"] for x in a.snapshot()["active"]] == ["Too much load"]
