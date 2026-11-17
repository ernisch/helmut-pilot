# Parlamentarische Quellenaufnahme E — 17.11.2026

Aufgabe 4 des Fertigstellungsplans; [D/E/F-Koordination und Planreferenz](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951888895).
Basis `2023dfd55702374caca153b4b81dc3beb140b1dd`. Integration und gemeinsame
Statusdateien liegen allein bei D. PR1249–1251 werden nicht wiederholt.

## Ergebnis und Grenze

**Technisch vorbereitete, gezielt gepruefte Aufnahme; inaktiver Quellenumfang.**
Genau Arbeit/Soziales, Wirtschaft/Energie, Digitales/Staatsmodernisierung,
Plenartagesordnung und amtlicher Sitzungswochenkalender. Keine persoenliche
Kalenderfunktion, keine Einladung, keine Google-/Outlook-Anbindung.

Der bestehende relationale Mapper und Bedarfscompiler transportieren die fuenf
gebundenen `bt-termine-*`-Wege als geteilte `source_fetch`-Auftraege. Der Compiler
erhaelt ihre Abrufkennung ohne kuenstliche RSS-Aliasse. Der vorhandene Worker
benutzt denselben Klassen-/HTTP-/Anbietertransport und dieselbe Originalquote.
Der generische Crawler lehnt diese Kennungen ausserhalb des Quellenauftrags ab.
Keine neuen Katalogzeilen, Aktivierungen, Quellenfenster, Modelle, Migrationen,
Produkt-/Profil-/Budget-/Cron-/Productiondatenwrites ausgefuehrt.

