# Codex Cloud, GitHub Actions und Hetzner

Stand25.10.2026 Europe/Istanbul. Entwicklungsbranch
`codex/hetzner-ci-bridge-20261025`, Basis main `1eb3cbff`.

## Umfang und aktueller Zustand

Vorbereitet ist ein manuell gestarteter, lesender Verbindungscheck:
Codex Cloud -> GitHub-gehosteter Runner -> kurzlebiger Tailscale-Knoten
mit GitHub OIDC -> normales OpenSSH -> fest installierter Probe-Befehl.
Kein MacBook im Ausfuehrungs- oder Datenpfad. Tailscale SSH wird nicht aktiviert.

Das aktive Ruleset `helmut-main-protection` wurde lesend bestaetigt:
beide Pflichtchecks, Pull Request, kein Bypass. PR942 bleibt unangetastet.
Keine Veroeffentlichung dieses Branches: neue Workflow-/Skriptdateien wuerden
die vorhandene CI und moeglicherweise ein Vercel-Preview ausloesen. Der Auftrag
verbietet Deployments und native Volltests; deshalb hier kein Push, PR oder Merge.

Der Check ist standardmaessig gesperrt. Er uebertraegt weder Quellen noch
Originale und fuehrt keine Tests aus. Ein erfolgreicher Probe-Run beweist nur
den SSH-Transport und die ausgegebenen Hostmetadaten, keine native Testfreigabe.
`native_execution_enabled` muss immer `false` sein. Andere SSH-Befehle,
insbesondere Shell, SCP, SFTP und Teststart, werden abgelehnt.

## Genau der naechste manuelle Schritt

Den Hetzner-Server bei Tailscale anmelden. Dazu die bestehende
administrative SSH-Verbindung oder die Hetzner-Webkonsole verwenden.
Die Befehle installieren das signierte Ubuntu-Paket und melden nur diesen Host an:

```bash
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg -o /tmp/helmut-tailscale-keyring.gpg
sudo install -m 0644 /tmp/helmut-tailscale-keyring.gpg /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list -o /tmp/helmut-tailscale.list
sudo install -m 0644 /tmp/helmut-tailscale.list /etc/apt/sources.list.d/tailscale.list
sudo apt-get update
sudo apt-get install -y tailscale
sudo tailscale up --hostname=helmut-ci --accept-routes=false --accept-dns=false
tailscale ip -4
```

Den angezeigten Anmeldelink selbst im Browser oeffnen. Nur die abschliessende
Tailscale-IP zurueckmelden. Keinen Anmeldelink, Token, Schluessel oder Originaldaten
in den Chat kopieren. Keine Exit-Node, Subnet-Routen oder Tailscale SSH aktivieren.
Vorhandenen administrativen SSH-Zugang und die Hetzner-Firewall noch nicht aendern.
Falls Tailscale schon eingerichtet ist: keinen neuen Account/kein zweites Tailnet
anlegen; den vorhandenen Zustand zuerst abgleichen.

## Anschliessende Einrichtung, noch nicht ausgefuehrt

Diese Schritte sind die Umsetzungsliste fuer SOL nach Rueckmeldung des ersten
Schritts, keine gleichzeitige Aufgabenliste fuer den Betreiber.

1. Tailnet-Zugriff pruefen und die vorbereitete Policy
   `hetzner-ci-tailnet-policy.json` an die bestehende Policy anpassen.
   Keine bestehende Policy blind ersetzen oder Administratorzugang entfernen.
   Betreiber bestaetigt Anmeldung mit100.96.83.66 und anschliessend Speicherung
   der korrigierten Policy aus diesem Chat. Nicht unabhaengig live rueckgelesen.
   Die aktuelle Policy bindet den Host ueber den Alias `helmut-ci` an diese IP;
   kein Host-Tag vergeben, bestehende Besitzerzuordnung erhalten. Owner/Admin
   behalten Netzwerkzugriff, Mitglieder Zugriff auf eigene Geraete. Runner
   bekommt ausschliesslich `tag:helmut-ci-runner` und nur TCP22 zum CI-Host.
   Die verworfene Negativpruefung `autogroup:member:22` ist entfernt: sie wuerde
   den eigenen Hetzner-Host einschliessen und dem positiven SSH-Test widersprechen.
   Breite bestehende `*:*`-/allow-all-Regeln duerfen diesem Runner keinen weiteren
   Zugriff geben; sonst nicht aktivieren. Die Policytests muessen erfolgreich sein.
