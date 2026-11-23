# HELMUT

HELMUT ist ein politischer KI Stabschef für Abgeordnete. Er bereitet belegte politische Quellen für **Lage**, **Radar**, **Briefing** und **Büro** auf. Ziel ist ein brauchbares Morgenbriefing, zunächst für 1 Pilotmandat und später für bis zu 100 Mandate.

## Aktuelle Systemarchitektur

- **Vercel Pro:** Kundenoberfläche, API, Anmeldung, Lage und Morgenbriefing sowie deren Zeitpläne. Schwere Quellenarbeit gehört nicht mehr in die Vercel Functions.
- **Hetzner Cloud:** Eigenständiger Node.js Quellenworker unter Docker Compose. Er prüft alle 15 Minuten sein Quellenfenster und übernimmt Quellenabrufe, PDF Verarbeitung, Queue Arbeit und zugehörige Azure OpenAI Aufrufe.
- **Supabase Production:** PostgreSQL mit `helmut_jobs`, `process_runs`, `helmut_store` und `helmut_quellen_dlq`; gemeinsamer Zustand für Worker und App.
- **Azure OpenAI:** Modellverarbeitung gemäß kontrolliertem Kosten und Zulassungsvertrag.

**Seit 23.11.2026 ist die Quellenverarbeitung auf Hetzner durch Produktionsquittungen belegt.** Die beiden um 16:15 und 16:30 Uhr Berliner Zeit gestarteten Läufe endeten jeweils mit Status `partial`. Produktive Ausführung ist damit belegt, vollständige Quellenabdeckung und Morgenbriefing sind noch offen.

Vercel bewahrt den bisherigen Quellencron nur als **geschützten manuellen Rückweg**. Der Umschalter ist `HELMUT_CRAWL_EXECUTOR=hetzner`. Bestehende Quoten, fachliche Zeitgrenzen, Quellenrechte, Mandantentrennung und Kostenkontrollen gelten weiter.

## Dokumentation

| Thema | Quelle |
| --- | --- |
| Technische Systemkarte und aktueller Ablauf | [Architektur](docs/ARCHITECTURE.md) |
| Tatsächlicher Betrieb, Abnahmen und offene Punkte | [Aktueller Status](docs/CURRENT_STATE.md) |
| Nachweis der Hetzner Umschaltung am 23.11. | [Produktionsbeleg](docs/betrieb/hetzner-live-20261123.md) |
| Betrieb, Bereitschaft und manueller Rückweg | [Hetzner Quellenworker](docs/betrieb/hetzner-quellenworker.md) |
| Fehlerquarantäne, Heartbeat und Teilfassungen | [Fehlertoleranz](docs/betrieb/helmut-fehlertoleranz-abnahme.md) |
| Entwicklungsvorgaben und Freigaben | [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) |
| Produkt und Zielgruppen | [START_HERE.md](docs/START_HERE.md) |

**Wichtig:** Architektur und gewünschter Sollzustand ersetzen keine aktuellen Produktionsbelege. Historische Vercel Quellenabläufe in älteren Dokumenten sind nicht mehr der Normalweg.
