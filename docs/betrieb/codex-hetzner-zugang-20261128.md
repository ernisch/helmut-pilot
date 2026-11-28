# Separater Codex-Zugang zu Hetzner

Stand: 28.11.2026, 17:03 Uhr Europe/Berlin. Auftrag: dauerhafter Codex-Zugang
vom vorhandenen Mac, ohne Beeinträchtigung des produktiven Quellenworkers,
Serverneustarts oder Änderung der Kostenlimits.

## Eingerichteter Zugang

- SSH-Alias auf dem Mac: `helmut-codex`, Benutzer `codex`, eigener Benutzer und
  eigene Gruppe, gesperrtes Unix-Passwort, keine sudo- oder Docker-Rechte.
- Nur der bereits funktionierende Mac-Public-Key ist für dieses Konto autorisiert.
  `restrict,pty` sperrt Weiterleitungen und SSH-User-RC, erlaubt aber die Sitzung.
  Private SSH-Schlüssel wurden nicht auf den Server übertragen.
- Mac-Konfiguration: `~/.ssh/config`, Modus 0600, strikte Prüfung des bereits
  bekannten Hostschlüssels, kein Agent-/X11-/Portforwarding und keine
  Passwort-Rückfrage. Befehl: `ssh helmut-codex`.
- Codex CLI 0.157.1, passend zur lokalen CLI, über den geprüften offiziellen
  Installer mit Release-Prüfsumme im Home installiert. `codex` ist auch im
  nichtinteraktiven SSH-PATH verfügbar. Kein globales npm-/Node-Setup.
- Eigener öffentlicher Projektklon: `/home/codex/workspaces/helmut`, Ausgangsstand
  `4c25df17f56b0c8b4fd1c6f7a2bfb6962184b07b`, eigener Arbeitsbranch
  `codex/server-workspace-20261128`; kein Zugriff auf den Worker-Checkout.
- Separate ChatGPT-Anmeldung durch vom Betreiber bestätigten Gerätecode.
  Der lokale Authentifizierungscache wurde nicht kopiert; keine API-Schlüssel
  eingerichtet. Home, `.ssh` und `.codex` haben Modus 0700, Schlüsselzulassung,
  Konfiguration und serverseitiger Anmeldecache 0600.
- Benanntes Profil `helmut` in `~/.codex/config.toml`: `extends = ":workspace"`,
  Netzwerkzugriff für Sandbox-Befehle deaktiviert, Freigaben `on-request`,
  Anmeldung auf ChatGPT beschränkt, Websuche deaktiviert. Modell und Denkstufe
  wurden nicht festgelegt oder umgestellt. Repository-Regeln gelten weiter.

## Ubuntu-Sandbox und erhaltene Erstfehler

Die erste Konfiguration mit `approval_policy = "untrusted"` wurde von dieser
CLI-Version abgelehnt und vor Nutzung auf `on-request` korrigiert.
Der erste Sandbox-Aufruf scheiterte mit
`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.
Kernelmeldungen belegten AppArmor-Verweigerungen für `setpcap` und `net_admin`.

Nach ausdrücklicher Einzelfreigabe des Betreibers wurde ausschließlich
`bubblewrap` 0.9.0-1ubuntu0.3 neu installiert. Das unveränderte offizielle Profil
`bwrap-userns-restrict` wurde aus dem Ubuntu-Paket `apparmor-profiles` extrahiert,
syntaxgeprüft und gezielt unter `/etc/apparmor.d/` geladen. Das Paket
`apparmor-profiles` selbst wurde nicht installiert, AppArmor und libapparmor
blieben auf 4.0.1really4.0.1-0ubuntu0.24.04.7. Keine Paketupgrades oder Dienstneustarts.
`kernel.apparmor_restrict_unprivileged_userns` bleibt **1**; das Docker-Profil
wurde nicht verändert.

Ein anschließender Prüfbefehl verwendete zunächst das Nur-Lesen-Profil und konnte
auch im Projekt nicht schreiben. Die endgültige Prüfung wählte das benannte
Profil ausdrücklich mit `codex sandbox -P helmut` und bestand.

## Tatsächliche Prüfungen

Die lokalen Verbindungs-/Sandbox-Prüfprogramme liefen über `scripts/lokal.js`:

- SSH ohne Passwort-/Passphrase-Rückfrage und `codex --version` erfolgreich.
- App-Server ausschließlich über SSH/stdio initialisiert, endgültige Konfiguration
  mit `--strict-config` akzeptiert und ChatGPT-Konto mit Tokenauffrischung bestätigt.
  Kein Modellauftrag und kein kostenpflichtiger API-Test.
- Sandbox: temporäre Datei im Projekt schreibbar und wieder entfernt;
  Schreiben außerhalb des Projekts und Netzwerkzugriff verweigert.
- Zugriff auf `/etc/helmut/worker.env`, `/root` und den Docker-Socket verweigert;
  keine erfolgreiche sudo-Ausführung. Repository-Klon sauber.
- Vorher-/Nachher-Abgleich auf dem Server: Container `23673f9dad97`, Startzeit,
  Neustartzähler **0**, laufender Zustand, Bootkennung und SHA256 der
  Produktionskonfiguration unverändert. Private Vergleichsbelege liegen
  rootgeschützt unter `/root/codex-access-20261128/`, außerhalb von Git.
- Keine neuen öffentlichen Listener: nur vorhandenes SSH und lokaler DNS-Dienst.
  Worker, Cron, Secrets und Kostenlimits 1 USD je UTC-Tag / 30 USD insgesamt
  wurden nicht geändert.

## Verwendung und Rückweg

Im Mac-Terminal:

```bash
ssh helmut-codex
cd /home/codex/workspaces/helmut
codex
```

Für die Desktop-App unter Einstellungen → Verbindungen den SSH-Host
`helmut-codex` aktivieren und `/home/codex/workspaces/helmut` wählen.
Die technische SSH-/App-Server-Verbindung ist geprüft; die Aktivierung in der
App-Oberfläche bleibt offen, weil die verfügbare Computersteuerung nicht startete.

Rückweg über den bestehenden administrativen SSH-Zugang: zuerst ausschließlich
die neue Schlüsselzulassung des Benutzers entfernen und seine Sitzungen beenden.
Bei vollständigem Rückbau dessen ChatGPT-Anmeldung abmelden und das neue Konto
nach Sicherung eigener Arbeit entfernen. Den Mac-Alias entfernen. Das ausschließlich
hierfür hinzugefügte AppArmor-Profil gezielt entladen/entfernen und Bubblewrap nur
entfernen, wenn es zwischenzeitlich keine weiteren Nutzer hat. Worker, bestehende
SSH-Zugänge und globale Schutzregeln dabei unberührt lassen. Kein automatischer Rückbau.

Primäranleitungen: [Installation](https://learn.chatgpt.com/docs/codex/cli),
[Geräteanmeldung](https://learn.chatgpt.com/docs/auth),
[SSH-Verbindungen](https://learn.chatgpt.com/docs/remote-connections) und
[Ubuntu-Sandbox](https://learn.chatgpt.com/docs/sandboxing?surface=cli).
