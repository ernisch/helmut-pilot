"use strict";

// Bedienerwerkzeug für den isolierten Azure Pilot. Der bestehende Kostenvertrag
// und der Morgenlauf werden hier weder aufgerufen noch umgangen.
const { isDeepStrictEqual } = require("node:util");
const B = require("./briefing-speicher");
const { berlinTagKey, VERTRAG_VERSION } = require("./briefing-frische");
const { quittiert } = require("./briefing-ausgabebeleg");
const { pruefeGespeichertenHelmutStand } = require("./briefingContract");
const P = require("./prosa-einordnung");
const AI = require("./prosa-einordnung-ai");

function binde({ paket, lauf, basis, faktenPlan, terminQuellen = {} }) {
  const { profile, tag } = basis;
  const now = new Date(lauf?.erzeugtAm);
  if (!Number.isFinite(now.getTime()) || berlinTagKey(now) !== tag || lauf.berlinTag !== tag
    || lauf.tenantId !== profile.id || lauf.vertragVersion !== VERTRAG_VERSION
    || lauf.status !== "erfolg" || lauf.ausgabeBeleg?.version !== 2 || !quittiert(lauf, paket))
    throw new Error("briefing-sol-morgenquittung-fehlt");
  B.pruefeZeile(paket, { userId: profile.id, day: tag, profile });
  const { briefing } = paket.payload;
  const gespeichert = briefing.currentHelmutState;
  if (!briefing.available || !gespeichert?.primaryItem || gespeichert.profileId !== profile.id
    || gespeichert.tenantId !== profile.id || gespeichert.errorState)
    throw new Error("briefing-sol-tagesprioritaet-fehlt");

  const { stand, abgewiesen } = pruefeGespeichertenHelmutStand(gespeichert, profile, now, terminQuellen);
  if (abgewiesen || !stand.primaryItem || stand.primaryItem.id !== gespeichert.primaryItem.id
    || !isDeepStrictEqual(stand.items.map(i => i.id), gespeichert.items?.map(i => i.id)))
    throw new Error("briefing-sol-prioritaeten-abweichend");
  const prioritaeten = [{ item: stand.primaryItem, anlass: stand.tagesAnlass },
    ...stand.items.map(item => ({ item, anlass: item.tagesAnlass }))];
  const titelGebunden = (q, item) => q.titel === "" || briefing.items?.some(v =>
    v.vorgangId === item.id && v.sources?.some(s => s.url === q.url && s.title === q.titel
      && s.publishedAt === q.veroeffentlichtAm && !s.publishedAtConflict));
  if (basis.quellen.length !== prioritaeten.length
    || !prioritaeten.every(({ item, anlass }) => basis.quellen.some(q =>
      q.vorgangId === item.id && q.id === anlass.beleg.documentId && q.url === anlass.beleg.url
      && q.auszug === anlass.beleg.text && q.veroeffentlichtAm === anlass.beleg.publishedAt
      && titelGebunden(q, item)))
    || basis.fakten.some(f => f.stelle?.feld !== "auszug"))
    throw new Error("briefing-sol-originalbelege-abweichend");

  const prosa = { basis: structuredClone(basis), faktenPlan: structuredClone(faktenPlan), bereich: "briefing" };
  const vertrag = P.binde(prosa);
  const reihenfolge = prioritaeten.map(({ item }) => item.id);
  const vorbereite = entwurf => {
    const pruefeingabe = vertrag.vorbereite(entwurf);
    if (!isDeepStrictEqual(pruefeingabe.bloecke.map(b => b.vorgangId), reihenfolge))
      throw new Error("briefing-sol-prioritaeten-abweichend");
    return pruefeingabe;
  };
  function entwurfsAnfrage() {
    const { mandat, profilHash, ...modellEingabe } = vertrag.eingabe();
    const input = P.entwurfsPrompt({ eingabe: () => modellEingabe })
      + "\nÜbernimm genau die belegten Prioritäten in der Reihenfolge des Faktenplans. "
      + "Für die Option keine zusätzliche Pflicht, Frist oder Zuständigkeit ableiten. "
      + "Sprich die lesende Person mit Sie an.";
    return { model: "helmut-briefing-test-sol62", input, store: false, max_output_tokens: 1600,
      reasoning: { effort: "medium" },
      text: { format: { type: "json_schema", name: "briefingredaktion", strict: true, schema: AI.entwurfSchema(vertrag) } } };
  }
  function pruefauftrag(entwurf) {
    const { mandat, profilHash, ...eingabe } = vorbereite(entwurf);
    return { eingabeHash: eingabe.eingabeHash, prompt: P.pruefPrompt(eingabe), schema: AI.PRUEF_SCHEMA };
  }
  function vorschau(entwurf, urteil) {
    vorbereite(entwurf);
    return require("./prosa-vorschau").erzeuge({ ...prosa, entwurf, urteil });
  }
  return Object.freeze({ entwurfsAnfrage, pruefauftrag, vorschau });
}

if (require.main === module) {
  try {
    const daten = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const pilot = binde(daten);
    let ausgabe;
    switch (process.argv[2]) {
      case "entwurf": ausgabe = pilot.entwurfsAnfrage(); break;
      case "pruefung": ausgabe = pilot.pruefauftrag(daten.entwurf); break;
      case "vorschau": ausgabe = require("./prosa-vorschau").lese(pilot.vorschau(daten.entwurf, daten.urteil), {
        profile: daten.basis.profile, userId: daten.basis.profile.id, tag: daten.basis.tag, bereich: "briefing"
      }); break;
      default: throw new Error("briefing-sol-modus-ungueltig");
    }
    console.log(JSON.stringify(ausgabe, null, 2));
  } catch (error) {
    console.error(/^briefing-sol-[a-z-]+$/.test(error.message) ? error.message : "briefing-sol-pruefung-abgewiesen");
    process.exitCode = 1;
  }
}

module.exports = { binde };
