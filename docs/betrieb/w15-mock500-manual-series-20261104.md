# W15: authentifizierter manueller Start der bestehenden Mock500-Serie

Der ausdrückliche Betreiber-GO vom 04.11.2026 erlaubt eine eng begrenzte manuelle
Startbindung anstelle des nicht verfügbaren Schedulerlaufbelegs. Die bestehende
[Dreierserie](w15-mock500-bounded-night-series-20261104.md), ihr Grant, Journal,
Reservierungs-/Abschluss-/Stoppanker und sämtliche Kosten-/Sicherheitsgrenzen
werden weder ersetzt noch zurückgesetzt. Der [nächtliche Blockierstand](w15-mock500-night-resume-blocked-20261104.md)
bleibt als tatsächlicher historischer Befund erhalten.

## Getrennte Herkunftsbindung

Die neue Vertragsversion `helmut-w15-mock500-manual-binding/1` akzeptiert nur eine
eigene manuelle Bindung an eine unveränderlich gepinnte tatsächlich erteilte
Betreiberfreigabe. Der vertrauenswürdige äußere Aufrufer muss deren Herkunft
zusätzlich authentifizieren. Selbst gesetzte API-/Umgebungswerte oder ein
Boolean allein erzeugen keine Berechtigung. Die Bindung umfasst den bestehenden
Seriengrant, den geprüften Kontrollcommit, den jeweiligen Runtimecommit, eine
frische Nonce, den Serienplatz sowie den tatsächlichen Codex-Thread und die
aktuelle nichtleere Laufzeit-/Cloud-Umgebung.

Jede technische Startbindung ist höchstens zwei Stunden gültig und erlaubt
genau einen Kindversuch, ohne Retry oder Linkrefresh. Die echte aktuelle UTC-Uhr
und die bisherigen Tages-/Ausführungsfenster bleiben maßgeblich. Die bestehende
Zeitformatkorrektur wird verwendet: ganze UTC-Sekunden zur Serialisierung,
hochaufgelöste echte Uhr zur Prüfung; keine Fristverlängerung.

Der bisherige Schedulerpfad bleibt unverändert. Eine manuelle Bindung erzeugt
keinen fiktiven Schedulerlauf und beweist keine automatische Wiederaufnahme.
Die pausierte Zeitsteuerung wird nicht durch einen manuellen Funktionserfolg
als technisch qualifiziert ausgegeben.

## Bestehender Einmalstart und Sicherheitsgrenzen

Die manuelle Variante verwendet dieselben geprüften Einzelprüfungen für Code,
Pflicht-CI, unabhängige Reviews, Originale, End500-Brücke, Environment,
Ausführungsbranch, Empfänger, tatsächliche Linkgültigkeit und Parametergröße.
Nur die zugelassene Herkunftsbindung ist anders. Vor Links/Dispatch wird ein
Platz dauerhaft im selben Journal reserviert und separat verankert. Die
gesamte authentifizierte GitHub-Laufhistorie wird abgeglichen; offene oder
widersprüchliche Plätze erlauben keinen zweiten Start.

Erste Runtime unverändert `789ea3ad49509d8a575a3e545333505f64e0f2ea` aus
PR #1032 mit Pflicht-CI41707992564 und unabhängiger Abnahme. Vor Aktivierung
müssen alle500 tatsächlichen D-/Provider-/Review-/vollenC-Bindungen bestehen.
Historischer Quellenvertrag und November-Simulationskalender bleiben erhalten.
End50041325430429 und Originalempfang41037459441 werden übernommen.

Maximal drei Gesamtversuche insgesamt, 0,05USD neue Speicherung je Versuch und
0,15USD insgesamt, je ein verschlüsseltes Artefakt für einen Tag. Frische Links
erst nach READY, unmittelbar vor dem einzigen POST mehr als90Sekunden tatsächliche
Restgültigkeit und höchstens65.535Parameterzeichen. Keine zusätzliche Linkrunde.

Maximal180Minuten Verarbeitung/210Minuten gemeinsam, vollständig innerhalb
desselben UTC- und Berliner Kalendertags im gültigen Novemberfenster. Dynamisch
frisch berechneter Hostschutz mit exakt2.147.483.648Bytes Reserve, Swap/OOM/harte
Grenzereignisse null, Platte mindestens536.870.912Bytes; maximal60DB-Verbindungen.
Auth<30Sekunden, Unit<60Sekunden, Mockphase<20Sekunden. Keine echten Modellaufrufe.
Keine Grenzen-, Kalender-, Quellen- oder Production-Änderung.

