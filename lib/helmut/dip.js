"use strict";

// Anbindung an das offizielle Bundestags-DIP (Dokumentations- und Informationssystem
// fuer Parlamentsmaterialien). Liefert strukturierte Drucksachen (Gesetzentwuerfe,
// Antraege, Anfragen, Antworten) der aktuellen Wahlperiode, gefiltert nach dem
// Mandatsprofil (Ausschuss + Schwerpunktthemen).
//
// DSGVO: ausschliesslich oeffentliche, amtliche Parlamentsdokumente — keine
// Buerger-Personendaten. Kostenlos. Nur aktiv, wenn DIP_API_KEY gesetzt ist.

const DIP_BASE = "https://search.dip.bundestag.de/api/v1";
const { publikationsdatum } = require("./quellen-zeitvertrag");

function dipApiKey() {
  return process.env.DIP_API_KEY || "";
}

function isDipEnabled(env = process.env) {
  return Boolean(env.DIP_API_KEY);
}

function currentWahlperiode() {
  return process.env.DIP_WAHLPERIODE || "21";
}

// --- Normalisierung einer DIP-Drucksache in ein Helmut-freundliches Format ---
function cleanDipTitle(raw) {
  // DIP-Antworttitel beginnen mit "auf die Kleine Anfrage\r\n- Drucksache X -\r\nEigentlicher Titel"
  // Wir extrahieren nur den eigentlichen Titel nach dem Drucksache-Verweis.
  const cleaned = raw.replace(/\r\n/g, " ").replace(/\r|\n/g, " ").trim();
  const match = cleaned.match(/(?:Drucksache\s+[\d/]+\s*-\s*)(.+)/i);
  if (match) return match[1].trim();
  // Fallback: "auf die Kleine Anfrage"-Prefix entfernen
  return cleaned.replace(/^auf die\s+\S+\s+Anfrage\s*/i, "").trim() || cleaned;
}

function normalizeDrucksache(doc) {
  if (!doc || !doc.titel) return null;
  const urheber = Array.isArray(doc.urheber)
    ? doc.urheber.map((u) => u && (u.titel || u.bezeichnung)).filter(Boolean)
    : [];
  const ressort = Array.isArray(doc.ressort)
    ? doc.ressort.map((r) => r && r.titel).filter(Boolean)
    : [];
  const normalized = {
    id: String(doc.id || ""),
    type: doc.drucksachetyp || doc.dokumentart || "Drucksache",
    title: cleanDipTitle(String(doc.titel || "")),
    date: publikationsdatum(doc.datum)?.original || null,
    url: (doc.fundstelle && doc.fundstelle.pdf_url) || (doc.id ? `https://dip.bundestag.de/drucksache/-/${doc.id}` : ""),
    urheber,
    ressort,
    wahlperiode: doc.wahlperiode || null,
    source: "dip"
  };
  const quellfelder = require("./dip-quellfelder").neu(doc, normalized);
  if (quellfelder) normalized.dipQuellfelder = quellfelder;
  return normalized;
}

// --- Relevanzfilter nach Mandatsprofil (Stichwortabgleich) ---
function profileTerms(profile = {}) {
  const raw = [
    profile.committee,
    ...(profile.committees || []),
    ...(profile.focusTopics || []),
    ...(profile.reportingTopics || [])
  ];
  const terms = [];
  raw.forEach((value) => {
    const term = String(value || "").toLowerCase().trim();
    if (term.length >= 3 && !terms.includes(term)) terms.push(term);
  });
  return terms;
}

function filterForProfile(items, profile, limit = 12) {
  const terms = profileTerms(profile);
  if (!terms.length) return [];
  const seen = new Set();
  const matched = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    const haystack = `${item.title} ${(item.urheber || []).join(" ")} ${(item.ressort || []).join(" ")}`.toLowerCase();
    if (!terms.some((term) => haystack.includes(term))) continue;
    seen.add(item.id);
    matched.push(item);
  }
  // Neueste zuerst
  matched.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return matched.slice(0, limit);
}

// --- Abruf (mit kurzem In-Memory-Cache, schont die API/Rate-Limits) ---
let cache = { at: 0, items: [] };
const CACHE_TTL_MS = Number(process.env.DIP_CACHE_MS || 30 * 60 * 1000);

