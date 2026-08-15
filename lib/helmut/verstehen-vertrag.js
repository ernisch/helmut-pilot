"use strict";

// Helmut — DER ATOMARE VERSTEHENSVERTRAG (OP-30, Sprint „Verstehensparallelität und CAS").
// =============================================================================================
// WAS DAS IST: die Anwendungsseite des Datenbankvertrags aus Migration
// `20260814180000_verstehen_cas.sql`. Ein dünner Adapter — er entscheidet NICHTS, er
// übersetzt nur zwischen dem Fachkern (`understanding.js`) und den Datenbankfunktionen.
// Die Zusagen selbst liegen in der Datenbank, weil nur dort mehrere Prozesse,
// Serverless-Invocations und Lambda-Verbraucher gemeinsam entscheiden können.
//
// WARUM ES IHN GIBT: bis zu diesem Sprint hielt `understanding.js` die Vormerkungen
// gescheiterter Aktualisierungen in EINER Karte und schrieb sie mit Lesen → Ändern →
// Schreiben zurück. Zwei gleichzeitige Verstehensläufe hätten sich gegenseitig
// überschrieben (CLAUDE.md §4 Regel 10), deshalb war `verstehen` auf Parallelität 1
// festgenagelt — der letzte globale Engpass der Zielarchitektur.
//
// DIE SECHS ZUSAGEN, IN DER REIHENFOLGE IHRES AUFTRETENS:
//   1. `reserviere`      — genau ein berechtigter Besitzer je Vorgang; verschiedene
//                          Vorgänge blockieren sich NIE gegenseitig.
//   2. `modellstart`     — vermerkt VOR dem externen Aufruf, dass er stattfindet. Damit
//                          ist ein Absturz danach als „Ausgang unbekannt" erkennbar.
//   3. `schreibrecht`    — frühe Absage, wenn Lease oder Besitz schon verloren sind.
//   4. `speichere`       — DIE harte Zusage: EINE Datenbankfunktion prüft Besitzer,
//                          aktuelle Reservierung, Fencing-Wert, Zustand und Lease
//                          gemeinsam unter Row-Lock, schreibt das Wissensobjekt und
//                          schließt den Vorgang in DERSELBEN Transaktion ab.
//   5. `freigabe`        — nur VOR dem Modellstart: sicher wiederholbar.
//      `freigabeOhneAufruf` — derselbe Ausgang MIT Beleg, dass nichts abgesendet wurde.
//   6. `ausgangUnbekannt`— nach dem Modellstart ohne belegtes Ergebnis: sichtbar
//                          blockiert, nie ein automatischer zweiter Aufruf.
//
// FAIL CLOSED, AUSNAHMSLOS: ist der Vertrag nicht prüfbar (Migration fehlt, DB-Fehler,
// keine Supabase-Verbindung), wird NICHT verstanden, NICHT gespeichert und NICHT
// aufgelöst. Der Cluster wird ehrlich zurückgestellt und bleibt Nachholkandidat.
//
// DEFAULT INERT: ohne `HELMUT_VERSTEHEN_CAS` liefert `baueVertrag()` `null`, und jeder
// Aufrufer verhält sich byte-identisch zu vorher (Karten-Store + Vorgangswache).

const crypto = require("crypto");

// ── Flag und Parallelität ────────────────────────────────────────────────────────────────
function flagAn(wert) {
  const roh = String(wert == null ? "" : wert).trim().toLowerCase();
  return roh === "1" || roh === "true" || roh === "on" || roh === "yes" || roh === "an";
}

function casAktiv(env = process.env) {
  return flagAn(env && env.HELMUT_VERSTEHEN_CAS);
}

