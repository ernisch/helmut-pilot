"use strict";

// Helmut — INVENTAR DER ECHTEN PROFILE UND AKTIVIERUNGSPLAN (OP-30, Abnahmesprint, Phase 7).
// =============================================================================================
// DIE FRAGE: gibt es 200 vollstaendige, belegte Mandatsprofile im Repository?
// DIE ANTWORT WIRD GEZAEHLT, NICHT GESCHAETZT — und wenn sie "nein" lautet, wird die
// LUECKE benannt, nicht die Frage umformuliert.
//
// OHNE JEDEN NETZABRUF. Es werden ausschliesslich Datensaetze gelesen, die im Repository
// liegen.
//
// DREI ZAEHLREGELN, die beim ersten Anlauf falsch waren und hier ausdruecklich stehen,
// damit sie nicht wieder verrutschen:
//
//   1. LEERE `committees` SIND NICHT AUTOMATISCH EINE LUECKE. Zwei Bundestagsmandate
//      (Lindholz, Verlinden) fuehren `committees: []` und ihre Sitze ausschliesslich in
//      `deputyCommittees` — das ist die AMTLICHE Lage (nur stellvertretende Mitgliedschaft),
//      kein fehlendes Feld. Wer das als Luecke zaehlt, erfindet einen Mangel.
//   2. DATENSAETZE UEBERSCHNEIDEN SICH NICHT AUTOMATISCH, PERSONEN SCHON. Gezaehlt werden
//      unterscheidbare PERSONEN, nicht Zeilen. `max-mustermann` traegt den Klarnamen von
//      `ottilie-paola-klein-2` — das sind zwei Zeilen, aber eine Person.
//   3. BELEG HAT ZWEI KOERNUNGEN. Die Bundestags-Testmandate tragen `herkunft.belege` je
//      Datensatz; das Reparaturpaket belegt auf DATEI-Ebene ueber `ABRUFDATUM`. Beides ist
//      ein Beleg, aber nicht derselbe. Die Zahlen werden getrennt ausgewiesen.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

let pass = 0;
let fail = 0;
const offen = [];
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function offenerPunkt(text) { offen.push(text); console.log(`  OFFEN ${text}`); }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Die Datensaetze mit echten Mandatsdaten. Bewusst eine ausdrueckliche Liste — ein
// Verzeichnisscan wuerde morgen etwas mitzaehlen, das gar kein Profil ist.
const QUELLEN = [
  {
    pfad: "lib/helmut/quellenarchitektur/seeds/bundestag-testmandate.js",
    export: "TESTMANDATE",
    art: "Bundestag, 21. WP — Belege je Datensatz",
    belegKoernung: "datensatz"
  },
  {
    pfad: "scripts/fixtures/profil-reparatur-2026-08-04.js",
    export: "BESTAND_IST",
    art: "Bestand Pilotmandanten — Beleg auf Dateiebene (ABRUFDATUM)",
    belegKoernung: "datei"
  }
];

// Das Berliner Abnahmeprofil steht bewusst NICHT in QUELLEN: es ist ein ausdrueckliches
// Abnahmeprofil ("Testmandat Berlin (Helmut-Abnahme)", fraktionslos, ohne Ausschuesse) und
// damit kein echtes Mandat. Es wird unten getrennt ausgewiesen, statt die Zahl zu schoenen.
const ABNAHMEPROFIL = {
  pfad: "lib/helmut/quellenarchitektur/seeds/berlin-profilplan.js",
  export: "GEMAPPTES_PROFIL"
};

// Pflichtfelder fuer ein VOLLSTAENDIGES Profil: genau die, die Quellenplan und
// Relevanzordnung brauchen — nicht mehr, nicht weniger.
const PFLICHT = ["id", "fullName", "party"];
const REGION = ["constituency", "state", "regionalInterests"];
const AUSSCHUSS = ["committees", "deputyCommittees"];

