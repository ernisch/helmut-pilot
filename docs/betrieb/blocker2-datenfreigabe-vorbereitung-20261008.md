# Blocker 2: konkrete Datenfreigabevorbereitung

**Historische Freigabevorlage.** Maßnahme A wurde anschließend konkret freigegeben, am 08.10.2026 exakt mit dem unten bezeichneten SHA256 angewendet und vollständig nachkontrolliert; siehe [Ausführung und 500er Bindungsfortschritt](blocker2-massnahme-a-nachkontrolle-20261008.md). B bleibt nicht freigegeben/nicht angewendet, C gesperrt. Alte Vorherbedingungen und B-Transaktionshash dürfen nach A nicht unbesehen weiterverwendet werden. Keine erneute A-Ausführung aus diesem Dokument ableiten. Fachliche Abnahme weiterhin **0/500**.

## A: Mindestmaßnahme, exakt vier neue Datensätze

Zwei bereits vorhandene amtliche Originalquellen haben keine notwendige KO-/Quellenbindung. Native vollständige Bestandsprüfungen und alternative KO-Suche belegen diese Lücke. Die vier INSERTs betreffen zwei neue vollständige KO-Zeilen und zwei neue Quellenkanten; keine bestehenden Zeilen werden geändert.

**Vorbereitete Transaktion:** `b2-four-row-exact-atomic-transaction-NOT-APPROVED.sql`, SHA256 `c3c1b8075ff5adf9ff43b6b05df980e1a8ff146b007d6abcc88706a6c83ce1cd`. Vollständiger exakter Payload: private Datei `b2-minimal-four-row-data-permission-plan.json`, SHA256 `fe8b3d87db54e27806ec60cc82ec0e01558dde84dc2e39a2d63b79044bff5bd2`. Native vollständige Nachher-Zeilenhashes unten; kein ungebundener Freitext-INSERT.

Unabhängige Prüfung PASS für dieses begrenzte Vorhaben. SQL-/PLpgSQL-Parser und native rein lesende Typprüfung bestanden. **Kein ausgeführter Transaktions-, Trigger- oder Konkurrenztest in Production.** Bestehende Trigger wurden nur gelesen: die neue NULL-`verstehen_fencing`-Zeile benötigt keine CAS-Umgehung und schreibt keine Reservierung. Keine veränderte Session-Fencing-Einstellung.

### A1. `public.knowledge_objects` — `ko-vg-sorgeberechtigte-20261003-b35a5a`

