"use strict";
// Lokaler, exakt gebundener Importplan; keine Verbindung und keine Ausfuehrung.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const F = require("../lib/helmut/verstehen-frische5-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const PAYLOAD_HASH = "64302058e779c571e895b97832c7ed2aa9ead1d618b868bc07497ea830441b12";
// Genau dieselben Spalten wie die Raw-Document-Zeilen des Produktionspfads
// (`storage.V3_RAW_DOCUMENT_COLUMNS`); keine erfundene Spalte, keine ausgelassene.
const RAW_SPALTEN = ["id", "canonical_url", "content_hash", "cluster_id", "title", "summary",
  "url", "source_name", "source_id", "source_type", "confidence", "link_type", "published_at",
  "retrieved_at", "document_type", "wahlperiode", "raw", "created_at", "content_fingerprint",
  "publisher_id", "canonical_target_url", "finding_count"];
const TABELLEN = ["mandate_profiles", "profiles", "helmut_jobs", "pipeline_locks", "process_runs",
  "helmut_verstehen_reservierungen", "ko_document_links", "knowledge_objects", "helmut_store", "raw_documents", "document_findings"];
function grundlinie(e) {
  const ids = `select x->>'id' from jsonb_array_elements(${e}->'rows') x`;
  return "jsonb_build_object(" + TABELLEN.map(t => {
    const where = t === "helmut_store" ? `where id <> '${F.EINGABE}'`
      : t === "raw_documents" ? `where id not in (${ids})`
        : t === "document_findings" ? `where raw_document_id not in (${ids})` : "";
    // Jede vollstaendige Zeile einmal hashen, dann nur feste 64-Zeichen-Werte
    // sortieren. Einschliesslich Duplikatanzahl/NULL-Werten/aller Spalten;
    // keine Stichprobe und keine Begrenzung des geschuetzten Bestands.
    return `'${t}',(with zeilen as materialized (select encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') h from public.${t} p ${where}) select encode(sha256(convert_to(coalesce(string_agg(h, E'\\n' order by h),''),'UTF8')),'hex') from zeilen)`;
  }).join(",\n") + ")";
}
function pickRawSpalten(row) {
  const out = {};
  for (const spalte of RAW_SPALTEN) if (Object.hasOwn(row, spalte)) out[spalte] = row[spalte];
  return out;
}
// Der Importpayload entsteht aus der ECHTEN globalen Dedup-Logik
// (`dedup-global.planDedupWrites`) und genau der Raw-Document-Abbildung des
// Produktionspfads in `storage.persistRawDocumentsDeduped`. Zeiten, Titel,
// Inhalt, Kennung und Bestandsadresse bleiben unveraendert; der Beleg wird
// ausschliesslich an die so entstandene Quellenzeile gebunden.
function bauePayload(quellen, belege) {
  if (!Array.isArray(quellen) || quellen.length !== 5 || !Array.isArray(belege) || belege.length !== 5) {
    throw Error("frische5-payload-anzahl");
  }
  const G = require("../lib/helmut/quellenarchitektur/dedup-global");
  const A = require("../lib/helmut/artikelkontext");
  const B = require("../lib/helmut/bundestag-artikelstand");
  const plan = G.planDedupWrites(quellen, []);
  if (plan.persists.length !== 5 || plan.findings.length !== 5
    || Object.keys(plan.countIncrements).length !== 0) throw Error("frische5-dedup-partition");
  const rows = plan.persists.map(doc => {
    const stand = B.leseArtikelstand(doc);
    const row = { ...doc,
      canonical_target_url: stand ? null : (doc.canonical_url || null),
      publisher_id: doc.publisher_domain ? `publisher-${doc.publisher_domain}` : null,
      source_id: doc.primary_source_id || doc.source_id || null };
    for (const k of ["findings", "publisher_domain", "primary_source_id", "external_identity"]) delete row[k];
    return pickRawSpalten(row);
  });
  const findings = plan.findings.map(f => ({ raw_document_id: f.raw_document_id,
    source_id: f.source_id || "unbekannt", retrieval_path_id: f.retrieval_path_id || null,
    original_url: f.original_url || "", link_type: f.link_type || null, found_at: f.found_at || null }));
  const clean = belege.map(b => A.pruefeArtikelkontext(rows, b)).sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (new Set(clean.map(b => b.dokumentId)).size !== 5) throw Error("frische5-beleg-doppelt");
  return { rows, findings, belege: clean };
}
function plane(payload) {
  if (typeof payload !== "string" || hash(payload) !== PAYLOAD_HASH || payload.includes("$eingabe$")) throw Error("frische5-payload-abweichend");
  const data = JSON.parse(payload);
  F.ausGesichertenBelegen(data.rows, data.belege);
  if (data.findings.length !== 5) throw Error("frische5-fundzahl");
  const locks = `set constraints all immediate;
lock table ${TABELLEN.map(t => "public." + t).join(",")} in share row exclusive mode;`;
  let sql = fs.readFileSync(path.join(__dirname, "fixtures/quellenfrische-30-vorbereitung.sql"), "utf8")
    .replace(/^[\s\S]*?begin;/, "-- Genau5 neue Quellen; atomar, keine Wiederholung bei unklarem Ausgang.\nbegin;")
    .replace(/lock table[^;]*;\nlock table[^;]*;/, locks)
    .replace(/<>30\b/g, "<>5").replace("<>504", "<>500")
    .replace("__SHA256__", PAYLOAD_HASH).replace("__PAYLOAD__", () => payload)
    .replace("or exists(select 1 from public.mandate_profiles where aktiv)", `or (select count(*) from public.profiles)<>501
    or (select count(*) from public.helmut_store where id in('main','main-auth'))<>2
    or exists(select 1 from public.mandate_profiles where aktiv is distinct from false or geloescht_at is not null)
    or exists(select 1 from public.helmut_verstehen_reservierungen where lease_bis>now())
    or exists(select 1 from public.helmut_store where id in('${F.EINGABE}','${F.QUITTUNG}'))`)
    .replace(/grundlinie := jsonb_build_object\([\s\S]*?'main'\)\);/, "grundlinie := " + grundlinie("eingabe") + ";")
    .replace(/  if grundlinie is distinct from jsonb_build_object\([\s\S]*?'main'\)\) then/, `  insert into public.helmut_store(id,data) values ('${F.EINGABE}', eingabe || jsonb_build_object(
    'status','importiert','payloadHash','${PAYLOAD_HASH}','angelegtAm',now()));
  if not exists(select 1 from public.helmut_store where id='${F.EINGABE}'
    and data-'status'-'payloadHash'-'angelegtAm'=eingabe) then raise exception 'frische5-belegablage-abweichend'; end if;
  if grundlinie is distinct from ${grundlinie("eingabe")} then`);
  let rueckweg = require("./quellenfrische-30-plan").baueRueckweg(payload)
    .replace(/<>30\b/g, "<>5").replaceAll("frische30", "frische5")
    .replace(/lock table[^;]*;\nlock table[^;]*;/, locks)
    .replace("n integer;", "n integer; grundlinie jsonb;")
    .replace("begin\n if exists", `begin
 if (select count(*) from public.mandate_profiles)<>500 or (select count(*) from public.profiles)<>501
  or exists(select 1 from public.helmut_verstehen_reservierungen where lease_bis>now())
  or exists(select 1 from public.helmut_store where id='${F.QUITTUNG}')
  or not exists(select 1 from public.helmut_store where id='${F.EINGABE}'
    and data-'status'-'payloadHash'-'angelegtAm'=e and data->>'status'='importiert') then
   raise exception 'frische5-rueckweg-belegstand'; end if;
 grundlinie := ${grundlinie("e")};
 if exists`)
    .replace("where aktiv)", "where aktiv is distinct from false or geloescht_at is not null)")
    .replace("end $rueckweg$;", `delete from public.helmut_store where id='${F.EINGABE}';
 get diagnostics n=row_count; if n<>1 then raise exception 'frische5-rueckweg-belegzahl'; end if;
 if exists(select 1 from public.document_findings where raw_document_id in(select x->>'id' from jsonb_array_elements(e->'rows')x))
  or grundlinie is distinct from ${grundlinie("e")} then raise exception 'frische5-rueckweg-fremde-wirkung'; end if;
end $rueckweg$;`);
  if (!sql.includes("insert into public.helmut_store") || sql.includes("__PAYLOAD__")) throw Error("frische5-vorlage-abweichend");
  return { sql, rueckweg, bericht: { dokumente: 5, belege: 5, payloadHash: PAYLOAD_HASH,
    importHash: hash(sql), rueckwegHash: hash(rueckweg), ausgefuehrt: false } };
}
if (require.main === module) {
  const [input, prefix, extra] = process.argv.slice(2);
  if (!input || !prefix || extra) throw Error("frische5-aufruf");
  const p = plane(fs.readFileSync(input, "utf8"));
  for (const [name, value] of Object.entries({ "import.sql": p.sql, "rueckweg.sql": p.rueckweg,
    "sqlplan.json": JSON.stringify(p.bericht, null, 2) })) fs.writeFileSync(prefix + "-" + name, value, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(p.bericht));
}
module.exports = { plane, bauePayload, PAYLOAD_HASH, grundlinie, TABELLEN, RAW_SPALTEN };
