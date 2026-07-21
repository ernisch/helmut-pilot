"use strict";

// Test des DARK LAUNCH der neuen Quellenplattform (lib/helmut/quellenarchitektur/dark-launch.js).
// REINE LOGIK mit synthetischen Fixtures (KEIN Netz, keine KI, kein Storage, keine echten Mandanten).
//
// Deckt die acht Auftragsaufgaben ab:
//   1  Shadow Mode: je Mandat parallel Legacy- UND Neu-Ergebnis, Legacy bleibt allein sichtbar
//   2  automatischer Vergleich über die 13 Pflichtdimensionen
//   3  Difference-Report (keine Black Box: jeder Unterschied trägt eine Begründung)
//   4  Metriken (Coverage, Versorgungsgrad, Primär/Sekundär, Google-News-Anteil, Qualität,
//      Gesundheit, Redundanz, kritische Versorgungslücken)
//   5  Telemetrie: nur technische Kennzahlen, KEINE personenbezogenen Inhalte
//   6  interner Admin-Report (Legacy gegen Neu über alle Mandate)
//   7  Belastungstest: verschiedene Parteien/Ausschüsse/Bundesländer/Themen, mehrere Mandate
//   8  Abbruchregeln: neue Plattform NIE automatisch aktiv; Legacy gewinnt bei Coverage-
//      Verschlechterung / fehlenden Pflichtquellen / Google-News-Alleinversorgung / kritischen Lücken

const dl = require("../lib/helmut/quellenarchitektur/dark-launch");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────────────────
// Neu-Quellen tragen dieselbe id wie ihr Legacy-Pendant (== legacy_source_id, so wie
// toCrawlerSource sie im echten Plan setzt) PLUS packageKeys — dadurch ist der
// Mengenvergleich (gewählte Quellen) fachlich aussagekräftig.

// Mandat A — Bundestag, Die Linke, Arbeit und Soziales, Niedersachsen.
const PROFIL_A = {
  id: "mandat-a", fullName: "Alpha Beispiel", parliament: "Bundestag",
  party: "Die Linke", committees: ["Arbeit und Soziales"],
  focusTopics: ["Rente", "Pflege"], state: "Niedersachsen", constituency: "Salzgitter"
};
// Legacy: gesunde amtliche Basis + Fraktion + Ministerium + Regionalquelle + Personensuche(GN).
const LEGACY_A = [
  { id: "bundestag", type: "bundestag", url: "https://www.bundestag.de/rss", status: "healthy" },
  { id: "bmas", type: "ministry", url: "https://bmas.de/rss.xml", status: "healthy", themeTerms: ["soziales", "rente", "pflege"] },
  { id: "linksfraktion", type: "faction", party: "Die Linke", url: "https://www.linksfraktion.de/rss", status: "healthy" },
  { id: "braunschweiger-zeitung", type: "local", regional: true, regions: ["Niedersachsen"], url: "https://www.braunschweiger-zeitung.de/rss", status: "healthy" },
  { id: "mandat-a-news", type: "person", url: "https://news.google.com/rss/search?q=%22Alpha%20Beispiel%22", status: "healthy" }
];
// Neu: gleiche Kern-ids (kein Wegfall) + Pakete; die Fraktions-/Regio-Wege sind kuratiert
// (NICHT Google News); die Personensuche wird als konsolidiert erklärt.
const NEU_A = [
  { id: "bundestag", type: "bundestag", packageKeys: ["bund-basis"], url: "https://www.bundestag.de/rss", status: "healthy" },
  { id: "bmas", type: "ministry", packageKeys: ["arbeit-und-soziales"], url: "https://bmas.de/rss.xml", status: "healthy" },
  { id: "linksfraktion", type: "faction", packageKeys: ["die-linke-bund"], party: "Die Linke", url: "https://www.linksfraktion.de/rss", status: "healthy" },
  { id: "braunschweiger-zeitung", type: "local", packageKeys: ["regional-niedersachsen"], regional: true, regions: ["Niedersachsen"], url: "https://www.braunschweiger-zeitung.de/rss", status: "healthy" },
  { id: "verdi-soziales", type: "union", packageKeys: ["arbeit-und-soziales"], url: "https://www.verdi.de/rss", status: "healthy", coverage: { topics: ["pflege", "tarif"] } }
];
// Die Personensuche mandat-a-news wird als Legacy-Orphan erklärt (durch Paketquelle abgelöst).
const ORPHAN_A = { "mandat-a-news": "orphan_legacy" };

