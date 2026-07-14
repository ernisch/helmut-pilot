"use strict";

// Test des Quellenmodus (off/shadow/on) + relationaler Crawl-Plan (source-mode.js).
// REINE LOGIK mit synthetischen Fixtures + echte Scheduler-Integration (Fallback-Pfad).
// Deckt die Auftrags-Pflichtfälle ab:
//   - Default off; on/shadow nur explizit; eingecheckte Flags-Datei setzt KEINEN Quellenmodus
//   - Ein Abrufweg global genau EINMAL (100 gleiche Profile -> identischer Plan)
//   - Ohne aktive Profile laufen NUR always_on-Kernwege
//   - Berlin/Brandenburg VOLLSTÄNDIG ausgeschlossen (auch bei aktivem Paket!)
//   - dev_only/Testquellen nie; pausierte/archivierte (Orphans) nicht reaktiviert
//   - broken (u. a. bot-gesperrt) -> defekt, NICHT ausführbar
//   - DIP bleibt eigener API-Pfad (nicht Teil des Quellen-Crawls)
//   - doppelte URLs laufen genau einmal (auch profilgenerierte vs. Plan)
//   - ON-Modus: Fallback auf alten Katalog bei fehlender DB / leerem Plan

const { sourceMode, buildRelationalCrawlPlan, comparePlans, mergeProfileAndPlanSources, isLandesmodulPath } = require("../lib/helmut/quellenarchitektur/source-mode");
const flags = require("../lib/helmut/flags");
const path = require("path");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Modus-Guard --------------------------------------------------------------------
check("1a Default off (leeres env)", sourceMode({}) === "off");
check("1b shadow erkannt", sourceMode({ HELMUT_SOURCE_MODE: "shadow" }) === "shadow");
check("1c on erkannt (gebaut, aber nicht aktiviert)", sourceMode({ HELMUT_SOURCE_MODE: "on" }) === "on");
check("1d Unsinn -> off", sourceMode({ HELMUT_SOURCE_MODE: "1" }) === "off" && sourceMode({ HELMUT_SOURCE_MODE: "true" }) === "off");
const checkedIn = flags.loadFileFlags(path.join(__dirname, "..", "helmut-flags.json"));
check("1e eingecheckte Flags-Datei setzt KEINEN Quellenmodus (Cutover freigabepflichtig)", checkedIn.HELMUT_SOURCE_MODE === undefined);

