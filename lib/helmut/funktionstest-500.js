"use strict";

// Helmut — SICHERHEITSRAHMEN DES 500er-PRODUCTION-FUNKTIONSTESTS.
// =============================================================================
// Drei Teile, alle FAIL CLOSED und alle ohne jede Production-Wirkung:
//
//   A. KAPAZITÄTS- UND KOSTENRIEGEL  — sieben Pflichtwerte, ihre Validierung
//      und ihre gegenseitige Bindung. Es wird KEIN Production-Wert gesetzt;
//      dieses Modul prüft nur, ob eine übergebene Konfiguration in sich
//      stimmig und vollständig ist.
//   B. ABBRUCHREGELN — fünfzehn Regeln, die den späteren Lauf automatisch
//      stoppen (A13–A15 ergänzt am 02.09.: Dubletten, die VERDRÄNGUNG eines
//      realen Mandats und der Mindestumfang beobachteter Arbeit). Eine Regel ohne
//      Messwert ist NICHT „grün", sondern „nicht bewertbar" — und das bricht ab.
//   C. STARTFENSTER — der Test darf nicht in ein unverträgliches Laufzeit-
//      fenster gelegt werden (05:45-Lage-Briefing und 05:48-Minimal-Cron-Slot).
//
// Reine Logik: kein Netz, keine Datenbank, keine Uhr, keine Secrets. Alle
// Eingaben sind Parameter. Nichts hier aktiviert, setzt oder ändert etwas.
//
// ─── WARUM KEIN KONKRETER PRODUCTION-WERT ────────────────────────────────────
// Die dokumentierte Spanne 1.492–2.416 Aufrufe/Tag sind SZENARIEN aus
// `lib/helmut/kapazitaet-500.js` (Erwartung bzw. konservativ), kein finaler
// Deckel. Die verbindliche Festlegung braucht zuvor die offenen Z3b-Messungen
// (`zielDeckel().offeneMessungen`). Dieses Modul gibt deshalb eine
// EMPFEHLUNG mit Herkunft und Einordnung aus und verweigert die Bereitschaft,
// solange eine Pflichtangabe oder eine offene Messung fehlt.

const kapazitaet = require("./kapazitaet-500");
const minimalCron = require("./minimal-cron");
const kommunikationsriegel = require("./kommunikationsriegel");
const { KOHORTE_GESAMT, REALE_MANDATE } = require("./test-kohorte-500");
const mandatsklasse = require("./mandatsklasse");

const MANDATE_GESAMT = REALE_MANDATE + KOHORTE_GESAMT; // 500

// ═════════════════════════════════════════════════════════════════════════════
// A · KAPAZITÄTS- UND KOSTENRIEGEL
// ═════════════════════════════════════════════════════════════════════════════

// Die sieben Pflichtwerte. Jeder trägt seinen Umgebungsnamen, seine Einheit und
// die Begründung, warum er ohne Wert blockiert.
const PFLICHTWERTE = Object.freeze([
  Object.freeze({
    schluessel: "gesamtdeckel",
    env: "HELMUT_MAX_LLM_CALLS_PER_DAY",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: "Sicherer Gesamtdeckel aller KI-Aufrufe des Tages (bindende Obergrenze).",
    ohneWert: "Ohne gesetzten Deckel greift laut Code das Schutzlimit 50 — für 500 Mandate ist das kein Testlauf, sondern ein sofortiger Budgetboden."
  }),
  Object.freeze({
    schluessel: "reserveVerstehen",
    env: "HELMUT_LLM_RESERVE_UNDERSTANDING",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: "Anteil INNERHALB des Gesamtdeckels, der dem Frischverstehen vorbehalten bleibt.",
    ohneWert: "Ohne passende Reserve verhungert das Frischverstehen unter dem neuen Deckel — die Reserve wird nie zum Deckel addiert."
  }),
  Object.freeze({
    schluessel: "maxAnfragenJeMinute",
    env: "HELMUT_TESTLAUF_MAX_RPM",
    einheit: "Anfragen/Minute",
    art: "ganzzahl",
    zweck: "Harte Minutengrenze gegen die Anbieter-Drosselung (Azure RPM).",
    ohneWert: "Ohne RPM-Grenze läuft der Test blind in die Anbieterdrosselung."
  }),
  Object.freeze({
    schluessel: "maxTokenJeMinute",
    env: "HELMUT_TESTLAUF_MAX_TPM",
    einheit: "Token/Minute",
    art: "ganzzahl",
    zweck: "Harte Minutengrenze des Tokendurchsatzes (Azure TPM).",
    ohneWert: "Ohne TPM-Grenze kann eine einzige lange Antwort das Minutenkontingent reißen."
  }),
  Object.freeze({
    schluessel: "kostenbudgetUsd",
    env: "HELMUT_TESTLAUF_KOSTENBUDGET_USD",
    einheit: "USD",
    art: "dezimal",
    zweck: "Maximale Kosten des gesamten Funktionstests.",
    ohneWert: "Ohne Kostenbudget gibt es keine Grenze, gegen die Abbruchregel 4 prüfen könnte."
  }),
  Object.freeze({
    schluessel: "vorrangreserveReal",
    env: "HELMUT_TESTLAUF_VORRANG_REAL",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: `Innerhalb des Deckels freigehaltener Vorrang für die ${REALE_MANDATE} realen Mandate.`,
    ohneWert: "Ohne Vorrangreserve können 495 synthetische Profile die realen Mandate aus dem Tagesbudget verdrängen."
  }),
  Object.freeze({
    schluessel: "maxParallel",
    env: "HELMUT_TESTLAUF_MAX_PARALLEL",
    einheit: "gleichzeitige Aufrufe",
    art: "ganzzahl",
    zweck: "Harte Begrenzung gleichzeitiger Modellaufrufe.",
    ohneWert: "Ohne Parallelitätsgrenze ist weder die RPM- noch die TPM-Grenze einhaltbar."
  })
]);

// Fairness-Untergrenze K1: bei n Mandaten braucht der Deckel mindestens 2n−1
// Aufrufe, damit kein Mandat strukturell leer ausgeht.
function fairnessUntergrenze(mandate = MANDATE_GESAMT) {
  return 2 * mandate - 1;
}

function istGanzzahl(wert) {
  return typeof wert === "number" && Number.isSafeInteger(wert) && wert > 0;
}
function istDezimal(wert) {
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0;
}

