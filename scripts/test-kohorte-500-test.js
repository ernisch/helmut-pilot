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
//  10. Größenprüfung des Profilbestands,
//  11. REIFE JE POLITISCHER EBENE (ergänzt 03.09., §34.7 Variante A): jede der
//      495 Spezifikationen besteht die für ihre Ebene zuständige Prüfung —
//      Bundestagsprofile die Bundestagsreife gegen die Sollmenge der
//      21. Wahlperiode, Landtagsprofile validateProfile. Mit Regressionsschutz
//      gegen unbekannte und veraltete Ausschussbezeichnungen.
// KEIN Netz, KEIN Storage, KEINE Anlage. Lauf über scripts/lokal.js (CLAUDE.md §6).

const fs = require("fs");
const path = require("path");
const kohorte = require("../lib/helmut/test-kohorte-500");
const { validateSpec, buildProfile } = require("../lib/helmut/provisioning");
const reife = require("../lib/helmut/profile-readiness");
const { validateProfile } = require("../lib/helmut/profile-validation");
const {
  AUSSCHUSS_NAMEN, STAENDIGE_AUSSCHUESSE, VERALTETE_AUSSCHUSSNAMEN, WAHLPERIODE
} = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
const { resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");

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
  // KORRIGIERT 03.09. (§34.7 Variante A): Die frühere Zusicherung „ALLE Ausschüsse
  // sind synthetisch" ist seit der Reifekorrektur FALSCH und darf nicht still
  // falsch stehen bleiben. Parteien und Themen bleiben synthetisch; die
  // Ausschüsse hängen jetzt an der politischen Ebene — und zwar zwingend, weil
  // die Bundestagsreife-Sperre echte Bezeichnungen der 21. WP verlangt.
  check("§4.5 Parteien und Themen sind synthetisch (Testpartei/Testthema)",
    specs.every((s) => /^Testpartei [A-F]$/.test(s.party)
      && s.focusTopics.every((t) => /^Testthema \d+$/.test(t))));
  check("§4.5a LANDTAGSprofile tragen ausschließlich SYNTHETISCHE Ausschüsse (keine Bundestagsbezeichnung auf Landesebene)",
    specs.filter((s) => s.parliamentType === "Landtag")
      .every((s) => s.committees.length > 0
        && s.committees.every((c) => /^Testausschuss \d+$/.test(c) && !AUSSCHUSS_NAMEN.includes(c))));
  check("§4.5b BUNDESTAGSprofile tragen ausschließlich AMTLICHE Ausschüsse der 21. Wahlperiode",
    specs.filter((s) => s.parliamentType === "Bundestag")
      .every((s) => s.committees.length === 2 && s.committees.every((c) => AUSSCHUSS_NAMEN.includes(c))));
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

abschnitt("§8 EUR-Profildeckel (adversariale Analyse 02.09., bestätigter Befund)");
{
  // BEFUND: Die Spezifikation setzte weder `aiBudgetDailyCents` noch
  // `aiBudgetMonthlyCents`. `evaluateTenantBudget` liefert dann
  // `applied:false, allowed:true` — der EINZIGE heute produktiv wirksame
  // Per-Mandant-Deckel war für alle 495 Kohortenprofile ein No-op, während er
  // für reale Mandate mit gesetztem Profilbudget greift.
  check("§8.1 jede Spezifikation trägt einen EUR-Tagesdeckel",
    specs.every((s) => Number.isInteger(s.aiBudgetDailyCents) && s.aiBudgetDailyCents > 0));
  check("§8.2 jede Spezifikation trägt einen EUR-Monatsdeckel",
    specs.every((s) => Number.isInteger(s.aiBudgetMonthlyCents) && s.aiBudgetMonthlyCents > 0));
  check("§8.3 der Tagesdeckel ist wirklich knapp (≤ 25 ct je synthetischem Profil)",
    specs.every((s) => s.aiBudgetDailyCents <= 25));
  check("§8.4 der Monatsdeckel ist nicht kleiner als der Tagesdeckel",
    specs.every((s) => s.aiBudgetMonthlyCents >= s.aiBudgetDailyCents));
  const profile = specs.map((s) => buildProfile(
    kohorte.mitLaufzeitPasswort(s, { zufall: () => "x" }), { aktiv: false }
  ));
  check("§8.5 der Deckel überlebt buildProfile und steht im angelegten Profil",
    profile.every((p) => p.aiBudgetDailyCents === 10 && p.aiBudgetMonthlyCents === 100));
  // EHRLICHE GRENZE, ausdrücklich mitgeprüft: 495 × 10 ct liegt ÜBER der
  // Kostenabbruchgrenze. Dieser Deckel ist ein Rückfallnetz gegen EIN
  // durchdrehendes Profil, nicht die bindende Tagesgrenze.
  check("§8.6 der Deckel ist ausdrücklich NICHT die bindende Tagesgrenze",
    specs.length * specs[0].aiBudgetDailyCents > 1000);
}

abschnitt(`§11 Reife je politischer Ebene (§34.7 Variante A) — Sollmenge WP ${WAHLPERIODE}`);
{
  // Der Provisionierer prüft den INHALT (er hebt die beabsichtigte Inaktivität
  // für die Prüfung auf: `inhaltsprofil`), deshalb hier ebenso.
  const alsInhalt = (spec) => ({
    ...buildProfile(kohorte.mitLaufzeitPasswort(spec, { zufall: () => "laufzeit-passwort-nur-im-test" }), { aktiv: false }),
    profileActive: true
  });
  const bundestag = specs.filter((s) => s.parliamentType === "Bundestag");
  const landtag = specs.filter((s) => s.parliamentType === "Landtag");
  check("§11.0 die Kohorte ist auf beide Ebenen verteilt (kein leerer Teilbestand)",
    bundestag.length + landtag.length === 495 && bundestag.length === 434 && landtag.length === 61,
    `Bundestag ${bundestag.length}, Landtag ${landtag.length}`);

  const btUnreif = bundestag.filter((s) => {
    const r = reife.pruefeNeuaktivierung(alsInhalt(s));
    return !(r.zutreffend === true && r.zulaessig === true);
  });
  check("§11.1 ALLE Bundestagsprofile bestehen die Bundestagsreife (kein bundestagsprofil-nicht-bereit)",
    btUnreif.length === 0,
    btUnreif.length ? `${btUnreif.length} unreif, erste: ${btUnreif[0].id} — ${(reife.pruefeNeuaktivierung(alsInhalt(btUnreif[0])).fehler || [])[0]}` : "");

  const ltFalsch = landtag.filter((s) => {
    const p = alsInhalt(s);
    const r = reife.pruefeNeuaktivierung(p);
    const v = validateProfile(p);
    // Für Landtagsprofile ist die Bundestagsreife ausdrücklich NICHT zuständig
    // (keine Vermischung der Ebenen); zuständig bleibt validateProfile.
    // GESCHAERFT 03.09. (Reviewbefund): die erste Fassung liess alles ausser
    // "fehlerhaft"/"nicht_bereit" durch — sie waere gruen geblieben, wenn die
    // Landtagsprofile auf "unvollstaendig" abgerutscht waeren. Gemessen sind es
    // 61 von 61 "vollstaendig"; genau das wird jetzt zugesichert.
    return r.zutreffend !== false || v.state !== "vollstaendig";
  });
  check("§11.2 ALLE Landtagsprofile: Bundestagsreife nicht zuständig, validateProfile meldet `vollstaendig`",
    ltFalsch.length === 0, ltFalsch.length ? `erste: ${ltFalsch[0].id}` : "");
  check("§11.3 Damit besteht die GESAMTKOHORTE 495/495 die für ihre Ebene zuständige Prüfung",
    btUnreif.length === 0 && ltFalsch.length === 0);

  // Stufengenau — die Provisionierung läuft stufenweise, also muss der Beleg es auch sein.
  const stufen = require("../lib/helmut/testkohorte-stufen");
  const nachId = new Map(specs.map((s) => [s.id, s]));
  for (const st of stufen.STUFEN) {
    const ids = stufen.kennungenDerStufe(st);
    const unreif = ids.filter((id) => {
      const spec = nachId.get(id);
      const r = reife.pruefeNeuaktivierung(alsInhalt(spec));
      return !r.zulaessig;
    });
    check(`§11.4-${st.toUpperCase()} Stufe ${st.toUpperCase()}: ${ids.length}/${ids.length} zulässig`,
      unreif.length === 0 && ids.length === stufen.STUFEN_UMFANG[st],
      unreif.length ? `${unreif.length} unreif` : "");
  }

  // ── REGRESSIONSSCHUTZ (Auftragspunkt 15) ────────────────────────────────
  // Diese Prüfungen müssen ROT werden, sobald ein Bundestagsprofil wieder einen
  // unbekannten oder veralteten Ausschuss trägt. Sie prüfen die SPERRE selbst
  // an einer Attrappe — nicht die Kohorte —, damit der Beleg oben nicht bloß
  // „die Sperre feuert nie" bedeutet.
  const bundestagsprofil = alsInhalt(bundestag[0]);
  check("§11.5 REGRESSION: ein UNBEKANNTER Ausschuss macht ein Bundestagsprofil unreif",
    (() => {
      const r = reife.pruefeNeuaktivierung({ ...bundestagsprofil, committees: ["Testausschuss 1", AUSSCHUSS_NAMEN[0]] });
      return r.zutreffend === true && r.zulaessig === false
        && r.fehler.some((f) => /Testausschuss 1/.test(f) && /Sollmenge|aufloesbar/.test(f));
    })());
  check("§11.6 REGRESSION: eine VERALTETE Bezeichnung einer früheren Wahlperiode macht unreif",
    VERALTETE_AUSSCHUSSNAMEN.every((v) => {
      const r = reife.pruefeNeuaktivierung({ ...bundestagsprofil, committees: [v.name] });
      return r.zulaessig === false;
    }), `geprüft: ${VERALTETE_AUSSCHUSSNAMEN.map((v) => v.name).join(" · ")}`);
  check("§11.7 REGRESSION: auch ein unbekannter STELLVERTRETENDER Ausschuss macht unreif",
    reife.pruefeNeuaktivierung({ ...bundestagsprofil, deputyCommittees: ["Testausschuss 7"] }).zulaessig === false);
  check("§11.8 Jede in der Kohorte verwendete Bundestagsbezeichnung ist einzeln auflösbar",
    [...new Set(bundestag.flatMap((s) => s.committees))]
      .every((c) => reife.resolveBundestagsausschuss(c).ok === true));

  // ── EINE Ausschusswahrheit ───────────────────────────────────────────────
  // §11.9 ist eine QUELLTEXTPRÜFUNG und damit schwach (Reviewbefund 03.09.): sie
  // sieht Kurzformnamen wie „Innenausschuss", Unicode-Escapes und Blockkommentare
  // nicht. Sie steht hier nur als früher, gut lesbarer Hinweis. Der TRAGENDE
  // Beleg ist §11.11: die tatsächlich benutzte Namensmenge ist exakt die
  // Sollmenge — eine abgeschriebene oder veraltete Kopie fiele dort auf.
  check("§11.9 Der Generator führt KEINE eigene Namensliste — er lädt die Sollmenge",
    /require\("\.\/quellenarchitektur\/seeds\/bundestag-ausschuesse"\)/.test(moduleSrc)
      && !/Ausschuss für /.test(moduleSrc.replace(/\/\/.*$/gm, "")),
    "eine zweite Namensliste wäre eine zweite Ausschusswahrheit");
  // ERSETZT 03.09. (Reviewbefund): die erste Fassung verglich
  // `BUNDESTAGSAUSSCHUESSE` gegen `AUSSCHUSS_NAMEN` — per Destructuring immer
  // dasselbe Objekt, also eine Tautologie. Sie sagte nichts darüber, ob
  // `baueSpezifikation` die Konstante auch BENUTZT. Geprüft wird deshalb der
  // erzeugte Bestand gegen die Sollmenge, Element für Element.
  check("§11.10 Jede erzeugte Bezeichnung steht byte-identisch in der Sollmenge",
    (() => {
      const soll = new Set(STAENDIGE_AUSSCHUESSE.map((a) => a.name));
      const benutzt = [...new Set(bundestag.flatMap((s) => s.committees))];
      return benutzt.length > 0 && benutzt.every((c) => soll.has(c));
    })());
  check("§11.11 Alle 24 Ausschüsse der Sollmenge werden auch wirklich genutzt (keine tote Teilmenge)",
    new Set(bundestag.flatMap((s) => s.committees)).size === STAENDIGE_AUSSCHUESSE.length);
  check("§11.12 Kein Profil trägt denselben Ausschuss doppelt",
    specs.every((s) => new Set(s.committees).size === s.committees.length));
  check("§11.13 Determinismus: zwei Aufrufe liefern dieselben Ausschüsse",
    JSON.stringify(kohorte.baueKohorte().map((s) => s.committees))
      === JSON.stringify(specs.map((s) => s.committees)));

  // ── PAKETWIRKUNG (Auftragspunkt 12) ─────────────────────────────────────
  // Die echten Bezeichnungen ziehen Fachpakete. Das ist gewollt (realistische
  // Last), muss aber BEZIFFERT sein — eine unbemerkte Vervielfachung wäre ein
  // Lastrisiko für den 500er-Testlauf.
  const paketZaehler = new Map();
  for (const spec of specs) {
    for (const k of resolveProfilePackages(alsInhalt(spec)).optional) {
      if (k.startsWith("profil-")) continue;   // personenbezogener Platzhalter, kein Paket
      paketZaehler.set(k, (paketZaehler.get(k) || 0) + 1);
    }
  }
  check("§11.14 Die echten Ausschüsse ziehen GENAU EIN zusätzliches Sachpaket, kein weiteres",
    paketZaehler.size === 1 && paketZaehler.has("arbeit-und-soziales"),
    `gezogen: ${[...paketZaehler].map(([k, n]) => `${k}=${n}`).join(", ") || "keines"}`);
  check("§11.15 Es trifft 42 der 495 Profile — genau die mit dem Ausschuss für Arbeit und Soziales",
    paketZaehler.get("arbeit-und-soziales") === 42
      && specs.filter((s) => s.committees.includes("Ausschuss für Arbeit und Soziales")).length === 42);
  check("§11.16 Jedes Profil bleibt bei höchstens EINEM Sachpaket (keine Mehrfachzuordnung)",
    specs.every((s) => resolveProfilePackages(alsInhalt(s)).optional
      .filter((k) => !k.startsWith("profil-")).length <= 1));
}

console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
