-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „OP-30-Zielarchitektur", 2026-08-13) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Dieses Repo spielt Migrationen NICHT automatisch ein; Anwendung
--     ausschließlich manuell durch einen Menschen.
--     Rollback: 20260813_jobqueue_outbox_rollback.sql (gleiches Verzeichnis).
--     Voraussetzung: 20260808_scalable_job_queue.sql ist eingespielt.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- TRANSAKTIONALE OUTBOX für den skalierbaren Pfad (OP-30, Zielarchitektur).
--
-- ANLASS (belegt, Runbook op30-aktivierung-5-mandate.md §19): der zweite
-- Fünferlauf-Versuch hat gezeigt, dass der Motor fehlerfrei, fair und ohne
-- Doppelarbeit läuft — aber die Ankunftsrate (~440–470 Aufträge/Tag bei fünf
-- Mandaten) den slotgebundenen Abfluss (~130–180/Tag) strukturell übersteigt.
-- Die Zielarchitektur löst die Verarbeitung vom Cron-Slot: Arbeit soll
-- EREIGNISGESTEUERT abgeholt werden. Dafür braucht es eine Versandabsicht, die
-- ATOMAR mit dem Auftrag entsteht — sonst kann ein Auftrag existieren, von dem
-- kein Transport je erfährt (verlorenes Wecksignal), oder ein Wecksignal ohne
-- Auftrag (Geisterzustellung).
--
-- GRUNDSÄTZE (identisch zur Warteschlangentabelle 20260808):
--   * ADDITIV. Keine bestehende Tabelle, Spalte, Policy oder Funktion wird
--     verändert. Ohne HELMUT_JOB_DISPATCH_MODE != 'off' liest und schreibt
--     niemand diese Struktur.
--   * SUPABASE BLEIBT DIE WAHRHEIT. Die Outbox trägt KEINE Nutzdaten, KEINE
--     politischen Inhalte, KEINE Mandats-IDs, KEINE Quellen-URLs, KEINE
--     Prompts und KEINE Dokumenttexte — es gibt strukturell keine Spalte, in
--     der so etwas liegen könnte. Sie verweist ausschließlich auf die
--     zufällige Auftrags-ID (uuid) und trägt eine Schema-Version. Der
--     Transport erhält NIE mehr als diese beiden Werte.
--   * KEIN TRANSPORT WIRD ZUR WAHRHEIT. Der Zustand eines Auftrags steht
--     ausschließlich in helmut_jobs. Die Outbox beantwortet nur die Frage
--     „wurde für diesen Auftrag ein Wecksignal geplant/versendet/bestätigt?".
--     Bei Transportausfall bleibt jeder Auftrag vollständig in helmut_jobs
--     erhalten; der Abgleich (helmut_outbox_abgleich) legt die Absicht erneut
--     vor.
--   * SERVERSEITIG. RLS an + forced, anon/authenticated vollständig entzogen,
--     KEINE Policy. Alle Funktionen SECURITY INVOKER mit festem search_path.
--
-- ZUSTANDSMODELL der Versandabsicht:
--   offen      → zu versenden (neu oder erneut fällig)
--   versendet  → Versand angestoßen, Bestätigung steht aus; läuft
--                next_attempt_at ab, gilt der Versuch als verloren und die
--                Absicht wird erneut vergeben (Dispatcher-Absturz)
--   bestaetigt → Versand nachweislich angenommen (2xx des Transports)
--   aufgegeben → Versuchsobergrenze erschöpft; NUR der Versand ist
--                aufgegeben, NIE der Auftrag — der Cron-Rückfallweg und der
--                Abgleich tragen ihn weiter
--   verzichtet → der Auftrag war bereits terminal (erledigt/fehlgeschlagen);
--                ein Versand würde keine wirksame Verarbeitung mehr auslösen

begin;

