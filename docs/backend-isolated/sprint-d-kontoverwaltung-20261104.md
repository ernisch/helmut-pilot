# Sprint D: Kontoverwaltung am isolierten echten Server

**Ergebnis: 13 Prüfgruppen bestanden, ein echter Sperrfehler nachgewiesen. Der vorbereitete kleine Patch besteht 9 gezielte Statusprüfgruppen im Wegwerfklon. Keine gemeinsame Quelldatei im Arbeitsbranch geändert.** Der Fehler muss vor der Kundenfreigabe dort korrigiert werden. Dies ist keine Production-, UI- oder Mock500-Abnahme.

## Stand und Vorgehen

- Vor Beginn: Branch `feat/claude-backend-isolated`, Commit `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`; keine Änderungen an vorhandenen versionierten Dateien. Eigener Arbeitsbereich `/workspace/helmut-backend-sprint-b-20261104`; die drei vorhandenen Sprint-B-Dateien sind getrennte eigene Ergänzungen.
- Der neue Test erzeugt ausschließlich aus diesem lokalen Branch einen frischen Klon mit eigenen Git-Metadaten unter `/tmp/helmut-sprint-d-runtime-*/repo`. Kein Fetch, kein Checkout fremder Branches. Der Klon hat zu Beginn keinen Store und keine Environment-Dateien. Er wird nach dem Lauf samt synthetischen Konten entfernt.
- Echte `server.js`-Requestbehandlung über einen zufälligen Port ausschließlich auf `127.0.0.1`; echte Accounts, scrypt, Sessioncookies und CSRF. Nur ein Bootstrap-Admin wird als direkte Auth-Fixture angelegt. Alle weiteren geprüften Kontolebenszyklusaktionen laufen über HTTP.
- `scripts/lokal.js`, kleine explizite Environment-Allowlist, lokale Speicherung, Quellenmodus aus und Kommunikationsriegel `gesperrt`. `NODE_PATH` liest ausschließlich die bereits vorhandenen Pakete unter `/workspace/helmut-pilot/node_modules`. Keine Installation, Provider- oder Datenbankverbindung.
- Kontoanlage ohne Schnellstart-/Mandatsinhalte; `saveProfile` ist zusätzlich im Testprozess mit einer Fehlersperre instrumentiert. Ergebnis: **0 Profil-Schreibversuche, 0 persistierte Profile, 0 Fetchversuche**. Keine Profilaktivierung, Motor-, Budget-, Scheduler-, Quellen-, KI- oder 500er-Aktion.

## Nachgewiesen am 04.11.2026

Ein gezielter HTTP-Lauf um 11:40 UTC: **60 Requests, 13 PASS, 1 FAIL, Exit 1**, rund 1,2 Sekunden. Der rote Exit erhält den Produktfehler ausdrücklich. Der vorgeschaltete erste Startversuch erreichte Node nicht, weil dessen Binary hier außerhalb `/usr/bin` liegt; danach wurde der explizite PATH korrigiert. Die vollständige Kontosuite wurde nicht wiederholt. Nach zusätzlichem Auftrag folgten nur die unten getrennt belegten Statusprüfungen in zwei weiteren frischen Wegwerfklonen.

| Geprüfte Gruppe | Ergebnis und relevante bestehende Pfade |
|---|---|
| Anmeldung und Leseschutz | Anonymes Nutzerlisting 401, echte Anmeldung 200, Session vorhanden; Cookie `HttpOnly`/`SameSite=Lax`. `/api/auth/login`, `/api/auth/session`, `/api/admin/users` |
| CSRF | Fehlender/falscher CSRF-Token 403; es entsteht kein Konto. `/api/security/csrf`, POST `/api/admin/users` |
| Anlegen und Validierung | Abgeordneten-/Referentenkonto tatsächlich angelegt, E-Mail normalisiert, Duplikat 409, ungültige Rolle 400; Listing ohne Passwort-/Tokenhashes. Keine Profilanlage. |
| Rollen und Mandat | Nicht-Admins können keine Konten/Rollen verwalten. Autorisierter Rollenwechsel wirkt sofort in vorhandener Sitzung. Fremde Mandats-ID liefert nur das eigene/zugewiesene leere Profil. Zuweisungsentzug sperrt Profilzugriff 403. `/api/admin/assignments`, GET `/api/profile/current` |
| Bearbeiten und Konditionen | Name, monatlicher manueller Preis und Zahlungsstatus gespeichert; ungültiger Zahlungsstatus 400, unbekanntes Konto 404, Kundenlesung ohne Hashes. Admin-Passwort-PATCH 400. `/api/admin/users/:id`, GET `/api/admin/customers` |
| Einladung | Ohne Passwort: Status `eingeladen`, gültiger Link; tatsächliche Zustellung gesperrt (`mail.sent:false`). Echtes Passwortsetzen erstellt Sitzung. Wiederverwendung 410. `/api/auth/password-token`, `/api/auth/set-password` |
| Passwortreset und Entzug | Admin-Resetlink vom bestehenden Konto; beide alten Sitzungen danach ungültig, neue Sitzung gültig; altes Passwort 401, neues Passwort 200. POST `/api/admin/users/:id/invite` |
| Abmeldung und Status | Logout entzieht eigene Sitzung. `pausiert` bleibt nach bestehender Regel zugelassen. Normales `deaktiviert` entzieht vorhandene Sitzungen und sperrt Passwortlogin 401. |
| Löschen | Fremdes Nicht-Adminkonto gelöscht, Token-/Zuordnungszeilen entfernt, andere Nutzer erhalten; Selbstlöschung 400, fremder Admin 403. Die Testsitzung dieses gelöschten Kontos war vorher bereits abgemeldet: Löschen einer noch aktiven Sitzung wird hier nicht gesondert nachgewiesen. DELETE `/api/admin/users/:id` |
| **D-01: widersprüchlicher Status** | **FAIL:** PATCH mit `{status:"deaktiviert",active:true}` liefert HTTP 200, `status:"deaktiviert"`, `active:true`; anschließender echter Passwortlogin HTTP 200. Danach keine weiteren Testmutationen. |

