"use strict";

// Sprint 9B — Test der ECHTEN Verifikations-Overlay (landesmodule-verifikation.js) + Konsistenz
// gegen die tatsächlichen Seed-Wege. Finaler Stand: Runde 3 (Run 29297142235, PR #72).
// Nach 3 Runden: 21 geeignet + 3 mit Einschränkung, 0 ablehnen, 0 nicht_verifizierbar (24/24).

const V = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { BUNDESWEG_REPARATUREN } = require("../lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const ERLAUBT = new Set(["geeignet", "geeignet mit Einschränkung", "ablehnen", "nicht_verifizierbar"]);

// --- 1. Meta (finaler R3-Lauf) ---
check("Meta: Egress offen, 24/24 real geprüft, Runde 3", V.LIVE_META.egressOffen === true && V.LIVE_META.realGeprueft === 24 && V.LIVE_META.gesamt === 24 && V.LIVE_META.runde === 3);
check("Meta: Run 29297142235 + PR 72", V.LIVE_META.run === "29297142235" && V.LIVE_META.pr === 72 && V.LIVE_META.datum === "2026-07-14");

// --- 2. Vollständigkeit + gültige Urteile ---
check("18 Land-Wege mit Urteil", Object.keys(V.LIVE_URTEILE).length === 18);
check("6 Bund-Wege mit Urteil", Object.keys(V.BUND_LIVE).length === 6);
check("alle Urteile aus erlaubter Menge", [...Object.values(V.LIVE_URTEILE), ...Object.values(V.BUND_LIVE)].every((v) => ERLAUBT.has(v.urteil)));
check("jeder Weg trägt einen Beleg", [...Object.values(V.LIVE_URTEILE), ...Object.values(V.BUND_LIVE)].every((v) => typeof v.beleg === "string" && v.beleg.length > 5));

// --- 3. Zählung deckungsgleich mit dem finalen Workflow-Ergebnis (21/3/0/0) ---
const s = V.verifikationSummary();
check("Land-Zählung: 15 geeignet / 3 mit Einschränkung / 0 ablehnen / 0 nicht_verifizierbar",
  s.zaehlungLand["geeignet"] === 15 && s.zaehlungLand["geeignet mit Einschränkung"] === 3 && s.zaehlungLand["ablehnen"] === 0 && s.zaehlungLand["nicht_verifizierbar"] === 0);
check("Bund-Zählung: 6 geeignet / 0 sonst", s.zaehlungBund["geeignet"] === 6 && s.zaehlungBund["ablehnen"] === 0 && s.zaehlungBund["nicht_verifizierbar"] === 0);
check("Gesamt-Zählung: 21 geeignet / 3 mit Einschränkung / 0 / 0 (= Workflow-Summary)",
  s.zaehlungGesamt["geeignet"] === 21 && s.zaehlungGesamt["geeignet mit Einschränkung"] === 3 && s.zaehlungGesamt["ablehnen"] === 0 && s.zaehlungGesamt["nicht_verifizierbar"] === 0);
check("KEIN ablehnen / nicht_verifizierbar mehr (Konvergenz)", s.zaehlungGesamt["ablehnen"] === 0 && s.zaehlungGesamt["nicht_verifizierbar"] === 0);

// --- 4. Konsistenz gegen die tatsächlichen Seed-Wege (18) ---
const wege = buildLandesmodulSeed().retrievalPaths.map((p) => p.legacy_source_id);
check("18 Seed-Wege, jeder mit Live-Urteil", wege.length === 18 && wege.every((id) => V.LIVE_URTEILE[id]));
check("jeder Bund-Reparaturweg hat ein Live-Urteil", BUNDESWEG_REPARATUREN.every((r) => V.BUND_LIVE[r.legacy_source_id]));
check("keine verwaisten Live-Urteile (Land)", Object.keys(V.LIVE_URTEILE).every((id) => wege.includes(id)));

// --- 5. klasseLiveVerdict (land-aware) — inkl. R3-korrigierter Wege ---
check("BE plenum -> geeignet", V.klasseLiveVerdict("berlin", "plenum").urteil === "geeignet");
check("BE staatskanzlei -> geeignet (R3-googlenews-Ersatz)", V.klasseLiveVerdict("berlin", "staatskanzlei").urteil === "geeignet");
check("BB landesregierung + staatskanzlei -> geeignet (ein Weg, R3-Ersatz)",
  V.klasseLiveVerdict("brandenburg", "landesregierung").urteil === "geeignet" && V.klasseLiveVerdict("brandenburg", "staatskanzlei").urteil === "geeignet" && V.klasseLiveVerdict("brandenburg", "staatskanzlei").weg === "bb-landesregierung");
check("BB ministerien -> geeignet (R3-Ersatz)", V.klasseLiveVerdict("brandenburg", "ministerien").urteil === "geeignet");
check("alle 13 besetzten Berlin-Pflichtklassen haben ein Urteil", ["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung","landesregierung","staatskanzlei","ministerien","landesfraktionen","regionale_leitmedien","oer_landesberichterstattung","partei_pilot"].every((kl) => V.klasseLiveVerdict("berlin", kl)));

// --- 6. verifizierte + reparierte Wege ---
check("21 real verifizierte (geeignete) Wege gesamt", s.verifizierteWege.length === 21);
check("alle 6 Bundeswege repariert (real geeignet)", s.bundRepariert.length === 6);
check("24 Wege behalten (geeignet ODER mit Einschränkung)", s.behaltenWege.length === 24);

console.log(`\n${fail === 0 ? "ALLE TESTS GRÜN" : fail + " TEST(S) FEHLGESCHLAGEN"} (Sprint 9B Verifikations-Overlay, R3)`);
process.exit(fail > 0 ? 1 : 0);
