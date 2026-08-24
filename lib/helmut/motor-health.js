"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Motor-Gesundheit (Warteschlangenmotor OP-30) für den WhatsApp-Gesundheitsbot.
//
// Der Bot leitet seinen Betriebsstatus bei aktivem Motor (HELMUT_SCALABLE_PIPELINE)
// aus den ECHTEN Quittungen und Zuständen des Motors ab:
//   • Slot-Quittungen  — `process_runs` (relational, Option D §28.1), NICHT der
//     Blob `crawlRuns` (der wird vom Motor nicht mehr gefüttert; sein jüngster
//     Eintrag ist seit der Aktivierung ein struktureller Projektionslauf mit
//     0 Quellen — Befund Teil A, 2026-08-24).
//   • Warteschlange    — `scalable-pipeline.betriebsstatus` (Leases, Wartezeit-
//     vertrag, endgültige Fehler, dauerhaft Blockierte, Widerspruchsprüfung).
//   • Verstehens-CAS   — `storage.verstehenKennzahlen` (`zustand=unbekannt`).
//
// Vier Zustände (verbindlich, Teil-B-Auftrag):
//   Grün                    — jüngster erwarteter Slot erfolgreich, Speicher und
//                             Queue lesbar, keine hängende Lease, keine unbekannten
//                             Vorgänge, keine feststeckenden fälligen Aufträge.
//   Gesund mit Hinweisen    — Motor grün, aber Qualitäts-/Produktrückstände
//                             (Abdeckung, Lage-Rotation, Zurückstellungen, keine
//                             neuen Quellen, historische aufgefangene Fehler).
//                             Hinweise lösen NIE eine Störungsüberschrift aus.
//   Gestört (Rot)           — erwarteter Slot fehlt oder fehlgeschlagen ohne
//                             erfolgreichen Folgelauf, hängende Lease, wirklich
//                             überfälliger fälliger Auftrag, unbekannte Vorgänge,
//                             kritische Komponente nachweislich ausgefallen.
//   Status nicht bestimmbar — benötigte Tabellen/Quittungen nicht lesbar oder
//                             widersprüchlich. Wird NIE als Grün oder Rot ausgegeben.
//
// Rein funktional, KEIN I/O — vollständig offline testbar
// (scripts/motor-health-test.js). Die Datenbeschaffung liegt beim Aufrufer
// (server.js buildMotorHealthReport).
// ═══════════════════════════════════════════════════════════════════════════

const MOTOR_ZUSTAENDE = Object.freeze({
  GRUEN: "Gesund",
  HINWEISE: "Gesund mit Hinweisen",
  ROT: "Gestört",
  UNBESTIMMT: "Status nicht bestimmbar"
});

// Erwartete Slots (UTC) — exakt die Cron-Zeitpläne aus vercel.json. `motorPflicht`
// markiert die Prozesse, die NUR der aktive Motor quittiert; sie werden erst ab dem
// Aktivierungsanker erzwungen (sonst würde jede frische Aktivierung rückwirkend
// fehlende Slots melden).
// `understanding-lage` steht BEWUSST NICHT im Plan: der Prozess schreibt an
// stabilen Tagen strukturell keine Quittung (scheduler: Lage ohne neue Eingabe)
// — ein quittungsbasierter Slot-Check würde dort falsches Rot erzeugen. Die
// Lage-Aktualität deckt `lageRotationsHinweis` (echte lageChecks-Zeitstempel).
const SLOT_PLAN = Object.freeze([
  { process: "warteschlange-crawl", stundenUtc: [4, 20], motorPflicht: true },
  { process: "warteschlange-pipeline", stundenUtc: [16], motorPflicht: true },
  { process: "briefing-morning", stundenUtc: [5] },
  { process: "understanding-cron", stundenUtc: [5.5, 21.5] },
  { process: "briefing-lage", stundenUtc: [5.75] }
]);

// Dokumentierte Slot-Toleranz: Vercel-Cron-Verzug (Minuten), Laufzeit ≤ 300 s und
// das Watchdog-Ersatzlauf-Fenster (briefing-watchdog.yml, 05:30 UTC, laut
// CURRENT_STATE §3 oft 2–3 h verzögert). Ein Slot gilt erst NACH Ablauf der
// Toleranz als fehlend — keine pauschale 28-h-Frist mehr.
const SLOT_TOLERANZ_MS = 3 * 3600e3;
// Ein Lauf darf wenige Minuten VOR dem Slot-Zeitpunkt starten (Uhrenversatz).
const SLOT_VORLAUF_MS = 15 * 60e3;

