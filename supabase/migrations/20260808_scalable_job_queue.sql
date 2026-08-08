-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „Skalierungsgrundlage 1000", 2026-08-08) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Dieses Repo spielt Migrationen NICHT automatisch ein; Anwendung
--     ausschließlich manuell durch einen Menschen (psql / Supabase-Dashboard /
--     MCP apply_migration).
--     Rollback: 20260808_scalable_job_queue_rollback.sql (gleiches Verzeichnis).
--     Vorabprüfung + Reihenfolge: docs/betrieb/skalierungsgrundlage-1000.md §6.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DAUERHAFTE ARBEITSWARTESCHLANGE für den skalierbaren Pfad (OP-30).
--
-- ANLASS (belegt, docs/betrieb/v3-skalierungspruefung-2026-08-08.md):
--   Der heutige schwere Cronlauf erledigt Planung UND Verarbeitung in EINEM
--   300-s-Serverless-Fenster. Daraus folgen zwei harte, unabhängige Schranken:
--     * der Quellenabruf reißt sein Budget zwischen n = 14 und n = 15 Mandaten,
--     * `budgetAufteilung` deckelt die Projektionszeit auf 135 s, also auf
--       ~16–17 Mandate JE LAUF — unabhängig von der Gesamtzahl.
--   Beides ist eine Eigenschaft des Cron-Slots, nicht des V3-Datenmotors. Diese
--   Struktur löst die Arbeit vom Slot: der Cron plant nur noch, gearbeitet wird
--   aus einer dauerhaften Warteschlange heraus.
--
-- WARUM EINE RELATIONALE TABELLE UND NICHT pgmq (Vergleich, §5 des Auftrags):
--   Geprüft wurden genau zwei Möglichkeiten. Entschieden wurde für die
--   relationale Arbeitstabelle mit `for update skip locked`, aus drei Gründen:
--     1. VERFÜGBARKEIT: `pgmq` ist im Repository nirgends aktiviert (einzige
--        `create extension` im Bestand ist `vector`, supabase/schema.sql:520),
--        und die Supabase-Version ist lokal NICHT verlässlich feststellbar
--        (kein supabase-CLI, keine config.toml, kein Egress). Der Auftrag
--        schreibt für genau diesen Fall die relationale Lösung vor.
--     2. ANFORDERUNGSDECKUNG: von den 14 geforderten Eigenschaften deckt pgmq
--        ab Werk nur Dauerhaftigkeit, atomare Reservierung, Sichtbarkeitsdauer
--        und begrenzte Wiederholungen. Priorität, geplante Fälligkeit, faire
--        Verarbeitung, Idempotenz, Fehlerstatus, Rückstandsmessung und
--        Auditierbarkeit bräuchten in JEDEM Fall zusätzliche eigene Tabellen —
--        also genau die Struktur hier, dann aber doppelt geführt.
--     3. KEINE NEUE ABHÄNGIGKEIT: `for update skip locked` ist Kern-Postgres
--        seit 9.5. Es kommt keine Extension, kein Dienst und kein npm-Paket
--        hinzu (Auftrag §5, letzte Zeile).
--
-- GRUNDSÄTZE:
--   * ADDITIV. Keine bestehende Tabelle, Spalte, Policy, Funktion oder
--     Ergebniskennung wird verändert. Kein Backfill. Ohne das Flag
--     HELMUT_SCALABLE_PIPELINE liest und schreibt niemand diese Struktur.
--   * SERVERSEITIG. Kein Browserzugriff. RLS an, `anon`/`authenticated`
--     vollständig entzogen, KEINE Lesepolicy. Der einzige Zugriff läuft über
--     `service_role` (bypassrls) wie jeder andere Backend-Pfad.
--   * KEINE SECURITY-DEFINER-FUNKTION. Alle Funktionen sind SECURITY INVOKER
--     und laufen mit den Rechten des Aufrufers — sie schaffen keine neue
--     privilegierte Fläche, sondern nur Transaktionsgrenzen. `search_path` ist
--     trotzdem fest gesetzt (Hygiene, Advisor 0011, vgl. 20260721).
--   * KEINE GEHEIMNISSE, KEINE ROHANTWORTEN. `payload` und `last_error` sind
--     durch einen Trigger auf Länge begrenzt; die Bereinigung selbst passiert
--     in der App (lib/helmut/jobqueue.js `bereinigeFehler`). Die DB ist die
--     zweite Verteidigungslinie, nicht die einzige.
--
-- ZEIT: alle Zeitstempel `timestamptz`, Fälligkeit wird in UTC gerechnet.

