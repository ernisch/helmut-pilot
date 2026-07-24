"use strict";

// Paketbezogener Test des PREPARED-Seeds `familie-gleichstellung-demografie-bund`.
// Belegt die SICHERHEITS- und ARCHITEKTURINVARIANTEN (Auftrag §18/§19):
//   - Paket prepared, is_base=false, KEIN Profil-Mapping, KEIN aktiver Crawl-Plan.
//   - alle neuen Wege needs_review + manual + inaktiv; Bestand nur additiv verknüpft.
//   - keine ID-/Domain-/URL-Kollision; keine Bestandszeile überschrieben.
//   - keine Person als Entität; keine Publikation als Herausgeber.
//   - Berichtsweg gebündelt; Destatis nicht fragmentiert; parlamentarische Wege wiederverwendet.
//   - Seed idempotent; Rollback guarded; Generator deterministisch.
// REIN OFFLINE (kein Netz/KI/DB). Wird vom Offline-Runner automatisch eingesammelt.

const { build, buildRollback, klassifiziere } = require("./generate-familie-gleichstellung-demografie-bund-seed");
const { buildSeed, PACKAGE } = require("../lib/helmut/quellenarchitektur/seeds/familie-gleichstellung-demografie-bund");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { resolveProfilePackages, computeGlobalActivation } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const model = require("../lib/helmut/quellenarchitektur/model");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const seed = buildSeed();
const { sql } = build();
const rollback = buildRollback(seed);
const cls = klassifiziere(seed);
const M = buildFullModel();

// ============================ 1. Zeilenzahlen ============================
check("2 neue Entitäten (ADS + UBSKM)", seed.entities.length === 2);
check("3 neue Herausgeber (BMBFSFJ + ADS + UBSKM)", seed.publishers.length === 3);
check("6 neue Abrufwege", seed.retrievalPaths.length === 6);
check("1 wiederverwendeter Weg (rp-dip)", seed.reusedPathIds.length === 1 && seed.reusedPathIds[0] === "rp-dip");
check("7 Paketzuordnungen (6 neu + rp-dip)", seed.packagePaths.length === 7);
check("6 path_expected_levels · 26 path_expected_topics", seed.pathExpectedLevels.length === 6 && seed.pathExpectedTopics.length === 26);

// ============================ 2. Paket prepared / inaktiv ============================
check("Paket key = familie-gleichstellung-demografie-bund", PACKAGE.key === "familie-gleichstellung-demografie-bund");
check("Paket status = prepared", PACKAGE.status === "prepared");
check("Paket is_base = false", PACKAGE.is_base === false);
check("Paket political_level = bund", PACKAGE.political_level === "bund");
check("Paket ohne required_classes (Fachthema, kein Landesmodul)", Array.isArray(PACKAGE.required_classes) && PACKAGE.required_classes.length === 0);
check("SQL: source_packages prepared + false", /'pkg-familie-gleichstellung-demografie-bund'.*'prepared', false, 'bund'/.test(sql));

// ============================ 3. Alle neuen Wege needs_review + manual + inaktiv ============================
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
check("alle 6 Abrufwege needs_review + manual (im SQL)", (sql.match(/'needs_review', 'manual'/g) || []).length === 6);
check("kein Weg is_critical (vollständig inaktiv, keine always-protected Quelle)", seed.retrievalPaths.every((p) => p.is_critical === false));
check("Builder-Selbstprüfung: 0 aktive neue Wege", seed.summary.aktiveNeueAbrufwege === 0);
check("jeder neue Weg status needs_review + mode manual", seed.retrievalPaths.every((p) => p.status === "needs_review" && p.activation_mode === "manual"));
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));

