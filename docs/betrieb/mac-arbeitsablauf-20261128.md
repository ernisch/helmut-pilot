# Lokale Mac-Entwicklung und bestehende Zugänge

Stand: 28.11.2026, 19:46 Uhr Europe/Berlin. Verbindliche Entscheidung:
gesamte Entwicklung lokal in Codex auf dem Mac. Regeln und Freigaben stehen in
[AGENTS.md](../../AGENTS.md), technische Grenzen in [CLAUDE.md](../../CLAUDE.md).
Diese Anleitung ist die kanonische Stelle für Befehle und Zugangsnachweise.

## Zuständigkeit und Zugänge

Codex führt die Schritte selbst aus; regelmäßige Terminalbefehle des Betreibers
sind nicht vorgesehen. Vorhandene verbundene Tools bevorzugen. Für lokalen Git-
Transport und SSH die vorhandenen Mac-Werkzeuge verwenden. Keine Installation,
neue Zugangsdaten, Secretkopie oder pauschale Rechteerweiterung erforderlich.
Netz-/Schlüsselbund-/Prozesszugriffe können außerhalb der Codex-Sandbox nötig
sein: nur den konkreten erlaubten Befehl mit dem vorhandenen Freigabeverfahren
ausführen, niemals Sandbox oder Produktionsschutz global abschalten.

| Dienst | Vorhandener Weg und rein lesender Nachweis am 28.11. | Grenze |
| --- | --- | --- |
| GitHub | `gh` und Git-HTTPS, Anmeldung `ernisch` über `osxkeychain`; Repository `ernisch/helmut-pilot`, Standardbranch `main`, bestehendes Recht `ADMIN`; Remote-SHA, PRs und Fetch erfolgreich gelesen. | Keine Tokens ausgeben/übertragen. ADMIN erlaubt keine Schutzumgehung. |
| Hetzner | `ssh helmut-codex`, Benutzer `codex`, Host `helmut-worker`; Anmeldung ohne Dialog, strikte Prüfung des bekannten Hostschlüssels, kein Agent-/X11-/Portforwarding. | `sudo -n -l` verweigert; Worker-Env nicht lesbar und Docker-Socket nicht schreibbar. Kein Entwicklungsauftrag auf dem Server. |
| Supabase | Verbundene Supabase-Tools: Projekt `ddckuvvpcytqbyfmbvie`, `ACTIVE_HEALTHY`; `BEGIN READ ONLY; SELECT current_database(), current_setting('transaction_read_only'), 1; ROLLBACK;` lieferte `postgres`, `on`, `1`. | Keine Kundentabellen, RPCs, Migrationen oder Schreibabfragen für diesen Nachweis. `service_role` ist keine Mandantenfreigabe. |
| Vercel | Verbundene Vercel-Tools: Team `nohut`, Projekt `helmut-pilot` / `prj_xbZ6QzTkr7YoxQI71lW59FT03IR3`; Projekt und Production-Deploymentliste gelesen, SSO-Schutz aktiv. | Keine CLI-Installation, Env-Abfrage mit Secretwerten, neue Freigabelinks oder Deploymentaktion erforderlich. |
| Lesender Briefingvertrag | Vorhandener Cronschluessel am28.11.um18:57Berlin verdeckt eingegeben, ausschliesslich mit bestehendem GET `/api/cron/briefing-nachweis` validiert:200. Dauerhaft im macOS-Schluesselbund unter `helmut-pilot-cron-secret`, bytegleich zurueckgelesen. | Kein Secretwert in Chat, Git, Logs oder Argumenten; keine Rotation, Env-Aenderung oder Schreibroute.200 ist keine vollstaendige Morgenabnahme. |

Die vorherigen lokalen `.env`-Eintraege enthielten nur den Beispielwert; der
vorhandene andere Operator-Schluesselbundeintrag wurde mit403 abgewiesen und
nicht ersetzt. Nur der bestaetigte Cronschluessel wurde neu lokal hinterlegt.
Der private Nur-Lesen-Reader uebergibt ihn vom Schluesselbund ausschliesslich
im Speicher an System-curl ueber stdin. `-q` unterbindet Standard-curlrc;
TLS-Pruefung bleibt aktiv. Der erste Python-SSL-Versuch scheiterte am lokalen
CA-Pfad, nicht an Supabase. Keine pauschale Secretdateiuebernahme in Worktrees.

Erstfehler GitHub: innerhalb der Sandbox erschien die gespeicherte Anmeldung
ungültig; derselbe vorhandene Schlüsselbundzugang funktionierte außerhalb der
Sandbox. Kein Logout, Tokenwechsel oder neuer Login wurde ausgeführt.
Die klassische Protection-API meldete HTTP 404; die zusätzliche Ruleset-Abfrage
bestätigte das aktive `helmut-main-protection` mit PR-, Pflichtcheck-, Lösch- und
Non-Fast-Forward-Schutz. Schutzkonfiguration unverändert.

