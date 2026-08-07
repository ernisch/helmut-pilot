# Mandantentrennung — Ist-Stand und bewertete Architekturwege (2026-07-15)

**Zweck:** Vor Mandant 2 muss der Gründer EINEN Weg freigeben. Dieses Dokument
ersetzt die überholte Erwartung „HELMUT_TENANT_JWT_MODE=1 schaltet RLS scharf"
(siehe Banner in docs/jwt-aktivierung-runbook.md) und bewertet die realen
Optionen ehrlich — keine davon ist „automatisch richtig".

## Ist-Stand (im Code verifiziert)

- Jeder DB-Zugriff läuft über **service_role** (BYPASSRLS): `tenantRequest`
  fällt immer auf `supabaseRequest` zurück, weil `tenantJwtModeEnabled()` hart
  `false` ist (storage.js; Grund: Supabase-Umstellung auf asymmetrische
  JWT-Signing-Keys, Selbstsignatur-Pfad tot, PGRST301-Logs 12./13.07.).
- Die **23 RLS-Policies** (Migration 20260712) liegen in der DB, sind aber
  **funktional inert**.
- Schutz heute: **App-seitige Tenant-Guards** — `assertTenant`/`assertTenantRows`
  auf allen 8 V3-Nutzerpfaden; seit Audit-Sprint 6 auch harte Guards auf den
  vier früher weichen Blob-Lesern (getTasks/getUserNotes/getInteractions/
  getLageChecks). Adversarial getestet (tenant-guard/tenant-jwt/cache-isolation).
- Cache-/Blob-Layout: pro Mandant eigene `main-p-<id>`-Zeile, aber alle Profile
  in EINER `main`-Zeile und alle Konten/Sessions in EINER `main-auth`-Zeile.

## Optionen (Bewertung)

