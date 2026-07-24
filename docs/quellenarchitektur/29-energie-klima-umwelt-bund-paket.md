# Quellenpaket `energie-klima-umwelt-bund` — Vorbereitung (inaktiv)

**Stand:** 2026-07-24 · **Status:** `prepared` (technisch inaktiv, freigabepflichtig) ·
**Sprint-Ziel:** technische Validierung + inaktive Vorbereitung. Keine Aktivierung, kein
Deployment, kein Merge, keine Produktionsänderung, keine Änderung bestehender aktiver Quellen.

Dieses Dokument ist zugleich **fachlich-technische Paketdokumentation**, **Integrationsprotokoll**
und **kompaktes Manifest**. Es soll künftigen Threads genügen, ohne den gesamten
Repository-Bestand erneut lesen zu müssen.

---

## 0. Kompaktes Manifest (für Folge-Threads)

| Feld | Wert |
|---|---|
| Paket-ID / Key | `pkg-energie-klima-umwelt-bund` / `energie-klima-umwelt-bund` |
| Paketstatus | `prepared` · `is_base=false` · `political_level=bund` · `geo-bund` |
| Neue Abrufwege | **9** (alle `status=needs_review`, `activation_mode=manual`) |
| Neue Herausgeber | **8** (Destatis wiederverwendet) |
| Neue Entitäten | **8** (Destatis-Entität wiederverwendet) |
| Tier-Verteilung | **Tier 1 = 5 · Tier 2 = 3 · Tier 3 = 1** |
| Frequenz | regelmäßig = 4 · periodisch = 4 · ereignisnah = 1 |
| Technisch verifiziert | **0** (Egress in der Vorbereitungsumgebung gesperrt) |
| Aktive Wege | **0** (vollständig inaktiv) |
| Code-Seed | `lib/helmut/quellenarchitektur/seeds/energie-klima-umwelt-bund.js` |
| Generator | `scripts/generate-energie-klima-umwelt-seed.js` |
| SQL-Seed / Rollback | `supabase/seeds/20260724_energie_klima_umwelt_bund_seed(.rollback).sql` |
| Test | `scripts/energie-klima-umwelt-seed-test.js` (offline, auto-collected) |
| Voraussetzung | `20260713_source_architecture.sql` + `_seed.sql` angewendet (Tabellen, `geo-bund`, `publisher-destatis.de`, `statoffice-destatis`) |

**Bewusst NICHT angelegt (Bestand deckt ab):** Bundestagsausschüsse Energie/Klima
(`rp-committee-wirtschaft`, `rp-committee-klima-umwelt` — aktiv in `pkg-bund-basis`),
parlamentarische Dokumente aller Themen (`rp-dip` — aktiv/always_on in `pkg-bund-basis`),
Bundesregierung/Bundestag/Bundesrat-PM (Bestandswege).

---

## 1. Aktuelle Ressortstruktur (verbindlich korrigiert)

Die Deep-Research-Vorlage ist auf beiden Ressorts **veraltet** und bei Umwelt zusätzlich
**vertauscht**. Grundlage ist die Struktur der laufenden Wahlperiode (Kabinett Merz, Org-Erlass
06.05.2025; WebSearch-belegt 2026):

| Aktueller Name (Kürzel) | Historische Namen (Aliase) | Wiederverwendete ID | Domainstrategie |
|---|---|---|---|
| **Bundesministerium für Wirtschaft und Energie (BMWE)** — Min. Reiche | BMWK (Wirtschaft und Klimaschutz, 2021–2025), BMWi (bis 2021) | neue Entität `ministry-bmwe` | `bundeswirtschaftsministerium.de` (namensneutral → keine historische Domain-Dublette) |
| **Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit (BMUKN)** — Min. Schneider | BMUV (…Verbraucherschutz, 2021–2025), BMU (bis 2021) | neue Entität `ministry-bmukn` | `bundesumweltministerium.de` (namensneutral) |

