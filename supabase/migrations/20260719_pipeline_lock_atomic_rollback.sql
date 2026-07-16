-- Rollback: Atomarer Pipeline-Lock (20260719_pipeline_lock_atomic.sql).
-- Entfernt die zwei Lock-Funktionen und die ergaenzte token-Spalte. Die Tabelle
-- public.pipeline_locks selbst bleibt bestehen (sie existierte vorher, war leer).
-- Der App-Code faellt (ohne Flag HELMUT_ATOMIC_LOCK) ohnehin auf das bisherige
-- blob-basierte Lock-Verhalten zurueck — kein Nutzerpfad betroffen. Idempotent.
begin;
drop function if exists public.helmut_acquire_pipeline_lock(text, bigint);
drop function if exists public.helmut_release_pipeline_lock(text, text);
alter table public.pipeline_locks drop column if exists token;
commit;
