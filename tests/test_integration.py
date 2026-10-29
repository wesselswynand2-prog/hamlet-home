"""Hamlet Home inside a real Home Assistant (with recorder)."""
from datetime import timedelta

import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import CLIENT_ID, MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

DOMAIN = "hamlet_home"


def _states(hass, pv_kw, load, grid, batt, soc):
    hass.states.async_set("sensor.pv", str(pv_kw), {"unit_of_measurement": "kW"})
    hass.states.async_set("sensor.load", str(load), {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.grid", str(grid), {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.batt", str(batt), {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.soc", str(soc), {"unit_of_measurement": "%"})
    hass.states.async_set("sensor.aircon", "1200", {"unit_of_measurement": "W", "friendly_name": "Kantoor Aircon"})
    hass.states.async_set("sensor.ac_in_voltage", "230", {"unit_of_measurement": "V"})


async def _flow(hass):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "name": "Wynand Huis", "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"],
        "grid_power": ["sensor.grid"], "grid_status": "sensor.ac_in_voltage", "battery_power": "sensor.batt", "battery_soc": "sensor.soc"})
    assert result["step_id"] == "extras"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "extra_loads": ["sensor.aircon"], "battery_invert": False, "grid_invert": False})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    return result["result"]


async def test_backfill_from_history_and_live(recorder_mock, enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, freezer):
    start = dt_util.start_of_local_day() + timedelta(hours=9)
    freezer.move_to(start)
    _states(hass, 4.0, 1000, -1000, 2000, 60)       # 4 kW solar, exporting 1 kW
    await hass.async_block_till_done()
    freezer.move_to(start + timedelta(hours=1))
    _states(hass, 0.0, 2000, 2000, 0, 80)           # night-ish: importing 2 kW
    await hass.async_block_till_done()
    freezer.move_to(start + timedelta(hours=2))
    await async_wait_recording_done(hass)

    entry = await _flow(hass)
    c = hass.data[DOMAIN]["controller"]
    for _ in range(20):
        if c.ready:
            break
        await async_wait_recording_done(hass)
        await hass.async_block_till_done(wait_background_tasks=True)
    assert c.ready

    today = c.today()
    assert abs(today["solar"] - 4.0) < 0.05, today
    assert abs(today["load"] - 3.0) < 0.05, today
    assert abs(today["export"] - 1.0) < 0.05 and abs(today["import"] - 2.0) < 0.05
    assert today["cost"] == pytest.approx(2.0 * 3.5, abs=0.2)
    assert today["self_sufficiency"] == pytest.approx(33, abs=2)

    # live values + extras + grid status
    assert c.live["solar"] == 0 and c.live["grid"] == 2000 and c.live["grid_available"] is True
    assert c.extras[0]["name"] == "Kantoor Aircon" and c.extras[0]["w"] == 1200

    # panel + sensors
    assert "hamlet-home" in hass.data["frontend_panels"]
    assert float(hass.states.get("sensor.wynand_huis_solar_today").state) == pytest.approx(4.0, abs=0.05)
    assert hass.states.get("sensor.wynand_huis_grid_cost_today").attributes["unit_of_measurement"] == "ZAR"

    # websocket: state with chart rows, tariff change recalculates money
    refresh = await hass.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json({"id": 1, "type": f"{DOMAIN}/state"})
    msg = await client.receive_json()
    assert msg["success"]
    rows = msg["result"]["rows"]["today"]
    assert len(rows) >= 24 and rows[0][1] == 4000
    assert len(msg["result"]["days"]) == 30
    await client.send_json({"id": 2, "type": f"{DOMAIN}/set_tariff", "tariff": {"import": 4.0, "export": 1.0}})
    msg = await client.receive_json()
    assert msg["success"] and msg["result"]["today"]["cost"] == pytest.approx(2.0 * 4 - 1.0, abs=0.2)
    await client.send_json({"id": 3, "type": f"{DOMAIN}/set_tariff", "tariff": {"import": -1}})
    msg = await client.receive_json()
    assert not msg["success"]

    # live integration continues after backfill
    before = c.today()["load"]
    freezer.move_to(start + timedelta(hours=2, minutes=6))
    _states(hass, 3.0, 1000, 0, 2000, 85)
    await hass.async_block_till_done()
    assert c.today()["load"] - before == pytest.approx(2.0 * 6 / 60, abs=0.01)  # 6 min at 2 kW
    # a long gap (HA down) is not counted
    freezer.move_to(start + timedelta(hours=4))
    _states(hass, 3.0, 1500, 0, 2000, 85)
    await hass.async_block_till_done()
    assert c.today()["load"] - before == pytest.approx(0.2, abs=0.01)

    # subscribe throttles but delivers
    await client.send_json({"id": 4, "type": f"{DOMAIN}/subscribe"})
    assert (await client.receive_json())["success"]
    ev = await client.receive_json()
    assert ev["type"] == "event" and ev["event"]["live"]["solar"] == 3000

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert "hamlet-home" not in hass.data["frontend_panels"]


