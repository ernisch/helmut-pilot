"use strict";

// H1-Regression (Review-Fix): /api/privacy/delete + /api/privacy/export dürfen
// im Account-Modus NUR vom Mandatsinhaber (abgeordneter mit diesem politicianId)
// oder einem Admin ausgeführt werden. Ein zugewiesener REFERENT darf NICHT — sonst
// könnte er via Auth-Löschkaskade das Konto des MdB entfernen und ihn aussperren.
// Treibt den ECHTEN In-Process-Handler über HTTP (kein Netz nach außen, lokaler
// Datei-Store mit Snapshot/Restore). Es wird NICHTS real gelöscht: der 403 fällt
// VOR deleteProfileData.

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// Store-Hermetik.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json", "p-mdb-h1.json"];
const snap = new Map(GUARDED.map((n) => [n, fs.existsSync(path.join(dataDir, n)) ? fs.readFileSync(path.join(dataDir, n)) : null]));
process.on("exit", () => {
  for (const [n, c] of snap) {
    const f = path.join(dataDir, n);
    try { if (c === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, c); } catch (_) {}
  }
});

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function req(server, { method = "GET", pathname, headers = {}, body = null }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    if (body != null) r.write(body);
    r.end();
  });
}

async function login(server, email, password) {
  const body = JSON.stringify({ email, password });
  const res = await req(server, { method: "POST", pathname: "/api/auth/login", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body });
  const cookie = ((res.headers["set-cookie"] || [])[0] || "").split(";")[0];
  return { status: res.status, cookie };
}

(async () => {
  // Fixtures (idempotent).
  await accounts.deleteAuthDataForPolitician("mdb-h1").catch(() => {});
  await accounts.createUser({ email: "mdb-h1@test.local", name: "MdB H1", role: "abgeordneter", password: "mdb-h1-pass-123", politicianId: "mdb-h1" });
  await accounts.createUser({ email: "ref-h1@test.local", name: "Ref H1", role: "referent", password: "ref-h1-pass-123" });
  const refUser = await accounts.getUserByEmailRaw("ref-h1@test.local");
  const mdb = await accounts.getUserByEmailRaw("mdb-h1@test.local");
  await accounts.addAssignment(refUser.id, "mdb-h1"); // Referent dem Mandat zuweisen

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    // 1) Referent (dem Mandat zugewiesen) -> DELETE muss 403 sein, kein Löschen.
    const ref = await login(server, "ref-h1@test.local", "ref-h1-pass-123");
    check("Referent-Login liefert Session", ref.status === 200 && Boolean(ref.cookie));
    // CSRF-Token ist nur mit Session beziehbar (der /api/-Gate blockt anonym).
    const csrf = JSON.parse((await req(server, { pathname: "/api/security/csrf", headers: { Cookie: ref.cookie } })).body).token;
    check("CSRF-Token beziehbar (mit Session)", Boolean(csrf));
    const delBody = JSON.stringify({ confirm: "DELETE" });
    const refDel = await req(server, {
      method: "POST", pathname: "/api/privacy/delete?politicianId=mdb-h1",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(delBody), "x-csrf-token": csrf, Cookie: ref.cookie }, body: delBody
    });
    check("Referent darf Mandat NICHT löschen -> 403 privacy-delete-forbidden",
      refDel.status === 403 && /privacy-delete-forbidden/.test(refDel.body), `status=${refDel.status} body=${refDel.body.slice(0, 90)}`);
    const refExp = await req(server, { pathname: "/api/privacy/export?politicianId=mdb-h1", headers: { Cookie: ref.cookie } });
    check("Referent darf Mandat NICHT exportieren -> 403",
      refExp.status === 403 && /privacy-export-forbidden/.test(refExp.body), `status=${refExp.status}`);

    // 2) MdB-Konto existiert nach dem Referent-Versuch weiterhin (nichts gelöscht).
    const mdbStill = await accounts.getUserByEmailRaw("mdb-h1@test.local");
    check("MdB-Konto nach Referent-Löschversuch UNVERSEHRT", Boolean(mdbStill && mdbStill.id === mdb.id));

    // 3) Mandatsinhaber selbst wird vom Rollen-Gate NICHT blockiert (403 kommt nicht
    //    vom Gate). Wir prüfen nur, dass der Owner das Gate passiert — die eigentliche
    //    Löschung läuft ohne Supabase in den Blob-Pfad; um echtes Löschen zu vermeiden,
    //    senden wir OHNE confirm -> erwartet 400 (Gate passiert, Löschung nicht ausgeführt).
    const owner = await login(server, "mdb-h1@test.local", "mdb-h1-pass-123");
    const ownerNoConfirm = await req(server, {
      method: "POST", pathname: "/api/privacy/delete?politicianId=mdb-h1",
      headers: { "Content-Type": "application/json", "Content-Length": 2, "x-csrf-token": csrf, Cookie: owner.cookie }, body: "{}"
    });
    check("Mandatsinhaber passiert das Rollen-Gate (kein 403; 400 mangels confirm)",
      ownerNoConfirm.status === 400, `status=${ownerNoConfirm.status}`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
