"use strict";

// P1-7 — Meta-Heartbeat: prüft /api/cron/health-report?dryRun=1 (VORBEREITET).
// ============================================================================
// Zweiter, vom Health-Report-Versand UNABHÄNGIGER Kontrollpfad: fällt der
// Report-Cron selbst aus oder meldet er einen nicht-grünen Zustand, schlägt dieser
// Check fehl -> GitHub schickt eine Failure-Mail (unabhängiger Alarmkanal).
//
// dryRun=1 baut den kompletten Report OHNE zu versenden und OHNE systemError —
// gefahrlos prüfbar. Aktivierung (schedule in .github/workflows/health-watch.yml)
// ist FREIGABEPFLICHTIG; die Datei ist bewusst workflow_dispatch-only.
//
// Die Auswertung ist eine reine Funktion (offline getestet); der Netzaufruf ist
// injizierbar.

// Reine Auswertung der dryRun-Antwort. Liefert { ok, reason }.
function evaluateHealthDryRun(json) {
  if (!json || typeof json !== "object") return { ok: false, reason: "keine-antwort" };
  if (json.dryRun !== true) return { ok: false, reason: "kein-dryrun" };
  if (json.ok !== true) return { ok: false, reason: `report-nicht-gruen(${json.state || "unbekannt"})` };
  // Beide Kanäle unkonfiguriert bei grünem Report ist ein Vorbereitungsmangel,
  // aber kein Betriebsfehler -> nur Warnung, kein Fehlschlag.
  return { ok: true, reason: "gruen" };
}

async function run(deps = {}) {
  const baseUrl = String(deps.baseUrl || process.env.BASE_URL || "https://helmut-pilot.vercel.app").replace(/\/+$/, "");
  const cronSecret = deps.cronSecret || process.env.CRON_SECRET || "";
  const doFetch = deps.fetch || (typeof fetch === "function" ? fetch : null);
  if (!cronSecret) return { ok: false, reason: "cron-secret-fehlt", exitCode: 1 };
  if (!doFetch) return { ok: false, reason: "kein-fetch", exitCode: 1 };
  try {
    const res = await doFetch(`${baseUrl}/api/cron/health-report?dryRun=1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: deps.signal
    });
    if (!res || !res.ok) return { ok: false, reason: `http-${res ? res.status : "?"}`, exitCode: 1 };
    const json = await res.json();
    const verdict = evaluateHealthDryRun(json);
    return { ...verdict, exitCode: verdict.ok ? 0 : 1 };
  } catch (error) {
    return { ok: false, reason: `netzfehler:${error && error.message}`, exitCode: 1 };
  }
}

module.exports = { evaluateHealthDryRun, run };

if (require.main === module) {
  run().then((r) => {
    if (r.ok) console.log(`[health-watch] OK — ${r.reason}`);
    else console.error(`::error::[health-watch] FEHLER — ${r.reason}`);
    process.exit(r.exitCode);
  });
}
