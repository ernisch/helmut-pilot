"use strict";

// Helmut — AUSWERTUNG DER GATE-SHADOW-TELEMETRIE (OP-30, Phase 7 · Messbasis fuer OP-18).
// =============================================================================================
// DER BEFUND, DER DIESES SKRIPT AUSGELOEST HAT (2026-08-08, im Repository nachgeprueft):
//
//   Die Tabelle `gate_shadow_events` wird seit dem 2026-07-16 BESCHRIEBEN
//   (`storage.recordGateShadowEvents`) — und von KEINER Stelle im Repository GELESEN.
//   Es gibt keinen einzigen `select` darauf: weder ein Skript, noch eine Route, noch ein
//   Bericht. Gesucht wurde ueber das ganze Repository; die Treffer sind ausschliesslich
//   Migrationen, Rechte-Haertungen, Backup-Export und Restore-Uebung.
//
//   OP-18 nennt als seine eigene Abhaengigkeit "Telemetrie/Beweisprotokoll als Messbasis"
//   und begruendet den Status mit "Shadow-Betrieb seit Wochen fehlerfrei". Der DAUERBETRIEB
//   ist belegt (37 792 Zeilen am 2026-07-28 gegen 1 000 am 2026-07-15). Die FEHLERFREIHEIT
//   dieses Zeitraums ist es NICHT: ausgewertet wurden nur zwei Laeufe vom 14./15.07., und
//   seither hat niemand die Tabelle gelesen. Zwischen "es ist nichts aufgefallen" und "es
//   ist nichts passiert" liegt genau dieses Skript.
//
// WAS ES TUT: es liest — und sonst nichts.
// WAS ES NICHT TUT: es schaltet nichts scharf, aendert kein Flag, schreibt keine Zeile,
// ruft keine KI und keine externe Quelle. Die Entscheidung ueber `HELMUT_UNDERSTANDING_GATE=on`
// bleibt freigabepflichtig und liegt beim Betreiber (OP-18, Freigabe JA).
//
// AUFRUF:
//   HELMUT_GATE_AUSWERTUNG_ZUGRIFF=ja node scripts/gate-shadow-auswertung.js [--tage=14]
// OHNE diesen Schalter liest das Skript NICHTS (fail closed, siehe Riegel unten).
// Zugangsdaten kommen ausschliesslich aus `process.env` (CLAUDE.md §9) — dieses Skript
// parst keine .env-Datei und enthaelt keine Geheimnisse.
// OHNE Zugangsdaten meldet es den Nachweis ausdruecklich als OFFEN und faellt NICHT gruen ab.

const path = require("path");
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const TAGE = Number((args.find((a) => a.startsWith("--tage=")) || "--tage=14").split("=")[1]) || 14;
const z = (n) => Number(n || 0).toLocaleString("de-DE");
const prozent = (t, g) => (g > 0 ? `${(t / g * 100).toFixed(1)} %` : "—");

// Die Entscheidungen, die das Gate kennt (lib/helmut/quellenarchitektur/understanding-gate.js).
const ENTSCHEIDUNGEN = ["verstehen", "zurueckstellen", "parken", "unveraendert", "hygiene"];

function abschnitt(t) { console.log(`\n== ${t} ==`); }

// HARTER RIEGEL, fail closed. BELEGTER ANLASS (2026-08-08): beim ersten Testaufruf dieses
// Skripts lagen SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in der Umgebung — der Aufruf ging
// damit ungewollt gegen die PRODUCTION-Datenbank (ein lesendes SELECT, 1 000 Zeilen). Ein
// Skript, das Zugangsdaten nur VORFINDET, greift frueher oder spaeter versehentlich zu.
// Deshalb reicht das Vorhandensein von Zugangsdaten NICHT: der Zugriff muss AUSDRUECKLICH
// eingeschaltet werden. Ohne diesen Schalter liest dieses Skript nichts.
function zugriffAusdruecklichErlaubt(env = process.env) {
  return String(env.HELMUT_GATE_AUSWERTUNG_ZUGRIFF || "").trim().toLowerCase() === "ja";
}

async function hole(pfad) {
  if (!zugriffAusdruecklichErlaubt()) return { gesperrt: true };
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) return { fehlt: true };
  const res = await fetch(`${url}/rest/v1/${pfad}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${String(await res.text()).slice(0, 200)}`);
  return { zeilen: await res.json() };
}