-- ── 1) Die Outbox-Tabelle ───────────────────────────────────────────────────
create table if not exists public.helmut_job_outbox (
  id               uuid        primary key default gen_random_uuid(),
  -- (§9.1) GENAU EIN Auftrag je Versandabsicht — und genau EINE Absicht je
  -- Auftrag (unique). Mehrfaches Planen trifft per Upsert immer dieselbe
  -- Zeile (§9.3). ON DELETE CASCADE: eine Neutralisierung der Warteschlange
  -- (Runbook §17.8) räumt die zugehörigen Absichten mit auf — eine Absicht
  -- ohne Auftrag wäre genau das Auseinanderfallen, das §9.2 verbietet.
  job_id           uuid        not null references public.helmut_jobs(id) on delete cascade,
  -- Version des Transportvertrags. Ein Verbraucher, der eine NEUERE Version
  -- erhält als er kennt, verarbeitet NICHT (sichere Behandlung alter und
  -- neuer Deployment-Versionen); der Abgleich legt die Absicht später erneut
  -- vor, wenn das neue Deployment überall angekommen ist.
  schema_version   integer     not null default 1,
  status           text        not null default 'offen',
  -- Welcher Transport hat zuletzt versendet/bestätigt ('schatten',
  -- 'selbstweck', 'vercel-queues', …). Reiner Transportname, kein Inhalt.
  transport        text,
  attempts         integer     not null default 0,
  max_attempts     integer     not null default 10,
  -- Letzter BEREINIGTER Fehler (die App maskiert, der Trigger kappt hart).
  last_error       text,
  -- Nächster zulässiger Versuch (§9.7). Wird beim Vergeben mit Backoff
  -- gesetzt; eine 'versendet'-Zeile, deren next_attempt_at abläuft, gilt als
  -- unbestätigt verloren und wird erneut vergeben (§9.10).
  next_attempt_at  timestamptz not null default now(),
  sent_at          timestamptz,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint helmut_job_outbox_status_chk
    check (status in ('offen', 'versendet', 'bestaetigt', 'aufgegeben', 'verzichtet')),
  constraint helmut_job_outbox_attempts_chk
    check (attempts >= 0 and max_attempts >= 1 and max_attempts <= 100),
  constraint helmut_job_outbox_version_chk
    check (schema_version >= 1)
);

create unique index if not exists helmut_job_outbox_job_uidx
  on public.helmut_job_outbox (job_id);

-- Vergabe-Index: exakt die Bedingung von helmut_outbox_naechste.
create index if not exists helmut_job_outbox_faellig_idx
  on public.helmut_job_outbox (next_attempt_at)
  where status in ('offen', 'versendet');

create index if not exists helmut_job_outbox_status_idx
  on public.helmut_job_outbox (status);

comment on table public.helmut_job_outbox is
  'OP-30-Zielarchitektur: transaktionale Versandabsichten fuer Wecksignale. Traegt AUSSCHLIESSLICH Auftrags-ID (uuid) und Schema-Version — strukturell keine Spalte fuer Inhalte, Mandate, URLs oder Prompts. helmut_jobs bleibt die einzige Wahrheit ueber den Auftragszustand.';
comment on column public.helmut_job_outbox.schema_version is
  'Version des Transportvertrags. Verbraucher verarbeiten keine Version, die neuer ist als ihr Deployment.';
comment on column public.helmut_job_outbox.status is
  'offen | versendet | bestaetigt | aufgegeben (nur der VERSAND, nie der Auftrag) | verzichtet (Auftrag war terminal).';

-- ── 2) Kappungs-Trigger: keine unbegrenzten Fehlertexte ─────────────────────
-- Zweite Verteidigungslinie wie bei helmut_jobs: die App bereinigt
-- (job-dispatch.js nutzt scalable-pipeline.bereinigeFehler), die DB kappt.
create or replace function public.helmut_job_outbox_kappen()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.last_error is not null and length(new.last_error) > 300 then
    new.last_error := left(new.last_error, 300);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.helmut_job_outbox_kappen() from public, anon, authenticated;

