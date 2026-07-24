# Bestandsabgleich — Source Package `gesundheit-und-pflege`

**Sprint:** 1 (Bestandsabgleich, ausschließlich lesend) · **Stand:** 2026-07-24
**Branch:** `claude/helmut-gesundheit-pflege-abgleich-3zmwfg` · **Basis:** `main` @ `035898b` (Branch ist zu diesem Zeitpunkt identisch mit `main`)
**Quelle der fachlichen Anforderung:** Paket `Helmut_gesundheit_und_pflege_Master_Uebergabe` (hochgeladen, ausschließlich dieses Paket entpackt und gelesen)

**Modus:** Rein lesend/analytisch. Keine Live-Abrufe, keine Webseiten geöffnet, keine Quellen implementiert, keine Parser geschrieben, keine Retrieval Paths angelegt, keine Seeds geändert, keine Aktivierung, keine Migration, kein Deployment, keine bestehenden Quellen gelöscht oder verändert. Es wurden ausschließlich die zwei in diesem Verzeichnis liegenden Dateien erzeugt.

---

## 0. Hinweis zur Dateibenennung im Masterpaket

Die Leseanweisung nannte `00_MASTER/06_technische_kandidaten.csv` und `00_MASTER/07_bewusste_ausschluesse.csv`. Im tatsächlich entpackten Paket tragen die Dateien an diesen Positionen andere Namen:

| Erwartet (Auftrag) | Tatsächlich im Paket | Inhalt passt zu Erwartung? |
|---|---|---|
| `06_technische_kandidaten.csv` | `06_BASIS_UND_FACHGRENZEN.csv` | Nein — Inhalt betrifft Abgrenzung zu bestehenden Basispaketen (bund-basis, berlin-basis, brandenburg-basis, arbeit-und-soziales, digitales-daten-und-staatsmodernisierung), nicht Kandidaten. |
| `07_bewusste_ausschluesse.csv` | `07_KANDIDATEN.csv` | Inhaltlich sind das die **20 technischen/optionalen Kandidaten** (passt zu `target.technical_or_optional_candidates: 20` in `02_ARCHITEKTUR_MASTER.json`) — inhaltlich also die unter Punkt 6 des Auftrags gemeinten Kandidaten, nur unter anderer Dateinummer/-name. |

Eine Datei „bewusste Ausschlüsse" auf Master-Ebene existiert im Paket nicht; ein gleichnamiges Dokument gibt es nur auf Block-Ebene (`01_EINZELBLOECKE/…Block_5…/03_bewusste_ausschluesse.csv`). Für diesen Abgleich wurden beide Ebenen gelesen und inhaltlich korrekt zugeordnet: `07_KANDIDATEN.csv` (20 Einträge) als „technische Kandidaten" (Punkt 6 des Auftrags), Block 5 `03_bewusste_ausschluesse.csv` als ergänzender Kontext. Dies ist eine reine Dokumentations-Inkonsistenz im Übergabepaket, keine inhaltliche Weichenstellung, und wird hier nur der Vollständigkeit halber vermerkt.

---

## 1. Methodik