function werte(zeilen) {
  const seit = new Date(Date.now() - TAGE * 86400000);
  const imFenster = zeilen.filter((r) => new Date(r.created_at) >= seit);

  const jeEntscheidung = {};
  for (const e of ENTSCHEIDUNGEN) jeEntscheidung[e] = 0;
  const jeGrund = {};
  const jeTier = {};
  let amtlich = 0;
  let amtlichNichtVerstanden = 0;
  const amtlichBeispiele = [];
  const tage = new Set();

  for (const r of imFenster) {
    const e = String(r.gate_decision || "");
    jeEntscheidung[e] = (jeEntscheidung[e] || 0) + 1;
    const g = String(r.gate_reason || "(ohne Grund)");
    jeGrund[g] = (jeGrund[g] || 0) + 1;
    const t = String(r.tier || "(ohne)");
    jeTier[t] = (jeTier[t] || 0) + 1;
    tage.add(String(r.created_at || "").slice(0, 10));
    if (r.amtlich === true) {
      amtlich += 1;
      // DIE ENTSCHEIDENDE FRAGE: haette das Gate ein AMTLICHES Dokument blockiert?
      if (e !== "verstehen" && e !== "unveraendert") {
        amtlichNichtVerstanden += 1;
        if (amtlichBeispiele.length < 10) {
          amtlichBeispiele.push({ id: r.raw_document_id, entscheidung: e, grund: r.gate_reason, tier: r.tier });
        }
      }
    }
  }
  return { imFenster, jeEntscheidung, jeGrund, jeTier, amtlich, amtlichNichtVerstanden, amtlichBeispiele, tage };
}

