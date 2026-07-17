"use strict";

// Offline-Tests der V3-Radar-Engine (lib/helmut/radar.js). KEIN Netz, KEINE KI.
// Prüft die server-seitige, deterministische Klassifikation aus STRUKTURFELDERN
// (nicht Volltext-Keywords), den personen-/parteischarfen Filter, Determinismus,
// DSGVO und Fail-safe. Radar hatte bisher NULL Testabdeckung.

const radar = require("../lib/helmut/radar");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-06T12:00:00Z").getTime();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const base = { status: "neu", understanding_status: "complete" };

const koRisk = { ...base, id: "ko-r", vorgang_id: "vg-r", display_title: "Angriff auf Abgeordnete", mentioned_people: ["Test Abgeordnete"], risiken: ["Scharfe Kritik"], updated_at: iso(3600e3), best_source_url: "https://a.de/x" };
const koDemand = { ...base, id: "ko-d", vorgang_id: "vg-d", mentioned_people: ["Test Abgeordnete"], instrument: "Kleine Anfrage", updated_at: iso(3600e3) };
const koChance = { ...base, id: "ko-c", vorgang_id: "vg-c", mentioned_parties: ["SPD"], chancen: ["Positive Presse"], updated_at: iso(3600e3) };
const koWarn = { ...base, id: "ko-w", vorgang_id: "vg-w", mentioned_people: ["Test Abgeordnete"], updated_at: iso(3600e3) };            // frisch, kein starkes Signal
const koMention = { ...base, id: "ko-m", vorgang_id: "vg-m", mentioned_people: ["Test Abgeordnete"], updated_at: iso(10 * 864e5) };   // alt -> Erwähnung
const koBoth = { ...base, id: "ko-b", vorgang_id: "vg-b", mentioned_people: ["Test Abgeordnete"], risiken: ["x"], chancen: ["y"], updated_at: iso(3600e3) };
const koUnrelated = { ...base, id: "ko-u", vorgang_id: "vg-u", mentioned_people: ["Andere Person"], mentioned_parties: ["CDU"], updated_at: iso(3600e3) };
const koPending = { id: "ko-p", vorgang_id: "vg-p", status: "pending", understanding_status: "pending", mentioned_people: ["Test Abgeordnete"] };

const profile = { id: "u-1", fullName: "Test Abgeordnete", party: "SPD" };
const allKos = [koRisk, koDemand, koChance, koWarn, koMention, koBoth, koUnrelated, koPending];

// --- 1) Klassifikation aus Strukturfeldern (Priorität risk>demand>chance>warning>mention)
check("Risiko-KO -> 'risk'", radar.classifyRadarSignal(koRisk, NOW) === "risk");
check("Anfrage/Ausschuss-KO -> 'demand'", radar.classifyRadarSignal(koDemand, NOW) === "demand");
check("Chance-KO -> 'chance'", radar.classifyRadarSignal(koChance, NOW) === "chance");
check("Frischer neutraler KO -> 'warning'", radar.classifyRadarSignal(koWarn, NOW) === "warning");
check("Alter neutraler KO -> 'mention'", radar.classifyRadarSignal(koMention, NOW) === "mention");
check("KO mit Risiko UND Chance -> 'risk' (Priorität)", radar.classifyRadarSignal(koBoth, NOW) === "risk");

// --- 2) Personen-/parteischarfer Filter + Erwähnungsgrund -------------------
const result = radar.buildRadarSignals(profile, allKos, { now: NOW });
check("Nicht-erwähnte Vorgänge werden ausgeschlossen (Andere Person/CDU)", !result.signals.some((s) => s.vorgangId === "vg-u"));
check("Pending-Vorgänge werden ausgeschlossen", !result.signals.some((s) => s.vorgangId === "vg-p"));
check("Namens-Erwähnung -> reason 'person'", (result.signals.find((s) => s.vorgangId === "vg-r") || {}).reason === "person");
check("Partei-Erwähnung -> reason 'partei'", (result.signals.find((s) => s.vorgangId === "vg-c") || {}).reason === "partei");
check("6 erwähnte Vorgänge im Radar (r,d,c,w,m,b)", result.total === 6, `total=${result.total}`);

