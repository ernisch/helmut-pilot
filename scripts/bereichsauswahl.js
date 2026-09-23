"use strict";

// Helmut — KANONISCHE BEREICHSZUORDNUNG für die automatische PR-Regression.
// =============================================================================================
// WOZU: Der Pflichtlauf führt nur die STANDARD-Kernmenge aus (scripts/run-offline-tests.js).
// Damit eine Änderung an einer Fachdomäne nicht ungeprüft bleibt, wählt diese Datei anhand
// der TATSÄCHLICH geänderten Dateien die zusätzlich nötigen Fach-Regressionstests aus.
//
// GRUNDSÄTZE:
//   * Deterministisch und explizit — keine KI, keine stille Heuristik.
//   * Genau EINE kanonische Stelle für die Zuordnung (diese Datei). CI und Runner lesen sie.
//   * Drei Ebenen: STANDARD (immer, im Runner), BEREICH (hier ausgewählt), EXTENDED (alles).
//   * Ein Test wird über seinen DATEINAMEN einem Bereich zugeordnet (siehe `suiten`).
//     Ein neuer Fachtest heißt also z. B. `briefing-…-test.js` und gehört damit automatisch
//     zum Bereich `briefing`; `lage-…-test.js` zu `lage` usw. Bewusst Standard bleibt nur,
//     was im Runner in STANDARD steht; alles andere ohne Bereichstreffer ist extended-only.
//
// FAIL CLOSED: Eine fachlich relevante Datei, die keiner Regel entspricht, wird NICHT still
// übersprungen, sondern als `unbekannt` gemeldet; der Runner fährt dann die konservative
// Sammelmenge (alle Bereiche). Dasselbe gilt für zentrale/geteilte Kerndateien (KERN).
//
// Aufruf (nur zur Ansicht):  node scripts/bereichsauswahl.js --liste

// ── KERN: geteilte Kerndateien. Eine Änderung hier kann fast jeden Bereich betreffen → der
// Runner fährt konservativ ALLE Bereiche (nicht die Extended-Suite). ─────────────────────────
const KERN = [
  /(^|\/)lib\/helmut\/storage\.js$/i,
  /(^|\/)lib\/helmut\/config\.js$/i,
  /(^|\/)lib\/helmut\/flags\.js$/i,
  /(^|\/)lib\/helmut\/llm-budget(-fair)?\.js$/i,
  /(^|\/)lib\/helmut\/production-schreibgate\.js$/i,
  /(^|\/)lib\/helmut\/tenant-context\.js$/i,
  /(^|\/)lib\/helmut\/redact\.js$/i,
  /(^|\/)scripts\/bereichsauswahl\.js$/i,
  /(^|\/)scripts\/run-offline-tests\.js$/i,
  /(^|\/)\.github\/workflows\/ci\.yml$/i
];

// ── SAMMELDATEIEN: große Dateien, die viele Fachdomänen bedienen. Sie dürfen NICHT die
// gesamte Regression auslösen, sondern nur den kleinen konservativen Satz SAMMEL_BEREICHE. ──
const SAMMELDATEIEN = [
  /(^|\/)server\.js$/i,
  /(^|\/)client\.js$/i,
  /(^|\/)sw\.js$/i,
  /(^|\/)api\/index\.js$/i,
  /(^|\/)lambda\//i,
  /(^|\/)styles\.css$/i,
  /(^|\/)index\.html$/i
];
const SAMMEL_BEREICHE = [
  "briefing", "lage", "quellen", "admin", "profil", "auth", "ui", "warteschlange-pipeline"
];

