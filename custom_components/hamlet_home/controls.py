"""Controls tab: which entities to show, what kind of tile they get, grouped by room (pure, testable)."""
from __future__ import annotations

import re
from typing import Any

DOMAINS = ("light", "switch", "cover", "climate", "fan", "lock", "scene", "script", "button", "input_boolean", "media_player")
KINDS = ("light", "switch", "plug", "gate", "garage", "blind", "aircon", "fan", "lock", "action", "media")
GATE_WORDS = re.compile(r"\b(gate|hek|garage|motor ?gate|boom|deur ?motor|garage ?door|motorhek)\b", re.I)
GATE_COVER_CLASSES = {"gate", "garage", "door"}
CONFIRM_KINDS = {"gate", "garage", "lock"}

DEFAULT_SETTINGS: dict[str, Any] = {
    "hidden": [],        # entity ids not shown
    "added": [],         # entity ids shown although not picked automatically (buttons, …)
    "names": {},         # entity id -> name on the page
    "kinds": {},         # entity id -> tile kind override
    "favourites": [],    # entity ids at the top, in order
    "confirm": {},       # entity id -> bool (default: gates, garages and locks ask first)
    "room_order": [],    # area ids
    "room_names": {},    # area id -> name on the page
    "pulse_seconds": 1.0,
}


def default_kind(entity_id: str, name: str, attrs: dict, device_class: str | None) -> str | None:
    domain = entity_id.split(".", 1)[0]
    if domain == "light":
        return "light"
    if domain == "climate":
        return "aircon"
    if domain == "fan":
        return "fan"
    if domain == "lock":
        return "lock"
    if domain == "media_player":
        return "media"
    if domain in ("scene", "script"):
        return "action"
    if domain == "cover":
        dc = device_class or attrs.get("device_class")
        return "garage" if dc in GATE_COVER_CLASSES or GATE_WORDS.search(name) else "blind"
    if domain in ("switch", "input_boolean", "button"):
        if GATE_WORDS.search(name) or GATE_WORDS.search(entity_id.replace("_", " ")):
            return "gate"
        if domain == "button":
            return "action"
        return "plug" if (device_class or attrs.get("device_class")) == "outlet" else "switch"
    return None


def auto_include(entity_id: str, kind: str | None) -> bool:
    """Picked without the installer doing anything (buttons only when they look like a gate)."""
    if kind is None:
        return False
    domain = entity_id.split(".", 1)[0]
    if domain == "button":
        return kind == "gate"
    return domain != "media_player"


def short_name(name: str, room: str | None) -> str:
    """'Kantoor Lig' in room 'Kantoor' -> 'Lig'."""
    if room and name.lower().startswith(room.lower() + " ") and len(name) > len(room) + 1:
        rest = name[len(room) + 1:].strip()
        return rest[:1].upper() + rest[1:]
    return name


def build(entities: list[dict], areas: dict[str, dict], settings: dict, admin: bool = False) -> dict:
    """entities: [{entity_id, name, area_id, attrs, device_class, power_entity}] (already filtered for
    disabled / hidden / config entities and things other tabs control).
    areas: {area_id: {"name": .., "icon": ..}}.
    """
    s = {**DEFAULT_SETTINGS, **(settings or {})}
    hidden, added = set(s["hidden"]), set(s["added"])
    rooms: dict[str | None, list[dict]] = {}
    gates: list[dict] = []
    actions: list[dict] = []
    every: list[dict] = []
    for e in sorted(entities, key=lambda x: x["name"].lower()):
        eid = e["entity_id"]
        kind = s["kinds"].get(eid) or default_kind(eid, e["name"], e.get("attrs") or {}, e.get("device_class"))
        if kind not in KINDS:
            continue
        shown = (auto_include(eid, default_kind(eid, e["name"], e.get("attrs") or {}, e.get("device_class"))) or eid in added
                 or eid in s["kinds"]) and eid not in hidden
        area = e.get("area_id") if e.get("area_id") in areas else None
        room_name = s["room_names"].get(area) or (areas[area]["name"] if area else None)
        item = {
            "entity_id": eid,
            "name": s["names"].get(eid) or short_name(e["name"], areas[area]["name"] if area else None),
            "full_name": e["name"],
            "fav_name": s["names"].get(eid) or e["name"],
            "kind": kind,
            "area_id": area,
            "room": room_name or "Other",
            "confirm": bool(s["confirm"].get(eid, kind in CONFIRM_KINDS)),
            "power_entity": e.get("power_entity"),
            "favourite": eid in s["favourites"],
        }
        if admin:
            every.append({**item, "shown": shown})
        if not shown:
            continue
        if kind in ("gate", "garage"):
            gates.append(item)
        elif kind == "action":
            actions.append(item)
        else:
            rooms.setdefault(area, []).append(item)

    order = {a: i for i, a in enumerate(s["room_order"])}
    room_ids = sorted(rooms, key=lambda a: (a is None, order.get(a, 10_000), (s["room_names"].get(a) or areas[a]["name"]).lower() if a else ""))
    kind_rank = {k: i for i, k in enumerate(("aircon", "light", "fan", "blind", "lock", "plug", "switch", "media"))}
    out_rooms = []
    for a in room_ids:
        items = sorted(rooms[a], key=lambda i: (kind_rank.get(i["kind"], 99), i["name"].lower()))
        out_rooms.append({"id": a or "_other", "name": (s["room_names"].get(a) or areas[a]["name"]) if a else "Other",
                          "icon": areas[a].get("icon") if a else None, "items": items})
    fav_index = {eid: i for i, eid in enumerate(s["favourites"])}
    shown_items = [i for r in out_rooms for i in r["items"]] + gates + actions
    favourites = sorted((i for i in shown_items if i["favourite"]), key=lambda i: fav_index[i["entity_id"]])
    result = {"rooms": out_rooms, "gates": gates, "actions": actions, "favourites": favourites,
              "pulse_seconds": s["pulse_seconds"]}
    if admin:
        result["all"] = every
        result["settings"] = s
    return result


def validate(new: dict, known: set[str]) -> dict:
    """Clean settings from the page. Raises ValueError on nonsense."""
    out: dict[str, Any] = {}
    for key in ("hidden", "added", "favourites", "room_order"):
        if key in new:
            vals = new[key]
            if not isinstance(vals, list) or not all(isinstance(v, str) for v in vals):
                raise ValueError(f"{key} must be a list")
            out[key] = list(dict.fromkeys(v for v in vals if key == "room_order" or v in known))[:500]
    for key in ("names", "room_names"):
        if key in new:
            if not isinstance(new[key], dict):
                raise ValueError(f"{key} must be a mapping")
            out[key] = {str(k): str(v).strip()[:40] for k, v in new[key].items() if str(v).strip()}
    if "kinds" in new:
        bad = [v for v in new["kinds"].values() if v not in KINDS]
        if bad:
            raise ValueError(f"Unknown tile type: {bad[0]}")
        out["kinds"] = {k: v for k, v in new["kinds"].items() if k in known}
    if "confirm" in new:
        out["confirm"] = {k: bool(v) for k, v in new["confirm"].items() if k in known}
    if "pulse_seconds" in new:
        p = float(new["pulse_seconds"])
        if not 0.2 <= p <= 10:
            raise ValueError("Gate pulse must be between 0.2 and 10 seconds")
        out["pulse_seconds"] = p
    return out
