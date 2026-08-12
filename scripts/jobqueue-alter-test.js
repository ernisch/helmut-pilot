"use strict";

// Helmut — ALTERSMESSUNG DER WARTESCHLANGE (OP-30, Korrektursprint 2026-08-12).
// =============================================================================================
// WAS DIESE SUITE FESTSCHREIBT:
//
//   Die Abbruchgrenze „ältester offener Auftrag > 24 h" misst ab jetzt die TATSAECHLICHE
//   WARTEZEIT eines bearbeitbaren Auftrags — nicht sein fachliches Faelligkeitsdatum.
//
// ANLASS (Production, 2026-08-11 20:04 UTC, Runbook op30-aktivierung-5-mandate.md §15.5):
//   Der erste Lauf des skalierbaren Pfades erzeugte 235 Auftraege. Alle waren wenige Minuten
//   alt, keiner hing, 0 endgueltige Fehler, 0 Dubletten, 0 verlorene Auftraege — und
//   `betriebsstatus` meldete `zustand=kritisch`, „aeltester offener Auftrag 504 477 s =
//   5,84 Tage". Die verbindliche Abbruchgrenze §8.2 trat ein, K2 und K3 wurden nie begonnen.
//
// URSACHE (hier in Abschnitt 1 reproduziert, an echter PostgreSQL zusaetzlich in
// scripts/jobqueue-alter-datenbank-test.js):
//   `max_mandatsalter_s` mass `now - first_due_at`, also die FAELLIGKEIT. Die liegt
//   bauartbedingt in der Vergangenheit, sobald ein Auftrag in ein bereits laufendes
//   Aktualitaetsfenster faellt — beim 7-Tage-Archivfenster der Personensuchen bis zu
//   6,3 Tage. In Production waren es genau die fuenf `person-archiv`-Auftraege im Fenster
//   `2026-08-06T00Z`.
//
// DIE ZWEI BEGRIFFE (Abschnitt 2 haelt sie auseinander):
//   FAELLIGKEITSRUECKSTAND = now - first_due_at            (Datenbefund, weiter gemeldet)
//   WARTEZEIT              = max(now - max(created_at, first_due_at), 0)   (Betriebsgrenze)
//
// WAS DIESE SUITE AUSDRUECKLICH AUCH PRUEFT: dass echte Ueberalterung NICHT versteckt wird.
// Ein Fix, der nur den Fehlalarm abstellt, waere falsches Gruen (CLAUDE.md §4.4).
//
// OFFLINE: kein Netz, keine Datenbank, keine KI, keine Kosten.

const SP = require("../lib/helmut/scalable-pipeline");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const STUNDE = 3600 * 1000;
const TAG = 24 * STUNDE;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// Eine steuerbare Uhr — Wartezeiten muessen ohne echtes Warten pruefbar sein.
function uhr(startMs = Date.parse("2026-08-11T20:04:00.000Z")) {
  let t = startMs;
  return { jetzt: () => t, vor: (ms) => { t += ms; }, setze: (ms) => { t = ms; } };
}

function auftrag(o = {}) {
  return {
    jobType: "source_fetch",
    idempotencyKey: "k",
    freshnessWindow: "2026-08-11T16Z",
    payload: {},
    priority: 100,
    maxAttempts: 5,
    ...o
  };
}

// Kennzahlen von Hand, fuer die Faelle, die kein Warteschlangenzustand erzeugen kann
// (fehlende Migration, unbrauchbare Zeitwerte aus einer fremden Ablage).
function kennzahlen(o = {}) {
  return {
    wartend: 0, laufend: 0, aktive_leases: 0, erledigt_im_zeitraum: 0,
    fehlgeschlagen_gesamt: 0, endgueltig_fehler: 0, wiederholungen: 0,
    mittlere_dauer_s: null, durchsatz_pro_stunde: 0, nach_typ: {}, nach_status: {},
    aeltester_faelliger_s: 0, ueberfaellige_mandate: 0, max_mandatsalter_s: 0,
    ...o
  };
}
const OHNE_BLOCKIERTE = async () => ({ verfuegbar: true, blockiert: 0, nachTyp: {} });
async function status(kz, extra = {}) {
  return SP.betriebsstatus({
    env: AN,
    deps: { metrics: async () => ({ verfuegbar: true, kennzahlen: kz }), blockierte: OHNE_BLOCKIERTE },
    ...extra
  });
}

