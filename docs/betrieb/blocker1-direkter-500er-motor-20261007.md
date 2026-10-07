# Blocker 1: direkter synthetischer 500er Motorweg

Stand: 07.10.2026. Finale technische Blocker1-Abnahme des direkten Motorwegs.
Der direkte Handler ist gegenüber dem unabhängig geprüften PR #846
unveraendert. Der eigentliche 500er Test bleibt eine getrennte Abnahme; Native D
bleibt ausdruecklich zurueckgestellt und ist keine Voraussetzung. Die
unabhaengige Offlinebegrenzung dieses Dossiers bleibt bestehen: aus den
gezielten Offlineprüfungen und dem Methoden-405-Nachweis wird keine
Production-Funktionsabnahme abgeleitet.

## Merge- und Deploymentstand

[PR #846](https://github.com/ernisch/helmut-pilot/pull/846)
(Kopf `b241b36b62bf292c5efc200d17e6a45c20801320`) wurde nach ausdruecklicher
Betreiberfreigabe per Squash nach `main` gemergt:
`5cada0342b3c2218b9dd2f8ac50bdf1ee57db63a`. [PR-Pflicht-CI](https://github.com/ernisch/helmut-pilot/actions/runs/37618464270)
und [main-CI](https://github.com/ernisch/helmut-pilot/actions/runs/37621852879)
sind beide success; sie umfassen Browser und Syntax/Offline einschliesslich
Fachbereichsregression und isoliertem Datenbanknachweis. Fuer die separat
freigegebene Secretrotation/Redeploy derselben unveraenderten Codebasis wurde
genau `53e1e369696fc52b69a5378f749a47cfa607ea2b` als Stand freigegeben; dessen
[main-CI](https://github.com/ernisch/helmut-pilot/actions/runs/37625141102) ist
ebenfalls beide success. Der direkte Handler ist in diesem Stand bytegleich zum
geprueften #846; sein unveraenderter SHA256 lautet
`f79920dee3d305550d3b6750fe1f8f22a46652929ea32ab185ffbabc582359ac`. Code und
Offline sind damit unabhaengig akzeptiert und Production ausgerollt.

## Finale Zugangs- und Gesamtabnahme vom 07.10.2026

Der Betreiber hat ausschliesslich die bereits vorhandene Production-Zeile
`HELMUT_ADMIN_SECRET` autorisiert. Der Agent hat weder eine Rotation noch ein
Redeploy ausgefuehrt; beides hat der Betreiber selbst erledigt. Der Betreiber hat
einen neuen Wert privat eingegeben und gesichert; daraus entstand ein Redeploy
auf genau `53e`. Root hatte die urspruengliche Bindung vorab rein lesend
bestaetigt, bei geaendertem Deployment gestoppt und danach die neue Bindung
sowie genau einen GET vom Betreiber ausdrücklich freigeben lassen.
Es gab keinen weiteren Redeploy,
keine weitere Rotation und keinen Repair durch den Agenten. Nur die
Admin-Production-Zeile wurde aktualisiert; die Metadaten der anderen 65
Env-Zeilen blieben unveraendert. Der Agent hat keine Secretwerte gelesen oder
protokolliert.

Das neue gebundene unveraenderliche Deployment ist READY. Commit,
Deployment-ID, URL und Envmetadaten liegen ausschliesslich in privaten
0600-Belegen ausserhalb Git: die vollstaendige immutable Bindung in
`/tmp/blocker1-rotated-production-binding.json` und die finalen Metadaten in
`/tmp/blocker1-final-production-metadata.json`. Vercel-IDs, Hosts und private
Env-Row-IDs werden hier nicht veroeffentlicht.

Der abschliessende genau eine authentifizierte GET gegen
`/api/ops/synthetik500-direkt` wurde vom Betreiber lokal mit dem privat
gesicherten neuen Helmut-Admin und dem bestehenden Vercel-CLI-Zugang
ausgefuehrt. Die Antwort ist hier am 07.10.2026 im Zeitfenster 14:08-14:09 UTC
eingegangen: HTTP 405, `Allow: POST`. Das ist kein Agent-HTTP-Aufruf und kein
eigener Statusmitschnitt des Agenten; die exakte Clientausfuehrungszeit wurde
nicht gesondert mitgeteilt und wird nicht erfunden. Die abschliessenden
Vercel-Kontrollebenen-Metadaten um 14:09 UTC bestaetigen das gebundene
Deployment weiterhin READY auf `53e` und die unveraenderte Admin-Zeile.

Der positive GET belegt Authentifizierung und Methodensperre. Gemaess dem
geprueften Handler liegt der Return in Zeile 39-40 vor Bodylesen,
Commandladen, DB und Adapter; durch genau diesen GET erfolgten daher kein
Datenbankzugriff, kein Motorstart, keine Profilaktivierung und kein
Modellaufruf. Der fruehere GET mit altem Wert und 404 war ein fehlgeschlagener
Zugangsversuch und ist durch die freigegebene Rotation behoben.

Der aktuelle `main`-/Production-Alias wurde inzwischen unabhaengig durch PR #850
auf `a0b3e8179bfd94a1b63422f030317cb508d94769` weitergesetzt. Dieser Alias ist
nicht mit dem GET auf `53e` zu vermischen; es wird nicht behauptet, der neue
Alias sei per GET geprueft. Akzeptiert ist ausdruecklich das gebundene
unveraenderliche `53e`-Deployment. PR #849 bleibt ausschliesslich ein
Dokumentationsentwurf ohne Merge-GO.

Die historischen Beobachtungen des urspruenglichen `5cada`-Deployments
(`GET /api/release/public` 200 mit `ok:true`, `ready:false`, `storage:true`
sowie 404 ohne beziehungsweise mit absichtlich falschem Bearer) bleiben
ausschliesslich datierte Historie und werden nicht als Ausfuehrung des aktuellen
`53e`- oder `a0b`-Stands behauptet. Der fruehere externe Zugangsblocker ist
behoben; ein fehlendes Cloudsecret wird nicht mehr als externer Blocker
gefuehrt. Der positive Betreiberweg ist belegt, das Cloudsecret bleibt privat
ungeteilt und ist keine Voraussetzung fuer diese GET-Abnahme.

Finalurteil: Das technische Abnahmekriterium von Blocker 1 ist VOLLSTAENDIG
erfuellt. Belegt ist der ausführbare Codeweg über den bestehenden Motor für exakt
500 synthetische Profile,
kein 495-plus-5-Weg, der Erhalt von Inhaltspruefung, Speicherung,
Kostenkontrolle, Abbruch und Vollbelegen sowie die unabhaengige Codeabnahme mit
CI- und Auth-405-Nachweis. Die tatsaechliche 500-Profil-Aktivierung, der 500er
Test und die 1500 Produktergebnisbelege sind NICHT ausgefuehrt und bleiben ein
weiteres separates GO. Dynamische Quellen-, Finanzierungs- und Test-GO-Tore
werden NICHT pauschal fuer gruen erklaert; es werden keine anderen Blocker
abgenommen.

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

Die tatsaechlichen Vercel-Adressen sind SSO-geschuetzt. Fuer die rein lesende
Live-Abnahme vom07.10. wurde der bestehende Vercel-Deployment-Zugang genutzt; es
wurde nichts angelegt oder geaendert. Fuer diesen Bestand verwenden die Beispiele
ausdruecklich `--vercel-oidc`: ein bereits vorhandener kurzlebiger
`VERCEL_OIDC_TOKEN`, zusaetzlich der Helmut-Bearer. Der Token muss nach bereits
bestehender Trusted-Sources-Regel fuer dieses Production-Ziel zugelassen sein;
ein Development-Token besitzt diese Berechtigung nicht automatisch. Der reine
API-Zugang `VERCEL_TOKEN` ersetzt diesen Deployment-Zugang nicht.

Alternativ waehlt `--vercel-bypass` ausdruecklich einen bereits vorhandenen
`VERCEL_AUTOMATION_BYPASS_SECRET`. Beide Schalter schliessen sich aus. Die CLI
uebergibt genau den gewaehlten bestehenden Wert als Vercel-Header im gleichen
Node-HTTPS-POST an die exakt gebundene unveraenderliche Deployment-URL. Kein
Kindprozess, Tokenaufbau, Refresh, Trusted-Sources-Schreibzugriff oder Wechsel
bei abgelehntem Zugang; kein Zugangswert in argv, Ausgabe oder Dateien. Frist
180s und Antwortgrenze16 MiB gelten fuer den ganzen Request, ohne Redirect oder
Retry. Ohne expliziten Schalter werden keine Vercel-Zugangsdaten gesendet.
Dieser Auftrag legt weder Token noch Schutzregel an. Das bestehende
OIDC-/Bypass-CLI-Beispiel erzeugt, mintet und erneuert keinen Token; es verwendet
ausschliesslich einen bereits vorhandenen Zugangswert.

Datierte Historie des urspruenglichen `5cada`-Deployments, rein lesend vom
07.10.2026 mit dem bestehenden Vercel-Deployment-Zugang und ohne Anlage oder
Aenderung: `GET /api/release/public` lieferte 200 mit JSON `ok:true`,
`ready:false`, `storage:true`; `ready:false` ist keine globale
Gesundheitsabnahme. `GET /api/ops/synthetik500-direkt` lieferte ohne Bearer und
mit absichtlich falschem Bearer jeweils 404, JSON `ok:false`, `no-store`. Diese
Beobachtungen gelten ausschliesslich fuer das damalige `5cada`-Deployment und
werden nicht als Ausfuehrung des aktuellen `53e`- oder `a0b`-Stands behauptet.
Kein POST, in diesem Auftrag kein Command installiert, keine Aktivierung, keine
Production-Datenaenderung, kein500er Lauf und0 bezahlte Production
Modellaufrufe.

Der abschliessende genau eine authentifizierte GET auf den exakt gebundenen
unveraenderlichen Direct-Endpunkt lief als gesonderter Uebermittlungsweg ueber
die bereits angemeldete Operator-CLI des Betreibers mit dem privat gesicherten
neuen Helmut-Admin-Bearer. Erwartet und protokolliert wurden nur bereinigter
Antwortstatus, `Allow`, Empfangszeitfenster und Commitbindung, kein
Secretwert und kein Requestheader. Aus diesem Nachweis wird keine Freigabe fuer
Test, Aktivierung oder Modelle abgeleitet.

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

Gezielte Offlinepruefungen: Direkt-Suite8/8 Gruppen einschliesslich tatsaechlichem
CLI-Dateipfad fuer normale/komprimierte private Eingaben und geschlossener Route,
Speicher-/Herkunftsdrift und Stop; bestehende Adapter-, Review-Receipt- und
Kosten-/CAS-Gegenfaelle; Generator-/Review-Suite15/15 (direkter Vertrag mit
3000/6000 Tokens), kritische3/3 und EU-Alias; unveraenderter Nachweisvalidator
64/64 und reale Senderdeadline 11/11 mit ausschliesslich lokalen Transportstubs.
Die Direkt-Suite und die5/5 Transportgruppen (bestehende OIDC-/Bypass-Header,
fehlende/ungueltige Credentials, Redirect/Antwortgrenzen/Frist, jeweils mit
lokalen HTTPS-Stubs und ohne Kindprozess oder Tokenaufbau) sind im
Standard-Offline-Lauf registriert. Die drei tatsaechlichen DeepSeek Pro High
Reviews (Operator, Motor und vorhandene Vercel-Headers) bleiben unveraendert
gueltig; die gezielten Suites und der strenge 64/64-Nachweisvalidator bleiben
erhalten. In der abschließenden Dokumentationsphase wurde keine Runtime-Suite
wiederholt. Pflicht-CI des PR #846 (37618464270) beide success; der separat
freigegebene `53e`-Stand ist ueber main-CI 37625141102 ebenfalls beide success.
Alle fachlichen Schutzgates, Kosten-/Tagesgrenzen, Originale, Aufrufschritte,
Vollbelege und fachlichen Nachweisgrenzen im Dossier bleiben erhalten. Native D
ist keine Voraussetzung. Dynamische Start-/GO-/Finanzierungstore werden NICHT
fuer gruen erklaert. Kein echter500er Lauf und keine
Production-Funktionsabnahme aus diesen Offlinefixtures.
