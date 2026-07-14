"use strict";

// Helmut — Quellenarchitektur · Shadow-Pilot (BE/BB): ENG BEGRENZTER, ISOLIERTER Beobachtungslauf
// für MAX. 6 stabile Berlin/Brandenburg-Abrufwege. Zweck: den echten Abruf + Parser + Dedup +
// Fundstellen der ausgewählten Wege beobachten, OHNE die Live-Produktion (Lage/Radar/Helmut/Büro)
// zu berühren.
//
// ISOLATIONSGARANTIE (durch scripts/shadow-pilot-test.js hart geprüft):
//   * Schreibt AUSSCHLIESSLICH in ein JSON-Artefakt (--out) bzw. in den Shadow-Ordner.
//   * Ruft NIE saveRawItems / saveRawDocument / persistRawDocumentsShadow / writeStore /
//     Understanding / Matching / Decision / irgendeinen /rest/v1-Write auf.
//   * Requiret aus lib/helmut/* NUR reine Fetch-/Parse-/Dedup-Funktionen (crawler, dedup,
//     dedup-global) + die Seeds (Single Source of Truth der URLs). KEIN storage-Write-Modul,
//     KEIN scheduler, KEIN understanding.
//   * Trägt die Wege NICHT in store.sources ein -> der Live-Crawl (v1Sources) sieht sie nie.
//   * KEIN LLM-Aufruf -> keine llm_usage, keine Kosten außer Runner-Minuten.
//
// Der Live-Crawl nutzt v1Sources; retrieval_paths (wo diese 6 Wege liegen: needs_review/manual)
// werden vom Scheduler NIE gecrawlt. Dieser Pilot ist ein Standalone-Skript im Stil von
// scripts/sprint9b-verify-abrufwege.js — er läuft NICHT über /api/cron/*, NICHT über den Scheduler.
//
// Bot-Sperren werden NICHT umgangen: 429/403/Bot-Marker -> Weg wird als bot_gesperrt markiert,
// 0 Items übernommen, KEIN Retry, KEINE Umgehung. Die 3 bekannten Bot-Parteiquellen sind bereits
// per Allowlist ausgeschlossen (harte Sperre unten).
//
// Aufruf: node scripts/shadow-pilot-crawl.js --out <artefakt.json>
//   (ohne Egress -> alle Wege "nicht_verifizierbar", leeres Dokument-Set, sauberer Exit 0.)

const fs = require("fs");
const path = require("path");
const { parseRssItems, normalizeRawItem, deduplicateRawItems } = require("../lib/helmut/crawler");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { httpProbe, controlOkFromProbes } = require("./sprint9b-verify-abrufwege");

// --- Auswahl (Ergebnis der Kartierung + adversarialen Isolationsprüfung) ---------------------
// GENAU diese 6 Wege. Reihenfolge = Priorität in der Begründung.
const SELECTED = [
  "be-plenum",               // opendata_xml  · amtliche Primärquelle Berlin (4 Pflichtklassen)
  "bb-plenum",               // opendata_xml  · amtliche Primärquelle Brandenburg (4 Pflichtklassen)
  "be-regionale_leitmedien", // rss           · Tagesspiegel Berlin (Leitmedium)
  "rbb24-politik",           // rss           · rbb24 (ÖR, deckt BE+BB)
  "be-landesregierung",      // googlenews    · Senat/Exekutive Berlin
  "bb-landesregierung"       // googlenews    · Landesregierung/Staatskanzlei Brandenburg
];
// HARTE SPERRE: Bot-gesperrte Parteiquellen sind vollständig ausgeschlossen und dürfen NIE
// in die Auswahl geraten (Sicherheitsnetz gegen versehentliche Aufnahme).
const BOT_EXCLUDED = ["be-partei_pilot", "be-fraktion_pilot", "bb-partei_pilot"];

