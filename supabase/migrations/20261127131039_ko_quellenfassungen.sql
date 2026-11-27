-- Nur vorbereitete Schema-Reparatur. KEINE Bestandsinitialisierung/Stockpromotion.
-- Explizit geschuetzte KOs behalten append-only Quellen je KO-Version.
-- Kein Lektuerebeleg; keine Aenderung an CAS, Reservierungen oder Kosten.
begin;
create table public.helmut_ko_quellenfassungen (
  knowledge_object_id text not null,
  ko_version integer not null check (ko_version > 0),
  raw_document_id text not null check (raw_document_id ~ '^rd-[a-f0-9]{64}$'),
  raw_source_version_id text not null references public.helmut_store(id),
  raw_source_version_sha256 text not null check (raw_source_version_sha256 ~ '^[a-f0-9]{64}$'),
  quellen_count integer not null check (quellen_count between 1 and 2000),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(knowledge_object_id,ko_version,raw_document_id),
  foreign key(knowledge_object_id,raw_document_id)
    references public.ko_document_links(knowledge_object_id,raw_document_id),
  constraint ko_quellenfassung_scope check (
    raw_source_version_id ~ '^[A-Za-z0-9_-]{1,100}-rohstand-[a-f0-9]{64}-[a-f0-9]{64}$'
    and raw_source_version_id like '%-rohstand-' || substring(raw_document_id from 4) || '-%'
    and raw_source_version_id !~ '^[A-Za-z0-9_-]*-p-[A-Za-z0-9_-]*-rohstand-')
);
alter table public.helmut_ko_quellenfassungen enable row level security;
create policy helmut_ko_quellenfassungen_service on public.helmut_ko_quellenfassungen
  for all to service_role using (true) with check (true);
revoke all on public.helmut_ko_quellenfassungen from public,anon,authenticated,service_role;
-- Keine UPDATE-/DELETE-Rechte: Historie nur anfuegen. GO-Rueckweg ist eine
-- separat vorwertgebundene Admintransaktion vor neuem Konsumentenclaim.
grant select,insert on public.helmut_ko_quellenfassungen to service_role;
-- Kompakte, rekursiv nach Schluessel sortierte JSON-Darstellung wie der bestehende
-- JS-Archivhash. Der zusaetzliche Digest bindet auch source_id/type/retrieved_at,
-- die der historische roh-quellenstaende.standHash bewusst nicht umfasst.
create function public.helmut_quellenfassung_json(p jsonb) returns text
language plpgsql immutable strict security invoker set search_path = pg_catalog, public as $$
declare result text;
begin
  case jsonb_typeof(p)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(k)::text || ':' || public.helmut_quellenfassung_json(v), ',' order by k collate "C"), '') || '}'
        into result from jsonb_each(p) as e(k,v);
    when 'array' then
      select '[' || coalesce(string_agg(public.helmut_quellenfassung_json(v), ',' order by n), '') || ']'
        into result from jsonb_array_elements(p) with ordinality as e(v,n);
    else result := p::text;
  end case;
  return result;
end $$;