drop trigger if exists helmut_job_outbox_kappen_trg on public.helmut_job_outbox;
create trigger helmut_job_outbox_kappen_trg
  before insert or update on public.helmut_job_outbox
  for each row execute function public.helmut_job_outbox_kappen();

-- ── 3) Einreihen MIT Versandabsicht — EINE Transaktion ──────────────────────
-- Ruft das UNVERÄNDERTE helmut_enqueue_job auf und legt die Versandabsicht im
-- selben Funktionskörper an. Ein plpgsql-Funktionskörper ist EINE Transaktion:
-- Auftrag und Absicht können nicht auseinanderfallen (§9.2) — entweder
-- entstehen beide oder keiner.
--
-- versandabsicht im Rückgabewert:
--   'neu'            → Absicht neu angelegt
--   'wiedereroeffnet'→ bestehende, bereits abgeschlossene Absicht wieder
--                      geöffnet (Auftrag ist noch offen, z. B. Wecksignal
--                      verloren nach bestätigtem Versand)
--   'unveraendert'   → Absicht ist bereits offen/unterwegs
--   'keine'          → Auftrag ist terminal (erledigt/fehlgeschlagen) — ein
--                      Versand würde keine wirksame Verarbeitung auslösen
--                      (§9.11/§9.12); es entsteht KEINE Absicht
create or replace function public.helmut_enqueue_job_mit_outbox(
  p_job_type        text,
  p_idempotency_key text,
  p_freshness_window text,
  p_payload         jsonb,
  p_due_at          timestamptz default now(),
  p_priority        smallint    default 100,
  p_max_attempts    integer     default 5,
  p_tenant_id       text        default null,
  p_schema_version  integer     default 1
)
returns table(id uuid, neu boolean, versandabsicht text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_neu      boolean;
  v_status   text;
  v_absicht  text := 'keine';
  v_outbox   public.helmut_job_outbox%rowtype;
begin
  select e.id, e.neu into v_id, v_neu
    from public.helmut_enqueue_job(
      p_job_type, p_idempotency_key, p_freshness_window, p_payload,
      p_due_at, p_priority, p_max_attempts, p_tenant_id) e;

  if v_id is null then
    -- Darf nach dem Vertrag von helmut_enqueue_job nicht passieren; ehrlich
    -- durchreichen statt eine Absicht ohne Auftrag zu erzeugen.
    return query select null::uuid, false, 'kein-auftrag'::text;
    return;
  end if;

  select j.status into v_status from public.helmut_jobs j where j.id = v_id;

  if v_status in ('wartend', 'laeuft') then
    select * into v_outbox from public.helmut_job_outbox o
     where o.job_id = v_id
     for update;

    if not found then
      -- Versandreif erst zur FAELLIGKEIT des Auftrags: ein Wecksignal fuer Arbeit,
      -- die noch niemand beanspruchen darf, waere reiner Leerlauf beim Verbraucher.
      insert into public.helmut_job_outbox (job_id, schema_version, next_attempt_at)
      values (v_id, greatest(coalesce(p_schema_version, 1), 1),
              greatest(now(), coalesce(p_due_at, now())));
      v_absicht := 'neu';
    elsif v_outbox.status in ('bestaetigt', 'aufgegeben', 'verzichtet') then
      -- Der Auftrag ist noch offen, aber die Absicht war abgeschlossen: das
      -- Wecksignal hat offenbar keinen Verbraucher erreicht (oder der Versand
      -- war aufgegeben). Wieder öffnen — der Versuchszähler beginnt neu, weil
      -- dies eine NEUE Planungsrunde ist; die alte Historie bleibt in
      -- attempts-Summen der Kennzahlen sichtbar, nicht in dieser Zeile.
      update public.helmut_job_outbox o
         set status = 'offen',
             attempts = 0,
             schema_version = greatest(coalesce(p_schema_version, 1), 1),
             next_attempt_at = now(),
             last_error = null
       where o.id = v_outbox.id;
      v_absicht := 'wiedereroeffnet';
    else
      v_absicht := 'unveraendert';
    end if;
  end if;

  return query select v_id, v_neu, v_absicht;
end;
$$;

comment on function public.helmut_enqueue_job_mit_outbox(text, text, text, jsonb, timestamptz, smallint, integer, text, integer) is
  'Idempotentes Einreihen MIT Versandabsicht in EINER Transaktion. Terminal abgeschlossene Auftraege erhalten keine Absicht (versandabsicht=keine). Mehrfaches Planen bleibt idempotent.';

-- ── 4) Fällige Versandabsichten vergeben (Dispatcher-Claim) ─────────────────
-- ATOMAR über for update skip locked — zwei gleichzeitige Dispatcher sehen
-- disjunkte Mengen. Erschöpfte Absichten werden VOR der Vergabe sichtbar
-- aufgegeben (nie still). Der Backoff ist deterministisch (kein random):
-- least(30 min, 30 s * 2^attempts).
create or replace function public.helmut_outbox_naechste(
  p_limit     integer,
  p_transport text default null
)
returns table(outbox_id uuid, job_id uuid, schema_version integer, attempts integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  -- (a) Erschöpfte Absichten aufgeben — sichtbar, bevor sie je wieder
  --     vergeben würden. Der AUFTRAG bleibt unberührt in helmut_jobs.
  update public.helmut_job_outbox o
     set status = 'aufgegeben',
         last_error = coalesce(o.last_error, 'versandversuche-erschoepft')
   where o.status in ('offen', 'versendet')
     and o.attempts >= o.max_attempts;

  -- (b) Fällige vergeben: offene UND unbestätigt abgelaufene (Dispatcher-
  --     Absturz nach Versand, §9.10).
  return query
  with kandidaten as (
    select o.id
      from public.helmut_job_outbox o
     where o.status in ('offen', 'versendet')
       and o.next_attempt_at <= v_now
       and o.attempts < o.max_attempts
     order by o.next_attempt_at asc
     for update skip locked
     limit greatest(coalesce(p_limit, 1), 0)
  )
  update public.helmut_job_outbox o
     set status          = 'versendet',
         attempts        = o.attempts + 1,
         sent_at         = v_now,
         transport       = coalesce(p_transport, o.transport),
         next_attempt_at = v_now + least(interval '30 minutes',
                             (30 * power(2, o.attempts))::numeric * interval '1 second')
    from kandidaten k
   where o.id = k.id
  returning o.id, o.job_id, o.schema_version, o.attempts;
end;
$$;

comment on function public.helmut_outbox_naechste(integer, text) is
  'Vergibt faellige Versandabsichten atomar (for update skip locked), gibt erschoepfte vorher sichtbar auf. Deterministischer Backoff least(30min, 30s*2^attempts).';

-- ── 5) Versand bestätigen oder Fehlversuch verbuchen ────────────────────────
-- Ein Versandfehler verändert den FACHLICHEN Auftrag nie (§9.8): diese
-- Funktion schreibt ausschließlich die Outbox-Zeile.
create or replace function public.helmut_outbox_bestaetige(
  p_outbox_id uuid,
  p_ok        boolean,
  p_fehler    text default null
)
returns table(uebernommen boolean, neuer_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_ok then
    update public.helmut_job_outbox o
       set status = 'bestaetigt', confirmed_at = now(), last_error = null
     where o.id = p_outbox_id and o.status = 'versendet'
    returning o.status into v_status;
  else
    update public.helmut_job_outbox o
       set status = case when o.attempts >= o.max_attempts then 'aufgegeben' else 'offen' end,
           last_error = left(coalesce(p_fehler, 'versand-fehlgeschlagen'), 300)
     where o.id = p_outbox_id and o.status = 'versendet'
    returning o.status into v_status;
  end if;

  if v_status is null then
    -- Zeile nicht in 'versendet' (bereits bestätigt, erneut vergeben oder
    -- gelöscht): ehrlich melden, nichts behaupten.
    select o.status into v_status from public.helmut_job_outbox o where o.id = p_outbox_id;
    return query select false, v_status;
    return;
  end if;
  return query select true, v_status;
end;
$$;

comment on function public.helmut_outbox_bestaetige(uuid, boolean, text) is
  'Bestaetigt einen Versand (nur aus versendet) oder verbucht den Fehlversuch (zurueck auf offen bzw. aufgegeben). Schreibt NIE den fachlichen Auftrag.';

-- ── 6) Abgleich — das Sicherheitsnetz, nicht der primäre Antrieb ────────────
-- Erkennt (a) ausführbare Aufträge ohne gültige Versandabsicht und merkt sie
-- erneut zur Zustellung vor, (b) Absichten terminaler Aufträge (verzichtet),
-- (c) bestätigte Absichten, deren Auftrag trotz Wecksignal seit
-- p_mindestalter_minuten wartend blieb (Wecksignal verloren → wieder öffnen).
create or replace function public.helmut_outbox_abgleich(
  p_limit                 integer default 200,
  p_mindestalter_minuten  integer default 10
)
returns table(fehlend bigint, wiedereroeffnet bigint, verzichtet bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now        timestamptz := now();
  v_alter      interval := greatest(coalesce(p_mindestalter_minuten, 10), 1) * interval '1 minute';
  v_fehlend    bigint := 0;
  v_wieder     bigint := 0;
  v_verzichtet bigint := 0;
begin
  -- (c) Absichten terminaler Aufträge schließen (keine wirksame neue
  --     Verarbeitung, §9.11/§9.12).
  update public.helmut_job_outbox o
     set status = 'verzichtet'
    from public.helmut_jobs j
   where j.id = o.job_id
     and j.status in ('erledigt', 'fehlgeschlagen')
     and o.status in ('offen', 'versendet', 'aufgegeben');
  get diagnostics v_verzichtet = row_count;

  -- (a) Ausführbare Aufträge OHNE Versandabsicht: Absicht anlegen.
  with fehlende as (
    select j.id as job_id
      from public.helmut_jobs j
     where j.status = 'wartend'
       and j.due_at <= v_now
       and not exists (select 1 from public.helmut_job_outbox o where o.job_id = j.id)
     order by j.due_at asc
     limit greatest(coalesce(p_limit, 200), 1)
  )
  insert into public.helmut_job_outbox (job_id)
  select job_id from fehlende
  on conflict (job_id) do nothing;
  get diagnostics v_fehlend = row_count;

  -- (b) Bestätigte oder aufgegebene Absichten, deren Auftrag TROTZDEM seit
  --     p_mindestalter_minuten ausführbar wartet: das Wecksignal hat keinen
  --     Verbraucher erreicht (oder der Versand war aufgegeben) → wieder
  --     öffnen. Versuchszähler beginnt neu (neue Zustellrunde).
  with verwaiste as (
    select o.id
      from public.helmut_job_outbox o
      join public.helmut_jobs j on j.id = o.job_id
     where j.status = 'wartend'
       and j.due_at <= v_now - v_alter
       and o.status in ('bestaetigt', 'aufgegeben')
       and coalesce(o.confirmed_at, o.updated_at) <= v_now - v_alter
     order by j.due_at asc
     limit greatest(coalesce(p_limit, 200), 1)
     for update of o skip locked
  )
  update public.helmut_job_outbox o
     set status = 'offen', attempts = 0, next_attempt_at = v_now, last_error = null
    from verwaiste v
   where o.id = v.id;
  get diagnostics v_wieder = row_count;

  return query select v_fehlend, v_wieder, v_verzichtet;
end;
$$;

comment on function public.helmut_outbox_abgleich(integer, integer) is
  'Sicherheitsnetz (nicht der primaere Antrieb): legt fehlende Versandabsichten fuer ausfuehrbare Auftraege an, oeffnet verwaiste wieder und schliesst Absichten terminaler Auftraege als verzichtet.';

-- ── 7) Kennzahlen (rein lesend) ─────────────────────────────────────────────
create or replace function public.helmut_outbox_kennzahlen()
returns table(
  offen                bigint,
  versendet            bigint,
  bestaetigt           bigint,
  aufgegeben           bigint,
  verzichtet           bigint,
  faellig_jetzt        bigint,
  versuche_gesamt      bigint,
  aelteste_offene_s    numeric,
  auftraege_ohne_absicht bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.helmut_job_outbox where status = 'offen'),
    (select count(*) from public.helmut_job_outbox where status = 'versendet'),
    (select count(*) from public.helmut_job_outbox where status = 'bestaetigt'),
    (select count(*) from public.helmut_job_outbox where status = 'aufgegeben'),
    (select count(*) from public.helmut_job_outbox where status = 'verzichtet'),
    (select count(*) from public.helmut_job_outbox
      where status in ('offen', 'versendet') and next_attempt_at <= now()),
    (select coalesce(sum(attempts), 0) from public.helmut_job_outbox),
    (select coalesce(max(extract(epoch from (now() - created_at))), 0)
       from public.helmut_job_outbox where status = 'offen'),
    (select count(*) from public.helmut_jobs j
      where j.status = 'wartend' and j.due_at <= now()
        and not exists (select 1 from public.helmut_job_outbox o where o.job_id = j.id));
