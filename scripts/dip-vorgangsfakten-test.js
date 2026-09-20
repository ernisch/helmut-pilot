"use strict";

// Der echte feste API Leser und der vorhandene Planbaustein, Transport offline.
// Dies ersetzt NICHT die 36 produktiven Briefing/Lagefaelle.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { lese } = require("../lib/helmut/dip-vorgangsfakten");
const { binde } = require("../lib/helmut/prosa-faktenplan");
const copy = x => structuredClone(x);
const tag = "2026-09-20", positionIds = ["99001"];
const basis = { id:"99001", typ:"Vorgangsposition", vorgang_id:"88001", zuordnung:"BT",
  titel:"Zuschuss für Busfahrkarten unter Finanzierungsvorbehalt",
  vorgangsposition:"Beratung", datum:"2026-09-18", dokumentart:"Plenarprotokoll",
  fortsetzung:false, nachtrag:false, aktivitaet_anzahl:9,
  aktivitaet_anzeige:[{ name:"Darf nicht als ganze Liste oder Einzelrolle verwendet werden" }],
  fundstelle:{ id:"77001", dokumentart:"Plenarprotokoll", herausgeber:"BT", datum:"2026-09-18",
    dokumentnummer:"21/99", pdf_url:"https://dserver.bundestag.de/btp/21/21099.pdf#P.1" },
  beschlussfassung:[{ beschlusstenor:"Annahme mit Änderungen unter Vorbehalt der Finanzierung",
    dokumentnummer:"21/990", grundlage:"Finanzierungsvorbehalt laut Vorlage", seite:"1C" }],
  ueberweisung:[{ ausschuss:"Ausschuss für Verkehr", ausschuss_kuerzel:"Verkehr",
    federfuehrung:false, ueberweisungsart:"gemäß § 96 Geschäftsordnung BT" }] };
