"use strict";
// Closed diagnostic categories and bounded private first error. No raw stdout.
const fs = require("node:fs"), path = require("node:path");
const stages = new Set(["entry", "baseline", "config", "originals", "qualified", "original-upacket",
  "calendar", "native-inputs", "snapshot", "native-manifest", "activation", "builder", "output", "complete"]);
function create(mainFile, bindingFile) {
  if (process.env.HELMUT_W15_MATERIALS_DIAGNOSTIC !== "1") return { enter() {}, record() {} };
  const context = process.env.HELMUT_W15_MOCK_CONTEXT;
  if (typeof context !== "string" || !path.isAbsolute(context) || context.split(path.sep).includes(".."))
    throw Error("MATERIALS_DIAGNOSTIC_CONTEXT_REJECTED");
  const root = path.dirname(context), s = fs.lstatSync(root);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 511) !== 448)
    throw Error("MATERIALS_DIAGNOSTIC_CONTEXT_REJECTED");
  let stage = "entry", recorded = false;
  function write(name, value) {
    const raw = Buffer.from(JSON.stringify(value));
    if (raw.length > 65536) throw Error("MATERIALS_DIAGNOSTIC_RECORD_BOUND");
    const fd = fs.openSync(path.join(root, name), fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 384);
    try { fs.fchmodSync(fd, 384); fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  function record(error) {
    if (recorded) return;
    recorded = true;
    let kind = "unknown", category = "MATERIALS_ENTRY_REJECTED";
    if (error?.name === "AssertionError") kind = "assertion";
    else if (error?.name === "TypeError") kind = "type";
    else if (["EACCES", "EPERM", "ENOENT", "EEXIST", "ENOTDIR", "ELOOP"].includes(error?.code)) kind = "filesystem";
    else if (["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(error?.code)) kind = "module";
    else if (error?.message === "w15-isolated-sql-failed") kind = "sql";
    const stack = typeof error?.stack === "string" ? error.stack : "";
    for (const line of stack.split("\n")) {
      let found = false;
      for (const [filename, prefix] of [[bindingFile, "BINDING"], [mainFile, "MAIN"]]) {
        const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = line.match(new RegExp("^\\s+at .*?(?:\\(| )" + escaped + ":([0-9]+):[0-9]+\\)?$"));
        const number = match ? Number(match[1]) : 0;
        if (number >= 1 && number <= 1024) {
          category = "MATERIALS_" + prefix + "_CHECK_" + String(number).padStart(3, "0"); found = true; break;
        }
      }
      if (found) break;
    }
    const safe = { schema: "helmut-w15-materials-first-failure/1", category, kind, stage };
    // Private text stays bounded and never enters the safe receipt or console.
    write("MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json", safe);
    write("MATERIALS_FIRST_FAILURE.SAFE.json", { status: "FAIL", safe,
      reason: String(error?.message ?? "UNKNOWN").slice(0, 2048), stack: stack.slice(0, 4096) });
  }
  process.on("uncaughtExceptionMonitor", error => { try { record(error); } catch {} });
  return { enter(value) { if (!stages.has(value)) throw Error("MATERIALS_DIAGNOSTIC_STAGE_REJECTED"); stage = value; }, record };
}
module.exports = { create };
