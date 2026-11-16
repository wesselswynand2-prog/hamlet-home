"""Make sure the Hamlet Home dashboard card is a dashboard resource (Settings → Dashboards → Resources).

Dashboard resources are loaded by the dashboards themselves, after the app is ready – the same way HACS cards are
loaded – so `custom:hamlet-home-card` is always found. The version in the URL is kept up to date on every start."""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_ensure_card_resource(hass: HomeAssistant, base_url: str, version: str) -> str | None:
    """Add or update the resource. Returns what was done ("added", "updated", "ok") or None (YAML mode / no lovelace)."""
    try:
        from homeassistant.components.lovelace.const import LOVELACE_DATA  # noqa: PLC0415
        from homeassistant.components.lovelace.resources import ResourceStorageCollection  # noqa: PLC0415
    except ImportError:
        return None
    data = hass.data.get(LOVELACE_DATA)
    res = getattr(data, "resources", None)
    if not isinstance(res, ResourceStorageCollection):
        return None            # resources written in YAML: the user adds it there (see README)
    try:
        if not res.loaded:
            await res.async_load()
            res.loaded = True
        url = f"{base_url}?v={version}"
        for item in res.async_items():
            if str(item.get("url", "")).split("?")[0] == base_url:
                if item.get("url") == url:
                    return "ok"
                await res.async_update_item(item["id"], {"res_type": "module", "url": url})
                return "updated"
        await res.async_create_item({"res_type": "module", "url": url})
        return "added"
    except Exception as err:  # noqa: BLE001 - never block the app over this
        _LOGGER.warning("Hamlet Home: could not add the dashboard card resource: %s", err)
        return None