begin;

-- ── 1) Die Warteschlangentabelle ────────────────────────────────────────────
-- Ein Auftrag ist die kleinste wiederholbare Arbeitseinheit. Er trägt alle 15
-- vom Auftrag geforderten Felder; darüber hinaus nur, was für Fairness,
-- Rückstandsmessung und Auditierbarkeit wirklich gebraucht wird.
create table if not exists public.helmut_jobs (
  -- (1) Eindeutige ID
  id                uuid primary key default gen_random_uuid(),
  -- (2) Aufgabentyp — bewusst als CHECK statt ENUM: ein neuer Typ ist dann ein
  --     Ein-Zeilen-Migrationsschritt und kein Typ-Umbau.
  job_type          text        not null,
  -- (3) Deterministischer Idempotenzschlüssel. Er enthält das Aktualitätsfenster,
  --     deshalb ist er GLOBAL eindeutig (nicht nur unter offenen Aufträgen):
  --     wiederholtes Planen im selben Fenster erzeugt nie einen zweiten Auftrag,
  --     auch wenn der erste bereits erledigt ist. Ein neues Fenster = neuer
  --     Schlüssel = neuer Auftrag.
  idempotency_key   text        not null,
  -- Aktualitätsfenster als eigenes Feld, damit Rückstand und Aufräumen je
  -- Fenster messbar sind, ohne den Schlüssel zu parsen.
  freshness_window  text        not null,
  -- (4) Fälligkeit
  due_at            timestamptz not null default now(),
  -- (5) Priorität — KLEINER = WICHTIGER (wie `nice`). Default 100.
  priority          smallint    not null default 100,
  -- (6) Status
  status            text        not null default 'wartend',
  -- (7)(8) Zeitstempel
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- (9)(10) Versuche
  attempts          integer     not null default 0,
  max_attempts      integer     not null default 5,
  -- (11)(12) Lease
  lease_owner       text,
  lease_expires_at  timestamptz,
  -- (13) Letzter bereinigter Fehler (gekappt, siehe Trigger)
  last_error        text,
  -- (14) Abschlusszeitpunkt
  finished_at       timestamptz,
  -- (15) Sichere strukturierte Nutzdaten
  payload           jsonb       not null default '{}'::jsonb,
  -- Mandatsbezug NUR bei echt persönlicher Arbeit. Bei geteilter Arbeit
  -- ausdrücklich NULL — ein globaler Abruf gehört keinem Mandat (CLAUDE.md §4.2).
  tenant_id         text,
  -- Rückstandsmessung: wann wurde der Auftrag zum ersten Mal angefasst?
  first_claimed_at  timestamptz,
  constraint helmut_jobs_status_chk
    check (status in ('wartend', 'laeuft', 'erledigt', 'fehlgeschlagen')),
  constraint helmut_jobs_type_chk
    check (job_type in ('source_fetch', 'document_understanding',
                        'mandate_projection', 'briefing_materialization')),
  constraint helmut_jobs_attempts_chk
    check (attempts >= 0 and max_attempts >= 1 and max_attempts <= 50),
  constraint helmut_jobs_priority_chk
    check (priority between 0 and 1000),
  -- Ein laufender Auftrag hat IMMER einen Halter und ein Lease-Ende. Ohne diese
  -- Zusage wäre ein `laeuft` ohne Ablauf ein Auftrag, den niemand je wieder
  -- aufnimmt — genau der stille Verlust, den diese Struktur ausschließen soll.
  constraint helmut_jobs_lease_chk
    check (status <> 'laeuft' or (lease_owner is not null and lease_expires_at is not null))
);

