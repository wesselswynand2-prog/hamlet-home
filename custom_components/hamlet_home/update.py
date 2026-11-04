"""'Update available' for Hamlet Home and Hamlet Geyser straight from GitHub releases (no HACS needed)."""
from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path

import aiohttp

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.loader import IntegrationNotFound, async_get_integration

from . import updater
from .const import DOMAIN, VERSION

_LOGGER = logging.getLogger(__name__)
CHECK_EVERY = timedelta(hours=6)
NAMES = {"hamlet_home": "Hamlet Home", "hamlet_geyser": "Hamlet Geyser"}


def config_dir(hass: HomeAssistant) -> Path:
    return Path(hass.config.config_dir)


def target_dir(hass: HomeAssistant, domain: str) -> Path:
    return config_dir(hass) / "custom_components" / domain


def hacs_manages(hass: HomeAssistant, repo: str) -> bool:
    """True when HACS has this repo downloaded (then HACS shows the update, not us)."""
    try:
        r = hass.data["hacs"].repositories.get_by_full_name(repo)
        return bool(r and r.data.installed)
    except Exception:  # noqa: BLE001 - HACS missing or a different version
        return False


async def async_setup_entry(hass, entry, async_add_entities):
    c = hass.data[DOMAIN]["controller"]
    entities = [HamletUpdate(hass, c, "hamlet_home", VERSION)]
    try:
        geyser = await async_get_integration(hass, "hamlet_geyser")
        entities.append(HamletUpdate(hass, c, "hamlet_geyser", str(geyser.version)))
    except IntegrationNotFound:
        pass
    async_add_entities(entities)


class HamletUpdate(UpdateEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_supported_features = UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES

    def __init__(self, hass, controller, domain: str, installed: str) -> None:
        self.hass = hass
        self.domain = domain
        self.repo = updater.REPOS[domain]
        self._attr_unique_id = f"{controller.entry.entry_id}_update_{domain}"
        self._attr_name = f"{NAMES[domain]} update" if domain != "hamlet_home" else "App update"
        self._attr_title = NAMES[domain]
        self._attr_installed_version = installed
        self._attr_latest_version = installed
        self._attr_release_url = f"https://github.com/{self.repo}/releases"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, controller.entry.entry_id)}, name=controller.name,
                                            manufacturer="Hamlet Elektries", model="Hamlet Home", sw_version=VERSION)
        self._notes: str | None = None
        self._asset: str | None = None
        self._managed = False
        self._error: str | None = None

    @property
    def entity_picture(self) -> str | None:
        return None

    @property
    def extra_state_attributes(self):
        return {"managed_by": "HACS" if self._managed else "Hamlet Home", "repository": self.repo, "last_error": self._error}

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_track_time_interval(self.hass, self._check, CHECK_EVERY))
        self.async_on_remove(async_call_later(self.hass, 60, self._check))

    @callback
    def _check(self, _now=None) -> None:
        self.hass.async_create_task(self.async_check(), f"{DOMAIN}_update_check_{self.domain}")

    async def async_check(self) -> None:
        session = async_get_clientsession(self.hass)
        try:
            async with session.get(f"https://api.github.com/repos/{self.repo}/releases/latest",
                                   headers={"Accept": "application/vnd.github+json", "User-Agent": "Hamlet-Home-updater"},
                                   timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    self._error = f"GitHub answered {resp.status}"
                    _LOGGER.debug("Hamlet update check for %s: HTTP %s", self.repo, resp.status)
                    return
                rel = await resp.json()
        except Exception as err:  # noqa: BLE001 - an update check must never break anything
            self._error = f"Could not reach GitHub: {err}"
            _LOGGER.debug("Hamlet update check failed: %s", err)
            return
        self._error = None
        self._managed = hacs_manages(self.hass, self.repo)
        latest = str(rel.get("tag_name", "")).lstrip("v") or self.installed_version
        self._asset = updater.pick_asset(rel, self.domain)
        self._notes = rel.get("body") or ""
        self._attr_release_url = rel.get("html_url") or self._attr_release_url
        self._attr_release_summary = (self._notes.strip().splitlines() or [""])[0][:250] or None
        # HACS shows its own update for repos it downloaded; don't show a second one
        self._attr_latest_version = self.installed_version if (self._managed or not self._asset) else latest
        self.async_write_ha_state()

    async def async_release_notes(self) -> str | None:
        return self._notes

    async def async_install(self, version: str | None, backup: bool, **kwargs) -> None:
        from homeassistant.exceptions import HomeAssistantError  # noqa: PLC0415
        if not self._asset:
            await self.async_check()
        if not self._asset:
            raise HomeAssistantError("No release zip found on GitHub")
        cfg = config_dir(self.hass)
        dl = cfg / "hamlet_backup" / f".{self.domain}.download.zip"
        session = async_get_clientsession(self.hass)
        try:
            async with session.get(self._asset, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    raise HomeAssistantError(f"Download failed (HTTP {resp.status})")
                data = await resp.read()
        except (aiohttp.ClientError, TimeoutError) as err:
            raise HomeAssistantError(f"Download failed: {err}") from err

        def _install() -> str:
            dl.parent.mkdir(parents=True, exist_ok=True)
            dl.write_bytes(data)
            try:
                return updater.install_zip(dl, self.domain, cfg, target_dir(self.hass, self.domain), self.latest_version)
            finally:
                dl.unlink(missing_ok=True)

        try:
            new = await self.hass.async_add_executor_job(_install)
        except updater.InstallError as err:
            raise HomeAssistantError(str(err)) from err
        _LOGGER.warning("%s %s installed from GitHub – restarting Home Assistant", NAMES[self.domain], new)
        self._attr_installed_version = new
        self.async_write_ha_state()
        # new code only loads after a restart; give the frontend a moment to get the answer first
        async_call_later(self.hass, 3, self._restart)

    @callback
    def _restart(self, _now=None) -> None:
        self.hass.async_create_task(self.hass.services.async_call("homeassistant", "restart"), f"{DOMAIN}_restart")
