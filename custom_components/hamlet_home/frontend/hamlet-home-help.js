// Hamlet Home – Help: the user guide (guide.md next to this file) with contents and the installer's contact details.
const DOMAIN = "hamlet_home";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const VERSION = new URL(import.meta.url).searchParams.get("v") || String(Date.now());

// small markdown: ## sections, **bold**, *italic*, - bullets, 1. lists, | tables |, paragraphs
function inline(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
}
function render(md) {
  const sections = [];
  let cur = null, html = [], i = 0;
  const lines = md.replace(/\r/g, "").split("\n");
  const flush = () => { if (cur) { cur.html = html.join(""); sections.push(cur); } html = []; };
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("## ")) { flush(); const title = ln.slice(3).trim(); cur = { title, id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-") }; i++; continue; }
    if (!cur) { i++; continue; }
    if (!ln.trim()) { i++; continue; }
    if (ln.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      html.push(`<div class="tw"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^- /.test(ln)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      html.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(ln)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      html.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(## |\||- |\d+\. )/.test(lines[i])) { para.push(lines[i]); i++; }
    const text = para.join(" ");
    // a paragraph that is only **bold** is a sub-heading
    html.push(/^\*\*[^*]+\*\*$/.test(text) ? `<h3>${esc(text.slice(2, -2))}</h3>` : `<p>${inline(text)}</p>`);
  }
  flush();
  return sections;
}

const STYLE = `
:host { display: contents; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--ha-card-border-color, var(--line));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px 20px; min-width: 0; grid-column: span 12; }
@media (min-width: 980px) { .toc { grid-column: span 4; align-self: start; position: sticky; top: calc(var(--header-height, 56px) + 16px); } .body { grid-column: span 8; } }
.body { display: grid; gap: 16px; min-width: 0; grid-column: span 12; }
h1 { font-size: 22px; font-weight: 500; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
h1 ha-icon { --mdc-icon-size: 26px; color: var(--accent); }
h2 { font-size: 18px; font-weight: 500; margin: 0 0 10px; }
h3 { font-size: 15px; font-weight: 500; margin: 18px 0 6px; }
p, li { font-size: 14.5px; line-height: 1.55; }
p { margin: 6px 0; } ul, ol { margin: 6px 0; padding-left: 22px; } li { margin: 3px 0; }
b { font-weight: 500; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.tw { overflow-x: auto; margin: 8px 0; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 500; color: var(--muted); font-size: 13px; }
.toc a { display: block; padding: 7px 10px; border-radius: 8px; color: var(--primary-text-color); text-decoration: none; font-size: 14px; }
.toc a:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.contact { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 14.5px; margin-top: 6px; }
.contact a { color: var(--accent); }
.call { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.btn ha-icon { --mdc-icon-size: 18px; }
.field { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.field input { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); width: min(280px, 60vw); }
details summary { cursor: pointer; font-size: 14px; color: var(--muted); margin-top: 10px; }
.msg { font-size: 13px; } .msg.err { color: var(--c-bad); } .msg.ok { color: var(--c-ok); }
.actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 10px; }
section { scroll-margin-top: calc(var(--header-height, 56px) + 12px); }
`;

class HamletHomeHelp extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first) this._load(); }
  update(s) {
    if (s.help_contact !== undefined) this._contact = s.help_contact;
    if (s.is_admin !== undefined) this._admin = s.is_admin;
    if (this._sections) this._renderContact();
  }

  async _load() {
    let md = "";
    try { const r = await fetch(`/hamlet_home_static/guide.md?v=${VERSION}`); md = await r.text(); }
    catch (e) { md = "## Help\n\nThe guide couldn't load – check the connection and try again."; }
    this._sections = render(md);
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <nav class="card toc" aria-label="Contents"><h1><ha-icon icon="mdi:help-circle-outline"></ha-icon>Help</h1>
        <p class="muted small" style="margin:0 0 8px">How Hamlet Home works and what you can change.</p>
        ${this._sections.map((s) => `<a href="#${s.id}" data-go="${s.id}">${esc(s.title)}</a>`).join("")}
        <a href="#contact" data-go="contact">Contact your installer</a></nav>
      <div class="body">
        <section class="card" id="contact-top"></section>
        ${this._sections.map((s) => `<section class="card" id="${s.id}"><h2>${esc(s.title)}</h2>${s.html}</section>`).join("")}
        <section class="card" id="contact"></section></div>`;
    this.shadowRoot.addEventListener("click", (ev) => this._click(ev));
    this._renderContact();
  }

  _renderContact() {
    const c = this._contact || {}, admin = this._admin;
    const phone = (c.phone || "").trim(), email = (c.email || "").trim(), name = c.name || "your installer";
    const tel = phone.replace(/[^\d+]/g, "");
    const lines = `<div class="contact">${phone ? `<span class="muted">Phone</span><a href="tel:${esc(tel)}">${esc(phone)}</a>` : ""}
      ${email ? `<span class="muted">Email</span><a href="mailto:${esc(email)}">${esc(email)}</a>` : ""}</div>
      ${c.note ? `<p>${esc(c.note)}</p>` : ""}`;
    const none = !phone && !email;
    const top = this.shadowRoot.getElementById("contact-top");
    if (top) top.innerHTML = `<h2>Need help?</h2><p>Contact <b>${esc(name)}</b>. Say which tab you're on and what its status line says, or send a screenshot.</p>
      ${none ? `<p class="muted small">${admin ? "Add your phone and email below (Contact your installer) so clients can reach you." : "Ask your installer for their contact details."}</p>` : lines}
      <div class="call">${tel ? `<a class="btn primary" href="tel:${esc(tel)}"><ha-icon icon="mdi:phone"></ha-icon>Call</a>` : ""}
        ${tel ? `<a class="btn" href="https://wa.me/${esc(tel.replace(/^0/, "27").replace(/^\+/, ""))}" target="_blank" rel="noopener"><ha-icon icon="mdi:whatsapp"></ha-icon>WhatsApp</a>` : ""}
        ${email ? `<a class="btn" href="mailto:${esc(email)}?subject=${encodeURIComponent("Hamlet Home help")}"><ha-icon icon="mdi:email-outline"></ha-icon>Email</a>` : ""}</div>`;
    const bot = this.shadowRoot.getElementById("contact");
    if (!bot) return;
    const a = this.shadowRoot.activeElement;
    if (a && a.closest && a.closest("#contact")) return;
    bot.innerHTML = `<h2>Contact your installer</h2><p><b>${esc(name)}</b></p>${none ? `<p class="muted">No contact details yet.</p>` : lines}
      ${admin ? `<details ${none ? "open" : ""}><summary>Edit contact details (admin)</summary>
        <div class="field"><label for="hc-name">Company / name</label><input id="hc-name" value="${esc(c.name || "")}" maxlength="60"></div>
        <div class="field"><label for="hc-phone">Phone</label><input id="hc-phone" type="tel" value="${esc(phone)}" maxlength="30" placeholder="e.g. 082 123 4567"></div>
        <div class="field"><label for="hc-email">Email</label><input id="hc-email" type="email" value="${esc(email)}" maxlength="80"></div>
        <div class="field"><label for="hc-note">Note<span class="muted small" style="display:block">e.g. office hours</span></label><input id="hc-note" value="${esc(c.note || "")}" maxlength="200"></div>
        <div class="actions"><span class="msg" id="hc-msg"></span><button class="btn primary" data-a="save">Save</button></div></details>` : ""}`;
  }

  async _click(ev) {
    const go = ev.target.closest("[data-go]");
    if (go) {
      ev.preventDefault();
      this.shadowRoot.getElementById(go.dataset.go)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (ev.target.closest("[data-a=save]")) {
      const $ = (id) => this.shadowRoot.getElementById(id);
      try {
        this._contact = await this._hass.callWS({ type: `${DOMAIN}/help_contact`, contact: { name: $("hc-name").value, phone: $("hc-phone").value, email: $("hc-email").value, note: $("hc-note").value } });
        this.shadowRoot.activeElement?.blur?.();
        this.dispatchEvent(new CustomEvent("hamlet-help-contact", { detail: this._contact, bubbles: true, composed: true }));
        this._renderContact();
        const m = $("hc-msg"); if (m) { m.textContent = "Saved"; m.className = "msg ok"; }
      } catch (e) { const m = $("hc-msg"); if (m) { m.textContent = e.message || "Could not save"; m.className = "msg err"; } }
    }
  }
}

if (!customElements.get("hamlet-home-help")) customElements.define("hamlet-home-help", HamletHomeHelp);
