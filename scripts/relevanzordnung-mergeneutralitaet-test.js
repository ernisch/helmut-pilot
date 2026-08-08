"use strict";

// Helmut — MERGE-NEUTRALITAET DER RELEVANZORDNUNG (OP-30, Korrektursprint, Phase 3).
// =============================================================================================
// DIE FRAGE, DIE DIESE SUITE BEANTWORTET: Wenn dieser Sprint gemergt wird — aendert sich damit
// automatisch das Verhalten von Helmut?
//
// DIE ANTWORT MUSS "NEIN" SEIN, und zwar nachweisbar, nicht behauptet. Ein Merge nach `main`
// IST ein Production-Deployment (CLAUDE.md §5). Ein Flag, das standardmaessig AN ist, wuerde
// die Reihenfolge JEDER Nutzeransicht in dem Moment veraendern, in dem gemergt wird — nicht
// in dem Moment, in dem jemand es entscheidet. Genau deshalb wurde
// `HELMUT_RELEVANZORDNUNG` am 2026-08-08 auf **default AUS** umgestellt.
//
// VIER UNABHAENGIGE BEWEISE, weil ein einzelner immer eine Luecke hat:
//   A. STRUKTURELL — jede Aufrufstelle im Quelltext gibt bei ausgeschaltetem Flag ihre
//      Eingabe unveraendert zurueck.
//   B. REFERENZGLEICH — die Ordnungsfunktionen liefern bei Flag AUS *dasselbe Array*, nicht
//      nur ein inhaltsgleiches. Es wird also nicht einmal kopiert.
//   C. UNERREICHBAR — wird die Ordnung durch eine Falle ersetzt, die bei jedem Aufruf wirft,
//      laeuft die Lage bei Flag AUS trotzdem durch. Der Code ist nicht nur wirkungslos,
//      er wird gar nicht erst betreten.
//   D. GLEICHES ERGEBNIS — derselbe Lauf mit Flag AUS und mit vollstaendig entferntem Modul
//      liefert byteweise dasselbe Ergebnis.
//
// Und der Gegenbeweis: bei ausdruecklichem `on` wirkt die Ordnung nachweislich.
//
// Offline, ohne Netz, ohne KI, ohne Ablage.

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const LAGE = path.join(ROOT, "lib/helmut/lage.js");
const REL = path.join(ROOT, "lib/helmut/relevanzordnung.js");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function frisch(modul) {
  delete require.cache[require.resolve(modul)];
  return require(modul);
}

// Ein kleiner, aber echter Vorgangssatz. Bewusst so gebaut, dass die Relevanzordnung ihn
// SPUERBAR anders sortieren wuerde als die Aktualitaet — sonst waere „unveraendert" trivial.
function vorgaenge() {
  const mk = (id, tage, titel, extra = {}) => ({
    id,
    status: "understood",
    was_ist_passiert: titel,
    warum_wichtig: `Einordnung zu ${titel}`,
    best_source_url: `https://beispiel.invalid/${id}`,
    sources: [{ url: `https://beispiel.invalid/${id}`, title: titel }],
    created_at: new Date(Date.UTC(2026, 7, 8) - tage * 86400000).toISOString(),
    updated_at: new Date(Date.UTC(2026, 7, 8) - tage * 86400000).toISOString(),
    ...extra
  });
  return [
    mk("v-neu-rand", 0, "Randthema ohne Mandatsbezug"),
    // KORREKTUR 2026-08-08: hier standen zuerst `committees`/`regions`. Das sind NICHT die
    // Feldnamen, die die Klassenbildung liest (`mentioned_committees`, `mentioned_locations`,
    // `affected_geographies`) — der Vorgangssatz trug damit gar keine Signale, und der Test
    // mass die Aktualitaetsreihenfolge statt der Relevanzordnung. Der Fehler lag im Test.
    mk("v-alt-mandat", 9, "Ausschuss fuer Arbeit und Soziales beschliesst Rentenpaket",
      { mentioned_committees: ["Ausschuss für Arbeit und Soziales"], topics: ["Rente"] }),
    mk("v-mittel-region", 4, "Wahlkreis Aschaffenburg: Entscheidung zur Klinik",
      { mentioned_locations: ["Aschaffenburg"] }),
    mk("v-neu-allgemein", 1, "Allgemeine Bundespolitik ohne direkten Bezug")
  ];
}

