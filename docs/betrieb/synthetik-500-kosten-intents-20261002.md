# Endliche Kosteninventur fuer den synthetischen 500er Nachweis

Die lokale [Vorbereitung](../../lib/helmut/synthetik-500-kosten-intents.js) erstellt
500 Entwurfspositionen D, 500 Quellenpruefpositionen R und die ausdruecklich
aufgelisteten Verstehenspositionen U. Sie bindet das bestehende Fiktionspaket
330 Bundestag / 120 Berlin / 50 Brandenburg und dessen 1500 Sollpositionen.
Sie ruft keinen Anbieter auf und schreibt keine Production-Daten. Der Status
`executionReady` bleibt immer `false`; dies schliesst den Kostenblocker noch nicht.

Jede Position bindet Phase, synthetische Profilkennung oder Vorgangskennung,
Modell, Ausgabelimit und hoechstens einen Versuch. D und U erhalten explizit
deklarierte lokale Inputversionshashes. Das bestaetigt keine Production-Eingabe.
Die 500 R-Positionen sind endlich und jeweils an ihre D-Position sowie deren
Kontextversion gebunden. Ihr exakter Prompthash bleibt `null`: der bestehende
Reviewprompt enthaelt den erst durch D erzeugten Entwurf. Vor R muss die Runtime
die bestaetigte D-Quittung und den tatsaechlichen kanonischen R-Input atomar binden.
Ein Profil- oder Kontextversionshash darf diesen Review-Prompthash nicht ersetzen.

`understandingInputs=null` kennzeichnet die konkret fehlende endliche Liste.
Eine explizite leere Liste bedeutet nur eine lokale Planerklaerung. Sie beweist
weder, dass bestehende Understanding-Crons nichts aufrufen, noch dass andere
kostenpflichtige Pfade deaktiviert sind. Je Vorgang ist hoechstens eine
Inputversion erlaubt; eine neue Version braucht einen neu geprueften Plan.

Die Vorbereitung nutzt unveraendert die bestehende konservative Tokenreserve
von `testkosten-budget.js`. Der regulaere Modus mit 3000 Ausgabetokens ergibt
fuer 500 D und 500 R eine **bedingte Bruttosumme von 212 USD**, zuzueglich
0,212 USD je gelisteter U-Position. Der bereits existierende explizite
6000-Token-Reviewmodus ergibt fuer D/R bedingt 218 USD. Das sind weder
Anbieterrechnungen noch ein begruendetes Ganzbudget oder eine Budgetanfrage.
Andere bezahlte Pfade und fehlende Eingangsnachweise bleiben offen.
6 USD je UTC-Tag und 7 USD kumulativ werden nicht veraendert; sie koennen die
Ausfuehrung lange vor vollstaendigen 1500 qualitativ gueltigen Ergebnissen stoppen.

Die kleinste noch fehlende Runtime-Integration liegt in `ai.requestOpenAI`
und dem vorhandenen Geldreserve-CAS in `testkosten-budget.reserviere`:

1. Einen konkret freigegebenen Plan an Laufkennung, unveraenderlichen Planhash,
   echtes Deployment und ein Fenster von hoechstens vier Stunden an demselben
   UTC-Tag binden. Die lokale Vorbereitung aktiviert diesen Plan nicht.
2. In **demselben** vorhandenen Auth-Store-CAS genau einen passenden,
   unverbrauchten Intent pruefen, als verbraucht markieren und seine gesamte
   Geldreserve buchen. Fehlender/fremder/verbrauchter Intent, Versionsdrift,
   abgelaufenes Fenster oder unklarer CAS-Ausgang stoppen vor Anbieter-HTTP.
   Ein Nicht-Sende-Beleg oder Timeout erzeugt keinen neuen erlaubten Versuch.
3. D/R-Metadaten aus `generateLageBriefing` und U-Vorgang/Inputhash aus den
   beiden `requestUnderstanding`-Aufrufen bis zur zentralen Reserve weitergeben.
   Der derzeitige Understanding-Defaultadapter verliert diese Identitaet.
4. Alle weiteren Textaufrufer muessen einen ausdruecklich zugelassenen Intent
   tragen oder stoppen. Der eigene Azure-Embedding-HTTP-Pfad liegt ausserhalb
   dieser Textreserve und benoetigt einen getrennt belegten Ausschluss oder
   eine eigene endliche Aufnahme samt Geldgrenze. Ein Standalone-Validator
   erzwingt keine dieser Bedingungen in den bestehenden Aufrufpfaden.

Die [CLI](../../scripts/synthetik-500-kosten-intents.js) liest nur lokale
0600-JSON-Dateien mit `--paket ABSOLUT --eingaben ABSOLUT`. `--out ABSOLUT`
schreibt einmalig eine private 0600-Inventur ausserhalb von Gitroots; Standardausgabe
enthaelt Mengen, Hashes, bedingte Betraege und offene Sperren, keine Inputinhalte.
Das Eingabenformat `helmut-synthetik500-kosten-eingaben/1` verlangt `runId`
im bestehenden `nachlauf500-<Ziffern>`-Format, `window` mit kanonischen UTC-Feldern
`startUTC/endUTC`, `model="gpt-5-mini"`, `reviewMaxOutputTokens=3000|6000`,
genau 500 `lageInputs` aus `{owner,inputVersionHash}` sowie eine endliche
`understandingInputs`-Liste aus `{vorgangId,inputVersionHash}` oder `null`.

Die neuen gezielten Tests pruefen Inventur, Abhaengigkeiten, Versionsdrift,
Doppelbelegung, Fenster, unveraenderte Limits und inerte private CLI-Ausgabe.
Sie sind kein Beleg fuer atomare Runtime-Admission, Freigaben, Aktivierung,
bezahlte Durchfuehrung, 1500 fertige Ergebnisse oder aktuelle Production-Konfiguration.
