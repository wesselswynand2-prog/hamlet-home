/* Hamlet Home – sidebar app. Tabs: Energy, Geyser (when Hamlet Geyser is installed). No build step. */
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const fmtW = (w, signed = false) => {
  w = num(w); if (w === null) return "–";
  const a = Math.abs(w), v = signed ? w : a;
  return a >= 1000 ? `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)} kW` : `${Math.round(v)} W`;
};
const fmtKwh = (v, d = 1) => (num(v) === null ? "–" : `${Number(v).toFixed(d)} kWh`);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtDur = (h) => {
  if (num(h) === null) return "–";
  const m = Math.round(h * 60);
  if (m < 60) return `${Math.max(m, 1)} min`;
  if (h >= 48) return `${(h / 24).toFixed(1)} days`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const clockIn = (h) => {
  const d = new Date(Date.now() + h * 3600e3), now = new Date();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return t;
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  return d.toDateString() === tom.toDateString() ? `${t} tomorrow` : `${d.toLocaleDateString([], { weekday: "short" })} ${t}`;
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STYLE = `
:host { display: block; min-height: 100%; background: var(--primary-background-color); color: var(--primary-text-color);
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif);
  --radius: var(--ha-card-border-radius, 12px); --card: var(--ha-card-background, var(--card-background-color, #fff));
  --muted: var(--secondary-text-color, #6b6b6b); --line: var(--divider-color, rgba(127,127,127,.2)); --accent: var(--primary-color, #03a9f4);
  --c-solar: #eda100; --c-load: #2a78d6; --c-grid: #e87ba4; --c-batt: #008300;
  --c-ok: var(--success-color, #2e9e4f); --c-warn: var(--warning-color, #e08a00); --c-bad: var(--error-color, #db4437); }
:host([dark]) { --c-solar: #c98500; --c-load: #3987e5; --c-grid: #d55181; --c-batt: #008300; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.toolbar { display: flex; align-items: center; gap: 8px; height: var(--header-height, 56px); padding: 0 12px;
  background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff);
  border-bottom: var(--app-header-border-bottom, none); position: sticky; top: 0; z-index: 3; }
.toolbar .title { font-size: 20px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; gap: 2px; height: 100%; }
.tabs button { background: transparent; border: 0; color: inherit; opacity: .72; padding: 0 14px; font: inherit; font-size: 15px; cursor: pointer;
  border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 6px; }
.tabs button ha-icon { --mdc-icon-size: 20px; }
.tabs button[aria-selected="true"] { opacity: 1; border-bottom-color: currentColor; }
@media (max-width: 560px) { .tabs button span { display: none; } .tabs button { padding: 0 12px; } }
main { max-width: 1280px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; grid-template-columns: repeat(12, minmax(0, 1fr)); }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; min-width: 0; grid-column: span 12; }
@media (min-width: 980px) { .s7 { grid-column: span 7; } .s5 { grid-column: span 5; } .s8 { grid-column: span 8; } .s4 { grid-column: span 4; } .s6 { grid-column: span 6; } }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { font: inherit; font-size: 13px; padding: 4px 12px; border: 0; background: transparent; color: var(--primary-text-color); cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--text-primary-color, #fff); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.note { font-size: 13px; color: var(--muted); padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--c-warn) 10%, transparent); }
.loading { padding: 64px; text-align: center; color: var(--muted); grid-column: 1 / -1; }

/* power flow */
.flow { position: relative; width: 100%; max-width: 560px; margin: 0 auto; }
.flow svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.flow .wire { fill: none; stroke: var(--line); stroke-width: 2; }
.flow .dash { fill: none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 2 10; opacity: 0; }
.flow .dash.on { opacity: 1; animation: run var(--dur, 2s) linear infinite; }
.flow .dash.rev { animation-direction: reverse; }
@keyframes run { to { stroke-dashoffset: -24; } }
@media (prefers-reduced-motion: reduce) { .flow .dash.on { animation: none; stroke-dasharray: none; opacity: .7; } }
.node { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; border-radius: 50%; border: 2px solid var(--nc, var(--line)); background: var(--card); line-height: 1.15; }
.node ha-icon { --mdc-icon-size: 22px; color: var(--nc); }
.node .v { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.node .s { font-size: 11px; color: var(--muted); white-space: nowrap; }
.node.big { width: 26%; aspect-ratio: 1; } .node.big .v { font-size: 18px; } .node.big ha-icon { --mdc-icon-size: 26px; }
.node.mid { width: 21%; aspect-ratio: 1; }
.node.xs { width: 13%; aspect-ratio: 1; border-style: dashed; } .node.xs .v { font-size: 12px; } .node.xs ha-icon { --mdc-icon-size: 16px; } .node.xs .s { font-size: 10px; }
.node.sm { width: 15%; aspect-ratio: 1; } .node.sm .v { font-size: 12px; } .node.sm ha-icon { --mdc-icon-size: 16px; }
.lab { position: absolute; transform: translate(-50%, 0); font-size: 12px; color: var(--muted); white-space: nowrap; max-width: 30%; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 480px) { .node.xs .s { display: none; } .node.xs .v { font-size: 10px; } .node.xs ha-icon { --mdc-icon-size: 13px; } .node.mid .s { font-size: 9px; } .node .v { font-size: 13px; } .node.big .v { font-size: 15px; } .node .s { font-size: 10px; } .node.sm .v { font-size: 10px; } }

/* today */
.money { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.money > div { border-radius: 10px; min-width: 0; padding: 12px; border: 1px solid var(--line); }
.money .k { font-size: 13px; color: var(--muted); }
.money .v { font-size: clamp(20px, 6vw, 28px); white-space: nowrap; font-weight: 400; font-variant-numeric: tabular-nums; margin-top: 2px; }
.money .s { font-size: 12px; color: var(--muted); }
.money .k ha-icon { --mdc-icon-size: 16px; vertical-align: -3px; margin-right: 4px; color: var(--c-batt); }
.money > div.off { border-color: var(--c-bad); }
.money > div.off .k, .money > div.off .k ha-icon { color: var(--c-bad); }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 18px; }
@media (max-width: 520px) { .stats { grid-template-columns: 1fr; } }
.stat { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; min-width: 0; }
.stat ha-icon { --mdc-icon-size: 18px; color: var(--ic, var(--muted)); flex: none; }
.stat .l { color: var(--muted); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat .v { font-variant-numeric: tabular-nums; white-space: nowrap; }
.src { margin-top: 14px; }
.src .bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; gap: 2px; background: var(--line); }
.src .bar i { display: block; height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--muted); margin-top: 8px; }
.key { display: inline-flex; align-items: center; gap: 6px; }
.key i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.key i.dashed { height: 0; width: 14px; border-top: 2px dashed var(--c-batt); border-radius: 0; }

/* charts */
.chartwrap { position: relative; }
.chartwrap svg { display: block; width: 100%; touch-action: pan-y; }
.axis text { fill: var(--muted); font-size: 11px; }
.grid line { stroke: var(--line); }
.tip { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); white-space: nowrap; display: none; z-index: 2; top: 6px; }
.tip b { font-weight: 500; }
.tip .row { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.tip .row span:last-child { font-variant-numeric: tabular-nums; margin-left: 14px; }
.empty { padding: 40px 0; text-align: center; color: var(--muted); font-size: 14px; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 12px; }
.totals > div { border-top: 1px solid var(--line); padding-top: 8px; }
.totals .v { font-size: 20px; font-variant-numeric: tabular-nums; }

/* forms */
.field { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.field .hint { display: block; font-size: 12px; color: var(--muted); }
.field .ctl { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
input[type=number] { font: inherit; font-size: 14px; width: 90px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); }
.actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.msg { font-size: 13px; } .msg.err { color: var(--c-bad); } .msg.ok { color: var(--c-ok); }
details summary { cursor: pointer; font-size: 14px; color: var(--muted); }
.raw { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; font-size: 13px; margin-top: 8px; }
.raw span:nth-child(even) { text-align: right; font-variant-numeric: tabular-nums; }
/* solar priority */
.prow { display: grid; grid-template-columns: 28px 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.prow:last-of-type { border-bottom: 0; }
.prow .rank { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 500;
  background: color-mix(in srgb, var(--c-solar) 18%, transparent); }
.prow ha-icon { --mdc-icon-size: 26px; color: var(--muted); }
.prow .n { font-size: 15px; } .prow .w { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prow .mv { display: flex; gap: 2px; }
.prow .mv button { font: inherit; width: 34px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 15px; }
.prow .mv button:disabled { opacity: .3; cursor: default; }
.prow.off .n, .prow.off ha-icon { opacity: .55; }
.dotx { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--bc, var(--muted)); }
/* irrigation */
.irrstat { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.irrstat .grow { flex: 1; min-width: 160px; }
.irrstat .big { font-size: 18px; } .irrstat .small { font-size: 13px; color: var(--muted); }
.prog { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; margin-top: 6px; }
.prog i { display: block; height: 100%; background: var(--c-load); border-radius: 3px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.zgrid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0 12px; align-items: center; }
.zrow { display: contents; }
.zgrid input[type=number] { width: 70px; }
.zrow > * { padding: 9px 0; border-bottom: 1px solid var(--line); }
.zname { display: flex; align-items: center; gap: 10px; min-width: 0; }
.zname .t { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zname .z2 { font-size: 12px; color: var(--muted); }
.zdot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); flex: none; }
.zdot.on { background: var(--c-load); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-load) 25%, transparent); animation: pulse 1.6s infinite; }
.zdot.na { background: var(--c-warn); }
.zedit { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(160px, 1.4fr) auto auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
@media (max-width: 640px) { .zedit { grid-template-columns: 1fr 1fr; } }
.zedit select, .irrform select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); max-width: 100%; }
.zedit input[type=text] { width: 100%; }
.sub2 { font-size: 14px; font-weight: 500; margin: 18px 0 4px; display: flex; align-items: center; gap: 8px; }
.sub2 .r { margin-left: auto; font-weight: 400; }
.pchip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; }
.pchip[aria-pressed="true"] { border-color: var(--c-load); color: var(--primary-text-color); background: color-mix(in srgb, var(--c-load) 14%, transparent); }
.logl { font-size: 13px; color: var(--muted); display: grid; grid-template-columns: auto 1fr auto; gap: 2px 12px; }
/* water */
.alarm { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; border-color: var(--c-bad); background: color-mix(in srgb, var(--c-bad) 10%, var(--card)); }
.alarm ha-icon { --mdc-icon-size: 32px; color: var(--c-bad); }
.alarm .t { font-weight: 500; font-size: 16px; } .alarm .d { font-size: 13px; color: var(--muted); }
.alarm .btn { margin-left: auto; }
.pgrid { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 18px; align-items: center; }
@media (max-width: 560px) { .pgrid { grid-template-columns: 1fr; justify-items: center; } }
.pg { position: relative; width: 210px; }
.pg svg { display: block; width: 100%; height: auto; }
.pg .c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 10px; }
.pg .big { font-size: 38px; font-weight: 300; line-height: 1; font-variant-numeric: tabular-nums; }
.pg .big small { font-size: 15px; }
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 500;
  background: color-mix(in srgb, var(--bc, var(--muted)) 16%, transparent); white-space: nowrap; }
.badge .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bc, var(--muted)); }
.badge.pulse .dot { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .3; } }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; margin-top: 10px; }
.tile { border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; min-width: 0; }
.tile .k { font-size: 12px; color: var(--muted); } .tile .v { font-size: 20px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.modes3 { display: inline-grid; grid-template-columns: repeat(4, auto); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.modes3 button { font: inherit; font-size: 14px; padding: 8px 18px; border: 0; background: transparent; color: var(--primary-text-color); cursor: pointer; }
.modes3 button[aria-pressed="true"] { background: var(--accent); color: var(--text-primary-color, #fff); }
.btn.big { padding: 10px 18px; display: inline-flex; align-items: center; gap: 8px; }
.btn.danger { border-color: var(--c-bad); color: var(--c-bad); }
.sched { display: grid; grid-template-columns: auto 1fr auto; gap: 8px 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.sched .days { grid-column: 2 / -1; display: flex; gap: 4px; flex-wrap: wrap; }
.days button { font: inherit; font-size: 12px; width: 34px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; }
.days button[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 16%, transparent); border-color: var(--accent); color: var(--primary-text-color); }
input[type=time], input[type=text] { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); color-scheme: inherit; }
input[type=text] { width: 220px; max-width: 100%; }
.switch { position: relative; width: 40px; height: 22px; flex: none; display: inline-block; }
.switch input { opacity: 0; width: 100%; height: 100%; margin: 0; position: absolute; cursor: pointer; z-index: 1; }
.switch span { position: absolute; inset: 0; border-radius: 11px; background: var(--line); transition: .15s; }
.switch span::after { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; border-radius: 50%; background: #fff; transition: .15s; }
.switch input:checked + span { background: var(--accent); }
.switch input:checked + span::after { transform: translateX(18px); }
.iconbtn { background: transparent; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
.cols2 { display: grid; gap: 0 32px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .cols2 { grid-template-columns: 1fr 1fr; } }
.geysers { grid-column: 1 / -1; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); align-items: start; }
`;

class HamletHomePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "energy";
    this._day = "today";
    this._range = 7;
    try { this._tab = localStorage.getItem("hamlet_home_tab") || "energy"; } catch (e) { /* storage blocked */ }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this.toggleAttribute("dark", !!hass.themes?.darkMode);
    if (this._menu) this._menu.hass = hass;
    this.shadowRoot.querySelectorAll("hamlet-geyser-card, hamlet-geyser-panel").forEach((c) => { c.hass = hass; });
    if (first) this._init();
  }
  set narrow(v) { this._narrow = v; if (this._menu) this._menu.narrow = v; }
  set panel(v) { this._panel = v; }
  set route(v) { this._route = v; }

  connectedCallback() {
    if (this._hass && !this._unsub && this._built) this._subscribe();
    this._refresh = setInterval(() => this._load(), 5 * 60 * 1000);
  }
  disconnectedCallback() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    clearInterval(this._refresh);
    this._ro?.disconnect();
  }

  /* ------------------------------------------------------------- shell */
  async _init() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${STYLE}</style>
      <div class="toolbar"><span id="menu"></span><div class="title">Hamlet Home</div><div class="tabs" role="tablist" id="tabs"></div></div>
      <main id="main"><div class="loading">Loading…</div></main>`;
    const mb = document.createElement("ha-menu-button");
    mb.hass = this._hass; mb.narrow = this._narrow;
    root.getElementById("menu").appendChild(mb);
    this._menu = mb;
    this._main = root.getElementById("main");
    root.getElementById("tabs").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tab]"); if (!b) return;
      this._tab = b.dataset.tab;
      try { localStorage.setItem("hamlet_home_tab", this._tab); } catch (e) { /* ignore */ }
      this._buildTab();
    });
    this._main.addEventListener("click", (ev) => this._click(ev));
    await this._load();
    this._subscribe();
  }

  async _load() {
    try {
      const s = await this._hass.callWS({ type: `${DOMAIN}/state` });
      this._isAdmin = s.is_admin;
      this._geyser = s.geyser_available || s.geyser_installed;
      this._geyserCount = s.geyser_count ?? (s.geyser_installed ? 1 : 0);
      this._rows = s.rows; this._days = s.days; this._raw = s.raw;
      this._water = s.water; this._waterRows = s.water?.rows; this._solar = s.solar_loads; this._irr = s.irrigation;
      if (!this._built) { this._renderTabs(); this._buildTab(); }
      this._apply(s);
      this._renderChart(); this._renderHistory(); this._renderRaw(); this._renderPressure();
    } catch (e) {
      this._main.innerHTML = `<div class="card loading">${esc(e.code === "not_found" || e.code === "unknown_command"
        ? "Hamlet Home isn't set up yet. Go to Settings → Devices & services → Add integration → Hamlet Home."
        : e.message || e)}</div>`;
    }
  }

  async _subscribe() {
    if (this._unsub) return;
    try { this._unsub = await this._hass.connection.subscribeMessage((s) => this._apply(s), { type: `${DOMAIN}/subscribe` }); }
    catch (e) { /* not set up */ }
  }

  _renderTabs() {
    const tabs = [["energy", "mdi:lightning-bolt", "Energy"]];
    if (this._water || this._irr?.zones?.length || this._isAdmin) tabs.push(["water", "mdi:water-pump", "Water"]);
    if (this._geyser) tabs.push(["geyser", "mdi:water-boiler", "Geyser"]);
    if (!tabs.some((t) => t[0] === this._tab)) this._tab = "energy";
    this.shadowRoot.getElementById("tabs").innerHTML = tabs.length < 2 ? "" : tabs.map(([id, icon, label]) =>
      `<button role="tab" data-tab="${id}" aria-selected="${this._tab === id}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("");
  }

  _buildTab() {
    this._built = true;
    this._ro?.disconnect();
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === this._tab));
    if (this._tab === "geyser") return this._buildGeyser();
    if (this._tab === "water") return this._buildWater();
    this._main.innerHTML = `
      <div class="card note" id="note" hidden style="grid-column:1/-1"></div>
      <section class="card s7"><h2>Power flow <span class="sub" id="flowsub"></span></h2><div id="flow"></div></section>
      <section class="card s5"><h2>Today <span class="sub" id="todaysub"></span></h2><div id="batt"></div><div id="today"></div><div id="battset"></div></section>
      <section class="card" id="prio" hidden><h2>Solar priority <span class="sub" id="priosub"></span></h2><div id="priobody"></div></section>
      <section class="card">
        <h2>Power <span class="sub"><span class="seg" id="dayseg"><button data-day="today" aria-pressed="${this._day === "today"}">Today</button><button data-day="yesterday" aria-pressed="${this._day === "yesterday"}">Yesterday</button></span></span></h2>
        <div class="legend" style="margin:0 0 6px"><span class="key"><i style="background:var(--c-solar)"></i>Solar</span><span class="key"><i style="background:var(--c-load)"></i>House</span>
          <span class="key"><i style="background:var(--c-grid)"></i>Grid (+ buying, − selling)</span><span class="key"><i class="dashed"></i>Battery (+ charging)</span></div>
        <div class="chartwrap" id="chart"></div>
        <div class="chartwrap" id="soc"></div>
      </section>
      <section class="card s8"><h2>History <span class="sub"><span class="seg" id="rangeseg"><button data-range="7" aria-pressed="${this._range === 7}">7 days</button><button data-range="30" aria-pressed="${this._range === 30}">30 days</button></span></span></h2>
        <div class="legend" style="margin:0 0 6px"><span class="key"><i style="background:var(--c-solar)"></i>Solar produced</span><span class="key"><i style="background:var(--c-load)"></i>House used</span><span class="key"><i style="background:var(--c-grid)"></i>Bought from grid</span><span style="margin-left:auto">kWh per day</span></div>
        <div class="chartwrap" id="hist"></div><div class="totals" id="histtot"></div></section>
      <section class="card s4"><h2>Electricity price</h2><div id="tariff"></div></section>
      <section class="card" id="installer" hidden><details><summary>Installer: live sensor check</summary><div class="raw" id="raw"></div>
        <p class="muted small">Battery should be + while charging and grid + while buying. Change sensors or flip signs in Settings → Devices &amp; services → Hamlet Home → Configure.</p></details></section>`;
    this._flowBuilt = null;
    this._tariffShown = null;
    this._battShown = null;
    this._ro = new ResizeObserver(() => { this._renderChart(); this._renderHistory(); });
    this._ro.observe(this.shadowRoot.getElementById("chart"));
    if (this._snap) { this._apply(this._snap); this._renderChart(); this._renderHistory(); this._renderRaw(); }
  }

  async _buildGeyser() {
    // Full geyser page inside this tab (same page as the Geyser sidebar item), or a setup prompt.
    this._main.innerHTML = `<div class="loading" id="gload">Loading geyser…</div>`;
    if (!this._geyserCount) {
      this._main.innerHTML = `<section class="card" style="grid-column:1/-1;text-align:center;padding:40px 16px">
        <ha-icon icon="mdi:water-boiler" style="--mdc-icon-size:48px;color:var(--muted)"></ha-icon>
        <h2 style="justify-content:center;margin:12px 0 6px">No geyser set up yet</h2>
        <p class="muted small" style="margin:0 0 16px">Timers, solar and battery control, temperature and the solar collector – the same way the pump is set up.</p>
        ${this._isAdmin ? `<a class="btn primary" style="text-decoration:none;display:inline-block" href="/config/integrations/dashboard/add?domain=hamlet_geyser">Set up geyser</a>`
          : `<p class="muted small">Ask your installer to set it up.</p>`}</section>`;
      return;
    }
    if (!customElements.get("hamlet-geyser-panel")) {
      try { await import("/hamlet_geyser_static/hamlet-geyser-panel.js"); }
      catch (e) {
        this._main.innerHTML = `<div class="card loading">The geyser page couldn't load – restart Home Assistant after updating, then refresh.</div>`;
        return;
      }
    }
    if (this._tab !== "geyser") return;
    const holder = document.createElement("div");
    holder.style.cssText = "grid-column:1/-1;margin:-16px -16px 0";
    const panel = document.createElement("hamlet-geyser-panel");
    panel.setAttribute("embedded", "");
    panel.narrow = this._narrow;
    holder.appendChild(panel);
    this._main.innerHTML = "";
    this._main.appendChild(holder);
    panel.hass = this._hass;
    if (this._isAdmin) {
      const add = document.createElement("div");
      add.style.cssText = "grid-column:1/-1;text-align:right;margin-top:-8px";
      add.innerHTML = `<a class="muted small" href="/config/integrations/dashboard/add?domain=hamlet_geyser" style="color:var(--accent);text-decoration:none">+ Add another geyser</a>`;
      this._main.appendChild(add);
    }
  }

  _setHTML(el, html) { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } }

  async _click(ev) {
    const d = ev.target.closest("[data-day]");
    if (d) {
      this._day = d.dataset.day;
      this.shadowRoot.querySelectorAll("[data-day]").forEach((b) => b.setAttribute("aria-pressed", b === d));
      return this._renderChart();
    }
    const r = ev.target.closest("[data-range]");
    if (r) {
      this._range = Number(r.dataset.range);
      this.shadowRoot.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", b === r));
      return this._renderHistory();
    }
    if (ev.target.closest("#savetariff")) return this._saveTariff();
    if (ev.target.closest("#savebatt")) return this._saveBattery();
    const pr = ev.target.closest("[data-prio]");
    if (pr) return this._prioClick(pr);
    return this._waterClick(ev);
  }

  /* ------------------------------------------------------------- apply */
  _apply(s) {
    this._snap = s;
    if (s.water !== undefined) this._water = s.water;
    if (s.solar_loads !== undefined) this._solar = s.solar_loads;
    if (s.irrigation !== undefined) this._irr = s.irrigation;
    if (this._tab === "water") return this._renderWater();
    if (this._tab !== "energy" || !this.shadowRoot.getElementById("flow")) return;
    const note = this.shadowRoot.getElementById("note");
    if (!s.ready) { note.hidden = false; note.textContent = "Reading today's history from Home Assistant… this takes a few seconds after a restart."; }
    else if (s.note && this._isAdmin) { note.hidden = false; note.textContent = s.note; }
    else note.hidden = true;
    this._renderFlow();
    this._renderBattery();
    this._renderToday();
    this._renderTariff();
    this._renderPrio();
    const inst = this.shadowRoot.getElementById("installer");
    if (inst) inst.hidden = !this._isAdmin;
    if (inst && inst.querySelector("details").open) this._renderRaw();
  }

  /* -------------------------------------------------------- power flow */
  _renderFlow() {
    const s = this._snap, L = s.live || {}, f = s.features || {}, extras = (s.extras || []).slice(0, 4);
    const box = this.shadowRoot.getElementById("flow"); if (!box) return;
    const split = !!(f.pv_ac || f.pv_dc);
    const hasGrid = !!(f.grid || f.grid_status);
    const shape = `${split}|${f.pv_ac}|${f.pv_dc}|${f.battery}|${hasGrid}|${extras.length}`;
    // Layouts in a 400-wide box. Split: grid-tie PV into the roof, MPPTs on the DC bus between battery and inverter.
    const H = split ? 390 : 320;
    const home = split ? [200, 158] : [200, 160];
    const P = split
      ? { pvac: [200, 44], grid: [58, 158], home, bus: [200, 265], pvdc: [58, 265], batt: [200, 343] }
      : { solar: [200, 48], grid: [62, 160], home, batt: [200, 272] };
    const exTop = split ? 82 : 70, exSpan = split ? 170 : 180;
    const ex = extras.map((_, i, a) => [340, a.length === 1 ? home[1] : exTop + i * (exSpan / Math.max(a.length - 1, 1))]);
    const showBus = split && (f.battery || f.pv_dc);
    if (this._flowBuilt !== shape) {
      const wire = (id, d) => `<path class="wire" d="${d}"/><path class="dash" id="${id}" d="${d}"/>`;
      const line = ([x1, y1], [x2, y2]) => `M${x1} ${y1} L${x2} ${y2}`;
      const curve = ([x1, y1], [x2, y2]) => `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
      const pct = ([x, y]) => `left:${(x / 400) * 100}%;top:${(y / H) * 100}%`;
      const node = (id, size, pos, color, icon, sub = "", extra = "") =>
        `<div class="node ${size}" id="${id}" style="${pct(pos)};--nc:${color}">${extra}<ha-icon icon="${icon}"></ha-icon><span class="v"></span>${sub !== null ? `<span class="s">${sub}</span>` : ""}</div>`;
      const ring = `<svg viewBox="0 0 100 100" style="position:absolute;inset:-5px;width:calc(100% + 10px);height:calc(100% + 10px);transform:rotate(-90deg)"><circle cx="50" cy="50" r="47" fill="none" stroke="var(--c-batt)" stroke-width="5" pathLength="100" id="socring" stroke-linecap="round"/></svg>`;
      let svg = "", nodes = "";
      if (split) {
        if (f.pv_ac) { svg += wire("w-pvac", line(P.pvac, P.home)); nodes += node("n-pvac", "mid", P.pvac, "var(--c-solar)", "mdi:solar-panel-large", "grid-tie PV"); }
        if (showBus) {
          svg += wire("w-inv", line(P.bus, P.home));
          if (f.pv_dc) { svg += wire("w-pvdc", line(P.pvdc, P.bus)); nodes += node("n-pvdc", "mid", P.pvdc, "var(--c-solar)", "mdi:solar-power-variant", "MPPT PV"); }
          if (f.battery) { svg += wire("w-batt", line(P.batt, P.bus)); nodes += node("n-batt", "mid", P.batt, "var(--c-batt)", "mdi:battery-high", "", ring); }
          nodes += node("n-bus", "xs", P.bus, "var(--muted)", "mdi:sine-wave", "inverter");
        }
      } else {
        svg += wire("w-solar", line(P.solar, P.home));
        nodes += node("n-solar", "mid", P.solar, "var(--c-solar)", "mdi:solar-power-variant", "solar");
        if (f.battery) { svg += wire("w-batt", line(P.batt, P.home)); nodes += node("n-batt", "mid", P.batt, "var(--c-batt)", "mdi:battery-high", "", ring); }
      }
      if (hasGrid) { svg += wire("w-grid", line(P.grid, P.home)); nodes += node("n-grid", "mid", P.grid, "var(--c-grid)", "mdi:transmission-tower"); }
      ex.forEach((p, i) => {
        svg += wire(`w-ex${i}`, curve(P.home, p));
        nodes += node(`n-ex${i}`, "sm", p, "var(--muted)", "mdi:flash", null)
          + `<div class="lab" style="left:${(p[0] / 400) * 100}%;top:calc(${(p[1] / H) * 100}% + ${(10.5 * 320 / H).toFixed(1)}%)">${esc(extras[i].name)}</div>`;
      });
      nodes += node("n-home", "big", P.home, "var(--c-load)", "mdi:home", "house");
      box.innerHTML = `<div class="flow" style="aspect-ratio:400 / ${H}" role="img" aria-label="Power flow"><svg viewBox="0 0 400 ${H}" preserveAspectRatio="none">${svg}</svg>${nodes}</div>`;
      this._flowBuilt = shape;
    }
    const $ = (id) => box.querySelector("#" + id);
    const setNode = (id, v, sub) => { const n = $(id); if (!n) return; n.querySelector(".v").textContent = v; const ss = n.querySelector(".s"); if (ss && sub !== undefined) ss.textContent = sub; };
    // forward = dots move from the start of the drawn path to its end (every path is drawn toward the house / the DC bus)
    const dash = (id, watts, color, forward) => {
      const el = $(id); if (!el) return;
      const w = Math.abs(num(watts) || 0);
      const on = w >= 20;
      el.classList.toggle("on", on);
      el.style.stroke = color;
      el.classList.toggle("rev", on && !forward);
      el.style.setProperty("--dur", `${Math.max(0.5, 2.6 - Math.log10(w + 1) * 0.55).toFixed(2)}s`);
    };
    const solar = num(L.solar), load = num(L.load), grid = num(L.grid), batt = num(L.battery), soc = num(L.soc);
    setNode("n-home", fmtW(load));
    if (split) {
      setNode("n-pvac", fmtW(L.solar_ac));
      dash("w-pvac", L.solar_ac, "var(--c-solar)", true);
      setNode("n-pvdc", fmtW(L.solar_dc));
      dash("w-pvdc", L.solar_dc, "var(--c-solar)", true);
      const inv = num(L.inverter);
      setNode("n-bus", fmtW(inv), inv === null ? "inverter" : Math.abs(inv) < 20 ? "inverter idle" : inv > 0 ? "inverting" : "charging");
      dash("w-inv", inv, inv !== null && inv < 0 ? "var(--c-load)" : "var(--c-batt)", (inv || 0) > 0);
    } else {
      setNode("n-solar", fmtW(solar), "solar");
      dash("w-solar", solar, "var(--c-solar)", true);
    }
    if ($("n-grid")) {
      const down = L.grid_available === false;
      const n = $("n-grid");
      n.style.setProperty("--nc", down ? "var(--c-warn)" : "var(--c-grid)");
      n.querySelector("ha-icon").setAttribute("icon", down ? "mdi:transmission-tower-off" : "mdi:transmission-tower");
      setNode("n-grid", down ? "Down" : grid === null ? "Up" : fmtW(grid), down ? "no grid" : grid === null ? "grid" : Math.abs(grid) < 20 ? "grid idle" : grid > 0 ? "buying" : "selling");
      dash("w-grid", down ? 0 : grid, "var(--c-grid)", (grid || 0) > 0);
    }
    if ($("n-batt")) {
      setNode("n-batt", soc === null ? fmtW(batt) : `${Math.round(soc)}%`, batt === null ? "battery" : Math.abs(batt) < 20 ? "idle" : batt > 0 ? `+${fmtW(batt)}` : `−${fmtW(batt)}`);
      const ring = $("socring"); if (ring) { ring.setAttribute("stroke-dasharray", `${soc ?? 0} 100`); ring.style.display = soc === null ? "none" : ""; }
      const icon = $("n-batt").querySelector("ha-icon");
      icon.setAttribute("icon", batt > 20 ? "mdi:battery-charging-high" : soc === null ? "mdi:battery" : `mdi:battery${soc >= 95 ? "" : "-" + Math.max(10, Math.round(soc / 10) * 10)}`);
      dash("w-batt", batt, "var(--c-batt)", (batt || 0) < 0);
    }
    extras.forEach((e, i) => { setNode(`n-ex${i}`, fmtW(e.w)); dash(`w-ex${i}`, e.w, "var(--c-load)", true); });
    const sub = this.shadowRoot.getElementById("flowsub");
    if (sub) sub.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* ----------------------------------------------------------- battery */
  _renderBattery() {
    const el = this.shadowRoot.getElementById("batt"); if (!el) return;
    const b = this._snap.battery;
    if (!b) { this._setHTML(el, ""); return; }
    const kw = (w) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
    const reserve = `down to ${b.reserve}%`;
    let k1 = b.grid_off ? "Power is off – battery lasts" : "If the power goes off", v1, s1;
    if (!b.capacity_kwh) {
      v1 = "–";
      s1 = this._isAdmin ? "Set the battery size below" : "Learning the battery size…";
    } else if (num(b.soc) !== null && b.soc <= b.reserve) {
      v1 = "At reserve"; s1 = `Battery at ${Math.round(b.soc)}%, reserve is ${b.reserve}%`;
    } else if (b.backup_h === null || b.backup_h === undefined) {
      v1 = "Solar covers it"; s1 = `Solar is carrying the house · ${fmtKwh(b.usable_kwh)} in the battery`;
    } else {
      v1 = fmtDur(b.backup_h);
      s1 = `${b.backup_h < 48 ? `until ${clockIn(b.backup_h)} · ` : ""}${kw(b.drain_w)} load · ${reserve}`;
    }
    let k2 = "Full in", v2, s2;
    if (b.state === "full") { k2 = "Battery"; v2 = "Full"; s2 = `${Math.round(b.soc)}%`; }
    else if (b.state === "charging") {
      if (b.full_h === null || b.full_h === undefined) { v2 = "–"; s2 = `charging at ${kw(b.charge_w)}`; }
      else { v2 = fmtDur(b.full_h); s2 = `${b.full_h < 48 ? `around ${clockIn(b.full_h)} · ` : ""}charging at ${kw(b.charge_w)}`; }
    } else {
      v2 = "Not charging";
      s2 = b.state === "discharging" ? `battery giving ${kw(-(this._snap.live?.battery ?? 0))}` : "battery resting";
    }
    this._setHTML(el, `<div class="money">
      <div class="${b.grid_off ? "off" : ""}"><div class="k"><ha-icon icon="${b.grid_off ? "mdi:transmission-tower-off" : "mdi:battery-clock"}"></ha-icon>${k1}</div><div class="v">${v1}</div><div class="s">${s1}</div></div>
      <div><div class="k"><ha-icon icon="mdi:battery-charging-high"></ha-icon>${k2}</div><div class="v">${v2}</div><div class="s">${s2}</div></div>
    </div>`);
    this._renderBattSettings();
  }

  _renderBattSettings() {
    const el = this.shadowRoot.getElementById("battset"); if (!el) return;
    const b = this._snap.battery;
    if (!b || !this._isAdmin) { el.innerHTML = ""; this._battShown = null; return; }
    const set = b.capacity_source === "set" ? b.capacity_kwh : "";
    const key = JSON.stringify([set, b.reserve, b.learned_kwh]);
    const a = this.shadowRoot.activeElement;
    if (this._battShown === key || (a && a.closest && a.closest("#battset"))) return;
    const open = el.querySelector("details")?.open;
    this._battShown = key;
    el.innerHTML = `<details style="margin-top:12px" ${open ? "open" : ""}><summary>Battery settings</summary>
      <div class="field"><label for="b-cap">Battery size<span class="hint">${b.learned_kwh ? `measured ≈ ${b.learned_kwh} kWh – leave empty to use that` : "leave empty to measure it (needs a 15% drop)"}</span></label><span class="ctl"><input id="b-cap" type="number" min="0.5" step="0.1" placeholder="${b.learned_kwh ?? "auto"}" value="${set ?? ""}">kWh</span></div>
      <div class="field"><label for="b-res">Keep in reserve<span class="hint">times are worked out down to this level</span></label><span class="ctl"><input id="b-res" type="number" min="0" max="90" step="1" value="${b.reserve}">%</span></div>
      <div class="actions"><span class="msg" id="bmsg"></span><button class="btn primary" id="savebatt">Save</button></div>
      <p class="muted small" style="margin:8px 0 0">Usable size, e.g. 3 × 5.12 kWh = 15.4 kWh. Times use the last minute's average, so they settle after a big load switches on or off.</p></details>`;
  }

  async _saveBattery() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const cap = $("b-cap").value.trim();
    try {
      const s = await this._hass.callWS({ type: `${DOMAIN}/battery_settings`, settings: { capacity_kwh: cap === "" ? null : Number(cap), reserve: Number($("b-res").value) } });
      this.shadowRoot.activeElement?.blur?.();
      this._battShown = null;
      this._apply(s);
      const m = $("bmsg"); if (m) { m.textContent = "Saved"; m.className = "msg ok"; }
    } catch (e) { const m = $("bmsg"); m.textContent = e.message || "Could not save"; m.className = "msg err"; }
  }

  /* ------------------------------------------------------------- today */
  _cur(v) { const c = this._snap?.tariff?.currency || "R"; return num(v) === null ? "–" : `${c} ${Number(v).toFixed(2)}`; }

  _renderToday() {
    const t = this._snap.today || {}, f = this._snap.features || {};
    const el = this.shadowRoot.getElementById("today"); if (!el) return;
    const load = num(t.load) || 0, imp = num(t.import) || 0;
    const fromGrid = Math.min(imp, load), fromOwn = Math.max(load - fromGrid, 0);
    const stats = [
      ["mdi:solar-power-variant", "var(--c-solar)", "Solar produced", fmtKwh(t.solar)],
      ["mdi:home-lightning-bolt", "var(--c-load)", "House used", fmtKwh(t.load)],
    ];
    if (f.grid) stats.push(["mdi:transmission-tower-import", "var(--c-grid)", "Bought from grid", fmtKwh(t.import)], ["mdi:transmission-tower-export", "var(--c-grid)", "Sold to grid", fmtKwh(t.export)]);
    if (f.battery) stats.push(["mdi:battery-arrow-up", "var(--c-batt)", "Battery charged", fmtKwh(t.charge)], ["mdi:battery-arrow-down", "var(--c-batt)", "Battery used", fmtKwh(t.discharge)]);
    if (f.pv_ac && f.pv_dc) stats.push(["mdi:solar-panel-large", "var(--c-solar)", "Grid-tie PV", fmtKwh(t.solar_ac)], ["mdi:solar-power-variant", "var(--c-solar)", "MPPT PV", fmtKwh(t.solar_dc)]);
    this._setHTML(el, `
      <div class="money">
        <div><div class="k">Grid cost today</div><div class="v">${this._cur(t.cost)}</div><div class="s">${fmtKwh(t.import)} bought</div></div>
        <div><div class="k">Saved by solar</div><div class="v">${this._cur(t.saved)}</div><div class="s">${t.self_sufficiency === null || t.self_sufficiency === undefined ? "–" : t.self_sufficiency + "% self-sufficient"}</div></div>
      </div>
      <div class="stats">${stats.map(([icon, ic, l, v]) => `<div class="stat" style="--ic:${ic}"><ha-icon icon="${icon}"></ha-icon><span class="l">${l}</span><span class="v">${v}</span></div>`).join("")}</div>
      ${load > 0.05 && f.grid ? `<div class="src"><div class="small" style="margin-bottom:6px">Where the house's power came from</div>
        <div class="bar" role="img" aria-label="${Math.round((fromOwn / load) * 100)} percent from solar and battery"><i style="width:${(fromOwn / load) * 100}%;background:var(--c-solar)"></i><i style="width:${(fromGrid / load) * 100}%;background:var(--c-grid)"></i></div>
        <div class="legend"><span class="key"><i style="background:var(--c-solar)"></i>Solar &amp; battery ${Math.round((fromOwn / load) * 100)}%</span><span class="key"><i style="background:var(--c-grid)"></i>Grid ${Math.round((fromGrid / load) * 100)}%</span></div></div>` : ""}`);
    const sub = this.shadowRoot.getElementById("todaysub");
    if (sub) sub.textContent = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }

  /* ------------------------------------------------------------- charts */
  _renderChart() {
    const wrap = this.shadowRoot.getElementById("chart"); if (!wrap || !this._rows) return;
    const rows = (this._day === "today" ? this._rows.today : this._rows.yesterday) || [];
    const socWrap = this.shadowRoot.getElementById("soc");
    if (rows.length < 2) {
      wrap.innerHTML = `<div class="empty">${this._day === "today" ? "No power data yet today – it fills in every 5 minutes." : "No data for yesterday."}</div>`;
      if (socWrap) socWrap.innerHTML = "";
      return;
    }
    const W = Math.max(wrap.clientWidth, 300), H = 260, m = { l: 46, r: 10, t: 8, b: 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = rows.flatMap((r) => [r[1], r[2], r[3], r[4]]).filter((v) => v !== null);
    const hi = Math.max(500, ...vals), lo = Math.min(0, ...vals);
    const step = [250, 500, 1000, 2000, 2500, 5000, 10000, 20000].find((st) => (hi - lo) / st <= 6) || 50000;
    const ymax = Math.ceil(hi / step) * step, ymin = Math.floor(lo / step) * step;
    const x = (mn) => m.l + (mn / 1440) * iw;
    const y = (w) => m.t + ih - ((w - ymin) / (ymax - ymin)) * ih;
    const segs = []; let cur = [];
    rows.forEach((r, i) => { if (i && r[0] - rows[i - 1][0] > 15) { segs.push(cur); cur = []; } cur.push(r); });
    segs.push(cur);
    const path = (k) => segs.map((sg) => { let d = "", pen = false; sg.forEach((r) => { if (r[k] === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(r[0]).toFixed(1)} ${y(r[k]).toFixed(1)}`; pen = true; }); return d; }).join("");
    const area = segs.map((sg) => { const pts = sg.filter((r) => r[1] !== null); return pts.length < 2 ? "" : `M${x(pts[0][0]).toFixed(1)} ${y(0)}` + pts.map((r) => `L${x(r[0]).toFixed(1)} ${y(r[1]).toFixed(1)}`).join("") + `L${x(pts[pts.length - 1][0]).toFixed(1)} ${y(0)}Z`; }).join("");
    const ticks = []; for (let v = ymin; v <= ymax + 1; v += step) ticks.push(v);
    const kfmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`);
    const xt = (iw < 420 ? [0, 360, 720, 1080, 1440] : [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]);
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Solar, house, grid and battery power during the day">
      <g class="grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" ${v === 0 ? 'stroke-width="1.5" style="stroke:var(--muted);opacity:.5"' : ""}/>`).join("")}</g>
      <g class="axis">${ticks.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${kfmt(v)}</text>`).join("")}
        ${xt.map((t) => `<text x="${x(t)}" y="${H - 5}" text-anchor="${t === 0 ? "start" : t === 1440 ? "end" : "middle"}">${hhmm(t)}</text>`).join("")}</g>
      <path d="${area}" fill="var(--c-solar)" opacity=".16"/>
      <path d="${path(1)}" fill="none" stroke="var(--c-solar)" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path(3)}" fill="none" stroke="var(--c-grid)" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path(4)}" fill="none" stroke="var(--c-batt)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
      <path d="${path(2)}" fill="none" stroke="var(--c-load)" stroke-width="2" stroke-linejoin="round"/>
      <g id="hv" style="display:none"><line id="hl" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-dasharray="3 3"/>
        ${[1, 2, 3, 4].map((k) => `<circle id="hc${k}" r="4.5" fill="${["", "var(--c-solar)", "var(--c-load)", "var(--c-grid)", "var(--c-batt)"][k]}" stroke="var(--card)" stroke-width="2"/>`).join("")}</g>
      <rect id="hit" x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" id="tip"></div>`;
    this._hover(wrap, rows, W, (r) => x(r[0]), (mn) => mn, (r, hv) => {
      [1, 2, 3, 4].forEach((k) => { const c = hv.querySelector(`#hc${k}`); if (r[k] === null) { c.style.display = "none"; return; } c.style.display = ""; c.setAttribute("cx", x(r[0])); c.setAttribute("cy", y(r[k])); });
      return `<b>${hhmm(r[0])}</b>
        <div class="row"><span class="key"><i style="background:var(--c-solar)"></i>Solar</span><span>${fmtW(r[1])}</span></div>
        <div class="row"><span class="key"><i style="background:var(--c-load)"></i>House</span><span>${fmtW(r[2])}</span></div>
        ${r[3] !== null ? `<div class="row"><span class="key"><i style="background:var(--c-grid)"></i>Grid</span><span>${r[3] > 20 ? "buying " : r[3] < -20 ? "selling " : ""}${fmtW(r[3])}</span></div>` : ""}
        ${r[4] !== null ? `<div class="row"><span class="key"><i class="dashed"></i>Battery</span><span>${r[4] > 20 ? "charging " : r[4] < -20 ? "using " : ""}${fmtW(r[4])}</span></div>` : ""}
        ${r[5] !== null ? `<div class="row"><span>Battery level</span><span>${Math.round(r[5])}%</span></div>` : ""}`;
    }, m, iw);

    // battery % strip (own axis 0-100 %, separate chart)
    if (socWrap) {
      const sr = rows.filter((r) => r[5] !== null);
      if (sr.length < 2) { socWrap.innerHTML = ""; return; }
      const SH = 64, sy = (p) => 6 + (1 - p / 100) * (SH - 18);
      const line = sr.map((r, i) => `${i ? "L" : "M"}${x(r[0]).toFixed(1)} ${sy(r[5]).toFixed(1)}`).join("");
      socWrap.innerHTML = `<svg viewBox="0 0 ${W} ${SH}" height="${SH}" role="img" aria-label="Battery level during the day">
        <g class="grid"><line x1="${m.l}" x2="${W - m.r}" y1="${sy(0)}" y2="${sy(0)}"/><line x1="${m.l}" x2="${W - m.r}" y1="${sy(100)}" y2="${sy(100)}"/></g>
        <g class="axis"><text x="${m.l - 6}" y="${sy(100) + 4}" text-anchor="end">100%</text><text x="${m.l - 6}" y="${sy(0) + 4}" text-anchor="end">0</text>
          <text x="${m.l + 4}" y="${SH - 2}">Battery level</text></g>
        <path d="${line}L${x(sr[sr.length - 1][0]).toFixed(1)} ${sy(0)}L${x(sr[0][0]).toFixed(1)} ${sy(0)}Z" fill="var(--c-batt)" opacity=".14"/>
        <path d="${line}" fill="none" stroke="var(--c-batt)" stroke-width="2"/></svg>`;
    }
  }

  _hover(wrap, items, W, xOf, toKey, body, m, iw, keyOf = (r) => r[0]) {
    const svg = wrap.querySelector("svg"), hv = wrap.querySelector("#hv"), tip = wrap.querySelector("#tip"), hit = wrap.querySelector("#hit");
    const show = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      let best = items[0], bd = Infinity;
      for (const it of items) { const d = Math.abs(xOf(it) - px); if (d < bd) { bd = d; best = it; } }
      const bx = xOf(best);
      if (hv) { hv.style.display = ""; const l = hv.querySelector("#hl"); if (l) { l.setAttribute("x1", bx); l.setAttribute("x2", bx); } }
      tip.innerHTML = body(best, hv);
      tip.style.display = "block";
      const tx = (bx / W) * rect.width, tw = tip.offsetWidth;
      tip.style.left = `${tx + 14 + tw <= rect.width ? tx + 14 : Math.max(tx - tw - 14, 0)}px`;
    };
    const hide = () => { if (hv) hv.style.display = "none"; tip.style.display = "none"; };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
  }

  _renderHistory() {
    const wrap = this.shadowRoot.getElementById("hist"); if (!wrap || !this._days) return;
    const days = this._days.slice(-this._range);
    const have = days.filter((d) => num(d.solar) !== null || num(d.load) !== null);
    const tot = this.shadowRoot.getElementById("histtot");
    if (!have.length) { wrap.innerHTML = `<div class="empty">History builds up day by day.</div>`; tot.innerHTML = ""; return; }
    const W = Math.max(wrap.clientWidth, 300), H = 220, m = { l: 40, r: 6, t: 8, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const peak = Math.max(1, ...days.flatMap((d) => [num(d.solar) || 0, num(d.load) || 0]));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((st) => peak / st <= 5) || 500;
    const ymax = Math.ceil(peak / step) * step;
    const y = (v) => m.t + ih - (v / ymax) * ih;
    const band = iw / days.length, gap = 2;
    const bw = Math.max(Math.min((band - 6) / 3 - gap, 16), 2);
    const cx = (i) => m.l + band * i + band / 2;
    const bar = (xl, v, color) => {
      if (!v) return "";
      const top = y(v), h = y(0) - top, r = Math.min(4, bw / 2, h);
      return `<path d="M${xl} ${y(0)} V${top + r} q0 ${-r} ${r} ${-r} H${xl + bw - r} q${r} 0 ${r} ${r} V${y(0)} Z" fill="${color}"/>`;
    };
    let bars = "";
    days.forEach((d, i) => {
      const left = cx(i) - (bw * 3 + gap * 2) / 2;
      bars += bar(left, num(d.solar), "var(--c-solar)") + bar(left + bw + gap, num(d.load), "var(--c-load)") + bar(left + 2 * (bw + gap), num(d.import), "var(--c-grid)");
    });
    const ticks = []; for (let v = 0; v <= ymax; v += step) ticks.push(v);
    const label = (d, i) => {
      const dt = new Date(d.day + "T12:00:00");
      if (this._range === 7) return DAYS[dt.getDay()];
      return i % 5 === 0 || i === days.length - 1 ? `${dt.getDate()}/${dt.getMonth() + 1}` : "";
    };
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Solar produced, house used and grid bought per day">
      <g class="grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
        ${days.map((d, i) => `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle">${label(d, i)}</text>`).join("")}</g>
      ${bars}<rect id="hl2" y="${m.t}" height="${ih}" width="${band}" fill="var(--primary-text-color)" opacity="0" />
      <rect id="hit" x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" id="tip"></div>`;
    const hl = wrap.querySelector("#hl2");
    this._hover(wrap, days.map((d, i) => ({ ...d, i })), W, (d) => cx(d.i), null, (d) => {
      hl.setAttribute("x", cx(d.i) - band / 2); hl.setAttribute("opacity", ".06");
      const dt = new Date(d.day + "T12:00:00");
      if (num(d.solar) === null && num(d.load) === null) return `<b>${dt.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</b><div class="muted">No data</div>`;
      return `<b>${dt.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</b>
        <div class="row"><span class="key"><i style="background:var(--c-solar)"></i>Solar</span><span>${fmtKwh(d.solar)}</span></div>
        <div class="row"><span class="key"><i style="background:var(--c-load)"></i>House</span><span>${fmtKwh(d.load)}</span></div>
        <div class="row"><span class="key"><i style="background:var(--c-grid)"></i>Bought</span><span>${fmtKwh(d.import)}</span></div>
        <div class="row"><span>Grid cost</span><span>${this._cur(d.cost)}</span></div>
        <div class="row"><span>Saved</span><span>${this._cur(d.saved)}</span></div>`;
    }, m, iw);
    wrap.querySelector("#hit").addEventListener("pointerleave", () => hl.setAttribute("opacity", "0"));
    const sum = (k) => have.reduce((a, d) => a + (num(d[k]) || 0), 0);
    tot.innerHTML = `
      <div><div class="muted small">Solar produced</div><div class="v">${fmtKwh(sum("solar"), 0)}</div></div>
      <div><div class="muted small">House used</div><div class="v">${fmtKwh(sum("load"), 0)}</div></div>
      <div><div class="muted small">Bought from grid</div><div class="v">${fmtKwh(sum("import"), 0)}</div></div>
      <div><div class="muted small">Grid cost</div><div class="v">${this._cur(sum("cost"))}</div></div>
      <div><div class="muted small">Saved by solar</div><div class="v">${this._cur(sum("saved"))}</div></div>`;
  }

  /* ----------------------------------------------------- solar priority */
  _renderPrio() {
    const card = this.shadowRoot.getElementById("prio"); if (!card) return;
    const sl = this._solar; const loads = sl?.loads || [];
    card.hidden = loads.length === 0;
    if (!loads.length) return;
    const st = sl.settings || {};
    const sub = this.shadowRoot.getElementById("priosub");
    sub.textContent = sl.spare_w === null || sl.spare_w === undefined ? "" : `spare solar now ${fmtW(Math.max(sl.spare_w, 0))}`;
    const icon = (k) => (k === "pool" ? "mdi:pool" : "mdi:water-boiler");
    const state = (l) => {
      if (!l.active) return ["var(--muted)", l.kind === "pool" ? "Not in Solar mode – set the pool to Solar on the Water tab" : "Solar heating is off for this geyser"];
      if (l.grant === undefined) return ["var(--muted)", "Starting…"];
      if (l.grant && l.running) return ["var(--c-ok)", `Running on solar · ${fmtW(l.power)}`];
      if (l.grant) return ["var(--c-ok)", "Switching on"];
      if (!l.wants) return ["var(--muted)", l.kind === "pool" ? "Not needed now (outside hours or done for today)" : "Not needed now (hot enough or not in Auto)"];
      return ["var(--c-warn)", l.why ? l.why.charAt(0).toUpperCase() + l.why.slice(1) : "Waiting for solar"];
    };
    const rows = loads.map((l, i) => {
      const [c, t] = state(l);
      return `<div class="prow ${l.active ? "" : "off"}" data-id="${esc(l.id)}">
        <span class="rank">${i + 1}</span><ha-icon icon="${icon(l.kind)}"></ha-icon>
        <div style="min-width:0"><div class="n">${esc(l.name)}</div><div class="w"><span class="dotx" style="--bc:${c}"></span>${esc(t)}</div></div>
        <div class="mv"><button data-prio="up" aria-label="Move ${esc(l.name)} up" ${i === 0 ? "disabled" : ""}>↑</button><button data-prio="down" aria-label="Move ${esc(l.name)} down" ${i === loads.length - 1 ? "disabled" : ""}>↓</button></div></div>`;
    }).join("");
    const html = `
      <div class="field" style="padding-top:0"><label for="prio-on">Share spare solar by priority<span class="hint">${st.enabled ? "Spare solar goes to the top of the list first. When solar drops, the bottom one switches off first." : "Off – every load uses its own solar settings."}</span></label>
        <span class="switch"><input id="prio-on" type="checkbox" data-prio="enabled" ${st.enabled ? "checked" : ""}><span></span></span></div>
      <div ${st.enabled ? "" : 'style="opacity:.5"'}>${rows}</div>
      ${this._isAdmin ? `<details style="margin-top:8px"><summary>When the battery is full</summary>
        <p class="muted small" style="margin:8px 0">When the battery is full the inverter holds the panels back, so spare solar can't be measured. Loads then start one at a time, in this order, and the lowest one stops first if the battery starts draining.</p>
        <div class="field"><label for="pf-on">Battery counts as full from</label><span class="ctl"><input id="pf-on" type="number" data-pf="soc_full_on" value="${st.soc_full_on}" min="50" max="100">%</span></div>
        <div class="field"><label for="pf-off">…until it drops below</label><span class="ctl"><input id="pf-off" type="number" data-pf="soc_full_off" value="${st.soc_full_off}" min="40" max="100">%</span></div>
        <div class="field"><label for="pf-dis">Stop the lowest load when the battery drains more than</label><span class="ctl"><input id="pf-dis" type="number" data-pf="max_battery_discharge_w" value="${st.max_battery_discharge_w}" min="0" step="50">W</span></div>
        <div class="actions"><span class="msg" id="pfmsg"></span><button class="btn primary" data-prio="savefull">Save</button></div></details>` : ""}`;
    const a = this.shadowRoot.activeElement;
    if (a && a.closest && a.closest("#priobody details")) return;  // don't redraw while typing
    const keepOpen = this.shadowRoot.querySelector("#priobody details")?.open;
    this._setHTML(this.shadowRoot.getElementById("priobody"), html);
    if (keepOpen) { const d = this.shadowRoot.querySelector("#priobody details"); if (d) d.open = true; }
  }

  async _prioClick(btn) {
    const sl = this._solar; if (!sl) return;
    const send = async (settings, msgEl) => {
      try { this._solar = await this._hass.callWS({ type: `${DOMAIN}/solar_settings`, settings }); this._renderPrio(); return true; }
      catch (e) { if (msgEl) { msgEl.textContent = e.message || "Failed"; msgEl.className = "msg err"; } else alert(e.message || e); return false; }
    };
    const act = btn.dataset.prio;
    if (act === "enabled") return send({ enabled: btn.checked });
    if (act === "savefull") {
      const settings = {};
      this.shadowRoot.querySelectorAll("[data-pf]").forEach((i) => { settings[i.dataset.pf] = Number(i.value); });
      this.shadowRoot.activeElement?.blur?.();
      if (await send(settings, this.shadowRoot.getElementById("pfmsg"))) { const m = this.shadowRoot.getElementById("pfmsg"); if (m) { m.textContent = "Saved"; m.className = "msg ok"; } }
      return;
    }
    const ids = sl.loads.map((l) => l.id);
    const i = ids.indexOf(btn.closest(".prow").dataset.id);
    const j = act === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return send({ order: ids });
  }

  /* ------------------------------------------------------------- tariff */
  _renderTariff() {
    const el = this.shadowRoot.getElementById("tariff"); if (!el) return;
    const t = this._snap.tariff || {};
    const key = JSON.stringify(t);
    const a = this.shadowRoot.activeElement;
    if (this._tariffShown === key || (a && a.closest && a.closest("#tariff"))) return;
    this._tariffShown = key;
    const c = esc(t.currency || "R");
    el.innerHTML = `
      <div class="field"><label for="t-import">Buying from grid<span class="hint">per kWh, incl. VAT</span></label><span class="ctl">${c}<input id="t-import" type="number" min="0" step="0.01" value="${t.import}"></span></div>
      <div class="field"><label for="t-export">Selling to grid<span class="hint">feed-in credit per kWh</span></label><span class="ctl">${c}<input id="t-export" type="number" min="0" step="0.01" value="${t.export}"></span></div>
      <div class="field"><label for="t-fixed">Fixed daily charge<span class="hint">service / network fee</span></label><span class="ctl">${c}<input id="t-fixed" type="number" min="0" step="0.01" value="${t.daily_fixed}"></span></div>
      <div class="actions"><span class="msg" id="tmsg"></span><button class="btn primary" id="savetariff">Save</button></div>
      <p class="muted small" style="margin:8px 0 0">Cost and savings for past days are recalculated with these prices.</p>`;
  }

  async _saveTariff() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const msg = $("tmsg");
    try {
      const s = await this._hass.callWS({ type: `${DOMAIN}/set_tariff`, tariff: { import: Number($("t-import").value), export: Number($("t-export").value), daily_fixed: Number($("t-fixed").value) } });
      this._days = s.days;
      this.shadowRoot.activeElement?.blur?.();
      this._tariffShown = null;
      this._apply(s); this._renderHistory();
      const m2 = $("tmsg"); if (m2) { m2.textContent = "Saved"; m2.className = "msg ok"; }
    } catch (e) { msg.textContent = e.message || "Could not save"; msg.className = "msg err"; }
  }

  _renderRaw() {
    const el = this.shadowRoot.getElementById("raw"); if (!el || !this._snap) return;
    const L = this._snap.live || {};
    const f = (v, u) => (num(v) === null ? "–" : `${Math.round(v)} ${u}`);
    const rows = [["Solar", f(L.solar, "W")], ["House", f(L.load, "W")], ["Grid (+ buying)", f(L.grid, "W")], ["Battery (+ charging)", f(L.battery, "W")],
      ["Battery level", f(L.soc, "%")], ["Grid available", L.grid_available === null || L.grid_available === undefined ? "not mapped" : L.grid_available ? "yes" : "no"]];
    for (const [id, v] of Object.entries(this._raw || {})) rows.push([id, v]);
    el.innerHTML = rows.map(([a, b]) => `<span class="muted">${esc(a)}</span><span>${esc(b)}</span>`).join("");
  }
}