// --- Harte Mengengrenzen (Stop-Bedingungen) --------------------------------------------------
const RSS_GN_MAX = Number(process.env.SP_RSS_MAX || 20);       // Items je RSS-/Google-News-Weg
const OPENDATA_MAX = Number(process.env.SP_OPENDATA_MAX || 25); // Datensätze je Open-Data-Weg
const TOTAL_HARD_CAP = Number(process.env.SP_TOTAL_CAP || 250); // Gesamt-Items je Lauf (Stop)
const FRESH_DAYS = Number(process.env.SP_FRESH_DAYS || 45);

const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];
const BOT_MARKERS = /(cloudflare|attention required|captcha|access denied|zugriff verweigert|are you a human|__cf_chl|akamai|bot detection)/i;

// --- Wege aus den Seeds ziehen (kein URL-Drift, Single Source of Truth) -----------------------
function selectedWege() {
  const seed = buildLandesmodulSeed();
  const byLeg = new Map(seed.retrievalPaths.map((p) => [p.legacy_source_id, p]));
  const wege = [];
  for (const id of SELECTED) {
    if (BOT_EXCLUDED.includes(id)) continue; // Sicherheitsnetz
    const p = byLeg.get(id);
    if (!p) throw new Error(`Ausgewählter Weg nicht im Seed: ${id}`);
    wege.push({
      id: p.legacy_source_id,
      retrievalPathId: p.id,
      land: p.landModule,
      method: p.method,
      parser: p.parser,
      url: p.url,
      critical: !!p.is_critical,
      covers: p.covers,
      maxItems: p.method === "opendata_xml" || p.method === "api_xml" ? OPENDATA_MAX : Math.min(p.max_items || RSS_GN_MAX, RSS_GN_MAX)
    });
  }
  return wege;
}

