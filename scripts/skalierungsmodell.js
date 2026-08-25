"use strict";

// Helmut — ZENTRALE SKALIERUNGSRECHNUNG (OP-30, finaler Abnahmesprint).
// =============================================================================================
// WARUM ES DIESE DATEI GIBT.
// In drei aufeinanderfolgenden Sprintberichten standen unterschiedliche KI-Mengen fuer
// dieselbe Frage. Der Grund war nicht Schlamperei bei den Zahlen, sondern dass jede Zahl in
// einem anderen Bericht per Hand aus einem anderen Ausschnitt gerechnet wurde:
//
//   * "1 000 Mandate x >= 1 Aufruf = >= 1 000 Aufrufe/Tag"  -> zaehlte NUR die
//     mandatsbezogene Arbeit und liess das globale Verstehen weg.
//   * "Deckel 100 traegt 66 Mandate"                        -> rechnete NUR mandatsbezogen.
//   * "Deckel 100 traegt 0 Mandate"                         -> rechnete GESAMT, inklusive
//     des globalen Sockels — und das ist die ehrliche Zahl.
//
// Alle drei waren fuer sich genommen richtig und zusammen unbrauchbar. Deshalb zieht jede
// Tabelle, die DIESE Groessen braucht, ihre Zahlen hier — und nur hier.
//
// ZURUECKGENOMMEN (Korrekturrunde 2026-08-25/4): hier stand „Deshalb gibt es ab jetzt GENAU
// EINE Rechenquelle … es gibt keine zweite Herleitung mehr." Dieser Alleinvertretungsanspruch
// trifft nicht zu. Es gibt im Repository DREI fachlich relevante Modelllinien, die
// verschiedene Fragen beantworten und deshalb alle bestehen bleiben:
//   * DIESE Datei — Vollmodell aus dem Produktionscode: Bandbreite inkl. Dubletten, Cluster,
//     Nutzung, Speicher und Kosten, bis 1000 Mandate.
//   * `scripts/kapazitaetsmodell-test.js` — Kapazitaet JE AUFTRAGSKLASSE: wo ist der Engpass,
//     welche Verstehensparallelitaet ist noetig.
//   * `docs/betrieb/skalierung-25-50-100.md` §2 — an der Fuenfermessung GEEICHTE Hochrechnung
//     der Tagesmenge (trifft fuer M=5 exakt die gemessenen 338 source_fetch).
// Zweck, Eingaben, Annahmen und Grenzen jeder Linie stehen nebeneinander in
// `docs/betrieb/skalierung-25-50-100.md` §2c. Wer eine Zahl benutzt, muss wissen, welche
// Linie sie liefert — ehrlich zu DIESER Datei: ihr „realistisches" Szenario sagt fuer
// 5 Mandate 391 KI-Aufrufe/Tag voraus, gemessen sind 62–77. Sie ist bewusst konservativ
// und taugt fuer Obergrenzen, nicht fuer die Frage „was passiert heute".
//
// WAS HIER GEMESSEN IST UND WAS GERECHNET.
//   GEMESSEN (aus dem Produktionscode, bei jedem Lauf neu):
//     - Zahl und Art der Abrufwege je Profil (scheduler.getSourcesForProfile ueber
//       personNewsSource + mandateNewsSources)
//     - Verdichtung durch den Source-Demand-Compiler (geteilt / persoenlich / Archiv)
//     - Aktualitaetsfenster (source-demand.fensterKonfig)
//     - maxItems je Abrufweg (steht im Quellenobjekt)
//     - Zahl der Katalogwege des Paketmodells (Seeds)
//   GERECHNET (Formel mit ausdruecklich benannten Parametern, KEINE Messung):
//     - Dublettenanteil und Clustergroesse -> Zahl neuer Vorgaenge
//     - Anteil taeglich aktiver Mandate, Buerotexte je Mandat
//     - Tokens je Aufruf
//   NICHT BELEGT (und deshalb nie als Betrag ausgegeben, nur als Formel):
//     - Modellpreise. Die Preistabelle in storage.js traegt ausdruecklich die Herkunft
//       'unbelegt-schaetzwert' (storage.js:927-944). Ein daraus gerechneter Euro-Betrag
//       waere eine erfundene Zahl. Diese Datei gibt Kosten deshalb IMMER mit dem Vermerk
//       ihrer Herkunft aus, und ohne gesetzte HELMUT_LLM_PRICE_SOURCE bleibt der Betrag
//       ausdruecklich "berechnet, nicht belegt".
//
// Offline. Kein Netz, keine KI, keine Datenbank.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = process.env.HELMUT_SOURCE_MODE || "off";

const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));