**Kernkorrektur:** Klimaschutz wanderte 2025 aus dem Wirtschaftsressort (ex-BMWK) in das
Umweltressort (**BMUKN** — „Klimaschutz aus einer Hand"). Die Vorlage nennt fälschlich „BMWK"
für Wirtschaft und behauptet „BMUKN sei veraltet, BMUV aktuell" — genau umgekehrt. BMUKN ist der
**aktuelle** Name.

**Aliasstrategie:** Es wird je Ressort **genau eine** Entität geführt; alle historischen
Kürzel/Langnamen (BMWK/BMWi bzw. BMUV/BMU) stehen ausschließlich im `aliases[]`-Feld. Keine
separate BMWK-/BMWi-/BMUV-/BMU-Entität — keine historische Behörden-Dublette. Da beide Ressorts
namensneutrale Kanonik-Domains haben, entsteht auch keine Domain-Dublette über die Umbenennungen
hinweg. Vor Anlegen wurde geprüft, dass im Bestand keine dieser Institutionen (unter historischem
Namen) existiert (nur Destatis existierte bereits → wiederverwendet).

---

## 2. Bestandsprüfung (was existiert, was wird wiederverwendet)

Gesucht (Publisher / Entitäten / Retrieval Paths / Seeds / Aliase): BMWE, BMWK, BMWi, BMUKN,
BMUV, BMU, Bundesnetzagentur, Umweltbundesamt, Expertenrat, Sachverständigenrat, Destatis,
Bundestag, Bundesrat, BAFA, BASE, BGE, BfN, dena, Agora, Fraunhofer ISE, UFZ, KfW,
Wasserstoffrat, 50Hertz, Amprion, TenneT, TransnetBW, SMARD.

**Im Bestand vorhanden → wiederverwendet:**

- `statoffice-destatis` (Entität) + `publisher-destatis.de` (Herausgeber) — Destatis.
  Wiederverwendet; **nicht** neu angelegt. Der bestehende Destatis-Weg
  `rp-news-destatis-soziales` ist **sozialpolitisch** gescopt → keine Überschneidung mit dem
  neuen, energetisch/umweltbezogen gescopten `rp-destatis-energie-umwelt`.
- `parliament-bundestag`, `parliament-bundesrat`, `government-bund` (+ Publisher) — vorhanden.
- `committee-bt-wirtschaft` („Ausschuss für Wirtschaft und Energie") und `committee-bt-klima-umwelt`
  („Ausschuss für Klima und Umwelt") — Entitäten vorhanden; deren **aktive** Suchwege
  `rp-committee-wirtschaft` / `rp-committee-klima-umwelt` laufen in `pkg-bund-basis`.
- `rp-dip` (DIP-API `search.dip.bundestag.de/api/v1`) — aktiv/always_on in `pkg-bund-basis`,
  deckt Drucksachen/Anträge/Gesetzentwürfe **aller** Themen ab (inkl. Energie/Klima/Umwelt).

**Alle übrigen Energie-/Klima-/Umwelt-Institutionen fehlten** und wurden — soweit tatsächlich
empfohlen — neu angelegt. Die BASE/BGE/UFZ-„Treffer" der Textsuche waren Fehltreffer
(`is_base`, „abgeleitet", „aufzeigen").

---

## 3. Empfohlene Retrieval-Kandidaten (das Paket)

Alle Wege: `method=googlenews_search` (site-gescopte, thematisch **distinkte** Primärquellen-Suche
je Domain — keine erfundenen Ziel-Feeds/APIs). Unter gesperrtem Egress ist das der ehrliche,
nicht-erfindende Weg; er entspricht dem Bestandsmuster für institutionelle Quellen (OECD/Destatis
im Basis-Seed). Die bei Aktivierung zu bevorzugende native Methode (z. B. SiteGlobals-RSS der
Bundesressorts) steht je Weg in `preferredMethodAtActivation` und ist **byte-genau zu fixieren**.

| Tier | Weg (ID) | Entität / Herausgeber | Publikationsort | Zweck | Frequenz |
|---|---|---|---|---|---|
| 1 | `rp-bmwe` | BMWE / `bundeswirtschaftsministerium.de` | PM/Publikationen, Monitoring der Energiewende, Energiedaten | Zentrales Energie-/Wirtschaftsressort, Rahmensetzung/Förderpolitik | regelmäßig |
| 1 | `rp-bmukn` | BMUKN / `bundesumweltministerium.de` | PM/Meldungen: Klima, Kreislaufwirtschaft, Natur, nukl. Sicherheit | Zentrales Umwelt-/Klimaressort | regelmäßig |
| 1 | `rp-bnetza-monitoring` | BNetzA / `bundesnetzagentur.de` | Monitoringberichte Strom/Gas, Marktbeobachtung, Netzausbau | Regulierungs-/Markttransparenzbehörde (gesetzl. Monitoringpflicht) | regelmäßig |
| 1 | `rp-umweltbundesamt` | UBA / `umweltbundesamt.de` | THG-Emissionsdaten/-Projektionen, Klimabilanz, Luft | Wissenschaftliche Umweltbehörde, Emissionsdatenbasis | regelmäßig |
| 1 | `rp-expertenrat-klima` | Expertenrat / `expertenrat-klima.de` | Prüfbericht Emissionsdaten (jährl.), Zweijahresgutachten | Unabhängige gesetzliche Klima-Prüfinstanz (KSG) | periodisch |
| 2 | `rp-sru-umweltgutachten` | SRU / `umweltrat.de` | Umweltgutachten (alle 2 Jahre), Sondergutachten | Unabhängiges Umweltberatungsgremium (breit) | periodisch |
| 2 | `rp-uenb-netzentwicklungsplan` | ÜNB-Verbund / `netzentwicklungsplan.de` | NEP Strom + Szenariorahmen (gemeinsame ÜNB-Plattform) | Netzausbau-/Systemplanung Übertragungsnetz | periodisch |
| 2 | `rp-destatis-energie-umwelt` | Destatis *(reuse)* / `destatis.de` | Energiebilanzen, Umweltökon. Gesamtrechnungen, Abfallstatistik | Amtliche Energie-/Umwelt-/Abfallstatistik | periodisch |
| 3 | `rp-bafa-foerderung` | BAFA / `bafa.de` | BEG/Energieeffizienz-Förderprogramme, Programmänderungen | Förderabwicklung; ereignisnahe Programmänderungen | ereignisnah |

**Begründung eigenständiger Wege & Überschneidungen** sind je Kandidat im Code-Seed
(`KANDIDATEN[].zweck` / `.ueberschneidung`) dokumentiert. Kernpunkte:

- **BNetzA gebündelt:** Monitoring + Versorgungssicherheit + Netzausbau + Marktbeobachtung teilen
  Publikationsort/Aktualisierungslogik → **ein** Weg, nicht je Unterfunktion einer.
- **SMARD** ist eine **strukturierte Datenplattform** der BNetzA → **Future Target / eigener
  Datentyp**, nicht als redaktioneller Publikationsweg modelliert.
- **Vier ÜNB → gebündelt:** der gemeinsame `netzentwicklungsplan.de` (50Hertz/Amprion/TenneT/
  TransnetBW) deckt den bundespolitischen Netzausbau-/Systembedarf besser und günstiger ab als
  vier gleichrangige Einzelwege. Einzelne Unternehmens-Newsrooms → Future Target (nur bei klarem
  regionalem Zusatznutzen).
- **Expertenrat ≠ SRU:** Expertenrat prüft eng die Klimapolitik (KSG); SRU berät breit zur
  Umweltpolitik. Keine funktionale Dublette; unterschiedliche Frequenz (Tier 1 vs. Tier 2).
- **UBA erhebt, Expertenrat bewertet:** thematische Nähe bei Emissionen, aber verschiedene Rollen.
- **BAFA statt Einzelprogramme; KfW nicht separat** (Future Target) — ein zentraler Förderweg genügt.
- **Bundestag/DIP:** keine parallelen Energie-/Umwelt-Ausschuss- oder DIP-Suchwege — Bestand deckt ab.

---

## 4. Future Targets & Ausschlüsse (dokumentiert, nicht angelegt)

**Future Targets** (`FUTURE_TARGETS` im Code-Seed): SMARD (Datenplattform), Nationaler
Wasserstoffrat, BASE (Aufsicht nukl. Entsorgung), BGE (operative Endlagerung), KfW-Förderinfos,
BfN (Naturschutz/Biodiversität), Agora/dena/Fraunhofer ISE/UFZ (Think-Tanks/Forschung — keine
hoheitlichen Primärquellen, Google-News-Abhängigkeit + Überschneidung → Vermeidung der
Think-Tank-Vervielfachung), einzelne ÜNB-Newsrooms.

**Ausgeschlossen** (`AUSGESCHLOSSEN`): Verteilnetzbetreiber (~900), Einzelförderprogramm-Seiten,
tagesaktuelle Medien/NGO-Berichte, parallele Ausschuss-/DIP-Suchen.

**BASE vs. BGE** sauber getrennt: BASE = Aufsicht/Regulierung, BGE = operative Endlagerung/
Standortauswahl. Beide erhalten **Future-Target**-Status (nischig/ereignisbezogen), kein Kernbestand.

---

## 5. Verifikationsstatus (transparente Egress-Grenze)

In der Vorbereitungsumgebung ist ausgehender HTTP-Egress zu externen Behörden-Hosts **per Policy
gesperrt** (403 CONNECT, z. B. `www.bmwk.de`; Proxy-Status bestätigt `connect_rejected`).

**Nicht prüfbar (steht aus):** HTTP-Status, Redirect-Ziel, finale Domain, Content-Type,
Aktualität, dauerhafte Publikationsstruktur, Feed/strukturierte Daten, Paywall, Bot-Schutz,
JS-Abhängigkeit, Volltext-vs-Anriss.

**Nur vorläufig (WebSearch-gestützt, 2026):** aktuelle Ressortnamen/-domains (BMWE/BMUKN),
BNetzA-Monitoringbericht-Publikationsort, gemeinsame ÜNB-NEP-Plattform, Expertenrat-Prüfbericht.
**WebSearch ersetzt keine byte-genaue Verifikation.**

**Vor Aktivierung zwingend:** je Weg byte-genaue Prüfung von Endpunkt/Feedstruktur/Bot-Schutz/
Paywall; native Methode (`preferredMethodAtActivation`) statt Google-News-Ersatz fixieren, wo
verfügbar; WP-/Programmnummern und exakte Feed-Pfade festschreiben. Alle Wege tragen
`verifyBeforeActivation=true`; das DB-Modell hat **kein** eigenes `verify_before_activation`-Feld —
die äquivalente Garantie liefert `status=needs_review` + `activation_mode=manual`.

---

## 6. Integrationsprotokoll

- **Datenmodell:** keine Migration nötig — Tabellen aus `20260713_source_architecture.sql`
  wiederverwendet (publishers/political_entities/retrieval_paths/source_packages/package_paths/
  path_expected_levels/path_expected_geographies).
- **Keine Änderung bestehender aktiver Quellen:** der Seed fasst ausschließlich neue IDs an;
  `publisher-destatis.de` / `statoffice-destatis` werden **nur referenziert** (nicht eingefügt).
- **Keine Registry-/Generator-/Workflow-Refactorings:** `packages.js` (`PACKAGE_DEFINITIONS`)
  wurde **bewusst nicht** verändert; das Paket lebt allein im additiven Seed und ist damit nicht
  in aktiven Registrierungspfaden. (Eine spätere Aktivierung würde es dort eintragen.)
- **Idempotenz:** alle Inserts `ON CONFLICT … DO NOTHING`, keine `DO UPDATE` → kein ungewollter
  Bestands-Update; transaktional (`begin/commit`) + `notify pgrst`.
- **Rollback:** `…_rollback.sql` — Kinder vor Eltern; Paket/Herausgeber/Entitäten **guarded**
  (`not exists`) → geteilte Bestandszeilen (z. B. Destatis) bleiben unangetastet.
- **Determinismus:** zweifacher Generatorlauf ergibt identisches SQL (im Test geprüft).

---

## 7. Tests & Audit

`node scripts/energie-klima-umwelt-seed-test.js` (auch via `run-offline-tests.js`, offline,
auto-collected) prüft u. a.: Paket `prepared`; 9 Wege `needs_review`+`manual`; 0 aktive/0
verifizierte Wege; method-CHECK-Konformität; keine ID-/Domain-Kollision mit dem Basis-Seed; keine
historische Behörden-Dublette (BMWE⊇BMWK/BMWi, BMUKN⊇BMUV/BMU); Destatis-Reuse; SMARD als Future
Target; genau ein gebündelter ÜNB-Weg; keine Think-Tank-/Ausschuss-/DIP-/KfW-Wege; Tier 5/3/1;
gültige Frequenzklassen; idempotentes, guarded, korrekt geordnetes Rollback.

**Ergebnis:** neue Suite grün; **gesamte Offline-Suite 141/141 grün** (der neue Test
eingeschlossen; `pardok-shadow-test.js`-NETZ-GUARD-Hinweis ist vorbestehend und unabhängig).

---

## 8. Verbleibende Risiken vor Aktivierung

1. **Keine byte-genaue Verifikation** (Egress gesperrt) — alle URLs/Feeds/Paywall-/Bot-Zustände
   sind vor Aktivierung real zu prüfen; Ministerien haben i. d. R. native SiteGlobals-RSS, deren
   exakte Pfade noch zu fixieren sind (Google-News-Ersatz ist nur der inaktive Platzhalter).
2. **Domain-/Namensdrift:** BMWE/BMUKN sind frisch umbenannt (2025); kanonische Domains gelten als
   namensneutral, sind aber vor Aktivierung zu bestätigen.
3. **ÜNB-Bündelung** könnte regionale Ausbau-/Projektkommunikation untergewichten — bei Bedarf
   gezielt Einzel-Newsroom als Zusatzweg (dokumentierter Future Target).
4. **Signal-Rausch** der Google-News-Ersatzwege vor Aktivierung gegen native Feeds abwägen.
5. **Aktivierung selbst** (Paket → `active`, Wege → geprüfter Status/`auto`, ggf. Eintrag in
   `PACKAGE_DEFINITIONS`) bleibt ein separater, ausdrücklich freigabepflichtiger Schritt.
