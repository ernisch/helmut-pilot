"use strict";

// Echter curl gegen ausschliesslich Loopback. Ausgefuehrt werden die Download-
// und Hashzeilen der Action, mit lokalem Ziel und explizitem Synthetik-Dateipin.
// Kein Werkzeugdownload, keine Datenbank und keine echte Artikel-/Modellanfrage.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const http = require("node:http"), crypto = require("node:crypto"), { spawn } = require("node:child_process");
const action = fs.readFileSync(path.join(__dirname, "../.github/actions/w15-existing-tools/action.yml"), "utf8");
const target = "https://api.github.com/repos/PostgREST/postgrest/releases/assets/183261684";
const pin = "9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c";
const binaryPin = "870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617";
const payload = Buffer.from("Ausdruecklich synthetische CI-Transportprobe\n");
const fixturePin = crypto.createHash("sha256").update(payload).digest("hex");
const start = action.indexOf("        curl -fsSL"), end = action.indexOf("        tar -xJf", start);
assert(start >= 0 && end > start, "Download/Hash-Schritt muss eindeutig vorhanden sein");
const commands = action.slice(start, end).replace(/^ {8}/gm, "");
assert.equal(commands.split(target).length, 2);
assert.equal(commands.split(pin).length, 2);
assert(action.includes(binaryPin), "Binaerpin erhalten");
assert(commands.includes("--retry 1 --retry-delay 2 --retry-max-time 95"));
assert(commands.includes("--connect-timeout 15 --max-time 45"));
assert(!commands.includes("--retry-all-errors") && !commands.includes("--insecure"));

async function check(name, statuses, body, expectedStatus, expectedRequests) {
  let requests = 0;
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/pinned-asset");
    assert.equal(req.headers.accept, "application/octet-stream");
    const status = statuses[Math.min(requests++, statuses.length - 1)];
    res.writeHead(status, { "Content-Length": status === 200 ? body.length : 0 });
    res.end(status === 200 ? body : undefined);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-ci-download-"));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const local = "http://127.0.0.1:" + server.address().port + "/pinned-asset";
    // Nur in dieser isolierten Probe wird der echte Archivpin durch den oben
    // deklarierten Synthetikpin ersetzt; die Action bleibt unveraendert gepinnt.
    const script = "set -euo pipefail\n" + commands.replace(target, local).replace(pin, fixturePin);
    const child = spawn("bash", ["-c", script], { env: { ...process.env, RUNNER_TEMP: dir,
      NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", b => { output += b; }); child.stderr.on("data", b => { output += b; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 12000);
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject); child.once("exit", resolve);
    }).finally(() => clearTimeout(timer));
    assert.equal(code, expectedStatus, name + ": " + output);
    assert.equal(requests, expectedRequests, name + ": Abrufzahl");
    assert.equal(output.includes(": OK"), code === 0, name + ": keine falsche Hashfreigabe");
    if (code === 0) assert.deepEqual(fs.readFileSync(path.join(dir, "w15-mock-postgrest.tar.xz")), payload);
    console.log("PASS " + name);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function main() {
  await check("503, dann gueltige Datei: einmaliger Retry und Hashfreigabe", [503, 200], payload, 0, 2);
  await check("504, dann gueltige Datei: einmaliger Retry und Hashfreigabe", [504, 200], payload, 0, 2);
  await check("Dauerhaft 503: Abbruch nach genau zwei Versuchen", [503], payload, 22, 2);
  await check("Dauerhaft 504: Abbruch nach genau zwei Versuchen", [504], payload, 22, 2);
  await check("404: kein Retry", [404, 200], payload, 22, 1);
  await check("200 mit falschen Bytes: Hashfehler ohne Retry", [200], Buffer.from("falsche Testbytes"), 1, 1);
  console.log("6/6 Downloadgruppen bestanden; ausschliesslich Loopback und synthetische Dateipins.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