-- (3) Idempotenz — der zentrale Riegel gegen Doppelplanung.
create unique index if not exists helmut_jobs_idem_uidx
  on public.helmut_jobs (idempotency_key);

-- Claim-Index: exakt die Sortierung der Claim-Abfrage (Priorität, dann
-- Fälligkeit, dann Erstellzeit). Ohne ihn wird der Claim bei 1000 Profilen ein
-- Full Scan.
create index if not exists helmut_jobs_claim_idx
  on public.helmut_jobs (priority, due_at, created_at)
  where status = 'wartend';

-- Wiederaufnahme abgelaufener Leases.
create index if not exists helmut_jobs_lease_idx
  on public.helmut_jobs (lease_expires_at)
  where status = 'laeuft';

-- Betriebsmessung nach Typ/Status.
create index if not exists helmut_jobs_status_idx
  on public.helmut_jobs (status, job_type);

-- Rückstand je Mandat (überfällige Mandate, maximales Mandatsalter).
create index if not exists helmut_jobs_tenant_idx
  on public.helmut_jobs (tenant_id, status)
  where tenant_id is not null;

-- Aufräumen je Fenster.
create index if not exists helmut_jobs_window_idx
  on public.helmut_jobs (freshness_window, status);

comment on table public.helmut_jobs is
  'Dauerhafte Arbeitswarteschlange des skalierbaren Pfads (OP-30). Rein serverseitig (service_role); RLS an, keine Policy. Idempotenz ueber idempotency_key inkl. Aktualitaetsfenster.';
comment on column public.helmut_jobs.priority is 'Kleiner = wichtiger. Default 100.';
comment on column public.helmut_jobs.tenant_id is 'NUR bei echt persoenlicher Arbeit gesetzt; bei geteilter Arbeit ausdruecklich NULL (CLAUDE.md 4.2).';
comment on column public.helmut_jobs.idempotency_key is 'Deterministisch aus Aufgabentyp + normalisierter Suchdefinition + Quellenkontext + Aktualitaetsfenster. Global eindeutig.';

-- ── 2) Kappungs-Trigger: keine Rohantworten, keine unbegrenzten Fehlertexte ──
-- Die App bereinigt bereits (jobqueue.bereinigeFehler). Dieser Trigger ist die
-- zweite Linie: er kappt hart und macht damit unmoeglich, dass ein
-- versehentlich durchgereichter Fremdtext (Providerantwort, Stacktrace mit
-- Token) in voller Laenge dauerhaft liegen bleibt.
create or replace function public.helmut_jobs_kappen()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.last_error is not null and length(new.last_error) > 500 then
    new.last_error := left(new.last_error, 500);
  end if;
  if new.payload is not null and length(new.payload::text) > 20000 then
    -- Ein zu grosser Payload ist ein Programmierfehler, kein Datenfall:
    -- ehrlich abbrechen statt still kuerzen (ein halber Payload waere Datenmuell).
    raise exception 'helmut_jobs: payload zu gross (% Zeichen, max 20000) fuer job_type %',
      length(new.payload::text), new.job_type;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.helmut_jobs_kappen() from public, anon, authenticated;

drop trigger if exists helmut_jobs_kappen_trg on public.helmut_jobs;
create trigger helmut_jobs_kappen_trg
  before insert or update on public.helmut_jobs
  for each row execute function public.helmut_jobs_kappen();

