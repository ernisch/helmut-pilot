# Admin-Oberfläche der neuen Quellenarchitektur (Sprint 8)

**Auftragsphase 9 · Abhängig von:** Sprint 1 (Katalog), Sprint 4 (Aktivierung/Versorgung),
Sprint 7 (Qualität/Kosten/Watchdog). Macht die bereits gebaute Logik **sichtbar** — ohne etwas
scharfzuschalten. Ruhig, hochwertig, für einen Ein-Personen-Gründer sofort verständlich.

## Die sechs Ansichten

Ein neues reines Reshaping-Modul **`lib/helmut/quellenarchitektur/admin-report.js`** (keine KI/Netz/
Storage/Rendering) formt S4+S7 in die sechs geforderten Ansichten. Die Darstellung nutzt die
**bestehenden Helmut-Muster** (`adminSection`, `dsRow`, `ds-unavail`, `op-tile`, `ac-item`, Chips)
plus wenige ruhige `.sa-*`-Pills.

| Ansicht | Zeigt | Anker |
|---|---|---|
| **1. Länder und Pakete** | welche Länder **aktiv/vorbereitet**; welche **Pflichtklassen fehlen**; alle 7 Pakete mit Versorgung | `#admin-sa-laender` |
| **2. Quellen und Abrufwege** | welche Abrufwege **gesund/defekt/unbekannt**; Herausgeber mit Prüfbedarf zuerst | `#admin-sa-quellen` |
| **3. Profile und Paketversorgung** | welche Profile **versorgt/unversorgt** + fehlendes Pflichtpaket | `#admin-sa-profile` |
| **4. Prüfbedarf** | nur **konkrete** Probleme (ranked) + „noch nicht verfügbare Messwerte" | `#admin-sa-pruefbedarf` |
| **5. Quellendetail** | Herausgeber → Abrufweg im Detail (Methode/Status/Health/Dok/KO/Dup/Pakete/Kosten/Empfehlung) | `#admin-sa-detail` |
| **6. Kosten und Produktnutzen** | echte KI-Kosten je Schritt/Modell; **Quellen, die Kosten erzeugen aber keinen Nutzen** | `#admin-sa-kosten` |

Oben eine ruhige Kachelzeile (`op-tiles`) mit Sprungzielen: Länder · Abrufwege · Profile · Prüfbedarf.

## Ehrlichkeit — keine erfundenen Demozahlen

Die neuen relationalen Tabellen sind **nicht migriert**; die Struktur kommt aus dem **Code-Modell**
(51 Herausgeber, 145 Abrufwege, 7 Pakete, 16 Länder — real), die Kennzahlen aus **Bestandsdaten**
(`raw_documents`, `llm_usage`). Ein klarer **Migrations-Banner** sagt das. Fehlt eine Grundlage, steht
überall das **`ds-unavail`-Muster „nicht verfügbar"** statt einer erfundenen 0:

- **Abrufweg-Health** kennt nur die drei ehrlichen Kübel **gesund / defekt / unbekannt** (+ inaktiv),
  solange keine Telemetrie vorliegt — ein funktionierender Weg wird **nicht** als „gesund" geraten.
- **Dokumente/KO/Duplikate/Kosten je Quelle** erscheinen als „nicht verfügbar", bis Bestandsdaten bzw.
  Migration/Ingest vorliegen. Der Report trägt dafür `availability`-Flags.
- **Prüfbedarf ist entrauscht:** ohne Metriken werden nicht 139 „beobachten"-Hinweise erzeugt (dieselbe
  Ursache), sondern nur **strukturell reale** Probleme (defekte Pflichtquellen, komplett defekte Pakete,
  unversorgte Profile) — plus **ein** ehrlicher Block „noch nicht verfügbare Messwerte".

## Sauberer Leerzustand (Tabellen nicht migriert)

Die Oberfläche funktioniert **heute schon** vollständig: Länder/Pakete/Abrufwege/Profile/Prüfbedarf sind
mit realen Struktur- und Aktivierungsdaten gefüllt; nur die Doku-/Kosten-/Dedup-**Metriken** zeigen den
ruhigen „nicht verfügbar"-Zustand. Liefert der Server gar keinen Report (Fehler), rendert der Client die
Sektion **nicht** — der bestehende Admin bleibt unverändert.

## Verdrahtung (read-only, additiv)

`server.js buildAdminOverview()` hängt `sourceArchitecture` an die Admin-Daten — **rein lesend**,
defensiv (`try/catch` → `null`): `buildFullModel` + `computeGlobalActivation` (S4) + `buildQualityReport`
(S7, gespeist aus `listRawDocuments`/`getLlmUsage`) → `buildSourceAdminReport`. Keine DB-Änderung, kein
KI-Call, keine Aktion. Der Client rendert die Sektion in der bestehenden Admin-Seite vor „System und
Sicherheit".

## Tests

- `test:admin-source-report` (37) — die 6 Ansichten, Migrations-/Leerzustand, Ehrlichkeits-Flags,
  kuratierter Prüfbedarf; plus Gegenprobe mit realen Bestandsdaten (gesund/Kosten/Nutzen sichtbar).
- `test:admin-source-ui` (23) — die echten Client-Render-Funktionen im vm: 6 Ansichten, `ds-unavail`
  statt erfundener 0, ruhiger Prüfbedarf, leerer Report → gar keine Sektion.
- Keine Regression: admin-overview 104, helmut-ui 50, radar-ui 18, quality-watchdog 65, p1 322.

Screenshots (Desktop/Mobil + Einzelansichten) liegen dem Abschlussbericht bei.

## Freigabepflichtig (nichts ausgeführt)
Migrationen anwenden (dann füllt sich der Report aus echten Tabellen) · `koSourceLinks`/Dedup-Ingest
verdrahten (KO-/Duplikat-Kennzahlen) · `sourceId` in `llm_usage` (Kosten je Quelle) · Deployment. Die
Oberfläche ist read-only und ändert nichts.