async def test_prefill_from_geyser_and_single_instance(enable_custom_integrations, hass: HomeAssistant):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    MockConfigEntry(domain="hamlet_geyser", data={"name": "G", "geyser_switch": "switch.g", "preset": "sunsynk",
                                                  "solar_power": ["sensor.pv"], "battery_invert": True}).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    keys = {str(k): k for k in result["data_schema"].schema}
    assert keys["solar_power"].description["suggested_value"] == ["sensor.pv"]
    assert keys["preset"].description["suggested_value"] == "sunsynk"


async def test_works_without_recorder(enable_custom_integrations, hass: HomeAssistant):
    _states(hass, 2.0, 500, 0, 1500, 50)
    await _flow(hass)
    c = hass.data[DOMAIN]["controller"]
    await hass.async_block_till_done(wait_background_tasks=True)
    assert c.ready and "Recorder is off" in (c.backfill_note or "")
    assert c.live["solar"] == 2000


async def _water_entry(hass):
    from pytest_homeassistant_custom_component.common import async_mock_service
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    on = async_mock_service(hass, "homeassistant", "turn_on")
    off = async_mock_service(hass, "homeassistant", "turn_off")
    notes = async_mock_service(hass, "persistent_notification", "create")
    async_mock_service(hass, "persistent_notification", "dismiss")
    _states(hass, 2.0, 500, 0, 1500, 50)
    hass.states.async_set("switch.druk_pomp", "on")
    hass.states.async_set("sensor.druk_power", "850", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.druk_hz", "48", {"unit_of_measurement": "Hz"})
    hass.states.async_set("sensor.water_druk", "20", {"unit_of_measurement": "kPa"})  # 0.2 bar
    hass.states.async_set("switch.swembad", "off")
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={
        "name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"]},
        options={"pump_switch": "switch.druk_pomp", "pump_power": "sensor.druk_power", "pump_hz": "sensor.druk_hz",
                 "water_pressure": "sensor.water_druk", "pool_switch": "switch.swembad"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    return entry, on, off, notes


async def test_water_dry_run_pool_and_ws(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, freezer):
    freezer.move_to(dt_util.start_of_local_day() + timedelta(hours=9))
    entry, on, off, notes = await _water_entry(hass)
    w = hass.data[DOMAIN]["water"]
    assert w.enabled and w.live["pressure"] == pytest.approx(0.2) and w.live["pump_running"] is True

    refresh = await hass.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    # enable dry-run protection + pool schedule that covers now (09:00-11:00 every day)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/water_settings", "settings": {
        "dry_run_enabled": True, "dry_run_bar": 0.5, "dry_run_seconds": 60,
        "pool_schedules": [{"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "11:00"}]}})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert any(c.data["entity_id"] == "switch.swembad" for c in on)  # pool timer started

    # 70 s of running dry -> pump switched off + notification
    freezer.tick(timedelta(seconds=70))
    hass.states.async_set("sensor.water_druk", "19", {"unit_of_measurement": "kPa"})
    await hass.async_block_till_done()
    assert w.guard.tripped
    assert any(c.data["entity_id"] == "switch.druk_pomp" for c in off)
    assert any("no water" in c.data["title"] for c in notes)

    # state includes water section and pump run stats
    await client.send_json({"id": 2, "type": f"{DOMAIN}/state"})
    msg = await client.receive_json()
    ws = msg["result"]["water"]
    assert ws["tripped"] is True and ws["features"]["pool_switch"] and ws["pump_today"]["seconds"] >= 60
    assert ws["rows"]["today"]

    # reset turns the pump back on
    on.clear()
    await client.send_json({"id": 3, "type": f"{DOMAIN}/water_action", "action": "reset"})
    msg = await client.receive_json()
    assert msg["success"] and msg["result"]["tripped"] is False
    assert any(c.data["entity_id"] == "switch.druk_pomp" for c in on)

    # pool mode off from the UI
    off.clear()
    hass.states.async_set("switch.swembad", "on")
    await client.send_json({"id": 4, "type": f"{DOMAIN}/water_action", "action": "pool_mode", "value": "off"})
    assert (await client.receive_json())["success"]
    assert any(c.data["entity_id"] == "switch.swembad" for c in off)

    # sensors
    assert float(hass.states.get("sensor.huis_booster_pump_run_time_today").state) > 0
    assert hass.states.get("sensor.huis_booster_pump_starts_today") is not None
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_pool_respects_manual_switching(enable_custom_integrations, hass: HomeAssistant, freezer):
    freezer.move_to(dt_util.start_of_local_day() + timedelta(hours=12))
    entry, on, off, _ = await _water_entry(hass)
    w = hass.data[DOMAIN]["water"]
    # default schedule 10:00-14:00 -> turned on at startup
    assert any(c.data["entity_id"] == "switch.swembad" for c in on)
    hass.states.async_set("switch.swembad", "on")
    await hass.async_block_till_done()
    # owner switches it off by hand at 12:30 -> app leaves it alone
    off.clear()
    freezer.tick(timedelta(minutes=30))
    hass.states.async_set("switch.swembad", "off")
    await hass.async_block_till_done()
    await w.async_evaluate()
    on.clear()
    await w.async_evaluate()
    assert not any(c.data["entity_id"] == "switch.swembad" for c in on)
    # at 14:00 the window ends; at the next window start it turns on again
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_options_menu_water_keeps_energy(enable_custom_integrations, hass: HomeAssistant):
    entry, *_ = await _water_entry(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == "menu" and set(result["menu_options"]) == {"energy", "water"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "water"})
    assert result["step_id"] == "water"
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"water_pressure": "sensor.water_druk"})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    merged = {**entry.data, **entry.options}
    assert merged["solar_power"] == ["sensor.pv"] and merged["water_pressure"] == "sensor.water_druk"
    assert merged["pump_switch"] is None  # cleared because it was left empty


async def test_solar_priority_pool_and_geyser(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, freezer):
    from pytest_homeassistant_custom_component.common import async_mock_service
    freezer.move_to(dt_util.start_of_local_day() + timedelta(hours=12))
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    on = async_mock_service(hass, "homeassistant", "turn_on")
    off = async_mock_service(hass, "homeassistant", "turn_off")
    async_mock_service(hass, "persistent_notification", "create")
    hass.states.async_set("sensor.pv", "3000", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.load", "500", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.soc", "60", {"unit_of_measurement": "%"})
    hass.states.async_set("switch.geyser", "off")
    hass.states.async_set("sensor.geyser_temp", "45", {"unit_of_measurement": "°C"})
    hass.states.async_set("switch.swembad", "off")
    g_entry = MockConfigEntry(domain="hamlet_geyser", title="Geyser", data={
        "name": "Geyser", "geyser_switch": "switch.geyser", "geyser_temp": "sensor.geyser_temp",
        "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"], "battery_soc": "sensor.soc",
        "collector_mode": "none"})
    g_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(g_entry.entry_id)
    h_entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={
        "name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"], "battery_soc": "sensor.soc"},
        options={"pool_switch": "switch.swembad"})
    h_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(h_entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    water, solar = hass.data[DOMAIN]["water"], hass.data[DOMAIN]["solar"]
    geyser = hass.data["hamlet_geyser"][g_entry.entry_id]
    gid = f"geyser:{g_entry.entry_id}"
    await water.async_save_settings({"pool_mode": "solar", "pool_hours": 6,
                                     "pool_schedules": [{"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": "08:00", "end": "17:00"}]}, admin=True)
    on.clear(); off.clear()
    freezer.tick(timedelta(minutes=3))  # past the geyser's relay-protection time after start-up

    # 2.5 kW spare, geyser first (default order): geyser starts, nothing left for the pool
    await solar.async_save_settings({"order": [gid, "pool"]})
    assert any(c.data["entity_id"] == "switch.geyser" for c in on)
    assert not any(c.data["entity_id"] == "switch.swembad" for c in on)
    assert geyser.decision.source == "solar" and "priority 1" in geyser.decision.reason
    assert "Waiting for solar" in water.pool_reason

    # geyser now running 3 kW; solar drops to 2 kW -> spare without managed loads = 1.5 kW: geyser keeps, pool waits
    hass.states.async_set("switch.geyser", "on")
    hass.states.async_set("sensor.pv", "2000", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.load", "3500", {"unit_of_measurement": "W"})
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=3))
    await solar.async_run()
    st = {l["id"]: l for l in solar.snapshot()["loads"]}
    assert st[gid]["grant"] and not st["pool"]["grant"]

    # user moves the pool to the top: pool starts on 1.5 kW, geyser (needs 0.8 kW keep, only 0.75 left) is switched off first
    on.clear(); off.clear()
    refresh = await hass.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json({"id": 1, "type": f"{DOMAIN}/solar_settings", "settings": {"order": ["pool", gid]}})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert [l["id"] for l in msg["result"]["loads"]] == ["pool", gid]
    await hass.async_block_till_done()
    assert any(c.data["entity_id"] == "switch.swembad" for c in on)
    assert any(c.data["entity_id"] == "switch.geyser" for c in off)

    # sharing off: geyser goes back to its own rules
    await solar.async_save_settings({"enabled": False})
    assert geyser.solar_grant is None

    await hass.config_entries.async_unload(h_entry.entry_id)
    await hass.config_entries.async_unload(g_entry.entry_id)
    await hass.async_block_till_done()


