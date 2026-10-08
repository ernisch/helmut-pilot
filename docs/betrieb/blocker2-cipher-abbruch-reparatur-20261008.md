# Blocker 2: Abbruchbefund und dauerhafte Cipher-Zwischenstaende

Stand: 08.10.2026 (Tuerkei). Ausschliesslich Blocker 2. Reparatur vorbereitet,
nicht gemergt, nicht auf Production ausgefuehrt. Kein neuer Eingabelauf genehmigt.

## Belastbarer Befund des abgebrochenen Laufs

[Lauf 37699789921](https://github.com/ernisch/helmut-pilot/actions/runs/37699789921)
auf `b92ffe2a4758f63da393bb93f44f2a74fbccbb86` endet als `cancelled`.
Der Leser wurde am 07.10.2026 um 23:19:11 UTC abgebrochen; die anschliessende
Cipher-Paketierung endet um 23:19:12 UTC mit Exit 1. GitHub meldet **0 Artefakte**.
Damit sind **0 verwertbare neue Eingaben** erhalten. Die tatsaechliche Zahl
versuchter oder erfolgter Eingabeabrufe ist unbekannt. Aus Laufzeit, Logs,
fehlenden Artefakten oder dem geschlossenen Profilkatalog wird keine solche Zahl
abgeleitet. Alle 500 Positionen sind privat einzeln als fehlender neuer
Originalbeleg verzeichnet; das bedeutet nicht 500 fehlgeschlagene HTTP-Abrufe.
Die fachliche notwendige Eingabeabnahme bleibt **0/500**.

Die 52 geschuetzten Tabellen wurden unmittelbar nach dem Abbruch und auf
erneuten Betreiberauftrag vollstaendig rein lesend gegen den Vorherstand
verglichen: Anzahl, sortierte Vollzeilenwerte und `xmin` stimmen fuer jede
Relation ueberein. Vorher: 07.10.,23:01:02.834474 UTC; unmittelbare Nachkontrolle:
23:19:59.232477 UTC; erneute Kontrolle: 23:26:09.711253 UTC. Keine Abweichung,
keine Profilaktivierung, kein Production-Write und kein Modellaufruf.
Private Rohbelege, Logs und Hashmanifeste bleiben ausserhalb von Git.

Erhalten sind Betriebsbelege: Run-/Job-/Step-Identitaet, endgueltiger Abbruch,
Paketierungsfehler, Artefaktleermenge und native Datenvergleiche. Erhalten ist
kein neuer Originalbody und keine belastbare neue Quellen-/KO-/Resolver-/
Briefingeingabebindung aus diesem Lauf. Die frueheren 435 regulaer erfassten
Eingaben und der weitere historische, ausserhalb des Zeitfensters empfangene
Body bleiben historische Originale; keine Kombination zu einer aktuellen 500er
Grundlage.

## GitHub HTTP 401

Um 23:07:23.757010 UTC scheiterte der externe `gh`-Monitorzugang. Die erhaltene
GitHub-Antwort lautet `Bad credentials`, Status `401`. Auch der versuchte
Cancel-API-Zugriff wurde zunaechst abgewiesen. Der native GitHub-Connector konnte
weiterhin lesen. Nach der Betreiberanweisung zum Abbruch funktionierte die CLI
wieder; der normale Cancel wurde angenommen, ohne Force-Cancel oder Wiederholung.
Auch die spaetere rein lesende CLI-Identitaets-/main-Abfrage funktioniert.

Das belegt eine zeitweilige Ablehnung des von dieser Arbeitsumgebung verwendeten
GitHub-Zugangsmittels. Es ist kein Beleg eines Helmut-Cron-Authentisierungsfehlers,
keines Production-Commit-Drifts und keiner Schreibwirkung. Ablauf, Widerruf,
Rotation oder ein Refreshfehler lassen sich ohne Auditdaten des
Credential-Providers nicht unterscheiden. Keine Tokenwerte auslesen, kein
interaktiver Login, keine Credential-/Konfigurationsaenderung und keine erfundene
Ursachenzuschreibung. Diese Ursache bleibt als externe Diagnosegrenze benannt.

Die Ergebnissicherung der Reparatur verwendet das vom GitHub-Runner an die
JavaScript-Aktion ausgegebene, laufbezogene Artifact-Runtime-Token. Sie haengt
nicht vom externen CLI-Zugang ab und fuehrt keine GitHub-Cancel-/Schreibaktion
mit `GITHUB_TOKEN` aus. Workflowrechte bleiben `contents: read`.

## Paketierungsfehler

Der alte Reader erstellt sein Manifest erst nach allen 500 Positionen und der
abschliessenden Identitaetspruefung. Der alte Packer verlangt das Manifest und
exakt die geschlossenen 501 Cipherdateien, bevor er irgendeinen Teil ausgibt.
Der Reader hat keine Signalbehandlung. Im Laufprotokoll wird der Node-Prozess
erst nach der gescheiterten Paketierung als verwaister Prozess beendet.

Der Fehlerweg einer unterbrochenen Aufnahme ohne geschlossenes Endmanifest ist
damit aus dem Code nachvollziehbar und lokal reproduziert. Der alte Packer
protokolliert nur eine generische Fehlermeldung; welcher einzelne Dateitest im
Runner tatsaechlich fehlschlug, ist nicht erhalten. Weder ein fehlendes konkretes
Profil noch eine Erfassungszahl werden daraus behauptet.

## Kleinster Reparaturweg mit dauerhaften Belegen

1. Der bestehende manuelle Workflow startet den gleichen Reader als lokale
   JavaScript-Aktion. Node 24 erhaelt Signale direkt; das Artifact-Runtime-Token
   ist fuer JavaScript-Aktionen vorgesehen und wird nicht aus Secrets exportiert.
2. Vor dem ersten Production-GET wird ein verschluesselter Anfangsstand mit der
   erwarteten geschlossenen 500er Menge gespeichert und sein Artifact-ID-/
   SHA256-Digest quittiert. Ohne erfolgreiche Sicherung: null Production-GETs.
3. Die erste abgeschlossene Position wird sofort gesichert, danach jede
   20. Position. Jeder Zwischenstand enthaelt seine verschluesselte Bilanz und
   nur neue, bytegleich kopierte Original-Cipher. Der Leser wartet auf die
   Uploadquittungen, bevor weitere Production-GETs erlaubt sind. Uploadfehler
   stoppen die Erfassung; kein wiederholter Eingabeabruf.
4. Ein eigener Uploadprozess erhaelt ausschliesslich freigegebene Runtime- und
   Netzwerkvariablen. Kein Cronsecret, kein Public Key, kein `GH_TOKEN`, keine
   Modell-/Supabase-Zugangsdaten. Dateien, Run, Commit, Tag, Position,
   Verschluesselungsempfaenger und Groessen werden vor dem Upload validiert.
   SDK-Rohlogs und signed URLs werden nicht ausgegeben.
5. `SIGINT`/`SIGTERM` beenden laufenden Fetch/Body und beginnen keine weiteren
   Abrufe oder langsamen Uploads. Der geschlossene lokale Endstand wird schnell
   fertiggeschrieben. Cipherdateien werden atomar bereitgestellt; unvollstaendige
   Schreibtempora liegen ausserhalb des paketierten Verzeichnisses.
6. Die bestehende `always()`-Paketierung kann ausdruecklich auch einen validen
   Teilstand ohne Manifest retten. Fremde Dateien/Empfaenger/Positionen,
   Symlinks und uebergrosse Teile bleiben abgewiesen. Der historische
   Transport-/Recoverypfad bleibt strikt auf seine 501 Originale gebunden.
   Nach quittierter vollstaendiger Endstandsicherung wird diese Rettung bewusst
   ausgelassen, damit die Originale nicht nochmals komplett hochgeladen werden.
7. Laufende Requests einschliesslich Body werden auf die verbleibende
   55min-/Berliner Tagesgrenze begrenzt. HTTP 401/403 stoppen weitere
   Profilabrufe auch bei nicht lesbarem Fehlerbody.

Der Workflow bleibt manuell, main-/Repository-gebunden und ohne automatische
Wiederholung. Exakt 500 inaktive synthetische Zielprofile, hoechstens 500
Eingabeabrufe und zwei Identitaetspruefungen; weder Motor noch Production-
Datenpfad werden veraendert. Fester Empfaenger unveraendert. Transportteile
bleiben hoechstens 20 MiB, Retention bleibt einen Tag. Maximal 64 erzeugte
Checkpoint-Artefakte (einschliesslich unklarer Teilupload-Ausgaenge) sowie die bestehenden maximal 32 abschliessenden Teile.
Diese Grenze ist fest und keine Budget- oder Production-Konfigurationsaenderung.

`@actions/artifact` ist in einem eigenen, vollstaendig gebundenen Lockfile
installiert; kein Eingriff in die Anwendungsabhaengigkeiten. Version 6.3.1 wird
ohne Installationsscripts verwendet. Die lokale Dependency-Pruefung meldet fuer
diese isolierte Installation keine bekannten Sicherheitsmeldungen.

## Grenzen und Nachweis

Ein bestaetigter Zwischenstand ist noch kein abgeschlossener Lauf. Sein
`phase: in-progress` und seine Bilanz gelten nur fuer diesen Zwischenstand.
Ohne authentifiziertes Endmanifest bleiben die endgueltigen Abrufzahlen unbekannt.
Vorliegende einzelne Originale koennen individuell geprueft werden; keine
fehlenden Daten oder Endzahlen erfinden und keine historischen Laeufe beimischen.

Nach einem harten Kill/Runnerverlust bleiben bereits quittierte Artefakte
erhalten. Seit dem letzten erfolgreichen Zwischenstand koennen bis zu 19
abgeschlossene Positionen plus der laufende Abruf ungesichert bleiben, falls
auch die abschliessende Teilrettung nicht mehr ausfuehrbar ist. Ein Kill vor der
ersten gesicherten vollstaendigen Eingabe kann weiterhin null verwertbare Inputs
hinterlassen; der bereits quittierte Anfangsstand ist dann nur ein Betriebsbeleg.
Keine Garantie, dass ein unterbrochener Lauf eine vollstaendige 500er Grundlage
erzeugt. Abrufgrenzen und Schutzstopps werden fuer Vollstaendigkeit nicht gelockert.

Offline pruefen echte SIGINT/SIGTERM/SIGKILL, unveraenderte Originalbytes,
abgebrochene Bodies, 500 geschlossene Positionen, Upload-vor-GET, initialen/
mittleren/letzten Sicherungsfehler, Uploadabbruch, Authfehler mit uebergrossem
Body, Tages-/55min-Deadline, Empfaenger-/Commit-/Run-Bindung, Secrettrennung,
Teiltransport ohne Manifest und unveraenderten historischen Recoveryvertrag.
Der Fake-Artefaktdienst dieser Tests ist kein neuer echter Productionlauf und
kein bereits bewiesener erfolgreicher Upload der reparierten Runtime in GitHub.

## Unabhaengige Endpruefung und Nachfolgekorrektur

Die kritische unabhaengige Astra-High-Pruefung des Kopfes `f6b7facf` von PR856
lautet **BLOCKED**. Dieser Kopf wird nicht gemergt. Zwei konkrete Befunde:

- Fehlgeschlagene Commit-/Profil-Schutzassertions des echten Nurlese-Endpunkts
  erscheinen durch den Server als generische HTTP500-Antwort. Der bisherige
  Reader setzte danach weitere Eingabe-GETs fort. Jede Nicht-200-Antwort setzt
  nun den Stop vor dem begrenzten Bodylesen;401/403 behalten ihren Auth-Stop.
  Vorhandene Originalbodies bleiben erhalten, weitere Positionen nicht erfasst.
- Ein Checkpoint kann einige Artefaktteile erfolgreich erzeugen und erst danach
  scheitern. Ohne Gesamtquittung ist die verbleibende Kapazitaet unklar. Nach
  Beginn eines Uploads bleibt ein Fehlerriegel bis zur vollstaendig validierten
  und gespeicherten Quittung gesetzt. Ein unklarer Ausgang verbietet weitere
  Checkpoint-Transporte; die schon begrenzte32-Teile-Rettung bleibt verfuegbar.

Gezielte Offline-Gegenproben umfassen echte generische500-Fehlerantworten,
503 mit Schreib-/Modell-/Commitwiderspruch, unerwartete302-Antworten,
uebergrosse500-Bodies und Teiluploadfehler nach61 quittierten Artefakten sowie
ungueltige bzw. nicht speicherbare Quittungen. Keine echten Productionabrufe.
Die neue Korrektur benoetigt gruene Pflicht-CI und eine unabhaengige Abnahme
ihres eigenen exakten Kopfes. Lokales Laden der exakt gebundenen SDK6.3.1
unter Node24 ist belegt, tatsaechlicher GitHub-Upload noch nicht.

Der Betreiber hat am08.10. die autonome Fortsetzung ausschliesslich fuer
Blocker2 einschliesslich notwendiger Code-/PR-Arbeit, unabhaengiger Pruefung,
gepruefter Merges und regulaerer Production-Deployments freigegeben. Der
Nurleselauf bleibt an exakt500 inaktive Synthetikprofile, hoechstens500
Eingabe-GETs, hoechstens zwei Identitaetschecks, maximal55 Minuten sowie
denselben Production-Commit und Berlin-Tag gebunden. Vorher/nachher alle52
Tabellen vollstaendig rein lesend vergleichen; Cipher-Originale innerhalb
Retention sichern. Bei Fehlschlag zuerst konkrete Ursache und Zwischenbelege,
gezielte Reparatur, neuer gepruefter PR; keine blinde Wiederholung und dieselbe
technische Methode hoechstens zweimal.

Bis zum vollstaendigen positiven Fachnachweis bleibt die Eingabeabnahme
**0/500**. Neue Production-Daten-/Profilaenderungen, Aktivierung, bezahlte
Helmut-Production-Modellaufrufe und500er Funktionstest bleiben gesperrt;
kein automatischer Rueckweg. Historische435 nie mit neuem Teilstand auffuellen.