- **Vorher:** diese ID und dieser `vorgang_id` fehlen; keine passende Reservierung oder Quellenkante. Vor jedem Schreiben erneut vollständig prüfen.
- **Nachher:** genau die vollständige 61-Felder-Zeile des gebundenen Payloads. Wesentliche Felder: `vorgang_id=vg-sorgeberechtigte-20261003-b35a5a`, `ko_version=1`, `decision_level=political_level=land`, `source_document_count=1`, `verstehen_fencing=NULL`, keine erfundenen persönlichen Pflichten, Modelltokens NULL. Lokales deterministisches Embedding, kein Modellaufruf. Titel: „Berlin: Schulanmeldung vom 5. bis 16. Oktober 2026“.
- **Fachlicher Inhalt:** Vom 5. bis 16. Oktober 2026 melden Eltern und Sorgeberechtigte ihre Kinder, die zwischen dem 1. Oktober 2020 und dem 30. September 2021 geboren wurden und damit zum Schuljahr 2027/28 schulpflichtig werden, an der zuständigen Grundschule an. Es wird empfohlen, das Kind zur Anmeldung mitzubringen.
- **Grund / Wirkung:** notwendig für mindestens 30 BE/Bildung-Profile. Ein vorhandener amtlicher Quellenbeleg kann danach mit einem ausdrücklichen KO und tatsächlicher Quellenkante gelesen werden. Keine automatische Sichtbarkeit, Rangpriorität, persönliche Verpflichtung oder vollständige Profilabnahme versprochen.
- **Original:** https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1720815.php; veröffentlicht 02.10.2026. Anmeldephase 05.–16.10., Schuljahr 2027/28.
- **Quelle vor Schreiben:** `raw_documents.id=rd-65e95b8ffad2e60d3794ce6a3d9bdac81479e7e1bf30a45b4687b33d4e3d49ad`, `xmin=475965`, native vollständige Zeilen-SHA256 `41ef3918513ad468bf50ded474b373dbead989bab247f747d9e223ac4bc76269`, bisher null KO-Kanten. Dazu beide Ziel-IDs/Vorgänge/Reservierungen abwesend, vollständiger 52-Tabellen-Vorhervergleich unverändert und Schema/Trigger/Commit/READY/Berliner Tag/Ereignisgültigkeit frisch geprüft. Jede Abweichung stoppt vor dem ersten INSERT.
- **Erwarteter vollständiger native Nachherhash:** `a7c1d7465e7a96d243417bfca3a98f3bddc2664420c3ad7e154523e7950488ce`.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige Zeile einschließlich nativem Hash/xmin, genau eine richtige Quellenkante, unveränderte Originalquelle; fachlicher Ereignis-/Ebene-/Zeitvergleich. Alle alten Zeilen und Profile unverändert; Gesamtzuwachs exakt zwei KOs und zwei Kanten über die gesamte Transaktion.
- **Risiko:** neue globale KO-Zeile wird von bestehenden Lesern berücksichtigt; keine positive Ranking-/Frischewirkung garantiert. Ankündigung darf nicht zu stattgefundenem Ereignis oder persönlicher Pflicht werden. SHARE-Locks auf 52 Tabellen erlauben Leser, können Schreiber kurz warten lassen; 2s Lock-Erwerbtimeout, 25s Statementtimeout, 60s Idle-Timeout. Keine Änderung der globalen Konfiguration.
- **Rückweg:** nur mit neuer konkreter Freigabe. Nach exaktem aktuellen Nachherhash/xmin, unveränderter Quelle/Kante und Null neuer abhängiger Referenzen zuerst die zugehörige neue Kante, dann ausschließlich diesen neuen KO atomar löschen. Kein automatischer Rückweg; bei neuen Referenzen stoppen.

### A2. `public.knowledge_objects` — `ko-vg-b2-infrastruktur-neb-20261008-17`

- **Vorher:** diese ID und dieser `vorgang_id` fehlen; keine passende Reservierung oder Quellenkante. Vor jedem Schreiben erneut vollständig prüfen.
- **Nachher:** genau die vollständige 61-Felder-Zeile des gebundenen Payloads. Wesentliche Felder: `vorgang_id=vg-b2-infrastruktur-neb-20261008-17`, `ko_version=1`, `decision_level=political_level=land`, `source_document_count=1`, `verstehen_fencing=NULL`, keine erfundenen persönlichen Pflichten, Modelltokens NULL. Lokales deterministisches Embedding, kein Modellaufruf. Titel: „Brandenburg: angekündigtes Fachgespräch zur Niederbarnimer Eisenbahn am 8. Oktober“.
- **Fachlicher Inhalt:** Die Wochenmeldung des Landtags Brandenburg kündigt für den 8. Oktober 2026 um 13:00 Uhr die 17. öffentliche Sitzung des Ausschusses für Infrastruktur und Landesplanung in Raum 1.050 an. Genannt wird ein Fachgespräch zur betrieblichen Situation und Weiterentwicklung der Niederbarnimer Eisenbahn. Eine Durchführung oder ein Beschluss ist damit nicht belegt.
- **Grund / Wirkung:** notwendig für mindestens 12 BB/Verkehr-Profile. Ein vorhandener amtlicher Quellenbeleg kann danach mit einem ausdrücklichen KO und tatsächlicher Quellenkante gelesen werden. Keine automatische Sichtbarkeit, Rangpriorität, persönliche Verpflichtung oder vollständige Profilabnahme versprochen.
- **Original:** https://www.landtag.brandenburg.de/de/meldungen/termine_des_landtages_brandenburg_in_der_zeit_vom_2._bis_9._oktober_2026/50253; veröffentlicht 02.10.2026. Amtliche Kalenderankündigung, Sitzung 08.10., 13:00 CEST; eine Durchführung oder ein Beschluss ist nicht belegt. Die gespeicherte erste Passage wird nicht als vollständiger Sitzungstext ausgegeben; separat gesicherter vollständiger Originaltext ist ausdrücklich editorialer Beleg.
- **Quelle vor Schreiben:** `raw_documents.id=rd-5fe9253cea9bfbe2ab29221ee9a713eb235fe2547f532a2874494c8edd44126b`, `xmin=475965`, native vollständige Zeilen-SHA256 `566404989ea4e4d3ea60d798a58ebce16d5d937e288c4c767d2e8a138ad5572f`, bisher null KO-Kanten. Dazu beide Ziel-IDs/Vorgänge/Reservierungen abwesend, vollständiger 52-Tabellen-Vorhervergleich unverändert und Schema/Trigger/Commit/READY/Berliner Tag/Ereignisgültigkeit frisch geprüft. Jede Abweichung stoppt vor dem ersten INSERT.
- **Erwarteter vollständiger native Nachherhash:** `bd0a167d6dd3c992bb2ef1634443cc950f8e7204135ada93dd8fb06060960d77`.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige Zeile einschließlich nativem Hash/xmin, genau eine richtige Quellenkante, unveränderte Originalquelle; fachlicher Ereignis-/Ebene-/Zeitvergleich. Alle alten Zeilen und Profile unverändert; Gesamtzuwachs exakt zwei KOs und zwei Kanten über die gesamte Transaktion.
- **Risiko:** neue globale KO-Zeile wird von bestehenden Lesern berücksichtigt; keine positive Ranking-/Frischewirkung garantiert. Ankündigung darf nicht zu stattgefundenem Ereignis oder persönlicher Pflicht werden. SHARE-Locks auf 52 Tabellen erlauben Leser, können Schreiber kurz warten lassen; 2s Lock-Erwerbtimeout, 25s Statementtimeout, 60s Idle-Timeout. Keine Änderung der globalen Konfiguration.
- **Rückweg:** nur mit neuer konkreter Freigabe. Nach exaktem aktuellen Nachherhash/xmin, unveränderter Quelle/Kante und Null neuer abhängiger Referenzen zuerst die zugehörige neue Kante, dann ausschließlich diesen neuen KO atomar löschen. Kein automatischer Rückweg; bei neuen Referenzen stoppen.

