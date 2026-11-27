# Gezielte Morgenreparatur vom 27.11.2026

## Anlass und tatsächlicher Betriebsstand

Die Abnahme auf `e93b45e9` ist gescheitert. Der normale Kundenleser lieferte
am 27.11. um 07:29:22 und 07:32:11 Uhr Berlin die quittierte Teilfassung mit
64 Meldungen. Es gab keinen freigegebenen Lage-Text. Die zwölf Pflichtabrufe
enthielten zehn vollständige und zwei teilweise Quittungen; von 84 exakt
referenzierten Analysen waren 83 erledigt und eine terminal gesperrt.
Private Originale und Hashmanifeste bleiben außerhalb von Git erhalten.

Die direkte Lesung um 11:39 Uhr bestätigte den weiterhin regulären Hetznerbetrieb,
1.552 fällige Analysen und 105 fällige Abrufe. Eine spätere Lesung um 11:42 Uhr
ergab 41 seit 01:00 Uhr abgeschlossene terminale Dokumentaufträge. Das ist eine
zeitbezogene Fehlerbilanz, kein Auftrag zur pauschalen Bestandsänderung.

## Nachgewiesene interne Fehler und kleine Korrekturen

### Amtlicher HIB-Archivstand im nativen Leser

Vier der zwölf heutigen Quellenstandfehler betreffen gültige amtliche HIB-Fassungen.
Der native Datenbankleser liefert den Abrufpfad als `quellenabrufpfad`; vollständige
Rohzeilen führen ihn in `raw.retrievalPathId`. Die bestehende Abbildung überschrieb
das projizierte Feld mit `undefined` und rekonstruierte die Gegenseite nicht.
Dadurch wurde eine erlaubte Metadatennormalisierung als Textabweichung klassifiziert.

Der Leser bildet beide bereits unterstützten Formate auf den unveränderten engen
Vertrag `amtlicherHibFeedstand` ab. Keine neue Herausgeber-/Titel-Ausnahme:
Identität, Host, Pfad, amtlicher Titelzusatz, Zeitfenster, Quellenbindung,
Archivhash und geschützter Konfliktbeleg bleiben erforderlich.
Der neue Fall durchläuft den echten Projektionsleser, die Einreihung und den
Dokumenthandler bis zum unveränderten Klassenriegel. Negative Titel-, Herausgeber-,
Pfad-, Zeit- und manipulierte Archivfälle bleiben gesperrt.

Diese vier Fehler entstanden erst nach dem Morgen. Sie erklären nicht nachträglich
die bereits um 01:01 Uhr entstandenen Teilquittungen von DIP und Bundesregierung.

### DIP-Metadaten im Lage-Auszug

Eine gespeicherte Urheberbezeichnung wurde als `summary` an das Modell übergeben.
Die Lage-Erzeugung machte daraus ein nicht belegtes Vorlegen einer Drucksache,
obwohl der typisierte Urheberbeleg `einbringer=false` enthielt.
Nur die exakt bekannte Urheber-/Ressortlabel-Projektion entfällt jetzt im
Artikel-Auszug. Originaltitel, Dokumenttyp und sämtliche true/false/null-Rollen
bleiben vollständig sichtbar. Echte Textauszüge und andere Quellen bleiben erhalten.

Erzeugung und Prüfung bekommen dieselbe Feldregel: Eine konkrete Titelbehauptung
darf ausdrücklich der Quelle zugeschrieben werden; Metadatenlabels beweisen keine
Handlung. Bloße Themenüberschriften, Rollenverwechslungen, zusätzliche Behauptungen
und Widersprüche bleiben unzulässig. Kein negatives Urteil wird umgedeutet.

Die zweite ursprüngliche Ablehnung wegen eines fehlenden Auszugs widersprach bereits
der vorhandenen Titelregel. Besseres tatsächliches Modellverhalten ist offline nicht
beweisbar. Beide ursprünglichen Negativurteile bleiben gespeichert und ungültig.
Die korrigierte Quellenprojektion ändert den Eingabehash. Ein künftig regulär
autorisierter Lage-Termin kann dadurch eine neue Eingabe sehen; kein zusätzlicher
Modellaufruf oder manueller Retry wird durch diese Reparatur gestartet.

### Kurzzeitige Auth-Speicherlesestörung

Originale Supabase-Transportprotokolle belegen während des unbekannten Kostenabschlusses
um 01:33 Uhr Berlin HTTP 520/521, unter anderem beim KO-Schreiben, bei Klassenfreigabe,
Auth-Lesen und der Abschlussquittung. Ein Providerausfall von Azure ist damit nicht belegt.
Der unbekannte historische Modellausgang lässt sich daraus nicht als kostenlos oder
erfolgreich auflösen.

Auth-GETs konnten bisher eine kurze transiente Störung nicht auffangen.
Sie lesen jetzt höchstens dreimal innerhalb derselben bisherigen Anfragefrist.
Der Zeitdeckel umfasst alle Versuche einschließlich Warteschlange und Antwortinhalt.
Permanente Rechtefehler und ungültige Antwortstrukturen bleiben geschlossen.
Kein POST/PATCH wird dadurch wiederholt, keine CAS-Grundlinie oder Mutationsfrist
geändert. Bei fortdauernder Störung bleiben Kosten-/Modellausgang unbekannt.

### Falsche Nicht-Aufruf-Meldung nach dem Modellstart

In acht Fehlerpfaden von Erstverstehen und Aktualisierung wurde nach einem möglichen
Modellversand zusätzlich `keinAufruf=true` mit Modell `none` protokolliert. Dies
erklärte den widersprüchlichen Nullkosten-Marker beim heutigen unbestätigten
Kostenabschluss. Diese acht Meldungen entfallen: Den Kostenbeleg schreibt weiterhin
ausschließlich die bestehende KI-Engstelle. Fachfehler bleiben in Ergebnis und CAS
sichtbar. Die beiden belegten Budget-Nichtstarts behalten ihre Nullkosten-Meldung.