// ============================ 4. KEIN Profil-Mapping ============================
// Diverse Profile, die thematisch passen würden — KEINES darf das Paket referenzieren.
const testProfile = (extra) => Object.assign({ id: "synth-fgd", name: "Synthetisches Testprofil", politische_ebene: "Bundestag", partei: "SPD", wahlkreis: "Musterstadt 999" }, extra);
const themedProfiles = [
  testProfile({ ausschuesse: ["Familie, Senioren, Frauen und Jugend"] }),
  testProfile({ fachpolitische_schwerpunkte: ["Familienpolitik", "Gleichstellung", "Demografie", "Kinderschutz", "Seniorenpolitik", "Jugendpolitik"] }),
  testProfile({ fachpolitische_schwerpunkte: ["Gender Pay Gap", "Frauen", "Antidiskriminierung"] })
];
check("KEIN Profil-Mapping: kein Profil resolved auf das Paket", themedProfiles.every((p) => !resolveProfilePackages(p).all.includes("familie-gleichstellung-demografie-bund")));

// ============================ 5. KEIN aktiver Crawl-Plan (vollständige Inaktivität) ============================
const packagesWith = [...PACKAGE_DEFINITIONS, { id: PACKAGE.id, key: PACKAGE.key, status: PACKAGE.status, is_base: PACKAGE.is_base }];
const packagePathsWith = [...M.packagePaths, ...seed.packagePaths];
const retrievalPathsWith = [...M.retrievalPaths, ...seed.retrievalPaths];
const activation = computeGlobalActivation({
  profiles: themedProfiles,
  packages: packagesWith,
  packagePaths: packagePathsWith,
  retrievalPaths: retrievalPathsWith
});
const myPkgStatus = activation.packageStatus.find((p) => p.key === PACKAGE.key);
check("Paket-Aktivierung != active (prepared bleibt inaktiv)", !!myPkgStatus && myPkgStatus.activation !== "active");
check("kein neuer Weg im aktiven Crawl-Plan", seed.retrievalPaths.every((p) => !activation.activePathIds.includes(p.id)));
// Belt-and-suspenders: selbst wenn das Paket fälschlich referenziert würde, aktiviert prepared nichts.
const forced = computeGlobalActivation({
  profiles: [], packages: [{ id: PACKAGE.id, key: PACKAGE.key, status: "prepared", is_base: false }],
  packagePaths: seed.packagePaths, retrievalPaths: seed.retrievalPaths
});
check("prepared-Paket aktiviert 0 Wege (auch isoliert)", forced.activePathCount === 0);

// ============================ 6. Keine Person / keine Publikation als Herausgeber ============================
check("KEINE Person als Entität", seed.entities.every((e) => e.entity_type !== "person"));
const entityTypes = new Set(model.ENTITY_TYPES);
check("neue Entitäten haben gültigen Typ (authority)", seed.entities.every((e) => entityTypes.has(e.entity_type) && e.entity_type === "authority"));
const institutionTypes = new Set(["ministry", "authority", "parliament", "government", "statistical_office"]);
check("neue Herausgeber sind Institutionen (kein Bericht/Publikation als Publisher)", seed.publishers.every((p) => institutionTypes.has(p.publisher_type) && !!p.canonical_domain));
// Berichtstitel dürfen NIRGENDS als Herausgeber-/Entitätsname auftauchen (nur als Thema).
const berichtsWoerter = ["familienbericht", "altersbericht", "gleichstellungsbericht", "kinder- und jugendbericht"];
const namen = [...seed.publishers.map((p) => p.name.toLowerCase()), ...seed.entities.map((e) => e.name.toLowerCase())];
check("kein Herausgeber/Entität heißt wie ein Bericht", berichtsWoerter.every((w) => !namen.some((n) => n.includes(w))));

