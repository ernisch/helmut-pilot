"use strict";

// Verschluesselter Transport einer temporaeren Betreiber-Leseprobe.
// Die Herkunft wird separat am exakten Actions-Job/Commit geprueft: eine
// Verschluesselung mit oeffentlichem Schluessel ist keine Absendersignatur.
const C = require("node:crypto"), Z = require("node:zlib"), F = require("node:fs");
const MAX_BYTES = 8 * 1024 * 1024;
function fordere(ok) { if (!ok) throw new Error("privater-nachweis-transport-ungueltig"); }
const sha = b => C.createHash("sha256").update(b).digest("hex");
function publicKey(value) {
  fordere(typeof value === "string" && value.length < 1500 && /^[A-Za-z0-9+/]+={0,2}$/.test(value));
  const der = Buffer.from(value, "base64");
  fordere(der.toString("base64") === value);
  const key = C.createPublicKey({ key: der, format: "der", type: "spki" });
  fordere(key.asymmetricKeyType === "rsa" && key.asymmetricKeyDetails.modulusLength === 3072);
  return { key, fingerprint: sha(der) };
}
function kontext(ctx) {
  fordere(ctx && /^\d{5,20}$/.test(ctx.runId || "") && /^[a-f0-9]{40}$/.test(ctx.commit || "")
    && /^\d{4}-\d{2}-\d{2}$/.test(ctx.tag || "") && Number.isFinite(Date.parse(ctx.tag))
    && new Date(ctx.tag).toISOString().slice(0, 10) === ctx.tag
    && Number.isSafeInteger(ctx.abPosition) && ctx.abPosition >= 1
    && Number.isSafeInteger(ctx.anzahl) && ctx.anzahl >= 1 && ctx.anzahl <= 25
    && ctx.abPosition + ctx.anzahl - 1 <= 500);
  return { runId: ctx.runId, commit: ctx.commit, tag: ctx.tag, abPosition: ctx.abPosition, anzahl: ctx.anzahl };
}
function verschluesseln(payload, empfaenger, context) {
  const p = publicKey(empfaenger), ctx = kontext(context);
  const raw = Buffer.from(JSON.stringify(payload));
  fordere(raw.length <= MAX_BYTES);
  const key = C.randomBytes(32), nonce = C.randomBytes(12);
  const meta = { version: 1, verfahren: "RSA-OAEP-SHA256/AES-256-GCM/gzip", empfaenger: p.fingerprint, ...ctx };
  const cipher = C.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(meta)));
  const data = Buffer.concat([cipher.update(Z.gzipSync(raw)), cipher.final()]);
  const wrapped = C.publicEncrypt({ key: p.key, oaepHash: "sha256", padding: C.constants.RSA_PKCS1_OAEP_PADDING }, key);
  key.fill(0);
  return { meta, schluessel: wrapped.toString("base64"), nonce: nonce.toString("base64"),
    authentisierung: cipher.getAuthTag().toString("base64"),
    // Kurze Zeilen verhindern das Abschneiden langer Logzeilen.
    daten: data.toString("base64").match(/.{1,4096}/g) || [] };
}
function entschluesseln(envelope, privatePem, expected) {
  const privateKey = C.createPrivateKey(privatePem), pub = C.createPublicKey(privateKey);
  const empfaenger = pub.export({ format: "der", type: "spki" }).toString("base64");
  const fingerprint = publicKey(empfaenger).fingerprint;
  const meta = { version: 1, verfahren: "RSA-OAEP-SHA256/AES-256-GCM/gzip", empfaenger: fingerprint, ...kontext(expected) };
  fordere(JSON.stringify(envelope?.meta) === JSON.stringify(meta));
  function bytes(value, length) {
    fordere(typeof value === "string" && value.length <= MAX_BYTES * 2 && /^[A-Za-z0-9+/]+={0,2}$/.test(value));
    const b = Buffer.from(value, "base64");
    fordere(b.toString("base64") === value && (!length || b.length === length)); return b;
  }
  fordere(Array.isArray(envelope.daten) && envelope.daten.length > 0 && envelope.daten.length <= 3000
    && envelope.daten.every(s => typeof s === "string" && s.length > 0 && s.length <= 4096));
  const key = C.privateDecrypt({ key: privateKey, oaepHash: "sha256", padding: C.constants.RSA_PKCS1_OAEP_PADDING }, bytes(envelope.schluessel, 384));
  fordere(key.length === 32);
  const cipher = C.createDecipheriv("aes-256-gcm", key, bytes(envelope.nonce, 12));
  cipher.setAAD(Buffer.from(JSON.stringify(meta))); cipher.setAuthTag(bytes(envelope.authentisierung, 16));
  const packed = Buffer.concat([cipher.update(bytes(envelope.daten.join(""))), cipher.final()]);
  key.fill(0);
  return JSON.parse(Z.gunzipSync(packed, { maxOutputLength: MAX_BYTES }).toString("utf8"));
}
if (require.main === module) {
  try {
    const [command, keyFile, inputFile, outputFile, expectedJson] = process.argv.slice(2);
    if (command === "schluessel" && keyFile && !inputFile) {
      const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
      F.writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }), { flag: "wx", mode: 0o600 });
      const empfaenger = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
      console.log(JSON.stringify({ empfaenger, fingerprint: publicKey(empfaenger).fingerprint }));
    } else if (command === "entschluesseln" && keyFile && inputFile && outputFile && expectedJson) {
      const report = JSON.parse(F.readFileSync(inputFile, "utf8"));
      const plain = entschluesseln(report.envelope, F.readFileSync(keyFile), JSON.parse(expectedJson));
      F.writeFileSync(outputFile, JSON.stringify(plain, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ ok: true, anzahl: plain.mandate.length, klartextImLog: false }));
    } else throw new Error("ungueltiger-aufruf");
  } catch { console.error("privater-nachweis-transport-fehlgeschlagen"); process.exitCode = 1; }
}
module.exports = { publicKey, kontext, verschluesseln, entschluesseln, MAX_BYTES };
