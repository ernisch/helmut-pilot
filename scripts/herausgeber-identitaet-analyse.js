"use strict";

// Herausgebernamen in bestehenden Production-Vorgaengen — Hotfix B4-4, Phase 4/7.
// =============================================================================
// AUSSCHLIESSLICH LESEND. Kein Write, kein KI-Aufruf, keine Kosten, keine
// Veraenderung an Production. Das Werkzeug beantwortet vier Fragen:
//
//   F1  Wie viele Vorgaenge tragen einen Herausgebernamen als THEMENWURZEL ihrer
//       Kennung? (Beleg dafuer, dass Mediennamen Identitaet gestiftet haben.)
//   F2  Wie viele Rohdokumente tragen ueberhaupt einen Herausgebernamen unter
//       ihren Ankern — und wie viele verlieren ihn durch die Suffixkuerzung?
//   F3  Wie viele Vorgaenge werden AUSSCHLIESSLICH durch Herausgebernamen
//       zusammengehalten (kein gemeinsamer Sachanker)?
//   F4  Welche der heute bestehenden Dokument-zu-Vorgang-Zuordnungen wuerde die
//       neue Regel anders bewerten — und welche davon trug allein der
//       Herausgebername?
//
// METHODE (bewusst konservativ, nachrechenbar):
// Fuer jeden Vorgang mit mindestens zwei verknuepften Rohdokumenten wird jede
// Zuordnung einzeln nachgestellt: das betrachtete Dokument gilt als "neuer
// Cluster", alle UEBRIGEN Dokumente desselben Vorgangs als "Bestand". Auf diese
// Konstellation werden beide Regelfassungen angewandt.
//
// EHRLICHE GRENZE — sie wird nicht kaschiert:
// Das ist eine REKONSTRUKTION, keine Aufzeichnung. Die echte Entscheidung fiel
// gegen den Bestand im Moment der Zuordnung; hier steht der heutige Bestand.
// Fuer die Frage "haette die neue Regel diese Zuordnung getragen?" ist das die
// schaerfere Probe: der heutige Bestand ist belegreicher als der damalige.
//
// Aufruf:
//   HELMUT_V3_STORE=1 node scripts/herausgeber-identitaet-analyse.js
//   HELMUT_V3_STORE=1 node scripts/herausgeber-identitaet-analyse.js --json
//   HELMUT_V3_STORE=1 node scripts/herausgeber-identitaet-analyse.js --tage=30

const path = require("path");
const root = path.join(__dirname, "..");
const V = require(path.join(root, "lib/helmut/vorgang-identity.js"));
const H = require(path.join(root, "lib/helmut/herausgeber.js"));

// ---------------------------------------------------------------------------
// REKONSTRUKTION DES STANDES VOR B4-4 — nur zu Messzwecken, nicht wiederverwenden.
// Unterschied zur heutigen Fassung, und nur dieser:
//   * Anker aus dem UNGEKUERZTEN Titel (Herausgebersuffix bleibt drin)
//   * "generisch" ohne die Herausgeberliste
// Alles andere (Beweisfamilien, Ein-Dokument-Regel, Zeitfenster) ist der Stand
// nach B4-3 und bleibt unangetastet — sonst mischte die Messung zwei Reparaturen.
// ---------------------------------------------------------------------------
const altAnker = (d) => V.anchorTokens(`${(d && d.title) || ""} ${(d && d.summary) || ""}`);

function altGenerisch(a) {
  const x = String(a || "");
  if (V.GENERISCHE_ANKER.has(x) || V.GENERISCHE_FUNKTIONSWOERTER.has(x)) return true;
  const familie = V.beweisfamilie(x);
  return V.GENERISCHE_FAMILIEN.has(familie) || V.GENERISCHE_ANKER.has(familie);
}

