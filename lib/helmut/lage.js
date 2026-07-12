"use strict";

// Helmut — Lage-Briefing (das politische Morgen-Briefing des digitalen Referenten).
//
// Lage beantwortet AUSSCHLIESSLICH: "Worüber muss ich heute Bescheid wissen?"
// Pro Vorgang ist genau EINE kurze, auf diesen einen Vorgang bezogene Empfehlung
// erlaubt (Feld "empfehlung" unten, aus dem bestehenden KO-Feld handlungsempfehlung).
// KEINE uebergreifende Bewertung, KEINE Priorisierung/Rangfolge mehrerer Vorgaenge,
// KEINE Tagesentscheidung — das bleibt Aufgabe des Helmut-Tabs. Diese Trennung ist
// bewusst und darf nicht verwischen.
//
// Praesentations-Vertrag (displayTitle/displaySummary/whyRelevant/recommendation/
// displayCategory): additiv, 1:1 aus den vom Understanding-Call (C7/C8) EINMALIG
// erzeugten und dauerhaft gespeicherten KO-Feldern durchgereicht (kein neuer
// KI-Aufruf hier). displayTitle ist der kanonische Anzeige-Titel; das alte
// Feld "headline" ist nur noch Legacy-Fallback fuer Vorgaenge, die noch keinen
// display_title haben. Aeltere Vorgaenge ohne die neuen Felder liefern leere
// Strings — der Client faellt dafuer auf die bestehenden Felder zurueck, OHNE
// je einen Titel abzuschneiden (siehe renderVorgangCard in client.js).
//
// Datenquelle: ausschliesslich die bereits vorhandenen politischen Vorgaenge
// (V3 knowledge_objects) plus deren echte Quellen (ko_document_links -> raw_documents).
// Die KI erzeugt lediglich den Briefing-Text (generateLageBriefing).
//
// Ablauf:
//   1. Vorgaenge holen (verstanden, nicht pending), auf das Profil gematcht (personalisiert)
//   2. Echte Quellen je Vorgang laden (Provenienz)
//   3. Cache pruefen (bf-<user>-lage-<Berlin-Tag>, invalidiert per KO-Set-Hash)
//   4. Nur bei Bedarf neu erzeugen (Budget-Gate + Lock -> keine Doppel-Calls)
//   5. Absaetze -> echte Quellen aufloesen, Ergebnis cachen
// Fallback: kein KI-Briefing -> available:false + Vorgaenge werden trotzdem gezeigt.

const crypto = require("crypto");
const sourceSafety = require("./sourceSafety");

function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

const CACHE_SLOT = "lage";
const MAX_VORGAENGE = Number(process.env.HELMUT_LAGE_MAX_VORGAENGE) || 12;

// --- kleine, reine Formathelfer ---------------------------------------------
function berlinDayKey(now = new Date()) {
  try {
    // en-CA liefert YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch (_) {
    return now.toISOString().slice(0, 10);
  }
}

function hostFromUrl(url) {
  const raw = String(url || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

function isPdfLike(doc = {}) {
  const dt = String(doc.document_type || "").toLowerCase();
  const url = String(doc.url || doc.canonical_url || "").toLowerCase();
  const title = String(doc.title || "").toLowerCase();
  return dt.includes("pdf") || dt.includes("drucksache") || url.endsWith(".pdf") || /drucksache/.test(title);
}

function prettySourceType(doc = {}) {
  const map = {
    media: "Medien", ministry: "Ministerium", bundestag: "Bundestag", committee: "Ausschuss",
    association: "Verband", party: "Partei", official: "Offiziell", person: "Person", local: "Regional"
  };
  const t = String(doc.source_type || "").toLowerCase();
  if (isPdfLike(doc) && (String(doc.document_type || "").toLowerCase().includes("drucksache"))) return "Drucksache";
  return map[t] || (doc.document_type ? String(doc.document_type) : "Web");
}

function formatSourceDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  } catch (_) { return String(iso).slice(0, 10); }
}

