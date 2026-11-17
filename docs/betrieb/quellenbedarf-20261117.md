# Mandatsbedarf und amtliche RSS-Fassungen — 17.11.2026

Fortsetzung von [Quellenabschluss](quellen-abnahme-20261117.md) und Issue #1218.
Keine Gesamtproduktabnahme; historische Erfolgsdaten und Quoten bleiben erhalten.

## Zwei nachgewiesene technische Ursachen

1. Der native DIP-Queuefilter beruecksichtigte Hauptausschuesse und Themen,
   aber weder `deputyCommittees` noch `stellvertretende_ausschuesse`.
   Derselbe Filter wird auf den gemeinsamen Cache und frische amtliche
   Drucksachen angewendet. Kleinste Reparatur: beide vorhandenen Profilfelder
   in die bestehende Stichwortliste aufnehmen; keine Profil- oder API-Aenderung.
   Bestehende gezielte Suite: 11/11, einschliesslich beider Aliasse, Negativfaelle,
   unveraendertem Cache, Profilwechsel und normalem Cacheablauf.
2. URL-Dedup fuehrte einen lizenzierten Destatis-RSS-Auszug mit einer aelteren
   Google-Zeile zusammen. Unterschiedliche Titel, Herausgeberbezeichnung und
   Publikationszeiten fuehrten danach zum richtigen Versionsschutz. Den Schutz
   zu lockern wuerde die falsche Fassung als gelesen ausweisen. Reparaturumfang:
   eine geschlossene, hashgebundene amtliche RSS-Fassung durch Normalisierung,
   native/globale Deduplizierung, Speicherung und Herkunftsreader erhalten.
   Vorhandene Google-Zeilen und deren Erfolge bleiben unveraendert.

Die zweite Reparatur ist in Bearbeitung; Integration und Wirkungsnachweis sind
erst nach unabhaengigem Review und gruener exakter Pflicht-CI bestaetigt.
Keine Anzahl wiederhergestellter Livequellen aus Offlinefaellen ableiten.

## Vorhandener Originalbeleg statt neuer Verarbeitung

Betroffen ist die amtliche Pressemitteilung
<https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/11/PD26_400_435.html>.
Amtliches RSS: 16.11.2026, 07:00:00 UTC; aeltere Google-Zeile: 07:02:04 UTC.
Der amtliche Auszug ist bereits in einem unveraenderlichen Rohstandarchiv
gespeichert: 320 Zeichen, MD5 `9e466e1988c44ba6583d7cc74f8a1d35`.
Ein begrenzter kostenloser Primaerabgleich mit dem bereits freigegebenen
Destatis-RSS bestaetigt denselben Satzpraefix; kein Modell-/Productionlauf.
Feed-SHA256: `3b9ce21c99c55a373e8f8080d58cbfc2786a41b2224f767df42709c9e1e0ee31`.
Das Archiv allein ersetzt keinen artikelweisen Rechtebeleg. Ein reiner Adapter
verlangt zusaetzlich den exakten amtlichen Fund und den vorliegenden passenden
RSS-Eintrag. Noch keine neue Analyse, Speicherung oder Abschlussquittung behauptet.

## Amtliche Alternativen und Rechte

Bundestag-Open-Data und Impressum wurden primaer geprueft:
<https://www.bundestag.de/services/opendata> und
<https://www.bundestag.de/services/impressum>.
Drucksachen und Plenarprotokolle sind ausdruecklich nach §5 UrhG frei;
Quellennachweis, Veraenderungsgrenzen und Rechte Dritter bleiben einzuhalten.
Der vorhandene DIP-Zugang ist dafuer der zulaessige amtliche Ersatzweg.
Das Impressum erlaubt keine pauschale kommerzielle Uebernahme sonstiger
Webseiten-, hib- oder Ausschuss-RSS-Texte.
Primaerbeleg Impressum SHA256:
`bcc94149cc8e91ba9f7e943342b9d287d48919a380e75bab3ef06ec852a5ac8b`.

Der von der Ausschussseite verlinkte gemeinsame Tagesordnungsfeed
<https://www.bundestag.de/static/appdata/includes/rss/tagesordnungen.rss>
enthaelt 15 datierte Titel/Links, keine Beschreibungen. Darunter Arbeit/Soziales
und Digitales, kein Wirtschaft/Energie-Eintrag. Das beweist weder vollstaendige
Terminversorgung noch gelesene Tagesordnungen oder eine RSS-Textlizenz.
Feed-SHA256: `63557880ba03f6c05727949b9e95fa1f844f214eded48a6f9b5612ae7ff4b041`.
Keine Volltextaktivierung und keine externe Kontaktaufnahme erfolgt.

## Verbleibende Grenzen

- Amtliche Ausschuss-/Terminvollstaendigkeit und einzelne kommerzielle
  Textrechte sind noch nicht belegt. Vorbereitete Fachpakete werden nicht
  pauschal aktiviert: darunter liegen auch ungepruefte Google-Abrufwege.
- Zwei weitere gespeicherte Leertextfaelle sind tatsaechlich Drittmedien
  (vermieter-ratgeber.de und lifepr.de), trotz amtlich klingender Quellenaliasse.
  Kein archivierter Originaltext oder klarer Pflichtbedarf belegt.
- EUR Lex: vorhandener CELLAR-/FORMEX-Ersatz bleibt; heutige Metadaten sind
  kein neuer Originalauszug. Externe Sperren und fehlende Rechte nicht umgehen.
- Die zehn heutigen Fenster/3000 reservierten Sekunden sind verbraucht.
  Keine weitere Reservierung, kein Jobreset oder kuenstlicher Erfolgsnachweis.

Abnahmestatus: offen. Bereits belegte BMG-Metadaten, Lage-/Morgenquittungen,
Archive und Kosten bleiben erhalten. Diese Reparaturen ersetzen keine
vollstaendige inhaltliche Kundenabnahme.
