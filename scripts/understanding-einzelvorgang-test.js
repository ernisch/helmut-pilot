"use strict";

// Helmut — GEZIELTE TESTS des EINZELVORGANG-WEGS (GENAU EIN freigegebener Vorgang).
// Offline, Attrappen — kein Netz, keine Datenbank, KEIN echter Modellaufruf, kein Production-
// Schreibzugriff. Kanonischer Lauf:
//   node scripts/lokal.js -- node scripts/understanding-einzelvorgang-test.js
// =============================================================================================
// Abgesicherte Faelle:
//   §1  keine vorgangId                          -> ehrliche Absage, 0 Modellaufrufe
//   §2  keine ausdrueckliche Wiederaufnahmefreigabe -> ehrliche Absage, 0 Modellaufrufe
//       (inkl. nicht lesbarer Liste und fehlendem CAS-Vertrag)
//   §3  gueltig freigegebener Einzelvorgang       -> genau dieser Vorgang, genau 1 Modellaufruf
//   §4  weitere pending Wissensobjekte existieren -> sie werden NICHT verarbeitet
//   §5  Bestand nicht lesbar / kein Wissensobjekt -> fail closed, 0 Modellaufrufe
//   §6  Dokumente fehlen/nicht lesbar             -> fail closed, 0 Modellaufrufe
//   §7  Lock verweigert                           -> 0 Modellaufrufe
//   §8  Budget verweigert                         -> 0 Modellaufrufe
//   §9  Validator lehnt ab                        -> sichere Fehlercodes, keine Rohantwort
//       (ausgeloest ueber die weiterhin STRENGE Beteiligungsliste `ausschuesse`)
//   §10 Admin-Schutz (Rolle + CSRF) und KEIN breiter Pending-Lauf im Weg
//
// Die Attrappen ersetzen ausschliesslich Datenbank und Modell. Der Verstehensmotor
// (`understandOneCluster`), die CAS-Fabrik (`verstehen-vertrag`), die Vormerkungslogik und die
// Validatoren sind die ECHTEN Produktionsfunktionen.

const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const E = require(path.join(ROOT, "lib/helmut/verstehen-einzelvorgang"));
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));

const VORGANG = "vg-abschaffung-20260911-7420f6";
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log("  PASS  " + name); }
  else { fail += 1; console.log("  FAIL  " + name + (detail ? " — " + detail : "")); }
}
function abschnitt(t) { console.log("\n== " + t + " =="); }

// Schema-valider Motor-Antwortfixture (bewaehrt aus den bestehenden Verstehenssuiten).
const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Abschaffung der Rente mit 63 geprueft", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Sozialpolitik"
};
const DOKUMENT = { id: "rd-1", title: "Abschaffung der Rente mit 63", url: "https://example.org/rd-1", published_at: "2026-09-22T08:00:00.000Z" };