-- ── 3) Einreihen (idempotent) ───────────────────────────────────────────────
-- Gibt zurueck, ob der Auftrag NEU angelegt wurde. Ein bereits vorhandener
-- Schluessel ist KEIN Fehler, sondern der Normalfall bei wiederholter Planung.
-- `due_at` eines bestehenden Auftrags wird NICHT nach hinten geschoben — sonst
-- koennte wiederholtes Planen einen faelligen Auftrag dauerhaft verzoegern.
create or replace function public.helmut_enqueue_job(
  p_job_type        text,
  p_idempotency_key text,
  p_freshness_window text,
  p_payload         jsonb,
  p_due_at          timestamptz default now(),
  p_priority        smallint    default 100,
  p_max_attempts    integer     default 5,
  p_tenant_id       text        default null
)
returns table(id uuid, neu boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_neu boolean := false;
begin
  insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, due_at, priority, max_attempts, tenant_id)
  values
    (p_job_type, p_idempotency_key, p_freshness_window, coalesce(p_payload, '{}'::jsonb),
     coalesce(p_due_at, now()), coalesce(p_priority, 100::smallint),
     coalesce(p_max_attempts, 5), p_tenant_id)
  on conflict (idempotency_key) do nothing
  returning helmut_jobs.id into v_id;

  if v_id is not null then
    v_neu := true;
  else
    select j.id into v_id from public.helmut_jobs j where j.idempotency_key = p_idempotency_key;
  end if;

  return query select v_id, v_neu;
end;
$$;

comment on function public.helmut_enqueue_job(text, text, text, jsonb, timestamptz, smallint, integer, text) is
  'Idempotentes Einreihen. neu=false bedeutet: Auftrag existierte bereits (kein Fehler). Verschiebt due_at eines Bestandsauftrags NICHT.';

-- ── 4) Reservieren (der Kern) ───────────────────────────────────────────────
-- ATOMAR ueber `for update skip locked`: zwei gleichzeitige Worker sehen
-- disjunkte Mengen, ohne einander zu blockieren. Das ist der gesamte
-- Parallelitaetsvertrag — es gibt keinen zusaetzlichen Anwendungs-Lock.
--
-- Drei Dinge passieren in EINER Transaktion, und die Reihenfolge ist wichtig:
--   a) erschoepfte Auftraege werden ENDGUELTIG fehlgeschlagen (sie duerfen gar
--      nicht erst ausgegeben werden),
--   b) abgelaufene Leases werden mitgenommen (Wiederaufnahme nach Absturz —
--      kein separater Reaper noetig, der selbst ausfallen koennte),
--   c) der Rest wird nach Prioritaet/Faelligkeit reserviert.
--
-- FAIRNESS: die Sortierung ist (priority, due_at, created_at). Weil der
-- Compiler die Faelligkeiten deterministisch ueber den Tag streut, ist
-- `due_at` bereits die faire Reihenfolge — wer am laengsten wartet, kommt
-- zuerst. Es braucht keine zweite Fairnessbuchfuehrung.
create or replace function public.helmut_claim_jobs(
  p_owner    text,
  p_limit    integer,
  p_lease_ms bigint,
  p_types    text[] default null
)
returns setof public.helmut_jobs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now   timestamptz := now();
  v_lease interval    := (greatest(p_lease_ms, 1000) * interval '1 millisecond');