### A3. `public.ko_document_links` — eindeutiger zusammengesetzter Schlüssel

`knowledge_object_id=ko-vg-sorgeberechtigte-20261003-b35a5a`  
`raw_document_id=rd-65e95b8ffad2e60d3794ce6a3d9bdac81479e7e1bf30a45b4687b33d4e3d49ad`

- **Vorher:** genau diese Kante fehlt.
- **Nachher:** genau diese beiden IDs und `created_at=2026-10-08T01:41:59.186Z`; keine weitere Feldänderung.
- **Grund / Original / Wirkung:** tatsächliche Originalquellenbindung des unter A1 beschriebenen Ereignisses; derselbe dort genannte amtliche Originalbeleg. Keine Kante zu einem anderen Vorgang und kein Zusammenlegen fremder Ereignisse.
- **Schutz vor Schreiben:** vollständige Zeilenhashes/xmin der unveränderten Rohquelle wie unter A1, Ziel-KO als exakt neu vorbereitete Zeile, Kante abwesend, Reservierungsabwesenheit und kompletter 52-Vorherstand; atomar mit A1–A4. Kein Teil-INSERT.
- **Erwarteter vollständiger native Nachherhash:** `5b9e295b2c46553a4ec975d7f6322e1aae2aa3994b3d20462604a3930d9562de`.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige neue Kante, richtiger KO/Vorgang/Quelle und genau eine Kante je neuem KO; sämtliche anderen Kanten und Rohquellen unverändert.
- **Risiko:** falsche Zuordnung würde Quellenprovenienz verfälschen; die genauen IDs und Postimagehashes schließen eine freihändige Zuordnung aus.
- **Rückweg:** nur mit neuer konkreter Freigabe, exaktem Nachherhash/xmin und unveränderten Endpunkten diese eine Kante löschen, atomar mit dem zugehörigen neuen KO wie unter A1.

### A4. `public.ko_document_links` — eindeutiger zusammengesetzter Schlüssel

`knowledge_object_id=ko-vg-b2-infrastruktur-neb-20261008-17`  
`raw_document_id=rd-5fe9253cea9bfbe2ab29221ee9a713eb235fe2547f532a2874494c8edd44126b`

