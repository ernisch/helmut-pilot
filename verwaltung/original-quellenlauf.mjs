// Ein ausdruecklicher POST; Statusabfragen sind rein lesend. Kein automatischer Neustart.
export function createQuellenlauf({ fetcher = globalThis.fetch, host = globalThis.window, changed = () => {} } = {}) {
  const key = "helmut-admin-quellenauftrag-v1";
  let state = { zustand: "bereit" }, auftrag = null, busy = false, closed = false, timer;
  const controllers = new Set();
  const valid = a => a && /^\d{4}-\d{2}-\d{2}$/.test(a.tag)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.auftragId);
  const update = value => { if (!closed) { state = value; changed(); } };
  const forget = () => { try { host.sessionStorage.removeItem(key); } catch {} auftrag = null; };
  async function request(url, options = {}, timeout = 12000) {
    const controller = new AbortController(); controllers.add(controller);
    const limit = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetcher(url, { credentials: "same-origin", mode: "same-origin", redirect: "error",
        cache: "no-store", ...options, signal: controller.signal });
      if (!r.ok) throw new Error(r.status === 401 ? "Bitte erneut anmelden." : r.status === 403 ? "Keine Berechtigung oder Sicherheitsprüfung abgelaufen." : "Antwort nicht bestätigt.");
      return await r.json();
    } finally { clearTimeout(limit); controllers.delete(controller); }
  }
  async function status() {
    if (!auftrag || closed) return;
    const current = auftrag;
    const expected = `admin-quellen-${auftrag.tag}-${auftrag.auftragId}`;
    try {
      const r = await request(`/api/admin/quellenlauf?${new URLSearchParams(auftrag)}`);
      if (closed || auftrag !== current) return;
      if (r?.laufId !== expected || !["laeuft", "abgeschlossen", "teilweise", "unbekannt"].includes(r.zustand)) throw new Error("Laufbeleg passt nicht zum Auftrag.");
      // Solange der POST antworten kann, darf ein fehlender Startbeleg die Anzeige
      // nicht als Abbruch ausgeben. Die gesendete Mutation wird dadurch nicht beendet.
      if (busy && r.zustand === "unbekannt") return;
      update(r);
      if (!busy && ["abgeschlossen", "teilweise"].includes(r.zustand)) forget();
    } catch (e) { if (!closed && auftrag === current && !busy) update({ zustand: "unbekannt", grund: "laufbeleg-nicht-lesbar" }); }
  }
  async function start() {
    if (busy || auftrag || closed) return;
    busy = true; let sent = false;
    update({ zustand: "prueft" });
    try {
      const { token } = await request("/api/security/csrf");
      if (closed) return;
      if (typeof token !== "string" || token.length < 20 || token.length > 300 || /[\r\n]/.test(token)) throw new Error("Sicherheitsprüfung nicht bestätigt.");
      auftrag = { auftragId: host.crypto.randomUUID(), tag: new Date().toISOString().slice(0, 10) };
      // Bei Reload bleibt nur die Kennung erhalten, kein Cookie, Token oder Inhalt.
      host.sessionStorage.setItem(key, JSON.stringify(auftrag));
      sent = true;
      timer = setInterval(() => { if (!closed) status(); }, 10000);
      const r = await request("/api/admin/quellenlauf", { method: "POST", headers: {
        "Content-Type": "application/json", "X-CSRF-Token": token, Accept: "application/json"
      }, body: JSON.stringify(auftrag) }, 295000);
      if (r?.auftragId !== auftrag.auftragId || r?.tag !== auftrag.tag
          || !["gesperrt", "abgeschlossen", "teilweise", "unbekannt"].includes(r.zustand)) throw new Error("Abschluss nicht bestätigt.");
      update(r);
      if (r.zustand !== "unbekannt") forget();
    } catch (e) {
      if (!sent) forget();
      update({ zustand: sent ? "unbekannt" : "fehler", grund: sent ? "abschluss-nicht-bestaetigt" : e.message });
    } finally { busy = false; clearInterval(timer); if (!closed) changed(); }
  }
  function restore() {
    try {
      const a = JSON.parse(host.sessionStorage.getItem(key));
      if (valid(a)) { auftrag = { auftragId: a.auftragId, tag: a.tag }; update({ zustand: "unbekannt", grund: "abschluss-nicht-bestaetigt" }); status(); }
    } catch {}
  }
  return { start, status, restore, state: () => ({ ...state, busy, offen: Boolean(auftrag) }),
    dispose() { closed = true; clearInterval(timer); for (const c of controllers) c.abort(); controllers.clear(); } };
}

