'use strict';
// Enger, explizit aufzurufender Transportbaustein für eine später freigegebene
// neue Aufnahme. Kein CLI Start, keine geerbten Secrets, keine automatischen Läufe.
const vm=require('node:vm');
const P=require('./b055-aufnahme-pruefer');
const ORIGIN='https://ddckuvvpcytqbyfmbvie.supabase.co';
const check=(v,m)=>{if(!v)throw new Error(m);};
async function erfasse({mandat,commit,ids,storageText,fetchFn,serviceKey,now=()=>new Date()}) {
 check(mandat==='test-kohorte-b-055' && commit===P.COMMIT,'aufnahme-kontext-abweichend');
 check(typeof storageText==='string' && P.hash(storageText)==='d34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888','verbrauchercode-abweichend');
 check(Array.isArray(ids)&&ids.length>0&&ids.length<=500&&new Set(ids).size===ids.length
  &&ids.every(id=>typeof id==='string'&&/^vg-[\p{L}\p{N}-]+$/u.test(id)),'quellenbedarf-ungueltig');
 check(typeof fetchFn==='function'&&typeof serviceKey==='string'&&serviceKey.length>0,'transport-fehlt');
 const start=storageText.indexOf('async function getSourcesForVorgang('),end=storageText.indexOf('// Nur die bereits ausgewaehlten Lagebelege.',start);
 const code=storageText.slice(start,end).trim();check(P.hash(code)==='f704a88e87bad8129bbd2c53ca41357992461cde0e49a8d50a6d4573b896374b','verbrauchercode-abweichend');
 const responses=[];
 for(const vorgangId of ids){
  let calls=0,failed=false,record;
  const reader=vm.runInNewContext(code+'\ngetSourcesForVorgang',{
   v3StoreReady:()=>true,encodeURIComponent,console:{error:()=>{failed=true;}},
   supabaseRequest:async endpoint=>{
    calls++;check(calls===1,'mehrfachabruf');
    const requestedAt=now().toISOString();
    // Ausschließlich der Endpoint des gepinnten Lesers, fester Ursprung,
    // keine Weiterleitung oder Cookies, kein automatischer Wiederholungsversuch.
    const response=await fetchFn(ORIGIN+endpoint,{method:'GET',redirect:'error',credentials:'omit',
     signal:AbortSignal.timeout(15000),headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,Accept:'application/json'}});
    check(response.status===200,'quellen-http-fehler');
    const contentType=response.headers.get('content-type')||'';
    check(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType),'quellen-format-fehler');
    const rawBody=await response.text();check(Buffer.byteLength(rawBody)<=2000000,'quellenantwort-zu-gross');
    let rows;try{rows=JSON.parse(rawBody);}catch{throw new Error('quellen-json-fehler');}
    check(Array.isArray(rows)&&rows.length<=40,'quellenumfang-abweichend');
    record={vorgangId,method:'GET',endpoint,httpStatus:response.status,contentType,requestedAt,
     receivedAt:now().toISOString(),rawBody,rawBodySha256:P.hash(rawBody)};
    return rows;
   }
  },{timeout:1000});
  await reader(vorgangId);
  // Der allgemeine Leser schluckt Fehler. Diese Aufnahme darf sie nicht als
  // erfolgreiche leere Antwort ausgeben. Bereits fertige Antworten bleiben erhalten.
  if(failed||calls!==1||!record){return {ok:false,grund:'quellenaufnahme-unvollstaendig',responses,
    failedVorgangId:vorgangId,keinAutomatischerWiederholungsversuch:true};}
  responses.push(record);
 }
 return {ok:true,responses,productionMitschnittBestaetigt:false,fachlicheFreigabe:false};
}
module.exports={erfasse};
