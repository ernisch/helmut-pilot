"use strict";

// Eine Linkbindung ist Bestandssicherung, kein Beweis einer Modelllektuere.
// Der SQL-Leser prueft den gesamten Archivdigest im selben Snapshot wie Raw/Link.
const { createHash } = require("node:crypto");
const R = require("./roh-quellenstaende");
const FELD = "helmutQuellenfassung";
const { kanonisch } = require("./quellen-lektuerebeleg");
const digest = value => createHash("sha256").update(JSON.stringify(kanonisch(value))).digest("hex");
function pointer(id, stand, storeId = "main") {
  if (!/^rd-[a-f0-9]{64}$/.test(id || "") || !/^[a-f0-9]{64}$/.test(stand || "")
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId) || storeId.includes("-p-"))
    throw Error("ko-quellenfassung-kennung");
  return `${storeId}-rohstand-${id.slice(3)}-${stand}`;
}
function bindeArchiv(dokument, storeId = "main") {
  if (Object.hasOwn(dokument, FELD)) throw Error("ko-quellenfassung-archiv-metadaten");
  const data = { version: 1, quellenHash: R.standHash(dokument), dokument };
  return { ...dokument, [FELD]: { id: pointer(dokument.id, data.quellenHash, storeId), sha256: digest(data) } };
}
function link(koId, dokument) {
  const row = { knowledge_object_id: koId, raw_document_id: dokument.id };
  if (!Object.hasOwn(dokument, FELD)) return row;
  const b = dokument[FELD];
  if (!b || Object.keys(b).sort().join() !== "id,sha256" || !/^[a-f0-9]{64}$/.test(b.sha256 || ""))
    throw Error("ko-quellenfassung-bindung");
  const treffer = /^([a-zA-Z0-9_-]{1,100})-rohstand-([a-f0-9]{64})-([a-f0-9]{64})$/.exec(b.id || "");
  if (!treffer || b.id !== pointer(dokument.id, treffer[3], treffer[1])) throw Error("ko-quellenfassung-bindung");
  return { ...row, raw_source_version_id: b.id, raw_source_version_sha256: b.sha256 };
}
function quelle(row) {
  const d = row?.raw_documents;
  if (!d) throw Error("ko-quellenfassung-dokument-fehlt");
  const id = row.raw_source_version_id, sha256 = row.raw_source_version_sha256;
  if (id == null && sha256 == null) return d;
  const result = { ...d, [FELD]: { id, sha256 } };
  link(row.knowledge_object_id, result); // Dasselbe enge Pointerformat, kein Fallback.
  return result;
}
function manifest(links) {
  return links.map(r => ({ raw_document_id:r.raw_document_id,
    raw_source_version_id:r.raw_source_version_id, raw_source_version_sha256:r.raw_source_version_sha256 }))
    .sort((a,b) => a.raw_document_id < b.raw_document_id ? -1 : a.raw_document_id > b.raw_document_id ? 1 : 0);
}
module.exports = { FELD, digest, pointer, bindeArchiv, link, quelle, manifest };
