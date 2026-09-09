-- Einmaliger, ausdruecklich freigegebener Verbrauchsnachtrag. Kein Modellaufruf.
-- Azure Monitor Export 07:00:41 UTC, Fenster 06:30 bis 06:33 UTC:
-- 2 gpt-5-mini Requests (beide HTTP 200), 4566 Eingabe-, 830 Ausgabetokens.
-- Abzug des vorhandenen B023 Belegs: 888 / 173. Rest: 3678 / 657.
-- SHA256 Metrics.xlsx: 5c2d7480f8a38e236edfa045e3c60d6e374a878fbf7fffc3443c962bc067650a
-- Standardmaessig reine Vorpruefung. Ausfuehrung nur mit anwenden = true.
BEGIN;
SET LOCAL statement_timeout = '8000ms';
SET LOCAL lock_timeout = '2000ms';
DO $abgleich$
DECLARE
  anwenden boolean := false;
  vorher jsonb;
  nachher jsonb;
  retained jsonb;
  beleg jsonb;
  zaehler integer;
  anzahl integer;
  bekannte numeric;
BEGIN
  IF (now() AT TIME ZONE 'UTC')::date <> DATE '2026-09-09' THEN
    RAISE EXCEPTION 'abgleich-falscher-tag';
  END IF;
  SELECT used INTO STRICT zaehler FROM llm_budget_counters
    WHERE day = '2026-09-09' AND scope = 'global' FOR SHARE;
  IF zaehler <> 86 THEN RAISE EXCEPTION 'abgleich-zaehler-veraendert'; END IF;
  SELECT data INTO STRICT vorher FROM helmut_store WHERE id = 'main-auth' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM pipeline_locks WHERE expires_at > now())
    OR EXISTS (SELECT 1 FROM helmut_jobs WHERE lease_expires_at > now()
      OR (status = 'laeuft' AND (lease_expires_at IS NULL OR lease_expires_at < now())))
    OR EXISTS (SELECT 1 FROM process_runs WHERE status = 'running'
      AND started_at > now() - interval '30 minutes') THEN
    RAISE EXCEPTION 'abgleich-verarbeitung-aktiv';
  END IF;
  IF jsonb_array_length(vorher->'llmUsage') <> 5000
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(vorher->'llmUsage') u
      WHERE u->>'id' = 'llm-reconciled-nachlauf500-34319397919') THEN
    RAISE EXCEPTION 'abgleich-ring-oder-nachtrag-veraendert';
  END IF;
  SELECT count(*), sum((u->>'estimatedCost')::numeric) INTO anzahl, bekannte
    FROM jsonb_array_elements(vorher->'llmUsage') u
    WHERE left(u->>'createdAt',10) = '2026-09-09';
  IF anzahl <> 85 OR bekannte IS DISTINCT FROM 0.201613 THEN
    RAISE EXCEPTION 'abgleich-kostenbestand-veraendert';
  END IF;
  SELECT count(*) INTO anzahl FROM jsonb_array_elements(vorher->'llmUsage') u
    WHERE u->>'createdAt' >= '2026-09-09T06:30:00' AND u->>'createdAt' < '2026-09-09T06:33:00';
  IF anzahl <> 1 OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(vorher->'llmUsage') u
    WHERE u->>'id' = 'llm-1788935478997-xmlvyr'
      AND u->>'model' = 'gpt-5-mini' AND u->>'callType' = 'lageBriefing'
      AND u->>'promptTokens' = '888' AND u->>'completionTokens' = '173'
      AND u->>'estimatedCost' = '0.000568'
  ) THEN RAISE EXCEPTION 'abgleich-ausgangsbeleg-veraendert'; END IF;
  -- Dieselbe Grenze wie storage.writeAuthStore: neu + erste 4999 Altbelege.
  -- Der aelteste, aus dem Ring fallende Beleg darf nicht zum heutigen Tag gehoeren.
  IF left(vorher->'llmUsage'->4999->>'createdAt',10) >= '2026-09-09' THEN
    RAISE EXCEPTION 'abgleich-ringende-im-heutigen-fenster';
  END IF;
  SELECT jsonb_agg(value ORDER BY ord) INTO retained
    FROM jsonb_array_elements(vorher->'llmUsage') WITH ORDINALITY a(value,ord) WHERE ord < 5000;
  beleg := jsonb_build_object(
    'id','llm-reconciled-nachlauf500-34319397919',
    'createdAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'model','gpt-5-mini','callType','lageBriefing','pipelineStep','lageBriefing',
    'runId','nachlauf500-34319397919','tenantId',NULL,'profileId',NULL,
    'politicianId',NULL,'userId',NULL,'sourceId',NULL,'packageId',NULL,
    'vorgangId',NULL,'knowledgeObjectId',NULL,'durationMs','unknown',
    'promptTokens',3678,'completionTokens',657,'totalTokens',4335,
    'estimatedCost',0.002234,'success',false,
    'error','reconstructed-usage-text-outcome-unavailable',
    'reconciliation',jsonb_build_object('approved',true,'source','Azure Monitor aggregate export',
      'sourceSha256','5c2d7480f8a38e236edfa045e3c60d6e374a878fbf7fffc3443c962bc067650a',
      'windowStart','2026-09-09T06:30:00Z','windowEnd','2026-09-09T06:33:00Z',
      'providerRequests',2,'providerHttpStatus',200,'inputTokensTotal',4566,'outputTokensTotal',830,
      'subtractedReceiptId','llm-1788935478997-xmlvyr','originalResponseKnown',false,
      'tenantAssignmentKnown',false,'ringTailHash',md5((vorher->'llmUsage'->4999)::text)));
  nachher := jsonb_set(vorher,'{llmUsage}',jsonb_build_array(beleg) || retained);
  IF nachher - 'llmUsage' IS DISTINCT FROM vorher - 'llmUsage'
    OR jsonb_array_length(nachher->'llmUsage') <> 5000 THEN
    RAISE EXCEPTION 'abgleich-unzulaessige-nebenwirkung';
  END IF;
  IF anwenden THEN
    UPDATE helmut_store SET data = nachher, updated_at = clock_timestamp() WHERE id = 'main-auth';
  END IF;
END
$abgleich$;
SELECT now() AS checked_at,
  (SELECT used FROM llm_budget_counters WHERE day='2026-09-09' AND scope='global') AS reservations,
  count(*) AS receipts, sum((u->>'estimatedCost')::numeric) AS estimated_usd,
  count(*) FILTER (WHERE u->>'id'='llm-reconciled-nachlauf500-34319397919') AS reconciliation_count
FROM helmut_store s,jsonb_array_elements(s.data->'llmUsage') u
WHERE s.id='main-auth' AND left(u->>'createdAt',10)='2026-09-09';
COMMIT;
