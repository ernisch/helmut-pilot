'use strict';
// Zwei lokale Phasen: Bedarf ermitteln und aufgenommene Antworten verbrauchen.
// Ausschließlich unter scripts/lokal.js, niemals Production Zugangsdaten.
const fs=require('node:fs'),path=require('node:path'),A=require('node:assert/strict');
const P=require('./b055-aufnahme-pruefer');
async function baue({identity,mandateRow,kos,runtime,now,packet=null},root) {
 A.equal(identity?.id,'test-kohorte-b-055');A.equal(mandateRow?.user_id,identity.id);
 A.equal(mandateRow.aktiv,false);A.equal(mandateRow.geloescht_at,null);
 A(Array.isArray(kos)&&kos.length<=500);A(Number.isFinite(Date.parse(now)));
 A.equal(runtime?.commit,P.COMMIT);A.equal(runtime.quellenkontext?.scoring,'off');
 A.equal(runtime.quellenkontext.relevanzordnung,false);A.equal(runtime.quellenkontext.koScan,500);
 A.equal(runtime.quellenkontext.relevanzTage,14);A.equal(runtime.quellenkontext.sourceSafetyStandard,true);
 for(const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','SUPABASE_SECRET_KEY','VERCEL_TOKEN','HELMUT_CRON_SECRET']) A(!process.env[k],'lokale-isolation-fehlt');
 A.equal(process.env.HELMUT_STORAGE_BACKEND,'local');
 require('node:child_process').execFileSync('git',['diff','--quiet',P.COMMIT,'--','.',':(exclude)docs'],{cwd:root,stdio:'pipe'});
 const writes=['writeFileSync','writeFile','appendFileSync','appendFile','mkdirSync','mkdir','renameSync','rename','unlinkSync','unlink','rmSync','rm','rmdirSync','rmdir','copyFileSync','copyFile','createWriteStream','truncateSync','truncate'];
 const denied=()=>{throw new Error('lokaler-schreibpfad-erreicht');};
 const readonly=flags=>flags==='r'||flags==='rs'||flags===0;
 const openSync=fs.openSync,open=fs.open,pOpen=fs.promises.open;
 fs.openSync=(name,flags,...rest)=>{A(readonly(flags),'schreibendes-open');return openSync(name,flags,...rest);};
 fs.open=(name,flags,...rest)=>{A(readonly(flags),'schreibendes-open');return open(name,flags,...rest);};
 fs.promises.open=(name,flags,...rest)=>{A(readonly(flags),'schreibendes-open');return pOpen.call(fs.promises,name,flags,...rest);};

 for(const k of writes) if(typeof fs[k]==='function')fs[k]=denied;
 for(const k of ['writeFile','appendFile','mkdir','rename','unlink','rm','rmdir','copyFile','truncate'])if(fs.promises[k])fs.promises[k]=denied;
 global.fetch=async()=>{throw new Error('lokaler-netzpfad-erreicht');};
 const src=fs.readFileSync(path.join(root,'lib/helmut/storage.js'),'utf8');
 A.equal(P.hash(src),'d34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888');
 const recorded=packet?await P.pruefe(packet,src):null;
 if(packet){A.equal(packet.referenceTime,now);A(Date.parse(packet.runtimeBefore.receivedAt)<=Date.parse(now)&&Date.parse(now)<=Date.parse(packet.runtimeAfter.receivedAt));A.equal(packet.inputEvidence.profileSha256,P.hash(JSON.stringify({identity,mandateRow})));
  A.equal(packet.inputEvidence.kosSha256,P.hash(JSON.stringify(kos)));}
 for(const n of ['HELMUT_SCORING_MODE','HELMUT_RELEVANZORDNUNG','HELMUT_BRIEFING_RELEVANZ_TAGE','HELMUT_SOURCE_BLOCKLIST','HELMUT_SOURCE_ALLOWLIST','HELMUT_REVIEW_FIXTURE']) delete process.env[n];
 process.env.HELMUT_KO_SCAN_LIMIT='500';
 const S=require(path.join(root,'lib/helmut/storage'));
 const profile=S.fromMandateProfileRow(identity,mandateRow),ids=new Set();
 const responses=new Map((recorded?.responses||[]).map(r=>[r.vorgangId,r.consumedDocs]));
 S.v3StoreReady=()=>true;
 S.listKnowledgeObjects=async o=>{A.equal(o.limit,500);A.equal(o._signalError,true);return structuredClone(kos);};
 S.getSourcesForVorgang=async id=>{ids.add(id);if(packet)A(responses.has(id),'nicht-aufgenommene-quelle');return structuredClone(responses.get(id)||[]);};
 // Vor dem Serverimport gespeicherte Funktionsreferenzen binden. Jede unerwartete
 // weitere Storagefunktion ist gesperrt, insbesondere Schreib und Modellbudgets.
 for(const key of Object.keys(S))if(typeof S[key]==='function'&&!['fromMandateProfileRow','v3StoreReady','listKnowledgeObjects','getSourcesForVorgang'].includes(key))S[key]=()=>{throw new Error('unerwarteter-speicherpfad:'+key);};
 const result=await require(path.join(root,'server')).__buildV3Briefing(profile,profile.id,{aussagenEingabe:true,now:new Date(now)});
 if(packet)A.deepEqual([...ids].sort(),[...packet.requestedVorgangIds].sort());
 return {art:packet?'lokaler-aufbau-aus-aufgenommenen-antworten':'nur-quellenbedarf',productionMitschnittBestaetigt:false,
  fachlicheFreigabe:false,referenceTime:now,requestedVorgangIds:[...ids],inputEvidence:{profileSha256:P.hash(JSON.stringify({identity,mandateRow})),kosSha256:P.hash(JSON.stringify(kos)),quellenbedarfSha256:P.hash(JSON.stringify([...ids]))},
  ...(packet?{result,aufnahmeHash:recorded.aufnahmeHash}:{})};
}
module.exports={baue};
if(require.main===module){const [file,root]=process.argv.slice(2);Promise.resolve().then(()=>baue(JSON.parse(fs.readFileSync(file,'utf8')),path.resolve(root)))
 .then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{console.error('Lokaler Aufbau nicht bestätigt; keine private Fehlerausgabe.');process.exitCode=1;});}