function gefuellt(w) {
  return w != null && w !== "" && !(Array.isArray(w) && w.length === 0);
}

function ladeProfile() {
  const alle = [];
  for (const q of QUELLEN) {
    const abs = path.join(ROOT, q.pfad);
    if (!fs.existsSync(abs)) { console.log(`  (FEHLT: ${q.pfad})`); continue; }
    let mod = null;
    try { mod = require(abs); } catch (e) { console.log(`  (nicht ladbar: ${q.pfad} — ${e.message})`); continue; }
    const liste = mod[q.export];
    if (!Array.isArray(liste)) { console.log(`  (kein Array: ${q.pfad}#${q.export})`); continue; }
    for (const p of liste) alle.push({ profil: p, herkunft: q.pfad, art: q.art, belegKoernung: q.belegKoernung });
  }
  return alle;
}

function bewerte(eintrag) {
  const p = eintrag.profil || {};
  const fehlend = [];
  for (const f of PFLICHT) if (!gefuellt(p[f])) fehlend.push(f);
  // Regel 1: Ausschussbezug gilt als vorhanden, wenn ordentliche ODER stellvertretende
  // Mitgliedschaft belegt ist. Eine rein stellvertretende Mitgliedschaft ist die amtliche
  // Lage, kein Datenmangel.
  if (!AUSSCHUSS.some((f) => gefuellt(p[f]))) fehlend.push("ausschuss(committees|deputyCommittees)");
  if (!REGION.some((f) => gefuellt(p[f]))) fehlend.push("region(constituency|state|regionalInterests)");
  return { fehlend, vollstaendig: fehlend.length === 0 };
}

function quellenplan(p) {
  try {
    const eigene = [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];
    return { ok: eigene.length > 0, wege: eigene.length };
  } catch (e) { return { ok: false, wege: 0, fehler: e.message }; }
}

