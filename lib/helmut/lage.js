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
const scoring = require("./scoring"); // Sprint 5: globale Wichtigkeit + Leerzustand (flag-gesichert)
// Persönliche Aufnahme und Erklärung aus dem jeweils aktuellen Profil, ohne KI.
const profilbezug = require("./lage-profilbezug");
// EINE Quelle fuer den Tageswechsel in Europe/Berlin (Frischevertrag).
const frischevertrag = require("./briefing-frische");
const quellenbeleg = require("./lage-quellenbeleg");
const { themenrein } = require("./briefing-quellenqualitaet");

function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

const CACHE_SLOT = "lage";
const MAX_VORGAENGE = Number(process.env.HELMUT_LAGE_MAX_VORGAENGE) || 12;

// --- kleine, reine Formathelfer ---------------------------------------------
// Frischevertrag Punkt 6/7: der Berliner Tageswechsel hat EINE Quelle
// (briefing-frische.berlinTagKey). Der Tagesschluessel steuert hier auch den
// Narrativ-Cache (bf-<mandat>-lage-<tag>) — liefe er auf einen anderen Tagesbegriff
// als der Briefingkopf, koennte ein Narrativ des Vortags als heutiges erscheinen.
function berlinDayKey(now = new Date()) {
  const key = frischevertrag.berlinTagKey(now);
  if (key) return key;
  // Kein Berliner Tag bestimmbar (defekte Zeitzonendaten): ehrlicher, aber
  // definierter Rueckfall — lieber ein eigener Cache-Eimer als ein falscher Tag.
  try { return new Date(now).toISOString().slice(0, 10); } catch (_) { return "unbekannt"; }
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
  return s.length > maxLen ? "" : s;
}

// --- Mapping raw_document -> Client-Quellenform ------------------------------
function mapSource(doc = {}) {
  const url = doc.url || doc.canonical_url || "";
  // Jeder validierte Artikelstand (Bundestag, Berlin ODER Brandenburg) belegt nur
  // einen Publikationstag. Die sichtbare Quellenzeile zeigt genau diesen Tag, ohne
  // ihn als erfundene Uhrzeit in publishedAt auszugeben. Der gemeinsame Dispatcher
  // prueft den Stand und weist mehrdeutige oder widerspruechliche Staende laut ab.
  const stand = require("./artikelstand").leseStand(doc)?.stand || null;
  return {
    name: doc.source_name || hostFromUrl(url) || doc.title || "Quelle",
    ...require("./parlamentsdaten-herkunft").quellenhinweisFelder(doc, url),
    type: prettySourceType(doc),
    host: hostFromUrl(url),
    url: url || "",
    dateLabel: formatSourceDate(stand?.publikationstag || doc.published_at),
    publishedAt: stand ? "" : (doc.published_at || ""),
    documentType: isPdfLike(doc) ? "PDF" : "Web",
    title: doc.title || ""
  };
}

