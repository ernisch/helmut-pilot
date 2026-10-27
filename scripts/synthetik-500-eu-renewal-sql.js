"use strict";
// Offline packaging of one finite corrective DO transaction. No DB/network client.
// The unchanged prior initializer is a pinned source, never called or installed.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const ROOT = path.resolve(__dirname, "..");
const SOURCE = "supabase/migrations/20261015125137_synthetik500_eu_daybook_rollforward_20261015.sql";
const SOURCE_SHA = "7c2baa861b045cda0c3480e93b179096408be539a4553f39546be21eeb9cefb4";
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
function proposal() {
  const original = fs.readFileSync(path.join(ROOT, SOURCE), "utf8");
  if (sha(original) !== SOURCE_SHA) throw Error("renewal-source-drift");
  let body = original.slice(original.indexOf("declare\n"), original.indexOf("\n$fn$;"));
  function replace(before, after) {
    if (body.split(before).length !== 2) throw Error("renewal-template-match:" + before.slice(0,60));
    body = body.replace(before, () => after);
  }
  replace("declare\n", `declare
  -- Deliberately inert. Materialize only after the specific operator GO and
  -- fresh external quiescence/infrastructure coverage/source review. A hash
  -- marker alone does not establish any of those facts.
  request constant jsonb := NULL;
  p_day text := request->>'day';
  p_expected_auth_md5 text := request->>'authMD5';
  p_expected_main_md5 text := request->>'mainMD5';
  p_expected_profiles_md5 text := request->>'profilesMD5';
  p_expected_counter_used integer := 0;
  p_expected_baseline_micro_usd bigint := 0;
  renewal_hash constant text := '${EU.ORDER_RENEWAL_HASH}';
  retained_books jsonb;
`);
  replace(`  -- SECURITY DEFINER current_user is the owner; it is not caller authority.
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
       ((nullif(current_setting('request.jwt.claims',true),''))::jsonb ->> 'role'))
       is distinct from 'service_role' then
    raise exception 'eu-daybook-caller';
  end if;`, `  if current_user <> 'postgres' or request is null
    or jsonb_typeof(request) is distinct from 'object'
    or (request-array['day','observedAtUTC','authMD5','mainMD5','profilesMD5','renewalHash','operatorGoSHA256','quiescenceSHA256','coverageSHA256'])<>'{}'::jsonb
    or (select count(*) from jsonb_object_keys(request))<>9
    or (request->>'renewalHash') is distinct from renewal_hash then
    raise exception 'eu-renewal-operator-bindings-required';
  end if;
  for k in select unnest(array['operatorGoSHA256','quiescenceSHA256','coverageSHA256']) loop
    if coalesce(request->>k,'') !~ '^[a-f0-9]{64}$' then
      raise exception 'eu-renewal-external-evidence-required';
    end if;
  end loop;`);
  replace("  now_utc := clock_timestamp();", `  now_utc := clock_timestamp();
  if coalesce(request->>'observedAtUTC','') !~ '^2026-10-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$'
    or (request->>'observedAtUTC')::timestamptz > now_utc
    or now_utc-(request->>'observedAtUTC')::timestamptz > interval '60 seconds' then
    raise exception 'eu-renewal-fresh-observation-required';
  end if;`);
  replace("  -- Historical journals/unknown U attempts remain byte-for-byte.", `  -- The same Blob quiet contract as starttor-original-state-witness: no
  -- missing defaults or unknown status. Historical terminal entries stay intact.
  if jsonb_typeof(auth->'pipelineLocks') is distinct from 'object'
    or jsonb_typeof(auth->'processRuns') is distinct from 'array' then
    raise exception 'eu-renewal-blob-state-unbound';
  end if;
  for item in select value from jsonb_each(auth->'pipelineLocks') loop
    if jsonb_typeof(item.value) is distinct from 'object'
      or jsonb_typeof(item.value->'expiresAt') is distinct from 'number' then
      raise exception 'eu-renewal-blob-lock-unbound';
    end if;
    n := (item.value->>'expiresAt')::numeric;
    if n<>trunc(n) or n not between 0 and 9007199254740991
      or n>extract(epoch from now_utc)*1000 then raise exception 'eu-renewal-blob-lock-live'; end if;
  end loop;
  for op in select value from jsonb_array_elements(auth->'processRuns') loop
    if jsonb_typeof(op) is distinct from 'object' or (op->>'status') is null
      or (op->>'status') not in ('ok','skipped','success','partial','failed','blocked','rolled_back')
      or jsonb_typeof(op->'finishedAt') is distinct from 'string'
      or coalesce(op->>'finishedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or not isfinite((op->>'finishedAt')::timestamptz) then
      raise exception 'eu-renewal-blob-process-not-terminal';
    end if;
  end loop;
  -- Historical journals/unknown U attempts remain byte-for-byte.`);
  replace("native_day < '2026-10-01'\n    or native_day > '2026-10-25'", "native_day < '2026-10-27'\n    or native_day > '2026-10-31'");
  replace("  changed := not (books ? native_day); target_cap := size+(case when changed then 1 else 0 end);", `  retained_books := books;
  changed := true;
  target_cap := 37 + (native_day::date-'2026-10-15'::date);`);
  const capacityStart = body.indexOf("  if size>47");
  const historyStart = body.indexOf("  -- Exactly the existing K.historie");
  if (capacityStart < 0 || historyStart <= capacityStart) throw Error("renewal-capacity-template");
  body = body.slice(0,capacityStart) + `  if size<>37 or cap<>37 or target_cap>53
    or exists(select from jsonb_object_keys(books) x(day) where day>'2026-10-15')
    or exists(select from generate_series('2026-09-09'::date,'2026-10-15'::date,interval '1 day') x(day)
      where not (books ? (day::date)::text)) then
    raise exception 'eu-renewal-exact-predecessor';
  end if;
  -- Reconstruct only genuinely unused missing days. Every day is checked
  -- against native counters AND retained Auth history under the same locks.
  -- Nonzero/unknown history stops; no guessed zero or old book overwrite.
  for native_day in select (x::date)::text from generate_series('2026-10-16'::date,p_day::date,interval '1 day') x loop
    if exists(select from public.llm_budget_counters c where c.scope='global' and c.day=native_day
      and (c.used is null or c.used<0)) then raise exception 'eu-renewal-counter-unknown'; end if;
    used := coalesce((select c.used from public.llm_budget_counters c where c.scope='global' and c.day=native_day),0);
    baseline := 0; billable := 0;
` + body.slice(historyStart);
  replace(`  if billable<>used or baseline<>p_expected_baseline_micro_usd then raise exception 'eu-daybook-history-counter'; end if;`, `  if billable<>used or used<>0 or baseline<>0 then raise exception 'eu-renewal-missing-day-not-proven-unused'; end if;`);
  replace(`  if changed then books := jsonb_set(books,array[native_day],expected_book,true); end if;`, `  books := jsonb_set(books,array[native_day],expected_book,true);
  end loop;
  native_day := p_day;
  used := 0; baseline := 0;
  if (select count(*) from jsonb_object_keys(books))<>target_cap
    or exists(select from jsonb_each(retained_books) r where books->r.key is distinct from r.value) then
    raise exception 'eu-renewal-retained-books-drift';
  end if;`);
  replace(`    next_auth := jsonb_set(next_auth,array['testKostenAuftrag','bookCapacity'],to_jsonb(target_cap),false);`, `    next_auth := jsonb_set(next_auth,array['testKostenAuftrag','bookCapacity'],to_jsonb(target_cap),false);
    next_auth := jsonb_set(next_auth,array['testKostenAuftrag','version'],'6'::jsonb,false);
    next_auth := jsonb_set(next_auth,array['testKostenAuftrag','orderRenewalHash'],to_jsonb(renewal_hash),true);`);
  const returned = body.indexOf("  return jsonb_build_object('status'");
  if (returned < 0) throw Error("renewal-return-template");
  body = body.slice(0,returned) + `  if (next_auth-'testKostenTage'-'testKostenAuftrag'-'_authStoreRevision')
       is distinct from (auth-'testKostenTage'-'testKostenAuftrag'-'_authStoreRevision')
    or ((next_auth->'testKostenAuftrag')-array['version','bookCapacity','orderRenewalHash'])
       is distinct from (orders-array['version','bookCapacity']) then
    raise exception 'eu-renewal-unauthorized-delta';
  end if;
end;`;
  return `-- INERT PROPOSAL: prepared finite extension; NOT APPROVED, never auto-execute.
-- Original economic hash ${EU.HASH}; all money/reserves/old books unchanged.
-- New date/capacity proposal ${EU.ORDER_RENEWAL_HASH}; ends 31Oct2026.
-- Requires GO, live quiescence through COMMIT/readback and complete cost coverage.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local search_path=pg_catalog;
do $eu_order_renewal$
${body}
$eu_order_renewal$;
commit;
`;
}
if (require.main === module) {
  if (process.argv.length !== 3 || !["--print-manifest","--print-sql"].includes(process.argv[2]))
    throw Error("offline-renewal-packaging-only");
  const sql = proposal();
  if (process.argv[2] === "--print-sql") process.stdout.write(sql);
  else console.log(JSON.stringify({
    status:"PREPARED_NOT_APPROVED_NOT_APPLIED", sourceSHA256:SOURCE_SHA,
    renewal:EU.ORDER_RENEWAL, renewalHash:EU.ORDER_RENEWAL_HASH,
    sqlSHA256:sha(sql), sqlBytes:Buffer.byteLength(sql), productionReady:false, paidTestGo:false
  }));
}
module.exports = { proposal, SOURCE_SHA };