async function fetchRecentDrucksachen({ sinceDays = 21, maxPages = 4 } = {}) {
  if (!isDipEnabled()) return [];
  if (typeof fetch !== "function") return [];
  const start = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const all = [];
  let cursor = null;
  let lastCursor = null;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        apikey: dipApiKey(),
        "f.wahlperiode": currentWahlperiode(),
        "f.datum.start": start,
        format: "json"
      });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`${DIP_BASE}/drucksache?${params.toString()}`);
      if (!response.ok) {
        console.error("DIP fetch failed", response.status);
        break;
      }
      const data = await response.json();
      const docs = (data.documents || []).map(normalizeDrucksache).filter(Boolean);
      all.push(...docs);
      cursor = data.cursor;
      // DIP gibt denselben Cursor zurueck, wenn keine weiteren Seiten folgen.
      if (!cursor || cursor === lastCursor || docs.length === 0) break;
      lastCursor = cursor;
    }
  } catch (error) {
    // SICHERHEIT: nur die Fehlermeldung loggen, nicht das volle Error-/Request-Objekt
    // (das je nach fetch-Implementierung die aufgerufene URL inkl. apikey-Query-Param
    // enthalten kann) — konsistent mit dem HTTP-Status-Zweig direkt darueber.
    console.error("DIP fetch error", error && error.message);
  }
  return all;
}

