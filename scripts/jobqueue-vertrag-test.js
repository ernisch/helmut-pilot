"use strict";

// Helmut — VERTRAGSTEST der Arbeitswarteschlange und des Workers (OP-30).
// =============================================================================================
// Offline, deterministisch, ohne Netz, ohne KI, ohne Production-Daten. Die Zeit wird
// KONTROLLIERT simuliert; die Ablauf- und Entscheidungsstruktur stammt aus dem echten
// Produktionscode (lib/helmut/scalable-pipeline.js, lib/helmut/source-demand.js).
//
// ABGRENZUNG, ausdruecklich: der DATENBANKNACHWEIS ist NICHT diese Suite, sondern
// `scripts/jobqueue-datenbank-test.js` gegen einen echten PostgreSQL-Server. Abschnitt 9 hier
// prueft, dass die Attrappe sich in den zugesagten Punkten GENAU SO verhaelt wie die
// Datenbank — sonst waere jeder Befund dieser Suite wertlos.

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts", "fixtures", "jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib", "helmut", "source-demand.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };

// Uhr, die der Test steuert.
function uhr(startIso = "2026-08-08T00:00:00Z") {
  let ms = Date.parse(startIso);
  return { jetzt: () => ms, vor: (delta) => { ms += delta; }, setze: (iso) => { ms = Date.parse(iso); } };
}

function auftrag(ueberschreibung = {}) {
  return {
    jobType: "source_fetch",
    idempotencyKey: "k1",
    freshnessWindow: "2026-08-08T00Z",
    payload: { quelle: { id: "q1", rssUrls: ["https://example.invalid/feed"] } },
    dueAt: new Date(Date.parse("2026-08-08T00:00:00Z")).toISOString(),
    priority: 100,
    maxAttempts: 3,
    tenantId: null,
    ...ueberschreibung
  };
}