// ── ZENTRALE EINGABEPARAMETER ────────────────────────────────────────────────────────────
// Jeder Wert hier ist EIN Parameter mit EINER Herkunft. Wer eine Zahl im Bericht anzweifelt,
// findet sie hier — und nur hier.
const PARAMETER = {
  // Katalogwege des Paketmodells je Lauf. Herkunft: gemessener Production-Lauf
  // (181 Quellen bei 6 Mandaten, davon 140 geteilt — Pruefbericht §C.10 / vorgangskontext.md §7.6).
  katalogWegeJeLauf: 140,
  // Schwere Laeufe je Tag. Herkunft: Cron-Definition (drei schwere Laeufe).
  schwereLaeufeJeTag: 3,

  // Szenarien fuer die NICHT gemessenen Faktoren.
  szenarien: {
    minimum: {
      name: "Minimum",
      dublettenanteil: 0.90,      // sehr viele Mehrfachtreffer derselben Story
      dokumenteJeVorgang: 6,      // grosse Cluster
      anteilNeuerVorgaenge: 0.15, // Dauerbetrieb: Anteil der Cluster ohne Bestandsvorgang
      anteilAktiveMandate: 0.30,  // nur ein Drittel oeffnet die App taeglich
      lageJeAktivemMandat: 1,
      bueroJeAktivemMandat: 0,
      begruendung: "guenstigster plausibler Fall: starke Verdichtung, wenig Interaktion"
    },
    realistisch: {
      name: "Realistisch",
      dublettenanteil: 0.75,
      dokumenteJeVorgang: 3,
      anteilNeuerVorgaenge: 0.35,
      anteilAktiveMandate: 0.70,
      lageJeAktivemMandat: 1,
      bueroJeAktivemMandat: 0.5,
      begruendung: "typischer Betrieb: uebliche Mehrfachtreffer, mittlere Cluster, taegliche Nutzung"
    },
    stress: {
      name: "Stress",
      dublettenanteil: 0.50,
      dokumenteJeVorgang: 1.5,
      anteilNeuerVorgaenge: 0.70,
      anteilAktiveMandate: 1.00,
      lageJeAktivemMandat: 2,     // KO-Satz aendert sich einmal am Tag -> zweites Narrativ
      bueroJeAktivemMandat: 3,
      begruendung: "belastbare Obergrenze: wenig Verdichtung, volle Nutzung, viele Buerotexte"
    }
  },

  // Tokens je Aufruf. NICHT GEMESSEN — es gibt im Repository keine Tokenstatistik, aus der
  // ein belastbarer Mittelwert ableitbar waere. Die Werte sind ausdruecklich Parameter,
  // keine Messung; sie sind so gewaehlt, dass sie ueber HELMUT_MODELL_TOKENS_* ersetzbar sind.
  tokens: {
    understanding: { ein: 3000, aus: 800, modell: "gpt-5-mini", herkunft: "PARAMETER, nicht gemessen" },
    lage: { ein: 6000, aus: 1200, modell: "gpt-5-mini", herkunft: "PARAMETER, nicht gemessen" },
    buero: { ein: 2500, aus: 900, modell: "gpt-5-mini", herkunft: "PARAMETER, nicht gemessen" }
  },

  // Speicher je Zeile. Grobwerte fuer die Groessenordnung, ausdruecklich Parameter.
  speicher: {
    rohdokumentBytes: 1200,       // minimierte Zeile: Titel <=300, Summary <=240, Metadaten
    warteschlangenzeileBytes: 700,
    aufbewahrungTage: 14,
    herkunft: "PARAMETER, aus den Spaltengrenzen abgeleitet — nicht gemessen"
  },

  // Der globale Tagesdeckel — DREI ZAHLEN, DIE MAN NICHT VERWECHSELN DARF.
  // Die erste Fassung dieses Modells rechnete gegen "100" und nannte das den heutigen
  // Deckel. Das war NICHT belegt. Nachgeprueft im Code:
  //   * `storage.js` LLM_LIMIT_FALLBACK = 50 — das ist der Wert, der WIRKLICH gilt,
  //     wenn HELMUT_MAX_LLM_CALLS_PER_DAY fehlt oder unbrauchbar ist (fail closed).
  //   * 100 steht nur als EMPFEHLUNG in einem Codekommentar und im Runbook, gemeinsam
  //     mit HELMUT_LLM_RESERVE_UNDERSTANDING=30. `llmUnderstandingReserve()` gibt
  //     standardmaessig 0 zurueck, nicht 30.
  //   * Der tatsaechlich in Production gesetzte Env-Wert ist offline NICHT lesbar.
  // Deshalb wird gegen BEIDE bekannten Zahlen gerechnet und keine davon als "der
  // heutige Deckel" ausgegeben. Welche gilt, kann nur der Betreiber sagen.
  deckel: {
    codeStandard: 50,        // BELEGT: storage.js LLM_LIMIT_FALLBACK (fail closed)
    empfehlungRunbook: 100,  // EMPFEHLUNG, nicht wirksam: Kommentar storage.js + Runbook
    wirksam: null,           // offline nicht feststellbar (Vercel-Env)
    herkunft: "storage.js LLM_LIMIT_FALLBACK=50 (belegt); 100 = Runbook-Empfehlung; "
      + "wirksamer Production-Wert offline nicht lesbar"
  }
};

