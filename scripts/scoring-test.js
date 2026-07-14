"use strict";

// Tests fuer das Sprint-5-Scoring: globale Wichtigkeit vs. persoenliche Relevanz vs.
// Handlungsfaehigkeit + die drei klar unterscheidbaren Leerzustaende.
// Reine Offline-Tests (Fixtures), kein Netz/KI/DB. now wird fest injiziert (deterministisch).

const s = require("../lib/helmut/scoring");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const NOW = Date.parse("2026-07-13T12:00:00Z");
const iso = (agoMs) => new Date(NOW - agoMs).toISOString();
const H = 3600000, D = 24 * H;

// --- Fixtures ---------------------------------------------------------------
// Global wichtiger Bundesgesetzentwurf, breit belegt, hoher Einsatz, frisch.
const bundGesetz = {
  id: "ko-bund", vorgang_id: "vg-bund", decision_level: "bund", event_type: "gesetzentwurf",
  source_document_count: 6, risk_level: "high", opportunity_level: "medium", zeitdruck: "hoch",
  parteien: ["SPD", "CDU"], ausschuesse: ["Arbeit und Soziales"], ministerien: ["BMAS"],
  decision_entities: [{ name: "Bundestag", type: "parlament" }], status: "neu",
  action_items_struct: [{ title: "Statement vorbereiten", actionType: "prepareStatement", priority: "high", dueHint: "diese Woche" }],
  recommended_communication_struct: { recommendedChannel: "press", recommendedFormat: "statement", suggestedOutputs: ["PM"] },
  risk_of_no_action: "Ohne Reaktion droht Deutungsverlust.", sources: [{ published_at: iso(2 * H) }]
};
// Kommunale Randnotiz, kaum belegt, kein Einsatz, alt.
const kommRand = {
  id: "ko-komm", vorgang_id: "vg-komm", decision_level: "kommune", event_type: "sonstiges",
  source_document_count: 1, status: "beobachtung", sources: [{ published_at: iso(9 * D) }]
};
// EU-Verordnung, mittel belegt.
const euVo = {
  id: "ko-eu", vorgang_id: "vg-eu", decision_level: "eu", event_type: "verordnung",
  source_document_count: 3, risk_level: "medium", status: "update", ministerien: ["BMWK"],
  sources: [{ published_at: iso(30 * H) }]
};

// --- 1) GLOBALE WICHTIGKEIT (profilunabhaengig) -----------------------------
console.log("== 1) Globale Wichtigkeit ==");
const impBund = s.globalImportance(bundGesetz).score;
const impKomm = s.globalImportance(kommRand).score;
check("Bundesgesetzentwurf deutlich wichtiger als kommunale Randnotiz", impBund > impKomm + 40);
check("Wichtigkeit strikt im Bereich 0..100 (beide Grenzen, beide Vorgaenge)", impBund >= 0 && impBund <= 100 && impKomm >= 0 && impKomm <= 100);
// Echter Profilunabhaengigkeits-Nachweis: ZWEI verschiedene Profile liefern dieselbe
// Wichtigkeit, und diese entspricht dem profillosen globalImportance (mandantenlos).
check("Wichtigkeit ist profilUNabhaengig (zwei verschiedene Profile -> gleiche Wichtigkeit)",
  s.scoreVorgang(bundGesetz, { party: "SPD", committees: ["Gesundheit"] }, { now: NOW }).importance
  === s.scoreVorgang(bundGesetz, { party: "CDU", constituency: "Passau" }, { now: NOW }).importance
  && s.scoreVorgang(bundGesetz, {}, { now: NOW }).importance === impBund);
check("hoehere Ebene => hoehere Ebenen-Faktor (bund > kommune)", s.globalImportance(bundGesetz).factors.level > s.globalImportance(kommRand).factors.level);
check("Gesetzentwurf gewichtiger als sonstiges", s.globalImportance(bundGesetz).factors.event > s.globalImportance(kommRand).factors.event);
check("mehr Quellen => hoehere Korroboration", s.globalImportance(bundGesetz).factors.corroboration > s.globalImportance(kommRand).factors.corroboration);
check("unbekannte Ebene faellt nicht auf 0 (ehrlicher Mittelwert)", s.globalImportance({ id: "x", decision_level: "unknown" }).factors.level > 0.3);
const multi = s.globalImportance({ id: "m", decision_level: "bund", related_levels: ["land"], event_type: "gesetzentwurf" }).factors.level;
const single = s.globalImportance({ id: "m", decision_level: "bund", event_type: "gesetzentwurf" }).factors.level;
check("Mehr-Ebenen-Reichweite hebt Ebenen-Faktor leicht", multi > single);
check("leeres KO => Wichtigkeit niedrig, kein Crash", s.globalImportance({ id: "leer" }).score < 30);

