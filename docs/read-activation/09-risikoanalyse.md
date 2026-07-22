# Aufgabe 9 — Risikoanalyse

**Bewertungsskala:** Eintritt (niedrig/mittel/hoch) × Schwere (niedrig/mittel/hoch/kritisch).
Jede Zeile nennt eine **Gegenmaßnahme** und einen **Restwert** nach Maßnahme.

> Bezugsrahmen: der **Ziel-Read-Pfad** (GoTrue-Token + `helmut_reader` + RLS). Solange dieser
> nicht aktiviert ist (heute), sind fast alle Risiken **latent/vermeidbar** — sie werden erst
> mit der Aktivierung real. Das ist der Grund für den phasierten Rollout.

---

## 1. Technisch

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| GoTrue-Token wird von PostgREST abgelehnt (Key-/Claim-Fehlkonfig, PGRST301) | mittel | mittel | Shadow-Phase deckt es vor Nutzerwirkung auf; fail-closed → Legacy-Fallback; Diagnose-Endpoint | niedrig |
| Custom-Claim `user_id` fehlt im GoTrue-Token → RLS liefert 0 Zeilen | mittel | mittel | G1/G7 prüfen Claim-Mapping explizit; Shadow-Diff zeigt fehlende Zeilen sofort | niedrig |
| Read-only-Rolle falsch gegrantet (zu breit/zu eng) | niedrig | hoch | G2 Grant-Audit auf Preview; tabellengenaue Grants; Isolationsprobe | niedrig |
| **Versehentlicher `revoke ... from service_role`** beim Grant-Umbau | niedrig | **kritisch** | Grant-Skript nur `from anon`/`from authenticated`; Review (G5); zuerst Preview; PITR (B1) | niedrig |
| Selbstsignatur-Weg irrtümlich reaktiviert (`signTenantJWT`) | niedrig | hoch | `tenant-jwt-test.js` erzwingt `tenantJwtModeEnabled()===false`; Reader nutzt GoTrue, nicht Selbstsignatur | niedrig |
| Halb-migrierter Zustand | sehr niedrig | mittel | Es wird **nichts** migriert — nur Leseidentität gewechselt; Flag-Flip ist atomar | sehr niedrig |

---

## 2. Betrieblich

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Betreiber setzt Env falsch / vergisst Redeploy | mittel | mittel | 2-Klick-Runbook (§8); Diagnose-Endpoint bestätigt Wirksamkeit | niedrig |
| Agent kann Env nicht setzen → Abhängigkeit vom Betreiber | hoch | niedrig | bekannt & dokumentiert; klare Rollenverteilung im Runbook | akzeptiert |
| Rollback nicht geübt → im Ernstfall zu langsam | niedrig | hoch | G6 erzwingt frische Rollback-Übung (≤ 30 Tage) | niedrig |
| Token-Refresh-Loop fällt aus → Reads brechen periodisch | mittel | mittel | Shadow-Beobachtung über ≥ 7 Tage inkl. Ablaufzyklen; Alarm auf PGRST301 | niedrig |
| Kein PITR beim Live-Schritt | niedrig | hoch | B1 (Supabase Pro, FA-7) ist harte Gate-Vorbedingung | niedrig |

---

## 3. DSGVO / Datenschutz

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Fremddaten-Auslieferung an falschen Mandanten | niedrig | **kritisch** | Doppelte Linie (RLS ∩ App-Filter); Dark Launch erst nach Divergenz = 0; Incident-Prozess §5 | niedrig |
| Personenbezogene Daten im JWT-Claim | niedrig | mittel | nur pseudonyme `politicianId`; G4 prüft Minimierung | sehr niedrig |
| TOM/AVV nicht aktualisiert vor Aktivierung | mittel | mittel | G4 + FA-9; DSB/Anwalt-Freigabe Pflicht | niedrig |
| `main-auth` (alle Accounts) über Reader sichtbar | sehr niedrig | **kritisch** | Policy matcht nur `main-p-<tenant>`; **keine** Policy für `main-auth` → struktureller Deny; kein Grant | sehr niedrig |
| Meldepflicht bei Bruch verpasst (Art. 33/34) | niedrig | hoch | Incident-Runbook §5 mit 72-h-Bewertung durch DSB | niedrig |

---

## 4. Mandantentrennung

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Vergessener App-Guard (heutiges Rest-Risiko) | mittel | hoch | Der Reader-Rollout **fügt RLS als zweite Linie hinzu** — genau die Absicherung gegen dieses Risiko; bis dahin: Guard-Helfer + CI | mit RLS: niedrig |
| RLS-Policy zu lasch (fremde Zeilen sichtbar) | niedrig | **kritisch** | Phase-2-Diff fängt zusätzliche Zeilen; Isolationsprobe (G1); adversarialer Pen-Test (G3) | niedrig |
| Claim-Manipulation durch Client | sehr niedrig | hoch | Token serverseitig für die aufgelöste Session beschafft; App-Filter aus Session, nicht aus Claim; PostgREST verifiziert Signatur | sehr niedrig |
| Cache-Leckage zwischen Mandanten | niedrig | hoch | `cache-isolation-test.js` (Bestand) bleibt Pflichttest (G8) | niedrig |
| Neuer Mandant ohne GoTrue-Nutzer → fällt still auf Legacy | mittel | niedrig | Phase-4-Eintritt verlangt je Mandant Nutzer + Isolationsprobe | niedrig |

