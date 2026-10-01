-- Inerte Vorbereitung. KEINE Profile/Slots/Aktivierung und kein Scheduler.
-- Installation separat pruefen/freigeben; alter null500-Endpfad unveraendert.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
create schema helmut_real500_internal;
revoke all on schema helmut_real500_internal from public;

-- Kanonische JSON-Schreibweise fuer die lokal aus JS serialisierten Bindungen.
-- Getrennte SQL-Selbsthashes verhindern zudem versehentliche JSONB-Paarvertauschung.
create function helmut_real500_internal.json_compact(p jsonb) returns text
language plpgsql immutable security invoker set search_path=pg_catalog as $compact$
declare r text; digits text; signum text; exponent integer; numeric_value numeric;
begin
  case jsonb_typeof(p)
    when 'object' then
      select '{'||coalesce(string_agg(to_jsonb(k)::text||':'||helmut_real500_internal.json_compact(v),',' order by k collate "C"),'')||'}'
        into r from jsonb_each(p) x(k,v);
    when 'array' then
      select '['||coalesce(string_agg(helmut_real500_internal.json_compact(v),',' order by n),'')||']'
        into r from jsonb_array_elements(p) with ordinality x(v,n);
    when 'number' then
      numeric_value := (p::text)::numeric;
      r := trim_scale(numeric_value)::text;
      -- JSON.stringify benutzt Exponenten ab 1e21 und unter 1e-6; der
      -- Snapshot kam bereits als JSON.stringify-JSON an, nicht als DB-Float.
      if numeric_value<>0 and (abs(numeric_value)>=1e21 or abs(numeric_value)<1e-6) then
        signum := case when numeric_value<0 then '-' else '' end;
        r := trim_scale(abs(numeric_value))::text;
        if abs(numeric_value)>=1e21 then
          exponent := length(split_part(r,'.',1))-1;
          digits := rtrim(replace(r,'.',''),'0');
        else
          digits := regexp_replace(split_part(r,'.',2),'^0+','');
          exponent := -(length(split_part(r,'.',2))-length(digits)+1);
        end if;
        r := signum||left(digits,1)||case when length(digits)>1 then '.'||substr(digits,2) else '' end
          ||'e'||case when exponent>=0 then '+' else '' end||exponent::text;
      end if;
    else r := p::text;
  end case;
  return r;
end $compact$;

