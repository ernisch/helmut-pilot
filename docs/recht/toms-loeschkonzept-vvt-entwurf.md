# TOMs, Löschkonzept & VVT (ENTWURF — Anwalt/DSB-Prüfung erforderlich)

**Status: technischer ARBEITSENTWURF (Audit 2026-07-15), keine Rechtsberatung.
Alle technischen Aussagen sind im Code verifiziert; alle rechtlichen
Einordnungen sind zu prüfen.**

---

## Teil A — Technische und organisatorische Maßnahmen (Art. 32) — IST-Stand

**Zugriffskontrolle:** Individuelle Konten (E-Mail + Passwort, scrypt mit Salt,
timingsafe-Vergleich, keine User-Enumeration); Rollen admin/abgeordneter/
referent/demo, serverseitig erzwungen; Sessions serverseitig (nur SHA-256-Hash
des Tokens gespeichert), HttpOnly/SameSite/Secure-Cookies; Rate-Limit auf
Login (10/15 Min pro IP, in-memory); Admin-Endpunkte rollengeprüft; CSRF-Schutz
auf schreibenden Routen. — **Lücken (ehrlich):** kein 2FA, Passwort-Policy nur
Länge ≥ 8, Rate-Limit nicht instanzübergreifend, geteilter Legacy-Pilotcode
noch als Modus vorhanden (Rotation = Freigabepunkt F1).

**Mandantentrennung:** App-seitige Guards auf allen Nutzerpfaden (assertTenant,
seit Audit-Sprint 6 auch auf den letzten vier Blob-Lesern, adversarial
getestet). RLS-Policies liegen in der DB, sind aber INERT (service_role) —
DB-seitige Trennung ist ein offener Architektur-Freigabepunkt
(docs/mandantentrennung-architektur.md). **Für TOMs ehrlich ausweisen:
„Trennung app-seitig; DB-seitige Durchsetzung in Umsetzung".**

**Übertragung/Verschlüsselung:** TLS überall (Crawler validiert Zertifikate);
HSTS, CSP, X-Frame-Options DENY; Secrets nur in Vercel-Env, nie im Repo
(Secret-Scan über Historie durchgeführt; einziger Fund — Pilot-Code — entfernt,
Rotation offen).

**Datenminimierung:** V3 speichert keine Artikel-Volltexte (summary ≤ 240
Zeichen), Kostenlog ohne Prompt-/Antwortinhalte, Fehlertexte werden zentral
redigiert (Failing-row-Muster). — **Lücke:** V2-Blob-Pfad speichert RSS-
`content` ungekürzt (Anwaltsfrage F3).

**Verfügbarkeit/Wiederherstellbarkeit:** CI-Gate + 84 Offline-Suiten + Browser-
Smoke; täglicher Health-Report (WhatsApp) + GitHub-Watchdog; Vercel Instant
Rollback; Backup-Skript + Restore-Runbook (docs/betrieb/backup-restore-runbook.md).
— **Lücke:** automatische Backups/PITR erst nach Freigabepunkt F7; Alarmkette
einkanalig.

**Protokollierung:** Audit-Log für Logins (mit IP), Admin-Aktionen und — seit
Sprint 4 — Datenexport/-löschung. Runtime-Fehler zentral (Vercel) einsehbar.

## Teil B — Löschkonzept (ENTWURF)

| Datenkategorie | Speicherort | Löschweg | Frist (VORSCHLAG — DSB festlegen) |
|---|---|---|---|
| Mandatsprofil + alle Nutzer-Artefakte (Briefings, Decisions, Büro-Texte, Notizen, Embeddings) | Blob + 17 V3-Tabellen | `/api/privacy/delete` (seit Sprint 4 vollständig, mit Audit-Eintrag; Teilfehler werden gemeldet) | bei Vertragsende: Export anbieten, dann Löschung binnen 30 Tagen |
| Konto, Sessions, Zuweisungen, Tagesinputs | Auth-Store | in `/api/privacy/delete` enthalten (Sprint 4) | wie oben |
| KI-Nutzungslog des Mandats | Blob-Ring + llm_usage | in `/api/privacy/delete` enthalten | wie oben; ggf. anonymisierte Kostensummen für Abrechnung behalten (DSB-Frage) |
| Audit-Ereignisse des Nutzers | Auth-Store | in `/api/privacy/delete` enthalten | DSB-Frage: Sicherheitslogs ggf. gesetzlich länger? |
| Push-Subscriptions | Blob | löschbar (bestehende Funktion) | sofort bei Abmeldung |
| Global geteilte Daten (raw_documents 5k+, knowledge_objects) | V3 | KEIN Personenbezug zum Kunden; enthalten öffentliche Politik-Daten | TTL-Vorschlag: raw_documents 24 Monate (technisch noch nicht umgesetzt — Roadmap E) |
| Backups (`backups/`, lokal) | Betreiber-Gerät | manuell | Vorschlag: 3 Monatsstände, rollierend |
| Vercel-Logs | Vercel | Plan-abhängige Retention | dokumentieren |

Offen (technisch): Soft-Delete-Fenster (geloescht_at existiert, wird nicht
genutzt); TTL-Job für raw_documents.

## Teil C — Verzeichnis von Verarbeitungstätigkeiten (Art. 30) — GERÜST

1. **Verantwortlicher:** Lüey Nohut, Eresburgstr. 42, 12103 Berlin (lt. Impressum) — Rechtsform/DSB-Pflicht klären.
2. **VT1 Politisches Lagebild & Briefing:** Zweck: Informations-/Entscheidungsvorbereitung für Mandatsträger. Betroffene: Kunde (Mandatsträger), öffentlich handelnde Politiker (Erwähnungen). Kategorien: Mandatsprofil (Art. 9!), öffentliche politische Inhalte. Rechtsgrundlage: **VOM ANWALT ZU BESTIMMEN** (Vertrag + Art. 9 Abs. 2 — Kandidaten: lit. e „offenkundig öffentlich gemacht" für Amtsdaten? ausdrückliche Einwilligung für Profildaten?). Empfänger: Dienstleister (siehe AVV-Liste). Löschung: Teil B. TOMs: Teil A.
3. **VT2 Konto-/Zugangsverwaltung:** Bestandsdaten, Login-IPs, Sessions. Grundlage: Vertrag/berechtigtes Interesse (Sicherheit).
4. **VT3 KI-Textentwürfe (Büro):** Profilauszug + Vorgang an Azure OpenAI; Kennzeichnung im UI (seit Sprint 1). Grundlage + AI-Act-Einordnung: Anwalt.
5. **VT4 Betriebsüberwachung:** Health-Report, Fehlerlogs, Kostenlog (ohne Inhalte).
6. **DSFA:** Laut eigener Checkliste „sehr wahrscheinlich Pflicht" (politische Profilbildung + Monitoring) — **vom DSB durchzuführen; Scope: VT1–VT3 inkl. global geteilter KI-Analyse.**
