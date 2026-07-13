"use strict";

// Helmut — Sprint 5: Drei getrennte Bewertungsdimensionen + drei unterscheidbare Leerzustände.
//
// REINE, DETERMINISTISCHE LOGIK. Keine KI, kein Netz, kein Storage. Alle Eingaben liegen
// bereits im Knowledge Object (Vorgang) bzw. Profil vor (Understanding + Sprint-2-Klassifikation).
//
// WARUM: Heute ranken Lage, Radar UND Helmut faktisch nach derselben persönlichen
// Relevanz (matching.js similarity / decisions score). Dadurch wird die Lage zur
// persönlichen Filterblase, und „Datenlücke" ist von „ruhiger Tag" nicht unterscheidbar.
// Dieses Modul trennt sauber:
//   1. globale Wichtigkeit  (importance)   — MANDANTENLOS, objektiv, profilUNabhängig  -> LAGE
//   2. persönliche Relevanz (relevance)    — Nähe + Dynamik, profilABHÄNGIG            -> RADAR
//   3. Handlungsfähigkeit   (actionability)— wie konkret handelbar                     -> HELMUT
// und liefert je Tab einen KLAR unterscheidbaren Leerzustand mit Frische-/Qualitätssignal
// (kind: gap | stale | quiet), damit ein Datenausfall nie als ruhiger Tag missgedeutet wird.
//
// Additiv/opt-in: dieses Modul ändert KEIN Live-Verhalten von allein. Die Read-Pfade
// (lage.js/radarState.js/briefingContract.js) rufen es NUR, wenn scoringMode() aktiv ist
// (Default aus -> byte-identisches Alt-Verhalten). Das Scharfschalten (+ Deployment) ist
// ein freigabepflichtiger Folgeschritt.

const {
  HELMUT_LEVEL_ENUM, ZEITDRUCK_ENUM, STATUS_ENUM, DECISION_LEVEL_ENUM
} = require("./understanding-schema");

// ---------------------------------------------------------------------------
// Feature-Flag: entscheidet, ob die neuen Dimensionen live in die Read-Pfade
// eingehängt werden. Default AUS (Alt-Verhalten unverändert). "shadow" = berechnen
// und mitliefern, aber NICHT zum Ranking/Leerzustand verwenden (Beobachtung).
// ---------------------------------------------------------------------------
function scoringMode(env = process.env) {
  const raw = String(env.HELMUT_SCORING_MODE || "").trim().toLowerCase();
  if (raw === "on" || raw === "active" || raw === "live") return "on";
  if (raw === "shadow") return "shadow";
  return "off";
}
function scoringActive(env = process.env) { return scoringMode(env) === "on"; }

