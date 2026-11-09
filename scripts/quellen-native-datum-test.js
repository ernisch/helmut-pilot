"use strict";
// Deklarierte Synthetik: echter Storage-/Archiv-/Cache-/Lagepfad, ausschliesslich
// Fetch-Funktionsattrappe im Prozess. Kein HTTP, Originalabruf oder Modell.
process.env.SUPABASE_URL = "https://storage.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolierte-attrappe-kein-zugang";
process.env.HELMUT_SUPABASE_STORE_ID = "native-datum-test";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_QUELLEN_ARBEITSFENSTER = "on";
process.env.HELMUT_STORE_CACHE_MS = "0";
const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const D = require("../lib/helmut/dedup");
const A = require("../lib/helmut/artikelkontext");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const B = require("../lib/helmut/artikelkontext-belegspeicher");
const Q = require("../lib/helmut/quellen-auszug");
const L = require("../lib/helmut/quellen-lektuerebeleg");
const Lage = require("../lib/helmut/lage-quellenbeleg");
const raw = new Map(), store = new Map();
const reorder = x => Array.isArray(x) ? x.map(reorder) : x && typeof x === "object"
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(([k, v]) => [k, reorder(v)])) : x;
const nativeDate = x => x ? new Date(x).toISOString().replace(/\.000Z$/, "+00:00") : x;
const oldFetch = global.fetch;
let calls = 0;
global.fetch = async (input, opts = {}) => {
  calls++;
  const u = new URL(input), method = opts.method || "GET";
  assert.equal(u.origin, "https://storage.invalid", "kein externes Ziel erlaubt");
  const answer = data => new Response(data == null ? "" : JSON.stringify(reorder(data)), { status: 200 });
  if (u.pathname === "/rest/v1/raw_documents" && method === "POST") {
    const inserted = [];
    for (const r of JSON.parse(opts.body)) if (!raw.has(r.id)) {
      raw.set(r.id, { ...r, published_at: nativeDate(r.published_at), retrieved_at: nativeDate(r.retrieved_at) });
      inserted.push({ id: r.id });
    }
    return answer(inserted);
  }
  if (u.pathname === "/rest/v1/raw_documents" && method === "GET") {
    const ids = u.searchParams.get("id").slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, ""));
    return answer(ids.map(id => raw.get(id)).filter(Boolean));
  }
  if (u.pathname === "/rest/v1/document_findings" && method === "POST") return answer(null);
  if (u.pathname === "/rest/v1/helmut_store") {
    const id = u.searchParams.get("id")?.slice(3);
    if (method === "GET") return answer(store.has(id) ? [{ id, data: store.get(id) }] : []);
    if (method === "POST") {
      const row = JSON.parse(opts.body);
      assert.equal(store.has(row.id), false, "unveraenderliche Erstablage");
      store.set(row.id, row.data); return answer([{ id: row.id }]);
    }
    if (method === "PATCH") {
      assert.ok(store.has(id)); const data = JSON.parse(opts.body).data;
      assert.equal(store.get(id).zustand, "reserviert");
      assert.equal(store.get(id).versuchId, data.versuchId);
      store.set(id, data); return answer([{ id }]);
    }
  }
  throw Error("Nicht vorbereiteter isolierter Speicherzugriff: " + method + " " + u.pathname);
};
(async () => {
  const input = D.toRawDocumentRow({ title: "Bundesregierung kündigt Nachbesserungen zur Pflegereform an",
    url: "https://www.dgb.de/test/pflegereform", sourceName: "DGB", linkType: "direct",
    publishedAt: "2026-11-06T03:57:13Z", retrievedAt: "2026-11-08T07:00:00Z", summary: "" });
  assert.ok(input.published_at.endsWith("Z"));
  const saved = await storage.persistiereRohdokumenteWarteschlange([input]);
  assert.equal(saved.ok, true, saved.grund);
  const [queued] = await storage.ladeRohdokumentStaende([input.id], saved.quellenstaende);
  assert.ok(queued.published_at.endsWith("+00:00"));
  assert.equal(A.quellenstandHash(queued), A.quellenstandHash(raw.get(input.id)));
  console.log("PASS Feed-Z wird vor Queue/Belegbindung aus nativer Speicherung zurueckgelesen");

  const aussage = "Bei der ersten Beratung der Pflegereform wurden Schwachstellen eingeräumt und Nachbesserungen für die weitere parlamentarische Beratung angekündigt.";
  const body = "Der historische Anhang beschreibt unterschiedliche organisatorische Einzelheiten des Verbandes und erläutert seine allgemeinen Arbeitsabläufe. ".repeat(180) + aussage;
  const ld = { "@type": "NewsArticle", headline: input.title, url: input.url,
    datePublished: input.published_at, articleBody: body };
  const html = `<html><head><meta property="og:title" content="${input.title}"><link rel="canonical" href="${input.url}"><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><h1>${input.title}</h1><p>${body}</p></article></body></html>`;
  const result = G.gewinneArtikeltext(queued, { body: html, finalUrl: input.url,
    gelesenAm: "2026-11-08T08:00:00.000Z" }, { abschnittsweise: true });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.beleg.gewinnung.verfahren, "artikelabschnitte-v4");
  const prepared = B.bereiteArtikelkontextVor(queued, { kontext: "einstieg" });
  assert.equal(prepared.ok, true);
  const cache = storage.artikelkontextSpeicher();
  const reservation = { version: 1, schluessel: prepared.key,
    versuchId: "12345678-1234-1234-1234-123456789abc", zustand: "reserviert",
    reserviertAm: "2026-11-08T07:59:59.000Z" };
  await cache.reservieren(prepared.key, reservation);
  await cache.abschliessen(prepared.key, reservation.versuchId, { ...reservation,
    zustand: "belegt", abgeschlossenAm: "2026-11-08T08:00:01.000Z", beleg: result.beleg });
  const current = await storage.getRawDocumentsByIds([input.id]);
  const projected = await Q.mitGespeichertemArtikelkontext(current, { env: {
    HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de" } });
  assert.equal(projected[0].artikelkontext?.beleg.text, body);
  console.log("PASS Gemeinsamer Cacheleser findet V4 mit nativen Zeitstempeln und JSONB-Keyordnung");

  let receipt; const read = [];
  for (let i = 0; i < result.beleg.gewinnung.abschnitte.count; i++) {
    receipt = L.quellenLektuereBeleg(L.quelleFuerPrompt(queued, 0, result.beleg, i));
    read.push(receipt.textstandHash);
  }
  const b = { version: 2, vorgangId: "vg-native", koVersion: 1,
    quellen: [{ ...receipt, geleseneAbschnitte: read }] };
  b.belegHash = L.hash([b.version, b.vorgangId, b.koVersion, b.quellen]);
  const ko = { id: "ko-native", vorgang_id: b.vorgangId, ko_version: 1, source_document_count: 1,
    understanding_status: "complete", status: "neu", headline: input.title, was_ist_passiert: aussage,
    created_at: "2026-11-06T06:00:00+00:00", updated_at: "2026-11-08T06:00:00+00:00",
    classification_confidence: { helmut_quellen_lektuere: reorder(b) } };
  const out = Lage.baueEingabe([ko], { [ko.vorgang_id]: projected }, new Date("2026-11-09T05:15:33Z"));
  assert.equal(out.length, 1); assert.ok(out[0].quellenbelege[0].auszug.includes(aussage));
  console.log("PASS Gebundener Endabschnitt erreicht Lage nach nativem Datumsroundtrip");
  assert.ok(calls > 0);
  console.log("PASS 3/3; ausschliesslich In-Prozess-Fetchattrappe, keine Modellbefolgung behauptet");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = oldFetch; });