// Wie verhaelt sich der gerechnete Bedarf zu EINER bekannten Deckelzahl? Bewusst eine
// Funktion statt einer festen Zahl: es gibt keinen einzelnen "heutigen Deckel", den dieses
// Modell belegen koennte.
function deckelBilanz(gesamt, nurGlobal, deckel) {
  return {
    deckel,
    faktorGesamt: Math.round(gesamt / deckel * 10) / 10,
    faktorNurGlobal: Math.round(nurGlobal / deckel * 10) / 10,
    reicht: gesamt <= deckel
  };
}

function tokenParameterAusEnv(env = process.env) {
  // Erlaubt, die Tokenannahmen ohne Codeaenderung zu ersetzen, sobald sie gemessen sind.
  const p = JSON.parse(JSON.stringify(PARAMETER.tokens));
  for (const art of Object.keys(p)) {
    const roh = env[`HELMUT_MODELL_TOKENS_${art.toUpperCase()}`];
    if (!roh) continue;
    try {
      const w = JSON.parse(roh);
      if (Number.isFinite(w.ein) && Number.isFinite(w.aus)) {
        p[art] = { ...p[art], ein: w.ein, aus: w.aus, herkunft: "aus HELMUT_MODELL_TOKENS_* gesetzt" };
      }
    } catch (_) { /* ungueltig -> Parameter bleibt */ }
  }
  return p;
}

// ── DER GEMESSENE TEIL ───────────────────────────────────────────────────────────────────
// Alles hier stammt aus dem Produktionscode und wird bei jedem Lauf neu berechnet.
async function messeQuellenbedarf(anzahlMandate, { jetztMs = Date.parse("2026-08-08T00:00:00Z") } = {}) {
  const profile = erzeugeMandate(anzahlMandate);
  const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];
  const bedarf = await SD.kompiliereQuellenbedarf({
    profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs
  });
  const konfig = SD.fensterKonfig({});

  // Anbieter je Weg — die Google-Abhaengigkeit ist eine gemessene Groesse, keine Annahme.
  const jeAnbieter = new Map();
  let maxItemsSumme = 0;
  let ohneMaxItems = 0;
  const anfordererVerteilung = [];
  for (const a of bedarf.auftraege) {
    const q = a.payload && a.payload.quelle;
    const an = (q && q.anbieter) || "unbekannt";
    jeAnbieter.set(an, (jeAnbieter.get(an) || 0) + 1);
    const m = Number(q && q.maxItems);
    if (Number.isFinite(m) && m > 0) maxItemsSumme += m; else ohneMaxItems += 1;
    if (a.payload && a.payload.art === "geteilt") {
      anfordererVerteilung.push(Number(a.payload.angefordertVon) || 1);
    }
  }

  const proTagGeteilt = bedarf.statistik.geteilteAuftraege * (24 / konfig.geteiltStundenFenster);
  const proTagPerson = bedarf.statistik.persoenlicheAuftraege * (24 / konfig.personStundenFenster);
  const proTagArchiv = bedarf.statistik.archivAuftraege * (24 / konfig.archivStundenFenster);
  const katalogProTag = PARAMETER.katalogWegeJeLauf * PARAMETER.schwereLaeufeJeTag;

  return {
    mandate: anzahlMandate,
    profilquellenGesehen: bedarf.statistik.quellenGesehen,
    zusammengefasst: bedarf.statistik.zusammengefasst,
    auftraege: {
      geteilt: bedarf.statistik.geteilteAuftraege,
      persoenlich: bedarf.statistik.persoenlicheAuftraege,
      archiv: bedarf.statistik.archivAuftraege,
      gesamt: bedarf.auftraege.length
    },
    proTag: {
      katalog: katalogProTag,
      geteilt: Math.round(proTagGeteilt),
      persoenlich: Math.round(proTagPerson),
      archiv: Math.round(proTagArchiv),
      profilabrufeGesamt: Math.round(proTagGeteilt + proTagPerson + proTagArchiv),
      abrufeGesamt: Math.round(proTagGeteilt + proTagPerson + proTagArchiv) + katalogProTag,
      projektionen: anzahlMandate * (24 / konfig.mandatMaxAlterStunden),
      briefings: anzahlMandate * (24 / konfig.mandatMaxAlterStunden)
    },
    maxItemsJeAbruf: maxItemsSumme / Math.max(1, bedarf.auftraege.length),
    ohneMaxItems,
    anbieter: Object.fromEntries([...jeAnbieter].sort((a, b) => b[1] - a[1])),
    geteilteMitEinemAnforderer: anfordererVerteilung.filter((n) => n <= 1).length,
    geteilteMitVielenAnforderern: anfordererVerteilung.filter((n) => n >= 10).length,
    maxAnforderer: anfordererVerteilung.length ? Math.max(...anfordererVerteilung) : 0,
    verdichtung: bedarf.statistik.verdichtung,
    konfig
  };
}

