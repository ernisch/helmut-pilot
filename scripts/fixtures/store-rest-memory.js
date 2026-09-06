"use strict";

// Kleiner PostgREST Ersatz fuer bestehende Speichertests. Die Datenbankpruefung
// mit echtem PostgreSQL bleibt davon unabhaengig.
module.exports = function storeResponse(rows, input, options = {}) {
  const params = new URL(input).searchParams;
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  const id = body?.id || params.get("id")?.replace(/^eq\./, "");
  if (method === "GET") return { status: 200, body: rows.has(id) ? [{ data: rows.get(id) }] : [] };
  const prefer = String(options.headers?.Prefer || options.headers?.prefer || "");
  if (method === "POST") {
    if (rows.has(id) && !prefer.includes("resolution=merge-duplicates")) return { status: 409, body: { code: "23505" } };
  } else if (method === "PATCH") {
    if (!rows.has(id)) return { status: 200, body: [] };
    for (const field of ["_storeRevision", "_authStoreRevision", "rev"]) {
      const expected = params.get(`data->>${field}`);
      if (expected === null) continue;
      const current = rows.get(id)[field] ?? null;
      if (expected === "is.null" ? current !== null : expected !== `eq.${current}`) return { status: 200, body: [] };
    }
  } else throw new Error(`Nicht implementierter Speichertestaufruf: ${method}`);
  rows.set(id, JSON.parse(JSON.stringify(body.data)));
  return prefer.includes("return=minimal") ? { status: 204, body: null } : { status: 200, body: [{ id }] };
};
