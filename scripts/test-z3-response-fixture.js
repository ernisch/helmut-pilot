"use strict";
// New loopback-only fixture seam; no production credentials, provider or DB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const https = require("node:https");
const { spawnSync } = require("node:child_process");
const P = require("./fixtures/z3-plattform");
assert(require.cache[require.resolve("./lokaler-netzschutz")], "Use scripts/lokal.js");

function request(service, input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(input);
    const req = https.request(service.url + "/openai/v1/responses", {
      method: "POST", ca: fs.readFileSync(service.caPfad),
      headers: { "api-key": "local-synthetic-fixture-only", "content-type": "application/json" }
    }, res => {
      let text = "";
      res.on("data", data => { text += data; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error("local-fixture-timeout")));
    req.on("error", reject); req.end(body);
  });
}

function nativeSchemaCase() {
  const path=require("node:path"),os=require("node:os"),Z=require("./skalierung-z3-realistiklauf");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"helmut-native-schema-contract-"));
  try {
    const native=path.join(root,"native"),legacy=path.join(root,"legacy");fs.mkdirSync(native);fs.mkdirSync(legacy);
    const raw=Z.baueLokalesSchema(native,{nativeVector:true}),old=Z.baueLokalesSchema(legacy);
    assert.equal(fs.readFileSync(raw.schemaDatei,"utf8"),fs.readFileSync(path.join(__dirname,"../supabase/schema.sql"),"utf8"));
    assert(fs.readFileSync(raw.schemaDatei,"utf8").includes("create extension if not exists vector;"));
    assert(fs.readFileSync(raw.schemaDatei,"utf8").includes("<=>"));
    assert(!fs.readFileSync(old.schemaDatei,"utf8").includes("ko.embedding <=> query_embedding"));
    assert(!/match_knowledge_objects|where false/i.test(Z.VORBEREITUNG_NATIVE_SQL));
    assert(/where false/i.test(Z.VORBEREITUNG_SQL));
    assert.throws(()=>Z.baueLokalesSchema(root,{nativeVector:"true"}),/options-invalid/);
    for(const migration of raw.migrationen)
      assert.equal(fs.readFileSync(migration,"utf8"),fs.readFileSync(path.join(__dirname,"../supabase/migrations",path.basename(migration)),"utf8"));
    console.log("PASS native vector schema and SQL preserved; historical local adaptation unchanged");
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}

(async () => {
  nativeSchemaCase();
  if(process.argv.includes("--native-schema-only"))return;
  const bootstrap = spawnSync(process.execPath, ["-e", `
    const assert=require('node:assert/strict'), cp=require('node:child_process');
    let calls=0; cp.execFileSync=()=>{calls++;throw Error('unexpected-process');};
    const b=require('./scripts/skalierung-z3-realistiklauf');
    assert.equal(calls,0); assert.equal(typeof b.baueLokalesSchema,'function');
    assert.equal(typeof b.VORBEREITUNG_SQL,'string'); assert.equal(typeof b.NACHBEREITUNG_SQL,'string');
    process.stdout.write('bootstrap-import-safe');
  `], { cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8", timeout: 3000 });
  assert.equal(bootstrap.status, 0); assert.equal(bootstrap.stdout, "bootstrap-import-safe");
  assert.throws(() => P.starteKiEndpunkt({ responseForRequest: "not-code" }), /response-factory-invalid/);
  const schema = { type: "object", properties: { synthetic: { type: "boolean" } }, required: ["synthetic"] };
  let seen;
  const service = await P.starteKiEndpunkt({ latenzMs: 0, latenzStreuungMs: 0, hoechstzahlAufrufe: 3,
    responseForRequest(input, givenSchema) {
      seen = givenSchema;
      if (input.bad === true) throw new Error("DO_NOT_EXPORT_SENTINEL");
      if (input.missing === true) return undefined;
      return { synthetic: true, reference: input.reference };
    } });
  try {
    const first = await request(service, { reference: "public-fixture", text: { format: { schema } } });
    assert.equal(first.status, 200); assert.deepEqual(seen, schema);
    assert.deepEqual(JSON.parse(first.body.output_text), { synthetic: true, reference: "public-fixture" });
    for (const input of [{ bad: true }, { missing: true }]) {
      const result = await request(service, input);
      assert.equal(result.status, 422); assert(!JSON.stringify(result.body).includes("SENTINEL"));
    }
    assert.equal(service.bericht().erfolgreich, 1);
    assert.equal(service.bericht().fehler, 2);
    console.log("PASS safe bootstrap import, local schema response hook and closed failure (4 cases)");
  } finally { await service.stoppe(); }
})().catch(() => { console.error("FAIL local-synthetic-response-fixture"); process.exitCode = 1; });
