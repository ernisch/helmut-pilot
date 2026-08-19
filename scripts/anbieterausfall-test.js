"use strict";

// Helmut — ANBIETERAUSFALL: was passiert, wenn Google News wegfaellt? (OP-30, Phase 6).
// =============================================================================================
// KEINE neue externe Technik, KEIN Netzaufruf, KEIN neuer Anbieter. Diese Suite prueft mit
// zwei Attrappen, was der VORHANDENE Code bei einem Ausfall tut — und ob die Belegkette einen
// spaeteren Anbieterwechsel ueberhaupt tragen wuerde.
//
// Die Frage dahinter ist nicht technisch, sondern produktlich: was sieht ein Mandatstraeger
// an einem Tag, an dem Google nicht antwortet? Die Antwort muss "weniger, und er sieht dass
// es weniger ist" lauten — nicht "einen ruhigen Tag".

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const T0 = Date.parse("2026-08-08T00:00:00Z");
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

function uhr(startMs = T0) {
  let ms = startMs;
  return { jetzt: () => ms, vor: (d) => { ms += d; } };
}

// Zwei Attrappen, exakt wie im Auftrag gefordert:
//   ANBIETER_OK      — der primaere Anbieter antwortet
//   ANBIETER_AUSFALL — der primaere Anbieter antwortet NICHT (alles andere unveraendert)
function abrufAttrappe({ ausgefallen = [] } = {}) {
  return async (quellen) => {
    const quelle = quellen[0] || {};
    const wege = quelle.rssUrls || [quelle.rssUrl].filter(Boolean);
    const anbieter = SD.anbieterVonWegen(wege);
    if (ausgefallen.includes(anbieter)) {
      return { results: [{ ok: false, error: `${anbieter}: keine Antwort` }], rawItems: [] };
    }
    return {
      results: [{ ok: true }],
      rawItems: wege.map((w, i) => ({ url: `${w}#a${i}`, title: `T${i}`, sourceId: quelle.id }))
    };
  };
}

function grundAttrappen(u, w) {
  return {
    now: u.jetzt,
    hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
    createGate: () => null, sharedLedger: () => null,
    // Option B (2026-08-19): der Handler persistiert relational — die Attrappe liefert
    // deterministische rd-Kennungen als NEU eingefuegte Zeilen.
    persistRohdokumente: async (items) => ({
      ok: true, neuIds: items.map((it, i) => `rd-${i}-${it.url.length}`), vorhandene: 0
    }),
    ladeRohdokumente: async () => [],
    eagerUnderstanding: async () => ({ processed: 0, deferred: 0 }),
    getActiveProfile: async (id) => w.profile.find((p) => p.id === id) || null,
    matching: async () => ({ matched: 0 }),
    decisions: async () => ({ saved: 0 }),
    buildV3Briefing: async () => ({ available: false, reason: "kein-material", items: [] })
  };
}

