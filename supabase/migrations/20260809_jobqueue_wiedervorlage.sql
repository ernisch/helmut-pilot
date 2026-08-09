-- Helmut — Arbeitswarteschlange: begrenzte Wiedervorlage endgueltig gescheiterter Auftraege
-- ==============================================================================================
-- BEFUND O5 des unabhaengigen Abschlussreviews vom 2026-08-08 — hier behoben.
--
-- DAS PROBLEM. Der Idempotenzschluessel eines Verstehensauftrags traegt BEWUSST kein
-- Aktualitaetsfenster: er ist der Inhaltsfingerabdruck der Dokumentmenge
-- (`document_understanding|<hash>`), damit derselbe Artikel nicht in jedem Fenster erneut
-- zum Verstehen angemeldet wird. Genau das wird zur Falle, sobald der Auftrag ENDGUELTIG
-- scheitert: `helmut_enqueue_job` legt ihn wegen des eindeutigen Schluessels nie wieder an,
-- und `helmut_jobs_bereinigen` loescht `fehlgeschlagen` ausdruecklich NICHT (er ist der
-- Fehlerbeleg). Diese Dokumentmenge waere damit DAUERHAFT vom Verstehen ausgeschlossen —
-- nach einem einzigen schlechten Tag, etwa einer voruebergehenden Modellstoerung.
--
-- Zusammen mit der neuen Wartefrist aus Befund O4 (`budget-dauerhaft-erschoepft` nach 48 h)
-- waere das ein echter Datenverlust im Betrieb: Dokumente, die nie verstanden werden und
-- deren Vorgaenge damit in keiner Lage auftauchen.
--
-- DIE KORREKTUR TRENNT BELEG UND BLOCKADE. Die Zeile bleibt erhalten — mit ihrem Fehlertext,
-- ihrer Versuchszahl und einem Zaehler, wie oft sie schon wiedervorgelegt wurde. Sie wird
-- lediglich wieder `wartend`. Nichts wird geloescht, nichts wird beschoenigt: der Verlauf
-- steht danach vollstaendig in `last_error` und `wiedervorlagen`.
--
-- BEGRENZT, nicht endlos. Nach `p_max_wiedervorlagen` Versuchen bleibt der Auftrag
-- endgueltig gescheitert. Das ist eine bewusste Entscheidung und keine Panne: eine
-- Dokumentmenge, die auch beim dritten Anlauf nicht verstanden werden kann, ist ein Befund
-- fuer den Betreiber und keine Arbeit fuer den Worker. `helmut_jobs_blockiert()` macht genau
-- diese Menge sichtbar.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Idempotent.
-- DSGVO: beruehrt ausschliesslich Zustandsfelder der eigenen Warteschlangentabelle — keine
-- Inhalte, keine personenbezogenen Daten, keine Loeschung.
-- Rollback: 20260809_jobqueue_wiedervorlage_rollback.sql
-- Voraussetzung: 20260808_scalable_job_queue.sql ist eingespielt.

begin;

-- Wie oft wurde dieser Auftrag schon wiedervorgelegt? Der Zaehler ist die Obergrenze und
-- zugleich der Beleg. Er wird NIE zurueckgesetzt.
alter table public.helmut_jobs
  add column if not exists wiedervorlagen integer not null default 0;

alter table public.helmut_jobs
  drop constraint if exists helmut_jobs_wiedervorlagen_chk;
alter table public.helmut_jobs
  add constraint helmut_jobs_wiedervorlagen_chk check (wiedervorlagen >= 0 and wiedervorlagen <= 100);

-- Index fuer genau die Auswahlabfrage unten. Ohne ihn liest die Wiedervorlage bei
-- 1 000 Mandaten den gesamten Bestand.
create index if not exists helmut_jobs_wiedervorlage_idx
  on public.helmut_jobs (job_type, finished_at, wiedervorlagen)
  where status = 'fehlgeschlagen';

