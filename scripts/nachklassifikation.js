"use strict";

// Nachklassifikation des Wissensobjekt-Altbestands (Sprint 21, OP-24).
// =============================================================================
// EIN Werkzeug, zwei Betriebsarten:
//   * VORSCHAU   (Standard) — liest, plant, protokolliert. Schreibt NICHTS.
//   * SCHREIBEN  (`--ausfuehren`) — schreibt genau die im Vorschauprotokoll
//                als "sicher-korrigierbar" ausgewiesenen Aenderungen.
//
// SICHERHEITSREGELN (nicht verhandelbar):
//   1. VORSCHAU IST DER STANDARD. Ohne `--ausfuehren` gibt es keinen einzigen
//      Schreibpfad — die Schreibfunktion wird nicht einmal aufgeloest.
//   2. `--ausfuehren` verlangt ZUSAETZLICH HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja.
//      Ein Tippfehler kann keinen Production-Schreiblauf ausloesen.
//   3. Vor dem ersten Schreibzugriff laeuft das Production-Schreibgate
//      (lib/helmut/production-schreibgate.js) fail-closed.
//   4. HARTE MENGENGRENZE (`--max`, Standard 200). Liegt mehr an, bricht das
//      Werkzeug AB statt zu arbeiten.
//   5. KEIN KI-AUFRUF. Dieses Werkzeug bindet weder ai.js noch das LLM-Budget
//      ein — es kann strukturell keine KI-Kosten erzeugen (Kosten: 0,00 USD).
//   6. Geschrieben wird ausschliesslich ueber `saveKnowledgeObjectEnrichment`,
//      also nur in die Klassifikationsspalten von `knowledge_objects`. Quellen,
//      Pakete, Abrufwege, Crons, Locks, Mandantenprofile, Matchinggewichte und
//      Scoring werden nicht beruehrt.
//   7. IDEMPOTENT. Ein zweiter Lauf plant fuer bereits korrigierte Objekte
//      nichts mehr — das ist zugleich der Wiederaufsetzpunkt nach einem Abbruch.
//   8. KEINE PARALLELE VERARBEITUNG DESSELBEN OBJEKTS: unmittelbar vor jedem
//      Schreibvorgang wird `updated_at` erneut gelesen. Hat die regulaere
//      Verarbeitung das Objekt zwischenzeitlich angefasst, wird es ausgelassen.
//   9. ABBRUCH BEI FEHLERQUOTE (`--fehlerquote`, Standard 10 %).
//  10. Das Protokoll ist DSGVO-maskiert (keine Prosafelder, Personennamen
//      ersetzt, zentrale Redaction auf jeder Zeichenkette).
//
// SECRETS ausschliesslich aus process.env (CLAUDE.md §4.9).
//
// Aufrufe:
//   node scripts/nachklassifikation.js                                # Vorschau, alles
//   node scripts/nachklassifikation.js --max=50 --json
//   node scripts/nachklassifikation.js --ids=ko-1,ko-2
//   node scripts/nachklassifikation.js --von=2026-07-01 --bis=2026-07-20
//   node scripts/nachklassifikation.js --mandant=<user-id>
//   HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja node scripts/nachklassifikation.js --ausfuehren --max=25
//
// Optionen:
//   --max=N          Obergrenze der zu PLANENDEN Objekte (Standard 200) — darueber Abbruch
//   --batch=N        Objekte je Schreibblock (Standard 25)
//   --ids=a,b        NUR diese Wissensobjekt-Kennungen (wirkt VOR jeder Mengenkappung)
//   --von=YYYY-MM-DD Zeitraum: nur Objekte ab diesem Erstelldatum
//   --bis=YYYY-MM-DD Zeitraum: nur Objekte bis zu diesem Erstelldatum
//   --mandant=<id>   nur Objekte, die diesem Mandanten ueber `decisions` zugeordnet sind
//   --klassen=a,b    NUR diese Fehlerklassen schreiben (Positivliste). Der technische
//                    Unterbau der klassenweisen Freigabe — ein Lauf kann dann strukturell
//                    nichts anderes veraendern. Unbekannte Klasse = Abbruch.
//   --fehlerquote=N  Abbruchschwelle in Prozent (Standard 10)
//   --ausfuehren     Schreibmodus (zusaetzlich HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja)
//   --json           Maschinenlesbare Ausgabe
//   --alle           Vollstaendiges Protokoll statt der ersten 20 Beispielzeilen
//
// Exit-Codes:
//   0  Erfolg (auch der erfolgreiche Leerlauf)
//   1  unerwarteter Fehler
//   2  Argumentfehler
//   3  Konfiguration unvollstaendig (v3-Store nicht bereit)
//   4  Mengen-Riegel hat abgebrochen
//   5  HELMUT_NACHKLASSIFIKATION_BESTAETIGT fehlt
//   6  Production-Schreibgate hat abgelehnt
//   7  Fehlerquote ueberschritten -> Lauf abgebrochen
//   8  technischer Lesefehler (nie als "nichts zu tun" gedeutet)

