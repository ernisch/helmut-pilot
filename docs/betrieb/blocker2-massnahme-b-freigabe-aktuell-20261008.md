# Blocker 2: Maßnahme B nach vollständiger aktueller Aufnahme

**Historische konkrete Freigabevorlage.** B-v2 mit exakt dem unten genannten SHA256 wurde anschließend konkret freigegeben, am08.10.2026 genau einmal angewendet und vollständig sowie unabhängig nachkontrolliert; [Ausführung und500er Fortschritt](blocker2-massnahme-b-nachkontrolle-20261008.md). Die unten angegebenen Vorherwerte bleiben historische Bindungen, keine aktuellen Production-Werte und keine Freigabe zur Wiederholung. Maßnahme A abgeschlossen, C weiterhin gesperrt; kein neuer Nurleselauf, Profileingriff oder kostenpflichtiger Production-Modellaufruf.

Der erfolgreiche aktuelle Lauf [37775654108](https://github.com/ernisch/helmut-pilot/actions/runs/37775654108) zeigt die folgenden drei bestehenden Widersprüche weiterhin in den tatsächlichen Eingaben. Die alten Vor-A-52-Hashes sind durch die vier A-INSERTs überholt; diese neue Transaktion bindet den vollständigen Nach-A-Bestand.

**Neue vorbereitete Transaktion:** `B-after-current500-20261008-v2-five-exact-atomic-transaction-NOT-APPROVED.sql`; SHA256 `53bc5ee6f01d48e55e2fffe319f3e818bd246c81c675f6b6bc09c5d76331456b`. Exakt **fünf bestehende Datensätze: drei KO-Updates und zwei Quellenkantenlöschungen**. Kein INSERT, kein KO-DELETE und kein Rohquellen-Write. Alle fünf Änderungen nur atomar gemeinsam; noch keine Anwendung.

## B1: `public.knowledge_objects`

**Kennung:** `ko-vg-neuzulassungen-20260922-760ba1`. Vollständiger aktueller Vorherhash `1039d5a59815db4319d47d05b48c62a5a9fb5017b99e83697f86ab0dd7162a88`, `xmin=470599`.

| Feld | Aktueller Production-Wert | Vorgesehener neuer Wert |
| --- | --- | --- |
| `ko_version` | `1` | `2` |
| `updated_at` | `"2026-09-24T10:40:00.868+00:00"` | `"2026-10-08T13:10:00+00:00"` |
| `best_source_url` | `"https://www.deutschlandfunk.de/wirtschaftsforschungsinstitute-verdoppeln-ihre-wachstumsprognose-100.html"` | `"https://www.deutschlandfunk.de/anteil-von-e-autos-bei-neuzulassungen-in-eu-erreicht-rekord-100.html"` |
| `related_entities` | `[{"name":"Wirtschaftsforschungsinstitute","type":"organization","entity_id":null,"confidence":"low"}]` | `[]` |
| `source_document_count` | `3` | `2` |
| `mentioned_organizations` | `["Wirtschaftsforschungsinstitute"]` | `[]` |

**Erwarteter vollständiger Nachherhash:** `15e464d0225221597ac62baa297bda6cbe0779a0f8ca9bebdcc05548efb84cad`. Alle übrigen KO-Felder bleiben unverändert, insbesondere Embedding, Modellherkunft und `verstehen_fencing`. `updated_at=2026-10-08T13:10:00+00:00` ist ein fest vorbereiteter Korrektur-Auditzeitpunkt, keine Quellenveröffentlichung.

**Fachlicher Grund:** Die BIP-Prognose ist eine sachfremde Primärquelle des E-Auto-Zulassungsereignisses. Auf die passende bestehende Zulassungsmeldung umstellen, Quellenzahl und Institute bereinigen.

**Originalbeleg:** https://www.deutschlandfunk.de/anteil-von-e-autos-bei-neuzulassungen-in-eu-erreicht-rekord-100.html. Der Senatsbeleg ist amtlich; die Deutschlandfunk-Ereignisbelege sind die ursprünglichen Nachrichtenmeldungen, keine amtlichen DIP-Originale. Bereits gebundene Originale werden nicht erneut importiert.

**Technische Schutzbedingung:** vollständige Vorherzeile/hash/xmin, alle zugehörigen Kanten und Rohquellen sowie abgeschlossene Reservierung mit unverändertem fencing/resultfencing müssen frisch exakt stimmen. Zusätzlich die gemeinsamen 52-/Schema-/Commit-/READY-Guards unten.

**Erwartete Wirkung:** korrekte Primärquelle/Quellenzahl beziehungsweise Landeszuständigkeit in späteren Lesern. Keine automatische KO-, Quellen- oder Profilabnahme.

**Unmittelbare rein lesende Nachkontrolle:** vollständige KO-Zeile gegen den oben angegebenen Nachherhash und das Original prüfen, tatsächliche verbleibende Kanten prüfen; alle übrigen Zeilen einschließlich xmin unverändert.

**Konkreter Rückweg:** nur mit neuer Freigabe; die oben einzeln genannten Felder auf genau die tabellierten Vorherwerte zurücksetzen. Exakte aktuelle Postimage/xmin-, Kanten-, Quellen-, Reservierungs- und Fremdreferenzprüfung vorher; gemeinsam mit gegebenenfalls zugehöriger Kantenwiederherstellung atomar und vollständig nachkontrolliert.

## B2: `public.ko_document_links`

**Eindeutige zusammengesetzte Kennung:** `knowledge_object_id=ko-vg-neuzulassungen-20260922-760ba1` / `raw_document_id=rd-2018275a9b3de2c383e34847eff4332e0286d6a7814b419d4126bb7f485acb69`.

**Aktueller vollständiger Wert:** `created_at=2026-09-24T10:40:01.609182+00:00` mit den beiden obigen Kennungen; Vollzeilenhash `d7dbae2916f524bdb8d8de09aba2f1d3f50ecf5b37734f586cb7611df04c06bd`, `xmin=470600`.

**Neuer Wert:** exakt diese Kante fehlt; der Rohquellen-Datensatz bleibt unverändert.

**Fachlicher Grund und Originalbeleg:** Die sachfremde Zuordnung ist durch das verlinkte eigene Original https://www.deutschlandfunk.de/wirtschaftsforschungsinstitute-verdoppeln-ihre-wachstumsprognose-100.html belegt; die richtige Ereignisquelle ist beim zugehörigen KO oben benannt.

**Technische Schutzbedingung:** exakte volle Kante/hash/xmin, vollständiger zugehöriger KO, alle Quellen und Kanten, abgeschlossene Reservierung sowie sämtliche gemeinsamen Guards vor dem ersten Write.

**Erwartete Wirkung:** genau die sachfremde Quellenbindung entfällt; zwei passende Kanten bleiben erhalten. Keine Quellen- oder KO-Löschung.

**Unmittelbare rein lesende Nachkontrolle:** gelöschte Kante abwesend, genau zwei korrekte unveränderte Kanten vorhanden; Rohquelle, KO-Postimage und alle anderen Zeilen gegen Vollhash/xmin prüfen.

**Konkreter Rückweg:** neue Freigabe erforderlich. Bei exakt fehlender Kante, unverändertem KO-Postimage und ohne neue Referenzen genau die oben bezeichnete alte dreifeldrige Kante wieder einfügen, gegebenenfalls die zugehörigen KO-Felder gemeinsam zurücksetzen; vollständig atomar nachprüfen.

## B3: `public.knowledge_objects`

**Kennung:** `ko-vg-abgeordnetenhauswahl-20260907-8024ed`. Vollständiger aktueller Vorherhash `d1e9bf8d2ad616b23cb987413dc61ffbef952da2ab966b58db497e30706832b1`, `xmin=473595`.

| Feld | Aktueller Production-Wert | Vorgesehener neuer Wert |
| --- | --- | --- |
| `ko_version` | `2` | `3` |
| `updated_at` | `"2026-09-26T22:56:57.979+00:00"` | `"2026-10-08T13:10:00+00:00"` |
| `source_document_count` | `3` | `2` |

**Erwarteter vollständiger Nachherhash:** `c4a36adf6c6caedaebfad06f22f61d4263a9fe84de8b2c74b697842dda243663`. Alle übrigen KO-Felder bleiben unverändert, insbesondere Embedding, Modellherkunft und `verstehen_fencing`. `updated_at=2026-10-08T13:10:00+00:00` ist ein fest vorbereiteter Korrektur-Auditzeitpunkt, keine Quellenveröffentlichung.

**Fachlicher Grund:** Die Pharma-Wahlkampfaussage belegt keine Koalitionssondierung. Nur die Quellenzahl nach Entfernung dieser fremden Kante berichtigen.

**Originalbeleg:** https://www.deutschlandfunk.de/spd-landesvorstand-stimmt-fuer-sondierungsgespraeche-mit-der-linken-108.html. Der Senatsbeleg ist amtlich; die Deutschlandfunk-Ereignisbelege sind die ursprünglichen Nachrichtenmeldungen, keine amtlichen DIP-Originale. Bereits gebundene Originale werden nicht erneut importiert.

**Technische Schutzbedingung:** vollständige Vorherzeile/hash/xmin, alle zugehörigen Kanten und Rohquellen sowie abgeschlossene Reservierung mit unverändertem fencing/resultfencing müssen frisch exakt stimmen. Zusätzlich die gemeinsamen 52-/Schema-/Commit-/READY-Guards unten.

**Erwartete Wirkung:** korrekte Primärquelle/Quellenzahl beziehungsweise Landeszuständigkeit in späteren Lesern. Keine automatische KO-, Quellen- oder Profilabnahme.

**Unmittelbare rein lesende Nachkontrolle:** vollständige KO-Zeile gegen den oben angegebenen Nachherhash und das Original prüfen, tatsächliche verbleibende Kanten prüfen; alle übrigen Zeilen einschließlich xmin unverändert.

**Konkreter Rückweg:** nur mit neuer Freigabe; die oben einzeln genannten Felder auf genau die tabellierten Vorherwerte zurücksetzen. Exakte aktuelle Postimage/xmin-, Kanten-, Quellen-, Reservierungs- und Fremdreferenzprüfung vorher; gemeinsam mit gegebenenfalls zugehöriger Kantenwiederherstellung atomar und vollständig nachkontrolliert.

## B4: `public.ko_document_links`

**Eindeutige zusammengesetzte Kennung:** `knowledge_object_id=ko-vg-abgeordnetenhauswahl-20260907-8024ed` / `raw_document_id=rd-9c691e3c0d8dc66fd4445d41a74a40f1ca00ae9a1f3cf615c0ef0eeff135c491`.

**Aktueller vollständiger Wert:** `created_at=2026-09-07T10:37:59.70672+00:00` mit den beiden obigen Kennungen; Vollzeilenhash `4854859dc4d71f5741035dc0c58112fc38147b3beaf462bc16c8d7bbfa6adacc`, `xmin=341942`.

**Neuer Wert:** exakt diese Kante fehlt; der Rohquellen-Datensatz bleibt unverändert.

**Fachlicher Grund und Originalbeleg:** Die sachfremde Zuordnung ist durch das verlinkte eigene Original https://www.pharmazeutische-zeitung.de/krach-will-berlin-zur-apotheke-der-welt-machen-168097/ belegt; die richtige Ereignisquelle ist beim zugehörigen KO oben benannt.

**Technische Schutzbedingung:** exakte volle Kante/hash/xmin, vollständiger zugehöriger KO, alle Quellen und Kanten, abgeschlossene Reservierung sowie sämtliche gemeinsamen Guards vor dem ersten Write.

**Erwartete Wirkung:** genau die sachfremde Quellenbindung entfällt; zwei passende Kanten bleiben erhalten. Keine Quellen- oder KO-Löschung.

**Unmittelbare rein lesende Nachkontrolle:** gelöschte Kante abwesend, genau zwei korrekte unveränderte Kanten vorhanden; Rohquelle, KO-Postimage und alle anderen Zeilen gegen Vollhash/xmin prüfen.

**Konkreter Rückweg:** neue Freigabe erforderlich. Bei exakt fehlender Kante, unverändertem KO-Postimage und ohne neue Referenzen genau die oben bezeichnete alte dreifeldrige Kante wieder einfügen, gegebenenfalls die zugehörigen KO-Felder gemeinsam zurücksetzen; vollständig atomar nachprüfen.

## B5: `public.knowledge_objects`

**Kennung:** `ko-vg-leichter-20260102-5a4d25`. Vollständiger aktueller Vorherhash `409ea8eeb2802d2346b8018f9103a97c4ada0bfa5fcd64e1a9491ba3d1d79e4c`, `xmin=474111`.

| Feld | Aktueller Production-Wert | Vorgesehener neuer Wert |
| --- | --- | --- |
| `ko_version` | `1` | `2` |
| `updated_at` | `"2026-09-27T17:33:24.032+00:00"` | `"2026-10-08T13:10:00+00:00"` |
| `decision_level` | `"kommune"` | `"land"` |
| `political_level` | `"kommune"` | `"land"` |

**Erwarteter vollständiger Nachherhash:** `af5bd5bd35b50d32ec3620bda868c8bcfec8453a89207bc6a3ee89c645c5ea61`. Alle übrigen KO-Felder bleiben unverändert, insbesondere Embedding, Modellherkunft und `verstehen_fencing`. `updated_at=2026-10-08T13:10:00+00:00` ist ein fest vorbereiteter Korrektur-Auditzeitpunkt, keine Quellenveröffentlichung.

**Fachlicher Grund:** Die Berliner Senatsverwaltung, Abteilung Pflege, gehört zur Landesebene. Die gespeicherte kommunale Zuordnung ist falsch.

**Originalbeleg:** https://www.berlin.de/sen/pflege/leichte-sprache/ueber-uns-1027351.de-plain.php. Der Senatsbeleg ist amtlich; die Deutschlandfunk-Ereignisbelege sind die ursprünglichen Nachrichtenmeldungen, keine amtlichen DIP-Originale. Bereits gebundene Originale werden nicht erneut importiert.

**Technische Schutzbedingung:** vollständige Vorherzeile/hash/xmin, alle zugehörigen Kanten und Rohquellen sowie abgeschlossene Reservierung mit unverändertem fencing/resultfencing müssen frisch exakt stimmen. Zusätzlich die gemeinsamen 52-/Schema-/Commit-/READY-Guards unten.

**Erwartete Wirkung:** korrekte Primärquelle/Quellenzahl beziehungsweise Landeszuständigkeit in späteren Lesern. Keine automatische KO-, Quellen- oder Profilabnahme.

**Unmittelbare rein lesende Nachkontrolle:** vollständige KO-Zeile gegen den oben angegebenen Nachherhash und das Original prüfen, tatsächliche verbleibende Kanten prüfen; alle übrigen Zeilen einschließlich xmin unverändert.

**Konkreter Rückweg:** nur mit neuer Freigabe; die oben einzeln genannten Felder auf genau die tabellierten Vorherwerte zurücksetzen. Exakte aktuelle Postimage/xmin-, Kanten-, Quellen-, Reservierungs- und Fremdreferenzprüfung vorher; gemeinsam mit gegebenenfalls zugehöriger Kantenwiederherstellung atomar und vollständig nachkontrolliert.

## Gemeinsame Guards, Wirkung und Freigabegrenze

- Frisch am 08.10.2026, 13:17:16 UTC: alle drei KO-Vorherzeilen, acht Quellenkanten, acht Rohquellen und drei abgeschlossenen Reservierungen stimmen vollständig samt xmin mit den gebundenen Originalen überein. Schema, Constraints, Trigger und Triggerfunktion unverändert. Dies ist ein datierter Vorbereitungssnapshot, keine spätere Schreibfreigabe.
- Vor einer später genehmigten Anwendung erneut vollständig READ ONLY prüfen: erwarteter aktueller Production-Commit und READY-Alias, Berlin-Tag, Schema/Constraints/Trigger, vollständige 52-Vorherdigests, sämtliche Ziel-/Quellen-/Kanten-/Reservierungszeilen und xmin. Bei jeder Abweichung nichts schreiben.
- SERIALIZABLE, alle 52 Tabellen SHARE-gesperrt, 25s Statement-/2s Lockfrist: alle Vorbedingungen vor dem ersten Write; genau drei explizite UPDATE-Feldlisten und zwei exakt gebundene DELETEs. Kein `helmut.verstehen_cas`-Bypass, keine Reservierungsänderung.
- In derselben Transaktion exakte drei native Nachherhashes, zwei fehlende Kanten und vollständige Digests aller übrigen 52-Tabellenzeilen einschließlich xmin prüfen. Jede Abweichung bewirkt vollständigen Abbruch; kein Teilcommit.
- Nach Commit sofort alle drei vollständigen KO-Zeilen/xmin, beide Kantenabwesenheiten, verbleibende Kanten, Originalquellen, Reservierungen und alle 52 Tabellen vollständig zurücklesen. Exakt fünf geänderte/gelöschte alte Zeilen; alle anderen vorbestehenden Zeilen unverändert.
- Historische abgeschlossene B1-Reservierungen bleiben bestehen. Ein Wiederabspielen des alten Quellensets könnte eine entfernte Kante wieder anlegen. Keine dauerhafte Motorprävention behauptet, kein B1-Umbau und keine Reservierungsumgehung.
- Alle 500 tatsächlichen Eingaben bleiben die jetzigen Originale. Eine virtuelle Anwendung von B darf sie nicht als korrigiert/angenommen ausgeben; ein späterer neuer vollständiger Nurleselauf benötigt ein eigenes konkretes GO.
- C bleibt gesperrt. Kein automatischer Rückweg, keine Profile/Aktivierung, keine Kosten- oder Konfigurationsänderung, keine kostenpflichtigen Production-Modelle und kein Funktionstest.

## Private Belege

- `B-after-current500-20261008-v2-five-exact-atomic-transaction-NOT-APPROVED.sql` — SHA256 `53bc5ee6f01d48e55e2fffe319f3e818bd246c81c675f6b6bc09c5d76331456b`.
- `B-after-current500-20261008-v2-transaction-preparation-index-NOT-APPROVED.json` — SHA256 `e72b1cddbfe6e5c69e65850ba6d54eb5401c1baf1a2ca42b7f383d88f97c0e2e`.
- `B-after-current500-20261008-v2-native-preimages-and-schema.json` — SHA256 `e0ae86c2bfea090ce6678d65e4032020865a660fb338a784afd1a82a5a992c7c`.
- `B-after-current500-20261008-native-postimages-type-only-readonly-proof.json` — SHA256 `3d3ae22f5f9214ad77d3ce1552a3bf3311a908d77ba77e4f7984bac5a273bf18`.
- `B-after-current500-20261008-v2-offline-parser-proof.json` — SHA256 `52e89b6f5a71dfc07cd41ad5247be76eacaaef77310f83a98a3152f495281f21`.

**Prüfgrenze:** native Typprüfung war ausschließlich SELECT, Parserprüfung keine Ausführung. Der isolierte lokale PostgreSQL-/PGlite-Guardnachweis besteht alle sieben Fallgruppen: exakte fünf Wirkungen, Gesamt52-Drift, KO-/Quellen-/Kanten-/Reservierungs-Vorherwiderspruch und vollständiger Rollback bei unerwartetem Nachherhash. Zwei lokale Snapshotliterale und27 xmin-Bezüge wurden auf die Fixture gebunden; native Vollzeilen-/Nachherhashes, Ziel-PK/FK und Fencing-Trigger unverändert. Kein vollständiger Production-Schema-, Last- oder Konkurrenznachweis. Die unabhängige kritische Endprüfung bleibt vor der konkreten Freigabevorlage Pflicht. Keine Prüfung ersetzt die konkret neue Production-Datenfreigabe.

- `B-after-current500-20261008-v2-local-atomic-guard-proof.json` — SHA256 `3b4b8f687454469d0d9cdb192b9c039a87d5acb5b7a4eba9ccfcd52bf5215abb`.

Die frühere neue v1-Transaktion mit SHA256 `785025735b8a1835a96a9865fa9c419907eb9e1a6dec914a890ed0fe80320cb3` ist durch die Einzelbindung der achten bestehenden Quelle überholt und darf nicht angewendet werden. Datenwirkungen unverändert exakt fünf; kein zusätzlicher Kanten- oder Rohquelleneingriff.
