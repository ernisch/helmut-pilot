"use strict";

// Betriebskosten-Abgleich: raeumt abgestorbene Reservierungen auf, ohne Geldbuch-
// Invarianten zu verletzen. Die reine Planung (bewerteOffene) ist offline testbar;
// wendeAn mutiert das Buch ausschliesslich ueber die bestehende mutateAuthStore-
// Schicht und validiert das Buch vorher und nachher mit pruefeBuch.
//
// Warum "ungeklaert" statt "nicht-gesendet": ein fehlender Nutzungsbeleg beweist
// NICHT, dass kein Provideraufruf stattfand (der Blob ist ein begrenzter
// Ringpuffer). Eine Freigabe auf 0 waere eine stille Kostenbehauptung. Nur ein
// EINDEUTIGER Nutzungsbeleg darf abrechnen; alles andere bleibt reserviert-gebunden
// und wird ehrlich als "ungeklaert" markiert.
const betriebskosten = require("./betriebskosten-budget");

const DEFAULT_STALENESS_MS = 6 * 3600000; // 6 Stunden
const DEFAULT_FENSTER_MS = 10 * 60000;    // 10 Minuten Zuordnungsfenster

function istStale(call, jetztMs, stalenessMs) {
  const t = Date.parse(call && call.createdAt);
  return Number.isFinite(t) && jetztMs - t >= stalenessMs;
}

function passendeBelege(call, usage, belegteIds, fensterMs) {
  const t0 = Date.parse(call && call.createdAt);
  if (!Number.isFinite(t0)) return [];
  return (Array.isArray(usage) ? usage : []).filter(e => e && !belegteIds.has(e.id)
    && e.runId === call.runId && e.callType === call.callType && e.model === call.model
    && (e.politicianId ?? null) === (call.politicianId ?? null)
    && Number.isSafeInteger(e.promptTokens) && e.promptTokens >= 0
    && Number.isSafeInteger(e.completionTokens) && e.completionTokens >= 0
    && (e.totalTokens === undefined || e.totalTokens === e.promptTokens + e.completionTokens)
    && Number.isFinite(Date.parse(e.createdAt))
    && Date.parse(e.createdAt) >= t0 && Date.parse(e.createdAt) - t0 <= fensterMs);
}

// REINE Planung. Liefert Aktionen, schreibt nichts.
function bewerteOffene(book, usage, { jetztMs = Date.now(),
  stalenessMs = DEFAULT_STALENESS_MS, fensterMs = DEFAULT_FENSTER_MS } = {}) {
  if (!book || typeof book.calls !== "object" || Array.isArray(book.calls)) {
    return { aktionen: [], fehler: "buch-unlesbar" };
  }
  const belegteIds = new Set(Object.values(book.calls)
    .filter(c => c && c.usageReceiptId).map(c => c.usageReceiptId));
  const aktionen = [];
  for (const call of Object.values(book.calls)) {
    if (!call) continue;
    if (call.status === "abgerechnet" || call.status === "nicht-gesendet") continue;
    if (!istStale(call, jetztMs, stalenessMs)) continue;
    const kandidaten = passendeBelege(call, usage, belegteIds, fensterMs);
    if (kandidaten.length === 1) {
      belegteIds.add(kandidaten[0].id);
      aktionen.push({ art: "abrechnen", callId: call.id, beleg: kandidaten[0] });
    } else {
      aktionen.push({ art: "ungeklaert", callId: call.id });
    }
  }
  return { aktionen, fehler: null };
}

// Wendet zuvor geplante Aktionen atomar an. Ein bereits terminaler oder nicht
// mehr passender Aufruf wird uebersprungen (idempotent). Wirft, wenn das Buch
// vorher oder nachher ungueltig ist — dann bleibt es unveraendert.
async function wendeAn(storage, aktionen) {
  if (!Array.isArray(aktionen) || aktionen.length === 0) return { abgerechnet: 0, ungeklaert: 0 };
  return storage.mutateAuthStore(auth => {
    const book = auth[betriebskosten.KEY];
    const vertrag = book && book.contract;
    betriebskosten.pruefeBuch(book, vertrag);
    let abgerechnet = 0, ungeklaert = 0;
    const belegteIds = new Set(Object.values(book.calls)
      .filter(c => c && c.usageReceiptId).map(c => c.usageReceiptId));
    for (const a of aktionen) {
      const call = book.calls[a.callId];
      if (!call || (call.status !== "reserviert" && call.status !== "ungeklaert")) continue;
      if (a.art === "abrechnen") {
        const beleg = a.beleg;
        const zeilen = (Array.isArray(auth.llmUsage) ? auth.llmUsage : []).filter(r => r && r.id === beleg.id);
        if (zeilen.length !== 1 || belegteIds.has(beleg.id)) continue;
        if (!["runId", "callType", "politicianId"].every(k => (beleg[k] ?? null) === (call[k] ?? null))) continue;
        const cost = betriebskosten.kosten(beleg.promptTokens, beleg.completionTokens);
        if (!(cost <= call.reserved)) continue;
        call.status = "abgerechnet"; call.cost = cost; call.usageReceiptId = beleg.id;
        book.bound -= call.reserved - cost;
        belegteIds.add(beleg.id);
        abgerechnet += 1;
      } else if (a.art === "ungeklaert") {
        call.status = "ungeklaert";
        ungeklaert += 1;
      }
    }
    betriebskosten.pruefeBuch(book, book.contract);
    return { abgerechnet, ungeklaert };
  });
}

module.exports = { bewerteOffene, wendeAn, DEFAULT_STALENESS_MS, DEFAULT_FENSTER_MS };
