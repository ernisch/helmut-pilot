# Datenflussübersicht, Dienstleisterinventar & AVV-Liste (ENTWURF)

**Status: technischer ARBEITSENTWURF aus dem Audit 2026-07-15 — keine
Rechtsberatung. Muss von Anwalt/Datenschutzbeauftragtem geprüft und
verabschiedet werden.** Faktenbasis: Code-Stand `claude/helmut-audit-readiness-boirkf`.

## 1. Datenfluss (im Code verifiziert)

```
Öffentliche Quellen (RSS/Google News/DIP/amtliche Seiten)
      │ Crawl (Vercel-Function, Region fra1) — nur Metadaten + gekürzte
      │ Zusammenfassung (summary ≤ 240 Zeichen); V3 speichert KEINE Volltexte.
      │ ACHTUNG: der aktive V2-Blob-Pfad speichert das RSS-Feld `content`
      │ ungekürzt (crawler.js) — Anwaltsfrage F3 (Urheberrecht/Datenminimierung).
      ▼
Supabase Postgres (AWS eu-west-1, Irland)
  ├─ global/mandantenlos: raw_documents, knowledge_objects (KI-Analysen
  │  politischer Vorgänge inkl. mentioned_people = öffentlich handelnde
  │  Politiker), Quellenkatalog (publishers/retrieval_paths/...)
  ├─ pro Mandat (löschbar, seit Sprint 4 vollständig): profiles,
  │  mandate_profiles (politische Positionen! Art. 9), briefings, decisions,
  │  matching_results, profile_embeddings, office_outputs, llm_usage, ...
  └─ Blob-Store helmut_store: main (Betriebszustand), main-auth (Konten mit
     scrypt-Hashes, Sessions, Invite-/Reset-Tokens NUR als SHA-256-Hash mit
     Ablauf/Einmaligkeit, Audit-Log inkl. Login-IP), main-p-<mandat>
      ▼
KI-Verarbeitung: Azure OpenAI (laut Doku EU/Sweden Central, Deployment
gpt-5-mini) — erhält publicProfile (Mandatsprofil-Auszug inkl. politischer
Schwerpunkte/No-Go-Themen; seit KI-Profilfelder-Umsetzung 2026-07 zusätzlich
publicPositions, keyAudiences, riskTopics, opportunityTopics, governmentRole —
alles politische Personendaten, gekappt via capText) + Vorgangskontext.
profile.opponents (zu beobachtende Akteure) bleibt bewusst AUSSERHALB des
Prompts (nur Radar-Erwähnungserkennung, lokal). Kein Prompt-/Antwort-Logging im
Kostenlog (nur Tokens/Kosten/Modell).
      ▼
Auslieferung: Vercel (Functions fra1 gepinnt — Wirksamkeit auf aktuellem Plan
prüfen), Browser des Nutzers (PWA; SW cached nur statische Assets, keine
API-Daten). Web-Push über Browser-Push-Dienste (bei Chrome: Google FCM;
bei Firefox: Mozilla) — Subscription-Endpunkte = Drittlandtransfer möglich.
Betreiber-Alarm: CallMeBot (WhatsApp) — nur Systemstatus-Texte, keine
Mandatsinhalte (prüfen!).
```

**Besondere Kategorien (Art. 9 DSGVO), im System vorhanden:**
1. Mandatsprofil = politische Meinung/Zugehörigkeit des Kunden (party, faction,
   publicPositions, noGoTopics, riskTopics, opportunityTopics, keyAudiences,
   governmentRole, opponents) — Blob + mandate_profiles; davon gehen seit der
   KI-Profilfelder-Umsetzung 2026-07 publicPositions/keyAudiences/riskTopics/
   opportunityTopics/governmentRole auch in die KI-Prompts (opponents nicht).
2. Global geteilte KI-Analysen mit Nennungen öffentlich handelnder Politiker
   (knowledge_objects.mentioned_*).
3. Gecrawlte Personenartikel über den Abgeordneten (Radar/Archiv, V2-Blob).

## 2. Dienstleisterinventar (Auftragsverarbeiter-Kandidaten)

| # | Dienst | Zweck | Datenkategorien | Region | AVV-Status |
|---|---|---|---|---|---|
| 1 | Vercel Inc. | Hosting/Functions/Crons/Logs | alle App-Daten im Transit, Runtime-Logs (IP) | fra1 gepinnt (verifizieren) | **OFFEN — DPA akzeptieren + dokumentieren** |
| 2 | Supabase Inc. | Datenbank | ALLE gespeicherten Daten inkl. Art. 9 | AWS eu-west-1 | **OFFEN — DPA akzeptieren + dokumentieren** |
| 3 | Microsoft (Azure OpenAI) | KI-Analyse/Textentwürfe | Profilauszug + Vorgangskontext | lt. Doku Sweden Central — **im Azure-Portal verifizieren** | **OFFEN — MS DPA/Produktbedingungen dokumentieren** |
| 4 | Google (FCM) / Mozilla | Web-Push-Zustellung | Push-Endpunkt, Gerätetoken, Nachrichtentitel | Drittland möglich | **OFFEN — SCC/TIA-Frage an DSB** |
| 5 | CallMeBot | Betreiber-WhatsApp-Alarm | Systemstatustexte, Betreiber-Handynummer | unklar | **OFFEN — prüfen ob AV-Verhältnis; ggf. ersetzen (E-Mail)** |
| 6 | GitHub Inc. | Code, CI (führt Cron-Watchdog mit CRON_SECRET aus), Repo | Code, Workflow-Logs | global | **OFFEN — in Subprozessor-Betrachtung aufnehmen (bisher nirgends gelistet)** |
| 7 | OpenAI (nur Fallback, wenn AZURE_* fehlt) | KI | wie 3 | USA | **klären: in Production dauerhaft deaktiviert? Sonst DPA/SCC** |

## 3. AVV-/DPA-Aufgabenliste (Betreiber + Anwalt)

1. Vercel DPA im Dashboard akzeptieren, PDF ablegen (Ordner `recht/avv/`, nicht im Repo).
2. Supabase DPA akzeptieren, PDF ablegen.
3. Microsoft: Produktbedingungen/DPA für Azure OpenAI dokumentieren; EU Data
   Boundary-Zusage für das konkrete Deployment prüfen.
4. Push: DSB-Frage, ob FCM/Mozilla als Auftragsverarbeiter oder als eigenständige
   Dienste einzuordnen sind; SCC/TIA nur falls nötig.
5. CallMeBot bewerten — pragmatische Empfehlung: durch E-Mail-Alarm (EU-Anbieter)
   ersetzen, Punkt entfällt (deckt sich mit Roadmap B5 Zweitkanal).
6. GitHub: Rolle klären (Infrastruktur mit Zugriff auf CRON_SECRET + Code).
7. Ergebnisliste ins VVT übernehmen (vvt-entwurf.md §5).