// --- 2) PERSOENLICHE RELEVANZ (Naehe + Dynamik, profilabhaengig) ------------
console.log("== 2) Persoenliche Relevanz ==");
const cem = { fullName: "Cem Ince", party: "Die Linke", committees: ["Arbeit und Soziales"], constituency: "Salzgitter" };
const fremd = { fullName: "Anna Fremd", party: "FDP", committees: ["Digitales"], constituency: "Passau" };
const relCem = s.personalRelevance(bundGesetz, cem, { now: NOW });
const relFremd = s.personalRelevance(bundGesetz, fremd, { now: NOW });
check("Relevanz ist profilABHAENGIG (Cem != Fremd fuer denselben Vorgang)", relCem.score !== relFremd.score);
check("Cem (Ausschuss-Treffer) relevanter als Fremd (kein Treffer)", relCem.score > relFremd.score);
check("voellig unbezogener Vorgang => Relevanz 0 (Naehe-Gate)", s.personalRelevance(kommRand, fremd, { now: NOW }).score === 0);
// Person-Erwaehnung ist starke Naehe
const personKO = { id: "p", status: "neu", mentioned_mps: ["Cem Ince"], source_document_count: 2, sources: [{ published_at: iso(1 * H) }] };
check("Person-Erwaehnung erzeugt starke Naehe", s.proximityScore(personKO, cem) >= s.PROX.person);
// Ganzwort-Absicherung: 'Cem Ince' ist Substring von 'Cem Incentive', darf aber NICHT
// matchen (nachfolgendes 'n' ist keine Wortgrenze) — ein simples includes() wuerde hier
// faelschlich treffen, also prueft dieser Fall die Wortgrenzen-Logik echt.
check("Namensteil-Fehltreffer vermieden (Ganzwort): 'Cem Ince' in 'Cem Incentive' matcht nicht", s.proximityScore({ id: "z", was_ist_passiert: "Das Cem Incentive-Programm startet" }, { fullName: "Cem Ince" }) === 0);
check("echte Namensnennung matcht (Ganzwort-Positivgegentest)", s.proximityScore({ id: "z2", was_ist_passiert: "Rede von Cem Ince heute" }, { fullName: "Cem Ince" }) >= s.PROX.person);
// Fix (Verify): reine matching.js-Aehnlichkeit darf das belegbasierte Naehe-Gate NICHT allein oeffnen.
check("reine Aehnlichkeit oeffnet das Naehe-Gate NICHT (belegbasiert)", s.personalRelevance({ id: "sim", status: "neu", source_document_count: 1, sources: [{ published_at: iso(1 * H) }] }, fremd, { now: NOW, match: { similarity: 0.9 } }).score === 0);
check("Aehnlichkeit verstaerkt NUR nach bestandenem Gate", s.personalRelevance(bundGesetz, cem, { now: NOW, match: { similarity: 0.9 } }).score >= s.personalRelevance(bundGesetz, cem, { now: NOW }).score);
check("leeres Profil => Relevanz 0 (kein Crash, Naehe-Gate greift)", s.personalRelevance(bundGesetz, {}, { now: NOW }).score === 0);
// Dynamik: neu+frisch+geclustert > abgeschlossen+alt+einzeln
const bewegt = { id: "d1", status: "neu", source_document_count: 4, ausschuesse: ["Arbeit und Soziales"], sources: [{ published_at: iso(1 * H) }] };
const ruht = { id: "d2", status: "abgeschlossen", source_document_count: 1, ausschuesse: ["Arbeit und Soziales"], sources: [{ published_at: iso(12 * D) }] };
check("gleiche Naehe: bewegter Vorgang relevanter als ruhender", s.personalRelevance(bewegt, cem, { now: NOW }).score > s.personalRelevance(ruht, cem, { now: NOW }).score);
check("Dynamik: neu+frisch > abgeschlossen+alt", s.dynamicsScore(bewegt, NOW) > s.dynamicsScore(ruht, NOW));
check("Dynamik im Bereich 0..1", s.dynamicsScore(bewegt, NOW) <= 1 && s.dynamicsScore(ruht, NOW) >= 0);

