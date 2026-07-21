"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · Vergleich (Aufgabe 5) + Abbruchregeln (Aufgabe 6).
// =============================================================================================
// Vergleicht LEGACY (Kompatibilitaetsschicht, allein sichtbar) gegen den NEUEN Laufzeitplan ueber
// 18 Dimensionen. JEDE Differenz traegt eine verstaendliche Ursache — KEINE Black-Box-Bewertung.
// Wo die Legacy-Quellenebene ohne Produktions-Read nicht vorliegt, ist die Dimension EHRLICH
// 'nicht_vergleichbar' (mit Grund), nie geraten.
//
// Die Abbruchregeln erzwingen: die neue Plattform ist NIE automatisch aktivierbar
// (autoActivateNewAllowed === false, strukturell), und sie ist 'nicht freigabefaehig', sobald
// mindestens eine der 11 Bedingungen eintritt. Legacy laeuft bei JEDEM Fehler unveraendert weiter.

// --- Metriken des neuen Plans ---------------------------------------------------------------
function neuMetrics(neu) {
  if (!neu) return null;
  const sources = neu.sources || [];
  const brokenLike = new Set(["broken", "paused", "archived"]);
  const healthAvailable = neu.healthAvailable;
  const working = healthAvailable ? sources.filter((s) => !brokenLike.has(s.gesundheit)).length : null;
  const publishers = new Set(sources.map((s) => s.publisher).filter(Boolean));
  const primary = sources.filter((s) => String(s.versorgungsebene).startsWith("primaer")).length;
  const secondary = sources.filter((s) => String(s.versorgungsebene).startsWith("sekundaer")).length;
  return {
    anzahlQuellen: sources.length,
    funktionierend: working,                              // null = ohne Health-Daten unbekannt
    unabhaengigeHerausgeber: publishers.size,
    primaerquellen: primary,
    sekundaerquellen: secondary,
    parteiFraktion: coversAny(neu, ["parties", "factions"]),
    ausschuesse: coversDim(neu, "policyFields"),
    themen: coversDim(neu, "policyFields"),
    region: coversDim(neu, "regions"),
    googleNewsAnteil: neu.suchanbieterAbhaengigkeit.anteil,
    redundanz: Object.keys(neu.alternativen || {}).length,
    kritischeLuecken: (neu.versorgungsluecken || []).filter((g) => g.dimension === "parties" || g.dimension === "factions" || g.dimension === "committees").length,
    qualitaetVerfuegbar: !!neu.qualityAvailable,
    gesundheitVerfuegbar: !!healthAvailable
  };
}
function coversAny(neu, needs) {
  return needs.some((n) => (neu.requirement[n] || []).length > 0
    && (neu.sources || []).some((s) => (s.auswahlgrund || []).some((r) => r.dimension === n || (n === "committees" && r.dimension === "policyFields"))));
}
function coversDim(neu, dim) {
  return (neu.sources || []).some((s) => (s.auswahlgrund || []).some((r) => r.dimension === dim));
}

// --- Legacy-Metriken (Paketebene; Quellenebene nur mit Produktions-Read) --------------------
function legacyMetrics(legacy) {
  const pkgs = new Set(legacy.packages || []);
  return {
    pflichtVersorgt: legacy.fullyActivated === true,
    sourceLevelAvailable: legacy.sourceLevelAvailable === true,
    parteiFraktion: pkgs.has("die-linke-bund"),
    ausschuesse: pkgs.has("arbeit-und-soziales"),
    region: pkgs.has("regional-niedersachsen"),
    personenbezug: [...pkgs].some((k) => String(k).startsWith("profil-"))
  };
}

// verdict-Helfer: gibt {verdict, grund}. cmpNum: hoeher = besser.
function cmpNum(l, n, label) {
  if (l == null || n == null) return { verdict: "nicht_vergleichbar", grund: `${label}: Legacy-Wert ohne Produktions-Read nicht verfuegbar.` };
  if (n > l) return { verdict: "besser", grund: `${label}: Neu ${n} > Legacy ${l}.` };
  if (n < l) return { verdict: "schlechter", grund: `${label}: Neu ${n} < Legacy ${l}.` };
  return { verdict: "gleich", grund: `${label}: gleich (${n}).` };
}
function cmpBool(l, n, label) {
  if (l == null || n == null) return { verdict: "nicht_vergleichbar", grund: `${label}: nicht vergleichbar.` };
  if (n === l) return { verdict: "gleich", grund: `${label}: beide ${n}.` };
  return n ? { verdict: "besser", grund: `${label}: Neu deckt ab, Legacy nicht.` }
           : { verdict: "schlechter", grund: `${label}: Legacy deckt ab, Neu nicht.` };
}

