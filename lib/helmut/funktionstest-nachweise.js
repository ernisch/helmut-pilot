"use strict";

// Helmut — DIE REPRODUZIERBAREN AUSWERTER der Abbruchregeln A01, A06 und A10.
// =============================================================================
// WAS BISHER FEHLTE (Reviewbefund 02.09., am Kopf 331859a bestätigt):
// Drei Abbruchregeln hatten KEINE reproduzierbar auswertbare Quelle. Sie
// verlangten stattdessen eine von Hand gesetzte Zusage:
//
//   * A01 (unbekannte Modellaufrufe) und A06 (Drosselungen) lasen aus
//     `public.llm_usage` — einer Tabelle, die ohne angewendete Migration
//     `20260902121500` UND eingeschaltetes `HELMUT_LLM_USAGE_RELATIONAL`
//     garantiert LEER ist. Beides ist Stand dieses Sprints NICHT der Fall.
//     Ersatzweise akzeptierte die Stufenkontrolle ein Feld `blobAusgezaehlt:
//     true` — also die BEHAUPTUNG eines Menschen, gezählt zu haben.
//   * A10 (erkannter externer Kommunikationsversuch) akzeptierte `gezaehlt:
//     true`. Der Kommunikationsriegel führt jedoch überhaupt keinen Zähler und
//     schreibt nichts — es gab schlicht nichts zu zählen.
//
// Eine Abbruchregel, deren Messwert aus einer menschlichen Zusage stammt, ist
// keine Abbruchregel. Dieses Modul ersetzt die Zusagen durch RECHNUNGEN über
// tatsächlich persistierten Daten. Es ist reine Logik: es liest nichts selbst,
// ruft nichts auf und kennt weder Netz noch Datenbank — die Rohdaten sind
// EINGABE, genau wie in `funktionstest-kontrolle.js`.
//
// ─── WARUM A10 VERSANDSPUREN ZÄHLT UND NICHT RIEGELENTSCHEIDUNGEN ────────────
// Man könnte den Riegel zählen lassen. Das wäre die schwächere Messung, aus zwei
// Gründen:
//   1. Am Testtag steht der Riegel auf MODUS_TESTFENSTER und sperrt JEDEN Kanal.
//      Die Zahl der durchgelassenen Vorgänge ist dann strukturell 0 — sie sagt
//      nichts darüber, ob etwas hinausging.
//   2. Ein Versand, der den Riegel UMGEHT, fragt ihn nie. Ein Riegelzähler kann
//      genau den Fall nicht sehen, den A10 fangen soll.
// Gezählt wird deshalb, was ein TATSÄCHLICH erfolgter Versand hinterlässt.

const mandatsklasse = require("./mandatsklasse");

// ═══════════════════════════════════════════════════════════════════════════
// A01/A06 · Der Nutzungslog
// ═══════════════════════════════════════════════════════════════════════════

// Der freigegebene Katalog der Aufrufarten. Belege je Eintrag:
//   understanding                    lib/helmut/understanding.js:570 (Default)
//   understanding-*                  Praefixfamilie; storage.isSharedGlobalCallType
//                                    (staff-backfill.js:52, presentation-backfill.js:44)
//   koTagsBackfill                   storage.TENANT_EXEMPT_CALLTYPES
//   lageBriefing · communicationDraft · parliamentAssessment ·
//   helmutAssessment · refineBriefingItem   lib/helmut/ai.js
//   office-output                    lib/helmut/office.js
// `skipped-*` sind KEINE Modellaufrufe, sondern protokollierte Budgetablehnungen
// (ai.js). Sie zaehlen deshalb weder als bekannt noch als unbekannt, sondern
// werden getrennt ausgewiesen — im Messfenster waren es 1.260 Stueck, und sie
// als "unbekannte Aufrufe" zu zaehlen waere die schlimmste Art Fehlalarm.
const CALLTYPES_BEKANNT = Object.freeze([
  "understanding",
  "koTagsBackfill",
  "lageBriefing",
  "communicationDraft",
  "parliamentAssessment",
  "helmutAssessment",
  "refineBriefingItem",
  "office-output"
]);
const PRAEFIX_BEKANNT = Object.freeze(["understanding-"]);
const PRAEFIX_SKIP = "skipped-";

function istBekannterCallType(callType) {
  const ct = String(callType == null ? "" : callType).trim();
  if (!ct) return false;
  if (CALLTYPES_BEKANNT.includes(ct)) return true;
  return PRAEFIX_BEKANNT.some((p) => ct.startsWith(p));
}

