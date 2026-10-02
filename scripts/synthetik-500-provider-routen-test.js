"use strict";

const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const R = require("../lib/helmut/synthetik-500-provider-routen");
const C = require("./synthetik-500-provider-routen");
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log("PASS " + name); };
const fixture = () => R.REQUIRED.map(p => ({ path: p, bytes: Buffer.from("// fictional offline source: " + p + "\n") }));
const declaration = inventory => ({ version: R.INPUT_VERSION, sourceGraphHash: inventory.source.sourceGraphHash,
  paidRoutes: structuredClone(inventory.paidRoutes) });
const selected = (d, id) => d.paidRoutes.find(r => r.id === id);

function main() {
  const originalFetch = global.fetch;
  let sends = 0;
  global.fetch = () => { sends++; throw new Error("offline-only"); };
  try {
    test("Ungebundene Provider/Tarife und alle Gates bleiben offen/rot", () => {
      const p = R.vorbereite(fixture());
      A.equal(p.actualProviderAccount, null); A.equal(p.enforcementProof, null);
      A.ok(p.paidRoutes.every(r => r.disposition === "unbekannt" && r.model === null && r.deploymentId === null && r.priceContract === null));
      A.equal(p.status.wholeRunMaximumCostMicroUsd, null); A.equal(p.status.executionReady, false);
      A.equal(p.status.completePaidRouteCoverage, false); A.equal(p.localFeatureVectors.paid, false);
    });
    test("Zusaetzlicher echter Sender wird gehasht und kann alte Inventur nicht passieren", () => {
      const files = fixture(), p = R.vorbereite(files);
      const changed = [...files, { path: "scripts/fictional-new-provider.js", bytes: Buffer.from("fetch('/responses', {method:'POST'})") }];
      const q = R.vorbereite(changed);
      A.notEqual(q.source.sourceGraphHash, p.source.sourceGraphHash);
      A.ok(q.source.matches.some(x => x.path === "scripts/fictional-new-provider.js"));
      A.throws(() => R.pruefeInventar(p, changed), /deklarationen-bindung|inventar-drift/);
      A.throws(() => R.vorbereite(changed, declaration(p)), /deklarationen-bindung/);
      A.equal(q.status.completePaidRouteCoverage, false);
    });
    test("Fehlende/duplizierte Routen und JSON-Typtricks stoppen", () => {
      const files = fixture(), p = R.vorbereite(files);
      for (const mutate of [d => d.paidRoutes.pop(), d => { d.paidRoutes[1] = d.paidRoutes[0]; },
        d => { d.paidRoutes[0].id = [d.paidRoutes[0].id]; }, d => { d.paidRoutes[0].runtimeEnforcement = true; },
        d => { d.paidRoutes[0].admittedRequestIds = "a".repeat(64); }, d => { d.sourceGraphHash = [d.sourceGraphHash]; }]) {
        const d = declaration(p); mutate(d);
        A.throws(() => R.vorbereite(files, d), /synthetik500-routen-/);
      }
    });
    test("Echte Textrequest-Deklaration erteilt keine R-/Slot-/Laufzeitfreigabe", () => {
      const files = fixture(), d = declaration(R.vorbereite(files)), r = selected(d, "azure-responses");
      Object.assign(r, { disposition: "aufgenommen", model: "gpt-5-mini", deploymentId: "fictional-mini",
        priceContract: "existing-conservative-text", admittedRequestIds: [R.hash({ fictionalActualBody: 1 })] });
      const p = R.vorbereite(files, d);
      A.equal(p.status.runtimeEnforcement, false); A.equal(p.status.paidGo, false);
      A.equal(p.status.budgetGo, false); A.equal(p.enforcementProof, null);
      A.ok(p.remainingGuards.includes("confirmed-D-to-R-receipt"));
      A.ok(p.remainingGuards.includes("central-slot-install-remove-CAS-and-no-inflight-call-race"));
    });
    test("Embeddingaufnahme ohne zentralen Tarifvertrag wird abgewiesen", () => {
      const files = fixture(), p = R.vorbereite(files);
      for (const id of ["azure-embedding-backfill", "injected-embedding-shadow", "azure-embedding-testlauf", "compatible-embedding-testlauf", "azure-responses-z3b"]) {
        const d = declaration(p), r = selected(d, id);
        Object.assign(r, { disposition: "aufgenommen", provider: r.provider || "fictional-provider", model: "gpt-5-mini",
          admittedRequestIds: [R.hash({ fictionalBatch: id })], priceContract: "existing-conservative-text" });
        A.throws(() => R.vorbereite(files, d), /tarif-bindung|aufnahme-central-fehlt/);
      }
    });
    test("Fallback gpt-4.1 darf nicht als reservierter Mini-Erstrequest gelten", () => {
      const files = fixture(), p = R.vorbereite(files), d = declaration(p), r = selected(d, "openai-fallback");
      Object.assign(r, { disposition: "aufgenommen", model: "gpt-5-mini", priceContract: "existing-conservative-text",
        admittedRequestIds: ["a".repeat(64)] });
      A.throws(() => R.vorbereite(files, d), /fallback-modell/);
      r.model = "gpt-4.1";
      A.throws(() => R.vorbereite(files, d), /tarif-bindung/);
    });
    test("Alle belegten Ausschlussdeklarationen sind weiter keine wirksamen Gates", () => {
      const files = fixture(), d = declaration(R.vorbereite(files));
      for (const r of d.paidRoutes) Object.assign(r, { disposition: "ausgeschlossen",
        exclusionEvidence: { reference: "/fictional/offline-exclusion.json", sha256: R.hash({ route: r.id }) } });
      const p = R.vorbereite(files, d);
      A.equal(p.status.declarationsComplete, true); A.equal(p.status.completePaidRouteCoverage, false);
      A.equal(p.status.executionReady, false); A.equal(p.status.runtimeEnforcement, false);
      selected(d, "azure-embedding-backfill").exclusionEvidence = null;
      A.throws(() => R.vorbereite(files, d), /ausschluss-beleg/);
    });
    test("Herkunftsdrift und gefaelschter gruener Ergebnisstatus stoppen", () => {
      const files = fixture(), p = R.vorbereite(files);
      const changed = fixture(); changed[0].bytes = Buffer.from("// changed scope\n");
      A.throws(() => R.pruefeInventar(p, changed), /deklarationen-bindung|inventar-drift/);
      const fake = structuredClone(p); fake.status.executionReady = true;
      A.throws(() => R.pruefeInventar(fake, files), /inventar-drift/);
      A.throws(() => R.sourceInventory(files.slice(1)), /source-unvollstaendig/);
    });
    test("CLI ist ein importierbarer Reader ohne Start und weist Symlinks ab", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-routen-fixture-"));
      try {
        for (const dir of ["lib", "scripts", "api", ".github/workflows"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
        for (const name of ["server.js", "vercel.json", "package.json"]) fs.writeFileSync(path.join(root, name), "{}");
        fs.symlinkSync(path.join(root, "server.js"), path.join(root, "lib", "fictional-symlink.js"));
        A.throws(() => C.leseQuellen(root), /source-symlink/);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
    A.equal(sends, 0);
    console.log(`${pass}/${pass} neue Offline-Routenfaelle; 0 Provideraufrufe`);
  } finally { global.fetch = originalFetch; }
}
if (require.main === module) main();
module.exports = { main };