// Lage-Rotation (dokumentierte Kapazität, dieser PR ÄNDERT sie nicht):
// der Lage-Cron verarbeitet je Tageslauf ~2 Mandate (Zeitbudget + Fairness-
// Rotation; systemErrors „Zeitbudget erschoepft: 3 von 5 Mandaten…", 21.–23.08.).
const LAGE_MANDATE_JE_LAUF = 2;
const LAGE_BEISPIEL_MANDATE = 25; // ⇒ ⌈25/2⌉ = 13 Tage je vollständiger Rotation

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const ms = (t) => {
  const n = Date.parse(t || "");
  return Number.isFinite(n) ? n : null;
};

function fmtAlter(altMs) {
  if (altMs == null) return "nie";
  const h = altMs / 3600e3;
  if (h < 1) return "gerade";
  if (h < 48) return `vor ${Math.round(h)}h`;
  return `vor ${Math.round(h / 24)}T`;
}

function slotName(process, stundeUtc) {
  const hh = String(Math.floor(stundeUtc)).padStart(2, "0");
  const mm = String(Math.round((stundeUtc % 1) * 60)).padStart(2, "0");
  return `${process}@${hh}:${mm}Z`;
}

// Jüngster Slot-Zeitpunkt je (process, stundeUtc), dessen Toleranzfrist abgelaufen
// ist — nur der wird erzwungen. Ein noch offener Slot (z. B. 04:00 um 06:00 bei
// 3 h Toleranz) ist keine Fehlstelle.
function letzterErzwungenerSlotMs(nowMs, stundeUtc, toleranzMs) {
  const tag = 24 * 3600e3;
  const heute0 = Math.floor(nowMs / tag) * tag;
  let slot = heute0 + stundeUtc * 3600e3;
  while (slot + toleranzMs > nowMs) slot -= tag;
  return slot;
}

// Vollständige Abrechnung einer Warteschlangen-Slot-Quittung. Die Zielmenge muss
// der Summe aller dokumentierten Ergebniskategorien entsprechen (Teil-B-Test 11):
//   zielmenge = erledigt + zurückgestellt + endgültig fehlgeschlagen
//             + wiederholt + leaseVerloren + Stapelrest.
// `Stapelrest` ist der im Slot-Zeitbudget nicht mehr bearbeitete Rest eines
// reservierten Stapels (scalable-pipeline `gibStapelrestZurueck`, Grund
// `zeitbudget-des-laufs-erschoepft`) — er wird vom Motor ehrlich zurückgegeben
// oder kehrt über den Leaseablauf zurück, aber NICHT einzeln quittiert. Eine
// NEGATIVE Restmenge ist ein echter Widerspruch (→ Status nicht bestimmbar).
function abrechnungWarteschlangenQuittung(q = {}) {
  const zielmenge = num(q.zielmenge) ?? 0;
  const erledigt = num(q.processed) ?? 0;
  const zurueckgestellt = num(q.deferred) ?? 0;
  const endgueltig = num(q.fehlgeschlagen) ?? 0;
  const wiederholt = num(q.wiederholt) ?? 0;
  const leaseVerloren = num(q.leaseVerloren) ?? 0;
  const bekannt = erledigt + zurueckgestellt + endgueltig + wiederholt + leaseVerloren;
  const stapelrest = zielmenge - bekannt;
  return {
    zielmenge, erledigt, zurueckgestellt, endgueltig, wiederholt, leaseVerloren,
    stapelrest: Math.max(0, stapelrest),
    widerspruch: stapelrest < 0,
    text: `${erledigt} erledigt · ${zurueckgestellt} zurückgestellt · ${wiederholt} wiederholt`
      + ` · ${endgueltig} endgültig fehlgeschlagen · ${leaseVerloren} Lease verloren`
      + ` · Rest ${Math.max(0, stapelrest)} (Stapelrest, nicht einzeln quittiert)`
      + ` = ${zielmenge} Zielaufträge`
  };
}

