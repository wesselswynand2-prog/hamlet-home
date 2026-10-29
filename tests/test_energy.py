import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta

spec = importlib.util.spec_from_file_location(
    "energy", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/energy.py")
energy = importlib.util.module_from_spec(spec)
sys.modules["energy"] = energy
spec.loader.exec_module(energy)

M = energy.Mapping(solar=["pv1", "pv2"], load=["l1"], grid=["g"], battery=["b"], soc=["soc"])
T0 = datetime(2026, 10, 29, 10, 0)


def test_combine_sums_and_inverts():
    v = energy.combine({"pv1": 1000, "pv2": 500, "l1": 800, "g": -200, "b": 300, "soc": 80},
                       energy.Mapping(solar=["pv1", "pv2"], load=["l1"], grid=["g"], battery=["b"], soc=["soc"], battery_invert=True))
    assert v == {"solar": 1500, "load": 800, "grid": -200, "battery": -300, "soc": 80}


def test_combine_derives_load():
    m = energy.Mapping(solar=["pv"], grid=["g"], battery=["b"])
    assert energy.combine({"pv": 3000, "g": 500, "b": 1000}, m)["load"] == 2500
    assert energy.combine({"pv": None, "g": None, "b": None}, m)["load"] is None


def test_accumulator_energy_and_buckets():
    acc = energy.Accumulator()
    acc.set(T0, {"solar": 3000, "load": 1000, "grid": -500, "battery": 1500, "soc": 50})
    acc.set(T0 + timedelta(minutes=30), {"solar": 0, "load": 2000, "grid": 2000, "battery": 0, "soc": 60})
    acc.advance(T0 + timedelta(minutes=60))
    d = acc.days["2026-10-29"]
    assert abs(d["solar"] - 1.5) < 1e-9          # 3 kW for 0.5 h
    assert abs(d["load"] - 1.5) < 1e-9           # 1 kW*0.5 + 2 kW*0.5
    assert abs(d["export"] - 0.25) < 1e-9
    assert abs(d["import"] - 1.0) < 1e-9
    assert abs(d["charge"] - 0.75) < 1e-9
    rows = acc.rows("2026-10-29")
    assert len(rows) == 12 and rows[0] == [600, 3000, 1000, -500, 1500, 50.0]
    assert rows[6][1] == 0 and rows[6][2] == 2000


def test_bucket_time_weighting_within_slot():
    acc = energy.Accumulator()
    acc.set(T0, {"solar": 1000, "load": None, "grid": None, "battery": None, "soc": None})
    acc.set(T0 + timedelta(minutes=1), {"solar": 6000, "load": None, "grid": None, "battery": None, "soc": None})
    acc.advance(T0 + timedelta(minutes=5))
    assert acc.rows("2026-10-29")[0][1] == 5000  # (1*1000 + 4*6000)/5
    assert acc.rows("2026-10-29")[0][2] is None


def test_midnight_split():
    acc = energy.Accumulator()
    t = datetime(2026, 10, 28, 23, 50)
    acc.set(t, {"solar": 0, "load": 1200, "grid": 1200, "battery": 0, "soc": 40})
    acc.advance(t + timedelta(minutes=20))
    assert abs(acc.days["2026-10-28"]["load"] - 0.2) < 1e-9
    assert abs(acc.days["2026-10-29"]["load"] - 0.2) < 1e-9


def test_max_gap_skips_downtime():
    acc = energy.Accumulator(max_gap=600)
    acc.set(T0, {"solar": 1000, "load": 1000, "grid": 0, "battery": 0, "soc": 50})
    acc.advance(T0 + timedelta(hours=2))
    assert acc.days == {}


def test_replay_matches_live():
    events = [
        (T0, "pv1", 2000.0), (T0, "pv2", 0.0), (T0, "l1", 1000.0), (T0, "g", 0.0), (T0, "b", 1000.0), (T0, "soc", 50.0),
        (T0 + timedelta(minutes=15), "pv1", 4000.0),
    ]
    acc = energy.replay(events, M, T0 + timedelta(minutes=30))
    assert abs(acc.days["2026-10-29"]["solar"] - (2 * 0.25 + 4 * 0.25)) < 1e-9


def test_hourly_energy_backfill():
    hours = {T0 + timedelta(hours=h): {"pv1": 2000.0, "l1": 1000.0, "g": -1000.0 if h < 2 else 500.0, "b": 0.0, "soc": 50}
             for h in range(4)}
    d = energy.hourly_energy(hours, M)["2026-10-29"]
    assert d["solar"] == 8 and d["load"] == 4 and d["export"] == 2 and d["import"] == 1


def test_money():
    t = {"import": 3.0, "export": 1.0, "daily_fixed": 5.0}
    r = energy.money({"import": 4, "export": 2, "load": 20}, t)
    assert r["cost"] == 4 * 3 - 2 + 5
    assert r["saved"] == 20 * 3 + 5 - r["cost"]
    assert r["self_sufficiency"] == 80


def test_split_pv_and_inverter():
    m = energy.Mapping(solar=["old_total"], solar_ac=["fronius"], solar_dc=["mppt1", "mppt2"], grid=["g"], battery=["b"], load=["l"])
    v = energy.combine({"old_total": 99999, "fronius": 2000, "mppt1": 1500, "mppt2": 1000, "g": 0, "b": 1800, "l": 2700}, m)
    assert v["solar"] == 4500                 # AC + DC, old total ignored
    assert v["solar_ac"] == 2000 and v["solar_dc"] == 2500
    assert v["inverter"] == 700               # 2.5 kW MPPT - 1.8 kW into battery -> 0.7 kW inverting
    v = energy.combine({"fronius": 3000, "mppt1": 0, "mppt2": 0, "g": 0, "b": 1200, "l": 1800}, m)
    assert v["inverter"] == -1200             # AC PV charging the battery through the inverter
    acc = energy.Accumulator()
    acc.set(T0, v)
    acc.advance(T0 + timedelta(hours=1))
    assert acc.days["2026-10-29"]["solar_ac"] == 3 and acc.days["2026-10-29"]["solar_dc"] == 0


def test_estimate_capacity_from_night_discharge():
    # 10 kWh battery: 1 kW for 4 h at night drops 40 %
    rows = []
    for i in range(48):                          # 20:00 .. 24:00, 5-min rows
        soc = 90 - (i + 0.5) * 40 / 48
        rows.append([20 * 60 + i * 5, 0, 1000, 0, -1000, round(soc, 1)])
    cap = energy.estimate_capacity([rows, []])
    assert 9.5 <= cap <= 10.5
    assert energy.estimate_capacity([[r[:5] + [None] for r in rows]]) is None   # no SoC -> nothing
    assert energy.estimate_capacity([rows[:6]]) is None                        # too small a drop


def test_battery_outlook():
    live = {"soc": 70, "battery": -1500, "load": 2000, "solar": 500, "grid": 0, "grid_available": True}
    o = energy.battery_outlook(live, 10, 20)
    assert o["drain_w"] == 1500 and o["usable_kwh"] == 5 and abs(o["backup_h"] - 3.33) < 0.01
    assert o["state"] == "discharging" and o["full_h"] is None
    # charging from solar: 30 % of 10 kWh at 3 kW -> 1 h; solar covers the house -> no backup time
    o = energy.battery_outlook({"soc": 70, "battery": 3000, "load": 1000, "solar": 4000}, 10, 20)
    assert o["state"] == "charging" and o["full_h"] == 1 and o["backup_h"] is None
    # grid off: uses what the battery actually gives
    o = energy.battery_outlook({"soc": 60, "battery": -800, "load": 900, "solar": 0, "grid_available": False}, 10, 20)
    assert o["grid_off"] and o["drain_w"] == 800 and o["backup_h"] == 5
    # no size known yet
    o = energy.battery_outlook({"soc": 60, "battery": -800, "load": 900}, None, 20)
    assert o["backup_h"] is None and o["drain_w"] == 900
    assert energy.battery_outlook({"soc": 99.8, "battery": 100}, 10, 20)["state"] == "full"
