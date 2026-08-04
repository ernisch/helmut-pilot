"use strict";

// Sprint "Profilreife" (2026-08-04) — Bundestags-Bereitschaftsvertrag, Prüfwerkzeug,
// Testmandate-Seed und Reparaturpaket. KEIN Netz, KEINE echte DB, deterministisch.
//
// Deckt die 21 geforderten Regressionsfälle des Auftrags ab (Phase 10) plus den
// gemeinsamen Bestandstest mit elf Profilen (Phase 9). Synthetische Identitäten für
// die Vertragsfälle; die fünf realen, DEAKTIVIERTEN Testmandate kommen aus dem
// belegten Seed (seeds/bundestag-testmandate.js), die sechs Bestandsrepräsentationen
// aus dem Reparaturpaket-Fixture (minimale politische Felder, kein Roh-Export).

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  FELDKLASSEN,
  istKlarname,
  resolveBundestagsausschuss,
  bewerteBundestagsprofil,
  bewerteProfilbestand,
  pruefeNeuaktivierung
} = require("../lib/helmut/profile-readiness");
const provisioning = require("../lib/helmut/provisioning");
const { validateProfile } = require("../lib/helmut/profile-validation");
const { TESTMANDATE, BESTANDSMANDATE_IDS, validateTestmandate } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-testmandate");
const { BESTAND_IST, REPARATUREN, wendeReparaturAn } = require("./fixtures/profil-reparatur-2026-08-04");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Vollständig gültiges, synthetisches Bundestagsprofil (Basis vieler Fälle).
const vollstaendig = Object.freeze({
  id: "rt-synth-eins",
  fullName: "Testperson Eins",
  party: "SPD",
  faction: "SPD",
  parliamentType: "Bundestag",
  state: "Berlin",
  constituency: "Testkreis Süd",
  committees: ["Haushalt"],
  focusTopics: ["Finanzen"],
  topicPriorities: { Finanzen: 5 },
  nameVariants: ["T. Eins"],
  regionalInterests: ["Teststadt"],
  profileActive: true
});

