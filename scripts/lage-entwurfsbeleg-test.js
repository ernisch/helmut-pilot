"use strict";
const assert = require("node:assert/strict");
const B = require("../lib/helmut/lage-entwurfsbeleg");
const storage = require("../lib/helmut/storage");
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log("PASS " + name); }
const args = { userId: "test-entwurf-a", runId: "nachlauf500-123456", phase: "entwurf",
  profile: {id:"test-entwurf-a", committees:["Haushalt"]}, now: new Date("2026-09-09T12:00:00Z"),
  quellen: [{vorgang_id:"vg-test",quellenbelege:[{quelle_id:"q-test",titel:"Belegter Testtitel",auszug:"Die Quelle meldet einen Vorschlag."}]}],
  antwort: {paragraphs:[{text:"Ungepruefter Entwurf",vorgang_ids:["vg-test"]}]} };
(async () => {
  const entry = B.baue(args);
  await check("Privater Beleg ist kein ausgeliefertes Briefing", () => {
    assert.equal(entry.slot,"lage-pruefentwurf"); assert.equal(entry.payload.auslieferbar,false);
    assert.equal(entry.payload.qualitaetBestanden,false); assert(!JSON.stringify(entry.payload).includes("test-entwurf-a"));
    assert.notEqual(B.baue({...args,phase:"pruefung"}).id,entry.id);
  });
  await check("Nur manueller Lauf, passendes Profil und begrenzte Antwort", () => {
    for (const patch of [{runId:"cron-123456"},{profile:{id:"fremd"}},{antwort:{text:"x".repeat(24001)}},{phase:"auslieferung"}])
      assert.throws(()=>B.baue({...args,...patch}),/nicht-bestaetigt/);
  });
  await check("Schreiber bindet Mandat und benutzt Insert ohne Ueberschreiben", async () => {
    let requestCount=0;
    const result=await storage.insertLageEntwurfsbeleg(entry,{bereit:true,request:async(url,options)=>{
      requestCount++; assert(url.includes("user_id=eq.test-entwurf-a")); assert.equal(options.method,"POST");
      assert.match(options.headers.Prefer,/ignore-duplicates/); assert.deepEqual(JSON.parse(options.body),entry); return [entry];
    }});
    assert.equal(result.saved,true); assert.equal(requestCount,1);
    await assert.rejects(()=>storage.insertLageEntwurfsbeleg({...entry,slot:"lage"},{bereit:true}),/ungueltig/);
  });
  await check("Fremde Schreibquittung wird abgewiesen", async () => {
    await assert.rejects(()=>storage.insertLageEntwurfsbeleg(entry,{bereit:true,request:async()=>[{...entry,user_id:"fremd"}]}));
  });
  await check("Leser filtert Besitzer, genaue Kennung und privaten Slot", async () => {
    const result=await storage.getLageEntwurfsbeleg(args.userId,entry.id,{bereit:true,request:async(url)=>{
      assert(url.includes("user_id=eq.test-entwurf-a")); assert(url.includes("slot=eq.lage-pruefentwurf"));
      assert(url.includes("id=eq."+encodeURIComponent(entry.id))); return [entry];
    }}); assert.deepEqual(result,entry);
    await assert.rejects(()=>storage.getLageEntwurfsbeleg(args.userId,entry.id,{bereit:true,request:async()=>[{...entry,user_id:"fremd"}]}));
  });
  await check("Erfolg erfordert unabhaengiges inhaltlich identisches Ruecklesen", async () => {
    assert.deepEqual(await B.speichere(args,{insertLageEntwurfsbeleg:async()=>({saved:true}),getLageEntwurfsbeleg:async()=>entry}),{gespeichert:true});
    await assert.rejects(()=>B.speichere(args,{insertLageEntwurfsbeleg:async()=>({saved:true}),getLageEntwurfsbeleg:async()=>({...entry,payload:{}})}),/nicht-bestaetigt/);
  });
  await check("Unbekannter Schreibausgang erzeugt keinen zweiten Versuch", async () => {
    let writes=0;
    await assert.rejects(()=>B.speichere(args,{insertLageEntwurfsbeleg:async()=>{writes++; throw new Error("write-unknown");}}));
    assert.equal(writes,1);
  });
  await check("Kollidierender Beleg wird nur identisch als vorhanden akzeptiert", async () => {
    assert.deepEqual(await B.speichere(args,{insertLageEntwurfsbeleg:async()=>({reason:"existing-result"}),getLageEntwurfsbeleg:async()=>entry}),{gespeichert:true});
    await assert.rejects(()=>B.speichere(args,{insertLageEntwurfsbeleg:async()=>({reason:"existing-result"}),getLageEntwurfsbeleg:async()=>({...entry,payload:{...entry.payload,antwort:{anders:true}}})}));
  });
  console.log(`${checks} PASS: private Entwurfsbelege, Mandatsbindung, unveraenderliche Ablage, Ruecklesen`);
})().catch(e=>{console.error(e);process.exitCode=1;});
