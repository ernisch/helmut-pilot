"use strict";

// Helmut — Fail-closed-Gate fuer Production-SCHREIBlaeufe (Hotfix B4-3, Phase 6).
// =============================================================================
// REINE LOGIK: kein Netz, keine DB, keine Uhr. Die Umgebung kommt als Parameter
// herein, damit jede Konstellation offline testbar ist.
//
// DER PRODUCTION-BEFUND, DEN DIESES MODUL SCHLIESST (2026-07-27):
// Beim CSD-Nachweislauf wurden Fachtabellen (`knowledge_objects`,
// `ko_document_links`) nach Production geschrieben, waehrend LLM-Budget,
// LLM-Nutzungslog und Lauftelemetrie im LOKALEN Dateispeicher landeten. Der Lauf
// sah erfolgreich aus, war aber in zwei Haelften zerrissen.
//
// URSACHE — zwei UNABHAENGIGE Schalter, die niemand gegeneinander geprueft hat:
//   * Fachtabellen   `v3StoreReady()`  = HELMUT_V3_STORE=1 + SUPABASE_URL + Key
//   * Betriebsdaten  `useSupabase()`   = HELMUT_STORAGE_BACKEND=supabase
//                                        + SUPABASE_URL + Key
// `HELMUT_V3_STORE=1` allein genuegt also, um in Production zu SCHREIBEN — aber
// nicht, um die Kosten dieses Schreibens zu zaehlen. Beide Wege lesen dieselben
// Zugangsdaten, hoeren aber auf verschiedene Schalter.
//
// WARUM DAS MEHR IST ALS EIN TELEMETRIEVERLUST — das eigentliche Risiko:
// Das LLM-Tagesbudget wird aus dem BETRIEBSSPEICHER geseedet. Faellt der auf den
// lokalen Dateispeicher zurueck, startet der Zaehler eines Production-Laufs bei
// NULL. Der Kostendeckel (Tageslimit 100 + Reserve 30, fail-closed) ist damit
// wirkungslos, und die verbrauchten Aufrufe fehlen anschliessend in der
// Production-Bilanz. Ein Lauf ohne dieses Gate kann also mehr Geld ausgeben, als
// der Betreiber freigegeben hat, ohne dass es irgendwo auffaellt.
//
// REGEL: Ein Production-Schreiblauf bricht VOR dem ersten fachlichen oder
// KI-Schreibzugriff ab, wenn nicht beweisbar beide Haelften auf dasselbe
// Production-Backend zeigen. Read-only-Vorschauen sind davon nicht betroffen —
// sie brauchen nur Lesezugriff und schreiben nichts.
//
// KEIN stiller Fallback: es gibt bewusst KEINE Option, das Gate zu uebergehen.

// Beide Schalter benutzen dieselbe Wahrheitsschreibweise wie storage.js.
function istFlagAn(wert) {
  return ["1", "true", "on", "yes"].includes(String(wert || "").trim().toLowerCase());
}

// Dieselbe Reihenfolge wie storage.supabaseServiceRoleKey() — sonst wuerde das
// Gate einen Lauf ablehnen, den der Speicher anschliessend akzeptiert hat.
function serviceRoleKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || "";
}

// Namen ausschliesslich zur Fehlermeldung — NIE Werte. Secrets gehoeren weder in
// Logs noch in Repos (CLAUDE.md §4.7/§4.9).
const VARIABLEN = {
  url: "SUPABASE_URL",
  key: "SUPABASE_SERVICE_ROLE_KEY",
  v3: "HELMUT_V3_STORE",
  backend: "HELMUT_STORAGE_BACKEND"
};

