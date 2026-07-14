"use strict";

// Tests fuer globale Deduplizierung + Fundstellenmodell — Sprint 3.
// Deckt ab (Auftrag §16/§17/§18/§36): mehrere Suchwege -> 1 Raw Document + N Fundstellen;
// Google News als Suchweg (echte Herausgeberdomain traegt Identitaet); mehrsignalige Dedup
// (Canonical/Fingerprint/Herausgeberdomain+Titel+Datum); Trennung verschiedener Vorgaenge;
// Canonical-Extraktion aus HTML; Migrations-Konsistenz.
// Reine Offline-Tests (Fixtures), kein Netz, keine KI, kein DB-Zugriff.

const fs = require("fs");
const path = require("path");
const d = require("../lib/helmut/quellenarchitektur/dedup-global");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// ============================ UNIT ============================
console.log("== Unit: URL / Domain / Google News ==");
check("cleanedUrl entfernt Tracking", d.cleanedUrl({ url: "https://www.x.de/a?utm_source=y&id=1" }) === "https://x.de/a?id=1");
check("publisherDomain = echte Domain", d.publisherDomain({ url: "https://www.tagesschau.de/inland/x-100.html" }) === "tagesschau.de");
check("publisherDomain schliesst Google News aus", d.publisherDomain({ url: "https://news.google.com/rss/articles/ABC" }) === "");
check("publisherDomain schliesst google.com aus", d.publisherDomain({ url: "https://www.google.com/search?q=x" }) === "");

console.log("== Unit: Titelaehnlichkeit / Fingerprint ==");
check("Titelaehnlichkeit gleich hoch", d.titleSimilarity("Kabinett beschliesst Rentenpaket klar", "Kabinett beschliesst Rentenpaket klar") === 1);
check("Titelaehnlichkeit verschieden = 0", d.titleSimilarity("Pflegereform beschlossen", "Streit um Haushalt") === 0);
check("Fingerprint stabil gegen Wortstellung", d.fingerprint({ title: "Rente steigt deutlich", excerpt: "Bundestag" }) === d.fingerprint({ title: "deutlich steigt Rente", excerpt: "Bundestag" }));
check("Fingerprint verschieden bei anderem Inhalt", d.fingerprint({ title: "Rente steigt" }) !== d.fingerprint({ title: "Miete steigt" }));

console.log("== Unit: Fundstelle / Canonical-Extraktion ==");
check("buildFinding traegt source_id + original_url", (() => {
  const f = d.buildFinding({ sourceId: "radar-pflege", originalUrl: "https://news.google.com/x", linkType: "direct", retrievedAt: "2026-07-13T10:00:00Z" });
  return f.source_id === "radar-pflege" && f.original_url === "https://news.google.com/x" && f.retrieval_path_id === "rp-radar-pflege";
})());
check("Canonical aus rel=canonical", d.extractCanonicalFromHtml('<link rel="canonical" href="https://www.zeit.de/a-100"/>') === "https://zeit.de/a-100");
check("Canonical aus og:url (Tracking entfernt)", d.extractCanonicalFromHtml('<meta property="og:url" content="https://www.faz.net/x?utm_source=a">') === "https://faz.net/x");
check("kein Canonical -> leer", d.extractCanonicalFromHtml("<html><body>x</body></html>") === "");

// ============================ INTEGRATION ============================
console.log("== Integration: mehrere Suchwege -> 1 Doc + N Fundstellen ==");
const sameStory = [
  { id: "raw-a", sourceId: "committee-gesundheit", title: "Bundestag beschließt Pflegereform", url: "https://www.tagesschau.de/inland/pflege-100.html", originalUrl: "https://news.google.com/rss/articles/AAA", linkType: "direct", publishedAt: "2026-07-13T08:00:00Z", retrievedAt: "2026-07-13T09:00:00Z", confidence: "high" },
  { id: "raw-b", sourceId: "radar-pflege", title: "Bundestag beschließt Pflegereform", url: "https://www.tagesschau.de/inland/pflege-100.html?utm_campaign=z", originalUrl: "https://news.google.com/rss/articles/BBB", linkType: "direct", publishedAt: "2026-07-13T08:00:00Z", retrievedAt: "2026-07-13T09:05:00Z", confidence: "high" },
  { id: "raw-c", sourceId: "news-spiegel", title: "Pflegereform im Bundestag", url: "https://www.tagesschau.de/inland/pflege-100.html", originalUrl: "https://news.google.com/rss/articles/CCC", linkType: "direct", publishedAt: "2026-07-13T09:30:00Z", retrievedAt: "2026-07-13T10:00:00Z", confidence: "high" }
];
const docs1 = d.mergeIntoDocuments(sameStory);
check("3 Fund-Items -> 1 Dokument", docs1.length === 1);
check("Dokument hat 3 Fundstellen", docs1[0].finding_count === 3);
check("alle 3 Suchwege als Fundstellen erhalten", ["committee-gesundheit", "radar-pflege", "news-spiegel"].every((s) => docs1[0].findings.some((f) => f.source_id === s)));
check("Herausgeber = tagesschau.de (NICHT Google News)", docs1[0].publisher_domain === "tagesschau.de");
check("Canonical tracking-bereinigt", docs1[0].canonical_url === "https://tagesschau.de/inland/pflege-100.html");
check("Google-News-Proxy-URLs bleiben als Fundstellen erhalten", docs1[0].findings.every((f) => /news\.google\.com/.test(f.original_url)));