/* ================================================================ water tab */
const WDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
Object.assign(HamletHomePanel.prototype, {
  _buildWater() {
    this._main.innerHTML = `
      <div class="card alarm" id="walarm" hidden></div>
      <section class="card s7" id="wpump"><h2>Booster pump <span class="sub" id="wpumpsub"></span></h2><div id="wpumpbody"></div></section>
      <section class="card s5" id="wpool"><h2>Pool pump</h2><div id="wpoolbody"></div><div id="wpoolsched"></div>
        <div class="actions" id="wpoolact" hidden><span class="msg" id="wpoolmsg"></span><button class="btn" data-w="poolreset">Discard</button><button class="btn primary" data-w="poolsave">Save times</button></div></section>
      <section class="card" id="wirr"><h2><ha-icon icon="mdi:sprinkler-variant"></ha-icon>Irrigation <span class="sub" id="wirrsub"></span></h2>
        <div id="irrlive"></div><div id="irrform"></div>
        <div class="actions" id="irract" hidden><span class="msg" id="irrmsg"></span><button class="btn" data-irr="discard">Discard</button><button class="btn primary" data-irr="save">Save changes</button></div></section>
      <section class="card" id="wchartcard"><h2>Water pressure <span class="sub"><span class="seg"><button data-wday="today" aria-pressed="${(this._wday || "today") === "today"}">Today</button><button data-wday="yesterday" aria-pressed="${this._wday === "yesterday"}">Yesterday</button></span></span></h2>
        <div class="legend" style="margin:0 0 6px"><span class="key"><i style="background:var(--c-load)"></i>Pressure (bar)</span><span class="key"><i style="background:var(--accent);opacity:.25"></i>Booster pump running</span><span class="key" id="wpoolkey"><i style="background:var(--c-solar);opacity:.5"></i>Pool pump running</span></div>
        <div class="chartwrap" id="wchart"></div></section>
      <section class="card" id="wprot" hidden><h2>Protection &amp; alerts <span class="sub">admin only</span></h2><div id="wprotbody"></div>
        <div class="actions"><span class="msg" id="wprotmsg"></span><button class="btn primary" data-w="protsave">Save</button></div></section>`;
    this._wShown = {};
    this._ro = new ResizeObserver(() => this._renderPressure());
    this._ro.observe(this.shadowRoot.getElementById("wchart"));
    this._irrShown = null; this._irrDirty = false;
    if (this._isAdmin && !this._irrOpts) this._hass.callWS({ type: `${DOMAIN}/irrigation_entities` }).then((o) => { this._irrOpts = o; this._irrShown = null; this._renderIrr(); }).catch(() => {});
    this._renderWater(); this._renderPressure();
  },

  _renderWater() {
    const w = this._water; const $ = (id) => this.shadowRoot.getElementById(id);
    if (!$("wpump")) return;
    this._renderIrr();
    if (!w) { ["wpump", "wpool", "wchartcard", "wprot", "walarm"].forEach((id) => { $(id).hidden = true; }); return; }
    const L = w.live || {}, f = w.features || {}, st = w.settings || {};
    const hasPump = f.pump_switch || f.pump_power || f.pump_hz || f.water_pressure;
    $("wpump").hidden = !hasPump;
    $("wpool").hidden = !(f.pool_switch || f.pool_power);
    $("wchartcard").hidden = !f.water_pressure;
    $("wpoolkey").hidden = !(f.pool_switch || f.pool_power);
    $("wprot").hidden = !this._isAdmin || !hasPump;

    // alarm
    const al = $("walarm");
    al.hidden = !w.tripped;
    if (w.tripped) this._setHTML(al, `<ha-icon icon="mdi:water-alert"></ha-icon><div><div class="t">Booster pump stopped – no water?</div>
      <div class="d">It ran below ${st.dry_run_bar} bar for ${Math.round(st.dry_run_seconds)} s${w.tripped_at ? ` at ${new Date(w.tripped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}. Check the supply, then reset.</div></div>
      <button class="btn primary big" data-w="reset"><ha-icon icon="mdi:restart" style="--mdc-icon-size:18px;color:inherit"></ha-icon>Reset &amp; start pump</button>`);

    // booster pump
    if (hasPump) {
      const bar = num(L.pressure), sp = num(L.setpoint);
      const max = Math.max(6, Math.ceil(((sp || bar || 3) * 1.6)));
      const running = L.pump_running;
      const low = bar !== null && ((st.low_pressure_bar && bar < st.low_pressure_bar) || (st.dry_run_enabled && running && bar < st.dry_run_bar));
      const color = w.tripped ? "var(--c-bad)" : low ? "var(--c-warn)" : "var(--c-load)";
      const sweep = 240, r = 80, cx = 105, cy = 100;
      const frac = (v) => Math.max(0, Math.min(1, v / max));
      const arc = (fr) => { const a0 = 150 * Math.PI / 180, a = a0 + fr * sweep * Math.PI / 180;
        return `M${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)} A${r} ${r} 0 ${fr * sweep > 180 ? 1 : 0} 1 ${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`; };
      let tick = "";
      if (sp !== null) { const a = (150 + frac(sp) * sweep) * Math.PI / 180;
        tick = `<line x1="${(cx + 68 * Math.cos(a)).toFixed(1)}" y1="${(cy + 68 * Math.sin(a)).toFixed(1)}" x2="${(cx + 92 * Math.cos(a)).toFixed(1)}" y2="${(cy + 92 * Math.sin(a)).toFixed(1)}" stroke="var(--primary-text-color)" stroke-width="2.5" stroke-linecap="round"/>`; }
      const gauge = f.water_pressure ? `<div class="pg"><svg viewBox="0 0 210 170" role="img" aria-label="Water pressure ${bar === null ? "unknown" : bar.toFixed(2) + " bar"}">
          <path d="${arc(1)}" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round"/>
          ${bar !== null ? `<path d="${arc(frac(bar))}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>` : ""}${tick}
          <text x="${cx + r * Math.cos(150 * Math.PI / 180)}" y="164" fill="var(--secondary-text-color)" font-size="11" text-anchor="middle">0</text>
          <text x="${cx + r * Math.cos(30 * Math.PI / 180)}" y="164" fill="var(--secondary-text-color)" font-size="11" text-anchor="middle">${max}</text></svg>
        <div class="c"><div class="big">${bar === null ? "–" : bar.toFixed(2)}<small> bar</small></div><div class="muted small">${sp !== null ? `set point ${sp.toFixed(1)} bar` : "water pressure"}</div></div></div>` : "";
      const runFor = w.run_since && running ? Math.round((Date.now() - new Date(w.run_since)) / 60000) : null;
      const badge = w.tripped ? ["var(--c-bad)", "Stopped – dry run", false] : running === null ? ["var(--muted)", "Unknown", false]
        : running ? ["var(--c-ok)", runFor !== null && runFor >= 1 ? `Running ${runFor} min` : "Running", true] : ["var(--muted)", L.pump_switch === false ? "Switched off" : "Standing by", false];
      const tiles = [];
      if (f.pump_power) tiles.push(["Power", fmtW(L.pump_w)]);
      if (f.pump_hz) tiles.push(["Frequency", num(L.pump_hz) === null ? "–" : `${num(L.pump_hz).toFixed(1)} Hz`]);
      if (f.pump_amps) tiles.push(["Current", num(L.pump_a) === null ? "–" : `${num(L.pump_a).toFixed(2)} A`]);
      if (f.pump_speed) tiles.push(["Speed", num(L.pump_speed) === null ? "–" : `${Math.round(L.pump_speed)}`]);
      if (f.tank_level) tiles.push(["Tank", num(L.tank) === null ? "–" : `${Math.round(L.tank)}%`]);
      const t = w.pump_today || {};
      const mins = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min` : `${Math.round((sec || 0) / 60)} min`);
      const startsPerHour = (t.starts || 0) / Math.max(new Date().getHours() + new Date().getMinutes() / 60, 1);
      tiles.push(["Run time today", mins(t.seconds)], ["Starts today", `${t.starts || 0}`], ["Longest run", mins(t.longest)]);
      this._setHTML($("wpumpbody"), `<div class="${gauge ? "pgrid" : ""}">${gauge}<div>
          <div class="row2"><span class="badge ${badge[2] ? "pulse" : ""}" style="--bc:${badge[0]}"><span class="dot"></span>${badge[1]}</span>
            ${f.pump_switch && !w.tripped ? `<button class="btn ${L.pump_switch ? "" : "primary"}" data-w="${L.pump_switch ? "pumpoff" : "pumpon"}" style="margin-left:auto">${L.pump_switch ? "Switch off" : "Switch on"}</button>` : ""}</div>
          ${startsPerHour > 12 ? `<div class="note" style="margin-top:10px">The pump is starting about ${Math.round(startsPerHour)} times an hour – check the pressure tank pre-charge or for a dripping tap.</div>` : ""}
          <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}</div></div></div>`);
    }

    // pool pump
    if (f.pool_switch || f.pool_power) {
      const pr = L.pool_running, t = w.pool_today || {};
      const runMin = Math.round((t.seconds || 0) / 60);
      this._setHTML($("wpoolbody"), `
        <div class="row2"><span class="badge ${pr ? "pulse" : ""}" style="--bc:${pr ? "var(--c-ok)" : "var(--muted)"}"><span class="dot"></span>${pr ? "Running" : "Off"}</span>
          <span class="muted small">${esc(w.pool_reason || "")}</span></div>
        ${f.pool_switch ? `<div class="row2" style="margin-top:12px"><div class="modes3" role="group" aria-label="Pool pump mode">${[["auto", "Timer"], ["solar", "Solar"], ["on", "On"], ["off", "Off"]].map(([m, l]) => `<button data-pmode="${m}" aria-pressed="${st.pool_mode === m}">${l}</button>`).join("")}</div></div>` : ""}
        <div class="tiles">${f.pool_power ? `<div class="tile"><div class="k">Power</div><div class="v">${fmtW(L.pool_w)}</div></div>` : ""}
          <div class="tile"><div class="k">Run time today</div><div class="v">${runMin >= 60 ? `${Math.floor(runMin / 60)} h ${runMin % 60} min` : `${runMin} min`}</div></div></div>
        <div id="wpoolsolar"></div>
        ${f.pool_switch ? `<h2 style="margin:16px 0 0;font-size:14px">${st.pool_mode === "solar" ? "Solar hours <span class=\"sub\">only runs inside these times</span>" : "Run times <span class=\"sub\">used in Timer mode</span>"}</h2>` : ""}`);
      this._renderPoolSolar();
      if (f.pool_switch) this._renderPoolSched();
    }
    this._renderProt();
  },

  _renderPoolSched(force) {
    const el = this.shadowRoot.getElementById("wpoolsched"); if (!el) return;
    const st = this._water.settings;
    const key = JSON.stringify(st.pool_schedules);
    const a = this.shadowRoot.activeElement;
    if (!force && (this._poolDirty || (a && a.closest && a.closest("#wpoolsched")) || this._wShown.pool === key)) return;
    this._wShown.pool = key;
    if (!this._poolDirty) this._poolDraft = JSON.parse(key);
    const list = this._poolDraft;
    el.innerHTML = (list.length ? list.map((sc, i) => `<div class="sched" data-i="${i}">
        <label class="switch" title="Enabled"><input type="checkbox" data-pk="enabled" ${sc.enabled ? "checked" : ""} aria-label="Enable run time ${i + 1}"><span></span></label>
        <span class="row2"><input type="time" data-pk="start" value="${esc(sc.start)}" aria-label="Start"><span class="muted">to</span><input type="time" data-pk="end" value="${esc(sc.end)}" aria-label="End"></span>
        <button class="iconbtn" data-w="pooldel" aria-label="Remove run time"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        <div class="days">${WDAYS.map((d, di) => `<button data-pday="${di}" aria-pressed="${sc.days.includes(di)}">${d}</button>`).join("")}</div></div>`).join("")
      : `<div class="muted small" style="padding:8px 0">No run times – the pool pump only runs when switched on.</div>`)
      + `<div class="actions" style="justify-content:flex-start"><button class="btn" data-w="pooladd">+ Add run time</button></div>`;
    el.querySelectorAll(".sched").forEach((row) => {
      const sc = list[Number(row.dataset.i)];
      row.querySelectorAll("input").forEach((inp) => {
        const up = () => { const k = inp.dataset.pk; sc[k] = k === "enabled" ? inp.checked : inp.value; this._poolChanged(); };
        inp.addEventListener("input", up); inp.addEventListener("change", up);
      });
    });
  },

  _renderPoolSolar() {
    const el = this.shadowRoot.getElementById("wpoolsolar"); if (!el) return;
    const st = this._water.settings;
    if (st.pool_mode !== "solar") { el.innerHTML = ""; this._wShown.psolar = null; return; }
    const key = JSON.stringify([st.pool_solar_start_w, st.pool_solar_keep_w, st.pool_hours]);
    const a = this.shadowRoot.activeElement;
    if ((a && a.closest && a.closest("#wpoolsolar")) || this._wShown.psolar === key) return;
    this._wShown.psolar = key;
    el.innerHTML = `<div style="margin-top:12px">
      <div class="field"><label for="ps-start">Start when spare solar is above<span class="hint">not counting the pump itself</span></label><span class="ctl"><input id="ps-start" type="number" data-ps="pool_solar_start_w" value="${st.pool_solar_start_w}" min="0" step="50">W</span></div>
      <div class="field"><label for="ps-keep">Keep running while above</label><span class="ctl"><input id="ps-keep" type="number" data-ps="pool_solar_keep_w" value="${st.pool_solar_keep_w}" min="0" step="50">W</span></div>
      <div class="field"><label for="ps-hours">Run hours per day<span class="hint">stops once reached · 0 = no limit</span></label><span class="ctl"><input id="ps-hours" type="number" data-ps="pool_hours" value="${st.pool_hours}" min="0" max="24" step="0.5">h</span></div>
      <div class="actions"><span class="msg" id="psmsg"></span><button class="btn primary" data-w="psolarsave">Save</button></div>
      <p class="muted small" style="margin:4px 0 0">Shares solar with the geyser by the order under Energy → Solar priority.</p></div>`;
  },

  _poolChanged() { this._poolDirty = true; const a = this.shadowRoot.getElementById("wpoolact"); if (a) a.hidden = false; },

  _renderProt() {
    const el = this.shadowRoot.getElementById("wprotbody"); if (!el || !this._isAdmin) return;
    const st = this._water.settings;
    const key = JSON.stringify(st);
    const a = this.shadowRoot.activeElement;
    if ((a && a.closest && a.closest("#wprotbody")) || this._wShown.prot === key) return;
    this._wShown.prot = key;
    const f = this._water.features;
    const fld = (k, label, hint, unit, o = {}) => o.bool
      ? `<div class="field"><label for="wp-${k}">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</label><span class="switch"><input id="wp-${k}" type="checkbox" data-wp="${k}" ${st[k] ? "checked" : ""}><span></span></span></div>`
      : o.text ? `<div class="field"><label for="wp-${k}">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</label><input id="wp-${k}" type="text" data-wp="${k}" value="${esc(st[k] || "")}" placeholder="notify.mobile_app_phone"></div>`
      : `<div class="field"><label for="wp-${k}">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</label><span class="ctl"><input id="wp-${k}" type="number" data-wp="${k}" value="${st[k]}" min="0" step="${o.step || 1}">${unit}</span></div>`;
    el.innerHTML = `<div class="cols2"><div>
        ${fld("dry_run_enabled", "Dry-run protection", f.pump_switch ? "Switch the pump off when it runs without pressure" : "Needs a pump switch to stop the pump – alert only", "", { bool: true })}
        ${fld("dry_run_bar", "Dry run: pressure below", "", "bar", { step: 0.1 })}
        ${fld("dry_run_seconds", "Dry run: for longer than", "", "s", { step: 5 })}
        ${fld("running_watts", "Pump counts as running above", "when a power sensor is set", "W", { step: 5 })}
      </div><div>
        ${fld("long_run_minutes", "Alert: pump running non-stop for", "possible leak or open tap · 0 = off", "min")}
        ${fld("low_pressure_bar", "Alert: pressure stays below", "0 = off", "bar", { step: 0.1 })}
        ${fld("notify_service", "Also send to phone", "Home Assistant app notify service", "", { text: true })}
      </div></div>
      <p class="muted small" style="margin:8px 0 0">Alerts always appear in Home Assistant notifications.</p>`;
  },

  async _waterClick(ev) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const call = async (msg, msgEl) => {
      try { this._water = await this._hass.callWS(msg); this._waterRows = this._water.rows; this._renderWater(); this._renderPressure(); return true; }
      catch (e) { if (msgEl) { msgEl.textContent = e.message || "Failed"; msgEl.className = "msg err"; } else alert(e.message || e); return false; }
    };
    const ib = ev.target.closest("[data-irr]");
    if (ib) return this._irrClick(ib);
    const wd = ev.target.closest("[data-wday]");
    if (wd) { this._wday = wd.dataset.wday; this.shadowRoot.querySelectorAll("[data-wday]").forEach((b) => b.setAttribute("aria-pressed", b === wd)); return this._renderPressure(); }
    const pm = ev.target.closest("[data-pmode]");
    if (pm) return call({ type: `${DOMAIN}/water_action`, action: "pool_mode", value: pm.dataset.pmode });
    const pd = ev.target.closest("[data-pday]");
    if (pd) {
      const sc = this._poolDraft[Number(pd.closest(".sched").dataset.i)], d = Number(pd.dataset.pday);
      sc.days = sc.days.includes(d) ? sc.days.filter((x) => x !== d) : [...sc.days, d].sort();
      pd.setAttribute("aria-pressed", sc.days.includes(d)); return this._poolChanged();
    }
    const b = ev.target.closest("[data-w]"); if (!b) return;
    switch (b.dataset.w) {
      case "pumpon": return call({ type: `${DOMAIN}/water_action`, action: "pump", value: true });
      case "pumpoff": return call({ type: `${DOMAIN}/water_action`, action: "pump", value: false });
      case "reset": return call({ type: `${DOMAIN}/water_action`, action: "reset" });
      case "pooladd": this._poolDraft.push({ enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: "10:00", end: "14:00" }); this._poolChanged(); return this._renderPoolSched(true);
      case "pooldel": this._poolDraft.splice(Number(b.closest(".sched").dataset.i), 1); this._poolChanged(); return this._renderPoolSched(true);
      case "poolreset": this._poolDirty = false; $("wpoolact").hidden = true; return this._renderPoolSched(true);
      case "poolsave": {
        const ok = await call({ type: `${DOMAIN}/water_settings`, settings: { pool_schedules: this._poolDraft } }, $("wpoolmsg"));
        if (ok) { this._poolDirty = false; $("wpoolact").hidden = true; this._renderPoolSched(true); }
        return;
      }
      case "psolarsave": {
        const settings = {};
        this.shadowRoot.querySelectorAll("[data-ps]").forEach((inp) => { settings[inp.dataset.ps] = Number(inp.value); });
        this.shadowRoot.activeElement?.blur?.();
        this._wShown.psolar = null;
        if (await call({ type: `${DOMAIN}/water_settings`, settings }, $("psmsg"))) { const m = $("psmsg"); if (m) { m.textContent = "Saved"; m.className = "msg ok"; } }
        return;
      }
      case "protsave": {
        const settings = {};
        this.shadowRoot.querySelectorAll("[data-wp]").forEach((inp) => { settings[inp.dataset.wp] = inp.type === "checkbox" ? inp.checked : inp.type === "text" ? inp.value : Number(inp.value); });
        this.shadowRoot.activeElement?.blur?.();
        this._wShown.prot = null;
        if (await call({ type: `${DOMAIN}/water_settings`, settings }, $("wprotmsg"))) { const m = $("wprotmsg"); m.textContent = "Saved"; m.className = "msg ok"; }
        return;
      }
      default: return undefined;
    }
  },

  _renderPressure() {
    const wrap = this.shadowRoot.getElementById("wchart"); if (!wrap || !this._waterRows) return;
    const rows = (this._wday === "yesterday" ? this._waterRows.yesterday : this._waterRows.today) || [];
    if (rows.length < 2) { wrap.innerHTML = `<div class="empty">The pressure chart fills in every 5 minutes.</div>`; return; }
    const W = Math.max(wrap.clientWidth, 300), H = 220, m = { l: 40, r: 10, t: 8, b: 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const peak = Math.max(1, ...rows.map((r) => r[1] || 0));
    const step = [0.5, 1, 2, 5].find((st) => peak / st <= 6) || 10;
    const ymax = Math.ceil(peak / step) * step;
    const x = (mn) => m.l + (mn / 1440) * iw, y = (v) => m.t + ih - (v / ymax) * ih;
    const slotW = (5 / 1440) * iw;
    const band = (k, color, op) => rows.filter((r) => r[k] > 0).map((r) => `<rect x="${x(r[0]).toFixed(1)}" y="${m.t}" width="${(slotW + 0.5).toFixed(1)}" height="${ih}" fill="${color}" opacity="${(op * r[k]).toFixed(2)}"/>`).join("");
    const segs = []; let cur = [];
    rows.forEach((r, i) => { if (i && r[0] - rows[i - 1][0] > 15) { segs.push(cur); cur = []; } if (r[1] !== null) cur.push(r); });
    segs.push(cur);
    const line = segs.map((sg) => sg.map((r, i) => `${i ? "L" : "M"}${(x(r[0]) + slotW / 2).toFixed(1)} ${y(r[1]).toFixed(1)}`).join("")).join("");
    const ticks = []; for (let v = 0; v <= ymax + 1e-9; v += step) ticks.push(+v.toFixed(2));
    const xt = iw < 420 ? [0, 360, 720, 1080, 1440] : [0, 180, 360, 540, 720, 900, 1080, 1260, 1440];
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Water pressure and pump running time">
      ${band(3, "var(--accent)", 0.22)}${band(4, "var(--c-solar)", 0.28)}
      <g class="grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
        ${xt.map((t) => `<text x="${x(t)}" y="${H - 5}" text-anchor="${t === 0 ? "start" : t === 1440 ? "end" : "middle"}">${hhmm(t)}</text>`).join("")}</g>
      <path d="${line}" fill="none" stroke="var(--c-load)" stroke-width="2" stroke-linejoin="round"/>
      <g id="hv" style="display:none"><line id="hl" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-dasharray="3 3"/><circle id="hc" r="4.5" fill="var(--c-load)" stroke="var(--card)" stroke-width="2"/></g>
      <rect id="hit" x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" id="tip"></div>`;
    this._hover(wrap, rows, W, (r) => x(r[0]) + slotW / 2, null, (r, hv) => {
      const c = hv.querySelector("#hc");
      if (r[1] === null) c.style.display = "none"; else { c.style.display = ""; c.setAttribute("cx", x(r[0]) + slotW / 2); c.setAttribute("cy", y(r[1])); }
      return `<b>${hhmm(r[0])}</b>
        <div class="row"><span>Pressure</span><span>${r[1] === null ? "–" : r[1].toFixed(2) + " bar"}</span></div>
        <div class="row"><span>Lowest</span><span>${r[2] === null ? "–" : r[2].toFixed(2) + " bar"}</span></div>
        <div class="row"><span>Booster running</span><span>${Math.round(r[3] * 5)} of 5 min</span></div>
        ${r[4] > 0 ? `<div class="row"><span>Pool pump</span><span>${Math.round(r[4] * 5)} of 5 min</span></div>` : ""}`;
    }, m, iw);
  },

  /* ------------------------------------------------------------ irrigation */
  _irrFresh() {
    const ir = this._irr || { zones: [], settings: {} };
    const st = ir.settings || {};
    return JSON.parse(JSON.stringify({
      zones: ir.zones.map((z) => ({ id: z.id, name: z.name, entity: z.entity, minutes: z.minutes, enabled: z.enabled !== false })),
      programs: st.programs || [], amount: st.amount ?? 100, skip_when_raining: st.skip_when_raining !== false,
      pump_entity: st.pump_entity || "", rain_entity: st.rain_entity || "", manual_auto_off: st.manual_auto_off !== false, max_minutes: st.max_minutes ?? 120,
    }));
  },

  _irrChanged() { this._irrDirty = true; const a = this.shadowRoot.getElementById("irract"); if (a) a.hidden = false; const m = this.shadowRoot.getElementById("irrmsg"); if (m) m.textContent = ""; },

  _renderIrr() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const card = $("wirr"); if (!card) return;
    const ir = this._irr || { zones: [], settings: {} };
    card.hidden = !ir.zones.length && !this._isAdmin;
    if (card.hidden) return;
    this._renderIrrLive();
    const key = JSON.stringify([ir.zones.map((z) => [z.id, z.name, z.entity, z.minutes, z.enabled]), ir.settings, !!this._irrOpts, this._irrEdit]);
    const a = this.shadowRoot.activeElement;
    if (this._irrDirty || (a && a.closest && a.closest("#irrform")) || this._irrShown === key) return;
    this._irrShown = key;
    this._irrDraft = this._irrFresh();
    this._renderIrrForm();
  },

  _renderIrrLive() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const ir = this._irr; if (!ir) return;
    const st = ir.settings || {};
    const fmtT = (iso) => { if (!iso) return ""; const d = new Date(iso); const today = new Date().toDateString() === d.toDateString();
      return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
    const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const sub = $("wirrsub");
    sub.textContent = ir.skip ? ir.skip : ir.next_program ? `next ${fmtT(ir.next_program)}` : (ir.zones.length ? "no programs set" : "");
    const run = ir.run;
    const manual = ir.zones.filter((z) => z.on && (!run || z.id !== run.zone));
    let status;
    if (run) {
      const pct = run.secs ? Math.min(100, 100 * (1 - (run.remaining || 0) / run.secs)) : 0;
      status = `<div class="grow"><div class="big"><span class="zdot on" style="display:inline-block;margin-right:8px"></span>Watering ${esc(run.name)} · ${mmss(run.remaining || 0)} left</div>
        <div class="small">${esc(run.by)} · valve ${run.index} of ${run.total}${run.next.length ? ` · then ${esc(run.next.join(", "))}` : ""}${ir.pump_on ? " · pump on" : ""}</div>
        <div class="prog"><i style="width:${pct.toFixed(1)}%"></i></div></div>
        <button class="btn" data-irr="skip">Next valve</button><button class="btn danger" data-irr="stop">Stop</button>`;
    } else if (manual.length) {
      status = `<div class="grow"><div class="big"><span class="zdot on" style="display:inline-block;margin-right:8px"></span>${esc(manual.map((z) => z.name).join(", "))} open by hand</div>
        <div class="small">${manual[0].closes ? `closes itself at ${fmtT(manual[0].closes)}` : ""}</div></div><button class="btn danger" data-irr="stop">Close all</button>`;
    } else {
      status = `<div class="grow"><div class="big">${ir.zones.length ? (ir.skip ? "Skipping programs" : "Idle") : "No valves yet"}</div>
        <div class="small">${esc(ir.note || (ir.today_minutes ? `Watered ${ir.today_minutes} min today` : ""))}</div></div>
        ${ir.zones.length ? `<button class="btn primary" data-irr="runall">Run all now</button>` : ""}`;
    }
    const delayOn = !!st.rain_delay_until && new Date(st.rain_delay_until) > new Date();
    const live = `<div class="irrstat">${status}</div>
      ${ir.zones.length ? `<div class="chips" style="margin-top:12px"><span class="muted small">Rain delay</span>
        ${[[0, "Off"], [24, "24 h"], [48, "48 h"], [72, "72 h"]].map(([h, l]) => `<button class="pchip" data-irr="delay" data-h="${h}" aria-pressed="${h === 0 ? !delayOn : false}">${l}</button>`).join("")}
        ${delayOn ? `<span class="muted small">until ${fmtT(st.rain_delay_until)}</span>` : ""}</div>` : ""}`;
    this._setHTML($("irrlive"), live);
    // live valve dots in the list (without touching inputs)
    this.shadowRoot.querySelectorAll("[data-zlive]").forEach((el) => {
      const z = ir.zones.find((x) => x.id === el.dataset.zlive); if (!z) return;
      el.querySelector(".zdot").className = `zdot ${z.on ? "on" : z.available ? "" : "na"}`;
      el.querySelector(".z2").textContent = z.on ? "open" : !z.available ? "valve unavailable" : z.last ? `last ${fmtT(z.last)}` : "not watered yet";
    });
    const log = $("irrlog");
    if (log) this._setHTML(log, (ir.today || []).length ? (ir.today.slice().reverse().map((e) => `<span>${new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>${esc(e.name)} · ${esc(e.by)}</span><span>${Math.round(e.secs / 60)} min</span>`).join("")) : `<span class="muted">Nothing yet today</span>`);
  },

  _renderIrrForm() {
    const el = this.shadowRoot.getElementById("irrform"); if (!el) return;
    const d = this._irrDraft, admin = this._isAdmin, opts = this._irrOpts || { valves: [], rain: [] };
    const edit = admin && (this._irrEdit || !d.zones.length);
    const sel = (key, list, val, empty) => `<select data-ik="${key}">${`<option value="">${empty}</option>`}${list.map((o) => `<option value="${esc(o.id)}" ${o.id === val ? "selected" : ""}>${esc(o.name)} (${esc(o.id)})</option>`).join("")}
      ${val && !list.some((o) => o.id === val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ""}</select>`;
    let zones;
    if (edit) {
      zones = d.zones.map((z, i) => `<div class="zedit" data-zi="${i}">
          <input type="text" data-zk="name" value="${esc(z.name)}" aria-label="Valve name" placeholder="Name, e.g. Binne Tuin">
          <select data-zk="entity" aria-label="Valve switch"><option value="">Pick the valve switch…</option>${opts.valves.map((o) => `<option value="${esc(o.id)}" ${o.id === z.entity ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
            ${z.entity && !opts.valves.some((o) => o.id === z.entity) ? `<option value="${esc(z.entity)}" selected>${esc(z.entity)}</option>` : ""}</select>
          <span class="ctl"><input type="number" data-zk="minutes" value="${z.minutes}" min="0" max="240" step="1" aria-label="Minutes">min</span>
          <span class="chips"><button class="iconbtn" data-irr="zup" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button class="iconbtn" data-irr="zdown" ${i === d.zones.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button><button class="iconbtn" data-irr="zdel" aria-label="Remove valve"><ha-icon icon="mdi:delete-outline"></ha-icon></button></span></div>`).join("")
        + `<div class="actions" style="justify-content:flex-start"><button class="btn" data-irr="zadd">+ Add valve</button>${d.zones.length ? `<button class="btn" data-irr="editdone" style="margin-left:auto">Done editing</button>` : ""}</div>`;
    } else {
      zones = `<div class="zgrid">${d.zones.map((z, i) => `<div class="zrow" data-zi="${i}">
          <div class="zname" data-zlive="${esc(z.id)}"><span class="zdot"></span><div style="min-width:0"><div class="t">${esc(z.name)}</div><div class="z2"></div></div></div>
          <span class="ctl"><input type="number" data-zk="minutes" value="${z.minutes}" min="0" max="240" step="1" aria-label="${esc(z.name)} minutes">min</span>
          <button class="btn" data-irr="runzone" data-zid="${esc(z.id)}" aria-label="Run ${esc(z.name)} now">▶ Run</button></div>`).join("")}</div>
        ${admin ? `<div class="actions" style="justify-content:flex-start"><button class="btn" data-irr="editzones">Edit valves</button></div>` : ""}`;
    }
    const progs = d.programs.map((p, i) => `<div class="sched" data-pi="${i}" style="grid-template-columns:auto 1fr auto">
        <label class="switch" title="Enabled"><input type="checkbox" data-pk2="enabled" ${p.enabled ? "checked" : ""} aria-label="Program ${i + 1} on"><span></span></label>
        <span class="row2"><span class="muted small">Start</span><input type="time" data-pk2="start" value="${esc(p.start)}" aria-label="Start time">
          <button class="btn" data-irr="runprog" data-pid="${esc(p.id || "")}" ${p.id ? "" : "disabled"} style="padding:5px 10px">▶ Now</button></span>
        <button class="iconbtn" data-irr="pdel" aria-label="Remove program"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        <div class="days">${["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((dn, di) => `<button data-irr="pday" data-dn="${di}" aria-pressed="${p.days.includes(di)}">${dn}</button>`).join("")}</div>
        <div class="chips" style="grid-column:2/-1"><button class="pchip" data-irr="pzall" aria-pressed="${!p.zones.length}">All valves</button>
          ${d.zones.map((z) => `<button class="pchip" data-irr="pz" data-zid="${esc(z.id)}" aria-pressed="${p.zones.includes(z.id)}">${esc(z.name)}</button>`).join("")}</div></div>`).join("");
    el.innerHTML = `
      <div class="sub2">Valves <span class="r muted small">${edit ? "name · valve switch · minutes" : "minutes per valve"}</span></div>${zones}
      ${d.zones.length ? `<div class="sub2">Programs <span class="r muted small">waters the valves one after another</span></div>
      ${progs || `<div class="muted small" style="padding:6px 0">No programs – valves only run when you press Run.</div>`}
      <div class="actions" style="justify-content:flex-start"><button class="btn" data-irr="padd">+ Add program</button></div>
      <div class="field"><label for="irr-amount">Watering amount<span class="hint">scales every valve's time – e.g. 60% in winter</span></label><span class="ctl"><input id="irr-amount" type="number" data-ik="amount" value="${d.amount}" min="0" max="300" step="5">%</span></div>
      <div class="field"><label for="irr-rain">Skip programs when it rains<span class="hint">${d.rain_entity ? esc(d.rain_entity) : "needs a rain sensor or weather entity (installer)"}</span></label><span class="switch"><input id="irr-rain" type="checkbox" data-ik="skip_when_raining" ${d.skip_when_raining ? "checked" : ""}><span></span></span></div>
      ${admin ? `<details style="margin-top:8px"><summary>Installer settings</summary><div class="irrform">
        <div class="field"><label>Pump / master valve<span class="hint">runs while a valve is open (borehole pump, master valve)</span></label>${sel("pump_entity", opts.valves, d.pump_entity, "None")}</div>
        <div class="field"><label>Rain sensor or weather</label>${sel("rain_entity", opts.rain, d.rain_entity, "None")}</div>
        <div class="field"><label for="irr-auto">Valve opened by hand closes after its time</label><span class="switch"><input id="irr-auto" type="checkbox" data-ik="manual_auto_off" ${d.manual_auto_off ? "checked" : ""}><span></span></span></div>
        <div class="field"><label for="irr-max">Never run a valve longer than</label><span class="ctl"><input id="irr-max" type="number" data-ik="max_minutes" value="${d.max_minutes}" min="1" max="480">min</span></div></div></details>` : ""}
      <div class="sub2">Today</div><div class="logl" id="irrlog"></div>` : ""}`;
    el.querySelectorAll("[data-zk]").forEach((inp) => {
      const up = () => { const z = d.zones[Number(inp.closest("[data-zi]").dataset.zi)]; const k = inp.dataset.zk; if (k === "minutes" && inp.value === "") return;
        z[k] = k === "minutes" ? Number(inp.value) : inp.value;
        if (k === "entity" && !z.name) { const o = (this._irrOpts?.valves || []).find((x) => x.id === inp.value); if (o) { z.name = o.name; inp.closest(".zedit").querySelector("[data-zk=name]").value = o.name; } }
        this._irrChanged(); };
      inp.addEventListener("input", up); inp.addEventListener("change", up);
    });
    el.querySelectorAll("[data-pk2]").forEach((inp) => {
      const up = () => { const p = d.programs[Number(inp.closest("[data-pi]").dataset.pi)]; p[inp.dataset.pk2] = inp.type === "checkbox" ? inp.checked : inp.value; this._irrChanged(); };
      inp.addEventListener("input", up); inp.addEventListener("change", up);
    });
    el.querySelectorAll("[data-ik]").forEach((inp) => {
      const up = () => { const k = inp.dataset.ik; if (inp.type === "number" && inp.value === "") return;
        d[k] = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Number(inp.value) : inp.value; this._irrChanged(); };
      inp.addEventListener("input", up); inp.addEventListener("change", up);
    });
    this._renderIrrLive();
  },

  async _irrClick(b) {
    const act = b.dataset.irr, d = this._irrDraft, $ = (id) => this.shadowRoot.getElementById(id);
    const call = async (msg) => {
      try { this._irr = await this._hass.callWS(msg); this._renderIrr(); return true; }
      catch (e) { const m = $("irrmsg"); if (m && !$("irract").hidden) { m.textContent = e.message || "Failed"; m.className = "msg err"; } else alert(e.message || e); return false; }
    };
    const action = (a, extra = {}) => call({ type: `${DOMAIN}/irrigation_action`, action: a, ...extra });
    const zi = () => Number(b.closest("[data-zi]").dataset.zi), pi = () => Number(b.closest("[data-pi]").dataset.pi);
    const redraw = () => { this._irrChanged(); this._renderIrrForm(); };
    switch (act) {
      case "runall": return action("run_all");
      case "stop": return action("stop");
      case "skip": return action("skip_zone");
      case "delay": return action("rain_delay", { hours: Number(b.dataset.h) });
      case "runzone": { const z = d.zones.find((x) => x.id === b.dataset.zid); return action("run_zone", { zone: b.dataset.zid, minutes: z ? z.minutes : undefined }); }
      case "runprog": return action("run_program", { program: b.dataset.pid });
      case "editzones": this._irrEdit = true; return this._renderIrrForm();   // keeps unsaved changes
      case "editdone": this._irrEdit = false; return this._renderIrrForm();
      case "zadd": d.zones.push({ id: "", name: "", entity: "", minutes: 10, enabled: true }); this._irrEdit = true; return redraw();
      case "zdel": { const z = d.zones.splice(zi(), 1)[0]; d.programs.forEach((p) => { p.zones = p.zones.filter((x) => x !== z.id); }); return redraw(); }
      case "zup": case "zdown": { const i = zi(), j = act === "zup" ? i - 1 : i + 1; [d.zones[i], d.zones[j]] = [d.zones[j], d.zones[i]]; return redraw(); }
      case "padd": d.programs.push({ id: "", enabled: true, days: [0, 2, 4], start: "05:30", zones: [] }); return redraw();
      case "pdel": d.programs.splice(pi(), 1); return redraw();
      case "pday": { const p = d.programs[pi()], day = Number(b.dataset.dn); p.days = p.days.includes(day) ? p.days.filter((x) => x !== day) : [...p.days, day].sort(); return redraw(); }
      case "pzall": d.programs[pi()].zones = []; return redraw();
      case "pz": { const p = d.programs[pi()], id = b.dataset.zid; if (!id) return; p.zones = p.zones.includes(id) ? p.zones.filter((x) => x !== id) : [...p.zones, id]; return redraw(); }
      case "discard": this._irrDirty = false; this._irrEdit = false; $("irract").hidden = true; this._irrShown = null; return this._renderIrr();
      case "save": {
        if (d.zones.some((z) => !z.entity && this._isAdmin)) { const m = $("irrmsg"); m.textContent = "Pick a valve switch for every valve"; m.className = "msg err"; return; }
        const settings = { zones: d.zones, programs: d.programs, amount: d.amount, skip_when_raining: d.skip_when_raining };
        if (this._isAdmin) Object.assign(settings, { pump_entity: d.pump_entity, rain_entity: d.rain_entity, manual_auto_off: d.manual_auto_off, max_minutes: d.max_minutes });
        this.shadowRoot.activeElement?.blur?.();
        const ok = await call({ type: `${DOMAIN}/irrigation_settings`, settings });
        if (ok) { this._irrDirty = false; this._irrEdit = false; $("irract").hidden = true; this._irrShown = null; this._renderIrr(); }
        return;
      }
      default: return undefined;
    }
  },
});

customElements.define("hamlet-home-panel", HamletHomePanel);
