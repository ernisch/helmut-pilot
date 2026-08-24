"use strict";

// Teil B (2026-08-24) — WhatsApp-Gesundheitsbot am neuen Warteschlangenmotor.
//
// Deckt die 12 Pflichttests des Auftrags ab (Nr. 12, Redaction, läuft als eigene
// Suite scripts/alarm-payload-test.js weiter — hier wird nur belegt, dass der
// Motorbericht dieselben Allowlist-Felder nutzt). Nur synthetische Daten, kein I/O.

const fs = require("fs");
const path = require("path");
const motorHealth = require("../lib/helmut/motor-health");
const { skalierbarerPfadAktiv } = require("../lib/helmut/scalable-pipeline");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const Z = motorHealth.MOTOR_ZUSTAENDE;
const H = 3600e3;
// Fixe, deterministische „Jetzt"-Zeit: 2026-08-24 06:00 UTC (der reale Reportslot).
const NOW = Date.parse("2026-08-24T06:00:00Z");
const iso = (msVal) => new Date(msVal).toISOString();

// Gesunde Quittungslage wie in Production am 24.08. um 06:00 UTC (Motor aktiv
// seit 23.08. abends; erste Warteschlangen-Quittung 20:02 UTC).
function gesundeQuittungen() {
  return [
    { process: "warteschlange-crawl", status: "success", startedAt: iso(NOW - 2 * H), zielmenge: 238, processed: 204, deferred: 23, wiederholt: 11, leaseVerloren: 0, fehlgeschlagen: 0, spiegelGeschrieben: 1508 },
    { process: "warteschlange-crawl", status: "success", startedAt: iso(NOW - 10 * H), zielmenge: 137, processed: 117, deferred: 8, wiederholt: 4, leaseVerloren: 0, fehlgeschlagen: 0, spiegelGeschrieben: 1035 },
    { process: "briefing-morning", status: "success", startedAt: iso(NOW - 1 * H) },
    { process: "briefing-morning", status: "success", startedAt: iso(NOW - 25 * H) },
    { process: "understanding-cron", status: "success", startedAt: iso(NOW - 0.5 * H) },
    { process: "understanding-cron", status: "success", startedAt: iso(NOW - 8.5 * H) },
    { process: "understanding-cron", status: "success", startedAt: iso(NOW - 24.5 * H) },
    { process: "briefing-lage", status: "success", startedAt: iso(NOW - 0.25 * H) },
    { process: "briefing-lage", status: "success", startedAt: iso(NOW - 24.25 * H) },
    { process: "understanding-lage", status: "success", startedAt: iso(NOW - 20 * H) }
  ];
}

function gesunderQueueStatus() {
  return {
    verfuegbar: true, flag: "on", zustand: "gruen", zustandsklasse: "aktiv-gesund",
    befunde: [], motor: { aktiv: true, aktivSeit: iso(NOW - 12 * H) },
    blockiert: { anzahl: 0, nachTyp: {}, aeltester: null },
    kennzahlen: { wartend: 57, laufend: 0, abgelaufeneLeases: 0, endgueltigFehler: 0 }
  };
}

function gesundeCas() {
  return { verfuegbar: true, zustaende: [{ zustand: "fertig", anzahl: 296 }, { zustand: "aufgegeben", anzahl: 1 }] };
}

function klassifiziere(overrides = {}) {
  const slotPruefung = "slotPruefung" in overrides ? overrides.slotPruefung
    : motorHealth.pruefeSlotQuittungen({
      quittungen: overrides.quittungen || gesundeQuittungen(), nowMs: NOW,
      motorAktivSeitMs: NOW - 12 * H
    });
  return motorHealth.klassifiziereMotorZustand({
    storageOk: true,
    queueStatus: gesunderQueueStatus(),
    casKennzahlen: gesundeCas(),
    quittungenLesbar: true,
    slotPruefung,
    verstandenAlterMs: 2 * H,
    budget: { calls: 10, limit: 100, remaining: 90, skips: 0, exhausted: false, status: "ok" },
    hinweise: [],
    ...overrides
  });
}

// ── Slot-Plan-Grundlagen: Frische aus erwarteten Slots + Toleranz, keine 28h ──
check("Slot 04:00 um 06:00 noch nicht erzwungen (Toleranz 3h) — erzwungen ist Vortag 04:00",
  motorHealth.letzterErzwungenerSlotMs(NOW, 4, motorHealth.SLOT_TOLERANZ_MS) === Date.parse("2026-08-23T04:00:00Z"));
