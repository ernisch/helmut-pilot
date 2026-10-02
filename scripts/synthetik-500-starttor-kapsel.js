"use strict";

// Ausschliesslich private FS-Ausgabe. Keine Netzwerk-/DB-/Prozessadapter.
const fs = require("node:fs"), path = require("node:path");
const { TextDecoder } = require("node:util");
const K = require("../lib/helmut/synthetik-500-starttor-kapsel");
const P = require("../lib/helmut/synthetik-500-profile");
const N = require("../lib/helmut/synthetik-500-native-preimage");
const MAX_SMALL_BYTES = 2 * 1024 * 1024;
const ROOT = path.resolve(__dirname, "..");

function ausserhalbGit(p) {
  for (let d = p; ; d = path.dirname(d)) {
    const g = path.join(d, ".git");
    K.fordere(!(fs.existsSync(g) && (fs.statSync(g).isFile() || fs.existsSync(path.join(g, "HEAD")))), "private-gitroot");
    if (d === path.dirname(d)) break;
  }
}
function privatDatei(p) {
  K.fordere(path.isAbsolute(p), "privater-pfad");
  const s = fs.lstatSync(p);
  K.fordere(s.isFile() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o600, "private-datei");
  const real = fs.realpathSync(p);
  ausserhalbGit(path.dirname(real));
  K.fordere((fs.statSync(path.dirname(real)).mode & 0o777) === 0o700, "private-directory");
  return { path: real, bytes: s.size };
}
function lese(r, json = true) {
  const s = privatDatei(r.path);
  K.fordere(s.bytes <= MAX_SMALL_BYTES, "kleinbeleg-groesse");
  const bytes = fs.readFileSync(s.path);
  K.fordere(K.hash(bytes) === r.sha256, "beleg-hash");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return json ? JSON.parse(text) : text;
}
function dateistatus(belege, request) {
  const result = [{ ...privatDatei(belege.preparedClonePlan.dump), kind: "historical-native-source-dump",
    declaredSha256: belege.preparedClonePlan.dumpSha256, bytesRehashed: false }];
  const small = belege.originalSnapshotManifest;
  const dir = path.dirname(request.belege.originalSnapshotManifest.path);
  for (const [name, f] of Object.entries(small.dateien))
    result.push({ ...privatDatei(path.join(dir, name)), declaredSha256: f.sha256, rows: f.zeilen, bytesRehashed: false });
  const ctrlDir = path.dirname(request.belege.kontrollManifest.path);
  for (const t of belege.kontrollManifest.tables) {
    for (const [file, sha, bytes] of [[t.rawJsonlFile, t.rawJsonlSha256, t.rawJsonlBytes], [t.sidecarFile, t.sidecarSha256, t.sidecarBytes]]) {
      K.fordere(typeof file === "string" && path.basename(file) === file && /^[a-f0-9]{64}$/.test(sha), "control-file-name");
      const status = privatDatei(path.join(ctrlDir, file));
      K.fordere(status.bytes === bytes, "control-file-size");
      result.push({ ...status, declaredSha256: sha, bytesRehashed: false });
    }
  }
  return result;
}
function sourcePins(review) {
  const pins = {};
  for (const name of K.SOURCE5) {
    const sha = review.originalSource5Pins[name];
    const p = path.resolve(ROOT, name);
    K.fordere(p.startsWith(ROOT + path.sep) && fs.statSync(p).size <= MAX_SMALL_BYTES, "source5-path");
    pins[name] = K.hash(fs.readFileSync(p));
    K.fordere(pins[name] === sha, "source5-drift");
  }
  return pins;
}
function schreibe(fd, text) { fs.writeFileSync(fd, text); fs.fsyncSync(fd); }
function publiziere(outDir, values) {
  const resolved = path.resolve(outDir);
  const parent = fs.realpathSync(path.dirname(resolved));
  ausserhalbGit(parent);
  K.fordere((fs.statSync(parent).mode & 0o777) === 0o700, "ausgabe-directory");
  const target = path.join(parent, path.basename(resolved));
  K.fordere(!fs.existsSync(target), "ausgabe-existiert");
  const tmp = fs.mkdtempSync(path.join(parent, ".synthetik500-kapsel-"));
  fs.chmodSync(tmp, 0o700);
  try {
    const files = [];
    for (const [name, value] of Object.entries(values)) {
      K.fordere(/^[a-z][a-z0-9-]*\.(json|sql)$/.test(name) && name !== "freeze.json", "ausgabe-name");
      const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
      const fd = fs.openSync(path.join(tmp, name), "wx", 0o600);
      try { schreibe(fd, bytes); } finally { fs.closeSync(fd); }
      files.push({ file: name, bytes: bytes.length, sha256: K.hash(bytes) });
    }
    const freeze = { version: K.VERSION, files, vollstaendig: true, ausgefuehrt: false,
      starttorFreigegeben: false, grosseDatenKopiert: 0 };
    const fd = fs.openSync(path.join(tmp, "freeze.json"), "wx", 0o600);
    try { schreibe(fd, JSON.stringify(freeze, null, 2) + "\n"); } finally { fs.closeSync(fd); }
    // Auch bei paralleler Zielanlage niemals ein vorhandenes Verzeichnis ersetzen.
    fs.mkdirSync(target, { mode: 0o700 });
    for (const name of [...Object.keys(values), "freeze.json"]) {
      fs.linkSync(path.join(tmp, name), path.join(target, name));
      fs.unlinkSync(path.join(tmp, name));
    }
    fs.rmdirSync(tmp);
    return { outDir: target, files: files.length + 1, starttorFreigegeben: false, externeAnfragen: 0 };
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}
function baueDateien({ anfrage, outDir, jetzt = new Date().toISOString() }) {
  K.pruefeAnfrage(anfrage);
  const paketText = lese(anfrage.paket, false), paket = JSON.parse(paketText);
  K.fordere(P.serialisiere(paket) === paketText, "paket-kanonisch");
  const belege = {};
  for (const [key, r] of Object.entries(anfrage.belege)) belege[key] = lese(r, key !== "runtimeLesungVorlage");
  K.pruefeHistorie(anfrage, belege, paket);
  const pins = sourcePins(belege.zyklusReview), status = dateistatus(belege, anfrage);
  const original = N.aufnahmeSql(belege.originalSnapshotManifest);
  const marker = "set local statement_timeout='17s';";
  K.fordere(original.split(marker).length === 2, "aufnahme-settings");
  const aufnahme = original.replace(marker, "set local statement_timeout='20s';set local lock_timeout='2s';");
  const runtime = K.ergaenzeRuntimeLesung(belege.runtimeLesungVorlage);
  const queries = [
    { file: "native-aufnahme-readonly.sql", bytes: Buffer.byteLength(aufnahme), sha256: K.hash(aufnahme),
      originalGenerator: "lib/helmut/synthetik-500-native-preimage.js", originalQuerySha256: K.hash(original),
      purpose: "Frische Source17/Scoped18-Revisions- und22-Relationenkatalogaufnahme gegen historischen Originalarchiveanker; kein neuer Snapshot oder Import." },
    { file: "runtime-ruhe-readonly.sql", bytes: Buffer.byteLength(runtime.sql), sha256: K.hash(runtime.sql),
      originalSelectSha256: runtime.originalSelectSha256, originalSelectBytes: runtime.originalSelectBytes,
      purpose: "Unveraendertes vorhandenes Runtime10/2/ACL22/Journal-SELECT plus aktuelle5Controlcounts und500/501/0/Queue-Ruhe, opaker MainAuth-Vollfeldhash/xmin/Count sowie Ausgabe-GUCs; kein RPC-Aufruf." },
  ];
  const capsule = K.baueKapsel({ anfrage, belege, paket, sourcePins: pins, dateistatus: status, queries, erstelltAm: jetzt });
  const steps = { version: K.VERSION, caller: "Root only", nochNichtAusfuehren: true,
    reihenfolge: ["AREA1 Kostenabschluss; diese Kapsel erteilt weder Budget noch Profilrecht.",
      "Beide RO-Queries unabhaengig pruefen/freigeben; jede hoechstens einmal, kein Retry/Resume.",
      "Kompletten frischen Source/Control/Runtime-Snapshot mit aktuellem MainAuth/Journal binden; nach erfolgreichem Vier-Buecher-Commit vier geänderte Buecher und Audit42. Historisches Archiv nicht als aktuelles Importpreimage/Rueckwegsnapshot verwenden.",
      "Aktuelle terminale grosse Transportkapsel gesperrt lassen; neuen zulässigen Nativeweg getrennt beweisen.",
      "Inaktiven Import erst nach eigener Profilfreigabe und aktuellen Originalbody-/Rueckweggates.",
      "Original1500Sollplan/Vertrag/RuntimeManifest mit AREA1/AREA2 und allen frischen Primärbelegen erstellen.",
      "Originalworkflow manuell mit exakten Bindungen bewaffnen; echten lebenden <=60s bereit-lesend-Beleg erfassen.",
      "OriginalStartschutz und unabhaengige Abnahme; Aktivierung/Test erst nach getrenntem konkreten GO.",
      "OriginalEndweg und vollständige1500Endbilanz/Ruecklesung; unbekannter Writeausgang STOP ohne Write-Retry."],
    originalCli: { import: "node scripts/synthetik-500-native-import.js --paket <private-paket> --snapshot <frischer-v2-snapshot> --aufnahme <frische-native-aufnahme> --out <neues-privates-verzeichnis>",
      start: "node scripts/synthetik-500-start-sql.js --paket <private-paket> --input <frische-original-startbelege> --out <neue-private-sql-datei>",
      endwaechter: ".github/workflows/synthetik-500-endwaechter.yml: eingabepruefung, dann getrennt freigegeben bewaffnen; aktuelle Commit-/Manifest-/Runbindung verpflichtend" },
    offeneKostenfelder: belege.kostenPlan.requiredMissingInputsBeforeNumericPaidGo,
    routinePlanKandidat: capsule.routinePlanKandidat,
    keineStartParameterErfunden: true, alteTestsAusgefuehrt: 0, reineFsSqlKompositionen: 2,
    importStartEndwaechterOderWholecycleAusgefuehrt: false };
  // Kleine Eingaben nachlesen, bevor ein vollstaendiger Freeze entsteht.
  for (const [key, r] of Object.entries(anfrage.belege)) lese(r, key !== "runtimeLesungVorlage");
  lese(anfrage.paket, false);
  sourcePins(belege.zyklusReview);
  return publiziere(outDir, { "kapsel.json": capsule, "root-queue.json": steps,
    "native-aufnahme-readonly.sql": aufnahme, "runtime-ruhe-readonly.sql": runtime.sql });
}
function main(argv) {
  K.fordere(argv.length === 4 && argv[0] === "--input" && argv[2] === "--out", "cli");
  const inputPath = privatDatei(path.resolve(argv[1]));
  K.fordere(inputPath.bytes <= MAX_SMALL_BYTES, "anfrage-groesse");
  const anfrage = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(inputPath.path)));
  console.log(JSON.stringify(baueDateien({ anfrage, outDir: argv[3] })));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch { console.error("Synthetik500-Kapsel verweigert; keine externe Aktion ausgefuehrt."); process.exitCode = 1; }
}
module.exports = { baueDateien, publiziere, privatDatei, lese, main };
