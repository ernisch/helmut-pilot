-- Helmut — Quellenarchitektur · Understanding-Gate Shadow-Telemetrie
-- ==============================================================================
-- Ehrliche Shadow-Telemetrie des Understanding-Gate: je bewertetem Dokument/Cluster wird die
-- Gate-Entscheidung + Begruendung + Signale festgehalten, um im Shadow-Betrieb (Guard
-- HELMUT_UNDERSTANDING_GATE=shadow) die reale verstehen/zurueckstellen/parken-Verteilung, die
-- Cheap-Model-Promotionsrate und etwaige Fehlentscheidungen gegen das spaetere Understanding-
-- Ergebnis zu messen — OHNE den sichtbaren Nutzerpfad zu beruehren.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Wird erst mit dem Shadow-Messzeitraum
-- eingespielt. Rollback: 20260716_gate_shadow_telemetry_rollback.sql. Idempotent.
-- DSGVO: nur oeffentliche Schlagzeile-abgeleitete Signale + IDs, KEIN Volltext/PII.

begin;

create table if not exists public.gate_shadow_events (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  raw_document_id    text,                     -- Dokument-ID (rd-<hash>)
  source_id          text,                     -- Quelle
  package_id         text,                     -- zugeordnetes Paket (optional)
  tier               text,                     -- amtlich | kuratiert | medien
  gate_decision      text not null,            -- verstehen | zurueckstellen | parken | unveraendert | hygiene
  gate_reason        text,                     -- nachvollziehbarer Grund
  political_signals  jsonb,                    -- { level, hasInstitution, hasTopic, hasParty }
  amtlich            boolean,                  -- amtliches/strukturiertes Dokument
  geografie          text,                     -- Geografie-ID (optional)
  document_type      text,                     -- Dokumentart (PARDOK/Drucksache), falls vorhanden
  vorgang_id         text,                     -- Cluster/Vorgang
  understanding_result text,                   -- spaeteres Ergebnis: verstanden | skipped-* | (null)
  knowledge_object_id  text,                   -- entstandenes KO (falls verstanden)
  estimated_cost_usd numeric,                  -- tatsaechliche Kosten des Calls (falls voll verstanden)
  model              text                      -- eingesetztes Modell (gpt-5-mini/gpt-4o-mini/none)
);

create index if not exists idx_gate_shadow_events_created on public.gate_shadow_events(created_at);
create index if not exists idx_gate_shadow_events_decision on public.gate_shadow_events(gate_decision);
create index if not exists idx_gate_shadow_events_vorgang on public.gate_shadow_events(vorgang_id);
comment on table public.gate_shadow_events is 'Shadow-Telemetrie des Understanding-Gate (nur im Guard-Modus shadow beschrieben). Nur Signale/IDs, kein Volltext/PII. Dient der Messung von Verteilung/Promotionsrate/Fehlentscheidungen vor der scharfen Aktivierung.';

-- RLS: intern, service_role-only (konsistent mit document_findings). BEWUSST KEINE select-Policy.
do $$
begin
  execute 'alter table public.gate_shadow_events enable row level security';
  execute 'drop policy if exists gate_shadow_events_read on public.gate_shadow_events';
end $$;

commit;
