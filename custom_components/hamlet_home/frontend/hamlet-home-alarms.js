// Hamlet Home – Alarms page: switch on the alarms you want, set the limit and how long, pick the phones.
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = { battery_current: "mdi:current-dc", battery_power: "mdi:battery-alert-variant", load_high: "mdi:home-lightning-bolt", soc_low: "mdi:battery-low",
  grid_down: "mdi:transmission-tower-off", geyser_cold: "mdi:water-boiler-alert", pump_trip: "mdi:pump-off", inverter_fault: "mdi:alert-octagon", sensor: "mdi:bell-cog" };
const NEEDS = { battery_current: "a battery current sensor (Configure → Power flow details)", battery_power: "a battery power sensor", load_high: "a house load sensor",
  soc_low: "a battery % sensor", grid_down: "grid power or a grid status sensor", geyser_cold: "Hamlet Geyser with a temperature sensor",
  pump_trip: "the booster pump set up", inverter_fault: "an inverter state sensor (Configure → Power flow details)" };
const OPS = [["above", "is above"], ["below", "is below"], ["on", "turns on"], ["off", "turns off"], ["equals", "equals"]];
const LEVEL = { critical: ["#e34948", "Critical"], warning: ["#eda100", "Warning"], info: ["#2a78d6", "Info"] };
const ago = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString(); };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const STYLE = `
:host { display: contents; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius, 12px); border: 1px solid var(--ha-card-border-color, var(--line)); padding: 16px; min-width: 0; grid-column: span 12; }
@media (min-width: 980px) { .s8 { grid-column: span 8; } .s4 { grid-column: span 4; } }
h2 { margin: 0 0 12px; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
h2 ha-icon { --mdc-icon-size: 20px; color: var(--muted); }
h2 .sub { margin-left: auto; font-size: 12px; color: var(--muted); font-weight: 400; }
.muted { color: var(--muted); } .small { font-size: 12px; }
.btn { font: inherit; font-size: 14px; padding: 7px 14px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.btn.primary { background: var(--accent, #1e9be4); border-color: transparent; color: #fff; }
.btn.sm { font-size: 13px; padding: 4px 10px; }
.btn:disabled { opacity: .5; cursor: default; }
.rule { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; padding: 12px 0; border-top: 1px solid var(--line); align-items: center; }
.rule:first-of-type { border-top: 0; }
.rule.off .body { opacity: .55; }
.rule.na { opacity: .5; }
.rhd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rhd ha-icon { --mdc-icon-size: 20px; }
.rhd .nm { font-weight: 500; flex: 1; min-width: 140px; }
.rhd .nm input { font: inherit; font-weight: 500; border: 0; border-bottom: 1px dashed transparent; background: transparent; color: inherit; width: 100%; padding: 2px 0; }
.rhd .nm input:hover, .rhd .nm input:focus { border-bottom-color: var(--line); outline: none; }
.lvl { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: #fff; }
.body { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 14px; }
.body input[type=number], .body input[type=time], .body input[type=text], .body select { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--primary-text-color); }
.body input[type=number] { width: 90px; } .body input[type=text] { min-width: 220px; flex: 1; }
.help { grid-column: 2; font-size: 12px; color: var(--muted); }
.sw { position: relative; width: 42px; height: 24px; flex: none; }
.sw input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; position: absolute; inset: 0; z-index: 1; }
.sw span { position: absolute; inset: 0; border-radius: 999px; background: var(--line); transition: background .2s; }
.sw span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .2s; }
.sw input:checked + span { background: var(--accent, #1e9be4); } .sw input:checked + span::after { transform: translateX(18px); }
.sw input:focus-visible + span { outline: 2px solid var(--accent, #1e9be4); outline-offset: 2px; }
.ib { background: transparent; border: 0; color: var(--muted); cursor: pointer; padding: 4px; border-radius: 8px; } .ib:hover { color: var(--c-bad, #e34948); }
.act { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; margin-bottom: 8px; border-left: 4px solid; background: color-mix(in srgb, var(--lc) 10%, transparent); }
.act b { display: block; } .act .t { font-size: 13px; }
.bar { position: sticky; bottom: 0; display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; background: var(--card); border-top: 1px solid var(--line); padding-top: 10px; margin-top: 8px; }
.msg { font-size: 13px; color: var(--muted); } .msg.err { color: var(--c-bad, #e34948); } .msg.ok { color: #19a974; }
.tg { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; }
.hist { font-size: 13px; display: grid; gap: 6px; }
.hist div { display: flex; gap: 8px; } .hist i { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; }
select.add { font: inherit; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--primary-text-color); }
`;