const path = require("path");
const root = path.join(__dirname, "..");
const {
  planeNachklassifikation, fasseZusammen, maskiereProtokoll, KLASSEN
} = require(path.join(root, "lib/helmut/quellenarchitektur/nachklassifikation.js"));
const { erzwingeSchreibgate } = require(path.join(root, "lib/helmut/production-schreibgate.js"));

const MAX_STANDARD = 200;
const BATCH_STANDARD = 25;
const FEHLERQUOTE_STANDARD = 10;
const BESTAETIGUNG = "HELMUT_NACHKLASSIFIKATION_BESTAETIGT";

function parseArgs(argv) {
  const a = {
    max: MAX_STANDARD, batch: BATCH_STANDARD, fehlerquote: FEHLERQUOTE_STANDARD,
    ids: null, von: null, bis: null, mandant: null,
    ausfuehren: false, json: false, alle: false, limit: 4000, klassen: null
  };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    const [, name, wert] = m;
    if (name === "max") a.max = zahl(wert, MAX_STANDARD, 1);
    else if (name === "batch") a.batch = zahl(wert, BATCH_STANDARD, 1);
    else if (name === "limit") a.limit = zahl(wert, 4000, 100);
    else if (name === "fehlerquote") {
      const n = Number(wert);
      if (!Number.isFinite(n) || n < 0 || n > 100) { console.error("--fehlerquote erwartet 0..100."); process.exit(2); }
      a.fehlerquote = n;
    } else if (name === "ids") {
      // Wie beim Nachholwerkzeug: `--ids=` (leer) sieht aus wie "kein Filter" und
      // wuerde einen gezielten Lauf still zu einem Massenlauf machen -> Abbruch.
      const roh = String(wert || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!roh.length) {
        console.error("--ids wurde ohne verwertbare Kennung angegeben. Das waere ein Massenlauf");
        console.error("statt eines gezielten Laufs — Abbruch.");
        process.exit(2);
      }
      a.ids = [...new Set(roh)];
    } else if (name === "klassen") {
      // Positivliste der freigabefaehigen Fehlerklassen. Eine unbekannte Klasse
      // ist ein Abbruch — ein Tippfehler darf nicht still zu "alle Klassen" werden.
      const roh = String(wert || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!roh.length) { console.error("--klassen wurde ohne Klasse angegeben — Abbruch."); process.exit(2); }
      const unbekannt = roh.filter((k) => !KLASSEN[k]);
      if (unbekannt.length) {
        console.error(`--klassen kennt diese Klassen nicht: ${unbekannt.join(", ")}`);
        console.error(`Bekannt sind: ${Object.keys(KLASSEN).join(", ")}`);
        process.exit(2);
      }
      a.klassen = [...new Set(roh)];
    } else if (name === "von") a.von = datum(wert, "--von");
    else if (name === "bis") a.bis = datum(wert, "--bis");
    else if (name === "mandant") {
      const v = String(wert || "").trim();
      if (!v) { console.error("--mandant erwartet eine Mandantenkennung."); process.exit(2); }
      a.mandant = v;
    } else if (name === "ausfuehren") a.ausfuehren = true;
    else if (name === "json") a.json = true;
    else if (name === "alle") a.alle = true;
    else { console.error(`Unbekanntes Argument: --${name}`); process.exit(2); }
  }
  return a;
}

