# Landtag-Megasprint — Phase 9: Datenschutzprüfung

**Stand:** 2026-07-17 · Geprüft: alle Sprint-Änderungen (Phasen 2–8) gegen Datenminimierung, Logs, Telemetrie, Profile, personenbezogene Daten.

## 1. Datenminimierung

| Bereich | Befund |
|---|---|
| **PARDOK-Live-Mapping** (`pardokDocToRawItem`) | Nur amtliche Dokument-Metadaten (Titel, Nummer, Art, Datum, URL, Urheber, Desk-Stichworte). **Kein Volltext**, keine Bürger-Personendaten. Urheber auf 5 gekappt, Content auf 1.200 Zeichen. |
| **Urheber-Feld** | Kann Namen von Abgeordneten in ihrer öffentlichen Mandatsfunktion enthalten (amtliche Parlamentsdokumente, z. B. Anfragen-Urheber). Das entspricht exakt dem bestehenden DIP-Präzedenzfall (`dip.js`: „ausschließlich öffentliche, amtliche Parlamentsdokumente — keine Bürger-Personendaten"). Rechtsgrundlage analog DIP; keine neue Datenkategorie. |
| **Landes-Modelle (Phase 5/6)** | Ausschließlich Institutionen, Gremien, Gebietsnamen. **Null Personen-Entitäten** in den neuen Modellen (testbelegt: kein `person`-Eintrag in `landtag-berlin.js`/`landtag-brandenburg.js`). Bewusst **keine Sitzzahlen/Besetzungen** als Daten (ändern sich laufend, kein Personenbezug nötig). |
| **Testprofile** | Anonym erzwungen (`landtag-profil-test.js` Block 2: `Testprofil *`-Namen, `test-*`-Ids). Keine echten Personen, nicht für Production. |
| **Recherche-Artefakte** | Die Datenrecherche (Phase 5/6) hat bewusst KEINE Abgeordnetennamen erhoben (Rechercheauftrag schloss personenbezogene Daten aus). |

## 2. Logs

- `pardokDispatch` (alle Modi): Rückgabe-/Log-Felder sind technische Metadaten (Modus, Land, Zählwerte, Grund-Codes). Kein Prompt-/Inhalts-Logging.
- Shadow-Ablage (`shadow-store/`): enthält amtliche Dokument-Metadaten (wie bisher), isoliert, kein Prod-Write — unverändert.
- Keine neuen `console.log`-Pfade mit Personenbezug; die Persona-Umstellungen (`ai.js`) ändern Prompts, nicht Logs (LLM-Usage-Log trägt weiterhin nur callType/politicianId, keine Inhalte).

## 3. Telemetrie

**Unverändert** (Sprint-Verbot eingehalten): `source_crawl_telemetry`, `gate_shadow_events`, `llm_budget_counters` und der Monitoring-Pfad wurden nicht angefasst. Die neuen Module schreiben keine Telemetrie.

## 4. Profile

- Neue Landtagsfelder (Sprecherrollen, Funktionen, Behörden, Medien, Parlament) sind **berufliche Mandatsdaten**, vom Mandatsträger editier-/löschbar.
- Persistenz über `profil_extras` (bestehende Spalte) ⇒ **vollständig von Export & Löschung abgedeckt**: `V3_PRIVACY_CHILD_TABLES` enthält `mandate_profiles` als ganze Zeile (`storage.js:3614`), damit automatisch auch `profil_extras`. Beleg: `privacy-vollstaendigkeit-test.js` 20/20 grün.
- `landtagProfilStatus` ist beratend (Anzeige), verarbeitet nichts zusätzlich.

## 5. Keine unnötigen personenbezogenen Daten

- Es wurden **keine neuen personenbezogenen Datenfelder oder -speicher** eingeführt.
- Die einzige personenbezogene Entität im Landesmodul-Bestand (`person-tobias-schulze`, öffentliches Mandat) stammt aus dem bestehenden 20260717-Seed (Sprint 9), nicht aus diesem Sprint.
- DSFA-Relevanz: Die Vorprüfung (`docs/recht/datenschutz-folgenabschaetzung-vorpruefung.md`) bleibt gültig; PARDOK-Live fügt bei Aktivierung dieselbe Datenkategorie hinzu wie DIP (amtliche Parlamentsdokumente). Empfehlung: bei Landesfreigabe die DSFA-Vorprüfung um den PARDOK-Absatz ergänzen (Aktivierungscheckliste, Punkt D5).
