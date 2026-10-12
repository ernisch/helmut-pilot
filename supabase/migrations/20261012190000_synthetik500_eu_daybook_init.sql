-- DEV source only. Applying this migration / invoking its writer needs separate
-- current native approval. This is never called by a reader or a model path.
-- One closed operation: missing CURRENT UTC EU book + minimum book capacity.
-- Caller must set statement_timeout before the outer RPC statement (15s max);
-- a function SET alone does not start a new timer for an existing statement.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';

create function public.helmut_synthetik500_eu_daybook_init(
  p_day text,p_expected_auth_md5 text,p_expected_main_md5 text,
  p_expected_profiles_md5 text,p_expected_counter_used integer,
  p_expected_baseline_micro_usd bigint
) returns jsonb
language plpgsql security definer set search_path=pg_catalog
set statement_timeout='15s' set lock_timeout='3s' as $fn$
declare
  contract constant text := '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f';
  eu_rate constant text := 'azure-gpt5-mini-eu-MCA-202610-service-ceiling';
  legacy_rate constant text := 'azure-gpt5-mini-obergrenze-20260909';
  native_day text := (clock_timestamp() at time zone 'UTC')::date::text;
  auth jsonb; main jsonb; orders jsonb; books jsonb; next_auth jsonb;
  book jsonb; call jsonb; usage jsonb; journal jsonb; slot jsonb; op jsonb;
  item record; ticket record; k text; d text; book_day date;
  profiles_md5 text; auth_md5 text; main_md5 text;
  used integer; billable integer := 0; baseline bigint := 0;
  prompt numeric; completion numeric; n numeric;
  size integer; cap integer; target_cap integer; changed boolean;
  eu boolean; eu_call boolean; settled bigint; held bigint; manual integer;
  cumulative bigint; opening bigint; expected_book jsonb; now_utc timestamptz;
