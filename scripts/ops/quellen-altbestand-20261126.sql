-- Ein freigegebener, gebundener Eingriff in wieder vorgelegte Altanalysen.
-- psql-Variablen: modus=vorschau|parken|rueckweg, klasse=diagnose|profil|modellausgang.
-- Für parken/rueckweg: tag (UTC), anzahl, digest. Für parken zusätzlich der
-- kanonisch verifizierte plan_digest, für rueckweg die quittierten ids (JSON).
-- Mit leerem Aufruf wird nur die Vorschau der diagnostischen Aufträge ausgegeben.
\set ON_ERROR_STOP on
\if :{?modus}
\else
  \set modus vorschau
\endif
\if :{?klasse}
\else
  \set klasse diagnose
\endif
\if :{?tag}
\else
  \set tag ''
\endif
\if :{?anzahl}
\else
  \set anzahl 0
\endif
\if :{?digest}
\else
  \set digest ''
\endif
\if :{?plan_digest}
\else
  \set plan_digest ''
\endif
\if :{?ids}
\else
  \set ids '[]'
\endif

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create temporary table helmut_altparameter on commit drop as
select :'modus'::text as modus, :'klasse'::text as klasse, :'tag'::text as tag,
       :'anzahl'::integer as anzahl, :'digest'::text as digest, :'ids'::jsonb as ids,
       :'plan_digest'::text as plan_digest;
create temporary table helmut_altziel (id uuid primary key, hash text not null, substanz text not null) on commit drop;
create temporary table helmut_altquittung (ausgabe jsonb not null) on commit drop;

do $operation$
declare
  p record;
  v_tag text := current_date::text;
  v_anzahl integer;
  v_digest text;
  v_jetzt timestamptz := transaction_timestamp();
  v_notiz text;
  v_plan_digest text;