function altStaerke(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return 0;
  if (V.isYear(x) || V.isYear(y)) return x === y ? 1 : 0;
  if (x === y) {
    if (altGenerisch(x)) return 1;
    if (x.length >= V.STRONG_ANCHOR_LEN) return 2;
    if (x.length <= V.ACRONYM_STRONG_MAX_LEN && !V.HAEUFIGE_ABKUERZUNGEN.has(x)) return 2;
    return 1;
  }
  if (V.WORTFAMILIEN.has(x) && V.WORTFAMILIEN.has(y) && V.beweisfamilie(x) === V.beweisfamilie(y)) return 1;
  const kurz = x.length <= y.length ? x : y;
  const lang = x.length <= y.length ? y : x;
  if (lang.startsWith(kurz) && kurz.length >= V.ANCHOR_MIN_LEN && (lang.length - kurz.length) <= V.PREFIX_MAX_DELTA) return 1;
  if (kurz.length >= V.COMPOUND_MIN_LEN && lang.includes(kurz)) return altGenerisch(kurz) ? 1 : 2;
  return 0;
}

// Kernanker nach alter Lesart: Anker, die mindestens die Haelfte der Dokumente
// tragen. Die Treffererkennung selbst ist identisch (sie haengt nicht davon ab,
// was als generisch gilt) — nur die Ankermengen sind ungekuerzt.
function altKern(perDoc) {
  const n = perDoc.length;
  if (!n) return [];
  const schwelle = Math.ceil(n / 2);
  const alle = [...new Set(perDoc.flat())];
  return alle.filter((a) => perDoc.filter((liste) => liste.some((x) => altStaerke(x, a) > 0)).length >= schwelle).sort();
}

// Herausgeberwoerter der beteiligten Dokumente: alles, was in HERAUSGEBERPOSITION
// stand. WICHTIG fuer die Ursachenzuordnung — der haeufigste Fall in Production
// ist NICHT ein Medienname aus der Liste, sondern ein institutioneller
// Herausgeber ("bundesregierung.de", "Deutscher Bundestag", "IG Metall"), den
// erst die strukturelle Suffixerkennung findet.
function herausgeberWortmenge(...gruppen) {
  const out = new Set();
  for (const gruppe of gruppen) for (const d of gruppe || []) for (const w of H.herausgeberWoerter(d)) out.add(w);
  return out;
}

function altFamilien(treffer, staerkeJe, hgWorte = new Set()) {
  const liste = treffer.filter(Boolean);
  if (!liste.length) return [];
  const parent = liste.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let i = 0; i < liste.length; i += 1) {
    for (let j = i + 1; j < liste.length; j += 1) {
      if (V.beweisfamilie(liste[i]) === V.beweisfamilie(liste[j]) || altStaerke(liste[i], liste[j]) > 0) union(i, j);
    }
  }
  const gruppen = new Map();
  for (let i = 0; i < liste.length; i += 1) {
    const w = find(i);
    if (!gruppen.has(w)) gruppen.set(w, []);
    gruppen.get(w).push(liste[i]);
  }
  return [...gruppen.values()].map((mitglieder) => ({
    schluessel: V.beweisfamilie(mitglieder.slice().sort((a, b) => a.length - b.length)[0]),
    formen: mitglieder,
    staerke: Math.max(...mitglieder.map((m) => Number(staerkeJe.get(m)) || 0)),
    generisch: mitglieder.every((m) => altGenerisch(m)),
    // Fuer die Ursachenzuordnung: bestand diese Familie NUR aus Herausgeberwoertern?
    // Beides zaehlt — der aufgezaehlte Medienname UND das Wort, das bei einem der
    // beteiligten Dokumente in Herausgeberposition stand.
    herausgeber: mitglieder.every((m) => H.istHerausgeberAnker(m) || hgWorte.has(m))
  }));
}

