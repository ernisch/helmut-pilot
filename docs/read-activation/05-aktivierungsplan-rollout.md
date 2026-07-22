# Aufgabe 5 — Aktivierungsplan (mehrstufiger Rollout)

**Modus:** reiner Plan. Jede Phase hat **Eintrittskriterien**, **Abbruchkriterien**,
**Rollback** und **Messgrößen**. Der Übergang von Phase N nach N+1 ist ein **eigener
Freigabepunkt** (Gründer/Betreiber).

> **Steuer-Flag (Konzept, noch nicht existent):** `HELMUT_READER_MODE` mit den Werten
> `off` (Legacy) · `shadow` (Phase 1/2) · `dark` (Phase 3/4) · `on` (Phase 5). Default
> `off`. Ergänzt die vorhandenen `HELMUT_V3_*`-Flags. Analog zu den Cutover-Flags in
> `docs/cutover-strategy.md` (`HELMUT_V3_READ_THROUGH`, `HELMUT_V3_CANARY_PERCENT`).

---

## Phasenüberblick

```
Phase 0  vollständig inert          (Ist-Zustand — heute)
   ↓
Phase 1  Shadow Read                 (Reader liest parallel, Ergebnis verworfen)
   ↓
Phase 2  interner Vergleich          (Reader- vs. Legacy-Ergebnis automatisiert diffen)
   ↓
Phase 3  Pilotmandant                (Reader bedient EINEN Mandanten live)
   ↓
Phase 4  mehrere Mandanten           (schrittweise Ausweitung)
   ↓
Phase 5  vollständige Aktivierung    (Reader = Default, Legacy nur noch Fallback)
```

---

## Phase 0 — Vollständig inert (Ist-Zustand)

Kein Reader, kein GoTrue-Token, RLS inert, Legacy-Read (service_role) bedient alles.

| | |
|---|---|
| **Eintritt** | — (Sprint-Ergebnis: dieses Dossier existiert, Bestand unverändert). |
| **Abbruch** | — |
| **Rollback** | — (dies **ist** der Rückfallzustand aller späteren Phasen). |
| **Messgrößen** | Baseline erfassen: `/api/release/public` (Briefing/Radar-Zahlen des Pilotmandanten), `/api/app/start`-Latenz p50/p95, Vercel-Runtime-Fehlerrate, Supabase-Read-Latenz. Diese Baseline ist der Vergleichsanker aller Folgephasen. |

---

## Phase 1 — Shadow Read

Der Reader-Pfad (`tenantReadRequest` + GoTrue-Token + `helmut_reader`) wird gebaut und
**parallel** zum Legacy-Read aufgerufen. Sein Ergebnis wird **verworfen** — der Nutzer sieht
weiter ausschließlich den Legacy-Read. Ziel: den neuen Pfad unter echter Last **beobachten**,
ohne Nutzerwirkung.

| | |
|---|---|
| **Eintritt** | (1) GoTrue-Nutzer + Custom-`user_id`-Claim-Hook auf **Preview** verifiziert; (2) `helmut_reader`-Rolle + Grants auf Preview angelegt und per Isolationsprobe (§`03`) bestätigt; (3) `tenantReadRequest`-Zweig implementiert, hinter `HELMUT_READER_MODE=shadow`, Default `off`; (4) Offline-Suite grün inkl. `test:tenant`, `test:tenant-jwt`, `test:rls-policy-sim`, `test:cross-tenant-security`. |
| **Abbruch** | Reader-Pfad wirft unerwartet im Legacy-Request-Kontext (darf nie den Legacy-Read beeinflussen); Fehlerrate des Shadow-Aufrufs verfälscht Latenz > +20 %; PGRST301/Auth-Fehler > 1 % der Shadow-Reads. |
| **Rollback** | `HELMUT_READER_MODE=off` + Redeploy → Shadow-Aufruf entfällt sofort. Kein DB-Rollback nötig. |
| **Messgrößen** | Shadow-Read-Erfolgsrate (Ziel > 99 %), Shadow-Latenz p50/p95, Rate `reader_claim_missing`/`reader_claim_mismatch`, **0** Beeinflussung der Legacy-Antwort (byte-gleich zu Phase 0). |

---

## Phase 2 — Interner Vergleich

Der Shadow-Read wird gegen den Legacy-Read **automatisiert diffed** (Zeilenmenge, IDs,
Zählwerte). Nutzer sieht weiter Legacy. Ziel: **beweisen**, dass Reader byte-/mengengleiche
Daten liefert — und dass RLS keinen legitimen Datensatz verschluckt.

| | |
|---|---|
| **Eintritt** | Phase 1 ≥ 7 Tage stabil; Shadow-Erfolgsrate > 99 %; ein Vergleichsharnisch (analog `npm run sprint6:dryrun`) existiert und läuft read-only. |
| **Abbruch** | Diff zeigt **fehlende** Zeilen im Reader-Ergebnis (RLS zu streng / Claim-Mapping falsch) **oder** zusätzliche/fremde Zeilen (RLS zu lasch — **kritisch**, sofort Stop); Divergenzrate > 0 nach Erklärung bekannter Fälle. |
| **Rollback** | `HELMUT_READER_MODE=off`. Diff-Harnisch ist read-only, kein Rollback nötig. |
| **Messgrößen** | **Divergenz = 0** (Pilot: gleiche Entscheidungen/Belege/Radar-Zahlen wie Legacy); Anteil erklärter vs. unerklärter Abweichungen; keine Cross-Tenant-Leckage in Stichproben (Mandant-A-Token sieht nie B-Zeilen). |

