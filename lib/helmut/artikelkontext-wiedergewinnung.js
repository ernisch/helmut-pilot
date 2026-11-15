"use strict";

// Kontrollierte reine Neugewinnung, kein HTTP-/Modell-/Profilimport. Revisionen
// werden ausschliesslich mit einer geprueften Parseraenderung im Code erhoeht.
const crypto = require("node:crypto"), zlib = require("node:zlib"),
  A = require("./artikelkontext"), { hash } = require("./quellen-lektuerebeleg");
// Revision2: derselbe gepruefte BMG-Artikelkopf gilt auch fuer /presse/reden/.
// Nur gespeicherte, hashgebundene Originalantworten erneut rein auswerten.
const REVISION = 2, MAX_REVISION = 8, MAX_BYTES = 1024 * 1024, MAX_GZIP = 256 * 1024;
const NEGATIVE = new Set(["strukturierter-artikel-mehrdeutig-oder-fehlend", "artikelbereich-mehrdeutig-oder-fehlend",
  "artikelmetadaten-fehlen", "artikelmetadaten-mehrdeutig-oder-fehlend", "keine-artikelabsaetze",
  "leitabsatz-nicht-nutzbar", "artikeltext-unvollstaendig"]);
const PK = ["version", "dokumentId", "quellenHash", "quelleKey", "originalKey", "finalUrl", "gelesenAm",
  "antwortHash", "bytes", "gzipHash", "gzipBytes", "extraktorRevision"];
const objekt = x => x && typeof x === "object" && !Array.isArray(x);
const exakt = (x, keys) => objekt(x) && Object.keys(x).sort().join() === keys.slice().sort().join();
const sha = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const byteHash = s => crypto.createHash("sha256").update(s).digest("hex");
const zeit = s => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)
  && Number.isFinite(Date.parse(s));
