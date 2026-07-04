"use strict";

// Anbindung an das offizielle Bundestags-DIP (Dokumentations- und Informationssystem
// fuer Parlamentsmaterialien). Liefert strukturierte Drucksachen (Gesetzentwuerfe,
// Antraege, Anfragen, Antworten) der aktuellen Wahlperiode, gefiltert nach dem
// Mandatsprofil (Ausschuss + Schwerpunktthemen).
//
// DSGVO: ausschliesslich oeffentliche, amtliche Parlamentsdokumente — keine
// Buerger-Personendaten. Kostenlos. Nur aktiv, wenn DIP_API_KEY gesetzt ist.

const DIP_BASE = "https://search.dip.bundestag.de/api/v1";

function dipApiKey() {
  return process.env.DIP_API_KEY || "";
}

function isDipEnabled() {
  return Boolean(dipApiKey());
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
  return {
    id: String(doc.id || ""),
    type: doc.drucksachetyp || doc.dokumentart || "Drucksache",
    title: cleanDipTitle(String(doc.titel || "")),
    date: doc.datum || doc.aktualisiert || null,
    url: (doc.fundstelle && doc.fundstelle.pdf_url) || (doc.id ? `https://dip.bundestag.de/drucksache/-/${doc.id}` : ""),
    urheber,
    ressort,
    wahlperiode: doc.wahlperiode || null,
    source: "dip"
  };
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
// Perf/Stabilitaets-Fix: dieser fetch() hatte KEIN Timeout — eine haengende DIP-API
// (search.dip.bundestag.de) konnte den aufrufenden Request unbegrenzt blockieren,
// analog zum bereits behobenen Supabase-Hang. Gleiches Muster wie supabaseRequest()
// in storage.js: AbortController deckelt jeden Call hart.
const DIP_REQUEST_TIMEOUT_MS = Number(process.env.DIP_TIMEOUT_MS) || 8000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIP_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
      const response = await fetchWithTimeout(`${DIP_BASE}/drucksache?${params.toString()}`);
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
    console.error("DIP fetch error", error);
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

module.exports = {
  isDipEnabled,
  normalizeDrucksache,
  filterForProfile,
  fetchRecentDrucksachen,
  getRelevantParliamentaryItems
};
