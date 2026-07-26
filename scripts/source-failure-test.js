"use strict";

// Helmut — Phase 1, Punkt 16: Testsuite der automatischen Quellenstörungserkennung.
// ============================================================================
// Deckt die 26 verbindlich geforderten Fälle ab. Der Schwerpunkt liegt bewusst
// NICHT nur auf „erkennt die Störung", sondern zu gleichen Teilen auf
// „erzeugt KEINEN Fehlalarm" — ein Betriebsbericht, der bei jeder Kleinigkeit
// rot wird, wird nicht gelesen und ist damit wertlos.
//
// Alle Fixtures sind neutral (weg-a, quelle-1, paket-x). Es werden bewusst
// KEINE echten Mandanten-, Personen- oder Production-Quellenkennungen
// verwendet (CLAUDE.md §4.2).

const sf = require("../lib/helmut/quellenarchitektur/source-failure");
const { STOERUNGSKLASSEN: K, HANDLUNGSSTUFEN: H } = sf;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  FEHLGESCHLAGEN: ${name}${detail ? ` — ${detail}` : ""}`);
}
function gruppe(titel) { console.log(`\n── ${titel} ──`); }

const TAG = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-26T12:00:00Z");

// --- Fixture-Helfer ---------------------------------------------------------
// Erzeugt eine Telemetriezeile im Format der echten Tabelle source_crawl_telemetry.
function lauf(sourceId, tageZurueck, art, extra = {}) {
  const created = new Date(NOW - tageZurueck * TAG).toISOString();
  const basis = { source_id: sourceId, created_at: created, run_id: `run-${tageZurueck}`, duration_ms: extra.dauer != null ? extra.dauer : 500, retry_count: 0 };
  switch (art) {
    case "lieferung": return { ...basis, status: "ok", found_documents: extra.docs != null ? extra.docs : 3, new_documents: 1, error_code: null };
    case "leer": return { ...basis, status: "empty", found_documents: 0, new_documents: 0, error_code: null };
    case "leer-ok": return { ...basis, status: "ok", found_documents: 0, new_documents: 0, error_code: null };
    case "fehler": return { ...basis, status: "error", found_documents: 0, new_documents: 0, error_code: extra.code || "unknown" };
    case "gedrosselt": return { ...basis, status: "circuit-open", found_documents: 0, new_documents: 0, error_code: "circuit-open" };
    case "uebersprungen": return { ...basis, status: "skipped-shared", found_documents: 0, new_documents: 0, error_code: null };
    default: throw new Error(`unbekannte Laufart ${art}`);
  }
}
// Erzeugt eine Serie: reihe("q", [[10,"lieferung"],[9,"fehler"]])
function reihe(sourceId, eintraege) {
  return eintraege.map(([tage, art, extra]) => lauf(sourceId, tage, art, extra || {}));
}
function weg(id, extra = {}) {
  return { id, legacy_source_id: extra.legacy || id, name: extra.name || id, method: extra.method || "rss",
    status: extra.status || "needs_review", activation_mode: extra.mode || "auto",
    is_critical: extra.kritisch === true, expected_frequency: extra.freq || null, publisher_id: extra.pub || "pub-1" };
}
// Klassifiziert EINE Quelle aus einer Telemetrieserie.
function klassifiziere(sourceId, zeilen, w = null, schwellen = null) {
  const s = schwellen || sf.stoerungsSchwellen({});
  const historien = sf.buildLaufhistorie(zeilen, { now: NOW, schwellen: s });
  return sf.klassifiziereQuelle({ sourceId, historie: historien.get(sourceId) || null, weg: w, schwellen: s, now: NOW });
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("1 · Erfolgreicher Lauf mit Dokumenten");
{
  const r = klassifiziere("q1", reihe("q1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "lieferung"], [1, "lieferung"], [0.2, "lieferung"]]), weg("q1"));
  check("erfolgreiche Serie -> ok", r.klasse === K.OK, r.klasse);
  check("erfolgreich -> kein Handlungsbedarf", sf.handlungsstufe(r) === H.KEINE);
  check("erfolgreich -> letzte Lieferung gesetzt", r.letzteLieferungAt != null);
  check("erfolgreich -> kein Problembeginn", r.problemSeit === null);
}

gruppe("2 · Einzelner leerer Lauf erzeugt KEINEN Fehlalarm");
{
  const r = klassifiziere("q2", reihe("q2", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "lieferung"], [1, "lieferung"], [0.2, "leer"]]), weg("q2"));
  check("ein einzelner Leerlauf -> ok (kein Fehlalarm)", r.klasse === K.OK, r.klasse);
  check("ein einzelner Leerlauf -> keine Handlung", sf.handlungsstufe(r) === H.KEINE);
}
{
  // Auch ein status='ok' MIT 0 Dokumenten ist ein Leerlauf, kein Erfolg mit Inhalt.
  const r = klassifiziere("q2b", reihe("q2b", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "leer-ok"]]), weg("q2b"));
  check("status=ok mit 0 Dokumenten zählt als Leerlauf, nicht als Lieferung", r.laufdaten.lieferungen === 3 && r.laufdaten.leerlaeufe === 1);
}

gruppe("3 · Wiederholte Leerläufe -> 'leer'");
{
  const r = klassifiziere("q3", reihe("q3", [[20, "lieferung"], [12, "lieferung"], [11, "lieferung"], [10, "lieferung"],
    [6, "leer"], [4, "leer"], [2, "leer"], [0.5, "leer"]]), weg("q3", { freq: "daily" }));
  check("4 Leerläufe über 10 Tage bei täglichem Rhythmus -> leer", r.klasse === K.LEER, r.klasse);
  check("leer -> Problembeginn gesetzt", r.problemSeit != null);
  check("leer -> Wiederholungen gezählt", r.wiederholungen === 4, String(r.wiederholungen));
  check("leer -> Erklärung nennt die Zahl der Läufe", /4 geplanten Läufen/.test(r.erklaerung), r.erklaerung);
}

gruppe("4 · Legitimer Leerlauf bei selten aktualisierter Quelle (KEIN Fehlalarm)");
{
  // Wöchentliche Quelle, mehrfach täglich gecrawlt: 8 Leerläufe in 2 Tagen.
  const zeilen = reihe("q4", [[3, "lieferung"], [2, "leer"], [1.8, "leer"], [1.5, "leer"], [1.2, "leer"],
    [0.9, "leer"], [0.6, "leer"], [0.3, "leer"], [0.1, "leer"]]);
  const r = klassifiziere("q4", zeilen, weg("q4", { freq: "weekly" }));
  check("wöchentliche Quelle, 8 Leerläufe in 3 Tagen -> KEIN Befund", r.klasse === K.OK, r.klasse);
  check("wöchentliche Quelle -> keine Handlung", sf.handlungsstufe(r) === H.KEINE);
  // Gegenprobe: dieselbe Serie an einer TÄGLICHEN Quelle bleibt ebenfalls ruhig
  // (3 Tage < 3-Tage-Erwartung), erst deutlich später wird sie auffällig.
  const rTaeglich = klassifiziere("q4", zeilen, weg("q4", { freq: "daily" }));
  check("tägliche Quelle, erst 3 Tage ohne Lieferung -> noch kein Befund", rTaeglich.klasse === K.OK, rTaeglich.klasse);
}
{
  // Historisch abgeleiteter Rhythmus, wenn expected_frequency fehlt (Production:
  // alle 163 Wege haben NULL). Lieferungen alle ~5 Tage -> Erwartung 15 Tage.
  const zeilen = reihe("q4b", [[25, "lieferung"], [20, "lieferung"], [15, "lieferung"], [10, "lieferung"], [5, "lieferung"],
    [3, "leer"], [2, "leer"], [1, "leer"], [0.2, "leer"]]);
  const s = sf.stoerungsSchwellen({}, { fensterTage: 30 });
  const r = klassifiziere("q4b", zeilen, weg("q4b", { freq: null }), s);
  check("ohne hinterlegten Rhythmus wird der beobachtete genutzt -> kein Fehlalarm", r.klasse === K.OK, r.klasse);
  const erw = sf.veraltetSchwelleTage(weg("q4b"), sf.buildLaufhistorie(zeilen, { now: NOW, schwellen: s }).get("q4b"), s);
  check("Erwartung stammt aus dem beobachteten Lieferrhythmus", erw.grundlage === "beobachteter Lieferrhythmus", erw.grundlage);
  check("Erwartung ≈ 3× Medianabstand (15 Tage)", Math.round(erw.tage) === 15, String(erw.tage));
}

gruppe("5 · Veraltete Quelle (Rhythmus + letzte Lieferung)");
{
  const r = klassifiziere("q5", reihe("q5", [[13, "lieferung"], [10, "leer"], [6, "leer"], [3, "lieferung"], [0.2, "leer"]]),
    weg("q5", { freq: "daily" }));
  check("letzte Lieferung 3 Tage her bei täglicher Erwartung -> noch ok", r.klasse === K.OK, r.klasse);
  const r2 = klassifiziere("q5b", reihe("q5b", [[13, "lieferung"], [10, "leer"], [6, "leer"], [0.2, "leer"]]),
    weg("q5b", { freq: "daily" }));
  check("letzte Lieferung 13 Tage her bei täglicher Erwartung -> leer/veraltet",
    r2.klasse === K.LEER || r2.klasse === K.VERALTET, r2.klasse);
  // Reine Veraltung ohne Leerlaufserie: letzte Läufe sind Lieferungen aus der
  // Vergangenheit, danach nur noch übersprungene Läufe -> keine Leerserie.
  const r3 = klassifiziere("q5c", reihe("q5c", [[40, "lieferung"], [38, "lieferung"], [36, "lieferung"], [34, "lieferung"], [32, "lieferung"], [30, "lieferung"], [2, "leer"]]),
    weg("q5c", { freq: "daily" }), sf.stoerungsSchwellen({}, { fensterTage: 60 }));
  check("30 Tage keine Lieferung, keine Leerserie -> veraltet", r3.klasse === K.VERALTET, r3.klasse);
  check("veraltet nennt die erwartete Pause", r3.erwartungTage != null && /Tage zurück/.test(r3.erklaerung), r3.erklaerung);
}

gruppe("6 · Rate Limit (HTTP 429) — unterscheidbar vom allgemeinen Abruffehler");
{
  const r = klassifiziere("q6", reihe("q6", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "http-429" }], [1, "fehler", { code: "http-429" }], [0.2, "fehler", { code: "http-429" }]]), weg("q6"));
  check("429-Serie -> blockiert", r.klasse === K.BLOCKIERT, r.klasse);
  check("429 -> Ursache http-429", r.ursache === "http-429", r.ursache);
  check("429 -> verständlicher Ursachentext", /begrenzt/.test(r.ursacheText || ""), r.ursacheText);
  check("429 ist NICHT abruffehler", r.klasse !== K.ABRUFFEHLER);
}

gruppe("7 · HTTP-Blockierung (4xx)");
{
  const r = klassifiziere("q7", reihe("q7", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "http-4xx" }], [0.2, "fehler", { code: "http-4xx" }]]), weg("q7"));
  check("4xx-Serie -> blockiert", r.klasse === K.BLOCKIERT, r.klasse);
  check("4xx -> Ursache http-4xx", r.ursache === "http-4xx");
}

gruppe("8 · Timeout");
{
  const r = klassifiziere("q8", reihe("q8", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }], [0.2, "fehler", { code: "timeout" }]]), weg("q8"));
  check("Timeout-Serie -> langsam", r.klasse === K.LANGSAM, r.klasse);
  check("Timeout -> Ursache timeout", r.ursache === "timeout");
  check("Timeout -> 3 Wiederholungen", r.wiederholungen === 3, String(r.wiederholungen));
  check("Timeout -> Problembeginn ist der ERSTE Fehler der Serie",
    Math.abs(r.problemSeit - (NOW - 2 * TAG)) < 1000, new Date(r.problemSeit).toISOString());
}

gruppe("9 · Langsamer, aber erfolgreicher Lauf");
{
  const r = klassifiziere("q9", reihe("q9", [[6, "lieferung", { dauer: 400 }], [5, "lieferung", { dauer: 400 }],
    [4, "lieferung", { dauer: 400 }], [3, "lieferung", { dauer: 400 }],
    [2, "lieferung", { dauer: 12000 }], [1.5, "lieferung", { dauer: 12000 }], [1, "lieferung", { dauer: 12000 }],
    [0.7, "lieferung", { dauer: 12000 }], [0.4, "lieferung", { dauer: 12000 }], [0.2, "lieferung", { dauer: 12000 }]]), weg("q9"));
  check("6 von 10 Läufen über dem Grenzwert -> langsam", r.klasse === K.LANGSAM, r.klasse);
  check("langsam -> Ursache laufzeit (kein Timeout)", r.ursache === "laufzeit", r.ursache);
  check("langsam -> nur beobachten", sf.handlungsstufe(r) === H.BEOBACHTEN);
  check("langsam aus Laufzeit trägt die Versorgung weiter", sf.istWirksam(r) === true);
  // Production-Gegenprobe 2026-07-26: 'langsam' entsteht auch aus einer
  // TIMEOUT-Serie. Dann liefert die Quelle gar nichts und darf NICHT auf
  // „beobachten" heruntergestuft werden, nur weil die Klasse gleich heißt.
  const rTimeout = klassifiziere("q9c", reihe("q9c", [[6, "lieferung"], [5, "lieferung"], [4, "lieferung"],
    [3, "fehler", { code: "timeout" }], [2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }],
    [0.2, "fehler", { code: "timeout" }]]), weg("q9c"));
  check("langsam aus Timeout-Serie -> gleiche Klasse", rTimeout.klasse === K.LANGSAM);
  check("langsam aus Timeout-Serie -> zeitnah prüfen (nicht nur beobachten)",
    sf.handlungsstufe(rTimeout) === H.ZEITNAH, sf.handlungsstufe(rTimeout));
  check("langsam aus Timeout-Serie trägt die Versorgung NICHT", sf.istWirksam(rTimeout) === false);
  check("Timeout-Serie bei Pflichtquelle -> akut", sf.handlungsstufe({ ...rTimeout, kritisch: true }) === H.AKUT);
}
{
  // FEHLALARMBREMSE: eine konstant schnelle Quelle darf nie „langsam" heißen.
  const r = klassifiziere("q9b", reihe("q9b", [[5, "lieferung", { dauer: 300 }], [4, "lieferung", { dauer: 900 }],
    [3, "lieferung", { dauer: 400 }], [2, "lieferung", { dauer: 1100 }], [0.2, "lieferung", { dauer: 350 }]]), weg("q9b"));
  check("300 ms -> 1 100 ms ist KEIN Befund (Bodenschwelle)", r.klasse === K.OK, r.klasse);
}

gruppe("10 · Parserfehler nach erfolgreichem Abruf");
{
  const r = klassifiziere("q10", reihe("q10", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "parse" }], [0.2, "fehler", { code: "parse" }]]), weg("q10"));
  check("parse-Serie -> parserfehler", r.klasse === K.PARSERFEHLER, r.klasse);
  check("parserfehler ist von Netzwerkfehlern unterscheidbar", r.klasse !== K.ABRUFFEHLER && r.ursache === "parse");
  check("parserfehler -> verständlicher Text", /nicht mehr lesen/.test(r.ursacheText || ""), r.ursacheText);
}

gruppe("11 · Allgemeiner Abruffehler (unklare Ursache -> ehrlich unspezifisch)");
{
  const r = klassifiziere("q11", reihe("q11", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]), weg("q11"));
  check("5xx-Serie -> abruffehler", r.klasse === K.ABRUFFEHLER, r.klasse);
  const r2 = klassifiziere("q11b", reihe("q11b", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: null }], [0.2, "fehler", { code: null }]]), weg("q11b"));
  check("unbekannter Code -> abruffehler statt erfundener Präzision", r2.klasse === K.ABRUFFEHLER, r2.klasse);
  check("unbekannter Code -> Ursache 'unknown'", r2.ursache === "unknown", r2.ursache);
  check("unbekannter Code -> Text sagt ausdrücklich 'nicht eindeutig bestimmbar'", /nicht eindeutig bestimmbar/.test(r2.ursacheText || ""));
}

gruppe("12 · Wiederholte Instabilität");
{
  const r = klassifiziere("q12", reihe("q12", [[10, "lieferung"], [9, "fehler", { code: "http-5xx" }], [8, "lieferung"],
    [7, "lieferung"], [6, "fehler", { code: "http-5xx" }], [5, "lieferung"], [4, "lieferung"],
    [3, "fehler", { code: "http-5xx" }], [2, "lieferung"], [0.2, "lieferung"]]), weg("q12"));
  check("3 getrennte Ausfälle -> instabil", r.klasse === K.INSTABIL, r.klasse);
  check("instabil -> Episodenzahl belegt", r.laufdaten.episoden === 3, String(r.laufdaten.episoden));
  check("instabil -> nur beobachten (keine akute Meldung)", sf.handlungsstufe(r) === H.BEOBACHTEN);
  check("instabil schlägt 'erholt', obwohl der letzte Lauf ok war", r.klasse !== K.ERHOLT);
  // Gegenprobe: 18 Timeouts AM STÜCK sind EINE Episode -> akut, nicht instabil.
  const lang = [];
  for (let i = 18; i >= 1; i--) lang.push([i * 0.1, "fehler", { code: "timeout" }]);
  const r2 = klassifiziere("q12b", reihe("q12b", [[10, "lieferung"], [9, "lieferung"], ...lang]), weg("q12b"));
  check("18 Fehler am Stück = EINE Episode -> akute Klasse statt instabil", r2.klasse === K.LANGSAM, r2.klasse);
  check("18 Fehler am Stück -> 18 Wiederholungen", r2.wiederholungen === 18, String(r2.wiederholungen));
}

gruppe("13 · Deaktivierte Quelle ist kein technischer Fehler");
{
  for (const st of ["paused", "archived"]) {
    const r = klassifiziere("q13", reihe("q13", [[3, "fehler", { code: "timeout" }], [2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]), weg("q13", { status: st }));
    check(`status=${st} -> inaktiv (trotz Fehlerserie)`, r.klasse === K.INAKTIV, r.klasse);
    check(`status=${st} -> kein Handlungsbedarf`, sf.handlungsstufe(r) === H.KEINE);
  }
  const rDev = klassifiziere("q13b", reihe("q13b", [[3, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]), weg("q13b", { mode: "dev_only" }));
  check("activation_mode=dev_only -> inaktiv", rDev.klasse === K.INAKTIV, rDev.klasse);
}

gruppe("14 · Bewusst manuelle Quelle");
{
  const r = klassifiziere("q14", reihe("q14", [[5, "leer"], [4, "leer"], [3, "leer"], [2, "leer"]]), weg("q14", { mode: "manual" }));
  check("activation_mode=manual -> manuell", r.klasse === K.MANUELL, r.klasse);
  check("manuell -> kein Handlungsbedarf", sf.handlungsstufe(r) === H.KEINE);
  check("manuell -> Erklärung nennt die Absicht", /bewusst/.test(r.erklaerung));
}

gruppe("15 · Noch nie erfolgreich gelaufene Quelle");
{
  const r = klassifiziere("q15", reihe("q15", [[5, "fehler", { code: "http-4xx" }], [4, "fehler", { code: "http-4xx" }],
    [3, "fehler", { code: "http-4xx" }], [2, "fehler", { code: "http-4xx" }]]), weg("q15"));
  check("nie erfolgreich -> nie_erfolgreich (nicht 'blockiert')", r.klasse === K.NIE_ERFOLGREICH, r.klasse);
  check("nie_erfolgreich -> letzter Erfolg ist null", r.letzterErfolgAt === null);
  check("nie_erfolgreich -> Erklärung unterscheidet ausdrücklich von 'ausgefallen'",
    /nie geliefert/.test(r.erklaerung), r.erklaerung);
  // Abgrenzung: früher erfolgreich, jetzt ausgefallen -> NICHT nie_erfolgreich.
  const r2 = klassifiziere("q15b", reihe("q15b", [[10, "lieferung"], [9, "lieferung"], [8, "lieferung"],
    [2, "fehler", { code: "http-4xx" }], [1, "fehler", { code: "http-4xx" }]]), weg("q15b"));
  check("früher erfolgreich, jetzt ausgefallen -> blockiert statt nie_erfolgreich", r2.klasse === K.BLOCKIERT, r2.klasse);
  check("ausgefallene Quelle hat einen letzten Erfolg", r2.letzterErfolgAt != null);
}

gruppe("16 · Erholte Quelle");
{
  const r = klassifiziere("q16", reihe("q16", [[10, "lieferung"], [8, "fehler", { code: "timeout" }],
    [7, "fehler", { code: "timeout" }], [6, "fehler", { code: "timeout" }], [2, "lieferung"], [0.2, "lieferung"]]), weg("q16"));
  check("Störung + spätere Lieferung -> erholt", r.klasse === K.ERHOLT, r.klasse);
  check("erholt -> Erholungsflag gesetzt", r.erholt === true);
  check("erholt -> kein akuter Alarm mehr", sf.handlungsstufe(r) === H.KEINE);
  check("erholt -> Historie bleibt sichtbar (Fehler bleiben gezählt)", r.laufdaten.fehler === 3, String(r.laufdaten.fehler));
}
{
  // §13: eine rein TECHNISCHE Antwort ohne Inhalt ist KEINE volle Erholung.
  const r = klassifiziere("q16b", reihe("q16b", [[12, "lieferung"], [8, "fehler", { code: "timeout" }],
    [7, "fehler", { code: "timeout" }], [6, "fehler", { code: "timeout" }],
    [4, "leer"], [3, "leer"], [2, "leer"], [0.2, "leer"]]), weg("q16b", { freq: "daily" }));
  check("technisch ok, aber ohne Inhalt -> NICHT als erholt gemeldet", r.klasse !== K.ERHOLT, r.klasse);
  check("technisch ok ohne Inhalt -> leer/veraltet", r.klasse === K.LEER || r.klasse === K.VERALTET, r.klasse);
}

gruppe("17 · Erneut ausgefallen nach Erholung");
{
  const vorher = [{ sourceId: "q17", klasse: K.ERHOLT, stufe: H.KEINE, ursache: null, wirkung: { pakete: [] } }];
  const jetzt = [{ sourceId: "q17", klasse: K.BLOCKIERT, stufe: H.ZEITNAH, ursache: "http-429", wirkung: { pakete: [] } }];
  const m = sf.diffAlarme(vorher, jetzt);
  check("erholt -> erneut gestört ergibt genau eine Meldung", m.length === 1, String(m.length));
  check("Rückfall wird als 'erneut' gekennzeichnet", m[0] && m[0].art === sf.AENDERUNG.ERNEUT, m[0] && m[0].art);
}

gruppe("18 · Kein doppelter Alarm bei unverändertem Zustand");
{
  const befund = { sourceId: "q18", klasse: K.BLOCKIERT, stufe: H.ZEITNAH, ursache: "http-429", wirkung: { pakete: [{ key: "paket-a" }] } };
  const sig = sf.alarmSignatur(befund);
  const m = sf.diffAlarme([{ ...befund, signatur: sig }], [{ ...befund, signatur: sig }]);
  check("identischer Zustand -> KEINE neue Meldung", m.length === 0, JSON.stringify(m));
  // Auch über drei Läufe hinweg darf nichts erneut gemeldet werden.
  const m2 = sf.diffAlarme([{ ...befund, signatur: sig }], [{ ...befund, signatur: sig }]);
  check("dritter Lauf mit gleichem Zustand -> weiterhin keine Meldung", m2.length === 0);
  // Signatur ist stabil und unabhängig von der Paketreihenfolge.
  const a = sf.alarmSignatur({ klasse: K.LEER, ursache: null, stufe: H.BEOBACHTEN, wirkung: { pakete: [{ key: "b" }, { key: "a" }] } });
  const b = sf.alarmSignatur({ klasse: K.LEER, ursache: null, stufe: H.BEOBACHTEN, wirkung: { pakete: [{ key: "a" }, { key: "b" }] } });
  check("Signatur ist reihenfolgeunabhängig", a === b, `${a} vs ${b}`);
}

gruppe("19 · Neue Meldung bei relevanter Zustandsverschärfung");
{
  const basis = { sourceId: "q19", klasse: K.LEER, ursache: null, wirkung: { pakete: [{ key: "paket-a" }] } };
  const m1 = sf.diffAlarme([{ ...basis, stufe: H.BEOBACHTEN }], [{ ...basis, stufe: H.AKUT }]);
  check("beobachten -> akut ergibt eine Meldung", m1.length === 1 && m1[0].art === sf.AENDERUNG.VERSCHAERFT, JSON.stringify(m1.map((x) => x.art)));
  const m2 = sf.diffAlarme([{ ...basis, stufe: H.AKUT }], [{ ...basis, stufe: H.BEOBACHTEN }]);
  check("akut -> beobachten wird als Entschärfung gemeldet", m2.length === 1 && m2[0].art === sf.AENDERUNG.ENTSCHAERFT);
  const m3 = sf.diffAlarme(
    [{ sourceId: "q19", klasse: K.ABRUFFEHLER, ursache: "http-5xx", stufe: H.ZEITNAH, wirkung: { pakete: [{ key: "paket-a" }] } }],
    [{ sourceId: "q19", klasse: K.BLOCKIERT, ursache: "http-429", stufe: H.ZEITNAH, wirkung: { pakete: [{ key: "paket-a" }] } }]);
  check("geänderte Ursache erzeugt eine Meldung", m3.length === 1 && m3[0].art === sf.AENDERUNG.URSACHE_GEAENDERT, JSON.stringify(m3.map((x) => x.art)));
  const m4 = sf.diffAlarme(
    [{ sourceId: "q19", klasse: K.LEER, ursache: null, stufe: H.BEOBACHTEN, wirkung: { pakete: [{ key: "paket-a" }] } }],
    [{ sourceId: "q19", klasse: K.LEER, ursache: null, stufe: H.BEOBACHTEN, wirkung: { pakete: [{ key: "paket-a" }, { key: "paket-b" }] } }]);
  check("zusätzlich betroffenes Paket erzeugt eine Meldung", m4.length === 1 && m4[0].art === sf.AENDERUNG.AUSGEWEITET);
  const m5 = sf.diffAlarme(
    [{ sourceId: "q19", klasse: K.BLOCKIERT, ursache: "http-429", stufe: H.ZEITNAH, wirkung: { pakete: [] } }],
    [{ sourceId: "q19", klasse: K.OK, ursache: null, stufe: H.KEINE, wirkung: { pakete: [] } }]);
  check("gestört -> gesund wird als Erholung gemeldet", m5.length === 1 && m5[0].art === sf.AENDERUNG.ERHOLT);
}

// ════════════════════════════════════════════════════════════════════════════
// Gesamtbericht-Fälle (Paket-/Mandatswirkung)
// ════════════════════════════════════════════════════════════════════════════
const PAKETE = [
  { id: "pkg-bund", key: "bund-basis", name: "Bund Basis", status: "active", is_base: true, political_level: "bund" },
  { id: "pkg-thema", key: "thema-x", name: "Thema X", status: "active", is_base: false, political_level: "bund" }
];

gruppe("20 · Paketwirkung");
{
  const wege = [weg("w1", { legacy: "s1" }), weg("w2", { legacy: "s2" })];
  const packagePaths = [
    { package_id: "pkg-bund", retrieval_path_id: "w1" },
    { package_id: "pkg-bund", retrieval_path_id: "w2" }
  ];
  const telemetrie = [
    ...reihe("s1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]),
    ...reihe("s2", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]])
  ];
  const b = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: wege, packages: PAKETE, packagePaths, now: NOW });
  const s1 = b.befunde.find((x) => x.sourceId === "s1");
  check("gestörte Quelle kennt ihr Paket", s1.wirkung.pakete.some((p) => p.key === "bund-basis"), JSON.stringify(s1.wirkung.pakete));
  check("Paket ist als Basispaket erkannt", s1.wirkung.pakete[0].isBase === true);
  const lage = b.paketLage.find((p) => p.key === "bund-basis");
  check("Paket teilweise geschwächt (1 tragend, 1 gestört)", lage.versorgung === "teilweise_geschwaecht", lage.versorgung);
  check("Paketlage zählt tragende und gestörte Wege", lage.wirksam === 1 && lage.gestoert === 1);
  // Weg ohne Paketzuordnung
  const b2 = sf.bewerteQuellenstoerungen({
    telemetrie: reihe("s9", [[5, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]),
    retrievalPaths: [weg("w9", { legacy: "s9" })], packages: PAKETE, packagePaths: [], now: NOW });
  check("Weg ohne Paket -> Wirkung 'kein_paket'", b2.befunde[0].wirkung.art === "kein_paket", b2.befunde[0].wirkung.art);
}

gruppe("21 · Mandatswirkung (nur wo zuverlässig ableitbar)");
{
  const wege = [weg("w1", { legacy: "s1" })];
  const packagePaths = [{ package_id: "pkg-bund", retrieval_path_id: "w1" }];
  const telemetrie = reihe("s1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]);
  // OHNE Profile: ehrlich nicht bestimmbar, aber mit Strukturhinweis.
  const ohne = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: wege, packages: PAKETE, packagePaths, now: NOW });
  const m = ohne.befunde[0].wirkung.mandate;
  check("ohne Profile -> Mandatswirkung ausdrücklich NICHT bestimmbar", m.bestimmbar === false);
  check("ohne Profile -> Grund wird genannt", typeof m.grund === "string" && m.grund.length > 0);
  check("ohne Profile -> Strukturhinweis für Pflicht-Basispaket", /Pflicht-Basispaket/.test(m.strukturhinweis || ""), m.strukturhinweis);
  check("ohne Profile -> Summe meldet Mandatswirkung als nicht bestimmbar", ohne.summe.mandatswirkungBestimmbar === false);
  // MIT Profilen: der bestehende Resolver bestimmt die betroffenen Mandate.
  const profile = [{ id: "mandat-1", parliament: "bundestag", active: true, name: "Testmandat", party: "Fraktionslos" }];
  const mit = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: wege, packages: PAKETE, packagePaths, profiles: profile, now: NOW });
  check("mit Profilen -> Mandatswirkung ist bestimmbar", mit.befunde[0].wirkung.mandate.bestimmbar === true);
  check("mit Profilen -> Summe meldet Bestimmbarkeit", mit.summe.mandatswirkungBestimmbar === true);
}

gruppe("22 · Alternativquelle verhindert die Behauptung eines Versorgungsausfalls");
{
  const wege = [weg("w1", { legacy: "s1", kritisch: true }), weg("w2", { legacy: "s2" })];
  const packagePaths = [{ package_id: "pkg-bund", retrieval_path_id: "w1" }, { package_id: "pkg-bund", retrieval_path_id: "w2" }];
  const telemetrie = [
    ...reihe("s1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]),
    ...reihe("s2", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]])
  ];
  const b = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: wege, packages: PAKETE, packagePaths, now: NOW });
  const s1 = b.befunde.find((x) => x.sourceId === "s1");
  check("Alternative erkannt", s1.wirkung.alternativenVorhanden === true);
  check("Wirkung sagt ausdrücklich: Alternativen vorhanden",
    s1.wirkung.art === "einzelne_quelle_gestoert_alternativen_vorhanden", s1.wirkung.art);
  check("KEIN vollständiger Versorgungsausfall behauptet", s1.wirkung.art !== "paket_ohne_funktionierenden_weg");
  check("Pflichtquelle mit Alternative wird auf 'zeitnah' statt 'akut' gestuft", s1.stufe === H.ZEITNAH, s1.stufe);

  // Gegenprobe: fällt die Alternative AUCH aus, ist es ein echter Ausfall.
  const telemetrie2 = [
    ...reihe("s1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "http-5xx" }], [0.2, "fehler", { code: "http-5xx" }]]),
    ...reihe("s2", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "timeout" }], [0.2, "fehler", { code: "timeout" }]])
  ];
  const b2 = sf.bewerteQuellenstoerungen({ telemetrie: telemetrie2, retrievalPaths: wege, packages: PAKETE, packagePaths, now: NOW });
  const s1b = b2.befunde.find((x) => x.sourceId === "s1");
  check("beide Wege gestört -> Paket ohne funktionierenden Weg", s1b.wirkung.art === "paket_ohne_funktionierenden_weg", s1b.wirkung.art);
  check("Paket ohne funktionierenden Weg -> akut", s1b.stufe === H.AKUT, s1b.stufe);
}

gruppe("23 · Fehlende Daten führen zu vorsichtiger 'unbekannt'-Klassifikation");
{
  const r = klassifiziere("q23", [], weg("q23"));
  check("gar keine Laufdaten -> unbekannt", r.klasse === K.UNBEKANNT, r.klasse);
  check("keine Laufdaten -> nichts behauptet", /bewusst nichts behauptet/.test(r.erklaerung));
  const r2 = klassifiziere("q23b", reihe("q23b", [[2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]), weg("q23b"));
  check("nur 2 Versuche (< Mindestmaß 3) -> unbekannt statt Befund", r2.klasse === K.UNBEKANNT, r2.klasse);
  check("zu wenige Läufe -> Zahl wird genannt", /Nur 2 echte Abrufversuche/.test(r2.erklaerung), r2.erklaerung);
  const leer = sf.bewerteQuellenstoerungen({ telemetrie: [], retrievalPaths: [weg("w1")], packages: PAKETE, packagePaths: [], now: NOW });
  check("Bericht ohne Telemetrie -> verfuegbar=false", leer.verfuegbar === false);
  check("Bericht ohne Telemetrie -> ehrlicher Hinweis statt falschem Grün", /keine Quellenstörung behauptet/.test(leer.hinweis || ""), leer.hinweis);
}

gruppe("24 · Production-ähnliche Kombination (leerer Lauf, alter Erfolg, Rhythmus)");
{
  // Nachbildung des real gemessenen Musters: eine Quelle mit ausschließlich
  // leeren Läufen, die im Fenster nie geliefert hat, ohne einen einzigen Fehler.
  const eintraege = [];
  for (let i = 24; i >= 1; i--) eintraege.push([i * 0.4, "leer"]);
  const r = klassifiziere("q24", reihe("q24", eintraege), weg("q24"));
  check("24 Leerläufe, 0 Fehler, nie geliefert -> leer (nicht abruffehler)", r.klasse === K.LEER, r.klasse);
  check("nie geliefert -> Erklärung sagt das ausdrücklich", /noch nie Inhalte geliefert/.test(r.erklaerung), r.erklaerung);
  check("leer ohne Fehler -> kein akuter Alarm", sf.handlungsstufe(r) !== H.AKUT);
}
{
  // Zentrale Drosselung dominiert (in Production die häufigste Fehlerzeile).
  const eintraege = [];
  for (let i = 8; i >= 1; i--) eintraege.push([i * 0.5, "gedrosselt"]);
  const r = klassifiziere("q24b", reihe("q24b", eintraege), weg("q24b"));
  check("nur circuit-open -> gedrosselt (kein Quellendefekt)", r.klasse === K.GEDROSSELT, r.klasse);
  check("gedrosselt -> nur beobachten", sf.handlungsstufe(r) === H.BEOBACHTEN);
  check("gedrosselt -> Erklärung nennt die zentrale Ursache", /zentrale Drosselung/.test(r.erklaerung), r.erklaerung);
  check("gedrosselt zählt NICHT als Abruffehler", r.klasse !== K.ABRUFFEHLER && r.laufdaten.fehler === 0);
}
{
  // Übersprungene Läufe (geteilter Abrufweg) dürfen niemals eine Serie bilden.
  const r = klassifiziere("q24c", reihe("q24c", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"],
    [2, "uebersprungen"], [1.5, "uebersprungen"], [1, "uebersprungen"], [0.5, "uebersprungen"], [0.2, "uebersprungen"]]), weg("q24c"));
  check("5 übersprungene Läufe -> weiterhin ok", r.klasse === K.OK, r.klasse);
  check("übersprungene Läufe zählen nicht als Versuche", r.laufdaten.versuche === 3 && r.laufdaten.uebersprungen === 5);
  // Und sie unterbrechen eine Fehlerserie NICHT.
  const r2 = klassifiziere("q24d", reihe("q24d", [[6, "lieferung"], [5, "lieferung"], [4, "lieferung"],
    [3, "fehler", { code: "timeout" }], [2, "uebersprungen"], [1, "fehler", { code: "timeout" }]]), weg("q24d"));
  check("übersprungener Lauf unterbricht die Fehlerserie nicht", r2.wiederholungen === 2 && r2.klasse === K.LANGSAM, `${r2.klasse}/${r2.wiederholungen}`);
}
{
  // Einzelner Fehlversuch nach gesunder Historie: benannt, aber NIE Alarm.
  const r = klassifiziere("q24e", reihe("q24e", [[6, "lieferung"], [5, "lieferung"], [4, "lieferung"],
    [3, "lieferung"], [2, "lieferung"], [0.2, "fehler", { code: "http-5xx" }]]), weg("q24e", { kritisch: true }));
  check("einzelner Fehlversuch -> als Einzelfall markiert", r.einzelfall === true);
  check("einzelner Fehlversuch bei PFLICHTQUELLE -> trotzdem nur beobachten", sf.handlungsstufe(r) === H.BEOBACHTEN);
}

gruppe("25 · Punkt 17 (Kostenmessung) wird nicht berührt");
{
  const telemetrie = reihe("s1", [[3, "lieferung"], [2, "lieferung"], [1, "lieferung"], [0.2, "lieferung"]]);
  const b = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: [weg("w1", { legacy: "s1" })], packages: PAKETE, packagePaths: [], now: NOW });
  const alsText = JSON.stringify(b);
  for (const feld of ["estimatedCost", "llmUsage", "totalUsd", "byPipelineStep", "costAttribution", "pipelineStep", "byModel"]) {
    check(`Bericht enthält kein Kostenfeld '${feld}'`, !alsText.includes(feld));
  }
  // Der Kostenpfad selbst bleibt unverändert nutzbar (keine Signaturänderung).
  const qw = require("../lib/helmut/quellenarchitektur/quality-watchdog");
  const kosten = qw.assessCosts({ llmUsage: [{ createdAt: new Date(NOW - TAG).toISOString(), estimatedCost: 0.01, pipelineStep: "understanding", model: "m", sourceId: "s1" }], now: NOW });
  check("assessCosts liefert weiterhin Quellenattribution", kosten.sourceAttributionAvailable === true && kosten.totalUsd === 0.01);
  check("Störungsmodul greift nicht auf llm_usage zu",
    !require("fs").readFileSync(require("path").join(__dirname, "..", "lib/helmut/quellenarchitektur/source-failure.js"), "utf8").includes("llm_usage"));
}

gruppe("26 · Berlin-/Punkt-14-Aktivierungslogik bleibt unverändert");
{
  const fs = require("fs");
  const path = require("path");
  const quelle = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/quellenarchitektur/source-failure.js"), "utf8");
  for (const verboten of ["HELMUT_LANDESMODULE", "rp-be-", "rp-bb-", "buildRelationalCrawlPlan", "isPathActive"]) {
    check(`Störungsmodul berührt '${verboten}' nicht`, !quelle.includes(verboten));
  }
  // Die Aktivierungsentscheidung liegt weiterhin allein bei source-mode.js.
  const sm = require("../lib/helmut/quellenarchitektur/source-mode");
  check("source-mode exportiert buildRelationalCrawlPlan unverändert", typeof sm.buildRelationalCrawlPlan === "function");
  // Die Klassifikation ändert NIE einen Weg-Status (rein lesend).
  const w = weg("w1", { legacy: "s1", status: "healthy", mode: "auto" });
  const vorher = JSON.stringify(w);
  sf.bewerteQuellenstoerungen({ telemetrie: reihe("s1", [[3, "fehler", { code: "timeout" }], [2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]), retrievalPaths: [w], packages: PAKETE, packagePaths: [], now: NOW });
  check("Klassifikation verändert den Abrufweg nicht (rein lesend)", JSON.stringify(w) === vorher);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("Zusatz · Gesamtbericht, Sortierung, Schwellen, Laufzeitquellen");
{
  const wege = [weg("w1", { legacy: "s1" }), weg("w2", { legacy: "s2", status: "paused" }), weg("w3", { legacy: "s3" })];
  const telemetrie = [
    ...reihe("s1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "http-429" }], [0.2, "fehler", { code: "http-429" }]]),
    ...reihe("s2", [[3, "fehler", { code: "timeout" }], [2, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]),
    ...reihe("s3", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    // Laufzeitquelle aus dem Profil — steht bewusst NICHT im geteilten Katalog.
    ...reihe("laufzeit-1", [[5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler", { code: "timeout" }], [0.2, "fehler", { code: "timeout" }]])
  ];
  const b = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: wege, packages: PAKETE, packagePaths: [], now: NOW });
  check("Bericht bewertet alle Katalogwege + Laufzeitquellen", b.befunde.length === 4, String(b.befunde.length));
  const lz = b.befunde.find((x) => x.sourceId === "laufzeit-1");
  check("Laufzeitquelle wird erkannt und markiert", lz && lz.laufzeitquelle === true && lz.imKatalog === false);
  check("pausierter Weg erscheint nicht als Störung", !b.gestoerte.some((x) => x.sourceId === "s2"));
  check("gesunder Weg erscheint nicht als Störung", !b.gestoerte.some((x) => x.sourceId === "s3"));
  check("Zähler summieren auf die Quellenzahl", Object.values(b.zaehler).reduce((a, c) => a + c, 0) === b.befunde.length);
  check("Stufen summieren auf die Quellenzahl", Object.values(b.stufen).reduce((a, c) => a + c, 0) === b.befunde.length);
  const rang = { akut: 3, zeitnah_pruefen: 2, beobachten: 1, keine: 0 };
  let sortiert = true;
  for (let i = 1; i < b.befunde.length; i++) if (rang[b.befunde[i - 1].stufe] < rang[b.befunde[i].stufe]) sortiert = false;
  check("Befunde sind nach Dringlichkeit sortiert (akut zuerst)", sortiert);
  check("jeder Befund trägt eine Signatur", b.befunde.every((x) => typeof x.signatur === "string" && x.signatur.length > 0));
  check("jeder Befund trägt Kurzbezeichnung, Erklärung und Stufentext",
    b.befunde.every((x) => x.kurz && x.erklaerung && x.stufeText));
}
{
  // Determinismus: gleiche Eingabe -> byte-gleiche Ausgabe.
  const telemetrie = reihe("s1", [[5, "lieferung"], [3, "fehler", { code: "timeout" }], [1, "fehler", { code: "timeout" }]]);
  const eins = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: [weg("w1", { legacy: "s1" })], packages: PAKETE, packagePaths: [], now: NOW });
  const zwei = sf.bewerteQuellenstoerungen({ telemetrie, retrievalPaths: [weg("w1", { legacy: "s1" })], packages: PAKETE, packagePaths: [], now: NOW });
  check("Klassifikation ist deterministisch", JSON.stringify(eins) === JSON.stringify(zwei));
}
{
  // Schwellen zentral + env-überschreibbar, ohne Magic Numbers im Code.
  const s = sf.stoerungsSchwellen({ HELMUT_STOERUNG_FEHLER_AB: "5", HELMUT_STOERUNG_LEER_AB: "9", HELMUT_STOERUNG_VERALTET_TAGE: "30" });
  check("Env-Override wirkt (fehlerAbLaeufen)", s.fehlerAbLaeufen === 5, String(s.fehlerAbLaeufen));
  check("Env-Override wirkt (leerAbLaeufen)", s.leerAbLaeufen === 9);
  check("Env-Override wirkt (veraltetTage)", s.veraltetTage === 30);
  const bad = sf.stoerungsSchwellen({ HELMUT_STOERUNG_FEHLER_AB: "quatsch", HELMUT_STOERUNG_LEER_AB: "" });
  check("unbrauchbarer Env-Wert fällt auf den Default zurück", bad.fehlerAbLaeufen === sf.STANDARD_SCHWELLEN.fehlerAbLaeufen && bad.leerAbLaeufen === sf.STANDARD_SCHWELLEN.leerAbLaeufen);
  // Höhere Schwelle -> derselbe Verlauf ist keine Störung mehr (Nachweis, dass
  // die Schwelle wirklich die Entscheidung trägt und nicht nur mitgeschrieben wird).
  const verlauf = reihe("s1", [[6, "lieferung"], [5, "lieferung"], [4, "lieferung"], [3, "fehler", { code: "timeout" }], [0.2, "fehler", { code: "timeout" }]]);
  const streng = klassifiziere("s1", verlauf, weg("w1", { legacy: "s1" }), sf.stoerungsSchwellen({ HELMUT_STOERUNG_FEHLER_AB: "2" }));
  const locker = klassifiziere("s1", verlauf, weg("w1", { legacy: "s1" }), sf.stoerungsSchwellen({ HELMUT_STOERUNG_FEHLER_AB: "5" }));
  check("Schwelle 2 -> akute Klasse", streng.klasse === K.LANGSAM && !streng.einzelfall);
  check("Schwelle 5 -> derselbe Verlauf ist nur ein Einzelfall", locker.einzelfall === true, locker.klasse);
}
{
  // Fenster: alte Läufe außerhalb des Bewertungsfensters zählen nicht mit.
  const r = klassifiziere("q-alt", reihe("q-alt", [[40, "fehler", { code: "timeout" }], [39, "fehler", { code: "timeout" }],
    [38, "fehler", { code: "timeout" }], [3, "lieferung"], [2, "lieferung"], [1, "lieferung"], [0.2, "lieferung"]]), weg("q-alt"));
  check("Fehler außerhalb des 14-Tage-Fensters wirken nicht mehr nach", r.klasse === K.OK, r.klasse);
  check("Fenster: nur die 4 jüngeren Läufe zählen", r.laufdaten.laeufe === 4, String(r.laufdaten.laeufe));
}
{
  // laufart() deckt alle real vorkommenden Status ab (Production-Inventar).
  check("laufart: ok mit Dokumenten -> lieferung", sf.laufart({ status: "ok", found_documents: 2 }) === "lieferung");
  check("laufart: ok ohne Dokumente -> leer", sf.laufart({ status: "ok", found_documents: 0 }) === "leer");
  check("laufart: empty -> leer", sf.laufart({ status: "empty" }) === "leer");
  check("laufart: error -> fehler", sf.laufart({ status: "error", error_code: "timeout" }) === "fehler");
  check("laufart: circuit-open -> gedrosselt", sf.laufart({ status: "circuit-open" }) === "gedrosselt");
  check("laufart: error mit circuit-open-Code -> gedrosselt", sf.laufart({ status: "error", error_code: "circuit-open" }) === "gedrosselt");
  check("laufart: skipped-shared -> uebersprungen", sf.laufart({ status: "skipped-shared" }) === "uebersprungen");
  check("laufart: skipped-cooldown -> uebersprungen", sf.laufart({ status: "skipped-cooldown" }) === "uebersprungen");
}
{
  // Robustheit: kaputte/leere Eingaben dürfen nie werfen.
  let geworfen = false;
  try {
    sf.bewerteQuellenstoerungen({ telemetrie: [null, {}, { source_id: "x" }, { source_id: "y", created_at: "kaputt" }],
      retrievalPaths: [null, {}, weg("w1")], packages: [null], packagePaths: [null, {}], profiles: [null, 5], now: NOW });
  } catch (_) { geworfen = true; }
  check("kaputte Eingaben werfen nicht", geworfen === false);
}

console.log(`\n${passed}/${passed + failed} Quellenstörungs-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
