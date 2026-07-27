"use strict";

// Vorgangsbildung: messen und nachholen (Betriebsbefund B4, Phasen 2 und 8).
// =============================================================================
// EIN Werkzeug fuer beides, weil beides dieselbe Datengrundlage braucht:
//   * MESSEN     welchen Endzustand hat jedes Rohdokument? Wie hoch ist der
//                Verlust wirklich? (`--messen`, Standard)
//   * NACHHOLEN  genau die Dokumente ohne gueltigen Endzustand erneut durch die
//                normale Vorgangsbildung schicken (`--ausfuehren`)
//
// SICHERHEITSREGELN (nicht verhandelbar):
//   1. VORSCHAU IST DER STANDARD. Ohne `--ausfuehren` wird ausschliesslich
//      gelesen — kein Write, kein KI-Aufruf, keine Kosten.
//   2. `--ausfuehren` verlangt ZUSAETZLICH die Umgebungsvariable
//      HELMUT_NACHHOLEN_BESTAETIGT=ja. Ein Tippfehler kann keinen Lauf ausloesen.
//   3. HARTE MENGENGRENZE (`--max`, Standard 200). Liegt mehr an, bricht das
//      Werkzeug AB statt zu arbeiten — ein unerwartet grosser Rueckstand ist ein
//      Befund fuer den Betreiber, kein Auftrag fuer einen Massenlauf.
//   4. Es wird NIE etwas dupliziert: verstandene und bewusst ausgeschlossene
//      Dokumente sind strukturell keine Kandidaten (vorgangs-lebenszyklus.js).
//   5. Idempotent: derselbe Aufruf zweimal erzeugt beim zweiten Mal `duplicate`
//      bzw. `merged` — keine zweiten Vorgaenge, keine zweiten KI-Aufrufe.
//   6. Mandantensicher: beruehrt ausschliesslich die mandantenneutralen Tabellen
//      raw_documents / knowledge_objects / ko_document_links. Es wird KEINE
//      mandantenbezogene Tabelle gelesen oder geschrieben.
//
// SECRETS ausschliesslich aus process.env (CLAUDE.md §4.9) — lokal wie in einer
// Claude-Code-Cloud-Sitzung derselbe Aufruf, kein eigenes .env-Parsen.
//
// Aufrufe:
//   node scripts/vorgangsbildung-nachholen.js                      # Messung, 7 Tage
//   node scripts/vorgangsbildung-nachholen.js --tage=14 --json
//   node scripts/vorgangsbildung-nachholen.js --vorschau           # Nachhol-Vorschau
//   node scripts/vorgangsbildung-nachholen.js --ids=rd-1,rd-2 --vorschau
//   node scripts/vorgangsbildung-nachholen.js --vorgang=vg-csd-20260725-c5fa87 --vorschau
//   node scripts/vorgangsbildung-nachholen.js --tage=3 --karenz=0 --vorschau
//   HELMUT_NACHHOLEN_BESTAETIGT=ja node scripts/vorgangsbildung-nachholen.js --vorschau --ausfuehren
//
// Optionen:
//   --tage=N      Betrachtungsfenster in Tagen (Standard 7)
//   --karenz=H    Karenzzeit in Stunden (Standard 24). Ein unverknuepftes Dokument
//                 gilt erst nach dieser Zeit als Rueckstand. 0 = keine Karenz.
//                 Wirkt NUR in diesem Werkzeug (siehe parseArgs).
//   --max=N       Obergrenze der Kandidaten (Standard 200) — darueber Abbruch
//   --ids=a,b     nur diese Rohdokument-Kennungen
//   --vorgang=id  nur Kandidaten dieses Vorgangs
//   --vorschau    Nachhol-Kandidaten ermitteln (schreibt nichts)
//   --ausfuehren  tatsaechlich nachholen (zusaetzlich HELMUT_NACHHOLEN_BESTAETIGT=ja)
//   --json        Maschinenlesbare Ausgabe

const path = require("path");
const root = path.join(__dirname, "..");
const lebenszyklus = require(path.join(root, "lib/helmut/vorgangs-lebenszyklus.js"));

const MAX_STANDARD = 200;
const TAGE_STANDARD = 7;

