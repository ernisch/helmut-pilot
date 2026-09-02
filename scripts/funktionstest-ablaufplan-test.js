"use strict";

// Offline-Vertragstest des ABLAUFPLANS, der STUFENKONTROLLE, des RÜCKBAU-
// AUSFÜHRERS und der sicheren Startfenster.
//
// Vier Bereiche, die zusammen die Frage beantworten „ist der 500er-Funktionstest
// technisch vorbereitet — und bleibt er dabei gesperrt?":
//
//   A · ABLAUFPLAN          vorwärts gesperrt, rückwärts nie
//   B · SICHERE FENSTER     welches Zeitfenster ist überhaupt frei
//   C · STUFENKONTROLLE     die fünfzehn Regeln bekommen endlich Messwerte
//   D · RÜCKBAU-AUSFÜHRER   der Rückweg existiert, ist verriegelt und idempotent
//
// Kein Netz, keine Datenbank, kein Modellaufruf, keine Aktivierung.

const fs = require("fs");
const path = require("path");
const A = require("../lib/helmut/funktionstest-ablaufplan");
const F = require("../lib/helmut/funktionstest-500");
const K = require("../lib/helmut/funktionstest-kontrolle");
const RB = require("../lib/helmut/testkohorte-rueckbau");
const kapazitaet = require("../lib/helmut/kapazitaet-500");
const M = require("../lib/helmut/mandatsklasse");

const ROOT = path.join(__dirname, "..");
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const VOLLE_GRENZEN = Object.freeze({
  maxFehlerquote: 0.05,
  kostenbudgetUsd: 10,
  maxLaufzeitMinuten: 240,
  maxRueckstandWachstum: 200,
  erwarteterCommit: "881739da0f8f06184a1bdf7dd86895d896cf0336",
  mindestVerarbeiteteVorgaenge: 50
});

const VOLLE_QUELLEN = Object.freeze({
  warteschlange: { haengendeLeases: 0, dubletten: 0 },
  kosten: { aufrufeHeute: 800, preisJeAufrufUsd: 0.002941 },
  modellaufrufe: { unbekannteModellaufrufe: 0, drosselungen: 0 },
  realeMandate: { gesamt: 9, aktiv: 5, geloescht: 0 },
  grundlinie: { realeMandate: 9, realeMandateAktiv: 5, realeMandateGeloescht: 0 },
  laufbilanz: { verarbeitet: 240, fehlgeschlagen: 2, vollstaendig: true },
  drain: { rueckstandWachstum: 10 },
  riegel: { durchgelassen: 0 },
  deployment: { githubCommitSha: "881739da0f8f06184a1bdf7dd86895d896cf0336" },
  startfenster: { konflikte: [] },
  tagesplan: {
    klassen: { real: 5, synthetisch: 495, gemischt: true, realeVollstaendigBedient: true },
    zuteilung: { "mandat-a": { notwendig: 1 }, "test-kohorte-a-001": { notwendig: 0 } }
  },
  laufzeitMinuten: 120
});

