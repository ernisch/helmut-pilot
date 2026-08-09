"use strict";

// Helmut — IMPORTVERTRAG FÜR MANDATSPROFILE (OP-30, Vorbereitung 200 Mandate).
// =============================================================================================
// Geprüft wird BEIDES:
//   (a) dass ein vertragskonformes Profil vom ECHTEN Produktionscode als vollständig
//       anerkannt wird (`profile-validation.validateProfile` -> Zustand "vollstaendig",
//       `scheduler.getSourcesForProfile` -> nutzbare Quellen). Ohne diesen Teil wäre der
//       Vertrag eine Wunschliste: er verspräche etwas über Helmut, ohne Helmut zu fragen.
//   (b) dass jede einzelne Regel wirklich greift — jeweils mit einem GEGENBEISPIEL, das
//       genau daran scheitert. Eine Regel ohne Gegenbeispiel ist nicht bewiesen.
//
// Ausserdem: die mitgelieferte Beispieldatei wird geprüft, das JSON-Schema wird gegen den
// Validator abgeglichen (zwei Wahrheiten über dieselben Felder wären ein Fehler in sich),
// und es wird nachgewiesen, dass ein Import NIEMALS aktiviert.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const IMPORT = require(path.join(ROOT, "lib/helmut/profil-import.js"));
const validation = require(path.join(ROOT, "lib/helmut/profile-validation.js"));
const config = require(path.join(ROOT, "lib/helmut/config.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

const SCHEMA_PFAD = path.join(ROOT, "schemas/mandatsprofil-import.schema.json");
const BEISPIEL_PFAD = path.join(ROOT, "docs/beispiele/mandatsprofile-beispiel.json");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Ein vertragskonformes Profil. Bewusst als Funktion, damit jede Probe eine frische Kopie
// bekommt und Mutationen sich nicht gegenseitig beeinflussen.
function gutesProfil(ueber = {}) {
  return {
    mandatsId: "erika-beispiel",
    vollname: "Erika Beispiel",
    parlament: "bundestag",
    partei: "Beispielpartei",
    fraktion: "Beispielpartei",
    bundesland: "Niedersachsen",
    wahlkreis: "Beispielstadt — Beispielland",
    ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    themen: ["Arbeitsmarkt", "Rente"],
    offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/abgeordnete/erika-beispiel" }],
    aktiv: false,
    ...ueber
  };
}
const datei = (profile) => ({ version: IMPORT.VERTRAGSVERSION, profile });

// Eine Regel gilt als bewiesen, wenn das Gegenbeispiel GENAU mit dem erwarteten Code scheitert.
function regel(name, mutation, code) {
  const p = gutesProfil();
  mutation(p);
  const e = IMPORT.pruefeImport(datei([p]));
  const codes = [...e.fehler.map((f) => f.code), ...e.ergebnisse.flatMap((r) => r.fehler.map((f) => f.code))];
  check(name, e.ok === false && codes.includes(code), `Codes: ${codes.join(", ") || "(keine)"}`);
}

function main() {
  console.log("Helmut — Importvertrag für Mandatsprofile (OP-30)\n");

  // ── 1 · Der Vertrag ist mit dem echten Produktionscode einig ──────────────────────────
  abschnitt("1 · Ein vertragskonformes Profil ist für Helmut wirklich vollständig");
  {
    const e = IMPORT.pruefeImport(datei([gutesProfil()]));
    check("1.1 Der Prüfer akzeptiert es", e.ok === true, IMPORT.berichte(e).split("\n").slice(-1)[0]);

    const helmut = IMPORT.zuHelmutProfil(gutesProfil());
    const v = validation.validateProfile({ ...helmut, profileActive: true });
    check("1.2 `validateProfile` meldet den Zustand `vollstaendig` — nicht `teilweise`",
      v.state === validation.STATES.COMPLETE, `${v.state}: ${v.missingRequired.join(", ") || "nichts fehlt"}`);
    check("1.3 Es fehlt kein einziges Pflichtfeld", v.missingRequired.length === 0, JSON.stringify(v.missingRequired));
    check("1.4 Helmut kann es voll versorgen",
      v.impact.kannBriefingErhalten && v.impact.kannRadar && v.impact.kannLagePersonalisieren,
      JSON.stringify(v.impact));
    check("1.5 Die Mandatsebene wird korrekt erkannt",
      config.parliamentTypeOf(helmut) === "Bundestag", config.parliamentTypeOf(helmut));

    // WICHTIG: das importierte Profil ist DEAKTIVIERT — und der Produktionscode sieht das.
    const roh = IMPORT.zuHelmutProfil(gutesProfil());
    check("1.6 Das abgebildete Profil ist deaktiviert", validation.isDisabled(roh) === true);
    check("1.7 Der Produktionscode stuft es folgerichtig als `deaktiviert` ein",
      validation.validateProfile(roh).state === validation.STATES.DISABLED,
      validation.validateProfile(roh).state);
  }

  abschnitt("2 · Aus dem Profil entstehen echte, nutzbare Quellen");
  {
    const helmut = { ...IMPORT.zuHelmutProfil(gutesProfil()), profileActive: true };
    const person = sched.personNewsSource(helmut);
    check("2.1 Die Personensuche trägt den Vollnamen (nicht die Kennung)",
      person.nameQueryComplete === true && /Erika%20Beispiel|Erika\+Beispiel/.test(person.rssUrl),
      person.rssUrl.slice(0, 90));
    check("2.2 Sie hat genau zwei Abrufwege (aktuell + Archiv)", person.rssUrls.length === 2);
    const mandats = sched.mandateNewsSources(helmut);
    check("2.3 Aus Ausschuss, Themen, Partei und Region entstehen mandatsbezogene Quellen",
      mandats.length >= 3, `${mandats.length} Quellen`);
    check("2.4 Jede erzeugte Quelle hat mindestens einen Abrufweg",
      mandats.every((q) => (q.rssUrls && q.rssUrls.length) || q.rssUrl));

    // GEGENPROBE: ohne Vollname fällt die Personensuche auf den Slug zurück — genau das
    // will der Vertrag verhindern, deshalb ist `vollname` Pflicht.
    const ohneNamen = sched.personNewsSource({ ...helmut, fullName: "" });
    check("2.5 GEGENPROBE: ohne Vollname ist die Personensuche unvollständig",
      ohneNamen.nameQueryComplete === false);
  }

  // ── 3 · Jede Regel mit Gegenbeispiel ──────────────────────────────────────────────────
  abschnitt("3 · Jede Vertragsregel greift (Gegenbeispiel je Regel)");
  regel("3.1 Ungültige Mandatskennung wird abgelehnt", (p) => { p.mandatsId = "Erika Beispiel!"; }, "id-ungueltig");
  regel("3.2 Fehlendes Pflichtfeld wird abgelehnt", (p) => { delete p.vollname; }, "pflichtfeld-fehlt");
  regel("3.3 Unbekanntes Feld wird abgelehnt", (p) => { p.lieblingsfarbe = "blau"; }, "unbekanntes-feld");
  regel("3.4 Unbekanntes Parlament wird abgelehnt", (p) => { p.parlament = "buergerschaft-hamburg"; }, "parlament-unbekannt");
  regel("3.5 Weder Partei noch Fraktion noch fraktionslos wird abgelehnt",
    (p) => { delete p.partei; delete p.fraktion; }, "partei-fehlt");
  regel("3.6 Fehlende Region wird abgelehnt", (p) => { delete p.wahlkreis; }, "region-fehlt");
  regel("3.7 Listenmandat ohne Regionhinweis wird abgelehnt",
    (p) => { delete p.wahlkreis; p.listenmandat = true; }, "region-fehlt");
  regel("3.8 Weder Ausschuss noch Thema wird abgelehnt",
    (p) => { delete p.ausschuesse; delete p.themen; }, "schwerpunkt-fehlt");
  regel("3.9 Fehlende amtliche Quelle wird abgelehnt",
    (p) => { p.offizielleQuellen = [{ art: "eigene-website", url: "https://www.bundestag.de/x" }]; },
    "amtliche-quelle-fehlt");
  regel("3.10 Amtliche Quelle auf falschem Host wird abgelehnt",
    (p) => { p.offizielleQuellen = [{ art: "parlament-profil", url: "https://beispielpartei.example/erika" }]; },
    "quelle-falscher-host");
  regel("3.11 Eine Suchseite ist kein Beleg",
    (p) => { p.offizielleQuellen = [{ art: "parlament-profil", url: "https://news.google.com/rss/search?q=Erika" }]; },
    "quelle-ist-suche");
  regel("3.12 Kein https wird abgelehnt",
    (p) => { p.offizielleQuellen = [{ art: "parlament-profil", url: "http://www.bundestag.de/x" }]; },
    "quelle-kein-https");
  regel("3.13 Bundesland passt nicht zum Landtag",
    (p) => { p.parlament = "landtag-brandenburg"; p.bundesland = "Bayern"; }, "bundesland-passt-nicht");
  regel("3.14 Ungültige Kostenbegrenzung wird abgelehnt",
    (p) => { p.kiBudgetTaeglichCent = 0; }, "budget-ungueltig");
  regel("3.15 Name mit Anführungszeichen zerstörte die Suchanfrage",
    (p) => { p.vollname = "\"Erika\" Beispiel"; }, "name-sonderzeichen");

  // ── 4 · Import aktiviert NIE ──────────────────────────────────────────────────────────
  abschnitt("4 · Ein Import legt Profile immer deaktiviert an");
  {
    const e = IMPORT.pruefeImport(datei([gutesProfil({ aktiv: true })]));
    const codes = e.ergebnisse.flatMap((r) => r.fehler.map((f) => f.code));
    check("4.1 `aktiv: true` wird ABGELEHNT — nicht stillschweigend korrigiert",
      e.ok === false && codes.includes("import-darf-nicht-aktivieren"), codes.join(", "));
    check("4.2 Der Hinweis nennt die Freigabepflicht",
      e.ergebnisse[0].fehler.some((f) => /freigabepflichtig/i.test(f.hinweis)));
    check("4.3 Auch die Abbildung setzt `profileActive: false` — unabhängig vom Eingang",
      IMPORT.zuHelmutProfil(gutesProfil({ aktiv: true })).profileActive === false);
    const ok = IMPORT.pruefeImport(datei([gutesProfil(), gutesProfil({ mandatsId: "zweite-person", vollname: "Zweite Person", offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/abgeordnete/zweite-person" }] })]));
    check("4.4 Die Zusammenfassung weist ausdrücklich aus, dass alle deaktiviert sind",
      ok.zusammenfassung.alleAktivFalse === true);
  }

  // ── 5 · Dubletten über drei Achsen ────────────────────────────────────────────────────
  abschnitt("5 · Dublettenprüfung");
  {
    const zwei = IMPORT.pruefeImport(datei([gutesProfil(), gutesProfil()]));
    const codes = zwei.fehler.map((f) => f.code);
    check("5.1 Gleiche Mandatskennung wird erkannt", codes.includes("dublette-mandatsId"), codes.join(", "));
    check("5.2 Gleicher Vollname wird erkannt", codes.includes("dublette-name"), codes.join(", "));
    check("5.3 Gleiche amtliche Quelle wird erkannt", codes.includes("dublette-quelle"), codes.join(", "));

    // Der Fall, den NUR die Quellenachse fängt: verschiedene Kennung, verschiedener Name,
    // aber dieselbe Profilseite.
    const getarnt = IMPORT.pruefeImport(datei([
      gutesProfil(),
      gutesProfil({ mandatsId: "e-beispiel", vollname: "E. Beispiel" })
    ]));
    const c2 = getarnt.fehler.map((f) => f.code);
    check("5.4 Zwei Kennungen auf DIESELBE Profilseite werden erkannt",
      c2.includes("dublette-quelle") && !c2.includes("dublette-mandatsId") && !c2.includes("dublette-name"),
      c2.join(", "));

    // GEGENPROBE: zwei echte, verschiedene Profile dürfen NICHT als Dublette gelten.
    const sauber = IMPORT.pruefeImport(datei([
      gutesProfil(),
      gutesProfil({
        mandatsId: "jonas-musterhausen", vollname: "Jonas Musterhausen",
        offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/abgeordnete/jonas-musterhausen" }]
      })
    ]));
    check("5.5 GEGENPROBE: zwei verschiedene Profile sind keine Dublette", sauber.ok === true,
      sauber.fehler.map((f) => f.code).join(", ") || "keine Fehler");
  }

  // ── 6 · Vertragsversion ───────────────────────────────────────────────────────────────
  abschnitt("6 · Vertragsversion");
  {
    const alt = IMPORT.pruefeImport({ version: "helmut-mandatsprofil/0", profile: [gutesProfil()] });
    check("6.1 Eine unbekannte Version wird abgelehnt statt geraten",
      alt.ok === false && alt.fehler.some((f) => f.code === "version-unbekannt"));
    const ohne = IMPORT.pruefeImport({ profile: [gutesProfil()] });
    check("6.2 Eine fehlende Version wird abgelehnt", ohne.ok === false);
    const kaputt = IMPORT.pruefeImport("nicht mal ein Objekt");
    check("6.3 Eingaben, die keine Datei sind, brechen sauber ab", kaputt.ok === false && kaputt.profile === 0);
  }

  // ── 7 · Die mitgelieferte Beispieldatei ───────────────────────────────────────────────
  abschnitt("7 · Beispieldatei");
  {
    const roh = JSON.parse(fs.readFileSync(BEISPIEL_PFAD, "utf8"));
    const e = IMPORT.pruefeImport(roh);
    check("7.1 Die Beispieldatei ist strukturell gültig", e.ok === true, IMPORT.berichte(e).split("\n")[0]);
    check("7.2 Sie enthält alle drei Parlamente",
      Object.keys(e.zusammenfassung.nachParlament).length === 3,
      JSON.stringify(e.zusammenfassung.nachParlament));
    check("7.3 Alle Profile sind deaktiviert", e.zusammenfassung.alleAktivFalse === true);
    check("7.4 JEDE Quelle trägt den Synthetik-Marker und wird als nicht echt gemeldet",
      e.warnungen.filter((w) => w.code === "quelle-synthetisch").length
        === roh.profile.reduce((s, p) => s + p.offizielleQuellen.length, 0),
      `${e.warnungen.filter((w) => w.code === "quelle-synthetisch").length} Warnungen`);
    check("7.5 Die Datei sagt selbst, dass sie synthetisch ist",
      /SYNTHETISCH/i.test(String(roh.quelleDerRecherche)));
    // Jedes Beispielprofil muss vom ECHTEN Produktionscode als vollständig anerkannt werden.
    const unvollstaendig = roh.profile
      .map((p) => ({ id: p.mandatsId, v: validation.validateProfile({ ...IMPORT.zuHelmutProfil(p), profileActive: true }) }))
      .filter((x) => x.v.state !== validation.STATES.COMPLETE);
    check("7.6 Jedes Beispielprofil ist für Helmut `vollstaendig`", unvollstaendig.length === 0,
      unvollstaendig.map((x) => `${x.id}: ${x.v.missingRequired.join("/")}`).join(" · ") || "alle vollständig");
  }

  // ── 8 · Schema und Validator sind EINE Wahrheit ───────────────────────────────────────
  abschnitt("8 · Das JSON-Schema deckt sich mit dem Validator");
  {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PFAD, "utf8"));
    const def = schema.definitions.mandatsprofil;
    const schemaFelder = Object.keys(def.properties).sort();
    const codeFelder = [...IMPORT.ERLAUBTE_FELDER].sort();
    check("8.1 Dieselben Felder in Schema und Validator",
      JSON.stringify(schemaFelder) === JSON.stringify(codeFelder),
      `nur im Schema: ${schemaFelder.filter((f) => !codeFelder.includes(f)).join(",") || "-"} · `
      + `nur im Code: ${codeFelder.filter((f) => !schemaFelder.includes(f)).join(",") || "-"}`);
    check("8.2 Dieselben Pflichtfelder",
      JSON.stringify([...def.required].sort()) === JSON.stringify([...IMPORT.PFLICHTFELDER].sort()),
      `${def.required.join(",")} vs. ${IMPORT.PFLICHTFELDER.join(",")}`);
    check("8.3 Das Schema kennt dieselben Parlamente",
      JSON.stringify(def.properties.parlament.enum.sort())
        === JSON.stringify(Object.keys(IMPORT.AMTLICHE_HOSTS).sort()));
    check("8.4 Das Schema verbietet `aktiv: true` ebenfalls",
      def.properties.aktiv.const === false);
    check("8.5 Das Schema verbietet zusätzliche Felder",
      def.additionalProperties === false);
    check("8.6 Das Schema nennt die Vertragsversion des Codes",
      schema.properties.version.const === IMPORT.VERTRAGSVERSION);
    check("8.7 Pflicht- und optionale Felder überschneiden sich nicht",
      IMPORT.OPTIONALE_FELDER.every((f) => !IMPORT.PFLICHTFELDER.includes(f))
      && IMPORT.PFLICHTFELDER.length + IMPORT.OPTIONALE_FELDER.length === IMPORT.ERLAUBTE_FELDER.length,
      `${IMPORT.PFLICHTFELDER.length} Pflicht + ${IMPORT.OPTIONALE_FELDER.length} optional = ${IMPORT.ERLAUBTE_FELDER.length}`);
  }

  // ── 9 · Warnungen blockieren nicht, werden aber gesagt ────────────────────────────────
  abschnitt("9 · Warnungen");
  {
    const e = IMPORT.pruefeImport(datei([gutesProfil({ mandatsId: "test-mandat-eins" })]));
    check("9.1 Eine testartige Kennung wird als Warnung gemeldet",
      e.warnungen.some((w) => w.code === "id-sieht-nach-test-aus"), e.warnungen.map((w) => w.code).join(","));
    check("9.2 Eine Warnung allein blockiert den Import NICHT", e.ok === true);
    const viele = IMPORT.pruefeImport(datei([gutesProfil({ themen: Array.from({ length: 30 }, (_, i) => `Thema ${i}`) })]));
    check("9.3 Mehr Themen als wirksam wird benannt",
      viele.warnungen.some((w) => w.code === "zu-viele-themen"));
  }

  // ── 10 · Der Bericht ist verständlich ─────────────────────────────────────────────────
  abschnitt("10 · Verständliche Fehlermeldungen");
  {
    const e = IMPORT.pruefeImport(datei([gutesProfil({ mandatsId: "Erika!", aktiv: true })]));
    const b = IMPORT.berichte(e);
    check("10.1 Jeder Fehler nennt die Stelle UND was zu tun ist",
      e.ergebnisse[0].fehler.every((f) => f.text && f.hinweis && f.hinweis.length > 20));
    check("10.2 Der Bericht nennt die Mandatskennung des betroffenen Eintrags",
      /#0 \(/.test(b), b.split("\n").find((l) => l.includes("#0")) || "");
    check("10.3 Der Bericht endet mit einer klaren Aussage",
      /ERGEBNIS: NICHT importierbar$/m.test(b));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Prüfungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
