#!/usr/bin/env node
"use strict";

// Betriebsnachweis Kostenmessung (Phase-1-Punkt 17) — AUSSCHLIESSLICH LESEND.
//
// Beantwortet mit echten Betriebsdaten:
//   Was kostet ein einzelner Lauf?  Was kostet ein Betriebstag?
//   Welche Pipeline-Schritte und Modelle treiben die Kosten?
//   Welche Kosten sind global, welche direkt einem Mandanten zurechenbar?
//   Wo fehlen Messwerte, und wie gross ist die Luecke?
//
// Dieses Skript SCHREIBT NICHTS. Es fuehrt ausschliesslich Lesezugriffe aus
// (GET auf die REST-API bzw. Lesen einer Fixture-Datei). Es aktiviert nichts,
// aendert keine Quelle, kein Paket, kein Flag und keinen Zaehler.
//
// AUFRUF
//   node scripts/kostenmessung-nachweis.js                 (live, read-only)
//   node scripts/kostenmessung-nachweis.js --tage=7
//   node scripts/kostenmessung-nachweis.js --laeufe=10
//   node scripts/kostenmessung-nachweis.js --json
//   node scripts/kostenmessung-nachweis.js --fixture=<pfad.json>   (ohne Netz)
//
// SECRETS (CLAUDE.md §4.9): ausschliesslich aus process.env, kein eigenes Parsen
// einer .env.local. Live-Modus braucht SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.
// In einer Cloud-Sitzung kommen sie ueber die Claude-Code-Environment-
// Einstellungen. Fehlen sie, bricht das Skript VOR jedem Netzzugriff ab (Exit 2)
// und nennt den Fixture-Weg. Es wird nie ein Secret ausgegeben.
//
// DATENSCHUTZ: Der Bericht nennt Mandanten nur als gekuerzte Kennung
// (--klartext-mandant hebt das bewusst auf). Prompts, Antworten und
// Dokumentinhalte werden nirgends gelesen — llmUsage enthaelt sie ohnehin nicht.

const fs = require("fs");
const https = require("https");
const path = require("path");
const costModel = require("../lib/helmut/cost-model");

// ── Argumente ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
}
const OPT = {
  tage: Math.max(1, Number(arg("tage", 7)) || 7),
  laeufe: Math.max(1, Number(arg("laeufe", 8)) || 8),
  json: Boolean(arg("json", false)),
  fixture: arg("fixture", null),
  klartextMandant: Boolean(arg("klartext-mandant", false))
};

function fail(msg, code = 1) {
  console.error(`\nABBRUCH: ${msg}\n`);
  process.exit(code);
}

// ── Lesezugriff ──────────────────────────────────────────────────────────────
// Genau EINE Stelle mit Netzzugriff, und sie kann ausschliesslich GET.
function supabaseGet(pfad) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/rest/v1/${pfad}`);
    const req = https.request(
      { method: "GET", hostname: url.hostname, path: `${url.pathname}${url.search}`,
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, timeout: 20000 },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} bei ${url.pathname}`));
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`Antwort nicht lesbar: ${e.message}`)); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Zeitueberschreitung")));
    req.on("error", reject);
    req.end();
  });
}

async function ladeDaten() {
  if (OPT.fixture) {
    const p = path.resolve(String(OPT.fixture));
    if (!fs.existsSync(p)) fail(`Fixture nicht gefunden: ${p}`, 2);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      quelle: `Fixture ${path.basename(p)}`,
      live: false,
      llmUsage: raw.llmUsage || [],
      processRuns: raw.processRuns || [],
      budgetCounters: raw.budgetCounters || [],
      crawlTelemetrie: raw.crawlTelemetrie || []
    };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail(
      "SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY sind in dieser Umgebung nicht gesetzt.\n" +
      "        Es wurde KEIN Netzzugriff versucht.\n" +
      "        Lokal: Variablen in der Shell setzen. Cloud-Sitzung: Claude-Code-Environment-Einstellungen.\n" +
      "        Ohne Production-Zugang: --fixture=<pfad.json> (siehe docs/betrieb/kostenmessung.md §5).",
      2
    );
  }
  const [store, counters, telemetrie] = await Promise.all([
    supabaseGet("helmut_store?id=eq.main-auth&select=data"),
    supabaseGet("llm_budget_counters?select=day,scope,used&order=day.desc&limit=60"),
    supabaseGet(`source_crawl_telemetry?select=run_id,started_at,finished_at,status,found_documents,new_documents,duplicate_documents,ignored_documents,retry_count,duration_ms&order=started_at.desc&limit=4000`)
  ]);
  const data = (store && store[0] && store[0].data) || {};
  return {
    quelle: "Production (read-only)",
    live: true,
    llmUsage: Array.isArray(data.llmUsage) ? data.llmUsage : [],
    processRuns: Array.isArray(data.processRuns) ? data.processRuns : [],
    budgetCounters: Array.isArray(counters) ? counters : [],
    crawlTelemetrie: Array.isArray(telemetrie) ? telemetrie : []
  };
}

