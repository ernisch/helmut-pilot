-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint 23B-1) — NICHT ANWENDEN OHNE AUSDRÜCKLICHE
--     BETREIBERFREIGABE (CLAUDE.md §5). Dieses Repo spielt Migrationen NICHT
--     automatisch ein; Anwendung ausschließlich manuell durch einen Menschen
--     (psql / Supabase-Dashboard / MCP apply_migration).
--     Rollback: 20260728_matching_audit_rollback.sql (gleiches Verzeichnis).
--     Vorabprüfung + Reihenfolge: docs/matching-nachvollziehbarkeit.md §15.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Algorithmusunabhängige Auditpersistenz für Matching-Entscheidungen
-- (Roadmap-Punkt 23, Variante B+ aus Sprint 23A §10).
--
-- Zwei Rollen, sauber getrennt:
--   * matching_results  bleibt die OPERATIVE PROJEKTION — „was gilt jetzt".
--                       Bestehende Spalten, Kennungslogik und Schreibpfad
--                       bleiben unverändert; ergänzt werden ausschließlich
--                       additive Audit-Spalten.
--   * matching_runs     ist das AUDITPROTOKOLL — „wie kam es dazu". Eine Zeile
--                       je vollständig berechnetem Lauf, append-only, nach
--                       Abschluss fachlich unveränderlich (Trigger unten).
--
-- Grundsätze:
--  * ADDITIV: keine bestehende Tabelle, Spalte, Policy, Funktion oder
--    Ergebniskennung wird verändert oder gelöscht. Kein Backfill.
--  * ALGORITHMUSUNABHÄNGIG: engine_version, rezept_version und vektor_version
--    sind getrennte Felder. Eine spätere Matching-Engine schreibt in dieselbe
--    Struktur, ohne alte Ergebnisse zu überschreiben.
--  * SEMANTIK STRIKT GETRENNT: diese Struktur hat KEINEN Bezug zu
--    knowledge_object_embeddings (Sprint 22C1). rezept_version des heutigen
--    Pfades ist 'legacy_relevance_v1', vektor_version 'feature-hash-256-v1' —
--    beide machen von Anfang an unterscheidbar, was später ein semantisches
--    Rezept wäre. Semantische Duplikatähnlichkeit ist KEIN Relevanzsignal.
--  * KEINE erfundenen Teilscores: fachlicher, geografischer und
--    institutioneller Score existieren im heutigen Rezept nicht und bekommen
--    deshalb KEINE Spalte (Sprint 23A §4.4, „kein falsches Grün").
--  * KEINE Snapshots: keine Artikeltexte, keine Vektoren, keine Profilkopien
--    je Ergebnis. Nachvollziehbarkeit entsteht aus Hashes + kompakter
--    Rangliste.
--  * ECHTE TRANSAKTION statt Schreibreihenfolge: Laufabschluss,
--    Ergebnisprojektion und Ablösung passieren in EINEM Aufruf
--    (helmut_publish_matching_run, §3) und damit in EINER Transaktion.
--    Eine bloße Reihenfolge unabhängiger Schreibvorgänge wäre NICHT atomar:
--    matching_results wird in place überschrieben, ein Abbruch nach dem
--    Ergebnis-Upsert hätte den letzten vollständigen Stand also bereits
--    zerstört, ganz gleich in welcher Reihenfolge die Laufzeile folgt.
--  * KEINE SECURITY-DEFINER-Funktion: die Publish-Funktion läuft als
--    SECURITY INVOKER mit den Rechten des Aufrufers (service_role) — sie
--    schafft keine neue privilegierte Fläche, sondern nur eine
--    Transaktionsgrenze.
--
-- DSGVO: matching_runs ist mandantengebunden (user_id, FK auf profiles mit
-- ON DELETE CASCADE) und enthält ausschließlich öffentliche politische
-- Merkmale, Hashes und Kennungen — keine Freitext-PII, keine Artikeltexte.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · matching_runs — Auditprotokoll eines Matching-Laufs
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.matching_runs (
  id text primary key,

  -- Identität. user_id ist die kanonische Mandantenkennung (Sprint 23A §6a:
  -- Mandant = Profil = profiles.id). mandate_profile_id trägt heute denselben
  -- Wert und existiert als EIGENE Spalte, damit eine spätere Trennung von
  -- Mandant und Profil die Historie nicht migrieren muss. Bewusst OHNE FK auf
  -- mandate_profiles: ein Auditfehler darf einen regulären Matching-Lauf nicht
  -- gefährden (Integrität wird app-seitig erzwungen, assertTenantRows).
  user_id text not null references public.profiles(id) on delete cascade,
  mandate_profile_id text not null check (btrim(mandate_profile_id) <> ''),

  -- Herkunft des Laufs (verbindet mit process_runs/Telemetrie).
  pipeline_run_id text,
  ausloeser text not null default 'unbekannt'
    check (ausloeser in ('crawl', 'lage-check', 'pipeline', 'manuell', 'test', 'unbekannt')),

  -- Versionsachsen — DREI getrennte Achsen, absichtlich nicht zusammengefasst.
  --   engine_version : WER gerechnet hat (Implementierung/Runner)
  --   rezept_version : NACH WELCHER fachlichen Regel (Merkmale, Gewichte)
  --   vektor_version : MIT WELCHER Vektordarstellung (Art + Dimension)
  engine_version text not null,
  rezept_version text not null,
  vektor_version text not null,

  -- Eingangszustand.
  profil_hash text not null,
  kandidaten_hash text not null,          -- Hash über die Kandidaten-/Wissensobjektmenge
  schwellenwerte jsonb not null default '{}'::jsonb,
  eingabe_fingerabdruck text not null,    -- Idempotenzschlüssel (siehe §3)

  -- Lauf.
  gestartet_am timestamptz not null,
  beendet_am timestamptz,
  status text not null default 'laufend'
    check (status in ('laufend', 'vollstaendig', 'fehlgeschlagen')),
  fehler text,

  -- Zähler.
  kandidaten integer not null default 0 check (kandidaten >= 0),
  berechnet integer not null default 0 check (berechnet >= 0),
  veroeffentlicht integer not null default 0 check (veroeffentlicht >= 0),
  abgeloest integer not null default 0 check (abgeloest >= 0),

  -- Die eigentliche Historie: kompakte Rangliste des Laufs.
  -- [{ko_id, vorgang_id, result_id, rank, similarity, signale, ko_eingabe_hash,
  --   ko_version, begruendung}] — keine Texte, keine Vektoren.
  ergebnis jsonb not null default '[]'::jsonb,

  -- Wiederholung/Wiederaufnahme (die einzigen Felder, die an einem
  -- abgeschlossenen Lauf noch fortgeschrieben werden dürfen).
  wiederholungen integer not null default 0 check (wiederholungen >= 0),
  letzter_lauf_at timestamptz,
  wiederaufnahme_am timestamptz,

  created_at timestamptz not null default now(),

  -- Ein abgeschlossener Lauf braucht ein Ende; ein laufender hat keins.
  constraint matching_runs_abschluss_ck check (
    (status = 'vollstaendig' and beendet_am is not null)
    or (status <> 'vollstaendig')
  )
);

-- Historienabfragen je Mandant (jüngster Lauf zuerst).
create index if not exists matching_runs_user_idx
  on public.matching_runs (user_id, gestartet_am desc);

-- IDEMPOTENZ, von der Datenbank erzwungen: je Mandant kann es zu einem
-- fachlichen Eingang höchstens EINEN vollständigen Lauf geben. Ein zweiter
-- identischer Lauf findet diese Zeile und schreibt nur wiederholungen/
-- letzter_lauf_at fort — er erzeugt keine neue Generation.
-- Bewusst als TEILINDEX: unvollständige und fehlgeschlagene Läufe dürfen
-- denselben Fingerabdruck mehrfach tragen (sonst blockierte ein Absturz jede
-- Wiederholung).
create unique index if not exists matching_runs_fingerprint_uidx
  on public.matching_runs (user_id, eingabe_fingerabdruck)
  where status = 'vollstaendig';

-- Aufräum-/Diagnoseabfragen (steckengebliebene und fehlgeschlagene Läufe).
create index if not exists matching_runs_offen_idx
  on public.matching_runs (status, gestartet_am)
  where status <> 'vollstaendig';

-- ── Unveränderlichkeit abgeschlossener Läufe ────────────────────────────────
-- Ein Lauf mit status='vollstaendig' ist fachlich eingefroren. Erlaubt bleiben
-- ausschließlich technische Metadaten für Wiederholung, Wiederaufnahme und
-- nachträgliche Fehlerdokumentation. Damit kann auch ein späterer
-- Algorithmuswechsel alte Ergebnisse nicht überschreiben.
-- security invoker (Default) — KEIN SECURITY DEFINER nötig.
create or replace function public.helmut_matching_run_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'vollstaendig' then
    if new.status is distinct from old.status
       or new.user_id is distinct from old.user_id
       or new.mandate_profile_id is distinct from old.mandate_profile_id
       or new.pipeline_run_id is distinct from old.pipeline_run_id
       or new.ausloeser is distinct from old.ausloeser
       or new.engine_version is distinct from old.engine_version
       or new.rezept_version is distinct from old.rezept_version
       or new.vektor_version is distinct from old.vektor_version
       or new.profil_hash is distinct from old.profil_hash
       or new.kandidaten_hash is distinct from old.kandidaten_hash
       or new.schwellenwerte is distinct from old.schwellenwerte
       or new.eingabe_fingerabdruck is distinct from old.eingabe_fingerabdruck
       or new.gestartet_am is distinct from old.gestartet_am
       or new.beendet_am is distinct from old.beendet_am
       or new.kandidaten is distinct from old.kandidaten
       or new.berechnet is distinct from old.berechnet
       or new.veroeffentlicht is distinct from old.veroeffentlicht
       or new.abgeloest is distinct from old.abgeloest
       or new.ergebnis is distinct from old.ergebnis
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'matching_runs: abgeschlossener Lauf % ist unveraenderlich (nur wiederholungen, letzter_lauf_at, wiederaufnahme_am und fehler duerfen fortgeschrieben werden)',
        old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

alter function public.helmut_matching_run_immutable() set search_path = public, pg_temp;
revoke all on function public.helmut_matching_run_immutable() from public, anon, authenticated;

drop trigger if exists matching_runs_immutable on public.matching_runs;
create trigger matching_runs_immutable
  before update on public.matching_runs
  for each row execute function public.helmut_matching_run_immutable();

-- ── Zugriffsschutz ──────────────────────────────────────────────────────────
-- Mandantengebundene Tabelle → dasselbe Muster wie matching_results
-- (tenant_isolation gegen helmut_current_tenant()), aber STRENGER:
-- authenticated bekommt ausschließlich SELECT, kein INSERT/UPDATE/DELETE und
-- kein TRUNCATE (Befund M-6 aus Sprint 23A entsteht auf dieser Tabelle gar
-- nicht erst). anon bekommt weder Grant noch Policy.
--
-- EHRLICH: service_role besitzt BYPASSRLS und umgeht diese Policy vollständig.
-- Der gesamte produktive Zugriff läuft über service_role — durchsetzend sind
-- deshalb die App-Guards (assertTenant/assertTenantRows plus verpflichtender
-- user_id=eq.<mandant>-Filter), NICHT diese Policy. Die Policy schützt
-- ausschließlich normale Rollen.
alter table public.matching_runs enable row level security;
revoke all on table public.matching_runs from public, anon, authenticated;
grant select on table public.matching_runs to authenticated;

drop policy if exists matching_runs_tenant_read on public.matching_runs;
create policy matching_runs_tenant_read on public.matching_runs
  for select to authenticated
  using (user_id = public.helmut_current_tenant());

comment on table public.matching_runs is
  'Auditprotokoll eines Matching-Laufs (Roadmap-Punkt 23, Sprint 23B-1). Append-only; status=vollstaendig ist fachlich unveraenderlich (Trigger matching_runs_immutable). Algorithmusunabhaengig: engine_version/rezept_version/vektor_version sind getrennt. KEIN Bezug zu knowledge_object_embeddings.';
comment on column public.matching_runs.mandate_profile_id is
  'Kennung des Mandatsprofils. Heute identisch mit user_id (ein Profil je Mandant, mandate_profiles.PK = user_id). Eigene Spalte, damit eine spaetere Trennung von Mandant und Profil die Historie nicht migrieren muss. Bewusst ohne FK.';
comment on column public.matching_runs.eingabe_fingerabdruck is
  'sha256 ueber die kanonische Serialisierung des fachlichen Eingangs (Mandant, Profil, Profilhash, Engine-/Rezept-/Vektorversion, Schwellenwerte, sortierte Kandidatenmenge mit Aehnlichkeit und Eingabehash). Unabhaengig von Zeitstempeln, Lauf-IDs und Eingabereihenfolge. Definition: lib/helmut/matching-contract.js.';
comment on column public.matching_runs.ergebnis is
  'Kompakte Rangliste des Laufs. Deterministisch sortiert (rank aufsteigend, dann knowledge_object_id). Keine Artikeltexte, keine Vektoren, keine Profilkopien.';
comment on column public.matching_runs.status is
  'laufend = gestartet, Ausgang unbekannt (ein Absturz hinterlaesst diesen Zustand und gilt NIE als aktuell) · vollstaendig = abgeschlossen und unveraenderlich · fehlgeschlagen = mit dokumentiertem Fehler beendet. Ein uebersprungener Lauf (Sperre gehalten oder identischer Eingang) erzeugt bewusst KEINE Zeile — es wurde nichts berechnet, was zu protokollieren waere.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · matching_results — additive Erweiterung der operativen Projektion
-- ═══════════════════════════════════════════════════════════════════════════
-- Alle Spalten sind NULLABLE ohne Default-Backfill: die 287 Bestandszeilen
-- behalten NULL und sagen damit ehrlich „vor der Auditpersistenz berechnet".
-- Ausnahme: aktuell (boolean) bekommt Default true, weil der Bestand
-- definitionsgemaess der aktuelle Stand ist.

alter table public.matching_results
  add column if not exists run_id text
    references public.matching_runs(id) on delete set null,
  add column if not exists profil_hash text,
  add column if not exists ko_eingabe_hash text,
  add column if not exists ko_version integer,
  add column if not exists engine_version text,
  add column if not exists rezept_version text,
  add column if not exists vektor_version text,
  add column if not exists eingabe_fingerabdruck text,
  add column if not exists berechnet_am timestamptz,
  add column if not exists aktuell boolean not null default true,
  add column if not exists abgeloest_am timestamptz,
  add column if not exists signale jsonb not null default '{}'::jsonb,
  add column if not exists begruendung text,
  add column if not exists updated_at timestamptz;

-- Bewusst NICHT ergänzt (Begründung: docs/matching-nachvollziehbarkeit.md §14.3)
--   fachlicher / geografischer / institutioneller Teilscore
--     -> existieren im Rezept legacy_relevance_v1 nicht (Sprint 23A §4.4).
--        Leere Spalten waeren eine Falschaussage.
--   ausschlussgruende
--     -> die RPC match_knowledge_objects liefert die Top-N unbedingt; es wird
--        app-seitig kein Kandidat verworfen. Die Spalte waere dauerhaft leer.
--   mandate_profile_id / tenant_id
--     -> user_id IST die kanonische Mandanten- und Profilkennung; die
--        Profilkennung steht an der Laufzeile. Keine redundante Identitaetskopie.
--   ein updated_at-TRIGGER
--     -> bewusst KEIN Trigger: das Verhalten der bestehenden Tabelle bleibt
--        unveraendert. updated_at wird ausschliesslich vom Auditpfad explizit
--        gesetzt; ohne Auditpersistenz bleibt es NULL (ehrlich).

-- Die bisherige Codekonvention „eine Zeile je (Mandant, Wissensobjekt)"
-- (Kennung mr-<mandant>-<vorgang>) wird zur Zusicherung der Datenbank.
-- VORAUSSETZUNG, vor der Anwendung zu pruefen (§15 der Doku):
--   select user_id, knowledge_object_id, count(*) from public.matching_results
--    group by 1,2 having count(*) > 1;   -- muss 0 Zeilen liefern
-- Sprint 23A hat 0 Duplikate ueber 287 Zeilen gemessen. Findet die Migration
-- doch eines, bricht sie fail-closed ab und aendert nichts.
create unique index if not exists matching_results_tenant_ko_uidx
  on public.matching_results (user_id, knowledge_object_id);

-- „Welche Ergebnisse stammen aus Lauf X?"
create index if not exists matching_results_run_idx
  on public.matching_results (run_id);

comment on column public.matching_results.run_id is
  'Lauf, der diesen Wert zuletzt geschrieben hat (matching_runs.id). NULL = vor Sprint 23B-1 oder ohne aktivierte Auditpersistenz berechnet. ON DELETE SET NULL, damit eine DSGVO-Loeschung der Historie die Projektion nicht mitreisst.';
comment on column public.matching_results.aktuell is
  'true = Teil der aktuellen Trefferliste des letzten vollstaendigen Laufs. false + abgeloest_am = aus der Trefferliste gefallen, Zeile bleibt zur Nachvollziehbarkeit erhalten (es wird NIE geloescht).';
comment on column public.matching_results.signale is
  'Ausschliesslich REAL berechnete Signale: legacy_vektor (= similarity) sowie die tatsaechlich getroffenen Merkmale (ausschuss/partei/wahlkreis/thema). Keine erfundenen Teilscores, kein semantischer Wert.';
comment on column public.matching_results.begruendung is
  'Deterministische Kurzbegruendung aus belegten Signalen (lib/helmut/matching-begruendung.js, ohne KI). NULL, wenn kein Signal belegt ist — es wird nichts erfunden. Wird in Sprint 23B-1 gespeichert, aber NICHT angezeigt (sichtbare Erklaerung: Sprint 23C).';
comment on column public.matching_results.berechnet_am is
  'Zeitpunkt der letzten Berechnung. Behebt den Befund, dass created_at beim ERSTEN Auftreten des Paares einfriert und spaetere Neuberechnungen unsichtbar bleiben (Sprint 23A §5.4).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · Atomare Veröffentlichung
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM eine Datenbankfunktion nötig ist (und eine Schreibreihenfolge NICHT
-- genügt): matching_results wird per Upsert IN PLACE überschrieben. Sobald der
-- Ergebnis-Upsert gelandet ist, sind die vorherigen Werte weg — unabhängig
-- davon, was danach mit der Laufzeile geschieht. Drei aufeinanderfolgende,
-- unabhängige Schreibvorgänge könnten also sehr wohl einen Zustand
-- hinterlassen, in dem die operative Projektion bereits ersetzt ist, der Lauf
-- aber nie vollständig wurde. Genau das ist verboten.
--
-- Die Funktion fasst die drei Schritte in EINEN Aufruf und damit in EINE
-- Transaktion: entweder ist der Lauf vollständig UND die Projektion
-- veröffentlicht UND die Ablösung markiert — oder nichts davon.

create or replace function public.helmut_publish_matching_run(
  p_run_id text,
  p_user_id text,
  p_results jsonb,
  p_abgeloest_am timestamptz default now()
)
returns jsonb
language plpgsql
-- BEWUSST SECURITY INVOKER (Default): der Aufrufer ist service_role und hat auf
-- beiden Tabellen ohnehin alle Rechte. Die Funktion soll ausschliesslich eine
-- Transaktionsgrenze ziehen, KEINE Rechte verleihen.
as $$
declare
  v_run public.matching_runs%rowtype;
  v_anzahl integer;
  v_abgeloest integer := 0;
begin
  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'helmut_publish_matching_run: kein Mandant uebergeben'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_run_id is null or btrim(p_run_id) = '' then
    raise exception 'helmut_publish_matching_run: keine Laufkennung uebergeben'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'helmut_publish_matching_run: p_results muss ein jsonb-Array sein'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Serialisiert Veroeffentlichungen DESSELBEN Mandanten innerhalb der
  -- Datenbank — unabhaengig von der App-seitigen Sperre und ohne eine fremde
  -- Tabelle zu sperren. Wird beim Commit oder Rollback automatisch frei.
  perform pg_advisory_xact_lock(hashtext('helmut_matching_publish:' || p_user_id));

  -- Nur ein LAUFENDER Lauf des richtigen Mandanten darf veroeffentlicht werden.
  -- Damit ist ausgeschlossen, dass ein fehlgeschlagener Lauf nachtraeglich
  -- wiederbelebt oder ein bereits vollstaendiger Lauf erneut veroeffentlicht
  -- wird. Eine fremde Laufkennung findet schlicht keine Zeile.
  select * into v_run
    from public.matching_runs
   where id = p_run_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'helmut_publish_matching_run: Lauf % fuer Mandant % nicht gefunden', p_run_id, p_user_id
      using errcode = 'no_data_found';
  end if;
  if v_run.status <> 'laufend' then
    raise exception 'helmut_publish_matching_run: Lauf % ist im Zustand %, nur ein laufender Lauf ist veroeffentlichbar', p_run_id, v_run.status
      using errcode = 'check_violation';
  end if;

  -- Mandantenpruefung JEDER Ergebniszeile. Ein gemischter Stapel wird
  -- abgelehnt, bevor irgendetwas geschrieben wird.
  if exists (select 1 from jsonb_array_elements(p_results) e
              where coalesce(e->>'user_id', '') <> p_user_id) then
    raise exception 'helmut_publish_matching_run: mandantenuebergreifender Schreibversuch blockiert (erwartet %)', p_user_id
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_results) e
              where coalesce(e->>'run_id', '') <> p_run_id) then
    raise exception 'helmut_publish_matching_run: Ergebniszeile verweist auf einen fremden Lauf'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_results) e
              where coalesce(btrim(e->>'id'), '') = ''
                 or coalesce(btrim(e->>'knowledge_object_id'), '') = '') then
    raise exception 'helmut_publish_matching_run: Ergebniszeile ohne Kennung oder Wissensobjekt'
      using errcode = 'check_violation';
  end if;

  v_anzahl := jsonb_array_length(p_results);

  -- Abloesung VOR dem Schreiben zaehlen: die Zaehler der Laufzeile muessen
  -- feststehen, bevor sie auf 'vollstaendig' geht (danach ist sie
  -- unveraenderlich).
  if v_anzahl > 0 then
    select count(*) into v_abgeloest
      from public.matching_results m
     where m.user_id = p_user_id
       and m.aktuell
       and not exists (select 1 from jsonb_array_elements(p_results) e
                        where e->>'knowledge_object_id' = m.knowledge_object_id);
  end if;

  -- SCHRITT 1 (innerhalb der Transaktion ZUERST): Lauf abschliessen.
  -- Die Reihenfolge INNERHALB der Transaktion ist frei waehlbar, weil ohnehin
  -- alles gemeinsam sichtbar wird. Der Abschluss steht zuerst, damit der
  -- Riegel helmut_matching_result_run_complete (unten) bei jeder einzelnen
  -- Ergebniszeile bereits einen vollstaendigen Lauf vorfindet.
  update public.matching_runs
     set status = 'vollstaendig',
         beendet_am = now(),
         veroeffentlicht = v_anzahl,
         abgeloest = v_abgeloest
   where id = p_run_id and user_id = p_user_id;

  -- SCHRITT 2: operative Projektion schreiben. created_at bleibt bewusst
  -- unangetastet (bestehendes Verhalten: friert beim ERSTEN Auftreten ein).
  if v_anzahl > 0 then
    insert into public.matching_results as m (
      id, user_id, knowledge_object_id, vorgang_id, similarity, rank,
      matched_features, filters, run_id, profil_hash, ko_eingabe_hash, ko_version,
      engine_version, rezept_version, vektor_version, eingabe_fingerabdruck,
      berechnet_am, aktuell, abgeloest_am, signale, begruendung, updated_at)
    select
      e->>'id',
      e->>'user_id',
      e->>'knowledge_object_id',
      e->>'vorgang_id',
      nullif(e->>'similarity', '')::numeric,
      nullif(e->>'rank', '')::integer,
      case when jsonb_typeof(e->'matched_features') = 'array' then e->'matched_features' else '[]'::jsonb end,
      case when jsonb_typeof(e->'filters') = 'object' then e->'filters' else '{}'::jsonb end,
      e->>'run_id',
      e->>'profil_hash',
      e->>'ko_eingabe_hash',
      nullif(e->>'ko_version', '')::integer,
      e->>'engine_version',
      e->>'rezept_version',
      e->>'vektor_version',
      e->>'eingabe_fingerabdruck',
      nullif(e->>'berechnet_am', '')::timestamptz,
      true,
      null,
      case when jsonb_typeof(e->'signale') = 'object' then e->'signale' else '{}'::jsonb end,
      e->>'begruendung',
      nullif(e->>'updated_at', '')::timestamptz
    from jsonb_array_elements(p_results) e
    on conflict (id) do update set
      user_id = excluded.user_id,
      knowledge_object_id = excluded.knowledge_object_id,
      vorgang_id = excluded.vorgang_id,
      similarity = excluded.similarity,
      rank = excluded.rank,
      matched_features = excluded.matched_features,
      filters = excluded.filters,
      run_id = excluded.run_id,
      profil_hash = excluded.profil_hash,
      ko_eingabe_hash = excluded.ko_eingabe_hash,
      ko_version = excluded.ko_version,
      engine_version = excluded.engine_version,
      rezept_version = excluded.rezept_version,
      vektor_version = excluded.vektor_version,
      eingabe_fingerabdruck = excluded.eingabe_fingerabdruck,
      berechnet_am = excluded.berechnet_am,
      aktuell = true,
      abgeloest_am = null,
      signale = excluded.signale,
      begruendung = excluded.begruendung,
      updated_at = excluded.updated_at;

    -- SCHRITT 3: abgeloeste Zeilen markieren. Es wird NIE geloescht.
    update public.matching_results m
       set aktuell = false,
           abgeloest_am = coalesce(p_abgeloest_am, now())
     where m.user_id = p_user_id
       and m.aktuell
       and not exists (select 1 from jsonb_array_elements(p_results) e
                        where e->>'knowledge_object_id' = m.knowledge_object_id);
  end if;

  return jsonb_build_object(
    'run_id', p_run_id,
    'status', 'vollstaendig',
    'veroeffentlicht', v_anzahl,
    'abgeloest', v_abgeloest
  );
