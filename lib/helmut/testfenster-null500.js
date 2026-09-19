"use strict";

// Reiner Planer fuer einen spaeter ausdruecklich freizugebenden Betreiberlauf.
// Kein Datenbankclient, kein HTTP, keine Aktivierung beim Import oder Planen.
const D = require("./testkohorte-direkt500");
const Z = require("./quellenkontext-ruheziel");
const PREFIX = "testfenster-null500-";
const FREIGABE = "EXAKT_500_AUS_RUHE_AKTIVIEREN_UND_WIEDER_BEENDEN";
const HASH = /^[a-f0-9]{64}$/;
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const shaSql = s => `encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const PROFILE = "(select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p)";
const IDENTITAETEN = "(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p)";
const AUTH = "(select data from public.helmut_store where id='main-auth')";
const MAIN = "(select data from public.helmut_store where id='main')";

function pruefeManifest(m) {
  D.fordere(m && m.version === 1 && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(m.laufId || ""),
    "null500-laufkennung-ungueltig");
  D.fordere(Object.keys(m).every(k => ["version", "laufId", "ids", "ausserhalb", "zielHash", "productionCommit",
    "vorflugAm", "startBis", "endeAm", "grundlinie", "maxKostenMikroUsd", "bestaetigung"].includes(k)),
  "null500-unbekannte-manifestfelder");
  const ids = m.ids, aus = m.ausserhalb, alle = [...(ids || []), ...(aus || [])];
  D.fordere(Array.isArray(ids) && ids.length === 500 && Array.isArray(aus) && aus.length === 4
    && alle.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(id))
    && new Set(alle).size === 504 && D.ALLE_KENNUNGEN.every(id => ids.includes(id))
    && alle.every(id => !id.startsWith("test-kohorte-") || D.ALLE_KENNUNGEN.includes(id))
    && D.hash(ids) === D.hash([...ids].sort()) && D.hash(aus) === D.hash([...aus].sort()),
  "null500-zielmenge-ungueltig");
  D.fordere(m.zielHash === D.hash(ids) && /^[a-f0-9]{40}$/.test(m.productionCommit || ""),
    "null500-bindung-fehlt");
  const zeiten = [m.vorflugAm, m.startBis, m.endeAm].map(x => Date.parse(x));
  D.fordere([m.vorflugAm, m.startBis, m.endeAm].every((x, i) => Number.isFinite(zeiten[i])
    && new Date(zeiten[i]).toISOString() === x)
    && zeiten[1] > zeiten[0] && zeiten[1] - zeiten[0] <= 5 * 60000
    && zeiten[2] > zeiten[1] && zeiten[2] - zeiten[0] <= 24 * 3600000,
  "null500-zeitfenster-ungueltig");
  D.fordere(m.grundlinie && Object.keys(m.grundlinie).length === 4
    && ["profile", "identitaeten", "auth", "main"].every(k => HASH.test(m.grundlinie[k] || "")),
    "null500-grundlinie-fehlt");
  // Der vorhandene Geldriegel wird nicht vergroessert. Tageswechsel brauchen
  // einen gesondert freigegebenen Kostenplan; dieser erste Planer erlaubt keinen.
  D.fordere(m.vorflugAm.slice(0, 10) === m.endeAm.slice(0, 10)
    && m.maxKostenMikroUsd === 4000000, "null500-kostenfenster-ungueltig");
  D.fordere(m.bestaetigung === FREIGABE, "null500-startfreigabe-fehlt");
  return m;
}

function plane(s, bestandsauswahl, vertrag) {
  const ziel = Z.pruefe(s, bestandsauswahl);
  const m = pruefeManifest({ ...vertrag, version: 1, ids: ziel.ids, ausserhalb: ziel.ausserhalb, zielHash: ziel.zielHash });
  const k = require("./testkosten-budget").kontrolliere(s.auth, m.vorflugAm.slice(0, 10));
  D.fordere(k.offeneReservierungen === 0 && k.gebundenUsd < 4
    && s.auth.testKostenTage[m.vorflugAm.slice(0, 10)].frozen === null, "null500-kosten-nicht-frei");
  return m;
}

function baueSql(manifest, schritt) {
  const m = pruefeManifest(manifest);
  D.fordere(["aktivierung", "ende", "lesen"].includes(schritt), "null500-schritt-ungueltig");
  const key = literal(PREFIX + m.laufId), json = literal(JSON.stringify(m));
  const ziel = `array(select jsonb_array_elements_text(${json}::jsonb->'ids'))`;
  if (schritt === "lesen") return `-- Rein lesend; auch nach unbekanntem Schreibausgang. Niemals automatisch wiederholen.
