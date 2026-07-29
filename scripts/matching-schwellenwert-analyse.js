"use strict";

// Sprint M-8 — REIN LESENDE Analyse der Relevanzschwelle im Matching.
//
// FRAGE: `match_knowledge_objects` liefert die Top-N unbedingt (kein
// Mindestwert, keine relative Schwelle, kein nachgelagerter Filter). Welche
// Regel verhindert, dass fachlich schwache Auffuelltreffer als relevante Lage
// erscheinen — ohne belastbare Treffer zu verlieren?
//
// DIESES SKRIPT SCHREIBT NICHTS. Es fuehrt ausschliesslich Lesezugriffe aus:
//   * `listProfiles` / `getProfile`            (Mandanten und Profile)
//   * `listMatchingResults`                    (gespeicherter Bestand)
//   * `listKnowledgeObjectsByIds`              (Merkmale der Treffer)
//   * `matchKnowledgeObjectsByEmbedding`       (die RPC selbst — `stable`,
//                                               reines SELECT, kein Schreibweg)
// Es startet KEIN Matching (`runMatchingShadow` wird nicht aufgerufen),
// schreibt KEIN Profil-Embedding, ruft KEINE KI, veraendert weder Daten noch
// Flags noch Cron noch Budgets.
//
// Secrets kommen ausschliesslich aus `process.env` (CLAUDE.md §4.9):
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · HELMUT_V3_STORE ·
//   HELMUT_STORAGE_BACKEND
//
// Aufruf:  node scripts/matching-schwellenwert-analyse.js [--json] [--tiefe=60]

const path = require("path");
const root = path.join(__dirname, "..");
const storage = require(path.join(root, "lib/helmut/storage.js"));
const matching = require(path.join(root, "lib/helmut/matching.js"));
const erklaerung = require(path.join(root, "lib/helmut/matching-erklaerung.js"));

const ALS_JSON = process.argv.includes("--json");
const TIEFE = (() => {
  const arg = process.argv.find((a) => a.startsWith("--tiefe="));
  const n = arg ? Number(arg.split("=")[1]) : 60;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
})();

const ZEILEN_LIMIT = 5000;
// Genau die Zahl, die der Nutzer in „Lage" tatsaechlich sieht (lage.js).
const LAGE_FENSTER = Number(process.env.HELMUT_LAGE_MAX_VORGAENGE) || 12;
// Genau die Zahl, die der Schreibpfad heute erzwingt (matching.js: input.limit || 20).
const TOP_N = 20;

const ABS_SCHWELLEN = [0.0001, 0.05, 0.1, 0.15, 0.2, 0.22, 0.25];
const REL_ANTEILE = [0.5, 0.6, 0.7];

function r4(x) { return Math.round(Number(x) * 10000) / 10000; }
function prozent(a, b) { return b > 0 ? `${((a / b) * 100).toFixed(1)} %` : "—"; }

function kennzahlen(werte) {
  const s = [...werte].sort((a, b) => a - b);
  if (!s.length) return null;
  const bei = (i) => (i >= 1 && i <= s.length ? r4(s[s.length - i]) : null); // Rang von oben
  return {
    n: s.length,
    min: r4(s[0]),
    max: r4(s[s.length - 1]),
    median: r4(s[Math.floor(s.length / 2)]),
    rang1: bei(1), rang5: bei(5), rang10: bei(10), rang12: bei(12), rang20: bei(20)
  };
}

// Ein Profil ohne Partei, ohne Ausschuss und ohne Schwerpunkt kann per
// Konstruktion nie einen Beleg erzeugen (Befund M-9) und traegt einen
// Nullvektor -> die Reihenfolge der Treffer ist beliebig. Solche Mandanten
// werden getrennt ausgewiesen und NICHT zur fachlichen Abnahme verwendet.
function istPlatzhalter(pf) {
  return !pf || (!pf.parties.length && !pf.committees.length && !pf.topics.length);
}

function vektorLeer(vec) {
  return !Array.isArray(vec) || !vec.some((x) => Number(x) !== 0);
}

