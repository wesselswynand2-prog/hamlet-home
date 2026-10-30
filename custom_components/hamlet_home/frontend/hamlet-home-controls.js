// Hamlet Home – Controls tab: rooms, gates, aircons, lights and plugs.
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmtW = (w) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

const KIND_LABEL = { light: "Light", switch: "Switch", plug: "Plug", gate: "Gate (relay pulse)", garage: "Garage / gate (open–close)",
  blind: "Blind / cover", aircon: "Aircon", fan: "Fan", lock: "Lock", action: "Quick action", media: "Media" };
const ICON = {
  light: ["mdi:lightbulb-outline", "mdi:lightbulb-on"], switch: ["mdi:toggle-switch-off-outline", "mdi:toggle-switch"],
  plug: ["mdi:power-socket-za", "mdi:power-socket-za"], fan: ["mdi:fan-off", "mdi:fan"], aircon: ["mdi:air-conditioner", "mdi:air-conditioner"],
  blind: ["mdi:blinds", "mdi:blinds-open"], lock: ["mdi:lock-open-variant", "mdi:lock"], media: ["mdi:speaker-off", "mdi:speaker"],
  gate: ["mdi:gate", "mdi:gate-open"], garage: ["mdi:garage", "mdi:garage-open"], action: ["mdi:play-circle-outline", "mdi:play-circle"],
};
const HVAC = { off: "Off", cool: "Cool", heat: "Heat", heat_cool: "Auto", auto: "Auto", dry: "Dry", fan_only: "Fan" };

const STYLE = `
:host { display: contents; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; min-width: 0; grid-column: span 12; }
@media (min-width: 980px) { .s6 { grid-column: span 6; } .s4 { grid-column: span 4; } .s8 { grid-column: span 8; } }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 ha-icon { --mdc-icon-size: 20px; color: var(--muted); }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.btn.sm { font-size: 13px; padding: 4px 10px; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.msg { font-size: 13px; } .msg.err { color: var(--c-bad); } .msg.ok { color: var(--c-ok); }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.top .grow { flex: 1; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { font: inherit; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 20px;
  border: 1px solid var(--line); background: var(--card); color: var(--primary-text-color); cursor: pointer; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--accent); }
.chip.done { border-color: var(--c-ok); } .chip.done ha-icon { color: var(--c-ok); }

/* tiles */
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
@media (max-width: 420px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tile { --tc: var(--accent); border-radius: 12px; border: 1px solid var(--line); min-width: 0; display: flex; flex-direction: column; overflow: hidden;
  transition: background .2s, border-color .2s; }
.tile.wide { grid-column: span 2; }
.tile.on { background: color-mix(in srgb, var(--tc) 13%, transparent); border-color: color-mix(in srgb, var(--tc) 45%, transparent); }
.tile.k-light { --tc: var(--c-solar); } .tile.k-plug, .tile.k-switch { --tc: var(--c-ok); } .tile.k-aircon { --tc: var(--c-load); }
.tile.dead { opacity: .55; }
.tmain { font: inherit; text-align: left; background: transparent; border: 0; color: inherit; padding: 12px; cursor: pointer;
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 0 10px; align-items: center; min-height: 64px; width: 100%; }
.tmain ha-icon { grid-row: span 2; --mdc-icon-size: 26px; color: var(--muted); }
.tile.on .tmain ha-icon { color: var(--tc); }
.tmain .n { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tmain .st { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tmain .st.bad { color: var(--c-bad); }
.trow { display: flex; align-items: center; gap: 6px; padding: 0 10px 10px; flex-wrap: wrap; }
.ib { font: inherit; width: 36px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--primary-text-color);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.ib ha-icon { --mdc-icon-size: 18px; }
.temp { font-size: 20px; min-width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
.modes { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.modes button { font: inherit; font-size: 12px; padding: 5px 9px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
.modes button[aria-pressed="true"] { background: var(--tc); border-color: var(--tc); color: #fff; }
input[type=range] { width: 100%; accent-color: var(--tc); margin: 0; height: 24px; }

/* gates */
.gates { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 12px; }
.gate { border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.gate .hd { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gate .hd ha-icon { --mdc-icon-size: 30px; color: var(--accent); }
.gate .hd .n { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gate .hd .st { font-size: 12px; color: var(--muted); }
.gate.open { border-color: var(--c-warn); } .gate.open .hd ha-icon { color: var(--c-warn); }
.gbtns { display: flex; gap: 8px; }
.gbtn { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 14px 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--card);
  color: var(--primary-text-color); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 52px; }
.gbtn ha-icon { --mdc-icon-size: 20px; }
.gbtn.main { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.gbtn.armed { background: var(--c-warn); border-color: var(--c-warn); color: #fff; }
.gbtn.sent { background: var(--c-ok); border-color: var(--c-ok); color: #fff; }

/* edit */
.erow { display: grid; grid-template-columns: 26px minmax(0, 1.4fr) minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.erow .id { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erow.off .nm { opacity: .5; }
@media (max-width: 640px) { .erow { grid-template-columns: 26px minmax(0, 1fr) auto; } .erow select { grid-column: 2 / span 2; } .erow .cf { grid-column: 2 / span 2; } }
.ehd { display: flex; align-items: center; gap: 8px; margin: 18px 0 4px; font-weight: 500; }
.ehd:first-of-type { margin-top: 4px; }
input[type=text], input[type=search], input[type=number], select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); min-width: 0; width: 100%; }
input[type=number] { width: 80px; }
input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent); }
.star { background: transparent; border: 0; cursor: pointer; color: var(--muted); padding: 2px; }
.star[aria-pressed="true"] { color: var(--c-solar); }
.cf { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.rrow { display: flex; align-items: center; gap: 6px; padding: 5px 0; }
.rrow input { flex: 1; }
.empty { padding: 40px 16px; text-align: center; color: var(--muted); }
.sticky { position: sticky; bottom: 0; background: var(--card); padding-top: 10px; border-top: 1px solid var(--line); margin-top: 10px; }
`;

class HamletHomeControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._arm = null;
    this._sent = {};
    this._edit = false;
    this._busy = false;
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._load();
    else if (!this._edit && !this._busy) this._queue();
  }
  set gridAvailable(v) { if (this._grid !== v) { this._grid = v; if (this._lay && !this._edit) this._queue(); } }
  set isAdmin(v) { this._admin = v; }

  connectedCallback() { this._timer = setInterval(() => { if (!this._edit) this._load(); }, 120000); }
  disconnectedCallback() { clearInterval(this._timer); }

  async _load() {
    try {
      const lay = await this._hass.callWS({ type: `${DOMAIN}/controls` });
      this._lay = lay;
      this._admin = lay.is_admin;
      if (this._grid === undefined) this._grid = lay.grid_available;
      this._shell();
    } catch (e) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card empty">Controls couldn't load: ${esc(e.message || e)}</div>`;
    }
  }

  _queue() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._render(); });
  }

  _shell() {
    if (!this._root) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div id="root" style="display:contents"></div>`;
      this._root = this.shadowRoot.getElementById("root");
      this._root.addEventListener("click", (ev) => this._click(ev));
      this._root.addEventListener("change", (ev) => this._change(ev));
      this._root.addEventListener("input", (ev) => this._input(ev));
      this._root.addEventListener("pointerdown", (ev) => { if (ev.target.matches("input[type=range]")) this._busy = true; });
      const release = () => { if (this._busy) { this._busy = false; setTimeout(() => this._queue(), 1500); } };
      this._root.addEventListener("pointerup", release);
      this._root.addEventListener("pointercancel", release);
    }
    if (this._edit) return this._renderEdit();
    this._sections = null;
    this._render();
  }

  /* ------------------------------------------------------------ helpers */
  _st(eid) { return this._hass.states[eid]; }
  _dead(st) { return !st || st.state === "unavailable" || st.state === "unknown"; }
  _deadText() { return this._grid === false ? "No power" : "Offline"; }
  _isOn(item, st) {
    if (!st) return false;
    switch (item.kind) {
      case "aircon": return st.state !== "off" && !this._dead(st);
      case "blind": case "garage": return ["open", "opening"].includes(st.state);
      case "lock": return st.state === "locked";
      case "media": return ["playing", "on", "paused", "idle"].includes(st.state) && st.state !== "off";
      default: return st.state === "on";
    }
  }

  _stateText(item, st) {
    if (this._dead(st)) return [this._deadText(), true];
    const a = st.attributes || {};
    switch (item.kind) {
      case "light": {
        if (st.state !== "on") return ["Off"];
        return [a.brightness != null ? `On · ${Math.round((a.brightness / 255) * 100)}%` : "On"];
      }
      case "plug": case "switch": {
        let t = st.state === "on" ? "On" : "Off";
        const p = item.power_entity && num(this._st(item.power_entity)?.state);
        if (p !== null && p !== undefined && p !== false && st.state === "on") t += ` · ${fmtW(p)}`;
        return [t];
      }
      case "aircon": {
        const cur = num(a.current_temperature);
        const curT = cur !== null ? `${cur.toFixed(cur % 1 ? 1 : 0)}° in room` : "";
        if (st.state === "off") return [curT ? `Off · ${curT}` : "Off"];
        const act = a.hvac_action ? cap(String(a.hvac_action).replace("_", " ")) : HVAC[st.state] || cap(st.state);
        return [[act, curT].filter(Boolean).join(" · ")];
      }
      case "fan": return [st.state === "on" ? (a.percentage ? `On · ${a.percentage}%` : "On") : "Off"];
      case "blind": case "garage": {
        const pos = num(a.current_position);
        return [cap(st.state) + (pos !== null && st.state === "open" && pos < 100 ? ` · ${pos}%` : "")];
      }
      case "lock": return [cap(st.state)];
      case "media": return [cap(st.state) + (a.media_title ? ` · ${a.media_title}` : "")];
      default: return [cap(st.state)];
    }
  }

  _icon(item, st) {
    const on = this._isOn(item, st);
    const own = st?.attributes?.icon;
    if (own && !["light", "aircon"].includes(item.kind)) return own;
    return (ICON[item.kind] || ICON.switch)[on ? 1 : 0];
  }

  /* ------------------------------------------------------------- render */
  _render() {
    if (!this._lay || this._edit) return;
    const L = this._lay;
    if (!this._sections) {
      const nothing = !L.rooms.length && !L.gates.length && !L.actions.length;
      this._root.innerHTML = `
        <div class="top"><div class="chips grow" id="quick"></div>
          ${this._admin ? `<button class="btn sm" data-a="edit"><ha-icon icon="mdi:pencil" style="--mdc-icon-size:16px;vertical-align:-3px"></ha-icon> Edit page</button>` : ""}</div>
        ${nothing ? `<section class="card empty">Nothing to show yet.${this._admin ? " Tap <b>Edit page</b> to choose devices, or give your devices an area in Settings → Areas." : ""}</section>` : ""}
        <section class="card" id="sfav" hidden><h2><ha-icon icon="mdi:star"></ha-icon>Favourites</h2><div class="tiles" id="fav"></div></section>
        <section class="card" id="sgates" hidden><h2><ha-icon icon="mdi:gate"></ha-icon>Gates &amp; doors</h2><div class="gates" id="gates"></div></section>
        ${L.rooms.map((r, i) => `<section class="card ${L.rooms.length > 1 ? "s6" : ""}"><h2><ha-icon icon="${esc(r.icon || "mdi:floor-plan")}"></ha-icon>${esc(r.name)}
          <span class="sub" id="rs${i}"></span></h2><div class="tiles" id="room${i}"></div></section>`).join("")}`;
      this._sections = true;
      this._html = {};
    }
    const set = (id, html) => { const el = this.shadowRoot.getElementById(id); if (el && this._html[id] !== html) { this._html[id] = html; el.innerHTML = html; } };

    // quick actions + all lights off
    const lightsOn = L.rooms.flatMap((r) => r.items).filter((i) => i.kind === "light" && this._st(i.entity_id)?.state === "on");
    const chips = L.actions.map((a) => {
      const done = this._sent[a.entity_id] && this._sent[a.entity_id] > Date.now();
      return `<button class="chip ${done ? "done" : ""}" data-a="run" data-e="${esc(a.entity_id)}"><ha-icon icon="${done ? "mdi:check" : esc(this._st(a.entity_id)?.attributes?.icon || (a.entity_id.startsWith("scene.") ? "mdi:palette" : "mdi:play-circle-outline"))}"></ha-icon>${esc(a.name)}</button>`;
    });
    if (lightsOn.length) chips.push(`<button class="chip" data-a="alloff" data-ids="${esc(lightsOn.map((i) => i.entity_id).join(","))}"><ha-icon icon="mdi:lightbulb-group-off"></ha-icon>All lights off (${lightsOn.length})</button>`);
    set("quick", chips.join(""));

    const fav = this.shadowRoot.getElementById("sfav");
    if (fav) fav.hidden = !L.favourites.length;
    // favourites come from different rooms, so use the full name ("Kantoor Aircon", not "Aircon")
    set("fav", L.favourites.map((i) => {
      const f = { ...i, name: i.fav_name || i.name };
      return ["gate", "garage"].includes(i.kind) ? this._gateTile(f) : this._tile(f);
    }).join(""));
    const sg = this.shadowRoot.getElementById("sgates");
    if (sg) sg.hidden = !L.gates.length;
    set("gates", L.gates.map((g) => this._gate(g)).join(""));
    L.rooms.forEach((r, idx) => {
      set(`room${idx}`, r.items.map((i) => this._tile(i)).join(""));
      const on = r.items.filter((i) => ["light", "fan"].includes(i.kind) && this._st(i.entity_id)?.state === "on");
      set(`rs${idx}`, on.length ? `<button class="btn sm" data-a="alloff" data-ids="${esc(on.map((i) => i.entity_id).join(","))}">Lights off</button>` : "");
    });
  }

  _tile(item) {
    const st = this._st(item.entity_id);
    const dead = this._dead(st);
    const on = !dead && this._isOn(item, st);
    const [text, bad] = this._stateText(item, st);
    const a = st?.attributes || {};
    const e = esc(item.entity_id);
    let extra = "", wide = false;
    if (!dead && item.kind === "light" && on && (a.supported_color_modes || []).some((m) => m !== "onoff")) {
      extra = `<div class="trow"><input type="range" min="1" max="100" value="${Math.round(((a.brightness || 255) / 255) * 100)}" data-a="bright" data-e="${e}" aria-label="Brightness ${esc(item.name)}"></div>`;
    } else if (!dead && item.kind === "aircon") {
      wide = true;
      const target = num(a.temperature);
      const modes = (a.hvac_modes || []).filter((m) => HVAC[m]);
      extra = `<div class="trow">
        ${target !== null && st.state !== "off" ? `<button class="ib" data-a="temp" data-d="-1" data-e="${e}" aria-label="Colder"><ha-icon icon="mdi:minus"></ha-icon></button>
          <span class="temp">${target.toFixed(target % 1 ? 1 : 0)}°</span>
          <button class="ib" data-a="temp" data-d="1" data-e="${e}" aria-label="Warmer"><ha-icon icon="mdi:plus"></ha-icon></button>` : ""}
        <span class="modes">${modes.map((m) => `<button data-a="mode" data-m="${m}" data-e="${e}" aria-pressed="${st.state === m}">${HVAC[m]}</button>`).join("")}</span></div>`;
    } else if (!dead && item.kind === "blind") {
      extra = `<div class="trow">
        <button class="ib" data-a="cover" data-s="open_cover" data-e="${e}" aria-label="Open"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="ib" data-a="cover" data-s="stop_cover" data-e="${e}" aria-label="Stop"><ha-icon icon="mdi:stop"></ha-icon></button>
        <button class="ib" data-a="cover" data-s="close_cover" data-e="${e}" aria-label="Close"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>`;
    }
    const armed = this._armed(`t:${item.entity_id}`);
    const label = armed ? (item.kind === "lock" ? (on ? "Tap again to unlock" : "Tap again to lock") : "Tap again") : text;
    return `<div class="tile k-${item.kind} ${on ? "on" : ""} ${dead ? "dead" : ""} ${wide ? "wide" : ""}">
      <button class="tmain" data-a="toggle" data-e="${e}" ${dead ? "disabled" : ""} aria-pressed="${on}">
        <ha-icon icon="${esc(this._icon(item, st))}"></ha-icon><span class="n">${esc(item.name)}</span><span class="st ${bad || armed ? "bad" : ""}">${esc(label)}</span></button>${extra}</div>`;
  }

  _gateTile(item) { return `<div class="tile wide" style="border:0">${this._gate(item)}</div>`; }

  _gate(g) {
    const st = this._st(g.entity_id);
    const dead = this._dead(st);
    const e = esc(g.entity_id);
    const key = `g:${g.entity_id}`;
    if (g.kind === "garage") {
      const open = !dead && ["open", "opening"].includes(st.state);
      const btn = (svc, icon, label, main) => {
        const k = `${key}:${svc}`, armed = this._armed(k);
        return `<button class="gbtn ${armed ? "armed" : main ? "main" : ""}" data-a="garage" data-s="${svc}" data-e="${e}" ${dead ? "disabled" : ""}>
          <ha-icon icon="${icon}"></ha-icon>${armed ? "Tap again" : label}</button>`;
      };
      return `<div class="gate ${open ? "open" : ""}"><div class="hd"><ha-icon icon="${open ? "mdi:garage-open" : "mdi:garage"}"></ha-icon>
        <div style="min-width:0"><div class="n">${esc(g.name)}</div><div class="st">${dead ? this._deadText() : esc(cap(st.state))}</div></div></div>
        <div class="gbtns">${btn("open_cover", "mdi:arrow-up", "Open", !open)}${btn("stop_cover", "mdi:stop", "Stop")}${btn("close_cover", "mdi:arrow-down", "Close", open)}</div></div>`;
    }
    const armed = this._armed(key);
    const sent = this._sent[g.entity_id] && this._sent[g.entity_id] > Date.now();
    return `<div class="gate"><div class="hd"><ha-icon icon="mdi:gate"></ha-icon>
      <div style="min-width:0"><div class="n">${esc(g.name)}</div><div class="st">${dead ? this._deadText() : sent ? "Signal sent" : "Tap to open or close"}</div></div></div>
      <div class="gbtns"><button class="gbtn ${sent ? "sent" : armed ? "armed" : "main"}" data-a="pulse" data-e="${e}" ${dead ? "disabled" : ""}>
        <ha-icon icon="${sent ? "mdi:check" : "mdi:gate-arrow-right"}"></ha-icon>${sent ? "Sent" : armed ? "Tap again to confirm" : "Open / close"}</button></div></div>`;
  }

  /* ------------------------------------------------------------ actions */
  _armed(k) { return this._arm && this._arm.k === k && this._arm.until > Date.now(); }
  _needConfirm(k, confirm) {
    if (!confirm || this._armed(k)) { this._arm = null; return false; }
    this._arm = { k, until: Date.now() + 4000 };
    clearTimeout(this._armT);
    this._armT = setTimeout(() => { this._arm = null; this._render(); }, 4100);
    this._render();
    return true;
  }
  _item(eid) {
    const L = this._lay;
    return [...L.rooms.flatMap((r) => r.items), ...L.gates, ...L.actions].find((i) => i.entity_id === eid);
  }
  async _call(domain, service, data) {
    try { await this._hass.callService(domain, service, data); }
    catch (e) { this._toast(e.message || String(e)); }
  }
  _toast(text) {
    const ev = new Event("hass-notification", { bubbles: true, composed: true });
    ev.detail = { message: text };
    this.dispatchEvent(ev);
  }

  async _click(ev) {
    const b = ev.target.closest("[data-a]");
    if (!b || b.disabled) return;
    const a = b.dataset.a, eid = b.dataset.e, item = eid ? this._item(eid) : null;
    if (this._edit) return this._editClick(b, a);
    if (a === "edit") { this._startEdit(); return; }
    if (a === "alloff") return this._call("homeassistant", "turn_off", { entity_id: b.dataset.ids.split(",") });
    if (a === "run") {
      const d = eid.split(".")[0];
      await this._call(d, d === "button" ? "press" : "turn_on", { entity_id: eid });
      this._sent[eid] = Date.now() + 2500; this._render(); setTimeout(() => this._render(), 2600);
      return;
    }
    if (a === "pulse") {
      if (this._needConfirm(`g:${eid}`, item?.confirm)) return;
      try { await this._hass.callWS({ type: `${DOMAIN}/controls_pulse`, entity_id: eid }); this._sent[eid] = Date.now() + 3000; }
      catch (e) { this._toast(e.message || String(e)); }
      this._render(); setTimeout(() => this._render(), 3100);
      return;
    }
    if (a === "garage") {
      if (b.dataset.s !== "stop_cover" && this._needConfirm(`g:${eid}:${b.dataset.s}`, item?.confirm)) return;
      return this._call("cover", b.dataset.s, { entity_id: eid });
    }
    if (a === "cover") return this._call("cover", b.dataset.s, { entity_id: eid });
    if (a === "mode") return this._call("climate", "set_hvac_mode", { entity_id: eid, hvac_mode: b.dataset.m });
    if (a === "temp") {
      const at = this._st(eid)?.attributes || {};
      const step = num(at.target_temp_step) || 1;
      let t = (num(at.temperature) || 22) + Number(b.dataset.d) * step;
      t = Math.min(num(at.max_temp) ?? 32, Math.max(num(at.min_temp) ?? 16, t));
      return this._call("climate", "set_temperature", { entity_id: eid, temperature: t });
    }
    if (a === "toggle" && item) {
      const st = this._st(eid), d = eid.split(".")[0];
      if (item.kind === "lock") {
        if (this._needConfirm(`t:${eid}`, item.confirm)) return;
        return this._call("lock", st.state === "locked" ? "unlock" : "lock", { entity_id: eid });
      }
      if (item.kind === "aircon") return this._call("climate", st.state === "off" ? "turn_on" : "turn_off", { entity_id: eid });
      if (item.kind === "blind") return this._call("cover", "toggle", { entity_id: eid });
      if (d === "button") return this._call("button", "press", { entity_id: eid });
      if (d === "scene" || d === "script") return this._call(d, "turn_on", { entity_id: eid });
      return this._call(d === "input_boolean" ? "input_boolean" : d, "toggle", { entity_id: eid });
    }
  }

  _change(ev) {
    const t = ev.target;
    if (this._edit) return this._editInput(t);
    if (t.dataset.a === "bright") {
      this._busy = false;
      this._call("light", "turn_on", { entity_id: t.dataset.e, brightness_pct: Number(t.value) });
    }
  }
  _input(ev) { if (this._edit) this._editInput(ev.target); }

  /* --------------------------------------------------------------- edit */
  _startEdit() {
    const s = this._lay.settings || {};
    this._draft = {
      items: Object.fromEntries((this._lay.all || []).map((i) => [i.entity_id, { shown: i.shown, name: (s.names || {})[i.entity_id] || "", kind: i.kind,
        origKind: i.kind, fav: i.favourite, confirm: i.confirm }])),
      favOrder: [...(s.favourites || [])],
      rooms: this._roomList(),
      roomNames: { ...(s.room_names || {}) },
      pulse: s.pulse_seconds ?? 1,
      filter: "",
      onlyShown: false,
    };
    this._edit = true;
    this._renderEdit();
  }

  _roomList() {
    // every area that has candidates, in the current order
    const seen = new Map();
    for (const r of this._lay.rooms) seen.set(r.id === "_other" ? null : r.id, r.name);
    for (const i of this._lay.all || []) if (!seen.has(i.area_id)) seen.set(i.area_id, i.room);
    // page order first (already sorted by the server), then rooms that only have hidden devices; "Other" last
    const ids = [...seen.keys()].filter((id) => id !== null);
    if (seen.has(null)) ids.push(null);
    return ids.map((id) => ({ id, name: seen.get(id) }));
  }

  _renderEdit() {
    const D = this._draft, all = this._lay.all || [];
    const f = D.filter.trim().toLowerCase();
    const match = (i) => (!f || i.full_name.toLowerCase().includes(f) || i.entity_id.includes(f)) && (!D.onlyShown || D.items[i.entity_id].shown);
    const kinds = Object.keys(KIND_LABEL);
    const groups = D.rooms.map((r) => {
      const items = all.filter((i) => (i.area_id ?? null) === r.id && match(i));
      if (!items.length) return "";
      const rid = r.id ?? "_other";
      return `<div class="ehd"><span style="flex:1">${esc(D.roomNames[r.id] || r.name)}</span>
        <button class="btn sm" data-a="roomall" data-r="${esc(rid)}" data-v="1">Show all</button><button class="btn sm" data-a="roomall" data-r="${esc(rid)}" data-v="0">Hide all</button></div>
        ${items.map((i) => {
          const d = D.items[i.entity_id], e = esc(i.entity_id);
          return `<div class="erow ${d.shown ? "" : "off"}">
            <input type="checkbox" data-f="shown" data-e="${e}" ${d.shown ? "checked" : ""} aria-label="Show ${esc(i.full_name)}">
            <div class="nm" style="min-width:0"><input type="text" data-f="name" data-e="${e}" value="${esc(d.name)}" placeholder="${esc(i.name)}" maxlength="40"><div class="id">${e}</div></div>
            <select data-f="kind" data-e="${e}">${kinds.map((k) => `<option value="${k}" ${k === d.kind ? "selected" : ""}>${KIND_LABEL[k]}</option>`).join("")}</select>
            <label class="cf" style="${["gate", "garage", "lock"].includes(d.kind) ? "" : "visibility:hidden"}"><input type="checkbox" data-f="confirm" data-e="${e}" ${d.confirm ? "checked" : ""}>Confirm</label>
            <button class="star" data-a="fav" data-e="${e}" aria-pressed="${d.fav}" aria-label="Favourite"><ha-icon icon="${d.fav ? "mdi:star" : "mdi:star-outline"}"></ha-icon></button>
          </div>`;
        }).join("")}`;
    }).join("");
    const shownCount = Object.values(D.items).filter((d) => d.shown).length;
    this._root.innerHTML = `
      <section class="card s8"><h2><ha-icon icon="mdi:pencil"></ha-icon>Choose what's on the Controls page <span class="sub">${shownCount} of ${all.length} shown</span></h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="search" id="efilter" data-f="filter" placeholder="Search devices…" value="${esc(D.filter)}" style="flex:1;min-width:180px">
          <label class="cf"><input type="checkbox" data-f="onlyShown" ${D.onlyShown ? "checked" : ""}>Only shown</label></div>
        <p class="muted small" style="margin:8px 0 0">Tick to show, type a shorter name, pick the tile type, ★ for Favourites. Gates, garages and locks ask "tap again" before they move, unless you untick Confirm.</p>
        ${groups || `<div class="empty">No devices match.</div>`}
        <div class="sticky"><div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap">
          <span class="msg" id="emsg"></span><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="save">Save</button></div></div>
      </section>
      <section class="card s4"><h2><ha-icon icon="mdi:floor-plan"></ha-icon>Rooms</h2>
        <p class="muted small" style="margin:0 0 6px">Order and names on the page. Rooms come from Home Assistant's areas (Settings → Areas).</p>
        ${D.rooms.map((r, idx) => `<div class="rrow"><button class="ib" data-a="rup" data-i="${idx}" ${idx ? "" : "disabled"} aria-label="Move up"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="ib" data-a="rdown" data-i="${idx}" ${idx < D.rooms.length - 1 ? "" : "disabled"} aria-label="Move down"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          ${r.id === null ? `<span class="muted" style="flex:1">Other (no area)</span>` : `<input type="text" data-f="roomname" data-r="${esc(r.id)}" value="${esc(D.roomNames[r.id] || "")}" placeholder="${esc(r.name)}" maxlength="40">`}</div>`).join("")}
        <h2 style="margin-top:18px"><ha-icon icon="mdi:gate"></ha-icon>Gate relays</h2>
        <div style="display:flex;align-items:center;gap:8px;font-size:14px"><span style="flex:1">Pulse length<div class="muted small">relay on, then off after this</div></span>
          <input type="number" data-f="pulse" min="0.2" max="10" step="0.1" value="${D.pulse}"> s</div>
      </section>`;
    const fi = this.shadowRoot.getElementById("efilter");
    if (this._refocus) { fi.focus(); fi.setSelectionRange(fi.value.length, fi.value.length); this._refocus = false; }
  }

  _editInput(t) {
    const D = this._draft, f = t.dataset.f; if (!f) return;
    if (f === "filter") { D.filter = t.value; this._refocus = true; return this._renderEdit(); }
    if (f === "onlyShown") { D.onlyShown = t.checked; return this._renderEdit(); }
    if (f === "pulse") { D.pulse = Number(t.value); return; }
    if (f === "roomname") { D.roomNames[t.dataset.r] = t.value; return; }
    const d = D.items[t.dataset.e]; if (!d) return;
    if (f === "shown") { d.shown = t.checked; t.closest(".erow").classList.toggle("off", !t.checked); this._editCount(); }
    else if (f === "name") d.name = t.value;
    else if (f === "confirm") d.confirm = t.checked;
    else if (f === "kind") {
      d.kind = t.value;
      d.confirm = ["gate", "garage", "lock"].includes(d.kind);
      d.shown = true;
      this._renderEdit();
    }
  }
  _editCount() {
    const el = this.shadowRoot.querySelector("h2 .sub");
    if (el) el.textContent = `${Object.values(this._draft.items).filter((d) => d.shown).length} of ${(this._lay.all || []).length} shown`;
  }

  async _editClick(b, a) {
    const D = this._draft;
    if (a === "cancel") { this._edit = false; this._draft = null; this._root.innerHTML = ""; this._sections = null; return this._render(); }
    if (a === "fav") {
      const d = D.items[b.dataset.e]; d.fav = !d.fav;
      if (d.fav) { D.favOrder = D.favOrder.filter((x) => x !== b.dataset.e).concat(b.dataset.e); d.shown = true; }
      return this._renderEdit();
    }
    if (a === "roomall") {
      const rid = b.dataset.r === "_other" ? null : b.dataset.r;
      for (const i of this._lay.all) if ((i.area_id ?? null) === rid) D.items[i.entity_id].shown = b.dataset.v === "1";
      return this._renderEdit();
    }
    if (a === "rup" || a === "rdown") {
      const i = Number(b.dataset.i), j = a === "rup" ? i - 1 : i + 1;
      [D.rooms[i], D.rooms[j]] = [D.rooms[j], D.rooms[i]];
      return this._renderEdit();
    }
    if (a === "save") {
      const s = this._lay.settings || {};
      const ids = Object.keys(D.items);
      const kinds = { ...(s.kinds || {}) };
      for (const [eid, d] of Object.entries(D.items)) if (d.kind !== d.origKind) kinds[eid] = d.kind;
      const settings = {
        hidden: ids.filter((e) => !D.items[e].shown),
        added: ids.filter((e) => D.items[e].shown),
        names: Object.fromEntries(ids.filter((e) => D.items[e].name.trim()).map((e) => [e, D.items[e].name.trim()])),
        kinds,
        confirm: Object.fromEntries(ids.map((e) => [e, D.items[e].confirm])),
        favourites: D.favOrder.filter((e) => D.items[e]?.fav).concat(ids.filter((e) => D.items[e].fav && !D.favOrder.includes(e))),
        room_order: D.rooms.filter((r) => r.id !== null).map((r) => r.id),
        room_names: Object.fromEntries(Object.entries(D.roomNames).filter(([, v]) => v && v.trim())),
        pulse_seconds: D.pulse,
      };
      const msg = this.shadowRoot.getElementById("emsg");
      try {
        this._lay = await this._hass.callWS({ type: `${DOMAIN}/controls_settings`, settings });
        this._edit = false; this._draft = null; this._sections = null;
        this._root.innerHTML = "";
        this._render();
      } catch (e) { msg.textContent = e.message || "Could not save"; msg.className = "msg err"; }
    }
  }
}

if (!customElements.get("hamlet-home-controls")) customElements.define("hamlet-home-controls", HamletHomeControls);