- **Vorher:** genau diese Kante fehlt.
- **Nachher:** genau diese beiden IDs und `created_at=2026-10-08T01:41:59.186Z`; keine weitere Feldänderung.
- **Grund / Original / Wirkung:** tatsächliche Originalquellenbindung des unter A2 beschriebenen Ereignisses; derselbe dort genannte amtliche Originalbeleg. Keine Kante zu einem anderen Vorgang und kein Zusammenlegen fremder Ereignisse.
- **Schutz vor Schreiben:** vollständige Zeilenhashes/xmin der unveränderten Rohquelle wie unter A2, Ziel-KO als exakt neu vorbereitete Zeile, Kante abwesend, Reservierungsabwesenheit und kompletter 52-Vorherstand; atomar mit A1–A4. Kein Teil-INSERT.
- **Erwarteter vollständiger native Nachherhash:** `49876bf150582ee8c962c95860b300dfca875161918f9f46d3d158102198911c`.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige neue Kante, richtiger KO/Vorgang/Quelle und genau eine Kante je neuem KO; sämtliche anderen Kanten und Rohquellen unverändert.
- **Risiko:** falsche Zuordnung würde Quellenprovenienz verfälschen; die genauen IDs und Postimagehashes schließen eine freihändige Zuordnung aus.
- **Rückweg:** nur mit neuer konkreter Freigabe, exaktem Nachherhash/xmin und unveränderten Endpunkten diese eine Kante löschen, atomar mit dem zugehörigen neuen KO wie unter A2.

### Gemeinsame Schutzbedingungen A

Exakt vier neue Datensätze: zwei KOs, zwei Quellenkanten. Null bestehende Updates, null Rohquellenkorrekturen, null Profile, null Aktivierungen, null Reservierungs-/Kontrolltabellenänderungen, null Modelle. Keine weitere der übrigen 36 DIP-Korrekturen. SERIALIZABLE-Transaktion; alle Vorherbedingungen werden vor dem ersten Schreiben geprüft. Abweichung: vollständiger Stop und Rollback der nicht committeten Transaktion, kein teilweise angewendetes Ergebnis. Nach Commit sämtliche vier vollständigen Zeilen und alle 52 Tabellen zurücklesen; alte Vollzeilen einschließlich xmin identisch. Unerwarteter Nachkontrollbefund: stoppen, keine automatische Rücksetzung.

Die Genehmigung müsste **dieses Vier-INSERT-Vorhaben und diesen SHA256** konkret benennen. Andere Datenaktionen sind nicht eingeschlossen. Bei anderem Tag, Ereignisgültigkeit, Datenstand oder Schema zuerst neu vorbereiten und unabhängig prüfen; kein stilles Umschreiben eines genehmigten Payloads. Eine spätere aktuelle 500er Aufnahme und deren fachliche Abnahme bleiben eigene Prüfschritte.

## B: zusätzlich fünf bestehende Zeilenkorrekturen, separat

Diese fünf Wirkungen sind fachlich begründet, aber **nicht Bestandteil der vier INSERTs** und nicht freigegeben. Eigene vorbereitete atomare Transaktion: `b2-additional-five-exact-atomic-transaction-NOT-APPROVED.sql`, SHA256 `d2c267f8c1d2ac359cde64364de0c53d1ef1a9d972965e590d737d42751988c1`. Drei KO-UPDATEs und zwei Quellenkanten-DELETEs; kein KO-DELETE, keine neue Quelle, kein Profil oder Modell. Vollständige native Vorher-/Nachherzeilen liegen in den unten genannten privaten Payloads.

Die Transaktionen A und B sind an denselben bisherigen unveränderten Datenstand gebunden. Die Ausführung einer davon würde die Vollstandsschutzbedingung der anderen verändern. Sie dürfen **nicht unbesehen nacheinander** angewendet werden; danach frischen konkreten Plan mit neuem Hash und unabhängiger Prüfung erstellen. Kein stiller Wechsel zu einer neun- oder dreizehnzeiligen Gesamtaktion.

### B1. `public.knowledge_objects` — `ko-vg-neuzulassungen-20260922-760ba1`