---

## 5. Performance

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Mehr `authenticated`-Reads statt eines service_role-Pools → mehr Verbindungen/Latenz | mittel | mittel | Latenz-Messgröße p95 ≤ Baseline +15 % als Abbruchkriterium; Canary-Ausweitung (Phase 4) | niedrig |
| RLS-Prädikat-Auswertung kostet DB-Zeit | niedrig | niedrig | `helmut_current_tenant()` ist `stable`; Filter auf indizierten `user_id`-Spalten; Shadow misst Realwert | niedrig |
| Token-Beschaffung fügt Request-Latenz hinzu | mittel | niedrig | serverseitiges Token-Caching pro Session-Fenster; im Shadow gemessen | niedrig |
| GoTrue-Rate-Limits bei vielen Mandanten | niedrig | mittel | Phase-4-Kapazitätsprüfung; Token-Wiederverwendung im Lebensfenster | niedrig |

---

## 6. Monitoring

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Trennungsbruch bleibt unbemerkt | niedrig | **kritisch** | `reader_claim_mismatch`-Alarm (B3); Divergenz-Harnisch als Dauerkontrolle; Stichproben-Isolationsprobe | niedrig |
| Alarme fehlen/stumm beim Live-Schritt | mittel | hoch | B3 ist Gate-Vorbedingung; Sofort-Verifikation nach Aktivierung | niedrig |
| Log-Retention zu kurz für Forensik | mittel | mittel | Pflicht-Sicherung vor Rollback (§06.5); Incident friert Beweise ein | niedrig |
| Fehlsignal „ruhiger Tag" statt Ladefehler | niedrig | mittel | Bestehendes `__storeError`-Sentinel (lage.js) meldet Ladefehler ehrlich | niedrig |

---

## 7. Rollback

| Risiko | Eintritt | Schwere | Gegenmaßnahme | Rest |
|--------|----------|---------|---------------|------|
| Rollback wirkt nicht (Flag greift nicht) | niedrig | hoch | G6-Übung belegt Wirksamkeit; Vercel Instant Rollback als S0-Notausstieg | niedrig |
| Rollback überschreibt Beweise | mittel | mittel | Pflicht-Log-Sicherung **vor** `off` (§06.5) | niedrig |
| Bereits ausgelieferte Fehlantwort nicht rückholbar | niedrig | mittel | Dark Launch erst nach Divergenz = 0 → Fehlantwort-Wahrscheinlichkeit minimiert | niedrig |
| Falsche Annahme „Rollback = alles gut" bei DSGVO-Bruch | niedrig | hoch | Runbook trennt Rollback (Sofortmaßnahme) von Incident (Meldung/Postmortem) | niedrig |

---

## 8. Rest-Risiken (bewusst getragen bis zur Aktivierung)

| Rest-Risiko | Bewertung | Warum getragen |
|-------------|-----------|----------------|
| **Heute nur App-seitige Trennung** (RLS inert) | mittel/hoch, aber **bekannt & getestet** | Guards adversarial getestet; kontrollierter Wenig-Mandanten-Betrieb; genau dieses Dossier bereitet die DB-Linie vor. Vertretbar nur solange **kein** offener Verkauf (vgl. `mandantentrennung-architektur.md` Option A). |
| **GoTrue-Umbau noch nicht gebaut** | hoch (Aufwand), niedrig (Risiko) | Reine Vorbereitung; kein Produktionscode berührt; Bauauftrag späterer Sprint. |
| **Keine Read-only-Rolle in Prod** | latent | wird erst mit Aktivierung real; Entwurf steht (`03-…`). |
| **Byte-genaue Quellen-Verifikation (BE/BB) offen** | niedrig für Read-Pfad | betrifft Quellenreifegrad, nicht die Leseidentität (Sprint-9-Restrisiko, orthogonal). |
| **Zwei Mandanten teilen einen Wissenskorpus** | akzeptiert | `shared_read`-Policy ist bewusst `using (true)`; Korpus ist mandantenlos (Kostenmodell). Kein Trennungsrisiko, da keine personenbezogenen Mandantendaten im Korpus. |

**Gesamteinschätzung:** Nach vollständiger Umsetzung dieses Plans sinkt das dominierende
Rest-Risiko von heute („ein vergessener Guard = IDOR, DB fängt nichts ab") auf „ein Fehler
**und** eine RLS-Lücke gleichzeitig" — eine deutlich unwahrscheinlichere Doppelbedingung.
Bis zur Aktivierung bleibt das App-Guard-Modell die tragende und getestete Linie.