Der gezielte lokale Sender-/Kosten-/CAS-Verbundtest reproduzierte zunächst acht
falsche Nicht-Aufrufe. Nach der Korrektur bestehen alle zehn Fälle: Erst-/Updatepfad
jeweils mit unbestätigtem Kostenabschluss, Nullantwort, ungültigem Inhalt und
unklarem Speichern sowie zwei Budget-Gegenfälle. Ein zweiter Modellstart bleibt
gesperrt. Bei unbestätigtem Kostenabschluss bleiben exakt 212.000 Mikro-USD gebunden;
bei bestätigter Antwort bleibt der echte Senderbeleg erhalten. Bestehende
CAS-Prüfungen 107/107 und Nutzungsprotokoll-Prüfungen 38/38 bestehen weiter.
Historische falsche Marker und unbekannte Ausgänge werden dadurch nicht verändert.

## Gezielte Nachweise

Keine erneute Monats- oder allgemeine Lastsimulation; keine bezahlten Testaufrufe.
Alle lokalen Prüfungen verwenden den vorhandenen `scripts/lokal.js`-Netzschutz.

- Neue Auth-Lesestörfälle: vor Korrektur 2 FAIL / 2 PASS, danach 4 PASS.
- Auth-CAS einschließlich Parallelität, Antwortverlust und neuer Lesefälle: 20/20.
- Auth-Leseprojektion und Schreibschutz: 18/18.
- Artikel-Versionskonflikte mit nativer HIB-Projektion: 12/12;
  neuer HIB-Fall scheiterte vor der Korrektur.
- Lage-Quellenbeleg: 21/21, Dokumentbindung erfolgreich;
  erweiterte Prüfquellenregression einschließlich unveränderter negativer
  Fortsetzungen und synthetischer Metadaten-Gegenfälle erfolgreich.

Die bisherigen Monats-/Störfallnachweise bleiben datierte Nachweise ihrer jeweiligen
Stände. Die neue Reparatur behauptet weder eine bestandene Produktionsabnahme noch
eine Wiederholung der bisherigen 604 Prüfungen.

## Übrige Fehlerklassen und offene Bestandsentscheidungen

Die 41 Endzustände verteilen sich auf:

| Klasse | Zahl | Behandlung |
| --- | ---: | --- |
| Quellenstandfehler | 12 | Vier HIB-Lesefehler korrigiert; acht echte Titel-/Herausgeber-/Datumsabweichungen geschützt |
| `skipped-failed` | 12 | Sieben historische fehlgeschlagene KOs mit unbekanntem CAS und jeweils altem KI-Start; keine zwölf neuen Modellfehler |
| DIP-Quellfelder | 2 | IDs 292779/292778; ohne gespeicherte Originalantwort kein belegbarer Untervalidator-Fix |
| Budgetwartefrist | 13 | Historische Wartefristen von 49 bis 162 Stunden; bestehende 48-Stunden-Wache erhalten |
| Artikelzustand offen | 1 | Kein aus der Quittung sicher rekonstruierbarer Unterausgang |
| Neuer CAS-UNKNOWN | 1 | Unbestätigter Kostenabschluss, Reserve erhalten |

Insbesondere `f346fe50-dadb-4139-b68a-b78fd88cf4ea` bleibt geschützt:
kein belegter Modellausgang, 0,212 USD weiterhin gebunden.
Ein fehlerhafter Skip-Log mit `keinAufruf=true` entlastet diese Reserve nicht.
Die zwei freigegebenen Regierungsfassungen sind nativ mit neuem Ergebnis,
Archivlektüre und fertigem CAS belegt. Der gezielte Bundestagsneuversuch wartet
weiterhin. Die unbestätigte 01:30-Laufquittung bleibt historisch offen.

Die Codekorrektur entsperrt weder terminale Jobs noch CAS-Zustände.
Ein notwendiger Eingriff braucht exakte frische Vorwerte, konkreten aktuellen Bedarf,
zulässige Fassung, Kostenbindung, freien Eigentümer/Lease und einen belegten Rückweg.
Verbrauchte Einzelgenehmigungen von PR #1359 werden nicht erneut verwendet.
Keine pauschale Löschung, Erledigung oder Wiederaufnahme des Altbestands.

## Rolloutgrenze und Rückweg

Reiner Code-Rollout innerhalb der vorhandenen Freigabe erst nach unabhängigem Review
und beiden grünen Pflichtprüfungen am endgültigen PR-Kopf. Die bestehende Hetzner-
Updateautomatik und das normale Vercel-Deployment verwenden denselben Merge-Stand.
Keine Produktionsmigration, Daten-, Profil-, Cron-, Env- oder Budgetänderung.
Grenzen bleiben 1 USD/UTC-Tag, 30 USD kumulativ, 100 Hetzner-Aufrufe und 16 Originale.
GIZ-Veröffentlichungsriegel und bestehende Zeitungssperre bleiben unverändert.

Rückweg ist die Rücknahme dieser Codeänderungen auf den zuvor gebundenen Stand;
die aktive Veröffentlichungs-Policy muss erhalten bleiben. Historische Daten,
Reservierungen, Negativurteile und Laufquittungen werden nicht zurückgesetzt.
Nach Deployment tatsächlichen Code/Ort, reguläre Jobs und Kosten rein lesend prüfen.
Das vollständige Morgenbriefing bleibt bis zum nächsten echten Produktionsnachweis offen.

