// Hamlet Home – "Scene" power flow: the house drawn as a picture (roof solar, pylon, inverter, battery, geyser,
// loads) with live readings. Wires carry dots in the colour of the source: amber solar, green battery, pink grid.
import { flowMix } from "./hamlet-home-blocks.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmt = (w) => (w === null ? "–" : Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
const C = { solar: "var(--c-solar, #e8a317)", grid: "var(--c-grid, #d6457f)", battery: "var(--c-batt, #19a974)", load: "var(--c-load, #2f7fd6)" };
const top = (mix, dflt) => (mix && mix.length ? mix.slice().sort((a, b) => b[1] - a[1])[0][0] : dflt);

const STYLE = `
:host { display: block; }
* { box-sizing: border-box; }
.scene { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--line, #d3dbe4); }
.scene svg { display: block; width: 100%; height: auto; }
.badge { position: absolute; top: 10px; left: 10px; font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.55); color: #fff; }
.badge.down { background: #c0392b; animation: blink 1.2s steps(2) infinite; }
@keyframes blink { 50% { opacity: .55; } }
.cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 480px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.card { border: 1px solid var(--line, #d3dbe4); border-radius: 10px; padding: 8px 10px; min-width: 0; }
.card .k { font-size: 11px; color: var(--muted, #667); text-transform: uppercase; letter-spacing: .06em; display: flex; align-items: center; gap: 6px; }
.card .k i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.card .v { font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums; margin-top: 2px; }
.card .n { font-size: 11px; color: var(--muted, #667); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl text { font-family: inherit; font-size: 19px; font-weight: 600; } .lbl .t2 { font-size: 12px; font-weight: 500; }
` + `/* scene parts */
.wire { fill: none; stroke: #5c6570; stroke-opacity: .35; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
.flow { fill: none; stroke-width: 4.5; stroke-linecap: round; stroke-dasharray: 2 14; opacity: 0; transition: opacity .5s; }
.flow.on { opacity: 1; animation: run var(--spd, 1.2s) linear infinite; }
.flow.rev { animation-direction: reverse; }
@keyframes run { to { stroke-dashoffset: -32; } }
.glowline { fill: none; stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .5s; }
.glowline.on { opacity: .18; }
.lbl rect { fill: rgba(16, 22, 30, .78); }
.lbl text { fill: #fff; font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
.lbl .t2 { font-size: 12px; font-weight: 500; fill: #cfd8e3; }
.sunrays { transform-origin: center; transform-box: fill-box; animation: spin 30s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cloud { animation: drift 60s linear infinite; }
.cloud.c2 { animation-duration: 85s; animation-delay: -30s; }
@keyframes drift { from { transform: translateX(-260px); } to { transform: translateX(1160px); } }
.shine { animation: shine 4s ease-in-out infinite; }
@keyframes shine { 0%, 100% { opacity: 0; transform: translateX(-30px); } 50% { opacity: .35; transform: translateX(60px); } }
.led { animation: led 1s steps(2) infinite; }
@keyframes led { 50% { opacity: .25; } }
.elem.on { animation: glow 1.2s ease-in-out infinite alternate; }
@keyframes glow { to { opacity: .45; } }
.chg { animation: chg 2s linear infinite; }
@keyframes chg { from { transform: translateY(8px); opacity: .9; } to { transform: translateY(-40px); opacity: 0; } }
.heat { animation: heat 2.2s ease-in infinite; opacity: 0; }
@keyframes heat { 0% { opacity: 0; transform: translateY(6px); } 30% { opacity: .8; } 100% { opacity: 0; transform: translateY(-24px); } }
.star { animation: tw 3s ease-in-out infinite alternate; }
@keyframes tw { to { opacity: .2; } }
.spark { animation: spark .6s steps(2) infinite; }
@keyframes spark { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .flow.on, .sunrays, .cloud, .shine, .led, .elem.on, .chg, .heat, .star, .spark, .badge.down { animation: none; }
  .flow.on { stroke-dasharray: none; opacity: .7; }
}
`;