// ── 0) Flag-Guard + Kern-Invariante ──────────────────────────────────────────────────────
check("0a Default off", dl.darkLaunchMode({}) === "off" && dl.darkLaunchEnabled({}) === false);
check("0b shadow erkannt", dl.darkLaunchMode({ HELMUT_DARK_LAUNCH: "shadow" }) === "shadow" && dl.darkLaunchEnabled({ HELMUT_DARK_LAUNCH: "shadow" }) === true);
check("0c auch 'on' bleibt shadow-Semantik (Dark Launch aktiviert NIE)", dl.darkLaunchMode({ HELMUT_DARK_LAUNCH: "on" }) === "shadow");
check("0d Unsinn -> off", dl.darkLaunchMode({ HELMUT_DARK_LAUNCH: "vielleicht" }) === "off");

// ── 1) Shadow Mode: Legacy und Neu unabhängig, Legacy unverändert ────────────────────────
const shadowA = dl.computeMandateShadow({ profile: PROFIL_A, legacySources: LEGACY_A, newSources: NEU_A, orphanClassification: ORPHAN_A });
check("1a Legacy-Ergebnis vollständig berechnet (5 Quellen)", shadowA.legacy.sourceIds.length === 5);
check("1b Neu-Ergebnis vollständig berechnet (5 Quellen)", shadowA.neu.sourceIds.length === 5);
check("1c beide Seiten haben eigene Metriken", !!shadowA.legacy.metrics && !!shadowA.neu.metrics && shadowA.legacy.metrics !== shadowA.neu.metrics);
check("1d Legacy-Quellenliste unverändert durchgereicht (kein Umschalten)",
  JSON.stringify(shadowA.legacy.sourceIds) === JSON.stringify(LEGACY_A.map((s) => s.id)));
check("1e Mandats-ID technisch übernommen", shadowA.mandateId === "mandat-a");
check("1f Bedarfe aus dem Profil abgeleitet", shadowA.needs.parties.includes("linke") && shadowA.needs.committees.includes("arbeit-und-soziales"));

// ── 2) Klassifikation + 4) Metriken ──────────────────────────────────────────────────────
const cBt = dl.classifySource(LEGACY_A[0]);
check("2a Bundestag = Primärquelle", cBt.tier === "primaer" && cBt.isGoogleNews === false);
const cGn = dl.classifySource(LEGACY_A[4]);
check("2b Google-News-Personensuche = Sekundär + isGoogleNews", cGn.tier === "sekundaer" && cGn.isGoogleNews === true);
check("2c Qualität skaliert mit Vertrauen (Bundestag > Google News)", cBt.quality > cGn.quality);

const mL = shadowA.legacy.metrics;
check("4a Metrik: Quellenanzahl", mL.anzahlQuellen === 5);
check("4b Metrik: Primär-/Sekundärzählung summiert auf", mL.anzahlPrimaerquellen + mL.anzahlSekundaerquellen === 5);
check("4c Metrik: Google-News-Anteil = 1/5", Math.abs(mL.googleNewsAnteil - 0.2) < 1e-9);
check("4d Metrik: durchschnittliche Quellenqualität 0..1", mL.durchschnittlicheQuellenqualitaet > 0 && mL.durchschnittlicheQuellenqualitaet <= 1);
check("4e Metrik: Gesundheitsstatus gesund (keine defekten)", mL.gesundheitsstatus === "gesund" && mL.gesundheit.defekt === 0);
check("4f Metrik: Redundanz vorhanden (Zahl 0..1)", mL.redundanz >= 0 && mL.redundanz <= 1);
check("4g Metrik: Coverage/Versorgungsgrad vorhanden", typeof mL.versorgungsgrad === "number" && mL.coverage === mL.versorgungsgrad);
check("4h Metrik: kritische Versorgungslücken ist Zahl", typeof mL.kritischeVersorgungsluecken === "number");
check("4i Redundanz erkennt echte URL-Dublette", (() => {
  const m = dl.computeSourceMetrics([
    { id: "a", url: "https://x.de/rss", status: "healthy" },
    { id: "b", url: "https://x.de/rss", status: "healthy" }
  ], {});
  return m.doppelteWege === 1 && m.redundanz === 0.5;
})());