// --- 3) HANDLUNGSFAEHIGKEIT -------------------------------------------------
console.log("== 3) Handlungsfaehigkeit ==");
const actBund = s.actionability(bundGesetz, cem).score;
check("konkret handelbarer Vorgang => hohe Handlungsfaehigkeit", actBund >= 50);
check("Randnotiz ohne Schritte => niedrige Handlungsfaehigkeit", s.actionability(kommRand, cem).score < actBund - 20);
// prepareStatement (aktiv) schlaegt monitor (passiv)
const aktiv = { id: "a1", action_items_struct: [{ actionType: "prepareStatement", dueHint: "morgen" }], zeitdruck: "hoch" };
const passiv = { id: "a2", action_items_struct: [{ actionType: "monitor" }], zeitdruck: "keiner" };
check("aktive Handlung (prepareStatement) > passive (monitor)", s.actionability(aktiv, cem).factors.steps > s.actionability(passiv, cem).factors.steps);
check("Frist/Zeitdruck erhoeht Zeitfenster-Faktor", s.actionability(aktiv, cem).factors.timeWindow > s.actionability(passiv, cem).factors.timeWindow);
check("eigener Ausschuss => voller Mandats-Hebel", s.actionability(bundGesetz, cem).factors.handle === 1.0);
check("fremder Ausschuss => geringerer Hebel", s.actionability(bundGesetz, fremd).factors.handle < 1.0);
check("konkreter Kommunikationskanal erhoeht Kanal-Faktor", s.actionability(bundGesetz, cem).factors.channel > 0.6);
check("Kanal-Passung (preferredChannels 'presse') hebt Kanal-Faktor", s.actionability(bundGesetz, { ...cem, preferredChannels: ["presse"] }).factors.channel > s.actionability(bundGesetz, cem).factors.channel);
check("ohne Profil => neutraler Mandats-Hebel (KO-intrinsisch)", s.actionability(aktiv, {}).factors.handle === 0.3);

// --- 4) DIE DREI DIMENSIONEN SIND WIRKLICH VERSCHIEDEN ----------------------
console.log("== 4) Dimensionen sind entkoppelt (Kern der Sprint-These) ==");
// Global wichtig, aber fuer Fremd persoenlich irrelevant:
check("global wichtig, aber persoenlich irrelevant moeglich", impBund >= 70 && relFremd.score < 25);
// Persoenlich nah, aber kaum handelbar (kein Schritt/Kanal/Frist):
const nahAberPassiv = { id: "np", status: "beobachtung", ausschuesse: ["Arbeit und Soziales"], source_document_count: 1, sources: [{ published_at: iso(20 * H) }] };
const rnp = s.personalRelevance(nahAberPassiv, cem, { now: NOW }).score;
const anp = s.actionability(nahAberPassiv, cem).score;
check("persoenlich relevant, aber wenig handelbar moeglich", rnp > 0 && anp < 35);
// Dritte Richtung: konkret handelbar, aber global unwichtig (kommunal, wenig belegt).
const handelbarNurKO = { id: "hn", decision_level: "kommune", event_type: "sonstiges", source_document_count: 1, zeitdruck: "hoch", action_items_struct: [{ actionType: "prepareStatement", dueHint: "heute" }], recommended_communication_struct: { recommendedChannel: "press", recommendedFormat: "statement" }, risk_of_no_action: "x" };
check("handlungsfaehig hoch, aber global unwichtig moeglich", s.actionability(handelbarNurKO, fremd).score > 40 && s.globalImportance(handelbarNurKO).score < 35);
check("scoreVorgang liefert alle drei Dimensionen getrennt", (() => {
  const t = s.scoreVorgang(bundGesetz, cem, { now: NOW });
  return typeof t.importance === "number" && typeof t.relevance === "number" && typeof t.actionability === "number" && t.importance !== t.actionability;
})());

