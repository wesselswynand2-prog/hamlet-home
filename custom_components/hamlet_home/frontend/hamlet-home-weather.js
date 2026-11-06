// Hamlet Home – Weather tab: now, daily / hourly forecast, solar forecast vs actual.
import { WIND_CSS, anemoSvg, windState, applyWind, windWord } from "./hamlet-home-sky.js";
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

const COND = {
  "clear-night": ["mdi:weather-night", "Clear"], cloudy: ["mdi:weather-cloudy", "Cloudy"], exceptional: ["mdi:alert-circle-outline", "Warning"],
  fog: ["mdi:weather-fog", "Fog"], hail: ["mdi:weather-hail", "Hail"], lightning: ["mdi:weather-lightning", "Thunder"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "Thunderstorms"], partlycloudy: ["mdi:weather-partly-cloudy", "Partly cloudy"],
  pouring: ["mdi:weather-pouring", "Heavy rain"], rainy: ["mdi:weather-rainy", "Rain"], snowy: ["mdi:weather-snowy", "Snow"],
  "snowy-rainy": ["mdi:weather-snowy-rainy", "Sleet"], sunny: ["mdi:weather-sunny", "Sunny"], windy: ["mdi:weather-windy", "Windy"],
  "windy-variant": ["mdi:weather-windy-variant", "Windy"],
};
const condColor = (c) => (c === "sunny" ? "var(--c-solar)" : c === "partlycloudy" ? "var(--c-solar)" : ["rainy", "pouring", "lightning-rainy", "hail"].includes(c) ? "var(--c-rain)" : "var(--muted)");
const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (b) => (num(b) === null ? (typeof b === "string" ? b : "") : DIRS[Math.round(((Number(b) % 360) + 360) % 360 / 22.5) % 16]);

// unit conversion
const RAIN = { mm: 1, in: 25.4, cm: 10 };
const WIND = { "km/h": 1, "m/s": 3.6, mph: 1.609344, kn: 1.852, "ft/s": 1.09728 };
function rainConv(v, from, to) { if (num(v) === null) return null; if (to === "auto" || !RAIN[from] || !RAIN[to]) return Number(v); return (Number(v) * RAIN[from]) / RAIN[to]; }
function windConv(v, from, to) { if (num(v) === null) return null; if (to === "auto" || !WIND[from] || !WIND[to]) return Number(v); return (Number(v) * WIND[from]) / WIND[to]; }
const fmt = (v, d = 0) => (num(v) === null ? "–" : Number(v).toFixed(d));

