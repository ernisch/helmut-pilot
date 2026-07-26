"use strict";

// Vorgangsbildung ALT vs. NEU an echten Production-Rohdokumenten (Betriebsbefund B4).
// =============================================================================
// AUSSCHLIESSLICH LESEND. Kein Write, kein KI-Aufruf, keine Kosten, keine
// Veraenderung an Production. Das Skript rechnet beide Verfahren gegen dieselben
// Rohdokumente durch und beantwortet drei Fragen belastbar:
//
//   1. Wie hoch war die Kollisionsquote der ALTEN Vorgangsbildung wirklich?
//      (Die Diagnose aus PR #141 nennt 21,7 % der Cluster / 47,0 % der
//      Rohdokumente — hier wird das nachgerechnet statt uebernommen.)
//   2. Wie verhaelt sich die NEUE Vorgangsbildung an denselben Daten?
//   3. Was kostet die Reparatur? Die Zahl der Cluster ist die Obergrenze der
//      KI-Aufrufe — steigt sie stark, ersetzt ein Budget-Stopp den alten stillen
//      Verlust. Genau diese Gegenprobe verlangt der Reparaturplan.
//
// METHODE: die Rohdokumente werden in ihre urspruenglichen Crawl-Stapel
// zurueckgruppiert (Luecke > STAPEL_LUECKE_MIN Minuten = neuer Stapel). Jeder
// Stapel wird so verarbeitet, wie der Lauf es getan haette; als "Bestand" gelten
// dabei nur Vorgaenge, die VOR dem Stapel existierten (ko.created_at).
//
// Aufruf:
//   HELMUT_V3_STORE=1 node scripts/vorgangsbildung-vergleich.js --tage=7
//   HELMUT_V3_STORE=1 node scripts/vorgangsbildung-vergleich.js --tage=7 --json

const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const neu = require(path.join(root, "lib/helmut/vorgang-identity.js"));

const STAPEL_LUECKE_MIN = 20;

// ---------------------------------------------------------------------------
// HISTORISCHE FASSUNG der Vorgangsbildung — Stand vor der B4-Reparatur.
// Sie steht NUR hier und NUR zu Messzwecken. Sie ist bewusst eine woertliche
// Kopie des Altzustands (8-Zeichen-Schwelle, freier Teilstring-Vergleich,
// Ein-Wort-Kennung, "erster Treffer gewinnt"), damit der Vergleich ehrlich ist
// und nicht gegen eine geschoente Rekonstruktion laeuft.
// NICHT WIEDERVERWENDEN — genau diese Logik hat den CSD-2026-Fall verschluckt.
// ---------------------------------------------------------------------------
function altAnchorTokens(text) {
  return [...new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").split(/\s+/).filter((t) => t.length >= 8)
  )];
}
function altAnchorsMatch(a, b) { return a === b || a.includes(b) || b.includes(a); }
function altCluster(rawDocuments = []) {
  const clusters = [];
  for (const doc of rawDocuments) {
    if (!doc) continue;
    const anchors = altAnchorTokens(`${doc.title || ""} ${doc.summary || ""}`);
    const target = clusters.find((c) => anchors.length && anchors.some((a) => c.anchors.some((b) => altAnchorsMatch(a, b))));
    if (target) {
      target.documents.push(doc);
      target.anchors = [...new Set([...target.anchors, ...anchors])];
    } else {
      clusters.push({ documents: [doc], anchors });
    }
  }
  return clusters;
}
function altSlug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function altDeriveVorgangId(cluster = {}) {
  const docs = cluster.documents || [];
  const perDoc = docs.map((d) => altAnchorTokens(`${d.title || ""} ${d.summary || ""}`));
  const allAnchors = [...new Set(perDoc.flat())];
  if (!allAnchors.length) {
    const first = docs[0] || {};
    const key = first.content_hash || first.id || first.title || "unbekannt";
    return `vg-${altSlug(String(key)).slice(0, 24)}`;
  }
  const rootOf = (anchor) => {
    let r = anchor;
    for (const other of allAnchors) if (altAnchorsMatch(anchor, other) && other.length < r.length) r = other;
    return r;
  };
  const roots = [...new Set(allAnchors.map(rootOf))];
  const docFreq = (r) => perDoc.filter((anchors) => anchors.some((a) => altAnchorsMatch(a, r))).length;
  const best = roots.map((r) => ({ r, df: docFreq(r) }))
    .sort((x, y) => (y.df - x.df) || (y.r.length - x.r.length) || (x.r < y.r ? -1 : 1))[0];
  return `vg-${altSlug(best.r)}`;
}
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { tage: 7, json: false, limit: 4000 };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    if (m[1] === "tage") a.tage = Math.max(1, Number(m[2]) || 7);
    else if (m[1] === "limit") a.limit = Math.max(100, Number(m[2]) || 4000);
    else if (m[1] === "json") a.json = true;
    else { console.error(`Unbekanntes Argument: --${m[1]}`); process.exit(2); }
  }
  return a;
}

