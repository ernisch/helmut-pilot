"use strict";

// Nur Offline-Dateien: kein Client, keine DB-Ausfuehrung, keine Authkonten.
// V2-Preimage und FK-Reihenfolge bleiben dem bestehenden Snapshotvertrag treu.
const fs = require("node:fs");
const path = require("node:path");
const S = require("../lib/helmut/synthetik-500-profile");
const P = require("../lib/helmut/synthetik-500-import");
const G = require("./import-preflight-500-sql-generator");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
const VERSION = "helmut-synthetik500-import/1";
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-import-" + code); };
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = x => literal(JSON.stringify(x)) + "::jsonb";
const idsSql = ids => "(" + ids.map(literal).join(",") + ")";
const assertion = (condition, code) => `do $$ begin if ${condition} then raise exception '${code}'; end if; end $$;\n`;

function ladePaket(bytes) {
  fordere(Buffer.isBuffer(bytes) || typeof bytes === "string", "paket-bytes");
  const p = JSON.parse(String(bytes)), meta = S.pruefePaket(p);
  const paket = S.erzeuge({ variante: meta.variante });
  fordere(String(bytes) === S.serialisiere(paket), "paket-nicht-kanonisch");
  return { paket, paketBytesHash: require("node:crypto").createHash("sha256").update(bytes).digest("hex") };
}
function* rows(snapshotDir, name) {
  for (const line of G.jsonlZeilenSync(path.join(snapshotDir, G.dateiName(name)))) yield JSON.parse(line);
}
function tabellenErwartung(snapshot, snapshotDir, write) {
  for (const name of G.V2_SNAPSHOT_DATEIEN) {
    const table = name === G.FREMD_TABELLE ? "profiles" : name, e = snapshot.dateien[name];
    // Vollstaendige Spalten aus aktuellem Katalog; kein ungesicherter Teilbackup.
    if (e.zeilen) write(assertion(`(select array_agg(attname::text order by attname) from pg_attribute
      where attrelid='public.${table}'::regclass and attnum>0 and not attisdropped) is distinct from
      array[${e.spalten.map(literal).join(",")}]::text[]`, "synthetik500-import-schema-drift"));
    write(`create temp table erwartet_${name} on commit drop as select * from public.${table} with no data;\n`);
    G.wiederherstellungsSqlAusZeilen(table, e, rows(snapshotDir, name), sql => {
      write(sql.replace(`insert into public.${table} `, `insert into pg_temp.erwartet_${name} `));
    });
  }
}
function relationCas(table, query, expected, code, columns = "*") {
  return assertion(`exists((select ${columns} from ${query} except all select ${columns} from ${expected})
    union all (select ${columns} from ${expected} except all select ${columns} from ${query}))`, code);
}
function fremdCas(sp) {
  return relationCas("profiles", `public.profiles where id in ${idsSql(sp.ids.fremd)}`,
    "pg_temp.erwartet_fremd_profiles", "synthetik500-import-fremdprofil-drift");
}
function bestandCas(sp, ids, neu = false) {
  const set = idsSql(ids);
  let sql = assertion("(select count(*) from public.profiles)<>501 or (select count(*) from public.mandate_profiles)<>500"
    + " or exists(select 1 from public.mandate_profiles where aktiv is not false)", "synthetik500-import-500-501-0-verletzt");
  sql += fremdCas(sp);
  if (!neu) {
    for (const table of G.SNAPSHOT_TABELLEN) {
      const key = table === "profiles" ? "id" : "user_id";
      sql += relationCas(table, `public.${table} where ${key} in ${set}`,
        `pg_temp.erwartet_${table}`, "synthetik500-import-preimage-drift");
    }
  } else {
    for (const table of G.FK_KINDTABELLEN.filter(t => t !== "mandate_profiles")) {
      sql += assertion(`exists(select 1 from public.${table} where user_id in ${set})`,
        "synthetik500-import-neue-kinddaten");
    }
  }
  return sql;
}
function anfang(write, binding) {
  write(`-- Offline Synthetik500 Ersatz, KEINE Ausfuehrung/Freigabe. ${VERSION}\n`);
  write(`-- Bindung: operation=${binding.operationId} snapshot=${binding.snapshotHash} paket=${binding.paketBytesHash}\n`);
  write("begin;\nset local statement_timeout='20s';\nset local lock_timeout='2s';\nset local standard_conforming_strings=on;\n");
  // Ein fester Lockauftrag schuetzt auch alle Kindzeilen vor Check/Delete-Rennen.
  write(`lock table ${[...G.SNAPSHOT_TABELLEN, "helmut_store", "pipeline_locks", "helmut_jobs", "process_runs", "helmut_job_outbox"].map(t => "public." + t).join(",")} in access exclusive mode;\n`);
  const tables = G.SNAPSHOT_TABELLEN.map(t => literal("public." + t) + "::regclass").join(",");
  write(assertion(`exists(select 1 from pg_constraint where contype='f' and confrelid in (${tables})
    and (conrelid not in (${tables}) or (confrelid='public.profiles'::regclass and confdeltype<>'c')))`,
  "synthetik500-import-fk-schema-drift"));
  write(assertion("exists(select 1 from public.pipeline_locks where expires_at>clock_timestamp())"
    + " or exists(select 1 from public.helmut_jobs where lease_expires_at>clock_timestamp() or status not in ('erledigt','fehlgeschlagen'))"
    + " or exists(select 1 from public.process_runs where finished_at is null and status='running')"
    + " or exists(select 1 from public.helmut_job_outbox where status is null or status not in ('bestaetigt','aufgegeben','verzichtet'))", "synthetik500-import-prozessruhe-fehlt"));
  // Der Blob-Fallback kann parallel zur relationalen Locktabelle aktiv sein.
  // Authstore und Outbox sind bereits gesperrt: Ruhecheck und Ersatz sind atomar.
  write(assertion("not exists(select 1 from public.helmut_store where id='main-auth' and jsonb_typeof(data)='object')"
    + " or exists(select 1 from public.helmut_store where id='main-auth' and data ? 'pipelineLocks' and jsonb_typeof(data->'pipelineLocks') is distinct from 'object')",
  "synthetik500-import-blob-lock-format"));
  write(assertion("exists(select 1 from jsonb_each(coalesce((select data->'pipelineLocks' from public.helmut_store where id='main-auth'),'{}'::jsonb)) c"
    + " where (jsonb_typeof(c.value) is distinct from 'object' or not coalesce(case when jsonb_typeof(c.value->'expiresAt')='number'"
    + " then (c.value->>'expiresAt')::numeric<=extract(epoch from clock_timestamp())*1000 else null end,false)))",
  "synthetik500-import-blob-lock-aktiv-oder-unklar"));
  write("create temp table steuerung_vorher on commit drop as select id,data from public.helmut_store where id in ('main','main-auth');\n");
}
function ende(write) {
  write(relationCas("helmut_store", "public.helmut_store where id in ('main','main-auth')", "pg_temp.steuerung_vorher",
    "synthetik500-import-auth-main-drift", "id,data"));
  write("commit;\n");
}
function nebenbestand(write, ids, danach = false) {
  for (const table of G.FK_KINDTABELLEN) {
    const query = `public.${table} where user_id not in ${idsSql(ids)} or user_id is null`;
    if (!danach) write(`create temp table nebenbestand_${table} on commit drop as select * from ${query};\n`);
    else write(relationCas(table, query, "pg_temp.nebenbestand_" + table, "synthetik500-import-nebenbestand-drift"));
  }
}
function neueErwartung(table, liste, columns, write) {
  write(`create temp table neu_${table} on commit drop as select * from public.${table} with no data;\n`);
  // Projektion umfasst bewusst nur belegte Importspalten. Vollstaendiges
  // tatsaechliches Postimage samt DB-Defaults wird danach im Journal gesichert.
  write(`insert into pg_temp.neu_${table} (${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::public.${table},${json(liste)});\n`);
}
function schreibeWege({ paket, paketBytesHash, snapshot, snapshotDir }, writeForward, writeRollback) {
  const p = P.erzeugeZeilen(paket), b = { version: VERSION, operationId: snapshot.manifest.operationId,
    snapshotHash: snapshot.manifest.sha256, paketBytesHash, ...P.projizierteBindung(paket) };
  fordere(/^[a-z][a-z0-9-]{2,100}$/.test(b.operationId), "operation-id");
  fordere(Number.isFinite(Date.parse(snapshot.manifest.erstelltAm)), "snapshot-zeit");
  const oldIds = idsSql(snapshot.ids.mandat), newIds = idsSql(p.profileRows.map(r => r.id));
  const slot = literal("synthetik500-import-" + b.operationId);
  for (const [direction, write] of [["forward", writeForward], ["rollback", writeRollback]]) {
    anfang(write, b);
    tabellenErwartung(snapshot, snapshotDir, write);
    const aktuelleIds = direction === "forward" ? snapshot.ids.mandat : p.profileRows.map(r => r.id);
    nebenbestand(write, aktuelleIds);
    if (direction === "forward") {
      write(assertion(`exists(select 1 from public.helmut_store where id=${slot})`, "synthetik500-import-operation-verbraucht"));
      write(bestandCas(snapshot, snapshot.ids.mandat));
      write(assertion(`exists(select 1 from public.profiles where id in ${newIds})`, "synthetik500-import-id-kollision"));
      // Frische wird an der Ausfuehrungsuhr und vollstaendigem Preimage gemessen.
      write(assertion(`clock_timestamp()<${literal(snapshot.manifest.erstelltAm)}::timestamptz or clock_timestamp()-${literal(snapshot.manifest.erstelltAm)}::timestamptz>interval '5 minutes'`, "synthetik500-import-snapshot-nicht-frisch"));
      neueErwartung("profiles", p.profileRows, ["id", "name"], write);
      neueErwartung("mandate_profiles", p.mandateRows, G.MANDAT_SPALTEN, write);
      write(`delete from public.profiles where id in ${oldIds};\n`);
      write("insert into public.profiles (id,name) select id,name from pg_temp.neu_profiles;\n");
      write(`insert into public.mandate_profiles (${G.MANDAT_SPALTEN.join(",")}) select ${G.MANDAT_SPALTEN.join(",")} from pg_temp.neu_mandate_profiles;\n`);
      write(bestandCas(snapshot, p.profileRows.map(r => r.id), true));
      for (const [table, columns] of [["profiles", "id,name"], ["mandate_profiles", G.MANDAT_SPALTEN.join(",")]]) {
        write(relationCas(table, `public.${table} where ${table === "profiles" ? "id" : "user_id"} in ${newIds}`,
          "pg_temp.neu_" + table, "synthetik500-import-projektion-drift", columns));
      }
      write(`insert into public.helmut_store(id,data) select ${slot}, ${json(b)} || jsonb_build_object('zustand','inaktiv-importiert',
        'profiles',(select jsonb_agg(to_jsonb(p) order by id collate "C") from public.profiles p where id in ${newIds}),
        'mandate_profiles',(select jsonb_agg(to_jsonb(m) order by user_id collate "C") from public.mandate_profiles m where user_id in ${newIds}));\n`);
    } else {
      write(assertion(`not exists(select 1 from public.helmut_store where id=${slot} and data-ARRAY['zustand','profiles','mandate_profiles']=${json(b)} and data->>'zustand'='inaktiv-importiert'
        and jsonb_array_length(data->'profiles')=500 and jsonb_array_length(data->'mandate_profiles')=500)`, "synthetik500-import-journal-drift-oder-verbraucht"));
      write(bestandCas(snapshot, p.profileRows.map(r => r.id), true));
      write(assertion(`exists(select 1 from public.profiles where id in ${oldIds})`, "synthetik500-import-altbestand-kollision"));
      for (const [table, key] of [["profiles", "id"], ["mandate_profiles", "user_id"]]) {
        write(assertion(`(select jsonb_agg(to_jsonb(p) order by ${key} collate "C") from public.${table} p where ${key} in ${newIds}) is distinct from
          (select data->'${table}' from public.helmut_store where id=${slot})`, "synthetik500-import-postimage-drift"));
      }
      write(`delete from public.profiles where id in ${newIds};\n`);
      for (const table of G.SNAPSHOT_TABELLEN) {
        const e = snapshot.dateien[table];
        if (e.zeilen) write(`insert into public.${table} (${e.spalten.join(",")}) select ${e.spalten.join(",")} from pg_temp.erwartet_${table};\n`);
      }
      write(bestandCas(snapshot, snapshot.ids.mandat));
      write(`update public.helmut_store set data=data||jsonb_build_object('zustand','rueckgestellt') where id=${slot} and data->>'zustand'='inaktiv-importiert';\n`);
      write(assertion(`not exists(select 1 from public.helmut_store where id=${slot} and data->>'zustand'='rueckgestellt')`, "synthetik500-import-rueckweg-quittung-fehlt"));
    }
    // Cascades/SET NULL duerfen auch ausserhalb der ersetzten Kohorte keine
    // fremden Kinddaten veraendern. Bei Querreferenzen rollt alles atomar zurueck.
    nebenbestand(write, direction === "forward" ? p.profileRows.map(r => r.id) : snapshot.ids.mandat, true);
    ende(write);
  }
  return b;
}

