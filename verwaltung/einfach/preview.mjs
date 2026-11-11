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
 const validation=p=>({bereit:p.profileActive!==false,fehlendePflichtfelder:[],budgetProbleme:[]});
 const clone=value=>structuredClone(value);
 return {
  async load(){return clone({customers,overview:{mandates:Object.values(profiles).map(p=>({...p,validierung:validation(p)}))},results,resultDay:day,now,generatedAt:now});},
  async profile(id){return profiles[id]?clone({profile:profiles[id],validierung:validation(profiles[id])}):null;},
  async createCustomer({name,email}){
   if(customers.some(c=>c.email.toLowerCase()===email.toLowerCase()))throw Object.assign(new Error('Diese E-Mail-Adresse wird bereits verwendet.'),{status:409});
   const c={userId:'preview-'+customers.length,id:'preview-'+customers.length,politicianId:'mandat-'+customers.length,name,email,role:'abgeordneter',active:false,status:'eingeladen'};
   customers.push(c);return {user:clone({...c,id:c.userId}),invitationSent:false};
  },
  async saveProfile(id,input){profiles[id]={...profiles[id],...clone(input),id,profileActive:profiles[id]?.profileActive===true};return {profile:clone(profiles[id]),validierung:validation(profiles[id])};},
  async activateProfile(id){profiles[id].profileActive=true;return {profile:clone(profiles[id]),validierung:validation(profiles[id])};},
  async invite(id){const c=customers.find(c=>c.userId===id);c.active=true;const origin=globalThis.location.origin==='null'?'https://vorschau.invalid':globalThis.location.origin;return {inviteUrl:origin+'/passwort-setzen?token=fiktiver-vorschaulink',mail:{sent:false}};},
  async settings(key){return key==='budget'?{kostenwahrheit:{gesamt:{kostenUsd:0.12,kostenUnbekannt:0}}}:key==='runs'?{processRuns:[{process:'Morgenbriefing',startedAt:now,status:'erfolgreich · fiktives Beispiel'}]}:{verfuegbar:true,zaehler:{abrufwege:12,herausgeber:8},statusCounts:{broken:1,degraded:0}};},
  dispose(){}
 };
}
