# Kostenbremse fuer das bestehende 500er Testfenster

Stand 09.09.2026. Technischer Vertrag, kein Production Funktionsnachweis und keine Freigabe eines bezahlten Laufs.

## Wirkung

`lib/helmut/testkosten-budget.js` begrenzt Textmodellkosten im bereits bestehenden
gesperrten Production Testmodus auf **4 USD je UTC Tag**. Aktiv nur bei
`VERCEL_ENV=production` und `HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt`.
Der Riegel steht in `ai.requestOpenAI` vor der bisherigen Aufrufreservierung und
vor HTTP. Er gilt auch fuer regulaere Textmodellaufrufe und fuer Aufrufer mit
`budgetExempt`. Die bisherigen Zaehler, Sperren und Kommunikationsregeln bleiben bestehen.
Keine neue Umgebungsvariable, Tabelle oder Migration.

## Geldreservierung

Freigegeben ist ausschliesslich Azure `gpt-5-mini` mit hoechstens 3000 Ausgabetokens.
Die feste Reservierungsrechnung verwendet **0,50 USD je Million Eingabetokens und
4 USD je Million Ausgabetokens**, bewusst oberhalb der veroeffentlichten Azure
Standardtarife fuer Global und Data Zone. Vor HTTP wird fuer den ganzen
400.000 Token Kontext plus die angeforderte Ausgabe reserviert, maximal 0,212 USD.
Die Microsoft Dokumentation nennt fuer Mini 400.000 Kontext, davon maximal
272.000 Eingabe; die verwendete Eingabereserve ist somit zusaetzlich konservativ.
[Modellgrenzen](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure),
[Azure Preise](https://azure.microsoft.com/en-gb/pricing/details/azure-openai/).
`max_output_tokens` umfasst auch Reasoning Tokens.
[Responses und Reasoning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning).

Die Reservierung liegt in `main-auth.testKostenTage` und nutzt den bestehenden
Compare-and-Set Schreiber. Gleichzeitige Prozesse teilen denselben Geldstand.
Historische heutige Tokenbelege werden bei der ersten Reservierung mit derselben
konservativen Rate angerechnet; unvollstaendige Belege oder Zaehlerluecken sperren.
Nach bestaetigter Kostenablage ersetzt der berechnete Tokenverbrauch die volle
Reserve. Die alte Kostenhistorie und ihre bisherigen Schaetzpreise werden nicht
umgeschrieben. Das ist eine technische Tokenkostenobergrenze, keine Anbieterrechnung;
Abonnements, Steuern und separat manuell gestartete Embedding Backfills gehoeren
nicht zu diesem Textmodellpfad und werden durch diesen Sprint nicht gestartet.

## Abbruch und Wiederanlauf

- Keine bestaetigte Reservierung: kein Anbieteraufruf.
- Fehlende Usage, verlorene Antwort oder unbestaetigte Kostenablage: volle Reserve
  bleibt stehen und der Tag wird fuer weitere Aufrufe gesperrt.
- Prozessabbruch: offene Reserve bleibt erhalten; nach fuenf Minuten sperrt sie
  neue Aufrufe auch nach einem Neustart.
- Nur belegbar vor HTTP abgebrochene Aufrufe geben ihre Geldreserve frei.
- Fuer `nachlauf500-*` gelten zusaetzlich insgesamt hoechstens 1000 Versuche und
  sechs Stunden ab dem ersten Aufruf, begrenzt durch das UTC Tagesende. Neue
  Laufkennungen setzen diese Grenzen nicht zurueck. Jeder einzelne bestehende
  Nachlauf bleibt auf vier Minuten begrenzt; es gibt keine automatische Fortsetzung.
- Fehlende Texte kommen innerhalb einer Fortsetzung vor Cache und Briefing Nachlesern
  an die Reihe, damit bereits versorgte Profile das kurze Zeitfenster nicht aufbrauchen.

## Nachweis und Grenzen

`scripts/testkosten-budget-test.js` prueft Geldinvarianten, historische Kosten,
unklare Ausgaenge, Loop Grenzen und den echten KI Einstieg mit lokalem Transport.
`scripts/fixtures/testkosten-datenbank.js` wird vom verpflichtenden PostgreSQL
Kontoschutztest ausgefuehrt: fuenf getrennte Prozesse versuchen 40 Reservierungen;
18 duerfen zusammen 3,816 USD halten. Nach einem unklaren Abschluss duerfen fuenf
neu gestartete Prozesse keine weitere Reservierung anlegen. Keine Production Daten
oder bezahlten Modellaufrufe in diesen Tests.

Der authentisierte Status liefert `textnachlaufVersion: 2` und den Geldvertrag.
Der bestehende Actions Ausfuehrer verlangt beides vor einem manuellen Textnachlauf.
Nach Deployment muessen Commit, Status, Tageskosten und fehlende Konkurrenz frisch
gelesen werden. Der bezahlte Fachlauf benoetigt die konkrete Betreiberfreigabe nach
CLAUDE.md §5. Aktivierung und Einzelpruefung aller 500 bleiben eigene Production
Belege; lokale Tests oder ein gruenes CI ersetzen diese Abnahme nicht.

Lokaler kanonischer Pflichtlauf: **340/345 Suiten in 590 Sekunden**. Vier Fehler
betreffen fehlendes Chromium beziehungsweise fehlende installierte Abhaengigkeiten
(`ical.js`, `@aws-sdk/client-sqs`). Ein weiterer Test fand einen unerlaubten
indirekten Crawler Import im neuen Geldmodul: behoben, gezielte Pfadisolation danach
vollstaendig gruen. Kostenmodul danach erneut 9/9, Nachlauf 14/14, echter Statusleser
48/48 bestanden. Der vollstaendige CI Lauf mit Browser und PostgreSQL ist das
verbindliche Gate vor einer Mergeempfehlung; sein Ergebnis ist hier noch offen.

Rueckweg: bestehendes Deployment nur mit Betreiberfreigabe zuruecksetzen. Dabei
entfaellt der neue Geldriegel; vor einer weiteren Modellarbeit muss das Fenster
geschlossen bleiben. Kein Loeschen oder Zuruecksetzen der Kostenreservierungen.


## Bestaetigter Abschluss der Codeveroeffentlichung

PR #347 ist seit 09.09.2026 mit der vorliegenden Commit und Mergefreigabe
uebernommen. Merge `d0cee4198086dc34a50ce5bd1fa00065436b1294`, Production
READY `dpl_7qCRjinKFKtWwRUeki1D96VnCYJm` am Hauptalias. Gepruefter PR Kopf
`a59e03f22dc6b2af331de2a8cb77a76644942123` und echter Merge enthalten denselben
Baum `8c6aa4a327e24f40620549c288112192d48309fe`.

[CI 34360404495](https://github.com/ernisch/helmut-pilot/actions/runs/34360404495)
bestaetigt 345/345 Offline Suiten in 656 Sekunden, 50/50 Browserpruefungen,
13/13 PostgreSQL Kontoschutz und Geldgruppen sowie 48/48 Z22 Datenbankpruefungen.
Die lokale Einschraenkung oben ist historisch, der komplette CI Stand ist gruen.
Keine Aktivierung und kein bezahlter Fachlauf durch diese Codeveroeffentlichung.


Der anschliessende [reine Statuslauf 34362141423](https://github.com/ernisch/helmut-pilot/actions/runs/34362141423)
ist completed/success auf demselben Production Commit. Am 09.09., 14:13:13 UTC
bestaetigt die authentisierte Route `textnachlaufVersion: 2`, `testKosten.version: 1`,
`aktiv: true`, `limitUsd: 4`, `maxManualCalls: 1000`. `scharferPfadFreigegeben`
bleibt false. Die optionale 500er Briefingpruefung wurde nicht gestartet.
