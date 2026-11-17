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

Beide Reparaturen sind implementiert. Die Destatis-Suite besteht 9/9 Gruppen:
echter 320-Zeichen-Auszug, SQL-/JSONB-Roundtrip, Manipulations- und Rechtefaelle,
beide Dedup-Richtungen, Attribution in Lage/Radar/Briefing, exakter Archivadapter
und wirklicher Storage-/Queue-/Archivaufrufer mit ersetztem HTTP. Die alte
Google-Zeile bleibt bytegleich; das neue Dokument wird kein kanonisches URL-Ziel.
Bestehende Fach-/Parteiquellen-, Dedupkontext-10/10-, globale Dedup-39/39- und
EUR-Auszug-17/17-Pruefungen bestehen ebenfalls; kein externer Aufruf.
PR #1249 ist unabhaengig geprueft und mit beiden gruenen Pflichtjobs am Kopf
`06a63b39b1f0ae25da99ffdbbdc297f57209eaf4` integriert; CI44085591443.
Merge `5c01f345f9bde2542c724c27abd90ef2989d463a`, MainCI44086115971 ebenfalls
beide Pflichtjobs gruen. Vercel `dpl_GL6m4WkkaSUsxx8KZSrsW6GVFWpP` regulaer
ProductionREADY; oeffentlicher Alias HTTP200/client.js?v=5c01f345 bestaetigt.
Schnellkern und sechs betroffene Suiten, keine Mengen-/DB-Pruefung. Der echte
Chromium-Desktop-/Mobilbeleg aus PR1246 wird fuer unveraenderte UI wiederverwendet;
kein neuer Chromiumlauf oder Browser-PASS behauptet.
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
RSS-Eintrag. Der lesende echte Archivabgleich bestaetigt den nativen SHA256
`ead997ecc3e43032e68f606d21ec9127146a68fe415036c2e353e20709edae90`,
Titel, Datum und Text. Das gespeicherte offizielle Original-Finding besitzt
jedoch `retrieval_path_id=NULL`; der erste Adapter wies diesen Altfall ab.
Der bestehende Vertrag `20260715_dedup_findings.sql` definiert dieses Feld
ausdruecklich als optionalen weichen Verweis, ausserhalb des Finding-Schluessels.
Folge-PR #1250 erlaubt deshalb ausschliesslich NULL/fehlend; falsche nichtleere
Pfade sowie Leerstring/false/0 bleiben gesperrt. Alle anderen Bindungen bleiben.
Gegenfaelle zuerst rot, gezielte bestehende RSS-Suite danach 9/9 gruen;
unabhaengiges Review ohne Blocker. Keine zusaetzliche technische Grundursache
oder zweite wiederhergestellte Quelle zaehlen: dies ergaenzt denselben Fall.

Echter rein lokaler Replay auf dem lesenden Snapshot vom17Nov12:44:47UTC
mit demselben vorliegenden Primaer-RSS bestaetigt nun die Akzeptanz:
320Zeichen, amtlich07:00UTC, neue Kennung
`rd-635871adf86344f67e0b7b29058b3d4b3f8cd4d5e71bc844d439c876d2060ebb`.
Archiv und Finding bleiben bytegleich; keine nachgetragene Pfadkennung.
Dies belegt die sichere Wiederverwendbarkeit vorhandener Originale, keine
neue Production-Speicherung, Analyse, Jobfortsetzung oder Kundenversorgung.
Noch keine neue Analyse, Speicherung oder Abschlussquittung behauptet.

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

## Anschlusspruefung A: parlamentarische Originale am 17.11.

