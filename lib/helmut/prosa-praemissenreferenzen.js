"use strict";

// Quellenbindung im Anbieterformat. Der unveraenderte Serververtrag bleibt
// zusaetzlich Pflicht. Exakte Zitate beweisen weiterhin keine Bedeutung.
const P = require("./prosa-praemissenpruefung");
function schema(vertrag) {
  const e = vertrag.eingabe(), out = structuredClone(P.SCHEMA);
  out.properties.version.enum = [1];
  // SCHEMA teilt String-Bausteine. structuredClone erhaelt diese Aliase;
  // gebundene Felder deshalb ersetzen statt ihren gemeinsamen Knoten aendern.
  out.properties.eingabeHash = { ...out.properties.eingabeHash, enum: [e.eingabeHash] };
  out.properties.faelle.items = { anyOf: e.faelle.map(f => {
    const fall = structuredClone(P.SCHEMA.properties.faelle.items);
    fall.properties.id = { ...fall.properties.id, enum: [f.id] };
    const praemisse = fall.properties.praemissen.items;
    praemisse.properties.satz.enum = f.saetze.map(s => s.index);
    praemisse.properties.belege.items = { anyOf: [...f.quellen, ...f.profil].map(r => {
      // Dieser begrenzte Methodenvergleich verwendet kurze vollstaendige
      // Originalstellen. Zu lange Eingaben werden nicht still abgeschnitten.
      if (r.text.length > 1200) throw new Error("praemissenreferenzen-stelle-zu-lang");
      return { type: "object", additionalProperties: false, required: ["referenz", "zitat"],
        properties: { referenz: { type: "string", enum: [r.id] },
          zitat: { type: "string", enum: [r.text] } } };
    }) };
    return fall;
  }) };
  return out;
}
function prompt(vertrag) {
  schema(vertrag); // Dieselbe Eingabegrenze vor einem kostenpflichtigen Aufruf.
  const original = P.prompt(vertrag), marker = "PRUEFEINGABE: ";
  const index = original.indexOf(marker);
  return original.slice(0, index)
    + "AUSGABEVERTRAG: Belege sind ausschliesslich die gelieferten Quellen und Profilstellen. "
    + "Die Fallkennung und der zu pruefende Satz sind KEINE Belegreferenzen. "
    + "Waehle als Zitat immer den vollstaendigen unveraenderten Text der ausgewaehlten Originalstelle. "
    + "Fuer die reine sprachliche Einordnung als Vorschlag oder Moeglichkeit darf belege leer sein. "
    + "Die darin vorausgesetzten Sachangaben bleiben eigene Pruefzeilen mit Quellenbelegen oder offenem Befund. "
    + "Ein verfuegbares Zitat traegt nicht automatisch die Behauptung; aendere deshalb kein Sachurteil nur um einen Beleg einzutragen.\n"
    + original.slice(index);
}
module.exports = { schema, prompt };