function falte(v) {
  return String(v == null ? "" : v)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Belastbare Signale, die heute NICHT als matched_feature gespeichert werden
// (Befund aus Sprint 23C-2A). Sie entscheiden, ob ein Gate auf
// `matched_features` echte Treffer verlieren wuerde.
function zusatzBeleg(profil, ko) {
  const name = falte(profil.fullName || profil.name || "");
  const erwaehnt = [...(ko.mentioned_mps || []), ...(ko.mentioned_people || [])].map(falte).filter(Boolean);
  const namentlich = Boolean(name && erwaehnt.some((n) => n.includes(name)));
  const regionen = matching.profileFeatures(profil).regions.map(falte).filter(Boolean);
  const geo = (Array.isArray(ko.affected_geographies) ? ko.affected_geographies : [])
    .map((g) => (g && typeof g === "object" ? g.name : g)).map(falte).filter(Boolean);
  const geografisch = regionen.some((r) => geo.some((g) => g && (r.includes(g) || g.includes(r))));
  return { namentlich, geografisch };
}

// ── Gate-Varianten. Jede bekommt die vollstaendige, absteigend sortierte
// Trefferliste und gibt zurueck, welche Treffer sichtbar blieben. ───────────
function varianteA(treffer) { return treffer.slice(0, TOP_N); }

function varianteB(treffer, tau) {
  return treffer.slice(0, TOP_N).filter((t) => t.similarity >= tau);
}

function varianteC(treffer, anteil) {
  const oben = treffer.slice(0, TOP_N);
  const best = oben.length ? oben[0].similarity : 0;
  if (!(best > 0)) return [];
  return oben.filter((t) => t.similarity >= best * anteil);
}

function varianteD(treffer, tau) {
  return treffer.slice(0, TOP_N).filter((t) => t.similarity >= tau && t.nfeat > 0);
}

// E: Mindestmenge/Hoechstmenge. Schwelle greift, aber es bleiben mindestens
// `min` Treffer stehen (aus den besten), hoechstens `max`.
function varianteE(treffer, tau, min = 3, max = LAGE_FENSTER) {
  const oben = treffer.slice(0, TOP_N);
  const stark = oben.filter((t) => t.similarity >= tau);
  const basis = stark.length >= min ? stark : oben.slice(0, Math.min(min, oben.length));
  return basis.slice(0, max);
}

// F: Plausibilitaetsriegel statt Schwellenwert — nur das, was die Daten
// zweifelsfrei hergeben: kein Ergebnis aus einem leeren Profilvektor, keine
// Aehnlichkeit <= 0. Verlangt KEINE fachliche Kalibrierung.
function varianteF(treffer, profilVektorLeer) {
  if (profilVektorLeer) return [];
  return treffer.slice(0, TOP_N).filter((t) => t.similarity > 0);
}

// G: belegter Profilbezug OHNE Aehnlichkeitsschwelle — Merkmal ODER
// namentliche Erwaehnung ODER betroffene Geografie. Genau die Signale, die dem
// Nutzer als Grund gezeigt werden koennen.
function varianteG(treffer) {
  return treffer.slice(0, TOP_N).filter((t) => t.belegt);
}

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Abbruch: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus der Umgebung, nie aus dem Repo).");
    process.exit(2);
  }

  const profile = await storage.listProfiles();
  const ids = (Array.isArray(profile) ? profile : []).map((p) => p && p.id).filter(Boolean);
  if (!ids.length) throw new Error("Keine Mandatsprofile lesbar — Analyse abgebrochen (kein falsches Grün).");

  const bericht = [];

  for (const userId of ids) {
    const prof = await storage.getProfile(userId);
    if (!prof) continue;
    const pf = matching.profileFeatures(prof);
    const platzhalter = istPlatzhalter(pf);

    // ── 1 · Gespeicherter Bestand (das, was Nutzer heute sehen koennen) ─────
    const rows = await storage.listMatchingResults({ userId, limit: ZEILEN_LIMIT });
    const bestand = {
      zeilen: rows.length,
      neg: rows.filter((r) => Number(r.similarity) < 0).length,
      null_: rows.filter((r) => Number(r.similarity) === 0).length,
      pos: rows.filter((r) => Number(r.similarity) > 0).length,
      mitFeature: rows.filter((r) => Array.isArray(r.matched_features) && r.matched_features.length).length,
      mitBegruendung: rows.filter((r) => erklaerung.erklaerungAusErgebnis(r) !== null).length,
      verteilung: kennzahlen(rows.map((r) => Number(r.similarity) || 0))
    };
    // Sichtbares Fenster: `listMatchingResults` liefert created_at.desc,
    // lage.js zeigt davon die ersten LAGE_FENSTER — NICHT die besten.
    const fenster = rows.slice(0, LAGE_FENSTER);
    bestand.fenster = {
      n: fenster.length,
      le0: fenster.filter((r) => Number(r.similarity) <= 0).length,
      verteilung: kennzahlen(fenster.map((r) => Number(r.similarity) || 0))
    };

    // ── 2 · Heutige Kandidatenkurve (die RPC selbst, rein lesend) ──────────
    // Genau der Vektor, den der Schreibpfad bilden WUERDE (reine Funktion,
    // kein Schreibzugriff auf profile_embeddings).
    const vec = matching.embedProfile(prof, matching.EMBEDDING_DIM);
    const leererVektor = vektorLeer(vec);
    const suche = await storage.matchKnowledgeObjectsByEmbedding({ embedding: vec, matchCount: TIEFE });
    const roh = (suche && suche.results) || [];
    const koIds = [...new Set(roh.map((h) => String(h.id)).filter(Boolean))];
    const kos = koIds.length ? await storage.listKnowledgeObjectsByIds(koIds) : [];
    const byId = new Map((kos || []).map((k) => [k.id, k]));
    const treffer = roh.map((h, i) => {
      const ko = byId.get(h.id) || {};
      const feats = matching.matchedFeatures(pf, matching.knowledgeObjectFeatures(ko));
      const zusatz = zusatzBeleg(prof, ko);
      return {
        rang: i + 1,
        similarity: r4(h.similarity),
        nfeat: feats.length,
        namentlich: zusatz.namentlich,
        geografisch: zusatz.geografisch,
        belegt: feats.length > 0 || zusatz.namentlich || zusatz.geografisch
      };
    });

    const kurve = {
      geliefert: treffer.length,
      verteilung: kennzahlen(treffer.map((t) => t.similarity)),
      top20: kennzahlen(treffer.slice(0, TOP_N).map((t) => t.similarity)),
      top20MitFeature: treffer.slice(0, TOP_N).filter((t) => t.nfeat > 0).length,
      top20Belegt: treffer.slice(0, TOP_N).filter((t) => t.belegt).length,
      // Treffer, die ein Merkmalsgate verlieren WUERDE, obwohl ein anderes
      // belastbares Signal vorliegt (Namensnennung/Geografie).
      nurZusatzbeleg: treffer.slice(0, TOP_N).filter((t) => t.nfeat === 0 && t.belegt).length,
      le0ImTop20: treffer.slice(0, TOP_N).filter((t) => t.similarity <= 0).length,
      // Zusammenhang Aehnlichkeit <-> belegbarer Profilbezug innerhalb der Top-N
      simMitFeature: kennzahlen(treffer.slice(0, TOP_N).filter((t) => t.nfeat > 0).map((t) => t.similarity)),
      simOhneFeature: kennzahlen(treffer.slice(0, TOP_N).filter((t) => t.nfeat === 0).map((t) => t.similarity))
    };

    // ── 3 · Varianten auf der heutigen Kandidatenkurve ─────────────────────
    const varianten = { A: varianteA(treffer).length };
    for (const tau of ABS_SCHWELLEN) varianten[`B@${tau}`] = varianteB(treffer, tau).length;
    for (const a of REL_ANTEILE) varianten[`C@${a}`] = varianteC(treffer, a).length;
    for (const tau of [0.2, 0.22]) varianten[`D@${tau}`] = varianteD(treffer, tau).length;
    for (const tau of [0.2, 0.22, 0.25]) varianten[`E@${tau}`] = varianteE(treffer, tau).length;
    varianten.F = varianteF(treffer, leererVektor).length;
    varianten.G = varianteG(treffer).length;

    bericht.push({ userId, platzhalter, leererVektor, aktiv: prof.aktiv !== false, bestand, kurve, varianten });
  }

  if (ALS_JSON) { console.log(JSON.stringify({ TOP_N, LAGE_FENSTER, TIEFE, bericht }, null, 2)); return; }

  console.log(`=== M-8 · Relevanzschwelle — rein lesende Analyse (Top-N=${TOP_N}, Lagefenster=${LAGE_FENSTER}, Suchtiefe=${TIEFE}) ===\n`);

  console.log("--- Gespeicherter Bestand je Mandant (aktuell = true) ---");
  console.log("mandant                 zeilen   <0    =0    >0  feat  begr   min    median  max     Fenster<=0");
  for (const b of bericht) {
    const v = b.bestand.verteilung || {};
    console.log(
      `${(b.userId + (b.platzhalter ? " *" : "")).padEnd(22)} ${String(b.bestand.zeilen).padStart(6)} ` +
      `${String(b.bestand.neg).padStart(4)} ${String(b.bestand.null_).padStart(5)} ${String(b.bestand.pos).padStart(5)} ` +
      `${String(b.bestand.mitFeature).padStart(5)} ${String(b.bestand.mitBegruendung).padStart(5)} ` +
      `${String(v.min ?? "—").padStart(8)} ${String(v.median ?? "—").padStart(7)} ${String(v.max ?? "—").padStart(7)} ` +
      `${String(b.bestand.fenster.le0).padStart(11)}`
    );
  }
  console.log("* = Platzhalterprofil (ohne Partei/Ausschuss/Schwerpunkt) — nicht zur fachlichen Abnahme geeignet.\n");

  console.log("--- Heutige Kandidatenkurve der RPC (rein lesend, nichts gespeichert) ---");
  console.log("mandant                 Rang1   Rang5  Rang10  Rang12  Rang20  <=0 im Top20  mit Merkmal");
  for (const b of bericht) {
    const k = b.kurve.top20 || {};
    console.log(
      `${(b.userId + (b.platzhalter ? " *" : "")).padEnd(22)} ${String(k.rang1 ?? "—").padStart(6)} ` +
      `${String(k.rang5 ?? "—").padStart(7)} ${String(k.rang10 ?? "—").padStart(7)} ` +
      `${String(k.rang12 ?? "—").padStart(7)} ${String(k.rang20 ?? "—").padStart(7)} ` +
      `${String(b.kurve.le0ImTop20).padStart(13)} ${String(`${b.kurve.top20MitFeature}/${Math.min(TOP_N, b.kurve.geliefert)}`).padStart(12)}`
    );
  }

  console.log("\n--- Belegbarkeit im heutigen Top-20 ---");
  console.log("mandant                 mit Merkmal  zusaetzl. Beleg (Name/Geo)  belegt gesamt");
  for (const b of bericht) {
    console.log(
      `${(b.userId + (b.platzhalter ? " *" : "")).padEnd(22)} ${String(b.kurve.top20MitFeature).padStart(11)} ` +
      `${String(b.kurve.nurZusatzbeleg).padStart(26)} ${String(b.kurve.top20Belegt).padStart(13)}`
    );
  }

  console.log("\n--- Aehnlichkeit mit vs. ohne belegbaren Profilbezug (Top-20, heute) ---");
  console.log("mandant                 mit Merkmal (min/median/max)      ohne Merkmal (min/median/max)");
  for (const b of bericht) {
    const m = b.kurve.simMitFeature, o = b.kurve.simOhneFeature;
    const f = (x) => (x ? `${x.min} / ${x.median} / ${x.max}`.padEnd(30) : "—".padEnd(30));
    console.log(`${(b.userId + (b.platzhalter ? " *" : "")).padEnd(22)} ${f(m)}  ${f(o)}`);
  }

  console.log("\n--- Sichtbare Vorgaenge je Variante (aus der heutigen Kandidatenkurve, gedeckelt auf Top-20) ---");
  const spalten = Object.keys(bericht[0] ? bericht[0].varianten : {});
  console.log("mandant                 " + spalten.map((s) => s.padStart(8)).join(""));
  for (const b of bericht) {
    console.log(`${(b.userId + (b.platzhalter ? " *" : "")).padEnd(22)} ` +
      spalten.map((s) => String(b.varianten[s]).padStart(8)).join(""));
  }

  console.log("\nLegende: A = heute (kein Gate) · B@x = absolute Mindestaehnlichkeit x ·");
  console.log("C@a = relative Schwelle a x bester Treffer · D@x = x UND belegtes Merkmal ·");
  console.log("E@x = x, aber mindestens 3 und hoechstens " + LAGE_FENSTER + " · F = Plausibilitaetsriegel (Profilvektor != 0 und Aehnlichkeit > 0) ·");
  console.log("G = belegter Profilbezug ohne Schwellenwert (Merkmal ODER Namensnennung ODER betroffene Geografie)");
  console.log("\nEs wurde NICHTS geschrieben und kein Matching gestartet.");
})().catch((error) => {
  console.error("Analyse abgebrochen:", error && error.message ? error.message : error);
  process.exit(1);
});
