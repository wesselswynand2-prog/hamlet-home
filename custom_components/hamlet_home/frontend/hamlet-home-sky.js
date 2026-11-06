// Shared sky + weather for the Scene and Property pictures: day / night from the sun, and the live weather
// (sunny, partly cloudy, cloudy, rain, storm with lightning, fog, wind, hail/snow) from the weather entity.

const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export const SKY_CSS = `
.wxcloud { animation: wxdrift var(--wxs, 70s) linear infinite; }
@keyframes wxdrift { from { transform: translateX(-320px); } to { transform: translateX(var(--wxw, 1900px)); } }
.wxrain line { animation: wxfall var(--wxr, .7s) linear infinite; }
@keyframes wxfall { from { transform: translate(0, -60px); opacity: 0; } 15% { opacity: .8; } to { transform: translate(var(--wxdx, -14px), 60px); opacity: 0; } }
.wxflash { opacity: 0; } .wxstorm .wxflash { animation: wxflash 7s linear infinite; }
@keyframes wxflash { 0%, 89%, 92%, 95%, 100% { opacity: 0; } 90%, 94% { opacity: .55; } }
.wxbolt { opacity: 0; } .wxbolt.wxstorm { animation: wxflash 7s linear infinite; }
@media (prefers-reduced-motion: reduce) { .wxcloud, .wxrain line, .wxstorm .wxflash, .wxbolt.wxstorm { animation: none; } }
.wxchip { position: absolute; top: 10px; right: 10px; z-index: 2; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.45); color: #fff; }
`;

// svg markup for the weather layers. W x H picture, ground at groundY, rain falls over the whole picture.
export function skyLayers(W, H, groundY) {
  const cloud = (x, y, s, dark) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="76" ry="24" fill="${dark ? "#8d99a6" : "#fff"}"/><ellipse cx="42" cy="-16" rx="46" ry="26" fill="${dark ? "#9aa6b2" : "#fff"}"/><ellipse cx="-30" cy="-12" rx="36" ry="20" fill="${dark ? "#8d99a6" : "#fff"}"/></g>`;
  let drops = "";
  for (let i = 0; i < 90; i++) {
    const x = Math.round((i * 97.3) % W), y = Math.round((i * 53.7) % groundY);
    drops += `<line x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 14}" style="animation-delay:-${((i * 0.173) % 1).toFixed(2)}s"/>`;
  }
  return {
    back: `<g id="wx-clouds">
        <g class="wxcloud" id="wx-c1" style="animation-delay:-10s">${cloud(0, 150, 1, false)}</g>
        <g class="wxcloud" id="wx-c2" style="animation-delay:-45s">${cloud(0, 90, .8, false)}</g>
        <g class="wxcloud" id="wx-c3" style="animation-delay:-25s">${cloud(0, 200, 1.3, true)}</g>
        <g class="wxcloud" id="wx-c4" style="animation-delay:-60s">${cloud(0, 120, 1.5, true)}</g>
        <g class="wxcloud" id="wx-c5" style="animation-delay:-5s">${cloud(0, 60, 1.2, true)}</g>
      </g>
      <path class="wxbolt" id="wx-bolt" d="M${W * 0.62} 60 l-26 70 h22 l-18 64 l48 -86 h-24 l22 -48 z" fill="#ffe66b"/>`,
    front: `<g id="wx-wrap"><g class="wxrain" id="wx-rain" stroke="#bcd6ee" stroke-width="2" stroke-linecap="round" opacity="0">${drops}</g>
      <rect id="wx-fog" x="0" y="0" width="${W}" height="${H}" fill="#e3e8ec" opacity="0"/>
      <rect id="wx-night" x="0" y="0" width="${W}" height="${H}" fill="#06122a" opacity="0" style="mix-blend-mode:multiply"/>
      <rect class="wxflash" x="0" y="0" width="${W}" height="${H}" fill="#fff"/></g>`,
  };
}

const NICE = { "clear-night": "Clear night", cloudy: "Cloudy", exceptional: "Severe weather", fog: "Fog", hail: "Hail", lightning: "Thunderstorm",
  "lightning-rainy": "Thunderstorm", partlycloudy: "Partly cloudy", pouring: "Heavy rain", rainy: "Rain", snowy: "Snow", "snowy-rainy": "Sleet",
  sunny: "Sunny", windy: "Windy", "windy-variant": "Windy" };

