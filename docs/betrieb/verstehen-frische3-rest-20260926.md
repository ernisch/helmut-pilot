# Frische3-Rest: Dreierauftrag ausgefuehrt, zwei Ergebnisse fachlich abgenommen

Roadmap 3.3, autonomer [Betreiberauftrag](autonom-bis-500-starttor-20260926.md).
Der gestoppte Fuenferlauf `verstehen5-36277841330` hat zwei Quellen gespeichert/
aktualisiert, den dritten Wadephul-KI-Artikel faelschlich an den alten
Menschenrechtsrat-Vorgang gekoppelt und korrekt wegen Ebenenkonflikt gestoppt;
zwei Quellen wurden nicht begonnen. Der Code bereitet die drei noch offenen Restquellen fuer einen eigenen
Production-Auftrag vor. Er wurde bisher nur lokal geprueft; kein neuer Import
und noch kein scharfer Dreierlauf in diesem damaligen Vorbereitungsstand.
Der spaetere ausgefuehrte Lauf und die abweichende fachliche Bilanz stehen unten.

## Bindung (hart, fail closed)

Die bestehende Fuenfer-Eingabe `quellen-frische5-20260926-a` bleibt **unveraendert**
und wird vor der Teilauswahl **vollstaendig** validiert (Inhalt, Belegbindung,
Alter). Erst danach werden genau **drei** Restids ausgewaehlt und hart gebunden:

* ID-Hash (drei Restids): `ba00708446fe2a059f52f9068dad796886e477864952452024408d0b8e6ff27f`.
* Inhaltshash (drei Restquellen): `ed40733c536a108475a878aa6018f0fa084d38c2d2671244bc23265853106e58`.
* Beleghash (drei Originalbelege): `fbcee1518221ecc970d2c49dfa45111e5fab629c82c89ed6338c5c7f7a0a0ff5`.
* Eigenes neues Receipt: `verstehen-frische3-rest-20260926-a`; die verbrauchte
  Fuenfer-Quittung `verstehen-frische5-20260926-a` bleibt unberuehrt.
* Historischer Artikelkontext-Codebeleg `654fd8ea…` (getrennt vom echten
  Runtime-Commit, der im Workflow gegen `github.sha` gebunden wird).

Die zwei bereits verarbeiteten Fuenferquellen sind ausgeschlossen; eine Anfrage
ausserhalb der drei Restids stoppt (`frische3-rest-fremdes-dokument`). Der
bestehende Fuenfer-Vertrag und sein Quittungsschutz bleiben unveraendert; die
Wiederverwendung einer alten Kennung ist gesperrt.

## Alter unknown-Vorgang bleibt gesperrt

Beide historischen Belege werden voll kanonisch geprueft (rekursiv sortierte
Schluessel, dieselbe sha256-Form wie die gesicherten Belege):

* Fuenfer-Quittung: `1d3476b6…793df`.
* Quarantaenearchiv `helmut-wadephul-archiv-2302.json`: `72212ee5…9df54`.

Vor Start, waehrend des Plans und in der Nachkontrolle gilt: das alte KO
`ko-vg-bundesaußenminister-20260916-ddcd4d` (`e8dece68…`) und der alte CAS
`vg-bundesaußenminister-20260916-ddcd4d` (`c6abed06…`, weiter `zustand=unbekannt`)
sind gegenueber dem Archiv **unveraendert**, und es existiert **keine**
Vormerkung mehr (`fe22c3e8…`). Der alte unknown-Ausgang wird nie freigegeben.
Alle drei Restquellen muessen vor dem Start **unverknuepft** sein.

## Grenzen und Rueckweg

Rein lesender Plan ohne Modellzugang; der scharfe Lauf ausschliesslich ueber den
eigenen manuellen Hauptlauf. Produktpfad unveraendert: hoechstens **3**
Modellaufrufe, **0,25 USD**, **7 Minuten**, nur `gpt-5-mini`, kein Retry. Der
erste nicht bestaetigte Einzelausgang stoppt sofort; danach werden die
Ergebnispositionen vollstaendig bilanziert. Volle Vor-/Nachkontrolle:
500/501 Profilschutz, Ruhe, Locks, Kosten und Einmalverbrauch wie im Fuenferlauf.
Keine Migration, Cron-, Umgebungs-, Profil-, Budget- oder Kommunikationsaenderung.

## Lokale Abnahme

`scripts/verstehen-frische3-rest-test.js`: 8 Schutzpruefgruppen ohne private
Dateien plus 7 zusaetzliche Gruppen mit dem privaten Restpaket (15/15). Enthalten
sind die harten 3/0,25/7-Grenzen, Eingang und volle Fuenfer-Vorpruefung,
Manipulation von Inhalt und Belegen, die verbrauchte Quittung, falsche Quellen,
der abweichende alte CAS, das vollstaendig gelesene und gepruefte Archiv, der Happy-Path sowie zwei Nachweise, dass das echte
Archiv-KO als Kandidat NICHT gebunden wird (drei neue Cluster) und dass ein
Restcluster am alten gesperrten Vorgang fail closed stoppt. Kein Modellaufruf,
kein Netzwerk, kein Storage-Write.

Die neue Suite wird durch die bestehende Verstehen-Bereichsauswahl automatisch
zugeordnet; die allgemeine Standardmenge bleibt unveraendert. Kein Production
Import oder Verstehenslauf ausgefuehrt.

