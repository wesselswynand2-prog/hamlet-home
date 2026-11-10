"""Pure water & pump logic (no Home Assistant imports, so it is unit-testable)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

POOL_MODES = ["auto", "solar", "on", "off"]
BUCKET_MIN = 5

DEFAULT_WATER_SETTINGS: dict = {
    # pool pump
    "pool_mode": "auto",
    "pool_schedules": [
        {"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "start": "10:00", "end": "14:00"},
    ],
    # pool pump on spare solar (Solar mode): run times become the allowed hours
    "pool_solar_start_w": 1000,  # spare solar needed (not counting the pump) before it starts
    "pool_solar_keep_w": 500,    # keeps running while spare solar stays above this
    "pool_hours": 6,             # stop once it ran this long today (0 = no limit)
    "pool_rated_w": 750,         # pump power when there's no power sensor
    "pool_min_switch_s": 300,    # protect the pump: no on/off more often than this
    "pool_stop_deficit_min": 10,   # stop when solar stays below the house load this long (0 = off)
    "pool_stop_discharge_min": 5,  # stop when the battery gives more than pool_discharge_w this long (0 = off)
    "pool_discharge_w": 200,
    # booster pump protection
    "dry_run_enabled": False,
    "dry_run_bar": 0.5,          # running below this pressure …
    "dry_run_seconds": 60,       # … for this long -> switch the pump off
    "long_run_minutes": 30,      # running non-stop longer than this -> leak alert (0 = off)
    "low_pressure_bar": 0.0,     # alert when pressure stays below this (0 = off)
    "notify_service": "",        # e.g. notify.mobile_app_wynand – persistent notification always
    "running_watts": 20,         # power above this counts as running
    # water use (estimated from the pump curve, or a flow meter)
    "flow_enabled": False,
    "flow_sensor": "",           # a real flow meter (L/min, m³/h …) – used instead of the curve
    "flow_curve": [[0, 43.5], [1.2, 41.5], [1.8, 40], [2.4, 38], [3.6, 33], [4.8, 23.5]],  # [m³/h, head m] at rated Hz – DAB K 35/40 T
    "flow_rated_hz": 50,
    "flow_min_hz": 20,           # below this the pump counts as stopped
    "flow_suction_m": 0.0,       # + metres if the pump lifts from a tank below it, - if the inlet is pressurised
    "flow_cal": 1.0,             # correction from a bucket test
    # tank without a level sensor: worked out from the borehole's float switch and the water used
    "tank_size_l": 0,            # 0 = no tank estimate
    "borehole_entity": "",       # the borehole pump: switch / binary_sensor, or a power sensor
    "borehole_watts": 50,        # a power sensor above this counts as running
    "tank_refill_pct": 67,       # the float switches the borehole on at this level (1/3 down from the top = 67 %)
    "borehole_long_min": 0,      # warn when the borehole runs longer than this (0 = 3× its usual fill time)
}
USER_KEYS = {"pool_mode", "pool_schedules", "pool_solar_start_w", "pool_solar_keep_w", "pool_hours",
             "pool_stop_deficit_min", "pool_stop_discharge_min", "pool_discharge_w"}


def parse_hm(value: str) -> int:
    h, m = str(value).split(":")[:2]
    return int(h) * 60 + int(m)


def _in_window(s: dict, now: datetime) -> bool:
    start, end = parse_hm(s["start"]), parse_hm(s["end"])
    minute = now.hour * 60 + now.minute
    days = s.get("days", list(range(7)))
    if start == end:
        return False
    if start < end:
        return now.weekday() in days and start <= minute < end
    if minute >= start:
        return now.weekday() in days
    return minute < end and (now.weekday() - 1) % 7 in days


def active_window(schedules: list[dict], now: datetime) -> dict | None:
    for s in schedules:
        if s.get("enabled", True) and _in_window(s, now):
            return s
    return None


def next_start(schedules: list[dict], now: datetime) -> datetime | None:
    best = None
    for s in schedules:
        if not s.get("enabled", True) or s["start"] == s["end"]:
            continue
        start = parse_hm(s["start"])
        for offset in range(8):
            day = now + timedelta(days=offset)
            if day.weekday() not in s.get("days", list(range(7))):
                continue
            cand = day.replace(hour=start // 60, minute=start % 60, second=0, microsecond=0)
            if cand > now:
                best = cand if best is None or cand < best else best
                break
    return best


def pool_solar_wants(schedules: list[dict], now: datetime, hours_today: float, target_hours: float) -> tuple[bool, str]:
    """Solar mode: would the pool pump like to run now (inside allowed hours, daily hours not done)?"""
    if target_hours and hours_today >= target_hours:
        return False, f"Done for today – ran {hours_today:.1f} of {target_hours:g} h"
    enabled = [s for s in schedules if s.get("enabled", True)]
    if enabled and not active_window(enabled, now):
        nxt = next_start(enabled, now)
        when = "" if nxt is None else (nxt.strftime("%H:%M") if nxt.date() == now.date() else nxt.strftime("%a %H:%M"))
        return False, f"Outside solar hours{' – from ' + when if when else ''}"
    return True, ""


def pool_desired(mode: str, schedules: list[dict], now: datetime, grant: bool | None = None, grant_why: str = "",
                 hours_today: float = 0.0, target_hours: float = 0.0) -> tuple[bool, str]:
    if mode == "solar":
        wants, why = pool_solar_wants(schedules, now, hours_today, target_hours)
        if not wants:
            return False, why
        left = f" · {hours_today:.1f}/{target_hours:g} h" if target_hours else ""
        if grant:
            return True, f"Running on {grant_why or 'spare solar'}{left}"
        return False, f"Waiting for solar – {grant_why or 'not enough spare'}{left}"
    if mode == "on":
        return True, "Switched on"
    if mode == "off":
        return False, "Switched off"
    win = active_window(schedules, now)
    if win:
        return True, f"Running until {win['end']}"
    nxt = next_start(schedules, now)
    if nxt is None:
        return False, "No run times set"
    when = nxt.strftime("%H:%M") if nxt.date() == now.date() else nxt.strftime("%a %H:%M")
    return False, f"Next run {when}"


def is_running(switch_on: bool | None, watts: float | None, hz: float | None, min_watts: float) -> bool | None:
    """Best guess whether a pump is actually turning."""
    if watts is not None:
        return watts >= min_watts
    if hz is not None:
        return hz > 1
    return switch_on


@dataclass
class Guard:
    """Dry-run / long-run / low-pressure watchdog for the booster pump."""
    low_since: datetime | None = None
    run_since: datetime | None = None
    long_run_alerted: bool = False
    low_pressure_since: datetime | None = None
    low_pressure_alerted: bool = False
    tripped: bool = False
    tripped_at: datetime | None = None

    def check(self, now: datetime, running: bool | None, bar: float | None, s: dict) -> list[str]:
        """Returns events: 'dry_run', 'long_run', 'low_pressure', 'pressure_ok'."""
        events: list[str] = []
        # run timer
        if running:
            if self.run_since is None:
                self.run_since = now
        else:
            self.run_since = None
            self.long_run_alerted = False
        # dry run: running but no pressure
        if s.get("dry_run_enabled") and running and bar is not None and bar < s["dry_run_bar"]:
            self.low_since = self.low_since or now
            if not self.tripped and (now - self.low_since).total_seconds() >= s["dry_run_seconds"]:
                self.tripped, self.tripped_at = True, now
                events.append("dry_run")
        else:
            self.low_since = None
        # long run
        lr = s.get("long_run_minutes") or 0
        if lr and running and self.run_since and not self.long_run_alerted and (now - self.run_since).total_seconds() >= lr * 60:
            self.long_run_alerted = True
            events.append("long_run")
        # low pressure (independent of pump state), 2 minutes debounce
        lp = s.get("low_pressure_bar") or 0
        if lp and bar is not None and bar < lp:
            self.low_pressure_since = self.low_pressure_since or now
            if not self.low_pressure_alerted and (now - self.low_pressure_since).total_seconds() >= 120:
                self.low_pressure_alerted = True
                events.append("low_pressure")
        else:
            if self.low_pressure_alerted:
                events.append("pressure_ok")
            self.low_pressure_since = None
            self.low_pressure_alerted = False
        return events

    def reset(self) -> None:
        self.tripped, self.tripped_at, self.low_since = False, None, None


@dataclass
class RunCounter:
    """Run time, starts and longest run per day for one pump."""
    running: bool | None = None
    last_t: datetime | None = None
    run_start: datetime | None = None
    days: dict[str, dict[str, float]] = field(default_factory=dict)

    def _day(self, t: datetime) -> dict[str, float]:
        return self.days.setdefault(t.date().isoformat(), {"seconds": 0.0, "starts": 0, "longest": 0.0})

    def update(self, t: datetime, running: bool | None, max_gap: float = 600) -> None:
        if self.last_t is not None and self.running and t > self.last_t and (t - self.last_t).total_seconds() <= max_gap:
            # split at midnight
            start = self.last_t
            while start < t:
                midnight = (start + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                end = min(t, midnight)
                self._day(start)["seconds"] += (end - start).total_seconds()
                start = end
        if running and not self.running and self.running is not None:
            self._day(t)["starts"] += 1
            self.run_start = t
        elif running and self.run_start is None:
            self.run_start = t
        if self.running and not running and self.run_start is not None:
            run = (t - self.run_start).total_seconds()
            d = self._day(t)
            d["longest"] = max(d["longest"], run)
            self.run_start = None
        if running and self.run_start is not None:
            d = self._day(t)
            d["longest"] = max(d["longest"], (t - self.run_start).total_seconds())
        self.running = running
        self.last_t = t


class PressureBuckets:
    """5-minute pressure mean/min and pump-on share."""

    def __init__(self) -> None:
        self.data: dict[str, dict[int, list[float]]] = {}  # day -> slot -> [bar*s, s, min, pump_s, pool_s, total_s]
        self.last_t: datetime | None = None
        self.values: tuple[float | None, bool, bool] = (None, False, False)

    def set(self, t: datetime, bar: float | None, pump: bool, pool: bool) -> None:
        self.advance(t)
        self.values = (bar, bool(pump), bool(pool))

    def advance(self, t: datetime, max_gap: float = 600) -> None:
        if self.last_t is None or t <= self.last_t:
            self.last_t = self.last_t or t
            return
        if (t - self.last_t).total_seconds() > max_gap:
            self.last_t = t
            return
        start = self.last_t
        bar, pump, pool = self.values
        while start < t:
            slot = (start.hour * 60 + start.minute) // BUCKET_MIN * BUCKET_MIN
            b_end = start.replace(hour=slot // 60, minute=slot % 60, second=0, microsecond=0) + timedelta(minutes=BUCKET_MIN)
            end = min(t, b_end)
            secs = (end - start).total_seconds()
            b = self.data.setdefault(start.date().isoformat(), {}).setdefault(slot, [0.0, 0.0, 1e9, 0.0, 0.0, 0.0])
            if bar is not None:
                b[0] += bar * secs
                b[1] += secs
                b[2] = min(b[2], bar)
            b[3] += secs if pump else 0
            b[4] += secs if pool else 0
            b[5] += secs
            start = end
        self.last_t = t

    def rows(self, day: str) -> list[list]:
        """[slot, mean bar, min bar, pump share 0-1, pool share 0-1]"""
        out = []
        for slot, b in sorted(self.data.get(day, {}).items()):
            if b[5] < 1:
                continue
            mean = round(b[0] / b[1], 2) if b[1] >= 1 else None
            low = round(b[2], 2) if b[1] >= 1 else None
            out.append([slot, mean, low, round(b[3] / b[5], 2), round(b[4] / b[5], 2)])
        return out


def validate_water_settings(new: dict, admin: bool) -> dict:
    clean: dict = {}
    for key, value in new.items():
        if key not in DEFAULT_WATER_SETTINGS:
            continue
        if not admin and key not in USER_KEYS:
            raise ValueError(f"Only an administrator can change '{key}'")
        if key == "pool_schedules":
            out = []
            for s in value:
                parse_hm(s["start"]), parse_hm(s["end"])
                days = sorted({int(d) for d in s.get("days", []) if 0 <= int(d) <= 6})
                out.append({"enabled": bool(s.get("enabled", True)), "days": days, "start": str(s["start"])[:5], "end": str(s["end"])[:5]})
            clean[key] = out
        elif key in ("pool_solar_start_w", "pool_solar_keep_w", "pool_rated_w") and not 0 <= float(value) <= 20000:
            raise ValueError(f"{key} out of range")
        elif key == "pool_mode":
            if value not in POOL_MODES:
                raise ValueError("Unknown pool mode")
            clean[key] = value
        elif key == "flow_curve":
            clean[key] = validate_curve(value)
        elif key == "flow_sensor":
            value = str(value or "").strip()
            if value and not value.startswith(("sensor.", "input_number.", "number.")):
                raise ValueError("The flow meter must be a sensor")
            clean[key] = value
        elif key == "flow_suction_m":
            v = float(value)
            if not -50 <= v <= 100:
                raise ValueError("Suction lift must be -50 … 100 m")
            clean[key] = v
        elif key == "flow_cal":
            v = float(value)
            if not 0.2 <= v <= 5:
                raise ValueError("Correction factor must be 0.2 … 5")
            clean[key] = round(v, 3)
        elif key in ("flow_rated_hz", "flow_min_hz"):
            v = float(value)
            if not 0 <= v <= 120:
                raise ValueError("Frequency must be 0 … 120 Hz")
            clean[key] = v
        elif key == "tank_size_l":
            v = float(value)
            if not (v == 0 or 50 <= v <= 1_000_000):
                raise ValueError("Tank size must be 50 … 1 000 000 L (0 = no tank)")
            clean[key] = round(v)
        elif key == "borehole_entity":
            value = str(value or "").strip()
            if value and not value.startswith(("switch.", "binary_sensor.", "input_boolean.", "sensor.", "light.")):
                raise ValueError("The borehole must be a switch, binary sensor or power sensor")
            clean[key] = value
        elif key == "borehole_watts":
            v = float(value)
            if not 0 <= v <= 20000:
                raise ValueError("Borehole running watts must be 0 … 20 000 W")
            clean[key] = v
        elif key == "tank_refill_pct":
            v = float(value)
            if not 5 <= v <= 95:
                raise ValueError("The borehole switch-on level must be 5 … 95 %")
            clean[key] = v
        elif key == "borehole_long_min":
            v = float(value)
            if not 0 <= v <= 1440:
                raise ValueError("Borehole warning must be 0 … 1440 minutes")
            clean[key] = v
        elif key == "notify_service":
            value = str(value or "").strip()
            if value and not value.startswith("notify."):
                raise ValueError("Notify service must look like notify.mobile_app_phone")
            clean[key] = value
        elif isinstance(DEFAULT_WATER_SETTINGS[key], bool):
            clean[key] = bool(value)
        else:
            v = float(value)
            if v < 0 or v > 10000:
                raise ValueError(f"{key} out of range")
            clean[key] = v
    return clean


# ----------------------------------------------------------------- water use
def validate_curve(points) -> list[list[float]]:
    """Pump curve as [[flow m³/h, head m], …] – flow rising, head falling."""
    out = []
    for pt in points or []:
        q, h = float(pt[0]), float(pt[1])
        if not (0 <= q <= 500 and 0 <= h <= 1000):
            raise ValueError("Curve points: flow 0–500 m³/h, head 0–1000 m")
        out.append([q, h])
    out.sort(key=lambda x: x[0])
    if len(out) < 2:
        raise ValueError("The pump curve needs at least 2 points")
    for a, b in zip(out, out[1:]):
        if b[0] == a[0] or b[1] > a[1]:
            raise ValueError("Pump curve: each point needs more flow and the same or less head than the one before")
    return out


def estimate_flow(hz: float | None, bar: float | None, curve: list, rated_hz: float = 50, min_hz: float = 20,
                  suction_m: float = 0.0, cal: float = 1.0) -> float | None:
    """Flow in m³/h from pump speed and pressure using the affinity laws on the datasheet curve.

    Head scales with speed², flow with speed: at speed ratio r the measured head H corresponds to H/r² on the
    rated-speed curve; read the flow there and scale it back by r. None = can't tell (no pressure)."""
    if bar is None or hz is None:
        return None
    if hz < min_hz or hz <= 0:
        return 0.0
    head = bar * 10.197 + suction_m
    r = hz / (rated_hz or 50)
    h50 = head / (r * r)
    q = [p[0] for p in curve]
    h = [p[1] for p in curve]
    if h50 >= h[0]:
        return 0.0           # pressure above shut-off head: nothing flows
    if h50 <= h[-1]:
        return round(q[-1] * r * cal, 4)
    for i in range(1, len(h)):
        if h50 >= h[i]:
            q50 = q[i - 1] + (h[i - 1] - h50) / (h[i - 1] - h[i]) * (q[i] - q[i - 1])
            return round(q50 * r * cal, 4)
    return 0.0