check("Slot 04:00 um 08:00 erzwungen (Deadline 07:00 abgelaufen)",
  motorHealth.letzterErzwungenerSlotMs(NOW + 2 * H, 4, motorHealth.SLOT_TOLERANZ_MS) === Date.parse("2026-08-24T04:00:00Z"));

// ── Pflichttest 1+2: frische Motor-Quittung, Blob alt/leer/Projektionslauf ────
// Der Motorpfad liest den Blob `crawlRuns` überhaupt nicht (Verdrahtungstest
// unten); ein alter Projektionslauf mit 0 Quellen kann daher nichts auslösen.
{
  const r = klassifiziere({});
  check("T1/T2: gesunde Slot-Quittungen ⇒ Grün oder Gesund mit Hinweisen, kein Crawl-Alarm",
    (r.zustand === Z.GRUEN || r.zustand === Z.HINWEISE) && r.ok === true && r.gruende.length === 0,
    JSON.stringify({ zustand: r.zustand, gruende: r.gruende, unbestimmt: r.unbestimmtGruende, hinweise: r.hinweise }));
  // Ohne Zurückstellungen/Wiederholungen im jüngsten Lauf: reines Grün.
  const glatt = gesundeQuittungen().map((q) => (q.process === "warteschlange-crawl"
    ? { ...q, zielmenge: q.processed, deferred: 0, wiederholt: 0 } : q));
  const rGruen = klassifiziere({ quittungen: glatt });
  check("T1b: glatter Erfolgslauf ohne Rückstellungen ⇒ reines Grün",
    rGruen.zustand === Z.GRUEN && rGruen.ok === true, JSON.stringify(rGruen.hinweise));
}

// ── Pflichttest 3: erfolgreicher Lauf mit 0 neuen Quellen ⇒ gesund + Hinweis ──
{
  const r = klassifiziere({ hinweise: ["keine-neuen-quellen-im-letzten-lauf"] });
  check("T3: 0 neue Quellen ⇒ „Gesund mit Hinweisen“, ok bleibt true",
    r.zustand === Z.HINWEISE && r.ok === true && r.severity === "ok"
      && r.hinweise.includes("keine-neuen-quellen-im-letzten-lauf"));
}

// ── Pflichttest 4: hängende Lease ⇒ Rot ───────────────────────────────────────
{
  const qs = gesunderQueueStatus();
  qs.zustand = "warnung";
  qs.kennzahlen.laufend = 1;
  qs.kennzahlen.abgelaufeneLeases = 1;
  qs.befunde = ["leases-abgelaufen:1"];
  const r = klassifiziere({ queueStatus: qs });
  check("T4: hängende Lease ⇒ Gestört (Rot)",
    r.zustand === Z.ROT && r.ok === false && r.gruende.some((g) => g.startsWith("haengende-lease")));
}

// ── Pflichttest 5: unbekannter CAS-Vorgang ⇒ Rot ─────────────────────────────
{
  const cas = { verfuegbar: true, zustaende: [{ zustand: "fertig", anzahl: 296 }, { zustand: "unbekannt", anzahl: 1 }] };
  const r = klassifiziere({ casKennzahlen: cas });
  check("T5: CAS zustand=unbekannt ⇒ Gestört (Rot)",
    r.zustand === Z.ROT && r.gruende.includes("cas-unbekannte-vorgaenge") && r.casUnbekannt === 1);
}

// ── Pflichttest 6: zukünftig fällig / ordnungsgemäß zurückgestellt ⇒ kein Rot ─
{
  // Queue-Statusvertrag liefert bei nur zukünftig fälliger Arbeit zustand "gruen"
  // (Klasse 2); Mutationskontrolle direkt daneben: dasselbe Fixture mit "kritisch"
  // MUSS Rot ergeben — die Assertion unterscheidet nachweislich etwas.
  const qs = gesunderQueueStatus();
  qs.zustandsklasse = "aktiv-keine-faellige-arbeit";
  const r = klassifiziere({ queueStatus: qs });
  const kontrolle = klassifiziere({ queueStatus: { ...qs, zustand: "kritisch" } });
  check("T6a: zukünftig fällige Aufträge ⇒ kein roter Alarm (Kontrolle: kritisch ⇒ Rot)",
    r.zustand !== Z.ROT && r.ok === true && kontrolle.zustand === Z.ROT);
  const r2 = klassifiziere({}); // gesunde Quittung enthält 23 ordnungsgemäß Zurückgestellte
  check("T6b: ordnungsgemäß zurückgestellte Aufträge ⇒ nur Hinweis, kein Rot",
    r2.zustand !== Z.ROT, JSON.stringify(r2.gruende));
}

