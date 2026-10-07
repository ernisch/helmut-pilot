# Blocker 1: direkter synthetischer 500er Motorweg

Stand: 07.10.2026. Direkter Motorweg auf `main`-Commit `5cada034`; kein
Production-Write, keine Aktivierung und kein Production-Modellaufruf in diesem
Arbeitsauftrag. Die technische Codeabnahme und der spätere echte 500er Nachweis
sind getrennte Abnahmen.

## Merge- und Deploymentstand

[PR #846](https://github.com/ernisch/helmut-pilot/pull/846)
(Kopf `b241b36b62bf292c5efc200d17e6a45c20801320`) ist nach
ausdrücklicher Betreiberfreigabe per Squash nach `main` gemergt:
`5cada0342b3c2218b9dd2f8ac50bdf1ee57db63a`. Das automatische Production
Deployment ist READY; das aktuelle Production-Ziel steht auf genau diesem
Commit. [PR-Pflicht-CI](https://github.com/ernisch/helmut-pilot/actions/runs/37618464270)
beide success. [main-CI](https://github.com/ernisch/helmut-pilot/actions/runs/37621852879):
Browser success, Offline noch laufend und hier nicht als bestanden ausgewiesen.
Code/Offline ist damit unabhängig akzeptiert und Production ausgerollt.

## Technisches Abnahmekriterium

Ein geschlossener Operatorweg kann nach Deployment und separat belegtem Test-GO
exakt die bestehende synthetische Zielkohorte aus 500 gleichzeitig aktiven
Mandaten (330 BT / 120 BE / 50 BB, 501 Identitäten einschließlich Operator)
über den bestehenden Helmut-Motor bearbeiten. Jede der 500 D/R-Einheiten liefert
Mandatsbriefing, Morgenbriefing und Lage oder einen ausdrücklich bilanzierten
Fehler. Inhaltsprüfung, Speicherung, Kostenkontrolle, Abbruch und vollständige
Originalbelege bleiben erhalten. Der historische 495-plus-5-Weg wird hier nicht
verwendet. Native D wird weder installiert noch als Zulassungstor verlangt.

## Ausführbarer Weg

- CLI: `scripts/synthetik-500-direct.js`.
- Geschützter Serverweg: `POST /api/ops/synthetik500-direkt` auf dem vorab
  gebundenen unveränderlichen Production-Deployment.
- Expliziter Command `helmut-synthetik500-production-command/2-direct`,
  Executor und Eingaben `/4-direct`, Kosten-/Routenplan weiterhin `/4`.
- Motor: vorhandenes `lage.buildLageBriefing` mit originaler D-Erzeugung,
  gespeicherter D-Herkunft, echter R-Quittung und `lage-textqualitaet`.
- D-Zwischenbeleg: privates `helmut_store`, einmaliger INSERT, vollständiges
  Rücklesen und Inhalts-/Owner-/Run-/Completion-/Usage-Bindung. Der Vertrag
  `helmut-synthetik500-insert-readback-D-storage/1` behauptet ausdrücklich
  keine native Immutable-History- oder Retentionszusicherung.
- Command und Installationspaket werden vollständig und verlustfrei komprimiert
  transportiert. Das reine 500er Offlinefixture hat bereits rund 17,6 MB
  unkomprimierten Command; eine Projektion oder Textkürzung wäre unzulässig.
  Hash, UTF-8 und endliche Größenbegrenzungen werden beim Lesen geprüft.

`prepare` verarbeitet eine private JSON-Datei mit exakt `package`,
`executorInputs`, `drafts`, `predecessors`. `executorInputs` enthält das echte
Runtime-Manifest, den unveränderten Startsnapshot, den vorab definierten Sollplan,
den vollständigen Kosten-/Routenplan und frischen Kosten-Slot. Die 500 `drafts`
stehen in der vom Commandvalidator verlangten Ownerreihenfolge und enthalten
jeweils exakt `intentId`, `profile`, `descriptor`, `briefingEingabe`,
`briefingDatum`, `sources`. Profile sind die tatsächlichen aktiven Motor-DTOs;
Quellen enthalten die originalen SOURCE23- und KO60-Zeilen. Der D-Requesthash
muss zum tatsächlichen Motorprompt, Schema und Body passen. Fiktive Testbodies
sind ausschließlich Offlinefixtures und keine ausführbaren Production-Eingaben.
Auch die gesamte Eingabedatei kann verlustfrei mit
`require("./lib/helmut/synthetik-500-direct-codec").encode(input)` vorbereitet
werden; `prepare` akzeptiert dieses begrenzte Kompressionsformat. Damit erzwingt
die private Dateigrenze von16 MiB keine Kürzung vollständiger500er Eingaben.

Alle Dateien liegen privat mit Modus 0600 außerhalb des Repositorys. Diese
Kommandos beschreiben den späteren Operatorweg; scharfe Schritte wurden hier
nicht ausgeführt:

```sh
node scripts/synthetik-500-direct.js prepare --input /tmp/500-input.json --out /tmp/500-command.json
node scripts/synthetik-500-direct.js install --command /tmp/500-command.json --admission /tmp/500-admission.json --scharf
node scripts/synthetik-500-direct.js start --command /tmp/500-command.json --out /tmp/500-start.json --scharf --vercel-oidc
node scripts/synthetik-500-direct.js next --command /tmp/500-command.json --out /tmp/500-next.json --scharf --vercel-oidc
node scripts/synthetik-500-direct.js status --command /tmp/500-command.json --out /tmp/500-status.json --vercel-oidc
node scripts/synthetik-500-direct.js stop --command /tmp/500-command.json --out /tmp/500-stop.json --scharf --vercel-oidc
node scripts/synthetik-500-direct.js export --command /tmp/500-command.json --index manifest --out /tmp/500-manifest.json --vercel-oidc
node scripts/synthetik-500-direct.js export --command /tmp/500-command.json --index 0 --out /tmp/500-position-000.json --vercel-oidc
```

`install` läuft mit dem vorhandenen Production-Storagezugang und passend
gebundenem Commit/Kostenriegel. Sie prüft alle Originaldateien der Root-Zulassung
und speichert ausschließlich das Commandpaket sowie Kosten-/Journalzulassung;
kein Modellaufruf und keine Aktivierung. Remoteaktionen benötigen den bestehenden
`HELMUT_ADMIN_SECRET` als Bearer; keine Querysecret-, Cronsecret- oder Cookie-
Ausweichroute. Die CLI setzt keine Production-Flags.

Die tatsächlichen Vercel-Adressen sind SSO-geschützt. Für die rein lesende
Live-Abnahme vom07.10. wurde der bestehende Vercel-Deployment-Zugang genutzt; es
wurde nichts angelegt oder geändert. Für diesen Bestand verwenden die Beispiele
ausdrücklich `--vercel-oidc`: ein bereits vorhandener kurzlebiger
`VERCEL_OIDC_TOKEN`, zusätzlich der Helmut-Bearer. Der Token muss nach bereits
bestehender Trusted-Sources-Regel für dieses Production-Ziel zugelassen sein;
ein Development-Token besitzt diese Berechtigung nicht automatisch. Der reine
API-Zugang `VERCEL_TOKEN` ersetzt diesen Deployment-Zugang nicht.

Alternativ wählt `--vercel-bypass` ausdrücklich einen bereits vorhandenen
`VERCEL_AUTOMATION_BYPASS_SECRET`. Beide Schalter schließen sich aus. Die CLI
übergibt genau den gewählten bestehenden Wert als Vercel-Header im gleichen
Node-HTTPS-POST an die exakt gebundene unveränderliche Deployment-URL. Kein
Kindprozess, Tokenaufbau, Refresh, Trusted-Sources-Schreibzugriff oder Wechsel
bei abgelehntem Zugang; kein Zugangswert in argv, Ausgabe oder Dateien. Frist
180s und Antwortgrenze16 MiB gelten für den ganzen Request, ohne Redirect oder
Retry. Ohne expliziten Schalter werden keine Vercel-Zugangsdaten gesendet.
Dieser Auftrag legt weder Token noch Schutzregel an. Ein gültiger Helmut-Admin-
Bearer ist hier noch nicht nachgewiesen; die Offlineprüfung benutzt ausschließlich
fiktive Werte und Transportstubs.

Rein lesende Live-Abnahme vom07.10.2026 mit dem bestehenden
Vercel-Deployment-Zugang, ohne Anlage oder Änderung: `GET /api/release/public`
liefert 200 mit JSON `ok:true`, `ready:false`, `storage:true`; `ready:false` ist
keine globale Gesundheitsabnahme. `GET /api/ops/synthetik500-direkt` liefert
ohne Bearer und mit absichtlich falschem Bearer jeweils 404, JSON `ok:false`,
`no-store`. Kein POST, in diesem Auftrag kein Command installiert, keine Aktivierung, keine
Production-Datenänderung, kein500er Lauf und0 bezahlte Production
Modellaufrufe.

Externer Zugangsblocker: Die konfigurierte aktuelle autorisierte Cloud-Umgebung
hat keine `HELMUT_ADMIN_SECRET`-Bindung; die laufende Umgebung führt weder
`HELMUT_ADMIN_SECRET` noch `HELMUT_ADMIN_SECRET_FILE`, und geprüfte
konventionelle `.env`-Dateien existieren nicht. Der Betreiber kennt keinen
bestehenden Secretpfad. Das sensitive Vercel Production Secret soll nicht
ausgelesen werden und wurde nach dieser Weisung nicht erneut angefragt. Es wird
kein Zugang erfunden und kein Secret geändert. Damit fehlt der positiv
authentifizierte Zugriff auf diesen Direct-Endpunkt; das technische
Gesamtabnahmekriterium von Blocker 1 ist NICHT vollständig erfüllt.

Letzter kleiner sicherer Nachweis: ein autorisierter Operator mit bestehendem
Secret macht GENAU EIN GET auf den exakt gebundenen unveränderlichen
Production-Direct-Endpunkt mit gültigem bestehendem Bearer und vorhandenem
Vercel-Zugang; erwartet werden 405 und `Allow: POST`. Im Handler liegt dieser
Return vor Bodylesen, Commandladen, DB und Adapter. Protokolliert werden nur
bereinigter Antwortstatus/Allow/JSON, UTC-Zeit und Commitbindung, kein Secret
und kein Requestheader. Alternativ wird das bestehende Secret über zugelassenen
privaten Cloud-/Dateizugang eingespeist, ohne das Production Secret zu ändern;
eine neue Einrichtung benötigt Betreiberfreigabe. Aus diesem Nachweis wird keine
Freigabe für Test, Aktivierung oder Modelle abgeleitet.

`start` bearbeitet nur Ownerposition 0. Jede weitere explizite `next`-Aktion
bearbeitet genau die nächste nachweislich noch unbetretene Einheit desselben
Claims. Es gibt keine interne Schleife, keinen Resume, keinen bezahlten Retry und
keine Wiedereröffnung nach unbekanntem Ausgang. 500 gleichzeitig aktive Profile
bedeuten hier die aktive Runtimekohorte; Modellaufrufe erfolgen kontrolliert
nacheinander. Nach 500 bestätigten Einheiten schließt derselbe Journal-CAS.

## Erhaltene Schutzgates

Die Rootzulassung verlangt weiterhin `nativeSource17`, `finiteW`, `nativeCodec`,
`currentFinancing`, `quiescence`, `endGuard`, `windowAuthority`, `outputContract`.
`nativeSource17` und `nativeCodec` bezeichnen vorhandene Quellen-/Codecbelege,
keine Native-D-Installation. Für den direkten Weg ersetzt `draftEvidence` das
bisherige `nativeD`; zusätzlich ist `testGo` Pflicht. Keine still erzeugte
Zulassung und keine fachliche Abnahme aus einem booleschen Testresultat.

Das separate Test-GO hat Version `helmut-synthetik500-test-go/1` und bindet
`operationId`, `productionCommit`, `deploymentId`, `planHash`, `paketHash`,
`startsAtUTC`, `endsAtUTC`, `authorizedAtUTC`, `authorizationReference` und exakt
`confirmation: SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST`. Root muss die
Referenz gegen die wirkliche Betreiberfreigabe prüfen. Originale Gate-/GO-Bytes
und ihre Pins bleiben im gespeicherten Paket erhalten und werden vor Dispatch
erneut geprüft. Dieses Dokument erteilt kein solches GO.

Vor Claim und jedem bezahlten Sender sowie vor Speicherung werden aktuelle
Quellen, aktives Profil, Berliner Briefingtag, Fenster, Deployment, Journal und
Kosten erneut geprüft. Der bestehende Runtime-Leser muss frisch exakt
500/500/501, denselben vollständigen Profilvertrag und dasselbe Enddatum
bestätigen. Kommunikationsmodus `testfenster`, exklusiver Profil-DB-Modus und
lebender bestehender Endwächter bleiben Voraussetzung. Keine neue Aktivierungs-
oder Endimplementierung; der vorhandene synthetische Runtime-/End-RPC-Weg wird
verwendet und der direkte Operator aktiviert keine Profile.

Kosten werden nicht erhöht: bestehendes Auftragslimit 7 oder bereits wirksam
20 USD und höchstens 6 USD je UTC-Tag einschließlich aller offenen/private
Reserven, Originaltickets, Verbrauch und Quittungen. Der unveränderte spätere
Nachweisvalidator verlangt weiterhin seine eigene 7-USD-Nachweisgrenze; ein
20-USD-Auftragsriegel erteilt keine Ausnahme davon. Kein künstliches Rückbuchen.

Drift, fehlende Speicherquittung, unvollständige gemeinsame Ausgabe, Abbruch,
Fristüberschreitung oder unbekannter Ausgang stoppen weitere Einheiten. Bereits
bezahlte Antworten werden abgeschlossen bilanziert und Arbeitsbelege nach
Möglichkeit genau einmal erhalten. Unbekannte INSERTs werden nicht wiederholt.
`stop` sperrt weitere Dispatche; die vorhandene Rückführung auf null aktive
Profile bleibt Aufgabe des separat nachgewiesenen Endwegs/Endwächters.

## Ergebnisbelege und spätere Nachweisabnahme

Der Manifestexport enthält Originalcommand, Zulassung und GO-Bytes, Journal,
Kostenbücher, Usage und den aktuellen Kosten-Slot mit vollständigen D-Completion-
und R-Bindungsbelegen sowie das originale Runtime-Envelope mit Startsnapshot,
Startbelegen, Aktivierungs-/Endquittung. Die 500 separaten Unitexports enthalten
vollständige private D-/R-Texte, alle drei gespeicherten Ausgabezeilen mit
Payloads, Kostenintent-IDs, originale Tickets/Usage/D-Completion/R-Bindung außerhalb
des globalen Usage-Rings und den beobachteten aktiven Runtimezustand. Auch
Fehler und nicht erreichte Positionen werden ehrlich ausgewiesen. Ergebnis- und
Journalhashes binden bestätigte Einheiten; kein verkürzter Text als Vollbeleg.

`synthetik-500-nachweis.js` bleibt unverändert streng. Für den echten Nachweis
werden zusätzlich die ursprünglichen Vollquellen, die tatsächlichen gemeinsamen
Appansichten/Renderertexte, frische Start-/End-Iststände, vollständige Kosten-
und Rückwegbelege und 1500 einzelne hashgebundene Fachurteile benötigt. Die
Operator-Rohbelege bilden die Grundlage; sie sind kein automatisch positives
Nachweispaket und ersetzen keine unabhängige fachliche Abnahme. Fehlende oder
negative Nachweise bleiben ausdrücklich offen.

## Verifikation in diesem Auftrag

Gezielte Offlineprüfungen: Direkt-Suite8/8 Gruppen einschließlich tatsächlichem
CLI-Dateipfad für normale/komprimierte private Eingaben und geschlossener Route,
Speicher-/Herkunftsdrift und Stop; bestehende Adapter-, Review-Receipt- und
Kosten-/CAS-Gegenfälle; Generator-/Review-Suite15/15 (direkter Vertrag mit
3000/6000 Tokens), kritische3/3 und EU-Alias; unveränderter Nachweisvalidator
64/64 und reale Senderdeadline 11/11 mit ausschließlich lokalen Transportstubs.
Die Direkt-Suite und die5/5 Transportgruppen (bestehende OIDC-/Bypass-Header,
fehlende/ungültige Credentials, Redirect/Antwortgrenzen/Frist, jeweils mit
lokalen HTTPS-Stubs und ohne Kindprozess oder Tokenaufbau) sind im
Standard-Offline-Lauf registriert. Einmalige Codeprüfungen DeepSeek Pro High für
Operator, Motor und vorhandene Vercel-Headers waren statusok; die gezielten
Suites und der strenge 64/64-Nachweisvalidator bleiben unverändert erhalten.
Pflicht-CI des PR #846 (37618464270) beide success. Alle fachlichen Schutzgates,
Kosten-/Tagesgrenzen, Originale, Aufrufschritte, Vollbelege und fachlichen
Nachweisgrenzen im Dossier bleiben erhalten. Native D ist keine Voraussetzung.
Dynamische Start-/GO-/Finanzierungstore werden NICHT für grün erklärt. Kein
echter500er Lauf und keine Production-Funktionsabnahme aus diesen
Offlinefixtures.
