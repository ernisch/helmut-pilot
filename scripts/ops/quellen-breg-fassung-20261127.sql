-- BESTANDSOPERATOR, KEINE Migration. Standard ist reine Vorschau.
-- Keine Aktivierung ohne neues konkretes GO und frische Belege beider Plattformen.
-- psql -v modus=vorschau -f ...sql; Ausgabe privat durch JS pruefen.
-- Aktivieren: modus=freigeben, bindung=<JS-Ausgabe>, go=<privates konkretes GO-JSON>.
-- Rueckweg: modus=rueckweg, bindung={version:1,id:<Quittungsid>,receiptSHA256:<B.digest(Quittung)>}, go=<frisches Rueckweg-GO>.
-- Keine Quellen-/Provideraufrufe, Workerstarts, alten Quittungen oder Finanzwrites.
\set ON_ERROR_STOP on
\if :{?modus}
\else
\set modus vorschau
\endif
\if :{?bindung}
\else
\set bindung '{}'
\endif
\if :{?go}
\else
\set go '{}'
\endif
begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table breg_parameter on commit drop as
 select :'modus'::text modus, :'bindung'::jsonb bindung, :'go'::jsonb freigabe;
create temporary table breg_ausgabe(data jsonb) on commit drop;
create function pg_temp.breg_fordere(ok boolean,grund text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'breg-fassung: %',grund;end if;end $$;
create function pg_temp.breg_hash(j jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to(public.helmut_quellenfassung_json(j),'UTF8')),'hex') $$;
create function pg_temp.breg_stand(d jsonb) returns text language sql immutable as $$
 select pg_temp.breg_hash(jsonb_build_array(d->'id',d->'url',d->'canonical_url',d->'title',d->'summary',
 case when d->>'published_at' is null then null else
 to_char((d->>'published_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,d->'source_name',d->'raw')) $$;
create function pg_temp.breg_pins() returns jsonb language sql immutable as $$
 select '{"rawIds":"79487a377f2c9c41f84e46fc3213a052c4b5311a237949be0797febdd341b3f5","roh":"79cf43d3047b04c7058ab1d6964f226ee6ee5db76f82836ade583206d57b3012","kos":"bc3f4a5149fde1c30c93b407f3fb95d3550691ddcf021e221f16c3c5754b0461","kanten":"de63110037f2e603ba24d16e13c191899f5d4c732f62fe26e869e136823a1c28","zielKanten":"02b4c92e93e82a32d28d3cc893aa818a6a6af5446272c3ef693bbe18396c7110","archive":"81870ffc255031db45b29a2346f0d5edff9cbdb81cb8d8065ab86ec12fba5cac","findings":"0f1cdd8d050e69c25bf34022e90b6e3c11403c88902f35e13cd54fbae61dd530"}'::jsonb $$;
create function pg_temp.breg_kos() returns text[] language sql immutable as $$
 select array['ko-vg-bundesregierung-20241119-743c6b','ko-vg-entlastungen-20260417-6517e5'] $$;
-- Vollstaendige Zeilen, nativer C-SHA256; kein rekursiver globaler JSON-Baum.
-- Sortierte feste64Hex-Zeilenhashs binden auch Multiplizitaet und leere Tabellen.
create function pg_temp.breg_tabellenhash(t regclass) returns text language plpgsql stable as $$
declare h text;
begin
 execute format($abfrage$select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex')
  from (select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h from %s r) x$abfrage$,t) into h;
 return h;
end $$;
create function pg_temp.breg_snapshot(jetzt timestamptz) returns jsonb language sql stable as $$
 with kanten as(select l.* from public.ko_document_links l where knowledge_object_id=any(pg_temp.breg_kos())),
 roh as(select r.* from public.raw_documents r where id in(select raw_document_id from kanten))
 select jsonb_build_object(
 'roh',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from roh r),
 'kos',(select coalesce(jsonb_agg(to_jsonb(k) order by id),'[]') from public.knowledge_objects k where id=any(pg_temp.breg_kos())),
 'kanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id,raw_document_id),'[]') from kanten l),
 'zielKanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id),'[]') from public.ko_document_links l
   where raw_document_id='rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068'),
 'archive',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'data',s.data) order by s.id),'[]') from public.helmut_store s
   where exists(select 1 from roh r where s.id like 'main-rohstand-'||substring(r.id from 4)||'-%')),
 'findings',(select coalesce(jsonb_agg(to_jsonb(f) order by raw_document_id,source_id,retrieval_path_id,original_url),'[]')
   from public.document_findings f where raw_document_id in(select id from roh)),
 'bindungen',(select coalesce(jsonb_agg(to_jsonb(f) order by knowledge_object_id,ko_version,raw_document_id),'[]')
   from public.helmut_ko_quellenfassungen f where knowledge_object_id=any(pg_temp.breg_kos())),
 'rechte',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl::text) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in('raw_documents','helmut_store','helmut_ko_quellenfassungen')),
 'sicherung',jsonb_build_object(
  'kostenBuch',(select data->'betriebskostenBudget' from public.helmut_store where id='main-auth'),
  'authDigest',(select encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from public.helmut_store s where id='main-auth'),
  'aktiveCas',(select coalesce(jsonb_agg(to_jsonb(c) order by vorgang_id),'[]') from public.helmut_verstehen_reservierungen c
    where besitzer is not null or lease_bis is not null or zustand in('reserviert','modell-laeuft')),
  'aktiveJobs',(select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from public.helmut_jobs j
    where status='laeuft' or lease_owner is not null or lease_expires_at is not null),
  'aktiveSlots',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.helmut_klassen_slots l where belegt_bis>jetzt),
  'aktiveLlm',(select coalesce(jsonb_agg(to_jsonb(l) order by result_key),'[]') from public.llm_reservations l where status='reserviert' and expires_at>jetzt),
  'aktiveLocks',(select coalesce(jsonb_agg(to_jsonb(l) order by job_name),'[]') from public.pipeline_locks l where expires_at>jetzt),
  'globalUsed',coalesce((select used from public.llm_budget_counters where day=(jetzt at time zone 'UTC')::date::text and scope='global'),0),
  'originalUsed',coalesce((select verbraucht from public.helmut_anbieter_fenster where schluessel='quellenarbeit|originalabrufe'
    and fensterart='tag' and fenster_start=(jetzt at time zone 'UTC')::date::timestamptz),0),
  -- Nur Digests statt funktionsfremder historischer Vollbestandsausgabe.
  'jobs',pg_temp.breg_tabellenhash('public.helmut_jobs'::regclass),
  'cas',pg_temp.breg_tabellenhash('public.helmut_verstehen_reservierungen'::regclass),
  'vormerkungen',pg_temp.breg_tabellenhash('public.helmut_verstehen_vormerkungen'::regclass),
  'nutzung',pg_temp.breg_tabellenhash('public.llm_usage'::regclass),
  'kos',pg_temp.breg_tabellenhash('public.knowledge_objects'::regclass),
  'kanten',pg_temp.breg_tabellenhash('public.ko_document_links'::regclass),
  'zaehler',pg_temp.breg_tabellenhash('public.llm_budget_counters'::regclass),
  'ressourcen',pg_temp.breg_tabellenhash('public.helmut_anbieter_fenster'::regclass),
  'reservierungen',pg_temp.breg_tabellenhash('public.llm_reservations'::regclass),
  'slots',pg_temp.breg_tabellenhash('public.helmut_klassen_slots'::regclass),
  'locks',pg_temp.breg_tabellenhash('public.pipeline_locks'::regclass),
  'ablagen',(select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex')
    from (select encode(sha256(convert_to(to_jsonb(st)::text,'UTF8')),'hex') h from public.helmut_store st
    where id not like '%-rohstand-%' and id not like 'main-operator-breg-fassung-20261127%') zeilen)
 )) $$;
