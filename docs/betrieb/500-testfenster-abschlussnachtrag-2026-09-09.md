> Historischer Stand von 12:13 UTC am 09.09.2026. PR #346 und inzwischen
> auch PR #347 sind mit ausdruecklicher Freigabe uebernommen. Der aktuelle
> Nach Merge Stand steht in CURRENT_STATE.md und im technischen Kostenvertrag.
> Neu erzeugte Einzelbelege werden separat fuer den Betreiber gesichert;
> die historische Aussage unten, sie laegen in PR #346, ist ueberholt.
> Alle ehemaligen realen Profile sind laut Betreiber ungenutzte Dummys.

# Abschlussnachtrag nach der vollständigen Prüfung von PR #346

Stand **09.09.2026, 15:13 Türkei / 14:13 Berlin / 12:13 UTC**.
Dieser reine Betriebsnachtrag in PR #345 ist neuer als die Eröffnungsmeldung
dieses Dokumentationsbranches. Er verändert weder den geprüften Code von
PR #346 noch main oder Production. Der ausführliche Fensterbericht und die
neue vollständige Einzelübersicht aller 500 Mandate stehen in PR #346.

## Tatsächliches Ergebnis und sichere Teilnahme

Exakt 500 gleichzeitig aktive Profile waren unabhängig belegt: fünf reale
und 495 vorhandene synthetische. Der einzige manuelle Fachlauf
`34344201231` scheiterte an der Quellenprüfung von A002. Er speicherte keine
neuen Lage Texte und fünf unvollständige Briefingpakete. Endbestand:
44 unveränderte Lage Texte, 456 fehlende Texte, fünf Teilpakete,
**null vollständige qualitativ bestandene Briefings**. App Abruf für alle
500 weiterhin nicht nachgewiesen. Ein gespeichertes Paket ist keine Abnahme.

Abschlussworkflow `34344568514` bestätigte am 09.09. um
**14:21:40 Türkei / 13:21:40 Berlin / 11:21:40 UTC** alle 495 synthetischen
Profile als deaktiviert. Kein weiterer Fachlauf oder Aktivierungsversuch.
Die neue Einzelübersicht trennt die sieben erreichten Mandate und 493 in
diesem Lauf nicht erreichte von den historischen Befunden. Die historischen
444 nicht erreichten, eine abgelehnte und elf ungeklärten Fehlstellen bleiben
in ihrer bisherigen Belegstärke erhalten. Die A002 Einzelursache jenseits
der Quellenablehnung ist mangels gespeichertem Absatz weiterhin unbekannt.

Alle 44 Lage Texte und die 82 eindeutigen Kerntexte aus 236 Item Zuordnungen
der fünf Pakete sowie deren fünf Hauptansichten wurden gelesen. Belegte
Mängel umfassen Themenmischungen, unbelegte Namen und Rollen, Quellenlücken,
abgeschnittene Texte, unzureichenden Profilbezug und Wiederholungen.
Keine vollständige Faktenprüfung anhand der Originalartikel behauptet;
null vertiefte Originalartikelprüfungen in diesem Fenster.

## Vollständiger GitHub Beleg für den konkreten Code