// Prüft eine übergebene Konfiguration. Wirft nie; antwortet immer vollständig.
// `bereit` ist NUR true, wenn alle sieben Werte gesetzt, alle Bindungen erfüllt
// UND alle offenen Messungen beigebracht sind.
function pruefeKonfiguration(konfiguration = {}, { mandate = MANDATE_GESAMT, messungen = {} } = {}) {
  const werte = konfiguration && typeof konfiguration === "object" ? konfiguration : {};
  const fehlend = [];
  const gelesen = {};

  for (const feld of PFLICHTWERTE) {
    const roh = werte[feld.schluessel];
    const gueltig = feld.art === "dezimal" ? istDezimal(roh) : istGanzzahl(roh);
    if (!gueltig) {
      fehlend.push(Object.freeze({
        schluessel: feld.schluessel,
        env: feld.env,
        einheit: feld.einheit,
        wirkung: feld.ohneWert
      }));
      continue;
    }
    gelesen[feld.schluessel] = roh;
  }

  const bindungen = [];
  const untergrenze = fairnessUntergrenze(mandate);
  const habe = (k) => Object.prototype.hasOwnProperty.call(gelesen, k);

  if (habe("gesamtdeckel")) {
    bindungen.push({
      name: "Deckel erreicht die Fairness-Untergrenze 2n−1",
      ok: gelesen.gesamtdeckel >= untergrenze,
      detail: `Deckel ${gelesen.gesamtdeckel} gegen Untergrenze ${untergrenze} bei ${mandate} Mandaten`
    });
  }
  if (habe("gesamtdeckel") && habe("reserveVerstehen")) {
    bindungen.push({
      name: "Verstehens-Reserve liegt IM Deckel und wird nie addiert",
      ok: gelesen.reserveVerstehen < gelesen.gesamtdeckel,
      detail: `Reserve ${gelesen.reserveVerstehen} < Deckel ${gelesen.gesamtdeckel}`
    });
  }
  if (habe("gesamtdeckel") && habe("reserveVerstehen") && habe("vorrangreserveReal")) {
    const summe = gelesen.reserveVerstehen + gelesen.vorrangreserveReal;
    bindungen.push({
      name: "Beide Reserven zusammen passen in den Deckel",
      ok: summe < gelesen.gesamtdeckel,
      detail: `Verstehen ${gelesen.reserveVerstehen} + Vorrang real ${gelesen.vorrangreserveReal} = ${summe} < ${gelesen.gesamtdeckel}`
    });
  }
  if (habe("vorrangreserveReal")) {
    bindungen.push({
      name: `Vorrangreserve deckt die ${REALE_MANDATE} realen Mandate`,
      ok: gelesen.vorrangreserveReal >= REALE_MANDATE,
      detail: `Vorrang ${gelesen.vorrangreserveReal} für ${REALE_MANDATE} reale Mandate`
    });
    // ERGÄNZT 02.09. — die Bindung oben schützt nur die ANZAHL der Mandate.
    // Gemessen (60 volle Tage, §16.3) brauchen dieselben fünf Mandate p95 170
    // Aufrufe/Tag, und das ist eine UNTERGRENZE (bewiesene Untererfassung des
    // Blob-Rings, §17.2). Ein Vorrang von 5 hätte den Test durchgelassen und die
    // realen Mandate trotzdem verhungern lassen.
    bindungen.push({
      name: "Vorrangreserve deckt den GEMESSENEN Tagesbedarf der realen Mandate",
      ok: gelesen.vorrangreserveReal >= mandatsklasse.VORRANG_REAL_MESSBEDARF_P95,
      detail: `Vorrang ${gelesen.vorrangreserveReal} ≥ gemessener p95-Tagesbedarf `
        + `${mandatsklasse.VORRANG_REAL_MESSBEDARF_P95} (Untergrenze; Empfehlung `
        + `${mandatsklasse.VORRANG_REAL_EMPFEHLUNG} mit Aufschlag für die bewiesene Untererfassung)`
    });
  }
  if (habe("gesamtdeckel") && habe("reserveVerstehen")) {
    // ERGÄNZT 02.09. (adversariale Analyse, bestätigter Befund): `tagesModell()`
    // rechnet `slotKapazitaetReicht` seit jeher aus, aber NIEMAND wertete das
    // Feld aus. Ein später auf das Stressszenario angehobener Deckel hätte
    // `bereit = true` gemeldet, obwohl die Verstehens-Slotlast die physische
    // Slotkapazität übersteigt: die Reserve wäre im Deckel gebucht, aber
    // physisch nicht abrufbar, und der Frischverstehens-Rückstand wüchse ab dem
    // ersten Tag. Das fiele sonst erst über Abbruchregel A07 auf — nach dem
    // Schaden. Bindend ist die Reserve, denn genau sie sagt zu, wie viele
    // Verstehensaufrufe der Tag TRAGEN muss.
    const slots = kapazitaet.MESSWERTE.slotKapazitaetVerstehenProTag;
    bindungen.push({
      name: "Verstehens-Reserve ist physisch abrufbar (Slotkapazität)",
      ok: gelesen.reserveVerstehen <= slots,
      detail: `Reserve ${gelesen.reserveVerstehen} ≤ Slotkapazität Verstehen ${slots}/Tag`
    });
  }
  if (habe("maxParallel") && habe("maxAnfragenJeMinute")) {
    bindungen.push({
      name: "Parallelität überschreitet die Minutengrenze nicht",
      ok: gelesen.maxParallel <= gelesen.maxAnfragenJeMinute,
      detail: `parallel ${gelesen.maxParallel} ≤ RPM ${gelesen.maxAnfragenJeMinute}`
    });
  }
  if (habe("gesamtdeckel") && habe("maxAnfragenJeMinute")) {
    // KORRIGIERT 02.09. (adversarialer Review): die alte Rechnung
    // `RPM × 60 × 24` unterstellte unbegrenzte Parallelität und überschätzte den
    // erreichbaren Tagesdurchsatz um Größenordnungen. Bindend ist bei
    // Parallelität p und gemessener Laufzeit d je Aufruf:
    //   min(RPM, p × 60000/d) Aufrufe je Minute.
    const parallel = habe("maxParallel") ? gelesen.maxParallel : 1;
    const ausLaufzeit = Math.floor(parallel * 60000 / kapazitaet.LAUFZEIT_JE_AUFRUF_MS);
    const proMinute = Math.max(1, Math.min(gelesen.maxAnfragenJeMinute, ausLaufzeit));
    const maxProTag = proMinute * 60 * 24;
    bindungen.push({
      name: "Der Tagesdeckel ist mit Minutengrenze UND Parallelität erreichbar",
      ok: gelesen.gesamtdeckel <= maxProTag,
      detail: `Deckel ${gelesen.gesamtdeckel} ≤ ${maxProTag} `
        + `(${proMinute}/min: min(RPM ${gelesen.maxAnfragenJeMinute}, `
        + `Parallelität ${parallel} × 60.000/${kapazitaet.LAUFZEIT_JE_AUFRUF_MS} ms = ${ausLaufzeit}))`
    });
  }

  // ── TPM: die Grenze, die bisher KEINE Bindung hatte ───────────────────────
  // `maxTokenJeMinute` war Pflichtwert, wurde aber von keiner Bindung und keiner
  // Abbruchregel benutzt (adversarialer Review 02.09.). Mit den gemessenen
  // 3.018 Token je Aufruf lässt die TPM-Grenze nur ~82 Anfragen/Minute zu — wer
  // RPM auf 250 setzt, setzt eine Grenze, welche die andere bricht.
  if (habe("maxAnfragenJeMinute") && habe("maxTokenJeMinute")) {
    const rpm = kapazitaet.wirksameRpm({
      rpmGrenze: gelesen.maxAnfragenJeMinute,
      tpmGrenze: gelesen.maxTokenJeMinute
    });
    bindungen.push({
      name: "Die RPM-Grenze bricht die TPM-Grenze nicht",
      ok: gelesen.maxAnfragenJeMinute <= rpm.ausTpm,
      detail: `RPM ${gelesen.maxAnfragenJeMinute} gegen TPM-verträgliche ${rpm.ausTpm} `
        + `(${rpm.tokenJeAufruf} Token je Aufruf, gemessen)`
    });
  }

  // ── KOSTEN: der Pflichtwert hatte bisher keine einzige Bindung ────────────
  // Jeder positive Betrag kam durch — auch 0,01 USD (der Lauf bräche sofort ab)
  // und auch 10.000 USD (keine Grenze). Die Herleitung existiert längst in
  // `kapazitaet.kostenabbruchgrenze()`; sie wird jetzt auch geprüft.
  //
  // EINHEIT, ausdrücklich: der 500er-Funktionstest ist ein TAGESLAUF. Die
  // Tagesgrenze IST damit die Gesamtgrenze — beide Zahlen sind dieselbe.
  if (habe("gesamtdeckel") && habe("kostenbudgetUsd")) {
    const k = kapazitaet.kostenabbruchgrenze({ deckel: gelesen.gesamtdeckel });
    bindungen.push({
      name: "Das Kostenbudget trägt den Deckel bei gemessenen Mischkosten",
      ok: gelesen.kostenbudgetUsd >= k.erwartungUsdProTag,
      detail: `Budget ${gelesen.kostenbudgetUsd} USD ≥ Erwartung ${k.erwartungUsdProTag} USD/Tag `
        + `(Deckel ${gelesen.gesamtdeckel} × ${kapazitaet.KOSTEN_JE_AUFRUF_USD.gemischt} USD)`
    });
    bindungen.push({
      name: "Das Kostenbudget ist eine echte Grenze, keine Freikarte",
      ok: gelesen.kostenbudgetUsd <= k.empfehlungUsd * 2,
      detail: `Budget ${gelesen.kostenbudgetUsd} USD ≤ ${k.empfehlungUsd * 2} USD `
        + `(doppelte hergeleitete Abbruchgrenze ${k.empfehlungUsd})`
    });
  }

  const gebrochen = bindungen.filter((b) => !b.ok);

  // Offene externe Messungen: ohne sie ist keine VERBINDLICHE Dimensionierung
  // möglich — insbesondere ist die TPM-Grenze nicht gegen echte Tokenwerte
  // prüfbar, solange die Azure-Messung fehlt.
  const empfehlung = kapazitaet.zielDeckel({ mandate });
  const offeneMessungen = empfehlung.offeneMessungen.filter(
    (name) => !(messungen && messungen[name])
  );

  const bereit = fehlend.length === 0 && gebrochen.length === 0 && offeneMessungen.length === 0;
  return Object.freeze({
    bereit,
    mandate,
    fehlendeWerte: Object.freeze(fehlend),
    bindungen: Object.freeze(bindungen.map((b) => Object.freeze({ ...b }))),
    gebrocheneBindungen: Object.freeze(gebrochen.map((b) => b.name)),
    offeneMessungen: Object.freeze(offeneMessungen),
    fairnessUntergrenze: untergrenze,
    empfehlung: entscheidungstabelle({ mandate }),
    meldung: bereit
      ? "Konfiguration vollständig, in sich stimmig und durch Messungen belegt."
      : `Konfiguration NICHT bereit: ${fehlend.length} fehlende Werte, `
        + `${gebrochen.length} gebrochene Bindungen, ${offeneMessungen.length} offene Messungen.`
  });
}

