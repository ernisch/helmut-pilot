# Blocker 2: Quellenzeit für zusätzliche Briefingkandidaten

Stand 08.10.2026, vor Merge von [PR #872](https://github.com/ernisch/helmut-pilot/pull/872). Production weiterhin `d6147232add23e83b39e15235a290552d96703cb`; noch kein neuer Production Eingabeabruf. Die [tatsächliche aktuelle 500er Einzelbilanz](blocker2-vollaufnahme-nach-massnahme-b-20261008.md) bleibt **0 fachlich angenommen / 91 Ereignisduplikat / 409 fehlender Vollnachweis**, alle anderen Kategorien 0.

## Problem und Korrektur

Die genehmigten B-Korrekturen aktualisierten drei KO-Metadaten auf den heutigen Auditzeitpunkt. Die bestehende `augmentFreshCandidates`-Funktion ergänzte dadurch alte Vorgänge außerhalb der regulären Top-50. Eine Metadatenkorrektur beweist keine heutige Veröffentlichung oder notwendige Relevanz.

`server.js` lädt den bisherigen vorläufigen Kandidatenpool und dieselben Quellen. Danach begrenzt `briefing-kandidatenzeit.js` ausschließlich die zusätzlich angehängten Entscheidungen: heutige unveränderte Erstaufnahme, widerspruchsfreie heutige Quellenveröffentlichung oder vom bestehenden Fristparser belegte heutige Frist. Alle regulären Top-50-Entscheidungen bleiben erhalten. Die bisherigen Quellen-, Frist-, Sicherheits- und Anzeigefilter gelten weiterhin.

Dokumentkennung, kanonische URL und Artikelidentität verbinden Quellenvarianten transitiv. Ungültige, zukünftige, undatierte oder widersprüchliche Varianten sperren den betroffenen Quellenbeleg. Eine andere unabhängige gültige Quelle bleibt nutzbar. Veröffentlichungs- und Fristzweig erhalten denselben konfliktgeprüften Originalbestand; alte gültige Veröffentlichungen können eine heutige belegte Frist tragen. Validierte amtliche Tagespräzision wird nie in eine erfundene UTC-Uhrzeit umgewandelt.

Der Fristzweig übernimmt `tagesAnlass` unverändert: Der bestehende absolute Fristparser verlangt ein gültiges `published_at`. Ältere amtliche Artikelstände mit ausschließlich validiertem Tagesmetadatum und `published_at=NULL` werden dort weiterhin nicht als Fristbeleg zugelassen. Kein künstliches Ersatzdatum eingefügt und keine allgemeine Vollständigkeit dieses Fristpfads behauptet. Eine unabhängig geprüfte Gegenprobe belegt diese bestehende Grenze. Sie betrifft keinen der tatsächlich entfernten 888 B-Zusätze; deren drei KOs haben keine Frist. Die 42 notwendigen A-Zielbindungen bleiben über ihre heutige Erstaufnahme erhalten. Eine erforderliche Erweiterung für einen konkret notwendigen solchen Fristfall müsste gesondert fachlich belegt und geprüft werden.

Kein zusätzlicher Datenbankzugriff, Schreibpfad, Modellaufruf, Profil-, Reservierungs-, Motor-, Workflow- oder Konfigurationswechsel. Die neue Schranke sucht keine Quellen außerhalb des vorhandenen vorläufigen Pools. Sie beweist keine vollständige neue Quellenabdeckung oder fachliche Notwendigkeit aller verbleibenden Kandidaten. Reguläre Top-50 können weiterhin alte oder fachlich ungeklärte Kandidaten enthalten.

## Vollständige Offline-Prüfung der 500 vorhandenen Originale

Vier getrennte lokale Prozesse prüften jeweils 125 disjunkte Positionen aus **demselben** erfolgreichen Lauf `37790661298`. Der echte Serverbuilder, die echte Matching-/Entscheidungsengine und der echte Adapter blieben aktiv; nur Speicherleser wurden durch die unveränderten gesicherten Originale ersetzt. Andere Speicherfunktionen werfen und zählen einen Schutzfehler. Kein neuer Production Abruf und kein eigentlicher 500er Production Funktionstest.

Für jede der 500 Positionen zuerst den bisherigen Pfad reproduziert: ausschließlich die neue Schranke übergangen; tatsächliche alte sichtbare KO-ID-Reihenfolge exakt gleich dem nativen Original. Anschließend dieselben Originale mit der neuen Schranke dargestellt. Je Position identischer Leseumfang, erhaltene Basisentscheidungen, unveränderte KO-/Quellen-/Profilobjekte, keine unzulässigen Speicheraufrufe. Alle vier vollständigen Teilberichte **PASS**.

| Offline-Erwartung | Anzahl |
| --- | ---: |
| Individuell geprüfte Positionen | 500 (330 BT / 120 BE / 50 BB) |
| Profile mit entfernten zusätzlichen Kandidaten | 444 |
| Entfernte zusätzliche Kandidatenvorkommen | 888 |
| Sichtbare Bindungen vorher / erwartbar danach | 21805 / 20917 |
| Alle 42 notwendigen A-Zielbindungen weiterhin sichtbar | 42 |
| Ereignisduplikatprofile vorher / erwartbar danach | 91 / 91 |
| Neue tatsächliche Production Eingaben | 0 |
| Fachlich angenommene vollständige Profile | 0 |

Die 888 entfernten Ergänzungen betreffen ausschließlich die drei B-KOs. E-Auto: Sichtbarkeit vorher 406, offline danach 16; Sondierung 449 → 168; Pflege 486 → 269. Die gespeicherten B-KOs und Quellen werden nicht geändert oder entfernt. Dies sind **erwartete Darstellungen**, keine neue aktuelle Production Aufnahme und keine fachliche Annahme dieser KOs.

Geprüfte Runtime-Codefassung `7e555a67fa47e2d4d183a134840b1f672c7db193`; spätere Änderungen dieses PR betreffen nur Dokumentation und die verlustfreie Cockpitverdichtung. Kein unnötiger zweiter 500er Builderlauf für reine Dokumentationsänderungen. 36 gezielte lokale Gegenproben einschließlich echtem App-/Eingabebuilder bestanden. Der unabhängige andere Modellprüfer fand zuerst zwei reale Lücken (Dokument-ID-Varianten und Fristumgehung); beide behoben, 13 eigene Fixgegenproben bestanden. Endreview am finalen Kopf und vollständige Pflicht-CI stehen vor Merge noch aus.

## Private Belege

Alle folgenden Dateien liegen unter `/workspace/private/blocker2-20261007/`, nicht im Git. Die Originale der vier abgeschlossenen Teilberichte bleiben unverändert. Deren Feld `inputHash` bezeichnet ausdrücklich den **SHA256 des vollständigen ursprünglichen Antwortkörpers**. Der Sammelbericht trennt `originalBodySHA256` und `actualInputHash` des tatsächlichen Eingabevertrags; keine Gleichsetzung beider Hasharten.

| Datei | SHA256 |
| --- | --- |
| `audit-kandidatenzeit-offline-replay-500-1-125-fixed.json` | `bc3b7292e71564f0f550049a27d65166c7aa06a242c3b6bed9c7c202bd79cb46` |
| `audit-kandidatenzeit-offline-replay-500-126-250-fixed.json` | `d5a3e66361ee32400d6e48d7622c93266470d5410970f47cff67c8205df2c066` |
| `audit-kandidatenzeit-offline-replay-500-251-375-fixed.json` | `de0bd4d4a6cb60191ad56b2c32830fc728c3c71ed7c155558ba2f7c1a57076f3` |
| `audit-kandidatenzeit-offline-replay-500-376-500-fixed.json` | `9c836de5c5ee8861e773200c7e5341a17cfc531ef65a2b48b15f9a2f7f1c4d89` |
| `audit-kandidatenzeit-all500-offline-replay-aggregate.json` | `02b2e9d54dee493a5a8e419ab761a6942255043b803d94cf041bb1ef94bb6d90` |
| `postB-once500-20261008-A42-event-window-and-profile-scope-facets.json` | `280c11c0dd4d9900a75abc65aa425ba6d803c1d91073386a23ca5cceb9657284` |

Die gezielte A42-Ergänzung bindet aus den aktuellen Originalen die laufende Berliner Anmeldephase 05.–16.10., den angekündigten Brandenburger Termin 08.10.13:00 Ortszeit, Veröffentlichungspräzision sowie Landes-/Themenbezug der vorab festgelegten 30 BE-Bildungs- und zwölf BB-Verkehrsprofile. Aufnahme nach angekündigter BB-Uhrzeit belegt keine tatsächliche Durchführung oder Ergebnisse. Keine persönliche Elternpflicht oder Ausschussmitgliedschaft angenommen. Die gespeicherte BB-Summary bleibt 49 Zeichen; der relevante ganze Absatz ist im bereits gesicherten amtlichen Original belegt, nicht nachträglich in die tatsächliche Eingabe geschrieben. Keine vollständige A- oder Profilannahme daraus.

## Pflicht-CI und Archiv

Erster CI-Lauf `37803295287` am Codekopf: **157/158 Standardsuiten bestanden**; allein `current-state-groesse-test.js` scheiterte an den bereits geerbten 35530 Zeichen des Cockpits. Die 30000-Zeichen-/350-Zeilen-Grenze wird nicht angehoben. Fünf historische Blocker2-Einträge ins [bytegleiche vollständige Statusarchiv](../archive/project_state/2026_10_08_CURRENT_STATE_vor_blocker2_kandidatenschranke.md) verwiesen; Archiv-SHA256 `c53bbde6a0179b2775a854fe41e5737756c34c11d81bb3b14fcb16be68518b6a`. Aktuelle Nicht-Blocker2-Statusinhalte unverändert. Cockpit jetzt 28658 Zeichen, gezielte Größenprüfung 4/4 bestanden. Beide Pflichtchecks müssen am finalen neuen Kopf grün sein; kein Merge des roten ersten Kopfs.

## Nächster Schritt und Freigabegrenze

Nach unabhängiger Endprüfung, beiden grünen Pflichtchecks und regulärem Deployment: READY/Commit sowie alle 52 geschützten Tabellen mit Vollzeilen und `xmin` unmittelbar vor/nach rein lesend vergleichen. Bei unerwarteter Abweichung stoppen; kein automatischer Rückweg.

Danach ist zur tatsächlichen Wirksamkeits- und Fachprüfung der geänderten aktuellen Eingaben ein **neu konkret freigegebener einmaliger Nurleselauf** erforderlich: exakt dieselben 500 inaktiven synthetischen Profile, höchstens 500 `briefing-nachweis?modus=eingabe`-Abrufe, zwei Identitätsprüfungen und 55 Minuten Erfassung; gleicher nachgewiesener READY-Commit und Berliner Tag, bestehender fest gebundener Verschlüsselungsempfänger, laufende Cipher-Sicherungen, vollständiger 52-Tabellen-Vergleich vor/nach. Bei Commit-/Tages-/Auth-/Profilabweichung oder Schreib-/Modellhinweis sofort stoppen, keine automatische Wiederholung. Keine Daten-/Profil-/Reservierungsänderung, bezahlten Helmut Production Modelle oder eigentlicher Funktionstest. Freigabe für Lauf `37790661298` ist verbraucht.

Alle 500 neuen Originale dann einzeln neu fachlich prüfen und vollständig getrennt bilanzieren; keine Vermischung mit dieser oder einer historischen Aufnahme. A4/B5 nicht wiederholen. **C-Duplikatlöschung bleibt gesperrt**; beide historischen KO-/Reservierungsidentitäten bleiben erhalten. 91 Duplikatprofile und offene Quellen-/Fakten-/Notwendigkeitsachsen bleiben ungelöst. Keine pauschale Datenfreigabe aus Kandidatensichtbarkeit, flachen NULL-Zeitfeldern oder Offline-Erwartung ableiten.