async function main() {
  console.log("Helmut — Anbieterausfall (Google News) im Warteschlangenpfad (OP-30, Phase 6)");
  console.log("  offline · kein Netz · zwei Attrappen: Anbieter erreichbar / Anbieter ausgefallen\n");

  const profile = erzeugeMandate(50);

  // ═══ 1 · Welche Arbeit haengt ueberhaupt an Google? ═══════════════════════
  abschnitt("1 · Welche Auftraege brauchen zwingend Google News (Phase 6.1)");
  const bedarf = await SD.kompiliereQuellenbedarf({
    profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs: T0
  });
  const jeAnbieter = new Map();
  for (const a of bedarf.auftraege) {
    const an = (a.payload.quelle && a.payload.quelle.anbieter) || "unbekannt";
    jeAnbieter.set(an, (jeAnbieter.get(an) || 0) + 1);
  }
  console.log("  Abrufauftraege je Anbieter:");
  for (const [an, n] of [...jeAnbieter].sort((x, y) => y[1] - x[1])) {
    console.log(`    ${an.padEnd(18)} ${String(n).padStart(6)}  (${(n / bedarf.auftraege.length * 100).toFixed(1)} %)`);
  }
  check("1.1 JEDER Auftrag traegt jetzt eine Anbieterkennzeichnung (Phase 6.4)",
    bedarf.auftraege.every((a) => a.payload.quelle && a.payload.quelle.anbieter),
    `${bedarf.auftraege.length} Auftraege`);
  check("1.2 Die Kennzeichnung ist aus dem Weg abgeleitet, nicht geraten",
    SD.anbieterVonWeg("https://news.google.com/rss/search?q=x") === "google-news"
    && SD.anbieterVonWeg("https://www.bundestag.de/rss") === "bundestag.de");
  check("1.3 BEFUND: die profileigenen Abrufe haengen vollstaendig an EINEM Anbieter",
    jeAnbieter.get("google-news") === bedarf.auftraege.length,
    `${jeAnbieter.get("google-news")} von ${bedarf.auftraege.length}`);
  check("1.4 Die Auftragsbeschreibung ist dadurch anbieterNEUTRAL geworden (Weg + Anbieter, kein Google-Sonderfall)",
    bedarf.auftraege.every((a) => Array.isArray(a.payload.quelle.rssUrls) && a.payload.quelle.rssUrls.length > 0));

  // ═══ 2 · Der Anbieter antwortet ══════════════════════════════════════════
  abschnitt("2 · Attrappe A: der primaere Anbieter antwortet");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = { profile };
    const deps = {
      ...grundAttrappen(u, w), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, crawlAllSources: abrufAttrappe({ ausgefallen: [] })
    };
    const quelle = bedarf.auftraege[0].payload.quelle;
    const r = await SP.HANDLER.source_fetch({ id: "j1", payload: { quelle }, freshnessWindow: "F1" }, deps);
    check("2.1 Der Abruf gelingt", r.ok === true && r.gespeichert > 0, `${r.gespeichert} Dokumente`);
    check("2.2 Er reiht Verstehensarbeit ein", r.verstehensAuftraege > 0, String(r.verstehensAuftraege));
  }

  // ═══ 3 · Der Anbieter faellt aus ═════════════════════════════════════════
  abschnitt("3 · Attrappe B: der primaere Anbieter faellt vollstaendig aus (Phase 6.2/6.3)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = { profile };
    const deps = {
      ...grundAttrappen(u, w), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, offeneVorbedingungen: q.offeneVorbedingungen, zurueckstellen: q.zurueckstellen,
      crawlAllSources: abrufAttrappe({ ausgefallen: ["google-news"] })
    };

    // Alle Abrufauftraege einreihen und arbeiten lassen, bis sie endgueltig scheitern.
    for (const a of bedarf.auftraege.slice(0, 30)) {
      await q.enqueue({ ...a, maxAttempts: 2, dueAt: new Date(u.jetzt()).toISOString() });
    }
    await q.enqueue({
      jobType: "briefing_materialization", idempotencyKey: "b-1", freshnessWindow: bedarf.auftraege[0].freshnessWindow,
      payload: { mandatsId: profile[0].id }, tenantId: profile[0].id, priority: 250, maxAttempts: 3
    });

    for (let runde = 0; runde < 4; runde += 1) {
      await SP.arbeite({ env: AN, owner: `w${runde}`, budgetMs: 600000, leaseMs: 60000, stapel: 100, deps });
      u.vor(3600 * 1000);
    }

    const abrufe = q.alle().filter((x) => x.job_type === "source_fetch");
    const gescheitert = abrufe.filter((x) => x.status === "fehlgeschlagen");
    check("3.1 Die Abrufe scheitern — und werden als gescheitert GEFUEHRT, nicht als erledigt",
      gescheitert.length === abrufe.length && abrufe.length > 0,
      `${gescheitert.length} von ${abrufe.length}`);
    check("3.2 Der Fehlertext benennt den Anbieter",
      gescheitert.every((x) => /google-news/.test(String(x.last_error))),
      String(gescheitert[0] && gescheitert[0].last_error).slice(0, 80));
    check("3.3 Es entstand KEIN Verstehensauftrag aus einem gescheiterten Abruf",
      q.alle().filter((x) => x.job_type === "document_understanding").length === 0);

    const briefing = q.alle().find((x) => x.job_type === "briefing_materialization");
    check("3.4 Das Briefing wartet NICHT ewig auf einen Abruf, der nie gelingt",
      briefing.status === "erledigt", briefing.status);

    // Der entscheidende Produktpunkt.
    const ergebnis = await SP.HANDLER.briefing_materialization(
      { id: "b", jobType: "briefing_materialization", freshnessWindow: "X", payload: { mandatsId: profile[0].id } },
      { ...deps, offeneVorbedingungen: undefined });
    check("3.5 Das Briefing meldet einen EHRLICHEN Leerzustand, keinen ruhigen Tag",
      ergebnis.ok === true && ergebnis.verfuegbar === false && ergebnis.grund === "kein-material",
      JSON.stringify(ergebnis));

    const stand = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics } });
    check("3.6 Der Betriebsstatus macht den Ausfall sichtbar",
      stand.verfuegbar === true && stand.kennzahlen.endgueltigFehler > 0,
      `endgueltige Fehler: ${stand.kennzahlen.endgueltigFehler}`);
  }

  // ═══ 4 · Was ohne Google weiterlaeuft ════════════════════════════════════
  abschnitt("4 · Was ohne den Anbieter weiterlaeuft (Phase 6.3)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = { profile };
    const deps = {
      ...grundAttrappen(u, w), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, crawlAllSources: abrufAttrappe({ ausgefallen: ["google-news"] })
    };
    // Eine KATALOGQUELLE des Paketmodells — echter Herausgeber-Feed, kein Google.
    const katalog = {
      id: "kat-bundestag", name: "Bundestag", type: "rss", category: "offiziell",
      crawlMethod: "rss", maxItems: 20, active: true,
      url: "https://www.bundestag.de/", rssUrls: ["https://www.bundestag.de/rss/aktuell"]
    };
    const r = await SP.HANDLER.source_fetch({ id: "k1", payload: { quelle: katalog }, freshnessWindow: "F1" }, deps);
    check("4.1 Eine Nicht-Google-Quelle laeuft im selben Ausfall UNVERAENDERT weiter",
      r.ok === true && r.gespeichert > 0, `${r.gespeichert} Dokumente`);
    check("4.2 Sie ist auch als anderer Anbieter gekennzeichnet",
      SD.anbieterVonWegen(katalog.rssUrls) === "bundestag.de");
    console.log("  -> Bei einem Google-Ausfall bleiben genau die Katalogquellen des Paketmodells");
    console.log("     uebrig (Bundestag, Landtage, Ministerien). Die PERSONENBEZOGENE Lage");
    console.log("     ('was steht heute ueber mich in den Nachrichten') faellt vollstaendig weg.");
  }

  // ═══ 5 · Traegt die Belegkette einen Anbieterwechsel? ════════════════════
  abschnitt("5 · Wuerde die Belegkette einen Anbieterwechsel tragen? (Phase 6.5)");
  {
    const a = bedarf.auftraege[0];
    check("5.1 Der Auftrag beschreibt den ABRUFWEG, nicht den Anbieter — ein zweiter Weg waere einsetzbar",
      Array.isArray(a.payload.quelle.rssUrls));
    check("5.2 Der Idempotenzschluessel haengt an der normalisierten Abrufdefinition",
      /^source_fetch\|/.test(a.idempotencyKey), a.idempotencyKey.slice(0, 40));
    check("5.3 Die Anbieterkennzeichnung erlaubt eine Auswertung je Anbieter",
      typeof a.payload.quelle.anbieter === "string" && a.payload.quelle.anbieter.length > 0);
    console.log("  BEFUND: die Auftragsform traegt einen Anbieterwechsel. Was FEHLT, ist ein");
    console.log("  zweiter Weg mit derselben Suchsemantik — und das ist eine Produkt- und");
    console.log("  Kostenentscheidung, keine Technikentscheidung. Empfehlung mit Aufwand,");
    console.log("  Nutzen und Risiko: docs/betrieb/skalierungsgrundlage-1000.md §13.");
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
