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
--   2. LEASE + MONOTONER FENCING-WERT, GEMEINSAM GEPRÜFT. Jede Übernahme erhöht
--      `fencing` um 1. Geschrieben wird ausschließlich über
--      `helmut_verstehen_speichere` (§6a): eine Datenbankfunktion, die Besitzer,
--      aktuelle Reservierung, Fencing-Wert, Zustand UND ein noch gültiges Lease
--      unter dem Row-Lock der Vorgangszeile prüft und erst dann das Wissensobjekt
--      schreibt und den Vorgang abschließt. Ein abgelöster oder abgelaufener
--      Arbeiter kommt damit auch dann nicht durch, wenn er beliebig lange
--      zwischen Prüfung und Schreibvorgang stehen bleibt UND wenn noch kein
--      Nachfolger übernommen hat. Der Trigger `helmut_ko_fencing_wache` ist der
--      zweite Riegel: außerhalb dieses Wegs darf `verstehen_fencing` überhaupt
--      nicht gesetzt oder geändert werden.
--
--   3. AT-MOST-ONCE FÜR DEN EXTERNEN MODELLAUFRUF. `helmut_verstehen_modellstart`
--      schreibt VOR dem Aufruf `zustand = 'modell-laeuft'`. Ab diesem Vermerk
--      gibt es KEINEN automatischen Weg zurück nach `offen`:
--      `helmut_verstehen_freigabe` greift nur noch aus `reserviert` (§8), und
--      jeder Ausgang ohne belegtes Ergebnis — Zeitüberschreitung,
--      Verbindungsabbruch, unklarer Anbieterfehler, ungültige Antwort,
--      Validierungs-, Speicherfehler oder Absturz — endet sichtbar in
--      `zustand = 'unbekannt'` (§9a bzw. über das ablaufende Lease in §4e) und
--      ist dort geschlossen blockiert. Nur die ausdrückliche Entscheidung
--      `helmut_verstehen_ausgang_aufloesen(…, 'erneut')` erlaubt einen zweiten
--      bezahlten Aufruf.
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
-- INERT OHNE DEN NEUEN PFAD: bestehende Schreibpfade (Anreicherung, Matching,
-- Nachklassifikation) senden `verstehen_fencing` nicht mit. PostgREST behaelt
-- dann den Altwert, NEW = OLD, und der Trigger laesst den Schreibvorgang
-- unveraendert durch. Ohne den CAS-Pfad ist die Spalte ueberall NULL.
-- NEU (Korrekturlauf 2026-08-15): der Trigger entscheidet nicht mehr am WERT,
-- sondern an der HERKUNFT — siehe die ausfuehrliche Begruendung unten.
alter table public.knowledge_objects
  add column if not exists verstehen_fencing bigint;

comment on column public.knowledge_objects.verstehen_fencing is
  'OP-30 CAS: Fencing-Wert des Verstehenslaufs, der diese Fassung geschrieben hat. Monoton erzwungen durch helmut_ko_fencing_wache. NULL = von keinem CAS-Lauf geschrieben (Altbestand).';

