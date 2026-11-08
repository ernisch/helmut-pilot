# Quelleninhalt: Diagnose und kleiner Korrekturvorschlag

Stand: 08.11.2026 UTC. **Teilweise abgeschlossen: Code und gezielte lokale
Prüfungen bereit; PR-Review/CI und produktive Wirkung getrennt. Kein Merge.**
Branch: `codex/quelleninhalt-20261107`, Basis Main `915d15b6`.
Codecommit `618d6f9d`; [PR #1104](https://github.com/ernisch/helmut-pilot/pull/1104)
ist DRAFT und ungemergt. Code und Tests sind zu `5bef1ff4` bytegleich.
Pflicht-CI auf diesem Kopf wird im PR belegt. Der nachfolgende reine
Dokumentationsabschluss unterdrückt mit `[skip ci]` weitere Live-Trigger;
für diesen Dokumentationskopf wird kein grüner Pflichtcheck behauptet.

## Ausgangslage und Grenzen

Die ausschließlich lesende Prüfung bestätigt 436 neue `raw_documents`, davon
361 ohne `summary`, im halb offenen Fenster **05.11.2026 23:00 UTC bis
07.11.2026 23:00 UTC** (6./7. November nach Berlin). Das sind weder 361
Verarbeitungsfehler noch 361 für Cem relevante Meldungen.

Zuordnung über `retrieval_paths.legacy_source_id`: 320 Google-Suchwegdokumente
(317 leer), 64 RSS-Dokumente (1 leer), 8 DIP-Dokumente (keines leer), 44 ohne
statische Zuordnung (43 leer, darunter dynamische Profilquellen). Die Zuordnung
ist eine heutige Kataloglesung, keine wiederhergestellte historische Abrufquittung.

435 Dokumente haben zusammen 442 `document_findings`; alle 442 ohne
`retrieval_path_id`. Fundstellen enthalten Herkunft/URL/Zeit, **keinen Artikeltext**.
Keine der 361 leeren Zeilen trägt alternativen Text in `raw`. Der beschränkte
Rohspiegel `helmut_store/main.rawItems` enthält noch 199 ihrer Artikeladressen;
Adressübereinstimmung allein beweist keinen nutzbaren Text. Sieben leere
Rohdokumente sind bereits mit Wissensobjekten verknüpft; daraus folgt kein
Nachweis einer falschen Modellaussage. 15 nichtleere Zusammenfassungen liegen
exakt an der bisherigen 240-Zeichen-Grenze. Kein Prozent-/Vollabnahmeurteil.

## Nachgewiesene Unterschiede

| Fall | Eingang/Alternativen | Verarbeitung und Relevanz | Urteil |
| --- | --- | --- | --- |
| DGB: dritte Tarifrunde Gebäudereiniger | Echter Google-RSS-Eintrag und gespeicherter Rohspiegel enthalten nur Titel/Herausgeber. Originalartikel liefert zwei ganze, passende Metadatensätze. | Fachlich Tarif-/Beschäftigungsthema; aktueller Cem-Titelfilter nimmt diesen Treffer nicht an. | Fehlender Inhalt am Suchweg, zusätzlich Auswahlgrenze. Kein Parserverlust dieses Google-Texts. |
| Radio Hannover: Altersarmut Niedersachsen | `summary=null`; auch Rohspiegel nur Titel/Herausgeber. | Aktueller Cem-Filter nimmt den Treffer an. Einzelabruf gelingt, vorhandener Extraktor lehnt die abweichende **HTTP-Canonical bei HTTPS-Ziel** ab. | Tatsächlich relevanter Inhalt fehlt. Die Quellenbindung bleibt gesperrt. |
| Bundestag: Aufklärungskampagne „Schieb deine Verantwortung nicht weg!“ | Leere Zusammenfassung; Rohspiegel wiederholt exakt den Titel. | Keine anhand dieses Felds belegbare Artikelprosa. | Kein Beweis für verlorenen Feedtext; Titel wird korrekt nicht als Auszug gespeichert. |
| Bundestag/hib: „Linke fragt nach Zwangsräumungen“ | Echter RSS-Kurztext und Spiegeltext vorhanden. | Wortgetreu durch Normalisierung, minimierte Zeile und echten Promptbauer geprüft. | Funktionsfähiger RSS-Auszug, kein Nachladen nötig. |
| Deutschlandfunk: K.-o.-Tropfen; Bundesregierung: Mauerfall | Vollerer Original-Feedtext im Spiegel; `excerpt` bereits mitten im nächsten Satz bei 240 Zeichen geschnitten. | `sourceExcerpt` bevorzugte den Anzeigeausschnitt. Modelleingabe nimmt anschließend `summary` als `auszug`. | Belegter Verlust der Satzgrenze bei der Speicherprojektion; gefülltes Feld war kein Qualitätsnachweis. Nicht jeder Fall ist für Cem angenommen. |
| Bundesregierung: „Schärferes Recht gegen heimliche Betäubung“ | Ein Originalsatz hat 255 Zeichen, der Anzeigeausschnitt 240. | Innerhalb der unveränderten Speichergrenze passt kein ganzer Satz. | Neue Projektion bleibt ehrlich leer; keine selbst formulierte Kurzfassung. |
| DIP-Drucksache | Nichtleere `summary` enthält Urheber/Ressort; geschlossener `helmutDipQuellfelder`-Beleg vorhanden. | Strukturierte Angaben erreichen den Prompt separat als `dokumentangaben`. | Metadaten sind kein Artikeltext; Feldfüllung beweist keinen Originalinhalt. |
| Die Linke: Kontodaten ändern | Titel einer Formularseite. | Aktueller Cem-Filter verwirft sie. | Kein fachlicher Artikel; keine Nachladepriorität. |

Der Relevanznachlauf benutzt die **tatsächlich gelesenen** Profilzeilen über
`fromMandateProfileRow` → `mergeProfileDefaults` → `relevanteBetriebsDokumente`;
keine Produktsonderregel für Cem. Zusätzlich zur Altersarmutmeldung werden
DGB, Erwerbsminderungsrente und Kontodaten geprüft. Die letzten drei werden
anhand ihrer Titel abgewiesen. DGB und Erwerbsminderungsrente sind fachlich
passende Themen, aber deshalb noch keine angenommenen Verarbeitungsfälle.
Das [Resultat](../../scripts/fixtures/quelleninhalt-20261107/relevanz-result.json)
enthält nur öffentliche Titel/Urteile und den Hash des privaten Profilsnapshots.
Die Profilkopie bleibt außerhalb von Git. Kein historischer Modellprompt wird
aus diesem heutigen Replay erfunden.

## Korrektur

1. `crawler.parseRssItems`: Eine Titelwiederholung in `description` verdeckt
   vorhandenen Text in Atom-`content` oder RSS-`content:encoded` nicht mehr.
   Die bestehende Auszugsprüfung entscheidet; der gewählte Originaltext bleibt
   unverändert. Exakte Tagnamen verhindern die Verwechslung beider content-Tags.
   **Isoliert reproduzierter Parserfehler, kein Nachweis für seine Häufigkeit
   innerhalb der 361 Fälle.**
2. `dedup.sourceExcerpt`: Vorhandene `summary` behält Vorrang; danach wird
   `content` vor dem abgeschnittenen Anzeige-`excerpt` geprüft. An/über der
   Speichergrenze nur ganze Originalsatzpräfixe; ein unbrauchbarer Kandidat
   verhindert keinen brauchbaren alternativen Kandidaten. Kein höheres Textlimit.
3. Relationaler RSS-Adapter → Normalisierung → minimierte Zeile → globaler Dedup:
   tatsächliche Abrufwegkennung explizit weitergeben; Google-Fundadresse aus dem
   bereits erlaubten `raw.originalUrl` in `document_findings` erhalten. Keine
   Katalogkennung für unbekannte dynamische Wege erfinden. Artikelziel bleibt
   separat `url/canonical_url`.

Der bestehende atomare Insert ignoriert Bestandsduplikate weiterhin. Alte
Quellen, Zusammenfassungen und Wissensobjekte werden durch diesen PR nicht
nachträglich repariert. Ganze Originale/Spiegel werden nicht durch neue Texte
ersetzt; die relationale Datenminimierung bleibt bestehen. Kein neues Schema,
keine Infrastruktur und keine Änderung der fachlichen Relevanzregeln.

## Vorhandene Ergänzungswege

`quellen-auszug.fromMirror/fromHtml` bleiben der kleine Weg für belegte
Originalauszüge. Der gespeicherte DGB-Suchtreffer selbst ergibt **keinen** Auszug;
sein Original ergibt wortgetreu:

> Die dritte Tarifrunde im Gebäudereiniger-Handwerk ist ohne Ergebnis zu Ende gegangen. Die IG BAU hält das neue Arbeitgeber-Angebot für völlig inakzeptabel und zeigt sich kampfbereit.

`ergaenzeNeueSuchwegAuszuege` bleibt AUS: neuer Datensatz, direkte Zielbindung,
exakte erlaubte Hosts, bisherige Herausgeber-/Vertrauensprüfung, höchstens ein
Zusatzabruf je Batch. **Keine automatische Inhaltsversorgung aller relevanten
Treffer:** Bestandsfälle und Interessenakteure wie DGB sind davon nicht gedeckt.
Die bei Aktivierung globale Wirkung der Anbietersteuerung ist separat offen.

`artikelkontext-beschaffung` und `artikelkontext-lauf` existieren bereits:
versionierter Quellenhash, bestätigte Reservierung/Ablage, sichtbare Lückengründe,
maximal ein neuer Abruf je Lauf, Restzeit und CAS vor dem Modellstart. Default AUS;
die vorhandene Auswahl ist der erste direkte Medienartikel der Promptmenge,
keine neue Relevanzbewertung. Bei fehlendem Beleg verhindert der aktivierte
Kontextvertrag den Modellstart. Kein Ersatzartikel und kein stilles Füllen von
`summary`. Die laufenden [vorigen Arbeiten](lage-suchwegauszuege-20261106.md)
und die [bereits angewendete Einzelkorrektur](quellenkorrektur-20261107.md)
werden nicht wiederholt.

## Prüfbelege

Alle lokalen Tests über `scripts/lokal.js`, ohne Produktionszugänge; REST und Modell
isoliert. Lokale Quellenprüfung: genau zwei kleine Feeds und zwei einzelne
Originalartikel, keine Google-URL-Auflösung. Die ungewollten zusätzlichen
CI-Abrufe sind nachfolgend ausdrücklich bilanziert. Nur ausgewählte
Originaleinträge/Metatags und öffentliche Spiegeltexte in
[Fixtures samt Hashmanifest](../../scripts/fixtures/quelleninhalt-20261107/manifest.json).

- `quelleninhalt-test.js`: **10/10** Gruppen. Original-Google-/hib-Beispiele,
  Parsergegenprobe, echte Satzabbrüche, alternative Felder, zweifache Projektion,
  Herkunftsbindung, positive DGB-/negative Radio-Originalprüfung und
  **echter REST-Writer/Reader → echter Understanding-Aufrufer → abgefangene
  Modelleingabe**. Originaltext, Dokumentkennung und Artikelziel dort geprüft.
- `quellen-auszug-test.js`: **14/14**; Quelle → Speicherung → Erstverstehen → Karte.
  Alte Erwartung der verlorenen Fundadresse gezielt korrigiert.
- `dedup-quellenkontext-test.js`: **10/10**; `dedup-findings-test.js`: **39/39**;
  `source-dedupe-test.js`: **13/13**; Quellenmodus **2/2** Suiten;
  Crawler-Härtung **1/1** Suite; Kernschutz **14/14** Suiten.
- `artikelkontext-anschluss-test.js`: **20/20**, einschließlich offener Belege,
  Restzeit, Einmalabruf und Sperre vor Modellstart.
- Metadatenfeeds **23/23**, Sachsen-Parser/Dispatch/Projektionen bestanden;
  Berlin-Dispatch **27**, Brandenburg-Dispatch **20** Prüfungen. Der Berliner
  Originaldispatch bleibt mangels historischer Originaldateien ausdrücklich SKIP.
- Syntax und `git diff --check` bestanden. Pflicht-CI zu `5bef1ff4` wird im PR belegt.

Ein versehentlich ohne `--nur-bereich` gestarteter Quellen-Bereichslauf nahm
zusätzlich Standardtests auf und wurde abgebrochen (kein PASS). Die Sandbox
sperrt lokale Server (`listen EPERM`), außerdem gab es unaufgeklärte Nebenfehler
in u.a. Auth-/Deadline-/DIP-Tests. Betroffene Quellenprüfungen und Kernschutz
wurden danach gezielt mit erlaubtem Loopback bestanden; kein pauschaler zweiter
Vollauf. Die notwendige Pflicht-CI bleibt hiervon getrennt.

## Abweichung: bestehende PR-Trigger führten zusätzliche Live-Abrufe aus

Die drei pfadgefilterten Zusatzworkflows wurden vor PR-Erstellung übersehen.
Dadurch liefen entgegen dem beauftragten kleinen Abrufumfang zusätzlich:

| Workflow | Auf Codekopf `618d6f9d` | Auf Dokumentationskopf `5bef1ff4` | Beobachteter Umfang |
| --- | --- | --- | --- |
| Shadow-Pilot | [42428794505](https://github.com/ernisch/helmut-pilot/actions/runs/42428794505), fertig | [42428840330](https://github.com/ernisch/helmut-pilot/actions/runs/42428840330), fertig | Je sechs öffentliche Wege, zusätzlich Egressproben; nur Fetch/Parse/Dedup und Artefakte. |
| Sprint9B-Verifikation | [42428794509](https://github.com/ernisch/helmut-pilot/actions/runs/42428794509), fertig | [42428840436](https://github.com/ernisch/helmut-pilot/actions/runs/42428840436), fertig | Je 25 öffentliche Zielwege, einschließlich Google-Feeds und parlamentarischer XML. |
| PARDOK | [42428794641](https://github.com/ernisch/helmut-pilot/actions/runs/42428794641), fertig | [42428840338](https://github.com/ernisch/helmut-pilot/actions/runs/42428840338), **abgebrochen** | XML-Struktur-/Vorgangsanalyse; beide liefen bereits bis zu gemeldeten 50.331.363 Berliner und 14.171.250 Brandenburger Bytes in der Vorgangsanalyse. Das ist keine Gesamtbytebilanz. |

Bei Entdeckung waren fünf Läufe abgeschlossen. Der sechste wurde per
GitHub-Cancel gestoppt (HTTP202; abschließend `cancelled`), hatte aber ebenfalls
schon Original-XML geladen. Diese Abrufe lassen sich nicht rückgängig machen.
Kein LLM und kein produktiver Daten-/Schalterzugriff durch diese Zusatzworkflows;
sie erhalten nur öffentliche Quellen und schreiben lokale CI-Artefakte.
Ihre Ergebnisse werden **nicht** als beauftragte Abnahme verwertet oder erneut
ausgeführt. Gesamtzahl der HTTP-Requests/Weiterleitungen und Gesamtbytes nicht
vollständig bilanziert. Die Grenze „keine Massenabrufe“ wurde damit nicht
eingehalten; kein pauschales „alle Schutzgrenzen eingehalten“ behaupten.

Der abschließende reine Dokumentationscommit verwendet `[skip ci]`, um diese
Trigger nicht erneut auszulösen. Kein Workflow-/Projekt-/Production-Schalter
wird verändert und kein Required Check künstlich grün gesetzt. Neuer Endkopf
hat damit keine eigene grüne Pflicht-CI; PR bleibt DRAFT/ungemergt. Die laufende
isolierte Pflicht-CI auf dem bytegleichen Codekopf `5bef1ff4` bleibt separat.

## Konkrete Vorlage für eine spätere Einzelkorrektur — nicht ausgeführt

**Kein Schalter muss für den passiven Codefix aktiviert werden.** Vor Merge
konkreten PR-Kopf, Pflicht-CI und Main prüfen; aktueller Auftrag verbietet Merge.
Für die gesonderte Datenkorrektur kann der bereits vorhandene Einzelkorrekturweg
folgendes enges Paket verwenden, ohne automatische Auszugsschalter zu setzen:

| Punkt | Begrenzter Vorschlag |
| --- | --- |
| Ziel | Nur DGB `rd-91e865c2ed9f51f0808802f405e87a409861996458aae3ac4ad50a80dab72798`, URL und Originaltitel wie obige Probe, Publikation `2026-11-06T09:26:29Z`. |
| Änderung | Ausschließlich `summary=null` → exakt obige zwei Originalmetadatensätze plus vorhandener Herkunfts-/Hashbeleg. Vorher vollständiges Preimage sichern; bedingtes Schreiben an ID, URL, Titel, Publikation und leeren Auszug binden. Bei Drift stoppen. |
| Kosten/Wirkung | 0 neue Quellenabrufe mit dem gesicherten Original; 0 Modellaufrufe; 1 Dokumentkorrektur, keine KO-/Profil-/Budget-/Schalteränderung. **Noch keine Lieferzusage:** aktueller Relevanzfilter verwirft diesen Titeltreffer; kein erzwungener Lauf daraus. |
| Nachkontrolle | Exakte Originalsatzgleichheit und Herkunftshash nativ rücklesen; übrige Spalten mit Preimage vergleichen. Offline an derselben gebundenen Quelle die Promptübergabe prüfen. Kein Nachweis bloß über Feldfüllung/Länge. |
| Rückweg | Nur bei exaktem unverändertem Nachherhash die eigenen Ergänzungsfelder bedingt auf das gesicherte Preimage zurücksetzen. Keine späteren fremden Änderungen überschreiben. |

Für Radio Hannover gibt es **keine** schreibreife Ergänzungsvorlage: kein durch
den vorhandenen Extraktor gebundener Auszug. Für pauschales Einschalten der
beiden Nachladewege fehlt ein begrenzter relevanter Kandidatenplan samt aktueller
Anbieterwirkung; hier keine Freigabe oder Aktivierung vorschlagen.

## Offene Grenzen und nächster Schritt

Die 361 Bestandslücken bleiben unverändert; Parserhäufigkeit und historische
Modellprompts sind nicht vollständig rekonstruierbar. Der erkennbare relevante
Radio-Fall bleibt offen. Fachliche Titel-/Relevanzverluste bei DGB und
Erwerbsminderungsrente bleiben separate, belegte Auswahlgrenzen. Kein bezahlter
Modell-, globaler Verarbeitungs- oder Produktivnachweis.

**Genau ein nächster Schritt:** Den PR mit den Endkopf-Prüfungen fachlich
reviewen; keine Aktivierung und kein Merge in diesem Auftrag.
