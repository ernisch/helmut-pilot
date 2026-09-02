"use strict";

// Offline-Vertragstest: DER AZURE-ENDPUNKT WIRD GEPRUEFT, BEVOR EIN BUDGETSLOT
// VERBRAUCHT ODER EIN BYTE GESENDET WIRD — und keine Diagnoseausgabe traegt je
// den Endpunkt, den Schluessel oder einen Hostnamen.
//
// Der Beweis laeuft ueber drei unabhaengige Zaehler:
//   * ein zaehlender `https.request`-Ersatz  -> beweist "kein Netzaufruf",
//   * ein zaehlender Reservierungs-Ersatz    -> beweist "kein Budget verbraucht",
//   * ein sammelnder Telemetrie-Ersatz       -> beweist "sichtbar, nie als Erfolg".
// Es wird kein echtes Netz beruehrt, kein Schluessel gelesen und kein Modell
// aufgerufen. Attrappenwerte tragen ihre Unechtheit im Namen (CLAUDE.md §4.7).

const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const G = require(path.join(ROOT, "lib/helmut/azure-endpunkt"));
const redact = require(path.join(ROOT, "lib/helmut/redact"));

const TEST_KEY = "NUR_LOKALE_AZURE_KEY_ATTRAPPE_123456";
const GUELTIG = "https://nur-lokale-attrappe.openai.azure.com";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

// ── A · Gueltige Endpunkte ───────────────────────────────────────────────────
// Die drei vorgesehenen Azure-Hostfamilien, jeweils in den Schreibweisen, die in
// einer echten Konfiguration vorkommen.
const GUELTIGE = [
  ["A1 klassischer Azure-OpenAI-Host", "https://ressource.openai.azure.com"],
  ["A2 AI-Foundry-Host (services.ai.azure.com)", "https://ressource.services.ai.azure.com"],
  ["A3 Cognitive-Services-Host", "https://ressource.cognitiveservices.azure.com"],
  ["A4 abschliessender Schraegstrich", "https://ressource.openai.azure.com/"],
  ["A5 mehrstufige Unterdomain", "https://a.b.openai.azure.com"],
  ["A6 Grossschreibung wird normalisiert", "https://Ressource.OpenAI.Azure.COM"],
  ["A7 expliziter Port 443", "https://ressource.openai.azure.com:443"],
  ["A8 Leerraum aussen wird getrimmt", "  https://ressource.openai.azure.com  "],
  ["A9 Bindestriche im Ressourcennamen", "https://helmut-prod-01.openai.azure.com"]
];
for (const [name, wert] of GUELTIGE) {
  const r = G.pruefeEndpunkt(wert);
  check(name, r.gueltig === true, r.grund || "");
}
check("A10 Basis ist normalisiert und ohne Schraegstrich",
  G.pruefeEndpunkt("https://Ressource.OpenAI.Azure.COM/").basis === "https://ressource.openai.azure.com");

