// Nur fuer die ausdruecklich getrennte private Gestaltungsvorschau. Der normale
// App-Einstieg importiert diese Datei nie. Keine Netzaufrufe oder Ablage.
import { berlinDay } from './model.mjs';
export function createPreviewApi() {
 const now=new Date().toISOString(),day=berlinDay(now);
 const pos=(stufe=3,ursache=null)=>({stufe,ursache,code:null});
 const customers=[
  {userId:'preview-nord',politicianId:'mandat-nord',name:'Beispiel Nord',email:'nord@example.invalid',role:'abgeordneter',active:true,status:'aktiv'},
  {userId:'preview-mitte',politicianId:'mandat-mitte',name:'Beispiel Mitte',email:'mitte@example.invalid',role:'abgeordneter',active:true,status:'aktiv'},
  {userId:'preview-sued',politicianId:'mandat-sued',name:'Beispiel Süd',email:'sued@example.invalid',role:'abgeordneter',active:false,status:'eingeladen'}
 ];
 const profiles=Object.fromEntries(customers.map((c,i)=>[c.politicianId,{id:c.politicianId,fullName:c.name,parliamentType:'Bundestag',state:'Berlin',party:'SPD',faction:'SPD',constituency:'Fiktiver Wahlkreis',focusTopics:['Fiktives Thema'],profileActive:i<2}]));
 const result=id=>({id,positionen:{briefing:pos(),lage:pos(),zustellung:pos()},letzterErfolg:now});
 const results={'mandat-nord':{...result('mandat-nord'),positionen:{briefing:pos(0,'fehlt'),lage:pos(),zustellung:pos(0,'fehlt')}},'mandat-mitte':result('mandat-mitte')};
 const validation=p=>{const missing=p.focusTopics?.length||p.committee||p.committees?.length?[]:['mind. ein Schwerpunkt oder Ausschuss'];return {bereit:p.profileActive!==false&&!missing.length,fehlendePflichtfelder:missing,budgetProbleme:[]};};
 const clone=value=>structuredClone(value);
 const previewInvite=()=>({inviteUrl:(globalThis.location.origin==='null'?'https://vorschau.invalid':globalThis.location.origin)+'/passwort-setzen?token=fiktiver-vorschaulink',purpose:'invite',mail:{sent:false}});
 let listener=()=>{},sourceState={zustand:'bereit',busy:false,offen:false},closed=false;
 const sourceHistory={processRuns:[{process:'warteschlange-crawl',startedAt:new Date(Date.now()-3600000).toISOString(),finishedAt:new Date(Date.now()-3300000).toISOString(),status:'partial'}],zeitplan:[{path:'/api/cron/crawl',schedule:'0 4 * * *'},{path:'/api/cron/crawl?arbeitsfenster=1',schedule:'0,15,30,45 3 * * *'}]};
 const sourceData={verfuegbar:true,zaehler:{abrufwege:12,herausgeber:8},statusCounts:{broken:1,degraded:0},automatik:{grund:'automatik-startfehler'}};
 const emit=value=>{sourceState={...value};if(!closed)listener(clone(sourceState));};
 const sourceRun={state:()=>clone(sourceState),subscribe(fn){listener=fn;return ()=>{listener=()=>{};};},restore(){},async status(){emit(sourceState);},async start(){if(closed||sourceState.busy)return;emit({zustand:'prueft',busy:true,offen:true});await new Promise(r=>setTimeout(r,100));if(closed)return;emit({zustand:'laeuft',busy:true,offen:true});await new Promise(r=>setTimeout(r,300));if(closed)return;sourceHistory.processRuns.unshift({process:'warteschlange-crawl',startedAt:now,finishedAt:new Date().toISOString(),status:'success'});sourceData.automatik.grund='automatik-erledigt';emit({zustand:'abgeschlossen',busy:false,offen:false,verarbeitet:4,planAusstehend:0,fehlgeschlagen:0,laufId:'vorschau-lauf'});}};
 return {
  sourceRun,
  async load(){return clone({customers,overview:{mandates:Object.values(profiles).map(p=>({...p,validierung:validation(p)}))},results,resultDay:day,now,generatedAt:now,supply:{sources:sourceData,history:sourceHistory}});},
  async profile(id){return profiles[id]?clone({profile:profiles[id],validierung:validation(profiles[id])}):null;},
  async createCustomer({name,email,...fields}){
   if(customers.some(c=>c.email.toLowerCase()===email.toLowerCase()))throw Object.assign(new Error('Diese E-Mail-Adresse wird bereits verwendet.'),{status:409});
   const c={userId:'preview-'+customers.length,id:'preview-'+customers.length,politicianId:'mandat-'+customers.length,name,email,role:'abgeordneter',active:true,status:'eingeladen'};
   customers.push(c);profiles[c.politicianId]={...clone(fields),id:c.politicianId,fullName:name,profileActive:false};
   return {user:clone(c),profile:clone(profiles[c.politicianId]),validierung:validation(profiles[c.politicianId]),invitation:previewInvite(),invitationSent:false};
  },
  async saveProfile(id,input){profiles[id]={...profiles[id],...clone(input),id,profileActive:profiles[id]?.profileActive===true};return {profile:clone(profiles[id]),validierung:validation(profiles[id])};},
  async activateProfile(id){if(validation(profiles[id]).fehlendePflichtfelder.length)throw new Error('Bitte zuerst die Schwerpunkte im Profil ergänzen.');profiles[id].profileActive=true;return {profile:clone(profiles[id]),validierung:validation(profiles[id])};},
  async invite(id){const c=customers.find(c=>c.userId===id);return {...previewInvite(),purpose:c.status==='eingeladen'?'invite':'reset'};},
  async setAccess(id,active){const c=customers.find(c=>c.userId===id);c.active=active;return clone(c);},
  async settings(key){return key==='budget'?{kostenwahrheit:{gesamt:{kostenUsd:0.12,kostenUnbekannt:0}}}:key==='runs'?{processRuns:[{process:'Morgenbriefing',startedAt:now,status:'erfolgreich · fiktives Beispiel'}]}:{verfuegbar:true,zaehler:{abrufwege:12,herausgeber:8},statusCounts:{broken:1,degraded:0}};},
  dispose(){closed=true;listener=()=>{};}
 };
}
