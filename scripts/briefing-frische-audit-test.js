"use strict";

// =============================================================================
// Helmut — ADVERSARIALE Gegenprobe zum Frischevertrag (Audit 2026-08-10, OP-31)
// =============================================================================
// Diese Suite ist bewusst KEINE Wiederholung von `briefing-frische-test.js` und
// `briefing-frische-e2e-test.js`. Sie enthaelt ausschliesslich die Faelle, die der
// unabhaengige Review von PR #238 als LUECKEN nachgewiesen hat — jeder Fall ist ein
// Gegenbeweis, der VOR der Korrektur rot war:
//
//   F1  Ein Beleg, der einem ANDEREN Mandat oder einem ANDEREN Berliner Tag gehoert,
//       wurde als heutiger Beleg dieses Mandats akzeptiert. (`getRenderedBriefingV3`
//       fragt nur `id=eq.…`, ohne `user_id`-Filter — der Tenant-JWT-Modus ist
//       stillgelegt.)  -> mandats- und tagesscharfe Pruefung in `briefing-lauf`.
//   F2  Ein wochenalter Vorgang wurde zu „Neu seit dem letzten Briefing" hochgestuft
//       und trug das Label „Heute", sobald Helmut seine Zeile erneut geschrieben hatte
//       (Backfill/Reklassifizierung bumpt `updated_at`). -> Klasse und Datum folgen dem
//       BELEGTEN Meldungszeitpunkt (`meldungAt`), nie `updated_at`.
//   F3  Ein Vorgang von GESTERN stand mit belegtem heutigem Lauf unter der Ueberschrift
//       „Morgenbriefing" — optisch die heutige Lage. -> `datenstandVonHeute` zwingt den
//       Kopf auf „Letzter Stand".
//   F5  Bei gezogenem Not-Aus meldete der Morgen-Cron dauerhaft „Frischevertrag
//       unvollstaendig". -> ohne Vertrag kein Beleg und keine Abdeckungsbehauptung.
//   INT Der Morgen-Cron wurde nirgends ueber seine ECHTE Route gepruft; alle Aussagen
//       zu Wiederholung/Beleg stammten aus Einzelbausteinen. -> echter HTTP-Lauf gegen
//       /api/cron/morning-briefing.
//
// Offline, in-process, lokaler Datei-Store. KEIN Netz, KEINE KI, KEIN Supabase.
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

delete process.env.HELMUT_AUTH_MODE;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;
delete process.env.HELMUT_BRIEFING_FRISCHE;
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.CRON_SECRET = "audit-cron-secret";

const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json", "p-audit-mandat-a.json", "p-audit-mandat-b.json"];
const snap = new Map(GUARDED.map((n) => [n, fs.existsSync(path.join(dataDir, n)) ? fs.readFileSync(path.join(dataDir, n)) : null]));
process.on("exit", () => {
  for (const [n, c] of snap) {
    const f = path.join(dataDir, n);
    try { if (c === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, c); } catch (_) { /* best effort */ }
  }
});

const handler = require("../server.js");
const storage = require("../lib/helmut/storage");
const contract = require("../lib/helmut/briefingContract");
const f = require("../lib/helmut/briefing-frische");
const lauf = require("../lib/helmut/briefing-lauf");
const server = require("../server.js");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Stille Konsole fuer die absichtlich provozierten Fehlerpfade (der Test prueft das
// Ergebnis, nicht das Protokoll) — aber nur punktuell, nie global.
function ohneFehlerprotokoll(fn) {
  const orig = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = orig; }
}

const JETZT = new Date("2026-07-15T04:10:00Z");   // 06:10 Berlin, Sommerzeit
const HEUTE = f.berlinTagKey(JETZT);
const MANDAT = "audit-mandat-a";
const FREMD = "audit-mandat-b";

function zeilenSpeicher() {
  const zeilen = new Map();
  return {
    zeilen,
    schreibvorgaenge: 0,
    async getRenderedBriefingV3(userId, slot, day) {
      // Bewusst EXAKT wie die Produktion: Auswahl allein ueber die Kennung,
      // OHNE user_id-Filter. Genau darum muss die Pruefung im Lesecode sitzen.
      return zeilen.get(`bf-${userId}-${slot}-${day}`) || null;
    },
    async saveRenderedBriefingV3(entry) {
      this.schreibvorgaenge += 1;
      zeilen.set(entry.id, { ...entry });
      return { saved: true, id: entry.id };
    }
  };
}

