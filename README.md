# Hamlet Home

One app for the home: **Energy** (power flow, today in kWh and rand, power chart, 7/30-day history), **Irrigation** (booster pump with a live water diagram, pressure, dry-run protection, irrigation valves), **Pool** (pool pump timer/solar, pool temperature, pool devices such as a heat pump, lights or chlorinator), **Geyser** (Hamlet Geyser) and **Controls** (lights, gates, aircons, plugs by room).

## Install with HACS (recommended)
1. HACS → ⋮ → **Custom repositories** → paste `https://github.com/wesselswynand2-prog/hamlet-home`, type **Integration** → Add.
2. Search **Hamlet Home** in HACS → Download → restart Home Assistant.
3. Settings → Devices & services → Add integration → **Hamlet Home**.

Updates then show up in Settings like any other update – click **Update** and restart.
For the geyser, add `https://github.com/wesselswynand2-prog/hamlet-geyser` the same way – it appears in the Geyser tab.

## Updates without HACS (built in)
Hamlet Home checks GitHub every 6 hours. A new version of **Hamlet Home** or **Hamlet Geyser** shows up under **Settings → Updates** – click **Install**: it downloads the release, keeps the previous version in `hamlet_backup/`, and restarts Home Assistant. Settings and history are kept.
Admins also see a banner with **Install** on the Energy tab, and the check status (installed, GitHub, last check, errors, **Check now**) under *Installer: app updates*. When HACS already shows a version, Hamlet Home stays quiet (no double notices); if HACS is behind, Hamlet Home shows it.

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
- **Power flow style** – *Blocks* (Victron VRM look: boxes with sparklines and details, animated lines, blue inverter block; on a phone two columns joined by a bus line down the middle). Dots are coloured by source – amber solar, green battery, pink grid – mixed in proportion, with the split shown on the loads box) or *Circles*, switched on the card (remembered per device). Optional readings for the blocks: Configure → **Power flow details** (grid V / A, battery V / A / °C, inverter state such as VE.Bus state).
- **Essential / non-essential loads** (optional, Victron style) – the inverter's AC-out (backed up) and the grid-side AC-in loads. The power flow then shows *Essential* in the middle and a *Non-essential* circle on the grid ("No power" during an outage), and the backup time counts only the essential loads. Victron: *Consumption on output* / *Consumption on input*.
- **Alarms** (bell at the top; clients can set them up): battery current / power too high, too much load, battery low, grid off, geyser not hot by a time, booster pump tripped, inverter fault, and own alarms on any sensor or switch – each with a limit and *for X minutes*. A pop-up on every tab, a Home Assistant notification and push to the phones you tick (critical ones ring loud).
- **Own anemometer** (optional, under *Weather & solar forecast*): wind speed, gust and direction sensors – a *Wind at home* card on the Weather tab and a spinning anemometer in the Scene / Property pictures.
- **Property tab**: the whole property on one animated picture – energy, geyser + collector (from Hamlet Geyser), water tank + booster pump, irrigation zones, pool (pump, filter, heat pump, salt cell, lights, cleaner) and aircon – drawn only for what's set up.
- **Power flow styles**: *Blocks* (Victron VRM style), *Circles*, and *Scene* – the house drawn as a picture (roof solar, pylon, inverter, battery, geyser, loads) with live animated wires coloured by source.
- **Inverter mode** (optional, under *Power flow details*) – e.g. the Victron *Inverter Mode* select. Shown on the inverter block; admins tap the block to switch On / Off / Charger only / Inverter only.
- **Extra loads on the grid side (AC Loads)** (optional) – pick loads such as geysers that are wired before the inverter. They're listed under *AC Loads* instead of *Essential Loads* and their wire comes from the grid side. Geysers set up with Hamlet Geyser go there automatically once the essential / non-essential split is set; to keep one on the essential side, add its power sensor to the normal extra loads.
- **Extra loads** – up to 4 power sensors shown around the house in the power flow; a load drawing nothing (0 W) is hidden until it uses power again.
- **Info under the power flow** – any sensors (e.g. Forecast SOC) or number / input_number entities (e.g. Current DOD). Tap a number to change it with a slider and − / +. Admins only, unless "Clients may change those values" is ticked.

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