-- KORREKTURLAUF 2026-08-15 (Luecke 3, „Fencing-Umgehung"): die erste Fassung dieses
-- Triggers ueberSPRANG die Pruefung, wenn `new.verstehen_fencing` dem bereits
-- gespeicherten Wert ENTSPRACH (`is not distinct from old`). Das war als Kostenriegel
-- fuer fremde Schreibpfade gedacht, riss aber ein Loch in die Zusage:
--
--     gespeichert F1 · aktuelle Reservierung F2 · alter Arbeiter schreibt erneut F1
--     -> new = old = F1 -> Trigger sprang ab -> der VERALTETE Inhalt wurde geschrieben.
--
-- Der Fencing-Wert allein kann diese beiden Faelle nicht auseinanderhalten (ein fremder
-- Teil-Update traegt denselben Altwert wie ein veralteter CAS-Schreibvorgang). Deshalb
-- entscheidet jetzt die HERKUNFT des Schreibvorgangs, nicht sein Wert:
--
--   * `helmut_verstehen_speichere` (§6a) prueft Besitzer, Reservierung, Fencing-Wert,
--     Zustand und Lease GEMEINSAM unter dem Row-Lock der Vorgangszeile und markiert
--     seinen eigenen Schreibvorgang waehrenddessen mit der Transaktionsvariablen
--     `helmut.verstehen_cas`.
--   * Jeder ANDERE Schreibweg darf `verstehen_fencing` weder setzen noch aendern
--     (SQLSTATE HV002). Er darf alles andere unveraendert schreiben — ein Teil-Update
--     aus Anreicherung, Matching oder Nachklassifikation traegt den Altwert der Spalte
--     mit und laeuft deshalb wie bisher durch.
--
-- Damit gibt es genau EINEN Weg, einen Fencing-Wert an ein Wissensobjekt zu schreiben,
-- und dieser Weg ist atomar geprueft.
create or replace function public.helmut_ko_fencing_wache()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_aktuell bigint;
begin
  -- ── Fremder Schreibweg (der Regelfall) ───────────────────────────────────────
  if coalesce(current_setting('helmut.verstehen_cas', true), '') <> 'geprueft' then
    if tg_op = 'INSERT' then
      if new.verstehen_fencing is not null then
        raise exception
          'helmut-verstehen-fencing-fremdschreibweg: verstehen_fencing darf nur ueber helmut_verstehen_speichere gesetzt werden (Vorgang %)',
          new.vorgang_id
          using errcode = 'HV002';
      end if;
      return new;
    end if;
    -- Der Trigger feuert bei UPDATE nur, wenn die Spalte ausdruecklich gesetzt wurde —
    -- auch dann, wenn der Wert derselbe bleibt. Genau das war die alte Umgehung.
    raise exception
      'helmut-verstehen-fencing-fremdschreibweg: verstehen_fencing darf nur ueber helmut_verstehen_speichere geschrieben werden (Vorgang %, % -> %)',
      new.vorgang_id, old.verstehen_fencing, new.verstehen_fencing
      using errcode = 'HV002';
  end if;

  -- ── Geprueter CAS-Schreibweg: Monotonie zusaetzlich hart erzwingen ───────────
  if new.verstehen_fencing is null then return new; end if;

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

  -- (b) Monotonie gegen die AKTUELLE Reservierung. Der Besitzwechsel steht in der
  --     Reservierungszeile; sie ist die Wahrheit, nicht der zuletzt geschriebene Wert.
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
  'OP-30 CAS: verstehen_fencing darf NUR ueber helmut_verstehen_speichere gesetzt/geaendert werden (sonst SQLSTATE HV002); innerhalb dieses Wegs wird zusaetzlich Monotonie gegen gespeicherte Fassung und aktuelle Reservierung erzwungen (HV001). Fremde Teil-Updates ohne Wertaenderung bleiben erlaubt.';

-- `update of verstehen_fencing` ist hier die entscheidende Feinheit (Korrekturlauf
-- 2026-08-15): der Trigger feuert bei einem UPDATE NUR, wenn die Spalte ausdruecklich im
-- SET-Teil steht — unabhaengig davon, ob sich ihr Wert dabei aendert. Damit ist genau der
-- Fall erfasst, den die Wertpruefung nicht sehen konnte (ein alter Arbeiter schreibt
-- denselben Fencing-Wert erneut), und ein fremdes Teil-Update, das die Spalte gar nicht
-- erwaehnt, kostet nicht einmal einen Triggeraufruf.
drop trigger if exists helmut_ko_fencing_wache_trg on public.knowledge_objects;
create trigger helmut_ko_fencing_wache_trg
  before insert or update of verstehen_fencing on public.knowledge_objects
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

-- ── 6) Schreibrecht: Lease- und Fencing-Pruefung vor der Persistenz ─────────
-- KORREKTURLAUF 2026-08-15 (Luecke 2, „abgelaufene Lease"): die erste Fassung prueste
-- Besitzer, Fencing-Wert und Zustand — aber NICHT, ob das Lease noch gilt. Solange kein
-- Nachfolger uebernommen hatte, blieb die Zeile unveraendert auf `modell-laeuft` mit dem
-- alten Besitzer stehen; ein beliebig lange stehen gebliebener Arbeiter bekam sein
-- Schreibrecht deshalb NOCH IMMER bestaetigt. Ein Lease ohne Ablaufzwang ist kein Lease.
--
-- Es gibt hier bewusst KEINEN erneuerbaren Lease-Vertrag mit Nachfrist: die Erneuerung
-- erfolgt an genau zwei Stellen (`reserviere` beim Wiedereintritt, `modellstart` und
-- diese Funktion selbst) und immer nur, SOLANGE das Lease noch gilt. Ein abgelaufenes
-- Lease ist endgueltig verloren — der Ausgang gehoert dann in `unbekannt` (§9a), nicht
-- in einen stillen Schreibvorgang.
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
     and res.zustand    = 'modell-laeuft'
     -- LEASE-ZWANG: ein abgelaufenes Lease verliert das Schreibrecht auch dann,
     -- wenn noch KEIN Nachfolger uebernommen hat.
     and res.lease_bis is not null
     and res.lease_bis  > now();
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_schreibrecht(text, text, bigint, bigint) is
  'Prueft vor der Persistenz Besitzer, Fencing-Wert, Zustand UND ein noch gueltiges Lease. false = kein Schreibrecht (auch bei bloss abgelaufenem Lease ohne Nachfolger). Die harte, atomare Zusage liegt in helmut_verstehen_speichere.';

-- ── 6a) DER ATOMARE CAS-SPEICHERWEG (Korrekturlauf 2026-08-15, Luecke 3) ────
-- Der EINZIGE Weg, ein Verstehensergebnis mit Fencing-Wert zu persistieren.
--
-- WARUM ES IHN GIBT: `schreibrecht` + eigener Schreibvorgang + `abschluss` waren DREI
-- Anweisungen in DREI Transaktionen. Zwischen ihnen konnte ein Besitzwechsel liegen, und
-- der Trigger allein konnte den veralteten Schreibvorgang nicht erkennen, weil er
-- denselben Fencing-Wert trug wie die gespeicherte Fassung. Hier passiert alles in EINER
-- Transaktion unter dem Row-Lock der Vorgangszeile:
--
--   Besitzer + aktuelle Reservierung + Fencing-Wert + Zustand + Lease pruefen
--   -> Wissensobjekt schreiben -> Reservierung abschliessen.
--
-- Damit wird der Auftragsfall sicher abgewiesen: gespeichert F1, Reservierung F2, alter
-- Arbeiter schreibt erneut F1 -> `res.fencing = 2 <> 1` -> 'fencing-veraltet', ohne dass
-- eine einzige Spalte am Wissensobjekt angefasst wird.
--
-- SERIALISIERUNG: der Lock liegt auf der VORGANGSZEILE. Verschiedene Vorgaenge schreiben
-- weiterhin vollstaendig parallel.
--
-- SCHREIBPROJEKTION: geschrieben werden ausschliesslich die Schluessel aus `p_ko`, die es
-- als Spalte in `knowledge_objects` wirklich gibt — genau die Semantik des bisherigen
-- PostgREST-Upserts (`resolution=merge-duplicates`, Konfliktziel `id`): nicht gesendete
-- Spalten bleiben unangetastet. `verstehen_fencing` kommt NIE aus `p_ko`, sondern immer
-- aus dem hier geprueften `p_fencing`.
create or replace function public.helmut_verstehen_speichere(
  p_vorgang_id    text,
  p_besitzer      text,
  p_fencing       bigint,
  p_ko            jsonb,
  p_ergebnis_hash text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r          public.helmut_verstehen_reservierungen%rowtype;
  v_ko_fenc  bigint;
  v_spalten  text[];
  v_liste    text;
  v_setliste text;
begin
  if p_vorgang_id is null or length(trim(p_vorgang_id)) = 0 then
    raise exception 'helmut_verstehen_speichere: p_vorgang_id ist Pflicht';
  end if;
  if p_besitzer is null or length(trim(p_besitzer)) = 0 then
    raise exception 'helmut_verstehen_speichere: p_besitzer ist Pflicht';
  end if;
  if p_fencing is null then
    raise exception 'helmut_verstehen_speichere: p_fencing ist Pflicht';
  end if;
  if p_ko is null or jsonb_typeof(p_ko) <> 'object' then
    raise exception 'helmut_verstehen_speichere: p_ko muss ein JSON-Objekt sein';
  end if;
  if coalesce(p_ko->>'id', '') = '' then
    raise exception 'helmut_verstehen_speichere: p_ko.id ist Pflicht';
  end if;
  -- Ein Ergebnis darf nie unter einer FREMDEN Vorgangskennung landen.
  if (p_ko->>'vorgang_id') is distinct from p_vorgang_id then
    raise exception 'helmut_verstehen_speichere: p_ko.vorgang_id passt nicht zu p_vorgang_id';
  end if;

  -- (1) EINE gemeinsame Pruefung unter dem Row-Lock der Vorgangszeile.
  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id
     for update;
  if not found                             then return 'keine-reservierung'; end if;
  if r.fencing is distinct from p_fencing  then return 'fencing-veraltet';   end if;
  -- Zustand VOR Besitzer: ein abgeschlossener Vorgang hat gar keinen Besitzer mehr, und
  -- 'zustand-fertig' ist die ehrlichere Auskunft als 'fremder-besitzer'.
  if r.zustand <> 'modell-laeuft'          then return 'zustand-' || r.zustand; end if;
  if r.besitzer is distinct from p_besitzer then return 'fremder-besitzer';  end if;
  if r.lease_bis is null or r.lease_bis <= now() then return 'lease-abgelaufen'; end if;

  -- (2) Eine bereits gespeicherte NEUERE Fassung gewinnt (der Trigger wiederholt das).
  select max(coalesce(k.verstehen_fencing, -1)) into v_ko_fenc
    from public.knowledge_objects k
   where k.vorgang_id = p_vorgang_id;
  if v_ko_fenc is not null and v_ko_fenc > p_fencing then return 'ergebnis-neuer'; end if;

  -- (3) Schreiben — nur bekannte Spalten, `verstehen_fencing` ausschliesslich aus p_fencing.
  select array_agg(quote_ident(c.column_name) order by c.ordinal_position) into v_spalten
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name   = 'knowledge_objects'
     and c.column_name <> 'verstehen_fencing'
     and p_ko ? c.column_name;
  if v_spalten is null or array_length(v_spalten, 1) = 0 then
    raise exception 'helmut_verstehen_speichere: p_ko enthaelt keine bekannte Spalte von knowledge_objects';
  end if;
  v_liste := array_to_string(v_spalten, ', ');
  select string_agg(s || ' = excluded.' || s, ', ') into v_setliste
    from unnest(v_spalten) as s where s <> 'id';
  v_setliste := coalesce(v_setliste || ', ', '') || 'verstehen_fencing = excluded.verstehen_fencing';

  perform set_config('helmut.verstehen_cas', 'geprueft', true);
  execute format(
    'insert into public.knowledge_objects (%s, verstehen_fencing)'
    || ' select %s, $2 from jsonb_populate_record(null::public.knowledge_objects, $1)'
    || ' on conflict (id) do update set %s',
    v_liste, v_liste, v_setliste)
    using p_ko, p_fencing;
  perform set_config('helmut.verstehen_cas', '', true);

  -- (4) Abschluss IN DERSELBEN Transaktion: die Meldung „fertig" traegt damit genau das,
  --     was die Ablage traegt (CLAUDE.md §4 Regel 10) — es gibt kein Fenster, in dem das
  --     Ergebnis geschrieben, der Vorgang aber noch offen waere.
  update public.helmut_verstehen_reservierungen res
     set zustand          = 'fertig',
         ergebnis_fencing = p_fencing,
         ergebnis_hash    = p_ergebnis_hash,
         besitzer         = null,
         lease_bis        = null,
         letzter_grund    = null,
         updated_at       = now()
   where res.vorgang_id = p_vorgang_id;

  return 'gespeichert';
end;
$$;

comment on function public.helmut_verstehen_speichere(text, text, bigint, jsonb, text) is
  'OP-30 CAS: atomarer Speicherweg. Prueft Besitzer, aktuelle Reservierung, Fencing-Wert, Zustand und Lease GEMEINSAM unter Row-Lock und schreibt erst dann Wissensobjekt + Abschluss. Rueckgabe: gespeichert | fencing-veraltet | fremder-besitzer | lease-abgelaufen | ergebnis-neuer | keine-reservierung | zustand-<x>.';

-- ── 7) Abschluss (Einzelschritt, ohne eigenen Schreibvorgang) ───────────────
-- KORREKTURLAUF 2026-08-15: die erste Fassung prueste NUR den Fencing-Wert. Das reichte
-- nicht — ein Fencing-Wert ohne Besitzer ist kein Vertrag: waere die Zeile
-- zwischenzeitlich freigegeben oder in `unbekannt` gelaufen (beides ohne Erhoehung des
-- Fencing-Werts), haette ein spaeter Melder sie stillschweigend wieder auf `fertig`
-- gesetzt. Jetzt gilt: nur der EIGENE, noch laufende Besitzer schliesst ab.
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
  -- Kein Lease-Zwang: das Ergebnis ist zu diesem Zeitpunkt bereits persistiert, und der
  -- Schreibvorgang selbst hat das Lease geprueft. Der Besitzer aber ist bindend.
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
     and res.besitzer   = p_besitzer
     and res.zustand    = 'modell-laeuft'
     and coalesce(res.ergebnis_fencing, -1) <= p_fencing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_abschluss(text, text, bigint, text) is
  'Schliesst den Vorgang mit dem persistierten Ergebnis ab — nur fuer den eigenen Besitzer aus zustand=modell-laeuft. false = uebernommen, freigegeben oder bereits blockiert.';