function zahl(wert, standard, min) {
  const n = Number(wert);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : standard;
}

function datum(wert, name) {
  const s = String(wert || "").trim();
  const t = Date.parse(s);
  if (!s || !Number.isFinite(t)) { console.error(`${name} erwartet ein Datum (YYYY-MM-DD).`); process.exit(2); }
  return new Date(t).toISOString();
}

// --- Kandidatenauswahl (rein, deshalb einzeln testbar) ----------------------
// DIE REIHENFOLGE IST SICHERHEITSRELEVANT (Lehre aus B4-3): `ids` wirkt auf die
// VOLLSTAENDIGE Liste, VOR jeder Mengenbegrenzung. Sonst verarbeitet ein
// "gezielter" Lauf still eine andere Menge als angefordert.
// NUR VERSTANDENE VORGAENGE. Belegter Befund aus der Production-Vorschau vom
// 2026-07-28: alle 489 Wissensobjekte ohne `decision_level` sind `pending` (481)
// oder `failed` (8) — sie wurden nie verstanden und tragen ausser einer
// Schlagzeile keinen Inhalt.
//
// Warum das ein HARTER Ausschluss ist und keine Feinheit: die politische Ebene
// ist seit Sprint 19 MONOTON. Wuerde dieser Lauf aus einer blossen Schlagzeile
// eine Ebene ableiten und speichern, waere das ab sofort der „ermittelte" Wert —
// die spaetere, echte Analyse duerfte ihn nur noch mit einer KI-Aussage
// korrigieren. Eine Vermutung wuerde damit zum Gedaechtnis. Fail closed:
// unverstandene Vorgaenge bleiben unangetastet.
const VERWERTBARER_ZUSTAND = "complete";

