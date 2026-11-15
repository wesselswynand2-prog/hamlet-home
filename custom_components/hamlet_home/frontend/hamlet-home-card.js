// Hamlet Home dashboard card: shows one part of the Hamlet Home app on any Home Assistant dashboard.
//   type: custom:hamlet-home-card
//   view: property   # energy, flow, today, property, costs, weather, garden, irrigation, pump, booster, pool, geyser, devices, controls, alarms
// Loaded on every page by the Hamlet Home integration (no resource to add).
const V = new URL(import.meta.url).searchParams.get("v") || "";
const VIEWS = [
  ["property", "Property – the whole place, animated"],
  ["flow", "Power flow"],
  ["today", "Today – solar, battery, costs"],
  ["energy", "Energy – the whole Energy page"],
  ["costs", "Costs"],
  ["weather", "Weather"],
  ["garden", "Garden watering – valves, programs, hose tap"],
  ["irrigation", "Irrigation – the whole Irrigation page"],
  ["booster", "Booster pump – gauge, drawing, tank, borehole"],
  ["pump", "Pump – the whole Pump page"],
  ["pool", "Pool"],
  ["geyser", "Geyser"],
  ["devices", "Devices"],
  ["controls", "Controls"],
  ["alarms", "Alarms"],
];
const IDS = VIEWS.map((v) => v[0]);

class HamletHomeCard extends HTMLElement {
  setConfig(config) {
    const view = (config && config.view) || "property";
    if (!IDS.includes(view)) throw new Error(`Hamlet Home card: unknown view "${view}". Use one of: ${IDS.join(", ")}`);
    const changed = !this._cfg || this._cfg.view !== view;
    this._cfg = { ...config, view };
    if (changed && this._el) { this._el.remove(); this._el = null; }
    this._mount();
  }
  set hass(h) {
    this._hass = h;
    if (this._el) this._el.hass = h; else this._mount();
  }
  async _mount() {
    if (!this._cfg || !this._hass || this._el || this._loading) return;
    this._loading = true;
    try {
      if (!customElements.get("hamlet-home-panel")) await import(`/hamlet_home_static/hamlet-home-panel.js?v=${V}`);
      const el = document.createElement("hamlet-home-panel");
      el.embed = this._cfg.view;
      el.narrow = true;
      el.panel = { config: { title: "Hamlet Home" } };
      el.hass = this._hass;
      this._el = el;
      this.replaceChildren(el);
    } catch (e) {
      this.innerHTML = `<ha-card style="padding:16px">Hamlet Home couldn't load (${String(e.message || e)}). Refresh the page.</ha-card>`;
    } finally { this._loading = false; }
  }
  getCardSize() { return { flow: 6, today: 6, booster: 7, garden: 9 }[this._cfg?.view] || 10; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }
  static getStubConfig() { return { view: "property" }; }
  static getConfigElement() { return document.createElement("hamlet-home-card-editor"); }
}

class HamletHomeCardEditor extends HTMLElement {
  setConfig(config) { this._cfg = { view: "property", ...config }; this._render(); }
  set hass(h) { this._hass = h; }
  _render() {
    if (!this._built) {
      this.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">
        <label for="hhc-view" style="font-weight:500">What to show</label>
        <select id="hhc-view" style="font:inherit;padding:10px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)">
          ${VIEWS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select>
        <span style="font-size:12px;color:var(--secondary-text-color)">Works like the same page in the Hamlet Home app – live and animated.</span></div>`;
      this.querySelector("select").addEventListener("change", (e) => {
        this._cfg = { ...this._cfg, view: e.target.value };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._cfg }, bubbles: true, composed: true }));
      });
      this._built = true;
    }
    this.querySelector("select").value = this._cfg.view;
  }
}

if (!customElements.get("hamlet-home-card")) customElements.define("hamlet-home-card", HamletHomeCard);
if (!customElements.get("hamlet-home-card-editor")) customElements.define("hamlet-home-card-editor", HamletHomeCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hamlet-home-card")) {
  window.customCards.push({ type: "hamlet-home-card", name: "Hamlet Home", description: "A part of the Hamlet Home app: property, power flow, garden watering, pump, pool, geyser …", preview: false });
}
