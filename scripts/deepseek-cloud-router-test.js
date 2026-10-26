"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const router = require("./deepseek-cloud-router");
const dailyBudget = require("./deepseek-router-budget");
const connectivity = require("./deepseek-cloud-connectivity");

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log("PASS", name);
  } catch (error) {
    fail += 1;
    console.error("FAIL", name, error.message);
  }
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function charLength(value) {
  return Array.from(String(value || "")).length;
}

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-v2-test-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), [
    "# HELMUT AGENT CONTRACT",
    "## Verbindliche Zielgruppe: AfD ausgeschlossen", "zielgruppe",
    "## Rolle und Produktziel", "produkt",
    "## Modell und Arbeitsumgebung", "modell intro",
    "### Kompakte DeepSeek Übergabe", "uebergabe",
    "### Subagenten und Parallelisierung", "parallel",
    "### Sichtbarer Helferstatus", "NICHT_SENDEN_STATUS",
    "## Grundregel", "grundregel",
    "## Tests", "tests",
    "## Production Schutz", "production intro",
    "### Unterpunkt", "NICHT_SENDEN_PRODUCTION_DETAIL",
    "## Kritische Aktionen", "kritisch",
    "## 500er Production Nachweis", "500",
    "## Wichtigste Regel", "wichtig",
    "## Kommunikationsstil", "NICHT_SENDEN_KOMMUNIKATION",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs/START_HERE.md"), [
    "# START",
    "## 1 · Was Helmut ist", "was",
    "## 2 · Aktuelles Projektziel", "ziel",
    "## 3 · Zielgruppe und Pilotlogik", "NICHT_SENDEN_PILOT",
    "## 5 · Verbindliche Produktprinzipien", "prinzipien",
    "## 6 · Wichtigste technische Regeln", "technik",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs/CURRENT_STATE.md"), [
    "# STATE",
    "## Aktueller Production- und Entwicklungsstand", "NICHT_SENDEN_HISTORIE",
    "## Starttor und Schutzgrenzen", "starttor",
    "## Arbeitssteuerung", "steuerung",
    "## Nächster notwendiger Schritt", "naechster",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(root, "lib/example.js"), "module.exports = 1;\n");
  const task = path.join(root, "task.txt");
  fs.writeFileSync(task, "Pruefe die uebergebenen Quellen.");
  return { root, task };
}

function apiResult(payload, usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 }) {
  return { payload, usage, model: "deepseek-flash" };
}

function summary(overrides = {}) {
  return {
    status: "ok",
    result: ["erledigt"],
    files: [],
    tests: [],
    risks: [],
    next: "Sol prueft",
    ...overrides,
  };
}

// Every simulated paid write uses a private recoverable receipt. This wrapper
// only creates a temporary artifact for offline fixtures; explicit recovery tests
// keep their own durable paths and continue to call the real router.
function runSafe(options) {
  const args = options.argv || [];
  const saved = args.includes("--save-response") || args.includes("--replay-response");
  if (args[2] !== "write" || args.includes("--dry-run") || saved) {
    return router.run(options);
  }
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-test-receipt-"));
  try {
    return router.run({ ...options, argv: [...args,
      "--save-response", path.join(privateDir, "response.json")] });
  } finally {
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
}

check("Modellnamen und Routen sind explizit", () => {
  assert.equal(router.MODELS.flash, "deepseek-flash");
  assert.equal(router.MODELS.pro, "deepseek-v4-pro");
  const parsed = router.parseArgs([
    "pro", "max", "write", "--task-file", "/tmp/t", "--file", "lib/a.js",
  ]);
  assert.equal(parsed.model, "deepseek-v4-pro");
  assert.equal(parsed.effort, "max");
  assert.equal(parsed.mode, "write");
  assert.deepEqual(parsed.files, ["lib/a.js"]);
  assert.throws(() => router.parseArgs(["pro", "max", "write", "--task-file", "/tmp/t", "--file", "lib/a.js", "--file", "lib/b.js"]), /write-files-must-be-1-to-1/);
  assert.throws(() => router.parseArgs(["flash", "ultra", "read", "--task-file", "/tmp/t"]), /usage/);
});

check("Direkter Request nutzt Responses API und JSON Schema statt verschachteltem Codex", () => {
  const cfg = { model: "deepseek-flash", effort: "high", mode: "read" };
  const body = router.buildRequestBody("Pruefe.", cfg, [{
    label: "AGENTS.md", content: "x", sha256: hash("x"), editable: false,
  }]);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.reasoning.effort, "high");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.stream, false);
  assert(body.instructions.includes("no shell"));
  assert(!JSON.stringify(body).includes("codex exec"));
});

