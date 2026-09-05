"use strict";

// Helmut — Vertragstest des VORWÄRTSAUSFÜHRERS und des FACHZYKLUS-STARTWEGS.
// =============================================================================
// Diese Suite entstand am 02.09. aus einem zweiten Review, das SECHS
// Ausführungslücken am Kopf 331859a nachwies: es gab einen scharfen Rückweg,
// aber KEINEN Vorwärtsweg, und der Fachzyklus hatte überhaupt keinen Auslöser.
//
// Gepinnt wird durchgehend, dass jeder Vorwärtsschritt NUR unter allen Riegeln
// scharf wird — und dass der RÜCKWEG davon unberührt bleibt.
//
// Ohne Netz, ohne Datenbank, ohne echte Uhr in den Zusicherungen.

const fs = require("fs");
const path = require("path");
const V = require("../lib/helmut/testkohorte-vorwaerts");
const Z = require("../lib/helmut/funktionstest-zyklus");
const RB = require("../lib/helmut/testkohorte-rueckbau");
const K = require("../lib/helmut/testkohorte-betrieb");
const kapazitaet = require("../lib/helmut/kapazitaet-500");
const sd = require("../lib/helmut/source-demand");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Ein geprüftes Fenster 11:36–15:59 UTC und eine Uhr, die mittendrin steht.
const FENSTER = Object.freeze({
  startErlaubt: true, konflikte: [], gepruefteCrons: 13,
  startMinuteUtc: 11 * 60 + 36, endeMinuteUtc: 15 * 60 + 59
});
const JETZT_DRIN = "2026-09-10T13:00:00Z";
const JETZT_DRAUSSEN = "2026-09-10T05:47:00Z";
const SCHARF = (schritt) => ({
  [K.EXECUTE_FLAG]: "1",
  [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE[schritt]
});

async function main() {
  console.log("Helmut — Vertragstest von Vorwärtsausführer und Fachzyklus-Startweg\n");

  // ── A · Trockenlauf ist Standard ──────────────────────────────────────────
  console.log("A · Trockenlauf ist Standard, und er schreibt nichts");
  {
    const beruehrt = [];
    const p = await V.fuehreProvisionierungAus({
      env: {}, deps: { legeAn: async (s) => { beruehrt.push(s.id); return { ok: true }; } }
    });
    check("A1 Ohne alles bleibt es beim Trockenlauf", p.modus === V.MODUS_TROCKENLAUF);
    check("A2 Und es wurde NICHTS aufgerufen", beruehrt.length === 0);
    check("A3 Die Zielmenge ist die vollständige Kohorte", p.zielGroesse === 495);
    check("A4 Ein Trockenlauf gilt nie als Erfolg", p.ok === false);
    for (const [g, n] of [["a", 20], ["b", 75], ["c", 400]]) {
      const a = await V.fuehreAktivierungAus({ gruppe: g, env: {} });
      check(`A5-${g} Gruppe ${g.toUpperCase()} umfasst genau ${n} Profile`, a.zielGroesse === n);
    }
    check("A6 Auch ein ausdrücklich scharf gewünschter Lauf fällt ohne Freigabe zurück",
      (await V.fuehreProvisionierungAus({ modus: V.MODUS_SCHARF, env: {} })).modus === V.MODUS_TROCKENLAUF);
  }

  // ── B · Die vier Riegel ───────────────────────────────────────────────────
  console.log("\nB · Vier Riegel, jeder einzeln wirksam");
  {
    const deps = {
      legeAn: async () => ({ ok: true }),
      leseZustand: async () => ({ vorhanden: true, aktiv: false })
    };
    const nurFreigabe = await V.fuehreProvisionierungAus({
      modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"), deps
    });
    check("B1 Freigabe ALLEIN genügt nicht — ohne Fenster bleibt es Trockenlauf",
      nurFreigabe.modus === V.MODUS_TROCKENLAUF && nurFreigabe.startfenster.grund === "startfenster-nicht-geprueft");
    const falscheZeit = await V.fuehreProvisionierungAus({
      modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRAUSSEN, deps
    });
    check("B2 Ein Fenster, das JETZT nicht gilt, sperrt den Vorwärtsschritt",
      falscheZeit.modus === V.MODUS_TROCKENLAUF
        && falscheZeit.startfenster.grund === "startzeit-ausserhalb-des-fensters");
    const ohneCrons = await V.fuehreProvisionierungAus({
      modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
      startfensterBefund: { ...FENSTER, gepruefteCrons: 0 }, jetztUtc: JETZT_DRIN, deps
    });
    check("B3 Ein Befund gegen eine leere Cronliste gilt als ungeprüft",
      ohneCrons.modus === V.MODUS_TROCKENLAUF
        && ohneCrons.startfenster.grund === "startfenster-ohne-cronliste");
    const falschesWort = await V.fuehreAktivierungAus({
      gruppe: "a", modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, vorstufenVollstaendig: true
    });
    check("B4 Das Wort der Provisionierung aktiviert NICHTS",
      falschesWort.modus === V.MODUS_TROCKENLAUF
        && falschesWort.blockadeGruende.includes("freigabe-fehlt"));
    const falscheGruppe = await V.fuehreAktivierungAus({
      gruppe: "c", modus: V.MODUS_SCHARF, env: SCHARF("aktivierung-a"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, vorstufenVollstaendig: true
    });
    check("B5 Das Wort der Gruppe A aktiviert NICHT die Gruppe C",
      falscheGruppe.modus === V.MODUS_TROCKENLAUF);
    const ohneVorstufe = await V.fuehreAktivierungAus({
      gruppe: "b", modus: V.MODUS_SCHARF, env: SCHARF("aktivierung-b"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN
    });
    check("B6 Ohne bestätigte Vorstufe bleibt es Trockenlauf (fail closed)",
      ohneVorstufe.modus === V.MODUS_TROCKENLAUF
        && ohneVorstufe.blockadeGruende.includes("vorstufe-nicht-bestaetigt"));
  }

  // ── C · Scharfer Lauf, Nachprüfung, Fehlertoleranz ────────────────────────
  console.log("\nC · Scharfer Lauf: jede Zeile wird nach dem Schreiben gegengelesen");
  {
    const geschrieben = [];
    const scharf = await V.fuehreAktivierungAus({
      gruppe: "a", modus: V.MODUS_SCHARF, env: SCHARF("aktivierung-a"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, vorstufenVollstaendig: true,
      deps: {
        aktiviere: async (id) => { geschrieben.push(id); return { ok: true }; },
        leseZustand: async () => ({ vorhanden: true, aktiv: true })
      }
    });
    check("C1 Mit allen vier Riegeln läuft er scharf",
      scharf.modus === V.MODUS_SCHARF && scharf.aktiviert === 20 && scharf.ok === true);
    check("C2 Er hat genau die 20 Kennungen der Gruppe A berührt",
      geschrieben.length === 20 && geschrieben.every(K.istKohortenKennung));
    check("C3 Er rührt ausdrücklich keine Konten an", scharf.beruehrtKeineKonten === true);
    const nichtBestaetigt = await V.fuehreAktivierungAus({
      gruppe: "a", modus: V.MODUS_SCHARF, env: SCHARF("aktivierung-a"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, vorstufenVollstaendig: true,
      deps: {
        aktiviere: async () => ({ ok: true }),
        leseZustand: async (id) => ({ vorhanden: true, aktiv: !id.endsWith("001") })
      }
    });
    check("C4 Eine Zeile, die die Ablage NICHT trägt, zählt als Fehlschlag",
      nichtBestaetigt.fehlgeschlagen === 1 && nichtBestaetigt.ok === false);
    check("C5 Ein Fehlschlag beendet den Lauf NICHT (sonst bliebe die Gruppe halb aktiv)",
      nichtBestaetigt.aktiviert + nichtBestaetigt.fehlgeschlagen === 20);
    // Provisionierung: aktiv angelegt ist ein FEHLSCHLAG, kein Erfolg.
    const versehentlichAktiv = await V.fuehreProvisionierungAus({
      kennungen: ["test-kohorte-a-001"], modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN,
      deps: {
        legeAn: async () => ({ ok: true }),
        leseZustand: async () => ({ vorhanden: true, aktiv: true }),
        zufall: () => "laufzeit-passwort-123"
      }
    });
    check("C6 Ein versehentlich AKTIV angelegtes Profil ist ein Fehlschlag",
      versehentlichAktiv.fehlgeschlagen === 1 && versehentlichAktiv.ok === false
        && versehentlichAktiv.ergebnisse[0].zustand === "angelegt-aber-AKTIV");
  }

  // ── D · Fremde Kennung bricht VOR jedem Schreibzugriff ab ─────────────────
  console.log("\nD · Eine fremde Kennung bricht ab, bevor irgendetwas geschrieben wurde");
  {
    const beruehrt = [];
    let grund = null;
    try {
      await V.fuehreProvisionierungAus({
        kennungen: ["test-kohorte-a-001", "fremdes-reales-mandat"],
        modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
        startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN,
        deps: { legeAn: async (s) => { beruehrt.push(s.id); return { ok: true }; } }
      });
    } catch (fehler) { grund = fehler && fehler.grund; }
    check("D1 Der Vorgang bricht ab", grund === "fremde-kennung", `grund=${grund}`);
    check("D2 UND es wurde nichts geschrieben", beruehrt.length === 0);
    check("D3 Auch eine erfundene Kennung derselben Familie wird abgewiesen",
      !K.istKohortenKennung("test-kohorte-a-999"));
    check("D4 Kein realer Mandats-Slug im Ausführer",
      !/cem|annika|klose|ince|mustermann/i.test(
        fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-vorwaerts.js"), "utf8")));
    check("D5 Kein Löschpfad im Vorwärtsweg",
      (() => {
        const code = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-vorwaerts.js"), "utf8")
          .replace(/\/\/.*$/gm, "");
        return !/\bdelete\b/i.test(code) && !/teardown/i.test(code) && !/geloescht_at/i.test(code);
      })());
    check("D6 Eine LEERE Zielmenge gilt nie als Erfolg",
      (await V.fuehreProvisionierungAus({
        kennungen: [], modus: V.MODUS_SCHARF, env: SCHARF("provisionierung"),
        startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN,
        deps: { legeAn: async () => ({ ok: true }), leseZustand: async () => ({ vorhanden: true, aktiv: false }) }
      })).ok === false);
  }

  // ── E · Der Rückweg bleibt unabhängig ─────────────────────────────────────
  console.log("\nE · Der Rückweg ist von Fenster und Vorstufen UNABHÄNGIG");
  {
    const geschrieben = [];
    const zurueck = await RB.fuehreRueckbauAus({
      kennungen: ["test-kohorte-a-001"],
      modus: RB.MODUS_SCHARF,
      env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT },
      deps: {
        deaktiviere: async (id) => { geschrieben.push(id); return { ok: true }; },
        leseZustand: async () => ({ vorhanden: true, aktiv: false })
      }
    });
    check("E1 Der Rückweg läuft OHNE jeden Fensterbefund scharf",
      zurueck.modus === RB.MODUS_SCHARF && zurueck.ok === true && geschrieben.length === 1);
    check("E2 Der Rückweg kennt gar keinen Fensterparameter",
      !/startfensterBefund/.test(
        fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8")));
    check("E3 Das Wort des Rückwegs schaltet keinen Vorwärtsschritt scharf",
      (await V.fuehreProvisionierungAus({
        modus: V.MODUS_SCHARF, env: SCHARF("deaktivierung"),
        startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN
      })).modus === V.MODUS_TROCKENLAUF);
  }

  // ── F · Fachzyklus: der Startweg ──────────────────────────────────────────
  console.log("\nF · Fachzyklus-Startweg");
  {
    const aufrufe = [];
    const t = await Z.fuehreZyklusAus({ env: {}, deps: { rufeRouteAuf: async () => { aufrufe.push(1); return { ok: true }; } } });
    check("F1 Trockenlauf macht KEINEN Netzaufruf", t.modus === Z.MODUS_TROCKENLAUF && aufrufe.length === 0);
    check("F2 Er nennt die vier offenen Riegel",
      t.blockadeGruende.includes("freigabe-fehlt")
        && t.blockadeGruende.includes("startbereitschaft-nicht-bestaetigt"));
    check("F3 Er treibt ausdrücklich KEINE mandatsgebundenen Briefing-Routen an",
      t.treibtMandatsgebundeneBriefingRoutenAn === false);
    check("F4 Es ist genau EINE Route aufrufbar, und es ist eine bestehende",
      Z.ROUTEN.zyklus === "/api/cron/pipeline");
    const ohneSecret = await Z.fuehreZyklusAus({
      modus: Z.MODUS_SCHARF,
      env: { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE.fachzyklus },
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, startbereit: true,
      deps: { rufeRouteAuf: async () => { aufrufe.push(1); return { ok: true }; } }
    });
    check("F5a Ohne CRON_SECRET/HELMUT_PUBLIC_URL wird nichts aufgerufen",
      ohneSecret.blockadeGruende.includes("zugangsdaten-fehlen") && aufrufe.length === 0);
    const scharf = await Z.fuehreZyklusAus({
      modus: Z.MODUS_SCHARF,
      env: {
        [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE.fachzyklus,
        CRON_SECRET: "geheim", HELMUT_PUBLIC_URL: "https://beispiel.invalid"
      },
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, startbereit: true, maxScheiben: 3,
      deps: {
        rufeRouteAuf: async () => { aufrufe.push(1); return { ok: true, status: 200, koerper: { tenants: 500 } }; },
        jetztMs: (() => { let t = 0; return () => (t += 1000); })(),
        warte: async () => {}
      }
    });
    check("F6 Mit allen Riegeln läuft er und ruft genau die geplanten Scheiben",
      scharf.modus === Z.MODUS_SCHARF && scharf.erfolgreich === 3 && aufrufe.length === 3);
    const abbruch = await Z.fuehreZyklusAus({
      modus: Z.MODUS_SCHARF,
      env: {
        [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE.fachzyklus,
        CRON_SECRET: "geheim", HELMUT_PUBLIC_URL: "https://beispiel.invalid"
      },
      startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN, startbereit: true, maxScheiben: 5,
      deps: {
        rufeRouteAuf: async () => ({ ok: false, status: 500 }),
        jetztMs: (() => { let t = 0; return () => (t += 1000); })(),
        warte: async () => {}
      }
    });
    check("F7 Eine fehlgeschlagene Scheibe beendet den Lauf",
      abbruch.erfolgreich === 0 && abbruch.fehlgeschlagen === 1
        && abbruch.abgebrochen === "scheibe-fehlgeschlagen" && abbruch.ok === false);
    check("F8 Ohne bestätigte Startbereitschaft bleibt es Trockenlauf",
      (await Z.fuehreZyklusAus({
        modus: Z.MODUS_SCHARF,
        env: { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE.fachzyklus },
        startfensterBefund: FENSTER, jetztUtc: JETZT_DRIN
      })).modus === Z.MODUS_TROCKENLAUF);
  }

  // ── G · Der strukturelle Blocker: Fälligkeit im Fenster ───────────────────
  console.log("\nG · Welche Arbeit ist im Fenster überhaupt fällig?");
  {
    const b = Z.arbeitsklassenImFenster({
      fensterStartMinuteUtc: FENSTER.startMinuteUtc, fensterEndeMinuteUtc: FENSTER.endeMinuteUtc
    });
    check("G1 Die Projektion ist im Fenster teilweise fällig",
      b.klassen.find((k) => k.jobType === "mandate_projection").imFensterFaellig === true);
    check("G2 Die BRIEFINGMATERIALISIERUNG ist im Fenster GAR NICHT fällig",
      b.klassen.find((k) => k.jobType === "briefing_materialization").imFensterFaellig === false);
    check("G3 Die sichtbare Produktstufe ist damit im Fenster nicht erreichbar",
      b.sichtbareProduktstufeErreichbar === false);
    check("G4 Die Zahlen kommen aus den Phasenfenstern des MOTORS, nicht aus einer Kopie",
      (() => {
        const phasen = sd.MANDATSPHASEN;
        const briefing = phasen.find((p) => p[0] === "briefing_materialization");
        return Array.isArray(phasen) && briefing && briefing[2] === 0.75 && briefing[3] === 0.90;
      })());
    check("G5 Ein Fenster ab 18:00 UTC erreichte die Produktstufe sehr wohl",
      Z.arbeitsklassenImFenster({ fensterStartMinuteUtc: 18 * 60, fensterEndeMinuteUtc: 21 * 60 })
        .sichtbareProduktstufeErreichbar === true);
    check("G6 Ohne Fenstergrenzen ist der Befund nicht bewertbar (fail closed)",
      Z.arbeitsklassenImFenster({}).bewertbar === false);
  }

  // ── H · Die Zyklusarithmetik ──────────────────────────────────────────────
  console.log("\nH · Passt ein vollständiger Zyklus in 263 Minuten?");
  {
    const kons = kapazitaet.zyklusPasstInsFenster({
      fensterMinuten: 263, parallel: 1, szenario: "konservativ", maxAnfragenJeMinute: 82
    });
    check("H1 Konservativ bei Parallelität 1: passt NICHT",
      kons.passt === false && kons.benoetigteAufrufe === 1812 && kons.moeglicheAufrufe === 1732,
      `${kons.benoetigteAufrufe} nötig, ${kons.moeglicheAufrufe} möglich`);
    check("H2 Er nennt die nötige Zeit statt nur zu scheitern", kons.benoetigteMinuten === 276);
    check("H3 Erwartung bei Parallelität 1: passt",
      kapazitaet.zyklusPasstInsFenster({ fensterMinuten: 263, parallel: 1, szenario: "erwartung", maxAnfragenJeMinute: 82 }).passt === true);
    check("H4 Ein NICHT übergebener Bedarf wird nicht zu 0 koerziert",
      kapazitaet.zyklusPasstInsFenster({ fensterMinuten: 263, parallel: 1 }).benoetigteAufrufe === 1812);
    check("H5 Ohne Fensterdauer ist die Rechnung nicht bewertbar (fail closed)",
      kapazitaet.zyklusPasstInsFenster({ parallel: 1 }).bewertbar === false);
    check("H6 Der Deckel 2416 wird ausdrücklich NICHT als Arbeitspensum verwendet",
      kons.benoetigteAufrufe < kapazitaet.VORBEREITETER_DECKEL);
  }

  // ── I · DIE STANDARDVERDRAHTUNG (dritter Reviewbefund) ────────────────────
  // Die Suite oben injiziert überall Attrappen — damit blieb der PRODUKTIVPFAD
  // ungetestet, und genau dort steckte ein harter Defekt: der Ausführer rief
  // `provisionTenant(spec, {}, { ausfuehren: true })` auf. Diese Funktion
  // VERLANGT aber `neuAktiv` ausdrücklich und wirft sonst — der scharfe
  // Anlagelauf hätte 495-mal geworfen und kein einziges Profil angelegt.
  console.log("\nI · Die Standardverdrahtung, nicht die Attrappe");
  {
    const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-vorwaerts.js"), "utf8");
    check("I1 Die Provisionierung übergibt neuAktiv: false, nicht ausfuehren",
      /provisionTenant\(spec, \{\}, \{ neuAktiv: false, kontoBeiFehlerBehalten: true \}\)/.test(quelle)
        && !/provisionTenant\([^)]*ausfuehren/.test(quelle));
    check("I2 Die Aktivierung ruft activateTenant auf",
      /require\("\.\/provisioning"\)\.activateTenant\(id\)/.test(quelle));
    // Und der Vertrag der aufgerufenen Funktion selbst: sie wirft ohne neuAktiv.
    const provisioning = require("../lib/helmut/provisioning");
    let wirft = false;
    try { await provisioning.provisionTenant({ id: "x" }, {}, { ausfuehren: true }); }
    catch (fehler) { wirft = /neuAktiv/.test(String((fehler && fehler.message) || "")); }
    check("I3 provisionTenant wirft ohne ausdrückliches neuAktiv — der alte Aufruf wäre gescheitert", wirft);
    check("I4 activateTenant existiert und ist das Spiegelbild zu deactivateTenant",
      typeof provisioning.activateTenant === "function"
        && typeof provisioning.deactivateTenant === "function");
    // activateTenant gegen Attrappen: schreibt genau ein Feld, rührt kein Konto an.
    const geschrieben = [];
    const r = await provisioning.activateTenant("test-kohorte-a-001", {
      storage: {
        getProfile: async () => ({ id: "test-kohorte-a-001", profileActive: false, provisionedBy: provisioning.PROVISIONING_MARKER }),
        saveProfile: async (p2) => { geschrieben.push(p2); }
      },
      accounts: { listUsers: async () => [] }
    });
    check("I5 activateTenant setzt profileActive und sonst nichts",
      r.ok === true && geschrieben.length === 1 && geschrieben[0].profileActive === true);
    check("I6 Es rührt kein Konto an", r.kontoUnveraendert === true);
    const geloescht = await provisioning.activateTenant("test-kohorte-a-002", {
      storage: {
        getProfile: async () => ({ id: "test-kohorte-a-002", profileActive: false, deletedAt: "2026-09-01T00:00:00Z", provisionedBy: provisioning.PROVISIONING_MARKER }),
        saveProfile: async () => { throw new Error("darf nicht schreiben"); }
      },
      accounts: { listUsers: async () => [] }
    });
    check("I7 Eine gesetzte Löschmarke wird NICHT still reaktiviert",
      geloescht.ok === false && geloescht.reason === "loeschmarke");
  }

  console.log("\nK · Der Blocker ist genau benannt, nicht zu weit");
  {
    // VIERTER REVIEWBEFUND: Die erste Fassung sagte „die sichtbare Produktstufe
    // entsteht GAR NICHT" und „mit keinem Aufruf bestehender Routen zu umgehen".
    // Das war zu absolut: `/api/cron/lage-briefing` ruft `buildLageBriefing` je
    // Profil unmittelbar auf und kennt die Phasenfenster der Warteschlange nicht.
    // Ein überzogener Blocker ist so unehrlich wie ein verschwiegener.
    const b = Z.arbeitsklassenImFenster({
      fensterStartMinuteUtc: FENSTER.startMinuteUtc, fensterEndeMinuteUtc: FENSTER.endeMinuteUtc
    });
    check("K1 Die Meldung sagt ausdrücklich WARTESCHLANGE, nicht pauschal",
      /WARTESCHLANGE/.test(b.meldung));
    check("K2 Sie benennt den Direktpfad als davon unberührt",
      /lage-briefing/.test(b.meldung) && /unberührt/.test(b.meldung));
    check("K3 Und seine beiden Kosten: Zeitbudget und Wirkung auf die realen Mandate",
      /240 s/.test(b.meldung) && /realen Mandate/.test(b.meldung));
    check("K4 Der Befund trägt den Hinweis auch als eigenes Feld",
      typeof b.direktpfadHinweis === "string" && /Warteschlange/.test(b.direktpfadHinweis));
    check("K5 Der Direktpfad existiert wirklich und läuft NICHT über die Phasenfenster",
      (() => {
        const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
        const i = server.indexOf('url.pathname === "/api/cron/lage-briefing"');
        if (i < 0) return false;
        const block = server.slice(i, i + 4000);
        // Direkt gebaut, ohne briefing_materialization-Auftrag.
        return /buildLageBriefing\(profile/.test(block) && !/briefing_materialization/.test(block);
      })());
    check("K6 Der Zyklus-Startweg treibt ihn bewusst NICHT an",
      (await Z.fuehreZyklusAus({ env: {} })).treibtMandatsgebundeneBriefingRoutenAn === false);
  }

  console.log("\nJ · Der Stufenvertrag wird gerechnet, nicht zugesagt");
  {
    const cli = fs.readFileSync(path.join(ROOT, "scripts/testkohorte-vorwaerts.js"), "utf8");
    check("J1 Die CLI nimmt kein handgetipptes --vorstufen-vollstaendig mehr an",
      !/argument\(argv, "vorstufen-vollstaendig"\)/.test(cli));
    check("J2 Sie rechnet den Stufenvertrag über planeAktivierung aus dem Bestand",
      /K\.planeAktivierung\(\{/.test(cli) && /plan\.vorstufenOffen\.length === 0/.test(cli));
    check("J3 Ohne Bestand bleibt der Vertrag unbestätigt (fail closed)",
      /vorstufenVollstaendig = null/.test(cli));
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
