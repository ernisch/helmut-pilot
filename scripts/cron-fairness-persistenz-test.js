"use strict";

// Helmut — Testsuite: Persistenzvertrag der Fairnesszeile bei überlappenden Crons (F-CAS).
// =============================================================================================
// ANLASS (realer Production-Lauf, 2026-08-02, rein lesend belegt):
//   Lauf `cron-morning-briefing-20260802050021-…` meldete im Runtime-Log
//   `erfolgreich=6 … laufzustand=abgeschlossen zustand=ok`.
//   Die Zeile `helmut_store/main-cron-fairness` trug für DENSELBEN Lauf nur FÜNF Abschlüsse;
//   ein Mandat stand dort auf `begonnen` bzw. `laufend`, mit der Laufkennung genau dieses
//   Laufs, dem Versuchszeitpunkt seines Claims und einem letzten Erfolg vom Vortag.
//   Zeitlich davor: der reguläre `crawl`-Lauf `cron-crawl-20260802040020-…` lief nach seinem
//   ÄUSSEREN Zeitlimit intern weiter und schrieb noch während des Briefinglaufs (seine
//   Fairnessmeldung erschien ~05:00:33 UTC, der Briefinglauf lief ~05:00:21–05:00:42 UTC).
//
// URSACHE: `storage.saveCronFairnessState` war ein Lesen–Verschmelzen–Schreiben ohne
//   Bedingung. Die monotone Verschmelzung (`cron-fairness.mergeState`) ist monoton gegenüber
//   dem GELESENEN Stand — nicht gegenüber einem Schreibvorgang, den der Prozess nie gesehen
//   hat. Zwei überlappende Crons genügen: A liest, B schreibt seinen Abschluss, A schreibt
//   seinen eigenen Patch auf den veralteten Lesestand zurück — Bs Abschluss ist weg. Ohne
//   Fehler, ohne Signal, und weil `[cron/*/fairness]` aus dem LAUF und nicht aus der ABLAGE
//   entsteht, meldete der Lauf trotzdem sechs Erfolge.
//
// Diese Suite prüft die Behebung deterministisch und offline: eine Attrappe der
// `helmut_store`-Zeile mit ECHTER Compare-and-Set-Semantik (wie das bedingte UPDATE in
// Postgres), die ECHTEN Funktionen aus `storage.js` und `cron-fairness.js`, kein Netz, keine
// Datenbank, kein Secret, keine Uhr aus der Wirklichkeit, kein Zufall.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const F = require(path.join(ROOT, "lib", "helmut", "cron-fairness.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// ── Prüfstand ────────────────────────────────────────────────────────────────────────────────
// Sechs pseudonyme Mandatskennungen. KEIN echter Mandant, kein Klarname, kein Sonderpfad —
// die Reihenfolge dieser Suite ist reine Testdaten (CLAUDE.md §4.2).
const MANDATE = ["m-a1", "m-b2", "m-c3", "m-d4", "m-e5", "m-f6"];
const CRAWL_START = Date.parse("2026-08-02T04:00:20.000Z");
const MB_START = Date.parse("2026-08-02T05:00:21.000Z");

function uhrAb(startMs) {
  let t = startMs;
  return { now: () => t, vor: (ms) => { t += ms; return t; } };
}

// Attrappe der Zeile `helmut_store/<storeId>-cron-fairness`.
//
// Sie bildet GENAU das nach, was Postgres bei einem bedingten UPDATE tut: das UPDATE trifft
// nur, wenn `data->>rev` noch dem gelesenen Wert entspricht; sonst ändert es 0 Zeilen. Ein
// unbedingtes Einfügen auf eine bestehende Zeile endet in einem Konflikt (409).
//
// `nachLesen` ist der Hebel für die zeitliche Überlappung: eine Rückruffunktion, die
// unmittelbar NACH einem Lesezugriff (und damit VOR dem zugehörigen Schreibvorgang) läuft.
// Genau in dieses Fenster schiebt der Test den zweiten Cron — es ist das Fenster, in dem der
// Verlust in Production entstanden ist.
function zeileMitCas({ nachLesen = null } = {}) {
  const st = { row: null, lesen: 0, schreiben: 0, konflikte: 0, verlauf: [] };
  st.request = async (endpoint, options = {}) => {
    const method = options.method || "GET";
    if (method === "GET") {
      st.lesen += 1;
      const antwort = st.row ? [{ data: JSON.parse(JSON.stringify(st.row)) }] : [];
      if (nachLesen) await nachLesen(st);
      return antwort;
    }
    if (method === "POST") {
      st.schreiben += 1;
      // Ohne `resolution=merge-duplicates` ist ein Einfuegen auf eine bestehende Zeile ein
      // Konflikt — MIT dieser Aufloesung waere es das stille Ueberschreiben von frueher.
      const upsert = /merge-duplicates/.test(String((options.headers || {}).Prefer || ""));
      if (st.row && !upsert) throw new Error("Supabase storage failed (409): duplicate key value violates unique constraint");
      st.row = JSON.parse(options.body).data;
      st.verlauf.push({ art: "insert", rev: st.row.rev });
      return null;
    }
    if (method === "PATCH") {
      st.schreiben += 1;
      const istNull = /data-%3E%3Erev=is\.null/.test(endpoint);
      const erwartet = (/data-%3E%3Erev=eq\.(\d+)/.exec(endpoint) || [])[1];
      // Ohne Bedingung im Filter ist es ein gewoehnliches UPDATE: es trifft die Zeile
      // immer. Genau so verhaelt sich Postgres — und genau das war der alte Zustand.
      const ohneBedingung = !istNull && erwartet === undefined;
      const trifft = ohneBedingung
        ? Boolean(st.row)
        : istNull
          ? Boolean(st.row) && st.row.rev === undefined
          : Boolean(st.row) && String(st.row.rev) === String(erwartet);
      if (!trifft) { st.konflikte += 1; st.verlauf.push({ art: "konflikt", erwartet: istNull ? null : Number(erwartet), ist: st.row ? st.row.rev : "keine-zeile" }); return []; }
      st.row = JSON.parse(options.body).data;
      st.verlauf.push({ art: "update", rev: st.row.rev });
      return [{ id: "attrappe" }];
    }
    throw new Error(`unerwartete Methode ${method}`);
  };
  return st;
}

