"use strict";
const A=require("node:assert/strict"),{baueBeleg}=require("../lib/helmut/end500-waechter-beleg");
const jetzt=Date.parse("2026-10-07T11:00:00Z");
function fixture() {
  const a={operationId:"synthetik500-fenster-test01",manifestHash:"a".repeat(64),productionCommit:"b".repeat(40),
    startAt:"2026-10-07T10:59:00Z",endAt:"2026-10-07T12:00:00Z"};
  return {auftrag:a,status:{...a,version:"helmut-end500/1",state:"armed",schedulerActive:true,
    activationRight:false,jobId:1,ticks:3,recentSuccessfulRuns:2,observedAt:"2026-10-07T11:00:00Z",
    lastTick:"2026-10-07T10:59:50Z",targetCount:500,activeTargets:0,stoppedAt:null,reason:null},
    rpcHash:"c".repeat(64),primaerbeleg:{referenz:"privat/end500-status.json",sha256:"d".repeat(64)}};
}
let n=0;const b=baueBeleg(fixture(),jetzt);A.equal(b.zustand,"bereit-lesend");A.equal(b.jobId,"1");
A.equal(Object.keys(b).length,8);n++;
for (const [key,value] of [["state","stopped"],["schedulerActive",false],["activationRight",true],
  ["recentSuccessfulRuns",1],["recentSuccessfulRuns",undefined],["ticks",1],["ticks",undefined],["lastTick","2026-10-07T10:55:00Z"],
  ["observedAt","2026-10-07T11:00:01Z"],["activeTargets",500],["targetCount",499],
  ["operationId","synthetik500-fremdes-fenster"],["manifestHash","f".repeat(64)],
  ["productionCommit","e".repeat(40)],["endAt","2026-10-07T11:00:00Z"]]) {
  const x=fixture();x.status[key]=value;A.throws(()=>baueBeleg(x,jetzt));n++;
}
// Echte bestehende Startschutz-/Envelope-Integration, nur inerte lokale Konstruktion.
const x=require("./synthetik-500-runtime-test").fixture({now:jetzt});
const a={...x.auftrag,startAt:x.manifest.vorflugAm,endAt:x.manifest.endeAm};
const s={...fixture().status,...a,observedAt:"2026-10-07T11:00:00+00:00"};
x.full.endwaechter=baueBeleg({status:s,auftrag:a,rpcHash:fixture().rpcHash,primaerbeleg:fixture().primaerbeleg},jetzt);
const envelope=x.G.baueEnvelope(x.activate,x.bytes,jetzt);
A.equal(envelope.startbelege.endwaechterBereit.jobId,"1");
A.equal(envelope.startbelege.endwaechterBereit.manifestHash,x.auftrag.manifestHash);n++;
console.log(`${n} PASS — nur lokale Belegstruktur, kein Production-Nachweis.`);