// ── DER GERECHNETE TEIL ──────────────────────────────────────────────────────────────────
function rechneSzenario(messung, szenario, { env = process.env } = {}) {
  const tok = tokenParameterAusEnv(env);

  // Rohitems: die Obergrenze steht im Quellenobjekt (maxItems). Katalogwege werden mit
  // demselben Mittelwert gerechnet — sie sind im Compiler nicht enthalten.
  const rohitemsProfil = Math.round(messung.proTag.profilabrufeGesamt * messung.maxItemsJeAbruf);
  const rohitemsKatalog = Math.round(messung.proTag.katalog * messung.maxItemsJeAbruf);
  const rohitemsGesamt = rohitemsProfil + rohitemsKatalog;

  // Deduplizierung -> Dokumente -> Cluster -> NEUE Vorgaenge.
  //
  // DER SCHRITT, DER IN DEN FRUEHEREN BERICHTEN GEFEHLT HAT: nicht jeder Cluster ist ein
  // NEUER Vorgang. Im Dauerbetrieb gehoert der groessere Teil der Dokumente zu einem
  // bereits verstandenen Vorgang — genau dort greift der `existing`-Kurzschluss in
  // understanding.js OHNE Modellaufruf. Ohne diesen Faktor rechnet man den Dauerbetrieb
  // wie eine Erstbefuellung und kommt systematisch zu hoch heraus. Genau das ist in den
  // Berichten vom 2026-08-08 passiert (dort: 10 903 statt der hier gerechneten Zahl).
  const dokumenteNachDedup = Math.round(rohitemsGesamt * (1 - szenario.dublettenanteil));
  const cluster = Math.round(dokumenteNachDedup / szenario.dokumenteJeVorgang);
  const neueVorgaenge = Math.round(cluster * szenario.anteilNeuerVorgaenge);

  // KI-Arbeit, sauber nach Zurechnungsklasse getrennt (dieselbe Einteilung wie
  // cost-model.js: global / direkt).
  const aktiveMandate = Math.round(messung.mandate * szenario.anteilAktiveMandate);
  const kiGlobal = neueVorgaenge;                                   // 1 Aufruf je neuem Vorgang
  const kiNotwendigMandat = Math.round(aktiveMandate * szenario.lageJeAktivemMandat);
  const kiOptionalMandat = Math.round(aktiveMandate * szenario.bueroJeAktivemMandat);
  const kiMandatGesamt = kiNotwendigMandat + kiOptionalMandat;
  const kiGesamt = kiGlobal + kiMandatGesamt;

  // Profilverursacht heisst: entstanden, WEIL es dieses Profil gibt. Das ist bei den
  // globalen Vorgaengen anteilig der Fall — die Unterscheidung, die in den frueheren
  // Berichten gefehlt hat.
  const anteilProfilabrufe = messung.proTag.abrufeGesamt > 0
    ? messung.proTag.profilabrufeGesamt / messung.proTag.abrufeGesamt : 0;
  const kiGlobalProfilverursacht = Math.round(kiGlobal * anteilProfilabrufe);
  const kiGlobalKatalogverursacht = kiGlobal - kiGlobalProfilverursacht;

  // Tokens und Kosten. Preise NUR aus der Tabelle des Produktionscodes, mit Herkunft.
  const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
  const preise = typeof storage.llmPriceTable === "function" ? storage.llmPriceTable() : null;
  const herkunft = typeof storage.llmPriceProvenance === "function" ? storage.llmPriceProvenance() : null;

  const posten = [
    { art: "understanding", n: kiGlobal, klasse: "global", pflicht: true },
    { art: "lage", n: kiNotwendigMandat, klasse: "direkt", pflicht: true },
    { art: "buero", n: kiOptionalMandat, klasse: "direkt", pflicht: false }
  ];
  let tokenEin = 0;
  let tokenAus = 0;
  let kostenUsd = 0;
  let kostenBerechenbar = Boolean(preise);
  for (const p of posten) {
    const t = tok[p.art];
    tokenEin += p.n * t.ein;
    tokenAus += p.n * t.aus;
    const preis = preise && preise[t.modell];
    if (!preis) { kostenBerechenbar = false; continue; }
    kostenUsd += (p.n * t.ein / 1e6) * preis.in + (p.n * t.aus / 1e6) * preis.out;
  }

  // Speicher und Warteschlange.
  const warteschlangeProTag = messung.proTag.abrufeGesamt
    + Math.ceil(dokumenteNachDedup / 25)                            // Verstehensauftraege (alle Dokumente)
    + messung.proTag.projektionen + messung.proTag.briefings;
  const warteschlangeBestand = Math.round(warteschlangeProTag * PARAMETER.speicher.aufbewahrungTage);
  const speicherProTagMb = (dokumenteNachDedup * PARAMETER.speicher.rohdokumentBytes
    + warteschlangeProTag * PARAMETER.speicher.warteschlangenzeileBytes) / 1e6;

  return {
    szenario: szenario.name,
    begruendung: szenario.begruendung,
    annahmen: {
      dublettenanteil: szenario.dublettenanteil,
      dokumenteJeVorgang: szenario.dokumenteJeVorgang,
      anteilNeuerVorgaenge: szenario.anteilNeuerVorgaenge,
      anteilAktiveMandate: szenario.anteilAktiveMandate,
      lageJeAktivemMandat: szenario.lageJeAktivemMandat,
      bueroJeAktivemMandat: szenario.bueroJeAktivemMandat
    },
    rohitems: { profil: rohitemsProfil, katalog: rohitemsKatalog, gesamt: rohitemsGesamt },
    dokumenteNachDedup,
    cluster,
    neueVorgaenge,
    aktiveMandate,
    ki: {
      global: kiGlobal,
      globalProfilverursacht: kiGlobalProfilverursacht,
      globalKatalogverursacht: kiGlobalKatalogverursacht,
      direktNotwendig: kiNotwendigMandat,
      direktOptional: kiOptionalMandat,
      direktGesamt: kiMandatGesamt,
      notwendigGesamt: kiGlobal + kiNotwendigMandat,
      optionalGesamt: kiOptionalMandat,
      gesamt: kiGesamt,
      anteilGemeinsamProzent: kiGesamt > 0 ? Math.round(kiGlobal / kiGesamt * 1000) / 10 : 0,
      anteilPersoenlichProzent: kiGesamt > 0 ? Math.round(kiMandatGesamt / kiGesamt * 1000) / 10 : 0
    },
    zumDeckel: {
      // Gegen BEIDE bekannten Zahlen, keine davon als "der heutige Deckel" ausgegeben.
      codeStandard: deckelBilanz(kiGesamt, kiGlobal, PARAMETER.deckel.codeStandard),
      empfehlungRunbook: deckelBilanz(kiGesamt, kiGlobal, PARAMETER.deckel.empfehlungRunbook),
      wirksamBekannt: false,
      herkunft: PARAMETER.deckel.herkunft
    },
    tokens: { ein: tokenEin, aus: tokenAus, gesamt: tokenEin + tokenAus },
    kosten: {
      berechenbar: kostenBerechenbar,
      tagUsd: kostenBerechenbar ? Math.round(kostenUsd * 100) / 100 : null,
      monatUsd: kostenBerechenbar ? Math.round(kostenUsd * 30 * 100) / 100 : null,
      jeMandatMonatUsd: kostenBerechenbar && messung.mandate > 0
        ? Math.round(kostenUsd * 30 / messung.mandate * 100) / 100 : null,
      // Die entscheidende Zeile: WORAUF beruht der Betrag?
      preisherkunft: herkunft || { basis: "unbekannt" },
      belegt: Boolean(herkunft && herkunft.belegt === true),
      formel: "Kosten = Σ_Posten ( n × tokenEin / 1e6 × Preis_in + n × tokenAus / 1e6 × Preis_out )"
    },
    warteschlange: {
      proTag: warteschlangeProTag,
      bestandBeiAufbewahrung: warteschlangeBestand,
      aufbewahrungTage: PARAMETER.speicher.aufbewahrungTage
    },
    speicherProTagMb: Math.round(speicherProTagMb * 10) / 10
  };
}

