# Zweitkunden-Nachweis: drei politische Testprofile end-to-end

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-second-test-profile-49kxzq`
**Test:** `scripts/drei-profile-e2e-test.js` (`npm run test:drei-profile`, 93/93)

Kurz und einfach: Dieser Block beweist, dass Helmut **mehrere Kunden gleichzeitig**
trennt. Es werden **drei zusätzliche politische Testprofile** angelegt und durch alle
vier Produktflächen (**Lage, Radar, Helmut, Büro**) geschickt — parallel zum
bestehenden Pilotmandanten. Alles läuft **rein im Testprozess** (kein Netz, keine Datenbank,
kein echtes Nutzerkonto, keine Production-Änderung).

## 1. Welche drei Profile?

Echte öffentliche Mandatsdaten (21. Wahlperiode) — bewusst drei **verschiedene
Parteien** und **verschiedene Fachfelder**:

| Profil | Partei | Region | Ausschuss / Fachfeld |
|---|---|---|---|
| **Sanae Abdi** | SPD | Köln I (NRW) | Wirtschaftliche Zusammenarbeit und Entwicklung |
| **Knut Abraham** | CDU/CSU | Elbe-Elster – Oberspreewald-Lausitz II (Brandenburg) | Auswärtiges / Menschenrechte |
| **Doris Achelwilm** | Die Linke | Bremen (Landesliste) | Digitales und Staatsmodernisierung / Steuerpolitik |

Quellen der Profildaten: bundestag.de / abgeordnetenwatch.de / Fraktionsseiten.
**Eines der drei Testprofile teilt bewusst die Partei des Pilotmandanten** — das ist der schärfste Trennungsbeweis:
gleiche Partei darf **nicht** gleiche Inhalte bedeuten.

*Kurzerklärung der Begriffe:* **Mandantentrennung** = jeder Kunde sieht nur seine
eigenen Inhalte. **KO / Vorgang** = ein politischer Sachverhalt, den Helmut „einmal
global versteht" und dann „pro Kunde bewertet". **Cache** = Zwischenspeicher, damit
nicht doppelt gerechnet wird.

## 2. Was wurde geprüft? (93 Prüfungen, alle grün)

| # | Prüfpunkt | Ergebnis |
|---|---|---|
| 1 | **Profilanlage im Admin + Pflichtfelder** | Alle drei Profile werden wie im Admin-Schnellstart normalisiert und von `validateProfile` als **„Vollständig"** eingestuft; keine fehlenden Pflichtfelder. Ein leeres Profil bleibt korrekt **„Nicht bereit"** (nichts erfunden). |
| 2 | **Mandantentrennung** | Jedes Profil trifft **sein** Fachfeld als Top-Treffer; vier Profile → vier **unterschiedliche** Top-Vorgänge. Keine Fremd-Partei/-Ausschuss feuert. |
| 3 | **Eigene Lage-Inhalte + Quellenbelege** | Oberste Lage-Karte = eigenes Fachfeld; jede Karte trägt **≥ 2 echte Quellen** (offiziell + Leitmedium, alle `https`). |
| 4 | **Eigene Radar-Inhalte** | Jedes Profil erkennt seine **eigene Erwähnung**; die Personen-Erwähnung des Pilotmandanten taucht bei **keinem** neuen Profil auf. |
| 5 | **Eigene Helmut-Empfehlungen** | Top-Empfehlung = eigenes Fachfeld, Stufe „Sofort reagieren"; Entscheidungs-ID trägt die Mandanten-ID. Top des partei-gleichen Testprofils ≠ Pilot-Top trotz gleicher Partei. |
| 6 | **Büro-Verhalten + Cache-Trennung** | `generateOfficeOutput` erzeugt pro Kunde einen eigenen Entwurf; zweiter Aufruf = **Cache-Hit** (kein neuer KI-Call); Cache-Schlüssel tragen die Mandanten-ID und kollidieren nicht. KI-Meta trägt **keine** userId (DSGVO). |
| 7 | **Kostenlimit** | Per-Mandant-Budget: innerhalb → erlaubt, ab 80 % → Warnung, über Deckel → **harter Stopp**, unbekannter Status → **fail-closed**. |
| 8 | **Keine Inhalte des Pilotmandanten** | Kein neues Profil bekommt den Arbeit-und-Soziales-Vorgang des Pilotmandanten als Top-Karte/-Empfehlung oder Eigenerwähnung. Der Pilotmandant behält sein Fachfeld unverändert. |
| 9 | **Keine erfundenen Inhalte** | Leeres Profil → keine Matches, keine Radar-Signale, keine „Sofort reagieren"-Empfehlung. Alles Ausgespielte hat eine echte Quelle. |
| 10 | **Keine Production-Gefahr** | Rein in-memory: v3-Store im Testprozess bewusst nicht bereit; Büro läuft über einen In-Memory-Mock — kein DB-Write, kein Secret, kein Netz. |

## 3. Was wurde bewusst NICHT gemacht

- **Kein echtes Production-Nutzerkonto** angelegt (Freigabepunkt laut Auftrag).
- **Keine Production-Migration, kein Backfill, keine Secret-/Cron-Änderung.**
- Die drei Profile existieren **nur** als Test-Fixtures — sie schreiben nirgends in
  Production. Der Blob-/DB-Profilpfad bleibt unberührt.

## 4. Wie nachvollziehen?

```
npm run test:drei-profile      # 93/93 — der vollständige Zweitkunden-Beweis
```

Ergänzend unverändert grün: `test:supply-matrix`, `test:cache-isolation`,
`test:profile-validation`, `test:llm-budget`, `test:radar`, `test:decisions`,
`test:lage`.

## 5. Fazit

Ein **zweiter (und dritter, vierter) Kunde** läuft technisch sauber getrennt durch
Lage, Radar, Helmut und Büro — mit eigenen Inhalten, eigenen Quellen, eigenem Cache
und eigenem Kostenlimit, **ohne** Inhalte des Pilotmandanten und **ohne** erfundene Inhalte. Der
einzige verbleibende echte Freigabepunkt für einen **produktiven** Zweitkunden bleibt
die Production-Datenübernahme (Migration + Profil-Write + `HELMUT_PROFILE_DB_MODE`),
die ausdrücklich freigegeben werden muss.
