"use strict";

// ============================================================================
// Understanding-Recovery-AUSFUEHRUNG (anker-basiert) — STILLGELEGT 2026-07-18.
// ============================================================================
// Der anker-basierte Ausfuehrungspfad ist fuer Multi-Doc-Faelle ungeeignet:
// Teilstring-Anker ziehen fremde Themen an. Production-Beleg: der echte Lauf
// rec-29569461715 erzeugte einen 3-Themen-Digest und wurde vollstaendig
// zurueckgerollt. Dieses Skript fuehrt deshalb NICHTS mehr aus — kein DB-Zugriff,
// kein KI-Call, kein Write, unabhaengig von Flags/Tokens (die frueheren Sperren
// HELMUT_RECOVERY_EXECUTE + RECOVER_6_CONFIRMED sind gegenstandslos; zusaetzlich
// ist die RECOVERY_ALLOWLIST in lib/helmut/understanding-recovery.js leer).
//
// ERSATZ fuer echte Recovery: Einzel-Dokument-Pfad je exakter raw_document_id
// (Restliste OP-05; die 4 offenen Faelle samt Seed-IDs stehen im Sprintbericht
// docs/betrieb/datenmotor_sprint_pending_understanding_ko.md §4).
//
// Die rein lesende Analyse bleibt verfuegbar: scripts/understanding-recovery-dryrun.js
// (schreibt niemals) und die puren Funktionen in lib/helmut/understanding-recovery.js.

console.log(JSON.stringify({
  ok: false,
  executed: false,
  stillgelegt: true,
  grund: "anker-basierter Recovery-Pfad stillgelegt (Multi-Themen-Digest-Risiko; Lauf rec-29569461715 zurueckgerollt)",
  ersatz: "Einzel-Dokument-Recovery je exakter raw_document_id — siehe docs/datenmotor-restliste.md OP-05"
}, null, 2));
