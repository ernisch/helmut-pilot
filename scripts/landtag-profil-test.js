"use strict";

// Offline-Test des Landtagsprofil-Modells (Landtag-Sprint Phase 3). REINE LOGIK, kein Netz/DB.
// Beweist: (1) die anonymen Fixtures sind valide, nutzbare Landtagsprofile, (2) alle
// geforderten Felder (Bundesland, Parlament, Wahlkreis, Partei, Fraktion, Ausschuesse,
// Sprecherrollen, Funktionen, regionale Zustaendigkeiten, Ministerien, Behoerden, Medien)
// werden unterstuetzt UND ueberleben den DB-Roundtrip (profil_extras verlustfrei),
// (3) Paket-Aufloesung: Berlin-Profil -> berlin-basis, Brandenburg -> brandenburg-basis,
// KEINE Kreuz-Kontamination, (4) Bundestagsprofile bleiben unberuehrt.

const fs = require("fs");
const path = require("path");
const { landtagProfilStatus, LANDTAG_PROFILE_FIELDS } = require("../lib/helmut/landtag-profil");
const { validateProfile } = require("../lib/helmut/profile-validation");
const { resolveProfilePackages, profileSupplyStatus } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { toMandateProfileRow, fromMandateProfileRow } = require("../lib/helmut/storage");
const { resolveParlament } = require("../lib/helmut/parlamente");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "profiles", n), "utf8"));
  delete raw._hinweis;
  return raw;
}

const be = fx("landtag-berlin-testprofil.json");
const bb = fx("landtag-brandenburg-testprofil.json");

// --- 1. Fixtures sind valide, nutzbare Landtagsprofile ----------------------------------------
for (const [label, p, parlamentKey] of [["Berlin", be, "abgeordnetenhaus-berlin"], ["Brandenburg", bb, "landtag-brandenburg"]]) {
  const v = validateProfile(p);
  check(`1 ${label}: validateProfile vollstaendig + nutzbar`, v.ready === true && v.usable === true && v.parliamentType === "Landtag");
  check(`1 ${label}: Parlament korrekt aufgeloest`, resolveParlament(p).key === parlamentKey);
  const st = landtagProfilStatus(p);
  check(`1 ${label}: alle erweiterten Landtag-Felder belegt`, st.istLandtag === true && st.vollstaendigErweitert === true);
}

// --- 2. Anonymitaet: Fixtures tragen keine echten Personennamen -------------------------------
check("2 Fixtures sind anonym (Testprofil-Namen, test-Ids)",
  /^Testprofil /.test(be.fullName) && /^Testprofil /.test(bb.fullName)
  && be.id.startsWith("test-") && bb.id.startsWith("test-"));

// --- 3. DB-Roundtrip: JEDES Feld ueberlebt (Spalte ODER profil_extras) ------------------------
for (const [label, p] of [["Berlin", be], ["Brandenburg", bb]]) {
  const row = toMandateProfileRow(p);
  const back = fromMandateProfileRow({ id: p.id, name: p.fullName }, { ...row, updated_at: "2026-07-17T00:00:00Z" });
  check(`3 ${label}: Kernfelder ueberleben den Roundtrip`,
    back.state === p.state && back.constituency === p.constituency
    && back.party === p.party && back.faction === p.faction
    && JSON.stringify(back.committees) === JSON.stringify(p.committees)
    && back.parliamentType === "Landtag");
  check(`3 ${label}: erweiterte Felder reisen verlustfrei ueber profil_extras`,
    JSON.stringify(back.speakerRoles) === JSON.stringify(p.speakerRoles)
    && JSON.stringify(back.functions) === JSON.stringify(p.functions)
    && JSON.stringify(back.relevantAuthorities) === JSON.stringify(p.relevantAuthorities)
    && JSON.stringify(back.relevantMedia) === JSON.stringify(p.relevantMedia)
    && back.parliament === p.parliament);
  check(`3 ${label}: politische_ebene='landtag' in der DB-Zeile (CHECK-konform)`, row.politische_ebene === "landtag");
  const st = landtagProfilStatus(back);
  check(`3 ${label}: Vollstaendigkeit auch NACH Roundtrip erhalten`, st.vollstaendigErweitert === true);
}

// --- 4. Paket-Aufloesung + Landes-Isolation ----------------------------------------------------
const pkgBe = resolveProfilePackages(be);
const pkgBb = resolveProfilePackages(bb);
check("4a Berlin-Profil -> bund-basis + berlin-basis als Pflicht", JSON.stringify(pkgBe.required) === JSON.stringify(["bund-basis", "berlin-basis"]));
check("4b Brandenburg-Profil -> bund-basis + brandenburg-basis als Pflicht", JSON.stringify(pkgBb.required) === JSON.stringify(["bund-basis", "brandenburg-basis"]));
check("4c ISOLATION: Berlin-Profil referenziert NIE brandenburg-basis (und umgekehrt)",
  !pkgBe.all.includes("brandenburg-basis") && !pkgBb.all.includes("berlin-basis"));

// --- 5. Nichtaktivierung: prepared-Landespakete lassen Profile ehrlich unversorgt -------------
const supplyBe = profileSupplyStatus(be, {});
check("5a Berlin-Profil ist aktivierungsberechtigt, aber NICHT vollversorgt (Paket prepared)",
  supplyBe.eligible === true && supplyBe.fullyActivated === false
  && supplyBe.missingBasePackages.some((m) => m.key === "berlin-basis"));

// --- 6. Bundestagsprofil bleibt unberuehrt -----------------------------------------------------
const bt = { id: "test-bund", fullName: "Testprofil Bund", party: "SPD", committees: ["Arbeit und Soziales"], state: "Niedersachsen", politische_ebene: "bundestag" };
check("6a Bundestagsprofil: kein Landespaket, DIP-Parlament bundestag",
  JSON.stringify(resolveProfilePackages(bt).required) === JSON.stringify(["bund-basis"])
  && resolveParlament(bt).key === "bundestag");
const stBt = landtagProfilStatus(bt);
check("6b landtagProfilStatus erkennt Bundestagsprofil als Nicht-Landtag (nur beratend)", stBt.istLandtag === false);

// --- 7. Modell-Vollstaendigkeit: alle 12 geforderten Feldgruppen definiert --------------------
const geforderteFelder = ["bundesland", "parliament", "wahlkreis", "partei", "fraktion", "ausschuesse",
  "speakerRoles", "functions", "regionalTopics", "relevantMinistries", "relevantAuthorities", "relevantMedia"];
check("7 LANDTAG_PROFILE_FIELDS deckt alle geforderten Feldgruppen ab",
  geforderteFelder.every((k) => LANDTAG_PROFILE_FIELDS.some((f) => f.key === k)));

console.log(`\n== Landtagsprofil-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