// CAS-Attrappe (bildet die SQL-Semantik von 20260814180000 so weit nach, wie der Weg sie nutzt).
function baueSpeicher() {
  const z = { zustand: "offen", fencing: 0, besitzer: null };
  return {
    async verstehenReserviere({ besitzer }) {
      z.fencing += 1; z.besitzer = besitzer; z.zustand = "reserviert";
      return { verfuegbar: true, erlaubt: true, fencing: z.fencing, zustand: "reserviert", grund: "uebernommen", versuche: 1 };
    },
    async verstehenModellstart() { z.zustand = "modell-laeuft"; return { verfuegbar: true, ok: true }; },
    async verstehenSchreibrecht() { return { verfuegbar: true, ok: true }; },
    async verstehenSpeichere() { z.zustand = "fertig"; return { verfuegbar: true, ergebnis: "gespeichert" }; },
    async verstehenAusgangUnbekannt() { z.zustand = "unbekannt"; return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" }; },
    async verstehenAbschluss() { return { verfuegbar: true, ok: true }; },
    async verstehenFreigabe() { return { ok: true }; },
    async verstehenFreigabeOhneAufruf() { return { ok: true }; },
    async verstehenVormerkungLese() { return { verfuegbar: true, eintraege: {} }; },
    async verstehenVormerkungErhoehe() { return { verfuegbar: true, fehlversuche: 1 }; },
    async verstehenVormerkungLoese() { return { verfuegbar: true, ok: true }; }
  };
}

function baueWelt(welt = {}) {
  const p = { aufrufe: 0, listWiederaufnahmen: 0, listPending: 0, bestand: 0, dokumente: 0, lock: 0, unlock: 0, enabled: 0, aiEnabled: 0 };
  const speicher = baueSpeicher();
  const deps = {
    // Dieselben vorgeschalteten Schutzschalter wie der regulaere Weg.
    enabled: () => { p.enabled += 1; if (welt.enabledWirft) throw new Error("lesefehler"); return welt.storeAus ? false : true; },
    aiEnabled: () => { p.aiEnabled += 1; if (welt.aiWirft) throw new Error("lesefehler"); return welt.kiAus ? false : true; },
    listWiederaufnahmen: async () => {
      p.listWiederaufnahmen += 1;
      if (welt.listeNichtLesbar) return { verfuegbar: false, grund: "supabase-timeout", vorgaenge: [] };
      return { verfuegbar: true, vorgaenge: welt.freigegeben === false ? [] : [VORGANG] };
    },
    // Existiert NUR, um zu beweisen, dass der Einzelweg ihn nie benutzt (Fall §4).
    listPending: async () => { p.listPending += 1; return welt.weiterePending || []; },
    getExistingStreng: async (id) => {
      p.bestand += 1;
      if (welt.bestandWirft) throw new Error("supabase-timeout");
      return welt.keinBestand ? null : { id: "ko-" + id, vorgang_id: id, status: "pending", understanding_status: "failed" };
    },
    getExisting: async () => null,
    listVorgangDocuments: async () => {
      p.dokumente += 1;
      if (welt.dokumenteWerfen) throw new Error("supabase-timeout");
      return welt.keineDokumente ? [] : [{ ...DOKUMENT }];
    },
    acquireLock: async () => { p.lock += 1; return { granted: welt.lockVerweigert ? false : true }; },
    releaseLock: async () => { p.unlock += 1; },
    verstehenVertrag: () => (welt.ohneCas ? null : vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })),
    canSpend: async () => ({ allowed: welt.budgetVerweigert ? false : true, reason: welt.budgetVerweigert ? "daily-llm-budget-reached" : null }),
    requestUnderstanding: async () => {
      p.aufrufe += 1;
      if (welt.antwort === "invalid") return { ...ANALYSE, ausschuesse: ["NichtBelegt_ausschuesse"] };
      // Reine SCHEMA-Ablehnung (Production-Befund 2026-09-24, Run 35987448290): das Pflichtfeld
      // `was_ist_passiert` bleibt leer. Vorher blieb `validierungsfehler` hier LEER — die Ursache
      // war unsichtbar. Jetzt traegt der Bericht einen wertfreien Feldpfad-Code.
      if (welt.antwort === "schema") return { ...ANALYSE, was_ist_passiert: "" };
      return { ...ANALYSE };
    },
    save: async () => ({ saved: true }),
    saveSources: async () => {},
    markFailed: async () => {},
    modelName: () => "gpt-5-mini",
    logSkip: () => {},
    gateMode: () => "off",
    readUpdateRetries: async () => ({}),
    writeUpdateRetries: async () => ({ saved: true })
  };
  return { deps, p };
}

const lauf = (welt, extra = {}) => {
  const { deps, p } = baueWelt(welt);
  return E.verstehenEinzelvorgang({ vorgangId: VORGANG, deps, ...extra }).then((r) => ({ r, p }));
};