**Externer Blocker:** Der kommerzielle Nutzungsumfang der Ausschuss-TOP-/PDF-/
Webtexte und Kalenderbeschreibungen ist nicht belegt. [F bestaetigt die Grenze](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951903568).
Der §5-Hinweis zu Drucksachen/Plenarprotokollen wird nicht erweitert.
Ohne ausdrueckliche aktuelle Katalog-/Rechtebindung kein Netz und kein Schreiben.
Die technische Vorbereitung beweist keine laufende Versorgung, Rechtsfreigabe
oder sichtbare Kundenabnahme. Verwendete Supabase-Skill:
[SKILL.md](skill://plugin_asdk_app_69d3e5ee6a708191baa733f7b8931995/supabase/SKILL.md);
nur bestehendes POST-/Readback-Muster, keine Live-Datenbankpruefung.

## Verarbeitungsvertrag

- Amtlich in der jeweiligen Ausschussseite benannte `/ajax/filterlist/`-Liste;
  nur direkte Bundestags-PDF-/ICS-Links. Alle im begrenzten Listenfenster
  enthaltenen kommenden Sitzungen, sonst die letzte gelistete Sitzung, samt
  Ergaenzungen/Aenderungen. Hoestens acht Originale je Auftrag; jede Datei
  braucht vorher eine bestaetigte bestehende Originalquotenreservierung.
- Hoestens 2 MiB je Antwort, 40 PDF-Seiten, 160000 extrahierte Zeichen;
  absolute Frist und echtes Abbruchsignal. Gepinntes `pdfjs-dist@6.5.438`,
  JavaScript-Eval/Font-Rendering aus. Kein OCR oder Modell. Keine PDF-/HTML-/
  Bild-/Volltextablage. Lokales `npm audit --omit=dev`: keine Advisories.
- Originalbytehash, Text-/Listenhash, URL, Herausgeber und Publikationstag
  bleiben getrennt von Abrufzeit. `standHash` bindet den Inhaltsstand;
  `belegHash` bindet zusaetzlich die konkrete Beobachtung. JSONB-Feldreihenfolge
  veraendert die Hashes nicht. Stabile URL ist keine Fassungsidentitaet.
- Grundfassung, alle sichtbaren Ergaenzungen und Aenderungen bleiben erhalten.
  Nur ein ausdrueckliches „wird wie folgt neu gefasst“ ersetzt aeltere TOPs in
  der aktuellen Sicht. Unklare Aenderung: `aenderung-pruefen`, keine aktuelle
  TOP-Liste. Fehlender Rang, gleicher Rang mit mehreren Originalen, widersprechende
  Nummern/Publikationstage oder unlesbare Sitzungszeit bleiben `ungeklaert`.
- TOP-Nummern, Drucksachen und ausdrueckliche Voten-/Stellungnahmefristen;
  kurze Originalfragmente ausdruecklich `subjectStatus: originalfragment`,
  kein Anspruch auf vollstaendigen Betreff. Tagesfrist ohne belegte Uhrzeit
  bleibt ohne Uhrzeit. Vergangene Fristen bleiben historisch datiert.
- Oeffentlich abrufbare Tagesordnung ist keine oeffentliche Sitzung. Nicht-
  oeffentliche und ungeklaerte Sitzungsart werden erhalten. Planung belegt
  keinen Beschluss, Termin keine persoenliche Anwesenheitspflicht. Umfang
  stets `coverage: partial`: begrenztes Listenfenster ist keine Vollzaehligkeit.
- ICS nur amtliche Sitzungswochen, ganztags mit exklusivem `DTEND`;
  `DTSTAMP` wird nicht als Publikationstag verwendet. Keine Teilnehmer,
  Organisatoren, Anhaenge, Einzelwiederholungen oder privaten Terminimporte.

## Primärbelege und reale lokale Parserpruefung

Die sieben Original-URLs/Bytehashes aus
[Quellenbedarf](quellenbedarf-20261117.md#direkt-lesbare-amtliche-alternativen)
wurden mit denselben Bytes erneut bestaetigt. Zusaetzlich wurden genau die drei
fehlenden Zwischenfassungen der dort benannten Wirtschaftssitzung einmalig
begrenzt manuell gelesen, kein Production-Quellenlauf:

| Fassung | Amtlicher Originalbeleg | SHA256 |
| --- | --- | --- |
| 1 | [Ergaenzung](https://www.bundestag.de/resource/blob/1231616/to_59_11-11-2026_1-ergaenzung.pdf) | `a7e013c7235dda63d427287f9615dcb1922e6a220b527a5105dc9157ffbb9768` |
| 2 | [Neufassung](https://www.bundestag.de/resource/blob/1232116/to_59_2-aenderung_11-11-2026.pdf) | `6f6cfff1df19c6e32bef577a66d1e80a4def81dcea08b6c634dbc61b0565e003` |
| 3 | [Ergaenzung](https://www.bundestag.de/resource/blob/1232282/to_59_11-11-2026_3-ergaenzung.pdf) | `fe4611556a0fe61a265de8984e1c9397d83cba747127c36cfc460bc21f5a2a4d` |

Zehn lokale Originalfassungen bestaetigen Arbeit45/44 als Konflikt, 26.11.08:00,
Wirtschaft10:30→09:00 samt expliziter TOP-Neufassung, Digital-TOP12 mit
21/6585/21/7406 und zwei Votenfristen11.11. ohne Uhrzeit, vier Plenarsitzungen
110–113 am24.–27.11. und Sitzungswoche23.–27.11. mit exklusivem Ende28.11.
Originale bleiben ausserhalb von Git. Kein kuenstliches heutiges Fristdatum.

Gezielt lokal, jeweils ueber `scripts/lokal.js`:

- `scripts/quellen-bundestag-termine-test.js`: 18/18 Gruppen; echte Planer-
  und Handleranbindung, Negativrechte, Konflikte, Transport, Quote, Readback/UNKNOWN.
- Dieselbe Suite mit `--original-dir=<lokaler Originalbestand>`:
  zusaetzliche hashgebundene Originalgruppe, keine neuen Abrufe durch den Test.
- `scripts/quellen-bundestag-termine-pdf-test.js`: 4/4 Gruppen, echter Parser
  an selbst erzeugter PDF, Format-/Groessen-/Abbruch-/Korruptionsfaelle.
- Bestehender `jobqueue-vertrag-test.js --abschnitte=3,4,5,12`: 37/37;
  gezielte Queue-/Lease-/Abschluss-/Standardabhaengigkeitsregression.

Erstfehler erhalten: erste neue Handlerprobe verwendete den falschen Exportnamen
`handlers` statt `HANDLER` (Test korrigiert). Die erste reale PDF-Gegenprobe
zeigte Spaltenzuordnung sowie Arbeit-„8.00“/„Einziger TOP“ und die Digital-
Fristformulierung; Parser und Original-Gegenpruefungen gezielt korrigiert.
Die synthetische Standardfont-PDF meldet eine Bibliothekswarnung; Textpruefung
und alle zehn amtlichen Originale werden gelesen. Das ist kein Renderingnachweis.
Pflicht-CI und unabhaengiges Endreview werden am exakten PR-Kopf belegt.

## Konkrete Schnittstelle an D

`quellen-bundestag-termine.speicher({request,storeId})` hat `lesen(belegHash)`
und `sichern(stand)`. Ausschliesslich neue unveraenderliche Zeilen
`<storeId>-bt-terminstand-<belegHash>` im vorhandenen `helmut_store`;
POST ohne Upsert, exaktes Ruecklesen auch bei verlorener Antwort, sonst Fehler.
`leseStand()` prueft Identitaet/geschlossene Metadaten; keine Blob-Hauptzeile.
Worker-DI: `leseBundestagTermineKatalog`, `bundestagTermineFetch`,
`reserviereBundestagOriginal`, `sichereBundestagTerminstand`.

Die fuenf konstanten Quellenkennungen/URLs stehen in `QUELLEN`. Der aktuelle
Katalog muss dieselbe `rp-`-/Legacy-/Publisher-/URL-/Methodenbindung,
`healthy`, `always_on`, keine Vorbereitung/Rechtepruefung und explizite Policy
`scope: structured_parliamentary_facts`, `commercialUseApproved:true`,
`fullTextAllowed/imagesAllowed/aiTrainingAllowed:false` samt primaeren
Rechtebelegen tragen. Solche Freigaben werden in diesem PR **nicht gesetzt**.

D besitzt Produktleser/Anzeige und gemeinsame Statusdateien. Dort bei spaeterer
Freigabe nur die neueste bestaetigte, fuer die konkrete Ausgabe zulaessige
Beobachtung lesen; widersprechende Dokumente derselben URL/Rang/Standtag mit
verschiedenen Bytehashes bleiben als Konflikt sichtbar. Fristen am echten
Ausgabetag vergleichen, historische Termine nie als heutige Pflicht ausgeben.
`tops` ist die eindeutige aktuelle Sicht, `topVersions` erhaelt die Historie;
bei Konflikt keine aktuelle TOP-Liste. Keine Ausgabe darf neue Abrufe starten.

Genau ein naechster Schritt: D prueft den exakten E-PR und koordiniert dessen
sequenzielle Integration; die externen Rechteblocker und spaetere regulaere
Original-/Kundenausgabenachweise bleiben ausdruecklich offen.