// ── B · Ungueltige Endpunkte (Erlaubnisliste, nicht Sperrliste) ──────────────
const NUL = String.fromCharCode(0);
const NL = String.fromCharCode(10);
const UNGUELTIGE = [
  ["B1 fremder Host", "https://boese.example.com", G.GRUENDE.HOST_NICHT_ERLAUBT],
  ["B2 Suffix-Anhaengsel", "https://ressource.openai.azure.com.angreifer.de", G.GRUENDE.HOST_NICHT_ERLAUBT],
  ["B3 Host ohne Unterlabel", "https://openai.azure.com", G.GRUENDE.HOST_NICHT_ERLAUBT],
  ["B4 leeres Unterlabel", "https://.openai.azure.com", G.GRUENDE.HOST_NICHT_ERLAUBT],
  ["B5 kein HTTPS", "http://ressource.openai.azure.com", G.GRUENDE.KEIN_HTTPS],
  ["B6 fremdes Schema", "ftp://ressource.openai.azure.com", G.GRUENDE.KEIN_HTTPS],
  ["B7 eingebettete Zugangsdaten", "https://nutzer:geheim@ressource.openai.azure.com", G.GRUENDE.ZUGANGSDATEN],
  ["B8 abweichender Port", "https://ressource.openai.azure.com:8443", G.GRUENDE.PORT_NICHT_ERLAUBT],
  ["B9 mitgegebener Pfad", "https://ressource.openai.azure.com/openai/v1/responses", G.GRUENDE.PFAD_NICHT_ERLAUBT],
  ["B10 Query", "https://ressource.openai.azure.com?a=1", G.GRUENDE.ABFRAGE_NICHT_ERLAUBT],
  ["B11 Fragment", "https://ressource.openai.azure.com#x", G.GRUENDE.ABFRAGE_NICHT_ERLAUBT],
  ["B12 IP-Literal", "https://127.0.0.1", G.GRUENDE.HOST_NICHT_ERLAUBT],
  ["B13 schemalos", "ressource.openai.azure.com", G.GRUENDE.UNPARSBAR],
  ["B14 leerer Wert", "", G.GRUENDE.FEHLT],
  ["B15 nur Leerraum", "   ", G.GRUENDE.FEHLT],
  ["B16 null", null, G.GRUENDE.FEHLT],
  ["B17 undefined", undefined, G.GRUENDE.FEHLT],
  ["B18 kein Text", { host: "x" }, G.GRUENDE.KEIN_TEXT],
  ["B19 Nullbyte im Wert", `https://ressource.openai.azure.com${NUL}.evil.tld`, G.GRUENDE.STEUERZEICHEN],
  ["B20 Zeilenumbruch im Wert", `https://ressource.openai${NL}.azure.com`, G.GRUENDE.STEUERZEICHEN],
  ["B21 uebermaessig lang", `https://${"a".repeat(400)}.openai.azure.com`, G.GRUENDE.ZU_LANG]
];
for (const [name, wert, grund] of UNGUELTIGE) {
  const r = G.pruefeEndpunkt(wert);
  check(name, r.gueltig === false && r.grund === grund, `gueltig=${r.gueltig} grund=${r.grund}`);
}
check("B22 Ein ungueltiger Endpunkt liefert NIE eine Basis",
  UNGUELTIGE.every(([, wert]) => G.pruefeEndpunkt(wert).basis === null));

// ── B23–B30 · Schleifenadresse: nur auf ausdrueckliche Anforderung ──────────
const LOOPBACK = "https://127.0.0.1:41234";
check("B23 Schleifenadresse ist OHNE Anforderung gesperrt",
  G.pruefeEndpunkt(LOOPBACK).gueltig === false);
check("B24 Schleifenadresse ist MIT Anforderung erlaubt",
  G.pruefeEndpunkt(LOOPBACK, { erlaubeLoopback: true }).gueltig === true);
check("B25 localhost ist mit Anforderung erlaubt",
  G.pruefeEndpunkt("https://localhost:8443", { erlaubeLoopback: true }).gueltig === true);
check("B26 Die Anforderung oeffnet KEINEN fremden Host mit freiem Port",
  G.pruefeEndpunkt("https://boese.example.com:8443", { erlaubeLoopback: true }).gueltig === false);
check("B27 Die Anforderung oeffnet keinen fremden Host auf 443",
  G.pruefeEndpunkt("https://boese.example.com", { erlaubeLoopback: true }).gueltig === false);
check("B28 Die Anforderung hebt den HTTPS-Zwang NICHT auf",
  G.pruefeEndpunkt("http://127.0.0.1:8443", { erlaubeLoopback: true }).gueltig === false);
check("B29 Die Anforderung hebt das Pfadverbot NICHT auf",
  G.pruefeEndpunkt("https://127.0.0.1:8443/pfad", { erlaubeLoopback: true }).gueltig === false);
check("B30 Die Anforderung hebt das Zugangsdatenverbot NICHT auf",
  G.pruefeEndpunkt("https://a:b@127.0.0.1:8443", { erlaubeLoopback: true }).gueltig === false);

// ── C · Der Guard wirft nie, egal was hereinkommt ────────────────────────────
const BOESE = [Symbol("x"), 42, [], () => {}, true, NaN, { toString() { throw new Error("boom"); } }];
let warf = false;
for (const wert of BOESE) {
  try { G.pruefeEndpunkt(wert); } catch (_) { warf = true; }
}
check("C1 pruefeEndpunkt wirft bei keiner Eingabe", warf === false);
check("C2 Auch bei boesartigen Eingaben ist die Antwort vollstaendig",
  BOESE.every((w) => {
    const r = G.pruefeEndpunkt(w);
    return typeof r.gueltig === "boolean" && typeof r.fingerabdruck === "string";
  }));

