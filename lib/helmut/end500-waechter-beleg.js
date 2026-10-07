"use strict";
// Uebersetzt nur einen echten, frisch gegengelesenen DB-Status in den bestehenden
// Endwaechter-Belegvertrag. Keine externen Anfragen, Bindung oder Aktivierung.
function baueBeleg({ status:s, auftrag:a, rpcHash, primaerbeleg }, jetzt=Date.now()) {
  const zeit=x=>typeof x==="string" && Number.isFinite(Date.parse(x));
  const hash=x=>/^[a-f0-9]{64}$/.test(x||"");
  if (!s || !a || s.version!=="helmut-end500/1" || s.state!=="armed"
    || s.schedulerActive!==true || s.activationRight!==false
    || !Number.isSafeInteger(s.jobId) || s.jobId<=0
    || !Number.isSafeInteger(s.ticks) || s.ticks<2
    || !Number.isSafeInteger(s.recentSuccessfulRuns) || s.recentSuccessfulRuns<2
    || !zeit(s.observedAt) || !zeit(s.lastTick) || !Number.isFinite(jetzt)
    || Date.parse(s.observedAt)>jetzt || jetzt-Date.parse(s.observedAt)>60000
    || Date.parse(s.lastTick)>jetzt || jetzt-Date.parse(s.lastTick)>90000
    || s.targetCount!==500 || s.activeTargets!==0 || s.stoppedAt!==null || s.reason!==null
    || !/^synthetik500-[A-Za-z0-9_-]{8,100}$/.test(a.operationId||"")
    || !hash(a.manifestHash) || !/^[a-f0-9]{40}$/.test(a.productionCommit||"")
    || s.operationId!==a.operationId || s.manifestHash!==a.manifestHash || s.productionCommit!==a.productionCommit
    || !zeit(a.startAt) || !zeit(a.endAt) || Date.parse(s.startAt)!==Date.parse(a.startAt)
    || Date.parse(s.endAt)!==Date.parse(a.endAt) || jetzt<Date.parse(a.startAt) || jetzt>=Date.parse(a.endAt)
    || !hash(rpcHash) || !primaerbeleg || Object.keys(primaerbeleg).sort().join("|")!=="referenz|sha256"
    || typeof primaerbeleg.referenz!=="string" || !primaerbeleg.referenz.trim()
    || primaerbeleg.referenz.trim()!==primaerbeleg.referenz || !hash(primaerbeleg.sha256)) {
    throw new Error("end500-kein-frischer-gebundener-waechterbeleg");
  }
  return {jobId:String(s.jobId),operationId:a.operationId,manifestHash:a.manifestHash,
    productionCommit:a.productionCommit,beobachtetAm:new Date(s.observedAt).toISOString(),zustand:"bereit-lesend",rpcHash,primaerbeleg};
}
module.exports={baueBeleg};
