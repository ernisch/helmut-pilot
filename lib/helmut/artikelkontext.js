"use strict";

// Expliziter lokaler Eingabeversuch, kein Abruf und keine Persistenz.
// Version1: manueller Originalvergleich. Version2: automatische Gewinnung
// aus einer expliziten HTML Antwort; keine implizite Abruffreigabe.
// Diese Pruefung bestaetigt Struktur und Quellenbindung, NICHT die Wahrheit
// oder Vollstaendigkeit des vom Aufrufer gelieferten Originalvergleichs.
const crypto = require("node:crypto");
const { canonicalizeUrl } = require("./dedup");
const Q = require("./quellen-zeitvertrag");
// Manuelle Belege, generische HTML-Gewinnung und Deutschlandfunk bleiben bei
// 600 Zeichen. Nur der amtliche Bundestags-Leitabsatz darf vollstaendig bis
// 1200 Zeichen belegt werden; niemals kuerzen oder einen spaeteren Absatz waehlen.
const MAX_ZEICHEN = 600;
const MAX_ZEICHEN_BUNDESTAG_LEITABSATZ = 1200;
// Nur der neue, explizite Einstieg: bis vier ganze aufeinanderfolgende Absaetze.
// Bestehende Absatzvertraege und raw_documents.summary behalten ihre Grenzen.
const MAX_ZEICHEN_EINSTIEG = 1280;
// Absatztexte bleiben einzeln nachweisbar; sichtbarer Zwischenkontext gehoert
// zum selben unverkuerzten Originalpraefix und darf nicht verschwinden.
const einstiegText = (absaetze, zwischenTexte) => absaetze
  .flatMap((p, i) => i ? [zwischenTexte[i - 1], p] : [p]).filter(t => t !== "").join(" ");
