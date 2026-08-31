"use strict";

// ============================================================================
// DRAIN-BILANZ (PR-C, Kapazitätssprint 2026-08-31) — Pflichtprüfungen
// ============================================================================
// Beweist: die Abnahmegroesse "gate-wuerdiger Abfluss >= gate-wuerdige Ankunft,
// verarbeitbarer Rueckstand waechst nicht" wird EHRLICH berichtet — jede nicht
// messbare Groesse bleibt "?", das Richtungsurteil (✓ / ⚠️) faellt NUR bei
// beidseitig messbaren Werten, und die Fehlversuchsquote der Rueckstandslaeufe
// entsteht aus den vorhandenen Quittungen ohne neuen Fetch (0 Laeufe != Quote 0).
// Dazu Strukturpruefungen der Verdrahtung (Bericht + Quittungs-Whitelist).
// REINE LOGIK + Quelltextpruefung; kein Netz, kein echter Storage.

const fs = require("fs");
const path = require("path");
const motorHealth = require("../lib/helmut/motor-health");

let pass = 0, fail = 0;
function check(name, cond) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); if (cond) pass += 1; else fail += 1; }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

abschnitt("§1 drainBilanzZeile: ehrliche Darstellung");
{
  const voll = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 120, rueckstand: 9000, gateGeparkt: 12, fehlversuchsQuote: 0.02 });
  check("§1.1 alle Groessen messbar -> vollstaendige Zeile mit ✓ (Abfluss >= Ankunft)",
    /Ankunft würdig 91/.test(voll) && /Abfluss 120 ✓/.test(voll) && /Rückstand 9000/.test(voll)
    && /Gate geparkt 12/.test(voll) && /Fehlversuchsquote Rückstand 2%/.test(voll));
  const defizit = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 60, rueckstand: 9000 });
  check("§1.2 Abfluss < Ankunft wird als ⚠️ benannt (kein falsches Gruen)", /⚠️ Abfluss < Ankunft/.test(defizit));
  const leer = motorHealth.drainBilanzZeile({});
  check("§1.3 nichts messbar -> ueberall '?', KEIN Richtungsurteil",
    /Ankunft würdig \?/.test(leer) && /Abfluss \?/.test(leer) && !/[✓⚠]/.test(leer)
    && /Fehlversuchsquote Rückstand \?/.test(leer));
  const halb = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: null, rueckstand: 5 });
  check("§1.4 einseitige Messluecke -> kein Richtungsurteil (nur messbare Seite gezeigt)",
    /Ankunft würdig 91/.test(halb) && /Abfluss \?/.test(halb) && !/[✓⚠]/.test(halb));
  const nullwerte = motorHealth.drainBilanzZeile({ ankunftWuerdig: 0, abfluss: 0, rueckstand: 0, gateGeparkt: 0, fehlversuchsQuote: 0 });
  check("§1.5 echte Nullen sind KEINE Messluecke (0 wird gezeigt, ✓ bei 0>=0, Quote 0%)",
    /Ankunft würdig 0/.test(nullwerte) && /Abfluss 0 ✓/.test(nullwerte) && /Fehlversuchsquote Rückstand 0%/.test(nullwerte));
}

abschnitt("§2 rueckstandFehlversuchsQuote: aus Quittungen, ohne neuen Fetch");
{
  const NOW = 1000 * 3600 * 24 * 100; // fester Bezugspunkt
  const q = (proz, startedMsVor, gespeichert, fehlgeschlagen) => ({
    process: proz, startedAt: new Date(NOW - startedMsVor).toISOString(), gespeichert, fehlgeschlagen
  });
  check("§2.1 normale Laeufe: 2 Fehlversuche auf 38 Ergebnisse = ~5%",
    Math.abs(motorHealth.rueckstandFehlversuchsQuote([
      q("understanding-rueckstand", 3600e3, 18, 1),
      q("understanding-rueckstand", 7200e3, 18, 1),
      q("understanding", 3600e3, 50, 50) // fremder Prozess zaehlt NICHT
    ], { nowMs: NOW }) - 2 / 38) < 1e-9);
  check("§2.2 keine Laeufe im Fenster -> null (keine erfundene Quote 0)",
    motorHealth.rueckstandFehlversuchsQuote([q("understanding-rueckstand", 30 * 3600e3, 18, 0)], { nowMs: NOW }) === null);
  check("§2.3 Lauf ohne lesbare Zaehler zaehlt nicht als 0",
    motorHealth.rueckstandFehlversuchsQuote([
      { process: "understanding-rueckstand", startedAt: new Date(NOW - 3600e3).toISOString(), gespeichert: null, fehlgeschlagen: null }
    ], { nowMs: NOW }) === null);
  check("§2.4 Azure-Stoerungstag wird sichtbar: 0 gespeichert, 18 Fehlversuche = 100%",
    motorHealth.rueckstandFehlversuchsQuote([q("understanding-rueckstand", 3600e3, 0, 18)], { nowMs: NOW }) === 1);
  check("§2.5 leere/kaputte Eingabe -> null", motorHealth.rueckstandFehlversuchsQuote(null) === null
    && motorHealth.rueckstandFehlversuchsQuote([]) === null);
}

abschnitt("§3 Struktur: Verdrahtung in Bericht, Route und Quittungs-Whitelist");
{
  const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
  check("§3.1 der Bericht traegt die Drain-Zeile (nach der Queue-Zeile)",
    /drainBilanzZeile\(/.test(serverSrc) && /queueZeile,\s*\n\s*drainZeile,/.test(serverSrc));
  check("§3.2 die drei Lesegroessen laufen EINMAL je Lauf im mandantenneutralen Kontext",
    /zaehleGateWuerdigeAnkunft\(24\)/.test(serverSrc) && /zaehleVerstandene\(24\)/.test(serverSrc)
    && /zaehlePendingVerarbeitbar\(\)/.test(serverSrc));
  check("§3.3 die Rueckstandsroute quittiert fehlversuche (bilanz.fehlgeschlagen)",
    /fehlversuche: bilanz\.fehlgeschlagen/.test(serverSrc));
  check("§3.4 die Quittungs-Whitelist persistiert fehlversuche im rueckstand-Block",
    /fehlversuche: num\(t\.rueckstand\.fehlversuche\)/.test(storageSrc));
  check("§3.5 alle drei Lesegroessen sind fail-safe (null bei Nichtmessbarkeit, nie 0 erfinden)",
    /zaehleGateWuerdigeAnkunft[\s\S]{0,700}return null/.test(storageSrc)
    && /zaehleVerstandene[\s\S]{0,700}return null/.test(storageSrc)
    && /zaehlePendingVerarbeitbar[\s\S]{0,700}return null/.test(storageSrc));
  check("§3.6 die Ankunftszaehlung dedupliziert je Rohdokument (distinct raw_document_id)",
    /zaehleGateWuerdigeAnkunft[\s\S]{0,900}new Set\(rows\.map\(\(r\) => r && r\.raw_document_id\)/.test(storageSrc));
  check("§3.7 der verarbeitbare Rueckstand schliesst failed/failed-final/gate-geparkt NULL-sicher aus",
    /zaehlePendingVerarbeitbar[\s\S]{0,900}understanding_status\.not\.in\.\(failed,failed-final,gate-geparkt\)/.test(storageSrc));
}

console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
