-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 11 — Preview-Bootstrap: Supabase/PostgREST-Umgebung originalgetreu
-- nachbilden (Auth-Schema, Rollen, Grants) für eine WEGWERFBARE lokale
-- Postgres-16-Instanz. NUR PREVIEW — niemals gegen Production ausführen.
--
-- Reproduziert exakt den Mechanismus, den Supabase/PostgREST pro Request setzt:
--   * SET LOCAL role <rolle aus dem JWT 'role'-Claim>
--   * SET LOCAL request.jwt.claims = '<das dekodierte JWT als JSON>'
--   * auth.jwt()/auth.role()/auth.uid() lesen genau diese GUC.
-- Die RLS-Policies (public.helmut_current_tenant() → auth.jwt()->>'user_id')
-- konsumieren AUSSCHLIESSLICH diese dekodierten Claims — unabhängig davon, ob
-- das Token per HS256 (obsolet) oder per asymmetrischem GoTrue-Key (Ziel)
-- signiert wurde. Damit ist die DB-seitige Durchsetzung (RLS, Read-only-Rolle,
-- Tenant-Isolation) hier vollständig und real prüfbar; NICHT prüfbar ist die
-- Token-AUSSTELLUNG/-VERIFIKATION von GoTrue/PostgREST selbst (siehe Report).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Supabase-Standardrollen ────────────────────────────────────────────────
-- authenticator ist die PostgREST-Login-Rolle; sie SET-ROLE-t pro Request auf
-- anon / authenticated / eine benannte Rolle aus dem JWT 'role'-Claim.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- service_role hat BYPASSRLS — genau wie in Supabase (Generalschlüssel).
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'preview-only';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ── auth-Schema: Supabase-Helferfunktionen originalgetreu ───────────────────
create schema if not exists auth;

-- auth.jwt(): dekodierte Claims des aktuellen Requests (leeres Objekt ohne Claim).
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

-- auth.role(): der role-Claim (fällt in Supabase auf die aktuelle DB-Rolle zurück).
create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'role', current_setting('role', true))
$$;

-- auth.uid(): der sub-Claim (GoTrue-User-UUID). Für dieses Projekt trägt der
-- fachliche Mandant im Claim 'user_id' (= politicianId); auth.uid() wird von
-- den vorhandenen Policies NICHT genutzt, ist aber für Vollständigkeit da.
create or replace function auth.uid() returns text
language sql stable
as $$
  select auth.jwt() ->> 'sub'
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.role(), auth.uid()
  to anon, authenticated, service_role;
