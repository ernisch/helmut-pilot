"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createHmac } = require("node:crypto");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";

function readConfig(file) {
  assert(file, "A local fixture configuration file is required");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.match(config.database, /^helmut_usage_split_[a-z0-9_]+$/);
  const url = new URL(config.apiBase);
  assert.equal(url.protocol, "http:");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Loopback HTTP only");
  assert(!url.username && !url.password && !url.search && !url.hash);
  assert(typeof config.jwtSecret === "string" && config.jwtSecret.length >= 32);
  return config;
}
function sqlClient(config) {
  const command = config.sqlCommand || ["docker", "exec", "-i", config.containerName,
    "psql", "-U", "postgres", "-d", config.database, "-tA", "-v", "ON_ERROR_STOP=1"];
  assert(Array.isArray(command) && command.length > 0 && command.every(x => typeof x === "string"));
  // This command is an explicit local fixture selector, never evaluated by a shell.
  assert(command[0] === "psql" || (command[0] === "docker" && command[1] === "exec"));
  function sql(text, { allowFailure = false } = {}) {
    const result = spawnSync(command[0], command.slice(1), { input: text, encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
    if (result.error) throw result.error;
    if (result.status !== 0 && !allowFailure) {
      const error = new Error(`Local SQL failed: ${String(result.stderr).slice(0, 800)}`);
      error.code = "COMPONENT_SQL_FAILED";
      throw error;
    }
    return { output: result.stdout.trim(), error: result.stderr.trim(), status: result.status };
  }
  sql.json = text => JSON.parse(sql(text).output);
  return sql;
}
function token(config, role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", config.jwtSecret).update(unsigned).digest("base64url")}`;
}
function requester(config, role = "service_role", stats = { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0 }) {
  const base = new URL(config.apiBase), bearer = token(config, role);
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const body = options.body || "", routeWithoutPrefix = route.replace(/^\/rest\/v1/, "");
    const req = http.request({ protocol: "http:", hostname: base.hostname, port: base.port,
      path: base.pathname.replace(/\/$/, "") + routeWithoutPrefix,
      method: options.method || "GET", headers: { Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json", ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...options.headers } }, res => {
      const chunks = [];res.on("data", value => chunks.push(value));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);stats.responseBodyBytes += raw.length;
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`Local REST ${res.statusCode}: ${raw.toString("utf8").slice(0, 700)}`);
          error.statusCode = res.statusCode;return reject(error);
        }
        try { resolve(raw.length ? JSON.parse(raw) : null); } catch (error) { reject(error); }
      });
    });
    stats.requests++;stats.requestBodyBytes += Buffer.byteLength(body);
    req.setTimeout(30000, () => req.destroy(new Error("Local component request timeout")));
    req.on("error", reject);req.end(body);
  });
  request.stats = stats;return request;
}
const rpc = (request, name, body) => request(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
function createFixtureTables(sql) {
  sql(`CREATE TABLE public.helmut_store(id text PRIMARY KEY,data jsonb NOT NULL);
    CREATE TABLE public.llm_usage(id text PRIMARY KEY,created_at timestamptz NOT NULL,
      tenant_id text,profile_id text,run_id text,pipeline_step text,politician_id text,user_id text,
      model text,call_type text,prompt_tokens integer,completion_tokens integer,total_tokens integer,
      estimated_cost numeric,duration_ms integer,success boolean,error text,kein_aufruf boolean NOT NULL DEFAULT false,
      source_id text,package_id text,vorgang_id text,knowledge_object_id text);
    GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
    REVOKE ALL ON public.helmut_store,public.llm_usage FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE ON public.helmut_store TO service_role;
    GRANT SELECT,INSERT ON public.llm_usage TO service_role;
    ALTER TABLE public.helmut_store ENABLE ROW LEVEL SECURITY;
    CREATE POLICY component_store_service ON public.helmut_store TO service_role USING(true) WITH CHECK(true);
    CREATE POLICY component_usage_service ON public.llm_usage TO service_role USING(true) WITH CHECK(true);`);
}
function installProposal(sql) { sql(fs.readFileSync(path.join(ROOT, "supabase/proposals/auth_usage_atomic_local.sql"), "utf8")); }
function seed(sql, id, data) { sql(`INSERT INTO public.helmut_store(id,data) VALUES(${literal(id)},${literal(JSON.stringify(data))}::jsonb);`); }
function bootstrap(sql, id) {
  return sql.json(`SELECT public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id',${literal(id)},
    'expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex'))) FROM public.helmut_store WHERE id=${literal(id)};`);
}
function witness(sql, id) {
  return sql.json(`SELECT jsonb_build_object('data',data,'usageRows',(SELECT count(*) FROM public.llm_usage WHERE usage_store_id=${literal(id)}))
    FROM public.helmut_store WHERE id=${literal(id)};`);
}
function kernel() {
  const number = file => { try { return Number(fs.readFileSync(`/sys/fs/cgroup/${file}`, "utf8").trim()); } catch { return null; } };
  let cpu = null;try { cpu = Object.fromEntries(fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf8").trim().split("\n").map(x => { const [k,v] = x.split(/\s+/);return [k, Number(v)]; })); } catch {}
  return { currentBytes: number("memory.current"), lifetimePeakBytes: number("memory.peak"), cpu,
    measurementScope: "Caller cgroup; common process coverage must be established by the launcher" };
}
module.exports = { ROOT, literal, readConfig, sqlClient, token, requester, rpc, createFixtureTables, installProposal, seed, bootstrap, witness, kernel };