Die Zugänge wurden jetzt geprüft, ihre künftige Gültigkeit ist keine Garantie.
Bei Ablauf gezielt den betroffenen Zugang erneuern lassen; keine Routinebefehle
an den Betreiber delegieren und keinen Server-/Rootzugang als Ersatz erzwingen.
Der [frühere Hetzner-Codex-Aufbau](codex-hetzner-zugang-20261128.md) bleibt als
historischer Beleg erhalten; seine Anleitung zur Serverentwicklung ist durch
die lokale Betreiberentscheidung überholt. Bestehende Serverdateien und
Sitzungen wurden weder gelöscht noch beendet. Administrativer Betriebszugriff
ist gesondert zu prüfen und bleibt an die konkrete Aktionsfreigabe gebunden.

## Vor jedem neuen Entwicklungsauftrag

1. Im Hauptrepository `/Users/lueynohut/Documents/Helmut` zunächst lokale Regeln,
   Branch/HEAD, Index, Arbeitsbaum, unversionierte **und ignorierte** Dateien,
   Worktrees, laufende Arbeit und relevante offene PRs prüfen. Keine `.env*`,
   Schlüssel oder vertraulichen Originale ausgeben. Metadaten und Hashes genügen.
2. Betroffene offene Änderungen vor dem Update sichern: Index-/Arbeitsbaum-Patch,
   ursprünglichen Commit, Dateimanifest und Dateiinhalte einschließlich relevanter
   ignorierter Dateien erhalten. Private Inhalte verschlüsselt außerhalb von Git
   sichern; Verzeichnis 0700, Dateien und lokal verwahrtes Entschlüsselungsmaterial
   0600. Archiv entschlüsselt streamend gegen SHA256-Manifest prüfen, danach
   Originale erneut auf Drift prüfen. Eindeutig unveränderte vorhandene Sicherungen
   wiederverwenden; keine pauschale tägliche Kopie aller privaten Originale.
3. Remoteidentität prüfen, dann GitHub abrufen. Beispiel für Codex:

   ```bash
   git remote get-url origin
   git status --short --branch
   git diff --stat
   git diff --cached --stat
   git worktree list
   gh pr list --repo ernisch/helmut-pilot --state open
   git -c maintenance.auto=false -c gc.auto=0 fetch --no-auto-maintenance origin
   git rev-list --left-right --count main...origin/main
   ```

   Erwartetes Remote: `https://github.com/ernisch/helmut-pilot.git` oder dessen
   bereits autorisierte SSH-Identität. Keine automatische Remoteumschreibung.
   Keine Bereinigung alter Refs/Worktrees im Rahmen des Abrufs.
4. Nach Prüfung der eingehenden Dateipfade auf Kollisionen mit lokalen Dateien:
   nur `main` mit sauberem Index/Arbeitsbaum per `git merge --ff-only origin/main`
   aktualisieren. Zusatzdateien dürfen bestehen bleiben, wenn sie nicht kollidieren.
   Bei Divergenz/offener Arbeit den Bestand erhalten und einen isolierten lokalen
   `codex/`-Worktree von `origin/main` verwenden. Niemals `reset --hard`, `clean`,
   erzwungenen Checkout oder automatisches Stash/Pop zur Aktualisierung verwenden.
   Ein verwaister Worktree ist offene Arbeit, keine Erlaubnis zum Löschen.
5. Erst jetzt aktuellen Statuskopf und auftragsrelevante Dokumentationen lesen;
   neue Entwicklung von diesem aktuellen Stand beginnen. Bereits beauftragte
   Arbeit gezielt fortsetzen und aktuellen `main` kontrolliert integrieren.
   Alte Branches, lokale Architekturentwürfe oder Archive sind keine neue Basis.
   Scheitert der Abruf, keinen alten Stand als aktuellen GitHub-Stand ausgeben.

## Tests, Betriebslesen und Abschluss

Lokale Tests immer über `node scripts/lokal.js -- …`; Produktionskennungen
bleiben aus Testkindprozessen entfernt. Verbindungsnachweise sind getrennte,
explizit lesende Betriebsschritte über die verbundenen Tools bzw. SSH. Kein
Testschutz wird dafür umgangen. Bestehende Secretdateien nicht pauschal laden
oder in neue Worktrees kopieren. Anwendungscode liest Secrets aus `process.env`.

