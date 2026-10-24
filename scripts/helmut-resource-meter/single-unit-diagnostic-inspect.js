#!/usr/bin/env node
"use strict";

// Preparation only: no database, engine, subprocess or filesystem writes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { inspectPinnedPacket } = require("../../lib/helmut/synthetik-500-unit-diagnostic-contract");
const TERMINAL = path.resolve(__dirname, "../../docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json");
const USAGE = "Preparation only (execution blocked): --inspect --packet ABS --install-pins ABS --install-sha256 HEX [--diagnostic-nonce HEX32] [--terminal ABS]\n";
const fail = () => { throw Error("unit-diagnostic-inspection-rejected"); };
const need = value => { if (!value) fail(); };
const FIELDS = ["dev", "ino", "size", "mode", "nlink", "uid", "gid", "mtimeNs", "ctimeNs"];
const same = (a, b) => FIELDS.every(k => a[k] === b[k]);

function checkPath(file) {
  need(typeof file === "string" && path.isAbsolute(file) && path.normalize(file) === file && !file.includes("\0"));
  const parts = file.split(path.sep).filter(Boolean);
  let current = path.parse(file).root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const s = fs.lstatSync(current, { bigint: true });
    need(!s.isSymbolicLink() && (i === parts.length - 1 || s.isDirectory()));
  }
}

function readPinnedFile(file, limit, privateInput) {
  checkPath(file);
  const named = fs.lstatSync(file, { bigint: true });
  need(named.isFile() && named.nlink === 1n && named.size > 0n && named.size <= BigInt(limit));
  if (privateInput) need(named.uid === BigInt(process.getuid()) && (named.mode & 0o077n) === 0n);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    need(before.isFile() && same(named, before));
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      need(count > 0); offset += count;
    }
    const extra = Buffer.alloc(1);
    need(fs.readSync(fd, extra, 0, 1, offset) === 0);
    checkPath(file);
    const after = fs.fstatSync(fd, { bigint: true });
    need(same(before, after) && same(after, fs.lstatSync(file, { bigint: true })));
    return bytes;
  } finally { fs.closeSync(fd); }
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const values = new Map();
  const options = new Set(["--packet", "--install-pins", "--install-sha256", "--diagnostic-nonce", "--terminal"]);
  let inspect = false;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--inspect") { need(!inspect); inspect = true; continue; }
    need(options.has(key) && !values.has(key) && i + 1 < argv.length);
    const value = argv[++i];
    need(typeof value === "string" && value.length > 0 && !value.startsWith("--"));
    values.set(key, value);
  }
  need(inspect && ["--packet", "--install-pins", "--install-sha256"].every(k => values.has(k)));
  need(/^[a-f0-9]{64}$/.test(values.get("--install-sha256")));
  if (values.has("--diagnostic-nonce")) need(/^[a-f0-9]{32}$/.test(values.get("--diagnostic-nonce")));
  return values;
}

function main(argv = process.argv.slice(2)) {
  try {
    const values = parse(argv);
    if (values.help) { process.stdout.write(USAGE); return 0; }
    const packetPath = values.get("--packet"), installPath = values.get("--install-pins");
    const packetBytes = readPinnedFile(packetPath, 16 * 1024 * 1024, true);
    const installPinsBytes = readPinnedFile(installPath, 16 * 1024, true);
    const terminalBytes = readPinnedFile(values.get("--terminal") || TERMINAL, 3336, false);
    const result = inspectPinnedPacket({ packetBytes, packetPath, installPinsBytes,
      installPin: { path: installPath, bytes: installPinsBytes.length, sha256: values.get("--install-sha256") },
      terminalBytes, diagnosticNonce: values.get("--diagnostic-nonce") || crypto.randomBytes(16).toString("hex"),
      preparedAtUTC: new Date().toISOString() });
    process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (_) {
    // Even JSON parser errors can contain input bytes. Never print a caught error.
    process.stderr.write("unit-diagnostic-inspection-rejected\n");
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
