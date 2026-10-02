# Helmut UI Planung und Überschneidungsprüfung

Stand: 02.10.2026. **Umsetzung wegen ungeklärter Dateibelegung blockiert.**
Dieser Branch dokumentiert ausschließlich die geplanten UI Änderungen aus der
hochgeladenen Claude Design Übergabe. Es wurden keine Appdateien geändert und
keine UI Tests, Motorläufe oder Production Aufrufe gestartet.

## Auftrag und Schutzgrenzen

Der Nutzer beauftragt UI und Design auf einem eigenen Branch und untersagt
Merge, Production Deployment, Änderungen an main, Motor, Backend, Cron,
Datenbank, Umgebungsvariablen und Production Daten. Der laufende oder bevorstehende
500er Test und seine Dateien dürfen nicht beeinflusst werden.

Die anschließende ausdrückliche Nutzerpräzisierung lautet: Wenn eine aktuelle
Bearbeitung von `client.js`, `styles.css` oder `index.html` durch den Motor Thread
nicht eindeutig ausgeschlossen werden kann, diese Dateien nicht ändern, sondern
die geplanten UI Änderungen dokumentieren und den Konflikt melden.

Die hochgeladenen Dokumente sind Gestaltungsvorlage und technische Hinweise.
Sie erweitern diesen Auftrag nicht auf Backendänderungen oder spätere Funktionen.
Allgemeine Mergefreigaben in AGENTS.md gelten für diesen Auftrag ausdrücklich nicht.

## Rein lesend geprüfter Ausgang

- Gelesen: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md),
  [START_HERE.md](../START_HERE.md), [CURRENT_STATE.md](../CURRENT_STATE.md)
  und der für den Sprintstart relevante Abschnitt der [Roadmap](../ROADMAP_BIS_500.md).
  Im verfügbaren Checkout wurde keine weitere AGENTS.md gefunden.
- Der ursprüngliche Worktree `/workspace/helmut-pilot` steht auf Branch `work`
  bei `97a843501e971509cf8794a065eed81997201861`; keine lokalen Änderungen.
  Vor der Isolation war dies der einzige registrierte Worktree.
- GitHub main wurde zweimal rein lesend mit demselben Commit bestätigt.
  Die lokale Referenz `origin/main` war älter (`f6477d44`); sie wurde nicht als
  aktuelle Basis verwendet und nicht aktualisiert.
- GitHub meldete bei beiden Abfragen keine offenen Pull Requests. Die
  Remote Branchinventur umfasste 766 Branches. Der konkret verglichene Branch
  `codex/synthetik500-vollhistorie-stand-20261002` betrifft gegenüber main nur
  `docs/CURRENT_STATE.md` und `docs/ROADMAP_BIS_500.md` (ein Commit voraus,
  ein Commit zurück). Dies ist kein Beleg für uncommittete Arbeit anderer Chats.
- In der lokalen Prozessliste waren keine Motor-, App- oder 500er Testprozesse
  sichtbar. Diese Aussage gilt ausschließlich für die Umgebung dieses Chats.
- Die Chatliste meldete einen weiteren aktiven Cloud Chat,
  `01a0f872-b9d4-702d-98dd-a5e1c75ff07d`. Das Auslesen seines Arbeitsstands
  scheiterte mit `connection closed before server request was answered`;
  auch die alternative kompakte Statusabfrage lieferte keinen verwertbaren
  Arbeitsstand und wurde beendet.

**Ergebnis:** In den zugänglichen Gitdaten wurde keine aktuelle Überschneidung
mit den UI Dateien nachgewiesen. Die Dateibelegung und lokalen Änderungen des
aktiven Motor Chats sind jedoch nicht erreichbar. Eine Überschneidung ist damit
nicht eindeutig ausgeschlossen; die drei UI Dateien bleiben unangetastet.
Auch die zentralen Motorstatusdokumente werden auf diesem Branch nicht geändert.

Die isolierte Arbeitskopie `/workspace/helmut-ui` wurde auf dem neuen Branch
`codex/ui-design-20261002` aus dem bestätigten main Commit angelegt. Der
ursprüngliche Worktree und seine Branchzuordnung bleiben erhalten.

## Gestaltungsvorlage und festgelegte Farbe

Grundlage ist das hochgeladene Archiv `Helmut Desktop Prototyp.zip`, insbesondere
`handoff/UI-Ehrlichkeitspruefung.md` und
`handoff/prototyp/Helmut Desktop.dc.html`. Die sieben Schritte der
`Ersteinrichtung.dc.html` ergänzen die Vorlage. Der Prototyp wird nicht als
Appcode übernommen; seine Beispielinhalte, Beispielbilder und Browserdaten
werden nicht in die App oder in Tests kopiert.

