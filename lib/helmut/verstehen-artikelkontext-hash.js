"use strict";

// Reine gemeinsame Hashformel. Der Prompt muss zuvor durch den bestehenden
// buildUnderstandingPrompt-/Artikelbelegvertrag erzeugt und validiert werden.
// Kein Beleg-Opt-in, Client, CAS, Budget oder geaenderter Plain-Vertrag hier.
const crypto = require("node:crypto");
const V = require("./verstehen-vertrag");
function eingabeHash(hashBasis, prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0)
    throw new Error("artikelkontext-prompt-fehlt");
  const basis = V.eingabeHash(hashBasis);
  return crypto.createHash("sha256")
    .update(JSON.stringify(["artikelkontext-v1", basis, prompt])).digest("hex").slice(0, 40);
}
module.exports = { eingabeHash };