// ── Pflichttest 7: wirklich überfälliger fälliger Auftrag ⇒ Rot ───────────────
{
  const qs = gesunderQueueStatus();
  qs.zustand = "kritisch"; // Wartezeitvertrag: ≥ 24h effektive Wartezeit
  qs.zustandsklasse = "aktiv-festgefahren";
  const r = klassifiziere({ queueStatus: qs });
  check("T7: Wartezeit über dem 24h-Vertrag ⇒ Gestört (Rot), stabiler Slug",
    r.zustand === Z.ROT && r.gruende.includes("queue-kritisch:aktiv-festgefahren"));
}

// ── Pflichttest 8: nicht lesbare Motortabellen ⇒ Status nicht bestimmbar ──────
{
  const r1 = klassifiziere({ queueStatus: { verfuegbar: false, grund: "timeout" } });
  const r2 = klassifiziere({ casKennzahlen: { verfuegbar: false, grund: "migration-fehlt" } });
  const r3 = klassifiziere({ quittungenLesbar: false, slotPruefung: null });
  const alleUnbestimmt = [r1, r2, r3].every((r) =>
    r.zustand === Z.UNBESTIMMT && r.ok === false && r.severity === "unbestimmt"
      && r.severity !== "alarm" && r.gruende.length === 0);
  check("T8: Queue/CAS/Quittungen nicht lesbar ⇒ „Status nicht bestimmbar“, weder Grün noch Rot",
    alleUnbestimmt, JSON.stringify([r1.zustand, r2.zustand, r3.zustand]));
  const widerspruch = klassifiziere({
    slotPruefung: {
      ...motorHealth.pruefeSlotQuittungen({ quittungen: gesundeQuittungen(), nowMs: NOW, motorAktivSeitMs: NOW - 12 * H }),
      abrechnung: motorHealth.abrechnungWarteschlangenQuittung({ zielmenge: 10, processed: 9, deferred: 2 })
    }
  });
  check("T8b: Widerspruch (Kategorien > Zielmenge) ⇒ nicht bestimmbar",
    widerspruch.zustand === Z.UNBESTIMMT
      && widerspruch.unbestimmtGruende.includes("slot-quittung-widerspruch"));
  const r5 = klassifiziere({ verstandenAlterMs: null });
  check("T8c: Verstehens-Frische nicht lesbar/nie ⇒ nicht bestimmbar, kein stilles Grün",
    r5.zustand === Z.UNBESTIMMT && r5.unbestimmtGruende.includes("verstehens-frische-nicht-lesbar"));
}

// ── Pflichttest 9: Abdeckung/historische Fehler ändern die Überschrift nicht ──
{
  const r = klassifiziere({ hinweise: ["klassifikationsabdeckung-niedrig", "historische-fehler-aufgefangen:2"] });
  check("T9: Abdeckung 22% + 2 historische Fehler ⇒ keine Störungsüberschrift (ok=true, kein Rot/Unbestimmt)",
    r.zustand === Z.HINWEISE && r.ok === true && r.severity === "ok" && r.gruende.length === 0);
}

// ── Pflichttest 10: Altpfad bei nachweislich ausgeschaltetem Motor ────────────
{
  check("T10a: Flaggrenze fail closed — leer/off/Tippfehler = Motor aus",
    skalierbarerPfadAktiv({}) === false && skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "off" }) === false
      && skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "onn" }) === false
      && skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "on" }) === true);
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const dispatcher = server.slice(server.indexOf("async function buildHealthReport("), server.indexOf("async function buildMotorHealthReport("));
  check("T10b: Weiche prüft die Motor-Flaggrenze und fällt sonst auf den Altpfad zurück",
    dispatcher.includes("skalierbarerPfadAktiv(process.env)") && dispatcher.includes("buildLegacyHealthReport(politicianId)"));
  const legacy = server.slice(server.indexOf("async function buildLegacyHealthReport("));
  check("T10c: Altpfad unverändert vorhanden (Blob-crawlRuns + Zwei-Achsen-Klassifikation + Hysterese-Persistenz)",
    legacy.includes("listCrawlRuns(20)") && legacy.includes("classifyOperationalState(")
      && legacy.includes("saveWatchdogState(politicianId, classification.state)"));
  const motorTeil = server.slice(server.indexOf("async function buildMotorHealthReport("), server.indexOf("async function buildLegacyHealthReport("));
  check("T10d: Motorpfad liest NIE den Blob crawlRuns und schreibt keinen Watchdog-Zustand",
    !motorTeil.includes("listCrawlRuns") && !motorTeil.includes("rollingHealth.")
      && !motorTeil.includes("saveWatchdogState"));
  check("T10e: kein stiller Rückfall — Motorpfad liest NUR die relationale Quittungssicht und meldet Lesefehler als nicht bestimmbar",
    motorTeil.includes("verfuegbar: false") && motorTeil.includes("listProcessRunsRelational({ limit: 120 })")
      && !motorTeil.includes("listProcessRuns({"));
}

