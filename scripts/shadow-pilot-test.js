"use strict";

// Shadow-Pilot — Offline-Test (REINE LOGIK, kein Netz, keine DB, kein LLM).
// Prüft die SICHERHEITS- und KORREKTHEITSINVARIANTEN der Harness scripts/shadow-pilot-crawl.js:
//   Auswahl (genau 6, keine Bot-Quelle, beide Länder, Methoden-Mix) · Isolation (keine
//   Schreib-/Pipeline-Module) · Befundlogik (Bot-Sperre respektiert, RSS/Open-Data-Extraktion) ·
//   Dedup + Fundstellen (Ebene 1 Hash-Kollaps + globale Zusammenführung) · harte Caps.

const {
  selectedWege, wegToItems, extractPardokRecordsShadow, isolationSelfCheck, newestAgeDays,
  SELECTED, BOT_EXCLUDED, RSS_GN_MAX, OPENDATA_MAX, TOTAL_HARD_CAP
} = require("./shadow-pilot-crawl");
const { deduplicateRawItems } = require("../lib/helmut/crawler");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// --- 1. Auswahl: genau 6, keine Bot-Quelle, beide Länder, Methoden-Mix ------------------------
const wege = selectedWege();
check("genau 6 Wege ausgewählt", SELECTED.length === 6 && wege.length === 6);
check("keine der 3 Bot-Parteiquellen in der Auswahl", !SELECTED.some((id) => BOT_EXCLUDED.includes(id)));
check("Bot-Ausschlussliste = die 3 bekannten (be-partei/be-fraktion/bb-partei)",
  JSON.stringify([...BOT_EXCLUDED].sort()) === JSON.stringify(["bb-partei_pilot", "be-fraktion_pilot", "be-partei_pilot"]));
const laender = new Set(wege.flatMap((w) => String(w.land).split("+")));
check("beide Länder abgedeckt (berlin + brandenburg)", laender.has("berlin") && laender.has("brandenburg"));
const methoden = wege.reduce((m, w) => { m[w.method] = (m[w.method] || 0) + 1; return m; }, {});
check("Methoden-Mix: 2x opendata_xml, 2x rss, 2x googlenews_search",
  methoden.opendata_xml === 2 && methoden.rss === 2 && methoden.googlenews_search === 2);
check("2 kritische amtliche Primärquellen (be-plenum/bb-plenum kritisch)",
  wege.filter((w) => w.critical).length >= 2);

// --- 2. Harte Caps als Stop-Bedingungen -------------------------------------------------------
check("RSS/GN-Cap = 20, Open-Data-Cap = 25, Gesamt-Stop = 250 (bounded)",
  RSS_GN_MAX === 20 && OPENDATA_MAX === 25 && TOTAL_HARD_CAP === 250);
check("jeder RSS/GN-Weg maxItems ≤ 20, jeder Open-Data-Weg maxItems ≤ 25",
  wege.every((w) => (w.method === "opendata_xml" ? w.maxItems <= OPENDATA_MAX : w.maxItems <= RSS_GN_MAX)));

// --- 3. Isolation: keine Schreib-/Pipeline-Module im require-Graph ----------------------------
const iso = isolationSelfCheck();
check("Isolations-Selbstprüfung ok (keine verbotenen Module)", iso.ok === true && iso.verboten.length === 0);
check("harness requiret KEIN storage/scheduler/understanding/matching/decisions",
  !iso.libReqs.some((r) => /storage|scheduler|understanding|matching|decisions/.test(r)));
check("harness requiret nur crawler + dedup-global + seeds (lib/helmut)",
  iso.libReqs.every((r) => /crawler|dedup-global|seeds\/landesmodule-quellen/.test(r)));

// --- 4. Befundlogik: Bot-Sperre respektiert (0 Items, kein Retry) -----------------------------
const botWeg = { id: "x", method: "rss", url: "https://x", maxItems: 20 };
const bot429 = wegToItems(botWeg, { status: 429, body: "" });
check("HTTP 429 -> bot_gesperrt, 0 Items übernommen (nicht umgangen)", bot429.befund === "bot_gesperrt" && bot429.items.length === 0);
const bot403 = wegToItems(botWeg, { status: 403, body: "" });
check("HTTP 403 -> bot_gesperrt, 0 Items", bot403.befund === "bot_gesperrt" && bot403.items.length === 0);
const botMarker = wegToItems(botWeg, { status: 200, body: "<html>Attention Required! Cloudflare</html>" });
check("Cloudflare-Body-Marker -> bot_gesperrt, 0 Items", botMarker.befund === "bot_gesperrt" && botMarker.items.length === 0);

// --- 5. Befundlogik: Egress-Fehler -> nicht_verifizierbar (kein erfundenes Ergebnis) ----------
const egressFehler = wegToItems(botWeg, { error: "getaddrinfo ENOTFOUND", status: undefined });
check("Abruf-Fehler ohne Status -> nicht_verifizierbar, 0 Items", egressFehler.befund === "nicht_verifizierbar" && egressFehler.items.length === 0);

