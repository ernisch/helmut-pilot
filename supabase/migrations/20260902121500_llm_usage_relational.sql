-- Helmut — W-2 für `llmUsage`: relationale Ablösung des Last-Write-Wins-Blobs
-- ==============================================================================
-- BEFUND (bewiesen, Sicherheitsrahmen §17.2): `recordLlmUsage` schreibt den
-- Nutzungslog als UNBEDINGTEN Lese-Ändere-Schreibe-Zyklus in den gemeinsamen
-- `helmut_store`-Blob (Voll-Upsert, last-write-wins). Zwei nebenläufige
-- KI-Aufrufe überschreiben sich lautlos ihren Eintrag. Dasselbe Problem wurde
-- für `processRuns` am 2026-07-27 relational gelöst
-- (20260727_process_runs_relational.sql); `llmUsage` bekam die Behandlung nie.
--
-- ZIEL: `public.llm_usage` wird die kanonische Ablage. Die Tabelle EXISTIERT
-- bereits in Production (angelegt lange vor diesem Sprint, seither ungenutzt und
-- leer — genau deshalb war der Fehlschluss „leere Tabelle = keine Aufrufe"
-- möglich, K4). Diese Migration ergänzt sie deshalb ADDITIV um die Felder, die
-- der Blob-Eintrag heute schon trägt, und um die Indizes der Tagesauswertung.
-- KEINE Spalte wird verändert, KEINE Zeile angefasst, KEINE Tabelle angelegt.
--
-- DIE ENTSCHEIDENDE NEUE SPALTE IST `kein_aufruf`. Sie trennt den
-- Budget-/Konfigurations-Skip (kein Modellaufruf, kostenfrei, aber
-- BEDARFSNACHWEIS) vom echten technischen Fehler. Ohne sie wären die 1.260
-- Budgetablehnungen des Messfensters relational nicht mehr von Azure-Fehlern zu
-- unterscheiden — und der gemessene Tagesbedarf p95 170 nicht mehr
-- rekonstruierbar (§16.2/§16.3).
--
-- DSGVO: ausschließlich technische Skalare, pseudonyme Kennungen und bereits
-- bereinigte, gekürzte Fehlercodes — dieselben Felder wie im Blob. KEIN Prompt,
-- KEINE Antwort, KEIN Secret, KEIN Dokumentinhalt.
--
-- FREIGABEPFLICHTIG — IN DIESEM SPRINT NICHT ANGEWENDET (CLAUDE.md §5).
-- Zusätzlich ist der Dual-Write per Flag `HELMUT_LLM_USAGE_RELATIONAL`
-- (Default AUS) gesperrt. Ohne Migration UND ohne Flag ist der Code ein reiner
-- No-Op und fällt fail-safe auf den Blob-Pfad zurück.
-- Rollback: rollback_20260902121500_llm_usage_relational.sql. Idempotent.
-- Transaktional geklammert: ein Abbruch hinterlässt keinen Teilzustand.

begin;

-- Schutznetz: die Migration wird ausschließlich gegen eine BESTEHENDE Tabelle
-- gefahren. Läuft sie versehentlich gegen ein Schema ohne `llm_usage`, bricht
-- sie sichtbar ab, statt eine halbe Struktur zu hinterlassen.
do $$
begin
  if to_regclass('public.llm_usage') is null then
    raise exception 'public.llm_usage fehlt — diese Migration ist rein additiv und setzt die Tabelle voraus';
  end if;
end $$;

-- SaaS-/Laufkontext, den `buildLlmUsageRecord` bereits schreibt und der bisher
-- beim Weg in die relationale Ablage verloren ginge.
alter table public.llm_usage add column if not exists tenant_id     text;
alter table public.llm_usage add column if not exists profile_id    text;
alter table public.llm_usage add column if not exists run_id        text;
alter table public.llm_usage add column if not exists pipeline_step text;

-- Der Nicht-Aufruf-Marker (Budget-/Konfigurations-Skip). Default `false`, damit
-- bestehende Zeilen ihre Bedeutung behalten: „nicht als Nicht-Aufruf markiert"
-- heißt genau das, was es bisher hieß.
alter table public.llm_usage add column if not exists kein_aufruf boolean not null default false;

-- Tagesauswertung: der Bedarf wird über `created_at` gefenstert und je Fachweg
-- (`call_type`) aufgeschlüsselt. Die vorhandenen Indizes decken nur
-- (politician_id|package_id|source_id, created_at) ab — ein reiner Zeitfenster-
-- Scan über den Tag läuft heute ohne Index.
create index if not exists llm_usage_created_idx           on public.llm_usage (created_at);
create index if not exists llm_usage_calltype_created_idx  on public.llm_usage (call_type, created_at);
-- Trennt in der Tagesbilanz die echten Aufrufe von den Nicht-Aufrufen, ohne die
-- ganze Tagesmenge zu lesen.
create index if not exists llm_usage_keinaufruf_created_idx on public.llm_usage (kein_aufruf, created_at);

comment on column public.llm_usage.kein_aufruf is
  'true = Budget-/Konfigurations-Skip: es gab KEINEN Modellaufruf und keine Kosten. Zaehlt als BEDARFSNACHWEIS, nie als Fehlerquote (Beleg: 500-funktionstest-sicherheitsrahmen §16.2).';
comment on table public.llm_usage is
  'Kanonische KI-Nutzungstelemetrie (W-2 fuer llmUsage). Loest den Last-Write-Wins-Blob-Ring helmut_store.data.llmUsage ab. Eine Zeile je Aufruf, reiner Insert OHNE on_conflict — der Schreibpfad ist ausdruecklich NICHT idempotent (korrigiert 02.09., adversariales Diff-Review): ein wiederholter Aufruf mit derselben id schlaegt fehl und wird als Telemetriefehler protokolliert, statt still zu ueberschreiben. Nur technische Skalare, pseudonyme Kennungen und bereinigte Fehlercodes — kein Prompt, keine Antwort, kein Secret. Dual-Write freigabepflichtig (HELMUT_LLM_USAGE_RELATIONAL, Default aus).';

-- Rechte entziehen (identisch zu 20260727_process_runs_relational.sql).
-- anon/authenticated existieren nur in Supabase; ein lokaler Prüfcluster kennt
-- sie nicht — dort ist die fehlende Rolle kein Fehler.
revoke all on table public.llm_usage from public;
do $$
begin
  begin
    execute 'revoke all on table public.llm_usage from anon, authenticated';
  exception when undefined_object then
    null;
  end;
  execute 'alter table public.llm_usage enable row level security';
end $$;

-- PostgREST-Schema-Cache nach additivem DDL neu laden (konsistent mit 20260716).
notify pgrst, 'reload schema';

commit;
