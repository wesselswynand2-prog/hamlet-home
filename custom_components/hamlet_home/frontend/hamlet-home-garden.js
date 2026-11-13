// Hamlet Home – Garden view of the irrigation: areas with pictures → their valves → one valve
// (weather tiles, 7-day water chart, its schedule, water now). Uses the same irrigation backend as the classic view.
import { windState, compass } from "./hamlet-home-sky.js";

const DOMAIN = "hamlet_home";
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const fmtL = (l) => (l === null || l === undefined ? "–" : l >= 1000 ? `${(l / 1000).toFixed(2)} kL` : `${Math.round(l)} L`);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// area kind from its name (or the valve's name when no area is set)
const kindOf = (name) => (/gras|grass|lawn|kikuyu|turf|perk/i.test(name) ? "lawn" : /boom|bome|tree|orchard|vrugte|fruit|wingerd|vine/i.test(name) ? "trees" : /pot|veg|groente|kruie|herb/i.test(name) ? "veg" : "beds");
const AREA_NAME = { lawn: "Lawn", beds: "Beds & garden", trees: "Trees", veg: "Vegetables & pots" };
const groupOf = (z) => (z.group && z.group.trim()) || AREA_NAME[kindOf(z.name || "")];

const blades = (n, w, h, base) => Array.from({ length: n }, (_, i) => `<path d="M${i * (w / n) + 2} ${base} q2 -${h * .5} ${(i % 3) - 1} -${h * .7 + (i % 5) * h * .06}" stroke="${i % 2 ? "#3f9a3b" : "#5cb84f"}" stroke-width="2.4" fill="none"/>`).join("");
const ART = {
  lawn: `<svg viewBox="0 0 120 92" aria-hidden="true"><rect width="120" height="92" fill="#bfe5f7"/><circle cx="96" cy="16" r="9" fill="#f6c343"/><rect y="56" width="120" height="36" fill="#8fd17f"/>${blades(30, 120, 44, 92)}<rect y="84" width="120" height="8" fill="#3f9a3b"/></svg>`,
  beds: `<svg viewBox="0 0 120 92" aria-hidden="true"><rect width="120" height="92" fill="#bfe5f7"/><rect y="56" width="120" height="36" fill="#7a5a3a"/><rect y="56" width="120" height="6" fill="#5d432b"/>${[12, 36, 60, 84, 108].map((x, i) => `<path d="M${x} 60 V 34" stroke="#3f9a3b" stroke-width="3"/><ellipse cx="${x - 6}" cy="44" rx="6" ry="3" fill="#5cb84f"/><ellipse cx="${x + 6}" cy="40" rx="6" ry="3" fill="#5cb84f"/><circle cx="${x}" cy="30" r="7" fill="${["#e5484d", "#f6c343", "#c56cf0", "#ff8a3d", "#e5484d"][i]}"/>`).join("")}</svg>`,
  trees: `<svg viewBox="0 0 120 92" aria-hidden="true"><rect width="120" height="92" fill="#bfe5f7"/><rect y="74" width="120" height="18" fill="#8fd17f"/>${[30, 86].map((x) => `<rect x="${x - 4}" y="48" width="8" height="30" fill="#7a5a3a"/><circle cx="${x}" cy="36" r="22" fill="#3f9a3b"/><circle cx="${x - 10}" cy="42" r="12" fill="#5cb84f"/>${[[-8, 30], [6, 26], [10, 42], [-2, 44]].map(([a, b]) => `<circle cx="${x + a}" cy="${b}" r="3.4" fill="#7d3c98"/>`).join("")}`).join("")}</svg>`,
  veg: `<svg viewBox="0 0 120 92" aria-hidden="true"><rect width="120" height="92" fill="#bfe5f7"/><rect y="60" width="120" height="32" fill="#7a5a3a"/>${[20, 60, 100].map((x) => `<path d="M${x} 62 V 44" stroke="#3f9a3b" stroke-width="3"/><ellipse cx="${x - 8}" cy="50" rx="9" ry="4" fill="#5cb84f"/><ellipse cx="${x + 8}" cy="46" rx="9" ry="4" fill="#5cb84f"/><circle cx="${x - 4}" cy="56" r="5" fill="#e5484d"/><circle cx="${x + 6}" cy="58" r="4.5" fill="#e5484d"/>`).join("")}</svg>`,
};
const ICON = {
  lawn: `<svg viewBox="0 0 40 40" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<path d="M${6 + i * 3.5} 36 q1 -10 ${(i % 3) - 1} -${14 + (i % 4) * 3}" stroke="${i % 2 ? "#3f9a3b" : "#5cb84f"}" stroke-width="2.2" fill="none"/>`).join("")}</svg>`,
  beds: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 36 V 18" stroke="#3f9a3b" stroke-width="2.5"/><ellipse cx="14" cy="27" rx="6" ry="3" fill="#5cb84f"/><ellipse cx="26" cy="23" rx="6" ry="3" fill="#5cb84f"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="20" cy="9" rx="3.4" ry="5.5" fill="#e5484d" transform="rotate(${a} 20 14)"/>`).join("")}<circle cx="20" cy="14" r="3" fill="#f6c343"/></svg>`,
  trees: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="22" width="4" height="15" fill="#7a5a3a"/><circle cx="20" cy="16" r="12" fill="#3f9a3b"/><circle cx="14" cy="19" r="6" fill="#5cb84f"/><circle cx="16" cy="12" r="2.2" fill="#7d3c98"/><circle cx="24" cy="16" r="2.2" fill="#7d3c98"/><circle cx="21" cy="22" r="2.2" fill="#7d3c98"/></svg>`,
  veg: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34 V 16" stroke="#3f9a3b" stroke-width="2.5"/><ellipse cx="13" cy="20" rx="7" ry="3.4" fill="#5cb84f"/><ellipse cx="27" cy="17" rx="7" ry="3.4" fill="#5cb84f"/><circle cx="15" cy="29" r="5" fill="#e5484d"/><circle cx="26" cy="30" r="4.4" fill="#e5484d"/></svg>`,
};
const T = (p) => `<svg viewBox="0 0 30 30" aria-hidden="true">${p}</svg>`;
const TI = {
  temp: T(`<rect x="12" y="3" width="6" height="17" rx="3" fill="none" stroke="#e5484d" stroke-width="2"/><circle cx="15" cy="23" r="5" fill="#e5484d"/><rect x="14" y="10" width="2" height="12" fill="#e5484d"/>`),
  hum: T(`<path d="M15 3 C 9 12 7 15 7 19 a8 8 0 0 0 16 0 c0-4 -2-7 -8-16z" fill="#1f8fd0"/>`),
  wind: T(`<path d="M3 11 H 19 a4 4 0 1 0 -4 -4 M3 17 H 24 a4 4 0 1 1 -4 4 M3 23 H 12" stroke="#7d8a7e" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  rain: T(`<path d="M8 15 a6 6 0 0 1 1 -12 a7 7 0 0 1 13 3 a5 5 0 0 1 0 9z" fill="#9fb6c8"/><path d="M10 19 l-2 6 M16 19 l-2 6 M22 19 l-2 6" stroke="#1f8fd0" stroke-width="2.2" stroke-linecap="round"/>`),
  last: T(`<circle cx="15" cy="15" r="11" fill="none" stroke="#3f9a3b" stroke-width="2.2"/><path d="M15 8 V 15 L 20 18" stroke="#3f9a3b" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  used: T(`<path d="M6 8 H 24 L 21 26 H 9 Z" fill="#d7ecf8" stroke="#1f8fd0" stroke-width="2"/><path d="M8 15 H 22 L 21 26 H 9 Z" fill="#1f8fd0"/>`),
};
const WX = { sunny: "☀", "clear-night": "☾", partlycloudy: "⛅", cloudy: "☁", rainy: "🌧", pouring: "🌧", "lightning-rainy": "⛈", lightning: "⛈", fog: "🌫", windy: "💨", snowy: "❄", hail: "🌨" };

const STYLE = `
:host { display: block; --g-bg: var(--card-background-color, #fff); --g-fg: var(--primary-text-color, #1d2a1f); --g-muted: var(--secondary-text-color, #5f6f61);
  --g-line: var(--divider-color, #d9e3d4); --g-leaf: #3f9a3b; --g-leaf-deep: #2b7130; --g-soft: rgba(63,154,59,.13); --g-water: #1f8fd0; --g-wsoft: rgba(31,143,208,.13); --g-bad: #d4483b; color: var(--g-fg); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--g-leaf); color: #fff; border-radius: 14px; }
.bar h3 { font-size: 17px; font-weight: 600; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar button { background: rgba(255,255,255,.2); border: 0; color: #fff; font: 600 14px inherit; font-family: inherit; padding: 6px 10px; border-radius: 10px; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--g-water); outline-offset: 2px; }
.view { display: flex; flex-direction: column; gap: 14px; padding-top: 14px; }
.wx { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.wx div { background: var(--g-wsoft); border-radius: 14px; padding: 8px; text-align: center; display: flex; flex-direction: column; }
.wx b { font-size: 20px; } .wx span { font-size: 12px; color: var(--g-muted); }
.lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--g-muted); font-weight: 600; }
.note { font-size: 13px; color: var(--g-muted); }
.areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.area { display: flex; align-items: stretch; border: 1px solid var(--g-line); border-radius: 16px; overflow: hidden; background: none; cursor: pointer; text-align: left; padding: 0; font: inherit; color: inherit; width: 100%; }
.area svg { width: 120px; flex: 0 0 120px; height: 96px; display: block; }
.area .t { padding: 10px 14px; display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
.area .t b { font-size: 19px; font-weight: 600; }
.area .t span { font-size: 13px; color: var(--g-muted); }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--g-soft); color: var(--g-leaf-deep); width: fit-content; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill.on { background: var(--g-wsoft); color: var(--g-water); }
.pill.on::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--g-water); animation: pulse 1.2s infinite; flex: 0 0 7px; }
.pill.warn { background: rgba(212,72,59,.12); color: var(--g-bad); }
@keyframes pulse { 50% { opacity: .3; } }
.zones { display: flex; flex-direction: column; }
.zone { display: flex; align-items: center; gap: 12px; padding: 10px 4px; border: 0; border-bottom: 1px solid var(--g-line); background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
.zone:last-child { border-bottom: 0; }
.zone .ico { width: 52px; height: 52px; border-radius: 14px; background: var(--g-soft); flex: 0 0 52px; display: grid; place-items: center; }
.zone .ico svg { width: 40px; height: 40px; }
.zone .t { flex: 1; min-width: 0; } .zone .t b { display: block; font-weight: 600; } .zone .t span { font-size: 12.5px; color: var(--g-muted); }
.zone .go { color: var(--g-muted); font-size: 20px; }
.cols { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 860px) { .cols { grid-template-columns: 1fr 1fr; } }
.col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.tile { background: var(--g-soft); border-radius: 14px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; min-width: 0; }
.tile svg { width: 30px; height: 30px; flex: 0 0 30px; }
.tile .k { font-size: 11.5px; color: var(--g-muted); } .tile .v { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile.w { background: var(--g-wsoft); }
.chart { border: 1px solid var(--g-line); border-radius: 14px; padding: 10px 10px 4px; }
.chart svg { width: 100%; height: auto; max-height: 240px; display: block; } .chart text { fill: var(--g-muted); font-size: 11px; font-family: inherit; }
.set { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.set label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--g-muted); }
.set input, .set select { font: 15px inherit; font-family: inherit; color: var(--g-fg); background: transparent; border: 1px solid var(--g-line); border-radius: 10px; padding: 8px 10px; min-width: 0; width: 100%; }
.progs { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 13px; padding: 5px 10px; border-radius: 10px; background: var(--g-soft); color: var(--g-leaf-deep); }
.chip.off { opacity: .55; }
.row { display: flex; align-items: center; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
.msg { font-size: 13px; color: var(--g-muted); } .msg.err { color: var(--g-bad); } .msg.ok { color: var(--g-leaf); }
.save { background: none; border: 1px solid var(--g-leaf); color: var(--g-leaf); border-radius: 10px; padding: 7px 14px; font: 600 14px inherit; font-family: inherit; cursor: pointer; }
.now { border: 1px solid var(--g-line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.mins { display: flex; align-items: center; justify-content: center; gap: 22px; }
.mins b { font-size: 40px; font-variant-numeric: tabular-nums; min-width: 2.2ch; display: inline-block; text-align: center; }
.round { width: 46px; height: 46px; border-radius: 50%; border: 1px solid var(--g-line); background: none; color: var(--g-fg); font-size: 24px; cursor: pointer; }
.go2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.btn { border: 0; border-radius: 14px; padding: 13px; font: 600 16px inherit; font-family: inherit; cursor: pointer; }
.btn.start { background: var(--g-leaf); color: #fff; } .btn.stop { background: var(--g-bad); color: #fff; } .btn:disabled { opacity: .4; cursor: default; }
.prog { height: 8px; background: var(--g-line); border-radius: 99px; overflow: hidden; } .prog i { display: block; height: 100%; background: var(--g-water); transition: width .6s; }
.status { text-align: center; font-size: 14px; color: var(--g-muted); min-height: 1.4em; }
.empty { padding: 18px; text-align: center; color: var(--g-muted); }
@media (prefers-reduced-motion: reduce) { .pill.on::before { animation: none; } }
`;

class HamletHomeGarden extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._v = { view: "home", area: null, zone: null, mins: null };
    this._daily = null;
    this.shadowRoot.addEventListener("click", (e) => this._click(e));
  }
  set hass(h) {
    this._hass = h;
    const now = Date.now();
    if (this._v.view === "zone" && (!this._lastTick || now - this._lastTick > 15000)) { this._lastTick = now; this._renderTiles(); }
  }
  set data(d) {
    this._d = d || {};
    const eid = this._d.weather;
    if (eid !== this._wxId) this._subscribeWx(eid);
    this._render();
  }
  disconnectedCallback() { if (this._wxUnsub) { this._wxUnsub.then((u) => u && u()).catch(() => {}); this._wxUnsub = null; this._wxId = undefined; } }

  _subscribeWx(eid) {
    if (this._wxUnsub) this._wxUnsub.then((u) => u && u()).catch(() => {});
    this._wxUnsub = null; this._wxId = eid; this._daily = null;
    const st = eid && this._hass?.states?.[eid];
    if (!st || !this._hass.connection) return;
    const feats = st.attributes?.supported_features ?? 0, type = feats & 1 ? "daily" : feats & 4 ? "twice_daily" : null;
    if (!type) return;
    this._wxUnsub = this._hass.connection.subscribeMessage((ev) => { this._daily = ev.forecast || []; this._render(true); },
      { type: "weather/subscribe_forecast", forecast_type: type, entity_id: eid }).catch(() => null);
  }

  // ------------------------------------------------------------- data
  get _irr() { return this._d?.irr || { zones: [], settings: {} }; }
  _areas() {
    const map = new Map();
    for (const z of this._irr.zones || []) {
      if (!z.entity) continue;
      const g = groupOf(z);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(z);
    }
    const order = Object.values(AREA_NAME);
    return [...map.entries()].map(([name, zones]) => ({ name, zones, kind: kindOf(name === AREA_NAME.beds ? "" : name) }))
      .sort((a, b) => ((order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99)) || a.name.localeCompare(b.name));
  }
  _running(zid) { const r = this._irr.run; return !!(r && r.zone === zid) || !!(this._irr.zones || []).find((z) => z.id === zid && z.on); }
  _progsFor(zid) { return (this._irr.settings?.programs || []).filter((p) => !(p.zones || []).length || p.zones.includes(zid)); }
  _nextFor(zids) {
    let best = null;
    const now = new Date();
    for (const p of this._irr.settings?.programs || []) {
      if (p.enabled === false) continue;
      if ((p.zones || []).length && !zids.some((z) => p.zones.includes(z))) continue;
      const [h, m] = String(p.start).split(":").map(Number);
      for (let off = 0; off < 8; off++) {
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, h, m);
        const wd = (t.getDay() + 6) % 7;
        if (t > now && (p.days || [0, 1, 2, 3, 4, 5, 6]).includes(wd)) { if (!best || t < best) best = t; break; }
      }
    }
    return best;
  }
  _when(t) {
    if (!t) return "";
    const d = new Date(t), now = new Date(), hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return day === 0 ? `today ${hm}` : day === 1 ? `tomorrow ${hm}` : day === -1 ? `yesterday ${hm}` : `${DAYS[(d.getDay() + 6) % 7]} ${hm}`;
  }
  _usage(zid) { return this._d?.water?.usage?.zones?.[zid] || null; }

  // ------------------------------------------------------------- render
  _render(soft) {
    const box = this.shadowRoot;
    if (!this._built) { box.innerHTML = `<style>${STYLE}</style><div class="bar"><button id="back" hidden>‹ Back</button><h3 id="ttl">Garden</h3></div><div class="view" id="view"></div>`; this._built = true; }
    const v = this._v, irr = this._irr;
    if (v.view === "zone" && !(irr.zones || []).find((z) => z.id === v.zone)) Object.assign(v, { view: "home", zone: null });
    if (v.view === "area" && !this._areas().find((a) => a.name === v.area)) Object.assign(v, { view: "home", area: null });
    box.getElementById("back").hidden = v.view === "home";
    const view = box.getElementById("view"), a = box.activeElement;
    // don't redraw a form while it's being typed in; just update the live parts
    if (soft !== "force" && a && a.closest && a.closest(".set")) { this._renderLive(); return; }
    if (v.view === "zone") {   // the valve page is only redrawn when its settings or litres change; the rest updates live
      const z = irr.zones.find((x) => x.id === v.zone), u = this._usage(v.zone);
      const key = JSON.stringify([v.zone, z.name, z.minutes, z.setpoint, z.group, z.available, this._progsFor(v.zone), irr.setpoint_ok, u && u.week, u && u.month]);
      if (soft !== "force" && this._zKey === key) { this._renderLive(); return; }
      this._zKey = key;
      return this._zone(view);
    }
    this._zKey = null;
    if (v.view === "home") this._home(view);
    else this._area(view);
  }

  _wxStrip() {
    const f = (this._daily || []).slice(0, 3);
    if (!f.length) return "";
    return `<div class="wx">${f.map((d, i) => { const t = new Date(d.datetime); return `<div><span>${i === 0 ? "Today" : DAYS[(t.getDay() + 6) % 7]}</span><b>${WX[d.condition] || ""} ${d.temperature !== undefined ? Math.round(d.temperature) + "°" : ""}</b><span>${d.precipitation !== undefined && d.precipitation !== null ? `${(+d.precipitation).toFixed(d.precipitation < 10 ? 1 : 0)} mm` : ""}</span></div>`; }).join("")}</div>`;
  }

  _home(view) {
    this.shadowRoot.getElementById("ttl").textContent = "Garden";
    const areas = this._areas(), irr = this._irr;
    if (!areas.length) { view.innerHTML = `<div class="empty">No valves yet – add them under <b>Classic</b> → Edit valves.</div>`; return; }
    const skip = irr.skip ? `<div class="pill warn">Watering skipped: ${esc(irr.skip)}</div>` : "";
    view.innerHTML = `${this._wxStrip()}${skip}
      <div class="lbl">Areas</div>
      <div class="areas">${areas.map((ar) => {
        const runZ = ar.zones.find((z) => this._running(z.id)), nxt = this._nextFor(ar.zones.map((z) => z.id));
        const today = ar.zones.reduce((s, z) => s + (this._usage(z.id)?.today || 0), 0);
        return `<button class="area" data-area="${esc(ar.name)}">${ART[ar.kind] || ART.beds}<div class="t"><b>${esc(ar.name)}</b>
          <span>${ar.zones.length} valve${ar.zones.length > 1 ? "s" : ""}${nxt ? ` · next ${this._when(nxt)}` : ""}</span>
          <span class="pill ${runZ ? "on" : ""}">${runZ ? `Watering ${esc(runZ.name)}` : today ? `${fmtL(today)} today` : "Nothing yet today"}</span></div></button>`;
      }).join("")}</div>`;
  }

  _area(view) {
    const ar = this._areas().find((x) => x.name === this._v.area);
    this.shadowRoot.getElementById("ttl").textContent = ar.name;
    view.innerHTML = `<div class="zones">${ar.zones.map((z) => {
      const on = this._running(z.id), u = this._usage(z.id);
      const sub = on ? "Watering now" : !z.available ? "valve offline" : `${z.last ? `last ${this._when(z.last)}` : "not watered yet"} · ${z.minutes} min${u ? ` · ${fmtL(u.today)} today` : ""}`;
      return `<button class="zone" data-zone="${esc(z.id)}"><div class="ico">${ICON[kindOf(groupOf(z) === AREA_NAME.beds ? z.name : groupOf(z))] || ICON.beds}</div><div class="t"><b>${esc(z.name)}</b><span>${sub}</span></div>${on ? `<span class="pill on">on</span>` : `<span class="go">›</span>`}</button>`;
    }).join("")}</div>`;
  }

  _zone(view) {
    const irr = this._irr, z = irr.zones.find((x) => x.id === this._v.zone), on = this._running(z.id);
    this.shadowRoot.getElementById("ttl").textContent = z.name;
    if (this._v.mins === null) this._v.mins = Math.round(z.minutes) || 10;
    const groups = [...new Set([...Object.values(AREA_NAME), ...(irr.zones || []).map(groupOf)])];
    const progs = this._progsFor(z.id);
    view.innerHTML = `
      <div class="cols"><div class="col">
        <div class="tiles" id="tiles"></div>
        <div class="chart" id="chart"></div>
      </div><div class="col">
        <div class="now">
          <div class="lbl" style="text-align:center">Water now</div>
          <div class="mins"><button class="round" data-d="-5" aria-label="5 minutes less">−</button><div><b id="mv">${this._v.mins}</b> min</div><button class="round" data-d="5" aria-label="5 minutes more">+</button></div>
          <div class="prog"><i id="pg" style="width:0%"></i></div>
          <div class="status" id="st"></div>
          <div class="go2"><button class="btn start" id="start">Start</button><button class="btn stop" id="stop">Stop</button></div>
        </div>
        <div class="lbl">Schedule</div>
        <div class="progs">${progs.length ? progs.map((p) => `<span class="chip ${p.enabled === false ? "off" : ""}">${esc(p.start)} · ${(p.days || []).length === 7 ? "every day" : (p.days || []).map((d) => DAYS[d]).join(" ")}${(p.zones || []).length ? "" : " · all valves"}</span>`).join("") : `<span class="note">Not in a watering program – add one under Classic.</span>`}</div>
        <div class="set">
          <label for="g-min">Minutes per run<input id="g-min" type="number" min="0" max="240" step="1" value="${z.minutes}"></label>
          <label for="g-sp">Pressure (bar)${irr.setpoint_ok ? "" : " – n/a"}<input id="g-sp" type="number" min="0.3" max="12" step="0.1" value="${z.setpoint ?? ""}" placeholder="normal" ${irr.setpoint_ok ? "" : "disabled"}></label>
          <label for="g-grp" style="grid-column:1/-1">Area<select id="g-grp">${groups.map((g) => `<option ${g === groupOf(z) ? "selected" : ""}>${esc(g)}</option>`).join("")}<option value="__new">New area…</option></select></label>
          <label for="g-new" id="g-newl" style="grid-column:1/-1" hidden>New area name<input id="g-new" type="text" maxlength="30" placeholder="e.g. Front garden"></label>
        </div>
        <div class="row"><span class="msg" id="smsg"></span><button class="save" id="save">Save</button></div>
      </div></div>`;
    this.shadowRoot.getElementById("g-grp").addEventListener("change", (e) => { this.shadowRoot.getElementById("g-newl").hidden = e.target.value !== "__new"; });
    this._renderTiles(); this._renderChart(z); this._renderLive();
  }

  _renderTiles() {
    const box = this.shadowRoot.getElementById("tiles"); if (!box || !this._hass) return;
    const z = this._irr.zones.find((x) => x.id === this._v.zone); if (!z) return;
    const wa = this._hass.states[this._d.weather]?.attributes || {}, ws = windState(this._hass, this._d.wind || {});
    const tu = wa.temperature_unit || "°C", t = num(wa.temperature), h = num(wa.humidity);
    const wind = ws && ws.kmh !== null ? `${Math.round(ws.kmh)} km/h${ws.deg !== null ? " " + compass(ws.deg) : ""}` : num(wa.wind_speed) !== null ? `${Math.round(wa.wind_speed * ({ "m/s": 3.6, mph: 1.609, kn: 1.852 }[wa.wind_speed_unit] || 1))} km/h${num(wa.wind_bearing) !== null ? " " + compass(num(wa.wind_bearing)) : ""}` : "–";
    const rain = this._daily && this._daily[0] && this._daily[0].precipitation !== undefined ? `${(+this._daily[0].precipitation).toFixed(1)} mm` : "–";
    const u = this._usage(z.id), on = this._running(z.id);
    const tile = (ic, k, v, cls = "") => `<div class="tile ${cls}">${ic}<div style="min-width:0"><div class="k">${k}</div><div class="v">${v}</div></div></div>`;
    box.innerHTML = tile(TI.temp, "Air", t === null ? "–" : `${t.toFixed(1)} ${tu}`) + tile(TI.hum, "Humidity", h === null ? "–" : `${Math.round(h)} %`)
      + tile(TI.wind, "Wind", wind) + tile(TI.rain, "Rain today", rain)
      + tile(TI.last, "Last watered", on ? "now" : z.last ? this._when(z.last) : "–", "w") + tile(TI.used, "Water today", u ? fmtL(u.today) : "–", "w");
  }

  _renderChart(z) {
    const box = this.shadowRoot.getElementById("chart"); if (!box) return;
    const u = this._usage(z.id);
    if (!u || !u.week) { box.innerHTML = `<div class="lbl" style="padding:2px 4px 6px">Water · last 7 days</div><div class="note" style="padding:4px 4px 10px">Switch on <b>Count the water</b> (Water use card, installer) to see the litres per valve.</div>`; return; }
    const wk = u.week, max = Math.max(...wk, 1), W = 400, x = (i) => 34 + i * ((W - 48) / 6), y = (v) => 118 - (v / max) * 96;
    const pts = wk.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const today = new Date(), lab = (i) => { const d = new Date(today); d.setDate(d.getDate() - (6 - i)); return i === 6 ? "Today" : DAYS[(d.getDay() + 6) % 7]; };
    const nice = max >= 1000 ? (v) => `${(v / 1000).toFixed(1)}k` : (v) => `${Math.round(v)}`;
    box.innerHTML = `<div class="lbl" style="padding:2px 4px 6px">Water · last 7 days (L) · this month ${fmtL(u.month)}</div>
      <svg viewBox="0 0 ${W} 150" role="img" aria-label="Litres per day for the last 7 days, today ${Math.round(wk[6])} litres">
        ${[0, 0.5, 1].map((f) => `<line x1="30" x2="${W - 8}" y1="${118 - f * 96}" y2="${118 - f * 96}" stroke="var(--g-line)"/><text x="0" y="${122 - f * 96}">${nice(max * f)}</text>`).join("")}
        <polygon points="${x(0)},118 ${pts} ${x(6)},118" fill="var(--g-water)" opacity=".18"/>
        <polyline points="${pts}" fill="none" stroke="var(--g-water)" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="${x(6)}" cy="${y(wk[6])}" r="4.5" fill="var(--g-water)"/>
        ${wk.map((_, i) => `<text x="${x(i)}" y="140" text-anchor="middle">${lab(i)}</text>`).join("")}
      </svg>`;
  }

  _renderLive() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    if (this._v.view !== "zone" || !$("st")) return;
    const irr = this._irr, z = irr.zones.find((x) => x.id === this._v.zone), on = this._running(z.id), r = irr.run;
    const mine = r && r.zone === z.id;
    $("start").disabled = on || !z.available; $("stop").disabled = !on && !r;
    $("stop").textContent = on ? "Stop" : r ? "Stop all" : "Stop";
    const pct = mine && r.secs && r.remaining !== null ? Math.min(100, (1 - r.remaining / r.secs) * 100) : 0;
    $("pg").style.width = `${pct}%`;
    const left = mine && r.remaining !== null ? `${Math.floor(r.remaining / 60)}:${String(r.remaining % 60).padStart(2, "0")} left` : "";
    $("st").textContent = !z.available ? "The valve switch is offline" : on ? `Watering${left ? ` · ${left}` : ""}`
      : r ? `${r.name || "Another valve"} is watering – Start here stops it` : "";
    this._renderTiles();
  }

  // ------------------------------------------------------------- actions
  async _click(e) {
    const b = e.target.closest("button"); if (!b) return;
    const v = this._v, $ = (id) => this.shadowRoot.getElementById(id);
    if (b.id === "back") { if (v.view === "zone") { v.view = "area"; v.area = groupOf(this._irr.zones.find((z) => z.id === v.zone) || {}); } else v.view = "home"; v.mins = null; return this._render("force"); }
    if (b.dataset.area) { Object.assign(v, { view: "area", area: b.dataset.area }); return this._render("force"); }
    if (b.dataset.zone) { Object.assign(v, { view: "zone", zone: b.dataset.zone, mins: null }); return this._render("force"); }
    if (b.dataset.d) { v.mins = Math.max(1, Math.min(240, (v.mins || 10) + Number(b.dataset.d))); $("mv").textContent = v.mins; return; }
    const ws = async (msg, el) => {
      try { const r = await this._hass.callWS(msg); this.dispatchEvent(new CustomEvent("irr-changed", { detail: r, bubbles: true, composed: true })); return r; }
      catch (err) { if (el) { el.textContent = err.message || "Failed"; el.className = "msg err"; } else $("st").textContent = err.message || "Failed"; return null; }
    };
    if (b.id === "start") { b.disabled = true; await ws({ type: `${DOMAIN}/irrigation_action`, action: "run_zone", zone: v.zone, minutes: v.mins }); return; }
    if (b.id === "stop") { b.disabled = true; await ws({ type: `${DOMAIN}/irrigation_action`, action: "stop" }); return; }
    if (b.id === "save") {
      const m = $("smsg"), grpSel = $("g-grp").value, grp = grpSel === "__new" ? $("g-new").value.trim() : grpSel;
      if (grpSel === "__new" && !grp) { m.textContent = "Give the new area a name"; m.className = "msg err"; return; }
      const zones = this._irr.zones.map((z) => {
        const base = { id: z.id, name: z.name, entity: z.entity, minutes: z.minutes, enabled: z.enabled, setpoint: z.setpoint, group: z.group || "" };
        if (z.id !== v.zone) return base;
        const auto = AREA_NAME[kindOf(z.name || "")];
        return { ...base, minutes: Number($("g-min").value || 0), setpoint: $("g-sp").disabled ? z.setpoint : ($("g-sp").value === "" ? null : Number($("g-sp").value)), group: grp === auto ? "" : grp };
      });
      const r = await ws({ type: `${DOMAIN}/irrigation_settings`, settings: { zones } }, m);
      if (r) { m.textContent = "Saved"; m.className = "msg ok"; $("save").blur(); }
    }
  }
}
if (!customElements.get("hamlet-home-garden")) customElements.define("hamlet-home-garden", HamletHomeGarden);