function istSkipEintrag(callType) {
  return String(callType == null ? "" : callType).trim().startsWith(PRAEFIX_SKIP);
}

// Eine Drosselung ist ein Azure-429. Der Fehler liegt als Text in `error`
// (storage.recordLlmUsage; Projektion llm-usage-relational.js:108). Gesucht wird
// die Zahl 429 als eigenstaendiges Token — "1429" oder "4290" sind keine
// Drosselung, und ein blosses Vorkommen von "429" in einer Kennung ebenfalls nicht.
const DROSSELUNG = /(^|[^0-9])429([^0-9]|$)/;

function istDrosselung(eintrag) {
  const text = String((eintrag && eintrag.error) || "");
  if (!text) return false;
  return DROSSELUNG.test(text);
}

// DER AUSWERTER fuer A01 und A06 ueber dem Blob-Nutzungslog.
//
// `eintraege` ist der Inhalt von `helmut_store.data.llmUsage` (EINGABE).
// `vonMs`/`bisMs` grenzen das Fenster ein. `ringMax` ist die Kappungsgrenze des
// Ringpuffers (storage.LLM_USAGE_RING_MAX) — sitzt die Liste an dieser Grenze,
// koennen fruehere Eintraege verdraengt sein und das Fenster ist NICHT
// vollstaendig. Dann wird KEINE Zahl gemeldet (fail closed, CLAUDE.md §4.4):
// ein aus einem gekuerzten Fenster gezaehltes "0 unbekannte Aufrufe" waere
// genau das falsche Gruen, das dieser Sprint an mehreren Stellen beseitigt hat.
function werteNutzungslogAus({ eintraege = null, vonMs = null, bisMs = null, ringMax = 5000 } = {}) {
  if (!Array.isArray(eintraege)) {
    return Object.freeze({ auswertbar: false, grund: "llmUsage fehlt oder ist keine Liste" });
  }
  const von = Number(vonMs);
  const bis = Number(bisMs);
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis < von) {
    return Object.freeze({ auswertbar: false, grund: "Fenstergrenzen fehlen oder sind unbrauchbar" });
  }

  // Vollstaendigkeit ZUERST: ohne sie ist jede Zahl darunter irrefuehrend.
  let aeltesterMs = null;
  let ohneZeitstempel = 0;
  for (const e of eintraege) {
    const ms = new Date((e && e.createdAt) || 0).getTime();
    if (!Number.isFinite(ms) || ms <= 0) { ohneZeitstempel += 1; continue; }
    if (aeltesterMs === null || ms < aeltesterMs) aeltesterMs = ms;
  }
  const ringVoll = eintraege.length >= Number(ringMax);
  const fensterAbgedeckt = !ringVoll || (aeltesterMs !== null && aeltesterMs <= von);
  if (!fensterAbgedeckt) {
    return Object.freeze({
      auswertbar: false,
      grund: "Ringpuffer voll und der aelteste Eintrag ist juenger als der Fensterbeginn — "
        + "das Fenster ist gekuerzt, jede Zahl waere zu niedrig",
      eintraege: eintraege.length,
      ringMax: Number(ringMax),
      aeltesterIso: aeltesterMs === null ? null : new Date(aeltesterMs).toISOString()
    });
  }

  let imFenster = 0;
  let unbekannte = 0;
  let drosselungen = 0;
  let skips = 0;
  const unbekannteArten = new Map();
  for (const e of eintraege) {
    const ms = new Date((e && e.createdAt) || 0).getTime();
    if (!Number.isFinite(ms) || ms <= 0) continue;
    if (ms < von || ms > bis) continue;
    imFenster += 1;
    const ct = e && e.callType;
    if (istSkipEintrag(ct)) { skips += 1; continue; }
    if (!istBekannterCallType(ct)) {
      unbekannte += 1;
      const schluessel = String(ct == null || String(ct).trim() === "" ? "(leer)" : ct).slice(0, 60);
      unbekannteArten.set(schluessel, (unbekannteArten.get(schluessel) || 0) + 1);
    }
    if (istDrosselung(e)) drosselungen += 1;
  }

  return Object.freeze({
    auswertbar: true,
    quelle: "blob:helmut_store.data.llmUsage",
    eintraegeGesamt: eintraege.length,
    ringMax: Number(ringMax),
    ringVoll,
    ohneZeitstempel,
    aeltesterIso: aeltesterMs === null ? null : new Date(aeltesterMs).toISOString(),
    imFenster,
    // A01
    unbekannteModellaufrufe: unbekannte,
    unbekannteArten: Object.freeze([...unbekannteArten.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([art, anzahl]) => ({ art, anzahl }))),
    // A06
    drosselungen,
    // Ausdruecklich getrennt: Budgetablehnungen sind keine Modellaufrufe.
    budgetablehnungen: skips,
    // ─── DER BLINDE FLECK DIESER PRUEFUNG, ausdruecklich benannt ────────────
    // (Befund der Gegenpruefung 02.09., experimentell nachgewiesen in
    //  scripts/testkohorte-stufen-test.js Abschnitt Q.)
    //
    // Die Vollstaendigkeitspruefung oben entscheidet ueber genau zwei Groessen:
    // die LAENGE der Liste und den AELTESTEN Eintrag. Ein LOST UPDATE - zwei
    // gleichzeitige Laeufe lesen denselben Blob, haengen je einen Eintrag an und
    // schreiben unbedingt zurueck (CLAUDE.md §4.10, Ursache seit dem Sprint vom
    // 01.09. belegt) - entfernt aber einen JUENGEREN Eintrag aus der Mitte. Die
    // Laenge bleibt bei 5.000, der aelteste Eintrag bleibt derselbe: BEIDE
    // Pruefungen melden weiterhin "auswertbar".
    //
    // Es waere falsch, aus `auswertbar: true` zu schliessen, dass kein Eintrag
    // verloren ging. Das kann diese Funktion nicht sehen und behauptet es hier
    // ausdruecklich nicht. Ein Nachweis dafuer braucht einen vom Listeninhalt
    // UNABHAENGIGEN Zaehler - also die relationale Ablage (Migration
    // 20260902121500, nicht angewendet) oder ein bedingtes Schreiben.
    verlustErkennung: "keine",
    verlustErkennungGrund: "Geprueft werden nur Laenge und aeltester Eintrag. Ein Lost Update "
      + "entfernt einen juengeren Eintrag und laesst beide Groessen unveraendert - er ist hier "
      + "strukturell unsichtbar."
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A10 · Tatsaechliche Versandspuren
// ═══════════════════════════════════════════════════════════════════════════

// ─── WELCHER KANAL HAT ÜBERHAUPT EINE VERSANDSPUR? ──────────────────────────
// KORRIGIERT 02.09. nach einer Gegenpruefung, die die erste Fassung dieses
// Auswerters widerlegt hat. Die erste Fassung zaehlte Auditereignisse als
// Mailversandspur. Das war FALSCH:
//   * `recordAudit` wird von der ROUTE geschrieben, nicht vom Transport — und
//     zwar UNABHAENGIG davon, ob die Mail hinausging (server.js). Unter dem
//     Kommunikationsriegel entsteht der Eintrag also auch dann, wenn nichts
//     gesendet wurde. Als Versandnachweis war er damit ein Falschpositiv.
//   * Er trug keine Mandatskennung.
// BEIDES ist in diesem Sprint an der Quelle behoben: die vier Mailaufrufer
// schreiben jetzt die aufgeloeste Kennung UND `versand=ja|nein` in den Eintrag.
// Erst dadurch ist der Auditeintrag eine belastbare Spur — und nur die Eintraege
// mit `versand=ja` zaehlen.
//
// EHRLICH BENANNT bleibt: DREI der sieben Kanaele haben KEINE tenantbezogene
// (Korrektur 02.09.: hier stand "vier". Der Kommentar widersprach dem Code, den er
// beschreibt - `job-transport` ist ueber `helmut_job_outbox` sehr wohl messbar und
// steht in KANAL_SPUREN mit `messbar: true`. Gemessen sind es drei:
// monitoring-webhook, whatsapp, lambda-invoke.)
// Versandspur. Fuer sie ist eine gemeldete 0 kein Freispruch, sondern eine
// fehlende Messung — sie werden ausdruecklich als `nichtMessbar` ausgewiesen.
const KANAL_SPUREN = Object.freeze({
  // Auditeintrag mit `versand=ja` (seit 02.09. mit Kennung und Status).
  mail: { spur: "auditEvents(versand=ja)", messbar: true },
  einladung: { spur: "auditEvents(versand=ja)", messbar: true },
  // `p-<mandat>.pushEvents[].delivered` zaehlt die vom Push-Dienst ANGENOMMENEN
  // Sendungen (HTTP 2xx). Das schreibt der Sendepfad selbst — die staerkste Spur.
  push: { spur: "pushEvents.delivered", messbar: true },
  // Ausgangspostfach der Warteschlange, Mandat ueber helmut_jobs.tenant_id.
  "job-transport": { spur: "helmut_job_outbox", messbar: true },
  // Betriebliche Kanaele: sie zielen auf den Betreiber bzw. die eigene
  // Infrastruktur und tragen bauartbedingt keine Mandatskennung. Ein
  // synthetisches Profil kann sie nicht ausloesen.
  "monitoring-webhook": { spur: "monitoringWebhookDelivery.sent", messbar: false, grund: "kein Mandatsbezug" },
  whatsapp: { spur: null, messbar: false, grund: "keine persistierte Spur" },
  "lambda-invoke": { spur: null, messbar: false, grund: "keine persistierte Spur" }
});

// Auditaktionen der Mailwege (server.js).
const AUDIT_VERSAND = Object.freeze([
  "admin.user.invite",
  "admin.user.reset-link",
  "password.reset-requested"
]);

// Nur ein Eintrag mit ausdruecklichem `versand=ja` belegt einen Versand.
const VERSAND_JA = /·\s*versand=ja\b/;

function textOderLeer(wert) {
  return String(wert == null ? "" : wert).trim();
}

// Gehoert diese Spur zu einem synthetischen Profil? Zwei unabhaengige Merkmale,
// eines genuegt: die Mandatskennung ODER die reservierte Maildomain der Kohorte.
function spurIstSynthetisch({ politicianId = null, detail = null, kohortenMailEndung = ".invalid" } = {}) {
  if (mandatsklasse.istSynthetischeKennung(politicianId)) return true;
  const d = textOderLeer(detail).toLowerCase();
  const endung = textOderLeer(kohortenMailEndung).toLowerCase();
  return Boolean(endung && d.includes("@") && d.split(/[\s·]/)[0].endsWith(endung));
}

// DER AUSWERTER fuer A10.
//
// `auditEvents`  Inhalt von `helmut_store.data.auditEvents` (EINGABE)
// `pushEreignisse` Liste { politicianId, delivered, createdAt } aus den
//                  Mandantenspeichern `p-<mandat>.pushEvents` (EINGABE)
// `jobOutbox`    Zeilen aus `public.helmut_job_outbox` mit tenantId (EINGABE)
//
// Gezaehlt wird ein TATSAECHLICH ERFOLGTER Versand je Kanal im Fenster, der
// einem synthetischen Profil zuzuordnen ist.
function werteKommunikationsspurenAus({
  auditEvents = null,
  pushEreignisse = null,
  jobOutbox = null,
  vonMs = null,
  bisMs = null,
  ringMax = 1000,
  kohortenMailEndung = ".invalid"
} = {}) {
  if (!Array.isArray(auditEvents)) {
    return Object.freeze({ auswertbar: false, grund: "auditEvents fehlen oder sind keine Liste" });
  }
  const von = Number(vonMs);
  const bis = Number(bisMs);
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis < von) {
    return Object.freeze({ auswertbar: false, grund: "Fenstergrenzen fehlen oder sind unbrauchbar" });
  }

  // Ein gekappter Auditring kann fruehe Versendungen verdraengt haben.
  let aeltesterMs = null;
  for (const e of auditEvents) {
    const ms = new Date((e && e.createdAt) || 0).getTime();
    if (!Number.isFinite(ms) || ms <= 0) continue;
    if (aeltesterMs === null || ms < aeltesterMs) aeltesterMs = ms;
  }
  const ringVoll = auditEvents.length >= Number(ringMax);
  if (ringVoll && !(aeltesterMs !== null && aeltesterMs <= von)) {
    return Object.freeze({
      auswertbar: false,
      grund: "Auditring voll und der aelteste Eintrag ist juenger als der Fensterbeginn — "
        + "fruehe Versendungen koennen verdraengt sein",
      eintraege: auditEvents.length,
      ringMax: Number(ringMax)
    });
  }

  const imFenster = (ms) => Number.isFinite(ms) && ms > 0 && ms >= von && ms <= bis;
  const treffer = [];

  for (const e of auditEvents) {
    const ms = new Date((e && e.createdAt) || 0).getTime();
    if (!imFenster(ms)) continue;
    const aktion = textOderLeer(e && e.action);
    if (!AUDIT_VERSAND.includes(aktion)) continue;
    // ENTSCHEIDEND: nur ein ausdruecklich bestaetigter Versand zaehlt. Ohne
    // `versand=ja` ist der Eintrag ein Routenprotokoll, kein Versandnachweis.
    if (!VERSAND_JA.test(textOderLeer(e && e.detail))) continue;
    if (!spurIstSynthetisch({ politicianId: e && e.politicianId, detail: e && e.detail, kohortenMailEndung })) continue;
    treffer.push(Object.freeze({
      kanal: aktion === "admin.user.invite" ? "einladung" : "mail",
      aktion,
      zeitpunkt: new Date(ms).toISOString(),
      kennung: textOderLeer(e && e.politicianId) || null
    }));
  }

  // Push: `delivered > 0` ist eine vom Push-Dienst angenommene Sendung.
  const pushAuswertbar = Array.isArray(pushEreignisse);
  let pushTreffer = 0;
  if (pushAuswertbar) {
    for (const e of pushEreignisse) {
      const ms = new Date((e && e.createdAt) || 0).getTime();
      if (!imFenster(ms)) continue;
      if (!mandatsklasse.istSynthetischeKennung(e && (e.politicianId || e.kennung))) continue;
      if (Number(e && e.delivered) > 0) pushTreffer += Number(e.delivered);
    }
  }

  // Job-Transport: eine Zeile im Ausgangspostfach zu einem synthetischen Mandat.
  const outboxAuswertbar = Array.isArray(jobOutbox);
  let outboxTreffer = 0;
  if (outboxAuswertbar) {
    for (const z of jobOutbox) {
      const ms = new Date((z && (z.sentAt || z.sent_at || z.createdAt)) || 0).getTime();
      if (!imFenster(ms)) continue;
      if (!mandatsklasse.istSynthetischeKennung(z && (z.tenantId || z.tenant_id))) continue;
      outboxTreffer += 1;
    }
  }

  const nichtGemessen = [
    ...(pushAuswertbar ? [] : ["push"]),
    ...(outboxAuswertbar ? [] : ["job-transport"])
  ];
  const nichtMessbar = Object.entries(KANAL_SPUREN)
    .filter(([, v]) => !v.messbar).map(([k]) => k);

  return Object.freeze({
    auswertbar: true,
    quelle: "blob:auditEvents(versand=ja) + pushEvents.delivered + helmut_job_outbox",
    // DIE Zahl, die A10 bewertet.
    kommunikationsversuche: treffer.length + pushTreffer + outboxTreffer,
    jeKanal: Object.freeze({
      mail: treffer.filter((t) => t.kanal === "mail").length,
      einladung: treffer.filter((t) => t.kanal === "einladung").length,
      push: pushAuswertbar ? pushTreffer : null,
      "job-transport": outboxAuswertbar ? outboxTreffer : null
    }),
    // EHRLICH: was wurde nicht gemessen, und was ist gar nicht messbar?
    nichtGemessen: Object.freeze(nichtGemessen),
    nichtMessbar: Object.freeze(nichtMessbar),
    // ACHTUNG, ENGE BEDEUTUNG: `vollstaendig` heisst "alle MESSBAREN Kanaele
    // wurden erhoben" - NICHT "alle sieben Kanaele wurden gemessen". A10 haengt
    // an diesem Feld (Befund 02.09.: PR #295 machte `vollstaendig === true` zur
    // Pflicht), und genau deshalb ist der Name gefaehrlich: wer nur ihn liest,
    // haelt drei bauartbedingt unmessbare Kanaele fuer geprueft.
    //
    // Das Feld wird NICHT umbenannt (A10 und seine Tests haengen daran), aber es
    // steht ab jetzt nicht mehr allein: die drei Zaehler darunter sind
    // unmissverstaendlich und machen ein Fehllesen unmoeglich.
    vollstaendig: nichtGemessen.length === 0,
    kanaeleGesamt: Object.keys(KANAL_SPUREN).length,
    kanaeleGemessen: Object.keys(KANAL_SPUREN).length - nichtGemessen.length - nichtMessbar.length,
    alleKanaeleGemessen: nichtGemessen.length === 0 && nichtMessbar.length === 0,
    treffer: Object.freeze(treffer),
    eintraegeGesamt: auditEvents.length,
    ringVoll,
    hinweis: nichtGemessen.length
      ? `NICHT gemessen: ${nichtGemessen.join(", ")} — die Quellen wurden nicht übergeben. `
        + "Eine 0 wäre dort kein Freispruch."
      : `Alle messbaren Kanäle erhoben. Bauartbedingt nicht messbar: ${nichtMessbar.join(", ")}.`
  });
}

module.exports = {
  CALLTYPES_BEKANNT,
  PRAEFIX_BEKANNT,
  KANAL_SPUREN,
  AUDIT_VERSAND,
  istBekannterCallType,
  istSkipEintrag,
  istDrosselung,
  spurIstSynthetisch,
  werteNutzungslogAus,
  werteKommunikationsspurenAus
};
