"use strict";

// OP-25 — rein lesender Production-Nachweis des globalen Abrufpfads (K2.1), E3-Fassung.
// =============================================================================================
// WOZU: fuehrt den NEUEN OP-25-Production-Nachweis nach der (zukuenftigen, getrennt
// freigegebenen) Wiederaktivierung des globalen Abrufs. Der Vertrag selbst ist reine
// Logik in `lib/helmut/op25-nachweis.js` (testgesichert, mutationsgeprueft); dieses CLI
// liest ausschliesslich Production-Daten und die wirksame Cron-Konfiguration und gibt
// einen ehrlichen Bericht mit vier Ausgaengen aus.
//
// AUSGAENGE / EXIT-CODES:
//   0 bestanden · 1 nicht_bestanden · 2 blockiert · 3 noch_nicht_auswertbar
//   (Lese-/Parameterfehler enden als 2 — fail closed, nie als Erfolg.)
//
// ── SCHREIBSCHUTZ (technisch, nicht nur zugesagt; Muster punkt25b) ───────────────────────────
// 1. GENAU EINE HTTP-Funktion (`holen`). Ihre Methode ist die Konstante HTTP_METHODE —
//    ein GET-Literal ohne Parameter. Eine Schreiboperation ist strukturell nicht
//    erreichbar, nicht bloss nicht aufgerufen.
// 2. Jeder Pfad laeuft durch `pfadErlaubt()`: nur `/rest/v1/<tabelle>` aus einer festen
//    Allowlist. `/rest/v1/rpc/...` ist gesperrt (eine Datenbankfunktion koennte auch per
//    GET schreiben). Fail closed.
// 3. `lib/helmut/storage.js` wird NICHT geladen — kein Schreibpfad im Prozess. Es gibt
//    keinen Cron-Trigger, keinen Pipeline-Aufruf, keine Flag-/Env-Aenderung, 0 KI-Aufrufe.
// 4. Ausgegeben werden ausschliesslich technische Kennungen (Mandats-Slugs, Laufkennungen),
//    Zaehler und Zeitstempel — keine Profilinhalte, keine Dokumenttexte, keine Secrets.
//
// ── BEOBACHTUNGSFENSTER ──────────────────────────────────────────────────────────────────────
// Das Fenster ist EXPLIZIT (Start/Ende) und beginnt erst nach der erneuten Aktivierung
// des globalen Abrufs (Betreiberaktion). Laeufe vor dem 2026-08-04 — insbesondere der
// gescheiterte Lauf vom 2026-08-03 — koennen NIE in den Nachweis einfliessen (harte
// Untergrenze im Bewertungskern). Ein Fenster unter 24 vollstaendig vergangenen Stunden
// wird nie gruen.
//
// Aufruf (Beispiele):
//   node scripts/op25-production-nachweis.js                      # Dry-Run: ehrlicher Zustand heute
//   node scripts/op25-production-nachweis.js --baseline           # rein lesende Baseline
//   node scripts/op25-production-nachweis.js \
//     --aktivierung 2026-08-10T12:00:00Z \
//     --fenster-start 2026-08-10T12:00:00Z --fenster-ende 2026-08-11T12:00:00Z

const https = require("https");
const fs = require("fs");
const path = require("path");
const vertrag = require("../lib/helmut/op25-nachweis");

const HTTP_METHODE = "GET"; // Literal, nicht konfigurierbar
const ERLAUBTE_TABELLEN = Object.freeze([
  "helmut_store", "process_runs", "knowledge_objects", "retrieval_paths"
]);

// Heute dokumentierter Bestand (Baseline-Querschnitt 2026-08-04): fuenf aktive reale
// Mandate. KEINE Namensliste — die Menge selbst wird IMMER dynamisch gelesen; die Zahl
// ist nur eine Gegenprobe und per --erwartete-mandate ueberschreibbar. Die alte
// Sechs-Mandate-Erwartung ist damit ausdruecklich ausser Kraft.
const DOKUMENTIERTE_ERWARTETE_MANDATE = 5;

// Dokumentierter LLM-Kostenrahmen je 24-h-Fenster (USD). HERLEITUNG (Baseline
// 2026-08-04, rein lesend erhoben): gemessene 24-h-Kosten des Altpfads 0,20 USD
// (BERECHNETER Schaetzwert — llmPriceProvenance) × Faktor 10 als bewusster Puffer
// fuer den aktivierten globalen Pfad (mehr Verstehensarbeit ist dort beabsichtigt).
// Hart gedeckelt bleibt ohnehin HELMUT_MAX_LLM_CALLS_PER_DAY (Production: 100/Tag,
// fail-closed Fallback 50). Ueberschreibbar per --kostenrahmen-usd bzw.
// HELMUT_OP25_KOSTENRAHMEN_USD; ohne belastbaren Rahmen bleibt der Nachweis `blockiert`.
const DOKUMENTIERTER_KOSTENRAHMEN_USD = Number(process.env.HELMUT_OP25_KOSTENRAHMEN_USD || 2);