function formatUpdatedLabel(iso, now = new Date()) {
  if (!iso) return "";
  try {
    const day = berlinDayKey(new Date(iso));
    const today = berlinDayKey(now);
    const yesterday = berlinDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const time = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    if (day === today) return `Heute, ${time}`;
    if (day === yesterday) return `Gestern, ${time}`;
    return formatSourceDate(iso);
  } catch (_) { return formatSourceDate(iso); }
}

function updatedDot(iso, now = new Date()) {
  try { return berlinDayKey(new Date(iso)) === berlinDayKey(now) ? "today" : "yesterday"; }
  catch (_) { return "yesterday"; }
}

function firstSentence(text, maxLen = 90) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.{0,160}?[.!?])(\s|$)/);
  const s = m ? m[1] : t;
  return s.length > maxLen ? s.slice(0, maxLen).trim() + " …" : s;
}

// --- Mapping raw_document -> Client-Quellenform ------------------------------
function mapSource(doc = {}) {
  const url = doc.url || doc.canonical_url || "";
  return {
    name: doc.source_name || hostFromUrl(url) || doc.title || "Quelle",
    type: prettySourceType(doc),
    host: hostFromUrl(url),
    url: url || "",
    dateLabel: formatSourceDate(doc.published_at),
    publishedAt: doc.published_at || "",
    documentType: isPdfLike(doc) ? "PDF" : "Web",
    title: doc.title || ""
  };
}

