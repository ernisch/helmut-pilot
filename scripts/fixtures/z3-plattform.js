"use strict";

// Helmut — LOKALE PRODUKTIONSNAHE PLATTFORM FUER DEN REALISTIKNACHWEIS Z3 (2026-08-26).
// =============================================================================================
// WOZU. Der synthetische Nachweis Z2 (`scripts/skalierung-stufen-lasttest.js`) misst die
// Warteschlange gegen eine lokale PostgreSQL — mit ATTRAPPENHANDLERN, ueber `psql`, ohne
// Netzpfad und ohne KI. Genau das laesst drei Fragen offen, die die Skalierungsdoku
// (`docs/betrieb/skalierung-25-50-100.md` §0.1) selbst als Luecke fuehrt:
//
//   * der ANWENDUNGSPFAD zur Datenbank ist ungeprueft (Production spricht HTTP/PostgREST,
//     nicht `psql`),
//   * die FACHHANDLER sind ungeprueft (Abruf, Parsen, Verstehen, Projektion, Briefing),
//   * die KI-MENGE ist ungemessen (der Tagesdeckel fuer 25 Mandate ist deshalb offen).
//
// Diese Datei stellt die drei Gegenstuecke lokal bereit — jedes als ECHTER Dienst mit
// echtem Netzverkehr ueber die Schleifenadresse, nie als Funktionsattrappe:
//
//   1. DATENBANKTOR  — `/rest/v1/**` -> PostgREST -> PostgreSQL. Dieselbe Route, die
//      Supabase ueber sein API-Tor faehrt; die Anwendung merkt keinen Unterschied, weil sie
//      ausschliesslich `SUPABASE_URL` + Dienstschluessel kennt.
//   2. ANBIETERURSPRUNG — ein echter HTTP-Server, der RSS ausliefert, mit einstellbarer
//      Latenz, echten 429/503-Antworten samt `Retry-After` und echten Zeitueberschreitungen.
//   3. KI-ENDPUNKT — ein echter HTTPS-Server (echtes TLS, eigene lokale Zertifizierungs-
//      stelle) im Zuschnitt der Azure-OpenAI-Responses-API, inklusive `usage`-Block.
//
// >>> WAS DAMIT AUSDRUECKLICH NICHT BEWIESEN IST <<<
//   Die ANTWORTEN kommen aus dieser Sitzung, nicht von Google, nicht von Azure. Bewiesen
//   werden Fachpfad, Datenbankweg, Laufzeiten, Wiederholungen, Zeitueberschreitungen,
//   Drosselungsverhalten und Mengen — NICHT die Erreichbarkeit, Antwortzeit, Drosselgrenze
//   oder Rechnung eines echten Anbieters. Die Einordnung dieses Unterschieds steht in
//   `docs/betrieb/z3-realistiknachweis-2026-08-26.md` und ist verbindlich.
//
// SICHERHEIT. Jeder Dienst bindet ausschliesslich an 127.0.0.1. Die Datei erzeugt keine
// Zugangsdaten fuer irgendeinen echten Dienst, liest keine und gibt keine aus. Sie wird von
// `lib/` und `server.js` nie geladen.

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// ── Kleine Messhilfe ────────────────────────────────────────────────────────────────────────
// Sammelt Laufzeiten und liefert Verteilungswerte. Ein Mittelwert allein verschweigt genau die
// Spitzen, auf die es bei einer Kapazitaetsaussage ankommt.
function messreihe() {
  const werte = [];
  return {
    erfasse(ms) { werte.push(Number(ms) || 0); },
    anzahl: () => werte.length,
    summe: () => werte.reduce((s, v) => s + v, 0),
    auswertung() {
      if (!werte.length) return { n: 0, min: null, p50: null, p95: null, max: null, mittel: null };
      const s = [...werte].sort((a, b) => a - b);
      const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
      return {
        n: s.length, min: s[0], p50: q(0.5), p95: q(0.95), max: s[s.length - 1],
        mittel: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10
      };
    }
  };
}