[PR #346](https://github.com/ernisch/helmut-pilot/pull/346), Kopf
`f169b6404566c6afd238969e9f2ff3e5ce2225fd`:

| Prüfung | Ergebnis |
| --- | --- |
| Syntax und Offline Suiten | 343/343 in 557 Sekunden |
| Browser auf Desktop und Mobil | 50/50 |
| Kontoschreibschutz und Teilnahme, PostgreSQL/PostgREST | 11/11 |
| Z22 Mandantentrennung, PostgreSQL/PostgREST | 48/48 |

[GitHub Lauf 34348505603](https://github.com/ernisch/helmut-pilot/actions/runs/34348505603)
ist insgesamt `completed/success`. Suitenabschluss 15:12:01 Türkei /
14:12:01 Berlin / 12:12:01 UTC, letzter Z22 Beleg 15:12:07 / 14:12:07 /
12:12:07. Geprüfter GitHub Zusammenführungsstand
`75e0020714ac0f097323570fe7bee9d37c388fb6` und PR Kopf haben unabhängig
bestätigt denselben Baum `dedea0e16e2035bb1aacbd5d757e333cc5166359`.
Zusammenführungsbasis ist unverändert `ac8e6236c3e688b85622999a2becafa717aa60cd`.

Die lokale Einschränkung 341/343 wegen fehlendem Chromium bleibt als
historischer lokaler Befund erhalten. Die GitHub Prüfungen belegen den
oben genannten endgültigen Kopf vollständig. Sie beweisen keine Versorgung
aller 500 Mandate in Production. Die Korrektur ergänzt alte Teiltreffer,
isoliert bekannte Qualitätsablehnungen, bewahrt harte Kosten und
Speicherstopps und ergänzt den rein lesenden App Nachweis. Semantische
Altfehler werden dadurch nicht pauschal repariert oder freigegeben.

## Letzter unabhängiger Production und Kostenabgleich

READ ONLY um **15:13:25 Türkei / 14:13:25 Berlin / 12:13:25 UTC**:
504 Profile, fünf aktiv, alle 495 synthetischen inaktiv. Null aktive
Sperren, Leases, verwaiste laufende Jobs oder junge laufende Prozessquittungen.
Keine Prozessstarts in den vorangehenden 30 Minuten.

| Erhaltungsbeleg | MD5 |
| --- | --- |
| Profile nach den erlaubten Teilnahmeschritten | `55069db6775f1369736f346ce8402241` |
| Identitäten | `3c5b0b5a6314f31c395b8758b166c5c3` |
| Konten, zusätzlich um 14:56:35 / 13:56:35 / 11:56:35 gelesen | `8580dd154ac9c9509e0025b1a8dfd3a4` |

Tageskosten zuletzt **0,264564 USD**, 109 Reservierungen und 109 Belege.
Um 15:04:31 / 14:04:31 / 12:04:31 separat bestätigt: null fehlende oder
negative Kostenwerte. **Dieses geschlossene Testfenster: 0,001936 USD**
aus zwei Aufrufen. Der zusätzliche reguläre Verbrauch von 0,049891 USD
nach dem Testende gehört zum UTC Tag, nicht zum Fenster. Gemessene Tokens,
keine Anbieterrechnung. Keine Budget oder Reservenänderung.

Production ist weiterhin `ac8e6236c3e688b85622999a2becafa717aa60cd`, READY
`dpl_DMrxESHNv3YFNTCXd8g7Tn7hxZnJ` mit den drei bisherigen Hauptaliasen.
Die unabhängige GitHub API bestätigt main sowie ausschließlich die offenen
PRs #345 und #346; Kopf von #346 unverändert. Seit 14:59 Türkei / 13:59 Berlin /
11:59 UTC zeigt sie nur die zugehörige CI, keinen zusätzlichen Production
Fachworkflow. Lokale Prozesssicht: kein laufender Node oder Helmut Testprozess.

## Späterer Gegenbefund zur Endautomation

Die frühere Abschaltquittung um 14:25:34 / 13:25:34 / 11:25:34 und die
erneute Aktivanzeige um 14:56 / 13:56 / 11:56 bleiben dokumentiert.
Erneute Deaktivierung nach unabhängigem Lesen um 14:57:04 / 13:57:04 /
11:57:04, anschließend separat als aus bestätigt.

Der letzte Automationsleser zeigt die Aufgabe
`6aa13bdcd9b881919d1c18eac0e274c0` weiterhin **deaktiviert**, aber inzwischen
mit `last_run_time=2026-09-09T12:07:04.944354+00:00` und dem abweichenden
Zeitplan `DTSTART:20260909T120200Z`. Das entspricht einem angezeigten Termin
15:02 Türkei / 14:02 Berlin / 12:02 UTC und einer registrierten Ausführung
15:07:04 / 14:07:04 / 12:07:04. Ursprünglich war 15:45 / 14:45 / 12:45
festgelegt. Dieser Ausführer hat nach der ursprünglichen Einrichtung nur
`is_enabled=false` geschrieben und keinen neuen Termin gesetzt.

Ursache der Terminabweichung und Inhalt des registrierten Automationslaufs
sind durch den verfügbaren Automationsleser nicht belegt. Es wird weder
eine nie erfolgte Ausführung noch ein bestimmter Verursacher behauptet.
GitHub zeigt keinen zusätzlichen Fachworkflow; Production Profile,
Briefingzahlen und Modellreservierungen sind unverändert. Keine zusätzliche
Production Wirkung daraus belegt. Die Aufgabe ist aus, `next_run_time=null`.
Kein Ersatzauftrag eingerichtet.

## Nächster notwendiger Schritt

Die konkrete Betreiberfreigabe für Merge und Production Veröffentlichung
von PR #346 am oben vollständig geprüften Kopf fehlt. PR #344 ist bereits
vollständig freigegeben und veröffentlicht; dafür keine neue Freigabe.
Das einmalige Testfenster ist geschlossen. Die gezielte Inhaltsreparatur,
der tatsächliche App Abruf und die Gesamtabnahme aller 500 bleiben offen.
Dieser Dokumentationsnachtrag ist selbst kein Merge und keine Veröffentlichung.
