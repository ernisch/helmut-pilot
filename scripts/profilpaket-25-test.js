"use strict";

// Helmut — Formprüfung des lokalen Importpakets „Profilpaket 25" (Sprint Fundament 25 Mandate,
// 2026-08-24):
// =============================================================================================
// data/mandatsprofile/brandenburg-25-kandidaten.json enthält die 20 zusätzlichen, recherchierten
// Brandenburg-Mandatsprofile — ALLE deaktiviert, KEIN Import, KEINE Production-Verbindung.
// Dieser Test sichert die Vertragsform dauerhaft ab (Profilvertrag:
// docs/betrieb/op30-profilvertrag-200-mandate.md, Prüfer: lib/helmut/profil-import.js):
//
//   1. Das Paket ist laut kanonischem Prüfer „importierbar" und ALLE Profile sind aktiv=false.
//   2. Genau 20 Profile, eindeutig in mandatsId, vollname UND amtlicher Profilseite.
//   3. Alle Profile sind landtag-brandenburg/Brandenburg; keine Suchseiten, kein /SYNTHETISCH/.
//   4. Keine Dublette gegen die bekannten BESTANDSPROFILE (Production-Stand 2026-08-24 laut
//      CURRENT_STATE §3 und scripts/fixtures/: 9 Production-Profile + 5 Offline-Testmandate).
//   5. Kein Profil behauptet eine erfolgte Prüfung (geprueftAm), solange die Quellen nicht
//      bytegenau verifiziert sind (Egress-Sperre der Cloud-Sitzung, Sprint-9B-Präzedenz);
//      jede notiz dokumentiert die Beleglage.
//   6. Der vorbereitete Verifikationsweg (.github/workflows/profil-quellen-verifikation.yml)
//      läuft AUSSCHLIESSLICH per workflow_dispatch — kein pull_request-, push- oder
//      schedule-Trigger, damit kein Lauf ohne ausdrückliche Betreiberfreigabe startet.
//
// Läuft offline, keine Netz-/Storage-Zugriffe; der Runner (run-offline-tests.js) sammelt ihn ein.

const fs = require("fs");
const path = require("path");
const profilImport = require("../lib/helmut/profil-import");

const PAKET_PFAD = path.join(__dirname, "..", "data", "mandatsprofile", "brandenburg-25-kandidaten.json");
const WORKFLOW_PFAD = path.join(__dirname, "..", ".github", "workflows", "profil-quellen-verifikation.yml");

// Bekannte Bestandsprofile: aus den VORHANDENEN Repo-Fixtures abgeleitet statt hier neue
// Klarnamens-Vorkommen anzulegen (CLAUDE.md §4.2: Fixture-Altbestand nicht ausweiten).
// Quellen: scripts/fixtures/profil-reparatur-2026-08-04.js (Production-Bestand 2026-08-04,
// 6 Zeilen inkl. Namensduplikat) + seeds/bundestag-testmandate.js (5 Offline-Testmandate).
// Dazu die drei nur in Production existierenden, deaktivierten Alt-IDs aus CURRENT_STATE §3
// (reine Kennungen, keine Klarnamen nötig).
const reparaturFixture = require("./fixtures/profil-reparatur-2026-08-04.js");
const testmandateSeed = require("../lib/helmut/quellenarchitektur/seeds/bundestag-testmandate.js");
const BESTAND = [
  ...reparaturFixture.BESTAND_IST.map((p) => ({ id: p.id, name: p.fullName })),
  ...testmandateSeed.TESTMANDATE.map((p) => ({ id: p.id, name: p.fullName })),
  { id: "angela-merkel", name: "" },
  { id: "james-brown", name: "" },
  { id: "helmut-abnahme-berlin", name: "" },
];

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

let paket = null;
try {
  paket = JSON.parse(fs.readFileSync(PAKET_PFAD, "utf8"));
  check("Importpaket ist lesbares JSON", true);
} catch (e) {
  check("Importpaket ist lesbares JSON", false, e && e.message);
}

