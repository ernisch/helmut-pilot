-- Pre-Sale Hardening Migration (2026-07-11)
-- Additiv, idempotent, KEINE DROPs, KEINE Datenlöschung. Reversibel (Rollback unten).
-- Behebt live bestätigte Schema-Drift + fehlende Indizes, die aktiv Production-Writes
-- scheitern lassen (Vercel Runtime-Errors 05.-11.07.).
--
-- Live-Verifikation vor Anwendung (Supabase ddckuvvpcytqbyfmbvie):
--   decisions:   vorgang_id FEHLT  -> saveDecisions 400 PGRST204 (47x/7d)
--   profiles:    0 Zeilen, aber 15 FKs -> briefings/profile_embeddings 23503 (40x/56x)
--   Indizes:     raw_documents(created_at), knowledge_objects(updated_at),
--                ko_document_links(raw_document_id), decisions(user_id,score),
--                office_outputs(user_id,created_at), briefings(user_id) fehlen.
--   Bereits vorhanden (kein Handlungsbedarf): knowledge_objects.action_items,
--   *_struct, understanding_status_idx, vorgang_id_idx, profile_embeddings-Tabelle.

begin;

-- ── M1: decisions.vorgang_id (Blocker, aktiv scheiternd) ────────────────────
alter table public.decisions add column if not exists vorgang_id text;
create index if not exists decisions_vorgang_idx on public.decisions (vorgang_id);

-- ── M2: knowledge_objects – Sicherheitsnetz (No-op falls bereits vorhanden) ──
alter table public.knowledge_objects add column if not exists action_items text[] not null default '{}';
alter table public.knowledge_objects add column if not exists action_items_struct jsonb not null default '[]'::jsonb;

-- ── M3: profiles-Backfill aus helmut_store-Blob (additiv, on conflict do nothing)
--        Legt für JEDES im Blob vorhandene Profil eine Minimalzeile an, damit die
--        FK-gebundenen Tabellen (briefings, decisions, profile_embeddings, ...)
--        schreiben können. Überschreibt nichts.
insert into public.profiles (id, name, email)
select p.key,
       coalesce(nullif(p.value->>'name',''), p.key),
       nullif(p.value->>'email','')
from public.helmut_store hs,
     jsonb_each(coalesce(hs.data->'profiles','{}'::jsonb)) as p(key, value)
where hs.id = 'main'
on conflict (id) do nothing;

-- ── M3b: Trigger stellt sicher, dass künftige per-User-Inserts nie an fehlender
--         profiles-Zeile scheitern (neue Mandate). Minimal-Platzhalter (name=id),
--         kollidiert nicht mit späterem echtem Profil-Sync (on conflict do nothing).
create or replace function public.helmut_ensure_profile()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.profiles (id, name)
    values (new.user_id, new.user_id)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['briefings','profile_embeddings','decisions',
                           'matching_results','office_outputs','topic_memory','interactions']
  loop
    execute format('drop trigger if exists helmut_ensure_profile_trg on public.%I', t);
    execute format(
      'create trigger helmut_ensure_profile_trg before insert on public.%I
       for each row execute function public.helmut_ensure_profile()', t);
  end loop;
end $$;

-- ── M4: Hot-Path-Indizes (Timeout-Entschärfung) ─────────────────────────────
create index if not exists raw_documents_created_at_idx      on public.raw_documents (created_at desc);
create index if not exists knowledge_objects_updated_at_idx  on public.knowledge_objects (updated_at desc);
create index if not exists knowledge_objects_status_updated_idx on public.knowledge_objects (status, updated_at desc);
create index if not exists ko_document_links_raw_document_idx on public.ko_document_links (raw_document_id);
create index if not exists decisions_user_score_idx          on public.decisions (user_id, score desc);
create index if not exists office_outputs_user_created_idx   on public.office_outputs (user_id, created_at desc);
create index if not exists briefings_user_slot_idx           on public.briefings (user_id, slot);

commit;

-- PostgREST Schema-Cache neu laden (sonst greift vorgang_id erst nach Minuten).
notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (vollständig reversibel; profiles-Backfill-Zeilen bleiben absichtlich
-- erhalten, da harmlos und referenziert — bei Bedarf gezielt löschen):
-- ----------------------------------------------------------------------------
-- do $$ declare t text; begin
--   foreach t in array array['briefings','profile_embeddings','decisions',
--     'matching_results','office_outputs','topic_memory','interactions']
--   loop execute format('drop trigger if exists helmut_ensure_profile_trg on public.%I', t); end loop;
-- end $$;
-- drop function if exists public.helmut_ensure_profile();
-- drop index if exists decisions_vorgang_idx;
-- alter table public.decisions drop column if exists vorgang_id;
-- drop index if exists raw_documents_created_at_idx;
-- drop index if exists knowledge_objects_updated_at_idx;
-- drop index if exists knowledge_objects_status_updated_idx;
-- drop index if exists ko_document_links_raw_document_idx;
-- drop index if exists decisions_user_score_idx;
-- drop index if exists office_outputs_user_created_idx;
-- drop index if exists briefings_user_slot_idx;
-- notify pgrst, 'reload schema';