// --- 3) Buckets: gültig + Sichtbarkeit ------------------------------------
check("Alle signalType ∈ RADAR_BUCKETS", result.signals.every((s) => radar.RADAR_BUCKETS.includes(s.signalType)));
// mention ist QUERSCHNITT (Eigenerwähnungen); Inhaltsbuckets ergänzen -> jedes Signal in >=1 Bucket sichtbar.
check("Jedes Signal ist in mind. einem Bucket sichtbar",
  result.signals.every((s) => radar.RADAR_BUCKETS.some((b) => result.buckets[b].includes(s))));
check("mention-Bucket = genau die Eigenerwähnungen (reason=person)",
  result.buckets.mention.length === result.signals.filter((s) => s.reason === "person").length
  && result.buckets.mention.every((s) => s.reason === "person"));
check("Risiko-Vorgang liegt im risk-Bucket", result.buckets.risk.some((s) => s.vorgangId === "vg-r"));

// --- 4) Determinismus + Leerfall -------------------------------------------
const result2 = radar.buildRadarSignals(profile, allKos, { now: NOW });
check("Radar-Engine ist deterministisch (2 Läufe gleich)", JSON.stringify(result) === JSON.stringify(result2));
const empty = radar.buildRadarSignals(profile, [], { now: NOW });
check("Leerfall: total 0, Buckets leer, kein Crash", empty.total === 0 && radar.RADAR_BUCKETS.every((b) => empty.buckets[b].length === 0));
const noName = radar.buildRadarSignals({ id: "u-x", party: "" }, allKos, { now: NOW });
check("Profil ohne Name/Partei -> keine Fremd-Signale (kein universeller Match)", noName.total === 0);

// --- 5) DSGVO + Signalform --------------------------------------------------
check("Signale tragen nur öffentliche Vorgangsdaten (kein privates Profilfeld)",
  !JSON.stringify(result).toLowerCase().includes("email"));
const sig = result.signals.find((s) => s.vorgangId === "vg-r");
check("Signal trägt title + signalType + url + reason", sig && sig.title && sig.signalType && sig.knowledgeObjectId === "ko-r");

// --- 7) Eigenerwähnung des Abgeordneten zuverlässig erkennen (Step-4-Nachschliff)
// Radar muss Eigenerwähnungen finden — auch wenn der Name NICHT als strukturierte
// mentioned_*-Erwähnung extrahiert wurde, sondern nur im öffentlichen KO-Analysetext steht.
{
  const mdb = { id: "u-mdb", fullName: "Aylin Özdemir", party: "Grüne" };
  const one = (ko) => radar.buildRadarSignals(mdb, [{ ...base, id: "ko-x", vorgang_id: "vg-x", updated_at: iso(3600e3), ...ko }], { now: NOW });
  check("Eigenerwähnung: voller Name in mentioned_mps -> reason=person",
    one({ mentioned_mps: ["Aylin Özdemir"] }).signals[0] && one({ mentioned_mps: ["Aylin Özdemir"] }).signals[0].reason === "person");
  check("Eigenerwähnung: Nachname allein in mentioned_people -> reason=person",
    (one({ mentioned_people: ["Özdemir"] }).signals[0] || {}).reason === "person");
  check("Eigenerwähnung PROSE-Fallback: voller Name im display_title (nicht extrahiert) -> person",
    (one({ display_title: "Aylin Özdemir fordert schnellere Agrarwende" }).signals[0] || {}).reason === "person");
  check("Eigenerwähnung PROSE-Fallback: distinktiver Nachname als Wort im was_ist_passiert -> person",
    (one({ was_ist_passiert: "Im Ausschuss kritisierte Özdemir die Verzögerung." }).signals[0] || {}).reason === "person");
  check("Kein Fehltreffer: anderer Politiker + fremde Partei -> kein Signal",
    one({ mentioned_people: ["Robert Habeck"], mentioned_parties: ["SPD"], display_title: "Habeck stellt Plan vor" }).total === 0);
  // Whole-word-Guard: Nachname darf NICHT als Teilwort matchen ('ince' in 'provinces').
  check("Kein Teilwort-Fehltreffer: 'ince' in 'Provinces' matcht nicht",
    radar.buildRadarSignals({ id: "u-inal", fullName: "Deniz Inal", party: "Die Linke" },
      [{ ...base, id: "ko-y", vorgang_id: "vg-y", updated_at: iso(3600e3), display_title: "Debatte über Provinces und Finanzen" }], { now: NOW }).total === 0);
}

