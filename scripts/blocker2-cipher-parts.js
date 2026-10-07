"use strict";
// Nur bereits verschluesselte Originalbytes aufteilen. Kein Netz, Secret,
// Privatschluessel, Entschluesseln, Productionzugriff oder Fachurteil.
const A = require("node:assert/strict"), F = require("node:fs"), P = require("node:path");
const T = require("./privater-nachweis-transport");
const RECIPIENT = "8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7";
const MAX_FILE = 12 * 1024 * 1024, MAX_PART = 20 * 1024 * 1024, MAX_PARTS = 32;
const NAMES = Object.freeze(Array.from({ length: 500 }, (_, i) => String(i + 1).padStart(4, "0") + ".json").concat("manifest.json"));
const ROOT = P.join(__dirname, "..", "tmp");
function base64(value, length) {
  A(typeof value === "string" && value.length <= MAX_FILE && /^[A-Za-z0-9+/]+={0,2}$/.test(value));
  const b = Buffer.from(value, "base64"); A.equal(b.toString("base64"), value);
  if (length) A.equal(b.length, length);
}
function pruefe(raw, name, context, recipient = RECIPIENT) {
  A(raw.length > 0 && raw.length <= MAX_FILE);
  const x = JSON.parse(raw.toString("utf8"));
  A.deepEqual(Object.keys(x).sort(), ["authentisierung", "daten", "meta", "nonce", "schluessel"]);
  const position = name === "manifest.json" ? 1 : Number(name.slice(0, 4));
  A.deepEqual(x.meta, { version: 1, verfahren: "RSA-OAEP-SHA256/AES-256-GCM/gzip", empfaenger: recipient,
    ...T.kontext({ ...context, abPosition: position, anzahl: 1 }) });
  base64(x.schluessel, 384); base64(x.nonce, 12); base64(x.authentisierung, 16);
  A(Array.isArray(x.daten) && x.daten.length > 0 && x.daten.length <= 3000
    && x.daten.every(s => typeof s === "string" && s.length > 0 && s.length <= 4096));
  base64(x.daten.join(""));
}
function plane(entries, context, { recipient = RECIPIENT, maxPart = MAX_PART, maxParts = MAX_PARTS, partial = false } = {}) {
  if (partial) A(entries.size > 0 && [...entries.keys()].every(name => NAMES.includes(name)));
  else A.deepEqual([...entries.keys()].sort(), [...NAMES].sort());
  const groups = []; let current = [], bytes = 0;
  for (const name of NAMES) {
    if (!entries.has(name)) continue;
    const raw = entries.get(name); A(Buffer.isBuffer(raw)); pruefe(raw, name, context, recipient);
    A(raw.length <= maxPart);
    if (current.length && bytes + raw.length > maxPart) { groups.push(current); current = []; bytes = 0; }
    current.push(name); bytes += raw.length;
  }
  if (current.length) groups.push(current);
  A(groups.length > 0 && groups.length <= maxParts);
  return groups;
}
function teile(source, dest, context, { partial = false } = {}) {
  A(F.lstatSync(source).isDirectory()); A(!F.existsSync(dest));
  const entries = new Map();
  const names = F.readdirSync(source).sort();
  if (partial) A(names.length > 0 && names.every(name => NAMES.includes(name)));
  else A.deepEqual(names, [...NAMES].sort());
  for (const name of names) {
    const file = P.join(source, name), stat = F.lstatSync(file);
    A(stat.isFile() && stat.size <= MAX_FILE); entries.set(name, F.readFileSync(file));
  }
  // Alle vorhandenen Cipher vor dem ersten Ausgabe-Write validieren.
  // Teiltransport belegt keine Vollerfassung. Recovery bleibt streng 501.
  const groups = plane(entries, context, { partial });
  F.mkdirSync(dest, { mode: 0o700 });
  groups.forEach((names, i) => {
    const dir = P.join(dest, String(i + 1).padStart(2, "0")); F.mkdirSync(dir, { mode: 0o700 });
    for (const name of names) F.writeFileSync(P.join(dir, name), entries.get(name), { flag: "wx", mode: 0o600 });
  });
  return groups.length;
}
function start(env = process.env, recovered = false, partial = false) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot"); A.equal(env.GITHUB_REF, "refs/heads/main");
  A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch"); A.equal(env.GITHUB_RUN_ATTEMPT, "1");
  A.match(env.GITHUB_SHA || "", /^[a-f0-9]{40}$/); A.match(env.GITHUB_RUN_ID || "", /^\d{5,20}$/);
  const source = P.join(ROOT, recovered ? "blocker2-recovered-cipher" : "blocker2-readonly500");
  const firstName = partial ? F.readdirSync(source).sort()[0] : "manifest.json";
  A(NAMES.includes(firstName));
  const manifestPath = P.join(source, firstName), stat = F.lstatSync(manifestPath);
  A(stat.isFile() && stat.size <= MAX_FILE);
  const manifest = JSON.parse(F.readFileSync(manifestPath, "utf8"));
  const context = recovered
    ? { runId: "37681748370", commit: "38a0b6a9684eee24760566c6494e78ffbb4b84ce", tag: "2026-10-07" }
    : { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag: manifest.meta?.tag };
  const count = teile(source, P.join(ROOT, "blocker2-cipher-parts"), context, { partial });
  A(env.GITHUB_OUTPUT); F.appendFileSync(env.GITHUB_OUTPUT, "part_count=" + count + "\n");
  console.log(JSON.stringify({ encryptedOnly: true, envelopes: F.readdirSync(source).length,
    partialTransport: partial, parts: count, maxPartBytes: MAX_PART, all500InputAcceptance: false }));
}
if (require.main === module) {
  try {
    A(process.argv.length === 2 || (process.argv.length === 3 && ["wiederhergestellt", "teilstand"].includes(process.argv[2])));
    start(process.env, process.argv[2] === "wiederhergestellt", process.argv[2] === "teilstand");
  } catch { console.error("B2 Cipher-Paketierung gestoppt; keine Klartexte oder erneuten Abrufe."); process.exitCode = 1; }
}
module.exports = { plane, teile, pruefe, RECIPIENT, NAMES, MAX_FILE, MAX_PART, MAX_PARTS };