const revision = n => Number.isSafeInteger(n) && n >= 1 && n <= MAX_REVISION;
const uuid = s => typeof s === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const originalKey = key => hash(["artikel-originalantwort-v1", key]);
const repairKey = (doc, rev) => hash(["artikel-wiedergewinnung-v1", doc.id, A.quellenstandHash(doc), rev]);
const fehler = reason => ({ ok: false, reason });
function pointerGueltig(doc, key, p) {
  if (!exakt(p, [...PK, "hash"]) || p.version !== 1 || p.dokumentId !== doc.id
    || p.quellenHash !== A.quellenstandHash(doc) || p.quelleKey !== key || !sha(key)
    || p.originalKey !== originalKey(key) || !zeit(p.gelesenAm) || !revision(p.extraktorRevision)
    || !sha(p.antwortHash) || !sha(p.gzipHash) || !sha(p.hash)
    || !Number.isSafeInteger(p.bytes) || p.bytes < 1 || p.bytes > MAX_BYTES
    || !Number.isSafeInteger(p.gzipBytes) || p.gzipBytes < 1 || p.gzipBytes > MAX_GZIP) return false;
  try {
    for (const value of [doc.url, p.finalUrl]) {
      const u = new URL(value);
      if ([...u.searchParams.keys()].some(k => /token|secret|password|auth|session|signature|credential|apikey/i.test(k))) return false;
    }
    A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc.id, quellenHash: p.quellenHash,
      artikelUrl: p.finalUrl, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
      gelesenAm: p.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
    return p.hash === hash(Object.fromEntries(PK.map(k => [k, p[k]])));
  } catch { return false; }
}
function reparaturGueltig(doc, key, w) {
  return exakt(w, ["version", "extraktorRevision", "quelleKey", "negativHash", "original"])
    && w.version === 1 && revision(w.extraktorRevision) && sha(w.quelleKey) && sha(w.negativHash)
    && pointerGueltig(doc, w.quelleKey, w.original) && w.extraktorRevision > w.original.extraktorRevision
    && key === repairKey(doc, w.extraktorRevision);
}
function basisGueltig(doc, key, stand, pruefe) {
  return stand?.version === 2 && stand.zustand === "luecke" && NEGATIVE.has(stand.reason)
    && pointerGueltig(doc, key, stand.originalAntwort)
    && pruefe(doc, key, stand, "einstieg").reason === stand.reason;
}
function erzeuge({ extraktorRevision = REVISION, extrahiere = null } = {}) {
  if (!revision(extraktorRevision)) throw Error("extraktorrevision-ungueltig");
  const sicherJetzt = now => { try { const s = now().toISOString(); return zeit(s) ? s : null; } catch { return null; } };
  function begrenze(speicher, now, deadlineMs) {
    const start = Date.parse(sicherJetzt(now)), ende = Math.min(start + 20000, Number.isFinite(deadlineMs) ? deadlineMs : Infinity);
    const guard = () => { const t = Date.parse(sicherJetzt(now)); if (!Number.isFinite(t) || t < start || !(t < ende)) throw Error("wiedergewinnung-restzeit"); };
    guard();
    return Object.fromEntries(["lesen", "reservieren", "abschliessen"].map(m => [m, async (...args) => {
      guard(); const result = await speicher[m](...args); guard(); return result;
    }]));
  }
  async function sichere({ doc, key, antwort, gelesenAm, speicher, now = () => new Date(), deadlineMs }) {
    try {
      speicher = begrenze(speicher, now, deadlineMs);
      if (!antwort || antwort.status !== 200 || typeof antwort.body !== "string" || !zeit(gelesenAm)) return null;
      const bytes = Buffer.from(antwort.body, "utf8");
      if (!bytes.length || bytes.length > MAX_BYTES || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) !== antwort.body) return null;
      const gzip = zlib.gzipSync(bytes, { level: 6, maxOutputLength: MAX_GZIP });
      if (gzip.length > MAX_GZIP) return null;
      const basis = { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc), quelleKey: key,
        originalKey: originalKey(key), finalUrl: antwort.finalUrl, gelesenAm, antwortHash: byteHash(bytes), bytes: bytes.length,
        gzipHash: byteHash(gzip), gzipBytes: gzip.length, extraktorRevision };
      const p = { ...basis, hash: hash(basis) }; if (!pointerGueltig(doc, key, p)) return null;
      const reserviertAm = sicherJetzt(now); if (!reserviertAm || reserviertAm < gelesenAm) return null;
      const r = { version: 1, schluessel: p.originalKey, versuchId: crypto.randomUUID(), reserviertAm, zustand: "reserviert" };
      let stand = await speicher.lesen(p.originalKey);
      if (stand === null) {
        try { await speicher.reservieren(p.originalKey, r); } catch { /* Nur Readback erteilt Besitz. */ }
        stand = await speicher.lesen(p.originalKey);
        if (hash(stand) !== hash(r)) return null;
        const abgeschlossenAm = sicherJetzt(now); if (!abgeschlossenAm || abgeschlossenAm < reserviertAm) return null;
        const end = { ...r, zustand: "belegt", abgeschlossenAm, original: { ...p, gzip: gzip.toString("base64") } };
        try { await speicher.abschliessen(p.originalKey, r.versuchId, end); } catch { /* Readback entscheidet. */ }
        stand = await speicher.lesen(p.originalKey);
      }
      return leseOriginal(stand, p) ? p : null;
    } catch { return null; }
  }
  function leseOriginal(stand, p) {
    const keys = ["version", "schluessel", "versuchId", "reserviertAm", "zustand", "abgeschlossenAm", "original"];
    if (!exakt(stand, keys) || stand.version !== 1 || stand.schluessel !== p.originalKey || stand.zustand !== "belegt"
      || !uuid(stand.versuchId) || !zeit(stand.reserviertAm) || !zeit(stand.abgeschlossenAm)
      || stand.abgeschlossenAm < stand.reserviertAm || stand.reserviertAm < p.gelesenAm
      || !exakt(stand.original, [...PK, "hash", "gzip"])) return null;
    const { gzip, ...pointer } = stand.original;
    if (hash(pointer) !== hash(p) || typeof gzip !== "string" || gzip.length > 4 * Math.ceil(MAX_GZIP / 3)
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(gzip)) return null;
    try {
      const gepackt = Buffer.from(gzip, "base64");
      if (gepackt.toString("base64") !== gzip || gepackt.length !== p.gzipBytes || byteHash(gepackt) !== p.gzipHash) return null;
      const roh = zlib.gunzipSync(gepackt, { maxOutputLength: MAX_BYTES });
      if (roh.length !== p.bytes || byteHash(roh) !== p.antwortHash) return null;
      return { finalUrl: p.finalUrl, body: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(roh), gelesenAm: p.gelesenAm };
    } catch { return null; }
  }
  async function lese({ doc, key, stand, speicher, pruefe }) {
    if (!basisGueltig(doc, key, stand, pruefe) || extraktorRevision <= stand.originalAntwort.extraktorRevision) return null;
    const meta = { version: 1, extraktorRevision, quelleKey: key, negativHash: hash(stand), original: stand.originalAntwort };
    const basis = { key, stand }, ziel = repairKey(doc, extraktorRevision);
    const altKey = byteHash(JSON.stringify(["artikelkontext-abruf-v1", doc.id, A.quellenstandHash(doc)]));
    try {
      // Kein neuer Revisionsschluessel uebergeht einen alten positiven oder
      // unklaren Abruf. Dieser Vorflug liest ausschliesslich kleine Metadaten.
      if (altKey !== key) {
        const alt = await speicher.lesen(altKey);
        if (alt !== null) {
          const r = pruefe(doc, altKey, alt);
          if (r.ok || alt.zustand !== "luecke" || !NEGATIVE.has(r.reason))
            return { key: altKey, stand: alt, ergebnis: pruefe(doc, altKey, alt, "einstieg") };
        }
      }
      // Eine spaetere Revision darf einen reservierten/kaputten frueheren
      // Reparaturausgang nicht durch einen neuen Schluessel umgehen.
      for (let rev = stand.originalAntwort.extraktorRevision + 1; rev <= extraktorRevision; rev++) {
        const k = repairKey(doc, rev), s = await speicher.lesen(k);
        if (s === null) continue;
        const r = pruefe(doc, k, s, "einstieg");
        if (!reparaturGueltig(doc, k, s.wiedergewinnung) || s.wiedergewinnung.quelleKey !== key
          || s.wiedergewinnung.negativHash !== meta.negativHash) return { key: k, stand: s, ergebnis: fehler("wiedergewinnung-nicht-pruefbar") };
        if (r.ok || s.zustand !== "luecke" || !NEGATIVE.has(r.reason) || rev === extraktorRevision)
          return { key: k, stand: s, ergebnis: r };
      }
      return { key: ziel, stand: null, ergebnis: fehler("wiedergewinnung-fehlt"), basis, meta };
    } catch { return { key: ziel, stand: undefined, ergebnis: fehler("wiedergewinnung-nicht-lesbar") }; }
  }
  async function repariere(o) {
    try { o = { ...o, now: o.now || (() => new Date()) }; o.speicher = begrenze(o.speicher, o.now, o.deadlineMs); }
    catch { return { stand: undefined, ergebnis: fehler("wiedergewinnung-uhr-ungueltig") }; }
    const sichtbar = await lese(o); if (!sichtbar || sichtbar.stand !== null || !sichtbar.basis) return sichtbar;
    const { doc, speicher, pruefe, now = () => new Date() } = o, { meta, key } = sichtbar;
    try {
      const original = leseOriginal(await speicher.lesen(meta.original.originalKey), meta.original);
      if (!original) return { ...sichtbar, ergebnis: fehler("originalantwort-nicht-pruefbar") };
      const reserviertAm = sicherJetzt(now); if (!reserviertAm || reserviertAm < meta.original.gelesenAm) return { ...sichtbar, ergebnis: fehler("wiedergewinnung-uhr-ungueltig") };
      const r = { version: 2, schluessel: key, versuchId: crypto.randomUUID(), reserviertAm,
        zustand: "reserviert", wiedergewinnung: meta };
      try { await speicher.reservieren(key, r); } catch { /* Readback entscheidet. */ }
      const own = await speicher.lesen(key);
      if (hash(own) !== hash(r)) return { key, stand: own, ergebnis: own ? pruefe(doc, key, own, "einstieg") : fehler("wiedergewinnung-reservierung-offen") };
      const result = (extrahiere || require("./artikelkontext-gewinnung").gewinneArtikeltext)(doc, original, { abschnittsweise: true });
      const abgeschlossenAm = sicherJetzt(now);
      if (!abgeschlossenAm || abgeschlossenAm < reserviertAm) return { key, stand: r, ergebnis: fehler("wiedergewinnung-uhr-ungueltig") };
      const end = { ...r, zustand: result?.ok === true ? "belegt" : "luecke", abgeschlossenAm,
        ...(result?.ok === true ? { beleg: result.beleg } : { reason: result?.reason }) };
      if (pruefe(doc, key, end, "einstieg").reason === "belegstand-ungueltig") return { key, stand: r, ergebnis: fehler("wiedergewinnung-ergebnis-ungueltig") };
      try { await speicher.abschliessen(key, r.versuchId, end); } catch { /* Readback entscheidet. */ }
      const saved = await speicher.lesen(key);
      return hash(saved) === hash(end) ? { key, stand: saved, ergebnis: pruefe(doc, key, saved, "einstieg") }
        : { key, stand: saved, ergebnis: fehler("wiedergewinnung-abschluss-offen") };
    } catch { return { key, stand: undefined, ergebnis: fehler("wiedergewinnung-ausgang-offen") }; }
  }
  const gewinne = (doc, antwort, opts) => (extrahiere || require("./artikelkontext-gewinnung").gewinneArtikeltext)(doc, antwort, opts);
  return Object.freeze({ revision: extraktorRevision, sichere, lese, repariere, gewinne });
}
module.exports = { REVISION, MAX_BYTES, MAX_GZIP, revisionGueltig: revision, technisch: reason => NEGATIVE.has(reason),
  pointerGueltig, reparaturGueltig, repairKey, erzeuge, standard: erzeuge() };