## D-01: konkrete Ursache und kleinster vorbereiteter Fix

`lib/helmut/accounts.js:273–283` leitet `active` zunächst aus dem Status ab, überschreibt das Ergebnis anschließend mit `patch.active`. `server.js:2539` entzieht Sitzungen nur bei `active:false`; Login (`server.js:6178`) und Sessionauflösung (`lib/helmut/accounts.js:457`) prüfen dieses Feld. Die Verwaltung kann daher ein Konto als deaktiviert zeigen, während es weiter Zugang bekommt. Der Fehler benötigt eine berechtigte Adminaktion; der Test weist keine unberechtigte Rolleneskalation nach.

**Vor Kundenfreigabe erforderlich:** Der Sperrstatus muss auch bei widersprüchlichen bzw. alten `active`-Feldern verlässlich gelten. Die neue Datei [sprint-d-status-active.patch](sprint-d-status-active.patch) bereitet ausschließlich eine kleine Accounts-Validierung vor: `active:true` bei `deaktiviert`/`gekuendigt` wird mit 400 abgewiesen. Bereits vorhandene widersprüchliche Datensätze werden dadurch nicht automatisch repariert.

Zusätzlich ausdrücklich beauftragter, gezielter Nachweis:

- **Unveränderte Baseline:** 27 HTTP-Requests, 5 PASS/4 FAIL. `deaktiviert` **und** `gekuendigt` mit `active:true` bleiben entgegen ihrem Sperrstatus tatsächlich einloggbar (HTTP 200). Auch `active:true` allein auf einem zuvor korrekt gesperrten Konto setzt `active` wieder auf true (HTTP 200; dessen anschließender Login wurde nicht zusätzlich aufgerufen).
- **Patch ausschließlich im neuen Wegwerfklon angewandt:** 27 HTTP-Requests, **9/9 PASS, Exit 0**. Beide widersprüchlichen Status-PATCHes und beide `active:true`-Alleinpfade liefern 400. Abgewiesener Konflikt erhält atomar den zuvor gültigen aktiven Stand; ein dort weiter erlaubter Login ist korrekt. Reguläres Sperren entzieht vorhandene Sitzung und Passwortlogin, bewusste Reaktivierung über `status:"aktiv"` bleibt möglich.
- Basiscommit, SHA256 der ursprünglichen `accounts.js` und Patch-SHA256 sind vor dem Anwenden im Test fest gebunden. Nur `accounts.js` durfte sich dort ändern. Daher ist `trackedDiffEmpty:false` im Kandidatbeleg **beabsichtigt**; Vorher/Nachher während der Tests und sämtliche Quelldateien des Arbeitsbranches blieben unverändert. Alle drei Laufzeitklone wurden entfernt. Keine Anwendung des Patches im bestehenden Arbeitsbranch, kein Commit.

## Weitere offene Grenzen

