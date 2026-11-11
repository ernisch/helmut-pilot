import { createAdminReader } from '../api.mjs';
import { createAdminActions, AdminMutationError } from '../original-actions.mjs';
import { berlinDay, validId } from './model.mjs';
export function createSimpleApi({ fetcher=globalThis.fetch, timeoutMs=12000, now=()=>new Date() }={}) {
 const reader=createAdminReader({fetcher,timeoutMs}),actions=createAdminActions({fetcher,timeoutMs});
 let disposed=false, busy=false, writesAllowed=false;
 const pending=new Set();
 async function request(url,{method='GET',body}={}) {
  if(disposed)throw new AdminMutationError();
  const controller=new AbortController();pending.add(controller);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);let sent=false;
  const options={credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal};
  try{
   const headers={Accept:'application/json'};
   if(method!=='GET'){
    const csrf=await fetcher('/api/security/csrf',{...options,headers});
    if(!csrf.ok)throw new AdminMutationError(csrf.status);
    const token=(await csrf.json())?.token;
    if(typeof token!=='string'||token.length<20||token.length>300||/[\r\n]/.test(token))throw new AdminMutationError();
    headers['X-CSRF-Token']=token;headers['Content-Type']='application/json';
   }
   if(disposed||controller.signal.aborted)throw new AdminMutationError();
   sent=method!=='GET';
   const r=await fetcher(url,{...options,method,headers,...(body?{body:JSON.stringify(body)}:{})});
   if(!r.ok)throw new AdminMutationError(r.status,sent&&r.status>=500);
   const data=await r.json();if(!data||typeof data!=='object')throw new AdminMutationError(0,sent);
   return data;
  }catch(e){throw e instanceof AdminMutationError?e:new AdminMutationError(0,sent);}
  finally{clearTimeout(timer);pending.delete(controller);}
 }
 async function mutate(work){if(busy||disposed)throw new AdminMutationError(409);if(!writesAllowed)throw new AdminMutationError(409,false,{message:'Diese Vorschau erlaubt keine Änderungen an echten Kunden.'});busy=true;try{return await work();}finally{busy=false;}}
 async function load(){
  writesAllowed=false;reader.clear();const instant=now();
  const values=await Promise.allSettled(['customers','overview','ergebnisse'].map(key=>reader.read(key)));
  for(const v of values)if(v.status==='rejected'&&[401,403].includes(v.reason?.status))throw v.reason;
  if(values[0].status!=='fulfilled'||!Array.isArray(values[0].value?.kunden))throw new AdminMutationError();
  const customers=values[0].value.kunden;
  if(customers.some(c=>!validId(c?.userId))||new Set(customers.map(c=>c.userId)).size!==customers.length)throw new AdminMutationError();
  const data={customers,overview:values[1].status==='fulfilled'?values[1].value:null,results:{},resultDay:null,now:instant.toISOString(),generatedAt:values[0].value.generatedAt};
  data.readOnly=!data.overview||data.overview.system?.deploy?.environment==='preview';
  writesAllowed=!data.readOnly;
  if(values[2].status==='fulfilled'){
   const first=values[2].value,day=berlinDay(instant);
   if(first.verfuegbar===true&&first.tag===day&&Number.isInteger(first.seiten)&&first.seiten>=1){
    const pages=[first];
    for(let i=2;i<=Math.min(4,first.seiten);i++){
     try{pages.push(await reader.read('ergebnisse',i));}catch(e){if([401,403].includes(e.status))throw e;break;}
    }
    const ids=new Set();let valid=berlinDay(now())===day;
    for(const p of pages){
     if(p.verfuegbar!==true||p.tag!==day||p.aktiv!==first.aktiv||p.seiten!==first.seiten||!Array.isArray(p.profile)){valid=false;break;}
     for(const row of p.profile){if(!validId(row?.id)||ids.has(row.id)){valid=false;break;}ids.add(row.id);data.results[row.id]=row;}
    }
    if(valid)data.resultDay=day;else data.results={};
   }
  }
  return data;
 }
 return {
  load,
  async profile(id){if(!validId(id))throw new AdminMutationError(400);try{return await request(`/api/admin/profile/${encodeURIComponent(id)}`);}catch(e){if(e.status===404)return null;throw e;}},
  createCustomer(input){return mutate(()=>actions.createPersonalCustomerAccount(input));},
  saveProfile(id,input){
   const keys=['fullName','party','faction','parliamentType','state','constituency','focusTopics'];
   if(!validId(id)||!input||Object.keys(input).some(k=>!keys.includes(k)))return Promise.reject(new AdminMutationError(400));
   return mutate(async()=>{
    let existing;try{existing=await request(`/api/admin/profile/${encodeURIComponent(id)}`);}catch(e){if(e.status!==404)throw e;}
    const body={...input,...(!existing?{profileActive:false}:{})};
    const saved=await request(`/api/admin/profile/${encodeURIComponent(id)}`,{method:'PATCH',body});
    if(saved.profile?.id!==id||saved.profile?.fullName!==input.fullName||(!existing&&saved.profile.profileActive!==false))throw new AdminMutationError(0,true);
    const readback=await request(`/api/admin/profile/${encodeURIComponent(id)}`);
    if(keys.some(k=>JSON.stringify(readback.profile?.[k])!==JSON.stringify(saved.profile?.[k])))throw new AdminMutationError(0,true);
    return readback;
   });
  },
  activateProfile(id){if(!validId(id))return Promise.reject(new AdminMutationError(400));return mutate(async()=>{
   const before=await request(`/api/admin/profile/${encodeURIComponent(id)}`);
   if(before.profile?.id!==id||before.profile.profileActive!==false||!Array.isArray(before.validierung?.fehlendePflichtfelder)||before.validierung.fehlendePflichtfelder.length||before.validierung?.budgetProbleme?.length)throw new AdminMutationError(409);
   const result=await request(`/api/admin/profile/${encodeURIComponent(id)}`,{method:'PATCH',body:{profileActive:true}});
   if(result.profile?.id!==id||result.profile.profileActive!==true)throw new AdminMutationError(0,true);
   const after=await request(`/api/admin/profile/${encodeURIComponent(id)}`);
   if(after.profile?.id!==id||after.profile.profileActive!==true)throw new AdminMutationError(0,true);
   return after;
  });},
  async invite(id){if(!validId(id))throw new AdminMutationError(400);return mutate(async()=>{
   const users=await request('/api/admin/users');const user=users.find(u=>u.id===id);
   if(!user||user.role!=='abgeordneter'||['gekuendigt','deaktiviert'].includes(user.status))throw new AdminMutationError(409);
   if(user.active===false)await actions.setAccess(id,true);
   const result=await request(`/api/admin/users/${encodeURIComponent(id)}/invite`,{method:'POST',body:{}});
   const url=new URL(result.inviteUrl,globalThis.location?.origin||'http://localhost');
   if(url.origin!==(globalThis.location?.origin||'http://localhost')||url.pathname!=='/passwort-setzen'||!url.searchParams.get('token'))throw new AdminMutationError(0,true);
   return result;
  });},
  async settings(key){if(!['budget','sources','runs'].includes(key))throw new AdminMutationError(400);return reader.read(key);},
  dispose(){disposed=true;writesAllowed=false;reader.dispose();actions.dispose();for(const c of pending)c.abort();}
 };
}
