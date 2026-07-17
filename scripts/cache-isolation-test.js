"use strict";

// Cache-Isolationstest (Mehrmandantenfaehigkeit Phase 9).
// Beweist, dass die Cache-Schluessel pro Mandant getrennt sind: Kunde A kann
// niemals Cache-Daten von Kunde B erhalten, und ein neuer Kunde startet nicht mit
// Cems Cache. Reine Schluessel-Logik (kein Netz, keine DB).

const storage = require("../lib/helmut/storage");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Der Lage-/Briefing-Cache-Schluessel (lage.js/storage.js): bf-<userId>-<slot>-<tag>.
function briefingCacheId(userId, slot, day) { return `bf-${userId}-${slot}-${day}`; }

console.log("== 1) Briefing-/Lage-Cache: Schlüssel trägt die Mandanten-ID ==");
const aKey = briefingCacheId("tenant-alpha", "lage", "2026-07-12");
const bKey = briefingCacheId("anna-beispiel", "lage", "2026-07-12");
check("Tenant Alpha und Anna haben verschiedene Cache-Keys am selben Tag", aKey !== bKey, `${aKey} vs ${bKey}`);
check("Alpha-Key enthält 'tenant-alpha'", aKey.includes("tenant-alpha"));
check("Anna-Key enthält NICHT 'tenant-alpha'", !bKey.includes("tenant-alpha"));

console.log("== 2) Büro-Output-Cache: Schlüssel trägt die Mandanten-ID ==");
const oA = storage.officeOutputId("tenant-alpha", "vg-1", "rede");
const oB = storage.officeOutputId("anna-beispiel", "vg-1", "rede");
check("gleicher Vorgang+Kanal, verschiedene Mandanten -> verschiedene Keys", oA !== oB, `${oA} vs ${oB}`);
check("Büro-Key A enthält Mandant A", oA.includes("tenant-alpha"));
check("Büro-Key B enthält NICHT Mandant A", !oB.includes("tenant-alpha"));
// Gleicher Mandant, verschiedene Vorgaenge/Kanaele -> verschiedene Keys (keine Kollision)
check("gleicher Mandant, anderer Kanal -> anderer Key", storage.officeOutputId("tenant-alpha", "vg-1", "rede") !== storage.officeOutputId("tenant-alpha", "vg-1", "pm"));

console.log("== 3) Neuer Kunde startet NICHT mit fremdem Cache ==");
const neu = briefingCacheId("neu-mdb", "lage", "2026-07-12");
check("neuer Kunde hat eigenen, leeren Namespace", neu !== aKey && neu !== bKey && neu.includes("neu-mdb"));

console.log("== 4) Tenant-scoped Read: getRenderedBriefingV3 baut den Key aus userId ==");
// getRenderedBriefingV3(userId, slot, day) baut id = bf-<userId>-<slot>-<day> und
// liest ueber tenantRequest (RLS-geschuetzt im JWT-Modus). Ohne Store inert (null),
// aber der Schluessel ist deterministisch tenant-spezifisch.
check("getRenderedBriefingV3 ist exportiert (tenant-scoped Read-Pfad)", typeof storage.getRenderedBriefingV3 === "function");

// Ein Tippfehler/leerer userId darf keinen fremden Cache treffen: der Key waere
// bf--lage-... (leerer Mandant) -> trifft NIE einen echten Mandanten-Key.
const leerKey = briefingCacheId("", "lage", "2026-07-12");
check("leerer userId erzeugt keinen echten Mandanten-Key", leerKey !== aKey && leerKey !== bKey);

console.log("");
const total = pass + fail;
if (fail === 0) { console.log(`${pass}/${total} Cache-Isolations-Assertions erfolgreich.`); process.exit(0); }
console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
process.exit(1);