Für Hetzner genügt zur erneuten Verbindungsprüfung beispielsweise:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 helmut-codex 'id -un; hostname'
```

Keine `StrictHostKeyChecking=no`-Option, kein `ssh-keyscan` als Vertrauensersatz,
keine Weiterleitungen oder remote gestartete Codex-/Testprozesse. Für Supabase
zuerst Projektidentität/Zustand lesen, nur bei Bedarf eine explizite Nur-Lesen-
Transaktion. Für Vercel Team/Projekt und Deploymentmetadaten lesen; ein
abgebrochener Build ist kein Beweis eines erfolgreichen Deployments.

Nach Änderungen auftragsbezogenen Code **und** Dokumentation gemeinsam prüfen;
nur exakt benannte Dateien stagen, kein `git add -A` im privaten Hauptrepository.
Lokale Pflichtprüfungen vor Push, anschließend eigener Branch/PR und beide
erfolgreichen Pflichtchecks am exakten Kopf. Vollständigen aktuellen Diff,
Abnahmekriterien, aktuellen `main`, offene PRs und Konfliktfreiheit vor Merge
erneut prüfen. Dauerfreigabe gemäß AGENTS.md anwenden, Merge an die geprüfte SHA
binden; keine Adminumgehung. Bei geändertem Kopf passende Nachweise neu abwarten.

Nach Merge reguläres Deployment bzw. dokumentationsbedingten Skip lesen, dann
erneut fetch und den lokalen `main` nach erneuter Zustands-/Kollisionsprüfung
per Fast-Forward nachziehen. `git rev-parse main origin/main` und bei Bedarf
`git ls-remote origin refs/heads/main` belegen den Gleichstand. Bei neuer
paralleler Arbeit auf dem Hauptcheckout den aktuellen isolierten Worktree
erhalten und die lokale Synchronisationsblockade konkret nennen.
Keine neuen Cronjobs, Hintergrund-Synchronisation oder automatischen Stashes.

## Lokale Sicherung und Übernahme am 28.11.2026

Ausgangsstand Hauptrepository: `main` auf `990724e4`, keine Änderungen an
versionierten Dateien, aber 206 lokale Zusatz-/ignorierte Dateien mit
1.897.085.529 Byte. Darunter Secretdateien, private Unterlagen und alte Entwürfe;
ihre Inhalte wurden nicht veröffentlicht oder zur aktuellen Entwicklung erklärt.
Separater bestehender Hetzner-Zugangsworktree auf `9827619d` war sauber.

Der alte Worktree `37c3dcf8-7115-4271-8de2-28430a073b7c/Helmutt` enthielt einen
verwaisten Git-Verweis auf den früheren Verzeichnisnamen `Documents/Helmutt`.
Sein Zustand wurde mit explizitem vorhandenem Git-Verzeichnis nur gelesen:
Basis `455a7e6a`, neun lokale Dateien (294.166 Byte), darunter sieben geänderte
Code-/Schema-Dateien, eine neue Profildatei und `.DS_Store`. Keine Integration,
Reparatur, Bereinigung oder Reaktivierung dieses alten Entwicklungsstands.

Beide Bestände liegen lokal außerhalb von Git unter
`~/.codex-deepseek/helmut-mac-backups/`, Sicherungen `20261128-174627` und
`orphan-20261128-174731`. Der vorhandene lokale Speicherpfad bezeichnet keine
DeepSeek-Nutzung; es gab keinen DeepSeek-Aufruf. Jeweils verschlüsseltes
Dateiarchiv (AES-256-CBC/PBKDF2, zufällige lokale Passphrase), SHA256-Manifest,
Git-Bundle und zugehörige Zustandsbelege; Entschlüsselung/Dateihashes,
unveränderte Originale und `git bundle verify` erfolgreich geprüft.
Entschlüsselungsmaterial bleibt lokal mit 0600; nicht in Chat, Git oder Drive
übertragen. Diese Sicherung liegt auf demselben Mac und ersetzt keine externe
Datensicherung. Lokale Sicherungsbranches halten zusätzlich `990724e4` und
`455a7e6a`; sie wurden nicht gepusht.

GitHub wurde abgerufen und `main` kollisionsfrei um 117 Commits auf
`9d17c1197792ff97e6add166f84801a16b193df8` vorgezogen, einschließlich der
aktuellen Betriebs-/Architekturdokumentation. Alle lokalen Originale und
Worktrees erhalten. Dokumentationsarbeit separat auf
`codex/mac-arbeitsablauf-20261128`; offene fremde PRs bleiben unberührt.
Keine Produktionsdaten-, Secret-, Cron-, Budget-, Server- oder Schutzänderung.

Lokale Abnahme: `git diff --check` erfolgreich, Dokumentationslinks vorhanden,
`CURRENT_STATE.md` innerhalb 30.000 Zeichen/350 Zeilen. Der vorhandene Prüfplan
lief über `scripts/lokal.js` und wählte `mode:docs`: keine Offline-, Datenbank-
oder Browsergesamtabnahme erforderlich. Beide Pflichtchecks bleiben für den
exakten PR-Kopf notwendig; ihr Ergebnis sowie Merge und Deployment/Skip sind
anschließend aus GitHub-/Vercel-Historie zu belegen.
