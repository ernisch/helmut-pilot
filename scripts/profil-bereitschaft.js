#!/usr/bin/env node
"use strict";

// Prüfwerkzeug: Bundestags-Bereitschaft von Mandatsprofilen — AUSSCHLIESSLICH LESEND.
//
//   node scripts/profil-bereitschaft.js --fixtures <datei.json> [--profil <id>] [--json]
//   node scripts/profil-bereitschaft.js --production [--profil <id>] [--json]
//
// Modi:
//   --fixtures  liest Profile aus einer JSON-Datei (Array von Profilen ODER
//               { profiles: [...], personalSources: [...] }) — offline, deterministisch,
//               CI-tauglich. personalSources: [{ profileId, id, query|url }].
//   --production liest den Bestand rein lesend über storage.listFullProfiles()
//               (Secrets NUR aus process.env, CLAUDE.md §4.9). Es wird NICHTS
//               geschrieben, NICHTS exportiert, kein Konto und keine Auth-Tabelle
//               gelesen. Die Ausgabe enthält keine Secrets und keine Rohdaten —
//               nur Kennungen, Feldnamen und Befunde.
//
// Exit-Codes: 0 = alle geprüften Bundestagsprofile inhaltlich bereit (Warnungen
// erlaubt) UND Bestand ohne Probleme · 2 = mindestens ein Blocker ·
// 3 = Eingabe-/Ladefehler. Das Werkzeug wendet KEINE Korrekturen an.

const fs = require("fs");
const path = require("path");
const {
  bewerteBundestagsprofil,
  bewerteProfilbestand
} = require("../lib/helmut/profile-readiness");

function usage() {
  console.log("Nutzung: node scripts/profil-bereitschaft.js (--fixtures <datei.json> | --production) [--profil <id>] [--json]");
}

function parseArgs(argv) {
  const args = { json: false, fixtures: null, production: false, profil: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--production") args.production = true;
    else if (a === "--fixtures") args.fixtures = argv[++i] || null;
    else if (a === "--profil") args.profil = String(argv[++i] || "").trim().toLowerCase();
    else if (a === "--help" || a === "-h") args.help = true;
    else { args.unbekannt = a; }
  }
  return args;
}

function ladeFixtures(datei) {
  const voll = path.resolve(process.cwd(), datei);
  const roh = JSON.parse(fs.readFileSync(voll, "utf8"));
  if (Array.isArray(roh)) return { profiles: roh, personalSources: [] };
  return {
    profiles: Array.isArray(roh.profiles) ? roh.profiles : [],
    personalSources: Array.isArray(roh.personalSources) ? roh.personalSources : []
  };
}

async function ladeProduction() {
  // Rein lesender Pfad: listFullProfiles macht genau einen GET über PostgREST.
  const storage = require("../lib/helmut/storage");
  if (typeof storage.listFullProfiles !== "function") {
    throw new Error("storage.listFullProfiles nicht verfügbar");
  }
  const profiles = await storage.listFullProfiles();
  if (!Array.isArray(profiles)) throw new Error("Profil-Bestand nicht lesbar (kein Array)");
  return { profiles, personalSources: [] };
}

