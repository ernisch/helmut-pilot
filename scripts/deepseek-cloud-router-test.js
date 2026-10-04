"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const router = require("./deepseek-cloud-router");
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
  fs.writeFileSync(path.join(root, "AGENTS.md"), "AGENTS\n");
  fs.writeFileSync(path.join(root, "docs/START_HERE.md"), "START\n");
  fs.writeFileSync(path.join(root, "docs/CURRENT_STATE.md"), "STATE\n");
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

check("Modellnamen und Routen sind explizit", () => {
  assert.equal(router.MODELS.flash, "deepseek-flash");
  assert.equal(router.MODELS.pro, "deepseek-v4-pro");
  const parsed = router.parseArgs([
    "pro", "max", "write", "--task-file", "/tmp/t", "--file", "lib/a.js", "--file", "lib/b.js",
  ]);
  assert.equal(parsed.model, "deepseek-v4-pro");
  assert.equal(parsed.effort, "max");
  assert.equal(parsed.mode, "write");
  assert.deepEqual(parsed.files, ["lib/a.js", "lib/b.js"]);
  assert.throws(() => router.parseArgs(["flash", "low", "read", "--task-file", "/tmp/t"]), /usage/);
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
    const sources = router.loadSources({ cwd: p.root, explicitFiles: [privateFile] });
    assert.equal(sources.length, 4);
    assert(sources.some((s) => s.label === privateFile && s.editable));
    assert(sources.some((s) => s.label === "AGENTS.md" && !s.editable));
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.rmSync(privateDir, { recursive: true, force: true });
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
  assert(seen.args.includes("Authorization: Bearer network-secret-placeholder"));
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
    const result = router.run({
      argv: ["flash", "high", "read", "--task-file", p.task, "--file", privateFile],
      cwd: p.root,
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
    calls.push({ bin, args, options });
    return { status: 0, stdout: raw, stderr: "", error: null };
  };
  try {
    const result = router.run({
      argv: ["pro", "high", "read", "--task-file", p.task, "--file", privateFile],
      cwd: p.root,
      env: { DEEPSEEK_API_KEY: "placeholder" },
      spawnSync: fakeSpawn,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].bin, "curl");
    const request = JSON.parse(calls[0].options.input);
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
    calls.push({ bin, args, options });
    return { status: 0, stdout: raw, stderr: "", error: null };
  };
  try {
    const result = router.run({
      argv: ["flash", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root,
      env: { DEEPSEEK_API_KEY: "placeholder" },
      spawnSync: fakeSpawn,
    });

    assert.equal(calls.length, 1, "genau ein curl");
    assert.equal(calls[0].bin, "curl");
    const request = JSON.parse(calls[0].options.input);
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

check("Write Modus wendet nur hashgebundene explizite Repository Datei an", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const original = fs.readFileSync(target, "utf8");
  try {
    const result = router.run({
      argv: ["pro", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root,
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
    assert.throws(() => router.run({
      argv: ["pro", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root,
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
    assert.throws(() => router.run({
      argv: ["pro", "high", "write", "--task-file", p.task, "--file", outside],
      cwd: p.root,
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

check("Hash Drift vor Anwendung stoppt ohne Schreiben", () => {
  const p = project();
  const target = path.join(p.root, "lib/example.js");
  const original = fs.readFileSync(target, "utf8");
  try {
    assert.throws(() => router.run({
      argv: ["pro", "high", "write", "--task-file", p.task, "--file", "lib/example.js"],
      cwd: p.root,
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
    assert.throws(() => router.run({
      argv: ["flash", "high", "read", "--task-file", p.task],
      cwd: p.root,
      env: {},
      callDeepSeek: () => {
        throw new Error("darf nicht starten");
      },
    }), /DEEPSEEK_API_KEY-fehlt/);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

console.log(`DeepSeek Cloud Router v2: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