const STYLE = WIND_CSS + `
.windgrid { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 16px; align-items: center; }
@media (max-width: 520px) { .windgrid { grid-template-columns: 110px minmax(0, 1fr); } }
.windgrid svg { width: 100%; height: auto; display: block; }
.wbig { font-size: 40px; font-weight: 300; font-variant-numeric: tabular-nums; line-height: 1; }
.wbig small { font-size: 16px; color: var(--muted); margin-left: 4px; }
.wrow { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 14px; }
.wrow b { font-weight: 600; }
.rose { width: 64px; height: 64px; }

:host { display: contents; --c-hot: #d9531e; --c-cold: #2a78d6; --c-rain: #3d93d8; }
:host([dark]) { --c-hot: #e8743b; --c-cold: #3987e5; --c-rain: #4fa3e6; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; min-width: 0; grid-column: span 12; position: relative; }
@media (min-width: 980px) { .s6 { grid-column: span 6; } .s5 { grid-column: span 5; } .s7 { grid-column: span 7; } }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 ha-icon { --mdc-icon-size: 20px; color: var(--muted); }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { font: inherit; font-size: 13px; padding: 4px 12px; border: 0; background: transparent; color: var(--primary-text-color); cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--text-primary-color, #fff); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.empty { padding: 32px 0; text-align: center; color: var(--muted); font-size: 14px; }
/* now */
.now { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 16px; align-items: center; }
.now > ha-icon { --mdc-icon-size: 64px; grid-row: span 2; }
.now .cond { font-size: 22px; }
.now .where { font-size: 13px; color: var(--muted); }
.now .t { font-size: 34px; text-align: right; font-variant-numeric: tabular-nums; line-height: 1.1; }
.now .hl { font-size: 13px; color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
.now .hl b { color: var(--c-hot); font-weight: 500; } .now .hl i { color: var(--c-cold); font-style: normal; }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 18px; margin-top: 14px; }
@media (max-width: 520px) { .stats { grid-template-columns: 1fr; } .now > ha-icon { --mdc-icon-size: 48px; } .now .t { font-size: 28px; } .now .cond { font-size: 18px; } }
.stat { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; min-width: 0; }
.stat ha-icon { --mdc-icon-size: 18px; color: var(--muted); flex: none; }
.stat .l { color: var(--muted); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat .v { font-variant-numeric: tabular-nums; white-space: nowrap; }
/* solar */
.money { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
@media (max-width: 520px) { .money { grid-template-columns: 1fr 1fr; } .money > div:first-child { grid-column: span 2; } }
.money > div { border-radius: 10px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); }
.money .k { font-size: 13px; color: var(--muted); }
.money .v { font-size: clamp(18px, 5vw, 24px); white-space: nowrap; font-variant-numeric: tabular-nums; margin-top: 2px; }
.money .s { font-size: 12px; color: var(--muted); }
.solgrid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 18px; align-items: start; }
@media (max-width: 860px) { .solgrid { grid-template-columns: 1fr; } }
.bar { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; margin-top: 6px; }
.bar i { display: block; height: 100%; background: var(--c-solar); border-radius: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--muted); margin: 0 0 6px; }
.key { display: inline-flex; align-items: center; gap: 6px; }
.key i { width: 14px; height: 0; border-top: 2px solid; display: inline-block; }
.key i.dash { border-top-style: dashed; }
.key i.box { height: 10px; width: 10px; border: 0; border-radius: 3px; }
/* charts */
.chartwrap { position: relative; }
.chartwrap svg { display: block; width: 100%; overflow: visible; touch-action: pan-y; }
.axis text { fill: var(--muted); font-size: 11px; }
.grid line { stroke: var(--line); }
.tip { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); white-space: nowrap; display: none; z-index: 2; top: 0; }
.tip .row { display: flex; gap: 14px; justify-content: space-between; }
.tip .row span:last-child { font-variant-numeric: tabular-nums; }
/* forecast */
.fc { overflow-x: auto; scrollbar-width: thin; }
.fcin { min-width: 100%; }
.cols { display: grid; text-align: center; }
.cols .d { font-size: 14px; white-space: nowrap; } .cols .dt { font-size: 12px; color: var(--muted); min-height: 16px; }
.cols ha-icon { --mdc-icon-size: 30px; margin: 4px 0 0; }
.fc svg text { font-size: 12px; fill: var(--primary-text-color); font-variant-numeric: tabular-nums; }
.fc svg text.m { fill: var(--muted); font-size: 11px; }
.fc svg .hot { stroke: var(--c-hot); fill: none; stroke-width: 2.5; }
.fc svg .cold { stroke: var(--c-cold); fill: none; stroke-width: 2; stroke-dasharray: 5 4; }
.fc svg .rain { fill: var(--c-rain); opacity: .45; }
.fc svg .sep { stroke: var(--line); stroke-dasharray: 3 3; }
select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); }
.field { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
details summary { cursor: pointer; font-size: 14px; color: var(--muted); }
.msg { font-size: 13px; } .msg.ok { color: var(--c-ok); } .msg.err { color: var(--c-bad); }
`;

