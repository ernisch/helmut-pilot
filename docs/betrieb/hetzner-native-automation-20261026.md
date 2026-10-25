# HELMUT: begrenzte autonome Hetzner-Steuerung

Der Betreiber hat am26.10.2026(Istanbul) autonome Arbeit und notwendige
Automatisierung ausdruecklich freigegeben, einschliesslich Merge und Deployment
nach vollstaendig gruenen Pflichtpruefungen. Die aeltere reine Probevorbereitung
wird dadurch gezielt erweitert. Die dauerhafte Arbeitsregel steht in AGENTS.md.

## Konkreter Umfang

Ein separat gestarteter Workflow `hetzner-native-automation.yml` nutzt das
vorhandene geschuetzte Environment, dessen bestehenden SSH-Schluessel und
Tailscale-OIDC. Ausschliesslich `main`, der exakte Repository-/Workflowbezug,
ein neuer Nonce sowie Plan- und Quellhash sind zugelassen. Der bestehende
Probe-Workflow, dessen Gate und `probe-only-v1`-Variable bleiben unveraendert.
Die neue, nicht geheime Freischaltvariable heisst
`HELMUT_HETZNER_NATIVE_ENABLED=control-v1`.

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

Lokal92/92 bestanden:27 Bootstrap-,8 Server-,20 Client-/Protokoll-,21
Empfaenger- und16 Installerpruefungen. Bootstrap, Server und Installer wurden
zusaetzlich unabhaengig durch SOL gegenprueft. Das ist keine Zielausfuehrung.

Erst nach gruenem finalem PR-Stand, unabhaengiger Abnahme, autorisiertem Merge
und gruenem Main-CI folgt der gebundene Mac-Installer. Danach werden der neue
Steuerzugang und der oeffentliche Zielschluessel tatsaechlich ueber Actions
abgenommen. Originalklassifizierung, verschluesselte Drive-Uebertragung,
Wiederherstellung und native Admissions bleiben getrennte nachfolgende Arbeit.
Kein vollstaendiger500er-Lauf aus der Automatisierungsfreigabe ableiten.
