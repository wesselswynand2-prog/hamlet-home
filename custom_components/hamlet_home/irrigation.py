"""Pure irrigation logic: programs, queues, rain skip, settings validation."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

RAINY = {"rainy", "pouring", "lightning-rainy", "snowy-rainy", "hail"}

DEFAULT_IRRIGATION: dict = {
    "zones": [],              # [{"id", "name", "entity", "minutes", "enabled"}]
    "programs": [],           # [{"id", "enabled", "days", "start", "zones": [ids] (empty = all)}]
    "amount": 100,            # watering amount % applied to every zone time
    "pump_entity": "",        # pump / master valve that runs while a valve is open
    "rain_entity": "",        # rain sensor (binary_sensor / sensor) or weather entity
    "skip_when_raining": True,
    "rain_delay_until": None,  # ISO time – programs skipped until then
    "manual_auto_off": True,  # valve opened by hand closes after its zone time
    "max_minutes": 120,       # hard limit per zone run
}
USER_KEYS = {"zones_minutes", "programs", "amount", "rain_delay_until", "skip_when_raining"}


def parse_hm(value: str) -> int:
    h, m = str(value).split(":")[:2]
    return int(h) * 60 + int(m)


def due_programs(programs: list[dict], last: datetime, now: datetime) -> list[dict]:
    """Programs whose start time fell in (last, now]."""
    out = []
    if now <= last or (now - last) > timedelta(hours=2):
        return out
    for p in programs:
        if not p.get("enabled", True):
            continue
        m = parse_hm(p["start"])
        for day in {last.date(), now.date()}:
            t = datetime.combine(day, datetime.min.time(), tzinfo=now.tzinfo) + timedelta(minutes=m)
            if last < t <= now and t.weekday() in p.get("days", list(range(7))):
                out.append(p)
                break
    return out


def next_program_start(programs: list[dict], now: datetime) -> datetime | None:
    best = None
    for p in programs:
        if not p.get("enabled", True):
            continue
        m = parse_hm(p["start"])
        for offset in range(8):
            day = (now + timedelta(days=offset)).date()
            t = datetime.combine(day, datetime.min.time(), tzinfo=now.tzinfo) + timedelta(minutes=m)
            if t > now and t.weekday() in p.get("days", list(range(7))):
                best = t if best is None or t < best else best
                break
    return best


def zone_seconds(zone: dict, amount: float, max_minutes: float) -> int:
    minutes = min(float(zone.get("minutes", 0)) * amount / 100.0, max_minutes)
    return max(int(round(minutes * 60)), 0)


def program_queue(program: dict | None, zones: list[dict], amount: float, max_minutes: float) -> list[list]:
    """[[zone_id, seconds], …] in zone order; program None = all zones."""
    wanted = set(program.get("zones") or []) if program else set()
    q = []
    for z in zones:
        if not z.get("enabled", True) or not z.get("entity"):
            continue
        if wanted and z["id"] not in wanted:
            continue
        secs = zone_seconds(z, amount, max_minutes)
        if secs > 0:
            q.append([z["id"], secs])
    return q


def rain_reason(rain_state: str | None, rain_domain: str | None, delay_until: datetime | None, now: datetime, skip_when_raining: bool) -> str | None:
    """Why programs are skipped right now, or None."""
    if delay_until is not None and delay_until > now:
        return f"Rain delay until {delay_until.strftime('%a %H:%M')}"
    if not skip_when_raining or rain_state is None:
        return None
    s = str(rain_state).lower()
    if rain_domain == "weather":
        return "Raining (weather)" if s in RAINY else None
    if s in ("on", "wet", "rain", "raining", "true"):
        return "Rain sensor is wet"
    try:
        return "Rain sensor is wet" if float(s) > 0 else None   # rain rate / amount sensors
    except ValueError:
        return None


_ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def validate(new: dict, current: dict, admin: bool) -> dict:
    """Clean a settings update. Non-admins may change times, programs, amount and rain delay only."""
    out: dict = {}
    if "zones" in new:
        zones = []
        old = {z["id"]: z for z in current.get("zones", [])}
        for z in new["zones"]:
            zid = str(z.get("id") or uuid.uuid4().hex[:8])
            minutes = float(z.get("minutes", 10))
            if not 0 <= minutes <= 240:
                raise ValueError("Zone time must be 0–240 minutes")
            if admin:
                entity = str(z.get("entity") or "")
                if entity and not _ENTITY_RE.match(entity):
                    raise ValueError(f"Not a valid entity: {entity}")
                zones.append({"id": zid, "name": str(z.get("name") or "Zone")[:40], "entity": entity,
                              "minutes": minutes, "enabled": bool(z.get("enabled", True))})
            else:
                if zid not in old:
                    raise ValueError("Only an administrator can add or remove valves")
                zones.append({**old[zid], "minutes": minutes, "enabled": bool(z.get("enabled", old[zid].get("enabled", True)))})
        if not admin and len(zones) != len(old):
            raise ValueError("Only an administrator can add or remove valves")
        out["zones"] = zones
    if "programs" in new:
        progs = []
        for p in new["programs"]:
            parse_hm(p["start"])
            days = sorted({int(d) for d in p.get("days", []) if 0 <= int(d) <= 6})
            progs.append({"id": str(p.get("id") or uuid.uuid4().hex[:8]), "enabled": bool(p.get("enabled", True)),
                          "days": days, "start": str(p["start"])[:5], "zones": [str(x) for x in p.get("zones", [])]})
        out["programs"] = progs
    if "amount" in new:
        a = float(new["amount"])
        if not 0 <= a <= 300:
            raise ValueError("Watering amount must be 0–300 %")
        out["amount"] = a
    if "skip_when_raining" in new:
        out["skip_when_raining"] = bool(new["skip_when_raining"])
    if "rain_delay_until" in new:
        out["rain_delay_until"] = new["rain_delay_until"] or None
    for key in ("pump_entity", "rain_entity"):
        if key in new:
            if not admin:
                raise ValueError("Only an administrator can change the pump or rain sensor")
            v = str(new[key] or "")
            if v and not _ENTITY_RE.match(v):
                raise ValueError(f"Not a valid entity: {v}")
            out[key] = v
    for key in ("manual_auto_off",):
        if key in new:
            if not admin:
                raise ValueError("Only an administrator can change this")
            out[key] = bool(new[key])
    if "max_minutes" in new:
        if not admin:
            raise ValueError("Only an administrator can change the maximum time")
        v = float(new["max_minutes"])
        if not 1 <= v <= 480:
            raise ValueError("Maximum time must be 1–480 minutes")
        out["max_minutes"] = v
    return out
