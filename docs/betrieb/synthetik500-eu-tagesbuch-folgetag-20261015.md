# EU500: fehlendes Tagesbuch am 15.10.2026 vorbereiten

Der Finanzreader verlangt ein persistiertes aktuelles EU-Tagesbuch. Bei 36
Büchern bis 14.10., Kapazität 36 und fehlendem 15.10. stoppt die unveränderte
Budgetprüfung mit `test-usd-buch-voll`; der Reader antwortet geschlossen mit409.
Der erste native Initializer verlangt `runDayUTC=null`. Ein bereits gebundener
14.10. wird dafür weder auf null noch auf den heutigen Tag umgeschrieben.

Der getrennte RPC `helmut_synthetik500_eu_daybook_rollforward_20261015` erhält
den gesamten nativen Prüfablauf des ersten Initializers: Mehrtabellensperren,
frische Auth-/Main-/Profilprüfsummen, atomarer Tageszähler, echte Kostenhistorie,
ruhender Arbeitsbestand, 500 inaktive Profile, historische unbekannte Reserven,
unveränderte Limits, Preisvertrag und Auth-CAS. Der alte Initializer bleibt
unverändert. Der Nachfolger verlangt zusätzlich genau den nativen UTC-15.10.,
`runDayUTC=2026-10-14` und den Übergang von36Büchern/Kapazität36 auf37.
Ein bereits identischer Zustand37/37 ist idempotent.

Einziger Schreibumfang ist das ungenutzte aktuelle EU-Buch, Kapazität37 und
eine frische Auth-CAS-Revision. `runDayUTC` bleibt14.10.; keine neue Laufbindung,
Reservierung, Profilaktivierung, Commandinstallation oder Modellfreigabe.
Der RPC ist `SECURITY DEFINER` mit festem `search_path=pg_catalog`; ausschließlich
`service_role` erhält EXECUTE. Der echte vertrauenswürdige JWT-Rollenclaim wird
zusätzlich geprüft. Adminzugriff oder ein selbst gesetzter Claim ersetzen keinen
gültigen Production-Aufrufweg.

Der äußere Aufruf muss bereits vor Beginn `statement_timeout<=15s` nachweisbar
setzen; der Funktionsparameter allein startet den äußeren Timer nicht neu.
`lock_timeout=3s` bleibt erhalten. Ein HTTP-Clienttimeout ist dafür kein Beleg.
Der berechtigte begrenzte Production-Aufrufweg, aktuelle native Pins und
vollständige Infrastrukturkostendeckung bleiben vor einer Anwendung erforderlich.
Diese Entwicklung führt weder Migration noch RPC in Production aus.

Der unveränderte vollständige Finanz-Witness akzeptiert lokal den hypothetisch
reparierten zuvor gelesenen Finanzausschnitt bei den Vertragswerten
2416Gesamtaufrufe,702Understandingreserve und200Realvorrang; abweichende Policy
bleibt409. Diese drei Runtimewerte sind aktuell nicht frisch belegt: der bestehende
Konfigurationsreader exportiert sie nicht. Das ist ein Nachkontrolltor, kein
ProductionPASS. Andere private Kontrollfelder waren nicht Teil des gezielt
gelesenen Finanzausschnitts. Frische native Quieszenz-/Controlprüfung bleibt Pflicht.
Ein Finanz200 beweist weiterhin keine Auth30-/Unit60- oder500er-Startbereitschaft.

Die isolierte PG17-Prüfung nutzt synthetische Daten und eine feste Uhr nur in
Testkopien beider Migrationen. Sie prüft den engen Effekt, echte Rollenrechte,
unveränderten alten Initializer, echte konkurrierende Profiländerung und
fehlgeschlossene Ablehnungen. CI verwendet denselben bestehenden netzlosen
EU-PG-Container, ohne Ports oder zusätzliche Infrastruktur.

Das getrennte Rollback entfernt ausschließlich den neuen RPC. Es löscht keine
Bücher/Tickets und setzt keine alte Auth-CAS-Revision zurück. Bei unklarem
Schreibausgang stoppen und rein lesend klären; kein automatischer Retry.
Profilaktivierung und kostenpflichtiger500erTest benötigen ein separates finalesGO.