class HamletHomeScene extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._built = false; }
  set hass(h) { this._hass = h; }
  set data(d) { this._d = d; this._render(); }

  _build() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="scene"><div class="badge" id="badge"></div>
    <svg viewBox="0 0 1000 600" role="img" aria-label="Power flow picture" id="svg">
      
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop id="sk1" offset="0" stop-color="#7fbdf0"/><stop id="sk2" offset="1" stop-color="#d8eefc"/></linearGradient>
        <linearGradient id="panelg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d5aa0"/><stop offset="1" stop-color="#14305e"/></linearGradient>
        <linearGradient id="tankg" x1="0" y1="0" x2="0" y2="1"><stop id="tk1" offset="0" stop-color="#e3452c"/><stop id="tk2" offset="1" stop-color="#f2a33a"/></linearGradient>
        <radialGradient id="lampglow" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
        <clipPath id="roofclip"><polygon points="352,302 600,160 848,302"/></clipPath>
      </defs>

      <!-- sky -->
      <rect x="0" y="0" width="1000" height="600" fill="url(#sky)" id="skyrect"/>
      <g id="stars" opacity="0">
        <circle class="star" cx="80" cy="60" r="1.6" fill="#fff"/><circle class="star" cx="230" cy="40" r="1.2" fill="#fff" style="animation-delay:.8s"/>
        <circle class="star" cx="430" cy="70" r="1.4" fill="#fff" style="animation-delay:1.4s"/><circle class="star" cx="760" cy="36" r="1.8" fill="#fff" style="animation-delay:.3s"/>
        <circle class="star" cx="900" cy="90" r="1.3" fill="#fff" style="animation-delay:2s"/><circle class="star" cx="640" cy="110" r="1.1" fill="#fff" style="animation-delay:1s"/>
      </g>
      <g id="sun" transform="translate(880 80)">
        <g class="sunrays" stroke="#ffc83a" stroke-width="4" stroke-linecap="round">
          <line x1="0" y1="-52" x2="0" y2="-66"/><line x1="0" y1="52" x2="0" y2="66"/><line x1="-52" y1="0" x2="-66" y2="0"/><line x1="52" y1="0" x2="66" y2="0"/>
          <line x1="37" y1="37" x2="47" y2="47"/><line x1="-37" y1="-37" x2="-47" y2="-47"/><line x1="37" y1="-37" x2="47" y2="-47"/><line x1="-37" y1="37" x2="-47" y2="47"/>
        </g>
        <circle r="40" fill="#ffd34d"/><circle r="40" fill="none" stroke="#ffb627" stroke-width="3"/>
      </g>
      <g id="moon" transform="translate(860 80)" opacity="0"><circle r="30" fill="#f3efe1"/><circle cx="12" cy="-8" r="30" fill="#7fbdf0" id="moonbite"/></g>
      <g id="clouds" opacity=".35">
        <g class="cloud"><ellipse cx="0" cy="120" rx="70" ry="24" fill="#fff"/><ellipse cx="40" cy="104" rx="44" ry="26" fill="#fff"/><ellipse cx="-30" cy="108" rx="36" ry="20" fill="#fff"/></g>
        <g class="cloud c2"><ellipse cx="0" cy="60" rx="58" ry="20" fill="#fff"/><ellipse cx="30" cy="48" rx="36" ry="22" fill="#fff"/></g>
      </g>

      <!-- ground -->
      <rect x="0" y="520" width="1000" height="80" fill="#9bc77a"/>
      <rect x="0" y="520" width="1000" height="8" fill="#7fae62"/>

      <!-- grid pylon -->
      <g id="pylon" stroke="#7b8592" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
        <path d="M70 520 L 112 170 L 128 170 L 170 520"/>
        <path d="M84 230 H 156 M76 290 H 164 M66 352 H 174"/>
        <path d="M80 300 L 150 400 M160 300 L 90 400 M88 236 L 150 290 M152 236 L 90 290 M78 400 L 160 520 M162 400 L 80 520"/>
        <path d="M58 200 H 182" stroke-width="4"/>
        <circle cx="62" cy="206" r="4" fill="#7b8592"/><circle cx="178" cy="206" r="4" fill="#7b8592"/>
      </g>
      <g id="gridx" opacity="0"><circle cx="120" cy="150" r="22" fill="#c0392b"/><path d="M110 140 L130 160 M130 140 L110 160" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>

      <!-- house -->
      <rect x="370" y="300" width="460" height="220" fill="#f4ece0" stroke="#9c8f7d" stroke-width="2"/>
      <rect x="384" y="314" width="432" height="198" fill="#fbf7f0"/>
      <line x1="600" y1="314" x2="600" y2="512" stroke="#d8ccb9" stroke-width="3"/>
      <polygon points="352,302 600,160 848,302" fill="#8a4b3a"/>
      <!-- PV panels on the roof (left slope) -->
      <g clip-path="url(#roofclip)" id="roofpv">
        <g id="panels"></g>
        <rect class="shine" x="400" y="170" width="18" height="140" fill="#fff" transform="skewX(-30)" opacity="0"/>
      </g>
      <polyline points="352,302 600,160 848,302" fill="none" stroke="#5a2f24" stroke-width="5" stroke-linejoin="round"/>
      <!-- chimney -->
      <rect x="720" y="196" width="28" height="56" fill="#7a4334"/>

      <!-- wires (base) -->
      <path class="wire" id="w-grid" d="M178 206 Q 270 270 380 330 H 452"/>
      <path class="wire" id="w-gey" d="M420 330 V 404"/>
      <path class="wire" id="w-pvac" d="M536 238 V 286 H 477 V 300"/>
      <path class="wire" id="w-acout" d="M548 360 V 372"/>
      <path class="wire" id="w-pvdc" d="M664 242 V 312 Q 664 322 690 322 V 336"/>
      <path class="wire" id="w-mppt" d="M690 386 V 420 H 640"/>
      <path class="wire" id="w-batt" d="M560 420 V 384"/>
      <path class="wire" id="w-ess" d="M600 340 H 640 V 322 H 760 V 350"/>

      <!-- glow + flow overlays (filled from script) -->
      <g id="flows"></g>

      <!-- PV inverter on the wall (grid-tie) -->
      <g id="pvinv">
        <rect x="452" y="300" width="50" height="52" rx="6" fill="#dfe3e8" stroke="#8e98a4" stroke-width="2"/>
        <rect x="458" y="306" width="38" height="10" rx="2" fill="#2a3440"/><circle class="led" id="pvled" cx="490" cy="340" r="3" fill="#2ecc71"/>
        <path d="M462 334 h18" stroke="#8e98a4" stroke-width="2"/>
      </g>
      <!-- main inverter / charger -->
      <g id="inv">
        <rect x="514" y="318" width="86" height="64" rx="8" fill="#2f6fd0" stroke="#1f4f9a" stroke-width="2"/>
        <rect x="514" y="370" width="86" height="12" rx="0" fill="#24589f"/>
        <path d="M538 344 q 9 -16 18 0 t 18 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle class="led" id="invled" cx="590" cy="327" r="3" fill="#7CFC00"/>
      </g>
      <!-- MPPT solar charger -->
      <g id="mppt">
        <rect x="668" y="336" width="46" height="52" rx="6" fill="#2a3440" stroke="#151c24" stroke-width="2"/>
        <rect x="674" y="344" width="34" height="8" rx="2" fill="#e8a317"/>
        <g stroke="#556272" stroke-width="2"><path d="M674 362 h34 M674 368 h34 M674 374 h34"/></g>
      </g>
      <!-- battery rack -->
      <g id="battery">
        <rect x="514" y="420" width="126" height="92" rx="8" fill="#2b2f36" stroke="#14171c" stroke-width="2"/>
        <rect x="524" y="432" width="20" height="70" rx="3" fill="#14171c"/>
        <rect x="524" y="432" width="20" height="70" rx="3" fill="#19a974" id="battlvl"/>
        <g id="battbars" fill="#3a404a"><rect x="554" y="432" width="76" height="14" rx="3"/><rect x="554" y="450" width="76" height="14" rx="3"/><rect x="554" y="468" width="76" height="14" rx="3"/><rect x="554" y="486" width="76" height="14" rx="3"/></g>
        <g id="chgarrows" opacity="0"><path class="chg" d="M534 480 l-6 8 h12 z" fill="#fff"/><path class="chg" d="M534 480 l-6 8 h12 z" fill="#fff" style="animation-delay:.7s"/><path class="chg" d="M534 480 l-6 8 h12 z" fill="#fff" style="animation-delay:1.4s"/></g>
        <text x="592" y="510" text-anchor="middle"  font-size="13" fill="#9aa4b0">48 V · 10 kWh</text>
      </g>
      <!-- geyser (grid side) -->
      <g id="geyser">
        <rect x="396" y="404" width="50" height="104" rx="22" fill="url(#tankg)" stroke="#6b5a4b" stroke-width="2.5"/>
        <rect x="404" y="416" width="5" height="60" rx="2.5" fill="#fff" opacity=".3"/>
        <path class="elem" id="elem" d="M406 494 h30 v4 h-30 v4 h30" fill="none" stroke="#ff5a36" stroke-width="2.5"/>
        <g id="heatwaves" opacity="0"><path class="heat" d="M412 488 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2"/><path class="heat" d="M428 490 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2" style="animation-delay:.8s"/></g>
      </g>
      <!-- essential loads: lamp, TV, fridge -->
      <g id="loads">
        <ellipse id="lampglowe" cx="760" cy="400" rx="64" ry="70" fill="url(#lampglow)" opacity="0"/>
        <line x1="760" y1="314" x2="760" y2="350" stroke="#555" stroke-width="2"/>
        <path d="M744 350 h32 l-6 16 h-20 z" fill="#c9b27c"/><circle id="bulb" cx="760" cy="370" r="5" fill="#ccc"/>
        <rect x="700" y="434" width="74" height="46" rx="4" fill="#1d2026"/><rect id="tvscreen" x="704" y="438" width="66" height="38" rx="2" fill="#30343c"/>
        <rect x="733" y="480" width="8" height="18" fill="#444"/><rect x="718" y="498" width="38" height="5" rx="2" fill="#444"/>
        <rect x="784" y="404" width="30" height="104" rx="4" fill="#e9eef3" stroke="#a3adb8" stroke-width="2"/><line x1="784" y1="440" x2="814" y2="440" stroke="#a3adb8" stroke-width="2"/>
        <rect x="808" y="414" width="2.5" height="16" fill="#a3adb8"/><rect x="808" y="448" width="2.5" height="22" fill="#a3adb8"/>
      </g>
      <!-- window with glow at night -->
      <rect x="626" y="440" width="0" height="0"/>

      <!-- value labels (filled from script) -->
      <g id="labels"></g>
    </svg>
    </div><div class="cards" id="cards"></div>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    // roof panels
    const sl = (600 - 352) / (302 - 160), left = (y) => 600 - (y - 160) * sl; let h = "";
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const y1 = 216 + r * 40, y2 = y1 + 36, a = left(y1) + 20 + c * 52, b = left(y2) + 20 + c * 52;
      h += `<polygon points="${b},${y2} ${a},${y1} ${a + 48},${y1} ${b + 48},${y2}" fill="url(#panelg)" stroke="#c9ced6" stroke-width="2"/>
        <g stroke="#6f8fc4" stroke-width=".8" opacity=".75"><line x1="${(a + b) / 2}" y1="${(y1 + y2) / 2}" x2="${(a + b) / 2 + 48}" y2="${(y1 + y2) / 2}"/>
        ${[1, 2, 3].map((k) => `<line x1="${b + k * 12}" y1="${y2}" x2="${a + k * 12}" y2="${y1}"/>`).join("")}</g>`;
    }
    $("panels").innerHTML = h;
    const flows = $("flows");
    ["grid", "gey", "pvac", "acout", "pvdc", "mppt", "batt", "ess"].forEach((k) => {
      const d = $("w-" + k).getAttribute("d");
      flows.insertAdjacentHTML("beforeend", `<path class="glowline" id="g-${k}" d="${d}"/><path class="flow" id="f-${k}" d="${d}"/>`);
    });
    this._built = true;
  }

  _flow(k, w, color, rev) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const f = $("f-" + k), g = $("g-" + k), on = w !== null && Math.abs(w) >= 15;
    f.classList.toggle("on", on); g.classList.toggle("on", on); f.classList.toggle("rev", !!rev);
    f.style.stroke = color; g.style.stroke = color;
    f.style.setProperty("--spd", `${Math.max(0.35, 2.2 - Math.abs(w || 0) / 2500).toFixed(2)}s`);
  }
  _show(id, on) { const e = this.shadowRoot.getElementById(id); if (e) e.style.display = on ? "" : "none"; }

  _render() {
    const d = this._d; if (!d) return;
    if (!this._built) this._build();
    const $ = (id) => this.shadowRoot.getElementById(id);
    const f = d.features || {}, L = d.live || {};
    const split = !!(f.pv_ac || f.pv_dc), lsplit = !!f.load_split, hasGrid = !!(f.grid || f.grid_status);
    const down = L.grid_available === false;
    const grid = num(L.grid), solar = num(L.solar), batt = num(L.battery), soc = num(L.soc), load = num(L.load);
    const pvac = split ? num(L.solar_ac) : null, pvdc = split ? num(L.solar_dc) : solar;
    const ess = lsplit && num(L.load_ess) !== null ? num(L.load_ess) : load, noness = lsplit ? num(L.load_noness) : null;
    const fm = flowMix(L, lsplit);
    // the geyser: a load named "geyser" (from Hamlet Geyser or your extra loads); on the grid side when set so
    const geys = (d.extras || []).filter((e) => /geyser|geiser/i.test(`${e.name} ${e.entity_id || ""}`));
    const gw = geys.reduce((t, e) => t + Math.max(num(e.w) || 0, 0), 0);
    const geyGridSide = geys.some((e) => e.side === "noness");
    const geySrc = geyGridSide ? top(fm.noness, "grid") : top(fm.home, "solar");
    const essSrc = top(fm.home, "grid");
    // sky: night from the sun's position (or the clock), sun height from its elevation
    const sun = this._hass?.states?.["sun.sun"];
    const elev = num(sun?.attributes?.elevation);
    const hr = new Date().getHours();
    const night = sun ? sun.state === "below_horizon" : hr < 6 || hr >= 19;
    const cloudy = !night && solar !== null && elev !== null && elev > 25 && solar < 300;
    const sky = night ? ["#0d1b33", "#2d4568"] : cloudy ? ["#9aa9b8", "#d2dbe3"] : ["#7fbdf0", "#d8eefc"];
    $("sk1").setAttribute("stop-color", sky[0]); $("sk2").setAttribute("stop-color", sky[1]); $("moonbite").setAttribute("fill", sky[0]);
    $("sun").setAttribute("opacity", night ? 0 : 1);
    $("sun").setAttribute("transform", `translate(880 ${elev === null ? 80 : Math.round(170 - Math.min(Math.max(elev, 0), 60) * 1.6)})`);
    $("moon").setAttribute("opacity", night ? 1 : 0); $("stars").setAttribute("opacity", night ? 1 : 0);
    $("clouds").setAttribute("opacity", cloudy ? 0.95 : night ? 0.15 : 0.35);
    this.shadowRoot.querySelector("#roofpv .shine").style.display = (solar || 0) > 300 ? "" : "none";
    // parts that this system has
    this._show("pylon", hasGrid); this._show("w-grid", hasGrid); this._show("f-grid", hasGrid); this._show("g-grid", hasGrid);
    this._show("pvinv", !!f.pv_ac); ["w-pvac", "f-pvac", "g-pvac"].forEach((i) => this._show(i, !!f.pv_ac));
    const dc = split ? !!f.pv_dc : true;
    this._show("mppt", dc); ["w-pvdc", "f-pvdc", "g-pvdc", "w-mppt", "f-mppt", "g-mppt"].forEach((i) => this._show(i, dc));
    this._show("battery", !!f.battery); ["w-batt", "f-batt", "g-batt"].forEach((i) => this._show(i, !!f.battery));
    this._show("geyser", geys.length > 0); ["w-gey", "f-gey", "g-gey"].forEach((i) => this._show(i, geys.length > 0));
    $("gridx").setAttribute("opacity", hasGrid && down ? 1 : 0);
    $("pylon").setAttribute("stroke", down ? "#b0b6bd" : "#7b8592");
    const bd = $("badge");
    bd.textContent = !hasGrid ? (night ? "Night" : "Day") : down ? "Grid down" : grid !== null && grid > 20 ? `Grid · buying ${fmt(grid)}` : grid !== null && grid < -20 ? `Grid · selling ${fmt(-grid)}` : "Grid · idle";
    bd.classList.toggle("down", hasGrid && down);
    // flows (+ along the drawn path)
    this._flow("grid", down ? 0 : Math.abs(grid || 0), C.grid, (grid || 0) < 0);
    this._flow("gey", gw, C[geySrc]);
    this._flow("pvac", pvac, C.solar);
    this._flow("pvdc", pvdc, C.solar); this._flow("mppt", pvdc, C.solar);
    const chargeSrc = top(fm.charge, "solar");
    this._flow("batt", batt === null ? 0 : Math.abs(batt), batt > 0 ? C[chargeSrc] : C.battery, batt > 0);
    this._flow("acout", ess, C[essSrc]); this._flow("ess", ess, C[essSrc]);
    // devices
    $("lampglowe").setAttribute("opacity", night ? 1 : 0.2);
    $("bulb").setAttribute("fill", night && (ess || 0) > 50 ? "#ffe27a" : "#ccc");
    this._tick = (this._tick || 0) + 1;
    $("tvscreen").setAttribute("fill", (ess || 0) > 150 ? (this._tick % 2 ? "#3b6fb6" : "#4a86d4") : "#30343c");
    const heating = gw > 50;
    $("elem").classList.toggle("on", heating); $("elem").setAttribute("stroke", heating ? "#ff5a36" : "#6b5a4b");
    $("heatwaves").setAttribute("opacity", heating ? 1 : 0);
    $("pvled").setAttribute("fill", (pvac || 0) > 20 ? "#2ecc71" : down ? "#e74c3c" : "#f1c40f");
    $("invled").setAttribute("fill", down ? "#ffb300" : "#7CFC00");
    if (f.battery) {
      const s = soc === null ? 50 : soc, lv = Math.max(4, 70 * s / 100);
      $("battlvl").setAttribute("y", 432 + 70 - lv); $("battlvl").setAttribute("height", lv);
      $("battlvl").setAttribute("fill", s < 20 ? "#e34948" : s < 40 ? "#eda100" : C.battery);
      $("chgarrows").setAttribute("opacity", (batt || 0) > 50 ? 1 : 0);
      [...$("battbars").children].forEach((r, i) => r.setAttribute("fill", (3 - i) < s / 25 ? "#4b5a52" : "#3a404a"));
      const kwh = num(d.battery?.capacity_kwh);
      this.shadowRoot.querySelector("#battery text").textContent = kwh ? `${kwh.toFixed(kwh < 10 ? 1 : 0)} kWh` : "Battery";
    }
    // labels on the picture
    const lab = (x, y, v, sub, color, anchor = "middle") => {
      const w = Math.max(String(v).length * 11, String(sub || "").length * 6.4) + 24;
      const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      return `<g class="lbl"><rect x="${x0}" y="${y - 20}" width="${w}" height="${sub ? 42 : 28}" rx="8"/><rect x="${x0}" y="${y - 20}" width="4" height="${sub ? 42 : 28}" rx="2" fill="${color}"/>
        <text x="${x0 + 13}" y="${y}">${esc(v)}</text>${sub ? `<text class="t2" x="${x0 + 13}" y="${y + 16}">${esc(sub)}</text>` : ""}</g>`;
    };
    const battTxt = batt === null ? "" : batt > 30 ? `charging ${fmt(batt)}` : batt < -30 ? `supplying ${fmt(-batt)}` : "idle";
    const inv = num(L.inverter);
    let labels = "";
    if (hasGrid) labels += lab(250, 228, down ? "Down" : fmt(Math.abs(grid || 0)), down ? "Grid · no power" : (grid || 0) > 20 ? "Grid · buying" : (grid || 0) < -20 ? "Grid · selling" : "Grid · idle", C.grid);
    labels += lab(300, 146, fmt(solar), split ? `Solar · ${f.pv_ac ? `${fmt(pvac)} AC` : ""}${f.pv_ac && f.pv_dc ? " + " : ""}${f.pv_dc ? `${fmt(pvdc)} DC` : ""}` : "Solar", C.solar, "start");
    if (geys.length) labels += lab(474, 548, heating ? fmt(gw) : "Off", geys.length > 1 ? `${geys.length} geysers${geyGridSide ? " · AC Loads" : ""}` : `${geys[0].name}${geyGridSide ? " · AC Loads" : ""}`, heating ? C[geySrc] : "#7b8592", "end");
    if (f.battery) labels += lab(484, 548, soc !== null ? `${Math.round(soc)}%` : fmt(batt), `Battery${battTxt ? " · " + battTxt : ""}`, C.battery, "start");
    labels += lab(760, 548, fmt(ess), lsplit ? "Essential loads" : "House", C[essSrc]);
    labels += lab(557, 300, inv !== null ? fmt(Math.abs(inv)) : fmt(Math.abs(batt || 0)), down ? "Inverter · off grid" : (batt || 0) > 30 ? "Inverter · charging" : (batt || 0) < -30 ? "Inverter · inverting" : "Inverter", "#2f6fd0");
    $("labels").innerHTML = labels;
    // number cards under the picture
    const card = (k, c, val, note) => `<div class="card"><div class="k"><i style="background:${c}"></i>${esc(k)}</div><div class="v">${esc(val)}</div><div class="n">${esc(note)}</div></div>`;
    const tot = (ess || 0) + (noness || 0);
    const self = tot > 0 ? Math.round(100 * Math.min(1, (Math.max(solar || 0, 0) + Math.max(-(batt || 0), 0)) / Math.max(1, tot + Math.max(batt || 0, 0)))) : null;
    let cards = card("Solar", C.solar, fmt(solar), split ? [f.pv_ac ? `${fmt(pvac)} AC` : "", f.pv_dc ? `${fmt(pvdc)} DC` : ""].filter(Boolean).join(" · ") : "now");
    if (hasGrid) cards += card("Grid", C.grid, down ? "Down" : fmt(Math.abs(grid || 0)), down ? "no power" : (grid || 0) > 20 ? "buying" : (grid || 0) < -20 ? "selling" : "idle");
    if (f.battery) cards += card("Battery", C.battery, soc !== null ? `${Math.round(soc)}%` : fmt(batt), battTxt || "–");
    cards += card(lsplit ? "Essential" : "House", C.load, fmt(ess), lsplit ? "inverter output" : "using now");
    if (lsplit) cards += card("AC Loads", C.load, down ? "Off" : fmt(noness), "grid side");
    else if (geys.length) cards += card("Geyser", "#e3452c", heating ? fmt(gw) : "Off", "element");
    if (self !== null) cards += card("Self-powered", C.solar, `${self}%`, "solar + battery");
    $("cards").innerHTML = cards;
  }
}
customElements.define("hamlet-home-scene", HamletHomeScene);