// ── Pflichttest 11: Quittungszahlen vollständig auflösbar ─────────────────────
{
  const a1 = motorHealth.abrechnungWarteschlangenQuittung({ zielmenge: 238, processed: 204, deferred: 23, wiederholt: 11, leaseVerloren: 0, fehlgeschlagen: 0 });
  const a2 = motorHealth.abrechnungWarteschlangenQuittung({ zielmenge: 67, processed: 55, deferred: 12, wiederholt: 0, leaseVerloren: 0, fehlgeschlagen: 0 });
  const a3 = motorHealth.abrechnungWarteschlangenQuittung({ zielmenge: 137, processed: 117, deferred: 8, wiederholt: 4, leaseVerloren: 0, fehlgeschlagen: 0 });
  check("T11a: 04:03-Lauf — 238 = 204 erledigt + 23 zurückgestellt + 11 wiederholt (Rest 0, kein Widerspruch)",
    !a1.widerspruch && a1.stapelrest === 0
      && a1.zielmenge === a1.erledigt + a1.zurueckgestellt + a1.wiederholt + a1.endgueltig + a1.leaseVerloren + a1.stapelrest);
  check("T11b: 06:01-Lauf — 67 = 55 erledigt + 12 zurückgestellt (Rest 0)",
    !a2.widerspruch && a2.stapelrest === 0
      && a2.zielmenge === a2.erledigt + a2.zurueckgestellt + a2.wiederholt + a2.endgueltig + a2.leaseVerloren + a2.stapelrest);
  check("T11c: 20:02-Lauf — 137 = 117 + 8 + 4 + Stapelrest 8 (dokumentierte Kategorie, kein Widerspruch)",
    !a3.widerspruch && a3.stapelrest === 8
      && a3.zielmenge === a3.erledigt + a3.zurueckgestellt + a3.wiederholt + a3.endgueltig + a3.leaseVerloren + a3.stapelrest);
  const a4 = motorHealth.abrechnungWarteschlangenQuittung({ zielmenge: 10, processed: 9, deferred: 2 });
  check("T11d: Kategorien größer als Zielmenge ⇒ Widerspruch", a4.widerspruch === true);
  check("T11e: Abrechnungstext benennt jede Kategorie",
    a3.text.includes("117 erledigt") && a3.text.includes("8 zurückgestellt") && a3.text.includes("4 wiederholt")
      && a3.text.includes("Rest 8") && a3.text.includes("Stapelrest") && a3.text.includes("= 137 Zielaufträge"));
}

