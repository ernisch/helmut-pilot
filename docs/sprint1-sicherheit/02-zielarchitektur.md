# Sprint 1 — Zielarchitektur der Mandantentrennung

**Stand:** 2026-07-16. Baut auf der bewerteten Optionsanalyse
`docs/mandantentrennung-architektur.md` (A/B/C/D) auf und legt für **diesen Sprint**
die kleinste belastbare Lösung fest, die zum bestehenden Helmut-Code passt.

## Gewählte Architektur (Sprint 1): App-Guard-Härtung + Defense-in-Depth-Vorbereitung

**Entscheidung:** Wir bleiben bei **Option A** (app-seitige Trennung über
`service_role` + verpflichtendes Tenant-Scoping), **härten sie lückenlos** und
**bereiten die zweite Verteidigungslinie (RLS/Grants) reversibel vor**, ohne sie
scharf zu schalten. Konkret:

1. **App-Schicht ist die durchsetzende Linie.** Jeder mandantenbezogene Read/Write
   läuft über `assertTenant`/`assertTenantRows` + expliziten `user_id=eq.<tenant>`-
   Filter. In diesem Sprint wurden die **letzten latenten Leser** (7 Blob-Leser) und
   der **Schreib-Guard** (Cross-Tenant-Batch + expectedTenant) nachgezogen.
2. **RLS bleibt als Backstop bestehen, aber NICHT als alleinige Linie.** Die 23
   Policies sind angewandt (verifiziert) und schützen gegen direkten anon/authenticated-
   PostgREST-Zugriff — sie sind gegen den App-Pfad **inert** (service_role bypasst).
   **Wir aktivieren RLS NICHT „scharf"**, weil die App-Pfade dafür nicht kompatibel
   sind (kein akzeptiertes JWT mehr mintbar, siehe unten).
3. **Systemprozesse (Cron/Understanding/Backfill) nutzen service_role bewusst** und
   validieren ihren Mandantenbezug ausdrücklich dort, wo sie mandantenbezogen sind
   (per-Profil-Scoping in matching/decisions) bzw. sind bewusst mandantenlos
   (Understanding, Korpus).
4. **Globale Quelldaten bleiben global** (knowledge_objects/raw_documents/…): eine
   `shared_read`-Policy, kein `user_id`. Nutzerbezogene Ableitungen (Decisions,
   Matching, Briefings, Profile, Büro-Outputs) sind pro Mandant getrennt.
5. **Atomarer Kostendeckel je Mandant** ergänzt den globalen Notfalldeckel (Scope
   `tenant:<id>`), fail-closed bei uneindeutigem Mandanten.

### Die 8 geforderten Eigenschaften — wie erfüllt

| Anforderung | Umsetzung (Beleg) |
|---|---|
| 1. Nutzer sieht nur eigenes Mandat | `assertTenant` + `user_id=eq.` auf allen Lesepfaden (17 gehärtet, davon 7 neu) |
| 2. Jeder Schreibvorgang eindeutig zugeordnet | `assertTenantRows` (Präsenz + Cross-Tenant-Batch + expectedTenant) |
| 3. Fehlender Filter ⇏ Datenleck | fehlender Kontext = harter `TenantContextError` (kein stiller Main-Fallback) |
| 4. service_role nur für echte Systemprozesse | `supabaseRequest` service_role; Tenant-Pfade validieren vorher app-seitig |
| 5. Systemprozesse validieren Mandantenbezug | per-Profil-Scoping (matching/decisions); Understanding bewusst global |
| 6. Globale Quelldaten bleiben global | `shared_read`-Policy, kein `user_id`; Korpus mandantenlos |
| 7. Entscheidungen/Matchings/Briefings/Profile/Büro getrennt | eigene `user_id`-Zeilen + `main-p-<id>`-Blob je Mandant |
| 8. Der Pilotmandant bleibt funktionsfähig | alle Änderungen Default AUS / additiv; volle Offline-Suite grün inkl. der Pilot-Pfade |

## Warum diese Architektur sicherer ist

- **Reduziert die Angriffsfläche des einzig wirksamen Mechanismus** (App-Guard) auf
  **null bekannte Lücken**: die inkonsistenten latenten Leser und der schwache
  Schreib-Guard waren die letzten Stellen, an denen ein Programmierfehler zum
  Cross-Tenant-Leak hätte führen können. Sie sind geschlossen und **negativ getestet**.
- **Defense-in-Depth ist vorbereitet, nicht überstürzt**: RLS scharf zu schalten,
  bevor die App ein akzeptiertes JWT minten kann, würde Production brechen (PGRST301)
  — genau das ist am 2026-07-13 passiert und wurde zurückgebaut. Wir wiederholen den
  Fehler nicht.
- **Kostendeckel je Mandant** verhindert, dass ein Mandant (oder ein über alle Mandate
  loopender Job) das Budget monopolisiert — atomar, race-sicher, fail-closed.

## Verworfene Alternativen (Kurzbegründung)

- **B — Echtes Supabase-Auth (GoTrue) + RLS scharf:** das Zielbild für zahlende
  Kunden, aber ein großer Umbau (Login/Session/Token-Refresh). **Zu groß für Sprint 1**
  und freigabepflichtig (Auth-/RLS-Änderung in Production). → späterer Meilenstein.
- **C — Eigenbau-RLS-Kontext (set_config/GUC) ohne GoTrue:** Eigenbau-Sicherheits-
  mechanik mit fummeliger PostgREST-Transaktionssemantik — genau die Fehlerklasse, die
  RLS verhindern soll. Nur mit externem Review. **Verworfen** (unnötige Komplexität).
- **D — Ein Supabase-Projekt pro Mandant:** stärkste Isolation, aber Betriebsaufwand ×N
  und Bruch mit dem geteilten Wissenskorpus-Modell. **Verworfen** als Default (nur
  anlassbezogen für Großkunden).
- **RLS jetzt scharf schalten (Selbst-Signier-JWT):** technisch **tot** seit der
  Supabase-Umstellung auf asymmetrische Signing-Keys (PGRST301). **Nicht möglich.**

## Warum RLS NICHT jetzt aktiviert wird (ausdrücklich)

`tenantJwtModeEnabled()` ist hart `false`. Die App kann kein von PostgREST
akzeptiertes Token mehr selbst signieren (privater Schlüssel liegt bei Supabase).
Würde man die Policies über die `authenticated`-Rolle erzwingen, ohne dass die App
gültige JWTs liefert, bekäme **jeder** Request PGRST301 → Totalausfall. Deshalb:
**RLS bleibt als Backstop bestehen, App nutzt weiter service_role, echte DB-seitige
Durchsetzung ist ein eigener, freigabepflichtiger Schritt (Option B).**
