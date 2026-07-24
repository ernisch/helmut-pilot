# 29 — Fachpaket „Innere Sicherheit (Bund)" — technische Validierung & inaktive Vorbereitung

**Stand:** 2026-07-24 · **Status: PREPARED / TECHNISCH INAKTIV — NICHT angewendet, nicht aktiviert, kein PR**
**Branch:** `claude/innere-sicherheit-bund-validation-o0fh17` (Basis `035898b`, Merge #114)

> Dieses Dokument ist die fachlich-technische Paketdokumentation. Der **kompakte Wiedereinstieg**
> (IDs, Dateien, Aktivierungs-Checkliste) steht in `manifest-innere-sicherheit-bund.md` — damit
> kann ein künftiger Thread ohne Repository-Vollscan weiterarbeiten.

---

## 0. Auftrag & Ergebnis in einem Satz

Das Fachthemenpaket `innere-sicherheit-bund` wurde **vollständig, aber technisch inaktiv**
vorbereitet: **1 Paket (`prepared`)**, **3 neue Entitäten**, **4 neue Herausgeber**,
**5 neue Abrufwege** (alle `needs_review`/`manual`) und **2 wiederverwendete** bestehende Wege
(DIP, Innenausschuss). Keine Aktivierung, kein Deployment, kein Merge, keine SQL-Anwendung,
keine Änderung bestehender aktiver Quellen, kein PR.

---

## 1. Zuerst gelesene Architekturdateien (kein Vollscan)

Primärorientierung ausschließlich über die Quellenarchitektur-Dokumentation + Code-Modell:

1. `docs/quellenarchitektur/00-master-status.md` (Re-Anker R2, Betriebszustand)
2. `docs/quellenarchitektur/03-datenmodell-und-migration.md` (11 Tabellen, Spalten, RLS)
3. `supabase/migrations/20260713_source_architecture.sql` (Schema + CHECK-Constraints — keine erfundenen Felder)
4. Code-Modell: `lib/helmut/quellenarchitektur/model.js`, `seeds/{entities,publishers,packages}.js`
5. Prepared-Muster (Vorlage): `seeds/landesmodule-quellen.js`, `scripts/generate-landesmodul-seed.js`,
   `supabase/seeds/20260717_landesmodul_be_bb_seed.sql`, `docs/…/15-prepared-eintragung-freigabeanfrage.md`
6. Reuse-Anker: `seeds/bundeswege-reparaturen.js`, `profile-packages.js`, Basis-Seed
   `supabase/seeds/20260713_source_architecture_seed.sql`

Danach nur **gezielte** Suchen (BMI/BKA/BfV/DIP/Innenausschuss/PKGr/PMK …). **Ein Vollscan wurde
vermieden** — README/Master-Status/Datenmodell/Seeds waren vollständig und widerspruchsfrei.

---

## 2. Kompetenz- & Zuständigkeitskarte (amtlich verifiziert 2026-07)

| Institution | Rolle | Typ im Modell | Publikationen im Scope | amtlicher Stand |
|---|---|---|---|---|
| **BMI** — Bundesministerium des Innern | Ressort/politische Steuerung | `ministry` (Entität **bestehend** `ministry-bmi`) | Sicherheitsgesetzgebung, Strategien | Name seit **Organisationserlass 06.05.2025** wieder „Bundesministerium des Innern" (Minister Dobrindt). „…und für Heimat" = **historischer Alias** (20. WP) |
| **BKA** — Bundeskriminalamt | Bundesoberbehörde, Zentraldatenproduzent | `authority` (neu `authority-bka`) | PKS, Bundeslagebilder (OK, Cybercrime, Menschenhandel, Rauschgift, Zuwanderung), PMK | bestätigt |
| **BfV** — Bundesamt für Verfassungsschutz | Bundesoberbehörde | `authority` (neu `authority-bfv`) | Verfassungsschutzberichte, Extremismus/Spionage/hybride Bedrohungen | bestätigt |
| **BfDI** — Bundesbeauftragte f. Datenschutz u. Informationsfreiheit | Kontrollinstanz | `authority` (neu `authority-bfdi`) | Tätigkeitsberichte, Stellungnahmen zu Sicherheitsgesetzen | **34. TB 2025** übergeben 06.05.2026 |
| **Deutscher Bundestag / DIP** | Parlament / Dokumentationssystem | `parliament` (Entität **bestehend**) | Gesetzgebung, Drucksachen, Ausschuss, PKGr-/G10-/Art-13-Unterrichtungen | **wiederverwendet** (`rp-dip`) |
| **Innenausschuss** (21. WP) | parlamentarisches Gremium | `committee` (Entität **bestehend** `committee-bt-inneres`) | Anhörungen, Beschlussempfehlungen | Name **21. WP = „Innenausschuss"**, konstituiert 21.05.2025. **wiederverwendet** (`rp-committee-inneres`) |

**Nicht als stabile Entität modelliert:** Personen (Auftrag §4) — kein Minister/Präsident als Quelle-ID.

---

## 3. DeepSeek-Aussagen: geprüft & korrigiert

| DeepSeek-Aussage | Prüfergebnis | Konsequenz |
|---|---|---|
| Ausschuss heißt „Ausschuss für Inneres und Heimat" | **FALSCH für 21. WP.** Aktuell **„Innenausschuss"** (bundestag.de/inneres, konst. 21.05.2025). Alte Bezeichnung = Webarchiv 20. WP. | Nur historischer Alias. Bestandsdrift dokumentiert (§8), Bestand **nicht** stillschweigend geändert. |
| Verfassungsschutzbericht 2025 veröffentlicht 30.06.2026 | **BESTÄTIGT** (BfV/BMI, vorgestellt 30.06.2026, Dobrindt/Selen). Ausnahmsweise korrekt. | Aufgenommen; Weg zeigt auf **stabile Publikationsübersicht**, nicht die Jahres-URL. |
| PKS 2025 (April/Mai) | **BESTÄTIGT** — 20.04.2026 (BKA). | Über BKA-Statistik-/Lagebilder-Hub abgedeckt. |
| PMK „unterschätzt" / eher gering | **KORRIGIERT — PMK ist hochrelevant.** 2025 = **85.837 Fälle** (Höchststand), vorgestellt 09.06.2026. Eigener URL-Baum, eigener Jahreszyklus. | **Eigener PMK-Weg** (`rp-isb-bka-pmk`), nicht in die PKS/Lagebild-Übersicht gequetscht. |
| PKGr/Art-13: „keine regelmäßigen öffentlichen Berichte" | **ZU PAUSCHAL.** Es gibt regelmäßige **Unterrichtungen als Bundestags-Drucksachen** (z. B. Drs. 21/12; G-10-Berichte nach §14 G10; PKGr-Tätigkeitsbericht nach §13 PKGrG). | **Über DIP abgedeckt** — **kein** Parallelweg (Auftrag §5/§11). |
| Kernquellen ~6–8 | Plausibel, aber Ausschuss-/DIP-Wiederverwendung nötig. | 5 neue + 2 wiederverwendete = **7 Wege**. |

---

## 4. Modellierte Wege (7 gesamt = 5 neu + 2 wiederverwendet)

Alle **neuen** Wege: `status=needs_review`, `activation_mode=manual`, `prepared` → technisch **inaktiv**.

| Weg-ID | Herausgeber | Methode | Tier | Frequenz | kritisch | Themen (`path_expected_topics`) |
|---|---|---|---|---|---|---|
| `rp-isb-bmi-gesetzgebung` | BMI | html | **1** | irregular | ja | sicherheitsgesetzgebung, sicherheitsstrategie |
| `rp-isb-bka-statistik-lagebilder` | BKA | html | **1** | annual | ja | kriminalstatistik, organisierte_kriminalitaet, **cybercrime**, menschenhandel, rauschgiftkriminalitaet, kriminalitaet_zuwanderung |
| `rp-isb-bka-pmk` | BKA | html | **2** | annual | ja | politisch_motivierte_kriminalitaet, extremismus |
| `rp-isb-bfv-verfassungsschutzberichte` | BfV | html | **1** | annual | ja | extremismus, spionageabwehr, hybride_bedrohungen |
| `rp-isb-bfdi-taetigkeitsberichte` | BfDI | html | **2** | annual | nein | datenschutzkontrolle, ueberwachungsgesetze |
| `rp-dip` *(wiederverwendet)* | Bundestag/DIP | api | **1** | daily | — | Gesetzgebung, Drucksachen, PKGr/G10/Art-13-Unterrichtungen, Ausschuss |
| `rp-committee-inneres` *(wiederverwendet)* | Google News/Bundestag | googlenews_search | **1** | — | — | Innenausschuss-Signale |

**BKA kompakt (Auftrag §8):** EIN Weg für Statistiken + alle Bundeslagebilder (keine künstliche
Aufteilung je Lagebild — die abgedeckten Lagebilder stehen als 6 Themen-Tags), plus EIN eigener
PMK-Weg. Kein hochvolumiger Fahndungs-/Erfolgsmeldungsweg.
**BfV kompakt (§9):** eine stabile Publikationsübersicht. **BMI (§10):** nur Gesetzgebung/Steuerung,
kein Vollfeed.

---

## 5. Priorisierung (Tier)

| Tier | Wege | Anzahl |
|---|---|---|
| **Tier 1** (dauerhaft unverzichtbar) | BMI-Gesetzgebung, BKA-Statistik/Lagebilder, BfV-Verfassungsschutzberichte, DIP*, Innenausschuss* | **5** (davon 2 wiederverwendet) |
| **Tier 2** (regelmäßig/periodisch) | BKA-PMK, BfDI-Tätigkeitsberichte | **2** |
| **Tier 3 / Future Target** (dokumentiert, **nicht** geseedet) | Bundespolizei, IMK, Europol, Frontex, Bundesrechnungshof (sicherheitsspezifisch), PKGr als eigener Weg | 0 im Seed |

`* = wiederverwendet`. **Neu geseedet:** 3 Tier-1 + 2 Tier-2 = 5 Wege.

**Bewusst NICHT geseedet (§12/§14) — Begründung Tier 3 / Future Target:**
- **Bundespolizei:** überwiegend operative Vollzugsbehörde; kein belegter stabiler Zusatz-Signalwert
  über BMI/DIP/BKA hinaus. Operative Einsatz-/Erfolgsmeldungen ausgeschlossen. → Future Target.
- **IMK:** Bund-Länder-Koordination, halbjährlich; Beschlüsse via `innenministerkonferenz.de`
  (Bundesrat-Verwaltung). Signal überschneidet BMI/Presse; Helmut ist bundesfokussiert. → Tier 3.
- **Europol/Frontex:** EU-Ebene; Deutschland-/Bundesbezug unregelmäßig. → Tier 3 / Future Target.
- **PKGr / Art-13-Gremium als eigener Weg:** Berichte sind DIP-Drucksachen → über DIP abgedeckt.

---

## 6. Dublettenmatrix (semantischer Check, Auftrag §19)

| Paarung | Ergebnis | Nachweis |
|---|---|---|
| BMI ↔ BKA | getrennt (Ressort vs. Fachbehörde) | eigene Entität/Herausgeber/Weg |
| BMI ↔ BfV | getrennt | eigene Entität/Herausgeber/Weg |
| BMI ↔ Bundespolizei | keine Dublette (Bundespolizei nicht geseedet) | — |
| BKA ↔ PKS | **PKS = Publikation**, keine eigene Institution → im BKA-Statistik-Weg (Topic `kriminalstatistik`) | kein eigener PKS-Publisher |
| BKA ↔ PMK | ein Herausgeber (BKA), zwei fachlich getrennte Wege | beide `publisher-bka.de` |
| BKA ↔ einzelne Bundeslagebilder | **keine Über­fragmentierung** — 1 Weg, 6 Topic-Tags | `rp-isb-bka-statistik-lagebilder` |
| BfV ↔ Verfassungsschutzbericht | **Bericht = Publikation des BfV** → im BfV-Weg | kein eigener Berichts-Publisher |
| DIP ↔ Innenausschuss | verschiedene Zugänge, **beide wiederverwendet**, kein Parallelweg | `rp-dip` + `rp-committee-inneres` |
| DIP ↔ PKGr-/Art-13-Berichte | Berichte sind DIP-Drucksachen → **kein** Parallelweg | Reuse `rp-dip` |
| BSI ↔ Cybercrime-Lagebild | **kein** BSI-Publisher; Cybercrime-Lagebild bleibt als BKA-Topic (kriminalpolitisch) | Topic `cybercrime` am BKA-Weg |
| BfDI ↔ parlamentarische Gesetzgebung | getrennt (Kontrollinstanz vs. DIP) | eigener BfDI-Weg |
| IMK ↔ BMI | keine Dublette (IMK nicht geseedet) | — |
| Innere Sicherheit ↔ Bevölkerungsschutz | strikt getrennt (§7) | siehe unten |
| ID/Slug/Domain/URL-Dublette gegen Basis-Seed | **0** | Test §6 (47 Checks) |
| historische BMI-Dublette | **0** (genau 1 BMI-Herausgeber, an bestehende Entität geknüpft) | Test |

---

## 7. Abdeckungsmatrix nach politischer Funktion

| Funktion | Quelle | Abdeckung |
|---|---|---|
| Kriminalitätsentwicklung (PKS) | BKA-Statistik/Lagebilder | vollständig |
| Organisierte Kriminalität / Cybercrime / Menschenhandel / Rauschgift / Zuwanderung | BKA-Statistik/Lagebilder (Topics) | vollständig |
| Politisch motivierte Kriminalität | BKA-PMK | vollständig |
| Extremismus / Spionage / hybride Bedrohungen | BfV-Verfassungsschutzberichte | öffentlicher Teil |
| Sicherheitsgesetzgebung / Strategien | BMI-Gesetzgebung + DIP | vollständig |
| Parlamentarische Kontrolle / Ausschuss | DIP + Innenausschuss (wiederverwendet) | vollständig |
| Geheimdienstkontrolle (PKGr/G10/Art-13) | DIP-Unterrichtungen (wiederverwendet) | öffentlicher Teil |
| Datenschutz bei Sicherheitsgesetzen | BfDI | ereignisbezogen |
| Bund-Länder-Koordination (IMK) | — | Tier 3 / Future Target |
| Europäische Zusammenarbeit / Grenzschutz | — | Tier 3 / Future Target |

---

## 8. Abgegrenzte Themen & Bestandsdrift

**Dem Paket `bevoelkerungsschutz-katastrophenschutz-bund` zugeordnet (hier ausgeschlossen):**
BBK, THW, Warnsysteme, Zivilschutz, Katastrophenhilfe, LÜKEX, GMLZ, Feuerwehr-/Rettungswesen.
Hinweis: Der bestehende bund-basis-Suchbegriff `committee-inneres` enthält historisch den Term
„Bevölkerungsschutz" — das ist **Bestand** und wird hier **nicht** verändert.

**Späterem Cyber-/Digitalpaket zugeordnet:** allgemeine BSI-Warn-/Schwachstellenmeldungen,
IT-Grundschutz, Produktzertifizierungen, Verwaltungs-IT. **Ausnahme:** das **Bundeslagebild
Cybercrime** bleibt im Paket (kriminalpolitische Innere Sicherheit) — als BKA-Topic, **kein** BSI-Weg.

**Verteidigung/Nachrichtendienste:** BND/MAD/Bundeswehr/NATO ausgeschlossen; nur öffentliche
parlamentarische Kontrollberichte über die bestehenden DIP-Wege.

**Bestandsdrift (außerhalb Paket-Scope, NICHT verändert — nur dokumentiert):**
1. Entität `committee-bt-inneres` heißt im Bestand „Ausschuss für Inneres und Heimat"; amtlich
   21. WP = **„Innenausschuss"**. Änderung berührt aktives bund-basis → separate Freigabe.
2. `entities.js` modelliert 23 Ausschüsse; die 21. WP hat **24 ständige Ausschüsse**. Bestandsthema.

---

## 9. Integrationsprotokoll (was wurde angelegt / wiederverwendet / vermieden)

**Neu angelegt (additiv, isoliert):**
- Code-Modell: `lib/helmut/quellenarchitektur/seeds/innere-sicherheit-bund.js`
- Generator: `scripts/generate-innere-sicherheit-bund-seed.js`
- Test: `scripts/innere-sicherheit-bund-seed-test.js` (47 Checks, auto-registriert in Offline-Suite)
- Seed + Rollback: `supabase/seeds/20260724_innere_sicherheit_bund_seed.sql` (+ `_rollback.sql`)
- npm-Skripte: `test:innere-sicherheit-bund`, `seed:innere-sicherheit-bund`
- Doku: dieses Dokument + `manifest-innere-sicherheit-bund.md` + Master-Status-Nachtrag

**Wiederverwendet (nicht dupliziert):** Entität `ministry-bmi`; Wege `rp-dip`, `rp-committee-inneres`
(nur `package_paths`-Referenz); Entitäten `parliament-bundestag`, `committee-bt-inneres` (indirekt via Reuse-Wege).

**Bewusst NICHT angefasst (Isolation):** `seeds/packages.js` (PACKAGE_DEFINITIONS bleibt 6 Pakete —
`source-architecture-test` grün), Basis-Seed `20260713_*` (byte-identisch), `catalog.js`,
`profile-packages.js`, alle Generatoren/Registry/Workflow-Logik, `run-offline-tests.js`
(Test wird auto-erkannt). Grund: Das Paket entsteht **nach** dem angewendeten Basis-Seed →
Eintrag in packages.js würde den 6-Pakete-Test brechen und bei Regenerierung ein aktives
Artefakt verändern. Deshalb trägt der **eigene Seed** die `source_packages`-Zeile.

**Kein Profil-Mapping:** `resolveProfilePackages` hat keine Regel für `innere-sicherheit-bund`
(Test mit 3 Innenpolitik-Profilen → 0 Zuordnungen). **Kein aktiver Crawl-Plan:** `prepared` +
`manual` → `computeGlobalActivation` aktiviert nichts.

---

## 10. Verifikationsstatus (Auftrag §17 — ehrliche Trennung)

| Stufe | Status |
|---|---|
| **byte-genau technisch bestätigt** (HTTP/Redirect/Content-Type) | **KEINE** — lokaler Egress zu Behörden-Domains Proxy-seitig gesperrt (CONNECT 403; WebFetch 403). |
| **nur amtlich / WebSearch fachlich bestätigt** | alle 5 neuen URLs + alle Institutionen/Publikationen/Daten (BMI-Name, Innenausschuss, VSB 2025, PKS 2025, PMK 2025, BfDI 34. TB) |
| **ungeprüft** | — |
| **vor Aktivierung zwingend erneut zu prüfen** | byte-genaue URL-Prüfung + Methoden-/Parser-Wahl (direktes RSS/HTML vs. `site:`-Google-News-Ersatz, vgl. `bundeswege-reparaturen.js`) auf offenem Egress-Runner; DB-Dry-Run (`begin; seed; Prüfungen; rollback;`). |

Kein Weg trägt `byteVerified:true` (Test erzwingt 0). `status=needs_review` ist der DB-Pruefmarker;
**kein Schemafeld erfunden** (Verifikationsdetails leben im Modul/Doku, nicht in der DB).

---

## 11. Verbleibende Risiken vor Aktivierung

1. **URLs byte-ungeprüft** (Egress gesperrt) — amtliche Übersichts-/Node-Seiten können umziehen;
   Bot-403 auf direktem HTML-Scrape möglich (Repo-Erfahrung). Vor Aktivierung byte-prüfen +
   ggf. auf `site:`-Google-News-Ersatz oder echten RSS/Open-Data-Feed umstellen.
2. **Methode `html`** ist die kanonische Annahme; endgültige Abrufmethode ist Aktivierungs-Entscheidung.
3. **Innenausschuss-Bestandsname** veraltet (Drift §8) — vor breiter Nutzung Alias/Umbenennung
   separat freigeben.
4. **DB-Dry-Run** noch nicht gefahren (kein lokaler PG-Server; Produktions-DB tabu) — Teil des
   Aktivierungs-Gates.

---

## 12. Nächster Schritt (nur mit ausdrücklicher Freigabe)

Analog `15-prepared-eintragung-freigabeanfrage.md`: (0) Dry-Run `begin; <seed>; Prüfungen; rollback;`,
(1) Seed anwenden, (2) Integritätsprüfungen (0 aktive Wege, Paket `prepared`, FK-Waisen 0,
Bundeswege unverändert), (3) bei Abweichung Rollback. **Kein Teil davon ist Gegenstand dieses Sprints.**
