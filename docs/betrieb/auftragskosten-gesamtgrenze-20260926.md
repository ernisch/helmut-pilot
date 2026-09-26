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

## Einrichtung belegt und ausdrückliche Erhöhung auf5USD

PR625 ist als `94227708ea8de77bd4e7c1770b74ad5ec9db4aa3` produktiv,
Vercel `dpl_G2XiPyU6hFg5TKBZvZjyAsfTy2z2` READY seit18:27:56UTC.
Die Nachlesung18:29:29–18:29:39UTC bestätigt den eingerichteten Version1-Auftrag,
unveränderte Kostenbücher und Profilhashes,500 inaktive Profile und keine
Jobs/Locks/Leases. Die erneut gelesene Kostenprojektion sperrt in der lokalen
Probe Cron und manuellen Aufruf vor Buchung und Transport. Kein bezahlter Test.

Der Betreiber hat anschließend ausdrücklich **6USD als Tagesriegel und6USD
als Gesamtgrenze** freigegeben und Fortsetzung verlangt; siehe
[Betreiberauftrag](autonom-bis-500-starttor-20260926.md).
Die technische Anpassung führt Tagesbuchversion2 mit6000000 Mikro-USD,
Laufzeitpolitikversion3 und Auftragsversion2 mit ebenfalls6000000 Mikro-USD ein.
Die Grenze ist inklusiv. Alte Tagesbücher Version1 behalten4000000; alte
Auftragsversion1 bleibt strikt unter4000000. Einzelauftragsdeckel, verbrauchte
Quittungen, Profilschutz und das gesonderte GO vor Aktivierung/500er Test bleiben.

Begrenzte Production-Änderung nach grüner Pflicht-CI und passendem Deployment:
Unter Zeilensperre ausschließlich Version/Limit des vorhandenen Auftrags und
heutigen Tagesbuchs auf2/6000000 setzen, externe Helferkosten nach neuem Beleg
nachführen und die Kontoschreibversion erneuern. Auftrag, Starttag, sämtliche
Tickets, verbrauchte Beträge, offene Reserven und frühere Tagesbücher bleiben
vollständig erhalten. Vorher exakt erwartete alte Werte und ruhenden Bestand
prüfen; nachher alle übrigen Kontendaten und die Profilhashes vergleichen.
Wirkung: neue Reservierungen dürfen belegbar gedeckten Rest bis6USD verwenden,
auch reguläre Hintergrundläufe im selben atomaren Gesamtwächter.
Rückweg: ursprüngliche Version1-Limits wiederherstellen, sofern die gebundenen
Beträge dies noch erlauben; andernfalls explizit gesperrt halten. Niemals zur
Rückkehr unter eine Grenze verbrauchte oder reservierte Kosten entfernen.

Lokale Helferkosten bleiben vor jedem weiteren bezahlten Schritt neu zu bilanzieren
und in der externen Bindung nachzuführen. Die einmalige Erhöhung ist weder ein
Budgetreset noch eine Freigabe verbrauchter Aufträge. Der getrennte Vorstartvertrag
mit null ungeklärten Reserven bleibt erhalten.

Die6USD-Anpassung besteht lokal19 Budgetgruppen,77 Laufzeitprüfungen,
33 Vorstartgruppen und8 Aufnahmegruppen. Die administrative Umstellung wurde
mit7 lokalen SQL-Prüfgruppen einschließlich vollständigem Rückrollen bei
Abweichungen geprüft. Keine dieser Prüfungen erzeugt Anbieteraufrufe.
