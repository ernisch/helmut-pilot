"use strict";

// Offline-Vertragstest der KANONISCHEN MANDATSKLASSIFIZIERUNG (real/synthetisch).
//
// Zwei Nachweise, und der zweite ist der wichtigere:
//   1. Die Klassifizierung trifft genau die vier synthetischen Kennungsfamilien
//      und NIEMALS eine reale Kennung.
//   2. INERTHEIT: solange keine synthetische Zeile existiert — der heutige
//      Production-Zustand — verhält sich jede darauf aufbauende Schutzregel
//      byte-identisch zum bisherigen Stand. Ohne diesen Nachweis wäre der
//      Verdrängungsschutz eine Verhaltensänderung an einem laufenden System.

const fs = require("fs");
const path = require("path");
const M = require("../lib/helmut/mandatsklasse");
const R = require("../lib/helmut/kommunikationsriegel");
const fair = require("../lib/helmut/llm-budget-fair");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Die Fassung VOR diesem Sprint, wortgleich nachgebaut. Sie ist der Maßstab für
// die Inertheitsnachweise: was sie liefert, muss die neue Fassung bei homogenen
// Listen ebenfalls liefern.
const crypto = require("crypto");
function altStreuwert(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest().readUInt32BE(0);
}
function altTagesNummer(tag) {
  const ms = Date.parse(`${tag}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
}
function altRotation(mandatsIds, tag, schritt) {
  const liste = [...new Set((mandatsIds || []).map((m) => String(m || "").trim()).filter(Boolean))];
  liste.sort((a, b) => {
    const sa = altStreuwert(a); const sb = altStreuwert(b);
    return sa === sb ? (a < b ? -1 : 1) : sa - sb;
  });
  if (!liste.length) return [];
  const s = Math.max(1, Math.floor(Number(schritt) || 1));
  const versatz = tag ? ((altTagesNummer(tag) * s) % liste.length + liste.length) % liste.length : 0;
  return [...liste.slice(versatz), ...liste.slice(0, versatz)];
}

function main() {
  console.log("Helmut — Vertragstest der Mandatsklassifizierung\n");

  // ── A · Klassifizierung ───────────────────────────────────────────────────
  console.log("A · Klassifizierung");
  const kohorte = baueKohorte();
  check("A1 alle 495 Kohortenkennungen gelten als synthetisch",
    kohorte.every((s) => M.istSynthetischeKennung(s.id)), `${kohorte.length} geprüft`);
  check("A2 alle vier Kennungsfamilien greifen",
    ["test-kohorte-a-001", "test-mdb-1", "synth-mandat-0001", "stapel-x"]
      .every((k) => M.klassifiziereMandat(k) === M.KLASSE_SYNTHETISCH));
  check("A3 Grossschreibung rutscht nicht durch",
    M.istSynthetischeKennung("TEST-KOHORTE-A-001") === true);
  check("A4 Leerraum wird getrimmt",
    M.istSynthetischeKennung("  test-kohorte-a-001  ") === true);
  check("A5 eine beliebige andere Kennung gilt als REAL (Erlaubnisliste des Synthetischen)",
    ["mandat-eins", "abgeordnete-x", "m5-9aee228dbf2c9f13", "kohorte-test"]
      .every((k) => M.klassifiziereMandat(k) === M.KLASSE_REAL));
  check("A6 eine LEERE Kennung ist nicht real, sondern unbestimmt",
    M.klassifiziereMandat("") === M.KLASSE_UNBESTIMMT
    && M.klassifiziereMandat(null) === M.KLASSE_UNBESTIMMT
    && M.klassifiziereMandat(undefined) === M.KLASSE_UNBESTIMMT);
  check("A7 ein Präfix in der MITTE greift nicht (nur Anfang zählt)",
    M.istSynthetischeKennung("mandat-test-kohorte-a-001") === false);
  check("A8 klassifiziereMandat wirft bei keinem Eingabetyp",
    (() => {
      for (const w of [null, undefined, 0, 1, {}, [], true, NaN, Symbol.iterator]) {
        try { M.klassifiziereMandat(w); } catch (_) { return false; }
      }
      return true;
    })());

  const geteilt = M.teileNachKlasse(["a-real", "test-kohorte-a-001", "", "b-real", "stapel-9"]);
  check("A9 teileNachKlasse trennt korrekt",
    geteilt.real.length === 2 && geteilt.synthetisch.length === 2
    && geteilt.unbestimmt.length === 1 && geteilt.gemischt === true);
  check("A10 eine homogene Liste ist NICHT gemischt",
    M.teileNachKlasse(["a", "b", "c"]).gemischt === false
    && M.teileNachKlasse(["test-mdb-1", "test-mdb-2"]).gemischt === false);

  // ── B · Der Kommunikationsriegel benutzt dieselbe eine Wahrheit ────────────
  console.log("\nB · Eine kanonische Stelle (kein zweiter Listenklon)");
  const riegelQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/kommunikationsriegel.js"), "utf8");
  check("B1 der Riegel definiert die Familienliste nicht mehr selbst",
    riegelQuelle.includes("mandatsklasse.KENNUNGSFAMILIEN_SYNTHETISCH")
    && !/const SYNTHETISCHE_KENNUNGSFAMILIEN = Object\.freeze\(\[\s*\n\s*"test-kohorte-"/.test(riegelQuelle));
  check("B2 der Riegel klassifiziert identisch zur kanonischen Stelle",
    [...kohorte.map((s) => s.id), "mandat-eins", "", "TEST-MDB-3", "stapel-", "x"]
      .every((k) => R.kennungIstSynthetisch(k) === M.istSynthetischeKennung(k)));
  check("B3 die exportierte Familienliste ist unverändert vierteilig",
    R.SYNTHETISCHE_KENNUNGSFAMILIEN.length === 4
    && R.SYNTHETISCHE_KENNUNGSFAMILIEN.every((f, i) => f === M.KENNUNGSFAMILIEN_SYNTHETISCH[i]));

  // ── C · INERTHEIT: der heutige Production-Zustand bleibt unberührt ─────────
  console.log("\nC · Inertheit (0 synthetische Zeilen = kein Verhaltensunterschied)");
  const realeFuenf = ["mandat-a", "mandat-b", "mandat-c", "mandat-d", "mandat-e"];
  const tage = ["2026-09-02", "2026-09-03", "2026-10-15", "2027-01-01"];
  check("C1 rein reale Liste: Rotation byte-identisch zur Fassung vor dem Sprint",
    tage.every((t) => [1, 3, 5, 50].every((s) =>
      JSON.stringify(fair.rotationsReihenfolge(realeFuenf, t, s)) === JSON.stringify(altRotation(realeFuenf, t, s)))));
  const tausendSynth = Array.from({ length: 1000 }, (_, i) => `synth-mandat-${String(i + 1).padStart(4, "0")}`);
  check("C2 rein synthetische Liste (1000er-Lastfixture): ebenfalls byte-identisch",
    tage.every((t) => [1, 50].every((s) =>
      JSON.stringify(fair.rotationsReihenfolge(tausendSynth, t, s)) === JSON.stringify(altRotation(tausendSynth, t, s)))));
  check("C3 leere Liste bleibt leer",
    fair.rotationsReihenfolge([], "2026-09-02", 5).length === 0);
  check("C4 ohne gesetzte Umgebungsvariable ist die Vorrangreserve 0",
    M.vorrangreserveReal({}).wert === 0 && M.vorrangreserveReal({}).konfiguriert === false);

  // ── D · Wirkung, sobald eine Kohorte da ist ───────────────────────────────
  console.log("\nD · Wirkung bei gemischter Mandatsmenge");
  const kohortenIds = kohorte.map((s) => s.id);
  const gemischt = [...kohortenIds, ...realeFuenf];
  const reihenfolge = fair.rotationsReihenfolge(gemischt, "2026-09-10", 50);
  check("D1 alle500 rotieren nach derselben unverzerrten Grundordnung",
    JSON.stringify(reihenfolge) === JSON.stringify(altRotation(gemischt, "2026-09-10", 50)));
  check("D2 alle500 Kennungen bleiben genau einmal enthalten",
    reihenfolge.length === 500 && new Set(reihenfolge).size === 500);
  const bedient = new Map(gemischt.map(id => [id,0]));
  for (let tag=1;tag<=10;tag++) {
    const plan = fair.tagesplan({mandate:gemischt,deckel:100,tag:`2026-10-${String(tag).padStart(2,"0")}`});
    for(const [id,z] of Object.entries(plan.zuteilung)) if(z.notwendig>0) bedient.set(id,bedient.get(id)+1);
  }
  check("D3 bei50 Tagesplaetzen werden in10 Tagen genau alle500 einmal bedient",
    [...bedient.values()].every(n=>n===1));
  check("D4 reale und synthetische Profile haben identische Bedienhaeufigkeit",
    realeFuenf.every(id=>bedient.get(id)===1) && kohortenIds.every(id=>bedient.get(id)===1));
  const plan = fair.tagesplan({mandate:gemischt,deckel:100,tag:"2026-09-10"});
  check("D5 die Zuteilung bevorzugt keine Klasse gegen die gemeinsame Rotation",
    reihenfolge.every((id,i)=>(plan.zuteilung[id]?.notwendig>0)===(i<50)));
  check("D6 die Klassenbilanz ist weiterhin vollstaendig und ehrlich",
    plan.klassen.real===5 && plan.klassen.synthetisch===495
      && plan.klassen.realeVollstaendigBedient===realeFuenf.every(id=>plan.zuteilung[id]?.notwendig>0)
      && plan.klassen.synthetischeVollstaendigBedient===kohortenIds.every(id=>plan.zuteilung[id]?.notwendig>0));

  // ── E · Vorrangreserve: Semantik und fail-closed ──────────────────────────
  console.log("\nE · Vorrangreserve der realen Mandate");
  check("E1 ein gültiger positiver Wert wird übernommen",
    M.vorrangreserveReal({ [M.VORRANG_REAL_ENV]: "200" }).wert === 200);
  M.__resetVorrangWarnungFuerTests();
  const ungueltig = M.vorrangreserveReal({ [M.VORRANG_REAL_ENV]: "zweihundert" });
  check("E2 ein ungültiger Wert ergibt 0 und wird als ungültig ausgewiesen",
    ungueltig.wert === 0 && ungueltig.gueltig === false && ungueltig.konfiguriert === true);
  check("E3 0 und negative Werte gelten nicht als Reserve",
    M.vorrangreserveReal({ [M.VORRANG_REAL_ENV]: "0" }).wert === 0
    && M.vorrangreserveReal({ [M.VORRANG_REAL_ENV]: "-5" }).wert === 0);
  check("E4 der gemessene Mindestbedarf ist 170 und die Empfehlung liegt darüber",
    M.VORRANG_REAL_MESSBEDARF_P95 === 170 && M.VORRANG_REAL_EMPFEHLUNG > 170);
  check("E5 synthetische mandatsgebundene Aufrufe haben denselben Zugang",
    M.vorrangGiltFuer({ kennung: "test-kohorte-a-001" }).gilt === false);
  check("E6 sie gilt NICHT für reale Mandate",
    M.vorrangGiltFuer({ kennung: "mandat-a" }).gilt === false);
  check("E7 sie gilt AUCH für geteilte Arbeit — die hat ihre eigene Reserve",
    M.vorrangGiltFuer({ kennung: null, geteilt: true }).gilt === true
    && M.vorrangGiltFuer({ kennung: "mandat-a", geteilt: true }).gilt === true);
  check("E7b jede gueltige Mandatskennung ist vom Abzug ausgenommen",
    M.vorrangGiltFuer({ kennung: "mandat-a", geteilt: false }).gilt === false
    && M.vorrangGiltFuer({ kennung: "mandat-a" }).grund === "mandatsgebundene-arbeit");
  check("E8 eine fehlende Kennung bekommt fail-closed die strengere Stellung",
    M.vorrangGiltFuer({ kennung: null }).gilt === true
    && M.vorrangGiltFuer({ kennung: null }).grund === "kennung-nicht-bestimmbar-fail-closed");
  check("E9 vorrangreserveReal wirft bei einer unlesbaren Umgebung nicht",
    (() => {
      const boese = new Proxy({}, { get() { throw new Error("unlesbar"); } });
      try { return M.vorrangreserveReal(boese).wert === 0; } catch (_) { return false; }
    })());

  // ── F · Kein realer Slug im Code ──────────────────────────────────────────
  console.log("\nF · Mandantenneutralität");
  const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/mandatsklasse.js"), "utf8");
  check("F1 das Modul enthält ausschließlich synthetische Kennungsfamilien",
    M.KENNUNGSFAMILIEN_SYNTHETISCH.every((f) => /^(test-|synth-|stapel-)/.test(f)));
  check("F2 kein m5-/Klarnamen-Slug im Quelltext",
    !/m5-[0-9a-f]{8}/.test(quelle));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
