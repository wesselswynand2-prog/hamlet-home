# Hamlet Home

One app for the home: **Energy** (power flow, today in kWh and rand, power chart, 7/30-day history), **Water** (booster pump, pressure, dry-run protection, pool pump timer, irrigation) **Geyser** (Hamlet Geyser) and **Controls** (lights, gates, aircons, plugs by room).

## Install with HACS (recommended)
1. HACS → ⋮ → **Custom repositories** → paste `https://github.com/wesselswynand2-prog/hamlet-home`, type **Integration** → Add.
2. Search **Hamlet Home** in HACS → Download → restart Home Assistant.
3. Settings → Devices & services → Add integration → **Hamlet Home**.

Updates then show up in Settings like any other update – click **Update** and restart.
For the geyser, add `https://github.com/wesselswynand2-prog/hamlet-geyser` the same way – it appears in the Geyser tab.

## Install or update without HACS (zip + one command)
1. Upload `hamlet-home.zip` to the Home Assistant config folder.
2. Terminal & SSH add-on:
   - first time: `cd /config 2>/dev/null || cd /homeassistant; rm -rf /tmp/hh; mkdir -p /tmp/hh && unzip -oq "$(ls -t hamlet-*.zip | head -1)" -d /tmp/hh && sh "$(find /tmp/hh -name hamlet-update.sh | head -1)"`
   - after that: `sh /config/hamlet-update.sh`
3. Settings → Devices & services → Add integration → **Hamlet Home**. If Hamlet Geyser is installed, its sensors are filled in for you.

## Energy setup
- **Solar** – either one total (all PV sensors), or split:
  - **Grid-tie PV (AC)** – an AC-coupled PV inverter (Fronius etc. / Victron "PV on AC output"),
  - **MPPT PV (DC)** – each MPPT on the DC bus.
  When split, the power flow shows the grid-tie PV feeding the house and the MPPTs feeding the DC bus between the battery and the inverter, with the inverter's own flow (inverting / charging from AC) in the middle.
- **House load** – optional, all phases; left empty it's calculated as solar + grid − battery.
- **Grid** – grid power, + while buying (tick invert if your sensor is + while selling).
- **Grid available** – AC-in voltage, a grid-connected sensor or Victron's grid-lost alarm.
- **Battery** – power (+ while charging; Sunsynk/Deye usually need invert) and state of charge.
- **Extra loads** – up to 4 power sensors shown around the house in the power flow.

## How it works
- On start it reads today's and yesterday's history from the recorder, so the charts and today's totals are complete straight away. Older days (up to 30) come from long-term statistics when your sensors have them, otherwise history builds up day by day.
- kWh are worked out from the power sensors, time-weighted. Gaps longer than 10 minutes (Home Assistant was off) aren't counted.
- **Grid cost** = bought × price − sold × feed-in + fixed daily charge. **Saved by solar** = what the house used × price − grid cost. Changing the price recalculates past days.
- Sensors (for any dashboard): solar / house / bought / sold / battery charged / battery used today (kWh), grid cost today, solar savings today, self-sufficiency today.

## Battery: backup time and time to full
The top of the **Today** card shows:
- **If the power goes off** – how long the battery would carry the house at the current load (house minus what solar covers), down to the reserve level, with the time it would run out. During an outage it uses what the battery is actually giving.
- **Full in** – how long until the battery is full at the current charge rate. (Charging slows near 100 %, so the last bit can take a little longer.)

Battery size: leave it empty and it's measured from the history (needs one stretch where the battery drops at least 15 %, normally the first night), or type the usable size under **Battery settings** (admin). Sensors: `sensor.<name>_battery_backup_time`, `sensor.<name>_battery_full_in` (hours).

## Controls
The **Controls** tab fills itself from Home Assistant: every light, switch, plug, aircon, fan, blind, lock, scene and script, grouped by the **area** it's in (Settings → Areas – give devices an area and they land in that room). Things the other tabs already run (booster pump, pool pump, irrigation valves, geysers) are left out so nobody fights the automation.

