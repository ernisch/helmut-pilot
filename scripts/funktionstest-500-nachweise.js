#!/usr/bin/env node
"use strict";

// Helmut — CLI der REPRODUZIERBAREN AUSWERTER (A01, A06, A10).
// =============================================================================
// Rein LESEND. Dieses Werkzeug schreibt nichts, ruft kein Modell auf und kennt
// keinen scharfen Modus. Es liest den Auth-Store und rechnet daraus die drei
// Messwerte aus, die vorher nur als menschliche Zusage vorlagen.
//
// Aufruf:
//   node scripts/funktionstest-500-nachweise.js --seit=2026-09-10T00:00:00Z
//   node scripts/funktionstest-500-nachweise.js --seit=... --bis=... --json
//   node scripts/funktionstest-500-nachweise.js --datei=auth-store.json --seit=...
//
// Ohne `--datei` liest es den Auth-Store über `storage` — das braucht
// Production-Kennungen in der Umgebung und ist deshalb bewusst NICHT der
// Standardweg dieses Sprints. Mit `--datei` arbeitet es über einem rein lesend
// erhobenen Abzug und ist damit vollständig offline nachvollziehbar.

const fs = require("fs");
const N = require("../lib/helmut/funktionstest-nachweise");

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : null;
}

function zeitpunkt(text, vorgabe) {
  if (!text) return vorgabe;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) {
    console.error(`Zeitpunkt "${text}" ist kein gültiger ISO-Zeitpunkt.`);
    process.exit(2);
  }
  return ms;
}

async function liesAuthStore(datei) {
  if (datei) {
    const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    // Ein Abzug darf entweder der Store selbst sein oder ihn unter `data` tragen.
    return roh && roh.data && typeof roh.data === "object" ? roh.data : roh;
  }
  const storage = require("../lib/helmut/storage");
  if (typeof storage.readAuthStoreFuerNachweis === "function") {
    return storage.readAuthStoreFuerNachweis();
  }
  console.error(
    "Ohne --datei bräuchte dieses Werkzeug einen direkten Auth-Store-Zugriff mit\n"
    + "Production-Kennungen. Das ist in diesem Sprint ausdrücklich nicht vorgesehen.\n"
    + "Erhebe den Store rein lesend und übergib den Abzug mit --datei=<pfad>."
  );
  process.exit(2);
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const datei = argument(argv, "datei");
  const jetzt = Date.now();
  const vonMs = zeitpunkt(argument(argv, "seit"), jetzt - 24 * 3600 * 1000);
  const bisMs = zeitpunkt(argument(argv, "bis"), jetzt);

  const store = await liesAuthStore(datei);
  const nutzung = N.werteNutzungslogAus({
    eintraege: store && store.llmUsage,
    vonMs,
    bisMs,
    ringMax: require("../lib/helmut/storage").LLM_USAGE_RING_MAX
  });
  const kommunikation = N.werteKommunikationsspurenAus({
    auditEvents: store && store.auditEvents,
    // Die Push-Ereignisse liegen je Mandant in `p-<mandat>.pushEvents`. Der Abzug
    // muss sie zusammengefuehrt und mit `politicianId` mitliefern — sonst bleibt
    // der Push-Kanal ausdruecklich UNGEMESSEN (und nicht etwa "0").
    pushEreignisse: (store && store.pushEreignisse) || (store && store.pushEvents) || null,
    // Zeilen aus `public.helmut_job_outbox`, je Zeile mit `tenantId`.
    jobOutbox: (store && store.jobOutbox) || null,
    vonMs,
    bisMs
  });

  if (argv.includes("--json")) {
    // Genau die Form, die `funktionstest-kontrolle.kontrolliere` erwartet.
    console.log(JSON.stringify({ modellaufrufe: nutzung, riegel: kommunikation }, null, 2));
    return;
  }

  console.log(`\n=== Fenster ${new Date(vonMs).toISOString()} bis ${new Date(bisMs).toISOString()} ===`);
  console.log("\n--- A01 / A06 · Nutzungslog ---");
  console.log(JSON.stringify(nutzung, null, 2));
  console.log("\n--- A10 · Kommunikationsspuren ---");
  console.log(JSON.stringify(kommunikation, null, 2));

  const offen = [];
  if (!nutzung.auswertbar) offen.push(`A01/A06 nicht auswertbar: ${nutzung.grund}`);
  if (!kommunikation.auswertbar) offen.push(`A10 nicht auswertbar: ${kommunikation.grund}`);
  if (kommunikation.auswertbar && kommunikation.vollstaendig === false) {
    offen.push(`A10 unvollständig: ${kommunikation.hinweis}`);
  }
  if (kommunikation.auswertbar) {
    console.log(`\nHINWEIS zu A10: bauartbedingt NICHT messbar sind `
      + `${kommunikation.nichtMessbar.join(", ")}. Dort ist eine 0 kein Freispruch, `
      + "sondern eine fehlende Messung.");
  }
  if (offen.length) {
    console.log("\nOFFEN (fail closed — die betroffenen Regeln bleiben unbewertbar):");
    for (const o of offen) console.log(`  · ${o}`);
    process.exit(1);
  }
  console.log("\nAlle drei Messwerte sind aus persistierten Daten gerechnet, nicht zugesagt.");
}

main().catch((fehler) => {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
});
