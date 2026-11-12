"""Constants for Hamlet Home."""
DOMAIN = "hamlet_home"
VERSION = "0.23.2"

PANEL_URL_PATH = "hamlet-home"
PANEL_COMPONENT = "hamlet-home-panel"
STATIC_URL = "/hamlet_home_static"

CONF_NAME = "name"
CONF_PRESET = "preset"
CONF_SOLAR_POWER = "solar_power"
CONF_SOLAR_AC = "solar_ac_power"
CONF_SOLAR_DC = "solar_dc_power"
CONF_LOAD_POWER = "load_power"
CONF_GRID_POWER = "grid_power"
CONF_GRID_STATUS = "grid_status"
CONF_BATTERY_POWER = "battery_power"
CONF_BATTERY_SOC = "battery_soc"
CONF_BATTERY_INVERT = "battery_invert"
CONF_GRID_INVERT = "grid_invert"
CONF_EXTRA_LOADS = "extra_loads"

PRESETS = ["victron", "sunsynk", "other"]
PRESET_INVERT = {
    "victron": {CONF_BATTERY_INVERT: False, CONF_GRID_INVERT: False},
    "sunsynk": {CONF_BATTERY_INVERT: True, CONF_GRID_INVERT: False},
    "other": {CONF_BATTERY_INVERT: False, CONF_GRID_INVERT: False},
}

SIGNAL_UPDATE = f"{DOMAIN}_update"
TICK_SECONDS = 30
PUSH_MIN_SECONDS = 2
KEEP_DAYS = 4000   # daily totals (about 11 years; a few hundred kB)

# Water & pump (all optional)
CONF_WATER_PRESSURE = "water_pressure"
CONF_WATER_SETPOINT = "water_setpoint"
CONF_PUMP_SWITCH = "pump_switch"
CONF_PUMP_POWER = "pump_power"
CONF_PUMP_HZ = "pump_hz"
CONF_PUMP_AMPS = "pump_amps"
CONF_PUMP_SPEED = "pump_speed"
CONF_POOL_SWITCH = "pool_switch"
CONF_POOL_POWER = "pool_power"
CONF_TANK_LEVEL = "tank_level"
CONF_POOL_TEMP = "pool_temp"
WATER_KEYS = (CONF_WATER_PRESSURE, CONF_WATER_SETPOINT, CONF_PUMP_SWITCH, CONF_PUMP_POWER, CONF_PUMP_HZ,
              CONF_PUMP_AMPS, CONF_PUMP_SPEED, CONF_POOL_SWITCH, CONF_POOL_POWER, CONF_TANK_LEVEL, CONF_POOL_TEMP)

# Weather & solar forecast (all optional; found automatically when empty)
CONF_WEATHER = "weather_entity"
CONF_PV_TODAY = "pv_forecast_today"
CONF_PV_TOMORROW = "pv_forecast_tomorrow"
CONF_PV_REMAINING = "pv_forecast_remaining"
CONF_WEATHER_EXTRAS = "weather_extras"
CONF_WIND_SPEED = "wind_speed"          # own anemometer (optional)
CONF_WIND_GUST = "wind_gust"
CONF_WIND_DIR = "wind_direction"
WEATHER_KEYS = (CONF_WEATHER, CONF_PV_TODAY, CONF_PV_TOMORROW, CONF_PV_REMAINING, CONF_WEATHER_EXTRAS, CONF_WIND_SPEED, CONF_WIND_GUST, CONF_WIND_DIR)

# Costs tab
CONF_COST_LOADS = "cost_loads"   # power sensors (W) for the load breakdown, max 5
MAX_COST_LOADS = 10

# Info tiles under the power flow (sensor / number / input_number), e.g. Forecast SOC, Current DOD
CONF_FLOW_INFO = "flow_info"
CONF_FLOW_INFO_EDIT = "flow_info_clients_edit"

# Name and icon in the sidebar / top of the page (e.g. the client's name)
CONF_APP_TITLE = "app_title"
CONF_APP_ICON = "app_icon"
DEFAULT_APP_TITLE = "Hamlet Home"
DEFAULT_APP_ICON = "mdi:home-lightning-bolt"

# Victron-style split: AC-out (essential / backed up) and AC-in side (non-essential) loads, both optional
CONF_LOAD_ESSENTIAL = "load_essential"
CONF_LOAD_NONESSENTIAL = "load_nonessential"

# Optional details for the Victron-style "Blocks" power flow
FLOW_DETAIL_KEYS = ("grid_voltage", "grid_current", "battery_voltage", "battery_current", "battery_temp", "inverter_state", "inverter_mode")
