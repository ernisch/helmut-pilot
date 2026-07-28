-- ============================================================================
-- ROLLBACK zu 20260728_embedding_shadow.sql (Sprint 22C1)
-- ============================================================================
-- Vollständig verlustfrei gegenüber dem Bestand: Tabelle und Funktion sind
-- additiv — kein bestehendes Objekt, keine bestehende Spalte, keine bestehende
-- Funktion und kein bestehender Lock-Mechanismus (20260719) wird berührt.
-- Der Teilindex, der Status-Index und der updated_at-Trigger fallen mit der
-- Tabelle. Verlust sind ausschließlich die Shadow-Embeddings selbst — sie sind
-- jederzeit aus den Wissensobjekten reproduzierbar (Rezept + Modell).

drop function if exists public.helmut_renew_pipeline_lock(text, text, bigint);
drop table if exists public.knowledge_object_embeddings;