// 18-Dimensionen-Vergleich. Jede Zeile: {dimension, legacy, neu, verdict, grund}.
function compareMandate(run, ctx = {}) {
  const neu = run.neu;
  const L = legacyMetrics(run.legacy);
  const N = neuMetrics(neu);
  const rows = [];
  const push = (dimension, legacy, neuVal, res) => rows.push({ dimension, legacy, neu: neuVal, verdict: res.verdict, grund: res.grund });

  if (!neu) {
    // Fehler im neuen Pfad -> alles nicht vergleichbar, Legacy bleibt sichtbar (kein Regress).
    return { dimensions: [{ dimension: "gesamt", legacy: "sichtbar", neu: "fehler", verdict: "nicht_vergleichbar", grund: `Neuer Pfad fehlgeschlagen: ${run.neuError && run.neuError.message}.` }], besser: [], gleich: [], schlechter: [], nichtVergleichbar: ["gesamt"] };
  }

  // 1 Pflichtversorgung
  push("pflichtversorgung", L.pflichtVersorgt, neu.gesamtstatus, (() => {
    const nOk = neu.gesamtstatus === "vollstaendig";
    if (L.pflichtVersorgt === nOk) return { verdict: "gleich", grund: `Pflichtversorgung: Legacy ${L.pflichtVersorgt}, Neu ${neu.gesamtstatus}.` };
    return nOk ? { verdict: "besser", grund: "Neu vollstaendig, Legacy nicht." } : { verdict: "schlechter", grund: `Neu ${neu.gesamtstatus}, Legacy vollstaendig.` };
  })());
  // 2 Anzahl funktionierender Quellen
  push("funktionierende-quellen", L.sourceLevelAvailable ? "(Read)" : null, N.funktionierend, cmpNum(L.sourceLevelAvailable ? 0 : null, N.funktionierend, "Funktionierende Quellen"));
  // 3 unabhaengige Herausgeber
  push("unabhaengige-herausgeber", L.sourceLevelAvailable ? "(Read)" : null, N.unabhaengigeHerausgeber, cmpNum(L.sourceLevelAvailable ? 0 : null, N.unabhaengigeHerausgeber, "Unabhaengige Herausgeber"));
  // 4 Primaerquellen
  push("primaerquellen", L.sourceLevelAvailable ? "(Read)" : null, N.primaerquellen, cmpNum(L.sourceLevelAvailable ? 0 : null, N.primaerquellen, "Primaerquellen"));
  // 5 Sekundaerquellen
  push("sekundaerquellen", L.sourceLevelAvailable ? "(Read)" : null, N.sekundaerquellen, cmpNum(L.sourceLevelAvailable ? 0 : null, N.sekundaerquellen, "Sekundaerquellen"));
  // 6 Partei und Fraktion
  push("partei-fraktion", L.parteiFraktion, N.parteiFraktion, cmpBool(L.parteiFraktion, N.parteiFraktion, "Partei/Fraktion"));
  // 7 Ausschuesse
  push("ausschuesse", L.ausschuesse, N.ausschuesse, cmpBool(L.ausschuesse, N.ausschuesse, "Ausschuesse"));
  // 8 Themen
  push("themen", null, N.themen, { verdict: N.themen ? "besser" : "gleich", grund: `Themen: Neu ${N.themen ? "deckt ab" : "kein Themenbedarf"}; Legacy hat kein eigenes Themenpaket.` });
  // 9 Region
  push("region", L.region, N.region, cmpBool(L.region, N.region, "Region"));
  // 10 Personenbezug
  push("personenbezug", L.personenbezug, false, (() => {
    if (!L.personenbezug) return { verdict: "gleich", grund: "Personenbezug: beide ohne personengebundene Quelle." };
    return { verdict: "schlechter", grund: "Personenbezug: Legacy hat personengebundenes Paket, Neu (noch) nicht — Uebergangslücke." };
  })());
  // 11 Qualitaet
  push("qualitaet", null, N.qualitaetVerfuegbar ? "verfuegbar" : "unbekannt", { verdict: "nicht_vergleichbar", grund: N.qualitaetVerfuegbar ? "Qualitaet nur fuer Neu berechnet (EIN Modell); Legacy-Quellenebene fehlt." : "Qualitaetsdaten fehlen (ehrlich unbekannt)." });
  // 12 Gesundheit
  push("gesundheit", null, N.gesundheitVerfuegbar ? "verfuegbar" : "unbekannt", { verdict: "nicht_vergleichbar", grund: N.gesundheitVerfuegbar ? "Gesundheit nur fuer Neu berechnet (EIN Modell); Legacy-Quellenebene fehlt." : "Gesundheitsdaten fehlen (ehrlich unbekannt)." });
  // 13 Google-News-Anteil (niedriger = besser)
  push("google-news-anteil", L.sourceLevelAvailable ? "(Read)" : null, N.googleNewsAnteil, (() => {
    if (!L.sourceLevelAvailable) return { verdict: "nicht_vergleichbar", grund: "Google-News-Anteil: Legacy-Quellenebene fehlt." };
    return { verdict: "gleich", grund: `Google-News-Anteil Neu ${N.googleNewsAnteil}.` };
  })());
  // 14 Redundanz
  push("redundanz", L.sourceLevelAvailable ? "(Read)" : null, N.redundanz, cmpNum(L.sourceLevelAvailable ? 0 : null, N.redundanz, "Redundanz"));
  // 15 kritische Luecken (weniger = besser)
  push("kritische-luecken", null, N.kritischeLuecken, { verdict: N.kritischeLuecken > 0 ? "schlechter" : "gleich", grund: `Kritische Luecken Neu: ${N.kritischeLuecken}.` });
  // 16 private Quellen Isolation
  push("private-isolation", true, ctx.tenantIsolated !== false, (() => {
    const iso = ctx.tenantIsolated !== false;
    return iso ? { verdict: "gleich", grund: "Private Isolation: eingehalten (kein Leak)." } : { verdict: "schlechter", grund: "Private Isolation VERLETZT — Leak erkannt." };
  })());
  // 17 Laufzeit
  push("laufzeit", ctx.runtimeLegacyMs != null ? ctx.runtimeLegacyMs : null, ctx.runtimeNeuMs != null ? ctx.runtimeNeuMs : null, (() => {
    if (ctx.runtimeLegacyMs == null || ctx.runtimeNeuMs == null) return { verdict: "nicht_vergleichbar", grund: "Laufzeit nicht gemessen (deterministischer Lauf)." };
    if (ctx.runtimeNeuMs <= ctx.runtimeLegacyMs) return { verdict: "gleich", grund: `Laufzeit Neu ${ctx.runtimeNeuMs}ms <= Legacy ${ctx.runtimeLegacyMs}ms.` };
    return { verdict: "schlechter", grund: `Laufzeit Neu ${ctx.runtimeNeuMs}ms > Legacy ${ctx.runtimeLegacyMs}ms.` };
  })());
  // 18 deterministische Wiederholbarkeit
  push("determinismus", true, ctx.deterministic !== false, (() => {
    return ctx.deterministic !== false ? { verdict: "gleich", grund: "Ergebnis deterministisch (identische Wiederholung)." } : { verdict: "schlechter", grund: "Ergebnis NICHT deterministisch." };
  })());

  const besser = rows.filter((r) => r.verdict === "besser").map((r) => r.dimension);
  const schlechter = rows.filter((r) => r.verdict === "schlechter").map((r) => r.dimension);
  const gleich = rows.filter((r) => r.verdict === "gleich").map((r) => r.dimension);
  const nichtVergleichbar = rows.filter((r) => r.verdict === "nicht_vergleichbar").map((r) => r.dimension);
  return { dimensions: rows, besser, gleich, schlechter, nichtVergleichbar };
}

