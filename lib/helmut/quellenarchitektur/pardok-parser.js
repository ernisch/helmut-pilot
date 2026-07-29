"use strict";

// Helmut — Quellenarchitektur · PARDOK/parldok-Parser fuer die amtlichen Landesparlaments-
// Open-Data-Quellen Berlin (be-plenum) und Brandenburg (bb-plenum).
//
// ZIEL: aus den echten XML-Exporten EINZELNE, stabil identifizierte politische Dokumente
// erzeugen — KEIN Sammelcluster ueber Platzhaltertitel. Berlin und Brandenburg haben
// UNTERSCHIEDLICHE Strukturen; es wird KEINE gemeinsame Feldannahme erzwungen (getrennte
// Adapter). Fehlende Felder bleiben null (nichts erfinden).
//
// REALE STRUKTUREN (durch scripts/pardok-structure-probe.js gegen die Live-XML ermittelt):
//   Berlin  (pardok-wp19.xml): Root <Export>, FLACHE <Dokument>-Records. Externe ID = <DBID>
//     (z. B. "D-351040", 100% vorhanden). Felder: Titel(35%), DokDat(100%), DokNr(96%),
//     DokArt/DokArtL, DokTyp/DokTypL, Wp(100%), Urheber(55%, mehrfach), LokURL(98%).
//     Viele Typen sind FORMATBEDINGT titellos (Plenarprotokoll/Ausschussprotokoll/GVBl/Antwort).
//   Brandenburg (exportWP8.xml): Root <Export>, Record = <Vorgang>. ~47% sind reine
//     <VFunktion>delete</VFunktion>-Stubs (Tombstones -> UEBERSPRINGEN). Echte Inhalte im
//     VERSCHACHTELTEN <Dokument> (KEIN DBID -> Identitaet aus <VNr> + DokNr/ReihNr). Vorgang
//     traegt VNr, VTyp/VTypL, mehrere <Nebeneintrag> (Desk-Stichwoerter). Dokument: Titel,
//     DokDat, DokNr, DokArt/DokArtL, DokTyp/DokTypL, Wp, Urheber(mehrfach), LokURL(pdf/docx).
//
// REIN, DETERMINISTISCH, kein Netz, kein Storage-Write, kein LLM. Namespace-tolerant.
// Wird (noch) NICHT in den Production-Crawl verdrahtet.
//
// DOKUMENTKLASSE (Roadmap-Punkt 24): die rohen Typbezeichnungen der Quelle sagen fuer sich genommen
// nicht, ob ein Dokument Drucksache, Anfrage, Antwort oder Sitzungsdokument ist. Jedes geparste
// Dokument traegt deshalb zusaetzlich eine NORMALISIERTE Klasse aus pardok-dokumentklassen.js
// (laenderspezifische Tabellen, fail closed auf `unbekannt`). Rein additiv — alle bisherigen
// Felder und ihre Werte bleiben unveraendert. `vorgang` ist bewusst KEINE Dokumentklasse: der
// Vorgang bleibt ein BEZUG (vorgangsnummer/vorgangstyp), die Vorgangsbildung bleibt beim Resolver.

const crypto = require("crypto");
const { klassifiziereDokument } = require("./pardok-dokumentklassen");

const LAND_CONFIG = {
  berlin: { recordTag: "Dokument", nested: false, geography: "geo-land-berlin", herkunft: "BLN", wpHintRe: /(?:wp|w)(\d{1,2})\b/i },
  brandenburg: { recordTag: "Vorgang", nested: true, geography: "geo-land-brandenburg", herkunft: "BRA", wpHintRe: /(?:wp|w)(\d{1,2})\b/i }
};

// --- Namespace-tolerante Feld-Extraktion -----------------------------------------------------
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&amp;/g, "&");
}
function fieldRe(name, flags) { return new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, flags); }
function firstField(xml, name) {
  const m = fieldRe(name, "i").exec(String(xml));
  if (!m) return null;
  const v = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return v === "" ? null : v;
}
function allFields(xml, name) {
  const out = []; const re = fieldRe(name, "gi"); let m;
  while ((m = re.exec(String(xml))) !== null) {
    const v = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
    if (v) out.push(v);
  }
  return out;
}
// Nur die DIREKTEN <Dokument>-Kindbloecke eines Vorgangs (nicht rekursiv; Dokument ist nicht selbst-verschachtelt).
function extractChildBlocks(xml, tag) {
  const out = []; const re = fieldRe(tag, "gi"); let m;
  while ((m = re.exec(String(xml))) !== null) out.push(m[0]);
  return out;
}

