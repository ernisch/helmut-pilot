"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const router = require("./deepseek-cloud-router");

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

check("Modellnamen sind aktuell und explizit", () => {
  assert.equal(router.MODELS.flash, "deepseek-flash");
  assert.equal(router.MODELS.pro, "deepseek-v4-pro");
});

check("Nur erlaubte Route wird akzeptiert", () => {
  const p = router.parseArgs(["flash", "high", "read", "--task-file", "/tmp/a"]);
  assert.equal(p.model, "deepseek-flash");
  assert.throws(
    () => router.parseArgs(["flash", "low", "read", "--task-file", "/tmp/a"]),
    /usage/
  );
  assert.throws(
    () => router.parseArgs(["pro", "max", "production", "--task-file", "/tmp/a"]),
    /usage/
  );
});

check("Umgebung reicht nur sichere Werte und DeepSeek Key weiter", () => {
  const env = router.sanitizeEnv({
    PATH: "/bin",
    HOME: "/home/test",
    DEEPSEEK_API_KEY: "secret-deepseek",
    OPENAI_API_KEY: "secret-openai",
    SUPABASE_SERVICE_ROLE_KEY: "secret-db",
    VERCEL_TOKEN: "secret-vercel",
    GITHUB_TOKEN: "secret-github",
    HTTPS_PROXY: "http://proxy.internal:3128",
    NO_PROXY: "localhost,127.0.0.1",
  }, "/tmp/codex-home");
  assert.equal(env.DEEPSEEK_API_KEY, "secret-deepseek");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.CODEX_HOME, "/tmp/codex-home");
  assert.equal(env.HOME, "/tmp/codex-home");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.VERCEL_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.HTTPS_PROXY, "http://proxy.internal:3128");
  assert.equal(env.NO_PROXY, "localhost,127.0.0.1");
});

check("Codex Argumente enthalten Provider aber niemals Keywert", () => {
  const args = router.buildCodexArgs({
    model: "deepseek-v4-pro",
    effort: "max",
    mode: "write",
    schemaFile: "/tmp/schema.json",
    resultFile: "/tmp/result.json",
    cwd: "/repo",
  });
  const joined = args.join(" ");
  assert(joined.includes("--ephemeral"));
  assert(joined.includes("deepseek-v4-pro"));
  assert(joined.includes("workspace-write"));
  assert(joined.includes('model_providers.deepseek.env_key="DEEPSEEK_API_KEY"'));
  assert(joined.includes('model_reasoning_effort="max"'));
  assert(joined.includes("request_max_retries=0"));
  assert(joined.includes("stream_max_retries=0"));
  assert(joined.includes("sandbox_workspace_write.network_access=false"));
  assert(joined.includes('shell_environment_policy.inherit="core"'));
  assert(joined.includes("shell_environment_policy.ignore_default_excludes=false"));
  assert(!joined.includes("secret-deepseek"));
});

check("Prompt verlangt knappe Rueckgabe und verbietet Production", () => {
  const prompt = router.buildPrompt("Pruefe Datei X.", {
    model: "deepseek-flash",
    effort: "high",
    mode: "write",
  });
  assert(prompt.includes("at most 2000 characters"));
  assert(prompt.includes("Do not commit, push, merge"));
  assert(prompt.includes("Do not summarize project history"));
  assert(prompt.includes("Pruefe Datei X."));
});

check("Kompakte gueltige Zusammenfassung wird akzeptiert", () => {
  const raw = JSON.stringify({
    status: "ok",
    result: ["Fix fertig"],
    files: [{ path: "a.js", note: "gezielt geaendert" }],
    tests: [{ name: "a-test", result: "3/3 gruen" }],
    risks: [],
    next: "Diff pruefen",
  });
  assert.deepEqual(router.validateSummary(raw).result, ["Fix fertig"]);
});

check("Zu lange oder unstrukturierte Rueckgabe wird fail closed abgelehnt", () => {
  assert.throws(() => router.validateSummary("x".repeat(router.MAX_RETURN_CHARS + 1)), /too-long/);
  assert.throws(() => router.validateSummary("kein json"), /not-json/);
});

check("Echter Wrapper gibt nur Endbilanz zurueck und isoliert Credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-router-test-"));
  const task = path.join(dir, "task.txt");
  fs.writeFileSync(task, "Pruefe nur den synthetischen Fall.", { mode: 0o600 });
  let gesehen = null;

  const fakeSpawn = (bin, args, options) => {
    const outIndex = args.indexOf("-o");
    assert(outIndex >= 0);
    const resultFile = args[outIndex + 1];
    gesehen = { bin, args, options };
    fs.writeFileSync(resultFile, JSON.stringify({
      status: "ok",
      result: ["erledigt"],
      files: [],
      tests: [],
      risks: [],
      next: "Orchestrator prueft",
    }), { mode: 0o600 });
    return { status: 0, stderr: "", error: null };
  };

  try {
    const result = router.run({
      argv: ["flash", "high", "read", "--task-file", task],
      env: {
        PATH: "/bin",
        HOME: "/tmp",
        DEEPSEEK_API_KEY: "ds-secret",
        OPENAI_API_KEY: "openai-secret",
        SUPABASE_SERVICE_ROLE_KEY: "db-secret",
      },
      cwd: "/repo",
      codexBin: "codex-test",
      spawnSync: fakeSpawn,
    });
    assert.equal(result.status, "ok");
    assert.equal(gesehen.bin, "codex-test");
    assert.equal(gesehen.options.env.DEEPSEEK_API_KEY, "ds-secret");
    assert.equal(gesehen.options.env.OPENAI_API_KEY, undefined);
    assert.equal(gesehen.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert(!gesehen.args.join(" ").includes("ds-secret"));
    assert(!gesehen.args.join(" ").includes("openai-secret"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check("Ohne DeepSeek Key startet kein Worker", () => {
  assert.throws(() => router.run({
    argv: ["flash", "high", "read", "--task-file", "/tmp/egal"],
    env: { PATH: "/bin" },
    spawnSync: () => {
      throw new Error("darf nicht starten");
    },
  }), /DEEPSEEK_API_KEY-fehlt/);
});

console.log(`DeepSeek Cloud Router: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
