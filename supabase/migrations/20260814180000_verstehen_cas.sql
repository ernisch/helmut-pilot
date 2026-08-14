-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „OP-30 Verstehensparallelität und CAS", 2026-08-14) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Rollback: rollback_20260814180000_verstehen_cas.sql (gleiches Verzeichnis).
--     Voraussetzung: public.knowledge_objects muss existieren (Kernschema).
--                    Von 20260813090000/20260813090100 unabhängig anwendbar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DER ATOMARE VERSTEHENSVERTRAG (OP-30, Auftrag „Verstehensparallelität und CAS").
--
-- ANLASS (am Code belegt, docs/betrieb/op30-zielarchitektur-2026-08-13.md §22):
-- `lib/helmut/understanding.js` hielt die Vormerkungen gescheiterter
-- Aktualisierungen in EINER Karte im Auth-Store und schrieb sie mit
-- Lesen → Ändern → Schreiben zurück. Zwei gleichzeitige Verstehensläufe
-- überschreiben sich dabei gegenseitig; ein verlorener Eintrag ist ein Vorgang,
-- der nie wieder aufgenommen wird. Genau das verbietet CLAUDE.md §4 Regel 10.
-- Deshalb blieb die Arbeitsklasse `verstehen` auf Parallelität 1 — der letzte
-- globale Engpass der Zielarchitektur.
--
-- WAS DIESE MIGRATION HERSTELLT — vier Zusagen, alle datenbankseitig:
--
--   1. EIN BERECHTIGTER BESITZER JE VORGANG. `helmut_verstehen_reserviere`
--      belegt eine Zeile je Vorgang unter einem Row-Lock. Egal wie viele
--      Arbeiter gleichzeitig anfragen: genau einer bekommt `erlaubt = true`.
--      VERSCHIEDENE Vorgänge blockieren sich dabei NIE — die Serialisierung
--      liegt auf der Vorgangszeile, nicht auf einem globalen Schloss.
--
--   2. LEASE + MONOTONER FENCING-WERT. Jede Übernahme erhöht `fencing` um 1.
--      Der Wert wandert in `knowledge_objects.verstehen_fencing` und wird dort
--      von einem Trigger erzwungen: ein Arbeiter mit KLEINEREM Fencing-Wert
--      kann ein neueres Ergebnis NIE überschreiben — auch dann nicht, wenn er
--      beliebig lange zwischen Prüfung und Schreibvorgang stehen bleibt. Das
--      ist der Unterschied zwischen „geprüft" und „erzwungen".
--
--   3. AT-MOST-ONCE FÜR DEN EXTERNEN MODELLAUFRUF. `helmut_verstehen_modellstart`
--      schreibt VOR dem Aufruf `zustand = 'modell-laeuft'`. Stürzt der Arbeiter
--      danach ab, läuft sein Lease ab und der nächste Anlauf findet einen
--      Vorgang, dessen Ausgang NIEMAND kennt. Der wird dann NICHT automatisch
--      wiederholt (das wäre ein zweiter, bezahlter Modellaufruf), sondern
--      sichtbar auf `zustand = 'unbekannt'` gestellt und geschlossen blockiert.
--      AUSNAHME, und nur diese eine: liegt in `knowledge_objects` bereits ein
--      Ergebnis mit mindestens diesem Fencing-Wert, ist der Ausgang BELEGT
--      bekannt (der Absturz lag nach dem Speichern) — dann löst der Vertrag
--      selbst auf `fertig` auf, ohne KI, ohne Betreiber.
--
--   4. IDEMPOTENZ ÜBER DEN EINGABEHASH. Eine Reservierung derselben Eingabe zu
--      einem bereits fertigen Vorgang wird abgelehnt („bereits-fertig") — der
--      Aufrufer nutzt das vorhandene Ergebnis statt neu zu bezahlen.
--
-- WAS HIER BEWUSST NICHT LIEGT: das KI-Tagesbudget (llm_reservations,
-- 20260717/20260808), die Gleichzeitigkeit je Arbeitsklasse
-- (helmut_klassen_slots, 20260813090100) und die Auftragsverwaltung
-- (helmut_jobs). Dieser Vertrag regelt ausschließlich, WER einen Vorgang
-- verstehen darf und WESSEN Ergebnis gilt.
--
-- EHRLICHE GRENZE (Auftrag: „Unmöglichkeitsgrenze dokumentieren"): eine echte
-- Exactly-once-Zusage für einen EXTERNEN Aufruf ist ohne verteilte Transaktion
-- mit dem Anbieter unmöglich. Es gibt kein gemeinsames Commit. Diese Migration
-- wählt deshalb bewusst AT MOST ONCE plus einen sichtbaren, geschlossenen
-- Zustand für den unbekannten Ausgang — nie einen stillen zweiten Aufruf.
--
-- DSGVO: Vorgangskennung, Eingabe-/Ergebnishash, technische Halterkennung,
-- Zähler, Zeitstempel. KEINE Inhalte, keine Mandate, keine URLs, keine Namen.

begin;

-- ── 0) Vorbedingung ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_objects') is null then
    raise exception 'helmut_verstehen_cas: public.knowledge_objects fehlt — diese Migration setzt das Kernschema voraus';
  end if;
end $$;

-- ── 1) Reservierungen: eine Zeile je Vorgang ────────────────────────────────
create table if not exists public.helmut_verstehen_reservierungen (
  vorgang_id        text        primary key,
  eingabe_hash      text,
  besitzer          text,
  fencing           bigint      not null default 0,
  lease_bis         timestamptz,
  zustand           text        not null default 'offen',
  ergebnis_fencing  bigint,
  ergebnis_hash     text,
  versuche          integer     not null default 0,
  ki_aufrufe        integer     not null default 0,
  letzter_grund     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint helmut_verstehen_zustand_gueltig
    check (zustand in ('offen', 'reserviert', 'modell-laeuft', 'fertig', 'unbekannt', 'aufgegeben'))
);

create index if not exists helmut_verstehen_reservierungen_zustand_idx
  on public.helmut_verstehen_reservierungen (zustand, lease_bis);

comment on table public.helmut_verstehen_reservierungen is
  'OP-30 CAS: eine Zeile je Vorgang. Haelt Besitzer, Lease und den monotonen Fencing-Wert des Verstehens. zustand=unbekannt bedeutet: Ausgang eines Modellaufrufs unbekannt, geschlossen blockiert (kein automatischer zweiter Aufruf).';

comment on column public.helmut_verstehen_reservierungen.fencing is
  'Monoton steigend: jede Uebernahme erhoeht um 1. Wandert in knowledge_objects.verstehen_fencing und wird dort per Trigger erzwungen.';

-- ── 2) Vormerkungen: eine Zeile je Vorgang statt EINER Karte ────────────────
-- Loest die Karte `updateRetries` im Auth-Store ab. Erhoeht wird ATOMAR
-- (insert .. on conflict do update set fehlversuche = fehlversuche + delta) —
-- es gibt kein Lesen → Aendern → Schreiben mehr und damit keinen verlorenen
-- Eintrag bei gleichzeitigen Laeufen.
create table if not exists public.helmut_verstehen_vormerkungen (
  vorgang_id      text        primary key,
  fehlversuche    integer     not null default 0,
  letzte_fencing  bigint      not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.helmut_verstehen_vormerkungen is
  'OP-30 CAS: Vormerkungen gescheiterter/vertagter Aktualisierungen, eine Zeile je Vorgang. Ersetzt den Lesen-Aendern-Schreiben-Karten-Store (CLAUDE.md §4.10).';

-- ── 3) Fencing-Spalte + Trigger auf knowledge_objects ───────────────────────
-- Der Trigger ist der Unterschied zwischen „vorher geprueft" und „erzwungen":
-- ein alter Besitzer kann sein Ergebnis auch dann nicht mehr schreiben, wenn er
-- zwischen Pruefung und Schreibvorgang beliebig lange stehen bleibt.
--
-- INERT OHNE DEN NEUEN PFAD: solange niemand `verstehen_fencing` setzt, ist die
-- Spalte in allen Zeilen NULL und der Trigger laesst jeden Schreibvorgang
-- unveraendert durch. Bestehende Schreibpfade (Anreicherung, Matching,
-- Nachklassifikation) senden die Spalte nicht mit; PostgREST behaelt dann den
-- Altwert, NEW = OLD, und der Vergleich schlaegt nie an.
alter table public.knowledge_objects
  add column if not exists verstehen_fencing bigint;