async function getAllRecent() {
  if (cache.items.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  const items = await fetchRecentDrucksachen({});
  if (items.length) cache = { at: Date.now(), items };
  return cache.items;
}

// Hauptfunktion fuer den Server: relevante Vorgaenge fuer ein Mandat.
async function getRelevantParliamentaryItems(profile) {
  if (!isDipEnabled()) return { enabled: false, items: [] };
  const all = await getAllRecent();
  return { enabled: true, total: all.length, items: filterForProfile(all, profile) };
}

// Der API-Weg bleibt vom RSS-Crawl getrennt, benutzt aber denselben Sourcejob.
// Nur die vorhandene feste Katalogfreigabe darf ihn oeffnen.
function quellenwegAktiv(katalog) {
  const rows = katalog?.retrievalPaths?.filter(p => p?.id === "rp-dip") || [];
  const p = rows[0];
  return rows.length === 1 && p.legacy_source_id === "dip" && p.publisher_id === "publisher-dip.bundestag.de"
    && p.method === "api" && p.parser === "dip-json" && p.url === DIP_BASE
    && p.status === "healthy" && p.activation_mode === "always_on";
}

function dokumentSichtbar(doc, profile, katalog, fundstellen) {
  if (!quellenwegAktiv(katalog)) return false;
  const b = require("./dip-quellfelder").lese(doc);
  if (!b || !fundstellen.some(f => f.raw_document_id === doc.id && f.source_id === "dip"
    && f.retrieval_path_id === "rp-dip" && f.original_url === b.bindung.url)) return false;
  // Nur validierte oeffentliche Originalfelder, niemals Jobtenant oder Freitext.
  return filterForProfile([{ id: b.dokumentId, title: b.bindung.titel, date: b.datum,
    urheber: (b.urheber || []).map(u => u.titel || u.bezeichnung).filter(Boolean),
    ressort: (b.ressort || []).map(r => r.titel).filter(Boolean) }], profile).length === 1;
}

// Begrenzte Wiederanbindung fuer den regulären Queuepfad. Der alte App-Leser
// bleibt unveraendert; nur vollstaendig bestaetigte Queueantworten sind cachebar.
async function getQueueDocuments(profile, { deadlineMs, now = Date.now, env = process.env,
  fetch: request = globalThis.fetch, klassen = null, slot = null, anbieterDeps = {} } = {}) {
  const zeitFehler = () => Object.assign(new Error("dip-zeitbudget"), { code: "DIP_TIME_BUDGET" });
  if (!isDipEnabled(env)) throw new Error("dip-zugang-fehlt");
  if (typeof request !== "function") throw new Error("dip-transport-fehlt");
  if (!Number.isFinite(deadlineMs) || deadlineMs <= now()) throw zeitFehler();
  if (cache.queue === true && cache.items.length && now() - cache.at >= 0 && now() - cache.at < CACHE_TTL_MS)
    return filterForProfile(cache.items, profile);
  const A = require("./anbieter-steuerung"), all = [];
  if (!A.steuerungAktiv(env)) throw new Error("dip-anbietersteuerung-nicht-aktiv");
  const wache = A.starteLeaseWache({ klassen, klasse: "quellenabruf", slot, deps: anbieterDeps });
  const leaseFehler = () => Object.assign(new Error("dip-lease-verloren"), {
    anbieterVertagung: { grund: "klassen-lease-verloren", wartenMs: 5000 } });
  try {
  const start = new Date(now() - 21 * 86400000).toISOString().slice(0, 10);
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    if (wache.verloren()) throw leaseFehler();
    if (deadlineMs <= now()) throw zeitFehler();
    const params = new URLSearchParams({ "f.wahlperiode": env.DIP_WAHLPERIODE || "21", "f.datum.start": start, format: "json" });
    if (cursor) params.set("cursor", cursor);
    const bereich = { ...A.anbieterAusUrl(DIP_BASE), klasse: "quellenabruf", env, deps: anbieterDeps };
    const admission = await A.reserviere(bereich);
    if (!admission.erlaubt) throw Object.assign(new Error("dip-anbietergrenze"), {
      anbieterVertagung: { vorAbruf: true, grund: admission.grund, wartenMs: admission.wartenMs } });
    if (deadlineMs <= now()) throw zeitFehler();
    if (wache.verloren()) throw leaseFehler();
    const controller = new AbortController();
    const timeoutMs = Math.min(12000, Number(env.CRAWLER_TIMEOUT_MS) || 7000), restMs = deadlineMs - now();
    const limit = Math.min(timeoutMs, restMs);
    if (!(limit > 0)) throw zeitFehler();
    const timer = setTimeout(() => controller.abort(restMs <= timeoutMs ? zeitFehler() : undefined), limit);
    let data, reader, response;
    try {
      // Bereits im vorhandenen DIP-Faktenleser verwendete Headerauthentifizierung.
      // Kein API-Key in URL, Fehlertext, Queuepayload oder Anbieterjournal.
      response = await request(DIP_BASE + "/drucksache?" + params, {
        headers: { Authorization: "ApiKey " + env.DIP_API_KEY, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.any([controller.signal, wache.signal])
      });
      if (!response.ok) throw new Error("dip-http-" + Number(response.status));
      if (!/application\/json/i.test(response.headers.get("content-type") || "")) throw new Error("dip-antworttyp");
      reader = response.body.getReader();
      const chunks = []; let size = 0;
      const max = Math.min(10 * 1024 * 1024, Number(env.HELMUT_CRAWL_MAX_RESPONSE_BYTES) || 10 * 1024 * 1024);
      if (!(max > 0)) throw new Error("dip-antwortgrenze");
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > max) throw new Error("dip-antwortgrenze");
        chunks.push(Buffer.from(value));
      }
      data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      if (!data || !Array.isArray(data.documents) || (data.cursor != null && typeof data.cursor !== "string"))
        throw new Error("dip-antwortvertrag");
      await A.melde({ ...bereich, ok: true });
    } catch (error) {
      if (wache.verloren()) throw leaseFehler();
      if (deadlineMs <= now() || controller.signal.reason?.code === "DIP_TIME_BUDGET") throw zeitFehler();
      const anbieterFehler = controller.signal.aborted || A.istAnbieterFehler(error) || A.istAnbieterFehler(error?.cause);
      const reason = controller.signal.aborted ? "dip-abruf-timeout"
        : /^dip-[a-z0-9-]+$/.test(error?.message || "") ? error.message : "dip-abruf-fehlgeschlagen";
      await A.melde({ ...bereich, ok: !anbieterFehler, grund: reason }).catch(() => ({}));
      throw new Error(reason);
    } finally {
      controller.abort(); clearTimeout(timer);
      if (reader) await reader.cancel().catch(() => {});
      else if (response?.body) await response.body.cancel().catch(() => {});
    }
    const docs = data.documents.map(normalizeDrucksache).filter(Boolean);
    all.push(...docs);
    if (!data.cursor || data.cursor === cursor || !docs.length) break;
    cursor = data.cursor;
  }
  if (wache.verloren()) throw leaseFehler();
  if (deadlineMs <= now()) throw zeitFehler();
  cache = { at: now(), items: all, queue: true };
  return filterForProfile(all, profile); // vorhandener persoenlicher Zwoelferdeckel
  } finally { wache.beenden(); }
}

module.exports = {
  isDipEnabled,
  normalizeDrucksache,
  filterForProfile,
  fetchRecentDrucksachen,
  getRelevantParliamentaryItems,
  quellenwegAktiv, dokumentSichtbar, getQueueDocuments
};
