# HELMUT Quellenworker auf Hetzner

Der Worker verarbeitet die vorhandene Supabase Warteschlange `helmut_jobs` direkt auf dem Server. Alle 15 Minuten prüft er, ob ein Quellenfenster ansteht. Die gemeinsame Reservierung in Supabase verhindert eine doppelte Verarbeitung desselben Zeitfensters. Abrufe, PDF Verarbeitung und die zugehörigen Modellaufrufe laufen im Worker. Die App sowie die getrennten Jobs für Lage und Morgenbriefing laufen weiterhin auf Vercel.

Die Basis ist [PR #1324](https://github.com/ernisch/helmut-pilot/pull/1324). Die genehmigte DLQ Migration muss in der gewählten Datenbank vorhanden sein. Das Umziehen entfernt das Laufzeitlimit der Vercel Function für die Quellenarbeit. Bestehende Arbeitsfenster, Fristen für einzelne Aufträge, Quellenkontingente und Modellkostenregeln gelten weiter.

## 1. Hetzner Server und Firewall vorbereiten

In der Hetzner Cloud Console einen Server mit Ubuntu 24.04 LTS in Nürnberg oder Falkenstein wählen. Einen vorhandenen CX22 kannst du verwenden. Bei einer Neubestellung wählst du den verfügbaren x86 Tarif der entsprechenden Größe. Bei der Erstellung deinen öffentlichen SSH Schlüssel hinterlegen.

Unter **Firewalls** eine Regel für eingehende Verbindungen anlegen und dem Server zuordnen. Erlaube nur **TCP 22** von deiner öffentlichen IPv4 als `DEINE_IPV4/32`. Falls du dich per IPv6 verbindest, ergänze deine IPv6 als `DEINE_IPV6/128`. Ausgehende Regeln leer lassen, damit der Server DNS, Paketquellen, öffentliche Quellen, Supabase und Azure erreichen kann. Docker veröffentlicht keinen Port. Die Statusprüfung läuft über SSH.

[Hetzner Firewall Anleitung](https://docs.hetzner.com/de/cloud/firewalls/getting-started/creating-a-firewall/) · [Hetzner Standorte und Tarife](https://www.hetzner.com/cloud/)

Melde dich zuerst per SSH als `root` an. Richte einen eigenen Benutzer ein. Das Passwort wird für `sudo` auf dem Server gebraucht.

```bash
ssh root@SERVER_IP
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
```

**Test:** Öffne ein 2. Terminal und prüfe `ssh deploy@SERVER_IP` und anschließend `sudo -v`. Lass die erste Verbindung offen. Deaktiviere erst nach einem erfolgreichen Test die SSH Anmeldung mit Passwort und als Root:

```bash
sudo tee /etc/ssh/sshd_config.d/00-helmut.conf >/dev/null <<'CONFIG'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONFIG
sudo sshd -t && sudo systemctl reload ssh
```

Öffne danach erneut eine Verbindung als `deploy`. Wenn deine öffentliche IP wechselt, aktualisiere die erlaubte Adresse in der Cloud Console.

## 2. Docker und Node.js installieren

Führe diese Befehle auf dem Hetzner Server aus. Docker installiert die Laufzeit. Node.js 22 steckt bereits im Docker Image und wird beim Bau geladen.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<CONFIG
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
CONFIG

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

**Test:** `sudo docker compose version` zeigt die Compose Version. `sudo docker run --rm node:22-bookworm-slim node --version` meldet Node.js 22.

[Docker Installation für Ubuntu](https://docs.docker.com/engine/install/ubuntu/) · [Docker Compose Dienstoptionen](https://docs.docker.com/reference/compose-file/services/)

## 3. Den Worker übertragen und im Standby starten

Der folgende Befehl holt den vorbereiteten Branch. Bei einem privaten Repository verwende einen lesenden GitHub Deploy Key oder den unten gezeigten Transfer von deinem Rechner. Für die spätere Produktion verwenden Worker und Vercel denselben abgenommenen Code.

```bash
git clone --branch codex/hetzner-quellenworker-20261123 https://github.com/ernisch/helmut-pilot.git ~/helmut-quellenworker
cd ~/helmut-quellenworker
```

Wenn dein Rechner bereits Zugriff auf GitHub hat, kannst du alternativ von dort übertragen. Im **lokalen HELMUT Repo** auf dem vorbereiteten Branch ausführen:

```bash
git archive --format=tar.gz --output=helmut-worker.tar.gz HEAD
scp helmut-worker.tar.gz deploy@SERVER_IP:~/
```

Auf dem **Server**:

```bash
mkdir -p ~/helmut-quellenworker
tar -xzf ~/helmut-worker.tar.gz -C ~/helmut-quellenworker
cd ~/helmut-quellenworker
gzip -dc ~/helmut-worker.tar.gz | git get-tar-commit-id > .worker-commit
```

Lege die Datei für die Einstellungen außerhalb des Repositorys an. Für einen reinen Standby Start darf sie leer sein. Der Startbefehl funktioniert für beide Übertragungswege.

```bash
sudo install -d -m 0700 /etc/helmut
sudo touch /etc/helmut/worker.env
sudo chmod 0600 /etc/helmut/worker.env
WORKER_SHA=$(git rev-parse HEAD 2>/dev/null || cat .worker-commit)
sudo env HELMUT_COMMIT_SHA="$WORKER_SHA" docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=30 worker
```

**Test:** Der Container steht auf `Up`. Im Log steht `standby`. Unter `PORTS` gibt es keine veröffentlichte Portweiterleitung. Der Standby Start führt keine Quellenabrufe aus.

## 4. Einstellungen und Startbereitschaft prüfen

Öffne die Datei mit `sudoedit /etc/helmut/worker.env`. Pro Zeile steht `NAME=WERT`. JSON und Kennwörter ohne zusätzliche Anführungszeichen um den gesamten Wert eintragen. Verwende für die Abnahme die Werte des vorgesehenen Supabase Projekts. Schlüssel gehören ausschließlich in diese Datei oder in den dafür vorgesehenen Passwortspeicher.

| Einstellungen | Wert |
|---|---|
| `HELMUT_STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | URL und vorhandener Dienstschlüssel des Zielprojekts |
| `HELMUT_WORKER_SUPABASE_HOST` | Derselbe Supabase Hostname ohne `https://` |
| `HELMUT_SUPABASE_STORE_ID`, `HELMUT_SUPABASE_AUTH_STORE_ID` | Identisch zur gewählten bestehenden Umgebung. Falls dort nicht gesetzt, gelten `main` und `main-auth`. |
| `HELMUT_V3_STORE`, `HELMUT_SCALABLE_PIPELINE`, `HELMUT_KLASSEN_GRENZEN`, `HELMUT_SOURCE_MODE` | Die wirksamen Einstellungen der bestehenden Quellenverarbeitung übernehmen. |
| `HELMUT_QUELLEN_ARBEITSFENSTER`, `HELMUT_QUELLEN_FENSTER_TAG`, `HELMUT_QUELLEN_SEKUNDEN_TAG`, `HELMUT_ORIGINALABRUFE_TAG`, `HELMUT_JOB_DISPATCH_MODE` | Bestehende Quellenparameter übernehmen. Arbeitsfenster stehen auf `on`. Versandmodus bleibt `off` oder `shadow`. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `DIP_API_KEY` | Bestehende freigegebene Verbindungen für Azure und den Bundestag übernehmen. |
| `HELMUT_BETRIEBSKOSTENVERTRAG_JSON`, optional `HELMUT_BETRIEBSZULASSUNG_JSON` | Unverändert aus der gewählten Umgebung übernehmen. Optionale Zeile weglassen, wenn die Variable dort fehlt. Das bestehende Kostenbuch muss in Supabase lesbar sein. |
| Weitere Quellen, Mandanten und Budgetflags | Wirksame Einstellungen für den bestehenden Quellenprozess mit dem [Inventar](env-inventar.md) abgleichen. Dazu zählen je nach Umgebung Quellenfreigaben, Parser, Understanding und Budgetgrenzen. |
| `HELMUT_EXEC_LOCATION` | `hetzner-de` |
| `HELMUT_CRAWL_EXECUTOR` | Für diese Prüfung Zeile weglassen. |

**Test:** `sudo docker compose run --rm --no-deps worker node worker.js --check` liest Bereitschaft, DLQ und vorhandenes Kostenbuch. `bereit` bestätigt diese Prüfungen. Ein Azure Modellaufruf ist dabei ausgeschlossen. Die Aussage `bereit` ist daher keine Bestätigung des Azure Schlüssels oder eines vollständigen Crawls.

## 5. Automatischen Start prüfen und Quellenbetrieb umstellen

Docker ist durch Schritt 2 beim Systemstart aktiviert. Compose setzt `restart: unless-stopped`. Nach einem Serverneustart kommt ein laufender Container wieder hoch. Ein absichtlich gestoppter Container bleibt aus. Zum kontrollierten Beenden bekommt der Prozess bei Compose bis zu 5 Minuten, um das aktive Arbeitsfenster abzuschließen.

**Test im Standby:** Starte den neuen Server mit `sudo reboot` neu. Verbinde dich wieder und prüfe `sudo docker compose ps` und `sudo docker compose logs --tail=30 worker` im Projektordner. Erwartet sind `Up` und `standby`. Lokal kannst du außerdem `node scripts/lokal.js -- node scripts/hetzner-quellenworker-test.js` ausführen.

Die Umschaltung im laufenden Betrieb erfolgt in dieser Reihenfolge:

1. Prüfe den freigegebenen Vercel Stand mit dem Umschaltcode und die Startbereitschaft unter Schritt 4. Vergewissere dich, dass gerade kein Quellenlauf aktiv ist.
2. Setze in Vercel für **Production** `HELMUT_CRAWL_EXECUTOR=hetzner` und veröffentliche den abgenommenen Stand erneut. Der geschützte Aufruf von `/api/cron/crawl` antwortet jetzt nur mit `quellenlauf-auf-hetzner`. Vercel behält den Zeitplaneintrag als Rückweg. Manuelle Quellenstarts auf Vercel sind in diesem Modus für die Dauer der Umstellung deaktiviert.
3. Ergänze `HELMUT_CRAWL_EXECUTOR=hetzner` in `/etc/helmut/worker.env`. Führe `sudo docker compose up -d --force-recreate` aus. Der Worker übernimmt den nächsten zulässigen Termin selbst.
4. Prüfe im Log `bereit` und ein `quellenfenster` mit Laufkennung. In Supabase bestätigt eine abgeschlossene Zeile für `warteschlange-crawl` mit `location = 'hetzner-de'` die Ausführung. Prüfe zusätzlich, wie viele Quellen vor dem redaktionellen Stichtag ankamen. `Up` allein bestätigt kein fertiges Briefing.

Für den Rückweg zuerst `sudo docker compose stop worker` ausführen und den Abschluss oder Ablauf der letzten Besitzsperre prüfen. Danach den Schalter bei Vercel entfernen und neu bereitstellen. Der hinterlegte Cron übernimmt den nächsten Termin.

Der Hetzner Standort deckt den Worker ab. Supabase und Azure bleiben eigene Verarbeitungsschritte mit ihren bestehenden Verträgen und Regionen.