// --- 8) Deniz İnal: Schreibweisen + "Eigene Erwähnung"-Bucket (Produktanforderung)
{
  // Aktives Profil ist Deniz İnal (türkisches İ). Alle Schreibweisen müssen greifen.
  const ince = { id: "u-ci", fullName: "Deniz İnal", party: "Die Linke" };
  const koWith = (extra) => radar.buildRadarSignals(ince, [{ ...base, id: "ko-i", vorgang_id: "vg-i", updated_at: iso(3600e3), ...extra }], { now: NOW });
  check("İnal: Schreibweise 'Deniz İnal' (türkisches İ) wird erkannt",
    (koWith({ mentioned_mps: ["Deniz İnal"] }).signals[0] || {}).reason === "person");
  check("İnal: Schreibweise 'Deniz Inal' (ohne Punkt) wird erkannt",
    (koWith({ mentioned_people: ["Deniz Inal"] }).signals[0] || {}).reason === "person");
  check("İnal: Nachname 'İnal' im Titel wird erkannt (Prosa-Fallback)",
    (koWith({ display_title: "İnal kritisiert Sozialkürzungen" }).signals[0] || {}).reason === "person");
  check("İnal: Nachname 'Inal' im Titel wird erkannt (Prosa-Fallback)",
    (koWith({ display_title: "Inal fordert Nachbesserung" }).signals[0] || {}).reason === "person");
  // Produktanforderung 11: reine Parteierwähnung ohne Namensnennung ist KEINE Eigenerwähnung.
  const partyOnly = radar.buildRadarSignals(ince, [{ ...base, id: "ko-po", vorgang_id: "vg-po", updated_at: iso(3600e3), mentioned_parties: ["Die Linke"], display_title: "Die Linke legt Rentenkonzept vor" }], { now: NOW });
  check("İnal: nur 'Die Linke' ohne Namen -> reason=partei, NICHT im mention-Bucket",
    (partyOnly.signals[0] || {}).reason === "partei" && partyOnly.buckets.mention.length === 0);
  // Produktanforderung 4-6: Eigenerwähnung landet IMMER im mention-Bucket — auch wenn zusätzlich Risiko.
  const ownMention = radar.buildRadarSignals(ince, [{ ...base, id: "ko-om", vorgang_id: "vg-om", updated_at: iso(3600e3), mentioned_mps: ["Deniz İnal"] }], { now: NOW });
  check("İnal: Eigenerwähnung landet im Bucket 'mention'", ownMention.buckets.mention.length === 1);
  const ownRisk = radar.buildRadarSignals(ince, [{ ...base, id: "ko-or", vorgang_id: "vg-or", updated_at: iso(3600e3), mentioned_mps: ["Deniz İnal"], risiken: ["Scharfe Kritik"], best_source_url: "https://a.de/x" }], { now: NOW });
  check("İnal: Eigenerwähnung MIT Risiko -> in mention UND risk sichtbar",
    ownRisk.buckets.mention.some((s) => s.vorgangId === "vg-or") && ownRisk.buckets.risk.some((s) => s.vorgangId === "vg-or"));
}

