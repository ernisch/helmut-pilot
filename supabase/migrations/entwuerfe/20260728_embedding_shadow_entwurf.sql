-- ============================================================================
-- ENTWURF — NICHT FREIGEGEBEN, NICHT ANWENDEN (Sprint 22A, 2026-07-28)
-- ============================================================================
-- Dieses Verzeichnis (supabase/migrations/entwuerfe/) enthält Entwürfe, die
-- NICHT Teil des angewandten Migrationsstands sind. Anwendung ist erst nach
-- ausdrücklicher Betreiberfreigabe erlaubt (CLAUDE.md §5) und Gegenstand von
-- Sprint 22B. Rollback: 20260728_embedding_shadow_entwurf_rollback.sql.
--
-- Zweck: additive Shadow-Struktur für ein künftiges SEMANTISCHES Text-Embedding
-- je Wissensobjekt — getrennt von der bestehenden Spalte
-- knowledge_objects.embedding (die ein deterministischer Merkmalsvektor ist
-- und von dieser Struktur NIE überschrieben oder verändert wird).
--
-- Grundsätze (docs/embedding-architektur.md):
--  * mandantenlos (kein user_id) — derselbe Vektor gilt für Bund, Berlin,
--    Brandenburg und künftige Länder; Profil-Personalisierung bleibt in
--    profile_embeddings.
--  * vollständiger Datenvertrag: Art, Modell, Provider, Dimension,
--    Rezeptversion, Input-Hash, Zeiten, Status, Fehler- und Versuchsdaten.
--  * bestehendes Matching bleibt unverändert: kein Eingriff in
--    match_knowledge_objects, keine Änderung an knowledge_objects.
--  * Dimension bewusst NICHT im Spaltentyp fixiert (vector ohne Klammern),
--    damit ein Modellvergleich ohne Schemaänderung möglich ist; die
--    Pflichtprüfung der Dimension läuft über die Spalte dim + CHECK.

-- Sprint-22B-Schärfung: Eindeutigkeit gilt je (Objekt, Art, Modell, Dimension,
-- Rezept) — nicht nur je Objekt. Damit ist ein kontrollierter Modell-/
-- Dimensionswechsel abbildbar (alter und neuer Vektor koexistieren, bis der
-- alte gezielt entfernt wird), ohne die "genau ein aktiver Vektor je
-- Objekt+Modell+Dimension+Rezept"-Garantie zu verlieren.
create table if not exists public.knowledge_object_embeddings (
  knowledge_object_id text not null
    references public.knowledge_objects(id) on delete cascade,
  embedding_kind text not null default 'semantic_text'
    check (embedding_kind in ('semantic_text')),
  model text not null,
  provider text not null,
  dim integer not null check (dim > 0),
  recipe_version text not null,
  input_hash text not null,
  embedding vector,                        -- null solange status <> 'aktuell'
  status text not null default 'ausstehend'
    check (status in ('ausstehend', 'aktuell', 'fehlgeschlagen')),
  last_error text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (knowledge_object_id, embedding_kind, model, dim, recipe_version)
);

-- Statusabfragen des Backfills (ausstehend/fehlgeschlagen zuerst) ohne Vollscan.
create index if not exists knowledge_object_embeddings_status_idx
  on public.knowledge_object_embeddings (status);

comment on table public.knowledge_object_embeddings is
  'Shadow-Tabelle für semantische Text-Embeddings (Sprint 22A-Entwurf). Mandantenlos. Ersetzt NICHT knowledge_objects.embedding (deterministischer Merkmalsvektor).';
comment on column public.knowledge_object_embeddings.input_hash is
  'sha256 über Rezeptversion + kanonischen Eingangstext (lib/helmut/embedding-contract.js). Weicht der Hash vom aktuellen Objekt ab, ist das Embedding veraltet.';

-- RLS wie bei den übrigen mandantenlosen Wissenstabellen (Zugriff nur service_role).
alter table public.knowledge_object_embeddings enable row level security;

-- Kein ivfflat-Index im Entwurf: sinnvoll erst nach Modell-/Dimensionsentscheidung
-- und mit gefülltem Bestand (lists-Parameter hängt von der Zeilenzahl ab).