- **Gates & doors** get big buttons. A relay (Shelly on the gate motor) gets *Open / close*: relay on, then off after the pulse length (1 s). A cover (garage door) gets *Open / Stop / Close*. They ask "Tap again to confirm" first so a pocket tap doesn't open the gate. Switches with gate / hek / garage in the name are picked up as gates automatically.
- **Aircons**: on/off, − / + temperature and the modes the unit supports. **Lights**: tap to switch, slider for dimmable lights. **Plugs** show their watts when the Shelly has a power sensor.
- **Quick actions** (scenes / scripts) and *All lights off* sit at the top; each room has *Lights off*.
- During load-shedding, devices that lost power show **No power** instead of *Offline*.
- **Edit page** (admin): tick what clients see, give shorter names, change the tile type (e.g. make a switch a gate), ★ favourites (shown at the top), room order and names, Confirm on / off, gate pulse length. Search helps when the inverter brings dozens of switches.

## Water & pump setup
Settings → Devices & services → Hamlet Home → Configure → **Water & pump**. Everything is optional:
pressure (bar / kPa / psi), set point, booster pump switch, power, Hz, amps, speed, pool pump switch and power, tank level.

- **Running** is taken from power (> 20 W, adjustable), else Hz (> 1), else the switch.
- **Dry-run protection** (off by default, admin): pump running but pressure below 0.5 bar for 60 s → pump switched off, alert sent, red banner with *Reset & start pump*. If someone switches it on elsewhere it is switched off again until reset.
- **Alerts**: pump running non-stop for 30 min (leak / open tap), pressure staying low (optional). Shown in Home Assistant notifications, and on the phone if you fill in the notify service (e.g. `notify.mobile_app_wynand`).
- **Short-cycling hint**: more than ~12 starts an hour shows a note to check the pressure tank or a dripping tap.
- **Pool pump**: Timer / Solar / On / Off.
  - *Timer*: switches at the start and end of each run time; switching it by hand in between is left alone.
  - *Solar*: only runs on spare solar – starts above 1.0 kW spare (not counting the pump), keeps running above 0.5 kW, only inside the run times (now "solar hours"), and stops once it ran its hours for the day (default 6 h, 0 = no limit). At least 5 minutes between switching, to protect the pump.
- Sensors: booster pump run time today, starts today, pool pump run time today.

## Solar priority (pool pump + geysers)
Energy tab → **Solar priority**. Every geyser (with solar heating on) and the pool pump (in Solar mode) are listed; order them with ↑ ↓.
- Spare solar is handed out from the top: the first load gets it if there's enough for its *start* value; what's left goes down the list, so a small pool pump can still run on solar the geyser can't use.
- When solar drops, loads are checked against their *keep* value from the top, so the **bottom one switches off first**.
- Battery full (default ≥ 95 %): the inverter holds the panels back, so loads start one at a time in this order; if the battery then drains more than 600 W, the lowest one stops first.
- Geyser timers, Boost and On are not affected – only heating on spare solar follows the priority.
- Switch *Share spare solar by priority* off to let each load use its own solar settings again.

## Irrigation (Water tab)
Add valves straight on the page (admin): **Edit valves → + Add valve**, pick the valve's switch (switch, valve or input_boolean), give it a name and minutes. Reorder with ↑ ↓.
- **Run** a single valve, **Run all now**, **Next valve**, **Stop**.
- **Programs**: start time + days; waters the chosen valves (or all) one after another. **▶ Now** runs a program straight away.
- **Watering amount %** scales every valve's time (e.g. 60 % in winter).
- **Rain**: skip programs when the rain sensor is wet or the weather entity says rain; **Rain delay** 24 / 48 / 72 h.
- **Pump / master valve** (optional): switched on with the first valve and off before the last valve closes; between valves the next one opens before the previous closes, so the pump never pushes against closed valves.
- **Safety**: a valve opened by hand (or left open over a restart) closes after its own time; no valve runs longer than the maximum (default 120 min); the booster pump's "running non-stop" alert is muted while irrigation runs.
- Sensor `sensor.<home>_irrigation`: Idle / Watering <valve> / Skipping, with time left and the next program.
- Turn off any old irrigation automations (e.g. "Auto Kamer tuin") so they don't fight with the programs.
