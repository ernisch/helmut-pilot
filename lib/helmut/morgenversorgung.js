"use strict";

// Laufquittung, gespeichertes Paket und fachliche Abnahme sind getrennte Belege.
// Verwendet ausschliesslich den vorhandenen bedingten Paketspeicher; keine KI.
const B = require("./briefing-speicher");
const E = require("./lage-quellenbeleg");
const { berlinTagKey } = require("./briefing-frische");

async function speicherePaket({ profile, userId, briefing, storage, tag, now = new Date() }) {
  if (berlinTagKey(now) !== tag) throw new Error("morgenpaket-tag-abweichend");
  await B.materialisiere({ profile, userId, briefing, storage, now });
  const row = await B.lese({ userId, day: tag, profile, storage });
  if (!row) throw new Error("morgenpaket-nicht-bestaetigt");
  // Auch bereits vorhandene Pakete am aktuellen Vertrag pruefen. Ein altes
  // gespeichertes Gruen ersetzt weder die Inhaltspruefung noch die Quellenbindung.
  const inhalt = B.pruefeInhalt(row.payload.briefing, row.payload.lage);
  const vollstaendig = inhalt.strukturellVollstaendig
    && E.gespeicherterTextGueltig(row.payload.lage);
  return { briefing: row.payload.briefing, beleg: {
    tag, gespeichert: true, verifiziert: true, vollstaendig,
    // Keine neue fachliche Pruefung durch diesen technischen Speicherpfad.
    fachlichGeprueft: false
  } };
}

function bilanziere(summary, tag, vertragAktiv) {
  const rows = summary.results || [];
  const ziel = Number(summary.tenants) || 0;
  const eindeutig = new Map();
  for (const r of rows) {
    if (!r?.politicianId) continue;
    // Doppelte oder widersprechende Ausgaenge sind keine doppelte Versorgung.
    eindeutig.set(r.politicianId, eindeutig.has(r.politicianId) ? null : r);
  }
  const ergebnisse = [...eindeutig.values()].filter(Boolean);
  const quittung = r => r.frischeBeleg?.tag === tag && r.frischeBeleg.status === "erfolg"
    && (r.frischeBeleg.verifiziert === true || r.frischeBeleg.wiederholung === true);
  const paket = r => r.paketBeleg?.tag === tag && r.paketBeleg.gespeichert === true
    && r.paketBeleg.verifiziert === true;
  const vollstaendigePakete = ergebnisse.filter(r => paket(r) && r.paketBeleg.vollstaendig === true).length;
  const versorgt = ergebnisse.filter(r => quittung(r) && paket(r) && r.paketBeleg.vollstaendig === true).length;
  const fehlt = Math.max(0, ziel - versorgt);
  const fehlgeschlagen = ergebnisse.filter(r => r.failed || r.ok === false).length;
  const vollstaendig = vertragAktiv && versorgt === ziel && !summary.fairnessGestoert && summary.ok !== false;
  const status = summary.ok === false || (ziel > 0 && fehlgeschlagen === ziel) ? "failed"
    : summary.fairnessGestoert || fehlgeschlagen > 0 || (vertragAktiv && !vollstaendig) ? "partial" : "success";
  return { tag, ziel, quittungen: ergebnisse.filter(quittung).length,
    paketeGespeichert: ergebnisse.filter(paket).length, vollstaendigePakete,
    versorgt, fehlt, fehlgeschlagen, vollstaendig, status, fachlicheAbnahme: "offen" };
}

module.exports = { speicherePaket, bilanziere };