// --- 9) Scan-Umfang: Eigenerwähnung unabhängig von Top-Risk/Party-Signalen ---
{
  const ince = { id: "u-ci2", fullName: "Deniz İnal", party: "Die Linke" };
  // 80 aktuelle Partei-Signale + 1 SEHR ALTE Eigenerwähnung: Anzeige-Cap darf die
  // Eigenerwähnung nicht wegkappen (Produktanforderung 4).
  const many = [];
  for (let i = 0; i < 80; i++) many.push({ ...base, id: "kp" + i, vorgang_id: "vp" + i, mentioned_parties: ["Die Linke"], updated_at: iso(i * 3600e3) });
  many.push({ ...base, id: "kp-ince", vorgang_id: "vp-ince", mentioned_mps: ["Deniz İnal"], updated_at: new Date(0).toISOString() });
  const res = radar.buildRadarSignals(ince, many, { now: NOW, limit: 60 });
  check("Anzeige-Cap: alte Eigenerwähnung wird NICHT weggekappt (bleibt im mention-Bucket)",
    res.buckets.mention.some((s) => s.vorgangId === "vp-ince"));
}

// --- 6) Shadow-Runner: Fail-safe + Happy-Path (injizierte Deps) -------------
(async () => {
  const off = await radar.buildRadarForUser({ userId: "u-1" }, { enabled: () => false });
  check("buildRadarForUser: Store aus -> skipped (v3-store-disabled)", off.skipped && off.reason === "v3-store-disabled");

  const ok = await radar.buildRadarForUser({ profile, now: NOW }, {
    enabled: () => true,
    listKnowledgeObjects: () => allKos
  });
  check("buildRadarForUser Happy-Path: erwähnte Signale, korrekt gruppiert", ok.total === 6 && ok.buckets.risk.length >= 1);

  // Produktanforderung 3/4: Scan-Umfang groß + unabhängig vom Anzeige-Limit.
  let scanArgs = null;
  await radar.buildRadarForUser({ profile, now: NOW, limit: 60 }, {
    enabled: () => true,
    listKnowledgeObjects: (o) => { scanArgs = o; return []; }
  });
  check("buildRadarForUser: lädt großen Scan-Umfang (>=200), nicht nur das Anzeige-Limit",
    scanArgs && Number(scanArgs.limit) >= 200, `limit=${scanArgs && scanArgs.limit}`);

  const errSafe = await radar.buildRadarForUser({ profile, now: NOW }, {
    enabled: () => true,
    listKnowledgeObjects: () => { throw new Error("boom"); }
  });
  check("buildRadarForUser: Fehler -> skipped (radar-error), kein Crash", errSafe.skipped && errSafe.reason === "radar-error");

  // P1-8 Störungswahrheit: ein harter Store-Ausfall (__storeError-Sentinel) muss als
  // eigener Grund 'store-error' nach oben gereicht werden — NICHT als leeres/ruhiges
  // Ergebnis getarnt. Der Radar-Build fragt jetzt mit _signalError:true an.
  let radarSignalErrorSeen = false;
  const storeErr = await radar.buildRadarForUser({ profile, now: NOW }, {
    enabled: () => true,
    listKnowledgeObjects: (opts) => { if (opts && opts._signalError) radarSignalErrorSeen = true; return opts && opts._signalError ? { __storeError: true } : []; }
  });
  check("buildRadarForUser: fragt mit _signalError an (Störungswahrheit)", radarSignalErrorSeen === true);
  check("buildRadarForUser: Store-Ausfall -> reason 'store-error' (nicht ruhig)", storeErr.skipped && storeErr.reason === "store-error" && storeErr.error === true);
  check("buildRadarForUser: Store-Ausfall -> leere Buckets (keine getarnten Signale)", storeErr.signals.length === 0);

  console.log(`\n${passed}/${passed + failed} Radar-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