begin
  -- SECURITY DEFINER current_user is the owner; it is not caller authority.
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
       ((nullif(current_setting('request.jwt.claims',true),''))::jsonb ->> 'role'))
       is distinct from 'service_role' then
    raise exception 'eu-daybook-caller';
  end if;
  -- A caller's old RR/serializable snapshot cannot prove fresh multi-table
  -- quiescence. READ COMMITTED reads follow acquisition of every table lock.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'eu-daybook-isolation';
  end if;
  if p_day is distinct from native_day or native_day < '2026-10-01'
    or native_day > '2026-10-25'
    or p_expected_auth_md5 is null or p_expected_auth_md5 !~ '^[a-f0-9]{32}$'
    or p_expected_main_md5 is null or p_expected_main_md5 !~ '^[a-f0-9]{32}$'
    or p_expected_profiles_md5 is null or p_expected_profiles_md5 !~ '^[a-f0-9]{32}$'
    or p_expected_counter_used is null or p_expected_counter_used not between 0 and 714
    or p_expected_baseline_micro_usd is null or p_expected_baseline_micro_usd < 0 then
    raise exception 'eu-daybook-request';
  end if;

  -- Stable order starts with profiles, as the existing independent endguard
  -- binder/stop does. SHARE blocks INSERT/UPDATE/DELETE, including absent rows.
  lock table public.mandate_profiles in share mode;
  lock table helmut_end500_internal.bindings in share mode;
  lock table public.helmut_jobs,public.helmut_job_outbox,public.process_runs,
    public.pipeline_locks in share mode;
  lock table public.llm_budget_counters in share mode;
  -- Serialize initializers and prevent a new command/runtime row appearing
  -- during the proof. The update below changes only the auth row's data.
  lock table public.helmut_store in share row exclusive mode;
  perform id from public.helmut_store where id in ('main','main-auth')
    order by id collate "C" for update;
  now_utc := clock_timestamp();
  if (now_utc at time zone 'UTC')::date::text is distinct from native_day then
    raise exception 'eu-daybook-midnight';
  end if;
  select data into main from public.helmut_store where id='main';
  select data into auth from public.helmut_store where id='main-auth';
  if jsonb_typeof(main) is distinct from 'object' or jsonb_typeof(auth) is distinct from 'object'
    or pg_column_size(auth)>16*1024*1024 then
    raise exception 'eu-daybook-store';
  end if;
  auth_md5 := md5(auth::text); main_md5 := md5(main::text);
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by user_id collate "C"),'[]'::jsonb)::text)
    into profiles_md5 from public.mandate_profiles p;
  select c.used into used from public.llm_budget_counters c
    where c.scope='global' and c.day=native_day;
  used := coalesce(used,0); -- absence proved under the SHARE lock, not supplied.
  if auth_md5 is distinct from p_expected_auth_md5 or main_md5 is distinct from p_expected_main_md5
    or profiles_md5 is distinct from p_expected_profiles_md5
    or used is distinct from p_expected_counter_used or used not between 0 and 714 then
    raise exception 'eu-daybook-stale-native';
  end if;
  if (select count(*) from public.mandate_profiles)<>500
    or exists(select from public.mandate_profiles where aktiv is distinct from false or geloescht_at is not null)
    -- Same live-work predicates as synthetik-500-native-pin/starttor-kapsel;
    -- terminal deliveries/failures remain historical records, not new work.
    or exists(select from public.helmut_jobs where status is null or status not in ('erledigt','fehlgeschlagen') or lease_expires_at>now_utc)
    or exists(select from public.helmut_job_outbox where status is null or status not in ('bestaetigt','aufgegeben','verzichtet'))
    or exists(select from public.process_runs where finished_at is null and status='running')
    or exists(select from public.pipeline_locks where expires_at>now_utc)
    or exists(select from helmut_end500_internal.bindings where stopped_am is null) then
    raise exception 'eu-daybook-not-quiescent';
  end if;
  -- Historical journals/unknown U attempts remain byte-for-byte. A live or
  -- future slot/command is never financed by this preparation operation.
  slot := (auth->'synthetik500KostenAdmission');
  journal := (auth->'synthetik500DispatchJournal');
  if auth ? 'synthetik500KostenAdmission' then
    if jsonb_typeof(slot) is distinct from 'object'
      or jsonb_typeof(slot->'plan') is distinct from 'object'
      or jsonb_typeof(slot->'plan'->'endsAtUTC') is distinct from 'string'
      or (slot->'plan'->>'endsAtUTC')::timestamptz>=now_utc then
      raise exception 'eu-daybook-live-slot';
    end if;
  end if;
  if auth ? 'synthetik500DispatchJournal' then
    if (journal->>'version') is distinct from 'helmut-synthetik500-dispatch-journal/1'
      or jsonb_typeof(journal->'operations') is distinct from 'object' then
      raise exception 'eu-daybook-journal';
    end if;
    for op in select value from jsonb_each(journal->'operations') loop
      if (op->>'state') in ('running','continuing') then raise exception 'eu-daybook-live-journal'; end if;
      if (op->>'state') is null or (op->>'state') not in ('installed','closed','unknown','stopped') then
        raise exception 'eu-daybook-journal-state';
      end if;
      if (op->>'state')='installed' and (op->>'operationId')=(journal->>'activeOperationId')
        and (not (auth ? 'synthetik500KostenAdmission')
        or (op->>'operationId') is distinct from (slot->'plan'->>'operationId')) then
        raise exception 'eu-daybook-installed-command';
      end if;
    end loop;
  end if;
  -- Existing immutable command/runtime envelopes alone grant no execution.
  -- Keep them unchanged; actual live slot/journal/endguard/profile/work state
  -- above is the execution boundary. Do not decode/requalify staged bodies.

  orders := (auth->'testKostenAuftrag'); books := (auth->'testKostenTage');
  if jsonb_typeof(orders) is distinct from 'object'
    or (orders - array['version','id','abTag','limit','externGebunden','serviceContractHash',
      'privateReserveMicroUSD','bookCapacity','runDayUTC']) is distinct from '{}'::jsonb
    or (select count(*) from jsonb_object_keys(orders))<>9
    or (orders->'version') is distinct from '5'::jsonb
    or (orders->>'id') is distinct from 'autonom-bis500-20260926'
    or (orders->>'abTag') is distinct from '2026-09-25'
    or (orders->'limit') is distinct from '88845364'::jsonb
    or (orders->>'serviceContractHash') is distinct from contract
    or (orders->'privateReserveMicroUSD') is distinct from '636000'::jsonb
    or (orders->'runDayUTC') is distinct from 'null'::jsonb
    or jsonb_typeof(books) is distinct from 'object' then
    raise exception 'eu-daybook-EU-order';
  end if;
  for k in select unnest(array['externGebunden','bookCapacity']) loop
    if jsonb_typeof(orders->k) is distinct from 'number' then raise exception 'eu-daybook-order-number'; end if;
    n := (orders->>k)::numeric;
    if n<>trunc(n) or n<0 or n>9007199254740991 then raise exception 'eu-daybook-order-number'; end if;
  end loop;
  size := (select count(*) from jsonb_object_keys(books)); cap := (orders->>'bookCapacity')::integer;
  changed := not (books ? native_day); target_cap := size+(case when changed then 1 else 0 end);
  if size>47 or target_cap>47 or cap<target_cap-(case when changed then 1 else 0 end)
    or cap>target_cap or cap<1 then raise exception 'eu-daybook-capacity'; end if;
  if not changed and cap<>size then raise exception 'eu-daybook-capacity'; end if;

  -- Exactly the existing K.historie billable/no-call classification and token
  -- rounding. estimatedCost is evidence, never the micro-USD calculation.
  if jsonb_typeof(auth->'llmUsage') is distinct from 'array'
    or jsonb_array_length(auth->'llmUsage')>50000 then raise exception 'eu-daybook-history'; end if;
  -- JS optional createdAt?.slice rejects scalar/object non-slice values even
  -- before filtering a day. Do not silently ignore malformed history dates.
  if exists(select from jsonb_array_elements(auth->'llmUsage') r(value)
    where r.value ? 'createdAt' and jsonb_typeof(r.value->'createdAt')
      not in ('string','array','null')) then raise exception 'eu-daybook-history'; end if;
  for usage in select value from jsonb_array_elements(auth->'llmUsage')
    where left((value->>'createdAt'),10)=native_day loop
    if (usage->'keinAufruf')='true'::jsonb then
      if (usage->'success') is distinct from 'false'::jsonb or left((usage->>'callType'),8) is distinct from 'skipped-'
        or (usage->>'model') is null or (usage->>'model') not in ('none','kein-aufruf') then
        raise exception 'eu-daybook-no-call';
      end if;
      for k in select unnest(array['estimatedCost','promptTokens','completionTokens','totalTokens']) loop
        if (usage->k) is distinct from '0'::jsonb then raise exception 'eu-daybook-no-call'; end if;
      end loop;
    else
      if (usage->>'model') is null or (usage->>'model') not in ('gpt-5-mini','gpt-5-mini-eu')
        or jsonb_typeof(usage->'estimatedCost') is distinct from 'number'
        or (usage->>'estimatedCost')::numeric<0
        or (usage->>'estimatedCost')::numeric>1.7976931348623157e308
        or jsonb_typeof(usage->'promptTokens') is distinct from 'number'
        or jsonb_typeof(usage->'completionTokens') is distinct from 'number' then
        raise exception 'eu-daybook-history';
      end if;
      prompt := (usage->>'promptTokens')::numeric; completion := (usage->>'completionTokens')::numeric;
      if prompt<>trunc(prompt) or completion<>trunc(completion) or prompt not between 0 and 400000
        or completion not between 0 and 128000 then raise exception 'eu-daybook-tokens'; end if;
      baseline := baseline+ceil(prompt/2+completion*4)::bigint; billable := billable+1;
    end if;
  end loop;
  if billable<>used or baseline<>p_expected_baseline_micro_usd then raise exception 'eu-daybook-history-counter'; end if;
  expected_book := jsonb_build_object('version',3,'day',native_day,'tarif',eu_rate,'limit',82036000,
    'serviceContractHash',contract,'spent',baseline,'baseline',baseline,'baselineCalls',used,
    'manualCalls',0,'manualUntil',null,'calls','{}'::jsonb,'frozen',null);
  if not changed and (books->native_day) is distinct from expected_book then
    raise exception 'eu-daybook-current-book';
  end if;
  if changed then books := jsonb_set(books,array[native_day],expected_book,true); end if;

  -- Validate ALL retained books and call histories. Never overwrite, normalize,
  -- settle or release a historical unknown outcome; its reserve stays held.
  cumulative := (orders->>'externGebunden')::bigint+636000;
  opening := (orders->>'externGebunden')::bigint;
  for item in select key,value from jsonb_each(books) loop
    d:=item.key; book:=item.value;
    if d !~ '^\d{4}-\d{2}-\d{2}$' or d::date::text is distinct from d or d>native_day
      or jsonb_typeof(book) is distinct from 'object' or (book->>'day') is distinct from d
      or jsonb_typeof(book->'calls') is distinct from 'object'
      or (select count(*) from jsonb_object_keys(book->'calls'))>5000 then raise exception 'eu-daybook-old-book'; end if;
    book_day:=d::date; eu:=(book->'version')='3'::jsonb;
    if not coalesce(((book->'version')='1'::jsonb and (book->'limit')='4000000'::jsonb and (book->>'tarif')=legacy_rate)
      or ((book->'version')='2'::jsonb and (book->'limit')='6000000'::jsonb and (book->>'tarif')=legacy_rate)
      or (eu and (book->'limit')='82036000'::jsonb and (book->>'tarif')=eu_rate and (book->>'serviceContractHash')=contract),false)
      or ((book->'frozen') is not null and (book->'frozen')<>'null'::jsonb
        and (book->>'frozen')<>'test-usd-ausgang-unklar') then raise exception 'eu-daybook-old-contract'; end if;
    for k in select unnest(array['spent','baseline','manualCalls']) loop
      if jsonb_typeof(book->k) is distinct from 'number' then raise exception 'eu-daybook-old-number'; end if;
      n:=(book->>k)::numeric;
      if n<>trunc(n) or n<0 or n>9007199254740991 then raise exception 'eu-daybook-old-number'; end if;
    end loop;
    if book ? 'baselineCalls' then
      if jsonb_typeof(book->'baselineCalls') is distinct from 'number'
        or (book->>'baselineCalls')::numeric<>trunc((book->>'baselineCalls')::numeric)
        or (book->>'baselineCalls')::numeric not between 0 and 9007199254740991 then
        raise exception 'eu-daybook-old-baseline-calls';
      end if;
    end if;
    if (book->'manualUntil') is distinct from 'null'::jsonb then
      if jsonb_typeof(book->'manualUntil') is distinct from 'string'
        or (book->>'manualUntil') < (d || 'T00:00:00.000Z')
        or not isfinite((book->>'manualUntil')::timestamptz)
        or (book->>'manualUntil')::timestamptz>((book_day+1)::timestamp at time zone 'UTC') then
        raise exception 'eu-daybook-old-manual-window';
      end if;
    end if;
    settled:=0; held:=0; manual:=0;
    for ticket in select key,value from jsonb_each(book->'calls') loop
      call:=ticket.value;
      if jsonb_typeof(call) is distinct from 'object' or (call->>'status') is null
        or (call->>'status') not in ('reserviert','ungeklaert','abgerechnet','nicht-gesendet')
        or jsonb_typeof(call->'manual') is distinct from 'boolean'
        or jsonb_typeof(call->'createdAt') is distinct from 'string'
        or not isfinite((call->>'createdAt')::timestamptz) then raise exception 'eu-daybook-old-call'; end if;
      eu_call:=coalesce((call->>'contractHash')=contract and (call->>'tarif')=eu_rate,false);
      if (call ? 'contractHash' or call ? 'tarif') and not eu_call then raise exception 'eu-daybook-old-call-contract'; end if;
      for k in select unnest(array['reserved','maxOutputTokens']) loop
        if jsonb_typeof(call->k) is distinct from 'number'
          or (call->>k)::numeric<>trunc((call->>k)::numeric)
          or (call->>k)::numeric not between 1 and 9007199254740991 then raise exception 'eu-daybook-old-call-number'; end if;
      end loop;
      if (eu_call and (not eu or (call->'maxOutputTokens')<>'3000'::jsonb or (call->'reserved')<>'81400'::jsonb))
        or (not eu_call and ((call->>'maxOutputTokens')::numeric>8000
          or (call->>'reserved')::numeric<>200000+4*(call->>'maxOutputTokens')::numeric)) then
        raise exception 'eu-daybook-old-call-tariff';
      end if;
      if call ? 'bezug' then
        if (call->'manual')<>'true'::jsonb or jsonb_typeof(call->'bezug') is distinct from 'object'
          or (call->'bezug'->'version') is distinct from '1'::jsonb
          or coalesce((call->'bezug'->>'runId'),'') !~ '^(nachlauf500|verstehen169|verstehen4|verstehen5|verstehen30|verstehen3|verstehen-bund7|verstehen16|verstehen18)-[0-9]{5,20}$'
          or ((call->'bezug') - array['version','runId','mandatHash','phase'])<>'{}'::jsonb
          or ((call->'bezug') ? 'mandatHash' and coalesce((call->'bezug'->>'mandatHash'),'') !~ '^[a-f0-9]{64}$')
          or ((call->'bezug') ? 'phase' and (not ((call->'bezug') ? 'mandatHash')
            or coalesce((call->'bezug'->>'phase'),'') not in ('entwurf','pruefung'))) then
          raise exception 'eu-daybook-old-call-reference';
        end if;
      end if;
      if (call->>'status') in ('reserviert','ungeklaert') then
        if call ? 'cost' or eu_call then raise exception 'eu-daybook-unsettled-EU-or-cost'; end if;
        held:=held+(call->>'reserved')::bigint;
      else
        if jsonb_typeof(call->'cost') is distinct from 'number'
          or (call->>'cost')::numeric<>trunc((call->>'cost')::numeric)
          or (call->>'cost')::numeric<0 or (call->>'cost')::numeric>(call->>'reserved')::numeric
          or ((call->>'status')='nicht-gesendet' and (call->'cost')<>'0'::jsonb) then
          raise exception 'eu-daybook-old-call-cost';
        end if;
        settled:=settled+(call->>'cost')::bigint;
      end if;
      if (call->'manual')='true'::jsonb then manual:=manual+1; end if;
    end loop;
    if (book->>'spent')::bigint<>(book->>'baseline')::bigint+settled
      or (book->>'manualCalls')::bigint<>manual then raise exception 'eu-daybook-old-ledger'; end if;
    held:=held+(book->>'spent')::bigint;
    if held+(case when eu then 636000 else 0 end)>(book->>'limit')::bigint then
      raise exception 'eu-daybook-day-ceiling';
    end if;
    if d>='2026-09-25' then
      cumulative:=cumulative+held;
      if d<>native_day then opening:=opening+held; end if;
    end if;
  end loop;
  for book_day in select generate_series('2026-09-25'::date,native_day::date,interval '1 day')::date loop
    if not (books ? book_day::text) then raise exception 'eu-daybook-missing-order-day'; end if;
  end loop;
  if opening>7445364 or cumulative>88845364 then raise exception 'eu-daybook-order-ceiling'; end if;
  -- EU.assertOpening: this first500 bootstrap requires genuine dayOther=0
  -- and a cumulative opening (including private reserve) within the fixed cap.
  -- Never replace a faithfully computed nonzero history baseline with zero.
  if baseline<>0 or cumulative not between 636000 and 7445364 then
    raise exception 'eu-daybook-opening';
  end if;

  if (clock_timestamp() at time zone 'UTC')::date::text is distinct from native_day then
    raise exception 'eu-daybook-midnight';
  end if;
  if changed then
    next_auth := jsonb_set(auth,array['testKostenTage'],books,false);
    next_auth := jsonb_set(next_auth,array['testKostenAuftrag','bookCapacity'],to_jsonb(target_cap),false);
    -- Existing conditional Auth writers must conflict after this real change,
    -- including writers whose old snapshot had no revision (is.null CAS).
    next_auth := jsonb_set(next_auth,array['_authStoreRevision'],to_jsonb(gen_random_uuid()::text),true);
    update public.helmut_store set data=next_auth where id='main-auth' and data=auth;
    if not found then raise exception 'eu-daybook-auth-CAS'; end if;
  else next_auth:=auth;
  end if;
  if (clock_timestamp() at time zone 'UTC')::date::text is distinct from native_day
    or main is distinct from (select data from public.helmut_store where id='main')
    or next_auth is distinct from (select data from public.helmut_store where id='main-auth') then
    raise exception 'eu-daybook-postcondition';
  end if;
  return jsonb_build_object('status',case when changed then 'initialized' else 'already-present' end,
    'day',native_day,'book_capacity',target_cap,'baseline_micro_usd',baseline,'counter_used',used,
    'auth_md5_before',auth_md5,'auth_md5_after',md5(next_auth::text),
    'main_md5',main_md5,'profiles_md5',profiles_md5,
    'production_ready',false,'paid_test_go',false,'run_day_utc',null);
end;
$fn$;

revoke all on function public.helmut_synthetik500_eu_daybook_init(text,text,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.helmut_synthetik500_eu_daybook_init(text,text,text,text,integer,bigint) to service_role;
comment on function public.helmut_synthetik500_eu_daybook_init(text,text,text,text,integer,bigint) is
  'Explicit service-only atomic CURRENT UTC EU daybook initializer. Six native expected stamps; locked history/counter/quiescence proof. No counter/profile/command/model authority. Unknown result is not retry permission.';
commit;
