"use strict";

// Test des PREPARED-Seed-Generators fuer das Bund-Fachthemenpaket energie-klima-umwelt-bund
// (scripts/generate-energie-klima-umwelt-seed.js + lib/.../seeds/energie-klima-umwelt-bund.js).
//
// Prueft die SICHERHEITS- und QUALITAETSINVARIANTEN (Auftrag §10):
//   - technisch INAKTIV (Paket prepared; Wege needs_review + manual)
//   - keine ID-Kollisionen, keine Domain-Dubletten, keine historischen Behoerden-Dubletten
//   - keine Aenderung bestehender AKTIVER Quellen (Seed fasst nur eigene Ids an; DO NOTHING)
//   - kein ungewollter Seed-Update (ON CONFLICT DO NOTHING, keine DO UPDATE)
//   - method-CHECK-konform, deterministisch, idempotent, sicherer/guarded Rollback
//   - semantischer Dublettencheck (BMWE/BMWK/BMWi, BMUKN/BMUV/BMU, BNetzA/SMARD,
//     vier ÜNB/gemeinsame NEP, Agora/dena/ISE, BAFA/KfW, Ausschuesse/DIP)
//
// REIN OFFLINE. Wird von scripts/run-offline-tests.js automatisch eingesammelt.

const {
  buildEnergieKlimaUmweltSeed, KANDIDATEN, NEUE_ENTITAETEN, PUBLISHER_META, FUTURE_TARGETS, AUSGESCHLOSSEN
} = require("../lib/helmut/quellenarchitektur/seeds/energie-klima-umwelt-bund");
const { build, buildRollback } = require("./generate-energie-klima-umwelt-seed");