// Prueft die Umgebung eines Production-Schreiblaufs.
// Rueckgabe ist immer vollstaendig — auch im Fehlerfall — damit der Aufrufer
// genau benennen kann, welche Variable fehlt oder widerspruechlich ist.
function pruefeSchreibgate(env = process.env, { zweck = "Production-Schreiblauf" } = {}) {
  const e = env || {};
  const urlGesetzt = Boolean(e.SUPABASE_URL);
  const keyGesetzt = Boolean(serviceRoleKey(e));
  const backendRoh = String(e.HELMUT_STORAGE_BACKEND || "").trim();
  const backend = backendRoh.toLowerCase();
  const v3Flag = istFlagAn(e.HELMUT_V3_STORE);

  // Exakt die beiden Bedingungen aus storage.js nachgebildet.
  const fachtabellenAufSupabase = v3Flag && urlGesetzt && keyGesetzt;
  const betriebsdatenAufSupabase = backend === "supabase" && urlGesetzt && keyGesetzt;

  const fehler = [];
  if (!urlGesetzt) {
    fehler.push({
      variable: VARIABLEN.url,
      problem: "fehlt",
      wirkung: "Ohne Adresse der Production-Datenbank ist kein Schreibzugriff moeglich."
    });
  }
  if (!keyGesetzt) {
    fehler.push({
      variable: VARIABLEN.key,
      problem: "fehlt",
      wirkung: "Ohne Service-Role-Schluessel ist kein Schreibzugriff moeglich."
    });
  }
  if (!v3Flag) {
    fehler.push({
      variable: VARIABLEN.v3,
      problem: `fehlt oder steht auf "${String(e.HELMUT_V3_STORE || "")}"`,
      wirkung: "Die Fachtabellen (knowledge_objects, ko_document_links) waeren inert — "
        + "der Lauf wuerde fachlich nichts schreiben und trotzdem KI-Kosten erzeugen."
    });
  }
  if (backend !== "supabase") {
    fehler.push({
      variable: VARIABLEN.backend,
      problem: backendRoh ? `steht auf "${backendRoh}" statt "supabase"` : "fehlt",
      wirkung: "LLM-Tagesbudget, LLM-Nutzungslog und Lauftelemetrie wuerden LOKAL landen. "
        + "Der Kostendeckel startet dann bei 0 statt beim echten Tagesstand, und der Lauf "
        + "erscheint in keiner Production-Bilanz."
    });
  }

  // Der eigentliche Befund vom 2026-07-27: die beiden Haelften zeigen auseinander.
  // Er wird eigens benannt, weil die Einzelmeldungen oben ihn nicht erklaeren.
  const widerspruch = fachtabellenAufSupabase !== betriebsdatenAufSupabase;
  if (widerspruch) {
    fehler.push({
      variable: fachtabellenAufSupabase ? VARIABLEN.backend : VARIABLEN.v3,
      problem: "widerspruechlich",
      wirkung: fachtabellenAufSupabase
        ? "Fachschreibvorgaenge gehen nach Production, Kosten und Telemetrie bleiben lokal. "
          + "Genau diese Konstellation hat den CSD-Nachweislauf unbrauchbar gemacht."
        : "Kosten und Telemetrie gehen nach Production, die Fachtabellen bleiben inert."
    });
  }

  const ok = fehler.length === 0;
  const zeilen = [];
  if (!ok) {
    zeilen.push(`ABBRUCH: ${zweck} — Speicher- und Telemetrieziel sind nicht beweisbar dasselbe Production-Backend.`);
    for (const f of fehler) zeilen.push(`  * ${f.variable}: ${f.problem}\n      ${f.wirkung}`);
    zeilen.push("");
    zeilen.push("Erforderlich sind ALLE vier Variablen gleichzeitig:");
    zeilen.push(`  ${VARIABLEN.url}, ${VARIABLEN.key}, ${VARIABLEN.v3}=1, ${VARIABLEN.backend}=supabase`);
    zeilen.push("In einer Claude-Code-Cloud-Sitzung ausschliesslich ueber die Environment-Einstellungen");
    zeilen.push("setzen — nie im Chat, nie im Commit (CLAUDE.md §4.9).");
    zeilen.push("Read-only-Vorschauen laufen unveraendert ohne diese Anforderung.");
  }

  return {
    ok,
    zweck,
    fachtabellenAufSupabase,
    betriebsdatenAufSupabase,
    widerspruch,
    backend: backend || null,
    v3Aktiv: v3Flag,
    zugangsdatenVollstaendig: urlGesetzt && keyGesetzt,
    fehler,
    fehlendeVariablen: [...new Set(fehler.map((f) => f.variable))],
    meldung: zeilen.join("\n")
  };
}

// Bequemer Aufrufer fuer Skripte: prueft und beendet den Prozess fail-closed.
// Bewusst KEIN throw — ein Skript soll mit einem eindeutigen Exit-Code abbrechen,
// nicht mit einem Stacktrace, den ein Betreiber erst deuten muss.
function erzwingeSchreibgate(env = process.env, { zweck, exitCode = 6, log = console.error, exit = process.exit } = {}) {
  const ergebnis = pruefeSchreibgate(env, { zweck });
  if (!ergebnis.ok) {
    log(`\n${ergebnis.meldung}\n`);
    exit(exitCode);
  }
  return ergebnis;
}

module.exports = { pruefeSchreibgate, erzwingeSchreibgate, istFlagAn, VARIABLEN };
