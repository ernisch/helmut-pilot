"use strict";

// Reiter-Umbenennung „Helmut" -> „Briefing" (NUR sichtbares Label) — Offline, 0 Netz.
// Verbindlicher Umfang: der sichtbare Produktreiter heisst „Briefing"; Marke/Produkt
// und Persona heissen weiterhin Helmut; interne IDs/Zustaende/API-Vertraege bleiben
// unveraendert (die View-ID "briefing" gehoert historisch zum LAGE-Reiter, die View-ID
// "helmut" zum sichtbaren Reiter "Briefing" — bewusst NICHT angefasst).
// Quelltext-Assertions nach dem Muster von splash-boot-test.js.

const fs = require("fs");
const path = require("path");

const clientSrc = fs.readFileSync(path.join(__dirname, "..", "client.js"), "utf8");
const manifest = fs.readFileSync(path.join(__dirname, "..", "site.webmanifest"), "utf8");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Navigation: Reiter heisst sichtbar „Briefing", ID bleibt "helmut" ---------------
const navBlock = clientSrc.match(/const navItems = \[[\s\S]*?\];/);
const mobileNavBlock = clientSrc.match(/const mobileNavItems = \[[\s\S]*?\];/);
check("1 navItems vorhanden", Boolean(navBlock));
check("1b Hauptnavigation: ID 'helmut' traegt Label 'Briefing'", Boolean(navBlock) && /\[\s*"helmut"\s*,\s*"Briefing"\s*\]/.test(navBlock[0]));
check("1c mobile Navigation: ID 'helmut' traegt Label 'Briefing'", Boolean(mobileNavBlock) && /\[\s*"helmut"\s*,\s*"Briefing"\s*\]/.test(mobileNavBlock[0]));
check("1d KEIN Nav-Eintrag traegt mehr das Label 'Helmut'",
  !/\[\s*"[a-z-]+"\s*,\s*"Helmut"\s*\]/.test(navBlock[0]) && !/\[\s*"[a-z-]+"\s*,\s*"Helmut"\s*\]/.test(mobileNavBlock[0]));

// --- 2) Die anderen Reiter bleiben unveraendert -----------------------------------------
check("2 Lage bleibt Lage (ID 'briefing' -> Label 'Lage', historische ID unveraendert)",
  /\[\s*"briefing"\s*,\s*"Lage"\s*\]/.test(navBlock[0]));
check("2b Radar bleibt Radar", /\[\s*"radar"\s*,\s*"Radar"\s*\]/.test(navBlock[0]));
check("2c Büro bleibt Büro", /\[\s*"office"\s*,\s*"Büro"\s*\]/.test(navBlock[0]));

// --- 3) Interne IDs/Vertraege unveraendert ----------------------------------------------
check("3 data-view=\"helmut\" (interner Router-Zustand) existiert weiterhin", clientSrc.includes('data-view="helmut"'));
check("3b hasNewHelmutAssessment (interner Zustandsname) unveraendert", clientSrc.includes("hasNewHelmutAssessment"));
check("3c currentHelmutState (API-Vertrag) wird weiter gelesen", clientSrc.includes("currentHelmutState"));
check("3d helmutAssessment (API-Vertrag) wird weiter gelesen", clientSrc.includes("helmutAssessment"));

// --- 4) Reiterbezogene sichtbare Texte umbenannt ----------------------------------------
check("4 Sprungbutton aus der Lage: 'Im Briefing öffnen' (statt 'In Helmut öffnen')",
  clientSrc.includes("Im Briefing öffnen") && !clientSrc.includes("In Helmut öffnen"));
check("4b Bereichs-ARIA: 'Briefing – aktueller Stabschefstand'",
  clientSrc.includes('aria-label="Briefing – aktueller Stabschefstand"'));
check("4c Kein Zustands-Abschnitt traegt mehr exakt aria-label=\"Helmut\"",
  !clientSrc.includes('aria-label="Helmut"'));

// --- 5) Marke/Persona Helmut bleibt (KEINE globale Ersetzung) ---------------------------
check("5 Login-Button 'Helmut öffnen' (Marke: die App oeffnen) bleibt", clientSrc.includes(">Helmut öffnen</button>"));
check("5b Persona-Onboarding 'So funktioniert Helmut' bleibt", clientSrc.includes("So funktioniert Helmut"));
check("5c Persona 'Helmuts Einschätzung' bleibt", clientSrc.includes("Helmuts Einschätzung"));
check("5d PWA-Manifest: App-Name bleibt Helmut", /"name":\s*"Helmut"/.test(manifest) && /"short_name":\s*"Helmut"/.test(manifest));

// --- 6) Keine Verwechslung mit gespeicherten (Morgen-)Briefings --------------------------
// Der Lage-Reiter (ID "briefing") und dessen Briefing-Datenpfade bleiben wortgleich; die
// Umbenennung fuegt KEINE neue Verwendung des Worts "Briefing" in Datenpfaden hinzu.
check("6 Kein API-Pfad wurde umbenannt (z. B. /api/app/start bleibt)", clientSrc.includes("/api/app/start"));
check("6b Morgenbriefing-Texte unveraendert vorhanden", /Morgenbriefing|Morgenlage/.test(clientSrc));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Briefing-Reiter-Umbenennungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
