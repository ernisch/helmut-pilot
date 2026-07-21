# Abschlussbericht — Architektur-Konsolidierung Sprint 1–3

## Antworten (kurz und eindeutig)

1. **Welche Architektur ist jetzt verbindlich?**
   Die konsolidierte **Quellenplattform** `lib/helmut/quellenplattform/`: Mandat = Sprint 1
   (`mandate-register`), Quellenmodell/Master-Katalog = Sprint 3 (`master/*` + `runtime-source`),
   **eine** dynamische Zuweisung (`assignment` + `supply-plan`, Logik aus Sprint 2), **ein**
   Gesundheitsmodell (10 Zustände), **ein** Qualitätsmodell (10 Achsen), Tenant/RLS = Sprint 3
   (`tenant-scope`). Pakete = nur noch Laufzeitergebnis.

2. **Welche Teile aus S1/S2/S3 wurden übernommen?**
   - **S1:** vollständig `resolveMandate` als einzige Profil→Anforderungs-Wahrheit.
   - **S2:** Match-Dimensionen + Gewichtung, nachvollziehbare Auswahl, Ausschuss↔Politikfeld-Brücke,
     mehrachsige **ehrliche** Qualitätsbewertung (unbekannt ≠ negativ), Discovery/Parser-Muster,
     Duplikaterkennung — **portiert** auf das S3-Modell, **kein** paralleles Quellenmodell mehr.
   - **S3:** Master-Katalog, kanonischer Record + 20 Attribute, Taxonomie, Importzustände,
     Versorgungsstandard (`evaluateSupply`), Tenant-Trennung/RLS, Coverage.

3. **Welche Doppelungen wurden entfernt?**
   In diesem Sprint **physisch keine** (konservativ, freigabepflichtig — Doc 03). **Abgelöst** (superseded)
   sind die parallele S2-Zuweisung/-Qualität/-Gesundheit/-Registry und die zweite Mandatsableitung
   (`deriveRequirement`); Ersatz ist implementiert und getestet, Entfernung wartet auf Freigabe.

4. **Welche Legacy-Komponenten bleiben vorübergehend?**
   `source_packages`, `package_paths`, `profile_packages`, `seeds/packages.js`, `profile-packages.js`
   (Kompatibilitätsschicht, lesend über Adapter); main `quellenarchitektur/*`, `matching`,
   `tenant-context`, alle bestehenden Migrationen (unverändert).

5. **Wie sieht der vollständige Datenfluss aus?**
   `Profil → resolveMandate (S1) → buildRequirement → Master-Katalog-Abfrage (S3, global + private
   per Referenz) → assignSources (gewichtet, begründet) → Versorgungsplan (gewählt/Ebene/Kriterien/
   Relevanz/Alternativen/ausgeschlossen/Lücke) → Gesundheit → Qualität → Coverage (vollständig/
   eingeschränkt/blockiert)`. Keine Quelle wird pro Mandant kopiert.

6. **Gibt es noch parallele Wahrheiten?**
   In der **verbindlichen** Architektur nein (je eine Wahrheit pro Belang). **Physisch** existieren die
   abgelösten S2-Prototypen noch als dormante Module (kein externer Import, kein Live-Pfad) bis zur
   freigegebenen Entfernung.

7. **Welche Risiken bleiben?**
   (a) Physische Koexistenz der dormanten S2-Prototypen bis zur Freigabe. (b) Committee-ID-Raum
   S1-Registry vs. S3-Katalog: das Matching überbrückt via Slug/Entity-ID robust, ein sauberer
   gemeinsamer ID-Raum ist ein Folgeschritt. (c) „Opposition/Gegenpositionen"-Ebene wird von der
   mandatszentrierten Zuweisung nicht automatisch befüllt (bewusst; eigener Ausgewogenheits-Schritt).
   (d) Aktivierung/Migration/Verdrahtung bleibt strikt freigabepflichtig.

8. **Welche Entscheidungen benötigen noch Freigabe?**
   (i) Physische Entfernung des abgelösten S2-Moduls `quellenbibliothek/` + seiner 5 Tests.
   (ii) Ob/wann der dynamische Plan produktiv (Dark-Launch → Umstellung) verdrahtet wird.
   (iii) Ausführung der prepared Migration (S3) — weiterhin **nicht** ausgeführt.

9. **Ist der Integrationsbranch bereit für einen späteren Merge?**
   Der Konsolidierungsbranch ist **additiv, grün (154/154 Offline-Suiten), dormant** und verändert
   keine Live-Datei. Für einen Merge nach main empfiehlt sich vorher Entscheidung (i)+(ii); technisch
   ist er merge-fähig (keine Konflikte mit main erwartet, da rein additiv).

10. **Ist die Architektur stabil genug für Sprint 4?**
    **Ja.** Es existiert je genau **eine** verbindliche Wahrheit für Mandat, Quellenmodell, Zuweisung,
    Gesundheit, Qualität und Tenant-Trennung; Pakete sind auf Laufzeit reduziert; Legacy hat einen
    dokumentierten Ablösepfad. Sprint 4 kann auf `quellenplattform/` aufbauen.

## Abnahmekriterien

| # | Kriterium | Status |
|---|---|---|
| 1 | Ein Mandatsmodell | ✅ S1 `mandate-register` (einzige Ableitung) |
| 2 | Ein Quellenmodell | ✅ `runtime-source` über S3-Record (20 Attribute) |
| 3 | Eine Zuweisungsmaschine | ✅ `quellenplattform/assignment` (bindend) |
| 4 | Ein Gesundheitsmodell | ✅ `health-model` (10 Zustände, Mapper) |
| 5 | Ein Qualitätsmodell | ✅ `quality-model` (10 Achsen, unbekannt≠negativ) |
| 6 | Master-Katalog = einzige neue Quellenwahrheit | ✅ (S2-Parallelmodell abgelöst, kein externer Import) |
| 7 | Pakete nur noch als Laufzeitergebnis | ✅ `supply-plan`; keine neuen persistenten Pakete |
| 8 | Legacy-Pakete mit klarem Ablösepfad | ✅ Doc 01 + Adapter + Shadow |
| 9 | Globale Quellen nicht pro Mandant dupliziert | ✅ Test §12 |
| 10 | Private Quellen strikt isoliert | ✅ Test §13 |
| 11 | Keine Pilot-Sonderlogik | ✅ Test §18 (funktional + Quellcode-Scan) |
| 12 | Alle Tests grün | ✅ 154/154 Offline-Suiten |
| 13 | Keine Produktionslogik aktiviert | ✅ dormant, nicht verdrahtet |
| 14 | Keine Migration ausgeführt | ✅ prepared, nicht ausgeführt |
| 15 | Sprint 4 auf einer klaren Architektur | ✅ siehe Frage 10 |