// --- kleine reine Helfer ----------------------------------------------------
function clamp01(x) { const n = Number(x); return !Number.isFinite(n) ? 0 : (n < 0 ? 0 : (n > 1 ? 1 : n)); }
function round(x) { return Math.round(Number(x) || 0); }
function asArray(v) { return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]); }
function nonEmptyCount(v) { return asArray(v).filter((x) => String(x == null ? "" : x).trim()).length; }
function normEnum(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
function hasText(v) { return String(v == null ? "" : v).trim().length >= 1; }

function slug(v) {
  return String(v == null ? "" : v).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function slugSet(list) { const s = new Set(); for (const x of asArray(list)) { const k = slug(x); if (k) s.add(k); } return s; }
function overlaps(aList, bList) {
  const b = slugSet(bList);
  for (const a of asArray(aList)) { const k = slug(a); if (k && b.has(k)) return true; }
  return false;
}
// Ganzwort-Treffer (Name in Erwähnungsliste ODER Prosa), gegen Teilstring-Fehltreffer.
function wholeWordIn(text, term) {
  const t = String(term || "").trim().toLowerCase();
  const h = String(text || "").toLowerCase();
  if (!t || !h) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß0-9])${esc}($|[^a-zäöüß0-9])`, "i").test(h);
}

// --- Zeit / Frische ---------------------------------------------------------
function toMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}
// Der maßgebliche Frische-Zeitpunkt eines Vorgangs: bevorzugt der jüngste ECHTE
// Quellenzeitpunkt (published_at), NICHT ko.updated_at (das durch Re-Processing
// „frisch" wirkt, ohne dass inhaltlich etwas Neues passiert ist — vgl. radarState).
function resolveTimestampMs(ko = {}) {
  const candidates = [];
  for (const s of asArray(ko.sources)) candidates.push(toMs(s && (s.published_at || s.publishedAt || s.date)));
  candidates.push(toMs(ko.newest_source_at), toMs(ko.newest_source_published_at), toMs(ko.published_at));
  const real = candidates.filter((x) => x != null);
  if (real.length) return Math.max(...real);
  // Fallback nur, wenn kein echter Quellenzeitpunkt vorliegt:
  return toMs(ko.updated_at) || toMs(ko.created_at) || null;
}
function ageHours(ms, now) { return ms == null ? Infinity : Math.max(0, (now - ms) / 3600000); }

// ===========================================================================
// 1) GLOBALE WICHTIGKEIT (importance) — mandantenlos, profilunabhängig
// ===========================================================================
// Misst, wie folgenreich/bedeutsam ein Vorgang OBJEKTIV ist — unabhängig davon,
// wen er persönlich betrifft. Bewusst OHNE Recency-Anteil: Wichtigkeit ist keine
// Aktualität. Frische ist ein separates Signal (siehe assessFreshness), das im
// Lage-Ranking nur als Tie-Break dient (ersetzt den alten reinen Recency-Fallback).

const LEVEL_IMPORTANCE = {
  international: 1.0, eu: 0.92, bund: 0.85, land: 0.55, kommune: 0.32, unknown: 0.4
};
const EVENT_IMPORTANCE = {
  gesetzentwurf: 1.0, kabinettsbeschluss: 0.95, abstimmung: 0.9, verordnung: 0.85, urteil: 0.85,
  anhoerung: 0.6, antrag: 0.55, bericht: 0.5, anfrage: 0.42, personalie: 0.42, protest: 0.42,
  sonstiges: 0.32, unknown: 0.35
};
const STAFF_LEVEL = { high: 1.0, medium: 0.55, low: 0.22, unknown: 0.0 };
const ZEITDRUCK_WEIGHT = { hoch: 1.0, mittel: 0.6, niedrig: 0.3, keiner: 0.0 };

const IMPORTANCE_WEIGHTS = { level: 26, event: 20, footprint: 14, corroboration: 16, stakes: 14, urgency: 10 };

function levelFactor(ko) {
  const lvl = normEnum(ko.decision_level);
  let base = LEVEL_IMPORTANCE[lvl] != null ? LEVEL_IMPORTANCE[lvl] : LEVEL_IMPORTANCE.unknown;
  // Mehr-Ebenen-Reichweite (z. B. Bundesgesetz mit Länderwirkung) hebt die Bedeutung leicht.
  const related = asArray(ko.related_levels).map(normEnum).filter((l) => l && l !== lvl && DECISION_LEVEL_ENUM.includes(l));
  if (related.length) base = Math.min(1, base + 0.08);
  return clamp01(base);
}
function eventFactor(ko) {
  const ev = normEnum(ko.event_type);
  return clamp01(EVENT_IMPORTANCE[ev] != null ? EVENT_IMPORTANCE[ev] : EVENT_IMPORTANCE.unknown);
}
function footprintFactor(ko) {
  // Institutionelle Breite: wie viele offizielle Akteure/Institutionen sind beteiligt?
  const count = nonEmptyCount(ko.decision_entities) + nonEmptyCount(ko.ministerien)
    + nonEmptyCount(ko.parteien) + nonEmptyCount(ko.ausschuesse);
  return clamp01(count / 6); // 6+ distinkte Akteure -> volle Breite
}
function corroborationFactor(ko) {
  // Quellenkorroboration: über wie viele unabhängige Dokumente ist der Vorgang belegt?
  const n = Number(ko.source_document_count || nonEmptyCount(ko.sources) || 0);
  if (n <= 0) return 0;
  return clamp01(Math.log2(n + 1) / Math.log2(9)); // 1->0.32, 3->0.63, 8->1.0
}
function stakesFactor(ko) {
  const r = STAFF_LEVEL[normEnum(ko.risk_level)] || 0;
  const o = STAFF_LEVEL[normEnum(ko.opportunity_level)] || 0;
  let base = Math.max(r, o);
  // Fallback, wenn keine strukturierten Level: aus Risiken/Chancen-Listen ableiten.
  if (base === 0) base = clamp01((nonEmptyCount(ko.risiken) + nonEmptyCount(ko.chancen)) / 4) * 0.5;
  return clamp01(base);
}
function urgencyFactor(ko) {
  const z = ZEITDRUCK_WEIGHT[normEnum(ko.zeitdruck)];
  let base = z != null ? z : 0;
  if (hasText(ko.deadline)) base = Math.max(base, 0.7);
  return clamp01(base);
}

function globalImportance(ko = {}) {
  const factors = {
    level: levelFactor(ko),
    event: eventFactor(ko),
    footprint: footprintFactor(ko),
    corroboration: corroborationFactor(ko),
    stakes: stakesFactor(ko),
    urgency: urgencyFactor(ko)
  };
  let score = 0;
  for (const k of Object.keys(IMPORTANCE_WEIGHTS)) score += factors[k] * IMPORTANCE_WEIGHTS[k];
  return { score: round(score), factors };
}

// ===========================================================================
// 2) PERSÖNLICHE RELEVANZ (relevance) — Nähe + Dynamik, profilabhängig
// ===========================================================================
// Nähe   = wie stark berührt der Vorgang GENAU dieses Mandat (Person/Partei/
//          Ausschuss/Wahlkreis/Thema). Belegbasiert, keine Bedeutungsheuristik.
// Dynamik = wie stark BEWEGT sich der Vorgang gerade (Neuheit/Status/Widerhall).
// Ohne Nähe ist ein Vorgang NICHT persönlich relevant, egal wie dynamisch — sonst
// würde das Radar zur globalen Trendliste. Deshalb ist Nähe das Gate.

const PROX = { person: 0.40, ausschuss: 0.30, partei: 0.22, wahlkreis: 0.18, thema: 0.12 };
const STATUS_NOVELTY = { neu: 1.0, update: 0.7, beobachtung: 0.4, abgeschlossen: 0.1 };
const PROX_GATE = 0.05; // unterhalb: nicht persönlich relevant (Radar-Gate)

function profileTerms(profile = {}) {
  return {
    fullName: String(profile.fullName || profile.name || "").trim(),
    parties: [profile.party, profile.partei, profile.faction, profile.fraktion].filter(Boolean),
    committees: [...asArray(profile.committees), profile.committee, ...asArray(profile.ausschuesse)].filter(Boolean),
    regions: [profile.constituency, profile.wahlkreis, ...asArray(profile.regionalInterests), ...asArray(profile.regionale_interessen)].filter(Boolean),
    topics: [...asArray(profile.focusTopics), ...asArray(profile.fachpolitische_schwerpunkte), ...asArray(profile.themen)].filter(Boolean)
  };
}
// Person-Erwähnung: strukturiert (mentioned_people/mps) ODER voller Name in Prosa.
function personMatch(ko, fullName) {
  if (!fullName || fullName.split(/\s+/).length < 2) return false;
  for (const label of [...asArray(ko.mentioned_people), ...asArray(ko.mentioned_mps)]) {
    if (wholeWordIn(String(label), fullName) || slug(label) === slug(fullName)) return true;
  }
  const prose = `${ko.headline || ""} ${ko.display_title || ""} ${ko.was_ist_passiert || ""} ${ko.warum_wichtig || ""}`;
  return wholeWordIn(prose, fullName);
}
function koRegions(ko) {
  const out = [...asArray(ko.mentioned_locations)];
  for (const g of [...asArray(ko.affected_geographies), ...asArray(ko.mentioned_geographies)]) {
    if (g && g.name) out.push(g.name);
  }
  return out;
}

// proximity 0..1: AUSSCHLIESSLICH belegbasierte Nähe (direkter Feldabgleich). Die
// matching.js-Ähnlichkeit fließt hier BEWUSST NICHT ein — sie ist eine Bedeutungs-/
// Merkmalsheuristik und darf das belegbasierte Nähe-Gate nicht allein öffnen (sonst würde
// das Radar zur Filterblase). Die Ähnlichkeit verstärkt erst NACH bestandenem Gate den Score
// (siehe personalRelevance).
function proximityScore(ko = {}, profile = {}) {
  const t = profileTerms(profile);
  let s = 0;
  if (personMatch(ko, t.fullName)) s += PROX.person;
  if (overlaps(t.committees, [...asArray(ko.ausschuesse), ...asArray(ko.mentioned_committees)])) s += PROX.ausschuss;
  if (overlaps(t.parties, [...asArray(ko.parteien), ...asArray(ko.mentioned_parties)])) s += PROX.partei;
  if (overlaps(t.regions, koRegions(ko))) s += PROX.wahlkreis;
  if (overlaps(t.topics, [...asArray(ko.themen), ...asArray(ko.tags)])) s += PROX.thema;
  return clamp01(s);
}

function dynamicsScore(ko = {}, now = Date.now()) {
  const novelty = STATUS_NOVELTY[normEnum(ko.status)] != null ? STATUS_NOVELTY[normEnum(ko.status)] : 0.5;
  const ts = resolveTimestampMs(ko);
  const h = ageHours(ts, now);
  // Recency-Rampe: <48h voll, linear abfallend bis 0 bei ~14 Tagen.
  const recency = h === Infinity ? 0 : clamp01(1 - Math.max(0, h - 48) / (14 * 24 - 48));
  // Widerhall: Häufung unabhängiger Belege (kein Einzeldokument-Signal).
  const n = Number(ko.source_document_count || nonEmptyCount(ko.sources) || 0);
  const resonance = n >= 3 ? 1 : (n === 2 ? 0.6 : (n === 1 ? 0.3 : 0));
  return clamp01(0.45 * novelty + 0.35 * recency + 0.20 * resonance);
}

function personalRelevance(ko = {}, profile = {}, opts = {}) {
  const now = opts.now || Date.now();
  const proximity = proximityScore(ko, profile); // rein belegbasiert -> Gate
  if (proximity < PROX_GATE) return { score: 0, proximity: Number(proximity.toFixed(3)), dynamics: 0 };
  const dynamics = dynamicsScore(ko, now);
  // Ähnlichkeit (matching.js) verstärkt die Nähe NUR, nachdem das belegbasierte Gate
  // bestanden ist — sie kann das Gate nie allein öffnen.
  const sim = opts.match && Number.isFinite(Number(opts.match.similarity)) ? clamp01(Number(opts.match.similarity)) : 0;
  const effProximity = clamp01(proximity + sim * 0.15);
  const score = round(100 * (0.65 * effProximity + 0.35 * dynamics));
  return { score, proximity: Number(effProximity.toFixed(3)), dynamics: Number(dynamics.toFixed(3)) };
}

// ===========================================================================
// 3) HANDLUNGSFÄHIGKEIT (actionability) — wie konkret handelbar
// ===========================================================================
// Priorisiert Vorgänge, bei denen der/die Abgeordnete KONKRET etwas tun kann:
// klare nächste Schritte, ein Zeitfenster, ein verfügbarer Kanal, ein echter Hebel
// (Risiko ohne Reaktion / Chance) und ein Mandats-Zugriff (eigener Ausschuss/Partei).

const ACTION_TYPE_ACTIVE = {
  preparestatement: 1.0, prepareqa: 0.9, aligninternally: 0.8, delegate: 0.6,
  monitor: 0.25, ignore: 0.0, none: 0.0, unknown: 0.1
};
const CONCRETE_CHANNELS = new Set(["press", "social", "internal", "parliamentary"]);
// Kanal (KO-Enum) -> Profil-Kanäle (preferredChannels), für „nutzt der/die MdB diesen Weg?"
const CHANNEL_TO_PROFILE = {
  press: ["presse", "press", "pressemitteilung"],
  social: ["social", "linkedin", "x", "twitter", "instagram"],
  internal: ["internal", "intern", "fraktion"],
  parliamentary: ["ausschuss", "parlament", "parliamentary", "buergerdialog", "rede"]
};
const ACTION_WEIGHTS = { steps: 32, timeWindow: 20, channel: 20, stakes: 16, handle: 12 };

function stepsFactor(ko) {
  const structs = asArray(ko.action_items_struct).filter((x) => x && typeof x === "object");
  if (structs.length) {
    let best = 0, active = 0, due = 0;
    for (const it of structs) {
      const w = ACTION_TYPE_ACTIVE[normEnum(it.actionType).replace(/[^a-z]/g, "")] || 0;
      best = Math.max(best, w);
      if (w >= 0.6) active += 1;
      if (hasText(it.dueHint)) due = 1;
    }
    return clamp01(0.6 * best + 0.25 * clamp01(active / 3) + 0.15 * due);
  }
  if (nonEmptyCount(ko.action_items)) return 0.35;      // unstrukturierte Schritte vorhanden
  if (hasText(ko.handlungsempfehlung)) return 0.25;      // wenigstens eine Empfehlung
  return 0;
}
function timeWindowFactor(ko) {
  const z = ZEITDRUCK_WEIGHT[normEnum(ko.zeitdruck)];
  let base = z != null ? z : 0;
  if (hasText(ko.deadline)) base = Math.max(base, 0.7);
  return clamp01(base);
}
function channelFactor(ko, profile) {
  const st = ko.recommended_communication_struct && typeof ko.recommended_communication_struct === "object"
    ? ko.recommended_communication_struct : null;
  let base = 0;
  if (st) {
    const ch = normEnum(st.recommendedChannel);
    if (CONCRETE_CHANNELS.has(ch)) {
      // Budget so aufgeteilt, dass die Kanal-Passung (0.2) IMMER Spielraum behält
      // (Basis+Format+Outputs saettigen nur bis 0.8, nicht bis 1.0).
      base = 0.6;
      if (hasText(st.recommendedFormat) && normEnum(st.recommendedFormat) !== "none") base += 0.1;
      if (nonEmptyCount(st.suggestedOutputs)) base += 0.1;
      // Kanal-Passung: nutzt der/die MdB diesen Kanal überhaupt (preferredChannels)?
      const prefs = slugSet(profile.preferredChannels);
      const mapped = (CHANNEL_TO_PROFILE[ch] || []).map(slug);
      if (mapped.some((m) => prefs.has(m))) base += 0.2;
    }
  } else if (hasText(ko.recommended_communication)) {
    base = 0.3;
  }
  return clamp01(base);
}
function stakesActionFactor(ko) {
  const r = STAFF_LEVEL[normEnum(ko.risk_level)] || 0;
  const o = STAFF_LEVEL[normEnum(ko.opportunity_level)] || 0;
  let base = Math.max(r, o);
  if (hasText(ko.risk_of_no_action) || hasText(ko.opportunity_summary)) base = Math.max(base, 0.4);
  return clamp01(base);
}
function mandateHandleFactor(ko, profile) {
  const hasProfile = profile && (hasText(profile.fullName) || hasText(profile.party) || hasText(profile.committee) || nonEmptyCount(profile.committees));
  if (!hasProfile) return 0.3; // neutral, wenn kein Profil (KO-intrinsische Handlungsfähigkeit)
  const t = profileTerms(profile);
  if (overlaps(t.committees, ko.ausschuesse)) return 1.0;  // eigener Ausschuss -> direkter parlamentarischer Hebel
  if (overlaps(t.parties, ko.parteien)) return 0.6;         // eigene Partei/Fraktion
  if (overlaps(t.regions, koRegions(ko))) return 0.4;       // eigener Wahlkreis
  return 0.1;
}

function actionability(ko = {}, profile = {}) {
  const factors = {
    steps: stepsFactor(ko),
    timeWindow: timeWindowFactor(ko),
    channel: channelFactor(ko, profile),
    stakes: stakesActionFactor(ko),
    handle: mandateHandleFactor(ko, profile)
  };
  let score = 0;
  for (const k of Object.keys(ACTION_WEIGHTS)) score += factors[k] * ACTION_WEIGHTS[k];
  return { score: round(score), factors };
}

// --- Kombiniertes Tripel je Vorgang -----------------------------------------
function scoreVorgang(ko = {}, profile = {}, opts = {}) {
  const now = opts.now || Date.now();
  return {
    id: ko.id || ko.knowledge_object_id || null,
    vorgang_id: ko.vorgang_id || null,
    importance: globalImportance(ko).score,
    relevance: personalRelevance(ko, profile, { now, match: opts.match }).score,
    actionability: actionability(ko, profile).score,
    timestampMs: resolveTimestampMs(ko)
  };
}

// ===========================================================================
// RANKING je Tab — jede Oberfläche nach IHRER Dimension
// ===========================================================================
function stableId(ko) { return String(ko.id || ko.knowledge_object_id || ko.vorgang_id || ""); }

// LAGE: primär globale Wichtigkeit, Tie-Break Frische (ersetzt reinen Recency-Fallback),
// dann Id. Profilunabhängig — die Lage ist bewusst KEINE persönliche Filterblase.
function rankForLage(kos = [], opts = {}) {
  const now = opts.now || Date.now();
  const scored = asArray(kos).filter((k) => k && stableId(k)).map((ko) => ({
    ko, importance: globalImportance(ko).score, ts: resolveTimestampMs(ko)
  }));
  scored.sort((a, b) =>
    (b.importance - a.importance) ||
    ((b.ts || 0) - (a.ts || 0)) ||
    stableId(a.ko).localeCompare(stableId(b.ko))
  );
  const limit = opts.limit != null ? opts.limit : scored.length;
  return scored.slice(0, Math.max(0, limit)).map((x, i) => ({ ko: x.ko, importance: x.importance, rank: i + 1 }));
}

// RADAR: persönliche Relevanz (Nähe+Dynamik). Nur Vorgänge mit Nähe (score>0).
function rankForRadar(kos = [], profile = {}, opts = {}) {
  const now = opts.now || Date.now();
  const matchById = opts.matchById || {};
  const scored = asArray(kos).filter((k) => k && stableId(k)).map((ko) => {
    const r = personalRelevance(ko, profile, { now, match: matchById[stableId(ko)] || null });
    return { ko, relevance: r.score, dynamics: r.dynamics, proximity: r.proximity };
  }).filter((x) => x.relevance > 0);
  scored.sort((a, b) =>
    (b.relevance - a.relevance) ||
    (b.dynamics - a.dynamics) ||
    stableId(a.ko).localeCompare(stableId(b.ko))
  );
  const limit = opts.limit != null ? opts.limit : scored.length;
  return scored.slice(0, Math.max(0, limit)).map((x, i) => ({ ko: x.ko, relevance: x.relevance, proximity: x.proximity, dynamics: x.dynamics, rank: i + 1 }));
}

// HELMUT: Handlungsfähigkeit. Tie-Break globale Wichtigkeit (wichtige, handelbare zuerst),
// dann Id. Nur Vorgänge mit einem Mindest-Handlungssignal (score>=floor).
function rankForHelmut(kos = [], profile = {}, opts = {}) {
  const floor = opts.floor != null ? opts.floor : 1;
  const scored = asArray(kos).filter((k) => k && stableId(k)).map((ko) => ({
    ko, actionability: actionability(ko, profile).score, importance: globalImportance(ko).score
  })).filter((x) => x.actionability >= floor);
  scored.sort((a, b) =>
    (b.actionability - a.actionability) ||
    (b.importance - a.importance) ||
    stableId(a.ko).localeCompare(stableId(b.ko))
  );
  const limit = opts.limit != null ? opts.limit : scored.length;
  return scored.slice(0, Math.max(0, limit)).map((x, i) => ({ ko: x.ko, actionability: x.actionability, importance: x.importance, rank: i + 1 }));
}

// ===========================================================================
// FRISCHE + DREI UNTERSCHEIDBARE LEERZUSTÄNDE
// ===========================================================================
// Der Nutzer darf „Datenlücke" (Ausfall) NIE mit „ruhiger Tag" (echt nichts los)
// verwechseln. Deshalb liefert jeder Tab bei Leere einen eigenen `kind`:
//   gap   = gar keine Daten vorhanden            -> Datenausfall/Backlog
//   stale = Daten vorhanden, aber zu alt          -> Frische-Problem (Ausfall-Verdacht)
//   quiet = Daten frisch, aber für DIESEN Tab nichts Passendes -> wirklich ruhig
// `kind` ist der harte Diskriminator; `reason`/`headline`/`detail` sind die Texte.

const DEFAULT_STALE_HOURS = Number(process.env.HELMUT_FRESH_STALE_HOURS || 36);

function assessFreshness(kos = [], opts = {}) {
  const now = opts.now || Date.now();
  const staleHours = opts.staleHours != null ? opts.staleHours : DEFAULT_STALE_HOURS;
  const list = asArray(kos).filter(Boolean);
  const stamps = list.map(resolveTimestampMs).filter((x) => x != null);
  const hasData = list.length > 0;
  const newestMs = stamps.length ? Math.max(...stamps) : null;
  const newestAgeHours = newestMs == null ? null : Math.max(0, (now - newestMs) / 3600000);
  const isStale = hasData && (newestAgeHours == null || newestAgeHours > staleHours);
  return {
    hasData,
    count: list.length,
    newestMs,
    newestAgeHours: newestAgeHours == null ? null : Number(newestAgeHours.toFixed(1)),
    isStale,
    isFresh: hasData && !isStale
  };
}

// Tab-spezifische „ruhig"-Texte (nur wenn frische Daten vorliegen, aber nichts passt).
const QUIET_TEXT = {
  lage: {
    reason: "ruhige-lage",
    headline: "Ruhige Lage",
    detail: "Heute liegen keine Vorgänge von überregionaler Bedeutung vor. Die Quellen sind aktuell — es ist wirklich ruhig, keine Datenlücke."
  },
  radar: {
    reason: "kein-umfeldsignal",
    headline: "Nichts Neues in deinem Umfeld",
    detail: "Es gibt aktuelle Vorgänge, aber keiner berührt gerade dein Mandat (Person, Partei, Ausschuss, Wahlkreis). Kein Datenausfall — nur ruhig um dich herum."
  },
  helmut: {
    reason: "kein-handlungsbedarf",
    headline: "Heute kein konkreter Handlungsbedarf",
    detail: "Die aktuellen Vorgänge bieten derzeit keinen konkreten Handlungsansatz für dein Mandat. Die Datenlage ist frisch — es ist nichts zu tun, nichts ausgefallen."
  }
};

// Baut den Leerzustand für einen Tab. `hasRankedItems` = hat der Tab nach seinem
// eigenen Ranking überhaupt etwas? Wenn ja -> kein Leerzustand (null).
function tabEmptyState(tab, opts = {}) {
  const key = String(tab || "").toLowerCase();
  const now = opts.now || Date.now();
  const kos = asArray(opts.kos).filter(Boolean);
  const hasRankedItems = !!opts.hasRankedItems;
  if (hasRankedItems) return null; // nicht leer

  const fresh = opts.freshness || assessFreshness(kos, { now, staleHours: opts.staleHours });
  const quiet = QUIET_TEXT[key] || QUIET_TEXT.lage;

  let kind, reason, headline, detail;
  if (!fresh.hasData) {
    kind = "gap";
    reason = "datenluecke";
    headline = "Datenlücke";
    detail = "Es liegen aktuell keine belegten Vorgänge vor. Das ist ein Datenausfall/Backlog, kein ruhiger Tag — bitte Quellenlauf prüfen.";
  } else if (fresh.isStale) {
    kind = "stale";
    reason = "veraltet";
    headline = "Quellen veraltet";
    const age = fresh.newestAgeHours == null ? "unbekannt" : `${Math.round(fresh.newestAgeHours)} h`;
    detail = `Die jüngsten Quellen sind ${age} alt (Schwelle ${opts.staleHours != null ? opts.staleHours : DEFAULT_STALE_HOURS} h). Mögliche Datenlücke — nicht als ruhiger Tag werten, bitte Frische/Quellenlauf prüfen.`;
  } else {
    kind = "quiet";
    reason = quiet.reason;
    headline = quiet.headline;
    detail = quiet.detail;
  }

  return {
    tab: key,
    empty: true,
    kind,          // gap | stale | quiet  (harter Diskriminator)
    reason,        // stabiler Code je Tab
    headline,      // kurze Überschrift
    detail,        // erklärender Satz (Datenlücke NIE mit ruhig verwechseln)
    freshness: {
      hasData: fresh.hasData,
      count: fresh.count,
      newestAgeHours: fresh.newestAgeHours,
      isFresh: fresh.isFresh,
      isStale: fresh.isStale
    }
  };
}

module.exports = {
  scoringMode, scoringActive,
  // Dimensionen
  globalImportance, personalRelevance, actionability, scoreVorgang,
  // Teil-Scores (für Tests/Transparenz)
  proximityScore, dynamicsScore,
  // Ranking je Tab
  rankForLage, rankForRadar, rankForHelmut,
  // Frische + Leerzustände
  assessFreshness, tabEmptyState, resolveTimestampMs,
  // Konstanten (single source of truth für Tests)
  LEVEL_IMPORTANCE, EVENT_IMPORTANCE, IMPORTANCE_WEIGHTS, ACTION_WEIGHTS, PROX, PROX_GATE, DEFAULT_STALE_HOURS
};
