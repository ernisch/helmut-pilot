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

// `blocked` entsteht überall aus `skipped: true` und deckt zwei sehr verschiedene Lagen:
// den ordnungsgemäßen Leerlauf (nichts zu tun) und eine Sperre/Abschaltung. Nur die
// erste ist unauffällig; die zweite bleibt als Hinweis sichtbar (Review-Befund).
const LEERGRUND_ORDNUNGSGEMAESS = ["no-pending", "no-input", "keine-aktiven-mandanten"];

// Rückschau für Störungen AUSSERHALB des erzwungenen Rasters. Ohne Grenze bliebe eine
// Wochen alte, längst überholte Quittung dauerhaft im Bericht stehen und die Überschrift
// könnte nie wieder „Gesund" lauten — das wäre nur eine andere Form des Fehlalarms.
const STOERUNGS_RUECKSCHAU_MS = 48 * 3600e3;

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
  // Nicht jede Quittung ist eine WARTESCHLANGEN-Quittung: ein Briefing- oder
  // Verstehenslauf trägt keine Auftragszähler. Für den wäre „= 0 Zielaufträge" eine
  // irreführende Null; `zaehlbar` sagt, ob die Abrechnung überhaupt etwas belegt.
  const zaehlbar = [q.zielmenge, q.processed, q.deferred, q.fehlgeschlagen, q.wiederholt, q.leaseVerloren]
    .some((v) => num(v) != null);
  return {
    zaehlbar,
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
//
// GETRENNTE BEWERTUNG (Korrektur 2026-08-26, belegter Fehlalarm):
// Ein Slot ist VORHANDEN, sobald für sein Zeitfenster überhaupt eine Quittung
// existiert — gleich ob `success`, `partial`, `blocked` oder `failed`. Nur das
// vollständige Fehlen einer Quittung heißt „Slot fehlt". Das ERGEBNIS des Slots
// wird davon unabhängig bewertet:
//   • `success`                       → Slot in Ordnung
//   • sonst UND späterer Erfolg da    → historische Störung, ERHOLT (Hinweis)
//   • sonst OHNE späteren Erfolg      → aktuelle Störung (Alarm)
// Fortdauernde Auswirkungen (offene endgültige Fehler, hängende Leases,
// unbekannte CAS-Vorgänge, feststeckende Aufträge) bewertet der Aufrufer über
// die Queue-/CAS-Achsen; eine erholte Störung wird dort nachwirkend verschärft.
//
// BELEGTER ANLASS: der `partial`-Lauf vom 25.08. (189 von 207 Aufträgen erledigt,
// ein einzelner struktureller Leerauftrag endgültig fehlgeschlagen) erfüllte den
// 04:00-Slot nicht und erschien deshalb bis zu 24 h lang als „slot-fehlt" —
// obwohl der Slot gelaufen war und zwei erfolgreiche Folgeläufe existierten.
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
  const teilweiseSlots = [];
  const leerlaufSlots = [];
  const rasterErfasst = new Set();
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
      const name = slotName(eintrag.process, stunde);
      const von = slotMs - SLOT_VORLAUF_MS;
      const bis = slotMs + toleranzMs;
      // SCHRITT 1 — VORHANDENSEIN: zählt jede Quittung im Fenster, unabhängig vom Ausgang.
      const imFenster = des.filter((q) => {
        const t = zeit(q);
        return t != null && t >= von && t <= bis;
      });
      if (!imFenster.length) { fehlendeSlots.push(name); continue; }
      for (const q of imFenster) rasterErfasst.add(q);

      // SCHRITT 2 — ERGEBNIS. Störungen (`partial`/`failed`) werden IMMER erfasst; ein
      // `blocked` im selben Fenster darf sie nicht verdecken (Review-Befund). `success`
      // und `blocked` sind ordnungsgemäße Ausgänge: `blocked` heißt „der Cron feuerte
      // und hatte nichts zu tun" bzw. „eine Sperre griff".
      const stoerungen = imFenster.filter((q) => q.status === "partial" || q.status === "failed");
      const erfolgImFenster = imFenster.filter((q) => q.status === "success")
        .sort((a, b) => zeit(a) - zeit(b))[0] || null;

      if (stoerungen.length) {
        const rang = { failed: 3, partial: 2 };
        const schlechtester = stoerungen.slice()
          .sort((a, b) => (rang[b.status] || 0) - (rang[a.status] || 0))[0];
        const t = zeit(schlechtester);
        // ERHOLUNG ist prozessweit, nicht slotgebunden: ein späterer erfolgreicher Lauf
        // DESSELBEN Prozesses beweist, dass der Motor wieder arbeitet — genau der reale
        // 26.08.-Fall (Vortags-Slot `partial`, danach zwei erfolgreiche Crawls).
        // Das maskiert keinen toten Slot: Vorhandensein wird je Fenster GETRENNT geprüft
        // (Schritt 1) und ein Fenster ohne jede Quittung bleibt `fehlendeSlots` — die
        // Erholung entschärft ausschließlich das ERGEBNIS einer vorhandenen Quittung.
        const imFensterDanach = erfolgImFenster && zeit(erfolgImFenster) > t ? erfolgImFenster : null;
        const folge = imFensterDanach || (erfolgreiche
          .filter((e) => { const te = zeit(e); return te != null && t != null && te > t; })
          .sort((a, b) => zeit(a) - zeit(b))[0] || null);
        teilweiseSlots.push({
          slot: name, process: eintrag.process, status: schlechtester.status || "unbekannt",
          lauf: schlechtester, erholt: Boolean(folge), erholungsLauf: folge
        });
        continue;
      }
      if (erfolgImFenster) continue; // sauberer Slot
      // Nur `blocked`: ordnungsgemäßer Leerlauf ODER eine Sperre — der Grund entscheidet,
      // und er wird ausgegeben statt verschwiegen.
      const grund = imFenster.map((q) => q.reason).find(Boolean) || null;
      leerlaufSlots.push({
        slot: name, process: eintrag.process, grund,
        ordnungsgemaess: LEERGRUND_ORDNUNGSGEMAESS.some((g) => String(grund || "").includes(g))
      });
    }
  }

  // ── ERGEBNISPRÜFUNG AUSSERHALB DES RASTERS ───────────────────────────────────
  // Die Slot-Schleife erzwingt je Prozess GENAU EIN Fenster. Eine Störung davor oder
  // danach (frisch, oder verspätet außerhalb der Toleranz) bliebe sonst unsichtbar —
  // auch dann, wenn ihr nur `blocked`-Läufe folgen. Bewertet wird deshalb zusätzlich
  // die jüngste noch nicht erfasste Störung je Prozess; ein prozessweiter späterer
  // Erfolg entschärft sie (der Motor arbeitet wieder).
  for (const eintrag of plan) {
    const istPflicht = Boolean(eintrag.motorPflicht);
    const des = alle.filter((q) => q.process === eintrag.process && zeit(q) != null);
    if (!des.length) continue;
    const offen = des
      .filter((q) => (q.status === "partial" || q.status === "failed") && !rasterErfasst.has(q))
      .sort((a, b) => zeit(b) - zeit(a));
    const juengsteStoerung = offen[0];
    if (!juengsteStoerung) continue;
    const t = zeit(juengsteStoerung);
    if (t < nowMs - STOERUNGS_RUECKSCHAU_MS) continue; // zu alt, um noch etwas auszusagen
    if (istPflicht && (motorOhneQuittung || t < anker)) continue;
    const folge = des
      .filter((e) => e.status === "success" && zeit(e) > t)
      .sort((a, b) => zeit(a) - zeit(b))[0] || null;
    teilweiseSlots.push({
      slot: `${eintrag.process}@ausserhalb-raster`,
      process: eintrag.process,
      status: juengsteStoerung.status || "unbekannt",
      lauf: juengsteStoerung,
      erholt: Boolean(folge),
      erholungsLauf: folge
    });
  }

  const aktuelleStoerungen = teilweiseSlots.filter((s) => !s.erholt);
  const erholteStoerungen = teilweiseSlots.filter((s) => s.erholt);
  // Der auslösende Lauf für die Anzeige: aktuelle Störung hat Vorrang vor erholter.
  const stoerung = aktuelleStoerungen[0] || erholteStoerungen[0] || null;

  return {
    ok: !fehlendeSlots.length && !teilweiseSlots.length && !motorOhneQuittung,
    fehlendeSlots,
    teilweiseSlots,
    leerlaufSlots,
    aktuelleStoerungen,
    erholteStoerungen,
    motorOhneQuittung,
    ankerMs: anker,
    juengsteIngest,
    stoerungsLauf: stoerung ? stoerung.lauf : null,
    stoerungsSlot: stoerung ? stoerung.slot : null,
    erholungsLauf: stoerung ? stoerung.erholungsLauf : null,
    abrechnung: juengsteIngest ? abrechnungWarteschlangenQuittung(juengsteIngest) : null,
    stoerungsAbrechnung: stoerung && stoerung.lauf ? abrechnungWarteschlangenQuittung(stoerung.lauf) : null
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

// ── BRIEFINGSTUFEN JE MANDAT (Teil 3, 2026-08-26) ────────────────────────────
// Der Bot behauptete bisher nur „briefing-morning 5/5" — das belegt die ERZEUGUNG,
// nicht die ANKUNFT. Produktionsbefund 26.08.: 5 von 5 Mandaten vorbereitet, aber
// nur 1 von 5 hatte überhaupt einen registrierten Push-Empfänger, und `opened` ist
// in keinem Ereignis gesetzt. Die Stufen werden deshalb getrennt ausgewiesen und
// NIE zu „Briefing erhalten" zusammengezogen.
//
// Eingabe je Mandat (vom Aufrufer mandantengetrennt erhoben, siehe server.js):
//   { mandat, vorbereitet, quelle, status, signatur, ablageKorrekt,
//     pushErzeugt, empfaenger, zugestellt, zustellfehler, lesefehler }
const OEFFNUNG_MESSBAR = false; // kein Rückkanal: `opened` wird nirgends gesetzt
// `delivered` (push.js) = vom Push-Dienst mit HTTP 2xx angenommen. Ob das Endgerät die
// Nachricht bekommen hat, meldet niemand zurück — deshalb ist der Empfang NICHT
// bestätigbar und wird auch nie so genannt.
const EMPFANG_BESTAETIGBAR = false;

function bewerteBriefingStufen({ einzel = [], jetztMs = Date.now(), erwartetAbMs = null } = {}) {
  const zeilen = einzel.filter((e) => e && e.mandat);
  const aktive = zeilen.length;
  const faellig = erwartetAbMs == null || jetztMs >= erwartetAbMs;

  const vorbereitet = zeilen.filter((e) => e.vorbereitet === true);
  const belegLuecke = zeilen.filter((e) => e.belegLesefehler);
  const ablageFremd = zeilen.filter((e) => e.ablageKorrekt === false);
  // Fehlend ist nur, wer NICHT vorbereitet ist UND wessen Beleg lesbar war — sonst
  // würde eine Messlücke als „Vorbereitung fehlt" behauptet (Review-Befund).
  const fehlend = zeilen.filter((e) => e.vorbereitet !== true && !e.belegLesefehler);

  // Personalisierung gilt als BELEGT, wenn die Inhaltssignaturen der vorbereiteten
  // Briefings paarweise verschieden sind. Bei einem einzigen Mandat ist sie nicht
  // prüfbar — dann ehrlich „nicht belegt", nie stillschweigend „belegt".
  const signaturen = vorbereitet.map((e) => e.signatur).filter(Boolean);
  const personalisierungBelegt = vorbereitet.length > 1
    && signaturen.length === vorbereitet.length
    && new Set(signaturen).size === vorbereitet.length;

  const pushErzeugt = zeilen.filter((e) => e.pushErzeugt === true).length;
  const pushUnbekannt = zeilen.filter((e) => e.pushErzeugt == null).length;
  // MESSBARKEIT VOR ERGEBNIS: `empfaenger == null` heißt „Abos nicht lesbar", nicht
  // „kein Empfänger". Beides zu vermischen wäre eine Behauptung ohne Beleg.
  const messbar = zeilen.filter((e) => e.empfaenger != null && Number.isFinite(Number(e.empfaenger)));
  const empfaengerUnbekannt = aktive - messbar.length;
  const mitEmpfaenger = messbar.filter((e) => Number(e.empfaenger) > 0);
  // WORTLAUT (Abnahme 26.08.): `delivered` in push.js zählt Sendungen, die der
  // PUSH-DIENST mit HTTP 2xx angenommen hat (`sendPush` gibt `ok: response.ok`
  // zurück). Das ist die Annahme durch den Dienst, KEINE Bestätigung des Endgeräts
  // und erst recht keine Öffnung. Deshalb heißt es überall „Versand bestätigt";
  // „zugestellt" wäre eine Behauptung, die der Beleg nicht trägt.
  const versandBestaetigt = mitEmpfaenger.filter((e) => Number(e.versandBestaetigt) > 0).length;
  // Ein Versandfehler zählt als Störung nur bei vorhandenem Empfänger. Ein Fehler ohne
  // Empfänger (Abo wurde bei 404/410 im selben Lauf entfernt) bleibt sichtbar, aber als
  // Hinweis — die eigene Regel verlangt genau diese Trennung (Review-Befund).
  const zustellfehler = mitEmpfaenger.filter((e) => Number(e.zustellfehler) > 0).length;
  const zustellfehlerOhneEmpfaenger = messbar
    .filter((e) => !(Number(e.empfaenger) > 0) && Number(e.zustellfehler) > 0).length;
  const ohneEmpfaenger = messbar.length - mitEmpfaenger.length;

  const gruende = [];
  const hinweise = [];
  const unbestimmt = [];

  // (1) Fehlende Vorbereitung NACH dem vorgesehenen Zeitpunkt ist eine Störung.
  if (faellig && fehlend.length) gruende.push("briefing-vorbereitung-fehlt");
  else if (!faellig && fehlend.length) hinweise.push("briefing-noch-nicht-faellig");
  // (2) Ein Versandfehler bei vorhandenem Empfänger ist eine Störung.
  if (zustellfehler > 0) gruende.push("briefing-push-versandfehler");
  if (zustellfehlerOhneEmpfaenger > 0) hinweise.push("push-abo-verworfen");
  // Ein Beleg mit fremdem Mandanten oder fremdem Tag ist ein Mandantentrennungsbefund.
  if (ablageFremd.length) gruende.push("briefing-ablage-fremd");
  // (3) Kein registrierter Empfänger ist ein PRODUKTHINWEIS, kein Motorausfall.
  if (ohneEmpfaenger > 0) hinweise.push("push-ohne-registrierten-empfaenger");
  if (vorbereitet.length > 1 && !personalisierungBelegt) hinweise.push("briefing-personalisierung-unbelegt");
  // Messlücken sind weder Grün noch Rot.
  if (belegLuecke.length) unbestimmt.push("briefingbeleg-nicht-lesbar");
  if (empfaengerUnbekannt > 0) unbestimmt.push("push-empfaenger-nicht-lesbar");
  if (pushUnbekannt > 0) unbestimmt.push("push-ereignisse-nicht-lesbar");

  const text = [
    `Briefingvorbereitung: ${vorbereitet.length} von ${aktive} aktuell`
      + `${personalisierungBelegt ? " und personalisiert" : " (Personalisierung nicht belegt)"}.`,
    ...(belegLuecke.length ? [`Briefingbeleg nicht lesbar: ${belegLuecke.length} Mandate.`] : []),
    ...(ablageFremd.length ? [`Beleg mit fremdem Mandat/Tag verworfen: ${ablageFremd.length} Mandate.`] : []),
    pushUnbekannt > 0
      ? `Push Ereignis erzeugt: ${pushErzeugt} von ${aktive - pushUnbekannt} lesbaren (${pushUnbekannt} nicht lesbar).`
      : `Push Ereignis erzeugt: ${pushErzeugt} von ${aktive}.`,
    empfaengerUnbekannt > 0
      ? `Push Empfänger registriert: ${mitEmpfaenger.length} von ${messbar.length} messbaren (${empfaengerUnbekannt} nicht lesbar).`
      : `Push Empfänger registriert: ${mitEmpfaenger.length} von ${aktive}.`,
    mitEmpfaenger.length
      ? `Push Versand bestätigt: ${versandBestaetigt} von ${mitEmpfaenger.length} registrierten Empfängern`
        + " (Annahme durch den Push-Dienst)."
      : (empfaengerUnbekannt > 0 && !messbar.length
        // Niemals „kein registrierter Empfänger" behaupten, wenn die Abos gar nicht
        // lesbar waren — das wäre ein Datenfehler im Gewand eines Produktbefunds.
        ? "Push Versand bestätigt: nicht bestimmbar — Push-Abos nicht lesbar."
        : "Push Versand bestätigt: kein registrierter Empfänger."),
    ...(ohneEmpfaenger > 0 ? [`Ohne registrierten Push Empfänger: ${ohneEmpfaenger} Mandate.`] : []),
    ...(zustellfehler > 0 ? [`Push Versand fehlgeschlagen: ${zustellfehler} Mandate.`] : []),
    ...(zustellfehlerOhneEmpfaenger > 0 ? [`Versandfehler ohne registriertes Abo: ${zustellfehlerOhneEmpfaenger} Mandate.`] : []),
    `Empfang am Endgerät: ${EMPFANG_BESTAETIGBAR ? "bestätigt" : "technisch nicht bestätigbar"}.`,
    `Öffnung: ${OEFFNUNG_MESSBAR ? "messbar" : "nicht messbar"}.`,
    ...(unbestimmt.length ? ["Briefingstufen: Status nicht bestimmbar."] : [])
  ].join(" ");

  return {
    aktive, faellig,
    vorbereitet: vorbereitet.length,
    fehlend: fehlend.map((e) => e.mandat),
    ablageFremd: ablageFremd.map((e) => e.mandat),
    personalisierungBelegt,
    pushErzeugt,
    empfaengerRegistriert: mitEmpfaenger.length,
    empfaengerMessbar: messbar.length,
    empfaengerUnbekannt,
    versandBestaetigt, zustellfehler, zustellfehlerOhneEmpfaenger, ohneEmpfaenger,
    pushUnbekannt,
    oeffnungMessbar: OEFFNUNG_MESSBAR,
    empfangBestaetigbar: EMPFANG_BESTAETIGBAR,
    belegLuecke: belegLuecke.map((e) => e.mandat),
    gruende, hinweise, unbestimmt, text
  };
}

// TEIL 2 (2026-08-26): Darstellung von Vollständigkeit, Ergebnis und Erholung —
// GETRENNT und als reine Funktion, damit sie testbar ist statt nur im Berichtstext zu
// existieren. „Alle erwarteten Slots quittiert" darf NIE unkommentiert neben einem
// partial-/failed-Lauf stehen; genau dieser Widerspruch stand am 25./26.08. im Bericht.
// `alter(quittung)` formatiert das Alter eines Laufs (Zeitformatierung bleibt beim Aufrufer).
function slotDarstellung({ slotPruefung = null, alter = () => "?" } = {}) {
  if (!slotPruefung) {
    return { slotZeile: "⏰ Slot-Quittungen nicht lesbar", stoerungsZeile: null, erholungsZeile: null };
  }
  const teile = [];
  // Reihenfolge: fehlende Slots (schwerste Aussage) vor Teilstörungen.
  if ((slotPruefung.fehlendeSlots || []).length) {
    teile.push(`Slot fehlt (keine Quittung): ${slotPruefung.fehlendeSlots.join(", ")}`);
  }
  if ((slotPruefung.aktuelleStoerungen || []).length) {
    teile.push(`Slot vorhanden, aber gestört: ${slotPruefung.aktuelleStoerungen
      .map((x) => `${x.slot} (${x.status}, kein erfolgreicher Folgelauf)`).join(", ")}`);
  }
  if ((slotPruefung.erholteStoerungen || []).length) {
    teile.push(`Slot vorhanden, aber teilweise — inzwischen erholt: ${slotPruefung.erholteStoerungen
      .map((x) => `${x.slot} (${x.status})`).join(", ")}`);
  }
  if ((slotPruefung.leerlaufSlots || []).length) {
    const ordentlich = slotPruefung.leerlaufSlots.filter((x) => x.ordnungsgemaess);
    const gesperrt = slotPruefung.leerlaufSlots.filter((x) => !x.ordnungsgemaess);
    if (ordentlich.length) {
      teile.push(`Slot ordnungsgemäß leer gelaufen: ${ordentlich.map((x) => x.slot).join(", ")}`);
    }
    if (gesperrt.length) {
      teile.push(`Slot leer gelaufen durch Sperre: ${gesperrt
        .map((x) => `${x.slot} (${x.grund || "Grund unbekannt"})`).join(", ")}`);
    }
  }
  const slotZeile = teile.length
    ? `⏰ ${teile.join(" · ")}`
    : "⏰ Alle erwarteten Slots quittiert und erfolgreich (Slot-Plan aus vercel.json, Toleranz 3h)";

  // Bei einer Störung wird der AUSLÖSENDE Lauf gezeigt (nicht der jüngste erfolgreiche),
  // ein späterer Erfolg getrennt als Erholung — beides mit vollständiger Abrechnung.
  const sl = slotPruefung.stoerungsLauf;
  const el = slotPruefung.erholungsLauf;
  const abr = (q, vorhanden) => {
    const a = vorhanden || (q ? abrechnungWarteschlangenQuittung(q) : null);
    // Ein Briefing-/Verstehenslauf trägt keine Auftragszähler — dort wäre
    // „= 0 Zielaufträge" eine erfundene Null.
    return a && a.zaehlbar ? a.text : "keine Auftragsabrechnung in dieser Quittung";
  };
  const stoerungsZeile = sl
    ? `Auslösender Lauf: ${sl.process} ${alter(sl)} (${sl.status}${sl.fehlerklasse ? `, ${sl.fehlerklasse}` : ""})`
      + ` — ${abr(sl, slotPruefung.stoerungsAbrechnung)}`
    : null;
  const erholungsZeile = el
    ? `Erholung: ${el.process} ${alter(el)} erfolgreich — ${abr(el, null)}`
    : null;
  return { slotZeile, stoerungsZeile, erholungsZeile };
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
  briefing = null, // bewerteBriefingStufen() — Aggregat über die aktiven Mandate
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
  // SLOTS: Vorhandensein und Ergebnis getrennt (Korrektur 2026-08-26).
  // Slugs tragen nur den Prozessnamen (stabil, < 40 Zeichen für die Allowlist und
  // das Ereignis-Dedupe); die genaue Slot-Stunde steht in der Textzeile.
  if (slotPruefung) {
    for (const s of slotPruefung.fehlendeSlots || []) {
      const slug = `slot-fehlt:${String(s).split("@")[0]}`;
      if (!gruende.includes(slug)) gruende.push(slug);
    }
    // Aktuelle Störung: Quittung vorhanden, aber kein Erfolg und KEIN späterer Erfolg.
    for (const s of slotPruefung.aktuelleStoerungen || []) {
      const slug = `slot-stoerung:${s.process}`;
      if (!gruende.includes(slug)) gruende.push(slug);
    }
  }
  if (queueStatus && queueStatus.verfuegbar !== false && queueStatus.zustand === "kritisch") {
    gruende.push(`queue-kritisch:${queueStatus.zustandsklasse || "unklassifiziert"}`);
  }
  if (num(k.abgelaufeneLeases) > 0) gruende.push("haengende-lease");
  // OFFENE TERMINALE ARBEIT ist Rot, unabhaengig davon, wie alt sie ist und wie der
  // Queue-Vertrag den Gesamtzustand einstuft: ein endgueltig fehlgeschlagener oder
  // dauerhaft blockierter Auftrag wird ohne menschliches Zutun NIE mehr erledigt.
  // Der Queue-Vertrag laesst ihn bewusst sichtbar, ohne den Betriebszustand zu kippen
  // (scalable-pipeline, Befund O5) — der Bot meldet ihn hart. Ohne diese Regel stuende
  // „Gesund" neben Dokumenten, die dauerhaft ungelesen bleiben (CLAUDE.md §4.4).
  const dauerhaftBlockiert = queueStatus && queueStatus.blockiert && queueStatus.blockiert.anzahl != null
    ? (num(queueStatus.blockiert.anzahl) || 0) : null;
  const terminalOffen = (num(k.endgueltigFehler) || 0) + (dauerhaftBlockiert || 0);
  if (terminalOffen > 0) gruende.push("terminal-offen");
  const casUnbekannt = casKennzahlen && casKennzahlen.verfuegbar
    ? Number(((casKennzahlen.zustaende || []).find((z) => z && z.zustand === "unbekannt") || {}).anzahl) || 0
    : null;
  if (casUnbekannt != null && casUnbekannt > 0) gruende.push("cas-unbekannte-vorgaenge");
  if (verstandenAlterMs != null && verstandenAlterMs >= verstandenRotMs) {
    gruende.push("verstehen-steht");
  }
  if (budget && budget.exhausted === true) gruende.push("ki-budget-erschoepft");

  // ERHOLTE Störung: ein späterer Erfolg hat sie beendet. Sie bleibt SICHTBAR, löst
  // aber keinen Alarm mehr aus — es sei denn, eine Auswirkung dauert nachweislich an
  // (offene endgültige Fehler, hängende Lease, unbekannter CAS-Vorgang, feststeckende
  // Warteschlange). Genau das war der 24-Stunden-Fehlalarm vom 26.08.
  const auswirkungOffen = terminalOffen > 0
    || (num(k.abgelaufeneLeases) > 0)
    || (casUnbekannt != null && casUnbekannt > 0)
    || (queueStatus && queueStatus.verfuegbar !== false && queueStatus.zustand === "kritisch");
  if (slotPruefung) {
    // Ein ORDNUNGSGEMÄSSER Leerlauf ist kein Hinweis — sonst könnte die Überschrift bei
    // aktivem Motor nie mehr „Gesund" lauten (die Verstehensslots laufen planmäßig leer).
    // Nur ein Leerlauf aus einer Sperre/Abschaltung bleibt sichtbar (Review-Befund).
    for (const s of slotPruefung.leerlaufSlots || []) {
      if (s.ordnungsgemaess) continue;
      const slug = `slot-gesperrt:${s.process}`;
      if (!hinweisListe.includes(slug)) hinweisListe.push(slug);
    }
    for (const s of slotPruefung.erholteStoerungen || []) {
      const slug = auswirkungOffen ? `slot-nachwirkend:${s.process}` : `slot-erholt:${s.process}`;
      if (auswirkungOffen) { if (!gruende.includes(slug)) gruende.push(slug); }
      else if (!hinweisListe.includes(slug)) hinweisListe.push(slug);
    }
  }

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

  // BRIEFINGSTUFEN (Teil 3): fehlende Vorbereitung nach dem vorgesehenen Zeitpunkt
  // und Zustellfehler bei vorhandenem Empfänger sind Störungen; kein registrierter
  // Empfänger ist ein Produkthinweis; eine nicht lesbare Belegzeile ist eine Messlücke.
  if (briefing) {
    for (const g of briefing.gruende || []) if (!gruende.includes(g)) gruende.push(g);
    for (const h of briefing.hinweise || []) if (!hinweisListe.includes(h)) hinweisListe.push(h);
    for (const u of briefing.unbestimmt || []) if (!unbestimmt.includes(u)) unbestimmt.push(u);
  }

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
  bewerteBriefingStufen,
  slotDarstellung,
  OEFFNUNG_MESSBAR,
  EMPFANG_BESTAETIGBAR,
  klassifiziereMotorZustand
};