| Feld | Vorher | Nachher |
| --- | --- | --- |
| `ko_version` | `1` | `2` |
| `updated_at` | `"2026-09-24T10:40:00.868+00:00"` | `"2026-10-08T02:12:00+00:00"` |
| `best_source_url` | `"https://www.deutschlandfunk.de/wirtschaftsforschungsinstitute-verdoppeln-ihre-wachstumsprognose-100.html"` | `"https://www.deutschlandfunk.de/anteil-von-e-autos-bei-neuzulassungen-in-eu-erreicht-rekord-100.html"` |
| `related_entities` | `[{"name":"Wirtschaftsforschungsinstitute","type":"organization","entity_id":null,"confidence":"low"}]` | `[]` |
| `source_document_count` | `3` | `2` |
| `mentioned_organizations` | `["Wirtschaftsforschungsinstitute"]` | `[]` |

- **Grund / Original:** Der GDP-Konjunkturbeleg betrifft nicht den EU-Zulassungsbericht; gültige E-Auto-Quellen bleiben erhalten, nur fremde Institutsreferenzen werden entfernt. Originalbeleg: https://www.deutschlandfunk.de/anteil-von-e-autos-bei-neuzulassungen-in-eu-erreicht-rekord-100.html. Diese Bestandsartikel sind keine amtlichen DIP-Originale; für die Senatsverwaltung ist der Behördenoriginalbeleg maßgeblich, für die beiden Nachrichtenereignisse die tatsächliche veröffentlichte Originalmeldung. Keine amtliche Herkunft erfunden.
- **Schutz vor Schreiben:** vollständige KO-Vorherzeile `xmin=470599`, native SHA256 `1039d5a59815db4319d47d05b48c62a5a9fb5017b99e83697f86ab0dd7162a88`; sämtliche vorhandenen KO-Kanten und Rohquellen per Vollzeile/xmin; abgeschlossene Reservierung samt Vollhash/xmin und unverändertem historischem fencing/resultfencing; vollständiger 52-Vorherstand identisch, aktueller Commit/READY/Tag/Schema/Trigger geprüft.
- **Erwarteter vollständiger native Nachherhash:** `d2fcf8a0ad3475ff0135b8df5013fe95d91b4608caf1746cf2bbb083963bab20`. Alle nicht oben genannten KO-Felder einschließlich Embedding, Modellherkunft und `verstehen_fencing` bleiben unverändert.
- **Wirkung:** korrekte Ebenen-/Primärquellen-/Quellenanzahlmetadaten für spätere Leser. `updated_at` ist Korrekturzeit, keine neue Veröffentlichung. Keine KO- oder Eingabeannahme allein durch diese Änderung.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige KO-Zeile gegen Postimagehash und Originalbelege, tatsächliche verbleibende Quellenkanten; sämtliche Rohquellen, abgeschlossenen Reservierungen und anderen 52-Tabellenzeilen einschließlich aller Profile unverändert.
- **Risiko:** globale bestehende Leser sind betroffen. Historische abgeschlossene Verstehen-Reservierungen bleiben bestehen; ein Wiederabspielen alter Quellensets im unveränderten Blocker1-Motor könnte eine entfernte Kante erneut anlegen. Diese Metadatenkorrektur ist kein Beleg dauerhafter Motorprävention. Keine Änderung oder Umgehung des B1-Motors.
- **Rückweg:** nur neue konkrete Freigabe; exakte Postimage-/xmin-, Quellen-, Kanten- und Reservierungsprüfungen, keine neue Lease/Referenz. Genau die oben geänderten Felder auf den vollständigen gebundenen Vorherzustand zurücksetzen; gegebenenfalls gemeinsam mit der unten zugehörigen Kante. Atomar, anschließend vollständige 52-Nachkontrolle.

### B2. `public.ko_document_links` — genau eine fremde Quellenkante

`knowledge_object_id=ko-vg-neuzulassungen-20260922-760ba1`  
`raw_document_id=rd-2018275a9b3de2c383e34847eff4332e0286d6a7814b419d4126bb7f485acb69`

