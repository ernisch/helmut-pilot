"use strict";

// Helmut — VERTRAGSTEST DES REALISTIKNACHWEISES Z3 (Skalierungssprint 2026-08-26).
// =============================================================================================
// WOZU. Der Nachweislauf selbst (`scripts/skalierung-z3-realistiklauf.js`) braucht eine lokale
// PostgreSQL und ein lokales PostgREST und laeuft deshalb NICHT in der CI — genau wie der
// synthetische Lauf. Damit waere jede Regression in diesem Werkzeug unbemerkt geblieben
// (belegter Befund: `*-lasttest.js` wird vom Runner nie eingesammelt). Diese Suite schliesst
// die Luecke: sie prueft ALLES am Nachweis, was ohne Datenbank pruefbar ist —
//
//   * die Sicherheitsriegel (Kennungen, Schleifenadresse, Zertifikat),
//   * das Verhalten der drei lokalen Dienste (Ursprung, KI-Endpunkt, Datenbanktor),
//   * den Kostenriegel,
//   * die Ehrlichkeit der Einordnung (nie „Z3 bestanden"),
//   * und die beiden Fixture-Fehler, die dieser Sprint im BESTEHENDEN Z2-Werkzeug gefunden hat.
//
// Sie macht ausschliesslich Verbindungen zur Schleifenadresse und braucht keine Zugangsdaten.

const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "scripts/fixtures/z3-plattform.js"));

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  return ok;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function lies(datei) { return fs.readFileSync(path.join(ROOT, datei), "utf8"); }

function holeHttp(url, opt = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const anfrage = mod.request(url, { method: opt.method || "GET", headers: opt.headers || {}, timeout: opt.timeoutMs || 4000 },
      (antwort) => {
        let rumpf = "";
        antwort.on("data", (d) => { rumpf += d; });
        antwort.on("end", () => resolve({ status: antwort.statusCode, kopf: antwort.headers, rumpf }));
      });
    anfrage.on("timeout", () => { anfrage.destroy(new Error("timeout")); });
    anfrage.on("error", reject);
    if (opt.rumpf) anfrage.write(opt.rumpf);
    anfrage.end();
  });
}

