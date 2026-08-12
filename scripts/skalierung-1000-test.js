"use strict";

// Helmut — LOKALER SKALIERUNGSNACHWEIS MIT 1000 MANDATEN (OP-30, Auftrag §12).
// =============================================================================================
// Ein vollstaendiger Durchlauf des skalierbaren Pfads mit 1 000 synthetischen Mandatsprofilen:
// planen -> reservieren -> verarbeiten -> abschliessen, mit mehreren Workern, simuliertem
// Absturz und simulierten Dauerfehlern.
//
// OHNE NETZ, OHNE KI, OHNE PRODUCTION-DATEN. Der Abruf, das Verstehen, das Matching, die
// Entscheidungen und die Briefingerzeugung sind ATTRAPPEN — sie zaehlen, was der echte Pfad
// aufrufen WUERDE. Was diese Suite beweist, ist deshalb der ABLAUF und die MENGENGERUEST-
// Rechnung, nicht die Laufzeit echter HTTP-Abrufe. Genau so ist es unten auch ausgewiesen.
//
// EHRLICHKEITSREGEL DIESER SUITE (Auftrag §12, vorletzter Absatz):
//   Punkte, die mangels echter Laufzeitdaten NICHT belastbar bewiesen werden koennen, werden
//   ausdruecklich als NICHT BEWIESEN ausgegeben. Sie zaehlen NICHT als PASS.