// --- Datums-/Wahlperioden-Erkennung ----------------------------------------------------------
// "DD.MM.YYYY" -> "YYYY-MM-DD" (null bei Fehlen/Unplausibel). Nichts erfinden.
function parseGermanDate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// Wahlperiode aus INHALT/QUELLE ableiten (nicht fest codiert): <Wp>-Feld, sonst DokNr-Praefix
// ("19/0019"->19, "08/30"->8), sonst Quellen-URL-Hinweis ("...wp19..." / "...WP8..."). null sonst.
function detectWahlperiode(wpField, dokNr, sourceUrl, wpHintRe) {
  if (wpField && /^\d{1,2}$/.test(String(wpField).trim())) return Number(String(wpField).trim());
  if (dokNr) { const m = String(dokNr).match(/^(\d{1,2})\s*\//); if (m) return Number(m[1]); }
  if (sourceUrl && wpHintRe) { const m = String(sourceUrl).match(wpHintRe); if (m) return Number(m[1]); }
  return null;
}
function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
// Stabiler, TITEL-UNABHAENGIGER Inhaltsfingerabdruck: verhindert Zusammenfall titelloser Dokumente.
function buildFingerprint(land, externeId, wahlperiode, dokNr, datum, dokArt) {
  return "pardok-" + sha256([land, externeId || "", wahlperiode ?? "", dokNr || "", datum || "", dokArt || ""].join("|")).slice(0, 40);
}

// Ausschuss nur setzen, wenn ein Feld ihn KLAR benennt (nichts erfinden).
function detectAusschuss(dokArt, dokTyp, urheber) {
  const cand = [];
  if (Array.isArray(urheber)) for (const u of urheber) if (/ausschuss/i.test(u)) cand.push(u);
  if (cand.length) return cand[0];
  if (dokTyp && /ausschuss/i.test(dokTyp)) return dokTyp;
  return null;
}
function pickUrl(urls) {
  if (!urls || !urls.length) return null;
  const pdf = urls.find((u) => /\.pdf(\?|$)/i.test(u));
  return pdf || urls[0];
}
// "Format hat einen (nicht-leeren) Titel bereitgestellt" — auf dem EIGENEN Quellblock geprueft.
function hasNonEmptyTitel(xml) {
  const m = fieldRe("Titel", "i").exec(String(xml));
  return !!(m && decodeEntities(m[1]).trim() !== "");
}

// Haengt die normalisierte Dokumentklasse an. REIN ADDITIV: kein bestehendes Feld wird beruehrt.
// Fail closed — ein nicht belegter Typwert wird `unbekannt`, nie geraten.
function mitDokumentklasse(doc) {
  const k = klassifiziereDokument(doc);
  doc.dokumentklasse = k.dokumentklasse;
  doc.dokumentklasse_quelle = k.klasse_quelle;
  doc.dokumentklasse_beleg = k.klasse_beleg;
  doc.dokumentklasse_rohwert = k.klasse_rohwert;
  return doc;
}

// --- Adapter Berlin: FLACHES <Dokument> ------------------------------------------------------
function parseBerlinDokument(dokXml, opts = {}) {
  const cfg = LAND_CONFIG.berlin;
  const dbid = firstField(dokXml, "DBID");
  const titel = firstField(dokXml, "Titel");
  const dokNr = firstField(dokXml, "DokNr") || firstField(dokXml, "NrInTyp");
  const datum = parseGermanDate(firstField(dokXml, "DokDat"));
  const dokArt = firstField(dokXml, "DokArtL") || firstField(dokXml, "DokArt");
  const dokTyp = firstField(dokXml, "DokTypL") || firstField(dokXml, "DokTyp");
  const wp = detectWahlperiode(firstField(dokXml, "Wp"), dokNr, opts.sourceUrl, cfg.wpHintRe);
  const urheber = allFields(dokXml, "Urheber");
  const externeId = dbid || (dokNr ? `bln:${dokNr}` : null);
  const hasIdentity = !!(dbid || dokNr || titel);
  const struct = externeId || ("struct-" + sha256(dokXml).slice(0, 40)); // nie Sammelcluster
  return mitDokumentklasse({
    land: "berlin",
    titel: titel || null,
    veroeffentlichungsdatum: datum,
    dokumentart: dokArt || null,
    dokumenttyp: dokTyp || null,
    drucksachennummer: dokNr || null,
    vorgangsnummer: null,
    wahlperiode: wp,
    ausschuss: detectAusschuss(dokArt, dokTyp, urheber),
    urheber: urheber.length ? urheber : null,
    originaladresse: pickUrl(allFields(dokXml, "LokURL")),
    politische_ebene: "land",
    geografie: cfg.geography,
    externe_id: externeId || struct,
    inhaltsfingerabdruck: buildFingerprint("berlin", struct, wp, dokNr, datum, dokArt),
    platzhalter: !hasIdentity,
    _titelTagVorhanden: hasNonEmptyTitel(dokXml)
  });
}

// --- Adapter Brandenburg: <Vorgang> (delete-Stubs ueberspringen) -> verschachtelte <Dokument> --
function parseBrandenburgVorgang(vorgangXml, opts = {}) {
  const cfg = LAND_CONFIG.brandenburg;
  const vFunktion = firstField(vorgangXml, "VFunktion");
  if (vFunktion && /delete/i.test(vFunktion)) return { skipped: "delete", documents: [] };
  const vnr = firstField(vorgangXml, "VNr");
  const vTypL = firstField(vorgangXml, "VTypL") || firstField(vorgangXml, "VTyp");
  const deskKeywords = allFields(vorgangXml, "Desk");
  const dokBloecke = extractChildBlocks(vorgangXml, "Dokument");
  if (!dokBloecke.length) return { skipped: "kein_dokument", vnr, documents: [] };

  const documents = dokBloecke.map((dok, i) => {
    const titel = firstField(dok, "Titel");
    const dokNr = firstField(dok, "DokNr") || firstField(dok, "NrInTyp");
    const reihNr = firstField(dok, "ReihNr");
    const datum = parseGermanDate(firstField(dok, "DokDat"));
    const dokArt = firstField(dok, "DokArtL") || firstField(dok, "DokArt");
    const dokTyp = firstField(dok, "DokTypL") || firstField(dok, "DokTyp");
    const wp = detectWahlperiode(firstField(dok, "Wp"), dokNr, opts.sourceUrl, cfg.wpHintRe);
    const urheber = allFields(dok, "Urheber");
    // Identitaet EINDEUTIG pro (Vorgang, Dokument-Position): ReihNr (sonst Index) diskriminiert
    // mehrere Dokumente DESSELBEN Vorgangs; VNr trennt Vorgaenge. Verhindert Kollision, wenn zwei
    // Dokumente eines Vorgangs dieselbe DokNr tragen (sonst faelschlich zusammengefuehrt).
    const disc = reihNr ? `r${reihNr}` : `i${i}`;
    const externeId = vnr ? `${vnr}#${disc}` : (dokNr ? `bra:${dokNr}#${disc}` : null);
    const hasIdentity = !!(vnr || dokNr || titel);
    const struct = externeId || ("struct-" + sha256(dok).slice(0, 40));
    return mitDokumentklasse({
      land: "brandenburg",
      titel: titel || null,
      veroeffentlichungsdatum: datum,
      dokumentart: dokArt || null,
      dokumenttyp: dokTyp || null,
      drucksachennummer: dokNr || null,
      vorgangsnummer: vnr || null,
      wahlperiode: wp,
      ausschuss: detectAusschuss(dokArt, dokTyp, urheber),
      urheber: urheber.length ? urheber : null,
      originaladresse: pickUrl(allFields(dok, "LokURL")),
      politische_ebene: "land",
      geografie: cfg.geography,
      externe_id: externeId || struct,
      inhaltsfingerabdruck: buildFingerprint("brandenburg", struct, wp, dokNr, datum, dokArt),
      vorgangstyp: vTypL || null,
      stichworte: deskKeywords.length ? deskKeywords.slice(0, 20) : null,
      platzhalter: !hasIdentity,
      _titelTagVorhanden: hasNonEmptyTitel(dok)
    });
  });
  return { skipped: null, vnr, documents };
}

// --- HTML-Fehlerseite statt XML erkennen -----------------------------------------------------
function looksHtmlNotXml(body) {
  const head = String(body || "").slice(0, 2000);
  return /^\s*<!doctype html|<html[\s>]/i.test(head) && !/^\s*<\?xml|<Export[\s>]/i.test(head);
}

// --- Record-Iterator ueber einen STRING (namespace-tolerant, nur vollstaendige Bloecke) -------
function* iterateRecordBlocks(xml, recordTag, max) {
  const re = fieldRe(recordTag, "gi");
  let m; let n = 0;
  const text = String(xml);
  while ((m = re.exec(text)) !== null) {
    yield m[0];
    if (max && ++n >= max) return;
  }
}

// --- Zaehl-Container + Einzelblock-Verarbeitung (von String- UND Streaming-Pfad genutzt) ------
function newStats(land) {
  return { land, rohRecords: 0, deleteStubs: 0, ohneDokument: 0, geparst: 0, mitTitel: 0, mitDatum: 0, mitExterneId: 0, platzhalter: 0, formatTitelVorhanden: 0, formatTitelErkannt: 0 };
}
// Verarbeitet EINEN Record-Block (Berlin: <Dokument>; Brandenburg: <Vorgang>) -> 0..n Dokumente,
// aktualisiert stats. Delete-Stubs und dokumentlose Vorgaenge erzeugen kein Dokument.
function feedBlock(land, block, opts, stats) {
  stats.rohRecords += 1;
  const out = [];
  if (land === "berlin") {
    out.push(accumulate(stats, parseBerlinDokument(block, opts)));
  } else {
    const res = parseBrandenburgVorgang(block, opts);
    if (res.skipped === "delete") { stats.deleteStubs += 1; return out; }
    if (res.skipped === "kein_dokument") { stats.ohneDokument += 1; return out; }
    for (const d of res.documents) out.push(accumulate(stats, d));
  }
  return out;
}

// --- Gesamt-Parse aus einem STRING (offline testbar) -----------------------------------------
function parsePardokDocumentsFromString(xml, opts = {}) {
  const land = opts.land;
  const cfg = LAND_CONFIG[land];
  if (!cfg) throw new Error(`Unbekanntes Land: ${land}`);
  const stats = newStats(land);
  if (looksHtmlNotXml(xml)) return { fehlerseite: true, documents: [], stats };
  const documents = [];
  for (const block of iterateRecordBlocks(xml, cfg.recordTag, opts.maxRecords)) {
    for (const d of feedBlock(land, block, opts, stats)) documents.push(d);
  }
  return { fehlerseite: false, documents, stats };
}
// Zaehlt Kennzahlen PRO DOKUMENT (formatTitelVorhanden/Erkannt am eigenen Quellblock) und
// entfernt das interne _titelTagVorhanden aus dem Ausgabe-Dokument.
function accumulate(stats, d) {
  stats.geparst += 1;
  const titelTag = d._titelTagVorhanden; delete d._titelTagVorhanden;
  if (titelTag) stats.formatTitelVorhanden += 1;
  if (d.titel) { stats.mitTitel += 1; if (titelTag) stats.formatTitelErkannt += 1; }
  if (d.veroeffentlichungsdatum) stats.mitDatum += 1;
  if (d.externe_id && !String(d.externe_id).startsWith("struct-")) stats.mitExterneId += 1;
  if (d.platzhalter) stats.platzhalter += 1;
  return d;
}

// --- Dedup nach Inhaltsfingerabdruck -> EIN Dokument + N Fundstellen --------------------------
function dedupToDocuments(documents, sourceId) {
  const byFp = new Map();
  for (const d of documents) {
    const k = d.inhaltsfingerabdruck;
    if (!byFp.has(k)) byFp.set(k, { ...d, fundstellen: [] });
    byFp.get(k).fundstellen.push({ source_id: sourceId || null, externe_id: d.externe_id, original_url: d.originaladresse || null });
  }
  const docs = [...byFp.values()].map((d) => ({ ...d, fundstellen_anzahl: d.fundstellen.length }));
  return { dokumente: docs, anzahl: docs.length, mehrfach: docs.filter((d) => d.fundstellen_anzahl > 1).length };
}

module.exports = {
  LAND_CONFIG, mitDokumentklasse,
  parsePardokDocumentsFromString, parseBerlinDokument, parseBrandenburgVorgang,
  newStats, feedBlock,
  parseGermanDate, detectWahlperiode, buildFingerprint, detectAusschuss, pickUrl,
  firstField, allFields, extractChildBlocks, iterateRecordBlocks, looksHtmlNotXml, dedupToDocuments, sha256
};