// ── 3) Coverage-Ableitung ────────────────────────────────────────────────────────────────
const covNeuBmas = dl.deriveSourceCoverage(NEU_A[1]);
check("3a Neu-Quelle: packageKeys -> Ausschuss-Abdeckung (arbeit-und-soziales)", covNeuBmas.committees.has("arbeit und soziales"));
const covLegacyFraktion = dl.deriveSourceCoverage(LEGACY_A[2]);
check("3b Legacy-Quelle: party -> Partei-Abdeckung (linke)", covLegacyFraktion.parties.has("linke"));
check("3c Neu deckt Ausschuss 'arbeit-und-soziales' ab, Legacy NICHT (nur Ministerium ohne Ausschuss-Tag)",
  shadowA.neu.metrics.coverageDetail.perDimension.committees.abgedeckt === 1 &&
  shadowA.legacy.metrics.coverageDetail.perDimension.committees.abgedeckt === 0);

// ── 2) Vergleich: 13 Dimensionen vollständig ─────────────────────────────────────────────
const cmpA = dl.compareMandate(shadowA);
const DIMENSIONEN = [
  "gewaehlteQuellen", "quellenanzahl", "gewichtung", "gesundheit", "coverage",
  "fehlendeQuellen", "duplikate", "googleNewsAbhaengigkeit", "versorgungsluecken",
  "themenabdeckung", "ausschussabdeckung", "parteiabdeckung", "regionalabdeckung"
];
check("2d alle 13 Pflichtdimensionen im Vergleich", DIMENSIONEN.every((d) => cmpA.dimensions.some((r) => r.dimension === d)) && cmpA.dimensions.length === 13);
check("2e jede Dimension trägt ein Urteil", cmpA.dimensions.every((r) => ["identisch", "besser", "schlechter", "abweichung"].includes(r.verdict)));
check("2f Neu deckt Ausschuss besser ab", cmpA.dimensions.find((r) => r.dimension === "ausschussabdeckung").verdict === "besser");
check("2g Personensuche als Orphan erklärt -> KEINE unerklärten Wegfälle -> fehlendeQuellen identisch",
  cmpA.dimensions.find((r) => r.dimension === "fehlendeQuellen").verdict === "identisch");

// ── 3) Difference-Report: keine Black Box ────────────────────────────────────────────────
const diffA = dl.buildDifferenceReport(shadowA, cmpA);
check("3d Report: blackBox === false", diffA.blackBox === false);
check("3e Report: jede Nicht-identisch-Dimension hat eine Begründung", (() => {
  const nonIdent = cmpA.dimensions.filter((r) => r.verdict !== "identisch").length;
  return diffA.warumUnterschiede.length === nonIdent && diffA.warumUnterschiede.every((w) => typeof w.warum === "string" && w.warum.length > 0);
})());
check("3f Report: 'welche Quelle zusätzlich' enthält verdi-soziales", diffA.welcheQuelleZusaetzlich.includes("verdi-soziales"));
check("3g Report: fehlende Quelle als erklärt geführt (Orphan)", diffA.welcheQuelleFehlt.length === 0 && diffA.welcheQuelleFehltErklaert.some((e) => e.id === "mandat-a-news"));
check("3h Report: identisch/besser/schlechter-Listen konsistent zum Vergleich",
  diffA.wasWaereBesser.length === cmpA.besser.length && diffA.wasWaereSchlechter.length === cmpA.schlechter.length);

// ── 5) Telemetrie: nur technische Kennzahlen, keine PII ──────────────────────────────────
const telA = dl.buildTelemetryRecord({ shadow: shadowA, comparison: cmpA, nowMs: 1721563200000, durationMs: 37, errors: ["x"], warnings: [] });
check("5a Telemetrie: Zeit/Mandats-ID/Dauer vorhanden", telA.zeitpunktMs === 1721563200000 && telA.mandatsId === "mandat-a" && telA.dauerMs === 37);
check("5b Telemetrie: Quellenzahlen + Fehler + Warnungen + Abweichungen", telA.anzahlQuellenLegacy === 5 && telA.anzahlQuellenNeu === 5 && telA.fehler === 1 && telA.warnungen === 0 && typeof telA.abweichungen === "number");
check("5c Telemetrie: als PII-frei markiert", telA._piiClean === true);
check("5d Telemetrie: enthält KEINE Namen/URLs/Titel (nur Allowlist-Schlüssel)", (() => {
  const blob = JSON.stringify(telA).toLowerCase();
  return !blob.includes("alpha") && !blob.includes("beispiel") && !blob.includes("http") && !blob.includes("bundestag");
})());
check("5e Telemetrie: manipulierter Datensatz mit Fremdfeld wird als NICHT PII-frei erkannt",
  dl.telemetryIsPiiClean({ ...telA, quellenName: "Bundestag" }) === false);
