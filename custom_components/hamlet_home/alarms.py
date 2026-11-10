"""Alarms: ready-made checks the client switches on and sets (pure rules, testable).

Each rule: {"id", "type", "enabled", "name", "value", "minutes", "time", "entity", "op", "geyser"}.
`check(rule, ctx)` says whether the rule's condition is true right now and gives the reading for the message.
The controller adds the "for X minutes" timing, the pop-up and the phone push.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

# type -> (title, unit, default value, default minutes, level, needs, help)
PRESETS: dict[str, dict[str, Any]] = {
    "battery_current": {"name": "Battery current too high", "unit": "A", "value": 150, "minutes": 0.5, "level": "critical", "needs": "battery_current",
                        "help": "Charge or discharge current above this (both directions)."},
    "battery_power": {"name": "Battery power too high", "unit": "W", "value": 6000, "minutes": 1, "level": "critical", "needs": "battery",
                      "help": "Battery charging or discharging faster than this."},
    "load_high": {"name": "Too much load", "unit": "W", "value": 7000, "minutes": 2, "level": "warning", "needs": "load",
                  "help": "The house uses more than this – e.g. the inverter could overload."},
    "soc_low": {"name": "Battery low", "unit": "%", "value": 25, "minutes": 2, "level": "warning", "needs": "soc",
                "help": "Battery below this charge."},
    "grid_down": {"name": "Grid power off", "unit": "", "value": None, "minutes": 1, "level": "info", "needs": "grid",
                  "help": "Load-shedding or a power failure."},
    "geyser_cold": {"name": "Geyser not hot enough", "unit": "°C", "value": 50, "minutes": 0, "time": "17:00", "level": "warning", "needs": "geyser",
                    "help": "After this time of day the geyser is still below this temperature."},
    "pump_trip": {"name": "Booster pump tripped", "unit": "", "value": None, "minutes": 0, "level": "critical", "needs": "pump",
                  "help": "The booster pump was stopped by its dry-run / no-water protection."},
    "inverter_fault": {"name": "Inverter fault", "unit": "", "value": None, "minutes": 0, "level": "critical", "needs": "inverter_state",
                       "help": "The inverter reports a fault, alarm or overload."},
    "tank_low": {"name": "Water tank low", "unit": "%", "value": 30, "minutes": 2, "level": "warning", "needs": "tank",
                 "help": "The water tank is below this level."},
    "borehole_long": {"name": "Borehole running too long", "unit": "", "value": None, "minutes": 0, "level": "warning", "needs": "borehole",
                      "help": "The borehole has been filling the tank much longer than usual – it may be running dry, or a pipe or float may be leaking."},
    "sensor": {"name": "Own alarm", "unit": "", "value": 0, "minutes": 1, "level": "warning", "needs": "",
               "help": "Any sensor or switch: above / below a value, or on."},
}
OPS = ("above", "below", "on", "off", "equals")
MAX_RULES = 30
FAULT = re.compile(r"fault|alarm|error|overload|over ?temp|low battery|shutdown", re.I)


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _hm(text: str) -> int:
    h, m = str(text or "00:00")[:5].split(":")
    h, m = int(h), int(m)
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError("Time must be HH:MM")
    return h * 60 + m


def new_rule(rtype: str) -> dict:
    if rtype not in PRESETS:
        raise ValueError("Unknown alarm type")
    p = PRESETS[rtype]
    return {"id": uuid.uuid4().hex[:10], "type": rtype, "enabled": True, "name": p["name"], "value": p["value"],
            "minutes": p["minutes"], "time": p.get("time", ""), "entity": "", "op": "above", "geyser": ""}


def validate_rule(r: dict) -> dict:
    rtype = r.get("type")
    if rtype not in PRESETS:
        raise ValueError("Unknown alarm type")
    p = PRESETS[rtype]
    out = {"id": str(r.get("id") or uuid.uuid4().hex[:10])[:20], "type": rtype, "enabled": bool(r.get("enabled", True)),
           "name": (str(r.get("name") or p["name"]).strip() or p["name"])[:50]}
    minutes = _num(r.get("minutes", p["minutes"]))
    if minutes is None or not 0 <= minutes <= 1440:
        raise ValueError("‘For how long’ must be 0–1440 minutes")
    out["minutes"] = minutes
    if p["value"] is None and rtype != "sensor":
        out["value"] = None
    else:
        v = _num(r.get("value", p["value"]))
        if v is None and not (rtype == "sensor" and r.get("op") in ("on", "off", "equals")):
            raise ValueError(f"Give a number for “{out['name']}”")
        out["value"] = v if v is not None else r.get("value")
    out["time"] = ""
    if rtype == "geyser_cold":
        _hm(r.get("time") or "17:00")
        out["time"] = str(r.get("time") or "17:00")[:5]
        out["geyser"] = str(r.get("geyser") or "")
    else:
        out["geyser"] = ""
    out["entity"], out["op"] = "", "above"
    if rtype == "sensor":
        ent = str(r.get("entity") or "").strip()
        if "." not in ent:
            raise ValueError("Pick the sensor or switch for your own alarm")
        op = r.get("op") or "above"
        if op not in OPS:
            raise ValueError("Unknown condition")
        out["entity"], out["op"] = ent, op
        if op == "equals":
            out["value"] = str(r.get("value") if r.get("value") is not None else "")[:40]
    return out


def validate_rules(rules: list) -> list[dict]:
    if not isinstance(rules, list) or len(rules) > MAX_RULES:
        raise ValueError(f"At most {MAX_RULES} alarms")
    return [validate_rule(r) for r in rules]


def check(rule: dict, ctx: dict) -> tuple[bool | None, str]:
    """True = condition met now, False = fine, None = can't tell (sensor missing). Plus the reading for the message.

    ctx keys: battery_current (A), battery (W, + charging), load (W), soc (%), grid_available (bool|None),
    geysers: [{entry_id, name, temp}], pump_tripped (bool|None), inverter_state (str|None),
    minutes_now (minutes since midnight), states: {entity_id: (state, unit)}.
    """
    t, v = rule["type"], rule.get("value")
    if t == "battery_current":
        a = ctx.get("battery_current")
        if a is None:
            return None, ""
        return abs(a) > v, f"{abs(a):.0f} A {'charging' if a > 0 else 'discharging'} (limit {v:.0f} A)"
    if t == "battery_power":
        w = ctx.get("battery")
        if w is None:
            return None, ""
        return abs(w) > v, f"{abs(w) / 1000:.1f} kW {'charging' if w > 0 else 'discharging'} (limit {v / 1000:.1f} kW)"
    if t == "load_high":
        w = ctx.get("load")
        if w is None:
            return None, ""
        return w > v, f"House load {w / 1000:.1f} kW (limit {v / 1000:.1f} kW)"
    if t == "soc_low":
        s = ctx.get("soc")
        if s is None:
            return None, ""
        return s < v, f"Battery at {s:.0f}% (alarm below {v:.0f}%)"
    if t == "grid_down":
        g = ctx.get("grid_available")
        if g is None:
            return None, ""
        return g is False, "Grid power is off" if g is False else ""
    if t == "geyser_cold":
        geys = [g for g in ctx.get("geysers", []) if not rule.get("geyser") or g.get("entry_id") == rule["geyser"]]
        geys = [g for g in geys if g.get("temp") is not None]
        if not geys:
            return None, ""
        if ctx.get("minutes_now", 0) < _hm(rule.get("time") or "17:00"):
            return False, ""
        cold = [g for g in geys if g["temp"] < v]
        return bool(cold), " · ".join(f"{g['name']} {g['temp']:.0f}°C" for g in cold) + (f" (wanted {v:.0f}°C by {rule.get('time')})" if cold else "")
    if t == "pump_trip":
        p = ctx.get("pump_tripped")
        if p is None:
            return None, ""
        return bool(p), "Stopped by the dry-run protection – check the water supply, then Reset on the Irrigation tab" if p else ""
    if t == "inverter_fault":
        s = ctx.get("inverter_state")
        if not s:
            return None, ""
        return bool(FAULT.search(s)), f"Inverter state: {s}"
    if t == "tank_low":
        lv = ctx.get("tank")
        if lv is None:
            return None, ""
        return lv < v, f"Tank at {lv:.0f}% (alarm below {v:.0f}%)"
    if t == "borehole_long":
        b = ctx.get("borehole_long")
        if b is None:
            return None, ""
        return bool(b), f"The borehole has been running {ctx.get('borehole_min') or 0:.0f} min – check that it still pumps water" if b else ""
    if t == "sensor":
        st = ctx.get("states", {}).get(rule.get("entity"))
        if st is None or st[0] in ("unavailable", "unknown", ""):
            return None, ""
        state, unit = st
        op = rule.get("op", "above")
        if op in ("on", "off"):
            on = str(state).lower() in ("on", "open", "true", "home", "detected", "problem", "unlocked")
            return (on if op == "on" else not on), f"{state}"
        if op == "equals":
            return str(state).strip().lower() == str(v).strip().lower(), f"{state}"
        x = _num(state)
        if x is None or v is None:
            return None, ""
        return (x > v if op == "above" else x < v), f"{x:g}{(' ' + unit) if unit else ''} ({op} {v:g}{(' ' + unit) if unit else ''})"
    return None, ""