FLOW_UNITS = {"m³/h": 1.0, "m3/h": 1.0, "L/min": 0.06, "l/min": 0.06, "L/h": 0.001, "l/h": 0.001, "L/s": 3.6, "l/s": 3.6,
              "gal/min": 0.227125, "ft³/min": 1.699011}


@dataclass
class WaterMeter:
    """Adds up litres per day: total, per irrigation valve and 'house' (no valve open), plus a lifetime total."""
    days: dict[str, dict] = field(default_factory=dict)   # date -> {"l": L, "zones": {zid: L}, "house": L}
    total_l: float = 0.0
    last: dict[str, dict] = field(default_factory=dict)   # zid -> {"l": L of its latest run, "at": iso}
    _t: datetime | None = None
    _q: float = 0.0               # m³/h at _t
    _zones: tuple = ()
    _running: set = field(default_factory=set)

    def update(self, t: datetime, flow_m3h: float | None, zones_open: tuple, max_gap: float = 300) -> None:
        """Left-Riemann: the flow and open valves seen at the previous update count until now."""
        if self._t is not None and t > self._t and self._q > 0:
            secs = min((t - self._t).total_seconds(), max_gap)
            litres = self._q * 1000 * secs / 3600
            self._add(self._t, litres, self._zones)
        for z in zones_open:
            if z not in self._running:          # a new run starts at zero
                self.last[z] = {"l": 0.0, "at": t.isoformat()}
        self._running = set(zones_open)
        self._t, self._q, self._zones = t, max(flow_m3h or 0.0, 0.0), tuple(zones_open)

    def _add(self, t: datetime, litres: float, zones: tuple) -> None:
        d = self.days.setdefault(t.date().isoformat(), {"l": 0.0, "zones": {}, "house": 0.0})
        d["l"] += litres
        self.total_l += litres
        if zones:
            share = litres / len(zones)
            for z in zones:
                d["zones"][z] = d["zones"].get(z, 0.0) + share
                if z in self.last:
                    self.last[z]["l"] += share
        else:
            d["house"] += litres

    def period(self, first_day: str, last_day: str) -> dict:
        out = {"l": 0.0, "house": 0.0, "zones": {}}
        for day, d in self.days.items():
            if first_day <= day <= last_day:
                out["l"] += d["l"]
                out["house"] += d.get("house", 0.0)
                for z, v in d.get("zones", {}).items():
                    out["zones"][z] = out["zones"].get(z, 0.0) + v
        return out


