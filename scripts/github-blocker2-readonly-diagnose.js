"use strict";
// Ein fester synthetischer Diagnoseabruf, nur nach eigener konkreter Freigabe.
// Vorhandener Cipher-/ACK-/Stop-Vertrag; kein neuer Auth- oder Datenweg.
const F=require("node:fs"),P=require("node:path"),G=require("./github-blocker2-readonly500");
async function main() {
  const source=P.join(__dirname,"..","tmp","blocker2-readonly500");
  const controller=new AbortController(),cleanup=G.installStopHandlers(controller);
  try {
    const r=await G.ausfuehren({diagnose:true,signal:controller.signal,
      writeEnvelope:(name,envelope)=>G.atomicEnvelope(source,name,envelope),
      persistCheckpoint:require("./github-blocker2-cipher-checkpoint").checkpointWriter({source,env:process.env})});
    if(process.env.GITHUB_OUTPUT)F.appendFileSync(process.env.GITHUB_OUTPUT,"cipher_final_saved="+String(r.cipherFinalSaved)+"\n");
    console.log(JSON.stringify(r));if(!r.ok)process.exitCode=1;
  } finally {cleanup();}
}
if(require.main===module)main().catch(()=>{console.error("Blocker2 Einzeldiagnose gestoppt; nur verschluesselte Belege.");process.exitCode=1;});