- **Vorher:** genau diese vollständige Kante, `created_at=2026-09-24T10:40:01.609182+00:00`, `xmin=470600`, native Vollzeilenhash `d7dbae2916f524bdb8d8de09aba2f1d3f50ecf5b37734f586cb7611df04c06bd`.
- **Nachher:** genau diese Kante fehlt; der Rohquellen-Datensatz bleibt vollständig unverändert.
- **Grund / Original:** Konjunkturprognose gehört nicht zur EU-E-Auto-Zulassungsmeldung. Fremdes Original: https://www.deutschlandfunk.de/wirtschaftsforschungsinstitute-verdoppeln-ihre-wachstumsprognose-100.html; gültiger Zulassungsbeleg wie beim zugehörigen KO.
- **Schutz:** exakte Kanten-Vorherzeile/hash/xmin, sämtliche drei Rohquellen-/Kantenbelege und zugehöriger KO/abgeschlossene Reservierung; vollständiger 52-Vorherstand. Alle Prüfungen vor dem ersten der fünf Writes. Nur gemeinsamer atomarer Vorschlag B.
- **Wirkung / Risiko:** fremde Quellenbindung entfernt, zwei passende Kanten erhalten. Historische Quellenoriginale bleiben verfügbar; alter B1-Quellenset-Replay kann die Kante wiederherstellen. Keine dauerhafte Resolverprävention behauptet.
- **Unmittelbare Nurlese-Nachkontrolle:** diese Kante abwesend, genau zwei korrekte unveränderte Kanten, vollständiger zugehöriger KO mit neuem Hash; Quellenoriginale, Profile und alle anderen Zeilen unverändert.
- **Rückweg:** neue Freigabe; exakte fehlende Kante, KO-Postimage/xmin, gültige Kanten/Quellen/Reservierung unverändert. Genau die gebundene dreifeldrige alte Kante wieder einfügen und zugehörige KO-Felder zurücksetzen. Kein automatischer Rückweg.

### B3. `public.knowledge_objects` — `ko-vg-abgeordnetenhauswahl-20260907-8024ed`

| Feld | Vorher | Nachher |
| --- | --- | --- |
| `ko_version` | `2` | `3` |
| `updated_at` | `"2026-09-26T22:56:57.979+00:00"` | `"2026-10-08T02:24:00+00:00"` |
| `source_document_count` | `3` | `2` |

- **Grund / Original:** Linked pharma campaign article does not support Linke/SPD/Green sondierungevent; removeonlyunsupportededge, leavecorrectparty sources andprimaryURL Originalbeleg: https://www.deutschlandfunk.de/spd-landesvorstand-stimmt-fuer-sondierungsgespraeche-mit-der-linken-108.html. Diese Bestandsartikel sind keine amtlichen DIP-Originale; für die Senatsverwaltung ist der Behördenoriginalbeleg maßgeblich, für die beiden Nachrichtenereignisse die tatsächliche veröffentlichte Originalmeldung. Keine amtliche Herkunft erfunden.
- **Schutz vor Schreiben:** vollständige KO-Vorherzeile `xmin=473595`, native SHA256 `d1e9bf8d2ad616b23cb987413dc61ffbef952da2ab966b58db497e30706832b1`; sämtliche vorhandenen KO-Kanten und Rohquellen per Vollzeile/xmin; abgeschlossene Reservierung samt Vollhash/xmin und unverändertem historischem fencing/resultfencing; vollständiger 52-Vorherstand identisch, aktueller Commit/READY/Tag/Schema/Trigger geprüft.
- **Erwarteter vollständiger native Nachherhash:** `3174f8cd7c05d6287bf370a1776cdde7979f2c56c2876c3b00589e428d340021`. Alle nicht oben genannten KO-Felder einschließlich Embedding, Modellherkunft und `verstehen_fencing` bleiben unverändert.
- **Wirkung:** korrekte Ebenen-/Primärquellen-/Quellenanzahlmetadaten für spätere Leser. `updated_at` ist Korrekturzeit, keine neue Veröffentlichung. Keine KO- oder Eingabeannahme allein durch diese Änderung.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige KO-Zeile gegen Postimagehash und Originalbelege, tatsächliche verbleibende Quellenkanten; sämtliche Rohquellen, abgeschlossenen Reservierungen und anderen 52-Tabellenzeilen einschließlich aller Profile unverändert.
- **Risiko:** globale bestehende Leser sind betroffen. Historische abgeschlossene Verstehen-Reservierungen bleiben bestehen; ein Wiederabspielen alter Quellensets im unveränderten Blocker1-Motor könnte eine entfernte Kante erneut anlegen. Diese Metadatenkorrektur ist kein Beleg dauerhafter Motorprävention. Keine Änderung oder Umgehung des B1-Motors.
- **Rückweg:** nur neue konkrete Freigabe; exakte Postimage-/xmin-, Quellen-, Kanten- und Reservierungsprüfungen, keine neue Lease/Referenz. Genau die oben geänderten Felder auf den vollständigen gebundenen Vorherzustand zurücksetzen; gegebenenfalls gemeinsam mit der unten zugehörigen Kante. Atomar, anschließend vollständige 52-Nachkontrolle.

