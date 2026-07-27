"use strict";

// Resolver ALT vs. NEU an echten Production-Zuordnungen (Hotfix B4-3, Phase 7).
// =============================================================================
// AUSSCHLIESSLICH LESEND. Kein Write, kein KI-Aufruf, keine Kosten, keine
// Veraenderung an Production. Das Werkzeug beantwortet genau eine Frage:
//
//   Welche der HEUTE bestehenden Dokument-zu-Vorgang-Zuordnungen haette die neue
//   Beweisfamilien-Regel VERHINDERT — und waren darunter plausibel richtige?
//
// METHODE (bewusst konservativ und nachrechenbar):
// Fuer jeden Vorgang mit mindestens zwei verknuepften Rohdokumenten wird jede
// Zuordnung einzeln nachgestellt: das betrachtete Dokument gilt als "neuer
// Cluster", alle UEBRIGEN Dokumente desselben Vorgangs als "Bestand". Auf diese
// Konstellation werden beide Regelfassungen angewandt.
//
// EHRLICHE GRENZE — sie wird nicht kaschiert:
// Das ist eine REKONSTRUKTION, keine Aufzeichnung. Die echte Entscheidung fiel
// gegen den Bestand, wie er im Moment der Zuordnung aussah; hier steht der
// heutige Bestand. Fuer die Frage "haette die neue Regel diese Zuordnung
// getragen?" ist das die schaerfere Probe: der heutige Bestand ist groesser und
// damit belegreicher als der damalige. Eine hier abgelehnte Zuordnung waere also
// auch damals abgelehnt worden.
//
// Aufruf:
//   HELMUT_V3_STORE=1 node scripts/vorgangs-resolver-vergleich.js
//   HELMUT_V3_STORE=1 node scripts/vorgangs-resolver-vergleich.js --json
//   HELMUT_V3_STORE=1 node scripts/vorgangs-resolver-vergleich.js --vorgang=vg-angriffen

const path = require("path");
const root = path.join(__dirname, "..");
const V = require(path.join(root, "lib/helmut/vorgang-identity.js"));

// ---------------------------------------------------------------------------
// ALTFASSUNG der Beweisbewertung — Stand vor dem B4-3-Hotfix.
// Sie steht NUR hier und NUR zu Messzwecken, damit der Vergleich gegen den
// echten Altzustand laeuft und nicht gegen eine geschoente Rekonstruktion.
// Unterschied zur neuen Fassung, und nur dieser:
//   * Gewicht = Summe je ROHTREFFER (Flexionsformen zaehlen mehrfach)
//   * "generisch" = nur die alte Wortliste, ohne Ereignisfamilien
//   * keine Sonderregel fuer Ein-Dokument-Vorgaenge
// NICHT WIEDERVERWENDEN.
// ---------------------------------------------------------------------------
function altGenerisch(anchor) {
  return V.GENERISCHE_ANKER.has(String(anchor || ""));
}

