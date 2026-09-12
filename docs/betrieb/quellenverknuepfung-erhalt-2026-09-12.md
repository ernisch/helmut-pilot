# Quellen beim Verknüpfen erhalten

Stand 12.09.2026. Teilweise abgeschlossen: isoliert korrigiert und gezielt geprüft. Hochladen und PR durch automatische Freigabeprüfung blockiert; vollständige Pflichtprüfungen, Veröffentlichung und natürlicher Wirkungsbeleg stehen aus.

## Anlass und Änderung

Im regulären Lagecheck werden eingegangene Rohmeldungen erneut in Rohdokumente umgewandelt und mit Wissensobjekten verknüpft. Fehlender Inhalt oder eine bloße Wiederholung des Titels ergibt dabei korrekt `summary: null`. Die bisherigen Verknüpfungspfade schrieben vollständige Rohzeilen mit `resolution=merge-duplicates` und konnten so vorhandene Auszüge und Quellenkontext überschreiben.

Die gemeinsame interne Funktion `ensureRawDocumentsForLinks` sichert die Quellen jetzt nur durch atomare Einfügung mit `resolution=ignore-duplicates`. Sowohl `savePendingKnowledgeObjectsBulk` als auch `saveKoDocumentLinks` verwenden sie. Vorhandene Rohzeilen bleiben vollständig erhalten; neue Quellen werden angelegt und anschließend verknüpft. Es gibt keinen vorherigen Read mit anschließend überschreibendem Schreiben.

Die Operation entspricht dem dokumentierten [PostgREST Vertrag](https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert). Gemischte Spaltensätze werden getrennt übertragen, innerhalb der bestehenden Grenze `RAW_DOCUMENT_BULK_CHUNK`. Fehlende Felder werden nicht mit null aufgefüllt. Der Stapelpfad zählt jede versuchte Quellenanfrage, auch wenn eine spätere Anfrage scheitert. Die bisherigen Fehlerausgänge und der Schutz fertiger Wissensobjekte bleiben bestehen.

Keine Änderung von Auszugsfilter, allgemeinem `v3Upsert`, Schema, Zeitplan, Fachbewertung, Kostensteuerung oder Profilen. Bestehende leere Quellen werden nicht still repariert. Eine geprüfte Quellenaktualisierung bleibt ein gesonderter Auftrag.

## Gezielte Prüfung

`node scripts/lokal.js -- node scripts/quellenverknuepfung-erhalt-test.js`

**27/27 Prüfungen bestanden.** Echte Speicherfunktionen und echte HTTP Anfragen gegen eine lokale PostgREST Nachbildung mit ausschließlich erfundenen Zeilen. Der zentrale Netzschutz bleibt geladen. Dies ist ein Speichervertragstest; keine Behauptung eines echten PostgreSQL oder Production Nachweises.

| Geprüfter Fall | Ergebnis |
| --- | --- |
| Vorhandener Auszug, eingehend leer, titelgleich, anders oder ohne Feld | Gesamte Rohzeile unverändert, einschließlich Herkunft und Quellenkontext |
| Vorhandene leere Quelle und neuer Text | Keine stille Reparatur |
| Neue Quelle mit Auszug oder nur Titel | Korrekt angelegt und verknüpft, Titelwiederholung bleibt leer |
| Gemischte Spalten und mehrere Stapel | Keine Auffüllung mit null, Größenbegrenzung eingehalten |
| Wiederholung und konkurrierende Verknüpfung | Bestand unverändert, neue Quelle nur einmal angelegt |
| Fehler beim Quellenanlegen, Verknüpfen oder im zweiten Stapel | Ehrlicher Fehler, keine fälschliche Erfolgsmeldung |
| Fertiges Wissensobjekt und alte Links | Vollständig erhalten |
| Neue Vormerkung | Erfolg erst nach erfolgreicher Quellenverknüpfung |
| Deaktivierter Store oder ungültige Eingabe | Kein Datenzugriff |

Zusätzlich 129/129 bestehende Prüfungen des Lageablaufs bestanden. Die neue Suite besteht auch im kanonischen Runner separat, 1/1.

Der vollständige kanonische Lauf wurde einmal ausgeführt und endete mit Exit 1. Das erhaltene Protokoll ist unvollständig und enthält 26 bestandene Suiten sowie einen belegten Fehler in `admin-nutzer-loeschen-test.js`: Die lokal verfügbare Playwright Installation findet ihr benötigtes Chromium Programm nicht. Daraus darf weder eine vollständige Fehlerliste noch ein grüner Gesamtlauf abgeleitet werden. Kein Test wurde abgeschwächt. Der Versuch, die lokale Browserumgebung mit der in der CI festgelegten Playwright Version 1.56.1 bereitzustellen, blieb unvollständig. Zunächst wurde während einer laufenden Installation deren Paketverzeichnis durch die Wiederherstellung der Projektabhängigkeiten ersetzt; der anschließende Versuch aus einem getrennten Werkzeugverzeichnis scheiterte am Download mit HTTP 400. Projektabhängigkeiten danach exakt aus package-lock.json wiederhergestellt, keine Änderung der Abhängigkeitsdateien. Kein zweiter vollständiger Testlauf und keine Abschwächung von Tests. Für einen späteren PR sind die unveränderten GitHub Pflichtprüfungen maßgeblich; vor deren vollständigem Erfolg keine Mergeempfehlung.

