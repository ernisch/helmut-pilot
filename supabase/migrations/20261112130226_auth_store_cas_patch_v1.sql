-- Nur vorbereitet. Keine Production-Anwendung oder Aktivierung aus diesem Commit.
-- Rueckweg: erst HELMUT_AUTH_PATCH_V1 ausschalten/redeployen, dann
-- rollback_20261112130226_auth_store_cas_patch_v1.sql. Keine Datenruecksetzung.
begin;
do $$ begin
  if to_regclass('public.helmut_store') is null then
    raise exception 'auth-cas-patch: tabelle-fehlt';
  end if;
end $$;

create or replace function public.helmut_auth_cas_patch_v1(
  p_id text, p_expected_revision text, p_new_revision uuid,
  p_set jsonb, p_remove text[]
) returns table(id text)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_id is null or length(p_id) not between 6 and 200 or right(p_id,5) <> '-auth'
    or p_new_revision is null
    or (p_expected_revision is not null and lower(p_expected_revision) = p_new_revision::text)
    or (p_expected_revision is not null and p_expected_revision !~* '^[a-f0-9-]{36}$')
    or jsonb_typeof(p_set) is distinct from 'object'
    or p_set ? '_authStoreRevision' or p_remove is null
    or exists(select 1 from unnest(p_remove) k
      where k is null or k = '' or k = '_authStoreRevision' or p_set ? k)
  then
    raise exception using errcode='22023', message='auth-cas-patch: argumente';
  end if;

  -- Ein einziger bedingter UPDATE. Nach einem konkurrierenden Write wird die
  -- GESAMTE Revision erneut geprueft; auch disjunkte Feldpatches sind kein Bypass.
  -- Nicht uebertragene Felder bleiben unveraendert, einschliesslich Reserven,
  -- Originaljournale und unbekannter zukuenftiger Felder. Keine Arrays kuerzen.
  return query
    update public.helmut_store as s
       set data = (case when cardinality(p_remove) = 0 then s.data else s.data - p_remove end)
         || (p_set || jsonb_build_object('_authStoreRevision',p_new_revision::text))
     where s.id = p_id
       and jsonb_typeof(s.data) = 'object'
       and (s.data->>'_authStoreRevision') is not distinct from p_expected_revision
    returning s.id;
end;
$$;

revoke all on function public.helmut_auth_cas_patch_v1(text,text,uuid,jsonb,text[])
  from public, anon, authenticated;
grant execute on function public.helmut_auth_cas_patch_v1(text,text,uuid,jsonb,text[])
  to service_role;
comment on function public.helmut_auth_cas_patch_v1(text,text,uuid,jsonb,text[])
  is 'Auth-Feldpatch mit ganzer CAS-Revision; service_role-only, Invoker, keine Loeschung von Zeilen und kein Kosten-/Quotenreset.';
notify pgrst, 'reload schema';
commit;
