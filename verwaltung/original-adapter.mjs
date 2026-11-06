import { number, list, todayCost, dateTime, parliamentLabel, processLabel, runState, profileInventoryNotice } from "./model.mjs";
import { emptyDailyLedger } from "./original-daily-ledger.mjs";

// Projektion vorhandener Antworten auf das UNVERÄNDERTE Claude-Komponentenmodell.
// Keine Erzeugung, Datenhaltung, Qualitätsentscheidung oder Quellenabfrage.
const originalAreas = [["briefing", "Briefing"], ["lage", "Lage"], ["radar", "Radar"]];
const originalBuckets = [["brauchbar", "Brauchbar"], ["fehlt", "Fehlt"], ["leer", "Leer"], ["doppelt", "Doppelt"], ["unbrauchbar", "Unbrauchbar"], ["offen", "Nicht beurteilt"]];
const originalFmt = (n, digits = 0) => number(n) === null ? "Nicht bekannt" : n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
// Der technische Status 'eingeladen' entsteht bereits ohne versandte Einladung.
export const customerStatusLabel = status => ({ aktiv: "Aktiv", eingeladen: "Zugangseinrichtung offen", testphase: "Testphase", pausiert: "Pausiert", gekuendigt: "Gekündigt", deaktiviert: "Deaktiviert" })[status] || "Nicht bekannt";
const customerAccessLabel = raw => raw.active === false ? "Gesperrt"
  : raw.active === true && ["deaktiviert", "gekuendigt"].includes(raw.status) ? "Kontostatus widersprüchlich · Zugang nicht bestätigt"
    : raw.status === "eingeladen" ? "Zugangseinrichtung offen"
      : raw.active === true && ["aktiv", "testphase", "pausiert"].includes(raw.status) ? "Laut Kontostatus freigegeben" : "Nicht bestätigt";
export const originalHelpers = Object.freeze({
  AREAS: originalAreas, AREA_LABEL: Object.fromEntries(originalAreas), BUCKETS: originalBuckets,
  STAGES: ["Lauf erfolgt", "Inhalt vorhanden", "Inhalt vollständig", "Inhalt brauchbar"],
  PARL: { bundestag: "Bundestag", berlin: "Berlin", brandenburg: "Brandenburg", unbekannt: "Mandatsebene nicht bekannt" },
  AST: { unbekannt: { label: "Nicht geprüft", tone: "neutral", stage: 0, bucket: "offen" }, inaktiv: { label: "Inaktiv", tone: "neutral", stage: -1, bucket: "inaktiv" } },
  CAUSES: {},
  fmt: { int: originalFmt, usd: (n, d = 2) => number(n) === null ? "Nicht bekannt" : `${originalFmt(n, d)} USD`,
    eur: n => number(n) === null ? "Nicht bekannt" : `${originalFmt(n, 2)} EUR`,
    pct: n => number(n) === null ? "Nicht bekannt" : `${originalFmt(n * 100)} %` },
  verlauf: () => []
});

