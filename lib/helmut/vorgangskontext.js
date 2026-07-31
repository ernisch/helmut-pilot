"use strict";

// Helmut — OP-25 K2.1: SICHERE Trennung von globalem Abruf und kontextgebundener
// Vorgangsbildung.
// =============================================================================================
// WARUM ES DIESES MODUL GIBT (Ursache, belegt — nicht vermutet):
// K1 hat den Abruf global gemacht UND damit zugleich die Vorgangsbildung global gemacht.
// K2 hat das fachlich geprueft und den Befund K1-1 bestaetigt und verbreitert
// (`docs/betrieb/cron-globalphase.md` §8a, `scripts/globalphase-buendelung-test.js`):
//
//   Helmut entscheidet „gehoert zusammen" in ZWEI Regimen mit sehr unterschiedlicher Strenge.
//     LOSES REGIME    — INNERHALB eines Batches: `clusterRawDocuments` bildet Zusammenhangs-
//                       komponenten. EINE paarweise Kante genuegt, und Kanten wirken transitiv.
//     STRENGES REGIME — ZWISCHEN Batches/Laeufen: `resolveVorgang` sucht Kandidaten ueber das
//                       Themenwurzel-Praefix und prueft KERN gegen KERN.
//
//   Die globale Buendelung aus K1 verschiebt alle Dokumente MANDATSEIGENER Quellen aus dem
//   strengen in das lose Regime. Folge, gemessen: fachlich verschiedene Vorgaenge verschmelzen
//   (K1-1a), zusammengehoerige werden getrennt (K1-1b), und Ketten laufen ueber die
//   Mandatsgrenze (K1-1c). Das ist die Fehlerklasse „Digest-Cluster" (Betriebsbefund B4/F-3).
//
// DER K2.1-VERTRAG — der Kern dieses Moduls in EINEM Satz:
//
//   Das LOSE Regime wird an einen KONTEXT gebunden; das STRENGE Regime bleibt global und
//   unveraendert.
//
// WAS DER KONTEXT IST — und warum NICHT die Mandats-ID:
// Der Auftrag verlangt ausdruecklich, den KLEINSTEN fachlich korrekten Kontext zu nehmen und
// die Mandats-ID nicht automatisch zu verwenden. Geprueft wurden Mandat, Quellenplan,
// Herausgeber, Quellentyp, Suchpraefix, Sichtbarkeitsmenge und fachliche Domaene (die
// Bewertung steht in `docs/betrieb/vorgangskontext.md` §3). Gewaehlt ist die
//
//   SICHTBARKEITSMENGE:  Kontext(Dokument) = die Menge der Mandate, deren Quellenplan dieses
//                        Dokument ueberhaupt liefert.
//
// Zwei Dokumente liegen genau dann im selben Kontext, wenn sie von GENAU DENSELBEN Mandaten
// gesehen werden. Daraus folgt unmittelbar die Sicherheitszusage des Sprints:
//
//   Werden zwei Dokumente lose gebuendelt, sieht jedes Mandat, das das eine sieht, auch das
//   andere. Eine FREMDE Mandatsquelle kann die Vorgangsidentitaet also nicht veraendern —
//   nicht weil es verboten waere, sondern weil sie strukturell nie im selben Kontext liegt.
//
// Die Sichtbarkeitsmenge ist echt kleiner und echt besser als die Mandats-ID:
//   - Quellen, die ALLE Mandate erhalten (der Bundestagskatalog), bilden EINEN Kontext.
//     Derselbe politische Vorgang wird also NICHT je Mandat dupliziert.
//   - Mandatseigene Quellen (`<mandats-id>-news`, Partei-, Ausschusssuchen) haben die
//     Sichtbarkeit {dieses Mandat} und bilden dadurch automatisch einen eigenen Kontext.
//   - Die Einteilung haengt NICHT von der Mandatsreihenfolge ab — anders als der heutige
//     Altpfad, der nachweislich reihenfolgeabhaengig ist (K2 §8a.3).
//
// VERHAELTNIS ZUM HEUTIGEN ALTPFAD — ehrlich benannt:
// Heute ist ein Batch „alles, was der Lauf EINES Mandats neu gefunden hat". Weil Rohdokumente
// global entdoppelt werden, landen geteilte Dokumente vollstaendig im Batch des ERSTEN
// Mandats der Reihenfolge; jedes spaetere Mandat sieht nur noch seine eigenen. K2.1 ist
// deshalb
//   - fuer jedes Mandat AUSSER dem ersten: dieselbe Einteilung wie heute,
//   - fuer das erste Mandat: STRENGER (seine eigenen Quellen werden nicht mehr lose mit den
//     geteilten gebuendelt),
//   - und in keinem Fall LOSER als heute.
// Was der Kontext trennt, kann das unveraenderte strenge Regime weiterhin zusammenfuehren —
// genau so, wie es heute ueber Lauf- und Batchgrenzen hinweg arbeitet.
//
// WAS DIESES MODUL NICHT TUT (ausdruecklich):
//   - keine zweite Fachlogik: Clustern, Kennung, Resolver, Understanding bleiben die
//     unveraenderten Produktionsfunktionen. Dieses Modul entscheidet nur, WELCHE Dokumente
//     gemeinsam in einen Aufruf gehen.
//   - kein Zeitbudget erhoehen: `verstehensScheiben` TEILT ein bestehendes Budget auf.
//   - keine Migration, keine Warteschlange, keine neue Infrastruktur, keine Cron-Aenderung.
//   - keine Aenderung am Altpfad und keine Aenderung am K1-Pfad.

