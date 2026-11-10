import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta

spec = importlib.util.spec_from_file_location("water", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/water.py")
water = importlib.util.module_from_spec(spec)
sys.modules["water"] = water
spec.loader.exec_module(water)

S = dict(water.DEFAULT_WATER_SETTINGS)
T0 = datetime(2026, 10, 29, 9, 0)  # Thursday


def test_pool_schedule():
    sch = [{"enabled": True, "days": [3], "start": "10:00", "end": "14:00"}]
    assert water.pool_desired("auto", sch, T0) == (False, "Next run 10:00")
    assert water.pool_desired("auto", sch, T0.replace(hour=11))[0]
    assert water.pool_desired("auto", sch, T0.replace(hour=15))[1] == "Next run Thu 10:00"
    assert water.pool_desired("on", sch, T0)[0] and not water.pool_desired("off", sch, T0.replace(hour=11))[0]


def test_is_running_prefers_measurements():
    assert water.is_running(True, 5, None, 20) is False      # switch on but no draw
    assert water.is_running(False, None, 42, 20) is True     # VSD Hz
    assert water.is_running(True, None, None, 20) is True


def test_dry_run_trip_after_delay():
    g, s = water.Guard(), {**S, "dry_run_enabled": True, "dry_run_bar": 0.5, "dry_run_seconds": 60}
    assert g.check(T0, True, 0.2, s) == []
    assert g.check(T0 + timedelta(seconds=30), True, 0.2, s) == []
    assert g.check(T0 + timedelta(seconds=61), True, 0.2, s) == ["dry_run"] and g.tripped
    assert g.check(T0 + timedelta(seconds=90), True, 0.2, s) == []  # only once
    g.reset()
    assert not g.tripped


def test_dry_run_resets_when_pressure_builds():
    g, s = water.Guard(), {**S, "dry_run_enabled": True}
    g.check(T0, True, 0.2, s)
    g.check(T0 + timedelta(seconds=40), True, 2.5, s)
    assert g.check(T0 + timedelta(seconds=70), True, 0.2, s) == []


def test_long_run_and_low_pressure_alerts():
    g, s = water.Guard(), {**S, "long_run_minutes": 30, "low_pressure_bar": 1.0}
    g.check(T0, True, 3.0, s)
    assert g.check(T0 + timedelta(minutes=31), True, 3.0, s) == ["long_run"]
    g.check(T0 + timedelta(minutes=32), False, 0.5, s)
    assert g.check(T0 + timedelta(minutes=35), False, 0.5, s) == ["low_pressure"]
    assert g.check(T0 + timedelta(minutes=36), False, 3.0, s) == ["pressure_ok"]


def test_run_counter_starts_and_time():
    rc = water.RunCounter()
    rc.update(T0, False)
    rc.update(T0 + timedelta(minutes=1), True)
    rc.update(T0 + timedelta(minutes=4), False)
    rc.update(T0 + timedelta(minutes=5), True)
    rc.update(T0 + timedelta(minutes=6), False)
    d = rc.days["2026-10-29"]
    assert d["starts"] == 2 and d["seconds"] == 240 and d["longest"] == 180


def test_pressure_buckets():
    pb = water.PressureBuckets()
    pb.set(T0, 3.0, True, False)
    pb.set(T0 + timedelta(minutes=1), 2.0, False, True)
    pb.advance(T0 + timedelta(minutes=5))
    assert pb.rows("2026-10-29") == [[540, 2.2, 2.0, 0.2, 0.8]]


def test_validate():
    assert water.validate_water_settings({"pool_mode": "on"}, admin=False) == {"pool_mode": "on"}
    for bad in ({"dry_run_enabled": True}, ):
        try:
            water.validate_water_settings(bad, admin=False)
            raise AssertionError
        except ValueError:
            pass
    try:
        water.validate_water_settings({"notify_service": "mobile"}, admin=True)
        raise AssertionError
    except ValueError:
        pass


def test_pool_solar_mode():
    sch = [{"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": "08:00", "end": "17:00"}]
    noon = T0.replace(hour=12)
    assert water.pool_desired("solar", sch, noon, True, "spare solar 2.0 kW", 1.0, 6)[0]
    on, why = water.pool_desired("solar", sch, noon, False, "needs 0.4 kW more solar", 1.0, 6)
    assert not on and "Waiting for solar" in why and "1.0/6 h" in why
    on, why = water.pool_desired("solar", sch, noon, True, "", 6.2, 6)
    assert not on and "Done for today" in why
    on, why = water.pool_desired("solar", sch, T0.replace(hour=18), True, "", 1, 6)
    assert not on and "Outside solar hours" in why
    assert water.pool_solar_wants([], noon, 0, 0) == (True, "")   # no hours set -> any time


def test_flow_estimate_from_curve():
    c = water.DEFAULT_WATER_SETTINGS["flow_curve"]
    assert water.estimate_flow(50, 3.5, c) == 2.9545               # 35.7 m head on the 50 Hz curve
    assert water.estimate_flow(50, 4.5, c) == 0.0                  # above shut-off head: nothing flows
    assert water.estimate_flow(15, 2.0, c) == 0.0                  # below the minimum frequency
    assert water.estimate_flow(50, 1.0, c) == 4.8                  # off the end of the curve: max flow
    assert water.estimate_flow(40, 2.5, c) == 1.4803               # affinity laws at 40 Hz
    assert water.estimate_flow(50, None, c) is None
    assert water.estimate_flow(50, 3.5, c, cal=1.1) == round(2.9545 * 1.1, 4) or abs(water.estimate_flow(50, 3.5, c, cal=1.1) - 3.25) < 0.01


def test_flow_settings_validation():
    assert water.validate_water_settings({"flow_curve": [[2, 30], [0, 40]]}, True)["flow_curve"] == [[0, 40], [2, 30]]
    for bad in ({"flow_curve": [[0, 40]]}, {"flow_curve": [[0, 30], [2, 40]]}, {"flow_cal": 9}, {"flow_sensor": "switch.x"}):
        try:
            water.validate_water_settings(bad, True)
            raise AssertionError(bad)
        except ValueError:
            pass


def test_water_meter_per_valve_and_house():
    m = water.WaterMeter()
    m.update(T0, 1.2, ("roses",))                                 # 20 L/min
    m.update(T0 + timedelta(minutes=5), 1.2, ("roses",))
    m.update(T0 + timedelta(minutes=10), 1.2, ("roses", "lawn"))  # 200 L on roses
    m.update(T0 + timedelta(minutes=11), 1.2, ())                 # 10 L each while both open
    m.update(T0 + timedelta(minutes=12), 0.0, ())                 # 20 L house
    d = m.days[T0.date().isoformat()]
    assert round(d["l"]) == 240 and round(d["zones"]["roses"]) == 210 and round(d["zones"]["lawn"]) == 10 and round(d["house"]) == 20
    assert round(m.last["roses"]["l"]) == 210 and round(m.total_l) == 240
    m.update(T0 + timedelta(hours=5), 1.2, ("roses",))              # long gap with no flow: nothing added
    assert round(m.total_l) == 240 and m.last["roses"]["l"] == 0   # a new run starts at zero
    p = m.period(T0.date().isoformat(), T0.date().isoformat())
    assert round(p["l"]) == 240 and round(p["zones"]["roses"]) == 210


def test_tank_from_borehole_float():
    t = water.TankModel()
    m = lambda n: T0 + timedelta(minutes=n)  # noqa: E731
    t.update(m(0), False, 0, 2500, 67)
    assert t.level_l is None                                   # unknown until the float switches
    t.update(m(1), True, 0, 2500, 67)                          # borehole on: tank at 2/3
    assert t.filling and round(t.level_l) == 1675
    t.update(m(11), True, 100, 2500, 67)                       # 100 L used meanwhile, no yield learnt yet
    assert round(t.level_l) == 1575
    t.update(m(41), False, 100, 2500, 67)                      # full after 40 min: (825 + 100) L in
    assert t.level_l == 2500 and not t.filling and t.inflow_lpm == round(925 / 40, 2)
    t.update(m(60), False, 700, 2500, 67)                      # house used 600 L
    assert round(t.level_l) == 1900
    t.update(m(61), True, 700, 2500, 67)                       # float drops: snaps to the refill level
    assert round(t.level_l) == 1675
    t.update(m(63), True, 700, 2500, 67)                       # learnt yield adds ~23 L/min
    assert round(t.level_l) == round(1675 + 2 * 925 / 40)
    t.update(m(62 + 40), False, 700, 2500, 67)
    assert len(t.fills) == 2 and t.usual_fill_min() >= 40
    d = t.to_dict(); t2 = water.TankModel(); t2.load(d)
    assert t2.level_l == 2500 and t2.inflow_lpm == t.inflow_lpm and t2.fills == t.fills
