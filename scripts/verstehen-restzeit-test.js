"use strict";

// Helmut — Vertragstest RESTZEITWACHE VOR DEM MODELLAUFRUF (Reparatursprint 2026-08-20,
// Runbook §29). Offline, Attrappen — kein Netz, keine Datenbank, kein Modellaufruf.
// =============================================================================================
// Anlass: `25c6c69d` (19.08.) und `df1a6700` (20.08.) blieben nach dem 10:00-Lage-Check als
// `modell-laeuft` mit abgelaufener Lease stehen — der Loop kannte nur ein RELATIVES Budget
// und startete kurz vor dem aeusseren Funktionsende noch bezahlte Modellaufrufe. Dazu
// `eff40db2` (20.08. 16:04): der EINE Speicher-RPC lief in den 10-s-Client-Timeout, der
// bezahlte Aufruf ging verloren (`speicherfehler`, ehrlich `unbekannt`).
//
//   §1 Modul: Grenzfaelle der zentralen Restzeitentscheidung (Reserve, Env-Overrides)
//   §2 Zu wenig Restzeit VOR der Reservierung: kein Aufruf, kein Budget, kein Versuch,
//      keine Lease — der Vorgang bleibt unveraendert verarbeitbar
//   §3 Genug Restzeit: genau EIN Aufruf und sauberer Abschluss (fertig)
//   §4 Zweites Gate unmittelbar vor dem Modellstart: Zeit zwischen Reservierung und
//      Modellstart verbraucht -> kein Aufruf, Reservierung regulaer freigegeben (offen)
//   §5 Anbieter-Timeout nach Modellstart: genau EIN Aufruf, ehrlich `unbekannt`,
//      kein automatischer zweiter bezahlter Aufruf im Folgelauf
//   §6 Speicherfehler: genau EINE Wiederholung des Speicherwegs (kein Modellaufruf) —
//      Erfolg im zweiten Versuch, dauerhafter Fehler, bereits committeter Erstversuch
//      (kein Doppel-Schreiben), keine Wiederholung ohne Restzeit
//   §7 Loop-Gate: abgelaufene Deadline -> 0 Modellaufrufe, Cluster werden vorgemerkt
//   §8 Warteschlangenpfad: fuehreAuftragAus reicht das absolute Auftragsfensterende an
//      den Handler durch
//   §9 Verdrahtung: Einstiegspunkte uebergeben die absolute Deadline; ai.js nutzt den
//      zentralen KI-Timeout; beide Pfade tragen das dritte Gate
//   §10 REVIEW-KORREKTUR: langsamer `modellstart`-RPC -> das dritte Gate (unmittelbar
//       vor dem externen Aufruf) verhindert den Aufruf; Rueckweg `freigabeOhneAufruf`
//   §11 REVIEW-KORREKTUR: `modellstart` serverseitig committet, Antwort im
//       Client-Timeout verloren -> keine verwaiste Zeile, kein unbekannt, sicher
//       erneut verarbeitbar (auch ohne Commit, §11b)
//   §12 REVIEW-KORREKTUR: die Wartezeit vor dem Speicherweg-Zweitversuch zaehlt in
//       dessen Restzeitpruefung

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const restzeit = require(path.join(ROOT, "lib/helmut/verstehen-restzeit"));
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
const { understandOneCluster, runUnderstandingShadow } = require(path.join(ROOT, "lib/helmut/understanding"));
const { fuehreAuftragAus } = require(path.join(ROOT, "lib/helmut/scalable-pipeline"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Attrappe der CAS-Datenbankseite (bildet 20260814180000 nach, kompakt) ────────────────────
// `modellstartVerhalten`/`speichereVerhalten`: optionale (auch async) Haken je Aufruf —
// geben sie ein Objekt zurueck, ersetzt es die Antwort; geben sie null zurueck, laeuft
// die normale Logik (so laesst sich ein LANGSAMER RPC oder ein Antwortverlust nach
// serverseitigem Commit nachbilden).
function baueSpeicherAttrappe({ speichereVerhalten = null, modellstartVerhalten = null } = {}) {
  const zeilen = new Map();
  const kos = new Map();     // vorgangId -> { fencing, fassungen }
  let speichereAufrufe = 0;
  const hole = (id) => {
    if (!zeilen.has(id)) {
      zeilen.set(id, { besitzer: null, fencing: 0, leaseBis: null, zustand: "offen",
        eingabeHash: null, ergebnisHash: null, versuche: 0, kiAufrufe: 0, letzterGrund: null });
    }
    return zeilen.get(id);
  };
  const attrappe = {
    zeilen, kos,
    get speichereAufrufe() { return speichereAufrufe; },
    async verstehenReserviere({ vorgangId, eingabeHash, besitzer, ttlMs }) {
      const r = hole(vorgangId);
      if (r.zustand === "unbekannt") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "ausgang-unbekannt" };
      if (r.zustand === "fertig" && r.eingabeHash === eingabeHash) return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig" };
      if (["reserviert", "modell-laeuft"].includes(r.zustand) && r.leaseBis > Date.now()) {
        if (r.besitzer === besitzer) { r.leaseBis = Date.now() + ttlMs; return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: r.zustand, grund: "wiedereintritt" }; }
        return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "belegt" };
      }
      r.fencing += 1; r.besitzer = besitzer; r.leaseBis = Date.now() + ttlMs;
      r.zustand = "reserviert"; r.eingabeHash = eingabeHash; r.versuche += 1; r.letzterGrund = null;
      return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: "reserviert", grund: "uebernommen" };
    },
    async verstehenModellstart({ vorgangId, besitzer, fencing, ttlMs }) {
      if (typeof modellstartVerhalten === "function") {
        const sonder = await modellstartVerhalten({ attrappe, vorgangId, besitzer, fencing, ttlMs });
        if (sonder) return sonder;
      }
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "reserviert" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSchreibrecht({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSpeichere({ vorgangId, besitzer, fencing, ko, ergebnisHash }) {
      speichereAufrufe += 1;
      if (typeof speichereVerhalten === "function") {
        const sonder = speichereVerhalten({ aufruf: speichereAufrufe, attrappe, vorgangId, besitzer, fencing, ko, ergebnisHash });
        if (sonder) return sonder;
      }
      const r = hole(vorgangId);
      if (r.fencing !== fencing) return { verfuegbar: true, ergebnis: "fencing-veraltet" };
      if (r.zustand !== "modell-laeuft") return { verfuegbar: true, ergebnis: `zustand-${r.zustand}` };
      if (r.besitzer !== besitzer) return { verfuegbar: true, ergebnis: "fremder-besitzer" };
      if (!(r.leaseBis > Date.now())) return { verfuegbar: true, ergebnis: "lease-abgelaufen" };
      const bisher = kos.get(vorgangId) || { fencing: -1, fassungen: 0 };
      kos.set(vorgangId, { fencing, fassungen: bisher.fassungen + 1 });
      r.zustand = "fertig"; r.ergebnisHash = ergebnisHash; r.besitzer = null; r.leaseBis = null;
      return { verfuegbar: true, ergebnis: "gespeichert" };
    },
    async verstehenAusgangUnbekannt({ vorgangId, grund }) {
      const r = hole(vorgangId);
      if (r.zustand !== "modell-laeuft") return { verfuegbar: true, blockiert: false, ergebnis: `zustand-${r.zustand}` };
      r.zustand = "unbekannt"; r.besitzer = null; r.leaseBis = null; r.letzterGrund = String(grund || "").slice(0, 200);
      return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" };
    },
    async verstehenAbschluss({ vorgangId }) { return { verfuegbar: true, ok: true }; },
    async verstehenFreigabe({ vorgangId, besitzer }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer) return { ok: false };
      r.zustand = "offen"; r.besitzer = null; r.leaseBis = null;
      return { ok: true };
    },
    async verstehenFreigabeOhneAufruf({ vorgangId, besitzer, fencing, grund }) {
      // Spiegelt die Migration exakt: Guard auf Besitzer+Fencing+Zustand, Zaehler-
      // korrektur NUR aus modell-laeuft, Beleg-Spur in letzter_grund.
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing
          || !["reserviert", "modell-laeuft"].includes(r.zustand)) return { ok: false };
      if (r.zustand === "modell-laeuft") r.kiAufrufe = Math.max(0, r.kiAufrufe - 1);
      r.zustand = "offen"; r.besitzer = null; r.leaseBis = null;
      r.letzterGrund = ("belegt-ohne-aufruf:" + (grund || "unbenannt")).slice(0, 200);
      return { ok: true };
    },
    async verstehenVormerkungLese() { return { verfuegbar: true, eintraege: {} }; },
    async verstehenVormerkungErhoehe() { return { verfuegbar: true, fehlversuche: 1 }; },
    async verstehenVormerkungLoese() { return { ok: true }; }
  };
  return attrappe;
}

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Bundestag debattiert Haushaltsentwurf", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Haushalt"
};