// Prüft die erwarteten Slots gegen die vorhandenen `process_runs`-Quittungen.
// quittungen: gemappte Zeilen aus storage.listProcessRuns (neueste zuerst oder
// unsortiert; Felder process/status/startedAt/createdAt/…).
function pruefeSlotQuittungen({
  quittungen = [],
  nowMs = Date.now(),
  motorAktivSeitMs = null,
  plan = SLOT_PLAN,
  toleranzMs = SLOT_TOLERANZ_MS
} = {}) {
  const alle = (Array.isArray(quittungen) ? quittungen : []).filter((q) => q && q.process);
  const zeit = (q) => ms(q.startedAt) ?? ms(q.createdAt);

  // Aktivierungsanker der motorPflicht-Prozesse: erklärter Zeitpunkt
  // (HELMUT_SCALABLE_PIPELINE_SEIT via betriebsstatus.motor.aktivSeit), sonst die
  // älteste vorhandene Warteschlangen-Quittung. Gibt es GAR KEINE, ist eine
  // frische Aktivierung nicht von einem Quittungsausfall unterscheidbar →
  // ehrlicher Befund statt Grün oder Rot.
  const motorQuittungen = alle.filter((q) => plan.some((p) => p.motorPflicht && p.process === q.process));
  let anker = num(motorAktivSeitMs);
  if (anker == null) {
    const aelteste = motorQuittungen.map(zeit).filter((t) => t != null).sort((a, b) => a - b)[0];
    anker = aelteste ?? null;
  }
  const motorOhneQuittung = anker == null;

  const fehlendeSlots = [];
  const fehlgeschlageneSlots = [];
  let juengsteIngest = null;

  for (const eintrag of plan) {
    const istPflicht = Boolean(eintrag.motorPflicht);
    const des = alle.filter((q) => q.process === eintrag.process);
    const erfolgreiche = des.filter((q) => q.status === "success");

    if (istPflicht) {
      for (const q of erfolgreiche) {
        const t = zeit(q);
        if (t != null && (!juengsteIngest || t > zeit(juengsteIngest))) juengsteIngest = q;
      }
    }

    for (const stunde of eintrag.stundenUtc) {
      const slotMs = letzterErzwungenerSlotMs(nowMs, stunde, toleranzMs);
      if (istPflicht && (motorOhneQuittung || slotMs < anker)) continue; // vor der Aktivierung nicht erwartbar
      // ERFÜLLUNG IST FENSTERGEBUNDEN [Slot − Vorlauf, Slot + Toleranz]: ein späterer
      // Lauf eines anderen Slots deckt einen dauerhaft toten Slot nicht mit ab
      // (Review-Befund: sonst fiele ein toter 04:00-Slot bei gesundem 20:00-Slot nie auf).
      // Motorpflicht-Slots verlangen `success`; für die übrigen Cron-Slots gilt der Slot
      // als erfüllt, sobald IRGENDEINE Quittung im Fenster liegt (auch `blocked` mit
      // ehrlichem Leergrund wie no-pending/no-input — der Cron hat nachweislich gefeuert;
      // Leerlauf ist bei aktivem Motor der Normalfall, weil das Verstehen in den
      // Queue-Slots passiert). Nur `failed` erfüllt nie.
      const kandidaten = istPflicht ? erfolgreiche : des.filter((q) => q.status !== "failed");
      const erfuellt = kandidaten.some((q) => {
        const t = zeit(q);
        return t != null && t >= slotMs - SLOT_VORLAUF_MS && t <= slotMs + toleranzMs;
      });
      if (!erfuellt) fehlendeSlots.push(slotName(eintrag.process, stunde));
    }

    // Fehlgeschlagener Lauf ohne erfolgreichen Folgelauf. Für motorPflicht-Prozesse
    // ist auch `partial` eine echte Störung (Quittungsvertrag §28.1:
    // lease-ohne-fortschritt bzw. endgültige Fehler) — für die übrigen Prozesse
    // zählt nur `failed` (ein `partial`-Verstehenslauf mit Budgetrest ist Alltag).
    const schlechte = des.filter((q) => (istPflicht
      ? (q.status === "failed" || q.status === "partial")
      : q.status === "failed"));
    for (const q of schlechte) {
      const t = zeit(q);
      if (t == null) continue;
      if (istPflicht && (motorOhneQuittung || t < anker)) continue;
      const folgeerfolg = erfolgreiche.some((e) => {
        const te = zeit(e);
        return te != null && te >= t;
      });
      if (!folgeerfolg) fehlgeschlageneSlots.push(`${eintrag.process}:${q.status}`);
    }
  }

  return {
    ok: !fehlendeSlots.length && !fehlgeschlageneSlots.length && !motorOhneQuittung,
    fehlendeSlots,
    fehlgeschlageneSlots,
    motorOhneQuittung,
    ankerMs: anker,
    juengsteIngest,
    abrechnung: juengsteIngest ? abrechnungWarteschlangenQuittung(juengsteIngest) : null
  };
}

