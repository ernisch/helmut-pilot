# Lage-Timeout: belegter Kostenabschluss am26.09.2026

Der Betreiber hat den konkreten Abschluss des unbekannten Reviewverbrauchs
aus [Run36228851735](https://github.com/ernisch/helmut-pilot/actions/runs/36228851735)
ausdruecklich freigegeben. Kein neuer Modelllauf und kein500er Nachweis.

## Anbieterbeleg und Zuordnung

Azure Monitor, Deployment `gpt-5-mini`, Fenster08:05–08:12UTC:
genau2 `create-response`-Aufrufe, beide HTTP200, insgesamt7254 Eingabe-
und2492 Ausgabetokens. Im selben Fenster enthaelt Helmut genau die beiden
Aufrufe und Kostentickets des gebundenen Laufs. Der bekannte Entwurf traegt
4056/237 Tokens; fuer den verlorenen Review verbleiben3198/2255, insgesamt5453.
Azure ordnet beide Aufrufe der Minute08:09 zu; Helmut protokolliert sie08:08.
Es handelt sich um eine abgegrenzte Aggregatrekonstruktion. Die Modellantwort
wurde nicht wiederhergestellt; HTTP200 ist kein fachlicher Erfolgsnachweis.

Private Originalmetriken ausserhalb des Repositorys:
`/private/tmp/helmut-azure-metrics-20260926-helmut-resource.json`, SHA256
`40783d7f9bee1eb4a0c31a4a1fc700f4c47e64027449e6aaf6020e07fa17adb7`;
Statusaufschluesselung
`/private/tmp/helmut-azure-request-status-20260926-helmut-resource.json`, SHA256
`a0e9e23aee192f5a5fdb2bb045726f875f92122f734513379f799e5caa6b9853`.

## Production-Ausfuehrung und unabhaengige Nachkontrolle

Atomarer Abschluss09:16:43.593383UTC, Ruecklesung09:17:17.463799UTC:
genau ein vorhandener Nutzungsbeleg und ein Kostenticket korrigiert.
Herkunft, Originalwerte und vorheriger Ticketstand bleiben am Beleg erhalten.
Der konservative Budgettarif0,50/4USD je Million Eingabe/Ausgabe ergibt
**0,010619USD**. Tagesbuch jetzt **0,164443USD**, **0 offene Reservierungen**;
technische Tagesgrenze unveraendert4USD. Das ist keine Anbieterrechnung und
enthaelt nicht die Kosten lokaler DeepSeek-Arbeit.

Der Fehler `request-error:ETIMEDOUT`, `success=false`, Zeitpunkt, Dauer und
Laufzuordnung bleiben erhalten. Die Auftragsquittung bleibt `gestoppt`.
Aufrufzaehler25, Nutzungsring5000; alle anderen Tickets und Tagesbuecher gleich.
Alle500 Profile inaktiv; vollstaendige Profil- und Identitaetshashes unveraendert.
Die normale Auth-CAS-Schreibversion wurde erneuert, damit veraltete Schreiber
den Abschluss nicht ueberschreiben koennen. Vorher/Nachher waren an den
vollstaendigen Authzustand gebunden:
`ce08f016688f02bde7d0d7bee9aa5c37ed7f18d5d44e6ffa5c606a8d7c12b7c9`
→ `60f3c6def96ff43ac3b9a8b2c5cac4af960c44d8492493758ae97a0a71479147`.

Exakter Ruecklesevergleich und der unveraenderte kanonische
`testkosten-budget.pruefeStart` bestanden: Kostenstarttor frei. Keine
Qualitaetsfreigabe und keine Wiederverwendung des verbrauchten Auftrags.
Rueckweg nur fuer die gesicherten betroffenen Teilstaende und bei unveraendertem
Nachherzustand; spaetere Buchungen niemals ueberschreiben.

Frische Vollversorgung, fachlich bestandene Lage-Ausgabe sowie belastbarer500er
Kosten-/Zeitplan bleiben offen. Die fruehere lokale3/500-Auswertung wurde hier
nicht wiederholt. Keine Profilaktivierung und kein500er Test.
