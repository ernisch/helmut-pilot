# Frische3-Rest: begrenzter Dreierauftrag (Code bereit, nicht ausgefuehrt)

Roadmap 3.3, autonomer [Betreiberauftrag](autonom-bis-500-starttor-20260926.md).
Der gestoppte Fuenferlauf `verstehen5-36277841330` hat zwei Quellen gespeichert/
aktualisiert, den dritten Wadephul-KI-Artikel faelschlich an den alten
Menschenrechtsrat-Vorgang gekoppelt und korrekt wegen Ebenenkonflikt gestoppt;
zwei Quellen wurden nicht begonnen. Der Code bereitet die drei noch offenen Restquellen fuer einen eigenen
Production-Auftrag vor. Er wurde bisher nur lokal geprueft; kein neuer Import
und noch kein scharfer Dreierlauf.

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