check("Quellenloader nimmt Kernregeln und explizite private Datei auf", () => {
  const p = project();
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-private-router-test-"));
  const privateFile = path.join(privateDir, "beleg.json");
  fs.writeFileSync(privateFile, '{"beleg":true}\n');
  try {
    const sources = router.loadSources({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"), explicitFiles: [privateFile] });
    assert.equal(sources.length, 4);
    assert(sources.some((s) => s.label === privateFile && s.editable));
    assert(sources.some((s) => s.label === "AGENTS.md" && !s.editable));
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
});

check("Kernkontext nutzt nur relevante Abschnitte der kanonischen Dateien", () => {
  const p = project();
  try {
    const sources = router.loadSources({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"), explicitFiles: [] });
    assert.equal(sources.length, 3);
    const combined = sources.map((s) => s.content).join("\n");
    assert(combined.includes("zielgruppe"));
    assert(combined.includes("uebergabe"));
    assert(combined.includes("starttor"));
    assert(!combined.includes("NICHT_SENDEN_STATUS"));
    assert(!combined.includes("NICHT_SENDEN_PRODUCTION_DETAIL"));
    assert(!combined.includes("NICHT_SENDEN_HISTORIE"));
    assert(!combined.includes("NICHT_SENDEN_PILOT"));
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Explizit uebergebene Kerndatei ersetzt den gekuerzten Kontext fuer genau diese Datei", () => {
  const p = project();
  try {
    const sources = router.loadSources({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"), explicitFiles: ["AGENTS.md"] });
    const agents = sources.filter((s) => s.label === "AGENTS.md");
    assert.equal(agents.length, 1);
    assert.equal(agents[0].editable, true);
    assert(agents[0].content.includes("NICHT_SENDEN_STATUS"));
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("DeepSeek API Transport nutzt curl und Cloud Proxy", () => {
  let seen = null;
  const fakeSpawn = (bin, args, options) => {
    seen = { bin, args, options };
    const modelPayload = { summary: summary() };
    const response = {
      status: "completed",
      model: "deepseek-flash",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(modelPayload) }],
      }],
      usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 },
    };
    return {
      status: 0,
      stdout: JSON.stringify(response) + "\n__HELMUT_HTTP_STATUS__:200",
      stderr: "",
      error: null,
    };
  };
  const result = router.callDeepSeek({ hello: "world" }, {
    apiKey: "network-secret-placeholder",
    spawnSync: fakeSpawn,
    env: {
      PATH: "/bin",
      HTTPS_PROXY: "http://proxy.internal:3128",
      OPENAI_API_KEY: "do-not-forward",
      SUPABASE_SERVICE_ROLE_KEY: "do-not-forward-db",
    },
  });
  assert.equal(result.usage.total_tokens, 19);
  assert.equal(seen.bin, "curl");
  assert(seen.args.includes(router.API_URL));
  assert(!seen.args.join(" ").includes("network-secret-placeholder"), "API key never appears in process argv");
  assert(seen.options.input.includes('header = "Authorization: Bearer network-secret-placeholder"'));
  assert(seen.args.includes("--config"));
  assert.equal(seen.options.env.DEEPSEEK_API_KEY, undefined);
  assert.equal(seen.options.env.HTTPS_PROXY, "http://proxy.internal:3128");
  assert.equal(seen.options.env.OPENAI_API_KEY, undefined);
  assert.equal(seen.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
});

check("Read Modus verarbeitet private Quellen ohne Dateianderung", () => {
  const p = project();
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-private-router-read-"));
  const privateFile = path.join(privateDir, "caller.json");
  fs.writeFileSync(privateFile, '{"caller":"original"}\n');
  const before = fs.readFileSync(privateFile, "utf8");
  try {
    const result = runSafe({
      argv: ["flash", "high", "read", "--task-file", p.task, "--file", privateFile],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({ summary: summary({ result: ["Caller geprueft"] }) }),
    });
    assert.equal(result.status, "ok");
    assert.equal(result.route.model, "deepseek-flash");
    assert.equal(result.route.mode, "read");
    assert.equal(result.usage.total_tokens, 15);
    assert.deepEqual(result.applied_files, []);
    assert.equal(fs.readFileSync(privateFile, "utf8"), before);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
});

check("Read Modus verarbeitet Reasoning ueber dem alten 12000-Limit mit fester 32768-Obergrenze", () => {
  const p = project();
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-reasoning-"));
  const privateFile = path.join(privateDir, "caller.json");
  fs.writeFileSync(privateFile, '{"caller":"original"}\n');
  const before = fs.readFileSync(privateFile, "utf8");
  const reasoningTokens = 16000;
  const READ_MAX_OUTPUT_TOKENS = 32768;
  const WRITE_MAX_OUTPUT_TOKENS = 32768;
  const responseText = JSON.stringify({
    summary: summary({ result: ["Quellenpruefung mit langem Reasoning"], next: "Sol prueft" }),
    edits: [{
      path: privateFile,
      expected_sha256: hash(before),
      content: '{"caller":"read-modus-schreibt-nicht"}\n',
    }],
  });
  const raw = JSON.stringify({
    status: "completed",
    model: "deepseek-v4-pro",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: responseText }],
    }],
    usage: {
      input_tokens: 800,
      output_tokens: reasoningTokens + 25,
      total_tokens: 800 + reasoningTokens + 25,
      output_tokens_details: { reasoning_tokens: reasoningTokens },
    },
  }) + "\n__HELMUT_HTTP_STATUS__:200";

  const parsed = router.parseCurlResponse(raw);
  assert.equal(parsed.usage.output_tokens_details.reasoning_tokens, reasoningTokens);
  assert.equal(parsed.payload.summary.result[0], "Quellenpruefung mit langem Reasoning");

  const calls = [];
  const fakeSpawn = (bin, args, options) => {
    const bodyFile = args[args.indexOf("--data-binary") + 1];
    calls.push({ bin, args, options, request: JSON.parse(fs.readFileSync(bodyFile.slice(1), "utf8")) });
    return { status: 0, stdout: raw, stderr: "", error: null };
  };
  try {
    const result = runSafe({
      argv: ["pro", "high", "read", "--task-file", p.task, "--file", privateFile],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      spawnSync: fakeSpawn,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].bin, "curl");
    const request = calls[0].request;
    assert.equal(request.max_output_tokens, READ_MAX_OUTPUT_TOKENS);
    assert.equal(request.max_output_tokens, 32768, "feste Read-Obergrenze");
    assert.equal(request.reasoning.effort, "high");
    assert.ok(reasoningTokens > 12000, "Reasoning liegt ueber dem alten 12000-Limit");
    assert.ok(request.max_output_tokens > reasoningTokens, "Budget deckt Reasoning plus Antwort");

    const writeRequest = router.buildRequestBody("Pruefe.", {
      model: "deepseek-v4-pro", effort: "high", mode: "write",
    }, []);
    assert.equal(writeRequest.max_output_tokens, WRITE_MAX_OUTPUT_TOKENS, "Write-Budget ist jetzt 32768");
    assert.equal(writeRequest.max_output_tokens, 32768, "feste Write-Obergrenze");

    assert.equal(result.status, "ok");
    assert.equal(result.route.mode, "read");
    assert.equal(result.route.effort, "high");
    assert.equal(result.usage.output_tokens, reasoningTokens + 25);
    assert.deepEqual(result.applied_files, []);
    assert.equal(fs.readFileSync(privateFile, "utf8"), before);
    assert.ok(charLength(JSON.stringify(result)) <= 2000, "Rueckgabe bleibt unter 2000 Zeichen");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
});

check("Write Modus mit 25000 Reasoning-Tokens schreibt genau einen gebundenen Edit bei fester 32768-Obergrenze", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const unrelated = path.join(p.root, "lib/other.js");
  fs.writeFileSync(unrelated, "module.exports = 'unrelated';\n");
  const original = fs.readFileSync(target, "utf8");
  const unrelatedBefore = fs.readFileSync(unrelated, "utf8");
  const reasoningTokens = 25000;
  const newContent = "module.exports = 3;\n";
  const responseText = JSON.stringify({
    summary: summary({
      result: ["Write mit langem Reasoning angewendet"],
      files: [{ path: "lib/example.js", note: "Wert angepasst" }],
      next: "Sol prueft",
    }),
    edits: [{
      path: "lib/example.js",
      expected_sha256: hash(original),
      content: newContent,
    }],
  });
  const raw = JSON.stringify({
    status: "completed",
    model: "deepseek-flash",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: responseText }],
    }],
    usage: {
      input_tokens: 900,
      output_tokens: reasoningTokens + 40,
      total_tokens: 900 + reasoningTokens + 40,
      output_tokens_details: { reasoning_tokens: reasoningTokens },
    },
  }) + "\n__HELMUT_HTTP_STATUS__:200";

  const calls = [];
  const fakeSpawn = (bin, args, options) => {
    const bodyFile = args[args.indexOf("--data-binary") + 1];
    calls.push({ bin, args, options, request: JSON.parse(fs.readFileSync(bodyFile.slice(1), "utf8")) });
    return { status: 0, stdout: raw, stderr: "", error: null };
  };
  try {
    const result = runSafe({
      argv: ["flash", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      spawnSync: fakeSpawn,
    });

    assert.equal(calls.length, 1, "genau ein curl");
    assert.equal(calls[0].bin, "curl");
    const request = calls[0].request;
    assert.equal(request.max_output_tokens, 32768, "feste Write-Obergrenze");
    assert.equal(request.model, "deepseek-flash");
    assert.equal(request.reasoning.effort, "high");
    assert.ok(reasoningTokens > 24000, "Reasoning liegt ueber dem alten 24000-Limit");

    assert.equal(result.status, "ok");
    assert.equal(result.route.model, "deepseek-flash");
    assert.equal(result.route.mode, "write");
    assert.equal(result.route.effort, "high");
    assert.equal(result.usage.input_tokens, 900);
    assert.equal(result.usage.output_tokens, reasoningTokens + 40);
    assert.equal(result.usage.total_tokens, 900 + reasoningTokens + 40);
    assert.deepEqual(result.applied_files, ["lib/example.js"]);
    assert.equal(fs.readFileSync(target, "utf8"), newContent, "autorisierte Bytes exakt angewendet");
    assert.equal(fs.readFileSync(unrelated, "utf8"), unrelatedBefore, "unbeteiligte Datei unveraendert");
    assert.ok(charLength(JSON.stringify(result)) <= 2000, "Rueckgabe bleibt unter 2000 Zeichen");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});


check("Ueberlange valide Summary wird kompakt uebergeben statt verworfen", () => {
  const long = summary({
    result: Array.from({ length: 4 }, (_, i) => `Ergebnis ${i + 1} ${"x".repeat(210)}`),
    files: Array.from({ length: 10 }, (_, i) => ({
      path: `lib/helmut/sehr-langer-pfad-${i}-${"p".repeat(120)}.js`,
      note: `Hinweis ${"n".repeat(150)}`,
    })),
    tests: Array.from({ length: 8 }, (_, i) => ({
      name: `Test ${i} ${"t".repeat(120)}`,
      result: `not run ${"r".repeat(100)}`,
    })),
    risks: Array.from({ length: 4 }, (_, i) => `Risiko ${i} ${"q".repeat(200)}`),
    next: `Weiter ${"w".repeat(220)}`,
  });
  assert.ok(charLength(JSON.stringify(long)) > 2000, "Testsummary ist wirklich ueberlang");
  assert.doesNotThrow(() => router.validateSummary(long));
  const visible = router.finalVisibleResult(long,
    { model: "deepseek-v4-pro", effort: "high", mode: "read" },
    { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } }, []);
  assert.equal(visible.summary_compacted, true);
  assert.ok(charLength(JSON.stringify(visible)) <= 2000, "sichtbare Rueckgabe bleibt unter 2000 Zeichen");
});

check("Ueberlange Rueckgabe stoppt Write vor jeder Dateianderung", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const original = fs.readFileSync(target, "utf8");
  const oversized = summary({
    result: Array.from({ length: 4 }, () => "\n".repeat(220)),
    files: Array.from({ length: 10 }, () => ({
      path: "\n".repeat(180), note: "\n".repeat(160),
    })),
    tests: Array.from({ length: 8 }, () => ({
      name: "\n".repeat(140), result: "\n".repeat(120),
    })),
    risks: Array.from({ length: 4 }, () => "\n".repeat(220)),
    next: "\n".repeat(240),
  });
  try {
    assert.throws(() => router.finalVisibleResult(oversized,
      { model: "deepseek-flash", effort: "high", mode: "write" },
      { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, contextChars: 50000 },
      ["lib/example.js"]), /deepseek-visible-result-too-long/);
    assert.throws(() => runSafe({
      argv: ["flash", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({
        summary: oversized,
        edits: [{
          path: "lib/example.js",
          expected_sha256: hash(original),
          content: "module.exports = 2;\n",
        }],
      }),
    }), /deepseek-visible-result-too-long/);
    assert.equal(fs.readFileSync(target, "utf8"), original,
      "abgewiesene Antwort darf keine Datei veraendern");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Write Modus wendet nur hashgebundene explizite Repository Datei an", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const original = fs.readFileSync(target, "utf8");
  try {
    const result = runSafe({
      argv: ["pro", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({
        summary: summary({
          files: [{ path: "lib/example.js", note: "Wert angepasst" }],
        }),
        edits: [{
          path: "lib/example.js",
          expected_sha256: hash(original),
          content: "module.exports = 2;\n",
        }],
      }),
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.applied_files, ["lib/example.js"]);
    assert.equal(fs.readFileSync(target, "utf8"), "module.exports = 2;\n");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Nicht uebergebener Schreibpfad wird fail closed abgelehnt", () => {
  const p = project();
  const original = fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8");
  fs.writeFileSync(path.join(p.root, "lib/other.js"), "x\n");
  try {
    assert.throws(() => runSafe({
      argv: ["pro", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({
        summary: summary(),
        edits: [{
          path: "lib/other.js",
          expected_sha256: hash("x\n"),
          content: "y\n",
        }],
      }),
    }), /edit-path-not-allowed/);
    assert.equal(fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8"), original);
    assert.equal(fs.readFileSync(path.join(p.root, "lib/other.js"), "utf8"), "x\n");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Schreiben ausserhalb des Repositorys bleibt verboten", () => {
  const p = project();
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-outside-"));
  const outside = path.join(outsideDir, "private.json");
  fs.writeFileSync(outside, '{"x":1}\n');
  const original = fs.readFileSync(outside, "utf8");
  try {
    assert.throws(() => runSafe({
      argv: ["pro", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", outside],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({
        summary: summary(),
        edits: [{
          path: outside,
          expected_sha256: hash(original),
          content: '{"x":2}\n',
        }],
      }),
    }), /write-outside-repo/);
    assert.equal(fs.readFileSync(outside, "utf8"), original);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

check("Dateilinks zu privaten Fremdpfaden werden vor jedem API-Aufruf abgewiesen", () => {
  const p = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-symlink-outside-"));
  const privateTarget = path.join(outside, "private-data.txt");
  fs.writeFileSync(privateTarget, "PRIVATE MUST NOT BE SENT\n");
  const link = path.join(p.root, "lib", "link.js");
  fs.symlinkSync(privateTarget, link);
  const parentLink = path.join(p.root, "lib", "external");
  fs.symlinkSync(outside, parentLink, "dir");
  let calls = 0;
  const base = { cwd: p.root, env: {}, budgetDir: path.join(p.root, ".budget-test"),
    callDeepSeek: () => { calls++; throw new Error("provider-must-not-start"); } };
  try {
    assert.throws(() => router.run({
      ...base, argv: ["flash", "high", "write", "--dry-run",
        "--task-file", p.task, "--file", "lib/link.js"]
    }), /ELOOP|symlink|nofollow/i);
    assert.throws(() => router.run({
      ...base, argv: ["flash", "high", "write", "--dry-run",
        "--task-file", p.task, "--file", "lib/external/private-data.txt"]
    }), /write-outside-repo/);
    assert.equal(calls, 0);
    assert.equal(fs.readFileSync(privateTarget, "utf8"), "PRIVATE MUST NOT BE SENT\n");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

check("Fremdaenderung unmittelbar vor Dateianwendung bleibt unangetastet", () => {
  const p = project();
  try {
    const target = path.join(p.root, "lib/example.js");
    const original = fs.readFileSync(target, "utf8");
    const sources = router.loadSources({cwd:p.root, explicitFiles:["lib/example.js"]});
    const prepared = router.prepareEdits([{
      path:"lib/example.js", expected_sha256:hash(original),
      content:"module.exports = 42;\n"
    }], sources, p.root, "full");
    fs.writeFileSync(target, "module.exports = 'foreign';\n");
    assert.throws(() => router.applyEdits(prepared), /current-hash-drift/);
    assert.equal(fs.readFileSync(target,"utf8"),"module.exports = 'foreign';\n");
  } finally {
    fs.rmSync(p.root, {recursive:true,force:true});
  }
});

check("Hash Drift vor Anwendung stoppt ohne Schreiben", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const original = fs.readFileSync(target, "utf8");
  try {
    assert.throws(() => runSafe({
      argv: ["pro", "high", "write", "--edit-format", "full", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => {
        fs.writeFileSync(target, "parallel change\n");
        return apiResult({
          summary: summary(),
          edits: [{
            path: "lib/example.js",
            expected_sha256: hash(original),
            content: "deepseek change\n",
          }],
        });
      },
    }), /current-hash-drift/);
    assert.equal(fs.readFileSync(target, "utf8"), "parallel change\n");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Ueberlange sichtbare Rueckgabe wird verdichtet und bleibt hart begrenzt", () => {
  const cfg = { model: "deepseek-flash", effort: "high", mode: "read" };
  const visible = router.finalVisibleResult(
    summary({ result: ["x".repeat(1900)] }),
    cfg,
    { usage: {}, model: "deepseek-flash" },
    []
  );
  assert.equal(visible.summary_compacted, true);
  assert.ok(charLength(JSON.stringify(visible)) <= 2000);
});

check("HTTP und unvollstaendige Modellantworten werden fail closed abgelehnt", () => {
  assert.throws(
    () => router.parseCurlResponse('{"error":"x"}\n__HELMUT_HTTP_STATUS__:401'),
    /deepseek-http-401/
  );
  const incomplete = {
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
  };
  assert.throws(
    () => router.parseCurlResponse(JSON.stringify(incomplete) + "\n__HELMUT_HTTP_STATUS__:200"),
    /not-completed:max_output_tokens/
  );
});

check("Connectivity Test bleibt kompatibel mit funktionierendem Cloud Proxy", () => {
  let seen = null;
  const fakeSpawn = (bin, args, options) => {
    seen = { bin, args, options };
    const payload = {
      model: "deepseek-flash",
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: connectivity.EXPECTED }],
      }],
      usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 },
    };
    return {
      status: 0,
      stdout: JSON.stringify(payload) + "\n__HELMUT_HTTP_STATUS__:200",
      stderr: "",
      error: null,
    };
  };
  const result = connectivity.callDeepSeek({
    apiKey: "network-secret-placeholder",
    spawnSync: fakeSpawn,
    env: { HTTPS_PROXY: "http://proxy.internal:3128" },
  });
  assert.equal(result.ok, true);
  assert.equal(seen.bin, "curl");
  assert.equal(seen.options.env.HTTPS_PROXY, "http://proxy.internal:3128");
});

check("Ohne DeepSeek Key startet kein API Worker", () => {
  const p = project();
  try {
    assert.throws(() => runSafe({
      argv: ["flash", "high", "read", "--task-file", p.task],
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      env: {},
      callDeepSeek: () => {
        throw new Error("darf nicht starten");
      },
    }), /DEEPSEEK_API_KEY-fehlt/);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

function recoveryFixture(fn) {
  const p = project();
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-recovery-"));
  p.saved = path.join(privateDir, "response.json");
  p.target = path.join(p.root, "lib/example.js");
  p.original = fs.readFileSync(p.target, "utf8");
  p.argv = ["flash", "high", "write", "--task-file", p.task,
    "--file", "lib/example.js", "--edit-format", "replacements"];
  p.payload = { summary: summary(), edits: [{ path: "lib/example.js",
    expected_sha256: hash(p.original), replacements: [{ old_text: "= 1", new_text: "= 2" }] }] };
  p.raw = (payload = p.payload) => JSON.stringify({ status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
    usage: { output_tokens: 80 } }) + "\n__HELMUT_HTTP_STATUS__:200";
  p.run = (extra = [], opts = {}) => runSafe({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
    argv: [...p.argv, ...extra], env: { DEEPSEEK_API_KEY: "placeholder" },
    spawnSync: () => ({ status: 0, stdout: p.raw() }), ...opts });
  try { fn(p); } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
}

check("Kleine Ersetzung statt vollstaendiger grosser Datei; Schema und Grenze bleiben gebunden", () => {
  recoveryFixture((p) => {
    const source = "// unveraendert\n".repeat(6000) + p.original;
    fs.writeFileSync(p.target, source);
    p.payload.edits[0].expected_sha256 = hash(source);
    let request;
    const result = p.run([], { spawnSync: (bin, args, opts) => {
      request = JSON.parse(fs.readFileSync(args[args.indexOf("--data-binary") + 1].slice(1), "utf8"));
      return { status: 0, stdout: p.raw() };
    } });
    assert.equal(request.max_output_tokens, 32768);
    assert.ok(request.instructions.includes("ORIGINAL source"));
    const editSchema = request.text.format.schema.properties.edits.items;
    assert.ok(editSchema.required.includes("replacements"));
    assert.ok(!("content" in editSchema.properties));
    assert.ok(p.raw().length < source.length / 100);
    assert.equal(fs.readFileSync(p.target, "utf8"), source.replace("= 1", "= 2"));
    assert.deepEqual(result.applied_files, ["lib/example.js"]);
    assert.ok(charLength(JSON.stringify(result)) <= 2000);
    assert.ok(router.modelOutputSchema("write").properties.edits.items.required.includes("content"));
  });
});

check("Ersetzungen sind eindeutig, nicht ueberlappend und beziehen sich auf Originalbytes", () => {
  assert.equal(router.replaceExact("a 😀 b", [{ old_text: "😀", new_text: "ä" },
    { old_text: "b", new_text: "😀" }]), "a ä 😀");
  assert.equal(router.replaceExact("abc", [{ old_text: "b", new_text: "" }]), "ac");
  for (const [src, replacements, error] of [
    ["aaaa", [{ old_text: "aa", new_text: "x" }], /not-unique/],
    ["abc", [{ old_text: "missing", new_text: "x" }], /not-unique/],
    ["abc", [{ old_text: "ab", new_text: "x" }, { old_text: "bc", new_text: "y" }], /overlap/],
    ["abc", [{ old_text: "", new_text: "x" }], /replacement-invalid/],
    ["abc", [], /replacements-invalid/],
    ["abc", [{ old_text: "a", new_text: "x".repeat(12001) }], /replacement-invalid/],
  ]) assert.throws(() => router.replaceExact(src, replacements), error);
});

check("Genau eine schreibbare Datei; ungültige Edits bleiben ohne Wirkung", () => {
  recoveryFixture((p) => {
    const good = structuredClone(p.payload.edits[0]);
    fs.writeFileSync(path.join(p.root, "lib/second.js"), p.original);
    p.argv.push("--file", "lib/second.js");
    const noProvider = () => { throw new Error("provider-must-not-start"); };
    assert.throws(() => p.run([], { spawnSync: noProvider }), /write-files-must-be-1-to-1/);
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
    p.argv.splice(-2);
    for (const [bad, error] of [
      [{ ...good, path: "lib/unknown.js" }, /path-not-allowed/],
      [{ ...good, expected_sha256: "0".repeat(64) }, /hash-mismatch/],
      [{ ...good, content: "wrong format" }, /format-mismatch/],
      [{ ...good }, /duplicate-path/],
    ]) {
      p.payload.edits = String(error).includes("duplicate-path") ? [good, bad] : [bad];
      assert.throws(() => p.run(), error);
      assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
    }
    p.payload.edits = [good];
    p.payload.summary.status = "blocked";
    assert.throws(() => p.run(), /non-ok-edits/);
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
  });
});

check("Unvollstaendige Antwort wird privat gesichert, niemals angewandt oder automatisch wiederholt", () => {
  recoveryFixture((p) => {
    const raw = JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: '{"partial":' }] }],
      usage: { output_tokens: 32768, output_tokens_details: { reasoning_tokens: 32000 } } }) +
      "\n__HELMUT_HTTP_STATUS__:200";
    let calls = 0;
    const spawnSync = () => { calls++; return { status: 0, stdout: raw }; };
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync }),
      /max_output_tokens:input_tokens=0:output_tokens=32768:reasoning_tokens=32000/);
    const saved = JSON.parse(fs.readFileSync(p.saved, "utf8"));
    assert.equal(saved.raw, raw);
    assert.equal(fs.statSync(p.saved).mode & 0o777, 0o600);
    assert.ok(!fs.readFileSync(p.saved, "utf8").includes("placeholder"));
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync }), /EEXIST/);
    assert.throws(() => p.run(["--replay-response", p.saved], { env: {}, spawnSync }), /not-completed/);
    assert.equal(calls, 1);
  });
});

