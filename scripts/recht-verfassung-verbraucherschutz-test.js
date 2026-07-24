"use strict";

// Offline-Test des PREPARED-Pakets "recht-verfassung-und-verbraucherschutz-bund".
// Beweist die Sicherheits- und Qualitaetseigenschaften des Seeds (Auftrag §11/§12):
//   1. Paket ist prepared + is_base=false + vollstaendig inaktiv.
//   2. ALLE neuen Wege: needs_review + manual + is_critical=false.
//   3. Alle Werte sind modell-/DB-CHECK-konform (entity_type/evidence_role/method/status/...).
//   4. Kollisionsfreiheit: keine neue ID/Domain kollidiert mit dem Basis-Seed.
//   5. Wiederverwendung: rp-dip/rp-bundesregierung existieren im Basis-Seed und werden NUR
//      via package_paths verknuepft (NICHT neu angelegt, NICHT als path_expected_* dupliziert).
//   6. Wiederverwendete Entitaeten (committee-bt-recht) existieren; keine zweite BMJV-Entity.
//   7. Genau 7 Retrieval Paths (5 neu + 2 wiederverwendet); K1..K7-Korrekturen eingehalten.
//   8. Seed-Generierung ist deterministisch (zweimal identisch) und der SQL-Output idempotent.

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const {
  buildRechtVerfassungVerbraucherschutzSeed, PACKAGE, WIEDERVERWENDETE_WEGE
} = require("../lib/helmut/quellenarchitektur/seeds/recht-verfassung-verbraucherschutz");
const gen = require("./generate-recht-verfassung-verbraucherschutz-seed");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const seed = buildRechtVerfassungVerbraucherschutzSeed();
const baseSeedSql = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql"), "utf8"
);

// --- 1) Paketgrundzustand -----------------------------------------------------------------
check("1a Paketname kanonisch", seed.package.key === "recht-verfassung-und-verbraucherschutz-bund");
check("1b Paket-ID kanonisch", seed.package.id === "pkg-recht-verfassung-und-verbraucherschutz-bund");
check("1c Paket prepared", seed.package.status === "prepared");
check("1d Paket is_base=false", seed.package.is_base === false);
check("1e Paket bund/geo-bund", seed.package.political_level === "bund" && seed.package.geography_id === "geo-bund");
check("1f Paketstatus im Enum", model.PACKAGE_STATUS.includes(seed.package.status));

// --- 2) Alle neuen Wege inaktiv -----------------------------------------------------------
for (const p of seed.retrievalPaths) {
  check(`2 ${p.id} needs_review+manual+is_critical=false`,
    p.status === "needs_review" && p.activation_mode === "manual" && p.is_critical === false,
    `${p.status}/${p.activation_mode}/${p.is_critical}`);
}
check("2z Summary: 0 aktive/kritische neue Wege",
  seed.summary.aktiveNeueAbrufwege === 0 && seed.summary.kritischeNeueAbrufwege === 0);

