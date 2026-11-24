"use strict";

// Betriebskosten-Abgleich — Trockenlauf (Standard) oder Anwendung (--apply).
// Schreibt ausschliesslich bei --apply und nur ueber lib/helmut/betriebskosten-abgleich.
// Gibt keine Secrets, Betrags- und Laufdetails nur gekuerzt aus.
const storage = require("../lib/helmut/storage");
const betriebskosten = require("../lib/helmut/betriebskosten-budget");
const abgleich = require("../lib/helmut/betriebskosten-abgleich");

function usd(microUsd) { return +(microUsd / 1e6).toFixed(6); }

async function main() {
  const apply = process.argv.includes("--apply");
  const auth = await storage.readAuthStore({ strict: true, fields: [betriebskosten.KEY, "llmUsage"] });
  const book = auth[betriebskosten.KEY];
  if (!book) { console.log(JSON.stringify({ ergebnis: "kein-betriebsbuch" })); return; }
  const usage = Array.isArray(auth.llmUsage) ? auth.llmUsage : [];
  const { aktionen, fehler } = abgleich.bewerteOffene(book, usage, { jetztMs: Date.now() });
  if (fehler) { console.log(JSON.stringify({ fehler })); process.exitCode = 1; return; }

  const offen = Object.values(book.calls).filter(c => c.status !== "abgerechnet" && c.status !== "nicht-gesendet").length;
  if (!apply) {
    for (const a of aktionen) {
      const call = book.calls[a.callId];
      const zeile = { art: a.art, tag: call.day, reserviertUsd: usd(call.reserved), run: String(call.runId || "").slice(0, 8) };
      if (a.art === "abrechnen") zeile.kostenUsd = usd(betriebskosten.kosten(a.beleg.promptTokens, a.beleg.completionTokens));
      console.log(JSON.stringify(zeile));
    }
  }
  console.log(JSON.stringify({
    trockenlauf: !apply,
    gebundenVorherUsd: usd(book.bound),
    offeneBuchungen: offen,
    aktionen: aktionen.length,
    abrechnen: aktionen.filter(a => a.art === "abrechnen").length,
    ungeklaert: aktionen.filter(a => a.art === "ungeklaert").length
  }));

  if (apply && aktionen.length) {
    const ergebnis = await abgleich.wendeAn(storage, aktionen);
    const nachher = await storage.readAuthStore({ strict: true, fields: [betriebskosten.KEY] });
    console.log(JSON.stringify({ angewendet: ergebnis, gebundenNachherUsd: usd(nachher[betriebskosten.KEY].bound) }));
  }
}

main().catch(() => {
  console.error(JSON.stringify({ fehler: "abgleich-fehler" }));
  process.exitCode = 1;
});