$$;

comment on function public.helmut_outbox_kennzahlen() is
  'Betriebskennzahlen der Outbox (rein lesend, nur Zaehler und Zeitspannen).';

-- ── 8) Zugriff: ausschließlich serverseitig (zwei unabhängige Riegel) ───────
alter table public.helmut_job_outbox enable row level security;
alter table public.helmut_job_outbox force row level security;
revoke all on table public.helmut_job_outbox from public, anon, authenticated;

revoke all on function public.helmut_enqueue_job_mit_outbox(text, text, text, jsonb, timestamptz, smallint, integer, text, integer) from public, anon, authenticated;
revoke all on function public.helmut_outbox_naechste(integer, text)        from public, anon, authenticated;
revoke all on function public.helmut_outbox_bestaetige(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.helmut_outbox_abgleich(integer, integer)      from public, anon, authenticated;
revoke all on function public.helmut_outbox_kennzahlen()                    from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.helmut_job_outbox to service_role';
    execute 'grant execute on function public.helmut_enqueue_job_mit_outbox(text, text, text, jsonb, timestamptz, smallint, integer, text, integer) to service_role';
    execute 'grant execute on function public.helmut_outbox_naechste(integer, text) to service_role';
    execute 'grant execute on function public.helmut_outbox_bestaetige(uuid, boolean, text) to service_role';
    execute 'grant execute on function public.helmut_outbox_abgleich(integer, integer) to service_role';
    execute 'grant execute on function public.helmut_outbox_kennzahlen() to service_role';
  end if;
end $$;

commit;

-- ── Verifikation nach der Anwendung (rein lesend) ───────────────────────────
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='helmut_job_outbox';        -- 1
--   select relrowsecurity, relforcerowsecurity from pg_class
--    where oid='public.helmut_job_outbox'::regclass;                        -- t / t
--   select count(*) from pg_policies
--    where schemaname='public' and tablename='helmut_job_outbox';           -- 0
--   select count(*) from information_schema.role_table_grants
--    where table_name='helmut_job_outbox'
--      and grantee in ('anon','authenticated','PUBLIC');                    -- 0
--   select count(*) from information_schema.columns
--    where table_name='helmut_job_outbox'
--      and column_name in ('payload','inhalt','text','url','prompt');       -- 0 (keine Inhaltsspalte)
