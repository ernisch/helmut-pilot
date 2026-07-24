# Themenpaket `verkehr-infrastruktur-bund` — technische Vorbereitung (INAKTIV)

> **Status: `prepared` / vollständig INAKTIV.** Kein Abrufweg ist aktiv, das Paket ist nicht
> aktiviert, der Seed ist **nicht auf Production angewendet**. Aktivierung ist ein eigener,
> ausdrücklich freigabepflichtiger Schritt. Stand: 2026-07-24.

Dieses Dokument überführt die Deep-Research-Ausarbeitung *„Quellenarchitektur: Verkehr &
Infrastruktur (Bund)"* in die bestehende relationale Quellenarchitektur (Herausgeber /
politische Entitäten / Abrufwege / Pakete). Die Deep-Research-Vorlage ist die **fachliche
Zielarchitektur**, keine technische Wahrheit — jede Aussage wurde gegen Repository und
Quellenkatalog geprüft.

## 1 · Trennung der Bewertungsebenen (Auftrag §2)

| Ebene | Frage | Ergebnis in diesem Sprint |
|---|---|---|
| **Fachliche Qualität** | Ist die Quelle politisch relevant/primär? | Aus Deep Research übernommen (A/B-Einstufung) |
| **Technische Integrationsreife** | Lässt sie sich sauber ins Modell einordnen? | Ja — 23 Wege + Paket modelliert, `needs_review`/`manual` |
| **Tatsächliche Abrufbarkeit** | Ist der Weg hier live verifizierbar? | **Nein** — Egress gesperrt (siehe §5). Keine fachlich gute Quelle wurde deshalb verworfen. |

## 2 · Datenmodell-Einordnung