check("5f Telemetrie: freier Text in Regel-Array wird abgelehnt",
  dl.telemetryIsPiiClean({ ...telA, forceLegacyRegeln: ["ein ganzer satz mit inhalt"] }) === false);

// ── 8) Abbruchregeln: jede der vier harten Regeln + Kern-Invariante ──────────────────────
// (R1) Coverage schlechter: Neu deckt Ausschuss NICHT ab, Legacy schon.
{
  const legacy = [
    { id: "bundestag", type: "bundestag", url: "https://www.bundestag.de/rss", status: "healthy", coverage: { committees: ["arbeit-und-soziales"] } }
  ];
  const neu = [
    { id: "bundestag", type: "bundestag", packageKeys: ["bund-basis"], url: "https://www.bundestag.de/rss", status: "healthy" }
  ];
  const s = dl.computeMandateShadow({ profile: { id: "r1", parliament: "Bundestag", committees: ["Arbeit und Soziales"] }, legacySources: legacy, newSources: neu });
  const ab = dl.evaluateAbortRules(s);
  check("8a R1 Coverage-Verschlechterung -> forceLegacy", ab.forceLegacy && ab.forceLegacyReasons.some((r) => r.regel === "coverage-schlechter"));
  check("8a' winner bleibt legacy, autoActivate false", ab.winner === "legacy" && ab.autoActivateNewAllowed === false);
}
// (R2) Pflichtquellen fehlen: eine kritische Legacy-Quelle fehlt unerklärt im Neu-Plan.
{
  const legacy = [
    { id: "bundestag", type: "bundestag", url: "https://www.bundestag.de/rss", status: "healthy" },
    { id: "bmas", type: "ministry", url: "https://bmas.de/rss.xml", status: "healthy" }
  ];
  const neu = [
    { id: "bundestag", type: "bundestag", packageKeys: ["bund-basis"], url: "https://www.bundestag.de/rss", status: "healthy" }
  ];
  const s = dl.computeMandateShadow({ profile: { id: "r2", parliament: "Bundestag" }, legacySources: legacy, newSources: neu });
  const ab = dl.evaluateAbortRules(s, null, { criticalLegacyIds: ["bmas"] });
  check("8b R2 fehlende Pflichtquelle -> forceLegacy", ab.forceLegacy && ab.forceLegacyReasons.some((r) => r.regel === "pflichtquellen-fehlen"));
}
// (R3) Google-News-Alleinversorgung: einziger Partei-Weg im Neu-Plan ist Google News.
{
  const legacy = [
    { id: "linksfraktion", type: "faction", party: "Die Linke", url: "https://www.linksfraktion.de/rss", status: "healthy" }
  ];
  const neu = [
    { id: "linksfraktion", type: "faction", party: "Die Linke", packageKeys: ["die-linke-bund"], url: "https://news.google.com/rss/search?q=linke", status: "healthy" }
  ];
  const s = dl.computeMandateShadow({ profile: { id: "r3", parliament: "Bundestag", party: "Die Linke" }, legacySources: legacy, newSources: neu });
  const ab = dl.evaluateAbortRules(s);
  check("8c R3 Google-News-Alleinversorgung eines Pflichtbedarfs -> forceLegacy", ab.forceLegacy && ab.forceLegacyReasons.some((r) => r.regel === "google-news-alleinversorgung"));
}
// (R4) neue kritische Versorgungslücke: Neu hat unversorgten Ausschuss, Legacy nicht.
{
  const legacy = [
    { id: "bundestag", type: "bundestag", url: "https://www.bundestag.de/rss", status: "healthy", coverage: { committees: ["gesundheit"] } }
  ];
  const neu = [
    { id: "bundestag", type: "bundestag", packageKeys: ["bund-basis"], url: "https://www.bundestag.de/rss", status: "healthy" }
  ];
  const s = dl.computeMandateShadow({ profile: { id: "r4", parliament: "Bundestag", committees: ["Gesundheit"] }, legacySources: legacy, newSources: neu });
  const ab = dl.evaluateAbortRules(s);
  check("8d R4 neue kritische Versorgungslücke -> forceLegacy", ab.forceLegacy && ab.forceLegacyReasons.some((r) => r.regel === "kritische-versorgungsluecke"));
}
// Kern-Invariante: selbst wenn Neu strikt besser ist, wird NIE automatisch aktiviert.
{
  const s = dl.computeMandateShadow({ profile: PROFIL_A, legacySources: LEGACY_A, newSources: NEU_A, orphanClassification: ORPHAN_A });
  const ab = dl.evaluateAbortRules(s);
  check("8e neue Plattform NIE automatisch aktiv (autoActivateNewAllowed === false)", ab.autoActivateNewAllowed === false);
  check("8f winner ist im Dark Launch immer legacy", ab.winner === "legacy");
}