begin
  if p_owner is null or length(trim(p_owner)) = 0 then
    raise exception 'helmut_claim_jobs: p_owner ist Pflicht (Lease-Besitzer)';
  end if;

  -- (a) ABGELAUFENE LEASES ZURUECK IN DIE WARTESCHLANGE.
  --     Warum als eigener Schritt und nicht als `or`-Zweig der Reservierung: eine Bedingung
  --     `status='wartend' or status='laeuft'` macht den partiellen Claim-Index unbrauchbar.
  --     GEMESSEN an 5 000 Zeilen (PostgreSQL 16.13, `explain analyze`): die frueher hier
  --     stehende Oder-Abfrage lief als **Seq Scan** ueber alle Zeilen. Bei 1 000 Mandaten
  --     traegt die Tabelle mit 14 Tagen Aufbewahrung rund 66 000 Zeilen, und der Claim laeuft
  --     mehrfach je Lauf — der Index MUSS greifen. Nach dieser Umstellung liest die
  --     Reservierung nur noch `status='wartend'` und benutzt `helmut_jobs_claim_idx`.
  --     Dieser Schritt selbst ist ueber `helmut_jobs_lease_idx` indiziert.
  --     Die Fachlogik ist unveraendert: ein Auftrag mit abgelaufener Lease wird wieder
  --     vergeben, und der naechste Claim erhoeht `attempts` wie zuvor.
  update public.helmut_jobs j
     set status = 'wartend',
         lease_owner = null,
         lease_expires_at = null
   where j.status = 'laeuft'
     and j.lease_expires_at < v_now;

  -- (b) Erschoepft = endgueltig fehlgeschlagen, VOR der Ausgabe. Nach Schritt (a) sind alle
  --     betroffenen Auftraege `wartend`, die Bedingung braucht deshalb keinen Oder-Zweig mehr.
  update public.helmut_jobs j
     set status      = 'fehlgeschlagen',
         finished_at = v_now,
         lease_owner = null,
         lease_expires_at = null,
         last_error  = coalesce(j.last_error, 'versuche-erschoepft')
   where j.status = 'wartend'
     and j.attempts >= j.max_attempts;

  -- (c) Reservieren — jetzt indexgestuetzt.
  return query
  with kandidaten as (
    select j.id
      from public.helmut_jobs j
     where j.status = 'wartend'
       and j.due_at <= v_now
       and j.attempts < j.max_attempts
       and (p_types is null or j.job_type = any(p_types))
     order by j.priority asc, j.due_at asc, j.created_at asc
     for update skip locked
     limit greatest(coalesce(p_limit, 1), 0)
  )
  update public.helmut_jobs j
     set status           = 'laeuft',
         lease_owner      = p_owner,
         lease_expires_at = v_now + v_lease,
         attempts         = j.attempts + 1,
         first_claimed_at = coalesce(j.first_claimed_at, v_now)
    from kandidaten k
   where j.id = k.id
  returning j.*;
end;
$$;

comment on function public.helmut_claim_jobs(text, integer, bigint, text[]) is
  'Atomare Reservierung ueber for update skip locked. Nimmt abgelaufene Leases mit (Wiederaufnahme nach Absturz) und faellt erschoepfte Auftraege vorher endgueltig fehl. Erhoeht attempts.';