function pfadErlaubt(pfad) {
  if (typeof pfad !== "string" || !pfad.startsWith("/rest/v1/")) return false;
  if (pfad.includes("..") || pfad.includes("//", 1)) return false;
  return ERLAUBTE_TABELLEN.includes(pfad.slice("/rest/v1/".length).split("?")[0]);
}

function holen(pfad) {
  if (!pfadErlaubt(pfad)) {
    return Promise.reject(new Error(`[SCHREIBSCHUTZ] Pfad nicht erlaubt: ${pfad}`));
  }
  const basis = process.env.SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis || !schluessel) {
    return Promise.reject(new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus process.env, CLAUDE.md §4.9)"));
  }
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = https.request(new URL(basis + pfad), {
      method: HTTP_METHODE,
      headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/json" }
    }, (antwort) => {
      let text = "";
      antwort.on("data", (teil) => { text += teil; });
      antwort.on("end", () => {
        if (antwort.statusCode >= 400) return ablehnen(new Error(`HTTP ${antwort.statusCode}: ${text.slice(0, 200)}`));
        try { erfuellen(JSON.parse(text)); } catch (fehler) { ablehnen(fehler); }
      });
    });
    anfrage.on("error", ablehnen);
    anfrage.end();
  });
}

// --- Argumente -------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const name = a.slice(2);
    const naechstes = argv[i + 1];
    if (naechstes != null && !naechstes.startsWith("--")) { args[name] = naechstes; i += 1; }
    else args[name] = true;
  }
  return args;
}

function parseIsoMs(wert, name) {
  if (wert == null || wert === true) return null;
  const ms = Date.parse(String(wert));
  if (!Number.isFinite(ms)) throw new Error(`Parameter ${name}: kein gueltiger Zeitstempel: ${wert}`);
  return ms;
}

// --- Datenzugriffe (alle rein lesend) --------------------------------------------------------

const STORE_ID = process.env.HELMUT_SUPABASE_STORE_ID || "main";
const AUTH_STORE_ID = process.env.HELMUT_SUPABASE_AUTH_STORE_ID || `${STORE_ID}-auth`;

