// Hamlet Home – "Blocks" power flow, in the style of the Victron VRM dashboard:
// boxes with a big value, a 3-hour sparkline and a details footer, joined by animated lines.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const W = (w) => {
  const v = num(w);
  if (v === null) return ["–", ""];
  return Math.abs(v) >= 10000 ? [(v / 1000).toFixed(1), "kW"] : [String(Math.round(v)), "W"];
};
const short = (name) => String(name || "").replace(/\s*(kwh\s*meter\s*)?power$/i, "").replace(/\s*kwh\s*meter$/i, "");
const fmtH = (h) => { if (num(h) === null) return null; const m = Math.round(h * 60); return m < 60 ? `${m} min` : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.floor(m / 60)} h ${m % 60} min`; };

// Where the power comes from right now, shared out like the wiring:
// grid-side (AC-in) loads take grid first; essential loads take solar, then battery, then the grid that's left;
// the battery charges from what solar is left over, then from the grid.
export function flowMix(L, lsplit) {
  const sol0 = Math.max(num(L.solar) || 0, 0), bOut = Math.max(-(num(L.battery) || 0), 0), bIn = Math.max(num(L.battery) || 0, 0);
  const gIn0 = L.grid_available === false ? 0 : Math.max(num(L.grid) || 0, 0);
  const non = lsplit ? Math.max(num(L.load_noness) || 0, 0) : 0;
  const ess = Math.max(lsplit && num(L.load_ess) !== null ? num(L.load_ess) : num(L.load) || 0, 0);
  let sol = sol0, gIn = gIn0;
  const g1 = Math.min(gIn, non); gIn -= g1;
  const s1 = Math.min(sol, non - g1); sol -= s1;
  const s2 = Math.min(sol, ess); sol -= s2;
  const b2 = Math.min(bOut, ess - s2);
  const g2 = Math.min(gIn, ess - s2 - b2); gIn -= g2;
  const s3 = Math.min(sol, bIn);
  const g3 = Math.min(gIn, bIn - s3);
  const mix = (parts) => { const t = parts.reduce((a, [, v]) => a + v, 0); return t < 1 ? [] : parts.filter(([, v]) => v / t > 0.02).map(([k, v]) => [k, v / t]); };
  return {
    noness: mix([["grid", g1], ["solar", s1]]),
    home: mix([["solar", s2], ["battery", b2], ["grid", g2]]),
    charge: bIn > 0 ? mix([["solar", s3], ["grid", g3]]) : [["battery", 1]],
  };
}
const SRC = { solar: "var(--c-solar)", battery: "var(--c-batt)", grid: "var(--c-grid)" };
const SRC_NAME = { solar: "Solar", battery: "Battery", grid: "Grid" };
// six dot slots per pattern, shared out by share (every source that matters gets at least one)
function slots(mix, n = 6) {
  if (!mix.length) return [];
  const out = [];
  const counts = mix.map(([k, v]) => [k, Math.max(1, Math.round(v * n))]);
  while (counts.reduce((a, [, c]) => a + c, 0) > n) { const i = counts.reduce((m, x, j) => (x[1] > counts[m][1] ? j : m), 0); counts[i][1]--; }
  while (counts.reduce((a, [, c]) => a + c, 0) < n) counts[0][1]++;
  // spread them out: S B S B S S rather than S S S S B B
  const left = counts.map(([k, c]) => [k, c]);
  for (let i = 0; i < n; i++) { left.sort((a, b) => b[1] - a[1]); const pick = left.find(([k, c]) => c > 0 && k !== out[out.length - 1]) || left[0]; out.push(pick[0]); pick[1]--; }
  return out;
}

const STYLE = `
:host { display: block; --gap: 14px; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { position: relative; }
svg.lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 0; }
svg.lines .base { fill: none; stroke: var(--line); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round; opacity: .9; }
svg.lines .flow { fill: none; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 1 13; opacity: 0; }
svg.lines .flow.on { opacity: 1; animation: run var(--dur, 2s) linear infinite; }
svg.lines .flow.rev { animation-direction: reverse; }
@keyframes run { to { stroke-dashoffset: -28; } }
svg.lines .flow.mix.on { animation-name: run6; }
@keyframes run6 { to { stroke-dashoffset: -84; } }
.mixbar { display: flex; height: 6px; margin: 6px 12px 2px; border-radius: 3px; overflow: hidden; gap: 2px; background: var(--line); }
.mixbar i { display: block; height: 100%; transition: flex-grow .8s ease; }
.mixtxt { padding: 0 12px; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wrap.m .mixbar { margin: 4px 10px 2px; height: 5px; } .wrap.m .mixtxt { padding: 0 10px; font-size: 10.5px; }
.row { display: flex; gap: var(--gap); position: relative; z-index: 1; }
.row.top > .box { flex: 1 1 0; }
.mid { display: flex; justify-content: center; margin: 46px 0; position: relative; z-index: 1; }
.row.bottom { justify-content: center; }
.row.bottom > .box { flex: 0 1 calc((100% - 2 * var(--gap)) / 3); }
.box { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; min-width: 0; display: flex; flex-direction: column; }
.box .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; font-size: 13px; color: var(--primary-text-color); }
.box .hd ha-icon { --mdc-icon-size: 18px; color: var(--bc); }
.box .hd .r { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
.box .big { padding: 2px 12px 0; font-size: clamp(24px, 3.2vw, 34px); line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap; }
.box .big small { font-size: .62em; color: var(--muted); margin-left: 3px; }
.box .spark { height: 38px; display: block; width: 100%; margin-top: 4px; }
.box .spark path.a { fill: color-mix(in srgb, var(--bc) 16%, transparent); }
.box .spark path.l { fill: none; stroke: color-mix(in srgb, var(--bc) 70%, transparent); stroke-width: 1.4; }
.box .ft { margin-top: auto; background: color-mix(in srgb, var(--primary-text-color) 4%, transparent); border-top: 1px solid var(--line);
  padding: 7px 12px; font-size: 12.5px; display: grid; gap: 3px; font-variant-numeric: tabular-nums; }
.box .ft .r2 { display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
.box .ft .r2 span:first-child { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.box .ft .r2 span:last-child { white-space: nowrap; }
.box.dead { opacity: .55; }
.box.dead .big { color: var(--muted); }
/* inverter */
.inv { width: min(220px, 40%); border-radius: 10px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--inv) 70%, black 10%); background: var(--card); }
.inv .top { background: var(--inv); color: #fff; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 10px; position: relative; overflow: hidden; }
.inv .top ha-icon { --mdc-icon-size: 34px; }
.inv .top .w { font-size: 18px; font-variant-numeric: tabular-nums; }
.inv .top::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent); transform: translateX(-100%); }
.inv.busy .top::after { animation: shine 2.4s ease-in-out infinite; }
@keyframes shine { to { transform: translateX(100%); } }
.inv .bar { height: 4px; background: var(--c-solar); }
.inv .st { text-align: center; padding: 8px; font-size: 13px; color: var(--accent); }
/* battery level */
.lvl { margin: 6px 12px 2px; height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--c-batt) 15%, transparent); overflow: hidden; position: relative; }
.lvl i { position: absolute; inset: 0 auto 0 0; background: var(--c-batt); border-radius: 5px; transition: width .8s ease; }
.lvl.chg i { background-image: repeating-linear-gradient(-45deg, rgba(255,255,255,.28) 0 6px, transparent 6px 12px); background-size: 34px 34px; animation: stripes 1.2s linear infinite; }
@keyframes stripes { to { background-position: 34px 0; } }
@media (prefers-reduced-motion: reduce) { svg.lines .flow.on, .inv.busy .top::after, .lvl.chg i { animation: none; } svg.lines .flow.on { stroke-dasharray: none; opacity: .6; } }
/* phone / narrow card: two columns with a bus line down the middle (set from the card's own width) */
.wrap.m { --gap: 10px; }
.wrap.m .row { display: grid; grid-template-columns: 1fr 30px 1fr; grid-auto-flow: row dense; gap: 10px 0; }
.wrap.m .row > .box { grid-column: 3; }
.wrap.m .row > .box[data-side="l"] { grid-column: 1; }
.wrap.m .mid { margin: 26px 0; }
.wrap.m .inv { width: 62%; }
.wrap.m .inv .top { padding: 10px; } .wrap.m .inv .top ha-icon { --mdc-icon-size: 26px; } .wrap.m .inv .top .w { font-size: 16px; }
.wrap.m .inv .st { padding: 6px; font-size: 12px; }
.wrap.m .box .hd { padding: 8px 10px 0; font-size: 12px; gap: 6px; }
.wrap.m .box .hd ha-icon { --mdc-icon-size: 16px; }
.wrap.m .box .hd .r { font-size: 11px; }
.wrap.m .box .big { padding: 0 10px; font-size: 22px; }
.wrap.m .box .spark { display: none; }
.wrap.m .box .lvl { margin: 4px 10px 2px; height: 7px; }
.wrap.m .box .ft { padding: 5px 10px; font-size: 11px; gap: 1px; }
.wrap.m .box .ft .r2:nth-child(n+4) { display: none; }
.wrap.m svg.lines .base { stroke-width: 5; }
.wrap.m svg.lines .flow { stroke-width: 3.5; }
`;

class HamletHomeBlocks extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._html = {}; }
  set hass(h) { this._hass = h; }
  set data(d) { this._d = d; this._render(); }

  connectedCallback() {
    this._ro = new ResizeObserver(() => this._lines());
    this._ro.observe(this);
  }
  disconnectedCallback() { this._ro?.disconnect(); }

  _st(eid) { return eid ? this._hass?.states?.[eid] : null; }
  _val(eid, unit) {
    const st = this._st(eid);
    if (!st || ["unavailable", "unknown"].includes(st.state)) return null;
    const n = num(st.state);
    if (n === null) return st.state;
    const u = unit ?? st.attributes.unit_of_measurement ?? "";
    return `${n.toFixed(Math.abs(n) < 10 && n % 1 ? 1 : n % 1 && Math.abs(n) < 100 ? 1 : 0)}${u ? ` ${u}` : ""}`;
  }
  _set(id, html) { const el = this.shadowRoot.getElementById(id); if (el && this._html[id] !== html) { this._html[id] = html; el.innerHTML = html; } }

  _spark(col, color) {
    const rows = (this._d.rows || []).slice(-36).filter((r) => num(r[col]) !== null);
    if (rows.length < 3) return "";
    const vals = rows.map((r) => Number(r[col]));
    const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
    const x = (i) => (i / (vals.length - 1)) * 100, y = (v) => 36 - ((v - lo) / (hi - lo)) * 32;
    const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(1)}`).join("");
    return `<svg class="spark" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true" style="--bc:${color}">
      <path class="a" d="${line}L100,${y(lo)}L0,${y(lo)}Z"/><path class="l" d="${line}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  _box(id, icon, color, title) {
    const side = ["grid", "pvac", "batt"].includes(id) ? "l" : "r";
    return `<div class="box" id="b-${id}" data-side="${side}" style="--bc:${color}"><div class="hd"><ha-icon icon="${icon}"></ha-icon><span>${esc(title)}</span><span class="r" id="r-${id}"></span></div>
      <div class="big" id="v-${id}"></div><div id="s-${id}"></div><div class="ft" id="f-${id}"></div></div>`;
  }

  _render() {
    const d = this._d; if (!d) return;
    const f = d.features || {}, L = d.live || {}, E = d.flow_entities || {};
    const split = !!(f.pv_ac || f.pv_dc);
    const lsplit = !!f.load_split, hasGrid = !!(f.grid || f.grid_status);
    const tops = [];
    if (hasGrid) tops.push("grid");
    if (f.pv_ac) tops.push("pvac");
    if (lsplit) tops.push("noness");
    tops.push("home");
    const bottoms = [];
    if (f.battery) bottoms.push("batt");
    if (split ? f.pv_dc : true) bottoms.push("pvdc");
    const shape = `${tops.join()}|${bottoms.join()}`;
    if (this._shape !== shape) {
      this._shape = shape; this._html = {};
      const T = {
        grid: ["mdi:transmission-tower", "var(--c-grid)", "Grid"], pvac: ["mdi:solar-panel-large", "var(--c-solar)", "PV Inverter"],
        noness: ["mdi:power-socket-za", "var(--c-load)", "AC Loads"], home: ["mdi:home-lightning-bolt", "var(--c-load)", lsplit ? "Essential Loads" : "AC Loads"],
        batt: ["mdi:battery-high", "var(--c-batt)", "Battery"], pvdc: ["mdi:solar-power-variant", "var(--c-solar)", split ? "PV Charger" : "Solar"],
      };
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="wrap" id="wrap"><svg class="lines" id="lines"></svg>
        <div class="row top">${tops.map((k) => this._box(k, ...T[k])).join("")}</div>
        <div class="mid"><div class="inv" id="inv" style="--inv:#2f6fd0"><div class="top"><ha-icon icon="mdi:sine-wave"></ha-icon><span class="w" id="inv-w"></span></div><div class="bar"></div><div class="st" id="inv-st"></div></div></div>
        <div class="row bottom">${bottoms.map((k) => this._box(k, ...T[k])).join("")}</div></div>`;
      this._tops = tops; this._bottoms = bottoms;
      requestAnimationFrame(() => this._lines(true));
    }
    const big = (id, w) => { const [v, u] = W(w); this._set(`v-${id}`, `${v}<small>${u}</small>`); };
    const rows = (pairs) => pairs.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `<div class="r2"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
    const down = L.grid_available === false;
    const grid = num(L.grid), solar = num(L.solar), load = num(L.load), batt = num(L.battery), soc = num(L.soc);
    const ess = num(L.load_ess), noness = num(L.load_noness);

    // grid
    if (hasGrid) {
      const box = this.shadowRoot.getElementById("b-grid");
      box.classList.toggle("dead", down);
      this._set("v-grid", down ? `Down` : (() => { const [v, u] = W(grid); return `${v}<small>${u}</small>`; })());
      this._set("r-grid", down ? "no grid" : grid === null ? "" : Math.abs(grid) < 20 ? "idle" : grid > 0 ? "buying" : "selling");
      this._set("s-grid", this._spark(3, "var(--c-grid)"));
      const v = this._val(E.grid_voltage), a = this._val(E.grid_current);
      this._set("f-grid", rows([["L1", [v, a, grid !== null && !down ? `${Math.round(grid)} W` : null].filter(Boolean).join("   ") || (down ? "no grid" : "–")]]));
    }
    if (f.pv_ac) {
      big("pvac", L.solar_ac);
      this._set("s-pvac", "");
      this._set("f-pvac", rows((E.solar_ac || []).map((e) => [short(this._st(e)?.attributes?.friendly_name || e), this._val(e)])));
    }
    if (lsplit) {
      const box = this.shadowRoot.getElementById("b-noness");
      box.classList.toggle("dead", down);
      this._set("v-noness", down ? "No power" : (() => { const [v, u] = W(noness); return `${v}<small>${u}</small>`; })());
      this._set("f-noness", rows([["grid side (AC-in)", down ? "off" : noness !== null ? `${Math.round(noness)} W` : "–"]]));
      this._set("s-noness", "");
    }
    // house / essential loads, with the single loads listed like Victron's L1 rows
    const homeW = lsplit && ess !== null ? ess : load;
    big("home", homeW);
    const fm = flowMix(L, lsplit), mix = fm.home;
    this._set("s-home", mix.length ? `<div class="mixbar" role="img" aria-label="Power comes from ${mix.map(([k, v]) => `${SRC_NAME[k]} ${Math.round(v * 100)}%`).join(", ")}">${mix.map(([k, v]) => `<i style="flex-grow:${v};background:${SRC[k]}"></i>`).join("")}</div>
      <div class="mixtxt">${mix.map(([k, v]) => `${SRC_NAME[k]} ${Math.round(v * 100)}%`).join(" · ")}</div>` : (lsplit ? "" : this._spark(2, "var(--c-load)")));
    const ex = (d.extras || []).filter((e) => num(e.w) !== null && e.w >= 1);
    this._set("f-home", rows(ex.length ? ex.map((e) => [short(e.name), `${Math.round(e.w)} W`]) : [[lsplit ? "inverter output (AC-out)" : "house", homeW !== null ? `${Math.round(homeW)} W` : "–"]]));

    // battery
    if (f.battery) {
      const o = d.battery || {};
      this._set("v-batt", soc !== null ? `${soc.toFixed(soc % 1 ? 1 : 0)}<small>%</small>` : (() => { const [v, u] = W(batt); return `${v}<small>${u}</small>`; })());
      this._set("r-batt", batt === null ? "" : Math.abs(batt) < 20 ? "idle" : batt > 0 ? `+${Math.round(batt)} W` : `−${Math.round(-batt)} W`);
      this._set("s-batt", soc !== null ? `<div class="lvl ${batt > 20 && soc < 99.5 ? "chg" : ""}"><i style="width:${Math.max(soc, 2)}%"></i></div>` : this._spark(4, "var(--c-batt)"));
      const icon = this.shadowRoot.querySelector("#b-batt .hd ha-icon");
      if (icon) icon.setAttribute("icon", batt > 20 ? "mdi:battery-charging-high" : soc === null ? "mdi:battery" : `mdi:battery${soc >= 95 ? "" : "-" + Math.max(10, Math.round(soc / 10) * 10)}`);
      // the time comes first: on a phone only the first three rows fit
      this._set("f-batt", rows([[o.state === "charging" ? "Full in" : down ? "Battery lasts" : "If the power goes off",
          o.state === "charging" ? fmtH(o.full_h) : o.backup_h !== null && o.backup_h !== undefined ? fmtH(o.backup_h) : null],
        ["Voltage", this._val(E.battery_voltage)], ["Current", this._val(E.battery_current)], ["Temperature", this._val(E.battery_temp)]]));
    }
    // PV charger (MPPTs on the DC side) or plain solar
    if (this._bottoms.includes("pvdc")) {
      const pv = split ? num(L.solar_dc) : solar;
      big("pvdc", pv);
      this._set("s-pvdc", split ? "" : this._spark(1, "var(--c-solar)"));
      const list = split ? E.solar_dc || [] : E.solar || [];
      this._set("f-pvdc", rows(list.map((e) => [short(this._st(e)?.attributes?.friendly_name || e), this._val(e)])));
    }

    // inverter: state from the GX if mapped, else worked out
    const inv = split ? num(L.inverter) : batt !== null ? -batt : null;
    const stTxt = this._val(E.inverter_state);
    const derived = down ? (inv !== null && inv > 20 ? "Inverting (off grid)" : "Off grid")
      : inv === null ? "Inverter" : inv > 20 ? "Inverting" : inv < -20 ? "Charging" : "Passthru";
    this._set("inv-w", inv !== null ? `${Math.abs(Math.round(inv))} W` : "");
    this._set("inv-st", esc(stTxt && typeof stTxt === "string" && !/^\d/.test(stTxt) ? stTxt : derived));
    this.shadowRoot.getElementById("inv")?.classList.toggle("busy", inv !== null && Math.abs(inv) > 20);

    // flows (+ = along the drawn path)
    this._flows = {
      grid: [down ? 0 : (lsplit && grid !== null && noness !== null ? grid - noness : grid), "var(--c-grid)"],
      pvac: [num(L.solar_ac), "var(--c-solar)"],
      // the AC-in loads hang on the grid side: grid first (solar it passes through counts too)
      noness: [down ? 0 : noness, down ? [] : fm.noness],
      home: [homeW, mix],
      batt: [batt, fm.charge],
      pvdc: [split ? num(L.solar_dc) : solar, "var(--c-solar)"],
    };
    this._animate();
  }

  // draw the connectors between the boxes (positions read from the layout)
  _lines(force) {
    const wrap = this.shadowRoot.getElementById("wrap"), svg = this.shadowRoot.getElementById("lines");
    if (!wrap || !svg) return;
    const R = wrap.getBoundingClientRect();
    if (!R.width) return;
    const box = (id) => { const el = this.shadowRoot.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height, cx: r.left - R.left + r.width / 2 }; };
    const inv = box("inv"); if (!inv) return;
    const key = `${Math.round(R.width)}x${Math.round(R.height)}`;
    if (!force && this._lkey === key) return;
    this._lkey = key;
    const narrow = R.width < 640;
    if (wrap.classList.contains("m") !== narrow) {
      // switch layout first, then measure again once it has settled
      wrap.classList.toggle("m", narrow);
      this._lkey = null;
      requestAnimationFrame(() => this._lines(true));
      return;
    }
    const paths = [];
    if (narrow) {
      // a bus line down the middle; each box joins it from its inner edge
      const bx = inv.cx;
      for (const k of this._tops) {
        const b = box(`b-${k}`); if (!b) continue;
        const left = b.cx < bx, edge = left ? b.x + b.w : b.x, my = b.y + Math.min(b.h / 2, 34);
        const toInv = k === "grid" || k === "pvac";
        paths.push([k, toInv ? `M${edge},${my}H${bx}V${inv.y}` : `M${bx},${inv.y}V${my}H${edge}`]);
      }
      for (const k of this._bottoms) {
        const b = box(`b-${k}`); if (!b) continue;
        const left = b.cx < bx, edge = left ? b.x + b.w : b.x, my = b.y + Math.min(b.h / 2, 34);
        paths.push([k, k === "batt" ? `M${bx},${inv.y + inv.h}V${my}H${edge}` : `M${edge},${my}H${bx}V${inv.y + inv.h}`]);
      }
    } else {
      const busY = inv.y - 23, dcY = inv.y + inv.h + 23;
      // AC side: every top box drops to the AC line, which runs into the inverter's top
      for (const k of this._tops) {
        const b = box(`b-${k}`); if (!b) continue;
        const from = { x: b.cx, y: b.y + b.h };
        // grid and grid-tie PV feed the line (drawn toward the inverter); loads are fed (drawn from the inverter)
        const toInv = k === "grid" || k === "pvac";
        paths.push([k, toInv ? `M${from.x},${from.y}V${busY}H${inv.cx}V${inv.y}` : `M${inv.cx},${inv.y}V${busY}H${from.x}V${from.y}`]);
      }
      // DC side: battery and PV charger meet under the inverter
      for (const k of this._bottoms) {
        const b = box(`b-${k}`); if (!b) continue;
        paths.push([k, k === "batt" ? `M${inv.cx},${inv.y + inv.h}V${dcY}H${b.cx}V${b.y}` : `M${b.cx},${b.y}V${dcY}H${inv.cx}V${inv.y + inv.h}`]);
      }
    }
    svg.setAttribute("viewBox", `0 0 ${R.width} ${R.height}`);
    svg.innerHTML = paths.map(([k, d]) => `<path class="base" d="${d}"/><g id="fg-${k}" data-d="${d}"></g>`).join("");
    this._animate();
  }

  _animate() {
    if (!this._flows) return;
    for (const [k, [w, color]] of Object.entries(this._flows)) {
      const g = this.shadowRoot.getElementById(`fg-${k}`); if (!g) continue;
      const v = num(w) || 0, on = Math.abs(v) >= 20;
      // battery path is drawn inverter → battery: + (charging) runs forward; PV paths run toward the inverter
      const forward = k === "batt" ? v > 0 : k === "grid" ? v > 0 : true;
      // one colour, or a mix of sources: dots alternate colours in proportion (6 slots per pattern)
      const mixed = Array.isArray(color) && color.length > 1;
      const pattern = Array.isArray(color) ? (color.length ? slots(color) : []) : null;
      const sig = mixed ? pattern.join(",") : Array.isArray(color) ? (color[0]?.[0] || "load") : color;
      if (g.dataset.sig !== sig) {
        g.dataset.sig = sig;
        const d = g.dataset.d;
        if (mixed) {
          g.innerHTML = [...new Set(pattern)].map((src) => `<path class="flow mix" d="${d}" style="stroke:${SRC[src]};stroke-dasharray:${pattern.map((p) => (p === src ? "1 13" : "0 14")).join(" ")}"/>`).join("");
        } else {
          const c = Array.isArray(color) ? (color.length ? SRC[color[0][0]] : "var(--c-load)") : color;
          g.innerHTML = `<path class="flow" d="${d}" style="stroke:${c}"/>`;
        }
      }
      const dur = Math.max(0.6, 3 - Math.log10(Math.abs(v) + 1) * 0.6);
      g.querySelectorAll(".flow").forEach((el) => {
        el.classList.toggle("on", on);
        el.classList.toggle("rev", on && !forward);
        el.style.setProperty("--dur", `${(mixed ? dur * 3 : dur).toFixed(2)}s`);   // 3× longer pattern, same speed
      });
    }
  }
}

if (!customElements.get("hamlet-home-blocks")) customElements.define("hamlet-home-blocks", HamletHomeBlocks);