// Ein Mehrmandantenlauf gegen die ECHTE Ablage — dieselbe Verdrahtung wie in
// `server.js runCronForTenants` (loadState/saveState → storage).
function laufGegenAblage(storage, zeile, { cronName, tenantIds, runId, startedMs, uhr, perTenant, deadlineMs = 240000 }) {
  return F.runTenantsFairly({
    cronName,
    tenantIds,
    runId,
    startedMs,
    deadlineMs,
    now: uhr.now,
    perTenant,
    loadState: async () => {
      const gelesen = await storage.readCronFairnessState({ request: zeile.request });
      if (!gelesen.ok) throw new Error(gelesen.fehler || "fairnesszustand-nicht-lesbar");
      return gelesen.state;
    },
    saveState: async (patch, { pruefen = false } = {}) => {
      const geschrieben = await storage.saveCronFairnessState(patch, { nowMs: uhr.now(), pruefen, deps: { request: zeile.request } });
      if (!geschrieben.ok) throw new Error(geschrieben.fehler || "fairnesszustand-nicht-schreibbar");
      return geschrieben;
    }
  });
}

(async () => {
  const alt = {
    backend: process.env.HELMUT_STORAGE_BACKEND,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = "http://127.0.0.1:1/nicht-erreichbar";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "attrappe-kein-secret";
  const storage = require(path.join(ROOT, "lib", "helmut", "storage.js"));

  try {
    // ═══ 1) Der Vorfall vom 2026-08-02, deterministisch nachgestellt ═══════════════════════
    abschnitt("1) Ueberlappung crawl (nach aeusserem Zeitlimit) x morning-briefing");
    let mbLauf = null;
    let crawlLauf = null;
    {
      const crawlUhr = uhrAb(CRAWL_START);
      const mbUhr = uhrAb(MB_START);
      let crawlLetztesMandat = false;
      let eingeschoben = false;

      const zeile = zeileMitCas({
        nachLesen: async () => {
          // Genau EINMAL, und genau in dem Fenster, das der Vorfall zeigt: der crawl-Lauf hat
          // gelesen, aber noch nicht geschrieben. Jetzt laeuft der Morning-Briefing-Lauf
          // VOLLSTAENDIG durch (Planung, sechs Mandate, Abschluss) — und erst danach schreibt
          // der crawl-Lauf seinen Patch. Das ist die Reihenfolge aus Production, ohne Timer.
          if (eingeschoben || !crawlLetztesMandat) return;
          eingeschoben = true;
          mbLauf = await laufGegenAblage(storage, zeile, {
            cronName: "morning-briefing",
            tenantIds: MANDATE,
            runId: "cron-morning-briefing-20260802050021-opjp0",
            startedMs: MB_START,
            uhr: mbUhr,
            perTenant: async () => { mbUhr.vor(3000); return { available: true }; }
          });
        }
      });

      // Der crawl-Lauf: er schafft zwei Mandate, ueberschreitet dabei sein Zeitbudget
      // (Start-Gatter) und laeuft nach dem aeusseren Zeitlimit intern weiter — genau das
      // Muster des 04:00-Laufs vom 2026-08-02.
      let crawlZaehler = 0;
      crawlLauf = await laufGegenAblage(storage, zeile, {
        cronName: "crawl",
        tenantIds: MANDATE,
        runId: "cron-crawl-20260802040020-5rsy9",
        startedMs: CRAWL_START,
        uhr: crawlUhr,
        deadlineMs: 240000,
        perTenant: async () => {
          crawlZaehler += 1;
          crawlUhr.vor(crawlZaehler === 2 ? 200000 : 40000);
          if (crawlZaehler === 2) crawlLetztesMandat = true;
          return { ok: true };
        }
      });

      const roh = zeile.row;
      const stand = F.normalizeState(roh);
      // Ohne Rueckfallwert wuerde ein VOLLSTAENDIG geloeschter Laufdatensatz (das Ergebnis
      // eines unbedingten Nachzueglers) die Suite abstuerzen lassen statt sie sauber rot zu
      // machen. Ein Absturz ist ein schlechter Befund — er sagt nicht, WAS fehlt.
      const leer = { laufId: null, status: "fehlt", erfolgreich: [], ohneAbschluss: ["laufdatensatz-fehlt"], kapazitaet: -1, gemeldeteKapazitaet: -1 };
      const mbDatensatz = F.rekonstruiereLauf(stand, "morning-briefing", { nowMs: MB_START + 60000 }) || leer;
      const crawlDatensatz = F.rekonstruiereLauf(stand, "crawl", { nowMs: MB_START + 60000 }) || leer;

      check("Der eingeschobene Morning-Briefing-Lauf hat wirklich mitten im Crawl-Fenster gelaufen",
        eingeschoben === true && mbLauf !== null);
      check("Es gab mindestens einen erkannten Schreibkonflikt (die Bedingung hat gegriffen)",
        zeile.konflikte >= 1, `konflikte=${zeile.konflikte}`);
      check("Alle sechs Briefing-Abschluesse stehen in der Ablage (kein Abschluss geht verloren)",
        mbDatensatz.erfolgreich.length === 6 && MANDATE.every((m) => mbDatensatz.erfolgreich.includes(m)),
        JSON.stringify({ erfolgreich: mbDatensatz.erfolgreich, ausgaenge: (stand.laeufe["morning-briefing"] || {}).ausgaenge || "laufdatensatz-fehlt" }));
      check("Kein Mandat steht faelschlich auf 'begonnen' (die Signatur des Vorfalls)",
        mbDatensatz.ohneAbschluss.length === 0, JSON.stringify(mbDatensatz.ohneAbschluss));
      check("Die Mandatsbuchfuehrung traegt dieselben sechs Abschluesse",
        MANDATE.every((m) => {
          const e = F.entryOf(stand, "morning-briefing", m);
          return e && e.status === F.STATUS_ERFOLG && e.letzteLaufkennung === "cron-morning-briefing-20260802050021-opjp0";
        }), JSON.stringify(stand.crons["morning-briefing"]));
      check("Der Laufdatensatz ist abgeschlossen und meldet Kapazitaet 6",
        mbDatensatz.status === "abgeschlossen" && mbDatensatz.kapazitaet === 6 && mbDatensatz.gemeldeteKapazitaet === 6,
        JSON.stringify({ status: mbDatensatz.status, k: mbDatensatz.kapazitaet, gemeldet: mbDatensatz.gemeldeteKapazitaet }));
      check("Der Lauf meldet erfolgreich=6 UND weist keine Abweichung aus",
        mbLauf.fairness.erfolgreich.length === 6 && mbLauf.fairness.persistenzAbweichung.length === 0
        && !mbLauf.fairness.zustandFehler,
        JSON.stringify({ abweichung: mbLauf.fairness.persistenzAbweichung, fehler: mbLauf.fairness.zustandFehler }));
      check("Der spaetere Crawl-Schreibvorgang hat seinen eigenen Stand ebenfalls behalten",
        crawlDatensatz !== null && crawlDatensatz.laufId === "cron-crawl-20260802040020-5rsy9"
        && crawlDatensatz.erfolgreich.length === 2,
        JSON.stringify(crawlDatensatz && crawlDatensatz.erfolgreich));
      check("Der Crawl-Lauf meldet ebenfalls keine Abweichung",
        crawlLauf.fairness.persistenzAbweichung.length === 0, JSON.stringify(crawlLauf.fairness.persistenzAbweichung));
      check("Beide Cron-Bereiche stehen nebeneinander in DERSELBEN Zeile",
        Object.keys(stand.laeufe).sort().join(",") === "crawl,morning-briefing"
        && Object.keys(stand.crons).sort().join(",") === "crawl,morning-briefing");
      check("Die Zeile traegt einen fortlaufenden Zaehler (Bedingung des Compare-and-Set)",
        Number.isInteger(roh.rev) && roh.rev > 0, JSON.stringify({ rev: roh.rev }));
    }

    // ═══ 2) Beisspobe: OHNE Bedingung geht derselbe Abschluss verloren ═════════════════════
    abschnitt("2) Gegenprobe — der alte, unbedingte Schreibvorgang verliert den Abschluss");
    {
      // Kein Test der Produktionsdatei, sondern der BEWEIS, dass das Szenario oben wirklich
      // verlustfaehig ist: derselbe Ablauf mit einer Zeile, die jeden Schreibvorgang
      // bedingungslos annimmt (das Verhalten vor diesem Fix).
      const zeile = { row: null };
      const lesen = () => (zeile.row ? JSON.parse(JSON.stringify(zeile.row)) : {});
      const unbedingtSchreiben = (daten) => { zeile.row = daten; };

      // A liest (vor dem Abschluss), B schreibt seinen Abschluss, A schreibt zurueck.
      const aStand = lesen();
      unbedingtSchreiben(F.mergeState(lesen(), F.claimPatch({
        cronName: "morning-briefing", tenantId: "m-f6", runId: "lauf-mb", nowMs: MB_START + 5000
      }), { nowMs: MB_START + 5000 }));
      const aStandMitClaim = lesen();
      unbedingtSchreiben(F.mergeState(lesen(), F.finishPatch({
        cronName: "morning-briefing", tenantId: "m-f6", runId: "lauf-mb", erfolg: true,
        startedMs: MB_START + 5000, nowMs: MB_START + 8000
      }), { nowMs: MB_START + 8000 }));
      const mitAbschluss = F.entryOf(F.normalizeState(lesen()), "morning-briefing", "m-f6");
      // Der Nachzuegler des crawl-Laufs: sein Lesestand ist `aStandMitClaim`.
      unbedingtSchreiben(F.mergeState(aStandMitClaim, F.claimPatch({
        cronName: "crawl", tenantId: "m-a1", runId: "lauf-crawl", nowMs: MB_START + 9000
      }), { nowMs: MB_START + 9000 }));
      const danach = F.entryOf(F.normalizeState(lesen()), "morning-briefing", "m-f6");

      check("Ohne Bedingung stand der Abschluss zwischenzeitlich in der Zeile",
        mitAbschluss && mitAbschluss.status === F.STATUS_ERFOLG);
      check("Ohne Bedingung ist er nach dem Nachzuegler wieder 'laufend' — genau der Vorfall",
        danach && danach.status === F.STATUS_LAUFEND && danach.letzteLaufkennung === "lauf-mb",
        JSON.stringify(danach));
      check("Und der Lesestand des Nachzueglers enthielt den Abschluss nachweislich nicht",
        !(aStand.crons && aStand.crons["morning-briefing"]));
    }

    // ═══ 3) Kriterium 2: ein verspaeteter Schreiber setzt keinen Abschluss zurueck ═════════
    abschnitt("3) Verspaeteter Schreiber mit aelterem Stand");
    {
      const zeile = zeileMitCas();
      const uhr = uhrAb(MB_START);
      // Ausgangslage: ein persistierter Abschluss.
      await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "lauf-alt", nowMs: MB_START }), { nowMs: MB_START, deps: { request: zeile.request } });
      await storage.saveCronFairnessState(F.finishPatch({ cronName: "crawl", tenantId: "m-a1", runId: "lauf-alt", erfolg: true, startedMs: MB_START, nowMs: MB_START + 4000 }), { nowMs: MB_START + 4000, deps: { request: zeile.request } });
      await storage.saveCronFairnessState(F.laufAusgangPatch({ cronName: "crawl", laufId: "lauf-alt", startAt: MB_START, tenantId: "m-a1", ausgang: F.AUSGANG_ERFOLG, nowMs: MB_START + 4000 }), { nowMs: MB_START + 4000, deps: { request: zeile.request } });
      const vorher = F.entryOf(F.normalizeState(zeile.row), "crawl", "m-a1");

      // Der Nachzuegler: ein ALTER Claim desselben Laufs, der erst jetzt ankommt.
      await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "lauf-alt", nowMs: MB_START - 60000 }), { nowMs: uhr.now(), deps: { request: zeile.request } });
      const nachher = F.entryOf(F.normalizeState(zeile.row), "crawl", "m-a1");
      const laufNachher = F.normalizeState(zeile.row).laeufe.crawl;

      check("Ein Abschluss war persistiert", vorher && vorher.status === F.STATUS_ERFOLG);
      check("Der verspaetete aeltere Claim setzt ihn NICHT auf 'laufend' zurueck",
        nachher.status === F.STATUS_ERFOLG && nachher.letzterErfolgAt === vorher.letzterErfolgAt,
        JSON.stringify(nachher));
      check("Auch der Ausgang im Laufdatensatz faellt nicht auf 'begonnen' zurueck",
        laufNachher.ausgaenge["m-a1"] === F.AUSGANG_ERFOLG, JSON.stringify(laufNachher.ausgaenge));

      // Und der Laufdatensatz eines AELTEREN Laufs verdraengt keinen juengeren.
      await storage.saveCronFairnessState(F.laufAusgangPatch({ cronName: "crawl", laufId: "lauf-neu", startAt: MB_START + 600000, tenantId: "m-b2", ausgang: F.AUSGANG_ERFOLG, nowMs: MB_START + 600000 }), { nowMs: MB_START + 600000, deps: { request: zeile.request } });
      await storage.saveCronFairnessState(F.laufAusgangPatch({ cronName: "crawl", laufId: "lauf-alt", startAt: MB_START, tenantId: "m-c3", ausgang: F.AUSGANG_ERFOLG, nowMs: MB_START + 601000 }), { nowMs: MB_START + 601000, deps: { request: zeile.request } });
      check("Der Nachzuegler eines aelteren LAUFS ersetzt den juengeren Laufdatensatz nicht",
        F.normalizeState(zeile.row).laeufe.crawl.laufId === "lauf-neu",
        JSON.stringify(F.normalizeState(zeile.row).laeufe.crawl.laufId));
    }

    // ═══ 4) Kriterium 3: verschiedene Cron-Namen beschaedigen einander nicht ═══════════════
    abschnitt("4) Bereiche verschiedener Cron-Namen");
    {
      const zeile = zeileMitCas();
      const namen = ["crawl", "pipeline", "lage-check", "morning-briefing"];
      for (const cronName of namen) {
        await storage.saveCronFairnessState(F.finishPatch({
          cronName, tenantId: "m-a1", runId: `lauf-${cronName}`, erfolg: true, startedMs: MB_START, nowMs: MB_START + 1000
        }), { nowMs: MB_START + 1000, deps: { request: zeile.request } });
      }
      // Ein Nachzuegler, dessen Lesestand alle vier NICHT kennt: er wird abgewiesen und
      // wiederholt sich auf dem frischen Stand.
      const stand = F.normalizeState(zeile.row);
      check("Jeder Cron-Bereich traegt seinen eigenen Abschluss",
        namen.every((n) => {
          const e = F.entryOf(stand, n, "m-a1");
          return e && e.status === F.STATUS_ERFOLG && e.letzteLaufkennung === `lauf-${n}`;
        }), JSON.stringify(Object.keys(stand.crons)));
      check("Kein Bereich hat einen anderen ueberschrieben",
        Object.keys(stand.crons).sort().join(",") === "crawl,lage-check,morning-briefing,pipeline");
    }

    // ═══ 5) Kriterium 5: erfolgreich=N nur mit gedecktem Zustand — sonst gemeldete Stoerung ═
    abschnitt("5) Ein gemeldeter Erfolg ohne persistente Deckung wird benannt");
    {
      // Eine Ablage, die GENAU EINEN Abschluss still verschluckt (der Fehlerfall, den es nach
      // dem Fix nicht mehr geben soll — hier kuenstlich erzwungen, um zu pruefen, dass er
      // NICHT unbemerkt bleibt).
      const zeile = zeileMitCas();
      const uhr = uhrAb(MB_START);
      let verschluckt = false;
      const request = async (endpoint, options = {}) => {
        const method = options.method || "GET";
        if ((method === "PATCH" || method === "POST") && !verschluckt) {
          const daten = JSON.parse(options.body).data;
          const bucket = (daten.crons || {})["morning-briefing"] || {};
          if (bucket["m-c3"] && bucket["m-c3"].status === F.STATUS_ERFOLG) {
            verschluckt = true;
            delete bucket["m-c3"];
            if (daten.laeufe && daten.laeufe["morning-briefing"]) delete daten.laeufe["morning-briefing"].ausgaenge["m-c3"];
            return zeile.request(endpoint, { ...options, body: JSON.stringify({ ...JSON.parse(options.body), data: daten }) });
          }
        }
        return zeile.request(endpoint, options);
      };
      const lauf = await F.runTenantsFairly({
        cronName: "morning-briefing",
        tenantIds: MANDATE,
        runId: "lauf-luecke",
        startedMs: MB_START,
        now: uhr.now,
        perTenant: async () => { uhr.vor(1000); return { available: true }; },
        loadState: async () => {
          const gelesen = await storage.readCronFairnessState({ request });
          if (!gelesen.ok) throw new Error(gelesen.fehler);
          return gelesen.state;
        },
        saveState: async (patch, { pruefen = false } = {}) => {
          const geschrieben = await storage.saveCronFairnessState(patch, { nowMs: uhr.now(), pruefen, deps: { request } });
          if (!geschrieben.ok) throw new Error(geschrieben.fehler);
          return geschrieben;
        }
      });
      check("Der kuenstliche Verlust ist wirklich eingetreten", verschluckt === true);
      check("Der Lauf meldet die Abweichung, statt sechs Erfolge unbelegt zu behaupten",
        lauf.fairness.persistenzAbweichung.length > 0
        && lauf.fairness.persistenzAbweichung.some((x) => /m-c3/.test(x)),
        JSON.stringify(lauf.fairness.persistenzAbweichung));
      check("Sie steht zusaetzlich im Zustandsfehler (Protokoll und Systemfehler sehen sie)",
        /persistenz-abweichung/.test(String(lauf.fairness.zustandFehler || "")),
        String(lauf.fairness.zustandFehler));
      check("Der Vermerk steht auch in der Ablage selbst (ein spaeterer Leser sieht ihn)",
        /persistenz-abweichung/.test(String((F.normalizeState(zeile.row).laeufe["morning-briefing"] || {}).zustandFehler || "")),
        JSON.stringify((F.normalizeState(zeile.row).laeufe["morning-briefing"] || {}).zustandFehler));
      check("Der Vermerk hebt den Laufzustand NICHT (er behauptet keinen Abschluss)",
        F.normalizeState(zeile.row).laeufe["morning-briefing"].status === F.LAUF_ABGESCHLOSSEN);
    }

    // ═══ 6) Die reine Gegenprobefunktion ═══════════════════════════════════════════════════
    abschnitt("6) persistenzAbweichungen — die Gegenprobe selbst");
    {
      const start = F.mergeState({}, F.laufStartPatch({ cronName: "crawl", laufId: "L1", startAt: MB_START, nowMs: MB_START, aktive: 2, geplant: ["m-a1", "m-b2"] }), { nowMs: MB_START });
      // Der Stand NACH dem Claim und VOR dem Abschluss — die Signatur des Vorfalls.
      const basis = F.mergeState(start, {
        ...F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L1", nowMs: MB_START }),
        ...F.laufAusgangPatch({ cronName: "crawl", laufId: "L1", startAt: MB_START, tenantId: "m-a1", ausgang: F.AUSGANG_BEGONNEN, nowMs: MB_START })
      }, { nowMs: MB_START });
      const voll = F.mergeState(basis, {
        ...F.finishPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L1", erfolg: true, startedMs: MB_START, nowMs: MB_START + 1000 }),
        ...F.laufAusgangPatch({ cronName: "crawl", laufId: "L1", startAt: MB_START, tenantId: "m-a1", ausgang: F.AUSGANG_ERFOLG, nowMs: MB_START + 1000 })
      }, { nowMs: MB_START + 1000 });

      const gemeinsam = { cronName: "crawl", laufId: "L1", runId: "L1", startedMs: MB_START, nowMs: MB_START + 2000 };
      check("Deckungsgleicher Stand -> keine Abweichung",
        F.persistenzAbweichungen({ stand: voll, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 }).length === 0);
      check("Fehlender Abschluss -> Abweichung mit Kennung und Ist-Zustand",
        F.persistenzAbweichungen({ stand: basis, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 })
          .some((x) => /^ausgang:m-a1:begonnen$/.test(x)));
      check("Fehlende Buchfuehrung wird getrennt benannt",
        F.persistenzAbweichungen({ stand: basis, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 })
          .some((x) => /^buchfuehrung:m-a1:laufend$/.test(x)));
      check("Fehlender Laufdatensatz wird benannt",
        JSON.stringify(F.persistenzAbweichungen({ stand: {}, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 })) === '["laufdatensatz-fehlt"]');
      check("Abweichende Kapazitaet wird benannt",
        F.persistenzAbweichungen({ stand: voll, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 2 })
          .some((x) => /^kapazitaet:1!=2$/.test(x)));
      // Ein NEUERER Lauf desselben Crons darf den Datensatz ersetzen (§11.5) — das ist keine
      // Abweichung. Ein AELTERER darf es nicht.
      const juenger = F.mergeState(voll, F.laufStartPatch({ cronName: "crawl", laufId: "L2", startAt: MB_START + 600000, nowMs: MB_START + 600000, aktive: 1, geplant: ["m-b2"] }), { nowMs: MB_START + 600000 });
      check("Ein juengerer Laufdatensatz ist keine Abweichung (je Cron nur der letzte)",
        F.persistenzAbweichungen({ stand: juenger, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 }).length === 0);
      const aelter = F.mergeState({}, F.laufStartPatch({ cronName: "crawl", laufId: "L0", startAt: MB_START - 600000, nowMs: MB_START - 600000, aktive: 1, geplant: ["m-a1"] }), { nowMs: MB_START });
      check("Ein AELTERER Laufdatensatz an dieser Stelle ist ein Rueckfall und wird benannt",
        F.persistenzAbweichungen({ stand: aelter, ...gemeinsam, erfolgreich: ["m-a1"], kapazitaet: 1 })
          .some((x) => /^laufdatensatz-zurueckgefallen:L0$/.test(x)));
      check("Hat ein FREMDER Lauf das Mandat uebernommen, schweigt die Buchfuehrungspruefung",
        F.persistenzAbweichungen({
          stand: F.mergeState(voll, F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L9", nowMs: MB_START + 5000 }), { nowMs: MB_START + 5000 }),
          ...gemeinsam,
          erfolgreich: ["m-a1"],
          kapazitaet: 1
        }).every((x) => !/^buchfuehrung:/.test(x)));
      check("Die Gegenprobe ist rein (kein IO, kein await, nichts Zufaelliges)",
        typeof F.persistenzAbweichungen === "function"
        && !/require\(|await |Math\.random/.test(F.persistenzAbweichungen.toString()));
    }

    // ═══ 7) Die Ablage selbst: Bedingung, Konflikt, Aufgabe ════════════════════════════════
    abschnitt("7) storage.saveCronFairnessState — bedingtes Schreiben");
    {
      const frisch = zeileMitCas();
      const e1 = await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L1", nowMs: MB_START }), { nowMs: MB_START, deps: { request: frisch.request } });
      check("Die erste Schreibung legt die Zeile per Einfuegen an (rev=1)",
        e1.ok === true && frisch.row.rev === 1 && frisch.verlauf[0].art === "insert", JSON.stringify(frisch.verlauf));
      const e2 = await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-b2", runId: "L1", nowMs: MB_START }), { nowMs: MB_START, deps: { request: frisch.request } });
      check("Jede weitere Schreibung ist ein bedingtes Update und hebt den Zaehler",
        e2.ok === true && frisch.row.rev === 2 && frisch.verlauf[1].art === "update");
      check("Der Normalfall kostet genau ein Lesen und ein Schreiben",
        frisch.lesen === 2 && frisch.schreiben === 2, JSON.stringify({ lesen: frisch.lesen, schreiben: frisch.schreiben }));

      // Dauerhafter Fremdschreiber: nach begrenzten Versuchen ehrlich aufgeben.
      const dauerhaft = zeileMitCas();
      dauerhaft.row = { version: F.FAIRNESS_VERSION, crons: {}, laeufe: {}, rev: 7 };
      const stoerer = {
        request: async (endpoint, options = {}) => {
          const antwort = await dauerhaft.request(endpoint, options);
          if (!options.method || options.method === "GET") dauerhaft.row.rev += 1; // jemand war schneller
          return antwort;
        }
      };
      const verloren = await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L1", nowMs: MB_START }), { nowMs: MB_START, maxVersuche: 3, deps: { request: stoerer.request } });
      check("Ein dauerhafter Wettlauf endet mit ok:false und konflikt:true (statt stillem Verlust)",
        verloren.ok === false && verloren.konflikt === true && /gleichzeitiger-schreibvorgang/.test(String(verloren.fehler)),
        JSON.stringify(verloren));
      check("Er laeuft dabei nicht endlos (genau 3 Schreibversuche)", dauerhaft.schreiben === 3, String(dauerhaft.schreiben));
      check("Und er hat den fremden Stand nicht angetastet",
        Object.keys(F.normalizeState(dauerhaft.row).crons).length === 0);

      // Ein zweiter Einfuege-Versuch auf eine inzwischen existierende Zeile ist ein Konflikt,
      // kein Ueberschreiben.
      const doppelt = zeileMitCas();
      doppelt.row = { version: F.FAIRNESS_VERSION, crons: { crawl: { "m-z9": { status: "erfolgreich", letzterVersuchAt: new Date(MB_START).toISOString() } } }, laeufe: {} };
      const wettlauf = {
        gesehen: 0,
        request: async (endpoint, options = {}) => {
          if (!options.method || options.method === "GET") {
            wettlauf.gesehen += 1;
            // Beim ERSTEN Lesen tut die Attrappe so, als gaebe es die Zeile noch nicht.
            if (wettlauf.gesehen === 1) return [];
          }
          return doppelt.request(endpoint, options);
        }
      };
      const nachKonflikt = await storage.saveCronFairnessState(F.claimPatch({ cronName: "crawl", tenantId: "m-a1", runId: "L1", nowMs: MB_START }), { nowMs: MB_START, deps: { request: wettlauf.request } });
      check("Ein gleichzeitiges Anlegen der Zeile endet im Konflikt und wird wiederholt",
        nachKonflikt.ok === true && nachKonflikt.versuche === 2, JSON.stringify(nachKonflikt.versuche));
      check("Der fremde Eintrag ueberlebt das Anlegen",
        F.entryOf(F.normalizeState(doppelt.row), "crawl", "m-z9") !== null
        && F.entryOf(F.normalizeState(doppelt.row), "crawl", "m-a1") !== null);

      // DSGVO-Loeschung laeuft ueber dieselbe Bedingung.
      const quellcode = fs.readFileSync(path.join(ROOT, "lib", "helmut", "storage.js"), "utf8");
      check("Auch die DSGVO-Loeschung schreibt bedingt (kein zweiter unbedingter Schreiber)",
        /async function deleteCronFairnessTenant[\s\S]{0,1600}schreibeCronFairnessZeile\(request, geschrieben, aktuell\)/.test(quellcode));
      check("Es gibt in der Fairnesszeile keinen unbedingten Schreibpfad mehr",
        // kein Upsert mehr auf diese Zeile und kein direktes Schreiben der lokalen Datei
        // ausserhalb des bedingten Helfers
        !/resolution=merge-duplicates[\s\S]{0,200}cronFairnessRowId\(\)/.test(quellcode)
        && !/writeFileSync\(cronFairnessLocalFile\(\)/.test(quellcode)
        && (quellcode.match(/schreibeCronFairnessZeile\(request, geschrieben, aktuell\)/g) || []).length === 2);
    }

    // ═══ 8) Was dieser Sprint NICHT anfasst ════════════════════════════════════════════════
    abschnitt("8) Unveraenderte Grenzen");
    {
      const fairnessQuelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-fairness.js"), "utf8");
      const serverQuelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
      check("Die Schemaversion bleibt 2 (kein neuer Rollout-Zwang)", F.FAIRNESS_VERSION === 2);
      check("Zeitbudgets unveraendert (270 000 / 240 000 ms)",
        /270000/.test(serverQuelle) && /240000/.test(serverQuelle));
      check("Aeussere Zeitlimits unveraendert (280 000 ms)",
        (serverQuelle.match(/280000/g) || []).length >= 3);
      check("Fristen und Reserven unveraendert",
        F.DEFAULT_STALE_CLAIM_MS === 30 * 60 * 1000
        && F.DEFAULT_TENANT_RESERVE_MS === 15 * 1000
        && F.DEFAULT_TIEBREAK_BUCKET_MS === 6 * 60 * 60 * 1000);
      // Vollstaendiger Abgleich gegen den heutigen Stand — nicht nur der vier
      // Mehrmandanten-Crons: eine geaenderte ODER neu hinzugefuegte Zeile faellt auf.
      check("Cron-Zeiten und -Reihenfolge unveraendert",
        (vercel.crons || []).map((c) => `${c.path}=${c.schedule}`).join("|")
          === [
            "/api/cron/crawl=0 4 * * *",
            "/api/cron/morning-briefing=0 5 * * *",
            "/api/cron/lage-check=0 10 * * *",
            "/api/cron/health-report=0 6 * * *",
            "/api/cron/pipeline=0 16 * * *",
            "/api/cron/crawl=0 20 * * *",
            "/api/cron/understanding=30 5 * * *",
            "/api/cron/lage-briefing=45 5 * * *",
            "/api/cron/understanding=30 21 * * *"
          ].join("|"),
        JSON.stringify(vercel.crons));
      check("Die Reihenfolgelogik ist unangetastet (planTenantOrder unveraendert sortiert)",
        /if \(a\.nieVersucht !== b\.nieVersucht\) return a\.nieVersucht \? -1 : 1;/.test(fairnessQuelle)
        && /if \(a\.los !== b\.los\) return a\.los - b\.los;/.test(fairnessQuelle));
      // PRAEZISIERT (2026-08-08), gleicher Anlass wie in cron-fairness-test.js: der
      // Waechter meint die Cron-/Mandantenrotation, nicht jedes Wort "fairness".
      check("Keine neue Migration (Cron-/Mandantenrotation)",
        !fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
          .some((f) => /cron[_-]?fairness|cron_tenant|tenant_schedule|scheduler/i.test(f)),
        fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
          .filter((f) => /cron[_-]?fairness|cron_tenant|tenant_schedule|scheduler/i.test(f)).join(", "));
      check("Kein Feature-Flag wird gesetzt oder scharfgeschaltet",
        !/HELMUT_CRON_GLOBALPHASE\s*=/.test(fairnessQuelle) && !/process\.env\.HELMUT_CRON_GLOBALPHASE\s*=/.test(serverQuelle));
      check("Die Protokollzeile weist die Gegenprobe aus",
        /abweichung=\$\{\(fairness\.persistenzAbweichung \|\| \[\]\)\.join\(","\) \|\| "-"\}/.test(serverQuelle));
      check("Eine Abweichung erzeugt einen eigenen, zutreffenden Systemfehler",
        /Fairness-Persistenz weicht ab[\s\S]{0,240}NICHT durch die Ablage gedeckt/.test(serverQuelle));
    }
  } finally {
    if (alt.backend === undefined) delete process.env.HELMUT_STORAGE_BACKEND; else process.env.HELMUT_STORAGE_BACKEND = alt.backend;
    if (alt.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = alt.url;
    if (alt.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = alt.key;
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Zwei ueberlappende Crons teilen sich eine Zeile, ohne dass ein Abschluss verloren geht —");
    console.log("und was der Lauf meldet, deckt sich mit dem, was in der Ablage steht.");
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