async function main() {
  console.log("Helmut — Vertragstest Realistiknachweis Z3\n");

  // ── A · Kennungsisolierung ────────────────────────────────────────────────────────────────
  abschnitt("A · Kennungsisolierung (der belegte Anlass dieses Sprints)");
  const schutz = require(path.join(ROOT, "scripts/lokaler-netzschutz.js"));
  for (const name of ["AZURE_OPENAI_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"]) {
    check(`A1 ${name} gilt als reine Zugangsdatei`, schutz.REINE_ZUGANGSDATEN.includes(name));
    check(`A2 ${name} wird von scripts/lokal.js aus der Kindumgebung entfernt`,
      schutz.PRODUCTION_KENNUNGEN.includes(name));
  }
  check("A3 Der bisherige Bestand ist unveraendert enthalten",
    ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "VERCEL_TOKEN"]
      .every((n) => schutz.REINE_ZUGANGSDATEN.includes(n)));
  // Gegenprobe zur Laufzeit: ein Kindprozess ueber lokal.js darf die Azure-Kennung nicht sehen.
  // NODE_OPTIONS wird bewusst geleert — sonst liefe der Preload des Netzschutzes SCHON VOR
  // `lokal.js`, saehe die hier absichtlich gesetzte Attrappe und braeche mit Exit 3 ab, bevor
  // `lokal.js` ueberhaupt aufraeumen kann. Geprueft werden soll aber genau dieses Aufraeumen.
  const kindUmgebung = { ...process.env, AZURE_OPENAI_KEY: "attrappe", AZURE_OPENAI_ENDPOINT: "https://beispiel.invalid" };
  delete kindUmgebung.NODE_OPTIONS;
  const kind = spawnSync(process.execPath, [path.join(ROOT, "scripts/lokal.js"), "--", process.execPath, "-e",
    "process.stdout.write(JSON.stringify({k: !!process.env.AZURE_OPENAI_KEY, e: !!process.env.AZURE_OPENAI_ENDPOINT}))"],
  { encoding: "utf8", env: kindUmgebung, timeout: 30000 });
  let gesehen = null;
  try { gesehen = JSON.parse(String(kind.stdout || "").trim().split("\n").pop()); } catch (_) { gesehen = null; }
  check("A4 Gegenprobe: der Kindprozess sieht weder Azure-Schluessel noch Azure-Endpunkt",
    Boolean(gesehen) && gesehen.k === false && gesehen.e === false,
    gesehen ? JSON.stringify(gesehen) : String(kind.stderr || "").slice(-200));

  // ── B · Anbieterursprung ──────────────────────────────────────────────────────────────────
  abschnitt("B · Anbieterursprung: echtes HTTP, echte Drosselung, echter Dauerfehler");
  const ursprung = await P.starteAnbieterUrsprung({
    latenzMs: 1, latenzStreuungMs: 2, drosselAnteil: 0, ausfallAnteil: 0,
    eintraegeJeAntwort: 12, geteilteThemen: 40, ueberschneidungAnteil: 0.9,
    dokumenteJeVorgang: 4, frischeAnteil: 0.25
  });
  check("B1 Der Ursprung bindet ausschliesslich an die Schleifenadresse",
    ursprung.url.startsWith("http://127.0.0.1:"), ursprung.url);
  const a1 = await holeHttp(`${ursprung.url}/rss/search?q=probe`);
  check("B2 Er liefert wohlgeformtes RSS", a1.status === 200 && /<rss version="2.0">/.test(a1.rumpf)
    && (a1.rumpf.match(/<item>/g) || []).length === 12, `Status ${a1.status}`);
  check("B3 Der Inhalt ist ausdruecklich als synthetisch gekennzeichnet",
    /synthetischer-lasttestinhalt/.test(a1.rumpf) && /synthetisch/.test(a1.rumpf));
  const a2 = await holeHttp(`${ursprung.url}/rss/search?q=probe`);
  check("B4 Ein zweiter Abruf liefert teils NEUE Meldungen (kein kuenstlich billiger Lauf)",
    a1.rumpf !== a2.rumpf);
  const a3 = await holeHttp(`${ursprung.url}/rss/search?q=probe2`);
  check("B5 Ein anderer Weg liefert andere Meldungen", a1.rumpf !== a3.rumpf);

  // Der feste Fehlerweg antwortet NIE — daran haengt das Fehlermandat des Lasttests.
  let haenger = "keine-antwort";
  try { await holeHttp(`${ursprung.url}/immer-haenger`, { timeoutMs: 700 }); haenger = "beantwortet"; }
  catch (_) { haenger = "keine-antwort"; }
  check("B6 `/immer-haenger` antwortet nie (echter Abruffehler statt ausgetauschtem Handler)",
    haenger === "keine-antwort", haenger);

  // Drosselung mit Retry-After — echte 429, nicht simuliert im Aufrufer.
  const gedrosselt = await P.starteAnbieterUrsprung({ latenzMs: 1, latenzStreuungMs: 2, drosselAnteil: 1 });
  const d1 = await holeHttp(`${gedrosselt.url}/rss/search?q=x`);
  check("B7 Bei Drosselung antwortet der Ursprung mit 429 und Retry-After",
    d1.status === 429 && String(d1.kopf["retry-after"] || "") !== "", `Status ${d1.status}`);
  await gedrosselt.stoppe();

  const ausgefallen = await P.starteAnbieterUrsprung({ latenzMs: 1, latenzStreuungMs: 2, ausfallAnteil: 1 });
  const f1 = await holeHttp(`${ausgefallen.url}/rss/search?q=x`);
  check("B8 Bei Ausfall antwortet der Ursprung mit 503", f1.status === 503, `Status ${f1.status}`);
  await ausgefallen.stoppe();

  // ── C · Vorgangsvielfalt (der Riegel gegen kuenstlich guenstige Deduplizierung) ────────────
  abschnitt("C · Vorgangsvielfalt: die Inhalte duerfen nicht zu EINEM Vorgang verschmelzen");
  const identity = require(path.join(ROOT, "lib/helmut/vorgang-identity.js"));
  const dokumente = [];
  for (const weg of ["/rss/a", "/rss/b", "/rss/c", "/rss/d"]) {
    const antwort = await holeHttp(`${ursprung.url}${weg}`);
    const titel = [...antwort.rumpf.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]).slice(1);
    const texte = [...antwort.rumpf.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]);
    const kennungen = [...antwort.rumpf.matchAll(/isPermaLink="false">([^<]+)</g)].map((m) => m[1]);
    titel.forEach((t, i) => dokumente.push({
      id: `rd-${weg}-${i}`, title: t, summary: String(texte[i] || "").slice(0, 400),
      content_hash: kennungen[i] || `${weg}-${i}`, published_at: new Date().toISOString(), source_id: weg
    }));
  }
  const cluster = identity.clusterRawDocuments(dokumente);
  check("C1 Aus den Inhalten entstehen VIELE Vorgaenge, nicht einer",
    cluster.length >= Math.max(4, Math.floor(dokumente.length / 12)),
    `${dokumente.length} Dokumente -> ${cluster.length} Vorgaenge`);
  check("C2 Es entstehen auch MEHRDOKUMENTIGE Vorgaenge (Ueberschneidung wirkt)",
    cluster.some((c) => (c.documents || []).length > 1),
    `groesster Vorgang ${Math.max(...cluster.map((c) => (c.documents || []).length))} Dokumente`);
  await ursprung.stoppe();

  // ── D · KI-Endpunkt ───────────────────────────────────────────────────────────────────────
  abschnitt("D · KI-Endpunkt: echtes TLS, api-key-Pflicht, usage-Block, Kostenriegel");
  const ki = await P.starteKiEndpunkt({ latenzMs: 1, latenzStreuungMs: 2, hoechstzahlAufrufe: 1 });
  check("D1 Der KI-Endpunkt spricht HTTPS auf der Schleifenadresse",
    ki.url.startsWith("https://127.0.0.1:"), ki.url);
  check("D2 Es entsteht eine ephemere lokale Zertifizierungsstelle",
    fs.existsSync(ki.caPfad) && /BEGIN CERTIFICATE/.test(fs.readFileSync(ki.caPfad, "utf8")));

  // ECHTER TLS-AUFRUF — bewusst IM SELBEN PROZESS.
  // BELEGTER FEHLER (26.08.): eine erste Fassung rief den Endpunkt aus einem Kindprozess mit
  // `spawnSync` auf. `spawnSync` blockiert die Ereignisschleife des Elternprozesses — und
  // genau dort laeuft der Server. Die Anfrage konnte deshalb NIE beantwortet werden, der
  // Kindprozess lief in seine Zeitgrenze und der Test haengte. Im Prozess ist der Handschlag
  // genauso echt: eigene Zertifizierungsstelle, echte Pruefung, keine Ausnahme.
  const ca = fs.readFileSync(ki.caPfad);
  const ruf = (kopfzeilen) => new Promise((resolve) => {
    const rumpf = JSON.stringify({
      model: "gpt-5-mini", input: "probe",
      text: { format: { type: "json_schema", name: "t", schema: { type: "object", required: ["text"],
        properties: { text: { type: "string" } } } } }
    });
    const anfrage = https.request(`${ki.url}/openai/v1/responses`, {
      method: "POST", ca,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(rumpf), ...kopfzeilen },
      timeout: 5000
    }, (antwort) => {
      let s2 = "";
      antwort.on("data", (d) => { s2 += d; });
      antwort.on("end", () => resolve({ status: antwort.statusCode, rumpf: s2 }));
    });
    anfrage.on("timeout", () => { anfrage.destroy(new Error("timeout")); });
    anfrage.on("error", (e) => resolve({ fehler: String(e.message) }));
    anfrage.write(rumpf); anfrage.end();
  });

  const ohneSchluessel = await ruf({});
  check("D3 Ohne `api-key` antwortet der Endpunkt mit 401 (fail closed)",
    ohneSchluessel.status === 401, JSON.stringify(ohneSchluessel.status || ohneSchluessel.fehler));

  const mitSchluessel = await ruf({ "api-key": "lokal" });
  let nutzung = null;
  try { nutzung = JSON.parse(mitSchluessel.rumpf); } catch (_) { nutzung = null; }
  check("D4 Der TLS-Handschlag gegen die lokale Stelle gelingt und liefert 200",
    mitSchluessel.status === 200, mitSchluessel.fehler || `Status ${mitSchluessel.status}`);
  check("D5 Die Antwort traegt einen `usage`-Block mit Ein- und Ausgabetoken",
    Boolean(nutzung && nutzung.usage) && Number(nutzung.usage.input_tokens) > 0
      && Number(nutzung.usage.output_tokens) > 0,
    nutzung && nutzung.usage ? JSON.stringify(nutzung.usage) : "kein usage");
  check("D6 Die Antwort folgt dem angeforderten Schema",
    Boolean(nutzung) && /"text"/.test(String(nutzung.output_text || "")));

  const dritter = await ruf({ "api-key": "lokal" });
  check("D7 KOSTENRIEGEL: ueber der Obergrenze wird abgewiesen statt beantwortet",
    dritter.status === 429, `Status ${dritter.status}`);
  const kiBericht = ki.bericht();
  check("D8 Der Riegel wird gezaehlt und ausgewiesen",
    kiBericht.abgewiesenWegenObergrenze >= 1, JSON.stringify({
      aufrufe: kiBericht.aufrufe, abgewiesen: kiBericht.abgewiesenWegenObergrenze
    }));
  check("D9 Token werden als GESCHAETZT gefuehrt, mit sichtbarem Teiler",
    kiBericht.zeichenJeToken === P.ZEICHEN_JE_TOKEN && kiBericht.eingabeTokenGeschaetzt > 0,
    `Teiler ${kiBericht.zeichenJeToken}`);
  await ki.stoppe();
  check("D10 Die Zertifizierungsstelle wird beim Herunterfahren geloescht (kein Rest)",
    !fs.existsSync(ki.caPfad));

  // ── E · Datenbanktor ──────────────────────────────────────────────────────────────────────
  abschnitt("E · Datenbanktor: `/rest/v1`-Praefix, Messung, Fehlerbeispiele ohne Rumpf");
  const hinten = http.createServer((req, res) => {
    res.writeHead(req.url === "/rpc/kaputt" ? 500 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify({ gesehen: req.url }));
  });
  await new Promise((r) => hinten.listen(0, "127.0.0.1", r));
  const tor = await P.starteDatenbankTor({ postgrestPort: hinten.address().port });
  const t1 = await holeHttp(`${tor.url}/rest/v1/rpc/helmut_claim_jobs`, { method: "POST", rumpf: "{}" });
  check("E1 Das Tor schneidet `/rest/v1` ab — wie das Supabase-Tor",
    t1.status === 200 && /"\/rpc\/helmut_claim_jobs"/.test(t1.rumpf), t1.rumpf.slice(0, 80));
  await holeHttp(`${tor.url}/rest/v1/rpc/kaputt`, { method: "POST", rumpf: "{}" });
  const torBericht = tor.bericht();
  check("E2 Jede Anfrage wird nach RPC-Namen gezaehlt",
    torBericht.nachRpc["rpc:helmut_claim_jobs"] === 1 && torBericht.nachRpc["rpc:kaputt"] === 1,
    JSON.stringify(torBericht.nachRpc));
  check("E3 Fehler werden gezaehlt und mit Weg und Status belegt — ohne Antwortrumpf",
    torBericht.fehler === 1 && torBericht.fehlerbeispiele.length === 1
      && torBericht.fehlerbeispiele[0].status === 500
      && !("rumpf" in torBericht.fehlerbeispiele[0]),
    JSON.stringify(torBericht.fehlerbeispiele));
  check("E4 Laufzeiten werden als Verteilung erhoben, nicht nur als Mittelwert",
    torBericht.dauerMs.n === 2 && torBericht.dauerMs.p95 != null);
  await tor.stoppe();
  await new Promise((r) => hinten.close(r));

  // ── F · Riegel des Slotlaufs ──────────────────────────────────────────────────────────────
  abschnitt("F · Slotlauf: drei fail-closed-Riegel");
  const slot = path.join(ROOT, "scripts/fixtures/z3-slotlauf.js");
  const starte = (env, args) => {
    const r = spawnSync(process.execPath, [slot, ...args], { encoding: "utf8", env, timeout: 20000 });
    let z = null;
    try { z = JSON.parse(String(r.stdout || "").trim().split("\n").pop()); } catch (_) { z = null; }
    return { code: r.status, zeile: z };
  };
  const basis = { ...process.env };
  delete basis.SUPABASE_URL; delete basis.SUPABASE_SERVICE_ROLE_KEY; delete basis.VERCEL_TOKEN;
  delete basis.AZURE_OPENAI_KEY; delete basis.AZURE_OPENAI_ENDPOINT; delete basis.OPENAI_API_KEY;
  delete basis.NODE_EXTRA_CA_CERTS;
  // NODE_OPTIONS wird geleert, weil sonst der Preload des Netzschutzes ZUERST greift und mit
  // Exit 3 abbricht, bevor der Slotlauf seinen EIGENEN Riegel zeigen kann. Beide Riegel sind
  // erwuenscht — geprueft wird hier aber der des Slotlaufs, damit er nicht unbemerkt wegfaellt.
  delete basis.NODE_OPTIONS;
  const lokaleArgs = ["--datenbank=http://127.0.0.1:1", "--ki=https://127.0.0.1:2", "--ursprung=http://127.0.0.1:3"];

  const mitKennung = starte({ ...basis, SUPABASE_SERVICE_ROLE_KEY: "attrappe" }, lokaleArgs);
  check("F1 Eine sichtbare Production-Kennung bricht den Slotlauf ab (Exit 3)",
    mitKennung.code === 3 && /produktionskennung/.test(String(mitKennung.zeile && mitKennung.zeile.fehler)),
    String(mitKennung.zeile && mitKennung.zeile.fehler).slice(0, 90));

  const fremd = starte({ ...basis }, ["--datenbank=https://beispiel.invalid", "--ki=https://127.0.0.1:2", "--ursprung=http://127.0.0.1:3"]);
  check("F2 Eine nicht-lokale Adresse bricht den Slotlauf ab (Exit 3)",
    fremd.code === 3 && /nicht-lokal/.test(String(fremd.zeile && fremd.zeile.fehler)),
    String(fremd.zeile && fremd.zeile.fehler).slice(0, 90));

  const ohneCa = starte({ ...basis }, lokaleArgs);
  check("F3 Ohne Zertifizierungsstelle beim Prozessstart bricht der Slotlauf ab (Exit 3)",
    ohneCa.code === 3 && /ca-fehlt/.test(String(ohneCa.zeile && ohneCa.zeile.fehler)),
    String(ohneCa.zeile && ohneCa.zeile.fehler).slice(0, 90));

  // ── G · Ehrlichkeit der Einordnung ────────────────────────────────────────────────────────
  abschnitt("G · Ehrlichkeit: der Lauf darf nie ein vollstaendiges Z3 behaupten");
  const lauf = lies("scripts/skalierung-z3-realistiklauf.js");
  check("G1 Der Lauf nennt sein Ergebnis ausdruecklich Z3a bzw. Teilnachweis",
    /Z3a/.test(lauf) && /Teilnachweis/.test(lauf));
  check("G2 Der Lauf sagt, dass weder Google noch Azure antwortet",
    /kein Google, kein Azure/.test(lauf));
  check("G3 Der Lauf behauptet nirgends ein bestandenes vollstaendiges Z3",
    !/Z3 bestanden/i.test(lauf) && !/vollstaendiges Z3 erbracht/i.test(lauf));
  check("G4 Der Lauf benennt die Preisbasis als unbelegten Schaetzwert",
    /unbelegt-schaetzwert/.test(lauf) && /KEIN belegter Azure-Preis/.test(lauf));
  check("G5 Ohne lokale Datenbank meldet der Lauf den Nachweis als OFFEN, nicht als gruen",
    /DER REALISTIKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT/.test(lauf));
  const plattform = lies("scripts/fixtures/z3-plattform.js");
  check("G6 Die Plattform benennt, was sie NICHT beweist",
    /WAS DAMIT AUSDRUECKLICH NICHT BEWIESEN IST/.test(plattform));
  const slotQuelle = lies("scripts/fixtures/z3-slotlauf.js");
  check("G7 Der Slotlauf benennt die EINE Ersetzung (Ursprungs-Host) ausdruecklich",
    /DIE EINE BENANNTE ERSETZUNG/.test(slotQuelle) && /isGoogleNewsUrl/.test(slotQuelle));
  check("G8 Der Slotlauf schaltet den Laufzeitriegel nicht ab",
    !/HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG/.test(slotQuelle));

  // ── H · Die zwei Fixture-Fehler des BESTEHENDEN Z2-Werkzeugs ───────────────────────────────
  abschnitt("H · Regression: die zwei in diesem Sprint gefundenen Fixture-Fehler");
  const worker = lies("scripts/fixtures/lasttest-worker.js");
  check("H1 Der Lasttest-Worker liest die Mandatskennung als `tenantId` (camelCase)",
    /auftrag\.tenantId/.test(worker),
    "sonst greift die Fehlereinspritzung nur bei Auftraegen mit payload.mandatsId");
  const pipeline = lies("lib/helmut/scalable-pipeline.js");
  check("H2 Gegenprobe: der Motor uebergibt tatsaechlich `tenantId`",
    /tenantId: zeile\.tenant_id/.test(pipeline));

  const { warteschlangeUeberPsql } = require(path.join(ROOT, "scripts/fixtures/psql-sitzung.js"));
  const attrappe = { frage: async () => ({ fehler: null, zeilen: [["t", "fehlgeschlagen"]] }) };
  const ws = warteschlangeUeberPsql(attrappe);
  const abschluss = await ws.finish({ id: "x", owner: "y", ok: false, error: "probe" });
  check("H3 Die psql-Fixture liefert `neuerStatus` — den Namen, den der Motor liest",
    abschluss.neuerStatus === "fehlgeschlagen", JSON.stringify(abschluss));
  check("H4 Der Altname `status` bleibt erhalten (kein Aufrufer bricht)",
    abschluss.status === "fehlgeschlagen");
  check("H5 Gegenprobe: der Motor entscheidet an `neuerStatus`",
    /abschluss\.neuerStatus === "fehlgeschlagen"/.test(pipeline));

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", (error && error.stack) || error);
  process.exit(1);
});