@dataclass
class TankModel:
    """Tank level without a level sensor.

    The borehole's float switch tells us two exact levels: when the borehole switches ON the tank is at the
    refill level (e.g. 2/3), when it switches OFF the tank is full. In between we take off the water the booster
    pump delivered, and while the borehole runs we add its inflow, learnt from earlier fills:
    inflow = (water to fill from the refill level to full + water used meanwhile) / fill time."""
    level_l: float | None = None
    filling: bool = False
    fill_start: str | None = None       # iso time
    fill_used: float = 0.0              # litres the house/irrigation used during this fill
    inflow_lpm: float | None = None     # learnt borehole yield into the tank
    fills: list = field(default_factory=list)   # [{"start", "minutes", "in_l", "lpm"}] newest last
    _used: float | None = None          # meter total at the last update
    _t: datetime | None = None

    def update(self, t: datetime, borehole_on: bool | None, used_total_l: float, size_l: float, refill_pct: float) -> None:
        if size_l <= 0:
            return
        used = 0.0 if self._used is None else max(used_total_l - self._used, 0.0)
        self._used = used_total_l
        mins = (t - self._t).total_seconds() / 60 if self._t is not None and t > self._t else 0.0
        self._t = t
        refill_l = size_l * refill_pct / 100
        if self.level_l is not None:
            self.level_l -= used
        if self.filling:
            self.fill_used += used
        if borehole_on and not self.filling:                 # float dropped: tank is at the refill level now
            self.filling, self.fill_start, self.fill_used = True, t.isoformat(), 0.0
            self.level_l = refill_l
        elif borehole_on and self.filling:
            if self.level_l is not None and self.inflow_lpm:
                self.level_l = min(self.level_l + self.inflow_lpm * min(mins, 5), size_l * 0.99)
        elif borehole_on is False and self.filling:          # float lifted: tank is full
            self.filling = False
            start = datetime.fromisoformat(self.fill_start) if self.fill_start else None
            fmins = (t - start).total_seconds() / 60 if start else 0
            if fmins >= 1:
                in_l = size_l - refill_l + self.fill_used
                lpm = in_l / fmins
                self.inflow_lpm = round(lpm if self.inflow_lpm is None else 0.6 * lpm + 0.4 * self.inflow_lpm, 2)
                self.fills = (self.fills + [{"start": self.fill_start, "minutes": round(fmins, 1), "in_l": round(in_l), "lpm": round(lpm, 1)}])[-10:]
            self.level_l = size_l
        if self.level_l is not None:
            self.level_l = max(0.0, min(self.level_l, size_l))

    def usual_fill_min(self) -> float | None:
        m = sorted(f["minutes"] for f in self.fills)
        return m[len(m) // 2] if m else None

    def to_dict(self) -> dict:
        return {"level_l": self.level_l, "filling": self.filling, "fill_start": self.fill_start, "fill_used": self.fill_used,
                "inflow_lpm": self.inflow_lpm, "fills": self.fills, "used": self._used}

    def load(self, d: dict) -> None:
        self.level_l, self.filling, self.fill_start = d.get("level_l"), bool(d.get("filling")), d.get("fill_start")
        self.fill_used, self.inflow_lpm, self.fills = float(d.get("fill_used") or 0), d.get("inflow_lpm"), list(d.get("fills") or [])
        self._used = d.get("used")