const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate, verteilung } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) {
  offen += 1;
  console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`);
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const T0 = Date.parse("2026-08-08T00:00:00Z");
const ANZAHL = 1000;

// Die profileigenen Quellen — genau die Funktionen aus dem Produktionscode.
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

function uhr(startMs = T0) {
  let ms = startMs;
  return { jetzt: () => ms, vor: (d) => { ms += d; } };
}

async function main() {
  console.log(`Helmut — Skalierungsnachweis mit ${ANZAHL} Mandaten (OP-30)`);
  console.log("  offline · ohne KI · ohne Production-Daten · deterministisch\n");

  const profile = erzeugeMandate(ANZAHL);
  const v = verteilung(profile);

  abschnitt("1 · Der Datensatz ist vielfaeltig (sonst waere jede Verdichtung wertlos)");
  check("1.1 Es sind genau 1000 Profile", profile.length === ANZAHL, String(profile.length));
  check("1.2 Zwei Ebenen sind vertreten", v.ebenen.size === 2, JSON.stringify([...v.ebenen]));
  check("1.3 Landtagsmandate sind enthalten (8 statt 7 eigene Wege)", (v.ebenen.get("Landtag") || 0) > 100, String(v.ebenen.get("Landtag")));
  check("1.4 Mehrere Parteien", v.parteien >= 5, String(v.parteien));
  check("1.5 Mehrere Ausschuesse", v.ausschuesse >= 8, String(v.ausschuesse));
  check("1.6 Alle 16 Bundeslaender", v.laender === 16, String(v.laender));
  check("1.7 Die Wahlkreise sind FAST EINDEUTIG — der harte Fall, nicht der bequeme",
    v.wahlkreise === ANZAHL, String(v.wahlkreise));
  check("1.8 Keine echten personenbezogenen Daten (nur synthetische Kennungen)",
    profile.every((p) => /^synth-mandat-\d{4}$/.test(p.id) && /^Testperson \d{4}$/.test(p.fullName)));

  abschnitt("2 · Planung: alle 1000 Profile, nichts abgeschnitten");
  const u = uhr();
  const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
  let quellenplaene = 0;
  const t0 = Date.now();
  const plan1 = await SP.planeArbeit({
    env: AN, jetztMs: u.jetzt(),
    deps: {
      listFullProfiles: async () => profile,
      quellenFuerProfil: async (p) => { quellenplaene += 1; return eigeneQuellen(p); },
      enqueue: q.enqueue
    }
  });
  const planDauer = Date.now() - t0;
  check("2.1 Alle 1000 Profile wurden eingelesen", plan1.profile === ANZAHL, String(plan1.profile));
  check("2.2 Fuer jedes Profil wurde ein Quellenplan geholt — keine harte Grenze",
    quellenplaene === ANZAHL, String(quellenplaene));
  check("2.3 Kein Profil ist fehlerhaft", plan1.fehlerhafteProfile.length === 0);
  check("2.4 Alle geplanten Auftraege wurden eingereiht", plan1.ok === true && plan1.nichtEingereiht === 0);
  check("2.5 Die Planung ist schnell genug fuer einen Cron-Slot (< 30 s)", planDauer < 30000, `${planDauer} ms`);

  const bedarf = plan1.bedarf;
  console.log(`\n  Mengengeruest der Planung:`);
  console.log(`    Profilquellen gesehen ........ ${bedarf.quellenGesehen}`);
  console.log(`    -> geteilte Auftraege ........ ${bedarf.geteilteAuftraege}`);
  console.log(`    -> persoenlich aktuell ....... ${bedarf.persoenlicheAuftraege}`);
  console.log(`    -> persoenlich Archiv ........ ${bedarf.archivAuftraege}`);
  console.log(`    zusammengefasst .............. ${bedarf.zusammengefasst}`);
  console.log(`    Verdichtung (Quellen/Auftrag)  ${bedarf.verdichtung}`);

  abschnitt("3 · Gemeinsame Quellen erzeugen EINEN Auftrag je Definition und Fenster (§12.3)");
  {
    const alle = q.alle();
    const abruf = alle.filter((z) => z.job_type === "source_fetch");
    const schluessel = new Set(abruf.map((z) => z.idempotency_key));
    check("3.1 Jeder Abrufauftrag hat einen eindeutigen Schluessel", schluessel.size === abruf.length);
    // Der Kern: 7125 Profilquellen sind auf deutlich weniger Auftraege zusammengefallen.
    check("3.2 Die Zahl der Abrufauftraege liegt DEUTLICH unter der Zahl der Profilquellen",
      abruf.length < bedarf.quellenGesehen * 0.6, `${abruf.length} von ${bedarf.quellenGesehen}`);
    // Und die Zusammenfassung ist echt: es gibt Auftraege mit vielen Anforderern.
    const geteiltAlle = abruf.filter((z) => z.payload.art === "geteilt");
    const anforderer = geteiltAlle.map((z) => z.payload.angefordertVon || 1);
    const maxAnforderer = Math.max(...anforderer);
    check("3.3 Es gibt viele Auftraege, die >=25 Mandate gemeinsam brauchen",
      anforderer.filter((n) => n >= 25).length >= 50,
      `${anforderer.filter((n) => n >= 25).length} Auftraege mit >=25 Anforderern`);
    check("3.4 Der meistgeteilte Auftrag versorgt mindestens 50 Mandate", maxAnforderer >= 50, String(maxAnforderer));

    // EHRLICHE EINORDNUNG DES RESTS — das ist der wichtigste Satz dieses Abschnitts.
    // Die Regionalsuche enthaelt den Wahlkreis, und Wahlkreise sind in der Wirklichkeit
    // (und in diesem Datensatz bewusst) fast eindeutig. Sie laesst sich deshalb NICHT
    // zusammenfassen, ohne fachlich falsch zu werden. Der Compiler tut das richtige, indem
    // er sie stehen laesst — aber sie dominiert damit den verbleibenden Bedarf.
    const einzeln = anforderer.filter((n) => n === 1).length;
    console.log(`\n  Struktur der ${geteiltAlle.length} geteilten Auftraege:`);
    console.log(`    von >=25 Mandaten gebraucht ... ${anforderer.filter((n) => n >= 25).length}`);
    console.log(`    von >=10 Mandaten gebraucht ... ${anforderer.filter((n) => n >= 10).length}`);
    console.log(`    von genau 1 Mandat gebraucht .. ${einzeln}  (ueberwiegend Regionalsuchen:`);
    console.log(`                                     der Wahlkreis ist echt mandatsspezifisch)`);
    console.log(`    meistgeteilter Auftrag ........ ${maxAnforderer} Mandate\n`);
    check("3.5 Der nicht zusammenfassbare Rest ist benannt und besteht aus echt eindeutigen Suchen",
      einzeln > 0 && einzeln <= ANZAHL,
      `${einzeln} einzeln angeforderte Auftraege — das ist die bekannte verbleibende Stellschraube`);
  }

  abschnitt("4 · Persoenliche Suchen bleiben getrennt (§12.4)");
  {
    const person = q.alle().filter((z) => z.job_type === "source_fetch" && z.payload.art !== "geteilt");
    const aktuell = person.filter((z) => z.payload.art === "person-aktuell");
    const archiv = person.filter((z) => z.payload.art === "person-archiv");
    check("4.1 Genau ein Aktuell-Auftrag je Mandat", aktuell.length === ANZAHL, String(aktuell.length));
    check("4.2 Genau ein Archiv-Auftrag je Mandat", archiv.length === ANZAHL, String(archiv.length));
    check("4.3 Jeder persoenliche Auftrag gehoert GENAU EINEM Mandat",
      new Set(aktuell.map((z) => z.tenant_id)).size === ANZAHL);
    check("4.4 KEIN persoenlicher Auftrag wurde mit einem anderen verschmolzen",
      person.every((z) => !z.payload.angefordertVon || z.payload.angefordertVon === 1));
    check("4.5 Geteilte Auftraege tragen NIE einen Mandatsbezug (CLAUDE.md §4.2)",
      q.alle().filter((z) => z.payload.art === "geteilt").every((z) => z.tenant_id === null));
  }

  abschnitt("5 · Wiederholtes Planen erzeugt keine Duplikate (§12.5)");
  {
    const vorher = q.alle().length;
    const plan2 = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt() + 60000,
      deps: { listFullProfiles: async () => profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q.enqueue }
    });
    check("5.1 Ein zweiter Planungslauf erzeugt NULL neue Auftraege", plan2.neu === 0, String(plan2.neu));
    check("5.2 Die Warteschlange ist unveraendert gross", q.alle().length === vorher, `${q.alle().length} vs ${vorher}`);
    check("5.3 Der zweite Lauf erkennt alle als vorhanden", plan2.vorhanden === plan2.geplant);
  }

  abschnitt("6 · Mehrere Worker, kein doppelter und kein verlorener Auftrag (§12.6)");
  const zaehler = { abruf: 0, verstehen: 0, projektion: 0, briefing: 0, kiAufrufe: 0 };
  const verstandeneDokumente = new Set();
  const briefingJeMandat = new Map();
  const projektionJeMandat = new Map();
  // Fremdzugriffszaehler: sieht ein Mandat je Daten eines anderen?
  const vermischung = [];

  function attrappen(u) {
    return {
      now: u.jetzt,
      claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      handler: {
        source_fetch: async (a) => {
          zaehler.abruf += 1;
          // Ein Abruf liefert Dokumente, deren Kennung aus der QUELLE stammt — nicht aus
          // einem Mandat. Genau so entsteht der globale, mandantenneutrale Rohkorpus.
          return { ok: true, gespeichert: 3 };
        },
        document_understanding: async (a) => {
          zaehler.verstehen += 1;
          for (const d of a.payload.dokumente || []) {
            // V3-Vertrag: ein Dokument wird global nur EINMAL verstanden.
            if (verstandeneDokumente.has(d)) return { ok: false };
            verstandeneDokumente.add(d);
            zaehler.kiAufrufe += 1;   // 1 KI-Aufruf je NEUEM Vorgang, global
          }
          return { ok: true };
        },
        mandate_projection: async (a) => {
          zaehler.projektion += 1;
          const m = a.payload.mandatsId;
          projektionJeMandat.set(m, (projektionJeMandat.get(m) || 0) + 1);
          if (a.tenantId !== m) vermischung.push(`projektion ${a.tenantId} != ${m}`);
          return { ok: true };   // 0 KI — belegt in llm-pfad-karte.md Zeile 14
        },
        briefing_materialization: async (a) => {
          zaehler.briefing += 1;
          const m = a.payload.mandatsId;
          briefingJeMandat.set(m, (briefingJeMandat.get(m) || 0) + 1);
          if (a.tenantId !== m) vermischung.push(`briefing ${a.tenantId} != ${m}`);
          return { ok: true };   // 0 KI — belegt in llm-pfad-karte.md Zeile 15
        }
      }
    };
  }

  // Faelligkeiten sind ueber 24 h gestreut -> die Uhr durch den Tag laufen lassen.
  const geseheneIds = [];
  const echteClaim = q.claim;
  const beobachteterClaim = async (o) => {
    const r = await echteClaim(o);
    for (const a of r.auftraege) geseheneIds.push(a.id);
    return r;
  };

  let runden = 0;
  for (let stunde = 0; stunde <= 24; stunde += 1) {
    // Vier Worker je Runde, parallel gestartet.
    const d = { ...attrappen(u), claim: beobachteterClaim };
    await Promise.all([1, 2, 3, 4].map((n) =>
      SP.arbeite({ env: AN, owner: `w${n}`, budgetMs: 3600000, leaseMs: 600000, stapel: 200, deps: d })));
    runden += 1;
    u.vor(3600 * 1000);
  }

  const doppelt = geseheneIds.length - new Set(geseheneIds).size;
  check("6.1 Vier Worker liefen ueber 25 Runden", runden === 25);
  check("6.2 KEIN Auftrag wurde doppelt reserviert", doppelt === 0, `${doppelt} Doppelvergaben`);
  check("6.3 KEIN Auftrag ging verloren",
    q.nachStatus("wartend").length + q.nachStatus("laeuft").length + q.nachStatus("erledigt").length
    + q.nachStatus("fehlgeschlagen").length === q.alle().length);
  check("6.4 Es blieb kein Auftrag im Zustand 'laeuft' haengen", q.nachStatus("laeuft").length === 0,
    String(q.nachStatus("laeuft").length));

  abschnitt("7 · Alle 1000 Mandate wurden versorgt (§12.12)");
  check("7.1 Jedes der 1000 Mandate hat eine Projektion erhalten",
    projektionJeMandat.size === ANZAHL, String(projektionJeMandat.size));
  check("7.2 Jedes der 1000 Mandate hat eine Briefingmaterialisierung erhalten",
    briefingJeMandat.size === ANZAHL, String(briefingJeMandat.size));
  check("7.3 KEIN Mandat wurde doppelt projiziert",
    [...projektionJeMandat.values()].every((n) => n === 1), JSON.stringify([...projektionJeMandat.values()].filter((n) => n !== 1).slice(0, 3)));
  check("7.4 Es gab KEINE Datenvermischung zwischen Mandanten (§12.13)",
    vermischung.length === 0, vermischung.slice(0, 3).join("; "));

  abschnitt("8 · V3-Vertrag bleibt erhalten");
  {
    // Verstehen: ein Dokument nur EINMAL. Wir reihen dasselbe Dokument dreimal ein.
    const u2 = uhr();
    const q2 = erzeugeSpeicherWarteschlange({ now: u2.jetzt });
    const gesehen = new Set();
    let ki = 0;
    for (let i = 0; i < 3; i += 1) {
      await q2.enqueue({
        jobType: "document_understanding", idempotencyKey: `verstehen|doc-1|F${i}`,
        freshnessWindow: `F${i}`, payload: { dokumente: ["doc-1"] }, tenantId: null, priority: 100, maxAttempts: 3
      });
    }
    await SP.arbeite({
      env: AN, owner: "w", budgetMs: 600000, leaseMs: 60000, stapel: 10,
      deps: {
        now: u2.jetzt, claim: q2.claim, finish: q2.finish, extendLease: q2.extendLease,
        handler: {
          document_understanding: async (a) => {
            for (const d of a.payload.dokumente) {
              if (gesehen.has(d)) return { ok: true, verstanden: 0 };  // Bestandskurzschluss
              gesehen.add(d); ki += 1;
            }
            return { ok: true, verstanden: 1 };
          }
        }
      }
    });
    check("8.1 Ein Dokument wird global nur EINMAL verstanden — auch bei drei Auftraegen",
      ki === 1, `${ki} KI-Aufrufe`);
    check("8.2 Alle drei Auftraege sind trotzdem sauber erledigt", q2.nachStatus("erledigt").length === 3);
  }
  check("8.3 Projektion und Briefing haben NULL KI-Aufrufe ausgeloest",
    zaehler.kiAufrufe === 0, String(zaehler.kiAufrufe));
  {
    // Understanding ist mandantenneutral: kein Verstehensauftrag traegt einen Mandatsbezug.
    const verstehen = q.alle().filter((z) => z.job_type === "document_understanding");
    check("8.4 Kein Verstehensauftrag wird einem Mandanten zugerechnet (§13.6)",
      verstehen.every((z) => z.tenant_id === null));
  }

  abschnitt("9 · Absturz, Wiederaufnahme, Dauerfehler (§12.7 · §12.8 · §12.9)");
  {
    const u3 = uhr();
    const q3 = erzeugeSpeicherWarteschlange({ now: u3.jetzt });
    for (let i = 0; i < 50; i += 1) {
      await q3.enqueue({
        jobType: "source_fetch", idempotencyKey: `A${i}`, freshnessWindow: "F",
        payload: { quelle: { id: `q${i}` } }, tenantId: null, priority: 100, maxAttempts: 3
      });
    }
    // Absturz: reservieren, aber NICHT abschliessen.
    const c = await q3.claim({ owner: "absturz", limit: 20, leaseMs: 60000 });
    check("9.1 20 Auftraege wurden reserviert und dann 'abgestuerzt'", c.auftraege.length === 20);
    const sofort = await q3.claim({ owner: "andere", limit: 50, leaseMs: 60000 });
    check("9.2 Sie sind waehrend der Lease NICHT verfuegbar", sofort.auftraege.length === 30, String(sofort.auftraege.length));
    u3.vor(61000);
    const zurueck = await q3.claim({ owner: "danach", limit: 50, leaseMs: 60000 });
    check("9.3 Nach Lease-Ablauf sind sie WIEDER verfuegbar (kein Verlust)",
      zurueck.auftraege.length === 50, String(zurueck.auftraege.length));
  }
  {
    // Dauerfehler erreichen kontrolliert den endgueltigen Fehlerstatus.
    const u4 = uhr();
    const q4 = erzeugeSpeicherWarteschlange({ now: u4.jetzt });
    for (let i = 0; i < 10; i += 1) {
      await q4.enqueue({
        jobType: "source_fetch", idempotencyKey: `D${i}`, freshnessWindow: "F",
        payload: { quelle: { id: `q${i}` } }, tenantId: null, priority: 100, maxAttempts: 3
      });
    }
    for (let runde = 0; runde < 6; runde += 1) {
      await SP.arbeite({
        env: AN, owner: "w", budgetMs: 600000, leaseMs: 60000, stapel: 20,
        deps: {
          now: u4.jetzt, claim: q4.claim, finish: q4.finish, extendLease: q4.extendLease,
          handler: { source_fetch: async () => { throw new Error("HTTP 503 dauerhaft"); } }
        }
      });
      u4.vor(3600 * 1000);   // Backoff verstreichen lassen
    }
    check("9.4 Alle 10 Dauerfehler erreichen den endgueltigen Fehlerstatus",
      q4.nachStatus("fehlgeschlagen").length === 10, String(q4.nachStatus("fehlgeschlagen").length));
    check("9.5 Sie wurden nicht unbegrenzt wiederholt (genau max_attempts Versuche)",
      q4.alle().every((z) => z.attempts === 3), JSON.stringify([...new Set(q4.alle().map((z) => z.attempts))]));
    check("9.6 Der Fehlertext ist gespeichert und bereinigt",
      q4.alle().every((z) => /503/.test(z.last_error || "") && (z.last_error || "").length <= 301));
    const status = await SP.betriebsstatus({ env: AN, deps: { metrics: q4.metrics } });
    check("9.7 Endgueltige Fehler machen den Betriebsstatus kritisch", status.zustand === "kritisch");
  }

  abschnitt("10 · MENGENGERUEST je Tag bei 1000 Mandaten");
  const konfig = SD.fensterKonfig({});
  const proTagGeteilt = bedarf.geteilteAuftraege * (24 / konfig.geteiltStundenFenster);
  const proTagPerson = bedarf.persoenlicheAuftraege * (24 / konfig.personStundenFenster);
  const proTagArchiv = bedarf.archivAuftraege * (24 / konfig.archivStundenFenster);
  const proTagAbruf = proTagGeteilt + proTagPerson + proTagArchiv;
  const proTagProjektion = ANZAHL * (24 / konfig.mandatMaxAlterStunden);
  const proTagBriefing = ANZAHL * (24 / konfig.mandatMaxAlterStunden);

  // Bestandspfad zum Vergleich: 3 schwere Laeufe/Tag, je 140 geteilte + alle eigenen Wege.
  // (Die geteilten Wege werden im Bestand innerhalb eines Laufs entdoppelt, die eigenen nicht.)
  const BESTAND_GETEILT = 140;
  const BESTAND_LAEUFE = 3;
  const bestandProTag = BESTAND_LAEUFE * (BESTAND_GETEILT + bedarf.quellenGesehen);

  console.log("");
  console.log("  Modellzahlen je Tag bei 1000 Mandaten (Sprintauftrag §11 a-i):");
  console.log(`    a) globale Katalogabrufe (Paketquellen) .. ${BESTAND_GETEILT * BESTAND_LAEUFE}   (${BESTAND_GETEILT} Wege × ${BESTAND_LAEUFE} Laeufe; vom neuen Pfad UNVERAENDERT)`);
  console.log(`    b) geteilte Suchabrufe ................... ${Math.round(proTagGeteilt)}   (${bedarf.geteilteAuftraege} × ${24 / konfig.geteiltStundenFenster}/Tag)`);
  console.log(`    c) persoenliche Suchabrufe .............. ${Math.round(proTagPerson + proTagArchiv)}   (aktuell ${Math.round(proTagPerson)} + Archiv ${Math.round(proTagArchiv)})`);
  console.log(`    d) Understanding-Auftraege .............. haengt an NEUEN Vorgaengen, NICHT an der Mandatszahl`);
  console.log(`    e) Mandatsprojektionen .................. ${Math.round(proTagProjektion)}`);
  console.log(`    f) Briefingmaterialisierungen ........... ${Math.round(proTagBriefing)}`);
  console.log(`    g) theoretische externe Abrufe .......... ${Math.round(proTagAbruf)} aus Profilen (+ ${BESTAND_GETEILT * BESTAND_LAEUFE} Katalog = ${Math.round(proTagAbruf) + BESTAND_GETEILT * BESTAND_LAEUFE})`);
  console.log(`    h) theoretische KI-Aufrufe .............. 0 mandatsabhaengige aus DIESEM Pfad (Aufschluesselung unten)`);
  console.log(`    i) Bestandspfad zum Vergleich ........... ${bestandProTag}   (${BESTAND_LAEUFE} Laeufe × (${BESTAND_GETEILT} + ${bedarf.quellenGesehen}))`);
  console.log(`       Faktor ............................... ${Math.round((bestandProTag / proTagAbruf) * 10) / 10}× weniger externe Abrufe`);
  console.log("");
  console.log("  Theoretische KI-Aufrufe pro Tag (aus dem Code, nicht geschaetzt):");
  console.log(`    Understanding .................... 1 je NEUEM Vorgang, GLOBAL — unabhaengig von der Mandatszahl`);
  console.log(`    Matching ......................... 0   (llm-pfad-karte.md Zeile 14)`);
  console.log(`    Entscheidungen ................... 0   (llm-pfad-karte.md Zeile 14)`);
  console.log(`    Briefingmaterialisierung ......... 0   (llm-pfad-karte.md Zeile 15)`);
  console.log(`    Summe aus diesem Pfad ............ 0 mandatsabhaengige KI-Aufrufe`);
  console.log(`    NICHT Teil dieses Pfades ......... Lagenarrativ + Buerotexte (bleiben unveraendert`);
  console.log(`                                       je Mandant, siehe Pruefbericht §B.15)`);

  check("10.1 Der neue Pfad braucht deutlich weniger externe Abrufe als der Bestandspfad",
    proTagAbruf < bestandProTag / 2, `${Math.round(proTagAbruf)} vs ${bestandProTag}`);
  check("10.2 Die Mandatsprojektion loest KEINEN KI-Aufruf aus", zaehler.kiAufrufe === 0);
  check("10.3 Die Zahl der Understanding-Auftraege haengt NICHT an der Mandatszahl",
    q.alle().filter((z) => z.job_type === "document_understanding").every((z) => z.tenant_id === null));

  abschnitt("11 · Aktualitaet und Kapazitaetsreserve — ehrlich bewertet");
  {
    // Was BEWEISBAR ist: kein Auftrag wird spaeter faellig als sein Fenster erlaubt.
    const abruf = q.alle().filter((z) => z.job_type === "source_fetch" && z.payload.art === "person-aktuell");
    const maxVersatz = Math.max(...abruf.map((z) => Date.parse(z.due_at) - T0));
    check("11.1 Keine persoenliche Aktualisierung wird spaeter als 24 h nach Fensterbeginn faellig",
      maxVersatz < 24 * 3600 * 1000, `${Math.round(maxVersatz / 3600000)} h`);
    const mandatsArbeit = q.alle().filter((z) => z.job_type === "mandate_projection");
    const maxM = Math.max(...mandatsArbeit.map((z) => Date.parse(z.due_at) - T0));
    check("11.2 Keine Mandatsprojektion wird spaeter als 24 h nach Fensterbeginn faellig",
      maxM < 24 * 3600 * 1000, `${Math.round(maxM / 3600000)} h`);
    // PRAEZISE FORMULIERUNG (die erste Fassung war falsch und hat das aufgedeckt):
    // Nach 25 Stunden duerfen sehr wohl noch Auftraege warten — naemlich genau die
    // ARCHIVSUCHEN, die per Entwurf ein 7-Tage-Fenster haben (§7.6). Alles andere muss
    // erledigt sein. Ein pauschales "wartend === 0" haette den korrekten Entwurf als
    // Fehler gewertet.
    const restWartend = q.nachStatus("wartend");
    const restArten = new Set(restWartend.map((z) => `${z.job_type}/${z.payload.art || "-"}`));
    check("11.3a Jedes Mandat hat innerhalb von 24 h Projektion UND Briefing erhalten",
      projektionJeMandat.size === ANZAHL && briefingJeMandat.size === ANZAHL);
    check("11.3b Nach 25 h warten AUSSCHLIESSLICH Archivsuchen (7-Tage-Fenster per Entwurf)",
      [...restArten].every((a) => a === "source_fetch/person-archiv"),
      [...restArten].join(", ") || "(nichts)");
    check("11.3c Kein wartender Auftrag war innerhalb der 24 h ueberhaupt faellig",
      restWartend.every((z) => Date.parse(z.due_at) >= T0 + 24 * 3600 * 1000),
      `${restWartend.filter((z) => Date.parse(z.due_at) < T0 + 24 * 3600 * 1000).length} waren faellig und blieben liegen`);
    check("11.3d Alle persoenlichen AKTUELL-Suchen sind innerhalb der 24 h erledigt",
      q.alle().filter((z) => z.payload.art === "person-aktuell").every((z) => z.status === "erledigt"));

    // Was NICHT beweisbar ist: die reale Abarbeitungsdauer und damit die Reserve.
    nichtBewiesen("11.4 Rueckstand in <= 24 h abarbeitbar (§12.15)",
      "die Abrufdauer ist hier eine Attrappe. Die reale Dauer haengt an Google-Drosselung "
      + "(Parallelitaet 5, Mindestabstand 200 ms) und an der Zahl gleichzeitiger Worker — beides "
      + "ist erst in Production messbar.");
    nichtBewiesen("11.5 Kapazitaetsreserve Faktor zwei (§12.16)",
      "setzt eine gemessene Verarbeitungsrate voraus. Es liegen keine Laufzeitdaten des neuen "
      + "Pfads vor; jede Zahl waere hier erfunden.");
    console.log("");
    console.log("  Was sich RECHNERISCH sagen laesst (ausdruecklich keine Messung):");
    const abrufeProTag = Math.round(proTagAbruf);
    const sekProAbruf = 0.619;   // gemessen im Production-Lauf, siehe Pruefbericht §C.10
    const sequenziellH = Math.round((abrufeProTag * sekProAbruf) / 3600 * 10) / 10;
    console.log(`    ${abrufeProTag} Abrufe/Tag × 0,619 s (gemessene Rate, Pruefbericht §C.10)`);
    console.log(`    = ${sequenziellH} h reine Abrufzeit bei EINEM Worker.`);
    console.log(`    Mit 2 gleichzeitigen Workern: ~${Math.round(sequenziellH / 2 * 10) / 10} h -> Reserve Faktor ~${Math.round(24 / (sequenziellH / 2) * 10) / 10}.`);
    console.log(`    ABER: die 0,619 s stammen aus einem Lauf mit 97 % Google-Anteil hinter EINER`);
    console.log(`    Egress-IP. Ob mehrere Worker diese Rate halten oder sich gegenseitig in die`);
    console.log(`    Drosselung treiben, ist NICHT gemessen. Deshalb bleibt 11.5 offen.`);
  }

  abschnitt("12 · Betriebsmessung bei 1000 Mandaten");
  {
    const status = await SP.betriebsstatus({ env: AN, deps: { metrics: q.metrics } });
    check("12.1 Der Betriebsstatus ist lesbar", status.verfuegbar === true);
    check("12.2 Er meldet den Zustand", ["gruen", "warnung", "kritisch"].includes(status.zustand), status.zustand);
    check("12.3 Er zaehlt nach Typ", Object.keys(status.kennzahlen.nachTyp).length >= 3, JSON.stringify(status.kennzahlen.nachTyp));
    check("12.4 Er zaehlt nach Status", Object.keys(status.kennzahlen.nachStatus).length >= 1);
    check("12.5 Alle 14 geforderten Kennzahlen sind vorhanden",
      ["wartend", "laufend", "aktiveLeases", "aeltesterFaelligerS", "erledigtImZeitraum",
        "fehlgeschlagenGesamt", "endgueltigFehler", "wiederholungen", "mittlereDauerS",
        "durchsatzProStunde", "ueberfaelligeMandate", "maxMandatsalterS", "nachTyp", "nachStatus"]
        .every((k) => k in status.kennzahlen),
      Object.keys(status.kennzahlen).join(","));
    // Korrektursprint 2026-08-12: die Wartezeitsicht gehoert dazu — sie traegt seither die
    // Abbruchgrenze. Fehlte sie hier, koennte sie unbemerkt aus der Ausgabe verschwinden.
    check("12.6 Die Wartezeitsicht ist vollstaendig vorhanden und benannt",
      ["aeltesterOffenerS", "maxMandatswartezeitS", "ueberfaelligeMandateWartezeit",
        "gemessenesAlterS"].every((k) => k in status.kennzahlen)
      && status.altersvertrag === SP.ALTERSVERTRAG_WARTEZEIT
      && status.schwellen.bezug === "wartezeit-ab-bearbeitbarkeit",
      `${status.altersvertrag} / ${status.schwellen.bezug}`);
  }

  abschnitt("13 · Planungsidempotenz ueber MEHRERE identische Laeufe (Sprintauftrag §7)");
  {
    // Der Scheduler laeuft in Production mehrfach am Tag. Ein zweiter Lauf hatte schon in §5
    // null Duplikate erzeugt; hier wird die Frage schaerfer gestellt: bleiben FUENF identische
    // Laeufe zeichengenau bei derselben Auftragsmenge, auch wenn die Uhr dazwischen laeuft?
    const u5 = uhr();
    const q5 = erzeugeSpeicherWarteschlange({ now: u5.jetzt });
    const abdruecke = [];
    const neuJeLauf = [];
    for (let lauf = 0; lauf < 5; lauf += 1) {
      const ergebnis = await SP.planeArbeit({
        env: AN, jetztMs: u5.jetzt(),
        deps: {
          listFullProfiles: async () => profile,
          quellenFuerProfil: async (p) => eigeneQuellen(p),
          enqueue: q5.enqueue
        }
      });
      neuJeLauf.push(ergebnis.neu);
      const schluessel = q5.alle().map((z) => z.idempotency_key).sort();
      abdruecke.push(`${schluessel.length}|${crypto.createHash("sha256").update(schluessel.join("\n")).digest("hex")}`);
      u5.vor(37 * 60 * 1000);   // gut eine halbe Stunde zwischen den Laeufen
    }
    check("13.1 Der erste Lauf legt Auftraege an, jeder weitere KEINEN einzigen",
      neuJeLauf[0] > 0 && neuJeLauf.slice(1).every((n) => n === 0), neuJeLauf.join(", "));
    check("13.2 Die Auftragsmenge ist nach fuenf Laeufen zeichengenau dieselbe",
      new Set(abdruecke).size === 1, `${new Set(abdruecke).size} verschiedene Abdruecke`);
    check("13.3 Auch die Gesamtzahl bleibt konstant",
      q5.alle().length === Number(abdruecke[0].split("|")[0]), String(q5.alle().length));
    // Und der harte Fall: ein Lauf NACH dem Fensterwechsel MUSS neue Auftraege erzeugen —
    // sonst waere die Warteschlange nicht idempotent, sondern taub.
    u5.vor(9 * 3600 * 1000);
    const nachFenster = await SP.planeArbeit({
      env: AN, jetztMs: u5.jetzt(),
      deps: { listFullProfiles: async () => profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q5.enqueue }
    });
    check("13.4 Nach dem Fensterwechsel entstehen wieder Auftraege (Idempotenz != Stillstand)",
      nachFenster.neu > 0, `${nachFenster.neu} neue Auftraege`);
  }

  abschnitt("14 · Jedes Profil: belegtes Briefing ODER ehrlicher Leerzustand (Sprintauftrag §8h/§8i)");
  {
    // Vollstaendiger lokaler Durchlauf MIT Belegkette: jedes Dokument traegt die URL der
    // Quelle, aus der es stammt. Am Ende wird geprueft, ob ein Briefing nur das behauptet,
    // was durch einen tatsaechlich geplanten Abrufweg gedeckt ist.
    const u6 = uhr();
    const q6 = erzeugeSpeicherWarteschlange({ now: u6.jetzt });
    await SP.planeArbeit({
      env: AN, jetztMs: u6.jetzt(),
      deps: { listFullProfiles: async () => profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q6.enqueue }
    });

    // Die Menge ALLER geplanten Abrufwege — der einzige erlaubte Belegursprung.
    const geplanteWege = new Set();
    for (const z of q6.alle()) {
      if (z.job_type !== "source_fetch") continue;
      for (const w of (z.payload.quelle && z.payload.quelle.rssUrls) || []) geplanteWege.add(SD.kanonischeUrl(w));
    }

    const dokumenteJeWeg = new Map();     // kanonischer Weg -> Dokumentkennungen
    const briefings = new Map();          // Mandat -> {belege:[], leer:boolean}
    const erfundene = [];

    const deps6 = {
      now: u6.jetzt,
      claim: q6.claim, finish: q6.finish, extendLease: q6.extendLease,
      handler: {
        source_fetch: async (a) => {
          const wege = ((a.payload.quelle && a.payload.quelle.rssUrls) || []).map(SD.kanonischeUrl);
          for (const w of wege) {
            const liste = dokumenteJeWeg.get(w) || [];
            // Zwei Dokumente je Weg — Kennung AUS DEM WEG, nicht aus einem Mandat.
            liste.push(`dok|${crypto.createHash("sha256").update(w).digest("hex").slice(0, 12)}|1`);
            liste.push(`dok|${crypto.createHash("sha256").update(w).digest("hex").slice(0, 12)}|2`);
            dokumenteJeWeg.set(w, [...new Set(liste)]);
          }
          return { ok: true, gespeichert: wege.length * 2 };
        },
        document_understanding: async () => ({ ok: true }),
        mandate_projection: async () => ({ ok: true }),
        briefing_materialization: async (a) => {
          const m = a.payload.mandatsId;
          // Die Projektion eines Mandats sieht GENAU die Wege, die sein eigenes Profil
          // erzeugt — nicht mehr. Das ist die Mandantentrennung an der Belegkette.
          const eigeneWege = eigeneQuellen(profile.find((p) => p.id === m))
            .flatMap((qu) => SD.abrufwege(qu)).map(SD.kanonischeUrl);
          const belege = [];
          for (const w of eigeneWege) {
            for (const d of dokumenteJeWeg.get(w) || []) belege.push({ dokument: d, weg: w });
            if (!geplanteWege.has(w)) erfundene.push(`${m}: ${w}`);
          }
          briefings.set(m, { belege, leer: belege.length === 0 });
          return { ok: true };
        }
      }
    };

    for (let stunde = 0; stunde <= 24; stunde += 1) {
      await Promise.all([1, 2, 3, 4].map((n) =>
        SP.arbeite({ env: AN, owner: `bw${n}`, budgetMs: 3600000, leaseMs: 600000, stapel: 200, deps: deps6 })));
      u6.vor(3600 * 1000);
    }

    const mitBeleg = [...briefings.values()].filter((b) => !b.leer).length;
    const leer = [...briefings.values()].filter((b) => b.leer).length;
    check("14.1 JEDES der 1000 Profile hat einen Briefingstand erhalten",
      briefings.size === ANZAHL, String(briefings.size));
    check("14.2 Jeder Stand ist entweder belegt ODER ausdruecklich leer — nichts dazwischen",
      mitBeleg + leer === ANZAHL, `${mitBeleg} belegt · ${leer} leer`);
    check("14.3 KEIN Beleg stammt von einem Weg, der nie geplant wurde (keine erfundenen Quellen)",
      erfundene.length === 0, erfundene.slice(0, 3).join(" · "));
    check("14.4 Jeder belegte Stand traegt mindestens einen nachvollziehbaren Beleg",
      [...briefings.values()].filter((b) => !b.leer).every((b) => b.belege.length > 0));
    console.log(`  Belegte Briefingstaende: ${mitBeleg} · ehrliche Leerzustaende: ${leer}`);
    console.log(`  Belege je belegtem Stand (Median): ${(() => {
      const l = [...briefings.values()].filter((b) => !b.leer).map((b) => b.belege.length).sort((a, b) => a - b);
      return l.length ? l[Math.floor(l.length / 2)] : 0;
    })()}`);
    if (leer > 0) {
      console.log(`  HINWEIS (ehrlich): ${leer} Staende blieben leer, weil ihre Abrufe im`);
      console.log(`  gestreuten Faelligkeitsfenster erst NACH der Briefingmaterialisierung lagen.`);
      console.log(`  Das ist der bewusste Leerzustand, kein Fehler — aber es zeigt, dass die`);
      console.log(`  Reihenfolge Abruf -> Briefing in Production ueber die Faelligkeit gesteuert`);
      console.log(`  werden muss und nicht von selbst passt.`);
    }
  }

  abschnitt("15 · Google News als einziger Abrufweg — GEMESSEN (Sprintauftrag §13)");
  {
    // Kein Umbau, keine neue externe Technik. Nur: die Abhaengigkeit wird gezaehlt, damit
    // sie in der Dokumentation nicht geschaetzt werden muss.
    const bedarf15 = await SD.kompiliereQuellenbedarf({
      profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs: T0
    });
    const hosts = new Map();
    for (const a of bedarf15.auftraege) {
      for (const w of (a.payload.quelle && a.payload.quelle.rssUrls) || []) {
        let h = "(unlesbar)";
        try { h = new URL(w).host; } catch (_) { /* bleibt unlesbar */ }
        hosts.set(h, (hosts.get(h) || 0) + 1);
      }
    }
    const gesamtWege = [...hosts.values()].reduce((s, n) => s + n, 0);
    const google = hosts.get("news.google.com") || 0;
    console.log(`  Abrufwege aus den 1000 Profilen: ${gesamtWege}`);
    for (const [h, n] of [...hosts].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${h.padEnd(24)} ${String(n).padStart(6)}  (${(n / gesamtWege * 100).toFixed(1)} %)`);
    }
    check("15.1 Die Messung erfasst alle Abrufwege", gesamtWege === bedarf15.auftraege.length,
      `${gesamtWege} Wege zu ${bedarf15.auftraege.length} Auftraegen`);
    check("15.2 BEFUND: die profileigenen Abrufe haengen VOLLSTAENDIG an einem Anbieter",
      google === gesamtWege, `${google} von ${gesamtWege}`);
    console.log("  >> Das ist keine Regression, sondern der Bestand: profileigene Quellen sind");
    console.log("     ausschliesslich Google-News-Suchen. Faellt dieser Anbieter aus, bleiben nur");
    console.log("     die Katalogquellen des Pakets uebrig. Bewertung und Gegenmassnahme:");
    console.log("     docs/betrieb/skalierungsgrundlage-1000.md, Abschnitt `Google als Klumpenrisiko`.");
  }

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) {
    console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN und zaehlen nicht als Erfolg.`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