## Name in the sidebar
Configure → **Name & icon in the sidebar**: show the client's name (e.g. "Smith Huis") or your company's instead of *Hamlet Home*, with any icon.

## Help
A small "Installed and supported by" footer with the Hamlet Elektries logo (`frontend/logo.png`) sits under every tab and opens Help.
The **?** button at the top right opens the user guide in the app (`frontend/guide.md` – edit that file to change it), with contents and the installer's phone / email / WhatsApp. Admins enter those under *Contact your installer → Edit contact details*.

## Devices (heat pumps, heaters, aircons … on a Shelly)
The **Devices** tab (admins: **+ Add a device**; pool devices go on the **Pool** tab via *Show on*): name, type, the Shelly switch, its power sensor (optional) and rated watts. Each device then works like the pool pump:
- **Timer** (run times), **Solar** (start when spare solar is above X W, keep running while above Y W, run hours per day, only inside the solar hours), **On**, **Off**.
- In Solar mode it takes part in **Energy → Solar priority** with the pool pump and geysers – put them in the order you want.
- **Wait between switches** (default 5 min) protects heat-pump / aircon compressors.
- **Timed stops (Solar mode, pool pump too):** stop when solar stays below the whole house load for X min (default 10), and when the battery gives more than Y W (default 200) for X min (default 5). After such a stop it stays off for the same time. 0 = rule off. The battery rule doesn't apply while a load runs on "battery full".
- Devices with a power sensor are counted in the Costs breakdown; their switches are left off the Controls tab so nobody fights the timer.
- Clients can change the mode, run times and solar levels; adding, removing and the switch are admin only.

