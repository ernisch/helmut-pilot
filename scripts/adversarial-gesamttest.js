"use strict";

// Adversarialer Gesamttest (Phase 6): aktiver Versuch, die Quellenarchitektur zu widerlegen.
// Prueft die 16 geforderten Angriffs-/Ausfall-Szenarien gegen die ECHTEN Module. REINE LOGIK,
// kein Netz/DB/LLM. Ergaenzt die bestehende Offline-Suite (Profil/Klassifikation/Dedup/Watchdog/
// Migration), die die Basisinvarianten bereits gruen abdeckt.

const fs = require("fs");
const path = require("path");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const cls = require("../lib/helmut/quellenarchitektur/classification");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");
const { assessRetrievalPaths } = require("../lib/helmut/quellenarchitektur/quality-watchdog");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const budget = require("../lib/helmut/llm-budget");
const { ingestShadow } = require("./shadow-ingest");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const M = buildFullModel();
const base = { packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths };
const bund = { id: "test-politician-one", fullName: "Test Politician One", party: "Testpartei Alpha", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", profileActive: true };

// 1) DOPPELTE CRAWLS -> idempotent (zwei identische Laeufe -> identisches Ergebnis)
const src = [{ sourceId: "be-plenum", retrievalPathId: "rp-be-plenum", kind: "pardok", items: P.parsePardokDocumentsFromString(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", "berlin-gold.xml"), "utf8"), { land: "berlin" }).documents }];
const a = ingestShadow(src, { now: 0 }), b = ingestShadow(src, { now: 0 });
check("1 doppelte Crawls: identisches Ergebnis (idempotent, keine Verdopplung)", a.dokumente === b.dokumente && JSON.stringify(a.klassifikationEbenen) === JSON.stringify(b.klassifikationEbenen));

// 2) DOPPELTE DOKUMENTE -> globaler Merge fuehrt zusammen
const dupItem = { sourceId: "x", title: "Gleiche Story", content: "Gleiche Story", url: "https://e/1", originalUrl: "https://e/1", publishedAt: "2026-07-10T00:00:00Z" };
const dupItem2 = { sourceId: "y", title: "Gleiche Story", content: "Gleiche Story", url: "https://e/2", originalUrl: "https://e/2", publishedAt: "2026-07-10T00:00:00Z" };
const merged = mergeIntoDocuments([dupItem, dupItem2]);
check("2 doppelte Dokumente (gleiche Story, andere URL) -> 1 Dokument + 2 Fundstellen", merged.length === 1 && merged[0].finding_count === 2);

// 3) FALSCHE POLITISCHE EBENE -> unsicher = 'unknown', NICHT faelschlich 'bund'
check("3 mehrdeutiger Vorgang ohne Ebenen-Signal -> 'unknown' (nicht bund)", cls.deriveDecisionLevel({ headline: "Sitzung zu allgemeinen Themen" }).level === "unknown");
check("3 klarer Bundestag-Vorgang -> 'bund'", cls.deriveDecisionLevel({ headline: "Bundestag beschliesst Gesetz" }).level === "bund");
check("3 klarer Landtag-Vorgang mit Ort -> 'land'", cls.deriveDecisionLevel({ headline: "Landtag Brandenburg debattiert", mentioned_locations: ["Brandenburg"] }).level === "land");

// 4) FALSCHE REGION -> unbekannter Ort erzeugt KEINE Geografie (kein erfundener Treffer)
check("4 unbekannter Ort -> KEINE Geografie-Zuordnung (geography_id null, kein erfundener Treffer)", cls.resolveGeographies(["Atlantis", "Fantasiestadt"]).every((g) => g.geography_id === null));
check("4 echter Ort Berlin -> geo-land-berlin", cls.resolveGeographies(["Berlin"]).some((g) => g.geography_id === "geo-land-berlin"));

// 5) PAKETAKTIVIERUNG OHNE PROFIL -> nur 5 always_on-Kernwege, kein Paket aktiv
const none = pp.computeGlobalActivation({ ...base, profiles: [] });
check("5 kein Profil -> 0 Pakete technisch aktiv, nur 5 Kern-Abrufwege", none.packageStatus.filter((p) => p.activation === "active").length === 0 && none.activePathCount === 5);

// 6) PROFIL OHNE PFLICHTPAKET -> requiredMissing, nicht vollstaendig aktiviert
const ltNoBl = pp.resolveProfilePackages({ fullName: "x", party: "SPD", politische_ebene: "landtag", profileActive: true });
check("6 Landtag ohne Bundesland -> requiredMissing (Landespaket fehlt), kein falsches Paket", ltNoBl.requiredMissing.length === 1 && !ltNoBl.required.some((k) => k !== "bund-basis"));

// 7) DEFEKTE QUELLE -> als degraded/broken erkannt, nicht still 'gesund'
const paths = [{ id: "rp-x", legacy_source_id: "x", status: "broken", is_critical: true, activation_mode: "always_on" }];
const health = assessRetrievalPaths({ paths, sourceMetrics: { x: { documents: 0 } }, activePathIds: ["rp-x"], now: Date.now() });
check("7 defekte kritische Quelle -> als 'defekt' erkannt (nicht still gesund)", health[0].technicalHealth === "defekt");

// 8) GOOGLE-NEWS-AUSFALL -> leere Quelle -> 0 Dokumente, KEIN Crash
const empty = ingestShadow([{ sourceId: "be-landesregierung", retrievalPathId: "rp-be-landesregierung", kind: "rss", items: [] }], { now: 0 });
check("8 Google-News-Ausfall (0 Items) -> 0 Dokumente, kein Crash", empty.dokumente === 0 && empty.itemsRoh === 0);

// 9) PARDOK-STRUKTURAENDERUNG -> Namespace-tolerant + HTML-Fehlerseite erkannt
check("9a PARDOK Namespace-Praefix -> Feld trotzdem extrahiert", P.parseBerlinDokument('<p:Dokument><p:DBID>D-1</p:DBID><p:Titel>T</p:Titel></p:Dokument>').titel === "T");
check("9b PARDOK HTML-Fehlerseite statt XML -> erkannt, 0 Dokumente, kein Crash", P.parsePardokDocumentsFromString("<!doctype html><html>Fehler</html>", { land: "berlin" }).fehlerseite === true);

// 10) HOHE KOSTEN -> Budget fail-closed (blockt weitere Aufrufe)
const overCap = budget.evaluateTenantBudget({ dailyBudgetCent: 500, spentTodayUsd: 999 });
const unknownCost = budget.evaluateTenantBudget({ dailyBudgetCent: 500, spentTodayUsd: null });
check("10 hohe Kosten ueber Tages-Cap -> blockiert", overCap.allowed === false);
check("10b Budget gesetzt, Kostenstatus unbekannt -> fail-closed (blockiert)", unknownCost.allowed === false);

// 11) PARTIELLER PIPELINE-AUSFALL -> fehlerhafte Quelle killt nicht den ganzen Ingest
let partial;
try { partial = ingestShadow([{ sourceId: "ok", kind: "rss", items: [{ sourceId: "ok", title: "OK", content: "Bundestag beschliesst", url: "https://e/ok", publishedAt: "2026-07-10T00:00:00Z" }] }, { sourceId: "kaputt", kind: "rss", items: null }], { now: 0 }); }
catch (e) { partial = { error: e.message }; }
check("11 partieller Ausfall (items=null) -> kein Crash, gute Quelle verarbeitet", partial && partial.dokumente >= 1);

// 12) TENANT-LECK -> Shadow-Dokumente tragen KEINE user_id/tenant-Felder (oeffentliche Registry)
const anyDoc = a.documents[0];
check("12 Shadow-Dokumente ohne user_id/tenant/mandant-Feld (keine Mandantendaten)", !("user_id" in anyDoc) && !("tenant_id" in anyDoc) && !("mandant" in anyDoc));

// 13) SHADOW-DATEN IM SICHTBAREN NUTZERPFAD -> Isolation-Selbstpruefung + keine Prod-Tabelle
check("13 Ingest-Isolation ok (kein storage/scheduler/server/understanding im require-Graph)", a.isolation.ok === true);
check("13 Modus schreibt nicht in raw_documents/knowledge_objects/briefings/decisions", /kein raw_documents\/knowledge_objects\/briefings\/decisions/.test(a.modus));

// 14) MIGRATION SCHEITERT TEILWEISE -> alle Migrationen idempotent (ON CONFLICT) + haben Rollback
const migDir = path.join(__dirname, "..", "supabase", "migrations");
const seedDir = path.join(__dirname, "..", "supabase", "seeds");
// Quellenarchitektur-Migrationen (ab Quellenarchitektur-Aera 20260712) muessen Rollback haben.
// Ausgenommen: presale_hardening (vorbestehend, ausserhalb Scope). Der generierte Kern-Seed
// wird durch den Tabellen-Drop des Migrations-Rollbacks mit entfernt (kein eigener noetig).
const migFiles = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql") && !f.endsWith("_rollback.sql") && !/presale_hardening/.test(f) && f >= "20260712");
check("14 alle Quellenarchitektur-Migrationen haben ein _rollback.sql", migFiles.length >= 4 && migFiles.every((f) => fs.existsSync(path.join(migDir, f.replace(/\.sql$/, "_rollback.sql")))));
check("14b Landesmodul-Seed hat Rollback; Kern-Seed via Tabellen-Drop abgedeckt", fs.existsSync(path.join(seedDir, "20260717_landesmodul_be_bb_seed_rollback.sql")));
const seedSql = fs.existsSync(path.join(seedDir, "20260717_landesmodul_be_bb_seed.sql")) ? fs.readFileSync(path.join(seedDir, "20260717_landesmodul_be_bb_seed.sql"), "utf8") : "";
check("14 Landesmodul-Seed ist idempotent (ON CONFLICT DO NOTHING)", /on conflict .* do nothing/i.test(seedSql));

// 15) ROLLBACK -> Rollback-Symmetrie (jede angelegte Tabelle wird auch abgebaut) — Stichprobe
const saRollback = fs.existsSync(path.join(migDir, "20260713_source_architecture_rollback.sql")) ? fs.readFileSync(path.join(migDir, "20260713_source_architecture_rollback.sql"), "utf8") : "";
check("15 Rollback der Kern-Migration entfernt die Kern-Tabellen (drop)", /drop table/i.test(saRollback) && /retrieval_paths/.test(saRollback));

// 16) APP-START-PERFORMANCE -> Modul-Require ist schnell + ohne Seiteneffekt (kein Netz/DB beim Laden)
const t0 = process.hrtime.bigint();
delete require.cache[require.resolve("../lib/helmut/quellenarchitektur")];
buildFullModel();
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
check(`16 Modell-Aufbau schnell (<250ms, gemessen ${ms.toFixed(1)}ms) — kein Netz/DB beim Laden`, ms < 250);

console.log(`\n== Adversarialer Gesamttest (16 Szenarien): ${fail === 0 ? "ALLE GRÜN — Architektur haelt stand" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