- Nicht ausgeführt: abgelaufener Link, erneuter Link mit Invalidierung des Vorgängers, parallele Auth-Schreibkonflikte, echte Mailzustellung, HTTPS-Deployment und Browserablauf. Die Dateien `accounts.js`/`auth.js` enthalten hierfür bereits Teilmechanismen; sie sind durch diesen Sprint nicht vollständig abgenommen.
- `updateUser` enthält anders als `deleteUser` keinen erkennbaren Schutz vor Selbstherabstufung oder Deaktivierung des letzten Administrators. **Codebefund, nicht über HTTP reproduziert.** Vor entsprechender UI-Aktion als eigenen kleinen Grenzfall prüfen; der Lauf stoppte nach D-01.
- Preis/Zahlungsstatus sind manuelle Datenfelder und eine Kundenübersicht, kein nachgewiesener Zahlungs-/Rechnungsanbieter. Negativpreise und weitere fachliche Validierungen wurden nicht geprüft.
- Eine Kontoanlage ohne Schnellstart erzeugt noch kein versorgtes Mandatsprofil. Bei Schnellstartfeldern würde die bestehende POST-Route `saveProfile` aufrufen (`server.js:2442`); dieser Pfad ist ausdrücklich außerhalb dieses Sprints. Er darf nicht mit Kundenbereitschaft oder Profilaktivierung gleichgesetzt werden.
- Verbindliche Originalverwaltung und Kunden-UI unverändert. Originalvergleich/Anbindung liegen beim Hauptlauf. Dieser Test weist das Backend über HTTP nach, keinen visuellen oder Browser-End-to-End-Flow.

## Änderungen, Beleg und nächster sicherer Schritt

Nur neue Dateien: Testskript, dieser Bericht, drei getrennte JSON-Belege und Patchdatei. Kein Commit/Push/PR/Merge/Deployment. Alle neun im JSON erfassten gemeinsamen Quelldateien haben im bestehenden Arbeitsbranch vor/nach den Tests identische Hashes; `git diff HEAD` an vorhandenen Dateien ist leer.

- [Test mit Statusmodus](../../scripts/sprint-d-kontoverwaltung-test.js), SHA256 `5eb0699c03616e0db8aec32c01197e456b853f98dbc5d137a37dedb3a04bd068`. Historische Skriptversion des vollständigen Erstlaufs: `fbeb8424d564aeeba2b68e48de05a5a1b704103a74b9aad39074671164804231` (im unveränderten Erstbeleg erfasst).
- [Unveränderter Erstbeleg](sprint-d-pruefbeleg-20261104.json), SHA256 `9b692ac8e650636dbbd10053dc2e5b499a1f895f9716a1f18ec3d508a1647a1c`
- [Gezielter Status-Baselinebeleg](sprint-d-status-baseline-20261104.json), SHA256 `08b4007e85b41b8ef09bfdb97081602ed347008283bd8eb46ae8dfc853363d35`
- [Gezielter Kandidatbeleg](sprint-d-status-kandidat-20261104.json), SHA256 `6e50cd86a4c283cd75bc44aee7a8ad4317060be5eaefb6c3b8fdda314f831150`
- [Patch](sprint-d-status-active.patch), SHA256 `bf0c77ecc2950cfc34fee9bfd49c707d934e975500f3817cb9e232d7fe70954e`
- Unverändertes `accounts.js`: SHA256 `08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e`
- Unverändertes `server.js`: SHA256 `1bdb41bc338018a2e18e704256d9159294b5330e48233ec0ad36be49f3d5919c`

Reproduktion: Den Test ausschließlich aus dem getrennten Sprint-B-Klon mit der im Skript `fixedEnv` angegebenen Allowlist über `node scripts/lokal.js scripts/sprint-d-kontoverwaltung-test.js` starten. Für den kleinen Statusnachweis `--status-regression` anhängen; für den hashgebundenen Wegwerfklon-Kandidaten `--candidate-patch docs/backend-isolated/sprint-d-status-active.patch`. Er schützt explizit gegen einen Lauf im Root oder `helmut-pilot` und erzeugt seinen Laufzeitklon selbst.

**Nächster sicherer Minimalsprint:** Den gezielt bestandenen D-01-Patch unabhängig prüfen und koordiniert in `lib/helmut/accounts.js` übernehmen; bis dahin bleibt die gemeinsame Baseline fehlerhaft. Zusätzlich letzte-Admin-Grenze gezielt abnehmen und möglichen widersprüchlichen Altbestand nur mit gesondert passendem Zugriff bewerten. Betroffene gemeinsame Dateien zur Abstimmung: `accounts.js`, gegebenenfalls `auth.js`/`server.js` für Bestandsschutz und der Originalverwaltungsadapter für den Status-Payload. Diese Dateien wurden im bestehenden Arbeitsbranch hier nicht verändert. Mock500/Production500 wurden weder ausgeführt noch neu bewertet; der nachgewiesene Sperrfehler betrifft die spätere Betreiber-/Kundenfreigabe.
