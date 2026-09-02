"use strict";

// Offline-Vertragstest des STUFENVERTRAGS und des ENTFERNUNGSAUSFÜHRERS.
//
// Hintergrund (Prüfung 02.09. nach dem Merge von #295, Kopf 9079ac3):
// Der Auftrag verlangt, dass die drei Stufen (20/75/400) GETRENNT behandelt
// werden und jede Stufe getrennte Freigaben für sechs Vorgänge trägt. Vor
// diesem Sprint war ausschließlich die AKTIVIERUNG gestuft; Provisionierung,
// Fachzyklus, Deaktivierung und Nacharbeit galten pauschal für alle 495.
// Einen Weg zur VOLLSTÄNDIGEN ENTFERNUNG gab es überhaupt nicht — der Rückweg
// deaktiviert ausdrücklich nur.
//
// Diese Suite hält beides technisch fest. Die wichtigsten Nachweise sind die
// NEGATIVEN: dass ohne Freigabe nichts geschrieben wird, dass eine Freigabe für
// eine Stufe keine andere Stufe treffen kann, dass ein aktives Profil nicht
// gelöscht wird, und dass eine leere oder ungezählte Menge NIE als Erfolg gilt.

const fs = require("fs");
const path = require("path");
const S = require("../lib/helmut/testkohorte-stufen");
const E = require("../lib/helmut/testkohorte-entfernung");
const B = require("../lib/helmut/testkohorte-betrieb");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function wirft(fn, grund) {
  try { await fn(); return false; } catch (e) { return grund ? e.grund === grund : true; }
}

// Eine Attrappe der Ablage: sie merkt sich, was entfernt wurde, und antwortet
// beim Gegenlesen wahrheitsgemäß. Keine echte Datenbank, kein Netz.
function ablage({ aktiv = false, vorhanden = true, schreibfehler = null } = {}) {
  const weg = new Set();
  const aufrufe = [];
  return {
    aufrufe,
    weg,
    deps: {
      entferne: async (id) => {
        aufrufe.push(id);
        if (schreibfehler) return { ok: false, reason: schreibfehler };
        weg.add(id);
        return { ok: true };
      },
      leseZustand: async (id) => (weg.has(id)
        ? { vorhanden: false, aktiv: false }
        : { vorhanden, aktiv })
    }
  };
}

const FREI = (stufe, vorgang) => ({
  HELMUT_TESTKOHORTE_EXECUTE: "1",
  HELMUT_TESTKOHORTE_CONFIRM: S.STUFEN_FREIGABEWORTE[stufe][vorgang]
});