// Dedup nach kanonischer URL bzw. Name.
function dedupSources(sources = []) {
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    const key = (s.url || "").toLowerCase() || (s.name || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Chronologie aus den Quell-Publikationszeitpunkten (echte Ereignisse, keine Erfindung).
function buildChronology(docs = [], limit = 8) {
  const entries = (docs || [])
    .filter((d) => d && d.published_at)
    .map((d) => ({
      publishedAt: d.published_at,
      dateLabel: formatSourceDate(d.published_at),
      timeLabel: (() => { try { return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(d.published_at)); } catch (_) { return ""; } })(),
      text: d.title || (d.source_name ? `Veröffentlichung: ${d.source_name}` : "")
    }))
    .filter((e) => e.text);
  entries.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = `${e.dateLabel}|${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dateLabel: e.dateLabel, timeLabel: e.timeLabel, text: e.text });
    if (out.length >= limit) break;
  }
  return out;
}

// Nur echte, nicht-leere Strings aus einem KO-Array (schuetzt Betroffene-Chips
// vor null/""/Whitespace). Reine Normalisierung, kein neuer Inhalt.
function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// KO + echte Quellen -> Vorgang-Karte/-Detail fuer den Client (ohne Bewertung).
function koToVorgangCard(ko = {}, docs = [], now = new Date()) {
  const sources = dedupSources((docs || []).map(mapSource));
  const documents = sources.filter((s) => s.documentType === "PDF").map((s) => ({
    name: s.title || s.name, kind: "PDF", sizeLabel: "", url: s.url
  }));
  const policyField = (Array.isArray(ko.ausschuesse) && ko.ausschuesse[0])
    || (Array.isArray(ko.policy_field) && ko.policy_field[0])
    || (Array.isArray(ko.ministerien) && ko.ministerien[0]) || "";
  return {
    id: ko.vorgang_id,
    vorgangId: ko.vorgang_id,
    policyField,
    title: ko.headline || firstSentence(ko.was_ist_passiert, 80) || ko.vorgang_id,
    status: ko.status || "neu",
    standLabel: ko.stage || firstSentence(ko.was_ist_passiert, 70),
    nextStep: ko.stage && ko.deadline ? "" : "",
    updatedLabel: formatUpdatedLabel(ko.updated_at, now),
    updatedDot: updatedDot(ko.updated_at, now),
    // Vorgangsbezogene Empfehlung (kein globales Ranking/keine Tagesentscheidung):
    // bestehendes, bereits von der Understanding-Engine erzeugtes Feld, hier nur
    // durchgereicht (kein neuer KI-Aufruf).
    empfehlung: ko.handlungsempfehlung || "",
    summary: {
      wasIstPassiert: ko.was_ist_passiert || "",
      warumWichtig: ko.warum_wichtig || "",
      werIstBetroffen: ko.wer_ist_betroffen || ""
    },
    // UI-Zeigefelder (additiv, 1:1 aus dem KO durchgereicht, kein neuer KI-
    // Aufruf): leer bei aelteren Vorgaengen ohne diese Felder — der Client
    // faellt dann sauber auf title/summary/empfehlung/policyField zurueck.
    displayTitle: ko.display_title || "",
    displaySummary: ko.display_summary || "",
    whyRelevant: ko.why_relevant || "",
    recommendation: ko.recommendation || "",
    displayCategory: ko.display_category || "",
    // Betroffene (additiv, 1:1 aus dem BEREITS geladenen KO durchgereicht — kein
    // neuer KI-Aufruf, keine neue DB-Abfrage, kein neuer Endpoint): strukturierte
    // Felder plus im Quelltext erkannte Erwaehnungen. Leer bei Alt-Vorgaengen ohne
    // diese Felder -> der Client blendet die Betroffene-Sektion dann sauber aus.
    parteien: cleanStringList(ko.parteien),
    ausschuesse: cleanStringList(ko.ausschuesse),
    ministerien: cleanStringList(ko.ministerien),
    mentionedPeople: cleanStringList(ko.mentioned_people),
    mentionedParties: cleanStringList(ko.mentioned_parties),
    mentionedCommittees: cleanStringList(ko.mentioned_committees),
    mentionedMinistries: cleanStringList(ko.mentioned_ministries),
    // Erstell-Zeitpunkt fuer die Kopfzeile der Detailansicht (bestehendes Feld;
    // updated_at bleibt fuer die Karten-Aktualitaet zustaendig).
    createdAt: ko.created_at || "",
    chronologie: buildChronology(docs),
    sources,
    documents,
    sourceCount: sources.length
  };
}

// Absatz -> echte Quellen: Vereinigung der Quellen aller referenzierten Vorgaenge.
function resolveParagraphSources(paragraph = {}, sourcesByVorgang = {}, limit = 10) {
  const ids = Array.isArray(paragraph.vorgang_ids) ? paragraph.vorgang_ids : [];
  const collected = [];
  for (const id of ids) {
    for (const s of (sourcesByVorgang[id] || [])) collected.push(s);
  }
  return dedupSources(collected).slice(0, limit);
}

// Stabiler Hash ueber die relevante Vorgangs-Menge (Cache-Invalidierung).
function hashKoSet(kos = []) {
  const basis = (kos || [])
    .map((k) => `${k.vorgang_id}:${k.updated_at || ""}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

// --- Ergebnis-Formen --------------------------------------------------------
function unavailable(reason, vorgaenge = []) {
  return {
    available: false,
    demo: false,
    reason,
    generatedAt: new Date().toISOString(),
    paragraphs: [],
    vorgaenge
  };
}

function finalize(payload, cards, sourcesByVorgang, meta = {}) {
  const paragraphs = (payload.paragraphs || []).map((p) => ({
    text: p.text,
    vorgangIds: p.vorgang_ids || [],
    sources: resolveParagraphSources(p, sourcesByVorgang)
  }));
  return {
    available: true,
    demo: false,
    fromCache: Boolean(meta.fromCache),
    // pendingNarrative: Karten liegen vor, das KI-Narrativ wird asynchron nachgezogen
    // (App-Start-Kritikpfad, P1-7). Der Client zeigt die Karten sofort.
    pendingNarrative: Boolean(meta.pendingNarrative),
    generatedAt: payload.generatedAt || new Date().toISOString(),
    model: payload.model || null,
    wordCount: payload.wordCount || paragraphs.reduce((n, p) => n + String(p.text || "").trim().split(/\s+/).filter(Boolean).length, 0),
    paragraphs,
    vorgaenge: cards
  };
}

// --- Vorgaenge laden (personalisiert) + Quellen -----------------------------
async function loadRankedVorgaenge(storage, matchingFn, profile, userId) {
  // P1-6/P2-4: Scan-Fenster deckt den Bestand ab (Default 500), damit belegte
  // Vorgaenge jenseits Rang 200 nicht unsichtbar werden (radar.md §3).
  const scanLimit = Number(process.env.HELMUT_KO_SCAN_LIMIT || 500);
  const all = await storage.listKnowledgeObjects({ limit: scanLimit });
  const understood = (all || []).filter((k) =>
    k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig)
  );
  if (!understood.length) return [];

  const byId = new Map(understood.map((k) => [k.id, k]));
  let ranked = [];

  // 1) gespeicherte, personalisierte Matches
  try {
    const stored = await storage.listMatchingResults({ userId, limit: MAX_VORGAENGE });
    if (Array.isArray(stored) && stored.length) {
      ranked = stored.map((m) => byId.get(m.knowledge_object_id)).filter(Boolean);
    }
  } catch (_) { /* ignore */ }

  // 2) sonst deterministisches Offline-Matching
  if (!ranked.length && typeof matchingFn === "function") {
    try {
      const m = matchingFn(profile, understood, { limit: MAX_VORGAENGE });
      ranked = (m || []).map((x) => byId.get(x.knowledge_object_id)).filter(Boolean);
    } catch (_) { /* ignore */ }
  }

  // 3) Fallback: neueste verstandene Vorgaenge
  if (!ranked.length) ranked = understood.slice(0, MAX_VORGAENGE);

  return ranked.slice(0, MAX_VORGAENGE);
}

// Quellen aller Vorgaenge PARALLEL laden (nicht sequenziell): ein einzelner
// langsamer/haengender Call darf nicht alle nachfolgenden Vorgaenge blockieren und
// die Gesamtlaufzeit auf N x Timeout hochtreiben (bricht sonst /api/app/start ab).
async function loadSourcesForVorgaenge(storage, kos) {
  const entries = await Promise.all(kos.map(async (ko) => {
    let docs = [];
    try { docs = await storage.getSourcesForVorgang(ko.vorgang_id); } catch (_) { docs = []; }
    // Fallback-Quelle aus best_source_url, damit keine Aussage ohne Quellenbasis bleibt.
    if ((!docs || !docs.length) && ko.best_source_url) {
      docs = [{
        url: ko.best_source_url,
        source_name: hostFromUrl(ko.best_source_url) || "Quelle",
        link_type: ko.best_link_type || null,
        confidence: ko.source_trust || null,
        published_at: ko.updated_at || null,
        title: ko.headline || ""
      }];
    }
    return [ko.vorgang_id, docs || []];
  }));
  return Object.fromEntries(entries);
}

// ── Legacy-Fallback (TEMPORÄRE Kompatibilitätsschicht für Alt-Production-Daten) ──
// Die bestehenden Alt-Knowledge-Objects besitzen noch keine display_*-Felder
// (der Presentation-Backfill ist bewusst noch nicht gelaufen). Damit die Lage für
// den Piloten nicht leer bleibt, wählt diese Funktion aus den BEREITS vorhandenen
// Vorgängen aus — ohne KI-Call, ohne Backfill, ohne DB-Änderung, ohne erfundene
// Inhalte:
//   1) Existiert mindestens EIN moderner Vorgang (alle fünf Presentation-Felder),
//      werden AUSSCHLIESSLICH moderne Vorgänge gezeigt — Legacy wird NICHT
//      beigemischt.
//   2) Existiert KEIN moderner Vorgang, werden Legacy-Vorgänge gezeigt, aber nur
//      solche mit echter Quelle.
// In BEIDEN Stufen sind ausschließlich Vorgänge mit echter Quelle erlaubt.
// Sobald der Backfill oder neue Understanding-Läufe moderne Vorgänge erzeugen,
// greift automatisch wieder Stufe 1 — dieser Fallback verschwindet dann von selbst.
const LAGE_PRESENTATION_FIELDS = ["displayTitle", "displaySummary", "whyRelevant", "recommendation", "displayCategory"];
function lageHasRealSource(card) {
  return (Array.isArray(card && card.sources) && card.sources.length > 0) || Number(card && card.sourceCount) > 0;
}
// "Modern" = die karten-tragenden Anzeigefelder sind gefüllt. Der kuratierte
// Titel (display_title) wird bewusst NICHT verlangt: sanitizeDisplayTitle
// verwirft strenge KI-Titel und speichert dann "" — ein sonst vollständiger,
// belegter Vorgang würde dadurch fälschlich als Legacy gelten. Der Titel hat
// ohnehin einen deterministischen Fallback (lageDisplayHeadline im Frontend).
const LAGE_MODERN_CORE_FIELDS = ["displaySummary", "whyRelevant", "recommendation"];
function isModernVorgang(card) {
  return card != null && LAGE_MODERN_CORE_FIELDS.every((f) => String(card[f] == null ? "" : card[f]).trim() !== "");
}
// Auswahl der anzuzeigenden Lage-Karten. FRÜHER: Entweder-oder — sobald EIN
// moderner Vorgang existierte, wurden ALLE Legacy-Vorgänge (auch vollständig
// belegte, profil-relevante) ausgeblendet. Das ließ in Production nur die
// wenigen modernen der personalisierten Top-Menge übrig ("nur zwei Karten").
// JETZT: moderne Vorgänge zuerst, danach die übrigen belegten Vorgänge —
// gemischt, deterministisch, ohne erfundene Inhalte. Die relative Reihenfolge
// (Ranking) innerhalb jeder Gruppe bleibt erhalten.
function selectLageVorgaenge(vorgaenge = []) {
  const withSource = (Array.isArray(vorgaenge) ? vorgaenge : []).filter(lageHasRealSource);
  const modern = withSource.filter(isModernVorgang);
  const rest = withSource.filter((c) => !isModernVorgang(c));
  return [...modern, ...rest];
}

// --- Haupteinstieg ----------------------------------------------------------
async function buildLageBriefing(profile = {}, opts = {}) {
  // Design-Vorschau (Default AUS): explizites Demo-Briefing.
  if (isFlagOn(process.env.HELMUT_LAGE_DEMO)) return demoLageBriefing(profile);

  const storage = require("./storage");
  const ai = require("./ai");
  let matchingFn = null;
  try { matchingFn = require("./matching").matchProfileToKnowledgeObjects; } catch (_) { matchingFn = null; }

  const userId = profile.id || profile.userId || opts.politicianId;
  if (!userId) return unavailable("no-profile");
  if (!storage.v3StoreReady()) return unavailable("v3-disabled");

  // 1) Vorgaenge + echte Quellen
  const rankedAll = await loadRankedVorgaenge(storage, matchingFn, profile, userId);
  if (!rankedAll.length) return unavailable("no-vorgaenge");
  const sourcesRaw = await loadSourcesForVorgaenge(storage, rankedAll);
  // Source Safety Guard: kritische, unbestaetigte Claims aus unbekannten/schwachen
  // Quellen erscheinen NICHT in Aktuelle Lage (regelbasiert, 0 KI).
  const ranked = rankedAll.filter((ko) =>
    sourceSafety.guardKnowledgeObject(ko, sourcesRaw[ko.vorgang_id] || []).status !== "quarantine"
  );
  if (!ranked.length) return unavailable("no-vorgaenge");
  const allCards = ranked.map((ko) => koToVorgangCard(ko, sourcesRaw[ko.vorgang_id]));
  const sourcesByVorgang = {};
  // Quellen-Index über ALLE Karten (für die Absatz-Quellenauflösung) — unabhängig
  // von der Anzeige-Auswahl unten.
  allCards.forEach((c) => { sourcesByVorgang[c.vorgangId] = c.sources; });
  // Legacy-Fallback-Auswahl (temporär): moderne Vorgänge haben Vorrang; nur wenn
  // KEIN moderner existiert, Legacy-Vorgänge mit echter Quelle. Wird bei JEDEM
  // Aufruf frisch berechnet (die Karten entstehen pro Request neu, nur die
  // Narrativ-Absätze werden gecacht) — kein Stale-Cache-Effekt.
  const cards = selectLageVorgaenge(allCards);

  // Zaehl-/Anzeige-Modus (z. B. Admin-Datenstatus): NUR die deterministisch
  // gerankten Karten zurueckgeben, KEIN KI-Narrativ erzeugen. Verhindert teure/
  // langsame KI-Live-Calls (bis zu 1 pro Account) allein fuer eine Zaehlung —
  // sonst kann der Datenstatus-Endpoint in Zeitueberschreitung laufen.
  if (opts.countOnly) {
    return finalize({ paragraphs: [], generatedAt: null }, cards, sourcesByVorgang, { fromCache: false });
  }

  const koSetHash = hashKoSet(ranked);
  const day = berlinDayKey();
  const cacheId = `bf-${userId}-${CACHE_SLOT}-${day}`;

  // 2) Cache lesen (kein KI-Call, wenn Tag + KO-Set unveraendert)
  if (!opts.force) {
    try {
      const cached = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day);
      if (cached && cached.payload && Array.isArray(cached.payload.paragraphs)
          && cached.payload.koSetHash === koSetHash && cached.payload.paragraphs.length) {
        return finalize(cached.payload, cards, sourcesByVorgang, { fromCache: true });
      }
    } catch (_) { /* ignore -> neu erzeugen */ }
  }

  // P1-7: Im App-Start-Kritikpfad NUR die deterministischen Karten (+ ggf. bereits
  // gecachtes Narrativ oben) liefern und NIE einen Live-LLM-Call ausloesen. So
  // koennen die Lage-Karten nicht durch ein LLM-Timeout verschwinden (audit/lage.md,
  // audit/app-start-performance.md §1C). Die Narrativ-Erzeugung stoesst der Aufrufer
  // asynchron an (server.js /api/app/start, fire-and-forget) -> Cache warm fuer den
  // naechsten Aufruf.
  if (opts.cacheOnly) {
    return finalize({ paragraphs: [], generatedAt: null }, cards, sourcesByVorgang, { fromCache: false, pendingNarrative: true });
  }

  // 3) Nur EIN paralleler Generator (Lock). acquirePipelineLock: false = gesperrt.
  const lockName = `lage-briefing-${userId}`;
  let gotLock = true;
  try { gotLock = await storage.acquirePipelineLock(lockName, 90 * 1000); } catch (_) { gotLock = true; }
  if (gotLock === false) {
    try {
      const cached = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day);
      if (cached && cached.payload && Array.isArray(cached.payload.paragraphs) && cached.payload.paragraphs.length) {
        return finalize(cached.payload, cards, sourcesByVorgang, { fromCache: true });
      }
    } catch (_) { /* ignore */ }
    return unavailable("generating", cards);
  }

  try {
    // 4) Budget-Gate — bei Erschoepfung KEIN Fake-Briefing.
    // Mehrmandantenfaehigkeit Phase 10: das Lage-Narrativ ist ein PRO-MANDANT-Call
    // (anders als das mandantenlose Understanding). Deshalb greift hier ZUSAETZLICH
    // zum globalen Call-Count-Deckel der per-Profil-EUR-Deckel (Tag+Monat) aus dem
    // Profil. Ohne gesetztes Profil-Budget = identisches Verhalten wie zuvor (nur
    // globaler Deckel). Bei erschoepftem Mandanten-Budget -> Leerzustand, kein Fake.
    let budget = { allowed: true };
    const tenantBudgets = {
      dailyBudgetCent: profile && profile.aiBudgetDailyCents != null ? Number(profile.aiBudgetDailyCents) : null,
      monthlyBudgetCent: profile && profile.aiBudgetMonthlyCents != null ? Number(profile.aiBudgetMonthlyCents) : null
    };
    try { budget = await storage.canSpendLlmForTenant(userId, tenantBudgets); } catch (_) { budget = { allowed: true }; }
    if (!budget || !budget.allowed) return unavailable("budget", cards);

    const koLite = ranked.map((ko) => ({
      vorgang_id: ko.vorgang_id,
      headline: ko.headline || "",
      was_ist_passiert: ko.was_ist_passiert || "",
      warum_wichtig: ko.warum_wichtig || "",
      wer_ist_betroffen: ko.wer_ist_betroffen || "",
      sources: (sourcesByVorgang[ko.vorgang_id] || []).map((s) => s.name).filter(Boolean).slice(0, 6)
    }));

    const gen = await ai.generateLageBriefing(koLite, profile, { politicianId: userId });
    if (!gen || !Array.isArray(gen.paragraphs) || !gen.paragraphs.length) {
      return unavailable("ai-unavailable", cards);
    }

    const payload = {
      paragraphs: gen.paragraphs,
      koSetHash,
      model: gen.model || null,
      wordCount: gen.wordCount || 0,
      generatedAt: new Date().toISOString()
    };
    // 5) Cachen (idempotent, id = bf-<user>-lage-<Berlin-Tag>)
    try {
      await storage.saveRenderedBriefingV3({ id: cacheId, user_id: userId, slot: CACHE_SLOT, generated_at: payload.generatedAt, payload });
    } catch (_) { /* Cache-Fehler: Ergebnis trotzdem ausliefern */ }

    return finalize(payload, cards, sourcesByVorgang, { fromCache: false });
  } finally {
    try { await storage.releasePipelineLock(lockName); } catch (_) { /* ignore */ }
  }
}

