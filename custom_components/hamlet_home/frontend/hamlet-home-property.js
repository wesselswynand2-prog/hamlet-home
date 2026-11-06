// Hamlet Home – "Property" view: the whole property on one live picture – energy, geyser (Hamlet Geyser),
// water tank + booster pump, irrigation zones, pool with pump / heat pump / salt cell / lights / cleaner, aircon.
// Power wires carry dots in the source colour (amber solar, green battery, pink grid); pipes carry water (blue / orange hot).
import { flowMix } from "./hamlet-home-blocks.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmt = (w) => (w === null || w === undefined ? "–" : Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
const C = { solar: "var(--c-solar, #e8a317)", grid: "var(--c-grid, #d6457f)", battery: "var(--c-batt, #19a974)", water: "#1f8fd0", heat: "#eb6834", grey: "#7b8592" };
const top = (mix, dflt) => (mix && mix.length ? mix.slice().sort((a, b) => b[1] - a[1])[0][0] : dflt);
const SRCNAME = { solar: "solar", battery: "battery", grid: "grid" };

const STYLE = `
:host { display: block; }
* { box-sizing: border-box; }
.scene { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--line, #d3dbe4); background: #9bc77a; }
.scroll { overflow-x: auto; }
.scene svg { display: block; width: 100%; height: auto; }
@media (max-width: 700px) { .scene svg { width: 900px; max-width: none; } }
.badge { position: absolute; top: 10px; left: 10px; z-index: 2; font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.55); color: #fff; }
.badge.down { background: #c0392b; animation: blink 1.2s steps(2) infinite; }
@keyframes blink { 50% { opacity: .55; } }
.hint { display: none; color: var(--muted, #667); font-size: 12px; margin-top: 6px; }
@media (max-width: 700px) { .hint { display: block; } }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 12px; }
@media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tile { border: 1px solid var(--line, #d3dbe4); border-radius: 12px; padding: 10px 12px; min-width: 0; display: grid; gap: 3px; }
.tile .k { font-size: 11px; color: var(--muted, #667); text-transform: uppercase; letter-spacing: .06em; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 6px; }
.tile .k b { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.tile .k i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--muted, #888) 18%, transparent); color: var(--primary-text-color, #222); text-transform: none; letter-spacing: 0; white-space: nowrap; }
.pill.on { background: color-mix(in srgb, #19a974 24%, transparent); } .pill.warn { background: color-mix(in srgb, #e34948 24%, transparent); }
.tile .v { font-size: 24px; font-weight: 500; font-variant-numeric: tabular-nums; }
.tile .n { font-size: 12px; color: var(--muted, #667); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
` + `/* scene animation */
.wire { fill: none; stroke: #5c6570; stroke-opacity: .35; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
.pipe { fill: none; stroke: #8b97a5; stroke-opacity: .55; stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; }
.flow { fill: none; stroke-width: 4.5; stroke-linecap: round; stroke-dasharray: 2 14; opacity: 0; transition: opacity .5s; }
.flow.wat { stroke-width: 5; stroke-dasharray: 3 11; }
.flow.on { opacity: 1; animation: run var(--spd, 1.2s) linear infinite; }
.flow.rev { animation-direction: reverse; }
@keyframes run { to { stroke-dashoffset: -32; } }
.glowline { fill: none; stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .5s; }
.glowline.on { opacity: .18; }
.lbl rect.bg { fill: rgba(16, 22, 30, .8); }
.lbl text { fill: #fff; font-family: inherit; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.lbl .t2 { font-family: inherit; font-size: 12.5px; font-weight: 500; fill: #d4dce6; }
.spin { transform-box: fill-box; transform-origin: center; }
.spin.on { animation: spin .6s linear infinite; }
.sunrays { transform-box: fill-box; transform-origin: center; animation: spin 30s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cloud { animation: drift 70s linear infinite; } .cloud.c2 { animation-duration: 95s; animation-delay: -40s; }
@keyframes drift { from { transform: translateX(-300px); } to { transform: translateX(1900px); } }
.wave1 { animation: wave 4s ease-in-out infinite alternate; } .wave2 { animation: wave 5.5s ease-in-out infinite alternate-reverse; }
@keyframes wave { from { transform: translateX(-24px); } to { transform: translateX(0); } }
.drop { opacity: 0; } .spray.on .drop { animation: spray 1.3s ease-out infinite; }
@keyframes spray { 0% { opacity: .95; transform: translate(0, 0); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)); } }
.mist { opacity: 0; transition: opacity .6s; } .spray.on .mist { opacity: .35; }
.elem.on { animation: glow 1.2s ease-in-out infinite alternate; } @keyframes glow { to { opacity: .45; } }
.heat { opacity: 0; } .heating .heat { animation: heat 2.2s ease-in infinite; }
@keyframes heat { 0% { opacity: 0; transform: translateY(6px); } 30% { opacity: .8; } 100% { opacity: 0; transform: translateY(-24px); } }
.led { animation: led 1s steps(2) infinite; } @keyframes led { 50% { opacity: .25; } }
.star { animation: tw 3s ease-in-out infinite alternate; } @keyframes tw { to { opacity: .2; } }
.chg { animation: chg 2s linear infinite; } @keyframes chg { from { transform: translateY(8px); opacity: .9; } to { transform: translateY(-36px); opacity: 0; } }
.shine { animation: shine 4s ease-in-out infinite; } @keyframes shine { 0%, 100% { opacity: 0; transform: translateX(-30px); } 50% { opacity: .35; transform: translateX(60px); } }
.bub { opacity: 0; } .chl .bub { animation: bub 2.4s ease-in infinite; } @keyframes bub { 0% { opacity: 0; transform: translateY(0); } 15% { opacity: .8; } 100% { opacity: 0; transform: translateY(-26px); } }
.bot { animation: bot 10s ease-in-out infinite alternate; } @keyframes bot { to { transform: translateX(220px); } }
.pglow { opacity: 0; transition: opacity .6s; } .lit .pglow { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .flow.on, .spin.on, .sunrays, .cloud, .wave1, .wave2, .spray.on .drop, .elem.on, .heating .heat, .led, .star, .chg, .shine, .chl .bub, .bot, .badge.down { animation: none; }
  .flow.on { stroke-dasharray: none; opacity: .7; }
}
`;

