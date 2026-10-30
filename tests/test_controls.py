"""Controls tab: picking, grouping and settings."""
import importlib.util
import pathlib

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

# load by path: importing the package would shadow Home Assistant's custom_components folder
_spec = importlib.util.spec_from_file_location("hh_controls", pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/controls.py")
controls = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(controls)

DOMAIN = "hamlet_home"
AREAS = {"kantoor": {"name": "Kantoor", "icon": "mdi:desk"}, "kombuis": {"name": "Kombuis", "icon": None}}


def e(eid, name, area=None, dc=None, power=None):
    return {"entity_id": eid, "name": name, "area_id": area, "device_class": dc, "attrs": {}, "power_entity": power}


def test_kinds():
    assert controls.default_kind("switch.wynand_garage", "Wynand Garage", {}, None) == "gate"
    assert controls.default_kind("switch.voorhek", "Voor Hek", {}, None) == "gate"
    assert controls.default_kind("cover.garage", "Garage door", {}, "garage") == "garage"
    assert controls.default_kind("cover.blinds", "Sitkamer blinds", {}, "shade") == "blind"
    assert controls.default_kind("climate.kantoor", "Kantoor Aircon", {}, None) == "aircon"
    assert controls.default_kind("switch.plug", "Plug", {}, "outlet") == "plug"
    assert controls.default_kind("button.restart", "Restart", {}, None) == "action"
    assert not controls.auto_include("button.restart", "action")
    assert controls.auto_include("button.hek", "gate")
    assert controls.short_name("Kantoor Lig", "Kantoor") == "Lig"
    assert controls.short_name("Kantoor", "Kantoor") == "Kantoor"


def test_build_groups_rooms_gates_favourites():
    ents = [e("light.kantoor_lig", "Kantoor Lig", "kantoor"), e("climate.kantoor", "Kantoor Aircon", "kantoor"),
            e("switch.ketel", "Ketel", "kombuis", power="sensor.ketel_power"), e("switch.wynand_garage", "Wynand Garage"),
            e("scene.night", "Night"), e("light.stoep", "Stoep"), e("button.reboot", "Reboot")]
    lay = controls.build(ents, AREAS, {"favourites": ["switch.wynand_garage", "light.kantoor_lig"]})
    assert [r["name"] for r in lay["rooms"]] == ["Kantoor", "Kombuis", "Other"]
    kantoor = lay["rooms"][0]["items"]
    assert [i["name"] for i in kantoor] == ["Aircon", "Lig"]           # aircons first, room prefix dropped
    assert lay["rooms"][1]["items"][0]["power_entity"] == "sensor.ketel_power"
    assert [g["entity_id"] for g in lay["gates"]] == ["switch.wynand_garage"] and lay["gates"][0]["confirm"]
    assert [a["entity_id"] for a in lay["actions"]] == ["scene.night"]  # button not picked automatically
    assert [f["entity_id"] for f in lay["favourites"]] == ["switch.wynand_garage", "light.kantoor_lig"]
    assert "all" not in lay
    # installer choices
    s = {"hidden": ["light.stoep"], "added": ["button.reboot"], "names": {"switch.ketel": "Kettle"},
         "room_order": ["kombuis"], "room_names": {"kantoor": "Office"}, "confirm": {"switch.wynand_garage": False},
         "kinds": {"switch.ketel": "plug"}}
    lay = controls.build(ents, AREAS, s, admin=True)
    assert [r["name"] for r in lay["rooms"]] == ["Kombuis", "Office"]   # "Other" gone with the hidden light
    assert lay["rooms"][0]["items"][0] == {**lay["rooms"][0]["items"][0], "name": "Kettle", "kind": "plug"}
    assert not lay["gates"][0]["confirm"]
    assert "button.reboot" in [a["entity_id"] for a in lay["actions"]]
    stoep = next(i for i in lay["all"] if i["entity_id"] == "light.stoep")
    assert stoep["shown"] is False


def test_validate():
    known = {"light.a", "switch.b"}
    out = controls.validate({"hidden": ["light.a", "light.gone"], "names": {"light.a": "  Lamp "}, "kinds": {"switch.b": "plug"},
                             "pulse_seconds": 2}, known)
    assert out == {"hidden": ["light.a"], "names": {"light.a": "Lamp"}, "kinds": {"switch.b": "plug"}, "pulse_seconds": 2.0}
    for bad in ({"kinds": {"switch.b": "rocket"}}, {"pulse_seconds": 60}, {"hidden": "light.a"}):
        try:
            controls.validate(bad, known)
            raise AssertionError(bad)
        except ValueError:
            pass


async def test_controls_in_home_assistant(enable_custom_integrations, hass: HomeAssistant, hass_ws_client, hass_admin_user):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    area = ar.async_get(hass).async_create("Kantoor")
    src = MockConfigEntry(domain="shelly")
    src.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=src.entry_id, identifiers={("shelly", "plug1")}, name="Kantoor Plug")
    dr.async_get(hass).async_update_device(dev.id, area_id=area.id)
    reg = er.async_get(hass)
    reg.async_get_or_create("switch", "shelly", "plug1", device_id=dev.id, suggested_object_id="kantoor_plug")
    reg.async_get_or_create("sensor", "shelly", "plug1-power", device_id=dev.id, suggested_object_id="kantoor_plug_power",
                            original_device_class="power")
    reg.async_get_or_create("switch", "shelly", "cfg", device_id=dev.id, suggested_object_id="kantoor_plug_led",
                            entity_category=er.EntityCategory.CONFIG)
    hass.states.async_set("switch.kantoor_plug", "off", {"friendly_name": "Kantoor Plug"})
    hass.states.async_set("switch.kantoor_plug_led", "on", {"friendly_name": "LED"})
    hass.states.async_set("switch.hek", "off", {"friendly_name": "Voor Hek"})
    hass.states.async_set("switch.swembad", "off", {"friendly_name": "Swembad"})
    hass.states.async_set("sensor.pv", "1", {"unit_of_measurement": "kW"})
    entry = MockConfigEntry(domain=DOMAIN, title="Huis", data={"name": "Huis", "preset": "victron", "solar_power": ["sensor.pv"]},
                            options={"pool_switch": "switch.swembad"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/controls"})
    r = (await ws.receive_json())["result"]
    assert [rm["name"] for rm in r["rooms"]] == ["Kantoor"]
    plug = r["rooms"][0]["items"][0]
    assert plug["entity_id"] == "switch.kantoor_plug" and plug["name"] == "Plug" and plug["power_entity"] == "sensor.kantoor_plug_power"
    ids = [i["entity_id"] for i in r["all"]]
    assert "switch.kantoor_plug_led" not in ids and "switch.swembad" not in ids   # config entity / pool run by the Water tab
    assert [g["entity_id"] for g in r["gates"]] == ["switch.hek"]

    await ws.send_json({"id": 2, "type": f"{DOMAIN}/controls_settings", "settings": {"favourites": ["switch.hek"], "names": {"switch.hek": "Gate"}}})
    r = await ws.receive_json()
    assert r["success"] and r["result"]["favourites"][0]["name"] == "Gate"

    on = async_mock_service(hass, "switch", "turn_on")
    off = async_mock_service(hass, "switch", "turn_off")
    hass.data[DOMAIN]["controls"].settings["pulse_seconds"] = 0.2
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/controls_pulse", "entity_id": "switch.hek"})
    assert (await ws.receive_json())["success"]
    assert len(on) == 1 and len(off) == 1
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/controls_pulse", "entity_id": "switch.kantoor_plug"})
    assert not (await ws.receive_json())["success"]          # only gates can be pulsed
    await hass.config_entries.async_unload(entry.entry_id)