Für die spätere Umsetzung ist **Fehler Rot `#D97B7B`** festgelegt, entsprechend
dem gedämpften Prototypwert. `#ff5967` wird nicht als zweiter Fehlerwert verwendet.
Statusfarben: Grün `#39d18f` aktuell, Rot Fehler, Gelb `#D6A040` Warnung/veraltet,
Blau `#7FA8E0` Handlung/aktive Auswahl. Prioritätspunkte bleiben gefüllt blau
für Handeln, hohler Ring für Beobachten und gelb für Dringend/veraltet.
Farbkontrast in den bestehenden Themes ist bei der Umsetzung zu prüfen.

Titel: Spectral; Fließtext: Hanken Grotesk; Kennzeichnungen: IBM Plex Mono.
Die Vorlage nutzt Gewicht 500, Flächen `#070B16`, `#0C1322`, `#05080F`, Text
`#EAEEF6`, `#AEB8C9`, `#828EA0`, Radien 4/6/8/999 px und feine Linien.
Schriften stammen aus den mitgelieferten Assets; ihre tatsächliche Einbindung
und die gespiegelte App Shell bleiben bis zur Freigabe der betroffenen Dateien offen.

Die nicht verifizierte Begründung des Haushaltsvorgangs ist reine Kulisse und
wird nicht übernommen. Der Pilotnutzername aus dem Browserspeicher wird weder
in Code noch in Tests oder Beispiele übernommen.

## Geplante Änderungen nach Freigabe der Dateien

Die Übergabe empfiehlt getrennte PRs. Alle folgenden Änderungen sind **geplant,
nicht implementiert**; der vorliegende PR enthält nur dieses Dokument.

| Teil | Betroffene Dateien | Dokumentierter Umfang |
| --- | --- | --- |
| A Texte | `client.js` | C1: Rückmeldungen als gespeichert bezeichnen, keine geänderte Gewichtung behaupten. C2: „Rückmeldungen“ statt „Helmut lernt“; `learning.summary` im benannten Einstellungsblock nicht anzeigen. C3: „Quellen jetzt prüfen“, morgens/abends und ehrliche Ergebnis-/Fehlertexte. C8: Pushversprechen aus leerem Briefing entfernen. C9: Onboarding erklärt Profil und angebotene Büroentwürfe. C10: neuer Versuch in einigen Minuten. |
| B Erfolgsmeldungen | `client.js`, neue gezielte UI Tests | C4: HTTP 200 mit `ok:false` als nicht abgeschlossene Prüfung melden. C5: Profil speichern nur bei Erfolg bestätigen, Fehler sichtbar melden. C6: bei fehlgeschlagener Delegation vor Erfolgsmeldung und Interaktionslog zurückkehren. |
| B Ergänzung Feedback | `client.js`, neue gezielte UI Tests | C7: Clienthelper liefert einen Erfolgsstatus zurück; Feedbackbestätigung und sichtbare Statusänderung nur nach erfolgreicher Antwort. Laut Übergabe eigener PR, da der aktuelle Helper keine Bestätigung zurückgibt. |
| C Bedienbarkeit | `styles.css`, gezielte UI Tests | D1: mindestens 44 × 44 px, insbesondere kompakte Buttons, Taskaktionen, Assessmentaktionen und Toggleklickfläche. D2: benannte Labels mindestens 12 px; Metadaten gemäß Designvorlage mindestens 13 px. Hinweise und Fußzeilentexte vollständig umbrechen lassen. |
| D Design | `styles.css`, betreffende UI Markups/Assets erst nach geklärter Dateifreigabe | D3: dokumentierte Farben und Typografie; kein violettes Leuchten als weiterer Akzent. D4: optionale Iconreduktion ohne neue Bedienfunktion. Blauer Punkt statt gefülltem Stern bei „Heute entscheidend“. Statusfarben als Tokens und Hinweise ohne Abschneiden. |

Die Versionskennung der Assets muss bei einem späteren CSS Rollout mitgezogen
werden. Das erfordert die App Shell Prüfung; `index.html` und die gespiegelte
Stelle in `server.js` werden in diesem Auftrag nicht geändert.
Auch der geplante Querformatsatz „Bitte drehe dein Gerät ins Hochformat.“
bleibt offen, weil er in beiden Dateien gespiegelt ist und Backenddateien tabu sind.

Desktop und Mobile bleiben dieselbe Oberfläche und dieselbe Logik. Es wird keine
separate mobile App gebaut. Mobil wird nur Hochformat entwickelt und geprüft;
im Querformat wird ausschließlich die vorhandene Sperre geprüft. Die Übergabe
beschreibt responsive Anordnungen als spätere Grundlage, nicht als zusätzliche
Funktionen dieses Dokumentationsbranches.

## C4 und C7 Prüfung des bestehenden Antwortvertrags

Die Prüfung erfolgte ausschließlich durch Codelektüre, ohne Serveraufruf.

