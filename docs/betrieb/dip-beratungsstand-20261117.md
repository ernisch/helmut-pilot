# DIP-Beratungsstand: produktive Verbindung, 17.11.2026

Auftrag und Dateizustaendigkeiten: [#1218](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951450665).
Basis `2023dfd5` nach PR1249–1251; deren Reparaturen werden nicht wiederholt.
**Teilweise: lokal geprueft; unabhaengiges Endkopfreview, Pflicht-CI,
regulaerer Rollout und neuer regulaerer Verarbeitungsbeleg noch offen.**

## Belegkette

1. `dip.js:getQueueDocuments` verwendet weiterhin dieselbe Profilfilterung,
   Anbieterzulassung, Quellenklassenlease, absolute Auftragsfrist und den
   vorhandenen Drucksachencache. Kein zusaetzlicher Quellenauftrag.
2. Der vorhandene Faktenleser `dip-vorgangsfakten.js:lese` erhaelt im
   Vorgangsmodus nur eine amtlich am Dokument gebundene DIP-Vorgangskennung.
   Er liest den festen amtlichen Vorgang, dessen Positionsliste und denselben
   Vorgang erneut; eine zwischenzeitliche Aenderung verwirft die Aufnahme.
3. Root-`beratungsstand` ist die ausdrueckliche DIP-Angabe, kein aus Titel,
   Reihenfolge oder historischem Beschluss errechneter Endstand.
   `datum` des Vorgangs bleibt **letztes Dokumentdatum**; Positionsdatum,
   DIP-Entitaetsaktualisierung und tatsaechlicher Abrufzeitpunkt bleiben getrennt.
   Ueberweisungen, Federfuehrung, Beschluesse und ihre Einschraenkungen stammen
   aus derselben bereits vorhandenen strengen Positionsnormalisierung.
4. `dip-beratungsstand.js` legt validierte Hashbelege insert-only im vorhandenen
   globalen `helmut_store` ab: `<storeId>-dipstand-<VorgangId>-<Hash>`.
   Kein Ueberschreiben von Originalen, keine Migration oder Kundenzeile.
   Auch nach verlorener Schreibantwort wird Erfolg nur durch exakten GET-Readback
   bestaetigt; kein blinder Schreibretry. Historische Belege bleiben erhalten.
5. `storage.js:getSourcesForVorgang` ergaenzt seine vorhandenen, bereits
   mandatsgebunden gelesenen Originale ausschliesslich um gespeicherte
   oeffentliche DIP-Staende. Produktlesen laedt keine amtlichen Daten nach.
   Quellen-ID, Original-URL, Vorgangskennung, Vorgangstyp und Hash muessen passen.
6. Der gemeinsame `quellen-hinweis.js`-DTO erreicht bestehende Quellenzeilen
   von Lage, Radar und Briefing. `client.js` zeigt Vorgangsidentitaet,
   DIP-Stand, Abrufdatum und getrennte Originalbelege; historische Schritte
   sind aufklappbar. Keine neue Prioritaet, KI-Aussage oder Handlung daraus.

## Konservative Grenzen

- Hoechstens zwei neue Vorgangsaufnahmen je regulaerem DIP-Auftrag, je drei
  amtliche GETs unter derselben Anbietersteuerung. Frische gespeicherte Belege
  werden 30 Minuten wiederverwendet; Folgeauftraege erreichen weitere Kennungen.
  Kein neues Kontingent, Zeitfenster, Cron oder Modellaufruf.
- Hoechstens zwoelf eindeutige Vorgangskennungen je Leseschritt; fuer weitere
  bleibt der Stand unbekannt. Ein Abruf beginnt nur bei mindestens 25 Sekunden
  Restfrist. HTTP bleibt auf 12 Sekunden und 128.000 Antwortbytes begrenzt.
- Positionsverlauf nur bei vollstaendiger Liste mit hoechstens zwoelf Positionen.
  Sonst bleibt die explizite Root-Angabe erhalten, der Verlauf aber unbelegt;
  keine teilweise Liste als vollstaendige Chronologie.
- Fehlende/fremde/defekte Belege erhalten den echten Dokumentinhalt und ergeben
  einen unbekannten Stand. Alte DIP-Dokumente ohne gespeicherte Vorgangsreferenz
  zeigen die fehlende Zuordnung ausdruecklich; kein Backfill aus Aehnlichkeit.
- Jede Anzeige nennt: **Spaetere Aenderungen sind nicht bestaetigt.** Ein alter
  Beschluss wird nicht als heutiger Endstand oder automatisch als Frist ausgegeben.
- Die neuen oeffentlichen Archivzeilen sind in der extern festzulegenden
  Quellenaufbewahrung zu beruecksichtigen; kein Loeschvollzug wird aktiviert.
  Fs Rechtsdossier bleibt massgeblich fuer offene externe Entscheidungen.

## Tatsaechliche lokale Pruefungen

Alle lokalen Pruefungen ueber `scripts/lokal.js`, mit HTTP-Ersatz bzw.
gesperrtem Browsernetz, ohne Productionzugriff oder Modellaufruf:

| Pruefung | Ergebnis / Reichweite |
| --- | --- |
| `dip-beratungsstand-test.js` | 15/15 Gruppen: echter Faktenleser, unveraenderliche Ablage/Readback, Auftrags- und Produktaufrufer, Cachefortschritt/Anbietersperre, Identitaets-/Zeit-/Hashfehler und drei echte Quellenrenderer |
| Derselbe Test `--browser` | Echter Chromium bei 390/1280 Pixeln; drei Quellenansichten, sichtbarer Folgestandhinweis, getrennte Links, kein Ueberlauf; Client-Bytes SHA256 `5b85cf6bc897b7efde38d7def0031ef10cb50c8f878794b3100c982939f9f157` |
| Vorhandene Faktenleser-/amtliche-/Profilpruefung | 18/18, 4/4 Gruppen mit elf aufgezeichneten amtlichen Einzelaussagen, 11/11 |
| Vorhandene Quellfelder-/Vorgangsbezugspruefung | 16/16 und 10/10 |
| Vorhandene Parlamentsdaten-Quellen-UI | 13/13 einschliesslich unveraenderter Destatis-/iRights-Hinweise |
| Vorhandener schneller Kernschutz | 14/14 |
| `seed-drift-test.js` | Generiertes Repoartefakt stimmt wieder bytegenau mit unveraendertem Generator ueberein; keine SQL-Ausfuehrung |

Die neue Integrationssuite verwendet aufgezeichnete amtliche Positionen aus der
vorhandenen Fixture und ein **synthetisches Vorgangsaggregat**. Sie behauptet
keinen neuen aktuellen DIP- oder Kundenstand. Amtliche OpenAPI am 17.11.
nur als Dokumentation gelesen: `https://search.dip.bundestag.de/api/v1/openapi.yaml`,
SHA256 `95b2e852649cff71021de2497628c3158070ecbfc9dbd15651ae485b7379c6ff`;
identisch zum vorhandenen Fixture-Schemabeleg.

Erster eigener Codefehler erhalten: Rueckpruefung normalisierter Positionen
scheiterte zunaechst an `stand-bindung`; Feldrueckfuehrung und optionale
Nullfelder korrigiert, danach obige Integrationspruefung erfolgreich.
Ein lokaler Sockettest benoetigte ausserhalb der Sandbox dieselbe unveraenderte
Pruefung; die zunaechst fehlende VM-URL-Umgebung war ein Testharnessfehler.

## Koordinierte Integration und fehlende Betriebsbestaetigung

Fs isolierter Retentionsdiff PR1252 / `726cb334` wurde von D unabhaengig gelesen:
kein Codeeinwand; Merge wegen Pflicht-CI44111286665 gesperrt. Vier Fehler sind
auf unveraendertem Main bestaetigt. E uebernimmt seine drei Transport-/Deadline-
Testvertraege, D das bestehende generierte Bund-Seed-Artefakt. Deren Unterschied
ist ausschliesslich die bereits im Modell enthaltene **pausierte** BMG-Meldungen-
Zeile mit zwei Paketbindungen. Kein CI-Gate oder Generator wird abgeschwaecht.

Integration ausschliesslich durch D, nacheinander, nach unabhaengigem Review
und beiden gruenen Pflichtchecks am jeweiligen Endkopf. Danach regulaeres
Git-Deployment und lesender Nachweis; kein CLI-Deploy oder Productionwrite.
Rueckweg: gezielter Code-Revert nach denselben Regeln; immutable Belege
muessen nicht zurueckgespielt oder geloescht werden.

Der bisherige Productionbeleg von 14:10 UTC bestaetigt weiterhin keinen neuen
regulaeren Verarbeitungsabschluss nach den damaligen Reparaturen. Ein spaeterer
READY-Rollout allein bestaetigt weder neue DIP-Staende noch Mandatsauslieferung.
Ausschuesse/Tagesordnungen/Termine und ihre neuen Textrechte bleiben Es/Fs
getrennte, noch nicht aktivierte Wege. Keine vollstaendige Quellen-/Verkaufsabnahme.

**Naechster Schritt:** fertigen Integrationskopf unabhaengig pruefen und mit
unveraenderter Pflicht-CI sequenziell integrieren.