check("Vollstaendige Arbeit nach Dateidrift bleibt erhalten und wird offline wiederaufgenommen", () => {
  recoveryFixture((p) => {
    let calls = 0;
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync: () => {
      calls++;
      fs.writeFileSync(p.target, "concurrent work\n");
      return { status: 0, stdout: p.raw() };
    } }), /current-hash-drift/);
    const noNetwork = () => { throw new Error("network-must-not-start"); };
    assert.throws(() => p.run(["--replay-response", p.saved],
      { env: {}, spawnSync: noNetwork }), /replay-request-mismatch/);
    // Only this test restores its own fixture; replay never restores user files.
    fs.writeFileSync(p.target, p.original);
    const taskBefore = fs.readFileSync(p.task, "utf8");
    fs.writeFileSync(p.task, taskBefore + " changed");
    assert.throws(() => p.run(["--replay-response", p.saved],
      { env: {}, spawnSync: noNetwork }), /replay-request-mismatch/);
    fs.writeFileSync(p.task, taskBefore);
    const result = p.run(["--replay-response", p.saved], { env: {}, spawnSync: noNetwork });
    assert.equal(result.status, "ok");
    assert.equal(result.replayed, true);
    assert.equal(fs.readFileSync(p.target, "utf8"), "module.exports = 2;\n");
    assert.equal(calls, 1);
    assert.throws(() => p.run(["--replay-response", p.saved],
      { env: {}, spawnSync: noNetwork }), /replay-request-mismatch/);
  });
});