// --- Abbruchregeln (11 Bedingungen) ---------------------------------------------------------
function evaluateAbortRules(run, comparison, ctx = {}) {
  const neu = run.neu;
  const cmp = comparison || compareMandate(run, ctx);
  const blockers = [];
  const add = (regel, detail) => blockers.push({ regel, detail });

  // 9) Fehler oder Timeout im neuen Pfad (zuerst — ohne Neu ist alles andere n/a).
  if (run.neuError) add("fehler-neuer-pfad", `Neuer Pfad fehlgeschlagen: ${run.neuError.klasse} ${run.neuError.message}.`);

  if (neu) {
    // 1) Pflichtversorgung schlechter als Legacy.
    const legacyOk = run.legacy.fullyActivated === true;
    const neuOk = neu.gesamtstatus === "vollstaendig";
    if (legacyOk && !neuOk) add("pflichtversorgung-schlechter", `Legacy vollstaendig, Neu ${neu.gesamtstatus}.`);
    // 2) Neue kritische Luecke.
    const kritGaps = (neu.versorgungsluecken || []).filter((g) => ["parties", "factions", "committees"].includes(g.dimension));
    if (kritGaps.length) add("neue-kritische-luecke", `Kritische Versorgungsluecke(n): ${kritGaps.map((g) => `${g.dimension}:${g.wert}`).join(", ")}.`);
    // 3) Suchanbieter als alleinige Pflichtversorgung.
    if ((neu.suchanbieterAbhaengigkeit.alleinversorgungPflicht || []).length) {
      add("suchanbieter-alleinversorgung", `Pflichtbedarf nur ueber Suchanbieter: ${neu.suchanbieterAbhaengigkeit.alleinversorgungPflicht.map((g) => `${g.dimension}:${g.wert}`).join(", ")}.`);
    }
    // 5) Gesundheitsstatus unbekannt bei Pflichtquelle.
    const pflichtSources = pflichtCoveringSources(neu);
    const unknownHealth = pflichtSources.filter((s) => s.gesundheit === "unbekannt" || s.gesundheit === "needs_review");
    if (unknownHealth.length) add("gesundheit-unbekannt-pflichtquelle", `Pflichtquelle(n) ohne belastbaren Gesundheitsstatus: ${unknownHealth.map((s) => s.id).join(", ")}.`);
    // 6) Rechtlicher Pruefstatus fehlt bei aktiv vorgesehener Quelle.
    const legalMissing = (neu.sources || []).filter((s) => s.trust === "unbekannt" || s.trust == null);
    if (legalMissing.length) add("rechtlicher-pruefstatus-fehlt", `Quelle(n) ohne rechtlichen Pruefstatus/Vertrauen: ${legalMissing.map((s) => s.id).join(", ")}.`);
    // 11) unbekannte oder nicht erklaerbare Differenz.
    const unexplained = (cmp.dimensions || []).filter((d) => d.verdict !== "gleich" && (!d.grund || !String(d.grund).trim()));
    if (unexplained.length) add("unerklaerbare-differenz", `Differenz(en) ohne Ursache: ${unexplained.map((d) => d.dimension).join(", ")}.`);
  }

  // 4) Private Quelle ueberschreitet Tenant-Grenze.
  if (ctx.tenantIsolated === false) add("private-tenant-grenze", `Private Quelle ueberschreitet Tenant-Grenze (Leak): ${(ctx.tenantLeaked || []).join(", ")}.`);
  // 7) Profilidentitaet unsicher.
  if (ctx.identityUncertain === true) add("profilidentitaet-unsicher", "Profilidentitaet ist unsicher (fehlende/ungueltige ID).");
  // 8) Ergebnis nicht deterministisch.
  if (ctx.deterministic === false) add("nicht-deterministisch", "Neuer Plan ist nicht deterministisch (Wiederholung wich ab).");
  // 10) Messbare Verschlechterung der Laufzeit.
  if (ctx.runtimeLegacyMs != null && ctx.runtimeNeuMs != null && ctx.runtimeNeuMs > ctx.runtimeLegacyMs * (ctx.runtimeToleranceFactor || 3)) {
    add("laufzeit-verschlechterung", `Laufzeit Neu ${ctx.runtimeNeuMs}ms >> Legacy ${ctx.runtimeLegacyMs}ms.`);
  }

  return {
    winner: "legacy",                     // Legacy bleibt IMMER sichtbar/entscheidend
    autoActivateNewAllowed: false,        // strukturell NIE — unabhaengig vom Ergebnis
    notFreigabefaehig: blockers.length > 0,
    freigabefaehig: blockers.length === 0,
    blockers,
    legacyIntact: run.legacyIntact === true
  };
}

function pflichtCoveringSources(neu) {
  const out = [];
  const mand = [["parties", "parties"], ["factions", "factions"], ["committees", "policyFields"]];
  for (const s of neu.sources || []) {
    if ((s.auswahlgrund || []).some((r) => mand.some(([, dim]) => r.dimension === dim))) out.push(s);
  }
  return out;
}

module.exports = { compareMandate, evaluateAbortRules, neuMetrics, legacyMetrics };
