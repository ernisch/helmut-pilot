# Frische18: begrenzte zusätzliche Quellenversorgung

Roadmap3.3, autonomer [Betreiberauftrag](autonom-bis-500-starttor-20260926.md).
Die lokale Vollbilanz des12:29-Snapshots ergibt127 Tagesprioritäten und373
Profile ohne Priorität. Neue echte Quellen können die Eingaben verbessern;
dieser Auftrag garantiert weder neue Prioritäten noch eine500er Vollversorgung.

## Gesicherte neue Eingabe

26.09.,14:52–14:54UTC wurden die beiden vorhandenen direkten Feeds von
Tagesschau und Deutschlandfunk gelesen:32 Kandidaten. Ein bereits gespeicherter
Pflegeartikel wurde anhand Kennung, kanonischer URL und Inhaltsfingerabdruck
ausgeschlossen.31 Originalartikel wurden einmalig gelesen;23 bestehen den
unveränderten Artikelkontextvertrag. Acht uneindeutige/abweichende Artikel
bleiben ausgeschlossen. Die23 Publikationszeiten sind unabhängig am jeweiligen
Originalartikel bestätigt: DLF zeitpunktgleich, Tagesschau NewsArticle-Metadaten
auf der Sekundenpräzision des RSS-Datums. Kein Quelldatum wurde umgeschrieben.

Zwei nicht gezielt hilfreiche Meldungen (Formel1/Papstbesuch) entfallen. Von drei
Doppelgruppen wurde je eine konkrete Nachricht gewählt: DLF-Fraktionsaussage
statt allgemeiner Berliner Rückblickanalyse; Tagesschau-Teilnahmebilanz statt
DLF-Ortsliste zum DGB-Tag; eine vollständige Prien-Reaktion von Tagesschau.
Kein Parser oder Clustervertrag wurde zur Auswahl verändert. Die so festgelegten
18 Dokumente bilden18 Einzelcluster;7 Tagesschau- und11 DLF-Originalbelege.
Original-HTML, Einzelgründe und vollständige Eingabe bleiben privat gesichert.

* Eingabehash: `8006e0b99f36887c8701457b609d67ea23831ecd1645b5e5cc91901eabe85482`.
* ID-Hash: `71c33b623bb251422286ee34d14d8c6269b38c53f9d24518898b618b835e291f`.
* Inhalt: `0abb51891433446ddf75052f8ceb5505452b8d1f6b904364940fd274001ca7d3`.
* Belege: `97e245d1f3ef1804fde9a6357472bccc9a83480a4d8bde550726081e928dc5a4`.
* Artikelkontext-Codebasis: `700001011b971cb0d1eb3dd552905fd66601e4c6`.

## Vorab festgelegter Umfang und Rückweg

Production: genau18 neue Rohdokumente und18 Fundstellen plus gebundene
Eingabeablage `quellen-frische18-20260926-a`. Import atomar; vor/nachher
vollständige Hashes des fremden Bestands.500 Mandate/501 Identitäten, alle500
inaktiv; keine Jobs, Sperren, Leases oder konkurrierenden Läufe. Kollisionen,
verwendete Quittung, fremde Triggerwirkung oder abweichende Eingabe stoppen.
Keine Migration, Cron-/Umgebungsänderung, Profilwirkung oder Kommunikation.

Danach zuerst Nurleseplan, dann eigener Auftrag
`verstehen-frische18-20260926-a`: maximal18 Modellaufrufe,0,65USD,15Minuten,
keine zusätzlichen Artikelabrufe. gpt-5-mini, bestehende Reserve und technischer
4USD-Tagesriegel unverändert. Kein alter gesperrter Vorgang wird freigegeben.
Der erste nicht bestätigte Einzelausgang stoppt; keine automatische Wiederholung.
Alle18 Ergebnispositionen müssen anschließend vollständig bilanziert werden.