async function main() {
  console.log("Helmut — Altersmessung der Warteschlange (OP-30, Korrektursprint 2026-08-12)");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Der Fehlbefund vom 2026-08-11 — reproduziert und behoben");
  {
    // Der exakte Production-Fall: EIN frisch erzeugter Auftrag, dessen fachliche Faelligkeit
    // am Anfang eines laufenden 7-Tage-Archivfensters liegt (2026-08-06T00Z).
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({
      idempotencyKey: "source_fetch|person|m-1|hash|2026-08-06T00Z",
      freshnessWindow: "2026-08-06T00Z",
      tenantId: "m-1",
      priority: 300,
      payload: { art: "person-archiv" },
      dueAt: new Date(Date.parse("2026-08-06T00:00:00.000Z")).toISOString()
    }));

    const roh = await q.metrics(1440);
    const k = roh.kennzahlen;
    const faelligkeitsTage = k.max_mandatsalter_s / 86400;
    check("1.1 ALTE Messung: der frische Auftrag gilt als 5,8 Tage alt (Fehlbefund reproduziert)",
      faelligkeitsTage > 5.8 && faelligkeitsTage < 5.9, `${faelligkeitsTage.toFixed(2)} Tage`);
    check("1.2 ALTE Messung haette ein ueberfaelliges Mandat gemeldet",
      Number(k.ueberfaellige_mandate) === 1, String(k.ueberfaellige_mandate));

    check("1.3 NEUE Messung: die tatsaechliche Wartezeit ist 0 s",
      Number(k.aeltester_offener_s) === 0, String(k.aeltester_offener_s));
    check("1.4 NEUE Messung: kein Mandat ist ueberfaellig",
      Number(k.ueberfaellige_mandate_wartezeit) === 0, String(k.ueberfaellige_mandate_wartezeit));

    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("1.5 Der Betriebszustand ist GRUEN statt kritisch (Abnahmekriterium 1/2)",
      s.zustand === "gruen", `${s.zustand} ${JSON.stringify(s.befunde)}`);
    check("1.6 Gemessen wurde nachweislich die Wartezeit",
      s.altersvertrag === SP.ALTERSVERTRAG_WARTEZEIT
      && s.schwellen.bezug === "wartezeit-ab-bearbeitbarkeit",
      `${s.altersvertrag} / ${s.schwellen.bezug}`);
    check("1.7 Der fachliche Faelligkeitsrueckstand wird trotzdem GEMELDET (kein Vertuschen)",
      Math.round(s.kennzahlen.maxMandatsalterS / 86400) === 6
      && s.befunde.some((b) => b.startsWith("faelligkeitsrueckstand:")),
      `${JSON.stringify(s.befunde)}`);
    check("1.8 …aber er faerbt den Zustand NICHT ein", s.zustand === "gruen", s.zustand);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Die zwei Begriffe sind sauber getrennt");
  {
    const jetzt = Date.parse("2026-08-12T00:00:00.000Z");
    const historisch = {
      created_at: "2026-08-12T00:00:00.000Z",
      first_due_at: "2026-08-06T00:00:00.000Z"
    };
    check("2.1 Bearbeitbar ist der SPAETERE der beiden Zeitpunkte",
      SP.bearbeitbarAbMs(historisch) === Date.parse("2026-08-12T00:00:00.000Z"));
    check("2.2 Wartezeit eines eben erzeugten Auftrags mit historischer Faelligkeit = 0 s",
      SP.wartezeitS(historisch, jetzt) === 0);

    const alt = { created_at: "2026-08-09T00:00:00.000Z", first_due_at: "2026-08-09T00:00:00.000Z" };
    check("2.3 Wartezeit eines wirklich alten Auftrags = 3 Tage",
      SP.wartezeitS(alt, jetzt) === 3 * 86400, String(SP.wartezeitS(alt, jetzt)));

    const zukunft = { created_at: "2026-08-12T00:00:00.000Z", first_due_at: "2026-08-12T06:00:00.000Z" };
    check("2.4 Ein erst spaeter bearbeitbarer Auftrag wartet 0 s, nie negativ",
      SP.wartezeitS(zukunft, jetzt) === 0, String(SP.wartezeitS(zukunft, jetzt)));

    // snake_case UND camelCase, weil Aufrufer beide Formen liefern.
    check("2.5 Beide Feldschreibweisen ergeben dasselbe",
      SP.wartezeitS({ createdAt: alt.created_at, firstDueAt: alt.first_due_at }, jetzt)
      === SP.wartezeitS(alt, jetzt));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Fall a — neuer Auftrag mit historischem Faelligkeitsdatum");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    // Sechs Tage zurueckdatiert — genau die Groessenordnung des Archivfensters.
    await q.enqueue(auftrag({
      idempotencyKey: "a", tenantId: "m-a", freshnessWindow: "2026-08-06T00Z",
      dueAt: new Date(u.jetzt() - 6 * TAG).toISOString()
    }));
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("3.1 Er startet mit Alter 0 (Abnahmekriterium 2)",
      s.kennzahlen.aeltesterOffenerS === 0, String(s.kennzahlen.aeltesterOffenerS));
    check("3.2 Zustand gruen", s.zustand === "gruen", `${s.zustand} ${JSON.stringify(s.befunde)}`);

    // Und er altert danach ganz normal weiter.
    u.vor(19 * STUNDE);
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("3.3 Nach 19 h steht er bei 19 h — nicht bei 6 Tagen + 19 h",
      Math.round(s2.kennzahlen.aeltesterOffenerS / 3600) === 19,
      String(s2.kennzahlen.aeltesterOffenerS / 3600));
    check("3.4 …und wird als Warnung gemeldet", s2.zustand === "warnung", s2.zustand);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Fall b — wirklich alter, weiterhin bearbeitbarer Auftrag (Abnahmekriterium 3)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "b", tenantId: "m-b" }));
    u.vor(25 * STUNDE);
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("4.1 Nach 25 h ist der Zustand kritisch", s.zustand === "kritisch",
      `${s.zustand} ${JSON.stringify(s.befunde)}`);
    check("4.2 Der Befund benennt die Grenze",
      s.befunde.some((b) => /^alter-\d+s-ueber-24h$/.test(b)), JSON.stringify(s.befunde));
    check("4.3 Das Mandat gilt als ueberfaellig",
      s.kennzahlen.ueberfaelligeMandateWartezeit === 1,
      String(s.kennzahlen.ueberfaelligeMandateWartezeit));

    // ADVERSARIAL: ein Auftrag OHNE Mandatsbezug (geteilter Abruf) darf nicht durchrutschen.
    // Die alte Mandatskennzahl sah `tenant_id is null` nie.
    const u2 = uhr();
    const q2 = erzeugeSpeicherWarteschlange({ now: u2.jetzt });
    await q2.enqueue(auftrag({ idempotencyKey: "b2", tenantId: null }));
    u2.vor(25 * STUNDE);
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q2.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("4.4 Auch ein geteilter Auftrag ohne Mandatsbezug loest die Grenze aus",
      s2.zustand === "kritisch", `${s2.zustand} ${JSON.stringify(s2.befunde)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Fall c — Auftrag mit ZUKUENFTIGEM Bearbeitungszeitpunkt");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({
      idempotencyKey: "c", tenantId: "m-c",
      dueAt: new Date(u.jetzt() + 8 * STUNDE).toISOString()
    }));
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("5.1 Ein noch nicht bearbeitbarer Auftrag wartet 0 s",
      s.kennzahlen.aeltesterOffenerS === 0, String(s.kennzahlen.aeltesterOffenerS));
    check("5.2 Nie eine negative Wartezeit", s.kennzahlen.aeltesterOffenerS >= 0);
    u.vor(30 * STUNDE);   // 8 h bis zur Bearbeitbarkeit, danach 22 h Wartezeit
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("5.3 Die Uhr laeuft erst ab der Bearbeitbarkeit (30 h - 8 h = 22 h)",
      Math.round(s2.kennzahlen.aeltesterOffenerS / 3600) === 22,
      String(s2.kennzahlen.aeltesterOffenerS / 3600));
    check("5.4 22 h sind Warnung, noch nicht kritisch", s2.zustand === "warnung", s2.zustand);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Fall d — wiederholter Auftrag nach einem Fehler");
  {
    // DER ENTSCHEIDENDE ADVERSARIALE FALL: `helmut_finish_job` setzt bei einer Wiederholung
    // `due_at = now() + delay`. Wuerde die Wartezeit an `due_at` haengen, koennte ein Auftrag
    // seinen Rueckstand durch wiederholtes Scheitern loeschen — das waere falsches Gruen und
    // genau der Fehler, der am 2026-08-08 schon einmal belegt wurde.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "d", tenantId: "m-d", maxAttempts: 20 }));
    for (let i = 0; i < 12; i += 1) {
      u.vor(3 * STUNDE);
      const c = await q.claim({ owner: "w", limit: 1, leaseMs: 60000 });
      if (!c.auftraege.length) break;
      await q.finish({ id: c.auftraege[0].id, owner: "w", ok: false, error: "HTTP 503", retryDelayMs: 60000 });
    }
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("6.1 Wiederholtes Scheitern loescht den Rueckstand NICHT",
      s.kennzahlen.aeltesterOffenerS >= 24 * 3600,
      `${(s.kennzahlen.aeltesterOffenerS / 3600).toFixed(1)} h`);
    check("6.2 Der Zustand ist kritisch", s.zustand === "kritisch",
      `${s.zustand} ${JSON.stringify(s.befunde)}`);
    check("6.3 Die Versuche wurden wirklich hochgezaehlt (der Fall ist echt)",
      q.alle()[0].attempts >= 10, String(q.alle()[0].attempts));

    // Gegenprobe: gegen `due_at` gemessen waere derselbe Auftrag scheinbar Minuten alt.
    const scheinAlter = (u.jetzt() - Date.parse(q.alle()[0].due_at)) / 3600000;
    check("6.4 Gegenprobe: eine Messung gegen due_at haette < 1 h gemeldet",
      scheinAlter < 1, `${scheinAlter.toFixed(2)} h`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Fall e — aktuell beanspruchter Auftrag mit gueltiger Lease");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "e", tenantId: "m-e" }));
    u.vor(26 * STUNDE);
    const c = await q.claim({ owner: "w", limit: 1, leaseMs: 10 * 60 * 1000 });
    check("7.1 Der Auftrag laeuft mit gueltiger Lease",
      c.auftraege.length === 1 && q.alle()[0].status === "laeuft", q.alle()[0].status);
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("7.2 Ein laufender Auftrag zaehlt weiter als offene Arbeit",
      Math.round(s.kennzahlen.aeltesterOffenerS / 3600) === 26,
      String(s.kennzahlen.aeltesterOffenerS / 3600));
    check("7.3 Die Beanspruchung setzt die Uhr NICHT zurueck", s.zustand === "kritisch", s.zustand);
    check("7.4 Die aktive Lease wird getrennt ausgewiesen", s.kennzahlen.aktiveLeases === 1,
      String(s.kennzahlen.aktiveLeases));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Fall f — abgeschlossener Auftrag");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "f1", tenantId: "m-f" }));
    u.vor(40 * STUNDE);
    const c = await q.claim({ owner: "w", limit: 1, leaseMs: 60000 });
    await q.finish({ id: c.auftraege[0].id, owner: "w", ok: true });
    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("8.1 Ein erledigter Auftrag altert nicht mehr mit",
      s.kennzahlen.aeltesterOffenerS === 0, String(s.kennzahlen.aeltesterOffenerS));
    check("8.2 Der Zustand ist gruen", s.zustand === "gruen",
      `${s.zustand} ${JSON.stringify(s.befunde)}`);

    // ADVERSARIAL: ein ENDGUELTIG gescheiterter Auftrag verschwindet aus der Altersmessung —
    // er darf aber nicht aus dem Zustand verschwinden.
    const u2 = uhr();
    const q2 = erzeugeSpeicherWarteschlange({ now: u2.jetzt });
    await q2.enqueue(auftrag({ idempotencyKey: "f2", tenantId: "m-f2", maxAttempts: 1 }));
    const c2 = await q2.claim({ owner: "w", limit: 1, leaseMs: 60000 });
    await q2.finish({ id: c2.auftraege[0].id, owner: "w", ok: false, error: "HTTP 404" });
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q2.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("8.3 Ein endgueltiger Fehler bleibt kritisch, obwohl das Alter 0 ist",
      s2.zustand === "kritisch" && s2.kennzahlen.aeltesterOffenerS === 0,
      `${s2.zustand} alter=${s2.kennzahlen.aeltesterOffenerS}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Fall g — fehlende oder ungewoehnliche Zeitwerte");
  {
    check("9.1 Ohne jede Zeitangabe wird 0 gemeldet, nicht NaN",
      SP.wartezeitS({}, Date.now()) === 0);
    check("9.2 Unparsebare Zeitwerte ergeben 0, nicht NaN",
      SP.wartezeitS({ created_at: "keine-zeit", first_due_at: "auch-nicht" }, Date.now()) === 0);
    check("9.3 Fehlt `created_at`, traegt `first_due_at` die Messung",
      SP.wartezeitS({ first_due_at: "2026-08-11T00:00:00.000Z" },
        Date.parse("2026-08-12T00:00:00.000Z")) === 86400);
    check("9.4 Fehlt `first_due_at`, traegt `created_at` die Messung",
      SP.wartezeitS({ created_at: "2026-08-11T00:00:00.000Z" },
        Date.parse("2026-08-12T00:00:00.000Z")) === 86400);
    check("9.5 Eine Uhr, die zurueckspringt, ergibt 0 statt einer negativen Wartezeit",
      SP.wartezeitS({ created_at: "2026-08-12T00:00:00.000Z" },
        Date.parse("2026-08-11T00:00:00.000Z")) === 0);

    // FEHLENDE MIGRATION: nicht raten, nicht gruenrechnen — den alten Vertrag benennen.
    const alt = await status(kennzahlen({ max_mandatsalter_s: 504477, ueberfaellige_mandate: 1 }));
    check("9.6 Ohne die Wartezeit-Spalten gilt ausdruecklich der ALTE Vertrag",
      alt.altersvertrag === SP.ALTERSVERTRAG_ALT
      && alt.schwellen.bezug === "faelligkeit-first-due-at",
      `${alt.altersvertrag} / ${alt.schwellen.bezug}`);
    check("9.7 Das wird als Befund BENANNT, nicht verschwiegen",
      alt.befunde.some((b) => b.startsWith("altersmessung-alt:")), JSON.stringify(alt.befunde));
    check("9.8 Der alte Vertrag bleibt streng (Fehlalarm statt falschem Gruen)",
      alt.zustand === "kritisch", alt.zustand);
    check("9.9 Nicht gemessene Wartezeit ist `null`, nicht 0",
      alt.kennzahlen.aeltesterOffenerS === null
      && alt.kennzahlen.ueberfaelligeMandateWartezeit === null,
      JSON.stringify([alt.kennzahlen.aeltesterOffenerS, alt.kennzahlen.ueberfaelligeMandateWartezeit]));

    // ADVERSARIAL: eine HALBE Lieferung darf nicht als neuer Vertrag durchgehen.
    const halb = await status(kennzahlen({ aeltester_offener_s: 0, max_mandatsalter_s: 504477 }));
    check("9.10 Zwei von drei Wartezeit-Spalten reichen NICHT fuer den neuen Vertrag",
      halb.altersvertrag === SP.ALTERSVERTRAG_ALT, halb.altersvertrag);

    // ADVERSARIAL: 0 ist ein gueltiger Messwert und darf nicht als „fehlt" gelesen werden.
    const nullwerte = await status(kennzahlen({
      aeltester_offener_s: 0, max_mandatswartezeit_s: 0, ueberfaellige_mandate_wartezeit: 0
    }));
    check("9.11 Lauter Nullen sind eine MESSUNG, kein fehlender Vertrag",
      nullwerte.altersvertrag === SP.ALTERSVERTRAG_WARTEZEIT && nullwerte.zustand === "gruen",
      `${nullwerte.altersvertrag} ${nullwerte.zustand}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("10 · Fall h — mehrere Mandate mit unterschiedlich alten Auftraegen");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    // m-alt: seit 30 h wartend. m-neu: gerade erzeugt, aber mit 6 Tage altem Quelldatum.
    await q.enqueue(auftrag({ idempotencyKey: "h-alt", tenantId: "m-alt" }));
    u.vor(30 * STUNDE);
    await q.enqueue(auftrag({
      idempotencyKey: "h-neu", tenantId: "m-neu", freshnessWindow: "2026-08-06T00Z",
      dueAt: new Date(u.jetzt() - 6 * TAG).toISOString()
    }));
    await q.enqueue(auftrag({ idempotencyKey: "h-frisch", tenantId: "m-frisch" }));

    const s = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("10.1 Genau EIN Mandat gilt als ueberfaellig",
      s.kennzahlen.ueberfaelligeMandateWartezeit === 1,
      String(s.kennzahlen.ueberfaelligeMandateWartezeit));
    check("10.2 Das Alter ist das des wirklich alten Mandats (30 h)",
      Math.round(s.kennzahlen.maxMandatswartezeitS / 3600) === 30,
      String(s.kennzahlen.maxMandatswartezeitS / 3600));
    check("10.3 Der Zustand ist kritisch — echte Ueberalterung wird nicht versteckt",
      s.zustand === "kritisch", `${s.zustand} ${JSON.stringify(s.befunde)}`);
    check("10.4 Die alte Faelligkeitssicht haette ZWEI Mandate gemeldet (Gegenprobe)",
      s.kennzahlen.ueberfaelligeMandate === 2, String(s.kennzahlen.ueberfaelligeMandate));

    // Wird das wirklich alte Mandat abgearbeitet, faellt der Zustand zurueck —
    // das zurueckdatierte Mandat allein haelt ihn NICHT kritisch.
    // (Die Reservierung sortiert nach `due_at`; der zurueckdatierte Auftrag kommt deshalb
    // zuerst. Hier wird ausdruecklich der ALTE Auftrag abgeschlossen.)
    const c = await q.claim({ owner: "w", limit: 3, leaseMs: 60000 });
    const alter = c.auftraege.find((a) => a.tenant_id === "m-alt");
    check("10.4b Der wirklich alte Auftrag wurde reserviert", Boolean(alter),
      JSON.stringify(c.auftraege.map((a) => a.tenant_id)));
    await q.finish({ id: alter.id, owner: "w", ok: true });
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("10.5 Nach Abarbeitung des alten Mandats ist der Zustand nicht mehr kritisch",
      s2.zustand !== "kritisch", `${s2.zustand} ${JSON.stringify(s2.befunde)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("11 · Die Grenze bleibt geschlossen (Abnahmekriterium 6)");
  {
    // Genau an der Grenze: 24 h sind kritisch, 23:59 h nicht.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "g1", tenantId: "m-g" }));
    u.vor(24 * STUNDE - 60000);
    const knappDrunter = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    u.vor(60000);
    const genau = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics, blockierte: OHNE_BLOCKIERTE } });
    check("11.1 Eine Minute vor 24 h: Warnung, nicht kritisch",
      knappDrunter.zustand === "warnung", knappDrunter.zustand);
    check("11.2 Bei exakt 24 h: kritisch", genau.zustand === "kritisch", genau.zustand);
    check("11.3 Die Schwellen selbst sind unveraendert (18 h / 24 h)",
      SP.WARN_ALTER_S === 18 * 3600 && SP.KRITISCH_ALTER_S === 24 * 3600);

    // Eine nicht lesbare Warteschlange bleibt „unbekannt", nicht gruen.
    const unlesbar = await SP.betriebsstatus({
      env: AN, deps: { metrics: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) }
    });
    check("11.4 Eine nicht lesbare Warteschlange ist weiterhin `unbekannt`",
      unlesbar.zustand === "unbekannt" && unlesbar.verfuegbar === false, unlesbar.zustand);

    // MUTATIONSPROBE: haette man statt `greatest(created, first_due)` einfach `created_at`
    // genommen, waere Fall c (Zukunft) falsch. Haette man `first_due_at` genommen, waere
    // Fall a falsch. Beide Fassungen werden hier gegen dieselbe Zeile geprueft.
    const zeile = { created_at: "2026-08-12T00:00:00.000Z", first_due_at: "2026-08-06T00:00:00.000Z" };
    const jetzt = Date.parse("2026-08-12T01:00:00.000Z");
    check("11.5 Mutation 'nur first_due_at' waere um 6 Tage daneben",
      (jetzt - Date.parse(zeile.first_due_at)) / 1000 - SP.wartezeitS(zeile, jetzt) > 5 * 86400);
    const zeile2 = { created_at: "2026-08-11T00:00:00.000Z", first_due_at: "2026-08-12T12:00:00.000Z" };
    check("11.6 Mutation 'nur created_at' waere bei kuenftiger Faelligkeit zu gross",
      SP.wartezeitS(zeile2, jetzt) === 0
      && (jetzt - Date.parse(zeile2.created_at)) / 1000 > 0);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
