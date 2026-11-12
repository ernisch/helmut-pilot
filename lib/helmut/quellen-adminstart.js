"use strict";

// Nur technische Metadaten. Kein eigener Motor, kein Reset und keine Sonderfreigabe.
function auftragGueltig(a) {
  return Boolean(a && typeof a === "object" && !Array.isArray(a)
    && Object.keys(a).length === 2 && typeof a.tag === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(a.tag)
    && typeof a.auftragId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.auftragId));
}
const laufId = a => `admin-quellen-${a.tag}-${a.auftragId}`;
const zahl = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const grund = v => typeof v === "string" && /^[a-z0-9|:_-]{1,160}$/.test(v) ? v : null;

function ergebnis(a, r) {
  const status = r?.lauftelemetrie?.status;
  const bestaetigt = r?.lauftelemetrie?.ende === true;
  const abgeschlossen = r?.ok === true && status === "success" && bestaetigt;
  const limitGrund = r?.grund === "arbeitslimit-tagesgrenze" ? (
    r.limit === "quellenarbeit|fenster" ? "fensterkontingent-erschoepft"
      : r.limit === "quellenarbeit|reservierte-sekunden" ? "sekundenkontingent-erschoepft"
        : r.limit?.startsWith("quellenarbeit|slot|admin|") ? "adminauftrag-bereits-verbraucht" : null
  ) : null;
  return {
    auftragId: a.auftragId, tag: a.tag, laufId: laufId(a), ok: abgeschlossen,
    zustand: r?.uebersprungen === true ? "gesperrt" : abgeschlossen ? "abgeschlossen"
      : bestaetigt ? "teilweise" : "unbekannt",
    grund: limitGrund || grund(r?.grund || r?.reason || r?.lauftelemetrie?.fehlerklasse || r?.planung?.grund)
      || (abgeschlossen ? null : "abschluss-nicht-bestaetigt"),
    verarbeitet: zahl(r?.verarbeitung?.erledigt), reserviert: zahl(r?.verarbeitung?.reserviert),
    zurueckgestellt: zahl(r?.verarbeitung?.zurueckgestellt), fehlgeschlagen: zahl(r?.verarbeitung?.endgueltigFehlgeschlagen),
    planAusstehend: zahl(r?.planung?.ausstehend), quittungGespeichert: bestaetigt
  };
}

async function leseStatus(a, deps = {}) {
  if (!auftragGueltig(a)) { const e = new Error("Ungueltiger Quellenauftrag."); e.statusCode = 400; throw e; }
  const id = laufId(a);
  try {
    // Nur kanonische Quittungen: ein ausgefallener Leser ist kein leerer/erfolgreicher Lauf.
    const rows = await (deps.lese || (o => require("./storage").listProcessRunsRelational(o)))({ process: "warteschlange-crawl", limit: 100 });
    if (!Array.isArray(rows)) throw new Error("ungueltige-quittungsantwort");
    const r = rows.find(x => x?.runId === id && x.process === "warteschlange-crawl");
    if (!r) return { laufId: id, zustand: "unbekannt", grund: "kein-laufbeleg" };
    const fertig = typeof r.finishedAt === "string" && Number.isFinite(Date.parse(r.finishedAt));
    const laufzeitAbgelaufen = r.status === "running" && Number.isFinite(Date.parse(r.startedAt))
      && Date.now() >= Date.parse(r.startedAt) + 300000;
    const laeuft = r.status === "running" && Number.isFinite(Date.parse(r.startedAt))
      && Date.now() < Date.parse(r.startedAt) + 300000;
    return { laufId: id, zustand: r.status === "running" ? (laeuft ? "laeuft" : "unbekannt")
      : !fertig ? "unbekannt" : r.status === "success" ? "abgeschlossen"
        : ["partial", "failed", "timeout"].includes(r.status) ? "teilweise" : "unbekannt",
      grund: r.status === "running" && !laeuft ? "laufzeit-ohne-abschlussbeleg" : grund(r.fehlerklasse || r.reason),
      laufzeitAbgelaufen, verarbeitet: zahl(r.processed),
      reserviert: zahl(r.zielmenge), zurueckgestellt: zahl(r.deferred), fehlgeschlagen: zahl(r.fehlgeschlagen) };
  } catch (_) { return { laufId: id, zustand: "unbekannt", grund: "laufbeleg-nicht-lesbar" }; }
}

module.exports = { auftragGueltig, laufId, ergebnis, leseStatus };
