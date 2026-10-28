"use strict";

// Two public original-source fixtures only, inside the explicitly named new
// isolated databases. Never update an original row or manufacture provenance.
const assert = require("node:assert/strict");
const KO = require("../../lib/helmut/knowledge-object-version");
const W = require("../../lib/helmut/synthetik-500-w-inventar");
const literal = x => "'" + String(x).replaceAll("'", "''") + "'";
const json = x => literal(JSON.stringify(x)) + "::jsonb";
const COLUMNS = ["id", "title", "summary", "canonical_url", "url", "content_hash", "source_id", "source_name",
  "source_type", "document_type", "link_type", "confidence", "published_at", "retrieved_at", "created_at"];
const PINNED = Object.freeze({ BE: "717c311350b734ae503946cb238d531f7d0c66a77e4bc2b037635fb8f1b24e3d",
  BT: "c6938aebddb2e5c2203b6c5892802010ae78cc46e6d1cf76554995136f2c12ca" });
function checked(replacements) {
  assert(Array.isArray(replacements) && replacements.length === 2);
  assert.deepEqual(replacements.map(r => r.scope).sort(), ["BE", "BT"]);
  for (const r of replacements) {
    assert.equal(r.document.id, "rd-" + PINNED[r.scope]);
    assert.equal(r.document.content_hash, PINNED[r.scope]);
    assert.deepEqual(Object.keys(r.document).sort(), [...W.SOURCE_VERSION_FIELDS].sort());
    KO.pruefe(r.knowledgeObject);
    assert.equal(r.knowledgeObject.id, r.vorgangId.replace(/^vg-/, "ko-"));
    assert.equal(r.knowledgeObject.vorgang_id, r.vorgangId);
    assert.equal(r.knowledgeObject.understanding_model, "local-curated-independent-source-review-NOT-native-U");
    assert.equal(r.knowledgeObject.understanding_tokens, 0); assert.equal(r.knowledgeObject.verstehen_fencing, null);
  }
  return replacements;
}
function installSQL(replacements) {
  checked(replacements);
  const guard = "do $w15$begin if current_database() not in ('helmut_w15_source_bindings_20261028','helmut_w15_full500_20261028b')"
    + " or exists(select 1 from public.mandate_profiles where aktiv) then raise exception 'w15-current-fixture-isolated-zero-only';end if;end$w15$;";
  const statements = [];
  for (const r of replacements) {
    const d = r.document, row = Object.fromEntries(COLUMNS.map(k => [k, d[k]]));
    row.raw = { helmutQuellenkontext: d.quellenauszug_beleg, helmutDipQuellfelder: d.dip_quellfelder,
      helmutBundestagArtikelstand: d.bundestag_artikelstand, helmutBerlinArtikelstand: d.berlin_artikelstand,
      helmutBrandenburgLandtagPresseArtikelstand: d.brandenburg_artikelstand,
      w15LocalOriginalEvidence: { originalHTMLSHA256: d.content_hash, originalURL: d.url,
        publicationPrecision: r.scope === "BE" ? "minute" : "day",
        timestampMeaning: r.scope === "BE" ? "Start of evidenced official publication minute; seconds not evidenced"
          : "Storage normalization of evidenced publication day; publisher clock time unknown" } };
    const fields = [...COLUMNS, "raw"];
    statements.push("insert into public.raw_documents(" + fields.join(",") + ")select "
      + fields.map(k => "r." + k).join(",") + " from jsonb_populate_record(null::public.raw_documents," + json(row) + ")r;");
    statements.push("insert into public.knowledge_objects(" + KO.VERSION_FIELDS.join(",") + ")select "
      + KO.VERSION_FIELDS.map(k => "r." + k).join(",") + " from jsonb_populate_record(null::public.knowledge_objects,"
      + json(r.knowledgeObject) + ")r;");
    statements.push("insert into public.ko_document_links(knowledge_object_id,raw_document_id,created_at)values("
      + [r.knowledgeObject.id, d.id, r.knowledgeObject.created_at].map(literal).join(",") + ");");
  }
  return "begin;set local statement_timeout='15s';set local lock_timeout='3s';" + guard + statements.join("") + "commit;";
}
function postimageSQL(replacements) {
  checked(replacements);
  const ids = replacements.map(r => literal(r.document.id)).join(",");
  const koids = replacements.map(r => literal(r.knowledgeObject.id)).join(",");
  const meta = { quellenauszug_beleg: "d.raw->'helmutQuellenkontext'", dip_quellfelder: "d.raw->'helmutDipQuellfelder'",
    bundestag_artikelstand: "d.raw->'helmutBundestagArtikelstand'", berlin_artikelstand: "d.raw->'helmutBerlinArtikelstand'",
    brandenburg_artikelstand: "d.raw->'helmutBrandenburgLandtagPresseArtikelstand'",
    bundestag_abgerufen_at: "d.retrieved_at", berlin_abgerufen_at: "d.retrieved_at", brandenburg_abgerufen_at: "d.retrieved_at" };
  return "select jsonb_build_object('active',(select count(*)from public.mandate_profiles where aktiv),"
    + "'documents',(select jsonb_agg(jsonb_build_object(" + W.SOURCE_VERSION_FIELDS
      .map(k => literal(k) + "," + (meta[k] || "d." + k)).join(",")
    + ")order by d.id)from public.raw_documents d where d.id in(" + ids + ")),"
    + "'knowledgeObjects',(select jsonb_agg(to_jsonb(k)order by k.id)from(select " + KO.VERSION_FIELDS.join(",")
    + " from public.knowledge_objects where id in(" + koids + "))k),"
    + "'links',(select jsonb_agg(jsonb_build_object('knowledge_object_id',knowledge_object_id,'raw_document_id',raw_document_id)"
    + "order by knowledge_object_id,raw_document_id)from public.ko_document_links where knowledge_object_id in(" + koids + ")));";
}

module.exports = { installSQL, postimageSQL };