comment on column public.knowledge_objects.verstehen_fencing is
  'OP-30 CAS: Fencing-Wert des Verstehenslaufs, der diese Fassung geschrieben hat. Monoton erzwungen durch helmut_ko_fencing_wache. NULL = von keinem CAS-Lauf geschrieben (Altbestand).';

create or replace function public.helmut_ko_fencing_wache()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_aktuell bigint;
begin
  -- KOSTENRIEGEL: nur ein echter CAS-Schreibvorgang wird geprueft. Alle anderen
  -- Schreibpfade (Anreicherung, Matching, Nachklassifikation) senden die Spalte
  -- nicht mit — dann ist new = old und der Trigger tut nichts.
  if new.verstehen_fencing is null
     or (tg_op = 'UPDATE' and new.verstehen_fencing is not distinct from old.verstehen_fencing) then
    return new;
  end if;

  -- (a) Monotonie gegen die GESPEICHERTE Fassung: ein aelterer Lauf ueberschreibt
  --     ein neueres Ergebnis nicht.
  if tg_op = 'UPDATE'
     and old.verstehen_fencing is not null
     and new.verstehen_fencing < old.verstehen_fencing then
    raise exception
      'helmut-verstehen-fencing-veraltet: % < % (Vorgang %, gespeicherte Fassung)',
      new.verstehen_fencing, old.verstehen_fencing, new.vorgang_id
      using errcode = 'HV001';
  end if;

  -- (b) Monotonie gegen die AKTUELLE Reservierung. Ohne diese Pruefung bliebe ein
  --     Fenster offen: ein abgeloester Arbeiter koennte schreiben, SOLANGE der neue
  --     Besitzer sein Ergebnis noch nicht persistiert hat — und der neue Besitzer
  --     wuerde danach zwar gewinnen, es haette aber zwischenzeitlich eine veraltete
  --     Fassung gegolten. Der Besitzwechsel steht in der Reservierungszeile; sie ist
  --     die Wahrheit, nicht der zuletzt geschriebene Wert.
  select r.fencing into v_aktuell
    from public.helmut_verstehen_reservierungen r
   where r.vorgang_id = new.vorgang_id;

  if v_aktuell is not null and new.verstehen_fencing < v_aktuell then
    raise exception
      'helmut-verstehen-fencing-veraltet: % < % (Vorgang %, aktuelle Reservierung)',
      new.verstehen_fencing, v_aktuell, new.vorgang_id
      using errcode = 'HV001';
  end if;

  return new;
