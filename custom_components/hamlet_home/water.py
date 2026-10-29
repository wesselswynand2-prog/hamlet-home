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
    # booster pump protection
    "dry_run_enabled": False,
    "dry_run_bar": 0.5,          # running below this pressure …
    "dry_run_seconds": 60,       # … for this long -> switch the pump off
    "long_run_minutes": 30,      # running non-stop longer than this -> leak alert (0 = off)
    "low_pressure_bar": 0.0,     # alert when pressure stays below this (0 = off)
    "notify_service": "",        # e.g. notify.mobile_app_wynand – persistent notification always
    "running_watts": 20,         # power above this counts as running
}
USER_KEYS = {"pool_mode", "pool_schedules", "pool_solar_start_w", "pool_solar_keep_w", "pool_hours"}


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