// --- 3) Modell-/CHECK-Konformitaet --------------------------------------------------------
for (const e of seed.entities) {
  check(`3ent ${e.id} entity_type gueltig`, model.ENTITY_TYPES.includes(e.entity_type), e.entity_type);
  check(`3ent ${e.id} level gueltig`, ["international","eu","bund","land","kommune"].includes(e.level), e.level);
}
for (const p of seed.publishers) {
  check(`3pub ${p.id} evidence_role gueltig`, model.EVIDENCE_ROLES.includes(p.evidence_role), p.evidence_role);
  check(`3pub ${p.id} trust gueltig`, model.TRUST_LEVELS.includes(p.trust), p.trust);
  check(`3pub ${p.id} lifecycle gueltig`, model.PUBLISHER_LIFECYCLE.includes(p.lifecycle_status), p.lifecycle_status);
}
for (const p of seed.retrievalPaths) {
  check(`3rp ${p.id} method gueltig`, model.RETRIEVAL_METHODS.includes(p.method), p.method);
  check(`3rp ${p.id} status gueltig`, model.PATH_STATUS.includes(p.status), p.status);
  check(`3rp ${p.id} activation gueltig`, model.ACTIVATION_MODES.includes(p.activation_mode), p.activation_mode);
  check(`3rp ${p.id} url ist https`, /^https:\/\//.test(p.url), p.url);
}

// --- 4) Kollisionsfreiheit gegen Basis-Seed -----------------------------------------------
function baseHasId(id) { return baseSeedSql.includes(`'${id}'`); }
for (const e of seed.entities) check(`4ent ${e.id} kollidiert NICHT mit Basis`, !baseHasId(e.id));
for (const p of seed.publishers) {
  check(`4pub ${p.id} kollidiert NICHT mit Basis`, !baseHasId(p.id));
  check(`4dom ${p.canonical_domain} kollidiert NICHT mit Basis`, !baseSeedSql.includes(`'${p.canonical_domain}'`), p.canonical_domain);
}
for (const p of seed.retrievalPaths) check(`4rp ${p.id} kollidiert NICHT mit Basis`, !baseHasId(p.id));

// --- 5) Wiederverwendung korrekt ----------------------------------------------------------
check("5a genau 2 wiederverwendete Wege", WIEDERVERWENDETE_WEGE.length === 2);
for (const rp of WIEDERVERWENDETE_WEGE) {
  check(`5b ${rp} existiert im Basis-Seed`, baseHasId(rp));
  check(`5c ${rp} NICHT unter neuen Abrufwegen`, !seed.retrievalPaths.some((p) => p.id === rp));
  check(`5d ${rp} NUR via package_paths`, seed.packagePaths.some((pp) => pp.retrieval_path_id === rp)
    && !seed.pathExpectedLevels.some((l) => l.retrieval_path_id === rp)
    && !seed.pathExpectedGeographies.some((g) => g.retrieval_path_id === rp)
    && !seed.pathExpectedEntities.some((x) => x.retrieval_path_id === rp));
}
// Ausschuss-Weg nutzt den bestehenden Bundestag-Herausgeber (keine Dublette).
check("5e Ausschuss-Weg an publisher-bundestag.de (bestehend)",
  seed.retrievalPaths.find((p) => p.id === "rp-ausschuss-recht-verbraucherschutz").publisher_id === "publisher-bundestag.de"
  && baseHasId("publisher-bundestag.de"));

// --- 6) Entitaeten-Wiederverwendung / keine Dubletten -------------------------------------
check("6a wiederverwendete Ausschuss-Entity committee-bt-recht existiert", baseHasId("committee-bt-recht"));
check("6b path_expected_entities verweist auf committee-bt-recht",
  seed.pathExpectedEntities.some((x) => x.entity_id === "committee-bt-recht"));
check("6c genau EINE BMJV-Ministeriums-Entity (keine zweite)",
  seed.entities.filter((e) => e.entity_type === "ministry").length === 1);
check("6d BMJV-Aliase enthalten historische Namen (K1)", (() => {
  const bmjv = seed.entities.find((e) => e.id === "ministry-bmjv");
  return bmjv && bmjv.aliases.includes("BMJ") && bmjv.aliases.includes("Bundesministerium der Justiz")
    && bmjv.name === "Bundesministerium der Justiz und für Verbraucherschutz";
})());
check("6e keine Person-Entity (K2)", !seed.entities.some((e) => e.entity_type === "person"));
check("6f BfDI-Entity ist Institution, nicht Amtsinhaber (K2)", (() => {
  const bfdi = seed.entities.find((e) => e.id === "authority-bfdi");
  return bfdi && bfdi.entity_type === "authority" && /Bundesbeauftragte für den Datenschutz/.test(bfdi.name);
})());

// --- 7) Zielarchitektur: 7 Wege, Korrekturen ----------------------------------------------
check("7a genau 7 Retrieval Paths im Paket", seed.summary.retrievalPathsGesamt === 7, String(seed.summary.retrievalPathsGesamt));
check("7b 5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("7c BfDI EIN gebuendelter Weg (K3)", seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-bfdi.bund.de").length === 1);
check("7d BVerfG EIN Weg, Pressemitteilungen, keine Volltextdatenbank (K6)", (() => {
  const bv = seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-bundesverfassungsgericht.de");
  return bv.length === 1 && /Presse/i.test(bv[0].url) && !/entscheidung|rechtsprechung/i.test(bv[0].url);
})());
check("7e BMJV zwei differenzierte Wege auf EINER Domain (§9)", (() => {
  const bm = seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-bmjv.de");
  return bm.length === 2 && new Set(bm.map((p) => p.url)).size === 2;
})());
check("7f kein Bundesamt-fuer-Justiz-Weg (K4 -> Future Target)",
  !seed.retrievalPaths.some((p) => /bundesjustizamt|bundesamt-fuer-justiz|bfj/i.test(p.id + p.url)));
check("7g kein Google-News-Rechtsthemenweg dupliziert (rp-committee-recht bleibt global)",
  !seed.packagePaths.some((pp) => pp.retrieval_path_id === "rp-committee-recht"));

// --- 8) Determinismus + Idempotenz --------------------------------------------------------
check("8a Build deterministisch (2x identisch)",
  JSON.stringify(seed) === JSON.stringify(buildRechtVerfassungVerbraucherschutzSeed()));
const { sql } = gen.build();
check("8b SQL doppelt identisch (deterministisch)", sql === gen.build().sql);
check("8c SQL idempotent (on conflict do nothing ueberall)",
  (sql.match(/insert into/g) || []).length === (sql.match(/on conflict/g) || []).length);
check("8d SQL setzt needs_review+manual hart", sql.includes("'needs_review', 'manual', false"));
check("8e Rollback loescht Kinder vor Eltern + schuetzt wiederverwendete Wege", (() => {
  const rb = gen.buildRollback(seed);
  const iChild = rb.indexOf("path_expected_entities");
  const iPkgPaths = rb.indexOf("delete from public.package_paths where package_id");
  const iRp = rb.indexOf("delete from public.retrieval_paths");
  const iPkg = rb.indexOf("delete from public.source_packages");
  return iChild >= 0 && iChild < iPkgPaths && iPkgPaths < iRp && iRp < iPkg
    && !rb.includes("'rp-dip'") && !rb.includes("'rp-bundesregierung'");
})());

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Paket-Assertions (recht-verfassung-und-verbraucherschutz-bund)`);
process.exit(failed > 0 ? 1 : 0);
