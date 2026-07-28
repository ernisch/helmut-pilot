"use strict";

// Sprint 22B — begrenzter semantischer Embedding-Testlauf über die feste
// Testmenge (scripts/fixtures/embedding-testset-22b.json).
//
// FREIGABEREGEL (verbindlich): Der echte, kostenpflichtige Modellaufruf ist
// erst NACH ausdrücklicher Betreiberfreigabe erlaubt. Ohne die Flags
// `--echt --freigabe erteilt` läuft ausschließlich der Dry-Run (0 Netz,
// 0 Kosten, 0 Writes). Auch der echte Lauf schreibt NIE in eine Datenbank —
// Ergebnisse landen ausschließlich lokal in shadow-store/ (gitignored).
//
// Secrets kommen ausschließlich aus process.env (CLAUDE.md §4.9):
//   Weg A (bevorzugt, bestehender Provider): AZURE_OPENAI_ENDPOINT,
//     AZURE_OPENAI_KEY (Repo-Konvention, lib/helmut/ai.js),
//     HELMUT_EMBEDDING_DEPLOYMENT (Azure-Deploymentname)
//   Weg B (OpenAI-kompatible API): HELMUT_EMBEDDING_API_BASE,
//     HELMUT_EMBEDDING_API_KEY
//
// Aufruf:
//   node scripts/embedding-testlauf.js                     → Dry-Run + Freigabepaket
//   node scripts/embedding-testlauf.js --echt --freigabe erteilt   → echter Lauf

const fs = require("fs");
const path = require("path");
const { createFileStore, runShadowPipeline } = require("../lib/helmut/embedding-shadow-pipeline.js");
const { RECIPE_VERSION } = require("../lib/helmut/embedding-contract.js");

const FIXTURE = path.join(__dirname, "fixtures", "embedding-testset-22b.json");
const ABLAGE = path.join(__dirname, "..", "shadow-store", "embedding-testlauf-22b.json");

const MODELL = process.env.HELMUT_EMBEDDING_MODEL || "text-embedding-3-small";
const DIM = Number(process.env.HELMUT_EMBEDDING_DIM || 256);
// Extern belegter Listenpreis (OpenAI, USD je 1 M Input-Tokens, Stand 2026-07).
// Der tatsächliche (Azure-)Preis ist vor der Freigabe gegenzuprüfen.
const PREIS_PRO_MTOK = Number(process.env.HELMUT_EMBEDDING_PREIS_PRO_MTOK || 0.02);
// Harte Limits des Testlaufs — bewusst knapp über der Testmenge (56 Objekte).
const MAX_OBJEKTE = 80;
const MAX_TOKENS = 60000;

function azureProvider() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.HELMUT_EMBEDDING_DEPLOYMENT;
  if (!endpoint || !key || !deployment) return null;
  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/embeddings?api-version=2024-10-21`;
  return { name: "azure-openai", aufruf: async ({ dim, inputs }) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({ input: inputs, dimensions: dim })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const vectors = (json.data || []).slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { vectors };
  } };
}

function openaiKompatibelProvider() {
  const base = process.env.HELMUT_EMBEDDING_API_BASE;
  const key = process.env.HELMUT_EMBEDDING_API_KEY;
  if (!base || !key) return null;
  const url = `${base.replace(/\/$/, "")}/embeddings`;
  return { name: "openai-kompatibel", aufruf: async ({ model, dim, inputs }) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: inputs, dimensions: dim })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const vectors = (json.data || []).slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { vectors };
  } };
}

async function main() {
  const args = process.argv.slice(2);
  const echt = args.includes("--echt");
  const freigabe = args[args.indexOf("--freigabe") + 1] === "erteilt";

  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const objekte = fixture.objekte.map((o) => ({ ...o, understanding_status: "complete" }));
  const store = createFileStore(ABLAGE);

  const cfg = {
    model: MODELL, dim: DIM, recipeVersion: RECIPE_VERSION,
    batchGroesse: 25, maxObjekte: MAX_OBJEKTE, maxTokens: MAX_TOKENS,
    preisProMTok: PREIS_PRO_MTOK
  };

  // Immer zuerst der Dry-Run — er ist zugleich das Freigabepaket.
  const dry = await runShadowPipeline(objekte, store, null, { ...cfg, providerName: "dry-run", dryRun: true });
  console.log("== Sprint-22B-Testlauf — Vorschau (Dry-Run, 0 Netz, 0 Kosten) ==");
  console.log(`Modell: ${MODELL} · Dimension: ${DIM} · Rezept: ${RECIPE_VERSION}`);
  console.log(`Objekte geplant: ${dry.geplant} (bereits aktuell: ${dry.aktuellUebersprungen}, Limits: ${dry.objektlimitAbgeschnitten}/${dry.tokenlimitAbgeschnitten})`);
  console.log(`Batches: ${dry.batches} · geschätzte Tokens: ${dry.tokens}`);
  console.log(`geschätzte Kosten bei ${PREIS_PRO_MTOK} USD/MTok: ${dry.kostenSchaetzung == null ? "unbekannt" : dry.kostenSchaetzung.toFixed(4)} USD`);
  console.log(`gesendet wird je Objekt NUR der kanonische Eingang (${RECIPE_VERSION}): Titel, Vorgang, Bedeutung, Ereignistyp, Akteursnamen — keine Mandanten-/Nutzerdaten.`);
  console.log(`Ablage (lokal, gitignored): ${ABLAGE}`);

  if (!echt) {
    console.log("\nKein echter Lauf: --echt fehlt. Der echte Lauf braucht zusätzlich `--freigabe erteilt` (Betreiberfreigabe).");
    return;
  }
  if (!freigabe) {
    console.error("\nSTOPP: --echt ohne `--freigabe erteilt`. Der kostenpflichtige Aufruf ist freigabepflichtig.");
    process.exit(2);
  }

  const provider = azureProvider() || openaiKompatibelProvider();
  if (!provider) {
    console.error("\nSTOPP: keine Provider-Secrets in process.env (Weg A: AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY + HELMUT_EMBEDDING_DEPLOYMENT · Weg B: HELMUT_EMBEDDING_API_BASE + HELMUT_EMBEDDING_API_KEY).");
    process.exit(2);
  }

  console.log(`\n== ECHTER LAUF über ${provider.name} ==`);
  const bericht = await runShadowPipeline(objekte, store, provider.aufruf, { ...cfg, providerName: provider.name });
  console.log(`berechnet: ${bericht.berechnet} · fehlgeschlagen: ${bericht.fehlgeschlagen.length} · Tokens: ${bericht.tokens} · Kosten ≈ ${bericht.kostenSchaetzung == null ? "?" : bericht.kostenSchaetzung.toFixed(4)} USD`);
  for (const f of bericht.fehlgeschlagen) console.log("  FEHLER", f.id, "→", f.grund);
  if (bericht.abgebrochen) console.log("ABGEBROCHEN nach wiederholten Providerfehlern — Wiederaufnahme: gleicher Aufruf erneut.");
  console.log(`\nAuswertung: node scripts/embedding-quality-eval.js --semantik ${ABLAGE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