## Frischer Vorflug und Grenzen

Production main bleibt `00783c7a3d91e78433b38c3369086d7c3f311c71`, Deployment `dpl_AdYF6WyycAs64GC3gA2Dx4NoZaoF` READY am Hauptalias. Bestehende main Prüfung `34681666358` erfolgreich beendet, nicht neu gestartet.

Vorflug am 12.09. um 14:34:50 Uhr Türkei / 13:34:50 Uhr Berlin / 11:34:50 Uhr UTC: 504 Profile, 505 Identitäten, fünf Originalprofile aktiv, 495 synthetische Profile und Konten inaktiv. Geschützter Bestand gegenüber Beginn unverändert; die vier zuvor bekannten Admin Metadatenabweichungen zur ursprünglichen Grundlinie bleiben offen. 51 Buchungen, 0,314520 USD von 4 USD je UTC Tag, keine offene heutige Reserve. Keine laufenden Jobs, gültigen Leases, aktiven Sperren, jungen Prozesse oder anderen aktiven Datenbankclients. Keine laufende GitHub Action; Fachautomation deaktiviert. Kein umfassender Einblick in fremde Chats.

Der frühere Auszugsbranch ist bereits in main enthalten. Nur der historische Draft PR345 ist offen, kein konkurrierender Quellen PR. Basis ist der gesicherte Dokumentationscommit `9c4f108ff4a727f8861c90d57016858c12eec6fa`; seine Abschlussdokumentation bleibt erhalten. Die isolierte lokale Arbeit liegt auf `codex/quellenverknuepfung-erhalt-20260912`. Vorgesehen für eine spätere Sicherung auf GitHub ist ausschließlich der bestehende Branch `codex/500-fachurteil-import-vorbereitung-20260911` verwendet, dessen Vercel Vorschau in der bestehenden Konfiguration deaktiviert ist.

Die drei bereits fehlenden Auszüge werden durch diese Korrektur nicht wiederhergestellt. Der genaue historische Schreibkörper je Quelle bleibt unbelegt. Die drei älteren unbekannten Fehlerursachen sind davon getrennt. Der natürliche sichere Diagnosenachweis aus PR383 und die vollständige Abnahme für exakt 500 gleichzeitig aktive Testprofile bleiben offen.

## Veröffentlichung und Rückweg

Betreiber Weiter nach dem konkreten Vorschlag vom 12.09. erlaubt diese isolierte Korrektur und gezielte Prüfungen. Kein Fachlauf, Modellaufruf, Quellenabruf, Import, Profilwechsel, Merge oder Deployment durch diesen Abschnitt.

Vor Veröffentlichung müssen der genaue Änderungskopf und seine Pflichtprüfungen bewertet werden. Merge und dadurch ausgelöstes Production Deployment benötigen eine neue konkrete Freigabe. Ein späterer Rückweg wäre der gezielte Revert dieses Codes; auch dafür ist eine neue Freigabe erforderlich. Er stellt keine verlorenen Quellen wieder her.


## Abschluss und konkreter Freigabepunkt

Die automatische Freigabeprüfung lehnte den vorgesehenen Push nach GitHub ab. Ihre Begründung nennt einen nicht verifizierten Remote und fehlende ausdrückliche Veröffentlichungsfreigabe unter Bezug auf den früheren Leseauftrag. Der Remote Branch wurde anschließend erneut nur gelesen und steht weiterhin auf `9c4f108ff4a727f8861c90d57016858c12eec6fa`. Kein Ausweichen auf einen anderen Schreibweg, kein zweiter Pushversuch. Kein PR und kein neuer GitHub Prüflauf erstellt.

Die Änderung ist als lokaler Git Commit gesichert. Erforderlich ist jetzt die ausdrückliche Freigabe, diesen geprüften Korrekturstand in `ernisch/helmut-pilot` auf den bestehenden Branch `codex/500-fachurteil-import-vorbereitung-20260911` hochzuladen und einen EntwurfsPR zu öffnen. Dies umfasst die dadurch ausgelösten bestehenden Pflichtprüfungen. Es umfasst keinen Merge, kein Deployment und keine Production Datenänderung.

Frische Schlusskontrolle am 12.09. um 15:05:08 Uhr Türkei / 14:05:08 Uhr Berlin / 12:05:08 Uhr UTC: Profile, Identitäten, Konten und vollständiger geschützter Bestand gegenüber Vorflug unverändert. Alle drei vollständigen Quellenzeilen ebenfalls unverändert, Auszüge weiter leer. Kosten unverändert bei 51 Buchungen und 0,314520 USD, heutige Reserve null. Production weiterhin identischer READY Stand. Keine laufenden Fachjobs, Leases, Sperren, jungen Prozesse, anderen aktiven Datenbankclients oder GitHub Actions. Fachautomation aus. Keine eigene Prüfung oder Installation bleibt im Hintergrund offen.