1. Gelesen wurden alle sieben angeforderten Master-Dateien sowie ergänzend: `00_MASTER/03_CLAUDE_CODE_MASTERAUFTRAG.md`, alle fünf Block-Ordner (`01_fachliche_entscheidung.md`, `02_pflichtrollen.csv`/`02_kandidaten.csv`, `03_bewusste_ausschluesse.csv` bei Block 5) und die Root-Manifeste — ausschließlich innerhalb des hochgeladenen Pakets.
2. Als „Pflichtpfade" wurden die **18 Zeilen aus `00_MASTER/05_FINALER_PFLICHTKERN.csv`** verwendet (deckungsgleich mit den Block-CSVs 1–4 und mit `target.mandatory_roles: 18`).
3. Als „technische Kandidaten" wurden die **20 Zeilen aus `00_MASTER/07_KANDIDATEN.csv`** verwendet (deckungsgleich mit `target.technical_or_optional_candidates: 20`; Block 5 `02_kandidaten.csv` ist eine 13-elementige Teilmenge davon).
4. Abgleich erfolgte gegen den tatsächlichen Code-/Konfigurationsstand auf `main`:
   - **Legacy-Katalog (aktiv, Ist-Quelle laut `storage.js`):** `lib/helmut/sources.js` (`v1Sources`)
   - **Neue relationale Quellenarchitektur — live in Production seit `HELMUT_SOURCE_MODE=on` (2026-07-15):** `lib/helmut/quellenarchitektur/*` (Modell `model.js`, Katalog-Mapper `catalog.js`, Seeds `seeds/publishers.js`, `seeds/packages.js`, `seeds/entities.js`, `seeds/landesmodule-quellen.js`, `seeds/landesmodule-kandidaten.js`) sowie die angewandte Migration/Seed `supabase/migrations/20260713_source_architecture.sql` und `supabase/seeds/20260713_source_architecture_seed.sql`
   - **Trust-/Sicherheitsschicht:** `lib/helmut/sourceSafety.js` (`OFFICIAL_DOMAINS`)
   - **Bestehende Architektur-Dokumentation:** `docs/quellenarchitektur/00-master-status.md`, `docs/quellenarchitektur/00-ist-architektur-und-abweichungen.md`, `docs/architecture/retired-quellenplattform-branches.md`, `docs/datenmotor-restliste.md`
   - **Unabhängiger Vorbefund:** `audit/source-coverage.md` (SaaS-Readiness-Audit, 2026-07-12, vor dem Gesundheit-und-Pflege-Auftrag entstanden)
5. Der aktuelle Arbeitsbranch war zum Zeitpunkt des Abgleichs commit-identisch mit `main` (`035898b`), d. h. der Abgleich erfolgte de facto direkt gegen `main`.
6. Für jede der 18 Publisher/Rollen und aller 20 Kandidaten wurde gezielt nach Domain, Institutionsname und bekannten Aliasnamen gesucht (u. a. RKI, gematik, G-BA, IQWiG, IQTIG, BfArM, PEI, BAS/Bundesamt für Soziale Sicherung, BIÖG/BZgA, LAGeSo, LAVG, MASGZ, Amt für Statistik Berlin-Brandenburg, Bundessozialgericht, KBV, DKG, Bundesärztekammer, ABDA, Sachverständigenrat, Medizinischer Dienst, InEK, GKV-Spitzenverband, EMA, EHDS).

---

## 2. Kurzbefund