// --- 5) RANKING je Tab ------------------------------------------------------
console.log("== 5) Ranking je Tab nach eigener Dimension ==");
const pool = [kommRand, bundGesetz, euVo, personKO, nahAberPassiv];
const lage = s.rankForLage(pool, { now: NOW });
check("Lage: wichtigster Vorgang zuerst (bund)", lage[0].ko.id === "ko-bund");
check("Lage: nach Wichtigkeit absteigend sortiert", lage.every((x, i) => i === 0 || lage[i - 1].importance >= x.importance));
// Echter Profilunabhaengigkeits-Nachweis: ein UEBERGEBENES Profil aendert Reihenfolge UND
// Scores der Lage NICHT (rankForLage ignoriert es bewusst).
check("Lage: profilunabhaengig (uebergebenes Profil aendert Reihenfolge/Scores NICHT)",
  JSON.stringify(s.rankForLage(pool, { now: NOW, profile: cem }).map((x) => [x.ko.id, x.importance]))
  === JSON.stringify(lage.map((x) => [x.ko.id, x.importance])));
const radar = s.rankForRadar(pool, cem, { now: NOW });
check("Radar: nur Vorgaenge mit persoenlicher Naehe (score>0)", radar.every((x) => x.relevance > 0));
check("Radar: unbezogene kommunale Randnotiz faellt raus", !radar.some((x) => x.ko.id === "ko-komm"));
check("Radar: nach Relevanz absteigend", radar.every((x, i) => i === 0 || radar[i - 1].relevance >= x.relevance));
check("Radar: leeres Profil => leere Liste (Naehe-Gate, kein Crash)", s.rankForRadar(pool, {}, { now: NOW }).length === 0);
const helmut = s.rankForHelmut(pool, cem, { now: NOW, floor: 1 });
check("Helmut: bestes Handlungssignal zuerst (bund)", helmut[0].ko.id === "ko-bund");
check("Helmut: nach Handlungsfaehigkeit absteigend", helmut.every((x, i) => i === 0 || helmut[i - 1].actionability >= x.actionability));
// Echte Entkopplung: die GETEILTEN Vorgaenge (Schnittmenge) werden in Lage anders gereiht
// als im Radar — nicht bloss unterschiedlich lang wegen des Radar-Naehe-Filters.
const sharedInLageOrder = lage.map((x) => x.ko.id).filter((id) => radar.some((r) => r.ko.id === id));
const sharedInRadarOrder = radar.map((x) => x.ko.id);
check("Entkopplung: geteilte Vorgaenge in Lage anders gereiht als im Radar", JSON.stringify(sharedInLageOrder) !== JSON.stringify(sharedInRadarOrder));
check("Lage-Top (Wichtigkeit) != Radar-Top (Relevanz)", lage[0].ko.id !== radar[0].ko.id);