function waehleKandidaten(objekte, { ids = null, von = null, bis = null, mandantIds = null, max = MAX_STANDARD } = {}) {
  const alle = (Array.isArray(objekte) ? objekte : []).filter(Boolean);
  const unverstanden = alle.filter((k) => k.understanding_status !== VERWERTBARER_ZUSTAND);
  let liste = alle.filter((k) => k.understanding_status === VERWERTBARER_ZUSTAND);

  if (ids) {
    const gesucht = new Set(ids);
    const gefunden = liste.filter((k) => gesucht.has(k.id) || gesucht.has(k.vorgang_id));
    // Eine ausdruecklich genannte Kennung, die nur wegen des Zustandsfilters
    // fehlt, wird EIGENS benannt — sonst saehe sie aus wie "gibt es nicht".
    const nurUnverstanden = unverstanden
      .filter((k) => gesucht.has(k.id) || gesucht.has(k.vorgang_id))
      .map((k) => k.id);
    const fehlend = ids.filter((id) => !alle.some((k) => k.id === id || k.vorgang_id === id));
    return {
      kandidaten: gefunden, fehlend, ueberMax: false, gesamt: liste.length,
      unverstandenAusgeschlossen: unverstanden.length, unverstandenGenannt: nurUnverstanden
    };
  }

  if (mandantIds) {
    const erlaubt = new Set(mandantIds);
    liste = liste.filter((k) => erlaubt.has(k.id));
  }
  if (von) liste = liste.filter((k) => k.created_at && k.created_at >= von);
  if (bis) liste = liste.filter((k) => k.created_at && k.created_at <= bis);

  // Deterministische Reihenfolge: aelteste zuerst. Ein abgebrochener Lauf setzt
  // damit an derselben Stelle wieder auf.
  liste = [...liste].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))
    || String(a.id || "").localeCompare(String(b.id || "")));

  return {
    kandidaten: liste, fehlend: [], ueberMax: liste.length > max, gesamt: liste.length,
    unverstandenAusgeschlossen: unverstanden.length, unverstandenGenannt: []
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  if (args.ausfuehren) {
    if (String(process.env[BESTAETIGUNG] || "").trim().toLowerCase() !== "ja") {
      console.error(`\nABBRUCH: --ausfuehren verlangt zusaetzlich ${BESTAETIGUNG}=ja.`);
      console.error("Die Vorschau laeuft ohne diese Variable und schreibt garantiert nichts.\n");
      process.exit(5);
    }
    erzwingeSchreibgate(process.env, { zweck: "Nachklassifikation (Sprint 21)", exitCode: 6 });
  }

  // --- Lesen ---------------------------------------------------------------
  // SEITENWEISE lesen. Ein einzelner PostgREST-Aufruf liefert hoechstens 1 000
  // Zeilen — bei 1 193 Wissensobjekten waere die Vorschau eine stille Teilmenge
  // und damit eine falsche Vorher/Nachher-Messung (Nebenbefund W-1).
  let objekte = [];
  try {
    objekte = await storage.listKnowledgeObjectsSeitenweise({ limit: args.limit });
    if (!Array.isArray(objekte)) throw new Error("listKnowledgeObjectsSeitenweise lieferte kein Array");
  } catch (error) {
    // NIE als "nichts zu tun" deuten (Werkzeugbefund W-1).
    console.error(`\nABBRUCH: Lesefehler — ${error.message}`);
    console.error("Es wurde nichts geplant und nichts geschrieben.\n");
    process.exit(8);
  }
  if (!objekte.length) {
    console.error("\nABBRUCH: keine Wissensobjekte lesbar. Ist HELMUT_V3_STORE/SUPABASE_URL gesetzt?\n");
    process.exit(3);
  }

  // Mandantenbegrenzung. `knowledge_objects` traegt bewusst KEIN `user_id`
  // (ein Vorgang wird global genau einmal verstanden). Die Zuordnung zu einem
  // Mandanten existiert relational ueber `decisions` — genau die wird hier
  // benutzt, mit Pflicht-Mandantenfilter. FAIL CLOSED: liefert der Mandant
  // keine Zuordnung, bricht der Lauf ab, statt still auf ALLE Objekte
  // zurueckzufallen.
  let mandantIds = null;
  if (args.mandant) {
    const decisions = await storage.listDecisions({ userId: args.mandant, limit: 5000 });
    mandantIds = [...new Set((decisions || []).map((d) => d && d.knowledge_object_id).filter(Boolean))];
    if (!mandantIds.length) {
      console.error(`\nABBRUCH: fuer den Mandanten wurden 0 zugeordnete Wissensobjekte gefunden.`);
      console.error("Ein Lauf ohne wirksame Mandantenbegrenzung waere ein Massenlauf — Abbruch.\n");
      process.exit(4);
    }
  }

  const auswahl = waehleKandidaten(objekte, {
    ids: args.ids, von: args.von, bis: args.bis, mandantIds, max: args.max
  });

  if (auswahl.ueberMax) {
    console.error(`\nABBRUCH: ${auswahl.kandidaten.length} Objekte im Filter, Grenze ist --max=${args.max}.`);
    console.error("Ein unerwartet grosser Bestand ist ein Befund, kein Auftrag fuer einen Massenlauf.");
    console.error("Entweder --max bewusst erhoehen oder den Zeitraum/die Kennungen einschraenken.\n");
    process.exit(4);
  }

  // --- Planen (rein, ohne jeden Schreibzugriff) -----------------------------
  const jetzt = new Date().toISOString();
  const plaene = auswahl.kandidaten.map((ko) =>
    planeNachklassifikation(ko, { jetzt, erlaubteKlassen: args.klassen }));
  const zuSchreiben = plaene.filter((p) => !p.unveraendert);
  const zusammenfassung = fasseZusammen(plaene);

  const bericht = {
    modus: args.ausfuehren ? "schreiben" : "vorschau",
    stand: jetzt,
    filter: {
      ids: args.ids, von: args.von, bis: args.bis, mandant: args.mandant ? "gesetzt" : null,
      klassen: args.klassen, max: args.max, batch: args.batch, fehlerquoteProzent: args.fehlerquote
    },
    bestand: {
      gelesen: objekte.length, imFilter: auswahl.gesamt, geplant: plaene.length,
      // Ehrlichkeit statt falschem Gruen: wenn die Leseobergrenze exakt erreicht
      // wurde, kann der Bestand groesser sein als das, was hier gemessen ist.
      leseobergrenze: args.limit,
      moeglicherweiseUnvollstaendig: objekte.length >= args.limit,
      // Nie stillschweigend: wie viele Objekte der Zustandsfilter ausgeschlossen hat.
      unverstandenAusgeschlossen: auswahl.unverstandenAusgeschlossen,
      unverstandenGenannt: auswahl.unverstandenGenannt
    },
    nichtGefunden: auswahl.fehlend,
    zusammenfassung,
    erwarteteBatches: Math.ceil(zuSchreiben.length / args.batch) || 0,
    protokoll: (args.alle ? plaene : plaene.slice(0, 20)).map((p) => maskiereProtokoll(p, process.env)),
    protokollVollstaendig: args.alle || plaene.length <= 20
  };

  // --- Vorschau ------------------------------------------------------------
  if (!args.ausfuehren) {
    ausgabe(bericht, args);
    process.exit(0);
  }

  // --- Schreiben -----------------------------------------------------------
  let geschrieben = 0;
  let fehler = 0;
  let kollisionen = 0;
  let verarbeitet = 0;
  let abgebrochen = null;

  for (let i = 0; i < zuSchreiben.length; i += args.batch) {
    const block = zuSchreiben.slice(i, i + args.batch);
    for (const plan of block) {
      verarbeitet += 1;
      try {
        // Kein paralleles Bearbeiten desselben Objekts: hat die regulaere
        // Verarbeitung das Objekt seit dem Planen angefasst, wird ausgelassen.
        const aktuell = await storage.getKnowledgeObjectById(plan.id);
        const vorher = auswahl.kandidaten.find((k) => k.id === plan.id);
        if (!aktuell || (vorher && aktuell.updated_at !== vorher.updated_at)) {
          kollisionen += 1;
          continue;
        }
        await storage.saveKnowledgeObjectEnrichment(plan.id, plan.patch);
        geschrieben += 1;
      } catch (error) {
        // Ein Fehler an EINEM Objekt darf kein anderes veraendern: die Schleife
        // faehrt fort, der Fehler wird gezaehlt, nichts wird zurueckgerollt
        // (es gab an diesem Objekt keinen Teilschreibvorgang — ein PATCH ist atomar).
        fehler += 1;
      }
      const quote = (fehler / verarbeitet) * 100;
      if (verarbeitet >= 5 && quote > args.fehlerquote) {
        abgebrochen = `Fehlerquote ${quote.toFixed(1)} % ueber Schwelle ${args.fehlerquote} %`;
        break;
      }
    }
    if (abgebrochen) break;
  }

  bericht.ergebnis = {
    geplant: zuSchreiben.length, verarbeitet, geschrieben, fehler, kollisionen,
    abgebrochen, unveraendertGelassen: plaene.length - zuSchreiben.length
  };
  ausgabe(bericht, args);
  process.exit(abgebrochen ? 7 : 0);
}