// --- 6. RSS-Extraktion über echten Produktionsparser ------------------------------------------
const rssFixture = `<?xml version="1.0"?><rss><channel>
  <item><title>Senat beschliesst Wohnungsbau-Paket</title><link>https://www.tagesspiegel.de/berlin/wohnungsbau</link><pubDate>Fri, 10 Jul 2026 08:00:00 GMT</pubDate><description>Der Senat hat heute...</description></item>
  <item><title>Abgeordnetenhaus debattiert Haushalt</title><link>https://www.tagesspiegel.de/berlin/haushalt</link><pubDate>Fri, 10 Jul 2026 07:00:00 GMT</pubDate><description>Debatte...</description></item>
</channel></rss>`;
const rssRes = wegToItems({ id: "be-regionale_leitmedien", method: "rss", url: "https://www.tagesspiegel.de/contentexport/feed/berlin", maxItems: 20 }, { status: 200, contentType: "application/rss+xml", body: rssFixture });
check("RSS-Feed -> 2 Items via Produktionsparser (rss-regex)", rssRes.befund === "items" && rssRes.items.length === 2);
check("normalisierte Items tragen sourceId des Weges", rssRes.items.every((i) => i.sourceId === "be-regionale_leitmedien"));

// --- 7. Open-Data-Shadow-Extraktor (PARDOK) ---------------------------------------------------
const pardokFixture = `<?xml version="1.0"?><Export>
  <Dokument><Titel>Drucksache 19/1001 — Schriftliche Anfrage Verkehr</Titel><Datum>2026-07-08</Datum><Url>https://www.parlament-berlin.de/ados/19/1001.pdf</Url></Dokument>
  <Dokument><Titel>Drucksache 19/1002 — Gesetzentwurf Wohnraum</Titel><Datum>2026-07-05</Datum></Dokument>
  <Dokument><Betreff>Plenarprotokoll 19/40</Betreff><Sitzungsdatum>2026-07-03</Sitzungsdatum></Dokument>
</Export>`;
const pardok = extractPardokRecordsShadow(pardokFixture, 25);
check("PARDOK-Extraktor erkennt <Dokument> und zieht 3 Datensätze", pardok.tag === "Dokument" && pardok.records.length === 3);
check("PARDOK-Datensatz hat Titel + Datum (best-effort)", pardok.records[0].title.includes("Drucksache 19/1001") && pardok.records[0].publishedAt === "2026-07-08");
const odRes = wegToItems({ id: "be-plenum", method: "opendata_xml", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", maxItems: 25 }, { status: 200, contentType: "application/xml", body: pardokFixture });
check("Open-Data-Weg -> 3 Shadow-Datensätze als normalisierte Items", odRes.befund === "items" && odRes.items.length === 3);

// --- 8. Dedup Ebene 1 (Hash-Kollaps identischer Items) ----------------------------------------
const dup = { id: "raw-1", sourceId: "a", title: "T", url: "https://e/x", originalUrl: "https://e/x", linkType: "direct", publishedAt: "2026-07-10T00:00:00Z", content: "c", hash: "H" };
const l1 = deduplicateRawItems([dup, { ...dup }, { ...dup, hash: "H2", sourceId: "b" }]);
check("Dedup Ebene 1: gleicher Hash kollabiert (3 -> 2)", l1.length === 2);

// --- 9. Fundstellen: EIN Dokument, N Fundstellen über verschiedene Wege ------------------------
// Zwei Wege finden dieselbe Story mit UNTERSCHIEDLICHER URL (überleben Ebene-1-Hash), werden im
// globalen Merge über den Inhaltsfingerabdruck (gleicher Titel/Inhalt) zu EINEM Dokument geclustert.
const story = "Senat beschliesst Wohnungsbau-Paket fuer Berlin";
const via_leitmedium = { sourceId: "be-regionale_leitmedien", title: story, content: story, url: "https://www.tagesspiegel.de/berlin/wohnungsbau", originalUrl: "https://www.tagesspiegel.de/berlin/wohnungsbau", linkType: "direct", publishedAt: "2026-07-10T08:00:00Z", hash: "hh1" };
const via_googlenews = { sourceId: "be-landesregierung", title: story, content: story, url: "", originalUrl: "https://news.google.com/rss/articles/abc", linkType: "google_proxy", publishedAt: "2026-07-10T09:00:00Z", hash: "hh2" };
const l1b = deduplicateRawItems([via_leitmedium, via_googlenews]);
check("zwei Wege, unterschiedliche URL -> beide überleben Ebene 1", l1b.length === 2);
const docs = mergeIntoDocuments(l1b);
check("globaler Merge: EIN Dokument aus zwei Wegen (Fingerprint-Cluster)", docs.length === 1);
check("Dokument trägt 2 Fundstellen (je Weg eine)", docs[0].finding_count === 2);
const srcIds = new Set(docs[0].findings.map((f) => f.source_id));
check("Fundstellen weisen beide Quell-Wege aus", srcIds.has("be-regionale_leitmedien") && srcIds.has("be-landesregierung"));

// --- 10. newestAgeDays -----------------------------------------------------------------------
const now = Date.parse("2026-07-14T00:00:00Z");
check("newestAgeDays: jüngstes Item vor 4 Tagen", newestAgeDays([{ publishedAt: "2026-07-10T00:00:00Z" }, { publishedAt: "2026-06-01T00:00:00Z" }], now) === 4);
check("newestAgeDays: kein Datum -> null", newestAgeDays([{ publishedAt: "" }], now) === null);

console.log(`\n== Shadow-Pilot Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
