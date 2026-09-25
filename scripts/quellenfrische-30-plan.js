"use strict";
// Nur lokale Dateien und SQL-Plan. Kein Netzwerk, keine Datenbankausfuehrung.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { planDedupWrites } = require("../lib/helmut/quellenarchitektur/dedup-global");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const KANDIDATEN_HASH = "6358a17967e2c3184c85411ba2ef22a46941b2f1fce6ee99476401c7553ee231";
const fordere = (v, g) => { if (!v) throw new Error("frische30-" + g); };
function baueRueckweg(payload) {
  fordere(typeof payload === "string" && !payload.includes("$eingabe$"), "sql-begrenzer");
  const eingabe = `$eingabe$${payload}$eingabe$::jsonb`;
  const keys = `select x->>'id' from jsonb_array_elements(e->'rows') x`;
  // Keine automatische Loeschung. Ein Rueckweg darf nur die neu angelegte,
  // unveraenderte Menge ohne spaeteren fachlichen Bezug entfernen.
  const rueckweg = `-- NICHT AUSFUEHREN ohne konkretes Rueckweg-GO. Kein Retry bei unklarem Ausgang.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
lock table public.raw_documents, public.document_findings, public.ko_document_links in share row exclusive mode;
lock table public.mandate_profiles, public.helmut_jobs, public.pipeline_locks, public.process_runs in share mode;
do $rueckweg$
declare e jsonb := ${eingabe}; n integer;
begin
 if exists(select 1 from public.mandate_profiles where aktiv)
  or exists(select 1 from public.helmut_jobs where status<>'erledigt' or lease_expires_at>now())
  or exists(select 1 from public.pipeline_locks where expires_at>now())
  or exists(select 1 from public.process_runs where finished_at is null and started_at>now()-interval '30 minutes')
  or exists(select 1 from public.ko_document_links where raw_document_id in (${keys}))
  or (select count(*) from public.raw_documents where id in (${keys}))<>30
  or (select count(*) from public.document_findings where raw_document_id in (${keys}))<>30 then
   raise exception 'frische30-rueckweg-nicht-frei';
 end if;
 if exists(select 1 from jsonb_array_elements(e->'rows') x join public.raw_documents r on r.id=x->>'id'
  where r.cluster_id is not null or r.content_hash is not null or r.document_type is not null
   or r.wahlperiode is not null or r.raw<>'{}'::jsonb
   or exists(select 1 from jsonb_each(x) f where to_jsonb(r)->f.key is distinct from
   to_jsonb(jsonb_populate_record(null::public.raw_documents,x))->f.key)) then
   raise exception 'frische30-rueckweg-dokument-veraendert';
 end if;
 if exists(select 1 from public.document_findings f where f.raw_document_id in (${keys})
  and not exists(select 1 from jsonb_array_elements(e->'findings') x where
   f.raw_document_id=x->>'raw_document_id' and f.source_id=x->>'source_id' and f.original_url=x->>'original_url'
   and not exists(select 1 from jsonb_each(x) z where to_jsonb(f)->z.key is distinct from
    to_jsonb(jsonb_populate_record(null::public.document_findings,x))->z.key))) then
   raise exception 'frische30-rueckweg-fundstelle-veraendert';
 end if;
 delete from public.raw_documents where id in (${keys});
 get diagnostics n=row_count;
 if n<>30 then raise exception 'frische30-rueckweg-unvollstaendig'; end if;
end $rueckweg$;
commit;
`;
  return rueckweg;
}
function plane(probe) {
  fordere(probe?.ok === true && probe.reinLesend === true && probe.importiert === 0
    && probe.modellaufrufe === 0 && probe.startedAt === "2026-09-25T09:03:56.594Z"
    && Array.isArray(probe.kandidaten) && probe.kandidaten.length === 30
    && hash(JSON.stringify(probe.kandidaten)) === KANDIDATEN_HASH, "eingabe-abweichend");
  const dedup = planDedupWrites(probe.kandidaten, []);
  fordere(dedup.persists.length === 30 && dedup.findings.length === 30
    && Object.keys(dedup.countIncrements).length === 0, "dedup-abweichend");
  const rows = dedup.persists.map(d => {
    const row = { ...d, canonical_target_url: d.canonical_url,
      publisher_id: `publisher-${d.publisher_domain}`, source_id: d.primary_source_id };
    for (const k of ["findings", "publisher_domain", "primary_source_id", "external_identity"]) delete row[k];
    return row;
  });
  const payload = JSON.stringify({ rows, findings: dedup.findings });
  fordere(!payload.includes("$eingabe$"), "sql-begrenzer");
  const eingabeHash = hash(payload);
  const template = fs.readFileSync(path.join(__dirname, "fixtures/quellenfrische-30-vorbereitung.sql"), "utf8");
  const sql = template.replace("__SHA256__", eingabeHash).replace("__PAYLOAD__", payload);
  const eingabe = `$eingabe$${payload}$eingabe$::jsonb`;
  const keys = `select x->>'id' from eingabe, jsonb_array_elements(e->'rows') x`;
  const lesen = `-- Nur SELECT, vor jedem GO und nach unklarem Schreibausgang.
with eingabe as (select ${eingabe} as e)
select now() as gelesen_am,
 (select count(*) from public.mandate_profiles) as mandate,
 (select count(*) from public.mandate_profiles where aktiv) as aktiv,
 (select count(*) from public.raw_documents r where r.id in (${keys})) as zielvorhanden,
 (select jsonb_agg(jsonb_build_object('eingabe',x->>'id','bestand',r.id))
  from eingabe, jsonb_array_elements(e->'rows') x join public.raw_documents r
   on r.id=x->>'id' or r.content_fingerprint=x->>'content_fingerprint'
    or r.canonical_target_url=x->>'canonical_url' or r.canonical_url=x->>'canonical_url') as kollisionsbelege,
 (select count(*) from public.document_findings where raw_document_id in (${keys})) as fundstellen,
 (select count(*) from public.ko_document_links where raw_document_id in (${keys})) as ko_verknuepfungen;
`;
  const rueckweg = baueRueckweg(payload);
  return { payload, sql, lesen, rueckweg, bericht: { version: 1, reinLokal: true,
    productionWrites: 0, freigegeben: false, kandidatenHash: KANDIDATEN_HASH, eingabeHash,
    dokumente: 30, fundstellen: 30, aktiveProfile: 0, modellaufrufe: 0,
    importSqlHash: hash(sql), rueckwegSqlHash: hash(rueckweg), funktionsnachweis500: false } };
}
function main(args) {
  fordere(args.length === 2, "aufruf-eingabe-und-ausgabepraefix");
  const [input, prefix] = args;
  const p = plane(JSON.parse(fs.readFileSync(input, "utf8")));
  const files = { "eingabe.json": p.payload, "import.sql": p.sql, "lesen.sql": p.lesen,
    "rueckweg.sql": p.rueckweg, "bericht.json": JSON.stringify(p.bericht, null, 2) };
  fordere(Object.keys(files).every(k => !fs.existsSync(`${prefix}-${k}`)), "ausgabe-vorhanden");
  for (const [k, value] of Object.entries(files)) fs.writeFileSync(`${prefix}-${k}`, value + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(p.bericht));
}
if (require.main === module) { try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { plane, baueRueckweg, KANDIDATEN_HASH };
