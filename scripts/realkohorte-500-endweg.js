"use strict";

// Rein lokaler Generator. Keine Migration, kein psql, keine API, kein Startweg.
// NICHT ANWENDEN: DB-Abnahme, qualifizierte Rechtsfreigabe und Live-Endwaechter
// sind offen. Ausgabedatei enthaelt Profilabbilder, daher 0600 ausserhalb ROOT.
const fs = require("node:fs");
const path = require("node:path");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const ROOT = path.resolve(__dirname, "..");
const PAKET = path.join(ROOT, "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = value => literal(JSON.stringify(value)) + "::jsonb";

function baueSql({ manifest: m, snapshot: s, quittung: q, grund }, paketBytes) {
  V.pruefeManifest(m, paketBytes, s);
  V.pruefeEndquittung(q, m);
  V.fordere(["frist", "notstopp"].includes(grund), "endgrund");
  const mandate = V.sortiere(s.mandate_profiles, "user_id"), profiles = V.sortiere(s.profiles, "id");
  const body = `declare
  m jsonb := ${json(m)};
  erwartete_quittung jsonb := ${json(q)};
  erwartet_mandate jsonb := ${json(V.fachzeilen(mandate))};
  erwartet_profiles jsonb := ${json(profiles)};
  ids text[] := array(select jsonb_array_elements_text(${json(m.ids)}));
  slot text := ${literal("testfenster-realkohorte500-" + m.operationId)};
  vor_quittung jsonb;
  vor_auth jsonb;
  vor_main jsonb;
  n integer;
begin
  select data into vor_quittung from public.helmut_store where id=slot;
  if vor_quittung is distinct from erwartete_quittung
    or vor_quittung->'manifest' is distinct from m then
    raise exception 'real500-endquittung-cas';
  end if;
  if clock_timestamp() < (vor_quittung->>'aktiviertAm')::timestamptz
    or (${literal(grund)}='frist' and clock_timestamp() < (m->>'endeAm')::timestamptz) then
    raise exception 'real500-endzeit';
  end if;
  if (select count(*) from public.mandate_profiles) <> 500
    or (select count(*) from public.mandate_profiles where user_id=any(ids) and aktiv=true and geloescht_at is null) <> 500
    or (select count(*) from public.profiles) <> 501
    or erwartet_mandate is distinct from
      (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id collate "C") from public.mandate_profiles p)
    or erwartet_profiles is distinct from
      (select jsonb_agg(to_jsonb(p) order by id collate "C") from public.profiles p) then
    raise exception 'real500-endbestand-unbekannt-fremd-partiell';
  end if;
  select data into vor_auth from public.helmut_store where id='main-auth';
  select data into vor_main from public.helmut_store where id='main';
  update public.mandate_profiles set aktiv=false where user_id=any(ids) and aktiv=true;
  get diagnostics n = row_count;
  if n <> 500 or exists(select 1 from public.mandate_profiles where aktiv is distinct from false)
    or erwartet_mandate is distinct from
      (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id collate "C") from public.mandate_profiles p)
    or erwartet_profiles is distinct from
      (select jsonb_agg(to_jsonb(p) order by id collate "C") from public.profiles p)
    or vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'real500-endnachkontrolle';
  end if;
  update public.helmut_store
    set data=vor_quittung||jsonb_build_object('zustand','beendet','beendetAm',clock_timestamp(),'deaktiviert',n,'endgrund',${literal(grund)})
    where id=slot and data=erwartete_quittung;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'real500-endquittung-cas-nicht-bestaetigt'; end if;
end`;
  // Dollarquote wirkt auch innerhalb eingebetteter SQL-Stringliterale. Erst den
  // vollstaendigen Body bauen, dann einen darin garantiert fehlenden Tag waehlen.
  let tag = "$real500_end$", suffix = 0;
  while (body.includes(tag)) tag = `$real500_end_${++suffix}$`;
  return `-- OFFLINE-VORBEREITUNG, KEINE FREIGABE. DB- und Live-Abnahme offen.
-- Eigener Realkohortenvertrag, KEIN synthetischer null500-v1/v2-Pfad.
-- Nur Aktiv=false; vorhandene updated_at-Trigger bleiben wirksam.
-- Unklarer Schreibausgang: NICHT wiederholen, ausschliesslich frisch lesen.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.mandate_profiles, public.profiles, public.helmut_store in share row exclusive mode;
do ${tag}
${body}
${tag};
commit;
`;
}

function schreibePrivat(out, sql) {
  V.fordere(typeof out === "string" && path.isAbsolute(out), "ausgabe-absolut");
  const dir = fs.realpathSync(path.dirname(out));
  const target = path.join(dir, path.basename(out));
  V.fordere(target !== ROOT && !target.startsWith(ROOT + path.sep), "ausgabe-im-repo");
  // wx verweigert Ueberschreiben und Symlinkziele. Kein SQL in stdout/stderr.
  const fd = fs.openSync(target, "wx", 0o600);
  try { fs.writeFileSync(fd, sql, "utf8"); fs.fsyncSync(fd); }
  catch (e) { fs.closeSync(fd); fs.unlinkSync(target); throw e; }
  fs.closeSync(fd);
  return target;
}

function main(argv) {
  V.fordere(argv.length === 4 && argv[0] === "--input" && argv[2] === "--out", "cli-argumente");
  const input = JSON.parse(fs.readFileSync(argv[1], "utf8"));
  V.fordere(Object.keys(input).sort().join("|") === "grund|manifest|quittung|snapshot", "ende-eingabe-format");
  const sql = baueSql(input, fs.readFileSync(PAKET));
  schreibePrivat(argv[3], sql);
  console.log("Offline-Endweg vorbereitet (0600). Keine Anwendung; DB-/Live-Abnahme offen.");
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error("Offline-Endweg verweigert: " + (String(e.message).startsWith("real500-")
    ? e.message : "Eingabe/Dateipfad ungueltig")); process.exitCode = 1; }
}
module.exports = { baueSql, schreibePrivat, main };