// Obergrenze der Verstehensparallelität INNERHALB eines Laufs. Standard 1 = byte-identisch
// serielles Verhalten wie vor diesem Sprint.
//
// HARTER RIEGEL: mehr als 1 ist nur mit dem CAS-Vertrag sicher. Ohne ihn schreibt der
// Karten-Store weiterhin Lesen → Ändern → Schreiben, und zwei gleichzeitige Cluster
// könnten die Vormerkung des jeweils anderen verlieren. Deshalb wird ohne Flag auf 1
// GEKLEMMT statt der Konfiguration zu folgen — Konfiguration darf eine Sicherheitszusage
// nie aushebeln.
const VERSTEHEN_PARALLELITAET_MAX = 8;

function verstehenParallelitaet(env = process.env) {
  const roh = String((env && env.HELMUT_VERSTEHEN_PARALLELITAET) ?? "").trim();
  const gewuenscht = Number(roh);
  const wert = roh !== "" && Number.isFinite(gewuenscht) && gewuenscht > 0 ? Math.floor(gewuenscht) : 1;
  const gedeckelt = Math.min(Math.max(1, wert), VERSTEHEN_PARALLELITAET_MAX);
  if (gedeckelt > 1 && !casAktiv(env)) return 1;
  return gedeckelt;
}

// ── Eingabehash: die Identität EINER Verstehenseingabe ───────────────────────────────────
// Er beantwortet die Frage „ist das dieselbe Arbeit wie beim letzten Mal?". Bewusst nur
// aus stabilen Kennungen gebildet — keine Titel, keine Volltexte (DSGVO-Datensparsamkeit,
// und ein Titelwechsel beim selben Dokument darf keine neue teure Analyse auslösen).
//   * `modus`      unterscheidet Erstverstehen von Aktualisierung (beide sind je ein
//                  eigener Modellaufruf und damit eine eigene Eingabe).
//   * `dokumente`  SORTIERTE Dokumentkennungen — die Reihenfolge im Cluster ist nicht
//                  stabil, die Menge schon.
//   * `koVersion`  hält zwei aufeinanderfolgende Aktualisierungen derselben Dokumentmenge
//                  auseinander (Fortschreibung ist eine andere Eingabe als der Bestand).
function eingabeHash({ vorgangId, dokumente = [], modus = "erst", koVersion = null } = {}) {
  const kennungen = (Array.isArray(dokumente) ? dokumente : [])
    .map((d) => (d && (d.id || d.document_id)) || "")
    .map((id) => String(id))
    .filter(Boolean)
    .sort();
  const roh = JSON.stringify([String(vorgangId || ""), modus, koVersion == null ? null : Number(koVersion), kennungen]);
  return crypto.createHash("sha256").update(roh).digest("hex").slice(0, 40);
}

// Ergebnishash: NUR ein Beleg dafür, WELCHE Fassung geschrieben wurde (Diagnose,
// Idempotenzvergleich). Kein Inhalt — nur Kennung, Version und Dokumentzahl.
function ergebnisHash(ko = {}) {
  const roh = JSON.stringify([
    String(ko.id || ""), String(ko.vorgang_id || ""),
    Number(ko.ko_version) || 1, Number(ko.source_document_count) || 0
  ]);
  return crypto.createHash("sha256").update(roh).digest("hex").slice(0, 40);
}

// ── Der Vertrag ──────────────────────────────────────────────────────────────────────────
const LEASE_MS = 300000;        // 5 min — identisch zu Auftrags-Lease und Vorgangswache
const SCHREIB_LEASE_MS = 120000; // Schreibfenster nach der Modellantwort

function leaseMs(env = process.env) {
  const n = Number((env && env.HELMUT_VERSTEHEN_LEASE_MS) || 0);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : LEASE_MS;
}

// `besitzer` muss je ARBEITER eindeutig sein — nie je Lauf geteilt, sonst hielte ein
// zweiter Arbeiter fälschlich das Lease des ersten für sein eigenes (Wiedereintritt).
function baueBesitzer(praefix = "verstehen") {
  return `${praefix}-${crypto.randomUUID()}`;
}