-- Historische Vollzeilenanker bleiben feste Untermenge. Regulare Nachtraege
-- werden im frischen Gesamtsnapshot gebunden und niemals hier ausgefiltert.
create function pg_temp.breg_anker() returns jsonb language sql immutable as $$
 select '{"archive":["0988609f9d2781689d2307af7b956aa651b21689cb69d51364a8edbbb4f86887","12a873c9483f3b95c831de07c96a423fbe4748af7d0a8c2d519081f3db77592c","183b7723db8ee943be02f479d2341d6d040cb1b205a8453b9fabb7e986f8550e","20430384a2a3319693892bcb5e383507127d0451cc589ee927083a9030b9a04d","239ace2aae6ab2ad9ff39e17583f9c2fc1f4ef8ea07b5cdb23b3c2338124d5ca","3b562e2d6a341e3820bd4c662604ee2092801897914f5ff4b63c39531ed7f309","5a988ac330a70333c12f4506627d924a784f4a8ea63d1cf1af34d7325bdf551d","609bdf233fe3c0979114d1f536818cd00e3d42bb9377431f7458692e5237a101","849cde9058163b0cbe7c05fa91ea555a7f17f982c44428fd7ff44709dc00e2d4","90c26af71b8b964042d78e8d967098b850f998b1ef4a3add3ad1a16a7e510360","966d9e3c28dfa1e5a95e450b9ee3b476a60ec8ef42c69c4384a2c6eedf2d6dde","ab4821fd905165b4ec2f9d01beb62fa7ef43f905ffaa3a145961e7682243a47b","ae5d98cbc7e3425e38abb00148b4cb41859e443a40ae3a10bf4e4a19d8b90c16","b0095dcd4e502d5393622b39df8847ab23183ad2e5e4b8dd33af24c168d009d6","c3149918bdaf363d563f53c2410b0fc5555d8dcc7bf44259b65b4f8d1e546021","db67da31bbc89d11e5f07828b0bcb63bda492e9d6baaacd1b1d8df0100f4f907","fa086caadc1bd5ddcc45f7b0f25789ebd7d0da57a7b3cbab62ff8ef61dbe0529"],"findings":["016934585597bf398b5a6ae0aaced084287cccf12c9d262a15a0b2f10ca00690","061d5a13e628e92148c6cadf56bd27d94fd65c87e4a95419d5367d5f983cf3d7","076b3175f81dbd08a64b0a00f753330fc5ed1655e50abfcb1eb1c4562b91c0f5","0e1c42228c6cddd9d821834aa03db57c96de510a39e93a1acb1f739fbf1d112a","144d25c7f454119e6282a26aece348d4d780d4aee07fefbb2100bbd27557e695","17bad0aab331c4449c552d09ccf62bb45d83f5146a0a8d34892255ee49554de6","17f4a1d01f549b51320ca632ed0fe4247d9e56c6cbebb4941c816d78fabcc22f","1845984c62d0631a69f0ab57712adeeef956f68b51bb2cdbb0f0d54f781d34fb","19e50431adf11ea8903bb6de05d6818fac6f13f59a6a72f101d808ce793c4ec7","1a75ae6b0fd0d5c04a62752b7d5df63f0e077d8d0290011cafefca307910ca51","1ff5b7e6c804136d877f38f45ec47a3a7dffaa9b01fe1440400b4a237e2c3155","20dbad3d05e3aee5abd60ca05ea682718252ca595ba5580e63e1bc7d1bcd18fe","220deee3339fada7ff936a316151730d9bf69bb6a80b091c5ca90f8fab778fc3","22f7892833be920fef8c5d98e4fdc430be4227c3fcd66b1756c408b282e0b4a8","2606f30fe290c290a16c773cbddfb128f12a4d61046bfc96a3c3ee89d6134433","273b7c94c1ed8a0a3b118a832f1e5dcf48a7e7cc6f33c5441c0146408d948bdd","29583413c604de3b6de91a544350c8e788aecded02460a7b812e2a6fe849c3e2","2b7c3840f2a51cc1b3e8ae1e42435797d63e0580671be54241e121c39966da07","2c6d158e62fffecb93fe4b752cbc521068c4f810d4abc832f2dd47903d79d718","2dbf01ec17547ee991869e763ec117427b21c033304d17532d5f51f457db9ad9","2e9f55b7e1f1af9b20b1926d5d67acbf2fc1fdbc7f63f7d73aa24b98322fffc9","2f435874b785a6bcd2edb0d740a1e2fdd47fd6075517dd12ebace8c2ebf872b5","3250b1c2f1a1b68fde1759d459b144ebef3b9ae3fdef30ffe908d85eee56466e","36c001a130bf6d7288cdbd75e0566fa3b1e4caa518e957b910c9a21c2298d876","375644f4f9e90f0774b0087dafc92a8c9da23bacb121fb918997316a93aff66c","38581e574e7dca2dd414bdca61c8d0a0dbcddbfa4e1c376b2cc71be2db85f0a2","398e566c82cc3931a7457426b8f2ab80c23cc7be518025841647aeca49668562","3a93f6850edcaee45436d57d290ae8f46e5ce88c43aa48b2910a6c212d047d91","3b7f68a1f528f87ee14ef45d646b69beff26ad5f4003f5f68adb5f1dc445dfaa","3f363e7efdc876e1ef406d7fa71efaeb81a074a3f171b6061c16f40bd2895f0a","406810c5880413475e3e81a641ca2ca83c43eb2e1c6a8d83a4508cd035b2c3fe","41b161a10710895e50351df602a84b8d56c1440288585c059eceb537bae59b93","45d83cef038986745db7958383f8aa0c48105ffae2b1f600eb8d4627cd52991a","4c7383d2d79ddb365f946bb2b79bcf647cf3095b79f380cef265d9a5e881d7e4","5104b7d0f351640eea13aaf5ba0a73737d850416a11aef0a6d37b0cb1eb3e23c","5246bf3b82b14b9bfe4a320936c58dfffffc571b083b26c79badacfb4b87df97","55406e566664fe71f412ac70f6a9f5e046c66d2d6dc39cb66e6c64a16c2ec917","591ea6a8b8091e209c431d20f2337b84be2904f66969c37d1d8755cb10a15839","59ae0583f43e4a92ab530721b4c662a221f90e9ff362ab94c664528cf298e463","5bae0c4adbe36d6fadd5ab3d5442d157d98ab8fc36d70a093da903cadf5e11e7","5bc6547a2d7a56e0055a2326b6ae9c70fe95a3c76f89eec47736d6b458d9caae","60e94475d5400d1340962da34d8b8c0295a46e04474d7340308c48c998d41810","6351b4c6aac7cce63206e2c449570d09f28b2843e261f325f9c9bdbecfed106d","687d3eb2f62ee335b6bb961efd35ce510aaac56f8bebc670bc4552bdbf101a91","6b5b35ecc87a9d3e7809bee0b46f83e3ffdac8a2161adba56e9aa2f794cf4df4","6bae642c80d8e5fddace3e8b2911c87e43aa2c80666c0d040d1769f2290d6103","6ef5698a7487dc95b5c574e265ab3c903c5355fb73f290f79c2cb41dfdbde4c4","6fc66341107bce5a433c64312bad135d112c40b38b6bf9e2838ddc79bd90904d","71a52509ecff280ab60d2cdd4a89eb04ac3be3e76010a023b0906e1df50ed5c0","73766c7e529f8a82cdee5ab07e75f4a701a2e5c5635f5fc36b39f57257649b39","75d7ecd13c33de04d7639c3742ae67238d69987b1cfda790d664e55057fcfb2e","76b41c42431ce3ba110da19fb904f51c073afc372dce35860cc61c15d39e8e46","7ac82dec0894bb1c7dc185007e4355f0836b674518377609e62a807dc451e01c","7d4607dfec49e3b7af70432ce4c45c2f581e88c35a01b9ef7d4ad816e65f52d7","80b35122095e3b96be9780588da242284fb8e75484bf2ef79954919c4062a770","829ae6cae7353d278f44aae5dc785e601f540cce7b788512cb64c18bcb1d3b84","88c6799d91a74f5de6e70511074ef3d67af085866b58e1da07cb064920276b8e","8af685ce09c7175a147ee0a540c621bb29b639170f93316c94193d4c7894b6a8","906707bc05a7ccc13cb4ae326b1be383d4516ea2ef74e54e2c44d2a43458bcb8","95e315c8c3484d4f9cc2acc4cc7fbc80135ba92c4ec5ba9f8aecae899540c938","971263893d21c80f77c497504e9d1d62c9777e6c6738ca24a387591d430b13a9","99dec8fb252a93963243ea9b9a1c52ad2815722cb2290699a2fce395773cd018","9fd7d7625617fd449dca8a7fe17a68029a0aa4bdc3b67862641f9713b273dde1","a0b3122227bf09842b3f467b3c918b9152e7a46933a7744aeb1873e5244cd386","a10f7b8447f84e5ac13b03d0a1a4edf4990b4dee88b9cec3793c1172d498d97b","a14c258a3fadea21866d5307846764cc82ca39e55d5cf6903da2062dbe32038b","a6de2d41b6ad6ea1482b039e719a5498f020a6aaef9d438d3bf46e09f84aad74","abc130d9d21b43d43014a6904276cbabb3c9fc65da8a14a5324104c6aad655cb","ac79a02da3c5e0145dff39d3f7a9b9dde4b0bd0c4e4f9c215d683ea844cfbbf5","ad0f476732c71e821c4d20fe3d7513114f8cfdc29e3b11b60a9249cfba90942d","ad8add298e845b28e553f56aa0b808955c0c98770704f72d42f3098edf418f4e","af1fc5df6c67cd5a030d638db74e60d06243d8f445b2481cecc1ea38608208fd","afc801d25f016d78d3a5e42d46a7760de2870c76930e7803f2c65e15eec0c4b1","b14a32fd0d197dd0e8e0138fab846d3d0a71f8248a2b9a71aab31ba8e9856a5e","b2b9fa6aec1b7744ac88df07a74fdb289acaac501fe03ab902cc1f87cc832999","b41674cdca7e8d01fbab75a5543196219ac9defd3c73bf30ed1a5d0ace4d53df","b828da76e886c0dc786a2e43ed26f7f189bbb866c65705fe48225890ea435c93","bacbc0065115a01833e80bdd693d508104500587ccfb5ee3b77594d923ab6f13","bce9b656ab2e50a0fad846381cbf36494eba52473248920c1c58d371c18f7865","bdee98d5a3dea8c0bb0f7104eda6b44b65fdd71c840ed6ad583120d0c826cbb5","bdf81b3d54c24cf239c958c798ee777b0eb0b58b4f14fca29fdb5e414818c16c","c33f1661c7aa1e642b573e3c10362ba7745f6a387344624ba3b40c5a8adbee70","c443e6c9fe1dcb5952baa92ffe311e821348ad8a7044c7c30d972068241630f2","c6ed65384a103621d1e0e27bede8d6bbfa57ec4828bdc1f90f56228a3a70ca28","c865e0a081020bde6b2ac6e62641f4eea46de6d0da4b8baa60b3563dfe193ecc","c992cf08a9f98ab8f0956d0bb9927816d6ac7aba6b5a635c2dfb039a89e86ef6","c9abc9146fffdb5896f4655d379b43cf8671bcbaadbc8a38f06aa1842ca718c2","cb36c020157baaede392c44262baebc1758502dd5d5842f3effb6c311e53458a","cbb75214707cf31ccc8352245025104783e715106c77cc06e07888e0a4e0f71b","cc9ba6c9b2fc48bc65f506e05c3fce7946f58c5cc937b859f54f6f938b95eec7","d3ae646e59cd61fd74b2a727a89aeddc44fb0d6085aa8399f69b55bdc7bae6c5","d66497ec0bd235c6c85d1d87209afebcb56d048e5b96db4f177541ea5c6c3958","d6ac240a37a7759732a581fc88b861c7ee520c23ffe942f1b6c75f067766f5df","dbc40d64578bb495b9a273d0f24df0bf9e7519e191afb1e94a653b64e9e68228","dc8b7bed5dddf6b9f474d7cb441a4497a974e62ca64a106e834e1ef29aeccff1","e73ff6aa3d09b4bf4bf6d7bf3adf23f9e6a2fcce58b997883f33b97212033f73","eb3e41a9516e5c85d0208fb22f9196d0064385a461841e5c2df8c65f6d60f79d","edde7fb78a2ecf50471de05c4c35ff8bc1c96a80f2ff194a8ae0b411ab162afa","f115a22f71281581494217ec7f4e1391836b0d68134244cb334c5281c8714ecb","f55e249ff926c5ff10e4d8487602503c7c4f427366956adc304b1e804609f3bf","f76b24743ebd0983e9f4a2ed59644ae1299f08caae4d4bb80a369df67ea0f07d","f789e94f3ac2d3eca77bdf77a4f58e9f25070ce0b871647a0d055430cbff7d73","f8d7b6c1ab514a3b0168b743d257ca5e75642410ee2880c01de841315fca0490","fd927b1e2bda71979414937f407b73ac34105c6da96e294fd282f5964a547cd9","ff96818d92f4f6c540910f6ef4274020f5f91bb2ecc9b227a9ee165f76cee803"]}'::jsonb $$;