check("Transportabbruch erhaelt empfangene Teilbytes ohne Anwendung", () => {
  recoveryFixture((p) => {
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync: () => ({
      status: 28, stdout: '{"partial":', stderr: "timeout",
    }) }), /curl-exit-28/);
    assert.equal(JSON.parse(fs.readFileSync(p.saved, "utf8")).raw, '{"partial":');
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
  });
});

check("Antwortablage lehnt Repository, fremden Worktree, Symlinks und bestehende Dateien vor API ab", () => {
  recoveryFixture((p) => {
    const noNetwork = () => { throw new Error("network-must-not-start"); };
    assert.throws(() => p.run(["--save-response", p.target], { spawnSync: noNetwork }), /outside-repo/);
    const sibling = path.join(path.dirname(p.saved), "sibling");
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, ".git"), "gitdir: elsewhere");
    assert.throws(() => p.run(["--save-response", path.join(sibling, "raw.json")],
      { spawnSync: noNetwork }), /outside-repo/);
    fs.symlinkSync(p.target, p.saved);
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync: noNetwork }), /symlink/);
    fs.unlinkSync(p.saved);
    fs.writeFileSync(p.saved, "previous work");
    assert.throws(() => p.run(["--save-response", p.saved], { spawnSync: noNetwork }), /EEXIST/);
    assert.equal(fs.readFileSync(p.saved, "utf8"), "previous work");
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
  });
});