// ── D · Geheimnisredaktion: der Wert taucht NIRGENDS auf ─────────────────────
const GEHEIM_HOST = "streng-geheime-ressource";
const GEHEIM = `https://${GEHEIM_HOST}.openai.azure.com/pfad?token=NICHT_ECHT_TOKEN_987`;
const ergebnisText = JSON.stringify(G.pruefeEndpunkt(GEHEIM));
check("D1 Das Pruefergebnis enthaelt den Hostnamen nicht", !ergebnisText.includes(GEHEIM_HOST), ergebnisText);
check("D2 Das Pruefergebnis enthaelt den Query-Wert nicht", !ergebnisText.includes("NICHT_ECHT_TOKEN_987"));
check("D3 Der Fingerabdruck ist praefixiert und kurz",
  /^ep:[0-9a-f]{12}$/.test(G.pruefeEndpunkt(GEHEIM).fingerabdruck));
check("D4 Gleicher Wert -> gleicher Fingerabdruck",
  G.fingerabdruck(GUELTIG) === G.fingerabdruck(GUELTIG));
check("D5 Anderer Wert -> anderer Fingerabdruck",
  G.fingerabdruck(GUELTIG) !== G.fingerabdruck(`${GUELTIG}x`));
check("D6 Der Fingerabdruck ist nicht umkehrbar (enthaelt den Wert nicht)",
  !G.fingerabdruck(GEHEIM).includes(GEHEIM_HOST));
check("D7 fingerabdruck wirft nie", (() => {
  try { G.fingerabdruck(undefined); G.fingerabdruck(null); G.fingerabdruck(123); return true; }
  catch (_) { return false; }
})());

// redact.js muss den Endpunkt und blosse Azure-Hostnamen entfernen.
check("D8 redactSensitive entfernt den Azure-Hostnamen aus einer Netzfehlermeldung",
  !redact.redactSensitive(`getaddrinfo ENOTFOUND ${GEHEIM_HOST}.openai.azure.com`).includes(GEHEIM_HOST));
check("D9 redactSensitive entfernt den Foundry-Hostnamen",
  !redact.redactSensitive(`Failed to parse URL from https://${GEHEIM_HOST}.services.ai.azure.com/x`).includes(GEHEIM_HOST));
check("D10 redactSensitive entfernt den Cognitive-Services-Hostnamen",
  !redact.redactSensitive(`Host ${GEHEIM_HOST}.cognitiveservices.azure.com down`).includes(GEHEIM_HOST));
check("D11 redactSensitive laesst harmlosen Text unveraendert",
  redact.redactSensitive("connect ECONNREFUSED 10.0.0.1:443") === "connect ECONNREFUSED 10.0.0.1:443");
check("D12 redactSensitive entfernt den konfigurierten Endpunktwert",
  !redact.redactSensitive(`Fehler bei ${GEHEIM}`, { AZURE_OPENAI_ENDPOINT: GEHEIM }).includes(GEHEIM_HOST));

// ── E · URL-Bau ──────────────────────────────────────────────────────────────
check("E1 baueResponsesUrl liefert die vollstaendige Zieladresse",
  G.baueResponsesUrl(GUELTIG) === `${GUELTIG}/openai/v1/responses`);
check("E2 baueResponsesUrl normalisiert den abschliessenden Schraegstrich",
  G.baueResponsesUrl(`${GUELTIG}/`) === `${GUELTIG}/openai/v1/responses`);
check("E3 baueResponsesUrl liefert null bei fremdem Host",
  G.baueResponsesUrl("https://boese.example.com") === null);
check("E4 baueResponsesUrl liefert null bei fehlendem Wert",
  G.baueResponsesUrl("") === null && G.baueResponsesUrl(null) === null);

// ── F · Der Produktionspfad: Riegel VOR Reservierung und VOR Netz ────────────
// Der echte `ai.js`-Pfad wird mit zaehlenden Ersaetzen gefahren. `https.request`
// wird global ersetzt; nur Aufrufe gegen KI-Ziele werden gezaehlt und abgebrochen.
const echtesRequest = https.request.bind(https);
let netzaufrufe = 0;
https.request = function zaehlendesRequest(url, options, callback) {
  const ziel = String(url || "");
  if (ziel.includes("azure.com") || ziel.includes("api.openai.com")) {
    netzaufrufe += 1;
    throw new Error("Netzaufruf im Test — darf nicht vorkommen");
  }
  return echtesRequest(url, options, callback);
};

