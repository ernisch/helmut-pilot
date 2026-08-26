"use strict";

// Helmut — GEGENBEISPIELE ZUM BEFUND Z22: die Vorbedingungspruefung muss mandatsbezogen sein.
// =============================================================================================
// BEFUND (Realistiknachweis Z3a, PR #272, Belegdatei `docs/betrieb/z3-realistiknachweis-
// 2026-08-26.md` §7/§10.5): `helmut_jobs_offen` filterte ueber AKTUALITAETSFENSTER und TYP —
// ohne jeden Mandatsbezug. Ein einziges Mandat mit einem dauerhaft nicht antwortenden
// persoenlichen Abrufweg hielt damit Projektion und Briefing ALLER Mandate zurueck.
//
// WAS HIER GEPRUEFT WIRD — und warum es GEGENBEISPIELE sind, keine Bestaetigungen:
// Jeder Test in §2 ist gegen den Code VOR der Korrektur ROT. Sie sind die eigentliche
// Beweislast; §1 und §3 sichern, dass die Korrektur nicht zu viel wegnimmt.
//
//   §1  Was global bleiben MUSS (geteilte Abrufe, Verstehen) — bleibt global
//   §2  Was mandatsbezogen sein MUSS — ist es jetzt (die Gegenbeispiele)
//   §3  Reihenfolge INNERHALB eines Mandats bleibt vollstaendig erhalten
//   §4  Fail closed: unbrauchbare Mandatskennung fuehrt zu MEHR Warten, nie zu weniger
//   §5  Wiederholung, Lease, Zurueckstellung und endgueltiger Fehler wirken unveraendert
//   §6  Attrappe und Datenbankfunktion sagen wortgleich dasselbe (Vertragsgleichheit)
//   §7  Der Rueckfall ohne angewendete Migration ist das ALTE Verhalten, nicht Ausfall
//
// Kein Netz, keine Datenbank, keine Secrets — CI-tauglich. Den Datenbankteil fuehrt
// `scripts/vorbedingung-mandatsfilter-datenbank-test.js` an echter PostgreSQL 17.6.
// Aufruf: node scripts/lokal.js scripts/vorbedingung-mandatsfilter-test.js

const path = require("path");

const ROOT = path.join(__dirname, "..");
const pipeline = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const treiber = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  return ok;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Prüfstand ────────────────────────────────────────────────────────────────────────────────
// Ein Fenster, zwei Mandate, dazu geteilte Arbeit. Absichtlich klein: der Befund haengt an
// der Mandatsdimension, nicht an der Menge.
const FENSTER = "2026-08-26T00Z";
const MANDAT_A = "synth-mandat-krank";
const MANDAT_B = "synth-mandat-gesund";

function neuerStand() {
  const jetzt = Date.parse("2026-08-26T12:00:00.000Z");
  const q = treiber.erzeugeSpeicherWarteschlange({ now: () => jetzt });
  return { q, jetzt };
}

async function einreihen(q, zeilen) {
  for (const z of zeilen) {
    await q.enqueue({
      jobType: z.typ,
      idempotencyKey: z.schluessel,
      freshnessWindow: z.fenster || FENSTER,
      tenantId: "tenant" in z ? z.tenant : null,
      priority: 100,
      maxAttempts: 5,
      payload: z.payload || {}
    });
  }
}

// Der echte Aufrufer aus dem Motor. Er entscheidet, ob zurueckgestellt wird.
async function fragt(q, auftrag, jetzt) {
  return pipeline.vorbedingungOffen(auftrag, {
    offeneVorbedingungen: q.offeneVorbedingungen,
    now: () => jetzt
  });
}

function auftragVon(typ, mandat, { fenster = FENSTER, erzeugt = "2026-08-26T11:00:00.000Z" } = {}) {
  return {
    jobType: typ,
    tenantId: mandat,
    freshnessWindow: fenster,
    createdAt: erzeugt,
    payload: mandat == null ? {} : { mandatsId: mandat }
  };
}

