"use strict";

// Default AUS. Nur ein explizit bewaffneter, bereits freigegebener Endwaechter
// darf diesen Adapter verwenden. Keine Aktivierung, keine Snapshot-Uebertragung.
function erzeugeEndRuntime(V, optionen = {}) {
const VERSION = optionen.synthetik ? "helmut-synthetik500-status/1" : "helmut-realkohorte500-status/1";
const RPC_NAME = optionen.synthetik ? "helmut_synthetik500_ende" : "helmut_realkohorte500_ende";
const READ_RPC_NAME = optionen.synthetik ? "helmut_synthetik500_lesung" : "helmut_realkohorte500_lesung";
const BESTAETIGUNG = optionen.synthetik ? "GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN" : "GEBUNDENE_REAL500_NUR_DEAKTIVIEREN";
const fordere = V.fordere;
const exakt = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");

function pruefeAuftrag(a) {
  fordere(a && Object.keys(a).every(k => ["operationId", "manifestHash", "productionCommit", "grund"].includes(k))
    && (optionen.synthetik ? /^synthetik500-[a-zA-Z0-9_-]{8,100}$/ : /^real500-[a-zA-Z0-9_-]{8,100}$/).test(a.operationId || "")
    && /^[a-f0-9]{64}$/.test(a.manifestHash || "")
    && /^[a-f0-9]{40}$/.test(a.productionCommit || "")
    && [undefined, "frist", "notstopp"].includes(a.grund), "runtime-auftrag");
  return { operationId: a.operationId, manifestHash: a.manifestHash,
    productionCommit: a.productionCommit, grund: a.grund || "frist" };
}

function pruefeLesung(auftrag, r) {
  const a = pruefeAuftrag(auftrag);
  fordere(exakt(r, ["version", "operationId", "manifestHash", "profilManifestHash", "productionCommit", "paketHash", "idsHash",
    "beobachtetAm", "zustand", "gesamt", "identitaeten", "aktiv", "fremdUnveraendert",
    "fachfelderUnveraendert", "quittungBindungBestaetigt", "endeAm"]), "runtime-lesung-format");
  fordere(r.version === VERSION && r.operationId === a.operationId && r.manifestHash === a.manifestHash
    && /^[a-f0-9]{64}$/.test(r.profilManifestHash || "")
    && r.productionCommit === a.productionCommit && r.paketHash === V.PAKET_HASH && r.idsHash === V.IDS_HASH
    && V.zeit(r.beobachtetAm) && V.zeit(r.endeAm), "runtime-lesung-bindung");
  fordere(r.gesamt === 500 && r.identitaeten === 501 && Number.isInteger(r.aktiv) && r.aktiv >= 0 && r.aktiv <= 500
    && r.fremdUnveraendert === true && r.fachfelderUnveraendert === true && r.quittungBindungBestaetigt === true
    && ["vorbereitet", "aktiv", "beendet"].includes(r.zustand)
    && (r.zustand === "aktiv" || r.aktiv === 0), "runtime-lesung-zustand");
  return r;
}

function baueEndPayload(auftrag) {
  const a = pruefeAuftrag(auftrag);
  return { p_operation_id: a.operationId, p_manifest_hash: a.manifestHash,
    p_production_commit: a.productionCommit, p_grund: a.grund, p_bestaetigung: BESTAETIGUNG };
}

async function begrenzt(request, aufruf, timeoutMs) {
  fordere(typeof request === "function" && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000,
    "runtime-transport-zeitlimit");
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(); reject(new Error("real500-runtime-transport-zeitlimit"));
    }, timeoutMs);
  });
  try {
    // request muss denselben Signal auch beim vollstaendigen Antwortlesen
    // verwenden. Weder der Transport noch dieser Adapter darf Writes wiederholen.
    return await Promise.race([Promise.resolve().then(() => request({ ...aufruf, signal: controller.signal })), deadline]);
  } finally { clearTimeout(timer); }
}

async function lese({ auftrag, request, timeoutMs = 20000 }) {
  const a = pruefeAuftrag(auftrag);
  const params = new URLSearchParams({ p_operation_id: a.operationId,
    p_manifest_hash: a.manifestHash, p_production_commit: a.productionCommit });
  const r = await begrenzt(request, { methode: "GET", pfad: "/rest/v1/rpc/" + READ_RPC_NAME + "?" + params }, timeoutMs);
  return pruefeLesung(a, r);
}

async function beende({ auftrag, aktiviert = false, request, timeoutMs = 20000 }) {
  if (aktiviert !== true) return { zustand: "inaktiv", schreibversuche: 0 };
  const a = pruefeAuftrag(auftrag);
  const vorher = await lese({ auftrag: a, request, timeoutMs });
  if (vorher.zustand === "beendet") return { zustand: "beendet-bestaetigt", schreibversuche: 0, lesung: vorher };
  if (vorher.zustand === "vorbereitet") return { zustand: "vorbereitet-kein-ende", schreibversuche: 0, lesung: vorher };
  try {
    const r = await begrenzt(request, { methode: "POST", pfad: "/rest/v1/rpc/" + RPC_NAME,
      body: baueEndPayload(a) }, timeoutMs);
    const nach = pruefeLesung(a, r);
    fordere(nach.zustand === "beendet" && nach.aktiv === 0, "runtime-ende-nicht-bestaetigt");
    return { zustand: "beendet-bestaetigt", schreibversuche: 1, lesung: nach };
  } catch (error) {
    // Ein beobachtetes Ende beweist nach Antwortverlust keine eigene Wirkung.
    // Genau eine Gegenlesung, kein Write-Retry und keine weitere Leseschleife.
    let gegenlesung = null;
    try { gegenlesung = await lese({ auftrag: a, request, timeoutMs }); } catch { /* ungeklaert bleibt ungeklaert */ }
    return { zustand: "ausgang-unbekannt", schreibversuche: 1, eigeneSchreibwirkung: "unbekannt", gegenlesung,
      ursache: /^real500-[a-z0-9-]+$/.test(error?.message || "") ? error.message : "transport-oder-antwort-ungueltig" };
  }
}

return { VERSION, RPC_NAME, READ_RPC_NAME, BESTAETIGUNG, pruefeAuftrag, pruefeLesung, baueEndPayload, lese, beende };

}
module.exports = { ...erzeugeEndRuntime(require("./realkohorte-500-vertrag")), erzeugeEndRuntime };
