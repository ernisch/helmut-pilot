"use strict";

// Reiner Speicheradapter ohne Abhaengigkeit vom Abruf oder von Nutzerpfaden.
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

// Eigene globale helmut_store Zeile je Dokument, Quellenstand und Verfahren.
// Kein Upsert, kein Blob Cache, keine lokale Ausweichablage, keine Retry Schleife.
// Auch bei verlorener Schreibantwort entscheidet ausschliesslich das Neu Lesen.
function erzeugeBelegspeicher({ request, storeId }) {
  if (typeof request !== "function" || typeof storeId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId)
    || storeId.includes("-p-")) throw new Error("artikelkontext-speicher-konfiguration");
  function id(key) {
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("artikelkontext-speicher-schluessel");
    return storeId + "-artikelkontext-" + key;
  }
  return {
    async lesen(key) {
      const rowId = id(key);
      const rows = await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&select=id,data`);
      if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (rows[0].id !== rowId
        || !rows[0].data || typeof rows[0].data !== "object" || Array.isArray(rows[0].data)))) throw new Error("artikelkontext-speicher-leseantwort");
      return rows.length ? rows[0].data : null;
    },
    async reservieren(key, data) {
      if (data?.zustand !== "reserviert" || data.schluessel !== key || !uuid(data.versuchId)) throw new Error("artikelkontext-reservierung");
      await request("/rest/v1/helmut_store?select=id", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: id(key), data }) });
    },
    async abschliessen(key, versuchId, data) {
      if (!uuid(versuchId) || data?.versuchId !== versuchId || data.schluessel !== key
        || !["belegt", "luecke"].includes(data.zustand)) throw new Error("artikelkontext-abschluss");
      await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(id(key))}`
        + `&data-%3E%3EversuchId=eq.${versuchId}&data-%3E%3Ezustand=eq.reserviert&select=id`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data }) });
    }
  };
}

module.exports = { erzeugeBelegspeicher, uuid };