class HamletHomeAlarms extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first) this._load(); }
  update(s) { if (s?.alarms && this._d) { this._d.active = s.alarms.active; this._renderActive(); } }

  async _load() {
    try { this._d = await this._hass.callWS({ type: `${DOMAIN}/alarms` }); }
    catch (e) { this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card">Alarms couldn't load: ${esc(e.message || e)}</div>`; return; }
    this._rules = JSON.parse(JSON.stringify(this._d.rules));
    this._targets = [...this._d.targets];
    this._dirty = false;
    this._render();
  }

  _render() {
    const d = this._d;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <section class="card" id="activecard" hidden><h2><ha-icon icon="mdi:bell-ring"></ha-icon>Active alarms <span class="sub"><button class="btn sm" data-a="ackall">OK, seen</button></span></h2><div id="active"></div></section>
      <section class="card s8"><h2><ha-icon icon="mdi:bell-cog-outline"></ha-icon>Your alarms <span class="sub">switch on what you want – it pops up here and on your phone</span></h2>
        <div id="rules"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px">
          <select class="add" id="addtype" aria-label="Add an alarm"><option value="">+ Add an alarm…</option>
            ${Object.entries(d.presets).map(([k, p]) => `<option value="${k}">${esc(k === "sensor" ? "Own alarm (any sensor or switch)" : p.name)}</option>`).join("")}</select></div>
        <div class="bar"><span class="msg" id="msg"></span><button class="btn" data-a="reset" id="resetbtn" disabled>Discard</button><button class="btn primary" data-a="save" id="savebtn" disabled>Save alarms</button></div>
      </section>
      <section class="card s4"><h2><ha-icon icon="mdi:cellphone-message"></ha-icon>Send to phones</h2>
        ${d.notify_options.length ? `<div id="targets"></div><div style="margin-top:8px"><button class="btn sm" data-a="test">Send a test</button> <span class="msg" id="tmsg"></span></div>`
          : `<p class="muted small" style="margin:0">No phones found. Install the Home Assistant app on the phone and log in – it then shows up here.</p>`}
        <p class="muted small">Alarms always pop up in this app and in Home Assistant's notifications. Critical alarms ring loudly on phones that allow it.</p>
        <h2 style="margin-top:18px"><ha-icon icon="mdi:history"></ha-icon>Recent</h2>
        <div class="hist">${d.history.length ? d.history.map((h) => `<div><i style="background:${(LEVEL[h.level] || LEVEL.info)[0]}"></i><span><b>${esc(h.name)}</b> · ${esc(when(h.at))}${h.cleared ? ` · cleared ${esc(when(h.cleared))}` : " · <b>still on</b>"}<br><span class="muted">${esc(h.text)}</span></span></div>`).join("") : `<span class="muted">No alarms yet.</span>`}</div>
      </section>`;
    this._renderRules();
    this._renderTargets();
    this._renderActive();
    const sr = this.shadowRoot;
    sr.addEventListener("click", (ev) => this._click(ev));
    sr.addEventListener("input", (ev) => this._input(ev));
    sr.addEventListener("change", (ev) => this._input(ev, true));
  }

  _renderActive() {
    const card = this.shadowRoot.getElementById("activecard"); if (!card) return;
    const a = this._d.active || [];
    card.hidden = !a.length;
    this.shadowRoot.getElementById("active").innerHTML = a.map((x) => { const [c, l] = LEVEL[x.level] || LEVEL.info;
      return `<div class="act" style="--lc:${c};border-color:${c}"><ha-icon icon="mdi:alert" style="color:${c}"></ha-icon><div><b>${esc(x.name)}</b><span class="t">${esc(x.text)}</span>
        <div class="muted small">${l} · since ${esc(ago(x.since))}${x.acked ? " · seen" : ""}</div></div></div>`; }).join("");
  }

  _renderTargets() {
    const el = this.shadowRoot.getElementById("targets"); if (!el) return;
    el.innerHTML = this._d.notify_options.map((t) => `<label class="tg"><span class="sw"><input type="checkbox" data-t="${esc(t)}" ${this._targets.includes(t) ? "checked" : ""}><span></span></span>
      ${esc(t.replace(/^mobile_app_/, "").replace(/_/g, " "))}</label>`).join("");
  }

  _renderRules() {
    const d = this._d, el = this.shadowRoot.getElementById("rules");
    if (!this._rules.length) { el.innerHTML = `<p class="muted">No alarms yet – add one below.</p>`; return; }
    el.innerHTML = this._rules.map((r, i) => {
      const p = d.presets[r.type], ok = d.available[r.type] !== false, [lc, ll] = LEVEL[p.level] || LEVEL.info;
      let body = "";
      const val = (unit, step = 1) => `<input type="number" data-i="${i}" data-f="value" value="${r.value ?? ""}" step="${step}" aria-label="Limit">${unit ? ` ${esc(unit)}` : ""}`;
      const mins = `for <input type="number" data-i="${i}" data-f="minutes" value="${r.minutes}" min="0" max="1440" step="0.5" aria-label="Minutes"> min`;
      switch (r.type) {
        case "battery_current": body = `Alarm when the battery current is above ${val("A")} ${mins}`; break;
        case "battery_power": body = `Alarm when the battery charges or discharges above ${val("W", 100)} ${mins}`; break;
        case "load_high": body = `Alarm when the house uses more than ${val("W", 100)} ${mins}`; break;
        case "soc_low": body = `Alarm when the battery is below ${val("%")} ${mins}`; break;
        case "grid_down": body = `Alarm when the grid has been off ${mins}`; break;
        case "pump_trip": body = `Alarm when the booster pump's dry-run protection stops it`; break;
        case "inverter_fault": body = `Alarm when the inverter reports a fault, alarm or overload ${mins}`; break;
        case "geyser_cold": body = `Alarm when ${d.geysers.length > 1 ? `<select data-i="${i}" data-f="geyser"><option value="">any geyser</option>${d.geysers.map((g) => `<option value="${esc(g.entry_id)}" ${g.entry_id === r.geyser ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>` : "the geyser"}
          is still below ${val("°C")} at <input type="time" data-i="${i}" data-f="time" value="${esc(r.time || "17:00")}" aria-label="Time"> or later`; break;
        case "sensor": body = `Alarm when <input type="text" data-i="${i}" data-f="entity" value="${esc(r.entity)}" list="ents" placeholder="sensor.… or switch.…" aria-label="Sensor or switch">
          <select data-i="${i}" data-f="op">${OPS.map(([k, t]) => `<option value="${k}" ${k === r.op ? "selected" : ""}>${t}</option>`).join("")}</select>
          ${["above", "below", "equals"].includes(r.op) ? `<input type="${r.op === "equals" ? "text" : "number"}" data-i="${i}" data-f="value" value="${esc(r.value ?? "")}" style="${r.op === "equals" ? "min-width:90px;flex:0" : ""}" aria-label="Value">` : ""} ${mins}`; break;
        default: body = "";
      }
      return `<div class="rule ${r.enabled ? "" : "off"} ${ok ? "" : "na"}">
        <label class="sw" title="${r.enabled ? "On" : "Off"}"><input type="checkbox" data-i="${i}" data-f="enabled" ${r.enabled ? "checked" : ""} ${ok ? "" : "disabled"} aria-label="Switch ${esc(r.name)} on or off"><span></span></label>
        <div class="rhd"><ha-icon icon="${ICON[r.type] || "mdi:bell"}" style="color:${lc}"></ha-icon><span class="nm"><input type="text" data-i="${i}" data-f="name" value="${esc(r.name)}" maxlength="50" aria-label="Alarm name"></span>
          <span class="lvl" style="background:${lc}">${ll}</span><button class="ib" data-a="del" data-i="${i}" title="Delete" aria-label="Delete ${esc(r.name)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
        <div class="body">${body}</div>
        ${ok ? "" : `<div class="help">Needs ${esc(NEEDS[r.type] || "a sensor")} – ask your installer.</div>`}
      </div>`;
    }).join("") + `<datalist id="ents">${Object.keys(this._hass.states).filter((e) => /^(sensor|binary_sensor|switch|input_boolean|climate)\./.test(e)).sort().slice(0, 1500).map((e) => `<option value="${esc(e)}">${esc(this._hass.states[e].attributes?.friendly_name || "")}</option>`).join("")}</datalist>`;
  }

  _setDirty(v = true) {
    this._dirty = v;
    this.shadowRoot.getElementById("savebtn").disabled = !v;
    this.shadowRoot.getElementById("resetbtn").disabled = !v;
    const m = this.shadowRoot.getElementById("msg"); m.textContent = v ? "Not saved yet" : ""; m.className = "msg";
  }

  _input(ev, changed) {
    const t = ev.target;
    if (t.id === "addtype" && changed && t.value) {
      const p = this._d.presets[t.value];
      this._rules.push({ id: "", type: t.value, enabled: true, name: p.name, value: p.value, minutes: p.minutes, time: p.time || "", entity: "", op: "above", geyser: "" });
      t.value = ""; this._renderRules(); this._setDirty(); return;
    }
    if (t.dataset.t !== undefined) {
      this._targets = this._targets.filter((x) => x !== t.dataset.t).concat(t.checked ? [t.dataset.t] : []);
      return this._setDirty();
    }
    const i = t.dataset.i, f = t.dataset.f; if (i === undefined || !f) return;
    const r = this._rules[Number(i)];
    if (f === "enabled") { r.enabled = t.checked; t.closest(".rule").classList.toggle("off", !t.checked); }
    else if (f === "value") r.value = t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value;
    else if (f === "minutes") r.minutes = Number(t.value || 0);
    else r[f] = t.value;
    if (f === "op" && changed) this._renderRules();
    this._setDirty();
  }

  async _click(ev) {
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "del") { this._rules.splice(Number(b.dataset.i), 1); this._renderRules(); return this._setDirty(); }
    if (a === "reset") { this._rules = JSON.parse(JSON.stringify(this._d.rules)); this._targets = [...this._d.targets]; this._renderRules(); this._renderTargets(); return this._setDirty(false); }
    if (a === "ackall") { await this._hass.callWS({ type: `${DOMAIN}/alarms_ack` }); this._d.active = (this._d.active || []).map((x) => ({ ...x, acked: true })); return this._renderActive(); }
    if (a === "test") {
      const m = this.shadowRoot.getElementById("tmsg");
      if (this._dirty) { m.textContent = "Save first, then test"; return; }
      try { await this._hass.callWS({ type: `${DOMAIN}/alarms_test` }); m.textContent = this._targets.length ? "Sent – check the phone" : "Tick a phone first"; }
      catch (e) { m.textContent = e.message || "Could not send"; }
      return;
    }
    if (a === "save") {
      const m = this.shadowRoot.getElementById("msg");
      try {
        this._d = await this._hass.callWS({ type: `${DOMAIN}/alarms_save`, rules: this._rules, targets: this._targets });
        this._rules = JSON.parse(JSON.stringify(this._d.rules)); this._targets = [...this._d.targets];
        this._renderRules(); this._renderActive(); this._setDirty(false);
        m.textContent = "Saved"; m.className = "msg ok";
      } catch (e) { m.textContent = e.message || "Could not save"; m.className = "msg err"; }
    }
  }
}
if (!customElements.get("hamlet-home-alarms")) customElements.define("hamlet-home-alarms", HamletHomeAlarms);
