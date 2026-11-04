## Welcome

Hamlet Home runs your solar, battery, geyser, pumps and devices from one page in Home Assistant, and shows what it all costs and saves. Most of it works by itself; this guide shows what each screen means and what you can change.

**Where to find it**

- **On a computer:** open Home Assistant and click **Hamlet Home** in the menu on the left.
- **On your phone:** open the Home Assistant app, tap the menu (☰) and choose **Hamlet Home**.

**The tabs along the top**

| Tab | What it's for |
| --- | --- |
| Energy | Live power flow, today's totals, battery time left |
| Costs | What the house used and what solar saved, in kWh and rand |
| Weather | Weather and the solar forecast |
| Water | Booster pump, pool pump and garden irrigation |
| Geyser | Heating times, solar heating, temperature |
| Devices | Heat pumps, heaters and other devices on a timer or solar |
| Controls | Lights, gates, garage doors, aircons and plugs by room |

You only see the tabs your installer has set up. On a phone the tabs show icons only – tap one to open it.

**What you can change, and what your installer sets**

You can change modes, times and temperatures. Things that protect equipment – sensors, safety limits, battery settings – are set by your installer and are hidden from you.

## Energy tab

The Energy tab shows where your power comes from right now, and how long the battery will last.

**Power flow**

- The circles are your solar panels, the grid, the house, the battery and the inverter. Extra circles on the right are single loads such as a fridge or pump.
- Moving dots show which way power flows. Faster dots mean more power.
- The grid circle says **Down** when there's no grid power (load-shedding or an outage).
- The battery circle shows its charge in %. "+" means charging, "−" means the battery is feeding the house.

**Info tiles under the power flow**

Your installer can add tiles such as *Forecast SOC* or *Current DOD*. A tile with a pencil can be changed: tap it, move the slider or use − and +, then tap **Save**.

**Today card**

- **If the power goes off:** how long the battery would carry the house at what you're using now, and the time it would run out. It stops at the reserve level your installer set (for example 20%), so the battery is never fully emptied. During the day it may say *Solar covers it*.
- **Full in:** how long until the battery is full at the current charging rate. The last few percent charge slower, so it can take a bit longer.
- **Grid cost today** and **Saved by solar** in rand, and today's kWh: solar produced, house used, bought and sold, battery charged and used.
- **Where the house's power came from:** the share from solar and battery against the grid.

**Solar forecast**

Today's expected solar in kWh, how much you've made so far, what's still to come, and tomorrow's forecast. The chart shows the forecast as a grey dashed line with its likely range, and your real solar as an orange line.

**Solar priority**

This card decides which device gets spare solar first. See *Devices and Solar priority* below.

**Charts lower down**

- **Power:** today's or yesterday's solar, house, grid and battery through the day. Hover or tap the chart to read the values.
- **History:** kWh per day for the last 7 or 30 days.
- **Electricity price:** what you pay per kWh. Change it here when your tariff goes up, so the rand figures stay right.

## Costs tab

The Costs tab shows what your electricity cost and what the solar system saved – today, this month, this year and since your system was installed.

**The four cards at the top**

Each card shows the **Grid cost** (what you paid the municipality or Eskom) and what was **Saved**. Below that, every line shows kWh and the same amount in rand:

| Line | Means |
| --- | --- |
| House used | Everything the house used, and what it would cost if it all came from the grid |
| Solar | What the panels made, valued at the grid price |
| Bought | What you bought from the grid |
| Sold | What you sold back (only if you feed in) |
| Battery used | What the battery gave the house, valued at the grid price |
| Battery charged | What went into the battery |

"Rand" always means kWh times your grid price. Older months use the price that applied then, if your installer entered your earlier prices.

**Where the power went**

The bar splits today's or this month's use into your big loads – pool, geysers, heat pumps – and the rest of the house. The arrows compare with yesterday, or with the same days last month: ▲ means more, ▼ means less. Tap **Today** or **This month** to switch.

**Daily and Monthly charts**

Bars for bought from grid, house used and solar, per day for the last two weeks and per month for the last year. Tap **kWh** or **Rand** to switch. Tap or hover a bar for the exact numbers.