// ── Die Bereiche. `quelle` = Auslöser (geänderte Quelldatei), `suiten` = zugehörige Tests. ──
const BEREICHE = {
  briefing: {
    quelle: [/(^|\/)lib\/helmut\/briefing/i, /(^|\/)lib\/helmut\/morgenversorgung\.js$/i,
      /(^|\/)lib\/helmut\/empfehlungs-text\.js$/i],
    suiten: [/^briefing/i, /^morgen/i, /^ereignisbindung-heute/i, /^contract-adapter/i,
      /^ergebnisstand-vertrag/i, /^decisions/i]
  },
  lage: {
    quelle: [/(^|\/)lib\/helmut\/lage/i],
    suiten: [/^lage/i]
  },
  radar: {
    quelle: [/(^|\/)lib\/helmut\/radar/i],
    suiten: [/^radar/i]
  },
  quellen: {
    quelle: [/(^|\/)lib\/helmut\/quellenarchitektur\//i, /(^|\/)lib\/helmut\/scheduler\.js$/i,
      /(^|\/)lib\/helmut\/dedup\.js$/i, /(^|\/)lib\/helmut\/crawler\.js$/i,
      /(^|\/)lib\/helmut\/google-news-hardening/i, /(^|\/)lib\/helmut\/sources\.js$/i,
      /(^|\/)lib\/helmut\/source-/i, /(^|\/)lib\/helmut\/sourceSafety/i,
      /(^|\/)lib\/helmut\/artikelkontext/i, /(^|\/)lib\/helmut\/herausgeber/i,
      /(^|\/)lib\/helmut\/quellen-/i, /(^|\/)lib\/helmut\/dip/i,
      /(^|\/)lib\/helmut\/blob-relational/i, /(^|\/)lib\/helmut\/crawl-run-state/i,
      /(^|\/)lib\/helmut\/retention/i],
    suiten: [/^quellen/i, /^source/i, /^dedup/i, /^crawler/i, /^google-news/i, /^herausgeber/i,
      /^artikelkontext/i, /^dip-/i, /^quellentitel/i, /^incident-crawl/i, /^globalabruf/i,
      /^globalphase/i, /^shadow-/i, /^vorgang/i, /^seed-drift/i, /^seed-restore/i]
  },
  verstehen: {
    quelle: [/(^|\/)lib\/helmut\/understanding/i, /(^|\/)lib\/helmut\/verstehen/i,
      /(^|\/)lib\/helmut\/lazyUnderstanding/i, /(^|\/)lib\/helmut\/ko-/i,
      /(^|\/)lib\/helmut\/embedding/i],
    suiten: [/^understanding/i, /^verstehen/i, /^gate-/i, /^nachklassifikation/i, /^ko-/i,
      /^embedding/i]
  },
  profil: {
    quelle: [/(^|\/)lib\/helmut\/profil/i, /(^|\/)lib\/helmut\/profile-/i,
      /(^|\/)lib\/helmut\/accounts\.js$/i, /(^|\/)lib\/helmut\/provisioning/i,
      /(^|\/)lib\/helmut\/mandatsklasse/i, /(^|\/)lib\/helmut\/office\.js$/i],
    suiten: [/^profil/i, /^profile-/i, /^onboarding/i, /^provision/i, /^drei-profile/i,
      /^session-profil/i, /^mandatsklasse/i]
  },
  auth: {
    quelle: [/(^|\/)lib\/helmut\/auth/i, /(^|\/)lib\/helmut\/invite-mail/i,
      /(^|\/)lib\/helmut\/reset-timing/i],
    suiten: [/^auth/i, /^login/i, /^invite/i, /^reset-/i, /^passwort/i, /^tenant-/i, /^jwt-/i]
  },
  admin: {
    quelle: [/(^|\/)lib\/helmut\/admin/i, /(^|\/)lib\/helmut\/monitoring-webhook/i],
    suiten: [/^admin/i]
  },
  "matching-scoring": {
    quelle: [/(^|\/)lib\/helmut\/matching/i, /(^|\/)lib\/helmut\/scoring/i,
      /(^|\/)lib\/helmut\/relevanzordnung/i],
    suiten: [/^matching/i, /^scoring/i, /^relevanzordnung/i]
  },
  ui: {
    quelle: [/(^|\/)client\.js$/i, /(^|\/)styles\.css$/i, /(^|\/)index\.html$/i,
      /(^|\/)sw\.js$/i, /(^|\/)lib\/helmut\/templates\//i, /(^|\/)lib\/helmut\/kalender\//i,
      /(^|\/)lib\/helmut\/push\.js$/i],
    suiten: [/-ui-test\.js$/i, /^helmut-tab-ui/i, /^splash-boot/i, /^orientation-lock/i,
      /^pwa-icon/i, /^kalender-ics/i, /^backend-refresh/i]
  },
  "landesmodule-pardok": {
    quelle: [/(^|\/)lib\/helmut\/landes/i, /(^|\/)landesparser/i, /(^|\/)pardok/i,
      /(^|\/)lib\/helmut\/berlin/i, /(^|\/)lib\/helmut\/brandenburg/i],
    suiten: [/^landes/i, /^pardok/i, /^berlin/i, /^brandenburg/i, /^parlamentszusammensetzung/i,
      /^profilpaket-berlin/i]
  },
  "warteschlange-pipeline": {
    quelle: [/(^|\/)lib\/helmut\/job-dispatch/i, /(^|\/)lib\/helmut\/jobqueue/i,
      /(^|\/)lib\/helmut\/queue-verbraucher/i, /(^|\/)lib\/helmut\/scalable-pipeline/i,
      /(^|\/)lib\/helmut\/worker-betrieb/i, /(^|\/)lib\/helmut\/source-demand/i,
      /(^|\/)lib\/helmut\/cron-/i, /(^|\/)lib\/helmut\/minimal-cron/i,
      /(^|\/)lib\/helmut\/outbox-relay/i, /(^|\/)lib\/helmut\/watchdog-state/i,
      /(^|\/)lib\/helmut\/pipeline-status/i, /(^|\/)lib\/helmut\/motor-health/i,
      /(^|\/)lib\/helmut\/rolling-health/i, /(^|\/)lib\/helmut\/health-axes/i,
      /(^|\/)lib\/helmut\/lauf-bilanz/i, /(^|\/)lib\/helmut\/pending-terminal/i],
    suiten: [/^jobqueue/i, /^jobdispatch/i, /^queue-/i, /^warteschlange/i, /^outbox-/i,
      /^pipeline-/i, /^cron-/i, /^worker-/i, /^scalable-pipeline/i, /^source-demand/i,
      /^selbstweck/i, /^minimal-cron/i, /^durchsatz-/i, /^motor-health/i, /^rolling-health/i,
      /^health-/i, /^lauf-bilanz/i, /^pending-terminal/i, /^verteilte-grenzen/i]
  },
  "datenbank-migration": {
    quelle: [/(^|\/)supabase\/migrations\//i],
    suiten: [/-datenbank-test\.js$/i, /^migrations-/i, /^op30-migrationskette/i, /^sprint6-/i]
  },
  prosa: {
    quelle: [/(^|\/)lib\/helmut\/prosa/i],
    suiten: [/^prosa/i]
  },
  b055: {
    quelle: [/(^|\/)lib\/helmut\/b055/i],
    suiten: [/^b055/i, /^github-b055/i]
  },
  "500-nachweis": {
    quelle: [/(^|\/)lib\/helmut\/testkohorte/i, /(^|\/)lib\/helmut\/testfenster/i,
      /(^|\/)lib\/helmut\/testkosten/i, /(^|\/)lib\/helmut\/testnachweis/i,
      /(^|\/)lib\/helmut\/funktionstest/i, /(^|\/)lib\/helmut\/kapazitaet-500/i,
      /(^|\/)lib\/helmut\/verstehen-/i],
    suiten: [/^testkohorte/i, /^test-kohorte/i, /^testfenster/i, /^testkosten/i, /^testnachweis/i,
      /^funktionstest/i, /^kapazitaet-500/i, /^verstehen-/i, /^github-.*500/i,
      /^github-null500/i, /^github-testfenster/i, /^github-briefingnachweis/i,
      /^github-privater-inhaltsnachweis/i, /^github-quellenkontext/i, /^github-direkt500/i]
  }
};

// ── „Fachlich relevant" (fail-closed). Dokumentation/Konfiguration ist NICHT relevant. ──────
const NICHT_RELEVANT = [
  /\.md$/i, /(^|\/)docs\//i, /(^|\/)audit\//i, /(^|\/)belege\//i, /(^|\/)archive\//i,
  /(^|\/)AGENTS\.md$/i, /(^|\/)CLAUDE\.md$/i, /(^|\/)README/i, /(^|\/)LICENSE/i,
  /(^|\/)\.git/i, /(^|\/)\.github\//i, /(^|\/)\.devcontainer\//i, /(^|\/)\.gitignore$/i,
  /(^|\/)package(-lock)?\.json$/i, /(^|\/)vercel\.json$/i, /(^|\/)\.env/i, /(^|\/)\.vscode\//i
];
const RELEVANT = [
  /(^|\/)lib\//i, /(^|\/)scripts\//i, /(^|\/)api\//i, /(^|\/)lambda\//i, /(^|\/)supabase\//i,
  /(^|\/)assets\//i, /(^|\/)server\.js$/i, /(^|\/)client\.js$/i, /(^|\/)sw\.js$/i,
  /(^|\/)styles\.css$/i, /(^|\/)index\.html$/i
];

function passt(datei, muster) {
  return muster.some((r) => r.test(datei));
}

function istRelevant(datei) {
  if (passt(datei, NICHT_RELEVANT)) return false;
  return passt(datei, RELEVANT);
}

// Wertet die geänderten Dateien aus. Liefert die betroffenen Bereiche, ob eine geteilte
// Kerndatei (querschnitt) geändert wurde, und die fachlich relevanten, aber nicht zuordenbaren
// Dateien (unbekannt — fail closed).
function analysiere(dateien) {
  const bereiche = new Set();
  let querschnitt = false;
  const unbekannt = [];

  for (const roh of dateien) {
    const datei = String(roh || "").trim();
    if (!datei) continue;
    if (passt(datei, KERN)) { querschnitt = true; continue; }
    if (passt(datei, SAMMELDATEIEN)) { for (const b of SAMMEL_BEREICHE) bereiche.add(b); continue; }
    let getroffen = false;
    for (const [name, def] of Object.entries(BEREICHE)) {
      if (passt(datei, def.quelle)) { bereiche.add(name); getroffen = true; }
    }
    if (getroffen) continue;
    if (istRelevant(datei)) unbekannt.push(datei);
  }

  return { bereiche: [...bereiche].sort(), querschnitt, unbekannt: unbekannt.sort() };
}

// Die Suiten eines Bereichs (Dateinamen aus der gesammelten Liste).
function suitenFuerBereiche(alleSuiten, bereiche) {
  const muster = [];
  for (const b of bereiche) {
    const def = BEREICHE[b];
    if (!def) throw new Error(`Unbekannter Bereich: ${b}`);
    muster.push(...def.suiten);
  }
  return alleSuiten.filter((f) => passt(f, muster)).sort();
}

// Gesamtergebnis für geänderte Dateien: Bereiche, Konservativ-Flag, unbekannte Dateien und die
// auszuführenden Bereichs-Suiten OHNE die Standardmenge (keine Doppelläufe).
function bereichsSuiten(dateien, alleSuiten, standardSet) {
  const info = analysiere(dateien);
  let ziele = info.bereiche;
  let konservativ = false;
  if (info.querschnitt || info.unbekannt.length) {
    ziele = Object.keys(BEREICHE).sort();
    konservativ = true;
  }
  const alle = suitenFuerBereiche(alleSuiten, ziele);
  const suiten = alle.filter((f) => !standardSet.has(f));
  return { bereiche: info.bereiche, zielBereiche: ziele, konservativ,
    unbekannt: info.unbekannt, querschnitt: info.querschnitt, suiten };
}

// ── Ansicht (nur zur Kontrolle) ─────────────────────────────────────────────────────────────
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const ROOT = path.join(__dirname, "..");
  const alle = fs.readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => f.endsWith("-test.js") || f.endsWith("gesamttest.js") || f === "p1-security-check.js")
    .sort();
  for (const name of Object.keys(BEREICHE).sort()) {
    const suiten = suitenFuerBereiche(alle, [name]);
    console.log(`${name.padEnd(24)} ${String(suiten.length).padStart(3)} Suiten`);
  }
}

module.exports = {
  BEREICHE, KERN, SAMMELDATEIEN, SAMMEL_BEREICHE, NICHT_RELEVANT, RELEVANT,
  istRelevant, analysiere, suitenFuerBereiche, bereichsSuiten
};