let payload, calls, transport;
const originalFetch = global.fetch, originalKey = process.env.DIP_API_KEY;
let passed = 0;
async function test(name, run) {
  payload = copy(basis); calls = []; transport = null;
  await run(); passed++; console.log("PASS " + name);
}
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  process.env.DIP_API_KEY = "offline-test-key";
  global.fetch = async (url,opts) => {
    calls.push({ url,opts });
    return transport ? transport(url,opts) : new Response(JSON.stringify(payload),{
      headers:{ "content-type":"application/json" }
    });
  };
  const read = () => lese({ positionIds,tag });
  await test("Fester amtlicher Endpunkt; Schluessel nur im Header; keine Weiterleitung", async () => {
    const r = await read();
    assert.equal(calls[0].url,"https://search.dip.bundestag.de/api/v1/vorgangsposition/99001?format=json");
    assert.equal(calls[0].opts.headers.Authorization,"ApiKey offline-test-key");
    assert.equal(calls[0].opts.redirect,"error");
    assert(!JSON.stringify(r).includes("offline-test-key"));
    assert.equal(r.fakten.length,2); assert.equal(r.vollstaendigeFaktenpruefung,false);
  });
  await test("Beschluss behaelt Bedingung, konkrete Vorlage und Grundlage", async () => {
    const r = await read(), f = r.fakten[0];
    assert.equal(f.gegenstand,"21/990"); assert.equal(f.ereigniszeit,null);
    assert.equal(f.formulierungen.ereignis,
      'DIP verzeichnet zum Vorgang "Zuschuss für Busfahrkarten unter Finanzierungsvorbehalt" beim Deutschen Bundestag im Schritt "Beratung" den Beschlusstenor "Annahme mit Änderungen unter Vorbehalt der Finanzierung" zur Vorlage "21/990" (Grundlage: "Finanzierungsvorbehalt laut Vorlage"; Protokollseite: "1C").');
    assert.deepEqual(Object.keys(f.formulierungen),["ereignis"]);
  });
  await test("Keine Finanzwirkung, individuelle Pflicht, Frist oder Vollzug erfunden", async () => {
    const r = await read();
    for (const f of r.fakten) {
      assert.equal(f.profilHash,null); assert.equal(f.ereigniszeit,null);
      assert.deepEqual(Object.keys(f.formulierungen),["ereignis"]);
    }
    assert.equal(r.quellen[0].dokumentdatum,"2026-09-18");
    assert.equal(r.quellen[0].ereignisdatum,null);
    assert(!JSON.stringify(r).includes("Darf nicht als ganze Liste"));
  });
  await test("Ueberweisung erhaelt false und Rechtsvorbehalt; true bleibt unterscheidbar", async () => {
    const a = (await read()).fakten[1].formulierungen.ereignis;
    assert(a.includes('ohne Federführung; Überweisungsart: "gemäß § 96 Geschäftsordnung BT"'));
    payload.ueberweisung[0].federfuehrung = true;
    assert((await read()).fakten[1].formulierungen.ereignis.includes("mit Federführung"));
  });
  await test("Fehlende oder scheinbare Federfuehrung ergibt keinen Sachbeleg", async () => {
    for (const v of [null,"false",undefined,0]) {
      payload.ueberweisung[0].federfuehrung = v;
      await assert.rejects(read,/federfuehrung/);
    }
  });
  await test("Dokumenttyp und Titel ersetzen keine Beschlussfassung", async () => {
    delete payload.beschlussfassung; delete payload.ueberweisung;
    payload.titel = "Beschlussempfehlung zur Annahme";
    const r = await read(); assert.equal(r.fakten.length,0); assert.equal(r.trustedFreigaben.length,0);
  });
  await test("Ablehnung bleibt Ablehnung; mehrere Vorlagen bleiben getrennt", async () => {
    payload.beschlussfassung.push({ beschlusstenor:"Ablehnung", dokumentnummer:"21/991" });
    const r = await read();
    assert.equal(r.fakten[1].gegenstand,"21/991");
    assert(r.fakten[1].formulierungen.ereignis.includes('"Ablehnung" zur Vorlage "21/991"'));
    assert(!r.fakten[0].formulierungen.ereignis.includes("21/991"));
  });
  await test("Ohne Vorlagennummer keine Gleichsetzung von Vorgangstitel und Beschlussziel", async () => {
    delete payload.beschlussfassung[0].dokumentnummer;
    const f = (await read()).fakten[0]; assert.equal(f.gegenstand,null);
    assert(f.formulierungen.ereignis.includes("ohne gesonderte Vorlagennummer"));
  });
  await test("Fortsetzung und Nachtrag bleiben in der Aussage sichtbar", async () => {
    payload.fortsetzung = true; payload.nachtrag = true;
    assert((await read()).fakten[0].formulierungen.ereignis.includes("(Fortsetzung, Nachtrag)"));
  });
  await test("Bundesrat wird nicht zum Bundestag", async () => {
    payload.zuordnung = "BR"; payload.fundstelle.herausgeber = "BR";
    const f = (await read()).fakten[0]; assert.equal(f.akteur,"BR");
    assert(f.formulierungen.ereignis.includes("beim Bundesrat"));
  });
  await test("Fremde Kennung, Fundstelle und widerspruechliches Dokumentdatum scheitern", async () => {
    for (const patch of [{ id:"99002" },{ vorgang_id:"" },{ zuordnung:"LT" },
      { datum:"2026-09-17" },{ dokumentart:"Drucksache" }]) {
      payload = { ...copy(basis),...patch }; await assert.rejects(read,/dip-vorgangsfakten/);
    }
  });
  await test("Unbekannte Sachfelder und lange Bedingungen werden nicht still weggelassen", async () => {
    payload.beschlussfassung[0].neue_bedingung = "Nur nach Genehmigung";
    await assert.rejects(read,/unbekanntes-sachfeld/);
    payload = copy(basis); payload.beschlussfassung[0].beschlusstenor = "x".repeat(2401);
    await assert.rejects(read,/text/);
    payload = copy(basis); payload.ueberweisung[0].neue_bedingung = "Vorbehalt";
    await assert.rejects(read,/unbekanntes-sachfeld/);
  });
  await test("Leere Arrayplaetze und falsche Listen werden abgelehnt", async () => {
    payload.beschlussfassung = new Array(1); await assert.rejects(read,/beschluesse/);
    payload = copy(basis); payload.ueberweisung = {}; await assert.rejects(read,/ueberweisungen/);
  });
  await test("URL, Auswahl und Datum werden vor einem unzulaessigen Abruf verweigert", async () => {
    for (const ids of [["https://fremd.example"],["../1"],["99001","99001"],[],new Array(1),Array(13).fill("1")])
      await assert.rejects(() => lese({ positionIds:ids,tag }),/dip-vorgangsfakten/);
    await assert.rejects(() => lese({ positionIds,tag:"2026-02-30" }),/datum/);
    assert.equal(calls.length,0);
    payload.fundstelle.pdf_url = "https://dserver.bundestag.de.fremd.example/a.pdf";
    await assert.rejects(read,/fundstellen-url/);
  });
  await test("HTTP Fehler, fremdes Antwortformat und grosse Antwort geben keinen Teilbeleg", async () => {
    for (const response of [new Response("{}",{ status:503 }), new Response("{}"),
      new Response("x".repeat(128001),{ headers:{"content-type":"application/json"} })]) {
      transport = () => response; await assert.rejects(read,/dip-vorgangsfakten/);
    }
  });
  await test("Transportausnahme verraet weder Schluessel noch fremden Fehlertext", async () => {
    transport = () => { throw new Error("Request offline-test-key url secret"); };
    await assert.rejects(read,{ message:"dip-vorgangsfakten-abruf-ungueltig" });
  });
  await test("Fakten tragen den ganzen unabhaengigen Kontext und echte typisierte Belegstellen", async () => {
    payload.abstract = "Bedingung im Kontext unverändert";
    const r = await read();
    const q = r.quellen[0]; assert(q.auszug.includes(payload.abstract));
    assert.equal(q.belegart,"amtliche-strukturierte-daten");
    for (const f of r.fakten) {
      const s = f.stelle, zeile = JSON.parse(q.auszug.slice(s.von,s.bis));
      assert(zeile.beschlusstenor || zeile.ausschuss);
      assert.equal(s.kontextBis,q.auszug.length);
    }
  });
  await test("Echter Fakteneingang formuliert ueber bestehenden Plan und besteht Dateiruecklesung", async () => {
    const r = await read(), f = r.fakten[0];
    const input = { ...r,profile:{ id:"synthetisch" },tag,
      feldvertrag:[{ pfad:"/ereignis",zweck:"ereignis",vorgangId:f.vorgangId }] };
    const gebunden = binde(input);
    const plan = { version:1,basisHash:gebunden.basisHash,
      felder:[{ pfad:"/ereignis",faktId:f.id,zweck:"ereignis" }] };
    const out = gebunden.formuliere(plan), dir = await fs.mkdtemp(path.join(os.tmpdir(),"dip-fakten-"));
    try {
      const file = path.join(dir,"beleg.json"); await fs.writeFile(file,JSON.stringify(out));
      const saved = JSON.parse(await fs.readFile(file,"utf8"));
      assert.equal(gebunden.pruefe(plan,saved).gebunden,true);
      saved.felder[0].text += " Der Zuschuss wird ausgezahlt.";
      assert.equal(gebunden.pruefe(plan,saved).gebunden,false);
      assert.throws(() => gebunden.formuliere({ ...plan,felder:[{ ...plan.felder[0],zweck:"option" }] }));
    } finally { await fs.rm(dir,{ recursive:true,force:true }); }
  });
  console.log(`${passed}/${passed} DIP Fakteneingangsgruppen bestanden; produktive Fachabnahme bleibt offen.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.DIP_API_KEY;
  else process.env.DIP_API_KEY = originalKey;
});
