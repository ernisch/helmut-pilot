# W15: Restore korrigiert, Datums-Vorabpruefung gestoppt

Der bestaetigte Ursachenfix ist umgesetzt: nur das an den Restore angehaengte
UPDATE verwendet jetzt `public.mandate_profiles`. Der leere Suchpfad bleibt
erhalten; Transaktion, ON_ERROR_STOP und Timeout bleiben unveraendert.
Angrenzende Befehle wurden unabhaengig geprueft: ihre neuen psql-Sitzungen
erben den geleerten Suchpfad nicht. Keine Motor- oder Architekturveraenderung.

## Tatsaechlicher Restorebeleg

Genau ein echter Restore in der neuen Testdatenbank
`helmut_w15_restorecheck_20261027` ist erfolgreich committet. Er lief im bereits
vorhandenen netzlosen Testcontainer, ohne bestehende Datenbanken zu aendern.
Die Vorpruefung extrahierte den tatsaechlichen korrigierten Controlleraufruf;
sie importierte keinen Controller und startete keine Anwendung.

| Merkmal | Frisch bestaetigtes Ergebnis |
|---|---|
| Profile / aktiv / Identitaeten |500 /0 /501 |
| Originaltabellen / Funktionen |13 /10, vollstaendige Kataloggleichheit |
| Primaer-/Fremdschluessel |11 /4 |
| RLS / ALWAYS-Trigger |13 Tabellen /2 Trigger |
| Datenvollstaendigkeit |Alle13 Tabellenhashes entsprechen dem Original |
| Einzige Zielabweichung |Profilaktivflags auf false; Vergleich projiziert true nur im SELECT |
| Originalquelle |Vorher/nachher unveraendert; unabhaengig frisch gegengelesen |
| Unabhaengige Nachlese |14/14 positiv; zwei READ-ONLY-Abfragen, keine Writes |
| Aktivierungen / Units / Mockantworten |0 /0 /0 |

Der vollstaendige Dump enthaelt931Dokumente,517KOs und979Links. Die fuer W15
ausgewaehlten7Dokumente/6KOs sind eine Teilmenge und keine Gesamtzahl der DB.
Keine Verkleinerung, kein Quellenimport und keine Veraenderung der Originale.
Die fehlgeschlagene alte Versuchsdatenbank und ihre Rohbelege bleiben erhalten.

## Neuer Versuch und tatsaechlicher Blocker

Fuer den bedingt freigegebenen neuen Vollauf wurden ausschliesslich neue
Zielnamen fuer28.10. eingetragen: Container/DB/Work/Runtime/Audit stimmen
ueberein. Originalquelle, Receipt, Policy und gecachte Binaries behalten ihre
Pfade vom27.10. JS- und Python-Zeitgate lassen den neuen Lauf erst ab28.10.UTC
zu;3h+30min, beide Tagesgrenzen,31.10.-Vertrag und20%-Reserve bleiben erhalten.
Vor Ressourcenanlage verlangt der Controller den bestandenen Restorebeleg
einschliesslich unabhaengigem Review.

**Die anschliessende reine Datums-Vorabpruefung lief genau einmal und scheiterte.**
In `synthetik-500-w15-full500-preflight-test.js:35` verwendet ein verbliebener
positiver ISO-Formatvergleich zweimal27.10. statt28.10. Die neue Startsperre
weist dieses Datum korrekt mit `w15-full500-window-order-date` ab. Dieser
veraltete Testfall wurde bei der Datumsumstellung uebersehen.

Nach dem Fehler keine Reparatur, Wiederholung oder weitere Ausfuehrung.
Unabhaengige Reviews markieren die Bereitschaft ausdruecklich als blockiert.
Kein READY-Siegel, Timer, neuer Vollaufcontainer, Profilaktivierung oder Unit.
Der neue bedingt freigegebene500er-Gesamtversuch ist **noch nicht gestartet**.

V8-Coverage wurde bei diesem ohnehin noetigen Puretest mit erfasst: zwei
geschuetzte Rohdateien; nur geladene Test-/Starter-/Gate-Dateien, keine
Anwendungsabdeckung. Die Zusammenfassung nennt Funktions-Eintritte, keine
behauptete Zeilen-/Branchabdeckung. Keine Voll-CI oder Einzelunit wiederholt.
Anwendungscode/Workflows seit da63309c unveraendert; vorhandene gruene
CI40534410137 bleibt ein uebernommener Befund, kein Test des neuen Controllers.

## Belege und naechste Aktion

- [Gesamtbericht](belege/w15-processing-20261027/RESTORECHECK_20261027_SUMMARY.SAFE.json).
- [Echter Restore](belege/w15-processing-20261027/RESTORECHECK_20261027_RESULT.SAFE.json).
- [Unabhaengige Nachlesung](belege/w15-processing-20261027/RESTORECHECK_20261027_INDEPENDENT.SAFE.json).
- [Datumsfehler](belege/w15-processing-20261027/RESTORECHECK_20261027_DATE_PREFLIGHT_FAILURE.SAFE.json).
- [Begrenzte Coverage](belege/w15-processing-20261027/RESTORECHECK_20261027_COVERAGE.SAFE.json).

Gestoppt gemaess Betreiberregel: „Bei Fehler oder unbekanntem Zustand sofort
stoppen, keine Wiederholung.“ Fuer die kleine Testdatenkorrektur
(beide positiven27.10.-Eingaben in Zeile35 auf28.10.) und eine erneute reine
Vorabpruefung wird deshalb eine Bestaetigung benoetigt. Die bestehende bedingte
Freigabe fuer genau einen Vollauf bleibt ungenutzt: Start erst ab28.10., nach
gruenen Gates und erneut gepinntem unabhaengigem Review. Kein Productionnachweis
oder Urteil ueber echte Modellqualitaet. PR969/971/972 bleiben ungemergt.