async function main() {
  console.log("Helmut — Vertragstest von Ablaufplan, Stufenkontrolle und Rückbau\n");

  // ── A · Ablaufplan ────────────────────────────────────────────────────────
  console.log("A · Ablaufplan: vorwärts gesperrt, rückwärts nie");
  const leer = A.ablaufplan({ belegt: [] });
  check("A1 Der Plan führt nichts aus",
    leer.ausfuehrbar === false && /führt NICHTS aus/.test(leer.hinweis));
  check("A2 Jede Production-Aktion und jede Umgebungsänderung ist eine EIGENE Freigabe",
    leer.einzelfreigabenGesamt >= 7
      && leer.schritte.filter((s) => s.art === A.ART_PRODUCTION).every((s) => s.freigabe !== null));
  check("A3 Ohne Vorbedingungen darf nur die Grundlinienerhebung beginnen",
    leer.naechsterSchritt === "grundlinie");
  check("A4 Die Provisionierung ist gesperrt, bis Grundlinie UND Sicherung vorliegen",
    leer.gesperrt.includes("provisionierung")
      && A.ablaufplan({ belegt: [A.VORBEDINGUNGEN.GRUNDLINIE] }).gesperrt.includes("provisionierung")
      && !A.ablaufplan({
        belegt: [A.VORBEDINGUNGEN.GRUNDLINIE, A.VORBEDINGUNGEN.SICHERUNG]
      }).gesperrt.includes("provisionierung"));
  check("A5 Der Stufenvertrag steht auch im Plan: B braucht die Kontrolle nach A",
    (() => {
      const p = A.ablaufplan({ belegt: [A.VORBEDINGUNGEN.GRUPPE_A] });
      return p.gesperrt.includes("aktivierung-b")
        && !A.ablaufplan({ belegt: [A.VORBEDINGUNGEN.KONTROLLE_A] }).gesperrt.includes("aktivierung-b");
    })());
  check("A6 Der RÜCKWEG ist in JEDEM Zustand erlaubt",
    ["deaktivierung", "rueckbau"].every((id) => {
      const s = leer.schritte.find((x) => x.id === id);
      return s && s.darfBeginnen === true && s.immerErlaubt === true;
    }), "ein Rückbau darf nie an einer Vorbedingung scheitern");
  check("A7 Die Deaktivierung braucht dennoch ihre eigene Freigabe",
    (() => {
      const s = leer.schritte.find((x) => x.id === "deaktivierung");
      return s.freigabe && s.freigabe.wort === "TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT";
    })());
  // ERGÄNZT 02.09.: die Nacharbeit an der Scheduler-Spur ist Schritt 18 und
  // hängt hinter dem bestätigten Rückbau — aber sie ist NICHT Teil des
  // Rückwegs (der bleibt in jedem Zustand sofort erlaubt).
  check("A7a Die Nacharbeit an der Scheduler-Spur ist ein eigener, gesperrter Schritt",
    (() => {
      const spur = A.ablaufplan({ belegt: [] }).schritte.find((x) => x.id === "scheduler-spur");
      return Boolean(spur)
        && spur.nr === 18
        && spur.immerErlaubt === false
        && spur.darfBeginnen === false
        && spur.vorbedingungen.includes("rueckbau")
        && spur.freigabe && spur.freigabe.wort === "TESTKOHORTE_495_SCHEDULERSPUR_ENTFERNEN_BESTAETIGT";
    })());
  check("A7b Der Rückweg bleibt davon unberührt sofort erlaubt",
    (() => {
      const weg = A.ablaufplan({ belegt: [] }).schritte.find((x) => x.id === "deaktivierung");
      return Boolean(weg) && weg.immerErlaubt === true;
    })());
  check("A8 Jede Stufe trägt ein EIGENES Bestätigungswort",
    (() => {
      const worte = leer.schritte
        .filter((s) => s.freigabe && s.freigabe.wort)
        .map((s) => s.freigabe.wort);
      return worte.length >= 5 && new Set(worte).size === worte.length;
    })());
  check("A9 Kein realer Mandats-Slug im Ablaufplan",
    !/m5-[0-9a-f]{8}/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/funktionstest-ablaufplan.js"), "utf8")));

  // Die vorbereiteten Werte — dokumentiert, nicht gesetzt.
  const vorbereitung = A.vorbereitung();
  check("A10 Die Betreiberwerte sind ausdrücklich NICHT gesetzt",
    vorbereitung.betreiberwerte.gesetzt === false);
  check("A11 Deckel 2.416 und Verstehens-Reserve 702 stehen als Vorschlag mit Herkunft",
    (() => {
      const w = vorbereitung.betreiberwerte.werte;
      const deckel = w.find((x) => x.env === "HELMUT_MAX_LLM_CALLS_PER_DAY");
      const reserve = w.find((x) => x.env === "HELMUT_LLM_RESERVE_UNDERSTANDING");
      return deckel.wert === 2416 && reserve.wert === 702
        && reserve.wert < deckel.wert && /IM Deckel/.test(reserve.herkunft);
    })());
  check("A12 Die Vorrangreserve ist 200 und deckt den gemessenen Bedarf 170",
    (() => {
      const v = vorbereitung.betreiberwerte.werte.find((x) => x.env === M.VORRANG_REAL_ENV);
      return v.wert === M.VORRANG_REAL_EMPFEHLUNG && v.wert >= M.VORRANG_REAL_MESSBEDARF_P95;
    })());
  // KORRIGIERT 02.09. (adversarialer Review, bestätigter Befund): die
  // Deploymentgrenze 250 RPM ist NICHT der zu setzende Testwert. Bei gemessenen
  // 3.018 Token je Aufruf ergäben 250 Anfragen/Minute 754.500 Token/Minute — das
  // Dreifache der TPM-Grenze. Bindend ist die kleinere der beiden Grenzen.
  check("A13 Die Minutengrenze ist der WIRKSAME Wert, nicht die Deploymentgrenze",
    (() => {
      const w = vorbereitung.betreiberwerte.werte;
      const rpm = w.find((x) => x.env === "HELMUT_TESTLAUF_MAX_RPM");
      const tpm = w.find((x) => x.env === "HELMUT_TESTLAUF_MAX_TPM");
      const wirksam = kapazitaet.wirksameRpm();
      return rpm.wert === wirksam.wirksam && rpm.wert === 82 && rpm.wert < 250
        && tpm.wert === 250000
        && wirksam.bindend === "tpm"
        && /Gesamtkontingent/i.test(rpm.offen) && /Gesamtkontingent/i.test(tpm.offen);
    })(), "250 RPM × 3.018 Token = 754.500 TPM — das Dreifache der TPM-Grenze");
  check("A13a Die Erreichbarkeit des Deckels bei Parallelität 1 ist ausgewiesen",
    vorbereitung.betreiberwerte.erreichbarkeit
      && vorbereitung.betreiberwerte.erreichbarkeit.mindestLaufzeitMinutenBeiParallel1 === 367,
    "367 Minuten reine Laufzeit — MEHR als das längste sichere Tagesfenster (263 min); "
    + "ein voll ausgeschöpfter Deckel endet an A05, nicht am Deckel");

  // Kostenabbruchgrenze
  const kosten = kapazitaet.kostenabbruchgrenze();
  check("A14 Die Kostenrechnung stimmt mit den gemessenen Werten überein",
    kosten.erwartungUsdProTag === 7.11 && kosten.obereSchrankeUsdProTag === 8.11
      && kosten.monatErwartungUsd === 213 && kosten.monatObereSchrankeUsd === 243,
    `${kosten.erwartungUsdProTag} USD/Tag, ${kosten.monatErwartungUsd} USD/Monat`);
  check("A15 Die harte Abbruchgrenze liegt ÜBER der oberen Schranke",
    kosten.empfehlungUsd > kosten.obereSchrankeUsdProTag && kosten.empfehlungUsd === 10);
  check("A16 Die Preisbasis wird ehrlich als Listenpreis benannt (F7 offen)",
    /Listenpreis/.test(kosten.preisbasis) && /kein nachgewiesener Kontopreis/i.test(kosten.preisbasis));
  check("A17 Die belegten Messungen sind hinterlegt — das Azure-Gesamtkontingent NICHT",
    kapazitaet.BELEGTE_MESSUNGEN["p95-tagesbedarf-verstehen"].belegt === true
      && kapazitaet.BELEGTE_MESSUNGEN["p95-tagesbedarf-verstehen"].wert === 82
      && kapazitaet.BELEGTE_MESSUNGEN["azure-kontingente-und-rate-limits"].belegt === false);
  check("A18 zielDeckel() führt die offenen Messungen UNVERÄNDERT weiter",
    kapazitaet.zielDeckel().offeneMessungen.length === 5,
    "der Betreiber trägt sie weiterhin ausdrücklich bei — nichts wird still als erledigt gewertet");

  // ── B · Sichere Startfenster ──────────────────────────────────────────────
  console.log("\nB · Sichere Startfenster (das 05:45/05:48-Risiko)");
  const fenster = F.sichereStartfenster({ crons: VERCEL.crons, mindestDauerMinuten: 60 });
  check("B1 Es gibt überhaupt sichere Fenster",
    fenster.fenster.length > 0 && fenster.empfehlung !== null);
  check("B2 KEIN Kandidat berührt den Morgenblock 05:30–08:30 UTC",
    fenster.fenster.every((f) => {
      const [h, m] = f.startUtc.split(":").map(Number);
      const start = h * 60 + m;
      const ende = start + f.dauerMinuten;
      return !(start < 8 * 60 + 30 && ende > 5 * 60 + 30);
    }), "Lage-Briefing 05:45 + Actions-Watchdog (2–3 h Verzug)");
  check("B3 Jeder Kandidat besteht die VERBINDLICHE Prüfung",
    fenster.fenster.every((f) => f.bestaetigt === true && f.konflikte.length === 0));
  check("B4 Die betriebliche Empfehlung liegt in der Arbeitszeit",
    fenster.empfehlungTagsueber !== null && fenster.empfehlungTagsueber.tagsueber === true
      && fenster.empfehlungTagsueber.startUtc === "11:36"
      && fenster.empfehlungTagsueber.dauerMinuten === 263,
    `${fenster.empfehlungTagsueber.startUtc}–${fenster.empfehlungTagsueber.endeUtc} UTC `
    + `(${fenster.empfehlungTagsueber.dauerMinuten} min)`);
  check("B5 Der Block über Mitternacht wird als EIN Block geführt",
    fenster.fenster.some((f) => f.ueberMitternacht === true && f.dauerMinuten > 300),
    "sonst meldete die Ausgabe zwei kürzere Blöcke, die es so nicht gibt");
  check("B6 Eine FEHLENDE Cronliste gilt nie als freier Tag (fail closed)",
    F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30 })
      .konflikte.some((k) => k.art === "cronliste-fehlt"));
  check("B7 Die verbindliche Prüfung kennt die Watchdogspanne",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T07:00:00Z", dauerMinuten: 30, crons: VERCEL.crons, watchdogBeruecksichtigen: true
    }).konflikte.some((k) => k.art === "actions-watchdog-vorsichtsspanne"));
  check("B8 startbereitschaft schaltet sie standardmäßig EIN",
    F.startbereitschaft({
      startfenster: { startUtc: "2026-09-10T07:00:00Z", dauerMinuten: 30, crons: VERCEL.crons }
    }).startfenster.konflikte.some((k) => k.art === "actions-watchdog-vorsichtsspanne"));
  check("B9 Der 05:45/05:48-Nachweis wird STRIKT als true verlangt",
    ["ja", 1, {}, "offen"].every((wert) => F.pruefeStartfenster({
      startUtc: "2026-09-10T05:46:00Z", dauerMinuten: 10, crons: VERCEL.crons,
      ueberschneidung0545Belegt: wert
    }).konflikte.some((k) => k.art === "offene-laufzeitueberschneidung-0545-0548")),
    "jeder truthy Wert hätte die einzige unbedingte Sperre aufgehoben");
  check("B10 Die Laufzeitgrenze muss in das geprüfte Fenster passen",
    F.startbereitschaft({
      grenzen: { ...VOLLE_GRENZEN, maxLaufzeitMinuten: 240 },
      startfenster: { startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons }
    }).offen.some((n) => /Laufzeitgrenze/.test(n)));
  check("B11 Die Watchdogzeit stimmt mit dem Actions-Workflow überein",
    (() => {
      const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/briefing-watchdog.yml"), "utf8");
      const treffer = yml.match(/cron:\s*["']?(\d+)\s+(\d+)\s+\*\s+\*\s+\*/);
      if (!treffer) return false;
      return Number(treffer[2]) * 60 + Number(treffer[1]) === F.WATCHDOG_START_MINUTE_UTC;
    })(), "sonst wäre die Sperrzeit eine Behauptung");

  // ── C · Stufenkontrolle ───────────────────────────────────────────────────
  console.log("\nC · Stufenkontrolle: die Regeln bekommen Messwerte");
  const ohneMesswerte = K.kontrolliere({ stufe: "a", grenzen: VOLLE_GRENZEN });
  check("C1 Ohne Messwerte ist KEINE Stufe bestanden",
    ohneMesswerte.bestanden === false && ohneMesswerte.fehlendeMesswerte.length === 15);
  check("C2 Jeder fehlende Messwert nennt seine Herkunft",
    ohneMesswerte.herkunftFehlender.every((h) => h.quelle && h.quelle !== "unbekannt"));
  const bestanden = K.kontrolliere({ stufe: "a", quellen: VOLLE_QUELLEN, grenzen: VOLLE_GRENZEN });
  check("C3 Mit vollständigen Messwerten ist die Stufe bestanden",
    bestanden.bestanden === true, bestanden.meldung);
  check("C4 Die Kosten entstehen aus Aufrufen × bestätigtem Preis",
    bestanden.beobachtungen.kostenBisherUsd === Math.round(800 * 0.002941 * 1000000) / 1000000);
  check("C5 OHNE bestätigten Preis gibt es KEINE Kostenzahl (nicht 0)",
    (() => {
      const b = K.baueBeobachtungen({ kosten: { aufrufeHeute: 800 } });
      return !Object.prototype.hasOwnProperty.call(b, "kostenBisherUsd");
    })(), "eine Kostenkontrolle ohne Preisbasis wäre eine Rechnung ohne Rechnung");
  check("C6 Eine LEERE Bilanz ist nicht grün (A15)",
    (() => {
      const leerB = K.kontrolliere({
        stufe: "a",
        quellen: { ...VOLLE_QUELLEN, laufbilanz: { verarbeitet: 0, fehlgeschlagen: 0, vollstaendig: true } },
        grenzen: VOLLE_GRENZEN
      });
      return leerB.bestanden === false && leerB.ausgeloest.includes("A15");
    })());
  check("C7 Eine Dublette bricht die Stufe (A13)",
    K.kontrolliere({
      stufe: "a",
      quellen: { ...VOLLE_QUELLEN, warteschlange: { haengendeLeases: 0, dubletten: 1 } },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A13"));
  check("C8 Ein verdrängtes reales Mandat bricht die Stufe (A14)",
    K.kontrolliere({
      stufe: "a",
      quellen: {
        ...VOLLE_QUELLEN,
        tagesplan: {
          klassen: { real: 2, synthetisch: 495, gemischt: true, realeVollstaendigBedient: false },
          zuteilung: { "mandat-a": { notwendig: 1 }, "mandat-b": { notwendig: 0 } }
        }
      },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A14"));
  check("C9 Eine Veränderung an einem realen Mandat bricht die Stufe (A09)",
    K.kontrolliere({
      stufe: "a",
      quellen: { ...VOLLE_QUELLEN, realeMandate: { gesamt: 9, aktiv: 4, geloescht: 0 } },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A09"));
  check("C10 Das Erhebungs-SQL ist rein lesend",
    (() => {
      const sql = K.erhebungsSql({ seitIso: "2026-09-10T11:36:00Z" });
      return !/\b(insert|update|delete|drop|alter|truncate)\b/i.test(sql)
        && (sql.match(/^select/gim) || []).length >= 4;
    })());
  check("C11 Das SQL nutzt die kanonischen Spalten der Warteschlange",
    /lease_expires_at/.test(K.erhebungsSql()) && /status = 'laeuft'/.test(K.erhebungsSql()));

  // ── D · Rückbau-Ausführer ─────────────────────────────────────────────────
  console.log("\nD · Rückbau: der Rückweg existiert, ist verriegelt und idempotent");
  const trocken = await RB.fuehreRueckbauAus({ env: {} });
  check("D1 Ohne Freigabe ist es ein Trockenlauf, der nichts schreibt",
    trocken.modus === RB.MODUS_TROCKENLAUF && trocken.zielGroesse === 495
      && trocken.deaktiviert === 0);
  check("D2 Auch ein ausdrücklich scharf gewünschter Lauf fällt ohne Freigabe zurück",
    (await RB.fuehreRueckbauAus({ modus: RB.MODUS_SCHARF, env: {} })).modus === RB.MODUS_TROCKENLAUF);
  check("D3 Es gibt keinen Löschpfad",
    (() => {
      // Kommentare gehören nicht zum Code — geprüft wird der ausführbare Teil.
      const code = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8")
        .replace(/\/\/.*$/gm, "");
      return trocken.loeschtNichts === true
        && !/\bdelete\b/i.test(code)
        && !/teardown/i.test(code)
        && !/geloescht_at/i.test(code);
    })());

  // ── D-Spur · Nacharbeit: die Scheduler-Spur (adversariale Analyse 02.09.) ──
  // BEFUND: Der Rückweg deaktiviert, aber die Spur der 495 Kennungen bleibt in
  // der EINEN Fairness-Zeile stehen — dort 90 Tage lang, und sie verlangsamt
  // danach JEDEN Fairness-Schreibvorgang der fünf realen Mandate.
  {
    const trockenSpur = await RB.entferneSchedulerSpur({ env: {} });
    check("DS1 Ohne Freigabe räumt die Nacharbeit nichts auf",
      trockenSpur.modus === RB.MODUS_TROCKENLAUF
        && trockenSpur.entfernt === 0
        && trockenSpur.zielGroesse === 495);
    check("DS2 Die Nacharbeit rührt ausdrücklich keine Profildaten an",
      trockenSpur.beruehrtProfildaten === false && trockenSpur.realeMandateBeruehrt === 0);
    check("DS3 Das Wort des Rückwegs schaltet die Nacharbeit NICHT scharf",
      (await RB.entferneSchedulerSpur({
        modus: RB.MODUS_SCHARF,
        env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT }
      })).modus === RB.MODUS_TROCKENLAUF);
    const spurEnv = { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT_SPUR };
    const beruehrt = [];
    const scharfSpur = await RB.entferneSchedulerSpur({
      kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
      modus: RB.MODUS_SCHARF,
      env: spurEnv,
      deps: { entferneSpur: async (id) => { beruehrt.push(id); return { ok: true }; } }
    });
    check("DS4 Mit eigenem Wort läuft sie scharf und meldet nur Bestätigtes",
      scharfSpur.modus === RB.MODUS_SCHARF
        && scharfSpur.entfernt === 2 && scharfSpur.fehlgeschlagen === 0
        && scharfSpur.ok === true && beruehrt.length === 2);
    const halb = await RB.entferneSchedulerSpur({
      kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
      modus: RB.MODUS_SCHARF, env: spurEnv,
      deps: { entferneSpur: async (id) => (id.endsWith("001") ? { ok: true } : { ok: false, grund: "rpc-fehlt" }) }
    });
    check("DS5 Ein Fehlschlag beendet den Lauf nicht, macht ihn aber nicht grün",
      halb.entfernt === 1 && halb.fehlgeschlagen === 1 && halb.ok === false
        && halb.ergebnisse.some((e) => e.fehler === "rpc-fehlt"));
    let abgebrochen = false;
    try {
      await RB.entferneSchedulerSpur({
        kennungen: ["test-kohorte-a-001", "fremdes-reales-mandat"],
        modus: RB.MODUS_SCHARF, env: spurEnv,
        deps: { entferneSpur: async () => ({ ok: true }) }
      });
    } catch (fehler) { abgebrochen = fehler && fehler.grund === "fremde-kennung"; }
    check("DS6 Eine FREMDE Kennung bricht auch die Nacharbeit ab (kein stilles Filtern)", abgebrochen);
  }

  const scharfEnv = { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT };
  const geschrieben = [];
  const erfolg = await RB.fuehreRueckbauAus({
    kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
    modus: RB.MODUS_SCHARF,
    env: scharfEnv,
    deps: {
      deaktiviere: async (id) => { geschrieben.push(id); return { ok: true }; },
      leseZustand: async () => ({ vorhanden: true, aktiv: false })
    }
  });
  check("D4 Mit beiden Freigaben läuft er scharf und deaktiviert genau die Zielmenge",
    erfolg.modus === RB.MODUS_SCHARF && erfolg.deaktiviert === 2 && erfolg.ok === true
      && geschrieben.join(",") === "test-kohorte-a-001,test-kohorte-a-002");

  const halb = await RB.fuehreRueckbauAus({
    kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
    modus: RB.MODUS_SCHARF,
    env: scharfEnv,
    deps: {
      deaktiviere: async (id) => { if (id.endsWith("002")) throw new Error("netzfehler"); return { ok: true }; },
      leseZustand: async (id) => ({ vorhanden: true, aktiv: id.endsWith("002") })
    }
  });
  check("D5 Ein Fehlschlag an EINER Kennung beendet den Lauf NICHT",
    halb.deaktiviert === 1 && halb.fehlgeschlagen === 1 && halb.ok === false,
    "sonst bliebe der Rest der Kohorte aktiv stehen");
  check("D6 Der Fehlschlag wird einzeln benannt, nicht verschluckt",
    halb.ergebnisse.some((e) => e.id === "test-kohorte-a-002" && e.schreibfehler));
  check("D7 Gemeldet wird nur, was die Ablage trägt (Nachprüfung je Zeile)",
    (() => {
      const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8");
      return /leseZustand/.test(quelle) && /NACHPRÜFUNG/.test(quelle);
    })());
  check("D8 IDEMPOTENZ: ein zweiter Lauf über bereits inaktive Zeilen meldet Erfolg",
    (await RB.fuehreRueckbauAus({
      kennungen: ["test-kohorte-a-001"],
      modus: RB.MODUS_SCHARF,
      env: scharfEnv,
      deps: {
        deaktiviere: async () => ({ ok: true }),
        leseZustand: async () => ({ vorhanden: true, aktiv: false })
      }
    })).ok === true);
  check("D9 Eine FREMDE Kennung bricht den Vorgang ab (kein stilles Filtern)",
    (() => {
      try {
        RB.zielmenge(["test-kohorte-a-001", "ein-reales-mandat"]);
        return false;
      } catch (fehler) { return fehler && fehler.grund === "fremde-kennung"; }
    })());
  check("D10 Auch eine erfundene Kennung derselben Familie wird abgewiesen",
    (() => {
      try { RB.zielmenge(["test-kohorte-a-999"]); return false; }
      catch (fehler) { return fehler && fehler.grund === "fremde-kennung"; }
    })(), "ein bloßes Präfix genügt nicht — es zählt die Erlaubnisliste");
  check("D11 Kein realer Mandats-Slug im Ausführer",
    !/m5-[0-9a-f]{8}/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8")));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