-- ── 5) Lease verlaengern ────────────────────────────────────────────────────
-- NUR der Halter. Ein Zombie-Worker, dessen Lease bereits uebernommen wurde,
-- kann sie nicht zurueckholen (owner passt dann nicht mehr).
create or replace function public.helmut_extend_job_lease(
  p_id uuid, p_owner text, p_lease_ms bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.helmut_jobs
     set lease_expires_at = now() + (greatest(p_lease_ms, 1000) * interval '1 millisecond')
   where id = p_id and lease_owner = p_owner and status = 'laeuft';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_extend_job_lease(uuid, text, bigint) is
  'Verlaengert die Lease — nur der eingetragene Halter. false = Lease verloren (anderer Worker hat uebernommen).';

-- ── 6) Abschliessen ─────────────────────────────────────────────────────────
-- TOKEN-GEBUNDEN wie der Pipeline-Lock: nur der Halter darf abschliessen.
-- Damit ist Doppelabschluss strukturell ausgeschlossen — ein zweiter Aufruf
-- findet keine Zeile mehr mit diesem Halter im Status `laeuft` und liefert
-- false. Der Aufrufer erfaehrt das ehrlich und behauptet keinen Erfolg
-- (CLAUDE.md §4.10).
create or replace function public.helmut_finish_job(
  p_id              uuid,
  p_owner           text,
  p_ok              boolean,
  p_error           text   default null,
  p_retry_delay_ms  bigint default 0
)
returns table(uebernommen boolean, neuer_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_attempts integer;
  v_max      integer;
  v_status   text;
  v_rows     integer;
begin
  select j.attempts, j.max_attempts into v_attempts, v_max
    from public.helmut_jobs j
   where j.id = p_id and j.lease_owner = p_owner and j.status = 'laeuft'
   for update;

  if not found then
    -- Lease verloren oder schon abgeschlossen.
    -- `return query` FUEHRT DIE FUNKTION FORT — ohne das folgende `return;` liefe der
    -- Rumpf weiter und haenge am Ende eine ZWEITE Zeile an. Der Aufrufer saehe dann
    -- zwei widerspruechliche Antworten auf eine Frage (belegt: Abschnitt 6 der Suite
    -- jobqueue-datenbank-test.js meldete `f` UND `t`). Deshalb hier hart beenden.
    return query select false, null::text;
    return;
  end if;

  if p_ok then
    v_status := 'erledigt';
    update public.helmut_jobs
       set status = 'erledigt', finished_at = v_now,
           lease_owner = null, lease_expires_at = null, last_error = null
     where id = p_id;
  elsif v_attempts >= v_max then
    v_status := 'fehlgeschlagen';
    update public.helmut_jobs
       set status = 'fehlgeschlagen', finished_at = v_now,
           lease_owner = null, lease_expires_at = null, last_error = p_error
     where id = p_id;
  else
    v_status := 'wartend';
    update public.helmut_jobs
       set status = 'wartend',
           due_at = v_now + (greatest(coalesce(p_retry_delay_ms, 0), 0) * interval '1 millisecond'),
           lease_owner = null, lease_expires_at = null, last_error = p_error
     where id = p_id;
  end if;

  get diagnostics v_rows = row_count;
  return query select v_rows > 0, v_status;
end;
$$;

comment on function public.helmut_finish_job(uuid, text, boolean, text, bigint) is
  'Schliesst einen Auftrag ab — NUR der Lease-Halter. uebernommen=false bedeutet Lease verloren oder bereits abgeschlossen (kein Doppelabschluss).';

-- ── 7) Betriebsmessung ──────────────────────────────────────────────────────
-- Eine Zeile mit allen geforderten Kennzahlen. Rein lesend, keine Nutzdaten,
-- keine Mandatsinhalte — nur Zaehler und Zeitspannen.
create or replace function public.helmut_job_metrics(p_seit_minuten integer default 1440)
returns table(
  wartend                bigint,
  laufend                bigint,
  erledigt_im_zeitraum   bigint,
  fehlgeschlagen_gesamt  bigint,
  endgueltig_fehler      bigint,
  wiederholungen         bigint,
  aktive_leases          bigint,
  aeltester_faelliger_s  numeric,
  durchsatz_pro_stunde   numeric,
  mittlere_dauer_s       numeric,
  nach_typ               jsonb,
  nach_status            jsonb,
  ueberfaellige_mandate  bigint,
  max_mandatsalter_s     numeric
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with fenster as (select now() - (greatest(coalesce(p_seit_minuten, 1440), 1) * interval '1 minute') as ab),
  basis as (select * from public.helmut_jobs)
  select
    (select count(*) from basis where status = 'wartend'),
    (select count(*) from basis where status = 'laeuft'),
    (select count(*) from basis, fenster where status = 'erledigt' and finished_at >= fenster.ab),
    (select count(*) from basis where status = 'fehlgeschlagen'),
    (select count(*) from basis where status = 'fehlgeschlagen' and attempts >= max_attempts),
    (select coalesce(sum(greatest(attempts - 1, 0)), 0) from basis),
    (select count(*) from basis where status = 'laeuft' and lease_expires_at > now()),
    (select coalesce(max(extract(epoch from (now() - due_at))), 0)
       from basis where status = 'wartend' and due_at <= now()),
    (select round(count(*)::numeric
                  / greatest(extract(epoch from (now() - fenster.ab)) / 3600.0, 0.0001), 2)
       from basis, fenster where status = 'erledigt' and finished_at >= fenster.ab
       group by fenster.ab),
    (select round(avg(extract(epoch from (finished_at - first_claimed_at)))::numeric, 3)
       from basis where status = 'erledigt' and finished_at is not null and first_claimed_at is not null),
    (select coalesce(jsonb_object_agg(job_type, n), '{}'::jsonb)
       from (select job_type, count(*) as n from basis group by job_type) t),
    (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
       from (select status, count(*) as n from basis group by status) t),
    (select count(distinct tenant_id) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft')
        and due_at <= now() - interval '24 hours'),
    (select coalesce(max(extract(epoch from (now() - due_at))), 0) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft'));
$$;

comment on function public.helmut_job_metrics(integer) is
  'Betriebskennzahlen der Warteschlange (rein lesend, nur Zaehler/Zeitspannen, keine Nutzdaten).';

-- ── 8) Aufraeumen (NICHT geplant, nur bereitgestellt) ───────────────────────
-- Aufbewahrung ist eine Betreiberentscheidung (OP-12/OP-02). Diese Funktion
-- wird von KEINEM Cron aufgerufen; sie existiert, damit ein spaeteres
-- Aufraeumen nicht ad hoc als Freitext-SQL passieren muss.
create or replace function public.helmut_prune_jobs(p_aelter_als_tage integer default 14)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows bigint;
begin
  delete from public.helmut_jobs
   where status = 'erledigt'
     and finished_at < now() - (greatest(coalesce(p_aelter_als_tage, 14), 1) * interval '1 day');
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.helmut_prune_jobs(integer) is
  'Entfernt ERLEDIGTE Auftraege aelter als N Tage. Fehlgeschlagene bleiben immer stehen (Auditierbarkeit). Wird von keinem Cron aufgerufen.';

-- ── 9) Zugriff: ausschliesslich serverseitig ────────────────────────────────
-- RLS an UND alle Rechte entzogen UND keine Policy: selbst wenn eine spaetere
-- Migration versehentlich `grant select to authenticated` ergaenzt, gaebe es
-- ohne Policy immer noch keine sichtbare Zeile. Zwei unabhaengige Riegel.
alter table public.helmut_jobs enable row level security;
alter table public.helmut_jobs force row level security;
revoke all on table public.helmut_jobs from public, anon, authenticated;