create function public.helmut_quellenfassung_dokument(roh_id text, archiv_id text, vollhash text, a jsonb)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare d jsonb := a->'dokument'; parts text[]; stand text; datum text;
begin
  parts := regexp_match(archiv_id, '^([A-Za-z0-9_-]{1,100})-rohstand-([a-f0-9]{64})-([a-f0-9]{64})$');
  if parts is null or position('-p-' in parts[1]) > 0
    or vollhash is null or vollhash !~ '^[a-f0-9]{64}$'
    or roh_id is distinct from 'rd-' || parts[2]
    or a is null or a->'version' is distinct from '1'::jsonb
    or jsonb_typeof(d) is distinct from 'object'
    or d->>'id' is distinct from roh_id or a->>'quellenHash' is distinct from parts[3]
    or encode(sha256(convert_to(public.helmut_quellenfassung_json(a), 'UTF8')), 'hex') is distinct from vollhash
    then raise exception 'ko-quellenfassung-archiv-abweichend'; end if;
  datum := case when d->>'published_at' is null then null else
    to_char((d->>'published_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end;
  stand := encode(sha256(convert_to(public.helmut_quellenfassung_json(jsonb_build_array(
    d->'id',d->'url',d->'canonical_url',d->'title',d->'summary',datum,d->'source_name',d->'raw')), 'UTF8')), 'hex');
  if stand is distinct from parts[3] then raise exception 'ko-quellenfassung-standhash-abweichend'; end if;
  return d;
end $$;

-- Ein kompletter Satz hat ueberall dieselbe Anzahl und denselben Manifesthash.
-- Defekte/teilweise Saetze bleiben sichtbar, damit die Computed Relation wirft.
create view public.helmut_ko_quellenmanifeste with (security_invoker=true) as
select knowledge_object_id,ko_version,
  min(quellen_count)=count(*) and max(quellen_count)=count(*)
  and count(distinct manifest_sha256)=1
  and min(manifest_sha256)=encode(sha256(convert_to(public.helmut_quellenfassung_json(
    jsonb_agg(jsonb_build_object('raw_document_id',raw_document_id,
      'raw_source_version_id',raw_source_version_id,'raw_source_version_sha256',raw_source_version_sha256)
      order by raw_document_id collate "C")), 'UTF8')), 'hex') as vollstaendig
from public.helmut_ko_quellenfassungen group by knowledge_object_id,ko_version;

create view public.helmut_ko_quellen with (security_invoker=true) as
select l.knowledge_object_id,l.raw_document_id,l.created_at,k.ko_version,
  f.raw_source_version_id,f.raw_source_version_sha256,
  p.geschuetzt,coalesce(m.vollstaendig,false) as manifest_vollstaendig,
  to_jsonb(r) as canonical_document,s.data as source_archive
from public.ko_document_links l
join public.knowledge_objects k on k.id=l.knowledge_object_id
cross join lateral (select exists(select 1 from public.helmut_ko_quellenfassungen b
  where b.knowledge_object_id=k.id) as geschuetzt) p
left join public.helmut_ko_quellenmanifeste m on m.knowledge_object_id=k.id and m.ko_version=k.ko_version
left join public.helmut_ko_quellenfassungen f on f.knowledge_object_id=k.id and f.ko_version=k.ko_version
  and f.raw_document_id=l.raw_document_id
left join public.raw_documents r on r.id=l.raw_document_id
left join public.helmut_store s on s.id=f.raw_source_version_id
where not p.geschuetzt or not coalesce(m.vollstaendig,false) or f.raw_document_id is not null;

-- PostgREST12: SETOF + ROWS1 ist eine to-one Computed Relation. PL/pgSQL ist
-- hier absichtlich nicht inlinebar: keine Optimierer-Umgehung der Fehlerpruefung.
create function public.raw_documents(q public.helmut_ko_quellen)
returns setof public.raw_documents rows 1
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
begin
  if q.geschuetzt then
    if not q.manifest_vollstaendig then raise exception 'ko-quellenfassung-manifest-unvollstaendig'; end if;
    return next jsonb_populate_record(null::public.raw_documents,public.helmut_quellenfassung_dokument(
      q.raw_document_id,q.raw_source_version_id,q.raw_source_version_sha256,q.source_archive));
  else
    if q.canonical_document is null then raise exception 'ko-quellenfassung-raw-fehlt'; end if;
    return next jsonb_populate_record(null::public.raw_documents,q.canonical_document);
  end if;
end $$;
create function public.helmut_ko_quellen(k public.knowledge_objects)
returns setof public.helmut_ko_quellen
language sql stable security invoker set search_path = pg_catalog, public as $$
  select q.* from public.helmut_ko_quellen q where q.knowledge_object_id=k.id
$$;

-- Historische Fassung explizit, niemals als aktuelle kanonische Quelle ausgeben.
create function public.helmut_ko_quellen_historisch(p_ko_id text,p_ko_version integer)
returns setof public.helmut_ko_quellen
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
begin
  if p_ko_version is null or p_ko_version<1 or not exists(select 1 from public.helmut_ko_quellenmanifeste m
    where m.knowledge_object_id=p_ko_id and m.ko_version=p_ko_version and m.vollstaendig)
    then raise exception 'ko-quellenfassung-historie-unvollstaendig'; end if;
  return query select f.knowledge_object_id,f.raw_document_id,l.created_at,f.ko_version,
    f.raw_source_version_id,f.raw_source_version_sha256,true,true,to_jsonb(r),s.data
    from public.helmut_ko_quellenfassungen f
    join public.ko_document_links l using(knowledge_object_id,raw_document_id)
    left join public.raw_documents r on r.id=f.raw_document_id
    left join public.helmut_store s on s.id=f.raw_source_version_id
    where f.knowledge_object_id=p_ko_id and f.ko_version=p_ko_version;
end $$;

-- EIN Bulk-Schreibaufruf; KO-Zeilensperren sortiert gegen Deadlocks. Ungeschuetzt
-- identische PK-Kanten. Vorlinks ohne Ergebnisversion sind keine Versionsbelege.
-- Nur explizit initialisierte KOs erhalten nach bestaetigter Persistenz neue Saetze.
create function public.helmut_ko_quellen_verknuepfe(p_links jsonb,p_versionen jsonb default '{}'::jsonb,p_fassungen jsonb default null)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare kid text; aktuelle_version integer; erwartete_version integer; geschuetzt boolean;
  soll_anzahl integer; bestand_vollstaendig boolean; besteht boolean;
  gruppe jsonb; entry jsonb; manifest jsonb; mh text; anzahl integer;
begin
  if jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links) < 1
    or jsonb_typeof(p_versionen) is distinct from 'object'
    or (p_fassungen is not null and jsonb_typeof(p_fassungen) is distinct from 'array') then raise exception 'ko-quellenfassung-schreibauftrag'; end if;
  if exists(select 1 from jsonb_array_elements(p_links) e
    where jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'knowledge_object_id','')=''
    or coalesce(e->>'raw_document_id','')='')
    or (select count(*) from jsonb_array_elements(p_links)) <>
       (select count(distinct (e->>'knowledge_object_id',e->>'raw_document_id')) from jsonb_array_elements(p_links) e)
    then raise exception 'ko-quellenfassung-schreibauftrag'; end if;
  for kid in select distinct e->>'knowledge_object_id' from jsonb_array_elements(p_links) e order by 1 loop
    select k.ko_version,k.source_document_count into aktuelle_version,soll_anzahl from public.knowledge_objects k where k.id=kid for update;
    if not found then raise exception 'ko-quellenfassung-ko-fehlt'; end if;
    select exists(select 1 from public.helmut_ko_quellenfassungen f where f.knowledge_object_id=kid) into geschuetzt;
    select jsonb_agg(e order by e->>'raw_document_id' collate "C") into gruppe
      from jsonb_array_elements(coalesce(p_fassungen,p_links)) e where e->>'knowledge_object_id'=kid;
    erwartete_version := (p_versionen->>kid)::integer;
    if geschuetzt and erwartete_version is not null then
      if erwartete_version is distinct from aktuelle_version then raise exception 'ko-quellenfassung-ko-version-veraltet'; end if;
      if gruppe is null or jsonb_array_length(gruppe)<1
        or jsonb_array_length(gruppe)<>(select count(distinct e->>'raw_document_id') from jsonb_array_elements(gruppe) e)
        or exists(select 1 from jsonb_array_elements(p_links) l where l->>'knowledge_object_id'=kid
          and not exists(select 1 from jsonb_array_elements(gruppe) f where f=l))
        then raise exception 'ko-quellenfassung-schreibauftrag'; end if;
      select exists(select 1 from public.helmut_ko_quellenfassungen f where f.knowledge_object_id=kid
        and f.ko_version=erwartete_version) into besteht;
      if besteht then
        select m.vollstaendig into bestand_vollstaendig from public.helmut_ko_quellenmanifeste m
          where m.knowledge_object_id=kid and m.ko_version=erwartete_version;
        if not coalesce(bestand_vollstaendig,false) then raise exception 'ko-quellenfassung-manifest-unvollstaendig'; end if;
        if exists(select 1 from jsonb_array_elements(gruppe) e where not exists(
          select 1 from public.helmut_ko_quellenfassungen f where f.knowledge_object_id=kid
          and f.ko_version=erwartete_version and f.raw_document_id=e->>'raw_document_id'
          and f.raw_source_version_id=e->>'raw_source_version_id'
          and f.raw_source_version_sha256=e->>'raw_source_version_sha256'))
          then raise exception 'ko-quellenfassung-version-konflikt'; end if;
      elsif soll_anzahl is null or soll_anzahl<>jsonb_array_length(gruppe) then
        raise exception 'ko-quellenfassung-vollsatzanzahl-abweichend';
      end if;
      for entry in select * from jsonb_array_elements(gruppe) loop
        perform public.helmut_quellenfassung_dokument(entry->>'raw_document_id',entry->>'raw_source_version_id',
          entry->>'raw_source_version_sha256',(select s.data from public.helmut_store s where s.id=entry->>'raw_source_version_id'));
      end loop;
      select jsonb_agg(jsonb_build_object('raw_document_id',e->>'raw_document_id',
        'raw_source_version_id',e->>'raw_source_version_id','raw_source_version_sha256',e->>'raw_source_version_sha256')
        order by e->>'raw_document_id' collate "C") into manifest from jsonb_array_elements(gruppe) e;
      anzahl := jsonb_array_length(manifest);
      mh := encode(sha256(convert_to(public.helmut_quellenfassung_json(manifest),'UTF8')),'hex');

    end if;
    insert into public.ko_document_links(knowledge_object_id,raw_document_id)
      select kid,e->>'raw_document_id' from jsonb_array_elements(p_links) e where e->>'knowledge_object_id'=kid
      on conflict(knowledge_object_id,raw_document_id) do nothing;
    if geschuetzt and erwartete_version is not null and not besteht then
      -- Die vollstaendige technische Quellenmenge ist KEIN positiver Lektuerebeleg.
      insert into public.ko_document_links(knowledge_object_id,raw_document_id)
        select kid,e->>'raw_document_id' from jsonb_array_elements(gruppe) e
        on conflict(knowledge_object_id,raw_document_id) do nothing;
      insert into public.helmut_ko_quellenfassungen(knowledge_object_id,ko_version,raw_document_id,
        raw_source_version_id,raw_source_version_sha256,quellen_count,manifest_sha256)
        select kid,erwartete_version,e->>'raw_document_id',e->>'raw_source_version_id',e->>'raw_source_version_sha256',anzahl,mh
        from jsonb_array_elements(gruppe) e on conflict(knowledge_object_id,ko_version,raw_document_id) do nothing;
      if not exists(select 1 from public.helmut_ko_quellenmanifeste m
        where m.knowledge_object_id=kid and m.ko_version=erwartete_version and m.vollstaendig)
        then raise exception 'ko-quellenfassung-manifest-unvollstaendig'; end if;
    end if;
  end loop;
  return jsonb_array_length(p_links);
end $$;

revoke all on public.helmut_ko_quellen,public.helmut_ko_quellenmanifeste from public,anon,authenticated;
grant select on public.helmut_ko_quellen,public.helmut_ko_quellenmanifeste to service_role;
revoke all on function public.helmut_quellenfassung_json(jsonb),
  public.helmut_quellenfassung_dokument(text,text,text,jsonb),public.raw_documents(public.helmut_ko_quellen),
  public.helmut_ko_quellen(public.knowledge_objects),public.helmut_ko_quellen_historisch(text,integer),
  public.helmut_ko_quellen_verknuepfe(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.helmut_quellenfassung_json(jsonb),
  public.helmut_quellenfassung_dokument(text,text,text,jsonb),public.raw_documents(public.helmut_ko_quellen),
  public.helmut_ko_quellen(public.knowledge_objects),public.helmut_ko_quellen_historisch(text,integer),
  public.helmut_ko_quellen_verknuepfe(jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