function altUeberdeckung(aList, bList, hgWorte = new Set()) {
  const treffer = [];
  const staerkeJe = new Map();
  for (const a of aList) {
    let beste = 0;
    for (const b of bList) {
      const s = altStaerke(a, b);
      if (s > beste) beste = s;
      if (beste === 2) break;
    }
    if (beste > 0) { treffer.push(a); staerkeJe.set(a, beste); }
  }
  const familien = altFamilien(treffer, staerkeJe, hgWorte);
  const spezifisch = familien.filter((f) => !f.generisch);
  return {
    treffer,
    familien,
    spezifischeFamilien: spezifisch.length,
    generischeFamilien: familien.length - spezifisch.length,
    gewichtSpezifisch: spezifisch.reduce((n, f) => n + f.staerke, 0),
    // Trug die Zusage AUSSCHLIESSLICH auf Herausgebernamen?
    nurHerausgeber: spezifisch.length > 0 && spezifisch.every((f) => f.herausgeber),
    herausgeberFamilien: spezifisch.filter((f) => f.herausgeber).map((f) => f.schluessel)
  };
}

// Das Urteil nach dem Stand VOR B4-4 (= B4-3 mit spezifischen Herausgebernamen).
function altUrteil(neueDocs, altDocs) {
  if (!neueDocs.length) return { gleich: false, grund: "kein-neues-dokument" };
  if (altDocs.length >= V.VORGANG_MAX_DOKUMENTE) return { gleich: false, grund: "vorgang-voll" };
  const kernBestand = altDocs.length ? altKern(altDocs.map(altAnker)) : [];
  if (!kernBestand.length) return { gleich: false, grund: "bestand-ohne-kern" };
  const kernNeu = altKern(neueDocs.map(altAnker));
  if (!kernNeu.length) return { gleich: false, grund: "cluster-ohne-kern" };

  const zeiten = altDocs.map((d) => Date.parse(d.published_at || d.created_at || "")).filter(Number.isFinite);
  const neuesteAlt = zeiten.length ? Math.max(...zeiten) : null;
  const neuZeiten = neueDocs.map((d) => Date.parse(d.published_at || d.created_at || "")).filter(Number.isFinite);
  const aeltesteNeu = neuZeiten.length ? Math.min(...neuZeiten) : null;
  if (neuesteAlt != null && aeltesteNeu != null
      && (aeltesteNeu - neuesteAlt) / 86400000 > V.VORGANG_FORTSCHREIBUNG_TAGE) {
    return { gleich: false, grund: "vorgang-zu-alt" };
  }
  const jungsteAlt = altDocs.slice().sort((a, b) =>
    (Date.parse(b.published_at || b.created_at || "") || 0) - (Date.parse(a.published_at || a.created_at || "") || 0))[0];
  const aeltesteNeuDoc = neueDocs.slice().sort((a, b) =>
    (Date.parse(a.published_at || a.created_at || "") || 0) - (Date.parse(b.published_at || b.created_at || "") || 0))[0];
  if (jungsteAlt && aeltesteNeuDoc && V.jahresKonflikt(jungsteAlt, aeltesteNeuDoc)) return { gleich: false, grund: "jahreskonflikt" };

  const spezifischerKern = kernBestand.filter((a) => !altGenerisch(a));
  if (!spezifischerKern.length) return { gleich: false, grund: "bestand-nur-generisch" };
  const o = altUeberdeckung(kernNeu, kernBestand, herausgeberWortmenge(neueDocs, altDocs));
  const noetig = Math.max(1, Math.min(V.MIN_BEWEISGEWICHT, Math.ceil(spezifischerKern.length / 2)));
  if (o.spezifischeFamilien < 1) return { gleich: false, grund: "kein-spezifischer-kerntreffer", o };
  if (o.gewichtSpezifisch < noetig) return { gleich: false, grund: "kernueberdeckung-zu-schwach", o };
  if (altDocs.length <= V.SCHWACHER_BESTAND_DOKUMENTE) {
    if (o.spezifischeFamilien < V.EINZELVORGANG_MIN_FAMILIEN) return { gleich: false, grund: "einzelvorgang-zu-wenig-familien", o };
    if (o.spezifischeFamilien < o.generischeFamilien) return { gleich: false, grund: "einzelvorgang-evidenz-generisch", o };
  }
  return { gleich: true, grund: "kernueberdeckung", o };
}