Basis `main 1a797c6c`, Koordination und Dateireservierung in
[#1218](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6949297979).
PR1249/1250 werden nicht wiederholt. A integriert allein und nacheinander;
B bearbeitet nach C-01 nur den reservierten Kundenrenderer und seinen bestehenden
Quellenhinweistest; C bleibt unabhaengig lesend. A besitzt zusaetzlich den vorab
reservierten engen CI-Vertrag. Keine neuen Quellenfenster,
Jobstarts, Modellaufrufe, Profilwrites oder Paketaktivierungen.

Die aktuelle amtliche Mandatsbiografie wurde mit den benoetigten Rollen
abgeglichen: ordentliche und stellvertretende Mitgliedschaften getrennt behandeln;
Landeslisteneinzug ist kein Direktmandat. Der geografische Wahlkreisbezug und die
Bundestagsebene ersetzen einander nicht. Individuelle Profil-/Betriebsdaten werden
hier nicht veroeffentlicht. Es erfolgte keine Profilkorrektur.

### Direkt lesbare amtliche Alternativen

Die Ausschussseiten verlinken eigene Tagesordnungsseiten. Deren HTML enthaelt
zunaechst eine leere Tabelle; die jeweilige Seite benennt ihren oeffentlichen
`/ajax/filterlist/...`-Endpunkt. Dessen Antwort liefert konkrete Original-PDFs,
einschliesslich Wirtschaft/Energie, das im gemeinsamen RSS fehlte. Die hier
geoeffneten PDFs wurden lokal als Text gelesen, nicht nur auf HTTP200 geprueft.
Das ist eine begrenzte Primaerpruefung, kein Quellenimport oder Produktbeleg.

| Bedarf | Primaerbeleg und tatsaechlicher Inhalt | Kleinster noch noetiger Schritt / Grenze |
| --- | --- | --- |
| Arbeit/Soziales: naechste Ausschusssitzung | [Amtliche Liste](https://www.bundestag.de/ausschuesse/a11_arbeit_soziales/tagesordnungen), [Original-PDF](https://www.bundestag.de/resource/blob/1231704/TO-45-Sitzung.pdf): Mitteilung vom 06.11., Termin 26.11., 08:00 Uhr, TOP aktuelle arbeits-/sozialpolitische Themen | **Quellenwiderspruch erhalten:** Listentitel/Dateiname nennen die 45., der PDF-Inhalt die 44. Sitzung. Keine Nummer still korrigieren oder als eindeutig ausgeben. Termin ist keine persoenliche Anwesenheitspflicht. |
| Wirtschaft/Energie: geaenderte Tagesordnung | [Amtliche Liste](https://www.bundestag.de/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung), [Grundfassung](https://www.bundestag.de/resource/blob/1231438/to_59_11-11-2026.pdf) vom 05.11. und [4. Ergaenzung](https://www.bundestag.de/resource/blob/1232506/to_59_11-11-2026_4-ergaenzung.pdf) vom 10.11.: 59. Sitzung am 11.11.; Beginn von 10:30 auf 09:00 Uhr geaendert | Grundfassung und Ergaenzungen zusammen lesen; alter Beginn ist ueberholt. Oeffentlich gelistete letzte Sitzung ist kein Nachweis, dass keine weitere geplant ist. |
| Digitales/Staatsmodernisierung: TOP und Voten | [Amtliche Liste](https://www.bundestag.de/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen), [Grundfassung](https://www.bundestag.de/resource/blob/1230840/TO-38-Sitzung.pdf) vom 06.11., [1. Ergaenzung](https://www.bundestag.de/resource/blob/1232288/TO-38-Sitzung-1-Ergaenzungsmitteilung.pdf) vom 10.11.: 38. Sitzung, 11.11., 14:30 Uhr; TOP12 Cybersicherheit, 21/6585 und 21/7406, Votenfrist 11.11. | Vergangene Frist nicht zu heutigem Handlungsauftrag machen; Mitberatung ist keine Federfuehrung. Ergaenzung ist kein Beschluss-/Erledigungsnachweis. |
| Plenum: kommende Beratungen | [Tagesordnungsseite](https://www.bundestag.de/parlament/plenum/tagesordnungen), [komplettes Original](https://www.bundestag.de/resource/blob/473452/Tagesordnung-komplett.pdf), Stand 12.11.: Sitzungen110–113 am 24.–27.11.; Haushaltsberatung2027 mit konkreten Drucksachen | Standdatum, jeweiliger Beginn und Beratungsgegenstand getrennt erhalten; geplanter TOP belegt keinen gefassten Beschluss. Die stabile PDF-URL allein identifiziert keine unveraenderliche Fassung. |
| Sitzungswochen | [Kalenderseite](https://www.bundestag.de/parlament/plenum/sitzungskalender), [amtlich verlinktes ICS2026](https://www.bundestag.de/resource/blob/1103938/Parlamentstermine_2026_ics.ics): naechste Woche23.–27.11. (`DTSTART=20261123`, exklusives `DTEND=20261128`) | Ganztages-Zeitraum und exklusives Ende beachten. `DTSTAMP` ist kein Publikations-/Sitzungsdatum. Wochenkalender ersetzt weder konkrete Ausschusstermine noch Tagesordnung. |
| Verfahrens-/Beratungsstand | Bestehende DIP-Dokumente tragen Vorgangskennungen. `lib/helmut/dip-vorgangsfakten.js` kann explizite Positionen als Beschlusstenor/Ueberweisung samt Federfuehrung lesen; im geprueften main existiert ausser Tests kein Aufrufer dieses Lesers | Technisch vorbereitet, keine produktiv belegte Standversorgung. Keine neue Runtimeverdrahtung allein aus diesem Bestand ableiten; Dokumenttyp/ID und Titel sind kein aktueller Verfahrensabschluss. |

SHA256 der tatsaechlich gelesenen Originalbytes, nicht einer Textkonvertierung:

- Arbeit/Soziales: `1f01c77ff3b12bc49e302ede6fb27dc77a145616a385f7529b0dfb68b60c4c82`.
- Wirtschaft Grundfassung: `126552de8e940d0d84741400c643301e519f46db058595d2a184283b7382f0cb`;
  vierte Ergaenzung: `f47afe252992381f46635a1309502cb16be52342e81580bcbbbf150a9fc7d02b`.
- Digitales Grundfassung: `e37ed0b817c77a95ef7cd1b904a18d0c307d697a3533c2c52fb3e2335b8cb713`;
  erste Ergaenzung: `ae2a030b007026b4c4c7cbee2ce1b0096c1fea99c7cb7ec443c0603db7c5d632`.
- Plenartagesordnung: `f5dc7efd944695a2dbc6fa73ae68c09fd88d8c0a98f2fd230a5b40a5f123a75c`.
- ICS2026: `0b134ea87f2029efd7e164be3d5b98d52009464a7b57f6beca4008fa92a0fc37`.

### Abnahme und Rechte bleiben getrennt

**Katalog / technisch vorbereitet / aktiv / regulaer abgerufen / lesbar /
rechtlich nutzbar / im Produkt belegt sind sieben verschiedene Aussagen.**
Die obige manuelle Lesbarkeit schliesst keine fehlende Stufe der Produktkette.
Insbesondere umfasst der primaer belegte §5-Hinweis zu Drucksachen und
Plenarprotokollen nicht automatisch sonstige Ausschuss-PDFs, Webseiten, hib oder
RSS-Texte. Ohne konkret belegten Nutzungsumfang keine kommerzielle Textaktivierung.
Die amtlichen Termin-/TOP-Fakten und Originalverweise sind jetzt eingegrenzt;
vollstaendige laufende Aufnahme, Fassungskette, Leserecht und Kundenanzeige bleiben
offen. Nichtoeffentliche Sitzung und oeffentlich abrufbare Tagesordnung ebenfalls
auseinanderhalten; keine nicht veroeffentlichten Sitzungsinhalte behaupten.

C hat unabhaengig [C-01 und C-02](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6949411072)
abgegrenzt: der Client verwirft den transportierten Destatis-Hinweis; ein
Destatis-Dokument im Digitalpaket belegt ausserdem noch keinen Digitalthemenbezug.
C-01 ist durch Bs unveraendert uebernommenen Code-/Testcommit
`2e2c1b744058754661d8543b3eba809f75025008` in PR1251 gezielt repariert:
13/13 vorhandene UI-Gruppen inklusive Gegenfaellen und zwoelf Quellenansichten;
Bs echter isolierter Chromium-Mobilbeleg zeigt24 Hinweise. Das ist ein lokaler
Browserbeleg, keine echte Kundenversorgung. C-02 bleibt eine fachliche
Beleggrenze und kein Anlass fuer neue Pruefinfrastruktur. Vorhandene echte
DIP-/BMAS-Abschluesse vom15.11. bleiben erhalten. BMG-Metadaten, Archive und zwei
Lage-Teilstandabsaetze werden nicht zu einer heutigen Vollversorgung aufgewertet.

Der enge CI-Vertrag bindet Basis, PR, Branch, Bs zwei Runtime-/Testblobs und den
sonst unveraenderten Baum. Er behaelt beide Pflichtjobs, Schnellkern, die
vorhandenen RSS-/Hinweistests und echte Kundenansicht-/Prosa-Browserpruefungen. Bs
gezielter Mobilbeleg wird als solcher erhalten. Keine pauschale Auswahl der
245 Bereichssuiten oder Mengen-/DB-Laeufe. Unpassender Kopf stoppt vor Auswahl;
kein genereller Skip oder Rueckfall auf einen breiten Lauf bei Bindungsfehler.
Der allgemeine Browser-Smoke in CI44095446372 scheiterte an einer alten
Briefingfixture (`primaryItem=null`, Zeile971), nach erfolgreichem Boot und
Navigation. Dieser Erstfehler bleibt erhalten; kein gruener Altlauf behauptet.
Fuer diesen reinen Anzeigefix laeuft stattdessen der vorhandene gezielte
Kundenansicht-Browser (`--briefing-qualitaet`) auf Desktop/Mobil. Der lokale
Quellenhinweis-Mobilbeleg von B mit24 Hinweisen bleibt ausdruecklich ein
wiederverwendeter lokaler Beleg, kein neuer CI-PASS des isolierten Browserteils.
CI44096149470 stoppte vor dessen Browserstart am bereits vorhandenen anderen
Chromium-Launcher. CI44096609451 bestand UI13/13, scheiterte danach im isolierten
Benutzer-Namespace am Zugriff auf die Checkoutdatei. Beide FAIL bleiben erhalten.
Keine weiteren Host-/Systemrechte werden veraendert; der begrenzte CI-Vertrag
verwendet die bestehende normale Playwright-Kundenansicht. Keine Anwendungsregel
oder Browserpflicht wird gelockert.
Merge, Pflicht-CI und regulaeres Deployment werden am exakten Kopf im PR belegt.

Genau ein naechster Schritt nach gruener Integration: beim naechsten regulaeren
Verarbeitungsabschluss die tatsaechliche Quellen-/Attributionsanzeige abnehmen;
keine neue Verarbeitungsserie ausloesen.