## Costs
The **Costs** tab:
- **Today / This month / This year / Since <start date>** – grid cost and savings in rand, and per line kWh and rand: house used (at the grid price), solar, bought, sold, battery used and charged.
- **Where the power went** – today or this month, split into up to 10 loads (Swembad, heat pumps, Geyser 1 and 2 …; the first 5 get their own colour, more are grouped as "Other loads" in the bar) and the rest of the house, with ▲▼ against yesterday / the same days last month. Pick the loads under Configure → **Costs & load breakdown** (power sensors in W; empty = extra loads, pool pump and the geysers – a geyser without a meter, e.g. on a Geyserwise, uses Hamlet Geyser's estimated *Geyser power*).
- **Daily** (last 14 days) and **Monthly** (last 12 months) bar charts – kWh or rand.
- **Battery cost & life** – enter the price, how many kWh it's good for (cycles × usable kWh) and the install date: cost per kWh cycled, life used, kWh and rand left, years left at the current use.
- **Costs settings** (admin) – *Count totals from* (e.g. 2024-04-01) and earlier electricity prices with the day each ended, so old months use the price of the time.

History: daily totals are kept for years. On first start (and when the start date or loads change) the app reads Home Assistant's **long-term statistics** back to the start date (default 2 years), so the totals go back as far as your sensors were recorded. Days the app measured itself are never overwritten.

## Weather
The **Weather** tab appears when there's a weather entity or a solar forecast sensor (found automatically; change under Configure → **Weather & solar forecast**):
- **Now** – condition, temperature, today's high / low, feels-like, cloud cover, wind (with direction and gusts), humidity, rain today, UV, pressure.
- **Solar forecast** – Solcast (or Forecast.Solar) today and tomorrow in kWh, what's been made so far, what's still to come, and a chart of the forecast (with its likely range) against your actual solar today.
- **Forecast** – 7 days (high / low and rain with chance) or the next 24 hours (temperature, rain, wind).
- **Extra sensors** – any sensors you pick, e.g. Forecast SOC and DOD.
- The solar forecast card (with the extra sensors) is also shown on the **Energy** tab, under the power flow.
- **Weather settings** (admin, bottom of the page) – rain in mm or inches, wind in km/h, m/s, mph or knots.

## Controls
The **Controls** tab fills itself from Home Assistant: every light, switch, plug, aircon, fan, blind, lock, scene and script, grouped by the **area** it's in (Settings → Areas – give devices an area and they land in that room). Things the other tabs already run (booster pump, pool pump, irrigation valves, geysers) are left out so nobody fights the automation.

- **Gates & doors** get big buttons. A relay (Shelly on the gate motor) gets *Open / close*: relay on, then off after the pulse length (1 s). A cover (garage door) gets *Open / Stop / Close*. They ask "Tap again to confirm" first so a pocket tap doesn't open the gate. Switches with gate / hek / garage in the name are picked up as gates automatically.
- **Aircons**: on/off, − / + temperature and the modes the unit supports. **Lights**: tap to switch, slider for dimmable lights. **Plugs** show their watts when the Shelly has a power sensor.
- **Quick actions** (scenes / scripts) and *All lights off* sit at the top; each room has *Lights off*.
- During load-shedding, devices that lost power show **No power** instead of *Offline*.
- **+ Add** (admin): search and add a switch, light, gate … in one tap, then name it, set its type, ★ favourite. **Edit**: tap any control to rename / change type / favourite / remove. **All devices & rooms…** (the full list): tick what clients see, give shorter names, change the tile type (e.g. make a switch a gate), ★ favourites (shown at the top), room order and names, Confirm on / off, gate pulse length. Search helps when the inverter brings dozens of switches.

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
Add valves straight on the page (admin): **Edit valves → + Add valve**, type a few letters of the valve's switch to search (by name, area or entity id; switch, valve or input_boolean) and tap it, give it a name and minutes. Reorder with ↑ ↓.
- **Run** a single valve, **Run all now**, **Next valve**, **Stop**.
- **Programs**: start time + days; waters the chosen valves (or all) one after another. **▶ Now** runs a program straight away.
- **Watering amount %** scales every valve's time (e.g. 60 % in winter).
- **Water use** (installer: Irrigation tab → Water use → Count the water): litres per day for the house and per valve, this month and in total, from the pump curve (affinity laws on the datasheet curve – default DAB K 35/40 T – using the VFD's Hz and the pressure; fixed-speed pumps use the rated Hz while running) or from a flow meter sensor. Suction lift and a bucket-test correction factor are adjustable. Adds `sensor.<home>_water_flow` (L/min), `sensor.<home>_water_used_today` (L) and `sensor.<home>_water_used_total` (m³ – add it to the Energy dashboard under Water). Replaces a `pump_water.yaml` package – remove the package so the water isn't counted twice.
- **Pump card** (installer: Irrigation tab → Pump card): paste any dashboard card's YAML (e.g. `type: custom:delta-cp2000-card` with its entities) and it is shown beside the booster pump. Custom cards installed with HACS are loaded automatically.
- **Tank estimate without a level sensor** (installer: Irrigation tab → Tank & borehole): tank size, the borehole pump's switch/binary sensor/power sensor and the float's switch-on level. The level snaps to that level when the borehole starts and to full when it stops; in between it subtracts the water counted from the booster (needs Water use → Count the water) and adds the borehole yield learnt from earlier fills. Alarms: Water tank low, Borehole running too long (default 3× its usual fill time).
- **Pressure per valve** (bar, optional): when the booster's set point (Configure → Water, pump & pool → water set point) is a `number`/`input_number` – e.g. the VFD's set point – each valve can have its own pressure. It's set when the valve opens and the normal value is put back when watering ends (also after a restart). kPa, psi and bar set points are converted.
- **Rain**: skip programs when the rain sensor is wet or the weather entity says rain; **Rain delay** 24 / 48 / 72 h.
- **Pump / master valve** (optional): switched on with the first valve and off before the last valve closes; between valves the next one opens before the previous closes, so the pump never pushes against closed valves.
- **Safety**: a valve opened by hand (or left open over a restart) closes after its own time; no valve runs longer than the maximum (default 120 min); the booster pump's "running non-stop" alert is muted while irrigation runs.
- Sensor `sensor.<home>_irrigation`: Idle / Watering <valve> / Skipping, with time left and the next program.
- Turn off any old irrigation automations (e.g. "Auto Kamer tuin") so they don't fight with the programs.