function baueVertrag({ besitzer = null, env = process.env, deps = {} } = {}) {
  if (deps.erzwingeAktiv !== true && !casAktiv(env)) return null;
  const speicher = deps.speicher || require("./storage");
  const wer = String(besitzer || baueBesitzer());
  const ttl = leaseMs(env);

  // Eine nicht prüfbare Antwort ist IMMER ein Nein — nie ein „wird schon".
  const nichtPruefbar = (antwort) => !antwort || antwort.verfuegbar === false;

  return {
    aktiv: true,
    besitzer: wer,

    async reserviere({ vorgangId, eingabeHash: hash }) {
      const antwort = await speicher.verstehenReserviere({
        vorgangId, eingabeHash: hash, besitzer: wer, ttlMs: ttl
      });
      if (nichtPruefbar(antwort)) {
        return { erlaubt: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}`, fencing: null };
      }
      return {
        erlaubt: antwort.erlaubt === true,
        grund: antwort.grund || null,
        zustand: antwort.zustand || null,
        fencing: antwort.fencing,
        ergebnisHash: antwort.ergebnisHash || null,
        versuche: antwort.versuche || 0
      };
    },

    // VOR dem Modellaufruf. false => es darf NICHT aufgerufen werden.
    async modellstart({ vorgangId, fencing }) {
      const antwort = await speicher.verstehenModellstart({ vorgangId, besitzer: wer, fencing, ttlMs: ttl });
      if (nichtPruefbar(antwort)) return { erlaubt: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}` };
      return { erlaubt: antwort.ok === true, grund: antwort.ok === true ? null : "lease-verloren" };
    },

    // VOR der Persistenz. false => das eigene Ergebnis gilt nicht mehr.
    async schreibrecht({ vorgangId, fencing }) {
      const antwort = await speicher.verstehenSchreibrecht({
        vorgangId, besitzer: wer, fencing, ttlMs: SCHREIB_LEASE_MS
      });
      if (nichtPruefbar(antwort)) return { erlaubt: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}` };
      return { erlaubt: antwort.ok === true, grund: antwort.ok === true ? null : "lease-verloren" };
    },

    // DER ATOMARE SPEICHERWEG (Korrekturlauf 2026-08-15, Lücke 3). Er ersetzt die Kette
    // „Schreibrecht prüfen → über PostgREST speichern → abschließen": das waren drei
    // Anweisungen in drei Transaktionen, zwischen denen ein Besitzwechsel liegen konnte.
    // Hier prüft und schreibt EINE Datenbankfunktion unter dem Row-Lock der Vorgangszeile.
    //
    // Die Rückgabe ist bewusst dreiwertig, weil der Aufrufer drei verschiedene Dinge tun
    // muss: gespeichert (weiter), veraltet (stillschweigend abtreten, kein Fehler), oder
    // nicht prüfbar (fail closed — und nach dem Modellstart heißt das „unbekannt").
    async speichere({ vorgangId, fencing, ko, ergebnisHash: hash }) {
      const antwort = await speicher.verstehenSpeichere({ vorgangId, besitzer: wer, fencing, ko, ergebnisHash: hash });
      if (nichtPruefbar(antwort)) {
        return { gespeichert: false, pruefbar: false, veraltet: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}` };
      }
      if (antwort.ergebnis === "gespeichert") return { gespeichert: true, pruefbar: true, veraltet: false, grund: null };
      // Alles Übrige ist ein BEKANNTER, geordneter Ausgang: ein anderer Lauf ist weiter.
      // Das eigene Ergebnis gilt nicht mehr — kein Fehler, kein Wiederholungsgrund.
      return { gespeichert: false, pruefbar: true, veraltet: true, grund: antwort.ergebnis || "unbekannt" };
    },

    // NACH einem begonnenen Modellaufruf ohne belegtes Ergebnis. Nie `freigabe` — die
    // wäre ein automatischer zweiter, bezahlter Aufruf beim nächsten Lauf.
    async ausgangUnbekannt({ vorgangId, fencing, grund }) {
      const antwort = await speicher.verstehenAusgangUnbekannt({ vorgangId, besitzer: wer, fencing, grund });
      if (nichtPruefbar(antwort)) {
        // Fail closed OHNE Notausgang: die Zeile bleibt auf `modell-laeuft` stehen und läuft
        // über das ablaufende Lease von selbst in `unbekannt` (Migration §4e). Es gibt hier
        // bewusst KEINEN Rückfall auf `freigabe`.
        try { console.error("[verstehen-vertrag] Ausgang nicht als unbekannt vermerkbar:", vorgangId, (antwort && antwort.grund) || "unbekannt"); }
        catch (_) { /* ignore */ }
        return { ok: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}` };
      }
      return { ok: antwort.blockiert === true, ergebnis: antwort.ergebnis || null };
    },

    async abschluss({ vorgangId, fencing, ergebnisHash: hash }) {
      const antwort = await speicher.verstehenAbschluss({ vorgangId, besitzer: wer, fencing, ergebnisHash: hash });
      if (nichtPruefbar(antwort)) return { ok: false, grund: `vertrag-nicht-pruefbar:${(antwort && antwort.grund) || "unbekannt"}` };
      return { ok: antwort.ok === true, grund: antwort.ok === true ? null : "uebernommen-von-neuerem" };
    },

    async freigabe({ vorgangId, fencing, grund }) {
      const antwort = await speicher.verstehenFreigabe({ vorgangId, besitzer: wer, fencing, grund });
      return { ok: Boolean(antwort && antwort.ok) };
    },

    // Nur mit BELEG, dass nichts abgesendet wurde (Tagesbudget/Anbietergrenze vor dem
    // HTTP-Aufruf). Eigener Weg, damit der allgemeine Rückweg nach dem Modellstart
    // verschlossen bleiben kann.
    async freigabeOhneAufruf({ vorgangId, fencing, grund }) {
      const antwort = await speicher.verstehenFreigabeOhneAufruf({ vorgangId, besitzer: wer, fencing, grund });
      return { ok: Boolean(antwort && antwort.ok) };
    },

    // ── Vormerkungen (der eigentliche Anlass dieses Sprints) ─────────────────────────────
    // ATOMAR statt Lesen → Ändern → Schreiben. `delta = 0` legt die Vormerkung an, ohne
    // einen Fehlversuch zu zählen — exakt die bisherige Semantik der Budgetvertagung.
    async vormerkungLese(vorgangId) {
      const antwort = await speicher.verstehenVormerkungLese([vorgangId]);
      if (nichtPruefbar(antwort)) return { verfuegbar: false, fehlversuche: null };
      const wert = antwort.eintraege && Object.prototype.hasOwnProperty.call(antwort.eintraege, vorgangId)
        ? antwort.eintraege[vorgangId] : null;
      return { verfuegbar: true, vorhanden: wert !== null, fehlversuche: wert };
    },

    async vormerkungErhoehe({ vorgangId, delta, fencing }) {
      const antwort = await speicher.verstehenVormerkungErhoehe({ vorgangId, delta, fencing: fencing || 0 });
      if (nichtPruefbar(antwort)) {
        try { console.error("[verstehen-vertrag] Vormerkung nicht geschrieben:", vorgangId, (antwort && antwort.grund) || "unbekannt"); }
        catch (_) { /* ignore */ }
        return { ok: false };
      }
      return { ok: true, fehlversuche: antwort.fehlversuche };
    },

    // BEDINGT (Compare-and-Set gegen `letzte_fencing`): ein langsamer Erfolgsmelder darf
    // die Vormerkung eines JÜNGEREN, gescheiterten Laufs nicht löschen.
    async vormerkungLoese({ vorgangId, fencing }) {
      const antwort = await speicher.verstehenVormerkungLoese({ vorgangId, fencing: fencing || 0 });
      return { ok: Boolean(antwort && antwort.ok) };
    }
  };
}

module.exports = {
  casAktiv,
  verstehenParallelitaet,
  VERSTEHEN_PARALLELITAET_MAX,
  eingabeHash,
  ergebnisHash,
  baueBesitzer,
  baueVertrag,
  leaseMs
};
