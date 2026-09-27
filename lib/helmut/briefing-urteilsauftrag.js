"use strict";

// Reine Logik fuer genau EINEN expliziten v2-Einzelauftrag (Roadmap3.1,
// Bereichsurteil): eine feste Auftragskennung, ein Berliner Tag und eine
// unveraenderliche Profilbindung. Kein Umgebungszugriff, keine frei
// einsetzbare Ausnahmenliste, kein Schreiben, kein Netz.
//
// Der Auftrag ist eine Konstante und nicht konfigurierbar: eine andere
// Kennung, ein anderer Tag oder eine andere Bindung ist kein weiterer
// Auftrag, sondern eine Ablehnung.
const { hash } = require("./briefing-speicher");
const fordere = (b, grund) => { if (!b) throw new Error(grund); };
const keys = (v, fields) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));

const AUFTRAG = Object.freeze({
  kennung: "bereichsurteil-20260927-a",
  tag: "2026-09-27",
  profilBindung: "0178727cc56dc0c9b8a0d17a655bfe434b0aecab80b92debed92e74175a4b869"
});
const AUFTRAGSFELDER = ["kennung", "tag", "profilBindung"];
const FREIGABEFELDER = ["version", "userId", "tag", "productionCommit", "urteilHash",
  "eingabeHash", "kontextHash", "maxNeuanlagen", "modellaufrufe", "gueltigBis", "auftrag"];

// Genau die Briefingspeicher-Hashfunktion, unveraendert: hash({id:userId,
// profilHash}). Die Bindung ist damit an die bestehende Speicherfunktion
// gebunden, nicht an eine zweite, abweichende Nachbildung.
function bindung(userId, profilHash) { return hash({ id: userId, profilHash }); }

function istAuftrag(auftrag) {
  return Boolean(keys(auftrag, AUFTRAGSFELDER))
    && AUFTRAGSFELDER.every(k => auftrag[k] === AUFTRAG[k]);
}

// Struktur, Auftrag und Tag VOR jedem neuen Lesezugriff. Eine v2-Freigabe ist
// wie v1, zusaetzlich mit genau diesem Auftrag.
function pruefeFreigabe(freigabe, userId) {
  fordere(keys(freigabe, FREIGABEFELDER) && freigabe.version === 2 && freigabe.userId === userId
    && freigabe.tag === AUFTRAG.tag && freigabe.maxNeuanlagen === 1 && freigabe.modellaufrufe === 0
    && /^[a-f0-9]{40}$/.test(freigabe.productionCommit || "")
    && [freigabe.urteilHash, freigabe.eingabeHash, freigabe.kontextHash].every(h => /^[a-f0-9]{64}$/.test(h || ""))
    && Number.isFinite(Date.parse(freigabe.gueltigBis))
    && istAuftrag(freigabe.auftrag), "urteilsimport-auftrag-abweichend");
}

// Writer UND Reader rechnen die echte Bindung erneut aus dem aktuellen
// Eingabeobjekt: nur genau Auftrag, Tag und Profilhash dieses Profils.
function pruefeBeleg(auftrag, userId, result) {
  fordere(istAuftrag(auftrag)
    && result?.eingabe?.mandat === userId && result.eingabe.tag === auftrag.tag
    && auftrag.profilBindung === bindung(userId, result.eingabe.profilHash),
  "urteilsimport-auftrag-bindung-abweichend");
}

module.exports = { AUFTRAG, bindung, istAuftrag, pruefeFreigabe, pruefeBeleg };