// Erstbefuellung: der erste Tag kennt keinen Bestand, also greift KEIN Dedup-Kurzschluss
// gegen frueher Verstandenes. Das ist der teuerste Tag ueberhaupt.
function rechneErstbefuellung(messung, szenario, { env = process.env } = {}) {
  const normal = rechneSzenario(messung, szenario, { env });
  // Beim ersten Lauf ist NICHTS bekannt: jedes deduplizierte Dokument erzeugt einen
  // Vorgang, den es noch nicht gibt. Die Archivsuche (7-Tage-Fenster) faellt zusaetzlich
  // vollstaendig am ersten Tag an.
  const archivEinmalig = messung.auftraege.archiv;
  const rohitemsErst = normal.rohitems.gesamt + Math.round(archivEinmalig * messung.maxItemsJeAbruf);
  const dokumenteErst = Math.round(rohitemsErst * (1 - szenario.dublettenanteil));
  // Am ersten Tag ist JEDER Cluster neu — es gibt keinen Bestand, gegen den
  // kurzgeschlossen werden koennte. Genau das macht die Erstbefuellung so teuer.
  const vorgaengeErst = Math.round(dokumenteErst / szenario.dokumenteJeVorgang);
  return {
    ...normal,
    szenario: `${szenario.name} · ERSTBEFUELLUNG`,
    rohitems: { ...normal.rohitems, gesamt: rohitemsErst },
    dokumenteNachDedup: dokumenteErst,
    neueVorgaenge: vorgaengeErst,
    ki: {
      ...normal.ki,
      global: vorgaengeErst,
      gesamt: vorgaengeErst + normal.ki.direktGesamt,
      notwendigGesamt: vorgaengeErst + normal.ki.direktNotwendig
    },
    zumDeckel: {
      codeStandard: deckelBilanz(vorgaengeErst + normal.ki.direktGesamt, vorgaengeErst, PARAMETER.deckel.codeStandard),
      empfehlungRunbook: deckelBilanz(vorgaengeErst + normal.ki.direktGesamt, vorgaengeErst, PARAMETER.deckel.empfehlungRunbook),
      wirksamBekannt: false,
      herkunft: PARAMETER.deckel.herkunft
    },
    hinweis: "Erstbefuellung: kein Bestand, deshalb kein Kurzschluss auf bereits Verstandenes; "
      + "die Archivsuche faellt zusaetzlich vollstaendig am ersten Tag an."
  };
}

