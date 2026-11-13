"use strict";
const crypto = require("node:crypto");
const nichtGesendet = new WeakSet();
function gesperrt() {
  const error = Object.assign(Error("modell-arbeitsgrenze-nicht-verfuegbar"), {
    code: "LLM_BUDGET_EXHAUSTED", reason: "modell-arbeitsgrenze", kiNichtGesendet: true
  });
  nichtGesendet.add(error); return error;
}
// Vor ALLEN normalen Anbieteraufrufen, auch direkter Cron und Buero. Keine
// Aenderung von Kostenreservierung oder Rate. TTL liegt ueber Vercels hartem
// 300s-Limit; Freigabe erst nach Abschluss des wirklichen Anbieter-Promises.
async function begrenzt(arbeit, storage = require("./storage")) {
  const owner = `modell-${crypto.randomUUID()}`;
  let lease;
  try { lease = await storage.klasseBelege({ klasse: "modellaufruf", max: 2, ttlMs: 360000, owner }); }
  catch { throw gesperrt(); }
  if (!lease || lease.verfuegbar === false || lease.erlaubt !== true || !lease.slot) throw gesperrt();
  try { return await arbeit(); }
  finally { await storage.klasseGebeFrei({ slot: lease.slot, owner }).catch(() => null); }
}
module.exports = { begrenzt, istBelegtNichtGesendet: error => nichtGesendet.has(error) };
