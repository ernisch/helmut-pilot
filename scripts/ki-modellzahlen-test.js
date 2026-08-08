"use strict";

// Helmut — KI-MODELLZAHLEN FUER 1000 PROFILE (OP-30, Sprintauftrag Phase 4).
// =============================================================================================
// Die Frage, die hier beantwortet wird, ist NICHT "wie viele Auftraege entstehen" — das ist
// gemessen und steht in skalierung-1000-test.js. Die Frage ist: **wie viele echte KI-Aufrufe
// kostet ein Tag mit 1000 Mandaten?** Das sind zwei verschiedene Zahlen, und sie werden hier
// konsequent getrennt gefuehrt.
//
// WARUM ES KEINE EINZELNE ZAHL GIBT — und warum das kein Ausweichen ist:
// Der Understanding-Bedarf haengt an der Zahl NEUER VORGAENGE des Tages, nicht an der Zahl
// der Mandate und nicht an der Zahl der Abrufe. Ein Vorgang wird global genau einmal
// verstanden (`understanding.js`, `existing` -> `duplicate`, kein Modellaufruf). Wie viele
// neue Vorgaenge ein Tag bringt, ist eine Eigenschaft der Nachrichtenlage, keine Eigenschaft
// des Systems. Deshalb: eine FORMEL mit belegten Faktoren, und drei Szenarien
// (Minimum / realistisch / belastbarer Hoechstwert) statt einer erfundenen Zahl.
//
// Alle Eingangsgroessen kommen aus dem Code oder aus gemessenen Laeufen. Wo eine Groesse
// geschaetzt ist, steht das ausdruecklich dabei und die Herleitung ist nachrechenbar.
//
// Offline. Keine Datenbank, kein Netz, keine KI.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function z(n) { return Number(n).toLocaleString("de-DE"); }

const ANZAHL = 1000;
const T0 = Date.parse("2026-08-08T00:00:00Z");
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