const maxZeichenFuer = beleg => beleg?.version === 2
  && beleg?.herkunft === "strukturierter-originalartikel"
  ? beleg?.gewinnung?.verfahren === "bundestag-artikel-leitabsatz-v1" ? MAX_ZEICHEN_BUNDESTAG_LEITABSATZ
    : beleg?.gewinnung?.verfahren === "artikel-einstieg-v2" ? MAX_ZEICHEN_EINSTIEG : MAX_ZEICHEN
  : MAX_ZEICHEN;
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
  const manuell = beleg.version === 1 && beleg.herkunft === "manueller-originalvergleich";
  const automatisch = beleg.version === 2 && beleg.herkunft === "strukturierter-originalartikel";
  fordere(manuell || automatisch, "vertrag-ungueltig");
  fordere(typeof beleg.dokumentId === "string" && beleg.dokumentId.length > 0, "dokumentkennung-fehlt");
  const docs = (Array.isArray(documents) ? documents : []).filter(d => d?.id === beleg.dokumentId);
  fordere(docs.length === 1, "dokumentbindung-mehrdeutig-oder-fehlend");
  const doc = docs[0];
  fordere(!require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(doc), "quelle-nur-metadaten");
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
    && beleg.text.length <= maxZeichenFuer(beleg)
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(beleg.text), "absatz-ungueltig");
  let gewinnung;
  if (automatisch) {
    const g = beleg.gewinnung;
    const bundestag = g?.verfahren === "bundestag-artikel-leitabsatz-v1";
    const deutschlandfunk = g?.verfahren === "deutschlandfunk-artikel-leitabsatz-v1";
    const einstieg = g?.verfahren === "artikel-einstieg-v2";
    const leitabsatz = bundestag || deutschlandfunk;
    fordere(!bundestag || /^https:\/\/(?:www\.)?bundestag\.de\/dokumente\/textarchiv\/\d{4}\/[a-z0-9-]+-\d+$/.test(beleg.artikelUrl), "gewinnung-ungueltig");
    fordere(!deutschlandfunk || /^https:\/\/(?:www\.)?deutschlandfunk\.de\/[a-z0-9-]+-\d+\.html$/.test(beleg.artikelUrl), "gewinnung-ungueltig");
    fordere(g && !Array.isArray(g) && (g.verfahren === "artikel-absatz-titel-v1" || leitabsatz || einstieg)
      && g.positionsbasis === (deutschlandfunk ? "html-article-div" : "html-article-p")
      && typeof g.antwortHash === "string" && /^[a-f0-9]{64}$/.test(g.antwortHash)
      && typeof g.artikelTextHash === "string" && /^[a-f0-9]{64}$/.test(g.artikelTextHash)
      && Number.isSafeInteger(g.artikelTextPosition) && g.artikelTextPosition >= 0 && g.artikelTextPosition < 128 * 1024
      && Number.isSafeInteger(g.titelTreffer) && g.titelTreffer >= (leitabsatz || einstieg ? 0 : 2) && g.titelTreffer <= 100
      && Number.isSafeInteger(g.artikelAbsatzZahl) && g.artikelAbsatzZahl >= beleg.absatzPosition && g.artikelAbsatzZahl <= 256
      && Number.isSafeInteger(g.kandidatZahl) && g.kandidatZahl >= 1 && g.kandidatZahl <= g.artikelAbsatzZahl, "gewinnung-ungueltig");
    fordere(!leitabsatz || (beleg.absatzPosition === 1 && g.kandidatZahl === 1 && g.artikelTextPosition === 0), "gewinnung-ungueltig");
    fordere(!deutschlandfunk || g.titelTreffer === 0, "gewinnung-ungueltig");
    gewinnung = { verfahren: g.verfahren, positionsbasis: g.positionsbasis, antwortHash: g.antwortHash,
      artikelTextHash: g.artikelTextHash, artikelTextPosition: g.artikelTextPosition,
      titelTreffer: g.titelTreffer, kandidatZahl: g.kandidatZahl, artikelAbsatzZahl: g.artikelAbsatzZahl };
    if (einstieg) {
      fordere(beleg.absatzPosition === 1 && g.kandidatZahl === 1 && g.artikelTextPosition === 0
        && Array.isArray(g.absaetze) && g.absaetze.length >= 1 && g.absaetze.length <= 4
        && g.absaetze.length <= g.artikelAbsatzZahl && g.absaetze.every(t => typeof t === "string" && t.trim() === t && t.length >= 1)
        && Array.isArray(g.zwischenTexte) && g.zwischenTexte.length === g.absaetze.length - 1
        && g.zwischenTexte.every(t => typeof t === "string" && t.trim() === t)
        && einstiegText(g.absaetze, g.zwischenTexte) === beleg.text
        && ["jsonld", "microdata"].includes(g.struktur)
        && ["datePublished", "dateCreated"].includes(g.datumsFeld)
        && Q.publikationsdatum(g.originalDatum) && Q.publikationsdatum(doc.published_at)
        && Date.parse(g.originalDatum) === Date.parse(doc.published_at), "einstieg-ungueltig");
      let canonical;
      try { canonical = new URL(g.kanonischDeklariert); } catch { /* unten ablehnen */ }
      const ziel = new URL(beleg.artikelUrl);
      // Die Schemaabweichung braucht zusaetzlich einen gebundenen Herausgeber:
      // Quellenname und exakter Titelsuffix muessen zum selben Artikelhost passen.
      // Kein HTTP-Abruf, kein beliebiger Microdata-Host und kein Herausgeberalias.
      const quelle = doc.source_name, host = ziel.hostname.replace(/^www\./, "").split(".");
      const herausgeberGebunden = typeof quelle === "string" && quelle.trim() === quelle && quelle.length > 1
        && host.length === 2 && titelKey(quelle).replace(/ /g, "") === host[0].replace(/-/g, "")
        && beleg.artikelTitel.endsWith(" - " + quelle);
      const schemaVariante = g.struktur === "microdata" && canonical?.protocol === "http:"
        && herausgeberGebunden
        && canonical.host === ziel.host && canonical.pathname === ziel.pathname && canonical.search === ziel.search
        && !canonical.username && !canonical.password && !canonical.port && !canonical.hash
        && !/^[a-z]+:\/\/[^/?#]*:/i.test(g.kanonischDeklariert);
      fordere(artikelUrl(g.kanonischDeklariert) === target || schemaVariante, "artikelziel-abweichend");
      gewinnung = { ...gewinnung, absaetze: [...g.absaetze], zwischenTexte: [...g.zwischenTexte], struktur: g.struktur,
        datumsFeld: g.datumsFeld, originalDatum: g.originalDatum, kanonischDeklariert: g.kanonischDeklariert };
    }
  }
  // Niemals kuerzen, umformulieren, zeitlich klassifizieren oder beliebige
  // Felder uebernehmen. Auch ein widerspruechlicher Text bleibt Quellentext.
  return {
    version: beleg.version, dokumentId: doc.id, quellenHash: beleg.quellenHash,
    artikelUrl: beleg.artikelUrl, artikelTitel: beleg.artikelTitel,
    herkunft: beleg.herkunft, gelesenAm: beleg.gelesenAm,
    absatzPosition: beleg.absatzPosition, text: beleg.text, textHash: hash(beleg.text),
    ...(gewinnung ? { gewinnung } : {})
  };
}

module.exports = { MAX_ZEICHEN, MAX_ZEICHEN_BUNDESTAG_LEITABSATZ, MAX_ZEICHEN_EINSTIEG, einstiegText,
  quellenstandHash, pruefeArtikelkontext };