// --- Shadow-only Minimal-Extraktor für PARDOK/parldok-Open-Data-XML ---------------------------
// EHRLICHER HINWEIS: In Production existiert KEIN Ingest-Parser für opendata_xml/pardok-xml.
// Diese Funktion ist NUR Pilot-Harness-Code (kein Produktions-Ingest). Sie zieht je <Dokument>/
// <Vorgang>-Block best-effort Titel/Datum/URL, um den Output beobachtbar zu machen — sie ist
// bewusst konservativ und nicht schemavollständig.
function extractPardokRecordsShadow(xml, max) {
  const text = String(xml || "");
  const recTags = ["Dokument", "Vorgang", "vorgang", "dokument"];
  let tag = null;
  for (const t of recTags) { if (new RegExp(`<${t}[\\s>]`).test(text)) { tag = t; break; } }
  if (!tag) return { tag: null, records: [] };
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "g");
  const blocks = text.match(re) || [];
  const field = (block, names) => {
    for (const n of names) {
      const m = block.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`, "i"));
      if (m && m[1]) return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    return "";
  };
  const records = [];
  for (const b of blocks.slice(0, max)) {
    const title = field(b, ["Titel", "Betreff", "Kurzbezeichnung", "Bezeichnung", "Thema", "Name", "titel"]).slice(0, 300);
    const dateRaw = field(b, ["Datum", "Erstelldatum", "Sitzungsdatum", "Beschlussdatum", "datum"]);
    const urlM = b.match(/https?:\/\/[^\s"'<>]+/);
    if (!title && !urlM) continue;
    records.push({
      title: title || `(${tag} ohne Titelfeld)`,
      url: urlM ? urlM[0] : "",
      publishedAt: dateRaw || ""
    });
  }
  return { tag, records };
}

function newestAgeDays(items, nowMs) {
  let newest = null;
  for (const it of items) { const t = Date.parse(it.publishedAt || ""); if (!Number.isNaN(t) && (newest === null || t > newest)) newest = t; }
  if (newest === null) return null;
  return Math.floor(((Number.isFinite(nowMs) ? nowMs : Date.now()) - newest) / 86400000);
}

// weg + probe -> {status, items[], befund}. Reine Logik (Netz steckt in probe).
function wegToItems(weg, probe) {
  if (probe.error && probe.status === undefined) {
    return { status: null, items: [], befund: "nicht_verifizierbar", note: `Abruf fehlgeschlagen: ${probe.error}` };
  }
  const status = probe.status;
  const botByStatus = [401, 403, 429].includes(status);
  const botByBody = BOT_MARKERS.test(String(probe.body || "").slice(0, 4000));
  if (botByStatus || botByBody) {
    // Bot-Sperre respektieren: 0 Items, kein Retry, keine Umgehung.
    return { status, items: [], befund: "bot_gesperrt", note: `Bot-/Zugriffssperre (${botByStatus ? "HTTP " + status : "Body-Marker"}) — nicht umgangen, 0 Items übernommen` };
  }
  if (status >= 300) {
    return { status, items: [], befund: "fehlerstatus", note: `HTTP ${status} — keine nutzbaren Inhalte` };
  }
  const body = String(probe.body || "");
  const source = { id: weg.id, name: weg.id, type: "shadow_pilot", url: weg.url, priority: 0 };

  if (weg.method === "rss" || weg.method === "googlenews_search") {
    const parsed = parseRssItems(body, weg.maxItems);
    const items = parsed.map((d) => normalizeRawItem(d, source));
    return { status, items, befund: items.length ? "items" : "leer", note: `${items.length} Items (Parser: rss-regex${weg.method === "googlenews_search" ? "/googlenews" : ""})` };
  }
  if (weg.method === "opendata_xml" || weg.method === "api_xml") {
    const { tag, records } = extractPardokRecordsShadow(body, weg.maxItems);
    const items = records.map((r) => normalizeRawItem({ title: r.title, content: r.title, url: r.url, publishedAt: r.publishedAt }, source));
    return { status, items, befund: items.length ? "items" : "leer", note: `${items.length} Datensätze <${tag || "?"}> (SHADOW-Extraktor, KEIN Produktions-Ingest)` };
  }
  return { status, items: [], befund: "unbekannte_methode", note: `Methode ${weg.method}` };
}

// --- Isolations-Selbstprüfung: dieses Skript darf keine Schreib-/Pipeline-Module ziehen -------
const FORBIDDEN_MODULE_TOKENS = ["scheduler", "understanding", "matching", "decisions"];
function isolationSelfCheck() {
  const src = fs.readFileSync(__filename, "utf8");
  // Require-Zeilen prüfen: nur crawler, dedup-global, seeds, sprint9b-verify erlaubt.
  const reqs = (src.match(/require\((?:"|')([^"']+)(?:"|')\)/g) || []).map((s) => s.replace(/require\((?:"|')|(?:"|')\)/g, ""));
  const libReqs = reqs.filter((r) => r.includes("lib/helmut"));
  const verboten = libReqs.filter((r) => FORBIDDEN_MODULE_TOKENS.some((t) => r.includes(t)) || /storage/.test(r));
  return { libReqs, verboten, ok: verboten.length === 0 };
}

async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1]
    : path.join(__dirname, "..", "shadow-pilot-out", "shadow-pilot-report.json");

  // 0) Auswahl + Sicherheitsnetze
  if (SELECTED.length > 6) throw new Error(`Mehr als 6 Wege ausgewählt (${SELECTED.length}) — Pilotgrenze verletzt`);
  const kollision = SELECTED.filter((id) => BOT_EXCLUDED.includes(id));
  if (kollision.length) throw new Error(`Bot-gesperrte Quelle in Auswahl: ${kollision.join(", ")}`);
  const iso = isolationSelfCheck();
  if (!iso.ok) throw new Error(`ISOLATIONSVERLETZUNG: verbotene Module required: ${iso.verboten.join(", ")}`);

  const wege = selectedWege();
  console.log("=== Helmut Shadow-Pilot (BE/BB) — isolierter Beobachtungslauf ===");
  console.log(`Wege: ${wege.length} · Caps: ${RSS_GN_MAX} RSS/GN, ${OPENDATA_MAX} Open-Data, Gesamt-Stop ${TOTAL_HARD_CAP}`);
  console.log("Isolation: nur Fetch/Parse/Dedup, kein Storage-Write, kein LLM, kein Scheduler.\n");

  // 1) Egress-Kontrolle
  const controlProbes = [];
  for (const cu of CONTROL_URLS) controlProbes.push(await httpProbe(cu));
  const controlStatuses = controlProbes.map((p, i) => `${new URL(CONTROL_URLS[i]).hostname}=${p.error ? p.error : "HTTP " + p.status}`);
  const egressOffen = controlOkFromProbes(controlProbes);
  console.log(`Kontroll-Abruf: ${controlStatuses.join(" · ")} -> Egress ${egressOffen ? "OFFEN" : "GESPERRT"}\n`);

  const perWeg = [];
  let allItems = [];
  let gestoppt = null;

  if (egressOffen) {
    for (const weg of wege) {
      const probe = await httpProbe(weg.url);
      const r = wegToItems(weg, probe);
      let items = r.items;
      // Stop-Bedingung: Gesamt-Cap
      if (allItems.length + items.length > TOTAL_HARD_CAP) {
        items = items.slice(0, Math.max(0, TOTAL_HARD_CAP - allItems.length));
        gestoppt = `Gesamt-Cap ${TOTAL_HARD_CAP} erreicht bei ${weg.id}`;
      }
      allItems = allItems.concat(items);
      perWeg.push({ id: weg.id, land: weg.land, method: weg.method, critical: weg.critical, status: r.status, befund: r.befund, itemCount: items.length, note: r.note, finalUrl: probe.finalUrl || null });
      console.log(`[${String(weg.land).padEnd(16)}] ${weg.id.padEnd(24)} ${String(r.befund).padEnd(18)} ${items.length} Items — ${r.note}`);
      if (gestoppt) { console.log(`  ⛔ ${gestoppt}`); break; }
    }
  } else {
    for (const weg of wege) perWeg.push({ id: weg.id, land: weg.land, method: weg.method, critical: weg.critical, status: null, befund: "nicht_verifizierbar", itemCount: 0, note: "Egress gesperrt — keine echte Prüfung, kein erfundenes Ergebnis" });
  }

  // 2) Dedup Ebene 1 (In-Lauf) + Ebene 3 (global -> Dokumente + Fundstellen)
  const dedupL1 = deduplicateRawItems(allItems);
  const documents = mergeIntoDocuments(dedupL1);
  const findingsGesamt = documents.reduce((a, d) => a + (d.finding_count || 0), 0);
  const mehrfachFundstellen = documents.filter((d) => (d.finding_count || 0) > 1).length;

  const report = {
    generatedAt: new Date().toISOString(),
    modus: "shadow-only (Artefakt-Datei; kein raw_documents/knowledge_objects/briefings/helmut_store-Write)",
    egressOffen, controlStatuses,
    caps: { rss_gn: RSS_GN_MAX, opendata: OPENDATA_MAX, gesamt: TOTAL_HARD_CAP, fresh_days: FRESH_DAYS },
    isolation: { requiredLibModule: iso.libReqs, verboteneModule: iso.verboten, ok: iso.ok },
    ausgeschlosseneBotQuellen: BOT_EXCLUDED,
    perWeg,
    itemsRoh: allItems.length,
    itemsNachDedupL1: dedupL1.length,
    dokumente: documents.length,
    fundstellenGesamt: findingsGesamt,
    dokumenteMitMehrfachFundstellen: mehrfachFundstellen,
    neuesteAlterTage: newestAgeDays(allItems, Date.now()),
    gestoppt,
    documents
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n--- Zusammenfassung ---");
  console.log(`  Items roh: ${allItems.length} · nach Dedup L1: ${dedupL1.length} · Dokumente: ${documents.length} · Fundstellen: ${findingsGesamt} (mehrfach: ${mehrfachFundstellen})`);
  console.log(`  Artefakt (SHADOW): ${outPath}`);
  if (!egressOffen) console.log("  -> Egress gesperrt: KEIN Weg real geprüft, KEIN Ergebnis erfunden.");
  return report;
}

if (require.main === module) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { selectedWege, wegToItems, extractPardokRecordsShadow, isolationSelfCheck, newestAgeDays, SELECTED, BOT_EXCLUDED, RSS_GN_MAX, OPENDATA_MAX, TOTAL_HARD_CAP };
