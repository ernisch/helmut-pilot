-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- OP-30 HAERTUNGSSPRINT 2026-08-14 — VERWALTETER QUEUE-VERBRAUCHER + OUTBOX-LEBENSZYKLUS
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Diese Migration schliesst die im Haertungssprint BESTAETIGTEN Befunde 1, 4g und 6 und legt
-- die Datenbankseite des verwalteten Transports (Amazon SQS + Lambda) an.
--
-- WAS SIE HINZUFUEGT:
--   1. helmut_claim_job_by_id  — atomare Beanspruchung GENAU des signalisierten Auftrags.
--      Bisher gab es nur helmut_claim_jobs (waehlt selbst nach Prioritaet). Ein
--      Queue-Verbraucher, der ein Wecksignal fuer Auftrag X erhaelt, darf NIE irgendeinen
--      anderen Auftrag ziehen — sonst haengt die Nachricht an Arbeit, die sie nicht meint,
--      und mehrfache Zustellung wird zu doppelter Arbeit.
--   2. helmut_outbox_zuruecklegen — VERTAGUNG OHNE FEHLVERSUCH (Befund 1).
--      Ein Weckruf, dessen Ausgang UNBEKANNT ist (Timeout nach dem Absenden) oder der
--      nachweislich KEINEN Verbraucher gefunden hat (Drain belegt), darf weder bestaetigt
--      (dann wartet der Auftrag bis zum Abgleich) noch als Fehlversuch verbucht werden
--      (dann verbrennt er Versuche bis zur Quarantaene). Er wird zurueckgelegt: Status
--      zurueck auf `offen`, Versuchszaehler auf den Stand VOR der Vergabe. Das ist exakt
--      das Muster von helmut_defer_job ("Warten ist kein Fehler").
--   3. helmut_outbox_abgleich (ERSETZT) — Befund 6: der Terminalzweig deckte den Zustand
--      `bestaetigt` NICHT ab. Eine bestaetigte Absicht, deren Auftrag danach erledigt oder
--      endgueltig fehlgeschlagen ist, blieb dauerhaft `bestaetigt` liegen — die Tabelle
--      waechst unbegrenzt (bei 500 Mandaten ~4.300 Zeilen/Tag).
--   4. helmut_outbox_aufraeumen — begrenzter, sicherer AUFBEWAHRUNGSVERTRAG fuer terminale
--      Zeilen. KEIN automatischer Aufrufer, KEINE Production-Bereinigung in diesem Sprint.
--   5. helmut_klasse_erneuere — ERNEUERBARE Lease fuer die Klassen-Semaphore (Befund 4g).
--      Ein festes TTL ohne Erneuerung ist unsicher, sobald der externe Aufruf laenger
--      laufen kann als das TTL: der Slot faellt frei, ein zweiter Aufruf startet, der erste
--      arbeitet weiter — die Grenze ist dann nur noch behauptet.
--
-- SICHERHEIT: RLS bleibt fuer helmut_job_outbox aktiv+erzwungen (unveraendert). Alle neuen
-- Funktionen sind security invoker mit festem search_path; anon/authenticated erhalten
-- nichts, service_role genau die Ausfuehrung.
--
-- Rollback: rollback_20260814090000_queue_verbraucher.sql (gleiches Verzeichnis).
-- Voraussetzung: 20260808_scalable_job_queue.sql, 20260813090000_jobqueue_outbox.sql,
--                20260813090100_verteilte_grenzen.sql.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ALLES ODER NICHTS (2026-08-15, Vorpruefung nach PR #248): ohne diese Klammer laeuft die
-- Datei anweisungsweise mit Selbstbestaetigung. Bricht sie in der Mitte ab — fehlende
-- Voraussetzung, Sperrzeitueberschreitung (`lock_timeout`), Verbindungsabbruch —, bleibt ein
-- TEILSTAND zurueck: empirisch belegt blieb `helmut_claim_job_by_id` allein stehen, waehrend
-- alles danach fehlte. Ein halb angewendeter Migrationsschritt ist genau das falsche Gruen,
-- das CLAUDE.md §4 Regel 4/10 verbietet, und er macht den Rueckweg mehrdeutig. Alle uebrigen
-- Migrationen dieses Repos tragen diese Klammer bereits; hier fehlte sie.
begin;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 1 · ATOMARE BEANSPRUCHUNG GENAU EINES AUFTRAGS (Wecksignal -> genau dieser Auftrag)
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Rueckgabe ist bewusst SPRECHEND statt leer: der Verbraucher muss unterscheiden koennen
-- zwischen "gehoert mir jetzt" (arbeiten), "schon terminal" (Nachricht loeschen, KEINE
-- Arbeit — das ist der Idempotenzfall bei mehrfacher Zustellung), "belegt/nicht faellig"
-- (Nachricht spaeter erneut zustellen lassen) und "unbekannt" (Nachricht loeschen, es gibt
-- nichts mehr zu tun). Ein stiller Leerlauf waere in allen vier Faellen dieselbe Antwort —
-- und der Verbraucher muesste raten.
create or replace function public.helmut_claim_job_by_id(
  p_job_id    uuid,
  p_owner     text,
  p_lease_ms  bigint default 300000
)
returns table(
  uebernommen  boolean,
  grund        text,
  id           uuid,
  job_type     text,
  tenant_id    text,
  payload      jsonb,
  attempts     integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lease interval := (greatest(coalesce(p_lease_ms, 300000), 1000) || ' milliseconds')::interval;
  v_zeile public.helmut_jobs%rowtype;
begin
  if p_job_id is null or p_owner is null or length(btrim(p_owner)) = 0 then
    return query select false, 'ungueltige-parameter'::text, null::uuid, null::text, null::text,
                        null::jsonb, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  -- SKIP LOCKED: laeuft bereits ein anderer Verbraucher auf genau dieser Zeile, wird NICHT
  -- gewartet (eine Lambda-Invocation darf nie an einer Zeilensperre haengen) — die Nachricht
  -- kommt nach der Sichtbarkeitszeit von selbst wieder.
  select * into v_zeile
    from public.helmut_jobs j
   where j.id = p_job_id
   for update skip locked;

  if not found then
    -- Entweder unbekannt oder gerade von jemand anderem gesperrt. Beides bedeutet:
    -- dieser Verbraucher arbeitet jetzt nicht — die Unterscheidung liefert der Nachschlag.
    if exists (select 1 from public.helmut_jobs j where j.id = p_job_id) then
      return query select false, 'gesperrt'::text, p_job_id, null::text, null::text,
                          null::jsonb, null::integer, null::integer, null::timestamptz;
    else
      return query select false, 'unbekannt'::text, p_job_id, null::text, null::text,
                          null::jsonb, null::integer, null::integer, null::timestamptz;
    end if;
    return;
  end if;

  -- IDEMPOTENZ BEI MEHRFACHER ZUSTELLUNG: ein terminaler Auftrag wird NIE erneut bearbeitet.
  if v_zeile.status in ('erledigt', 'fehlgeschlagen') then
    return query select false, ('bereits-' || v_zeile.status)::text, v_zeile.id, v_zeile.job_type,
                        v_zeile.tenant_id, null::jsonb, v_zeile.attempts, v_zeile.max_attempts,
                        v_zeile.lease_expires_at;
    return;
  end if;

  -- Ein LAUFENDER Auftrag mit gueltiger Lease gehoert einem anderen Verbraucher.
  if v_zeile.status = 'laeuft'
     and v_zeile.lease_expires_at is not null
     and v_zeile.lease_expires_at > now() then
    return query select false, 'lease-fremd'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                        null::jsonb, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
    return;
  end if;

  -- Noch nicht faellig: der Weckruf war zu frueh (Fälligkeitskopplung der Outbox verhindert
  -- das im Normalfall). Nicht arbeiten, nicht verbrauchen.
  if v_zeile.status = 'wartend' and v_zeile.due_at > now() then
    return query select false, 'nicht-faellig'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                        null::jsonb, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
    return;
  end if;

  -- Uebernahme: identische Buchfuehrung wie helmut_claim_jobs (Versuch zaehlt, Lease setzen).
  update public.helmut_jobs j
     set status           = 'laeuft',
         lease_owner      = p_owner,
         lease_expires_at = now() + v_lease,
         attempts         = j.attempts + 1,
         first_claimed_at = coalesce(j.first_claimed_at, now())
   where j.id = v_zeile.id
   returning * into v_zeile;

  return query select true, 'uebernommen'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                      v_zeile.payload, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
end;
$$;

comment on function public.helmut_claim_job_by_id(uuid, text, bigint) is
  'OP-30: beansprucht ATOMAR genau den signalisierten Auftrag (nie einen anderen). Sprechende Gruende: uebernommen | bereits-erledigt | bereits-fehlgeschlagen | lease-fremd | nicht-faellig | gesperrt | unbekannt.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 2 · VERSANDABSICHT ZURUECKLEGEN — Vertagung ohne Fehlversuch (Befund 1)
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.helmut_outbox_zuruecklegen(
  p_outbox_id       uuid,
  p_warte_sekunden  integer default 60
)
returns table(uebernommen boolean, grund text, attempts integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_warte interval := (greatest(coalesce(p_warte_sekunden, 60), 0) || ' seconds')::interval;
  v_zeile public.helmut_job_outbox%rowtype;
begin
  select * into v_zeile
    from public.helmut_job_outbox o
   where o.id = p_outbox_id
   for update;

  if not found then
    return query select false, 'unbekannt'::text, null::integer;
    return;
  end if;

  -- Nur eine VERGEBENE Absicht kann zurueckgelegt werden. Eine bereits bestaetigte oder
  -- terminale Absicht wird nie wieder geoeffnet (dafuer gibt es allein den Abgleich).
  if v_zeile.status <> 'versendet' then
    return query select false, ('status-' || v_zeile.status)::text, v_zeile.attempts;
    return;
  end if;

  -- WARTEN IST KEIN FEHLER: der bei der Vergabe gezogene Versuch wird zurueckgegeben.
  update public.helmut_job_outbox o
     set status          = 'offen',
         attempts        = greatest(o.attempts - 1, 0),
         next_attempt_at = now() + v_warte,
         last_error      = null,
         updated_at      = now()
   where o.id = v_zeile.id
   returning * into v_zeile;

  return query select true, 'zurueckgelegt'::text, v_zeile.attempts;
end;
$$;

comment on function public.helmut_outbox_zuruecklegen(uuid, integer) is
  'OP-30: legt eine vergebene Versandabsicht zurueck, OHNE einen Fehlversuch zu verbuchen (unbekannter Ausgang oder nachweislich kein Verbraucher). Muster von helmut_defer_job.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 3 · ABGLEICH (ERSETZT) — Befund 6: `bestaetigt` im Terminalzweig ergaenzt
-- ───────────────────────────────────────────────────────────────────────────────────────────
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
  -- (c) Absichten TERMINALER Auftraege schliessen.
  --     HAERTUNG 2026-08-14 (Befund 6): der Zustand `bestaetigt` fehlte hier. Eine Absicht,
  --     deren Weckruf zugestellt WURDE und deren Auftrag danach fertig wurde, blieb dauerhaft
  --     `bestaetigt` — sie erreichte nie einen terminalen Zustand und wurde nie
  --     aufbewahrungsfaehig. Jetzt ist `verzichtet` fuer JEDE Absicht eines terminalen
  --     Auftrags der Endzustand (die Bedeutung stimmt: der Versand hat keinen Zweck mehr).
  update public.helmut_job_outbox o
     set status = 'verzichtet', updated_at = now()
    from public.helmut_jobs j
   where j.id = o.job_id
     and j.status in ('erledigt', 'fehlgeschlagen')
     and o.status in ('offen', 'versendet', 'aufgegeben', 'bestaetigt');
  get diagnostics v_verzichtet = row_count;

  -- (a) Ausfuehrbare Auftraege OHNE Versandabsicht: Absicht anlegen.
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

  -- (b) Bestaetigte oder aufgegebene Absichten, deren Auftrag TROTZDEM seit
  --     p_mindestalter_minuten ausfuehrbar wartet: das Wecksignal hat keinen Verbraucher
  --     erreicht -> wieder oeffnen. Versuchszaehler beginnt neu (neue Zustellrunde).
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
     set status = 'offen', attempts = 0, next_attempt_at = v_now, last_error = null,
         updated_at = now()
    from verwaiste v
   where o.id = v.id;
  get diagnostics v_wieder = row_count;

  return query select v_fehlend, v_wieder, v_verzichtet;
end;
$$;

comment on function public.helmut_outbox_abgleich(integer, integer) is
  'OP-30 Sicherheitsnetz: (a) fehlende Absichten anlegen, (b) verwaiste Absichten wieder oeffnen, (c) Absichten terminaler Auftraege schliessen (seit 2026-08-14 inkl. Zustand bestaetigt).';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 4 · AUFBEWAHRUNGSVERTRAG (begrenzt, sicher, OHNE automatischen Aufrufer)
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- BEWUSSTE GRENZE: diese Funktion wird von KEINEM Cron und KEINER Route aufgerufen. Sie
-- existiert, damit der Aufbewahrungsvertrag pruefbar und ausfuehrbar IST, wenn der Betreiber
-- ihn scharf schaltet (dieselbe Trennung wie HELMUT_RETENTION_EXECUTE).
--   * Geloescht werden ausschliesslich TERMINALE Zeilen (verzichtet | aufgegeben).
--   * Nie eine Zeile, deren Auftrag noch aussteht — der Join gegen helmut_jobs erzwingt das.
--   * Immer gedeckelt (p_limit), damit ein Lauf niemals eine unbegrenzte Sperre haelt.
--   * helmut_jobs wird NICHT angefasst.
create or replace function public.helmut_outbox_aufraeumen(
  p_alter_tage integer default 30,
  p_limit      integer default 1000,
  p_trockenlauf boolean default true
)
returns table(kandidaten bigint, geloescht bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_grenze timestamptz := now() - (greatest(coalesce(p_alter_tage, 30), 1) || ' days')::interval;
  v_limit  integer := greatest(coalesce(p_limit, 1000), 1);
  v_kand   bigint := 0;
  v_del    bigint := 0;
begin
  select count(*) into v_kand
    from public.helmut_job_outbox o
   where o.status in ('verzichtet', 'aufgegeben')
     and o.updated_at <= v_grenze;

  if coalesce(p_trockenlauf, true) then
    return query select v_kand, 0::bigint;
    return;
  end if;

  with kandidaten as (
    select o.id
      from public.helmut_job_outbox o
      join public.helmut_jobs j on j.id = o.job_id
     where o.status in ('verzichtet', 'aufgegeben')
       and o.updated_at <= v_grenze
       and j.status in ('erledigt', 'fehlgeschlagen')
     order by o.updated_at asc
     limit v_limit
     for update of o skip locked
  )
  delete from public.helmut_job_outbox o
   using kandidaten k
   where o.id = k.id;
  get diagnostics v_del = row_count;

  return query select v_kand, v_del;
end;
$$;

comment on function public.helmut_outbox_aufraeumen(integer, integer, boolean) is
  'OP-30 Aufbewahrungsvertrag: loescht NUR terminale Outbox-Zeilen (verzichtet|aufgegeben) aelter als N Tage, deren Auftrag ebenfalls terminal ist. Default Trockenlauf. KEIN automatischer Aufrufer.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 5 · ERNEUERBARE KLASSEN-LEASE (Befund 4g)
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Ein festes TTL ist nur dann eine echte Grenze, wenn die Arbeit garantiert kuerzer ist.
-- Externe Anbieteraufrufe sind das nicht. Wer laenger arbeitet, muss seinen Slot erneuern —
-- gelingt die Erneuerung nicht (Slot abgelaufen und geraeumt), weiss der Aufrufer es und
-- kann die laufende Anfrage abbrechen, statt ausserhalb der Grenze weiterzuarbeiten.
create or replace function public.helmut_klasse_erneuere(
  p_slot   uuid,
  p_owner  text,
  p_ttl_ms bigint default 60000
)
returns table(erneuert boolean, grund text, belegt_bis timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ttl interval := (greatest(coalesce(p_ttl_ms, 60000), 1000) || ' milliseconds')::interval;
  v_zeile public.helmut_klassen_slots%rowtype;
begin
  update public.helmut_klassen_slots s
     set belegt_bis = now() + v_ttl
   where s.id = p_slot
     and s.owner = p_owner
     and s.belegt_bis >= now()          -- ein bereits abgelaufener Slot wird NIE wiederbelebt
   returning * into v_zeile;

  if not found then
    return query select false, 'nicht-mehr-gueltig'::text, null::timestamptz;
    return;
  end if;
  return query select true, 'erneuert'::text, v_zeile.belegt_bis;
end;
$$;

comment on function public.helmut_klasse_erneuere(uuid, text, bigint) is
  'OP-30: verlaengert einen GUELTIGEN, haltereigenen Klassen-Slot. Ein abgelaufener Slot wird nie wiederbelebt — der Aufrufer erfaehrt den Verlust und bricht ab.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 6 · WIEDERVORLAGE NACH WIEDERHOLUNG UND ZURUECKSTELLUNG (Korrekturlauf 2026-08-14/3)
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- DER BEFUND (vom Ende-zu-Ende-Test aufgedeckt, nicht von den Vertragstests): ein Auftrag,
-- der wiederholt oder zurueckgestellt wird, kehrt nach `wartend` zurueck — seine Versand-
-- absicht ist zu diesem Zeitpunkt aber schon `bestaetigt`. Im Ereignis-Antrieb weckte ihn
-- danach NUR der Abgleich, und der wartet bewusst ein Mindestalter (Standard 10 Minuten) ab.
-- Ein Backoff von 30 Sekunden wurde damit faktisch zu 10 Minuten. Der Auftrag ging nie
-- verloren, aber der Relay trug die WIEDERHOLUNGEN nicht — er trug nur Erstzustellungen.
--
-- DIE KORREKTUR: wer einen Auftrag nach `wartend` zurueckschreibt, legt seine Versandabsicht
-- ausdruecklich erneut vor — faellig GENAU zur neuen Faelligkeit des Auftrags.
--   * Nur fuer Auftraege in `wartend` (ein terminaler Auftrag wird nie wieder geweckt).
--   * Kein Versandfehler wird verbucht: der Versuchszaehler beginnt neu (neue Zustellrunde).
--   * Fehlt die Absicht ganz (Altbestand), entsteht sie hier — sonst haenge der Auftrag
--     bis zum naechsten Abgleich.
--   * `sofort` sagt dem Aufrufer, ob ein unmittelbarer Relay-Anstoss ueberhaupt Sinn hat.
--     Ist die Absicht erst spaeter faellig, uebernimmt der Zeitgeber — ein Anstoss waere
--     ein Leeraufruf.
-- SICHERHEITSNETZ BLEIBT: geht diese Wiedervorlage verloren (Absturz zwischen Abschluss und
-- Aufruf), faengt der Abgleich den Auftrag wie bisher — der schlechteste Fall ist also
-- exakt das bisherige Verhalten, nie ein Verlust.
create or replace function public.helmut_outbox_erneut_vorlegen(
  p_job_id uuid
)
returns table(uebernommen boolean, grund text, faellig_ab timestamptz, sofort boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job    public.helmut_jobs%rowtype;
  v_zeile  public.helmut_job_outbox%rowtype;
  v_now    timestamptz := now();
  v_ziel   timestamptz;
begin
  select * into v_job from public.helmut_jobs j where j.id = p_job_id;
  if not found then
    return query select false, 'auftrag-unbekannt'::text, null::timestamptz, false;
    return;
  end if;

  -- Ein terminaler Auftrag wird NIE erneut vorgelegt (kein zweiter Fachlauf, kein zweiter
  -- KI-Aufruf). Auch `laeuft` ist kein Fall fuer die Wiedervorlage: der Halter arbeitet noch.
  if v_job.status <> 'wartend' then
    return query select false, ('status-' || v_job.status)::text, null::timestamptz, false;
    return;
  end if;

  v_ziel := greatest(coalesce(v_job.due_at, v_now), v_now);

  select * into v_zeile
    from public.helmut_job_outbox o
   where o.job_id = p_job_id
   for update;

  if not found then
    insert into public.helmut_job_outbox (job_id, schema_version, next_attempt_at)
    values (p_job_id, 1, v_ziel)
    on conflict (job_id) do nothing;
    return query select true, 'angelegt'::text, v_ziel, (v_ziel <= v_now);
    return;
  end if;

  -- Eine bereits OFFENE Absicht, die frueher oder gleich faellig ist, bleibt unangetastet:
  -- sie ist schon die Wiedervorlage. Nur nach hinten wird nie verschoben.
  if v_zeile.status = 'offen' and v_zeile.next_attempt_at <= v_ziel then
    return query select true, 'bereits-offen'::text, v_zeile.next_attempt_at,
                        (v_zeile.next_attempt_at <= v_now);
    return;
  end if;

  update public.helmut_job_outbox o
     set status          = 'offen',
         attempts        = 0,
         next_attempt_at = v_ziel,
         last_error      = null,
         updated_at      = v_now
   where o.id = v_zeile.id;

  return query select true, 'wiedervorgelegt'::text, v_ziel, (v_ziel <= v_now);
end;
$$;

comment on function public.helmut_outbox_erneut_vorlegen(uuid) is
  'OP-30: legt die Versandabsicht eines wieder wartenden Auftrags erneut vor (faellig zur neuen Auftragsfaelligkeit). Traegt Wiederholungen und Zurueckstellungen im Ereignis-Antrieb, ohne auf den Abgleich zu warten.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 7 · RECHTE (identisch zum Bestand: nichts fuer anon/authenticated, Ausfuehrung service_role)
-- ───────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.helmut_claim_job_by_id(uuid, text, bigint)          from public, anon, authenticated;
revoke all on function public.helmut_outbox_zuruecklegen(uuid, integer)           from public, anon, authenticated;
revoke all on function public.helmut_outbox_erneut_vorlegen(uuid)                 from public, anon, authenticated;
revoke all on function public.helmut_outbox_abgleich(integer, integer)            from public, anon, authenticated;
revoke all on function public.helmut_outbox_aufraeumen(integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.helmut_klasse_erneuere(uuid, text, bigint)          from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_claim_job_by_id(uuid, text, bigint) to service_role';
    execute 'grant execute on function public.helmut_outbox_zuruecklegen(uuid, integer) to service_role';
    execute 'grant execute on function public.helmut_outbox_erneut_vorlegen(uuid) to service_role';
    execute 'grant execute on function public.helmut_outbox_abgleich(integer, integer) to service_role';
    execute 'grant execute on function public.helmut_outbox_aufraeumen(integer, integer, boolean) to service_role';
    execute 'grant execute on function public.helmut_klasse_erneuere(uuid, text, bigint) to service_role';
  end if;
end $$;

commit;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- VERIFIKATION (nach dem Anwenden im SQL-Editor ausfuehren)
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- select proname, prosecdef, proconfig from pg_proc
--  where proname in ('helmut_claim_job_by_id','helmut_outbox_zuruecklegen',
--                    'helmut_outbox_abgleich','helmut_outbox_aufraeumen','helmut_klasse_erneuere',
--                    'helmut_outbox_erneut_vorlegen');
-- -> 6 Zeilen, prosecdef=false, proconfig={"search_path=public, pg_temp"}
