"use strict";
// Neuer enger Wrapperzweig. Nur synthetische Daten, PostgreSQL mit network=none,
// native Aug23-Operatorfunktion und lokale Modellattrappe; keine Anbieterkette.
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto'),O=require('./ops/quellen-pflichtanalyse-20261126'),P=require('../lib/helmut/scalable-pipeline'),R=require('../lib/helmut/roh-quellenstaende'),L=require('../lib/helmut/quellen-lektuerebeleg'),F=require('../lib/helmut/quellen-faelligkeit'),I=require('../lib/helmut/vorgang-identity'),V=require('../lib/helmut/verstehen-vertrag'),B=require('../lib/helmut/betriebskosten-budget'),U=require('../lib/helmut/understanding');
const tag=new Date().toISOString().slice(0,10),jobId='00000000-0000-0000-0000-000000000011',abrufId='00000000-0000-0000-0000-000000000012',klasse='cas-pflichtneuversuch-20261126';
const hash=s=>createHash('sha256').update(s).digest('hex'),q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb",lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const doc=require('../lib/helmut/dedup').toRawDocumentRow({title:'Synthetische Bundestagsberatung zur Arbeitsmarktpolitik',url:'https://www.bundestag.de/presse/synthetische-beratung',sourceId:'bundestag',sourceName:'Bundestag',sourceType:'bundestag',linkType:'direct',publishedAt:tag+'T00:00:00Z',retrievedAt:tag+'T00:00:00Z',summary:Array.from({length:77},(_,i)=>`Der Bundestag berät Abschnitt ${i} zur Arbeitsmarktpolitik und prüft die parlamentarischen Folgen für die soziale Absicherung.`).join(' ')});
// Historische gespeicherte RSS-Auszüge können länger als der heutige Dedup-Grenzwert sein.
doc.summary=Array.from({length:77},(_,i)=>`Der Bundestag berät Abschnitt ${i} zur Arbeitsmarktpolitik und prüft die parlamentarischen Folgen für die soziale Absicherung.`).join(' ').slice(0,8771);
const stand=R.standHash(doc),job=P.einzelArtikelAuftrag({id:doc.id,stand}),vg=I.deriveVorgangId(I.clusterRawDocuments([doc])[0]),oldDoc={...doc,id:'rd-'+'f'.repeat(64),summary:'Die frühere amtliche Fassung berichtete ausschließlich den vorigen parlamentarischen Verfahrensstand.'};
const oldSources=[L.quellenLektuereBeleg(L.quelleFuerPrompt(oldDoc,0,null,0))],ko={id:'ko-'+vg,vorgang_id:vg,ko_version:1,source_document_count:1,verstehen_fencing:1,understanding_status:'complete',status:'neu',classification_confidence:{helmut_quellen_lektuere:{version:2,vorgangId:vg,koVersion:1,quellen:oldSources,belegHash:L.hash([2,vg,1,oldSources])}}};
const quelle={...require('../lib/helmut/sources').v1Sources.find(s=>s.id==='bundestag'),retrievalPathId:'rp-bundestag'},dueAt=tag+'T00:00:00.000Z',pa={jobType:'source_fetch',idempotencyKey:'bt-neuversuch-'+tag,tenantId:null,dueAt,priority:50,payload:{art:'geteilt',quelle}};
const data={version:1,tag,auftraege:[pa],tagesplan:null,cursor:1,zustand:'fertig'};data.manifestHash=hash(JSON.stringify(L.kanonisch([tag,data.auftraege,null])));
const b={version:1,bindung:F.quellbindung({id:abrufId,tenantId:null,firstDueAt:dueAt,payload:pa.payload}),bestaetigtAm:dueAt,ergebnis:{art:'rohfassungen',rohIds:[doc.id],analyse:[{jobId,rohId:doc.id,stand}]}};b.belegHash=require('../lib/helmut/briefing-speicher').hash(b);
const contract=B.vertrag({[B.ENV]:JSON.stringify({version:1,profileId:'synthetischer-neuversuch',startsAt:new Date(Date.parse(tag)-30*86400000).toISOString(),dailyLimitUsd:1,totalLimitUsd:30,route:{provider:'azure',responsesUrl:'https://offline.openai.azure.com/openai/v1/responses',model:'gpt-5-mini'}})}),book={version:1,contractHash:contract.contractHash,contract,calls:{},bound:0,frozen:null};
const einzelbelege=[];
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
 const container=process.argv[process.argv.indexOf('--container')+1];A.equal(container,'helmut-pflichtanalyse-20261126');A.equal(process.env.HELMUT_LOKALER_SCHUTZ,'aktiv');
 const inspect=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];A.equal(inspect.HostConfig.NetworkMode,'none');A.match(inspect.Config.Image,/^postgres:17\.6-/);A(inspect.HostConfig.Tmpfs?.['/var/lib/postgresql/data']);
 const db='pflichtneuversuch_'+process.pid,sql=fs.readFileSync(path.join(__dirname,'ops/quellen-pflichtanalyse-20261126.sql'),'utf8');
 const psql=(input,datenbank=db)=>execFileSync('docker',['exec','-i',container,'psql','-X','-q','-At','-U','postgres','-d',datenbank,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
 psql('create database '+db,'postgres');
 try{
  psql("do $$begin create role anon; exception when duplicate_object then null; end$$;do $$begin create role authenticated; exception when duplicate_object then null; end$$;do $$begin create role service_role; exception when duplicate_object then null; end$$;",'postgres');
  psql(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260808_scalable_job_queue.sql'),'utf8'));
  psql(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260808_jobqueue_abhaengigkeiten.sql'),'utf8'));
  psql(`alter table helmut_jobs add column quellen_prioritaet_tag date;alter table helmut_jobs add column wiedervorlagen int default 0;
    create table helmut_store(id text primary key,data jsonb);create table raw_documents(id text primary key,url text,canonical_url text,title text,summary text,source_name text,source_id text,source_type text,link_type text,published_at timestamptz,retrieved_at timestamptz,raw jsonb);
    create table knowledge_objects(id text primary key,vorgang_id text unique,ko_version int,source_document_count int,verstehen_fencing bigint,understanding_status text,status text,classification_confidence jsonb);
    create table ko_document_links(knowledge_object_id text,raw_document_id text);
    create table llm_usage(id text primary key,politician_id text,user_id text,model text,call_type text,prompt_tokens integer,completion_tokens integer,total_tokens integer,estimated_cost numeric,duration_ms integer,success boolean,error text,created_at timestamptz,source_id text,package_id text,vorgang_id text,knowledge_object_id text);
    create table document_findings(raw_document_id text,source_id text,retrieval_path_id text,original_url text,link_type text,found_at timestamptz);
    insert into knowledge_objects select * from jsonb_populate_record(null::knowledge_objects,${q(ko)});`);
  for(const name of ['20260814180000_verstehen_cas.sql','20260823043633_verstehen_aufgeben_erneut_freigegeben.sql'])psql(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
  psql(`insert into helmut_store values('main-auth',${q({betriebskostenBudget:book,llmUsage:[]})}),(${lit('main-quellenplan-'+tag)},${q(data)}),(${lit('main-quellenfaelligkeit-'+abrufId)},${q(b)}),(${lit('main-rohstand-'+doc.id.slice(3)+'-'+stand)},${q({version:1,quellenHash:stand,dokument:doc})});
    insert into raw_documents select * from jsonb_populate_record(null::raw_documents,${q(doc)});
    insert into raw_documents select * from jsonb_populate_record(null::raw_documents,${q(oldDoc)});
    update helmut_store set data=jsonb_set(data,'{dokument}',(select to_jsonb(r) from raw_documents r where r.id=${lit(doc.id)})) where id=${lit('main-rohstand-'+doc.id.slice(3)+'-'+stand)};
    insert into ko_document_links values(${lit(ko.id)},${lit(doc.id)}),(${lit(ko.id)},${lit(oldDoc.id)});
    insert into helmut_verstehen_vormerkungen(vorgang_id,fehlversuche,letzte_fencing) values(${lit(vg)},1,2);
    insert into helmut_verstehen_reservierungen(vorgang_id,zustand,fencing,ergebnis_fencing,ergebnis_hash,ki_aufrufe,versuche,letzter_grund,eingabe_hash)
      values(${lit(vg)},'unbekannt',2,1,${lit(V.ergebnisHash(ko))},2,2,'validierung-fehlgeschlagen','alte-eingabe');
    insert into helmut_jobs(id,job_type,idempotency_key,freshness_window,first_due_at,due_at,status,payload,attempts,max_attempts,last_error,finished_at,wiedervorlagen,created_at)
      values('${jobId}','document_understanding',${lit(job.idempotencyKey)},'alt',now()-interval '2 day',now()-interval '2 day','fehlgeschlagen',${q(job.payload)},3,3,'verstehen-uebersprungen-dauerhaft: artikelkontext-zeitbudget seit 122 h',now()-interval '1 day',2,now()-interval '7 day'),
      ('${abrufId}','source_fetch',${lit(pa.idempotencyKey)},'${tag}','${dueAt}','${dueAt}','erledigt',${q(pa.payload)},1,3,null,'${dueAt}',0,now());`);
  const run=(modus,bindung,cl=klasse)=>{const vars={modus,klasse:cl,job_id:jobId,abruf_id:abrufId,tag,cas_ids:JSON.stringify([vg]),...(bindung?{bindung:JSON.stringify(bindung)}:{})};return JSON.parse(psql(Object.entries(vars).map(([k,v])=>`\\set ${k} '${v.replaceAll("'","\\'")}'`).join('\n')+'\n'+sql).split('\n').at(-1));};
  const verify=()=>O.pruefe(run('vorschau'),{tag,jobId,abrufId,jetztMs:Date.now()});let approval,receipt;
  await test('native Aug23-Funktion und Rollen; positiver exakt ungelesener BT-Pflichttext',async()=>{approval=await verify();A.equal(approval.casNeuversuch.entscheidung,'erneut');A.deepEqual(approval.casNeuversuch.quellenRestDokumentIds,[doc.id]);A.equal(approval.casNeuversuch.aktuellerErsterAbschnitt.abschnitt.count,2);});
  await test('neuer Zweig sperrt andere Quelle, CAS-Zustand/Fencing/Starts, Text, Lektuere und Funktionsdrift',async()=>{
   const v=run('vorschau');for(const mutate of [s=>s.abruf.payload.quelle.id='andere',s=>s.cas[0].zustand='offen',s=>s.cas[0].fencing=3,s=>s.cas[0].ki_aufrufe=3,s=>s.cas[0].versuche=3,s=>s.aktuell.summary='',s=>s.kos[0].classification_confidence.helmut_quellen_lektuere.quellen=[],s=>s.casOperator.definitionHash='0'.repeat(64),s=>s.casOperator.rollen.find(r=>r.rolle==='anon').execute=true,s=>s.job.payload.quellenRestDokumentIds=[doc.id]]){
    const x=structuredClone(v),s=JSON.parse(x.inhalt);mutate(s);x.inhalt=JSON.stringify(s);x.digest=hash(x.inhalt);await A.rejects(()=>O.pruefe(x,{tag,jobId,abrufId}));
   }
  });
  await test('SQL stoppt bei CAS-/Buchdrift, alter Zeit/UTC-Bindung und parallelem Job',async()=>{
   psql(`update helmut_verstehen_reservierungen set versuche=3 where vorgang_id=${lit(vg)}`);A.throws(()=>run('freigeben',approval));psql(`update helmut_verstehen_reservierungen set versuche=2 where vorgang_id=${lit(vg)}`);
   A.throws(()=>run('freigeben',{...approval,geprueftAm:new Date(Date.now()-16*60000).toISOString()}));A.throws(()=>run('freigeben',{...approval,tag:'2020-01-01'}));
   psql("update helmut_store set data=jsonb_set(data,'{betriebskostenBudget,frozen}','true') where id='main-auth'");A.throws(()=>run('freigeben',approval));psql("update helmut_store set data=jsonb_set(data,'{betriebskostenBudget,frozen}','null') where id='main-auth'");
   psql(`update helmut_jobs set status='laeuft',lease_owner='synthetischer-paralleljob',lease_expires_at=now()+interval '5 minute',finished_at=null where id='${abrufId}'`);A.throws(()=>run('freigeben',approval));psql(`update helmut_jobs set status='erledigt',lease_owner=null,lease_expires_at=null,finished_at='${dueAt}' where id='${abrufId}'`);
   approval=await verify();
  });
  await test('atomare native erneutfreigabe: CAS-Startzaehler erhalten, Job3/3 nach3/4 mit Leserest',async()=>{
   receipt=run('freigeben',approval);const c=receipt.nach.cas[0];A.equal(c.zustand,'offen');A.equal(c.letzter_grund,'erneut-freigegeben');A.equal(c.fencing,2);A.equal(c.ki_aufrufe,2);A.equal(c.versuche,2);A.equal(receipt.nach.job.attempts,3);A.equal(receipt.nach.job.max_attempts,4);A.deepEqual(receipt.nach.job.payload.quellenRestDokumentIds,[doc.id]);A.deepEqual(receipt.nach.kostenBuch,receipt.vor.kostenBuch);A.deepEqual(receipt.nach.kos,receipt.vor.kos);A.throws(()=>run('freigeben',approval));
  });
  await test('exakter Rueckweg vor Claim stellt CAS und Originalpayload wieder her; kein Replay',async()=>{
   const r=run('rueckweg',receipt);A.deepEqual(r.nach.cas,receipt.vor.cas);A.deepEqual(r.nach.job.payload,receipt.vor.job.payload);A.equal(r.nach.job.max_attempts,3);A.equal(r.nach.job.attempts,3);A.throws(()=>run('rueckweg',receipt));A.throws(()=>run('freigeben',approval));
  });
  approval=await verify();receipt=run('freigeben',approval);
  await test('Rueckweg bei CAS-Uebernahme auch ohne Jobclaim geschlossen',async()=>{psql(`update helmut_verstehen_reservierungen set fencing=3 where vorgang_id=${lit(vg)}`);A.throws(()=>run('rueckweg',receipt));psql(`update helmut_verstehen_reservierungen set fencing=2 where vorgang_id=${lit(vg)}`);});
  await test('nativer Jobclaim wird Versuch4; Rueckweg danach gesperrt',async()=>{const r=JSON.parse(psql("select to_jsonb(j) from helmut_claim_jobs('synthetischer-neuversuch',1,60000,array['document_understanding']) j"));A.equal(r.attempts,4);A.equal(r.id,jobId);A.throws(()=>run('rueckweg',receipt));});
  await test('ohne Drift: vorhandener Handler liest beide Abschnitte statt complete-Duplikaterfolg',async()=>{
   let saved=structuredClone(ko),calls=0,engine,modelStarts=2,fencing=2,inputHash=null;const prompts=[],links=[oldDoc,doc];
   const owner='synthetischer-abschnitt';
   const storage={
    verstehenReserviere:async({eingabeHash})=>{inputHash=eingabeHash;const r=JSON.parse(psql(`select to_jsonb(r) from helmut_verstehen_reserviere(${lit(vg)},${lit(eingabeHash)},${lit(owner)},300000) r`));return {verfuegbar:true,...r};},
    verstehenModellstart:async({fencing})=>{const out=psql(`select helmut_verstehen_modellstart(${lit(vg)},${lit(owner)},${fencing},300000)`);A.equal(out,'t','Native Modellstartantwort '+out+' '+psql(`select to_jsonb(c) from helmut_verstehen_reservierungen c where vorgang_id=${lit(vg)}`));const ok=true;if(ok)modelStarts++;return {verfuegbar:true,ok};},
    verstehenSchreibrecht:async({fencing})=>({verfuegbar:true,ok:psql(`select helmut_verstehen_schreibrecht(${lit(vg)},${lit(owner)},${fencing},120000)`)==='t'}),
    verstehenSpeichere:async({ko,fencing})=>{const ergebnis=psql(`select helmut_verstehen_speichere(${lit(vg)},${lit(owner)},${fencing},${q(ko)},${lit(V.ergebnisHash(ko))})`);saved=JSON.parse(psql(`select to_jsonb(k) from knowledge_objects k where id=${lit(ko.id)}`));return {verfuegbar:true,ergebnis};},
    verstehenVormerkungLese:async()=>{const rows=JSON.parse(psql(`select coalesce(json_agg(r),'[]') from helmut_verstehen_vormerkung_lese(array[${lit(vg)}]) r`));return {verfuegbar:true,eintraege:Object.fromEntries(rows.map(r=>[r.vorgang_id,r.fehlversuche]))};},
    verstehenVormerkungLoese:async({fencing})=>({verfuegbar:true,ok:psql(`select helmut_verstehen_vormerkung_loese(${lit(vg)},${fencing})`)==='t'}),
    verstehenVormerkungErhoehe:async()=>A.fail('Kein Fehlerretry'),verstehenAusgangUnbekannt:async()=>A.fail('Gueltige Modellattrappe')};
   const inner={runId:jobId,getExisting:async()=>saved,getExistingStreng:async()=>saved,findVorgangCandidates:async()=>[saved],listVorgangDocuments:async()=>links,saveSources:async(_id,rows)=>({saved:rows.length}),verstehenVertrag:()=>V.baueVertrag({besitzer:'synthetischer-abschnitt',deps:{erzwingeAktiv:true,speicher:storage}}),canSpend:async()=>({allowed:true}),modelName:()=>'isolierte-attrappe',logSkip:()=>{},gateMode:()=>'off',readUpdateRetries:async()=>({}),writeUpdateRetries:async()=>({saved:true}),requestUnderstanding:async prompt=>{calls++;prompts.push(prompt);return {headline:'Synthetische Beratung',was_ist_passiert:'Der Bundestag berät den Entwurf.',warum_wichtig:'Weitere parlamentarische Beratung.',wer_ist_betroffen:'Das Parlament.',parteien:[],ausschuesse:[],ministerien:[],risiken:[],chancen:[],zeitdruck:'mittel',handlungsempfehlung:'Beratung beobachten.',confidence_score:70,display_title:'Synthetische Beratung',display_summary:'Beratung läuft.',why_relevant:'Beratung läuft.',recommendation:'Beobachten.',display_category:'Arbeit'};},save:async()=>A.fail('Nur CAS'),markFailed:async()=>A.fail('Gueltige Modellattrappe')};
   const deps={env:{HELMUT_SCALABLE_PIPELINE:'on',HELMUT_VERSTEHEN_CAS:'on',HELMUT_QUELLEN_ARBEITSFENSTER:'on'},now:Date.now,verstehenKonkurrenz:()=>true,klassen:{belege:async()=>({erlaubt:true,slot:'synthetisch'}),gebeFrei:async()=>{}},ladeRohdokumente:async()=>[doc],ladeRohdokumentStaende:async()=>[doc],eagerUnderstanding:async(docs,opts)=>{engine=await U.understandOneCluster({documents:docs},inner,{...opts,vorgangId:vg,vertrag:inner.verstehenVertrag()});return {processed:1,counts:{[engine.status]:1},results:[engine]};}};
   let payload=structuredClone(receipt.nach.job.payload);const actual=[];
   for(let index=0;index<2;index++){
    let r;try{r=await P.HANDLER.document_understanding({id:jobId,jobType:'document_understanding',tenantId:null,idempotencyKey:job.idempotencyKey,payload,createdAt:new Date(Date.parse(tag)-7*86400000).toISOString()},deps,{auftragsDeadlineMs:Date.now()+120000});}catch(e){e.message+='; engine='+JSON.stringify(engine);throw e;}
    A.equal(calls,index+1,'Kein Duplikatfrueherfolg: '+JSON.stringify({engine,r}));A.equal(engine.promptAbschnitte[doc.id].index,index);actual.push(L.quellenLektuereBeleg(L.quelleFuerPrompt(doc,0,null,index)).textstandHash);payload=r.fortschrittPayload;
    psql(`update helmut_jobs set payload=${q(payload)} where id='${jobId}' and status='laeuft' and lease_owner='synthetischer-neuversuch' and lease_expires_at>now();`);
    if(index===0){A.equal(r.zurueckgestellt,true);A.deepEqual(payload.quellenRestDokumentIds,[doc.id]);A.equal(payload.quellenAbschnitte[doc.id],1);
      A.equal(JSON.parse(psql(`select to_jsonb(r) from helmut_defer_job('${jobId}','synthetischer-neuversuch',0,'artikelabschnitt-fortsetzung') r`)).uebernommen,true);
      const waiting=JSON.parse(psql(`select to_jsonb(j) from helmut_jobs j where id='${jobId}'`));A.equal(waiting.status,'wartend');A.equal(waiting.attempts,3);A.equal(waiting.created_at,receipt.nach.job.created_at);A.deepEqual(waiting.payload,payload);
      const paused=await P.HANDLER.document_understanding({id:jobId,jobType:'document_understanding',tenantId:null,idempotencyKey:job.idempotencyKey,payload,createdAt:new Date(Date.parse(tag)-7*86400000).toISOString()},deps,{auftragsDeadlineMs:Date.now()-1});A.equal(paused.zurueckgestellt,true);A.equal(paused.grund,'analyse-slotrest-erschoepft');A.equal(calls,1);
      await new Promise(resolve=>setTimeout(resolve,1100)); // Nativer Mindestaufschub1s, keine Faelligkeit umschreiben.
      const claimed=JSON.parse(psql("select to_jsonb(j) from helmut_claim_jobs('synthetischer-neuversuch',1,60000,array['document_understanding']) j"));A.equal(claimed.attempts,4);
    }else{A.equal(r.ok,true);A.deepEqual(payload.quellenRestDokumentIds,[]);}

   }
   const gelesen=L.leseQuellenLektuere(saved).find(x=>x.dokumentId===doc.id);A.equal(gelesen.abschnitt.index,1);A.deepEqual(gelesen.geleseneAbschnitte,actual);A.equal(modelStarts,4,'Zwei historische plus zwei eigenstaendig gegatete Abschnittsstarts');A.equal(prompts.length,2);A(inputHash);const finalCas=JSON.parse(psql(`select to_jsonb(c) from helmut_verstehen_reservierungen c where vorgang_id=${lit(vg)}`));A.equal(finalCas.zustand,'fertig');A.equal(finalCas.ki_aufrufe,4);A.equal(finalCas.versuche,4);A.equal(finalCas.fencing,4);A.equal(finalCas.ergebnis_fencing,4);A.deepEqual(JSON.parse(psql("select data->'betriebskostenBudget' from helmut_store where id='main-auth'")),book);einzelbelege.push({art:'native CAS-/Queue-/Lektuerebindung, lokale Modellattrappe',textZeichen:doc.summary.length,beideAbschnittHashes:actual,gelesen,finalCas,historischeStarts:2,neueAttrappenStarts:calls,gesamtStarts:modelStarts,ersterTeilWartend:true,zwischenzeitlichRestzeitErschoepftOhneModell:true,altenErstellzeitpunktErhalten:true,kostenbuchUnveraendert:true});
  });

  await test('Altersgrenze bleibt fuer fehlenden Fortschritt, Budget, UNKNOWN, falschen Index und fremde Version geschlossen',async()=>{
   const payload=structuredClone(receipt.nach.job.payload),row={id:jobId,jobType:'document_understanding',tenantId:null,idempotencyKey:job.idempotencyKey,payload,createdAt:new Date(Date.parse(tag)-7*86400000).toISOString()};
   const env={HELMUT_SCALABLE_PIPELINE:'on',HELMUT_VERSTEHEN_CAS:'on',HELMUT_QUELLEN_ARBEITSFENSTER:'on'},deps={env,now:Date.now,verstehenKonkurrenz:()=>true,ladeRohdokumente:async()=>[doc],ladeRohdokumentStaende:async()=>[doc],klassen:{belege:async()=>({erlaubt:true,slot:'synthetisch'}),gebeFrei:async()=>{}}};
   for(const status of ['skipped-budget','skipped-bestandslesefehler'])await A.rejects(()=>P.HANDLER.document_understanding(row,{...deps,eagerUnderstanding:async()=>({processed:1,counts:{[status]:1},results:[{status}]})},{auftragsDeadlineMs:Date.now()+120000}),/verstehen-uebersprungen-dauerhaft/);
   await A.rejects(()=>P.HANDLER.document_understanding(row,{...deps,eagerUnderstanding:async()=>({processed:1,counts:{'skipped-ausgang-unbekannt':1},results:[{status:'skipped-ausgang-unbekannt'}]})},{auftragsDeadlineMs:Date.now()+120000}),/modellausgang-unbekannt/);
   const piece=require('../lib/helmut/artikel-abschnitte').waehle(require('../lib/helmut/artikel-abschnitte').segmentiere(doc.summary),1);
   await A.rejects(()=>P.HANDLER.document_understanding(row,{...deps,eagerUnderstanding:async()=>({processed:1,counts:{updated:1},results:[{status:'updated',promptDokumentIds:[doc.id],promptAbschnitte:{[doc.id]:piece}}]})},{auftragsDeadlineMs:Date.now()+120000}),/quellen-abschnittsfortschritt-abweichend/);
   const reader=R.erzeuge({storeId:'main',request:async()=>[{id:'main-rohstand-'+doc.id.slice(3)+'-'+stand,data:{version:1,quellenHash:stand,dokument:{...doc,summary:doc.summary+' Fremder Textstand.'}}}]});
   await A.rejects(()=>P.HANDLER.document_understanding(row,{...deps,ladeRohdokumentStaende:async()=>[await reader.lesen(doc.id,stand)],eagerUnderstanding:async()=>A.fail('Keine Modellattrappe fuer fremde Version')},{auftragsDeadlineMs:Date.now()+120000}),/quellenstand-bindung/);
  });

 }finally{psql('drop database '+db+' with (force)','postgres');}
 const nachweis=process.argv[process.argv.indexOf('--nachweis')+1];if(process.argv.includes('--nachweis'))fs.writeFileSync(nachweis,JSON.stringify({version:1,gruppen:count,einzelbelege,grenzen:['Echte PostgreSQL-CAS-/Jobfunktionen, echter Handler und Understanding; Modell-/Budgetzulassungsadapter lokal gemockt.','Keine echte Azureprobe, kein Quellenabruf und keine Productionmutation.']},null,2)+'\n',{mode:0o600});
 console.log(`${count}/${count} neue CAS-Pflichtneuversuch-Pruefgruppen bestanden; keine Anbieter-/Productionaufrufe`);
})().catch(e=>{console.error(e.stack);if(e.stderr)console.error(String(e.stderr));process.exitCode=1;});
