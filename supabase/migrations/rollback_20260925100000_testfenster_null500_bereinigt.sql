-- Nur vorbereitete Endfunktion. Installation auf Production braucht Freigabe.
-- Keine Aktivierung, keine neuen Tabellen, kein Timer und keine Datenkorrektur.
begin;
lock table public.helmut_store in share row exclusive mode;
do $guard$ begin
  if exists(select 1 from public.helmut_store where id like 'testfenster-null500-%'
    and data->>'zustand'='aktiv' and data->'manifest'->>'version'='2') then
    raise exception 'null500-rollback-aktiver-bereinigter-lauf';
  end if;
end $guard$;
create or replace function public.helmut_testfenster_null500_ende(
  p_lauf_id text, p_manifest jsonb, p_grund text, p_bestaetigung text
) returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
set lock_timeout = '3s'
as $ende$
declare
  q jsonb;
  ids text[];
  ausserhalb text[];
  vor_profile jsonb;
  vor_identitaeten jsonb;
  vor_auth jsonb;
  vor_main jsonb;
  vor_ausserhalb jsonb;
  n integer;
  fremd integer;
begin
  if p_lauf_id is null or p_lauf_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or p_bestaetigung is distinct from 'GEBUNDENE_500_NUR_DEAKTIVIEREN'
    or not coalesce(p_grund in ('frist','notstopp'),false) then
    raise exception 'null500-ende-auftrag-ungueltig';
  end if;
  lock table public.mandate_profiles, public.profiles, public.helmut_store in share row exclusive mode;
  select data into q from public.helmut_store where id='testfenster-null500-'||p_lauf_id;
  if q is null or p_manifest is null or q->'manifest' is distinct from p_manifest
    or not coalesce(q->>'zustand' in ('aktiv','beendet'),false)
    or q->>'bestaetigtAktiv' is distinct from '500'
    or p_manifest->>'laufId' is distinct from p_lauf_id
    or p_manifest->>'version' is distinct from '1'
    or p_manifest->>'bestaetigung' is distinct from 'EXAKT_500_AUS_RUHE_AKTIVIEREN_UND_WIEDER_BEENDEN'
    or p_manifest->>'maxKostenMikroUsd' is distinct from '4000000'
    or jsonb_typeof(p_manifest->'ids') is distinct from 'array'
    or jsonb_typeof(p_manifest->'ausserhalb') is distinct from 'array'
    or jsonb_array_length(p_manifest->'ids') <> 500
    or jsonb_array_length(p_manifest->'ausserhalb') <> 4 then
    raise exception 'null500-ende-quittung-nicht-gebunden';
  end if;
  ids := array(select jsonb_array_elements_text(p_manifest->'ids'));
  ausserhalb := array(select jsonb_array_elements_text(p_manifest->'ausserhalb'));
  if (select count(distinct id) from unnest(ids||ausserhalb) id) <> 504
    or exists(select 1 from unnest(ids||ausserhalb) id where id is null or id !~ '^[a-zA-Z0-9_-]{1,200}$')
    or exists(select 1 from (
      select 'test-kohorte-a-'||lpad(i::text,3,'0') id from generate_series(1,20) i
      union all select 'test-kohorte-b-'||lpad(i::text,3,'0') from generate_series(1,75) i
      union all select 'test-kohorte-c-'||lpad(i::text,3,'0') from generate_series(1,400) i
    ) kohorte where not(id=any(ids)))
    or (select count(*) from unnest(ids) id where id like 'test-kohorte-%') <> 495
    or exists(select 1 from unnest(ausserhalb) id where id like 'test-kohorte-%')
    or p_manifest->>'zielHash' is distinct from (
      select encode(sha256(convert_to('['||string_agg(to_json(id)::text,',' order by id collate "C")||']','UTF8')),'hex') from unnest(ids) id)
    or (select count(*) from public.mandate_profiles where user_id=any(ids)) <> 500 then
    raise exception 'null500-ende-zielmenge-abweichend';
  end if;
  if not coalesce((q->>'aktiviertAm')::timestamptz >= (p_manifest->>'vorflugAm')::timestamptz
      and (q->>'aktiviertAm')::timestamptz < (p_manifest->>'startBis')::timestamptz
      and (p_manifest->>'endeAm')::timestamptz > (p_manifest->>'startBis')::timestamptz,false)
    or (p_grund='frist' and clock_timestamp() < (p_manifest->>'endeAm')::timestamptz) then
    raise exception 'null500-ende-zeit-abweichend';
  end if;
  if q->>'zustand'='beendet' and exists(select 1 from public.mandate_profiles where user_id=any(ids) and aktiv) then
    raise exception 'null500-unerwartete-reaktivierung';
  end if;
  vor_profile := (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id) from public.mandate_profiles p);
  vor_identitaeten := (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p);
  select data into vor_auth from public.helmut_store where id='main-auth';
  select data into vor_main from public.helmut_store where id='main';
  vor_ausserhalb := (select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p where not(user_id=any(ids)));
  -- Fehlende Kostenlesung, laufende Jobs oder anderes Deployment sperren das Ende nicht.
  update public.mandate_profiles set aktiv=false,updated_at=now() where user_id=any(ids) and aktiv=true;
  get diagnostics n = row_count;
  if exists(select 1 from public.mandate_profiles where user_id=any(ids) and aktiv) then
    raise exception 'null500-ende-nicht-vollstaendig';
  end if;
  if q->>'zustand'='aktiv' then
    update public.helmut_store set data=q||jsonb_build_object('zustand','beendet','beendetAm',now(),'deaktiviert',n,'endgrund',p_grund)
      where id='testfenster-null500-'||p_lauf_id and data=q;
    if not found then raise exception 'null500-ende-quittung-nicht-bestaetigt'; end if;
  end if;
  if vor_profile is distinct from (select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id) from public.mandate_profiles p)
    or vor_identitaeten is distinct from (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p)
    or vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main')
    or vor_ausserhalb is distinct from (select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p where not(user_id=any(ids))) then
    raise exception 'null500-ende-fremde-felder-veraendert';
  end if;
  select count(*) into fremd from public.mandate_profiles where aktiv and not(user_id=any(ids));
  return jsonb_build_object('zustand','beendet','deaktiviert',n,'zielAktiv',0,'ausserhalbAktiv',fremd,
    'gesamt',(select count(*) from public.mandate_profiles),'laufId',p_lauf_id);
end $ende$;
revoke all on function public.helmut_testfenster_null500_ende(text,jsonb,text,text) from public;
do $rechte$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.helmut_testfenster_null500_ende(text,jsonb,text,text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.helmut_testfenster_null500_ende(text,jsonb,text,text) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.helmut_testfenster_null500_ende(text,jsonb,text,text) to service_role';
  end if;
end $rechte$;
notify pgrst,'reload schema';
commit;
