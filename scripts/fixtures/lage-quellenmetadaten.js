"use strict";

// Dieselben eingefrorenen Quellen fuer beide reinen Lesenaehte verwenden.
// Keine erfundenen Zeitstempel und keine echten Speicherfunktionen aufrufen.
module.exports = (kos, getDocs) => async ids => (await Promise.all(
  (typeof kos === "function" ? await kos() : kos).filter(k => ids.includes(k.id)).map(async k =>
    (await getDocs(k.vorgang_id)).map(raw_documents => ({ knowledge_object_id: k.id, raw_documents })))
)).flat();
