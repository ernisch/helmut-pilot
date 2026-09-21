"use strict";

// Vorbereiteter expliziter Adapter, kein Cron, HTTP Handler oder Autoaufrufer.
// Ein spaeterer bezahlter Versuch braucht seinen eigenen Betreiberauftrag und
// dauerhafte Vorflug-/Antwortbelege. Die Rueckrufe sind keine Kostenfreigabe.
const P = require("./prosa-einordnung");
const { hash } = require("./briefing-speicher");
const object = properties => ({ type: "object", additionalProperties: false,
  required: Object.keys(properties), properties });
const string = { type: "string" };
const bool = { type: "boolean" };
const ENTWURF_SCHEMA = object({ bloecke: { type: "array", items: object({
  faktIds: { type: "array", items: string },
  mandatsbezug: object({ feld: string, wert: string }),
  einordnung: object(Object.fromEntries(P.FELDER.map(k => [k, { type: ["string", "null"] }])))
}) } });

function entwurfSchema(vertrag) {
  const bezuege = vertrag.eingabe().mandatsbezuege;
  if (!bezuege.length) throw new Error("prosa-einordnung-profil-auswahl-fehlt");
  const schema = structuredClone(ENTWURF_SCHEMA);
  // Sechs kleine Alternativen statt frei erfundener Feldnamen oder Kreuzprodukte.
  // anyOf bleibt verschachtelt; jede Alternative bindet Feld UND dessen Werte.
  schema.properties.bloecke.items.properties.mandatsbezug = { anyOf:
    [...new Set(bezuege.map(x => x.feld))].map(feld => object({
      feld: { type: "string", enum: [feld] },
      wert: { type: "string", enum: bezuege.filter(x => x.feld === feld).map(x => x.wert) }
    })) };
  return schema;
}
const PRUEF_SCHEMA = object({ version: { type: "integer" }, eingabeHash: string,
  pruefungen: { type: "array", items: object({ block: { type: "integer" }, feld: { type: "string", enum: P.FELDER },
    status: { type: "string", enum: ["plausibel", "widersprochen", "unklar"] },
    ...Object.fromEntries(P.URTEILFELDER.map(k => [k, bool])), begruendung: string }) },
  vergleiche: { type: "array", items: object({ a: { type: "integer" }, b: { type: "integer" },
    eigenstaendigeSachverhalte: bool, begruendung: string }) } });

async function erzeuge({ basis, faktenPlan, bereich, runId, beforeCall, onResponse }, deps = {}) {
  if (!/^nachlauf500-[0-9]{5,20}$/.test(runId || "")
    || typeof beforeCall !== "function" || typeof onResponse !== "function")
    throw new Error("prosa-einordnung-ausfuehrungsbeleg-fehlt");
  // Eingaben VOR dem ersten await kopieren. Ein Callback kann die gebundenen
  // Fakten/Profilkopien, Modellkennung oder Pruefeingabe nicht nachtraeglich tauschen.
  const vertrag = P.binde({ basis, faktenPlan, bereich });
  const schema = entwurfSchema(vertrag); // Vor jedem Kosten- oder Speicherhook.
  const mandat = vertrag.eingabe().mandat;
  const ai = deps.ai || require("./ai");
  const model = ai.understandingModelName();
  if (model !== "gpt-5-mini") throw new Error("prosa-einordnung-modell-abweichend");
  async function call(phase, prompt, schema) {
    await beforeCall({ runId, phase, mandat, basisHash: vertrag.basisHash });
    // Bestehender Kostenriegel reserviert unveraendert das volle Kontextlimit
    // und maximal3000 Ausgabetoken je Aufruf. Kein Budgetbypass, kein Retry.
    const raw = await ai.requestStructuredJson(prompt, schema, {
      callType: "prosaEinordnung", politicianId: mandat, runId, testKostenPhase: phase
    }, model, { strict: true, reasoningEffort: "low" });
    const antwort = structuredClone(raw);
    const quittung = await onResponse({ runId, phase, mandat, basisHash: vertrag.basisHash,
      antwort: structuredClone(antwort) });
    const erwartet = { gespeichert: true, runId, phase, mandat,
      basisHash: vertrag.basisHash, antwortHash: hash(antwort) };
    if (!quittung || hash(quittung) !== hash(erwartet))
      throw new Error("prosa-einordnung-antwort-nicht-bestaetigt");
    return antwort;
  }
  const entwurf = await call("entwurf", P.entwurfsPrompt(vertrag), schema);
  const eingabe = vertrag.vorbereite(entwurf);
  const urteil = await call("pruefung", P.pruefPrompt(eingabe), PRUEF_SCHEMA);
  const ausgabe = vertrag.formuliere(entwurf, urteil);
  return { entwurf, urteil, ausgabe, text: P.textAusgabe(ausgabe) };
}
module.exports = { ENTWURF_SCHEMA, PRUEF_SCHEMA, entwurfSchema, erzeuge };