if (paket) {
  const profile = Array.isArray(paket.profile) ? paket.profile : [];

  // 1. Kanonischer Prüfer: importierbar + alle deaktiviert.
  const ergebnis = profilImport.pruefeImport(paket);
  check("Prüfer meldet ERGEBNIS: importierbar", ergebnis && ergebnis.ok === true,
    profilImport.berichte(ergebnis).split("\n").slice(0, 3).join(" · "));
  check("Prüfer bestätigt alleAktivFalse",
    !!(ergebnis && ergebnis.zusammenfassung && ergebnis.zusammenfassung.alleAktivFalse === true));
  check("Jedes Profil trägt wörtlich aktiv:false", profile.every((p) => p.aktiv === false));

  // 2. Genau 20, dreifach eindeutig.
  check("Genau 20 Profile", profile.length === 20, `gefunden: ${profile.length}`);
  const ids = profile.map((p) => String(p.mandatsId || ""));
  const namen = profile.map((p) => String(p.vollname || "").toLowerCase());
  const amtliche = profile.map((p) => {
    const q = (p.offizielleQuellen || []).find((x) => x && x.art === "parlament-profil");
    return q ? String(q.url) : "";
  });
  check("20 eindeutige mandatsId", new Set(ids).size === 20);
  check("20 eindeutige Vollnamen", new Set(namen).size === 20);
  check("20 eindeutige amtliche Profilseiten", new Set(amtliche).size === 20 && amtliche.every(Boolean));

  // 3. Einheitlich Brandenburg, echte amtliche Hosts, keine Marker.
  check("Alle Profile parlament=landtag-brandenburg", profile.every((p) => p.parlament === "landtag-brandenburg"));
  check("Alle Profile bundesland=Brandenburg", profile.every((p) => p.bundesland === "Brandenburg"));
  check("Alle amtlichen Profilseiten liegen auf landtag.brandenburg.de (https)",
    amtliche.every((u) => /^https:\/\/(www\.)?landtag\.brandenburg\.de\//.test(u)));
  check("Kein /SYNTHETISCH/-Marker und keine Suchseite im Paket",
    !JSON.stringify(paket).includes("/SYNTHETISCH/") && !JSON.stringify(paket).includes("news.google.com"));

  // Vertragsachsen je Profil (Region + fachliche Achse + Parteiaussage).
  check("Jedes Profil hat Wahlkreis ODER (listenmandat + regionHinweis)",
    profile.every((p) => (p.wahlkreis && String(p.wahlkreis).trim()) ||
      (p.listenmandat === true && p.regionHinweis && String(p.regionHinweis).trim())));
  check("Jedes Profil hat mindestens einen Ausschuss oder ein Thema",
    profile.every((p) => (Array.isArray(p.ausschuesse) && p.ausschuesse.length) ||
      (Array.isArray(p.themen) && p.themen.length)));
  check("Jedes Profil sagt Partei ODER ausdrücklich fraktionslos",
    profile.every((p) => (p.partei && String(p.partei).trim()) || p.fraktionslos === true));

  // Budgetfelder: nicht gesetzt (= Systemdefault) oder positive ganze Zahl.
  const budgetOk = profile.every((p) =>
    ["kiBudgetTaeglichCent", "kiBudgetMonatlichCent"].every((f) =>
      p[f] === undefined || (Number.isInteger(p[f]) && p[f] > 0)));
  check("Budgetfelder fehlen oder sind positive ganze Zahlen", budgetOk);

  // 4. Dubletten gegen den Bestand.
  const bestandIds = new Set(BESTAND.map((b) => b.id));
  const bestandNamen = new Set(BESTAND.map((b) => b.name.toLowerCase()).filter(Boolean));
  check("Keine mandatsId kollidiert mit Bestandsprofilen", ids.every((id) => !bestandIds.has(id)));
  check("Kein Vollname kollidiert mit Bestandsprofilen", namen.every((n) => !bestandNamen.has(n)));

  // 5. Ehrlichkeit der Beleglage: kein geprueftAm ohne echte Prüfung, jede notiz vorhanden.
  const behauptetePruefung = profile.some((p) => (p.offizielleQuellen || []).some((q) => q && q.geprueftAm));
  check("Kein Profil behauptet eine erfolgte Quellenprüfung (geprueftAm)", !behauptetePruefung,
    "geprueftAm darf erst der Verifikationslauf setzen");
  check("Jedes Profil dokumentiert seine Beleglage in notiz",
    profile.every((p) => p.notiz && String(p.notiz).trim().length >= 20));
  check("Die Paketherkunft benennt die fehlende Byte-Verifikation",
    /bytegenau/i.test(String(paket.quelleDerRecherche || "")));
}

// 6. Verifikationsweg: nur workflow_dispatch.
let workflow = null;
try {
  workflow = fs.readFileSync(WORKFLOW_PFAD, "utf8");
  check("Verifikations-Workflow existiert", true);
} catch (e) {
  check("Verifikations-Workflow existiert", false, e && e.message);
}
if (workflow) {
  check("Workflow läuft ausschließlich per workflow_dispatch",
    /workflow_dispatch:/.test(workflow) &&
    !/^\s*(pull_request|push|schedule|workflow_run|pull_request_target):/m.test(workflow),
    "kein automatischer Trigger erlaubt (Betreiberfreigabe-Gate)");
  check("Workflow hat nur Leserechte (contents: read)",
    /permissions:\s*\n\s*contents:\s*read/.test(workflow));
  check("Workflow setzt das Fail-closed-Gate HELMUT_PROFILVERIFIKATION",
    /HELMUT_PROFILVERIFIKATION:\s*"on"/.test(workflow));
}

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail === 0) {
  console.log("Profilpaket 25: vertragskonform, vollständig deaktiviert, Verifikation bleibt freigabepflichtig.");
}
process.exit(fail > 0 ? 1 : 0);