function baueDateien({ paketBytes, snapshotDir, outDir }) {
  const { paket, paketBytesHash } = ladePaket(paketBytes);
  const snapshot = G.pruefeSnapshotVerzeichnis(snapshotDir, { paketHash: paketBytesHash,
    neueIds: paket.profile.map(p => p.mandatsId) });
  fordere(snapshot.ok, "snapshot-ungueltig");
  const out = path.resolve(outDir), parent = fs.realpathSync(path.dirname(out));
  fordere(!fs.existsSync(out), "out-vorhanden");
  let staging;
  try {
    // schreibePrivat prueft alle Gitroots einschliesslich Worktrees/Symlinks.
    staging = fs.mkdtempSync(path.join(parent, ".synthetik500-import-"));
    const names = ["synthetik500-ersatz.sql", "synthetik500-rueckweg.sql"];
    for (const name of names) schreibePrivat(path.join(staging, name), "");
    const fds = names.map(name => fs.openSync(path.join(staging, name), "a"));
    let binding;
    try {
      binding = schreibeWege({ paket, paketBytesHash, snapshot, snapshotDir },
        s => fs.writeSync(fds[0], s), s => fs.writeSync(fds[1], s));
      fds.forEach(fd => fs.fsyncSync(fd));
    } finally { fds.forEach(fd => fs.closeSync(fd)); }
    // Erneute Quelldateipruefung vor atomarer Publikation schliesst lokalen Drift.
    const final = G.pruefeSnapshotVerzeichnis(snapshotDir, { paketHash: paketBytesHash,
      neueIds: paket.profile.map(p => p.mandatsId) });
    fordere(final.ok && final.manifest.sha256 === snapshot.manifest.sha256, "snapshot-waehrend-generierung-geaendert");
    schreibePrivat(path.join(staging, "manifest.json"), JSON.stringify({ ...binding,
      dateien: Object.fromEntries(names.map(name => [name, G.hashDateiSync(path.join(staging, name))])),
      ausgefuehrt: false, importFreigegeben: false, aktivierungFreigegeben: false }, null, 2) + "\n");
    fs.renameSync(staging, out); staging = null;
    return { ...binding, ausgefuehrt: false, importFreigegeben: false, aktivierungFreigegeben: false };
  } finally { if (staging) fs.rmSync(staging, { recursive: true, force: true }); }
}
function main(argv) {
  fordere(Array.isArray(argv) && argv.length === 6, "argumente");
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = { "--paket": "paket", "--snapshot": "snapshotDir", "--out": "outDir" }[argv[i]];
    fordere(k && !Object.hasOwn(o, k) && typeof argv[i + 1] === "string" && argv[i + 1].trim(), "argumente");
    o[k] = argv[i + 1];
  }
  console.log(JSON.stringify(baueDateien({ ...o, paketBytes: fs.readFileSync(o.paket) })));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (_) { console.error("synthetik500-import-fail-closed"); process.exitCode = 1; }
}
module.exports = { VERSION, ladePaket, schreibeWege, baueDateien, main, ...P };
