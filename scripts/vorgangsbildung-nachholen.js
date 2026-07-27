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
//   --ids=a,b     NUR diese Rohdokument-Kennungen. Wirkt VOR jeder Mengenkappung;
//                 ein Lauf mit dieser Option verarbeitet ausschliesslich sie.
//   --vorgang=id  nur Kandidaten dieses Vorgangs
//   --vorschau    Nachhol-Kandidaten ermitteln (schreibt nichts)
//   --ausfuehren  tatsaechlich nachholen (zusaetzlich HELMUT_NACHHOLEN_BESTAETIGT=ja)
//   --json        Maschinenlesbare Ausgabe
//
// Exit-Codes (W-1/W-2, Werkzeug-Haertung 2026-07-27):
//   0  Erfolg — auch der ERFOLGREICHE Leerlauf ("Nichts nachzuholen" nach
//      gelungenem Read mit null Kandidaten)
//   1  unerwarteter Fehler (main().catch)
//   2  Argumentfehler
//   3  Konfiguration unvollstaendig (v3-Store nicht bereit)
//   4  Mengen-/Fremd-Riegel hat abgebrochen
//   5  HELMUT_NACHHOLEN_BESTAETIGT fehlt
//   6  TECHNISCHER LESEFEHLER (DNS/Timeout/Auth/Storage) — niemals als
//      "nichts nachzuholen" gedeutet; kein KI-Aufruf, kein Schreibzugriff
//   7  fachlich gelaufen, aber Lauftelemetrie NICHT gespeichert (Befund W-2:
//      ein Production-Lauf darf nicht unsichtbar werden)

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
    // null = Option nicht gesetzt. Eine LEERE Liste ist etwas anderes als "kein
    // Filter" und wird deshalb als Fehler behandelt (siehe unten).
    ids: null, idsRoh: 0, idsDoppelt: [], vorgang: null, limit: 4000,
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
    else if (name === "ids") {
      // SICHERE BEHANDLUNG LEERER/DOPPELTER KENNUNGEN (Hotfix B4-3, Phase 5):
      // `--ids=` (leer) sah bisher aus wie "kein Filter" und haette einen
      // gezielten Lauf still zu einem Massenlauf gemacht. Das ist jetzt ein
      // Abbruch. Dubletten werden entfernt und benannt, nicht doppelt gezaehlt.
      const roh = String(wert || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!roh.length) {
        console.error("--ids wurde ohne verwertbare Kennung angegeben. Das waere ein Massenlauf statt");
        console.error("eines gezielten Laufs — Abbruch. Entweder Kennungen nennen oder --ids weglassen.");
        process.exit(2);
      }
      const gesehen = new Set();
      const doppelt = [];
      const eindeutig = [];
      for (const id of roh) {
        if (gesehen.has(id)) { doppelt.push(id); continue; }
        gesehen.add(id);
        eindeutig.push(id);
      }
      a.ids = eindeutig;
      a.idsRoh = roh.length;
      a.idsDoppelt = [...new Set(doppelt)];
    }
    else if (name === "vorgang") a.vorgang = String(wert || "").trim() || null;
    else { console.error(`Unbekanntes Argument: --${name}`); process.exit(2); }
  }
  // `--ausfuehren` impliziert die Kandidatenermittlung.
  if (a.ausfuehren) a.vorschau = true;
  return a;
}

