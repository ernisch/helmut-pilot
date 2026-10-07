"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), F = require("node:fs"), P = require("node:path"), O = require("node:os");
const X = require("./blocker2-cipher-parts"), T = require("./privater-nachweis-transport");
const context = { runId: "37681748370", commit: "a".repeat(40), tag: "2026-10-07" };
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const recipient = T.publicKey(publicKey).fingerprint;
const entries = new Map(X.NAMES.map(name => {
  const position = name === "manifest.json" ? 1 : Number(name.slice(0, 4));
  const envelope = T.verschluesseln({ position, privateSentinel: "NONPUBLIC_B2_CONTENT" }, publicKey,
    { ...context, abPosition: position, anzahl: 1 });
  return [name, Buffer.from(JSON.stringify(envelope) + "\n")];
}));
const sha = x => C.createHash("sha256").update(x).digest("hex");
const unitLimit = entries.get("0001.json").length * 20;
const groups = X.plane(entries, context, { recipient, maxPart: unitLimit });
A(groups.length > 1 && groups.length <= 32);
A.deepEqual(groups.flat(), X.NAMES);
for (const group of groups) A(group.reduce((n, name) => n + entries.get(name).length, 0) <= unitLimit);
for (const name of groups.flat()) {
  const raw = entries.get(name); A(!raw.includes("NONPUBLIC_B2_CONTENT"));
  const position = name === "manifest.json" ? 1 : Number(name.slice(0, 4));
  A.deepEqual(T.entschluesseln(JSON.parse(raw), pair.privateKey.export({ format: "pem", type: "pkcs8" }), { ...context, abPosition: position, anzahl: 1 }),
    { position, privateSentinel: "NONPUBLIC_B2_CONTENT" });
}
for (const mutate of [e => e.delete("0500.json"), e => e.set("../escape.json", e.get("0001.json")),
  e => { const x = JSON.parse(e.get("0001.json")); x.meta.empfaenger = "f".repeat(64); e.set("0001.json", Buffer.from(JSON.stringify(x))); },
  e => { const x = JSON.parse(e.get("0001.json")); x.meta.abPosition = 2; e.set("0001.json", Buffer.from(JSON.stringify(x))); },
  e => { const x = JSON.parse(e.get("0001.json")); x.secret = "forbidden"; e.set("0001.json", Buffer.from(JSON.stringify(x))); },
  e => { const x = JSON.parse(e.get("0001.json")); x.nonce = "invalid"; e.set("0001.json", Buffer.from(JSON.stringify(x))); }]) {
  const e = new Map(entries); mutate(e); A.throws(() => X.plane(e, context, { recipient }));
}
for (const change of [{ runId: "37681748371" }, { commit: "b".repeat(40) }, { tag: "2026-10-08" }])
  A.throws(() => X.plane(entries, { ...context, ...change }, { recipient }));
A.throws(() => X.plane(entries, context, { recipient, maxPart: 2 }));
A.throws(() => X.plane(entries, context, { recipient, maxPart: unitLimit, maxParts: 1 }));
// Echte Produktionsgrenze mit grossen, ausschliesslich Cipher-JSON-Dateien.
const big = new Map(entries);
for (const name of ["0001.json", "0002.json", "0003.json"]) {
  const x = JSON.parse(big.get(name)), data = C.randomBytes(8 * 1024 * 1024).toString("base64");
  x.daten = data.match(/.{1,4096}/g); big.set(name, Buffer.from(JSON.stringify(x)));
}
const bounded = X.plane(big, context, { recipient }); A(bounded.length >= 3);
for (const group of bounded) A(group.reduce((n, name) => n + big.get(name).length, 0) <= 20 * 1024 * 1024);
// Kopierte Originalbytes duerfen weder normalisiert noch erneut verschluesselt werden.
const temp = F.mkdtempSync(P.join(O.tmpdir(), "b2-cipher-test-"));
try {
  const source = P.join(temp, "source"), dest = P.join(temp, "parts"); F.mkdirSync(source);
  // Hier nur transportgueltige Metadaten, kein Betreiberprivatschluessel.
  for (const [name, raw] of entries) {
    const x = JSON.parse(raw); x.meta.empfaenger = X.RECIPIENT;
    F.writeFileSync(P.join(source, name), Buffer.from(JSON.stringify(x) + "\n"));
  }
  A.equal(X.teile(source, dest, context), 1);
  for (const name of X.NAMES) A.equal(sha(F.readFileSync(P.join(dest, "01", name))), sha(F.readFileSync(P.join(source, name))));
  A.throws(() => X.teile(source, dest, context));
  F.unlinkSync(P.join(source, "0500.json"));
  A.throws(() => X.teile(source, P.join(temp, "invalid"), context)); A(!F.existsSync(P.join(temp, "invalid")));
  F.unlinkSync(P.join(source, "manifest.json"));
  const partial = P.join(temp, "partial");
  A.equal(X.teile(source, partial, context, { partial: true }), 1);
  for (const name of F.readdirSync(source)) A.equal(sha(F.readFileSync(P.join(partial, "01", name))), sha(F.readFileSync(P.join(source, name))));
  A(!F.existsSync(P.join(partial, "01", "manifest.json"))); A(!F.existsSync(P.join(partial, "01", "0500.json")));
  F.writeFileSync(P.join(source, "plaintext.txt"), "DO_NOT_UPLOAD");
  A.throws(() => X.teile(source, P.join(temp, "foreign-partial"), context, { partial: true }));
  A(!F.existsSync(P.join(temp, "foreign-partial"))); F.unlinkSync(P.join(source, "plaintext.txt"));
  F.symlinkSync(P.join(source, "0001.json"), P.join(source, "0500.json"));
  A.throws(() => X.teile(source, P.join(temp, "symlink"), context)); A(!F.existsSync(P.join(temp, "symlink")));
  A.throws(() => X.teile(source, P.join(temp, "symlink-partial"), context, { partial: true })); A(!F.existsSync(P.join(temp, "symlink-partial")));
} finally { F.rmSync(temp, { recursive: true, force: true }); }
// Recovery darf keine Productionidentitaet, Cronsecret oder Provider verwenden.
const recovery = F.readFileSync(P.join(__dirname, "../.github/workflows/blocker2-cipher-recovery.yml"), "utf8");
A.match(recovery, /workflow_dispatch: \{\}/); A.match(recovery, /actions: read/); A.match(recovery, /contents: read/);
A(!/(secrets\.|HELMUT_CRON_SECRET|SUPABASE|DEEPSEEK|workflow_run:|schedule:|pull_request:|push:|write)/.test(recovery));
for (const file of ["blocker2-cipher-recovery.yml", "blocker2-readonly500.yml"]) {
  const workflow = F.readFileSync(P.join(__dirname, "../.github/workflows", file), "utf8");
  A.equal((workflow.match(/uses: actions\/upload-artifact@v4/g) || []).length, 32);
  for (let i = 1; i <= 32; i++) A(workflow.includes("tmp/blocker2-cipher-parts/" + String(i).padStart(2, "0") + "/*.json"));
  A.equal((workflow.match(/compression-level: 0/g) || []).length, 32);
  A.equal((workflow.match(/retention-days: 1/g) || []).length, 32);
}
require("node:child_process").execFileSync("python3", [P.join(__dirname, "blocker2-cipher-recovery-test.py")], { stdio: "inherit" });
console.log("B2 Ciphertransport: 501 Originaldateien, Positions-/Empfaengerbindung, 20MiB-Pakete, bytegleiche Kopie, Ausschluss unvollstaendiger/uebergrosser/fremder Archive und transport-only Workflow offline geprueft.");
