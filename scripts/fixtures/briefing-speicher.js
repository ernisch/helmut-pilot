"use strict";
// Echter Materialisierer mit ausschliesslich lokalem, mandatsgebundenem Speicher.
function materialisierer() {
  const rows = new Map();
  const storage = {
    assertTenant: require("../../lib/helmut/storage").assertTenant,
    getRenderedBriefingV3: async (id, slot, day) => structuredClone(rows.get(`bf-${id}-${slot}-${day}`) || null),
    insertRenderedBriefingV3: async entry => {
      if (rows.has(entry.id)) return { saved: false, reason: "existing-result" };
      rows.set(entry.id, structuredClone(entry)); return { saved: true };
    }
  };
  return args => require("../../lib/helmut/briefing-speicher").materialisiere({ ...args, storage });
}
module.exports = { materialisierer };
