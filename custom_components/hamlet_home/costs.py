"""Costs tab maths: totals and rand per period, monthly / daily series, load breakdown, battery life (pure)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

try:
    from .energy import LOAD_PREFIX, tariff_for
except ImportError:  # loaded by path in tests
    from energy import LOAD_PREFIX, tariff_for  # type: ignore[no-redef]

KWH = ("load", "solar", "import", "export", "charge", "discharge")
DEFAULT_COSTS = {
    "history_start": None,        # "2024-04-01": count totals from here (and read statistics back to it)
    "battery_price": None,        # R paid for the battery bank
    "battery_lifetime_kwh": None, # kWh it is good for (cycles x usable kWh, from the datasheet)
    "battery_installed": None,    # "2024-04-01"
}


def day_money(totals: dict, tariff: dict, day: str) -> dict[str, float]:
    t = tariff_for(tariff, day)
    imp, exp = totals.get("import", 0.0), totals.get("export", 0.0)
    fixed = t.get("daily_fixed", 0.0) or 0.0
    price = t.get("import", 0.0) or 0.0
    grid_cost = imp * price - exp * (t.get("export", 0.0) or 0.0) + fixed
    load_value = totals.get("load", 0.0) * price + fixed
    return {
        "grid_cost": grid_cost,                                   # what Eskom / the municipality charged
        "load_value": load_value,                                 # what the house would cost all from the grid
        "solar_value": totals.get("solar", 0.0) * price,          # PV kWh at the grid price
        "battery_value": totals.get("discharge", 0.0) * price,    # battery kWh at the grid price
        "export_credit": exp * (t.get("export", 0.0) or 0.0),
        "saved": max(load_value - grid_cost, 0.0),
    }


def summarize(days: dict[str, dict], tariff: dict, d0: str, d1: str) -> dict[str, Any]:
    """Totals for d0..d1 inclusive (YYYY-MM-DD)."""
    out: dict[str, Any] = {k: 0.0 for k in KWH}
    money = {k: 0.0 for k in ("grid_cost", "load_value", "solar_value", "battery_value", "export_credit", "saved")}
    loads: dict[str, float] = {}
    n = 0
    for d, tot in days.items():
        if not d0 <= d <= d1:
            continue
        n += 1
        for k in KWH:
            out[k] += tot.get(k, 0.0) or 0.0
        for k, v in tot.items():
            if k.startswith(LOAD_PREFIX):
                loads[k[len(LOAD_PREFIX):]] = loads.get(k[len(LOAD_PREFIX):], 0.0) + (v or 0.0)
        for k, v in day_money(tot, tariff, d).items():
            money[k] += v
    out = {k: round(v, 2) for k, v in out.items()}
    out.update({k: round(v, 2) for k, v in money.items()})
    out["loads"] = {k: round(v, 2) for k, v in loads.items()}
    out["days"] = n
    out["from"], out["to"] = d0, d1
    out["self_sufficiency"] = round(max(min((out["load"] - out["import"]) / out["load"], 1), 0) * 100) if out["load"] > 0.05 else None
    return out


def periods(days: dict, tariff: dict, today: date, since: str | None) -> dict[str, dict]:
    t = today.isoformat()
    m0 = today.replace(day=1)
    pm_end = m0 - timedelta(days=1)
    pm0 = pm_end.replace(day=1)
    # the same part of last month (1st .. same day), for a fair up / down arrow
    pm_same = min(pm0.replace(day=min(today.day, pm_end.day)), pm_end)
    first = min(days) if days else t
    start = max(since, first) if since else first
    y = (today - timedelta(days=1)).isoformat()
    return {
        "today": summarize(days, tariff, t, t),
        "yesterday": summarize(days, tariff, y, y),
        "month": summarize(days, tariff, m0.isoformat(), t),
        "last_month_same": summarize(days, tariff, pm0.isoformat(), pm_same.isoformat()),
        "last_month": summarize(days, tariff, pm0.isoformat(), pm_end.isoformat()),
        "year": summarize(days, tariff, today.replace(month=1, day=1).isoformat(), t),
        "since": summarize(days, tariff, start, t),
    }


def daily(days: dict, tariff: dict, today: date, n: int = 14) -> list[dict]:
    out = []
    for i in range(n - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        tot = days.get(d)
        if tot is None:
            out.append({"day": d})
            continue
        row = {"day": d, **{k: round(tot.get(k, 0.0) or 0.0, 2) for k in KWH}}
        row.update({k: round(v, 2) for k, v in day_money(tot, tariff, d).items()})
        out.append(row)
    return out


def monthly(days: dict, tariff: dict, today: date, n: int = 12) -> list[dict]:
    out = []
    y, m = today.year, today.month
    months = []
    for _ in range(n):
        months.append((y, m))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    for y, m in reversed(months):
        d0 = date(y, m, 1)
        d1 = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
        s = summarize(days, tariff, d0.isoformat(), min(d1, today).isoformat())
        row = {"month": f"{y}-{m:02d}", "days": s["days"]}
        if s["days"]:
            row.update({k: s[k] for k in (*KWH, "grid_cost", "load_value", "solar_value", "battery_value", "saved")})
        out.append(row)
    return out


def battery_life(days: dict, settings: dict, tariff: dict, today: date) -> dict | None:
    """Battery cost per kWh, life used and left. None until price and lifetime are set."""
    price, life = settings.get("battery_price"), settings.get("battery_lifetime_kwh")
    if not price or not life:
        return None
    since = settings.get("battery_installed") or (min(days) if days else today.isoformat())
    used = sum((v.get("discharge", 0.0) or 0.0) for d, v in days.items() if d >= since)
    have = sorted(d for d in days if d >= since)
    # average from the last 30 days that have data (falls back to all days)
    recent = [days[d].get("discharge", 0.0) or 0.0 for d in have[-31:-1] or have]
    per_day = sum(recent) / len(recent) if recent else 0.0
    left = max(life - used, 0.0)
    cost_kwh = price / life
    value = sum((v.get("discharge", 0.0) or 0.0) * (tariff_for(tariff, d).get("import", 0.0) or 0.0) for d, v in days.items() if d >= since)
    days_left = left / per_day if per_day > 0.05 else None
    data_days = len(have)
    return {
        "since": since,
        "data_days": data_days,
        "used_kwh": round(used, 1),
        "left_kwh": round(left, 1),
        "life_used_pct": round(min(used / life, 1) * 100, 1),
        "cost_per_kwh": round(cost_kwh, 2),
        "cost_used": round(used * cost_kwh, 2),          # battery wear paid for so far
        "value_left": round(left * cost_kwh, 2),          # "Batt koste oor"
        "value_delivered": round(value, 2),               # its kWh at the grid price
        "per_day_kwh": round(per_day, 2),
        "days_left": round(days_left) if days_left is not None else None,
        "years_left": round(days_left / 365.25, 1) if days_left is not None else None,
    }


def validate(new: dict) -> dict:
    out: dict[str, Any] = {}
    for key in ("history_start", "battery_installed"):
        if key in new:
            v = new[key]
            if v in (None, ""):
                out[key] = None
            else:
                try:
                    out[key] = date.fromisoformat(str(v)).isoformat()
                except ValueError as err:
                    raise ValueError(f"{key}: use a date like 2024-04-01") from err
    for key, lo, hi in (("battery_price", 0, 10_000_000), ("battery_lifetime_kwh", 1, 100_000_000)):
        if key in new:
            v = new[key]
            if v in (None, "", 0):
                out[key] = None
            else:
                v = float(v)
                if not lo <= v <= hi:
                    raise ValueError(f"{key} is out of range")
                out[key] = v
    return out


def validate_history(hist: list) -> list[dict]:
    """Earlier prices: [{"until": "2025-06-30", "import": 3.1, "export": 0, "daily_fixed": 0}]."""
    if not isinstance(hist, list) or len(hist) > 30:
        raise ValueError("Price history must be a list (max 30)")
    out = []
    for h in hist:
        try:
            until = date.fromisoformat(str(h["until"])).isoformat()
            row = {"until": until}
            for k in ("import", "export", "daily_fixed"):
                if h.get(k) not in (None, ""):
                    v = float(h[k])
                    if not 0 <= v <= 1000:
                        raise ValueError
                    row[k] = v
        except (KeyError, TypeError, ValueError) as err:
            raise ValueError("Each earlier price needs an end date and prices between 0 and 1000") from err
        if "import" not in row:
            raise ValueError("Each earlier price needs a buying price")
        out.append(row)
    return sorted(out, key=lambda r: r["until"])