// --- Demo (nur bei HELMUT_LAGE_DEMO=1, fuer Design-Vorschau) -----------------
function demoLageBriefing(profile = {}) {
  const S = (name, type, host, dateLabel, documentType) => ({ name, type, host, url: host ? `https://${host}` : "", dateLabel: dateLabel || "", documentType: documentType || "Web" });
  const paragraphs = [
    { text: "Die Bundesregierung treibt das Bundestariftreuegesetz weiter voran. Gleichzeitig hat die Bundestagsfraktion Die Linke einen eigenen Antrag zur Stärkung der Tarifbindung eingebracht. Im Ausschuss für Arbeit und Soziales wird das Thema voraussichtlich in den kommenden Tagen weiter an Bedeutung gewinnen.", vorgangIds: ["vg-bundestariftreuegesetz"], sources: [S("DGB", "Verband", "dgb.de", "Heute"), S("Deutscher Bundestag", "Drucksache", "dip.bundestag.de", "Heute", "PDF"), S("BMAS", "Ministerium", "bmas.de", "Heute"), S("Die Linke", "Partei", "die-linke.de", "Heute"), S("Reuters", "Medien", "reuters.com", "Heute"), S("Tagesschau", "Medien", "tagesschau.de", "Heute")] },
    { text: "Parallel hat das Bundesministerium für Gesundheit erste Eckpunkte zur Pflegereform vorgestellt. Mehrere Verbände haben bereits Kritik angekündigt. Eine parlamentarische Behandlung wird nach der Sommerpause erwartet.", vorgangIds: ["vg-pflegereform"], sources: [S("Deutscher Bundestag", "Bundestag", "bundestag.de", "Heute"), S("BMG", "Ministerium", "bundesgesundheitsministerium.de", "Heute"), S("Sozialverband VdK", "Verband", "vdk.de", "Heute"), S("dpa", "Medien", "dpa.com", "Heute")] }
  ];
  const vorgaenge = [
    { id: "vg-bundestariftreuegesetz", vorgangId: "vg-bundestariftreuegesetz", policyField: "Arbeit und Soziales", title: "Bundestariftreuegesetz", status: "update", standLabel: "Referentenentwurf liegt vor", nextStep: "Kabinettsbeschluss", updatedLabel: "Heute, 08:45", updatedDot: "today", empfehlung: "Linie vorbereiten. Heute noch keine öffentliche Reaktion nötig.", summary: { wasIstPassiert: "Das BMAS hat den Referentenentwurf vorgelegt.", warumWichtig: "Betrifft die Tarifbindung bei öffentlichen Aufträgen.", werIstBetroffen: "Öffentliche Auftraggeber, tarifgebundene Unternehmen." }, displayTitle: "Tarifbindung: Entwurf vorgelegt", displaySummary: "Das BMAS hat den Referentenentwurf zum Bundestariftreuegesetz vorgelegt. Der Entwurf bindet öffentliche Aufträge künftig an geltende Tarifverträge. Die Ressortabstimmung läuft, ein Kabinettsbeschluss ist der nächste Schritt.", whyRelevant: "Betrifft den Ausschuss für Arbeit und Soziales direkt. Öffentliche Auftraggeber und tarifgebundene Unternehmen müssen ihre Vergabepraxis anpassen.", recommendation: "Linie vorbereiten, heute keine öffentliche Reaktion.", displayCategory: "BMAS", parteien: ["Die Linke", "SPD"], ausschuesse: ["Ausschuss für Arbeit und Soziales"], ministerien: ["BMAS"], mentionedPeople: ["Hubertus Heil"], mentionedParties: [], mentionedCommittees: [], mentionedMinistries: [], createdAt: "2025-06-12T08:30:00Z", chronologie: [{ dateLabel: "12. Juni 2025", timeLabel: "08:30", text: "BMAS veröffentlicht Referentenentwurf." }, { dateLabel: "10. Juni 2025", timeLabel: "16:10", text: "Die Linke bringt eigenen Antrag zur Tarifbindung ein." }], sources: paragraphs[0].sources, documents: [{ name: "Referentenentwurf (BMAS)", kind: "PDF", sizeLabel: "1,2 MB", url: "https://bmas.de" }], sourceCount: 6 },
    { id: "vg-pflegereform", vorgangId: "vg-pflegereform", policyField: "Gesundheit", title: "Pflegereform", status: "neu", standLabel: "Eckpunkte veröffentlicht", nextStep: "Verbändeanhörung", updatedLabel: "Heute, 07:30", updatedDot: "today", empfehlung: "Für Ausschussarbeit prüfen. Rückfragen vorbereiten.", summary: { wasIstPassiert: "Das BMG hat Eckpunkte vorgestellt.", warumWichtig: "Reform der Pflegeversicherung.", werIstBetroffen: "Pflegebedürftige, Pflegekassen." }, displayTitle: "BMG stellt Pflegereform vor", displaySummary: "Das BMG hat erste Eckpunkte zur Pflegereform vorgestellt. Vorgesehen sind höhere Leistungsbeträge und eine stabilere Finanzierung der Pflegeversicherung. Mehrere Verbände haben bereits Kritik angekündigt.", whyRelevant: "Ist relevant für die Ausschussarbeit im Gesundheitsausschuss. Pflegebedürftige und Pflegekassen sind unmittelbar betroffen.", recommendation: "Für Ausschusssitzung vorbereiten, Rückfragen bündeln.", displayCategory: "BMG", parteien: [], ausschuesse: ["Gesundheitsausschuss"], ministerien: ["BMG"], mentionedPeople: ["Karl Lauterbach"], mentionedParties: [], mentionedCommittees: [], mentionedMinistries: [], createdAt: "2025-06-12T07:30:00Z", chronologie: [{ dateLabel: "12. Juni 2025", timeLabel: "07:30", text: "BMG stellt Eckpunkte vor." }], sources: paragraphs[1].sources, documents: [], sourceCount: 4 }
  ];
  return { available: true, demo: true, fromCache: false, generatedAt: new Date().toISOString(), paragraphs, vorgaenge: selectLageVorgaenge(vorgaenge) };
}

module.exports = {
  buildLageBriefing,
  demoLageBriefing,
  // reine Helfer (Tests):
  koToVorgangCard,
  selectLageVorgaenge,
  isModernVorgang,
  resolveParagraphSources,
  buildChronology,
  mapSource,
  hashKoSet,
  berlinDayKey,
  finalize,
  unavailable
};