check("Read-Antwort wird ohne Key und ohne Modellaufruf wiederverwendet; Kontextdrift sperrt", () => {
  recoveryFixture((p) => {
    p.argv[2] = "read";
    p.argv.splice(-2);
    p.run(["--save-response", p.saved]);
    const noNetwork = () => { throw new Error("network-must-not-start"); };
    assert.equal(p.run(["--replay-response", p.saved], { env: {}, spawnSync: noNetwork }).status, "ok");
    fs.appendFileSync(path.join(p.root, "AGENTS.md"), "\n## Tests\nchanged policy\n");
    // Modify a selected section (rather than an excluded historical section).
    const agents = path.join(p.root, "AGENTS.md");
    fs.writeFileSync(agents, fs.readFileSync(agents, "utf8").replace("grundregel", "new rule"));
    assert.throws(() => p.run(["--replay-response", p.saved],
      { env: {}, spawnSync: noNetwork }), /replay-request-mismatch/);
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
  });
});

check("Neue Optionen bleiben ausdruecklich und unvertraegliche Kombinationen stoppen", () => {
  const base = ["flash", "high", "write", "--task-file", "/tmp/task", "--file", "lib/example.js"];
  assert.equal(router.parseArgs(base).editFormat, "replacements");
  assert.throws(() => router.parseArgs([...base, "--edit-format", "guess"]), /invalid-edit-format/);
  assert.throws(() => router.parseArgs(["flash", "high", "read", "--task-file", "/tmp/task",
    "--edit-format", "replacements"]), /invalid-edit-format/);
  assert.throws(() => router.parseArgs([...base, "--save-response", "/tmp/a",
    "--replay-response", "/tmp/b"]), /exclusive/);
});

