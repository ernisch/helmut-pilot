# Aufgabe 8 — Operations-Runbook (Secure Read Path)

**Modus:** Betriebsanleitung für den **späteren** Aktivierungsschritt. Nichts hier wird in
diesem Sprint ausgeführt. Reihenfolge: Aktivierung → Monitoring → Fehlerfall → Rollback →
Incident → Kommunikation → Recovery.

> **Rollenverteilung.** „Betreiber/Gründer" = Mensch mit Vercel-/Supabase-Dashboard-Zugriff
> (setzt Env, triggert Redeploy, spielt Migrationen ein). „Agent" = automatisierbare,
> read-only Verifikation. Der Agent kann **keine** Vercel-Env setzen (Integration read-only,
> vgl. `docs/jwt-aktivierung-runbook.md` §1).

---

## 1. Aktivierung

**Voraussetzung:** Security-Gate ([`07-…`](07-security-gate.md)) vollständig grün +
schriftliche Freigabe für die konkrete Phase.

**Schritte je Phasenübergang (Beispiel Phase 3, Dark Launch Pilotmandant):**

1. **V0 Ist-Verifikation (Agent, read-only):** `/api/release/public` grün (Baseline-Zahlen);
   keine Vercel-Runtime-Fehler letzte 2 h; Supabase gesund; RLS-Policies unverändert
   (23); `helmut_reader`-Rolle + Grants wie in G2 erwartet.
2. **M0 Sicherung (Betreiber):** PITR-Zeitpunkt notieren; Baseline-Snapshot der Messgrößen.
3. **Aktivierung (Betreiber, 2 Klicks):** Vercel → Env → `HELMUT_READER_MODE` von `shadow`
   auf `dark` (+ Pilot in Reader-Allowlist) → **Redeploy**.
4. **Sofort-Verifikation (< 5 Min nach Redeploy):** siehe §2 „nach Aktivierung".
5. **Beobachtungsfenster** gemäß Phasenkriterien (Phase 3: ≥ 14 Tage vor Ausweitung).

**Diagnose-Endpoint (Konzept):** `GET /api/admin/reader-mode` (analog zum bestehenden
`/api/admin/tenant-mode`) meldet `readerMode`, `readerRoleActive`, `goTrueTokenWorks`,
`readerReadProbe` (mandantenneutral, probiert vorhandene Mandate durch — keine hartkodierte
ID) — ohne Secret-Werte auszugeben.

---

## 2. Monitoring

**Was dauerhaft überwacht wird (mit Schwelle → Aktion):**

| Signal | Quelle | Grün | Alarm → Aktion |
|--------|--------|------|----------------|
| Reader-Read-Erfolgsrate | App-Telemetrie | > 99 % | < 99 % → Fehlerfall §3 |
| PGRST301 / Auth-Fehlerrate | Supabase `get_logs`, Vercel | ~0 | Anstieg → Fehlerfall §3 (Token/Key-Problem) |
| `reader_claim_missing` | App-Log | selten (Legacy-Fallback greift) | Anstieg → Session-/Token-Beschaffung prüfen |
| `reader_claim_mismatch` **mit Dateneffekt** | App-Log | **0** | **> 0 → Incident §5** (mögliche Trennungsverletzung) |
| Divergenz Reader vs. Legacy | Diff-Harnisch | **0** | > 0 → Abbruch der Phase, Rollback §4 |
| p95-Latenz `/api/app/start` | Vercel | ≤ Baseline +15 % | Überschreitung → Fehlerfall §3 |
| `/api/release/public`-Zahlen (Pilot) | Agent-Smoke | = Baseline | Abfall → Rollback §4 |
| Vercel-Runtime-Fehler | Vercel | leer | neu → untersuchen |

**Nach Aktivierung (Sofort-Checks):** Pilot eingeloggt → Lage/Radar/Helmut/Büro/Admin laden
wie zuvor, Briefing nicht leer; `/api/release/public` byte-/zahlengleich; `reader-mode`-
Endpoint zeigt `goTrueTokenWorks: true`; keine PGRST301.

---

## 3. Fehlerfall (Reader liefert schlecht, aber kein Trennungsbruch)

Symptome: erhöhte PGRST301, leere/verkürzte Antworten, Latenz-Regression, `reader_claim_missing`↑.

1. **Sichern (60 s):** Vercel-Logs + Supabase `get_logs` des Fensters exportieren
   ([`06-…`](06-rollback.md) §5).
2. **Klassifizieren:** Token-Problem (PGRST301/Key) · Claim-Problem (`user_id` fehlt/mappt
   falsch) · Latenz/Last · Policy zu streng (fehlende legitime Zeilen).
3. **Entscheiden:**
   - Nutzer sieht **weniger** Daten oder Latenz stört → **Rollback §4** (S1/S2), dann
     Ursache offline beheben.
   - Nur Rausch-Fehler ohne Nutzereffekt (Legacy-Fallback greift sauber) → beobachten,
     Ursache im nächsten Fenster beheben, **nicht** überstürzt zurückrollen.
4. **Nie** den Reader „durch mehr service_role" reparieren — das würde die Trennung
   aushöhlen. Reparatur erfolgt am Token/Claim/Policy, nicht durch BYPASSRLS.

