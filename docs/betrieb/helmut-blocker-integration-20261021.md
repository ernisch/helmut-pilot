# HELMUT: Blocker vor einem weiteren 500er Lauf

Stand 21.10.2026 UTC. **Teilweise abgeschlossen; kein Startgrün.** Branch
`codex/controlled-cleanup-and-late-probe-20261020`, Entwurf
[PR927](https://github.com/ernisch/helmut-pilot/pull/927).
Die Abhängigkeit PR927→926→925→924 bleibt erhalten; kein Merge auf main.
Commit `c8624f7c` und spätere Motoränderungen bleiben erhalten.

## Repariert und gezielt geprüft

Der optionale lokale PostgREST-Pfad ist jetzt durch Connector, RuntimeRequest,
Connection, Recipe, Sourceadoption, Broker, DB-Supervisor und Abschluss verbunden.
Default bleibt aus. Der bestehende vollständige lokale Prüfvertrag und das neue
separate Betreiber-GO bleiben erforderlich. Es wurde kein Backendplan und keine
Laufautorität erzeugt.

Der DB-Supervisor erzeugt den Scope nach tatsächlichem GO, Reservierung, Claim
und Aktivierungsbeleg und besitzt den Ownerprozess unmittelbar. Dieser besitzt
PostgREST unmittelbar. Quelle, Binärdatei, Konfiguration, frisches lokales JWT,
Nonce, Container, Controlleraufruf und tatsächliche Kernelgruppe sind gebunden.
Eine positive Datei genügt nicht: der Owner muss ebenfalls erfolgreich enden.
Die bestehende quellvertrauende SQL-Brokergrenze ist dadurch nicht zu einer
allgemeinen Isolation gegen kompromittierten Anwendungscode geworden.

Unabhängige SOL-Quellenprüfung fand und schloss sieben konkrete Kanten:

- Beide Anwendungspfade zum gesamten DB-Ausgabeverzeichnis sind schreibgeschützt;
  nur das feste Stopcontrol-Verzeichnis ist schreibbar.
- Requests und neue Poll-Belege werden vollständig mit `renameat2` und
  `RENAME_NOREPLACE` veröffentlicht, ohne sichtbares Teilfile oder Hardlinkfenster.
- Fehler beim Schreiben eines Fehlerberichts verhindern die Prozessbereinigung
  nicht mehr.
- Frist, Uhrabweichung und Unterbrechung werden nach der Ergebnispersistenz
  erneut geprüft; eine vorher geschriebene positive Datei ersetzt keinen Exit0.
- Arbeitsende muss strikt vor Abschlussende liegen.
- Die tatsächliche Backendfrist muss den unveränderten Workflow-Sockel von
  10.685,884867s plus 600s Reserve aufnehmen; die maximale Lebensdauer bleibt
  höchstens 33.000s.
- Derselbe Zeitnachweis wird nach Setup unmittelbar im finalen Authoritypfad
  vor Claim und Start erneut verlangt.

Der Anwendungsabschluss prüft begrenzt gelesene, reguläre, einzelne Dateien an
festen Mountpfaden und vergleicht Resultat, Scope, Plan und Hostbindung.
PG-Exit0 allein ist kein Erfolg. Die optionale Infrastrukturwartezeit ist fest
180s, die bisherige bleibt 45s. Unit60, Auth30 und die Ownerfrist bleiben gleich.

Der CAS-Beobachter zählt nur tatsächlich bestätigte Mutationen. Wiederholte
Callbacks bei bestätigtem Revisionskonflikt erzeugen keine zweite bestätigte
Einheit. Fehlende Bestätigung erzeugt keinen Erfolgsbeleg; keine Wiederholung
bei unbekanntem Ausgang. Der Beobachter muss ausdrücklich in der unabhängigen
Quellenabnahme enthalten sein.

Sieben gezielte Prüfgruppen auf dem zusammengeführten Rootstand bestanden:
Owner, Supervisor, Broker/Originalrenderer, Abschluss, Python-Eingabekette,
JS-Service und JS-Eingabekette. Sie verwenden simulierte Prozesse bzw. reine
Eingabeprüfungen. **Keine neue native Prozess-, Mount-, UID-, Kernel-, Unit60-
oder vollständige Ressourcenabnahme daraus.** Historische Offline- und native
Vergleichssuiten wurden nicht erneut vollständig ausgeführt.

## Plattenplatz

Sieben abgeschlossene eigene Containerhüllen wurden nach vollständiger
Image-/Delta-/Metadatenprüfung einzeln entfernt. Beobachteter Gewinn in diesen
getrennten Fenstern: 6.381.715.456B. Zwei abgeschlossene eigene Git-Arbeitsbäume
ergaben zusätzlich 76.365.824B bzw. 76.718.080B. Diese Fenstersummen sind kein
behaupteter Nettozuwachs über die gesamte Arbeitszeit.

Vor jeder Entfernung wurden Umfang, Schutzprüfung und Rückweg dauerhaft
gespeichert. Gemeinsame Gitobjekte und Branches bleiben erhalten; sechs
ignorierte Cache-Dateien des letzten Arbeitsbaums wurden vollständig gesichert
und zurückgelesen. Originaldaten, Originalcontainer, notwendige V11-/V12-Kopien,
Belege, aktive Ressourcen sowie Root- und Preview-Änderungen blieben erhalten.
Es gab keine pauschale Dockerbereinigung.

Nach den letzten Belegen: **15.227.342.848B frei**, unverändert erforderlich
15.179.779.720B, Abstand 47.563.128B. Darin bleiben 8GiB Hostreserve, 2GiB neues
Dateisystem, sechs kalkulierte Containerhüllen und 512MiB Abschlussausgaben
berücksichtigt. Das ist eine Kapazitätsaufnahme, keine kontinuierliche Reserve
und kein positives Ergebnis der übrigen 31 Startbedingungen.

Künftige temporäre Ressourcen erhalten vor Erstellung eindeutigen Eigentümer,
Zweck und Schutzklasse. Nach Abschluss bleiben sie zunächst erhalten. Erst
verifizierte Sicherung, vollständiger Readback, dokumentierter Rückweg,
Nutzungsprüfung und ein exakter einmaliger Entfernungsbefehl erlauben die
kontrollierte Freigabe. Unbekannter Ausgang beendet den Vorgang ohne Retry.

## CI und Vorschau

Der Vercel-Globfehler ist repariert. Die tatsächliche Preview zu Commit
`275c137f40289db072f84b20e2b2ecbde01c74ce`, Deployment
`dpl_EiKs2SxXv131qEktcRhE1Ntgwgry`, wurde als **READY** gelesen:
<https://helmut-pilot-21up9pz4p-nohut.vercel.app>.
Das ist kein Production-Deployment und zunächst kein Beleg späterer Commits.

GitHub-CI-Lauf `39677801111` auf demselben Commit: Browser/Mobile PASS,
Offline FAIL an der fehlenden echten privaten Originalbindung. Das Repository
ist öffentlich. 83 benötigte Originaldateien mit 83.490.369B sind inventarisiert;
der streng begrenzte Provisionierer ist vorbereitet und negativ geprüft.
[Privater Bereitstellungsvertrag](private-ci-original-provisioning-20261021.md).
Secrets-/Runner-/Actions-Administration antwortet hier HTTP403; ein geschützter
privater Übergabekanal ist nicht eingerichtet. Das lässt sich nicht durch
Ersatzoriginale, öffentliche Originaldateien oder ausgelassene Prüfungen beheben.

## Noch offen

V12 hat 499 ACKs; Index499 ist bereits betreten und endete mit Unit60-Fehler.
Der gespeicherte späte Zustand ist ein authentischer Zustand nach dem Lauf,
kein belegter Zustand unmittelbar vor Index499. Den alten Command, Claim,
Journalstatus oder GO erneut zu verwenden ist kein zulässiger Diagnosetest.

Ein vorhandener Ein-Unit-Vertrag für den vollständigen späten HTTP-Motorpfad
existiert nicht. Ein eigener lokaler Diagnosevertrag müsste `sourceIndex499`
von `diagnosticUnit0` trennen und Journal, Kostenadmission/-abrechnung,
Reservierung, Sendclaim, Review und Ergebnisbelege durchgängig separat binden.
Der feste aktive Authslot, Tageskennungen und Stored-Command-/Kalenderbindungen
dürfen dabei nicht über einen neuen äußeren Dateinamen umgangen werden. Das
ist noch fehlender sicherheitskritischer Code, keine aktivierbare Startoption.
Die neue Ownerintegration selbst lässt ausschließlich den bestehenden Fullscope
zu und erteilt ebenfalls keine Ein-Unit-Autorität.

Der vorhandene echte HTTP-Komponentenvergleich OLD/NEW/NEW/OLD bleibt gültig:
gemeinsame Peakmittel 718.508.032→640.927.744B, Ersparnis 77.580.288B;
beide Paarvergleiche positiv. Das beweist weder ein dauerhaftes Plateau noch
Unit60 im vollständigen Motor oder 500MB Reserve bei 500 Profilen.
Diese Komponentenersparnis wird nicht vom alten Volltestpeak abgezogen.

Das alte akzeptierte Fenster endete am 21.10. um 21:30UTC. Slot12, Setup,
Command und sämtliche früheren GOs bleiben verbraucht. Vor einem späteren
vollständigen Versuch fehlen weiterhin echte native Abschlussabnahme, Unit60,
geschlossene private CI-Bindung, aktuelle Quell-/Kalenderannahmen und alle
32 frischen Startbedingungen. **Erst danach ist ein neues konkretes GO für
genau einen vollständigen Lauf sinnvoll.** Kein vollständiger Lauf wurde hier
gestartet; keine Production-Aktion, kein Merge und keine bezahlte Infrastruktur.

## Belege und Fortsetzung

[Quellen, Prüfgruppen, Kapazität und Grenzen](belege/next-local-full500-20261021/BLOCKER_INTEGRATION_CHECKPOINT.SAFE.json).
Private Rohlogs liegen unter
`/workspace/helmut-ram-fix-20261020/next-full500-20261021/blocker-integration-20261021`;
Cleanupketten unter `cleanup-blockers-20261021` im selben Sprintverzeichnis.
Archive und Rollbackbelege bleiben dort erhalten.

Nächste Umsetzung: den getrennten lokalen Ein-Unit-Prüfvertrag konkret und
ohne Lockerung der Originalwächter ausarbeiten; parallel muss ein Repository-
Administrator den beschriebenen geschützten Originalkanal bereitstellen.
Es fehlt dafür keine allgemeine Entwicklungsfreigabe. Ein späterer Voll500
benötigt weiterhin sein eigenes neues konkretes GO. Fortsetzung in diesem
Thread anhand dieser Pins, hohe Denkstufe; keine allgemeine Neuanalyse.
