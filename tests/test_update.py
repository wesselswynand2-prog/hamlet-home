"""Self-update from GitHub releases."""
import importlib.util
import io
import json
import pathlib
import zipfile

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed, async_mock_service

_spec = importlib.util.spec_from_file_location("hh_updater", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/updater.py")
updater = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(updater)

DOMAIN = "hamlet_home"


def make_zip(version="9.9.9", domain="hamlet_home", extra=None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"hamlet-home/custom_components/{domain}/manifest.json", json.dumps({"domain": domain, "version": version}))
        z.writestr(f"hamlet-home/custom_components/{domain}/__init__.py", "# new\n")
        z.writestr(f"hamlet-home/custom_components/{domain}/frontend/x.js", "//")
        z.writestr("hamlet-home/hamlet-update.sh", "#!/bin/sh\n")
        z.writestr("hamlet-home/README.md", "readme")
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


def test_install_zip(tmp_path):
    target = tmp_path / "custom_components" / "hamlet_home"
    target.mkdir(parents=True)
    (target / "__init__.py").write_text("# old\n")
    (target / "stale.py").write_text("x")
    z = tmp_path / "r.zip"
    z.write_bytes(make_zip())
    assert updater.install_zip(z, "hamlet_home", tmp_path, target, "v9.9.9") == "9.9.9"
    assert (target / "__init__.py").read_text() == "# new\n" and (target / "frontend/x.js").exists()
    assert not (target / "stale.py").exists()                                  # old files gone
    assert (tmp_path / "hamlet_backup/hamlet_home/__init__.py").read_text() == "# old\n"
    assert (tmp_path / "hamlet-update.sh").exists() and not (tmp_path / "README.md").exists()
    # wrong version, missing integration, path tricks and junk are refused without touching the install
    for data, exp in ((make_zip("1.0.0"), "9.9.9"), (make_zip(domain="other"), None),
                      (make_zip(extra={"hamlet-home/custom_components/hamlet_home/../../evil.py": "x"}), None), (b"not a zip", None)):
        z.write_bytes(data)
        try:
            updater.install_zip(z, "hamlet_home", tmp_path, target, exp)
            raise AssertionError("should have failed")
        except updater.InstallError:
            pass
        assert (target / "__init__.py").read_text() == "# new\n"
    assert not (tmp_path / "evil.py").exists()


def test_pick_asset():
    rel = {"assets": [{"name": "hamlet-home.zip", "browser_download_url": "https://github.com/x/releases/download/v1/hamlet-home.zip"},
                      {"name": "other.zip", "browser_download_url": "https://github.com/o.zip"}]}
    assert updater.pick_asset(rel, "hamlet_home").endswith("hamlet-home.zip")
    assert updater.pick_asset({"assets": [{"name": "hamlet-home.zip", "browser_download_url": "https://evil.example/hamlet-home.zip"}]}, "hamlet_home") is None


async def test_update_entity_installs_and_restarts(enable_custom_integrations, hass: HomeAssistant, aioclient_mock, tmp_path, monkeypatch, freezer):
    from custom_components.hamlet_home import update as upd  # loaded by HA already
    monkeypatch.setattr(upd, "config_dir", lambda h: tmp_path)
    for mod in ("http", "frontend", "homeassistant"):
        assert await async_setup_component(hass, mod, {})
    asset = "https://github.com/wesselswynand2-prog/hamlet-home/releases/download/v9.9.9/hamlet-home.zip"
    aioclient_mock.get("https://api.github.com/repos/wesselswynand2-prog/hamlet-home/releases/latest",
                       json={"tag_name": "v9.9.9", "body": "Controls tab\n- more", "html_url": "https://github.com/r/v9.9.9",
                             "assets": [{"name": "hamlet-home.zip", "browser_download_url": asset}]})
    aioclient_mock.get("https://api.github.com/repos/wesselswynand2-prog/hamlet-geyser/releases/latest", status=404)
    aioclient_mock.get(asset, content=make_zip())
    restart = async_mock_service(hass, "homeassistant", "restart")
    hass.states.async_set("sensor.pv", "1", {"unit_of_measurement": "kW"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    st = hass.states.get("update.huis_app_update")
    assert st is not None and st.state == "off", st                 # nothing checked yet
    freezer.tick(70)
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    st = hass.states.get("update.huis_app_update")
    assert st.state == "on" and st.attributes["latest_version"] == "9.9.9" and st.attributes["release_summary"] == "Controls tab"
    assert st.attributes["managed_by"] == "Hamlet Home"
    ent0 = next(e for e in hass.data[DOMAIN]["updates"] if e.domain == "hamlet_home")
    stat = ent0.status()
    assert stat["available"] and stat["github"] == "9.9.9" and stat["checked"] and stat["error"] is None and stat["can_install"]
    # HACS is showing the same update -> we step aside; HACS quiet / stale -> we show it
    hass.states.async_set("update.hamlet_home_update", "on", {"release_url": "https://github.com/wesselswynand2-prog/hamlet-home/releases/v9.9.9"})
    ent = next(e for e in hass.data["entity_components"]["update"].entities if e.entity_id == "update.huis_app_update")
    await ent.async_check()
    await hass.async_block_till_done()
    assert hass.states.get("update.huis_app_update").state == "off"
    hass.states.async_set("update.hamlet_home_update", "off", {"release_url": "https://github.com/wesselswynand2-prog/hamlet-home/releases/v0.5.0"})
    await hass.services.async_call("homeassistant", "update_entity", {"entity_id": "update.huis_app_update"}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("update.huis_app_update").state == "on"
    geyser = hass.states.get("update.huis_hamlet_geyser_update")
    assert geyser is None or geyser.state == "off"
    await hass.services.async_call("update", "install", {"entity_id": "update.huis_app_update"}, blocking=True)
    assert (tmp_path / "custom_components/hamlet_home/__init__.py").read_text() == "# new\n"
    assert hass.states.get("update.huis_app_update").state == "off"
    freezer.tick(5)
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len(restart) == 1
    await hass.config_entries.async_unload(entry.entry_id)