// ── Hilfen ───────────────────────────────────────────────────────────────────
const ms = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; };
const tag = (v) => String(v || "").slice(0, 10);
const usd = (n) => `${Number(n).toFixed(4)} USD`;
const pseudonym = (id) => {
  if (!id) return "(ohne Mandant)";
  if (OPT.klartextMandant) return id;
  const s = String(id);
  return s.length <= 4 ? `${s.slice(0, 1)}***` : `${s.slice(0, 3)}***${s.slice(-1)}`;
};

function tabelle(zeilen) {
  if (!zeilen.length) return "  (keine)";
  const spalten = Object.keys(zeilen[0]);
  const breite = spalten.map((s) => Math.max(s.length, ...zeilen.map((z) => String(z[s] ?? "").length)));
  const zeile = (werte) => "  " + werte.map((w, i) => String(w ?? "").padEnd(breite[i])).join("  ");
  return [zeile(spalten), "  " + breite.map((b) => "-".repeat(b)).join("  "), ...zeilen.map((z) => zeile(spalten.map((s) => z[s])))].join("\n");
}

function summeZeile(s) {
  return {
    Aufrufe: s.aufrufe,
    gemessen: s.gemessen,
    "Kosten unbek.": s.kostenUnbekannt,
    "kein Aufruf": s.keinProvideraufruf,
    "Input-Tok": s.inputTokens,
    "Output-Tok": s.outputTokens,
    "Kosten USD": s.kostenUsd.toFixed(6)
  };
}