export function originalSnapshot(payloads = {}, errors = {}) {
  const overview = payloads.overview;
  const inventoryNotice = profileInventoryNotice(overview);
  const rawProfiles = inventoryNotice ? null : list(overview?.mandates);
  const profiles = (rawProfiles || []).filter(p => p && typeof p.id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(p.id)).map((p, i) => {
    const level = parliamentLabel(p);
    const parl = level === "Bundestag" ? "bundestag" : level === "Abgeordnetenhaus Berlin" ? "berlin" : level === "Landtag Brandenburg" ? "brandenburg" : "unbekannt";
    return { id: p.id, i, name: p.fullName || p.id, mandat: p.constituency || "Wahlkreis nicht angegeben", parl, parlLabel: level,
      aktiv: typeof p.profileActive === "boolean" ? p.profileActive : null,
      status: p.profileActive === false ? "inaktiv" : "offen", raw: p, lokal: false,
      a: Object.fromEntries(originalAreas.map(([key]) => [key, { k: p.profileActive === false ? "inaktiv" : "unbekannt" }])),
      cost: null, teuer: false, lastOk: "Nicht belegt", sources: [], quelleBetroffen: false, runOk: false };
  });
  const act = profiles.filter(p => p.aktiv === true);
  const allFlagsKnown = rawProfiles !== null && rawProfiles.every(p => p && typeof p.profileActive === "boolean");
  const counts = { total: rawProfiles === null ? null : profiles.length, aktiv: allFlagsKnown ? act.length : null,
    inaktiv: allFlagsKnown ? profiles.filter(p => p.aktiv === false).length : null,
    ok: null, problem: null, offen: null, ohneBrauchbar: null, quelle: null };
  const cost = todayCost(payloads.budget);
  const budget = payloads.budget;
  const today = cost.unknown === 0 ? cost.known : null;
  const customers = (list(payloads.customers?.kunden) || []).filter(c => c && typeof c.userId === "string").map(c => ({
    id: c.userId, name: c.name || c.email || c.userId, person: c.name || "Nicht bekannt", mail: c.email || "Nicht bekannt",
    tarif: "Vereinbarung", preis: number(c.customer?.pricePerMonth), zugang: c.active === false ? "gesperrt" : c.status === "eingeladen" ? "eingeladen" : c.active === true ? "aktiv" : "nicht_eingeladen",
    status: c.status === "pausiert" ? "pausiert" : c.status === "eingeladen" ? "entwurf" : "vertrag",
    last: c.lastSeenAt || c.lastLoginAt ? dateTime(c.lastSeenAt || c.lastLoginAt, true) : "—",
    profiles: c.politicianId ? [c.politicianId] : [], users: [[c.name || c.email || "Konto", c.active === false ? "gesperrt" : c.status === "eingeladen" ? "eingeladen" : "aktiv"]], raw: c
  }));
  const sources = (list(payloads.sources?.stoerungen?.gestoerte) || []).filter(s => s && typeof s.quelle === "string").map(s => ({
    id: s.quelle, name: s.name || s.quelle, scope: [], haupt: s.kritisch === true, state: "unbekannt", text: s.erklaerung || s.kurz || "Quellenzustand nicht bestätigt",
    last: s.letzterErfolg ? dateTime(s.letzterErfolg, true) : "Nicht bekannt", bound: null, harmed: null, tech: "", raw: s
  }));
  const runs = (list(payloads.runs?.processRuns) || []).map(r => ({ t: dateTime(r.startedAt, true), label: ({ "briefing-lage": "Lage vorbereiten", "briefing-morning": "Morgenbriefing vorbereiten", "briefing-nachlauf-500": "Textnachlauf" })[r.process] || processLabel(r.process),
    text: runState(r.status).label, ok: false, planned: true, tech: typeof r.id === "string" ? `Lauf ${r.id}` : "", raw: r }));
  return {
    profiles, byId: Object.assign(Object.create(null), Object.fromEntries(profiles.map(p => [p.id, p]))), act, counts, sources, customers, invoices: [], runs, groups: [], failedRuns: null,
    bilanz: originalAreas.map(([area, label]) => ({ area, label, cells: Object.fromEntries(originalBuckets.map(([key]) => [key, null])) })),
    costs: { today, month: number(budget?.monat?.estimatedCostUsd), profileCost: null, shared: null, avg: null, median: null, expensive: [], dayLimit: null, monthLimit: null, dayShare: null, monthShare: null },
    health: { label: inventoryNotice ? "Profilbestand nicht bestätigt" : "Ergebnisstand offen", tone: "neutral", text: inventoryNotice || "Die Verwaltung zeigt vorhandene Daten. Eine vollständige Qualitätsbilanz liegt nicht vor." },
    payloads, errors, cost, inventoryNotice
  };
}