// ── 7) Belastungstest: verschiedene Parteien/Ausschüsse/Bundesländer/Themen, mehrere Mandate
const PARTEIEN = ["Die Linke", "SPD", "Bündnis 90/Die Grünen", "CDU", "FDP", "AfD", "CSU"];
const AUSSCHUESSE = ["Arbeit und Soziales", "Gesundheit", "Verkehr", "Inneres", "Finanzen", "Verteidigung", "Umwelt"];
const BUNDESLAENDER = ["Niedersachsen", "Bayern", "Berlin", "Brandenburg", "Nordrhein-Westfalen", "Sachsen", "Hessen"];
const THEMEN = [["Rente", "Pflege"], ["Klima", "Energie"], ["Digitalisierung"], ["Migration"], ["Bildung"], ["Steuern"], ["Bundeswehr"]];
const PARLAMENTE = ["Bundestag", "Bundestag", "Bundestag", "Landtag", "Bundestag", "Landtag", "Bundestag"];

const mandate = [];
for (let i = 0; i < 12; i++) {
  const profile = {
    id: `last-${i}`, fullName: `Prüfmandat ${i}`, parliament: PARLAMENTE[i % PARLAMENTE.length],
    party: PARTEIEN[i % PARTEIEN.length], bundesland: BUNDESLAENDER[i % BUNDESLAENDER.length],
    state: BUNDESLAENDER[i % BUNDESLAENDER.length], committees: [AUSSCHUESSE[i % AUSSCHUESSE.length]],
    focusTopics: THEMEN[i % THEMEN.length]
  };
  // Legacy: neutrale amtliche Basis (gesund).
  const legacy = [
    { id: "bundestag", type: "bundestag", url: "https://www.bundestag.de/rss", status: "healthy" },
    { id: `ausschuss-${i}`, type: "committee", url: `https://www.bundestag.de/ausschuss/${i}/rss`, status: "healthy", coverage: { committees: [AUSSCHUESSE[i % AUSSCHUESSE.length]] } },
    { id: `partei-${i}`, type: "party", party: PARTEIEN[i % PARTEIEN.length], url: `https://partei-${i}.de/rss`, status: "healthy" },
    { id: `mandat-${i}-news`, type: "person", url: `https://news.google.com/rss/search?q=mandat${i}`, status: "healthy" }
  ];
  // Neu: Kern-ids erhalten + Pakete; die Personensuche als Orphan erklärt.
  const neu = [
    { id: "bundestag", type: "bundestag", packageKeys: ["bund-basis"], url: "https://www.bundestag.de/rss", status: "healthy" },
    { id: `ausschuss-${i}`, type: "committee", url: `https://www.bundestag.de/ausschuss/${i}/rss`, status: "healthy", coverage: { committees: [AUSSCHUESSE[i % AUSSCHUESSE.length]] } },
    { id: `partei-${i}`, type: "party", party: PARTEIEN[i % PARTEIEN.length], url: `https://partei-${i}.de/rss`, status: "healthy" }
  ];
  mandate.push({
    profile, legacySources: legacy, newSources: neu,
    orphanClassification: { [`mandat-${i}-news`]: "orphan_legacy" },
    nowMs: 1721563200000 + i * 1000, durationMs: 10 + i, errors: [], warnings: []
  });
}
const batch = dl.runDarkLaunchBatch(mandate);
check("7a Belastungstest: alle 12 Mandate verarbeitet", batch.count === 12 && batch.results.length === 12);
check("7b Belastungstest: jedes Mandat liefert vollständigen Vergleich (13 Dimensionen)",
  batch.results.every((r) => r.comparison.dimensions.length === 13));
