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


async def test_sidebar_name_and_icon(enable_custom_integrations, hass: HomeAssistant):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    hass.states.async_set("sensor.pv", "1", {"unit_of_measurement": "kW"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    panel = hass.data["frontend_panels"]["hamlet-home"]
    assert panel.sidebar_title == "Hamlet Home" and panel.config["title"] == "Hamlet Home"

    flow = await hass.config_entries.options.async_init(entry.entry_id)
    assert "app" in flow["menu_options"]
    flow = await hass.config_entries.options.async_configure(flow["flow_id"], {"next_step_id": "app"})
    flow = await hass.config_entries.options.async_configure(flow["flow_id"], {"app_title": "  Smith Huis ", "app_icon": "mdi:home-heart"})
    await hass.async_block_till_done(wait_background_tasks=True)
    panel = hass.data["frontend_panels"]["hamlet-home"]
    assert panel.sidebar_title == "Smith Huis" and panel.sidebar_icon == "mdi:home-heart"
    assert panel.config["title"] == "Smith Huis"
    # empty name falls back to Hamlet Home
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(flow["flow_id"], {"next_step_id": "app"})
    await hass.config_entries.options.async_configure(flow["flow_id"], {"app_title": ""})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert hass.data["frontend_panels"]["hamlet-home"].sidebar_title == "Hamlet Home"
    await hass.config_entries.async_unload(entry.entry_id)
