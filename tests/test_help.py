"""Help page: guide file is served, installer contact details are saved (admins only)."""
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "hamlet_home"


async def test_help_guide_and_contact(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user, hass_client):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    hass.states.async_set("sensor.pv", "1", {"unit_of_measurement": "kW"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    client = await hass_client()
    for path in ("/hamlet_home_static/guide.md", "/hamlet_home_static/hamlet-home-help.js"):
        r = await client.get(path)
        assert r.status == 200, path
    text = await (await client.get("/hamlet_home_static/guide.md")).text()
    assert "## Energy tab" in text and "## Troubleshooting and help" in text

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/help_contact", "contact": {"phone": " 082 123 4567 ", "email": "info@example.co.za", "note": "Mon–Fri 8–5"}})
    r = await ws.receive_json()
    assert r["success"] and r["result"]["phone"] == "082 123 4567" and r["result"]["name"] == "Hamlet Elektries"
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/help_contact", "contact": {"email": "not-an-email"}})
    assert not (await ws.receive_json())["success"]
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/state"})
    assert (await ws.receive_json())["result"]["help_contact"]["email"] == "info@example.co.za"
    await hass.config_entries.async_unload(entry.entry_id)
