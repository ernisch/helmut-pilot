"use strict";

// ============================================================================
// TAGESKAPAZITÄTSMODELL 500 MANDATE (500-Mandate-Reife 2026-09-01)
// ============================================================================
// Vertragssuite des ausführbaren Rechenbelegs lib/helmut/kapazitaet-500.js:
//  * die frühere „~455 Aufrufe/Tag"-Zahl wird als ERWARTUNGSWERT reproduziert
//    (bestätigt) — der konservative Bedarf liegt belegbar darüber; die DREI
//    verschiedenen 455er (Aufträge@5 · KI-Aufrufe@500 · Modell-Erwartungswert)
//    sind im Modul mit Einheiten dokumentiert und werden nie vermengt (Befund 4),
//  * der Zieldeckel ist ein VORLÄUFIGER SZENARIO-/PLANUNGSWERT mit Spanne und
//    offenen Z3b-Messungen — kein „kleinster belegbar ausreichender" Wert; er
//    trägt den konservativen Szenario-Bedarf inkl. 25 % Reserve UND die
//    Fairness-Untergrenze 2n−1,
//  * „zurückstellen" kostet einen vollen Modellaufruf (zählt im würdigen
//    Anteil), nur echtes Parken spart,
//  * die 48-Slot-Kapazität (minimal-cron) trägt den konservativen Fall; der
//    Stressfall wird EHRLICH als nicht slot-gedeckt gemeldet (kein Grün),
//  * Warnschwellen sind benannt und quellengebunden,
//  * das Modul ist PUR: kein Env-Schreiben, kein Netz, kein Storage — der
//    Production-Deckel wird nicht verändert.
// Jeder Lauf gehört über scripts/lokal.js gestartet (CLAUDE.md §6).

const fs = require("fs");
const path = require("path");
const k = require("../lib/helmut/kapazitaet-500");
const minimalCron = require("../lib/helmut/minimal-cron");

let pass = 0, fail = 0;
function check(name, cond) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); if (cond) pass += 1; else fail += 1; }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const src = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "kapazitaet-500.js"), "utf8");

abschnitt("§1 Modellintegrität: Messwerte benannt, endlich, mit Herkunft");
{
  const m = k.MESSWERTE;
  check("§1.1 alle Skalar-Messwerte sind endliche, nichtnegative Zahlen",
    [m.vorgangsAnkunftProTag, m.profilVorgaengeProTagBei5, m.personVorgaengeJeMandatIst,
      m.wuerdigAnteil, m.aufrufeJeErgebnis, m.wiederholungsReserve,
      m.mandatsgebundenJeMandatProTag, m.andereVerbraucherProTag, m.aktiveMandateBasis,
      m.slotKapazitaetVerstehenProTag, m.heutigerTagesdeckel, m.heutigeReserve]
      .every((v) => Number.isFinite(v) && v >= 0));
  check("§1.2 der würdige Anteil liegt in (0,1] und der Quelltext bindet ihn an die Messung",
    m.wuerdigAnteil > 0 && m.wuerdigAnteil <= 1 && /gemessen|Schattenmessung/.test(src));
  check("§1.3 Auftragsregel verankert: zurückstellen kostet einen VOLLEN Aufruf, nur Parken spart",
    /zurückstellen[\s\S]{0,80}VOLLEN Modellaufruf/.test(src) && /nur echtes Parken spart/.test(src));
  check("§1.4 der geteilte Quellenkatalog bleibt mandatszahl-konstant (ein Vorgang wird genau einmal verstanden)",
    /katalog bleibt konstant/.test(src) && /GENAU EINMAL verstanden/.test(src));
  check("§1.5 heutiger Deckel/Reserve stehen nur als Messwerte im Modell (100/30) und werden nicht verändert",
    m.heutigerTagesdeckel === 100 && m.heutigeReserve === 30);
}