create function pg_temp.breg_pruefeanker(zeilen jsonb,anker jsonb,art text) returns void language plpgsql stable as $$
declare ok boolean;
begin
 perform pg_temp.breg_fordere(jsonb_typeof(zeilen)='array','Originalanker '||art);
 with vollhashs as materialized(select pg_temp.breg_hash(z) h from jsonb_array_elements(zeilen) z),
 vorhanden as(select h,count(*) n from vollhashs group by h),
 erforderlich as(select h,count(*) n from jsonb_array_elements_text(anker) h group by h)
 select not exists(select 1 from erforderlich e left join vorhanden v using(h) where coalesce(v.n,0)<e.n) into ok;
 perform pg_temp.breg_fordere(ok,'unveraenderte Originalanker '||art);
end $$;
create function pg_temp.breg_plan(s jsonb) returns jsonb language plpgsql stable as $$
declare p jsonb:=pg_temp.breg_pins(); r jsonb; a jsonb; d jsonb; b jsonb; k jsonb; l jsonb; gruppe jsonb;
 neu jsonb:='[]'; bindungen jsonb:='[]'; alle jsonb:='{}'; stand text; aid text; sha text; n int; alt jsonb; nach jsonb;
begin
 foreach stand in array array['roh','kos','kanten','zielKanten'] loop
  perform pg_temp.breg_fordere(pg_temp.breg_hash(s->stand)=p->>stand,'fester Originalbestand '||stand);
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(s->'roh')=60 and jsonb_array_length(s->'kos')=2
  and jsonb_array_length(s->'kanten')=61 and jsonb_array_length(s->'archive')>=17
  and s->'bindungen'='[]'::jsonb,'Bestand60/2/61 mit Originalankern ohne Vorbindung');
 perform pg_temp.breg_pruefeanker(s->'archive',pg_temp.breg_anker()->'archive','archive');
 perform pg_temp.breg_pruefeanker(s->'findings',pg_temp.breg_anker()->'findings','findings');
 perform pg_temp.breg_fordere((select count(*)=count(distinct e->>'id') from jsonb_array_elements(s->'archive') e)
  and not exists(select 1 from jsonb_array_elements(s->'findings') f where not exists(
   select 1 from jsonb_array_elements(s->'roh') rr where rr->>'id'=f->>'raw_document_id')),
  'eindeutige Archive und feste Findings-Identitaeten');
 for a in select value from jsonb_array_elements(s->'archive') loop
  d:=public.helmut_quellenfassung_dokument(a->'data'->'dokument'->>'id',a->>'id',pg_temp.breg_hash(a->'data'),a->'data');
  select value into r from jsonb_array_elements(s->'roh') rr where rr->>'id'=d->>'id';
  perform pg_temp.breg_fordere(r is not null
   and (select array_agg(ak order by ak) from jsonb_object_keys(a->'data') ak)=array['dokument','quellenHash','version']
   and not d ? 'helmutQuellenfassung','Archivschema/RawID/Standhash');
  if not (pg_temp.breg_anker()->'archive') ? pg_temp.breg_hash(a) then
   perform pg_temp.breg_fordere(d->'url'=r->'url' and d->'canonical_url'=r->'canonical_url'
    and jsonb_build_array(d->'source_id',d->'source_name',d->'source_type',d->'link_type',d->'publisher_id',
     d->'raw'->'retrievalPathId',d->'raw'->'sourcePriority',d->'raw'->'originalUrl')
     =jsonb_build_array(r->'source_id',r->'source_name',r->'source_type',r->'link_type',r->'publisher_id',
     r->'raw'->'retrievalPathId',r->'raw'->'sourcePriority',r->'raw'->'originalUrl'),
    'zusaetzliches Archiv mit gleicher Quellenautoritaet');
  end if;
 end loop;
 for k in select value from jsonb_array_elements(s->'kos') loop
  n:=case when k->>'id'=(pg_temp.breg_kos())[1] then 60 else 1 end;
  perform pg_temp.breg_fordere(k->'ko_version'='1'::jsonb and k->>'understanding_status'='complete'
   and k->'verstehen_fencing'=case when n=60 then 'null'::jsonb else '1'::jsonb end
   and (select count(*) from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id')=n,'alte KO-Version');
 end loop;
 for r in select value from jsonb_array_elements(s->'roh') loop
  stand:=pg_temp.breg_stand(r);aid:='main-rohstand-'||substring(r->>'id' from 4)||'-'||stand;
  select value into a from jsonb_array_elements(s->'archive') where value->>'id'=aid;
  if a is not null then
   d:=public.helmut_quellenfassung_dokument(r->>'id',aid,pg_temp.breg_hash(a->'data'),a->'data');
   perform pg_temp.breg_fordere(to_jsonb(jsonb_populate_record(null::public.raw_documents,d))=r,'bestehender Archivkonflikt');
  else
   a:=jsonb_build_object('id',aid,'data',jsonb_build_object('version',1,'quellenHash',stand,'dokument',r));
   neu:=neu||jsonb_build_array(a);
  end if;
  alle:=alle||jsonb_build_object(r->>'id',jsonb_build_object('raw_source_version_id',aid,'raw_source_version_sha256',pg_temp.breg_hash(a->'data')));
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(neu)<=47,'hoechstens47 fehlende heutige Bestandssnapshots');
 for k in select value from jsonb_array_elements(s->'kos') loop
  select jsonb_agg(jsonb_build_object('raw_document_id',e->>'raw_document_id',
   'raw_source_version_id',alle->(e->>'raw_document_id')->>'raw_source_version_id',
   'raw_source_version_sha256',alle->(e->>'raw_document_id')->>'raw_source_version_sha256')
   order by e->>'raw_document_id' collate "C") into gruppe from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id';
  sha:=pg_temp.breg_hash(gruppe);n:=jsonb_array_length(gruppe);
  for l in select value from jsonb_array_elements(gruppe) loop
   bindungen:=bindungen||jsonb_build_array(l||jsonb_build_object('knowledge_object_id',k->>'id','ko_version',1,'quellen_count',n,'manifest_sha256',sha));
  end loop;
 end loop;
 select value into alt from jsonb_array_elements(s->'roh') where value->>'id'='rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068';
 select value->'data' into a from jsonb_array_elements(s->'archive') where value->>'id'=
 'main-rohstand-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068-0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795';
 d:=public.helmut_quellenfassung_dokument(alt->>'id','main-rohstand-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068-0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795',pg_temp.breg_hash(a),a);
 perform pg_temp.breg_fordere(pg_temp.breg_stand(alt)='add680be81a04d0e6f3c9de92adc2c55d258401d4a2428191527ed7fc8fd5160'
  and d->>'source_id'='bundesregierung' and d->>'source_name'='Bundesregierung' and d->>'source_type'='ministry'
  and d->'raw'->>'retrievalPathId'='rp-bundesregierung' and length(trim(d->>'summary'))>0
  and d->'url'=alt->'url' and d->'canonical_url'=alt->'canonical_url','amtliche gespeicherte RSSfassung');
 nach:=alt||jsonb_build_object('title',d->'title','source_id',d->'source_id','source_name',d->'source_name','source_type',d->'source_type',
  'published_at',d->'published_at','summary',d->'summary','retrieved_at',d->'retrieved_at','raw',d->'raw','content_fingerprint',null);
 nach:=to_jsonb(jsonb_populate_record(null::public.raw_documents,nach));
 perform pg_temp.breg_fordere(pg_temp.breg_stand(nach)='0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795','Promotionsfelder');
 return jsonb_build_object('neueArchive',neu,'bindungen',bindungen,'alt',alt,'nach',nach,
  'anzahl',jsonb_build_object('vorarchive',jsonb_array_length(s->'archive'),'neueArchive',jsonb_array_length(neu),
   'findings',jsonb_array_length(s->'findings'),'bindungen',61,'promotionen',1));
end $$;

create function pg_temp.breg_vertrag(c jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to('{"version":'||(c->'version')::text||',"profileId":'||(c->'profileId')::text
 ||',"startsAt":'||(c->'startsAt')::text||',"dailyLimitUsd":'||(c->'dailyLimitUsd')::text
 ||',"totalLimitUsd":'||(c->'totalLimitUsd')::text||',"route":{"provider":'||(c->'route'->'provider')::text
 ||',"responsesUrl":'||(c->'route'->'responsesUrl')::text||',"model":'||(c->'route'->'model')::text||'}}','UTF8')),'hex') $$;
