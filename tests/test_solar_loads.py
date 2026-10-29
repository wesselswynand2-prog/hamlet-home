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