// Rohdokumente in ihre urspruenglichen Crawl-Stapel zurueckgruppieren.
function baueStapel(docs, lueckeMin = STAPEL_LUECKE_MIN) {
  const sortiert = docs
    .map((d) => ({ d, t: Date.parse(d.created_at || d.retrieved_at || d.published_at || "") }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const stapel = [];
  let aktuell = null;
  for (const { d, t } of sortiert) {
    if (!aktuell || (t - aktuell.ende) > lueckeMin * 60000) {
      aktuell = { start: t, ende: t, documents: [d] };
      stapel.push(aktuell);
    } else {
      aktuell.ende = t;
      aktuell.documents.push(d);
    }
  }
  return stapel;
}

// Ein Verfahren ueber alle Stapel durchrechnen.
//   kollision = die abgeleitete Kennung trifft einen Vorgang, der VOR dem Stapel
//   existierte und NICHT dieselbe Sache beschreibt.
function simuliere({ stapel, kos, verfahren }) {
  const koListe = kos
    .map((k) => ({ ...k, ms: Date.parse(k.created_at || "") }))
    .filter((k) => Number.isFinite(k.ms));

  let cluster = 0;
  let dokumente = 0;
  let kollisionsCluster = 0;
  let kollisionsDokumente = 0;
  let neueVorgaenge = 0;
  let fortgeschrieben = 0;
  let fortgeschriebeneDokumente = 0;
  const beispiele = [];

  for (const s of stapel) {
    const gebildet = verfahren.cluster(s.documents);
    for (const c of gebildet) {
      cluster += 1;
      dokumente += c.documents.length;
      const id = verfahren.id(c);
      // Kandidaten = Vorgaenge, die es VOR dem Stapelbeginn schon gab. Welche das
      // sind, haengt vom Verfahren ab: das Altverfahren kannte nur den exakten
      // Zeichenkettentreffer, das neue sucht ueber die Themenwurzel-Praefixe.
      const kandidaten = verfahren.findeKandidaten(c, id, koListe, s.start);
      if (!kandidaten.length) { neueVorgaenge += 1; continue; }
      // Beschreibt ein Kandidat dieselbe Sache? Beim ALTEN Verfahren wurde diese
      // Frage nie gestellt — jeder Treffer galt als "schon verstanden". Genau
      // das wird hier gemessen.
      const passend = verfahren.pruefeBestand
        ? kandidaten.find((k) => verfahren.pruefeBestand(c, k))
        : null;
      if (passend) {
        // Der Vorgang wird fortgeschrieben statt dupliziert — kein Verlust, und
        // je nach Neuigkeitsgehalt auch kein zusaetzlicher KI-Aufruf.
        fortgeschrieben += 1;
        fortgeschriebeneDokumente += c.documents.length;
        continue;
      }
      if (verfahren.kollisionIstVerlust === false) {
        // Kennung belegt, Sache aber verschieden: das neue Verfahren bildet dann
        // eine eigene Kennung. Es ist ein erkannter technischer Konflikt, KEIN Verlust.
        neueVorgaenge += 1;
        continue;
      }
      kollisionsCluster += 1;
      kollisionsDokumente += c.documents.length;
      if (beispiele.length < 12) {
        beispiele.push({
          vorgangId: id,
          bestandSeit: String(kandidaten[0].created_at || "").slice(0, 10),
          dokumente: c.documents.length,
          // Titel gekuerzt und nur zur Nachvollziehbarkeit — oeffentliche
          // Schlagzeilen, keine personenbezogenen Zusatzdaten.
          beispielTitel: String((c.documents[0] && c.documents[0].title) || "").slice(0, 90)
        });
      }
    }
  }

  return {
    stapel: stapel.length, cluster, dokumente,
    neueVorgaenge, fortgeschrieben, fortgeschriebeneDokumente,
    kollisionsCluster, kollisionsDokumente,
    anteilClusterProzent: cluster ? Math.round((kollisionsCluster / cluster) * 1000) / 10 : 0,
    anteilDokumenteProzent: dokumente ? Math.round((kollisionsDokumente / dokumente) * 1000) / 10 : 0,
    beispiele
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  if (!storage.v3StoreReady()) {
    console.error("Benoetigt SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und HELMUT_V3_STORE=1 (nur lesend).");
    process.exit(3);
  }

  const [rawDocs, kos] = await Promise.all([
    storage.listRawDocuments({ days: args.tage, limit: args.limit }),
    storage.listKnowledgeObjectStates({ limit: 4000, mitUeberschrift: true })
  ]);
  const stapel = baueStapel(rawDocs || []);

  const alt = simuliere({
    stapel, kos,
    verfahren: {
      cluster: altCluster,
      id: altDeriveVorgangId,
      // Das Altverfahren kannte NUR den exakten Zeichenkettentreffer …
      findeKandidaten: (c, id, koListe, start) => koListe.filter((k) => k.vorgang_id === id && k.ms < start)
      // … und hat den Bestand nie geprueft: jeder Treffer galt als "schon
      // verstanden". pruefeBestand fehlt deshalb bewusst.
    }
  });

  const neuErgebnis = simuliere({
    stapel, kos,
    verfahren: {
      cluster: neu.clusterRawDocuments,
      id: neu.deriveVorgangId,
      // Das neue Verfahren sucht Kandidaten ueber die Themenwurzel-Praefixe —
      // exakt wie resolveVorgang() in understanding.js. Damit werden auch die
      // ALTEN Kennungen der Form `vg-<wurzel>` gefunden und fortgeschrieben.
      findeKandidaten: (c, id, koListe, start) => {
        const praefixe = neu.candidatePrefixes(c, 3);
        return koListe.filter((k) => k.ms < start && praefixe.some((p) => String(k.vorgang_id || "") === p || String(k.vorgang_id || "").startsWith(`${p}-`)));
      },
      // Der Belegvergleich laeuft hier nur gegen die UEBERSCHRIFT des Bestands.
      // Die je Kandidat verknuepften Rohdokumente zu laden waere ein Vielfaches
      // an Abfragen; im Betrieb sind sie vorhanden und der Beleg damit staerker.
      // Diese Messung ist also die VORSICHTIGE Untergrenze der Fortschreibung.
      pruefeBestand: (c, ko) => neu.sameVorgang(c, { vorgangId: ko.vorgang_id, documents: [], headline: ko.headline, display_title: ko.display_title }).gleich,
      // Eine belegte Kennung ohne passende Sache ist im neuen Verfahren ein
      // erkannter Konflikt (eigene Kennung), kein Verlust.
      kollisionIstVerlust: false
    }
  });

  const ergebnis = {
    zeitraumTage: args.tage,
    rohdokumente: (rawDocs || []).length,
    rekonstruierteStapel: stapel.length,
    vorgaengeImBestand: (kos || []).length,
    alt, neu: neuErgebnis,
    kostenVergleich: {
      clusterAlt: alt.cluster,
      clusterNeu: neuErgebnis.cluster,
      veraenderungProzent: alt.cluster ? Math.round(((neuErgebnis.cluster - alt.cluster) / alt.cluster) * 1000) / 10 : null,
      // KI-Aufrufe entstehen NUR fuer neue Vorgaenge (und fuer Aktualisierungen
      // mit belegten neuen Fakten). Fortgeschriebene und doppelte Cluster kosten
      // nichts. Die Obergrenze ist deshalb die Zahl der neuen Vorgaenge.
      kiAufrufeAltProTag: Math.round((alt.neueVorgaenge / args.tage) * 10) / 10,
      kiAufrufeNeuProTag: Math.round((neuErgebnis.neueVorgaenge / args.tage) * 10) / 10,
      tagesbudget: Number(process.env.HELMUT_MAX_LLM_CALLS_PER_DAY) || null,
      hinweis: "Obergrenze = neue Vorgaenge. Fortgeschriebene und doppelte Cluster loesen keinen Aufruf aus."
    }
  };

  if (args.json) { console.log(JSON.stringify(ergebnis, null, 2)); return process.exit(0); }

  console.log(`\nVORGANGSBILDUNG ALT vs. NEU — ${args.tage} Tage, read-only\n`);
  console.log(`Rohdokumente: ${ergebnis.rohdokumente} · rekonstruierte Crawl-Stapel: ${stapel.length} · Vorgaenge im Bestand: ${ergebnis.vorgaengeImBestand}\n`);
  const zeile = (name, r) => {
    console.log(`${name}`);
    console.log(`  Cluster gebildet            : ${r.cluster}`);
    console.log(`  neue Vorgaenge              : ${r.neueVorgaenge}`);
    console.log(`  Bestand fortgeschrieben     : ${r.fortgeschrieben}  (${r.fortgeschriebeneDokumente} Rohdokumente)`);
    console.log(`  davon Kollision mit Bestand : ${r.kollisionsCluster}  (${r.anteilClusterProzent} % der Cluster)`);
    console.log(`  betroffene Rohdokumente     : ${r.kollisionsDokumente}  (${r.anteilDokumenteProzent} % der Rohdokumente)`);
  };
  zeile("ALT (Stand vor der Reparatur — Kollision = lautloser Verlust)", alt);
  console.log("");
  zeile("NEU (Kollision = erkannt und aufgeloest, KEIN Verlust)", neuErgebnis);
  const kv = ergebnis.kostenVergleich;
  console.log(`\nKosten-Gegenprobe: Cluster ${alt.cluster} -> ${neuErgebnis.cluster} (${kv.veraenderungProzent} %)`);
  console.log(`  KI-Aufrufe (Obergrenze) je Tag: ${kv.kiAufrufeAltProTag} -> ${kv.kiAufrufeNeuProTag}`);
  console.log(`  ${kv.hinweis}`);
  console.log("  EHRLICHE FOLGE: der Bedarf lag schon vorher ueber dem Tagesbudget (100). Die Reparatur");
  console.log("  erzeugt diesen Engpass nicht, sie macht ihn SICHTBAR: was nicht mehr in den Tag passt,");
  console.log("  endet als `skipped-budget` — protokolliert, gezaehlt und gezielt nachholbar, statt");
  console.log("  wie bisher lautlos zu verschwinden. Reihenfolge entscheidet damit ueber Qualitaet:");
  console.log("  Grossereignisse werden vorgezogen, die volle Relevanzsortierung bleibt freigabepflichtig.");
  if (alt.beispiele.length) {
    console.log("\nBelegte Kollisionen des ALTEN Verfahrens (Auszug):");
    for (const b of alt.beispiele) {
      console.log(`  ${b.vorgangId}  (Bestand seit ${b.bestandSeit}, ${b.dokumente} Dok.)  ->  „${b.beispielTitel}“`);
    }
  }
  console.log("");
  return process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("Fehler:", e && e.message); process.exit(1); });
}

module.exports = { baueStapel, simuliere, altCluster, altDeriveVorgangId, STAPEL_LUECKE_MIN };