### B4. `public.ko_document_links` — genau eine fremde Quellenkante

`knowledge_object_id=ko-vg-abgeordnetenhauswahl-20260907-8024ed`  
`raw_document_id=rd-9c691e3c0d8dc66fd4445d41a74a40f1ca00ae9a1f3cf615c0ef0eeff135c491`

- **Vorher:** genau diese vollständige Kante, `created_at=2026-09-07T10:37:59.70672+00:00`, `xmin=341942`, native Vollzeilenhash `4854859dc4d71f5741035dc0c58112fc38147b3beaf462bc16c8d7bbfa6adacc`.
- **Nachher:** genau diese Kante fehlt; der Rohquellen-Datensatz bleibt vollständig unverändert.
- **Grund / Original:** Pharma-/Apotheken-Wahlkampfaussage belegt keine Koalitionssondierung. Fremdes Original: https://www.pharmazeutische-zeitung.de/krach-will-berlin-zur-apotheke-der-welt-machen-168097/; gültiger Sondierungsbeleg wie beim zugehörigen KO.
- **Schutz:** exakte Kanten-Vorherzeile/hash/xmin, sämtliche drei Rohquellen-/Kantenbelege und zugehöriger KO/abgeschlossene Reservierung; vollständiger 52-Vorherstand. Alle Prüfungen vor dem ersten der fünf Writes. Nur gemeinsamer atomarer Vorschlag B.
- **Wirkung / Risiko:** fremde Quellenbindung entfernt, zwei passende Kanten erhalten. Historische Quellenoriginale bleiben verfügbar; alter B1-Quellenset-Replay kann die Kante wiederherstellen. Keine dauerhafte Resolverprävention behauptet.
- **Unmittelbare Nurlese-Nachkontrolle:** diese Kante abwesend, genau zwei korrekte unveränderte Kanten, vollständiger zugehöriger KO mit neuem Hash; Quellenoriginale, Profile und alle anderen Zeilen unverändert.
- **Rückweg:** neue Freigabe; exakte fehlende Kante, KO-Postimage/xmin, gültige Kanten/Quellen/Reservierung unverändert. Genau die gebundene dreifeldrige alte Kante wieder einfügen und zugehörige KO-Felder zurücksetzen. Kein automatischer Rückweg.

### B5. `public.knowledge_objects` — `ko-vg-leichter-20260102-5a4d25`

| Feld | Vorher | Nachher |
| --- | --- | --- |
| `ko_version` | `1` | `2` |
| `updated_at` | `"2026-09-27T17:33:24.032+00:00"` | `"2026-10-08T02:24:00+00:00"` |
| `decision_level` | `"kommune"` | `"land"` |
| `political_level` | `"kommune"` | `"land"` |

