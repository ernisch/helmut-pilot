-- ============================================================================
-- ROLLBACK zum ENTWURF 20260728_embedding_shadow_entwurf.sql (Sprint 22A)
-- ============================================================================
-- Nur relevant, falls der Entwurf nach Freigabe angewendet wurde.
-- Vollständig verlustfrei gegenüber dem Bestand: die Tabelle ist additiv,
-- kein bestehendes Objekt und keine bestehende Spalte wird berührt.

drop table if exists public.knowledge_object_embeddings;