async function main() {
  // ── A · Die Stufen stimmen mit der Kohortendefinition überein ─────────────
  console.log("\nA · Stufenumfang");
  check("A1 drei Stufen a/b/c", JSON.stringify(S.STUFEN) === JSON.stringify(["a", "b", "c"]));
  check("A2 Umfang 20/75/400", S.STUFEN_UMFANG.a === 20 && S.STUFEN_UMFANG.b === 75 && S.STUFEN_UMFANG.c === 400,
    JSON.stringify(S.STUFEN_UMFANG));
  check("A3 Summe der Stufen = Kohortengröße",
    S.STUFEN_UMFANG.a + S.STUFEN_UMFANG.b + S.STUFEN_UMFANG.c === B.KOHORTE_GESAMT,
    `${S.STUFEN_UMFANG.a + S.STUFEN_UMFANG.b + S.STUFEN_UMFANG.c} vs ${B.KOHORTE_GESAMT}`);
  check("A4 kumuliert 20/95/495",
    S.STUFEN_AKTIV_KUMULIERT.a === 20 && S.STUFEN_AKTIV_KUMULIERT.b === 95 && S.STUFEN_AKTIV_KUMULIERT.c === 495);
  check("A5 Stufe C plus 5 reale Mandate ergibt 500",
    S.STUFEN_AKTIV_KUMULIERT.c + B.REALE_MANDATE === 500);
  check("A6 kennungenDerStufe liefert genau den Stufenumfang",
    S.STUFEN.every((s) => S.kennungenDerStufe(s).length === S.STUFEN_UMFANG[s]));
  check("A7 kennungenBisStufe ist kumulativ",
    S.kennungenBisStufe("b").length === 95 && S.kennungenBisStufe("c").length === 495);
  check("A8 unbekannte Stufe wirft, statt eine leere Liste zu liefern",
    await wirft(() => S.kennungenDerStufe("z")));

  // ── B · Sechs Vorgänge, fünf davon schreibend ────────────────────────────
  console.log("\nB · Vorgänge je Stufe");
  check("B1 sechs Vorgänge", S.VORGANG_IDS.length === 6, S.VORGANG_IDS.join(", "));
  check("B2 die sechs sind die geforderten",
    ["provisionierung", "aktivierung", "fachzyklus", "auswertung", "deaktivierung", "entfernung"]
      .every((v) => S.VORGANG_IDS.includes(v)));
  check("B3 fünf schreibende Vorgänge (die Auswertung ist rein lesend)",
    S.SCHREIBENDE_VORGAENGE.length === 5 && !S.SCHREIBENDE_VORGAENGE.includes("auswertung"));
  check("B4 15 stufengenaue schreibende Vorgänge insgesamt",
    S.alleStufenvertraege({}).schreibendeVorgaengeGesamt === 15);

  // ── C · Freigaben sind fail closed ───────────────────────────────────────
  console.log("\nC · Freigaben (fail closed)");
  check("C1 ohne Umgebung ist KEINE schreibende Freigabe erteilt",
    S.alleStufenvertraege({}).offeneFreigabenGesamt === 15);
  check("C2 die Auswertung braucht keine Freigabe und behauptet keine",
    S.stufenFreigabe("a", "auswertung", {}).erteilt === true
      && S.stufenFreigabe("a", "auswertung", {}).schreibend === false
      && S.stufenFreigabe("a", "auswertung", {}).erwartetesWort === null);
  check("C3 Flag allein reicht nicht",
    S.stufenFreigabe("c", "entfernung", { HELMUT_TESTKOHORTE_EXECUTE: "1" }).erteilt === false);
  check("C4 Wort allein reicht nicht",
    S.stufenFreigabe("c", "entfernung",
      { HELMUT_TESTKOHORTE_CONFIRM: S.STUFEN_FREIGABEWORTE.c.entfernung }).erteilt === false);
  check("C5 Flag UND Wort geben frei",
    S.stufenFreigabe("c", "entfernung", FREI("c", "entfernung")).erteilt === true);
  check("C6 das Wort einer ANDEREN Stufe gibt nicht frei",
    S.stufenFreigabe("c", "entfernung", FREI("a", "entfernung")).erteilt === false);
  check("C7 das Wort eines ANDEREN Vorgangs derselben Stufe gibt nicht frei",
    S.stufenFreigabe("c", "entfernung", FREI("c", "deaktivierung")).erteilt === false);
  check("C8 unbekannter Vorgang wirft", await wirft(() => S.stufenFreigabe("a", "loeschen-alles", {})));

  // ── D · Bestandsverträglichkeit ──────────────────────────────────────────
  console.log("\nD · Bestandsverträglichkeit (die sieben Altworte bleiben unverändert)");
  check("D1 die Aktivierung übernimmt das Bestandswort, statt ein zweites zu erfinden",
    S.STUFEN.every((s) => S.STUFEN_FREIGABEWORTE[s].aktivierung === B.FREIGABEWORTE[`aktivierung-${s}`]));
  // KORREKTUR 02.09.: `FREIGABEWORTE` trägt SIEBEN Worte, nicht acht. Der
  // Ablaufplan zählt acht freigabepflichtige SCHRITTE — zwei davon (Schritt 3
  // Umgebungswerte, Schritte 19/20 Migration/Flag) sind reine Betreiberaktionen
  // ohne Bestätigungswort. Schritt und Wort sind nicht dasselbe.
  check("D2 alle sieben Bestandsworte existieren unverändert weiter",
    Object.keys(B.FREIGABEWORTE).length === 7
      && B.FREIGABEWORTE.provisionierung === "TESTKOHORTE_495_ANLEGEN_BESTAETIGT"
      && B.FREIGABEWORTE.deaktivierung === "TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT"
      && B.FREIGABEWORTE.fachzyklus === "TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT");
  check("D3 die neuen Worte kollidieren mit keinem Bestandswort",
    (() => {
      const alt = new Set(Object.values(B.FREIGABEWORTE));
      const neu = S.STUFEN.flatMap((s) => S.SCHREIBENDE_VORGAENGE
        .filter((v) => v !== "aktivierung")
        .map((v) => S.STUFEN_FREIGABEWORTE[s][v]));
      return neu.every((w) => !alt.has(w)) && new Set(neu).size === neu.length;
    })());

  // ── E · Reihenfolge der Stufen ───────────────────────────────────────────
  console.log("\nE · Reihenfolge");
  check("E1 Stufe A ist ohne Vorstufe zulässig", S.pruefeStufenReihenfolge("a", []).zulaessig === true);
  check("E2 Stufe C ohne bestandene Vorstufen ist NICHT zulässig",
    S.pruefeStufenReihenfolge("c", []).zulaessig === false);
  check("E3 Stufe C mit nur A ist NICHT zulässig",
    S.pruefeStufenReihenfolge("c", ["a"]).zulaessig === false);
  check("E4 Stufe C mit A und B ist zulässig",
    S.pruefeStufenReihenfolge("c", ["a", "b"]).zulaessig === true);
  check("E5 eine erfundene Stufe zählt nicht als bestandene Vorstufe",
    S.pruefeStufenReihenfolge("b", ["z"]).zulaessig === false);

  // ── F · Erlaubnisliste je Stufe ──────────────────────────────────────────
  console.log("\nF · Erlaubnisliste");
  check("F1 eine fremde Kennung bricht ab",
    await wirft(() => S.pruefeStufenZielmenge("a", ["m5-9aee228dbf2c9f13"]), "fremde-kennung"));
  check("F2 eine Kohortenkennung der FALSCHEN Stufe bricht ab",
    await wirft(() => S.pruefeStufenZielmenge("a", ["test-kohorte-c-001"]), "falsche-stufe"));
  check("F3 die eigene Stufe geht durch",
    S.pruefeStufenZielmenge("a", ["test-kohorte-a-001"]).length === 1);
  check("F4 stufeVonKennung ordnet richtig zu",
    S.stufeVonKennung("test-kohorte-a-001") === "a"
      && S.stufeVonKennung("test-kohorte-c-400") === "c");
  check("F5 stufeVonKennung liefert null für eine reale Kennung",
    S.stufeVonKennung("m5-9aee228dbf2c9f13") === null && S.stufeVonKennung("") === null);

  // ── G · Der Entfernungsausführer ─────────────────────────────────────────
  console.log("\nG · Entfernung — Trockenlauf ist Standard");
  const g1 = await E.fuehreEntfernungAus({ stufe: "c", env: {} });
  check("G1 ohne Modus läuft ein Trockenlauf", g1.modus === "trockenlauf" && g1.ok === false);
  const a1 = ablage();
  const g2 = await E.fuehreEntfernungAus({ stufe: "c", modus: "scharf", env: {}, deps: a1.deps });
  check("G2 scharf OHNE Freigabe fällt auf Trockenlauf und schreibt nichts",
    g2.modus === "trockenlauf" && a1.aufrufe.length === 0);
  check("G3 ohne Stufe gibt es keinen Lauf",
    await wirft(() => E.fuehreEntfernungAus({ modus: "scharf" }), "stufe"));
  check("G4 unbekannter Modus bricht ab",
    await wirft(() => E.fuehreEntfernungAus({ stufe: "a", modus: "vielleicht" }), "modus"));

  console.log("\nH · Entfernung — scharf, mit injizierter Ablage");
  const a2 = ablage({ aktiv: false });
  const h1 = await E.fuehreEntfernungAus({
    stufe: "a", modus: "scharf", env: FREI("a", "entfernung"), deps: a2.deps
  });
  check("H1 alle 20 der Stufe A entfernt, keiner fehlgeschlagen",
    h1.entfernt === 20 && h1.fehlgeschlagen === 0 && h1.ok === true, h1.meldung.slice(0, 60));
  check("H2 es wurden genau 20 Schreibvorgänge ausgelöst", a2.aufrufe.length === 20);
  check("H3 kein realer Mandant berührt", h1.realeMandateBeruehrt === 0);

  const a3 = ablage({ aktiv: true });
  const h2 = await E.fuehreEntfernungAus({
    stufe: "a", modus: "scharf", env: FREI("a", "entfernung"), deps: a3.deps
  });
  check("H4 ein NOCH AKTIVES Profil wird übersprungen, nicht gelöscht",
    h2.entfernt === 0 && h2.uebersprungenAktiv === 20 && a3.aufrufe.length === 0);
  check("H5 ein Lauf, der nur übersprungen hat, ist NICHT ok", h2.ok === false);

  const a4 = ablage({ aktiv: false, schreibfehler: "abgelehnt" });
  const h3 = await E.fuehreEntfernungAus({
    stufe: "a", modus: "scharf", env: FREI("a", "entfernung"), deps: a4.deps
  });
  check("H6 ein Schreibfehler beendet den Lauf nicht, wird aber gezählt",
    h3.fehlgeschlagen === 20 && h3.ergebnisse.length === 20 && h3.ok === false);

  const a5 = ablage();
  const h4 = await E.fuehreEntfernungAus({
    stufe: "a", kennungen: [], modus: "scharf", env: FREI("a", "entfernung"), deps: a5.deps
  });
  check("H7 eine LEERE Zielmenge ist niemals ein Erfolg", h4.ok === false && h4.zielGroesse === 0);

  const a6 = ablage();
  const h5 = await E.fuehreEntfernungAus({
    stufe: "c", modus: "scharf", env: FREI("a", "entfernung"), deps: a6.deps
  });
  check("H8 die Freigabe für Stufe A kann die 400 Profile der Stufe C NICHT entfernen",
    h5.modus === "trockenlauf" && a6.aufrufe.length === 0);

  const a7 = ablage();
  check("H9 eine untergeschobene fremde Kennung bricht ab, BEVOR geschrieben wird",
    await wirft(() => E.fuehreEntfernungAus({
      stufe: "a", kennungen: ["test-kohorte-a-001", "m5-9aee228dbf2c9f13"],
      modus: "scharf", env: FREI("a", "entfernung"), deps: a7.deps
    }), "fremde-kennung") && a7.aufrufe.length === 0);

  // Ein nicht lesbarer Vorzustand darf nie zu einer Löschung führen.
  const a8 = ablage();
  const h6 = await E.fuehreEntfernungAus({
    stufe: "a", modus: "scharf", env: FREI("a", "entfernung"),
    deps: { entferne: a8.deps.entferne, leseZustand: async () => { throw new Error("DB weg"); } }
  });
  check("H10 nicht lesbarer Vorzustand: fail closed, es wird NICHT entfernt",
    h6.entfernt === 0 && h6.fehlgeschlagen === 20 && a8.aufrufe.length === 0 && h6.ok === false);

  // ── I · Der Restbestandsbefund ───────────────────────────────────────────
  console.log("\nI · Restbestand (eine nicht durchgeführte Zählung ist keine Null)");
  check("I1 ohne Erhebung nicht auswertbar", E.restbestandsBefund({}).auswertbar === false);
  check("I2 ein FEHLENDER Zähler ist kein Nullwert",
    E.restbestandsBefund({ erhebung: { mandatsprofile: 0 } }).auswertbar === false);
  check("I3 ein negativer oder unbrauchbarer Zähler ist kein Nullwert",
    E.restbestandsBefund({
      erhebung: {
        mandatsprofile: -1, identitaetsprofile: 0, storeZeilen: 0,
        warteschlangenAuftraege: 0, schedulerSpuren: 0
      }
    }).auswertbar === false);
  const voll = E.restbestandsBefund({
    stufe: "c",
    erhebung: {
      mandatsprofile: 0, identitaetsprofile: 0, storeZeilen: 0,
      warteschlangenAuftraege: 0, schedulerSpuren: 0
    }
  });
  check("I4 alle fünf Familien gezählt 0 ergibt vollständig entfernt",
    voll.auswertbar === true && voll.vollstaendigEntfernt === true && voll.restSumme === 0);
  const rest = E.restbestandsBefund({
    erhebung: {
      mandatsprofile: 0, identitaetsprofile: 400, storeZeilen: 0,
      warteschlangenAuftraege: 0, schedulerSpuren: 12
    }
  });
  check("I5 Restzeilen werden benannt, nicht verschwiegen",
    rest.vollstaendigEntfernt === false && rest.restSumme === 412
      && rest.familienMitRest.includes("identitaetsprofile")
      && rest.familienMitRest.includes("schedulerSpuren"));
  check("I6 fünf Restbestandsfamilien werden geprüft", E.RESTBESTAND_FAMILIEN.length === 5);

  // ── J · Mandantenneutralität ─────────────────────────────────────────────
  console.log("\nJ · Mandantenneutralität (CLAUDE.md §4.2)");
  for (const datei of [
    "lib/helmut/testkohorte-stufen.js",
    "lib/helmut/testkohorte-entfernung.js",
    "scripts/testkohorte-entfernung.js"
  ]) {
    const quelle = fs.readFileSync(path.join(ROOT, datei), "utf8");
    check(`J-${datei} enthält keinen realen Mandats-Slug`,
      !/m5-[0-9a-f]{8}/.test(quelle));
  }

  // ── K · Welche Grenzen wirken zur LAUFZEIT, welche nur auf dem Papier? ────
  //
  // BEFUND 02.09. (Nachprüfung nach dem Merge von #295, am Code belegt):
  // Der Auftrag spricht von „Parallelität 2 mit hartem RPM-, TPM-, Kosten- und
  // Vorrangschutz". Drei dieser vier Schutzmechanismen sind NICHT hart:
  //
  //   HELMUT_TESTLAUF_MAX_RPM / _MAX_TPM  — kommen ausschließlich in
  //     `funktionstest-500.js` (Konfigurationsprüfung), `kapazitaet-500.js`
  //     (Planungsrechnung) und in Tests vor. KEIN Ausführungspfad liest sie.
  //     Es gibt im gesamten `lib/helmut/` keinen Minutentakt-Begrenzer;
  //     `azure-endpunkt.js` ist ein reiner Zieladressen-Wächter (Hostliste,
  //     Port, Länge) und drosselt nichts.
  //   HELMUT_TESTLAUF_KOSTENBUDGET_USD  — wirkt über die Abbruchregel A04, also
  //     an den Kontrollpunkten ZWISCHEN den Stufen. Das ist eine ENTDECKENDE
  //     Kontrolle, keine verhindernde: das Budget kann innerhalb einer Stufe
  //     überschritten werden und wird erst danach bemerkt.
  //
  // HART ist allein der Tagesdeckel: `storage.reserveLlmCall` reserviert atomar
  // gegen `HELMUT_MAX_LLM_CALLS_PER_DAY`, mit Verstehens-Reserve und
  // Vorrangreserve der realen Mandate, und ist fail closed.
  //
  // Dieser Abschnitt hält den Befund fest, damit niemand später eine Drossel
  // ANNIMMT, die es nicht gibt. Wird eine echte Ratenbegrenzung gebaut, wird
  // dieser Test rot — dann ist er anzupassen, nicht zu löschen.
  console.log("\nK · Welche Grenzen wirken zur Laufzeit (Befund, kein Wunsch)");
  const quellen = fs.readdirSync(path.join(ROOT, "lib/helmut"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ datei: `lib/helmut/${f}`, text: fs.readFileSync(path.join(ROOT, "lib/helmut", f), "utf8") }));
  const rpmLeser = quellen
    .filter((q) => /HELMUT_TESTLAUF_MAX_(RPM|TPM)/.test(q.text))
    .map((q) => q.datei);
  check("K1 RPM/TPM werden ausschließlich in Konfigurations- und Planungsmodulen genannt",
    rpmLeser.every((d) => d === "lib/helmut/funktionstest-500.js" || d === "lib/helmut/kapazitaet-500.js"),
    rpmLeser.join(", ") || "keine Fundstelle");
  check("K2 der Endpunktguard drosselt nicht, er prüft nur die Zieladresse",
    (() => {
      const guard = fs.readFileSync(path.join(ROOT, "lib/helmut/azure-endpunkt.js"), "utf8");
      return !/setTimeout|sleep|warte|rateLimit|tokenBucket/i.test(guard);
    })());
  check("K3 der Tagesdeckel ist dagegen laufzeitwirksam und atomar reserviert",
    (() => {
      const st = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
      return /async function reserveLlmCall/.test(st)
        && /HELMUT_MAX_LLM_CALLS_PER_DAY/.test(st);
    })());

  // ── L · Die Provisionierung ist jetzt stufenfähig — ohne Bestandsbruch ────
  console.log("\nL · Stufenweise Provisionierung");
  const V = require("../lib/helmut/testkohorte-vorwaerts");
  const ohneStufe = await V.fuehreProvisionierungAus({});
  check("L1 OHNE Stufe unverändert: 495 Kennungen und das Bestandswort",
    ohneStufe.zielGroesse === 495
      && ohneStufe.freigabe.erwartetesWort === B.FREIGABEWORTE.provisionierung
      && ohneStufe.stufe === null);
  for (const s of S.STUFEN) {
    const mitStufe = await V.fuehreProvisionierungAus({ stufe: s });
    check(`L2-${s.toUpperCase()} MIT Stufe: ${S.STUFEN_UMFANG[s]} Kennungen und das Stufenwort`,
      mitStufe.zielGroesse === S.STUFEN_UMFANG[s]
        && mitStufe.freigabe.erwartetesWort === S.STUFEN_FREIGABEWORTE[s].provisionierung
        && mitStufe.stufe === s);
  }
  check("L3 eine Kennung der falschen Stufe bricht ab",
    await wirft(() => V.fuehreProvisionierungAus({ stufe: "a", kennungen: ["test-kohorte-c-001"] }),
      "falsche-stufe"));
  check("L4 eine unbekannte Stufe bricht ab",
    await wirft(() => V.fuehreProvisionierungAus({ stufe: "z" }), "stufe"));
  check("L5 auch mit Stufe bleibt der Trockenlauf der Standard",
    (await V.fuehreProvisionierungAus({ stufe: "c", modus: "scharf", env: {} })).modus === "trockenlauf");

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(`FEHLER: ${(e && e.stack) || e}`);
  process.exit(1);
});
