"use strict";

// Helmut — VERTRAGSTEST DER ZENTRALEN RELEVANZORDNUNG (OP-30, finaler Abnahmesprint, Phase 3).
// =============================================================================================
// Die Produktregel, die hier geprueft wird (Gruendervorgabe):
//   RELEVANZ VOR AKTUALITAET — Mandatsbezug, Ausschuss, Region, Dringlichkeit, Handlungsbedarf.
//   Danach Qualitaet, Aktualitaet, stabiler Schluessel.
//
// Der HAERTESTE Satz aus dem Auftrag ist zugleich der einzige, der eine Rangfolge wirklich
// pruefbar macht:
//   "Ein neuer irrelevanter Vorgang darf keinen aelteren direkt relevanten Vorgang verdraengen."
// Genau daran haengt Abschnitt 3. Er wird nicht mit einem Beispiel geprueft, sondern mit
// einer erschoepfenden Gegenprobe ueber alle Klassenpaare und ueber extreme Altersabstaende.
//
// Offline. Keine Datenbank, kein Netz, keine KI.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const R = require(path.join(ROOT, "lib/helmut/relevanzordnung.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const JETZT = Date.parse("2026-08-08T12:00:00Z");
const TAG = 24 * 3600 * 1000;
const iso = (msVorJetzt) => new Date(JETZT - msVorJetzt).toISOString();

// Drei Profile — die drei Parlamente, die der Auftrag ausdruecklich nennt.
const PROFILE = {
  bundestag: {
    id: "p-bt", fullName: "Testperson Bundestag", level: "Bundestag",
    committees: ["Innenausschuss"], constituency: "Wahlkreis 42", state: "Bayern",
    focusTopics: ["Innere Sicherheit"]
  },
  berlin: {
    id: "p-be", fullName: "Testperson Berlin", level: "Landtag",
    committees: ["Ausschuss fuer Inneres"], constituency: "Berlin-Mitte", state: "Berlin",
    focusTopics: ["Verkehr"]
  },
  brandenburg: {
    id: "p-bb", fullName: "Testperson Brandenburg", level: "Landtag",
    committees: ["Bildungsausschuss"], constituency: "Potsdam", state: "Brandenburg",
    focusTopics: ["Bildung"]
  }
};

// Ein Wissensobjekt mit Standardwerten. Jeder Test setzt nur, was er meint.
let lfd = 0;
function ko(over = {}) {
  lfd += 1;
  const id = over.id || `ko-${String(lfd).padStart(3, "0")}`;
  return {
    id,
    vorgang_id: over.vorgang_id || `vg-${id}`,
    headline: "Ein Vorgang",
    was_ist_passiert: "Etwas ist passiert.",
    warum_wichtig: "Es ist wichtig.",
    understanding_status: "complete",
    status: "complete",
    best_source_url: "https://beispiel.invalid/dokument",
    source_document_count: 1,
    published_at: iso(1 * TAG),
    ...over
  };
}

// ZWEI Helfer, weil es ZWEI Vertraege gibt — und die Verwechslung genau der Fehler war,
// den dieser Test zuerst gemacht hat (2026-08-08):
//
//   `ordne(..., { belegPflicht: true })`  — der Aufrufer KENNT die Quellen. Ein Vorgang ohne
//     Quelle wird AUSGESCHLOSSEN. So ruft eine Ausgabeschicht die Ordnung auf.
//   `ordne(...)` ohne die Angabe        — der Aufrufer kennt die Quellen NICHT (in
//     `lage.js` sind sie zum Ordnungszeitpunkt noch nicht geladen). Dann darf die Ordnung
//     NICHTS stillschweigend wegwerfen; sie zaehlt nur mit. Die Belegpflicht selbst wird
//     dort weiterhin durchgesetzt — eine Ebene spaeter, in `lage.js` (`lageHasRealSource`).
//
// Beide Vertraege werden hier geprueft. Der zweite ist der gefaehrlichere: still verlorene
// Vorgaenge waeren im Betrieb nicht zu bemerken.
function ordnung(kos, profil) {
  return R.ordne(kos, profil, { now: JETZT, belegPflicht: true });
}
function ordnungOhneBelegpflicht(kos, profil) {
  return R.ordne(kos, profil, { now: JETZT });
}

