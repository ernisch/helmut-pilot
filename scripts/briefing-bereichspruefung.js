"use strict";

// Lokale Auswertung eines explizit gelesenen Pakets, keine DB/HTTP/Modellaufrufe.
// Aufruf ueber scripts/lokal.js. Dateien enthalten interne Texte: nicht committen.
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const B = require("../lib/helmut/briefing-speicher");
const P = require("../lib/helmut/briefing-bereichspruefung");
const render = require("./lib/briefing-ansichten");

function aufnahme(row, rendererCommit) {
  const p = row?.payload;
  if (!p || !p.briefing?.currentHelmutState || !p.briefing?.currentRadarState
    || !p.lage) throw new Error("bereichspruefung-drei-ansichten-fehlen");
  B.pruefeZeile(row, { userId: row.user_id, day: p.tag, historisch: true });
  const root = path.join(__dirname, "..");
  if (!/^[a-f0-9]{40}$/.test(rendererCommit || "")) throw new Error("bereichspruefung-commit-fehlt");
  const local = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const committed = execFileSync("git", ["show", `${rendererCommit}:client.js`], { cwd: root, maxBuffer: 4e6 }).toString();
  if (local !== committed) throw new Error("bereichspruefung-renderer-abweichend");
  // Derselbe gespeicherte App-Vertrag wie latestBriefingPayload, ohne frische
  // Daten hinzuzumischen. Die Ausgabe behauptet keinen heutigen Live-Snapshot.
  const app = { ...p.briefing, lageBriefing: B.lageAusgabe(p.lage) };
  const { html, fachinhalt } = render(app, row.generated_at);
  const eingabe = P.binde({ mandat: row.user_id, tag: p.tag, rendererCommit,
    rendererHash: B.hash(local), profilHash: p.profilHash, datenHash: B.hash(row), html, fachinhalt });
  return { version: 1, art: "gespeichertes-paket-lokal-gerendert", paketId: row.id,
    paketErzeugtAm: row.generated_at, gelesenAm: new Date().toISOString(),
    aktuelleProductionVersorgungBelegt: false, browserAbnahme: false,
    vollstaendigerLiveSnapshot: false, eingabe, html, prompt: P.prompt(eingabe) };
}

function main(args) {
  if (args.length !== 4 && args.length !== 5) throw new Error(
    "Aufruf: node scripts/lokal.js -- node scripts/briefing-bereichspruefung.js PAKET_JSON RENDERER_COMMIT AUSGABE_JSON BERICHT_JSON [URTEIL_JSON]");
  const [paket, commit, ausgabe, bericht, urteil] = args;
  // Nie Eingabedateien ueberschreiben, vorhandene Belege nicht ersetzen.
  const files = args.filter((_, i) => i !== 1).map(f => path.resolve(f));
  if (new Set(files).size !== files.length || fs.existsSync(ausgabe) || fs.existsSync(bericht))
    throw new Error("bereichspruefung-datei-vorhanden");
  const a = aufnahme(JSON.parse(fs.readFileSync(paket, "utf8")), commit);
  const r = P.pruefe(a.eingabe, urteil ? JSON.parse(fs.readFileSync(urteil, "utf8")) : null);
  fs.writeFileSync(ausgabe, JSON.stringify(a, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  fs.writeFileSync(bericht, JSON.stringify(r, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ ...r, paketId: a.paketId, paketErzeugtAm: a.paketErzeugtAm,
    aktuelleProductionVersorgungBelegt: false, modellaufrufe: 0, productionWrites: 0 }));
  if (urteil && !r.bereit) process.exitCode = 1;
}
if (require.main === module) { try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { aufnahme };
