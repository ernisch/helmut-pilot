"use strict";

// Sprint 6 · Read-Only-Schutzguard (Auftrag Phase 3 + Phase 9: Read-only-Garantie, keine Writes,
// Abbruch bei unsicherem Zugriff). REINE LOGIK, KEIN Produktionsread.

const fs = require("fs");
const path = require("path");
const guard = require("../lib/helmut/quellenarchitektur/production-read-guard");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function throwsRO(fn) { try { fn(); return false; } catch (e) { return e && e.name === "ReadOnlyViolation"; } }

// 1) Nur GET/HEAD ist read-only; jede Schreibmethode wird blockiert.
check("1 GET wird als read-only akzeptiert", guard.assertReadOnlyRequest({ method: "GET", endpoint: "/rest/v1/mandate_profiles?select=*" }) === true);
check("2 POST wird blockiert", throwsRO(() => guard.assertReadOnlyRequest({ method: "POST", endpoint: "/rest/v1/x" })));
check("3 PATCH wird blockiert", throwsRO(() => guard.assertReadOnlyRequest({ method: "PATCH", endpoint: "/rest/v1/x" })));
check("4 DELETE wird blockiert", throwsRO(() => guard.assertReadOnlyRequest({ method: "DELETE", endpoint: "/rest/v1/x" })));
check("5 Request mit Body wird blockiert (kein versteckter Write)", throwsRO(() => guard.assertReadOnlyRequest({ method: "GET", endpoint: "/x", body: {} })));
check("6 RPC-Endpoint wird blockiert (kann schreiben)", throwsRO(() => guard.assertReadOnlyRequest({ method: "GET", endpoint: "/rest/v1/rpc/helmut_reserve_llm_call" })));
check("7 on_conflict/Upsert-Endpoint wird blockiert", throwsRO(() => guard.assertReadOnlyRequest({ method: "GET", endpoint: "/rest/v1/x?on_conflict=id" })));

// 8) readOnlyRequest-Wrapper erzwingt GET auch bei method-Override und verwirft Body.
let sentMethod = null, sentBody = "sentinel";
const rawReq = async (endpoint, options) => { sentMethod = options.method; sentBody = options.body; return [{ ok: true }]; };
const guarded = guard.readOnlyRequest(rawReq);
(async () => {
  await guarded("/rest/v1/mandate_profiles?select=*", { method: "POST", body: { x: 1 } }).catch(() => {});
})();
// synchron: der Wrapper wirft VOR dem raw-Call bei POST -> rawReq nie erreicht.
check("8 Wrapper blockiert method-Override zu POST (raw-Request nie erreicht)", sentMethod === null);

// 9) readOnlyRepository: nur freigegebene Lese-Methoden aufrufbar; Writer werfen.
const repo = { listMandates: () => ["m"], secretUpsert: () => "WRITE" };
const ro = guard.readOnlyRepository(repo, ["listMandates"]);
check("9 freigegebene Lese-Methode ist aufrufbar", JSON.stringify(ro.listMandates()) === '["m"]');
check("10 nicht freigegebene (Schreib-)Methode wirft ReadOnlyViolation", throwsRO(() => ro.secretUpsert()));
check("11 Read-Only-Repository ist unveraenderlich (set wirft)", throwsRO(() => { ro.x = 1; }));
check("12 __readOnly-Marker gesetzt", ro.__readOnly === true);

// 13) Strukturbeweis: die BESTANDS-Request-Pfade sind schreibfaehig (duerfen NICHT direkt genutzt werden).
const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
const scan = guard.scanWriteCapability(storageSrc);
check("13 storage.js ist strukturell schreibfaehig (POST/PATCH/RPC vorhanden -> read-only-Wrapper Pflicht)",
  scan.writeCapable === true && scan.findings.some((f) => f.kind === "http-write"), JSON.stringify(scan.findings));

// 14) Ein rein lesender Modul-Quelltext wird NICHT als schreibfaehig markiert (kein Fehlalarm).
check("14 rein lesender Quelltext ist nicht schreibfaehig", guard.scanWriteCapability('const x = req("/y?select=*");').writeCapable === false);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Read-Only-Guard-Assertions`);
process.exit(failed > 0 ? 1 : 0);
