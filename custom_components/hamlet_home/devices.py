"""Shelly devices (heat pump, heater, aircon …) with Timer / Solar / On / Off – pure rules, testable."""
from __future__ import annotations

import re
from typing import Any

try:
    from .water import parse_hm
except ImportError:  # loaded by path in tests
    from water import parse_hm  # type: ignore[no-redef]

KINDS = {
    "heatpump": ("Heat pump", "mdi:heat-pump"),
    "heater": ("Heater", "mdi:radiator"),
    "aircon": ("Aircon", "mdi:air-conditioner"),
    "pump": ("Pump", "mdi:pump"),
    "charger": ("EV / charger", "mdi:ev-station"),
    "other": ("Other", "mdi:power-socket-za"),
}
MODES = ("auto", "solar", "on", "off")
MAX_DEVICES = 12
SWITCH_DOMAINS = ("switch", "input_boolean", "light", "fan", "climate")

DEFAULT_DEVICE: dict[str, Any] = {
    "name": "",
    "kind": "heatpump",
    "switch": "",
    "power": "",              # power sensor (W), optional
    "rated_w": 1500,          # used when there's no power sensor
    "mode": "off",
    "schedules": [{"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": "10:00", "end": "15:00"}],
    "solar_start_w": 1500,    # spare solar (not counting this device) needed before it starts
    "solar_keep_w": 800,      # keeps running while spare solar stays above this
    "hours": 0,               # stop once it ran this long today (0 = no limit)
    "min_switch_s": 300,      # compressor protection: no on/off more often than this
    "stop_deficit_min": 10,   # stop when solar stays below the house load this long (0 = off)
    "stop_discharge_min": 5,  # stop when the battery gives more than discharge_w this long (0 = off)
    "discharge_w": 200,
}
# what clients (non-admins) may change
USER_KEYS = {"mode", "schedules", "solar_start_w", "solar_keep_w", "hours", "stop_deficit_min", "stop_discharge_min", "discharge_w"}


def new_id(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:24] or "device"
    i, cand = 1, base
    while cand in taken:
        i += 1
        cand = f"{base}_{i}"
    return cand


def _schedules(value: Any) -> list[dict]:
    if not isinstance(value, list) or len(value) > 10:
        raise ValueError("Run times must be a list (max 10)")
    out = []
    for s in value:
        parse_hm(s["start"]), parse_hm(s["end"])
        days = sorted({int(d) for d in s.get("days", []) if 0 <= int(d) <= 6})
        out.append({"enabled": bool(s.get("enabled", True)), "days": days, "start": str(s["start"])[:5], "end": str(s["end"])[:5]})
    return out


def validate(new: dict, admin: bool, current: dict | None = None) -> dict:
    """Clean one device's settings. Raises ValueError."""
    out: dict[str, Any] = {}
    for key, value in new.items():
        if key not in DEFAULT_DEVICE:
            continue
        if not admin and key not in USER_KEYS:
            raise ValueError(f"Only an administrator can change '{key}'")
        if key == "name":
            value = str(value).strip()[:40]
            if not value:
                raise ValueError("Give the device a name")
        elif key == "kind":
            if value not in KINDS:
                raise ValueError("Unknown device type")
        elif key == "switch":
            value = str(value or "").strip()
            if not value or value.split(".", 1)[0] not in SWITCH_DOMAINS:
                raise ValueError("Pick the switch (Shelly relay) that runs the device")
        elif key == "power":
            value = str(value or "").strip()
            if value and not value.startswith(("sensor.", "input_number.")):
                raise ValueError("Power must be a sensor in W")
        elif key == "mode":
            if value not in MODES:
                raise ValueError("Unknown mode")
        elif key == "schedules":
            value = _schedules(value)
        elif key in ("rated_w", "solar_start_w", "solar_keep_w"):
            value = float(value)
            if not 0 <= value <= 30000:
                raise ValueError(f"{key} must be 0–30 000 W")
        elif key == "hours":
            value = float(value)
            if not 0 <= value <= 24:
                raise ValueError("Run hours must be 0–24")
        elif key in ("stop_deficit_min", "stop_discharge_min"):
            value = float(value)
            if not 0 <= value <= 240:
                raise ValueError("Stop times must be 0–240 min")
        elif key == "discharge_w":
            value = float(value)
            if not 0 <= value <= 30000:
                raise ValueError("Battery limit must be 0–30 000 W")
        elif key == "min_switch_s":
            value = float(value)
            if not 0 <= value <= 3600:
                raise ValueError("Wait between switches must be 0–3600 s")
        out[key] = value
    merged = {**DEFAULT_DEVICE, **(current or {}), **out}
    if merged["solar_keep_w"] > merged["solar_start_w"]:
        raise ValueError("'Keep running while above' can't be more than 'Start when above'")
    return out