check("HTTP-Fehler und Workerabbruch werden gesichert, bleiben beim Replay gesperrt", () => {
  recoveryFixture((p) => {
    const raw = '{"error":"provider-error"}\n__HELMUT_HTTP_STATUS__:500';
    assert.throws(() => p.run(["--save-response", p.saved], {
      spawnSync: () => ({ status: 0, stdout: raw }),
    }), /http-500/);
    assert.equal(JSON.parse(fs.readFileSync(p.saved, "utf8")).raw, raw);
    assert.throws(() => p.run(["--replay-response", p.saved], { env: {},
      spawnSync: () => { throw new Error("network-must-not-start"); } }), /http-500/);
    const other = p.saved + ".timeout";
    assert.throws(() => p.run(["--save-response", other], {
      spawnSync: () => ({ error: { code: "ETIMEDOUT" }, stdout: "partial response" }),
    }), /worker-timeout/);
    assert.equal(JSON.parse(fs.readFileSync(other, "utf8")).raw, "partial response");
    assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
  });
});

check("Wiederaufnahme mit anderer Route oder anderem Aenderungsformat startet kein Modell", () => {
  recoveryFixture((p) => {
    p.run(["--save-response", p.saved]);
    fs.writeFileSync(p.target, p.original);
    const originalArgs = [...p.argv];
    const noNetwork = () => { throw new Error("network-must-not-start"); };
    for (const args of [
      ["pro", ...originalArgs.slice(1)],
      [originalArgs[0], "max", ...originalArgs.slice(2)],
      [...originalArgs.slice(0, -1), "full"],
    ]) {
      p.argv = args;
      assert.throws(() => p.run(["--replay-response", p.saved],
        { env: {}, spawnSync: noNetwork }), /replay-request-mismatch/);
      assert.equal(fs.readFileSync(p.target, "utf8"), p.original);
    }
  });
});