function parseArgs(argv) {
  const a = { json: false, limit: 4000, tage: 14, beispiele: 15, dokumente: 4000 };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    const [, name, wert] = m;
    if (name === "json") a.json = true;
    else if (name === "limit") a.limit = Math.max(10, Number(wert) || 4000);
    else if (name === "tage") a.tage = Math.max(1, Number(wert) || 14);
    else if (name === "dokumente") a.dokumente = Math.max(10, Number(wert) || 4000);
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

  // ---------------------------------------------------------------- F1 + F2
  const [kos, links, rohdokumente] = await Promise.all([
    storage.listKnowledgeObjectStates({ limit: args.limit, mitUeberschrift: true }),
    storage.listKoDocumentLinks({ limit: 20000 }),
    storage.listRecentRawDocuments({ days: args.tage, limit: args.dokumente })
  ]);
  const vorgaenge = (kos || []).filter(Boolean);
  const docs = Array.isArray(rohdokumente) ? rohdokumente : ((rohdokumente && rohdokumente.rows) || []);

  const wurzelVon = (id) => String(id || "").replace(/^vg-/, "").split("-")[0];
  const kennungMitHerausgeber = vorgaenge
    .filter((k) => H.istHerausgeberAnker(wurzelVon(k.vorgang_id)))
    .map((k) => ({
      vorgangId: k.vorgang_id,
      wurzel: wurzelVon(k.vorgang_id),
      ueberschrift: String(k.display_title || k.headline || "").slice(0, 70)
    }));
  const wurzelZaehler = {};
  for (const x of kennungMitHerausgeber) wurzelZaehler[x.wurzel] = (wurzelZaehler[x.wurzel] || 0) + 1;

  let dokMitHerausgeberAnker = 0;
  let dokMitSuffix = 0;
  const suffixBelege = {};
  const verloreneAnker = {};
  for (const d of docs) {
    const alt = altAnker(d);
    const neu = V.docAnchors(d);
    const verloren = alt.filter((a) => !neu.includes(a));
    const zerlegt = H.herausgeberSuffix(d.title || "", H.herausgeberMetadaten(d));
    if (zerlegt.belege.length) {
      dokMitSuffix += 1;
      for (const b of zerlegt.belege) suffixBelege[b] = (suffixBelege[b] || 0) + 1;
    }
    if (alt.some((a) => H.istHerausgeberAnker(a)) || verloren.length) dokMitHerausgeberAnker += 1;
    for (const a of verloren) verloreneAnker[a] = (verloreneAnker[a] || 0) + 1;
  }

  // ---------------------------------------------------------------- F3 + F4
  const jeKo = new Map();
  for (const l of links || []) {
    if (!l || !l.knowledge_object_id) continue;
    jeKo.set(l.knowledge_object_id, (jeKo.get(l.knowledge_object_id) || 0) + 1);
  }
  const kandidaten = vorgaenge
    .filter((k) => (jeKo.get(k.id) || 0) >= 2)
    .sort((a, b) => (jeKo.get(b.id) || 0) - (jeKo.get(a.id) || 0));

  const zaehler = {
    vorgaenge: 0, zuordnungen: 0, beideJa: 0, beideNein: 0, nurAltJa: 0, nurNeuJa: 0,
    nurAltJaDurchHerausgeber: 0, vorgaengeNurDurchHerausgeber: 0,
    vorgaengeMitHerausgeberImKern: 0, vorgaengeOhneSachkernDanach: 0
  };
  const gruende = {};
  const verhindert = [];
  const nurHerausgeberVorgaenge = [];

  for (const ko of kandidaten) {
    const dokumente = await storage.listKoDocuments(ko.id, 400);
    if (!Array.isArray(dokumente) || dokumente.length < 2) continue;
    zaehler.vorgaenge += 1;

    // F3: Haelt den Vorgang ueberhaupt ein SACHanker zusammen? Gemessen nach
    // ALTER Lesart — sonst waere die Frage zirkulaer.
    const hgWorte = herausgeberWortmenge(dokumente);
    const spezifischAlt = altKern(dokumente.map(altAnker)).filter((a) => !altGenerisch(a));
    const spezifischNeu = V.coreAnchors(dokumente.map((d) => V.docAnchors(d))).filter((a) => !V.istGenerisch(a));
    const istHg = (a) => H.istHerausgeberAnker(a) || hgWorte.has(a);
    const nurHerausgeber = spezifischAlt.length > 0 && spezifischAlt.every(istHg);
    const verliert = spezifischAlt.filter(istHg);
    if (nurHerausgeber) zaehler.vorgaengeNurDurchHerausgeber += 1;
    if (verliert.length) zaehler.vorgaengeMitHerausgeberImKern += 1;
    if (spezifischAlt.length && !spezifischNeu.length) zaehler.vorgaengeOhneSachkernDanach += 1;
    if (verliert.length) {
      nurHerausgeberVorgaenge.push({
        vorgangId: ko.vorgang_id, dokumente: dokumente.length,
        nurHerausgeber,
        spezifischerKernAlt: spezifischAlt.slice(0, 10),
        herausgeberImKern: verliert.slice(0, 10),
        spezifischerKernNeu: spezifischNeu.slice(0, 10),
        ueberschrift: String(ko.display_title || ko.headline || "").slice(0, 70)
      });
    }

    // F4: jede Zuordnung einzeln, alt gegen neu.
    for (const dok of dokumente) {
      const rest = dokumente.filter((x) => x && x.id !== dok.id);
      if (!rest.length) continue;
      zaehler.zuordnungen += 1;
      const a = altUrteil([dok], rest);
      const nRes = V.sameVorgang({ documents: [dok] }, { vorgangId: ko.vorgang_id, documents: rest });
      if (a.gleich && nRes.gleich) zaehler.beideJa += 1;
      else if (!a.gleich && !nRes.gleich) zaehler.beideNein += 1;
      else if (a.gleich && !nRes.gleich) {
        zaehler.nurAltJa += 1;
        gruende[nRes.grund] = (gruende[nRes.grund] || 0) + 1;
        const durchHerausgeber = Boolean(a.o && a.o.nurHerausgeber);
        if (durchHerausgeber) zaehler.nurAltJaDurchHerausgeber += 1;
        verhindert.push({
          vorgangId: ko.vorgang_id,
          dokument: dok.id,
          titel: String(dok.title || "").slice(0, 90),
          quelle: String(dok.source_name || "").slice(0, 40),
          grund: nRes.grund,
          bestandsDokumente: rest.length,
          alteBelege: a.o ? a.o.familien.filter((f) => !f.generisch).map((f) => `${f.schluessel}${f.herausgeber ? " [Herausgeber]" : ""}`) : [],
          durchHerausgeber,
          ueberschrift: String(ko.display_title || ko.headline || "").slice(0, 70)
        });
      } else zaehler.nurNeuJa += 1;
    }
  }

  const anteil = (x, basis) => basis ? Math.round((x / basis) * 1000) / 10 : 0;
  const ergebnis = {
    gemessenAm: new Date().toISOString(),
    zugriff: "ausschliesslich lesend (select) — keine Mutation, kein KI-Aufruf",
    F1_kennungen: {
      vorgaengeGesamt: vorgaenge.length,
      mitHerausgeberWurzel: kennungMitHerausgeber.length,
      anteilProzent: anteil(kennungMitHerausgeber.length, vorgaenge.length),
      jeWurzel: wurzelZaehler,
      beispiele: kennungMitHerausgeber.slice(0, args.beispiele)
    },
    F2_rohdokumente: {
      fenstertage: args.tage,
      geprueft: docs.length,
      mitHerausgeberAnkerVorher: dokMitHerausgeberAnker,
      anteilProzent: anteil(dokMitHerausgeberAnker, docs.length),
      mitBestaetigtemSuffix: dokMitSuffix,
      suffixBelegarten: suffixBelege,
      haeufigsteEntfernteAnker: Object.entries(verloreneAnker).sort((a, b) => b[1] - a[1]).slice(0, 25)
    },
    F3_zusammenhalt: {
      gepruefteVorgaenge: zaehler.vorgaenge,
      mitHerausgeberImSpezifischenKern: zaehler.vorgaengeMitHerausgeberImKern,
      nurDurchHerausgeberZusammengehalten: zaehler.vorgaengeNurDurchHerausgeber,
      ohneSachkernNachDerKuerzung: zaehler.vorgaengeOhneSachkernDanach,
      anteilProzent: anteil(zaehler.vorgaengeNurDurchHerausgeber, zaehler.vorgaenge),
      beispiele: nurHerausgeberVorgaenge
        .sort((a, b) => (Number(b.nurHerausgeber) - Number(a.nurHerausgeber)) || (b.dokumente - a.dokumente))
        .slice(0, args.beispiele)
    },
    F4_zuordnungen: {
      gepruefteZuordnungen: zaehler.zuordnungen,
      beideJa: zaehler.beideJa,
      beideNein: zaehler.beideNein,
      nurAltJa: zaehler.nurAltJa,
      nurNeuJa: zaehler.nurNeuJa,
      nurAltJaDurchHerausgeber: zaehler.nurAltJaDurchHerausgeber,
      anteile: {
        nurAltJa: anteil(zaehler.nurAltJa, zaehler.zuordnungen),
        durchHerausgeber: anteil(zaehler.nurAltJaDurchHerausgeber, zaehler.zuordnungen)
      },
      ablehnungsgruendeNeu: gruende,
      jeVorgang: Object.entries(verhindert.reduce((acc, v) => {
        const k = v.vorgangId;
        if (!acc[k]) acc[k] = { anzahl: 0, durchHerausgeber: 0, ueberschrift: v.ueberschrift, belege: v.alteBelege };
        acc[k].anzahl += 1;
        if (v.durchHerausgeber) acc[k].durchHerausgeber += 1;
        return acc;
      }, {})).map(([vorgangId, x]) => ({ vorgangId, ...x })).sort((a, b) => b.anzahl - a.anzahl),
      beispiele: verhindert.filter((v) => v.durchHerausgeber).slice(0, args.beispiele)
    }
  };

  if (args.json) { console.log(JSON.stringify(ergebnis, null, 2)); return process.exit(0); }

  console.log("\nHERAUSGEBERNAMEN IN PRODUCTION-VORGAENGEN (read-only, B4-4)\n");
  console.log(`F1 · Vorgangskennungen mit Herausgeber-Themenwurzel: ${ergebnis.F1_kennungen.mitHerausgeberWurzel} von ${ergebnis.F1_kennungen.vorgaengeGesamt} (${ergebnis.F1_kennungen.anteilProzent} %)`);
  console.log(`     je Wurzel: ${JSON.stringify(ergebnis.F1_kennungen.jeWurzel)}`);
  for (const b of ergebnis.F1_kennungen.beispiele) console.log(`     ${b.vorgangId.padEnd(38)} "${b.ueberschrift}"`);

  console.log(`\nF2 · Rohdokumente (${args.tage} Tage): ${ergebnis.F2_rohdokumente.geprueft} geprueft`);
  console.log(`     mit Herausgebername unter den Ankern (vorher): ${ergebnis.F2_rohdokumente.mitHerausgeberAnkerVorher} (${ergebnis.F2_rohdokumente.anteilProzent} %)`);
  console.log(`     mit bestaetigtem Herausgebersuffix: ${ergebnis.F2_rohdokumente.mitBestaetigtemSuffix}`);
  console.log(`     Belegarten: ${JSON.stringify(ergebnis.F2_rohdokumente.suffixBelegarten)}`);
  console.log(`     haeufigste entfernte Anker: ${JSON.stringify(ergebnis.F2_rohdokumente.haeufigsteEntfernteAnker.slice(0, 15))}`);

  console.log(`\nF3 · Vorgaenge (>= 2 Dokumente) geprueft: ${ergebnis.F3_zusammenhalt.gepruefteVorgaenge}`);
  console.log(`     mit Herausgebername im spezifischen Kern      : ${ergebnis.F3_zusammenhalt.mitHerausgeberImSpezifischenKern}`);
  console.log(`     NUR durch Herausgebernamen zusammengehalten  : ${ergebnis.F3_zusammenhalt.nurDurchHerausgeberZusammengehalten} (${ergebnis.F3_zusammenhalt.anteilProzent} %)`);
  console.log(`     ohne jeden Sachkern nach der Kuerzung        : ${ergebnis.F3_zusammenhalt.ohneSachkernNachDerKuerzung}`);
  for (const b of ergebnis.F3_zusammenhalt.beispiele) {
    console.log(`     ${b.nurHerausgeber ? "!" : " "} ${String(b.vorgangId).slice(0, 40).padEnd(40)} ${String(b.dokumente).padStart(3)} Dok`);
    console.log(`         Kern alt ${JSON.stringify(b.spezifischerKernAlt)}`);
    console.log(`         davon Herausgeber ${JSON.stringify(b.herausgeberImKern)} -> Kern neu ${JSON.stringify(b.spezifischerKernNeu)}`);
    console.log(`         "${b.ueberschrift}"`);
  }

  console.log(`\nF4 · Zuordnungen geprueft: ${ergebnis.F4_zuordnungen.gepruefteZuordnungen}`);
  console.log(`     beide Fassungen tragen : ${ergebnis.F4_zuordnungen.beideJa}`);
  console.log(`     beide lehnen ab        : ${ergebnis.F4_zuordnungen.beideNein}`);
  console.log(`     NUR VORHER getragen    : ${ergebnis.F4_zuordnungen.nurAltJa} (${ergebnis.F4_zuordnungen.anteile.nurAltJa} %)`);
  console.log(`       davon allein durch den Herausgebernamen: ${ergebnis.F4_zuordnungen.nurAltJaDurchHerausgeber} (${ergebnis.F4_zuordnungen.anteile.durchHerausgeber} %)`);
  console.log(`     NUR JETZT getragen     : ${ergebnis.F4_zuordnungen.nurNeuJa}`);
  console.log(`     Ablehnungsgruende neu  : ${JSON.stringify(ergebnis.F4_zuordnungen.ablehnungsgruendeNeu)}`);
  console.log("\n     JE VORGANG (nicht mehr getragene Zuordnungen):");
  for (const v of ergebnis.F4_zuordnungen.jeVorgang.slice(0, 20)) {
    console.log(`       ${String(v.vorgangId).slice(0, 40).padEnd(40)} ${String(v.anzahl).padStart(3)} · davon durch Herausgeber ${String(v.durchHerausgeber).padStart(3)}  "${v.ueberschrift}"`);
  }
  if (ergebnis.F4_zuordnungen.beispiele.length) {
    console.log("\n     BEISPIELE — Zuordnungen, die ALLEIN der Herausgebername trug:");
    for (const b of ergebnis.F4_zuordnungen.beispiele) {
      console.log(`       ${b.vorgangId} <- ${b.dokument}${b.durchHerausgeber ? "   [allein Herausgeber]" : ""}`);
      console.log(`         "${b.titel}"  (Quelle: ${b.quelle})`);
      console.log(`         Vorgang: "${b.ueberschrift}" (${b.bestandsDokumente} Bestandsdokumente) · Grund: ${b.grund}`);
      console.log(`         alte spezifische Belege: ${JSON.stringify(b.alteBelege)}`);
    }
  }
  console.log("\nKEINE Production-Daten veraendert — dieses Werkzeug rechnet ausschliesslich nach.");
  return process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("Fehler:", e && e.message); process.exit(1); });
}

module.exports = { altAnker, altGenerisch, altStaerke, altKern, altUeberdeckung, altUrteil, parseArgs };