async function main() {
  console.log("Helmut — Relevanzordnung: Vertragstest, Gegenbeispiele, Mutationsprobe (OP-30)");
  console.log("  offline · deterministisch · KEIN KI-Aufruf\n");

  // ═══ 1 · BELEGPFLICHT ════════════════════════════════════════════════════
  abschnitt("1 · Ohne Quelle keine Ausgabe (Belegpflicht, START_HERE §5.2)");
  {
    const ohneQuelle = ko({ best_source_url: null, sources: [] });
    const mitQuelle = ko({});
    const r = ordnung([ohneQuelle, mitQuelle], PROFILE.bundestag);
    check("1.1 Ein Vorgang ohne Quelle wird AUSGESCHLOSSEN, nicht nur schlechter platziert",
      r.reihenfolge.length === 1 && r.reihenfolge[0].ko.id === mitQuelle.id,
      `${r.zusammenfassung.ausgeschlossen} ausgeschlossen`);
    check("1.2 Der Ausschlussgrund wird benannt",
      r.zusammenfassung.ausgeschlossenNachGrund["keine-quelle"] === 1,
      JSON.stringify(r.zusammenfassung.ausgeschlossenNachGrund));
    check("1.3 Eine kaputte URL zaehlt NICHT als Quelle",
      ordnung([ko({ best_source_url: "keine-url" })], PROFILE.bundestag).reihenfolge.length === 0);
    check("1.4 Eine Quelle in `sources` reicht ebenfalls",
      ordnung([ko({ best_source_url: null, sources: [{ url: "https://beispiel.invalid/a" }] })],
        PROFILE.bundestag).reihenfolge.length === 1);
    check("1.5 Ein NICHT verstandener Vorgang wird ausgeschlossen",
      ordnung([ko({ status: "pending" })], PROFILE.bundestag).zusammenfassung
        .ausgeschlossenNachGrund["nicht-verstanden"] === 1);
    check("1.6 Ein Vorgang ohne Inhalt wird ausgeschlossen",
      ordnung([ko({ was_ist_passiert: null, warum_wichtig: null })], PROFILE.bundestag)
        .zusammenfassung.ausgeschlossenNachGrund["kein-inhalt"] === 1);
    check("1.7 Jeder zugelassene Vorgang traegt seinen Beleg mit",
      ordnung([ko({})], PROFILE.bundestag).reihenfolge[0].beleg.hatQuelle === true);

    // DER ZWEITE VERTRAG: ohne Belegpflicht darf NICHTS still verschwinden.
    const ohne = ordnungOhneBelegpflicht([ohneQuelle, mitQuelle], PROFILE.bundestag);
    check("1.8 OHNE Belegpflicht wird kein Vorgang stillschweigend weggeworfen",
      ohne.reihenfolge.length === 2, `${ohne.reihenfolge.length} von 2`);
    check("1.9 Der unbelegte Vorgang wird dann trotzdem GEZAEHLT (nicht verschwiegen)",
      ohne.zusammenfassung.ohneSichtbarenBeleg === 1,
      JSON.stringify(ohne.zusammenfassung.ohneSichtbarenBeleg));
    check("1.10 Die Zusammenfassung sagt ausdruecklich, ob die Belegpflicht angewendet wurde",
      ohne.zusammenfassung.belegPflichtAngewendet === false
      && ordnung([mitQuelle], PROFILE.bundestag).zusammenfassung.belegPflichtAngewendet === true);
  }

  // ═══ 2 · DIE KLASSENFOLGE ════════════════════════════════════════════════
  abschnitt("2 · Die Klassenfolge entspricht der Gruendervorgabe");
  {
    const p = PROFILE.bundestag;
    const faelle = [
      ["mandat-dringend", ko({ mentioned_people: [p.fullName], deadline: "2026-08-10" })],
      ["mandat", ko({ mentioned_people: [p.fullName] })],
      ["ausschuss-region", ko({ ausschuesse: ["Innenausschuss"] })],
      ["ebene-dringend", ko({ deadline: "2026-08-09", risk_level: "high" })],
      ["allgemein", ko({ themen: ["Innere Sicherheit"] })],
      ["rand", ko({ headline: "Voellig anderes Thema" })]
    ];
    for (const [erwartet, objekt] of faelle) {
      const k = R.relevanzklasse(objekt, p);
      check(`2.x ${objekt.id} faellt in die Klasse "${erwartet}"`, k.name === erwartet,
        `ist "${k.name}" (${k.grund})`);
    }
    const r = ordnung(faelle.map(([, o]) => o), p);
    check("2.7 Die Ausgabereihenfolge ist genau die Klassenfolge",
      r.reihenfolge.map((x) => x.klassenname).join(",")
      === "mandat-dringend,mandat,ausschuss-region,ebene-dringend,allgemein,rand",
      r.reihenfolge.map((x) => x.klassenname).join(","));
    check("2.8 Jede Position traegt eine Begruendung",
      r.reihenfolge.every((x) => typeof x.grund === "string" && x.grund.length > 0));
  }

  // ═══ 3 · DER HAERTETEST: Relevanz schlaegt Aktualitaet ══════════════════
  abschnitt("3 · Ein neuer irrelevanter Vorgang verdraengt keinen aelteren relevanten");
  {
    const p = PROFILE.bundestag;
    // Erschoepfend: JEDES Klassenpaar, mit maximal ungleichem Alter.
    const bauer = {
      1: () => ko({ mentioned_people: [p.fullName], deadline: "2026-08-10" }),
      2: () => ko({ mentioned_people: [p.fullName] }),
      3: () => ko({ ausschuesse: ["Innenausschuss"] }),
      4: () => ko({ deadline: "2026-08-09", risk_level: "high" }),
      5: () => ko({ themen: ["Innere Sicherheit"] }),
      6: () => ko({ headline: "Voellig anderes Thema" })
    };
    let verletzungen = 0;
    let paare = 0;
    for (let besser = 1; besser <= 6; besser += 1) {
      for (let schlechter = besser + 1; schlechter <= 6; schlechter += 1) {
        paare += 1;
        // Der RELEVANTERE ist uralt, der IRRELEVANTERE ist brandneu.
        const alt = { ...bauer[besser](), published_at: iso(365 * TAG) };
        const neu = { ...bauer[schlechter](), published_at: iso(0) };
        const r = ordnung([neu, alt], p);   // absichtlich falsch herum eingegeben
        if (!(r.reihenfolge[0] && r.reihenfolge[0].ko.id === alt.id)) verletzungen += 1;
      }
    }
    check("3.1 In ALLEN 15 Klassenpaaren gewinnt der relevantere, auch wenn er ein Jahr aelter ist",
      verletzungen === 0, `${paare} Paare geprueft, ${verletzungen} Verletzungen`);

    // Und der Umkehrschluss: bei GLEICHER Klasse entscheidet sehr wohl die Aktualitaet.
    const a = { ...bauer[3](), id: "gleich-alt", vorgang_id: "vg-gleich-alt", published_at: iso(30 * TAG) };
    const b = { ...bauer[3](), id: "gleich-neu", vorgang_id: "vg-gleich-neu", published_at: iso(0) };
    const r2 = ordnung([a, b], p);
    check("3.2 INNERHALB einer Klasse entscheidet die Aktualitaet sehr wohl",
      r2.reihenfolge[0].ko.id === "gleich-neu", r2.reihenfolge.map((x) => x.ko.id).join(","));

    // Extremfall: 500 irrelevante, brandneue Vorgaenge gegen einen alten relevanten.
    const flut = Array.from({ length: 500 }, (_, i) =>
      ko({ id: `flut-${i}`, vorgang_id: `vg-flut-${i}`, headline: "Irrelevant", published_at: iso(0) }));
    const derEine = ko({ id: "der-eine", vorgang_id: "vg-der-eine", mentioned_people: [p.fullName],
      deadline: "2026-08-10", published_at: iso(200 * TAG) });
    const r3 = ordnung([...flut, derEine], p);
    check("3.3 Auch 500 brandneue irrelevante Vorgaenge verdraengen den einen relevanten nicht",
      r3.reihenfolge[0].ko.id === "der-eine", r3.reihenfolge[0].ko.id);
  }

  // ═══ 4 · ALLE DREI PARLAMENTE ════════════════════════════════════════════
  abschnitt("4 · Dieselbe Logik fuer Bundestag, Berlin und Brandenburg");
  {
    for (const [name, p] of Object.entries(PROFILE)) {
      const eigen = ko({ mentioned_people: [p.fullName], deadline: "2026-08-10", published_at: iso(100 * TAG) });
      const fremd = ko({ headline: "Anderes Land, anderes Thema", published_at: iso(0) });
      const ausschuss = ko({ ausschuesse: [p.committees[0]], published_at: iso(50 * TAG) });
      const region = ko({ mentioned_locations: [p.constituency], published_at: iso(60 * TAG) });
      const r = ordnung([fremd, region, ausschuss, eigen], p);
      const folge = r.reihenfolge.map((x) => x.klassenname);
      check(`4.x ${name}: Mandatsbezug zuerst, Fremdes zuletzt`,
        folge[0] === "mandat-dringend" && folge[folge.length - 1] === "rand", folge.join(","));
      check(`4.x ${name}: Ausschuss UND Region werden erkannt`,
        r.reihenfolge.filter((x) => x.klassenname === "ausschuss-region").length === 2,
        `${r.reihenfolge.filter((x) => x.klassenname === "ausschuss-region").length} von 2`);
    }
  }

  // ═══ 5 · MANDANTENTRENNUNG ═══════════════════════════════════════════════
  abschnitt("5 · Kein Vorgang wird dem falschen Mandat zugeordnet");
  {
    const bt = PROFILE.bundestag;
    const be = PROFILE.berlin;
    const nurBt = ko({ mentioned_people: [bt.fullName], deadline: "2026-08-10" });
    check("5.1 Ein Vorgang mit fremdem Personenbezug ist fuer das andere Profil KEIN Mandatsbezug",
      R.relevanzklasse(nurBt, be).name !== "mandat-dringend"
      && R.relevanzklasse(nurBt, be).name !== "mandat",
      R.relevanzklasse(nurBt, be).name);
    check("5.2 Fuer das eigene Profil ist er sehr wohl Mandatsbezug",
      R.relevanzklasse(nurBt, bt).name === "mandat-dringend");
    check("5.3 Ein fremder Ausschuss erzeugt keinen Ausschussbezug",
      R.relevanzklasse(ko({ ausschuesse: ["Bildungsausschuss"] }), bt).name !== "ausschuss-region");
  }

  // ═══ 6 · DETERMINISMUS UND STABILITAET ══════════════════════════════════
  abschnitt("6 · Deterministisch, stabil, ohne Zufall");
  {
    const p = PROFILE.bundestag;
    const menge = Array.from({ length: 60 }, (_, i) => ko({
      id: `d-${i}`, vorgang_id: `vg-d-${i}`,
      ausschuesse: i % 3 === 0 ? ["Innenausschuss"] : [],
      mentioned_people: i % 7 === 0 ? [p.fullName] : [],
      published_at: iso((i % 11) * TAG)
    }));
    const a = ordnung(menge, p).reihenfolge.map((x) => x.ko.id).join(",");
    const b = ordnung([...menge].reverse(), p).reihenfolge.map((x) => x.ko.id).join(",");
    check("6.1 Zwei Laeufe mit gleicher Menge liefern dieselbe Reihenfolge",
      a === ordnung(menge, p).reihenfolge.map((x) => x.ko.id).join(","));
    check("6.2 Die EINGABEREIHENFOLGE aendert das Ergebnis nicht", a === b);
    // Vollstaendiger Gleichstand -> stabiler Schluessel entscheidet, nicht der Zufall.
    const gleich = [
      ko({ id: "z-b", vorgang_id: "vg-z-b", published_at: iso(5 * TAG) }),
      ko({ id: "z-a", vorgang_id: "vg-z-a", published_at: iso(5 * TAG) })
    ];
    check("6.3 Bei vollstaendigem Gleichstand entscheidet der stabile Schluessel",
      ordnung(gleich, p).reihenfolge.map((x) => x.ko.vorgang_id).join(",") === "vg-z-a,vg-z-b",
      ordnung(gleich, p).reihenfolge.map((x) => x.ko.vorgang_id).join(","));
    const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/relevanzordnung.js"), "utf8")
      .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
    check("6.4 Kein Zufall im Modul", !/Math\.random/.test(quelle));
    check("6.5 KEIN KI-Aufruf im Modul",
      !/require\(["']\.\/ai["']\)|requestJson|openai/i.test(quelle));
    check("6.6 Kein Netzzugriff im Modul", !/fetch\(|https?:\/\/[a-z]/i.test(quelle.replace(/beispiel\.invalid/g, "")));
  }

  // ═══ 7 · QUALITAET VOR AKTUALITAET, ABER NACH RELEVANZ ══════════════════
  abschnitt("7 · Qualitaet wirkt innerhalb der Klasse, nicht darueber hinaus");
  {
    const p = PROFILE.bundestag;
    const schwach = ko({ ausschuesse: ["Innenausschuss"], source_document_count: 1, published_at: iso(0) });
    const stark = ko({ ausschuesse: ["Innenausschuss"], source_document_count: 5,
      source_type: "amtlich", link_type: "direct", confidence: "high", published_at: iso(3 * TAG) });
    const r = ordnung([schwach, stark], p);
    check("7.1 Der besser belegte Vorgang steht vorn, obwohl er aelter ist",
      r.reihenfolge[0].ko.id === stark.id, r.reihenfolge.map((x) => x.ko.id).join(","));
    check("7.2 Qualitaet hebt einen Vorgang NICHT in eine bessere Klasse",
      R.relevanzklasse(stark, p).name === "ausschuss-region");
  }

  // ═══ 8 · MUTATIONSPROBE ══════════════════════════════════════════════════
  // Ist die Ordnung ueberhaupt empfindlich? Jede Mutation muss mindestens eine Zusage
  // brechen — sonst prueft dieser Test nichts.
  abschnitt("8 · Mutationsprobe: sind die Zusagen empfindlich?");
  {
    const p = PROFILE.bundestag;
    const alt = ko({ id: "m-alt", vorgang_id: "vg-m-alt", mentioned_people: [p.fullName],
      deadline: "2026-08-10", published_at: iso(365 * TAG) });
    const neu = ko({ id: "m-neu", vorgang_id: "vg-m-neu", headline: "Irrelevant", published_at: iso(0) });
    const ohneQuelle = ko({ id: "m-oq", vorgang_id: "vg-m-oq", best_source_url: null, sources: [] });

    const mutationen = [
      {
        name: "M1 Sortierung NUR nach Aktualitaet (Klasse ignoriert)",
        ordne: (liste) => [...liste].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)),
        pruefe: (erg) => erg[0].id === "m-alt"      // muss FEHLSCHLAGEN
      },
      {
        name: "M2 Klassen umgedreht (Rand zuerst)",
        ordne: (liste) => R.ordne(liste, p, { now: JETZT }).reihenfolge.map((x) => x.ko).reverse(),
        pruefe: (erg) => erg[0].id === "m-alt"
      },
      {
        name: "M3 Belegpflicht abgeschaltet (Vorgang ohne Quelle wird zugelassen)",
        ordne: (liste) => liste,
        pruefe: (erg) => !erg.some((x) => x.id === "m-oq")
      }
    ];
    let erkannt = 0;
    for (const m of mutationen) {
      const erg = m.ordne([neu, alt, ohneQuelle]);
      const haeltNoch = m.pruefe(erg);
      if (!haeltNoch) { erkannt += 1; console.log(`  ROT   ${m.name} — die Zusage bricht, wie sie soll`); }
      else { console.log(`  GRUEN ${m.name}  <-- LOCH IM NACHWEIS`); }
    }
    check("8.1 JEDE Mutation bricht mindestens eine Zusage", erkannt === mutationen.length,
      `${erkannt} von ${mutationen.length}`);
    // Und die unveraenderte Ordnung haelt alle drei.
    const echt = R.ordne([neu, alt, ohneQuelle], p, { now: JETZT, belegPflicht: true }).reihenfolge.map((x) => x.ko);
    check("8.2 Die UNVERAENDERTE Ordnung haelt alle drei Zusagen",
      echt[0].id === "m-alt" && !echt.some((x) => x.id === "m-oq"),
      echt.map((x) => x.id).join(","));
  }

  // ═══ 9 · DER KILL-SWITCH ═════════════════════════════════════════════════
  abschnitt("9 · Rueckweg");
  {
    // GEAENDERT 2026-08-08 (Korrektursprint): der Standard ist jetzt AUS. Begruendung steht
  // im Kopf von lib/helmut/relevanzordnung.js — ein default-AN-Flag haette das Verhalten
  // beim MERGE geaendert, nicht bei einer Entscheidung. Die Produktregel bleibt gebaut und
  // gueltig; sie wartet nur auf eine Freigabe.
  check("9.1 Standard ist AUS (Merge veraendert das Verhalten nicht)",
      R.relevanzordnungAktiv({}) === false);
    check("9.2 `off` schaltet ab", R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "off" }) === false);
    check("9.3 `aus` und `0` schalten ebenfalls ab",
      R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "aus" }) === false
      && R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "0" }) === false);
    check("9.4 Ein Tippfehler laesst die Regel AUS (fail closed, nicht raten)",
      R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "offf" }) === false);
    check("9.5 NUR `on` schaltet ein",
      R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "on" }) === true
      && ["true", "1", "an", "ja", "yes", "onn"].every(
        (w) => R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: w }) === false));
    check("9.6 Ein ungueltiger Wert erzeugt eine Diagnose (kein stilles Aus)", (() => {
      R._roDiagnoseZuruecksetzen();
      const alt = console.warn; let text = "";
      console.warn = (m) => { text += String(m); };
      try { R.relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "vielleicht" }); } finally { console.warn = alt; }
      return /kein g.ltiger Wert/.test(text) && /fail closed/.test(text);
    })());
  }

  // ═══ 10 · LEISTUNG ═══════════════════════════════════════════════════════
  abschnitt("10 · Die Ordnung ist schnell genug fuer den Lesepfad");
  {
    const p = PROFILE.bundestag;
    const gross = Array.from({ length: 500 }, (_, i) => ko({
      id: `g-${i}`, vorgang_id: `vg-g-${i}`,
      ausschuesse: i % 4 === 0 ? ["Innenausschuss"] : [],
      published_at: iso((i % 30) * TAG)
    }));
    const t0 = Date.now();
    for (let i = 0; i < 20; i += 1) R.ordne(gross, p, { now: JETZT });
    const dauer = (Date.now() - t0) / 20;
    check("10.1 500 Vorgaenge werden in unter 50 ms geordnet", dauer < 50, `${dauer.toFixed(1)} ms je Lauf`);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