create function helmut_real500_internal.pruefe(p_operation_id text,p_manifest_hash text,p_production_commit text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $pruefe$
declare
  e jsonb;
  m jsonb;
  runtime_manifest jsonb;
  s jsonb;
  q jsonb;
  b jsonb;
  ids jsonb := '["bundestag-1047276-1047276","bundestag-1047906-1047906","bundestag-abdi-sanae-1043330","bundestag-abraham-knut-1043342","bundestag-achelwilm-doris-1043346","bundestag-aeikens-anna-1043358","bundestag-ahmetovic-adis-1043370","bundestag-akbulut-goekay-1043376","bundestag-aken-jan-1043380","bundestag-al-wazir-tarek-1043422","bundestag-alabali-radovan-reem-1043386","bundestag-alhamwi-alaa-1043402","bundestag-altenkamp-norbert-1043416","bundestag-amthor-philipp-1043428","bundestag-asar-ayse-1043460","bundestag-asghari-reza-1086638","bundestag-audretsch-andreas-1043476","bundestag-auernhammer-artur-1048348","bundestag-aumer-peter-1048350","bundestag-baer-dorothee-1043526","bundestag-baer-karl-1043528","bundestag-banaszak-felix-1043522","bundestag-bareiss-thomas-1048368","bundestag-bartol-soeren-1043546","bundestag-bas-baerbel-1043554","bundestag-beck-katharina-1043580","bundestag-becker-desiree-1043592","bundestag-beek-sascha-1043614","bundestag-behrens-jens-1043618","bundestag-benner-lukas-1043648","bundestag-bernstein-melanie-1043686","bundestag-bettermann-daniel-1043690","bundestag-beutin-lorenz-1043694","bundestag-biadacz-marc-1048416","bundestag-bilger-steffen-1048434","bundestag-blankenburg-jakob-1043716","bundestag-bodin-leif-1043740","bundestag-boettger-janina-1043784","bundestag-bollmann-hendrik-1043756","bundestag-bosch-jorrit-1043776","bundestag-bouffier-frederik-1043786","bundestag-brand-michael-1043790","bundestag-brandl-reinhard-1048450","bundestag-brantner-franziska-1043804","bundestag-breher-silvia-1043814","bundestag-breilmann-michael-1183252","bundestag-bremer-anne-1043820","bundestag-brinkhaus-ralph-1048460","bundestag-brinkmann-lutz-1043826","bundestag-brossart-victoria-1043840","bundestag-brueckner-maik-1043848","bundestag-brugger-agnieszka-1043850","bundestag-buedenbender-benedikt-1043872","bundestag-bury-yannick-1048484","bundestag-cademartori-isabel-1043926","bundestag-carstensen-sandra-1043934","bundestag-cezanne-joerg-1043940","bundestag-connemann-gitta-1043962","bundestag-conrad-agnes-1043964","bundestag-cosse-juergen-1043972","bundestag-dahmen-janosch-1043990","bundestag-demuth-ellen-1044020","bundestag-dieren-jan-1044048","bundestag-dilcher-esther-1044056","bundestag-dillschneider-jeanne-1044058","bundestag-dittmar-sabine-1044066","bundestag-dobrindt-alexander-1044072","bundestag-doering-felix-1044088","bundestag-donth-michael-1048526","bundestag-duering-deborah-1044118","bundestag-durz-hansjoerg-1048536","bundestag-ebmeyer-joachim-1044138","bundestag-ebner-harald-1044140","bundestag-ehm-lars-1044168","bundestag-eichwede-sonja-1044174","bundestag-eissing-mandy-1044186","bundestag-emmerich-marcel-1044196","bundestag-engelhard-alexander-1048558","bundestag-erndl-thomas-1048566","bundestag-ernst-bastian-1044216","bundestag-esdar-wiebke-1044222","bundestag-esken-saskia-1044226","bundestag-faerber-hermann-1044260","bundestag-faeser-nancy-1044244","bundestag-fahl-fabian-1044246","bundestag-fechner-johannes-1044266","bundestag-feiler-uwe-1044276","bundestag-fey-katrin-1044300","bundestag-fiedler-sebastian-1044302","bundestag-fischer-simone-1044328","bundestag-frauenpreiss-christoph-1044368","bundestag-frieser-michael-1044396","bundestag-gastel-matthias-1044446","bundestag-gebel-kathrin-1044460","bundestag-gebhart-thomas-1044466","bundestag-geissler-jonas-1048618","bundestag-gennburg-katalin-1044470","bundestag-gerster-martin-1044480","bundestag-gesenhues-jan-1044484","bundestag-glaser-stefan-1048634","bundestag-gloeckner-angelika-1044518","bundestag-goering-eckardt-katrin-1044556","bundestag-goerke-christian-1044558","bundestag-gohlke-nicole-1044540","bundestag-graessle-ingeborg-1048650","bundestag-grasse-adrian-1044590","bundestag-grau-armin-1044594","bundestag-gregosz-david-1044600","bundestag-griese-kerstin-1044602","bundestag-guenther-georg-1044652","bundestag-guentzler-fritz-1044656","bundestag-guerpinar-ates-1044658","bundestag-haase-christian-1048668","bundestag-hain-heiko-1044706","bundestag-hakverdi-metin-1044714","bundestag-hardt-juergen-1044742","bundestag-hartmann-sebastian-1044764","bundestag-hasselmann-britta-1044778","bundestag-heil-hubertus-1044824","bundestag-heil-mechthild-1044822","bundestag-heiligenstadt-frauke-1044826","bundestag-heinrich-gabriela-1044842","bundestag-helfrich-mark-1044862","bundestag-henrichmann-marc-1048708","bundestag-herbstreuth-diana-1044916","bundestag-heselhaus-nadine-1044944","bundestag-heubach-heike-1044962","bundestag-heuberger-moritz-1044964","bundestag-hiller-matthias-1048714","bundestag-hoffmann-alexander-1048720","bundestag-hoffmann-philip-1045026","bundestag-hofreiter-anton-1045040","bundestag-hoppenstedt-hendrik-1045070","bundestag-hoppermann-franziska-1045072","bundestag-hoss-luke-1045106","bundestag-hostert-jasmina-1045108","bundestag-hubertz-verena-1045124","bundestag-janssen-anne-1045200","bundestag-jarzombek-thomas-1045202","bundestag-jordan-alexander-1045230","bundestag-joswig-julian-1045232","bundestag-kaczmarek-oliver-1045254","bundestag-kaiser-elisabeth-1045268","bundestag-kaminski-maren-1045282","bundestag-kappert-gonther-kirsten-1045310","bundestag-karaahmetoglu-macit-1045312","bundestag-karliczek-anja-1045318","bundestag-kersten-franziska-1045366","bundestag-khan-misbah-1045380","bundestag-kiessling-michael-1048786","bundestag-kippels-georg-1045390","bundestag-kleebank-helmut-1045402","bundestag-klingbeil-lars-1045428","bundestag-klose-annika-1045438","bundestag-kluessendorf-tim-1045446","bundestag-knoerig-axel-1045462","bundestag-kocak-ferat-1045472","bundestag-koelbl-daniel-1045508","bundestag-koenig-anne-1048814","bundestag-koerber-carsten-1045540","bundestag-koerner-konrad-1045550","bundestag-koller-johann-1045510","bundestag-koob-markus-1045530","bundestag-korbach-stefan-1045536","bundestag-kramme-anette-1045582","bundestag-krampe-jan-1045564","bundestag-kreiser-dunja-1045600","bundestag-krichbaum-gunther-1048828","bundestag-krieger-lukas-1045624","bundestag-krings-guenter-1045628","bundestag-kroeber-martin-1045634","bundestag-kuban-tilman-1045660","bundestag-latendorf-ina-1045738","bundestag-lemke-sonja-1045784","bundestag-lenhard-rebecca-1045792","bundestag-lenz-andreas-1048878","bundestag-limbacher-esra-1045824","bundestag-limburg-helge-1045826","bundestag-lindh-helge-1045828","bundestag-lindholz-andrea-1045830","bundestag-linnemann-carsten-1048896","bundestag-lips-patricia-1045854","bundestag-loop-denise-1045868","bundestag-lucks-max-1045878","bundestag-luczak-jan-1045880","bundestag-luebcke-andrea-1045874","bundestag-luehrmann-anna-1045894","bundestag-lugk-bettina-1045892","bundestag-machalet-tanja-1045922","bundestag-mackensen-geis-isabel-1045928","bundestag-mandrella-david-1045958","bundestag-mann-holger-1045960","bundestag-marvi-parsa-1045992","bundestag-mast-katja-1046000","bundestag-mattfeldt-andreas-1046008","bundestag-mayer-lay-volker-1048934","bundestag-mayer-stephan-1048932","bundestag-mayer-zoe-1046026","bundestag-mazzi-tamara-1046028","bundestag-meiser-pascal-1046050","bundestag-meister-michael-1046052","bundestag-merendino-ottavia-1046072","bundestag-merz-friedrich-1046080","bundestag-metzler-jan-1046086","bundestag-michaelsen-swantje-1046108","bundestag-michel-kathrin-1048962","bundestag-middelberg-mathias-1046116","bundestag-miersch-matthias-1046120","bundestag-mieves-matthias-1046124","bundestag-mihalic-irene-1046128","bundestag-mijatovic-boris-1046130","bundestag-mirow-sahra-1046140","bundestag-moeller-siemtje-1046172","bundestag-moll-claudia-1046166","bundestag-mueller-axel-1048984","bundestag-mueller-carsten-1046224","bundestag-mueller-florian-1046234","bundestag-mueller-sascha-1046248","bundestag-mueller-sepp-1046250","bundestag-muetzenich-rolf-1046274","bundestag-nacke-stefan-1046276","bundestag-nanni-sara-1046284","bundestag-naser-christoph-1182708","bundestag-nasr-rasha-1046286","bundestag-neuhaeuser-charlotte-1046310","bundestag-nick-ophelia-1046332","bundestag-notz-konstantin-1046366","bundestag-nouripour-omid-1046368","bundestag-oellers-wilfried-1046398","bundestag-oest-florian-1046402","bundestag-oezoguz-aydan-1046460","bundestag-orthey-harald-1046420","bundestag-ortleb-josephine-1046422","bundestag-ossner-florian-1049032","bundestag-oster-josef-1046428","bundestag-otte-karoline-1046442","bundestag-pantazis-christos-1046474","bundestag-pantisano-luigi-1046476","bundestag-paus-lisa-1046498","bundestag-pawlik-natalie-1046500","bundestag-peick-jens-1046504","bundestag-pellmann-soeren-1046508","bundestag-piechotta-paula-1046534","bundestag-pilsinger-stephan-1046542","bundestag-pistorius-boris-1046550","bundestag-ploss-christoph-1046560","bundestag-plum-martin-1046564","bundestag-poepsel-oliver-1046586","bundestag-polat-filiz-1046574","bundestag-poschmann-sabine-1046592","bundestag-preisendanz-david-1049074","bundestag-rachel-thomas-1046652","bundestag-radomski-kerstin-1046660","bundestag-radwan-alexander-1049086","bundestag-reddig-pascal-1046704","bundestag-rehbaum-henning-1049104","bundestag-reichardt-truels-1046712","bundestag-reichel-markus-1046714","bundestag-reisner-lea-1046742","bundestag-rietenberg-sylvia-1046792","bundestag-rinkert-daniel-1046796","bundestag-roettgen-norbert-1049138","bundestag-rohde-dennis-1046814","bundestag-rohwer-lars-1046822","bundestag-roloff-sebastian-1046828","bundestag-roth-claudia-1046858","bundestag-rothenberger-johannes-1049136","bundestag-rottwilm-philipp-1046874","bundestag-rudolph-thorsten-1046882","bundestag-rueffer-corinna-1046892","bundestag-ruetzel-bernd-1046916","bundestag-rump-daniela-1046900","bundestag-rupprecht-albert-1046908","bundestag-santos-wintz-catarina-1046964","bundestag-sassenrath-carl-1046970","bundestag-scheer-nina-1047022","bundestag-schliesing-david-1047102","bundestag-schmidt-henri-1047142","bundestag-schmidt-sebastian-1047166","bundestag-schmidt-stefan-1047168","bundestag-schmidt-uwe-1047170","bundestag-schneider-julia-1047200","bundestag-schoenberger-marlene-1047232","bundestag-schoetz-evelyn-1047244","bundestag-schraps-johannes-1047252","bundestag-schulze-svenja-1047308","bundestag-schwartze-stefan-1047344","bundestag-schwerdtner-ines-1047360","bundestag-seidler-stefan-1047378","bundestag-seif-detlef-1047380","bundestag-seitzl-lina-1047394","bundestag-simon-bjoern-1047448","bundestag-slawik-nyke-1047458","bundestag-sorge-tino-1047476","bundestag-staffler-katrin-1047508","bundestag-steffen-till-1047534","bundestag-stegemann-albert-1047540","bundestag-stegner-ralf-1047542","bundestag-steineke-sebastian-1047556","bundestag-steinmueller-hanna-1047564","bundestag-stier-dieter-1047580","bundestag-stumpp-christina-1047632","bundestag-tauschwitz-vivian-1047674","bundestag-tesfaiesus-awet-1047698","bundestag-theiss-hans-1047718","bundestag-thoden-ulrich-1047738","bundestag-throm-alexander-1049290","bundestag-timmermann-fechter-astrid-1047754","bundestag-toens-markus-1047772","bundestag-valent-aaron-1047844","bundestag-vandre-isabelle-1047846","bundestag-verlinden-julia-1047856","bundestag-vieregge-kerstin-1047860","bundestag-vogt-oliver-1047874","bundestag-vogtschmidt-donata-1047876","bundestag-vollath-sarah-1047888","bundestag-wagener-niklas-1047918","bundestag-wagner-sascha-1047948","bundestag-walch-siegfried-1049328","bundestag-weiss-maria-1049354","bundestag-whittaker-kai-1049362","bundestag-wiegelmann-johannes-1048118","bundestag-wiener-klaus-1048126","bundestag-willsch-klaus-1048150","bundestag-winkelmeier-becker-elisabeth-1048162","bundestag-winkler-tobias-1049378","bundestag-wissler-janine-1048194","bundestag-wittmann-mechthilde-1048210","bundestag-ziemiak-paul-1048298","bundestag-zobel-vanessa-1048318","landtag-berlin-aldona-maria-niemczyk","landtag-berlin-alexander-freier-winterwerb","landtag-berlin-alexander-herrmann","landtag-berlin-alexander-king","landtag-berlin-andre-schulze","landtag-berlin-andreas-geisel","landtag-berlin-andreas-otto","landtag-berlin-anne-helm","landtag-berlin-antje-kapek","landtag-berlin-ario-ebrahimpour-mirzaie","landtag-berlin-ariturel-hack","landtag-berlin-bahar-haghanipour","landtag-berlin-benedikt-lux","landtag-berlin-bettina-jarasch","landtag-berlin-bettina-konig","landtag-berlin-bettina-meissner","landtag-berlin-bjorn-wohlert","landtag-berlin-burkard-dregger","landtag-berlin-c3-9clker-radziwill","landtag-berlin-carsten-schatz","landtag-berlin-catherina-pieroth-manelli","landtag-berlin-catrin-wahlen","landtag-berlin-christian-goiny","landtag-berlin-christian-zander","landtag-berlin-christoph-wapler","landtag-berlin-christopher-forster","landtag-berlin-claudia-wein","landtag-berlin-cornelia-seibeld","landtag-berlin-damiano-valgolio","landtag-berlin-daniel-wesener","landtag-berlin-daniela-billig","landtag-berlin-danny-freymark","landtag-berlin-dennis-buchner-1","landtag-berlin-dennis-haustein","landtag-berlin-derya-caglar","landtag-berlin-dirk-stettner","landtag-berlin-dunja-wolff","landtag-berlin-elif-eralp","landtag-berlin-elke-breitenbach","landtag-berlin-ersin-nas","landtag-berlin-florian-dorstelmann","landtag-berlin-frank-balzer","landtag-berlin-frank-luhmann","landtag-berlin-franziska-brychcy","landtag-berlin-franziska-giffey","landtag-berlin-franziska-leschewitz","landtag-berlin-gollaleh-ahmadi","landtag-berlin-heiko-melzer","landtag-berlin-hendrikje-klein","landtag-berlin-ina-czyborra","landtag-berlin-iris-gertig","landtag-berlin-iris-spranger","landtag-berlin-jan-lehmann","landtag-berlin-jian-omar","landtag-berlin-johannes-kraft","landtag-berlin-johannes-martin","landtag-berlin-jorg-stroedter","landtag-berlin-julian-schwarze","landtag-berlin-june-tomiak","landtag-berlin-kai-wegner","landtag-berlin-katharina-gunther-wunsch","landtag-berlin-katharina-senge","landtag-berlin-katina-schubert","landtag-berlin-katrin-schmidberger","landtag-berlin-kerstin-brauner","landtag-berlin-klara-schedlich","landtag-berlin-klaus-lederer","landtag-berlin-kristian-ronneburg","landtag-berlin-kurt-wansner","landtag-berlin-lars-bocian","landtag-berlin-lars-dusterhoft","landtag-berlin-lars-rauchfuss","landtag-berlin-laura-neugebauer","landtag-berlin-lilia-usik","landtag-berlin-linda-vierecke","landtag-berlin-lisa-knack","landtag-berlin-louis-kruger","landtag-berlin-lucas-schaal","landtag-berlin-maik-penn","landtag-berlin-maja-lasi-c4-87","landtag-berlin-manuela-schmidt","landtag-berlin-marcel-hopp","landtag-berlin-marco-hahnfeld","landtag-berlin-marianne-burkert-eulitz","landtag-berlin-martin-matz","landtag-berlin-martin-patzold","landtag-berlin-martin-sattelkau","landtag-berlin-mathias-schulz","landtag-berlin-matthias-kollatz","landtag-berlin-melanie-kuhnemann-grunow","landtag-berlin-michael-dietmann","landtag-berlin-michael-efler","landtag-berlin-mirjam-golm","landtag-berlin-niklas-grasselt","landtag-berlin-niklas-schenker","landtag-berlin-niklas-schrader","landtag-berlin-oda-hassepass","landtag-berlin-olaf-schenk","landtag-berlin-olga-gauks","landtag-berlin-orkan-ozdemir","landtag-berlin-peer-mock-stumer-1","landtag-berlin-petra-vandrey","landtag-berlin-philipp-bertram","landtag-berlin-raed-saleh","landtag-berlin-reinhard-naumann","landtag-berlin-robbin-juhnke","landtag-berlin-roman-simon","landtag-berlin-sandra-khalatbari","landtag-berlin-sebahat-atli","landtag-berlin-sebastian-schlusselburg","landtag-berlin-sebastian-walter","landtag-berlin-sevim-aydin","landtag-berlin-silke-gebel","landtag-berlin-stefan-taschner","landtag-berlin-stefan-ziller","landtag-berlin-steffen-zillich","landtag-berlin-stephan-lenz","landtag-berlin-susanna-kahlefeld","landtag-berlin-sven-heinemann","landtag-berlin-tobias-schulze","landtag-brandenburg-11245","landtag-brandenburg-11247","landtag-brandenburg-11249","landtag-brandenburg-11250","landtag-brandenburg-11263","landtag-brandenburg-11284","landtag-brandenburg-13035","landtag-brandenburg-13468","landtag-brandenburg-13478","landtag-brandenburg-13479","landtag-brandenburg-13480","landtag-brandenburg-13909","landtag-brandenburg-23854","landtag-brandenburg-24171","landtag-brandenburg-24173","landtag-brandenburg-24174","landtag-brandenburg-24176","landtag-brandenburg-24178","landtag-brandenburg-24180","landtag-brandenburg-24181","landtag-brandenburg-24183","landtag-brandenburg-24185","landtag-brandenburg-24187","landtag-brandenburg-24188","landtag-brandenburg-24191","landtag-brandenburg-24195","landtag-brandenburg-24198","landtag-brandenburg-25782","landtag-brandenburg-33745","landtag-brandenburg-40587","landtag-brandenburg-40588","landtag-brandenburg-40589","landtag-brandenburg-40591","landtag-brandenburg-40592","landtag-brandenburg-40593","landtag-brandenburg-40594","landtag-brandenburg-40595","landtag-brandenburg-40596","landtag-brandenburg-40597","landtag-brandenburg-40599","landtag-brandenburg-40618","landtag-brandenburg-40620","landtag-brandenburg-40621","landtag-brandenburg-40622","landtag-brandenburg-40623","landtag-brandenburg-40625","landtag-brandenburg-40626","landtag-brandenburg-40629","landtag-brandenburg-40630","landtag-brandenburg-40631"]'::jsonb;
  fach jsonb;
  identitaeten jsonb;
  snapshot_mandate jsonb;
  snapshot_profiles jsonb;
  snapshot_fach jsonb;
  snapshot_fremd jsonb;
  erwartet_null jsonb;
  n integer;
begin
  if p_operation_id is null or p_operation_id !~ '^real500-[a-zA-Z0-9_-]{8,100}$'
    or p_manifest_hash is null or p_manifest_hash !~ '^[a-f0-9]{64}$'
    or p_production_commit is null or p_production_commit !~ '^[a-f0-9]{40}$' then
    raise exception 'real500-runtime-auftrag';
  end if;
  select data into e from public.helmut_store where id='realkohorte500-runtime-'||p_operation_id;
  if jsonb_typeof(e) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(e)) <> 12
    or e-array['version','operationId','manifest','manifestHash','manifestSqlHash','snapshot','snapshotSqlHash',
      'quittung','quittungSqlHash','startbelege','startbelegeSqlHash','zustand'] is distinct from '{}'::jsonb
    or e->>'version' is distinct from 'helmut-realkohorte500-runtime/1'
    or e->>'operationId' is distinct from p_operation_id
    or e->>'manifestHash' is distinct from p_manifest_hash then
    raise exception 'real500-runtime-envelope';
  end if;
  runtime_manifest := e->'manifest';
  m := runtime_manifest->'profilvertrag'; s := e->'snapshot'; q := e->'quittung'; b := e->'startbelege';
  if jsonb_typeof(runtime_manifest) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(runtime_manifest)) <> 4
    or runtime_manifest-array['version','profilManifestHash','profilvertrag','startbelegeGrundlinie'] is distinct from '{}'::jsonb
    or runtime_manifest->>'version' is distinct from 'helmut-realkohorte500-runtime-manifest/1'
    or runtime_manifest->'startbelegeGrundlinie' is distinct from b->'grundlinie'
    or jsonb_typeof(m) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(m)) <> 13
    or m-array['version','operationId','paketHash','idsHash','ids','verteilung','profilnullzustand',
      'vorflugAm','startBis','endeAm','kosten','zustand','offen'] is distinct from '{}'::jsonb
    or m->>'version' is distinct from 'helmut-realkohorte-500/1'
    or m->>'operationId' is distinct from p_operation_id
    or m->>'paketHash' is distinct from '775356e2c464a307a3f5e5c5852394aa5fe033253a4dccbb155131f4e1b21e59'
    or m->>'idsHash' is distinct from '28eb5266f5b4372e8c093223190b5f273c5588996bc30b5411dd175ea6094ca9'
    or m->'ids' is distinct from ids
    or m->'verteilung' is distinct from '{"bundestag":330,"landtag-berlin":120,"landtag-brandenburg":50}'::jsonb
    or m->'kosten'->>'tageslimitMikroUsd' is distinct from '6000000'
    or m->'kosten'->>'auftragslimitMikroUsd' is distinct from '7000000'
    or m->>'zustand' is distinct from 'inaktiv-vorbereitung'
    or runtime_manifest->>'profilManifestHash' is distinct from encode(sha256(convert_to(helmut_real500_internal.json_compact(m),'UTF8')),'hex')
    or e->>'manifestSqlHash' is distinct from encode(sha256(convert_to(runtime_manifest::text,'UTF8')),'hex')
    or p_manifest_hash is distinct from encode(sha256(convert_to(helmut_real500_internal.json_compact(runtime_manifest),'UTF8')),'hex')
    or e->>'snapshotSqlHash' is distinct from encode(sha256(convert_to(s::text,'UTF8')),'hex')
    or e->>'startbelegeSqlHash' is distinct from encode(sha256(convert_to(b::text,'UTF8')),'hex') then
    raise exception 'real500-runtime-hash-bindung';
  end if;
  if jsonb_typeof(s) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(s)) <> 3
    or s-array['beobachtetAm','mandate_profiles','profiles'] is distinct from '{}'::jsonb
    or jsonb_typeof(s->'mandate_profiles') is distinct from 'array'
    or jsonb_typeof(s->'profiles') is distinct from 'array'
    or jsonb_array_length(s->'mandate_profiles') <> 500 or jsonb_array_length(s->'profiles') <> 501
    or exists(select 1 from jsonb_array_elements(s->'mandate_profiles') x(v)
      where v->'aktiv' is distinct from 'false'::jsonb or v->'geloescht_at' is distinct from 'null'::jsonb)
    or (select jsonb_agg(v->>'user_id' order by v->>'user_id' collate "C")
      from jsonb_array_elements(s->'mandate_profiles') x(v)) is distinct from ids
    or (select count(distinct v->>'id') from jsonb_array_elements(s->'profiles') x(v)) <> 501
    or not coalesce((s->>'beobachtetAm')::timestamptz <= (m->>'vorflugAm')::timestamptz
      and (m->>'vorflugAm')::timestamptz-(s->>'beobachtetAm')::timestamptz <= interval '1 minute'
      and (m->>'startBis')::timestamptz > (m->>'vorflugAm')::timestamptz
      and (m->>'startBis')::timestamptz-(m->>'vorflugAm')::timestamptz <= interval '5 minutes'
      and (m->>'endeAm')::timestamptz > (m->>'startBis')::timestamptz
      and (m->>'endeAm')::timestamptz-(m->>'vorflugAm')::timestamptz <= interval '24 hours'
      and left(m->>'vorflugAm',10)=left(m->>'endeAm',10),false) then
    raise exception 'real500-runtime-nullbestand-zeit';
  end if;
  if jsonb_typeof(b) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(b)) <> 6
    or b-array['version','grundlinie','qualifizierteRechtsfreigabe','fachfreigabe','aktivierungsGo','endwaechterBereit'] is distinct from '{}'::jsonb
    or b->>'version' is distinct from 'helmut-realkohorte500-startbelege/1'
    or jsonb_typeof(b->'grundlinie') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(b->'grundlinie'))<>12
    or (b->'grundlinie')-array['belegHash','phaseAHash','fachHash','productionHash','ruheHash','kostenHash',
      'landesversorgungHash','snapshotHash','authHash','mainHash','productionCommit','deploymentId'] is distinct from '{}'::jsonb
    or b->'grundlinie'->>'productionCommit' is distinct from p_production_commit
    or b->'grundlinie'->>'deploymentId' is null or b->'grundlinie'->>'deploymentId' !~ '^dpl_[a-zA-Z0-9]+$'
    or exists(select 1 from unnest(array['belegHash','phaseAHash','fachHash','productionHash','ruheHash','kostenHash',
      'landesversorgungHash','snapshotHash','authHash','mainHash']) k
      where b->'grundlinie'->>k is null or b->'grundlinie'->>k !~ '^[a-f0-9]{64}$')
    or b->'grundlinie'->>'snapshotHash' is distinct from encode(sha256(convert_to(helmut_real500_internal.json_compact(s),'UTF8')),'hex')
    or b->'qualifizierteRechtsfreigabe'->'qualifiziert' is distinct from 'true'::jsonb
    or exists(select 1 from unnest(array['qualifizierteRechtsfreigabe','fachfreigabe']) k
      where b->k->'freigegeben' is distinct from 'true'::jsonb
        or b->k->>'paketHash' is distinct from m->>'paketHash'
        or b->k->>'idsHash' is distinct from m->>'idsHash'
        or b->k->>'belegHash' is distinct from b->'grundlinie'->>
          (case when k='qualifizierteRechtsfreigabe' then 'phaseAHash' else 'fachHash' end)) then
    raise exception 'real500-runtime-startbelege';
  end if;
  select jsonb_agg(v order by v->>'user_id' collate "C"),
    jsonb_agg(v-'aktiv'-'updated_at' order by v->>'user_id' collate "C")
    into snapshot_mandate,snapshot_fach from jsonb_array_elements(s->'mandate_profiles') x(v);
  select jsonb_agg(v order by v->>'id' collate "C") into snapshot_profiles from jsonb_array_elements(s->'profiles') x(v);
  select jsonb_agg(v order by v->>'id' collate "C") into snapshot_fremd from jsonb_array_elements(s->'profiles') x(v)
    where v->>'id' not in(select jsonb_array_elements_text(ids));
  if jsonb_array_length(snapshot_fremd) is distinct from 1 then raise exception 'real500-runtime-fremdprofilbindung'; end if;
  erwartet_null := jsonb_build_object('beobachtetAm',s->>'beobachtetAm',
    'mandateHash',encode(sha256(convert_to(helmut_real500_internal.json_compact(snapshot_mandate),'UTF8')),'hex'),
    'mandateFachHash',encode(sha256(convert_to(helmut_real500_internal.json_compact(snapshot_fach),'UTF8')),'hex'),
    'profilesHash',encode(sha256(convert_to(helmut_real500_internal.json_compact(snapshot_profiles),'UTF8')),'hex'),
    'fremdId',snapshot_fremd->0->>'id',
    'fremdHash',encode(sha256(convert_to(helmut_real500_internal.json_compact(snapshot_fremd),'UTF8')),'hex'),
    'mandate',500,'profiles',501,'aktiv',0);
  if m->'profilnullzustand' is distinct from erwartet_null then raise exception 'real500-runtime-snapshot-manifestbindung'; end if;
  select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id collate "C") into fach from public.mandate_profiles p;
  select jsonb_agg(to_jsonb(p) order by id collate "C") into identitaeten from public.profiles p;
  if (select count(*) from public.mandate_profiles) <> 500 or (select count(*) from public.profiles) <> 501
    or (select jsonb_agg(user_id order by user_id collate "C") from public.mandate_profiles) is distinct from ids
    or exists(select 1 from public.mandate_profiles where aktiv is null or geloescht_at is not null)
    or fach is distinct from (select jsonb_agg(v-'aktiv'-'updated_at' order by v->>'user_id' collate "C")
      from jsonb_array_elements(s->'mandate_profiles') x(v))
    or identitaeten is distinct from (select jsonb_agg(v order by v->>'id' collate "C") from jsonb_array_elements(s->'profiles') x(v)) then
    raise exception 'real500-runtime-fremd-fachbestand';
  end if;
  select count(*) into n from public.mandate_profiles where aktiv;
  if e->>'zustand'='vorbereitet' then
    if q is distinct from 'null'::jsonb or e->'quittungSqlHash' is distinct from 'null'::jsonb or n<>0
      or (m->>'endeAm')::timestamptz-(m->>'vorflugAm')::timestamptz>interval '4 hours' then
      raise exception 'real500-runtime-vorbereitet';
    end if;
    return e;
  end if;
  if e->>'zustand' is null or e->>'zustand' not in ('aktiv','beendet')
    or q->>'zustand' is distinct from e->>'zustand'
    or q->>'version' is distinct from 'helmut-realkohorte-500/1'
    or q->>'operationId' is distinct from p_operation_id
    or q->'manifest' is distinct from m or q->'bestaetigtAktiv' is distinct from '500'::jsonb
    or e->>'quittungSqlHash' is distinct from encode(sha256(convert_to(q::text,'UTF8')),'hex')
    or b->'aktivierungsGo'->'freigegeben' is distinct from 'true'::jsonb
    or b->'aktivierungsGo'->>'operationId' is distinct from p_operation_id
    or b->'aktivierungsGo'->>'manifestHash' is distinct from p_manifest_hash
    or b->'aktivierungsGo'->>'belegHash' is null or b->'aktivierungsGo'->>'belegHash' !~ '^[a-f0-9]{64}$'
    or b->'endwaechterBereit'->'bereit' is distinct from 'true'::jsonb
    or b->'endwaechterBereit'->>'operationId' is distinct from p_operation_id
    or b->'endwaechterBereit'->>'manifestHash' is distinct from p_manifest_hash
    or b->'endwaechterBereit'->>'productionCommit' is distinct from p_production_commit
    or not coalesce((q->>'aktiviertAm')::timestamptz >= (m->>'vorflugAm')::timestamptz
      and (q->>'aktiviertAm')::timestamptz < (m->>'startBis')::timestamptz,false) then
    raise exception 'real500-runtime-quittung';
  end if;
  if e->>'zustand'='aktiv' then
    if (select count(*) from jsonb_object_keys(q))<>6
      or q-array['version','operationId','manifest','zustand','aktiviertAm','bestaetigtAktiv'] is distinct from '{}'::jsonb then
      raise exception 'real500-runtime-aktivquittung';
    end if;
  else
    if n<>0 or (select count(*) from jsonb_object_keys(q))<>9
      or q-array['version','operationId','manifest','zustand','aktiviertAm','bestaetigtAktiv','beendetAm','deaktiviert','endgrund'] is distinct from '{}'::jsonb
      or jsonb_typeof(q->'deaktiviert') is distinct from 'number'
      or (q->>'deaktiviert')::integer<0 or (q->>'deaktiviert')::integer>500
      or q->>'endgrund' is null or q->>'endgrund' not in ('frist','notstopp')
      or not coalesce((q->>'beendetAm')::timestamptz >= (q->>'aktiviertAm')::timestamptz,false) then
      raise exception 'real500-runtime-endquittung-reaktivierung';
    end if;
  end if;
  return e;