// =============================================================================
// F1 — Der Beleg ist mandats- und tagesscharf
// =============================================================================
(async () => {
  const st = zeilenSpeicher();
  const id = lauf.laufId(MANDAT, HEUTE);

  // (a) Zeile traegt die Kennung von A, gehoert aber B (Kollision/Verfaelschung).
  st.zeilen.set(id, {
    id, user_id: FREMD, slot: lauf.SLOT_ERFOLG, generated_at: "2026-07-15T04:00:00Z",
    payload: { vertragVersion: 1, tenantId: FREMD, berlinTag: HEUTE, status: "erfolg", erzeugtAm: "2026-07-15T04:00:00Z", signatur: "x" }
  });
  const fremd = await ohneFehlerprotokoll(() => lauf.ladeTageslauf(st, MANDAT, HEUTE));
  check("F1a Beleg eines fremden Mandats gilt NICHT als eigener Beleg",
    fremd.lauf === null && fremd.fehler === "beleg-passt-nicht", JSON.stringify(fremd));
  const urteilFremd = f.beurteileFrische({ jetzt: JETZT, lauf: fremd.lauf, datenstandIso: "2026-07-15T03:00:00Z" });
  check("F1b Ohne eigenen Beleg bleibt es bei 'Briefing noch nicht aktuell'",
    urteilFremd.aktuell === false && urteilFremd.grund === f.GRUND.LAUF_FEHLT, urteilFremd.grund);

  // (b) Nur die Zeile gehoert einem anderen Mandat (payload ohne tenantId).
  st.zeilen.set(id, {
    id, user_id: FREMD, slot: lauf.SLOT_ERFOLG, generated_at: "2026-07-15T04:00:00Z",
    payload: { vertragVersion: 1, berlinTag: HEUTE, status: "erfolg", erzeugtAm: "2026-07-15T04:00:00Z" }
  });
  const nurZeile = await ohneFehlerprotokoll(() => lauf.ladeErfolg(st, MANDAT, HEUTE));
  check("F1c Fremde Zeilenzugehoerigkeit (user_id) allein genuegt zur Ablehnung", nurZeile.lauf === null);

  // (c) Beleg des VORTAGS unter heutiger Kennung.
  st.zeilen.set(id, {
    id, user_id: MANDAT, slot: lauf.SLOT_ERFOLG, generated_at: "2026-07-14T04:00:00Z",
    payload: { vertragVersion: 1, tenantId: MANDAT, berlinTag: "2026-07-14", status: "erfolg", erzeugtAm: "2026-07-14T04:00:00Z" }
  });
  const vortag = await ohneFehlerprotokoll(() => lauf.ladeErfolg(st, MANDAT, HEUTE));
  check("F1d Beleg eines anderen Berliner Tages gilt nicht als heutiger Beleg", vortag.lauf === null);

  // (d) Der EIGENE, heutige Beleg wird selbstverstaendlich weiterhin akzeptiert.
  st.zeilen.clear();
  await lauf.schreibeQuittung(st, lauf.quittung({
    tenantId: MANDAT, berlinTag: HEUTE, status: lauf.STATUS_ERFOLG,
    erzeugtAm: new Date("2026-07-15T04:00:00Z"), signatur: "eigen"
  }));
  const eigen = await lauf.ladeTageslauf(st, MANDAT, HEUTE);
  check("F1e Der eigene heutige Beleg wird unveraendert akzeptiert",
    eigen.lauf && eigen.lauf.status === "erfolg" && eigen.lauf.tenantId === MANDAT);
  // Und er faerbt NICHT auf ein anderes Mandat ab.
  const nachbar = await lauf.ladeTageslauf(st, FREMD, HEUTE);
  check("F1f Der Beleg von A macht B nicht aktuell", nachbar.lauf === null);

  // =============================================================================
  // F2 — „Neu" folgt dem BELEGTEN Meldungszeitpunkt, nie Helmuts Schreibzeitpunkt
  // =============================================================================
  const FENSTER = f.frischeFenster({ jetzt: JETZT }); // Vorabend-Standard: 14.07. 16:00 Berlin
  const basisKo = {
    status: "understood", understanding_status: "complete",
    was_ist_passiert: "passiert", warum_wichtig: "wichtig", why_relevant: "relevant",
    recommendation: "Linie festlegen.", zeitdruck: "hoch", confidence_score: 80,
    // Quellenpflicht (2026-08-22): ohne oeffnende Quelle traegt kein Vorgang den Stand.
    // Die Datums-/Frischesemantik dieses Tests bleibt unberuehrt (Fallback-Quelle ohne Datum).
    best_source_url: "https://beispiel.de/politik/audit-artikel", best_link_type: "direct"
  };
  const baue = (ko, docs) => contract.toBriefingContractV3({
    profile: { id: MANDAT }, decisions: [{ knowledge_object_id: ko.id, score: 90, decision: "Sofort reagieren" }],
    kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: docs || [] },
    now: JETZT, briefingType: "morning", knowledgeObjects: [ko], frischeFenster: FENSTER
  }).currentHelmutState;

  // (a) Alter Vorgang, heute nur neu GESCHRIEBEN (Backfill) — kein neues Dokument.
  const altBackfill = baue(
    { ...basisKo, id: "alt", vorgang_id: "vg-alt", display_title: "Seit Wochen laufender Vorgang",
      created_at: "2026-05-02T09:00:00Z", updated_at: "2026-07-15T03:00:00Z" },
    [{ id: "d1", published_at: "2026-05-02T08:00:00Z" }]
  );
  check("F2a Backfill macht einen 10 Wochen alten Vorgang NICHT zu 'neu'",
    altBackfill.primaryItem.frischeKlasse === f.KLASSE_HINTERGRUND, String(altBackfill.primaryItem.frischeKlasse));
  check("F2b Der alte Vorgang traegt sein ECHTES Datum, nicht 'Heute'",
    /^02\.05\.2026/.test(altBackfill.primaryItem.zeitLabel || ""), String(altBackfill.primaryItem.zeitLabel));
  check("F2c `lastUpdated` bleibt unveraendert (rein additive Korrektur)",
    altBackfill.primaryItem.lastUpdated === "2026-07-15T03:00:00Z", String(altBackfill.primaryItem.lastUpdated));

  // (b) Derselbe alte Vorgang, aber mit einem HEUTE belegten neuen Dokument:
  //     das ist eine echte neue Entwicklung und MUSS 'neu' sein (keine Uebersteuerung).
  const altMitNeuemDoc = baue(
    { ...basisKo, id: "alt2", vorgang_id: "vg-alt2", display_title: "Alter Vorgang, neue Entwicklung",
      created_at: "2026-05-02T09:00:00Z", updated_at: "2026-07-15T03:00:00Z" },
    [{ id: "d1", published_at: "2026-05-02T08:00:00Z" }, { id: "d2", published_at: "2026-07-15T03:05:00Z" }]
  );
  check("F2d Echte neue Entwicklung an altem Vorgang bleibt 'neu'",
    altMitNeuemDoc.primaryItem.frischeKlasse === f.KLASSE_NEU, String(altMitNeuemDoc.primaryItem.frischeKlasse));
  check("F2e ... und traegt das Datum der Entwicklung ('Heute')",
    /^Heute, /.test(altMitNeuemDoc.primaryItem.zeitLabel || ""), String(altMitNeuemDoc.primaryItem.zeitLabel));

  // (c) Meldung vom spaeten Vorabend bleibt 'neu' mit ihrem echten Datum (Punkt 3).
  const vorabend = baue(
    { ...basisKo, id: "va", vorgang_id: "vg-va", display_title: "Spaeter Vorabend",
      created_at: "2026-07-14T20:40:00Z", updated_at: "2026-07-14T20:40:00Z" },
    [{ id: "d3", published_at: "2026-07-14T20:40:00Z" }]
  );
  check("F2f Meldung vom spaeten Vorabend ist 'neu'", vorabend.primaryItem.frischeKlasse === f.KLASSE_NEU);
  check("F2g ... behaelt aber das Datum von gestern", /^Gestern, /.test(vorabend.primaryItem.zeitLabel || ""));

  // (d) Ohne jeden belegten Zeitpunkt: niemals 'neu'.
  const ohneDatum = baue({ ...basisKo, id: "od", vorgang_id: "vg-od", display_title: "Ohne Datum" }, []);
  check("F2h Vorgang ohne belegten Zeitpunkt wird nie zu 'neu'",
    ohneDatum.primaryItem.frischeKlasse === f.KLASSE_UNDATIERT, String(ohneDatum.primaryItem.frischeKlasse));

  // =============================================================================
  // F3 — Ein Vorgang von gestern steht nie unter der Ueberschrift des heutigen Slots
  // =============================================================================
  const fensterGestern = f.frischeFenster({ jetzt: JETZT, letzterErfolgAt: "2026-07-14T04:00:00Z" });
  const gestrigesBriefing = contract.toBriefingContractV3({
    profile: { id: MANDAT },
    decisions: [{ knowledge_object_id: "g", score: 90, decision: "Sofort reagieren" }],
    kosById: { g: { ...basisKo, id: "g", vorgang_id: "vg-g", display_title: "Gestern frueh",
      created_at: "2026-07-14T05:00:00Z", updated_at: "2026-07-14T05:00:00Z" } },
    sourcesByVorgang: { "vg-g": [{ id: "d4", published_at: "2026-07-14T05:00:00Z" }] },
    now: JETZT, briefingType: "morning",
    knowledgeObjects: [{ ...basisKo, id: "g", vorgang_id: "vg-g", created_at: "2026-07-14T05:00:00Z", updated_at: "2026-07-14T05:00:00Z" }],
    frischeFenster: fensterGestern
  });
  check("F3a Der Stand weiss, dass die gezeigten Daten NICHT von heute sind",
    gestrigesBriefing.currentHelmutState.datenstandVonHeute === false
    && gestrigesBriefing.currentHelmutState.datenstandTag === "2026-07-14",
    JSON.stringify({ h: gestrigesBriefing.currentHelmutState.datenstandVonHeute, t: gestrigesBriefing.currentHelmutState.datenstandTag }));

  const heutigerBeleg = lauf.quittung({
    tenantId: MANDAT, berlinTag: HEUTE, status: lauf.STATUS_ERFOLG,
    erzeugtAm: new Date("2026-07-15T04:00:00Z"), fensterStart: fensterGestern.start, signatur: "s"
  });
  const antwortGestern = server.__prepareBriefingResponse(gestrigesBriefing, {
    frischeKontext: { jetzt: JETZT, berlinTag: HEUTE, lauf: heutigerBeleg, fenster: fensterGestern, datenstand: "2026-07-15T03:00:00Z", speicherFehler: null }
  });
  const api = ladeClient();
  api.setBriefing(antwortGestern);
  const htmlGestern = api.render();
  check("F3b Kopf zeigt 'Letzter Stand' statt des heutigen Slot-Namens",
    htmlGestern.includes("Letzter Stand") && !/Morgenbriefing|Mittagsbriefing|Abendlage|Tagesbriefing/.test(htmlGestern));
  check("F3c Der Kopf behauptet kein 'Heute' fuer einen Vorgang von gestern",
    !/Heute, \d{2}:\d{2}/.test(htmlGestern) && /Gestern, \d{2}:\d{2}/.test(htmlGestern));

  // Gegenprobe: ein Vorgang von HEUTE traegt den Slot-Namen weiterhin.
  const heutigesBriefing = contract.toBriefingContractV3({
    profile: { id: MANDAT }, decisions: [{ knowledge_object_id: "h", score: 90, decision: "Sofort reagieren" }],
    kosById: { h: { ...basisKo, id: "h", vorgang_id: "vg-h", display_title: "Heute frueh",
      created_at: "2026-07-15T03:10:00Z", updated_at: "2026-07-15T03:10:00Z" } },
    sourcesByVorgang: { "vg-h": [{ id: "d5", published_at: "2026-07-15T03:10:00Z" }] },
    now: JETZT, briefingType: "morning", frischeFenster: FENSTER
  });
  api.setBriefing(server.__prepareBriefingResponse(heutigesBriefing, {
    frischeKontext: { jetzt: JETZT, berlinTag: HEUTE, lauf: heutigerBeleg, fenster: FENSTER, datenstand: "2026-07-15T03:10:00Z", speicherFehler: null }
  }));
  const htmlHeute = api.render();
  check("F3d Gegenprobe: heutiger Vorgang traegt weiterhin den Slot-Namen",
    htmlHeute.includes("Morgenbriefing") && !htmlHeute.includes("Letzter Stand"));

  // =============================================================================
  // W — Wiederholung und ueberlappende Laeufe
  // =============================================================================
  const briefingA = {
    available: true,
    currentHelmutState: { status: "fresh", primaryVorgangId: "vg-1",
      primaryItem: { id: "vg-1", lastUpdated: "2026-07-15T03:10:00Z" }, items: [] }
  };
  const stW = zeilenSpeicher();
  const sig = lauf.inhaltsSignatur(briefingA);
  // Lauf 1 liest (nichts), baut, schreibt.
  const vorBau = await lauf.ladeErfolg(stW, MANDAT, HEUTE);
  check("W1 Erster Lauf sieht keinen Beleg", vorBau.lauf === null);
  await lauf.schreibeQuittung(stW, lauf.quittung({
    tenantId: MANDAT, berlinTag: HEUTE, status: lauf.STATUS_ERFOLG, signatur: sig,
    fensterStart: FENSTER.start, erzeugtAm: new Date("2026-07-15T04:00:00Z")
  }));
  const schreibvorgaengeNachEins = stW.schreibvorgaenge;
  // Lauf 2 (Watchdog) hat VOR dem Bau ebenfalls nichts gesehen — die zweite Lesung
  // unmittelbar vor dem Push erkennt den inzwischen geschriebenen Beleg.
  const belegVorPush = await lauf.ladeErfolg(stW, MANDAT, HEUTE);
  check("W2 Zweite Lesung unmittelbar vor dem Push findet den Beleg des Erstlaufs",
    Boolean(belegVorPush.lauf) && lauf.istWiederholung(belegVorPush.lauf, sig) === true);
  check("W3 Wiederholung erzeugt keinen weiteren Schreibvorgang",
    stW.schreibvorgaenge === schreibvorgaengeNachEins);
  check("W4 Der Servercode liest den Beleg TATSAECHLICH erneut vor dem Push",
    /belegVorPush[\s\S]{0,200}ladeErfolg/.test(fs.readFileSync(path.join(root, "server.js"), "utf8")));
  // Ein Fehlschlag NACH dem Erfolg zerstoert den Erfolg nicht.
  await lauf.schreibeQuittung(stW, lauf.quittung({
    tenantId: MANDAT, berlinTag: HEUTE, status: lauf.STATUS_FEHLER, grund: "build-timeout",
    erzeugtAm: new Date("2026-07-15T06:00:00Z")
  }));
  const nachFehler = await lauf.ladeTageslauf(stW, MANDAT, HEUTE);
  check("W5 Fehler nach belegtem Erfolg laesst den Erfolg unberuehrt",
    nachFehler.quelle === "erfolg" && nachFehler.lauf.signatur === sig);

  // =============================================================================
  // INT — Der ECHTE Morgen-Cron ueber seine echte Route
  // =============================================================================
  const httpServer = http.createServer(handler);
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  try {
    await setzeMandate([{ id: MANDAT, fullName: "Audit Mandat A", committees: [], topicPriorities: [] }]);
    const originalGet = storage.getRenderedBriefingV3;
    const originalSave = storage.saveRenderedBriefingV3;
    const stCron = zeilenSpeicher();
    storage.getRenderedBriefingV3 = stCron.getRenderedBriefingV3.bind(stCron);
    storage.saveRenderedBriefingV3 = stCron.saveRenderedBriefingV3.bind(stCron);
    try {
      const antwort = await hole(httpServer, "/api/cron/morning-briefing");
      const p = JSON.parse(antwort.body || "{}");
      check("INT1 Die echte Cron-Route antwortet und weist den Frischevertrag aus",
        antwort.status === 200 && p.frischevertrag && p.frischevertrag.berlinTag === f.berlinTagKey(new Date()),
        JSON.stringify(p.frischevertrag || null));
      // F6: eine persistierte FEHLER-Quittung ist ein Beleg fuer den Fehlschlag,
      // NICHT fuer ein Briefing. Vor der Korrektur meldete dieser Lauf `belege=1/1`.
      check("INT2/F6 Ohne V3-Store meldet der Lauf 0 Belege (kein falsches Gruen)",
        p.frischevertrag.belegt === 0 && p.frischevertrag.fehlgeschlagen >= 1
        && p.frischevertrag.nichtPersistiert === 0,
        JSON.stringify(p.frischevertrag));
      check("INT2b/F6 Die Protokollzeile behauptet keine Abdeckung, die es nicht gibt",
        /belegt:\s*belegErgebnisse\.filter\(\(r\) => r\.frischeBeleg\.wiederholung/
          .test(fs.readFileSync(path.join(root, "server.js"), "utf8")));
      const heuteEcht = f.berlinTagKey(new Date());
      const fehlerZeile = stCron.zeilen.get(lauf.laufId(MANDAT, heuteEcht, lauf.SLOT_FEHLER));
      check("INT3 Der Lauf hinterlaesst eine FEHLER-Quittung, keine Erfolgsquittung",
        Boolean(fehlerZeile) && fehlerZeile.payload.status === "fehler"
        && !stCron.zeilen.has(lauf.laufId(MANDAT, heuteEcht, lauf.SLOT_ERFOLG)),
        JSON.stringify(fehlerZeile && fehlerZeile.payload));
      check("INT4 Der Fehlergrund steht im Beleg (Speicherweg, nicht 'leeres Ergebnis')",
        fehlerZeile && ["v3-store-disabled", "store-error"].includes(fehlerZeile.payload.grund),
        String(fehlerZeile && fehlerZeile.payload.grund));

      // Der Lesepfad meldet danach ehrlich „noch nicht aktuell".
      const kontextEcht = await server.__ladeFrischeKontext(MANDAT, new Date());
      check("INT5 Der Lesepfad sieht den Fehlversuch, nicht einen Erfolg",
        kontextEcht.lauf && kontextEcht.lauf.status === "fehler", JSON.stringify(kontextEcht.lauf));
      check("INT6 Der Lesepfad hat KEINE Erfolgsquittung erzeugt",
        !stCron.zeilen.has(lauf.laufId(MANDAT, heuteEcht, lauf.SLOT_ERFOLG)));

      // F5 — Not-Aus: kein Beleg, keine Abdeckungsbehauptung, kein Fehlalarm.
      process.env.HELMUT_BRIEFING_FRISCHE = "off";
      stCron.zeilen.clear();
      const ausAntwort = await hole(httpServer, "/api/cron/morning-briefing");
      const pa = JSON.parse(ausAntwort.body || "{}");
      check("F5a Not-Aus: der Lauf meldet den Vertrag als abgeschaltet",
        pa.frischevertrag && pa.frischevertrag.vertrag === "not-aus", JSON.stringify(pa.frischevertrag || null));
      check("F5b Not-Aus: kein Mandat wird als 'ohne Beleg' angeprangert",
        pa.frischevertrag.nichtPersistiert === 0 && pa.frischevertrag.belegt === 0,
        JSON.stringify(pa.frischevertrag));
      check("F5c Not-Aus: es wird keine Quittung geschrieben", stCron.zeilen.size === 0);
      const kontextAus = await server.__ladeFrischeKontext(MANDAT, new Date());
      check("F5d Not-Aus: der Lesepfad faellt auf das Altverhalten zurueck (kein Kontext)",
        kontextAus === null);
      delete process.env.HELMUT_BRIEFING_FRISCHE;
    } finally {
      storage.getRenderedBriefingV3 = originalGet;
      storage.saveRenderedBriefingV3 = originalSave;
    }
  } finally {
    await new Promise((r) => httpServer.close(r));
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
})().catch((error) => {
  console.error("AUDIT-SUITE ABGEBROCHEN:", error && error.stack);
  process.exit(1);
});

// --- Helfer -----------------------------------------------------------------

async function setzeMandate(profile) {
  const store = await storage.readStore("main");
  store.profiles = {};
  store.mandateProfiles = {};
  for (const p of profile) store.profiles[p.id] = { ...p };
  await storage.writeStore(store, "main");
}

function hole(httpServer, pathname) {
  const { port } = httpServer.address();
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method: "GET", path: pathname,
      headers: { authorization: "Bearer audit-cron-secret" }, timeout: 60000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end();
  });
}

// client.js im vm laden (identisches Muster wie briefing-frische-e2e-test.js).
function ladeClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__auditTest = { render: () => renderHelmutStandView(), setBriefing: (b) => { briefing = b; } };`;
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  });
  const store = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    document: doc, navigator: { userAgent: "node-test", language: "de-DE" },
    localStorage: store, sessionStorage: store,
    location: { search: "", href: "http://localhost/", pathname: "/", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    fetch: () => { throw new Error("fetch-should-not-be-called-during-render"); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__auditTest;
}
