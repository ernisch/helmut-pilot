"use strict";

const { randomUUID } = require("node:crypto");

// Das Symbol bleibt bei {...store} erhalten, wird aber nie als JSON verschickt.
// Jede Kopie behaelt IHREN unveraenderlichen Lesestand. Eine gemeinsame mutable
// Marke wuerde einen alten Schreiber nach dem Schreiben seiner Kopie legitimieren.
const SNAPSHOT = Symbol("auth-store-snapshot");
const REVISION = "_authStoreRevision";

function conflict() {
  const error = new Error("Kontenspeicher wurde parallel geaendert. Bitte erneut versuchen.");
  error.code = "AUTH_STORE_CONFLICT";
  error.statusCode = 409;
  return error;
}

function attachSnapshot(store, { exists, revision, target }) {
  if (revision != null && (typeof revision !== "string" || !/^[a-f0-9-]{36}$/i.test(revision))) {
    throw new Error("Ungueltige Version des Kontenspeichers");
  }
  Object.defineProperty(store, SNAPSHOT, {
    value: Object.freeze({ exists, revision: revision ?? null, target }),
    enumerable: true
  });
  return store;
}

async function writeConditional(store, { request, rowId, target }) {
  const snapshot = store[SNAPSHOT];
  if (!snapshot || snapshot.target !== target) {
    const error = new Error("Kontenspeicher hat keinen gueltigen Lesestand. Bitte neu laden.");
    error.code = "AUTH_STORE_SNAPSHOT_MISSING";
    error.statusCode = 409;
    throw error;
  }
  const revision = randomUUID();
  // Symbol bewusst nicht weiterkopieren: die Rueckgabe bekommt erst nach dem
  // erfolgreichen Schreiben eine NEUE Grundlinie. Das Original bleibt veraltet.
  const data = { ...store, [REVISION]: revision };
  delete data[SNAPSHOT];
  let rows;
  if (!snapshot.exists) {
    try {
      rows = await request("/rest/v1/helmut_store?select=id", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: rowId, data })
      });
    } catch (error) {
      if (/\b409\b/.test(String(error && error.message))) throw conflict();
      throw error;
    }
  } else {
    const condition = snapshot.revision === null
      ? "data-%3E%3E_authStoreRevision=is.null"
      : `data-%3E%3E_authStoreRevision=eq.${encodeURIComponent(snapshot.revision)}`;
    rows = await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&${condition}&select=id`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data })
    });
    if (Array.isArray(rows) && rows.length === 0) throw conflict();
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== rowId) {
    throw new Error("Schreiben des Kontenspeichers wurde nicht eindeutig bestaetigt");
  }
  return attachSnapshot(data, { exists: true, revision, target });
}

module.exports = { REVISION, attachSnapshot, writeConditional };
