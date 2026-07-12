# Zentrale Profilvalidierung (Phase 5)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Modul:** `lib/helmut/profile-validation.js` · **Tests:** `scripts/profile-validation-test.js` (32/32)

Ein Ort, der beurteilt, ob ein politisches Profil nutzbar ist. Baut auf der
bestehenden `config.profileCompleteness`-Logik auf (dieselbe Ausschuss-/Themen-/
Partei-Beurteilung), ergänzt die vom Pflichtenheft geforderten Achsen und fasst
alles in klare Zustände. **Keine erfundenen Daten:** fehlt ein Feld, wird es als
fehlend ausgewiesen — nie geraten.

## Pflichtfelder (Phase 5)

| Feld | Regel |
|---|---|
| Name | `fullName` oder `name` gesetzt |
| Nutzer-ID | `id` gesetzt (= Mandantenschlüssel, eindeutig) |
| Partei oder „fraktionslos" | `party` oder `faction` gesetzt (auch „Fraktionslos") |
| Mandatsebene | aus `parliamentType`/`politicalLevel` als Bundestag/Landtag ableitbar |
| Bundesland | Pflicht **nur** bei Landtag |
| Region oder Wahlkreis | `constituency`/`wahlkreis`/`location`/`state` gesetzt |
| mind. ein Schwerpunkt oder Ausschuss | `committee(s)` **oder** `focusTopics`/`topicPriorities` |
| aktiver Status | `profileActive !== false` und nicht (soft-)gelöscht |
| gültige Kostenbegrenzung | KI-Budget nicht gesetzt (→ Systemdefault) **oder** positive ganze Zahl |

## Zustände

| Zustand | Bedeutung | Kann Briefing? | Kann Radar? | Kann Lage personalisieren? | Kann Helmut empfehlen? |
|---|---|---|---|---|---|
| **Vollständig** | alle Pflichtfelder da | ✅ | ✅ | ✅ | ✅ |
| **Teilweise vollständig** | Identität da, einzelne Pflichtangaben fehlen | ✅ wenn ≥1 Matching-Dimension (Partei/Ausschuss/Themen/Region) | ✅ wenn Name da | eingeschränkt | eingeschränkt |
| **Nicht bereit** | praktisch leer (weder Name noch Partei) | ❌ | ❌ | ❌ | ❌ |
| **Fehlerhaft** | Daten da, aber ungültig (z. B. KI-Budget ≤ 0) | ❌ (muss erst korrigiert werden) | ❌ | ❌ | ❌ |
| **Deaktiviert** | `profileActive=false` oder gelöscht | ❌ | ❌ | ❌ | ❌ |

Die Priorität bei der Zustandsbestimmung: **Deaktiviert → Fehlerhaft → Nicht bereit
→ Teilweise → Vollständig.** Ein deaktiviertes Profil wird also als „deaktiviert"
gemeldet, auch wenn es sonst vollständig wäre (es nimmt an keiner Verarbeitung teil).

## Anbindung

- **Admin-Datenstatus** (`server.js buildAdminDataStatus`): jeder Account trägt jetzt
  ein `validierung`-Objekt (Zustand, Klartext-Label, Grund, fehlende Pflichtfelder,
  Funktionsauswirkung). Fail-safe: fehlt das Profil, wird ein leeres validiert (nie
  throw). Damit kann die Admin-Profilverwaltung (Phase 4) den Zustand direkt anzeigen.
- **Job-Verarbeitung** (Phase 8, folgt): ein `deaktiviertes`/`nicht_bereites` Profil
  soll später nicht an Briefing/Matching teilnehmen — dieselbe `validateProfile`-
  Funktion ist die eine Quelle der Wahrheit dafür.

## Was bewusst NICHT passiert

- Kein gespeichertes Vollständigkeits-Feld (immer frisch berechnet → nie stale).
- Keine automatische Korrektur/Auffüllung fehlender Felder.
- Keine Verhaltensänderung an bestehenden Pfaden: das `validierung`-Objekt ist rein
  additiv im Admin-Datenstatus; kein Job liest es in diesem PR bereits aus.