// --- Kandidatenauswahl (reine Logik, deshalb einzeln testbar) ---------------
// DIE REIHENFOLGE IST SICHERHEITSRELEVANT (Hotfix B4-3, Phase 5).
// Bisher wurde die Kandidatenliste ZUERST auf `--max`+1 gekappt und ERST DANACH
// nach `--ids` gefiltert. Bei einem Rueckstand von ueber tausend Dokumenten traf
// die Kappung also irgendwelche 201 — und von 21 gezielt angeforderten Kennungen
// ueberlebten nur die, die zufaellig darunter lagen. Ein "gezielter" Lauf
// verarbeitete damit stillschweigend eine andere Menge als angefordert, ohne dass
// die Ausgabe das erkennen liess.
//
// GARANTIEN DIESER FUNKTION:
//   1. `ids` wirkt auf die VOLLSTAENDIGE Liste, vor jeder Mengenbegrenzung.
//   2. Sind `ids` gesetzt, enthaelt das Ergebnis ausschliesslich diese Kennungen.
//   3. Nicht auffindbare Kennungen werden benannt statt verschwiegen.
//   4. `fremd` ist der Riegel: alles, was trotz `ids` im Pool laege. Er muss
//      immer leer sein — ist er es nicht, bricht der Aufrufer ab.
//   5. Die Mengenkappung wird nur BEWERTET (`ueberMax`), nicht angewandt: eine
//      stille Kuerzung ist genau der Fehler, um den es hier geht.
function waehleNachholKandidaten(alleKandidaten = [], { ids = null, vorgang = null, max = MAX_STANDARD } = {}) {
  const alle = (Array.isArray(alleKandidaten) ? alleKandidaten : []).filter(Boolean);
  const gewuenscht = ids ? new Set(ids) : null;
  let kandidaten = alle;
  const unbekannt = [];

  if (gewuenscht) {
    const istKandidat = new Set(alle.map((k) => k.id));
    kandidaten = alle.filter((k) => gewuenscht.has(k.id));
    for (const id of ids) if (!istKandidat.has(id)) unbekannt.push(id);
  }
  if (vorgang) kandidaten = kandidaten.filter((k) => k.vorgangId === vorgang);

  const auswahl = kandidaten.map((k) => k.id);
  return {
    gesamt: alle.length,
    kandidaten,
    ids: auswahl,
    unbekannt,
    fremd: gewuenscht ? auswahl.filter((id) => !gewuenscht.has(id)) : [],
    ueberMax: kandidaten.length > max
  };
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
  // W-1 (Werkzeug-Haertung): ein technischer Lesefehler (DNS, Timeout, Auth,
  // Storage) ist KEIN leeres Ergebnis. storage wirft dafuer einen typisierten
  // StorageReadError — hier wird er zu einem harten Abbruch mit Exit 6, BEVOR
  // irgendeine Bewertung, ein KI-Aufruf oder ein Schreibzugriff stattfindet.
  // "Nichts nachzuholen" (Exit 0) gibt es ausschliesslich nach einem
  // ERFOLGREICHEN Read mit null Kandidaten.
  let rawDocs, links, kos;
  try {
    [rawDocs, links, kos] = await Promise.all([
      storage.listRawDocuments({ days: args.tage, limit: args.limit }),
      storage.listKoDocumentLinks({ limit: Math.max(4000, args.limit) }),
      storage.listKnowledgeObjectStates({ limit: 4000 })
    ]);
  } catch (error) {
    if (error && error.name === "StorageReadError") {
      console.error("\nLESEFEHLER — Abbruch vor jeder Bewertung, vor jedem KI-Aufruf und vor jedem Schreibzugriff.");
      console.error(`Quelle: ${error.quelle} · Fehlerklasse: ${error.fehlerklasse}`);
      console.error(error.message);
      console.error("Dieser Zustand bedeutet NICHT \"nichts nachzuholen\" — die Abfrage selbst ist gescheitert.");
      console.error("Erst die Stoerung beheben (Netz/DNS/Zugangsdaten/Storage), dann den Aufruf wiederholen.");
      return process.exit(6);
    }
    throw error;
  }

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
  // Vollstaendige Liste holen (KEINE Kappung hier — siehe waehleNachholKandidaten).
  const alleKandidaten = lebenszyklus.nachholKandidaten(bewertung, { limit: Number.MAX_SAFE_INTEGER }).kandidaten;
  if (args.ids && args.idsDoppelt.length) {
    console.log(`Hinweis: ${args.idsDoppelt.length} doppelte Kennung(en) entfernt (${args.idsRoh} angegeben, ${args.ids.length} eindeutig): ${args.idsDoppelt.slice(0, 10).join(", ")}`);
  }
  const auswahl = waehleNachholKandidaten(alleKandidaten, { ids: args.ids, vorgang: args.vorgang, max: args.max });
  const kandidaten = auswahl.kandidaten;
  if (auswahl.unbekannt.length) {
    console.log(`Hinweis: ${auswahl.unbekannt.length} von ${args.ids.length} angefragten Kennung(en) sind KEIN Nachhol-Kandidat`);
    console.log(`(bereits verarbeitet, bewusst ausgeschlossen oder ausserhalb des ${args.tage}-Tage-Fensters): ${auswahl.unbekannt.slice(0, 20).join(", ")}`);
  }

  const docById = new Map(docs.map((d) => [d.id, d]));
  const nachzuholen = kandidaten.map((k) => docById.get(k.id)).filter(Boolean);
  const zuSchreibendeIds = nachzuholen.map((d) => d.id);

  console.log(`\nNACHHOLEN — Vorschau (${args.tage} Tage${args.vorgang ? `, Vorgang ${args.vorgang}` : ""}${args.ids ? `, ${args.ids.length} Kennungen` : ""})\n`);
  console.log(`Nachholbare Dokumente im Fenster insgesamt: ${auswahl.gesamt}`);
  console.log(`Davon fuer diesen Lauf ausgewaehlt: ${nachzuholen.length} (Obergrenze --max=${args.max})`);
  const nachZustand = kandidaten.reduce((m, k) => { m[k.zustand] = (m[k.zustand] || 0) + 1; return m; }, {});
  for (const [z, n] of Object.entries(nachZustand)) console.log(`  ${z}: ${n}`);

  // HARTER RIEGEL fuer den gezielten Lauf: im Pool darf ausschliesslich liegen,
  // was ausdruecklich angefordert wurde. Nach der Auswahl oben kann das nicht mehr
  // eintreten — genau deshalb steht die Pruefung hier: sie faengt jede kuenftige
  // Umstellung ab, die die Reihenfolge erneut verdreht.
  const fremd = [...auswahl.fremd, ...(args.ids ? zuSchreibendeIds.filter((id) => !args.ids.includes(id)) : [])];
  if (fremd.length) {
    console.error(`\nABBRUCH: ${fremd.length} nicht angeforderte Dokument(e) waeren im Kandidatenpool gelandet.`);
    console.error(`Betroffen: ${[...new Set(fremd)].slice(0, 20).join(", ")}`);
    console.error("Ein gezielter Lauf darf ausschliesslich die genannten Kennungen verarbeiten.");
    process.exit(4);
  }

  // Die VORSCHAU nennt jede Kennung, die geschrieben wuerde — nicht nur ihre
  // Anzahl. Ohne diese Liste war "21 Kandidaten" nicht gegen "welche 21?" pruefbar.
  if (zuSchreibendeIds.length) {
    console.log(`\nDiese ${zuSchreibendeIds.length} Rohdokument(e) wuerden verarbeitet:`);
    for (const k of kandidaten) {
      if (!docById.has(k.id)) continue;
      console.log(`  ${k.id}  ${k.zustand}${k.vorgangId ? `  -> ${k.vorgangId}` : ""}`);
    }
  }

  if (auswahl.ueberMax || nachzuholen.length > args.max) {
    console.error(`\nABBRUCH: ${kandidaten.length} Kandidaten ueberschreiten die Obergrenze von ${args.max}.`);
    console.error("Das ist ein Befund, kein Auftrag. Zuerst die Ursache klaeren (Messung oben), dann");
    console.error("bewusst mit einem hoeheren --max und einem engeren --tage-Fenster wiederholen.");
    process.exit(4);
  }

  if (!args.ausfuehren) {
    console.log("\nVORSCHAU — es wurde NICHTS geschrieben und KEIN KI-Aufruf ausgeloest.");
    console.log("Zum tatsaechlichen Nachholen zusaetzlich: --ausfuehren und HELMUT_NACHHOLEN_BESTAETIGT=ja");
    if (args.json) console.log(JSON.stringify({ ...ausgabe, kandidatenGesamt: auswahl.gesamt, ausgewaehlt: zuSchreibendeIds, kandidaten: kandidaten.slice(0, 200) }, null, 2));
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

  // FAIL-CLOSED-GATE vor dem ersten fachlichen und dem ersten KI-Schreibzugriff
  // (Hotfix B4-3, Phase 6). Ohne HELMUT_STORAGE_BACKEND=supabase gingen die
  // Fachtabellen nach Production, waehrend LLM-Budget, LLM-Nutzungslog und
  // Lauftelemetrie lokal landen — der Kostendeckel startet dann bei 0.
  // Die Vorschau oben ist davon bewusst NICHT betroffen.
  const { erzwingeSchreibgate } = require(path.join(root, "lib/helmut/production-schreibgate.js"));
  const gate = erzwingeSchreibgate(process.env, { zweck: "Nachholen der Vorgangsbildung" });
  console.log(`\nSchreibgate: Fachtabellen und Betriebsdaten beide auf Production (Backend ${gate.backend}).`);

  // Ausfuehrung ueber den NORMALEN Verarbeitungsweg (kein Sonderpfad, keine
  // zweite Vorgangslogik): dieselbe Funktion, die auch der Crawl-Cron ruft.
  const { runUnderstandingShadow } = require(path.join(root, "lib/helmut/understanding.js"));
  const runId = `nachhol-${new Date(now).toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  console.log(`\nAUSFUEHRUNG (runId ${runId}) — ${nachzuholen.length} Rohdokumente durch die normale Vorgangsbildung.`);
  const start = Date.now();

  // W-2: Startbeleg (status=running, nur relational, No-Op ohne Freigabe) —
  // ein hart sterbender Lauf hinterlaesst damit eine sichtbare Spur statt
  // spurlos zu verschwinden. Ein Fehler hier bricht die fachliche Arbeit nicht
  // ab, wird aber benannt (der Abschluss-Upsert heilt die Zeile ohnehin).
  const startBeleg = await storage.recordProcessRunStart({
    process: "understanding-nachhol", runId, mode: "manuell", location: "skript",
    startedAt: new Date(start).toISOString(), zielmenge: nachzuholen.length
  });
  if (startBeleg && startBeleg.ok === false) {
    console.error("WARNUNG: Startbeleg der Lauftelemetrie nicht gespeichert (Details oben) — der Lauf faehrt fort.");
  }

  const ergebnis = await runUnderstandingShadow(nachzuholen, { runId });
  const dauerMs = Date.now() - start;

  // W-2: KEIN `.catch(() => {})` mehr — das Ergebnis des Telemetrie-Schreibens
  // ist Teil des Abschlussstatus dieses Werkzeugs.
  const zaehlung = zaehleErgebnisse(ergebnis && ergebnis.counts);
  const laufStatus = leiteLaufstatusAb(ergebnis, zaehlung);
  const telemetrie = await storage.recordProcessRun({
    process: "understanding-nachhol", runId, mode: "manuell", location: "skript",
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: dauerMs,
    processed: ergebnis && ergebnis.processed, deferred: ergebnis && ergebnis.deferred,
    reason: ergebnis && ergebnis.reason, status: laufStatus,
    zielmenge: nachzuholen.length,
    gespeichert: zaehlung.gespeichert, uebersprungen: zaehlung.uebersprungen,
    fehlgeschlagen: zaehlung.fehlgeschlagen,
    telemetrie: ergebnis && ergebnis.telemetrie
  });

  console.log(`\nErgebnis nach ${Math.round(dauerMs / 1000)} s (Laufstatus ${laufStatus}):`);
  console.log(JSON.stringify({
    cluster: ergebnis && ergebnis.clusters, verarbeitet: ergebnis && ergebnis.processed,
    zurueckgestellt: ergebnis && ergebnis.deferred, vorgemerkt: ergebnis && ergebnis.vorgemerkt,
    ergebnisse: ergebnis && ergebnis.counts, aufloesungen: ergebnis && ergebnis.telemetrie && ergebnis.telemetrie.aufloesungen,
    grund: ergebnis && ergebnis.reason,
    lauftelemetrie: {
      gespeichert: telemetrie.ok, vollstaendig: telemetrie.vollstaendig,
      backends: telemetrie.gespeichert, fehler: telemetrie.fehler
    }
  }, null, 2));
  console.log("\nErgebnispruefung: denselben Aufruf ohne --vorschau erneut starten — die Zahl der");
  console.log("Dokumente ohne gueltigen Endzustand muss gesunken sein.");

  if (!telemetrie.ok) {
    console.error("\nTELEMETRIEFEHLER: die fachliche Verarbeitung oben ist gelaufen, ihr Lauf wurde");
    console.error("aber NICHT in der Lauftelemetrie (processRuns) gespeichert. Dieser Lauf ist damit");
    console.error(`fuer Betrieb/Admin unsichtbar, bis er nachgetragen ist (runId ${runId}).`);
    console.error("Der Lauf selbst wird NICHT wiederholt — ein zweiter Aufruf waere idempotent, kostet");
    console.error("aber KI-Budget. Erst den Telemetrie-Speicher pruefen, dann ggf. nur den Eintrag nachtragen.");
    return process.exit(7);
  }
  if (!telemetrie.vollstaendig) {
    console.error("\nHINWEIS: der kanonische Telemetriepfad hat gespeichert, der Spiegelpfad nicht");
    console.error("(Details im JSON oben unter lauftelemetrie.fehler).");
  }
  return process.exit(0);
}

// --- W-2: Abschlussbewertung (pure Logik, einzeln testbar) -------------------
// Zaehlt die Ergebnisklassen von runUnderstandingShadow in die drei
// Pflichtzaehler des Laufberichts. Unbekannte Klassen zaehlen als
// "uebersprungen" — nie als Erfolg.
function zaehleErgebnisse(counts = {}) {
  let gespeichert = 0, fehlgeschlagen = 0, uebersprungen = 0;
  for (const [klasse, wert] of Object.entries(counts && typeof counts === "object" ? counts : {})) {
    const n = Number(wert) || 0;
    if (klasse === "saved" || klasse === "updated" || klasse === "merged") gespeichert += n;
    else if (klasse === "skipped-error" || klasse === "cluster-error" || klasse === "skipped-invalid") fehlgeschlagen += n;
    else uebersprungen += n;
  }
  return { gespeichert, fehlgeschlagen, uebersprungen };
}

// Leitet den kanonischen Laufstatus ab (running/success/partial/failed/blocked/
// rolled_back — hier die vier, die ein Nachhollauf annehmen kann). Ein Lauf, der
// gar nicht arbeiten durfte (Budget/Lock/Flag), ist "blocked" — kein Erfolg.
function leiteLaufstatusAb(ergebnis, zaehlung) {
  if (ergebnis && ergebnis.skipped) return "blocked";
  const z = zaehlung || zaehleErgebnisse(ergebnis && ergebnis.counts);
  if (z.fehlgeschlagen > 0 && z.gespeichert > 0) return "partial";
  if (z.fehlgeschlagen > 0) return "failed";
  return "success";
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fehler:", error && error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, waehleNachholKandidaten, zaehleErgebnisse, leiteLaufstatusAb, MAX_STANDARD, TAGE_STANDARD };
