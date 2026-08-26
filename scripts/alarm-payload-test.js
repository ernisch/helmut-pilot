"use strict";

// P1-7 / Abnahmekriterium #10 — Alarm-Payload ohne Nutzer- oder Dokumentinhalte.
//
// Belegt: buildAlarmPayload/buildAlarmText erzeugen einen ALLOWLIST-Payload aus
// rein technischen Betriebsfeldern und redigieren den Statustext — es verlassen
// NIE Nutzerinhalte, Briefingtexte, politische Profile, Dokumentinhalte oder
// Secrets den Alarmkanal. Auch ein (fehlerhaft) mit Inhalt gefüllter Report darf
// nichts durchlassen. Nur synthetische Daten.
//
// Zusätzlich: die reine Auswertung des Meta-Heartbeats (evaluateHealthDryRun).

const { buildAlarmPayload, buildAlarmText } = require("../lib/helmut/alarm-payload");
const { evaluateHealthDryRun } = require("./health-watch-check");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const fakeEnv = { CRON_SECRET: "cronsecretFAKE1234567890", HELMUT_MONITORING_WEBHOOK_URL: "https://hook.example.invalid/SECRET" };

// Ein Report, dem jemand (fälschlich) Nutzer-/Dokumentinhalte + Secrets untergeschoben hat.
const report = {
  text: "Crawl: vor 2h (145 Quellen, 0 Fehler) · Briefing: 7 Einträge · Kontakt person@example.invalid · Bearer cronsecretFAKE1234567890",
  ok: false, state: "Veraltet", severity: "alarm",
  overdueCrons: ["Crawl"], googleUrlResolutionRate: 0.95,
  budget: { calls: 40, limit: 100, remaining: 60, skips: 5, exhausted: false },
  healthBlockers: ["budget-erschoepft"], healthWarnings: ["quellenfrische"], errors24: 3,
  // verbotene Felder (dürfen NIE in den Payload):
  briefingText: "VERTRAULICH: kompletter Briefingtext eines Nutzers",
  userEmail: "person@example.invalid",
  profile: { partei: "Die Linke", politicalProfile: "…" },
  documents: [{ title: "Interner Vorgang", content: "GEHEIM" }]
};

const payload = buildAlarmPayload(report, fakeEnv);

// ── ALLOWLIST: nur technische Felder ───────────────────────────────────────
const allowed = new Set(["source", "text", "ok", "state", "severity", "overdueCrons", "googleUrlResolutionRate", "budget", "healthBlockers", "healthWarnings", "errors24", "rollingCrawl"]);
const extraKeys = Object.keys(payload).filter((k) => !allowed.has(k));
check("Allowlist: keine Fremdfelder im Payload", extraKeys.length === 0, `extra: ${extraKeys.join(",")}`);
check("technische Felder vorhanden", payload.ok === false && payload.state === "Veraltet" && payload.budget.limit === 100);
check("keine verbotenen Felder (briefingText/userEmail/profile/documents)",
  !("briefingText" in payload) && !("userEmail" in payload) && !("profile" in payload) && !("documents" in payload));

// ── REDACTION: kein Secret/keine PII im Serialisat ─────────────────────────
const serialized = JSON.stringify(payload);
check("kein Briefing-Volltext im Payload", !serialized.includes("VERTRAULICH") && !serialized.includes("kompletter Briefingtext"));
check("kein Dokumentinhalt im Payload", !serialized.includes("GEHEIM") && !serialized.includes("Interner Vorgang"));
check("keine E-Mail im Payload (redigiert)", !serialized.includes("person@example.invalid"));
check("kein Secret/Bearer im Payload (redigiert)", !serialized.includes("cronsecretFAKE1234567890"));
check("keine Partei/politisches Profil im Payload", !serialized.includes("Die Linke"));

// ── Text-only-Kanal (WhatsApp) ebenfalls redigiert ─────────────────────────
const text = buildAlarmText(report, fakeEnv);
check("Text-Kanal: E-Mail redigiert", !text.includes("person@example.invalid"));
check("Text-Kanal: Secret redigiert", !text.includes("cronsecretFAKE1234567890"));
check("Text-Kanal: technischer Status bleibt lesbar", text.includes("145 Quellen") && text.includes("Briefing: 7"));

// ── Meta-Heartbeat-Auswertung (evaluateHealthDryRun) ───────────────────────
check("Heartbeat: grüner dryRun -> ok", evaluateHealthDryRun({ dryRun: true, ok: true, state: "Gesund" }).ok === true);
check("Heartbeat: nicht-grün -> Fehler", evaluateHealthDryRun({ dryRun: true, ok: false, state: "Veraltet" }).ok === false);
check("Heartbeat: kein dryRun -> Fehler", evaluateHealthDryRun({ ok: true }).ok === false);
check("Heartbeat: keine Antwort -> Fehler", evaluateHealthDryRun(null).ok === false);

// ── KAPPUNG BEI 2000 ZEICHEN ZERSCHNEIDET KEIN ZEICHEN ──────────────────────
// Belegter Anlass (Abnahme 26.08., im echten Routentest bei fuenf Mandaten
// aufgetreten): der Statustext traegt Emojis (⏰ 🧮 👤 📲). Faellt der Schnitt
// mitten in ein Ersatzzeichenpaar, bleibt ein ALLEINSTEHENDES Surrogat stehen.
// `encodeURIComponent` wirft darauf `URIError: URI malformed` — im CallMeBot-
// Versand ausserhalb jedes try/catch, wodurch der GESAMTE Gesundheitslauf mit
// 500 abbrach, statt nur den WhatsApp-Kanal zu verlieren.
{
  // Genau 1999 harmlose Zeichen, danach ein Emoji: der Schnitt bei 2000 landet
  // zwischen den beiden Haelften des Ersatzzeichenpaars.
  const boese = "a".repeat(1999) + "📲" + "b".repeat(50);
  const gekappt = buildAlarmText({ text: boese }, fakeEnv);
  check("Kappung laesst kein alleinstehendes Ersatzzeichen zurueck",
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(gekappt)
      && !/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(gekappt), JSON.stringify(gekappt.slice(-6)));
  let wirft = null;
  try { encodeURIComponent(gekappt); } catch (error) { wirft = error; }
  check("der gekappte Text ist URL-kodierbar (kein URIError im WhatsApp-Versand)",
    wirft === null, String(wirft && wirft.message));
  check("die Kappung greift trotzdem (hoechstens 2000 Zeichen)", gekappt.length <= 2000, String(gekappt.length));
  // Gegenprobe: die naive Kappung waere genau hier gescheitert.
  let naivWirft = null;
  try { encodeURIComponent(boese.slice(0, 2000)); } catch (error) { naivWirft = error; }
  check("Gegenprobe: die naive Kappung haette geworfen (der Fehler war echt)",
    naivWirft !== null, "naive Kappung warf keinen Fehler — Testfall greift nicht mehr");
  // Auch der Payload-Text laeuft ueber dieselbe Kappung.
  const payloadText = buildAlarmPayload({ text: boese }, fakeEnv).text;
  let payloadWirft = null;
  try { encodeURIComponent(payloadText); } catch (error) { payloadWirft = error; }
  check("auch der Webhook-Payloadtext bleibt kodierbar", payloadWirft === null);
}

console.log(`\n${passed}/${passed + failed} Alarm-Payload-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
