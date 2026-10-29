"""Constants for Hamlet Home."""
DOMAIN = "hamlet_home"
VERSION = "0.5.0"

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
KEEP_DAYS = 400

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
WATER_KEYS = (CONF_WATER_PRESSURE, CONF_WATER_SETPOINT, CONF_PUMP_SWITCH, CONF_PUMP_POWER, CONF_PUMP_HZ,
              CONF_PUMP_AMPS, CONF_PUMP_SPEED, CONF_POOL_SWITCH, CONF_POOL_POWER, CONF_TANK_LEVEL)