// ═══ 1 · DATENBANKTOR ═══════════════════════════════════════════════════════════════════════
//
// Supabase liefert seine Datenschnittstelle unter `/rest/v1/**` aus und leitet sie an
// PostgREST weiter. PostgREST selbst kennt kein Praefix. Dieses Tor tut genau das, was das
// Supabase-Tor tut — Praefix abschneiden, Kopfzeilen durchreichen — und misst dabei jede
// einzelne Anfrage. Es faelscht NICHTS: Statuscode, Rumpf und Fehler stammen unveraendert
// von PostgREST.
function starteDatenbankTor({ postgrestPort, host = "127.0.0.1" } = {}) {
  if (!postgrestPort) throw new Error("z3-plattform: postgrestPort fehlt");
  const messung = {
    anfragen: 0, fehler: 0, nachStatus: {}, nachRpc: {},
    // Fehlerbeispiele: Weg und Statuscode, NIE der Antwortrumpf. PostgREST-Fehlertexte
    // koennen Zeileninhalte tragen (storage.js kappt sie aus genau diesem Grund).
    fehlerbeispiele: [],
    dauer: messreihe(), gleichzeitigSpitze: 0
  };
  let gleichzeitig = 0;

  const server = http.createServer((req, res) => {
    const t0 = Date.now();
    gleichzeitig += 1;
    if (gleichzeitig > messung.gleichzeitigSpitze) messung.gleichzeitigSpitze = gleichzeitig;
    messung.anfragen += 1;

    const pfad = String(req.url || "");
    const ohnePraefix = pfad.startsWith("/rest/v1") ? pfad.slice("/rest/v1".length) || "/" : pfad;
    const rpc = ohnePraefix.startsWith("/rpc/") ? ohnePraefix.slice(5).split("?")[0] : null;
    const schluessel = rpc ? `rpc:${rpc}` : `${req.method} ${ohnePraefix.split("?")[0]}`;
    messung.nachRpc[schluessel] = (messung.nachRpc[schluessel] || 0) + 1;

    const weiter = http.request(
      { host, port: postgrestPort, path: ohnePraefix, method: req.method, headers: req.headers },
      (antwort) => {
        const code = antwort.statusCode || 0;
        messung.nachStatus[code] = (messung.nachStatus[code] || 0) + 1;
        if (code >= 400) {
          messung.fehler += 1;
          if (messung.fehlerbeispiele.length < 12) {
            messung.fehlerbeispiele.push({ weg: schluessel, status: code });
          }
        }
        res.writeHead(code, antwort.headers);
        antwort.pipe(res);
        antwort.on("end", () => { gleichzeitig -= 1; messung.dauer.erfasse(Date.now() - t0); });
      }
    );
    weiter.on("error", (fehler) => {
      gleichzeitig -= 1;
      messung.fehler += 1;
      messung.dauer.erfasse(Date.now() - t0);
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `datenbanktor: ${String(fehler && fehler.message).slice(0, 120)}` }));
    });
    req.pipe(weiter);
  });

  return new Promise((resolve) => {
    server.listen(0, host, () => {
      const port = server.address().port;
      resolve({
        art: "datenbanktor",
        url: `http://${host}:${port}`,
        port,
        messung,
        bericht: () => ({
          anfragen: messung.anfragen, fehler: messung.fehler,
          nachStatus: { ...messung.nachStatus }, nachRpc: { ...messung.nachRpc },
          fehlerbeispiele: messung.fehlerbeispiele.slice(),
          dauerMs: messung.dauer.auswertung(), gleichzeitigSpitze: messung.gleichzeitigSpitze
        }),
        stoppe: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

// ═══ 2 · ANBIETERURSPRUNG ═══════════════════════════════════════════════════════════════════
//
// Ein echter HTTP-Ursprung, der RSS ausliefert. Er ist bewusst KEIN Aufzeichnungswiedergeber:
// aufgezeichnete Antworten waeren echte fremde Inhalte und haetten in einem Lasttest weder
// Rechtsgrundlage noch Nutzen. Er erzeugt stattdessen STRUKTURECHTES, ausdruecklich als
// synthetisch gekennzeichnetes Material — deterministisch aus der angefragten Adresse, damit
// zwei Laeufe vergleichbar sind und derselbe Weg dieselbe Menge liefert.
//
// Was hier ECHT ist und deshalb gemessen werden kann: TCP-Verbindungsaufbau, HTTP-Kopf und
// -Rumpf, Antwortgroesse, Latenz, `429` mit `Retry-After`, `503`, und das Ausbleiben einer
// Antwort (Zeitueberschreitung des Abrufers).
//
// WORTSCHATZ DER SYNTHETISCHEN VORGAENGE. Er muss je Vorgang EIGEN sein, sonst legt die
// Vorgangsbildung (`lib/helmut/vorgang-identity.js`) alles zu EINEM Vorgang zusammen und der
// Lauf braeuchte nur einen einzigen Modellaufruf — eine kuenstlich guenstige Deduplizierung,
// die die KI-Menge um Groessenordnungen unterschaetzt. Empirisch geprueft (26.08.): mit
// gemeinsamen Fachwoertern ("Vorlage", "Ausschuss") entstehen aus 24 Dokumenten 1 Vorgang,
// mit vorgangseigenen Kunstwoertern 8 Vorgaenge zu je 3 Dokumenten.
const KUNSTWORT_A = ["Talrand", "Feldbogen", "Nordhang", "Wiesenrain", "Steinfurt", "Ahornweg",
  "Kupfertal", "Silbersee", "Birkenau", "Moorheide", "Rebgarten", "Sandkuppe", "Lichtenau",
  "Weidgrund", "Hochmoor", "Erlenbach"];
const KUNSTWORT_B = ["Quellblick", "Rautenfeld", "Moosgrund", "Hainbruch", "Erlengrund",
  "Zirbelhof", "Lattichau", "Weidforst", "Sturmbach", "Kranichau", "Nebelstein", "Farnwiese",
  "Auenkamp", "Roggental", "Distelort", "Schilfsee"];

function starteAnbieterUrsprung({
  host = "127.0.0.1",
  latenzMs = 40,               // Grundlatenz je Antwort
  latenzStreuungMs = 60,       // deterministische Streuung darueber
  drosselAnteil = 0,           // Anteil der Anfragen, die mit 429 + Retry-After antworten
  ausfallAnteil = 0,           // Anteil der Anfragen, die mit 503 antworten
  haengerAnteil = 0,           // Anteil der Anfragen, die gar nicht antworten (Zeitueberschreitung)
  eintraegeJeAntwort = 12,
  zeichenJeEintrag = 900,
  // ── Die drei Stellschrauben der Vorgangsmenge ──────────────────────────────────────────
  // Sie entscheiden, wie viele VORGAENGE aus den Rohdokumenten werden — und damit, wie viele
  // Modellaufrufe entstehen. Sie sind an der einzigen belegten Production-Messgroesse geeicht
  // (Kostenmessung: rund 113 Verstehensaufrufe/Tag bei fuenf Mandaten) und werden im Bericht
  // ausgewiesen, damit jede abgeleitete Zahl ihre Annahme mitfuehrt.
  geteilteThemen = 400,        // Groesse des gemeinsamen Themenvorrats (Ueberschneidung zwischen Quellen)
  ueberschneidungAnteil = 0.8, // Anteil der Eintraege aus dem gemeinsamen Vorrat
  dokumenteJeVorgang = 3,      // Zahl der Meldungsvarianten je Vorgang
  // NACHRICHTENZYKLUS. Ein echter Feed liefert beim zweiten Abruf desselben Tages ganz
  // ueberwiegend DIESELBEN Meldungen — sie sind dann bereits als Rohdokument vorhanden und
  // bereits verstanden, kosten also weder Speicherplatz noch einen Modellaufruf. Ohne diese
  // Nachbildung waere jeder Slot ein kompletter Neubestand und die KI-Menge um ein
  // Vielfaches zu hoch (im dritten Eichlauf gemessen: 233 Modellaufrufe in EINEM Slot bei
  // fuenf Mandaten, also rund 700 am Tag — gegen einen belegten Production-Boden von 113).
  frischeAnteil = 0.25         // Anteil wirklich NEUER Meldungen je Abruf
} = {}) {
  const messung = {
    anfragen: 0, ausgeliefert: 0, gedrosselt: 0, ausgefallen: 0, haenger: 0,
    bytes: 0, dauer: messreihe(), nachStatus: {}, gleichzeitigSpitze: 0
  };
  let gleichzeitig = 0;
  const offeneHaenger = new Set();

  // Deterministische Streuung: derselbe Weg bekommt immer dieselbe Behandlung. Ein Zufall je
  // Lauf haette zwei Stufen unvergleichbar gemacht.
  const streu = (schluessel, spanne) => {
    const h = crypto.createHash("sha256").update(String(schluessel)).digest();
    return spanne <= 0 ? 0 : h.readUInt32BE(0) % spanne;
  };
  const anteilTrifft = (schluessel, anteil) => {
    if (anteil <= 0) return false;
    const h = crypto.createHash("sha256").update("anteil|" + schluessel).digest();
    return (h.readUInt32BE(0) % 10000) < Math.round(anteil * 10000);
  };

  // Ein Eintrag ist VOLLSTAENDIG durch (Thema, Variante) bestimmt. Zwei Quellen, die dasselbe
  // Thema melden, liefern deshalb byte-gleiche Eintraege — genau so entsteht in Production die
  // Ueberschneidung, die `raw_documents` ueber den Inhaltsfingerabdruck zusammenfuehrt. Nichts
  // haengt an der Uhr; zwei Laeufe sind vergleichbar.
  const BASISZEIT = Date.parse("2026-08-26T04:00:00Z");
  function baueEintrag(thema, variante) {
    const t = crypto.createHash("sha256").update(String(thema)).digest();
    const a = KUNSTWORT_A[t.readUInt16BE(0) % KUNSTWORT_A.length] + (t.readUInt16BE(2) % 97);
    const b = KUNSTWORT_B[t.readUInt16BE(4) % KUNSTWORT_B.length] + (t.readUInt16BE(6) % 89);
    const kennung = crypto.createHash("sha256").update(`${thema}|${variante}`).digest("hex").slice(0, 24);
    const titel = `${a} ${b} — syn ${variante + 1}`;
    // FUELLTEXT AUS KURZWOERTERN. Die Ankerbildung wertet nur Woerter ab fuenf Zeichen
    // (`ANCHOR_MIN_LEN`); ein gemeinsamer Fuelltext mit langen Woertern legt deshalb ALLE
    // Dokumente zu einem einzigen Vorgang zusammen. Empirisch belegt im zweiten Eichlauf
    // (26.08.): mit erklaerendem Fliesstext entstanden aus 345 Dokumenten 2 Vorgaenge und
    // 3 Modellaufrufe. Der Fuelltext besteht deshalb ausschliesslich aus Woertern bis vier
    // Zeichen; die einzigen Anker sind die beiden vorgangseigenen Kunstwoerter.
    const fuell = "der die das und ist im am zu von auf hat war nun bei aus vor mit nur "
      + "es dem den dazu dort hier dann noch also je pro ab an so wie da man ";
    const satz = `${a} ${b}. ${fuell}${a} ${b}. `;
    const rumpf = satz.repeat(Math.max(1, Math.ceil(zeichenJeEintrag / satz.length))).slice(0, zeichenJeEintrag);
    const zeit = new Date(BASISZEIT + (t.readUInt16BE(8) % 6) * 600000).toUTCString();
    return "    <item>\n"
      + `      <title>${titel}</title>\n`
      + `      <link>http://${host}/synthetisch/${kennung}</link>\n`
      + `      <guid isPermaLink="false">${kennung}</guid>\n`
      + "      <category>synthetischer-lasttestinhalt</category>\n"
      + `      <pubDate>${zeit}</pubDate>\n`
      + `      <description><![CDATA[${rumpf}]]></description>\n`
      + "    </item>";
  }

  function baueRss(pfad, zaehler) {
    const eintraege = [];
    for (let i = 0; i < eintraegeJeAntwort; i += 1) {
      // NUR ein Teil der Eintraege ist frisch. Der Rest gehoert zum Grundbestand des Tages
      // (Zyklus 0) und ist beim zweiten Abruf bereits bekannt — genau wie ein echter Feed.
      const frisch = anteilTrifft(`frisch|${pfad}|${zaehler}|${i}`, frischeAnteil);
      const zyklus = frisch ? zaehler : 0;
      const geteilt = anteilTrifft(`geteilt|${pfad}|${zyklus}|${i}`, ueberschneidungAnteil);
      const thema = geteilt
        // GEMEINSAMER VORRAT: der Schluessel faellt in einen Vorrat FESTER Groesse. Zwei
        // Quellen treffen dasselbe Thema also durch Kollision — genau wie in Production, wo
        // sich Suchergebnisse verschiedener Mandate teilweise ueberschneiden. Der Vorrat
        // haengt bewusst am WEG mit: haenge er nur an (Zaehler, Eintragsnummer), lieferten
        // ALLE Quellen dieselben zwoelf Themen und die Ueberschneidung waere kuenstlich
        // total (im ersten Eichlauf gemessen: 564 Eintraege ergaben nur 105 Dokumente).
        ? `g${streu(`thema|${pfad}|${zyklus}|${i}`, Math.max(1, geteilteThemen))}`
        // QUELLENEIGENER VORRAT: nur dieser Weg meldet dieses Thema.
        : `l${crypto.createHash("sha256").update(`${pfad}|${zyklus}|${i}`).digest("hex").slice(0, 16)}`;
      const variante = streu(`variante|${pfad}|${zyklus}|${i}`, Math.max(1, dokumenteJeVorgang));
      eintraege.push(baueEintrag(thema, variante));
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\">\n  <channel>\n"
      + "    <title>Helmut Lasttest — synthetischer Quellenursprung</title>\n"
      + `    <link>http://${host}${pfad}</link>\n`
      + "    <description>Ausschliesslich synthetische Inhalte fuer den Belastungsnachweis.</description>\n"
      + eintraege.join("\n") + "\n  </channel>\n</rss>\n";
  }

  // SLOTNUMMER STATT EIGENEM ZAEHLER. Der Inhalt eines Abrufs haengt am „Nachrichtenzyklus";
  // bisher zaehlte der Ursprung dafuer selbst mit. Das ist genau dann falsch, wenn ein Lauf
  // in mehreren Aufrufen gefahren wird (fortgesetzter Lauf): der interne Zaehler begaenne
  // wieder bei 1, der Ursprung lieferte denselben Grundbestand, und die fortgesetzten Slots
  // saehen kuenstlich wenig neue Meldungen. Der Aufrufer setzt deshalb die GLOBALE Slotnummer;
  // ohne sie zaehlt der Ursprung wie bisher selbst.
  let aktuellerSlot = 0;
  const zaehlerJePfad = new Map();

  const server = http.createServer((req, res) => {
    const t0 = Date.now();
    gleichzeitig += 1;
    if (gleichzeitig > messung.gleichzeitigSpitze) messung.gleichzeitigSpitze = gleichzeitig;
    messung.anfragen += 1;
    const pfad = String(req.url || "/");
    const eigener = (zaehlerJePfad.get(pfad) || 0) + 1;
    zaehlerJePfad.set(pfad, eigener);
    const zaehler = aktuellerSlot > 0 ? aktuellerSlot : eigener;

    const beenden = (code, kopf, rumpf) => {
      messung.nachStatus[code] = (messung.nachStatus[code] || 0) + 1;
      res.writeHead(code, kopf);
      res.end(rumpf);
      gleichzeitig -= 1;
      messung.dauer.erfasse(Date.now() - t0);
      if (rumpf) messung.bytes += Buffer.byteLength(rumpf);
    };

    const schluessel = `${pfad}#${zaehler}`;
    const verzoegerung = latenzMs + streu(schluessel, Math.max(1, latenzStreuungMs));

    // FESTER FEHLERWEG. `/immer-haenger` antwortet NIE — daran haengt das Fehlermandat des
    // Lasttests. Der Abrufer laeuft in seine eigene Zeitgrenze (`CRAWLER_TIMEOUT_MS`), der
    // Auftrag wird wiederholt und endet nach `max_attempts` endgueltig. Das ist ein ECHTER
    // Fehler im echten Abrufpfad, kein ausgetauschter Handler.
    if (pfad.includes("/immer-haenger") || anteilTrifft(`haenger|${schluessel}`, haengerAnteil)) {
      // Keine Antwort: der Abrufer muss in seine eigene Zeitgrenze laufen. Der Griff wird
      // gemerkt und beim Herunterfahren freigegeben, damit kein Rest zurueckbleibt.
      messung.haenger += 1;
      offeneHaenger.add(res);
      req.on("close", () => { offeneHaenger.delete(res); gleichzeitig -= 1; });
      return;
    }
    if (anteilTrifft(`drossel|${schluessel}`, drosselAnteil)) {
      setTimeout(() => {
        messung.gedrosselt += 1;
        beenden(429, { "retry-after": "1", "content-type": "text/plain" }, "gedrosselt (synthetisch)");
      }, verzoegerung);
      return;
    }
    if (anteilTrifft(`ausfall|${schluessel}`, ausfallAnteil)) {
      setTimeout(() => {
        messung.ausgefallen += 1;
        beenden(503, { "content-type": "text/plain" }, "nicht verfuegbar (synthetisch)");
      }, verzoegerung);
      return;
    }
    setTimeout(() => {
      const rumpf = baueRss(pfad, zaehler);
      messung.ausgeliefert += 1;
      beenden(200, { "content-type": "application/rss+xml; charset=utf-8" }, rumpf);
    }, verzoegerung);
  });

  return new Promise((resolve) => {
    server.listen(0, host, () => {
      const port = server.address().port;
      resolve({
        art: "anbieterursprung",
        url: `http://${host}:${port}`,
        port,
        messung,
        setzeSlot: (nr) => { aktuellerSlot = Math.max(0, Number(nr) || 0); },
        bericht: () => ({
          anfragen: messung.anfragen, ausgeliefert: messung.ausgeliefert,
          gedrosselt: messung.gedrosselt, ausgefallen: messung.ausgefallen, haenger: messung.haenger,
          bytes: messung.bytes, nachStatus: { ...messung.nachStatus },
          dauerMs: messung.dauer.auswertung(), gleichzeitigSpitze: messung.gleichzeitigSpitze
        }),
        stoppe: () => new Promise((r) => {
          for (const offen of offeneHaenger) { try { offen.destroy(); } catch (_) { /* egal */ } }
          offeneHaenger.clear();
          server.close(() => r());
        })
      });
    });
  });
}

// ═══ 3 · KI-ENDPUNKT (echtes TLS) ═══════════════════════════════════════════════════════════
//
// `lib/helmut/ai.js` spricht bei Azure `https.request(`${AZURE_OPENAI_ENDPOINT}/openai/v1/
// responses`)`. Es gibt keinen Schalter, der daraus HTTP macht — und das ist richtig so.
// Deshalb braucht die lokale Gegenstelle echtes TLS. Die Zertifizierungsstelle entsteht in
// einem Sitzungsverzeichnis, wird dem Kindprozess ueber NODE_EXTRA_CA_CERTS bekannt gemacht
// und beim Herunterfahren geloescht. Damit laeuft der VOLLSTAENDIGE Anbieterpfad: TLS-
// Handschlag, Kopfzeile `api-key`, Rumpf, `usage`-Block, Zeitgrenze, Statusfehler.

function erzeugeZertifikat(verzeichnis, host = "127.0.0.1") {
  fs.mkdirSync(verzeichnis, { recursive: true });
  const ca = path.join(verzeichnis, "ca.pem");
  const caKey = path.join(verzeichnis, "ca.key");
  const srv = path.join(verzeichnis, "server.pem");
  const srvKey = path.join(verzeichnis, "server.key");
  const csr = path.join(verzeichnis, "server.csr");
  const ext = path.join(verzeichnis, "server.ext");
  const still = { stdio: ["ignore", "ignore", "pipe"] };

  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", caKey, "-out", ca, "-days", "1",
    "-subj", "/CN=Helmut Z3 Lasttest CA (lokal, ephemer)"], still);
  execFileSync("openssl", ["req", "-newkey", "rsa:2048", "-nodes",
    "-keyout", srvKey, "-out", csr, "-subj", `/CN=${host}`], still);
  fs.writeFileSync(ext, `subjectAltName=IP:${host}\nbasicConstraints=CA:FALSE\n`, "utf8");
  execFileSync("openssl", ["x509", "-req", "-in", csr, "-CA", ca, "-CAkey", caKey,
    "-CAcreateserial", "-out", srv, "-days", "1", "-extfile", ext], still);

  return { caPfad: ca, zertifikat: fs.readFileSync(srv), schluessel: fs.readFileSync(srvKey) };
}

// Tokenschaetzung. BEWUSST als Schaetzung benannt: der lokale Endpunkt kann nicht zaehlen,
// was ein fremder Zerleger zaehlen wuerde. Grundlage ist die GEMESSENE Zeichenzahl; der
// Teiler ist der fuer deutsche Prosa gebraeuchliche Wert und steht hier sichtbar, damit jede
// abgeleitete Zahl nachrechenbar bleibt.
const ZEICHEN_JE_TOKEN = 3.8;
function schaetzeToken(text) {
  return Math.max(1, Math.round(Buffer.byteLength(String(text || ""), "utf8") / ZEICHEN_JE_TOKEN));
}

function starteKiEndpunkt({
  host = "127.0.0.1",
  latenzMs = 900,
  latenzStreuungMs = 700,
  fehlerAnteil = 0,
  hoechstzahlAufrufe = 100000,     // KOSTENRIEGEL: harte Obergrenze, auch lokal
  verzeichnis = null
} = {}) {
  const arbeitsverzeichnis = verzeichnis || fs.mkdtempSync(path.join(os.tmpdir(), "helmut-z3-tls-"));
  const zert = erzeugeZertifikat(arbeitsverzeichnis, host);

  const messung = {
    aufrufe: 0, erfolgreich: 0, fehler: 0, abgewiesenWegenObergrenze: 0,
    eingabeZeichen: 0, ausgabeZeichen: 0, eingabeToken: 0, ausgabeToken: 0,
    dauer: messreihe(), nachStatus: {}, gleichzeitigSpitze: 0, nachModell: {}
  };
  let gleichzeitig = 0;

  const streu = (schluessel, spanne) => {
    const h = crypto.createHash("sha256").update(String(schluessel)).digest();
    return spanne <= 0 ? 0 : h.readUInt32BE(0) % spanne;
  };

  const server = https.createServer({ cert: zert.zertifikat, key: zert.schluessel }, (req, res) => {
    const t0 = Date.now();
    gleichzeitig += 1;
    if (gleichzeitig > messung.gleichzeitigSpitze) messung.gleichzeitigSpitze = gleichzeitig;
    let roh = "";
    req.on("data", (d) => { roh += d; });
    req.on("end", () => {
      const beenden = (code, rumpf) => {
        messung.nachStatus[code] = (messung.nachStatus[code] || 0) + 1;
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(rumpf));
        gleichzeitig -= 1;
        messung.dauer.erfasse(Date.now() - t0);
      };

      if (!String(req.url || "").endsWith("/openai/v1/responses")) {
        return beenden(404, { error: { message: "unbekannter Pfad (lokaler Z3-Endpunkt)" } });
      }
      // FAIL CLOSED: ohne Kopfzeile `api-key` keine Antwort. Der echte Anbieter tut dasselbe;
      // ein Endpunkt, der jeden durchlaesst, haette den Authentifizierungspfad nicht geprueft.
      if (!req.headers["api-key"]) {
        return beenden(401, { error: { message: "api-key fehlt (lokaler Z3-Endpunkt)" } });
      }

      messung.aufrufe += 1;
      if (messung.aufrufe > hoechstzahlAufrufe) {
        messung.abgewiesenWegenObergrenze += 1;
        return beenden(429, { error: { message: "Kostenriegel: Obergrenze der Aufrufe erreicht" } });
      }

      let anfrage = {};
      try { anfrage = JSON.parse(roh || "{}"); } catch (_) { anfrage = {}; }
      const modell = String(anfrage.model || "unbekannt");
      messung.nachModell[modell] = (messung.nachModell[modell] || 0) + 1;
      const eingabeZeichen = Buffer.byteLength(roh || "", "utf8");
      messung.eingabeZeichen += eingabeZeichen;

      // Die Antwort folgt dem Schema, das der Aufrufer angefordert hat. Ein frei erfundener
      // Text waere hier NICHT harmlos: `understanding.js` wertet die Antwort aus, und eine
      // schemafremde Antwort haette den Fachpfad an einer Stelle abgebrochen, die mit
      // Kapazitaet nichts zu tun hat.
      const schema = anfrage.text && anfrage.text.format && anfrage.text.format.schema;
      const ausgabe = JSON.stringify(baueSchemaAntwort(schema));
      messung.ausgabeZeichen += Buffer.byteLength(ausgabe, "utf8");
      const eToken = schaetzeToken(roh);
      const aToken = schaetzeToken(ausgabe);
      messung.eingabeToken += eToken;
      messung.ausgabeToken += aToken;

      const verzoegerung = latenzMs + streu(`ki|${messung.aufrufe}`, Math.max(1, latenzStreuungMs));
      const scheitert = fehlerAnteil > 0
        && (streu(`kifehler|${messung.aufrufe}`, 10000) < Math.round(fehlerAnteil * 10000));

      setTimeout(() => {
        if (scheitert) {
          messung.fehler += 1;
          return beenden(503, { error: { message: "Anbieter voruebergehend nicht verfuegbar (synthetisch)" } });
        }
        messung.erfolgreich += 1;
        beenden(200, {
          id: `resp_z3_${messung.aufrufe}`,
          status: "completed",
          model: modell,
          output_text: ausgabe,
          output: [{ content: [{ type: "output_text", text: ausgabe }] }],
          usage: { input_tokens: eToken, output_tokens: aToken, total_tokens: eToken + aToken }
        });
      }, verzoegerung);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, host, () => {
      const port = server.address().port;
      resolve({
        art: "ki-endpunkt",
        url: `https://${host}:${port}`,
        port,
        caPfad: zert.caPfad,
        zeichenJeToken: ZEICHEN_JE_TOKEN,
        messung,
        bericht: () => ({
          aufrufe: messung.aufrufe, erfolgreich: messung.erfolgreich, fehler: messung.fehler,
          abgewiesenWegenObergrenze: messung.abgewiesenWegenObergrenze,
          eingabeZeichen: messung.eingabeZeichen, ausgabeZeichen: messung.ausgabeZeichen,
          eingabeTokenGeschaetzt: messung.eingabeToken, ausgabeTokenGeschaetzt: messung.ausgabeToken,
          zeichenJeToken: ZEICHEN_JE_TOKEN,
          nachModell: { ...messung.nachModell }, nachStatus: { ...messung.nachStatus },
          dauerMs: messung.dauer.auswertung(), gleichzeitigSpitze: messung.gleichzeitigSpitze
        }),
        stoppe: () => new Promise((r) => server.close(() => {
          try { fs.rmSync(arbeitsverzeichnis, { recursive: true, force: true }); } catch (_) { /* egal */ }
          r();
        }))
      });
    });
  });
}

// Baut eine schemakonforme, ausdruecklich als synthetisch gekennzeichnete Antwort. Ohne
// Schema wird ein kurzer Text geliefert.
function baueSchemaAntwort(schema) {
  const marke = "SYNTHETISCH (Helmut Z3-Lasttest, lokal erzeugt)";
  if (!schema || typeof schema !== "object") return { text: marke };
  const bau = (s) => {
    if (!s || typeof s !== "object") return marke;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    switch (s.type) {
      case "string": return marke;
      case "number": case "integer": return 0;
      case "boolean": return false;
      case "array": return [bau(s.items || { type: "string" })];
      case "object": {
        const o = {};
        const eigenschaften = s.properties || {};
        const pflicht = Array.isArray(s.required) ? s.required : Object.keys(eigenschaften);
        for (const name of pflicht) o[name] = bau(eigenschaften[name] || { type: "string" });
        return o;
      }
      default: return marke;
    }
  };
  return bau(schema);
}

module.exports = {
  starteDatenbankTor,
  starteAnbieterUrsprung,
  starteKiEndpunkt,
  erzeugeZertifikat,
  schaetzeToken,
  baueSchemaAntwort,
  ZEICHEN_JE_TOKEN,
  messreihe
};
