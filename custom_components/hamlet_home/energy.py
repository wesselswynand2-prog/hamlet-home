"""Pure energy maths (no Home Assistant imports, so it is unit-testable).

Conventions after `combine()`:
  solar   >= 0  W produced by PV
  load    >= 0  W used by the house
  grid    W, + importing / - exporting
  battery W, + charging  / - discharging
  soc     %   battery state of charge
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

SERIES = ("solar", "load", "grid", "battery", "soc")
BUCKET_MIN = 5
ENERGY_KEYS = ("solar", "load", "import", "export", "charge", "discharge", "solar_ac", "solar_dc")


@dataclass
class Mapping:
    solar: list[str] = field(default_factory=list)
    load: list[str] = field(default_factory=list)
    grid: list[str] = field(default_factory=list)
    battery: list[str] = field(default_factory=list)
    soc: list[str] = field(default_factory=list)
    solar_ac: list[str] = field(default_factory=list)  # grid-tie / AC-coupled PV inverter
    solar_dc: list[str] = field(default_factory=list)  # MPPTs on the DC bus
    battery_invert: bool = False
    grid_invert: bool = False

    def all_entities(self) -> list[str]:
        return [*self.solar, *self.solar_ac, *self.solar_dc, *self.load, *self.grid, *self.battery, *self.soc]

    @property
    def split_pv(self) -> bool:
        return bool(self.solar_ac or self.solar_dc)


def _sum(raw: dict[str, float | None], ids: list[str]) -> float | None:
    vals = [raw.get(i) for i in ids]
    vals = [v for v in vals if v is not None]
    return sum(vals) if vals else None


def combine(raw: dict[str, float | None], m: Mapping) -> dict[str, float | None]:
    """Raw entity values (already in W / %) -> normalised series."""
    solar_ac = _sum(raw, m.solar_ac)
    solar_dc = _sum(raw, m.solar_dc)
    if m.split_pv:
        # AC + DC PV mapped separately: total is their sum (the plain solar field is ignored to avoid double counting)
        solar = None if solar_ac is None and solar_dc is None else max(solar_ac or 0, 0) + max(solar_dc or 0, 0)
    else:
        solar = _sum(raw, m.solar)
    grid = _sum(raw, m.grid)
    battery = _sum(raw, m.battery)
    if grid is not None and m.grid_invert:
        grid = -grid
    if battery is not None and m.battery_invert:
        battery = -battery
    soc = _sum(raw, m.soc[:1])
    load = _sum(raw, m.load)
    if load is None and (solar is not None or grid is not None or battery is not None):
        # energy balance: what comes in minus what goes into the battery
        if solar is not None or grid is not None:
            load = max((solar or 0) + (grid or 0) - (battery or 0), 0.0)
    if solar is not None:
        solar = max(solar, 0.0)
    out = {"solar": solar, "load": load, "grid": grid, "battery": battery, "soc": soc}
    if m.split_pv:
        out["solar_ac"] = None if solar_ac is None else max(solar_ac, 0.0)
        out["solar_dc"] = None if solar_dc is None else max(solar_dc, 0.0)
        # inverter (DC bus -> AC house): + inverting, - charging from AC
        if battery is not None or solar_dc is not None:
            out["inverter"] = max(solar_dc or 0, 0) - (battery or 0)
    return out


def day_key(t: datetime) -> str:
    return t.date().isoformat()


def slot_of(t: datetime) -> int:
    return (t.hour * 60 + t.minute) // BUCKET_MIN * BUCKET_MIN


class Accumulator:
    """Time-weighted integration of the series into 5-minute buckets and daily kWh.

    Feed it values with `set(t, values)`; every call first integrates the previous
    values from the last timestamp up to `t`.  Timestamps must be local-time aware
    datetimes and non-decreasing.
    """

    def __init__(self, max_gap: float | None = None) -> None:
        self.values: dict[str, float | None] = {k: None for k in SERIES}
        self.last_t: datetime | None = None
        self.max_gap = max_gap  # seconds; longer gaps are not integrated (HA was down)
        # buckets[day][slot] = {series: [weighted_sum, seconds]}
        self.buckets: dict[str, dict[int, dict[str, list[float]]]] = {}
        self.days: dict[str, dict[str, float]] = {}

    # -------------------------------------------------------------- feeding
    def set(self, t: datetime, values: dict[str, float | None]) -> None:
        self.advance(t)
        self.values = dict(values)

    def advance(self, t: datetime) -> None:
        if self.last_t is None:
            self.last_t = t
            return
        if t <= self.last_t:
            return
        gap = (t - self.last_t).total_seconds()
        if self.max_gap is not None and gap > self.max_gap:
            self.last_t = t
            return
        start = self.last_t
        while start < t:
            # split at bucket boundaries (which also split days)
            slot = slot_of(start)
            bucket_start = start.replace(hour=slot // 60, minute=slot % 60, second=0, microsecond=0)
            bucket_end = bucket_start + timedelta(minutes=BUCKET_MIN)
            end = min(t, bucket_end)
            self._integrate(start, end, slot)
            start = end
        self.last_t = t

    def _integrate(self, start: datetime, end: datetime, slot: int) -> None:
        secs = (end - start).total_seconds()
        if secs <= 0:
            return
        day = day_key(start)
        bucket = self.buckets.setdefault(day, {}).setdefault(slot, {})
        for key, value in self.values.items():
            if value is None:
                continue
            acc = bucket.setdefault(key, [0.0, 0.0])
            acc[0] += value * secs
            acc[1] += secs
        hours = secs / 3600
        e = self.days.setdefault(day, {k: 0.0 for k in ENERGY_KEYS})
        v = self.values
        if v.get("solar") is not None:
            e["solar"] += max(v["solar"], 0) * hours / 1000
        if v.get("load") is not None:
            e["load"] += max(v["load"], 0) * hours / 1000
        for k in ("solar_ac", "solar_dc"):
            if v.get(k) is not None:
                e[k] = e.get(k, 0.0) + max(v[k], 0) * hours / 1000
        if v.get("grid") is not None:
            e["import"] += max(v["grid"], 0) * hours / 1000
            e["export"] += max(-v["grid"], 0) * hours / 1000
        if v.get("battery") is not None:
            e["charge"] += max(v["battery"], 0) * hours / 1000
            e["discharge"] += max(-v["battery"], 0) * hours / 1000

    # -------------------------------------------------------------- reading
    def rows(self, day: str) -> list[list]:
        """Chart rows: [slot, solar, load, grid, battery, soc] (means, rounded)."""
        out = []
        for slot in sorted(self.buckets.get(day, {})):
            b = self.buckets[day][slot]
            row = [slot]
            for key in SERIES:
                acc = b.get(key)
                if not acc or acc[1] < 1:
                    row.append(None)
                else:
                    mean = acc[0] / acc[1]
                    row.append(round(mean, 1) if key == "soc" else round(mean))
            if any(v is not None for v in row[1:]):
                out.append(row)
        return out

    # ------------------------------------------------------------ persistence
    def dump_buckets(self, keep_days: set[str]) -> dict:
        return {d: {str(s): b for s, b in slots.items()} for d, slots in self.buckets.items() if d in keep_days}

    def load_buckets(self, data: dict) -> None:
        self.buckets = {d: {int(s): {k: list(v) for k, v in b.items()} for s, b in slots.items()} for d, slots in data.items()}

    def replace_day(self, day: str, other: "Accumulator") -> None:
        """Take day's buckets and totals from another accumulator (backfill)."""
        if day in other.buckets:
            self.buckets[day] = other.buckets[day]
        if day in other.days:
            self.days[day] = other.days[day]