function altUrteil(neueDocs, altDocs) {
  if (!neueDocs.length) return { gleich: false, grund: "kein-neues-dokument" };
  if (altDocs.length >= V.VORGANG_MAX_DOKUMENTE) return { gleich: false, grund: "vorgang-voll" };
  const kernBestand = altDocs.length ? V.coreAnchors(altDocs.map((d) => V.docAnchors(d))) : [];
  if (!kernBestand.length) return { gleich: false, grund: "bestand-ohne-kern" };
  const kernNeu = V.coreAnchors(neueDocs.map((d) => V.docAnchors(d)));
  if (!kernNeu.length) return { gleich: false, grund: "cluster-ohne-kern" };

  // Jahreskonflikt und Fortschreibungsfenster gab es in der Altfassung bereits —
  // sie muessen mitgeprueft werden, sonst schriebe der Vergleich der neuen Regel
  // Ablehnungen zu, die die alte genauso ausgesprochen haette.
  const jungsteAlt = altDocs.slice().sort((a, b) =>
    (Date.parse(b.published_at || b.created_at || "") || 0) - (Date.parse(a.published_at || a.created_at || "") || 0))[0];
  const aeltesteNeuDoc = neueDocs.slice().sort((a, b) =>
    (Date.parse(a.published_at || a.created_at || "") || 0) - (Date.parse(b.published_at || b.created_at || "") || 0))[0];
  if (jungsteAlt && aeltesteNeuDoc && V.jahresKonflikt(jungsteAlt, aeltesteNeuDoc)) {
    return { gleich: false, grund: "jahreskonflikt" };
  }

  const zeiten = altDocs.map((d) => Date.parse(d.published_at || d.created_at || "")).filter(Number.isFinite);
  const neuesteAlt = zeiten.length ? Math.max(...zeiten) : null;
  const neuZeiten = neueDocs.map((d) => Date.parse(d.published_at || d.created_at || "")).filter(Number.isFinite);
  const aeltesteNeu = neuZeiten.length ? Math.min(...neuZeiten) : null;
  if (neuesteAlt != null && aeltesteNeu != null
      && (aeltesteNeu - neuesteAlt) / 86400000 > V.VORGANG_FORTSCHREIBUNG_TAGE) {
    return { gleich: false, grund: "vorgang-zu-alt" };
  }

  // Die alte Ueberdeckung: Summe der Einzelstaerken, ohne Familienbildung.
  let gewicht = 0;
  let spezifisch = 0;
  for (const a of kernNeu) {
    let beste = 0;
    for (const b of kernBestand) {
      const s = V.matchStaerke(a, b);
      if (s > beste) beste = s;
      if (beste === 2) break;
    }
    if (beste > 0) { gewicht += beste; if (!altGenerisch(a)) spezifisch += 1; }
  }
  const noetig = Math.min(V.MIN_BEWEISGEWICHT, Math.ceil(kernBestand.length / 2));
  if (spezifisch < 1) return { gleich: false, grund: "kein-spezifischer-kerntreffer" };
  if (gewicht < noetig) return { gleich: false, grund: "kernueberdeckung-zu-schwach" };
  return { gleich: true, grund: "kernueberdeckung", gewicht, noetig };
}

