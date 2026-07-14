-- Rollback zu 20260711_presale_hardening.sql (vollständig reversibel; die
-- profiles-Backfill-Zeilen bleiben absichtlich erhalten, da harmlos und
-- referenziert — bei Bedarf gezielt löschen). Idempotent (if exists).
--
-- Inhaltlich identisch zum bisher NUR als Kommentar am Dateiende der Migration
-- hinterlegten Rollback-Block — hier als eigenständige, ausführbare Datei, damit
-- ALLE Migrationen dem gleichen Muster (Paar aus Migration + *_rollback.sql)
-- folgen. NICHT automatisch ausführen; nur im Rollback-Fall.

begin;

do $$ declare t text; begin
  foreach t in array array['briefings','profile_embeddings','decisions',
    'matching_results','office_outputs','topic_memory','interactions']
  loop execute format('drop trigger if exists helmut_ensure_profile_trg on public.%I', t); end loop;
end $$;
drop function if exists public.helmut_ensure_profile();
drop index if exists decisions_vorgang_idx;
alter table public.decisions drop column if exists vorgang_id;
drop index if exists raw_documents_created_at_idx;
drop index if exists knowledge_objects_updated_at_idx;
drop index if exists knowledge_objects_status_updated_idx;
drop index if exists ko_document_links_raw_document_idx;
drop index if exists decisions_user_score_idx;
drop index if exists office_outputs_user_created_idx;
drop index if exists briefings_user_slot_idx;

commit;

notify pgrst, 'reload schema';