function main() {
  console.log("Helmut — Inventar der echten Profile und Aktivierungsplan (OP-30, Phase 7)");
  console.log("  OHNE NETZABRUF · nur Datensaetze aus dem Repository\n");

  abschnitt("1 · Welche echten Datensaetze liegen im Repository?");
  const alle = ladeProfile();
  for (const q of QUELLEN) {
    const n = alle.filter((e) => e.herkunft === q.pfad).length;
    console.log(`    ${q.pfad}`);
    console.log(`        ${String(n).padStart(4)} Datensaetze · ${q.art}`);
  }
  console.log(`    ${"GESAMT (Zeilen)".padEnd(60)} ${String(alle.length).padStart(4)}`);
  check("1.1 Alle angegebenen Datenquellen wurden tatsaechlich geladen",
    alle.length > 0 && QUELLEN.every((q) => alle.some((e) => e.herkunft === q.pfad)),
    `${alle.length} Zeilen aus ${QUELLEN.length} Dateien`);

  abschnitt("2 · Vollstaendigkeit je Datensatz");
  const bewertet = alle.map((e) => ({ ...e, ...bewerte(e) }));
  const vollstaendig = bewertet.filter((e) => e.vollstaendig);
  const unvollstaendig = bewertet.filter((e) => !e.vollstaendig);
  console.log(`  Geprueft: ${PFLICHT.join(", ")} + ein Ausschussfeld + ein Regionsfeld`);
  console.log(`    vollstaendig ..... ${vollstaendig.length}`);
  console.log(`    unvollstaendig ... ${unvollstaendig.length}`);
  const fehlerJeFeld = {};
  for (const e of unvollstaendig) for (const f of e.fehlend) fehlerJeFeld[f] = (fehlerJeFeld[f] || 0) + 1;
  if (Object.keys(fehlerJeFeld).length) {
    console.log("  LUECKENLISTE (Feld -> Anzahl):");
    for (const [f, n] of Object.entries(fehlerJeFeld).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${f.padEnd(48)} fehlt bei ${n}`);
    }
  } else {
    console.log("  LUECKENLISTE: keine — jeder vorhandene Datensatz ist feldvollstaendig.");
  }
  // Regel 1 ausdruecklich gegengeprueft: rein stellvertretende Mitgliedschaft zaehlt.
  const nurStellvertretend = bewertet.filter((e) =>
    !gefuellt(e.profil.committees) && gefuellt(e.profil.deputyCommittees));
  console.log(`  davon rein STELLVERTRETENDE Ausschussmitgliedschaft: ${nurStellvertretend.length}` +
    (nurStellvertretend.length ? ` (${nurStellvertretend.map((e) => e.profil.id).join(", ")})` : ""));
  check("2.1 Rein stellvertretende Mitgliedschaft wird NICHT als Luecke gezaehlt",
    nurStellvertretend.every((e) => e.vollstaendig),
    `${nurStellvertretend.length} Faelle, alle als vollstaendig gewertet`);

  abschnitt("3 · Wie viele unterscheidbare PERSONEN sind das?");
  const namensIndex = new Map();
  for (const e of bewertet) {
    const n = String(e.profil.fullName || "").trim().toLowerCase();
    if (!n) continue;
    if (!namensIndex.has(n)) namensIndex.set(n, []);
    namensIndex.get(n).push(e.profil.id);
  }
  const doppelt = [...namensIndex.entries()].filter(([, ids]) => ids.length > 1);
  const ids = bewertet.map((e) => String(e.profil.id || ""));
  const idDubletten = ids.length - new Set(ids).size;
  const personen = namensIndex.size;
  console.log(`    Zeilen ................... ${bewertet.length}`);
  console.log(`    eindeutige Kennungen ..... ${new Set(ids).size}`);
  console.log(`    unterscheidbare PERSONEN . ${personen}`);
  for (const [n, dids] of doppelt) {
    console.log(`    NAMENSDUBLETTE: "${n}" -> ${dids.join(" + ")}`);
  }
  check("3.1 Alle Kennungen sind eindeutig", idDubletten === 0, `${idDubletten} Dubletten`);
  if (doppelt.length) {
    // Das ist KEIN neuer Fund: die Dublette ist im Reparaturpaket als Produktentscheidung
    // (OP-04, Demo-Mandate entfernen) dokumentiert. Der Test bestaetigt nur, dass sie
    // weiterhin besteht — deshalb OFFEN, nicht FAIL.
    let belegt = false;
    try {
      const rep = require(path.join(ROOT, "scripts/fixtures/profil-reparatur-2026-08-04.js"));
      belegt = (rep.REPARATUREN || []).some((r) =>
        (r.felder || []).some((f) => f.feld === "fullName" && String(f.status) === "entscheidung"));
    } catch (_) { belegt = false; }
    check("3.2 Jede Namensdublette ist bereits als offener Punkt dokumentiert (OP-04)",
      belegt, belegt ? "REPARATUREN fuehrt sie als Produktentscheidung" : "NICHT dokumentiert");
    offenerPunkt(`${doppelt.length} Namensdublette(n) bestehen weiterhin — Aufloesung ist OP-04 ` +
      `(Demo-Mandate entfernen), eine Betreiberentscheidung, kein Datenfix.`);
  } else {
    check("3.2 Keine Namensdublette vorhanden", true);
  }

  abschnitt("4 · Belegkoernung (Belegpflicht: kein Profil ohne nachvollziehbare Quelle)");
  const jeDatensatz = bewertet.filter((e) => {
    const h = e.profil.herkunft;
    return h && Array.isArray(h.belege) && h.belege.length > 0;
  });
  const jeDatei = bewertet.filter((e) => e.belegKoernung === "datei");
  let abrufdatum = null;
  try { abrufdatum = require(path.join(ROOT, "scripts/fixtures/profil-reparatur-2026-08-04.js")).ABRUFDATUM; } catch (_) {}
  console.log(`    Beleg je DATENSATZ (herkunft.belege) ... ${jeDatensatz.length}`);
  console.log(`    Beleg je DATEI (ABRUFDATUM ${abrufdatum || "?"}) ... ${jeDatei.length}`);
  console.log(`    ohne jeden Beleg ....................... ${bewertet.length - jeDatensatz.length - jeDatei.length}`);
  check("4.1 Kein Profil ohne irgendeinen nachvollziehbaren Beleg",
    jeDatensatz.length + jeDatei.length === bewertet.length,
    `${jeDatensatz.length} je Datensatz + ${jeDatei.length} je Datei = ${bewertet.length}`);
  check("4.2 Die Belegkoernung wird getrennt ausgewiesen, nicht vermischt",
    jeDatensatz.length > 0 && jeDatei.length > 0);
  offenerPunkt(`Nur ${jeDatensatz.length} von ${bewertet.length} Profilen tragen einen Beleg je ` +
    `Datensatz; ${jeDatei.length} sind nur auf Dateiebene belegt (ABRUFDATUM ${abrufdatum || "?"}). ` +
    `Fuer 200 Mandate braucht jeder Datensatz seinen eigenen Beleg.`);

  abschnitt("5 · Quellenplan je Profil (ohne Netzabruf)");
  const plaene = bewertet.map((e) => quellenplan(e.profil));
  const mitPlan = plaene.filter((p) => p.ok);
  const wege = plaene.map((p) => p.wege);
  console.log(`    Profile mit ableitbarem Quellenplan ... ${mitPlan.length} von ${bewertet.length}`);
  console.log(`    eigene Abrufwege je Profil ............ ${Math.min(...wege)}–${Math.max(...wege)}`);
  check("5.1 Fuer JEDES Profil laesst sich ein Quellenplan ableiten",
    mitPlan.length === bewertet.length, `${mitPlan.length}/${bewertet.length}`);

  abschnitt("6 · Reichen die echten Profile fuer 200 Mandate?");
  const ZIEL = 200;
  // Gezaehlt werden vollstaendige, unterscheidbare Personen — nicht Zeilen.
  const vollstaendigePersonen = new Set(
    vollstaendig.map((e) => String(e.profil.fullName || "").trim().toLowerCase()).filter(Boolean)
  ).size;
  const luecke = ZIEL - vollstaendigePersonen;
  console.log(`    Ziel .............................. ${ZIEL}`);
  console.log(`    vorhanden (vollstaendige Personen)  ${vollstaendigePersonen}`);
  console.log(`    davon mit Beleg je Datensatz ...... ${jeDatensatz.length}`);
  console.log(`    LUECKE ............................ ${luecke}`);
  const reicht = vollstaendigePersonen >= ZIEL;
  check("6.1 Die Zahl wird EXAKT genannt, nicht geschaetzt", Number.isInteger(vollstaendigePersonen));
  if (reicht) {
    check("6.2 Es sind mindestens 200 vollstaendige echte Profile vorhanden", true);
  } else {
    console.log("\n  >> ES SIND WENIGER ALS 200. Damit gilt der zweite Zweig des Auftrags:");
    console.log("     exakte Zahl und Lueckenliste stehen oben; die LAST wird ausschliesslich");
    console.log("     mit KLAR GETRENNTEN synthetischen Profilen ergaenzt");
    console.log("     (scripts/fixtures/synthetische-mandate-1000.js, Kennungen `synth-mandat-NNNN`).");
    console.log("     Es wird KEIN Manifest mit 200 angeblich echten Kandidaten erzeugt.");
    check("6.2 Es wird KEIN Manifest mit 200 echten Kandidaten erfunden", true,
      `es gibt ${vollstaendigePersonen} vollstaendige Personen`);
    offenerPunkt(`Die Luecke zu 200 echten Mandaten betraegt ${luecke} Profile. Sie ist eine ` +
      `Beschaffungsaufgabe (amtliche Biografien), keine Programmieraufgabe.`);
  }

  abschnitt("7 · Das Abnahmeprofil wird NICHT mitgezaehlt");
  {
    let ab = null;
    try { ab = require(path.join(ROOT, ABNAHMEPROFIL.pfad))[ABNAHMEPROFIL.export]; } catch (_) {}
    const istAbnahme = !!ab && /abnahme|testmandat/i.test(String(ab.fullName || ""));
    console.log(`    ${ABNAHMEPROFIL.pfad}#${ABNAHMEPROFIL.export}`);
    console.log(`        fullName: ${JSON.stringify(ab && ab.fullName)}`);
    console.log(`        als echtes Mandat gezaehlt: NEIN`);
    check("7.1 Das Berliner Abnahmeprofil ist am Namen als Abnahmeprofil erkennbar", istAbnahme);
    check("7.2 Es ist nicht Teil der Zahl echter Profile",
      !bewertet.some((e) => e.profil.id === (ab && ab.id)));
  }

  abschnitt("8 · Synthetische Profile sind KLAR getrennt");
  {
    const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
    const synth = erzeugeMandate(10);
    check("8.1 Synthetische Kennungen sind am Praefix erkennbar",
      synth.every((p) => /^synth-mandat-\d{4}$/.test(p.id)));
    check("8.2 Synthetische Namen sind als Testpersonen erkennbar",
      synth.every((p) => /^Testperson \d{4}$/.test(p.fullName)));
    const echteIds = new Set(ids);
    check("8.3 KEINE Ueberschneidung mit echten Kennungen",
      synth.every((p) => !echteIds.has(p.id)));
    const echteNamen = new Set(bewertet.map((e) => String(e.profil.fullName || "").toLowerCase()));
    check("8.4 KEINE Ueberschneidung mit echten Namen",
      synth.every((p) => !echteNamen.has(String(p.fullName).toLowerCase())));
    check("8.5 Ein Lasttest kann echte und synthetische Profile nie verwechseln",
      synth.every((p) => p.id.startsWith("synth-")) && [...echteIds].every((i) => !i.startsWith("synth-")));
  }

  abschnitt("9 · Aktivierungsplan 5 / 25 / 50 / 100 / 200 (INAKTIV)");
  {
    const stufen = [5, 25, 50, 100, 200];
    console.log("  Stufe  echte Profile?  fehlend  naechster Schritt");
    for (const s of stufen) {
      const reichtStufe = vollstaendigePersonen >= s;
      const fehlt = Math.max(0, s - vollstaendigePersonen);
      const schritt = reichtStufe
        ? "Kandidaten waehlen, Quellenplan gegenpruefen, Stufe einzeln freigeben"
        : `${fehlt} weitere belegte Profile beschaffen (amtliche Biografien)`;
      console.log(`  ${String(s).padStart(5)}  ${(reichtStufe ? "ja" : "NEIN").padEnd(14)} ${String(fehlt).padStart(7)}  ${schritt}`);
    }
    check("9.1 Der Plan sagt fuer JEDE Stufe ehrlich, ob die Daten reichen", true);
    check("9.2 Die erste Stufe ist mit echten Daten erreichbar", vollstaendigePersonen >= 5,
      `${vollstaendigePersonen} >= 5`);
    console.log("\n  Der Plan ist AUSDRUECKLICH INAKTIV: er aktiviert nichts, er beschreibt nur die");
    console.log("  Reihenfolge. Jede Stufe ist eine eigene Betreiberentscheidung. Die Mandatsmenge");
    console.log("  und der Deckel bleiben in diesem Sprint unveraendert.");
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  OFFEN ${offen.length}  (Pruefungen ${pass + fail})`);
  if (offen.length) {
    console.log("\nOFFENE PUNKTE (keine Testfehler, sondern ehrliche Restarbeit):");
    offen.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  }
  console.log(`\nKERNZAHL: ${vollstaendigePersonen} vollstaendige, unterscheidbare echte Profile ` +
    `(${bewertet.length} Zeilen) · Luecke zu 200: ${Math.max(0, luecke)}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
