\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='1s';
-- Physical root is 606B, not expanded Auth/history. Never export a full graph.
SELECT jsonb_build_object(
 'rows',(SELECT count(*) FROM public.helmut_store WHERE id='main-auth'),
 'physicalBytes',(SELECT octet_length(data::text) FROM public.helmut_store WHERE id='main-auth'),
 'sha',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') FROM public.helmut_store WHERE id='main-auth'),
 'data',(SELECT data FROM public.helmut_store WHERE id='main-auth'),
 'ledgerRows',(SELECT count(*) FROM public.llm_usage WHERE usage_store_id='main-auth'),
 'referencedLedgerRows',(SELECT count(*) FROM public.llm_usage u JOIN public.helmut_store s
   ON s.id=u.usage_store_id AND u.usage_generation=s.data#>>'{_llmUsageRef,generation}' WHERE s.id='main-auth'));
ROLLBACK;
