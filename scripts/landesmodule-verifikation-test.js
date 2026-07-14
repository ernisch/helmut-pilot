"use strict";

// Sprint 9B — Test der ECHTEN Verifikations-Overlay (landesmodule-verifikation.js) + Konsistenz
// gegen die tatsächlichen Seed-Wege. Prüft, dass die real gemessenen Urteile vollständig,
// gültig und deckungsgleich mit der Struktur sind (kein erfundenes/fehlendes Ergebnis).

const V = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { BUNDESWEG_REPARATUREN } = require("../lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const ERLAUBT = new Set(["geeignet", "geeignet mit Einschränkung", "ablehnen", "nicht_verifizierbar"]);

// --- 1. Meta ---
check("Meta: Egress offen, 24/25 real geprüft (GitHub-Runner)", V.LIVE_META.egressOffen === true && V.LIVE_META.realGeprueft === 24 && V.LIVE_META.gesamt === 25);
check("Meta: Run + PR dokumentiert", V.LIVE_META.run === "29294900851" && V.LIVE_META.pr === 71 && V.LIVE_META.datum === "2026-07-14");

// --- 2. Vollständigkeit + gültige Urteile ---
check("19 Land-Wege mit Urteil", Object.keys(V.LIVE_URTEILE).length === 19);
check("6 Bund-Wege mit Urteil", Object.keys(V.BUND_LIVE).length === 6);
check("alle Land-Urteile aus erlaubter Menge", Object.values(V.LIVE_URTEILE).every((v) => ERLAUBT.has(v.urteil)));
check("alle Bund-Urteile aus erlaubter Menge", Object.values(V.BUND_LIVE).every((v) => ERLAUBT.has(v.urteil)));
check("jeder Weg trägt einen Beleg", [...Object.values(V.LIVE_URTEILE), ...Object.values(V.BUND_LIVE)].every((v) => typeof v.beleg === "string" && v.beleg.length > 5));

// --- 3. Zählung deckungsgleich mit dem Workflow-Ergebnis (9/5/10/1) ---
const s = V.verifikationSummary();
check("Land-Zählung: 6 geeignet / 4 mit Einschränkung / 8 ablehnen / 1 nicht_verifizierbar",
  s.zaehlungLand["geeignet"] === 6 && s.zaehlungLand["geeignet mit Einschränkung"] === 4 && s.zaehlungLand["ablehnen"] === 8 && s.zaehlungLand["nicht_verifizierbar"] === 1);
check("Bund-Zählung: 3 geeignet / 1 mit Einschränkung / 2 ablehnen",
  s.zaehlungBund["geeignet"] === 3 && s.zaehlungBund["geeignet mit Einschränkung"] === 1 && s.zaehlungBund["ablehnen"] === 2);
check("Gesamt-Zählung: 9 / 5 / 10 / 1 (= Workflow-Summary)",
  s.zaehlungGesamt["geeignet"] === 9 && s.zaehlungGesamt["geeignet mit Einschränkung"] === 5 && s.zaehlungGesamt["ablehnen"] === 10 && s.zaehlungGesamt["nicht_verifizierbar"] === 1);

// --- 4. Konsistenz gegen die tatsächlichen Seed-Wege ---
const wege = buildLandesmodulSeed().retrievalPaths.map((p) => p.legacy_source_id);
check("jeder der 19 Seed-Wege hat ein Live-Urteil", wege.every((id) => V.LIVE_URTEILE[id]));
check("jeder Bund-Reparaturweg hat ein Live-Urteil", BUNDESWEG_REPARATUREN.every((r) => V.BUND_LIVE[r.legacy_source_id]));
check("keine verwaisten Live-Urteile (Land)", Object.keys(V.LIVE_URTEILE).every((id) => wege.includes(id)));

// --- 5. klasseLiveVerdict (land-aware) ---
check("BE plenum -> geeignet", V.klasseLiveVerdict("berlin", "plenum").urteil === "geeignet");
check("BE landesparlament -> ablehnen (Hub-HTML)", V.klasseLiveVerdict("berlin", "landesparlament").urteil === "ablehnen");
check("BB plenum -> geeignet (parldok WP8)", V.klasseLiveVerdict("brandenburg", "plenum").urteil === "geeignet");
check("BB staatskanzlei -> nicht_verifizierbar (TLS)", V.klasseLiveVerdict("brandenburg", "staatskanzlei").urteil === "nicht_verifizierbar");
check("oer_landesberichterstattung (rbb24) für BEIDE Länder geeignet",
  V.klasseLiveVerdict("berlin", "oer_landesberichterstattung").urteil === "geeignet" && V.klasseLiveVerdict("brandenburg", "oer_landesberichterstattung").urteil === "geeignet");

// --- 6. verifizierte Wege + reparierte Bundeswege ---
check("9 real verifizierte (geeignete) Wege gesamt", s.verifizierteWege.length === 9);
check("Bund repariert = bundestag, linksfraktion, ausschuss-arbeit-soziales",
  s.bundRepariert.length === 3 && ["bundestag", "linksfraktion", "ausschuss-arbeit-soziales"].every((id) => s.bundRepariert.includes(id)));
check("bundesregierung NICHT repariert (404)", V.BUND_LIVE["bundesregierung"].urteil === "ablehnen" && !s.bundRepariert.includes("bundesregierung"));

console.log(`\n${fail === 0 ? "ALLE TESTS GRÜN" : fail + " TEST(S) FEHLGESCHLAGEN"} (Sprint 9B Verifikations-Overlay)`);
process.exit(fail > 0 ? 1 : 0);