// what the sky should look like right now
export function skyState(hass, weatherId, solar) {
  const sun = hass?.states?.["sun.sun"];
  const elev = num(sun?.attributes?.elevation), hr = new Date().getHours();
  const night = sun ? sun.state === "below_horizon" : hr < 6 || hr >= 19;
  let wid = weatherId;
  if (!wid && hass?.states) wid = Object.keys(hass.states).find((k) => k.startsWith("weather."));
  const w = wid ? hass?.states?.[wid] : null;
  let cond = w && !["unavailable", "unknown"].includes(w.state) ? w.state : null;
  // no weather entity: guess cloud from low solar in the middle of the day
  if (!cond) cond = !night && solar !== null && elev !== null && elev > 25 && solar < 300 ? "cloudy" : night ? "clear-night" : "sunny";
  const wind = num(w?.attributes?.wind_speed);
  const c = cond;
  const rain = /rain|pouring|hail|snowy-rainy/.test(c) ? (c === "pouring" ? 2 : 1) : 0;
  const snow = /snow|hail/.test(c);
  const storm = /lightning/.test(c);
  const fog = c === "fog";
  const cloud = storm || rain ? 3 : c === "cloudy" || fog ? 2 : c === "partlycloudy" ? 1 : c === "exceptional" ? 2 : 0;
  const windy = /windy/.test(c) || (wind !== null && wind >= 30);
  const dusk = !night && elev !== null && elev < 6;
  const sky = night ? (cloud >= 2 ? ["#0b1424", "#1d2a3d"] : ["#0d1b33", "#2d4568"])
    : storm ? ["#4b5563", "#7d8794"] : rain ? ["#7f8c99", "#b4bec8"] : cloud >= 2 ? ["#9aa9b8", "#d2dbe3"]
    : dusk ? ["#f3a86b", "#fbd9a6"] : cloud === 1 ? ["#8cc3ef", "#dceefa"] : ["#7fbdf0", "#d8eefc"];
  return { temp: num(w?.attributes?.temperature), night, elev, cond, rain, snow, storm, fog, cloud, windy, sky, sunVisible: !night && cloud < 3, label: wid ? (w?.attributes?.friendly_name || "") : "" };
}

// apply it to the picture (root = shadowRoot, svg = the <svg> element)
export function applySky(root, st) {
  const $ = (id) => root.getElementById(id);
  const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? "" : "none"; };
  show("wx-c1", st.cloud >= 1); show("wx-c2", st.cloud >= 1); show("wx-c3", st.cloud >= 2); show("wx-c4", st.cloud >= 3); show("wx-c5", st.cloud >= 3);
  const cl = $("wx-clouds"); if (cl) { cl.style.setProperty("--wxs", st.windy ? "22s" : "70s"); cl.setAttribute("opacity", st.night ? 0.35 : 0.95); }
  const r = $("wx-rain");
  if (r) {
    r.setAttribute("opacity", st.rain || st.snow ? (st.rain === 2 ? 0.95 : 0.7) : 0);
    r.style.setProperty("--wxr", st.snow && !st.rain ? "2.6s" : st.rain === 2 ? ".45s" : ".7s");
    r.style.setProperty("--wxdx", st.windy ? "-40px" : "-14px");
    r.setAttribute("stroke", st.snow && !st.rain ? "#ffffff" : "#bcd6ee");
    r.setAttribute("stroke-width", st.snow && !st.rain ? 4 : 2);
  }
  const fog = $("wx-fog"); if (fog) fog.setAttribute("opacity", st.fog ? 0.55 : 0);
  const n = $("wx-night"); if (n) n.setAttribute("opacity", st.night ? 0.32 : st.storm ? 0.15 : 0);
  const wrap = $("wx-wrap"); if (wrap) wrap.classList.toggle("wxstorm", !!st.storm);
  const bolt = $("wx-bolt"); if (bolt) bolt.classList.toggle("wxstorm", !!st.storm);
  const chip = $("wxchip");
  if (chip) { const t = st.temp !== null ? ` · ${Math.round(st.temp)}°` : ""; chip.textContent = `${NICE[st.cond] || st.cond}${t}`; chip.hidden = !st.cond; }
}

/* ------------------------------------------------------------------ own anemometer */
const TO_KMH = { "km/h": 1, kmh: 1, "m/s": 3.6, mph: 1.609344, kn: 1.852, kt: 1.852, knots: 1.852, "ft/s": 1.09728 };
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg) => (deg === null ? "" : POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);
const beaufort = [[1, "Calm"], [6, "Light air"], [12, "Light breeze"], [20, "Gentle breeze"], [29, "Moderate breeze"], [39, "Fresh breeze"],
  [50, "Strong breeze"], [62, "Near gale"], [75, "Gale"], [89, "Strong gale"], [103, "Storm"], [118, "Violent storm"], [1e9, "Hurricane force"]];