def replay(events: list[tuple[datetime, str, float | None]], m: Mapping, end: datetime,
           initial: dict[str, float | None] | None = None) -> Accumulator:
    """Integrate recorded state changes.

    events: (local time, entity_id, value-in-W-or-%) sorted by time.
    initial: raw values in force at the first event (the state at the start time).
    """
    acc = Accumulator()
    raw: dict[str, float | None] = dict(initial or {})
    first = True
    for t, entity_id, value in events:
        if first:
            acc.set(t, combine(raw, m))
            first = False
        raw[entity_id] = value
        acc.set(t, combine(raw, m))
    acc.advance(end)
    return acc


def hourly_energy(hours: dict[datetime, dict[str, float | None]], m: Mapping) -> dict[str, dict[str, float]]:
    """Daily kWh from hourly mean power per entity (long-term statistics backfill).

    hours: {local hour start: {entity_id: mean W}}.  Import/export within one hour
    net out, so older days are a close approximation.
    """
    days: dict[str, dict[str, float]] = {}
    for start, raw in sorted(hours.items()):
        v = combine(raw, m)
        e = days.setdefault(day_key(start), {k: 0.0 for k in ENERGY_KEYS})
        if v["solar"] is not None:
            e["solar"] += max(v["solar"], 0) / 1000
        if v["load"] is not None:
            e["load"] += max(v["load"], 0) / 1000
        for k in ("solar_ac", "solar_dc"):
            if v.get(k) is not None:
                e[k] += max(v[k], 0) / 1000
        if v["grid"] is not None:
            e["import"] += max(v["grid"], 0) / 1000
            e["export"] += max(-v["grid"], 0) / 1000
        if v["battery"] is not None:
            e["charge"] += max(v["battery"], 0) / 1000
            e["discharge"] += max(-v["battery"], 0) / 1000
    return days


DEFAULT_TARIFF = {"import": 3.50, "export": 0.0, "daily_fixed": 0.0, "currency": "R"}


def money(day: dict[str, float], tariff: dict) -> dict[str, float]:
    """Grid cost and solar savings for one day's kWh."""
    imp, exp = day.get("import", 0.0), day.get("export", 0.0)
    load = day.get("load", 0.0)
    cost = imp * tariff["import"] - exp * tariff["export"] + tariff.get("daily_fixed", 0.0)
    without_system = load * tariff["import"] + tariff.get("daily_fixed", 0.0)
    return {
        "cost": round(cost, 2),
        "saved": round(max(without_system - cost, 0.0), 2),
        "self_sufficiency": round(max(min((load - imp) / load, 1.0), 0.0) * 100) if load > 0.05 else None,
    }