// Die belegte Entscheidungstabelle: empfohlene Werte MIT Herkunft, offene
// Messwerte und das Verhalten bei fehlendem Pflichtwert. Ausdrücklich KEINE
// Production-Werte — die Spanne bleibt als Spanne stehen.
function entscheidungstabelle({ mandate = MANDATE_GESAMT } = {}) {
  const ziel = kapazitaet.zielDeckel({ mandate });
  const untergrenze = fairnessUntergrenze(mandate);
  return Object.freeze({
    einordnung: ziel.einordnung, // "vorlaeufiger-szenario-planungswert"
    warnung: "Die Werte 1.492 (Erwartung) bis 2.416 (konservativ) sind SZENARIEN, "
      + "kein finaler Production-Deckel. Die verbindliche Festlegung braucht zuvor "
      + "die offenen Messungen und bleibt eine getrennte Betreiberfreigabe.",
    zeilen: Object.freeze([
      Object.freeze({
        wert: "gesamtdeckel",
        env: "HELMUT_MAX_LLM_CALLS_PER_DAY",
        empfehlung: `${ziel.spanne.erwartung}–${ziel.spanne.konservativ} (Szenariospanne)`,
        herkunft: "kapazitaet-500.zielDeckel(): konservativer Bedarf ÷ 0,75; Fairness-Untergrenze 2n−1",
        untergrenze,
        offen: "p95-Tagesbedarfe je Fachweg, echte Azure-Kontingente",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "reserveVerstehen",
        env: "HELMUT_LLM_RESERVE_UNDERSTANDING",
        empfehlung: `${ziel.reserveVerstehen} (Anteil IM Deckel)`,
        herkunft: "kapazitaet-500: konservativer priorisierter Verstehens-Frischbedarf",
        untergrenze: null,
        offen: "p95-Tagesbedarf Verstehen",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxAnfragenJeMinute",
        env: "HELMUT_TESTLAUF_MAX_RPM",
        // KORRIGIERT 02.09.: die Deploymentgrenze ist seit dem 02.09. bestätigt
        // (250 RPM / 250.000 TPM), aber sie ist NICHT der zu setzende Wert.
        empfehlung: `${kapazitaet.wirksameRpm().wirksam} — NICHT die Deploymentgrenze 250: bei `
          + `gemessenen ${kapazitaet.TOKEN_JE_AUFRUF} Token je Aufruf lässt die TPM-Grenze nur `
          + `${kapazitaet.wirksameRpm().ausTpm} Anfragen/Minute zu`,
        herkunft: "Deploymentgrenze bestätigt (Betreiber 02.09.); wirksamer Wert aus "
          + "TPM ÷ gemessene Token je Aufruf",
        untergrenze: null,
        offen: "azure-kontingente-und-rate-limits (Gesamtkontingent des KONTOS)",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxTokenJeMinute",
        env: "HELMUT_TESTLAUF_MAX_TPM",
        // BELEGT seit 02.09.: Deploymentgrenze 250.000 TPM (Betreiberangabe);
        // die eigene Stichprobe lastete sie zu 13,1 % aus.
        empfehlung: `${kapazitaet.wirksameRpm().tpmGrenze} (Deploymentgrenze gpt-5-mini, `
          + "Global Standard, Version 2025-08-07, Sweden Central)",
        herkunft: "Betreiberangabe 02.09.; eigene Messung 32.686 TPM = 13,1 % Auslastung",
        untergrenze: null,
        offen: "Azure-GESAMTKONTINGENT DES KONTOS — davon getrennt und nicht erhoben",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "kostenbudgetUsd",
        env: "HELMUT_TESTLAUF_KOSTENBUDGET_USD",
        // HERGELEITET seit 02.09.: Deckel × gemessene Kosten je Aufruf. Die
        // Preisbasis bleibt der Listenpreis — F7 ist unverändert offen.
        empfehlung: `${kapazitaet.kostenabbruchgrenze().empfehlungUsd} USD (Deckel `
          + `${kapazitaet.VORBEREITETER_DECKEL}: Erwartung `
          + `${kapazitaet.kostenabbruchgrenze().erwartungUsdProTag} USD/Tag, obere Schranke `
          + `${kapazitaet.kostenabbruchgrenze().obereSchrankeUsdProTag} USD/Tag)`,
        herkunft: "gemessene Kosten je Aufruf (§16.5) × Deckel; der Test ist ein TAGESLAUF, "
          + "die Tagesgrenze ist damit die Gesamtgrenze",
        untergrenze: null,
        offen: "F7 — nur Listenpreis, kein nachgewiesener Kontopreis am Lauftag",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "vorrangreserveReal",
        env: "HELMUT_TESTLAUF_VORRANG_REAL",
        // KORRIGIERT 02.09. (adversarialer Review): hier stand „mindestens 5" —
        // im Widerspruch zur Bindung im SELBEN Rückgabeobjekt, die seit dem
        // 02.09. mindestens 170 verlangt. 5 schützt nur die ANZAHL der Mandate,
        // nicht ihren gemessenen Tagesbedarf.
        empfehlung: `${mandatsklasse.VORRANG_REAL_EMPFEHLUNG} — mindestens `
          + `${mandatsklasse.VORRANG_REAL_MESSBEDARF_P95} (gemessener p95-Tagesbedarf der `
          + `${REALE_MANDATE} realen Mandate, UNTERGRENZE)`,
        herkunft: "gemessen über 60 volle Tage (helmut_store.data.llmUsage, §16.3); "
          + "die Empfehlung trägt einen Aufschlag für die bewiesene ~12 % Untererfassung (§17.2)",
        untergrenze: mandatsklasse.VORRANG_REAL_MESSBEDARF_P95,
        offen: "Aufteilung je Mandat — der Bedarf ist nicht je Mandat aufgeschlüsselt",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxParallel",
        env: "HELMUT_TESTLAUF_MAX_PARALLEL",
        empfehlung: "1 (unveränderte Parallelität des heutigen Motors)",
        herkunft: "HELMUT_VERSTEHEN_PARALLELITAET ist ungesetzt und wirkt als 1",
        untergrenze: 1,
        offen: null,
        beiFehlendemWert: "fail closed — kein Testbeginn"
      })
    ]),
    offeneMessungen: ziel.offeneMessungen,
    failClosed: "Solange EIN Pflichtwert fehlt oder EINE offene Messung aussteht, "
      + "meldet pruefeKonfiguration() bereit=false und der Test darf nicht beginnen."
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// B · ABBRUCHREGELN
// ═════════════════════════════════════════════════════════════════════════════
//
// Jede Regel nennt ihre Beobachtungsgröße und ihre Grenze. Eine Regel, deren
// Beobachtung fehlt, ist NICHT erfüllt, sondern NICHT BEWERTBAR — und das
// bricht den Lauf ab. „Kein Messwert" darf nie wie „alles in Ordnung" wirken.

const ABBRUCHREGELN = Object.freeze([
  Object.freeze({
    id: "A01", name: "Erster unbekannter Modellaufruf",
    beobachtung: "unbekannteModellaufrufe", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "llm_usage / Laufquittung (callType-Allowlist)",
    beschreibung: "Ein Modellaufruf, dessen Arbeitsform nicht im freigegebenen Katalog steht."
  }),
  Object.freeze({
    id: "A02", name: "Hängende oder verlorene Lease",
    beobachtung: "haengendeLeases", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "helmut_jobs / CAS-Leases (abgelaufene oder verwaiste Reservierung)",
    beschreibung: "Eine Reservierung ohne lebenden Bearbeiter — Doppelarbeit oder Verlust droht."
  }),
  Object.freeze({
    id: "A03", name: "Fehlerquote über der Grenze",
    beobachtung: "fehlerquote", grenzeSchluessel: "maxFehlerquote", grenzeFest: null,
    quelle: "Laufbilanz (fehlgeschlagen ÷ verarbeitet)",
    beschreibung: "Anteil endgültig fehlgeschlagener Vorgänge überschreitet die gesetzte Grenze."
  }),
  Object.freeze({
    id: "A04", name: "Kostenüberschreitung",
    beobachtung: "kostenBisherUsd", grenzeSchluessel: "kostenbudgetUsd", grenzeFest: null,
    quelle: "Kostenrechnung aus llm_budget_counters × bestätigtem Preis",
    beschreibung: "Die laufende Kostenoberrechnung erreicht das freigegebene Budget."
  }),
  Object.freeze({
    id: "A05", name: "Laufzeitüberschreitung",
    beobachtung: "laufzeitMinuten", grenzeSchluessel: "maxLaufzeitMinuten", grenzeFest: null,
    quelle: "Startzeitpunkt des Tests gegen die Uhr des Aufrufers",
    beschreibung: "Der Test überschreitet sein vereinbartes Zeitfenster."
  }),
  Object.freeze({
    id: "A06", name: "Azure-Drosselung",
    beobachtung: "drosselungen", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "HTTP 429 des Anbieters",
    beschreibung: "Schon die erste Drosselung beendet den Lauf — kein Wiederholungsversuch."
  }),
  Object.freeze({
    id: "A07", name: "Wachsender fälliger Rückstand",
    beobachtung: "rueckstandWachstum", grenzeSchluessel: "maxRueckstandWachstum", grenzeFest: null,
    quelle: "Drain-Bilanz (Ankunft − Abfluss der gate-würdigen Vorgänge)",
    beschreibung: "Der fällige Rückstand wächst stärker als zugelassen — der Motor kommt nicht nach."
  }),
  Object.freeze({
    id: "A08", name: "Unvollständige Bilanz",
    beobachtung: "bilanzVollstaendig", grenzeSchluessel: null, grenzeFest: true,
    quelle: "lauf-bilanz.js (verarbeitet + vertagt + fehlgeschlagen = cluster)",
    beschreibung: "Die Identität der Laufbilanz geht nicht auf — gezählt wurde etwas anderes als gearbeitet."
  }),
  Object.freeze({
    id: "A09", name: "Veränderung eines realen Mandats",
    beobachtung: "realeMandateVeraendert", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "Grundlinienvergleich der Nicht-Kohortenzeilen (Zahl, aktiv, Löschmarken)",
    beschreibung: "Jede Abweichung an einem realen Mandat beendet den Test sofort."
  }),
  Object.freeze({
    id: "A10", name: "Erkannter externer Kommunikationsversuch",
    beobachtung: "kommunikationsversuche", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "Kommunikationsriegel (gesperrte Zustellversuche je Kanal)",
    beschreibung: "Ein gesperrter Versuch beweist, dass ein Kanal den Riegel erreicht hat — der Lauf stoppt zur Klärung."
  }),
  Object.freeze({
    id: "A11", name: "Unerwarteter Commit oder Deployment",
    beobachtung: "productionCommit", grenzeSchluessel: "erwarteterCommit", grenzeFest: null,
    quelle: "Vercel-Deployment (githubCommitSha) gegen den festgeschriebenen Kopf",
    beschreibung: "Der laufende Production-Code ist nicht der, gegen den der Test freigegeben wurde."
  }),
  Object.freeze({
    id: "A12", name: "Überschneidung nicht kompatibler Laufzeitfenster",
    beobachtung: "fensterKonflikte", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "pruefeStartfenster() gegen die 13 Bestandscrons und den Minimal-Cron",
    beschreibung: "Der Test würde in ein belegtes oder ungeklärtes Laufzeitfenster fallen."
  }),
  // ── Ergänzt im Vorbereitungssprint 02.09. ────────────────────────────────
  // Der Auftrag verlangt für JEDE Stufe (20/75/400) Abbruchkontrollen über
  // sieben Dimensionen: Fehler · Kosten · Laufzeit · Rückstand · hängende
  // Leases · DUBLETTEN · Auswirkung auf reale Mandate. Sechs davon trugen
  // A01–A12 bereits. Zwei fehlten — und zwar genau die beiden, die der
  // 500er-Lauf als Erstes brechen würde.
  Object.freeze({
    id: "A13", name: "Dublette (doppelt ausgeführte Arbeit oder doppeltes Profil)",
    beobachtung: "dubletten", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "helmut_jobs (Idempotenzschlüssel) · Kohortenbestand (distinct Kennungen) · Laufquittungen (runId, process)",
    beschreibung: "Ein Auftrag wurde zweimal ausgeführt oder eine Kennung existiert doppelt — "
      + "beides kostet doppelt und macht jede Bilanz unbrauchbar. Bei 500 Profilen ist das der "
      + "erste Effekt, den eine verlorene Lease erzeugt (A02 misst die Ursache, A13 die Wirkung)."
  }),
  Object.freeze({
    id: "A14", name: "Verdrängung eines realen Mandats aus der Tagesleistung",
    beobachtung: "realeMandateOhneZuteilung", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "llm-budget-fair.tagesplan().klassen · Zuteilung je Mandat",
    beschreibung: "Mindestens ein reales Mandat hat an diesem Tag KEINE notwendige Arbeit "
      + "zugeteilt bekommen. A09 prüft, ob ein reales Mandat VERÄNDERT wurde — diese Regel "
      + "prüft, ob es VERDRÄNGT wurde. Das ist der Schaden, den ein Testlauf mit 495 "
      + "synthetischen Profilen tatsächlich anrichten kann, und er ist an keiner Mandatszeile sichtbar."
  }),
  // A15 ist die einzige Regel, die bei UNTERSCHREITUNG auslöst.
  Object.freeze({
    id: "A15", name: "Zu wenig beobachtete Arbeit (eine leere Bilanz ist nicht grün)",
    beobachtung: "verarbeiteteVorgaenge", grenzeSchluessel: "mindestVerarbeiteteVorgaenge",
    grenzeFest: null, unterschreitung: true,
    quelle: "lauf-bilanz.js — verarbeitete Vorgänge seit Beginn der Stufe",
    beschreibung: "Keine der übrigen vierzehn Regeln verlangt, dass überhaupt gearbeitet wurde. "
      + "Eine LEERE Bilanz erfüllt die Identität von A08 (0 + 0 + 0 = 0), und jeder Nullzähler "
      + "steht brav auf null — die Sicherheitskontrolle wäre grün, bevor der erste Cron gelaufen "
      + "ist. Diese Regel verlangt einen Mindestumfang beobachteter Arbeit, bevor eine Stufe als "
      + "bestanden gilt."
  })
]);

const GRENZEN_PFLICHT = Object.freeze([
  "maxFehlerquote",
  "kostenbudgetUsd",
  "maxLaufzeitMinuten",
  "maxRueckstandWachstum",
  "erwarteterCommit",
  // Ergänzt 02.09. mit A15: ohne Mindestumfang wäre eine Stufe grün, bevor
  // irgendetwas gelaufen ist.
  "mindestVerarbeiteteVorgaenge"
]);

// Sind alle Grenzen VOR Testbeginn gesetzt? Fehlende Werte blockieren.
function pruefeGrenzen(grenzen = {}) {
  const g = grenzen && typeof grenzen === "object" ? grenzen : {};
  const fehlend = GRENZEN_PFLICHT.filter((name) => {
    const wert = g[name];
    if (name === "erwarteterCommit") return typeof wert !== "string" || !/^[0-9a-f]{40}$/.test(wert);
    if (name === "maxFehlerquote") return !(typeof wert === "number" && Number.isFinite(wert) && wert >= 0 && wert <= 1);
    return !(typeof wert === "number" && Number.isFinite(wert) && wert > 0);
  });
  return Object.freeze({
    vollstaendig: fehlend.length === 0,
    fehlend: Object.freeze(fehlend),
    meldung: fehlend.length === 0
      ? "Alle Abbruchgrenzen sind vor Testbeginn gesetzt."
      : `Testbeginn blockiert: ${fehlend.length} Abbruchgrenze(n) fehlen — ${fehlend.join(", ")}.`
  });
}

function bewerteRegel(regel, beobachtungen, grenzen) {
  const hatBeobachtung = Object.prototype.hasOwnProperty.call(beobachtungen, regel.beobachtung);
  const ist = beobachtungen[regel.beobachtung];
  if (!hatBeobachtung || ist === null || ist === undefined) {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist: null, grenze: null,
      meldung: `${regel.id} nicht bewertbar: Messwert ${regel.beobachtung} fehlt.` };
  }
  // Feste Grenze (0 bzw. true) — keine Konfiguration nötig.
  if (regel.grenzeFest !== null) {
    if (regel.grenzeFest === true) {
      const ausgeloest = ist !== true;
      return { id: regel.id, name: regel.name, bewertbar: typeof ist === "boolean", ausgeloest,
        ist, grenze: true,
        meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name}.` : `${regel.id} in Ordnung.` };
    }
    // KEINE KOERZIERUNG: Number(false), Number(""), Number([]) sind alle 0 und
    // haetten eine feste Nullgrenze faelschlich als eingehalten gemeldet
    // (adversarialer Review 01.09.). Nur eine echte, endliche Zahl zaehlt.
    if (typeof ist !== "number" || !Number.isFinite(ist)) {
      return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze: regel.grenzeFest,
        meldung: `${regel.id} nicht bewertbar: ${regel.beobachtung} ist keine echte Zahl.` };
    }
    const zahl = ist;
    const ausgeloest = zahl > regel.grenzeFest;
    return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: zahl, grenze: regel.grenzeFest,
      meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name} (${zahl} > ${regel.grenzeFest}).` : `${regel.id} in Ordnung.` };
  }
  // Konfigurierte Grenze — fehlt sie, ist die Regel nicht bewertbar.
  const grenze = grenzen[regel.grenzeSchluessel];
  if (grenze === null || grenze === undefined || grenze === "") {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze: null,
      meldung: `${regel.id} nicht bewertbar: Grenze ${regel.grenzeSchluessel} ist nicht gesetzt.` };
  }
  if (regel.grenzeSchluessel === "erwarteterCommit") {
    const ausgeloest = String(ist) !== String(grenze);
    return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: String(ist), grenze: String(grenze),
      meldung: ausgeloest ? `${regel.id} ausgelöst: Production läuft auf einem anderen Commit.` : `${regel.id} in Ordnung.` };
  }
  // Auch hier ohne Koerzierung (siehe oben).
  if (typeof ist !== "number" || !Number.isFinite(ist)
      || typeof grenze !== "number" || !Number.isFinite(grenze)) {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze,
      meldung: `${regel.id} nicht bewertbar: Messwert oder Grenze ist keine echte Zahl.` };
  }
  const zahl = ist;
  const grenzZahl = grenze;
  // A15 ist die einzige Regel, die bei UNTERSCHREITUNG auslöst: „zu wenig
  // beobachtete Arbeit" ist kein Überschreiten einer Obergrenze, sondern das
  // Verfehlen einer Untergrenze. Ohne diesen Zweig hätte sie nie ausgelöst.
  const ausgeloest = regel.unterschreitung === true ? zahl < grenzZahl : zahl > grenzZahl;
  const zeichen = regel.unterschreitung === true ? "<" : ">";
  return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: zahl, grenze: grenzZahl,
    meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name} (${zahl} ${zeichen} ${grenzZahl}).` : `${regel.id} in Ordnung.` };
}

// Die Gesamtentscheidung. FAIL CLOSED in beide Richtungen:
// eine ausgelöste Regel bricht ab — eine nicht bewertbare Regel ebenso.
function pruefeAbbruch({ beobachtungen = {}, grenzen = {} } = {}) {
  const b = beobachtungen && typeof beobachtungen === "object" ? beobachtungen : {};
  const g = grenzen && typeof grenzen === "object" ? grenzen : {};
  const befunde = ABBRUCHREGELN.map((regel) => Object.freeze(bewerteRegel(regel, b, g)));
  const ausgeloest = befunde.filter((f) => f.ausgeloest);
  const nichtBewertbar = befunde.filter((f) => !f.bewertbar);
  const abbrechen = ausgeloest.length > 0 || nichtBewertbar.length > 0;
  return Object.freeze({
    abbrechen,
    weiterlaufen: !abbrechen,
    befunde: Object.freeze(befunde),
    ausgeloest: Object.freeze(ausgeloest.map((f) => f.id)),
    nichtBewertbar: Object.freeze(nichtBewertbar.map((f) => f.id)),
    meldung: abbrechen
      ? `ABBRUCH: ${ausgeloest.length} ausgelöste Regel(n), ${nichtBewertbar.length} nicht bewertbare Regel(n).`
      : `Alle ${befunde.length} Abbruchregeln bewertet und eingehalten.`
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// C · STARTFENSTER
// ═════════════════════════════════════════════════════════════════════════════
//
// Der 500er-Funktionstest darf NICHT starten, solange sein Fenster mit einem
// Bestandscron oder einem Minimal-Cron-Slot kollidiert. Der belegte offene Fall
// ist das Paar 05:45-Lage-Briefing (bis zu 300 s Laufzeit) → 05:48-Slot: die
// beiden teilen kein Schloss, ihre Verträglichkeit ist NICHT nachgewiesen
// (minimal-cron.js, Befund 6). Solange dieser Nachweis fehlt, ist jedes Fenster,
// das beide berührt, gesperrt.

const LAGE_BRIEFING_MINUTE_UTC = 5 * 60 + 45;   // 05:45 UTC
const LAGE_BRIEFING_MAX_LAUFZEIT_MS = 300000;   // vercel.json maxDuration
const MINIMAL_CRON_SLOT_MINUTEN = Object.freeze([18, 48]);

function minuteAusUtc(zeitpunkt) {
  const text = String(zeitpunkt || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(text)) return null;
  const stunde = Number(text.slice(11, 13));
  const minute = Number(text.slice(14, 16));
  if (!Number.isInteger(stunde) || !Number.isInteger(minute)) return null;
  return stunde * 60 + minute;
}

// Prüft ein geplantes Startfenster gegen die Bestandscrons und — falls der
// Minimal-Cron aktiviert wäre — gegen dessen 48 Slots.
//
// ECHTE INTERVALLÜBERLAPPUNG, nicht Startzeit-Enthaltensein (adversarialer
// Review 01.09., zwei bestätigte Befunde): Ein Cron belegt nicht nur seine
// Startminute, sondern seine gesamte mögliche Laufzeit. Und ein stündlicher
// Eintrag feuert in JEDER Stunde, nicht nur in der ersten des Tages.
// Positive ganze Zahl aus der Umgebung, sonst NaN. Bewusst keine Koerzierung:
// "0", "", "abc" und ein fehlender Schlüssel sind alle „nicht gesetzt".
function ganzzahlAusEnv(env, name) {
  const roh = String((env && env[name]) || "").trim();
  if (!/^[0-9]+$/.test(roh)) return NaN;
  const zahl = Number(roh);
  return Number.isInteger(zahl) && zahl > 0 ? zahl : NaN;
}

function pruefeStartfenster({
  startUtc,
  dauerMinuten,
  crons = [],
  minimalCronAktiv = false,
  ueberschneidung0545Belegt = false,
  maxLaufzeitMs = LAGE_BRIEFING_MAX_LAUFZEIT_MS,
  // ERGÄNZT 02.09. (adversarialer Review): der GitHub-Actions-Watchdog startet
  // 05:30 UTC und ist belegt „oft 2–3 h verzögert" — eine Startzeit sagt dort
  // nichts über die Laufzeit. Default `false`, damit die dokumentierte Bedeutung
  // dieser Funktion (Bestandscrons + Minimal-Cron) unverändert bleibt; die
  // VERBINDLICHEN Tore (`startbereitschaft`, `sichereStartfenster`) schalten ihn
  // ausdrücklich ein — dort darf die Prüfung nie schwächer sein als die
  // Empfehlung.
  watchdogBeruecksichtigen = false
} = {}) {
  const start = minuteAusUtc(startUtc);
  const dauer = Number(dauerMinuten);
  if (start === null || !Number.isFinite(dauer) || dauer <= 0) {
    return Object.freeze({
      startErlaubt: false,
      grund: "startfenster-unvollstaendig",
      konflikte: Object.freeze([]),
      gepruefteCrons: 0,
      meldung: "Startfenster nicht bewertbar: startUtc oder dauerMinuten fehlt — fail closed."
    });
  }
  const ende = start + dauer;
  const laufzeitMin = Math.max(1, Math.ceil(Number(maxLaufzeitMs) / 60000));

  // Alle Auftritte eines Eintrags über zwei Tage (das Fenster darf über
  // Mitternacht reichen). `stunde === null` heißt: jede Stunde.
  // KORREKTUR 02.09.: die Schleife beginnt beim VORTAG. Ein Cron, dessen
  // Laufzeit über Mitternacht in ein frühes Fenster hineinreicht ("58 23 * * *"
  // läuft bis 00:03), erzeugte sonst nur Minuten ≥ 0 und blieb unsichtbar.
  function auftritte(minute, stunde) {
    const liste = [];
    for (let tag = -1; tag < 2; tag += 1) {
      if (stunde === null) {
        for (let h = 0; h < 24; h += 1) liste.push(tag * 1440 + h * 60 + minute);
      } else {
        liste.push(tag * 1440 + stunde * 60 + minute);
      }
    }
    return liste;
  }

  // Überlappt [t, t+laufzeit) das Fenster [start, ende)?
  const ueberlappt = (t) => t < ende && t + laufzeitMin > start;
  const belegt = (minute, stunde) => auftritte(minute, stunde).some(ueberlappt);

  const konflikte = [];

  // FAIL CLOSED (ergänzt 02.09.): eine fehlende oder leere Cronliste ist kein
  // freier Tag. Abbruchregel A12 sagt ausdrücklich „gegen die 13 Bestandscrons";
  // ohne Liste wäre das eine Behauptung. `crons = []` war damit der einzige
  // fail-OPEN Default dieses Moduls.
  const cronListe = Array.isArray(crons) ? crons : [];
  if (!cronListe.length) {
    konflikte.push({
      art: "cronliste-fehlt",
      path: "(keine Cronliste übergeben)",
      schedule: "",
      hinweis: "Ohne die Bestandscrons ist kein Fenster als frei bewertbar — die Liste kommt aus vercel.json."
    });
  }

  for (const cron of cronListe) {
    const teile = String((cron && cron.schedule) || "").trim().split(/\s+/);
    const pfad = String((cron && cron.path) || "(unbekannt)");
    const schedule = String((cron && cron.schedule) || "");
    if (teile.length !== 5) {
      konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule });
      continue;
    }
    // Mehrfachminuten wie "18,48" werden unterstützt; alles Weitere gilt
    // konservativ als nicht parsebar.
    const minuten = teile[0].split(",").map((m) => Number(m));
    const stundeRoh = teile[1];
    if (!minuten.length || !minuten.every((m) => Number.isInteger(m) && m >= 0 && m < 60)) {
      konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule });
      continue;
    }
    let stunde = null;
    if (stundeRoh !== "*") {
      stunde = Number(stundeRoh);
      if (!Number.isInteger(stunde) || stunde < 0 || stunde > 23) {
        konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule });
        continue;
      }
    }
    if (minuten.some((m) => belegt(m, stunde))) {
      konflikte.push({ art: "bestandscron-im-fenster", path: pfad, schedule });
    }
  }

  // Der belegte offene Fall: das 05:45-Lage-Briefing darf bis zu 300 s laufen,
  // der 05:48-Slot startet dann während seiner Laufzeit. Beide teilen kein
  // Schloss; die Verträglichkeit ist NICHT belegt (minimal-cron.js, Befund 6).
  // Es genügt, dass das Fenster diese LAUFZEIT berührt — der Fensterstart muss
  // nicht vor 05:45 liegen.
  const briefingStart = LAGE_BRIEFING_MINUTE_UTC;
  const beruehrtBriefinglaufzeit = [briefingStart - 1440, briefingStart, briefingStart + 1440].some(ueberlappt);
  // STRIKT `=== true` (ergänzt 02.09.): jeder truthy Wert — der String "offen",
  // ein leeres Objekt, die Zahl 1 — hätte die einzige unbedingte Sperre dieses
  // Moduls aufgehoben. Der Rest des Moduls lehnt Koerzierung seit dem Review vom
  // 01.09. konsequent ab; hier stand sie noch.
  if (beruehrtBriefinglaufzeit && ueberschneidung0545Belegt !== true) {
    konflikte.push({
      art: "offene-laufzeitueberschneidung-0545-0548",
      path: "/api/cron/lage-briefing + /api/cron/understanding-rueckstand",
      schedule: "45 5 * * * / 18,48 * * * *",
      hinweis: `Das 05:45-Lage-Briefing darf bis zu ${LAGE_BRIEFING_MAX_LAUFZEIT_MS / 1000} s laufen; `
        + "der 05:48-Slot startet dann während seiner Laufzeit. Die beiden teilen kein Schloss — "
        + "die Verträglichkeit ist NICHT belegt (minimal-cron.js, Befund 6)."
    });
  }

  if (watchdogBeruecksichtigen === true) {
    const wdStart = WATCHDOG_START_MINUTE_UTC;
    const wdDauer = WATCHDOG_VORSICHTSSPANNE_MINUTEN;
    const wdUeberlappt = [wdStart - 1440, wdStart, wdStart + 1440]
      .some((t) => t < ende && t + wdDauer > start);
    if (wdUeberlappt) {
      konflikte.push({
        art: "actions-watchdog-vorsichtsspanne",
        path: ".github/workflows/briefing-watchdog.yml",
        schedule: "30 5 * * *",
        hinweis: `Der Watchdog startet 05:30 UTC und ist belegt oft 2–3 h verzögert; `
          + `die Spanne 05:30–${alsUhrzeit(wdStart + wdDauer)} UTC gilt deshalb konservativ als belegt.`
      });
    }
  }

  if (minimalCronAktiv) {
    for (const slotMinute of MINIMAL_CRON_SLOT_MINUTEN) {
      if (belegt(slotMinute, null)) {
        konflikte.push({
          art: "minimal-cron-slot-im-fenster",
          path: minimalCron.MINIMAL_CRON_ROUTE,
          schedule: minimalCron.MINIMAL_CRON_RHYTHMUS,
          slotMinute
        });
      }
    }
  }

  const eindeutig = [];
  const gesehen = new Set();
  for (const k of konflikte) {
    const schluessel = `${k.art}|${k.path}|${k.schedule || ""}|${k.slotMinute ?? ""}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    eindeutig.push(Object.freeze(k));
  }

  return Object.freeze({
    startErlaubt: eindeutig.length === 0,
    grund: eindeutig.length === 0 ? "fenster-frei" : "fensterkonflikt",
    startMinuteUtc: start,
    endeMinuteUtc: ende,
    // ERGÄNZT 02.09. (adversariale Analyse, bestätigt): Ein Fensterbefund muss
    // mitteilen, GEGEN WIE VIELE Croneinträge er gerechnet wurde. Ohne dieses
    // Feld lässt sich ein Befund, der versehentlich gegen eine leere Cronliste
    // entstand, nicht von einem echten unterscheiden — beide melden
    // `startErlaubt: true`. Nachgelagerte Tore behandeln einen Befund ohne
    // `gepruefteCrons` als NICHT GEPRÜFT.
    gepruefteCrons: Array.isArray(crons) ? crons.length : 0,
    konflikte: Object.freeze(eindeutig),
    meldung: eindeutig.length === 0
      ? "Startfenster ist frei von Bestandscrons und Minimal-Cron-Slots."
      : `Start gesperrt: ${eindeutig.length} Fensterkonflikt(e) — ${eindeutig.map((k) => k.art).join(", ")}.`
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// C2 · DAS SICHERE MANUELLE TESTFENSTER (ergänzt 02.09.)
// ═════════════════════════════════════════════════════════════════════════════
//
// `pruefeStartfenster()` beantwortet „darf ICH in DIESEM Fenster starten?".
// Offen blieb die andere Hälfte des Auftrags: „welches Fenster ist überhaupt
// sicher?". Ohne diese Antwort bleibt die Lösung der 05:45/05:48-Frage eine
// Suche von Hand — und ein Testtag, der sie falsch beantwortet, kollidiert mit
// einem Bestandslauf, den niemand verschieben darf (kein Cron wird verändert).
//
// DIE RECHNUNG. Jeder Cron belegt [Startminute, Startminute + maxDuration).
// `vercel.json` konfiguriert GENAU EINE Funktion (`api/index.js`) mit
// `maxDuration: 300` — alle dreizehn Cronrouten laufen also über dieselbe
// Obergrenze von fünf Minuten. Ein stündlicher Eintrag belegt seine Minute in
// JEDER Stunde. Was übrig bleibt, sind die freien Blöcke des Tages.
//
// ZWEI ZUSÄTZLICHE, BEWUSST KONSERVATIVE SPERREN:
//   1. Das 05:45-Lage-Briefing bleibt gesperrt, solange der
//      05:45/05:48-Nachweis fehlt (identisch zu `pruefeStartfenster`).
//   2. Der GitHub-Actions-Watchdog startet um 05:30 UTC und ist belegt
//      „oft 2–3 h verzögert" (CURRENT_STATE §3). Eine Startzeit sagt hier also
//      nichts über die Laufzeit. Der gesamte Bereich 05:30–08:30 UTC gilt
//      deshalb als belegt — nicht weil dort sicher etwas läuft, sondern weil
//      man es nicht ausschließen kann (CLAUDE.md §4.4: kein falsches Grün).
const WATCHDOG_START_MINUTE_UTC = 5 * 60 + 30;      // 05:30 UTC
const WATCHDOG_VORSICHTSSPANNE_MINUTEN = 180;       // belegte Verzögerung 2–3 h

// Alle belegten Intervalle eines Tages [von, bis) in Minuten seit 00:00 UTC.
// Über Mitternacht laufende Intervalle werden am Tagesrand abgeschnitten und am
// Tagesanfang fortgesetzt — sonst entstünde dort ein scheinbar freier Block.
function belegteIntervalle({
  crons = [],
  minimalCronAktiv = false,
  ueberschneidung0545Belegt = false,
  maxLaufzeitMs = LAGE_BRIEFING_MAX_LAUFZEIT_MS,
  watchdogBeruecksichtigen = true
} = {}) {
  const laufzeit = Math.max(1, Math.ceil(Number(maxLaufzeitMs) / 60000));
  const roh = [];
  const merke = (start, dauer, grund) => {
    let von = ((Math.floor(start) % 1440) + 1440) % 1440;
    let bis = von + Math.max(1, Math.floor(dauer));
    if (bis <= 1440) { roh.push({ von, bis, grund }); return; }
    roh.push({ von, bis: 1440, grund });
    roh.push({ von: 0, bis: bis - 1440, grund });
  };

  for (const cron of Array.isArray(crons) ? crons : []) {
    const teile = String((cron && cron.schedule) || "").trim().split(/\s+/);
    const pfad = String((cron && cron.path) || "(unbekannt)");
    if (teile.length !== 5) {
      // Nicht parsebar => konservativ der GANZE Tag (fail closed): so entsteht
      // niemals ein „freies" Fenster aus einem Eintrag, den wir nicht verstehen.
      merke(0, 1440, `cron-nicht-parsebar:${pfad}`);
      continue;
    }
    const minuten = teile[0].split(",").map((m) => Number(m));
    const stundeRoh = teile[1];
    if (!minuten.length || !minuten.every((m) => Number.isInteger(m) && m >= 0 && m < 60)) {
      merke(0, 1440, `cron-nicht-parsebar:${pfad}`);
      continue;
    }
    let stunden = null;
    if (stundeRoh !== "*") {
      const h = Number(stundeRoh);
      if (!Number.isInteger(h) || h < 0 || h > 23) { merke(0, 1440, `cron-nicht-parsebar:${pfad}`); continue; }
      stunden = [h];
    } else {
      stunden = Array.from({ length: 24 }, (_, i) => i);
    }
    for (const h of stunden) for (const m of minuten) merke(h * 60 + m, laufzeit, `cron:${pfad}`);
  }

  if (!ueberschneidung0545Belegt) {
    merke(LAGE_BRIEFING_MINUTE_UTC, laufzeit, "offene-laufzeitueberschneidung-0545-0548");
  }
  if (minimalCronAktiv) {
    for (const slot of MINIMAL_CRON_SLOT_MINUTEN) {
      for (let h = 0; h < 24; h += 1) merke(h * 60 + slot, laufzeit, "minimal-cron-slot");
    }
  }
  if (watchdogBeruecksichtigen) {
    merke(WATCHDOG_START_MINUTE_UTC, WATCHDOG_VORSICHTSSPANNE_MINUTEN, "actions-watchdog-vorsichtsspanne");
  }

  roh.sort((a, b) => a.von - b.von || a.bis - b.bis);
  const zusammen = [];
  for (const i of roh) {
    const letzte = zusammen[zusammen.length - 1];
    if (letzte && i.von <= letzte.bis) {
      letzte.bis = Math.max(letzte.bis, i.bis);
      if (!letzte.gruende.includes(i.grund)) letzte.gruende.push(i.grund);
    } else {
      zusammen.push({ von: i.von, bis: i.bis, gruende: [i.grund] });
    }
  }
  return zusammen;
}

function alsUhrzeit(minute) {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Die freien Blöcke des Tages, absteigend nach Länge. Wer `mindestDauerMinuten`
// übergibt, bekommt nur Blöcke, die eine vollständige Testdauer tragen.
//
// WICHTIG: Das Ergebnis ist eine EMPFEHLUNG. Verbindlich bleibt allein
// `pruefeStartfenster()` — jeder empfohlene Block wird deshalb hier selbst noch
// einmal gegen diese Funktion geprüft (`bestaetigt`). Eine Empfehlung, die die
// verbindliche Prüfung nicht besteht, wird nicht ausgegeben.
function sichereStartfenster({
  crons = [],
  mindestDauerMinuten = 60,
  minimalCronAktiv = false,
  ueberschneidung0545Belegt = false,
  maxLaufzeitMs = LAGE_BRIEFING_MAX_LAUFZEIT_MS,
  watchdogBeruecksichtigen = true
} = {}) {
  const belegt = belegteIntervalle({
    crons, minimalCronAktiv, ueberschneidung0545Belegt, maxLaufzeitMs, watchdogBeruecksichtigen
  });
  const frei = [];
  let zeiger = 0;
  for (const i of belegt) {
    if (i.von > zeiger) frei.push({ von: zeiger, bis: i.von });
    zeiger = Math.max(zeiger, i.bis);
  }
  if (zeiger < 1440) frei.push({ von: zeiger, bis: 1440 });

  // MITTERNACHTSBLOCK (ergänzt 02.09., adversarialer Review): reicht der letzte
  // freie Block bis 24:00 und beginnt der erste bei 00:00, sind das in Wahrheit
  // EIN Block über den Tageswechsel. Ohne diese Verschmelzung wird der längste
  // wirklich freie Zeitraum des Tages nie als solcher ausgewiesen — die Ausgabe
  // meldete zwei kürzere Blöcke und war damit schlicht falsch.
  if (frei.length > 1 && frei[0].von === 0 && frei[frei.length - 1].bis === 1440) {
    const ersterBlock = frei.shift();
    const letzterBlock = frei.pop();
    frei.push({ von: letzterBlock.von, bis: 1440 + ersterBlock.bis, ueberMitternacht: true });
  }

  const mindest = Math.max(1, Math.floor(Number(mindestDauerMinuten) || 1));
  const kandidaten = frei
    .map((b) => ({ ...b, dauerMinuten: b.bis - b.von }))
    .filter((b) => b.dauerMinuten >= mindest)
    .map((b) => {
      // Ein Sicherheitsabstand von einer Minute an beiden Rändern: die
      // Minutengenauigkeit von Cron und Uhr soll nicht der einzige Puffer sein.
      const start = b.von + 1;
      const dauer = b.dauerMinuten - 2;
      const startUtc = `2026-01-01T${alsUhrzeit(start)}:00Z`;
      // Die Empfehlung wird mit EXAKT denselben Annahmen gegengeprüft, unter
      // denen sie entstanden ist — insbesondere mit der Watchdogspanne. Eine
      // Empfehlung, die die verbindliche Prüfung nicht besteht, wird nicht
      // ausgegeben.
      const bestaetigung = dauer >= mindest
        ? pruefeStartfenster({
          startUtc, dauerMinuten: dauer, crons, minimalCronAktiv,
          ueberschneidung0545Belegt, maxLaufzeitMs, watchdogBeruecksichtigen
        })
        : null;
      // Tagsüber = das Fenster liegt vollständig zwischen 06:00 und 20:00 UTC
      // (08:00–22:00 Berliner Zeit). Ein kontrollierter Production-Funktionstest
      // braucht einen Menschen, der zusieht; das längste Fenster des Tages liegt
      // nachts und ist deshalb NICHT automatisch die bessere Wahl.
      const tagsueber = start >= 6 * 60 && (start + dauer) <= 20 * 60;
      return Object.freeze({
        startUtc: alsUhrzeit(start),
        endeUtc: alsUhrzeit(start + dauer),
        dauerMinuten: dauer,
        ueberMitternacht: Boolean(b.ueberMitternacht),
        tagsueber,
        blockVonUtc: alsUhrzeit(b.von),
        blockBisUtc: alsUhrzeit(b.bis),
        bestaetigt: Boolean(bestaetigung && bestaetigung.startErlaubt),
        konflikte: bestaetigung ? bestaetigung.konflikte : Object.freeze([])
      });
    })
    .filter((b) => b.dauerMinuten >= mindest && b.bestaetigt)
    .sort((a, b) => b.dauerMinuten - a.dauerMinuten || (a.startUtc < b.startUtc ? -1 : 1));

  return Object.freeze({
    mindestDauerMinuten: mindest,
    belegteBloecke: Object.freeze(belegt.map((b) => Object.freeze({
      vonUtc: alsUhrzeit(b.von), bisUtc: alsUhrzeit(b.bis), gruende: Object.freeze(b.gruende)
    }))),
    fenster: Object.freeze(kandidaten),
    empfehlung: kandidaten.length ? kandidaten[0] : null,
    // Die BETRIEBLICHE Empfehlung: das längste Fenster, das vollständig in der
    // Arbeitszeit liegt. Ein Testlauf mit 500 Profilen braucht Aufsicht.
    empfehlungTagsueber: kandidaten.find((k) => k.tagsueber) || null,
    meldung: kandidaten.length
      ? `${kandidaten.length} sichere(s) Startfenster; längstes ${kandidaten[0].startUtc}–${kandidaten[0].endeUtc} UTC `
        + `(${kandidaten[0].dauerMinuten} min)${kandidaten[0].tagsueber ? "" : ", liegt aber nicht in der Arbeitszeit"}.`
      : `Kein Startfenster von mindestens ${mindest} Minuten ist frei — der Test darf an diesem Tag nicht beginnen.`
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// GESAMTBEREITSCHAFT
// ═════════════════════════════════════════════════════════════════════════════
// Die eine Frage: darf der Test überhaupt beginnen? Nur wenn ALLES stimmt.
function startbereitschaft({
  konfiguration = {},
  grenzen = {},
  messungen = {},
  startfenster = {},
  isolation = null,
  // ERGÄNZT 02.09. (Nachprüfung nach dem Merge von #295): Der Test läuft in drei
  // Stufen (20/75/400), und JEDE Stufe braucht eigene Freigaben. Ohne die Angabe,
  // WELCHE Stufe gestartet werden soll, ist die Startbereitschaft nicht
  // bewertbar — und „nicht bewertbar" heißt hier wie überall NICHT startbereit.
  // `bestandeneStufen` kommt aus einer MESSUNG (`funktionstest-kontrolle`), nicht
  // aus einer Zusage; ohne sie ist nur Stufe A zulässig.
  stufe = null,
  bestandeneStufen = [],
  env = process.env
} = {}) {
  const konfig = pruefeKonfiguration(konfiguration, { messungen });
  const grenzBefund = pruefeGrenzen(grenzen);
  // DAS VERBINDLICHE TOR PRÜFT STRENGER ALS DIE EMPFEHLUNG, NIE SCHWÄCHER
  // (ergänzt 02.09.): hier ist die Watchdogspanne standardmäßig eingeschaltet.
  // Der Aufrufer kann sie ausdrücklich abwählen — dann steht die Entscheidung
  // im übergebenen Startfenster und nicht in einem stillen Default.
  const fensterEingabe = startfenster && typeof startfenster === "object" ? startfenster : {};
  const fenster = pruefeStartfenster({
    ...fensterEingabe,
    watchdogBeruecksichtigen: fensterEingabe.watchdogBeruecksichtigen !== undefined
      ? fensterEingabe.watchdogBeruecksichtigen
      : true
  });
  const riegel = kommunikationsriegel.modus(env);
  const riegelScharf = riegel === kommunikationsriegel.MODUS_TESTFENSTER;
  const isoliert = isolation === null ? null : isolation === true;

  // ERGÄNZT 02.09. — DIE LÜCKE, DIE §16.6 BENANNT HAT: `vorrangreserveReal` war
  // bis hier ein reiner KONFIGURATIONSWERT. Er konnte in der übergebenen
  // Konfiguration stimmen, während in der LAUFENDEN Umgebung nichts gesetzt war —
  // „der Vorrangwert im Rahmen schützt den Testlauf, nicht den Production-Betrieb".
  // Jetzt wird die tatsächlich wirksame Reserve aus der Umgebung gelesen und
  // gegen den gemessenen Tagesbedarf geprüft. Ohne wirksame Reserve ist der Test
  // NICHT startbereit — unabhängig davon, was in der Konfiguration steht.
  const vorrang = mandatsklasse.vorrangreserveReal(env);
  const vorrangWirksam = vorrang.wert >= mandatsklasse.VORRANG_REAL_MESSBEDARF_P95;

  // ERGÄNZT 02.09. (adversariales Diff-Review, bestätigter Befund): Die Prüfung
  // war ASYMMETRISCH. Die Vorrangreserve wurde zur LAUFZEIT aus der Umgebung
  // gelesen, Tagesdeckel und Verstehens-Reserve blieben reines Papier aus der
  // übergebenen Konfiguration. Ein Lauf konnte damit „startbereit" melden,
  // während live `HELMUT_MAX_LLM_CALLS_PER_DAY=100` gegen einen Vorrangwert von
  // 200 stand — der geteilte Verstehenspfad wäre bis auf die Verstehens-Reserve
  // heruntergebremst worden, ohne dass irgendeine Hürde es bemerkt hätte.
  // Beide Werte werden jetzt AUS DERSELBEN Umgebung gelesen und gegeneinander
  // geprüft. Fehlt einer, ist die Hürde nicht erfüllt (fail closed).
  // Die Zyklusrechnung braucht die Fensterdauer und die Parallelität. Beide
  // kommen aus dem GEPRÜFTEN Befund bzw. der gelesenen Konfiguration — nicht aus
  // einem Default, denn ein stiller Default würde die Hürde entwerten.
  const fensterMinuten = Number.isFinite(fenster.startMinuteUtc) && Number.isFinite(fenster.endeMinuteUtc)
    ? fenster.endeMinuteUtc - fenster.startMinuteUtc
    : null;
  // Welche Arbeitsklassen sind im gewählten Fenster überhaupt FÄLLIG? Gerechnet
  // gegen die Phasenfenster des MOTORS (`source-demand.MANDATSPHASEN`), damit Tor
  // und Motor nicht auseinanderlaufen können. Lazy geladen, damit der Rahmen
  // nicht am Ausführer hängt.
  const arbeitsklassen = Number.isFinite(fenster.startMinuteUtc) && Number.isFinite(fenster.endeMinuteUtc)
    ? require("./funktionstest-zyklus").arbeitsklassenImFenster({
      fensterStartMinuteUtc: fenster.startMinuteUtc,
      fensterEndeMinuteUtc: fenster.endeMinuteUtc
    })
    : { bewertbar: false, grund: "Fenstergrenzen fehlen" };

  const zyklus = kapazitaet.zyklusPasstInsFenster({
    fensterMinuten,
    parallel: konfig.gelesen && typeof konfig.gelesen.maxParallel === "number" ? konfig.gelesen.maxParallel : 1,
    szenario: "konservativ",
    maxAnfragenJeMinute: konfig.gelesen && typeof konfig.gelesen.maxAnfragenJeMinute === "number"
      ? konfig.gelesen.maxAnfragenJeMinute
      : null
  });

  const deckelLaufzeit = ganzzahlAusEnv(env, "HELMUT_MAX_LLM_CALLS_PER_DAY");
  const reserveLaufzeit = ganzzahlAusEnv(env, "HELMUT_LLM_RESERVE_UNDERSTANDING");
  const budgetLaufzeitPasst = Number.isFinite(deckelLaufzeit)
    && Number.isFinite(reserveLaufzeit)
    && reserveLaufzeit + vorrang.wert < deckelLaufzeit;

  // Der stufengenaue Freigabebefund. Lazy geladen, damit der Rahmen nicht am
  // Stufenvertrag hängt. Zwei Bedingungen, beide fail closed:
  //   (1) die Stufe ist benannt und alle SCHREIBENDEN Vorgänge dieser Stufe sind
  //       freigegeben (die Auswertung ist rein lesend und braucht keine Freigabe);
  //   (2) die Reihenfolge stimmt — C nicht vor B, B nicht vor A.
  const stufenBefund = (() => {
    const stufen = require("./testkohorte-stufen");
    const s = stufe === null || stufe === undefined ? "" : String(stufe).trim().toLowerCase();
    if (!stufen.STUFEN.includes(s)) {
      return {
        ok: false,
        detail: "Keine zu startende Stufe angegeben (erwartet a, b oder c) — nicht bewertbar, "
          + `fail closed. Insgesamt offen: ${stufen.alleStufenvertraege(env).offeneFreigabenGesamt} `
          + `von ${stufen.alleStufenvertraege(env).schreibendeVorgaengeGesamt} stufengenauen Freigaben.`
      };
    }
    const vertrag = stufen.stufenvertrag(s, env);
    const reihenfolge = stufen.pruefeStufenReihenfolge(s, bestandeneStufen);
    const ok = vertrag.offeneFreigaben.length === 0 && reihenfolge.zulaessig;
    return {
      ok,
      detail: ok
        ? `Stufe ${s.toUpperCase()} (${vertrag.umfang} Profile): alle schreibenden Freigaben liegen `
          + `vor, Reihenfolge zulässig.`
        : `Stufe ${s.toUpperCase()} (${vertrag.umfang} Profile): `
          + (vertrag.offeneFreigaben.length
            ? `${vertrag.offeneFreigaben.length} Freigabe(n) fehlen (${vertrag.offeneFreigaben.join(", ")}). `
            : "alle Freigaben liegen vor, aber ")
          + reihenfolge.meldung
    };
  })();

  const huerden = [
    { name: "Kapazitäts- und Kostenkonfiguration vollständig", ok: konfig.bereit, detail: konfig.meldung },
    { name: "Alle Abbruchgrenzen gesetzt", ok: grenzBefund.vollstaendig, detail: grenzBefund.meldung },
    { name: "Startfenster frei", ok: fenster.startErlaubt, detail: fenster.meldung },
    { name: "Kommunikationsriegel scharf geschaltet", ok: riegelScharf,
      detail: riegelScharf
        ? `${kommunikationsriegel.SCHALTER}=${kommunikationsriegel.SCHALTER_WERT_GESPERRT} ist gesetzt.`
        : `${kommunikationsriegel.SCHALTER} steht nicht auf ${kommunikationsriegel.SCHALTER_WERT_GESPERRT}.` },
    { name: "Tagesdeckel und beide Reserven passen in der LAUFENDEN Umgebung zusammen",
      ok: budgetLaufzeitPasst,
      detail: Number.isFinite(deckelLaufzeit) && Number.isFinite(reserveLaufzeit)
        ? `Verstehen ${reserveLaufzeit} + Vorrang real ${vorrang.wert} `
          + `${budgetLaufzeitPasst ? "<" : "≥"} Deckel ${deckelLaufzeit} (aus der Umgebung gelesen)`
        : "HELMUT_MAX_LLM_CALLS_PER_DAY und/oder HELMUT_LLM_RESERVE_UNDERSTANDING sind in "
          + "der laufenden Umgebung nicht als positive ganze Zahl gesetzt — nicht bewertbar, "
          + "fail closed." },
    // ERGÄNZT 02.09. (zweiter Reviewbefund, Anforderung 9): Deckel und Fenster
    // standen bisher NEBENEINANDER, aber nie GEGENEINANDER. Nachgerechnet passt
    // ein vollständiger Zyklus im konservativen Szenario bei Parallelität 1
    // NICHT in 263 Minuten (1.812 benötigte Aufrufe gegen 1.732 mögliche; nötig
    // wären 276 Minuten). Solange das gilt, darf keine technische
    // Startbereitschaft behauptet werden — die Hürde erzwingt das.
    // ERGÄNZT 02.09.: Die sichtbare Produktstufe je Mandat
    // (`briefing_materialization`) ist erst ab 75 % des 24-Stunden-Frischefensters
    // fällig, also ab 18:00 UTC. Das empfohlene sichere Fenster endet 15:59 — über
    // die WARTESCHLANGE entsteht darin kein einziges Briefing, unabhängig von
    // Budget, Parallelität und Aufrufzahl.
    //
    // PRÄZISIERT (vierter Reviewbefund): Der Hürdenname sagte zuerst nur „die
    // sichtbare Produktstufe". Das war zu absolut — der Direktpfad
    // `/api/cron/lage-briefing` erzeugt Briefings unmittelbar und kennt diese
    // Phasenfenster nicht. Er ist aber je Aufruf auf 240 s begrenzt und wirkt auf
    // die fünf REALEN Mandate mit; er ist deshalb eine eigene
    // Betreiberentscheidung und kein stiller Ersatz.
    { name: "Die sichtbare Produktstufe ist im Startfenster über die Warteschlange fällig",
      ok: arbeitsklassen.bewertbar === true && arbeitsklassen.sichtbareProduktstufeErreichbar === true,
      detail: arbeitsklassen.bewertbar === true
        ? arbeitsklassen.meldung
        : `Nicht bewertbar: ${arbeitsklassen.grund} — fail closed.` },
    { name: "Ein vollständiger Zyklus passt in das geprüfte Startfenster",
      ok: zyklus.bewertbar === true && zyklus.passt === true,
      detail: zyklus.bewertbar === true
        ? zyklus.meldung
        : `Nicht bewertbar: ${zyklus.grund} — fail closed.` },
    { name: "Isolation der Kohorte belegt", ok: isoliert === true,
      detail: isoliert === null ? "Kein Isolationsbefund übergeben — nicht bewertbar." : "Isolationsbefund übergeben." },
    // ERGÄNZT 02.09. (adversarialer Review): Fenster und Laufzeitgrenze wurden
    // vollständig unabhängig voneinander geprüft. Ein 30-Minuten-Fenster mit
    // einer Laufzeitgrenze von 240 Minuten war „startbereit" — der Lauf hätte
    // planmäßig in den nächsten Bestandscron hineingelaufen und wäre erst von
    // A05 gestoppt worden, nachdem die Kollision bereits stattgefunden hat.
    { name: "Laufzeitgrenze passt in das geprüfte Startfenster",
      ok: typeof grenzen.maxLaufzeitMinuten === "number" && Number.isFinite(grenzen.maxLaufzeitMinuten)
        && Number.isFinite(fenster.startMinuteUtc) && Number.isFinite(fenster.endeMinuteUtc)
        && grenzen.maxLaufzeitMinuten <= (fenster.endeMinuteUtc - fenster.startMinuteUtc),
      detail: Number.isFinite(fenster.startMinuteUtc) && Number.isFinite(fenster.endeMinuteUtc)
        ? `Laufzeitgrenze ${grenzen.maxLaufzeitMinuten} gegen Fensterdauer ${fenster.endeMinuteUtc - fenster.startMinuteUtc} Minuten`
        : "Kein bewertbares Startfenster — die Laufzeitgrenze ist damit nicht prüfbar." },
    // ERGÄNZT 02.09.: `kostenbudgetUsd` steht in ZWEI Pflichtlisten — als
    // Konfigurationswert (pruefeKonfiguration) und als Abbruchgrenze
    // (pruefeGrenzen, Regel A04). Niemand verglich sie. Wirksam ist allein die
    // Grenze; ein abweichender Konfigurationswert wäre eine zweite, stillere
    // Wahrheit über dasselbe Budget.
    { name: "Kostenbudget in Konfiguration und Abbruchgrenze stimmen überein",
      ok: typeof konfiguration.kostenbudgetUsd === "number"
        && typeof grenzen.kostenbudgetUsd === "number"
        && konfiguration.kostenbudgetUsd === grenzen.kostenbudgetUsd,
      detail: `Konfiguration ${konfiguration.kostenbudgetUsd} gegen Abbruchgrenze `
        + `${grenzen.kostenbudgetUsd} — wirksam ist die Abbruchgrenze` },
    { name: "Vorrangreserve der realen Mandate ist LAUFZEITWIRKSAM gesetzt", ok: vorrangWirksam,
      detail: vorrangWirksam
        ? `${vorrang.env}=${vorrang.wert} ≥ gemessener p95-Tagesbedarf ${mandatsklasse.VORRANG_REAL_MESSBEDARF_P95}.`
        : `${vorrang.meldung} Erforderlich sind mindestens `
          + `${mandatsklasse.VORRANG_REAL_MESSBEDARF_P95} (Empfehlung ${mandatsklasse.VORRANG_REAL_EMPFEHLUNG}).` },
    // ERGÄNZT 02.09. (Nachprüfung nach dem Merge von #295, bestätigter Befund):
    // Gestuft war ausschließlich die AKTIVIERUNG. Provisionierung, Fachzyklus,
    // Deaktivierung und Entfernung galten pauschal für alle 495 — für die
    // 20 Profile der Stufe A ließ sich damit kein Fachzyklus freigeben und keine
    // Auswertung erstellen. Die Sicherheitsfrage „hält der Verdrängungsschutz
    // unter Last?" wäre erst bei 500 gestellt worden, also genau dann, wenn ein
    // Fehlschlag am teuersten ist. Diese Hürde verlangt die STUFENGENAUEN
    // Freigaben — und ohne Angabe der Stufe ist sie fail closed nicht erfüllt.
    { name: "Stufengenaue Freigaben der zu startenden Stufe liegen vor",
      ok: stufenBefund.ok, detail: stufenBefund.detail }
  ].map((h) => Object.freeze({ ...h }));

  const offen = huerden.filter((h) => !h.ok);
  return Object.freeze({
    startbereit: offen.length === 0,
    huerden: Object.freeze(huerden),
    offen: Object.freeze(offen.map((h) => h.name)),
    konfiguration: konfig,
    grenzen: grenzBefund,
    startfenster: fenster,
    zyklusImFenster: zyklus,
    arbeitsklassenImFenster: arbeitsklassen,
    vorrangreserveReal: vorrang,
    meldung: offen.length === 0
      ? "Alle Vorbedingungen erfüllt — der Start bleibt dennoch eine getrennte Betreiberfreigabe."
      : `NICHT startbereit: ${offen.length} offene Vorbedingung(en).`
  });
}

module.exports = {
  minuteAusUtc,
  MANDATE_GESAMT,
  PFLICHTWERTE,
  ABBRUCHREGELN,
  GRENZEN_PFLICHT,
  LAGE_BRIEFING_MINUTE_UTC,
  LAGE_BRIEFING_MAX_LAUFZEIT_MS,
  MINIMAL_CRON_SLOT_MINUTEN,
  fairnessUntergrenze,
  pruefeKonfiguration,
  entscheidungstabelle,
  pruefeGrenzen,
  pruefeAbbruch,
  pruefeStartfenster,
  WATCHDOG_START_MINUTE_UTC,
  WATCHDOG_VORSICHTSSPANNE_MINUTEN,
  belegteIntervalle,
  sichereStartfenster,
  startbereitschaft
};