// Reservierungs- und Telemetriezaehler ueber einen storage-Ersatz im require-Cache.
const storagePfad = require.resolve(path.join(ROOT, "lib/helmut/storage"));
const echterStorage = require(storagePfad);
let reservierungen = 0;
const telemetrie = [];
require.cache[storagePfad].exports = {
  ...echterStorage,
  reserveLlmCall: async () => { reservierungen += 1; return { allowed: true }; },
  recordLlmUsage: async (eintrag) => { telemetrie.push(eintrag); return eintrag; }
};

const envSicherung = {
  key: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  openai: process.env.OPENAI_API_KEY
};
function setzeEnv({ key, endpoint, openai }) {
  for (const [name, wert] of [["AZURE_OPENAI_KEY", key], ["AZURE_OPENAI_ENDPOINT", endpoint], ["OPENAI_API_KEY", openai]]) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
}

const ai = require(path.join(ROOT, "lib/helmut/ai"));

async function laufe(env) {
  setzeEnv(env);
  reservierungen = 0;
  netzaufrufe = 0;
  telemetrie.length = 0;
  let fehler = null;
  try {
    await ai.requestText("nur ein Testprompt", { callType: "testlauf" });
  } catch (e) {
    fehler = e;
  }
  return fehler;
}

(async () => {
  // F1–F4: ungueltiger Endpunkt bei gesetztem Schluessel.
  let fehler = await laufe({ key: TEST_KEY, endpoint: "https://boese.example.com", openai: undefined });
  check("F1 Ungueltiger Endpunkt: KEIN Netzaufruf", netzaufrufe === 0, `netzaufrufe=${netzaufrufe}`);
  check("F2 Ungueltiger Endpunkt: KEINE Budgetreservierung", reservierungen === 0, `reservierungen=${reservierungen}`);
  check("F3 Ungueltiger Endpunkt: Fehler ist als 'nicht gesendet' markiert",
    Boolean(fehler && fehler.kiNichtGesendet === true && fehler.code === "AZURE_ENDPOINT_INVALID"),
    String(fehler && fehler.code));
  check("F4 Ungueltiger Endpunkt: Fehlertext nennt den Wert nicht",
    Boolean(fehler) && !String(fehler.message).includes("boese.example.com"), String(fehler && fehler.message));

  // F5: die Telemetrie zeigt den Nicht-Aufruf — und nie als Erfolg.
  check("F5 Ungueltiger Endpunkt: als Nicht-Aufruf protokolliert, nicht als Erfolg",
    telemetrie.length === 1 && telemetrie[0].keinAufruf === true
      && telemetrie[0].success === false && String(telemetrie[0].callType).startsWith("skipped-"),
    JSON.stringify(telemetrie[0] || null));
  check("F6 Der Telemetrieeintrag traegt den Endpunktwert nicht",
    !JSON.stringify(telemetrie).includes("boese.example.com"));

  // F7–F9: KEIN stiller, kostenpflichtiger Anbieterwechsel.
  fehler = await laufe({ key: TEST_KEY, endpoint: "https://boese.example.com", openai: "sk-NUR-ATTRAPPE-0000" });
  check("F7 Ungueltiger Azure-Endpunkt weicht NICHT auf den bezahlten OpenAI-Weg aus",
    netzaufrufe === 0 && Boolean(fehler && fehler.code === "AZURE_ENDPOINT_INVALID"),
    `netzaufrufe=${netzaufrufe} code=${fehler && fehler.code}`);
  check("F8 Auch dann wird kein Budget verbraucht", reservierungen === 0);

  setzeEnv({ key: TEST_KEY, endpoint: "https://boese.example.com", openai: "sk-NUR-ATTRAPPE-0000" });
  check("F9 isAiEnabled meldet AUS -> die Fachpfade nehmen den kostenfreien Regelweg",
    ai.isAiEnabled() === false);

  // F10–F12: halb gesetzte Azure-Konfiguration ist ebenfalls ein Riegel.
  fehler = await laufe({ key: TEST_KEY, endpoint: undefined, openai: "sk-NUR-ATTRAPPE-0000" });
  check("F10 Schluessel ohne Endpunkt: kein Netz, kein Budget",
    netzaufrufe === 0 && reservierungen === 0);
  check("F11 Schluessel ohne Endpunkt: eindeutiger Grund",
    Boolean(fehler && fehler.grund === "azure-endpunkt-fehlt"), String(fehler && fehler.grund));

  fehler = await laufe({ key: undefined, endpoint: GUELTIG, openai: "sk-NUR-ATTRAPPE-0000" });
  check("F12 Endpunkt ohne Schluessel: kein stiller Wechsel auf OpenAI",
    netzaufrufe === 0 && reservierungen === 0 && Boolean(fehler && fehler.grund === "azure-schluessel-fehlt"),
    String(fehler && fehler.grund));

  // F13: reiner OpenAI-Betrieb bleibt UNVERAENDERT erlaubt (keine Regression).
  setzeEnv({ key: undefined, endpoint: undefined, openai: "sk-NUR-ATTRAPPE-0000" });
  check("F13 Ohne jede Azure-Variable bleibt der OpenAI-Betrieb unangetastet",
    ai.isAiEnabled() === true);

  // F14: vollstaendig gueltige Azure-Konfiguration wird durchgelassen.
  setzeEnv({ key: TEST_KEY, endpoint: GUELTIG, openai: undefined });
  check("F14 Gueltige Azure-Konfiguration gilt als aktiv", ai.isAiEnabled() === true);

  // F15: erst bei gueltiger Konfiguration wird ueberhaupt reserviert.
  fehler = await laufe({ key: TEST_KEY, endpoint: GUELTIG, openai: undefined });
  check("F15 Gueltige Konfiguration: Reservierung findet statt, Netzaufruf wird versucht",
    reservierungen === 1 && netzaufrufe === 1,
    `reservierungen=${reservierungen} netzaufrufe=${netzaufrufe}`);

  // ── G · Quelltextvertrag: die Reihenfolge im Code ist die Sicherheitsaussage ─
  const fs = require("fs");
  const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/ai.js"), "utf8");
  const block = quelle.slice(quelle.indexOf("function requestOpenAI("));
  const guardIndex = block.indexOf("azureFehlkonfiguration(process.env)");
  const reserveIndex = block.indexOf("reserveLlmBudgetOrThrow(meta)");
  const requestIndex = block.indexOf("https.request(");
  check("G1 Der Riegel steht VOR der Budgetreservierung",
    guardIndex > 0 && reserveIndex > guardIndex, `guard@${guardIndex} reserve@${reserveIndex}`);
  check("G2 Der Riegel steht VOR dem Netzaufruf",
    guardIndex > 0 && requestIndex > guardIndex, `guard@${guardIndex} request@${requestIndex}`);
  check("G3 Die Ziel-URL wird NICHT mehr aus dem Rohwert zusammengesetzt",
    !quelle.includes("${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses"));
  check("G4 Die Ziel-URL kommt aus dem geprueften Baustein",
    quelle.includes("azureEndpunkt.baueResponsesUrl(process.env.AZURE_OPENAI_ENDPOINT,"));

  // ── H · Auch die uebrigen Netzaufrufstellen pruefen den Endpunkt ──────────
  // Der Guard in ai.js allein genuegt nicht: es gab drei weitere Stellen, an
  // denen der echte `api-key` an eine roh zusammengesetzte Adresse ging.
  const serverQuelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const probeBlock = serverQuelle.slice(serverQuelle.indexOf('url.pathname === "/api/debug/pipeline-probe"'));
  const probeGuard = probeBlock.indexOf("azureEndpunktGuard.pruefeEndpunkt(azEndpoint)");
  const probeFetch = probeBlock.indexOf("await fetch(apiUrl");
  check("H1 /api/debug/pipeline-probe prueft den Endpunkt VOR dem Netzaufruf",
    probeGuard > 0 && probeFetch > probeGuard, `guard@${probeGuard} fetch@${probeFetch}`);
  check("H2 /api/debug/pipeline-probe baut die URL aus der geprueften Basis",
    probeBlock.includes("`${azZiel.basis}/openai/v1/responses`"));

  const pingBlock = serverQuelle.slice(serverQuelle.indexOf('url.pathname === "/api/debug/azure-ping"'));
  const pingGuard = pingBlock.indexOf("azureEndpunktGuard.pruefeEndpunkt(baseUrl)");
  const pingFetch = pingBlock.indexOf("await fetch(`${baseUrl}/openai/deployments");
  check("H3 /api/debug/azure-ping prueft den Env-Endpunkt VOR dem Netzaufruf",
    pingGuard > 0 && pingFetch > pingGuard, `guard@${pingGuard} fetch@${pingFetch}`);
  check("H4 /api/debug/azure-ping prueft auch den testEndpoint-Parameter zentral",
    pingBlock.includes("azureEndpunktGuard.pruefeEndpunkt(testEndpointParam)"));
  check("H5 /api/debug/azure-ping gibt kein Schluesselfragment mehr aus",
    !serverQuelle.includes("`...${keyRaw.slice(-4)}`"));

  const backfill = require(path.join(ROOT, "lib/helmut/embedding-backfill.js"));
  if (typeof backfill.azureEmbeddingProvider === "function") {
    const fremd = backfill.azureEmbeddingProvider({
      AZURE_OPENAI_ENDPOINT: "https://ressource.openai.azure.com.angreifer.de",
      AZURE_OPENAI_KEY: TEST_KEY, HELMUT_EMBEDDING_DEPLOYMENT: "emb"
    });
    const gut = backfill.azureEmbeddingProvider({
      AZURE_OPENAI_ENDPOINT: GUELTIG, AZURE_OPENAI_KEY: TEST_KEY, HELMUT_EMBEDDING_DEPLOYMENT: "emb"
    });
    check("H6 embedding-backfill liefert bei fremdem Host KEINEN Provider", fremd === null);
    check("H7 embedding-backfill liefert bei gueltigem Host einen Provider",
      Boolean(gut && gut.name === "azure-openai"));
  } else {
    check("H6/H7 azureEmbeddingProvider ist pruefbar exportiert", false, "nicht exportiert");
  }

  // ── I · Die eigenen Pruefwerkzeuge bleiben lauffaehig ─────────────────────
  for (const [name, datei] of [
    ["I1 understanding-live-smoke fordert die Schleifenadresse an", "scripts/understanding-live-smoke.js"],
    ["I2 z3-slotlauf fordert die Schleifenadresse an", "scripts/fixtures/z3-slotlauf.js"]
  ]) {
    const q = fs.readFileSync(path.join(ROOT, datei), "utf8");
    check(name, q.includes('HELMUT_KI_LOOPBACK_ERLAUBT = "1"'));
  }
  setzeEnv({ key: TEST_KEY, endpoint: LOOPBACK, openai: undefined });
  process.env.HELMUT_KI_LOOPBACK_ERLAUBT = "1";
  check("I3 Mit Anforderung gilt der lokale KI-Ersatz als aktiv", ai.isAiEnabled() === true);
  delete process.env.HELMUT_KI_LOOPBACK_ERLAUBT;
  check("I4 Ohne Anforderung bleibt er gesperrt", ai.isAiEnabled() === false);

  // ── J · Ehrliche Begruendung statt Pauschalaussage ────────────────────────
  const aiQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/ai.js"), "utf8");
  check("J1 Die Pauschalaussage 'kein OPENAI_API_KEY gesetzt' ist ersetzt",
    !aiQuelle.includes("weil kein OPENAI_API_KEY gesetzt ist"));
  check("J2 Eine unbrauchbare Azure-Konfiguration wird als solche benannt",
    aiQuelle.includes("die Azure-Konfiguration unbrauchbar ist"));
  check("J3 Kein rohes Fehlerobjekt mehr in der Konsole",
    !aiQuelle.includes('console.error("Parliament assessment failed", error)'));

  // Aufraeumen: Umgebung und https.request zuruecksetzen.
  https.request = echtesRequest;
  require.cache[storagePfad].exports = echterStorage;
  setzeEnv({ key: envSicherung.key, endpoint: envSicherung.endpoint, openai: envSicherung.openai });

  console.log(`\n${pass} PASS, ${fail} FAIL  (Netzaufrufe gegen KI-Ziele: ${netzaufrufe === 1 ? "1 — nur im erlaubten Fall F15" : netzaufrufe})`);
  process.exit(fail ? 1 : 0);
})();