end;
$$;

comment on function public.helmut_ko_fencing_wache() is
  'OP-30 CAS: weist ein Verstehensergebnis ab, dessen Fencing-Wert kleiner ist als der gespeicherte ODER als der der aktuellen Reservierung. SQLSTATE HV001. Ohne gesetztes verstehen_fencing wirkungslos.';

drop trigger if exists helmut_ko_fencing_wache_trg on public.knowledge_objects;
create trigger helmut_ko_fencing_wache_trg
  before insert or update on public.knowledge_objects
  for each row execute function public.helmut_ko_fencing_wache();

-- ── 4) Reservieren (der Kern) ───────────────────────────────────────────────
create or replace function public.helmut_verstehen_reserviere(
  p_vorgang_id   text,
  p_eingabe_hash text,
  p_besitzer     text,
  p_ttl_ms       bigint
)
returns table(
  erlaubt        boolean,
  fencing        bigint,
  zustand        text,
  grund          text,
  ergebnis_hash  text,
  versuche       integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r          public.helmut_verstehen_reservierungen%rowtype;
  v_ttl      interval;
  v_ergebnis boolean;
begin
  if p_vorgang_id is null or length(trim(p_vorgang_id)) = 0 then
    raise exception 'helmut_verstehen_reserviere: p_vorgang_id ist Pflicht';
  end if;
  if p_besitzer is null or length(trim(p_besitzer)) = 0 then
    raise exception 'helmut_verstehen_reserviere: p_besitzer ist Pflicht';
  end if;
  if p_eingabe_hash is null or length(trim(p_eingabe_hash)) = 0 then
    raise exception 'helmut_verstehen_reserviere: p_eingabe_hash ist Pflicht';
  end if;

  v_ttl := greatest(coalesce(p_ttl_ms, 300000), 1000) * interval '1 millisecond';

  -- Ankerzeile anlegen (idempotent) und sperren: ab hier ist dieser Vorgang
  -- serialisiert — und NUR dieser.
  insert into public.helmut_verstehen_reservierungen (vorgang_id)
  values (p_vorgang_id)
  on conflict (vorgang_id) do nothing;

  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id
     for update;

  -- (a) Endgueltig aufgegeben — nie wieder automatisch.
  if r.zustand = 'aufgegeben' then
    return query select false, r.fencing, r.zustand, 'aufgegeben'::text, r.ergebnis_hash, r.versuche;
    return;
  end if;

  -- (b) Unbekannter Ausgang: geschlossen blockiert (Auftrag §8). Kein
  --     automatischer zweiter Modellaufruf. Aufloesbar ueber
  --     helmut_verstehen_ausgang_aufloesen (ausdrueckliche Entscheidung).
  if r.zustand = 'unbekannt' then
    return query select false, r.fencing, r.zustand, 'ausgang-unbekannt'::text, r.ergebnis_hash, r.versuche;
    return;
  end if;

  -- (c) Idempotenz: dieselbe Eingabe ist bereits fertig verstanden.
  if r.zustand = 'fertig' and r.eingabe_hash is not distinct from p_eingabe_hash then
    return query select false, r.fencing, r.zustand, 'bereits-fertig'::text, r.ergebnis_hash, r.versuche;
    return;
  end if;

  -- (d) Lebendes Lease.
  if r.zustand in ('reserviert', 'modell-laeuft')
     and r.lease_bis is not null and r.lease_bis > now() then
    if r.besitzer is not distinct from p_besitzer then
      -- Derselbe Besitzer fragt erneut (Wiedereintritt): Lease auffrischen,
      -- FENCING NICHT erhoehen — sonst entwertete er sein eigenes Schreibrecht.
      update public.helmut_verstehen_reservierungen res
         set lease_bis = now() + v_ttl, updated_at = now()
       where res.vorgang_id = p_vorgang_id;
      return query select true, r.fencing, r.zustand, 'wiedereintritt'::text, r.ergebnis_hash, r.versuche;
      return;
    end if;
    return query select false, r.fencing, r.zustand, 'belegt'::text, r.ergebnis_hash, r.versuche;
    return;
  end if;

  -- (e) Abgelaufenes Lease AUS 'modell-laeuft': der Ausgang eines bezahlten
  --     Modellaufrufs ist unbekannt. Genau EINE sichere automatische
  --     Aufloesung: liegt das Ergebnis nachweislich in knowledge_objects
  --     (Fencing >= dem des Abgestuerzten), lag der Absturz NACH dem
  --     Speichern — dann ist der Ausgang belegt bekannt.
  if r.zustand = 'modell-laeuft' then
    select exists (
      select 1 from public.knowledge_objects k
       where k.vorgang_id = p_vorgang_id
         and coalesce(k.verstehen_fencing, -1) >= r.fencing
    ) into v_ergebnis;

    if v_ergebnis then
      update public.helmut_verstehen_reservierungen res
         set zustand = 'fertig', ergebnis_fencing = r.fencing, besitzer = null,
             lease_bis = null, letzter_grund = 'ausgang-aus-ergebnis-belegt', updated_at = now()
       where res.vorgang_id = p_vorgang_id;
      -- Der Ausgang ist damit derselbe wie bei (c): fertig, dieselbe Eingabe.
      if r.eingabe_hash is not distinct from p_eingabe_hash then
        return query select false, r.fencing, 'fertig'::text, 'bereits-fertig'::text, r.ergebnis_hash, r.versuche;
        return;
      end if;
      -- Neue Eingabe zu einem jetzt belegt fertigen Vorgang: normal weiterreichen.
      r.zustand := 'fertig';
      r.besitzer := null;
    else
      update public.helmut_verstehen_reservierungen res
         set zustand = 'unbekannt', besitzer = null, lease_bis = null,
             letzter_grund = 'absturz-nach-modellstart', updated_at = now()
       where res.vorgang_id = p_vorgang_id;
      return query select false, r.fencing, 'unbekannt'::text, 'ausgang-unbekannt'::text, r.ergebnis_hash, r.versuche;
      return;
    end if;
  end if;

  -- (f) Frei / abgelaufen aus 'reserviert' (Absturz VOR dem Modellaufruf —
  --     sicher wiederholbar) / fertig mit ANDERER Eingabe: uebernehmen.
  --     Der Fencing-Wert steigt monoton; damit verliert jeder frühere Besitzer
  --     sein Schreibrecht endgueltig.
  update public.helmut_verstehen_reservierungen res
     set fencing      = res.fencing + 1,
         besitzer     = p_besitzer,
         lease_bis    = now() + v_ttl,
         zustand      = 'reserviert',
         eingabe_hash = p_eingabe_hash,
         versuche     = res.versuche + 1,
         letzter_grund = null,
         updated_at   = now()
   where res.vorgang_id = p_vorgang_id
   returning res.fencing, res.versuche into r.fencing, r.versuche;

  return query select true, r.fencing, 'reserviert'::text, 'uebernommen'::text, null::text, r.versuche;
end;
$$;

comment on function public.helmut_verstehen_reserviere(text, text, text, bigint) is
  'Atomare Verstehensreservierung je Vorgang: genau ein berechtigter Besitzer, monotoner Fencing-Wert, Lease. erlaubt=false mit Grund bereits-fertig | belegt | ausgang-unbekannt | aufgegeben.';

-- ── 5) Modellstart: die Zusage „hoechstens ein Aufruf" ──────────────────────
create or replace function public.helmut_verstehen_modellstart(
  p_vorgang_id text,
  p_besitzer   text,
  p_fencing    bigint,
  p_ttl_ms     bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.helmut_verstehen_reservierungen res
     set zustand    = 'modell-laeuft',
         ki_aufrufe = res.ki_aufrufe + 1,
         lease_bis  = now() + (greatest(coalesce(p_ttl_ms, 300000), 1000) * interval '1 millisecond'),
         updated_at = now()
   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand    = 'reserviert'
     and res.lease_bis  > now();
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_modellstart(text, text, bigint, bigint) is
  'Vermerkt VOR dem externen Modellaufruf, dass er stattfindet. false = Lease/Fencing verloren -> es darf NICHT aufgerufen werden (fail closed).';

-- ── 6) Schreibrecht: Fencing-Pruefung unmittelbar vor der Persistenz ────────
create or replace function public.helmut_verstehen_schreibrecht(
  p_vorgang_id text,
  p_besitzer   text,
  p_fencing    bigint,
  p_ttl_ms     bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.helmut_verstehen_reservierungen res
     set lease_bis  = now() + (greatest(coalesce(p_ttl_ms, 120000), 1000) * interval '1 millisecond'),
         updated_at = now()
   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand    = 'modell-laeuft';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_schreibrecht(text, text, bigint, bigint) is
  'Prueft unmittelbar vor der Persistenz, dass dieser Besitzer noch der aktuelle ist. Die HARTE Zusage liegt zusaetzlich im Trigger helmut_ko_fencing_wache.';

-- ── 7) Abschluss ────────────────────────────────────────────────────────────
create or replace function public.helmut_verstehen_abschluss(
  p_vorgang_id    text,
  p_besitzer      text,
  p_fencing       bigint,
  p_ergebnis_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  -- Kein Lease-Zwang: das Ergebnis ist bereits persistiert und der Trigger hat
  -- die Monotonie erzwungen. Entscheidend ist allein, dass KEIN anderer Besitzer
  -- uebernommen hat (dann waere res.fencing groesser als p_fencing).
  update public.helmut_verstehen_reservierungen res
     set zustand          = 'fertig',
         ergebnis_fencing = p_fencing,
         ergebnis_hash    = p_ergebnis_hash,
         besitzer         = null,
         lease_bis        = null,
         letzter_grund    = null,
         updated_at       = now()
   where res.vorgang_id = p_vorgang_id
     and res.fencing    = p_fencing
     and coalesce(res.ergebnis_fencing, -1) <= p_fencing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_abschluss(text, text, bigint, text) is
  'Schliesst den Vorgang mit dem persistierten Ergebnis ab. false = ein neuerer Besitzer hat uebernommen (das eigene Ergebnis gilt nicht mehr).';

-- ── 8) Freigabe ohne Ergebnis (bekannter Ausgang) ───────────────────────────
-- Ausdrueckliche Freigabe: der Aufrufer WEISS, dass kein Ergebnis entstanden ist
-- (Budgetvertagung, Modellfehler, ungueltige Antwort). Das ist der Unterschied
-- zum Absturz — der hinterlaesst gar keine Meldung und endet in 'unbekannt'.
create or replace function public.helmut_verstehen_freigabe(
  p_vorgang_id text,
  p_besitzer   text,
  p_fencing    bigint,
  p_grund      text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.helmut_verstehen_reservierungen res
     set zustand       = 'offen',
         besitzer      = null,
         lease_bis     = null,
         letzter_grund = left(coalesce(p_grund, 'freigegeben'), 200),
         updated_at    = now()
   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand in ('reserviert', 'modell-laeuft');
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_freigabe(text, text, bigint, text) is
  'Gibt eine Reservierung mit BEKANNTEM Ausgang frei (kein Ergebnis entstanden). Ein Absturz meldet sich nicht und endet stattdessen in zustand=unbekannt.';

-- ── 9) Unbekannten Ausgang ausdruecklich aufloesen ──────────────────────────
create or replace function public.helmut_verstehen_ausgang_aufloesen(
  p_vorgang_id   text,
  p_entscheidung text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r          public.helmut_verstehen_reservierungen%rowtype;
  v_ergebnis boolean;
begin
  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id
     for update;

  if not found then return 'unbekannter-vorgang'; end if;
  if r.zustand <> 'unbekannt' then return 'nicht-blockiert'; end if;

  -- Sichere Aufloesung zuerst: liegt das Ergebnis doch vor, braucht es keine
  -- Entscheidung und keinen zweiten Modellaufruf.
  select exists (
    select 1 from public.knowledge_objects k
     where k.vorgang_id = p_vorgang_id
       and coalesce(k.verstehen_fencing, -1) >= r.fencing
  ) into v_ergebnis;

  if v_ergebnis then
    update public.helmut_verstehen_reservierungen res
       set zustand = 'fertig', ergebnis_fencing = r.fencing, letzter_grund = 'ergebnis-nachtraeglich-belegt',
           updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'aufgeloest-ergebnis-vorhanden';
  end if;

  if p_entscheidung = 'erneut' then
    -- AUSDRUECKLICHE Zustimmung zu einem zweiten, bezahlten Modellaufruf.
    update public.helmut_verstehen_reservierungen res
       set zustand = 'offen', letzter_grund = 'erneut-freigegeben', updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'erneut-freigegeben';
  end if;

  if p_entscheidung = 'aufgeben' then
    update public.helmut_verstehen_reservierungen res
       set zustand = 'aufgegeben', letzter_grund = 'aufgegeben', updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'aufgegeben';
  end if;

  return 'entscheidung-unbekannt';
end;
$$;

comment on function public.helmut_verstehen_ausgang_aufloesen(text, text) is
  'Loest einen blockierten unbekannten Ausgang auf: automatisch, wenn das Ergebnis doch belegt vorliegt; sonst nur auf ausdrueckliche Entscheidung (erneut | aufgeben).';

-- ── 10) Vormerkungen: atomar erhoehen / lesen / bedingt loeschen ────────────
create or replace function public.helmut_verstehen_vormerkung_erhoehe(
  p_vorgang_id text,
  p_delta      integer,
  p_fencing    bigint
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wert integer;
begin
  insert into public.helmut_verstehen_vormerkungen (vorgang_id, fehlversuche, letzte_fencing)
  values (p_vorgang_id, greatest(coalesce(p_delta, 0), 0), coalesce(p_fencing, 0))
  on conflict (vorgang_id) do update
     set fehlversuche   = public.helmut_verstehen_vormerkungen.fehlversuche + greatest(coalesce(p_delta, 0), 0),
         letzte_fencing = greatest(public.helmut_verstehen_vormerkungen.letzte_fencing, coalesce(p_fencing, 0)),
         updated_at     = now()
  returning fehlversuche into v_wert;
  return v_wert;
end;
$$;

comment on function public.helmut_verstehen_vormerkung_erhoehe(text, integer, bigint) is
  'ATOMARE Erhoehung (kein Lesen-Aendern-Schreiben). delta=0 legt die Vormerkung an, ohne einen Fehlversuch zu zaehlen (Budgetvertagung).';

create or replace function public.helmut_verstehen_vormerkung_lese(p_vorgang_ids text[])
returns table(vorgang_id text, fehlversuche integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select v.vorgang_id, v.fehlversuche
    from public.helmut_verstehen_vormerkungen v
   where v.vorgang_id = any(coalesce(p_vorgang_ids, array[]::text[]));
$$;

comment on function public.helmut_verstehen_vormerkung_lese(text[]) is
  'Liest Vormerkungen gezielt je Vorgang (nie die ganze Karte).';

create or replace function public.helmut_verstehen_vormerkung_loese(
  p_vorgang_id text,
  p_fencing    bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  -- BEDINGT: nur, wenn seit dieser Reservierung kein NEUERER Lauf die Vormerkung
  -- angefasst hat. Sonst loeschte ein langsamer Erfolgsmelder die Vormerkung
  -- eines juengeren, gescheiterten Laufs — genau der verlorene Eintrag, gegen
  -- den dieser Vertrag angetreten ist.
  delete from public.helmut_verstehen_vormerkungen v
   where v.vorgang_id = p_vorgang_id
     and v.letzte_fencing <= coalesce(p_fencing, 0);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_vormerkung_loese(text, bigint) is
  'Bedingtes Loeschen (Compare-and-Set gegen letzte_fencing): ein alter Erfolgsmelder loescht nie die Vormerkung eines juengeren Laufs.';

-- ── 11) Kennzahlen (rein lesend) ────────────────────────────────────────────
create or replace function public.helmut_verstehen_kennzahlen()
returns table(zustand text, anzahl bigint, aelteste_s numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.zustand, count(*),
         coalesce(max(extract(epoch from (now() - r.updated_at))), 0)
    from public.helmut_verstehen_reservierungen r
   group by r.zustand;
$$;

comment on function public.helmut_verstehen_kennzahlen() is
  'Zaehlt Reservierungen je Zustand. Insbesondere zustand=unbekannt ist der sichtbare, geschlossene Rueckstand (kein falsches Gruen).';

-- ── 12) Zugriff: ausschliesslich serverseitig (zwei unabhaengige Riegel) ────
alter table public.helmut_verstehen_reservierungen enable row level security;
alter table public.helmut_verstehen_reservierungen force row level security;
alter table public.helmut_verstehen_vormerkungen  enable row level security;
alter table public.helmut_verstehen_vormerkungen  force row level security;
revoke all on table public.helmut_verstehen_reservierungen from public, anon, authenticated;
revoke all on table public.helmut_verstehen_vormerkungen  from public, anon, authenticated;

revoke all on function public.helmut_verstehen_reserviere(text, text, text, bigint)        from public, anon, authenticated;
revoke all on function public.helmut_verstehen_modellstart(text, text, bigint, bigint)     from public, anon, authenticated;
revoke all on function public.helmut_verstehen_schreibrecht(text, text, bigint, bigint)    from public, anon, authenticated;
revoke all on function public.helmut_verstehen_abschluss(text, text, bigint, text)         from public, anon, authenticated;
revoke all on function public.helmut_verstehen_freigabe(text, text, bigint, text)          from public, anon, authenticated;
revoke all on function public.helmut_verstehen_ausgang_aufloesen(text, text)               from public, anon, authenticated;
revoke all on function public.helmut_verstehen_vormerkung_erhoehe(text, integer, bigint)   from public, anon, authenticated;
revoke all on function public.helmut_verstehen_vormerkung_lese(text[])                     from public, anon, authenticated;
revoke all on function public.helmut_verstehen_vormerkung_loese(text, bigint)              from public, anon, authenticated;
revoke all on function public.helmut_verstehen_kennzahlen()                                from public, anon, authenticated;
revoke all on function public.helmut_ko_fencing_wache()                                    from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.helmut_verstehen_reservierungen to service_role';
    execute 'grant select, insert, update, delete on table public.helmut_verstehen_vormerkungen to service_role';
    execute 'grant execute on function public.helmut_verstehen_reserviere(text, text, text, bigint) to service_role';
    execute 'grant execute on function public.helmut_verstehen_modellstart(text, text, bigint, bigint) to service_role';
    execute 'grant execute on function public.helmut_verstehen_schreibrecht(text, text, bigint, bigint) to service_role';
    execute 'grant execute on function public.helmut_verstehen_abschluss(text, text, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_freigabe(text, text, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_ausgang_aufloesen(text, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_vormerkung_erhoehe(text, integer, bigint) to service_role';
    execute 'grant execute on function public.helmut_verstehen_vormerkung_lese(text[]) to service_role';
    execute 'grant execute on function public.helmut_verstehen_vormerkung_loese(text, bigint) to service_role';
    execute 'grant execute on function public.helmut_verstehen_kennzahlen() to service_role';
  end if;
end $$;

commit;

-- ── Verifikation nach der Anwendung (rein lesend) ───────────────────────────
--   select count(*) from information_schema.tables
--    where table_schema='public'
--      and table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen');  -- 2
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relname in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen');     -- t/t
--   select count(*) from information_schema.role_table_grants
--    where table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')
--      and grantee in ('anon','authenticated','PUBLIC');                                       -- 0
--   select count(*) from pg_trigger where tgname='helmut_ko_fencing_wache_trg';                -- 1
--   select count(*) from information_schema.columns
--    where table_name='knowledge_objects' and column_name='verstehen_fencing';                 -- 1
--   select * from public.helmut_verstehen_kennzahlen();                                        -- leer (Neuanlage)
