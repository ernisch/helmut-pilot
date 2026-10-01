"use strict";
// Standard AUS, eigenstaendiger manueller Workflow; kein Startrecht/Scheduler.
const P = require("../lib/helmut/synthetik-500-profile");
const R = require("../lib/helmut/synthetik-500-end-runtime");
const F = require("./realkohorte-500-endwaechter");
const erzeugeEndwaechter = bytes => F.erzeugeEndwaechter(R.erzeugeEndRuntime(bytes), { synthetik: true });
const standard = F.erzeugeEndwaechter(R, { synthetik: true });
async function ausfuehren(optionen={}) {
  const env=optionen.env || process.env;
  try {
    const paket=P.erzeuge({variante:env.HELMUT_SYNTHETIK500_VARIANTE || "basis-v1"});
    const result=await erzeugeEndwaechter(P.serialisiere(paket)).ausfuehren({...optionen,env});
    return {...result,variante:paket.generator.variante,paketHash:paket.bindung.paketHash};
  }catch{return {ok:false,bewaffnet:false,externeAnfragen:0,aktivierungsrecht:false,starttorFreigegeben:false,
    grund:"synthetik500-waechter-variante-ungueltig"};}
}
if (require.main===module) {
  const args=process.argv.slice(2);
  if (args.length>1 || (args.length===1 && args[0]!=="--scharf")) process.exitCode=2;
  else ausfuehren({scharf:args[0]==="--scharf"}).then(r=>{
    console.log(JSON.stringify(r));process.exitCode=r.ok?0:1;
  }).catch(()=>{console.error("Synthetik-Ende nicht bestaetigt; gebundenen Rueckweg pruefen.");process.exitCode=1;});
}
module.exports={...standard,erzeugeEndwaechter,ausfuehren};