abschnitt("§2 Die frühere 455 ist der ERWARTUNGSWERT — bestätigt, aber nicht konservativ");
{
  const e = k.verstehensBedarf({ mandate: 500, szenario: "erwartung" });
  check("§2.1 Erwartungswert des Verstehens-Bedarfs reproduziert ~455 (±5 %)",
    e && e.aufrufeProTag >= 433 && e.aufrufeProTag <= 478);
  const kons = k.verstehensBedarf({ mandate: 500, szenario: "konservativ" });
  check("§2.2 der konservative Verstehens-Bedarf liegt BELEGBAR darüber (Profil-/Personenquellen wachsen mit)",
    kons.aufrufeProTag > e.aufrufeProTag && kons.profilVorgaenge > e.profilVorgaenge && kons.personVorgaenge > e.personVorgaenge);
  check("§2.3 unbekanntes Szenario ⇒ null (keine erfundene Zahl)",
    k.verstehensBedarf({ szenario: "banane" }) === null && k.tagesModell({ szenario: "" }) === null);
  check("§2.4 EINHEITEN (Befund 4): die drei verschiedenen 455er sind dokumentiert und getrennt "
    + "(Aufträge@5 aus skalierung-25-50-100 §2 · KI-Aufrufe@500 aus understanding-kapazitaet §13.3 · Modell-Erwartungswert)",
    /WARTESCHLANGEN-AUFTRÄGE\/Tag bei\s*\n?\s*\/\/\s*5 Mandaten/.test(src)
    && /KI-AUFRUFE\/Tag/.test(src)
    && /ERWARTUNGSWERT des Verstehens-KI-Bedarfs bei 500/.test(src)
    && /Zahlengleichheit von \(a\) mit \(b\) ist Zufall/.test(src));
}

abschnitt("§3 Zieldeckel: VORLÄUFIGER Szenario-/Planungswert (Spanne + offene Messungen)");
{
  const z = k.zielDeckel({});
  check("§3.1 Planungswert = konservativer Gesamtbedarf ÷ 0,75 (25 % freie Kapazität), aufgerundet",
    z.zielDeckel === Math.ceil(z.konservativ.gesamtBedarfProTag / k.FREIE_KAPAZITAET_FAKTOR));
  check("§3.2 Planungswert ≥ Fairness-Untergrenze 2n−1 = 999 (K1: tägliches Narrativ je Mandat)",
    z.zielDeckel >= 999 && z.konservativ.fairnessUntergrenze === 999);
  check("§3.3 Planungswert trägt den konservativen Szenario-Bedarf einschließlich Reserve",
    z.zielDeckel * k.FREIE_KAPAZITAET_FAKTOR >= z.konservativ.gesamtBedarfProTag);
  check("§3.4 der Stresswert wird NICHT in den Deckel eingepreist (Warnschwellen statt Überdimensionierung)",
    z.zielDeckel < z.stress.erforderlicherDeckel);
  check("§3.5 die erforderliche Verstehens-Reserve ist der konservative Frischbedarf (im Deckel, nie addiert)",
    z.reserveVerstehen === z.konservativ.verstehen.aufrufeProTag && z.reserveVerstehen < z.zielDeckel);
  check("§3.6 Monotonie: Erwartung ≤ konservativ ≤ Stress (Gesamtbedarf)",
    z.erwartung.gesamtBedarfProTag <= z.konservativ.gesamtBedarfProTag
    && z.konservativ.gesamtBedarfProTag <= z.stress.gesamtBedarfProTag);
  const kleiner = k.tagesModell({ mandate: 100, szenario: "konservativ" });
  check("§3.7 Monotonie in der Mandatszahl: 100 Mandate brauchen weniger als 500",
    kleiner.gesamtBedarfProTag < z.konservativ.gesamtBedarfProTag);
  check("§3.8 EINORDNUNG (Befund 4): der Wert trägt sich selbst als vorläufigen Szenario-Planungswert",
    z.einordnung === "vorlaeufiger-szenario-planungswert"
    && !/kleinsten belegbar ausreichenden Zieldeckel als\s*\n?\/\/ Betreiberempfehlung/.test(src));
  check("§3.9 SPANNE statt grünem Punktwert: Erwartung < konservativ, beide ausgewiesen",
    z.spanne && z.spanne.erwartung === z.erwartung.erforderlicherDeckel
    && z.spanne.konservativ === z.zielDeckel && z.spanne.erwartung < z.spanne.konservativ);
  check("§3.10 OFFENE Z3b-MESSUNGEN benannt: p95 Verstehen/Lage/Büro, Azure-Kontingente, Fachwegbericht",
    Array.isArray(z.offeneMessungen) && z.offeneMessungen.length === 5
    && ["p95-tagesbedarf-verstehen", "p95-tagesbedarf-lage", "p95-tagesbedarf-buero",
      "azure-kontingente-und-rate-limits", "vollstaendiger-fachwegbericht"]
      .every((x) => z.offeneMessungen.includes(x)));
  check("§3.11 der hinweis-Text nennt die Vorläufigkeit und die Freigabepflicht in einem Satz",
    /Vorläufiger Szenario-\/Planungswert/.test(z.hinweis) && /KEINE finale Dimensionierung/.test(z.hinweis)
    && /freigabepflichtige Production-Änderung/.test(z.hinweis));
}

