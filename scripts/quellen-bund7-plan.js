"use strict";
// Lokaler SQL-Plan fuer genau sieben bereits gelesene Quellen. Kein DB-Zugang.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const F = require("../lib/helmut/verstehen-bund7-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const PAYLOAD_HASH = "e4c48282338bf161d70e6fa844b7ba09f53834f9821aeded78182387fc521f8f";
function plane(payload) {
  if (typeof payload !== "string" || hash(payload) !== PAYLOAD_HASH || payload.includes("$eingabe$")) throw new Error("bund7-payload-abweichend");
  const data = JSON.parse(payload);
  F.ausGesichertenBelegen(data.rows, data.belege);
  if (data.findings.length !== 7) throw new Error("bund7-fundstellen-abweichend");
  const e = `$eingabe$${payload}$eingabe$::jsonb`;
  let sql = fs.readFileSync(path.join(__dirname, "fixtures/quellenfrische-30-vorbereitung.sql"), "utf8")
    .replace(/^[\s\S]*?begin;/, "-- Vorbereitet: sieben amtliche Quellen, sieben Fundstellen und sieben gebundene Absatze.\nbegin;")
    .replace(/<>30\b/g, "<>7").replace("<>504", "<>500")
    .replace("__SHA256__", PAYLOAD_HASH).replace("__PAYLOAD__", payload)
    .replace("lock table public.raw_documents, public.document_findings", "lock table public.raw_documents, public.document_findings, public.helmut_store")
    .replace("public.pipeline_locks, public.process_runs in share mode;", "public.pipeline_locks, public.process_runs, public.helmut_verstehen_reservierungen in share mode;")
    .replace("or exists(select 1 from public.pipeline_locks", "or exists(select 1 from public.helmut_verstehen_reservierungen where lease_bis>now())\n    or exists(select 1 from public.pipeline_locks")
    .replace("end $import$;", `insert into public.helmut_store(id,data) values ('${F.EINGABE}', eingabe || jsonb_build_object(
      'status','importiert','payloadHash','${PAYLOAD_HASH}','angelegtAm',now(),
      'feedUrl','https://www.bundestag.de/static/appdata/includes/rss/aktuellethemen.rss'));
  if not exists(select 1 from public.helmut_store where id='${F.EINGABE}'
    and data-'status'-'payloadHash'-'angelegtAm'-'feedUrl'=eingabe) then raise exception 'bund7-belegablage-abweichend'; end if;
end $import$;`);
  let rollback = require("./quellenfrische-30-plan").baueRueckweg(payload)
    .replace(/<>30\b/g, "<>7").replace("frische30", "bund7")
    .replace("public.ko_document_links in share row exclusive mode;", "public.ko_document_links, public.helmut_store in share row exclusive mode;")
    .replace("begin\n if exists", `begin\n if exists(select 1 from public.helmut_store where id='${F.QUITTUNG}')
  or not exists(select 1 from public.helmut_store where id='${F.EINGABE}'
    and data-'status'-'payloadHash'-'angelegtAm'-'feedUrl'=e and data->>'status'='importiert') then
   raise exception 'bund7-rueckweg-belegstand'; end if;
 if exists`)
    .replace("end $rueckweg$;", `delete from public.helmut_store where id='${F.EINGABE}';
 get diagnostics n=row_count; if n<>1 then raise exception 'bund7-rueckweg-belegzahl'; end if;
end $rueckweg$;`);
  const read = `with eingabe as (select ${e} e)
select now() as gelesen_am,
 (select count(*) from public.mandate_profiles) as profile,
 (select count(*) from public.mandate_profiles where aktiv) as aktiv,
 (select count(*) from public.raw_documents r where r.id in(select x->>'id' from eingabe,jsonb_array_elements(e->'rows')x)) as dokumente,
 (select count(*) from public.document_findings f where f.raw_document_id in(select x->>'id' from eingabe,jsonb_array_elements(e->'rows')x)) as fundstellen,
 not exists(select 1 from eingabe,jsonb_array_elements(e->'rows')x left join public.raw_documents r on r.id=x->>'id'
  where r.id is null or exists(select 1 from jsonb_each(x)y where to_jsonb(r)->y.key is distinct from to_jsonb(jsonb_populate_record(null::public.raw_documents,x))->y.key)) as dokumente_exakt,
 not exists(select 1 from eingabe,jsonb_array_elements(e->'findings')x left join public.document_findings f
  on f.raw_document_id=x->>'raw_document_id' and f.source_id=x->>'source_id' and f.original_url=x->>'original_url'
  where f.raw_document_id is null or exists(select 1 from jsonb_each(x)y where to_jsonb(f)->y.key is distinct from to_jsonb(jsonb_populate_record(null::public.document_findings,x))->y.key)) as fundstellen_exakt,
 (select data-'status'-'payloadHash'-'angelegtAm'-'feedUrl'=e from public.helmut_store, eingabe where id='${F.EINGABE}') as belegablage_exakt;`;
  return { sql, rollback, read, bericht: { payloadHash: PAYLOAD_HASH, importHash: hash(sql), rueckwegHash: hash(rollback),
    dokumente: 7, fundstellen: 7, artikelbelege: 7, modellaufrufe: 0, profilwrites: 0, ausgefuehrt: false } };
}
if (require.main === module) {
  const [input, prefix, extra] = process.argv.slice(2);
  if (!input || !prefix || extra) throw new Error("bund7-aufruf-ungueltig");
  const p = plane(fs.readFileSync(input, "utf8"));
  for (const [name, value] of Object.entries({ "import.sql": p.sql, "rueckweg.sql": p.rollback, "lesen.sql": p.read,
    "bericht.json": JSON.stringify(p.bericht, null, 2) })) fs.writeFileSync(prefix + "-" + name, value, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(p.bericht));
}
module.exports = { plane, PAYLOAD_HASH };