// ============================ 7. Berichtsweg GEBÜNDELT ============================
const berichtePath = seed.retrievalPaths.find((p) => p.id === "rp-fgd-bmbfsfj-berichte");
const berichteTopics = new Set(seed.pathExpectedTopics.filter((t) => t.retrieval_path_id === "rp-fgd-bmbfsfj-berichte").map((t) => t.topic));
check("genau EIN gebündelter Berichtsweg (BMBFSFJ Berichte der Bundesregierung)", !!berichtePath && seed.retrievalPaths.filter((p) => /berichte/.test(p.id)).length === 1);
check("Berichtsweg deckt alle vier Sachverständigenberichte (Themen)", ["familienbericht", "kinder-und-jugendbericht", "gleichstellungsbericht", "altersbericht"].every((t) => berichteTopics.has(t)));
check("Berichtsweg über stabile Übersichtsseite (html), kein Jahres-PDF", berichtePath.method === "html" && /berichte-der-bundesregierung$/.test(berichtePath.url) && !/\.pdf/i.test(berichtePath.url));
check("KEIN eigener Weg/Publisher je Einzelbericht", !seed.retrievalPaths.some((p) => /familienbericht|altersbericht|gleichstellungsbericht/.test(p.id)));

// ============================ 8. Destatis NICHT fragmentiert ============================
const destatisPaths = seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-destatis.de");
check("genau 2 Destatis-Wege (Bevölkerung/Demografie + Gleichstellung)", destatisPaths.length === 2);
check("beide Destatis-Wege am SELBEN Bestands-Herausgeber (keine 2. Destatis-Entität/Domain)", seed.publishers.every((p) => p.canonical_domain !== "destatis.de"));

// ============================ 9. Parlamentarische Wege WIEDERVERWENDET ============================
check("rp-dip als Bestandsweg verknüpft (kein paralleler DIP-Weg)", seed.packagePaths.some((pp) => pp.retrieval_path_id === "rp-dip") && !seed.retrievalPaths.some((p) => p.id === "rp-dip"));
const parlDomains = ["dip.bundestag.de", "bundestag.de", "bundesrat.de"];
check("kein neuer Bundestag/Bundesrat/DIP-Herausgeber (keine parlamentarische Dublette)", seed.publishers.every((p) => !parlDomains.includes(p.canonical_domain)));
check("kein neuer Weg dupliziert ein Parlaments-Ausschuss-/Bundesrat-Ziel", !seed.retrievalPaths.some((p) => /bundesrat|ausschuss|committee|dip/.test(p.id)));

// ============================ 10. Wiederverwendung gültig + KEINE Bestandszeile überschrieben ============================
const exIds = { pub: new Set(M.publishers.map((p) => p.id)), path: new Set(M.retrievalPaths.map((p) => p.id)), ent: new Set(M.entities.map((e) => e.id)), pkg: new Set(M.packages.map((p) => p.id)), dom: new Set(M.publishers.map((p) => p.canonical_domain).filter(Boolean)), url: new Set(M.retrievalPaths.map((p) => p.url).filter(Boolean)) };
check("Wiederverwendung gültig: rp-dip existiert im Bestand", exIds.path.has("rp-dip"));
check("Wiederverwendung gültig: publisher-destatis.de existiert im Bestand", exIds.pub.has("publisher-destatis.de"));
check("Wiederverwendung gültig: Entität ministry-bmfsfj existiert im Bestand", exIds.ent.has("ministry-bmfsfj"));
check("keine Bestandszeile überschrieben: neue Entitäts-IDs disjunkt", seed.entities.every((e) => !exIds.ent.has(e.id)));
check("keine Bestandszeile überschrieben: neue Publisher-IDs disjunkt", seed.publishers.every((p) => !exIds.pub.has(p.id)));
check("keine Bestandszeile überschrieben: neue Weg-IDs disjunkt", seed.retrievalPaths.every((p) => !exIds.path.has(p.id)));
check("keine Bestandszeile überschrieben: Paket-ID neu", !exIds.pkg.has(PACKAGE.id));
check("keine Domain-Dublette: neue Publisher-Domains disjunkt zum Bestand", seed.publishers.every((p) => !exIds.dom.has(p.canonical_domain)));
check("keine normalisierte URL-Dublette gegen Bestand", seed.retrievalPaths.every((p) => !exIds.url.has(p.url)));
// interne Eindeutigkeit
check("neue IDs intern eindeutig", new Set(seed.retrievalPaths.map((p) => p.id)).size === 6 && new Set(seed.publishers.map((p) => p.id)).size === 3 && new Set(seed.entities.map((e) => e.id)).size === 2);
check("neue Publisher-Domains intern eindeutig", new Set(seed.publishers.map((p) => p.canonical_domain)).size === 3);