class HamletHomeProperty extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._built = false; this._gs = []; this._unsubs = []; }
  set hass(h) { const first = !this._hass; this._hass = h; if (first) this._geyserSub(); }
  set data(d) { this._d = d; this._render(); }
  disconnectedCallback() { this._unsubs.forEach((u) => u()); this._unsubs = []; this._subbing = false; }
  connectedCallback() { if (this._hass) this._geyserSub(); }

  // Hamlet Geyser (if installed): live tank temperature, element, solar collector
  // Hamlet Geyser (if installed): each geyser's tank temperature, element and solar collector (up to two drawn)
  async _geyserSub() {
    if (this._subbing || this._unsubs.length || !this._hass) return;
    this._subbing = true;
    try {
      const list = (await this._hass.callWS({ type: "hamlet_geyser/list" })).slice(0, 2);
      this._gs = list.map(() => null);
      for (const [i, item] of list.entries()) {
        this._unsubs.push(await this._hass.connection.subscribeMessage((snap) => { this._gs[i] = snap; this._render(); },
          { type: "hamlet_geyser/subscribe", entry_id: item.entry_id }));
      }
    } catch (e) { /* Hamlet Geyser not installed */ } finally { this._subbing = false; }
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="scene"><div class="badge" id="badge"></div><div class="scroll">
    <svg viewBox="0 0 1600 760" role="img" aria-label="The whole property: grid pylon, house with roof solar and a solar collector, inverter, battery, geyser, water tank and booster pump, garden sprinklers, pool with pump, filter and heat pump" id="svg">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop id="sk1" offset="0" stop-color="#7fbdf0"/><stop id="sk2" offset="1" stop-color="#d8eefc"/></linearGradient>
        <linearGradient id="panelg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d5aa0"/><stop offset="1" stop-color="#14305e"/></linearGradient>
        <linearGradient id="tankg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3452c"/><stop offset="1" stop-color="#f2a33a"/></linearGradient>
        <linearGradient id="jojo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f6b3a"/><stop offset=".45" stop-color="#4c9a59"/><stop offset="1" stop-color="#2c5f35"/></linearGradient>
        <linearGradient id="poolg" x1="0" y1="0" x2="0" y2="1"><stop id="pw1" offset="0" stop-color="#3fb6d8"/><stop id="pw2" offset="1" stop-color="#1c7fb8"/></linearGradient>
        <radialGradient id="lampglow" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
        <radialGradient id="poolglow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff6c2" stop-opacity=".7"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/></radialGradient>
        <clipPath id="roofclip"><polygon points="282,382 540,232 798,382"/></clipPath>
        <clipPath id="poolclip"><rect x="1060" y="640" width="360" height="86" rx="14"/></clipPath>
        <clipPath id="jojoclip"><rect x="866" y="410" width="96" height="142" rx="10"/></clipPath>
      </defs>

      <!-- sky -->
      <rect width="1600" height="760" fill="url(#sky)"/>
      <g id="stars" opacity="0">
        <circle class="star" cx="90" cy="60" r="1.6" fill="#fff"/><circle class="star" cx="300" cy="40" r="1.2" fill="#fff" style="animation-delay:.8s"/>
        <circle class="star" cx="620" cy="80" r="1.4" fill="#fff" style="animation-delay:1.4s"/><circle class="star" cx="980" cy="36" r="1.8" fill="#fff" style="animation-delay:.3s"/>
        <circle class="star" cx="1220" cy="90" r="1.3" fill="#fff" style="animation-delay:2s"/><circle class="star" cx="1500" cy="140" r="1.1" fill="#fff" style="animation-delay:1s"/>
      </g>
      <g id="sun" transform="translate(1440 100)">
        <g class="sunrays" stroke="#ffc83a" stroke-width="4" stroke-linecap="round">
          <line x1="0" y1="-52" x2="0" y2="-66"/><line x1="0" y1="52" x2="0" y2="66"/><line x1="-52" y1="0" x2="-66" y2="0"/><line x1="52" y1="0" x2="66" y2="0"/>
          <line x1="37" y1="37" x2="47" y2="47"/><line x1="-37" y1="-37" x2="-47" y2="-47"/><line x1="37" y1="-37" x2="47" y2="-47"/><line x1="-37" y1="37" x2="-47" y2="47"/>
        </g>
        <circle r="40" fill="#ffd34d" stroke="#ffb627" stroke-width="3"/>
      </g>
      <g id="moon" transform="translate(1420 100)" opacity="0"><circle r="30" fill="#f3efe1"/><circle cx="12" cy="-8" r="30" fill="#0d1b33"/></g>
      <g id="clouds" opacity=".35">
        <g class="cloud"><ellipse cx="0" cy="130" rx="76" ry="24" fill="#fff"/><ellipse cx="42" cy="114" rx="46" ry="26" fill="#fff"/><ellipse cx="-30" cy="118" rx="36" ry="20" fill="#fff"/></g>
        <g class="cloud c2"><ellipse cx="0" cy="70" rx="60" ry="20" fill="#fff"/><ellipse cx="30" cy="58" rx="36" ry="22" fill="#fff"/></g>
      </g>

      <!-- ground: back yard band and front lawn -->
      <rect x="0" y="598" width="1600" height="162" fill="#9bc77a"/>
      <rect x="0" y="598" width="1600" height="8" fill="#7fae62"/>
      <path d="M0 735 H1600" stroke="#86b86b" stroke-width="2"/>
      <!-- paving round the pool -->
      <rect x="1040" y="628" width="400" height="110" rx="20" fill="#d9d3c7"/>

      <!-- grid pylon -->
      <g id="pylon" stroke="#7b8592" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
        <path d="M60 600 L 112 250 L 128 250 L 180 600"/>
        <path d="M86 310 H 154 M76 380 H 164 M66 450 H 174"/>
        <path d="M80 390 L 150 490 M160 390 L 90 490 M88 316 L 150 376 M152 316 L 90 376 M74 490 L 166 600 M170 490 L 72 600"/>
        <path d="M54 280 H 186" stroke-width="4"/>
        <circle cx="58" cy="286" r="4" fill="#7b8592"/><circle cx="182" cy="286" r="4" fill="#7b8592"/>
      </g>
      <g id="gridx" opacity="0"><circle cx="120" cy="226" r="22" fill="#c0392b"/><path d="M110 216 L130 236 M130 216 L110 236" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>

      <!-- house -->
      <rect x="300" y="380" width="480" height="220" fill="#f4ece0" stroke="#9c8f7d" stroke-width="2"/>
      <rect x="314" y="394" width="452" height="198" fill="#fbf7f0"/>
      <line x1="540" y1="394" x2="540" y2="592" stroke="#d8ccb9" stroke-width="3"/>
      <polygon points="282,382 540,232 798,382" fill="#8a4b3a"/>
      <g clip-path="url(#roofclip)">
        <g id="panels"></g>
        <rect class="shine" id="pvshine" x="420" y="240" width="18" height="140" fill="#fff" transform="skewX(-30)" opacity="0"/>
        <!-- solar collector (geyser) on the right slope -->
        <g id="collector">
          <polygon points="606,300 690,300 734,352 650,352" fill="#1f262e" stroke="#c9ced6" stroke-width="2"/>
          <g stroke="#56616e" stroke-width="3"></g>
        </g>
      </g>
      <polyline points="282,382 540,232 798,382" fill="none" stroke="#5a2f24" stroke-width="5" stroke-linejoin="round"/>
      <rect x="690" y="262" width="26" height="56" fill="#7a4334"/>

      <!-- wires and pipes (base) -->
      <path class="wire" id="w-grid" d="M186 286 Q 260 340 300 410 H 382"/>
      <path class="wire" id="w-pvac" d="M470 300 V 366 H 407 V 384"/>
      <path class="wire" id="w-pvdc" d="M560 300 V 392 Q 560 404 596 404 V 412"/>
      <path class="wire" id="w-batt" d="M488 500 V 462"/>
      <path class="wire" id="w-ess" d="M528 420 H 560 V 402 H 700 V 430"/>
      <path class="wire" id="w-gey" d="M346 410 V 474"/>
      <path class="wire" id="w-gey2" d="M628 402 V 486 H 622"/>
      <path class="wire" id="w-yard" d="M528 446 H 572 V 594 H 1000 V 608 H 1460"/>
      <path class="pipe" id="p-coll" d="M650 350 V 372 H 380 V 480"/>
      <path class="pipe" id="p-coll2" d="M690 352 V 380 H 640 V 500 H 622"/>
      <path class="pipe" id="p-tankpump" d="M914 552 V 584 H 992"/>
      <path class="pipe" id="p-house" d="M992 588 H 780"/>
      <path class="pipe" id="p-irr" d="M1010 596 V 750 H 120"/>
      <path class="pipe" id="p-pool" d="M1420 690 H 1470 V 640"/>
      <path class="pipe" id="p-pool2" d="M1530 640 V 600 H 1560 V 612"/>
      <path class="pipe" id="p-poolret" d="M1580 640 V 736 H 1300 V 712"/>
      <g id="flows"></g>

      <!-- inside: PV inverter, main inverter, MPPT, battery, geyser, loads -->
      <g><rect x="382" y="384" width="50" height="52" rx="6" fill="#dfe3e8" stroke="#8e98a4" stroke-width="2"/><rect x="388" y="390" width="38" height="10" rx="2" fill="#2a3440"/><circle class="led" id="pvled" cx="420" cy="424" r="3" fill="#2ecc71"/></g>
      <g><rect x="444" y="398" width="86" height="64" rx="8" fill="#2f6fd0" stroke="#1f4f9a" stroke-width="2"/><rect x="444" y="450" width="86" height="12" fill="#24589f"/>
        <path d="M468 424 q 9 -16 18 0 t 18 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle class="led" id="invled" cx="520" cy="407" r="3" fill="#7CFC00"/></g>
      <g><rect x="574" y="412" width="44" height="50" rx="6" fill="#2a3440" stroke="#151c24" stroke-width="2"/><rect x="580" y="420" width="32" height="8" rx="2" fill="#e8a317"/><path d="M580 438 h32 M580 444 h32 M580 450 h32" stroke="#556272" stroke-width="2"/></g>
      <g id="battery"><rect x="444" y="500" width="120" height="90" rx="8" fill="#2b2f36" stroke="#14171c" stroke-width="2"/>
        <rect x="454" y="512" width="20" height="68" rx="3" fill="#14171c"/><rect id="battlvl" x="454" y="512" width="20" height="68" rx="3" fill="#19a974"/>
        <g fill="#3a404a"><rect x="484" y="512" width="70" height="14" rx="3"/><rect x="484" y="530" width="70" height="14" rx="3"/><rect x="484" y="548" width="70" height="14" rx="3"/><rect x="484" y="566" width="70" height="14" rx="3"/></g>
        <g id="chgarrows" opacity="0"><path class="chg" d="M464 560 l-6 8 h12 z" fill="#fff"/><path class="chg" d="M464 560 l-6 8 h12 z" fill="#fff" style="animation-delay:.7s"/></g></g>
      <g id="geyser"><rect x="322" y="474" width="50" height="112" rx="22" fill="url(#tankg)" stroke="#6b5a4b" stroke-width="2.5"/>
        <rect x="330" y="486" width="5" height="60" rx="2.5" fill="#fff" opacity=".3"/>
        <path class="elem" id="elem" d="M332 572 h30 v4 h-30 v4 h30" fill="none" stroke="#ff5a36" stroke-width="2.5"/>
        <g id="geyheat"><path class="heat" d="M338 566 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2"/><path class="heat" d="M354 568 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2" style="animation-delay:.8s"/></g></g>
      <g id="geyser2"><rect x="576" y="474" width="46" height="112" rx="21" fill="url(#tankg)" stroke="#6b5a4b" stroke-width="2.5"/>
        <rect x="583" y="486" width="5" height="60" rx="2.5" fill="#fff" opacity=".3"/>
        <path class="elem" id="elem2" d="M584 572 h28 v4 h-28 v4 h28" fill="none" stroke="#ff5a36" stroke-width="2.5"/>
        <g><path class="heat" d="M590 566 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2"/><path class="heat" d="M605 568 q4 -6 0 -12 t0 -12" fill="none" stroke="#fff" stroke-width="2" style="animation-delay:.8s"/></g>
        <text x="599" y="530" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" opacity=".9">2</text></g>
      <g id="loads"><ellipse id="lampglowe" cx="700" cy="480" rx="64" ry="70" fill="url(#lampglow)" opacity="0"/>
        <line x1="700" y1="394" x2="700" y2="430" stroke="#555" stroke-width="2"/><path d="M684 430 h32 l-6 16 h-20 z" fill="#c9b27c"/><circle id="bulb" cx="700" cy="450" r="5" fill="#ccc"/>
        <rect x="640" y="514" width="74" height="46" rx="4" fill="#1d2026"/><rect id="tv" x="644" y="518" width="66" height="38" rx="2" fill="#30343c"/>
        <rect x="673" y="560" width="8" height="18" fill="#444"/><rect x="658" y="578" width="38" height="5" rx="2" fill="#444"/>
        <rect x="726" y="484" width="30" height="104" rx="4" fill="#e9eef3" stroke="#a3adb8" stroke-width="2"/><line x1="726" y1="520" x2="756" y2="520" stroke="#a3adb8" stroke-width="2"/></g>

      <!-- aircon outdoor unit on the wall -->
      <g id="aircon"><rect x="786" y="520" width="66" height="54" rx="5" fill="#eef1f4" stroke="#9aa4b0" stroke-width="2"/>
        <circle cx="810" cy="547" r="18" fill="#cfd6dd" stroke="#9aa4b0" stroke-width="1.5"/>
        <g class="spin" id="acfan"><path d="M810 547 l0 -14 a14 14 0 0 1 10 4 Z M810 547 l12 7 a14 14 0 0 1 -5 9.5 Z M810 547 l-12 7 a14 14 0 0 1 -5 -9.5 Z" fill="#7b8794"/></g>
        <path d="M836 532 v30 M842 532 v30" stroke="#b8c0c9" stroke-width="2"/><rect x="794" y="574" width="6" height="24" fill="#9aa4b0"/><rect x="838" y="574" width="6" height="24" fill="#9aa4b0"/></g>

      <!-- water tank on a stand + booster pump -->
      <g id="jojo">
        <path d="M872 552 V 598 M956 552 V 598 M872 576 H 956" stroke="#8a7a66" stroke-width="5"/>
        <g clip-path="url(#jojoclip)"><rect x="866" y="410" width="96" height="142" fill="url(#jojo)"/>
          <rect id="jojolvl" x="866" y="452" width="96" height="100" fill="#1f8fd0" opacity=".35"/></g>
        <rect x="866" y="410" width="96" height="142" rx="10" fill="none" stroke="#24502c" stroke-width="2.5"/>
        <path d="M866 440 H962 M866 480 H962 M866 520 H962" stroke="#24502c" stroke-opacity=".5" stroke-width="2"/>
        <ellipse cx="914" cy="410" rx="48" ry="8" fill="#3d8049" stroke="#24502c" stroke-width="2"/>
      </g>
      <g id="booster"><circle cx="1004" cy="586" r="18" fill="#2f6fd0" stroke="#1f4f9a" stroke-width="2.5"/>
        <g class="spin" id="boostimp"><path d="M1004 586 l0 -11 a11 11 0 0 1 8 3 Z M1004 586 l9.5 5.5 a11 11 0 0 1 -4 7.5 Z M1004 586 l-9.5 5.5 a11 11 0 0 1 -4 -7.5 Z" fill="#fff"/></g>
        <rect x="992" y="602" width="24" height="6" rx="2" fill="#555"/></g>

      <!-- pool, with ripples, lights and cleaner -->
      <g id="pool">
        <rect x="1056" y="636" width="368" height="94" rx="16" fill="#e9e4da" stroke="#b9b2a5" stroke-width="2"/>
        <g clip-path="url(#poolclip)" id="poolwater">
          <rect x="1060" y="640" width="360" height="86" fill="url(#poolg)"/>
          <path class="wave1" d="M1036 652 q 9 -4 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>
          <path class="wave2" d="M1036 676 q 9 -4 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>
          <ellipse class="pglow" cx="1240" cy="690" rx="190" ry="60" fill="url(#poolglow)"/>
          <g id="chl"><circle class="bub" cx="1296" cy="716" r="2.5" fill="#fff"/><circle class="bub" cx="1306" cy="716" r="2" fill="#fff" style="animation-delay:.6s"/><circle class="bub" cx="1288" cy="716" r="2" fill="#fff" style="animation-delay:1.2s"/></g>
          <g id="cleaner"><g class="bot"><rect x="1090" y="708" width="30" height="13" rx="5" fill="#2b3440"/><rect x="1093" y="719" width="24" height="3" rx="1.5" fill="#111"/></g></g>
        </g>
        <text id="pooltemp" x="1240" y="694" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-size="30" font-weight="600" fill="#fff" opacity=".95">26°</text>
      </g>
      <!-- pool equipment: pump, filter, heat pump -->
      <g id="pooleq">
        <rect x="1446" y="604" width="148" height="6" fill="#8a7a66"/>
        <circle cx="1470" cy="628" r="16" fill="#2f6fd0" stroke="#1f4f9a" stroke-width="2.5"/>
        <g class="spin" id="poolimp"><path d="M1470 628 l0 -10 a10 10 0 0 1 7 3 Z M1470 628 l8.6 5 a10 10 0 0 1 -3.6 6.8 Z M1470 628 l-8.6 5 a10 10 0 0 1 -3.8 -6.8 Z" fill="#fff"/></g>
        <rect x="1514" y="600" width="32" height="44" rx="14" fill="#d7dde3" stroke="#8e98a4" stroke-width="2"/><path d="M1520 616 h20 M1520 624 h20" stroke="#8e98a4" stroke-width="2"/>
        <g id="heatpump"><rect x="1548" y="560" width="48" height="52" rx="5" fill="#eef1f4" stroke="#9aa4b0" stroke-width="2"/>
          <circle cx="1572" cy="582" r="15" fill="#cfd6dd" stroke="#9aa4b0" stroke-width="1.5"/>
          <g class="spin" id="hpfan"><path d="M1572 582 l0 -11 a11 11 0 0 1 8 3 Z M1572 582 l9.5 5.5 a11 11 0 0 1 -4 7.5 Z M1572 582 l-9.5 5.5 a11 11 0 0 1 -4 -7.5 Z" fill="#7b8794"/></g>
          <rect id="hpled" x="1556" y="602" width="10" height="4" rx="2" fill="#9aa4b0"/></g>
      </g>

      <!-- garden sprinklers on the front lawn -->
      <g id="sprinklers"></g>

      <!-- value labels -->
      <g id="labels"></g>
    </svg>
    </div></div><div class="hint">Swipe the picture sideways to see the yard and pool.</div><div class="tiles" id="tiles"></div>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    const sl = (540 - 282) / (382 - 232), left = (y) => 540 - (y - 232) * sl; let h = "";
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const y1 = 284 + r * 40, y2 = y1 + 36, a = left(y1) + 18 + c * 52, b = left(y2) + 18 + c * 52;
      h += `<polygon points="${b},${y2} ${a},${y1} ${a + 48},${y1} ${b + 48},${y2}" fill="url(#panelg)" stroke="#c9ced6" stroke-width="2"/>
        <g stroke="#6f8fc4" stroke-width=".8" opacity=".75"><line x1="${(a + b) / 2}" y1="${(y1 + y2) / 2}" x2="${(a + b) / 2 + 48}" y2="${(y1 + y2) / 2}"/>${[1, 2, 3].map((k) => `<line x1="${b + k * 12}" y1="${y2}" x2="${a + k * 12}" y2="${y1}"/>`).join("")}</g>`;
    }
    $("panels").innerHTML = h;
    let t = "";
    for (let k = 0; k < 8; k++) { const x = 612 + k * 10.5; t += `<line x1="${x}" y1="302" x2="${x + 44}" y2="350" stroke="#56616e" stroke-width="5" stroke-linecap="round"/><line x1="${x}" y1="302" x2="${x + 44}" y2="350" stroke="#9fb3c8" stroke-width="1" opacity=".6"/>`; }
    $("collector").querySelector("g").innerHTML = t;
    const fl = $("flows");
    ["grid", "pvac", "pvdc", "batt", "ess", "gey", "gey2", "yard"].forEach((k) => { const d = $("w-" + k).getAttribute("d"); fl.insertAdjacentHTML("beforeend", `<path class="glowline" id="g-${k}" d="${d}"/><path class="flow" id="f-${k}" d="${d}"/>`); });
    ["coll", "coll2", "tankpump", "house", "irr", "pool", "pool2", "poolret"].forEach((k) => { const d = $("p-" + k).getAttribute("d"); fl.insertAdjacentHTML("beforeend", `<path class="glowline" id="g-${k}" d="${d}"/><path class="flow wat" id="f-${k}" d="${d}"/>`); });
    this._built = true;
  }

  _flow(k, v, color, rev) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const f = $("f-" + k), g = $("g-" + k), on = v !== null && Math.abs(v) >= 1;
    f.classList.toggle("on", on); g.classList.toggle("on", on); f.classList.toggle("rev", !!rev);
    f.style.stroke = color; g.style.stroke = color;
    f.style.setProperty("--spd", `${Math.max(0.35, 2.2 - Math.abs(v || 0) / 2500).toFixed(2)}s`);
  }
  _show(ids, on) { (Array.isArray(ids) ? ids : [ids]).forEach((id) => { const e = this.shadowRoot.getElementById(id); if (e) e.style.display = on ? "" : "none"; }); }

  _sprinklers(zones) {
    const key = zones.map((z) => z.name).join("|");
    if (this._zKey === key) return;
    this._zKey = key;
    const n = zones.length, x0 = 220, x1 = 840;
    this.shadowRoot.getElementById("sprinklers").innerHTML = zones.map((z, i) => {
      const x = Math.round(n === 1 ? (x0 + x1) / 2 : x0 + i * (x1 - x0) / (n - 1));
      return `<g class="spray" id="z${i}"><path d="M${x} 750 V 712" stroke="#555" stroke-width="4"/><rect x="${x - 7}" y="704" width="14" height="10" rx="3" fill="#2b3440"/>
        <ellipse class="mist" cx="${x}" cy="700" rx="${Math.min(70, 300 / Math.max(n, 1))}" ry="24" fill="#bfe6ff"/>
        ${[-60, -40, -20, 0, 20, 40, 60].map((dx, k) => `<circle class="drop" cx="${x}" cy="704" r="2.6" fill="#1f8fd0" style="--dx:${dx * Math.min(1, 4 / Math.max(n, 1))}px;--dy:${-40 + Math.abs(dx) * 0.35}px;animation-delay:${(k % 3) * 0.4}s"/>`).join("")}</g>`;
    }).join("");
  }

  _render() {
    const d = this._d; if (!d) return;
    if (!this._built) this._build();
    const $ = (id) => this.shadowRoot.getElementById(id);
    const snap = d.snap || {}, f = snap.features || {}, L = snap.live || {};
    const W = d.water || {}, WL = W.live || {}, WF = W.features || {};
    const irr = d.irr || { zones: [] }, devs = d.devices || [];
    // ---------- energy
    const split = !!(f.pv_ac || f.pv_dc), lsplit = !!f.load_split, hasGrid = !!(f.grid || f.grid_status), down = L.grid_available === false;
    const grid = num(L.grid), solar = num(L.solar), batt = num(L.battery), soc = num(L.soc), load = num(L.load);
    const pvac = split ? num(L.solar_ac) : null, pvdc = split ? num(L.solar_dc) : solar;
    const ess = lsplit && num(L.load_ess) !== null ? num(L.load_ess) : load;
    const fm = flowMix(L, lsplit), essSrc = top(fm.home, "grid");
    // ---------- geysers: Hamlet Geyser first (one per geyser), else loads called "geyser"
    const geyLoads = (snap.extras || []).filter((e) => /geyser|geiser/i.test(`${e.name} ${e.entity_id || ""}`));
    const loadSrc = (side) => (side === "noness" ? top(fm.noness, "grid") : top(fm.home, "solar"));
    const G = (this._gs.filter(Boolean).length ? this._gs.filter(Boolean) : []).map((g, i) => {
      const gl = g.live || {}, w = gl.is_on ? Math.max(num(gl.geyser_w) || 0, 0) : 0, coll = !!(g.features?.collector && g.features.collector !== "none");
      const ld = geyLoads[i];
      return { name: g.name || `Geyser ${i + 1}`, temp: num(gl.temp), w, src: g.decision?.source === "solar" ? "solar" : loadSrc(ld?.side),
        coll, collOn: !!(coll && (g.pump?.on || gl.collector_pump_on || gl.pump_on)), collT: num(gl.collector_temp),
        status: g.decision?.status || "", reason: g.decision?.reason || "" };
    });
    if (!G.length) geyLoads.slice(0, 2).forEach((e) => G.push({ name: e.name, temp: null, w: Math.max(num(e.w) || 0, 0), src: loadSrc(e.side), coll: false, collOn: false, collT: null, status: "", reason: "" }));
    const hasGey = G.length > 0, g1 = G[0], g2 = G[1];
    const ci = G.findIndex((x) => x.coll), cg = ci >= 0 ? G[ci] : null;
    // ---------- water
    const hasBooster = !!(WF.pump_switch || WF.pump_power || WF.pump_hz || WF.water_pressure);
    const boost = !!WL.pump_running, bar = num(WL.pressure), tank = num(WL.tank);
    const zones = (irr.zones || []).filter((z) => z.enabled !== false || z.on).slice(0, 6);
    const zOn = zones.map((z) => !!z.on || z.id === irr.run?.zone);
    const watering = zOn.some(Boolean);
    // ---------- pool + devices
    const poolDevs = devs.filter((x) => x.area === "pool");
    const hasPool = !!(WF.pool_switch || WF.pool_power || WF.pool_temp || poolDevs.length);
    const pp = !!WL.pool_running, poolT = num(WL.pool_temp);
    const hp = poolDevs.find((x) => ["heatpump", "heater"].includes(x.kind));
    const hpOn = !!(hp && hp.on);
    const chl = poolDevs.some((x) => x.kind === "chlorinator" && x.on);
    const lights = poolDevs.some((x) => x.kind === "light" && x.on);
    const cleaners = poolDevs.filter((x) => x.kind === "cleaner"), cleanOn = cleaners.some((x) => x.on);
    const ac = devs.find((x) => x.kind === "aircon"), acOn = !!(ac && ac.on);
    const yardW = (pp ? num(WL.pool_w) || 0 : 0) + (boost ? num(WL.pump_w) || 0 : 0) + poolDevs.reduce((t, x) => t + (x.on ? num(x.w) || num(x.rated_w) || 0 : 0), 0);
    // ---------- sky
    const sun = this._hass?.states?.["sun.sun"], elev = num(sun?.attributes?.elevation), hr = new Date().getHours();
    const night = sun ? sun.state === "below_horizon" : hr < 6 || hr >= 19;
    const cloudy = !night && solar !== null && elev !== null && elev > 25 && solar < 300;
    const sky = night ? ["#0d1b33", "#2d4568"] : cloudy ? ["#9aa9b8", "#d2dbe3"] : ["#7fbdf0", "#d8eefc"];
    $("sk1").setAttribute("stop-color", sky[0]); $("sk2").setAttribute("stop-color", sky[1]);
    $("sun").style.display = night ? "none" : ""; $("moon").setAttribute("opacity", night ? 1 : 0); $("stars").setAttribute("opacity", night ? 1 : 0);
    $("sun").setAttribute("transform", `translate(1440 ${elev === null ? 100 : Math.round(200 - Math.min(Math.max(elev, 0), 60) * 1.8)})`);
    $("clouds").setAttribute("opacity", cloudy ? 0.95 : night ? 0.15 : 0.35);
    $("pvshine").style.display = (solar || 0) > 500 ? "" : "none";
    // ---------- what this property has
    this._show(["pylon", "w-grid", "f-grid", "g-grid"], hasGrid);
    this._show(["w-pvac", "f-pvac", "g-pvac"], !!f.pv_ac);
    const dc = split ? !!f.pv_dc : true; this._show(["w-pvdc", "f-pvdc", "g-pvdc"], dc);
    this._show(["battery", "w-batt", "f-batt", "g-batt"], !!f.battery);
    this._show(["geyser", "w-gey", "f-gey", "g-gey"], hasGey);
    this._show(["geyser2", "w-gey2", "f-gey2", "g-gey2"], !!g2);
    this._show("collector", !!cg);
    this._show(["p-coll", "f-coll", "g-coll"], ci === 0);
    this._show(["p-coll2", "f-coll2", "g-coll2"], ci === 1);
    this._show(["jojo", "booster", "p-tankpump", "f-tankpump", "g-tankpump", "p-house", "f-house", "g-house"], hasBooster);
    this._show(["p-irr", "f-irr", "g-irr", "sprinklers"], zones.length > 0);
    this._show(["pool", "pooleq", "p-pool", "f-pool", "g-pool", "p-pool2", "f-pool2", "g-pool2", "p-poolret", "f-poolret", "g-poolret"], hasPool);
    this._show("heatpump", !!hp); this._show("cleaner", cleaners.length > 0); this._show("aircon", !!ac);
    this._show(["w-yard", "f-yard", "g-yard"], hasPool || hasBooster);
    $("gridx").setAttribute("opacity", hasGrid && down ? 1 : 0); $("pylon").setAttribute("stroke", down ? "#b0b6bd" : "#7b8592");
    const bd = $("badge");
    bd.textContent = !hasGrid ? (night ? "Night" : "Day") : down ? "Grid down" : (grid || 0) > 20 ? `Grid · buying ${fmt(grid)}` : (grid || 0) < -20 ? `Grid · selling ${fmt(-grid)}` : "Grid · idle";
    bd.classList.toggle("down", hasGrid && down);
    // ---------- power wires
    this._flow("grid", down ? 0 : Math.abs(grid || 0), C.grid, (grid || 0) < 0);
    this._flow("pvac", pvac, C.solar); this._flow("pvdc", pvdc, C.solar);
    this._flow("batt", batt === null ? 0 : Math.abs(batt), batt > 0 ? C[top(fm.charge, "solar")] : C.battery, batt > 0);
    this._flow("ess", Math.max((ess || 0) - yardW, 0), C[essSrc]);
    this._flow("gey", g1 && g1.w > 50 ? g1.w : 0, C[g1?.src] || C.grid);
    this._flow("gey2", g2 && g2.w > 50 ? g2.w : 0, C[g2?.src] || C.grid);
    this._flow("yard", yardW, C[essSrc]);
    // ---------- water pipes
    this._flow("tankpump", boost ? 900 : 0, C.water);
    this._flow("house", boost && !watering ? 900 : 0, C.water);
    this._flow("irr", watering ? 1400 : 0, C.water);
    this._flow("coll", ci === 0 && cg.collOn ? 900 : 0, C.heat);
    this._flow("coll2", ci === 1 && cg.collOn ? 900 : 0, C.heat);
    this._flow("pool", pp ? 1200 : 0, C.water); this._flow("pool2", pp ? 1200 : 0, C.water); this._flow("poolret", pp ? 1200 : 0, hpOn ? C.heat : C.water);
    // ---------- moving parts
    $("boostimp").classList.toggle("on", boost); $("poolimp").classList.toggle("on", pp);
    $("hpfan").classList.toggle("on", hpOn); $("hpled").setAttribute("fill", hpOn ? "#eb6834" : "#9aa4b0");
    $("acfan").classList.toggle("on", acOn);
    [[g1, "elem", "geyser"], [g2, "elem2", "geyser2"]].forEach(([x, e, t]) => {
      const on = !!(x && x.w > 50);
      $(e).classList.toggle("on", on); $(e).setAttribute("stroke", on ? "#ff5a36" : "#6b5a4b");
      $(t).classList.toggle("heating", on || !!(x && x.collOn));
    });
    $("lampglowe").setAttribute("opacity", night ? 1 : 0.2); $("bulb").setAttribute("fill", night && (ess || 0) > 50 ? "#ffe27a" : "#ccc");
    this._tick = (this._tick || 0) + 1; $("tv").setAttribute("fill", (ess || 0) > 150 ? (this._tick % 2 ? "#3b6fb6" : "#4a86d4") : "#30343c");
    $("pvled").setAttribute("fill", (pvac || 0) > 20 ? "#2ecc71" : down ? "#e74c3c" : "#f1c40f"); $("invled").setAttribute("fill", down ? "#ffb300" : "#7CFC00");
    this._sprinklers(zones);
    zones.forEach((z, i) => $(`z${i}`)?.classList.toggle("on", zOn[i]));
    const lv = 142 * (tank === null ? 70 : Math.max(2, Math.min(100, tank))) / 100;
    $("jojolvl").setAttribute("y", 552 - lv); $("jojolvl").setAttribute("height", lv); $("jojolvl").setAttribute("opacity", tank === null ? 0.15 : 0.35);
    if (f.battery) { const s = soc === null ? 50 : soc, bl = Math.max(4, 68 * s / 100); $("battlvl").setAttribute("y", 512 + 68 - bl); $("battlvl").setAttribute("height", bl);
      $("battlvl").setAttribute("fill", s < 20 ? "#e34948" : s < 40 ? "#eda100" : "#19a974"); $("chgarrows").setAttribute("opacity", (batt || 0) > 50 ? 1 : 0); }
    $("pool").classList.toggle("lit", lights); $("chl").classList.toggle("chl", chl && pp);
    $("pooltemp").textContent = poolT === null ? "" : `${poolT.toFixed(1)}°`;
    $("pw1").setAttribute("stop-color", poolT !== null && poolT > 26 ? "#47c2cf" : "#3fb6d8");
    // ---------- labels
    const lab = (x, y, v, sub, color, anchor = "middle") => {
      const w = Math.max(String(v).length * 11, String(sub).length * 6.6) + 26, x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      return `<g class="lbl"><rect class="bg" x="${x0}" y="${y - 21}" width="${w}" height="44" rx="9"/><rect x="${x0}" y="${y - 21}" width="4" height="44" rx="2" fill="${color}"/>
        <text x="${x0 + 13}" y="${y}">${esc(v)}</text><text class="t2" x="${x0 + 13}" y="${y + 16}">${esc(sub)}</text></g>`;
    };
    const battTxt = batt === null ? "" : batt > 30 ? `charging ${fmt(batt)}` : batt < -30 ? `supplying ${fmt(-batt)}` : "idle";
    const zNames = zones.filter((_, i) => zOn[i]).map((z) => z.name);
    let labels = "";
    if (hasGrid) labels += lab(250, 300, down ? "Down" : fmt(Math.abs(grid || 0)), down ? "Grid · no power" : (grid || 0) > 20 ? "Grid · buying" : (grid || 0) < -20 ? "Grid · selling" : "Grid · idle", C.grid);
    labels += lab(300, 214, fmt(solar), split ? `Solar · ${[f.pv_ac ? `${fmt(pvac)} AC` : "", f.pv_dc ? `${fmt(pvdc)} DC` : ""].filter(Boolean).join(" + ")}` : "Solar", C.solar, "start");
    const gLab = (x, px, py) => lab(px, py, x.temp !== null ? `${Math.round(x.temp)}°C` : x.w > 50 ? fmt(x.w) : "Off",
      `${x.name} · ${x.collOn ? `collector on${x.collT !== null ? ` ${Math.round(x.collT)}°C` : ""}` : x.w > 50 ? `element ${fmt(x.w)}` : (x.status || "off").toLowerCase()}`,
      x.collOn ? C.heat : x.w > 50 ? C[x.src] : C.grey, "start");
    if (g1) labels += gLab(g1, 712, 214);
    if (g2) labels += gLab(g2, 712, 266);
    if (f.battery) labels += lab(504, 636, soc !== null ? `${Math.round(soc)}%` : fmt(batt), `Battery${battTxt ? " · " + battTxt : ""}`, C.battery);
    if (hasBooster) labels += lab(914, 380, tank !== null ? `${Math.round(tank)}%` : bar !== null ? `${bar.toFixed(1)} bar` : "Water", `${boost ? "Booster on" : "Booster"}${bar !== null && tank !== null ? ` · ${bar.toFixed(1)} bar` : ""}`, C.water);
    if (watering) labels += lab(30, 662, "Watering", zNames.join(" + "), C.water, "start");
    if (hasPool) labels += lab(1240, 612, pp ? `Pool pump${num(WL.pool_w) ? " " + fmt(num(WL.pool_w)) : " on"}` : "Pool pump off",
      hpOn ? `${hp.name} ${fmt(num(hp.w) || num(hp.rated_w))}${poolT !== null ? ` · ${poolT.toFixed(1)}°C` : ""}` : `${poolT !== null ? `Pool ${poolT.toFixed(1)}°C` : "Pool"}${lights ? " · lights on" : ""}`,
      hpOn ? C.heat : pp ? C.water : C.grey);
    $("labels").innerHTML = labels;
    // ---------- tiles
    const tile = (k, c, pill, pc, val, note) => `<div class="tile"><div class="k"><b><i style="background:${c}"></i>${esc(k)}</b><span class="pill ${pc}">${esc(pill)}</span></div><div class="v">${esc(val)}</div><div class="n">${esc(note)}</div></div>`;
    let tiles = tile("Energy", C.solar, !hasGrid ? "Off-grid" : down ? "Grid down" : "Grid on", down ? "warn" : "on", fmt(solar),
      `solar · house ${fmt(ess)}${f.battery && soc !== null ? ` · battery ${Math.round(soc)}%` : ""}`);
    G.forEach((x) => { tiles += tile(G.length > 1 ? x.name : "Geyser", C.heat, x.status || (x.w > 50 ? "Heating" : "Off"), x.w > 50 || x.collOn ? "on" : x.status === "Not responding" ? "warn" : "",
      x.temp !== null ? `${x.temp.toFixed(0)}°C` : x.w > 50 ? fmt(x.w) : "Off",
      x.collOn ? "solar collector pump running" : x.w > 50 ? `element ${fmt(x.w)} from ${SRCNAME[x.src] || "grid"}` : (x.reason || "element off")); });
    if (hasPool) tiles += tile("Pool", "#1c7fb8", pp ? "Pump on" : "Pump off", pp ? "on" : "", poolT !== null ? `${poolT.toFixed(1)}°C` : pp ? "Filtering" : "Off",
      [pp ? "filtering" : "", hpOn ? "heat pump on" : "", chl ? "salt cell on" : "", lights ? "lights on" : "", cleanOn ? "cleaner on" : ""].filter(Boolean).join(" · ") || "standing by");
    if (hasBooster || zones.length) tiles += tile("Water & irrigation", C.water, watering ? "Watering" : boost ? "Pump on" : W.tripped ? "Stopped" : "Standing by", W.tripped ? "warn" : watering || boost ? "on" : "",
      bar !== null ? `${bar.toFixed(1)} bar` : tank !== null ? `${Math.round(tank)}%` : "–", watering ? zNames.join(" + ") : tank !== null ? `tank ${Math.round(tank)}%` : `${zones.length} valve${zones.length === 1 ? "" : "s"}`);
    $("tiles").innerHTML = tiles;
  }
}
customElements.define("hamlet-home-property", HamletHomeProperty);