function ausgabe(bericht, args) {
  if (args.json) { console.log(JSON.stringify(bericht, null, 2)); return; }
  const z = bericht.zusammenfassung;
  console.log("");
  console.log(`Nachklassifikation — Modus: ${bericht.modus.toUpperCase()}${bericht.modus === "vorschau" ? " (es wird NICHTS geschrieben)" : ""}`);
  console.log(`Stand: ${bericht.stand}`);
  console.log("");
  console.log(`Bestand gelesen:            ${bericht.bestand.gelesen}`);
  console.log(`davon im Filter:            ${bericht.bestand.imFilter}`);
  console.log(`geplant:                    ${bericht.bestand.geplant}`);
  console.log(`unverstanden, ausgeschlossen: ${bericht.bestand.unverstandenAusgeschlossen}   (pending/failed — nie angetastet)`);
  if (bericht.filter.klassen) console.log(`Freigegebene Klassen:        ${bericht.filter.klassen.join(", ")}`);
  console.log("");
  console.log(`unveraendert:               ${z.unveraendert}`);
  console.log(`Schreibvorgaenge erwartet:  ${z.schreibvorgaenge}   (Batches: ${bericht.erwarteteBatches})`);
  console.log(`Geografien entfernt:        ${z.geografienEntfernt}`);
  console.log(`Geografien ergaenzt:        ${z.geografienErgaenzt}`);
  console.log(`Geografie-Beleg gestaerkt:  ${z.geografienBelegGestaerkt}`);
  console.log(`politische Ebenen:          ${z.ebenenKorrigiert}`);
  console.log(`Entitaeten veraendert:      ${z.entitaetenVeraendert}`);
  console.log(`manuelle Prueffaelle:       ${z.manuell}`);
  console.log(`Objekte mit KI-Bedarf:      ${z.kiNoetig}`);
  console.log(`erwartete KI-Aufrufe:       ${z.erwarteteKiAufrufe}`);
  console.log(`erwartete Kosten:           ${z.erwarteteKostenUsd.toFixed(2)} USD`);
  console.log("");
  console.log("Fehlerklassen:");
  for (const [klasse, anzahl] of Object.entries(z.jeKlasse).sort((a, b) => b[1] - a[1])) {
    const k = KLASSEN[klasse] || {};
    console.log(`  ${String(anzahl).padStart(5)}  ${klasse}  [${k.einstufung || "?"}]`);
  }
  if (bericht.nichtGefunden && bericht.nichtGefunden.length) {
    console.log("");
    console.log(`NICHT GEFUNDEN (${bericht.nichtGefunden.length}): ${bericht.nichtGefunden.join(", ")}`);
  }
  console.log("");
  console.log(`Protokoll (${bericht.protokollVollstaendig ? "vollstaendig" : "erste 20, --alle fuer alles"}, DSGVO-maskiert):`);
  for (const p of bericht.protokoll) {
    if (p.unveraendert && !p.manuellePruefung) continue;
    console.log(`  ${p.id}  ${p.vorgang_id}`);
    for (const a of p.aenderungen) {
      if (!a.aenderungSchreibt && !a.manuellePruefungEmpfohlen) continue;
      console.log(`      ${a.feld}: ${kurz(a.alterWert)} -> ${kurz(a.neuerWert)}`);
      console.log(`         Grund:    ${a.grund}`);
      console.log(`         Klasse:   ${a.klasse} [${a.einstufung}]`);
      console.log(`         Herkunft: ${a.herkunftVorher || "-"} (${a.vertrauenVorher == null ? "-" : a.vertrauenVorher})`
        + ` -> ${a.herkunftNachher || "-"} (${a.vertrauenNachher == null ? "-" : a.vertrauenNachher})`);
      console.log(`         KI noetig: ${a.kiNoetig ? "ja" : "nein"}   automatisch sicher: ${a.automatischSicher ? "ja" : "nein"}`
        + `   manuelle Pruefung: ${a.manuellePruefungEmpfohlen ? "empfohlen" : "nein"}`);
    }
  }
  if (bericht.ergebnis) {
    console.log("");
    console.log("Ergebnis des Schreiblaufs:");
    console.log(`  geschrieben:  ${bericht.ergebnis.geschrieben}`);
    console.log(`  Fehler:       ${bericht.ergebnis.fehler}`);
    console.log(`  Kollisionen:  ${bericht.ergebnis.kollisionen} (Objekt wurde zwischenzeitlich regulaer veraendert)`);
    if (bericht.ergebnis.abgebrochen) console.log(`  ABGEBROCHEN:  ${bericht.ergebnis.abgebrochen}`);
  }
  console.log("");
}

function kurz(wert) {
  if (wert == null) return "(leer)";
  if (typeof wert === "string") return wert;
  return JSON.stringify(wert);
}

module.exports = { parseArgs, waehleKandidaten, MAX_STANDARD, BATCH_STANDARD, BESTAETIGUNG };

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nUnerwarteter Fehler: ${error && error.message}\n`);
    process.exit(1);
  });
}