// ── Slot fehlt / Slot fehlgeschlagen ohne Folgeerfolg ⇒ Rot ──────────────────
{
  const ohneCrawl = gesundeQuittungen().filter((q) => q.process !== "warteschlange-crawl");
  const p = motorHealth.pruefeSlotQuittungen({ quittungen: ohneCrawl, nowMs: NOW, motorAktivSeitMs: NOW - 12 * H });
  const r = klassifiziere({ slotPruefung: p });
  check("Fehlender erwarteter Motor-Slot ⇒ Gestört (Rot)",
    r.zustand === Z.ROT && r.gruende.some((g) => g.startsWith("slot-fehlt:warteschlange-crawl")));

  const mitPartial = gesundeQuittungen().map((q) => (q.zielmenge === 238 ? { ...q, status: "partial" } : q));
  const p2 = motorHealth.pruefeSlotQuittungen({ quittungen: mitPartial, nowMs: NOW, motorAktivSeitMs: NOW - 12 * H });
  const r2 = klassifiziere({ slotPruefung: p2 });
  check("Jüngster Motor-Slot partial/failed ohne Folgeerfolg ⇒ Gestört (Rot)",
    r2.zustand === Z.ROT && r2.gruende.some((g) => g.startsWith("slot-rot:warteschlange-crawl")));

  // Aktivierungslücke: die übrigen Crons quittieren normal, nur der frisch
  // aktivierte Motor hat noch keine Warteschlangen-Quittung und keinen Anker.
  const ohneMotorQuittung = gesundeQuittungen().filter((q) => !q.process.startsWith("warteschlange-"));
  const p3 = motorHealth.pruefeSlotQuittungen({ quittungen: ohneMotorQuittung, nowMs: NOW, motorAktivSeitMs: null });
  const r3 = klassifiziere({ slotPruefung: p3 });
  check("Motor an, aber noch keine Warteschlangen-Quittung ⇒ nicht bestimmbar (Aktivierungslücke ≠ Grün/Rot)",
    r3.zustand === Z.UNBESTIMMT && r3.unbestimmtGruende.includes("motor-an-ohne-warteschlangen-quittung")
      && r3.gruende.length === 0, JSON.stringify({ zustand: r3.zustand, gruende: r3.gruende }));

  // Aktivierungsanker: Slots VOR der Aktivierung werden nicht rückwirkend verlangt
  // (real: die erste Warteschlangen-Quittung 23.08. 20:02 — der 16:00-Pipeline-Slot
  // davor darf nicht als „fehlend" gelten).
  const nurCrawl = gesundeQuittungen().filter((q) => q.process !== "warteschlange-pipeline");
  const p4 = motorHealth.pruefeSlotQuittungen({ quittungen: nurCrawl, nowMs: NOW, motorAktivSeitMs: NOW - 12 * H });
  check("Slots vor dem Aktivierungsanker gelten nicht als fehlend",
    !p4.fehlendeSlots.some((s) => s.startsWith("warteschlange-pipeline")), JSON.stringify(p4.fehlendeSlots));
}

// ── Lage-Rotation: eigener Produkthinweis, nie Störung ───────────────────────
{
  const h20 = motorHealth.lageRotationsHinweis({ lageAlterMs: 20 * H, mandate: 5 });
  const h44 = motorHealth.lageRotationsHinweis({ lageAlterMs: 44 * H, mandate: 5 });
  const h9T = motorHealth.lageRotationsHinweis({ lageAlterMs: 9 * 24 * H, mandate: 5 });
  check("Lage-Hinweis nennt die dokumentierte Rotation (2 täglich, 25 Mandate ≈ 13 Tage)",
    h20.text.includes("2 Mandate") && h20.text.includes("25 Mandaten") && h20.text.includes("13 Tage"));
  check("Lage 20h ⇒ kein Rückstand · 44h ⇒ Rückstand innerhalb Rotation · 9T ⇒ außerhalb",
    h20.rueckstand === false && h44.rueckstand === true && h44.ausserhalbRotation === false
      && h9T.ausserhalbRotation === true);
  const r = klassifiziere({ hinweise: ["lage-rotation-rueckstand"] });
  check("Lage-Rückstand innerhalb der Rotation ⇒ „Gesund mit Hinweisen“, nie Rot",
    r.zustand === Z.HINWEISE && r.ok === true);
}

// ── Gesunder Leerlauf: `blocked`-Quittungen (no-pending/no-input) sind kein Rot ─
{
  // Bei aktivem Motor versteht der Queue-Slot; understanding-cron findet um
  // 05:30/21:30 oft nichts Fälliges und quittiert `blocked` (reason no-pending).
  // Der Cron hat nachweislich gefeuert — der Slot ist erfüllt (Review-Befund).
  const leerlauf = gesundeQuittungen().map((q) => (q.process === "understanding-cron"
    ? { ...q, status: "blocked", reason: "skipped: no-pending" } : q));
  const p = motorHealth.pruefeSlotQuittungen({ quittungen: leerlauf, nowMs: NOW, motorAktivSeitMs: NOW - 12 * H });
  const r = klassifiziere({ slotPruefung: p });
  check("Gesunder Verstehens-Leerlauf (blocked/no-pending) ⇒ kein „Gestört“, kein fehlender Slot",
    r.zustand !== Z.ROT && !p.fehlendeSlots.some((s) => s.startsWith("understanding-cron")),
    JSON.stringify({ zustand: r.zustand, fehlend: p.fehlendeSlots }));
  check("understanding-lage steht bewusst NICHT im Slot-Plan (schreibt an stabilen Tagen keine Quittung)",
    !motorHealth.SLOT_PLAN.some((e) => e.process === "understanding-lage"));
}

