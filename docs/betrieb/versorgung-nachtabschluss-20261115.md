# Quellenreparatur: Nachtabschluss 15.11.2026

Stand 01:59UTC. Betreiber hat auftragsbezogene gruene Merges bis maximal20
freigegeben. Zwei Runtime-Fixmerges sind erfolgt; dieses Dokument aktualisiert
nur ihre Nachweise. Keine zusaetzlichen kostenpflichtigen Modelllaeufe, neuen
Lasttests oder geschuetzten Production-Daten-/Cron-/Budget-/Env-Aktionen.

## Ergebnis und Integration

- [PR1203](https://github.com/ernisch/helmut-pilot/pull/1203): BMG-Einleitung und
  Lage-Leervertrag; gepruefter Kopf `23f59effa41ba5efce2e96b1d75c22720810d6ca`,
  Merge `356fe78134725327f9d1bdff27e0a17b8e1c89cd`.
  [CI43663042110](https://github.com/ernisch/helmut-pilot/actions/runs/43663042110):
  native SQL-Schritte,189/189Standardsuiten,390/390Bereichssuiten und der echte
  Desktop-/Mobil-Chromium-Smoke erfolgreich; beide Pflichtchecks gruen.
- [PR1204](https://github.com/ernisch/helmut-pilot/pull/1204): gebundener hib-Suffix,
  BMAS-/ZDF-/BMG-Presseabsatz; gepruefter Kopf
  `d076f33af2c32e56832ed4db25627813207f9e4f`,
  Merge `5f3875e16021e17aafda0a7b67e9d33a86d92bac`.
  [CI43665246842](https://github.com/ernisch/helmut-pilot/actions/runs/43665246842):
  14/14Schnellkern und87/87Quellensuiten erfolgreich; beide Pflichtchecks gruen.
  Unveraenderte Browserflaechen wurden dort bewusst nicht erneut ausgefuehrt.

Die bestehenden negativen Quellen-/Versions-/Mandats-/Checkpoint-/Kostengates
bleiben. CI-Fehler wurden zuerst auch auf unveraendertem main6763dc8e belegt und
in bestehenden Fixtures korrigiert. Historische Prosa-Offlinefaelle binden das
originale Schema samt Validator; reale Ausfuehrungs-/Kostensperren bleiben.
Die reine Listen-Gegenprobe zeigt710vorher/709nachher: ausschliesslich der native
PostgreSQL-Claimtest entfaellt aus der falschen Offline-Sammlung. Seine vorhandene
eigene netzlose PG17-Pruefung bleibt. Keine weitere Suite entfernt.
Playwright1.56.1 scheiterte nach dem Wechsel von ubuntu-latest auf26.04 vor jeder
Browserpruefung; nur der Browserrunner wurde auf unterstuetztes Ubuntu24 gepinnt.
Chromium-Version, Browserpflicht und Pruefauswahl blieben erhalten.

## Originale, Deployment und Bestand

[Sechs hashgebundene Vorher-/Nachher-Nachweise](quellen-parser-folge-20261115.json)
verwenden identische echte Originalbytes, keine Modellantwort. Titel, Originalziel,
Datum und Absatzherkunft bleiben gebunden. Neue Einleitungen sind kein Volltext.
Ein weiterer einzelner oeffentlicher Google-GET und eine reine Dekodierungsabfrage
am01:27UTC bestaetigten fuer einen historischen NULL-Zielfall den bereits bekannten
hib-Artikel1232222. Der unveraenderte bestehende Decoder liest diese Antwort;
daraus folgt kein neuer Decoderdefekt und keine nachtraegliche Jobreparatur.

Beide normalen Production-Deployments sind READY: zuerst
`dpl_AhvxTE11q6x1qYQRiG51RMxkX3G7` fuer356fe781, danach
`dpl_CfqLovsLHr1LYHr9AagxQrpj95WG` fuer5f3875e1. Team und Projekt
`prj_xbZ6QzTkr7YoxQI71lW59FT03IR3` wurden ueber Vercel geprueft.
Die oeffentliche Shell lieferte jeweils HTTP200 und exakt die neue Commitversion;
letzte Version5f3875e1 um01:58UTC. Kein authentifizierter Kundenweg aufgerufen.

Rein lesende SQL-Nachkontrolle01:57UTC nach beiden Merges:
alle fuenf zuvor erfolgreichen Jobs weiter erledigt, alle fuenf Payload-MD5 gleich
dem Vorbefund. Gespeichertes Briefing weiter InhaltHash
`17fbead5dd1e177a8628a923c1c8822cf9c4fda98c5a5716bba6943cd0cdff04`.
Erfolgsinhalte, alte Negative, unbekannte Ausgaenge und Journale wurden nicht
umgeschrieben oder zurueckgesetzt. Private Diagnosebelege bleiben lokal in
`/tmp/helmut-versorgung-originalprobe-20261114/`, keine Profilpayloads in Git.

## Verbleibende Grenze

Der historische Quellenabschluss bleibt5verarbeitet/58fehlgeschlagen/78vertagt;
38Fehljobs haben keinen bestaetigten Originalartikel. Widersprechende DLF-/NDR-
Metadaten und die Bundestagsanhoerung ohne Publikationsbeleg bleiben gesperrt.
Die native Abdeckung meldet4Fehler/111Warnungen/13Konfigurationsabweichungen;
fehlende Pflichtrollen/-klassen sind keine durch einen Parser belegte Versorgung.
Bis01:57UTC ist kein heutiger regulaerer Quellen-/Lage-/Morgenabschluss vorhanden.

Automatische Freigabepruefung lehnte den Vollkatalogexport wegen zu breiter
interner Konfiguration und anschliessend die politische Profilfeldausleitung
wegen nicht speziell freigegebenem Payload/Ziel ab. Beide Exporte unterblieben;
nur nicht-sensitive Zaehler und Befundcodes wurden gelesen. Keine Umgehung.
Ein konkreter noch nicht ausgefuehrter Minimal-Lesevorschlag liegt privat vor:
eine Profilzeile,12notwendige Felder, nur vertrauliche Analyse, keine Ablage
in Git/Artefakten oder Nachrichten. Dafuer ist ausdrueckliches GO erforderlich;
ein spaeterer geschuetzter Datenfix braucht einen eigenen konkret begrenzten Auftrag.

Kein Gesamt-PASS fuer taegliche Versorgung, echten Kundendurchlauf oder Verkauf.
Naechster Schritt: bestehende Nachtkontrolle den echten regulaeren Abschluss
lesend pruefen lassen; keine zusaetzlichen Laeufe. Crons03:00–04:45Quellen,
05:00Lage,05:15Morgen UTC und Nachtkontrollen03:07–07:07bleiben unveraendert.
