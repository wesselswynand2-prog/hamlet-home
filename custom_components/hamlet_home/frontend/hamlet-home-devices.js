// Hamlet Home – Devices tab: heat pumps, heaters, aircons … on a Shelly, with Timer / Solar / On / Off (like the pool pump).
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmtW = (w) => (num(w) === null ? "–" : Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
const WDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MODES = [["auto", "Timer"], ["solar", "Solar"], ["on", "On"], ["off", "Off"]];
const KINDS = [["heatpump", "Heat pump"], ["heater", "Heater"], ["aircon", "Aircon"], ["pump", "Pump"], ["light", "Lights"], ["chlorinator", "Chlorinator / salt cell"], ["cleaner", "Pool cleaner"], ["charger", "EV / charger"], ["other", "Other"]];

const STYLE = `
:host { display: contents; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; min-width: 0; grid-column: span 12; }
@media (min-width: 980px) { .s6 { grid-column: span 6; } }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 ha-icon { --mdc-icon-size: 22px; color: var(--accent); }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 8px; }
h3 { font-size: 14px; font-weight: 500; margin: 16px 0 0; display: flex; align-items: baseline; gap: 8px; }
h3 .sub { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--muted); }
.muted { color: var(--muted); } .small { font-size: 13px; }
.row2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; padding: 4px 10px; border-radius: 14px;
  background: color-mix(in srgb, var(--bc) 16%, transparent); color: var(--primary-text-color); }
.badge .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bc); }
.modes3 { display: inline-grid; grid-template-columns: repeat(4, auto); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-top: 12px; }
.modes3 button { font: inherit; font-size: 14px; padding: 8px 18px; border: 0; background: transparent; color: var(--primary-text-color); cursor: pointer; }
.modes3 button[aria-pressed="true"] { background: var(--accent); color: var(--text-primary-color, #fff); }
@media (max-width: 420px) { .modes3 button { padding: 8px 12px; } }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; margin-top: 12px; }
.tile { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; min-width: 0; }
.tile .k { font-size: 12px; color: var(--muted); } .tile .v { font-size: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.field { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.field .hint { display: block; font-size: 12px; color: var(--muted); }
.field .ctl { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
input[type=number], input[type=text], input[type=time], select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); min-width: 0; }
input[type=number] { width: 90px; }
.field select, .field input[type=text] { width: min(260px, 58vw); }
.actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.btn.danger { color: var(--c-bad); border-color: color-mix(in srgb, var(--c-bad) 50%, transparent); }
.msg { font-size: 13px; } .msg.err { color: var(--c-bad); } .msg.ok { color: var(--c-ok); }
.iconbtn { background: transparent; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
.iconbtn ha-icon { --mdc-icon-size: 22px; }
.sched { display: grid; grid-template-columns: auto 1fr auto; gap: 8px 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.sched .days { grid-column: 2 / -1; display: flex; gap: 4px; flex-wrap: wrap; }
.days button { font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.days button[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: var(--accent); }
.switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.switch span { position: absolute; inset: 0; background: var(--line); border-radius: 22px; cursor: pointer; transition: .2s; }
.switch span::before { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
.switch input:checked + span { background: var(--accent); } .switch input:checked + span::before { transform: translateX(18px); }
details summary { cursor: pointer; font-size: 14px; color: var(--muted); }
.empty { padding: 32px 16px; text-align: center; color: var(--muted); }
.note { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
`;

class HamletHomeDevices extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._draft = {};     // run-time drafts per device
    this._shown = {};     // what's drawn, to avoid redrawing over the user's typing
    this._html = {};
  }
  set hass(h) { this._hass = h; }
  set isAdmin(v) { this._admin = v; }
  // "" = Devices tab, "pool" = Pool tab: each tab shows only its own devices
  set area(v) { this._area = v || ""; }

  update(s) {
    if (s.devices !== undefined) { this._all = s.devices || []; this._devs = this._all.filter((d) => (d.area || "") === (this._area || "")); }
    if (s.solar_loads !== undefined) this._solar = s.solar_loads;
    if (s.is_admin !== undefined) this._admin = s.is_admin;
    this._render();
  }

  _set(id, html) { const el = this.shadowRoot.getElementById(id); if (el && this._html[id] !== html) { this._html[id] = html; el.innerHTML = html; } }
  _focusIn(id) { const a = this.shadowRoot.activeElement; const el = this.shadowRoot.getElementById(id); return !!(a && el && el.contains(a)); }

  _render() {
    if (!this._devs) return;
    const ids = this._devs.map((d) => d.id).join(",");
    if (this._built !== ids) {
      this._built = ids;
      this._html = {}; this._shown = {};
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>
        ${this._devs.map((d) => `<section class="card s6" data-d="${esc(d.id)}">
          <h2 id="h-${esc(d.id)}"></h2><div id="b-${esc(d.id)}"></div><div id="sol-${esc(d.id)}"></div>
          <h3 id="sh-${esc(d.id)}"></h3><div id="sc-${esc(d.id)}"></div><div id="ad-${esc(d.id)}"></div></section>`).join("")}
        ${!this._devs.length ? `<section class="card empty">${this._area === "pool" ? `No pool devices yet.${this._admin ? " Add the pool heat pump, lights, a chlorinator or cleaner on a Shelly below – each gets Timer, Solar, On or Off." : ""}` : `No devices yet.${this._admin ? " Add a heat pump, heater, aircon or anything on a Shelly below – it then works like the pool pump: Timer, Solar, On or Off." : ""}`}</section>` : ""}
        ${this._admin ? `<section class="card ${this._devs.length % 2 ? "s6" : ""}" id="addcard"><details id="adddet" ${this._devs.length ? "" : "open"}><summary>+ Add a ${this._area === "pool" ? "pool device" : "device"}</summary><div id="addform"></div></details></section>` : ""}`;
      if (!this._listening) {
        this._listening = true;
        this.shadowRoot.addEventListener("click", (ev) => this._click(ev));
        this.shadowRoot.addEventListener("input", (ev) => this._input(ev));
        this.shadowRoot.addEventListener("change", (ev) => this._input(ev));
        this.shadowRoot.addEventListener("toggle", (ev) => { if (ev.target.id === "adddet" && ev.target.open) this._renderForm(null); }, true);
      }
      if (this._admin && !this._devs.length) this._renderForm(null);
    }
    const order = (this._solar?.loads || []).filter((l) => l.active);
    for (const d of this._devs) {
      const id = d.id;
      const rank = order.findIndex((l) => l.id === `dev:${id}`);
      this._set(`h-${id}`, `<ha-icon icon="${esc(d.icon)}"></ha-icon>${esc(d.name)} <span class="sub">${esc(d.kind_label)}${d.mode === "solar" && rank >= 0 && order.length > 1 ? ` · solar priority ${rank + 1}` : ""}
        ${this._admin ? `<button class="iconbtn" data-a="edit" data-d="${esc(id)}" aria-label="Device settings"><ha-icon icon="mdi:cog-outline"></ha-icon></button>` : ""}</span>`);
      const runMin = Math.round((d.today?.seconds || 0) / 60);
      const on = d.on;
      this._set(`b-${id}`, `<div class="row2"><span class="badge" style="--bc:${!d.available ? "var(--c-bad)" : on ? "var(--c-ok)" : "var(--muted)"}"><span class="dot"></span>${!d.available ? "Offline" : on ? "Running" : "Off"}</span>
          <span class="muted small">${esc(d.available ? d.reason : "The switch isn't reporting – check the Shelly")}</span></div>
        <div class="modes3" role="group" aria-label="${esc(d.name)} mode">${MODES.map(([m, l]) => `<button data-a="mode" data-m="${m}" data-d="${esc(id)}" aria-pressed="${d.mode === m}">${l}</button>`).join("")}</div>
        <div class="tiles">${d.power ? `<div class="tile"><div class="k">Power</div><div class="v">${fmtW(d.w)}</div></div>` : `<div class="tile"><div class="k">Power (rated)</div><div class="v">${fmtW(d.rated_w)}</div></div>`}
          <div class="tile"><div class="k">Run time today</div><div class="v">${runMin >= 60 ? `${Math.floor(runMin / 60)} h ${runMin % 60} min` : `${runMin} min`}</div></div>
          <div class="tile"><div class="k">Starts today</div><div class="v">${d.today?.starts || 0}</div></div></div>`);
      this._renderSolar(d);
      this._set(`sh-${id}`, d.mode === "solar" ? `Solar hours <span class="sub">only runs inside these times</span>` : d.mode === "auto" ? `Run times <span class="sub">used in Timer mode</span>` : `Run times <span class="sub">used in Timer and Solar mode</span>`);
      this._renderSched(d);
    }
  }

  _renderSolar(d, force) {
    const id = d.id, elId = `sol-${id}`;
    if (d.mode !== "solar") { this._set(elId, ""); this._shown[elId] = null; return; }
    const key = JSON.stringify([d.solar_start_w, d.solar_keep_w, d.hours, d.stop_deficit_min, d.stop_discharge_min, d.discharge_w]);
    if (!force && (this._focusIn(elId) || this._shown[elId] === key)) return;
    this._shown[elId] = key;
    this._html[elId] = null;
    this.shadowRoot.getElementById(elId).innerHTML = `<div style="margin-top:12px">
      <div class="field"><label>Start when spare solar is above<span class="hint">not counting this device</span></label><span class="ctl"><input type="number" data-s="solar_start_w" value="${d.solar_start_w}" min="0" step="50">W</span></div>
      <div class="field"><label>Keep running while above</label><span class="ctl"><input type="number" data-s="solar_keep_w" value="${d.solar_keep_w}" min="0" step="50">W</span></div>
      <div class="field"><label>Run hours per day<span class="hint">stops once reached · 0 = no limit</span></label><span class="ctl"><input type="number" data-s="hours" value="${d.hours}" min="0" max="24" step="0.5">h</span></div>
      <div class="field"><label>Stop when solar is below the house load for<span class="hint">the house is then running on battery or grid · 0 = off</span></label><span class="ctl"><input type="number" data-s="stop_deficit_min" value="${d.stop_deficit_min ?? 10}" min="0" max="240" step="1">min</span></div>
      <div class="field"><label>Stop when the battery gives more than<span class="hint">ignores small blips below this</span></label><span class="ctl"><input type="number" data-s="discharge_w" value="${d.discharge_w ?? 200}" min="0" step="50" style="width:72px">W for<input type="number" data-s="stop_discharge_min" value="${d.stop_discharge_min ?? 5}" min="0" max="240" step="1" style="width:64px">min</span></div>
      <div class="actions"><span class="msg" id="sm-${esc(id)}"></span><button class="btn primary" data-a="solarsave" data-d="${esc(id)}">Save</button></div>
      <p class="note">Shares solar with the pool and geysers in the order under Energy → Solar priority.</p></div>`;
  }

  _renderSched(d, force) {
    const id = d.id, elId = `sc-${id}`;
    const key = JSON.stringify(d.schedules);
    const dr = this._draft[id];
    if (!force && ((dr && dr.dirty) || this._focusIn(elId) || this._shown[elId] === key)) return;
    this._shown[elId] = key;
    if (!dr || !dr.dirty) this._draft[id] = { list: JSON.parse(key), dirty: false };
    const list = this._draft[id].list;
    const el = this.shadowRoot.getElementById(elId);
    el.innerHTML = (list.length ? list.map((sc, i) => `<div class="sched" data-i="${i}">
        <label class="switch"><input type="checkbox" data-k="enabled" ${sc.enabled ? "checked" : ""} aria-label="Enable run time ${i + 1}"><span></span></label>
        <span class="row2"><input type="time" data-k="start" value="${esc(sc.start)}" aria-label="Start"><span class="muted">to</span><input type="time" data-k="end" value="${esc(sc.end)}" aria-label="End"></span>
        <button class="iconbtn" data-a="sdel" data-d="${esc(id)}" aria-label="Remove run time"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        <div class="days">${WDAYS.map((dn, di) => `<button data-a="sday" data-d="${esc(id)}" data-dn="${di}" aria-pressed="${sc.days.includes(di)}">${dn}</button>`).join("")}</div></div>`).join("")
      : `<div class="muted small" style="padding:8px 0">${d.mode === "solar" ? "No solar hours – it may run any time there's spare solar." : "No run times – it only runs when switched On."}</div>`)
      + `<div class="actions" style="justify-content:space-between"><button class="btn" data-a="sadd" data-d="${esc(id)}">+ Add run time</button>
         <span class="row2" id="sa-${esc(id)}" ${this._draft[id].dirty ? "" : "hidden"}><span class="msg" id="scm-${esc(id)}"></span><button class="btn" data-a="sreset" data-d="${esc(id)}">Undo</button><button class="btn primary" data-a="ssave" data-d="${esc(id)}">Save</button></span></div>`;
  }

  _dirty(id) { this._draft[id].dirty = true; const a = this.shadowRoot.getElementById(`sa-${id}`); if (a) a.hidden = false; }

  async _renderForm(id) {
    const holder = id ? this.shadowRoot.getElementById(`ad-${id}`) : this.shadowRoot.getElementById("addform");
    if (!holder) return;
    if (!this._opts) {
      holder.innerHTML = `<div class="muted small" style="padding:8px 0">Loading switches…</div>`;
      try { this._opts = await this._hass.callWS({ type: `${DOMAIN}/devices_entities` }); }
      catch (e) { holder.innerHTML = `<div class="msg err">${esc(e.message || e)}</div>`; return; }
    }
    const d = id ? this._devs.find((x) => x.id === id) : { name: "", area: this._area || "", kind: "heatpump", switch: "", power: "", rated_w: 1500, min_switch_s: 300 };
    const used = new Set((this._all || this._devs).filter((x) => x.id !== id).map((x) => x.switch));
    const opt = (list, cur, empty) => (empty ? `<option value="">${empty}</option>` : "") + list.filter((o) => !used.has(o.id) || o.id === cur)
      .map((o) => `<option value="${esc(o.id)}" ${o.id === cur ? "selected" : ""}>${esc(o.name)} (${esc(o.id)})</option>`).join("");
    const p = id ? `e-${id}` : "n";
    holder.innerHTML = `<div style="${id ? "margin-top:16px;border-top:1px solid var(--line);padding-top:8px" : "margin-top:8px"}">
      ${id ? `<div class="small muted" style="margin-bottom:4px">Device settings (admin)</div>` : ""}
      <div class="field"><label for="${p}-name">Name</label><input type="text" id="${p}-name" maxlength="40" value="${esc(d.name)}" placeholder="${this._area === "pool" ? "e.g. Pool heat pump" : "e.g. Office aircon"}"></div>
      <div class="field"><label for="${p}-area">Show on</label><select id="${p}-area"><option value="" ${(d.area || "") === "" ? "selected" : ""}>Devices tab</option><option value="pool" ${d.area === "pool" ? "selected" : ""}>Pool tab</option></select></div>
      <div class="field"><label for="${p}-kind">Type</label><select id="${p}-kind">${KINDS.map(([k, l]) => `<option value="${k}" ${k === d.kind ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="${p}-switch">Switch<span class="hint">the Shelly relay that runs it</span></label><select id="${p}-switch">${opt(this._opts.switches, d.switch, "– pick –")}</select></div>
      <div class="field"><label for="${p}-power">Power sensor<span class="hint">optional – the Shelly's W</span></label><select id="${p}-power">${opt(this._opts.power, d.power, "none (use rated power)")}</select></div>
      <div class="field"><label for="${p}-rated">Rated power<span class="hint">used without a power sensor, and to plan solar</span></label><span class="ctl"><input type="number" id="${p}-rated" min="0" step="50" value="${d.rated_w}">W</span></div>
      <div class="field"><label for="${p}-min">Wait between switches<span class="hint">protects compressors (Solar mode)</span></label><span class="ctl"><input type="number" id="${p}-min" min="0" max="3600" step="30" value="${d.min_switch_s}">s</span></div>
      <div class="actions">${id ? `<button class="btn danger" data-a="remove" data-d="${esc(id)}">Remove</button><span style="flex:1"></span>` : ""}<span class="msg" id="${p}-msg"></span>
        ${id ? `<button class="btn" data-a="editclose" data-d="${esc(id)}">Close</button>` : ""}<button class="btn primary" data-a="${id ? "editsave" : "add"}" data-d="${esc(id || "")}">${id ? "Save" : "Add device"}</button></div></div>`;
  }

  _formValues(id) {
    const p = id ? `e-${id}` : "n", $ = (x) => this.shadowRoot.getElementById(`${p}-${x}`);
    return { name: $("name").value, area: $("area").value, kind: $("kind").value, switch: $("switch").value, power: $("power").value,
      rated_w: Number($("rated").value), min_switch_s: Number($("min").value) };
  }

  async _send(id, settings, msgId) {
    try {
      const r = await this._hass.callWS({ type: `${DOMAIN}/devices_save`, device: id || null, settings });
      this.update({ devices: r.devices, solar_loads: r.solar_loads });
      const m = this.shadowRoot.getElementById(msgId); if (m) { m.textContent = "Saved"; m.className = "msg ok"; }
      return r;
    } catch (e) {
      const m = this.shadowRoot.getElementById(msgId); if (m) { m.textContent = e.message || "Could not save"; m.className = "msg err"; }
      return null;
    }
  }

  async _click(ev) {
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a, id = b.dataset.d, d = this._devs.find((x) => x.id === id);
    const dr = this._draft[id];
    switch (a) {
      case "mode": return this._send(id, { mode: b.dataset.m }, `sm-${id}`);
      case "solarsave": {
        const box = this.shadowRoot.getElementById(`sol-${id}`), v = (k) => Number(box.querySelector(`[data-s=${k}]`).value);
        const r = await this._send(id, { solar_start_w: v("solar_start_w"), solar_keep_w: v("solar_keep_w"), hours: v("hours"),
          stop_deficit_min: v("stop_deficit_min"), stop_discharge_min: v("stop_discharge_min"), discharge_w: v("discharge_w") }, `sm-${id}`);
        if (r) { this.shadowRoot.activeElement?.blur?.(); this._renderSolar(this._devs.find((x) => x.id === id), true); const m = this.shadowRoot.getElementById(`sm-${id}`); if (m) { m.textContent = "Saved"; m.className = "msg ok"; } }
        return;
      }
      case "sadd": dr.list.push({ enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: "10:00", end: "15:00" }); this._dirty(id); return this._renderSched(d, true);
      case "sdel": dr.list.splice(Number(b.closest(".sched").dataset.i), 1); this._dirty(id); return this._renderSched(d, true);
      case "sday": {
        const sc = dr.list[Number(b.closest(".sched").dataset.i)], dn = Number(b.dataset.dn);
        sc.days = sc.days.includes(dn) ? sc.days.filter((x) => x !== dn) : [...sc.days, dn].sort();
        b.setAttribute("aria-pressed", sc.days.includes(dn)); return this._dirty(id);
      }
      case "sreset": dr.dirty = false; return this._renderSched(d, true);
      case "ssave": {
        const r = await this._send(id, { schedules: dr.list }, `scm-${id}`);
        if (r) { dr.dirty = false; this._renderSched(this._devs.find((x) => x.id === id), true); }
        return;
      }
      case "edit": return this._renderForm(id);
      case "editclose": { const h = this.shadowRoot.getElementById(`ad-${id}`); if (h) h.innerHTML = ""; return; }
      case "editsave": {
        const r = await this._send(id, this._formValues(id), `e-${id}-msg`);
        if (r) { this._built = null; this._render(); }
        return;
      }
      case "add": {
        const v = this._formValues(null);
        if (!v.power) delete v.power;
        const r = await this._send(null, { ...v, mode: "off" }, "n-msg");
        if (r) { this._built = null; this._render(); }
        return;
      }
      case "remove": {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to remove"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Remove"; }, 4000); return; }
        try { const r = await this._hass.callWS({ type: `${DOMAIN}/devices_remove`, device: id }); this._built = null; this.update({ devices: r.devices }); }
        catch (e) { const m = this.shadowRoot.getElementById(`e-${id}-msg`); if (m) { m.textContent = e.message || "Could not remove"; m.className = "msg err"; } }
        return;
      }
    }
  }

  _input(ev) {
    const inp = ev.target, row = inp.closest(".sched");
    if (!row || !inp.dataset.k) return;
    const id = row.closest("[data-d]")?.dataset.d || row.closest("section").dataset.d;
    const sc = this._draft[id]?.list[Number(row.dataset.i)]; if (!sc) return;
    sc[inp.dataset.k] = inp.dataset.k === "enabled" ? inp.checked : inp.value;
    this._dirty(id);
  }
}

if (!customElements.get("hamlet-home-devices")) customElements.define("hamlet-home-devices", HamletHomeDevices);
