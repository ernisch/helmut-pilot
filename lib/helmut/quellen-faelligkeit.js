"use strict";

const { hash } = require("./briefing-speicher");
const { archivStart } = require("./quellen-planungsrest");
const { isDeepStrictEqual } = require("node:util");
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const STUNDE = 3600000;

function fristen(auftrag, faelligAt, archivStunden = 168, ganztags = false) {
  const faellig = Date.parse(faelligAt);
  if (!Number.isFinite(faellig)) throw Error("quellenfaelligkeit-zeit-ungueltig");
  const iso = ms => new Date(ms).toISOString();
  const gespeichert = auftrag.payload?.faelligkeit;
  if (auftrag.payload?.art === "person-archiv") {
    const start = archivStart(auftrag);
    if (!Number.isFinite(start)) throw Error("quellenfaelligkeit-archivfenster-ungueltig");
    const gespeichertesEnde = Date.parse(gespeichert?.frist);
    const ende = gespeichert?.urspruenglichFaelligAm === iso(faellig) && gespeichertesEnde >= faellig
      && gespeichertesEnde <= start + 168 * STUNDE ? gespeichertesEnde : start + Math.min(archivStunden, 168) * STUNDE;
    return { urspruenglichFaelligAm: iso(faellig), frist: iso(ende) };
  }
  if ((auftrag.priority >= 35 && auftrag.priority <= 50)
    || require("./quellen-bundestag-termine").quelle(auftrag.payload?.quelle)) {
    const zeiten = ganztags && require("./quellen-tagesbetrieb").zeiten(faellig);
    if (zeiten) return { urspruenglichFaelligAm: iso(faellig), frist: iso(zeiten.redaktionsschluss),
      lageFrist: iso(zeiten.paketStart), morgenbriefingFrist: iso(zeiten.frist) };
    const tag = Math.floor(faellig / (24 * STUNDE)) * 24 * STUNDE;
    return { urspruenglichFaelligAm: iso(faellig), frist: iso(tag + 5 * STUNDE),
      morgenbriefingFrist: iso(tag + 5.25 * STUNDE) };
  }
  return { urspruenglichFaelligAm: iso(faellig), frist: iso(faellig + 24 * STUNDE) };
}

function abrufIdentitaet(auftrag) {
  const q = auftrag.payload?.quelle;
  const D = require("./source-demand");
  if (!q?.id) return null;
  return hash([auftrag.tenantId ?? null, q.id, q.crawlMethod, q.url || null, q.eurlexExcerptApproved === true,
    D.abrufwege(q)]);
}

function quellbindung(auftrag) {
  const quelle = auftrag?.payload?.quelle;
  if (!quelle || !UUID.test(auftrag.id || "") || !Number.isFinite(Date.parse(auftrag.firstDueAt))) return null;
  return hash([auftrag.id, auftrag.tenantId, quelle, new Date(auftrag.firstDueAt).toISOString()]);
}

function pruefeErgebnis(e) {
  if (e?.art === "terminstand") return SHA.test(e.standHash || "") && SHA.test(e.belegHash || "")
    && (!Object.hasOwn(e, "unveraendertBelegHash") || SHA.test(e.unveraendertBelegHash));
  return ["keine-funde", "rohfassungen", "teilweise", "abruf-unbestaetigt"].includes(e?.art)
    && (!Object.hasOwn(e, "gespeicherteGoogleLinks") || (Number.isSafeInteger(e.gespeicherteGoogleLinks)
      && e.gespeicherteGoogleLinks > 0 && e.gespeicherteGoogleLinks <= 200))
    && Array.isArray(e.rohIds) && e.rohIds.length <= 200 && e.rohIds.every(v => /^rd-[a-f0-9]{64}$/.test(v))
    && Array.isArray(e.analyse) && e.analyse.length <= 200
    && e.analyse.every(a => /^rd-[a-f0-9]{64}$/.test(a?.rohId) && SHA.test(a.stand || "") && UUID.test(a.jobId || ""))
    && (e.art !== "rohfassungen" || e.rohIds.length > 0)
    && (e.art !== "keine-funde" || (!e.rohIds.length && !e.analyse.length));
}

function belegGueltig(beleg, auftrag) {
  if (!beleg || beleg.version !== 1 || !beleg.bindung || beleg.bindung !== quellbindung(auftrag)) return false;
  const { belegHash, ...basis } = beleg;
  return belegHash === hash(basis) && Date.parse(beleg.bestaetigtAm) >= Date.parse(auftrag.firstDueAt)
    && pruefeErgebnis(beleg.ergebnis);
}

function speicher({ request, storeId, now = Date.now, deadlineMs = Infinity }) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(storeId || "") || storeId.includes("-p-")) throw Error("quellenbeleg-konfiguration");
  const id = jobId => {
    if (!UUID.test(jobId || "")) throw Error("quellenbeleg-kennung");
    return storeId + "-quellenfaelligkeit-" + jobId;
  };
  const pruefeZeit = () => { if (now() >= deadlineMs) throw Error("quellenbeleg-zeitbudget"); };
  async function lesen(auftrag) {
    pruefeZeit();
    const rowId = id(auftrag.id);
    const rows = await request(`/rest/v1/helmut_store?id=eq.${rowId}&select=id,data`);
    pruefeZeit();
    if (!Array.isArray(rows) || rows.length > 1
      || (rows.length === 1 && (rows[0]?.id !== rowId || !belegGueltig(rows[0].data, auftrag))))
      throw Error("quellenbeleg-leseantwort");
    return rows[0]?.data || null;
  }
  return { lesen, async sichern(auftrag, ergebnis, jetztMs) {
    pruefeZeit();
    const basis = { version: 1, bindung: quellbindung(auftrag),
      bestaetigtAm: new Date(jetztMs).toISOString(), ergebnis };
    const data = { ...basis, belegHash: hash(basis) };
    if (!belegGueltig(data, auftrag)) throw Error("quellenbeleg-ungueltig");
    let rows;
    try {
      rows = await request("/rest/v1/helmut_store?select=id,data", { method: "POST",
        headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: id(auftrag.id), data }) });
    } catch { /* Eine verlorene Antwort entscheidet ausschließlich der Readback. */ }
    pruefeZeit();
    const bestaetigt = rows?.length === 1 && rows[0]?.id === id(auftrag.id) ? rows[0].data : await lesen(auftrag);
    if (!isDeepStrictEqual(bestaetigt, data)) throw Error("quellenbeleg-nicht-bestaetigt");
    return bestaetigt;
  }, id };
}

module.exports = { fristen, abrufIdentitaet, quellbindung, belegGueltig, speicher };