2. Tailscale-Federation mit GitHub-Issuer
   `https://token.actions.githubusercontent.com`, exaktem Subject
   `repo:ernisch/helmut-pilot:environment:helmut-hetzner-ci` und nur
   `auth_keys:write` fuer `tag:helmut-ci-runner` einrichten. Keine Wildcards,
   kein OAuth-Secret und kein wiederverwendbarer VPN-Authkey. Client-ID und die
   konfigurierte Audience sind GitHub-Variablen, keine Schluessel.
3. GitHub-Environment `helmut-hetzner-ci` anlegen und **vor dem Hinterlegen eines
   Secrets** auf ausschliesslich Branch `main` begrenzen. Diese Einstellung ist
   zwingend: Das Environment-Subject allein unterscheidet keine Branches.
   Falls der Tarif diese Branch-Beschraenkung nicht erzwingt, bleibt der Weg aus.
   Kein `pull_request_target`, kein automatisch ausgeloester SSH-Job.
4. Eigenes SSH-Ed25519-Paar in einer vertrauenswuerdigen Umgebung erzeugen.
   Nur dessen oeffentlicher Teil wird auf Hetzner installiert. Den privaten Teil
   ausschliesslich ueber die GitHub-Secrets-Oberflaeche im genannten Environment
   als `HELMUT_CI_SSH_KEY` hinterlegen; nie in Git, Chat, Actions-Logs oder Codex.
   Kein bestehender Administrator- oder Production-Schluessel wird verwendet.
5. Nach freigegebener Bereitstellung der geprueften Dateien den Installer auf
   Hetzner als Administrator ausfuehren:
   `sudo bash scripts/hetzner-ci-install.sh /sicherer/pfad/ci-key.pub <SHA256-des-Bridge-Skripts>`.
   Installer und Bridge zuvor gegen den geprueften Commit/Hash vergleichen.
   `hetzner-ci-install.sh` und `hetzner-ci-bridge.py` muessen im selben Verzeichnis
   liegen. Voraussetzungen: Ubuntu24.04 x86_64, Python3, OpenSSH und ein noch
   nicht vorhandener Benutzer `helmut-ci`. Die Installation erzeugt dessen
   Home `/var/lib/helmut-ci`. Beide SSH-Endpunkte muessen Tailscale-IPv4 nutzen.
   Der Installer ist kein Remote-Workflow-Schritt. Er legt den eigenen Benutzer
   ohne sudo/Docker-Gruppe an, installiert root-eigene SSH-Regeln und validiert
   deren effektive Werte vor dem Reload. Bestehende Accounts/Installationen
   werden nicht ueberschrieben. Bei Fehler keine blinde Wiederholung.
6. Oeffentlichen Ed25519-Hostschluessel ueber die vertrauenswuerdige Hetzner-Konsole
   abgleichen; kein `ssh-keyscan` als Vertrauensanker. Environment-Variablen setzen:
   `HELMUT_CI_HOST` = Tailscale-IPv4,
   `HELMUT_CI_HOST_PUBLIC_KEY` = `ssh-ed25519 <Base64>` ohne Kommentar,
   `HELMUT_CI_GATE_SHA256` = SHA256 der installierten Bridge,
   `HELMUT_TS_CLIENT_ID`, `HELMUT_TS_AUDIENCE`.
   Zuletzt `HELMUT_HETZNER_CI_ENABLED=probe-only-v1` setzen.
7. Erst nach gesondert erlaubter Integration des Workflows in `main` genau einen
   Verbindungscheck starten. Ein neuer `workflow_dispatch`-Workflow muss vorher
   auf dem Defaultbranch existieren. Keine Schutzregel fuer den Erststart lockern.
   Danach kann Codex den vorhandenen Workflow mit repositorybegrenztem
   `Actions:write` ausloesen und das Ergebnis lesen. Der SSH-Schluessel bleibt bei GitHub.

## Sicherheitsgrenzen

- Kein GitHub-Runner auf Hetzner. Alle Steuerjobs sind GitHub-gehostet.
- Die Bridge akzeptiert genau `helmut-ci-probe-v1 <32-stellige-Zufallskennung>`.
  Client und Server muessen dieselbe Kennung sowie den installierten Quellhash
  liefern. Die SSH-Verbindung muss auf beiden Seiten eine Tailscale-IPv4 verwenden.