end $pruefe$;

create function helmut_real500_internal.status(e jsonb,n integer) returns jsonb
language sql volatile security invoker set search_path=pg_catalog as $status$
  select jsonb_build_object('version','helmut-realkohorte500-status/1','operationId',e->>'operationId',
    'manifestHash',e->>'manifestHash','profilManifestHash',e->'manifest'->>'profilManifestHash',
    'productionCommit',e->'startbelege'->'grundlinie'->>'productionCommit',
    'paketHash',e->'manifest'->'profilvertrag'->>'paketHash','idsHash',e->'manifest'->'profilvertrag'->>'idsHash',
    'beobachtetAm',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'zustand',e->>'zustand','gesamt',500,'identitaeten',501,'aktiv',n,
    'fremdUnveraendert',true,'fachfelderUnveraendert',true,'quittungBindungBestaetigt',true,'endeAm',e->'manifest'->'profilvertrag'->>'endeAm');
$status$;

create function public.helmut_realkohorte500_lesung(p_operation_id text,p_manifest_hash text,p_production_commit text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
set lock_timeout='3s' set statement_timeout='15s' as $lesung$
declare e jsonb; n integer;
begin
  e := helmut_real500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  select count(*) into n from public.mandate_profiles where aktiv;
  return helmut_real500_internal.status(e,n);
end $lesung$;

create function public.helmut_realkohorte500_ende(p_operation_id text,p_manifest_hash text,p_production_commit text,p_grund text,p_bestaetigung text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
set lock_timeout='3s' set statement_timeout='15s' as $ende$
declare e jsonb; nach jsonb; q jsonb; n integer; vor_auth jsonb; vor_main jsonb;
begin
  if p_bestaetigung is distinct from 'GEBUNDENE_REAL500_NUR_DEAKTIVIEREN'
    or p_grund is null or p_grund not in ('frist','notstopp') then raise exception 'real500-runtime-endauftrag'; end if;
  lock table public.mandate_profiles,public.profiles,public.helmut_store in share row exclusive mode;
  e := helmut_real500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  if e->>'zustand'='beendet' then return helmut_real500_internal.status(e,0); end if;
  if e->>'zustand' is distinct from 'aktiv' then raise exception 'real500-runtime-keine-aktivquittung'; end if;
  if clock_timestamp() < (e->'quittung'->>'aktiviertAm')::timestamptz
    or (p_grund='frist' and clock_timestamp() < (e->'manifest'->'profilvertrag'->>'endeAm')::timestamptz) then
    raise exception 'real500-runtime-endzeit';
  end if;
  select data into vor_auth from public.helmut_store where id='main-auth';
  select data into vor_main from public.helmut_store where id='main';
  update public.mandate_profiles set aktiv=false
    where user_id in(select jsonb_array_elements_text(e->'manifest'->'profilvertrag'->'ids')) and aktiv=true;
  get diagnostics n=row_count;
  if n<0 or n>500 or exists(select 1 from public.mandate_profiles where aktiv)
    or vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'real500-runtime-endnachkontrolle';
  end if;
  q := e->'quittung'||jsonb_build_object('zustand','beendet',
    'beendetAm',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'deaktiviert',n,'endgrund',p_grund);
  nach := e||jsonb_build_object('zustand','beendet','quittung',q,
    'quittungSqlHash',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
  update public.helmut_store set data=nach where id='realkohorte500-runtime-'||p_operation_id and data=e;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'real500-runtime-end-cas'; end if;
  -- VOLATILE-Endfunktion: erneute interne Pruefung sieht eigene Transaktion.
  perform helmut_real500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  if vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'real500-runtime-auth-main-veraendert';
  end if;
  return helmut_real500_internal.status(nach,0);
end $ende$;

revoke all on all functions in schema helmut_real500_internal from public;
revoke all on function public.helmut_realkohorte500_lesung(text,text,text) from public;
revoke all on function public.helmut_realkohorte500_ende(text,text,text,text,text) from public;
do $rechte$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on schema helmut_real500_internal from anon;
    revoke all on all functions in schema helmut_real500_internal from anon;
    revoke all on function public.helmut_realkohorte500_lesung(text,text,text) from anon;
    revoke all on function public.helmut_realkohorte500_ende(text,text,text,text,text) from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on schema helmut_real500_internal from authenticated;
    revoke all on all functions in schema helmut_real500_internal from authenticated;
    revoke all on function public.helmut_realkohorte500_lesung(text,text,text) from authenticated;
    revoke all on function public.helmut_realkohorte500_ende(text,text,text,text,text) from authenticated;
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant usage on schema helmut_real500_internal to service_role;
    grant execute on all functions in schema helmut_real500_internal to service_role;
    grant execute on function public.helmut_realkohorte500_lesung(text,text,text) to service_role;
    grant execute on function public.helmut_realkohorte500_ende(text,text,text,text,text) to service_role;
  end if;
end $rechte$;
notify pgrst,'reload schema';
commit;