// --- 6) FRISCHE + DREI LEERZUSTAENDE ---------------------------------------
console.log("== 6) Drei klar unterscheidbare Leerzustaende ==");
// gap: gar keine Daten
const gap = s.tabEmptyState("lage", { kos: [], hasRankedItems: false, now: NOW });
check("Leerzustand gap: kind=gap bei keinen Daten", gap.kind === "gap");
check("Leerzustand gap: reason=datenluecke", gap.reason === "datenluecke");
check("Leerzustand gap: freshness.hasData=false", gap.freshness.hasData === false);
// stale: Daten vorhanden, aber alt
const stale = s.tabEmptyState("radar", { kos: [kommRand], hasRankedItems: false, now: NOW });
check("Leerzustand stale: kind=stale bei veralteten Daten", stale.kind === "stale");
check("Leerzustand stale: nennt Alter der juengsten Quelle", /\d+\s*h/.test(stale.detail));
check("Leerzustand stale: isStale=true, hasData=true", stale.freshness.isStale === true && stale.freshness.hasData === true);
// quiet: frische Daten, aber fuer den Tab nichts Passendes
const quietLage = s.tabEmptyState("lage", { kos: [kommRand], hasRankedItems: false, now: NOW, staleHours: 24 * 30 });
check("Leerzustand quiet: kind=quiet bei frischen Daten ohne Treffer", quietLage.kind === "quiet");
check("Leerzustand quiet Lage: reason ruhige-lage", quietLage.reason === "ruhige-lage");
const quietRadar = s.tabEmptyState("radar", { kos: [bundGesetz], hasRankedItems: false, now: NOW + H });
check("Leerzustand quiet Radar: eigener reason (kein-umfeldsignal)", quietRadar.reason === "kein-umfeldsignal");
const quietHelmut = s.tabEmptyState("helmut", { kos: [bundGesetz], hasRankedItems: false, now: NOW + H });
check("Leerzustand quiet Helmut: eigener reason (kein-handlungsbedarf)", quietHelmut.reason === "kein-handlungsbedarf");
check("drei Tabs liefern DREI unterscheidbare quiet-reasons", new Set([quietLage.reason, quietRadar.reason, quietHelmut.reason]).size === 3);
check("gap/stale/quiet sind drei unterscheidbare kinds", new Set([gap.kind, stale.kind, quietLage.kind]).size === 3);
check("hasRankedItems=true => KEIN Leerzustand (null)", s.tabEmptyState("lage", { kos: [bundGesetz], hasRankedItems: true, now: NOW }) === null);
// Datenluecke NIE mit ruhig verwechseln: gap/stale-Text warnt, quiet-Text beruhigt
check("gap-Text warnt vor Ausfall (nicht 'ruhig')", /Datenausfall|Backlog|prüfen/i.test(gap.detail));
check("quiet-Text stellt klar: keine Datenluecke", /keine Datenlücke|nichts ausgefallen|kein Datenausfall|wirklich ruhig/i.test(quietLage.detail + quietRadar.detail + quietHelmut.detail));

// --- 7) Frische-Assessment --------------------------------------------------
console.log("== 7) Frische-Assessment ==");
const frFresh = s.assessFreshness([bundGesetz], { now: NOW });
check("frische Quelle => isFresh=true", frFresh.isFresh === true && frFresh.isStale === false);
const frStale = s.assessFreshness([kommRand], { now: NOW });
check("alte Quelle => isStale=true", frStale.isStale === true);
check("newestAgeHours wird berechnet", typeof frFresh.newestAgeHours === "number" && frFresh.newestAgeHours >= 0);
check("keine Daten => hasData=false, isFresh=false", s.assessFreshness([], { now: NOW }).hasData === false);
// Edge (Verify): Vorgang vorhanden, aber OHNE jeden Zeitstempel -> als stale werten (nicht
// quiet!), damit ein fehlender Zeitstempel nie als 'frisch/ruhig' durchgeht.
const noTs = { id: "ko-nots", status: "neu", source_document_count: 1 };
const frNoTs = s.assessFreshness([noTs], { now: NOW });
check("kein Zeitstempel: hasData=true, isStale=true, newestAgeHours=null", frNoTs.hasData === true && frNoTs.isStale === true && frNoTs.newestAgeHours === null);
const esNoTs = s.tabEmptyState("lage", { kos: [noTs], hasRankedItems: false, now: NOW });
check("kein Zeitstempel: Leerzustand kind=stale (nicht quiet)", esNoTs.kind === "stale");
check("kein Zeitstempel: Detail nennt 'unbekannt'", /unbekannt/.test(esNoTs.detail));

// --- 8) Determinismus + Flag ------------------------------------------------
console.log("== 8) Determinismus + Flag ==");
check("gleiche Eingabe => gleiche Wichtigkeit (deterministisch)", s.globalImportance(bundGesetz).score === s.globalImportance(bundGesetz).score);
check("gleiche Eingabe => gleiche Relevanz", s.personalRelevance(bundGesetz, cem, { now: NOW }).score === s.personalRelevance(bundGesetz, cem, { now: NOW }).score);
check("scoringMode default off (kein Live-Effekt ohne Freigabe)", s.scoringMode({}) === "off");
check("scoringMode on erkannt", s.scoringMode({ HELMUT_SCORING_MODE: "on" }) === "on");
check("scoringMode shadow erkannt", s.scoringMode({ HELMUT_SCORING_MODE: "shadow" }) === "shadow");
check("scoringActive nur bei on", s.scoringActive({ HELMUT_SCORING_MODE: "on" }) === true && s.scoringActive({ HELMUT_SCORING_MODE: "shadow" }) === false);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