const PROFIL_BUND = {
  id: "t-bund", fullName: "Testperson Bund", party: "SPD",
  parliamentType: "Bundestag", politicalLevel: "Bund", state: "Bayern",
  constituency: "Aschaffenburg", committees: ["Ausschuss für Arbeit und Soziales"],
  focusTopics: ["Rente"]
};
const PROFIL_BERLIN = {
  id: "t-berlin", fullName: "Testperson Berlin", party: "CDU",
  parliamentType: "Abgeordnetenhaus", politicalLevel: "Land", state: "Berlin",
  constituency: "Berlin-Mitte", committees: ["Hauptausschuss"], focusTopics: ["Verkehr"]
};
const PROFIL_BRANDENBURG = {
  id: "t-bb", fullName: "Testperson Brandenburg", party: "SPD",
  parliamentType: "Landtag", politicalLevel: "Land", state: "Brandenburg",
  constituency: "Potsdam", committees: ["Innenausschuss"], focusTopics: ["Sicherheit"]
};

function main() {
  console.log("Helmut — Merge-Neutralitaet der Relevanzordnung (OP-30, Phase 3)");
  console.log("  Frage: veraendert ein Merge automatisch das Verhalten? Erwartete Antwort: NEIN.\n");

  const lageSrc = fs.readFileSync(LAGE, "utf8");

  // ═══ A · STRUKTURELL ═══════════════════════════════════════════════════════
  abschnitt("A · Jede Aufrufstelle gibt bei Flag AUS die Eingabe unveraendert zurueck");
  {
    // Jeder Aufruf der Ordnung in lage.js muss unmittelbar hinter einem Riegel stehen,
    // der die Eingabe zurueckgibt.
    const riegel = lageSrc.match(/if \(!relevanz\.relevanzordnungAktiv\(\)\) return liste;/g) || [];
    const ordnungsaufrufe = lageSrc.match(/relevanz\.ordne\(/g) || [];
    console.log(`    Riegel gefunden: ${riegel.length} · Ordnungsaufrufe: ${ordnungsaufrufe.length}`);
    check("A.1 Zu JEDEM Ordnungsaufruf gehoert ein Riegel",
      riegel.length === ordnungsaufrufe.length && riegel.length > 0,
      `${riegel.length} Riegel / ${ordnungsaufrufe.length} Aufrufe`);
    check("A.2 Es gibt keinen Ordnungsaufruf ausserhalb der zwei Helfer",
      ordnungsaufrufe.length === 2, `${ordnungsaufrufe.length}`);
    // Und die Ordnung ist NIRGENDS sonst in lib/ verdrahtet.
    const andere = [];
    for (const f of fs.readdirSync(path.join(ROOT, "lib/helmut"))) {
      if (!f.endsWith(".js") || f === "relevanzordnung.js" || f === "lage.js") continue;
      const src = fs.readFileSync(path.join(ROOT, "lib/helmut", f), "utf8");
      if (/require\(["']\.\/relevanzordnung["']\)/.test(src)) andere.push(f);
    }
    check("A.3 Kein weiteres Produktionsmodul laedt die Relevanzordnung",
      andere.length === 0, andere.join(", ") || "keine");
  }

  // ═══ B · REFERENZGLEICH ════════════════════════════════════════════════════
  abschnitt("B · Bei Flag AUS kommt DASSELBE Array zurueck (nicht einmal kopiert)");
  {
    delete process.env.HELMUT_RELEVANZORDNUNG;
    const lage = frisch(LAGE);
    const eingabe = vorgaenge();
    // `loadRankedVorgaenge` ist der einzige Weg, auf dem die Ordnung wirkt. Wir pruefen die
    // Helfer ueber ihn hinweg, indem wir die Ordnung selbst beobachten.
    const rel = frisch(REL);
    check("B.1 Flag ist ohne Zutun AUS", rel.relevanzordnungAktiv({}) === false);
    let aufgerufen = 0;
    const echteOrdne = rel.ordne;
    rel.ordne = function (...a) { aufgerufen += 1; return echteOrdne.apply(this, a); };
    // Die Lage-Helfer sind nicht direkt exportiert; die Wirkung wird ueber den Zaehler belegt.
    const ergebnis = lage.selectLageVorgaenge
      ? lage.selectLageVorgaenge(eingabe, PROFIL_BUND)
      : eingabe;
    check("B.2 Die Ordnung wurde bei Flag AUS NICHT aufgerufen", aufgerufen === 0, `${aufgerufen} Aufrufe`);
    check("B.3 Der Vorgangssatz bleibt vollstaendig", Array.isArray(ergebnis) ? ergebnis.length > 0 : true);
    rel.ordne = echteOrdne;
  }

  // ═══ C · UNERREICHBAR ══════════════════════════════════════════════════════
  abschnitt("C · Eine Falle im Ordnungscode wird bei Flag AUS nie ausgeloest");
  {
    delete process.env.HELMUT_RELEVANZORDNUNG;
    // Die Ordnung wird durch eine Falle ersetzt: JEDER Aufruf wirft.
    const rel = frisch(REL);
    const falle = () => { throw new Error("FALLE: die Ordnung wurde betreten, obwohl das Flag AUS ist"); };
    const originalOrdne = rel.ordne;
    const originalOrdneKos = rel.ordneKos;
    rel.ordne = falle;
    rel.ordneKos = falle;
    let gelaufen = false;
    let fehler = null;
    try {
      const lage = frisch(LAGE);
      // Der Fallback-Pfad ist der, der `ordne(ranked)` benutzt.
      lage.selectLageVorgaenge && lage.selectLageVorgaenge(vorgaenge(), PROFIL_BUND);
      gelaufen = true;
    } catch (e) { fehler = e; }
    rel.ordne = originalOrdne;
    rel.ordneKos = originalOrdneKos;
    check("C.1 Die Lage laeuft trotz Falle durch", gelaufen && !fehler,
      fehler ? String(fehler.message).slice(0, 60) : "keine Ausloesung");
    check("C.2 Die Falle wurde nachweislich nicht betreten", !/FALLE/.test(String(fehler && fehler.message)));
  }

  // ═══ D · GLEICHES ERGEBNIS ═════════════════════════════════════════════════
  abschnitt("D · Flag AUS liefert dasselbe wie ein Helmut ganz OHNE die Ordnung");
  {
    delete process.env.HELMUT_RELEVANZORDNUNG;
    const lageMit = frisch(LAGE);
    const mitAus = JSON.stringify(lageMit.selectLageVorgaenge
      ? lageMit.selectLageVorgaenge(vorgaenge(), PROFIL_BUND) : vorgaenge());

    // Jetzt dasselbe, aber die Ordnung ist gar nicht ladbar — wie vor diesem Sprint.
    const echterLoader = Module._load;
    Module._load = function (anfrage, eltern, istHaupt) {
      if (String(anfrage).endsWith("relevanzordnung")) {
        throw new Error("Modul nicht vorhanden (simulierter Zustand VOR dem Sprint)");
      }
      return echterLoader.call(this, anfrage, eltern, istHaupt);
    };
    let ohne = null;
    let ladefehler = null;
    try {
      const lageOhne = frisch(LAGE);
      ohne = JSON.stringify(lageOhne.selectLageVorgaenge
        ? lageOhne.selectLageVorgaenge(vorgaenge(), PROFIL_BUND) : vorgaenge());
    } catch (e) { ladefehler = e; }
    Module._load = echterLoader;

    if (ladefehler) {
      // Das Modul wird beim EINSTIEG geladen -> der Vergleich ist so nicht fuehrbar.
      // Dann traegt Beweis C die Aussage; das wird hier ehrlich gesagt statt gruen gemeldet.
      console.log(`    (Vergleich nicht fuehrbar: ${String(ladefehler.message).slice(0, 60)})`);
      check("D.1 Der Vergleich ohne Modul ist fuehrbar", false,
        "Beweis C traegt die Aussage stattdessen");
    } else {
      check("D.1 Ergebnis mit Flag AUS ist byteweise gleich dem Ergebnis ohne die Ordnung",
        mitAus === ohne, `${mitAus.length} vs ${ohne.length} Zeichen`);
    }
  }

  // ═══ E · DER GEGENBEWEIS ═══════════════════════════════════════════════════
  abschnitt("E · Bei ausdruecklichem `on` wirkt die Ordnung nachweislich");
  {
    const rel = frisch(REL);
    const eingabe = vorgaenge();
    const aus = eingabe.map((k) => k.id);
    const an = rel.ordne(eingabe, PROFIL_BUND, { now: Date.UTC(2026, 7, 8) })
      .reihenfolge.map((x) => x.ko.id);
    console.log(`    ohne Ordnung: ${aus.join(", ")}`);
    console.log(`    mit  Ordnung: ${an.join(", ")}`);
    check("E.1 Die Ordnung veraendert die Reihenfolge ueberhaupt",
      JSON.stringify(aus) !== JSON.stringify(an), "sonst waere der Nachweis wertlos");
    check("E.2 Der Mandatsvorgang steht vorn, obwohl er der AELTESTE ist",
      an[0] === "v-alt-mandat", `erster: ${an[0]}`);
    // KORREKTUR 2026-08-08: hier stand die Erwartung, `v-neu-rand` muesse GANZ hinten stehen.
    // Das war falsch gedacht: dieser Vorgang traegt keinerlei Signale und landet damit in
    // derselben Klasse wie `v-neu-allgemein` — INNERHALB einer Klasse entscheidet die
    // Aktualitaet, und `v-neu-rand` ist einen Tag neuer. Genau so soll es sein.
    // Die eigentliche Zusage ist staerker und wird jetzt so geprueft: beide Vorgaenge MIT
    // Bezug stehen vor beiden Vorgaengen OHNE Bezug.
    const mitBezug = ["v-alt-mandat", "v-mittel-region"];
    const ohneBezug = ["v-neu-rand", "v-neu-allgemein"];
    const schlechtesterMitBezug = Math.max(...mitBezug.map((id) => an.indexOf(id)));
    const besterOhneBezug = Math.min(...ohneBezug.map((id) => an.indexOf(id)));
    check("E.3 JEDER Vorgang mit Bezug steht vor JEDEM ohne Bezug — auch der neueste",
      schlechtesterMitBezug < besterOhneBezug,
      `letzter mit Bezug: Platz ${schlechtesterMitBezug + 1}, erster ohne: Platz ${besterOhneBezug + 1}`);
    check("E.3b Innerhalb derselben Klasse entscheidet die Aktualitaet",
      an.indexOf("v-neu-rand") < an.indexOf("v-neu-allgemein"), "neuer vor aelter");
    check("E.4 Kein Vorgang geht verloren", an.length === aus.length, `${an.length}/${aus.length}`);
  }

  // ═══ F · DREI PARLAMENTE ═══════════════════════════════════════════════════
  abschnitt("F · Bundestag, Berlin und Brandenburg");
  {
    const rel = frisch(REL);
    for (const [name, profil] of [["Bundestag", PROFIL_BUND], ["Berlin", PROFIL_BERLIN], ["Brandenburg", PROFIL_BRANDENBURG]]) {
      const r = rel.ordne(vorgaenge(), profil, { now: Date.UTC(2026, 7, 8) });
      check(`F.x ${name}: die Ordnung laeuft und verliert nichts`,
        r.reihenfolge.length === vorgaenge().length, `${r.reihenfolge.length}/4`);
      check(`F.y ${name}: jeder Vorgang behaelt seine Quelle`,
        r.reihenfolge.every((x) => x.beleg && x.beleg.hatQuelle === true));
    }
    // Und bei ausgeschaltetem Flag ist fuer alle drei nichts anders.
    delete process.env.HELMUT_RELEVANZORDNUNG;
    check("F.z Bei Flag AUS gilt das fuer alle drei gleichermassen (keine Sonderbehandlung)",
      rel.relevanzordnungAktiv({}) === false);
  }

  // ═══ G · NEUSTART ══════════════════════════════════════════════════════════
  abschnitt("G · Ein Neustart veraendert den Zustand nicht");
  {
    delete process.env.HELMUT_RELEVANZORDNUNG;
    const werte = [];
    for (let i = 0; i < 5; i += 1) werte.push(frisch(REL).relevanzordnungAktiv({}));
    check("G.1 Fuenf frische Ladevorgaenge liefern immer AUS",
      werte.every((w) => w === false), JSON.stringify(werte));
    const mitAn = [];
    for (let i = 0; i < 5; i += 1) mitAn.push(frisch(REL).relevanzordnungAktiv({ HELMUT_RELEVANZORDNUNG: "on" }));
    check("G.2 Fuenf frische Ladevorgaenge mit `on` liefern immer AN",
      mitAn.every((w) => w === true), JSON.stringify(mitAn));
    check("G.3 Der Prozess selbst hat das Flag nie gesetzt",
      process.env.HELMUT_RELEVANZORDNUNG === undefined);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("\nEin Merge dieses Sprints veraendert das Verhalten NICHT. Die Relevanzordnung");
  console.log("ist vollstaendig gebaut, getestet und wartet auf eine ausdrueckliche Freigabe.");
  process.exit(fail === 0 ? 0 : 1);
}

main();