// ── Hauptlauf ────────────────────────────────────────────────────────────────
(async () => {
  const daten = await ladeDaten();
  const { llmUsage, processRuns, budgetCounters, crawlTelemetrie } = daten;

  // Preisbasis: bewusst ueber storage, damit Skript und Laufzeit dieselbe
  // Herkunftsaussage treffen.
  let preisbasis;
  try { preisbasis = require("../lib/helmut/storage").llmPriceProvenance(); }
  catch (_) { preisbasis = { waehrung: "USD", herkunft: "unbekannt", hinweis: "Preisbasis nicht ermittelbar" }; }

  // ── 1) Tagesaggregation ────────────────────────────────────────────────────
  const tage = [...new Set(llmUsage.map((e) => tag(e && e.createdAt)).filter(Boolean))].sort().reverse().slice(0, OPT.tage);
  const zaehlerJeTag = new Map(budgetCounters.filter((c) => c.scope === "global").map((c) => [c.day, c.used]));
  const tagesberichte = tage.map((t) => {
    const agg = costModel.aggregiere(llmUsage.filter((e) => tag(e && e.createdAt) === t));
    return { tag: t, agg, abgleich: costModel.abgleichReservierung(zaehlerJeTag.get(t), agg.gesamt) };
  });

  // ── 2) Laufaggregation ─────────────────────────────────────────────────────
  const crawlJeLauf = new Map();
  for (const r of crawlTelemetrie) {
    const id = r && r.run_id; if (!id) continue;
    const c = crawlJeLauf.get(id) || { abrufwege: 0, ok: 0, gefunden: 0, neu: 0, dubletten: 0, verworfen: 0, retries: 0 };
    c.abrufwege += 1;
    if (r.status === "ok") c.ok += 1;
    c.gefunden += Number(r.found_documents) || 0;
    c.neu += Number(r.new_documents) || 0;
    c.dubletten += Number(r.duplicate_documents) || 0;
    c.verworfen += Number(r.ignored_documents) || 0;
    c.retries += Number(r.retry_count) || 0;
    crawlJeLauf.set(id, c);
  }

  const zugeordnet = new Set();
  const laufberichte = processRuns.slice(0, OPT.laeufe).map((run) => {
    const runId = run && run.runId ? String(run.runId) : null;
    const perRunId = runId ? llmUsage.filter((e) => e && e.runId === runId) : [];
    const start = ms(run && run.startedAt), ende = ms(run && run.finishedAt);
    const weg = perRunId.length ? "laufkennung" : "zeitfenster";
    const treffer = perRunId.length
      ? perRunId
      : (start != null && ende != null ? llmUsage.filter((e) => { const t = ms(e && e.createdAt); return t != null && t >= start && t <= ende; }) : []);
    for (const e of treffer) if (e && e.id) zugeordnet.add(String(e.id));
    return {
      runId, lauftyp: (run && run.process) || null, start: (run && run.startedAt) || null,
      dauerMs: Number(run && run.durationMs) || null, verarbeitet: Number(run && run.processed) || 0,
      status: (run && run.status) || null, zuordnungsweg: weg,
      crawl: crawlJeLauf.get(runId) || null, agg: costModel.aggregiere(treffer)
    };
  });

  const fensterStart = laufberichte.reduce((min, l) => { const t = ms(l.start); return t != null && (min == null || t < min) ? t : min; }, null);
  const unzugeordnet = costModel.aggregiere(
    llmUsage.filter((e) => { const t = ms(e && e.createdAt); return t != null && fensterStart != null && t >= fensterStart && !(e && e.id && zugeordnet.has(String(e.id))); })
  );

  const gesamt = costModel.aggregiere(llmUsage);

  if (OPT.json) {
    console.log(JSON.stringify({ quelle: daten.quelle, preisbasis, gesamt, tagesberichte, laufberichte, unzugeordnet }, null, 2));
    return;
  }

  // ── Bericht ────────────────────────────────────────────────────────────────
  const L = [];
  L.push("", "=".repeat(78), "BETRIEBSNACHWEIS KOSTENMESSUNG (Phase-1-Punkt 17) — rein lesend", "=".repeat(78));
  L.push(`Datenquelle : ${daten.quelle}`);
  L.push(`Nutzungslog : ${llmUsage.length} Eintraege · ${processRuns.length} Laeufe · ${budgetCounters.length} Budget-Tageszeilen`);
  L.push("");
  L.push("PREISBASIS (Kostenwahrheit)");
  L.push(`  Waehrung : ${preisbasis.waehrung}`);
  L.push(`  Herkunft : ${preisbasis.herkunft}${preisbasis.quelle ? ` (${preisbasis.quelle})` : ""}${preisbasis.stand ? `, Stand ${preisbasis.stand}` : ""}`);
  L.push(`  ${preisbasis.hinweis}`);

  L.push("", "-".repeat(78), "1) GESAMTBILD ueber das gesamte Nutzungslog", "-".repeat(78));
  L.push(tabelle([summeZeile(gesamt.gesamt)]));
  L.push(`  Messvollstaendigkeit: ${gesamt.messvollstaendigkeit}`);
  L.push(`  ${costModel.kostensatz(gesamt.gesamt)}`);
  L.push(`  Doppelte Eintraege verworfen: ${gesamt.messbefunde.doppelteEintraegeVerworfen} · ohne Idempotenzmerkmal: ${gesamt.messbefunde.eintraegeOhneIdempotenzmerkmal}`);
  L.push(`  Provideraufrufe mit Laufkennung: ${gesamt.messbefunde.davonMitLaufkennung}/${gesamt.messbefunde.provideraufrufe}`);

  L.push("", "-".repeat(78), "2) KOSTEN JE KALENDERTAG (UTC — identisch zum Budget-Gate)", "-".repeat(78));
  L.push(tabelle(tagesberichte.map((t) => ({
    Tag: t.tag, ...summeZeile(t.agg.gesamt),
    Budgetzaehler: t.abgleich.zaehler ?? "-", "Δ Zaehler": t.abgleich.differenz ?? "-",
    Messung: t.agg.messvollstaendigkeit
  }))));
  const untergrenze = tagesberichte.filter((t) => t.abgleich.kostenSindUntergrenze);
  if (untergrenze.length) {
    L.push("");
    L.push(`  WARNUNG: an ${untergrenze.length} von ${tagesberichte.length} Tagen liegt der Reservierungszaehler UEBER der Zahl`);
    L.push("  protokollierter Aufrufe. Es fehlen Protokolleintraege — die bekannten Kosten dieser Tage");
    L.push("  sind eine UNTERGRENZE, kein Gesamtwert.");
  }

  L.push("", "-".repeat(78), `3) KOSTEN JE LAUF (die letzten ${laufberichte.length} Laeufe)`, "-".repeat(78));
  L.push(tabelle(laufberichte.map((l) => ({
    Laufkennung: l.runId || "-", Typ: l.lauftyp || "-", Start: (l.start || "").replace("T", " ").slice(0, 19),
    "Dauer s": l.dauerMs != null ? (l.dauerMs / 1000).toFixed(1) : "-",
    Einheiten: l.verarbeitet, Abrufwege: l.crawl ? l.crawl.abrufwege : "-",
    "Dok neu": l.crawl ? l.crawl.neu : "-",
    "LLM": l.agg.gesamt.aufrufe, "Kosten USD": l.agg.gesamt.kostenUsd.toFixed(6),
    Zuordnung: l.zuordnungsweg
  }))));
  L.push("");
  L.push("  zuordnungsweg='zeitfenster' = REKONSTRUIERT (Nutzungseintrag ohne Laufkennung),");
  L.push("  'laufkennung' = GEMESSEN. Beides wird bewusst getrennt ausgewiesen.");
  L.push(`  Nicht zugeordnete Aufrufe im Beobachtungsfenster: ${unzugeordnet.gesamt.aufrufe} (${usd(unzugeordnet.gesamt.kostenUsd)})`);

  L.push("", "-".repeat(78), "4) KOSTENTREIBER: Pipeline-Schritt und Modell", "-".repeat(78));
  L.push(tabelle(Object.entries(gesamt.jePipelineSchritt)
    .sort((a, b) => b[1].kostenUsd - a[1].kostenUsd)
    .map(([k, v]) => ({ "Pipeline-Schritt": k, ...summeZeile(v) }))));
  L.push("");
  L.push(tabelle(Object.entries(gesamt.jeModell)
    .sort((a, b) => b[1].kostenUsd - a[1].kostenUsd)
    .map(([k, v]) => ({ Modell: k, ...summeZeile(v) }))));

  L.push("", "-".repeat(78), "5) GLOBAL vs. MANDANTENSPEZIFISCH", "-".repeat(78));
  L.push(tabelle(Object.entries(gesamt.jeZurechnung).map(([k, v]) => ({ Zurechnung: k, ...summeZeile(v) }))));
  L.push("");
  L.push("  global            = geteilte Arbeit (Understanding, Backfills) — NICHT einem Mandanten zurechenbar");
  L.push("  direkt            = mandantenbezogener Pfad mit bekanntem Mandanten");
  L.push("  nicht-zurechenbar = mandantenbezogener Pfad OHNE Mandanten am Eintrag (Messluecke)");
  L.push("");
  L.push(`  ${gesamt.verteilungsgrundlage.hinweis}`);
  const mand = Object.entries(gesamt.jeMandant).sort((a, b) => b[1].kostenUsd - a[1].kostenUsd);
  if (mand.length) {
    L.push("");
    L.push(tabelle(mand.map(([k, v]) => ({ Mandant: pseudonym(k), ...summeZeile(v) }))));
  }

  L.push("", "-".repeat(78), "6) MESSLUECKEN", "-".repeat(78));
  const unb = Object.entries(gesamt.unbekannteGruende).sort((a, b) => b[1] - a[1]);
  L.push("  Aufrufe mit UNBEKANNTEN Kosten (Provideraufruf fand statt):");
  L.push(unb.length ? tabelle(unb.map(([g, n]) => ({ Grund: g, Aufrufe: n }))) : "  (keine)");
  if (gesamt.modelleOhnePreis.length) L.push(`  Modelle ohne hinterlegten Preis: ${gesamt.modelleOhnePreis.join(", ")}`);
  L.push("");
  const abw = Object.entries(gesamt.abweisungsgruende).sort((a, b) => b[1] - a[1]).slice(0, 12);
  L.push("  Abgewiesene/uebersprungene Aufrufe (KEIN Provideraufruf -> nachweislich 0,00):");
  L.push(abw.length ? tabelle(abw.map(([g, n]) => ({ Grund: g, Aufrufe: n }))) : "  (keine)");

  L.push("", "-".repeat(78), "7) NICHT ERFASSTE KOSTENARTEN (ausserhalb jeder Deckelung)", "-".repeat(78));
  L.push("  Das Nutzungslog erfasst NUR LLM-Aufrufe. Nicht gemessen und nicht gedeckelt sind:");
  L.push("    · Hosting/Function-Laufzeit (Vercel)   · Datenbank/Speicher (Supabase)");
  L.push("    · Crawl-Egress und Abrufvolumen        · Mail-/Push-Versand");
  L.push("  Fuer diese Provider liegt im Repository KEIN Preis und KEINE Nutzungsmessung vor.");
  L.push("  Ihre Kosten sind daher UNBEKANNT — nicht null.");
  L.push("", "=".repeat(78), "");

  console.log(L.join("\n"));
})().catch((e) => fail(e && e.message ? e.message : String(e)));