begin
  select * into strict p from helmut_altparameter;
  if p.modus not in ('vorschau', 'parken', 'rueckweg')
    or p.klasse not in ('diagnose', 'profil', 'modellausgang')
    or jsonb_typeof(p.ids) is distinct from 'array'
    or (p.modus <> 'vorschau' and (p.tag <> v_tag or p.anzahl not between 1 and 1000
      or p.digest !~ '^[a-f0-9]{64}$'))
    or (p.modus = 'parken' and p.plan_digest !~ '^[a-f0-9]{64}$')
    or (p.modus <> 'rueckweg' and p.ids <> '[]'::jsonb)
    or (p.modus = 'rueckweg' and jsonb_array_length(p.ids) <> p.anzahl)
  then raise exception 'altbestand: ungueltige oder abgelaufene Freigabebindung'; end if;

  if p.modus = 'rueckweg' then
    insert into helmut_altziel
      select j.id, encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'),
        encode(sha256(convert_to((to_jsonb(j) - array['status','finished_at','updated_at'])::text, 'UTF8')), 'hex')
        from public.helmut_jobs j
        join jsonb_array_elements_text(p.ids) i(id) on j.id = i.id::uuid
       where j.job_type = 'document_understanding' and j.tenant_id is null
         and j.status = 'fehlgeschlagen' and j.attempts = 0 and j.wiedervorlagen > 0
         and j.finished_at is not null and j.lease_owner is null and j.lease_expires_at is null
         and j.last_error like 'wiedervorlage % nach: %'
       order by j.id;
  else
    select encode(sha256(convert_to(data::text, 'UTF8')), 'hex') into v_plan_digest
      from public.helmut_store
      where id = 'main-quellenplan-' || v_tag and data->>'zustand' = 'fertig'
        and data->>'tag' = v_tag and data->'version' = '1'::jsonb
        and data->>'manifestHash' ~ '^[a-f0-9]{64}$'
        and data ?& array['auftraege','cursor','manifestHash','tag','tagesplan','version','zustand']
        and data - array['auftraege','cursor','manifestHash','tag','tagesplan','version','zustand'] = '{}'::jsonb
        and jsonb_typeof(data->'auftraege') = 'array'
        and data->'cursor' = to_jsonb(jsonb_array_length(data->'auftraege'));
    if v_plan_digest is null or (p.modus = 'parken' and p.plan_digest <> v_plan_digest)
    then raise exception 'altbestand: bestaetigter Tagesplan fehlt oder weicht ab'; end if;

    -- Schuetzt auch eine Belegreferenz, die der alte RPC nicht als last_seen markiert hat.
    with belegt as materialized (
      select distinct a->>'jobId' as id
        from public.helmut_store t
        cross join lateral jsonb_array_elements(t.data->'auftraege') plan
        join public.helmut_jobs q on q.idempotency_key = plan->>'idempotencyKey'
          and q.job_type = 'source_fetch'
        join public.helmut_store s on s.id = 'main-quellenfaelligkeit-' || q.id
        cross join lateral jsonb_array_elements(s.data->'ergebnis'->'analyse') a
       where t.id = 'main-quellenplan-' || v_tag and plan->>'jobType' = 'source_fetch'
    )
    insert into helmut_altziel
      select j.id, encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'),
        encode(sha256(convert_to((to_jsonb(j) - array['status','finished_at','updated_at'])::text, 'UTF8')), 'hex')
        from public.helmut_jobs j
       where j.job_type = 'document_understanding' and j.tenant_id is null
         and j.status = 'wartend' and j.attempts = 0 and j.wiedervorlagen > 0
         and j.finished_at is null and j.lease_owner is null and j.lease_expires_at is null
         and j.first_due_at < v_tag::date::timestamptz
         and coalesce(j.last_seen_window, j.freshness_window) < v_tag
         and j.payload->'dokumentIds' = jsonb_build_array(j.payload->'dokumentIds'->>0)
         and j.payload->'dokumentIds'->>0 ~ '^rd-[a-f0-9]{64}$'
         and j.payload->'quellenstaende'->>(j.payload->'dokumentIds'->>0) ~ '^[a-f0-9]{64}$'
         and split_part(j.idempotency_key, '|', 2) = left(encode(sha256(convert_to(
           j.payload->'dokumentIds'->>0, 'UTF8')), 'hex'), 32)
         and split_part(j.idempotency_key, '|', 3) = left(encode(sha256(convert_to(
           (j.payload->'dokumentIds'->>0) || ':' ||
           (j.payload->'quellenstaende'->>(j.payload->'dokumentIds'->>0)), 'UTF8')), 'hex'), 32)
         and not exists (select 1 from belegt b where b.id = j.id::text)
         and case p.klasse
           when 'diagnose' then j.idempotency_key ~ '^document_understanding\|[a-f0-9]{32}\|[a-f0-9]{32}\|eingangsfehler\|versionskonflikt$'
             and j.payload->>'artikelFehler' = 'quellenstand-versionskonflikt'
             and j.last_error ~ '^wiedervorlage [12] nach: artikel-eingangsfehler: quellenstand-versionskonflikt$'
           when 'profil' then not (j.payload ? 'artikelFehler')
             and j.idempotency_key ~ '^document_understanding\|[a-f0-9]{32}\|[a-f0-9]{32}$'
             and j.last_error ~ '^wiedervorlage [12] nach: betriebskosten-profilbindung-abweichend$'
           when 'modellausgang' then
             j.idempotency_key ~ '^document_understanding\|[a-f0-9]{32}\|[a-f0-9]{32}$'
             and j.last_error ~ '^wiedervorlage [12] nach: modellausgang-unbekannt:'
         end
       order by j.id;
  end if;

  select count(*), encode(sha256(convert_to(coalesce(string_agg(id::text || ':' || hash, ',' order by id), ''), 'UTF8')), 'hex')
    into v_anzahl, v_digest from helmut_altziel;
  if p.modus <> 'vorschau' and (p.anzahl <> v_anzahl or p.digest <> v_digest)
  then raise exception 'altbestand: freigegebener Zeilenstand abweichend'; end if;

  if p.modus <> 'vorschau' then
    perform j.id from public.helmut_jobs j join helmut_altziel z on z.id = j.id order by j.id for update of j;
  end if;

  if p.modus = 'parken' then
    update public.helmut_jobs j set status = 'fehlgeschlagen', finished_at = v_jetzt
      from helmut_altziel z where j.id = z.id;
  elsif p.modus = 'rueckweg' then
    update public.helmut_jobs j set status = 'wartend', finished_at = null
      from helmut_altziel z where j.id = z.id;
  end if;

  if p.modus <> 'vorschau' then
    get diagnostics v_anzahl = row_count;
    if v_anzahl <> p.anzahl then raise exception 'altbestand: Anzahl nach Update abweichend'; end if;
    if exists (select 1 from public.helmut_jobs j join helmut_altziel z on z.id = j.id
      where j.status <> case when p.modus = 'parken' then 'fehlgeschlagen' else 'wartend' end
        or j.finished_at is distinct from case when p.modus = 'parken' then v_jetzt else null end
        or j.lease_owner is not null or j.lease_expires_at is not null
        or z.substanz <> encode(sha256(convert_to(
          (to_jsonb(j) - array['status','finished_at','updated_at'])::text, 'UTF8')), 'hex'))
    then raise exception 'altbestand: Nachzustand unbestaetigt'; end if;
    update helmut_altziel z set hash = encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex')
      from public.helmut_jobs j where j.id = z.id;
  end if;

  select encode(sha256(convert_to(coalesce(string_agg(id::text || ':' || hash, ',' order by id), ''), 'UTF8')), 'hex')
    into v_notiz from helmut_altziel;
  insert into helmut_altquittung values (jsonb_build_object(
    'modus', p.modus, 'klasse', p.klasse, 'tag', v_tag, 'anzahl', v_anzahl, 'vorDigest', v_digest,
    'nachDigest', v_notiz, 'planDigest', v_plan_digest,
    'ids', coalesce((select jsonb_agg(id order by id) from helmut_altziel), '[]'::jsonb)));
end;
$operation$;

select ausgabe from helmut_altquittung;
commit;