export const windWord = (kmh) => (kmh === null ? "" : beaufort.find(([m]) => kmh < m)[1]);

// the anemometer's readings (speed and gust in km/h for the drawing, plus the sensor's own value and unit)
export function windState(hass, ids = {}) {
  const read = (eid) => {
    const st = eid ? hass?.states?.[eid] : null;
    if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
    return st;
  };
  const sp = read(ids.wind_speed), gu = read(ids.wind_gust), di = read(ids.wind_direction);
  if (!sp && !gu) return null;
  const kmh = (st) => { if (!st) return null; const v = num(st.state); if (v === null) return null; const u = (st.attributes?.unit_of_measurement || "km/h").trim(); return v * (TO_KMH[u] ?? TO_KMH[u.toLowerCase()] ?? 1); };
  let deg = null;
  if (di) { deg = num(di.state); if (deg === null) { const i = POINTS.indexOf(String(di.state).toUpperCase().trim()); deg = i >= 0 ? i * 22.5 : null; } }
  return { kmh: kmh(sp), gust: kmh(gu), deg, value: sp ? num(sp.state) : null, unit: sp?.attributes?.unit_of_measurement || "km/h",
    gustValue: gu ? num(gu.state) : null, gustUnit: gu?.attributes?.unit_of_measurement || "km/h", name: sp?.attributes?.friendly_name || "" };
}

export const WIND_CSS = `
.anemo .cups { transform-box: view-box; animation: anspin var(--ans, 0s) linear infinite; }
@keyframes anspin { to { transform: rotate(360deg); } }
.anemo .vane { transition: transform 1.2s ease; }
@media (prefers-reduced-motion: reduce) { .anemo .cups { animation: none; } }
`;

// an anemometer (three cups) with a wind vane, standing on a mast whose foot is at (x, y)
export function anemoSvg(x, y, s = 1, id = "anemo") {
  const top = y - 70 * s, cup = (a) => { const r = a * Math.PI / 180, cx = x + Math.cos(r) * 18 * s, cy = top + Math.sin(r) * 7 * s;
    return `<line x1="${x}" y1="${top}" x2="${cx}" y2="${cy}" stroke="#4b5563" stroke-width="${2 * s}"/><ellipse cx="${cx}" cy="${cy}" rx="${5 * s}" ry="${4 * s}" fill="#e5e7eb" stroke="#4b5563" stroke-width="${1.5 * s}"/>`; };
  return `<g class="anemo" id="${id}">
    <line x1="${x}" y1="${y}" x2="${x}" y2="${top}" stroke="#6b7280" stroke-width="${3 * s}"/>
    <g class="vane" id="${id}-vane" style="transform-origin:${x}px ${top + 22 * s}px"><path d="M${x - 16 * s} ${top + 22 * s} H ${x + 12 * s}" stroke="#4b5563" stroke-width="${2 * s}"/>
      <path d="M${x + 12 * s} ${top + 17 * s} l ${8 * s} ${5 * s} l ${-8 * s} ${5 * s} z" fill="#e34948"/><rect x="${x - 22 * s}" y="${top + 15 * s}" width="${7 * s}" height="${14 * s}" rx="${1.5 * s}" fill="#9aa4b0"/></g>
    <g class="cups" id="${id}-cups" style="transform-origin:${x}px ${top}px">${cup(0)}${cup(120)}${cup(240)}</g>
    <circle cx="${x}" cy="${top}" r="${3 * s}" fill="#374151"/></g>`;
}

// spin the cups with the speed; turn the vane to point where the wind blows to (it comes from `deg`)
export function applyWind(root, ws, id = "anemo") {
  const g = root.getElementById(id); if (!g) return;
  g.style.display = ws ? "" : "none";
  if (!ws) return;
  const k = ws.kmh ?? ws.gust ?? 0;
  root.getElementById(`${id}-cups`).style.setProperty("--ans", k < 1 ? "0s" : `${Math.max(0.15, 6 / k).toFixed(2)}s`);
  const vane = root.getElementById(`${id}-vane`);
  if (vane) { vane.style.display = ws.deg === null ? "none" : ""; if (ws.deg !== null) vane.style.transform = `scaleX(${Math.cos(((ws.deg + 90) % 360) * Math.PI / 180) >= 0 ? 1 : -1})`; }
}
