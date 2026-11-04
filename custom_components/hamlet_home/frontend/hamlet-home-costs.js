// Hamlet Home – Costs tab: rand and kWh per period, daily / monthly charts, load breakdown, battery life.
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
// 12 345.67 – space between thousands, point for decimals
const group = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, "\u2009");
const kwh = (v) => (num(v) === null ? "–" : `${group(v, Math.abs(v) < 100 ? 1 : 0)} kWh`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
// load breakdown colours: validated categorical set (violet, orange, aqua, blue, red); rest of house = grey
const LOAD_COLORS = ["var(--c-l1)", "var(--c-l2)", "var(--c-l3)", "var(--c-l4)", "var(--c-l5)"];

const STYLE = `
:host { display: contents; --c-l1: #6250d6; --c-l2: #eb6834; --c-l3: #1baf7a; --c-l4: #2a78d6; --c-l5: #e34948; --c-rest: #a3a29b; --c-other: #6b6a64; }
:host([dark]) { --c-l1: #9085e9; --c-l2: #d95926; --c-l3: #199e70; --c-l4: #3987e5; --c-l5: #e66767; --c-rest: #6f6e68; --c-other: #a3a29b; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; min-width: 0; grid-column: span 12; }
@media (min-width: 700px) { .s3 { grid-column: span 6; } .s6 { grid-column: span 12; } }
@media (min-width: 1100px) { .s3 { grid-column: span 3; } .s6 { grid-column: span 6; } }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 ha-icon { --mdc-icon-size: 20px; color: var(--muted); }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.note { grid-column: 1 / -1; font-size: 13px; color: var(--muted); padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--c-warn) 10%, transparent); }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { font: inherit; font-size: 13px; padding: 4px 12px; border: 0; background: transparent; color: var(--primary-text-color); cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--text-primary-color, #fff); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.btn.sm { font-size: 13px; padding: 4px 10px; }
.msg { font-size: 13px; } .msg.err { color: var(--c-bad); } .msg.ok { color: var(--c-ok); }
/* period cards */
.big { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.big > div { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.big .k { font-size: 12px; color: var(--muted); }
.big .v { font-size: clamp(18px, 4.4vw, 22px); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rows { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 0 10px; align-items: center; font-size: 13.5px; }
.rows > * { padding: 7px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.rows ha-icon { --mdc-icon-size: 17px; color: var(--ic, var(--muted)); }
.rows .l { color: var(--muted); line-height: 1.25; }
.rows .a, .rows .b { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rows .b { color: var(--muted); }
/* breakdown */
.seg-bar { display: flex; height: 40px; border-radius: 8px; overflow: hidden; gap: 2px; margin: 4px 0 14px; }
.seg-bar i { display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 12px; color: #fff; font-weight: 500;
  min-width: 2px; white-space: nowrap; overflow: hidden; }
.loads { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto auto; gap: 0 10px; align-items: center; font-size: 14px; }
.loads > * { padding: 8px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.loads .sw { width: 12px; height: 12px; border-radius: 3px; padding: 0; border: 0; }
.loads .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.loads .v, .loads .p, .loads .d { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.loads .p { color: var(--muted); font-size: 13px; }
.loads .d { font-size: 12px; color: var(--muted); min-width: 56px; }
.loads .tot { font-weight: 500; border-bottom: 0; }
/* charts */
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--muted); margin: 0 0 6px; }
.key { display: inline-flex; align-items: center; gap: 6px; }
.key i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.chartwrap { position: relative; }
.chartwrap svg { display: block; width: 100%; touch-action: pan-y; }
.axis text { fill: var(--muted); font-size: 11px; }
.grid line { stroke: var(--line); }
.tip { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); white-space: nowrap; display: none; z-index: 2; top: 0; }
.tip .row { display: flex; align-items: center; gap: 6px; } .tip .row span:last-child { margin-left: auto; padding-left: 14px; font-variant-numeric: tabular-nums; }
.tip i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
/* battery */
.meter { height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--c-batt) 18%, transparent); overflow: hidden; margin: 6px 0 2px; }
.meter i { display: block; height: 100%; background: var(--c-batt); border-radius: 5px; }
.btiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
@media (max-width: 520px) { .btiles { grid-template-columns: 1fr 1fr; } }
.btiles > div { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.btiles .k { font-size: 12px; color: var(--muted); } .btiles .v { font-size: 19px; font-variant-numeric: tabular-nums; white-space: nowrap; } .btiles .s { font-size: 12px; color: var(--muted); }
/* settings */
.field { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.field .hint { display: block; font-size: 12px; color: var(--muted); }
.field .ctl { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
input[type=number], input[type=date] { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); width: 120px; }
input[type=date] { width: 150px; }
.hist { display: grid; grid-template-columns: 160px repeat(3, minmax(70px, 110px)) 32px; justify-content: start; gap: 6px 8px; align-items: center; font-size: 13px; margin-top: 8px; }
.hist input { width: 100%; }
.hist .h { color: var(--muted); font-size: 12px; }
.ib { font: inherit; width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; padding: 0; }
.actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 12px; flex-wrap: wrap; }
details summary { cursor: pointer; font-size: 14px; color: var(--muted); }
.empty { padding: 40px 0; text-align: center; color: var(--muted); font-size: 14px; }
`;

class HamletHomeCosts extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._split = "today";
    this._dUnit = "kwh";
    this._mUnit = "kwh";
  }
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    this.toggleAttribute("dark", !!h.themes?.darkMode);
    if (first) this._load();
  }
  connectedCallback() { this._timer = setInterval(() => { if (!this._editing()) this._load(); }, 5 * 60 * 1000); }
  disconnectedCallback() { clearInterval(this._timer); this._ro?.disconnect(); }
  _editing() { const a = this.shadowRoot.activeElement; return !!(a && a.closest && a.closest("#settings, #battset")); }

  async _load() {
    try { this._c = await this._hass.callWS({ type: `${DOMAIN}/costs` }); }
    catch (e) { this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card empty">Costs couldn't load: ${esc(e.message || e)}</div>`; return; }
    if (!this._built) this._build();
    this._render();
    if (this._c.note) setTimeout(() => this._load(), 15000);   // still reading history
  }

  _cur(v, d = 2) { const c = this._c?.tariff?.currency || "R"; return num(v) === null ? "–" : `${c} ${group(v, Math.abs(v) >= 10000 ? 0 : d)}`; }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="note" id="note" hidden></div>
      <section class="card s3" id="p-today"></section><section class="card s3" id="p-month"></section>
      <section class="card s3" id="p-year"></section><section class="card s3" id="p-since"></section>
      <section class="card s6" id="split"></section>
      <section class="card s6" id="batt"></section>
      <section class="card s6"><h2><ha-icon icon="mdi:chart-bar"></ha-icon>Daily <span class="sub"><span class="seg" data-g="dUnit"><button data-v="kwh">kWh</button><button data-v="r">Rand</button></span></span></h2>
        <div class="legend" id="dleg"></div><div class="chartwrap" id="dchart"></div></section>
      <section class="card s6"><h2><ha-icon icon="mdi:calendar-month"></ha-icon>Monthly <span class="sub"><span class="seg" data-g="mUnit"><button data-v="kwh">kWh</button><button data-v="r">Rand</button></span></span></h2>
        <div class="legend" id="mleg"></div><div class="chartwrap" id="mchart"></div></section>
      <section class="card" id="settings" hidden></section>`;
    const root = this.shadowRoot;
    root.addEventListener("click", (ev) => this._click(ev));
    this._ro = new ResizeObserver(() => { this._chart("d"); this._chart("m"); });
    this._ro.observe(root.getElementById("dchart"));
  }

  _render() {
    const C = this._c, $ = (id) => this.shadowRoot.getElementById(id);
    const note = $("note");
    note.hidden = !C.note && C.ready;
    note.textContent = C.note ? `${C.note} – older months fill in as it goes.` : "Reading today's history…";
    const P = C.periods;
    const today = new Date();
    this._period($("p-today"), "Today", today.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }), P.today, "mdi:calendar-today");
    this._period($("p-month"), "This month", `${MONTHS[today.getMonth()]} ${today.getFullYear()}`, P.month, "mdi:calendar-month");
    this._period($("p-year"), "This year", String(today.getFullYear()), P.year, "mdi:calendar");
    this._period($("p-since"), "Since " + niceDate(P.since.from), `${group(P.since.days)} days`, P.since, "mdi:infinity");
    this._renderSplit();
    this._renderBattery();
    this.shadowRoot.querySelectorAll("[data-g]").forEach((g) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", this["_" + g.dataset.g] === b.dataset.v)));
    this._chart("d"); this._chart("m");
    if (!this._editing()) this._renderSettings();
  }

  _period(el, title, sub, p, icon) {
    if (!p.days) { el.innerHTML = `<h2><ha-icon icon="${icon}"></ha-icon>${esc(title)}</h2><div class="empty">No data yet</div>`; return; }
    const row = (ic, color, label, a, b) => `<ha-icon icon="${ic}" style="--ic:${color}"></ha-icon><span class="l">${label}</span><span class="a">${a}</span><span class="b">${b}</span>`;
    el.innerHTML = `<h2><ha-icon icon="${icon}"></ha-icon>${esc(title)} <span class="sub">${esc(sub)}</span></h2>
      <div class="big"><div><div class="k">Grid cost</div><div class="v">${this._cur(p.grid_cost)}</div></div>
        <div><div class="k">Saved</div><div class="v">${this._cur(p.saved)}</div></div></div>
      <div class="rows">
        ${row("mdi:home-lightning-bolt", "var(--c-load)", "House used", kwh(p.load), this._cur(p.load_value))}
        ${row("mdi:solar-power-variant", "var(--c-solar)", "Solar", kwh(p.solar), this._cur(p.solar_value))}
        ${row("mdi:transmission-tower-import", "var(--c-grid)", "Bought", kwh(p.import), this._cur(p.grid_cost + p.export_credit))}
        ${p.export > 0.05 ? row("mdi:transmission-tower-export", "var(--c-grid)", "Sold", kwh(p.export), this._cur(p.export_credit)) : ""}
        ${row("mdi:battery-arrow-down", "var(--c-batt)", "Battery used", kwh(p.discharge), this._cur(p.battery_value))}
        ${row("mdi:battery-arrow-up", "var(--c-batt)", "Battery charged", kwh(p.charge), "")}
      </div>
      <p class="muted small" style="margin:8px 0 0">${p.self_sufficiency !== null ? `${p.self_sufficiency}% from solar &amp; battery · ` : ""}rand = kWh at the grid price</p>`;
  }

  /* ---------------------------------------------------- where it went */
  _renderSplit() {
    const el = this.shadowRoot.getElementById("split"), C = this._c;
    if (!C.loads.length) {
      el.innerHTML = `<h2><ha-icon icon="mdi:chart-timeline-variant"></ha-icon>Where the power went</h2><p class="muted small">Pick the loads (Swembad, Heatpump, geysers …) under Settings → Devices &amp; services → Hamlet Home → Configure → Costs &amp; load breakdown.</p>`;
      return;
    }
    const month = this._split === "month";
    const p = month ? C.periods.month : C.periods.today, prev = month ? C.periods.last_month_same : C.periods.yesterday;
    const total = p.load || 0;
    // colour follows the load (its place in the setup list), never its rank; 6th and later share "Other loads"
    const parts = C.loads.map((l, i) => ({ name: l.name, v: p.loads[l.entity_id] || 0, was: prev.loads?.[l.entity_id],
      color: LOAD_COLORS[i] || "var(--c-other)", other: i >= LOAD_COLORS.length }));
    const known = parts.reduce((a, x) => a + x.v, 0);
    const restV = Math.max(total - known, 0);
    parts.push({ name: "Rest of the house", v: restV, was: prev.days ? Math.max((prev.load || 0) - Object.values(prev.loads || {}).reduce((a, b) => a + b, 0), 0) : null, color: "var(--c-rest)", rest: true });
    const others = parts.filter((x) => x.other);
    const barParts = [...parts.filter((x) => !x.other && !x.rest),
      ...(others.length ? [{ name: "Other loads", v: others.reduce((a, x) => a + x.v, 0), color: "var(--c-other)" }] : []),
      parts[parts.length - 1]];
    const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
    const delta = (x) => {
      if (x.was === null || x.was === undefined || !prev.days) return "";
      const d = x.v - x.was;
      if (Math.abs(d) < 0.05) return "– same";
      return `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}`;
    };
    el.innerHTML = `<h2><ha-icon icon="mdi:chart-timeline-variant"></ha-icon>Where the power went
      <span class="sub"><span class="seg" id="splitseg"><button data-split="today" aria-pressed="${!month}">Today</button><button data-split="month" aria-pressed="${month}">This month</button></span></span></h2>
      ${total > 0 ? `<div class="seg-bar" role="img" aria-label="House use split by load">${barParts.filter((x) => x.v > 0).map((x) =>
        `<i style="flex:${x.v} 0 0;background:${x.color}" title="${esc(x.name)} ${x.v.toFixed(1)} kWh">${pct(x.v) >= 8 ? `${Math.round(pct(x.v))}%` : ""}</i>`).join("")}</div>` : `<div class="empty">No use measured yet</div>`}
      <div class="loads">${parts.map((x) => `<span class="sw" style="background:${x.color}"></span><span class="n">${esc(x.name)}${x.other ? ` <span class="muted small">· other loads</span>` : ""}</span>
        <span class="v">${kwh(x.v)}</span><span class="p">${total > 0 ? `${Math.round(pct(x.v))}%` : ""}</span><span class="d" title="vs ${month ? "same days last month" : "yesterday"}">${delta(x)}</span>`).join("")}
        <span class="tot"></span><span class="n tot">House total</span><span class="v tot">${kwh(total)}</span><span class="p tot">${this._cur(p.load_value, 0)}</span><span class="d tot"></span></div>
      <p class="muted small" style="margin:8px 0 0">▲▼ kWh compared with ${month ? "the same days last month" : "yesterday"}.</p>`;
  }

  /* -------------------------------------------------------- battery */
  _renderBattery() {
    const el = this.shadowRoot.getElementById("batt"), b = this._c.battery, s = this._c.settings || {}, admin = this._c.is_admin;
    const head = `<h2><ha-icon icon="mdi:battery-heart-variant"></ha-icon>Battery cost &amp; life <span class="sub">${b ? `since ${esc(niceDate(b.since))}` : ""}</span></h2>`;
    const form = admin ? `<details id="battset" ${!b ? "open" : ""} style="margin-top:12px"><summary>Battery details</summary>
      <div class="field"><label for="c-price">Price paid<span class="hint">whole battery bank</span></label><span class="ctl">${esc(this._c.tariff.currency || "R")}<input id="c-price" type="number" min="0" step="100" value="${s.battery_price ?? ""}"></span></div>
      <div class="field"><label for="c-life">Good for<span class="hint">cycles × usable kWh, e.g. 6000 × 30.7 = 184 200</span></label><span class="ctl"><input id="c-life" type="number" min="1" step="100" value="${s.battery_lifetime_kwh ?? ""}">kWh</span></div>
      <div class="field"><label for="c-inst">Installed on<span class="hint">empty = from the first day of history</span></label><span class="ctl"><input id="c-inst" type="date" value="${s.battery_installed ?? ""}"></span></div>
      <div class="actions"><span class="msg" id="bmsg"></span><button class="btn primary" data-a="savebatt">Save</button></div></details>` : "";
    if (!b) {
      el.innerHTML = head + `<p class="muted small" style="margin:0">${admin ? "Enter what the battery cost and how many kWh it's good for to see its cost per kWh and the life left." : "Your installer can add the battery's price and lifetime here."}</p>` + form;
      return;
    }
    const open = el.querySelector("#battset")?.open;
    el.innerHTML = head + `
      <div style="display:flex;justify-content:space-between;font-size:13px"><span>${group(b.used_kwh, 0)} kWh through the battery</span><span class="muted">${b.life_used_pct}% of its life</span></div>
      <div class="meter" role="meter" aria-valuenow="${b.life_used_pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Battery life used"><i style="width:${Math.max(b.life_used_pct, 0.5)}%"></i></div>
      <div class="btiles">
        <div><div class="k">Left in the battery</div><div class="v">${group(b.left_kwh, 0)} kWh</div><div class="s">worth ${this._cur(b.value_left, 0)}</div></div>
        <div><div class="k">Life left</div><div class="v">${b.years_left !== null ? `${b.years_left} years` : "–"}</div><div class="s">${b.days_left !== null ? `${group(b.days_left)} days at ${b.per_day_kwh} kWh/day` : "needs a few days of use"}</div></div>
        <div><div class="k">Battery cost</div><div class="v">${this._cur(b.cost_per_kwh)}</div><div class="s">per kWh cycled</div></div>
        <div><div class="k">Wear so far</div><div class="v">${this._cur(b.cost_used, 0)}</div><div class="s">of the price</div></div>
        <div><div class="k">Its kWh were worth</div><div class="v">${this._cur(b.value_delivered, 0)}</div><div class="s">at the grid price</div></div>
        <div><div class="k">Data</div><div class="v">${group(b.data_days)} days</div><div class="s">${b.data_days < 30 ? "more history = better" : "of history"}</div></div>
      </div>` + form;
    if (open) { const d = el.querySelector("#battset"); if (d) d.open = true; }
  }

  /* --------------------------------------------------------- charts */
  _chart(which) {
    const daily = which === "d";
    const wrap = this.shadowRoot.getElementById(daily ? "dchart" : "mchart"); if (!wrap || !this._c) return;
    const rand = (daily ? this._dUnit : this._mUnit) === "r";
    const rows = daily ? this._c.daily.slice(-14) : this._c.monthly.slice(-12);
    const series = rand
      ? [["grid_cost", "Grid cost", "var(--c-grid)"], ["load_value", "House at grid price", "var(--c-load)"], ["solar_value", "Solar value", "var(--c-solar)"]]
      : [["import", "Bought from grid", "var(--c-grid)"], ["load", "House used", "var(--c-load)"], ["solar", "Solar", "var(--c-solar)"]];
    this.shadowRoot.getElementById(daily ? "dleg" : "mleg").innerHTML = series.map(([, l, c]) => `<span class="key"><i style="background:${c}"></i>${l}</span>`).join("")
      + `<span style="margin-left:auto">${rand ? esc(this._c.tariff.currency || "R") : "kWh"} per ${daily ? "day" : "month"}</span>`;
    const has = rows.filter((r) => r.load !== undefined);
    if (!has.length) { wrap.innerHTML = `<div class="empty">No data yet</div>`; return; }
    const W = Math.max(wrap.clientWidth, 280), H = 230, m = { l: 46, r: 6, t: 8, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(1, ...rows.flatMap((r) => series.map(([k]) => r[k] || 0)));
    const stepRaw = max / 4, mag = 10 ** Math.floor(Math.log10(stepRaw)), step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= stepRaw);
    const ymax = Math.ceil(max / step) * step;
    const y = (v) => m.t + ih - (v / ymax) * ih;
    const gw = iw / rows.length, bw = Math.max(Math.min((gw - 10) / 3 - 2, 22), 3);
    const every = gw < (daily ? 18 : 40) ? 2 : 1;   // thin out the labels on a phone
    const label = (r) => {
      if (daily) { const d = new Date(r.day + "T12:00"); return rows.length > 10 ? String(d.getDate()) : d.toLocaleDateString([], { day: "numeric", month: "short" }); }
      const [yy, mm] = r.month.split("-").map(Number); return mm === 1 || r === rows[0] ? `${MONTHS[mm - 1]} ${String(yy).slice(2)}` : MONTHS[mm - 1];
    };
    const bar = (x, v, c) => {
      if (!v || v <= 0) return "";
      const top = y(v), h = m.t + ih - top, r = Math.min(4, bw / 2, h);
      return `<path d="M${x},${m.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${m.t + ih}Z" fill="${c}"/>`;
    };
    const ticks = []; for (let v = 0; v <= ymax + 1e-9; v += step) ticks.push(v);
    const fmtT = (v) => (rand ? (v >= 1000 ? `${group(v / 1000, v % 1000 ? 1 : 0)}k` : group(v)) : group(v, v % 1 ? 1 : 0));
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${daily ? "Daily" : "Monthly"} ${rand ? "rand" : "kWh"}">
      <g class="grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtT(v)}</text>`).join("")}
        ${rows.map((r, i) => ((rows.length - 1 - i) % every ? "" : `<text x="${m.l + gw * (i + 0.5)}" y="${H - 6}" text-anchor="middle" ${daily && i === rows.length - 1 ? 'font-weight="600"' : ""}>${esc(label(r))}</text>`)).join("")}</g>
      ${rows.map((r, i) => { const x0 = m.l + gw * i + (gw - (bw * 3 + 4)) / 2; return series.map(([k, , c], j) => bar(x0 + j * (bw + 2), r[k], c)).join(""); }).join("")}
      <rect id="hl" x="0" y="${m.t}" width="${gw}" height="${ih}" fill="var(--primary-text-color)" opacity="0"/>
      <rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip"></div>`;
    const hit = wrap.querySelector("#hit"), tip = wrap.querySelector(".tip"), hl = wrap.querySelector("#hl");
    const show = (ev) => {
      const rc = hit.getBoundingClientRect(), i = Math.min(rows.length - 1, Math.max(0, Math.floor(((ev.clientX - rc.left) / rc.width) * rows.length)));
      const r = rows[i];
      hl.setAttribute("x", m.l + gw * i); hl.setAttribute("opacity", ".05");
      const title = daily ? new Date(r.day + "T12:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : `${MONTHS[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}`;
      tip.innerHTML = `<b>${esc(title)}</b>${r.load === undefined ? `<div class="muted">no data</div>` : series.map(([k, l, c]) => `<div class="row"><i style="background:${c}"></i><span>${l}</span><span>${rand ? this._cur(r[k], 0) : kwh(r[k])}</span></div>`).join("")
        + (rand ? `<div class="row"><span>Saved</span><span>${this._cur(r.saved, 0)}</span></div>` : `<div class="row"><span>Battery used</span><span>${kwh(r.discharge)}</span></div>`)}`;
      tip.style.display = "block";
      const left = ((m.l + gw * (i + 0.5)) / W) * wrap.clientWidth;
      tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), wrap.clientWidth - tip.offsetWidth)}px`;
    };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.style.display = "none"; hl.setAttribute("opacity", "0"); });
  }

  /* ------------------------------------------------------- settings */
  _renderSettings() {
    const el = this.shadowRoot.getElementById("settings"); if (!el) return;
    el.hidden = !this._c.is_admin;
    if (!this._c.is_admin) return;
    const s = this._c.settings || {}, t = this._c.tariff || {}, c = esc(t.currency || "R");
    if (!this._hist) this._hist = (t.history || []).map((h) => ({ ...h }));
    const open = el.querySelector("details")?.open;
    el.innerHTML = `<details ${open ? "open" : ""}><summary>Costs settings</summary>
      <div class="field"><label for="c-start">Count totals from<span class="hint">"Since" card, and how far back history is read (e.g. 2024-04-01). Empty = 2 years.</span></label>
        <span class="ctl"><input id="c-start" type="date" value="${s.history_start ?? ""}"></span></div>
      <div style="margin-top:12px;font-size:14px">Earlier electricity prices<div class="muted small">Today's price is set on the Energy tab (${c} ${t.import}/kWh). Add the old prices with the day each one ended, so past months use the price of the time.</div></div>
      <div class="hist"><span class="h">Price ended on</span><span class="h">Buying ${c}/kWh</span><span class="h">Selling ${c}/kWh</span><span class="h">Fixed ${c}/day</span><span></span>
        ${this._hist.map((h, i) => `<input type="date" data-h="${i}" data-k="until" value="${esc(h.until || "")}"><input type="number" step="0.01" min="0" data-h="${i}" data-k="import" value="${h.import ?? ""}">
          <input type="number" step="0.01" min="0" data-h="${i}" data-k="export" value="${h.export ?? ""}"><input type="number" step="0.01" min="0" data-h="${i}" data-k="daily_fixed" value="${h.daily_fixed ?? ""}">
          <button class="ib" data-a="delh" data-i="${i}" aria-label="Remove">✕</button>`).join("")}</div>
      <div class="actions" style="justify-content:space-between"><button class="btn sm" data-a="addh">+ Add an earlier price</button>
        <span style="display:flex;gap:8px;align-items:center"><span class="msg" id="smsg"></span><button class="btn primary" data-a="savesettings">Save</button></span></div>
      <p class="muted small">Loads in "Where the power went": Settings → Devices &amp; services → Hamlet Home → Configure → Costs &amp; load breakdown.</p></details>`;
    el.querySelectorAll("[data-h]").forEach((inp) => inp.addEventListener("input", () => { this._hist[Number(inp.dataset.h)][inp.dataset.k] = inp.value; }));
  }

  async _click(ev) {
    const seg = ev.target.closest("[data-g] button");
    if (seg) { this["_" + seg.closest("[data-g]").dataset.g] = seg.dataset.v; return this._render(); }
    const sp = ev.target.closest("[data-split]");
    if (sp) { this._split = sp.dataset.split; return this._renderSplit(); }
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const $ = (id) => this.shadowRoot.getElementById(id);
    if (b.dataset.a === "addh") { this._hist.push({ until: "", import: "" }); return this._renderSettings(); }
    if (b.dataset.a === "delh") { this._hist.splice(Number(b.dataset.i), 1); return this._renderSettings(); }
    const save = async (settings, msgId) => {
      const msg = $(msgId);
      try {
        await this._hass.callWS({ type: `${DOMAIN}/costs_settings`, settings });
        this._hist = null;
        this.shadowRoot.activeElement?.blur?.();
        await this._load();
        const m2 = $(msgId); if (m2) { m2.textContent = "Saved"; m2.className = "msg ok"; }
      } catch (e) { if (msg) { msg.textContent = e.message || "Could not save"; msg.className = "msg err"; } }
    };
    if (b.dataset.a === "savebatt") {
      return save({ battery_price: $("c-price").value || null, battery_lifetime_kwh: $("c-life").value || null, battery_installed: $("c-inst").value || null }, "bmsg");
    }
    if (b.dataset.a === "savesettings") {
      const hist = this._hist.filter((h) => h.until || h.import).map((h) => ({ until: h.until, import: h.import, export: h.export, daily_fixed: h.daily_fixed }));
      return save({ history_start: $("c-start").value || null, tariff_history: hist }, "smsg");
    }
  }
}

if (!customElements.get("hamlet-home-costs")) customElements.define("hamlet-home-costs", HamletHomeCosts);