## Abnahme und Fortsetzung

PASS ausschließlich aus demselben tatsächlichen Lauf:500gleichzeitig aktive
synthetische Profile,500Units,1.000Mockphasen,1.500einzeln geprüfte gespeicherte
Ergebnisse,8.000Kontrollen und17.000Auditprüfungen; alle fünf Fehlerkategorien
getrennt, vollständige verschlüsselte Sicherung, authentifizierte Rücklesung,
zweite frische Rücksicherung und Integritätsvergleich, finale Nullaktivität
und tatsächlicher Prozessstillstand. Danach unabhängige Gesamtabnahme.

Ein neuer Platz nach sicherem funktionalem FAIL verlangt belegte Ursache,
minimale Korrektur, gezielte Tests, eigene Pflicht-CI/Review und frische Bindung
auf dem geänderten Nachfolgecommit. Das ist kein Retry derselben Kindfreigabe.
Bei UNKNOWN/Sicherheitsverletzung/unklarem Prozesszustand stoppen, weitere Starts
sperren und eigene Prozesse sicher beenden; alle Belege erhalten. Kein Merge,
Deployment, neue Ressource oder Production500. Keine automatische Löschung oder
Branchrücksetzung. Ein manueller Start beweist noch keinen Mock500-PASS.

## Tatsächlicher Startblock am 04.11.2026

Kontrollcommit `904c63c8f33c29cb0e9bec1c76e78a5334765dc0`, Pflicht-CI41793473003
mit beiden Pflichtchecks PASS. Zehn öffentliche und acht private gezielte
Prüfgruppen sowie die Zeitformatprüfung wurden übernommen. Die unabhängige
Vorstartprüfung übersah eine operative Voraussetzung: Das private gebundene
Dispatchverzeichnis muss vor dem Launcherstart existieren und dem bestehenden
Verzeichnisprüfer mit Eigentümer und Modus0700 genügen.

Der sichere Fast Forward der Ausführungsbranchkette von60019f03 auf unverändert
789ea3ad wurde bestätigt. Platz1 wurde dauerhaft reserviert. Der einzige
Launcheraufruf endete anschließend in `private-root`, vor STARTED/READY:
Das Verzeichnis fehlte; der vorhandene Prüfer öffnet nur bestehende Verzeichnisse.
Der Ausgang ist **bekannt: NOT_DISPATCHED**. Keine Linkrunde, kein POST, kein
GitHub-Job, keine Datenbank und keine Profilaktivierung; eigene Launcher- und
Watcherprozesse sind beendet. Tatsächliche Mock500-Zähler, RAM, Sicherung und
Nullaktivitätsquittung eines neuen Laufs liegen deshalb nicht vor.

Der bestehende Terminalprüfer verlangt einen authentifizierten tatsächlichen
Run/Job. Für diesen reservierten, nicht gestarteten Platz besteht kein erlaubter
Fortsetzungsabschluss. Deshalb externer Stoppanker und STOP-Journal mit
Kontrollgrund `UNKNOWN`; dies erklärt den fehlenden Vertragsabschluss und
ändert den bekannten No-POST-Befund nicht. Platz1 bleibt gezählt, kein Freigeben,
Reset, erfundener FAIL oder automatischer zweiter Start. Die Automation ist pausiert.

Die kleinste separate Vorbereitungskorrektur erzeugt das exakt gebundene private
Zustandsverzeichnis exklusiv mit0700 und prüft es mit demselben Runtimeprüfer vor
den Abschlussmetadaten. Bestehende Verzeichnisse, Symlinks oder Startbelege werden
abgelehnt. Fünf kleine synthetische Regressionstests bestehen; keine Änderung des
Runtimecodes, der Originale, Quellen-, Zeit-, Ressourcen- oder Kostenverträge.
Der fehlgeschlagene Kindbereich und seine Prüfnachweise bleiben unverändert.
Eine Wiederaufnahme der gestoppten Serie benötigt eine ausdrücklich genehmigte,
geprüfte Behandlung dieses No-POST-Abschlusses; die bestehende Freigabe erlaubt
keinen Ersatz aus einem neuen leeren Journal.