end;
$$;

alter function public.helmut_publish_matching_run(text, text, jsonb, timestamptz)
  set search_path = public, pg_temp;
revoke all on function public.helmut_publish_matching_run(text, text, jsonb, timestamptz)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_publish_matching_run(text, text, jsonb, timestamptz) to service_role';
  end if;
end $$;

comment on function public.helmut_publish_matching_run(text, text, jsonb, timestamptz) is
  'Atomare Veroeffentlichung eines Matching-Laufs (Sprint 23B-1): Laufabschluss, Ergebnisprojektion und Abloesung in EINER Transaktion. Nur ein laufender Lauf des uebergebenen Mandanten ist veroeffentlichbar; jede Ergebniszeile wird auf Mandant und Laufkennung geprueft. SECURITY INVOKER — die Funktion verleiht keine Rechte, sie zieht nur eine Transaktionsgrenze. service_role umgeht RLS ohnehin; die Mandantentrennung erzwingen die Pruefungen in dieser Funktion UND die App-Guards.';

-- ── Riegel: die operative Projektion zeigt nur auf vollständige Läufe ───────
-- Damit ist datenbankseitig ausgeschlossen, dass eine matching_results-Zeile
-- auf einen laufenden oder fehlgeschlagenen Lauf verweist — die Anforderung
-- gilt also nicht nur „laut Code", sondern ist erzwungen.
-- Feuert nur bei INSERT und bei einem UPDATE, das run_id ausdruecklich setzt.
-- Der Legacy-Pfad (ohne Auditpersistenz) schreibt kein run_id: dort endet der
-- Riegel sofort mit NULL und aendert nichts am Verhalten.
create or replace function public.helmut_matching_result_run_complete()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if new.run_id is null then
    return new;
  end if;
  select status into v_status from public.matching_runs where id = new.run_id;
  if v_status is null then
    raise exception 'matching_results: unbekannte Laufkennung %', new.run_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'vollstaendig' then
    raise exception 'matching_results.run_id % zeigt auf einen Lauf im Zustand % — die operative Projektion darf ausschliesslich auf einen vollstaendig veroeffentlichten Lauf verweisen', new.run_id, v_status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.helmut_matching_result_run_complete() set search_path = public, pg_temp;
revoke all on function public.helmut_matching_result_run_complete() from public, anon, authenticated;

drop trigger if exists matching_results_run_complete on public.matching_results;
create trigger matching_results_run_complete
  before insert or update of run_id on public.matching_results
  for each row execute function public.helmut_matching_result_run_complete();

commit;