- **Pipeline:** `server.js`, Route `/api/pipeline/run` ab Zeile 748, liefert
  beim abgefangenen Fehler aus `withTimeout` den Body
  `{ok:false, bounded:true, reason:"pipeline-run-timeout", error:...}`.
  `handleAsync` reicht diesen Body über `sendJson` mit HTTP 200 weiter.
  Der bestehende Clienthandler ab Zeile 11826 prüft nur `response.ok`;
  C4 benötigt daher zusätzlich die dokumentierte Prüfung von `result.ok`.
- **Lage Check:** Die Route `/api/lage/check` ab Zeile 789 reicht
  `runLageCheck` durch. Der gelesene Schedulerpfad ab Zeile 1047 liefert einen
  gespeicherten Check mit `status:"stable"` oder `"changed"`, optional
  `v3Refresh`; er setzt kein eigenes top level `ok:false`.
  Geworfene Fehler laufen über `respondError` in eine Fehlerantwort,
  standardmäßig HTTP 500 mit `{error:"Interner Serverfehler. Bitte später erneut versuchen."}`.
  Diese werden bereits durch `response.ok` abgefangen. Es ist damit kein
  eigener Lage Check Timeoutbody wie bei der Pipeline nachgewiesen.
  Ein gespeicherter oder verschachtelter Teilfehler wird durch diese Codelektüre
  nicht pauschal ausgeschlossen; daraus wird keine Backendänderung abgeleitet.
- **Feedback:** `/api/interactions` ab Zeile 2286 liefert den gespeicherten
  Interaktionseintrag; der lokale Speicherpfad `saveInteraction` ab Zeile 7039
  liefert den Eintrag erst nach `writeStore` zurück. Geworfene Fehler werden
  durch `handleJson`/`respondError` als HTTP Fehler mit `{error:...}` gesendet.
  `logDecisionInteraction` ab Zeile 13323 gibt `logInteraction` weiter,
  aber `logInteraction` ab Zeile 13309 verwirft die Fetchantwort und prüft
  deren HTTP Status nicht. C7 erfordert deshalb den benannten kleinen
  Clientumbau. Ein nacktes `saved === false` am Aufrufer allein reicht nicht.

Zeilenangaben beziehen sich auf den Ausgangscommit dieses Branches.
Keine Fehlermeldung wurde in Production provoziert oder live abgefragt.

## Geplante Verifikation

Bei späterer Umsetzung ausschließlich in einer isolierten UI Arbeitskopie
testen. Alle Node Testläufe gehen über `scripts/lokal.js`, damit Production
Zugangsdaten nicht an Testprozesse gelangen. Der Starter ändert keine
Sitzungsvariablen oder dauerhafte Konfiguration. Der Browser Smoke schreibt lokale Fixtures in
`.helmut-data`; er darf deshalb nicht im Worktree des Motor Chats laufen.

- Neue gezielte UI Tests: Pipeline HTTP 200/`ok:false`, übersprungener Lauf,
  HTTP Fehler und Netzwerkfehler; fehlgeschlagenes Profil speichern und
  Delegieren; Feedback HTTP Fehler/Netzfehler und bestätigter Erfolg.
- Bestehende relevante Rendererprüfungen: Radar UI und Briefing UI.
  Onboarding-/Einstellungsprüfungen nur soweit von der Änderung betroffen.
  Keine Motor-, 500er-, Datenbank- oder kostenpflichtigen Läufe starten.
- Browser Smoke im isolierten Worktree; Design zusätzlich bei 1440 × 900
  und 390 × 844, inklusive Screenshots, vollständiger Hinweise, Bedienflächen
  und unveränderter Querformatsperre. Keine Screenshotdaten aus einem
  vorhandenen Pilotbrowser übernehmen.
- Vor einem später freigegebenen Merge den aktuellen PR Kopf, main und
  Motorüberschneidungen erneut prüfen. Beide Pflichtchecks müssen grün sein:
  `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`.
  Keine vollständige lokale Motorregression aus Vorsicht.

## Stand und nächster Schritt

Dieser Branch ist eine Dokumentationsvorbereitung, **kein getesteter UI Branch
und nicht bereit für einen UI Merge**. Dokumentationsdiff und Dateiumfang werden
geprüft; UI Tests werden erst nach echten UI Änderungen ausgeführt.

Für die Fortsetzung ist ein erreichbarer aktueller Arbeitsstand des Motor Chats
oder eine belegte Freigabe der betroffenen Dateien nötig. Danach die Dateisperre
neu prüfen und die dokumentierten UI Teile separat umsetzen und testen.
Auch nach erfolgreichem und unabhängig abgenommenem 500er Test bleiben
Umsetzung, UI Tests und aktuelles Review erforderlich; dieser Branch wird
nicht automatisch gemergt oder ausgerollt.