// `--karenz=<stunden>` — WARUM ES DIESE OPTION GIBT:
// Die Karenzzeit (Standard 24 h) beantwortet die Frage "ist dieses Rohdokument
// schon zu lange unverarbeitet?". Fuer den laufenden Betrieb ist sie richtig: ein
// frisch eingesammeltes Dokument ist noch kein Rueckstand. Fuer das GEZIELTE
// Nachholen eines bekannten Verlustfalls ist sie falsch — dort weiss der
// Betreiber bereits, dass die Pipeline an den Dokumenten vorbeigelaufen ist und
// nicht mehr auf sie zurueckkommt (belegt am CSD-2026-Fall: der reguläre Lauf
// verarbeitet nur Dokumente seines EIGENEN Crawls).
// Die Option wirkt AUSSCHLIESSLICH in diesem Werkzeug. Der Watchdog im
// Health-Report und jede normale Verarbeitung nutzen unveraendert den Standard
// aus lib/helmut/vorgangs-lebenszyklus.js.
function parseArgs(argv) {
  const a = {
    tage: TAGE_STANDARD, max: MAX_STANDARD, json: false, vorschau: false, ausfuehren: false,
    ids: [], vorgang: null, limit: 4000,
    // null = Standard des Lebenszyklus-Moduls (24 h) unveraendert uebernehmen.
    karenz: null
  };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    const [, name, wert] = m;
    if (name === "tage") a.tage = Math.max(1, Number(wert) || TAGE_STANDARD);
    else if (name === "max") a.max = Math.max(1, Number(wert) || MAX_STANDARD);
    else if (name === "limit") a.limit = Math.max(100, Number(wert) || 4000);
    else if (name === "karenz") {
      // 0 ist ein gueltiger, ausdruecklicher Wert ("keine Karenz") — deshalb wird
      // hier streng geprueft statt mit `|| Standard` zu arbeiten.
      const n = Number(wert);
      if (!Number.isFinite(n) || n < 0) { console.error("--karenz erwartet eine Zahl >= 0 (Stunden)."); process.exit(2); }
      a.karenz = n;
    }
    else if (name === "json") a.json = true;
    else if (name === "vorschau") a.vorschau = true;
    else if (name === "ausfuehren") a.ausfuehren = true;
    else if (name === "ids") a.ids = String(wert || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (name === "vorgang") a.vorgang = String(wert || "").trim() || null;
    else { console.error(`Unbekanntes Argument: --${name}`); process.exit(2); }
  }
  // `--ausfuehren` impliziert die Kandidatenermittlung.
  if (a.ausfuehren) a.vorschau = true;
  return a;
}

function pct(n, gesamt) { return gesamt ? `${(Math.round((n / gesamt) * 1000) / 10).toFixed(1)} %` : "—"; }
function iso(v) { return v ? String(v).slice(0, 19).replace("T", " ") : "—"; }