## Ausrollung und fachliche Planpruefung23:42UTC

PR637 gemergt als`100cfe8da27ca3a241b9353da84d2ca800f1e617`;
beide Pflichtpruefungen[36279583008](https://github.com/ernisch/helmut-pilot/actions/runs/36279583008)
gruen. Deployment`dpl_Ci6oQtosR9tUheNy2BiXqD2xE6JP` READY23:41:03UTC,
main-Aliase bestaetigt, keine error/fatal-Logs23:40:45–23:41:37UTC.

Plan[36280245443](https://github.com/ernisch/helmut-pilot/actions/runs/36280245443)
technisch bestanden:3 Quellen,2 neue Vorgangsbindungen und1 Update. Root hat
die Update-Bindung vor jedem Modellaufruf selbst geprueft und fachlich abgelehnt:
Die neue710-Millionen-Hilfsankuendigung wuerde ueber Kommissionspraesidentin plus
Leyen an die zehn Tage alte Rede zur Lage der EU gebunden. **Kein scharfer Lauf,
keine Modellkosten und keine neue Quittung.** Der alte Bestand bleibt unberuehrt.

Die enge Namensregel erkennt jetzt bis zu zwei Namenspartikeln zwischen Amt und
Eigenname (etwa von der, van den, de), ohne Satzgrenzen zu ueberlesen. Kein
Personen-Sonderfall und keine Schwellenabsenkung. Originalfall, zeitnahe
Gegenprobe, beide Richtungen, Erstcluster und Bestandsbindung getrennt; echte
Hilfsfortsetzung bleibt verbunden.95/95 Identitaetsassertionen,54/54 Resolver-
assertionen,15 Restauftrag-Schutzgruppen gruen. Gegen den vollstaendig gelesenen
aktuellen Praefixbestand ergibt der echte Resolver jetzt3 neue Ereignisse.
Zusaetzlich stoppt der konkrete Rest3-Vertrag vor jeder unerwarteten
Bestandsbindung; sowohl alter unknown als auch ein anderer Bestand negativ
geprueft. Neuer PR und erneuter rein lesender Plan nach READY erforderlich.

## Nachlauf27.09. und eng begrenzte Qualitaetssperre

PR638/`46a2bb7d137272860fcaa5ecd40f5aedd32fb0a0` ist READY
(`dpl_8tKuqmcbzbWKstMvWr3VJBMRZxQr`,00:00:56UTC); beide Pflichtpruefungen
36280461307 gruen. Plan36281227942 bestaetigt3 neue Ereignisse,0 Modellaufrufe.
Einmallauf[36281285571](https://github.com/ernisch/helmut-pilot/actions/runs/36281285571)
00:02:51–00:03:58UTC:3 Aufrufe,0,021170USD,3 neue Ergebnisse gespeichert.
Die technische Quittung nennt `fachlichBestanden=true`; das ersetzt den
folgenden redaktionellen Quellenabgleich ausdruecklich nicht.

Wadephul-KI: internationale Forderung, Vertretung von Merz und Rahmenwerk
quellenkonform; kein Menschenrechtsrat-Vorgang. EU710-Millionen: Ankuendigung,
keine Auszahlung behauptet;7,5 Millionen Ebola-Hilfe als Teil des Pakets.
Aegypten: Bericht und Dementi im Kerntext korrekt attribuiert, aber
`warum_wichtig` behauptet Dementis mehrerer Regierungen. Der gebundene
Originalabsatz nennt ausschliesslich das Buero Netanjahus. Deshalb wird das
gesamte Aegypten-Ergebnis nicht fachlich abgenommen.

Vorab definierte Production-Massnahme: nur
`vg-terrorüberfall-20260926-fe3a51` mit Voll-KO/CAS/Links archivieren unter
`quarantaene-aegypten-dementi-20260927-a`; danach allein
`understanding_status=failed` und Aenderungszeit. Risiko: eine weitere Quelle
steht vorlaeufig nicht fuer die Lage bereit. Rueckweg bei Fehler: Transaktion
zurueckrollen; spaeter keine automatische Freigabe des falschen Texts, kein
CAS-Reset und kein Retry. Vor-/Nachkontrolle: exakter KO-Hash, alle anderen
Felder/CAS/Links identisch,500 inaktiv/501 Identitaeten mit gleichen Vollhashes,
keine laufenden Jobs/Leases. Keine Modell- oder Profilaktion.

Massnahme nach erfolgreicher Rollback-Probe ausgefuehrt. Unabhaengige Nachlesung
27.09.,00:05:56UTC: Status`failed`, Archiv`fachlich-gesperrt`, alle anderen
KO-Felder, CAS und Quellenlinks exakt gleich. Archiv-Vollhash (Postgres-JSONB):
`f91994d89892cfb8adb5c175b4faa95131d862dedd429c5e01f249094be73535`.
Somit technisch3/3 gespeichert, redaktionell2/3 abgenommen,1/3 gesperrt;
0 fehlend,0 doppelt,0 unbekannte Ausgaenge. Keine Wiederholung gestartet.
Profilnachlesung00:10:09UTC:500 inaktiv/501 Identitaeten mit identischen Vollhashes,
0 Jobs/Locks/Leases/offene Reservierungen. Auftragsbindung00:06:19UTC
5,287592USD inklusive58 Helfersessions und0,35USD Altreserve; Anbieterrechnung
nicht behauptet, Tages-/Gesamtgrenze weiterhin je6USD.
