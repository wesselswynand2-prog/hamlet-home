import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta, timezone

spec = importlib.util.spec_from_file_location("irrigation", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/irrigation.py")
irr = importlib.util.module_from_spec(spec)
sys.modules["irrigation"] = irr
spec.loader.exec_module(irr)

TZ = timezone(timedelta(hours=2))
T0 = datetime(2026, 10, 29, 5, 29, 50, tzinfo=TZ)  # Thursday
ZONES = [
    {"id": "a", "name": "Buite Gras", "entity": "switch.buite_gras", "minutes": 10, "enabled": True},
    {"id": "b", "name": "Binne Tuin", "entity": "switch.binne_tuin", "minutes": 10, "enabled": True},
    {"id": "c", "name": "Binne Gras", "entity": "switch.binne_gras", "minutes": 0, "enabled": True},
    {"id": "d", "name": "Kamer Tuin", "entity": "switch.kamer_tuin", "minutes": 15, "enabled": False},
]


def test_due_programs():
    p = {"id": "p", "enabled": True, "days": [3], "start": "05:30", "zones": []}
    assert irr.due_programs([p], T0, T0 + timedelta(seconds=15)) == [p]
    assert irr.due_programs([p], T0 + timedelta(seconds=15), T0 + timedelta(seconds=30)) == []   # only once
    assert irr.due_programs([{**p, "days": [4]}], T0, T0 + timedelta(seconds=15)) == []         # wrong day
    assert irr.due_programs([{**p, "enabled": False}], T0, T0 + timedelta(seconds=15)) == []


def test_due_across_midnight():
    p = {"id": "p", "enabled": True, "days": [4], "start": "00:00", "zones": []}
    last = datetime(2026, 10, 29, 23, 59, 55, tzinfo=TZ)
    assert irr.due_programs([p], last, last + timedelta(seconds=10)) == [p]


def test_queue_amount_skips_and_limits():
    assert irr.program_queue(None, ZONES, 100, 120) == [["a", 600], ["b", 600]]   # 0 min and disabled skipped
    assert irr.program_queue(None, ZONES, 50, 120) == [["a", 300], ["b", 300]]
    assert irr.program_queue({"zones": ["b"]}, ZONES, 100, 120) == [["b", 600]]
    assert irr.program_queue(None, ZONES, 300, 20) == [["a", 1200], ["b", 1200]]  # capped at max


def test_rain_reason():
    now = T0
    assert irr.rain_reason("rainy", "weather", None, now, True) == "Raining (weather)"
    assert irr.rain_reason("sunny", "weather", None, now, True) is None
    assert irr.rain_reason("on", "binary_sensor", None, now, True) == "Rain sensor is wet"
    assert irr.rain_reason("0.0", "sensor", None, now, True) is None
    assert irr.rain_reason("on", "binary_sensor", None, now, False) is None
    assert "Rain delay" in irr.rain_reason(None, None, now + timedelta(hours=5), now, True)


def test_next_start():
    p = {"id": "p", "enabled": True, "days": [0, 2, 4], "start": "05:30", "zones": []}
    assert irr.next_program_start([p], T0.replace(hour=6)).weekday() == 4


def test_validate_permissions():
    cur = {"zones": ZONES}
    out = irr.validate({"zones": [{**z, "minutes": 12} for z in ZONES]}, cur, admin=False)
    assert out["zones"][0]["minutes"] == 12 and out["zones"][0]["entity"] == "switch.buite_gras"
    for bad in ({"zones": ZONES[:2]}, {"pump_entity": "switch.x"}, {"max_minutes": 10}):
        try:
            irr.validate(bad, cur, admin=False)
            raise AssertionError(bad)
        except ValueError:
            pass
    added = irr.validate({"zones": [*ZONES, {"name": "Voor Tuin", "entity": "switch.voor", "minutes": 8}]}, cur, admin=True)
    assert len(added["zones"]) == 5 and added["zones"][4]["id"]
    try:
        irr.validate({"zones": [{"name": "x", "entity": "not an entity", "minutes": 5}]}, cur, admin=True)
        raise AssertionError
    except ValueError:
        pass
