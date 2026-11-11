/* Hamlet Home – sidebar app. Tabs: Energy, Costs, Weather, Water, Geyser, Controls. No build step. */
const DOMAIN = "hamlet_home";
const VERSION = new URL(import.meta.url).searchParams.get("v") || String(Date.now());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtL = (l) => (l === null || l === undefined ? "–" : l >= 10000 ? `${(l / 1000).toFixed(1)} kL` : l >= 1000 ? `${(l / 1000).toFixed(2)} kL` : `${Math.round(l)} L`);
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
.foot { max-width: 1280px; margin: 0 auto; padding: 4px 16px 24px; display: flex; justify-content: center; }
.footbtn { background: transparent; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 8px;
  color: var(--muted); font: inherit; font-size: 12px; opacity: .8; }
.footbtn:hover { opacity: 1; background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
.footbtn img { height: 26px; width: auto; display: block; }
:host([dark]) .footbtn img { filter: invert(1); }
.helpbtn { background: transparent; border: 0; color: inherit; opacity: .8; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; flex: none; }
.helpbtn ha-icon { --mdc-icon-size: 24px; }
.helpbtn:hover, .helpbtn[aria-pressed="true"] { opacity: 1; background: rgba(255,255,255,.15); }
.bell { position: relative; }
.bdot { position: absolute; top: 2px; right: 2px; min-width: 10px; height: 10px; padding: 0 3px; border-radius: 999px; background: #e34948; color: #fff; font-size: 9px; line-height: 10px; font-weight: 700; text-align: center; }
.bell.ringing ha-icon { animation: ring 1.2s ease-in-out infinite; transform-origin: 50% 10%; }
@keyframes ring { 0%, 50%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(14deg); } 20%, 40% { transform: rotate(-14deg); } }
.apop { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.apop[hidden] { display: none; }
.apbox { background: var(--card); color: var(--primary-text-color); width: min(440px, 100%); border-radius: 16px; padding: 18px; box-shadow: 0 16px 48px rgba(0,0,0,.35); border-top: 6px solid #e34948; animation: pop .25s ease-out; }
@keyframes pop { from { transform: scale(.92); opacity: 0; } to { transform: none; opacity: 1; } }
.aphd { display: flex; align-items: center; gap: 10px; font-size: 18px; margin-bottom: 10px; }
.aphd ha-icon { color: #e34948; --mdc-icon-size: 28px; animation: ring 1.2s ease-in-out infinite; }
.apitem { border-left: 4px solid; padding: 6px 10px; margin: 8px 0; font-size: 14px; } .apitem div { color: var(--muted); font-size: 13px; margin-top: 2px; }
.apbtns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.apb { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.apb.primary { background: #e34948; border-color: transparent; color: #fff; }
@media (prefers-reduced-motion: reduce) { .bell.ringing ha-icon, .aphd ha-icon, .apbox { animation: none; } }
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
.finfo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
.ftile { font: inherit; text-align: left; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0 10px; min-width: 0; }
.ftile ha-icon { --mdc-icon-size: 22px; color: var(--c-batt); grid-row: span 2; }
.ftile .n { font-size: 13px; color: var(--muted); line-height: 1.2; overflow-wrap: anywhere; }
.ftile .v { font-size: 20px; font-variant-numeric: tabular-nums; }
.ftile .pen { --mdc-icon-size: 16px; color: var(--muted); grid-row: span 2; }
button.ftile { cursor: pointer; } button.ftile:hover { border-color: var(--accent); }
.fedit { border: 1px solid var(--accent); border-radius: 10px; padding: 12px; margin-top: 10px; }
.fedit .row { display: flex; align-items: center; gap: 10px; margin: 10px 0 4px; }
.fedit input[type=range] { flex: 1; accent-color: var(--accent); }
.fedit .val { font-size: 22px; min-width: 70px; text-align: center; font-variant-numeric: tabular-nums; }
.fedit .ib { font: inherit; width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--primary-text-color); cursor: pointer; font-size: 18px; }
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
.zgrid.sp { grid-template-columns: minmax(0, 1fr) auto auto auto; }
@media (max-width: 520px) { .zgrid.sp input[type=number] { width: 56px; } .zgrid.sp .btn { padding: 6px 8px; } }
.zrow { display: contents; }
.zgrid input[type=number] { width: 70px; }
.zrow > * { padding: 9px 0; border-bottom: 1px solid var(--line); }
.zname { display: flex; align-items: center; gap: 10px; min-width: 0; }
.zname .t { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zname .z2 { font-size: 12px; color: var(--muted); }
.wpwrap { display: flex; gap: 16px; align-items: flex-start; }
.wpmain { flex: 1; min-width: 0; }
#wcard { flex: 0 0 auto; width: min(400px, 100%); }
@media (max-width: 1100px) { .wpwrap { flex-direction: column; } #wcard { width: 100%; max-width: 480px; margin: 0 auto; } }
#wcardyaml { width: 100%; box-sizing: border-box; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; background: var(--card2, rgba(127,127,127,.08)); color: var(--primary-text-color); border: 1px solid var(--line); border-radius: 8px; padding: 10px; resize: vertical; }
.fcurve { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.fpt { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.fpt input, #wflowbody .ctl input { width: 76px; }
.zdot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); flex: none; }
.zdot.on { background: var(--c-load); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-load) 25%, transparent); animation: pulse 1.6s infinite; }
.zdot.na { background: var(--c-warn); }
.zedit { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(160px, 1.4fr) auto auto auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.zedit input[type=number] { width: 70px; }
@media (max-width: 640px) { .zedit { grid-template-columns: 1fr 1fr; } }
.zedit select, .irrform select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); max-width: 100%; }
.zedit input[type=text] { width: 100%; }
.vpick { position: relative; min-width: 0; }
.vpick .vq { width: 100%; box-sizing: border-box; }
.vlist { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); max-height: 260px; overflow-y: auto; background: var(--card-background-color, #1c1f2b); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
.vlist .vo { display: block; width: 100%; text-align: left; padding: 7px 10px; border: 0; background: none; color: var(--primary-text-color); font: inherit; font-size: 14px; cursor: pointer; }
.vlist .vo small { display: block; opacity: .6; font-size: 11px; }
.vlist .vo.on, .vlist .vo:hover { background: rgba(80,140,255,.18); }
.vlist .vo.cur { font-weight: 600; }
.vlist .none { padding: 8px 10px; opacity: .65; font-size: 13px; }
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
/* water diagram: supply -> booster pump -> house + irrigation valves */
.wdia { position: relative; width: 100%; max-width: 760px; margin: 16px auto 0; --c-water: #1f8fd0; }
.wdia svg { display: block; width: 100%; height: auto; overflow: visible; }
.wdia .pipe { fill: none; stroke: var(--line); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; }
.wdia .wet { fill: none; stroke: color-mix(in srgb, var(--c-water) 35%, transparent); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .4s; }
.wdia .drops { fill: none; stroke: var(--c-water); stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 1 11; opacity: 0; }
.wdia .on .wet, .wdia .on .drops { opacity: 1; }
.wdia .on .drops { animation: wrun 1.1s linear infinite; }
@keyframes wrun { to { stroke-dashoffset: -24; } }
.wdia .imp { transform-box: fill-box; transform-origin: center; }
.wdia .spin .imp { animation: wspin .7s linear infinite; }
@keyframes wspin { to { transform: rotate(360deg); } }
.wdia .wave { animation: wwave 3s ease-in-out infinite alternate; }
@keyframes wwave { to { transform: translateX(-12px); } }
.wdia .spray circle { fill: var(--c-water); opacity: 0; }
.wdia .on .spray circle { animation: wspray 1.2s ease-out infinite; }
.wdia .on .spray circle:nth-child(2) { animation-delay: .4s; } .wdia .on .spray circle:nth-child(3) { animation-delay: .8s; }
@keyframes wspray { 0% { opacity: .9; transform: translate(0, 0); } 100% { opacity: 0; transform: translate(var(--dx), -16px); } }
.wdia .lbl { fill: var(--muted); font-size: 11px; text-anchor: middle; }
.wdia .lbl.on { fill: var(--primary-text-color); font-weight: 500; }
.wdia .val { fill: var(--primary-text-color); font-size: 12px; text-anchor: middle; font-variant-numeric: tabular-nums; }
.wdia .ic { position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--card); border: 2px solid var(--line); color: var(--muted); transition: border-color .3s, color .3s; }
.wdia .ic ha-icon { --mdc-icon-size: 19px; }
.wdia .ic.on { border-color: var(--c-water); color: var(--c-water); }
.wdia .wzhit { position: absolute; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; border-radius: 12px; -webkit-tap-highlight-color: transparent; }
.wdia .wzhit:hover, .wdia .wzhit:focus-visible { background: color-mix(in srgb, var(--c-water) 10%, transparent); outline: none; }
.wdia .wzhit:active { background: color-mix(in srgb, var(--c-water) 18%, transparent); }
#zsheet { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
#zsheet .zback { position: absolute; inset: 0; background: rgba(0,0,0,.45); }
#zsheet .zbox { position: relative; width: min(380px, calc(100% - 24px)); margin-bottom: max(12px, env(safe-area-inset-bottom)); background: var(--card); color: var(--primary-text-color);
  border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px 12px; box-shadow: 0 10px 40px rgba(0,0,0,.4); display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 700px) { #zsheet { align-items: center; } }
#zsheet .zhd { display: flex; align-items: center; gap: 10px; font-size: 17px; }
#zsheet .zhd ha-icon { color: #1f8fd0; } #zsheet .zhd b { flex: 1; font-weight: 600; }
#zsheet .zst { margin: 0; color: #1f8fd0; font-weight: 500; } #zsheet .zst.bad { color: var(--c-bad, #d33); }
#zsheet .zmin { display: flex; align-items: center; justify-content: center; gap: 22px; font-size: 18px; }
#zsheet .zmin b { font-size: 34px; font-variant-numeric: tabular-nums; }
#zsheet .btn.round { width: 48px; height: 48px; border-radius: 50%; font-size: 24px; padding: 0; }
#zsheet .zquick { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
#zsheet .zquick .pchip { min-width: 46px; min-height: 36px; }
#zsheet .btn.big { min-height: 50px; font-size: 16px; width: 100%; }
#zsheet .btn.danger { background: var(--c-bad, #d33); color: #fff; border-color: transparent; }
#zsheet .zmsg { margin: 0; min-height: 0; } #zsheet .zmsg:empty { display: none; }
.wdia .ic.bad { border-color: var(--c-bad); color: var(--c-bad); }
/* pool diagram */
.pdia { position: relative; width: 100%; margin: 4px auto 0; --c-water: #1f8fd0; --c-heat: #eb6834; }
.pdia svg { display: block; width: 100%; height: auto; overflow: visible; }
.pdia .pipe { fill: none; stroke: var(--line); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; }
.pdia .wet { fill: none; stroke: color-mix(in srgb, var(--c-water) 35%, transparent); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
.pdia .drops { fill: none; stroke: var(--c-water); stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 1 11; opacity: 0; }
.pdia .on .wet, .pdia .on .drops { opacity: 1; } .pdia .on .drops { animation: wrun 1.1s linear infinite; }
.pdia .hot .drops { stroke: var(--c-heat); }
.pdia .imp { transform-box: fill-box; transform-origin: center; } .pdia .spin .imp { animation: wspin .7s linear infinite; }
.pdia .wv1 { animation: pwave 4s ease-in-out infinite alternate; } .pdia .wv2 { animation: pwave 5.5s ease-in-out infinite alternate-reverse; }
@keyframes pwave { from { transform: translateX(-24px); } to { transform: translateX(0); } }
.pdia .bub { fill: #fff; opacity: 0; } .pdia .chl .bub { animation: pbub 2.4s ease-in infinite; }
@keyframes pbub { 0% { opacity: 0; transform: translateY(0); } 15% { opacity: .8; } 100% { opacity: 0; transform: translateY(-46px); } }
.pdia .glow { opacity: 0; transition: opacity .6s; } .pdia .lit .glow { opacity: 1; animation: pglow 3s ease-in-out infinite alternate; }
@keyframes pglow { to { opacity: .6; } }
.pdia .bot { transform-box: fill-box; } .pdia .clean .bot { animation: pbot 9s ease-in-out infinite alternate; }
@keyframes pbot { to { transform: translateX(var(--run)); } }
.pdia .lbl { fill: var(--muted); font-size: 11px; text-anchor: middle; } .pdia .lbl.on { fill: var(--primary-text-color); font-weight: 500; }
.pdia .tmp { fill: #fff; font-size: 30px; font-weight: 300; text-anchor: middle; font-variant-numeric: tabular-nums; paint-order: stroke; stroke: rgba(0,0,0,.12); stroke-width: 2px; }
.pdia .tmp tspan { font-size: 14px; }
.pdia .tsub { fill: #fff; font-size: 11px; text-anchor: middle; opacity: .9; }
.pdia .ic { position: absolute; transform: translate(-50%, -50%); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--card); border: 2px solid var(--line); color: var(--muted); transition: border-color .3s, color .3s; }
.pdia .ic ha-icon { --mdc-icon-size: 20px; } .pdia .ic.on { border-color: var(--c-water); color: var(--c-water); }
.pdia .ic.hot { border-color: var(--c-heat); color: var(--c-heat); animation: pulse 1.6s ease-in-out infinite; }
.pdia .ic.bad { border-color: var(--c-bad); color: var(--c-bad); }
@media (prefers-reduced-motion: reduce) { .pdia .on .drops, .pdia .spin .imp, .pdia .wv1, .pdia .wv2, .pdia .chl .bub, .pdia .lit .glow, .pdia .clean .bot, .pdia .ic.hot { animation: none; } }
@media (prefers-reduced-motion: reduce) { .wdia .on .drops, .wdia .spin .imp, .wdia .wave, .wdia .on .spray circle { animation: none; } .wdia .on .drops { stroke-dasharray: none; opacity: .5; } }
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
    if (this._pcEl) this._pcEl.hass = hass;
    if (this._tab === "energy" && this._snap && !first) this._renderFlowInfo();
    this.shadowRoot.querySelectorAll("hamlet-geyser-card, hamlet-geyser-panel, hamlet-home-controls, hamlet-home-weather, hamlet-home-costs, hamlet-home-devices, hamlet-home-help, hamlet-home-blocks, hamlet-home-scene, hamlet-home-property, hamlet-home-alarms").forEach((c) => { c.hass = hass; });
    if (first) this._init();
  }
  set narrow(v) { this._narrow = v; if (this._menu) this._menu.narrow = v; }
  set panel(v) {
    this._panel = v;
    const t = this.shadowRoot?.getElementById("apptitle");
    if (t) t.textContent = v?.config?.title || "Hamlet Home";
  }
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
      <div class="toolbar"><span id="menu"></span><div class="title" id="apptitle">${esc(this._panel?.config?.title || "Hamlet Home")}</div><div class="tabs" role="tablist" id="tabs"></div>
        <button class="helpbtn bell" id="bellbtn" aria-label="Alarms" title="Alarms"><ha-icon icon="mdi:bell-outline"></ha-icon><span class="bdot" id="bdot" hidden></span></button>
        <button class="helpbtn" id="helpbtn" aria-label="Help" title="Help"><ha-icon icon="mdi:help-circle-outline"></ha-icon></button></div>
      <div class="apop" id="apop" hidden role="alertdialog" aria-modal="true" aria-labelledby="apoptitle"><div class="apbox"><div class="aphd"><ha-icon icon="mdi:alarm-light"></ha-icon><b id="apoptitle">Alarm</b></div>
        <div id="apoplist"></div><div class="apbtns"><button class="apb" id="apopen">Alarm settings</button><button class="apb primary" id="apok">OK, seen</button></div></div></div>
      <main id="main"><div class="loading">Loading…</div></main>
      <footer class="foot"><button class="footbtn" id="footbtn" title="Help and contact details">
        <span>Installed and supported by</span><img src="/hamlet_home_static/logo.png?v=${VERSION}" alt="Hamlet Elektries" height="26" loading="lazy"></button></footer>`;
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
    root.getElementById("helpbtn").addEventListener("click", () => { this._tab = "help"; this._buildTab(); });
    root.getElementById("bellbtn").addEventListener("click", () => { this._tab = "alarms"; this._buildTab(); });
    root.getElementById("apok").addEventListener("click", () => this._ackAlarms());
    root.getElementById("apopen").addEventListener("click", () => { this._ackAlarms(); this._tab = "alarms"; this._buildTab(); });
    root.getElementById("footbtn").addEventListener("click", () => { this._tab = "help"; this._buildTab(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    this.shadowRoot.addEventListener("hamlet-help-contact", (ev) => { this._helpContact = ev.detail; });
    this._main.addEventListener("click", (ev) => this._click(ev));
    await this._load();
    this._subscribe();
  }

  async _load() {
    try {
      const s = await this._hass.callWS({ type: `${DOMAIN}/state` });
      this._isAdmin = s.is_admin;
      this._geyser = s.geyser_available || s.geyser_installed;
      this._geyserVer = s.geyser_version || "";
      this._weather = !!s.weather_available;
      this._devices = s.devices || [];
      this._updates = s.updates || [];
      this._helpContact = s.help_contact;
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
    const tabs = [["energy", "mdi:lightning-bolt", "Energy"], ["property", "mdi:home-variant-outline", "Property"], ["costs", "mdi:cash-multiple", "Costs"]];
    if (this._weather) tabs.push(["weather", "mdi:weather-partly-cloudy", "Weather"]);
    const wf = this._water?.features || {};
    const poolDevs = (this._devices || []).filter((d) => d.area === "pool");
    if (wf.pump_switch || wf.pump_power || wf.pump_hz || wf.water_pressure || this._irr?.zones?.length || this._isAdmin) tabs.push(["water", "mdi:sprinkler-variant", "Irrigation"]);
    if (wf.pool_switch || wf.pool_power || wf.pool_temp || poolDevs.length || this._isAdmin) tabs.push(["pool", "mdi:pool", "Pool"]);
    if (this._geyser) tabs.push(["geyser", "mdi:water-boiler", "Geyser"]);
    if ((this._devices || []).some((d) => d.area !== "pool") || this._isAdmin) tabs.push(["devices", "mdi:power-plug", "Devices"]);
    tabs.push(["controls", "mdi:light-switch", "Controls"]);
    if (!tabs.some((t) => t[0] === this._tab) && this._tab !== "help" && this._tab !== "alarms") this._tab = "energy";
    this.shadowRoot.getElementById("tabs").innerHTML = tabs.length < 2 ? "" : tabs.map(([id, icon, label]) =>
      `<button role="tab" data-tab="${id}" aria-selected="${this._tab === id}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("");
  }

  _buildTab() {
    this._built = true;
    this._ro?.disconnect();
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === this._tab));
    this.shadowRoot.getElementById("helpbtn")?.setAttribute("aria-pressed", this._tab === "help");
    this.shadowRoot.getElementById("bellbtn")?.setAttribute("aria-pressed", this._tab === "alarms");
    if (this._tab === "geyser") return this._buildGeyser();
    if (this._tab === "water") return this._buildWater();
    if (this._tab === "pool") return this._buildPool();
    if (this._tab === "property") return this._buildProperty();
    if (this._tab === "controls") return this._buildControls();
    if (this._tab === "weather") return this._buildModule("weather");
    if (this._tab === "costs") return this._buildModule("costs");
    if (this._tab === "devices") return this._buildModule("devices");
    if (this._tab === "help") return this._buildModule("help");
    if (this._tab === "alarms") return this._buildModule("alarms");
    this._main.innerHTML = `
      <div class="card note" id="note" hidden style="grid-column:1/-1"></div>
      <div id="updbar" style="display:contents"></div>
      <section class="card s7" id="flowcard"><h2>Power flow <span class="sub"><span id="flowsub"></span><span class="seg" id="fstyleseg"><button data-fstyle="blocks">Blocks</button><button data-fstyle="circles">Circles</button><button data-fstyle="scene">Scene</button></span></span></h2><div id="flow"></div><div id="flowinfo"></div></section>
      <section class="card s5" id="todaycard"><h2>Today <span class="sub" id="todaysub"></span></h2><div id="batt"></div><div id="today"></div><div id="battset"></div></section>
      <div id="solfc" style="display:contents"></div>
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
        <p class="muted small">Battery should be + while charging and grid + while buying. Change sensors or flip signs in Settings → Devices &amp; services → Hamlet Home → Configure.</p></details>
        <details style="margin-top:10px" id="upddet"><summary>Installer: app updates</summary><div id="updstat"></div></details></section>`;
    this._flowBuilt = null;
    this._tariffShown = null;
    this._battShown = null;
    this._ro = new ResizeObserver(() => { this._renderChart(); this._renderHistory(); });
    this._ro.observe(this.shadowRoot.getElementById("chart"));
    if (this._snap) { this._apply(this._snap); this._renderChart(); this._renderHistory(); this._renderRaw(); }
    this._renderUpdates();
    this._addSolarForecast();
  }

  async _addSolarForecast() {
    // the Weather tab's solar forecast card, also shown here (hides itself without a forecast sensor)
    if (!this._weather) return;
    if (!customElements.get("hamlet-home-weather")) {
      try { await import(`/hamlet_home_static/hamlet-home-weather.js?v=${VERSION}`); } catch (e) { return; }
    }
    const holder = this.shadowRoot.getElementById("solfc");
    if (!holder || this._tab !== "energy" || holder.firstChild) return;
    const el = document.createElement("hamlet-home-weather");
    el.setAttribute("section", "solar");
    el.hass = this._hass;
    holder.appendChild(el);
  }

  // alarms: red dot on the bell, and a pop-up for anything not yet seen (on every tab)
  _renderAlarms(active) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const list = active || [];
    const dot = $("bdot"); if (!dot) return;
    dot.hidden = !list.length;
    dot.textContent = list.length > 1 ? String(list.length) : "";
    $("bellbtn").classList.toggle("ringing", list.some((a) => !a.acked));
    const fresh = list.filter((a) => !a.acked);
    const pop = $("apop");
    if (!fresh.length) { pop.hidden = true; return; }
    const col = { critical: "#e34948", warning: "#eda100", info: "#2a78d6" };
    $("apoptitle").textContent = fresh.length > 1 ? `${fresh.length} alarms` : fresh[0].name;
    const html = fresh.map((a) => `<div class="apitem" style="border-color:${col[a.level] || col.info}"><b>${esc(a.name)}</b><div>${esc(a.text)}</div></div>`).join("");
    if (this._apopHtml !== html) { this._apopHtml = html; $("apoplist").innerHTML = html; }
    pop.hidden = false;
  }

  async _ackAlarms() {
    this.shadowRoot.getElementById("apop").hidden = true;
    try { const r = await this._hass.callWS({ type: `${DOMAIN}/alarms_ack` }); this._renderAlarms(r.active); } catch (e) { /* ignore */ }
  }

  async _buildModule(name) {
    this._main.innerHTML = `<div class="loading">Loading ${name}…</div>`;
    if (!customElements.get(`hamlet-home-${name}`)) {
      try { await import(`/hamlet_home_static/hamlet-home-${name}.js?v=${VERSION}`); }
      catch (e) { this._main.innerHTML = `<div class="card loading">This page couldn't load – restart Home Assistant after updating, then refresh.</div>`; return; }
    }
    if (this._tab !== name) return;
    const el = document.createElement(`hamlet-home-${name}`);
    el.hass = this._hass;
    this._main.innerHTML = "";
    this._main.appendChild(el);
    if (el.update) el.update({ ...(this._snap || {}), devices: this._devices || [], solar_loads: this._solar, is_admin: this._isAdmin, help_contact: this._helpContact });
  }

  async _buildControls() {
    this._main.innerHTML = `<div class="loading">Loading controls…</div>`;
    if (!customElements.get("hamlet-home-controls")) {
      try { await import(`/hamlet_home_static/hamlet-home-controls.js?v=${VERSION}`); }
      catch (e) { this._main.innerHTML = `<div class="card loading">Controls couldn't load – restart Home Assistant after updating, then refresh.</div>`; return; }
    }
    if (this._tab !== "controls") return;
    const el = document.createElement("hamlet-home-controls");
    el.isAdmin = this._isAdmin;
    el.gridAvailable = this._snap?.live?.grid_available;
    el.hass = this._hass;
    this._main.innerHTML = "";
    this._main.appendChild(el);
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
      // versioned so an updated Hamlet Geyser page isn't served from the browser's cache
      try { await import(`/hamlet_geyser_static/hamlet-geyser-panel.js?v=${encodeURIComponent(this._geyserVer || VERSION)}`); }
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
    const fs = ev.target.closest("[data-fstyle]");
    if (fs) {
      this._fstyle = fs.dataset.fstyle;
      try { localStorage.setItem("hamlet_home_flowstyle", this._fstyle); } catch (e) { /* ignore */ }
      return this._renderFlow();
    }
    const up = ev.target.closest("[data-upd]");
    if (up) return this._updateClick(up);
    const fi = ev.target.closest("[data-fi]");
    if (fi) return this._flowInfoClick(fi);
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
    if (s.devices !== undefined) this._devices = s.devices;
    if (s.alarms) { this._renderAlarms(s.alarms.active); if (this._tab === "alarms") this.shadowRoot.querySelector("hamlet-home-alarms")?.update?.(s); }
    if (this._tab === "water") return this._renderWater();
    if (this._tab === "property") return this._renderProperty();
    if (this._tab === "pool") { this._renderWater(); const d = this.shadowRoot.querySelector("hamlet-home-devices"); if (d) d.update(s); return; }
    if (this._tab === "devices") { const d = this.shadowRoot.querySelector("hamlet-home-devices"); if (d) d.update(s); return; }
    if (this._tab === "weather" || this._tab === "costs" || this._tab === "help" || this._tab === "alarms") return;
    if (this._tab === "controls") {
      const c = this.shadowRoot.querySelector("hamlet-home-controls");
      if (c) c.gridAvailable = s.live?.grid_available;
      return;
    }
    if (this._tab !== "energy" || !this.shadowRoot.getElementById("flow")) return;
    const note = this.shadowRoot.getElementById("note");
    if (!s.ready) { note.hidden = false; note.textContent = "Reading today's history from Home Assistant… this takes a few seconds after a restart."; }
    else if (s.note && this._isAdmin) { note.hidden = false; note.textContent = s.note; }
    else note.hidden = true;
    this._renderFlow();
    this._renderFlowInfo();
    this._renderBattery();
    this._renderToday();
    this._renderTariff();
    this._renderPrio();
    const inst = this.shadowRoot.getElementById("installer");
    if (inst) inst.hidden = !this._isAdmin;
    if (inst && inst.querySelector("details").open) this._renderRaw();
  }

  /* -------------------------------------------------------- power flow */
  _flowStyle() {
    if (this._fstyle) return this._fstyle;
    try { this._fstyle = localStorage.getItem("hamlet_home_flowstyle") || "blocks"; } catch (e) { this._fstyle = "blocks"; }
    return this._fstyle;
  }

  async _renderBlocks() {
    const box = this.shadowRoot.getElementById("flow"); if (!box) return;
    if (!customElements.get("hamlet-home-blocks")) {
      if (!this._blocksLoading) this._blocksLoading = import(`/hamlet_home_static/hamlet-home-blocks.js?v=${VERSION}`).catch(() => null);
      await this._blocksLoading;
      if (!customElements.get("hamlet-home-blocks")) { this._fstyle = "circles"; return this._renderFlow(); }
    }
    let el = box.querySelector("hamlet-home-blocks");
    if (!el) { box.innerHTML = ""; this._flowBuilt = null; el = document.createElement("hamlet-home-blocks"); box.appendChild(el); }
    el.hass = this._hass;
    const s = this._snap;
    el.data = { live: s.live, features: s.features, extras: s.extras, battery: s.battery, flow_entities: s.flow_entities, rows: this._rows?.today };
  }

  // "Scene": the house drawn as a picture, with the same live readings
  async _renderScene() {
    const box = this.shadowRoot.getElementById("flow"); if (!box) return;
    if (!customElements.get("hamlet-home-scene")) {
      if (!this._sceneLoading) this._sceneLoading = import(`/hamlet_home_static/hamlet-home-scene.js?v=${VERSION}`).catch(() => null);
      await this._sceneLoading;
      if (!customElements.get("hamlet-home-scene")) { this._fstyle = "blocks"; return this._renderFlow(); }
    }
    let el = box.querySelector("hamlet-home-scene");
    if (!el) { box.innerHTML = ""; this._flowBuilt = null; el = document.createElement("hamlet-home-scene"); box.appendChild(el); }
    el.hass = this._hass;
    const s = this._snap;
    el.data = { live: s.live, features: s.features, extras: s.extras, battery: s.battery, entities: s.flow_entities, geysers: s.geysers };
  }

  _renderFlow() {
    const style = this._flowStyle();
    if (style === "scene") {
      const fc = this.shadowRoot.getElementById("flowcard"), tc = this.shadowRoot.getElementById("todaycard");
      if (fc) fc.classList.remove("s7");
      if (tc) tc.classList.remove("s5");
      this.shadowRoot.querySelectorAll("[data-fstyle]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fstyle === style));
      const sub = this.shadowRoot.getElementById("flowsub");
      if (sub) sub.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return this._renderScene();
    }
    const blocks = style === "blocks";
    const fc = this.shadowRoot.getElementById("flowcard"), tc = this.shadowRoot.getElementById("todaycard");
    if (fc) fc.classList.toggle("s7", !blocks);
    if (tc) tc.classList.toggle("s5", !blocks);
    this.shadowRoot.querySelectorAll("[data-fstyle]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fstyle === this._flowStyle()));
    if (blocks) {
      if (this.shadowRoot.querySelector("#flow hamlet-home-scene")) this.shadowRoot.getElementById("flow").innerHTML = "";
      this._renderBlocks();
      const sub = this.shadowRoot.getElementById("flowsub");
      if (sub) sub.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return;
    }
    if (this.shadowRoot.querySelector("#flow hamlet-home-blocks, #flow hamlet-home-scene")) { this.shadowRoot.getElementById("flow").innerHTML = ""; this._flowBuilt = null; }
    const s = this._snap, L = s.live || {}, f = s.features || {};
    // like the old card: a load drawing nothing (or not reporting) is left out until it uses power again
    // grid-side loads first, so they sit at the top next to the Non-essential circle
    const extras = (s.extras || []).filter((e) => num(e.w) !== null && Number(e.w) >= 1)
      .sort((a, b) => (b.side === "noness") - (a.side === "noness")).slice(0, 4);
    const box = this.shadowRoot.getElementById("flow"); if (!box) return;
    const split = !!(f.pv_ac || f.pv_dc);
    const hasGrid = !!(f.grid || f.grid_status);
    const lsplit = !!f.load_split;   // Victron style: essential (AC-out) vs non-essential (grid side) loads
    const shape = `${split}|${f.pv_ac}|${f.pv_dc}|${f.battery}|${hasGrid}|${lsplit}|${extras.map((e) => `${e.name}:${e.side}`).join("|")}`;
    // Layouts in a 400-wide box. Split: grid-tie PV into the roof, MPPTs on the DC bus between battery and inverter.
    const H = split ? 390 : 320;
    const home = split ? [200, 158] : [200, 160];
    const P = split
      ? { pvac: [200, 44], grid: [58, 158], home, bus: [200, 265], pvdc: [58, 265], batt: [200, 343] }
      : { solar: [200, 48], grid: [62, 160], home, batt: [200, 272] };
    // spread the extra loads over the whole height when there are several, so names don't run into circles
    if (lsplit) P.noness = split ? [58, 44] : [62, 48];
    const exTop = extras.length > 2 ? (split ? 40 : 36) : (split ? 82 : 70);
    const exSpan = extras.length > 2 ? (split ? 300 : 236) : (split ? 170 : 180);
    const ex = extras.map((_, i, a) => [340, a.length === 1 ? home[1] : exTop + i * (exSpan / Math.max(a.length - 1, 1))]);
    const showBus = split && (f.battery || f.pv_dc);
    if (this._flowBuilt !== shape) {
      const wire = (id, d) => `<path class="wire" d="${d}"/><path class="dash" id="${id}" d="${d}"/>`;
      const line = ([x1, y1], [x2, y2]) => `M${x1} ${y1} L${x2} ${y2}`;
      const curve = ([x1, y1], [x2, y2]) => `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
      // over the top of the PV circle, from the Non-essential circle to a grid-side load
      // (along the top, then down a lane at x=290 that clears the house and PV circles)
      const over = ([x1, y1], [x2, y2]) => {
        const t = 6, lane = 290, r = Math.min(18, Math.max((y2 - t) / 2, 1));
        return `M${x1} ${y1} Q ${x1} ${t}, ${x1 + 30} ${t} L ${lane - r} ${t} Q ${lane} ${t}, ${lane} ${t + r} L ${lane} ${y2 - r} Q ${lane} ${y2}, ${lane + r} ${y2} L ${x2} ${y2}`;
      };
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
      if (lsplit) {
        // drawn from the grid toward the loads, so forward = power flowing into them
        if (hasGrid) svg += wire("w-noness", line(P.grid, P.noness));
        nodes += node("n-noness", "mid", P.noness, "var(--c-load)", "mdi:power-plug", "non-essential");
      }
      ex.forEach((p, i) => {
        // a load on the grid side hangs off the Non-essential circle instead of the house
        svg += wire(`w-ex${i}`, lsplit && extras[i].side === "noness" ? over(P.noness, p) : curve(P.home, p));
        nodes += node(`n-ex${i}`, "sm", p, "var(--muted)", "mdi:flash", null)
          + `<div class="lab" style="left:${(p[0] / 400) * 100}%;top:calc(${(p[1] / H) * 100}% + ${(10.5 * 320 / H).toFixed(1)}%)">${esc(String(extras[i].name).replace(/\s*(kwh\s*meter\s*)?power$/i, "").replace(/\s*kwh\s*meter$/i, ""))}</div>`;
      });
      nodes += node("n-home", "big", P.home, "var(--c-load)", lsplit ? "mdi:home-lightning-bolt" : "mdi:home", lsplit ? "essential" : "house");
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
    const ess = num(L.load_ess), noness = num(L.load_noness);
    setNode("n-home", fmtW(lsplit && ess !== null ? ess : load));
    if (lsplit && $("n-noness")) {
      const down = L.grid_available === false;
      const nn = $("n-noness");
      nn.style.setProperty("--nc", down ? "var(--muted)" : "var(--c-load)");
      setNode("n-noness", down ? "No power" : fmtW(noness), "non-essential");
      dash("w-noness", down ? 0 : noness, "var(--c-load)", true);
    }
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
      // with the split, the line to the house carries what goes on into the inverter (grid − non-essential)
      const through = lsplit && grid !== null && noness !== null ? grid - noness : grid;
      dash("w-grid", down ? 0 : through, "var(--c-grid)", (through || 0) > 0);
    }
    if ($("n-batt")) {
      setNode("n-batt", soc === null ? fmtW(batt) : `${Math.round(soc)}%`, batt === null ? "battery" : Math.abs(batt) < 20 ? "idle" : batt > 0 ? `+${fmtW(batt)}` : `−${fmtW(batt)}`);
      const ring = $("socring"); if (ring) { ring.setAttribute("stroke-dasharray", `${soc ?? 0} 100`); ring.style.display = soc === null ? "none" : ""; }
      const icon = $("n-batt").querySelector("ha-icon");
      icon.setAttribute("icon", batt > 20 ? "mdi:battery-charging-high" : soc === null ? "mdi:battery" : `mdi:battery${soc >= 95 ? "" : "-" + Math.max(10, Math.round(soc / 10) * 10)}`);
      dash("w-batt", batt, "var(--c-batt)", (batt || 0) < 0);
    }
    // colour the lines by where the power comes from (same sharing as the Blocks view)
    const fm = (() => {
      const sol0 = Math.max(solar || 0, 0), bOut = Math.max(-(batt || 0), 0), bIn = Math.max(batt || 0, 0);
      let gIn = L.grid_available === false ? 0 : Math.max(grid || 0, 0), sol = sol0;
      const non = lsplit ? Math.max(noness || 0, 0) : 0, essL = Math.max(lsplit && ess !== null ? ess : load || 0, 0);
      const g1 = Math.min(gIn, non); gIn -= g1; const s1 = Math.min(sol, non - g1); sol -= s1;
      const s2 = Math.min(sol, essL); sol -= s2; const b2 = Math.min(bOut, essL - s2); const g2 = Math.min(gIn, essL - s2 - b2); gIn -= g2;
      const s3 = Math.min(sol, bIn), g3 = Math.min(gIn, bIn - s3);
      const top = (parts) => { const t = parts.sort((a, b) => b[1] - a[1])[0]; return t[1] > 0 ? t[0] : null; };
      return { home: top([["var(--c-solar)", s2], ["var(--c-batt)", b2], ["var(--c-grid)", g2]]) || "var(--c-load)",
               charge: top([["var(--c-solar)", s3], ["var(--c-grid)", g3]]) || "var(--c-batt)" };
    })();
    const srcColor = fm.home;
    extras.forEach((e, i) => { setNode(`n-ex${i}`, fmtW(e.w)); dash(`w-ex${i}`, e.w, lsplit && e.side === "noness" ? "var(--c-grid)" : srcColor, true); });
    if ($("w-batt") && (batt || 0) > 20) dash("w-batt", batt, fm.charge, false);   // what's charging it
    const sub = this.shadowRoot.getElementById("flowsub");
    if (sub) sub.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* -------------------------------------------------- app updates (admin) */
  _renderUpdates() {
    const bar = this.shadowRoot.getElementById("updbar"), st = this.shadowRoot.getElementById("updstat");
    if (!bar || !this._isAdmin) return;
    const list = this._updates || [];
    const avail = list.filter((u) => u.available);
    bar.innerHTML = avail.map((u) => `<div class="card" style="grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-color:var(--accent)">
        <ha-icon icon="mdi:package-up" style="color:var(--accent)"></ha-icon><span style="flex:1;min-width:200px"><b style="font-weight:500">${esc(u.title)} ${esc(u.github)}</b> is available
        <span class="muted small">· you have ${esc(u.installed)}. Installing restarts Home Assistant (about a minute).</span></span>
        <span class="msg" id="updmsg-${esc(u.entity_id)}"></span>
        ${u.can_install ? `<button class="btn primary" data-upd="install" data-e="${esc(u.entity_id)}" ${u.in_progress ? "disabled" : ""}>${u.in_progress ? "Installing…" : "Install"}</button>` : ""}</div>`).join("");
    if (!st) return;
    const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "not yet");
    st.innerHTML = `<div class="raw">${list.map((u) => `<span>${esc(u.title)}</span><span>${esc(u.installed)} installed · GitHub ${esc(u.github || "?")}</span>
        <span class="muted">${u.available ? "update available" : u.managed_by === "HACS" ? "update shown by HACS" : u.github && u.github === u.installed ? "up to date" : "–"}</span><span class="muted">checked ${esc(when(u.checked))}</span>
        ${u.error ? `<span style="grid-column:1/-1;color:var(--c-bad)">${esc(u.error)}</span>` : ""}`).join("") || "<span>No update checks running – restart Home Assistant.</span>"}</div>
      <div class="actions"><span class="msg" id="updchk"></span><button class="btn" data-upd="check">Check now</button></div>`;
  }

  async _updateClick(b) {
    if (b.dataset.upd === "check") {
      const m = this.shadowRoot.getElementById("updchk");
      if (m) { m.textContent = "Asking GitHub…"; m.className = "msg"; }
      try { this._updates = await this._hass.callWS({ type: `${DOMAIN}/update_check` }); this._renderUpdates();
        const m2 = this.shadowRoot.getElementById("updchk"); if (m2) { m2.textContent = "Done"; m2.className = "msg ok"; } }
      catch (e) { if (m) { m.textContent = e.message || "Check failed"; m.className = "msg err"; } }
      return;
    }
    if (b.dataset.upd === "install") {
      b.disabled = true; b.textContent = "Installing…";
      try { await this._hass.callService("update", "install", { entity_id: b.dataset.e }); b.textContent = "Restarting…"; }
      catch (e) { b.disabled = false; b.textContent = "Install"; const m = this.shadowRoot.getElementById(`updmsg-${b.dataset.e}`); if (m) { m.textContent = e.message || "Install failed"; m.className = "msg err"; } }
    }
  }

  /* ------------------------------------------- info under the power flow */
  _fiEditable(eid) {
    const d = eid.split(".")[0];
    return (d === "number" || d === "input_number") && (this._isAdmin || this._snap?.flow_info_edit);
  }

  _renderFlowInfo() {
    const el = this.shadowRoot.getElementById("flowinfo"); if (!el || !this._snap) return;
    const ids = this._snap.flow_info || [];
    if (!ids.length) { this._setHTML(el, ""); return; }
    if (this._fiEdit && el.querySelector(".fedit")) return;   // don't redraw under the user's finger
    const tiles = ids.map((eid) => {
      const st = this._hass.states[eid];
      if (!st) return "";
      const a = st.attributes, u = a.unit_of_measurement || "";
      const n = num(st.state);
      const v = n === null ? st.state : `${n.toFixed(Math.abs(n) < 10 && n % 1 ? 1 : 0)}${u === "%" ? "%" : u ? ` ${u}` : ""}`;
      const icon = a.icon || (u === "%" ? "mdi:battery-50" : "mdi:information-outline");
      const edit = this._fiEditable(eid) && !["unavailable", "unknown"].includes(st.state);
      const inner = `<ha-icon icon="${esc(icon)}"></ha-icon><span class="n">${esc(a.friendly_name || eid)}</span>${edit ? `<ha-icon class="pen" icon="mdi:pencil"></ha-icon>` : "<span></span>"}<span class="v">${esc(v)}</span>`;
      return edit ? `<button class="ftile" data-fi="open" data-e="${esc(eid)}" aria-label="Change ${esc(a.friendly_name || eid)}">${inner}</button>` : `<div class="ftile">${inner}</div>`;
    }).join("");
    let editor = "";
    if (this._fiEdit) {
      const st = this._hass.states[this._fiEdit.eid], a = st?.attributes || {};
      const min = num(a.min) ?? 0, max = num(a.max) ?? 100, step = num(a.step) ?? 1, u = a.unit_of_measurement || "";
      const v = this._fiEdit.value;
      editor = `<div class="fedit"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-weight:500">${esc(a.friendly_name || this._fiEdit.eid)}</b>
          <span class="muted small">now ${esc(st?.state ?? "–")}${esc(u === "%" ? "%" : u ? ` ${u}` : "")}</span></div>
        <div class="row"><button class="ib" data-fi="minus" aria-label="Lower">−</button>
          <input type="range" id="fi-range" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="New value">
          <button class="ib" data-fi="plus" aria-label="Higher">+</button><span class="val" id="fi-val">${v}${esc(u === "%" ? "%" : u ? ` ${u}` : "")}</span></div>
        <div class="actions" style="margin-top:6px"><span class="msg" id="fi-msg"></span><button class="btn" data-fi="cancel">Cancel</button><button class="btn primary" data-fi="save">Save</button></div></div>`;
    }
    const html = `<div class="finfo">${tiles}</div>${editor}`;
    if (!editor) { this._setHTML(el, html); return; }
    el.innerHTML = html;
    el._html = null;
    const r = el.querySelector("#fi-range");
    if (r) r.addEventListener("input", () => this._fiSet(Number(r.value)));
  }

  _fiSet(v) {
    const st = this._hass.states[this._fiEdit.eid], a = st?.attributes || {};
    const min = num(a.min) ?? 0, max = num(a.max) ?? 100, step = num(a.step) ?? 1, u = a.unit_of_measurement || "";
    v = Math.min(max, Math.max(min, Math.round(v / step) * step));
    v = Number(v.toFixed(String(step).split(".")[1]?.length || 0));
    this._fiEdit.value = v;
    const r = this.shadowRoot.getElementById("fi-range"), t = this.shadowRoot.getElementById("fi-val");
    if (r) r.value = v;
    if (t) t.textContent = `${v}${u === "%" ? "%" : u ? ` ${u}` : ""}`;
  }

  async _flowInfoClick(b) {
    const act = b.dataset.fi;
    if (act === "open") {
      const eid = b.dataset.e, st = this._hass.states[eid];
      this._fiEdit = { eid, value: num(st?.state) ?? 0 };
      return this._renderFlowInfo();
    }
    if (!this._fiEdit) return;
    const step = num(this._hass.states[this._fiEdit.eid]?.attributes?.step) ?? 1;
    if (act === "minus") return this._fiSet(this._fiEdit.value - step);
    if (act === "plus") return this._fiSet(this._fiEdit.value + step);
    if (act === "cancel") { this._fiEdit = null; return this._renderFlowInfo(); }
    if (act === "save") {
      const { eid, value } = this._fiEdit;
      try {
        await this._hass.callService(eid.split(".")[0], "set_value", { entity_id: eid, value });
        this._fiEdit = null;
        this._renderFlowInfo();
      } catch (e) {
        const m = this.shadowRoot.getElementById("fi-msg");
        if (m) { m.textContent = e.message || "Could not change it"; m.className = "msg err"; }
      }
    }
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
      const sun = (num(this._snap.live?.solar) || 0) > 150;
      s1 = `${b.backup_h < 48 ? `until ${clockIn(b.backup_h)} · ` : ""}${kw(b.drain_w)} ${sun ? "from the battery with the sun helping" : "load"} · ${reserve}`;
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
    const DEV_ICON = { heatpump: "mdi:heat-pump", heater: "mdi:radiator", aircon: "mdi:air-conditioner", pump: "mdi:pump", charger: "mdi:ev-station", other: "mdi:power-plug" };
    const icon = (k, l) => (k === "pool" ? "mdi:pool" : k === "device" ? (DEV_ICON[l?.device_kind] || DEV_ICON.other) : "mdi:water-boiler");
    const state = (l) => {
      if (!l.active) return ["var(--muted)", l.kind === "pool" ? "Not in Solar mode – set the pool to Solar on the Water tab"
        : l.kind === "device" ? "Not in Solar mode – set it to Solar on the Devices tab" : "Solar heating is off for this geyser"];
      if (l.grant === undefined) return ["var(--muted)", "Starting…"];
      if (l.grant && l.running) return ["var(--c-ok)", `Running on solar · ${fmtW(l.power)}`];
      if (l.grant) return ["var(--c-ok)", "Switching on"];
      if (!l.wants) return ["var(--muted)", l.kind === "geyser" ? "Not needed now (hot enough or not in Auto)" : "Not needed now (outside hours or done for today)"];
      return ["var(--c-warn)", l.why ? l.why.charAt(0).toUpperCase() + l.why.slice(1) : "Waiting for solar"];
    };
    const rows = loads.map((l, i) => {
      const [c, t] = state(l);
      return `<div class="prow ${l.active ? "" : "off"}" data-id="${esc(l.id)}">
        <span class="rank">${i + 1}</span><ha-icon icon="${icon(l.kind, l)}"></ha-icon>
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
      <section class="card" id="wpump"><h2>Booster pump <span class="sub" id="wpumpsub"></span></h2><div class="wpwrap"><div class="wpmain"><div id="wpumpbody"></div><div id="wpumpdia"></div></div><div id="wcard" hidden></div></div></section>
      <section class="card" id="wirr"><h2><ha-icon icon="mdi:sprinkler-variant"></ha-icon>Irrigation <span class="sub" id="wirrsub"></span></h2>
        <div id="irrlive"></div><div id="irrform"></div>
        <div class="actions" id="irract" hidden><span class="msg" id="irrmsg"></span><button class="btn" data-irr="discard">Discard</button><button class="btn primary" data-irr="save">Save changes</button></div></section>
      <section class="card" id="wchartcard"><h2>Water pressure <span class="sub"><span class="seg"><button data-wday="today" aria-pressed="${(this._wday || "today") === "today"}">Today</button><button data-wday="yesterday" aria-pressed="${this._wday === "yesterday"}">Yesterday</button></span></span></h2>
        <div class="legend" style="margin:0 0 6px"><span class="key"><i style="background:var(--c-load)"></i>Pressure (bar)</span><span class="key"><i style="background:var(--accent);opacity:.25"></i>Booster pump running</span></div>
        <div class="chartwrap" id="wchart"></div></section>
      <section class="card" id="wcardset" hidden><h2>Pump card <span class="sub">admin only · show a dashboard card with the booster pump</span></h2>
        <p class="muted small" style="margin:0 0 8px">Paste the card's YAML – the same as in a dashboard's card editor (⋮ → Edit in YAML). E.g. the Delta CP2000 card: <code>type: custom:delta-cp2000-card</code> with its entities. The card must be installed (HACS). Leave empty for no card.</p>
        <textarea id="wcardyaml" rows="10" spellcheck="false" placeholder="type: custom:delta-cp2000-card&#10;name: Druk Pomp&#10;entities:&#10;  ..."></textarea>
        <div class="actions"><span class="msg" id="wcardmsg"></span><button class="btn primary" data-w="cardsave">Save</button></div></section>
      <section class="card" id="wprot" hidden><h2>Protection &amp; alerts <span class="sub">admin only</span></h2><div id="wprotbody"></div>
        <div class="actions"><span class="msg" id="wprotmsg"></span><button class="btn primary" data-w="protsave">Save</button></div></section>
      <section class="card" id="wtank" hidden><h2>Tank &amp; borehole <span class="sub">admin only · tank level without a level sensor</span></h2><div id="wtankbody"></div>
        <div class="actions"><span class="msg" id="wtankmsg"></span><button class="btn primary" data-w="tanksave">Save</button></div></section>
      <section class="card" id="wflow" hidden><h2>Water use <span class="sub">admin only · how the litres are worked out</span></h2><div id="wflowbody"></div>
        <div class="actions"><span class="msg" id="wflowmsg"></span><button class="btn primary" data-w="flowsave">Save</button></div></section>`;
    this._wShown = {};
    this._ro = new ResizeObserver(() => this._renderPressure());
    this._ro.observe(this.shadowRoot.getElementById("wchart"));
    this._irrShown = null; this._irrDirty = false;
    if (this._isAdmin && !this._irrOpts) this._hass.callWS({ type: `${DOMAIN}/irrigation_entities` }).then((o) => { this._irrOpts = o; this._irrShown = null; this._renderIrr(); }).catch(() => {});
    this._renderWater(); this._renderPressure();
  },

  /* Property tab: the whole property on one live picture (energy, geyser, water, irrigation, pool) */
  async _buildProperty() {
    this._main.innerHTML = `<section class="card" style="grid-column:1/-1"><h2><ha-icon icon="mdi:home-variant-outline"></ha-icon>Property <span class="sub" id="propsub"></span></h2><div id="propbox"></div></section>`;
    if (!customElements.get("hamlet-home-property")) {
      try { await import(`/hamlet_home_static/hamlet-home-property.js?v=${VERSION}`); } catch (e) {
        this.shadowRoot.getElementById("propbox").innerHTML = `<div class="muted small">Couldn't load the property view – refresh the page.</div>`; return;
      }
    }
    const box = this.shadowRoot.getElementById("propbox");
    if (this._tab !== "property" || !box) return;
    const el = document.createElement("hamlet-home-property");
    el.hass = this._hass;
    box.appendChild(el);
    this._renderProperty();
  },

  _renderProperty() {
    const el = this.shadowRoot.querySelector("hamlet-home-property"); if (!el) return;
    const sub = this.shadowRoot.getElementById("propsub");
    if (sub) sub.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.data = { snap: this._snap || {}, water: this._water, irr: this._irr, devices: this._devices || [] };
  },

  /* Pool tab: the pool pump, the water temperature and any devices linked to the pool (heat pump, lights …) */
  async _buildPool() {
    this._main.innerHTML = `
      <section class="card" id="wpooltemp"><h2><ha-icon icon="mdi:pool"></ha-icon>Swimming pool <span class="sub" id="wpoolsub"></span></h2><div id="pooldia"></div><div id="wpooltempbody"></div></section>
      <section class="card" id="wpool"><h2><ha-icon icon="mdi:pump"></ha-icon>Pool pump</h2><div id="wpoolbody"></div><div id="wpoolsched"></div>
        <div class="actions" id="wpoolact" hidden><span class="msg" id="wpoolmsg"></span><button class="btn" data-w="poolreset">Discard</button><button class="btn primary" data-w="poolsave">Save times</button></div></section>
      <div id="pooldevs" style="display:contents"></div>`;
    this._wShown = {}; this._poolDirty = false;
    this._renderWater();
    if (!customElements.get("hamlet-home-devices")) {
      try { await import(`/hamlet_home_static/hamlet-home-devices.js?v=${VERSION}`); } catch (e) { return; }
    }
    const holder = this.shadowRoot.getElementById("pooldevs");
    if (this._tab !== "pool" || !holder) return;
    const el = document.createElement("hamlet-home-devices");
    el.area = "pool";
    el.hass = this._hass;
    holder.appendChild(el);
    el.update({ ...(this._snap || {}), devices: this._devices || [], solar_loads: this._solar, is_admin: this._isAdmin });
  },

  _renderWater() {
    const w = this._water; const $ = (id) => this.shadowRoot.getElementById(id);
    const hide = (id, v) => { const e = $(id); if (e) e.hidden = v; };
    if (!$("wpump") && !$("wpool")) return;
    if ($("wpump")) this._renderIrr();
    const f0 = w?.features || {};
    const hasPool = f0.pool_switch || f0.pool_power;
    if ($("wpool")) {
      hide("wpool", !hasPool);
      const poolDevs = (this._devices || []).filter((d) => d.area === "pool");
      hide("wpooltemp", !(hasPool || f0.pool_temp || poolDevs.length || this._isAdmin));
      this._renderPoolDiagram();
      this._setHTML($("wpooltempbody"), "");
      if (!hasPool && !f0.pool_temp && !poolDevs.length) {
        const holder = $("wpooltemp");
        if (holder) { this._setHTML($("wpooltempbody"), `<div class="muted small">${this._isAdmin ? "No pool pump set up yet. Add the pool pump switch, its power and a pool temperature sensor under Settings → Devices &amp; services → Hamlet Home → Configure → Water, pump &amp; pool. Add a pool heat pump, lights or a chlorinator below." : "Nothing set up for the pool yet."}</div>`); }
      }
    }
    if (!w) { ["wpump", "wpool", "wchartcard", "wprot", "walarm"].forEach((id) => hide(id, true)); return; }
    const L = w.live || {}, f = w.features || {}, st = w.settings || {};
    const hasPump = !!$("wpump") && (f.pump_switch || f.pump_power || f.pump_hz || f.water_pressure);
    hide("wpump", !hasPump);
    hide("wchartcard", !f.water_pressure);
    hide("wprot", !this._isAdmin || !hasPump);
    hide("wflow", !this._isAdmin || !hasPump);
    hide("wcardset", !this._isAdmin || !hasPump);
    { const ta = $("wcardyaml"); if (ta && this.shadowRoot.activeElement !== ta && ta.dataset.v !== (w?.settings?.pump_card || "")) { ta.value = ta.dataset.v = w?.settings?.pump_card || ""; } }
    this._renderPumpCard();
    hide("wtank", !this._isAdmin || !hasPump || !!f.tank_level);

    // alarm
    const al = $("walarm");
    if (al) al.hidden = !w.tripped;
    if (al && w.tripped) this._setHTML(al, `<ha-icon icon="mdi:water-alert"></ha-icon><div><div class="t">Booster pump stopped – no water?</div>
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
      if (w.tank) {
        tiles.push(["Tank", w.tank.level_l === null ? "learning…" : `${w.tank.level_l} L · ${Math.round(w.tank.level_l / w.tank.size_l * 100)}%`]);
        if (w.tank.filling) tiles.push(["Borehole", L.borehole_long ? `⚠ running ${Math.round(L.borehole_min || 0)} min` : `filling${L.borehole_min ? ` · ${Math.round(L.borehole_min)} min` : ""}`]);
      }
      const u = w.usage;
      if (u) {
        const irrToday = Math.max(u.today - u.house_today, 0);
        tiles.push(["Flow now", L.flow_lpm === null || L.flow_lpm === undefined ? "–" : `${L.flow_lpm.toFixed(1)} L/min`], ["Water today", fmtL(u.today)],
          ["House today", fmtL(u.house_today)], ["Irrigation today", fmtL(irrToday)], ["This month", fmtL(u.month)], ["Total", `${u.total_m3.toFixed(1)} m³`]);
      }
      this._setHTML($("wpumpbody"), `<div class="${gauge ? "pgrid" : ""}">${gauge}<div>
          <div class="row2"><span class="badge ${badge[2] ? "pulse" : ""}" style="--bc:${badge[0]}"><span class="dot"></span>${badge[1]}</span>
            ${f.pump_switch && !w.tripped ? `<button class="btn ${L.pump_switch ? "" : "primary"}" data-w="${L.pump_switch ? "pumpoff" : "pumpon"}" style="margin-left:auto">${L.pump_switch ? "Switch off" : "Switch on"}</button>` : ""}</div>
          ${startsPerHour > 12 ? `<div class="note" style="margin-top:10px">The pump is starting about ${Math.round(startsPerHour)} times an hour – check the pressure tank pre-charge or for a dripping tap.</div>` : ""}
          <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}</div></div></div>`);
    }

    if (hasPump) this._renderWaterDiagram();

    // pool pump (Pool tab)
    if ((f.pool_switch || f.pool_power) && $("wpoolbody")) {
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
    this._renderWaterUse();
    this._renderTankSet();
  },

  // a Lovelace card (e.g. the Delta CP2000 keypad card) next to the booster pump
  async _renderPumpCard() {
    const slot = this.shadowRoot.getElementById("wcard"); if (!slot) return;
    const cfg = this._water && this._water.pump_card;
    const key = cfg ? JSON.stringify(cfg) : "";
    if (!cfg) { slot.hidden = true; slot.replaceChildren(); this._pcKey = ""; this._pcEl = null; return; }
    slot.hidden = false;
    if (this._pcKey === key && this._pcEl && slot.contains(this._pcEl)) { this._pcEl.hass = this._hass; return; }
    this._pcKey = key;
    try {
      await this._loadLovelaceResources();
      const helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
      if (this._pcKey !== key) return;
      let el;
      if (helpers) el = helpers.createCardElement(cfg);
      else {
        const tag = cfg.type.startsWith("custom:") ? cfg.type.slice(7) : `hui-${cfg.type}-card`;
        await Promise.race([customElements.whenDefined(tag), new Promise((r) => setTimeout(r, 8000))]);
        el = document.createElement(tag); el.setConfig(cfg);
      }
      el.hass = this._hass;
      el.addEventListener("ll-rebuild", (ev) => { ev.stopPropagation(); this._pcKey = ""; this._renderPumpCard(); });   // the card's code arrived later
      this._pcEl = el;
      slot.replaceChildren(el);
    } catch (e) {
      slot.innerHTML = `<div class="msg err" style="padding:12px">Could not show the pump card: ${esc(e.message || String(e))}</div>`;
      this._pcEl = null;
    }
  },

  // custom cards (HACS) are only loaded by dashboards – load them here too
  _loadLovelaceResources() {
    if (!this._llRes) {
      this._llRes = (async () => {
        let res = [];
        try { res = await this._hass.callWS({ type: "lovelace/resources" }); } catch (e) { return; }
        if (!Array.isArray(res)) return;
        await Promise.all(res.map((r) => {
          const url = r.url;
          if (r.type === "module") return import(url).catch(() => {});
          if (r.type === "js") return new Promise((ok) => { if (document.querySelector(`script[src="${CSS.escape(url)}"]`)) return ok(); const sc = document.createElement("script"); sc.src = url; sc.onload = sc.onerror = ok; document.head.appendChild(sc); });
          if (r.type === "css" && !document.querySelector(`link[href="${CSS.escape(url)}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = url; document.head.appendChild(l); }
          return null;
        }));
      })();
    }
    return this._llRes;
  },

  _renderTankSet(force) {
    const el = this.shadowRoot.getElementById("wtankbody"); if (!el || !this._isAdmin || !this._water) return;
    const w = this._water, st = w.settings, T = w.tank, L = w.live || {};
    const key = JSON.stringify([st.tank_size_l, st.borehole_entity, st.borehole_watts, st.tank_refill_pct, st.borehole_long_min, st.float_entity, st.float_on_means, st.borehole_switch, st.borehole_control, T && T.fills, T && T.filling, T && T.float_low, st.flow_enabled]);
    const a = this.shadowRoot.activeElement;
    if (!force && ((a && a.closest && a.closest("#wtankbody")) || this._wShown.tank === key)) return;
    this._wShown.tank = key;
    const fld = (k, label, hint, unit, step) => `<div class="field"><label for="wt-${k}">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</label><span class="ctl"><input id="wt-${k}" type="number" data-wt="${k}" value="${st[k] ?? ""}" step="${step}" min="0">${unit}</span></div>`;
    const ago = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
    el.innerHTML = `
      <p class="muted small" style="margin:0 0 10px">The borehole's float switch tells the app two exact levels: when the borehole switches <b>on</b> the tank is at the switch-on level, when it switches <b>off</b> the tank is full. In between it takes off the water the booster pump delivered and adds what the borehole pumps (learnt from earlier fills).</p>
      <div class="cols2"><div>
        ${fld("tank_size_l", "Tank size", "0 = no tank", "L", 50)}
        ${fld("tank_refill_pct", "Borehole switches on at", "1/3 down from the top = 67 %", "%", 1)}
        ${fld("borehole_long_min", "Warn when the borehole runs longer than", "0 = 3× its usual fill time", "min", 5)}
      </div><div>
        <div class="field"><label for="wt-borehole_entity">Borehole pump<span class="hint">its switch / contactor, or a power sensor</span></label><input id="wt-borehole_entity" type="text" data-wt="borehole_entity" value="${esc(st.borehole_entity || "")}" placeholder="switch.borehole" list="wtbh"></div>
        <datalist id="wtbh">${Object.entries(this._hass?.states || {}).filter(([id, x]) => /^(switch|binary_sensor|input_boolean|light)\./.test(id) || (id.startsWith("sensor.") && /^k?W$/.test(x?.attributes?.unit_of_measurement || ""))).slice(0, 400).map(([id, x]) => ({ id, name: x?.attributes?.friendly_name || id })).map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}</datalist>
        ${fld("borehole_watts", "Power sensor: running above", "only for a power sensor", "W", 10)}
      </div></div>
      <div class="sub2">Float switch <span class="muted small">optional – e.g. the Shelly input the tank's float is wired to</span></div>
      <div class="cols2"><div>
        <div class="field"><label for="wt-float_entity">Float switch input<span class="hint">gives the exact moments: tank at the switch-on level / tank full</span></label><input id="wt-float_entity" type="text" data-wt="float_entity" value="${esc(st.float_entity || "")}" placeholder="binary_sensor.shelly_input_0" list="wtfl"></div>
        <datalist id="wtfl">${Object.entries(this._hass?.states || {}).filter(([id]) => /^(binary_sensor|input_boolean|switch)\./.test(id)).slice(0, 400).map(([id, x]) => `<option value="${esc(id)}">${esc(x?.attributes?.friendly_name || id)}</option>`).join("")}</datalist>
        <div class="field"><label for="wt-float_on_means">When the input is ON<span class="hint">check: with the tank full the input should show the other state</span></label><select id="wt-float_on_means" data-wt="float_on_means"><option value="low" ${st.float_on_means !== "full" ? "selected" : ""}>the tank needs water</option><option value="full" ${st.float_on_means === "full" ? "selected" : ""}>the tank is full</option></select></div>
      </div><div>
        <div class="field"><label for="wt-borehole_control">The app starts and stops the borehole<span class="hint">from the float switch · off when the Shelly does it by itself</span></label><span class="switch"><input id="wt-borehole_control" type="checkbox" data-wt="borehole_control" ${st.borehole_control ? "checked" : ""}><span></span></span></div>
        <div class="field"><label for="wt-borehole_switch">Borehole relay<span class="hint">the Shelly output that switches the borehole</span></label><input id="wt-borehole_switch" type="text" data-wt="borehole_switch" value="${esc(st.borehole_switch || "")}" placeholder="switch.shelly_borehole" list="wtsw"></div>
        <datalist id="wtsw">${Object.entries(this._hass?.states || {}).filter(([id]) => /^(switch|input_boolean)\./.test(id)).slice(0, 400).map(([id, x]) => `<option value="${esc(id)}">${esc(x?.attributes?.friendly_name || id)}</option>`).join("")}</datalist>
      </div></div>
      ${st.tank_size_l && !st.flow_enabled ? `<p class="msg err" style="margin:6px 0">Switch on <b>Count the water</b> (Water use card below) – the tank estimate needs the water the booster pump delivers.</p>` : ""}
      ${T ? `<div class="sub2">Now</div>
        <p style="margin:2px 0 8px">${T.level_l === null ? "Learning – the level is known from the next time the borehole switches on or off." : `<b>${T.level_l} L</b> (${Math.round(T.level_l / T.size_l * 100)} %)`}${T.filling ? ` · borehole filling${L.borehole_min ? ` for ${Math.round(L.borehole_min)} min` : ""}` : ""}${st.float_entity ? ` · float: <b>${T.float_low === true ? "needs water" : T.float_low === false ? "full" : "unknown"}</b>` : ""}${T.inflow_lpm ? ` · borehole gives about <b>${T.inflow_lpm.toFixed(1)} L/min</b>` : ""}${T.usual_fill_min ? ` · a fill usually takes ${Math.round(T.usual_fill_min)} min` : ""}</p>
        <div class="row2" style="flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px"><span class="muted small">Know the level?</span><button class="btn" data-w="tankfull">Tank is full now</button><span class="ctl"><input type="number" id="wt-setpct" min="0" max="100" step="1" placeholder="${T.level_l === null ? "" : Math.round(T.level_l / T.size_l * 100)}" aria-label="Tank level now in %">%</span><button class="btn" data-w="tankset">Set level</button></div>
        ${T.fills && T.fills.length ? `<div class="sub2">Last fills</div><div class="muted small">${T.fills.map((x) => `${ago(x.start)} · ${Math.round(x.minutes)} min · ${x.in_l} L in · ${x.lpm} L/min`).join("<br>")}</div>` : ""}` : ""}`;
  },

  _renderWaterUse(force) {
    const el = this.shadowRoot.getElementById("wflowbody"); if (!el || !this._isAdmin || !this._water) return;
    const st = this._water.settings, f = this._water.features || {};
    const key = JSON.stringify([st.flow_enabled, st.flow_sensor, st.flow_curve, st.flow_rated_hz, st.flow_min_hz, st.flow_suction_m, st.flow_cal]);
    const a = this.shadowRoot.activeElement;
    if (!force && ((a && a.closest && a.closest("#wflowbody")) || this._wShown.flow === key)) return;
    this._wShown.flow = key;
    if (force !== "keep") this._flowCurve = JSON.parse(JSON.stringify(st.flow_curve || []));
    const fld = (k, label, hint, unit, step, v = st[k]) => `<div class="field"><label for="wf-${k}">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</label><span class="ctl"><input id="wf-${k}" type="number" data-wf="${k}" value="${v}" step="${step}">${unit}</span></div>`;
    const lpm = this._water.live?.flow_lpm;
    el.innerHTML = `
      <div class="field"><label for="wf-on">Count the water<span class="hint">litres per day for the house and for every irrigation valve${f.water_pressure ? "" : " · needs a pressure sensor or a flow meter"}</span></label><span class="switch"><input id="wf-on" type="checkbox" data-wf="flow_enabled" ${st.flow_enabled ? "checked" : ""}><span></span></span></div>
      <div class="field"><label for="wf-flow_sensor">Flow meter (optional)<span class="hint">a real water meter sensor is used instead of the pump curve · L/min, L/h or m³/h</span></label><input id="wf-flow_sensor" type="text" data-wf="flow_sensor" value="${esc(st.flow_sensor || "")}" placeholder="sensor.water_flow"></div>
      <div ${st.flow_sensor ? "hidden" : ""}>
        <div class="sub2">Pump curve <span class="muted small">from the pump's datasheet, at its rated frequency – default DAB K 35/40 T</span></div>
        <div class="fcurve">${this._flowCurve.map((p, i) => `<div class="fpt" data-ci="${i}"><span class="ctl"><input type="number" data-cq="0" value="${p[0]}" step="0.1" min="0" aria-label="Flow point ${i + 1}">m³/h</span><span class="ctl"><input type="number" data-cq="1" value="${p[1]}" step="0.5" min="0" aria-label="Head point ${i + 1}">m</span><button class="iconbtn" data-w="cdel" aria-label="Remove point"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>`).join("")}</div>
        <div class="actions" style="justify-content:flex-start"><button class="btn" data-w="cadd">+ Add point</button><button class="btn" data-w="cdef">DAB K 35/40 T</button></div>
        <div class="cols2"><div>
          ${fld("flow_rated_hz", "Rated frequency", "the curve's frequency", "Hz", 1)}
          ${fld("flow_min_hz", "Stopped below", "", "Hz", 1)}
        </div><div>
          ${fld("flow_suction_m", "Suction lift", "+ m when the pump lifts from a tank below it, − when the inlet is under pressure", "m", 0.5)}
          ${fld("flow_cal", "Correction factor", "from a bucket test – 1 = datasheet", "×", 0.01)}
        </div></div>
        <div class="sub2">Bucket test</div>
        <p class="muted small" style="margin:2px 0 8px">Open a tap, fill a bucket of known size and time it. Do it while only that tap runs. Now: <b>${lpm === null || lpm === undefined ? "pump not running" : `${lpm.toFixed(1)} L/min estimated`}</b>.</p>
        <div class="row2" style="flex-wrap:wrap;gap:8px"><span class="ctl"><input type="number" id="wf-bl" min="0" step="0.5" placeholder="20">litres in</span><span class="ctl"><input type="number" id="wf-bs" min="0" step="0.5" placeholder="30">seconds</span><button class="btn" data-w="bucket">Work out the factor</button></div>
      </div>
      <p class="muted small" style="margin:10px 0 0">Adds the sensors <b>Water flow</b>, <b>Water used today</b> and <b>Water used total</b> – put the total on Home Assistant's Energy dashboard under Water. When more valves are open together their water is shared equally; with no valve open it counts as house.</p>`;
    el.querySelectorAll(".fpt input").forEach((inp) => inp.addEventListener("input", () => { this._flowCurve[Number(inp.closest(".fpt").dataset.ci)][Number(inp.dataset.cq)] = Number(inp.value); }));
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
    const key = JSON.stringify([st.pool_solar_start_w, st.pool_solar_keep_w, st.pool_hours, st.pool_stop_deficit_min, st.pool_stop_discharge_min, st.pool_discharge_w]);
    const a = this.shadowRoot.activeElement;
    if ((a && a.closest && a.closest("#wpoolsolar")) || this._wShown.psolar === key) return;
    this._wShown.psolar = key;
    el.innerHTML = `<div style="margin-top:12px">
      <div class="field"><label for="ps-start">Start when spare solar is above<span class="hint">not counting the pump itself</span></label><span class="ctl"><input id="ps-start" type="number" data-ps="pool_solar_start_w" value="${st.pool_solar_start_w}" min="0" step="50">W</span></div>
      <div class="field"><label for="ps-keep">Keep running while above</label><span class="ctl"><input id="ps-keep" type="number" data-ps="pool_solar_keep_w" value="${st.pool_solar_keep_w}" min="0" step="50">W</span></div>
      <div class="field"><label for="ps-hours">Run hours per day<span class="hint">stops once reached · 0 = no limit</span></label><span class="ctl"><input id="ps-hours" type="number" data-ps="pool_hours" value="${st.pool_hours}" min="0" max="24" step="0.5">h</span></div>
      <div class="field"><label for="ps-def">Stop when solar is below the house load for<span class="hint">the house is then running on battery or grid · 0 = off</span></label><span class="ctl"><input id="ps-def" type="number" data-ps="pool_stop_deficit_min" value="${st.pool_stop_deficit_min ?? 10}" min="0" max="240" step="1">min</span></div>
      <div class="field"><label for="ps-dis">Stop when the battery gives more than<span class="hint">ignores small blips below this</span></label><span class="ctl"><input id="ps-disw" type="number" data-ps="pool_discharge_w" value="${st.pool_discharge_w ?? 200}" min="0" step="50" style="width:72px">W for<input id="ps-dis" type="number" data-ps="pool_stop_discharge_min" value="${st.pool_stop_discharge_min ?? 5}" min="0" max="240" step="1" style="width:64px">min</span></div>
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
      case "cadd": { const c = this._flowCurve, l = c[c.length - 1] || [0, 40]; c.push([+(l[0] + 1).toFixed(1), Math.max(l[1] - 5, 0)]); return this._renderWaterUse("keep"); }
      case "cdel": this._flowCurve.splice(Number(b.closest(".fpt").dataset.ci), 1); return this._renderWaterUse("keep");
      case "cdef": this._flowCurve = [[0, 43.5], [1.2, 41.5], [1.8, 40], [2.4, 38], [3.6, 33], [4.8, 23.5]]; return this._renderWaterUse("keep");
      case "bucket": {
        const lit = Number($("wf-bl").value), sec = Number($("wf-bs").value), est = this._water.live?.flow_lpm, m = $("wflowmsg");
        if (!(lit > 0 && sec > 0)) { m.textContent = "Fill in litres and seconds"; m.className = "msg err"; return; }
        if (!(est > 0)) { m.textContent = "Do the test while the pump runs and Count the water is on"; m.className = "msg err"; return; }
        const real = lit / sec * 60, cal = Math.min(Math.max(Number(this._water.settings.flow_cal || 1) * real / est, 0.2), 5);
        $("wf-flow_cal").value = cal.toFixed(2); m.textContent = `Measured ${real.toFixed(1)} L/min – factor ${cal.toFixed(2)}, tap Save`; m.className = "msg ok"; return;
      }
      case "tankfull": case "tankset": {
        const v = b.dataset.w === "tankfull" ? "100" : String($("wt-setpct").value || "").trim(), m = $("wtankmsg");
        if (v === "") { m.textContent = "Type the level in %"; m.className = "msg err"; return; }
        if (await call({ type: `${DOMAIN}/water_action`, action: "tank_level", value: v }, m)) { m.textContent = `Tank set to ${v} %`; m.className = "msg ok"; this._renderTankSet(true); }
        return;
      }
      case "cardsave": {
        const ta = $("wcardyaml"), text = ta.value.trim();
        if (await call({ type: `${DOMAIN}/water_settings`, settings: { pump_card: text } }, $("wcardmsg"))) {
          ta.dataset.v = text; const m = $("wcardmsg"); m.textContent = text ? "Saved – the card shows next to the booster pump" : "Saved – no card"; m.className = "msg ok"; this._renderPumpCard();
        }
        return;
      }
      case "tanksave": {
        const settings = {};
        this.shadowRoot.querySelectorAll("[data-wt]").forEach((inp) => { settings[inp.dataset.wt] = inp.type === "checkbox" ? inp.checked : inp.tagName === "SELECT" ? inp.value : inp.type === "text" ? inp.value.trim() : Number(inp.value || 0); });
        if (settings.borehole_control && !settings.borehole_switch) { const m = $("wtankmsg"); m.textContent = "Pick the borehole relay (the Shelly output) first"; m.className = "msg err"; return; }
        if (settings.borehole_control && !settings.float_entity) { const m = $("wtankmsg"); m.textContent = "Pick the float switch input first"; m.className = "msg err"; return; }
        this.shadowRoot.activeElement?.blur?.();
        this._wShown.tank = null;
        if (await call({ type: `${DOMAIN}/water_settings`, settings }, $("wtankmsg"))) { const m = $("wtankmsg"); m.textContent = "Saved"; m.className = "msg ok"; this._renderTankSet(true); }
        return;
      }
      case "flowsave": {
        const settings = { flow_curve: this._flowCurve };
        this.shadowRoot.querySelectorAll("[data-wf]").forEach((inp) => { settings[inp.dataset.wf] = inp.type === "checkbox" ? inp.checked : inp.type === "text" ? inp.value.trim() : Number(inp.value); });
        this.shadowRoot.activeElement?.blur?.();
        this._wShown.flow = null;
        if (await call({ type: `${DOMAIN}/water_settings`, settings }, $("wflowmsg"))) { const m = $("wflowmsg"); m.textContent = "Saved"; m.className = "msg ok"; this._renderWaterUse(true); }
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
      ${band(3, "var(--accent)", 0.22)}
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

  /* -------------------------------------------------------- pool diagram */
  // Pool -> pump -> filter -> heat pump / chlorinator … -> back into the pool. Water runs while the pool pump runs;
  // a running heater warms the return water (orange), a chlorinator bubbles, lights glow, a cleaner drives about.
  _renderPoolDiagram() {
    const el = this.shadowRoot.getElementById("pooldia"); if (!el) return;
    const w = this._water || {}, L = w.live || {}, f = w.features || {};
    const devs = (this._devices || []).filter((d) => d.area === "pool");
    const hasPump = f.pool_switch || f.pool_power;
    if (!hasPump && !f.pool_temp && !devs.length) { el.innerHTML = ""; el._key = null; return; }
    const run = !!L.pool_running;
    const t = num(L.pool_temp);
    const inline = devs.filter((d) => !["light", "cleaner"].includes(d.kind)).slice(0, 4);
    const lights = devs.filter((d) => d.kind === "light"), cleaners = devs.filter((d) => d.kind === "cleaner");
    const isHeat = (d) => ["heatpump", "heater"].includes(d.kind);
    const hot = inline.some((d) => isHeat(d) && d.on);
    const chl = run && inline.some((d) => d.kind === "chlorinator" && d.on);
    const lit = lights.some((d) => d.on), clean = cleaners.some((d) => d.on);
    const narrow = (this.shadowRoot.host.clientWidth || 800) < 560;
    let P, pump, filt, eq, Wd, H, pipe, inX, cold, warmP;
    const hi = inline.findIndex((d) => isHeat(d) && d.on);   // water turns warm after the first running heater
    if (!narrow) {
      P = { x: 16, y: 34, w: 270, h: 156 }; pump = [340, 172]; filt = [412, 172];
      eq = (i) => [484 + i * 72, 172];
      const end = inline.length ? eq(inline.length - 1)[0] : filt[0];
      Wd = Math.max(560, end + 56); H = 214; inX = 236;
      pipe = `M${P.x + P.w} 172 H ${end + 34} V 16 H ${inX} V ${P.y + 18}`;
      if (hi >= 0) { const hx = eq(hi)[0]; cold = `M${P.x + P.w} 172 H ${hx}`; warmP = `M${hx} 172 H ${end + 34} V 16 H ${inX} V ${P.y + 18}`; }
    } else {
      P = { x: 16, y: 34, w: 308, h: 126 }; pump = [64, 214]; filt = [130, 214];
      eq = (i) => [196 + i * 60, 214];
      const end = inline.length ? eq(inline.length - 1)[0] : filt[0];
      const right = Math.max(end + 30, 334);
      Wd = Math.max(344, right + 10); H = 246; inX = 250;
      pipe = `M36 ${P.y + P.h} V 214 H ${right} V 16 H ${inX} V ${P.y + 18}`;
      if (hi >= 0) { const hx = eq(hi)[0]; cold = `M36 ${P.y + P.h} V 214 H ${hx}`; warmP = `M${hx} 214 H ${right} V 16 H ${inX} V ${P.y + 18}`; }
    }
    const key = JSON.stringify([narrow, Wd, run, t === null ? null : t.toFixed(1), hot, chl, lit, clean, w.pool_reason, inline.map((d) => [d.name, d.kind, d.on, d.available]), lights.length, cleaners.length, hasPump]);
    if (el._key === key) return;
    el._key = key;
    const sub = this.shadowRoot.getElementById("wpoolsub");
    if (sub) sub.textContent = [hasPump ? (run ? "pump running" : "pump off") : "", hot ? "heating" : "", lit ? "lights on" : ""].filter(Boolean).join(" · ");
    // water colour: cooler = deeper blue, warmer = more turquoise
    const warm = t === null ? 0.5 : Math.max(0, Math.min(1, (t - 16) / 14));
    const water = `hsl(${Math.round(205 - warm * 25)} 70% ${Math.round(48 + warm * 6)}%)`;
    const sy = P.y + 16, x1 = P.x, x2 = P.x + P.w;
    const wave = (y, amp) => { let d = `M${x1 - 30} ${y}`; for (let x = x1 - 30; x < x2 + 30; x += 24) d += ` q 6 ${-amp} 12 0 t 12 0`; return d + ` V ${P.y + P.h} H ${x1 - 30} Z`; };
    let svg = `<defs><clipPath id="pclip"><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="18"/></clipPath>
        <radialGradient id="pglowg" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#fff6c2" stop-opacity=".75"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/></radialGradient></defs>
      <path class="pipe" d="${pipe}"/>
      ${hi >= 0 ? `<g class="${run ? "on" : ""}"><path class="wet" d="${cold}"/><path class="drops" d="${cold}"/></g><g class="${run ? "on" : ""} hot"><path class="wet" d="${warmP}"/><path class="drops" d="${warmP}"/></g>`
        : `<g class="${run ? "on" : ""}"><path class="wet" d="${pipe}"/><path class="drops" d="${pipe}"/></g>`}
      <g clip-path="url(#pclip)" class="${lit ? "lit" : ""} ${chl ? "chl" : ""} ${clean ? "clean" : ""}">
        <rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="color-mix(in srgb, var(--c-water) 8%, var(--card))"/>
        <path class="wv2" d="${wave(sy + 3, 3)}" fill="${water}" opacity=".55"/>
        <path class="wv1" d="${wave(sy, 4)}" fill="${water}" opacity=".85"/>
        <ellipse class="glow" cx="${x1 + P.w / 2}" cy="${P.y + P.h * 0.62}" rx="${P.w * 0.55}" ry="${P.h * 0.5}" fill="url(#pglowg)"/>
        ${[0, 1, 2, 3].map((i) => `<circle class="bub" cx="${inX - 14 + i * 9}" cy="${P.y + P.h - 10}" r="${2 + (i % 2)}" style="animation-delay:${i * 0.55}s"/>`).join("")}
        ${cleaners.length ? `<g class="bot" style="--run:${Math.round(P.w - 70)}px"><rect x="${x1 + 14}" y="${P.y + P.h - 20}" width="30" height="13" rx="5" fill="${clean ? "#2b3440" : "rgba(0,0,0,.35)"}"/><rect x="${x1 + 17}" y="${P.y + P.h - 8}" width="24" height="3" rx="1.5" fill="#111"/></g>` : ""}
      </g>
      <rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="18" fill="none" stroke="color-mix(in srgb, var(--c-water) 45%, var(--line))" stroke-width="3"/>
      <text class="tmp" x="${x1 + P.w / 2}" y="${P.y + P.h / 2 + 12}">${t === null ? "" : t.toFixed(1)}<tspan>${t === null ? "" : " °C"}</tspan></text>
      <text class="tsub" x="${x1 + P.w / 2}" y="${P.y + P.h / 2 + 30}">${t === null ? "" : t >= 28 ? "Warm" : t >= 24 ? "Nice for swimming" : t >= 20 ? "Fresh" : "Cold"}</text>`;
    if (hasPump) {
      const [px, py] = pump;
      svg += `<g class="${run ? "spin" : ""}"><circle cx="${px}" cy="${py}" r="22" fill="var(--card)" stroke="${run ? "var(--c-water)" : "var(--line)"}" stroke-width="2.5"/>
        <g class="imp"><path d="M${px} ${py} l0 -14 a14 14 0 0 1 10 4 Z M${px} ${py} l12.1 7 a14 14 0 0 1 -4.9 9.5 Z M${px} ${py} l-12.1 7 a14 14 0 0 1 -5.3 -9.5 Z" fill="${run ? "var(--c-water)" : "var(--muted)"}" opacity=".85"/></g>
        <circle cx="${px}" cy="${py}" r="3" fill="var(--card)"/></g><text class="lbl ${run ? "on" : ""}" x="${px}" y="${py + 38}">${run ? "Pump on" : "Pump"}</text>`;
    }
    const [fx, fy] = filt;
    svg += `<rect x="${fx - 15}" y="${fy - 27}" width="30" height="50" rx="13" fill="${run ? "color-mix(in srgb, var(--c-water) 18%, var(--card))" : "var(--card)"}" stroke="${run ? "var(--c-water)" : "var(--line)"}" stroke-width="2.5"/>
      <line x1="${fx - 8}" y1="${fy - 6}" x2="${fx + 8}" y2="${fy - 6}" stroke="var(--line)" stroke-width="2"/><line x1="${fx - 8}" y1="${fy + 2}" x2="${fx + 8}" y2="${fy + 2}" stroke="var(--line)" stroke-width="2"/>
      <text class="lbl ${run ? "on" : ""}" x="${fx}" y="${fy + 38}">Filter</text>`;
    const nm = (x) => { x = String(x || ""); return x.length > 12 ? x.slice(0, 11) + "…" : x; };
    inline.forEach((d, i) => { const [ex, ey] = eq(i); svg += `<text class="lbl ${d.on ? "on" : ""}" x="${ex}" y="${ey + 38}">${esc(nm(d.name))}</text>`; });
    const pct = (x, y) => `left:${(x / Wd) * 100}%;top:${(y / H) * 100}%`;
    let icons = inline.map((d, i) => `<div class="ic ${d.available === false ? "bad" : d.on ? (isHeat(d) ? "hot" : "on") : ""}" style="${pct(...eq(i))}" title="${esc(d.name)}"><ha-icon icon="${esc(d.icon || "mdi:power-plug")}"></ha-icon></div>`).join("");
    if (lights.length) icons += `<div class="ic ${lit ? "hot" : ""}" style="${pct(P.x + 22, P.y + 2)};width:30px;height:30px${lit ? ";border-color:#e8b400;color:#e8b400;animation:none" : ""}" title="${esc(lights.map((d) => d.name).join(", "))}"><ha-icon icon="${lit ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}" style="--mdc-icon-size:17px"></ha-icon></div>`;
    el.innerHTML = `<div class="pdia" style="max-width:${Math.round(Wd * 1.3)}px" role="img" aria-label="${esc(`Pool${t !== null ? ` ${t.toFixed(1)} °C` : ""}${hasPump ? (run ? ", pump running" : ", pump off") : ""}${hot ? ", heating" : ""}${lit ? ", lights on" : ""}`)}">
      <svg viewBox="0 0 ${Wd} ${H}">${svg}</svg>${icons}</div>`;
  },

  /* ------------------------------------------------------- water diagram */
  // Supply (tank) -> booster pump -> main line -> house taps + one drop per irrigation valve.
  // Water dots run in every pipe that has water moving; the impeller spins while the pump runs.
  _renderWaterDiagram() {
    const el = this.shadowRoot.getElementById("wpumpdia"); if (!el) return;
    const w = this._water || {}, L = w.live || {}, f = w.features || {};
    const ir = this._irr || { zones: [] };
    const zones = (ir.zones || []).filter((z) => z.enabled !== false || z.on).slice(0, 8);
    const runId = ir.run && ir.run.zone;
    const zOn = zones.map((z) => !!z.on || z.id === runId);
    const pumpRun = !!L.pump_running && !w.tripped;
    const anyZone = zOn.some(Boolean);
    const moving = pumpRun || anyZone;                  // water moves when the pump runs or a valve is open
    const house = moving && !anyZone;                  // pump running with no valve open: someone opened a tap
    const tank = num(L.tank), bar = num(L.pressure);
    const bh = !!(w.settings && (w.settings.borehole_entity || w.settings.borehole_switch)), bhOn = bh && !!L.borehole;
    const narrow = (this.shadowRoot.host.clientWidth || 800) < 560;
    const n = zones.length + 1;                          // branch 0 = house, 1.. = valves
    const lastOn = moving ? Math.max(0, ...[house ? 0 : -1, ...zOn.map((o, i) => (o ? i + 1 : -1))]) : 0;
    const name = (t, max = 11) => { t = String(t || ""); return t.length > max ? t.slice(0, max - 1) + "…" : t; };
    // geometry: wide = a row of drops off a horizontal main line; narrow (phone) = branches off a vertical riser
    let Wd, H, yMain, tank0, pump, pipeIn, trunk, branch, icon, label, spray, hit;
    if (!narrow) {
      const step = 76, x0 = 210, yTop = 46; yMain = 112;
      Wd = Math.max(420, x0 + n * step - step / 2 + 30); H = 150;
      tank0 = { x: 16, y: 34, w: 58, h: 92, lx: 45, ly: 142, la: "middle" };
      pump = { x: 130, y: yMain, vx: 130, vy: yMain - 32, va: "middle", lx: 130, ly: yMain + 38 };
      pipeIn = `M74 ${yMain} H 108`;
      const bx = (i) => x0 + i * step;
      trunk = (i, j) => `M${i < 0 ? 152 : bx(i)} ${yMain} H ${bx(j)}`;
      branch = (i) => `M${bx(i)} ${yMain} V ${yTop}`;
      icon = (i) => [bx(i), yTop];
      label = (i) => [bx(i), yMain + 22, "middle", 11];
      spray = (i) => [bx(i), yTop - 22];
      hit = (i) => [bx(i) - step / 2, yTop - 24, step, yMain + 34 - (yTop - 24)];
    } else {
      const xr = 170, y0 = bh ? 136 : 112, step = 46;   // with a borehole everything moves down to make room for its pipe
      Wd = 340; H = y0 + (n - 1) * step + 26; yMain = bh ? 64 : 40;
      tank0 = bh ? { x: 16, y: 34, w: 58, h: 54, lx: 45, ly: 104, la: "middle" } : { x: 16, y: 8, w: 58, h: 64, lx: 45, ly: 88, la: "middle" };
      pump = { x: 120, y: yMain, vx: 120, vy: yMain - 28, va: "middle", lx: 120, ly: yMain + 36 };
      pipeIn = `M74 ${yMain} H 98`;
      const by = (i) => y0 + i * step;
      trunk = (i, j) => (i < 0 ? `M142 ${yMain} H ${xr} V ${by(j)}` : `M${xr} ${by(i)} V ${by(j)}`);
      branch = (i) => `M${xr} ${by(i)} H 228`;
      icon = (i) => [228, by(i)];
      label = (i) => [252, by(i) + 4, "start", 13];
      spray = (i) => [228, by(i) - 22];
      hit = (i) => [200, by(i) - step / 2, Wd - 200, step];
    }
    const key = JSON.stringify([narrow, Wd, zones.map((z, i) => [z.id, z.name, zOn[i], z.available]), pumpRun, house, w.tripped, tank === null ? null : Math.round(tank / 5), bar === null ? null : bar.toFixed(1), f.tank_level, bh, bhOn, L.tank_l === undefined ? null : Math.round(L.tank_l / 50), !!L.borehole_long]);
    if (el._key === key) return;
    el._key = key;
    const seg = (d, on, cls = "") => `<g class="${on ? "on" : ""} ${cls}"><path class="pipe" d="${d}"/><path class="wet" d="${d}"/><path class="drops" d="${d}"/></g>`;
    const pct = (x, y) => `left:${(x / Wd) * 100}%;top:${(y / H) * 100}%`;
    // tank with its water level (or a plain supply when there's no level sensor)
    const lvl = tank === null ? 0.7 : Math.max(0.04, Math.min(1, tank / 100));
    const T = tank0, wy = T.y + T.h * (1 - lvl);
    let svg = `<defs><clipPath id="wtclip"><rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="8"/></clipPath></defs>
      <g clip-path="url(#wtclip)"><rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" fill="color-mix(in srgb, var(--c-water) 6%, var(--card))"/>
        <path class="wave" d="M4 ${wy} q 8 -4 16 0 t 16 0 t 16 0 t 16 0 t 16 0 V ${T.y + T.h} H 4 Z" fill="color-mix(in srgb, var(--c-water) ${tank !== null && tank < 20 ? "55" : "40"}%, transparent)"/></g>
      <rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="8" fill="none" stroke="var(--line)" stroke-width="2"/>
      <text class="val" x="${T.x + T.w / 2}" y="${T.y + T.h / 2 + (L.tank_l !== undefined && L.tank_l !== null ? -2 : 4)}">${tank === null ? "" : `${Math.round(tank)}%`}</text>
      ${L.tank_l !== undefined && L.tank_l !== null ? `<text class="lbl" x="${T.x + T.w / 2}" y="${T.y + T.h / 2 + 12}" style="font-size:10px">${L.tank_l} L</text>` : ""}
      <text class="lbl" x="${T.lx}" y="${T.ly}">${f.tank_level || w.tank ? "Tank" : "Supply"}</text>`;
    if (bh) {   // borehole feeding the top of the tank – water dots while it pumps
      const bx = T.x + T.w / 2, right = narrow ? 104 : 112;
      svg += seg(`M${right} 10 H ${bx} V ${T.y}`, bhOn) + `<text class="lbl ${bhOn ? "on" : ""}" x="${right + 6}" y="14" style="text-anchor:start${L.borehole_long ? ";fill:var(--c-bad)" : ""}">${L.borehole_long ? "Borehole ⚠" : bhOn ? "Borehole on" : "Borehole"}</text>`;
    }
    // pipes: supply -> pump -> main line -> branches
    svg += seg(pipeIn, moving);
    svg += seg(trunk(-1, lastOn), moving);
    if (lastOn < n - 1) svg += seg(trunk(lastOn, n - 1), false);
    svg += seg(branch(0), house);
    zones.forEach((z, i) => { svg += seg(branch(i + 1), zOn[i], "valve"); });
    // spray over open valves
    zones.forEach((z, i) => { if (zOn[i]) { const [sx, sy] = spray(i + 1); svg += `<g class="on"><g class="spray" transform="translate(${sx} ${sy})"><circle r="2.2" style="--dx:-9px"/><circle r="2.2" style="--dx:0px"/><circle r="2.2" style="--dx:9px"/></g></g>`; } });
    // pump body with impeller
    const px = pump.x, py = pump.y;
    svg += `<g class="${pumpRun ? "spin" : ""}"><circle cx="${px}" cy="${py}" r="22" fill="var(--card)" stroke="${w.tripped ? "var(--c-bad)" : pumpRun ? "var(--c-water)" : "var(--line)"}" stroke-width="2.5"/>
      <g class="imp"><path d="M${px} ${py} l0 -14 a14 14 0 0 1 10 4 Z M${px} ${py} l12.1 7 a14 14 0 0 1 -4.9 9.5 Z M${px} ${py} l-12.1 7 a14 14 0 0 1 -5.3 -9.5 Z" fill="${pumpRun ? "var(--c-water)" : "var(--muted)"}" opacity=".85"/></g>
      <circle cx="${px}" cy="${py}" r="3" fill="var(--card)"/></g>
      <text class="lbl ${pumpRun ? "on" : ""}" x="${pump.lx}" y="${pump.ly}">${w.tripped ? "Stopped" : pumpRun ? "Pump running" : "Pump"}</text>`;
    if (bar !== null) svg += `<text class="val" x="${pump.vx}" y="${pump.vy}">${bar.toFixed(1)} bar</text>`;
    // labels
    const lab = (i, text, on) => { const [lx, ly, la, mx] = label(i); return `<text class="lbl ${on ? "on" : ""}" x="${lx}" y="${ly}" style="text-anchor:${la}">${esc(name(text, mx))}</text>`; };
    svg += lab(0, "House", house);
    zones.forEach((z, i) => { svg += lab(i + 1, z.name, zOn[i]); });
    // icons on top of the drops (HTML so ha-icon works)
    let icons = `<div class="ic ${house ? "on" : ""}" style="${pct(...icon(0))}"><ha-icon icon="mdi:home-variant"></ha-icon></div>`;
    zones.forEach((z, i) => { icons += `<div class="ic ${zOn[i] ? "on" : ""} ${z.available === false ? "bad" : ""}" style="${pct(...icon(i + 1))}" title="${esc(z.name)}"><ha-icon icon="mdi:sprinkler-variant"></ha-icon></div>`; });
    // the whole valve (icon + pipe + name) is one big tap target – easy on a phone
    zones.forEach((z, i) => {
      const [hx, hy, hw, hh] = hit(i + 1);
      icons += `<button class="wzhit" data-irr="zpop" data-zid="${esc(z.id)}" style="left:${(hx / Wd) * 100}%;top:${(hy / H) * 100}%;width:${(hw / Wd) * 100}%;height:${(hh / H) * 100}%" aria-label="${esc(z.name)}: ${zOn[i] ? "watering – tap to stop" : "tap to water"}"></button>`;
    });
    el.innerHTML = `<div class="wdia" style="max-width:${Math.round(Wd * 1.25)}px" aria-label="${esc(pumpRun ? "Pump running" : "Pump standing by")}${anyZone ? ", watering " + zones.filter((_, i) => zOn[i]).map((z) => z.name).join(", ") : house ? ", water to the house" : ""}">
      <svg viewBox="0 0 ${Wd} ${H}">${svg}</svg>${icons}</div>`;
  },

  // tap a valve on the drawing: a small sheet to water it (minutes adjustable) or stop it
  _zonePop(zid) {
    let sh = this.shadowRoot.getElementById("zsheet");
    if (zid === null) { if (sh) sh.remove(); this._zpop = null; return; }
    const ir = this._irr || { zones: [] }, z = (ir.zones || []).find((x) => x.id === zid);
    if (!z) return this._zonePop(null);
    if (this._zpop?.id !== zid) this._zpop = { id: zid, minutes: z.minutes || 10 };
    const on = !!z.on || (ir.run && ir.run.zone === zid);
    this._zpop.on = on;
    if (!sh) { sh = document.createElement("div"); sh.id = "zsheet"; this._main.appendChild(sh); }
    const m = this._zpop.minutes;
    sh.innerHTML = `<div class="zback" data-irr="zpopclose"></div>
      <div class="zbox" role="dialog" aria-label="${esc(z.name)}">
        <div class="zhd"><ha-icon icon="mdi:sprinkler-variant"></ha-icon><b>${esc(z.name)}</b><button class="iconbtn" data-irr="zpopclose" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button></div>
        ${on ? `<p class="zst">Watering now${ir.run && ir.run.zone === zid && ir.run.left ? ` · ${esc(String(ir.run.left))} left` : ""}</p>
          <button class="btn danger big" data-irr="zpopstop">Stop watering</button>`
        : `${z.available === false ? `<p class="zst bad">The valve switch is unavailable</p>` : ""}
          <div class="zmin"><button class="btn round" data-irr="zpopm" data-d="-5" aria-label="5 minutes less">−</button><span><b>${m}</b> min</span><button class="btn round" data-irr="zpopm" data-d="5" aria-label="5 minutes more">+</button></div>
          <div class="zquick">${[5, 10, 15, 20, 30].map((q) => `<button class="pchip" data-irr="zpopset" data-m="${q}" aria-pressed="${q === m}">${q}</button>`).join("")}</div>
          <button class="btn primary big" data-irr="zpoprun" ${z.available === false ? "disabled" : ""}>Water for ${m} min</button>`}
        <p class="zmsg msg" id="zpopmsg"></p>
      </div>`;
  },

  /* ------------------------------------------------------------ irrigation */
  _irrFresh() {
    const ir = this._irr || { zones: [], settings: {} };
    const st = ir.settings || {};
    return JSON.parse(JSON.stringify({
      zones: ir.zones.map((z) => ({ id: z.id, name: z.name, entity: z.entity, minutes: z.minutes, enabled: z.enabled !== false, setpoint: z.setpoint ?? null })),
      programs: st.programs || [], amount: st.amount ?? 100, skip_when_raining: st.skip_when_raining !== false,
      pump_entity: st.pump_entity || "", rain_entity: st.rain_entity || "", manual_auto_off: st.manual_auto_off !== false, max_minutes: st.max_minutes ?? 120,
    }));
  },

  _valvePicker(pk) {
    const q = pk.querySelector(".vq"), hid = pk.querySelector("[data-zk=entity]"), list = pk.querySelector(".vlist");
    const all = () => this._irrOpts?.valves || [];
    let hi = 0, shown = [];
    const name = (id) => (all().find((o) => o.id === id) || {}).name || id;
    const draw = () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const typed = words.length && q.value !== name(hid.value);
      shown = all().filter((o) => !typed || words.every((w) => (o.name + " " + o.id + " " + (o.area || "")).toLowerCase().includes(w))).slice(0, 60);
      hi = Math.min(hi, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length ? shown.map((o, i) => `<button type="button" class="vo ${i === hi ? "on" : ""} ${o.id === hid.value ? "cur" : ""}" data-i="${i}" role="option">${esc(o.name)}<small>${o.area ? esc(o.area) + " · " : ""}${esc(o.id)}</small></button>`).join("")
        : `<div class="none">Nothing matches “${esc(q.value)}”</div>`;
      list.hidden = false;
      const on = list.querySelector(".vo.on"); if (on) on.scrollIntoView({ block: "nearest" });
    };
    const pick = (o) => {
      hid.value = o.id; q.value = o.name; list.hidden = true;
      hid.dispatchEvent(new Event("change"));
    };
    q.addEventListener("focus", () => { q.select(); hi = Math.max(0, all().findIndex((o) => o.id === hid.value)); draw(); });
    q.addEventListener("input", () => { hi = 0; draw(); });
    q.addEventListener("keydown", (e) => {
      if (list.hidden && e.key !== "Escape") draw();
      if (e.key === "ArrowDown") { hi = Math.min(hi + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { if (shown[hi]) pick(shown[hi]); e.preventDefault(); }
      else if (e.key === "Escape") { list.hidden = true; q.value = hid.value ? name(hid.value) : ""; }
    });
    list.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus while tapping a choice
    list.addEventListener("click", (e) => { const b = e.target.closest(".vo"); if (b) pick(shown[Number(b.dataset.i)]); });
    q.addEventListener("blur", () => { list.hidden = true; q.value = hid.value ? name(hid.value) : ""; });
  },
  _irrChanged() { this._irrDirty = true; const a = this.shadowRoot.getElementById("irract"); if (a) a.hidden = false; const m = this.shadowRoot.getElementById("irrmsg"); if (m) m.textContent = ""; },

  _renderIrr() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const card = $("wirr"); if (!card) return;
    const ir = this._irr || { zones: [], settings: {} };
    card.hidden = !ir.zones.length && !this._isAdmin;
    if (card.hidden) return;
    this._renderIrrLive();
    const key = JSON.stringify([ir.zones.map((z) => [z.id, z.name, z.entity, z.minutes, z.enabled, z.setpoint]), ir.settings, !!this._irrOpts, this._irrEdit, ir.setpoint_ok]);
    const a = this.shadowRoot.activeElement;
    if (this._irrDirty || (a && a.closest && a.closest("#irrform")) || this._irrShown === key) return;
    this._irrShown = key;
    this._irrDraft = this._irrFresh();
    this._renderIrrForm();
  },

  _renderIrrLive() {
    if (this._zpop && this.shadowRoot.getElementById("zsheet")) {      // the open valve sheet follows the valve (started / finished)
      const ir = this._irr || {}, z = (ir.zones || []).find((x) => x.id === this._zpop.id);
      if (z && (!!z.on || (ir.run && ir.run.zone === z.id)) !== this._zpop.on) this._zonePop(z.id);
    }
    const $ = (id) => this.shadowRoot.getElementById(id);
    if (this._tab === "property") this._renderProperty();
    if (this._water && $("wpumpdia")) this._renderWaterDiagram();
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
        <div class="small">${esc(run.by)} · valve ${run.index} of ${run.total}${run.next.length ? ` · then ${esc(run.next.join(", "))}` : ""}${ir.pump_on ? " · pump on" : ""}${(() => { const z = ir.zones.find((x) => x.id === run.zone); return z && z.setpoint ? ` · pressure ${z.setpoint.toFixed(1)} bar` : ""; })()}</div>
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
      const zu = this._water?.usage?.zones?.[z.id];
      const use = zu ? (z.on ? ` · ${fmtL(zu.last || 0)} so far` : ` · today ${fmtL(zu.today)} · month ${fmtL(zu.month)}${zu.last ? ` · last run ${fmtL(zu.last)}` : ""}`) : "";
      el.querySelector(".z2").textContent = (z.on ? "open" : !z.available ? "valve unavailable" : z.last ? `last ${fmtT(z.last)}` : "not watered yet") + use;
    });
    const log = $("irrlog");
    if (log) this._setHTML(log, (ir.today || []).length ? (ir.today.slice().reverse().map((e) => `<span>${new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>${esc(e.name)} · ${esc(e.by)}</span><span>${Math.round(e.secs / 60)} min</span>`).join("")) : `<span class="muted">Nothing yet today</span>`);
  },

  _renderIrrForm() {
    const el = this.shadowRoot.getElementById("irrform"); if (!el) return;
    const d = this._irrDraft, admin = this._isAdmin, opts = this._irrOpts || { valves: [], rain: [] };
    const edit = admin && (this._irrEdit || !d.zones.length);
    const spOk = !!(this._irr && this._irr.setpoint_ok);
    const sel = (key, list, val, empty) => `<select data-ik="${key}">${`<option value="">${empty}</option>`}${list.map((o) => `<option value="${esc(o.id)}" ${o.id === val ? "selected" : ""}>${esc(o.name)} (${esc(o.id)})</option>`).join("")}
      ${val && !list.some((o) => o.id === val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ""}</select>`;
    let zones;
    if (edit) {
      zones = d.zones.map((z, i) => `<div class="zedit" data-zi="${i}">
          <input type="text" data-zk="name" value="${esc(z.name)}" aria-label="Valve name" placeholder="Name, e.g. Binne Tuin">
          <div class="vpick"><input type="text" class="vq" autocomplete="off" spellcheck="false" aria-label="Valve switch – type to search" placeholder="Type to search the valve switch…" value="${esc(z.entity ? ((opts.valves.find((o) => o.id === z.entity) || {}).name || z.entity) : "")}"><input type="hidden" data-zk="entity" value="${esc(z.entity || "")}"><div class="vlist" role="listbox" hidden></div></div>
          <span class="ctl"><input type="number" data-zk="minutes" value="${z.minutes}" min="0" max="240" step="1" aria-label="Minutes">min</span>
          ${spOk ? `<span class="ctl" title="Booster pressure while this valve waters – empty = normal"><input type="number" data-zk="setpoint" value="${z.setpoint ?? ""}" min="0.3" max="12" step="0.1" placeholder="—" aria-label="Pressure set point in bar">bar</span>` : ""}
          <span class="chips"><button class="iconbtn" data-irr="zup" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button class="iconbtn" data-irr="zdown" ${i === d.zones.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button><button class="iconbtn" data-irr="zdel" aria-label="Remove valve"><ha-icon icon="mdi:delete-outline"></ha-icon></button></span></div>`).join("")
        + `<div class="actions" style="justify-content:flex-start"><button class="btn" data-irr="zadd">+ Add valve</button>${d.zones.length ? `<button class="btn" data-irr="editdone" style="margin-left:auto">Done editing</button>` : ""}</div>`;
    } else {
      zones = `<div class="zgrid ${spOk ? "sp" : ""}">${d.zones.map((z, i) => `<div class="zrow" data-zi="${i}">
          <div class="zname" data-zlive="${esc(z.id)}"><span class="zdot"></span><div style="min-width:0"><div class="t">${esc(z.name)}</div><div class="z2"></div></div></div>
          <span class="ctl"><input type="number" data-zk="minutes" value="${z.minutes}" min="0" max="240" step="1" aria-label="${esc(z.name)} minutes">min</span>
          ${spOk ? `<span class="ctl" title="Booster pressure while this valve waters – empty = normal"><input type="number" data-zk="setpoint" value="${z.setpoint ?? ""}" min="0.3" max="12" step="0.1" placeholder="—" aria-label="${esc(z.name)} pressure set point in bar">bar</span>` : ""}
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
      <div class="sub2">Valves <span class="r muted small">${edit ? `name · valve switch · minutes${spOk ? " · pressure" : ""}` : `minutes${spOk ? " · pressure set point (empty = normal)" : ""} per valve`}</span></div>${zones}
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
        z[k] = k === "minutes" ? Number(inp.value) : k === "setpoint" ? (inp.value === "" ? null : Number(inp.value)) : inp.value;
        if (k === "entity" && !z.name) { const o = (this._irrOpts?.valves || []).find((x) => x.id === inp.value); if (o) { z.name = o.name; inp.closest(".zedit").querySelector("[data-zk=name]").value = o.name; } }
        this._irrChanged(); };
      inp.addEventListener("input", up); inp.addEventListener("change", up);
    });
    el.querySelectorAll(".vpick").forEach((pk) => this._valvePicker(pk));
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
      case "zpop": return this._zonePop(b.dataset.zid);
      case "zpopclose": return this._zonePop(null);
      case "zpopm": if (this._zpop) { this._zpop.minutes = Math.max(1, Math.min(240, this._zpop.minutes + Number(b.dataset.d))); this._zonePop(this._zpop.id); } return;
      case "zpopset": if (this._zpop) { this._zpop.minutes = Number(b.dataset.m); this._zonePop(this._zpop.id); } return;
      case "zpoprun": case "zpopstop": {
        const p = this._zpop; if (!p) return;
        b.disabled = true;
        try {
          this._irr = await this._hass.callWS(act === "zpoprun" ? { type: `${DOMAIN}/irrigation_action`, action: "run_zone", zone: p.id, minutes: p.minutes }
            : { type: `${DOMAIN}/irrigation_action`, action: "stop" });
          this._zonePop(null); this._renderIrr();
        } catch (e) { b.disabled = false; const m = $("zpopmsg"); if (m) { m.textContent = e.message || "Failed"; m.className = "zmsg msg err"; } }
        return;
      }
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
