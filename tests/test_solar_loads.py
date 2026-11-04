import importlib.util
import pathlib
import sys

spec = importlib.util.spec_from_file_location("solar_loads", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/solar_loads.py")
sl = importlib.util.module_from_spec(spec)
sys.modules["solar_loads"] = sl
spec.loader.exec_module(sl)
S = dict(sl.DEFAULT_SOLAR_SETTINGS)


def geyser(running=False, wants=True, via_full=False):
    return {"id": "geyser", "name": "Geyser", "wants": wants, "running": running, "power": 3000, "start_w": 2500, "keep_w": 800, "via_full": via_full}


def pool(running=False, wants=True, via_full=False):
    return {"id": "pool", "name": "Pool", "wants": wants, "running": running, "power": 750, "start_w": 1000, "keep_w": 500, "via_full": via_full}


def test_both_fit():
    r = sl.allocate([geyser(), pool()], 4500, 60, 0, S)
    assert r["geyser"]["grant"] and r["pool"]["grant"]


def test_priority_first_then_leftover():
    # 3 kW spare: geyser (top) gets it, 0 kW left -> pool waits
    r = sl.allocate([geyser(), pool()], 3000, 60, 0, S)
    assert r["geyser"]["grant"] and not r["pool"]["grant"]
    # pool on top: pool takes 750, 2250 left < 2500 -> geyser waits
    r = sl.allocate([pool(), geyser()], 3000, 60, 0, S)
    assert r["pool"]["grant"] and not r["geyser"]["grant"]


def test_small_load_uses_what_big_one_cant():
    r = sl.allocate([geyser(), pool()], 1500, 60, 0, S)
    assert not r["geyser"]["grant"] and r["pool"]["grant"]


def test_solar_drops_bottom_stops_first():
    # both running, spare (if both off) falls to 1.2 kW: geyser keeps (>=800), pool has 1200-3000 < 500 -> stops
    r = sl.allocate([geyser(True), pool(True)], 1200, 60, 0, S)
    assert r["geyser"]["grant"] and not r["pool"]["grant"]
    # user swaps the order: pool kept (1200 >= 500, leaves 450), geyser stopped (450 < 800)
    r = sl.allocate([pool(True), geyser(True)], 1200, 60, 0, S)
    assert r["pool"]["grant"] and not r["geyser"]["grant"]


def test_battery_full_starts_one_at_a_time():
    r = sl.allocate([geyser(), pool()], 200, 97, 0, S)
    assert r["geyser"]["grant"] and r["geyser"]["via_full"] and not r["pool"]["grant"]
    # next round geyser running via full, battery not draining -> pool may start too
    r = sl.allocate([geyser(True, via_full=True), pool()], 200, 96, -100, S)
    assert r["geyser"]["grant"] and r["pool"]["grant"]


def test_battery_draining_sheds_lowest_priority():
    r = sl.allocate([geyser(True, via_full=True), pool(True, via_full=True)], 200, 93, -1500, S)
    assert r["geyser"]["grant"] and not r["pool"]["grant"]
    assert "lowest priority" in r["pool"]["why"]


def test_not_asking():
    r = sl.allocate([geyser(wants=False), pool()], 5000, 60, 0, S)
    assert not r["geyser"]["grant"] and r["pool"]["grant"]


def test_ordered():
    loads = {"pool": pool(), "geyser": geyser(), "new": {**pool(), "id": "new"}}
    assert [l["id"] for l in sl.ordered(loads, ["pool", "geyser"])] == ["pool", "geyser", "new"]


def test_timed_stop_rules():
    from datetime import datetime, timedelta, timezone
    t0 = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
    load = {**pool(True), "stop_deficit_min": 10, "stop_discharge_min": 5, "discharge_w": 200}
    timers: dict = {}

    def run(t, solar, house, batt, grant=True, via_full=False, running=True):
        l = {**load, "running": running}
        res = {"pool": {"grant": grant, "via_full": via_full, "why": "spare solar"}}
        return sl.apply_stop_rules([l], res, timers, t, solar, house, batt)["pool"]

    # solar below the house load: keeps running for 10 min, then stops
    assert run(t0, 2000, 2600, -100)["grant"]
    assert run(t0 + timedelta(minutes=9), 2000, 2600, -100)["grant"]
    r = run(t0 + timedelta(minutes=10), 2000, 2600, -100)
    assert not r["grant"] and "below the house load for 10 min" in r["why"]
    # blocked from restarting for 10 min, even with plenty of sun
    r = run(t0 + timedelta(minutes=15), 5000, 1500, 500, running=False)
    assert not r["grant"] and "may start again in 5 min" in r["why"]
    assert run(t0 + timedelta(minutes=21), 5000, 1500, 500, running=False)["grant"]
    # a short dip resets the timer
    timers.clear()
    run(t0, 2000, 2600, 0)
    run(t0 + timedelta(minutes=8), 3000, 2600, 0)          # sun back: timer reset
    assert run(t0 + timedelta(minutes=12), 2000, 2600, 0)["grant"]
    # battery discharging more than 200 W for 5 min -> stop; 150 W doesn't count
    timers.clear()
    assert run(t0, 3000, 2900, -150)["grant"]
    assert run(t0 + timedelta(minutes=6), 3000, 2900, -150)["grant"]
    run(t0 + timedelta(minutes=6), 3000, 2900, -900)
    r = run(t0 + timedelta(minutes=11), 3000, 2900, -900)
    assert not r["grant"] and "battery giving 0.9 kW for 5 min" in r["why"]
    # running on "battery full" is meant to use the battery: discharge rule doesn't apply
    timers.clear()
    run(t0, 3000, 2900, -900, via_full=True)
    assert run(t0 + timedelta(minutes=30), 3000, 2900, -900, via_full=True)["grant"]
    # 0 = rule off
    timers.clear()
    load.update(stop_deficit_min=0, stop_discharge_min=0)
    run(t0, 1000, 3000, -2000)
    assert run(t0 + timedelta(hours=2), 1000, 3000, -2000)["grant"]