**Battery cost & life**

If your installer entered the battery's price and lifetime, this card shows how much of its life is used, what's left in kWh and rand, about how many years it has left at your current use, and what each kWh from the battery costs in wear.

## Weather tab

The Weather tab shows the weather now, the coming days, and how much solar to expect.

- **Now:** the condition and temperature, today's high and low, how it feels, cloud cover, wind with its direction, humidity, rain today, UV and pressure.
- **Solar forecast:** the same card as on the Energy tab – today, still to come, and tomorrow. A cloudy tomorrow is a good reason to run the pool or washing machine today.
- **Forecast:** tap **Days** for the next week (orange line = high, blue dashed line = low, blue bars = rain with the chance underneath) or **Hours** for the next 24 hours.

Rain in mm or inches and wind in km/h or m/s are set by your installer under *Weather settings*.

## Water tab

The Water tab runs the booster pump, the pool pump and the garden irrigation.

**Booster pump**

- Shows whether the pump is running, the water pressure, and (if fitted) its speed, Hz and power.
- **Dry-run protection:** if the pump runs without building pressure (for example the tank is empty), the app switches it off to protect it and sends you a message. Fix the water supply first, then tap **Reset** to switch it back on.
- You may also get a message if the pump runs non-stop for a long time – check for a leak or a tap left open.

**Pool pump – the four modes**

| Mode | What it does |
| --- | --- |
| Timer | Runs during the run times you set |
| Solar | Runs only on spare solar, inside the solar hours, until the daily run hours are done |
| On | Runs until you choose another mode |
| Off | Stays off |

**Solar mode settings**

- **Start when spare solar is above** – how much spare solar is needed before the pump starts (for example 1000 W).
- **Keep running while above** – it keeps running until spare solar drops below this (for example 500 W).
- **Run hours per day** – it stops once it has run this long today. 0 = no limit.
- **Stop when solar is below the house load for** – if the panels give less than the whole house uses for this many minutes, the pump stops. A passing cloud doesn't count.
- **Stop when the battery gives more than … W for … min** – stops the pump if the battery starts feeding the house.
- After one of these stops it waits the same time before trying again. Tap **Save** after changing a number.
- **Solar hours:** the pump only runs on solar inside these times.

The line next to the status always says why the pump is on or off, for example *Waiting for solar – needs 0.9 kW more solar · 3.6/6 h*.

**Run times (Timer mode)**

Tap **+ Add run time**, set the start and end, tap the days, then tap **Save**. Switch a run time off with its slider without deleting it.

**Irrigation**

- The valves water one after another; the next one opens just before the previous one closes.
- Run all valves, one valve, or a program by hand, and tap **Stop** to end it.
- **Rain delay** skips watering for the hours you choose. If a rain sensor is fitted, watering is skipped after rain by itself.
- A valve you open by hand closes again by itself after its set time, so it can't be left running.

## Geyser tab

The Geyser tab heats your water at the times you choose, uses spare solar first, and protects the battery.

**Modes**

| Mode | What it does |
| --- | --- |
| Auto | Heats during your heating times and on spare solar (normal setting) |
| Boost | Heats now for 30 min, 1 h or 2 h, then goes back to Auto |
| On | Heats until you choose another mode (the safety limit still applies) |
| Off | No heating |

Use the app's modes rather than the geyser's own switch: in Auto the app switches the geyser back to what it should be.

**Heating times**

Add a time, choose the days and the temperature you want, then **Save**. For example 05:00–06:00 at 55 °C on weekdays. If the water is already hot enough, it won't heat.

**Solar heating**

When there's spare solar, the geyser heats to a higher temperature for free. If there are several geysers, a pool or heat pumps, the order is set under **Solar priority**.

**Battery protection**

The geyser won't heat from the battery when it's low (your installer sets the level). During load-shedding, heating times only run if the battery is full enough. Heating from solar still works.

**Solar collector (if you have one)**

Shows the collector and tank temperatures and whether the pump is running. If the app runs the collector pump, it has its own Auto / On / Off. In Auto the pump runs when the collector is hotter than the tank, and it protects against overheating and frost.

## Devices and Solar priority