console.log("== Integration: verschiedene Vorgaenge NICHT zusammenfuehren (Auftrag §18) ==");
const mixed = [
  ...sameStory,
  { id: "raw-d", sourceId: "committee-finanzen", title: "Streit um Bundeshaushalt eskaliert", url: "https://www.tagesschau.de/inland/haushalt-200.html", originalUrl: "", linkType: "direct", publishedAt: "2026-07-13T08:00:00Z", retrievedAt: "2026-07-13T09:00:00Z", confidence: "high" },
  // gleicher Titel-Anfang, aber ANDERE Story, anderes Land, andere URL -> getrennt
  { id: "raw-e", sourceId: "region-x", title: "Pflegereform in Bayern gestartet", url: "https://www.br.de/nachrichten/pflege-bayern-1.html", originalUrl: "", linkType: "direct", publishedAt: "2026-07-13T08:00:00Z", retrievedAt: "2026-07-13T09:00:00Z", confidence: "high" }
];
const docs2 = d.mergeIntoDocuments(mixed);
check("Pflege(Bund) + Haushalt + Pflege(Bayern) = 3 getrennte Dokumente", docs2.length === 3);
check("Bayern-Pflege NICHT mit Bund-Pflege gemerged (andere Domain/URL)", (() => {
  const bund = docs2.find((x) => x.findings.some((f) => f.source_id === "committee-gesundheit"));
  return bund && !bund.findings.some((f) => f.source_id === "region-x");
})());

console.log("== Integration: Cross-Publisher gleicher Inhalt -> Fingerprint ==");
const cross = [
  { id: "c1", sourceId: "s1", title: "Kanzler kündigt Rentenpaket an", excerpt: "Der Kanzler kündigt heute ein Rentenpaket an", url: "https://a-zeitung.de/1", publishedAt: "2026-07-13" },
  { id: "c2", sourceId: "s2", title: "Kanzler kündigt Rentenpaket an", excerpt: "Der Kanzler kündigt heute ein Rentenpaket an", url: "https://b-zeitung.de/2", publishedAt: "2026-07-13" }
];
const docs3 = d.mergeIntoDocuments(cross);
check("gleicher Inhalt ueber 2 Herausgeber -> 1 Dokument (Fingerprint)", docs3.length === 1 && docs3[0].finding_count === 2);

console.log("== Edge-Cases ==");
check("leere Liste -> 0 Dokumente", d.mergeIntoDocuments([]).length === 0);
check("Item ohne URL/Titel wird nicht crashen", Array.isArray(d.mergeIntoDocuments([{ id: "x", sourceId: "s" }])));
check("Fundstellen-Dedup: gleiche source+URL nur einmal", (() => {
  const dup = d.mergeIntoDocuments([
    { id: "r1", sourceId: "s1", url: "https://x.de/1", originalUrl: "https://x.de/1", publishedAt: "2026-07-13" },
    { id: "r2", sourceId: "s1", url: "https://x.de/1", originalUrl: "https://x.de/1", publishedAt: "2026-07-13" }
  ]);
  return dup.length === 1 && dup[0].finding_count === 1;
})());

// ============================ MIGRATIONS-KONSISTENZ ============================
console.log("== Migration: additiv + Rollback + Fundstellen-Tabelle ==");
const migDir = path.join(__dirname, "..", "supabase", "migrations");
const up = fs.readFileSync(path.join(migDir, "20260715_dedup_findings.sql"), "utf8");
const down = fs.readFileSync(path.join(migDir, "20260715_dedup_findings_rollback.sql"), "utf8");
const added = [...up.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]);
const dropped = new Set([...down.matchAll(/drop column if exists (\w+)/g)].map((m) => m[1]));
check("raw_documents um 4 Spalten erweitert", added.length === 4 && added.includes("content_fingerprint") && added.includes("publisher_id"));
check("Rollback entfernt jede Spalte", added.every((c) => dropped.has(c)));
check("document_findings-Tabelle angelegt", /create table if not exists public\.document_findings/.test(up) && /drop table if exists public\.document_findings/.test(down));
check("content_fingerprint getrennt von content_hash dokumentiert", /getrennt.*content_hash/i.test(up));
check("Migration additiv (kein DROP/ALTER an Bestandsspalten)", !/drop column/.test(up) && /alter table public\.raw_documents\n\s+add column/.test(up));
check("document_findings RLS service_role-only", /enable row level security/.test(up) && /BEWUSST KEINE for-select-Policy/.test(up));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
