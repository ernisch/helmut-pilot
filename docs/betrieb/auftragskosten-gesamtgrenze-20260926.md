# Gesamtgrenze des autonomen Auftrags

## Befund am 26.09., 18:12 UTC

Die bisherige Rechnung verwendete für den 25.09. den Zwischenstand 0,312021 USD.
Spätere automatische Läufe fehlten darin. Der aktuelle Kostenbestand beträgt
0,433563 USD für den 25.09. und 0,608261 USD für den 26.09.; zusätzlich bleiben
0,212 USD für den unbeantworteten Lage-Aufruf ungeklärt reserviert.
Der reguläre Rückstands-Cron am 26.09. um 17:30 UTC verursachte allein weitere
20 Aufrufe mit zusammen 0,124361 USD konservativ gebuchten Tokenkosten.
Die Tagesriegel wurden dabei nicht überschritten.

Alle 49 lokalen DeepSeek-Sitzungen vom 25./26.09. ergeben mit den bisher
verwendeten konservativen Tokenraten zusammen 2,75646798 USD. Mit beiden
vollständigen Production-Tagen und der offenen Reserve sind somit
**4,01029198 USD gebunden**. Das ist keine Anbieterrechnung, aber der bisherige
Nachweis „sicher unter 4 USD insgesamt“ ist damit nicht mehr gegeben.
Keine weiteren bezahlten Helfer oder fachlichen Modelltests.

## Korrektur und Abnahme

Ein optionaler administrativer Eintrag `testKostenAuftrag` bindet den Starttag,
die unveränderte Grenze 4000000 Mikro-USD und die konservativ nach oben
gerundeten externen Kosten. Die bestehenden Tagesbücher sind weiterhin die
einzige Quelle der Production-Kosten. Abgerechnete Beträge und volle offene
Reserven aller Auftragstage zählen zusammen. Fehlende oder beschädigte
Tagesbücher sperren; ein UTC-Tageswechsel gibt kein neues Auftragsbudget.

Die zusätzliche Prüfung erfolgt innerhalb derselben atomaren Kontomutation
wie jede Modellreservierung. Sie gilt für reguläre Crons, manuelle Läufe und
den alten Admin-Bypass gleichermaßen. Ein Aufruf, der die Gesamtgrenze erreicht,
wird vor dem HTTP-Transport abgelehnt. Ohne konfigurierten Auftrag bleibt der
bisherige Tagesvertrag erhalten. Bestehende Tickets werden nicht umgeschrieben.

Gezielte Offline-Prüfungen: Konkurrenz zwischen Cron und manuellem Lauf,
Mitternacht mit unbekannter Reserve, exakte Grenze, beschädigte Konfiguration,
fehlende Tage, unveränderte Historie und blockierter echter KI-Einstieg.
Der bestehende Datenbanknachweis prüft zusätzlich fünf getrennte Prozesse
gegen echtes PostgreSQL/PostgREST mit gemeinsam nur zwei zulässigen Reserven.
Das ist kein fachlicher Modellnachweis und kein 500er Test.

## Begrenzte Production-Einrichtung nach grüner CI und Deployment

Autorisierung: aktueller Betreiberauftrag, notwendige Vorarbeit zur Einhaltung
seiner kumulativen Kostengrenze. Keine neue Kostenfreigabe daraus ableiten.

- Umgebung: Production, ausschließlich `helmut_store/main-auth`.
- Umfang: einmalig `testKostenAuftrag` mit Version 1, Kennung
  `autonom-bis500-20260926`, Starttag `2026-09-25`, Limit 4000000 und
  `externGebunden: 2756468`; neue `_authStoreRevision` für konkurrierende Schreiber.
- Wirkung: neue Textmodellaufrufe bleiben bei dieser Bindung gesperrt. Cronplan,
  Tageslimit, Profile, Quellen, Tickets und verbrauchte Aufträge bleiben erhalten.
- Risiko: Versorgung bleibt angehalten, bis Kostenklärung und gedeckter Auftrag
  vorliegen. Unbekannte Kosten werden weder freigegeben noch auf null gesetzt.
- Vorbedingungen: neuer Code produktiv, keine laufenden Jobs/Locks/Leases,
  exakt 500 inaktive unveränderte Profile, kein vorhandener Auftragseintrag,
  dokumentierte Tageswerte unverändert. Atomare Sperre der Kontenzeile.
- Nachkontrolle: Eintrag und neue Revision lesen; vollständiger Rest des
  Kontenspeichers unverändert, Profilhashes gleich. Rein lokale Reservierungsprobe
  mit echter gelesener Kostenprojektion muss vor jeder neuen Buchung abbrechen.
- Rückweg: kein automatisches Entfernen der Sicherung. Bei einem Defekt bleibt
  der Modellstopp erhalten; Korrektur vor Wiederaufnahme. Aufhebung oder Änderung
  der Auftragsgrenze erst nach belegter Kostenklärung beziehungsweise konkreter
  neuer Betreiberfreigabe. Ein Code-Rollback darf die Sperre nicht unwirksam machen.

Die Einrichtung ist erst durch die anschließende Production-Nachlesung belegt.
Themenversorgung, fachliche Bereichsabnahme, Aktivierung und 500er Test bleiben offen.