revoke all on function public.helmut_enqueue_job(text, text, text, jsonb, timestamptz, smallint, integer, text) from public, anon, authenticated;
revoke all on function public.helmut_claim_jobs(text, integer, bigint, text[])                                   from public, anon, authenticated;
revoke all on function public.helmut_extend_job_lease(uuid, text, bigint)                                        from public, anon, authenticated;
revoke all on function public.helmut_finish_job(uuid, text, boolean, text, bigint)                               from public, anon, authenticated;
revoke all on function public.helmut_job_metrics(integer)                                                        from public, anon, authenticated;
revoke all on function public.helmut_prune_jobs(integer)                                                         from public, anon, authenticated;

-- service_role existiert in Supabase, aber nicht zwingend in einer lokalen
-- Testdatenbank — deshalb bedingt (wie in 20260728_matching_audit.sql).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.helmut_jobs to service_role';
    execute 'grant execute on function public.helmut_enqueue_job(text, text, text, jsonb, timestamptz, smallint, integer, text) to service_role';
    execute 'grant execute on function public.helmut_claim_jobs(text, integer, bigint, text[]) to service_role';
    execute 'grant execute on function public.helmut_extend_job_lease(uuid, text, bigint) to service_role';
    execute 'grant execute on function public.helmut_finish_job(uuid, text, boolean, text, bigint) to service_role';
    execute 'grant execute on function public.helmut_job_metrics(integer) to service_role';
    execute 'grant execute on function public.helmut_prune_jobs(integer) to service_role';
  end if;
end $$;

commit;

-- ── Verifikation nach der Anwendung (rein lesend) ───────────────────────────
-- Erwartet: 1 (Tabelle), 6 (Funktionen), t/t (RLS an + forced), 0 (Policies)
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='helmut_jobs';
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--      ('helmut_enqueue_job','helmut_claim_jobs','helmut_extend_job_lease',
--       'helmut_finish_job','helmut_job_metrics','helmut_prune_jobs');
--   select relrowsecurity, relforcerowsecurity from pg_class
--    where oid='public.helmut_jobs'::regclass;
--   select count(*) from pg_policies where schemaname='public' and tablename='helmut_jobs';
-- Erwartet: 0 Rechte fuer anon/authenticated
--   select count(*) from information_schema.role_table_grants
--    where table_name='helmut_jobs' and grantee in ('anon','authenticated','PUBLIC');
-- Erwartet: alle 6 Funktionen mit fixem search_path
--   select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname like 'helmut_%job%';