// ── Fensterbindung: späterer Erfolg maskiert keinen dauerhaft toten Slot ──────
{
  // Nur der 20:00-Slot läuft (Erfolge gestern 20:02 und heute wäre erst 20:00);
  // um 08:00 ist der 04:00-Slot erzwungen und sein Fenster [03:45, 07:00] leer.
  const nur20 = gesundeQuittungen().filter((q) => q.process !== "warteschlange-crawl");
  nur20.push({ process: "warteschlange-crawl", status: "success", startedAt: iso(NOW - 10 * H), zielmenge: 137, processed: 117, deferred: 8, wiederholt: 4, leaseVerloren: 0, fehlgeschlagen: 0, spiegelGeschrieben: 1035 });
  const p = motorHealth.pruefeSlotQuittungen({ quittungen: nur20, nowMs: NOW + 2 * H, motorAktivSeitMs: NOW - 12 * H });
  check("Toter 04:00-Slot fällt trotz gesundem 20:00-Slot auf (Fensterbindung)",
    p.fehlendeSlots.includes("warteschlange-crawl@04:00Z"), JSON.stringify(p.fehlendeSlots));
}

// ── Vorrang: positiv belegte Störung bleibt Rot trotz paralleler Leselücke ────
{
  const qs = gesunderQueueStatus();
  qs.zustand = "warnung";
  qs.zustandsklasse = "aktiv-lease-ohne-fortschritt";
  qs.kennzahlen.laufend = 1;
  qs.kennzahlen.abgelaufeneLeases = 1;
  const r = klassifiziere({ queueStatus: qs, casKennzahlen: { verfuegbar: false, grund: "timeout" } });
  check("Hängende Lease + CAS-Leselücke ⇒ Rot (Störung belegt), Leselücke bleibt sichtbar",
    r.zustand === Z.ROT && r.gruende.includes("haengende-lease")
      && r.unbestimmtGruende.includes("verstehens-cas-nicht-lesbar"));
}

// ── Hinweis-Ableitung aus echten Quittungsobjekten (leiteMotorHinweise) ───────
{
  const basis = { status: "success", spiegelGeschrieben: 0, reason: null };
  const h1 = motorHealth.leiteMotorHinweise({ ingest: basis });
  const h2 = motorHealth.leiteMotorHinweise({ ingest: { ...basis, reason: "blob-spiegel-fehlgeschlagen", spiegelGeschrieben: null } });
  const h3 = motorHealth.leiteMotorHinweise({
    ingest: { status: "success", spiegelGeschrieben: 1508 },
    coverage: { available: true, warn: true },
    errors24: 2,
    lageHinweis: motorHealth.lageRotationsHinweis({ lageAlterMs: 44 * H, mandate: 5 })
  });
  check("0 neue Quellen nur bei positivem Beleg; gescheiterter Spiegel-Write wird ehrlich benannt (Number(null)!==0-Falle)",
    h1.includes("keine-neuen-quellen-im-letzten-lauf")
      && !h2.includes("keine-neuen-quellen-im-letzten-lauf")
      && h2.includes("spiegel-write-fehlgeschlagen-wert-unbekannt"));
  check("Abdeckung/Fehler/Lage-Rotation werden aus Rohsignalen abgeleitet",
    h3.includes("klassifikationsabdeckung-niedrig") && h3.includes("historische-fehler-aufgefangen:2")
      && h3.includes("lage-rotation-rueckstand") && !h3.includes("keine-neuen-quellen-im-letzten-lauf"));
}

// ── Pflichttest 12 (Anbindung): Motorbericht nutzt nur die Allowlist-Felder ───
{
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const motorTeil = server.slice(server.indexOf("async function buildMotorHealthReport("), server.indexOf("async function buildLegacyHealthReport("));
  check("T12: Motorbericht liefert state/severity/healthBlockers/healthWarnings/overdueCrons (bestehende Allowlist, Redaction-Suite unverändert)",
    motorTeil.includes("healthBlockers:") && motorTeil.includes("healthWarnings:")
      && motorTeil.includes("overdueCrons:") && motorTeil.includes("severity:"));
}

console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