// Lage-Aktualität als EIGENER Produkthinweis (ausdrücklich KEINE Störung,
// solange der Rückstand innerhalb der dokumentierten Rotation liegt; dieser PR
// ändert die Lage-Kapazität nicht).
function lageRotationsHinweis({ lageAlterMs = null, mandate = null } = {}) {
  const rotationsTage = (n) => Math.ceil(n / LAGE_MANDATE_JE_LAUF);
  const beispiel = `${LAGE_MANDATE_JE_LAUF} Mandate täglich bedeuten bei ${LAGE_BEISPIEL_MANDATE} Mandaten`
    + ` ungefähr ${rotationsTage(LAGE_BEISPIEL_MANDATE)} Tage pro vollständiger Rotation`;
  const n = num(mandate);
  const eigene = n != null && n > 0 ? `bei ${n} Mandaten ≈ ${rotationsTage(n)} Tage` : null;
  const alterText = fmtAlter(lageAlterMs);
  const rueckstand = lageAlterMs != null && lageAlterMs > 24 * 3600e3;
  const ausserhalbRotation = rueckstand && n != null && n > 0
    && lageAlterMs > (rotationsTage(n) + 1) * 24 * 3600e3;
  return {
    rueckstand,
    ausserhalbRotation,
    text: `Lage: ${alterText} — Rotation dokumentiert: ${LAGE_MANDATE_JE_LAUF} Mandate je Tageslauf`
      + `${eigene ? ` (${eigene})` : ""}; ${beispiel}`
      + `${rueckstand ? (ausserhalbRotation
        ? " · Rückstand AUSSERHALB der dokumentierten Rotation ⚠️"
        : " · Rückstand innerhalb der dokumentierten Rotation") : ""}`
  };
}

// Hinweis-Ableitung aus den Rohsignalen (rein, testbar mit echten Quittungsobjekten).
// Hinweise lösen NIE eine Störungsüberschrift aus.
function leiteMotorHinweise({ ingest = null, coverage = null, errors24 = 0, lageHinweis = null } = {}) {
  const hinweise = [];
  if (coverage && coverage.available && coverage.warn) hinweise.push("klassifikationsabdeckung-niedrig");
  // „Keine neuen Quellen" nur bei positivem Beleg: erfolgreicher Lauf UND Spiegel-Write
  // nicht fehlgeschlagen (reason-Feld der Quittung). `Number(null)===0` darf keinen
  // falschen Hinweis erzeugen (Review-Befund) — bei gescheitertem Spiegel-Write ist der
  // Wert unbekannt und wird ehrlich als eigener Hinweis benannt.
  if (ingest && ingest.status === "success") {
    if (ingest.reason === "blob-spiegel-fehlgeschlagen") hinweise.push("spiegel-write-fehlgeschlagen-wert-unbekannt");
    else if (Number(ingest.spiegelGeschrieben) === 0) hinweise.push("keine-neuen-quellen-im-letzten-lauf");
  }
  if (Number(errors24) > 0) hinweise.push(`historische-fehler-aufgefangen:${Number(errors24)}`);
  if (lageHinweis && lageHinweis.rueckstand) {
    hinweise.push(lageHinweis.ausserhalbRotation ? "lage-ausserhalb-rotation" : "lage-rotation-rueckstand");
  }
  return hinweise;
}

