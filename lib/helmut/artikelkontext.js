"use strict";

// Expliziter lokaler Eingabeversuch, kein Abruf und keine Persistenz.
// Der Betreiber erlaubt zunaechst einen manuell gelesenen Originalabsatz.
// Diese Pruefung bestaetigt Struktur und Quellenbindung, NICHT die Wahrheit
// oder Vollstaendigkeit des vom Aufrufer gelieferten Originalvergleichs.
const crypto = require("node:crypto");
const { canonicalizeUrl } = require("./dedup");
const Q = require("./quellen-zeitvertrag");
const MAX_ZEICHEN = 600;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const quellenstandHash = doc => hash(JSON.stringify(Q.understandingQuelle(doc)));
const titelKey = value => typeof value === "string"
  ? value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";
function fordere(ok, grund) {
  if (!ok) throw new Error("artikelkontext-" + grund);
}
function artikelUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || !/^https:\/\//i.test(value)
    || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash || u.pathname === "/") return null;
    return canonicalizeUrl(value);
  } catch { return null; }
}
function pruefeArtikelkontext(documents, beleg) {
  fordere(beleg && typeof beleg === "object" && !Array.isArray(beleg), "ein-beleg-erforderlich");
  fordere(beleg.version === 1 && beleg.herkunft === "manueller-originalvergleich", "vertrag-ungueltig");
  fordere(typeof beleg.dokumentId === "string" && beleg.dokumentId.length > 0, "dokumentkennung-fehlt");
  const docs = (Array.isArray(documents) ? documents : []).filter(d => d?.id === beleg.dokumentId);
  fordere(docs.length === 1, "dokumentbindung-mehrdeutig-oder-fehlend");
  const doc = docs[0];
  fordere(typeof beleg.quellenHash === "string" && /^[a-f0-9]{64}$/.test(beleg.quellenHash)
    && beleg.quellenHash === quellenstandHash(doc), "quellenstand-abweichend");
  const target = artikelUrl(beleg.artikelUrl);
  const urls = [doc.url, doc.canonical_url].filter(v => v != null && v !== "");
  fordere(target && urls.length > 0 && urls.every(url => artikelUrl(url) === target), "artikelziel-abweichend");
  fordere(typeof beleg.artikelTitel === "string" && beleg.artikelTitel.length <= 300
    && titelKey(beleg.artikelTitel) && titelKey(beleg.artikelTitel) === titelKey(doc.title), "artikeltitel-abweichend");
  fordere(Number.isSafeInteger(beleg.absatzPosition) && beleg.absatzPosition > 0, "absatzposition-ungueltig");
  fordere(typeof beleg.gelesenAm === "string" && beleg.gelesenAm.includes("T")
    && Q.publikationsdatum(beleg.gelesenAm), "lesezeit-ungueltig");
  fordere(typeof beleg.text === "string" && beleg.text.trim().length > 0
    && beleg.text.length <= MAX_ZEICHEN && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(beleg.text), "absatz-ungueltig");
  // Niemals kuerzen, umformulieren, zeitlich klassifizieren oder beliebige
  // Felder uebernehmen. Auch ein widerspruechlicher Text bleibt Quellentext.
  return {
    version: 1, dokumentId: doc.id, quellenHash: beleg.quellenHash,
    artikelUrl: beleg.artikelUrl, artikelTitel: beleg.artikelTitel,
    herkunft: beleg.herkunft, gelesenAm: beleg.gelesenAm,
    absatzPosition: beleg.absatzPosition, text: beleg.text, textHash: hash(beleg.text)
  };
}

module.exports = { MAX_ZEICHEN, quellenstandHash, pruefeArtikelkontext };
