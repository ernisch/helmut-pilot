-- Helmut — ROLLBACK zu 20260809_jobqueue_narrativ.sql
-- ==============================================================================================
-- Nimmt den fuenften Auftragstyp `tenant_narrative` vollstaendig zurueck: die CHECK-Menge
-- kennt danach wieder exakt die vier urspruenglichen Typen, und `helmut_enqueue_job` lehnt
-- `tenant_narrative` wieder ab. Der App-Code faellt dann erkennbar auf
-- `verfuegbar:false, grund:'helmut_jobs_type_chk…'` zurueck — er behauptet NICHT, es sei
-- alles in Ordnung.
--
-- ZU DEN GELOESCHTEN ZEILEN — ausdruecklich begruendet: damit der alte Constraint wieder
-- angelegt werden kann, muessen vorhandene `tenant_narrative`-Zeilen entfernt werden.
-- Das sind WARTESCHLANGENZEILEN, also Betriebszustand — KEINE fachlichen Bestandsdaten:
-- die veroeffentlichten Narrative liegen im Briefing-Tagescache (Tabelle `briefings`,
-- Zeilen `bf-<mandat>-lage-<tag>`) und bleiben von diesem Rollback vollstaendig unberuehrt.
-- Dieselbe Einordnung trifft bereits der Rollback der Basismigration
-- (20260808_scalable_job_queue_rollback.sql), der die GESAMTE Warteschlangentabelle
-- entfernt. Die Zahl der entfernten Zeilen wird ausgegeben (Beleg statt Stille).
--
-- Idempotent: mehrfaches Einspielen ist harmlos.

begin;

-- Idempotent AUCH nach dem Basis-Rollback: existiert die Tabelle nicht mehr (die
-- Basismigration wurde bereits zurueckgenommen), ist hier nichts zu tun — derselbe
-- `if exists`-Stil wie im Wiedervorlage-Rollback. Belegter Anlass: die Kettenprobe
-- (anwenden x2 -> Rollback rueckwaerts x2 -> erneut anwenden) laeuft die Rollbacks
-- ZWEIMAL; beim zweiten Mal ist die Tabelle weg.
do $$
declare
  v_entfernt bigint;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'helmut_jobs') then
    raise notice 'jobqueue_narrativ_rollback: helmut_jobs existiert nicht (Basis bereits zurueckgenommen) — nichts zu tun.';
    return;
  end if;
  delete from public.helmut_jobs where job_type = 'tenant_narrative';
  get diagnostics v_entfernt = row_count;
  raise notice 'jobqueue_narrativ_rollback: % tenant_narrative-Warteschlangenzeile(n) entfernt (Betriebszustand, keine fachlichen Bestandsdaten).', v_entfernt;
  alter table public.helmut_jobs
    drop constraint if exists helmut_jobs_type_chk;
  alter table public.helmut_jobs
    add constraint helmut_jobs_type_chk
    check (job_type in ('source_fetch', 'document_understanding',
                        'mandate_projection', 'briefing_materialization'));
end
$$;

commit;

-- Nachpruefung (lesend):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'helmut_jobs_type_chk';
--   -- darf tenant_narrative NICHT mehr enthalten.
--   select count(*) from public.helmut_jobs where job_type = 'tenant_narrative';  -- 0
