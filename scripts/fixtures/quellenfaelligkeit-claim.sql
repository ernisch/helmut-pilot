-- In einer leeren isolierten DB nach den zwei Queue-Migrationen anwenden.
begin;
do $test$
declare
  v_tag timestamptz := date_trunc('day', now(), 'UTC');
  v_auftrag uuid;
  v_erster timestamptz;
  v_rpc regprocedure := 'public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)'::regprocedure;
begin
  assert has_function_privilege('service_role', v_rpc, 'execute');
  assert not has_function_privilege('anon', v_rpc, 'execute');
  assert not has_function_privilege('authenticated', v_rpc, 'execute');
  assert not (select prosecdef from pg_proc where oid = v_rpc);

  insert into public.helmut_jobs(job_type,idempotency_key,freshness_window,priority,due_at,first_due_at)
    values ('source_fetch','offiziell','2026-11-19T00Z',40,v_tag,v_tag),
      ('source_fetch','neu','2026-11-19T00Z',60,v_tag,v_tag),
      ('source_fetch','alt','2026-11-18T00Z',40,v_tag,v_tag - interval '1 day'),
      ('source_fetch','vertagt','2026-11-18T00Z',35,now() + interval '1 minute',v_tag - interval '1 day'),
      ('document_understanding','analyse','2026-11-19T00Z',0,v_tag,v_tag);
  select id, first_due_at into strict v_auftrag, v_erster
    from public.helmut_claim_quellenfaelligkeit('b',60000,true) where idempotency_key = 'alt';
  assert v_erster = v_tag - interval '1 day';
  assert (select idempotency_key from public.helmut_claim_quellenfaelligkeit('a',60000,false)) = 'offiziell';
  assert (select idempotency_key from public.helmut_claim_quellenfaelligkeit('c',60000,false)) = 'neu';
  assert (select count(*) from public.helmut_claim_quellenfaelligkeit('d',60000,true)) = 0;
  update public.helmut_jobs set lease_expires_at=now()-interval '1 second' where id=v_auftrag;
  assert (select attempts from public.helmut_claim_quellenfaelligkeit('e',60000,true) where id=v_auftrag) = 2;
  assert not (select uebernommen from public.helmut_finish_job(v_auftrag,'b',true,null,0));
  assert (select uebernommen from public.helmut_finish_job(v_auftrag,'e',true,null,0));
  assert not (select uebernommen from public.helmut_finish_job(v_auftrag,'e',true,null,0));
  assert (select count(*) from public.helmut_claim_quellenfaelligkeit('f',60000,true)) = 0;
  assert (select first_due_at from public.helmut_jobs where id=v_auftrag) = v_erster;
  raise notice 'PASS Rechte, amtlicher Vorrang, Altanteil, neue Fälligkeit, Sperren, atomarer Abschluss und ursprüngliche Fälligkeit';
end
$test$;
rollback;