async function main() {
  console.log("Helmut — Auswertung der Gate-Shadow-Telemetrie (Messbasis fuer OP-18)");
  console.log(`  Fenster: letzte ${TAGE} Tage · REIN LESEND · kein Flag wird veraendert\n`);

  let daten = null;
  try {
    daten = await hole(`gate_shadow_events?select=*&order=created_at.desc&limit=100000`);
  } catch (e) {
    console.log(`  ZUGRIFF FEHLGESCHLAGEN: ${e.message}`);
    console.log("  Der Nachweis ist damit OFFEN. Es wird KEIN Ergebnis behauptet.");
    process.exit(2);
  }
  if (daten.gesperrt) {
    console.log("  ZUGRIFF GESPERRT (Standard). Dieses Skript liest NICHTS, solange nicht");
    console.log("  ausdruecklich HELMUT_GATE_AUSWERTUNG_ZUGRIFF=ja gesetzt ist.");
    console.log("");
    console.log("  Der Grund steht im Kopf der Datei: Zugangsdaten liegen in manchen Sitzungen");
    console.log("  einfach in der Umgebung. Ein Skript, das sie nur vorfindet und losliest,");
    console.log("  greift irgendwann auf Production zu, ohne dass es jemand wollte.");
    console.log("");
    console.log("  >> Der Nachweis ist OFFEN. Das ist KEIN gruenes Ergebnis.");
    process.exit(2);
  }
  if (daten.fehlt) {
    console.log("  KEINE Zugangsdaten in der Umgebung (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    console.log("  Dieses Skript liest ausschliesslich aus process.env und fragt NICHT nach.");
    console.log("\n  >> Der Nachweis ist OFFEN. Das ist KEIN gruenes Ergebnis, sondern ein");
    console.log("     fehlender Messwert. In einer Sitzung mit Zugangsdaten erneut aufrufen.");
    process.exit(2);
  }

  const zeilen = Array.isArray(daten.zeilen) ? daten.zeilen : [];
  if (!zeilen.length) {
    console.log("  Die Tabelle ist LEER. Entweder lief das Gate nie im Shadow-Modus, oder die");
    console.log("  Aufbewahrung hat alles entfernt. Beides ist ein Befund, kein Erfolg.");
    process.exit(2);
  }

  const a = werte(zeilen);
  const g = a.imFenster.length;

  abschnitt("1 · Umfang");
  console.log(`    Zeilen gesamt in der Tabelle ...... ${z(zeilen.length)}`);
  console.log(`    davon im Fenster (${TAGE} Tage) ......... ${z(g)}`);
  console.log(`    abgedeckte Kalendertage ........... ${a.tage.size}`);
  console.log(`    aeltester Eintrag ................. ${zeilen[zeilen.length - 1] && zeilen[zeilen.length - 1].created_at}`);
  console.log(`    juengster Eintrag ................. ${zeilen[0] && zeilen[0].created_at}`);
  if (zeilen.length >= 100000) {
    console.log("    ACHTUNG: die Abfragegrenze wurde erreicht — die Zahlen sind ABGESCHNITTEN.");
  }

  abschnitt("2 · Wie haette das Gate entschieden?");
  for (const e of ENTSCHEIDUNGEN) {
    console.log(`    ${e.padEnd(16)} ${String(z(a.jeEntscheidung[e])).padStart(8)}  ${prozent(a.jeEntscheidung[e], g)}`);
  }
  const blockiert = a.jeEntscheidung.zurueckstellen + a.jeEntscheidung.parken;
  console.log(`    ${"-".repeat(40)}`);
  console.log(`    ${"blockiert (zurueckstellen+parken)".padEnd(16)} ${String(z(blockiert)).padStart(8)}  ${prozent(blockiert, g)}`);
  console.log("    Das ist die ERSPARNIS, die eine Scharfschaltung braechte — und zugleich");
  console.log("    das Volumen, das dann NICHT mehr verstanden wuerde.");

  abschnitt("3 · Die entscheidende Frage: amtliche Dokumente");
  console.log(`    amtliche Dokumente im Fenster ..... ${z(a.amtlich)}`);
  console.log(`    davon NICHT zum Verstehen gefuehrt  ${z(a.amtlichNichtVerstanden)}  ${prozent(a.amtlichNichtVerstanden, a.amtlich)}`);
  if (a.amtlichNichtVerstanden > 0) {
    console.log("\n    >> BEFUND: das Gate haette amtliche Dokumente blockiert. Die Zusage");
    console.log("       \"0 amtliche fehlbehandelt\" gilt fuer dieses Fenster NICHT.");
    console.log("       Beispiele:");
    for (const b of a.amtlichBeispiele) {
      console.log(`         ${String(b.id).padEnd(24)} ${String(b.entscheidung).padEnd(14)} ${b.grund || ""} (${b.tier || "?"})`);
    }
  } else if (a.amtlich === 0) {
    console.log("\n    >> Im Fenster ist KEIN amtliches Dokument enthalten. Damit ist die Zusage");
    console.log("       fuer dieses Fenster WEDER bestaetigt NOCH widerlegt — sie ist ungeprueft.");
  } else {
    console.log("\n    >> Kein amtliches Dokument wurde blockiert. Das bestaetigt die Zusage");
    console.log(`       fuer dieses Fenster (${z(a.amtlich)} amtliche Dokumente).`);
  }

  abschnitt("4 · Gruende");
  for (const [grund, n] of Object.entries(a.jeGrund).sort((x, y) => y[1] - x[1]).slice(0, 15)) {
    console.log(`    ${grund.padEnd(32)} ${String(z(n)).padStart(8)}  ${prozent(n, g)}`);
  }

  abschnitt("5 · Herkunft (tier)");
  for (const [t, n] of Object.entries(a.jeTier).sort((x, y) => y[1] - x[1])) {
    console.log(`    ${t.padEnd(16)} ${String(z(n)).padStart(8)}  ${prozent(n, g)}`);
  }

  abschnitt("6 · Was das fuer OP-18 bedeutet");
  const genugTage = a.tage.size >= 7;
  const genugZeilen = g >= 1000;
  const keineAmtlichenBlockiert = a.amtlichNichtVerstanden === 0 && a.amtlich > 0;
  console.log(`    Beobachtungsfenster >= 7 Tage ..... ${genugTage ? "ja" : "NEIN"}  (${a.tage.size})`);
  console.log(`    Stichprobe >= 1 000 Zeilen ........ ${genugZeilen ? "ja" : "NEIN"}  (${z(g)})`);
  console.log(`    kein amtliches Dokument blockiert . ${keineAmtlichenBlockiert ? "ja" : "NEIN"}  (${z(a.amtlichNichtVerstanden)} von ${z(a.amtlich)})`);
  const tragfaehig = genugTage && genugZeilen && keineAmtlichenBlockiert;
  console.log(`\n    Messbasis fuer eine Freigabeentscheidung ... ${tragfaehig ? "TRAGFAEHIG" : "NICHT TRAGFAEHIG"}`);
  console.log("\n    AUSDRUECKLICH: auch eine tragfaehige Messbasis ist KEINE Freigabe. OP-18 ist");
  console.log("    freigabepflichtig; dieses Skript aendert nichts und empfiehlt nichts.");

  process.exit(0);
}

main().catch((e) => { console.error("FEHLER:", e && e.message); process.exit(1); });