Das Paket ist ein **thematisches Bundespaket** (analog zu „Arbeit und Soziales"), kein
Landesmodul und kein Regionalpaket. Es ist **vollständig self-contained** in einem eigenen
Seed — es verändert **keine** bestehende Seed-/Registry-Datei:

- Modell/Daten: `lib/helmut/quellenarchitektur/seeds/verkehr-infrastruktur-bund.js` (reine Daten + reine Helfer)
- Generator: `scripts/generate-verkehr-infrastruktur-seed.js` → idempotentes, nicht-destruktives SQL
- Seed / Rollback: `supabase/seeds/20260724_paket_verkehr_infrastruktur_bund_seed(.rollback).sql`
- Test: `scripts/verkehr-infrastruktur-seed-test.js` (34 Invarianten, im Offline-Gate)

Sicherheits-Invarianten (hart im erzeugten SQL):

- `source_packages.status = 'prepared'` → die Referenzzählung (`computePathRefcounts`) aktiviert das Paket **nicht**.
- `retrieval_paths.status = 'needs_review'`, `activation_mode = 'manual'` → kein Auto-Crawl.
- Jeder Insert `on conflict (…) do nothing` → **rein additiv**, überschreibt keine Bestandszeile; kein `update`/`delete` auf Bestand.

## 3 · Bestandsprüfung & Wiederverwendung (Auftrag §1)

Gesuchte Organisationen und ihr Bestandsstatus (geprüft gegen `entities.js`, `publishers.js`,
Basis-Seed):

| Organisation | Bestand? | Umgang |
|---|---|---|
| Deutscher Bundestag / DIP | **vorhanden** (`parliament-bundestag`, `publisher-bundestag.de`, `publisher-dip.bundestag.de`) | wiederverwendet; **kein** paralleler parlamentarischer Weg |
| Verkehrsausschuss BT | **vorhanden** (`committee-bt-verkehr`) + **Abrufweg `rp-committee-verkehr`** (Bund Basis) | Abrufweg **wiederverwendet** (nur Paket-Link) |
| Bundesrat | **vorhanden** (`parliament-bundesrat`, `publisher-bundesrat.de`) | über Bund Basis abgedeckt; keine Dublette |
| Bundesregierung | **vorhanden** (`government-bund`) | referenziert |
| Destatis | **vorhanden** (`statoffice-destatis`, `publisher-destatis.de`) | **wiederverwendet** (nur thematischer Weg) |
| BDI | **vorhanden** (`association-bdi`, `publisher-bdi.eu`) | **wiederverwendet** |
| BMDV/BMV, DB InfraGO, Autobahn GmbH, EBA, BASt, BAW, GDWS/WSV, BFU, DZSF, DLR, KBA, UBA, BALM(BAG) | **nicht vorhanden** | **neu** angelegt (18 Entitäten, 19 Herausgeber) |

Wiederverwendet: **3 Herausgeber** (Destatis, BDI, Google-News-Aggregator), **6 Entitäten**
(Destatis, BDI, Verkehrsausschuss, Bundestag, Bundesrat, Bundesregierung), **1 Abrufweg**
(`rp-committee-verkehr`). Der Test prüft, dass keine neue Entitäts-ID und keine neue
Herausgeber-Domain mit dem Bestand kollidiert (**0 Dubletten**).

## 4 · Kritische fachliche Prüfungen (Auftrag §3)

- **DB InfraGO:** Modelliert wird **nur dauerhaft Öffentliches** — LuFV-Infrastrukturzustands-
  und -entwicklungsbericht (jährlich) und Integrierter/Geschäftsbericht (jährlich). **Interne**
  Netzzustandsberichte / Aufsichtsratsunterlagen sind nicht dauerhaft öffentlich → **nicht
  modelliert**, als Future Target geführt. DB InfraGO AG entstand 01.01.2024 aus DB Netz + DB
  Station&Service (Aliase gepflegt).
- **BMDV → BMV:** Aktuelle Ministeriumsstruktur berücksichtigt: seit der Regierungsbildung 2025
  heißt das Ressort **Bundesministerium für Verkehr (BMV, `bmv.de`)**; Digitales ist ins BMDS
  ausgegliedert. Modelliert als `ministry-bmv` mit Aliasen **BMDV/BMVI/BMDV**. Keine Dublette
  (kein Bestands-Eintrag; `bmdv.bund.de` stand nur in der Trust-Liste von `sourceSafety.js`).
- **KBA / „Verkehr in Zahlen":** „Verkehr in Zahlen" ist **BMV-Herausgeberschaft** (Bearbeitung
  DLR); KBA war nur Vertrieb. Daher **nicht** dem KBA zugeordnet. Beim KBA stehen nur dessen
  **eigene** Statistiken (Zulassungen/Bestand).
- **Autobahn GmbH:** Für kontinuierliche Beobachtung wird die **laufende Presse-/Bauprogramm-
  Berichterstattung** (ereignisnah) genutzt — **nicht** primär der Nachhaltigkeitsbericht (nur
  jährliche Nebenquelle).
- **BAG / BALM:** Nur die **aktuelle** Behörde **BALM** (Bundesamt für Logistik und Mobilität,
  seit 01.01.2023, `balm.bund.de`); „BAG"/„Bundesamt für Güterverkehr" nur als Aliase → **keine
  doppelte** Modellierung historisch/aktuell.
- **Bundestag:** Der bestehende Weg `rp-committee-verkehr` wird wiederverwendet; **kein**
  paralleler DIP-/Ausschuss-Weg.
- **Destatis:** Mehrere Verkehrs-Reihen über den **einen** bestehenden Herausgeber gebündelt.

## 5 · Retrieval-Kandidaten & Verifikation (Auftrag §4/§5)

**Egress ist in dieser Umgebung gesperrt** (CONNECT 403 auf `bmv.de` **und** `example.com`).
Es ist daher **kein** Weg byte-genau live verifiziert; jeder Weg trägt
`verifikation = "unverifiziert_egress_gesperrt"` und `status = needs_review`. Es werden **keine
Feed-/API-URLs erfunden**: die einzige Methode ist `googlenews_search` (deterministische
`site:`/Themen-Suche über den bestehenden Aggregator) — exakt das Muster, mit dem in Sprint 9B
unverifizierbare Direktfeeds ersetzt wurden. Konkrete Berichts-/Publikationsreihen stehen je
Weg als `publikationsreihe` dokumentiert (Publikationsort), **nicht** als geratener Endpunkt.

### 23 neue Abrufwege (alle `needs_review` / `manual`)

| legacy_source_id | Funktionsklasse | Herausgeber | Belegfunktion | Frequenz | krit. | Empfehlung |
|---|---|---|---|---|---|---|
| vib-bmv-presse | strategische_planung | bmv.de | official_primary | ereignisnah | ✓ | empfohlen |
| vib-bvwp | strategische_planung | bmv.de | official_primary | periodisch | ✓ | empfohlen |
| vib-irp | strategische_planung | bmv.de | official_primary | periodisch | ✓ | empfohlen |
| vib-mid | statistik | mobilitaet-in-deutschland.de | official_primary | periodisch | ✓ | empfohlen |
| vib-db-infrago | schieneninfrastruktur | deutschebahn.com | direct_interest | regelmäßig | – | empfohlen |
| vib-eba | verkehrssicherheit | eba.bund.de | official_primary | regelmäßig | ✓ | empfohlen |
| vib-dzsf | wissenschaft | dzsf.bund.de | data_source | regelmäßig | – | empfohlen |
| vib-autobahn | strasseninfrastruktur | autobahn.de | direct_interest | ereignisnah | – | empfohlen |
| vib-bast | verkehrssicherheit | bast.de | data_source | regelmäßig | – | empfohlen |
| vib-gdws | wasserstrassen | gdws.wsv.bund.de | official_primary | regelmäßig | ✓ | empfohlen |
| vib-baw | wasserstrassen | baw.de | data_source | regelmäßig | – | mit_einschränkung |
| vib-bfu | luftverkehr_sicherheit | bfu-web.de | official_primary | regelmäßig | ✓ | empfohlen |
| vib-destatis-verkehr | statistik | destatis.de *(reuse)* | data_source | regelmäßig | – | empfohlen |
| vib-kba | statistik | kba.de | data_source | regelmäßig | – | empfohlen |
| vib-uba | klima_umwelt | umweltbundesamt.de | data_source | regelmäßig | – | empfohlen |
| vib-balm | strasseninfrastruktur | balm.bund.de | data_source | regelmäßig | – | mit_einschränkung |
| vib-dlr-vf | wissenschaft | dlr.de | data_source | regelmäßig | – | mit_einschränkung |
| vib-diw | wissenschaft | diw.de | data_source | regelmäßig | – | mit_einschränkung |
| vib-vdv | verbaende | vdv.de | direct_interest | ereignisnah | – | mit_einschränkung |
| vib-allianz-pro-schiene | verbaende | allianz-pro-schiene.de | direct_interest | ereignisnah | – | mit_einschränkung |
| vib-adac | verbaende | adac.de | direct_interest | ereignisnah | – | mit_einschränkung |
| vib-staedtetag | verbaende | staedtetag.de | direct_interest | ereignisnah | – | mit_einschränkung |
| vib-bdi | verbaende | bdi.eu *(reuse)* | direct_interest | ereignisnah | – | mit_einschränkung |
| *(reuse)* rp-committee-verkehr | parlament | aggregator-google-news | aggregator | ereignisnah | – | Bestandsweg |

## 6 · Frequenzklassen (Auftrag §6)

- **ereignisnah (7):** laufende Presse-/Nachrichtenbeobachtung ohne festen Takt — BMV-Presse,
  Autobahn GmbH, VDV, Allianz pro Schiene, ADAC, Städtetag, BDI. *(→ `expected_frequency = daily`)*
- **regelmäßig (13):** wiederkehrende Berichte/Statistiken mit festem Takt (monatlich–jährlich)
  — DB InfraGO (IZB jährlich), EBA (Sicherheitsbericht jährlich), DZSF, BASt, GDWS, BAW, BFU
  (Bulletin monatlich), Destatis, KBA (monatlich), UBA, BALM, DLR, DIW. *(→ `monthly`)*
- **periodisch (3):** Langzyklus-Strategiedokumente — BVWP (alle 10–15 J), IRP (~5 J), MiD
  (~5 J). *(→ `multi_year`)*

## 7 · Future Targets & Ausschlüsse

**Future Targets** (bewusst nicht als Abrufweg modelliert): PRINS/`bvwp-projekte.de`
(Projektdatenbank ohne Feed); DB-InfraGO **interne** Zustandsberichte; Bundesfachstelle
Barrierefreiheit; Expertennetzwerk/FIS des BMV; Publikationsplattform der Bundesregierung.

**Ausgeschlossen** (Deep-Research-Begründung): Wikipedia, allgemeine Nachrichtenportale als
eigener Weg, kommerzielle Fachverlage, soziale Medien, „Verkehr in Zahlen" als KBA-Quelle.

## 8 · Offene Risiken (Auftrag §10)

1. **Keine Live-Verifikation** (Egress gesperrt) — vor Aktivierung müssen alle 23 Wege
   byte-genau geprüft werden (`verifyBeforeActivation`).
2. **BVWP-Aktualität** — BVWP 2030 stammt aus 2016; Fortschreibung politisch absehbar, Zeitpunkt offen.
3. **DZSF** jung (2020) — Publikationsdichte noch zu beobachten.
4. **VDV/mitgliederexklusiv** — Teil der VDV-Publikationen evtl. nicht offen.
5. **Google-News-Klumpenrisiko** — viele Wege über einen Aggregator; Rate-Limiting-Risiko (bekannt aus Betrieb, Befund B1).
6. **`googlenews_search` liefert Anrisse** — für Erkennung ausreichend, Volltext teils eingeschränkt (Paywalls bei Medien-Nebenquellen).

## 9 · Integrationsprotokoll (kurz)

| Schritt | Ergebnis |
|---|---|
| Bestand geprüft (Publisher/Entitäten/Wege/Pakete/Seeds) | 51 Herausgeber, 7 Pakete, `committee-bt-verkehr` + `rp-committee-verkehr` vorhanden |
| Egress-Test | `bmv.de` **und** `example.com` → CONNECT 403 (gesperrt) → ehrlich als unverifiziert dokumentiert |
| Modell erstellt | 18 Entitäten, 19 Herausgeber, 23 Wege, 1 Paket (`prepared`), 24 Paketzuordnungen (inkl. 1 Reuse) |
| Wiederverwendung | 3 Herausgeber, 6 Entitäten, 1 Bestandsweg — **0 Dubletten** (Test-verifiziert) |
| Seed generiert | idempotent, additiv (`on conflict do nothing`), Selbstprüfung: 0 aktive Wege, Paket nicht aktiv |
| Tests | eigene Suite 34/34 grün; Offline-Gesamtsuite **141/141 grün**; Bestandssuiten (source-architecture 91/0, landesmodul-seed, profile-packages 62/0) unverändert grün |
| Anwendung auf Production | **NICHT ausgeführt** (freigabepflichtig) |

## 10 · Aktivierung (späterer, freigabepflichtiger Schritt — hier NICHT ausgeführt)

1. Alle 23 Wege byte-genau verifizieren (offener Egress, wie Sprint 9B); ggf. echte
   Feed-Deep-Links statt `googlenews_search` einsetzen.
2. Seed `20260724_paket_verkehr_infrastruktur_bund_seed.sql` anwenden (additiv, idempotent).
3. Wege von `needs_review` → `healthy` und `manual` → `auto` schalten, Paket `prepared` → `active`
   — jeweils nach Verifikation. Rollback: `…_rollback.sql` (guarded, berührt keinen Bestand).