async function main() {
  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§1  Keine vorgangId -> ehrliche Absage, 0 Modellaufrufe");
  {
    const { r, p } = await lauf({}, { vorgangId: "" });
    check("leere Kennung abgelehnt", r.ok === false && r.grund === "vorgang-id-fehlt-oder-ungueltig", JSON.stringify(r));
    check("kein Modellaufruf, kein Lock, keine Liste", p.aufrufe === 0 && p.lock === 0 && p.listWiederaufnahmen === 0);
    check("modellaufrufe in der Antwort 0", r.modellaufrufe === 0);
    const { r: r2 } = await lauf({}, { vorgangId: "fremd; DROP" });
    check("Fremdformat abgelehnt (kein PostgREST-Metazeichen)", r2.ok === false && r2.grund === "vorgang-id-fehlt-oder-ungueltig");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§2  Keine ausdrueckliche Wiederaufnahmefreigabe -> Absage, 0 Modellaufrufe");
  {
    const { r, p } = await lauf({ freigegeben: false });
    check("ohne Freigabe abgelehnt", r.ok === false && r.grund === "keine-wiederaufnahmefreigabe", JSON.stringify(r));
    check("kein Modellaufruf, kein Lock, kein Bestand gelesen", p.aufrufe === 0 && p.lock === 0 && p.bestand === 0);
    const { r: r2, p: p2 } = await lauf({ listeNichtLesbar: true });
    check("nicht lesbare Liste ist fail closed (nicht 'keine Freigabe')", r2.grund === "wiederaufnahmeliste-nicht-lesbar" && p2.aufrufe === 0);
    const { r: r3, p: p3 } = await lauf({ ohneCas: true });
    check("fehlender CAS-Vertrag ist fail closed", r3.grund === "verstehen-cas-erforderlich" && p3.aufrufe === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§3  Gueltig freigegebener Einzelvorgang -> genau dieser Vorgang, genau 1 Aufruf");
  {
    const { r, p } = await lauf({});
    check("Lauf erfolgreich und gespeichert", r.ok === true && r.status === "saved", JSON.stringify(r));
    check("genau der angeforderte Vorgang", r.vorgangId === VORGANG && r.wiederaufnahmeFreigabe === true);
    check("genau EIN Modellaufruf", p.aufrufe === 1 && r.modellaufrufe === 1);
    check("Dokumentzahl gemeldet", r.documents === 1);
    check("kein Rohfeld in der Antwort", !Object.keys(r).some((k) => /prompt|antwort|text|summary|title/i.test(k)), JSON.stringify(r));
    check("Lock genommen und wieder geloest", p.lock === 1 && p.unlock === 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§4  Weitere pending Wissensobjekte existieren -> sie werden NICHT verarbeitet");
  {
    const weitere = [{ id: "ko-vg-klose-20260608-ea4b07", vorgang_id: "vg-klose-20260608-ea4b07", status: "pending" },
      { id: "ko-vg-x", vorgang_id: "vg-x", status: "pending" }];
    const { r, p } = await lauf({ weiterePending: weitere });
    check("listPending wurde nie aufgerufen", p.listPending === 0);
    check("genau EIN Aufruf, nur fuer den Zielvorgang", p.aufrufe === 1 && r.vorgangId === VORGANG);
    check("Ergebnis betrifft nur die eine Kennung", r.status === "saved");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§5  Bestand nicht lesbar / kein Wissensobjekt -> fail closed, 0 Modellaufrufe");
  {
    const { r, p } = await lauf({ bestandWirft: true });
    check("Lesefehler des Bestands bricht ab", r.grund === "bestand-nicht-lesbar" && r.modellaufrufe === 0 && p.aufrufe === 0);
    const { r: r2, p: p2 } = await lauf({ keinBestand: true });
    check("ohne Wissensobjekt kein Erstverstehen auf blosser Kennung", r2.grund === "kein-wissensobjekt" && p2.aufrufe === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§6  Dokumente fehlen/nicht lesbar -> fail closed, 0 Modellaufrufe");
  {
    const { r, p } = await lauf({ keineDokumente: true });
    check("fehlende Dokumente abgelehnt", r.grund === "keine-dokumente" && r.modellaufrufe === 0 && p.aufrufe === 0);
    const { r: r2, p: p2 } = await lauf({ dokumenteWerfen: true });
    check("Dokumentlesefehler abgelehnt", r2.grund === "dokumente-nicht-lesbar" && p2.aufrufe === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§7  Lock verweigert -> 0 Modellaufrufe");
  {
    const { r, p } = await lauf({ lockVerweigert: true });
    check("verweigertes Lock bricht ab", r.grund === "understanding-bereits-aktiv" && p.aufrufe === 0 && r.modellaufrufe === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§8  Budget verweigert -> 0 Modellaufrufe");
  {
    const { r, p } = await lauf({ budgetVerweigert: true });
    check("Budget-Gate greift im unveraenderten Motor", r.ok === true && r.status === "skipped-budget", JSON.stringify(r));
    check("kein Modellaufruf bei verweigertem Budget", p.aufrufe === 0 && r.modellaufrufe === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§9  Validator lehnt ab -> sichere Fehlercodes, keine Rohantwort");
  {
    const { r, p } = await lauf({ antwort: "invalid" });
    check("Zustand skipped-invalid mit Fehlerklasse", r.ok === true && r.status === "skipped-invalid" && r.reason === "validierung-fehlgeschlagen", JSON.stringify(r));
    check("sicherer Fehlercode sichtbar", Array.isArray(r.validierungsfehler) && r.validierungsfehler.includes("quellenbeleg-ausschuesse"), JSON.stringify(r.validierungsfehler));
    check("hoechstens fuenf Codes", r.validierungsfehler.length <= 5);
    check("kein Rohwert der Modellantwort in der Antwort", !JSON.stringify(r).includes("NichtBelegt"));
    check("genau EIN Aufruf (der bezahlte Aufruf fand statt)", p.aufrufe === 1 && r.modellaufrufe === 1);
    // Reine Schema-Ablehnung liefert einen BRAUCHBAREN, wertfreien Fehlercode (Feldpfad), aber
    // garantiert keinen Rohmeldungs-/Antworttext (Diagnosewiederherstellung 2026-09-24).
    const { r: rS, p: pS } = await lauf({ antwort: "schema" });
    check("reine Schema-Ablehnung bleibt skipped-invalid mit Fehlerklasse",
      rS.status === "skipped-invalid" && rS.reason === "validierung-fehlgeschlagen", JSON.stringify(rS));
    check("wertfreier Schema-Code sichtbar (nur Feldpfad, kein Rohwert)",
      Array.isArray(rS.validierungsfehler) && rS.validierungsfehler.includes("schema-leer:was_ist_passiert"),
      JSON.stringify(rS.validierungsfehler));
    check("kein Rohmeldungstext und kein Rohwert in der Antwort",
      !JSON.stringify(rS).includes("leer/zu kurz") && !JSON.stringify(rS).includes("was_ist_passiert:"));
    check("genau EIN Aufruf auch im Schema-Fall", pS.aufrufe === 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§10 Admin-Schutz erhalten UND kein breiter Pending-Lauf im Weg");
  {
    const serverQuelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const start = serverQuelle.indexOf('\"/api/admin/recovery/run-one-understanding\"');
    check("Route existiert", start > -1);
    const block = start > -1 ? serverQuelle.slice(start, start + 1400) : "";
    check("POST + Admin-Rolle erzwungen", /request\.method === "POST"/.test(block) && block.includes('requireRoleOr403(response, authUser, "admin")'));
    check("ueber handleJson (CSRF-geschuetzter Weg wie die uebrigen Aktionen)", block.includes("handleJson("));
    check("der Block ruft NICHT runPendingUnderstandingShadow", !block.includes("runPendingUnderstandingShadow"));
    const modulQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/verstehen-einzelvorgang.js"), "utf8");
    const modulOhneKommentare = modulQuelle.replace(/^\s*\/\/.*$/gm, "");
    check("das Modul importiert den breiten Pending-Lauf nicht", !modulOhneKommentare.includes("runPendingUnderstandingShadow"));
    check("das Modul nutzt kein listPending", !/listPending\s*\(/.test(modulOhneKommentare));
    // Die sichere Fehlercode-Liste bleibt deckungsgleich mit der 169er-Diagnose (PR #522).
    const einmalig = fs.readFileSync(path.join(ROOT, "lib/helmut/verstehen-einmalig.js"), "utf8");
    check("Fehlercode-Liste identisch zur 169er-Diagnose", einmalig.includes(E.SICHERE_VALIDIERUNGSFEHLER.source));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§11  Vorgeschaltete Schutzschalter wie der regulaere Weg (enabled/aiEnabled)");
  {
    const { r, p } = await lauf({ storeAus: true });
    check("V3-Store aus -> ehrliche Absage v3-store-disabled", r.ok === false && r.grund === "v3-store-disabled", JSON.stringify(r));
    check("Store aus: 0 Aufrufe und 0 weitere Fachzugriffe",
      p.aufrufe === 0 && p.listWiederaufnahmen === 0 && p.bestand === 0 && p.dokumente === 0 && p.lock === 0, JSON.stringify(p));
    check("Store aus: Freigabe nicht verbraucht (keine Reservierung, keine Zustandsantwort)",
      r.modellaufrufe === 0 && r.wiederaufnahmeFreigabe === undefined);
    const { r: r2, p: p2 } = await lauf({ kiAus: true });
    check("KI aus -> ehrliche Absage ai-disabled", r2.ok === false && r2.grund === "ai-disabled", JSON.stringify(r2));
    check("KI aus: 0 Aufrufe und 0 weitere Fachzugriffe",
      p2.aufrufe === 0 && p2.listWiederaufnahmen === 0 && p2.bestand === 0 && p2.lock === 0, JSON.stringify(p2));
    check("KI aus: Freigabe nicht verbraucht", r2.modellaufrufe === 0 && r2.wiederaufnahmeFreigabe === undefined);
    const { r: r3, p: p3 } = await lauf({ enabledWirft: true });
    check("Fehler beim Lesen von enabled -> fail closed, 0 Aufrufe", r3.grund === "v3-store-nicht-pruefbar" && p3.aufrufe === 0);
    const { r: r4, p: p4 } = await lauf({ aiWirft: true });
    check("Fehler beim Lesen von aiEnabled -> fail closed, 0 Aufrufe", r4.grund === "ai-nicht-pruefbar" && p4.aufrufe === 0);
    check("Schalter werden VOR der Freigabe geprueft (Store aus liest die Liste nicht)", p.listWiederaufnahmen === 0 && p.enabled === 1);
  }

  console.log(`\nunderstanding-einzelvorgang-test: ${pass} von ${pass + fail} Pruefungen gruen.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