function mapAbsatzQuellen(koLite = [], sourcesRaw = {}) {
  return Object.fromEntries(koLite.map(v => [v.vorgang_id,
    v.quellenbelege.map(q => {
      const original = (sourcesRaw[v.vorgang_id] || []).find(d => {
        const ziel = quellenbeleg.artikelUrl(d.canonical_url) || quellenbeleg.artikelUrl(d.url);
        const standHash = require("./artikelstand").leseStand(d)?.stand.standHash;
        return ziel && quellenbeleg.quelleIdFuer(v.vorgang_id, ziel, standHash) === q.quelle_id;
      });
      if (!original) throw new Error("lage-quellenabbildung-fehlt");
      const stand = require("./artikelstand").leseStand(original)?.stand || null;
      return { ...mapSource({ ...original, url: q.url, source_name: q.quelle,
        title: q.titel, published_at: stand ? null : q.veroeffentlichtAm }), quelleId: q.quelle_id };
    })]));
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
  const card = {
    id: ko.vorgang_id,
    vorgangId: ko.vorgang_id,
    policyField,
    title: ko.headline || firstSentence(ko.was_ist_passiert, Infinity) || ko.vorgang_id,
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
    // Sprint 23C — persoenliche Relevanz ("Warum ist das FUER MICH relevant?").
    // Bereits serverseitig gepruefte, auf eine Weissliste begrenzte Struktur
    // { satz, belege:[{art,text}] } oder null. Enthaelt strukturell keine
    // Kennungen, Hashes, Versionen, Raenge oder Scores. Null bei jedem Vorgang
    // ohne belegte Gruende und in jedem Pfad ohne gespeichertes Matching
    // (Offline-Matching, Recency-Fallback, Scoring-Modus) -> der Client blendet
    // den Abschnitt dann vollstaendig aus, statt eine Relevanz zu behaupten.
    relevanz: ko.relevanz_erklaerung || null,
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
  return require("./lage-kartenbeleg").begrenze(card, docs);
}

// Absatz -> echte Quellen: Vereinigung der Quellen aller referenzierten Vorgaenge.
function resolveParagraphSources(paragraph = {}, sourcesByVorgang = {}, limit = 10) {
  const ids = Array.isArray(paragraph.vorgang_ids) ? paragraph.vorgang_ids : [];
  const collected = [];
  for (const id of ids) {
    for (const s of (sourcesByVorgang[id] || [])) {
      if (paragraph.quellen_ids && !paragraph.quellen_ids.includes(s.quelleId)) continue;
      collected.push(s);
    }
  }
  return dedupSources(collected).slice(0, limit);
}

// Stabiler Hash ueber die relevante Vorgangs-Menge (Cache-Invalidierung).
function hashKoSet(kos = []) {
  const basis = (kos || [])
    .map((k) => `${k.vorgang_id}:${k.ko_version ?? ""}:${k.updated_at || ""}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

// One pure context preparation shared by the actual sender and its no-model
// preflight. The existing source-mix/safety guards also apply to snapshots.
function rankDContext(rankedAll, sourcesRaw) {
  return rankedAll.filter(ko => themenrein(sourcesRaw[ko.vorgang_id] || [])
    && sourceSafety.guardKnowledgeObject(ko, sourcesRaw[ko.vorgang_id] || []).status !== "quarantine");
}
function projectDContext(ranked, sourcesRaw, now, gebunden = null, captureLabel = null) {
  if (gebunden?.historicalSnapshot)
    require("./blocker2-d-historical-binding").assertProjection(gebunden.historicalSnapshot, ranked, sourcesRaw);
  let koLite = quellenbeleg.baueEingabe(ranked, sourcesRaw, now);
  if (!koLite.length && gebunden?.historicalSnapshot)
    koLite = quellenbeleg.baueEingabe(ranked, sourcesRaw, now, process.env, gebunden.historicalSnapshot);
  for (const v of koLite) {
    const item = gebunden?.teilmitgliedProjektionen?.find(i => i.vorgangId === v.vorgang_id);
    if (item && !v.teilmitgliedDarstellung) v.teilmitgliedDarstellung = { title: item.title, summary: item.summary,
      ...require("./briefing-ereignisteilmitglieder").oeffentlicheRollen(item) };
  }
  if (captureLabel) koLite = quellenbeleg.kennzeichneAufnahme(koLite, captureLabel);
  return { ranked, koLite };
}
function prepareDContext(rankedAll, sourcesRaw, now, gebunden = null) {
  return projectDContext(rankDContext(rankedAll, sourcesRaw), sourcesRaw, now, gebunden);
}

// --- Ergebnis-Formen --------------------------------------------------------
function unavailable(reason, vorgaenge = [], emptyState = null) {
  const out = {
    available: false,
    demo: false,
    reason,
    generatedAt: new Date().toISOString(),
    paragraphs: [],
    vorgaenge
  };
  // Sprint 5 (additiv, nur wenn Scoring aktiv): unterscheidbarer Leerzustand mit
  // Frische-/Qualitaetssignal (gap | stale | quiet) — Datenluecke nie mit ruhig verwechseln.
  if (emptyState) out.emptyState = emptyState;
  return out;
}

// Technischer Versorgungsstand ist keine neue Artikel- oder Faktenfreigabe.
// Nur bekannte Enums verlassen diesen Leser; kaputte Signale werden unbekannt.
function normalisiereVersorgung(value) {
  if (value == null) return null;
  const erlaubte = ["offen", "unbekannt", "kein-bekannter-rueckstand"];
  return { version: 1, zustand: value.version === 1 && erlaubte.includes(value.zustand)
    ? value.zustand : "unbekannt" };
}
function finalize(payload, cards, sourcesByVorgang, meta = {}) {
  const versorgung = normalisiereVersorgung(meta.versorgung) || normalisiereVersorgung(payload.versorgung);
  const paragraphs = (payload.paragraphs || []).map((p) => ({
    text: p.text,
    vorgangIds: p.vorgang_ids || [],
    sources: resolveParagraphSources(p, sourcesByVorgang)
  }));
  return {
    available: true,
    demo: false,
    ...(versorgung ? { versorgung } : {}),
    fromCache: Boolean(meta.fromCache),
    ...(payload.koSetHash && payload.quellenHash ? {
      quellenBindung: { koSetHash: payload.koSetHash, quellenHash: payload.quellenHash }
    } : {}),
    ...(meta.tagespaketGrundlage ? { tagespaketGrundlage: meta.tagespaketGrundlage } : {}),
    // pendingNarrative: Karten liegen vor, das KI-Narrativ wird asynchron nachgezogen
    // (App-Start-Kritikpfad, P1-7). Der Client zeigt die Karten sofort.
    pendingNarrative: Boolean(meta.pendingNarrative),
    generatedAt: payload.generatedAt || new Date().toISOString(),
    model: payload.model || null,
    // Der private Teilstandbeleg wird nie in die App kopiert.
    qualitaet: payload.provenienz ? { version: require("./lage-textqualitaet").VERSION,
      teilstand: true, freigegeben: 1, zurueckgehalten: 1, vollstaendigeFaktenpruefung: false } : payload.qualitaet || null,
    ...(payload.provenienz ? { teilstand: require("./lage-teilstand").publicInfo(payload) } : {}),
    wordCount: payload.wordCount || paragraphs.reduce((n, p) => n + String(p.text || "").trim().split(/\s+/).filter(Boolean).length, 0),
    paragraphs,
    vorgaenge: cards
  };
}

// --- Vorgaenge laden (personalisiert) + Quellen -----------------------------
// Dieselbe Ordnung, aber als eigenstaendige Funktion — der Scoring-Zweig oben liegt
// vor der lokalen Definition und braucht sie trotzdem.
// Das Ordnungsmodul wird TOLERANT geladen. Der Fail-safe unten faengt bereits einen Fehler
// BEIM ORDNEN ab; ein Fehler BEIM LADEN haette die Lage trotzdem geleert. Nachgetragen im
// Abschlussreview 2026-08-08 — dort wurde nachgewiesen, dass `lage.js` das Modul auch bei
// ausgeschaltetem Flag hart voraussetzt, obwohl es dann nichts tut. Jetzt gilt: ist die
// Ordnung nicht ladbar, verhaelt sich die Lage exakt wie vor diesem Sprint.
function relevanzModul() {
  try { return require("./relevanzordnung"); } catch (_) { return null; }
}

function ordneFrueh(liste, profile, limit = MAX_VORGAENGE) {
  const relevanz = relevanzModul();
  if (!relevanz) return liste;
  if (!relevanz.relevanzordnungAktiv()) return liste;
  try {
    return relevanz.ordne(liste, profile, { limit }).reihenfolge.map((x) => x.ko);
  } catch (error) {
    try { console.error("[lage] Relevanzordnung fehlgeschlagen (bisherige Reihenfolge):", error && error.message); } catch (_) { /* ignore */ }
    return liste;
  }
}

async function loadRankedVorgaenge(storage, matchingFn, profile, userId, { quellenzeit = null, quellenNachweise = null } = {}) {
  // P1-6/P2-4: Scan-Fenster deckt den Bestand ab (Default 500), damit belegte
  // Vorgaenge jenseits Rang 200 nicht unsichtbar werden (radar.md §3).
  const scanLimit = Number(process.env.HELMUT_KO_SCAN_LIMIT || 500);
  // STOERUNGSWAHRHEIT (Audit-Fix 2026-07): Ein harter DB-/Netzfehler lieferte
  // frueher still [] -> die Lage zeigte den normalen Leerzustand und ein
  // Datenausfall war von einem ruhigen Tag nicht unterscheidbar. Jetzt wird das
  // __storeError-Sentinel genutzt und als eigener Grund nach oben gereicht.
  const eligibility = require("./publication-eligibility"), publicationPolicy = eligibility.current();
  const all = await eligibility.listCandidates(storage, { limit: scanLimit, _signalError: true }, publicationPolicy);
  if (all && all.__storeError) {
    const err = new Error("lage-ko-load-failed");
    err.storeError = true;
    throw err;
  }
  const istVerstanden = (k) => Boolean(k && k.status !== "pending"
    && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig));
  let understood = (all || []).filter(istVerstanden);
  // Die Zwoelfergrenze darf nicht zuerst von frisch analysierten Altquellen
  // belegt werden. Nur echte Quelldaten bestimmen die heutige Texteignung.
  // Ohne heutige Belege bleibt die historische Kartenauswahl erhalten; der
  // nachfolgende Quellenvertrag verhindert weiterhin jeden neuen Modellaufruf.
  const aktuell = async (pool) => {
    if (!quellenzeit || !pool.length) return pool;
    try {
      const rows = await storage.listAktuelleLageQuellen(pool.map(k => k.id), quellenzeit);
      const ids = new Set(pool.map(k => k.id)), docs = new Map();
      if (!Array.isArray(rows)) throw new Error("ungueltige-quellenantwort");
      for (const r of rows) {
        if (!ids.has(r?.knowledge_object_id) || !r.raw_documents || Array.isArray(r.raw_documents))
          throw new Error("ungueltige-quellenantwort");
        const list = docs.get(r.knowledge_object_id) || [];
        list.push(r.raw_documents); docs.set(r.knowledge_object_id, list);
      }
      if (quellenNachweise) for (const [id, list] of docs) quellenNachweise.set(id, list);
      const current = pool.filter(k => quellenbeleg.baueEingabe([k],
        { [k.vorgang_id]: docs.get(k.id) || [] }, quellenzeit).length > 0);
      return current.length ? current : pool;
    } catch (cause) {
      const error = new Error("lage-quellen-load-failed", { cause });
      error.storeError = true;
      throw error;
    }
  };

  let ranked = [];

  // 1) gespeicherte, personalisierte Matches
  try {
    const rows = await storage.listMatchingResults({ userId, limit: scanLimit });
    const stored = Array.isArray(rows) ? rows.filter(m => !m.user_id || m.user_id === userId) : [];
    if (Array.isArray(stored) && stored.length) {
      // Die Aenderungszeit begrenzt die allgemeine Suche, nicht die bereits
      // fuer dieses Mandat gespeicherten Treffer. Deren Quellen koennen
      // aktuell sein, obwohl das Wissensobjekt ausserhalb des Fensters liegt.
      // Den vorhandenen gezielten Leser innerhalb des begrenzten Scans nutzen.
      const geladen = new Set((all || []).map(k => k && k.id));
      const fehlend = [...new Set(stored.map(m => m.knowledge_object_id)
        .filter(id => typeof id === "string" && id && !geladen.has(id)))];
      if (fehlend.length) {
        let weitere;
        try {
          weitere = await storage.listKnowledgeObjectsByIds(fehlend);
          weitere = await eligibility.filterCandidates(storage, weitere, publicationPolicy);
          if (!Array.isArray(weitere) || weitere.some(k => !k || !fehlend.includes(k.id))
            || new Set(weitere.map(k => k.id)).size !== weitere.length) throw new Error("ungueltige-trefferantwort");
        } catch (cause) {
          if (cause.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw cause;
          const error = new Error("lage-treffer-load-failed", { cause });
          error.storeError = true;
          throw error;
        }
        for (const k of weitere.filter(istVerstanden)) {
          understood.push(k);
        }
      }
      // Gespeicherte Treffer dienen nur zum gezielten Nachladen. Ihre alten
      // Ränge, Profilhashes und KO-Versionen sind keine heutige Fachentscheidung.
      // Jede Aufnahme und Erklärung wird unten am aktuellen Profil neu berechnet.

    }
  } catch (error) {
    if (error && (error.storeError || error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE")) throw error;
    // Der bestehende Rueckfall bei fehlendem Matching bleibt erhalten.
  }

  // Inhaltliche Aufnahme vor Frischeauswahl, Matching und JEDER Ergebnisgrenze.
  // Keine allgemeine Ersatzmenge und kein Auffüllen schwacher Vektortreffer.
  understood = await aktuell(profilbezug.auswahl(understood, profile));
  if (scoring.scoringActive()) {
    ranked = scoring.rankForLage(understood, { limit: understood.length }).map(x => x.ko);
  } else if (typeof matchingFn === "function") {
    try {
      const matches = matchingFn(profile, understood, { limit: understood.length });
      const aktuellById = new Map(understood.map(k => [k.id, k]));
      ranked = matches.map(m => aktuellById.get(m.knowledge_object_id)).filter(Boolean);
    } catch (_) { /* Fachlich zugelassene Kandidaten bleiben verfügbar. */ }
  }
  // Der technische Hashvektor kann auch fachlich passende indirekte Treffer
  // auslassen. Er darf nur ordnen, keine bestandene Aufnahme zurücknehmen.
  const gesehen = new Set(ranked.map(k => k.id));
  ranked.push(...understood.filter(k => !gesehen.has(k.id)));
  // Gewichtung stammt aus den heutigen Profilrollen; globale Wichtigkeit und
  // Vektorähnlichkeit entscheiden nur innerhalb derselben fachlichen Priorität.
  return profilbezug.auswahl(ordneFrueh(ranked, profile, ranked.length), profile).slice(0, MAX_VORGAENGE);
}

// Quellen aller Vorgaenge PARALLEL laden (nicht sequenziell): ein einzelner
// langsamer/haengender Call darf nicht alle nachfolgenden Vorgaenge blockieren und
// die Gesamtlaufzeit auf N x Timeout hochtreiben (bricht sonst /api/app/start ab).
async function loadSourcesForVorgaenge(storage, kos, { quellenNachweise = null, quellenzeit = null } = {}) {
  const entries = await Promise.all(kos.map(async (ko) => {
    let docs = [];
    try { docs = await storage.getSourcesForVorgang(ko.vorgang_id); } catch (_) { docs = []; }
    const metadata = quellenNachweise?.get(ko.id) || [];
    if (metadata.length && quellenzeit) {
      // Dieselben hoechstens sechs Belege wie im Quellenvertrag nachladen.
      // Kein neuer Quellenvertrag und keine unbeschraenkte Volltextmenge.
      const eingabe = list => quellenbeleg.baueEingabe([ko], { [ko.vorgang_id]: list }, quellenzeit)[0]?.quellenbelege || [];
      const belege = eingabe(metadata);
      if (belege.length) {
        const original = new Map();
        for (const d of metadata) {
          const q = eingabe([d])[0];
          if (q && !original.has(JSON.stringify(q))) original.set(JSON.stringify(q), d);
        }
        const erwartet = belege.map(q => original.get(JSON.stringify(q)));
        // Fehler des gebundenen Lesers niemals als normale Quellenleere behandeln.
        const aktuell = await storage.getSourcesForVorgang(ko.vorgang_id, { lageQuellen: erwartet, lageKoId: ko.id });
        const kennung = d => d.id || d.canonical_url || d.url;
        const gebunden = new Set(aktuell.map(kennung));
        // Der Quellenvertrag dedupliziert vor dem Sortieren. Deshalb muessen
        // die gewaehlten Belege auch vor historischen URL-/Titelduplikaten stehen.
        docs = [...aktuell, ...(docs || []).filter(d => !gebunden.has(kennung(d)))];
      }
    }
    // Fallback-Quelle aus best_source_url, damit keine Aussage ohne Quellenbasis bleibt.
    if ((!docs || !docs.length) && ko.best_source_url) {
      docs = [{
        url: ko.best_source_url,
        source_name: hostFromUrl(ko.best_source_url) || "Quelle",
        link_type: ko.best_link_type || null,
        confidence: ko.source_trust || null,
        // EHRLICHKEIT (Review-Fix): ko.updated_at ist der ANALYSE-Zeitpunkt, nicht
        // der Publikationszeitpunkt der Quelle. Er speiste die Frische-Kopfzeile
        // ("Neueste Quelle heute, HH:MM") und liess alte Quellen frisch aussehen.
        // Ohne echten Zeitstempel: keiner — die Kopfzeile laesst den Anspruch dann
        // ehrlich weg (lageFreshnessLabel liefert "").
        published_at: null,
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
// QUELLENPFLICHT (P0-Schliessungssprint 2026-08-22): eine Karte gilt nur als belegt,
// wenn mindestens EINE ihrer Quellen eine echte OEFFNENDE https-URL traegt —
// radarState.oeffnendeArtikelUrl: https, keine blosse Herausgeber-Startseite
// (Domain-Root), kein Google-Proxy. Ein blosser Zaehlerwert (sourceCount) ohne
// sichtbare oeffnende Quelle genuegt nicht mehr (kein falsches Gruen).
function lageHasRealSource(card) {
  const radarState = require("./radarState");
  const sources = Array.isArray(card && card.sources) ? card.sources : [];
  return sources.some((s) => s && Boolean(radarState.oeffnendeArtikelUrl(s.url)));
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
  const versorgung = normalisiereVersorgung(opts.versorgung);
  let tagespaketGrundlage = [];
  const fertig = (payload, cards, sources, meta) => finalize(payload, cards, sources,
    { ...meta, versorgung, tagespaketGrundlage });
  const nichtVerfuegbar = (...args) => {
    const out = { ...unavailable(...args), tagespaketGrundlage };
    return versorgung ? { ...out, versorgung } : out;
  };
  const eligibility = require("./publication-eligibility"), publicationPolicy = eligibility.current();
  if (opts.prosaVorschau) return require("./prosa-vorschau").lese(opts.prosaVorschau, {
    profile, userId: opts.politicianId || profile.id, bereich: "lage",
    tag: require("./briefing-frische").berlinTagKey(opts.now ? new Date(opts.now) : new Date())
  });
  // Design-Vorschau (Default AUS): explizites Demo-Briefing.
  if (isFlagOn(process.env.HELMUT_LAGE_DEMO)) return demoLageBriefing(profile);

  const storage = require("./storage");
  const ai = require("./ai");
  let matchingFn = null;
  try { matchingFn = require("./matching").matchProfileToKnowledgeObjects; } catch (_) { matchingFn = null; }

  const userId = profile.id || profile.userId || opts.politicianId;
  if (!userId) return nichtVerfuegbar("no-profile");
  if (!storage.v3StoreReady()) return nichtVerfuegbar("v3-disabled");

  const finite = opts.synthetik500Input ? require("./synthetik-500-lage-input").read(opts.synthetik500Input, profile) : null;
  const bindingTime = finite ? new Date(finite.briefingDatum) : new Date();
  const gebunden = opts.briefingEingabe
    ? require("./briefing-lagebindung").pruefe(opts.briefingEingabe, profile, userId, bindingTime,
      { acceptedSnapshot: Boolean(finite) }) : null;
  if (gebunden) eligibility.assertRecorded(opts.briefingEingabe.eingabe.publicationEligibilityPolicy, publicationPolicy);
  if (finite && require("./synthetik-500-profile").hash(finite.briefingEingabe) !== require("./synthetik-500-profile").hash(opts.briefingEingabe))
    throw new Error("synthetik500-lage-input-binding-drift");
  if (gebunden && (!opts.missingOnly || typeof opts.beforeSave !== "function"))
    throw new Error("briefing-lagebindung-abweichend");

  // Nur der ausdrueckliche manuelle Nachlauf verwendet diesen Modus.
  // Ohne expliziten Reparaturmodus bleibt jeder vorhandene Tagessatz erhalten.
  // Der 500er Reparaturmodus ergaenzt nur unbelegte Alttexte mit voller Historie.
  // Lesefehler sind keine Erlaubnis zur Neuerzeugung.
  if (opts.repairIncomplete && !opts.missingOnly) throw new Error("nachlauf-optionen-widerspruechlich");
  if (opts.pruefaufwandNachweis && (!opts.missingOnly || typeof opts.beforeGenerate !== "function"
    || !/^nachlauf500-[0-9]{5,20}$/.test(opts.costRunId || "")))
    throw new Error("nachlauf-optionen-widerspruechlich");
  if (opts.missingOnly) {
    if (opts.force || opts.cacheOnly || opts.countOnly) throw new Error("nachlauf-optionen-widerspruechlich");
    const before = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, berlinDayKey(), { strict: true });
    if (before && (!opts.repairIncomplete || quellenbeleg.gespeicherterTextGueltig(before.payload))) {
      return nichtVerfuegbar("existing-result");
    }
  }

  // 1) Vorgaenge + echte Quellen
  const jetzt = finite ? bindingTime : new Date();
  const quellenNachweise = new Map();
  let rankedAll;
  try {
    rankedAll = gebunden ? await eligibility.filterCandidates(storage, gebunden.ranked, publicationPolicy)
      : await loadRankedVorgaenge(storage, matchingFn, profile, userId,
      { quellenzeit: opts.countOnly ? null : jetzt, quellenNachweise });
  } catch (error) {
    if (error && error.storeError) {
      // Harter DB-/Netzfehler: eigener Grund, damit der Client eine Stoerung
      // zeigt statt "keine Vorgaenge" (= faelschlich ruhiger Tag).
      return nichtVerfuegbar("store-error");
    }
    throw error;
  }
  if (!rankedAll.length) {
    // Keine verstandenen Vorgaenge -> echter Datenausfall (gap), kein ruhiger Tag.
    return nichtVerfuegbar("no-vorgaenge", [], scoring.scoringActive()
      ? scoring.tabEmptyState("lage", { kos: [], hasRankedItems: false }) : null);
  }
  let sourcesRaw;
  try {
    sourcesRaw = gebunden ? gebunden.sources : await loadSourcesForVorgaenge(storage, rankedAll,
      { quellenNachweise, quellenzeit: jetzt });
  } catch (_) { return nichtVerfuegbar("store-error"); }
  // Erst die vollständigen bereits geladenen Quellen kennen undatierte
  // DIP-Aufbereitungen. Nur deren Bewertungsbonus korrigieren; keine zusätzlichen
  // Reads, Kandidaten oder Änderung einer explizit gebundenen redaktionellen Folge.
  if (!gebunden) {
    const projected = rankedAll.map(ko => require("./parlamentsdaten-herkunft").bewertungsprojektion(ko, sourcesRaw[ko.vorgang_id] || []));
    if (projected.some((ko, index) => ko !== rankedAll[index])) {
      rankedAll = ordneFrueh(scoring.scoringActive()
        ? scoring.rankForLage(projected, { limit: MAX_VORGAENGE }).map(item => item.ko) : projected, profile);
    }
  }
  // Auch die Lage darf verschiedene Ereignisse nicht als gemeinsamen Vorgang
  // ausgeben. Dieselbe bestehende Quellenmix-Pruefung wie im Briefing greift
  // vor Karten, Texteingabe und Cachebindung; gespeicherte KOs bleiben erhalten.
  // Source Safety Guard: kritische, unbestaetigte Claims aus unbekannten/schwachen
  // Quellen erscheinen NICHT in Aktuelle Lage (regelbasiert, 0 KI).
  const sicher = rankDContext(rankedAll, sourcesRaw);
  // Eine einzelne fachfremde Quelle darf auch bei passendem KO-Text keinen
  // persönlichen Bezug vortäuschen. Historisch explizit gebundene Eingaben
  // behalten ihren eigenen Quellen-/Fachvertrag unverändert.
  const ranked = gebunden ? sicher : profilbezug.mitQuellenbezug(sicher, profile, sourcesRaw);
  // Derselbe bereits geladene und gepruefte KO-Bestand traegt Karten und
  // Narrativ. Kein erneuter Korpuszugriff beim spaeteren Paketlesen.
  tagespaketGrundlage = ranked.map(ko => ({ id: ko.id, vorgang_id: ko.vorgang_id }));
  if (!ranked.length) {
    // Vorgaenge existierten, wurden aber alle quarantaeniert -> je nach Frische der
    // Rohdaten stale (Ausfall-Verdacht) oder quiet (wirklich ruhig), NICHT gap.
    // Die bereits geladenen ECHTEN Quellen (sourcesRaw, mit published_at) anhaengen, damit
    // die Frische aus dem echten Quellenzeitpunkt kommt und NICHT aus dem unzuverlaessigen
    // updated_at-Fallback (Re-Processing) -> sonst koennte 'stale' faelschlich als 'quiet' erscheinen.
    const withSources = rankedAll.map((ko) => ({ ...ko, sources: sourcesRaw[ko.vorgang_id] || [] }));
    return nichtVerfuegbar("no-vorgaenge", [], scoring.scoringActive()
      ? scoring.tabEmptyState("lage", { kos: withSources, hasRankedItems: false }) : null);
  }
  const allCards = ranked.map((ko) => require("./briefing-ereignisteilmitglieder").lageKarte(
    koToVorgangCard(ko, sourcesRaw[ko.vorgang_id]),
    gebunden?.teilmitgliedProjektionen?.find(i => i.vorgangId === ko.vorgang_id)));
  const sourcesByVorgang = {};
  // Quellen-Index über ALLE Karten (für die Absatz-Quellenauflösung) — unabhängig
  // von der Anzeige-Auswahl unten.
  allCards.forEach((c) => { sourcesByVorgang[c.vorgangId] = c.sources; });
  // Legacy-Fallback-Auswahl (temporär): moderne Vorgänge haben Vorrang; nur wenn
  // KEIN moderner existiert, Legacy-Vorgänge mit echter Quelle. Wird bei JEDEM
  // Aufruf frisch berechnet (die Karten entstehen pro Request neu, nur die
  // Narrativ-Absätze werden gecacht) — kein Stale-Cache-Effekt.
  const selectedCards = selectLageVorgaenge(allCards);
  const cards = gebunden ? selectedCards
    : require("./lage-quellenteilung").teile(selectedCards, sourcesRaw);

  // Zaehl-/Anzeige-Modus (z. B. Admin-Datenstatus): NUR die deterministisch
  // gerankten Karten zurueckgeben, KEIN KI-Narrativ erzeugen. Verhindert teure/
  // langsame KI-Live-Calls (bis zu 1 pro Account) allein fuer eine Zaehlung —
  // sonst kann der Datenstatus-Endpoint in Zeitueberschreitung laufen.
  if (opts.countOnly) {
    eligibility.assertSame(publicationPolicy);
    return fertig({ paragraphs: [], generatedAt: null }, cards, sourcesByVorgang, { fromCache: false });
  }

  const { koLite } = projectDContext(ranked, sourcesRaw, jetzt, gebunden,
    finite?.dateBinding ? gebunden.historicalSnapshot : null);
  // Historische Vorgangskarten bleiben verfuegbar. Ohne belegte aktuelle
  // Quellen entsteht jedoch kein kostenpflichtiger Text fuer die heutige Lage.
  if (!koLite.length) return nichtVerfuegbar("no-current-sources", cards);
  // Absatzlinks muessen dieselben Belege zeigen, die der Generator gelesen hat.
  // Die vollstaendige Quellenhistorie bleibt ausschliesslich an den Karten.
  const absatzQuellen = mapAbsatzQuellen(koLite, sourcesRaw);
  const koSetHash = eligibility.bindCache(gebunden
    ? require("./briefing-speicher").hash({ ranked, briefingEingabeHash: gebunden.eingabeHash }).slice(0, 32)
    : require("./briefing-speicher").hash({ kos: hashKoSet(ranked), profil: profilbezug.hashProfil(profile) }).slice(0, 32), publicationPolicy);
  const quellenHash = quellenbeleg.hashEingabe(koLite);
  const day = berlinDayKey();
  const cacheId = `bf-${userId}-${CACHE_SLOT}-${day}`;
  const T = require("./lage-teilstand");
  const teilArgs = !opts.missingOnly && !gebunden && !finite
    && require("./scalable-pipeline").skalierbarerPfadAktiv(process.env)
    ? { userId, tag: day, profile, eingabe: { koSetHash, quellenHash, profilHash: require("./briefing-speicher").profilHash(profile) },
      quellen: koLite, storage } : null;
  let teilZeile = null, ergaenzung = null;
  const teilstand = async ableiten => {
    if (!teilArgs) return null;
    try {
      const args = { ...teilArgs, now: new Date() };
      const row = ableiten ? await T.materialisiere(args) : await T.lese(args);
      eligibility.assertSame(publicationPolicy);
      teilZeile = row ? structuredClone(row) : null;
      return row ? fertig(row.payload, cards, absatzQuellen, { fromCache: true }) : null;
    } catch (error) {
      if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error;
      // Nur eine VORHER bestaetigte lokale Kopie ueberlebt einen spaeteren
      // Lesefehler. Erfolgreiches GET(null) hat sie oben ausdruecklich geloescht.
      // Eine unbestaetigte Ableitung darf damit niemals geheilt werden.
      if (!ableiten && teilZeile) {
        eligibility.assertSame(publicationPolicy);
        if (quellenbeleg.hashEingabe(koLite) === teilArgs.eingabe.quellenHash
          && T.gueltig(teilZeile.payload, { ...teilArgs, now: new Date() }))
          return fertig(teilZeile.payload, cards, absatzQuellen, { fromCache: true });
      }
      return null; // Keine Teilauswahl ohne vollstaendige bestehende Bindungen.
    }
  };
  const rueckfall = async (...args) => {
    if (ergaenzung) {
      // Auch bei verlorenem Schreibausgang hat ein bestaetigter Vollcache Vorrang.
      try {
        const row = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day, { strict: true });
        eligibility.assertSame(publicationPolicy);
        if (quellenbeleg.gespeicherterTextGueltig(row?.payload)
          && quellenbeleg.cacheGueltig(row.payload, koSetHash, quellenHash, koLite))
          return fertig(row.payload, cards, absatzQuellen, { fromCache: true });
      } catch (error) { if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error; }
      const teil = await teilstand(false); if (teil) return teil;
    }
    return nichtVerfuegbar(...args);
  };

  // 2) Cache lesen (kein KI-Call, wenn Tag + KO-Set unveraendert)
  if (!opts.force) {
    try {
      const cached = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day);
      eligibility.assertSame(publicationPolicy);
      if (cached && (!opts.repairIncomplete || quellenbeleg.gespeicherterTextGueltig(cached.payload))
        && quellenbeleg.cacheGueltig(cached.payload, koSetHash, quellenHash, koLite)
        && require("./briefing-ereignisteilmitglieder").cachePasst(cached.payload, gebunden?.teilmitgliedProjektionen || [])) {
        return fertig(cached.payload, cards, absatzQuellen, { fromCache: true });
      }
    } catch (error) { if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error; /* ignore -> neu erzeugen */ }
  }

  // P1-7: Im App-Start-Kritikpfad NUR die deterministischen Karten (+ ggf. bereits
  // gecachtes Narrativ oben) liefern und NIE einen Live-LLM-Call ausloesen. So
  // koennen die Lage-Karten nicht durch ein LLM-Timeout verschwinden (audit/lage.md,
  // audit/app-start-performance.md §1C). Die Narrativ-Erzeugung stoesst der Aufrufer
  // asynchron an (server.js /api/app/start, fire-and-forget) -> Cache warm fuer den
  // naechsten Aufruf.
  if (opts.cacheOnly) {
    eligibility.assertSame(publicationPolicy);
    const teil = await teilstand(false); if (teil) return teil;
    return fertig({ paragraphs: [], generatedAt: null }, cards, sourcesByVorgang, { fromCache: false, pendingNarrative: true });
  }

  // 3) Nur EIN paralleler Generator (Lock). acquirePipelineLock: false = gesperrt.
  const lockName = `lage-briefing-${userId}`;
  let gotLock = true;
  try { gotLock = await storage.acquirePipelineLock(lockName, 90 * 1000); }
  catch (_) { return await teilstand(false) || nichtVerfuegbar("store-error", cards); }
  if (gotLock === false) {
    try {
      const cached = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day);
      eligibility.assertSame(publicationPolicy);
      if (cached && (!opts.repairIncomplete || quellenbeleg.gespeicherterTextGueltig(cached.payload))
        && quellenbeleg.cacheGueltig(cached.payload, koSetHash, quellenHash, koLite)
        && require("./briefing-ereignisteilmitglieder").cachePasst(cached.payload, gebunden?.teilmitgliedProjektionen || [])) {
        return fertig(cached.payload, cards, absatzQuellen, { fromCache: true });
      }
    } catch (error) { if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error; /* ignore */ }
    return await teilstand(false) || nichtVerfuegbar("generating", cards);
  }

  try {
    // 4) Budget-Gate — bei Erschoepfung KEIN Fake-Briefing.
    const cacheVorSchreibversuch = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day, { strict: true });
    // Ein bestandener aktueller Vollcache hat immer Vorrang vor Teilausgaben.
    if (teilArgs && quellenbeleg.gespeicherterTextGueltig(cacheVorSchreibversuch?.payload)
      && quellenbeleg.cacheGueltig(cacheVorSchreibversuch.payload, koSetHash, quellenHash, koLite))
      return fertig(cacheVorSchreibversuch.payload, cards, absatzQuellen, { fromCache: true });
    const bestaetigterTeil = await teilstand(true);
    if (bestaetigterTeil) {
      try { ergaenzung = require("./lage-ergaenzung").vorbereiten(teilZeile.payload,
        { ...teilArgs, now: new Date() }); }
      catch { return bestaetigterTeil; }
      if (!ergaenzung) return bestaetigterTeil; // Kein anderer Quellenartikel: kein Aufruf.
    }
    if (opts.missingOnly && cacheVorSchreibversuch
      && (!opts.repairIncomplete || quellenbeleg.gespeicherterTextGueltig(cacheVorSchreibversuch.payload))) {
      return nichtVerfuegbar("existing-result", cards);
    }
    if (opts.fortsetzenNachZeitbudget && (!opts.missingOnly
      || !/^nachlauf500-[0-9]{5,20}$/.test(opts.costRunId || "") || opts.fortsetzenNachZeitbudget === opts.costRunId))
      throw new Error("lage-entwurfsfortsetzung-nicht-freigegeben");
    let fortsetzung = opts.fortsetzenNachZeitbudget ? await require("./lage-entwurfsbeleg").leseFortsetzung({
      userId, runId: opts.fortsetzenNachZeitbudget, quellen: koLite, profile, now: jetzt
    }, storage) : null;
    // Ein unveraenderlicher, bezahlter Entwurf bleibt als Beleg erhalten, kann
    // nach einer spaeteren Vertragsverschaerfung aber technisch veraltet sein.
    // Dann ist er keine sichere Fortsetzung: weder Review noch Auslieferung
    // duerfen die heute fehlende Dokument-/Mandatsbindung nachtraeglich raten.
    if (fortsetzung && ai.assembleLageParagraphs(fortsetzung.antwort, koLite, profile).length === 0)
      fortsetzung = null;
    if (opts.missingOnly) {
      if (typeof opts.beforeGenerate !== "function") throw new Error("nachlauf-kostenpruefung-fehlt");
      if (!fortsetzung) await opts.beforeGenerate(userId);
    }
    // Mehrmandantenfaehigkeit Phase 10: das Lage-Narrativ ist ein PRO-MANDANT-Call
    // (anders als das mandantenlose Understanding). Deshalb greift hier ZUSAETZLICH
    // zum globalen Call-Count-Deckel der per-Profil-EUR-Deckel (Tag+Monat) aus dem
    // Profil. Ohne gesetztes Profil-Budget = identisches Verhalten wie zuvor (nur
    // globaler Deckel). Bei erschoepftem Mandanten-Budget -> Leerzustand, kein Fake.
    const modernerKern = !opts.missingOnly && require("./scalable-pipeline").skalierbarerPfadAktiv(process.env);
    const belegArgs = { userId, tag: day,
      eingabe: ergaenzung ? require("./lage-ergaenzung").lese(ergaenzung, koLite, profile, userId).eingabe
        : { koSetHash, quellenHash, profilHash: require("./briefing-speicher").profilHash(profile) }, now: jetzt };
    let laufbeleg = null;
    if (modernerKern) {
      try { laufbeleg = await require("./lage-verarbeitungsbeleg").begin({ ...belegArgs, nurLesen: true }, storage); }
      catch (error) {
        if (error.code === "LAGE_AUSGANG_UNKLAR") return rueckfall("verarbeitung-ausgang-unklar", cards);
        return rueckfall("store-error", cards);
      }
    }
    const bestaetigtePhasen = laufbeleg?.entwurf !== undefined && laufbeleg?.pruefung !== undefined;
    // Ein belegbar ausgeschaltetes Modell darf keinen neuen bezahlten Start
    // hinterlassen. Vorhandene UNKNOWN-Phasen wurden schon oben gesperrt;
    // zwei bestaetigte Phasen bleiben dagegen ohne Anbieter frei wiederlesbar.
    if (ergaenzung && !bestaetigtePhasen && !ai.isAiEnabled()) return rueckfall("ai-unavailable", cards);
    let budget = { allowed: true };
    const tenantBudgets = {
      dailyBudgetCent: profile && profile.aiBudgetDailyCents != null ? Number(profile.aiBudgetDailyCents) : null,
      monthlyBudgetCent: profile && profile.aiBudgetMonthlyCents != null ? Number(profile.aiBudgetMonthlyCents) : null
    };
    try { if (!bestaetigtePhasen) budget = await storage.canSpendLlmForTenant(userId, tenantBudgets); }
    catch (_) { return rueckfall("store-error", cards); }
    if (!budget || !budget.allowed) {
      // Budget-Skip protokollieren (Budget-Rollout 2026-07): wie Understanding und
      // Kommunikationspfad — Info-Eintrag (zaehlt nicht als billable), damit die
      // Budget-Telemetrie ALLE gegateten Pfade sichtbar macht.
      try { storage.recordLlmUsage({ callType: "skipped-lage-narrativ", politicianId: userId, keinAufruf: true, success: false, error: budget && budget.reason ? String(budget.reason) : "budget" }); } catch (_) { /* Telemetrie darf Lage nie brechen */ }
      return { ...await rueckfall("budget", cards), kostenPhaseBestaetigt: Boolean(laufbeleg?.hatBestaetigtePhase()) };
    }

    let gen;
    try {
      // Der moderne Kern darf nach einem unklaren Anbieter-/Schreibausgang keine
      // kostenpflichtige Phase wiederholen. Bestaetigte Entwuerfe/Reviews bleiben
      // eingabegebunden fortsetzbar; sichtbare Qualitaetspruefungen bleiben identisch.
      if (modernerKern && !laufbeleg) laufbeleg = await require("./lage-verarbeitungsbeleg").begin(belegArgs, storage);
      const beleg = opts.missingOnly && /^nachlauf500-[0-9]{5,20}$/.test(opts.costRunId || "")
        ? (phase, antwort) => require("./lage-entwurfsbeleg").speichere({ userId,
          runId: opts.costRunId, phase, antwort, quellen: koLite, profile, fortgesetztAus: fortsetzung }) : null;
      gen = await ai.generateLageBriefing(koLite, profile, { politicianId: userId,
        // The admitted run start is deterministic before GO; a wall-clock
        // instant here would change the frozen D request hash on every call.
        briefingDatum: finite?.dateBinding ? finite.dateBinding.startsAtUTC : jetzt.toISOString(),
        runId: opts.costRunId || null,
        costAdmission: opts.costAdmission ?? null,
        costInputVersionHash: opts.costInputVersionHash ?? null,
        pruefaufwandNachweis: opts.pruefaufwandNachweis === true,
        gespeicherterEntwurf: laufbeleg?.entwurf ?? fortsetzung?.antwort,
        gespeichertePruefung: laufbeleg?.pruefung,
        ...(ergaenzung ? { lageErgaenzung: ergaenzung } : {}),
        onDraft: laufbeleg ? laufbeleg.onDraft : beleg ? antwort => beleg("entwurf", antwort) : null,
        onReview: laufbeleg ? laufbeleg.onReview : beleg ? antwort => beleg("pruefung", antwort) : null,
        beforeReview: laufbeleg ? laufbeleg.beforeReview : opts.missingOnly ? () => opts.beforeGenerate(userId) : null });
    } catch (error) {
      if (laufbeleg) await laufbeleg.nichtGesendet(error);
      if (ergaenzung) return rueckfall(error.code === "LLM_BUDGET_EXHAUSTED" ? "budget" : "ai-unavailable", cards);
      // Budget-Stopp der Choke-Point-Reservierung (requestOpenAI): ehrlich als
      // Budget-Zustand anzeigen — wie beim Pre-Gate oben. Der Skip-Eintrag wurde
      // bereits am Choke-Point protokolliert (skipped-lageBriefing), hier NICHT
      // doppelt loggen. Feste KI-Fehlerklassen bleiben fuer den Nachlauf sichtbar.
      if (error && error.code === "LAGE_AUSGANG_UNKLAR") return nichtVerfuegbar("verarbeitung-ausgang-unklar", cards);
      if (error && error.code === "LLM_BUDGET_EXHAUSTED") return {
        ...nichtVerfuegbar("budget", cards), kostenPhaseBestaetigt: Boolean(laufbeleg?.hatBestaetigtePhase()) };
      if (error?.code === "LAGE_AI_FAILURE" && error.diagnose?.fehler?.length === 1
        && error.diagnose.fehler[0] === "profilbezug-fehlt") {
        const teil = await teilstand(true); if (teil) return teil;
      }
      if (error && error.code === "LAGE_AI_FAILURE") return { ...nichtVerfuegbar(error.grund, cards),
        diagnose: require("./lage-textqualitaet").sichereDiagnose(error.diagnose) };
      throw error;
    }
    if (!gen || !Array.isArray(gen.paragraphs) || !gen.paragraphs.length) {
      return rueckfall("ai-unavailable", cards);
    }
    const paragraphs = quellenbeleg.gueltigeAbsaetze(gen.paragraphs, koLite);
    if (paragraphs.length !== gen.paragraphs.length) return rueckfall("ai-unavailable", cards);

    if (gebunden) {
      if (require("./briefing-lagebindung").pruefe(opts.briefingEingabe, profile, userId, finite ? bindingTime : new Date(),
        { acceptedSnapshot: Boolean(finite) }).eingabeHash
        !== gebunden.eingabeHash) throw new Error("briefing-lagebindung-abweichend");
      await opts.beforeSave(userId);
    }

    const payload = {
      paragraphs,
      ...(versorgung ? { versorgung } : {}),
      koSetHash,
      quellenHash,
      quellenVersion: quellenbeleg.VERSION,
      quellen: koLite,
      ...(ergaenzung ? { ergaenzungsBeleg: require("./lage-ergaenzung").beleg(ergaenzung, koLite, profile, userId) } : {}),
      ...(gebunden ? { briefingEingabeHash: gebunden.eingabeHash,
        ...(gebunden.teilmitgliedProjektionen.length ? { teilmitgliedProjektionen: gebunden.teilmitgliedProjektionen,
          teilmitgliedProjektionHash: require("./briefing-speicher").hash(gebunden.teilmitgliedProjektionen) } : {}) } : {}),
      qualitaet: gen.qualitaet || null,
      model: gen.model || null,
      wordCount: gen.wordCount || 0,
      generatedAt: new Date().toISOString()
    };
    if (finite?.dateBinding) payload.snapshotZeitbindung = finite.dateBinding;
    if (ergaenzung) {
      eligibility.assertSame(publicationPolicy);
      const latest = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day, { strict: true });
      if (quellenbeleg.gespeicherterTextGueltig(latest?.payload)
        && quellenbeleg.cacheGueltig(latest.payload, koSetHash, quellenHash, koLite))
        return fertig(latest.payload, cards, absatzQuellen, { fromCache: true });
      if (!require("node:util").isDeepStrictEqual(latest, cacheVorSchreibversuch)) return rueckfall("store-error", cards);
    }
    // 5) Cachen (idempotent, id = bf-<user>-lage-<Berlin-Tag>)
    const entry = { id: cacheId, user_id: userId, slot: CACHE_SLOT, generated_at: payload.generatedAt, payload };
    if (opts.missingOnly && !cacheVorSchreibversuch) {
      const saved = await storage.insertRenderedBriefingV3(entry);
      if (saved.saved !== true) return nichtVerfuegbar(saved.reason || "store-error", cards);
      const readback = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day, { strict: true });
      // JSONB darf Objektschluessel neu ordnen. Entscheidend sind der komplette
      // gespeicherte Inhalt und die Schreibzeit, nicht die JSON-Zeichenfolge.
      if (!readback || Date.parse(readback.generated_at) !== Date.parse(entry.generated_at)
          || !require("node:util").isDeepStrictEqual(readback.payload, payload)) {
        throw new Error("nachlauf-text-nicht-gespeichert");
      }
    } else {
      if (cacheVorSchreibversuch) payload.vorherigerStand = cacheVorSchreibversuch;
      const saved = await storage.saveRenderedBriefingV3(entry, { expectedLage: cacheVorSchreibversuch });
      if (!saved || saved.saved !== true) return rueckfall("store-error", cards);
      const readback = await storage.getRenderedBriefingV3(userId, CACHE_SLOT, day, { strict: true });
      if (!readback || !require("node:util").isDeepStrictEqual(readback.payload, payload))
        return rueckfall("store-error", cards);
    }

    return fertig(payload, cards, absatzQuellen, { fromCache: false });
  } catch (error) {
    if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error;
    if (ergaenzung) return rueckfall("store-error", cards);
    const teil = await teilstand(false); if (teil) return teil;
    throw error;
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
  mapAbsatzQuellen,
  hashKoSet,
  berlinDayKey,
  finalize,
  unavailable,
  loadRankedVorgaenge,
  prepareDContext
};