- Der SSH-Schluessel erlaubt keine Shell, Weiterleitung, PTY oder Benutzer-Startdateien.
  Authorized-Keys, Bridge und SSH-Konfiguration gehoeren root.
- Der Client hat einen festen SSH-Hostkey, einen Gesamttimeout und keinen Retry.
  Er vererbt dem SSH-Prozess keine GitHub-/Production-Secrets. Ungepruefte
  Remoteausgabe und Fehlermeldungen erscheinen nicht in Actions-Logs.
- Der Check liest Betriebssystem, Architektur, RAM, freien Platz und cgroup-v2.
  Einen eigenen rootless Docker prueft er nur, wenn dessen Socket bereits existiert.
  Niemals Zugriff auf `/var/run/docker.sock`, kein Root-Docker-Fallback.
- Rootless Docker ist noch nicht installiert oder als native Testumgebung
  qualifiziert. Fehlendes Docker wird ehrlich als `null` gemeldet. Fuer einen
  spaeteren Testexecutor braucht es eine separate isolierte, geheimnisfreie
  Arbeitsumgebung; native Messvertraege werden dabei nicht veraendert.

## PR942 direkt danach

Aktueller Draft: `29b05ac0281347f8cde82b903b12f57e8cd5d8c9`,
Basis PR940 `0f643b50084c3b3b11fb0279ab0acef6c09bdcaa`.
Vier-TX-Funktionsprofiler vorbereitet; Zeitfix, Unit60, 500MB-Reserve und
500er-Nachweis bleiben offen. Kein neuer Profilerlauf durch diesen Auftrag.

Der vorhandene `local-unit-native-execution-host.py` bindet Docker28.4.0/
API1.51/GitCommit249d679 und `/usr/local/bin/docker` sowie konkrete private
Originalpfade. Hetzner29.1.3 und eine rootless Umgebung sind **kein** Ersatz fuer
diese Qualifikation. Keine Versionspruefung abschalten, alte GO/Claims/OIDs
wiederverwenden oder Originale still ueber GitHub transportieren.

Nach dem sicheren Transportcheck zuerst die Hostkompatibilitaet und die
Erreichbarkeit der notwendigen authentischen Originale rein lesend klaeren.
Der Auftrag erlaubt keinen Originaltransfer. Fehlen sie auf Hetzner, bleibt die
echte PR942-Messung gesperrt. Vor einer Messung gelten weiterhin deren konkrete
Freigabe und frische Admission (mindestens10GiB frei), alle unveraenderten
Ressourcen-/Zeit-/Once-/Quell- und Runtimebindungen. Keinen Volltest starten.

## Lokale Pruefung dieser Vorbereitung

12 synthetische Python-Gruppen einschliesslich Befehlsinjektion, falscher Bindung,
Hostkey-Format, Geheimnisumgebung und temporaerer Key-Loeschung PASS.
Workflow-YAML, feste Action-Pins, Shellsyntax und der echte OpenSSH-Parser mit
ausgewerteten CI-Beschraenkungen PASS. Dafuer nur einen temporaeren synthetischen
Hostkey verwendet, keinen SSH-Dienst gestartet. DeepSeek Flash High hat die
Anleitung lesend mit dem Code verglichen; die gemeldeten Voraussetzungen sind
jetzt ausdruecklich beschrieben. Keine Liveverbindung oder Hostinstallation.

PR942 Head29b05ac0: Pflicht-CI40141814414 SUCCESS lesend bestaetigt; keine
Wiederholung gestartet. Gruene CI ist keine native Messung auf Hetzner.

## Rueckweg

`HELMUT_HETZNER_CI_ENABLED` entfernen und die CI-Public-Key-Datei auf Hetzner
sperren/entfernen. Fuer vollstaendigen Transportentzug zusaetzlich die
Tailscale-Federation widerrufen. Administrator-SSH und Production bleiben
unveraendert. Laufende Tests gibt es in dieser Probe-Stufe nicht; keine
Originale, Volumes oder Datenbanken loeschen.

Der Installer ist absichtlich nur fuer eine neue Installation bestimmt.
Ein Zugriffs-Widerruf entfernt keinen Account und keine Testdaten. Zur spaeteren
Wiederaufnahme die bestehende Installation/Dateihashes/Schluessel separat pruefen;
keinen Installer durch Account-Loeschung oder Entfernen seiner Guards erzwingen.