select now() as zeit, (select data from public.helmut_store where id=${key}) as quittung,
  (select count(*) from public.mandate_profiles) as gesamt,
  (select count(*) from public.mandate_profiles where aktiv) as aktiv,
  (select count(*) from public.mandate_profiles where user_id=any(${ziel})) as zielVorhanden,
  (select count(*) from public.mandate_profiles where aktiv and user_id=any(${ziel})) as zielAktiv,
  (select count(*) from public.mandate_profiles where aktiv and not(user_id=any(${ziel}))) as ausserhalbAktiv,
  (select jsonb_agg(user_id order by user_id) from public.mandate_profiles where not(user_id=any(${ziel}))) as ausserhalbKennungen;\n`;
  const start = schritt === "aktivierung";
  return `-- NICHT AUSFUEHREN ohne neue ausdrueckliche Startfreigabe und bestaetigten Endweg.
-- Genau eine Transaktion. Bei unklarem Ausgang nur den gebundenen Leser ausfuehren.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.mandate_profiles, public.profiles, public.helmut_store in share row exclusive mode;
${start ? "lock table public.pipeline_locks, public.helmut_jobs, public.process_runs in share row exclusive mode;" : ""}
do $null500$
declare
  m jsonb := ${json}::jsonb;
  ids text[] := ${ziel};
  q jsonb;
  vor_profile jsonb;
  vor_identitaeten jsonb;
  vor_auth jsonb;
  vor_main jsonb;
  vor_ausserhalb jsonb;
  n integer;
begin
  select data into q from public.helmut_store where id=${key};
  if (select count(*) from public.mandate_profiles where user_id=any(ids)) <> 500 then
    raise exception 'null500-zielmenge-fehlt';
  end if;
  vor_profile := (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id) from public.mandate_profiles p);
  vor_identitaeten := ${IDENTITAETEN};
  vor_auth := ${AUTH};
  vor_main := ${MAIN};
  vor_ausserhalb := (select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p where not(user_id=any(ids)));