check("7c Belastungstest: jedes Mandat liefert einen Difference-Report ohne Black Box",
  batch.results.every((r) => r.differenceReport.blackBox === false));
check("7d Belastungstest: jede Telemetrie ist PII-frei", batch.results.every((r) => r.telemetry._piiClean === true));
check("7e Belastungstest: KEIN Mandat aktiviert je die neue Plattform automatisch",
  batch.results.every((r) => r.abort.autoActivateNewAllowed === false && r.abort.winner === "legacy"));
check("7f Belastungstest: verschiedene Parteien/Ausschüsse/Bundesländer abgedeckt", (() => {
  const parteien = new Set(batch.results.map((r) => r.shadow.needs.parties.join("")));
  const ausschuesse = new Set(batch.results.flatMap((r) => r.shadow.needs.committees));
  return parteien.size >= 5 && ausschuesse.size >= 5;
})());

// ── 6) interner Admin-Report ─────────────────────────────────────────────────────────────
const admin = dl.buildDarkLaunchAdminReport(batch, { nowMs: 1721563200000 });
check("6a Admin-Report: intern markiert, nicht öffentlich", admin.intern === true);
check("6b Admin-Report: neue Plattform strukturell nicht auto-aktivierbar", admin.autoActivateNewAllowed === false);
check("6c Admin-Report: Mandatszahl korrekt", admin.mandateGesamt === 12);
check("6d Admin-Report: besser/schlechter/gleichwertig summieren auf alle Mandate",
  admin.besserVersorgt.length + admin.schlechterVersorgt.length + admin.gleichwertig.length === 12);
check("6e Admin-Report: Discovery-Regeln (welche Pakete greifen) aggregiert", admin.discoveryRegeln.some((d) => d.id === "bund-basis" && d.mandate === 12));
check("6f Admin-Report: Qualitätsregeln gezählt", typeof admin.qualitaetsRegeln.primaerBevorzugung === "number" && typeof admin.qualitaetsRegeln.dedupWirksam === "number");
check("6g Admin-Report: Dimensions-Aggregat vollständig", DIMENSIONEN.every((d) => admin.dimensionen[d]));
check("6h Admin-Report: Zusammenfassung vorhanden", typeof admin.zusammenfassung.neuMindestensGleichwertig === "boolean");

// ── Adversarial: leeres Profil, leere Seiten, defekte Quellen ────────────────────────────
{
  const s = dl.computeMandateShadow({ profile: {}, legacySources: [], newSources: [] });
  check("Xa leeres Mandat bricht nicht", s.legacy.sourceIds.length === 0 && s.neu.sourceIds.length === 0);
  const ab = dl.evaluateAbortRules(s);
  check("Xb leeres Mandat: kein Force, aber auch nie auto-aktiv", ab.forceLegacy === false && ab.autoActivateNewAllowed === false);
}
{
  // Defekte (bot-gesperrte) Quelle im Neu-Plan -> Gesundheit beeinträchtigt, wird sichtbar.
  const neu = [{ id: "bot", type: "media", url: "https://bot.example/rss", status: "broken" }];
  const m = dl.computeSourceMetrics(neu, {});
  check("Xc defekte Quelle -> Gesundheitsstatus beeinträchtigt", m.gesundheitsstatus === "beeintraechtigt" && m.gesundheit.defekt === 1);
}
{
  // Null-Elemente in der Quellenliste werden robust gefiltert.
  const m = dl.computeSourceMetrics([null, { id: "a", url: "https://a.de/rss", status: "healthy" }, undefined], {});
  check("Xd null/undefined-Quellen robust gefiltert", m.anzahlQuellen === 1);
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Dark-Launch-Assertions`);
process.exit(failed > 0 ? 1 : 0);