export function applyOriginalTruth(component, values, snapshot, phase = "ready") {
  const v = values, D = snapshot, p = D.byId[component.state.route.id];
  const open = component.tone("neutral");
  const blocked = phase === "unauthorized" || phase === "forbidden";
  const readError = Object.keys(D.errors).length ? "Ein Teil der Daten konnte nicht geladen werden. Bitte die Ansicht neu laden." : "";
  const errorText = phase === "unauthorized" ? "Bitte melde dich erneut an." : phase === "forbidden" ? "Die Verwaltung ist nur für Administratoren zugänglich."
    : [D.inventoryNotice, readError].filter(Boolean).join(" ") || D.health.text;
  v.dateLine = D.payloads.overview?.generatedAt ? `Stand ${dateTime(D.payloads.overview.generatedAt, true)} Berlin` : "Stand nicht bekannt";
  // Neutral = hohler Ring (Design v3); die Vorlage kennt am Seitenkopf nur Fläche + Halo.
  v.health = { label: blocked ? "Zugriff gesperrt" : phase === "error" ? "Daten nicht verfügbar" : D.health.label, text: errorText, dot: open.dot, halo: `${open.halo}, inset 0 0 0 1.5px ${open.ring}` };
  v.bigNums = [
    { label: "Profile", value: originalFmt(D.counts.total), sub: "Vorhandener Bestand", ink: "var(--ink)", onClick: component.goList({}) },
    { label: "Aktiv", value: originalFmt(D.counts.aktiv), sub: "Laut Profilstatus", ink: "var(--ink)", onClick: component.goList({ drill: { status: "aktiv" } }) },
    { label: "Vollständig erfolgreich", value: "—", sub: "Qualitätsbilanz steht aus", ink: "var(--muted)", onClick: component.goList({}) },
    { label: "Mit Problem", value: "—", sub: "Ergebnisprüfung steht aus", ink: "var(--muted)", onClick: component.goList({}) }
  ];
  v.statusLines = [
    { label: "Quellen", value: D.payloads.sources?.stoerungen?.verfuegbar === true ? "Laufverhalten liegt vor" : "Nicht bestätigt", sub: " · Details unter Quellen", ...open, href: "#/betrieb/quellen", onClick: component.go("#/betrieb/quellen") },
    { label: "KI Kosten heute", value: D.cost.value === "—" ? "Nicht bekannt" : D.cost.value, sub: ` · ${D.cost.note}`, ...open, href: "#/betrieb/kosten", onClick: component.go("#/betrieb/kosten") }
  ];
  v.listEyebrow = `${originalFmt(D.counts.total)} Profile · ${v.dateLine}`;
  if (D.inventoryNotice) {
    v.listCount = D.inventoryNotice; v.listEmpty = false; v.pageInfo = "";
  }
  v.attSub = "Fachliche Ergebnisprüfung offen";
  v.groupsEmpty = false; v.groupsMore = false;
  v.groups = [{ ...open, title: "Ergebnisqualität noch nicht belegt", detail: errorText, areaLabel: "Ergebnisstand", countLabel: "Offen", onClick: component.go("#/betrieb/bilanz") }];
  v.secEyebrow = v.dateLine;
  // Kurzform passt in die 74px-Kostenspalte; „—“ heißt hier: nicht bekannt.
  if (v.rows) for (const row of v.rows) { row.cost = "—"; row.costInk = "var(--muted)"; row.qu = { label: "Nicht bestätigt", ink: "var(--muted)" }; }
  if (v.zeigenOpts) v.zeigenOpts = v.zeigenOpts.map((option, index) => index === 0 ? { ...option, count: originalFmt(D.counts.total) }
    : { ...option, count: "–", onClick: () => component.say("Für diesen Filter fehlt noch die vollständige Ergebnisprüfung.") });
  if (v.pProfil && p) {
    const raw = component._detail?.id === p.id ? component._detail : null;
    const validation = raw?.validierung || p.raw.validierung;
    const fields = list(validation?.fehlendePflichtfelder) || [];
    v.pd.answers = [
      { k: "Profilangaben", v: validation?.bereit === true ? "Vollständig laut Profilprüfung" : fields.length ? fields.map(x => typeof x === "string" ? x : x.label || x.key || "Angabe fehlt").join(", ") : "Nicht bestätigt", ink: "var(--ink)" },
      { k: "Ergebnisse", v: "Vollständigkeit und Qualität nicht belegt", ink: "var(--muted)" },
      { k: "Zuletzt vollständig erfolgreich", v: "Nicht belegt", ink: "var(--muted)" }
    ];
    v.pd.areas = originalAreas.map(([, label]) => ({ label, st: component.st("Nicht geprüft", "neutral"), segs: [], stageText: "Kein Ergebnisnachweis", text: "Ein abgeschlossener Lauf allein bestätigt keine vollständigen oder brauchbaren Inhalte." }));
    v.pd.sources = []; v.pd.verlauf = []; v.pd.tech = [{ line: `Profil ${p.id}` }];
    v.pd.cost = "Nicht bekannt"; v.pd.costNote = "Keine belegte Kostenzuordnung je Profil";
    v.pd.danger = [{ title: "Profiländerungen", text: "Aktivierung, Löschung und Versorgung werden mit dem laufenden Motortest abgestimmt.", label: "Hinweis", onClick: () => component.say("Diese Profilaktion ist noch nicht freigegeben.") }];
    if (component._detailError) v.pd.answers.unshift({ k: "Profildetails", v: "Lesen nicht bestätigt. Bitte neu laden.", ink: "var(--warn-ink)" });
  }
  if (v.hasTabs && component.state.route.page === "betrieb") {
    const ledger = D.inventoryNotice ? emptyDailyLedger() : D.dailyLedger || emptyDailyLedger();
    v.bilanzHead = ledger.available ? `Tagesübersicht · ${ledger.day}` : "Tagesübersicht noch ungeprüft";
    v.bilanzSub = D.inventoryNotice || ledger.note;
    const headings = ["Gemeldet", "Läufe gelesen", "Mit Fehler", "Vollständigkeit", "Qualität", "Empfang"];
    v.bucketHeads = headings.map(label => ({ label }));
    v.bilanzRows = ledger.rows.map(row => ({ label: row.label, cells: [row.reportedStored, row.readRuns, row.failedRuns, row.completeness, row.quality, row.received]
      .map((value, index) => ({ v: value === null ? "Ungeprüft" : String(value), label: headings[index], aria: `${row.label}, ${headings[index]}: ${value === null ? "ungeprüft" : value}`,
        pe: "none", ink: "var(--muted)", onClick: () => {} })) }));
    v.runs = D.runs.map(r => ({ ...r, ...open, ink: "var(--text)" }));
    v.runsEmpty = !v.loading && v.runs.length === 0;
    v.wartung = [{ title: "Motoraktionen", text: "Recovery und neue Erzeugung werden getrennt abgestimmt.", has: false, none: true, label: "Nicht freigegeben" }];
    v.srcHead = D.payloads.sources?.stoerungen?.verfuegbar === true ? "Vorhandene Quellenhinweise" : "Quellenzustand nicht bestätigt.";
    v.srcRows = D.sources.map(s => ({ name: s.name, scope: "Vorhandene Laufbeobachtung", ...open, ink: "var(--text)", text: s.text,
      last: s.last, affected: "Mandatswirkung siehe bestehenden Quellenbericht", onClick: () => component.say("Eine vollständige Zuordnung je Profil liegt hier nicht vor."), hasTech: false, tech: "" }));
    v.costNums = [{ label: "Heute", value: D.cost.value === "—" ? "Nicht bekannt" : D.cost.value, sub: D.cost.note, ink: "var(--ink)" },
      { label: "Monat bis heute", value: originalHelpers.fmt.usd(D.costs.month), sub: "Bekannter Schätzbetrag; Vollständigkeit offen", ink: "var(--ink)" },
      { label: "Pro Profil", value: "Nicht bekannt", sub: "Zuordnung nicht bestätigt", ink: "var(--muted)" },
      { label: "Gemeinsam", value: "Nicht bekannt", sub: "Zuordnung nicht bestätigt", ink: "var(--muted)" }];
    v.budgets = [{ label: "Aufrufgrenze heute", value: number(D.payloads.budget?.limit) === null ? "Nicht bekannt" : `${originalFmt(D.payloads.budget.calls)} von ${originalFmt(D.payloads.budget.limit)} Aufrufen`,
      w: "0%", bar: "transparent", ink: "var(--ink)", noteInk: "var(--muted)", note: "Keine USD-Budgetgrenze aus der Aufrufzahl ableiten." }];
    v.teuer = []; v.teuerEmpty = true;
  }
  if (v.pAbrechnung) {
    v.openSum = "Nicht bekannt"; v.invRows = []; v.secEyebrow = "Keine Rechnungsanbindung belegt"; v.invoiceDot = "var(--muted-2)";
  }
  if (v.tabs && component.state.route.page === "kunden") for (const tab of v.tabs) tab.dot = "transparent";
  if (v.custRows) for (const row of v.custRows) {
    const c = D.customers.find(x => `#/kunde/${x.id}` === row.href);
    if (c) { row.zu = component.st(customerAccessLabel(c.raw), c.raw.active === false ? "warn" : "neutral"); row.zuText = `Zugang ${customerAccessLabel(c.raw)}`; }
    row.tarif = c?.preis === null ? "Preis nicht gepflegt" : originalHelpers.fmt.eur(c?.preis);
    row.status = customerStatusLabel(c?.raw.status);
    row.profiles = c?.profiles.length ? c.profiles.map(id => D.byId[id]?.name || `${id} · Details nicht verfügbar`).join(", ") : "Keine Kennung zugeordnet";
  }
  if (v.pKunden) {
    v.secEyebrow = list(D.payloads.customers?.kunden) === null ? "Kundenbestand nicht verfügbar" : `${D.customers.length} Konten mit Kundendaten`;
    v.kundenHead = list(D.payloads.customers?.kunden) === null ? "Bitte die Ansicht neu laden." : "Zugang und Vertragsstatus getrennt prüfen";
    v.custEmpty = !v.loading && list(D.payloads.customers?.kunden) !== null && !(v.custRows || []).length;
  }
  if (v.kd && component.state.route.page === "kunde") {
    const c = D.customers.find(x => x.id === component.state.route.id);
    v.kd.status = customerStatusLabel(c.raw.status);
    v.kd.facts = [
      { k: "Ansprechpartner", v: c.person, ink: "var(--ink)" }, { k: "E-Mail", v: c.mail, ink: "var(--ink)" },
      { k: "Monatspreis", v: originalHelpers.fmt.eur(c.preis), ink: "var(--ink)" },
      { k: "Kontostatus", v: customerStatusLabel(c.raw.status), ink: "var(--ink)" },
      { k: "Zugang", v: customerAccessLabel(c.raw), ink: "var(--ink)" },
      { k: "Letzte Aktivität", v: c.last === "—" ? "Nicht bekannt" : c.last, ink: "var(--ink)" }
    ];
    if (typeof c.raw.customer?.internalNote === "string" && c.raw.customer.internalNote.trim()) v.kd.facts.push({ k: "Interne Notiz", v: c.raw.customer.internalNote, ink: "var(--ink)" });
    v.kd.profiles = c.profiles.map(id => {
      const profile = D.byId[id];
      return { name: profile?.name || id, sub: profile ? profile.mandat : "Profildetails nicht verfügbar", st: component.st("Nicht geprüft", "neutral"),
        href: `#/profil/${encodeURIComponent(id)}`, onClick: profile ? component.go(`#/profil/${encodeURIComponent(id)}`) : event => { event?.preventDefault(); component.say("Die Profilübersicht konnte nicht bestätigt werden."); } };
    });
    v.kd.noProfiles = c.profiles.length === 0;
    v.kd.users = [{ name: c.person, z: component.st(customerAccessLabel(c.raw), c.raw.active === false ? "warn" : "neutral") }];
    v.kd.lockText = "Ändert ausschließlich den Zugang dieses Kontos. Profilversorgung bleibt unverändert.";
    const knownRole = ["abgeordneter", "referent", "demo"].includes(c.raw.role);
    const knownStatus = ["aktiv", "testphase", "pausiert", "eingeladen"].includes(c.raw.status);
    if (!knownRole || !knownStatus || typeof c.raw.active !== "boolean") {
      v.kd.lockTitle = "Kontozugang";
      v.kd.lockText = c.raw.role === "admin" ? "Administratorzugänge werden hier nicht geändert."
        : ["deaktiviert", "gekuendigt"].includes(c.raw.status) ? `Kontostatus: ${customerStatusLabel(c.raw.status)}. Dieser Schalter reaktiviert den Kontostatus nicht.`
          : "Der aktuelle Kontostand ist nicht bestätigt. Bitte neu laden.";
      v.kd.lockLabel = "Nicht verfügbar";
      v.kd.lockAction = () => component.say(v.kd.lockText);
    } else {
      const restore = c.raw.active === false;
      const setup = c.raw.status === "eingeladen" ? "Zugangseinrichtung bleibt offen. Keine Einladung oder Anmeldung bestätigt." : "Anmeldbarkeit wird hier nicht bestätigt.";
      v.kd.lockTitle = restore ? "Kontozugang freigeben" : "Kontozugang sperren";
      v.kd.lockLabel = restore ? "Freigeben" : "Sperren";
      if (restore) v.kd.lockText = `Hebt nur die aktive Kontosperre auf. ${setup} Profilversorgung bleibt unverändert.`;
      else if (c.raw.status === "eingeladen") v.kd.lockText = `Zugangseinrichtung offen. ${v.kd.lockText}`;
      v.kd.lockAction = component.ask({ title: `${v.kd.lockTitle}?`, lines: [{ t: c.name }, { t: "Genau ein Konto ist betroffen. Status, Profilversorgung und Rechnungen werden nicht geändert." }, ...(restore ? [{ t: setup }] : [])],
        confirmLabel: v.kd.lockLabel, danger: !restore, need: c.name, run: () => component.changeAccess(c.id, restore) });
    }
  }
  if (v.pKundeNeu) v.formSubmit = event => { event?.preventDefault(); component.say("Nicht gespeichert: Kundenentwurf und Einladung brauchen einen abgestimmten Backendvertrag."); };
  if (v.pAllgemein || v.pIntegrationen) {
    const ai = D.payloads.overview?.system?.ai;
    v.secEyebrow = "Betreiber";
    v.settingsRows = [{ k: "Zeitzone", v: "Europe/Berlin", sub: "Anzeigezeiten" }, { k: "Kostentag", v: "UTC", sub: "Vorhandener Backendvertrag" },
      { k: "Umgebung", v: "Nicht bestätigt", sub: "Kein Production-Nachweis durch diese Ansicht" }];
    v.integrations = [{ name: "KI Anbieter", v: ai?.enabled === true ? `Konfiguriert · ${ai.model || "Modell nicht bekannt"}` : ai?.enabled === false ? "KI ausgeschaltet" : "Nicht bestätigt", sub: "Verbindung und Ergebnisqualität nicht geprüft", dot: "var(--muted-2)" },
      { name: "Rechnungen und Zahlungen", v: "Keine Verbindung belegt", sub: "Manuell gepflegte Kontodaten sind keine Rechnungsverwaltung", dot: "var(--muted-2)" }];
  }
  v.protoGroups = []; v.protoOpen = false; v.toggleProto = () => component.refresh(); v.showLoading = () => component.refresh();
  v.resetLocal = () => component.refresh();
  // Übergang bis die fehlenden Funktionen einzeln in die Verwaltung übernommen sind.
  // Vorhandenes Navigationsmarkup gilt für Desktop und Mobil gleichermaßen.
  if (!blocked && !v.loading && phase !== "loading" && Array.isArray(v.navItems)) v.navItems.push({
    label: "Erweiterte Werkzeuge", href: "/?admin-tools=1", onClick: undefined,
    title: "Weitere Verwaltungs- und Diagnosefunktionen", current: undefined,
    color: "var(--rail-muted)", bg: "transparent", weight: 400,
    badge: "", badgeColor: "var(--rail-muted)", dot: "transparent"
  });
  return v;
}
