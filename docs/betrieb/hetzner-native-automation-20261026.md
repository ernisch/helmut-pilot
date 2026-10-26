# HELMUT: begrenzte autonome Hetzner-Steuerung

Aktuelle Fortsetzung: [Vor-ARM-Fehlerdatei](#vor-arm-fehlerdatei-des-alten-guards)
und CURRENT_STATE. Die [Thread-Uebergabe](helmut-thread-handoff-20261026.md)
bleibt die verifizierte Ausgangsbasis; ihre Stopp- und Schutzgrenzen gelten weiter.
Dieses Dossier enthaelt auch historische Zwischenstaende, keine neuen Laufrechte.

## Fester SAFE-Metadatenlesepfad nach der Einrichtung

Der getrennte Folgepfad `runtime-metadata-v1`/`status` liest ausschliesslich
`READONLY_RUNTIME_BINDINGS.SAFE.json`:207733Bytes, SHA256
`71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475`.
Diese SAFE-Metadatei ist bereits ein eigener Dateidatensatz des uebertragenen
Quellpakets. Sie benennt die noch zu qualifizierenden Runtime-Ableitungen;
eine neue Originaluebertragung oder Gesamtinventur ist dafuer nicht erforderlich.
Ein Aufruf installiert nichts und startet keinen nativen Fall.

Der Reader bindet den historischen Setupstand Main
`8139b3a99d04e3e854f886123869bf669da6389d`, Server `1fc63bf8...0ec58fe`,
Vertrag `e5ffcce6...5d4d4059` und alle zehn alten Modulquellen fest.
Authority, Once, gespeicherte Inspektion, alle vier ACCEPTED-/Job-Siegel sowie
die elf Dateien jedes Jobs und die Komponentenbelege werden vor und nach dem
Lesen positiv geprueft. Echte Belegshashes werden aus rootgeschuetzten Dateien
abgeleitet; der Aufrufer kann keinen eigenen Ausgangszustand behaupten.

Nur der genaue am Source-Scope gebundene Dateidatensatz liefert Besitzer und
Modus; fehlende Metadaten gelten nicht als leer. Jeder Abruf liest die gesamte
Datei ohne Atime-Aenderung, prueft Groesse, Hash, Pfad-/Dateimetadaten sowie
eindeutiges UTF8-JSON und gibt genau einen von vier festen65536-Byte-Chunks aus.
Keine freien Pfade, Quellen, Grenzen oder Exportfreigaben im Request; kein
Export von Schluesseln, Originalpayloads oder ungeprueftem Originalquellcode.
Die feste SAFE-Freigabe ist Teil des geprueften Readercodes. Der eigene Vertrag
hat SHA256 `8909ca48f13ea836abdf6b8833bd1341a5c2dec2007a7ea2f4e0088cd5a9c91b`.

Client/Server binden Modus, Host100.96.83.66, Quell-/Vertragshash, kanonische
Kapsel, maximal300Sekunden und einen eigenen Requesthash. Gueltige Fehler
bleiben als rote SAFE-Artefakte erhalten; ohne positive Bindungen keine Daten.
Der Transport schreibt seine normalen Request-/Resultbelege. Nativeflags
bleiben false. Das bisherige Setupfenster wird nicht verlaengert.

Der neue Readercode wird erst nach vier tatsaechlichen ACCEPTED auf dem
unveraenderten Setup-Deploymentcommit gemergt. Er ist ein weiterer Lesebeleg,
keine Abnahme einer fertigen Runtime oder beschreibbaren Entwicklungsumgebung.

## Vor-ARM-Fehlerdatei des alten Guards

PR959 ist auf Main `18c2736ac4da2cf946ccb4494ad2963091de7d32` gemergt.
PR-CI40339552837 und Main-CI40343223008 sind vollstaendig gruen;
Vercel `dpl_42Mg9Ebk24VSG1RzkC7rNqa9JPdk` ist auf diesem Commit READY.
Der erste neue reine Setup-Inspector40348666536 (Job121662423999,
Artefakt12662846919) meldet `FAIL_KEEP_STATE_NO_RETRY`/`HISTORY_ERROR_DUPLICATE`.
Es wurde kein neuer admit-/Recover-Aufruf angefordert und kein Restore gestartet.
Der bestehende Fehler, neue Request-/Resultbelege und die Originale bleiben erhalten.

Requestnonce `67d6b8fc96fff1a9d87cbfeb677e49a2fcf4bdae4d4d12ac3a0cb10bf2d48947`,
Quellhash `afbccf72ad9f60ea84091567268c3b7927bcc6df9d99dac0c5da61e27e546a85`,
Vertrag `029d6e301758fd27172a58c03ae99ae2003f93f84c37959192ad1124a93a5738`.
Der vollstaendig zurueckgeladene869-Byte-ZIP hat SHA256
`9a41eda8138def114b5859bd28a15bfd638136efb6c78df433def3284de18e7b`;
Antwort-SHA256 `56d6dafd31f1c925be4d1495cf37a40dc7ad3617fc0ee29b0c073d30ecdd18e4`,
Result-SHA256 `550087770901e7f268da0d09417a7c106bf0bfe51cd8b9a503b288c9691b2ea0`.
Der gepinnte Client bestaetigt den geschlossenen Fehlerbeleg, beide Nativeflags false.

Die Ursache der zu engen Vorbedingung ist anhand des exakt historischen Guards
aus17be62b5 belegt:34133Bytes, SHA256
`a41ddc422f5c49f5f6abae87758ce47bd91d4008494bedf46ebff0bf9192659c`.
Parent und Worker schreiben ueber `renameat2(RENAME_NOREPLACE)` denselben
Erstfehlerpfad. Wenn der Parent `UNIT_PROPERTIES` publiziert, bevor der Worker
seine anfaengliche Abwesenheitspruefung erreicht, erzeugt dieser stattdessen
`WORKER_ALREADY_ATTEMPTED`; die verlorene Publikation hinterlaesst genau einen
Temp. Beide Schritte liegen vor ARM. Die fruehere Forderung nach bytegleichen
Fehlerdateien war geschlossen, aber fuer diesen quellbelegten Ablauf zu eng.

Die Reparatur erlaubt zusaetzlich nur diesen vollstaendigen kanonischen
Master-/Temp-Fingerprint:211Bytes/
`16add10cda6a9f5ba7c73ddf5f57dc5599c792b69c80567f44ba62420d976060`
und220Bytes/
`97dc56c00c04996da08ab3ccd98e410b35de30dca5714a87d02db0ba4150c18f`.
Alle bisherigen Fehler-/JOB-/Quellpins, exakte Dateimengen, Berechtigungen,
unveraenderte Metadaten, aktuelle Prozessenden und unbenutzte Komponenten
bleiben zwingend. Client und Preflight muessen dieselbe feste Kombination pruefen.
Unbekannte, veraenderte, nichtkanonische oder teilweise Dateien bleiben STOP.
Insbesondere `WORKER_FAILED` und `CONTROLLER_LOST` werden nicht freigegeben.

Vier unabhaengige synthetische Nachstellungen auf dem unveraenderten alten
Guard bestaetigen den Ablauf und den Unterschied zu Fehlern nach ARM. Sie
belegen noch nicht die tatsaechliche Tempklasse auf Hetzner. Diese bleibt bis
zu einem neuen begrenzten, positiv validierten Inspector offen; vorher kein
Einrichtungsschritt. Es gibt keinen Markerreset oder Wiederholung alter Requests.
Der Reparaturstand besteht666 synthetische Pruefungen und acht unabhaengige
Zusatzfaelle; Current-State-Groessenpruefung und Diffpruefung sind ebenfalls gruen.
Das feste Setupfenster wird nicht verlaengert. Der vorbereitete Runtime-Metadaten-
PR960 bleibt Entwurf; sein historischer Bezug muss nach dem Setupfix aktualisiert
werden und darf nicht vor vier tatsaechlichen Setup-Abnahmen gemergt werden.

## Neuer gebundener Setupweg (26.10.2026 Istanbul)

Der Betreiber hat nach PR958 ausdruecklich die tatsaechliche vollstaendige
Einrichtung beauftragt und den Umfang auf **Arbeits- und Testumgebung** begrenzt.
Production bleibt ausserhalb dieses Umzugs. Diese neue Einrichtungsanweisung
ist die Grundlage eines getrennten, eng gebundenen Nachfolgevertrags; alte
Fehlversuche oder Nonces werden nicht wiederverwendet und keine Einmalsperre
geloescht, umbenannt oder zurueckgesetzt. Die native Mess-/500er-Freigabe folgt
daraus nicht. Originale, private Schluessel und die Quellcloud bleiben erhalten.

Die unabhaengige Architekturpruefung hat den frueheren lokalen Entwurf
praezisiert: Ein neuer aeusserer Operationsname ist nicht erforderlich. Der
vorhandene unveraenderliche Bootstrap ist ausdruecklich vertrauenswuerdiges
Root-Code-Deployment aus CI-qualifiziertem aktuellem Main. Ein expliziter neuer
Untervertrag kann deshalb unter `admit` laufen, ohne Bootstrap, POLICY,
Root-Keyeintrag, aeussere Planbindung oder vorhandenen Tailscale-Zugang zu aendern.
Die bereits erledigte Mac-Abfrage wird nicht nochmals angefordert.

Der Workflow bleibt standardmaessig `disabled`. Nur `setup-inspect-v1` mit
`status` oder `setup-successor-v1` mit `admit` und einer geschlossenen neuen
Admission-Kapsel oeffnen den neuen Pfad. Die kanonische zweite stdin-Zeile wird
mit EOF, Laengen-/Zeitgrenze, Quell-/Vertragsbindung und eigenem Requesthash
geprueft. Ein neuer Nonce allein ist keine Autoritaet. Legacy-Clients ohne
Kapsel behalten ihren bisherigen, weiterhin gesperrten Setupweg. Der Client
bindet neue Modi zusaetzlich exakt an den bestaetigten Host100.96.83.66.

Die feste gleich-Commit-[Vertragsdatei](hetzner-setup-successor-contract-20261026.json)
bindet Ziel, Fall, Scope, Server-/Koordinator-/Library-/Preflight- und Assetpins,
die vier einzeln anzufordernden Phasen recover/checkout/context/image und ein
maximal sechsstuendiges UTC-Fenster. Das vorbereitete Fenster entspricht
26.10.2026,16:57:31 bis22:57:31 Europe/Istanbul. Es wird nicht durch einen
Quellwechsel oder einen neuen Request automatisch verlaengert.

Vor der ersten Wirkung sind alte Fehler-/Jobdateien, alle historischen Quellen,
der gesamte alte Jobordner und aktuelle Prozess-/Unit-/Cgroup-Enden positiv zu
binden. Fehlende Exec-Felder gelten nie als leer; die sechs Listen brauchen
explizit typisierte D-Bus-Werte. Auch der vorhandene Gzip wird frisch gegen
Groesse, Hash und unveraenderte Metadaten gelesen. Die Inspektion liest keine
privaten Schluessel und fuehrt keinen Restore oder nativen Fall aus. Der
Transport schreibt weiterhin seine normalen Request-/Resultbelege; die gesamte
Operation darf daher nicht als vollstaendig schreibfrei bezeichnet werden.

Erst der echte auf dem Ziel gespeicherte Inspektionsbeleg, der feste qualifizierte
Vertrag und ihre erneute aktuelle Bindung erlauben einen eigenen dauerhaften
Autoritaetsbeleg und Once-Slot ausserhalb der Deploymentversionen. Neuer
Job-/ACCEPTED-Zustand liegt ausschliesslich unter dem festen Successor-Namespace.
Alte globale Fehler und alte Jobs bleiben positiv gebundener gescheiterter
Vorgaenger. Vorhandene oder unklare kanonische Recovery-/Komponententeilstaende
stoppen auch den neuen Vertrag. Kein neuer Ausgabepfad ist ein automatischer Ausweg.

Die unabhängige Endprüfung hat vor jedem Zielaufruf zwei echte Luecken gefunden:
ungebundene zusaetzliche Legacy-Jobs sowie fehlende/veraenderte bereits akzeptierte
Successorjobs. Sie werden mit vollstaendiger alter Rootbindung, exakter neuer
Jobmenge und privaten, an die echte Lifecycle-Abnahme gebundenen Job-Siegeln
geschlossen. Alle Quellen, ARM/ACK/RESULT-Belege, Dateimengen und Metadaten muessen
vor und nach jedem Folgeschritt erhalten bleiben. Fehler/Partials erzeugen keine
neue Versuchszulassung. Nach den Sicherheitskorrekturen bestehen661 synthetische
Pruefungen sowie13 unabhaengige Zusatzfaelle; Pflicht-CI folgt auf dem finalen PR-Kopf.

Stand dieses Implementierungsabschnitts: eigener Entwicklungsbranch
`codex/hetzner-setup-successor-20261026`, noch kein Zielaufruf. Es wird keine
erfolgreiche Wiederherstellung oder vollstaendige Hetzner-Arbeitsumgebung behauptet.
Vor jedem neuen echten nativen Messfall bleiben frische Quellen-/Original-/Runtime-
und Ressourcenbindungen sowie das konkrete Betreiber-GO Pflicht.

Der Betreiber hat am26.10.2026(Istanbul) autonome Arbeit und notwendige
Automatisierung ausdruecklich freigegeben, einschliesslich Merge und Deployment
nach vollstaendig gruenen Pflichtpruefungen. Die aeltere reine Probevorbereitung
wird dadurch gezielt erweitert. Die dauerhafte Arbeitsregel steht in AGENTS.md.

## Gesicherter Merge- und Deploymentstand

PR947 ist nach erfolgreicher unabhaengiger Abnahme und gruenem CI40246626996
auf Head418c67e8243d88377bf05781f8c5a1d42d36b93c gemergt. Mergecommit
`234ffe8739cd276e697bd192d8053ffc1ca65c09` ist auf main bestaetigt. Vercel-
Productiondeployment `dpl_88PMRoUjSFtDHFMwXAURZxk8jMub` ist auf genau diesem
Commit READY. Der nachfolgende Integrationsfix ersetzt ausschliesslich den nicht verfuegbaren
GitHub-Variablenschalter durch einen standardmaessig gesperrten Dispatchmodus;
Root-Bootstrap, Server, Client und Mac-Installer bleiben unveraendert.

Der Main-CI40249022904 ist SUCCESS. Die anschliessende einmalige Mac-Ausfuehrung
meldet den Root-Keyeintrag VERIFIED, stoppt aber bei RECIPIENT_CREATION_FAILED.
Die Installation ist damit teilweise erfolgt; der Empfaenger ist nicht abgenommen.
Der konkrete GPG-Erstfehler ist aus der Betreiberantwort noch nicht bekannt.
Kein erneuter Installer-/Erzeugungsversuch, Originaltransfer oder nativer Lauf.

## Konkreter Umfang

Ein separat gestarteter Workflow `hetzner-native-automation.yml` nutzt das
vorhandene geschuetzte Environment, dessen bestehenden SSH-Schluessel und
Tailscale-OIDC. Ausschliesslich `main`, der exakte Repository-/Workflowbezug,
ein neuer Nonce sowie Plan- und Quellhash sind zugelassen. Der bestehende
Probe-Workflow, dessen Gate und `probe-only-v1`-Variable bleiben unveraendert.
Jeder Aufruf verlangt den ausdruecklichen
Dispatchmodus `controlMode=control-v1`; Standard ist `disabled`. Es ist keine
neue GitHub-Variable und kein weiterer administrativer API-Zugang erforderlich.
Der Integrationszugang verweigert Variablenverwaltung mit HTTP403; dieser
Ressourcenzugriff wird nicht umgangen oder erweitert. Der Abschalter ist die
standardmaessige Workflow-Deaktivierung; bestehende Probevariablen bleiben gleich.

Der einmalige Mac-Administratorbefehl uebernimmt nur den bereits vorhandenen
CI-**Public**-Key zielintern in die tatsaechlich wirksame Root-Keydatei. Der
Eintrag verlangt die Tailnet-Quelladresse, `restrict` und einen festen
ForcedCommand. Bestehende Root-Keys werden vollstaendig erhalten und zuvor
root-privat gesichert; keine SSH-Konfiguration, neuen Konten oder sudo-Rechte.
Der private Mac-Key bleibt auf dem Mac, der private CI-Key bleibt bei GitHub.

Dies ist **Root-Code-Deployment aus vertrauenswuerdigem `main`**, keine Sandbox.
Der unveraenderliche Bootstrap akzeptiert ausschliesslich das feste Servermodul
aus diesem Repository. Er prueft den gesamten Quellhash, unveraenderten Mainkopf,
die GitHub-Actions-App und die Bindung Check/Suite/Run/Job an genau diesen Commit.
Beide echten Pflichtjobs muessen erfolgreich beendet sein. Zusaetzlich muss der
tatsaechliche CI-Schritt `Native automation boundary qualification (synthetic)`
erfolgreich sein; eine uebersprungene Pruefung genuegt nicht. Jede kritische
Quellaenderung bleibt unabhaengig abzunehmen.

## Aktueller Startumfang und Schutz

Anfangs sind nur `status` und `recipient` freigeschaltet. Der Empfaengerschluessel
wird einmal auf Hetzner erzeugt; nur der oeffentliche Anteil darf den Server
verlassen. Private Schluesseldateien bleiben root-geschuetzt. Fehler und
Teilzustaende bleiben erhalten; kein automatischer Erzeugungsretry.

`stage`, `admit` und `four-tx` sind auf Client und Server noch gesperrt. Ihre
spaetere Implementierung benoetigt Quellenabnahme und vollstaendige Original-,
Runtime- und Ressourcenpruefungen. Der Once-Slot liegt dauerhaft ausserhalb
aller Modulversionen und ist an die feste root-eigene Autoritaet gebunden.
Ein anderer Quellhash darf keine verbrauchte Vier-TX-Freigabe reaktivieren.
Keine freie Shell, beliebigen Dateipfade/URLs, SSH-Forwardings, SCP/SFTP,
Loeschungen oder allgemeine Container-/Datenbankbefehle im Protokoll.

Der aktuelle Motor bleibt PR942/29b05ac0. Es wurde kein nativer Komponentenlauf,
Unit60- oder500er-Lauf durch diese Einrichtung gestartet. Auth30,Unit60,
1.548.000.000Bytes gemeinsamer Peak und500MB Reserve bleiben unbewiesen.

## Nachweise und naechster Schritt

Der erhaltene bereinigte Operatorbericht bestaetigt33/33 Pflicht- und zwei
diagnostische Serverpruefungen. Rund152GB Festplattenplatz waren frei. Das ist
eine Servervorbereitung, keine native Laufabnahme. Die alten fehlgeschlagenen
Aktivierungsbelege bleiben unveraendert.

Die neuen synthetischen Tests laufen ohne Zielzugriff, Originale, GPG-Erzeugung
oder Anbieter ueber:

```sh
node scripts/lokal.js -- python3 -I -S -B scripts/hetzner-native-automation-tests.py
```

Lokal93/93 bestanden:27 Bootstrap-,8 Server-,21 Client-/Protokoll-,21
Empfaenger- und16 Installerpruefungen. Bootstrap, Server und Installer wurden
zusaetzlich unabhaengig durch SOL gegenprueft. Das ist keine Zielausfuehrung.

Erst nach gruenem finalem PR-Stand, unabhaengiger Abnahme, autorisiertem Merge
und gruenem Main-CI folgt der gebundene Mac-Installer. Danach werden der neue
Steuerzugang und der oeffentliche Zielschluessel tatsaechlich ueber Actions
abgenommen. Originalklassifizierung, verschluesselte Drive-Uebertragung,
Wiederherstellung und native Admissions bleiben getrennte nachfolgende Arbeit.
Kein vollstaendiger500er-Lauf aus der Automatisierungsfreigabe ableiten.

## Begrenzter Erstfehlerbefund nach dem Einmalsetup

`status` liest zusaetzlich ausschliesslich die vorhandenen Erstfehlerdateien
`RECIPIENT_FIRST_ERROR.SAFE.json` und `GPG_FIRST_TOOL_ERROR.PRIVATE.json`.
Der Zugriff verlangt O_NOATIME/O_NOFOLLOW, root:root,0600, einen Link,
hoechstens64KiB und unveraenderte Metadaten waehrend des Lesens. Es gibt keine
GPG-Ausfuehrung, Schluesseluebernahme, Erzeugung, Bereinigung oder Wiederholung.

Server und Client erlauben nur feste Phasen, Fehlercodes, Toolklassen und Hashes.
Rohes stderr, Base64-Fehlertext und private Inhalte verlassen den Server nicht.
ABSENT, UNTRUSTED und UNRECOGNIZED bleiben ausdruecklich getrennt; ein fehlendes
Toolprotokoll beweist keinen fehlerfreien GPG-Aufruf. CONTROL_READY bestaetigt
nur den Steuerkanal, niemals einen angenommenen Empfaenger oder native Admission.

105 synthetische Tests bestanden, einschliesslich12 gezielter Diagnosefaelle.
Die urspruengliche Empfaengererzeugung, Bootstrap, Installer und native Sperren
bleiben unveraendert. Die eigentliche Korrektur haengt vom echten Zielbefund ab.

## Tatsaechliche Steuerabnahme und begrenzte vorhandene-Key-Recovery

PR948/949 sind gemeinsam auf `75199d0977c41c07caabe10f8d4e279471789ad0`
gemergt. Main-CI40253752518 ist SUCCESS, einschliesslich des echten
Boundary-Pruefschritts. Vercel dpl_DnGSCvNiDEiYDXiDAcxDBb44QiBg ist READY.
Actions40255561266 hat den Root-Steuerkanal erstmals tatsaechlich abgenommen.
Artefakt12621954007/Response-SHA
`ecf4f650722948c545fd5a1ae205f1a278c8cd66a4691e615a0612661100673a`
bindet den beobachteten Erstfehler PUBLIC_IDENTITY_OR_VALIDITY/verify-public;
der erste GPG-Toolfehler fehlt. Beide Erzeugungsbefehle hatten nach dem exakten
Codepfad bereits Erfolg. UID und einzelne Vertrauenswerte sind noch nicht
auseinandergehalten; eine Cacheursache ist vor der echten Liste nicht bewiesen.

Die vorbereitete Recovery ist ausschliesslich an Erstfehler-SHA
`7d168d7defda650d313e152bd1b015b13becc24c9827eb411de775d6a6beae50`
gebunden. Ein eigener Once-Marker verhindert den Wiedereintritt. Zuerst verlangt
sie beide urspruenglichen Fingerprints, exakte UID, Ownertrust u, Algorithmen,
Verwendung, Zeitbindung, zwei unveraenderte private Metadaten und Pubring.
Nur unberechnete Cachewerte u/-/o/q erlauben danach ein explizites check-trustdb;
bei bereits vollstaendigem u entfaellt die Aktualisierung. Kein Generate,
Add-Subkey, Import-Ownertrust, Privatexport oder urspruenglicher Schreibretry.
Anschliessend muss der unveraenderte volle Parser einschliesslich u bestehen.

Originale Fehlerdateien und das historische Fehlen des ersten Toolfehlers bleiben
unveraendert. Neue Fehler verwenden eigene feste Recovery-Dateien; status liest
bei solchen Fehlern dieses Paar mit endlichen Recovery-Phasen. Eine sichere
oeffentliche Zusammenfassung bindet nach Erfolg Vorher-/Nachher-Cachewerte,
Receipt-/Pubring-/Public-Hashes und null Erzeugungs-/Add-Aufrufe an den Empfaenger.

Receipt und Ergebniskandidat werden zuerst dauerhaft geschrieben und rueckgelesen.
Erst nach allen Erhaltungspruefungen publiziert renameat2(RENAME_NOREPLACE) den
READY-Pfad atomisch. Gescheiterter Kandidaten-fsync kann deshalb auch bei
zusaetzlich fehlgeschlagener Fehlerdatei-Erstellung kein READY erzeugen.
PENDING/Recovery-Fehler werden verweigert, jede spaetere recovered-READY-Lesung
verlangt den exakten Receipt-Rawhash, Originalpin und Publichash. Die Namensaenderung
selbst erhaelt danach keinen weiteren Parent-fsync: keine Rename-Dauergarantie
ueber Stromverlust behaupten; geaenderter Boot bleibt ohnehin gesperrt.

125 synthetische Pruefungen bestanden, darunter20 neue Recovery-Faelle inklusive
realer atomarer Tempdatei-Publikation ohne Ueberschreiben und doppeltem ENOSPC.
Dies ist noch keine Ziel-Recovery. Echte Ausfuehrung folgt erst nach unabhaengiger
Quellenabnahme, gruenen Pflichtchecks und dem qualifizierten Mainstand.
Native Source-/Restore-/UID1000-/Socket-/Cgroup-/Ressourcenadmission bleibt offen.


## Tatsaechliche Empfaengerabnahme und eng begrenzte verschluesselte Stage

PR950 ist auf `917b45f84290bc78884f3f6bcf09b16a9d207aed` gemergt.
Main-CI40260308055 SUCCESS; Vercel dpl_5UY6aR8bYjYBgxEpS9Zqo3rxdyzd READY.
Actions40263202086/Artefakt12625800682 hat den vorhandenen Schluessel
unabhaengig abgenommen: Cachewerte `---` nach `uuu`, Ownertrust u,
null Generate-/Add-Aufrufe, private Metadaten unveraendert. Antwort-SHA256:
`e434b1f09c13d5ab55e82c17d1a43eb303414eca96ae3935ee94d9c008df2183`.
Primaerer Fingerprint `DCFD605ED28EEACA9B826105E769DE07A68BA8E4`,
Public-SHA `b2618129787ffbacaa1abbe6b46cd90f549022318feb4c473e663dd03c8e1bf8`.
Nur Public-Key und bereinigter Zielbericht sind im bestehenden privaten Drive;
Rueckdownload und Hashvergleich bestanden. Der private Key bleibt nur auf Hetzner.
Der Mac wird fuer den vorhandenen Actions-/Tailscale-Zugang nicht mehr benoetigt.

Diese Aenderung schaltet ausschliesslich `stage` hinzu. `admit` und `four-tx`
bleiben gesperrt; Stage-Erfolg ist ausdruecklich keine native Abnahme.
Eine recipient-verschluesselte, hoechstens48KiB grosse Workflow-Kapsel enthaelt
private Kurzzeit-Downloadlinks; keine Klartextlinks/Originale in Actions-Inputs,
Logs oder oeffentlichen Artefakten. Download nur von vier exakt gebundenen offiziellen HTTPS-Hosts,
mit oeffentlicher numerischer Zieladresse, TLS-Hostpruefung, ohne Redirect/Proxy.
Teile und Gesamtdaten werden gegen ihre Pins gelesen, GPG muss Empfaenger,
AES256, vollstaendigen Abschluss und Integritaet bestaetigen.

Der feste Stage-Once-Slot wird vor der ersten Entschluesselung dauerhaft reserviert,
die validierte Case-ID getrennt gebunden. Fehler, Timeout und Kindverlust sperren
den Slot; kein automatischer neuer Case oder Retry. Ein eigener ueberwachter
Kindprozess begrenzt auch DNS/GPG/Restore und erhaelt mindestens8GiB freie Platte.
Der Restore-Parser ist vollstaendig im gehashten Root-Modul eingebettet.
Er verlangt die feste Scope-SHA
`08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd`,
1767 regulaere Dateien mit2865680705Bytes und99 Python-Metadatenobjekte.
Nur frischer privater Zielbaum, begrenztes Tar/PAX/Gzip, keine beliebige Extraktion,
keine Ueberschreibung und keine Verfolgung von Links. Jeder Dateihash, Rechte,
Eigentuemer und transportierter mtime werden rueckgeprueft. Receipt und Pending
werden dauerhaft geschrieben und exakt O_NOATIME rueckgelesen; READY ist die
letzte atomare Namenspublikation. Keine Power-Loss-Dauergarantie dieser Umbenennung.

Ein beobachteter FAIL meldet tatsaechliche Dateizahl/Bytes als unbekannt (`null`),
niemals erfundene Nullwerte. Auch nach fruehem SSH-EPIPE wird eine vollstaendig
validierte SAFE-FAIL-Antwort erhalten; vorzeitiges READY bleibt ausgeschlossen.
Der Workflow publiziert gueltige Fehlerbelege und bleibt rot.

159 synthetische Steuer-/Stagefaelle und31 gezielte Restorefaelle bestanden,
ohne GPG-, HTTP-, SSH-, Original- oder native Zielausfuehrung. Die vorhandenen
historischen Fehler und Originalbelege bleiben unveraendert.
Die erste Source-Verschluesselung stoppte vor dem Einpacken von Originalen am
Public-Key-Import (GPG-Agentpfad zu lang);0Cipherbytes. Diese erhaltene Fehlkopie
wird nicht wiederverwendet. Die schmale Korrektur nutzt nach exaktem Public-Key-
Readback einen nur lesbaren geerbten Deskriptor mit recipient-file, keinen Import,
Defaultkeyring oder Agentstart. 20 Bundle-/15 Kapseltests und unabhaengiges Review
qualifizieren die Quelle; echter Einbyte-Public-only-Faehigkeitsnachweis bestanden.

Der anschliessende frische Bundlelauf hat alle1767 Dateien/2865680705Bytes und
99 Metadatenobjekte waehrend des Packens geprueft. Das verschluesselte Ergebnis
hat487267152Bytes in30 Teilen, Whole-SHA256
`468610327368d51360815d18538ad0c3fcdc4d98825bb8bf0499daa96112ab3c`.
Alle Teile sind im bestehenden privaten Drive. Vollstaendiger Rueckdownload aller
30Teile, Teilhashes und Wholehash bestanden; keine zweite vollstaendige Plattenkopie.
Rueckpruefungsbeleg-SHA256
`d11bc8651a39a3ceecb7d84c3c987a9611ec16c4ddecde56489a7ad6f9037ebc`.
Die unabhaengige lokale Vollpruefung aller Cipherteile bestaetigt denselben Hash.
Keine Entschluesselung/Wiederherstellung oder native Abnahme daraus ableiten.

Tatsaechliche File-Service-Links liegen auf sdmntpritalynorth, sdmntprnortheu,
sdmntprpolandcentral und sdmntprukwest, jeweils exakt unter oaiusercontent.com.
Die urspruengliche Einhostannahme stoppte den ersten Rueckdownload vor jedem
Netzzugriff; dieser Beleg bleibt erhalten. Nur diese vier exakten Hosts sind jetzt
zugelassen, keine Wildcard. Der validierte Host bindet DNS, numerische Verbindung,
TLS-SNI und HTTP-Host gemeinsam. Zwei neue gezielte Routing-/Abweisungspruefungen
ergänzen den bestehenden Umfang; die vollstaendigen190 synthetischen Tests passen.
Native Pfadsicht, UID1000, Docker-/Socket-/Cgroupadmission bleiben danach offen.

## Erhaltener Stage-Abbruch und begrenzte Korrektur (26.10.2026 Istanbul)

PR951 ist auf `ce8a392b6a6d4358a37fee3ed03a5b62484a677e` gemergt;
Main-CI40267987937 und die tatsaechliche native Grenzpruefung sind erfolgreich,
Vercel `dpl_4x9ut95N3rToA3yjsbV6r7NEA6F1` auf genau diesem Commit READY.
Der einmalige Stage-Lauf40270395850 stoppte mit `STAGE_RESTORE`.
Artefakt12628850120 wurde vollstaendig geladen, ZIP-/Antwort-/Sidecar-/Client-/
Nonce-/Plan-/Quellenbindung geprueft. Antwort-SHA256:
`359acce125eb3575a6303330b2e7fa897699926d023f86011f03879c475a9c6d`.
Nach dem tatsaechlichen Codepfad bestanden Cipherteil-/Gesamthash,
Empfaenger-/MDC-Entschluesselung und Gziphash vor dem Restoreaufruf.
Dateizahl, private Erstursache und Ausmass des Teilbaums sind noch unbekannt.
Der verbrauchte Stage-Slot und Fehlerzustand bleiben erhalten; kein neuer Stage-,
Restore- oder nativer Lauf wurde ausgefuehrt. Native Einmalfreigabe unbenutzt.

Statisch ist eine konkrete Formatinkompatibilitaet belegt: Python-PAX schreibt bei
langen Verzeichnisnamen einen abschliessenden Slash; der alte Empfaenger verwarf
diesen vor der Dateityppruefung. Der enge Fix entfernt genau einen Slash nur bei
DIRTYPE und bewahrt die Sperren fuer Dateien, Links, absolute/Punkt-/Doppelpfade.
Die tatsaechliche Erstursache auf Hetzner bleibt bis zur Receipt-Auslese offen.

Der neue optionale Statusbefund liest ausschliesslich die feste historische
Casebindung, den erhaltenen Stage-Erstfehler und dessen privates Restore-Receipt.
Root0600, nlink1, O_NOFOLLOW/O_NOATIME, Groessenlimit und unveraenderte Metadaten
werden geprueft. Nur endliche Fehlercodes, belegte Zaehler und Receipt-/Namenshash
gelangen in die oeffentliche Projektion; keine Pfade, Originalinhalte oder Keys.
ABSENT/UNKNOWN bleiben unbekannt, keine Reklassifizierung des gescheiterten Laufs.
214 synthetische Tests bestanden; unabhängige Abnahme und echte Statusauslese
stehen noch aus. Es entsteht keine Wiederholungs-, Restore- oder native Autoritaet.

## Tatsaechliche Erstursache und getrennte Setupvorbereitung (26.10.2026 Istanbul)

PR952 ist auf `5c918afe5551938eacb2ea3d1d8249ff5e937e18` gemergt.
Main-CI40281353379 und beide Pflichtjobs samt tatsächlicher Grenzpruefung SUCCESS;
Vercel `dpl_G2Q5HJ6pTZJHaxgHbrZrUtTTgsoT` auf genau diesem Commit READY.
Der einzige anschliessende Zielaufruf war der reine Status40286803902,
Job121452270420, Artefakt12634785563. ZIP-SHA256
`f931429fdc788c907a7fd8d0f063fb3b0c5428b2a890d7f20a7c9be5a058aba7`,
Antwort-SHA256 `ecfcc8a65a786e2a7f17cd44a35594f0b589b8327c3586c34434eac9b200da94`.
ZIP, Sidecar, Quellen-/Plan-/Noncebindung und qualifizierter Client wurden
unabhaengig O_NOATIME geprueft. Die echte private Restorequittung meldet
`PATH_ESCAPE`,0 regulaere Dateien/0 Bytes,1866 unbestaetigte Eintraege,
Metadaten UNKNOWN, partial-file NONE. Das beweist keinen leeren Verzeichnisbaum.
Ihr tatsaechlicher SHA256 ist
`160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be`.
Die Projektion passt zur statisch und synthetisch belegten PAX-Verzeichnisluecke.
Kein neuer Restore, keine native Ausfuehrung oder Originalveraenderung fand statt.

Die separate lokale Recovery nutzt ausschliesslich den vorhandenen, vollstaendig
gebundenen Zielgzip und einen neuen frischen Ausgabebaum. Alter Stage-Slot,
Fehler und Teilbaum bleiben erhalten; native Freigabe wird nicht verbraucht.
27 synthetische Recoverytests und unabhaengige SOL-Abnahme bestanden. Die
explizite Recovery-/Public-Pfadsicht hat65 gezielte Tests; die Quellenfreigabe
bleibt auch nach Mount ausdrücklich frisch erforderlich. Der feste Driver
fuehrt nur genau einen von recover/checkout/context/image aus;26 Tests bestehen,
einschliesslich Daemonwechsel und sicherem Erstfehlercode. Dies sind Codebelege,
keine tatsaechliche Ziel-Recovery oder native Abnahme.

Der Setupwaechter verwendet pro frischer Einmalbindung einen eigenen begrenzten
systemd-Service mit KillMode=control-group. ARM, EOF, alle eigenen Prozessenden,
sole-Cgroup-PID, pidfd und gehashter ACK muessen vor ACCEPTED belegt sein.
Unbestaetigtes Helper-READY bleibt UNKNOWN, auch wenn Dateien vorhanden sind.
Koordinator und Waechter sind lokal integriert; alle473 gezielten synthetischen
Tests bestehen. Sourcepins sind exakt gebunden und die finale Integration ist
unabhaengig abgenommen; Pflicht-CI und Zielausfuehrung bleiben offen. Der Bootstrapdeckel131072Bytes bleibt
unveraendert. Ausschliesslich oeffentliche, bytegehashte Programme desselben
CI-qualifizierten Git-Commits werden bereitgestellt, keine erneute Original- oder
Schluesseluebertragung. Der Mac ist fuer den bestaetigten Zugang nicht erforderlich.

DeepSeek Pro High hat den PAX-/Statusfix unabhaengig angenommen; Flash High hat
die fehlende Public-Context-Schnittstelle konkret benannt. Drei spaetere
Schreib-/Reviewauftraege endeten am32768-Ausgabetokenlimit ohne Dateiänderung.
Diese Fehlversuche bleiben erhalten; Sol uebernahm die kritische Umsetzung und
unabhaengige Abnahme, statt weitere gleichartige Routerversuche zu starten.

Die unabhaengige Gluepruefung fand vor jedem Zielaufruf einen echten
Schnittstellenfehler: Der Bootstrap liefert sieben Kontextfelder, der
Koordinator akzeptiert genau vier. Der Server projiziert jetzt ausschliesslich
`base`, `source_sha256`, `deployment_commit`, `deadline`. Ein gezielter Test mit
dem vollstaendigen Bootstrapkontext besteht; finale SOL-Gegenpruefung PASS fuer
Server-SHA256 `62cb2394de10b8c26f528b5d627dd0cb7720047e7fbd571d6f4dcf99d87d2ad8`
(106678 Bytes). Die erste PR-CI auf `6c9a926c` ist fehlgeschlagen; dieser
Vorstand ist kein Ausfuehrungsnachweis und wird nicht gemergt. Im vorhandenen
CI-Protokoll ist `UNACCEPTED_JOB` beim synthetischen Mehrphasenfall belegt:
`Path.mkdir(parents=True)` erzeugte das Zwischenverzeichnis unter umask022 mit
0755. Die Fixture erstellt es jetzt explizit mit0700 wie der echte Guard. Ihre
Statattrappe erhaelt ausserdem die Standard-Zeitattribute fuer die Ausgabe
eines Testfehlers. Runtime und Schutzpruefungen bleiben unveraendert. Ein neuer
Test erzwingt022; alle471 gezielten Tests bestehen auch unter dieser umask.
Unabhaengige SOL-Abnahme PASS fuer Test-SHA256
`cf6e3d3e331b9ee0e49c06acd5fe8e93d91063c5b38883f4f00e7fdd98412942`.

CI40294473498 meldete danach11 Fehler und einen unvollstaendigen Test im
synthetischen Public-Checkout, jeweils vor READY. Der genaue historische errno
ist nicht erhalten und bleibt unbekannt. Die Fixture rief trotz simulierter
Rootvorpruefung echte `chown`/`fchown` aufUID/GID1000 auf; dieses Benutzerkonto
ist auf einem GitHub-Runner nicht garantiert. Diese Aufrufe werden jetzt nur
im Test simuliert und jeder feste Zielbesitzer samt `nofollow` geprueft.
Ein gezielter Berechtigungsfehlerfall erhaelt Attempt, Teilbaum und Fehlerbeleg,
ohne READY zu publizieren. Unabhaengige SOL-Abnahme PASS fuer Test-SHA256
`c87094b45f8f143290a4a1a1b669db10a2b11a79ad6a42579c234b97894d0e48`.
Die472 gezielten Tests bestehen unter umask022 in9,097s. Produktivquellen und
Schutzpruefungen wurden fuer diese Testkorrektur nicht veraendert; ein gruener
GitHub-Nachweis bleibt erforderlich.

CI40295069417 scheiterte weiterhin im Public-Checkout-Test, jetzt konkret mit
`TRACKED_METADATA`. Die erste Besitzer-Testkorrektur war unvollstaendig: Sie
simulierte den Schreibaufruf, aber nicht die anschliessende echte Rueckpruefung.
Die korrigierte Fixture verwendet deshalb eine nur im getesteten Modul sichtbare
OS-Simulation mit anfangsUID12345/GID23456. Gepruefte Besitzerwechsel auf1000
werden je(dev,ino) protokolliert und durch `stat`/`fstat` zurueckgelesen; echte
Hostbesitzer bleiben unveraendert. Ein No-op-Negativfall muss die unveraenderte
Runtime-Pruefung mit `TRACKED_METADATA` abbrechen. Alle473 Tests bestehen unter
umask022 in9,549s. Unabhaengige SOL-Abnahme PASS fuer Test-SHA256
`d71370d85595976e5c612d9921a3b594c367c83ef97bf150772498b95ab58779`;
Runtime-SHA256 `1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb`
unveraendert. Keine echte Zielausfuehrung; Pflicht-CI bleibt offen.

## Gesicherte Integration PR954 (26.10.2026 Istanbul)

PR-CI40299279482 auf dem exakt unabhaengig abgenommenen Endstand
`c52522c41141b182a2dd73edca624960f9e0990a` ist vollstaendig SUCCESS.
Beide Pflichtjobs, die tatsaechliche Native-Automation-Grenzpruefung und der
Vercel-GitHub-Check wurden vor dem Merge frisch bestaetigt. Der freigegebene
Merge ist auf Main `f1be0a0c0ac0f5a87fdb135c17b759dfe444b8f0` verifiziert.
Main-CI40302732339 ist ebenfalls vollstaendig SUCCESS, einschliesslich beider
Pflichtjobs und der tatsaechlichen Native-Automation-Grenzpruefung. Auch der
Vercel-GitHub-Check auf Main ist SUCCESS. Die native Freigabe bleibt unbenutzt
und pausiert; dies ist keine Motor-, Unit60- oder500er-Abnahme.

## Einmaliger Setupabbruch und verbindlicher Stopp

Nach frischer Hauptstand-/CI-/Quellenbindung wurde am26.10.2026 um10:22:12UTC
genau ein `admit` fuer die erste Setup-Phase beauftragt. Workflow40306875483,
Job121518055099, Artefakt12643052325 enden FAIL. Der qualifizierte Client und
eine unabhaengige SOL-Pruefung bestaetigen: `recover / UNIT_PROPERTIES /
FAIL_KEEP_STATE_NO_RETRY`, alle drei Quittungshashes null, beide Native-Flags
false. ZIP777Bytes, SHA256
`61ba7db0dad2826155c79a73c15dfafd7d07badfccf913ad9c1d05e567682e6a`;
Antwort-SHA256
`f4b9ff053516e884f5b9eeb227e448fc90a99bd61c82c8b8c272391a329754ae`.
Nonce `33c5a05bbd8e9e1eb43490e67095a3ae1ce4eb570bdcc96b3185ae7653d55c9d`.
Rohbelege liegen erhalten unter
`/workspace/helmut-hetzner-preparation-evidence-20261025/TARGET_SETUP_RECOVER_ACTUAL_40306875483/`
und unveraendert im GitHub-Artefakt. Der direkte CLI-Download wurde am Azure-
Blob-Endpunkt verweigert; der vorhandene GitHub-Artefaktconnector lieferte
denselben777Byte-ZIP vollstaendig. ZIP, Sidecar, CI-Hash und Antwortbindung
wurden O_NOATIME geprueft. Kein erneuter Zielaufruf war dafuer erforderlich.

Zum Zeitpunkt dieser Fehlerquittung waren konkrete Feldabweichung und ARM-
Zustand noch unbekannt. Die nachfolgende Betreiberbeobachtung grenzt das ein.
Tatsaechlicher Restorezustand und vollstaendige aktuelle Prozessenden bleiben offen.
Daraus folgt weder eine Originalhash-Abnahme noch ein Nachweis null erfolgter
Schreibzugriffe. Es gibt keine ACCEPTED-Abnahme. Alle Teilzustaende, Fehler und
Einmalmarker muessen erhalten bleiben; kein Retry, keine naechste Setup-Phase.

Die anschliessend beauftragte reine Leseabfrage der echten Propertyliste mit
und ohne `--all` sowie der vier festen Start-/Endmarker ist inzwischen erledigt.
Die vorhandene eingeschraenkte Automatik stellt diese Abfrage nicht bereit.
Ein einziger rein lesender Mac-Administratorbefehl vermeidet einen erneuten
Umbau des Root-Protokolls nur zur Diagnose. Er startet/stoppt keine Dienste und
liest keine Projektinhalte oder Schluessel. Der historische Befehl steht unten;
nicht grundlos wiederholen. Kein neuer nativer Lauf ist freigegeben.

## Betreiberbeobachtung und neuer Fortsetzungspunkt

Der Betreiber hat den unabhaengig geprueften Lesebefehl ausgefuehrt und die
Ausgabe in diesem Thread uebermittelt. Es gab hier keine erneute Live-Abfrage.
Beide Units lieferten bei Exit0 mit und ohne `--all` dieselbe Feldmenge und
keine zusaetzlichen Felder. Genau sechs erwartete Namen fehlen:
`ExecCondition`, `ExecReload`, `ExecStartPost`, `ExecStartPre`, `ExecStop`, `ExecStopPost`.
Die Setup-Unit ist laut Ausgabe loaded/failed, Result=exit-code;
`helmut-native-docker28.service` loaded/active/running, Result=success.
ARM, RESULT.PENDING und RESULT fehlen; FIRST_ERROR ist regulaer,root:root,0600,211Bytes.
Die Abfrage meldet keine Dienstveraenderung/Native-Ausfuehrung/Projektinhaltslese
oder Schluesseluebertragung. Der genaue Beobachtungszeitpunkt wurde nicht genannt.

Unabhaengige SOL-Gegenpruefung bestaetigt die Konsistenz zu Guard und Fehlercode.
Fehlend darf nicht als leer gelten; `--all` allein ist keine belegte Loesung.
Naechster Schritt ist die enge Klaerung der systemctl-/D-Bus-Darstellung und
eines gleich strengen Nachweises der sechs Exec-Listen. Keine neue Ausfuehrung.
Vollstaendige aktuelle Uebergabe und gesicherte Metadaten:
[Thread-Uebergabe](helmut-thread-handoff-20261026.md).

## Enge Quellenkorrektur fuer UNIT_PROPERTIES (26.10.2026 Istanbul)

Die neue Sitzung hat die vollstaendige Uebergabe auf Main `17be62b5` gegen
SHA256 `4f2bf1d911e7df6e0cdbd315e4957c95e0b2d64e7bbf091cb37b7585354248dc`
geprueft. PR956 ist gemergt; PR-CI40312982708 und Main-CI40313300197 sind SUCCESS,
beide Pflichtchecks und der Vercel-GitHub-Status auf diesem Mainstand gruen.
GitHub-/Actions-Lesezugriff ist frisch belegt. SAFE-Archiv und Sicherungsindex
wurden aus Drive vollstaendig gelesen: beide oben dokumentierten SHA256 stimmen,
alle13 Mitgliedsdateien des14-Eintraege-Archivs stimmen mit dessen Manifest.
Keine neue Originalpaket- oder Schluesseluebertragung und keine Zielabfrage.

Die primaeren systemd-v255-Quellen erklaeren die beobachtete Darstellung:
[systemctl-show.c](https://github.com/systemd/systemd/blob/v255/src/systemctl/systemctl-show.c#L1372)
druckt Exec-Zeilen nur innerhalb der Schleife ueber vorhandene Befehle. Ein
leeres Array erzeugt auch mit `--all` keine Zeile. Das ist eine Quellenklaerung,
kein frisch erhobener Nachweis der installierten Zielversion oder ihrer Werte.
[dbus-service.c](https://github.com/systemd/systemd/blob/v255/src/core/dbus-service.c#L374)
und [dbus-execute.h](https://github.com/systemd/systemd/blob/v255/src/core/dbus-execute.h#L20)
deklarieren die Exec-Listen mit Signatur `a(sasbttttuii)`.
[busctl.c](https://github.com/systemd/systemd/blob/v255/src/busctl/busctl.c#L1695)
serialisiert ein direktes `get-property` dieser leeren Liste als
`{"type":"a(sasbttttuii)","data":[]}`; eine zusaetzliche Arrayhuelle passt nicht.

Der Guard verlangt fuer jede der sechs Listen eine eigene erfolgreiche,
typisierte D-Bus-Abfrage ueber den festen Systembus. Der deterministische
Unit-Objektpfad wird zusaetzlich durch die typisierte `Unit.Id` gebunden.
Fehlende Antworten, falsche Signaturen/Datentypen, JSON-Zusatzfelder und
nichtleere Hooks stoppen. Keine fehlende Textzeile wird in eine leere Liste
umgedeutet. Alle bisherigen Nicht-Hook-Felder einschliesslich `ExecStart`
bleiben exakt Pflicht; eine vollstaendige Ruecklesung nach den D-Bus-Abfragen
muss denselben Feldbestand und dieselben Werte ergeben. Die bestehenden
Identitaets-, Prozess-, Cgroup-, Zeit-, ARM-/ACK-/Exit- und Einmalpruefungen
bleiben erhalten. Alle neuen Abfragen nutzen dieselben absoluten Fristen und
Ausgabelimits. Fehlendes oder inkompatibles `busctl` bleibt ein Abbruchgrund.

Der Endstand `3e5d3fd5f222e5e3ad842cc42ccbd5e25f91d846` ist unabhaengig
durch einen getrennten GPT-6.1-SOL-Lauf mit Sehr hoch als `ACCEPT_CODE_ONLY`
abgenommen, ohne blockierende Findings. Die40 Guardtests sind Teil der480
integrierten synthetischen Grenztests; alle bestanden. Zusaetzlich bestanden
168 eigene isolierte adversariale Pruefungen des unabhaengigen Pruefers,
ohne Wiederholung der480er Suite oder Zielzugriff. Propertybestand, alle sieben
Assetpins, Koordinator-/Serverpin und Bootstrapdeckel131072Bytes wurden separat
verglichen. Guard:35236Bytes/SHA256
`eea7e8eca1d439b7fa2cfa6387de527fdcdc829ed7b502e5fcfab926577cd3f2`;
Koordinator:22592Bytes/SHA256
`92d7271f90b38cb8fc8f59eb552f36a26d3fd179481b44429d90dddf14cfe455`;
Server:106678Bytes/SHA256
`544dc5a6945e42f349eec5d80d779587eedc30052941a1527c7c75e5b394c146`.
Syntax aller fuenf geaenderten Python-Dateien, vier Statusgroessenpruefungen und
Diffpruefung bestanden. Pruefbeleg und beide bereits ausgefuehrten Pruefskripte
bleiben in `/workspace/helmut-unit-properties-evidence-20261026/` erhalten;
`independent-review.txt` hat SHA256
`6ead5eafc2179e4be816af8fd1da4241436a2aeedbaebbf6b7af7f5f735b485f`.

[PR957](https://github.com/ernisch/helmut-pilot/pull/957) ist nach gruener
[PR-CI40314973970](https://github.com/ernisch/helmut-pilot/actions/runs/40314973970)
auf exakt diesem Kopf gemergt; beide Pflichtjobs und der tatsaechliche synthetische
Grenzpruefschritt SUCCESS. Main `35d7d2d41aba7e26cf89e9ebe2f54f8c44c20163`
hat denselben Git-Tree. Vercel `dpl_4LgfeWX2wmYYdWA7ijo3tDvL1JSa` ist auf genau
diesem Commit production/READY; Alias `helmut-pilot.vercel.app` frisch bestaetigt.
[Main-CI40318797794](https://github.com/ernisch/helmut-pilot/actions/runs/40318797794)
ist vollstaendig SUCCESS, einschliesslich beider Pflichtjobs und des tatsaechlichen
synthetischen Grenzpruefschritts. Kein Zielaufruf wurde
ausgeloest; diese Auslieferung beweist keine Hetzner-Installation oder -Abnahme.

Eine echte neue Setupzulassung ist damit nicht erteilt:
der erhaltene `recover / UNIT_PROPERTIES`-Versuch, seine Teilstaende und alle
Once-Marker bleiben gescheitert/gesperrt. Keine Mac-Abfrage, kein `admit`-/Recover-
Retry und keine native Ausfuehrung aus dieser Korrektur ableiten. Als naechster
Schritt darf erst ein konkret getrennt neu zugelassener Setupweg vorbereitet
werden; frisches konkretes Betreiber-GO vor jeder nativen Ausfuehrung bleibt Pflicht.

Die unveraenderte Koordinator-Sperre `SETUP_PREVIOUS_FAILURE` verweigert nach
dem erhaltenen Erstfehler weiterhin die bestehende `admit`-Operation. Auch ein
neuer Nonce oder Quellhash macht daraus keinen erlaubten Folgelauf. Naechste
Vorbereitung bleibt ein ausdruecklich getrennter Setupvertrag: Ziel, vollstaendig
qualifizierter Code, genauer Fall, Zeitfenster und neue Einmalautoritaet muessen
konkret gebunden werden; alter Erstfehler, Job, Teilbaum und alle Once-Marker
bleiben unangetastet. Aktuelle Original-/Restore- und vollstaendige Prozessenden
duerfen dabei nicht aus der historischen ARM-Abwesenheit abgeleitet werden.
Dieser Nachtrag schaltet keinen neuen Vertrag oder Ausfuehrungsweg frei.

Ein abgegrenzter Nachfolgevertrag liegt als lokaler Entwurf unter
`/workspace/helmut-unit-properties-evidence-20261026/next-setup-contract-draft.txt`,
SHA256 `d25e6267f03cd74834e42e6f2464d1728d296f6f5af7b2abedb536dde7f81bb8`.
Vorgeschlagen ist eine feste neue Operation mit eigener Root-Autoritaet, eigener
Zustandswurzel und dauerhaftem Once-Slot; alte Fehler/Jobs bleiben bindender
gescheiterter Vorgaenger. Auch frische Recovery-Teilstaende wuerden stoppen.
Die unveraenderliche Bootstrap-Allowlist kennt diesen Weg nicht: ihre Erweiterung
waere eine neue Administrator-/Root-Protokollgrenze. Frische Prozessenden,
private Fehl-/Jobbelege, Komponentenpfade und Gzipbindung bleiben vor Wirkung
vollstaendig nachzuweisen. Der Entwurf ist nicht implementiert, nicht abgenommen
und nicht GO-ready; er wiederholt weder die erledigte Mac-Abfrage noch einen
gescheiterten Aufruf und erteilt keine Wiederholungs-/Originalrekonstruktionsrechte.

## Threadwechsel ohne erneuten Datenumzug

Konkreter Fortsetzungspunkt ist die enge Quellenkorrektur nach der bereits
vorliegenden `UNIT_PROPERTIES`-Leseausgabe. Main und beide Pflicht-CIs sind gruen; der
Einrichtungsaufruf ist gescheitert und darf nicht wiederholt werden.
Historische Parameter dieses Aufrufs, NICHT erneut dispatchen:
`hetzner-native-automation.yml` auf `main`, `controlMode=control-v1`,
`operation=admit`, `planSHA=e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb`,
`payloadSHA=62cb2394de10b8c26f528b5d627dd0cb7720047e7fbd571d6f4dcf99d87d2ad8`,
kein stageCapsule. Die alte fehlgeschlagene Stage-Once bleibt ebenfalls
verbraucht. Kein neuer Aufruf und keine nachtraegliche Erfolgsumdeutung.
Diese Parameter sind keine native Vier-TX-, Unit60- oder500er-Freigabe.

Code und Quellenbindungen liegen auf dem Entwicklungsbranch
`codex/hetzner-target-admission-20261026`; der aktuelle Git-/PR-Stand ist vor einer
Fortsetzung frisch zu lesen. Eine neue Sitzung muss die vorhandene
GitHub-Actions-/Tailscale-Steuerung nachweisen. Der private Mac-Schluessel wird
dafuer nicht gebraucht; der private Empfaengerschluessel bleibt auf Hetzner.

Die Originale bleiben unveraendert in der erhaltenen Quellcloud. Das bereits
uebertragene verschluesselte Paket und der Zielgzip bleiben auf Hetzner; der
vollstaendig rueckgepruefte verschluesselte Drive-Index ist
`17DDhInbRwN20nqRPuNp3KTLq6AqMEhWc`, SHA256
`87508b035c31fea52f4910cedf80b63baabf055e54cfe714dfe143383c15ec0c`.
Eine neue Volluebertragung oder neue Schluessel sind nicht Teil der Fortsetzung.

Der Betreiber verlangt jetzt den Wechsel am gesicherten FAIL-Stopp. Die vier
Setup-Abnahmen bleiben offen; vor dem Wechsel wird nichts davon ausgefuehrt.
Hetzner ist nicht startbereit. Der neue Thread darf die gescheiterte Stage-Once
nicht wiederholen und benoetigt keine erneute Quellinventur: Zielquittungen und
den genauen
Git-Stand uebernehmen. Native Vier-TX-Messung, Unit60 und500er Nachweis bleiben
getrennt und brauchen ihre jeweils frischen vollstaendigen Zulassungen.

## Einmalige Adminabfrage fuer UNIT_PROPERTIES

Historischer, bereits ausgefuehrter Befehl. Nicht erneut anfordern oder
ausfuehren; die Betreiberbeobachtung oben ist vorhanden. Der
vorhandene private SSH-Schluessel bleibt auf dem Mac; keine Schluesselwerte
weitergeben. Der Befehl liest nur die zwei fest benannten Service-Propertylisten
und die Existenz der vier festen Marker. Er startet/stoppt keine Dienste,
legt keine Projektdateien an und liest keine Projektinhalte. Die Ausgabe
enthaelt Propertynamen und vier begrenzte Zustandswerte, keine ExecStart- oder
Umgebungsinhalte. Bei unbekannten Zustaenden nichts selbst reparieren.

Lokale Shell-/Python-Syntaxpruefung und unabhaengige SOL-Abnahme PASS;
Ausfuehrung vom Betreiber berichtet. Skript-SHA256 (ohne aeussere Bash-Huelle):
`fba10f66c2f20cdff0758bae593d31ec734e96d3727f55bacba34695f1f67dbe`.

```bash
/bin/bash <<'HELMUT_MAC_READONLY'
#!/usr/bin/env bash
# Im Mac-Terminal ausfuehren. Nur feste Service-Metadaten und Marker-Existenz lesen.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'STOP: Diesen Befehl im Mac-Terminal ausfuehren.' >&2
  exit 1
fi
/usr/bin/ssh -F /dev/null -T -o StrictHostKeyChecking=yes -o UpdateHostKeys=no \
  -o ForwardAgent=no -o ForwardX11=no \
  -o ClearAllForwardings=yes -o PermitLocalCommand=no -o IdentitiesOnly=yes \
  -o ConnectionAttempts=1 -i "$HOME/.ssh/helmut_hetzner" root@2.28.77.245 \
  'env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C /usr/bin/python3 -I -S -B -' <<'HELMUT_UNIT_FIELDS_READONLY'
import json, os, re, stat, subprocess

assert os.getuid() == os.geteuid() == 0, 'ROOT_REQUIRED'
nonce = '33c5a05bbd8e9e1eb43490e67095a3ae1ce4eb570bdcc96b3185ae7653d55c9d'
names = ('Id,Transient,Type,MainPID,ControlPID,ControlGroup,KillMode,RuntimeMaxUSec,'
         'TimeoutStopUSec,Restart,RemainAfterExit,User,Group,UMask,StandardOutput,'
         'StandardError,Delegate,ExecStart,ExecStartPre,ExecStartPost,ExecCondition,'
         'ExecStop,ExecStopPost,ExecReload,InvocationID,ActiveState,SubState,ExecMainPID,'
         'ExecMainCode,ExecMainStatus,ExecMainStartTimestampMonotonic,'
         'ExecMainExitTimestampMonotonic,Result,SendSIGKILL,KillSignal,FinalKillSignal,'
         'TimeoutStopFailureMode').split(',')
expected = set(names)
for unit in ('helmut-native-setup-' + nonce + '.service', 'helmut-native-docker28.service'):
    for include_empty in (False, True):
        argv = ['/usr/bin/systemctl', 'show', unit, '--no-pager',
                '--property=' + ','.join(names + ['LoadState'])]
        if include_empty:
            argv.append('--all')
        result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=5, check=False)
        assert len(result.stdout) <= 65536 and len(result.stderr) <= 65536, 'OUTPUT_LIMIT'
        fields = {}
        for row in result.stdout.decode('ascii', 'strict').splitlines():
            key, separator, value = row.partition('=')
            assert separator and key not in fields and re.fullmatch('[A-Za-z][A-Za-z0-9]{0,63}', key), 'PROPERTY_FORMAT'
            fields[key] = value
        assert len(fields) <= 64, 'PROPERTY_COUNT'
        states = {key: fields[key] for key in ('LoadState', 'ActiveState', 'SubState', 'Result')
                  if key in fields and re.fullmatch('[A-Za-z0-9_-]{0,64}', fields[key])}
        print(json.dumps({'unit': unit, 'include_empty': include_empty,
                          'exit': result.returncode, 'fields': sorted(fields),
                          'missing': sorted(expected - fields.keys()),
                          'extra': sorted(fields.keys() - expected - {'LoadState'}),
                          'states': states}, sort_keys=True), flush=True)

# O_PATH walks do not read directory contents or alter directory read timestamps.
fd = os.open('/', os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    path = '/opt/helmut-native-test/automation-20261026/setup-jobs/' + nonce
    try:
        for part in path.split('/')[1:]:
            child = os.open(part, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            assert info.st_uid == info.st_gid == 0 and not info.st_mode & 0o022, 'UNTRUSTED_PARENT'
    except FileNotFoundError:
        print(json.dumps({'job_markers': 'UNKNOWN_JOB_DIRECTORY_ABSENT'}), flush=True)
    else:
        for name in ('ARM.PRIVATE.json', 'RESULT.PENDING.PRIVATE.json',
                     'RESULT.PRIVATE.json', 'FIRST_ERROR.PRIVATE.json'):
            try:
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                print(json.dumps({'marker': name, 'exists': False}), flush=True)
            else:
                print(json.dumps({'marker': name, 'exists': True,
                                  'regular': stat.S_ISREG(info.st_mode),
                                  'mode': oct(stat.S_IMODE(info.st_mode)),
                                  'uid': info.st_uid, 'gid': info.st_gid,
                                  'size': info.st_size}), flush=True)
finally:
    os.close(fd)
print(json.dumps({'status': 'READONLY_OBSERVATION_COMPLETE',
                  'service_changes': False, 'native_started': False,
                  'project_contents_read': False, 'keys_transferred': False}), flush=True)
HELMUT_UNIT_FIELDS_READONLY
HELMUT_MAC_READONLY
```
