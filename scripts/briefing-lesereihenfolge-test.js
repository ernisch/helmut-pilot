"use strict";
// Echte Storage-Leser gegen lokalen HTTP-Transport: Ordnung VOR dem LIMIT
// und fachlich unveraenderte Quellen mit gleichem Publikationszeitpunkt.
const A = require("node:assert/strict"), http = require("node:http");
const { once } = require("node:events"), S = require("../lib/helmut/storage");
const kos = [{ id: "ko-c", updated_at: "2026-09-27T07:00:00Z" },
  { id: "ko-a", updated_at: "2026-09-27T07:00:00Z" }, { id: "ko-b", updated_at: "2026-09-27T07:00:00Z" }];
const docs = [{ id: "rd-c", published_at: "2026-09-27T08:00:00Z" },
  { id: "rd-b", published_at: "2026-09-27T07:00:00Z" }, { id: "rd-a", published_at: "2026-09-27T07:00:00Z" }]
  .map(d => ({ ...d, title: "Belegter Originaltitel", summary: "Unveraenderter vollstaendiger Quellentext.", url: "https://example.org/" + d.id }));
(async () => {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  let reads = 0, writes = 0;
  const server = http.createServer((req, res) => {
    reads++; if (req.method !== "GET") writes++;
    const u = new URL(req.url, "http://127.0.0.1"), order = u.searchParams.get("order");
    const input = (u.pathname.endsWith("/knowledge_objects") ? kos : docs).slice();
    if (Math.floor((reads - 1) / 2) % 2 === 0) input.reverse();
    let out;
    if (u.pathname.endsWith("/knowledge_objects")) {
      A.equal(order, "updated_at.desc,id.asc");
      out = input.sort((a,b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
        .slice(0, Number(u.searchParams.get("limit")));
    } else {
      A.equal(order, "raw_document_id.asc");
      out = input.sort((a,b) => a.id.localeCompare(b.id)).map(d => ({ raw_documents: d }));
    }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE"];
  const before = Object.fromEntries(names.map(n => [n,process.env[n]]));
  Object.assign(process.env, { SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
    SUPABASE_SERVICE_ROLE_KEY: "rein-lokaler-testwert", HELMUT_V3_STORE: "1" });
  try {
    for (let i=0;i<2;i++) {
      A.deepEqual((await S.listKnowledgeObjects({limit:2})).map(k=>k.id), ["ko-a","ko-b"]);
      const quellen = await S.getSourcesForVorgang("vg-beleg");
      A.deepEqual(quellen.map(q=>q.id), ["rd-c","rd-a","rd-b"]);
      A(quellen.every(q=>q.summary === docs[0].summary));
    }
    A.equal(reads,4); A.equal(writes,0);
    console.log("PASS: gleiche Updatezeiten vor LIMIT stabil; neueste Quelle zuerst und gleiche Quellzeiten stabil; 4 Reads, 0 Writes/Modelle.");
  } finally {
    for(const n of names) if(before[n]===undefined) delete process.env[n]; else process.env[n]=before[n];
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