const KONTEXT_VERSION = 1;

// Trennzeichen der Signatur. Mandatskennungen sind UUIDs/Slugs ohne `|`.
const SIGNATUR_TRENNER = "|";

// Praefix fuer Dokumente, deren Sichtbarkeit NICHT bestimmbar ist. Sie werden NICHT einem
// bestehenden Kontext zugeschlagen (das waere geraten), sondern isoliert — die einzige
// fail-closed Richtung: ein isoliertes Dokument kann keine fremde Vorgangsidentitaet
// veraendern. Es geht dabei nicht verloren (Partitionsvertrag) und wird ueber das strenge
// Regime weiterhin an einen bestehenden Vorgang gebunden, wenn es dorthin gehoert.
const UNBEKANNT_PRAEFIX = "unbekannt:";

// --- Flaggrenze ---------------------------------------------------------------------------

// DEFAULT AUS, fail closed. Nur eine ausdrueckliche Zusage schaltet ein; jeder andere Wert —
// leer, `off`, Tippfehler — bedeutet AUS. Das Flag ist NICHT in der Datei-Allowlist von
// `helmut-flags.json`; es ist ausschliesslich ueber die Vercel-Env setzbar, also ausschliesslich
// durch den Betreiber.
//
// WARUM EIN NEUES FLAG statt `HELMUT_CRON_GLOBALPHASE`: dessen Bedeutung ist „globale Erfassung
// EINSCHLIESSLICH globaler Buendelung". Genau diese Buendelung ist durch K2 als nicht
// aktivierungsfaehig belegt. Denselben Namen weiterzuverwenden wuerde bedeuten, dass ein
// gesetzter Wert je nach Codestand zwei verschiedene Dinge bedeutet — der Betreiber koennte am
// Namen nicht mehr erkennen, was er einschaltet. Das verletzt die Eindeutigkeitsbedingung aus
// Phase 3 des Auftrags.
function kontextpfadEnabled(env = process.env) {
  const raw = String((env && env.HELMUT_CRON_GLOBALABRUF) || "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "an";
}

// --- Sichtbarkeit und Signatur ----------------------------------------------------------------

// Kanonische, reihenfolgeunabhaengige Signatur einer Mandatsmenge.
function sichtbarkeitsSignatur(mandate = []) {
  const menge = [...new Set((Array.isArray(mandate) ? mandate : [])
    .map((m) => String(m == null ? "" : m).trim())
    .filter(Boolean))].sort();
  return menge.length ? menge.join(SIGNATUR_TRENNER) : null;
}

function signaturZuMandaten(signatur) {
  if (!signatur || typeof signatur !== "string") return [];
  if (signatur.startsWith(UNBEKANNT_PRAEFIX)) return [];
  return signatur.split(SIGNATUR_TRENNER).filter(Boolean);
}

// Sichtbarkeit EINES Dokuments: die Vereinigung der Sichtbarkeiten aller Quellen, aus denen es
// stammt. Ein Dokument kann ueber mehrere Wege hereinkommen (amtlich + Suchtreffer); es ist
// dann fuer die Vereinigung beider Mandatsmengen sichtbar, und genau diese Menge ist sein
// Kontext.
//
// ZWEI HERKUNFTSQUELLEN, weil es zwei Abrufarten gibt:
//   `herkunftJeQuelle`   — der Regelfall. Der Quellencrawl fuehrt jeden Abrufweg unter einer
//                          eigenen Kennung; die Vereinigungsmenge weiss, welche Mandate ihn
//                          angefordert haben (`planGlobaleQuellen(...).herkunft`).
//   `herkunftJeDokument` — der DIP-Fall. Alle amtlichen Vorgaenge laufen unter der EINEN
//                          Quellenkennung `dip`; welcher Vorgang zu welchem Profil gehoert,
//                          entscheidet erst der profilabhaengige Filter. Die Sichtbarkeit muss
//                          dort deshalb je DOKUMENT gefuehrt werden, sonst waere sie geraten.
function dokumentSichtbarkeit(dokument = {}, { herkunftJeQuelle = {}, herkunftJeDokument = {} } = {}) {
  const quellen = quellenVon(dokument);
  const mandate = new Set();
  let bekannt = false;

  const uebernehmen = (liste) => {
    if (!Array.isArray(liste)) return;
    for (const m of liste) {
      const id = String(m == null ? "" : m).trim();
      if (id) { mandate.add(id); bekannt = true; }
    }
  };

  // Je Dokument gefuehrte Herkunft hat Vorrang: sie ist die genauere Angabe.
  for (const key of dokumentSchluessel(dokument)) {
    if (herkunftJeDokument && Object.prototype.hasOwnProperty.call(herkunftJeDokument, key)) {
      uebernehmen(herkunftJeDokument[key]);
      break;
    }
  }
  if (!bekannt) {
    for (const quelle of quellen) {
      if (herkunftJeQuelle && Object.prototype.hasOwnProperty.call(herkunftJeQuelle, quelle)) {
        uebernehmen(herkunftJeQuelle[quelle]);
      }
    }
  }
  return { mandate: [...mandate].sort(), bekannt, quellen };
}

// Alle Kennungen, unter denen ein Dokument in der je-Dokument-Herkunft stehen kann. `hash` ist
// die Form der Rohitems, `content_hash`/`id` die der minimierten `raw_documents`-Zeilen.
function dokumentSchluessel(dokument = {}) {
  const roh = [dokument && dokument.hash, dokument && dokument.content_hash, dokument && dokument.id];
  return [...new Set(roh.map((k) => String(k == null ? "" : k).trim()).filter(Boolean))];
}

// Alle Quellenkennungen, unter denen ein Rohitem/Rohdokument gefuehrt wird. `sourceId` ist die
// Form der Rohitems (`crawler.js`), `source_id` die der minimierten `raw_documents`-Zeilen.
// `sourceIds` traegt die Mehrfachherkunft, wenn die Entdoppelung sie gesammelt hat.
function quellenVon(dokument = {}) {
  const roh = [
    ...(Array.isArray(dokument && dokument.sourceIds) ? dokument.sourceIds : []),
    dokument && dokument.sourceId,
    dokument && dokument.source_id
  ];
  return [...new Set(roh.map((q) => String(q == null ? "" : q).trim()).filter(Boolean))];
}

// --- Kontextplanung ------------------------------------------------------------------------------

// DER KERN. Teilt eine Dokumentmenge in Buendelungskontexte auf.
//
// EIGENSCHAFTEN, jede einzeln im Vertragstest belegt:
//   PARTITION      — jedes Dokument liegt in GENAU EINEM Kontext. Kein Dokument geht verloren,
//                    keines wird dupliziert (Abnahmekriterien 5 und 6).
//   GESCHLOSSEN    — alle Dokumente eines Kontexts haben DIESELBE Sichtbarkeitsmenge.
//   FAIL CLOSED    — ein Dokument ohne bestimmbare Sichtbarkeit wird isoliert, nicht geraten.
//   DETERMINISTISCH— das Ergebnis haengt nicht von der Dokument-, Quellen- oder
//                    Mandatsreihenfolge ab (Abnahmekriterium: Reihenfolgeunabhaengigkeit).
//
// `reihenfolge` ist die Fairnessreihenfolge der Mandate. Sie entscheidet NICHT ueber die
// Einteilung, sondern nur darueber, welcher Kontext bei knapper Zeit ZUERST verstanden wird.
function planKontexte({
  dokumente = [],
  herkunftJeQuelle = {},
  herkunftJeDokument = {},
  reihenfolge = []
} = {}) {
  const liste = (Array.isArray(dokumente) ? dokumente : []).filter(Boolean);
  const rang = new Map();
  (Array.isArray(reihenfolge) ? reihenfolge : []).forEach((id, i) => {
    const key = String(id == null ? "" : id).trim();
    if (key && !rang.has(key)) rang.set(key, i);
  });

  const kontexte = new Map();
  const zuordnung = new Map();
  const ohneSichtbarkeit = [];

  for (let i = 0; i < liste.length; i += 1) {
    const dokument = liste[i];
    const sicht = dokumentSichtbarkeit(dokument, { herkunftJeQuelle, herkunftJeDokument });
    let schluessel;
    if (sicht.bekannt && sicht.mandate.length) {
      schluessel = sichtbarkeitsSignatur(sicht.mandate);
    } else {
      // FAIL CLOSED: nach Quelle isolieren, wenn eine Quelle bekannt ist (dann teilen sich
      // wenigstens Dokumente DERSELBEN unbekannten Quelle einen Kontext — sie haben
      // zwangslaeufig dieselbe, wenn auch unbekannte Sichtbarkeit); sonst als Einzelstueck.
      const quelle = sicht.quellen[0];
      schluessel = quelle
        ? `${UNBEKANNT_PRAEFIX}quelle:${quelle}`
        : `${UNBEKANNT_PRAEFIX}dokument:${dokumentKennung(dokument, i)}`;
      ohneSichtbarkeit.push(dokumentKennung(dokument, i));
    }
    if (!kontexte.has(schluessel)) {
      kontexte.set(schluessel, {
        schluessel,
        mandate: signaturZuMandaten(schluessel),
        unbekannt: schluessel.startsWith(UNBEKANNT_PRAEFIX),
        dokumente: [],
        quellen: new Set()
      });
    }
    const kontext = kontexte.get(schluessel);
    kontext.dokumente.push(dokument);
    for (const q of sicht.quellen) kontext.quellen.add(q);
    zuordnung.set(dokumentKennung(dokument, i), schluessel);
  }

  // ORDNUNG — deterministisch und ohne Einfluss auf die Einteilung:
  //   1. kleinster Rang der beteiligten Mandate in der Fairnessreihenfolge (wer am laengsten
  //      wartet, wird zuerst versorgt),
  //   2. groessere Sichtbarkeitsmenge zuerst (ein Kontext, den viele Mandate sehen, nuetzt
  //      mehr als einer, den nur eines sieht),
  //   3. bekannt vor unbekannt,
  //   4. Signatur alphabetisch (letzter, immer eindeutiger Tiebreak).
  const geordnet = [...kontexte.values()].map((k) => ({
    ...k,
    quellen: [...k.quellen].sort(),
    rang: k.mandate.length
      ? Math.min(...k.mandate.map((m) => (rang.has(m) ? rang.get(m) : Number.MAX_SAFE_INTEGER)))
      : Number.MAX_SAFE_INTEGER
  })).sort((a, b) => (
    a.rang - b.rang
    || b.mandate.length - a.mandate.length
    || (a.unbekannt === b.unbekannt ? 0 : (a.unbekannt ? 1 : -1))
    || (a.schluessel < b.schluessel ? -1 : a.schluessel > b.schluessel ? 1 : 0)
  ));

  return {
    kontexte: geordnet,
    zuordnung,
    gesamt: geordnet.length,
    dokumente: liste.length,
    geteilt: geordnet.filter((k) => k.mandate.length > 1).length,
    mandatseigen: geordnet.filter((k) => k.mandate.length === 1).length,
    unbekannt: geordnet.filter((k) => k.unbekannt).length,
    ohneSichtbarkeit
  };
}

function dokumentKennung(dokument = {}, index = 0) {
  const id = dokument && (dokument.id != null ? dokument.id : dokument.content_hash);
  const key = String(id == null ? "" : id).trim();
  return key || `#${index}`;
}

// --- Vertragsproben (fuer Tests UND fuer den Laufzeitriegel) ---------------------------------------

// PARTITIONSVERTRAG: jedes Eingangsdokument genau einmal. Gibt die Verletzungen zurueck statt
// eines blossen `false`, damit ein Fehler benennbar bleibt (CLAUDE.md §4.4).
// Verglichen wird ueber die OBJEKTIDENTITAET, nicht ueber eine abgeleitete Kennung: ein
// Dokument ohne Kennung (feindliche Eingabe) waere sonst nicht unterscheidbar, und genau dort
// muss der Vertrag halten. Die Kennung dient nur der BENENNUNG einer Verletzung.
function pruefePartition({ dokumente = [], kontexte = [] } = {}) {
  const eingang = new Map();
  (Array.isArray(dokumente) ? dokumente : []).filter(Boolean)
    .forEach((d) => eingang.set(d, (eingang.get(d) || 0) + 1));
  const ausgang = new Map();
  for (const kontext of Array.isArray(kontexte) ? kontexte : []) {
    for (const d of (kontext && kontext.dokumente) || []) {
      ausgang.set(d, (ausgang.get(d) || 0) + 1);
    }
  }
  const fehlend = [];
  const mehrfach = [];
  let i = 0;
  for (const [d, n] of eingang.entries()) {
    const gezaehlt = ausgang.get(d) || 0;
    if (gezaehlt < n) fehlend.push(dokumentKennung(d, i));
    else if (gezaehlt > n) mehrfach.push(dokumentKennung(d, i));
    i += 1;
  }
  for (const d of ausgang.keys()) {
    if (!eingang.has(d)) mehrfach.push(dokumentKennung(d, i += 1));
  }
  return {
    ok: fehlend.length === 0 && mehrfach.length === 0,
    eingang: eingang.size,
    ausgang: ausgang.size,
    fehlend,
    mehrfach
  };
}

// KONTEXTGRENZE: alle Dokumente eines Kontexts muessen DIESELBE Sichtbarkeit haben. Das ist die
// Zusage „keine fremde Mandatsquelle veraendert die Vorgangsidentitaet", als pruefbarer Satz.
function pruefeKontextgrenze(kontext = {}, { herkunftJeQuelle = {}, herkunftJeDokument = {} } = {}) {
  const erwartet = kontext && kontext.unbekannt ? null : (kontext && kontext.schluessel) || null;
  const verletzungen = [];
  (kontext && kontext.dokumente || []).forEach((d, i) => {
    const sicht = dokumentSichtbarkeit(d, { herkunftJeQuelle, herkunftJeDokument });
    const signatur = sicht.bekannt && sicht.mandate.length ? sichtbarkeitsSignatur(sicht.mandate) : null;
    if (signatur !== erwartet) {
      verletzungen.push({ dokument: dokumentKennung(d, i), signatur, erwartet });
    }
  });
  return { ok: verletzungen.length === 0, verletzungen };
}

// Alle Kontextgrenzen auf einmal — der Riegel, den die Erfassung vor dem Verstehen zieht.
function pruefeAlleKontextgrenzen(kontexte = [], herkuenfte = {}) {
  const verletzungen = [];
  for (const kontext of Array.isArray(kontexte) ? kontexte : []) {
    const probe = pruefeKontextgrenze(kontext, herkuenfte);
    if (!probe.ok) verletzungen.push({ kontext: kontext && kontext.schluessel, ...probe });
  }
  return { ok: verletzungen.length === 0, verletzungen };
}

// --- Budgetaufteilung ueber die Kontexte -----------------------------------------------------------

// TEILT ein bestehendes Budget, es erhoeht KEINES. Jeder Kontext bekommt einen kumulativen
// Stichtag; nicht verbrauchte Zeit eines frueheren Kontexts faellt automatisch dem naechsten zu,
// die SUMME bleibt aber hart durch `gesamtMs` gedeckelt.
//
// Diese Aufteilung ist der Grund, warum der neue Pfad NICHT mehr KI-Aufrufe ausloest als der
// heutige: das Verstehensbudget je LAUF bleibt exakt das bisherige
// (`HELMUT_CRAWL_UNDERSTAND_BUDGET_MS`, heute 90 000 ms) — es wird auf die Kontexte verteilt,
// nicht je Kontext neu vergeben.
function verstehensScheiben({ gesamtMs = 0, anzahl = 0 } = {}) {
  const gesamt = Math.max(0, Math.floor(Number(gesamtMs) || 0));
  const n = Math.max(0, Math.floor(Number(anzahl) || 0));
  if (!n || !gesamt) return [];
  const scheiben = [];
  for (let i = 1; i <= n; i += 1) scheiben.push(Math.round((gesamt * i) / n));
  return scheiben;
}

// Restbudget fuer den Kontext an Position `index`, gemessen ab `startMs`.
function budgetFuerKontext({ gesamtMs = 0, anzahl = 0, index = 0, startMs = 0, jetztMs = 0 } = {}) {
  const scheiben = verstehensScheiben({ gesamtMs, anzahl });
  if (!scheiben.length) return 0;
  const i = Math.min(Math.max(0, Math.floor(Number(index) || 0)), scheiben.length - 1);
  const stichtag = (Number(startMs) || 0) + scheiben[i];
  return Math.max(0, stichtag - (Number(jetztMs) || 0));
}

// --- Beweishilfe: welche Mandate hat ein Kontext beeinflusst? -------------------------------------

// Fuer die Nachweisfamilien: kann eine Quelle `quelleId` die Vorgangsidentitaet beeinflussen,
// die Mandat `mandatId` sieht? Genau dann, wenn `mandatId` diese Quelle selbst erhaelt.
function quelleWirktAufMandat({ quelleId, mandatId, herkunftJeQuelle = {} } = {}) {
  const q = String(quelleId == null ? "" : quelleId).trim();
  const m = String(mandatId == null ? "" : mandatId).trim();
  if (!q || !m) return false;
  const liste = herkunftJeQuelle[q];
  return Array.isArray(liste) && liste.map(String).includes(m);
}

// Alle Kontexte, die ein Mandat ueberhaupt sieht.
function kontexteFuerMandat(kontexte = [], mandatId) {
  const m = String(mandatId == null ? "" : mandatId).trim();
  return (Array.isArray(kontexte) ? kontexte : []).filter((k) => (k && k.mandate || []).includes(m));
}

module.exports = {
  KONTEXT_VERSION,
  SIGNATUR_TRENNER,
  UNBEKANNT_PRAEFIX,
  kontextpfadEnabled,
  sichtbarkeitsSignatur,
  signaturZuMandaten,
  dokumentSichtbarkeit,
  quellenVon,
  dokumentSchluessel,
  planKontexte,
  dokumentKennung,
  pruefePartition,
  pruefeKontextgrenze,
  pruefeAlleKontextgrenzen,
  verstehensScheiben,
  budgetFuerKontext,
  quelleWirktAufMandat,
  kontexteFuerMandat
};