-- ── Was WUERDE wiedervorgelegt? (rein lesend) ────────────────────────────────────────────
create or replace function public.helmut_jobs_wiedervorlage_vorschau(
  p_typen               text[]  default array['document_understanding'],
  p_aelter_als_stunden  integer default 24,
  p_max_wiedervorlagen  integer default 2
)
returns table(
  kandidaten          bigint,
  dauerhaft_blockiert bigint,
  noch_zu_jung        bigint,
  aeltester           timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with grenze as (
    select now() - (greatest(coalesce(p_aelter_als_stunden, 24), 1) * interval '1 hour') as t
  )
  select
    count(*) filter (
      where j.finished_at < (select t from grenze)
        and j.wiedervorlagen < greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    count(*) filter (
      where j.wiedervorlagen >= greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    count(*) filter (
      where j.finished_at >= (select t from grenze)
        and j.wiedervorlagen < greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    min(j.finished_at)
    from public.helmut_jobs j
   where j.status = 'fehlgeschlagen'
     and (p_typen is null or j.job_type = any(p_typen));
$$;

comment on function public.helmut_jobs_wiedervorlage_vorschau(text[], integer, integer) is
  'OP-30/O5: zeigt, welche endgueltig gescheiterten Auftraege wiedervorgelegt wuerden und welche dauerhaft blockiert bleiben. Rein lesend.';

-- ── Die Wiedervorlage selbst ─────────────────────────────────────────────────────────────
-- STANDARD IST TROCKENLAUF — dieselbe Disziplin wie bei der Bereinigung: eine Funktion, die
-- Zustand aendert, tut das nur, wenn der Aufrufer es ausdruecklich sagt.
create or replace function public.helmut_jobs_wiedervorlage(
  p_typen               text[]  default array['document_understanding'],
  p_aelter_als_stunden  integer default 24,
  p_max_wiedervorlagen  integer default 2,
  p_max_zeilen          integer default 500,
  p_trockenlauf         boolean default true
)
returns table(
  gefunden        bigint,
  wiedervorgelegt bigint,
  trockenlauf     boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_grenze timestamptz := now() - (greatest(coalesce(p_aelter_als_stunden, 24), 1) * interval '1 hour');
  v_max_wv integer     := greatest(coalesce(p_max_wiedervorlagen, 2), 0);
  v_max    integer     := greatest(coalesce(p_max_zeilen, 500), 1);
  v_gefunden bigint;
  v_getan    bigint := 0;
begin
  select count(*) into v_gefunden
    from public.helmut_jobs j
   where j.status = 'fehlgeschlagen'
     and (p_typen is null or j.job_type = any(p_typen))
     and j.finished_at < v_grenze
     and j.wiedervorlagen < v_max_wv;

  if coalesce(p_trockenlauf, true) then
    return query select v_gefunden, 0::bigint, true;
    return;
  end if;

  with kandidaten as (
    select j.id
      from public.helmut_jobs j
     where j.status = 'fehlgeschlagen'
       and (p_typen is null or j.job_type = any(p_typen))
       and j.finished_at < v_grenze
       and j.wiedervorlagen < v_max_wv
     order by j.finished_at asc
     limit v_max
     -- Nebenlaeufigkeitsfest wie der Claim: zwei gleichzeitige Wiedervorlagen duerfen
     -- denselben Auftrag nicht zweimal nehmen.
     for update skip locked
  )
  update public.helmut_jobs j
     set status         = 'wartend',
         -- Der Auftrag beginnt mit einem frischen Versuchskonto, sonst waere er nach dem
         -- ersten neuen Fehlversuch sofort wieder endgueltig gescheitert.
         attempts       = 0,
         due_at         = now(),
         -- `first_due_at` bleibt UNVERAENDERT: die Rueckstandsmessung soll weiterhin sehen,
         -- wie lange diese Arbeit insgesamt offen ist. Genau das war Befund B2.
         finished_at    = null,
         lease_owner    = null,
         lease_expires_at = null,
         wiedervorlagen = j.wiedervorlagen + 1,
         -- DER BELEG BLEIBT. Der bisherige Fehlertext wird nicht geloescht, sondern
         -- ausdruecklich als Vorgeschichte gekennzeichnet.
         last_error     = 'wiedervorlage ' || (j.wiedervorlagen + 1)::text
                          || ' nach: ' || left(coalesce(j.last_error, 'unbekannt'), 180),
         updated_at     = now()
    from kandidaten k
   where j.id = k.id;

  get diagnostics v_getan = row_count;
  return query select v_gefunden, v_getan, false;
end;
$$;

comment on function public.helmut_jobs_wiedervorlage(text[], integer, integer, integer, boolean) is
  'OP-30/O5: legt endgueltig gescheiterte Auftraege BEGRENZT oft wieder vor, ohne den Fehlerbeleg zu loeschen. STANDARD IST TROCKENLAUF. Noetig, weil der Idempotenzschluessel des Verstehens kein Fenster traegt und eine gescheiterte Dokumentmenge sonst dauerhaft blockiert waere.';

-- ── Was bleibt dauerhaft blockiert? (rein lesend, fuer die Betriebsanzeige) ──────────────
create or replace function public.helmut_jobs_blockiert(
  p_max_wiedervorlagen integer default 2
)
returns table(
  blockiert   bigint,
  nach_typ    jsonb,
  aeltester   timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*),
    coalesce(jsonb_object_agg(t.job_type, t.n) filter (where t.job_type is not null), '{}'::jsonb),
    min(j.finished_at)
    from public.helmut_jobs j
    left join lateral (
      select j2.job_type, count(*) as n
        from public.helmut_jobs j2
       where j2.status = 'fehlgeschlagen'
         and j2.wiedervorlagen >= greatest(coalesce(p_max_wiedervorlagen, 2), 0)
       group by j2.job_type
    ) t on true
   where j.status = 'fehlgeschlagen'
     and j.wiedervorlagen >= greatest(coalesce(p_max_wiedervorlagen, 2), 0);
$$;

comment on function public.helmut_jobs_blockiert(integer) is
  'OP-30/O5: zaehlt Auftraege, die auch nach der zulaessigen Zahl von Wiedervorlagen endgueltig gescheitert sind. Das ist die Menge, die ein Betreiber ansehen muss — sie kommt von selbst nicht zurueck.';

-- Kein Browserzugriff (identische Zusage wie die Basistabelle).
revoke all on function public.helmut_jobs_wiedervorlage_vorschau(text[], integer, integer) from public, anon, authenticated;
revoke all on function public.helmut_jobs_wiedervorlage(text[], integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.helmut_jobs_blockiert(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_wiedervorlage_vorschau(text[], integer, integer) to service_role';
    execute 'grant execute on function public.helmut_jobs_wiedervorlage(text[], integer, integer, integer, boolean) to service_role';
    execute 'grant execute on function public.helmut_jobs_blockiert(integer) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select * from public.helmut_jobs_wiedervorlage_vorschau();
--   select * from public.helmut_jobs_wiedervorlage();            -- Trockenlauf, aendert nichts
--   select * from public.helmut_jobs_blockiert();