export function quellenlaufText(s) {
  const labels = { bereit: "Manueller Start innerhalb der bestehenden Kontingente möglich.",
    prueft: "Start wird geprüft. Ein zugelassener Lauf dauert höchstens fünf Minuten.",
    laeuft: "Verarbeitung läuft. Die Abschlussbilanz folgt nach dem Lauf.",
    abgeschlossen: "Arbeitslauf abgeschlossen. Das bestätigt keine vollständige Quellenversorgung.",
    teilweise: "Arbeitslauf mit Teilstand oder Fehler beendet.",
    gesperrt: "Quellenlauf blockiert.", unbekannt: "Ausgang unbekannt. Der Lauf kann weiterlaufen. Status prüfen; kein automatischer Neustart.",
    fehler: "Start nicht gesendet." };
  const reasons = {
    "arbeitsfenster-aus": "Quellenarbeit ist ausgeschaltet.",
    "arbeitsfenster-vorflug-nicht-bereit": "Die Warteschlange ist nicht bereit oder nicht prüfbar.",
    "arbeitsfenster-belegt-oder-unbekannt": "Ein Lauf hält die Sperre oder die Sperre ist nicht prüfbar.",
    "arbeitslimit-tagesgrenze": "Tageskontingent ausgeschöpft oder Auftragskennung bereits verbraucht. Keine Sonderfreigabe.",
    "fensterkontingent-erschoepft": "Das Tageskontingent für Quellenläufe ist ausgeschöpft. Keine Sonderfreigabe.",
    "sekundenkontingent-erschoepft": "Das tägliche Zeitkontingent ist ausgeschöpft. Keine Sonderfreigabe.",
    "adminauftrag-bereits-verbraucht": "Diese Auftragskennung wurde bereits verbraucht. Status prüfen; kein erneuter Lauf.",
    "arbeitslimit-nicht-pruefbar": "Kontingent nicht prüfbar.",
    "arbeitslimits-ungueltig": "Arbeitslimits fehlen oder sind ungültig.",
    "adminauftrag-ungueltig-oder-abgelaufen": "Der Auftrag ist ungültig oder sein UTC-Tag ist abgelaufen.",
    "adminauftrag-tagesende": "Bis zum UTC-Tagesende bleibt zu wenig Laufzeit."
  };
  const counts = [["Verarbeitet", s.verarbeitet], ["Reserviert", s.reserviert], ["Zurückgestellt", s.zurueckgestellt], ["Fehlgeschlagen", s.fehlgeschlagen], ["Planrest", s.planAusstehend]]
    .filter(([, n]) => Number.isSafeInteger(n) && n >= 0).map(([label, n]) => `${label}: ${n}`).join(" · ");
  return [labels[s.zustand] || labels.unbekannt, s.grund ? (reasons[s.grund] || `Grund: ${s.grund}`) : "", counts].filter(Boolean).join(" ");
}

export function attachQuellenlauf(Original, { factory = createQuellenlauf } = {}) {
  return class extends Original {
    constructor(props) { super(props); this._quellenlauf = factory({ changed: () => { if (!this._closed) this.setState({}); } }); }
    componentDidMount() { super.componentDidMount(); this._quellenlauf.restore(); }
    componentWillUnmount() { this._quellenlauf.dispose(); super.componentWillUnmount(); }
    renderVals() {
      const v = super.renderVals(), s = this._quellenlauf.state();
      return { ...v, quellenlaufText: quellenlaufText(s), quellenlaufBusy: s.busy || s.offen
        || ["fensterkontingent-erschoepft", "sekundenkontingent-erschoepft"].includes(s.grund) || this._phase !== "ready",
        quellenlaufStatus: s.offen, quellenlaufStart: () => this._quellenlauf.start(), quellenlaufPruefen: () => this._quellenlauf.status() };
    }
  };
}
