# 500er Nachweis mit Bundestagsprofilen

## Entscheidung und Umfang

Der Betreiber hat am25.09. die weitere Roadmap-Arbeit, erforderliche Freigaben
und Entscheidungen ausdruecklich delegiert. Gewaehlt wird das bestehende
Produktziel Bundestag; kein Aufbau zweier Landesmodule fuer den Lastnachweis.
Die495 synthetischen Identitaeten und fuenf geschuetzten realen Zielprofile
bleiben dieselben. Der Ziel-ID-Hash aendert sich nicht.

Genau61 synthetische Profile waren Landtag (31 Mecklenburg-Vorpommern,
30 Thueringen). Beide Pflicht-Landespakete fehlen in Production. Diese61
werden auf politische_ebene=bundestag und zwei amtliche Bundestagsausschuesse
aus der vorhandenen kanonischen WP21-Liste umgestellt. Verteilung nach ihrem
unveraenderten Kohortenindex wie bei den anderen434 synthetischen Profilen.
Nur diese beiden Inhaltsfelder und updated_at duerfen sich aendern.
Keine neuen Konten, Namen, Parteien, Themen, Wahlkreise, Budgets, Aktivierungen
oder Kommunikationsrechte. Die fuenf realen Profile bleiben vollstaendig gleich.

## Code und Pruefung

testkohorte-bundestag erzeugt eine ausdrueckliche zweite exakte Sollmenge.
Der historische gemischte Generator bleibt fuer alte Nachweise erhalten.
pruefeSnapshot akzeptiert die neue Form nur als vollstaendige495er Kohorte:
alle61 betroffenen Profile muessen Bundestag sein, und jedes Profil muss seine
exakten Ausschuss-, Themen-, Partei-, Identitaets- und Budgetwerte tragen.
Eine Teilumstellung oder blosse Aenderung der Ebene scheitert weiterhin.
Keine synthetische Ausnahme in Produktlogik, Matching oder Aktivierungsreife.

Gezielt lokal:6/6 neue Gruppen (inklusive495 regulärer Reifepruefungen und
61 beseitigter Pflichtpaketluecken),9/9 bestehende Null500-Planergruppen,
16/16 Direkt500-Gruppen und4/4 Statusgroessenpruefungen.
Die alte und neue Kohorte ergeben dieselben500 Ziel-IDs; alle anderen Profile,
Identitaeten und Konten bleiben in diesen Gegenproben gleich.
Der neue direkte Test laeuft als testkohorte-*-test in der Fachregression.

## Production-Ausfuehrung erst nach gruenem Code und Rollout

Einmalige atomare Datenkorrektur, an die61 Zeilen und vollstaendige ruhende
Profilgrundlinie gebunden. Vorher/Plan/Nachher werden als Auditquittung gesichert.
15s je SQL-Anweisung,2s Sperrwartezeit,0 aktive Profile, keine laufende Arbeit.
Alle61 Zielzeilen vollstaendig gegen die erwarteten Felder nachlesen; saemtliche
uebrigen443 Mandatsprofile und505 Identitaeten bleiben hashgleich.
Bei unklarem Schreibausgang nur Quittung lesen, kein blinder Retry.
Rueckweg nur bei exaktem Nachherzustand und0 aktiven Profilen; alte beiden
Inhaltsfelder und Zeitstempel aus gesicherter Vorherzeile wiederherstellen.
Kein Loeschen, keine Quellenwirkung, keine Modellaufrufe durch diese Korrektur.

**Noch nicht ausgefuehrt.** Der Code-/Datenplan allein ist keine Aktivierung
und kein Funktionsnachweis. Frische Versorgung, sichtbare Bereichsabnahme,
Gesamtkosten/-zeit, Bereinigung auf exakt500 und gesicherter Testabschluss
bleiben notwendig. Testparteien und Testthemen werden nicht nachtraeglich an
eine gewuenschte Meldung angepasst, Relevanzschwellen bleiben unveraendert.

## Beobachteter automatischer Lauf

Rein lesend25.09.11:37UTC zugeordnet: regulärer Cron
understanding-rueckstand-20260925113011-s4exp,11:30:11–11:33:55UTC,
Commit3b0c9a10,16 Modellaufrufe,13 gespeichert/3 skipped-invalid,
69 zurueckgestellt. Kosten0,096869USD; Tagesstand0,304227USD,0 offen.
Dieser bestehende Cron wurde nicht neu ausgeloest. Keine aktive Arbeit bei
Vorabkontrolle. Die Quellen-/Qualitaetsbilanz muss neue Ergebnisse gesondert
beruecksichtigen; alte27er Lesungen sind keine aktuelle Gesamtbestandsabnahme.