Heat pumps, heaters, aircons and other devices on a smart switch work just like the pool pump, and share spare solar in the order you choose.

**Devices tab**

Each device has its own card with the same four modes as the pool pump – **Timer, Solar, On, Off** – and the same solar settings, run times and stop rules (see *Water tab*). The card also shows its power, run time today and how many times it started.

Heat pumps and aircons wait a few minutes between switching on and off to protect the compressor. If the card says *waiting a few minutes to protect it*, that's normal.

Your installer adds and removes devices.

**Solar priority (on the Energy tab)**

When there isn't enough sun for everything, the device at the top gets solar first. When the sun drops, the one at the **bottom switches off first**.

1. Open the **Energy** tab and find **Solar priority**.
2. Use the ↑ and ↓ arrows to put the devices in the order you want, for example geyser, then pool heat pump, then pool pump.
3. Each line says what it's doing now, for example *Running on solar* or *Needs 0.6 kW more solar*.

Only devices in **Solar** mode (and geysers with solar heating on) take part. Devices in Timer, On or Off are not affected.

## Controls tab

The Controls tab lets you switch lights, gates, aircons and plugs, grouped by room.

- **Quick buttons at the top:** your scenes such as *Night* or *Away*, and **All lights off**.
- **Favourites:** the devices you use most, at the top.
- **Gates & doors:** tap **Open / close**, then tap again within 4 seconds to confirm – so a gate never opens from a tap in your pocket. A garage door that reports its position has **Open, Stop** and **Close**.
- **Rooms:** tap a tile to switch it on or off. Dimmable lights have a slider. Plugs show how much power is being used.
- **Aircons:** tap the tile to switch on or off, use **−** and **+** for the temperature, and tap a mode such as Cool or Heat.
- **Lights off** in each room switches off that room's lights only; fridges and other plugs stay on.

During a power outage, devices without power show **No power**. The pool pump, booster pump, irrigation valves, geyser and devices on the Devices tab are not on this tab, because the app runs them.

## During load-shedding or a power outage

When the grid goes off, the app keeps running on the battery and saves it for what matters.

- The grid circle on the Energy tab shows **Down**.
- The battery box on the Today card turns red and says **Power is off – battery lasts**, with the time left at your current use. Switching off big loads makes this number go up straight away.
- The geyser only heats from the battery if it's full enough. Solar heating still works.
- Pool pump and devices in Solar mode stop if the battery starts feeding the house (see the stop rules under *Water tab*).
- Devices that lost power show **No power** on the Controls tab. They come back by themselves when the grid returns.

**Tip:** before a long outage, check *If the power goes off* on the Energy tab, and switch the pool and heat pumps to **Off** if the battery time looks short.

## Troubleshooting and help

Most problems are fixed by refreshing the page or checking the device's own switch; for anything else, contact your installer.

| What you see | What to do |
| --- | --- |
| The page looks old or a new tab is missing after an update | Refresh: Ctrl+F5 on a computer. On the phone app: Settings → Companion app → Debugging → Reset frontend cache |
| A device shows **Offline** | Its smart switch lost Wi-Fi or power. Check the breaker and the Wi-Fi, then wait a minute |
| The pool pump or a device won't start in Solar mode | Read the line next to the status: it says why, e.g. not enough spare solar, outside the solar hours, or run hours done for today |
| It stopped and says *may start again in … min* | A stop rule switched it off (low solar or the battery feeding the house). It tries again after that time |
| I switched something by hand and the app switched it back | In Auto, Timer or Solar mode the app is in charge. Use **On** or **Off** instead |
| The booster pump is off and says dry run | Check the water supply or tank, then tap **Reset** on the Water tab |
| The geyser isn't heating | Check the mode (Auto?), the heating times and the temperature. With a low battery or during load-shedding it may wait |
| The battery time looks wrong | It uses the last minute's usage. A kettle or geyser makes it jump; it settles again within a minute |
| Rand figures look wrong | Check the electricity price on the Energy tab |

If an update is available, Home Assistant shows it under **Settings → Updates**. Your installer usually installs it for you.

When you call your installer, say which tab and what the status line says, or send a screenshot.