async def test_irrigation(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, freezer):
    from pytest_homeassistant_custom_component.common import async_mock_service
    freezer.move_to(dt_util.start_of_local_day() + timedelta(hours=5, minutes=29, seconds=50))
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    on = async_mock_service(hass, "homeassistant", "turn_on")
    off = async_mock_service(hass, "homeassistant", "turn_off")
    hass.states.async_set("sensor.pv", "0", {"unit_of_measurement": "W"})
    for v in ("buite_gras", "binne_tuin", "binne_gras"):
        hass.states.async_set(f"switch.{v}", "off", {"friendly_name": v.replace("_", " ").title()})
    hass.states.async_set("switch.borehole", "off")
    hass.states.async_set("weather.home", "sunny")
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    irr = hass.data[DOMAIN]["irrigation"]

    refresh = await hass.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json({"id": 1, "type": f"{DOMAIN}/irrigation_entities"})
    opts = (await client.receive_json())["result"]
    assert any(o["id"] == "switch.binne_tuin" for o in opts["valves"]) and any(o["id"] == "weather.home" for o in opts["rain"])

    today = dt_util.now().weekday()
    await client.send_json({"id": 2, "type": f"{DOMAIN}/irrigation_settings", "settings": {
        "zones": [{"name": "Buite Gras", "entity": "switch.buite_gras", "minutes": 10},
                  {"name": "Binne Tuin", "entity": "switch.binne_tuin", "minutes": 5},
                  {"name": "Binne Gras", "entity": "switch.binne_gras", "minutes": 0}],
        "programs": [{"enabled": True, "days": [today], "start": "05:30", "zones": []}],
        "pump_entity": "switch.borehole", "rain_entity": "weather.home", "amount": 100}})
    msg = await client.receive_json()
    assert msg["success"], msg
    await hass.async_block_till_done()
    irr = hass.data[DOMAIN]["irrigation"]   # entry reloaded after the first valves were added
    assert len(irr.zones) == 3
    assert hass.states.get("sensor.huis_irrigation").state == "Idle"
    z = {x["name"]: x["id"] for x in irr.zones}

    # 05:30 program starts: first valve + pump on
    on.clear(); off.clear()
    freezer.tick(timedelta(seconds=15))
    await irr._tick()
    assert [c.data["entity_id"] for c in on] == ["switch.buite_gras", "switch.borehole"]
    hass.states.async_set("switch.buite_gras", "on"); hass.states.async_set("switch.borehole", "on")
    await hass.async_block_till_done()
    snap = irr.snapshot()
    assert snap["run"]["name"] == "Buite Gras" and snap["run"]["total"] == 2   # 0-minute valve skipped

    # after 10 min: next valve opens BEFORE the previous one closes
    on.clear(); off.clear()
    freezer.tick(timedelta(minutes=10, seconds=1))
    await irr._tick()
    assert [c.data["entity_id"] for c in on] == ["switch.binne_tuin"]
    assert [c.data["entity_id"] for c in off] == ["switch.buite_gras"]
    hass.states.async_set("switch.buite_gras", "off"); hass.states.async_set("switch.binne_tuin", "on")
    await hass.async_block_till_done()

    # after 5 more min: pump off first, then the last valve; run logged
    on.clear(); off.clear()
    freezer.tick(timedelta(minutes=5, seconds=1))
    await irr._tick()
    assert [c.data["entity_id"] for c in off] == ["switch.borehole", "switch.binne_tuin"]
    assert irr.run is None and len(irr.snapshot()["today"]) == 2 and irr.snapshot()["today_minutes"] == 15
    hass.states.async_set("switch.binne_tuin", "off"); hass.states.async_set("switch.borehole", "off")
    await hass.async_block_till_done()

    # valve opened by hand closes itself after its time
    off.clear()
    hass.states.async_set("switch.binne_tuin", "on")
    await hass.async_block_till_done()
    assert "switch.binne_tuin" in irr.manual_off
    freezer.tick(timedelta(minutes=5, seconds=6))
    await irr._tick()
    assert [c.data["entity_id"] for c in off] == ["switch.binne_tuin"]
    hass.states.async_set("switch.binne_tuin", "off")
    await hass.async_block_till_done()

    # rain: tomorrow's program is skipped
    hass.states.async_set("weather.home", "rainy")
    assert irr.skip_reason(dt_util.now()) == "Raining (weather)"
    # rain delay + run a single zone by hand + stop (new connection: the clock jumps above outlast the websocket heartbeat)
    refresh = await hass.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json({"id": 3, "type": f"{DOMAIN}/irrigation_action", "action": "rain_delay", "hours": 48})
    assert "Rain delay" in (await client.receive_json())["result"]["skip"]
    on.clear(); off.clear()
    await client.send_json({"id": 4, "type": f"{DOMAIN}/irrigation_action", "action": "run_zone", "zone": z["Binne Gras"], "minutes": 3})
    msg = await client.receive_json()
    assert msg["success"] and msg["result"]["run"]["name"] == "Binne Gras"
    await client.send_json({"id": 5, "type": f"{DOMAIN}/irrigation_action", "action": "stop"})
    assert (await client.receive_json())["result"]["run"] is None
    assert "switch.binne_gras" in [c.data["entity_id"] for c in off]

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