create function pg_temp.breg_ruhe(s jsonb,jetzt timestamptz) returns void language plpgsql stable as $$
declare w jsonb:=s->'sicherung';buch jsonb:=w->'kostenBuch';total bigint;heute bigint;tag text:=(jetzt at time zone 'UTC')::date::text;
begin
 perform pg_temp.breg_fordere(w->'aktiveJobs'='[]'::jsonb and w->'aktiveSlots'='[]'::jsonb
  and w->'aktiveLlm'='[]'::jsonb and w->'aktiveLocks'='[]'::jsonb,'keine aktive Workerarbeit');
 perform pg_temp.breg_fordere(w->'aktiveCas'='[]'::jsonb or
  (jsonb_array_length(w->'aktiveCas')=7
   and pg_temp.breg_hash(w->'aktiveCas')='76f8a7856e80e9ea9b614c1aa11b57af3029ad764570027c3f7ea9b13252af18'
   and not exists(select 1 from jsonb_array_elements(w->'aktiveCas') c where
     (c->>'zustand' in('reserviert','modell-laeuft') and length(c->>'besitzer')>0
       and (c->>'lease_bis')::timestamptz<jetzt) is not true)),'nur exakt bekannte abgelaufene CAS');
 perform pg_temp.breg_fordere(buch->>'contractHash'='8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348'
  and buch->'contract'->>'contractHash'=buch->>'contractHash'
  and pg_temp.breg_vertrag(buch->'contract')=buch->>'contractHash' and buch->'version'='1'::jsonb
  and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract') k)=array['contractHash','dailyLimitUsd','profileId','route','startsAt','totalLimitUsd','version']
  and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract'->'route') k)=array['model','provider','responsesUrl']
  and buch->'contract'->'dailyLimitUsd'='1'::jsonb and buch->'contract'->'totalLimitUsd'='30'::jsonb
  and buch->'contract'->'route'->>'provider'='azure' and buch->'contract'->'route'->>'model'='gpt-5-mini-eu'
  and buch->'frozen'='null'::jsonb and jsonb_typeof(buch->'calls')='object','unveraenderter Finanzvertrag');
 select coalesce(sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end),0),
  coalesce(sum(case when value->>'day'=tag then case when value->>'status' in('abgerechnet','nicht-gesendet')
   then (value->>'cost')::bigint else (value->>'reserved')::bigint end else 0 end),0)
 into total,heute from jsonb_each(buch->'calls');
 perform pg_temp.breg_fordere(total=(buch->>'bound')::bigint and total between 0 and 30000000 and heute between 0 and 1000000
  and not exists(select 1 from jsonb_each(buch->'calls') t where (
   value->>'status' in('reserviert','ungeklaert','abgerechnet','nicht-gesendet') and value->>'id'=t.key
   and value->>'contractHash'=buch->>'contractHash' and value->>'model'=buch->'contract'->'route'->>'model'
   and value->>'requestHash' ~ '^[a-f0-9]{64}$' and value->>'day' ~ '^\d{4}-\d{2}-\d{2}$'
   and value->>'day'=substring(value->>'createdAt',1,10) and value->>'createdAt'>=buch->'contract'->>'startsAt'
   and jsonb_typeof(value->'maxOutputTokens')='number' and value->>'maxOutputTokens' ~ '^[0-9]+$'
   and (value->>'maxOutputTokens')::int between 1 and 8000 and jsonb_typeof(value->'reserved')='number'
   and (value->>'reserved')::bigint=200000+(value->>'maxOutputTokens')::bigint*4
   and (value->>'status' not in('abgerechnet','nicht-gesendet') or
     (jsonb_typeof(value->'cost')='number' and value->>'cost' ~ '^[0-9]+$'
      and (value->>'cost')::bigint between 0 and (value->>'reserved')::bigint))
   and (value->>'status'<>'nicht-gesendet' or value->'cost'='0'::jsonb)
   and (value->>'status'<>'abgerechnet' or jsonb_typeof(value->'usageReceiptId')='string')) is not true)
  and not exists(select 1 from jsonb_each(buch->'calls') t where value->>'status'='abgerechnet'
    group by value->>'usageReceiptId' having count(*)>1)
  and not exists(select 1 from jsonb_each(buch->'calls') t group by value->>'day' having
   sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end)
   >case when value->>'day'='2026-11-20' then 2000000 else 1000000 end)
  and (w->>'globalUsed')::bigint between 0 and 100 and (w->>'originalUsed')::bigint between 0 and 16,
 'vollstaendiges Finanzbuch1/30USD und100/16 ohne neue Reserve');