### A. App-Guard-only — dokumentiert akzeptieren
Kontrollierter Wenig-Mandanten-Betrieb NUR mit App-Schicht-Trennung
(so bewertet auch docs/quellenarchitektur/05-sicherheitsmodell-rls.md:
„vertretbar, wenn Guards lückenlos").
- **Pro:** 0 Umbau; Guards existieren und sind getestet; CI-Gate sichert Regressionen.
- **Contra:** Ein einziger vergessener Guard ist ein IDOR zwischen echten Kunden;
  kein Defense-in-Depth; gegenüber Kunden (TOMs!) schwächer argumentierbar.
- **Aufwand:** 0 (nur Entscheidung + TOM-Dokumentation).
- **Tauglich für:** Mandant 2 als KONTROLLIERTER Pilot (kein offener Verkauf).

### B. Supabase Auth (GoTrue) pro Mandant + RLS scharf
Echte Supabase-Nutzer je Mandant; die App reicht deren Access-Tokens an
PostgREST durch; die vorhandenen Policies greifen (auth.jwt()->>user_id —
Claim-Mapping prüfen/anpassen).
- **Pro:** Echte DB-erzwungene Trennung; nutzt vorhandene Policies; sauber
  auditierbar; Standardweg des Anbieters.
- **Contra:** Größter Umbau: Provisionierung, Token-Refresh, Session-Kopplung
  an bestehendes Konten-System (scrypt-Login bleibt? Doppelte Identität?);
  Cron-/System-Jobs brauchen weiter service_role (sauber abgrenzen).
- **Aufwand:** ~1–2 Wochen Bau + Testlauf.
- **Tauglich für:** zahlende Kunden / Skalierung.

### C. RLS mit per-Request-Kontext ohne GoTrue (SET-Konfig / PostgREST-Preflight)
Statt Nutzer-JWTs: pro Request eine kurzlebige Postgres-Einstellung
(`request.jwt.claims`-Ersatz, z. B. eigene GUC via RPC `set_config` +
`current_setting()` in den Policies), weiterhin über EINE technische Rolle
(nicht service_role, sondern eine neue Rolle OHNE BYPASSRLS).
- **Pro:** Kein GoTrue-Umbau; Policies bleiben; ein Rollenwechsel + RPC-Wrapper.
- **Contra:** Eigenbau-Sicherheitsmechanik (Reviewpflicht!); PostgREST-Semantik
  von set_config über REST ist fummelig (Transaktionsgrenzen); leicht falsch zu
  benutzen — genau die Fehlerklasse, die RLS verhindern soll.
- **Aufwand:** ~3–5 Tage + externes Sicherheitsreview.
- **Tauglich für:** Zwischenschritt, wenn B zu groß erscheint — nur mit Review.

### D. Ein Supabase-Projekt PRO Mandant (physische Trennung)
- **Pro:** Stärkste Isolation (auch Backups/Restore je Kunde); einfachstes
  Sicherheitsargument gegenüber Behördenkunden; kein RLS nötig.
- **Contra:** Betriebsaufwand xN (Migrationen, Monitoring, Kosten ~25 $/Kunde/
  Monat für Pro); geteilter Wissenskorpus (raw_documents/knowledge_objects)
  müsste dupliziert oder in ein separates, gemeinsames Projekt gezogen werden —
  Architekturbruch mit dem „einmal verstehen, mehrfach bewerten"-Kostenmodell.
- **Aufwand:** ~1 Woche Automatisierung + laufender Mehraufwand.
- **Tauglich für:** Einzelne Großkunden (Fraktion/Ministerium) mit
  Isolationsanforderung; nicht als Default.

## Empfehlung (Entscheidungsvorlage, kein Beschluss)

1. **Für Mandant 2 (kontrollierter Pilot):** Option A bewusst und schriftlich
   akzeptieren (TOM-Eintrag: „Trennung app-seitig, DB-seitige Trennung in
   Umsetzung"), PLUS die in Sprint 6 gehärteten Guards + CI als Nachweis.
2. **Vor zahlendem Mandant 3+ / Verkauf:** Option B umsetzen (GoTrue),
   Zielbild bleibt Defense-in-Depth mit den vorhandenen Policies.
3. Option C nur, falls B am Aufwand scheitert — dann mit externem Review.
4. Option D anlassbezogen für Großkunden anbieten (Preisaufschlag).

**Freigabepunkt:** Entscheidung A/B/C/D durch den Gründer; bis dahin darf kein
zweiter echter Mandant freigeschaltet werden (Auftragskontext Nr. 7).

## Nachtrag OP-03-Sprint (2026-08-06) — unabhängig von A/B/C/D verbindlich

Egal welche Option gewählt wird: **Konten-Modus (`HELMUT_AUTH_MODE=accounts`) ist
harte Vorbedingung für den Zweitmandanten.** Im Legacy-Pilotgate (geteiltes
`PILOT_SECRET`) ist jedes aktive Mandat für jeden Code-Inhaber wählbar
(`tenant-context.resolveActiveTenant`) — mit zwei echten Mandanten wäre das ein
Fremdzugriff per Design. Technisch durchgesetzt seit dem OP-03-Sprint:
`provisioning.provisionTenant` lehnt gegen eine Supabase-gebundene Ablage
fail-closed ab, wenn der Konten-Modus nicht bestätigt ist oder kein Admin-Konto
existiert (`pruefeKontenVorbedingung`; Beweis:
`scripts/op03-mehrmandanten-test.js` §9). Zusätzlich gilt seitdem: genau **ein**
Abgeordneten-Konto je Mandat (`accounts.updateUser`, 409 bei Dublette). Der
aktuelle Production-Wert von `HELMUT_AUTH_MODE` ist aus Claude-Sitzungen nicht
lesbar — die Verifikation ist ein Betreiberschritt vor der Freigabe.

### Grenzen dieser Härtung (unabhängiges Review 2026-08-07, PR #231)

Damit kein falsches Grün entsteht, ausdrücklich:

- **Die Konten-Vorbedingung schützt nur den Provisionierungsweg**
  (`provisionTenant`, aufgerufen ausschließlich vom CLI `scripts/provision-tenant.js`;
  kein HTTP-Weg). Sie schließt **nicht** die laufende Legacy-Cross-Tenant-Lücke:
  `tenant-context.resolveActiveTenant` akzeptiert weiterhin jede vom Client
  benannte **aktive** Mandats-ID — diese Datei ist von PR #231 unberührt. Erst der
  Betreiberschritt „`HELMUT_AUTH_MODE=accounts` in Production" macht den Laufzeitpfad
  mandantensicher; der PR bereitet das vor, erzwingt es aber nicht.
- **Die 409-Eindeutigkeit ist ein App-Guard, nicht race-sicher.** Sie ist ein
  nicht-atomares Read-Modify-Write auf dem Last-Write-Wins-Auth-Store (kein
  Compare-and-Set, `storage.writeAuthStore`). Zwei gleichzeitige Admin-`PATCH`
  auf getrennten Serverless-Instanzen können beide gegen denselben Altstand prüfen
  und beide schreiben → zwei Abgeordneten-Konten auf **demselben** Mandat (rein
  intra-mandantlich: `politicianId` **ist** die Mandats-ID; die Cross-Tenant-Guards
  bleiben unberührt). Eine race-sichere Garantie „genau ein Konto je Mandat" braucht
  eine **DB-`UNIQUE`-Bedingung auf `politicianId`** (Migration) — das ist Teil der
  offenen Grundsatzentscheidung OP-03(c), nicht dieses PRs. Der App-Guard bleibt
  trotzdem eine echte Verbesserung gegenüber `main` (dort gab es gar keine Prüfung).