function textAusgabe(befund) {
  const zeilen = [];
  zeilen.push(`Profil-Bereitschaftsprüfung (Bundestag, WP-Sollmenge) — ${befund.profile.length} Profil(e) geprüft, rein lesend`);
  for (const p of befund.profile) {
    const kopf = `\n■ ${p.id}  [${p.ebene || "ohne Ebene"}]  Inhalt: ${p.zutreffend ? (p.bereit ? "BEREIT" : "NICHT BEREIT") : "—"}  Lifecycle: ${p.aktiv ? "aktiv" : "deaktiviert"}  (Basis: ${p.basisZustand})`;
    zeilen.push(kopf);
    for (const f of p.fehlend) zeilen.push(`   FEHLT      ${f.feld} (${f.klasse}) — ${f.verbraucher}`);
    for (const u of p.ungueltig) zeilen.push(`   UNGÜLTIG   ${u.feld} = „${u.wert}" — ${u.grund}`);
    for (const w of p.widersprueche) zeilen.push(`   WIDERSPRUCH ${w.feld}: „${w.wert}" — ${w.grund}`);
    for (const d of p.duplikate) zeilen.push(`   DOPPELT    ${d.feld}: „${d.wert}"`);
    for (const w of p.warnungen) zeilen.push(`   Warnung    ${w.feld} — ${w.hinweis}`);
    if (p.betroffeneFunktionen.length) zeilen.push(`   Betroffen  ${p.betroffeneFunktionen.join(" · ")}`);
  }
  zeilen.push(`\n■ Bestand (${befund.bestand.anzahl} Profile · Bundestag ${befund.bestand.bundestag.length} · Landtag ${befund.bestand.landtag.length})`);
  for (const pr of befund.bestand.probleme) zeilen.push(`   PROBLEM    [${pr.art}] ${pr.profil} — ${pr.detail}`);
  for (const w of befund.bestand.warnungen) zeilen.push(`   Warnung    [${w.art}] ${w.profil} — ${w.detail}`);
  if (!befund.bestand.probleme.length) zeilen.push("   keine Bestandsprobleme (Kennungen eindeutig, keine Vermischung erkannt)");
  zeilen.push(`\nErgebnis: ${befund.blocker === 0 ? "BEREIT (keine Blocker)" : `${befund.blocker} Blocker`} · ${befund.warnzahl} Warnung(en)`);
  return zeilen.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.unbekannt || (!args.fixtures && !args.production) || (args.fixtures && args.production)) {
    usage();
    process.exit(args.help ? 0 : 3);
  }

  let daten;
  try {
    daten = args.fixtures ? ladeFixtures(args.fixtures) : await ladeProduction();
  } catch (err) {
    console.error(`Ladefehler: ${String(err && err.message || err)}`);
    process.exit(3);
  }

  let profile = daten.profiles;
  if (args.profil) profile = profile.filter((p) => String(p && p.id || "").toLowerCase() === args.profil);
  if (!profile.length) {
    console.error(args.profil ? `Kein Profil mit id „${args.profil}" gefunden.` : "Keine Profile im Bestand.");
    process.exit(3);
  }

  const einzel = profile
    .map((p) => ({ id: String(p && p.id || "(ohne id)"), ergebnis: bewerteBundestagsprofil(p) }))
    .sort((a, b) => a.id.localeCompare(b.id, "de"))
    .map(({ id, ergebnis }) => ({
      id,
      ebene: ergebnis.basis.parliamentType,
      zutreffend: ergebnis.zutreffend,
      bereit: ergebnis.bereit,
      aktiv: ergebnis.aktiv,
      basisZustand: ergebnis.basis.state,
      fehlend: ergebnis.fehlend,
      ungueltig: ergebnis.ungueltig,
      widersprueche: ergebnis.widersprueche,
      duplikate: ergebnis.duplikate,
      warnungen: ergebnis.warnungen,
      betroffeneFunktionen: ergebnis.betroffeneFunktionen,
      hinweise: ergebnis.hinweise
    }));

  // Bestandsprüfung immer über den VOLLEN geladenen Bestand (nicht den Filter),
  // sonst wären Duplikate/Vermischung zwischen Profilen unsichtbar.
  const bestand = bewerteProfilbestand(daten.profiles, { personalSources: daten.personalSources });

  const blocker = einzel.filter((p) => p.zutreffend && !p.bereit).length + bestand.probleme.length;
  const warnzahl = einzel.reduce((n, p) => n + p.warnungen.length + p.duplikate.length, 0) + bestand.warnungen.length;
  const befund = { profile: einzel, bestand, blocker, warnzahl };

  if (args.json) {
    console.log(JSON.stringify(befund, null, 2));
  } else {
    console.log(textAusgabe(befund));
  }
  process.exit(blocker === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(`Unerwarteter Fehler: ${String(err && err.message || err)}`);
  process.exit(3);
});
