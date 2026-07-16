"use strict";

// P1-4 — Begrenzte Recovery fehlgeschlagener Wissensobjekte (bounded Auto-Retry).
// ============================================================================
// Fehlgeschlagene KOs (understanding_status='failed') wurden bisher NIE automatisch
// erneut versucht (Audit R6): nach einem KI-Fehlertag blieben Vorgänge dauerhaft
// unsichtbar. Diese Recovery setzt sie BEGRENZT (Zähler) auf 'pending' zurück, sodass
// der nächste Understanding-Lauf sie erneut versteht — bis 'complete' ODER, nach
// erschöpften Retries, 'failed-final' (terminal, nie wieder). KEIN Endlos-Retry.
//
// FREIGABEPFLICHTIG: schreibt auf Production-KOs (PATCH). Default AUS
// (HELMUT_FAILED_KO_RECOVERY) — ohne Flag ein reiner No-Op. Der Retry-Zähler lebt
// im kleinen Auth-Store (keine Schema-Migration). Reine Orchestrierung; alle I/O
// per deps injizierbar (offline testbar).

function recoveryEnabled(env = process.env) {
  const v = String((env && env.HELMUT_FAILED_KO_RECOVERY) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// deps: { listFailed(limit), resetToPending(vorgangId), markTerminal(vorgangId),
//         readRetries(), writeRetries(map), enabled(), maxRetries, limit }
async function recoverFailedUnderstanding(deps = {}) {
  const enabled = deps.enabled || recoveryEnabled;
  if (!enabled()) return { skipped: true, reason: "disabled", retried: 0, terminal: 0 };

  const maxRetries = Number.isFinite(deps.maxRetries) ? deps.maxRetries : Number(process.env.HELMUT_FAILED_KO_MAX_RETRIES) || 2;
  const limit = Number.isFinite(deps.limit) ? deps.limit : 50;

  const listFailed = deps.listFailed;
  const resetToPending = deps.resetToPending;
  const markTerminal = deps.markTerminal;
  const readRetries = deps.readRetries;
  const writeRetries = deps.writeRetries;
  if (typeof listFailed !== "function" || typeof resetToPending !== "function" || typeof markTerminal !== "function") {
    return { skipped: true, reason: "no-io", retried: 0, terminal: 0 };
  }

  const failed = (await listFailed(limit)) || [];
  if (!failed.length) return { checked: 0, retried: 0, terminal: 0 };

  const retries = (readRetries ? (await readRetries()) : {}) || {};
  let retried = 0;
  let terminal = 0;

  for (const ko of failed) {
    const vorgangId = ko && ko.vorgang_id;
    if (!vorgangId) continue;
    const count = Number(retries[vorgangId] || 0);
    if (count < maxRetries) {
      try {
        await resetToPending(vorgangId);
        retries[vorgangId] = count + 1;
        retried += 1;
      } catch (_) { /* fail-safe: ein einzelner Vorgang darf den Lauf nie abbrechen */ }
    } else {
      try {
        await markTerminal(vorgangId);
        delete retries[vorgangId]; // Zähler aufräumen (Vorgang ist terminal)
        terminal += 1;
      } catch (_) { /* fail-safe */ }
    }
  }

  if (writeRetries) { try { await writeRetries(retries); } catch (_) { /* fail-safe */ } }

  return { checked: failed.length, retried, terminal, maxRetries };
}

module.exports = { recoveryEnabled, recoverFailedUnderstanding };