abschnitt("§4 Kopplung an die 48-Slot-Kapazität (minimal-cron)");
{
  const z = k.zielDeckel({});
  const slotKap = minimalCron.tagesKapazitaet({});
  check("§4.1 die Slotkapazität des Modells baut auf den 912 des Minimal-Cron-Vertrags auf",
    k.MESSWERTE.slotKapazitaetVerstehenProTag === slotKap.maxAufrufeJeTag + 38 + 29 + 5);
  check("§4.2 der KONSERVATIVE Verstehens+Abbau-Bedarf passt in die Slotkapazität",
    z.konservativ.slotKapazitaetReicht === true
    && z.konservativ.slotVerstehenLastProTag <= k.MESSWERTE.slotKapazitaetVerstehenProTag);
  check("§4.3 der STRESSFALL wird ehrlich als nicht slot-gedeckt gemeldet (kein falsches Grün)",
    z.stress.slotKapazitaetReicht === false);
  check("§4.4 auch der Erwartungsfall passt (mit deutlichem Puffer ≥ 30 %)",
    z.erwartung.slotKapazitaetReicht === true
    && z.erwartung.slotVerstehenLastProTag <= 0.7 * k.MESSWERTE.slotKapazitaetVerstehenProTag);
}

abschnitt("§5 Warnschwellen: benannt, prüfbar, quellengebunden");
{
  const w = k.warnSchwellen({});
  check("§5.1 fünf Warnschwellen W1–W5", w.length === 5 && w.every((x) => /^W\d-/.test(x.kennung)));
  check("§5.2 jede Schwelle nennt Regel UND Datenquelle",
    w.every((x) => typeof x.regel === "string" && x.regel.length > 20 && typeof x.quelle === "string" && x.quelle.length > 3));
  check("§5.3 Deckelnähe, Drain-Rot, Slotgrenze, Fehlversuche und Wartezeit sind abgedeckt",
    ["deckelnähe", "drain-rot", "slotgrenze", "fehlversuche", "wartezeit"].every((t) => w.some((x) => x.kennung.includes(t))));
}

abschnitt("§6 Rechenprobe gegen die Realität der 5 Mandate");
{
  const probe = k.rechenProbeHeute({});
  check("§6.1 heutiger gate-treuer Bedarf (inkl. zurückstellen) liegt bei ~250 Aufrufen/Tag (Band 200–300)",
    probe.bedarfAufrufeProTag >= 200 && probe.bedarfAufrufeProTag <= 300);
  check("§6.2 der Bedarf übersteigt den gemessenen Abfluss (68–87/Tag) — konsistent mit dem belegten Verhungern",
    probe.bedarfAufrufeProTag > 87);
}