function parseArgs(argv) {
  const a = { json: false, vorgang: null, limit: 4000, minDok: 2, beispiele: 15 };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    const [, name, wert] = m;
    if (name === "json") a.json = true;
    else if (name === "vorgang") a.vorgang = String(wert || "").trim() || null;
    else if (name === "limit") a.limit = Math.max(10, Number(wert) || 4000);
    else if (name === "beispiele") a.beispiele = Math.max(0, Number(wert) || 15);
    else { console.error(`Unbekanntes Argument: --${name}`); process.exit(2); }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  if (!storage.v3StoreReady()) {
    console.error("Benoetigt SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und HELMUT_V3_STORE=1 (nur lesend).");
    process.exit(3);
  }

  const [links, kos] = await Promise.all([
    storage.listKoDocumentLinks({ limit: 20000 }),
    storage.listKnowledgeObjectStates({ limit: args.limit, mitUeberschrift: true })
  ]);

  const jeKo = new Map();
  for (const l of links || []) {
    if (!l || !l.knowledge_object_id) continue;
    if (!jeKo.has(l.knowledge_object_id)) jeKo.set(l.knowledge_object_id, 0);
    jeKo.set(l.knowledge_object_id, jeKo.get(l.knowledge_object_id) + 1);
  }

  const kandidaten = (kos || [])
    .filter((k) => args.vorgang ? k.vorgang_id === args.vorgang : (jeKo.get(k.id) || 0) >= args.minDok)
    .sort((a, b) => (jeKo.get(b.id) || 0) - (jeKo.get(a.id) || 0));

  // Ist der betroffene Vorgang SELBST defekt? Eine verhinderte Zuordnung zu einem
  // Magnet- oder Uebernahme-Vorgang ist kein Verlust, sondern der Zweck der
  // Reparatur. Ohne diese Unterscheidung waere jede Zahl unten wertlos.
  const { bewerteVorgang } = require(path.join(root, "scripts/vorgangs-magnet-analyse.js"));

  const zaehler = {
    vorgaenge: 0, zuordnungen: 0,
    beideJa: 0, beideNein: 0, nurAltJa: 0, nurNeuJa: 0,
    verhindertInDefektemVorgang: 0, verhindertInGesundemVorgang: 0
  };
  const gruende = {};
  const verhindert = [];
  const jeVorgang = [];

  for (const ko of kandidaten) {
    const docs = await storage.listKoDocuments(ko.id, 400);
    if (!Array.isArray(docs) || docs.length < 2) continue;
    zaehler.vorgaenge += 1;
    const gesundheit = bewerteVorgang(ko.vorgang_id, docs);
    const vorgangDefekt = Boolean(gesundheit.auffaellig);
    let vAlt = 0;
    let vNeu = 0;
    for (const doc of docs) {
      const rest = docs.filter((x) => x && x.id !== doc.id);
      if (!rest.length) continue;
      zaehler.zuordnungen += 1;
      const a = altUrteil([doc], rest);
      const nRes = V.sameVorgang({ documents: [doc] }, { vorgangId: ko.vorgang_id, documents: rest });
      if (a.gleich) vAlt += 1;
      if (nRes.gleich) vNeu += 1;
      if (a.gleich && nRes.gleich) zaehler.beideJa += 1;
      else if (!a.gleich && !nRes.gleich) zaehler.beideNein += 1;
      else if (a.gleich && !nRes.gleich) {
        zaehler.nurAltJa += 1;
        gruende[nRes.grund] = (gruende[nRes.grund] || 0) + 1;
        if (vorgangDefekt) zaehler.verhindertInDefektemVorgang += 1;
        else zaehler.verhindertInGesundemVorgang += 1;
        const ueb = nRes.spur && nRes.spur.ueberdeckung;
        verhindert.push({
          vorgangId: ko.vorgang_id,
          dokument: doc.id,
          titel: String(doc.title || "").slice(0, 90),
          grund: nRes.grund,
          bestandsDokumente: rest.length,
          rohtreffer: ueb ? ueb.treffer : [],
          familien: ueb ? (ueb.familienBeleg || []).map((f) => `${f.familie}${f.generisch ? "*" : ""}`) : [],
          ueberschrift: String(ko.display_title || ko.headline || "").slice(0, 70),
          vorgangDefekt,
          vorgangBefund: vorgangDefekt
            ? (gesundheit.uebernahme ? "uebernahme" : gesundheit.magnet ? "magnet" : "gespalten")
            : "unauffaellig"
        });
      } else zaehler.nurNeuJa += 1;
    }
    jeVorgang.push({
      vorgangId: ko.vorgang_id, dokumente: docs.length,
      getragenAlt: vAlt, getragenNeu: vNeu,
      verlust: vAlt - vNeu,
      befund: gesundheit.uebernahme ? "uebernahme" : gesundheit.magnet ? "magnet" : gesundheit.gespalten ? "gespalten" : "unauffaellig",
      ueberschrift: String(ko.display_title || ko.headline || "").slice(0, 70)
    });
  }

  const anteil = (x) => zaehler.zuordnungen ? Math.round((x / zaehler.zuordnungen) * 1000) / 10 : 0;
  const ergebnis = {
    gemessenAm: new Date().toISOString(),
    methode: "je Vorgang jedes Dokument einzeln gegen die uebrigen Dokumente desselben Vorgangs",
    gepruefteVorgaenge: zaehler.vorgaenge,
    gepruefteZuordnungen: zaehler.zuordnungen,
    beideJa: zaehler.beideJa,
    beideNein: zaehler.beideNein,
    nurAltJa: zaehler.nurAltJa,
    nurNeuJa: zaehler.nurNeuJa,
    anteile: {
      beideJa: anteil(zaehler.beideJa), beideNein: anteil(zaehler.beideNein),
      nurAltJa: anteil(zaehler.nurAltJa), nurNeuJa: anteil(zaehler.nurNeuJa)
    },
    ablehnungsgruendeNeu: gruende,
    // Verhinderte Zuordnungen, bei denen die Evidenz AUSSCHLIESSLICH generisch
    // war — das sind die Faelle der Fehlerklasse B4-3.
    verhindertNurGenerisch: verhindert.filter((v) => v.familien.length && v.familien.every((f) => f.endsWith("*"))).length,
    verhindertGesamt: verhindert.length,
    verhindertInDefektemVorgang: zaehler.verhindertInDefektemVorgang,
    verhindertInGesundemVorgang: zaehler.verhindertInGesundemVorgang,
    beispiele: verhindert.slice(0, args.beispiele),
    vorgaengeMitVerlust: jeVorgang.filter((v) => v.verlust > 0).sort((a, b) => b.verlust - a.verlust).slice(0, 20)
  };

  if (args.json) { console.log(JSON.stringify(ergebnis, null, 2)); return process.exit(0); }

  console.log(`\nRESOLVER ALT vs. NEU an echten Production-Zuordnungen (read-only)\n`);
  console.log(`Geprueft: ${ergebnis.gepruefteVorgaenge} Vorgaenge · ${ergebnis.gepruefteZuordnungen} Zuordnungen\n`);
  console.log(`  beide tragen die Zuordnung : ${ergebnis.beideJa}  (${ergebnis.anteile.beideJa} %)`);
  console.log(`  beide lehnen ab            : ${ergebnis.beideNein}  (${ergebnis.anteile.beideNein} %)`);
  console.log(`  NUR ALT trug (neu verhindert): ${ergebnis.nurAltJa}  (${ergebnis.anteile.nurAltJa} %)`);
  console.log(`  NUR NEU traegt             : ${ergebnis.nurNeuJa}  (${ergebnis.anteile.nurNeuJa} %)`);
  console.log(`\nDavon mit AUSSCHLIESSLICH generischer Evidenz: ${ergebnis.verhindertNurGenerisch} von ${ergebnis.verhindertGesamt}`);
  console.log(`Verhinderte Zuordnungen in bereits DEFEKTEN Vorgaengen (Magnet/Uebernahme/gespalten): ${ergebnis.verhindertInDefektemVorgang}`);
  console.log(`Verhinderte Zuordnungen in unauffaelligen Vorgaengen (echtes True-Positive-Risiko): ${ergebnis.verhindertInGesundemVorgang}`);
  console.log(`\nAblehnungsgruende der neuen Regel: ${JSON.stringify(ergebnis.ablehnungsgruendeNeu)}`);
  if (ergebnis.beispiele.length) {
    console.log(`\nBEISPIELE verhinderter Zuordnungen (* = generische Familie):`);
    for (const b of ergebnis.beispiele) {
      console.log(`  ${b.vorgangId}  <- ${b.dokument}`);
      console.log(`     "${b.titel}"`);
      console.log(`     Vorgang: "${b.ueberschrift}" (${b.bestandsDokumente} Bestandsdokumente)`);
      console.log(`     Grund: ${b.grund} · Rohtreffer ${JSON.stringify(b.rohtreffer)} · Familien ${JSON.stringify(b.familien)}`);
    }
  }
  if (ergebnis.vorgaengeMitVerlust.length) {
    console.log(`\nVORGAENGE MIT DEN MEISTEN VERHINDERTEN ZUORDNUNGEN:`);
    for (const v of ergebnis.vorgaengeMitVerlust) {
      console.log(`  ${String(v.vorgangId).slice(0, 42).padEnd(42)} ${String(v.dokumente).padStart(4)} Dok · alt ${v.getragenAlt} / neu ${v.getragenNeu} · ${v.befund.padEnd(12)} "${v.ueberschrift}"`);
    }
  }
  console.log("\nKEINE Production-Daten veraendert — dieses Werkzeug rechnet ausschliesslich nach.");
  return process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("Fehler:", e && e.message); process.exit(1); });
}

module.exports = { parseArgs, altUrteil };
