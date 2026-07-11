"use strict";

// Helmut Core V3 — Tests fuer die Stabschef-Sprache (Sprach-Sprint).
// KEIN Netz, KEINE KI. Prueft ausschliesslich die SPRACH-/PROMPT-Vorbereitung:
//   1. briefingLanguage: drei Briefing-Typen + 'daily' vorhanden, typ-spezifische Sprache.
//   2. buildBriefingTypeInstruction: bekannter Typ -> Block, unbekannt -> 'daily' (leer).
//   3. buildUnderstandingPrompt: traegt Stabschef-Persona + Sprachverbote + Struct-Dimensionen.
//   4. Rueckwaertsverträglich: OHNE briefingType KEIN Typ-Block, DSGVO-Vertrag erhalten.
//   5. Keine Client-LLM-Calls, keine hartkodierte Partei/Person, keine Demo-Politik-Inhalte.

const bl = require("../lib/helmut/briefingLanguage");
const understanding = require("../lib/helmut/understanding");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Drei Briefing-Typen + Default 'daily' -------------------------------
check("BRIEFING_TYPE_KEYS traegt daily + morning + midday + evening",
  ["daily", "morning", "midday", "evening"].every((k) => bl.BRIEFING_TYPE_KEYS.includes(k)),
  bl.BRIEFING_TYPE_KEYS.join(","));
check("Jeder Typ hat key + label + instruction[]",
  bl.BRIEFING_TYPE_KEYS.every((k) => {
    const t = bl.BRIEFING_TYPES[k];
    return t && t.key === k && typeof t.label === "string" && Array.isArray(t.instruction);
  }));
check("Labels passen zur Client-Anzeige-Sprache (Morgen/Mittag/Abend-Briefing)",
  bl.BRIEFING_TYPES.morning.label === "Morgenbriefing" &&
  bl.BRIEFING_TYPES.midday.label === "Mittagsbriefing" &&
  bl.BRIEFING_TYPES.evening.label === "Abendbriefing");

// --- 2) Typ-spezifische Sprache ---------------------------------------------
const morning = bl.buildBriefingTypeInstruction("morning").join(" ");
const midday = bl.buildBriefingTypeInstruction("midday").join(" ");
const evening = bl.buildBriefingTypeInstruction("evening").join(" ");
check("Morgen: entscheidend/priorisierend/tagesbezogen", /priorisierend/.test(morning) && /Morgenbriefing/.test(morning));
check("Mittag: aktualisierend/korrigierend, NICHT neues Briefing",
  /aktualisierend/.test(midday) && /korrigierend/.test(midday) && /VERAENDERT/.test(midday));
check("Abend: vorausschauend/vorbereitend/morgenorientiert",
  /vorausschauend/.test(evening) && /vorbereitend/.test(evening) && /MORGEN/.test(evening));
check("Drei Typen sprechen tatsaechlich unterschiedlich (kein identischer Block)",
  morning !== midday && midday !== evening && morning !== evening);

// --- 3) normalizeBriefingType + Default-Verhalten ---------------------------
check("normalizeBriefingType: bekannter Typ bleibt", bl.normalizeBriefingType("EVENING") === "evening");
check("normalizeBriefingType: unbekannt/leer -> daily",
  bl.normalizeBriefingType("quatsch") === "daily" && bl.normalizeBriefingType("") === "daily" &&
  bl.normalizeBriefingType(undefined) === "daily");
check("daily traegt keinen zusaetzlichen Zwang (leere instruction)",
  bl.buildBriefingTypeInstruction("daily").length === 0 &&
  bl.buildBriefingTypeInstruction("quatsch").length === 0);

// --- 4) Prompt-Integration --------------------------------------------------
const cluster = { documents: [
  { title: "Bundestariftreuegesetz vorgelegt", summary: "Regierung legt Entwurf vor", source_name: "BMAS", published_at: "2026-07-10" }
] };
const base = understanding.buildUnderstandingPrompt(cluster);

