# BMG: amtlicher RSS-Ersatz und Datumsvertrag, 17.11.2026

## Bestaetigter Iststand

Der derzeitige BMG-Suchweg haengt am gemeinsamen Google-News-Anbieter.
Primarbeleg17Nov: echterHTTP429 am Google-Artikelaufloesungsweg; zentraler
Schutzschalter fehler_folge5, offen bis04:47:05UTC. Der amtliche BMG-Host
selbst hat einen geschlossenen Schutzschalter mit null Folgefehlern. Das ist
kein Anlass, die Google-Sperre oder Anbietergrenzen zu umgehen.

Der alte BMG-Analyseauftrag betrifft eine Veroeffentlichung vom5Nov. Sein
11Nov-Fenster ist kein Publikationsdatum. Revision2-Originalbeleg vorhanden,
faellig, Versuch2/max3; Tagesarbeitsvorrang und historische Wartemenge erklaeren
seinen Nachrang. Keine technische Sperre oder sichere Prioritaetsreparatur
belegt; kein Reset, keine Fensteraenderung und kein bezahlter Replay.

## Primär belegter alternativer Zugang

Das gespeicherte hashgepruefte BMG-Original verlinkt die offizielle
[RSS-Serviceseite](https://www.bundesgesundheitsministerium.de/service/rss-feed).
Diese wurde einmal rein lesend geprueft und verlinkt selbst die folgenden Feeds:

- [Meldungen](https://www.bundesgesundheitsministerium.de/meldungen.xml): HTTP200,
  application/rss+xml,630528Bytes,691Eintraege; neuester Eintrag16Nov2026,
  weiterer Pflegeeintrag12Nov. SHA256
  `47c63f47dd3c079e4d9634e3a765c2b9fa2b7502c55b3792abcf5f9e2d3e7324`.
- [Pressemitteilungen](https://www.bundesgesundheitsministerium.de/pressemitteilungen.xml):
  HTTP200,492261Bytes,416Eintraege; neuester Eintrag9Nov. Kein Ersatznachweis
  fuer Nachrichten vom16Nov; nicht zusaetzlich aktivieren.
- Der verlinkte Kurzweg /rss leitet auf die Serviceseite um und ist kein XML-Feed.

Keine Artikel-HTML-Originale, Modelle, Production-Ingestion oder Massentests
fuer diese technische/Primaerrechte-Pruefung. Geladene Feeds werden lokal
geprueft, nicht kuenstlich als regulaere Betriebsquittungen eingespielt.

## Bestaetigte zentrale Datumsluecke

Der vorhandene strenge RSS-Zeitparser akzeptiert GMT/UT/UTC und numerische
Offsets, aber nicht die im amtlichen Feed vorhandenen expliziten Zonen CET/CEST.
Beispiel: Mon,16Nov2026 00:00:00 CET wird bislang unbekannt. Kleinste Korrektur:
CET exakt+01:00 und CEST exakt+02:00 abbilden, weiterhin Kalenderdatum,
Wochentag, vierstelliges Jahr und Offsetgrenzen pruefen. Keine Systemzeitzone,
Sommerzeitvermutung oder heutiges Ersatzdatum.

## Nutzungsgrenze

Primaerbeleg ist das [BMG-Impressum](https://www.bundesgesundheitsministerium.de/impressum),
Abschnitte Verlinkungsregeln und Veroeffentlichungsregeln. Es erlaubt Links und
kostenlose unveraenderte Zitate im Sachzusammenhang mit korrekter Quellenangabe;
Drittrechte sind ausdruecklich ausgenommen. Bilder und Logo sind nicht umfasst.
Dies ist keine pauschale Inhalts-/Volltext-/Trainingslizenz. Enger technisch und
rechtlich sicherer Einbindungsscope und unabhaengiger Review werden vor jeder
Aktivierung festgelegt. Bis dahin keine neue Katalogaktivierung.

## Morgenabschluss aus gespeichertem Bestand

Nach konkret vorbereitetem Umfang und Betreiberfortsetzung am17Nov einmal
bestehenden Morgenabschluss ausgefuehrt: maximal240s, keine Modelle oder
Originalabrufe. Paket07:57:29UTC und echte Morgenquittung07:57:30UTC gespeichert;
Quittungshash passt exakt zum Paket. Zustand fresh, echter Tagesanlass
neue-quelle, zwei gespeicherte gepruefte Lageabsaetze erhalten. Einziger
struktureller Restfehler: quellenversorgung-unvollstaendig. Keine Duplikattexte.
Damit ist die Morgenfenster-Reparatur aus PR1241 nun im echten Lauf bestaetigt;
Quellenabnahme bleibt partial. Kosten und gespeicherte Alt-Erfolge erhalten.

## Konkrete zulässige Aktivierung: nur Titel-/Linkmetadaten

Nach unabhängigem Review wird ausschließlich der Meldungen-Feed mit dem
bestehenden geschlossenen Herkunfts-/DTO-Kanal eingebunden. Inhalt und
content:encoded werden nicht übernommen; keine Bilder, Logos, Beschreibung,
Zitat- oder Trainingsrechte. Die erklärte kommerzielle Freigabe im Quellcode
betrifft nur title_link_metadata. Fremde Artikelhosts, Root-/Servicepfade,
fehlende Itemdaten, manipulierte Feedidentitäten oder Herkunft sperren.
Aktuelle eigene Artikel haben direkte Slugs; ein fremder Altlink im Feed
wird einzeln verworfen, ohne gültige Nachbarn zu verlieren.

Vorwerte17Nov: BMG-Herausgeber vorhanden, active/ministry/official_primary/hoch;
AS-Paket active, Gesundheit prepared; neuer RSS-Pfad und alle seine Links fehlen.
Kleinste Productionaktion: genau zwei Katalogzeilen (ein RSS-Pfad plus eine
AS-Paketkante). Kein Paketstatus, Publisher, bisheriger Googleweg, Profil, Cron,
Budget oder Quota wird verändert. Gesundheitskatalog bleibt vorbereitet.
AGENTS.md15Nov erlaubt diese kleine reversible Aktivierung im belegten Umfang;
keine gesonderte Verarbeitungsfreigabe und kein zusätzlicher Quellenlauf daraus.

Erst nach grüner exakter Pflicht-CI, Review und regulärem Deployment wird die
folgende idempotente, kurz begrenzte Transaktion angewandt:

```sql
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
LOCK TABLE public.helmut_jobs IN SHARE MODE NOWAIT;
LOCK TABLE public.retrieval_paths, public.package_paths IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $bmg$
BEGIN
  IF EXISTS (SELECT 1 FROM public.helmut_jobs WHERE status='laeuft'
      AND lease_expires_at>now() AND job_type IN ('source_fetch','document_understanding')) THEN
    RAISE EXCEPTION 'BMG: laufende Originalverarbeitung';
  END IF;
  PERFORM 1 FROM public.publishers
    WHERE id='publisher-bundesgesundheitsministerium.de'
      AND canonical_domain='bundesgesundheitsministerium.de'
      AND name='Bundesministerium für Gesundheit'
      AND publisher_type='ministry' AND evidence_role='official_primary'
      AND trust='hoch' AND lifecycle_status='active' AND entity_id='ministry-bmg'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BMG: Herausgebervorwert abweichend'; END IF;
  PERFORM 1 FROM public.source_packages
    WHERE id='pkg-arbeit-und-soziales' AND key='arbeit-und-soziales'
      AND status='active' AND is_base=false AND political_level='bund'
      AND geography_id='geo-bund' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BMG: Paketvorwert abweichend'; END IF;
  IF EXISTS (SELECT 1 FROM public.retrieval_paths
      WHERE id<>'rp-bmg-meldungen-rss' AND (legacy_source_id='bmg-meldungen-rss'
        OR url='https://www.bundesgesundheitsministerium.de/meldungen.xml')) THEN
    RAISE EXCEPTION 'BMG: andere Pfadidentitaet mit demselben Feed';
  END IF;
  INSERT INTO public.retrieval_paths
    (id,publisher_id,legacy_source_id,name,method,url,query,parser,priority,
     status,activation_mode,is_critical,max_items,expected_frequency,represents_type)
  VALUES ('rp-bmg-meldungen-rss','publisher-bundesgesundheitsministerium.de',
    'bmg-meldungen-rss','Bundesministerium für Gesundheit — aktuelle Meldungen',
    'rss','https://www.bundesgesundheitsministerium.de/meldungen.xml',NULL,
    'rss-regex',80,'needs_review','auto',false,12,NULL,NULL)
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.retrieval_paths
      WHERE id='rp-bmg-meldungen-rss'
        AND publisher_id='publisher-bundesgesundheitsministerium.de'
        AND legacy_source_id='bmg-meldungen-rss' AND name='Bundesministerium für Gesundheit — aktuelle Meldungen'
        AND method='rss' AND url='https://www.bundesgesundheitsministerium.de/meldungen.xml'
        AND query IS NULL AND parser='rss-regex' AND priority=80
        AND status IN ('needs_review','healthy') AND activation_mode='auto'
        AND is_critical=false AND max_items=12
        AND expected_frequency IS NULL AND represents_type IS NULL) THEN
    RAISE EXCEPTION 'BMG: Pfad fehlt oder Vorwert abweichend';
  END IF;
  IF EXISTS (SELECT 1 FROM public.package_paths
      WHERE retrieval_path_id='rp-bmg-meldungen-rss'
        AND package_id<>'pkg-arbeit-und-soziales') THEN
    RAISE EXCEPTION 'BMG: unerwartete Paketkante';
  END IF;
  INSERT INTO public.package_paths (package_id,retrieval_path_id)
    VALUES ('pkg-arbeit-und-soziales','rp-bmg-meldungen-rss')
    ON CONFLICT (package_id,retrieval_path_id) DO NOTHING;
END;
$bmg$;
SELECT id,publisher_id,legacy_source_id,method,url,parser,status,activation_mode,
  max_items,last_success_at,error_streak FROM public.retrieval_paths
  WHERE id='rp-bmg-meldungen-rss';
SELECT package_id,retrieval_path_id FROM public.package_paths
  WHERE retrieval_path_id='rp-bmg-meldungen-rss';
COMMIT;
```

Rückweg: nur den neuen Pfad bei unverändert belegter Identität und ohne laufenden
zugehörigen Originalauftrag auf status paused/activation_mode manual setzen.
Keine Erfolgsdaten, Archive, Kosten oder Quittungen löschen; Paketkante darf
inaktiv erhalten bleiben. Keine automatische Wiederholung eines unbekannten
Transaktionsausgangs; zuerst gezielter Readback. Kein Vollseed und keine Migration.

Kostenbeleg nach echtem Morgenabschluss: unverändert0,731491USD Tag /
5,025191USD gesamt gebunden,67 heutige Buchungen einschließlich einer
ungeklärten Reservierung. Keine zusätzlichen Modellkosten.

Die kurzen NOWAIT-Sperren verhindern einen Claim zwischen Ruhepruefung und
Mutation sowie konkurrierende doppelte Feed-/Paketidentitaeten. Bei belegter
Parallelitaet oder abweichenden Vorwerten stoppt die gesamte Transaktion.
Ein befuellter Feed ohne gueltige Metadaten meldet einen Parserfehler, keine
ruhige Quellenlage; gute Nachbarn bleiben erhalten. Google-/Personen-/Bild-
Nachladepfade werden fuer die direkte BMG-Identitaet vollstaendig ausgelassen.

## Gezielter Integrationsnachweis

Datumsvertrag12/12 und bestehende Metadaten-/RSS-/DTO-Suite36/36 lokal
bestanden. Unabhaengiger finaler Review ohne offene Findings, einschliesslich
CET/CEST, fremdem Googleproxy bei manipuliertem Personentyp, Canonical-www-
Projektion, Date-/Scope-Manipulation, all-invalid-Parserfehler und guter Nachbarn.
Nur synthetischer Transport/Loopback, keine Datenbank- oder Modelltests und
keine Mengenlaeufe. Beide Pflichtchecks werden an den finalen Dateibaum gebunden;
Deployment, Aktivierung und rein lesender Readback stehen am PR1242.
Die neue Quelle ist erst technisch vorbereitet; ein echter regulaerer BMG-
Folgebeleg wird nicht durch die lokale Feedpruefung oder Katalogzeile ersetzt.

## Diagnosekorrektur17Nov beim Operatorauftrag

Die fruehere SQL-Ruhepruefung verwendete faelschlich running; der Jobstatus
laut bestehender Datenbankfunktion lautet laeuft. Die Vorlage ist berichtigt.
Das ist keine erneute Kataloganwendung und keine Aenderung gespeicherter Erfolge.
Die damalige Nullzahl allein ist kein gueltiger Aktivitaetsnachweis; historische
Laufquittungen bleiben erhalten. Vor jedem neuen Start werden laeuft und reale
noch gueltige Leases explizit geprueft. Bestehende globale Motorsperren bleiben.