async function main() {
  const args = parseArgs(process.argv);
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  if (!storage.v3StoreReady()) {
    console.error("Datenzugriff nicht moeglich. Benoetigt werden:");
    console.error("  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (in einer Cloud-Sitzung ausschliesslich");
    console.error("  ueber die Environment-Einstellungen, nie im Chat, nie im Commit — CLAUDE.md §4.9)");
    console.error("  HELMUT_V3_STORE=1                        (dasselbe Zugriffsgate wie in Production;");
    console.error("  fuer die Messung wird ausschliesslich gelesen)");
    process.exit(3);
  }

  const now = Date.now();
  const [rawDocs, links, kos] = await Promise.all([
    storage.listRawDocuments({ days: args.tage, limit: args.limit }),
    storage.listKoDocumentLinks({ limit: Math.max(4000, args.limit) }),
    storage.listKnowledgeObjectStates({ limit: 4000 })
  ]);

  // listRawDocuments liefert created_at nicht mit — fuer die Karenzzeit ist der
  // Zeitstempel aber notwendig. Ersatzweise published_at, sonst wird das Dokument
  // ehrlich als "ohne Endzustand" gefuehrt statt stillschweigend als "offen".
  const docs = (rawDocs || []).map((d) => ({ ...d, created_at: d.created_at || d.retrieved_at || d.published_at || null }));

  const karenzStunden = args.karenz == null ? lebenszyklus.KARENZ_STUNDEN : args.karenz;
  const bewertung = lebenszyklus.assessLifecycle({ rawDocs: docs, links, kos, now, karenzStunden });
  const watchdog = lebenszyklus.watchdogVorgangsbildung(bewertung);
  // Eine abweichende Karenz veraendert die Bedeutung ALLER Zahlen darunter.
  // Sie wird deshalb ausgegeben, nicht stillschweigend angewandt.
  if (args.karenz != null && args.karenz !== lebenszyklus.KARENZ_STUNDEN) {
    console.log(`\nHINWEIS: Karenzzeit auf ${karenzStunden} h gesetzt (Standard ${lebenszyklus.KARENZ_STUNDEN} h).`);
    console.log("Dokumente, die noch in Arbeit sein koennten, zaehlen damit als Rueckstand.");
    console.log("Nur fuer gezieltes Nachholen bekannter Verlustfaelle verwenden — der Watchdog");
    console.log("im Health-Report und die normale Verarbeitung bleiben beim Standard.");
  }

  const ausgabe = {
    zeitraumTage: args.tage,
    karenzStunden,
    gemessenAm: new Date(now).toISOString(),
    rohdokumente: bewertung.gesamt,
    zustaende: bewertung.zustaende,
    anteile: bewertung.anteile,
    aeltestesOffenes: bewertung.aeltestesOffenes,
    aeltestesOhneEndzustand: bewertung.aeltestesOhneEndzustand,
    verarbeitungsdauer: bewertung.verarbeitungsdauer,
    watchdog
  };

  if (!args.vorschau) {
    if (args.json) { console.log(JSON.stringify(ausgabe, null, 2)); return process.exit(0); }
    const Z = lebenszyklus.ZUSTAND;
    const g = bewertung.gesamt;
    console.log(`\nVORGANGSBILDUNG — Endzustand je Rohdokument (${args.tage} Tage, read-only)\n`);
    console.log(`Rohdokumente im Fenster: ${g}`);
    console.log(`  verstanden (an einem verstandenen Vorgang) : ${bewertung.zustaende[Z.VERSTANDEN]}  ${pct(bewertung.zustaende[Z.VERSTANDEN], g)}`);
    console.log(`  bewusst ausgeschlossen                     : ${bewertung.zustaende[Z.AUSGESCHLOSSEN]}  ${pct(bewertung.zustaende[Z.AUSGESCHLOSSEN], g)}`);
    console.log(`  nach KI-Fehlschlag geparkt                 : ${bewertung.zustaende[Z.FEHLGESCHLAGEN]}  ${pct(bewertung.zustaende[Z.FEHLGESCHLAGEN], g)}`);
    console.log(`  zur erneuten Verarbeitung vorgemerkt       : ${bewertung.zustaende[Z.WIEDERVORLAGE]}  ${pct(bewertung.zustaende[Z.WIEDERVORLAGE], g)}`);
    console.log(`  offen innerhalb der Karenzzeit (${bewertung.karenzStunden} h)${" ".repeat(Math.max(0, 6 - String(bewertung.karenzStunden).length))}: ${bewertung.zustaende[Z.OFFEN]}  ${pct(bewertung.zustaende[Z.OFFEN], g)}`);
    console.log(`  OHNE gueltigen Endzustand                  : ${bewertung.zustaende[Z.OHNE_ENDZUSTAND]}  ${pct(bewertung.zustaende[Z.OHNE_ENDZUSTAND], g)}`);
    console.log(`\nAeltestes Dokument ohne Endzustand: ${bewertung.aeltestesOhneEndzustand ? `${bewertung.aeltestesOhneEndzustand.id} (${iso(bewertung.aeltestesOhneEndzustand.created_at)})` : "keines"}`);
    const d = bewertung.verarbeitungsdauer;
    console.log(`Verarbeitungsdauer Rohdokument -> Vorgang: ${d.gemessen ? `Mittel ${Math.round(d.mittelMs / 60000)} min · Median ${Math.round(d.medianMs / 60000)} min · Max ${Math.round(d.maxMs / 3600000)} h (${d.gemessen} gemessen)` : "nicht messbar"}`);
    console.log(`\nWatchdog: ${watchdog.zustand.toUpperCase()}`);
    for (const m of watchdog.meldungen) console.log(`  - ${m}`);
    console.log("");
    return process.exit(0);
  }

  // --- Nachhol-Kandidaten ---------------------------------------------------
  let kandidaten = lebenszyklus.nachholKandidaten(bewertung, { limit: args.max + 1 }).kandidaten;
  if (args.ids.length) {
    const gewuenscht = new Set(args.ids);
    kandidaten = kandidaten.filter((k) => gewuenscht.has(k.id));
    const unbekannt = args.ids.filter((id) => !kandidaten.some((k) => k.id === id));
    if (unbekannt.length) console.log(`Hinweis: ${unbekannt.length} angefragte Kennung(en) sind KEIN Nachhol-Kandidat (bereits verarbeitet, ausgeschlossen oder nicht im Fenster): ${unbekannt.slice(0, 10).join(", ")}`);
  }
  if (args.vorgang) {
    kandidaten = kandidaten.filter((k) => k.vorgangId === args.vorgang);
  }

  const docById = new Map(docs.map((d) => [d.id, d]));
  const nachzuholen = kandidaten.map((k) => docById.get(k.id)).filter(Boolean);

  console.log(`\nNACHHOLEN — Vorschau (${args.tage} Tage${args.vorgang ? `, Vorgang ${args.vorgang}` : ""}${args.ids.length ? `, ${args.ids.length} Kennungen` : ""})\n`);
  console.log(`Kandidaten: ${nachzuholen.length} (Obergrenze --max=${args.max})`);
  const nachZustand = kandidaten.reduce((m, k) => { m[k.zustand] = (m[k.zustand] || 0) + 1; return m; }, {});
  for (const [z, n] of Object.entries(nachZustand)) console.log(`  ${z}: ${n}`);

  if (nachzuholen.length > args.max) {
    console.error(`\nABBRUCH: ${nachzuholen.length} Kandidaten ueberschreiten die Obergrenze von ${args.max}.`);
    console.error("Das ist ein Befund, kein Auftrag. Zuerst die Ursache klaeren (Messung oben), dann");
    console.error("bewusst mit einem hoeheren --max und einem engeren --tage-Fenster wiederholen.");
    process.exit(4);
  }

  if (!args.ausfuehren) {
    console.log("\nVORSCHAU — es wurde NICHTS geschrieben und KEIN KI-Aufruf ausgeloest.");
    console.log("Zum tatsaechlichen Nachholen zusaetzlich: --ausfuehren und HELMUT_NACHHOLEN_BESTAETIGT=ja");
    if (args.json) console.log(JSON.stringify({ ...ausgabe, kandidaten: kandidaten.slice(0, 200) }, null, 2));
    return process.exit(0);
  }

  if (String(process.env.HELMUT_NACHHOLEN_BESTAETIGT || "").trim().toLowerCase() !== "ja") {
    console.error("\nABBRUCH: --ausfuehren verlangt zusaetzlich HELMUT_NACHHOLEN_BESTAETIGT=ja.");
    console.error("Das Nachholen erzeugt KI-Aufrufe (Kosten) und schreibt in Production.");
    process.exit(5);
  }
  if (!nachzuholen.length) {
    console.log("\nNichts nachzuholen — kein Dokument ohne gueltigen Endzustand im Fenster.");
    return process.exit(0);
  }

  // Ausfuehrung ueber den NORMALEN Verarbeitungsweg (kein Sonderpfad, keine
  // zweite Vorgangslogik): dieselbe Funktion, die auch der Crawl-Cron ruft.
  const { runUnderstandingShadow } = require(path.join(root, "lib/helmut/understanding.js"));
  const runId = `nachhol-${new Date(now).toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  console.log(`\nAUSFUEHRUNG (runId ${runId}) — ${nachzuholen.length} Rohdokumente durch die normale Vorgangsbildung.`);
  const start = Date.now();
  const ergebnis = await runUnderstandingShadow(nachzuholen, { runId });
  const dauerMs = Date.now() - start;

  await storage.recordProcessRun({
    process: "understanding-nachhol", runId, mode: "manuell", location: "skript",
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: dauerMs,
    processed: ergebnis && ergebnis.processed, deferred: ergebnis && ergebnis.deferred,
    reason: ergebnis && ergebnis.reason, status: ergebnis && ergebnis.skipped ? "skipped" : "ok",
    telemetrie: ergebnis && ergebnis.telemetrie
  }).catch(() => {});

  console.log(`\nErgebnis nach ${Math.round(dauerMs / 1000)} s:`);
  console.log(JSON.stringify({
    cluster: ergebnis && ergebnis.clusters, verarbeitet: ergebnis && ergebnis.processed,
    zurueckgestellt: ergebnis && ergebnis.deferred, vorgemerkt: ergebnis && ergebnis.vorgemerkt,
    ergebnisse: ergebnis && ergebnis.counts, aufloesungen: ergebnis && ergebnis.telemetrie && ergebnis.telemetrie.aufloesungen,
    grund: ergebnis && ergebnis.reason
  }, null, 2));
  console.log("\nErgebnispruefung: denselben Aufruf ohne --vorschau erneut starten — die Zahl der");
  console.log("Dokumente ohne gueltigen Endzustand muss gesunken sein.");
  return process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fehler:", error && error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, MAX_STANDARD, TAGE_STANDARD };
