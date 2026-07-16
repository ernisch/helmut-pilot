-- Helmut — P0-4 · Atomarer Pipeline-Lock (fail-closed, Race-Fix R2)
-- ==============================================================================
-- BEFUND (Audit R2): acquirePipelineLock war ein NICHT-atomarer Read-modify-write
-- auf dem Auth-Blob und lieferte bei Storage-Fehler `true` (FAIL-OPEN). Unter
-- Blob-Instabilitaet (Audit R1, 10-s-Timeouts) sind so zwei parallele Crawl-/
-- Understanding-Laeufe gleichzeitig moeglich -> Doppelverarbeitung + doppelte
-- KI-Kosten. Besonders das 05:30-UTC-Fenster (understanding-Cron + watchdog-
-- getriggerte pipeline) ist betroffen (Audit R14).
--
-- FIX: Die bestehende (leere) Tabelle public.pipeline_locks wird um eine
-- Halter-Kennung (token) erweitert; zwei atomare Funktionen kapseln Acquire/
-- Release. Acquire ist EIN INSERT..ON CONFLICT..WHERE-Statement — Postgres
-- serialisiert konkurrierende Upserts derselben job_name-Zeile ueber den Row-
-- Lock, korrekt ueber beliebig viele Vercel-Invocations. Der App-Code faellt bei
-- Funktions-/DB-Fehler auf FAIL-CLOSED (verweigert den Lauf) — das Gegenteil des
-- bisherigen fail-open.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Zusaetzlich per Flag
-- HELMUT_ATOMIC_LOCK (Default AUS) gesperrt — ohne Migration UND ohne Flag bleibt
-- das bisherige (blob-basierte, fail-open) Verhalten byte-identisch. Erst
-- Migration + Flag = atomarer, fail-closed Lock. Rollback:
-- 20260719_pipeline_lock_atomic_rollback.sql. Idempotent.
-- DSGVO: nur Job-Name/Zeitstempel/Zufalls-Token — keine Inhalte/PII.

begin;

-- Halter-Kennung ergaenzen (Tabelle existiert bereits, Spalten job_name/locked_at/
-- expires_at). Token identifiziert den haltenden Lauf, damit NUR der Halter
-- freigeben kann (kein versehentliches Release eines fremden Nachfolge-Locks nach
-- TTL-Uebernahme).
alter table public.pipeline_locks add column if not exists token text;

-- Atomare Reservierung. Rueckgabe (acquired, token). acquired=true nur, wenn diese
-- Reservierung die Zeile neu angelegt ODER einen ABGELAUFENEN Lock uebernommen hat.
create or replace function public.helmut_acquire_pipeline_lock(p_job text, p_ttl_ms bigint)
returns table(acquired boolean, token text)
language plpgsql
as $$
declare
  v_token  text := gen_random_uuid()::text;
  v_now    timestamptz := now();
  v_result text;
begin
  insert into public.pipeline_locks as l (job_name, locked_at, expires_at, token)
  values (p_job, v_now, v_now + (p_ttl_ms * interval '1 millisecond'), v_token)
  on conflict (job_name) do update
    set locked_at = v_now, expires_at = v_now + (p_ttl_ms * interval '1 millisecond'), token = v_token
    where l.expires_at < v_now          -- nur uebernehmen, wenn der Alt-Lock abgelaufen ist
  returning l.token into v_result;

  if v_result = v_token then
    return query select true, v_token;
  else
    return query select false, null::text;   -- Zeile existiert und ist noch gueltig -> abgelehnt
  end if;
end;
$$;

comment on function public.helmut_acquire_pipeline_lock(text, bigint) is
  'Atomarer Pipeline-Lock (P0-4). Reserviert job_name fuer p_ttl_ms; Rueckgabe (acquired, token). Konkurrenzsicher ueber den Row-Lock des Upserts. App-Code faellt bei Fehler fail-closed.';

-- Release NUR durch den Halter (token-gebunden). Rueckgabe true, wenn geloescht.
create or replace function public.helmut_release_pipeline_lock(p_job text, p_token text)
returns boolean
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.pipeline_locks where job_name = p_job and token = p_token;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

comment on function public.helmut_release_pipeline_lock(text, text) is
  'Gibt einen Pipeline-Lock frei — nur der token-Halter. Verhindert das versehentliche Freigeben eines fremden Nachfolge-Locks nach TTL-Uebernahme.';

-- Zugriff: NUR service_role (wie alle Backend-Pfade). Explizit entziehen.
revoke all on function public.helmut_acquire_pipeline_lock(text, bigint) from public, anon, authenticated;
revoke all on function public.helmut_release_pipeline_lock(text, text) from public, anon, authenticated;
revoke all on table public.pipeline_locks from public, anon, authenticated;

commit;
