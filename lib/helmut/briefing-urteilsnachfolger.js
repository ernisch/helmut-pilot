"use strict";
const A = require("node:assert/strict"), B = require("./briefing-speicher");
function kennung(userId, tag, ursprungHash) {
  require("./storage").assertTenant(userId, "urteilsnachfolger");
  A(/^\d{4}-\d{2}-\d{2}$/.test(tag)); A(/^[a-f0-9]{64}$/.test(ursprungHash || ""));
  return `bf-${userId}-briefing-aussagen-${tag}-ursprung-${ursprungHash}`;
}
async function lese({ userId, tag, ursprungHash, storage = require("./storage") }) {
  storage.assertTenant(userId,"urteilsnachfolgerLesen");
  const id=kennung(userId,tag,ursprungHash);
  // Offlineadapter ohne diesen Speicherpfad liefern keinen Nachfolger.
  if (typeof storage.tenantRequest !== "function") return null;
  const rows=await storage.tenantRequest(`/rest/v1/briefings?select=*&user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}&limit=2`,userId);
  A(Array.isArray(rows)&&rows.length<=1);
  if (!rows.length) return null;
  A.equal(rows[0].user_id,userId); A.equal(rows[0].id,id); A.equal(rows[0].slot,"briefing-aussagen");
  return rows[0];
}
async function speichere({ userId, urteil, result, c, storage, now }) {
  storage.assertTenant(userId,"urteilsnachfolgerSchreiben");
  A(require("./testkohorte-betrieb").istKohortenKennung(userId));
  A.equal(c.version,2); A.equal(c.userId,userId); A.equal(B.hash(urteil),B.hash(c.urteil));
  const row={id:kennung(userId,c.tag,urteil.korrektur.ursprungHash),user_id:userId,slot:"briefing-aussagen",
    generated_at:now.toISOString(),payload:{urteil:structuredClone(urteil),importbeleg:{version:1,tag:c.tag,
      productionCommit:c.productionCommit,freigabeHash:B.hash(c),urteilHash:B.hash(urteil),kontextHash:c.kontextHash}}};
  require("./briefing-urteilsimport").pruefeZeile(row,result,{nachfolger:true});
  A(storage.v3StoreReady());
  let ack,unknown=false;
  try { ack=await storage.tenantRequest(`/rest/v1/briefings?on_conflict=id&user_id=eq.${encodeURIComponent(userId)}&select=*`,userId,
    {method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(row)}); }
  catch { unknown=true; }
  const after=await lese({userId,tag:c.tag,ursprungHash:urteil.korrektur.ursprungHash,storage});
  A(after && B.hash(after.payload)===B.hash(row.payload) && Date.parse(after.generated_at)===Date.parse(row.generated_at));
  A(!unknown && Array.isArray(ack)&&ack.length===1&&B.hash(ack[0].payload)===B.hash(row.payload));
  return {verwendbar:true,gespeichert:true,nachfolger:true,id:row.id};
}
module.exports={kennung,lese,speichere};
