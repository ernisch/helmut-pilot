"use strict";
const A=require('node:assert/strict'),{fixture}=require('./b055-einzelabschluss-test'),N=require('../lib/helmut/briefing-urteilsnachfolger'),
 I=require('../lib/helmut/briefing-urteilsimport'),B=require('../lib/helmut/briefing-speicher'),Q=require('../lib/helmut/briefing-aussagenbindung');
(async()=>{
 const h=fixture(),c=h.c;c.version=2;const userId=c.userId,tag=c.tag,result=h.result;let writes=0,lost=false;
 const rows=new Map(),storage={...h.args.deps.storage,v3StoreReady:()=>true,
 tenantRequest:async(url,id,opts)=>{A.equal(id,userId);A(url.includes('user_id=eq.'+userId));
  if(opts?.method==='POST'){writes++;A.equal(opts.headers.Prefer,'resolution=ignore-duplicates,return=representation');
   const r=JSON.parse(opts.body);if(rows.has(r.id))return [];rows.set(r.id,r);if(lost)throw Error('lost');return [r];}
  const id2=new URL('https://offline.invalid'+url).searchParams.get('id').slice(3);return rows.has(id2)?[rows.get(id2)]:[];}};
 const id=N.kennung(userId,tag,c.urteil.korrektur.ursprungHash);
 A.equal(await N.lese({userId,tag,ursprungHash:c.urteil.korrektur.ursprungHash,storage}),null);
 const r=await N.speichere({userId,urteil:c.urteil,result,c,storage,now:h.now});A.equal(r.gespeichert,true);A.equal(writes,1);
 const row=await N.lese({userId,tag,ursprungHash:c.urteil.korrektur.ursprungHash,storage});I.pruefeZeile(row,result,{nachfolger:true});
 A.throws(()=>I.pruefeZeile(row,result));
 const keep=B.hash(row);await A.rejects(N.speichere({userId,urteil:c.urteil,result,c,storage,now:h.now}));A.equal(B.hash(rows.get(id)),keep);
 const bad=structuredClone(c);bad.urteil.aussagen[0].sachlichGetragen=false;
 const before=writes;await A.rejects(N.speichere({userId,urteil:bad.urteil,result,c:bad,storage,now:h.now}));A.equal(writes,before);
 const old=structuredClone(row);old.id=`bf-${userId}-${Q.SLOT}-${tag}`;old.payload.urteil.korrektur.ursprungHash='f'.repeat(64);
 const readStorage={...storage,getRenderedBriefingV3:async()=>old};
 const read=await Q.leseFuerNachlauf({userId,profile:h.ctx.profile,build:h.args.build,storage:readStorage,now:h.now});
 A.equal(read.bereit,true);A.equal(old.payload.urteil.korrektur.ursprungHash,'f'.repeat(64));
 const fake=structuredClone(row);fake.user_id='anderer';rows.set(id,fake);await A.rejects(N.lese({userId,tag,ursprungHash:c.urteil.korrektur.ursprungHash,storage}));
 rows.delete(id);lost=true;await A.rejects(N.speichere({userId,urteil:c.urteil,result,c,storage,now:h.now}));A(rows.has(id));
 console.log('8/8 Nachfolgergruppen: atomare Neuanlage, echtes Urteil, gebundener Leser, Altdaten, Mandantenschutz und verlorene Antwort');
})().catch(e=>{console.error(e);process.exitCode=1});
