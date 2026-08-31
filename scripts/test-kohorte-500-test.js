"use strict";

// ============================================================================
// TESTKOHORTE 495 (500-Mandate-Reife 2026-09-01) — Offline-Vollvalidierung
// ============================================================================
// Beweist die Anforderungen des Kohorten-Auftrags:
//  1. strikte Trennung von realen Mandaten (eigene Kennungsfamilie),
//  2. neutrale synthetische Kennungen, 3. keine echten Namen oder Daten,
//  4. Passwörter nur zur Laufzeit, 5. standardmäßig inaktiv,
//  6. keine Provisionierung durch das Modul, 7. keine Aktivierung,
//  8. VOLLSTÄNDIGE Offline-Validierung aller 495 Spezifikationen gegen das
//     ECHTE provisioning.validateSpec, 9. deterministische Wiederholbarkeit,
//  10. Größenprüfung des Profilbestands.
// KEIN Netz, KEIN Storage, KEINE Anlage. Lauf über scripts/lokal.js (CLAUDE.md §6).

const fs = require("fs");
const path = require("path");
const kohorte = require("../lib/helmut/test-kohorte-500");
const { validateSpec, buildProfile } = require("../lib/helmut/provisioning");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? `  — ${detail}` : ""}`);
  if (cond) pass += 1; else fail += 1;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const specs = kohorte.baueKohorte();
const moduleSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "test-kohorte-500.js"), "utf8");

abschnitt("§1 Struktur: 495 Spezifikationen in den Gruppen 20/75/400");
{
  check("§1.1 exakt 495 Spezifikationen, Zielbild 5 real + 495 synthetisch = 500",
    specs.length === 495 && kohorte.kohortenUebersicht().zielGesamt === 500
    && kohorte.kohortenUebersicht().realeMandate === 5);
  const jeGruppe = { a: 0, b: 0, c: 0 };
  for (const s of specs) { jeGruppe[s.id.split("-")[2]] += 1; }
  check("§1.2 Gruppen exakt 20 (a) / 75 (b) / 400 (c)",
    jeGruppe.a === 20 && jeGruppe.b === 75 && jeGruppe.c === 400);
  check("§1.3 die Gruppenübersicht trägt dieselben Größen",
    kohorte.GRUPPEN.map((g) => g.groesse).join(",") === "20,75,400");
}

abschnitt("§2 Offline-Vollvalidierung: alle 495 gegen das ECHTE validateSpec");
{
  // validateSpec liefert eine LISTE klarer Fehler (leer = gültig).
  let gueltig = 0; let ersterFehler = null;
  for (const s of specs) {
    const mitPw = kohorte.mitLaufzeitPasswort(s, { zufall: () => "laufzeit-passwort-123" });
    const fehler = validateSpec(mitPw);
    if (Array.isArray(fehler) && fehler.length === 0) gueltig += 1;
    else if (!ersterFehler) ersterFehler = `${s.id}: ${JSON.stringify(fehler)}`;
  }
  check("§2.1 alle 495 Spezifikationen sind offline gültig (validateSpec: 0 Fehler)", gueltig === 495, ersterFehler);
  const ohnePw = validateSpec(specs[0]);
  check("§2.2 OHNE Laufzeitpasswort ist eine Spezifikation bewusst NICHT anlagefähig (password-Fehler)",
    Array.isArray(ohnePw) && ohnePw.some((f) => /password/.test(f)));
  const profil = buildProfile(kohorte.mitLaufzeitPasswort(specs[0], { zufall: () => "laufzeit-passwort-123" }), { aktiv: false });
  check("§2.3 buildProfile(aktiv:false) liefert ein INAKTIVES Profil (profileActive false)",
    profil.profileActive === false && profil.id === specs[0].id);
  let wirft = false;
  try { buildProfile(specs[0], {}); } catch (_) { wirft = true; }
  check("§2.4 buildProfile ohne ausdrücklichen aktiv-Wert wirft (kein stiller Default)", wirft);
}

abschnitt("§3 Deterministische Wiederholbarkeit");
{
  check("§3.1 zwei Läufe liefern byte-identische Spezifikationen",
    JSON.stringify(kohorte.baueKohorte()) === JSON.stringify(specs));
  check("§3.2 kein Zufall im deterministischen Pfad (Math.random/Date.now nur in der Passwort-Laufzeit)",
    !/Math\.random|Date\.now/.test(moduleSrc));
  check("§3.3 kohortenId ist eine reine Indexfunktion",
    kohorte.kohortenId(0) === "test-kohorte-a-001" && kohorte.kohortenId(19) === "test-kohorte-a-020"
    && kohorte.kohortenId(20) === "test-kohorte-b-001" && kohorte.kohortenId(94) === "test-kohorte-b-075"
    && kohorte.kohortenId(95) === "test-kohorte-c-001" && kohorte.kohortenId(494) === "test-kohorte-c-400"
    && kohorte.kohortenId(495) === null);
}

abschnitt("§4 Strikte Trennung und Neutralität");
{
  const reale = ["annika-klose", "cem-ince", "helmut-kleebank", "ottilie-paola-klein-2", "ruppert-st-we",
    "max-mustermann", "angela-merkel", "james-brown", "helmut-abnahme-berlin"];
  check("§4.1 jede Kennung folgt der eigenen Familie test-kohorte-<gruppe>-<nnn>",
    specs.every((s) => /^test-kohorte-[abc]-\d{3}$/.test(s.id)));
  check("§4.2 keine Kollision mit realen Mandaten, test-mdb-*, synth-mandat-*, stapel-*",
    specs.every((s) => !reale.includes(s.id) && !/^test-mdb-/.test(s.id) && !/^synth-mandat-/.test(s.id) && !/^stapel-/.test(s.id)));
  check("§4.3 alle Namen sind neutral (Testmandat X-NNN), keine echten Namen",
    specs.every((s) => /^Testmandat [ABC]-\d{3}$/.test(s.name)));
  check("§4.4 alle E-Mails liegen auf der RFC-reservierten, nie zustellbaren .invalid-Domain",
    specs.every((s) => s.email === `${s.id}@test-kohorte.invalid`));
  check("§4.5 alle Parteien/Ausschüsse/Themen sind synthetisch (Testpartei/Testausschuss/Testthema)",
    specs.every((s) => /^Testpartei [A-F]$/.test(s.party)
      && s.committees.every((c) => /^Testausschuss \d+$/.test(c))
      && s.focusTopics.every((t) => /^Testthema \d+$/.test(t))));
  check("§4.6 Kennungen und E-Mails sind dublettfrei (je 495 verschiedene)",
    new Set(specs.map((s) => s.id)).size === 495 && new Set(specs.map((s) => s.email)).size === 495);
  check("§4.7 Landtag-Spezifikationen tragen Bundesland, Bundestag-Spezifikationen Wahlkreis",
    specs.every((s) => (s.parliamentType === "Landtag" ? Boolean(s.state) : s.parliamentType === "Bundestag" && Boolean(s.constituency))));
}

abschnitt("§5 Inaktiv per Konstruktion, kein Aktivierungswunsch");
{
  const verboten = ["aktiv", "profileActive", "active", "reaktivieren"];
  check("§5.1 KEINE Spezifikation trägt ein Aktivierungswunsch-Feld (der Stapel würde es ablehnen)",
    specs.every((s) => verboten.every((f) => !(f in s))));
  check("§5.2 das Modul kennt keinen Anlage-/Aktivierungspfad (kein provisioning/storage/accounts-Require, kein fetch/fs)",
    !/require\([^)]*provisioning/.test(moduleSrc) && !/require\([^)]*storage/.test(moduleSrc)
    && !/require\([^)]*accounts/.test(moduleSrc) && !/\bfetch\(/.test(moduleSrc) && !/require\("fs"\)/.test(moduleSrc));
}

abschnitt("§6 Passwörter nur zur Laufzeit");
{
  check("§6.1 die deterministische Spezifikation trägt KEIN Passwortfeld",
    specs.every((s) => !("password" in s)) && !JSON.stringify(specs).includes("password"));
  const laufzeit = kohorte.mitLaufzeitPasswort(specs[0]);
  check("§6.2 das Laufzeitpasswort erfüllt die Anlage-Anforderung (≥ 8 Zeichen) und lässt das Original unberührt",
    typeof laufzeit.password === "string" && laufzeit.password.length >= 8 && !("password" in specs[0]));
  const a = kohorte.mitLaufzeitPasswort(specs[0]);
  const b = kohorte.mitLaufzeitPasswort(specs[0]);
  check("§6.3 zwei Laufzeitpasswörter sind verschieden (echter Zufall, kein Wiederverwenden)",
    a.password !== b.password);
  check("§6.4 der Zufall ist nur für Tests injizierbar; Default ist crypto.randomBytes",
    /crypto"\)\.randomBytes\(24\)/.test(moduleSrc));
}

abschnitt("§7 Größenprüfung des Profilbestands (495 Profile)");
{
  const profile = specs.map((s) => buildProfile(
    kohorte.mitLaufzeitPasswort(s, { zufall: () => "laufzeit-passwort-123" }), { aktiv: false }
  ));
  const bytesJeProfil = profile.map((p) => Buffer.byteLength(JSON.stringify(p), "utf8"));
  const gesamt = bytesJeProfil.reduce((a, b) => a + b, 0);
  const groesstes = Math.max(...bytesJeProfil);
  console.log(`  (Messung: ${profile.length} Profile · gesamt ${gesamt} Bytes · größtes ${groesstes} Bytes)`);
  check("§7.1 kein Einzelprofil über 1.500 Bytes (kompakte, neutrale Profile)", groesstes <= 1500);
  check("§7.2 der Gesamtbestand bleibt unter 400 KB (Blob-Verträglichkeit; heutiger main-Blob ~1,24 MB)",
    gesamt <= 400 * 1024);
  check("§7.3 kein Profil trägt ein Passwort (buildProfile filtert die Auth-Felder)",
    profile.every((p) => !("password" in p) && !JSON.stringify(p).includes("laufzeit-passwort-123")));
  check("§7.4 alle 495 Profile sind inaktiv", profile.every((p) => p.profileActive === false));
}

console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
