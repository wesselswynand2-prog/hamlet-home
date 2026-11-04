"""Costs tab maths and the long history read."""
import importlib.util
import pathlib
import sys
from datetime import date, datetime, timedelta

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

_dir = pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home"
sys.path.insert(0, str(_dir))          # costs.py falls back to "from energy import …"
for name in ("energy", "costs"):
    spec = importlib.util.spec_from_file_location(name, _dir / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
sys.path.remove(str(_dir))
costs = sys.modules["costs"]
energy = sys.modules["energy"]
DOMAIN = "hamlet_home"
T = {"import": 4.0, "export": 1.0, "daily_fixed": 2.0, "currency": "R",
     "history": [{"until": "2026-06-30", "import": 3.0}]}


def day(load=20, solar=25, imp=2, exp=1, ch=10, dis=8, **loads):
    d = {"load": load, "solar": solar, "import": imp, "export": exp, "charge": ch, "discharge": dis}
    d.update({f"x:{k}": v for k, v in loads.items()})
    return d


def test_price_history():
    assert energy.tariff_for(T, "2026-06-30")["import"] == 3.0
    assert energy.tariff_for(T, "2026-07-01")["import"] == 4.0
    assert energy.tariff_for(T, "2026-07-01")["daily_fixed"] == 2.0
    m = costs.day_money(day(), T, "2026-11-04")
    assert m["grid_cost"] == 2 * 4 - 1 * 1 + 2 and m["load_value"] == 20 * 4 + 2
    assert m["solar_value"] == 100 and m["battery_value"] == 32 and m["saved"] == 82 - 9
    assert costs.day_money(day(), T, "2026-06-01")["solar_value"] == 75      # old price


def test_periods_and_series():
    today = date(2026, 11, 4)
    days = {}
    for i in range(400):
        d = (today - timedelta(days=i)).isoformat()
        days[d] = day(swembad=4.0, geyser=3.0)
    p = costs.periods(days, T, today, "2026-01-01")
    assert p["today"]["load"] == 20 and p["today"]["loads"] == {"swembad": 4.0, "geyser": 3.0}
    assert p["month"]["days"] == 4 and p["month"]["load"] == 80
    assert p["last_month_same"]["days"] == 4                        # 1..4 October
    assert p["since"]["from"] == "2026-01-01" and p["since"]["days"] == 308
    assert p["year"]["days"] == 308
    assert p["today"]["self_sufficiency"] == 90
    mo = costs.monthly(days, T, today, 12)
    assert len(mo) == 12 and mo[-1]["month"] == "2026-11" and mo[-1]["days"] == 4 and mo[-2]["days"] == 31
    assert mo[-2]["solar"] == 25 * 31
    dl = costs.daily(days, T, today, 14)
    assert len(dl) == 14 and dl[-1]["day"] == "2026-11-04" and dl[-1]["grid_cost"] == 9
    assert costs.daily({}, T, today, 3)[0] == {"day": "2026-11-02"}


def test_battery_life():
    today = date(2026, 11, 4)
    days = {(today - timedelta(days=i)).isoformat(): day(dis=10) for i in range(100)}
    assert costs.battery_life(days, {}, T, today) is None
    b = costs.battery_life(days, {"battery_price": 100000, "battery_lifetime_kwh": 50000, "battery_installed": None}, T, today)
    assert b["used_kwh"] == 1000 and b["left_kwh"] == 49000 and b["cost_per_kwh"] == 2.0
    assert b["value_left"] == 98000 and b["per_day_kwh"] == 10 and b["days_left"] == 4900 and b["years_left"] == 13.4
    assert b["life_used_pct"] == 2.0


def test_validate():
    assert costs.validate({"history_start": "2024-04-01", "battery_price": "65000", "battery_lifetime_kwh": ""}) == {
        "history_start": "2024-04-01", "battery_price": 65000.0, "battery_lifetime_kwh": None}
    for bad in ({"history_start": "april"}, {"battery_price": -5}):
        try:
            costs.validate(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    assert costs.validate_history([{"until": "2025-06-30", "import": "3.2"}]) == [{"until": "2025-06-30", "import": 3.2}]
    try:
        costs.validate_history([{"until": "2025-06-30"}])
        raise AssertionError
    except ValueError:
        pass


async def test_costs_ws_with_long_history(recorder_mock, enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user):
    from homeassistant.components.recorder.statistics import async_import_statistics
    from homeassistant.components.recorder.models import StatisticMeanType, StatisticMetaData
    from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    for eid, unit in (("sensor.load", "W"), ("sensor.pv", "W"), ("sensor.swembad_power", "W")):
        hass.states.async_set(eid, "100", {"unit_of_measurement": unit, "state_class": "measurement", "friendly_name": eid.split(".")[1].replace("_", " ").title()})
    # 3 days of hourly statistics 60 days ago: house 1 kW, solar 2 kW, pool 0.5 kW
    base = dt_util.start_of_local_day(dt_util.now() - timedelta(days=60))
    for eid, w in (("sensor.load", 1000), ("sensor.pv", 2000), ("sensor.swembad_power", 500)):
        meta = StatisticMetaData(has_mean=True, mean_type=StatisticMeanType.ARITHMETIC, has_sum=False, unit_class=None, name=None, source="recorder", statistic_id=eid, unit_of_measurement="W")
        async_import_statistics(hass, meta, [{"start": (base + timedelta(hours=h)).astimezone(dt_util.UTC), "mean": w, "min": w, "max": w} for h in range(72)])
    await async_wait_recording_done(hass)
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"], "load_power": ["sensor.load"]},
                            options={"cost_loads": ["sensor.swembad_power"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    await async_wait_recording_done(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    c = hass.data[DOMAIN]["controller"]
    d0 = base.date().isoformat()
    assert c.acc.days[d0]["load"] == 24 and c.acc.days[d0]["solar"] == 48 and c.acc.days[d0]["x:sensor.swembad_power"] == 12
    assert c.deep["start"] <= d0

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/costs"})
    r = (await ws.receive_json())["result"]
    assert r["loads"] == [{"entity_id": "sensor.swembad_power", "name": "Swembad"}]
    assert r["periods"]["since"]["loads"]["sensor.swembad_power"] >= 36
    assert len(r["monthly"]) == 24 and len(r["daily"]) == 31
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/costs_settings", "settings": {
        "history_start": "2024-04-01", "battery_price": 65000, "battery_lifetime_kwh": 60000,
        "tariff_history": [{"until": "2025-06-30", "import": 3.2}]}})
    r = await ws.receive_json()
    assert r["success"], r
    assert r["result"]["tariff"]["history"] == [{"until": "2025-06-30", "import": 3.2}]
    await hass.async_block_till_done(wait_background_tasks=True)
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/costs"})
    r = (await ws.receive_json())["result"]
    assert r["battery"]["cost_per_kwh"] == round(65000 / 60000, 2)
    assert r["periods"]["since"]["from"] == min(c.acc.days)
    await hass.config_entries.async_unload(entry.entry_id)
