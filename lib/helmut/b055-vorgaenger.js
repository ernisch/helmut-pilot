"use strict";
const A = require("node:assert/strict"), B = require("./briefing-speicher"), K = require("./testkosten-budget");
// Nur lesen. Der neue Auftrag ist an genau den beendeten alten Versuch gebunden.
async function pruefe({ c, get, storage }) {
  const E = require("./b055-einzelabschluss"), v = c.vorgaenger;
  storage.assertTenant(c.userId, "b055Vorgaenger"); A.equal(c.userId, E.MANDAT);
  const read = async id => { const rows = await get("briefings?select=*&user_id=eq." + E.MANDAT
    + "&id=eq." + encodeURIComponent(id) + "&limit=2"); A.equal(rows.length, 1); A.equal(rows[0].user_id,E.MANDAT); A.equal(rows[0].id,id); return rows[0]; };
  const [start, draft, urteil, runs, auth] = await Promise.all([
    read(E.START_ID), read(`bf-${E.MANDAT}-lage-pruefentwurf-${v.tag}-${v.runId}-entwurf`),
    read(`bf-${E.MANDAT}-briefing-aussagen-${v.tag}`),
    get("process_runs?select=*&process=eq.briefing-einzelabschluss&run_id=eq." + v.runId + "&limit=2"),
    get("helmut_store?select=data&id=eq.main-auth&limit=2")]);
  A.equal(start.slot,E.SLOT); A.equal(start.payload.version,1); A.equal(start.payload.runId,v.runId);
  A.equal(B.hash(start),v.startHash); A.equal(B.hash(draft),v.entwurfHash); A.equal(B.hash(urteil),v.urteilHash);
  A.equal(draft.slot,"lage-pruefentwurf"); A.equal(draft.payload.runId,v.runId);
  A.equal(draft.payload.auslieferbar,false); A.equal(draft.payload.qualitaetBestanden,false);
  A.equal(runs.length,1); A.equal(runs[0].status,"failed"); A.equal(runs[0].reason,"einzellage-abgelehnt");
  A(Number.isFinite(Date.parse(runs[0].finished_at))); A.equal(runs[0].target_count,1); A.equal(runs[0].saved_count,0);
  A.equal(auth.length,1); const book=K.pruefeTag(auth[0].data[K.KEY]?.[v.tag],v.tag);
  const costs=Object.values(book.calls).filter(x=>x.bezug?.runId===v.runId);
  A.equal(costs.length,1); A.equal(costs[0].status,"abgerechnet"); A.equal(costs[0].bezug.phase,"entwurf");
  A.equal(costs[0].bezug.mandatHash,require("./testkohorte-direkt500").hash(E.MANDAT));
  A.equal(costs[0].cost,v.costMicroUsd);
  A.equal(Object.values(book.calls).filter(x=>x.bezug?.runId===c.runId).length,0);
  return { bestaetigt:true, schreibversuche:0 };
}
module.exports={pruefe};
