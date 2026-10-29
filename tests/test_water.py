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
