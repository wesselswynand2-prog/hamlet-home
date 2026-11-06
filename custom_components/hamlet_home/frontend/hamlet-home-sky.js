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
