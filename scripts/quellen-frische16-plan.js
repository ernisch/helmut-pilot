"use strict";
// Lokaler, exakt gebundener Importplan; keine Verbindung und keine Ausfuehrung.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const F = require("../lib/helmut/verstehen-frische16-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const PAYLOAD_HASH = "793b6ebb4448dfed534f514e4e05fb7714581850aa12072562cc3d06fa52d153";
const TABELLEN = ["mandate_profiles", "profiles", "helmut_jobs", "pipeline_locks", "process_runs",
  "helmut_verstehen_reservierungen", "ko_document_links", "knowledge_objects", "helmut_store", "raw_documents", "document_findings"];
function grundlinie(e) {
  const ids = `select x->>'id' from jsonb_array_elements(${e}->'rows') x`;
  return "jsonb_build_object(" + TABELLEN.map(t => {
    const where = t === "helmut_store" ? `where id <> '${F.EINGABE}'`
      : t === "raw_documents" ? `where id not in (${ids})`
        : t === "document_findings" ? `where raw_document_id not in (${ids})` : "";
    return `'${t}',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(p)::text, E'\\n' order by to_jsonb(p)::text),''),'UTF8')),'hex') from public.${t} p ${where})`;
  }).join(",\n") + ")";
}
function plane(payload) {
  if (typeof payload !== "string" || hash(payload) !== PAYLOAD_HASH || payload.includes("$eingabe$")) throw Error("frische16-payload-abweichend");
  const data = JSON.parse(payload);
  F.ausGesichertenBelegen(data.rows, data.belege);
  if (data.findings.length !== 16) throw Error("frische16-fundzahl");
  const locks = `set constraints all immediate;
lock table ${TABELLEN.map(t => "public." + t).join(",")} in share row exclusive mode;`;
  let sql = fs.readFileSync(path.join(__dirname, "fixtures/quellenfrische-30-vorbereitung.sql"), "utf8")
    .replace(/^[\s\S]*?begin;/, "-- Genau16 neue Quellen; atomar, keine Wiederholung bei unklarem Ausgang.\nbegin;")
    .replace(/lock table[^;]*;\nlock table[^;]*;/, locks)
    .replace(/<>30\b/g, "<>16").replace("<>504", "<>500")
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
    and data-'status'-'payloadHash'-'angelegtAm'=eingabe) then raise exception 'frische16-belegablage-abweichend'; end if;
  if grundlinie is distinct from ${grundlinie("eingabe")} then`);
  let rueckweg = require("./quellenfrische-30-plan").baueRueckweg(payload)
    .replace(/<>30\b/g, "<>16").replaceAll("frische30", "frische16")
    .replace(/lock table[^;]*;\nlock table[^;]*;/, locks)
    .replace("n integer;", "n integer; grundlinie jsonb;")
    .replace("begin\n if exists", `begin
 if (select count(*) from public.mandate_profiles)<>500 or (select count(*) from public.profiles)<>501
  or exists(select 1 from public.helmut_verstehen_reservierungen where lease_bis>now())
  or exists(select 1 from public.helmut_store where id='${F.QUITTUNG}')
  or not exists(select 1 from public.helmut_store where id='${F.EINGABE}'
    and data-'status'-'payloadHash'-'angelegtAm'=e and data->>'status'='importiert') then
   raise exception 'frische16-rueckweg-belegstand'; end if;
 grundlinie := ${grundlinie("e")};
 if exists`)
    .replace("where aktiv)", "where aktiv is distinct from false or geloescht_at is not null)")
    .replace("end $rueckweg$;", `delete from public.helmut_store where id='${F.EINGABE}';
 get diagnostics n=row_count; if n<>1 then raise exception 'frische16-rueckweg-belegzahl'; end if;
 if exists(select 1 from public.document_findings where raw_document_id in(select x->>'id' from jsonb_array_elements(e->'rows')x))
  or grundlinie is distinct from ${grundlinie("e")} then raise exception 'frische16-rueckweg-fremde-wirkung'; end if;
end $rueckweg$;`);
  if (!sql.includes("insert into public.helmut_store") || sql.includes("__PAYLOAD__")) throw Error("frische16-vorlage-abweichend");
  return { sql, rueckweg, bericht: { dokumente: 16, belege: 16, payloadHash: PAYLOAD_HASH,
    importHash: hash(sql), rueckwegHash: hash(rueckweg), ausgefuehrt: false } };
}
if (require.main === module) {
  const [input, prefix, extra] = process.argv.slice(2);
  if (!input || !prefix || extra) throw Error("frische16-aufruf");
  const p = plane(fs.readFileSync(input, "utf8"));
  for (const [name, value] of Object.entries({ "import.sql": p.sql, "rueckweg.sql": p.rueckweg,
    "sqlplan.json": JSON.stringify(p.bericht, null, 2) })) fs.writeFileSync(prefix + "-" + name, value, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(p.bericht));
}
module.exports = { plane, PAYLOAD_HASH, grundlinie, TABELLEN };