| Kennzahl | Wert |
|---|---|
| Pflichtpfade **vollständig vorhanden** | **0 / 18** |
| Pflichtpfade **teilweise vorhanden** | **7 / 18** |
| Pflichtpfade **fehlen vollständig** | **11 / 18** |
| Source Package `gesundheit-und-pflege` auf `main` angelegt? | **Nein** — bestätigt exakt das, was das Masterpaket selbst notiert (`status: "fachlicher Arbeitsname, noch nicht auf main angelegt"`) |
| Technische Kandidaten bereits im Repository (ganz/teilweise) | **3 / 20** (Caritas, Diakonie, ver.di — alle nur generisch, keiner dediziert „Gesundheit und Pflege") |
| Bundessozialgericht-Wege zur Wiederverwendung vorhanden? | **Nein** — keine einzige Fundstelle für „Sozialgericht" im gesamten Repository |

Der einzige real existierende, aktiv crawlende Berührungspunkt mit dem künftigen Paket ist eine **Google-News-Suche** (`news-bundesgesundheitsministerium-pflege`, Klarname „BMG Pflege"), die ausschließlich das BMG-Domain mit den Stichwörtern *Pflege/Pflegeversicherung/Pflegekräfte* durchsucht und heute dem Paket `arbeit-und-soziales` zugeordnet ist (dort mit 33 Dokumenten/7 Tage laut `audit/source-coverage.md` sogar eine der volumenstärksten Google-News-Quellen). Alle anderen 17 Pflichtpfade haben entweder gar keine oder nur eine strukturell vorbereitete, aber inaktive Grundlage.

---

## 3. Bestandsmatrix je Pflichtpfad — Kurzübersicht

Vollständige Matrix mit allen 10 geforderten Dimensionen: **`bestandsmatrix.csv`** (gleiches Verzeichnis). Kurzübersicht:

| Nr | Block | Publisher | Rolle (gekürzt) | Status |
|---|---|---|---|---|
| 1 | 1 | BMG | Aktueller Fachsignalstrom | teilweise (Publisher + Pflege-Google-News-Ausschnitt) |
| 2 | 1 | BMG | Gesetze und Verordnungen | teilweise (nur Publisher-Eintrag) |
| 3 | 1 | RKI | Surveillance/Gesundheitsberichterstattung | **fehlt vollständig** |
| 4 | 1 | BIÖG (BZgA) | Prävention/Gesundheitskommunikation | **fehlt vollständig** |
| 5 | 1 | gematik | Digitale Versorgung/TI | **fehlt vollständig** |
| 6 | 2 | G-BA | Beschlüsse und Richtlinien | **fehlt vollständig** |
| 7 | 2 | IQWiG | Nutzen-/Evidenzbewertungen | **fehlt vollständig** |
| 8 | 2 | IQTIG | Qualitätssicherung/Transparenz | **fehlt vollständig** ⚠ (Masterpaket behauptet „RSS vorhanden" — siehe Abschnitt 5) |
| 9 | 2 | BfArM | Arzneimittel/Engpässe/DiGA | **fehlt vollständig** |
| 10 | 2 | Paul-Ehrlich-Institut | Impfstoffe/Biomedizin | **fehlt vollständig** |
| 11 | 2 | BAS | Finanzierung/Kassenaufsicht | **fehlt vollständig** |
| 12 | 2 | Destatis | Kuratiertes Gesundheits-/Pflegedatenset | teilweise (Publisher + generischer Google-News-Weg, kein Datenset) |
| 13 | 3 | Berliner Gesundheits-/Pflegeverwaltung | Fachlicher Signalstrom | teilweise (nur über inaktives, vorbereitetes Berlin-Basis-Paket denkbar) |
| 14 | 3 | LAGeSo Berlin | Vollzug und Aufsicht | **fehlt vollständig** |
| 15 | 3 | Amt für Statistik Berlin-Brandenburg | Berliner Gesundheits-/Pflegedaten | teilweise (nur Entitäts-Stub, kein Datenzugang) |
| 16 | 4 | Brandenburger Gesundheits-/Pflegeressort (MASGZ) | Fachlicher Signalstrom | teilweise (nur über inaktives, vorbereitetes Brandenburg-Basis-Paket denkbar) |
| 17 | 4 | LAVG Brandenburg | Berichterstattung/Vollzug/Aufsicht | **fehlt vollständig** |
| 18 | 4 | Amt für Statistik Berlin-Brandenburg | Brandenburger Gesundheits-/Pflegedaten | teilweise (identischer Entitäts-Stub wie Nr. 15) |

**Einordnung „teilweise vorhanden":** Bei keinem der 7 Fälle existiert ein zweckgebundener Retrieval Path für die konkrete Pflichtrolle. „Teilweise" heißt hier durchgehend: entweder ist der **Publisher/die Entität** bereits registriert (BMG, Destatis, Amt für Statistik Berlin-Brandenburg), oder es existiert ein **strukturell vorbereiteter, aber inaktiver** Landesmodul-Pfad (Berlin/Brandenburg), der die Rolle allenfalls als ungefilterte Teilmenge künftig mittragen könnte. Keiner dieser Teilzustände liefert heute zweckgebundene Inhalte für die jeweilige Pflichtrolle.

---

## 4. Technische Kandidaten — Existenzprüfung (nur Repository-Vorhandensein, wie beauftragt)

| Nr | Kandidat | Bereits im Repository? | Beleg |
|---|---|---|---|
| 1 | RKI getrennte Datenwege | Nein | RKI insgesamt nicht vorhanden (siehe Pflichtpfad Nr. 3) |
| 2 | BMG Forschungs- und Strategieberichte | Nein (eigener Weg) | Nur der generische BMG-Publisher existiert (siehe Nr. 1/2 der Matrix) |
| 3 | Pflege- und Patientenbeauftragte Bund | Nein | Keine Treffer |
| 4 | Medizinischer Dienst Bund | Nein | Keine Treffer |
| 5 | InEK | Nein | Keine Treffer |
| 6 | GKV-Spitzenverband | Nein | Keine Treffer |
| 7 | Kassenärztliche Bundesvereinigung (KBV) | Nein | Keine Treffer |
| 8 | Deutsche Krankenhausgesellschaft | Nein | Keine Treffer |
| 9 | Bundesärztekammer | Nein | Keine Treffer |
| 10 | ABDA | Nein | Keine Treffer |
| 11 | Sachverständigenrat Gesundheit und Pflege | Nein | Keine Treffer |
| 12 | Bundessozialgericht | **Nein** | Gezielt gegengeprüft (Suche nach „Sozialgericht" im gesamten Repository) — **keine einzige Fundstelle**, weder im Legacy-Katalog noch in der neuen Quellenarchitektur noch in `sourceSafety.js` |
| 13 | EMA | Nein | Keine Treffer |
| 14 | Europäischer Gesundheitsdatenraum (EHDS) | Nein | Keine Treffer |
| 15 | Berliner Pflegebeauftragte | Nein | Keine Treffer |
| 16 | Krankenhauspläne Berlin und Brandenburg | Nein | Keine Treffer |
| 17 | Pflegepläne und Pakt für Pflege | Nein | Keine Treffer |
| 18 | Patienten- oder Pflegebedürftigenquelle | Nein | Keine Treffer |
| 19 | Beschäftigtenquelle | **Teilweise** | `news-verdi` (ver.di) existiert bereits generisch inkl. Pflege-Keyword, aber nicht als dedizierte „ver.di Gesundheit und Pflege"-Unterquelle |
| 20 | Pflegeanbieter oder Wohlfahrt | **Ja — doppelt** | `news-caritas` UND `news-diakonie` existieren bereits generisch (Paket `arbeit-und-soziales`), beide mit Pflege-Keyword — die Vorgabe „maximal eine Quelle" ist durch die bestehenden zwei Wege bereits heute rechnerisch überschritten |

**17 von 20 Kandidaten** existieren in keiner Form im Repository. Bei den **3 Ausnahmen** (Beschäftigtenquelle, Pflegeanbieter/Wohlfahrt) handelt es sich um bereits laufende, aber fachlich nicht dedizierte Google-News-Wege aus dem bestehenden Paket `arbeit-und-soziales` — keine echte Vorarbeit für `gesundheit-und-pflege` im engeren Sinn, aber ein konkretes Dublettenrisiko für Sprint 2+.

---

## 5. Beobachtete Abweichungen zwischen Masterpaket-Annahmen und `main`

1. **Bundessozialgericht-Wiederverwendung nicht einlösbar.** Das Masterpaket setzt an mehreren Stellen voraus, dass im Paket `arbeit-und-soziales` bereits Retrieval Paths für das Bundessozialgericht existieren und lediglich wiederverwendet/fachlich gefiltert werden müssen (kritisches Stop-Gate Frage 5 in `00_START_HIER.md`; Phase 1.5 und Phase 4.5 in `03_CLAUDE_CODE_MASTERAUFTRAG.md`; Block 5 `01_fachliche_entscheidung.md` und `02_kandidaten.csv` Nr. 8/12). **Diese Wege existieren auf `main` nicht** — weder im Legacy-Katalog (`sources.js`) noch in der neuen Quellenarchitektur noch im Trust-Register. Diese Annahme muss vor Sprint 2 korrigiert werden: entweder eine neue BSG-Anbindung planen (kein „Wiederverwendungs"-Fall) oder die Prämisse im Fachdokument streichen.
2. **IQTIG-Status im Masterpaket nicht bestätigt.** `05_FINALER_PFLICHTKERN.csv` vermerkt für IQTIG „RSS vorhanden, main prüfen". Der Abgleich findet **keine Spur** von `iqtig.org` oder einer IQTIG-Quelle auf `main`. Sollte an anderer Stelle (z. B. einem nicht gemergten Branch) tatsächlich ein IQTIG-RSS vorbereitet worden sein, ist das nicht Teil des aktuellen `main`-Standes.
3. **Grundannahme „Paket existiert fachlich, aber nicht technisch" ist zutreffend.** Der einzige Punkt, den das Masterpaket über den Ist-Zustand explizit selbst behauptet (`02_ARCHITEKTUR_MASTER.json`: `"status": "fachlicher Arbeitsname, noch nicht auf main angelegt"`), ist **korrekt** und wird durch diesen Abgleich bestätigt: kein Paket, keine Package Paths, keine Aktivierung.
4. **Regionalkuratur/Landesmodul-Reife ist geringer als für eine reibungslose Integration nötig.** Die eigene Stop-Gate-Frage 4 des Masterpakets („funktioniert Regionalkuratur korrekt?") bleibt unbeantwortet **offen** — Berlin- und Brandenburg-Basispakete sind laut `docs/architecture/retired-quellenplattform-branches.md` und `docs/quellenarchitektur/28-quellenabdeckung-p2-5-readiness-diagnose.md` strukturell vorbereitet, aber Status `prepared`/inaktiv und „hart gesperrt". Die dortigen 15 generischen Pflichtklassen decken zudem exekutive Fachbehörden wie LAGeSo/LAVG konzeptionell **nicht** ab (nur Parlament/Regierung/Fraktionen/Medien).
5. **Externe, unabhängige Bestätigung des fachlichen Bedarfs.** Das SaaS-Readiness-Audit vom 2026-07-12 (`audit/source-coverage.md`, entstanden **vor** dem Gesundheit-und-Pflege-Masterpaket) benennt „Gesundheit" bereits unabhängig als Politikfeld ohne thematische Tiefe und empfiehlt genau die Art von gezieltem Fachpaket, die das Masterpaket jetzt spezifiziert. Das stützt die fachliche Grundlage des Auftrags, ist aber keine technische Vorarbeit.
6. **Kein Widerspruch bei Google News:** Die No-Go-Regel „Kein Google News im Pflichtkern" bezieht sich zutreffend auf ein künftiges Paket; die heute bestehenden Google-News-Wege (BMG-Pflege, Destatis-Sozialdaten, Caritas, Diakonie, ver.di, Ausschuss-Gesundheit-Radar) laufen alle unter `arbeit-und-soziales`/neutral und stehen dieser Regel nicht entgegen — sie sind aber die „Google News Ersatzwege", die ein späterer Rückbauplan (Phase 6 im Masterauftrag) berücksichtigen muss.
7. **Architektur-Falle für Folgesprints (kein Widerspruch, aber Risiko):** `docs/architecture/retired-quellenplattform-branches.md` beschreibt eine parallele, **stillgelegte** „Quellenplattform"-Architektur (Generation B) auf diversen Branches, die dem bereits **live** laufenden Modell in `lib/helmut/quellenarchitektur/*` täuschend ähnlich ist. Jede künftige Implementierung von `gesundheit-und-pflege` muss auf dem aktuellen Live-Modell aufsetzen, nicht auf Generation-B-Branches.

---

## 6. Abschlussbericht

**1. Wie viele Pflichtpfade sind vollständig vorhanden?**
**0 von 18.** Kein einziger der 18 Pflichtpfade hat einen eigenen, zweckgebundenen, aktiven Retrieval Path.

**2. Wie viele sind teilweise vorhanden?**
**7 von 18** (Nr. 1, 2, 12, 13, 15, 16, 18): BMG (beide Rollen, gestützt auf den registrierten Publisher bzw. einen thematisch engen Google-News-Ausschnitt), Destatis (Publisher + genereller Google-News-Weg, kein Datenset), die Berliner und Brandenburger Gesundheits-/Pflegeverwaltung (nur über die jeweils inaktiven, vorbereiteten Landes-Basispakete denkbar) sowie zweimal das Amt für Statistik Berlin-Brandenburg (nur als Entitäts-Stub ohne Datenzugang).

**3. Wie viele fehlen vollständig?**
**11 von 18** (Nr. 3–11, 14, 17): RKI, BIÖG/BZgA, gematik, G-BA, IQWiG, IQTIG, BfArM, Paul-Ehrlich-Institut, Bundesamt für Soziale Sicherung, LAGeSo Berlin, LAVG Brandenburg. Für keinen dieser Pfade existiert Publisher, Retrieval Path, Parser oder auch nur ein Google-News-Ersatzweg.

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
1. **BMG (Nr. 1 + 2, Aktueller Fachsignalstrom / Gesetze und Verordnungen).** Publisher- und Trust-Eintrag existieren bereits produktiv; ein Direktfeed (`/service/rss-feed`, `/service/gesetze-und-verordnungen`) ist der naheliegendste, risikoärmste nächste Schritt und deckt sofort zwei der 18 Pflichtrollen ab.
2. **gematik (Nr. 5).** Vom Masterpaket selbst als größte Lücke gegenüber der ursprünglichen Fachrecherche benannt („gematik fehlt im vorgeschlagenen Pflichtkern, obwohl digitale Versorgung … ausdrücklich zum Paket gehört"); eindeutige, einzelne Fundstelle (`gematik.de/newsroom`), keine Abhängigkeit von den noch offenen Berlin/Brandenburg-Stop-Gate-Fragen.
3. **IQTIG (Nr. 8).** Muss zuerst validiert werden, weil das Masterpaket hier eine konkrete, aber durch diesen Abgleich nicht bestätigte technische Behauptung trifft („RSS vorhanden, main prüfen"). Diese Diskrepanz sollte in Sprint 2 als Erstes real geprüft werden, bevor auf Basis derselben Quelle weitere Annahmen im Masterpaket ungeprüft übernommen werden.

*(RKI wäre aufgrund der fachlichen Grundbedeutung ein naheliegender vierter Kandidat, wurde aber auf drei beschränkt, wie beauftragt.)*

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
**Ja, in zwei konkreten Punkten, bei einem Punkt Bestätigung statt Abweichung:**
- **Abweichung:** Die im Masterpaket wiederholt vorausgesetzte Wiederverwendbarkeit bestehender **Bundessozialgericht**-Retrieval-Paths aus `arbeit-und-soziales` ist auf `main` **nicht gegeben** — solche Wege existieren nicht.
- **Abweichung:** Der im Masterpaket vermerkte Technik-Status **„RSS vorhanden"** für **IQTIG** ist auf `main` **nicht bestätigt**.
- **Bestätigung (keine Abweichung):** Dass `gesundheit-und-pflege` fachlich entschieden, aber **technisch noch nicht auf `main` angelegt** ist, trifft exakt zu und deckt sich mit der Selbstauskunft des Masterpakets. Ebenfalls bestätigt: Der einzige „versteckte" Bestandsberührungspunkt (BMG-Pflege-Google-News unter `arbeit-und-soziales`) war im Masterpaket nicht benannt, widerspricht ihm aber auch nicht — er ist schlicht bisher nirgends dokumentiert.

**6. Welche Dateien wurden verändert?**
Es wurden **ausschließlich zwei neue Dateien angelegt**, keine bestehende Datei verändert, gelöscht oder verschoben:
- `docs/quellen/gesundheit-und-pflege/bestandsabgleich.md` (dieses Dokument)
- `docs/quellen/gesundheit-und-pflege/bestandsmatrix.csv`

---

## Sprint 1 — Ende

Dieser Abgleich ist abgeschlossen. Es folgen **keine** Live-Abrufe, keine Quellenimplementierung und **kein Sprint 2** in diesem Durchlauf. Weiteres Vorgehen (reale Abrufe, Identitätskonzept, Paketanlage, Aktivierung) erfordert gemäß Masterpaket eine gesonderte Freigabe.
