"use strict";

// Einmaliger B055-Start. Niemals upserten: diese ID bleibt auch nach einem
// unbekannten Ausgang gesperrt, unabhaengig von Tag, Commit oder Workflow-ID.
async function insert(entry = {}, deps = {}) {
  const storage = deps.storage || require("./storage");
  const E = require("./b055-einzelabschluss"), p = entry.payload;
  const userId = storage.assertTenant(entry.user_id, "insertB055Einzelstart");
  if (userId !== E.MANDAT || entry.id !== (p?.version === 3 ? E.START_REDAKTION : p?.version === 2 ? E.START_NEU : E.START_ID) || entry.slot !== E.SLOT
    || ![1, 2, 3].includes(p?.version) || !/^[a-f0-9]{64}$/.test(p.commandHash || "")
    || !/^[a-f0-9]{40}$/.test(p.productionCommit || "") || !/^nachlauf500-[0-9]{5,20}$/.test(p.runId || "")
    || p.maxModellaufrufe !== 2 || p.maxMicroUsd !== E.MAX_MICRO_USD || p.automatischeWiederholung !== false
    || !Number.isFinite(Date.parse(entry.generated_at))
    || require("./briefing-frische").berlinTagKey(new Date(entry.generated_at)) !== p.tag)
    throw new Error("einzelstart-zeile-ungueltig");
  if (p.version >= 2 && (!p.vorgaenger || !/^[a-f0-9]{64}$/.test(p.vorgaenger.startHash || "")))
    throw new Error("einzelstart-vorgaenger-fehlt");
  if (!(deps.bereit === undefined ? storage.v3StoreReady() : deps.bereit === true)) throw new Error("einzelstart-speicher-nicht-bereit");
  const request = deps.request || ((url, options) => storage.tenantRequest(url, userId, options));
  const rows = await request(`/rest/v1/briefings?on_conflict=id&user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(entry)
  });
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("einzelstart-quittung-ungueltig");
  if (!rows.length) return { saved: false, reason: "existing-result" };
  const r = rows[0];
  if (r.user_id !== userId || r.id !== entry.id || r.slot !== entry.slot
    || Date.parse(r.generated_at) !== Date.parse(entry.generated_at)
    || !require("node:util").isDeepStrictEqual(r.payload, entry.payload)) throw new Error("einzelstart-quittung-abweichend");
  return { saved: true, id: entry.id };
}

module.exports = { insert };