async function leseStoreZeile(id) {
  const rows = await holen(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(id)}&select=data`);
  return Array.isArray(rows) && rows[0] ? rows[0].data : null;
}

function istAktivesMandat(profil) {
  if (!profil || typeof profil !== "object") return false;
  if (profil.profileActive === false || profil.aktiv === false) return false;
  if (profil.deletedAt || profil.geloescht_at || profil.deleted_at) return false;
  return true;
}

function leseCrons() {
  const datei = path.join(__dirname, "..", "vercel.json");
  const inhalt = JSON.parse(fs.readFileSync(datei, "utf8"));
  return Array.isArray(inhalt.crons) ? inhalt.crons : [];
}

function kostenImFenster(llmUsage, vonMs, bisMs) {
  let summe = 0;
  for (const u of Array.isArray(llmUsage) ? llmUsage : []) {
    const t = Date.parse((u && u.createdAt) || "");
    if (!Number.isFinite(t) || t < vonMs || t >= bisMs) continue;
    const kosten = Number(u.estimatedCost ?? u.costUsd ?? u.cost);
    if (Number.isFinite(kosten)) summe += kosten;
  }
  return Math.round(summe * 10000) / 10000;
}

const zeit = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

// --- Baseline (rein lesend, PII-frei) --------------------------------------------------------

async function erhebeBaseline({ mainStore, authStore, fairnessStore }) {
  const profile = Object.values((mainStore && mainStore.profiles) || {});
  const aktive = profile.filter(istAktivesMandat).map((p) => String(p.id)).sort();
  const inaktive = profile.filter((p) => !istAktivesMandat(p)).map((p) => String(p.id)).sort();
  const testmandate = profile.filter((p) => /^test-mdb-/.test(String(p && p.id)));

  const laeufe = Array.isArray(mainStore && mainStore.crawlRuns) ? mainStore.crawlRuns : [];
  const nachModus = {};
  for (const r of laeufe) nachModus[r.mode || "unbekannt"] = (nachModus[r.mode || "unbekannt"] || 0) + 1;
  const juengsterGlobal = laeufe.find((r) => r && r.mode === "global") || null;

  let prozessZeilen = [];
  try {
    prozessZeilen = await holen("/rest/v1/process_runs?select=run_id,process,status,mode,created_at,commit_ref&order=created_at.desc&limit=50");
  } catch (fehler) {
    prozessZeilen = [{ leseFehler: String(fehler.message || fehler).slice(0, 120) }];
  }
  let pendingKos = null;
  try {
    const rows = await holen("/rest/v1/knowledge_objects?select=id&status=eq.pending&limit=10000");
    pendingKos = Array.isArray(rows) ? rows.length : null;
  } catch (_) { pendingKos = null; }
  let abrufwege = null;
  try {
    const rows = await holen("/rest/v1/retrieval_paths?select=status&limit=10000");
    if (Array.isArray(rows)) {
      abrufwege = { gesamt: rows.length };
      for (const r of rows) abrufwege[r.status || "unbekannt"] = (abrufwege[r.status || "unbekannt"] || 0) + 1;
    }
  } catch (_) { abrufwege = null; }

  const heuteVorMs = Date.now() - 24 * 60 * 60 * 1000;
  const kosten24h = kostenImFenster((authStore && authStore.llmUsage) || [], heuteVorMs, Date.now());
  const systemFehler = ((authStore && authStore.systemErrors) || []).slice(0, 200);
  const fehlerklassenBeobachtet = [...new Set(systemFehler.map((e) => String((e && e.scope) || "unbekannt")))].sort();

  const fairnessLaeufe = (fairnessStore && fairnessStore.laeufe) || {};
  const commit = (prozessZeilen.find((z) => z && z.commit_ref) || {}).commit_ref || null;

  return {
    erhobenAt: new Date().toISOString(),
    deploymentCommit: commit,
    mandate: { gesamt: profile.length, aktiv: aktive, inaktiv: inaktive, testmandateInProduction: testmandate.length },
    cronKadenz: vertrag.schwereKadenz(leseCrons()).map((k) => `${k.cronName}: ${k.schedule}`),
    laufdatensaetze: { retention: laeufe.length, nachModus, juengsterGlobalerLauf: juengsterGlobal ? juengsterGlobal.runId : null },
    globalabrufBeleg: juengsterGlobal
      ? `letzter mode=global-Lauf: ${juengsterGlobal.runId} (${juengsterGlobal.createdAt})`
      : "kein mode=global-Laufdatensatz im Blob-Fenster — globaler Abruf nicht aktiv oder Retention ueberschritten",
    pendingWissensobjekte: pendingKos,
    abrufwege,
    llmKosten24hUsd: kosten24h,
    kostenrahmenUsd: DOKUMENTIERTER_KOSTENRAHMEN_USD,
    systemfehlerScopes: fehlerklassenBeobachtet,
    bekannteFehlerklassen: vertrag.BEKANNTE_FEHLERKLASSEN,
    fairness: Object.fromEntries(Object.entries(fairnessLaeufe).map(([cron, l]) => [cron, {
      laufId: l && l.laufId, status: l && l.status, standAt: l && l.standAt
    }]))
  };
}

// --- Hauptprogramm ---------------------------------------------------------------------------

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const jetztMs = Date.now();

  console.log("OP-25 — rein lesender Production-Nachweis (E3-Fassung, 2026-08-04)");
  console.log("=".repeat(78));
  console.log("Schreibschutz: GET-Literal + Tabellen-Allowlist; storage.js nicht geladen;");
  console.log("kein Cron-Trigger, keine Flag-/Env-Aenderung, 0 KI-Aufrufe.");
  console.log(`Messzeitpunkt: ${new Date(jetztMs).toISOString()}\n`);

  const mainStore = await leseStoreZeile(STORE_ID);
  const authStore = await leseStoreZeile(AUTH_STORE_ID);
  const fairnessStore = await leseStoreZeile(`${STORE_ID}-cron-fairness`);

  if (args.baseline) {
    const baseline = await erhebeBaseline({ mainStore, authStore, fairnessStore });
    console.log("== BASELINE (rein lesend, PII-frei) ==");
    console.log(JSON.stringify(baseline, null, 2));
    process.exit(0);
  }

  const aktivierungAtMs = parseIsoMs(args.aktivierung ?? process.env.HELMUT_OP25_AKTIVIERUNG_AT, "--aktivierung");
  const fensterStartMs = parseIsoMs(args["fenster-start"], "--fenster-start") ?? aktivierungAtMs;
  const fensterEndeMs = parseIsoMs(args["fenster-ende"], "--fenster-ende")
    ?? (fensterStartMs != null ? fensterStartMs + vertrag.MIN_FENSTER_MS : null);

  const profile = Object.values((mainStore && mainStore.profiles) || {});
  const aktiveMandate = mainStore ? profile.filter(istAktivesMandat).map((p) => String(p.id)).sort() : null;
  const laeufe = mainStore && Array.isArray(mainStore.crawlRuns) ? mainStore.crawlRuns : null;
  const fairnessLaeufe = (fairnessStore && fairnessStore.laeufe) || null;

  const kostenrahmenUsd = args["kostenrahmen-usd"] != null
    ? Number(args["kostenrahmen-usd"])
    : DOKUMENTIERTER_KOSTENRAHMEN_USD;
  const kosten = (fensterStartMs != null && fensterEndeMs != null && authStore)
    ? { fensterUsd: kostenImFenster(authStore.llmUsage || [], fensterStartMs, fensterEndeMs), rahmenUsd: kostenrahmenUsd }
    : null;

  const bewertung = vertrag.bewerteNachweisfenster({
    jetztMs,
    fenster: (fensterStartMs != null && fensterEndeMs != null) ? { vonMs: fensterStartMs, bisMs: fensterEndeMs } : null,
    aktivierungAtMs,
    crons: leseCrons(),
    laeufe,
    aktiveMandate,
    erwarteteMandatszahl: args["erwartete-mandate"] != null
      ? Number(args["erwartete-mandate"])
      : DOKUMENTIERTE_ERWARTETE_MANDATE,
    kosten,
    kontextErklaerungen: args["kontext-erklaerung"] ? { "*": String(args["kontext-erklaerung"]) } : {},
    fairnessLaeufe
  });

  console.log("== EINGABEN (rein lesend) ==");
  console.log(`aktive Mandate (dynamisch): ${aktiveMandate ? `${aktiveMandate.length} (${aktiveMandate.join(", ")})` : "NICHT LESBAR"}`);
  console.log(`Laufdatensaetze im Blob: ${laeufe ? laeufe.length : "NICHT LESBAR"}`);
  console.log(`Aktivierung: ${zeit(aktivierungAtMs)} · Fenster: ${zeit(fensterStartMs)} → ${zeit(fensterEndeMs)}`);
  console.log(`Kosten im Fenster: ${kosten ? `${kosten.fensterUsd} USD (Rahmen ${kosten.rahmenUsd} USD)` : "—"}\n`);

  console.log("== BEWERTUNG JE ERWARTETEM LAUF ==");
  if (!bewertung.laeufe.length) console.log("(keine Laufbewertung — Fenster-/Eingabepruefung hat vorher geendet)");
  for (const l of bewertung.laeufe) {
    console.log(`  ${l.slot} → ${l.einstufung}${l.status ? ` (datenstand=${l.status})` : ""}`);
    for (const b of l.befunde) console.log(`      [${b.schwere}] ${b.grund}${b.detail ? ` — ${b.detail}` : ""}`);
  }
  if (bewertung.ausgeschlossen.length) {
    console.log("\n== AUSGESCHLOSSENE LAEUFE (mit Grund gezaehlt) ==");
    for (const a of bewertung.ausgeschlossen) console.log(`  ${a.runId}: ${a.grund}`);
  }
  if (bewertung.warnungen.length) {
    console.log("\n== WARNUNGEN ==");
    for (const w of bewertung.warnungen) console.log(`  ${w}`);
  }
  console.log("\n== BEFUNDE ==");
  if (!bewertung.befunde.length) console.log("  (keine)");
  for (const b of bewertung.befunde) console.log(`  [${b.schwere}] ${b.grund}${b.detail ? ` — ${b.detail}` : ""}`);

  console.log(`\n== ERGEBNIS: ${bewertung.ausgang.toUpperCase()} (Exit ${bewertung.exitCode}) ==`);
  console.log("Ausschliesslich lesende Zugriffe (GET), 0 KI-Aufrufe, 0,00 USD, kein Trigger.\n");
  // Maschinenlesbare Zusammenfassung (eine Zeile, stabiles Praefix):
  console.log(`[op25-nachweis/json] ${JSON.stringify({
    ausgang: bewertung.ausgang,
    exitCode: bewertung.exitCode,
    fenster: { von: zeit(fensterStartMs), bis: zeit(fensterEndeMs) },
    aktiveMandate: aktiveMandate || null,
    befunde: bewertung.befunde.map((b) => ({ schwere: b.schwere, grund: b.grund })),
    warnungen: bewertung.warnungen.length,
    ausgeschlossen: bewertung.ausgeschlossen.length
  })}`);
  process.exit(bewertung.exitCode);
})().catch((fehler) => {
  console.error("MESSFEHLER (fail closed => blockiert):", (fehler && fehler.message) || fehler);
  console.log(`[op25-nachweis/json] ${JSON.stringify({ ausgang: "blockiert", exitCode: 2, messfehler: String((fehler && fehler.message) || fehler).slice(0, 200) })}`);
  process.exit(2);
});