---

## 4. Rollback

Ausführung exakt nach [`06-rollback.md`](06-rollback.md):

1. Logs sichern (falls in §3 noch nicht geschehen).
2. **S1:** `HELMUT_READER_MODE=off` + Redeploy (bzw. **S0** Vercel Instant Rollback bei
   akuter Not) → Legacy bedient alles, < 5 Min.
3. Verifizieren: `/api/release/public` zurück auf Baseline; keine PGRST301; Pilot lädt normal.
4. S2 (einzelner Mandant) / S3 (Rolle) / S4 (Policies) nur bei DB-seitigem Verdacht — für
   den Betrieb nicht nötig (Legacy = service_role, RLS-unabhängig).

---

## 5. Incident (echter/verdächteter Trennungsbruch — DSGVO-relevant)

Auslöser: `reader_claim_mismatch` mit Dateneffekt, eine gemeldete Fremddaten-Sichtung, oder
ein Diff, der fremde Zeilen im Reader-Ergebnis zeigt.

1. **Sofort:** Rollback §4 (S1) — Reader aus, Legacy übernimmt. Danach ist die Trennung
   wieder auf dem geprüften App-Guard-Stand.
2. **Beweissicherung:** betroffene(r) Mandant(en), Zeitfenster, Request-IDs, Logzeilen
   einfrieren (nicht überschreiben).
3. **Bewertung:** War tatsächlich ein Fremddatensatz **ausgeliefert**? Umfang? Art der Daten?
   (Reader liest nur Mandantendaten — ein Bruch wäre eine Fehlkonfiguration von Rolle/Claim/
   Policy.)
4. **Meldepflicht prüfen (DSB/Anwalt):** Art. 33/34 DSGVO ggf. binnen 72 h — Entscheidung
   liegt bei DSB/Verantwortlichem, nicht beim Betrieb allein (vgl. FA-9).
5. **Root-Cause:** offline reproduzieren (Preview), Rolle/Claim/Policy korrigieren,
   G1–G3 erneut bestehen, bevor der Reader wieder aktiviert wird.
6. **Postmortem:** schriftlich, mit Zeitleiste, Ursache, Gegenmaßnahme, Test-Ergänzung
   (→ G8 Coverage).

---

## 6. Kommunikation

| Ereignis | Adressat | Inhalt | Kanal |
|----------|----------|--------|-------|
| Phasen-Aktivierung geplant | Gründer/Betreiber | Phase, Fenster, Rollback-Bereitschaft, Freigabe eingeholt | intern/schriftlich |
| Aktivierung erfolgt | Gründer | Sofort-Verifikation grün, Beobachtungsfenster läuft | intern |
| Fehlerfall (ohne Nutzereffekt) | Gründer | Symptom, Einordnung, Plan | intern |
| Rollback ausgeführt | Gründer | Auslöser, Zeit, wiederhergestellter Zustand | intern |
| **Incident (Trennungsbruch)** | Gründer **+ DSB/Anwalt** | Fakten, Umfang, Sofortmaßnahme, Meldepflicht-Bewertung | dringend, direkt |
| Nutzer-/Pilotkommunikation | betroffener Mandant | nur bei tatsächlichem Nutzereffekt/Meldepflicht, faktisch, ohne Spekulation | über Gründer/DSB, sicherer Kanal |

**Grundsatz:** Der Pilotmandant wird **nur** informiert, wenn ihn ein realer Effekt betrifft
oder Meldepflicht besteht — keine spekulative Vorab-Beunruhigung, keine internen Details.

---

## 7. Recovery (Wiederanlauf nach Rollback/Incident)

1. **Ursache behoben** und auf Preview durch die relevanten Gate-Kriterien belegt
   (G1–G3/G6 je nach Fehlerklasse).
2. **Zurück in Shadow (Phase 1/2), nicht direkt Dark:** Reader erneut parallel/verglichen
   laufen lassen, bis Divergenz = 0 über das Beobachtungsfenster.
3. **Security-Gate erneut** bestätigen (mind. die betroffenen Punkte).
4. **Erneute Freigabe** einholen (der alte Freigabestempel gilt nicht für den Wiederanlauf
   nach Incident).
5. **Dann** erst wieder Dark Launch (Phase 3) — mit frischer Rollback-Übung (≤ 30 Tage).
6. Datenintegrität prüfen: da der Reader nie schreibt, ist keine Datenreparatur nötig; PITR
   nur relevant, falls im Incident-Fenster ein **service_role-Schreibpfad** unabhängig
   fehlerhaft war (getrennt bewerten).

---

## 8. Schnellreferenz (eine Seite)

- **Aktivieren:** Gate grün → `HELMUT_READER_MODE` hoch (`shadow`→`dark`→`on`) + Redeploy →
  Sofort-Verifikation.
- **Zurück:** `HELMUT_READER_MODE=off` + Redeploy (< 5 Min) oder Vercel Instant Rollback.
- **Alarm `reader_claim_mismatch` > 0:** Incident §5 (Rollback + DSGVO-Bewertung).
- **Alarm PGRST301↑:** Fehlerfall §3 (Token/Key), meist Rollback + Offline-Fix.
- **Nie:** Reader-Fehler mit service_role-Fallback „reparieren".