end $$;
create function pg_temp.breg_go(g jsonb,aktion text,digest text,jetzt timestamptz) returns void language plpgsql as $$
declare p jsonb;
begin
 perform pg_temp.breg_fordere(g->'approved'='true'::jsonb and g->>'scope'='BREG-BESTANDSFASSUNG-20261127'
  and g->>'aktion'=aktion and g->>'digest'=digest and g->>'codeCommit' ~ '^[a-f0-9]{40}$'
  and g->>'migrationSHA256' ~ '^[a-f0-9]{64}$'
  and (g->>'approvedAt')::timestamptz between jetzt-interval '5 minutes' and jetzt
  and g->>'tag'=(jetzt at time zone 'UTC')::date::text
  and g->>'policyHash'='23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff'
  and jsonb_array_length(g->'plattformen')=2,'frisches konkretes GO');
 perform pg_temp.breg_fordere((select array_agg(e->>'name' order by e->>'name') from jsonb_array_elements(g->'plattformen') e)=array['hetzner','vercel'],'beide Plattformen');
 for p in select value from jsonb_array_elements(g->'plattformen') loop
  perform pg_temp.breg_fordere(p->>'commit'=g->>'codeCommit' and p->'migration'='true'::jsonb
   and p->>'migrationSHA256'=g->>'migrationSHA256' and p->>'evidenceSHA256' ~ '^[a-f0-9]{64}$'
   and (p->>'checkedAt')::timestamptz between jetzt-interval '5 minutes' and jetzt
   and p->'httpStatus'='200'::jsonb and p->>'policyHash'=g->>'policyHash'
   and p->'dailyUsd'='1'::jsonb and p->'totalUsd'='30'::jsonb and p->'calls'='100'::jsonb
   and p->'originals'='16'::jsonb,'frischer Code/GET/GIZ/100/16-Plattformvorflug');
 end loop;
