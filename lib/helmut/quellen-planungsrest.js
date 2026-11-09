"use strict";

// Unveraenderlicher Tagesplan und monotoner Enqueue-Cursor im vorhandenen Store.
// Kein eigener Scheduler, keine zweite Queue und kein Upsert. Nach jedem unbekannten
// Schreibausgang entscheidet ausschliesslich die bestaetigte erneute Lesung.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const MAX_BYTES = 1024 * 1024;
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
function digest(v) { return crypto.createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex"); }
function tagOk(tag) {
  return typeof tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tag)
    && Number.isFinite(Date.parse(tag)) && new Date(tag).toISOString().slice(0, 10) === tag;
}
function pruefe(tag, data) {
  if (!tagOk(tag) || !data || !isDeepStrictEqual(Object.keys(data).sort(),
    ["auftraege", "cursor", "manifestHash", "tag", "tagesplan", "version", "zustand"].sort())
    || data.version !== 1 || data.tag !== tag || !Array.isArray(data.auftraege)
    || data.auftraege.some(j => !j || typeof j !== "object" || Array.isArray(j)
      || typeof j.idempotencyKey !== "string" || !j.idempotencyKey)
    || new Set(data.auftraege.map(j => j.idempotencyKey)).size !== data.auftraege.length
    || !Number.isSafeInteger(data.cursor) || data.cursor < 0 || data.cursor > data.auftraege.length
    || data.zustand !== (data.cursor === data.auftraege.length ? "fertig" : "offen")
    || data.manifestHash !== digest([tag, data.auftraege, data.tagesplan])
    || Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw Error("planungsrest-stand-ungueltig");
  return structuredClone(data);
}
function erzeugePlanungsrest({ request, storeId }) {
  if (typeof request !== "function" || typeof storeId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId)
    || storeId.includes("-p-")) throw Error("planungsrest-konfiguration");
  const prefix = storeId + "-quellenplan-";
  const id = tag => { if (!tagOk(tag)) throw Error("planungsrest-tag"); return prefix + tag; };
  async function lesen(tag) {
    const rowId = id(tag), rows = await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&select=id,data`);
    if (!Array.isArray(rows) || rows.length > 1 || (rows.length && rows[0]?.id !== rowId)) throw Error("planungsrest-leseantwort");
    return rows.length ? pruefe(tag, rows[0].data) : null;
  }
  return {
    lesen,
    async offene({ bisTag, limit = 7 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 31) throw Error("planungsrest-leselimit");
      const rows = await request(`/rest/v1/helmut_store?id=like.${encodeURIComponent(prefix)}*`
        + `&id=lte.${encodeURIComponent(id(bisTag))}&data-%3E%3Ezustand=eq.offen&order=id.asc&limit=${limit + 1}&select=id,data`);
      if (!Array.isArray(rows) || rows.length > limit + 1) throw Error("planungsrest-leseantwort");
      const plaene = rows.map(r => {
        const d = pruefe(r?.data?.tag, r?.data);
        if (r.id !== id(d.tag) || d.tag > bisTag || d.zustand !== "offen") throw Error("planungsrest-leseantwort");
        return d;
      });
      if (new Set(plaene.map(p => p.tag)).size !== plaene.length) throw Error("planungsrest-leseantwort");
      return { plaene: plaene.slice(0, limit), weitereVorhanden: plaene.length > limit };
    },
    async sichereManifest(tag, { auftraege, tagesplan = null }) {
      const rowId = id(tag), existing = await lesen(tag);
      if (existing) return existing; // Der erste bestaetigte Tagesplan bleibt verbindlich.
      const data = structuredClone({ version: 1, tag, auftraege, tagesplan, cursor: 0,
        manifestHash: digest([tag, auftraege, tagesplan]), zustand: auftraege?.length ? "offen" : "fertig" });
      pruefe(tag, data);
      // Cursorwachstum darf den maximalen Speichervertrag spaeter nicht sprengen.
      if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES - 32) throw Error("planungsrest-manifest-zu-gross");
      try {
        await request("/rest/v1/helmut_store?select=id", { method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id: rowId, data }) });
      } catch { /* Readback entscheidet auch bei konkurrierendem ersten Schreiber. */ }
      const known = await lesen(tag);
      if (!known) throw Error("planungsrest-manifest-unbestaetigt");
      return known;
    },
    async bewegeCursor(tag, vorwert, nextCursor) {
      const old = pruefe(tag, vorwert);
      if (nextCursor !== old.cursor + 1 || nextCursor > old.auftraege.length) throw Error("planungsrest-cursor-sprung");
      try {
        // Der volle exakte Vorwert gehoert in den Body, nicht in die URL.
        // Der service-only RPC prueft +1 atomar und aendert nur Cursor/Zustand.
        await request("/rest/v1/rpc/helmut_quellenplan_cursor_cas", { method: "POST",
          body: JSON.stringify({ p_id: id(tag), p_expected: JSON.stringify(old), p_next_cursor: nextCursor }) });
      } catch { /* Weder ein Timeout noch eine positive Schreibantwort beweist den Fortschritt. */ }
      const known = await lesen(tag);
      if (!known || known.manifestHash !== old.manifestHash || known.cursor < nextCursor)
        throw Error("planungsrest-fortschritt-unbestaetigt");
      return known;
    }
  };
}
module.exports = { MAX_BYTES, erzeugePlanungsrest };