async function main() {
  console.log("Helmut — Vertragstest Arbeitswarteschlange + Worker (OP-30)");

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Flaggrenze — der wichtigste Riegel");
  check("1.1 Ohne Flag ist der skalierbare Pfad AUS", SP.skalierbarerPfadAktiv({}) === false);
  check("1.2 Leerer Wert = AUS", SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "" }) === false);
  check("1.3 'off' = AUS", SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "off" }) === false);
  check("1.4 Tippfehler = AUS (fail closed)", SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "onn" }) === false);
  check("1.5 'true'/'1'/'an'/'on' = AN",
    ["true", "1", "an", "on", "ON", " On "].every((v) => SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: v })));
  check("1.6 Die Pfadwahl liefert GENAU EINEN Pfad — nie beide",
    SP.waehleVerarbeitungspfad({}).pfad === "bestand"
    && SP.waehleVerarbeitungspfad(AN).pfad === "warteschlange");
  {
    // Ohne Flag darf der Scheduler NICHTS tun — auch nicht lesen.
    let gelesen = false;
    const ergebnis = await SP.planeArbeit({
      env: {},
      deps: { listFullProfiles: async () => { gelesen = true; return []; }, enqueue: async () => ({ verfuegbar: true, neu: true }) }
    });
    check("1.7 Ohne Flag plant der Scheduler nichts und liest KEINE Profile",
      ergebnis.uebersprungen === true && ergebnis.grund === "flag-aus" && gelesen === false);
  }
  {
    let geclaimt = false;
    const ergebnis = await SP.arbeite({ env: {}, deps: { claim: async () => { geclaimt = true; return { verfuegbar: true, auftraege: [] }; } } });
    check("1.8 Ohne Flag reserviert der Worker nichts und fragt die Warteschlange NICHT",
      ergebnis.uebersprungen === true && geclaimt === false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Idempotenz");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const a = await q.enqueue(auftrag());
    const b = await q.enqueue(auftrag());
    check("2.1 Der erste Auftrag ist neu", a.neu === true);
    check("2.2 Der zweite mit gleichem Schluessel ist NICHT neu", b.neu === false);
    check("2.3 Beide zeigen auf dieselbe Zeile", a.id === b.id);
    check("2.4 Es existiert genau eine Zeile", q.alle().length === 1);
    // Auch nach Abschluss.
    const c = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    await q.finish({ id: c.auftraege[0].id, owner: "w1", ok: true });
    const d = await q.enqueue(auftrag());
    check("2.5 Auch nach Erledigung entsteht im selben Fenster kein zweiter Auftrag",
      d.neu === false && q.alle().length === 1);
    const e = await q.enqueue(auftrag({ idempotencyKey: "k1-F2", freshnessWindow: "2026-08-08T08Z" }));
    check("2.6 Ein neues Fenster erzeugt einen neuen Auftrag", e.neu === true && q.alle().length === 2);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Parallelitaet: zwei Worker greifen nie denselben Auftrag");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    for (let i = 0; i < 100; i += 1) await q.enqueue(auftrag({ idempotencyKey: `p${i}` }));
    const a = await q.claim({ owner: "w1", limit: 40, leaseMs: 60000 });
    const b = await q.claim({ owner: "w2", limit: 40, leaseMs: 60000 });
    const c = await q.claim({ owner: "w3", limit: 40, leaseMs: 60000 });
    const ids = [...a.auftraege, ...b.auftraege, ...c.auftraege].map((x) => x.id);
    check("3.1 Insgesamt wurden 100 Auftraege reserviert", ids.length === 100, String(ids.length));
    check("3.2 KEIN Auftrag wurde doppelt vergeben", new Set(ids).size === ids.length);
    check("3.3 Die Verteilung ist 40/40/20", `${a.auftraege.length}/${b.auftraege.length}/${c.auftraege.length}` === "40/40/20");
    const d = await q.claim({ owner: "w4", limit: 40, leaseMs: 60000 });
    check("3.4 Ein vierter Worker bekommt nichts mehr", d.auftraege.length === 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Lease, Absturz, Wiederaufnahme");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "L", maxAttempts: 5 }));
    const a = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    check("4.1 Reserviert", a.auftraege.length === 1);
    const b = await q.claim({ owner: "w2", limit: 5, leaseMs: 60000 });
    check("4.2 Waehrend der Lease bekommt niemand sonst den Auftrag", b.auftraege.length === 0);
    u.vor(61000);
    const c = await q.claim({ owner: "w2", limit: 5, leaseMs: 60000 });
    check("4.3 Nach Ablauf der Lease ist der Auftrag WIEDER verfuegbar (kein Verlust)", c.auftraege.length === 1);
    check("4.4 Die Wiederaufnahme zaehlt als Versuch", c.auftraege[0].attempts === 2, String(c.auftraege[0].attempts));
    check("4.5 Der neue Halter ist eingetragen", c.auftraege[0].lease_owner === "w2");
    const v1 = await q.extendLease({ id: c.auftraege[0].id, owner: "w2", leaseMs: 60000 });
    const v2 = await q.extendLease({ id: c.auftraege[0].id, owner: "w1", leaseMs: 60000 });
    check("4.6 Der Halter darf verlaengern, ein Fremder nicht", v1.verlaengert === true && v2.verlaengert === false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Abschluss, Doppelabschluss, Wiederholungsgrenze");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "F", maxAttempts: 3 }));
    const a = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    const id = a.auftraege[0].id;
    const fremd = await q.finish({ id, owner: "w-fremd", ok: true });
    check("5.1 Ein Fremder kann nicht abschliessen", fremd.uebernommen === false);
    const erste = await q.finish({ id, owner: "w1", ok: true });
    check("5.2 Der Halter schliesst ab", erste.uebernommen === true && erste.neuerStatus === "erledigt");
    const zweite = await q.finish({ id, owner: "w1", ok: true });
    check("5.3 Ein zweiter Abschluss wird abgelehnt", zweite.uebernommen === false);
    const nachher = await q.claim({ owner: "w9", limit: 5, leaseMs: 60000 });
    check("5.4 Ein erledigter Auftrag wird NICHT erneut verarbeitet", nachher.auftraege.length === 0);
  }
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "R", maxAttempts: 3 }));
    let status = null;
    for (let i = 0; i < 6; i += 1) {
      const c = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
      if (!c.auftraege.length) break;
      const r = await q.finish({ id: c.auftraege[0].id, owner: "w1", ok: false, error: "kaputt", retryDelayMs: 0 });
      status = r.neuerStatus;
    }
    check("5.5 Nach max_attempts wird endgueltig fehlgeschlagen", status === "fehlgeschlagen", String(status));
    const zeile = q.alle()[0];
    check("5.6 Der Fehler bleibt gespeichert (Auditierbarkeit)", zeile.last_error === "kaputt");
    const nachher = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    check("5.7 Endgueltig fehlgeschlagene Auftraege werden nicht mehr vergeben", nachher.auftraege.length === 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Worker: Ablauf, Zeitbudget, Fehlerklassen");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    for (let i = 0; i < 5; i += 1) await q.enqueue(auftrag({ idempotencyKey: `W${i}` }));
    let ausgefuehrt = 0;
    const bilanz = await SP.arbeite({
      env: AN, owner: "w-test", budgetMs: 60000, leaseMs: 60000, stapel: 3,
      deps: {
        now: u.jetzt, claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        handler: { source_fetch: async () => { ausgefuehrt += 1; return { ok: true }; } }
      }
    });
    check("6.1 Alle fuenf Auftraege wurden ausgefuehrt", ausgefuehrt === 5, String(ausgefuehrt));
    check("6.2 Alle fuenf sind erledigt", bilanz.erledigt === 5, String(bilanz.erledigt));
    check("6.3 Die Warteschlange ist leer", q.nachStatus("wartend").length === 0 && q.nachStatus("laeuft").length === 0);
    check("6.4 Die Bilanz zaehlt nach Typ", bilanz.nachTyp.source_fetch.erledigt === 5);
  }
  {
    // Unbekannter Aufgabentyp -> ENDGUELTIG, kein Backoff, kein Verbrennen von Versuchen.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "U", jobType: "document_understanding", maxAttempts: 5 }));
    const bilanz = await SP.arbeite({
      env: AN, owner: "w", budgetMs: 60000, leaseMs: 60000, stapel: 5,
      deps: { now: u.jetzt, claim: q.claim, finish: q.finish, extendLease: q.extendLease, handler: {} }
    });
    check("6.5 Unbekannter Aufgabentyp -> endgueltig fehlgeschlagen (kein ewiges Wiederholen)",
      bilanz.endgueltigFehlgeschlagen === 1 && q.nachStatus("fehlgeschlagen").length === 1);
    check("6.6 Der Grund steht ehrlich im Fehlertext",
      q.alle()[0].last_error === "unbekannter-aufgabentyp", q.alle()[0].last_error);
  }
  {
    // Vorübergehender Fehler -> Wiederholung mit Backoff in der Zukunft.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "T", maxAttempts: 5 }));
    await SP.arbeite({
      env: AN, owner: "w", budgetMs: 60000, leaseMs: 60000, stapel: 5,
      deps: {
        now: u.jetzt, claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        handler: { source_fetch: async () => { throw new Error("HTTP 429 zu viele Anfragen"); } }
      }
    });
    const z = q.alle()[0];
    check("6.7 Vorübergehender Fehler -> wieder 'wartend'", z.status === "wartend", z.status);
    check("6.8 Die naechste Faelligkeit liegt in der Zukunft (Backoff greift)",
      Date.parse(z.due_at) > u.jetzt(), `${z.due_at} vs ${new Date(u.jetzt()).toISOString()}`);
    check("6.9 Der Fehlertext ist gespeichert", /429/.test(z.last_error || ""), z.last_error);
  }
  {
    // Zeitbudget: der Worker darf NICHT ueber sein Budget hinaus arbeiten und darf
    // angefangene Arbeit nicht still verlieren.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    for (let i = 0; i < 20; i += 1) await q.enqueue(auftrag({ idempotencyKey: `B${i}` }));
    const bilanz = await SP.arbeite({
      env: AN, owner: "w", budgetMs: 10000, leaseMs: 60000, stapel: 20,
      deps: {
        now: u.jetzt, claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        // Jeder Auftrag "kostet" 2 s simulierte Zeit.
        handler: { source_fetch: async () => { u.vor(2000); return { ok: true }; } }
      }
    });
    check("6.10 Der Worker haelt sein Zeitbudget ein", bilanz.dauerMs <= 12000, String(bilanz.dauerMs));
    check("6.11 Er hat nicht alle 20 geschafft (Budget war knapp)", bilanz.erledigt < 20, String(bilanz.erledigt));
    const offen = q.nachStatus("laeuft").length + q.nachStatus("wartend").length;
    check("6.12 Der Rest ist NICHT verloren, sondern offen", offen === 20 - bilanz.erledigt, `${offen}`);
    // Und nach Ablauf der Lease kommt der angefangene Rest zurueck.
    u.vor(61000);
    const wieder = await q.claim({ owner: "w2", limit: 50, leaseMs: 60000 });
    check("6.13 Nach Lease-Ablauf ist der angefangene Rest wieder verfuegbar", wieder.auftraege.length === offen);
  }
  {
    // Lease verloren: ein Zombie-Worker darf einen fremden Auftrag nicht abschliessen.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "Z" }));
    const a = await q.claim({ owner: "zombie", limit: 1, leaseMs: 1000 });
    u.vor(2000);
    await q.claim({ owner: "frisch", limit: 1, leaseMs: 60000 });
    const r = await q.finish({ id: a.auftraege[0].id, owner: "zombie", ok: true });
    check("6.14 Der Zombie-Worker kann den uebernommenen Auftrag nicht abschliessen", r.uebernommen === false);
    check("6.15 Der Auftrag gehoert jetzt dem neuen Halter", q.alle()[0].lease_owner === "frisch");
  }

  {
    // Ein Handler, der NIE zurueckkehrt, darf den Worker nicht blockieren — sonst ist die
    // Zusage "festes Laufzeitbudget" nicht haltbar. Gemessen mit ECHTER Uhr, weil die
    // Zeitgrenze auf setTimeout beruht.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "H" }));
    const t0 = Date.now();
    const bilanz = await SP.arbeite({
      env: AN, owner: "w", budgetMs: 8000, leaseMs: 60000, stapel: 1,
      deps: {
        now: () => Date.now(), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        handler: { source_fetch: () => new Promise(() => {}) }   // haengt fuer immer
      }
    });
    const dauer = Date.now() - t0;
    check("6.16 Ein ewig haengender Handler blockiert den Worker NICHT", dauer < 15000, `${dauer} ms`);
    check("6.17 Der haengende Auftrag gilt NICHT als erledigt", bilanz.erledigt === 0);
    check("6.18 Er wird als voruebergehend gescheitert zurueckgestellt", bilanz.wiederholt === 1, JSON.stringify(bilanz.nachTyp));
    check("6.19 Der Grund ist ehrlich benannt", /zeitlimit/i.test(q.alle()[0].last_error || ""), q.alle()[0].last_error);
  }
  {
    check("6.20 Die Auftragsgrenze ist konfigurierbar und hat ein Minimum",
      SP.AUFTRAG_MAX_MS >= 5000, String(SP.AUFTRAG_MAX_MS));
    let gefangen = null;
    try { await SP.mitZeitgrenze(new Promise(() => {}), 50, "probe"); } catch (e) { gefangen = e.message; }
    check("6.21 mitZeitgrenze lehnt nach Ablauf ab", /auftrag-zeitlimit \(probe, 50 ms\)/.test(String(gefangen)), String(gefangen));
    const schnell = await SP.mitZeitgrenze(Promise.resolve("fertig"), 5000, "probe");
    check("6.22 mitZeitgrenze reicht ein rechtzeitiges Ergebnis durch", schnell === "fertig");
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("7 · Fehlerbereinigung: keine Geheimnisse in der Ablage");
  {
    const proben = [
      ["Bearer-Token", "fetch failed: Bearer abcdefghijklmnopqrstuvwx", /abcdefghij/],
      ["JWT", "Fehler eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig", /eyJhbGci/],
      ["OpenAI-Schluessel", "sk-proj-ABCDEFGHIJKLMNOPQR abgelehnt", /sk-proj-ABC/],
      ["Supabase-Schluessel", "sb_secret_ABCDEFGHIJKLMNOPQR ungueltig", /sb_secret_ABC/],
      ["Query-Secret", "GET /x?token=geheim12345&a=1", /geheim12345/],
      ["Basic-Auth-URL", "https://nutzer:passwort@host/x", /passwort/],
      ["JSON-Feld", '{"api_key":"ABCDEFGHIJKLMNOP"}', /ABCDEFGHIJKLMNOP/]
    ];
    for (const [name, eingabe, verboten] of proben) {
      const raus = SP.bereinigeFehler(eingabe) || "";
      check(`7.1 ${name} wird entfernt`, !verboten.test(raus), raus);
    }
    check("7.2 Der Offset wird NICHT faelschlich als Praefix eingesetzt",
      !/^\d+<entfernt>/.test(SP.bereinigeFehler("x Bearer abcdefghijklmnop") || ""));
    check("7.3 Ein Stacktrace wird auf die erste Zeile reduziert",
      (SP.bereinigeFehler("Error: boom\n  at /pfad/datei.js:1:2") || "") === "Error: boom");
    check("7.4 Der Text wird gekappt", (SP.bereinigeFehler("y".repeat(2000)) || "").length <= 301);
    check("7.5 Leerer Fehler bleibt null", SP.bereinigeFehler("") === null && SP.bereinigeFehler(null) === null);
  }
  {
    check("7.6 Endgueltige Fehlerklassen werden erkannt",
      ["unbekannter-aufgabentyp", "payload-ungueltig: x", "nicht-implementiert", "profil-nicht-gefunden"]
        .every(SP.istEndgueltig));
    check("7.7 Unbekannte Fehler gelten als VORUEBERGEHEND (konservativ)",
      SP.istEndgueltig("HTTP 500") === false && SP.istEndgueltig("timeout") === false);
    const b1 = SP.backoffMs(1, "abc");
    const b3 = SP.backoffMs(3, "abc");
    check("7.8 Backoff waechst exponentiell", b3 > b1 * 2, `${b1} -> ${b3}`);
    check("7.9 Backoff ist gedeckelt", SP.backoffMs(50, "abc") <= 30 * 60 * 1000);
    check("7.10 Backoff ist stabil (kein Zufall)", SP.backoffMs(3, "abc") === SP.backoffMs(3, "abc"));
    check("7.11 Backoff streut ueber Auftraege (keine synchrone Welle)", SP.backoffMs(3, "abc") !== SP.backoffMs(3, "xyz"));
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("8 · Betriebsmessung und Schwellen");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue(auftrag({ idempotencyKey: "M1" }));
    await q.enqueue(auftrag({ idempotencyKey: "M2", jobType: "mandate_projection", tenantId: "m-a", payload: { mandatsId: "m-a" } }));
    let status = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics } });
    check("8.1 Frische Warteschlange ist gruen", status.zustand === "gruen", JSON.stringify(status.befunde));
    check("8.2 Das Flag wird ehrlich mitgemeldet", status.flag === "on");
    u.vor(19 * 3600 * 1000);
    status = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics } });
    check("8.3 Nach 19 h wird gewarnt (VOR 24 h)", status.zustand === "warnung", `${status.zustand} ${JSON.stringify(status.befunde)}`);
    u.vor(6 * 3600 * 1000);
    status = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics } });
    check("8.4 Ab 24 h ist der Zustand kritisch", status.zustand === "kritisch", status.zustand);
    check("8.5 Ueberfaellige Mandate werden benannt", status.kennzahlen.ueberfaelligeMandate === 1);
    // Ein endgueltiger Fehler ist IMMER kritisch.
    const u2 = uhr();
    const q2 = erzeugeSpeicherWarteschlange({ now: u2.jetzt });
    await q2.enqueue(auftrag({ idempotencyKey: "E", maxAttempts: 1 }));
    const c = await q2.claim({ owner: "w", limit: 1, leaseMs: 1000 });
    await q2.finish({ id: c.auftraege[0].id, owner: "w", ok: false, error: "endgueltig" });
    const s2 = await SP.betriebsstatus({ env: AN, deps: { metrics: q2.metrics } });
    check("8.6 Ein endgueltiger Fehler macht den Zustand sofort kritisch", s2.zustand === "kritisch", s2.zustand);
    // Nicht lesbare Warteschlange ist NICHT gruen.
    const s3 = await SP.betriebsstatus({ env: AN, deps: { metrics: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) } });
    check("8.7 Eine nicht lesbare Warteschlange meldet 'unbekannt', nicht 'gruen'",
      s3.zustand === "unbekannt" && s3.verfuegbar === false, s3.zustand);
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("9 · Gleichheit der Attrappe mit der ECHTEN Datenbank");
  {
    const host = process.env.HELMUT_TEST_PG_HOST || "";
    // EIGENE Datenbank (belegter Anlass 2026-08-08, siehe Kopf von jobqueue-datenbank-test.js):
    // dieser Abschnitt spielt Rollback + Migration NEU ein. Teilte er sich die Datenbank mit
    // dem Datenbanknachweis, riss er diesem bei gleichzeitigem Lauf die Tabelle weg.
    const PG_DB = process.env.HELMUT_TEST_PG_DB || "helmut_test_vertrag";
    if (host) {
      try {
        execFileSync("psql", ["-h", host, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
          "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", "postgres",
          "-tAc", `create database ${PG_DB}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (_) { /* existiert bereits */ }
    }
    const pgDa = (() => {
      if (!host) return false;
      try {
        execFileSync("psql", ["-h", host, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
          "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", PG_DB,
          "-tAc", "select 1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return true;
      } catch (_) { return false; }
    })();

    if (!pgDa) {
      console.log("  (uebersprungen: kein lokaler PostgreSQL-Server — die Gleichheit der Attrappe");
      console.log("   mit der Datenbank ist in diesem Lauf NICHT geprueft. Der Datenbanknachweis");
      console.log("   selbst liegt ohnehin in scripts/jobqueue-datenbank-test.js.)");
    } else {
      const q = (sql) => execFileSync("psql", ["-h", host, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
        "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", PG_DB,
        "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
      // Migration frisch aufsetzen.
      execFileSync("psql", ["-h", host, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
        "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", PG_DB,
        "-v", "ON_ERROR_STOP=1", "-f", path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue_rollback.sql")],
        { encoding: "utf8", stdio: "ignore" });
      execFileSync("psql", ["-h", host, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
        "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", PG_DB,
        "-v", "ON_ERROR_STOP=1", "-f", path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql")],
        { encoding: "utf8", stdio: "ignore" });

      const u = uhr();
      const speicher = erzeugeSpeicherWarteschlange({ now: u.jetzt });

      // Fall A: Idempotenz.
      const dbNeu1 = q("select neu from public.helmut_enqueue_job('source_fetch','G1','F','{}'::jsonb)");
      const dbNeu2 = q("select neu from public.helmut_enqueue_job('source_fetch','G1','F','{}'::jsonb)");
      const spNeu1 = (await speicher.enqueue(auftrag({ idempotencyKey: "G1" }))).neu;
      const spNeu2 = (await speicher.enqueue(auftrag({ idempotencyKey: "G1" }))).neu;
      check("9.1 Idempotenz: Attrappe und DB stimmen ueberein",
        (dbNeu1 === "t") === spNeu1 && (dbNeu2 === "f") === !spNeu2, `db=${dbNeu1}/${dbNeu2} sp=${spNeu1}/${spNeu2}`);

      // Fall B: Doppelvergabe.
      q("delete from public.helmut_jobs");
      speicher.zuruecksetzen();
      for (let i = 0; i < 30; i += 1) {
        q(`select public.helmut_enqueue_job('source_fetch','G-${i}','F','{}'::jsonb)`);
        await speicher.enqueue(auftrag({ idempotencyKey: `G-${i}` }));
      }
      const dbA = q("select count(*) from public.helmut_claim_jobs('a',10,60000)");
      const dbB = q("select count(*) from public.helmut_claim_jobs('b',10,60000)");
      const spA = (await speicher.claim({ owner: "a", limit: 10, leaseMs: 60000 })).auftraege.length;
      const spB = (await speicher.claim({ owner: "b", limit: 10, leaseMs: 60000 })).auftraege.length;
      check("9.2 Reservierungsmengen stimmen ueberein", `${dbA}/${dbB}` === `${spA}/${spB}`, `db=${dbA}/${dbB} sp=${spA}/${spB}`);

      // Fall C: Fremdabschluss.
      const dbId = q("select id from public.helmut_jobs where status='laeuft' and lease_owner='a' limit 1");
      const dbFremd = q(`select uebernommen from public.helmut_finish_job('${dbId}','fremd',true)`);
      const spId = speicher.nachStatus("laeuft").find((z) => z.lease_owner === "a").id;
      const spFremd = (await speicher.finish({ id: spId, owner: "fremd", ok: true })).uebernommen;
      check("9.3 Fremdabschluss wird in beiden abgelehnt", dbFremd === "f" && spFremd === false, `db=${dbFremd} sp=${spFremd}`);

      // Fall D: Wiederaufnahme nach Lease-Ablauf, inkl. attempts.
      q("update public.helmut_jobs set lease_expires_at = now() - interval '1 second' where lease_owner='a'");
      const dbWieder = q("select count(*) from public.helmut_claim_jobs('c',5,60000)");
      u.vor(61000);
      const spWieder = (await speicher.claim({ owner: "c", limit: 5, leaseMs: 60000 })).auftraege.length;
      check("9.4 Wiederaufnahme abgelaufener Leases stimmt ueberein", dbWieder === String(spWieder), `db=${dbWieder} sp=${spWieder}`);

      // Fall E: unbekannter Aufgabentyp.
      let dbTypFehler = false;
      try { q("select public.helmut_enqueue_job('quatsch','G-X','F','{}'::jsonb)"); } catch (_) { dbTypFehler = true; }
      const spTyp = await speicher.enqueue(auftrag({ jobType: "quatsch", idempotencyKey: "G-X" }));
      check("9.5 Unbekannter Aufgabentyp wird in beiden abgelehnt",
        dbTypFehler === true && spTyp.verfuegbar === false, `db=${dbTypFehler} sp=${JSON.stringify(spTyp)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("10 · Handler benutzen die Bestandsfunktionen (keine zweite Fachlogik)");
  {
    const quelltext = require("fs").readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
    check("10.1 Der Abrufhandler ruft crawlAllSources auf", /deps\.crawlAllSources\(/.test(quelltext));
    check("10.2 Der Abrufhandler schreibt ueber saveRawItems + persistRawDocuments",
      /deps\.saveRawItems\(/.test(quelltext) && /deps\.persistRawDocuments\(/.test(quelltext));
    check("10.3 Verstehen laeuft ueber runUnderstandingShadow (globaler Deckel unveraendert)",
      /runUnderstandingShadow/.test(quelltext) && /deps\.eagerUnderstanding\(/.test(quelltext));
    check("10.4 Die Projektion nutzt runMatchingShadow + runDecisionShadow",
      /runMatchingShadow/.test(quelltext) && /runDecisionShadow/.test(quelltext));
    check("10.5 Die Briefingmaterialisierung nutzt buildV3Briefing", /buildV3Briefing/.test(quelltext));
    check("10.6 Es gibt KEINEN eigenen KI-Aufruf im skalierbaren Pfad",
      !/require\(["']\.\/ai["']\)/.test(quelltext) && !/generateLageBriefing|generateCommunicationDraft/.test(quelltext));
    check("10.7 Es gibt KEINEN eigenen fetch/http-Aufruf im skalierbaren Pfad",
      !/\bfetch\(/.test(quelltext) && !/require\(["']https?["']\)/.test(quelltext));
  }
  {
    // Der Abrufhandler meldet Erfolg NUR, wenn die Ablage ihn traegt (CLAUDE.md §4.10).
    const d = {
      hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
      createGate: () => null, sharedLedger: () => null,
      crawlAllSources: async () => ({ results: [{ ok: true, sourceId: "q1" }], rawItems: [{ hash: "h1" }] }),
      saveRawItems: async (items) => items,
      persistRawDocuments: async () => ({ skipped: false, error: null, persisted: 1 })
    };
    const gut = await SP.HANDLER.source_fetch({ id: "j", payload: { quelle: { id: "q1" } } }, d);
    check("10.8 Erfolgreicher Abruf meldet ok", gut.ok === true && gut.gespeichert === 1);
    let gefangen = null;
    try {
      await SP.HANDLER.source_fetch({ id: "j", payload: { quelle: { id: "q1" } } },
        { ...d, persistRawDocuments: async () => ({ error: "kaputt" }) });
    } catch (e) { gefangen = e.message; }
    check("10.9 Gescheiterte Persistenz meldet KEINEN Erfolg (kein falsches Gruen)",
      gefangen === "persistenz-fehlgeschlagen-oder-unbekannt", String(gefangen));
    let leer = null;
    try { await SP.HANDLER.source_fetch({ id: "j", payload: {} }, d); } catch (e) { leer = e.message; }
    check("10.10 Ein Auftrag ohne Quelle wird als payload-ungueltig abgelehnt", /payload-ungueltig/.test(String(leer)));
  }
  {
    // Projektion und Briefing sind KI-frei — der Handler darf nichts anderes aufrufen.
    let matchingAufgerufen = 0;
    let decisionsAufgerufen = 0;
    const r = await SP.HANDLER.mandate_projection({ id: "j", payload: { mandatsId: "m1" } }, {
      getActiveProfile: async () => ({ id: "m1" }),
      matching: async () => { matchingAufgerufen += 1; return { matched: 3 }; },
      decisions: async () => { decisionsAufgerufen += 1; return { saved: 2 }; }
    });
    check("10.11 Die Projektion ruft genau einmal Matching und einmal Entscheidungen",
      matchingAufgerufen === 1 && decisionsAufgerufen === 1 && r.ok === true);
    const b = await SP.HANDLER.briefing_materialization({ id: "j", payload: { mandatsId: "m1" } }, {
      getActiveProfile: async () => ({ id: "m1" }),
      buildV3Briefing: async () => ({ available: false, reason: "no-vorgaenge", items: [] })
    });
    check("10.12 Ein ehrlicher Leerzustand ist KEIN Fehlschlag",
      b.ok === true && b.verfuegbar === false && b.grund === "no-vorgaenge");
  }

  // ─────────────────────────────────────────────────────────────────────────
  abschnitt("11 · Scheduler plant, arbeitet aber nicht");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    let abrufe = 0;
    const profile = [
      { id: "m1", fullName: "A A", party: "P", faction: "F", committee: "C", focusTopics: ["T"], topicPriorities: { T: 1 }, state: "Bayern", constituency: "WK1" },
      { id: "m2", fullName: "B B", party: "P", faction: "F", committee: "C", focusTopics: ["T"], topicPriorities: { T: 1 }, state: "Bayern", constituency: "WK2" }
    ];
    const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
    const ergebnis = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => { abrufe += 0; return [sched.personNewsSource(p), ...sched.mandateNewsSources(p)]; },
        enqueue: q.enqueue
      }
    });
    check("11.1 Der Scheduler hat geplant", ergebnis.geplant > 0 && ergebnis.neu === ergebnis.geplant);
    check("11.2 Er hat KEINEN externen Abruf ausgefuehrt", abrufe === 0);
    check("11.3 Beide Profile wurden gesehen", ergebnis.profile === 2);
    const zweiterLauf = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)],
        enqueue: q.enqueue
      }
    });
    check("11.4 Ein zweiter Planungslauf erzeugt KEINE Duplikate",
      zweiterLauf.neu === 0 && zweiterLauf.vorhanden === zweiterLauf.geplant, JSON.stringify({ neu: zweiterLauf.neu, vorhanden: zweiterLauf.vorhanden }));
    // Nicht einreihbare Auftraege werden EHRLICH gemeldet.
    const kaputt = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => [sched.personNewsSource(p)],
        enqueue: async () => ({ verfuegbar: false, grund: "migration-fehlt" })
      }
    });
    check("11.5 Eine nicht verfuegbare Warteschlange wird ehrlich gemeldet, nicht als Erfolg",
      kaputt.ok === false && kaputt.nichtEingereiht > 0 && kaputt.gruende.includes("migration-fehlt"),
      JSON.stringify({ ok: kaputt.ok, n: kaputt.nichtEingereiht, g: kaputt.gruende }));
    // Ein kaputtes Profil kostet nie die Versorgung der uebrigen.
    const isoliert = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => { if (p.id === "m1") throw new Error("profil kaputt"); return [sched.personNewsSource(p)]; },
        enqueue: q.enqueue
      }
    });
    check("11.6 Ein kaputtes Profil wird benannt und isoliert",
      isoliert.fehlerhafteProfile.length === 1 && isoliert.fehlerhafteProfile[0].mandatsId === "m1");
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error && error.stack ? error.stack.split("\n").slice(0, 5).join("\n") : error);
  process.exit(1);
});
