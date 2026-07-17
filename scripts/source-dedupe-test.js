"use strict";

// Dubletten-Schutz im Crawl-Plan (Sprint Google-News-Härtung, Phase 2).
//
// Production-Beleg der Dublette: source_id `cem-ince-news` lief pro Crawl zweimal
// (145 Telemetrie-Zeilen, 144 distinct source_id in den Läufen il02g/v268f/mb1k6),
// weil personNewsSource bei leerem fullName eine ANDERE Google-Such-URL baut
// (q="cem-ince") als der relationale Pfad rp-cem-ince-news (q="Cem Ince") — die
// reine URL-Dedup griff nicht. Diese Suite belegt:
//   1. identische source_id -> genau EIN Eintrag (first-wins, Profilquelle zuerst)
//   2. identische URL, verschiedene ids -> ein Eintrag (bestehende URL-Dedup)
//   3. unterschiedliche Quellen mit ähnlichen Namen, aber eigenen ids -> BEIDE bleiben
//   4. keine echte Quelle geht verloren (nur die Doppel-Einreihung entfällt)
//   5. dedupeSourcesById als generischer Schutz (auch Fallback-Katalogpfad)
// Nur synthetische Daten, kein Netz, kein Store.

const { mergeProfileAndPlanSources, dedupeSourcesById } = require("../lib/helmut/quellenarchitektur/source-mode");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── 1. Die reale Dublette: gleiche id, unterschiedliche Such-URLs ────────────
const personSource = {
  id: "cem-ince-news",
  name: "cem-ince News-Suche", // fullName fehlte zur Laufzeit -> Slug-Query
  type: "person",
  rssUrl: "https://news.google.com/rss/search?q=%22cem-ince%22&hl=de&gl=DE&ceid=DE:de",
  rssUrls: ["https://news.google.com/rss/search?q=%22cem-ince%22&hl=de&gl=DE&ceid=DE:de"]
};
const planSource = {
  id: "cem-ince-news", // rp-cem-ince-news -> legacy_source_id
  name: "Cem Ince News-Suche",
  type: "media",
  rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de",
  rssUrls: ["https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de"]
};
const otherPlan = { id: "news-bundesrat-soziales", name: "Bundesrat Sozialpolitik", rssUrl: "https://news.google.com/rss/search?q=site:bundesrat.de&hl=de" };

const merged = mergeProfileAndPlanSources([personSource], [planSource, otherPlan]);
check("gleiche source_id trotz anderer URL -> genau ein Eintrag", merged.filter((s) => s.id === "cem-ince-news").length === 1);
check("first-wins: Profilquelle (Personen-Kennzeichnung) überlebt", merged.find((s) => s.id === "cem-ince-news").type === "person");
check("andere Quellen bleiben unberührt", merged.some((s) => s.id === "news-bundesrat-soziales"));
check("Quellenzahl sinkt exakt um die Dublette (3 Eingaben -> 2)", merged.length === 2);

// distinct-ids-Invariante: keine source_id doppelt im Ergebnis
const ids = merged.map((s) => s.id);
check("keine source_id doppelt im Plan", new Set(ids).size === ids.length);

// ── 2. Bestehende URL-Dedup bleibt erhalten ──────────────────────────────────
const urlDup = mergeProfileAndPlanSources(
  [{ id: "a-news", rssUrl: "https://news.google.com/rss/search?q=%22X%20Y%22&hl=de" }],
  [{ id: "rp-a-news-alt", rssUrl: "https://news.google.com/rss/search?q=%22X Y%22&hl=de" }]
);
check("gleiche normalisierte URL, verschiedene ids -> ein Eintrag", urlDup.length === 1 && urlDup[0].id === "a-news");

// ── 3. Ähnliche Namen, aber eigene ids/URLs -> KEINE Zusammenlegung ─────────
const similar = mergeProfileAndPlanSources(
  [{ id: "meyer-news", name: "Anna Meyer News-Suche", rssUrl: "https://news.google.com/rss/search?q=%22Anna%20Meyer%22" }],
  [{ id: "meier-news", name: "Anna Meier News-Suche", rssUrl: "https://news.google.com/rss/search?q=%22Anna%20Meier%22" }]
);
check("ähnliche Namen, eigene ids -> beide Quellen bleiben", similar.length === 2);

// ── 4. Keine echte Quelle geht verloren (nur Doppel-Einreihung entfällt) ────
const input = [personSource, planSource, otherPlan];
const inputIds = new Set(input.map((s) => s.id));
const mergedIds = new Set(merged.map((s) => s.id));
check("jede logische Quelle (distinct id) bleibt vertreten", [...inputIds].every((id) => mergedIds.has(id)));

// ── 4b. Präferenzregel: Slug-Query verliert gegen kuratierte Namens-Query ───
// Der reale Fall: personNewsSource lief mit LEEREM fullName (Query "cem-ince",
// nameQueryComplete:false); der relationale Pfad trägt die korrekte Suche
// q="Cem Ince". Bei id-Kollision überlebt dann der kuratierte Weg — die
// BESSERE Suche darf nicht verworfen werden.
const slugPerson = { ...personSource, nameQueryComplete: false };
const preferPlan = mergeProfileAndPlanSources([slugPerson], [planSource, otherPlan]);
check("Slug-basierte Personensuche (fullName leer) -> kuratierter Plan-Weg gewinnt",
  preferPlan.filter((s) => s.id === "cem-ince-news").length === 1 &&
  preferPlan.find((s) => s.id === "cem-ince-news").name === "Cem Ince News-Suche");

// Vollständige Namens-Query (nameQueryComplete:true) -> Profilquelle gewinnt weiter
const fullPerson = { ...personSource, name: "Cem Ince News-Suche (Profil)", nameQueryComplete: true };
const preferProfile = mergeProfileAndPlanSources([fullPerson], [planSource]);
check("vollständige Namens-Query -> Profilquelle gewinnt (first-wins)",
  preferProfile.length === 1 && preferProfile[0].name === "Cem Ince News-Suche (Profil)");

// ── 5. dedupeSourcesById (Fallback-Katalogpfad) ─────────────────────────────
const fb = dedupeSourcesById([
  { id: "x-news", name: "X Suche", rssUrl: "https://example.invalid/a" },
  { id: "x-news", name: "X Suche (Katalog)", rssUrl: "https://example.invalid/b" },
  { id: "y-news", name: "Y Suche", rssUrl: "https://example.invalid/c" },
  null
]);
check("dedupeSourcesById: gleiche id -> first-wins", fb.length === 2 && fb[0].name === "X Suche");
check("dedupeSourcesById: null-Einträge werden verworfen", fb.every(Boolean));

// Quellen ohne id werden nicht fälschlich zusammengeworfen
const noId = dedupeSourcesById([{ name: "ohne id 1" }, { name: "ohne id 2" }]);
check("Quellen ohne id bleiben getrennt", noId.length === 2);

console.log(`\n${passed}/${passed + failed} Quellen-Dedup-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