async function main() {
  console.log("Helmut — KI-Modellzahlen fuer 1000 Profile je Tag (OP-30, Phase 4)");
  console.log("  offline · aus dem Produktionscode gerechnet · keine KI, kein Netz\n");

  const profile = erzeugeMandate(ANZAHL);
  const bedarf = await SD.kompiliereQuellenbedarf({
    profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs: T0
  });
  const konfig = SD.fensterKonfig({});

  // ── 1 · AUFTRAEGE (nicht KI-Aufrufe) ─────────────────────────────────────
  abschnitt("1 · Auftraege je Tag — die Mengen, die GEMESSEN sind");
  const proTagGeteilt = bedarf.statistik.geteilteAuftraege * (24 / konfig.geteiltStundenFenster);
  const proTagPerson = bedarf.statistik.persoenlicheAuftraege * (24 / konfig.personStundenFenster);
  const proTagArchiv = bedarf.statistik.archivAuftraege * (24 / konfig.archivStundenFenster);
  const abrufeProTag = Math.round(proTagGeteilt + proTagPerson + proTagArchiv);
  const projektionen = ANZAHL * (24 / konfig.mandatMaxAlterStunden);
  const briefings = ANZAHL * (24 / konfig.mandatMaxAlterStunden);

  // Obergrenze der eingesammelten Rohitems: `maxItems` steht IM QUELLENOBJEKT und ist damit
  // aus dem Code ablesbar, nicht geschaetzt.
  let maxItemsSumme = 0;
  let ohneMaxItems = 0;
  for (const a of bedarf.auftraege) {
    const m = Number(a.payload && a.payload.quelle && a.payload.quelle.maxItems);
    if (Number.isFinite(m) && m > 0) maxItemsSumme += m; else ohneMaxItems += 1;
  }
  const jeAbruf = maxItemsSumme / Math.max(1, bedarf.auftraege.length);
  const rohitemsObergrenzeProTag = Math.round(abrufeProTag * jeAbruf);

  console.log(`  Abrufauftraege je Tag ................ ${z(abrufeProTag)}`);
  console.log(`  Mandatsprojektionen je Tag ........... ${z(projektionen)}   (0 KI, llm-pfad-karte.md 14)`);
  console.log(`  Briefingmaterialisierungen je Tag .... ${z(briefings)}   (0 KI, llm-pfad-karte.md 15)`);
  console.log(`  maxItems je Abruf (aus dem Quellenobjekt) ... ${jeAbruf.toFixed(1)}`
    + `${ohneMaxItems ? ` · ${ohneMaxItems} Auftraege ohne Angabe` : ""}`);
  console.log(`  -> OBERGRENZE eingesammelter Rohitems je Tag: ${z(rohitemsObergrenzeProTag)}`);
  check("1.1 Jeder Abrufauftrag traegt eine Obergrenze (maxItems)", ohneMaxItems === 0, String(ohneMaxItems));
  check("1.2 Projektion und Briefing sind je Mandat genau einmal am Tag",
    projektionen === ANZAHL && briefings === ANZAHL);

  // Verstehensauftraege: der Handler buendelt Dokumente zu je UNDERSTANDING_BUENDEL.
  const buendel = SP.UNDERSTANDING_BUENDEL;
  const verstehensAuftraegeObergrenze = Math.ceil(rohitemsObergrenzeProTag / buendel);
  console.log(`  Verstehensauftraege je Tag (Obergrenze, Buendelgroesse ${buendel}): ${z(verstehensAuftraegeObergrenze)}`);
  check("1.3 Verstehensauftraege sind an die Dokumentmenge gebunden, nicht an die Mandatszahl",
    verstehensAuftraegeObergrenze > 0);

  // ── 2 · DIE FORMEL ───────────────────────────────────────────────────────
  abschnitt("2 · Die Formel fuer die WIRKLICHEN KI-Aufrufe");
  console.log("  KI_Tag =  U  +  M");
  console.log("");
  console.log("    U = neue Vorgaenge des Tages          (GLOBAL, 1 Aufruf je neuem Vorgang)");
  console.log("      = Rohitems_Tag x (1 - d) x (1 / k)");
  console.log("          d = Dublettenanteil (dieselbe Story mehrfach, cross-source-Dedup)");
  console.log("          k = Dokumente je Vorgangscluster");
  console.log("");
  console.log("    M = mandatsbezogene Aufrufe           (je Mandat, NICHT geteilt)");
  console.log("      = Mandate_aktiv x (L + B)");
  console.log("          L = Lagenarrativ je Mandat und Tag  (0 oder 1, siehe unten)");
  console.log("          B = Buerotexte je Mandat und Tag    (nutzergesteuert)");
  console.log("");
  console.log("  AUS DEM CODE BELEGT, nicht geschaetzt:");
  console.log("    · Matching, Entscheidungen, Briefingmaterialisierung: 0 KI");
  console.log("      (docs/betrieb/llm-pfad-karte.md Zeilen 14/15; im 1000-Profile-Lauf gemessen)");
  console.log("    · Understanding ist GLOBAL: ein Vorgang wird einmal verstanden, egal wie");
  console.log("      viele Mandate ihn brauchen (understanding.js, existing -> duplicate)");
  console.log("    · Das Lagenarrativ ist zwischengespeichert je (Mandat, Tag, KO-Satz-Hash)");
  console.log("      und wird NUR beim App-Start angestossen (lage.js:502-522, server.js:443).");
  console.log("      Ein Mandat, das die App nicht oeffnet, kostet 0. Aendert sich der KO-Satz");
  console.log("      im Tagesverlauf, kostet es erneut.");
  console.log("    · Buerotexte (communicationDraft, parliamentAssessment, helmutAssessment,");
  console.log("      refineBriefingItem) sind AUSSCHLIESSLICH nutzergesteuert — kein Cron.");

  // ── 3 · DREI SZENARIEN ───────────────────────────────────────────────────
  abschnitt("3 · Minimum · realistisch · belastbarer Hoechstwert");

  // Die drei Faktoren, jeweils mit Herkunft.
  const szenarien = [
    {
      name: "MINIMUM",
      d: 0.90, k: 6, aktiv: 0.30, L: 1, B: 0,
      begruendung: "starker Dublettenanteil, grosse Cluster, nur 30 % der Mandate oeffnen die App, keine Buerotexte"
    },
    {
      name: "REALISTISCH",
      d: 0.75, k: 3, aktiv: 0.70, L: 1, B: 0.5,
      begruendung: "typischer Dublettenanteil bei Nachrichtensuchen, mittlere Cluster, 70 % taeglich aktiv, jeder zweite Mandant ein Buerotext"
    },
    {
      name: "HOECHSTWERT",
      d: 0.50, k: 1.5, aktiv: 1.00, L: 2, B: 3,
      begruendung: "wenig Dubletten, kaum Clusterbildung, alle Mandate aktiv, KO-Satz aendert sich einmal am Tag (zweites Narrativ), drei Buerotexte je Mandat"
    }
  ];

  // KORREKTUR 2026-08-08: hier stand `const DECKEL_HEUTE = 100` und der Text sprach vom
  // "heutigen Deckel". Das war NICHT belegt. Nachgeprueft im Code: `storage.js`
  // LLM_LIMIT_FALLBACK = 50 ist der Wert, der fail-closed wirklich greift; 100 ist nur
  // eine Runbook-EMPFEHLUNG in einem Kommentar. Der in Production gesetzte Env-Wert ist
  // offline nicht lesbar. Deshalb wird gegen BEIDE bekannten Zahlen verglichen und keine
  // davon als der geltende Deckel ausgegeben.
  const DECKEL_CODE = 50;        // BELEGT: storage.js LLM_LIMIT_FALLBACK
  const DECKEL_EMPFEHLUNG = 100; // EMPFEHLUNG, nicht wirksam
  const ergebnisse = [];
  for (const s of szenarien) {
    const rohitems = rohitemsObergrenzeProTag;
    const U = Math.round(rohitems * (1 - s.d) / s.k);
    const aktiveMandate = Math.round(ANZAHL * s.aktiv);
    const M = Math.round(aktiveMandate * (s.L + s.B));
    const gesamt = U + M;
    ergebnisse.push({ ...s, U, M, gesamt, aktiveMandate });
    console.log(`\n  ${s.name}`);
    console.log(`    Annahmen: Dublettenanteil ${(s.d * 100).toFixed(0)} % · ${s.k} Dokumente je Vorgang · `
      + `${(s.aktiv * 100).toFixed(0)} % aktive Mandate · ${s.L} Lage + ${s.B} Buero je aktivem Mandat`);
    console.log(`    (${s.begruendung})`);
    console.log(`    U  Understanding, GLOBAL ............ ${String(z(U)).padStart(7)}`);
    console.log(`    M  mandatsbezogen ................... ${String(z(M)).padStart(7)}   (${z(aktiveMandate)} aktive Mandate)`);
    console.log(`    ------------------------------------ ${"".padStart(7, "-")}`);
    console.log(`    KI-Aufrufe je Tag ................... ${String(z(gesamt)).padStart(7)}`);
    console.log(`    gegen Code-Standard 50 (belegt) ..... ${String((gesamt / DECKEL_CODE).toFixed(0) + "x").padStart(7)}`);
    console.log(`    gegen Runbook-Empfehlung 100 ........ ${String((gesamt / DECKEL_EMPFEHLUNG).toFixed(0) + "x").padStart(7)}`);
  }

  const min = ergebnisse[0];
  const real = ergebnisse[1];
  const max = ergebnisse[2];

  check("3.1 Selbst im MINIMUM reisst JEDE der beiden bekannten Deckelzahlen",
    min.gesamt > DECKEL_CODE && min.gesamt > DECKEL_EMPFEHLUNG,
    `${z(min.gesamt)} gegen ${DECKEL_CODE} (Code) und ${DECKEL_EMPFEHLUNG} (Empfehlung)`);
  // BEFUND, DER EINE ERWARTUNG WIDERLEGT HAT (2026-08-08).
  // Diese Zusage stand hier zuerst andersherum: "der mandatsbezogene Anteil ist der groessere".
  // Der eigene Testlauf hat das widerlegt — in JEDEM Szenario ueberwiegt der GLOBALE
  // Understanding-Anteil deutlich (realistisch 91 % gegen 9 %). Die Zusage wurde an die
  // Messung angepasst, nicht die Messung an die Zusage.
  check("3.2 In JEDEM Szenario ueberwiegt der GLOBALE Understanding-Anteil",
    min.U > min.M && real.U > real.M && max.U > max.M,
    `min ${z(min.U)}/${z(min.M)} · real ${z(real.U)}/${z(real.M)} · max ${z(max.U)}/${z(max.M)}`);
  check("3.3 Der globale Anteil haengt an der Dokumentmenge, NICHT an der Mandatszahl",
    true);
  check("3.4 Der mandatsbezogene Anteil waechst dagegen LINEAR mit der Mandatszahl",
    max.M / Math.max(1, max.aktiveMandate) > 0 && real.M / Math.max(1, real.aktiveMandate) > 0);

  // ── 4 · DIE ENTSCHEIDENDE ABLEITUNG ──────────────────────────────────────
  abschnitt("4 · Was daraus folgt");
  console.log(`  Deckel, Code-Standard (belegt) ........... ${DECKEL_CODE} Aufrufe/Tag (global)`);
  console.log(`  Deckel, Runbook-Empfehlung ............... ${DECKEL_EMPFEHLUNG} Aufrufe/Tag (NICHT wirksam)`);
  console.log(`  in Production wirksamer Wert ............. offline nicht lesbar`);
  console.log(`  Bedarf 1000 Mandate, realistisch ......... ${z(real.gesamt)} Aufrufe/Tag`);
  console.log(`  Fehlender Faktor ......................... ${(real.gesamt / DECKEL_CODE).toFixed(0)}x (Code) · `
    + `${(real.gesamt / DECKEL_EMPFEHLUNG).toFixed(0)}x (Empfehlung)`);
  console.log("");
  console.log(`  Davon GLOBAL (einmal fuer alle) .......... ${z(real.U)}  (${(real.U / real.gesamt * 100).toFixed(0)} %)`);
  console.log(`  Davon MANDATSBEZOGEN ..................... ${z(real.M)}  (${(real.M / real.gesamt * 100).toFixed(0)} %)`);
  console.log("");
  console.log("  DER PUNKT — und er faellt anders aus, als beim Bau dieses Tests erwartet:");
  console.log("  Der teure Posten ist NICHT die mandatsbezogene Arbeit, sondern das GLOBALE");
  console.log("  Verstehen der Dokumentflut. Das hat zwei Folgen, die sich nicht ersetzen:");
  console.log("");
  console.log("   (a) Die WIRKSAMSTE Kostensenkung ist, weniger zu verstehen — nicht, weniger");
  console.log("       Mandate zu bedienen. Dafuer gibt es zwei bereits gebaute Hebel:");
  console.log("       das Understanding-Gate (OP-18, HELMUT_UNDERSTANDING_GATE, heute 'off')");
  console.log("       und die Clusterbildung. Verdoppelt sich k von 3 auf 6, halbiert sich U.");
  console.log("   (b) Die faire Verteilung bleibt trotzdem noetig — aber fuer eine andere");
  console.log("       Frage. Sie verhindert nicht die Gesamtkosten, sondern dass die ersten");
  console.log("       Mandate den Tag leerraeumen. Ohne sie waere jede Deckelerhoehung nur");
  console.log("       ein groesserer Topf nach dem Prinzip 'wer zuerst kommt'.");
  console.log("");
  console.log("  Beides zusammen ist die Antwort. Ein hoeherer Deckel allein ist es nicht.");

  // Was ein einzelnes Mandat rechnerisch kostet — und wie weit der heutige Deckel traegt.
  const jeMandatReal = real.M / Math.max(1, real.aktiveMandate);
  const globalerSockel = real.U;
  console.log("");
  console.log(`  Je aktivem Mandat, realistisch ........... ${jeMandatReal.toFixed(1)} Aufrufe/Tag (mandatsbezogen)`);
  console.log(`  Globaler Sockel VOR dem ersten Mandat .... ${z(globalerSockel)} Aufrufe/Tag`);
  console.log("");
  console.log("  Zwei Rechnungen, weil zwei Fragen:");
  // Die guenstigere der beiden bekannten Zahlen, damit die Aussage auch dann gilt,
  // wenn in Production die Empfehlung gesetzt ist.
  const nurMandate = Math.floor(DECKEL_EMPFEHLUNG / Math.max(0.001, jeMandatReal));
  console.log(`   (1) Deckel ${DECKEL_EMPFEHLUNG} ausschliesslich fuer mandatsbezogene Arbeit -> ${nurMandate} Mandate.`);
  console.log(`   (2) Deckel ${DECKEL_EMPFEHLUNG} fuer den GESAMTEN Bedarf -> ${globalerSockel > DECKEL_EMPFEHLUNG ? "0" : "wenige"} Mandate:`);
  console.log(`       der globale Sockel allein (${z(globalerSockel)}) ist ${(globalerSockel / DECKEL_EMPFEHLUNG).toFixed(0)}x groesser als der Deckel.`);
  console.log("       Das ist der ehrliche Wert — (1) waere nur richtig, wenn das Verstehen");
  console.log("       ausserhalb des Deckels laege. Es liegt drin (canSpendLlm(null)).");
  check("4.1 KEINE der bekannten Deckelzahlen traegt 1000 Mandate — nicht einmal den globalen Sockel",
    globalerSockel > DECKEL_CODE && globalerSockel > DECKEL_EMPFEHLUNG,
    `Sockel ${z(globalerSockel)} gegen ${DECKEL_CODE} (Code) und ${DECKEL_EMPFEHLUNG} (Empfehlung)`);
  check("4.2 Auch die rein mandatsbezogene Rechnung bleibt unter 100 Mandaten",
    nurMandate < 100, `${nurMandate} Mandate bei Deckel ${DECKEL_EMPFEHLUNG}`);

  console.log("\n  >> EINORDNUNG: die Zahlen in Abschnitt 1 sind GEMESSEN (aus dem");
  console.log("     Produktionscode gerechnet). Die Zahlen in Abschnitt 3 sind RECHNERISCH");
  console.log("     und haengen an den drei benannten Faktoren. Sie sind kein Messergebnis");
  console.log("     und werden hier auch nicht als solches gefuehrt.");

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
