# HELMUT: begrenzte autonome Hetzner-Steuerung

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
Logs oder oeffentlichen Artefakten. Download nur vom fest gebundenen HTTPS-Host,
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

157 synthetische Steuer-/Stagefaelle und31 gezielte Restorefaelle bestanden,
ohne GPG-, HTTP-, SSH-, Original- oder native Zielausfuehrung. Die vorhandenen
historischen Fehler und Originalbelege bleiben unveraendert.
Die erste Source-Verschluesselung stoppte vor dem Einpacken von Originalen am
Public-Key-Import (GPG-Agentpfad zu lang);0Cipherbytes. Diese erhaltene Fehlkopie
wird nicht wiederverwendet. Eine getrennte schmale Quellkorrektur ist erforderlich.
Native Pfadsicht, UID1000, Docker-/Socket-/Cgroupadmission bleiben danach offen.