-- ── 8) Freigabe VOR dem Modellstart (sicher wiederholbar) ───────────────────
-- KORREKTURLAUF 2026-08-15 (Luecke 1, „at most once nach dem Modellstart"): die erste
-- Fassung gab auch aus `modell-laeuft` wieder auf `offen` frei. Damit konnte JEDER Fehler
-- nach dem Modellstart — Zeitueberschreitung, Verbindungsabbruch, unklarer Anbieterfehler,
-- ungueltige Antwort, Validierungsfehler, Speicherfehler — den Vorgang automatisch wieder
-- eroeffnen und beim naechsten Lauf einen ZWEITEN bezahlten Modellaufruf ausloesen.
--
-- Jetzt gibt es nur noch EINEN Zustand, aus dem freigegeben werden darf: `reserviert` —
-- also bevor irgendein Aufruf abgesendet werden konnte. Ab `modell-laeuft` fuehrt jeder
-- Ausgang ohne belegtes Ergebnis nach `unbekannt` (§9a). Diese Zusage steht damit in der
-- DATENBANK und nicht nur im Aufrufer: selbst ein fehlerhafter Aufrufer kann einen
-- begonnenen Modellaufruf nicht mehr stillschweigend wiederholbar machen.
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
     -- NUR vor dem Modellstart. 'modell-laeuft' ist hier bewusst NICHT enthalten.
     and res.zustand    = 'reserviert';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_freigabe(text, text, bigint, text) is
  'Gibt eine Reservierung VOR dem Modellstart wieder frei (zustand=reserviert). Nach dem Modellstart ist sie wirkungslos — dort gilt ausschliesslich helmut_verstehen_ausgang_unbekannt.';

-- ── 8a) Freigabe MIT BELEG, dass kein Aufruf stattfand ──────────────────────
-- Es gibt genau einen Fall, in dem ein Vorgang nach dem Modellstart wieder sicher offen
-- ist: der Prozess kann BELEGEN, dass nichts abgesendet wurde. Das passiert real, weil der
-- Modellstart vermerkt wird, BEVOR der Aufrufer die KI-Engstelle erreicht — dort koennen
-- Tagesbudget oder Anbietergrenze den Aufruf noch abfangen (`ai.markiereNichtGesendet`,
-- gesetzt vor `https.request`).
--
-- WARUM DAS KEINE HINTERTUER IST: die Datenbank kann einen solchen Beleg nicht selbst
-- pruefen — deshalb ist dies eine EIGENE, eigens benannte, eigens berechtigte Funktion und
-- NICHT der allgemeine Rueckweg. Der allgemeine Rueckweg (§8) bleibt fuer `modell-laeuft`
-- verschlossen; ein Aufrufer, der bloss „irgendwie gescheitert" ist, kann diesen Weg nicht
-- versehentlich nehmen. Jede Nutzung hinterlaesst eine eigene Spur in `letzter_grund` und
-- korrigiert den Zaehler der Modellaufrufe wieder nach unten — sonst behauptete die
-- Kennzahl Kosten, die nie entstanden sind.
create or replace function public.helmut_verstehen_freigabe_ohne_aufruf(
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
         ki_aufrufe    = case when res.zustand = 'modell-laeuft'
                              then greatest(res.ki_aufrufe - 1, 0) else res.ki_aufrufe end,
         letzter_grund = left('belegt-ohne-aufruf:' || coalesce(p_grund, 'unbenannt'), 200),
         updated_at    = now()
   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand in ('reserviert', 'modell-laeuft');
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_verstehen_freigabe_ohne_aufruf(text, text, bigint, text) is
  'Gibt eine Reservierung frei, wenn der Aufrufer BELEGEN kann, dass kein Modellaufruf abgesendet wurde (Tagesbudget/Anbietergrenze vor dem HTTP-Aufruf). Eigener, eigens berechtigter Weg — der allgemeine Rueckweg helmut_verstehen_freigabe bleibt fuer modell-laeuft verschlossen.';

-- ── 9a) Unbekannter Ausgang nach dem Modellstart ────────────────────────────
-- Der Gegenpart zu §8: der Arbeiter WEISS, dass etwas schiefging, kann aber NICHT
-- belegen, dass kein Modellaufruf stattgefunden hat (Zeitueberschreitung,
-- Verbindungsabbruch, unklarer Anbieterfehler, ungueltige Antwort, Validierungs- oder
-- Speicherfehler). Statt zu behaupten, es sei nichts passiert, meldet er ehrlich:
-- Ausgang unbekannt.
--
-- Der Unterschied zum ABSTURZ ist nur die Geschwindigkeit — der Absturz meldet gar nichts
-- und laeuft ueber das ablaufende Lease in denselben Zustand (§4e). Beide enden in
-- `unbekannt`, und aus `unbekannt` entsteht NIE automatisch ein weiterer Modellaufruf.
create or replace function public.helmut_verstehen_ausgang_unbekannt(
  p_vorgang_id text,
  p_besitzer   text,
  p_fencing    bigint,
  p_grund      text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r      public.helmut_verstehen_reservierungen%rowtype;
  v_rows integer;
begin
  update public.helmut_verstehen_reservierungen res
     set zustand       = 'unbekannt',
         besitzer      = null,
         lease_bis     = null,
         letzter_grund = left(coalesce(p_grund, 'ausgang-unbekannt'), 200),
         updated_at    = now()
   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand    = 'modell-laeuft';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then return 'blockiert'; end if;

  -- Nichts getroffen: entweder laengst blockiert, oder die Zeile gehoert inzwischen
  -- einem anderen. Beides ist ein gueltiger Ausgang — nur eben nicht unserer.
  select * into r from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id;
  if not found then return 'keine-reservierung'; end if;
  if r.fencing <> p_fencing then return 'uebernommen'; end if;
  return 'zustand-' || r.zustand;
end;
$$;

comment on function public.helmut_verstehen_ausgang_unbekannt(text, text, bigint, text) is
  'Stellt einen begonnenen Modellaufruf ohne belegtes Ergebnis sichtbar auf zustand=unbekannt (geschlossen blockiert, kein automatischer zweiter Aufruf). Nur fuer den eigenen Besitzer aus modell-laeuft.';

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
revoke all on function public.helmut_verstehen_speichere(text, text, bigint, jsonb, text)  from public, anon, authenticated;
revoke all on function public.helmut_verstehen_abschluss(text, text, bigint, text)         from public, anon, authenticated;
revoke all on function public.helmut_verstehen_freigabe(text, text, bigint, text)          from public, anon, authenticated;
revoke all on function public.helmut_verstehen_freigabe_ohne_aufruf(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.helmut_verstehen_ausgang_unbekannt(text, text, bigint, text) from public, anon, authenticated;
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
    execute 'grant execute on function public.helmut_verstehen_speichere(text, text, bigint, jsonb, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_abschluss(text, text, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_freigabe(text, text, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_freigabe_ohne_aufruf(text, text, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_verstehen_ausgang_unbekannt(text, text, bigint, text) to service_role';
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