- **Grund / Original:** Berlin Senatsverwaltung Abteilung Pflege isLandadministration, notmunicipalpublisher; correcttwo KOlevel fields, preserve sourcecontents/publicationmetadata Originalbeleg: https://www.berlin.de/sen/pflege/leichte-sprache/ueber-uns-1027351.de-plain.php. Diese Bestandsartikel sind keine amtlichen DIP-Originale; für die Senatsverwaltung ist der Behördenoriginalbeleg maßgeblich, für die beiden Nachrichtenereignisse die tatsächliche veröffentlichte Originalmeldung. Keine amtliche Herkunft erfunden.
- **Schutz vor Schreiben:** vollständige KO-Vorherzeile `xmin=474111`, native SHA256 `409ea8eeb2802d2346b8018f9103a97c4ada0bfa5fcd64e1a9491ba3d1d79e4c`; sämtliche vorhandenen KO-Kanten und Rohquellen per Vollzeile/xmin; abgeschlossene Reservierung samt Vollhash/xmin und unverändertem historischem fencing/resultfencing; vollständiger 52-Vorherstand identisch, aktueller Commit/READY/Tag/Schema/Trigger geprüft.
- **Erwarteter vollständiger native Nachherhash:** `5ca02b3fa9d60ac81e7c30572d662e4ad2aadb9dfcb9cf9ee8405cdbb80f3800`. Alle nicht oben genannten KO-Felder einschließlich Embedding, Modellherkunft und `verstehen_fencing` bleiben unverändert.
- **Wirkung:** korrekte Ebenen-/Primärquellen-/Quellenanzahlmetadaten für spätere Leser. `updated_at` ist Korrekturzeit, keine neue Veröffentlichung. Keine KO- oder Eingabeannahme allein durch diese Änderung.
- **Unmittelbare Nurlese-Nachkontrolle:** vollständige KO-Zeile gegen Postimagehash und Originalbelege, tatsächliche verbleibende Quellenkanten; sämtliche Rohquellen, abgeschlossenen Reservierungen und anderen 52-Tabellenzeilen einschließlich aller Profile unverändert.
- **Risiko:** globale bestehende Leser sind betroffen. Historische abgeschlossene Verstehen-Reservierungen bleiben bestehen; ein Wiederabspielen alter Quellensets im unveränderten Blocker1-Motor könnte eine entfernte Kante erneut anlegen. Diese Metadatenkorrektur ist kein Beleg dauerhafter Motorprävention. Keine Änderung oder Umgehung des B1-Motors.
- **Rückweg:** nur neue konkrete Freigabe; exakte Postimage-/xmin-, Quellen-, Kanten- und Reservierungsprüfungen, keine neue Lease/Referenz. Genau die oben geänderten Felder auf den vollständigen gebundenen Vorherzustand zurücksetzen; gegebenenfalls gemeinsam mit der unten zugehörigen Kante. Atomar, anschließend vollständige 52-Nachkontrolle.

### Gemeinsame Schutzbedingungen B

SQL-/PLpgSQL-Syntax offline geprüft; native Nachher-Typen ausschließlich mit READ ONLY SELECT validiert. Exakt drei KO-Updates und zwei Kantenlöschungen mit expliziter Feldliste; alle übrigen alten Zeilen/xmin der 52 Tabellen bleiben geschützt. Konkrete unabhängige SQL-Endprüfung ist vor einem Ausführungsvorschlag erforderlich; keine Parserprüfung als Production-Lauf ausgeben. 

Vollständige private Payloads: `b2-two-row-wrongsource-permission-plan-NOT-APPROVED.json` und `b2-additional-level21-and-source52-permission-plans-NOT-APPROVED.json`. Transaktionsindex: `b2-additional-five-transaction-preparation-index-NOT-APPROVED.json`.

## C: Ereignisduplikat — Löschvorschlag ausdrücklich gesperrt

`ko-vg-haushaltsausschuss-20260708-6cf862` und `ko-vg-haushaltsausschuss-20260708-734bcf` bezeichnen nach gesicherten Originalvolltexten dieselbe MEKO-Entscheidung. Der ursprüngliche Vier-Wirkungen-Mergeentwurf ist **BLOCKED, nicht ausführbar**: die abgeschlossene Reservierung des zu löschenden KO bleibt eine gültige Idempotenzantwort. Der unveränderte Motor kann beim Wiederaufruf „bereits fertig“ liefern und eine Kante zur dann fehlenden KO-Identität versuchen. Null heutige Fremdreferenzen löst dies nicht. Keine Reservierung löschen/umgehen, keine B1-Änderung, kein maskierender Topic-/Tag-/Textähnlichkeitsmerge.

Ein künftiger sicherer Resolver-/Präsentationsgruppenweg muss unveränderte Mitglieder mit eigenen tatsächlichen KO→Quellenbindungen erhalten und die Gleichheit durch einen expliziten versionsgebundenen Ereignisbeleg nachweisen. Dieser Persistenz-/Schnittstellenvorschlag ist noch nicht freigabefähig. Die Mindestfreigabe A wird davon nicht erweitert.

## Entscheidungsgrenze

Empfohlene nächste konkrete Aktion: **A, vier INSERTs**, nach frischer unabhängiger Zustandsprüfung. B separat entscheiden und nur mit eigenem exakten Transaktionshash; C bleibt gesperrt. Keine Teilannahme und keine Erfolgserklärung für Blocker2. Nach späteren Datenaktionen ist ein frischer vollständiger 500er Nurlesebeleg gesondert freizugeben und vollständig fachlich zu prüfen.