class HamletHomeWeather extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mode = "daily";
    this._daily = null;
    this._hourly = null;
    this._html = {};
  }
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    this.toggleAttribute("dark", !!h.themes?.darkMode);
    if (first) this._load();
    else this._queue();
  }
  connectedCallback() { this._timer = setInterval(() => this._load(true), 5 * 60 * 1000); }
  disconnectedCallback() {
    clearInterval(this._timer);
    this._unsubs?.forEach((u) => u.then?.((f) => f && f()).catch?.(() => {}));
    this._unsubs = null;
    this._ro?.disconnect();
  }
  _queue() { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; this._renderNow(); this._renderExtras(); this._renderWind(); }); }

  // the client's own anemometer: speed, gust, direction, spinning cups
  _renderWind() {
    const card = this.shadowRoot.getElementById("cwind"); if (!card || !this._w) return;
    const c = this._w.conf || {};
    const ws = windState(this._hass, { wind_speed: c.wind_speed, wind_gust: c.wind_gust, wind_direction: c.wind_direction });
    card.hidden = !ws;
    applyWind(this.shadowRoot, ws, "wanemo");
    if (!ws) return;
    const v = ws.value ?? ws.gustValue, u = ws.value !== null ? ws.unit : ws.gustUnit;
    this._set("wspeed", `${v === null ? "–" : v.toFixed(v < 10 ? 1 : 0)}<small>${esc(u)}</small>`);
    this._set("wword", esc(windWord(ws.kmh ?? ws.gust)));
    const dir = ws.deg !== null ? `<span>From <b>${compass(ws.deg)}</b> (${Math.round(ws.deg)}°)</span>` : "";
    const gust = ws.gustValue !== null ? `<span>Gusts <b>${ws.gustValue.toFixed(ws.gustValue < 10 ? 1 : 0)} ${esc(ws.gustUnit)}</b></span>` : "";
    this._set("wrow", dir + gust);
    this._set("windsub", esc(ws.name));
  }
  _set(id, html) { const el = this.shadowRoot.getElementById(id); if (el && this._html[id] !== html) { this._html[id] = html; el.innerHTML = html; } }

  async _load(refresh = false) {
    try { this._w = await this._hass.callWS({ type: `${DOMAIN}/weather` }); }
    catch (e) { this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card empty">Weather couldn't load: ${esc(e.message || e)}</div>`; return; }
    if (!refresh || !this._built) this._build();
    this._renderNow(); this._renderSolar(); this._renderExtras(); this._renderSettings(); this._renderWind();
    if (!this._unsubs && !this._solarOnly) this._subscribe();
  }

  _subscribe() {
    const eid = this._w.conf.weather_entity;
    this._unsubs = [];
    if (!eid) return;
    const feats = this._hass.states[eid]?.attributes?.supported_features ?? 0;
    const sub = (type, key) => this._unsubs.push(this._hass.connection.subscribeMessage((ev) => {
      this[key] = ev.forecast || [];
      if (key === "_daily" || this._mode === "hourly") this._renderForecast();
      this._renderNow();
    }, { type: "weather/subscribe_forecast", forecast_type: type, entity_id: eid }).catch(() => null));
    if (feats & 1) sub("daily", "_daily");
    else if (feats & 4) sub("twice_daily", "_daily");
    if (feats & 2) sub("hourly", "_hourly");
    this._hasHourly = !!(feats & 2);
    this._hasDaily = !!(feats & 5);
  }

  get _solarOnly() { return this.getAttribute("section") === "solar"; }

  _build() {
    this._built = true;
    const solarCard = `<section class="card ${this._solarOnly ? "" : "s5"}" id="csolar"><h2><ha-icon icon="mdi:solar-power-variant"></ha-icon>Solar forecast <span class="sub" id="solsub"></span></h2>
        <div class="${this._solarOnly ? "solgrid" : ""}"><div><div id="solar"></div><div id="extras" class="stats"></div></div><div>
        <div class="legend" id="sollegend"><span class="key"><i style="border-color:var(--c-solar)"></i>Your solar</span><span class="key"><i class="dash" style="border-color:var(--muted)"></i>Forecast</span><span class="key"><i class="box" style="background:color-mix(in srgb, var(--muted) 22%, transparent)"></i>Likely range</span></div>
        <div class="chartwrap" id="solchart"></div></div></div></section>`;
    if (this._solarOnly) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>${solarCard}`;
      this._ro = new ResizeObserver(() => this._renderSolarChart());
      this._ro.observe(this.shadowRoot.getElementById("csolar"));
      return;
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <section class="card s7" id="cnow"><div id="now"></div><div id="nowstats" class="stats"></div></section>
      ${solarCard}
      <section class="card" id="cwind" hidden><h2><ha-icon icon="mdi:weather-windy"></ha-icon>Wind at home <span class="sub" id="windsub"></span></h2>
        <div class="windgrid"><svg viewBox="0 0 120 110" aria-hidden="true">${anemoSvg(60, 104, 1.25, "wanemo")}</svg>
        <div><div class="wbig" id="wspeed"></div><div class="muted" id="wword"></div><div class="wrow" id="wrow"></div></div></div></section>
      <section class="card" id="cfc"><h2><ha-icon icon="mdi:calendar-week"></ha-icon>Forecast <span class="sub"><span class="seg" id="fcseg"></span></span></h2>
        <div class="fc" id="fc"><div class="empty">Loading forecast…</div></div>
        <div id="settings"></div></section>`;
    const root = this.shadowRoot;
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-mode]");
      if (b) { this._mode = b.dataset.mode; this._renderForecast(); }
    });
    root.addEventListener("change", (ev) => { if (ev.target.dataset.pref) this._savePref(ev.target.dataset.pref, ev.target.value); });
    this._ro = new ResizeObserver(() => { this._renderForecast(); this._renderSolarChart(); });
    this._ro.observe(root.getElementById("cfc"));
  }

  /* ---------------------------------------------------------------- now */
  _units() {
    const a = this._hass.states[this._w.conf.weather_entity]?.attributes || {};
    const p = this._w.prefs || {};
    return { temp: a.temperature_unit || this._hass.config?.unit_system?.temperature || "°C",
      rainFrom: a.precipitation_unit || "mm", rain: p.rain_unit === "auto" ? (a.precipitation_unit || "mm") : p.rain_unit,
      windFrom: a.wind_speed_unit || "km/h", wind: p.wind_unit === "auto" ? (a.wind_speed_unit || "km/h") : p.wind_unit,
      rainTo: p.rain_unit, windTo: p.wind_unit, pressure: a.pressure_unit || "hPa", vis: a.visibility_unit || "km" };
  }

  _renderNow() {
    if (!this._w) return;
    const card = this.shadowRoot.getElementById("cnow");
    const eid = this._w.conf.weather_entity, st = eid ? this._hass.states[eid] : null;
    if (card) card.hidden = !st;
    if (!st) return;
    const a = st.attributes, u = this._units();
    const [icon, label] = COND[st.state] || ["mdi:weather-cloudy", st.state];
    const today = (this._daily || [])[0];
    const deg = (v) => (num(v) === null ? "–" : `${Number(v).toFixed(Math.abs(v) < 10 && v % 1 ? 1 : v % 1 ? 1 : 0)}°`);
    this._set("now", `<div class="now"><ha-icon icon="${icon}" style="color:${condColor(st.state)}"></ha-icon>
      <div class="cond">${esc(label)}</div><div class="t">${num(a.temperature) === null ? "–" : `${Number(a.temperature).toFixed(1)}${esc(u.temp)}`}</div>
      <div class="where">${esc(a.friendly_name || "")}${num(a.apparent_temperature) !== null ? ` · feels like ${deg(a.apparent_temperature)}` : ""}</div>
      <div class="hl">${today ? `<b>${deg(today.temperature)}</b> / <i>${deg(today.templow)}</i>` : ""}</div></div>`);
    const wind = windConv(a.wind_speed, u.windFrom, u.windTo), gust = windConv(a.wind_gust_speed, u.windFrom, u.windTo);
    const stats = [];
    if (num(a.cloud_coverage) !== null) stats.push(["mdi:weather-cloudy", "Cloud cover", `${fmt(a.cloud_coverage)}%`]);
    if (wind !== null) stats.push(["mdi:weather-windy", "Wind", `${fmt(wind, wind < 10 ? 1 : 0)} ${esc(u.wind)}${a.wind_bearing != null ? ` ${compass(a.wind_bearing)}` : ""}${gust !== null ? ` · gusts ${fmt(gust, gust < 10 ? 1 : 0)}` : ""}`]);
    if (num(a.humidity) !== null) stats.push(["mdi:water-percent", "Humidity", `${fmt(a.humidity)}%`]);
    if (today && num(today.precipitation) !== null) stats.push(["mdi:weather-rainy", "Rain today", `${fmt(rainConv(today.precipitation, u.rainFrom, u.rainTo), u.rain === "in" ? 2 : 1)} ${esc(u.rain)}${num(today.precipitation_probability) !== null ? ` · ${today.precipitation_probability}%` : ""}`]);
    if (num(a.uv_index) !== null) stats.push(["mdi:sun-wireless", "UV index", fmt(a.uv_index, 1)]);
    if (num(a.pressure) !== null) stats.push(["mdi:gauge", "Pressure", `${fmt(a.pressure)} ${esc(u.pressure)}`]);
    if (num(a.dew_point) !== null) stats.push(["mdi:thermometer-water", "Dew point", deg(a.dew_point)]);
    this._set("nowstats", stats.map(([i, l, v]) => `<div class="stat"><ha-icon icon="${i}"></ha-icon><span class="l">${l}</span><span class="v">${v}</span></div>`).join(""));
  }

  _renderExtras() {
    if (!this._w) return;
    const rows = (this._w.conf.weather_extras || []).map((eid) => {
      const st = this._hass.states[eid];
      if (!st) return "";
      const u = st.attributes.unit_of_measurement;
      const v = num(st.state) !== null ? `${Number(st.state).toFixed(Number(st.state) % 1 ? (Math.abs(st.state) < 10 ? 2 : 1) : 0)}${u ? (u === "%" ? "%" : ` ${u}`) : ""}` : st.state;
      return `<div class="stat"><ha-icon icon="${esc(st.attributes.icon || "mdi:information-outline")}"></ha-icon><span class="l">${esc(st.attributes.friendly_name || eid)}</span><span class="v">${esc(v)}</span></div>`;
    }).join("");
    this._set("extras", rows);
  }

  /* -------------------------------------------------------------- solar */
  _renderSolar() {
    const pv = this._w.pv || {}, card = this.shadowRoot.getElementById("csolar");
    const hasPv = pv.today !== null || pv.tomorrow !== null;
    if (card) card.hidden = !hasPv && !(this._w.conf.weather_extras || []).length;
    const done = this._w.solar_today_kwh;
    const pct = pv.today && done !== null ? Math.min(100, Math.round((done / pv.today) * 100)) : null;
    let tomNote = "";
    if (pv.today && pv.tomorrow !== null) {
      const d = Math.round(((pv.tomorrow - pv.today) / pv.today) * 100);
      tomNote = Math.abs(d) < 5 ? "about the same as today" : `${Math.abs(d)}% ${d > 0 ? "more" : "less"} than today`;
    }
    this._set("solar", hasPv ? `<div class="money">
      <div><div class="k">Today</div><div class="v">${fmt(pv.today, 1)} kWh</div>
        <div class="s">${done !== null ? `${fmt(done, 1)} kWh made so far${pct !== null ? ` · ${pct}%` : ""}` : "forecast"}</div>${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}</div>
      <div><div class="k">Still to come</div><div class="v">${fmt(pv.remaining, 1)} kWh</div><div class="s">rest of today</div></div>
      <div><div class="k">Tomorrow</div><div class="v">${fmt(pv.tomorrow, 1)} kWh</div><div class="s">${tomNote || "forecast"}</div></div></div>`
      : `<p class="muted small">No solar forecast sensor found. Add Solcast or Forecast.Solar, then pick it under Configure → Weather &amp; solar forecast.</p>`);
    this._set("solsub", pv.series_today?.length ? "kW through the day" : "");
    this.shadowRoot.getElementById("sollegend").hidden = !pv.series_today?.length;
    this._renderSolarChart();
  }

  _renderSolarChart() {
    const wrap = this.shadowRoot.getElementById("solchart"); if (!wrap || !this._w) return;
    const fc = this._w.pv?.series_today || [];
    const act = (this._w.solar_rows || []).map(([m, w]) => [m, w / 1000]);
    if (fc.length < 2) { wrap.innerHTML = ""; return; }
    const W = Math.max(wrap.clientWidth, 260), H = 170, m = { l: 34, r: 8, t: 8, b: 20 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const lit = fc.filter((r) => r[3] > 0.01 || r[1] > 0.01);
    const t0 = Math.max(0, Math.min((lit[0] || fc[0])[0], act.length ? act[0][0] : 1440) - 30);
    const t1 = Math.min(1440, Math.max((lit[lit.length - 1] || fc[fc.length - 1])[0] + 60, act.length ? act[act.length - 1][0] + 5 : 0) + 30);
    const ymax = Math.max(1, ...fc.map((r) => r[3]), ...act.map((r) => r[1])) * 1.08;
    const step = ymax > 8 ? 2 : ymax > 4 ? 1 : 0.5;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw, y = (v) => m.t + ih - (v / ymax) * ih;
    const mid = (r) => r[0] + 15;   // Solcast periods are 30 min; draw at the middle
    const band = fc.map((r) => `${x(mid(r))},${y(r[3])}`).join(" ") + " " + [...fc].reverse().map((r) => `${x(mid(r))},${y(r[2])}`).join(" ");
    const line = fc.map((r, i) => `${i ? "L" : "M"}${x(mid(r))},${y(r[1])}`).join("");
    const aline = act.filter((r) => r[0] >= t0).map((r, i) => `${i ? "L" : "M"}${x(r[0] + 2.5)},${y(r[1])}`).join("");
    const grid = []; for (let v = 0; v <= ymax; v += step) grid.push(v);
    const ticks = []; for (let t = Math.ceil(t0 / 180) * 180; t <= t1; t += 180) ticks.push(t);
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Solar forecast and actual production today">
      <g class="grid">${grid.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
      <g class="axis">${grid.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
        ${ticks.map((t) => `<text x="${x(t)}" y="${H - 4}" text-anchor="middle">${hhmm(t)}</text>`).join("")}</g>
      <polygon points="${band}" fill="var(--muted)" opacity=".18"/>
      <path d="${line}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>
      ${aline ? `<path d="${aline}" fill="none" stroke="var(--c-solar)" stroke-width="2.5" stroke-linejoin="round"/>` : ""}
      ${nm > t0 && nm < t1 ? `<line x1="${x(nm)}" x2="${x(nm)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" opacity=".6"/>` : ""}
      <line id="hl" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--primary-text-color)" opacity="0"/>
      <rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip" id="soltip"></div>`;
    const hit = wrap.querySelector("#hit"), tip = wrap.querySelector("#soltip"), hl = wrap.querySelector("#hl");
    const show = (ev) => {
      const r = hit.getBoundingClientRect(), t = t0 + ((ev.clientX - r.left) / r.width) * (t1 - t0);
      const f = fc.reduce((b, row) => (Math.abs(mid(row) - t) < Math.abs(mid(b) - t) ? row : b), fc[0]);
      const aRow = act.length ? act.reduce((b, row) => (Math.abs(row[0] - t) < Math.abs(b[0] - t) ? row : b), act[0]) : null;
      const xx = x(t);
      hl.setAttribute("x1", xx); hl.setAttribute("x2", xx); hl.setAttribute("opacity", ".35");
      tip.innerHTML = `<b>${hhmm(Math.round(t / 5) * 5)}</b><div class="row"><span>Forecast</span><span>${f[1].toFixed(1)} kW</span></div>
        <div class="row"><span>Likely</span><span>${f[2].toFixed(1)}–${f[3].toFixed(1)} kW</span></div>
        ${aRow && Math.abs(aRow[0] - t) < 15 ? `<div class="row"><span>Your solar</span><span>${aRow[1].toFixed(1)} kW</span></div>` : ""}`;
      tip.style.display = "block";
      const left = (xx / W) * wrap.clientWidth;
      tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), wrap.clientWidth - tip.offsetWidth)}px`;
    };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.style.display = "none"; hl.setAttribute("opacity", "0"); });
  }

  /* ----------------------------------------------------------- forecast */
  _renderForecast() {
    const box = this.shadowRoot.getElementById("fc"); if (!box || !this._w) return;
    const seg = this.shadowRoot.getElementById("fcseg");
    const card = this.shadowRoot.getElementById("cfc");
    if (!this._w.conf.weather_entity) { card.hidden = !this._w.is_admin; box.innerHTML = `<div class="empty">No weather entity – add one (Met.no, OpenWeatherMap…) and pick it under Configure → Weather &amp; solar forecast.</div>`; return; }
    if (this._mode === "hourly" && !this._hasHourly) this._mode = "daily";
    seg.innerHTML = this._hasHourly && this._hasDaily ? `<button data-mode="daily" aria-pressed="${this._mode === "daily"}">Days</button><button data-mode="hourly" aria-pressed="${this._mode === "hourly"}">Hours</button>` : "";
    const list = this._mode === "hourly" ? (this._hourly || []).slice(0, 24) : (this._daily || []).slice(0, 7);
    if (!list.length) { box.innerHTML = `<div class="empty">${this._daily === null && this._hourly === null ? "Loading forecast…" : "No forecast from this weather service."}</div>`; return; }
    const u = this._units(), hourly = this._mode === "hourly";
    const width = box.clientWidth || 600;
    const colW = hourly ? Math.max(54, width / list.length) : Math.max(46, width / list.length);
    const W = colW * list.length, n = list.length;
    const hi = list.map((f) => num(f.temperature)), lo = hourly ? [] : list.map((f) => num(f.templow));
    const rain = list.map((f) => rainConv(f.precipitation, u.rainFrom, u.rainTo));
    const temps = [...hi, ...lo].filter((v) => v !== null);
    const tmin = Math.min(...temps), tmax = Math.max(...temps), span = Math.max(tmax - tmin, 4);
    const top = 22, tempH = hourly ? 70 : 90, rainTop = top + tempH + 30, rainH = 46, H = rainTop + rainH + (hourly ? 46 : 32);
    const cx = (i) => (i + 0.5) * colW;
    const ty = (v) => top + (1 - (v - tmin) / span) * tempH;
    const rmax = Math.max(u.rain === "in" ? 0.4 : 10, ...rain.map((v) => v || 0));
    const path = (arr) => arr.map((v, i) => (v === null ? "" : `${i && arr[i - 1] !== null ? "L" : "M"}${cx(i)},${ty(v)}`)).join("");
    const deg = (v) => (v === null ? "" : `${Math.round(v)}°`);
    const rd = u.rain === "in" ? 2 : 1;
    const label = (f) => {
      const d = new Date(f.datetime);
      if (hourly) return [d.toLocaleTimeString([], { hour: "numeric" }).replace(/\s+/g, " "), d.getHours() === 0 ? d.toLocaleDateString([], { weekday: "short" }) : ""];
      if (f.is_daytime === false) return [d.toLocaleDateString([], { weekday: "short" }), "night"];
      return [d.toLocaleDateString([], { weekday: "short" }), d.getDate()];
    };
    const wind = list.map((f) => windConv(f.wind_speed, u.windFrom, u.windTo));
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${hourly ? "Hourly" : "Daily"} temperature and rain forecast">
      ${list.map((_, i) => (i ? `<line class="sep" x1="${i * colW}" x2="${i * colW}" y1="0" y2="${rainTop + rainH}"/>` : "")).join("")}
      <path class="hot" d="${path(hi)}"/>${hourly ? "" : `<path class="cold" d="${path(lo)}"/>`}
      ${hi.map((v, i) => (v === null ? "" : `<circle cx="${cx(i)}" cy="${ty(v)}" r="3.5" fill="var(--c-hot)"/><text x="${cx(i)}" y="${ty(v) - 9}" text-anchor="middle">${deg(v)}</text>`)).join("")}
      ${lo.map((v, i) => (v === null ? "" : `<circle cx="${cx(i)}" cy="${ty(v)}" r="3" fill="var(--c-cold)"/><text class="m" x="${cx(i)}" y="${ty(v) + 17}" text-anchor="middle">${deg(v)}</text>`)).join("")}
      ${rain.map((v, i) => {
        const h = v ? Math.max(2, (v / rmax) * rainH) : 0, p = num(list[i].precipitation_probability);
        return `${h ? `<rect class="rain" x="${cx(i) - colW * 0.3}" y="${rainTop + rainH - h}" width="${colW * 0.6}" height="${h}" rx="2"/>` : ""}
          <text x="${cx(i)}" y="${rainTop + rainH + 14}" text-anchor="middle" style="font-size:11px">${v ? `${v.toFixed(rd)}${u.rain === "in" ? '"' : ""}` : "–"}</text>
          ${p ? `<text class="m" x="${cx(i)}" y="${rainTop + rainH + 27}" text-anchor="middle">${p}%</text>` : ""}`;
      }).join("")}
      <line class="sep" x1="0" x2="${W}" y1="${rainTop + rainH}" y2="${rainTop + rainH}" style="stroke-dasharray:none"/>
      ${hourly ? wind.map((v, i) => (v === null ? "" : `<text class="m" x="${cx(i)}" y="${H - 6}" text-anchor="middle">${v.toFixed(v < 10 ? 1 : 0)}</text>`)).join("") : ""}
    </svg>`;
    const cols = `<div class="cols" style="grid-template-columns:repeat(${n}, ${colW}px)">${list.map((f) => {
      const [a, b] = label(f), [icon] = COND[f.condition] || ["mdi:weather-cloudy"];
      return `<div><div class="d">${esc(a)}</div><div class="dt">${esc(b)}</div><ha-icon icon="${icon}" style="color:${condColor(f.condition)}"></ha-icon></div>`;
    }).join("")}</div>`;
    box.innerHTML = `<div class="fcin" style="width:${W}px">${cols}${svg}</div>
      <div class="legend" style="margin-top:8px"><span class="key"><i style="border-color:var(--c-hot)"></i>${hourly ? "Temperature" : "High"}</span>
      ${hourly ? "" : `<span class="key"><i class="dash" style="border-color:var(--c-cold)"></i>Low</span>`}
      <span class="key"><i class="box" style="background:var(--c-rain);opacity:.6"></i>Rain (${esc(u.rain)}), chance below</span>
      ${hourly ? `<span class="key">Bottom row: wind ${esc(u.wind)}</span>` : ""}</div>`;
  }

  /* ----------------------------------------------------------- settings */
  _renderSettings() {
    const el = this.shadowRoot.getElementById("settings"); if (!el) return;
    if (!this._w.is_admin) { el.innerHTML = ""; return; }
    const p = this._w.prefs || {};
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
    const open = el.querySelector("details")?.open;
    el.innerHTML = `<details style="margin-top:14px" ${open ? "open" : ""}><summary>Weather settings</summary>
      <div class="field"><span>Rain in</span><select data-pref="rain_unit">${opt([["auto", "As the weather service"], ["mm", "mm"], ["in", "inches"]], p.rain_unit)}</select></div>
      <div class="field"><span>Wind in</span><select data-pref="wind_unit">${opt([["auto", "As the weather service"], ["km/h", "km/h"], ["m/s", "m/s"], ["mph", "mph"], ["kn", "knots"]], p.wind_unit)}</select></div>
      <p class="muted small" style="margin:8px 0 0">Weather entity, Solcast sensors and the extra sensors (e.g. Forecast SOC, DOD): Settings → Devices &amp; services → Hamlet Home → Configure → Weather &amp; solar forecast. <span class="msg" id="pmsg"></span></p></details>`;
  }

  async _savePref(key, value) {
    try {
      this._w.prefs = await this._hass.callWS({ type: `${DOMAIN}/weather_settings`, settings: { [key]: value } });
      this._html = {};
      this._renderNow(); this._renderForecast();
      const m = this.shadowRoot.getElementById("pmsg"); if (m) { m.textContent = "Saved"; m.className = "msg ok"; }
    } catch (e) { const m = this.shadowRoot.getElementById("pmsg"); if (m) { m.textContent = e.message || "Could not save"; m.className = "msg err"; } }
  }
}

if (!customElements.get("hamlet-home-weather")) customElements.define("hamlet-home-weather", HamletHomeWeather);