(async () => {
  // ── (1) vollständig gültiges Bundestagsprofil ─────────────────────────────
  const e1 = bewerteBundestagsprofil(vollstaendig);
  check("1. vollständiges Profil: bereit, keine Blocker/Warnungen", e1.zutreffend && e1.bereit && e1.warnungen.length === 0 && e1.fehlend.length === 0 && e1.ungueltig.length === 0);

  // ── (2) fehlende technische Pflichtangabe (id) ────────────────────────────
  const e2 = bewerteBundestagsprofil({ ...vollstaendig, id: "" });
  check("2. fehlende id: nicht bereit, Klasse technisch_zwingend", !e2.bereit && e2.fehlend.some((f) => f.feld === "id" && f.klasse === FELDKLASSEN.TECHNISCH));

  // ── (3) fehlende fachliche Pflichtangabe (Partei) ─────────────────────────
  const e3 = bewerteBundestagsprofil({ ...vollstaendig, party: "", faction: "" });
  check("3. fehlende Partei: nicht bereit, Klasse fachlich_zwingend", !e3.bereit && e3.fehlend.some((f) => f.feld === "partei_oder_fraktionslos" && f.klasse === FELDKLASSEN.FACHLICH));

  // ── (4) optionale Qualitätswarnung (Bundesland fehlt, Region über Wahlkreis) ─
  const e4 = bewerteBundestagsprofil({ ...vollstaendig, state: "" });
  check("4. fehlendes Bundesland: bereit, aber Warnung", e4.bereit && e4.warnungen.some((w) => w.feld === "state"));

  // ── (5) leerer Text und reine Leerzeichen ─────────────────────────────────
  const e5 = bewerteBundestagsprofil({ ...vollstaendig, party: "   ", faction: "\t", committees: ["   "], focusTopics: [" "], topicPriorities: {} });
  check("5. Leerzeichen-Werte werden als fehlend erkannt", !e5.bereit
    && e5.fehlend.some((f) => f.feld === "partei_oder_fraktionslos")
    && e5.fehlend.some((f) => f.feld === "schwerpunkt_oder_ausschuss"));

  // ── (6) leere und doppelte Listen ─────────────────────────────────────────
  const e6 = bewerteBundestagsprofil({ ...vollstaendig, committees: ["Haushalt", "haushalt "], focusTopics: ["Finanzen", "Finanzen"] });
  check("6. doppelte Listeneinträge werden gemeldet", e6.duplikate.some((d) => d.feld === "committees") && e6.duplikate.some((d) => d.feld === "focusTopics"));

  // ── (7) ungültige politische Ebene ────────────────────────────────────────
  const e7 = bewerteBundestagsprofil({ ...vollstaendig, parliamentType: "Kreistag", politicalLevel: "" });
  check("7. ungültige Ebene: nicht zutreffend + mandatsebene als fehlend", !e7.zutreffend && e7.fehlend.some((f) => f.feld === "mandatsebene"));

  // ── (8) fehlendes Bundesland — Landtag wird NICHT vermischt ───────────────
  const landtagsprofil = { ...vollstaendig, id: "rt-synth-lt", parliamentType: "Landtag", state: "" };
  const e8 = bewerteBundestagsprofil(landtagsprofil);
  const v8 = validateProfile(landtagsprofil);
  check("8. Landtagsprofil: Bundestagsprüfung nicht zuständig, validateProfile meldet bundesland", !e8.zutreffend && v8.missingRequired.includes("bundesland"));

  // ── (9) ungültige Ausschusszuordnung (WP-20-Bezeichnung) ──────────────────
  const e9 = bewerteBundestagsprofil({ ...vollstaendig, committees: ["Bildung, Forschung und Technikfolgenabschätzung"] });
  check("9. WP-20-Ausschuss: ungültig mit Produktfolge", !e9.bereit && e9.ungueltig.some((u) => u.feld === "committees" && u.grund.includes("Zustaendigkeitsbelege")));
  check("9b. Kurzformen der WP-21-Ausschüsse lösen auf", resolveBundestagsausschuss("Europäische Union").ok && resolveBundestagsausschuss("Innenausschuss").key === "inneres-heimat");

  // ── (10) doppelte persönliche Quelle ──────────────────────────────────────
  const b10 = bewerteProfilbestand([vollstaendig], {
    personalSources: [
      { profileId: "rt-synth-eins", id: "rt-synth-eins-news", query: '"Testperson Eins"' },
      { profileId: "rt-synth-eins", id: "rp-rt-synth-eins-news", query: '"Testperson Eins"' }
    ]
  });
  check("10. doppelte eigene Quelle (gleiche Query) wird gemeldet", b10.probleme.some((p) => p.art === "quelle_doppelt"));

  // ── (11) zulässige geteilte amtliche Quelle ist KEIN Duplikat ─────────────
  const zwei = { ...vollstaendig, id: "rt-synth-zwei", fullName: "Testperson Zwei" };
  const b11 = bewerteProfilbestand([vollstaendig, zwei], { personalSources: [] });
  check("11. geteilte Quellen erzeugen keine Duplikat-Meldung", b11.ok === true && b11.probleme.length === 0);

  // ── (12) falsche Mandatszuordnung einer persönlichen Quelle ───────────────
  const b12 = bewerteProfilbestand([vollstaendig, zwei], {
    personalSources: [{ profileId: "rt-synth-eins", id: "rt-synth-eins-fremd", query: '"Testperson Zwei" when:3m' }]
  });
  check("12. eigene Quelle mit fremdem Klarnamen wird als Fehlzuordnung gemeldet", b12.probleme.some((p) => p.art === "quelle_falsch_zugeordnet" && p.profil === "rt-synth-eins"));

  // ── (13) mögliche Mandantenvermischung (gleicher Klarname, zwei aktive Mandate) ─
  const b13 = bewerteProfilbestand([vollstaendig, { ...zwei, fullName: "Testperson Eins" }]);
  check("13. gleicher Klarname auf zwei aktiven Mandaten ist ein Problem", b13.probleme.some((p) => p.art === "personenname_doppelt"));
  const b13b = bewerteProfilbestand([vollstaendig, { ...zwei, fullName: "Testperson Eins", profileActive: false }]);
  check("13b. dasselbe mit deaktiviertem Zweitmandat ist nur Warnung", b13b.probleme.every((p) => p.art !== "personenname_doppelt") && b13b.warnungen.some((w) => w.art === "personenname_doppelt"));

  // ── (14) Profil ohne Benutzerkonto ist datenmotorfähig ────────────────────
  const e14 = bewerteBundestagsprofil(vollstaendig); // kein email/password/Konto-Feld vorhanden
  check("14. Profil ohne Konto-Felder: bereit (Konto ist nicht Teil des Vertrags)", e14.bereit === true);

  // ── (15) Aktivierungsversuch eines unvollständigen Profils wird abgewiesen ─
  // Residuen-Schutz: .helmut-data wird von allen Suiten geteilt; ein frueherer Lauf
  // (z. B. eine Basislinie OHNE Sperre) kann die synthetische id bereits provisioniert
  // haben — dann greift der fail-closed-Bestandsschutz statt der Sperre. Deshalb
  // vorab strikt auf die synthetische id gescopet aufraeumen.
  const accounts = require("../lib/helmut/accounts");
  await accounts.deleteAuthDataForPolitician("rt-prov-unvoll").catch(() => {});
  const specUnvollstaendig = {
    id: "rt-prov-unvoll", email: "rt-unvoll@synthetic.test", name: "rt-prov-unvoll",
    password: "test-pass-123", party: "SPD", parliamentType: "Bundestag",
    state: "Berlin", constituency: "Testkreis", committees: ["Bildung, Forschung und Technikfolgenabschätzung"], focusTopics: ["Netz"]
  };
  const r15 = await provisioning.provisionTenant(specUnvollstaendig);
  check("15. provisionTenant weist unvollständiges BT-Profil ab (Slug-Name + WP-20-Ausschuss)",
    r15.ok === false && r15.reason === "bundestagsprofil-nicht-bereit" && Array.isArray(r15.errors) && r15.errors.length >= 2,
    JSON.stringify(r15.reason));
  check("15b. Abweisung nennt die konkreten Angaben", (r15.errors || []).some((e) => e.includes("fullName")) && (r15.errors || []).some((e) => e.includes("committees")));
  check("15c. Abweisung erfolgt VOR jedem Write (kein Nutzer angelegt)", r15.log.every((l) => l.step !== "auth-nutzer" && l.step !== "profil"));

  // ── (16) Aktivierungsversuch eines vollständigen Profils funktioniert ─────
  const dataDir = path.join(__dirname, "..", ".helmut-data");
  const guarded = ["store.json", "auth.json", "p-rt-prov-voll.json"].map((f) => path.join(dataDir, f));
  const backups = guarded.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null));
  const specVoll = {
    id: "rt-prov-voll", email: "rt-voll@synthetic.test", name: "Test Abgeordnete Voll",
    password: "test-pass-456", party: "SPD", parliamentType: "Bundestag",
    state: "Berlin", constituency: "Testkreis", committees: ["Haushalt"], focusTopics: ["Finanzen"]
  };
  let r16;
  try {
    await accounts.deleteAuthDataForPolitician("rt-prov-voll").catch(() => {}); // Residuen-Schutz wie in (15)
    r16 = await provisioning.provisionTenant(specVoll);
    check("16. provisionTenant lässt vollständiges BT-Profil durch", r16 && r16.ok === true, JSON.stringify(r16 && (r16.reason || r16.errors)));
    check("16b. Protokoll enthält bestandenen Bundestagsreife-Schritt", (r16.log || []).some((l) => l.step === "bundestagsreife" && l.status === "ok"));
    await provisioning.teardownTenant("rt-prov-voll");
  } finally {
    guarded.forEach((f, i) => {
      if (backups[i] === null) { try { fs.unlinkSync(f); } catch (_) {} }
      else fs.writeFileSync(f, backups[i]);
    });
  }

  // ── (17) unverändertes Verhalten für bereits aktive Profile ───────────────
  // Ein Bestandsprofil mit Mangel bleibt in der laufenden Verarbeitung nutzbar:
  // validateProfile (die einzige Gate-Logik der Jobs) ändert sich nicht, und die
  // Bereitschafts-Bewertung deaktiviert nichts (reine Funktion ohne Writes).
  const bestandMitMangel = BESTAND_IST.find((p) => p.id === "ottilie-paola-klein-2");
  const v17 = validateProfile(bestandMitMangel);
  const e17 = bewerteBundestagsprofil(bestandMitMangel);
  check("17. Bestandsprofil mit Mangel: weiter nutzbar (usable) und aktiv, nur Bereitschafts-Befund", v17.usable === true && !v17.disabled && e17.aktiv === true && e17.bereit === false);
  check("17b. Bewertung verändert das Profil nicht (kein Write, kein Mutieren)", bestandMitMangel.committees.length === 3 && bestandMitMangel.profileActive === true);

  // ── (18) fünf neue Testmandate: Seed-Vertrag + Vollständigkeit ────────────
  const seedCheck = validateTestmandate();
  check("18. Seed-Selbstschutz (Kennungen, deaktiviert, markiert, belegt, ohne Konto-Felder)", seedCheck.ok, seedCheck.fehler.join("; "));
  check("18b. genau fünf Testmandate, alle fünf Fraktionen der 21. WP",
    TESTMANDATE.length === 5 && new Set(TESTMANDATE.map((t) => t.faction)).size === 5);
  check("18c. fünf verschiedene Bundesländer", new Set(TESTMANDATE.map((t) => t.state)).size === 5);
  for (const t of TESTMANDATE) {
    const et = bewerteBundestagsprofil(t);
    check(`18d. ${t.id}: besteht den Vollständigkeitsvertrag (deaktiviert, inhaltlich bereit)`,
      et.zutreffend && et.bereit && et.aktiv === false,
      JSON.stringify({ fehlend: et.fehlend, ungueltig: et.ungueltig, widersprueche: et.widersprueche }));
  }
  check("18e. Testmandate sind per validateProfile 'deaktiviert' (keine Referenzzählung/Verarbeitung)",
    TESTMANDATE.every((t) => validateProfile(t).state === "deaktiviert"));

  // ── (19) gemeinsamer Bestand von elf Profilen ─────────────────────────────
  const elf = [...BESTAND_IST, ...TESTMANDATE];
  check("19. elf Profile mit eindeutigen Kennungen", new Set(elf.map((p) => p.id)).size === 11);
  const b19 = bewerteProfilbestand(elf);
  check("19b. alle elf als Bundestag klassifiziert, keine Ebenen-Vermischung", b19.bundestag.length === 11 && b19.landtag.length === 0 && b19.ohneEbene.length === 0);
  check("19c. Testmandate kollidieren nicht mit Bestand (ids + keine neuen Namensduplikate)",
    TESTMANDATE.every((t) => !BESTANDSMANDATE_IDS.includes(t.id))
    && b19.probleme.filter((p) => p.art === "personenname_doppelt").length === 1);
  check("19d. das einzige Namensduplikat ist der belegte Bestandsbefund (Demo-Mandat)",
    b19.probleme.some((p) => p.art === "personenname_doppelt" && p.profil.includes("max-mustermann") && p.profil.includes("ottilie-paola-klein-2")));
  // Reparaturvorlage: jedes nicht-bereite Bestandsprofil hat belegte Einträge, und die
  // Anwendung der belegten Vorschläge macht die Datenfehler-Fälle bereit.
  for (const p of BESTAND_IST) {
    const e = bewerteBundestagsprofil(p);
    if (e.bereit) continue;
    const rep = REPARATUREN.find((r) => r.id === p.id);
    check(`19e. ${p.id}: nicht bereit -> Reparaturvorlage vorhanden und belegt`,
      Boolean(rep) && rep.felder.every((f) => f.quelle && f.abrufdatum && f.grund));
  }
  const kloseRepariert = bewerteBundestagsprofil(wendeReparaturAn(BESTAND_IST.find((p) => p.id === "annika-klose"), REPARATUREN.find((r) => r.id === "annika-klose")));
  const kleinRepariert = bewerteBundestagsprofil(wendeReparaturAn(BESTAND_IST.find((p) => p.id === "ottilie-paola-klein-2"), REPARATUREN.find((r) => r.id === "ottilie-paola-klein-2")));
  check("19f. belegte Reparaturen machen annika-klose und ottilie-paola-klein-2 bereit", kloseRepariert.bereit && kleinRepariert.bereit,
    JSON.stringify({ klose: kloseRepariert.hinweise, klein: kleinRepariert.hinweise }));
  check("19g. Reparaturanwendung ist idempotent", JSON.stringify(wendeReparaturAn(wendeReparaturAn(BESTAND_IST[0], REPARATUREN[0]), REPARATUREN[0])) === JSON.stringify(wendeReparaturAn(BESTAND_IST[0], REPARATUREN[0])));

  // ── (20) deterministische und stabile Fehlerausgabe ───────────────────────
  const chaotisch = { ...vollstaendig, committees: ["Zukunftsrat", "Bildung, Forschung und Technikfolgenabschätzung"], focusTopics: [], topicPriorities: {}, state: "", nameVariants: [], regionalInterests: [] };
  const l1 = JSON.stringify(bewerteBundestagsprofil(chaotisch));
  const l2 = JSON.stringify(bewerteBundestagsprofil({ ...chaotisch }));
  check("20. gleiche Eingabe -> identische Ausgabe (deterministisch)", l1 === l2);
  const u = bewerteBundestagsprofil(chaotisch).ungueltig.map((x) => x.wert);
  check("20b. Listen stabil sortiert", JSON.stringify(u) === JSON.stringify([...u].sort((a, b) => a.localeCompare(b, "de"))));

  // ── (21) keine Production-Abhängigkeit + Prüfwerkzeug über Fixtures ───────
  const fixtureDatei = path.join(os.tmpdir(), `profil-bereitschaft-fixture-${process.pid}.json`);
  fs.writeFileSync(fixtureDatei, JSON.stringify({ profiles: elf, personalSources: [] }));
  try {
    const umgebung = { ...process.env, HELMUT_STORAGE_BACKEND: "local" };
    delete umgebung.SUPABASE_URL; delete umgebung.SUPABASE_SERVICE_ROLE_KEY;
    const lauf = spawnSync(process.execPath, [path.join(__dirname, "profil-bereitschaft.js"), "--fixtures", fixtureDatei, "--json"], { encoding: "utf8", env: umgebung });
    check("21. Werkzeug läuft offline über Fixtures (Exit 2 wegen belegter Bestandsbefunde)", lauf.status === 2, `exit=${lauf.status} stderr=${(lauf.stderr || "").slice(0, 120)}`);
    const befund = JSON.parse(lauf.stdout);
    check("21b. JSON-Ausgabe: 11 Profile, Bestandsblock vorhanden, keine Secrets-Felder", befund.profile.length === 11 && befund.bestand && !JSON.stringify(befund).includes("SUPABASE"));
    const lauf2 = spawnSync(process.execPath, [path.join(__dirname, "profil-bereitschaft.js"), "--fixtures", fixtureDatei, "--json"], { encoding: "utf8", env: umgebung });
    check("21c. Werkzeug-Ausgabe ist deterministisch (zwei Läufe byte-identisch)", lauf.stdout === lauf2.stdout);
    const nurFuenf = path.join(os.tmpdir(), `profil-bereitschaft-fixture5-${process.pid}.json`);
    fs.writeFileSync(nurFuenf, JSON.stringify({ profiles: TESTMANDATE, personalSources: [] }));
    const lauf3 = spawnSync(process.execPath, [path.join(__dirname, "profil-bereitschaft.js"), "--fixtures", nurFuenf], { encoding: "utf8", env: umgebung });
    check("21d. fünf Testmandate allein: Exit 0 (bereit, keine Blocker)", lauf3.status === 0, `exit=${lauf3.status}`);
    fs.unlinkSync(nurFuenf);
    const laufFehler = spawnSync(process.execPath, [path.join(__dirname, "profil-bereitschaft.js"), "--fixtures", "/nicht/vorhanden.json"], { encoding: "utf8", env: umgebung });
    check("21e. Ladefehler -> Exit 3", laufFehler.status === 3);
  } finally {
    try { fs.unlinkSync(fixtureDatei); } catch (_) {}
  }

  // ── Zusatz: Klarnamen-Helfer + Landtag/Bundestag-Nichtvermischung im Gate ──
  check("Z1. istKlarname erkennt Slug/Einzelwort/leer", !istKlarname({ id: "a-b", fullName: "a-b" }) && !istKlarname({ fullName: "Einwort" }) && istKlarname({ fullName: "Zwei Worte" }));
  const gateLandtag = pruefeNeuaktivierung({ ...landtagsprofil, state: "Berlin" });
  check("Z2. Neuaktivierungs-Gate greift für Landtag NICHT (Altregel bleibt)", gateLandtag.zutreffend === false && gateLandtag.zulaessig === true);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error("Testlauf abgebrochen:", err);
  process.exit(1);
});