Risiko: falsche Akteurszuordnung, Ereignismischung, unvollständiges Modell- oder
Speicherergebnis. Diese werden als Fehler ausgewiesen und nicht freigedeutet.
Nachkontrolle:18 gespeicherte Quellen und Belege vollständig zurücklesen,
Quittung, alle Cluster, Quellenbindungen, fachliche Ergebnisse, Kosten,
Profilhashes und freigegebene Sperren prüfen. Danach tatsächliche Wirkung auf
die500 Eingaben neu messen; bloße Importzahlen beweisen keine Vollversorgung.

Der gesicherte Rückweg ist ausschließlich vor Verarbeitung zulässig: exakt die
unveränderten, unverknüpften18 Quellen/Fundstellen und eigene Eingabeablage
entfernen, übrigen Bestand hashgleich lassen. Nach Verarbeitung Belege erhalten;
keine Löschung oder Rücksetzung verbrauchter Quittungen. Unklaren Ausgang nur
nachlesen und nicht wiederholen.

Kostenstand vor dem letzten Lageabschluss15:07UTC konservativ3,102717USD;
Lage-Nachweis anschließend0,009631USD, somit rund3,112348USD kumulativ.
Mit vollem0,65USD-Quellenlimit unter4USD. Vor Ausführung frisch abgleichen.
Keine Anbieterrechnung und keine Freigabe für Aktivierung oder500er Test.

## Lokale Abnahme

Acht neue Schutzprüfgruppen und mit privater Eingabe zwei zusätzliche Gruppen
bestanden; bestehende16er/30er und relevante Lauf-/Kostenregression grün.
Unabhängiges PostgreSQL-Labor:13 Prüfgruppen einschließlich Wiederholung,
aktiver/falscher Profilmenge, gebrauchter Quittung, Lease, Inhaltskollision,
fremder Triggerwirkung, fehlender Belege und gesperrtem/verfälschtem Rückweg.

Import-SQL `a56123182a4ae55f61888389f850de39f2dbdd374d83ecaf7e5b1f4c03128b6e`;
Rückweg `b4b979c3cd18f0919997499588ac0783f94916879d366073bc4ce9c34a8f868a`.
Beide nur lokal geprüft. Noch kein Import oder Verstehenslauf ausgeführt.

## Production-Ausrollung und Importabbruch

PR618/947b0839, Pflicht-CI36250985803 beide grün, Vercel
`dpl_8RWQBXB7BgiaJDrhEa1BL1DWZQci` READY26.09.15:21:30UTC; Fehlerprotokoll bis
15:21:54UTC ohne Treffer. Erster Import stoppte beim abschließenden Vollhash am
unveränderten15s-Limit. Nachlesung15:22:52UTC:0 neue Dokumente,0 Fundstellen,
0 Eingabe-/Laufquittungen.15:22:57UTC500/0, alle Profil-/Identitäts-/Authhashes
unverändert,0 Jobs/Locks/Leases/offene Kosten. Die Transaktion ist zurückgerollt.

Read-only EXPLAIN ANALYZE belegt die Ursache: Vollzeilen-Sortierung schreibt
unter anderem rund61MB Rohdokumentdaten und14MB Fundstellen auf temporären
Plattenspeicher; ein vollständiger Hashdurchgang braucht5801ms. Der Import
braucht zwei Durchgänge. Die Korrektur hasht jede komplette Zeile genau einmal
und sortiert anschließend die64-stelligen SHA256-Werte; alle Zeilen, Spalten,
NULL-Werte und Duplikatanzahlen bleiben im Vollhash enthalten. Keine Stichprobe,
keine Auslassung und keine Änderung am15s-Abbruch oder2s-Locklimit.

Rein lesende Messung der neuen Grundlinie:3488ms.13 PostgreSQL-Laborgruppen
nach der Änderung erneut bestanden, einschließlich fremder Triggerwirkung
beim Import und Rückweg. Exakt dieselbe18er Eingabe bleibt gebunden.
Neuer Importhash `a3ee38f866ccbbfe2fa251c3905cedd56fc2befd2ef84763b4ca6092fe7dd85d`,
neuer Rückweghash `34e43b5e29283ffc9135137d16bb97c1e4886de2613dc48318363e960dac5c0f`.
Erst nach Integration und frischer Nachlesung genau ein begründeter zweiter
Importversuch; kein Modelllauf und keine verbrauchte Quittung wiederholt.