// --- Fixtures ---------------------------------------------------------------------------
const PACKAGES = [
  { id: "pk-bund", key: "bund-basis", status: "active" },
  { id: "pk-aus", key: "arbeit-und-soziales", status: "active" },
  { id: "pk-be", key: "berlin-basis", status: "active" }, // ABSICHTLICH aktiv: hartes Gate muss trotzdem sperren
  { id: "pk-cem", key: "cem-ince-persoenlich", status: "active" }
];
const PATHS = [
  { id: "rp-bundestag", legacy_source_id: "bundestag", name: "Bundestag", method: "rss", url: "https://www.bundestag.de/rss", status: "healthy", activation_mode: "always_on", priority: 100, is_critical: true },
  { id: "rp-bmas", legacy_source_id: "bmas", name: "BMAS", method: "rss", url: "https://bmas.de/rss.xml", status: "healthy", activation_mode: "auto", priority: 95 },
  { id: "rp-sozial-news", legacy_source_id: "sozial-news", name: "Soziales-Suche", method: "googlenews_search", url: "https://news.google.com/rss/search?q=soziales", status: "needs_review", activation_mode: "auto", priority: 80 },
  { id: "rp-sozial-dup", legacy_source_id: "sozial-dup", name: "Soziales-Suche Kopie", method: "googlenews_search", url: "https://news.google.com/rss/search?q=soziales", status: "needs_review", activation_mode: "auto", priority: 70 },
  { id: "rp-be-plenum", legacy_source_id: "be-plenum", name: "Berlin PARDOK", method: "structured_download", url: "https://parlament-berlin.de/x.xml", status: "needs_review", activation_mode: "manual", priority: 60, is_critical: true },
  { id: "rp-kaputt", legacy_source_id: "kaputt", name: "Bot-gesperrt", method: "rss", url: "https://bot.example/rss", status: "broken", activation_mode: "auto", priority: 75, last_error: "403 bot protection", error_streak: 9 },
  { id: "rp-test", legacy_source_id: "testquelle", name: "Testquelle", method: "rss", url: "https://test.example/rss", status: "healthy", activation_mode: "dev_only", priority: 50 },
  { id: "rp-orphan", legacy_source_id: "orphan", name: "Orphan pausiert", method: "rss", url: "https://orphan.example/rss", status: "paused", activation_mode: "auto", priority: 50 },
  { id: "rp-unref", legacy_source_id: "unref", name: "Ohne Paket", method: "rss", url: "https://unref.example/rss", status: "healthy", activation_mode: "auto", priority: 50 },
  { id: "rp-dip", legacy_source_id: "dip", name: "DIP", method: "api", url: "https://search.dip.bundestag.de/api/v1", status: "healthy", activation_mode: "always_on", priority: 96, is_critical: true }
];
const LINKS = [
  { package_id: "pk-bund", retrieval_path_id: "rp-bundestag" },
  { package_id: "pk-bund", retrieval_path_id: "rp-bmas" },
  { package_id: "pk-bund", retrieval_path_id: "rp-dip" },
  { package_id: "pk-aus", retrieval_path_id: "rp-sozial-news" },
  { package_id: "pk-aus", retrieval_path_id: "rp-sozial-dup" },
  { package_id: "pk-aus", retrieval_path_id: "rp-kaputt" },
  { package_id: "pk-be", retrieval_path_id: "rp-be-plenum" },
  { package_id: "pk-bund", retrieval_path_id: "rp-test" },
  { package_id: "pk-bund", retrieval_path_id: "rp-orphan" }
];
// Aktivierungsberechtigtes Bundestagsprofil mit Sozial-Ausschuss (zieht bund-basis + arbeit-und-soziales).
const CEM = { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", parliament: "Bundestag", committees: ["Arbeit und Soziales"], focusTopics: ["Rente"] };
const LEGACY = [
  { id: "bundestag", name: "Bundestag (Legacy)", type: "institution", url: "https://www.bundestag.de", rssUrl: "https://www.bundestag.de/rss", crawlMethod: "rss", priority: 100, active: true },
  { id: "bmas", name: "BMAS", type: "ministry", url: "https://bmas.de", rssUrl: "https://bmas.de/rss.xml", crawlMethod: "rss", priority: 95, active: true },
  { id: "nur-alt", name: "Nur im Altkatalog", type: "media", url: "https://alt.example", rssUrl: "https://alt.example/rss", crawlMethod: "rss", priority: 40, active: true },
  { id: "alt-dup", name: "Alt-Duplikat", type: "media", url: "https://alt.example", rssUrl: "https://alt.example/rss", crawlMethod: "rss", priority: 30, active: true },
  { id: "cem-person", name: "Cem Suche", type: "person", url: "", rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22", crawlMethod: "rss", priority: 100, active: true }
];

// --- 2) Plan mit einem aktiven Profil -----------------------------------------------------
const plan = buildRelationalCrawlPlan({ retrievalPaths: PATHS, packages: PACKAGES, packagePaths: LINKS, profiles: [CEM], legacySources: LEGACY });
const aktivIds = plan.aktiv.map((p) => p.id);
check("2a Bundestag (always_on) im Plan", aktivIds.includes("rp-bundestag"));
check("2b BMAS (bund-basis referenziert) im Plan", aktivIds.includes("rp-bmas"));
check("2c Sozial-Suche (arbeit-und-soziales via Ausschuss) im Plan", aktivIds.includes("rp-sozial-news"));
check("2d BE/BB HART gesperrt — obwohl Paket berlin-basis 'active' ist",
  !aktivIds.includes("rp-be-plenum") && plan.ausgeschlossen.some((a) => a.id === "rp-be-plenum" && /landesmodul-gesperrt/.test(a.grund)));
check("2e dev_only-Testquelle nie im Plan", !aktivIds.includes("rp-test") && plan.ausgeschlossen.some((a) => a.id === "rp-test" && /dev-only/.test(a.grund)));
check("2f pausierter Orphan NICHT reaktiviert", !aktivIds.includes("rp-orphan") && plan.ausgeschlossen.some((a) => a.id === "rp-orphan" && /nicht-reaktiviert/.test(a.grund)));
check("2g Weg ohne Paketreferenz inaktiv", !aktivIds.includes("rp-unref") && plan.ausgeschlossen.some((a) => a.id === "rp-unref" && /kein-aktives-paket/.test(a.grund)));
check("2h broken/bot-gesperrt -> defekt, nicht ausführbar", !aktivIds.includes("rp-kaputt") && plan.defekt.some((d) => d.id === "rp-kaputt" && /defekt/.test(d.grund)));
check("2i DIP bleibt eigener API-Pfad (nicht im Quellen-Crawl-Plan)", !aktivIds.includes("rp-dip") && plan.ausgeschlossen.some((a) => a.id === "rp-dip" && /dip/i.test(a.grund)));
check("2j doppelte URL läuft genau einmal", aktivIds.includes("rp-sozial-news") && !aktivIds.includes("rp-sozial-dup") && plan.ausgeschlossen.some((a) => a.id === "rp-sozial-dup" && /doppelter-abrufweg/.test(a.grund)));
check("2k Legacy-Quellobjekt wird bevorzugt (Name/Typ aus Altkatalog)",
  plan.aktiv.find((p) => p.id === "rp-bundestag").source.name === "Bundestag (Legacy)" &&
  plan.aktiv.find((p) => p.id === "rp-bundestag").source.type === "institution");
check("2l googlenews_search -> Crawler-Form rss mit rssUrl", (() => { const s = plan.aktiv.find((p) => p.id === "rp-sozial-news").source; return s.crawlMethod === "rss" && s.rssUrl === "https://news.google.com/rss/search?q=soziales"; })());

// --- 3) Ohne aktive Profile: NUR always_on-Kernwege ---------------------------------------
const leer = buildRelationalCrawlPlan({ retrievalPaths: PATHS, packages: PACKAGES, packagePaths: LINKS, profiles: [], legacySources: LEGACY });
check("3a ohne Profile: nur always_on (rp-bundestag)", leer.aktiv.length === 1 && leer.aktiv[0].id === "rp-bundestag");
check("3b BMAS ohne Profil inaktiv (kein-aktives-paket)", leer.ausgeschlossen.some((a) => a.id === "rp-bmas" && /kein-aktives-paket/.test(a.grund)));

// --- 4) 100 identische Profile: EXAKT derselbe Plan (kein doppelter Crawl) ----------------
const hundert = buildRelationalCrawlPlan({ retrievalPaths: PATHS, packages: PACKAGES, packagePaths: LINKS, profiles: Array.from({ length: 100 }, (_, i) => ({ ...CEM, id: `p-${i}` })), legacySources: LEGACY });
check("4a 100 gleiche Profile -> identische aktive Weg-Menge wie 1 Profil",
  JSON.stringify(hundert.aktiv.map((p) => p.id).sort()) === JSON.stringify(plan.aktiv.map((p) => p.id).sort()));
check("4b jeder Weg genau einmal (keine Duplikate im Plan)", new Set(hundert.aktiv.map((p) => p.id)).size === hundert.aktiv.length);

// --- 5) Defektes Profil zählt nicht (keine falsche Aktivierung) ---------------------------
const kaputtProfil = buildRelationalCrawlPlan({ retrievalPaths: PATHS, packages: PACKAGES, packagePaths: LINKS, profiles: [{ id: "x" }], legacySources: LEGACY });
check("5a leeres/unbrauchbares Profil aktiviert nichts (nur always_on)", kaputtProfil.aktiv.length === 1 && kaputtProfil.aktiv[0].id === "rp-bundestag");

// --- 6) Vergleich alter vs. relationaler Plan ----------------------------------------------
const cmp = comparePlans({ legacySources: LEGACY, relationalPlan: plan });
check("6a fehlend im Relationalen erkannt (nur-alt/alt-dup/kaputt)", cmp.fehlendImRelationalen.includes("nur-alt"));
check("6b person-Quelle zählt nicht als fehlend (kein shared-Katalog-Weg)", !cmp.fehlendImRelationalen.includes("cem-person"));
check("6c doppelte URLs im Altkatalog erkannt", cmp.doppelteImLegacy.some((d) => d.id === "alt-dup" && d.wie === "nur-alt"));
check("6d Zahlen konsistent", cmp.quellenzahl.relationalAktiv === plan.aktiv.length && cmp.quellenzahl.alt === LEGACY.filter((s) => s.type !== "person").length);

// --- 7) mergeProfileAndPlanSources: profilgenerierte Personensuche + Plan ohne Doppel-Crawl -
const personSrc = { id: "person-cem", type: "person", rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22", crawlMethod: "rss" };
const planPersonSrc = { id: "cem-ince-news", type: "person", rssUrl: "https://news.google.com/rss/search?q=%22Cem+Ince%22", crawlMethod: "rss" };
const merged = mergeProfileAndPlanSources([personSrc], [planPersonSrc, { id: "bundestag", rssUrl: "https://www.bundestag.de/rss" }]);
check("7a dieselbe (normalisierte) Such-URL läuft genau einmal — Profilquelle gewinnt",
  merged.filter((s) => /Cem/.test(s.rssUrl || "")).length === 1 && merged[0].id === "person-cem");
check("7b andere Quellen bleiben erhalten", merged.some((s) => s.id === "bundestag"));

// --- 8) isLandesmodulPath: alle Erkennungswege ---------------------------------------------
check("8a rp-be-Präfix", isLandesmodulPath({ id: "rp-be-x" }, []) === true);
check("8b legacy be-Präfix", isLandesmodulPath({ id: "rp-x", legacy_source_id: "bb-plenum" }, []) === true);
check("8c Paket-Zugehörigkeit", isLandesmodulPath({ id: "rp-x" }, ["berlin-basis"]) === true);
check("8d Bundesweg nicht betroffen", isLandesmodulPath({ id: "rp-bundestag", legacy_source_id: "bundestag" }, ["bund-basis"]) === false);

// --- 9) Scheduler-Integration: off byte-identisch, on ohne DB -> Fallback ------------------
(async () => {
  process.env.HELMUT_STORAGE_BACKEND = "local"; // keine Supabase-Konfiguration -> Loader liefert null
  const prevMode = process.env.HELMUT_SOURCE_MODE;
  const { getSourcesForProfile } = require("../lib/helmut/scheduler");
  const { cemInceProfile } = require("../lib/helmut/config");
  try {
    process.env.HELMUT_SOURCE_MODE = "off";
    const offSources = await getSourcesForProfile(cemInceProfile);
    process.env.HELMUT_SOURCE_MODE = "on";
    const onSources = await getSourcesForProfile(cemInceProfile);
    check("9a off: alter Katalog liefert Quellen", Array.isArray(offSources) && offSources.length > 0);
    check("9b on OHNE erreichbare relationale DB: Fallback = byte-identisch zum alten Katalog",
      JSON.stringify(onSources.map((s) => s.id)) === JSON.stringify(offSources.map((s) => s.id)));
    process.env.HELMUT_SOURCE_MODE = "shadow";
    const shadowSources = await getSourcesForProfile(cemInceProfile);
    check("9c shadow: byte-identisch zum alten Katalog (Vergleich läuft NIE im Crawl-Pfad)",
      JSON.stringify(shadowSources.map((s) => s.id)) === JSON.stringify(offSources.map((s) => s.id)));
  } finally {
    if (prevMode === undefined) delete process.env.HELMUT_SOURCE_MODE; else process.env.HELMUT_SOURCE_MODE = prevMode;
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Quellenmodus-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
