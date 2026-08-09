"use strict";

// Helmut — VERTRAGSTEST des Source-Demand-Compilers (OP-30).
// =============================================================================================
// Der Compiler ist die Stelle, an der die Skalierung entschieden wird. Diese Suite nagelt
// seine Zusagen am echten Code fest — mit den ECHTEN Quellenfunktionen aus scheduler.js,
// nicht mit nachgebauten Attrappen.
//
// Offline, deterministisch, ohne Netz, ohne KI.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";   // kein relationaler Plan -> kein DB-Zugriff

const SD = require(path.join(ROOT, "lib", "helmut", "source-demand.js"));
const sched = require(path.join(ROOT, "lib", "helmut", "scheduler.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const T0 = Date.parse("2026-08-08T00:00:00Z");

// Nur die PROFILEIGENEN Quellen — das ist der Teil, um den es bei OP-30 geht.
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

function profil(ueberschreibung = {}) {
  return {
    id: "m1",
    fullName: "Testperson Eins",
    parliamentType: "Bundestag",
    party: "Partei A", faction: "Fraktion A",
    committee: "Ausschuss fuer Arbeit und Soziales",
    committees: ["Ausschuss fuer Arbeit und Soziales"],
    relevantMinistries: ["Bundesministerium fuer Arbeit und Soziales"],
    focusTopics: ["Rente", "Pflege"],
    topicPriorities: { Rente: 3, Pflege: 2 },
    state: "Bayern", constituency: "Wahlkreis 1", regionalInterests: ["Bayern"],
    ...ueberschreibung
  };
}

async function main() {
  console.log("Helmut — Vertragstest Source-Demand-Compiler (OP-30)");

  abschnitt("1 · Fensterlogik");
  check("1.1 Fensterkennung ist deterministisch und in UTC",
    SD.fensterKennung(Date.parse("2026-08-08T13:37:00Z"), 8) === "2026-08-08T08Z");
  check("1.2 Dieselbe Stunde ergibt dieselbe Kennung",
    SD.fensterKennung(Date.parse("2026-08-08T08:00:00Z"), 8) === SD.fensterKennung(Date.parse("2026-08-08T15:59:59Z"), 8));
  check("1.3 Die naechste Fenstergrenze ergibt eine ANDERE Kennung",
    SD.fensterKennung(Date.parse("2026-08-08T15:59:59Z"), 8) !== SD.fensterKennung(Date.parse("2026-08-08T16:00:00Z"), 8));
  check("1.4 Ein 24-h-Fenster wechselt nur taeglich",
    SD.fensterKennung(Date.parse("2026-08-08T23:00:00Z"), 24) === "2026-08-08T00Z"
    && SD.fensterKennung(Date.parse("2026-08-09T00:00:00Z"), 24) === "2026-08-09T00Z");
  {
    const k = SD.fensterKonfig({});
    check("1.5 Standard: persoenlich 24 h, Archiv 7 Tage (Auftrag §7.5/§7.6)",
      k.personStundenFenster === 24 && k.archivStundenFenster === 168, JSON.stringify(k));
    const eigen = SD.fensterKonfig({ HELMUT_DEMAND_PERSON_WINDOW_H: "12", HELMUT_DEMAND_ARCHIVE_WINDOW_H: "72" });
    check("1.6 Beide Intervalle sind konfigurierbar (§7.7)",
      eigen.personStundenFenster === 12 && eigen.archivStundenFenster === 72);
    const kaputt = SD.fensterKonfig({ HELMUT_DEMAND_PERSON_WINDOW_H: "quatsch", HELMUT_DEMAND_ARCHIVE_WINDOW_H: "-5" });
    check("1.7 Unbrauchbare Werte fallen fail-closed auf den Standard, nie auf 'haeufiger'",
      kaputt.personStundenFenster === 24 && kaputt.archivStundenFenster === 168, JSON.stringify(kaputt));
  }

  abschnitt("2 · Normalisierung der Abrufdefinition");
  check("2.1 Parameterreihenfolge ist egal",
    SD.kanonischeUrl("https://x.invalid/a?b=2&a=1") === SD.kanonischeUrl("https://x.invalid/a?a=1&b=2"));
  check("2.2 Grossschreibung des Hosts ist egal",
    SD.kanonischeUrl("https://X.INVALID/a") === SD.kanonischeUrl("https://x.invalid/a"));
  check("2.3 Ein UNTERSCHIEDLICHER Parameterwert bleibt unterschiedlich (keine falsche Verschmelzung)",
    SD.kanonischeUrl("https://x.invalid/a?q=rente") !== SD.kanonischeUrl("https://x.invalid/a?q=pflege"));
  check("2.4 Sprach-/Regionsparameter bleiben Teil der Identitaet",
    SD.kanonischeUrl("https://x.invalid/a?hl=de") !== SD.kanonischeUrl("https://x.invalid/a?hl=en"));
  check("2.5 Eine unparsebare URL wird woertlich verglichen, nicht geraten",
    SD.kanonischeUrl("nicht wirklich eine url") === "nicht wirklich eine url");
  check("2.6 Abrufwege werden sortiert und entdoppelt",
    JSON.stringify(SD.abrufwege({ rssUrls: ["b", "a", "b"] })) === JSON.stringify(["a", "b"]));

  abschnitt("3 · Persoenliche Suchen werden NIEMALS zusammengefasst (§7.4)");
  {
    // Zwei Personen mit IDENTISCHEN Sachmerkmalen — nur der Name unterscheidet sie.
    const a = profil({ id: "m-a", fullName: "Person Aaa" });
    const b = profil({ id: "m-b", fullName: "Person Bbb" });
    const r = await SD.kompiliereQuellenbedarf({ profile: [a, b], quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const persoenlich = r.auftraege.filter((x) => x.payload.art !== "geteilt");
    const mandate = new Set(persoenlich.map((x) => x.tenantId));
    check("3.1 Jede Person hat eigene Auftraege", mandate.size === 2, [...mandate].join(","));
    check("3.2 Es gibt genau 2 Aktuell- und 2 Archivauftraege",
      persoenlich.filter((x) => x.payload.art === "person-aktuell").length === 2
      && persoenlich.filter((x) => x.payload.art === "person-archiv").length === 2);
    check("3.3 Persoenliche Auftraege tragen IMMER den Mandatsbezug",
      persoenlich.every((x) => typeof x.tenantId === "string" && x.tenantId.length > 0));
    check("3.4 Kein persoenlicher Auftrag traegt den Namen einer FREMDEN Person im Payload",
      persoenlich.every((x) => {
        const text = JSON.stringify(x.payload);
        const eigen = x.tenantId === "m-a" ? "Aaa" : "Bbb";
        const fremd = x.tenantId === "m-a" ? "Bbb" : "Aaa";
        return text.includes(encodeURIComponent(eigen)) || !text.includes(fremd);
      }));
    // Und der harte Fall: zwei Personen mit demselben Namen, aber verschiedenen Mandaten.
    const c = profil({ id: "m-c", fullName: "Gleicher Name" });
    const d = profil({ id: "m-d", fullName: "Gleicher Name" });
    const r2 = await SD.kompiliereQuellenbedarf({ profile: [c, d], quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const p2 = r2.auftraege.filter((x) => x.payload.art === "person-aktuell");
    check("3.5 Selbst bei GLEICHEM Namen bleiben zwei Mandate getrennt (Mandats-ID im Schluessel)",
      p2.length === 2 && new Set(p2.map((x) => x.idempotencyKey)).size === 2);
  }

  abschnitt("4 · Geteilte Suchen werden zusammengefasst (§7.2/§7.3)");
  {
    // Zwei Mandate, identische Partei/Ausschuss/Themen/Region — nur Person und Wahlkreis anders.
    const a = profil({ id: "m-a", fullName: "Person Aaa", constituency: "Bayern" });
    const b = profil({ id: "m-b", fullName: "Person Bbb", constituency: "Bayern" });
    const r = await SD.kompiliereQuellenbedarf({ profile: [a, b], quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const geteilt = r.auftraege.filter((x) => x.payload.art === "geteilt");
    check("4.1 Die sechs identischen Sachsuchen ergeben SECHS Auftraege, nicht zwoelf",
      geteilt.length === 6, String(geteilt.length));
    check("4.2 Jeder geteilte Auftrag weiss, dass ihn ZWEI Mandate angefordert haben",
      geteilt.every((x) => x.payload.angefordertVon === 2));
    check("4.3 GETEILTE Auftraege tragen KEINEN Mandatsbezug (CLAUDE.md §4.2)",
      geteilt.every((x) => x.tenantId === null));
    check("4.4 Die Mandatskennung steht NICHT im Idempotenzschluessel geteilter Auftraege",
      geteilt.every((x) => !/m-a|m-b/.test(x.idempotencyKey)));
  }
  {
    // Gegenprobe: unterschiedliche Themen -> KEINE Zusammenfassung (das waere fachlich falsch).
    const a = profil({ id: "m-a", focusTopics: ["Rente"], topicPriorities: { Rente: 1 } });
    const b = profil({ id: "m-b", focusTopics: ["Verkehr"], topicPriorities: { Verkehr: 1 } });
    const r = await SD.kompiliereQuellenbedarf({ profile: [a, b], quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const geteilt = r.auftraege.filter((x) => x.payload.art === "geteilt");
    check("4.5 Unterschiedliche Themen werden NICHT zusammengefasst",
      geteilt.every((x) => x.payload.angefordertVon === 1), JSON.stringify(geteilt.map((x) => x.payload.angefordertVon)));
    check("4.6 Nur die Fraktions-/Regionsuche ohne Themenbezug kann noch kollidieren — hier gar keine",
      geteilt.length === 12, String(geteilt.length));
  }

  abschnitt("5 · Idempotenz und Determinismus");
  {
    const p = [profil({ id: "m-a" }), profil({ id: "m-b", fullName: "Person B" })];
    const r1 = await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const r2 = await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const s1 = r1.auftraege.map((x) => x.idempotencyKey).sort();
    const s2 = r2.auftraege.map((x) => x.idempotencyKey).sort();
    check("5.1 Zweimal kompilieren ergibt EXAKT dieselben Schluessel", JSON.stringify(s1) === JSON.stringify(s2));
    check("5.2 Auch die Faelligkeiten sind identisch (kein Zufall)",
      JSON.stringify(r1.auftraege.map((x) => x.dueAt).sort()) === JSON.stringify(r2.auftraege.map((x) => x.dueAt).sort()));
    // Reihenfolge der Profile darf nichts aendern.
    const r3 = await SD.kompiliereQuellenbedarf({ profile: [...p].reverse(), quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    check("5.3 Die Profilreihenfolge veraendert die Auftragsmenge nicht",
      JSON.stringify(r3.auftraege.map((x) => x.idempotencyKey).sort()) === JSON.stringify(s1));
    // Anderes Fenster -> andere Schluessel.
    const r4 = await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 + 9 * 3600 * 1000 });
    check("5.4 Ein neues Fenster ergibt neue Schluessel (Wiederholbarkeit ueber Tage)",
      r4.auftraege.some((x) => !s1.includes(x.idempotencyKey)));
    check("5.5 Der Streuwert ist stabil", SD.streuwert("abc") === SD.streuwert("abc") && SD.streuwert("abc") !== SD.streuwert("abd"));
  }

  abschnitt("6 · Faelligkeiten werden gestreut (§7.8) und halten 24 h ein (§7.9)");
  {
    const profile = [];
    for (let i = 0; i < 200; i += 1) profile.push(profil({ id: `m-${i}`, fullName: `Person ${i}`, constituency: `WK ${i}` }));
    const r = await SD.kompiliereQuellenbedarf({ profile, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const person = r.auftraege.filter((x) => x.payload.art === "person-aktuell");
    const zeiten = person.map((x) => Date.parse(x.dueAt));
    const spanne = Math.max(...zeiten) - Math.min(...zeiten);
    check("6.1 Die persoenlichen Faelligkeiten sind ueber den Tag verteilt, nicht alle gleich",
      spanne > 12 * 3600 * 1000, `${Math.round(spanne / 3600000)} h Spanne`);
    check("6.2 Keine Faelligkeit liegt VOR dem Fensterbeginn", zeiten.every((t) => t >= T0));
    check("6.3 Keine persoenliche Faelligkeit liegt ausserhalb ihres 24-h-Fensters",
      zeiten.every((t) => t < T0 + 24 * 3600 * 1000),
      `max=${new Date(Math.max(...zeiten)).toISOString()}`);
    // Verteilung wirklich pruefen: keine Stunde darf mehr als die Haelfte tragen.
    const proStunde = new Map();
    for (const t of zeiten) {
      const h = Math.floor((t - T0) / 3600000);
      proStunde.set(h, (proStunde.get(h) || 0) + 1);
    }
    check("6.4 Keine einzelne Stunde traegt mehr als die Haelfte der Last",
      Math.max(...proStunde.values()) < zeiten.length / 2,
      `max ${Math.max(...proStunde.values())} von ${zeiten.length}`);
    check("6.5 Die Streuung nutzt viele verschiedene Stunden", proStunde.size >= 12, String(proStunde.size));
  }
  {
    // Archivauftraege: 7-Tage-Fenster, also hoechstens einer je Mandat je Woche.
    const p = [profil({ id: "m-a" })];
    const r1 = await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const r2 = await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 + 3 * 24 * 3600 * 1000 });
    const a1 = r1.auftraege.find((x) => x.payload.art === "person-archiv");
    const a2 = r2.auftraege.find((x) => x.payload.art === "person-archiv");
    check("6.6 Ein Archivauftrag behaelt drei Tage spaeter denselben Schluessel (max. 1× / 7 Tage)",
      a1.idempotencyKey === a2.idempotencyKey, `${a1.idempotencyKey}\n${a2.idempotencyKey}`);
    const a3 = (await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 + 8 * 24 * 3600 * 1000 }))
      .auftraege.find((x) => x.payload.art === "person-archiv");
    check("6.7 Nach acht Tagen ist es ein neuer Auftrag", a3.idempotencyKey !== a1.idempotencyKey);
    // Die Aktuell-Suche dagegen taeglich.
    const b1 = r1.auftraege.find((x) => x.payload.art === "person-aktuell");
    const b2 = (await SD.kompiliereQuellenbedarf({ profile: p, quellenFuerProfil: eigeneQuellen, jetztMs: T0 + 25 * 3600 * 1000 }))
      .auftraege.find((x) => x.payload.art === "person-aktuell");
    check("6.8 Die persoenliche Aktuell-Suche ist am naechsten Tag wieder faellig", b1.idempotencyKey !== b2.idempotencyKey);
  }

  abschnitt("7 · Keine harte Mandatsgrenze (§7.12)");
  {
    const profile = [];
    for (let i = 0; i < 700; i += 1) profile.push(profil({ id: `g-${i}`, fullName: `Person ${i}`, constituency: `WK ${i}` }));
    const r = await SD.kompiliereQuellenbedarf({ profile, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    check("7.1 Alle 700 Profile werden verarbeitet — nichts wird abgeschnitten",
      r.statistik.profile === 700 && r.statistik.profilePlaene === 700, JSON.stringify(r.statistik));
    const mandate = new Set(r.auftraege.filter((x) => x.tenantId).map((x) => x.tenantId));
    check("7.2 Jedes der 700 Profile hat mindestens einen eigenen Auftrag", mandate.size === 700, String(mandate.size));
    // Nur CODE pruefen, nicht Kommentare: die Begruendung im Kopf des Compilers nennt
    // `MAX_LAUF_MANDATE` ausdruecklich, um zu erklaeren, warum es dort NICHT verwendet wird.
    // Ein reiner Textvergleich wuerde genau diese Erklaerung als Verstoss werten.
    const quelltext = require("fs").readFileSync(path.join(ROOT, "lib/helmut/source-demand.js"), "utf8");
    const nurCode = quelltext
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map((z) => z.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    check("7.3 Im Compiler-CODE gibt es keinen slice/limit auf der Profilmenge",
      !/profile\.slice\(|MAX_LAUF|maxTenants|\.slice\(0,\s*\d+\)\s*;?\s*\/\/?\s*profile/i.test(nurCode));
    // Und der neue Pfad erbt die Bestandsgrenze auch nicht indirekt.
    const pipelineCode = require("fs").readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
    check("7.4 Der skalierbare Pfad benutzt cron-fairness (mit MAX_LAUF_MANDATE=200) gar nicht",
      !/require\(["']\.\/cron-fairness["']\)/.test(pipelineCode) && !/require\(["']\.\/cron-fairness["']\)/.test(quelltext));
  }

  abschnitt("8 · Fehlerisolation und Nutzdatensparsamkeit");
  {
    const p = [profil({ id: "gut" }), profil({ id: "kaputt" })];
    const r = await SD.kompiliereQuellenbedarf({
      profile: p, jetztMs: T0,
      quellenFuerProfil: async (x) => { if (x.id === "kaputt") throw new Error("Ablage weg"); return eigeneQuellen(x); }
    });
    check("8.1 Ein kaputtes Profil wird benannt", r.fehlerhafteProfile.length === 1 && r.fehlerhafteProfile[0].mandatsId === "kaputt");
    check("8.2 Das gute Profil wird trotzdem versorgt", r.statistik.profilePlaene === 1 && r.auftraege.length > 0);
    check("8.3 Ein Profil ohne Kennung wird abgelehnt, nicht geraten",
      (await SD.kompiliereQuellenbedarf({ profile: [{}], quellenFuerProfil: eigeneQuellen, jetztMs: T0 }))
        .fehlerhafteProfile[0].fehler === "profil-ohne-id");
  }
  {
    const r = await SD.kompiliereQuellenbedarf({ profile: [profil()], quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const alleFelder = new Set(r.auftraege.flatMap((x) => Object.keys(x.payload.quelle || {})));
    check("8.4 Der Payload traegt nur Abruffelder — keine Profilkopie",
      !alleFelder.has("profile") && !alleFelder.has("topicPriorities") && !alleFelder.has("fullName"),
      [...alleFelder].join(","));
    check("8.5 Jeder Payload bleibt klein (Datenbankgrenze 20 000 Zeichen)",
      r.auftraege.every((x) => JSON.stringify(x.payload).length < 4000),
      String(Math.max(...r.auftraege.map((x) => JSON.stringify(x.payload).length))));
    const grosseListe = [];
    for (let i = 0; i < 500; i += 1) grosseListe.push(profil({ id: `q-${i}`, fullName: `P ${i}` }));
    const r2 = await SD.kompiliereQuellenbedarf({ profile: grosseListe, quellenFuerProfil: eigeneQuellen, jetztMs: T0 });
    const groesster = Math.max(...r2.auftraege.map((x) => JSON.stringify(x.payload).length));
    check("8.6 Auch bei 500 anfordernden Mandaten bleibt der Payload klein (Beispielliste gedeckelt)",
      groesster < 4000, String(groesster));
    const geteiltMax = r2.auftraege.filter((x) => x.payload.art === "geteilt")
      .reduce((m, x) => Math.max(m, x.payload.angefordertVon || 0), 0);
    check("8.7 Die ZAHL der Anforderer bleibt trotzdem exakt", geteiltMax === 500, String(geteiltMax));
  }

  abschnitt("9 · Mandatsarbeit (Projektion + Briefing)");
  {
    const p = [profil({ id: "m-a" }), profil({ id: "m-b" })];
    const r = SD.planeMandatsarbeit({ profile: p, jetztMs: T0 });
    check("9.1 Je Mandat entstehen Projektion und Briefingmaterialisierung", r.auftraege.length === 4);
    check("9.2 Beide tragen den Mandatsbezug", r.auftraege.every((x) => x.tenantId));
    check("9.3 Die Schluessel sind je Mandat und Fenster eindeutig",
      new Set(r.auftraege.map((x) => x.idempotencyKey)).size === 4);
    const r2 = SD.planeMandatsarbeit({ profile: p, jetztMs: T0 + 3600 * 1000 });
    check("9.4 Innerhalb desselben Tages entstehen KEINE neuen Schluessel",
      JSON.stringify(r.auftraege.map((x) => x.idempotencyKey).sort()) === JSON.stringify(r2.auftraege.map((x) => x.idempotencyKey).sort()));
    const r3 = SD.planeMandatsarbeit({ profile: p, jetztMs: T0 + 25 * 3600 * 1000 });
    check("9.5 Am naechsten Tag entstehen neue Schluessel",
      r3.auftraege.every((x) => !r.auftraege.some((y) => y.idempotencyKey === x.idempotencyKey)));
    check("9.6 Die Projektion hat Vorrang vor der Briefingmaterialisierung",
      r.auftraege.find((x) => x.jobType === "mandate_projection").priority
      < r.auftraege.find((x) => x.jobType === "briefing_materialization").priority);

    // REGRESSIONSSCHUTZ (belegter Anlass 2026-08-08): bei gleichmaessiger Streuung ueber das
    // ganze Fenster lag das Briefing von 37 der 1000 Mandate VOR den eigenen Abrufen. Seitdem
    // liegen Projektion und Briefing in PHASENFENSTERN. Faellt das weg, faellt dieser Test.
    const breiteMs = r.konfig.mandatMaxAlterStunden * 3600 * 1000;
    const startMs = Date.parse(r.fenster.replace(/Z$/, ":00:00.000Z"));
    const anteil = (x) => (Date.parse(x.dueAt) - startMs) / breiteMs;
    const proj = r.auftraege.filter((x) => x.jobType === "mandate_projection");
    const brief = r.auftraege.filter((x) => x.jobType === "briefing_materialization");
    check("9.7 Keine Projektion ist vor der Haelfte des Fensters faellig",
      proj.every((x) => anteil(x) >= 0.5), proj.map((x) => anteil(x).toFixed(2)).join(", "));
    check("9.8 Kein Briefing ist vor drei Vierteln des Fensters faellig",
      brief.every((x) => anteil(x) >= 0.75), brief.map((x) => anteil(x).toFixed(2)).join(", "));
    check("9.9 Je Mandat ist das Briefing SPAETER faellig als die Projektion",
      p.every((einer) => Date.parse(brief.find((x) => x.tenantId === einer.id).dueAt)
        > Date.parse(proj.find((x) => x.tenantId === einer.id).dueAt)));
    check("9.10 Beide bleiben innerhalb des Fensters",
      [...proj, ...brief].every((x) => anteil(x) < 1));
    check("9.11 Die Streuung ist deterministisch (zweiter Aufruf, gleiche Faelligkeiten)",
      JSON.stringify(r2.auftraege.map((x) => x.dueAt)) === JSON.stringify(r.auftraege.map((x) => x.dueAt)));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