abschnitt("§7 Kein Production-Eingriff: das Modul ist pur");
{
  check("§7.1 kein process.env-Schreibzugriff, kein fetch, kein storage-Require",
    !/process\.env\s*\[/.test(src) && !/process\.env\.\w+\s*=/.test(src)
    && !/require\([^)]*storage/.test(src) && !/\bfetch\(/.test(src));
  check("§7.2 der Zieldeckel ist als Betreiberempfehlung gekennzeichnet (freigabepflichtig)",
    /Betreiberempfehlung/.test(src) && /freigabepflichtige Production-Änderung/.test(src));
}

abschnitt("§8 Zeitbedarf und Scheiben beachten dieselbe Minutengrenze");
{
  const eingabe = { fensterMinuten: 10, parallel: 10, laufzeitJeAufrufMs: 1000,
    maxAnfragenJeMinute: 10, bedarfAufrufe: 500 };
  const begrenzt = k.zyklusPasstInsFenster(eingabe);
  check("§8.1 500 Aufrufe bei 10 RPM brauchen mindestens 50 Minuten, nicht eine",
    begrenzt.bewertbar && !begrenzt.passt && begrenzt.moeglicheAufrufe === 100
      && begrenzt.benoetigteMinuten === 50 && begrenzt.bindendeGrenze === "minutengrenze"
      && begrenzt.meldung.includes("50 Minuten"));
  check("§8.2 auch eine 280 Sekunden Scheibe ist durch 10 RPM begrenzt",
    begrenzt.aufrufeJeScheibe === 46);
  check("§8.3 im Modell reichen 50 Minuten, 49 reichen nicht",
    k.zyklusPasstInsFenster({ ...eingabe, fensterMinuten: 50 }).passt === true
      && k.zyklusPasstInsFenster({ ...eingabe, fensterMinuten: 49 }).passt === false);
  const langsam = k.zyklusPasstInsFenster({ ...eingabe, parallel: 1, laufzeitJeAufrufMs: 60000 });
  check("§8.4 langsamer Transport bleibt trotz hoher RPM bindend",
    langsam.benoetigteMinuten === 500 && langsam.bindendeGrenze === "laufzeit"
      && langsam.aufrufeJeScheibe === 4);
  const ohneRpm = k.zyklusPasstInsFenster({ ...eingabe, maxAnfragenJeMinute: null });
  check("§8.5 ohne optionale Minutengrenze bleibt die Laufzeitrechnung erhalten",
    ohneRpm.bewertbar && ohneRpm.passt && ohneRpm.benoetigteMinuten === 1 && ohneRpm.ausRpm === null);
}

abschnitt("§9 Ungueltige Mengen duerfen keine Startbereitschaft vortaeuschen");
{
  const basis = { fensterMinuten: 10, parallel: 2, laufzeitJeAufrufMs: 1000, bedarfAufrufe: 500 };
  const ungueltig = [-1, 1.9, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "500", true];
  for (const feld of ["bedarfAufrufe", "parallel", "mandate", "maxAnfragenJeMinute"]) {
    const werte = feld === "bedarfAufrufe" ? ungueltig : [...ungueltig, 0];
    check(`§9 ${feld}: ungueltige Werte sind unbewertbar und niemals passend`,
      werte.every(wert => { const r = k.zyklusPasstInsFenster({ ...basis, [feld]: wert });
        return r.bewertbar === false && r.passt !== true; }));
  }
  const nullBedarf = k.zyklusPasstInsFenster({ ...basis, bedarfAufrufe: null });
  check("§9 fehlender Bedarf verwendet weiter das benannte Szenario",
    nullBedarf.bewertbar && nullBedarf.benoetigteAufrufe === 1812);
  const explizitLeer = k.zyklusPasstInsFenster({ ...basis, bedarfAufrufe: 0 });
  check("§9 ausdruecklich null Aufgaben bleiben von fehlendem Bedarf unterscheidbar",
    explizitLeer.bewertbar && explizitLeer.passt && explizitLeer.benoetigteMinuten === 0);
  check("§9 Rechenueberlauf und numerische Scheinwerte liefern kein Gruen",
    [{ fensterMinuten: 1e300 }, { laufzeitJeAufrufMs: 1e-300 }, { fensterMinuten: "10" },
      { laufzeitJeAufrufMs: true }].every(wert => {
      const r = k.zyklusPasstInsFenster({ ...basis, ...wert });
      return r.bewertbar === false && r.passt !== true;
    }));
}

console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