// ============================ 11. Semantische Dubletten (§18) ============================
check("keine BMBFSFJ/Bundesregierung-Dublette (Entität = ministry-bmfsfj ≠ government-bund)", seed.publishers.find((p) => p.canonical_domain === "bmbfsfj.bund.de").entity_id === "ministry-bmfsfj");
check("keine Gleichstellungsbericht-Domain als Publisher", seed.publishers.every((p) => p.canonical_domain !== "gleichstellungsbericht.de"));
check("ADS/UBSKM eigenständige Entitäten (nicht BMBFSFJ)", seed.entities.map((e) => e.id).sort().join(",") === "authority-antidiskriminierungsstelle,authority-ubskm");

// ============================ 12. Idempotenz + Determinismus ============================
check("ON CONFLICT DO NOTHING (7 Statements, nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 7);
check("transaktional (begin/commit/notify)", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
check("Generator deterministisch (2 Läufe identisch)", build().sql === build().sql);
check("Builder deterministisch (2 Läufe identisch)", JSON.stringify(buildSeed()) === JSON.stringify(buildSeed()));

// ============================ 13. Rollback guarded ============================
check("Rollback löscht path_expected_topics + levels + package_paths + retrieval_paths + source_packages + publishers + political_entities",
  /path_expected_topics/.test(rollback) && /path_expected_levels/.test(rollback) && /delete from public\.package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern", ord(/path_expected_topics/) < ord(/delete from public\.retrieval_paths/) && ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) && ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
check("Rollback löscht rp-dip NICHT (Bestandsweg geschützt)", !/delete from public\.retrieval_paths where id in \([^)]*rp-dip/.test(rollback));
// Nur ausführbare Statements prüfen (Kommentarzeilen nennen die geschützten IDs bewusst zur Doku).
const rollbackStmts = rollback.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
check("Rollback rührt Bestands-Herausgeber/-Entitäten NICHT an (keine DELETE-Referenz)", !/publisher-destatis\.de|publisher-dip\.bundestag\.de|ministry-bmfsfj|statoffice-destatis/.test(rollbackStmts));
check("Rollback: Paket-Löschung guarded (nur wenn prepared + keine Zuordnung)", /source_packages sp where sp\.id = '[^']+' and sp\.status = 'prepared'/.test(rollback) && /not exists \(select 1 from public\.package_paths/.test(rollback));
check("Rollback: Herausgeber/Entität-Löschung guarded (not exists)", (rollback.match(/and not exists/g) || []).length >= 3);

// ============================ 14. Klassifikation / Tier ============================
check("Tier 1 = 3 (BMBFSFJ-Vorhaben + Destatis-Bevölkerung + DIP)", seed.tiers.tier1.length === 3 && seed.tiers.tier1.includes("rp-dip"));
check("Tier 2 = 4 (BMBFSFJ-Berichte + Destatis-Gleichstellung + ADS + UBSKM)", seed.tiers.tier2.length === 4);
check("Tier 3 = 0", seed.tiers.tier3.length === 0);
check("Klassifikation: 5 Google-News-Ersatzwege + 1 direkte Primärquelle (html-Übersicht)", (() => { const b = cls.reduce((m, c) => (m[c.kategorie] = (m[c.kategorie] || 0) + 1, m), {}); return b["Google-News-Ersatzweg"] === 5 && b["direkte Primärquelle"] === 1; })());

console.log(`\n== Ergebnis: ${seed.retrievalPaths.length} neue Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
