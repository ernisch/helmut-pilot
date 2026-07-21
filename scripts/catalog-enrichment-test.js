"use strict";

// Sprint 5 · Master-Katalog-Befuellung + Tagging (Datenqualitaet). REINE LOGIK. Deckt ab:
// politische Klassifizierung (Ministerien als Primaerquellen ihres Ressorts), Entitaets-/Regions-
// Aufloesung, Deduplizierung (katalog dedup-sauber), Determinismus. KEINE Schaetzungen: unbelegte
// Ressorts/Politikfelder bleiben ungetaggt.

const master = require("../lib/helmut/quellenarchitektur/master");
const model = require("../lib/helmut/quellenarchitektur/master/model");
const VP = require("../lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan");
const { COMMITTEE_RELATIONS } = require("../lib/helmut/quellenarchitektur/seeds/mandate-registry");
const { normalizeParty, normalizeCommittee } = require("../lib/helmut/matching");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const recs = master.buildMasterCatalog().records;
const byId = new Map(recs.map((r) => [r.id, r]));

// 1) Politische Klassifizierung: Ministerien tragen ihr Ressort-Politikfeld (aus Sprint-1-Wahrheit).
const bmas = byId.get("seed-ministry-bmas");
check("1 Ministerium ist Primaerquelle seines Ressorts (BMAS -> arbeit-und-soziales)",
  bmas && (bmas.topics || []).includes("arbeit-und-soziales"));
check("2 BMF traegt beide zugeordneten Politikfelder (finanzen + haushalt)",
  (byId.get("seed-ministry-bmf").topics || []).sort().join(",") === "finanzen,haushalt");
const taggedMinistries = recs.filter((r) => r.source_type === "ministerium" && (r.topics || []).length > 0);
check("3 die Mehrzahl der Ministerien ist mit Politikfeldern getaggt",
  taggedMinistries.length >= 12, String(taggedMinistries.length));

// 4) Tagging ist AUS DER MANDATSWAHRHEIT abgeleitet (kein erfundenes Feld).
let inconsistent = null;
for (const r of taggedMinistries) {
  for (const t of r.topics) {
    const rel = COMMITTEE_RELATIONS[t];
    if (!rel || !rel.policyField) { inconsistent = `${r.id}:${t}`; break; }
  }
  if (inconsistent) break;
}
check("4 jedes Ministeriums-Tag entspricht einem belegten Politikfeld (keine Schaetzung)", inconsistent === null, inconsistent || "");

// 5) KEINE Schaetzung: Politikfelder ohne belegtes Ministerium bleiben ungetaggt.
const allTaggedTopics = new Set(taggedMinistries.flatMap((r) => r.topics));
check("5 unbelegte Ressorts bleiben ungetaggt (z. B. petitionen/sport/europa nicht bei Ministerien)",
  !allTaggedTopics.has("petitionen") && !allTaggedTopics.has("sport") && !allTaggedTopics.has("europa"));

// 6) Entitaets-Aufloesung: Partei/Fraktion-Referenzen -> kanonische Matching-Schluessel.
const linkeDesc = VP.masterRecordToDescriptor(byId.get("seed-party-linke"));
check("6 Partei-Entitaet (party-linke) loest auf kanonischen Schluessel auf (-> linke)",
  normalizeParty(linkeDesc.party) === "linke");
const groupDesc = VP.masterRecordToDescriptor(byId.get("seed-group-bt-linke"));
check("7 Fraktions-Entitaet (group-bt-linke) loest auf kanonischen Schluessel auf",
  normalizeParty(groupDesc.faction) === "linke");
// 8) Regions-Aufloesung: Geografie-ID -> Regionsslug.
const berlinRec = recs.find((r) => (r.region_ids || []).includes("geo-land-berlin"));
if (berlinRec) {
  const d = VP.masterRecordToDescriptor(berlinRec);
  check("8 Region-Entitaet (geo-land-berlin) loest auf Regionsslug auf (-> berlin)", d.regions.includes("berlin"), JSON.stringify(d.regions));
} else check("8 Region-Entitaet loest auf Regionsslug auf", false, "kein Berlin-Record");

// 9) Rueckwaertskompatibel: bereits normalisierte Schluessel laufen unveraendert durch.
const passthrough = VP.masterRecordToDescriptor({ id: "x", party_id: "linke", region_ids: ["niedersachsen"] });
check("9 bereits normalisierte Werte bleiben unveraendert (kein doppeltes Mapping)",
  normalizeParty(passthrough.party) === "linke" && passthrough.regions.includes("niedersachsen"));

// 10) Deduplizierung: der Katalog ist kanonisch dedup-sauber (keine sicheren Dubletten zu entfernen).
const keyCount = new Map();
for (const r of recs) { const k = r.canonical_key || model.canonicalSourceKey(r); keyCount.set(k, (keyCount.get(k) || 0) + 1); }
check("10 keine doppelten kanonischen Quellen-Schluessel (dedup-sauber)",
  [...keyCount.values()].every((c) => c === 1));
const idCount = new Map();
for (const r of recs) idCount.set(r.id, (idCount.get(r.id) || 0) + 1);
check("11 keine doppelten Quellen-IDs", [...idCount.values()].every((c) => c === 1));

// 12) Determinismus: der Katalogaufbau ist reproduzierbar.
const recs2 = master.buildMasterCatalog().records;
check("12 Katalogaufbau ist deterministisch (identische Records)",
  JSON.stringify(recs.map((r) => r.id)) === JSON.stringify(recs2.map((r) => r.id)) && recs.length === recs2.length);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Katalog-Befuellungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
