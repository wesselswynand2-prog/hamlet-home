"""Share spare solar between switchable loads by priority (pure, unit-testable).

Every load is described as a dict:
  id        unique id ("pool", "geyser:<entry_id>")
  name      shown in the app
  wants     the load would run now if there were enough solar
  running   it is drawing power now
  power     what it draws when on (W) – measured when running, else rated
  start_w   spare solar needed (not counting itself) before it may start
  keep_w    spare solar needed (not counting itself) to keep running
  via_full  it was last granted because the battery was full (state carried by the caller)

Loads are passed in priority order, highest first. Spare solar is handed out top-down;
a smaller load further down may still use what a big one above can't. When solar drops,
the bottom of the list loses its share first.
"""
from __future__ import annotations

DEFAULT_SOLAR_SETTINGS = {
    "enabled": True,              # share solar by priority (off = every load decides on its own)
    "order": [],                  # load ids, highest priority first
    "soc_full_on": 95,            # battery this full -> panels are being held back, start loads one at a time
    "soc_full_off": 88,
    "max_battery_discharge_w": 600,
}


def allocate(loads: list[dict], spare_w: float | None, soc: float | None, battery_w: float | None, s: dict) -> dict[str, dict]:
    """Return {id: {"grant": bool, "via_full": bool, "why": str}}.

    spare_w: spare solar if none of these loads were running (solar − other house load).
    battery_w: + charging / − discharging.
    """
    out: dict[str, dict] = {}
    avail = spare_w
    any_full_running = any(l["running"] and l.get("via_full") for l in loads)
    full = soc is not None and soc >= (s["soc_full_off"] if any_full_running else s["soc_full_on"])
    draining = battery_w is not None and battery_w < -s["max_battery_discharge_w"]
    started_on_full = False

    for l in loads:
        if not l["wants"]:
            out[l["id"]] = {"grant": False, "via_full": False, "why": "not asking"}
            continue
        need = l["keep_w"] if l["running"] else l["start_w"]
        if avail is not None and avail >= need:
            out[l["id"]] = {"grant": True, "via_full": False, "why": f"spare solar {avail / 1000:.1f} kW"}
            avail -= l["power"]
            continue
        if full and l["running"] and l.get("via_full"):
            out[l["id"]] = {"grant": True, "via_full": True, "why": f"battery full ({soc:.0f}%)"}
            continue
        if full and not draining and not started_on_full and not l["running"]:
            out[l["id"]] = {"grant": True, "via_full": True, "why": f"battery full ({soc:.0f}%)"}
            started_on_full = True
            continue
        short = need - (avail or 0) if avail is not None else None
        out[l["id"]] = {"grant": False, "via_full": False,
                        "why": "waiting for solar" if short is None else f"needs {max(short, 0) / 1000:.1f} kW more solar"}

    # battery being drained while loads run on "battery full": drop the lowest-priority one of those
    if draining:
        for l in reversed(loads):
            r = out.get(l["id"])
            if r and r["grant"] and r["via_full"]:
                out[l["id"]] = {"grant": False, "via_full": False, "why": "battery draining – stopped first (lowest priority)"}
                break
    return out


def ordered(loads: dict[str, dict], order: list[str]) -> list[dict]:
    """Loads sorted by the saved order; new loads go to the end."""
    rank = {lid: i for i, lid in enumerate(order)}
    return sorted(loads.values(), key=lambda l: (rank.get(l["id"], 10_000), l["id"]))
