# Quellenabnahme für den ersten Kunden am 16.11.2026

Ziel: den bestehenden Bundestagspiloten mit Fachgebiet Arbeit und Soziales
innerhalb der bestehenden Freigaben abnahmefähig machen. Der private
Zwölf-Felder-Profilabgleich bleibt geschlossen. Kein Gesamt-PASS: heutige
Quellen- und Inhaltsversorgung ist weiter partial. Diese Prüfung verwendet
bestehende Betriebs-, Katalog- und Archivbelege; kein neuer kostenpflichtiger
Lauf, Quellenabruf oder Mengentest wurde gestartet.

## Gemeinsame Ursachen vollständig abgegrenzt

Der echte Adminlauf 08:05:50.914–08:09:37.023 UTC hat eine vollständige Bilanz:
176 Claims = 13 erledigt + 134 vertagt + 25 wiederholt + 4 Endfehler,
keine verlorene Lease. 23 währenddessen neu eingereihte, unberührte Dokumentjobs
gehören nicht zu diesen Claims. Aktualisierte Zeilen sind keine Ereignisliste.

| Ursache der Vertagung | Anzahl | Nachweisgrenze |
| --- | ---: | --- |
| Anbieter-Minutenlimit | 107 | Gemeinsame Grenze; Fehlertext allein beweist keinen Nullabruf. |
| Artikelkontext-Zeitbudget | 22 | Davon 21 als verstehen-uebersprungen quittiert. |
| Artikelkontext noch offen | 4 | Kein belegter gelesener Inhalt. |
| Quellenabruf-Zeitbudget | 1 | Sichere Vertagung statt begonnener zu kurzer Netzarbeit. |

Alle 134 stehen auf attempt 0: kein verbrauchter Fehlversuch. Unter den
25 Wiederholungen stehen 14 bereits gesperrte Analysefälle (`skipped-failed`),
neun fehlende Artikelziele, eine Titelabweichung und ein dauerhaft offener
Artikelkontext. Alle attempt 1/max 3. Die vorhandenen Sperren öffnen weder
Originalabrufe noch Modellverträge; `skipped-failed` endet vor dem Modellstart.
Kein weiterer universeller Motorfehler ist daraus belegt. Die zuvor einzeln
aufgelösten 22 + 4 Endfehler bleiben erhalten und dürfen wegen Wiedervorlagen
nicht als disjunkte Gesamtmenge zu diesen 25 addiert werden.

Die vier neuen Endfehler sind echte Quellenstand-Versionskonflikte: vorhandene
Archive/Kanonik, gleiche URLs, aber abweichende Publikationszeitwerte; drei
zusätzlich mit anderem Titel und Herausgeber. Keine bloße Zeitformatabweichung.
Die maßgebliche Fassung ist nicht entschieden, daher kein Metadatenangleichen.
[Gemeinsame Ursachen und Reparaturen](quellen-ursachenanalyse-20261116.md).

## BMG: Textgrundlage abgeschlossen, Inhaltsanalyse noch offen

Job `633d9438-7d68-43cc-ad84-15326f7eab8d` trägt den bestätigten Revision-2-
Reparaturbeleg. Der bestehende Prüfer `pruefeBelegstand` hat den gespeicherten
304-Zeichen-Einleitungsabsatz jetzt rein lesend validiert; der Hash entspricht
exakt dem Fortschrittsbeleg des Jobs. Kein erneuter Originalabruf.

- Dokument `rd-1da2e3b96aca5fa17c33bad98ae99ac8fe41e402e021069644897f1f01effa60`.
- Archivstand `af0ebff8510454c7882f2d0f97c475da3e39393e656fe7913ca23a76e0acc006`.
- Revision-2-Cache `0dfab3735ac3a8a1d0b9839327a2166a28019c7cf8dbda5d4e29f97c80365a5c`.
- Reparaturhash `d6d5210d7d85d0145731a9b3fb3416c6be2a27ead3284be3d08536f1b3091aed`.
- Echtes Publikationsdatum 05.11., 12:24:14 UTC; Originallektüre 14.11.,
  22:23:22.396 UTC; Archivwiedergewinnung 16.11., 03:02:14.351 UTC.

Der alte Negativcache bleibt erhalten. Der Job ist wartend / attempt 2/max 3,
seit 03:02:24 fällig, priority 80. Sein Fenster ist 11.11., last_seen_window NULL.
Der bestehende SQL-Claim bevorzugt heutige Arbeit; 103 heutige Dokument- und
129 heutige Abrufjobs waren beim engen Folgeabgleich noch fällig. Die besondere
Abrufphase nimmt nur source_fetch an. Das erklärt das Nicht-Erreichen plausibel;
eine historische Einzelreihenfolge wird daraus nicht behauptet.

Für dieses Dokument ist kein verknüpftes Analyseergebnis gespeichert. Ein
wiederverwendbarer kostenloser Analyseabschluss ist damit nicht nachgewiesen.
Der nächste reguläre Claim darf die bestehende Nachanalyse fortsetzen; kein
Reset, Ersatzjob, Direktaufruf oder bezahlter Zusatzlauf wird dafür erzeugt.

## Begrenzter Soll-/Ist-Abgleich nach Issue #1218

