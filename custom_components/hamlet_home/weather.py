"""Weather tab helpers: find the weather / Solcast entities and read Solcast's detailed forecast (pure)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

DEFAULT_PREFS = {"rain_unit": "auto", "wind_unit": "auto"}
RAIN_UNITS = ("auto", "mm", "in")
WIND_UNITS = ("auto", "km/h", "m/s", "mph", "kn")

# Solcast (BJReplay integration) entity ids, newest names first
SOLCAST = {
    "today": ("sensor.solcast_pv_forecast_forecast_today", "sensor.solcast_forecast_today"),
    "tomorrow": ("sensor.solcast_pv_forecast_forecast_tomorrow", "sensor.solcast_forecast_tomorrow"),
    "remaining": ("sensor.solcast_pv_forecast_forecast_remaining_today", "sensor.solcast_forecast_remaining_today"),
}
FORECAST_SOLAR = {  # Forecast.Solar integration
    "today": ("sensor.energy_production_today",),
    "tomorrow": ("sensor.energy_production_tomorrow",),
    "remaining": ("sensor.energy_production_today_remaining",),
}


def autodetect(entity_ids: list[str]) -> dict[str, Any]:
    """Pick a weather entity and PV forecast sensors from what exists."""
    ids = set(entity_ids)
    weather = sorted(e for e in ids if e.startswith("weather."))
    # prefer a real service over the default home forecast when both exist
    pick = next((w for w in weather if w not in ("weather.home", "weather.forecast_home")), weather[0] if weather else None)
    out: dict[str, Any] = {"weather_entity": pick}
    for key, conf in (("today", "pv_forecast_today"), ("tomorrow", "pv_forecast_tomorrow"), ("remaining", "pv_forecast_remaining")):
        out[conf] = next((e for e in SOLCAST[key] + FORECAST_SOLAR[key] if e in ids), None)
    return out


def _as_dt(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v)
        except ValueError:
            return None
    return None


def detailed(attrs: dict, day: date, tz) -> list[list]:
    """Solcast detailedForecast -> [[minute of day, kW, kW (10 %), kW (90 %)], …] for that local day."""
    out = []
    for item in attrs.get("detailedForecast") or attrs.get("detailed_forecast") or []:
        if not isinstance(item, dict):
            continue
        t = _as_dt(item.get("period_start"))
        if t is None:
            continue
        t = t.astimezone(tz)
        if t.date() != day:
            continue
        try:
            p = float(item.get("pv_estimate", 0) or 0)
        except (TypeError, ValueError):
            continue

        def f(k: str, d: float = p) -> float:
            try:
                return round(float(item.get(k)), 3)
            except (TypeError, ValueError):
                return round(d, 3)

        out.append([t.hour * 60 + t.minute, round(p, 3), f("pv_estimate10"), f("pv_estimate90")])
    return sorted(out)


def remaining_kwh(series: list[list], now_minute: int, step: int = 30) -> float:
    """kWh still to come today from the detailed series (part of the current period counts)."""
    total = 0.0
    for m, kw, *_ in series:
        end = m + step
        if end <= now_minute:
            continue
        frac = 1.0 if m >= now_minute else (end - now_minute) / step
        total += kw * step / 60 * frac
    return round(total, 2)


def validate_prefs(new: dict) -> dict:
    out = {}
    if "rain_unit" in new:
        if new["rain_unit"] not in RAIN_UNITS:
            raise ValueError("Rain unit must be auto, mm or in")
        out["rain_unit"] = new["rain_unit"]
    if "wind_unit" in new:
        if new["wind_unit"] not in WIND_UNITS:
            raise ValueError("Wind unit must be auto, km/h, m/s, mph or kn")
        out["wind_unit"] = new["wind_unit"]
    return out
