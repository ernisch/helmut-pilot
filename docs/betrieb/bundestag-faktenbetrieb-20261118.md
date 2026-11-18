# Bundestag im Faktenmodus

## Quellenentscheidung vom 18.11.2026

Die in [#1211 dokumentierte Antwort des Bundestagsreferats IK 6](https://github.com/ernisch/helmut-pilot/issues/1211#issuecomment-6989446432)
bestätigt die Abgrenzung reiner Sitzungstermine und Tagesordnungspunkte von
geschützter Formulierung. Die Veröffentlichung der Sitzungsdaten gehört zur
amtlichen Aufgabe (vgl. [§§ 20, 61 GO-BT](https://www.bundestag.de/parlament/aufgaben/rechtsgrundlagen/go_btg)
und [Ältestenrat](https://www.bundestag.de/parlament/aeltestenrat)).
[§ 2 DNG](https://www.gesetze-im-internet.de/dng/__2.html) erfasst öffentlich
bereitgestellte Daten im Anwendungsbereich und lässt Dritt- und Zugangsbeschränkungen
unberührt. [§ 4 DNG](https://www.gesetze-im-internet.de/dng/__4.html) gestattet dort
kommerzielle Datennutzung. [§ 44a](https://www.gesetze-im-internet.de/urhg/__44a.html)
und [§ 44b UrhG](https://www.gesetze-im-internet.de/urhg/__44b.html) betreffen
unter ihren jeweiligen Voraussetzungen die vorübergehende Verarbeitung
rechtmäßig zugänglicher Inhalte. Die allgemeine
[Impressumsregel](https://www.bundestag.de/services/impressum) schränkt die
Übernahme geschützter Inhalte ein. DIP-Daten werden weiterhin nach der
[eigenen API-Regel](https://dip.bundestag.de/documents/nutzungsbedingungen_dip.pdf)
verarbeitet.

Die unabhängige punktuelle Prüfung mit HelmutBot bestätigte direkten HTTP 200
auf den fünf Einstiegen, den drei verlinkten Listen und den folgenden
Originalen. Keiner der geprüften Wege ist in
[robots.txt](https://www.bundestag.de/robots.txt) gesperrt. Die geprüften Antworten
hatten keinen TDM- oder Robots-Header und die HTML-Antworten keine einschlägigen
Metadaten. `/.well-known/tdmrep.json` ergab HTTP 404. Damit besteht für den
begrenzt automatisierten Faktenweg ein belegter Zugang ohne festgestellten
Nutzungsvorbehalt. Die Probe belegt Zugangsbedingungen zum Prüfzeitpunkt.

| Weg | Öffentlicher Einstieg | Dokumentierter Folgeabruf |
| --- | --- | --- |
| Arbeit und Soziales | [Tagesordnungen](https://www.bundestag.de/ausschuesse/a11_arbeit_soziales/tagesordnungen) | [Amtliche Liste](https://www.bundestag.de/ajax/filterlist/de/ausschuesse/a11_arbeit_soziales/tagesordnungen/1065836-1065836) und [PDF](https://www.bundestag.de/resource/blob/1231704/TO-45-Sitzung.pdf) |
| Wirtschaft und Energie | [Tagesordnungen](https://www.bundestag.de/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung) | [Amtliche Liste](https://www.bundestag.de/ajax/filterlist/de/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung/1057676-1057676) und [PDF](https://www.bundestag.de/resource/blob/1232506/to_59_11-11-2026_4-ergaenzung.pdf) |
| Digitales und Staatsmodernisierung | [Tagesordnungen](https://www.bundestag.de/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen) | [Amtliche Liste](https://www.bundestag.de/ajax/filterlist/de/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen/1073956-1073956) und [PDF](https://www.bundestag.de/resource/blob/1230840/TO-38-Sitzung.pdf) |
| Plenum | [Tagesordnungen](https://www.bundestag.de/parlament/plenum/tagesordnungen) | [PDF](https://www.bundestag.de/resource/blob/473452/Tagesordnung-komplett.pdf) mit gemeinsamem Programm |
| Sitzungskalender | [Amtlicher Kalender](https://www.bundestag.de/parlament/plenum/sitzungskalender) | [ICS 2026](https://www.bundestag.de/resource/blob/1103938/Parlamentstermine_2026_ics.ics) und [ICS 2027](https://www.bundestag.de/resource/blob/1193892/Parlamentstermine_2026_ics-1-.ics), Jahr aus den Terminfeldern |

HTML, PDF und ICS bleiben zur Faktenerkennung kurzzeitig im Arbeitsspeicher.
Der vorhandene Quellenjob prüft der Reihe nach Katalog und Rechte,
`robots.txt`, Abrufziel und Antwortsignale. Weiterleitungen werden vor einem
Folgeabruf gestoppt. Eine erkannte Zugriffssperre wird im bestehenden Auftrag
vertagt. Bei HTTP 429 gilt mindestens der spätere Zeitpunkt aus `Retry-After`
und dem bestehenden Backoff. Neue Aufträge desselben Wegs berücksichtigen die
noch laufende Sperre. Es gelten dieselben Abruffenster, Anbieter- und Originalgrenzen.
Je Original wird die bestehende Tagesquote reserviert. Das Speicherschema v2
lässt Original-URL, Herausgeber, Abrufzeit, Hashes, Termin- und Drucksachennummern,
Fristen und Fassungsmerkmale zu. Betrefftexte und rohe ICS-IDs entfallen.
Der bestehende Hash-Readback bestätigt den Quellenstand. Dieser Zweig erzeugt
keine Rohtextzeilen, Bilder, Modellarbeit, persönlichen Termine oder Trainingsdaten.

Der Quellenhinweis in Lage und Briefing nennt den Deutschen Bundestag, die
bearbeitete Faktenauswahl und den Originalverweis. Listenveröffentlichung und
PDF-Stand werden getrennt geführt. Arbeit und Soziales bleibt beim belegten
Nummernkonflikt 45/44 ungeklärt. Das gemeinsame Plenarprogramm lässt eine
Verbindung zum gesamten Dokument über eine Drucksachennummer zu. Ein einzelner
Sitzungstag oder TOP folgt daraus nicht. Der Wochenkalender belegt Wochen,
keinen konkreten Vorgang. Die seit PR #1261 bestehende Briefingauswahl verlangt
für eine Priorität einen gültigen Tagesanlass, einen eindeutigen DIP-Vorgang,
einen aktuellen Ausschussbeleg und passenden Mandatsbezug. Eine nicht eindeutig
einer Drucksache zugeordnete Frist bei mehreren Drucksachen bleibt beim TOP
und begründet keine vorgangsbezogene Frist.

## Gebundene Katalogaktivierung

Vorwert in Helmut-Production `ddckuvvpcytqbyfmbvie` am 18.11.2026 rein lesend
bestätigt. Null Terminwege, null gleichlautende URLs, null Terminstandzeilen,
vorhandener aktiver Bundestagsherausgeber und vier bereits aktive Pakete.
Die Transaktion ist ausschließlich nach positivem unabhängigen Review, beiden
Pflichtchecks am selben Kopf, regulärem Merge und READY auf dem Production-Alias
auszuführen. Kostenfreiraum und fehlende parallele Änderungen vorab erneut prüfen.
Sie fügt fünf Wege und fünf Paketlinks atomar ein. Startstatus `needs_review`
bildet die noch fehlende Produktionshistorie ab. Aktivierung `auto` bindet jeden
Weg an sein bereits aktives Paket. Eine Wiederholung erkennt ausschließlich
vollständig identische Zeilen. Drift oder unbekannter Ausgang erfordern lesenden
Abgleich. Die Transaktion installiert keine Migration und ändert keine Pakete,
Profile, Tagespläne, Quoten oder Crontermine.

```sql
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
DO $activation$
DECLARE
  weg record;
  bestand public.retrieval_paths%ROWTYPE;
  paketanzahl integer;
  linkanzahl integer;
BEGIN
  PERFORM id FROM public.publishers
    WHERE id = 'publisher-bundestag.de' AND canonical_domain = 'bundestag.de'
      AND publisher_type = 'parliament' AND evidence_role = 'official_primary'
      AND lifecycle_status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bundestag-fakten:herausgeber'; END IF;

  PERFORM id FROM public.source_packages
    WHERE id IN ('pkg-arbeit-und-soziales', 'pkg-fach-wirtschaft-energie',
      'pkg-fach-digitales-staatsmodernisierung', 'pkg-bund-basis')
      AND status = 'active' AND political_level = 'bund' AND geography_id = 'geo-bund'
    ORDER BY id FOR SHARE;
  GET DIAGNOSTICS paketanzahl = ROW_COUNT;
  IF paketanzahl <> 4 THEN RAISE EXCEPTION 'bundestag-fakten:pakete'; END IF;

  FOR weg IN SELECT * FROM (VALUES
    ('bt-termine-arbeit-soziales', 'Arbeit und Soziales: Tagesordnungen',
      'https://www.bundestag.de/ausschuesse/a11_arbeit_soziales/tagesordnungen', 'pkg-arbeit-und-soziales'),
    ('bt-termine-digitales', 'Digitales und Staatsmodernisierung: Tagesordnungen',
      'https://www.bundestag.de/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen', 'pkg-fach-digitales-staatsmodernisierung'),
    ('bt-termine-plenum', 'Deutscher Bundestag: Plenartagesordnungen',
      'https://www.bundestag.de/parlament/plenum/tagesordnungen', 'pkg-bund-basis'),
    ('bt-termine-sitzungswochen', 'Deutscher Bundestag: Sitzungskalender',
      'https://www.bundestag.de/parlament/plenum/sitzungskalender', 'pkg-bund-basis'),
    ('bt-termine-wirtschaft-energie', 'Wirtschaft und Energie: Tagesordnungen',
      'https://www.bundestag.de/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung', 'pkg-fach-wirtschaft-energie')
    ) AS v(source_id, name, url, package_id)
  LOOP
    IF EXISTS (SELECT 1 FROM public.retrieval_paths WHERE id <> 'rp-' || weg.source_id
      AND (url = weg.url OR legacy_source_id = weg.source_id)) THEN
      RAISE EXCEPTION 'bundestag-fakten:duplikat %', weg.source_id;
    END IF;

    SELECT * INTO bestand FROM public.retrieval_paths
      WHERE id = 'rp-' || weg.source_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.retrieval_paths
        (id, legacy_source_id, publisher_id, name, method, url, parser, status, activation_mode, represents_type)
      VALUES ('rp-' || weg.source_id, weg.source_id, 'publisher-bundestag.de', weg.name,
        'structured_download', weg.url, 'bundestag-termine-v2', 'needs_review', 'auto', 'parliament');
      INSERT INTO public.package_paths(package_id, retrieval_path_id)
      VALUES (weg.package_id, 'rp-' || weg.source_id);
    ELSE
      PERFORM package_id FROM public.package_paths WHERE retrieval_path_id = bestand.id FOR SHARE;
      GET DIAGNOSTICS linkanzahl = ROW_COUNT;
      IF ROW(bestand.legacy_source_id, bestand.publisher_id, bestand.name, bestand.method, bestand.url,
          bestand.parser, bestand.status, bestand.activation_mode, bestand.represents_type, bestand.priority,
          bestand.is_critical, bestand.error_streak)
        IS DISTINCT FROM ROW(weg.source_id, 'publisher-bundestag.de', weg.name, 'structured_download', weg.url,
          'bundestag-termine-v2', 'needs_review', 'auto', 'parliament', 60, false, 0)
        OR bestand.last_success_at IS NOT NULL OR bestand.last_error IS NOT NULL
        OR bestand.expected_frequency IS NOT NULL OR bestand.max_items IS NOT NULL OR bestand.query IS NOT NULL
        OR linkanzahl <> 1 OR NOT EXISTS (SELECT 1 FROM public.package_paths
          WHERE retrieval_path_id = bestand.id AND package_id = weg.package_id) THEN
        RAISE EXCEPTION 'bundestag-fakten:vorwert %', weg.source_id;
      END IF;
    END IF;
  END LOOP;
END;
$activation$;
COMMIT;
```

Rückweg ist die atomare Pausierung der fünf eigenen Wege auf `paused/manual`
unter exakter Bindung an die lesend bestätigten Identitäten und Vorwerte.
Pakete, übrige Wege, gespeicherte Faktenbelege und Kostenquittungen bleiben
erhalten. Bei abweichendem Vorwert sofort anhalten und den betroffenen Weg
neu abgleichen.

## Nachweis im Regelbetrieb

Nach dem Katalog-Readback am nächsten regulären Quellenfenster je Weg
Jobausgang und zugehörige v2-Standzeile prüfen. Merkmale sind die echte Original-URL,
Bytehash, Listennachweis, Abrufzeit, Fassungsdatum bzw. Datum der Sitzung und die
sichere Faktenprojektion. Danach vorhandene DIP-Zuordnung und das reguläre Lage-
oder Briefingpaket lesen. Unklare Fassungen, fehlende Relevanz und fehlender
Tagesanlass bleiben sichtbar offen. Eine HTTP-Stichprobe oder eine CI-Fixture
ersetzt keinen Produktbeleg. Keine Zusatzfenster oder Modelltests.

Auftrag und laufende Nachweise in [#1218](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6989452610).