end $$;


do $breg$
declare p record; v_jetzt timestamptz := pg_catalog.clock_timestamp(); vor jsonb; nach jsonb;
 plan jsonb; b jsonb; q jsonb; altq jsonb; x jsonb; rawrow public.raw_documents; textvor text; digest text; n int;
 key constant text:='main-operator-breg-fassung-20261127';
begin
 select * into strict p from breg_parameter;
 perform pg_temp.breg_fordere(p.modus in('vorschau','freigeben','rueckweg'),'Modus');
 perform pg_temp.breg_fordere(octet_length(p.bindung::text)<=8192 and octet_length(p.freigabe::text)<=32768,'kleine konkrete Parameterhuelle');
 perform pg_temp.breg_fordere(current_user='postgres' and session_user='postgres','nur expliziter Datenbankeigner');
 perform pg_temp.breg_fordere((select count(*)=3 and bool_and(pg_get_userbyid(c.relowner)='postgres' and c.relrowsecurity)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in('raw_documents','helmut_store','helmut_ko_quellenfassungen'))
  and not has_table_privilege('service_role','public.helmut_ko_quellenfassungen','UPDATE,DELETE')
  and not has_table_privilege('anon','public.helmut_ko_quellenfassungen','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.helmut_ko_quellenfassungen','SELECT,INSERT,UPDATE,DELETE')
  and (select not prosecdef from pg_proc where oid=to_regprocedure('public.helmut_quellenfassung_dokument(text,text,text,jsonb)')),'Owner/RLS/append-only/invoker ABI');
 if p.modus<>'vorschau' then
  -- Verhindert konkurrierende neue Claims, Slot-, Kosten- und Quellenwrites.
  -- Keine persistierenden Funktionen/Trigger/DDL und kein Schreibretry.
  lock table public.raw_documents,public.knowledge_objects,public.ko_document_links,
   public.helmut_store,public.helmut_ko_quellenfassungen,public.document_findings,
   public.helmut_jobs,public.helmut_verstehen_reservierungen,public.helmut_verstehen_vormerkungen,
   public.llm_usage,public.llm_budget_counters,public.llm_reservations,
   public.helmut_anbieter_fenster,public.helmut_klassen_slots,public.pipeline_locks in share row exclusive mode;
  perform 1 from public.knowledge_objects where id=any(pg_temp.breg_kos()) order by id for update;
  perform 1 from public.raw_documents where id in(select raw_document_id from public.ko_document_links
   where knowledge_object_id=any(pg_temp.breg_kos())) order by id for update;
  perform 1 from public.ko_document_links where knowledge_object_id=any(pg_temp.breg_kos()) order by knowledge_object_id,raw_document_id for update;
  perform 1 from public.helmut_store where id='main-auth' or exists(select 1 from public.ko_document_links l
   where l.knowledge_object_id=any(pg_temp.breg_kos()) and helmut_store.id like 'main-rohstand-'||substring(l.raw_document_id from 4)||'-%')
   order by id for update;
 end if;
 vor:=pg_temp.breg_snapshot(v_jetzt);textvor:=vor::text;digest:=encode(sha256(convert_to(textvor,'UTF8')),'hex');
 perform pg_temp.breg_ruhe(vor,v_jetzt);
 if p.modus='vorschau' then
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_store where id=key),'Einmalrecht bereits verbraucht');
  plan:=pg_temp.breg_plan(vor);
  insert into breg_ausgabe values(jsonb_build_object('version',1,'modus','vorschau','gelesenAm',v_jetzt,
    'tag',(v_jetzt at time zone 'UTC')::date::text,'inhalt',textvor,'digest',digest));
 elsif p.modus='freigeben' then
  b:=p.bindung;
  perform pg_temp.breg_go(p.freigabe,'freigeben',b->>'digest',v_jetzt);
  perform pg_temp.breg_fordere(b->'version'='1'::jsonb and b->>'modus'='vorbereitet' and b->'aktiviert'='false'::jsonb
   and (b->>'gelesenAm')::timestamptz between v_jetzt-interval '5 minutes' and v_jetzt
   and b->>'tag'=(v_jetzt at time zone 'UTC')::date::text and b->>'digest'=digest,
   'frischer unveraenderter atomarer Vorwert');
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_store where id=key or id=key||'-rueckweg'),'Einmalrecht bereits verbraucht');
  plan:=pg_temp.breg_plan(vor);
  perform pg_temp.breg_fordere(pg_temp.breg_hash(plan)=b->>'planDigest','unabhaengig nativ gepruefter Plan');
  for x in select value from jsonb_array_elements(plan->'neueArchive') loop
   -- Kollision ist immer STOP, niemals ON CONFLICT IGNORE.
   insert into public.helmut_store(id,data) values(x->>'id',x->'data');
  end loop;
  insert into public.helmut_ko_quellenfassungen(knowledge_object_id,ko_version,raw_document_id,
    raw_source_version_id,raw_source_version_sha256,quellen_count,manifest_sha256)
   select e->>'knowledge_object_id',(e->>'ko_version')::int,e->>'raw_document_id',
    e->>'raw_source_version_id',e->>'raw_source_version_sha256',(e->>'quellen_count')::int,e->>'manifest_sha256'
    from jsonb_array_elements(plan->'bindungen') e;
  get diagnostics n=row_count;
  perform pg_temp.breg_fordere(n=61 and (select count(*)=2 and bool_and(vollstaendig) from public.helmut_ko_quellenmanifeste
   where knowledge_object_id=any(pg_temp.breg_kos()) and ko_version=1),'61 vollstaendige Bindungen');
  -- Vor der Promotion muessen beide Altleser exakt ihre bisherigen Vollzeilen liefern.
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_ko_quellen q
   where q.knowledge_object_id=any(pg_temp.breg_kos()) and
   to_jsonb(jsonb_populate_record(null::public.raw_documents,public.helmut_quellenfassung_dokument(
     q.raw_document_id,q.raw_source_version_id,q.raw_source_version_sha256,q.source_archive)))
    is distinct from (select r from jsonb_array_elements(vor->'roh') r where r->>'id'=q.raw_document_id)),
  'historische Vollquellen unveraendert');
  rawrow:=jsonb_populate_record(null::public.raw_documents,plan->'nach');
  update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=null
    where r.id=rawrow.id and to_jsonb(r)=plan->'alt';
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'genau eine vorwertgebundene Rawpromotion');
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and nach->'zielKanten'=vor->'zielKanten' and jsonb_array_length(nach->'archive')=
     jsonb_array_length(vor->'archive')+jsonb_array_length(plan->'neueArchive')
    and jsonb_array_length(nach->'bindungen')=61
    and (select r from jsonb_array_elements(nach->'roh') r where r->>'id'=rawrow.id)=plan->'nach'
    and not exists(select 1 from jsonb_array_elements(vor->'archive') a where not nach->'archive' @> jsonb_build_array(a)),
   'nur fehlende Archive+61+1 und bitgleiche Finanzen/KOs/Jobs/Journale/Findings/Rechte');
  q:=jsonb_build_object('version',1,'modus','aktiviert','id',key,'aktiviertAm',v_jetzt,
    'vorDigest',digest,'nachDigest',pg_temp.breg_hash(nach),'planDigest',pg_temp.breg_hash(plan),
    'plan',plan,'bindungen',nach->'bindungen','go',p.freigabe,
    'hinweis','Heutiger Bestandssnapshot; kein historischer Lektuere-/Neufetchbeleg. Kein Workerstart.');
  insert into public.helmut_store(id,data) values(key,q);
  perform pg_temp.breg_fordere((select data=q from public.helmut_store where id=key),'persistierte Aktivierungsquittung');
  insert into breg_ausgabe values(q);
 else
  select data into strict altq from public.helmut_store where id=key for update;
  perform pg_temp.breg_fordere(p.bindung->>'id'=key and p.bindung->'version'='1'::jsonb
    and p.bindung->>'receiptSHA256'=pg_temp.breg_hash(altq) and altq->>'modus'='aktiviert'
    and altq->>'nachDigest'=pg_temp.breg_hash(vor) and altq->>'planDigest'=pg_temp.breg_hash(altq->'plan')
    and altq->'bindungen'=vor->'bindungen' and not exists(select 1 from public.helmut_store where id=key||'-rueckweg'),
    'persistierte Quittung; keinerlei Konsum/Claim/Drift; Rueckweg einmalig');
  perform pg_temp.breg_go(p.freigabe,'rueckweg',altq->>'nachDigest',v_jetzt);
  plan:=altq->'plan';
  perform pg_temp.breg_fordere((select r from jsonb_array_elements(vor->'roh') r where r->>'id'=plan->'nach'->>'id')=plan->'nach',
    'exakte promovierte Vorfassung');
  rawrow:=jsonb_populate_record(null::public.raw_documents,plan->'alt');
  update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=rawrow.content_fingerprint
    where r.id=rawrow.id and to_jsonb(r)=plan->'nach';
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'Rueckweg genau eine Rawzeile');
  delete from public.helmut_ko_quellenfassungen f where knowledge_object_id=any(pg_temp.breg_kos())
    and ko_version=1 and exists(select 1 from jsonb_array_elements(altq->'bindungen') eb where to_jsonb(f)=eb.value);
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=61,'Rueckweg genau61 quittierte Bindungen');
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'archive'=vor->'archive' and nach->'bindungen'='[]'::jsonb
    and nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and pg_temp.breg_hash(nach->'roh')=pg_temp.breg_pins()->>'roh','Rueckweg;alle Archive/Finanzen/Historie bleiben erhalten');
  q:=jsonb_build_object('version',1,'modus','zurueckgenommen','id',key||'-rueckweg','zurueckAm',v_jetzt,
   'aktivierungsSHA256',pg_temp.breg_hash(altq),'nachDigest',pg_temp.breg_hash(nach),'go',p.freigabe);
  insert into public.helmut_store(id,data) values(key||'-rueckweg',q);
  insert into breg_ausgabe values(q);
 end if;
end $breg$;
select data from breg_ausgabe;
commit;