| Erforderliche Grundlage | Vorhandener Nachweis | Kleinster Schritt / offene Grenze |
| --- | --- | --- |
| Bundestag, Drucksachen und Verfahrensstand | DIP direkt/healthy/always_on; innerhalb des vorhandenen 21-Tage-Bestands 35 BT- und fünf BR-Drucksachen, alle mit typisierter Herkunft und V2-Verfahrensreferenzen. | Bestehenden Weg nutzen; kein zusätzlicher Bundesratkanal allein wegen fehlender eigener RSS-Zeile. Verfahrensreferenz ist kein erfundener aktueller Status. |
| Amtliche Ausschussinformationen und Termine | Ausschuss-RSS vorbereitet, paused/manual; direkte kommerzielle hib-/Thementextrechte ungeklärt. | Inhaltsrechte offenlassen; verfügbare DIP-Originalgrundlagen nutzen. Kein pauschaler Ausschuss-/Terminvollständigkeits-PASS. |
| Zuständiges Ressort BMAS | Bestehender direkter Weg healthy/auto, heutiger Abruf mit 16 Treffern; frühere erfolgreiche Inhaltsverarbeitung vorhanden. | Bestehende Quelle nutzen; Trefferzahl allein beweist keine komplette heutige Lesetextversorgung. |
| Bundesregierung | Vorhandener amtlicher Weg needs_review/always_on, heute 16 Treffer. | Einzelbelege/Lesetextqualität weiterhin getrennt prüfen; keine Erfolgsbehauptung aus HTTP oder Metadatenzahl. |
| Pflegebezogener BMG-Hintergrund | Gebundener archivierter Einleitungsabsatz gültig, siehe oben. | Inhaltsanalyse bleibt bis zum regulären Abschluss offen. |
| Amtliche Arbeits-/Sozialstatistik | Bereits genehmigter Destatis-Direktfeed und zwei passende gespeicherte Auszüge; bisher nur Wirtschaft/Digital zugeordnet. | Genau eine vorhandene Paketbindung zu Arbeit und Soziales ergänzen; Rechte und individuelle Fachprüfung erhalten. Dritte echte Abrufquittung weiterhin offen. |
| Veröffentlichte EU-Rechtsakte | Amtlicher CELLAR-/FORMEX-Originalbeleg und vollständiger V3-Lesepfad vorhanden; heutiger regulärer Tagesjob lieferte vor dem Fix 16 V1-Metadaten ohne Text. | Regulären V3-Folgebeleg abwarten; abgeschlossenen Tagesjob nicht wiederholen. |
| Ergänzende Fachmedien und weitere amtliche Wege | Bestehende Wege und erlaubte iRights-Auszüge; BA/Bundesrat-Themenwege teils Google-basiert. | Nur wesentliche echte Lücken ergänzen. Ungeklärte Textrechte bleiben gesperrt; keine pauschale Quellen- oder Landesinventur. |

## Konkrete sichere Ergänzung: bestehender Destatis-Feed

Der vorhandene Feed ist für den bisherigen engen kommerziellen Textauszug mit
Originalnachweis genehmigt. Einzelbedingungen, Bild-/Volltext-/Trainingsgrenzen
bleiben erhalten. Zwei bereits gespeicherte Nachweise belegen den Fachbezug:

- Pflege und Berufsleben: Dokument
  `rd-8534c6f8bb2bf609c380444010b0ffb5edb513c5ad1b0afdc4d7c47d563c88a0`,
  Original `https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/11/PD26_N079_23.html`,
  Publikation 12.11., 07:00 UTC, 371 Zeichen.
- Erwerbstätigkeit: Dokument
  `rd-e0d688dfea150cfb91b206bcca83c5a5d2e7dcd49505da4da9d46a4b87e4ddd9`,
  Original `https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/11/PD26_N078_13.html`,
  Publikation 11.11., 12:00 UTC, 368 Zeichen. Das Berichtsjahr ist kein Publikationsdatum.

Beide bestehen den vorhandenen Textleser mit Quelle, Original-URL, Datum und
Herausgeber. Fehlende retrieval_path_id ist der bereits unterstützte eindeutige
Legacyfall; die bestehende URL-Kanonisierung berücksichtigt www. Kein
Artikelpatch. Paketzuordnung ersetzt keine persönliche Relevanzprüfung;
allgemeine Wirtschaftsmeldungen zählen nicht automatisch als Sozialversorgung.

Kleinster Umfang: ein zusätzlicher fachgebietKey am vorhandenen Feed und exakt
eine zusätzliche package_paths-Kante im reproduzierten Seed. Der globale Seed
wird nicht angewendet. Ein separat vorwertgebundener, reversibler Einzeilen-CAS
kann nach unabhängiger Prüfung und grüner CI das bestehende Paket
pkg-arbeit-und-soziales mit rp-fach-destatis-aktuell-rss verbinden. Publisher,
Pfad, Paketstatus, zwei Altbindungen und alle Rechteflags bleiben gleich.
Ist-, Prüf-, Merge- und Katalogbelege werden im zugehörigen PR festgehalten.

## Abnahmegrenze

Die drei gemeinsamen Motorreparaturen sind live (zuletzt PR #1235 / accf7c4b).
Die neue Prüfung startet keine weiteren bezahlten Läufe. Letzter Kostenbeleg
08:36:58 UTC: 0,135652 USD am Tag / 4,230669 USD insgesamt gebunden, vier Fenster /
1200 reservierte Sekunden / ein Original, keine laufenden Jobs. Die Grenzen
1 USD/UTC-Tag und 30 USD insgesamt bleiben unverändert.

EUR-Lex, Destatis und iRights haben bereits abgeschlossene T00-Tagesaufträge.
Deren erneuter künstlicher Abruf wäre kein regulärer Tagesnachweis. Die
Drittquittungen, der EUR-Lex-V3-Produktnachweis und die BMG-Inhaltsanalyse
bleiben ausdrücklich offen. Kein Abnahme-PASS aus Code, Paketkante oder Bestand.
