"use strict";

// Sichert den belegten Azure-Tarif fuer gpt-5-mini-eu in der Preistabelle.
// Vor dem 24.11.2026 fehlte dieses Modell in LLM_PRICE_DEFAULTS, wodurch die
// Nutzungsprotokolle `estimatedCost: "unknown"` trugen und Kostenberichte 0 USD
// zeigten, obwohl das Betriebsbuch korrekt abrechnete.
const assert = require("node:assert/strict");
const { test } = require("node:test");

// Determinismus: die Preistabelle darf fuer diesen Test nicht von einer
// evtl. gesetzten Umgebungsvariablen ueberschrieben werden.
delete process.env.HELMUT_LLM_PRICE_JSON;

const storage = require("../lib/helmut/storage");

test("gpt-5-mini-eu traegt den belegten Tarif in der Preistabelle", () => {
  assert.deepEqual(storage.llmPriceTable()["gpt-5-mini-eu"], { in: 0.275, out: 2.2 });
});

test("estimateLlmCost rechnet gpt-5-mini-eu korrekt", () => {
  assert.equal(storage.estimateLlmCost("gpt-5-mini-eu", 7000, 1000), 0.004125);
});

test("unbekanntes Modell bleibt null (kein erfundener Preis)", () => {
  assert.equal(storage.estimateLlmCost("gibt-es-nicht", 7000, 1000), null);
});