// Klassifiziert den Motor-Betriebszustand aus den Live-Signalen. Reine Logik —
// alle Eingaben sind bereits gelesene, fail-closed beschaffte Ergebnisse.
function klassifiziereMotorZustand({
  storageOk = false,
  queueStatus = null, // scalable-pipeline.betriebsstatus()
  casKennzahlen = null, // storage.verstehenKennzahlen()
  quittungenLesbar = false,
  slotPruefung = null, // pruefeSlotQuittungen()
  verstandenAlterMs = null,
  verstandenWarnMs = 24 * 3600e3,
  verstandenRotMs = 36 * 3600e3,
  budget = null, // health-axes.budgetAxis()
  hinweise = [] // vorab gesammelte Hinweis-Slugs/-Texte
} = {}) {
  const gruende = [];
  const unbestimmt = [];
  const hinweisListe = [...(Array.isArray(hinweise) ? hinweise : [])];

  // ALLE Slugs sind STABIL (keine Zähler/Stunden/Roh-Fehlertexte): sie speisen die
  // Ereigniskennung des Webhook-Dedupe (buildWebhookEventId hasht healthBlockers) und
  // die Allowlist kappt bei 40 Zeichen. Zahlen stehen in den Textzeilen des Berichts;
  // freie Fehlertexte gehören NIE in Slugs (Redaction-/Dedupe-Vertrag, Review-Befund).

  // ── STATUS NICHT BESTIMMBAR: fehlende oder widersprüchliche Grundlagen ──────
  if (!storageOk) unbestimmt.push("datenspeicher-nicht-konfiguriert");
  if (!queueStatus || queueStatus.verfuegbar === false) {
    unbestimmt.push("warteschlange-nicht-lesbar");
  } else if (queueStatus.zustand === "unbekannt") {
    unbestimmt.push("warteschlange-widerspruch");
  } else if ((queueStatus.befunde || []).some((b) => String(b).startsWith("blockierte-unbekannt"))) {
    // Ohne Blockierten-Sicht ist „keine feststeckende Warteschlange" nicht belegbar.
    unbestimmt.push("blockierten-sicht-nicht-lesbar");
  }
  if (!casKennzahlen || casKennzahlen.verfuegbar === false) {
    unbestimmt.push("verstehens-cas-nicht-lesbar");
  }
  if (!quittungenLesbar) unbestimmt.push("slot-quittungen-nicht-lesbar");
  // „Verstanden zuletzt: nie" ist bei laufendem Motor kein Grün: entweder ist der
  // KO-Store nicht lesbar oder leer — beides trägt keine grüne Zusage.
  if (verstandenAlterMs == null) unbestimmt.push("verstehens-frische-nicht-lesbar");
  if (slotPruefung && slotPruefung.motorOhneQuittung) unbestimmt.push("motor-an-ohne-warteschlangen-quittung");
  if (slotPruefung && slotPruefung.abrechnung && slotPruefung.abrechnung.widerspruch) {
    unbestimmt.push("slot-quittung-widerspruch");
  }

  // ── ROT: nur klar belegte Betriebsstörungen ─────────────────────────────────
  // Bewusste Verschärfung gegenüber dem Queue-Statusvertrag: eine abgelaufene Lease
  // auf `laufend` ist zum Report-Zeitpunkt (06:00, ≥ 1,5 h nach Slotende) ein toter
  // Halter und damit Rot — der Queue-Vertrag stuft sie nur als Warnung (Klasse 6),
  // weil der nächste Slot sie wieder aufnimmt. Der Bot meldet sie hart (Teil-B-Auftrag).
  const k = (queueStatus && queueStatus.kennzahlen) || {};
  if (slotPruefung) {
    for (const s of slotPruefung.fehlendeSlots || []) gruende.push(`slot-fehlt:${s}`);
    for (const s of slotPruefung.fehlgeschlageneSlots || []) gruende.push(`slot-rot:${s}`);
  }
  if (queueStatus && queueStatus.verfuegbar !== false && queueStatus.zustand === "kritisch") {
    gruende.push(`queue-kritisch:${queueStatus.zustandsklasse || "unklassifiziert"}`);
  }
  if (num(k.abgelaufeneLeases) > 0) gruende.push("haengende-lease");
  const casUnbekannt = casKennzahlen && casKennzahlen.verfuegbar
    ? Number(((casKennzahlen.zustaende || []).find((z) => z && z.zustand === "unbekannt") || {}).anzahl) || 0
    : null;
  if (casUnbekannt != null && casUnbekannt > 0) gruende.push("cas-unbekannte-vorgaenge");
  if (verstandenAlterMs != null && verstandenAlterMs >= verstandenRotMs) {
    gruende.push("verstehen-steht");
  }
  if (budget && budget.exhausted === true) gruende.push("ki-budget-erschoepft");

  // ── HINWEISE: kippen die Überschrift NIE auf Rot ────────────────────────────
  // (Hinweis-Slugs dürfen Zähler tragen: healthWarnings fließt NICHT in die
  // Ereigniskennung ein, nur healthBlockers/overdueCrons.)
  if (queueStatus && queueStatus.verfuegbar !== false && queueStatus.zustand === "warnung"
    && !(num(k.abgelaufeneLeases) > 0)) {
    hinweisListe.push(`queue-verzoegert:${queueStatus.zustandsklasse || "unklassifiziert"}`);
  }
  if (slotPruefung && slotPruefung.abrechnung) {
    const a = slotPruefung.abrechnung;
    if (a.zurueckgestellt > 0) hinweisListe.push(`auftraege-zurueckgestellt:${a.zurueckgestellt}`);
    if (a.wiederholt > 0) hinweisListe.push(`fehler-aufgefangen-wiederholt:${a.wiederholt}`);
    if (a.stapelrest > 0) hinweisListe.push(`stapelrest-nicht-einzeln-quittiert:${a.stapelrest}`);
  }
  if (verstandenAlterMs != null && verstandenAlterMs >= verstandenWarnMs && verstandenAlterMs < verstandenRotMs) {
    hinweisListe.push(`verstehen-verzoegert:${Math.round(verstandenAlterMs / 3600e3)}h`);
  }
  if (budget && budget.status === "knapp") hinweisListe.push("ki-budget-knapp");

  // VORRANG: eine positiv belegte Störung ist bestimmbar und bleibt Rot, auch wenn
  // daneben eine Leselücke besteht (Review-Befund) — die Lücke bleibt als eigene
  // „Nicht bestimmbar:"-Zeile sichtbar. Nur OHNE Störungsbeleg gilt: Leselücke/
  // Widerspruch ⇒ „Status nicht bestimmbar", nie Grün und nie Rot.
  let zustand;
  if (gruende.length) zustand = MOTOR_ZUSTAENDE.ROT;
  else if (unbestimmt.length) zustand = MOTOR_ZUSTAENDE.UNBESTIMMT;
  else if (hinweisListe.length) zustand = MOTOR_ZUSTAENDE.HINWEISE;
  else zustand = MOTOR_ZUSTAENDE.GRUEN;

  const severity = zustand === MOTOR_ZUSTAENDE.ROT ? "alarm"
    : zustand === MOTOR_ZUSTAENDE.UNBESTIMMT ? "unbestimmt" : "ok";
  const emoji = zustand === MOTOR_ZUSTAENDE.ROT ? "⚠️"
    : zustand === MOTOR_ZUSTAENDE.UNBESTIMMT ? "⚪"
      : zustand === MOTOR_ZUSTAENDE.HINWEISE ? "🟡" : "✅";

  return {
    zustand,
    label: zustand,
    severity,
    emoji,
    // ok=false heißt „nicht grün" (Rot ODER nicht bestimmbar) — nie stilles Grün.
    ok: severity === "ok",
    gruende,
    unbestimmtGruende: unbestimmt,
    hinweise: hinweisListe,
    casUnbekannt
  };
}

module.exports = {
  MOTOR_ZUSTAENDE,
  SLOT_PLAN,
  SLOT_TOLERANZ_MS,
  SLOT_VORLAUF_MS,
  LAGE_MANDATE_JE_LAUF,
  LAGE_BEISPIEL_MANDATE,
  fmtAlter,
  letzterErzwungenerSlotMs,
  abrechnungWarteschlangenQuittung,
  pruefeSlotQuittungen,
  lageRotationsHinweis,
  leiteMotorHinweise,
  klassifiziereMotorZustand
};