${start ? `  if q is not null or exists(select 1 from public.helmut_store where id like '${PREFIX}%' and data->>'zustand'='aktiv') then
    raise exception 'null500-auftrag-bereits-verwendet';
  end if;
  if now() < (m->>'vorflugAm')::timestamptz or now() >= (m->>'startBis')::timestamptz then
    raise exception 'null500-startfenster-abgelaufen';
  end if;
  if (select count(*) from public.mandate_profiles) <> 504
    or (select count(*) from public.profiles) <> 505
    or vor_ausserhalb is null
    or (select jsonb_agg(user_id order by user_id) from public.mandate_profiles where not(user_id=any(ids))) is distinct from m->'ausserhalb'
    or exists(select 1 from public.mandate_profiles where aktiv or geloescht_at is not null) then
    raise exception 'null500-bestand-nicht-ruhend';
  end if;
  if ${shaSql(PROFILE)} is distinct from m->'grundlinie'->>'profile'
    or ${shaSql(IDENTITAETEN)} is distinct from m->'grundlinie'->>'identitaeten'
    or ${shaSql(AUTH)} is distinct from m->'grundlinie'->>'auth'
    or ${shaSql(MAIN)} is distinct from m->'grundlinie'->>'main' then
    raise exception 'null500-grundlinie-veraendert';
  end if;
  if exists(select 1 from public.pipeline_locks where expires_at>now())
    or exists(select 1 from public.helmut_jobs where lease_expires_at>now() or status<>'erledigt')
    or exists(select 1 from public.process_runs where finished_at is null and started_at>now()-interval '30 minutes') then
    raise exception 'null500-arbeit-nicht-ruhend';
  end if;
  if not coalesce((vor_auth->'testKostenTage'->substring(m->>'vorflugAm',1,10)->>'limit')::bigint = 4000000, false)
    or coalesce((vor_auth->'testKostenTage'->substring(m->>'vorflugAm',1,10)->>'spent')::bigint, 4000000) >= (m->>'maxKostenMikroUsd')::bigint
    or coalesce(vor_auth->'testKostenTage'->substring(m->>'vorflugAm',1,10)->>'frozen','') <> ''
    or exists(select 1 from jsonb_each(coalesce(vor_auth->'testKostenTage'->substring(m->>'vorflugAm',1,10)->'calls','{}'::jsonb)) c
      where c.value->>'status' in ('reserviert','ungeklaert')) then
    raise exception 'null500-kosten-nicht-frei';
  end if;
  update public.mandate_profiles set aktiv=true, updated_at=now() where user_id=any(ids) and aktiv=false;
  get diagnostics n = row_count;
  if n <> 500 or (select count(*) from public.mandate_profiles where aktiv) <> 500 then
    raise exception 'null500-aktivierung-nicht-vollstaendig';
  end if;
  insert into public.helmut_store(id,data) values (${key},jsonb_build_object(
    'manifest',m,'zustand','aktiv','aktiviertAm',now(),'bestaetigtAktiv',500));` : `  if q is null or q->'manifest' is distinct from m or not coalesce(q->>'zustand' in ('aktiv','beendet'),false) then
    raise exception 'null500-abschlussauftrag-nicht-gebunden';
  end if;
  if q->>'zustand'='beendet' and exists(select 1 from public.mandate_profiles where user_id=any(ids) and aktiv) then
    raise exception 'null500-unerwartete-reaktivierung';
  end if;
  -- Nicht von Modellkosten, Deployment oder laufenden Jobs abhaengig machen:
  -- das Ende darf bei einer Stoerung weiterhin genau seine Zielmenge stoppen.
  update public.mandate_profiles set aktiv=false, updated_at=now() where user_id=any(ids) and aktiv=true;
  get diagnostics n = row_count;
  if exists(select 1 from public.mandate_profiles where user_id=any(ids) and aktiv) then
    raise exception 'null500-abschluss-nicht-vollstaendig';
  end if;
  if q->>'zustand'='aktiv' then
    update public.helmut_store set data=q||jsonb_build_object('zustand','beendet','beendetAm',now(),'deaktiviert',n) where id=${key} and data=q;
    if not found then raise exception 'null500-abschlussquittung-nicht-bestaetigt'; end if;
  end if;`}
  if vor_profile is distinct from (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id) from public.mandate_profiles p)
    or vor_identitaeten is distinct from ${IDENTITAETEN} or vor_auth is distinct from ${AUTH}
    or vor_main is distinct from ${MAIN}
    or vor_ausserhalb is distinct from (select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p where not(user_id=any(ids))) then
    raise exception 'null500-fremde-felder-veraendert';
  end if;
end $null500$;
commit;
${baueSql(m, "lesen")}`;
}

function bewerteLesung(m, r) {
  pruefeManifest(m);
  const gleiche = r?.quittung?.manifest && D.hash(r.quittung.manifest) === D.hash(m);
  const zahlen = r && [r.gesamt, r.aktiv, r.zielvorhanden, r.zielaktiv, r.ausserhalbaktiv].every(Number.isInteger);
  const basis = zahlen && r.gesamt === 504 && r.zielvorhanden === 500 && r.ausserhalbaktiv === 0
    && Array.isArray(r.ausserhalbkennungen) && D.hash(r.ausserhalbkennungen) === D.hash(m.ausserhalb);
  let zustand = "unklar";
  if (basis && r.aktiv === 0 && r.zielaktiv === 0 && r.quittung === null) zustand = "nicht-aktiviert";
  if (basis && gleiche && r.quittung.zustand === "aktiv" && r.aktiv === 500 && r.zielaktiv === 500) zustand = "500-bestaetigt";
  if (basis && gleiche && r.quittung.zustand === "beendet" && r.aktiv === 0 && r.zielaktiv === 0) zustand = "0-bestaetigt";
  return { zustand, automatischeWiederholung: false, teststartFreigegeben: false, fachnachweis500: false };
}
module.exports = { plane, pruefeManifest, baueSql, bewerteLesung, FREIGABE, PREFIX };