// Basis-Seed-Rohtext + bestehender Katalog fuer den Kollisions-/Dublettencheck.
const fs = require("fs");
const path = require("path");
const BASE_SEED = fs.readFileSync(path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql"), "utf8");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const seed = buildEnergieKlimaUmweltSeed();
const { sql } = build();
const rollback = buildRollback(seed);

// --- 1. Zeilenzahlen / Umfang -----------------------------------------------
check("1 Paket (prepared)", seed.package.status === "prepared" && seed.package.id === "pkg-energie-klima-umwelt-bund");
check("8 neue Entitaeten", seed.entities.length === 8);
check("8 neue Herausgeber (destatis wiederverwendet)", seed.publishers.length === 8);
check("9 Abrufwege", seed.retrievalPaths.length === 9);
check("9 Paketzuordnungen (alle auf das neue Paket)", seed.packagePaths.length === 9 && seed.packagePaths.every((pp) => pp.package_id === "pkg-energie-klima-umwelt-bund"));
check("9 path_expected_levels (alle bund) + 9 path_expected_geographies (alle geo-bund)",
  seed.pathExpectedLevels.length === 9 && seed.pathExpectedLevels.every((l) => l.level === "bund") &&
  seed.pathExpectedGeographies.length === 9 && seed.pathExpectedGeographies.every((g) => g.geography_id === "geo-bund"));

// --- 2. Technisch INAKTIV (hart im SQL) -------------------------------------
check("Paket status='prepared' im SQL (kein 'active')", /'pkg-energie-klima-umwelt-bund'.*'prepared'/.test(sql) && !/'pkg-energie-klima-umwelt-bund'.*'active'/.test(sql));
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 9 Abrufwege needs_review + manual", nManual === 9);
check("Seed-Selbstpruefung: 0 aktive Wege", seed.summary.aktiveAbrufwege === 0);
check("Seed-Selbstpruefung: 0 technisch verifiziert (Egress gesperrt)", seed.summary.technischVerifiziert === 0);
check("jeder Weg verifyBeforeActivation=true", seed.retrievalPaths.every((p) => p.verifyBeforeActivation === true));

// --- 3. method-CHECK-konform ------------------------------------------------
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
check("alle Wege googlenews_search (site-gescopt, keine erfundenen Ziel-Feeds)", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
check("keine URL zeigt auf einen erfundenen Ziel-Feed (nur news.google.com)", seed.retrievalPaths.every((p) => /^https:\/\/news\.google\.com\/rss\/search\?/.test(p.url)));

// --- 4. Idempotent + transaktional + nicht-destruktiv -----------------------
check("ON CONFLICT DO NOTHING fuer alle 7 Tabellenbloecke", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 7);
check("KEIN 'do update' (kein ungewollter Bestands-Update)", !/do update/i.test(sql));
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
// Determinismus: zweimaliger Build ergibt identisches SQL.
check("deterministische Generierung (2x identisch)", build().sql === sql);

// --- 5. Keine ID-Kollisionen mit dem Basis-Seed -----------------------------
const allNewIds = [
  seed.package.id,
  ...seed.entities.map((e) => e.id),
  ...seed.publishers.map((p) => p.id),
  ...seed.retrievalPaths.map((p) => p.id)
];
check("neue Ids sind untereinander eindeutig", new Set(allNewIds).size === allNewIds.length);
// Keine dieser neuen Ids darf bereits als INSERT-Ziel im Basis-Seed vorkommen.
const kollision = allNewIds.filter((id) => new RegExp(`\\('${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(BASE_SEED));
check("keine ID-Kollision mit Basis-Seed (destatis-Reuse per Referenz, nicht als neue Id)", kollision.length === 0);
// destatis wird referenziert, aber NICHT als neuer Herausgeber/Entitaet angelegt.
check("publisher-destatis.de NICHT als neuer Herausgeber angelegt (Reuse)", !seed.publishers.some((p) => p.id === "publisher-destatis.de"));
check("statoffice-destatis NICHT als neue Entitaet angelegt (Reuse)", !seed.entities.some((e) => e.id === "statoffice-destatis"));
check("Destatis-Weg referenziert bestehenden Herausgeber", seed.retrievalPaths.some((p) => p.id === "rp-destatis-energie-umwelt" && p.publisher_id === "publisher-destatis.de"));

// --- 6. Keine Domain-Dubletten (neu vs. neu und neu vs. Basis) --------------
const newDomains = seed.publishers.map((p) => p.canonical_domain);
check("neue Domains untereinander eindeutig", new Set(newDomains).size === newDomains.length);
const domainKollision = newDomains.filter((d) => new RegExp(`'${d.replace(/\./g, "\\.")}'`).test(BASE_SEED));
check("keine Domain kollidiert mit dem Basis-Seed", domainKollision.length === 0);

// --- 7. Keine historischen Behoerden-Dubletten (semantischer Check) ---------
// Historische Kuerzel/Namen duerfen NUR als Alias, NIE als eigene Entitaet/Domain auftreten.
const bmwe = NEUE_ENTITAETEN.find((e) => e.id === "ministry-bmwe");
const bmukn = NEUE_ENTITAETEN.find((e) => e.id === "ministry-bmukn");
check("BMWE fuehrt BMWK+BMWi als Alias (eine Entitaet, keine Dublette)",
  ["BMWE", "BMWK", "BMWi"].every((a) => bmwe.aliases.includes(a)));
check("BMUKN fuehrt BMUV+BMU als Alias (eine Entitaet, keine Dublette)",
  ["BMUKN", "BMUV", "BMU"].every((a) => bmukn.aliases.includes(a)));
check("genau EINE Wirtschafts-/Energieressort-Entitaet (kein separates BMWK)",
  NEUE_ENTITAETEN.filter((e) => e.entity_type === "ministry" && /wirtschaft/i.test(e.name)).length === 1);
check("genau EINE Umweltressort-Entitaet (kein separates BMUV/BMU)",
  NEUE_ENTITAETEN.filter((e) => e.entity_type === "ministry" && /umwelt/i.test(e.name)).length === 1);
check("aktueller Name = BMWE/BMUKN (nicht historisch BMWK/BMUV)",
  /Wirtschaft und Energie/.test(bmwe.name) && /Klimaschutz, Naturschutz und nukleare Sicherheit/.test(bmukn.name));
// namensneutrale Domains (kein bmwk.de / bmwe.de / bmuv.de -> keine historische Domain-Dublette)
check("BMWE-Domain namensneutral (bundeswirtschaftsministerium.de)", bmwe && PUBLISHER_META["bundeswirtschaftsministerium.de"].entity_id === "ministry-bmwe");
check("BMUKN-Domain namensneutral (bundesumweltministerium.de)", bmukn && PUBLISHER_META["bundesumweltministerium.de"].entity_id === "ministry-bmukn");

// --- 8. Semantischer Dublettencheck (Auftrag §10) ---------------------------
// BNetzA/SMARD: SMARD ist KEIN Weg, sondern Future Target.
check("SMARD ist Future Target (kein Abrufweg)",
  !seed.retrievalPaths.some((p) => /smard/i.test(p.url) || /smard/i.test(p.name)) &&
  FUTURE_TARGETS.some((f) => /SMARD/.test(f.name)));
// Vier ÜNB / gemeinsame NEP: genau EIN gebuendelter ÜNB-Weg, KEINE vier Einzelwege.
check("genau EIN gebuendelter ÜNB-Weg (keine 4 Einzelwege)",
  seed.retrievalPaths.filter((p) => /uenb|netzentwicklungsplan/i.test(p.id)).length === 1);
check("keine ÜNB-Einzeldomains (50hertz/amprion/tennet/transnetbw)",
  !newDomains.some((d) => /50hertz|amprion|tennet|transnetbw/i.test(d)) &&
  FUTURE_TARGETS.some((f) => /ÜNB-Newsrooms/.test(f.name)));
// Agora/dena/ISE/UFZ: keine Think-Tank-Wege im Kern (Domains + Namen als ganze Woerter;
// KEINE Substring-Pruefung — 'ise' steckt sonst in "EnergiepreISE").
check("keine Think-Tank-Wege (Agora/dena/ISE/UFZ) im Paket",
  !newDomains.some((d) => /agora-energiewende|(^|\.)dena\.de|ise\.fraunhofer|(^|\.)ufz\.de/i.test(d)) &&
  !seed.retrievalPaths.some((p) => /\b(Agora|dena|Fraunhofer|UFZ)\b/.test(p.name)) &&
  FUTURE_TARGETS.some((f) => /Agora Energiewende \/ dena \/ Fraunhofer ISE \/ UFZ/.test(f.name)));
// BAFA/KfW: KfW nicht separat modelliert.
check("BAFA vorhanden, KfW als Future Target (nicht separat)",
  seed.retrievalPaths.some((p) => p.id === "rp-bafa-foerderung") &&
  !seed.retrievalPaths.some((p) => /kfw/i.test(p.id + p.name)) &&
  FUTURE_TARGETS.some((f) => /KfW/.test(f.name)));
// Bundestagsausschuesse/DIP: KEINE parallelen Ausschuss-/DIP-Suchwege.
check("keine parallelen Ausschuss-/DIP-Wege (Bestand deckt ab)",
  !seed.retrievalPaths.some((p) => /committee|ausschuss|dip/i.test(p.id)) &&
  AUSGESCHLOSSEN.some((a) => /Ausschusssuchen/.test(a.name)));

// --- 9. Tier- und Frequenzverteilung ----------------------------------------
check("Tier 1 = 5, Tier 2 = 3, Tier 3 = 1", seed.summary.tier.tier1 === 5 && seed.summary.tier.tier2 === 3 && seed.summary.tier.tier3 === 1);
check("jeder Weg hat eine gueltige Frequenzklasse", seed.retrievalPaths.every((p) => ["ereignisnah", "regelmaessig", "periodisch"].includes(KANDIDATEN.find((c) => c.id === p.id).frequenz)));
check("nicht alles ereignisnah (Frequenz nach Publikationsart)", seed.summary.frequenz.ereignisnah === 1);

// --- 10. Rollback: vollstaendig, guarded, dependency-korrekt ----------------
check("Rollback loescht geographies+levels+package_paths+retrieval_paths, guarded package+publishers+entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
check("Rollback guarded (not exists) fuer Paket/Herausgeber/Entitaeten", (rollback.match(/not exists/g) || []).length === 3);
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
// Der Reuse-Herausgeber/-Entitaet darf NICHT in der jeweiligen delete-Liste stehen
// (der Pfadname rp-destatis-energie-umwelt enthaelt legitim das Wort "destatis").
const pubDeleteLine = rollback.split("\n").find((l) => /delete from public\.publishers/.test(l)) || "";
const entDeleteLine = rollback.split("\n").find((l) => /delete from public\.political_entities/.test(l)) || "";
check("Rollback loescht destatis NICHT (nicht in publishers-/entities-delete-Liste)",
  !/publisher-destatis\.de/.test(pubDeleteLine) && !/statoffice-destatis/.test(entDeleteLine));

console.log(`\n== Ergebnis: ${seed.retrievalPaths.length} Wege · ${fail === 0 ? "ALLE TESTS GRUEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
