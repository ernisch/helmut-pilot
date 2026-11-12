"use strict";

// Unveraenderliche oeffentliche Artikelstaende in vorhandenen globalen Storezeilen.
// Kein Upsert, kein Hauptblob, keine eigene Queue und keine Mandatsdaten.
const crypto = require("node:crypto");
const kanonisch = value => Array.isArray(value) ? value.map(kanonisch)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, kanonisch(value[k])])) : value;
function standHash(row) {
  return crypto.createHash("sha256").update(JSON.stringify([
    row.id, row.url, row.canonical_url, row.title, row.summary ?? null,
    row.published_at && Number.isFinite(Date.parse(row.published_at)) ? new Date(row.published_at).toISOString() : row.published_at ?? null,
    row.source_name ?? null, kanonisch(row.raw ?? null)
  ])).digest("hex");
}
function erzeuge({ request, storeId }) {
  if (typeof request !== "function" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId || "") || storeId.includes("-p-")) throw Error("quellenstand-konfiguration");
  const key = (id, hash) => {
    if (!/^rd-[a-f0-9]{64}$/.test(id || "") || !/^[a-f0-9]{64}$/.test(hash || "")) throw Error("quellenstand-kennung");
    return `${storeId}-rohstand-${id.slice(3)}-${hash}`;
  };
  const lesen = async (id, hash) => {
    const rows = await request(`/rest/v1/helmut_store?id=eq.${key(id, hash)}&select=id,data`);
    if (!Array.isArray(rows) || rows.length > 1) throw Error("quellenstand-leseantwort");
    if (!rows.length) return null;
    const d = rows[0].data;
    if (rows[0].id !== key(id, hash) || d?.version !== 1 || d.dokument?.id !== id || d.quellenHash !== hash || standHash(d.dokument) !== hash)
      throw Error("quellenstand-bindung");
    return d.dokument;
  };
  return { lesen, async sichern(row) {
    const hash = standHash(row), id = key(row.id, hash);
    // JSON-Escaping kann einen zulaessigen 1-MiB-Originaltext bis zu sechsmal
    // vergroessern. Das Originallimit bleibt 1 MiB, die endliche Ablagehulle 8 MiB.
    if (Buffer.byteLength(String(row.summary || "")) > 1024 * 1024
      || Buffer.byteLength(JSON.stringify(row)) > 8 * 1024 * 1024) throw Error("quellenstand-zu-gross");
    if (!await lesen(row.id, hash)) {
      try { await request("/rest/v1/helmut_store?select=id", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id, data: { version: 1, quellenHash: hash, dokument: row } }) }); }
      catch { /* Ein verlorener Schreibausgang ist erst nach dem Neu-Lesen bekannt. */ }
    }
    if (!await lesen(row.id, hash)) throw Error("quellenstand-nicht-bestaetigt");
    return hash;
  } };
}
function normiereGebunden(item, staende) {
  const normal = require("./dedup").toRawDocumentRow(item);
  if (!staende || !Object.hasOwn(staende, item?.id)) return normal;
  if (!normal || normal.id !== item.id || standHash(item) !== staende[item.id]
    || (item.content_hash != null && item.content_hash !== normal.content_hash)) throw Error("quellenstand-eingabe-abweichend");
  // Aeltere Rohzeilen haben trotz gueltiger kanonischer Kennung keinen
  // content_hash. Der Dedupschritt wuerde diese Quellen vor der Restpruefung
  // vollstaendig entfernen. Nur den bereits durch die Kennung bestaetigten,
  // abgeleiteten Dedupwert ergaenzen; gebundene Texte/Metadaten nie normalisieren.
  return { ...structuredClone(item), content_hash: normal.content_hash };
}
module.exports = { standHash, erzeuge, normiereGebunden };