// Empfehlung fuer Deckel, Reserve und Warnschwellen — abgeleitet, nicht gesetzt.
// Diese Funktion AENDERT NICHTS. Sie liefert eine Empfehlung fuer den Betreiber.
// WIE MUSS DER DECKEL AUFGETEILT SEIN? (ergaenzt 2026-08-08, Korrektursprint)
//
// `llm-budget-fair.js` haelt `GLOBAL_ANTEIL_STANDARD = 0.5` des Tagesdeckels als RESERVE
// fuer das globale Verstehen zurueck; mandatsbezogene Arbeit darf diesen Topf nie anfassen.
// Das ist als Schutz richtig — die Zahl passt aber nicht zum gemessenen Bedarf:
//
//   5 Mandate:    98,5 % des Bedarfs ist global
//   200 Mandate:  87,2 %
//   1000 Mandate: 79,8 %
//
// Bei starrer 50/50-Aufteilung muss der Deckel deshalb GROESSER sein als der tatsaechliche
// Bedarf — sonst hungert das Verstehen, waehrend der Mandatstopf halb ungenutzt bleibt.
// Diese Funktion rechnet beides aus, damit die Aufteilung eine belegte Zahl bekommt statt
// einer geschaetzten. Sie SETZT nichts: `HELMUT_LLM_GLOBAL_ANTEIL` bleibt unveraendert.
function fairnessAufteilung(rechnung, anteilStandard = 0.5) {
  const global = Number(rechnung.ki.global) || 0;
  const mandat = Number(rechnung.ki.direktGesamt) || 0;
  const gesamt = global + mandat;
  if (gesamt <= 0) return null;
  const bedarfsanteilGlobal = global / gesamt;
  // Bei fester Aufteilung bindet der groessere der beiden Bedarfe.
  const deckelMitStandard = Math.ceil(Math.max(global / anteilStandard, mandat / (1 - anteilStandard)));
  return {
    global, mandat, gesamt,
    bedarfsanteilGlobal: Math.round(bedarfsanteilGlobal * 1000) / 10,
    anteilStandard,
    deckelMitStandard,
    deckelBeiPassenderAufteilung: gesamt,
    aufschlag: Math.round(deckelMitStandard / gesamt * 100) / 100,
    // Die Aufteilung, die zum gemessenen Bedarf passt — als EMPFEHLUNG, nicht gesetzt.
    empfohlenerGlobalAnteil: Math.round(bedarfsanteilGlobal * 100) / 100,
    hinweis: "HELMUT_LLM_GLOBAL_ANTEIL wurde NICHT veraendert. Die Fairness ist ohnehin "
      + "nur bei HELMUT_LLM_FAIRNESS=on wirksam, und dieses Flag ist aus."
  };
}

function empfehlung(rechnungen) {
  const real = rechnungen.realistisch;
  const stress = rechnungen.stress;
  const erst = rechnungen.erstbefuellungStress;
  const empfohlenerDeckel = Math.ceil(stress.ki.gesamt * 1.3 / 100) * 100;   // Stress + 30 % Reserve
  return {
    grundlage: "Stresswert + 30 % Reserve, auf volle Hunderter aufgerundet",
    tagesdeckelEmpfohlen: empfohlenerDeckel,
    reserveProzent: 30,
    warnschwelleGelb: Math.round(empfohlenerDeckel * 0.7),
    warnschwelleRot: Math.round(empfohlenerDeckel * 0.9),
    erstbefuellungEinmalig: erst ? erst.ki.gesamt : null,
    hinweisErstbefuellung: erst
      ? `Der erste Tag braucht einmalig rund ${erst.ki.gesamt} Aufrufe — er passt NICHT unter `
        + `den Dauerdeckel und braucht eine eigene, einmalige Freigabe.`
      : null,
    realistischerBedarf: real.ki.gesamt,
    stressBedarf: stress.ki.gesamt,
    // AUSDRUECKLICH: das ist eine Empfehlung, kein gesetzter Wert.
    aenderungVorgenommen: false
  };
}