## Korrigierter Import ausgeführt, Verstehenslauf gestartet

PR620/`9cd29a4adea8d866983f5eb7e88d3bea382e6b6b`, Pflicht-CI36251966059 grün,
Vercel`dpl_4PqJBFQLJHFwNpTMdWbv1Stycj4Q` READY15:41:12UTC, keine Fehlerlogs bis
15:42:02UTC. Zweiter Import mit neuem Hash erfolgreich. Vollständige Nachlesung
15:43:15UTC:18 Dokumente,18 Fundstellen,18 Originalbelege,0 Verknüpfungen.
Alle18 Production-Zeilen bestehen mit den unveränderten Eingabebelegen den
bestehenden Vertrag.15:43:37UTC500/0, Profil-/Identitätshashes gleich,
Authhash seit letztem Lageabschluss gleich,0 Jobs/Locks/Leases/offene Kosten.

Nurleseplan36252947342 bestanden:18 Einzelcluster/17 Modellkandidaten
(15 neu,1 Aktualisierung,1 erster Pending-Versuch,1 Zusammenführung).
Konservativer Gesamtstand3,209111USD, mit vollem0,65USD-Rahmen unter4USD.
Eigener Lauf36253026941 gestartet;15:48UTC6/18 Quellen verknüpft, Quittung läuft.
Das ist noch kein Abschluss und keine vollständige fachliche Abnahme.

## Terminaler Lauf und belegte falsche Verknüpfung

Run36253026941 endete15:51:31UTC gestoppt:17/18 bearbeitet,16 Modellaufrufe,
0,116217USD. Technische Bilanz14 gespeichert,1 aktualisiert,1 zusammengeführt,
1 Parteienvalidierung fehlgeschlagen und1 unbegonnen. Die Quittung ist verbraucht;
keine Wiederaufnahme. Die Zusammenführung ist fachlich falsch: Connection-
Friedenspreis26.09.2026 wurde dem Pflege-Vorgang08.05.2024 zugeordnet.
Damit sind nur15 neue/aktualisierte Positionen technisch gültig gespeichert;
keine vollständige fachliche18er Abnahme.

Die vollständige Nachlesung belegt zwei ursprüngliche Pflegequellen aus2024.
Der Vorgang lag auf Platz8 der Kandidatensuche. Der Resolver betrachtete8,
lud aber nur für5 deren Quellen und prüfte die übrigen anhand der Überschrift.
Die lokale Korrektur bindet beide Grenzen an8; alle vorhandenen Zeit-/Ereignis-
und Lesefehlerregeln bleiben bestehen. Maximal3 zusätzliche Quellenlesungen,
keine zusätzlichen Modellaufrufe. Drei neue Grenzfälle bestanden (fremder alter
Vorgang, wirklich gleiches Ereignis, Lesefehler), ebenso12+11+17 bestehende
gezielte Resolverfälle. Noch keine Production-Korrektur der Verknüpfung.

Nach Ausrollung genau die falsche Verknüpfung atomar entfernen. Risiko: falsche
Zeile oder Nebenwirkung; deshalb exakte Kennungen/Zeitstempel, Vollzeilenanker,
ruhender500/0-Bestand und unveränderte Fremddaten vor/nach der Transaktion.
Rohartikel, ursprünglicher Vorgang samt beiden Originalquellen und verbrauchte
Laufbelege bleiben erhalten. Private Vorherabbilder sichern den Rückweg;
keine automatische Wiederherstellung einer fachlich falschen Zuordnung.
Kein Modellaufruf, keine Profilwirkung. SQL und Laborbeleg vor Ausführung prüfen.