check("Lange, klar abgegrenzte Schreibauftraege bis 12000 Zeichen ohne bezahlten Vorversuch", () => {
  const p = project();
  let calls = 0;
  const original = fs.readFileSync(p.task, "utf8");
  try {
    // The old 3,000-character write cap was needlessly narrow.
    fs.writeFileSync(p.task, "Scope: edit only the supplied function.\n" + "A".repeat(9000));
    const result = router.run({
      cwd: p.root,
      argv: ["flash", "high", "write", "--task-file", p.task,
        "--file", "lib/example.js", "--dry-run"],
      env: {},
      callDeepSeek: () => { calls++; throw new Error("must-not-call-provider"); },
    });
    assert.equal(result.status, "dry_run");
    assert.equal(result.admission.output_token_cap, 32768);
    assert.equal(calls, 0);
    // The overall project is not capped. Individual requests retain a finite,
    // independently reviewable input budget.
    fs.writeFileSync(p.task, "A".repeat(router.MAX_TASK_CHARS + 1));
    assert.throws(() => router.run({
      cwd: p.root,
      argv: ["flash", "high", "write", "--task-file", p.task,
        "--file", "lib/example.js", "--dry-run"],
      env: {},
      callDeepSeek: () => { calls++; throw new Error("must-not-call-provider"); },
    }), /task-too-long/);
    assert.equal(calls, 0);
  } finally {
    fs.writeFileSync(p.task, original);
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

check("Kostenkontrolle und Groessenpruefung stoppen vor bezahlter API", () => {
  const p = project();
  let started = false;
  const noNetwork = () => { started = true; throw new Error("paid-call-must-not-start"); };
  try {
    const cfg = { cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"), env: { DEEPSEEK_API_KEY: "placeholder" }, spawnSync: noNetwork };
    const dry = runSafe({ ...cfg, env: {},
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js", "--dry-run"] });
    assert.equal(dry.status, "dry_run");
    assert.equal(dry.admission.output_token_cap, 32768);
    assert.equal(started, false);
    assert.throws(() => runSafe({ ...cfg,
      argv: ["pro", "high", "write", "--task-file", p.task,
        "--file", "lib/example.js", "--max-cost-usd", "0.01"] }), /preflight-cost-cap/);
    assert.equal(started, false);
    fs.writeFileSync(path.join(p.root, "lib/example.js"), "a".repeat(20000));
    assert.throws(() => runSafe({ ...cfg,
      argv: ["flash", "high", "write", "--edit-format", "full", "--task-file", p.task,
        "--file", "lib/example.js"] }), /full-file-too-large/);
    assert.equal(started, false);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Ausschliesslich High und Max, Ausgabetokens und Kosten klar begrenzt", () => {
  const basic = ["flash", "high", "read", "--task-file", "/tmp/task"];
  const parsed = router.parseArgs([...basic, "--max-output-tokens", "1000"]);
  const request = router.buildRequestBody("Untersuche.", parsed, []);
  assert.equal(request.max_output_tokens, 1000);
  assert.equal(request.reasoning.effort, "high");
  assert.equal(router.buildRequestBody("Untersuche.",
    router.parseArgs(["pro", "max", "read", "--task-file", "/tmp/task"]), []).max_output_tokens, 32768);
  for (const effort of ["none", "low"]) {
    assert.throws(() => router.parseArgs(["flash", effort, "read", "--task-file", "/tmp/task"]), /usage/);
  }
  assert.throws(() => router.parseArgs([...basic, "--max-output-tokens", "32769"]), /invalid-max-output-tokens/);
  assert.throws(() => router.parseArgs([...basic, "--max-cost-usd", "1"]), /invalid-max-cost-usd/);
  assert.throws(() => router.parseArgs([...basic, "--max-cost-usd", "-0.1"]), /invalid-max-cost-usd/);
  assert.throws(() => router.parseArgs([...basic, "--dry-run", "--save-response", "/tmp/file"]), /exclusive/);
});

check("Schreibauftrag mit ok ohne Code wird nie als Erfolg quittiert", () => {
  const p = project();
  const original = fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8");
  try {
    assert.throws(() => runSafe({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({ summary: summary(), edits: [] }),
    }), /write-ok-without-edits/);
    assert.equal(fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8"), original);
    const blocked = runSafe({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({ summary: summary({ status: "blocked" }), edits: [] }),
    });
    assert.equal(blocked.status, "blocked");
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Verbrauch bleibt auch bei fehlerhafter bezahlter Antwort sichtbar", () => {
  const raw = JSON.stringify({ status: "completed", model: "deepseek-flash",
    output: [{ type: "message", content: [{ type: "output_text", text: "{bad-json" }] }],
    usage: { input_tokens: 120, output_tokens: 400 } }) +
    "\n__HELMUT_HTTP_STATUS__:200";
  assert.throws(() => router.parseCurlResponse(raw), /output-invalid-json:input_tokens=120:output_tokens=400:peak_usd_estimate=/);
  const p = project();
  try {
    assert.throws(() => runSafe({
      cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"), env: { DEEPSEEK_API_KEY: "placeholder" },
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      callDeepSeek: () => apiResult({ summary: summary(), edits: [] },
        { input_tokens: 123, output_tokens: 321, total_tokens: 444 }),
    }), /write-ok-without-edits; input_tokens=123:output_tokens=321:peak_usd_estimate=/);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Unveraenderte Ersatzinhalte duerfen nicht als Schreib-Erfolg gelten", () => {
  const p = project();
  const original = fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8");
  try {
    assert.throws(() => runSafe({ cwd: p.root, budgetDir: path.join(p.root, ".deepseek-budget-test"),
      argv: ["flash", "high", "write", "--edit-format", "full", "--task-file", p.task,
        "--file", "lib/example.js"],
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => apiResult({ summary: summary(), edits: [{
        path: "lib/example.js", expected_sha256: hash(original), content: original,
      }] }),
    }), /edit-unchanged-content/);
    assert.equal(fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8"), original);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Kostenprognose stellt Peak Obergrenze transparent dar", () => {
  const cfg = router.parseArgs(["pro", "high", "read", "--task-file", "/tmp/task"]);
  const body = router.buildRequestBody("Pruefe.", cfg, []);
  const estimate = router.preflight(cfg, "Pruefe.", body, []);
  assert.equal(estimate.output_token_cap, 32768);
  assert(estimate.estimated_peak_usd <= 0.25);
  assert.equal(router.observedPeakUsd("deepseek-v4-pro",
    { input_tokens: 1000000, output_tokens: 1000000 }), 5.28);
  assert.equal(router.observedPeakUsd("not-a-model", {}), null);
  assert.equal(router.observedPeakUsd("deepseek-flash", { output_tokens: 5 }), null);
});


check("UTC Tagesdeckel und parallele Reservierung verhindern Mehrfachausgaben", () => {
  const p = project();
  const dir = path.join(p.root, "safe-budget");
  const day = new Date("2026-10-26T02:00:00Z");
  try {
    const a = dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", dir, now: day });
    const b = dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", dir, now: day });
    const c = dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", dir, now: day });
    const d = dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", dir, now: day });
    for (let i = 0; i < 4; i++) {
      dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", dir, now: day });
    }
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-26" }).amountMicro, 2000000);
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-26" }).limitMicro, 2000000);
    assert.throws(() => dailyBudget.reserve({ estimateUsd: 0.01, model: "deepseek-flash", dir, now: day }), /daily-cap/);
    assert.equal(dailyBudget.settle(a, 0.0125), true);
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-26" }).amountMicro, 1762500);
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-26" }).pending, 7);
    assert.throws(() => dailyBudget.settle(a, 0.0125), /settlement-invalid/);
    assert.equal(dailyBudget.settle(b, null), false);
    fs.mkdirSync(path.join(dir, ".lock"));
    assert.throws(() => dailyBudget.reserve({ estimateUsd: 0.01, model: "deepseek-flash", dir, now: day }), /budget-locked/);
    fs.rmdirSync(path.join(dir, ".lock"));
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-27" }).amountMicro, 0);
    assert.equal(dailyBudget.settle(c, 0.1), true);
    assert.equal(dailyBudget.settle(d, 0.1), true);
    assert.equal(dailyBudget.snapshot({ dir, day: "2026-10-26" }).amountMicro, 1462500);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Voller Tag sperrt Router vor Netzwerk ohne nachfolgende Modellkosten", () => {
  const p = project();
  let calls = 0;
  const store = path.join(p.root, "router-ledger");
  try {
    // Eight conservative 25-cent reservations use the entire two-dollar day.
    const day = new Date();
    for (let i = 0; i < 8; i++) {
      dailyBudget.reserve({ estimateUsd: 0.25, model: "deepseek-flash", now: day, dir: store });
    }
    assert.throws(() => runSafe({
      cwd: p.root, budgetDir: store, env: { DEEPSEEK_API_KEY: "placeholder" },
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      callDeepSeek: () => { calls++; throw new Error("paid-provider-must-not-run"); },
    }), /daily-cap/);
    assert.equal(calls, 0);
    assert.equal(dailyBudget.snapshot({ dir: store }).amountMicro, 2000000);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});

check("Budgetjournal korrupt: kein Modellaufruf und kein stilles Reset", () => {
  const p = project();
  const dir = path.join(p.root, "safe-budget");
  try {
    const ticket = dailyBudget.reserve({ estimateUsd: 0.2, model: "deepseek-v4-pro", dir });
    assert.equal(dailyBudget.settle(ticket, null), false);
    assert.equal(dailyBudget.snapshot({ dir, day: ticket.day }).pending, 1);
    fs.writeFileSync(path.join(dir, "budget.json"), "invalid-json", { mode: 0o600 });
    assert.throws(() => dailyBudget.reserve({ estimateUsd: 0.01, model: "deepseek-flash", dir }), /SyntaxError|Unexpected token/);
    assert.equal(fs.existsSync(path.join(dir, "budget.json")), true);
  } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
});
check("Bezahltes Schreiben ohne gesicherte Antwort wird vor Modellaufruf abgelehnt", () => {
  const p = project();
  let calls = 0;
  try {
    const before = fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8");
    assert.throws(() => router.run({
      cwd: p.root,
      budgetDir: path.join(p.root, "budget-no-call"),
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      env: { DEEPSEEK_API_KEY: "placeholder" },
      callDeepSeek: () => { calls++; throw new Error("must-not-start"); },
    }), /write-requires-save-response; no-provider-call/);
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(p.root, "budget-no-call")), false);
    assert.equal(fs.readFileSync(path.join(p.root, "lib/example.js"), "utf8"), before);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});


check("Ungueltige Provider Usage darf die Kostenreservierung nicht auf Null setzen", () => {
  const p = project();
  const dir = path.join(p.root, "usage-budget");
  let calls = 0;
  try {
    for (const invalid of [
      { input_tokens: null, output_tokens: 10 },
      { input_tokens: 10, output_tokens: null },
      { input_tokens: "10", output_tokens: 15 },
      { input_tokens: true, output_tokens: 0 },
      { input_tokens: 10, output_tokens: 20, total_tokens: 2 },
      {},
    ]) {
      assert.equal(router.observedPeakUsd("deepseek-flash", invalid), null);
      const result = router.run({
        cwd: p.root, budgetDir: dir,
        env: { DEEPSEEK_API_KEY: "placeholder" },
        argv: ["flash", "high", "read", "--task-file", p.task],
        callDeepSeek: () => {
          calls++;
          return { payload: { summary: summary() }, usage: invalid, model: "deepseek-flash" };
        },
      });
      assert.equal(result.status, "ok");
      assert.equal(result.usage.observed_peak_usd_estimate, null);
    }
    const snap = dailyBudget.snapshot({dir});
    assert.equal(calls, 6);
    assert.equal(snap.pending, 6);
    assert.ok(snap.amountMicro > 0);
  } finally { fs.rmSync(p.root, { recursive:true, force:true }); }
});

check("Fehlendes Journal nach Initialisierung sperrt statt Tagesbetrag zurueckzusetzen", () => {
  const p = project();
  const dir = path.join(p.root, "budget-loss");
  try {
    const day = new Date("2026-10-26T05:00:00Z");
    for(let i=0;i<8;i++) dailyBudget.reserve({
      estimateUsd:0.25, model:"deepseek-flash", dir, now:day
    });
    assert.equal(dailyBudget.snapshot({dir,day:"2026-10-26"}).amountMicro,2000000);
    assert.equal(fs.existsSync(path.join(dir,".initialized")),true);
    fs.unlinkSync(path.join(dir, "budget.json"));
    assert.throws(() => dailyBudget.reserve({
      estimateUsd:0.01,model:"deepseek-flash",dir,now:day
    }), /journal-missing/);
    assert.equal(fs.existsSync(path.join(dir,"budget.json")),false);
    // Even an interrupted first initialization may not be silently repaired.
    const empty = path.join(p.root, "interrupted-init");
    fs.mkdirSync(empty, {mode:0o700});
    fs.writeFileSync(path.join(empty,".initialized"),"committed\n",{mode:0o600});
    assert.throws(() => dailyBudget.reserve({
      estimateUsd:0.01,model:"deepseek-flash",dir:empty,now:day
    }),/journal-missing/);
  } finally { fs.rmSync(p.root, { recursive:true, force:true }); }
});

console.log(`DeepSeek Cloud Router v2: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