async function modellFuer(anzahlMandate, { env = process.env } = {}) {
  const messung = await messeQuellenbedarf(anzahlMandate);
  const s = PARAMETER.szenarien;
  const rechnungen = {
    minimum: rechneSzenario(messung, s.minimum, { env }),
    realistisch: rechneSzenario(messung, s.realistisch, { env }),
    stress: rechneSzenario(messung, s.stress, { env }),
    erstbefuellungRealistisch: rechneErstbefuellung(messung, s.realistisch, { env }),
    erstbefuellungStress: rechneErstbefuellung(messung, s.stress, { env })
  };
  return {
    messung, rechnungen,
    empfehlung: empfehlung(rechnungen),
    fairnessAufteilung: fairnessAufteilung(rechnungen.realistisch),
    parameter: PARAMETER
  };
}

async function alleGroessen(groessen = [5, 200, 1000], { env = process.env } = {}) {
  const out = {};
  for (const n of groessen) out[n] = await modellFuer(n, { env });
  return out;
}

module.exports = { PARAMETER, messeQuellenbedarf, rechneSzenario, rechneErstbefuellung, empfehlung, fairnessAufteilung, modellFuer, alleGroessen };

// Direkt ausfuehrbar: `node scripts/skalierungsmodell.js` druckt die vollstaendige Tabelle.
if (require.main === module) {
  (async () => {
    const z = (n) => Number(n).toLocaleString("de-DE");
    const alle = await alleGroessen([5, 200, 1000]);
    console.log("Helmut — zentrale Skalierungsrechnung (OP-30)");
    console.log("  Quelle fuer DIESE Groessen: gemessen aus dem Produktionscode, gerechnet mit");
    console.log("  ausdruecklich benannten Parametern, Preise nur mit Herkunftsvermerk.");
    console.log("  KEIN Alleinvertretungsanspruch: zwei weitere Modelllinien beantworten andere");
    console.log("  Fragen (Klassenkapazitaet, geeichte Tagesmenge) — Vergleich und Grenzen in");
    console.log("  docs/betrieb/skalierung-25-50-100.md §2c.\n");

    for (const [n, m] of Object.entries(alle)) {
      const me = m.messung;
      console.log(`\n${"═".repeat(78)}\n  ${z(n)} MANDATE\n${"═".repeat(78)}`);
      console.log("  GEMESSEN (aus dem Produktionscode):");
      console.log(`    Profilquellen gesehen ............... ${z(me.profilquellenGesehen)}`);
      console.log(`    -> Abrufauftraege .................. ${z(me.auftraege.gesamt)}`
        + `  (geteilt ${z(me.auftraege.geteilt)} · persoenlich ${z(me.auftraege.persoenlich)} · Archiv ${z(me.auftraege.archiv)})`);
      console.log(`    Verdichtung ........................ ${me.verdichtung} Quellen je Auftrag`);
      console.log(`    Abrufe je Tag ...................... ${z(me.proTag.abrufeGesamt)}`
        + `  (Katalog ${z(me.proTag.katalog)} + Profil ${z(me.proTag.profilabrufeGesamt)})`);
      console.log(`    maxItems je Abruf .................. ${me.maxItemsJeAbruf.toFixed(1)}`);
      console.log(`    Anbieter ........................... ${Object.entries(me.anbieter).map(([a, k]) => `${a}=${z(k)}`).join(" · ")}`);
      console.log(`    geteilte Auftraege mit 1 Anforderer . ${z(me.geteilteMitEinemAnforderer)} von ${z(me.auftraege.geteilt)}`);

      console.log("\n  GERECHNET (Formel + Parameter, KEINE Messung):");
      console.log("    Szenario        Rohitems  Dok/Dedup    Cluster  NEUE Vorg.  KI direkt   KI gesamt   x50   x100");
      for (const k of ["minimum", "realistisch", "stress"]) {
        const r = m.rechnungen[k];
        console.log(`    ${r.szenario.padEnd(14)} ${String(z(r.rohitems.gesamt)).padStart(9)}`
          + ` ${String(z(r.dokumenteNachDedup)).padStart(10)} ${String(z(r.cluster == null ? r.neueVorgaenge : r.cluster)).padStart(10)}`
          + ` ${String(z(r.neueVorgaenge)).padStart(11)} ${String(z(r.ki.direktGesamt)).padStart(10)}`
          + ` ${String(z(r.ki.gesamt)).padStart(11)}`
          + ` ${String(r.zumDeckel.codeStandard.faktorGesamt + "x").padStart(6)}`
          + ` ${String(r.zumDeckel.empfehlungRunbook.faktorGesamt + "x").padStart(6)}`);
      }
      const er = m.rechnungen.erstbefuellungStress;
      console.log(`    ${"Erst (Stress)".padEnd(14)} ${String(z(er.rohitems.gesamt)).padStart(9)}`
        + ` ${String(z(er.dokumenteNachDedup)).padStart(10)} ${String(z(er.cluster == null ? er.neueVorgaenge : er.cluster)).padStart(10)}`
        + ` ${String(z(er.neueVorgaenge)).padStart(11)} ${String(z(er.ki.direktGesamt)).padStart(10)}`
        + ` ${String(z(er.ki.gesamt)).padStart(11)}`
        + ` ${String(er.zumDeckel.codeStandard.faktorGesamt + "x").padStart(6)}`
        + ` ${String(er.zumDeckel.empfehlungRunbook.faktorGesamt + "x").padStart(6)}`);

      const r = m.rechnungen.realistisch;
      console.log("    x50 = gegen den belegten Code-Standard (storage.js LLM_LIMIT_FALLBACK=50),");
      console.log("    x100 = gegen die Runbook-EMPFEHLUNG. Welcher Deckel in Production wirklich");
      console.log("    gilt, ist offline nicht lesbar und wird hier NICHT behauptet.");
      console.log("\n  REALISTISCHES MODELL im Detail:");
      console.log(`    notwendig (global + Lage) .......... ${z(r.ki.notwendigGesamt)}`);
      console.log(`    optional (Buero) ................... ${z(r.ki.optionalGesamt)}`);
      console.log(`    Anteil gemeinsam / persoenlich ..... ${r.ki.anteilGemeinsamProzent} % / ${r.ki.anteilPersoenlichProzent} %`);
      console.log(`    davon global profilverursacht ...... ${z(r.ki.globalProfilverursacht)}`
        + `  · katalogverursacht ${z(r.ki.globalKatalogverursacht)}`);
      console.log(`    Tokens je Tag ...................... ${z(r.tokens.ein)} ein / ${z(r.tokens.aus)} aus`);
      console.log(`    Warteschlange je Tag / Bestand ..... ${z(r.warteschlange.proTag)} / ${z(r.warteschlange.bestandBeiAufbewahrung)} Zeilen`);
      console.log(`    Speicherzuwachs je Tag ............. ${r.speicherProTagMb} MB`);
      console.log(`    Kosten ............................. ${r.kosten.berechenbar
        ? `${r.kosten.tagUsd} USD/Tag · ${r.kosten.monatUsd} USD/Monat · ${r.kosten.jeMandatMonatUsd} USD je Mandat/Monat`
        : "NICHT BERECHENBAR (kein Preis fuer das Modell hinterlegt)"}`);
      console.log(`    Preisherkunft ...................... ${r.kosten.belegt ? "BELEGT" : "NICHT BELEGT"}`
        + ` — ${JSON.stringify(r.kosten.preisherkunft)}`);

      const fa = m.fairnessAufteilung;
      if (fa) {
        console.log("\n  AUFTEILUNG DES DECKELS (nur wirksam bei HELMUT_LLM_FAIRNESS=on):");
        console.log(`    Bedarf global / mandatsbezogen ..... ${z(fa.global)} / ${z(fa.mandat)}  (${fa.bedarfsanteilGlobal} % global)`);
        console.log(`    Reserve im Code .................... ${fa.anteilStandard * 100} % global (GLOBAL_ANTEIL_STANDARD)`);
        console.log(`    noetiger Deckel bei dieser Reserve . ${z(fa.deckelMitStandard)}  (${fa.aufschlag}x des Bedarfs)`);
        console.log(`    noetiger Deckel bei passender Auft. ${z(fa.deckelBeiPassenderAufteilung)}`);
        console.log(`    empfohlener HELMUT_LLM_GLOBAL_ANTEIL ${fa.empfohlenerGlobalAnteil}  (NICHT gesetzt)`);
      }

      const e = m.empfehlung;
      console.log("\n  EMPFEHLUNG (nicht gesetzt, nur abgeleitet):");
      console.log(`    Tagesdeckel ........................ ${z(e.tagesdeckelEmpfohlen)}  (${e.grundlage})`);
      console.log(`    Warnschwellen ...................... gelb ${z(e.warnschwelleGelb)} · rot ${z(e.warnschwelleRot)}`);
      console.log(`    Erstbefuellung einmalig ............ ${z(e.erstbefuellungEinmalig)}`);
    }

    console.log(`\n${"═".repeat(78)}`);
    console.log("  WICHTIG: Die Zeilen unter GERECHNET sind KEINE Messung. Sie haengen an den");
    console.log("  Parametern in PARAMETER.szenarien und PARAMETER.tokens. Kostenbetraege gelten");
    console.log("  nur als BERECHNET, solange HELMUT_LLM_PRICE_SOURCE nicht gesetzt ist.");
  })().catch((e) => { console.error("FEHLER:", e && e.stack); process.exit(1); });
}