async function main() {
  console.log("Helmut — Gegenbeispiele zum Befund Z22 (mandatsbezogene Vorbedingungspruefung)");
  console.log("  Ohne Netz, ohne Datenbank, ohne Secrets. Vor der Korrektur ist §2 ROT.\n");

  // ═══ §1 · Was global bleiben MUSS ═════════════════════════════════════════════════════════
  abschnitt("1 · Geteilte Arbeit bleibt fuer ALLE eine Vorbedingung");
  {
    const { q, jetzt } = neuerStand();
    // GETEILTER Abruf: `source-demand.js` setzt hier ausdruecklich `tenantId: null`
    // („GETEILTE Arbeit gehoert KEINEM Mandat"). Er speist jedes Mandat.
    await einreihen(q, [{ typ: "source_fetch", schluessel: "geteilt-1", tenant: null }]);

    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    check("1.1 Ein offener GETEILTER Abruf haelt die Projektion von Mandat B zurueck",
      b !== null && b.offen === 1, b ? `offen ${b.offen}` : "nicht zurueckgestellt");

    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    check("1.2 Derselbe geteilte Abruf haelt auch Mandat A zurueck (kein Sonderweg)",
      a !== null && a.offen === 1, a ? `offen ${a.offen}` : "nicht zurueckgestellt");
  }
  {
    const { q, jetzt } = neuerStand();
    // VERSTEHEN traegt bauartbedingt IMMER `tenantId: null` (`scalable-pipeline.js`:
    // „Ein Vorgang gehoert keinem Mandanten, auch dann nicht, wenn ihn eine persoenliche
    // Suche gefunden hat"). Es bleibt deshalb global — auch nach der Korrektur.
    await einreihen(q, [{ typ: "document_understanding", schluessel: "verstehen-1", tenant: null }]);
    const b = await fragt(q, auftragVon("briefing_materialization", MANDAT_B), jetzt);
    check("1.3 Offenes VERSTEHEN haelt das Briefing jedes Mandats zurueck",
      b !== null && b.offen === 1, b ? `offen ${b.offen}` : "nicht zurueckgestellt");
  }

  // ═══ §2 · DIE GEGENBEISPIELE — vor der Korrektur ROT ══════════════════════════════════════
  abschnitt("2 · GEGENBEISPIELE: fremde mandatsgebundene Arbeit blockiert nicht mehr");
  {
    const { q, jetzt } = neuerStand();
    // PERSOENLICHER Abruf von Mandat A: die Namenssuche GENAU EINES Mandats
    // (`source-demand.js`: „Persoenliche Arbeit -> Mandatsbezug wird gesetzt").
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-a", tenant: MANDAT_A }]);

    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    check("2.1 Offener PERSOENLICHER Abruf von Mandat A blockiert die Projektion von Mandat B NICHT",
      b === null, b ? `zurueckgestellt, offen ${b.offen} — Z22 noch offen` : "laeuft durch");

    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    check("2.2 Derselbe Abruf blockiert die Projektion von Mandat A SEHR WOHL",
      a !== null && a.offen === 1, a ? `offen ${a.offen}` : "faelschlich durchgelaufen");
  }
  {
    const { q, jetzt } = neuerStand();
    // `mandate_projection` ist Vorbedingung des Briefings — und traegt immer ein Mandat.
    // Das Briefing von B hat mit der Projektion von A nichts zu tun.
    await einreihen(q, [{ typ: "mandate_projection", schluessel: "proj-a", tenant: MANDAT_A }]);

    const b = await fragt(q, auftragVon("briefing_materialization", MANDAT_B), jetzt);
    check("2.3 Offene PROJEKTION von Mandat A blockiert das Briefing von Mandat B NICHT",
      b === null, b ? `zurueckgestellt, offen ${b.offen} — Z22 noch offen` : "laeuft durch");

    const a = await fragt(q, auftragVon("briefing_materialization", MANDAT_A), jetzt);
    check("2.4 Die eigene Projektion blockiert das eigene Briefing SEHR WOHL",
      a !== null && a.offen === 1, a ? `offen ${a.offen}` : "faelschlich durchgelaufen");
  }
  {
    const { q, jetzt } = neuerStand();
    // Das Narrativ wartet auf Abruf und Verstehen — dieselbe Trennung.
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-a2", tenant: MANDAT_A }]);
    const b = await fragt(q, auftragVon("tenant_narrative", MANDAT_B), jetzt);
    check("2.5 Auch das NARRATIV von Mandat B laeuft an fremder Mandatsarbeit vorbei",
      b === null, b ? `zurueckgestellt, offen ${b.offen}` : "laeuft durch");
  }
  {
    const { q, jetzt } = neuerStand();
    // DAUERHAFT KRANKES MANDAT, wie im Realistiklauf: sein persoenlicher Weg antwortet nie,
    // der Auftrag haengt in `wartend` und wird immer wieder wiederholt.
    await einreihen(q, [
      { typ: "source_fetch", schluessel: "person-a-tot", tenant: MANDAT_A },
      { typ: "source_fetch", schluessel: "person-a-tot-2", tenant: MANDAT_A },
      { typ: "mandate_projection", schluessel: "proj-a-haengt", tenant: MANDAT_A }
    ]);
    const projB = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    const briefB = await fragt(q, auftragVon("briefing_materialization", MANDAT_B), jetzt);
    const narrB = await fragt(q, auftragVon("tenant_narrative", MANDAT_B), jetzt);
    check("2.6 Ein dauerhaft krankes Mandat haelt KEINE Stufe eines gesunden Mandats auf",
      projB === null && briefB === null && narrB === null,
      `Projektion ${projB ? "blockiert" : "frei"} · Briefing ${briefB ? "blockiert" : "frei"}`
      + ` · Narrativ ${narrB ? "blockiert" : "frei"}`);
  }
  {
    const { q, jetzt } = neuerStand();
    // GLEICHNAMIGE TYPEN VERSCHIEDENER MANDATE duerfen nicht vermischt werden: derselbe
    // Auftragstyp, dasselbe Fenster, zwei Mandate — jedes sieht nur sich selbst.
    await einreihen(q, [
      { typ: "source_fetch", schluessel: "person-a-x", tenant: MANDAT_A },
      { typ: "source_fetch", schluessel: "person-b-x", tenant: MANDAT_B }
    ]);
    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    check("2.7 Gleichnamige Typen zweier Mandate werden nicht vermischt (je 1, nicht 2)",
      a !== null && a.offen === 1 && b !== null && b.offen === 1,
      `A sieht ${a ? a.offen : "—"} · B sieht ${b ? b.offen : "—"}`);
  }
  {
    const { q, jetzt } = neuerStand();
    // Geteilte UND fremde Arbeit gleichzeitig: gezaehlt wird geteilt + eigen, nie fremd.
    await einreihen(q, [
      { typ: "source_fetch", schluessel: "geteilt-x", tenant: null },
      { typ: "source_fetch", schluessel: "person-a-y", tenant: MANDAT_A },
      { typ: "source_fetch", schluessel: "person-b-y", tenant: MANDAT_B }
    ]);
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    check("2.8 Gezaehlt wird geteilt + eigen (2), nicht alles (3)",
      b !== null && b.offen === 2, b ? `offen ${b.offen}` : "nicht zurueckgestellt");
  }

  // ═══ §3 · Reihenfolge innerhalb des Mandats ═══════════════════════════════════════════════
  abschnitt("3 · Die Reihenfolge INNERHALB eines Mandats bleibt vollstaendig");
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-b-1", tenant: MANDAT_B }]);
    const proj = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    const brief = await fragt(q, auftragVon("briefing_materialization", MANDAT_B), jetzt);
    const narr = await fragt(q, auftragVon("tenant_narrative", MANDAT_B), jetzt);
    check("3.1 Eigener Abruf haelt Projektion, Briefing und Narrativ desselben Mandats zurueck",
      proj !== null && brief !== null && narr !== null,
      `Projektion ${proj ? "wartet" : "LAEUFT"} · Briefing ${brief ? "wartet" : "LAEUFT"}`
      + ` · Narrativ ${narr ? "wartet" : "LAEUFT"}`);
  }
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "mandate_projection", schluessel: "proj-b", tenant: MANDAT_B }]);
    const brief = await fragt(q, auftragVon("briefing_materialization", MANDAT_B), jetzt);
    const narr = await fragt(q, auftragVon("tenant_narrative", MANDAT_B), jetzt);
    check("3.2 Die eigene Projektion haelt das eigene Briefing zurueck — aber NICHT das Narrativ",
      brief !== null && narr === null,
      "Narrativ wartet vertragsgemaess nur auf Abruf und Verstehen (E1)");
  }
  {
    const { q, jetzt } = neuerStand();
    // Die 8-h-Abruffenster liegen im 24-h-Mandatsfenster (Befund O3) — das muss auch mit
    // Mandatsfilter noch gelten, sonst waere ein Drittel der Vorbedingungen unsichtbar.
    await einreihen(q, [
      { typ: "source_fetch", schluessel: "eigen-08", tenant: MANDAT_B, fenster: "2026-08-26T08Z" }
    ]);
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    check("3.3 Befund O3 bleibt gewahrt: das 8-h-Teilfenster zaehlt weiter mit",
      b !== null && b.offen === 1, b ? `offen ${b.offen}` : "Teilfenster unsichtbar geworden");
  }

  // ═══ §4 · Fail closed ═════════════════════════════════════════════════════════════════════
  abschnitt("4 · Unbrauchbare Mandatskennung fuehrt zu MEHR Warten, nie zu weniger");
  {
    const auf = [
      ["null", null], ["leerer String", ""], ["nur Leerzeichen", "   "],
      ["Zahl", 42], ["Objekt", { id: "x" }], ["undefined", undefined]
    ];
    for (const [name, wert] of auf) {
      const { q, jetzt } = neuerStand();
      await einreihen(q, [
        { typ: "source_fetch", schluessel: "person-a-z", tenant: MANDAT_A },
        { typ: "source_fetch", schluessel: "person-b-z", tenant: MANDAT_B }
      ]);
      const auftrag = auftragVon("mandate_projection", MANDAT_B);
      auftrag.tenantId = wert;
      delete auftrag.tenant_id;
      const b = await fragt(q, auftrag, jetzt);
      check(`4.1 Kennung „${name}" -> global gezaehlt (beide Auftraege), nicht weniger`,
        b !== null && b.offen === 2, b ? `offen ${b.offen}` : "gar nicht zurueckgestellt");
    }
  }
  {
    check("4.2 `mandatsKennungVon` liefert nur nicht-leere Zeichenketten",
      pipeline.mandatsKennungVon({ tenantId: " m1 " }) === "m1"
      && pipeline.mandatsKennungVon({ tenant_id: "m2" }) === "m2"
      && pipeline.mandatsKennungVon({ tenantId: "" }) === null
      && pipeline.mandatsKennungVon({ tenantId: 7 }) === null
      && pipeline.mandatsKennungVon({}) === null
      && pipeline.mandatsKennungVon(null) === null);
    check("4.3 Die Nutzlast ist KEIN Ersatz fuer die Spalte (eine Wahrheit, nicht zwei)",
      pipeline.mandatsKennungVon({ payload: { mandatsId: "m3" } }) === null,
      "gefiltert wird nach tenant_id — die Nutzlast wuerde eine zweite Wahrheit einfuehren");
  }

  // ═══ §5 · Wiederholung, Lease, Zurueckstellung, endgueltiger Fehler ═══════════════════════
  abschnitt("5 · Wiederholung, Lease, Zurueckstellung und endgueltiger Fehler");
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-a-retry", tenant: MANDAT_A }]);
    // Ein WIEDERHOLTER Auftrag: uebernehmen, scheitern lassen, er kehrt nach `wartend` zurueck.
    const uebernommen = (await q.claim({ owner: "w1", limit: 5, types: ["source_fetch"] })).auftraege;
    await q.finish({ id: uebernommen[0].id, owner: "w1", ok: false, error: "netz-weg" });
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    check("5.1 Ein WIEDERHOLTER fremder Auftrag bleibt fuer Mandat B unsichtbar",
      b === null, b ? `blockiert, offen ${b.offen}` : "frei");
    check("5.2 Derselbe wiederholte Auftrag zaehlt fuer sein EIGENES Mandat weiter",
      a !== null && a.offen === 1, a ? `offen ${a.offen}` : "faelschlich unsichtbar");
  }
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-a-lease", tenant: MANDAT_A }]);
    // GELEASTER Auftrag: Status `laeuft`. Er zaehlt als offen — aber nur fuer sein Mandat.
    const uebernommen = (await q.claim({ owner: "w1", limit: 5, types: ["source_fetch"] })).auftraege;
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    check("5.3 Ein GELEASTER fremder Auftrag (`laeuft`) blockiert Mandat B nicht",
      uebernommen.length === 1 && b === null, b ? `blockiert, laufend ${b.laufend}` : "frei");
    check("5.4 Derselbe geleaste Auftrag zaehlt fuer sein eigenes Mandat als laufend",
      a !== null && a.laufend === 1, a ? `laufend ${a.laufend}` : "faelschlich unsichtbar");
  }
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "source_fetch", schluessel: "person-a-defer", tenant: MANDAT_A }]);
    const uebernommen = (await q.claim({ owner: "w1", limit: 5, types: ["source_fetch"] })).auftraege;
    await q.zurueckstellen({ id: uebernommen[0].id, owner: "w1", delayMs: 120000, grund: "vorbedingung-offen" });
    const b = await fragt(q, auftragVon("mandate_projection", MANDAT_B), jetzt);
    const a = await fragt(q, auftragVon("mandate_projection", MANDAT_A), jetzt);
    check("5.5 Ein ZURUECKGESTELLTER fremder Auftrag blockiert Mandat B nicht",
      b === null, b ? `blockiert, offen ${b.offen}` : "frei");
    check("5.6 Er zaehlt fuer sein eigenes Mandat weiter als offen",
      a !== null && a.offen === 1, a ? `offen ${a.offen}` : "faelschlich unsichtbar");
  }
  {
    const { q, jetzt } = neuerStand();
    await einreihen(q, [{ typ: "source_fetch", schluessel: "eigen-b-terminal", tenant: MANDAT_B }]);
    // ENDGUELTIG gescheitert: zaehlt bewusst NICHT als offen — sonst wartete ein Briefing
    // ewig auf einen Abruf, den Google nie beantwortet. Das bleibt unveraendert.
    for (let i = 0; i < 6; i += 1) {
      const z = (await q.claim({ owner: "w1", limit: 5, types: ["source_fetch"] })).auftraege;
      if (!z.length) break;
      await q.finish({ id: z[0].id, owner: "w1", ok: false, error: "dauerhaft" });
    }
    const stand = await q.offeneVorbedingungen({
      fenster: [FENSTER], typen: ["source_fetch"], mandat: MANDAT_B
    });
    check("5.7 Ein ENDGUELTIG gescheiterter EIGENER Auftrag zaehlt weiterhin nicht als offen",
      stand.offen === 0 && stand.fehlgeschlagen === 1,
      `offen ${stand.offen} · fehlgeschlagen ${stand.fehlgeschlagen}`);
  }

  // ═══ §6 · Vertragsgleichheit Attrappe / Datenbank ═════════════════════════════════════════
  abschnitt("6 · Attrappe und Datenbankfunktion sagen wortgleich dasselbe");
  {
    const fs = require("fs");
    const sql = fs.readFileSync(path.join(ROOT,
      "supabase/migrations/20260826190000_jobqueue_vorbedingung_mandatsfilter.sql"), "utf8");
    check("6.1 Die Migration filtert `p_mandat is null or tenant_id is null or tenant_id = p_mandat`",
      /p_mandat\s+is\s+null\s+or\s+j\.tenant_id\s+is\s+null\s+or\s+j\.tenant_id\s*=\s*p_mandat/.test(sql));
    check("6.2 `p_mandat` hat den Vorgabewert null (Altaufrufer mit zwei Argumenten bleiben lauffaehig)",
      /p_mandat\s+text\s+default\s+null/.test(sql));
    check("6.3 Die zweistellige Fassung wird entfernt (sonst waere der Aufruf mehrdeutig)",
      /drop function if exists public\.helmut_jobs_offen\(text\[\], text\[\]\)/.test(sql));
    check("6.4 Die Zaehlmenge selbst ist unveraendert (`offen` = wartend + laeuft)",
      /status in \('wartend','laeuft'\)\)\s+as offen/.test(sql));
    const rueck = fs.readFileSync(path.join(ROOT,
      "supabase/migrations/rollback_20260826190000_jobqueue_vorbedingung_mandatsfilter.sql"), "utf8");
    check("6.5 Ein Rueckweg existiert und stellt die zweistellige Fassung wieder her",
      /drop function if exists public\.helmut_jobs_offen\(text\[\], text\[\], text\)/.test(rueck)
      && /create or replace function public\.helmut_jobs_offen\(/.test(rueck));
  }

  // ═══ §7 · Rueckfall ohne angewendete Migration ════════════════════════════════════════════
  abschnitt("7 · Ohne angewendete Migration gilt das ALTE Verhalten, nicht Ausfall");
  {
    // Merge = Deployment, Migrationen sind freigabepflichtig: der Code kann in Production
    // stehen, bevor die Funktion drei Argumente hat. Dann darf die Reihenfolgezusage NICHT
    // still verschwinden — sie muss auf die globale Zaehlung zurueckfallen.
    const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
    const quelle = require("fs").readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    check("7.1 `jobQueueOffeneVorbedingungen` nimmt eine Mandatskennung entgegen",
      /jobQueueOffeneVorbedingungen\(\{ fenster = null, typen = null, mandat = null \}/.test(quelle));
    check("7.2 Bei PGRST202 wird GENAU EINMAL ohne `p_mandat` nachgefragt (altes Verhalten)",
      /isMissingReservationRpcError\(error\)\) throw error;[\s\S]{0,200}frage\(false\)/.test(quelle));
    check("7.3 Der Rueckfall meldet sich ausdruecklich (`mandatsfilter-migration-fehlt`)",
      /mandatsfilter-migration-fehlt/.test(quelle));
    check("7.4 Eine unbrauchbare Kennung fragt gar nicht erst mit Filter",
      /typeof mandat === "string" && mandat\.trim\(\) !== "" \? mandat\.trim\(\) : null/.test(quelle));
    check("7.5 Das Modul laedt weiterhin fehlerfrei",
      typeof storage.jobQueueOffeneVorbedingungen === "function"
      || typeof storage === "object");
  }

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}`);
  if (fail > 0) {
    console.log("  Ein rotes Kriterium in §2 heisst: der Befund Z22 ist NICHT behoben —");
    console.log("  fremde mandatsgebundene Arbeit haelt weiterhin gesunde Mandate auf.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nLAUFFEHLER: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