// Stabschef-Persona + Ton (Grundprinzip A).
check("Prompt: Stabschef-Persona (an die/den Abgeordnete/n)", /politische[rn]? Stabschef/i.test(base));
check("Prompt: Rollenabgrenzung (kein Entwickler/Analyst/Monitoring)",
  /NICHT ein Entwickler, Analyst/i.test(base) || /NICHT ein Entwickler/i.test(base));
check("Prompt: professionelles Du im Ton", /professionellen Du/i.test(base));
// Sprachverbote (I).
check("Prompt: Sprachverbote-Block vorhanden", /SPRACHVERBOTE/.test(base));
check("Prompt: verbietet 'befasst sich mit' + reine Monitoring-Sprache",
  /befasst sich mit/i.test(base) && /Monitoring-Sprache/i.test(base));
// Kommunikations-Struktur (G): Zielgruppe/Kanal/Format/Tonalitaet/Aktion.
check("Prompt: Kommunikations-Dimensionen (Zielgruppe/Kanal/Format/Tonalitaet/Aktion)",
  /Zielgruppe, Kanal, Format, Tonalitaet und Aktion/.test(base));
check("Prompt: interne vs. externe Linie (nicht automatisch zuspitzen)",
  /INTERN/.test(base) && /EXTERN/.test(base));
// Nächste Schritte (H): starkes Verb + Verantwortungslogik.
check("Prompt: action_items beginnen mit starkem Verb + Verantwortungslogik",
  /BEGINNT mit einem starken Verb/.test(base) && /Fachreferat|Pressestelle|Buero/.test(base));

// --- 5) Rueckwaertsverträglichkeit: DSGVO-Vertrag + kein Typ-Block ohne opt --
check("Prompt: DSGVO-Anker fuer die Eval erhalten (oeffentlich handelnde politische Akteure)",
  /oeffentlich handelnde politische Akteure/i.test(base));
check("Prompt: mentioned_people-Anker erhalten", /mentioned_people/.test(base));
check("Prompt OHNE briefingType: KEIN typ-spezifischer Block (bleibt 'daily')",
  !/BRIEFING-TYP/.test(base));

const promptMorning = understanding.buildUnderstandingPrompt(cluster, { briefingType: "morning" });
const promptEvening = understanding.buildUnderstandingPrompt(cluster, { briefingType: "evening" });
check("Prompt MIT briefingType=morning: Morgen-Block angehaengt", /BRIEFING-TYP: Morgenbriefing/.test(promptMorning));
check("Prompt MIT briefingType=evening: Abend-Block angehaengt", /BRIEFING-TYP: Abendbriefing/.test(promptEvening));
check("Prompt MIT unbekanntem briefingType: KEIN Block (Default daily)",
  !/BRIEFING-TYP/.test(understanding.buildUnderstandingPrompt(cluster, { briefingType: "quatsch" })));
check("Prompt bleibt DSGVO-vollstaendig auch mit briefingType",
  /oeffentlich handelnde politische Akteure/i.test(promptMorning) && /mentioned_people/.test(promptMorning));

// --- 6) Keine Client-LLM-Calls / keine hartkodierte Partei / keine Demo-Politik --
const src = require("fs").readFileSync(require("path").join(__dirname, "..", "lib/helmut/briefingLanguage.js"), "utf8");
check("briefingLanguage.js macht KEINE KI-/Netz-Calls (kein fetch/require ai/openai)",
  !/\bfetch\b|require\(["']\.\/ai|openai|azure/i.test(src));
check("briefingLanguage.js enthaelt keine hartkodierte Partei/Person (Cem etc.)",
  !/cem|ince|\bspd\b|\bcdu\b|gruene|grüne|\blinke\b|\bafd\b|\bfdp\b/i.test(src));
// Beispielrichtungen sind SPRACHFORM (Tariftreue/Ausschuss generisch), keine konkrete Tagespolitik/Partei.
check("Beispielrichtungen tragen keine Parteizuordnung",
  !/cem|ince|\bspd\b|\bcdu\b|\bafd\b|\bfdp\b/i.test(JSON.stringify(bl.BRIEFING_TYPES)));

console.log(`\n${passed}/${passed + failed} Briefing-Sprache-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