---

## Phase 3 — Pilotmandant (erster Dark Launch)

Der Reader-Pfad bedient **einen** Mandanten (den Pilotmandanten) **live** — er sieht ab jetzt
seine Daten über RLS. Alle anderen (falls vorhanden) bleiben auf Legacy. **Voraussetzung:
bestandenes Security-Gate** ([`07-…`](07-security-gate.md)).

| | |
|---|---|
| **Eintritt** | **Security-Gate vollständig grün** (RLS geprüft, Rolle geprüft, Pen-Test bestanden, DSGVO-Review bestanden, Code-Review bestanden, Rollback getestet, Shadow erfolgreich, Coverage ≥ vorher); Phase 2 Divergenz = 0 über ≥ 7 Tage; Backup/PITR aktiv (FA-7). |
| **Abbruch** | Pilot sieht **weniger/leerere** Vorgänge als unter Legacy; eine einzige Fremddaten-Sichtung; PGRST301-Anstieg; `/api/release/public`-Zahlen fallen; neue Vercel-Runtime-Fehler. |
| **Rollback** | `HELMUT_READER_MODE=dark→off` (bzw. Pilot aus der Reader-Allowlist nehmen) + Redeploy → **sofortiger** Rückfall auf Legacy für den Piloten. Minuten (siehe [`06-…`](06-rollback.md)). |
| **Messgrößen** | Pilot-Antwort byte-/zahlengleich zur Legacy-Baseline; p95-Latenz ≤ Baseline +15 %; Fehlerrate ≤ Baseline; 0 `reader_claim_mismatch` mit Dateneffekt; Nutzer-Feedback „unverändert". |

---

## Phase 4 — Mehrere Mandanten

Ausweitung auf weitere Mandanten in kleinen Chargen (z. B. Canary-Prozentsatz analog
`HELMUT_V3_CANARY_PERCENT`, oder explizite Allowlist). Jede Charge = Beobachtungsfenster.

| | |
|---|---|
| **Eintritt** | Phase 3 ≥ 14 Tage stabil, alle Messgrößen grün; **je neuem Mandant** ein GoTrue-Nutzer + Isolationsprobe (Mandant sieht nur eigene Zeilen); Kapazitäts-/Kostenprüfung (mehr `authenticated`-Reads statt einem service_role-Pool). |
| **Abbruch** | Cross-Tenant-Sichtung (**kritisch**); Latenz-/Fehler-Regression bei Ausweitung; Connection-/Rate-Limits von PostgREST erreicht. |
| **Rollback** | Charge aus der Reader-Allowlist nehmen bzw. Canary-Prozent senken; im Extremfall `HELMUT_READER_MODE=off` (alle zurück auf Legacy). |
| **Messgrößen** | pro Mandant: Divergenz = 0, Latenz/Fehler im Rahmen; global: Reader-Anteil am Traffic, Fehlerbudget-Verbrauch, DB-Last. |

---

## Phase 5 — Vollständige Aktivierung

Reader ist **Default** für alle Mandanten; Legacy-Read bleibt als **Notfall-Fallback**
codiert (nicht entfernt). Erst hier ist die DB-seitige Mandantentrennung durchgängig scharf.

| | |
|---|---|
| **Eintritt** | Phase 4 alle Chargen ≥ 14 Tage stabil; Security-Gate erneut bestätigt; Rollback-Übung frisch durchgeführt (≤ 30 Tage); Betreiber-Freigabe „vollständige Aktivierung". |
| **Abbruch** | jede der Phase-3/4-Abbruchbedingungen auf Gesamtpopulation. |
| **Rollback** | `HELMUT_READER_MODE=off` global → alle Mandanten sofort auf Legacy. Legacy-Pfad bleibt dauerhaft erhalten (kein Code-Abbau in diesem Rollout). |
| **Messgrößen** | 100 % Reader-Anteil ohne Regression; Divergenz-Harnisch weiterhin grün (als Dauer-Kontrolle); DSGVO-TOM aktualisiert („Trennung DB-seitig erzwungen"). |

---

## Übergreifende Prinzipien

1. **Nie zwei Achsen gleichzeitig ändern.** RLS-Policies existieren bereits; in diesem
   Rollout ändern wir nur **Rolle + Token-Ausstellung + App-Zweig** — die DB-Policies
   bleiben stabil. (Falls ein Policy-Feinschliff nötig wird: eigener Schritt, eigene
   Freigabe, zuerst Preview.)
2. **Jede Phase ist einzeln zurückrollbar** über ein Flag, ohne die anderen zu berühren.
3. **Legacy-Read wird nie entfernt**, nur zurückgestuft — der Rückweg bleibt in jeder Phase
   ein Flag-Flip (Minuten).
4. **Der Frontend-Vertrag ist heilig** (`docs/cutover-strategy.md`): Nutzer dürfen in keiner
   Phase eine Veränderung sehen außer identischer Daten.
5. **Kein Schritt ohne grünes Security-Gate ab Phase 3.**