function baueCluster(titel, id) {
  return { documents: [{ id, title: titel, published_at: "2026-08-20T08:00:00Z" }] };
}

function baueDeps(protokoll, speicher, extra = {}) {
  return {
    canSpend: async () => { protokoll.budgetGeprueft += 1; return { allowed: true }; },
    requestUnderstanding: async () => { protokoll.kiAufrufe += 1; return { ...ANALYSE }; },
    save: async (ko) => ({ saved: true, id: ko.id }),
    saveSources: async () => {},
    markFailed: async () => { protokoll.markFailed += 1; },
    modelName: () => "test", logSkip: () => {},
    findVorgangCandidates: async () => [],
    listVorgangDocuments: async () => [],
    verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } }),
    speicherWiederholungWarteMs: 0,
    ...extra
  };
}

function neuesProtokoll() { return { kiAufrufe: 0, budgetGeprueft: 0, markFailed: 0 }; }
const einzigeZeile = (speicher) => [...speicher.zeilen.values()][0];

async function main() {
  abschnitt("§1 Modul: zentrale Restzeitentscheidung");
  {
    const jetzt = 1000000;
    const ohne = restzeit.restzeitEntscheidung({ deadlineMs: 0, jetztMs: jetzt, env: {} });
    check("§1.1 ohne Deadline immer erlaubt (Bestandsverhalten)", ohne.erlaubt === true && ohne.grund === "keine-deadline");
    const reserve = restzeit.reserveMs({});
    check("§1.2 Kernreserve = KI-Timeout + 2x Speicher-Timeout (Schreibrecht + Speichern) + Abschluss (45 000 ms)",
      reserve === 45000, `reserve=${reserve}`);
    check("§1.2b Vor-Modellstart-Reserve = Kernreserve + modellstart-RPC (55 000 ms)",
      restzeit.reserveVorModellstartMs({}) === 55000, String(restzeit.reserveVorModellstartMs({})));
    const genau = restzeit.restzeitEntscheidung({ deadlineMs: jetzt + reserve, jetztMs: jetzt, env: {} });
    check("§1.3 Rest exakt gleich Reserve: erlaubt", genau.erlaubt === true);
    const knapp = restzeit.restzeitEntscheidung({ deadlineMs: jetzt + reserve - 1, jetztMs: jetzt, env: {} });
    check("§1.4 Rest unter Reserve: nicht erlaubt, Grund benannt",
      knapp.erlaubt === false && knapp.grund === "restzeit-unter-reserve");
    check("§1.4b Waehlbare Reserve (Gate-3 vs. Vor-Modellstart) wirkt in der Entscheidung",
      restzeit.restzeitEntscheidung({ deadlineMs: jetzt + 50000, jetztMs: jetzt, env: {}, reserveMs: 55000 }).erlaubt === false
      && restzeit.restzeitEntscheidung({ deadlineMs: jetzt + 50000, jetztMs: jetzt, env: {}, reserveMs: 45000 }).erlaubt === true);
    check("§1.5 Reserve folgt HELMUT_KI_TIMEOUT_MS und HELMUT_SUPABASE_TIMEOUT_MS",
      restzeit.reserveMs({ HELMUT_KI_TIMEOUT_MS: "30000", HELMUT_SUPABASE_TIMEOUT_MS: "20000" }) === 75000
      && restzeit.reserveVorModellstartMs({ HELMUT_KI_TIMEOUT_MS: "30000", HELMUT_SUPABASE_TIMEOUT_MS: "20000" }) === 95000);
    check("§1.6 HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS ueberstimmt die Kernreserve (Vor-Modellstart bleibt +1 Storage-Aufruf)",
      restzeit.reserveMs({ HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS: "12000", HELMUT_KI_TIMEOUT_MS: "99000" }) === 12000
      && restzeit.reserveVorModellstartMs({ HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS: "12000", HELMUT_KI_TIMEOUT_MS: "99000" }) === 22000);
    check("§1.7 kiTimeoutMs: Default 20 000, Override wirkt, Unsinn faellt auf Default",
      restzeit.kiTimeoutMs({}) === 20000
      && restzeit.kiTimeoutMs({ HELMUT_KI_TIMEOUT_MS: "45000" }) === 45000
      && restzeit.kiTimeoutMs({ HELMUT_KI_TIMEOUT_MS: "abc" }) === 20000
      && restzeit.kiTimeoutMs({ HELMUT_KI_TIMEOUT_MS: "10" }) === 20000);
  }

  abschnitt("§2 Zu wenig Restzeit VOR der Reservierung");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 500 });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    check("§2.1 Status skipped-zeitbudget mit Grund und Messwerten",
      r.status === "skipped-zeitbudget" && r.reason === "restzeit-unter-reserve"
      && Number.isFinite(r.restMs) && r.reserveMs > 0);
    check("§2.2 KEIN Modellaufruf, KEIN Budget-Gate, KEIN markFailed",
      p.kiAufrufe === 0 && p.budgetGeprueft === 0 && p.markFailed === 0);
    check("§2.3 KEINE Reservierung, KEINE Lease, KEIN Versuch gezaehlt",
      speicher.zeilen.size === 0);
  }

  abschnitt("§3 Genug Restzeit: genau ein Aufruf, sauberer Abschluss");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    const z = einzigeZeile(speicher);
    check("§3.1 gespeichert (saved)", r.status === "saved");
    check("§3.2 genau EIN Modellaufruf, genau EIN Versuch, genau EIN KI-Aufruf im CAS",
      p.kiAufrufe === 1 && z.versuche === 1 && z.kiAufrufe === 1);
    check("§3.3 Zustand fertig, keine Lease, kein unbekannt",
      z.zustand === "fertig" && z.leaseBis === null);
  }

  abschnitt("§4 Zweites Gate VOR dem Modellstart-Vermerk");
  {
    // Kernreserve 1000, modellstart-RPC-Anteil 1000 -> Vor-Modellstart-Reserve 2000.
    process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS = "1000";
    process.env.HELMUT_SUPABASE_TIMEOUT_MS = "1000";
    try {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe();
      const deps = baueDeps(p, speicher, {
        deadlineMs: Date.now() + 2400,
        // Das Budget-Gate (zwischen Reservierung und Modellstart) verbraucht die Restzeit.
        canSpend: async () => { p.budgetGeprueft += 1; await warte(500); return { allowed: true }; }
      });
      const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
      const z = einzigeZeile(speicher);
      check("§4.1 Status skipped-zeitbudget (zweites Gate)", r.status === "skipped-zeitbudget");
      check("§4.2 KEIN Modellaufruf, KEIN KI-Aufruf im CAS", p.kiAufrufe === 0 && z.kiAufrufe === 0);
      check("§4.3 Reservierung regulaer freigegeben: Zustand offen, keine Lease — sicher wiederholbar",
        z.zustand === "offen" && z.leaseBis === null && z.besitzer === null);
    } finally {
      delete process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS;
      delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
    }
  }

  abschnitt("§5 Anbieter-Timeout nach Modellstart: kein zweiter bezahlter Aufruf");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const deps = baueDeps(p, speicher, {
      deadlineMs: Date.now() + 600000,
      requestUnderstanding: async () => { p.kiAufrufe += 1; throw new Error("OpenAI request timeout"); }
    });
    const cluster = baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1");
    const r1 = await understandOneCluster(cluster, deps);
    const z = einzigeZeile(speicher);
    check("§5.1 Erster Lauf: genau EIN Aufruf, Ausgang ehrlich unbekannt",
      p.kiAufrufe === 1 && r1.status === "skipped-error" && r1.ausgang === "unbekannt");
    check("§5.2 CAS-Zustand unbekannt mit Klasse modellfehler",
      z.zustand === "unbekannt" && /^modellfehler:OpenAI request timeout/.test(z.letzterGrund || ""));
    const r2 = await understandOneCluster(cluster, baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 }));
    check("§5.3 Folgelauf: KEIN automatischer zweiter bezahlter Aufruf, sichtbar blockiert",
      p.kiAufrufe === 1 && r2.status === "skipped-ausgang-unbekannt" && z.kiAufrufe === 1);
  }

  abschnitt("§6 Speicherfehler: genau EINE Wiederholung des Speicherwegs");
  {
    // §6a: erster Versuch nicht pruefbar, zweiter gespeichert -> Erfolg ohne zweiten Modellaufruf.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      speichereVerhalten: ({ aufruf }) => (aufruf === 1 ? { verfuegbar: false, grund: "storage-timeout-10000ms" } : null)
    });
    const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    const z = einzigeZeile(speicher);
    check("§6a.1 Zweiter Speicherversuch rettet den bezahlten Aufruf: saved, fertig",
      r.status === "saved" && z.zustand === "fertig");
    check("§6a.2 GENAU 2 Speicherversuche, GENAU 1 Modellaufruf",
      speicher.speichereAufrufe === 2 && p.kiAufrufe === 1 && z.kiAufrufe === 1);
  }
  {
    // §6b: dauerhaft nicht pruefbar -> kein falscher Erfolg, ehrlich unbekannt, genau 2 Versuche.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      speichereVerhalten: () => ({ verfuegbar: false, grund: "storage-timeout-10000ms" })
    });
    const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    const z = einzigeZeile(speicher);
    check("§6b.1 Kein falscher Erfolg: skipped-store, Ausgang unbekannt",
      r.status === "skipped-store" && r.ausgang === "unbekannt");
    check("§6b.2 GENAU 2 Speicherversuche, danach Schluss — kein weiterer Modellaufruf",
      speicher.speichereAufrufe === 2 && p.kiAufrufe === 1);
    check("§6b.3 CAS unbekannt mit Klasse speicherfehler inkl. Wiederholungsvermerk",
      z.zustand === "unbekannt" && /^speicherfehler:nach-wiederholung:/.test(z.letzterGrund || ""));
  }
  {
    // §6c: der erste Versuch hat in Wahrheit COMMITTET (Antwort ging verloren). Die
    // Wiederholung darf NIE doppelt schreiben — sie trifft den geordneten Rueckweg.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      speichereVerhalten: ({ aufruf, attrappe, vorgangId, fencing, ergebnisHash }) => {
        if (aufruf !== 1) return null;
        const r = attrappe.zeilen.get(vorgangId);
        attrappe.kos.set(vorgangId, { fencing, fassungen: 1 });
        r.zustand = "fertig"; r.ergebnisHash = ergebnisHash; r.besitzer = null; r.leaseBis = null;
        return { verfuegbar: false, grund: "antwort-verloren-nach-commit" };
      }
    });
    const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    const z = einzigeZeile(speicher);
    check("§6c.1 KEIN Doppel-Schreiben: genau EINE Fassung des Wissensobjekts",
      (speicher.kos.get(z ? [...speicher.zeilen.keys()][0] : "") || { fassungen: 0 }).fassungen === 1);
    check("§6c.2 fertig bleibt fertig (kein Kippen nach unbekannt), kein zweiter Modellaufruf",
      z.zustand === "fertig" && p.kiAufrufe === 1);
    check("§6c.3 Ehrlich-pessimistische Meldung (kein behaupteter Doppel-Erfolg)",
      r.status === "skipped-veraltet");
  }
  {
    // §6d: reicht die Restzeit fuer keine Wiederholung, bleibt es bei EINEM Versuch.
    // Kern 1000 / Vor-Modellstart 2000 (Storage 1000, Mindestwert der Klemmung);
    // Wiederholungsbedarf waere warteMs(0) + Storage(1000) + Abschluss(5000) = 6000
    // > Rest (~2350).
    process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS = "1000";
    process.env.HELMUT_SUPABASE_TIMEOUT_MS = "1000";
    try {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe({
        speichereVerhalten: () => ({ verfuegbar: false, grund: "storage-timeout-10000ms" })
      });
      const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 2400 });
      const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
      check("§6d.1 Ohne Restzeit KEINE Wiederholung: genau 1 Speicherversuch, ehrlich unbekannt",
        speicher.speichereAufrufe === 1 && r.status === "skipped-store" && r.ausgang === "unbekannt");
    } finally {
      delete process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS;
      delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
    }
  }

  abschnitt("§7 Loop-Gate: abgelaufene Deadline stoppt VOR dem Cluster, Rest wird vorgemerkt");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const vorgemerkt = [];
    const rohdokumente = [
      { id: "rd-a", title: "Bundestag debattiert Haushaltsentwurf", published_at: "2026-08-20T08:00:00Z" },
      { id: "rd-b", title: "Ausschuss beraet Klimapaket im Detail", published_at: "2026-08-20T09:00:00Z" }
    ];
    const r = await runUnderstandingShadow(rohdokumente, {
      enabled: () => true, aiEnabled: () => true, gateMode: () => "off",
      acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
      deadlineMs: Date.now() - 1,
      savePendingBulk: async (liste) => { vorgemerkt.push(...liste); return { vorgemerkt: liste.length, bereitsVorhanden: 0, fehlgeschlagen: 0 }; },
      ...baueDeps(p, speicher)
    });
    check("§7.1 KEIN Modellaufruf, KEINE Reservierung", p.kiAufrufe === 0 && speicher.zeilen.size === 0);
    check("§7.2 ALLE Cluster ehrlich vorgemerkt (Nachholkandidaten)",
      vorgemerkt.length >= 1 && (r.deferred || 0) + vorgemerkt.length >= 2);
  }

  abschnitt("§8 Warteschlangenpfad: absolutes Auftragsfensterende erreicht den Handler");
  {
    let gesehen = null;
    const vorher = Date.now();
    await fuehreAuftragAus({
      auftrag: {
        id: "j-1", job_type: "document_understanding", payload: {},
        lease_expires_at: new Date(Date.now() + 240000).toISOString()
      },
      besitzer: "w-test", leaseMs: 120000, restzeitMs: 30000,
      deps: {
        now: () => Date.now(),
        extendLease: async () => ({ verfuegbar: true, verlaengert: true }),
        handler: { document_understanding: async (auftrag, d, kontext) => { gesehen = kontext; return { erledigt: 1 }; } },
        completeJob: async () => ({ verfuegbar: true }),
        deferJob: async () => ({ verfuegbar: true }),
        failJob: async () => ({ verfuegbar: true })
      }
    }).catch(() => {});
    check("§8.1 Handler erhaelt auftragsDeadlineMs (absolut, im Auftragsfenster)",
      gesehen && Number(gesehen.auftragsDeadlineMs) >= vorher + 25000
      && Number(gesehen.auftragsDeadlineMs) <= Date.now() + 30500,
      gesehen ? `deadline=${gesehen.auftragsDeadlineMs}` : "kontext fehlt");
  }

  abschnitt("§9 Verdrahtung der Einstiegspunkte (Quelltextvertrag)");
  {
    const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
    const scheduler = src("lib/helmut/scheduler.js");
    const serverJs = src("server.js");
    const pipeline = src("lib/helmut/scalable-pipeline.js");
    const aiJs = src("lib/helmut/ai.js");
    check("§9.1 Lage-Pfad reicht die absolute Deadline in das Verstehen",
      /deadlineMs:\s*Number\(optionen\.deadlineMs\)/.test(scheduler)
      && /runLageCheck\(tenantId,\s*\{\s*deadlineMs:\s*t0 \+ 280000\s*\}\)/.test(serverJs));
    check("§9.2 Eager-Pfad (Crawl) reicht eine absolute Deadline in das Verstehen",
      /deadlineMs:\s*eagerDeadlineMs/.test(scheduler));
    check("§9.3 Globalphase reicht die absolute Deadline in das Verstehen",
      /deadlineMs:\s*startedMs \+ budgetMs - ABSCHLUSS_RESERVE_MS/.test(scheduler));
    check("§9.4 Understanding-Cron und Admin-Recovery tragen absolute Deadlines",
      /deadlineMs:\s*understandingStartMs \+ 280000/.test(serverJs)
      && /deadlineMs:\s*startTs \+ 240000/.test(serverJs));
    check("§9.5 Warteschlange: Handler-Aufruf traegt auftragsDeadlineMs, Verstehens-Handler nutzt sie",
      /auftragsDeadlineMs:\s*d\.now\(\) \+ auftragsBudget/.test(pipeline)
      && /Number\(kontext\.auftragsDeadlineMs\)/.test(pipeline));
    check("§9.6 ai.js nutzt den zentralen KI-Timeout statt eines Literals",
      /timeout:\s*kiTimeoutMs\(\)/.test(aiJs) && !/timeout:\s*20000/.test(aiJs));
    const understandingSrc = src("lib/helmut/understanding.js");
    check("§9.7 BEIDE Pfade tragen das dritte Gate (nach Modellstart, vor dem externen Aufruf) und den modellstart-Rueckweg",
      (understandingSrc.match(/DRITTE PRUEFUNG/g) || []).length === 2
      && (understandingSrc.match(/grund: "modellstart-nicht-pruefbar"/g) || []).length === 2);
  }

  abschnitt("§10 REVIEW-KORREKTUR: langsamer modellstart-RPC — drittes Gate verhindert den Aufruf");
  {
    // Kern 1000 / Vor-Modellstart 2000. Der modellstart-RPC committet, braucht aber
    // 1200 ms — danach liegt der Rest (~900) unter der Kernreserve.
    process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS = "1000";
    process.env.HELMUT_SUPABASE_TIMEOUT_MS = "1000";
    try {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe({
        modellstartVerhalten: async () => { await warte(1200); return null; }
      });
      const deps = baueDeps(p, speicher, { deadlineMs: Date.now() + 2150 });
      const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
      const z = einzigeZeile(speicher);
      check("§10.1 KEIN Anbieteraufruf (drittes Gate)", p.kiAufrufe === 0 && r.status === "skipped-zeitbudget");
      check("§10.2 Rueckweg freigabeOhneAufruf: KI-Aufrufzaehler korrigiert, KEINE verwaiste Lease",
        z.kiAufrufe === 0 && z.leaseBis === null && z.besitzer === null,
        `zustand=${z.zustand} kiAufrufe=${z.kiAufrufe}`);
      check("§10.3 Zustand offen mit Beleg-Spur — sicher erneut verarbeitbar",
        z.zustand === "offen" && /^belegt-ohne-aufruf:/.test(z.letzterGrund || ""));
    } finally {
      delete process.env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS;
      delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
    }
  }

  abschnitt("§11 REVIEW-KORREKTUR: modellstart committet, Antwort verloren — kein unbekannt, keine Waise");
  {
    let verlustAktiv = true;
    const speicher = baueSpeicherAttrappe({
      // Serverseitiger COMMIT (Zeile -> modell-laeuft, ki_aufrufe+1), aber die Antwort
      // geht im Client-Timeout verloren (verfuegbar:false).
      modellstartVerhalten: ({ attrappe, vorgangId, ttlMs }) => {
        if (!verlustAktiv) return null;
        const r = attrappe.zeilen.get(vorgangId);
        r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = Date.now() + ttlMs;
        return { verfuegbar: false, grund: "storage-timeout-10000ms" };
      }
    });
    const p = neuesProtokoll();
    const cluster = baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1");
    const r1 = await understandOneCluster(cluster, baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 }));
    const z = einzigeZeile(speicher);
    check("§11.1 KEIN Anbieteraufruf, Status skipped-modellstart-unklar mit gelungenem Rueckweg",
      p.kiAufrufe === 0 && r1.status === "skipped-modellstart-unklar" && r1.rueckwegOk === true);
    check("§11.2 KEINE verwaiste modell-laeuft-Zeile, KEIN unbekannt: offen, Zaehler korrigiert, keine Lease",
      z.zustand === "offen" && z.kiAufrufe === 0 && z.leaseBis === null
      && /^belegt-ohne-aufruf:modellstart-nicht-pruefbar/.test(z.letzterGrund || ""));
    verlustAktiv = false;
    const r2 = await understandOneCluster(cluster, baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 }));
    check("§11.3 Sicher erneut verarbeitbar: Folgelauf versteht regulaer (genau EIN bezahlter Aufruf insgesamt)",
      r2.status === "saved" && p.kiAufrufe === 1 && z.zustand === "fertig" && z.kiAufrufe === 1);
  }
  {
    // §11b: Antwort verloren OHNE serverseitigen Commit (Zeile bleibt reserviert).
    let verlustAktiv = true;
    const speicher = baueSpeicherAttrappe({
      modellstartVerhalten: () => (verlustAktiv ? { verfuegbar: false, grund: "netzfehler" } : null)
    });
    const p = neuesProtokoll();
    const cluster = baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1");
    const r1 = await understandOneCluster(cluster, baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 }));
    const z = einzigeZeile(speicher);
    check("§11b.1 Auch ohne Commit: kein Aufruf, kein Zaehler, offen, keine Lease",
      p.kiAufrufe === 0 && r1.status === "skipped-modellstart-unklar"
      && z.zustand === "offen" && z.kiAufrufe === 0 && z.leaseBis === null);
    verlustAktiv = false;
    const r2 = await understandOneCluster(cluster, baueDeps(p, speicher, { deadlineMs: Date.now() + 600000 }));
    check("§11b.2 Folgelauf versteht regulaer", r2.status === "saved" && p.kiAufrufe === 1);
  }

  abschnitt("§12 REVIEW-KORREKTUR: Wartezeit zaehlt in der Restzeitpruefung des Speicherweg-Zweitversuchs");
  {
    // Kern = 1000 + 2x1000 + 5000 = 8000, Vor-Modellstart 9000; Deadline +9500.
    // Wiederholungsbedarf MIT warteMs 4000: 4000+1000+5000 = 10000 > Rest (~9300) -> nein.
    // Ohne Wartezeit (warteMs 0): 6000 <= Rest -> ja. Genau die Wartezeit entscheidet.
    process.env.HELMUT_KI_TIMEOUT_MS = "1000";
    process.env.HELMUT_SUPABASE_TIMEOUT_MS = "1000";
    try {
      const pA = neuesProtokoll();
      const speicherA = baueSpeicherAttrappe({
        speichereVerhalten: () => ({ verfuegbar: false, grund: "storage-timeout" })
      });
      const rA = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"),
        baueDeps(pA, speicherA, { deadlineMs: Date.now() + 9500, speicherWiederholungWarteMs: 4000 }));
      check("§12.1 Mit Wartezeit 4000 ms reicht die Restzeit NICHT: genau 1 Speicherversuch",
        speicherA.speichereAufrufe === 1 && rA.status === "skipped-store",
        `versuche=${speicherA.speichereAufrufe}`);
      const pB = neuesProtokoll();
      const speicherB = baueSpeicherAttrappe({
        speichereVerhalten: () => ({ verfuegbar: false, grund: "storage-timeout" })
      });
      const rB = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"),
        baueDeps(pB, speicherB, { deadlineMs: Date.now() + 9500, speicherWiederholungWarteMs: 0 }));
      check("§12.2 Ohne Wartezeit reicht dieselbe Restzeit: genau 2 Speicherversuche",
        speicherB.speichereAufrufe === 2 && rB.status === "skipped-store",
        `versuche=${speicherB.speichereAufrufe}`);
    } finally {
      delete process.env.HELMUT_KI_TIMEOUT_MS;
      delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
    }
  }

  console.log(`\nErgebnis: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.stack);
  process.exitCode = 1;
});
