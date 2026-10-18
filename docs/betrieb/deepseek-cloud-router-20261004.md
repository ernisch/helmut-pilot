# DeepSeek Cloud Router

Stand: 04.10.2026.

## Zweck

Der Router senkt den Verbrauch des führenden OpenAI Codex Laufs, ohne den
Helmut Projektstand auf ein zweites Gedächtnis zu verteilen.

Der führende Lauf bleibt in Codex Cloud. DeepSeek arbeitet als begrenzter
Ausführer im selben Git Workspace. Die gemeinsame Wahrheit bleibt im Repository,
in Commits, Pull Requests, Tests und Production Belegen.

Der frühere lokale Router Branch `codex/router-delegation-20260926` wird nicht
wiederverwendet. Er liegt deutlich hinter aktuellem `main`. Übernommen werden
nur die bewährten Delegationsprinzipien.

## Technischer Weg

Der Launcher ist `scripts/deepseek-cloud-router.js`.

Er ruft DeepSeek direkt über die Responses API auf. Es gibt keinen
verschachtelten `codex exec` Prozess und keine zweite Codex Sandbox. Die
Konfiguration der führenden Codex Sitzung wird nicht verändert.

Der Provider ist `https://api.deepseek.com`. Unterstützte Routen sind
`deepseek-flash` und `deepseek-v4-pro` mit Denkstufe `high` oder `max`.

Der API Schlüssel wird ausschließlich aus `DEEPSEEK_API_KEY` gelesen. Der
Schlüssel steht weder im Repository noch in Kommandozeilenargumenten. OpenAI,
Supabase, Vercel, GitHub und andere Production Zugangsdaten werden nicht an den
DeepSeek Prozess weitergereicht.

DeepSeek erhält keine Shell. Der Router liest nur ausdrücklich übergebene
Textdateien und sendet deren Inhalt zusammen mit Pfad und SHA256 an die API.
Bei schreibenden Aufgaben akzeptiert der Router nur Änderungen an zuvor
ausdrücklich freigegebenen Repository Dateien und nur bei unverändertem
Ausgangs SHA256. Private Dateien außerhalb des Repositorys können für
rein lesende Prüfungen übergeben, aber niemals vom Router geschrieben werden.
DeepSeek darf keine Production Aktionen ausführen.

## Routing

1. Sol High führt normale Helmut Arbeit und entscheidet über Delegation.
2. Flash High ist der normale DeepSeek Ausführer.
3. Pro High übernimmt schwierige klar abgegrenzte technische Arbeit.
4. Pro Max ist nur für sehr schwierige klar abgegrenzte technische Blocker.
5. Sol Sehr hoch bleibt für unklare bereichsübergreifende Ursachen, Architektur
   und kritische Production Sicherheit.
6. Sol Max bleibt die Ausnahme für unmittelbar kritische Production Sicherheit.

Es gibt keine automatische Eskalationskette. Ein fehlgeschlagener Lauf startet
nicht still ein zweites Modell.

## Übergabevertrag

Der Auftrag an DeepSeek enthält nur Ziel, relevante Dateien,
Abnahmekriterien und Schutzgrenzen. Der Router liest die ausgewählten Dateien
im äußeren Codex Workspace und übergibt ihren Inhalt direkt an DeepSeek.
DeepSeek besitzt keinen eigenen Workspace Zugriff.

Die drei automatisch beigefügten kanonischen Projektquellen werden nicht mehr
vollständig übertragen. Der Router extrahiert daraus nur die für Helfer relevanten
Regel-, Schutz-, Ziel- und aktuellen Starttorabschnitte. Die Originaldateien bleiben
die einzige Wahrheit; bei fehlenden erwarteten Überschriften bricht der Router
fail closed ab. Messstand 04.10.2026 auf diesem Branch: 76.940 Zeichen vollständiger
Kernkontext gegenüber 32.142 Zeichen ausgewähltem Kernkontext.

Die finale sichtbare Rückgabe ist strukturiertes JSON und höchstens 2000 Zeichen lang.
Sie enthält nur Ergebnis, geänderte Dateien, tatsächlich ausgeführte Tests,
echte Risiken und genau einen nächsten Schritt. Ist eine valide strukturierte
Zusammenfassung länger, verdichtet der Router sie deterministisch und kennzeichnet
dies; der Helferlauf wird nicht allein wegen einer kleinen Längenüberschreitung verworfen.

Rohlogs, vollständige Diffs, lange Erklärungen und Projektgeschichte werden
nicht an Sol zurückgegeben. Bei schreibenden Aufgaben verarbeitet der Router
die ausführliche interne Änderungsantwort selbst und gibt an Sol nur die
kompakte Zusammenfassung, Route, Tokenverbrauch und angewendete Dateinamen
zurück. Sol prüft anschließend Diff und notwendige Tests.

## Aktivierungstor

Der Router bleibt inaktiv, bis alle folgenden Punkte erfüllt sind.

1. `DEEPSEEK_API_KEY` ist als Codex Cloud Credential oder Environment Variable
   hinterlegt. Der Wert wird niemals im Chat oder Repository geteilt.
2. Der Codex Cloud Netzwerkzugang erlaubt `api.deepseek.com`.
3. Der Offline Routertest ist grün.
4. Ein einzelner rein lesender Flash High Cloud Test ist erfolgreich.
5. Die sichtbare Rückgabe erfüllt den 2000 Zeichen Vertrag, gegebenenfalls nach
   deterministischer Verdichtung durch den Router.
6. Erst danach werden die aktiven Arbeitsregeln und der aktuelle Status als
   aktiviert gemergt.

Änderungen an einer veröffentlichten Codex Cloud Umgebung gelten für neue Cloud
Aufgaben. Für den ersten Routertest deshalb eine neue Cloud Aufgabe nach der
Umgebungsänderung starten.

## Direkter Router Test

Nach der Umstellung ohne verschachtelte Sandbox wird zuerst ein einzelner
rein lesender Aufruf mit einer ausdrücklich übergebenen Testdatei geprüft.
Erfolgsbedingungen sind: DeepSeek liest den übergebenen Inhalt, die strukturierte
Rückgabe bleibt unter 2000 Zeichen, keine Datei ändert sich und kein zweiter
Modellaufruf startet automatisch.

Danach folgt ein kleiner schreibender Test nur auf einer isolierten Testdatei:
DeepSeek liefert einen hashgebundenen Ersatzinhalt, der Router wendet ihn an und
ein lokaler Test bestätigt die Änderung. Erst danach gilt die direkte
Dateidelegation als belegt.

## Rückweg

Solange der Router nicht aktiviert ist, genügt das Schließen des Router Pull
Requests.

Nach einer späteren Aktivierung wird der DeepSeek Start in `AGENTS.md`
deaktiviert und der Launcher per Folge Pull Request entfernt oder stillgelegt.
Production Daten, Profile und Helmut Runtime sind davon nicht betroffen.

## Ausgabelimits und erhaltene Arbeit (isolierte Korrektur 18.10.2026)

Im aktiven Chat „HELMUT für 500er Test vorbereiten“ wurden Flash-Schreibarbeit
am Messharness sowie Pro-Schreibarbeit am JavaScript-Modul und SQL wegen des
Ausgabelimits ohne angewandten Code beendet. Diese Meldungen wurden nur lesend
übernommen; die privaten Originalantworten dieses Chats liegen hier nicht vor.
Eine genaue Aufteilung seiner verbrauchten Tokens ist deshalb nicht nachgemessen.
Der Routercode auf Ausgangscommit `021ab030` belegt den Mechanismus:

| Grenze | Bedeutung und Befund |
| --- | --- |
| Modell | Endliche anbieterseitige Kontext-/Ausgabekapazität. Das tatsächliche Modellmaximum wird hier weder neu gemessen noch als unbegrenzt angenommen. |
| Antwort | Der Router fordert fest 32.768 Ausgabetokens an. Reasoning und finale JSON-Antwort teilen dieses Budget. `incomplete/max_output_tokens` stoppt vor Anwendung. Vollständige Ersatzdateien müssen ebenfalls hineinpassen. |
| Werkzeug | DeepSeek hat keine Shell und schreibt nicht direkt. Erst nach abgeschlossener JSON-Antwort, Struktur-, Pfad- und Hashprüfung schreibt der Router. Zusätzlich gelten 220.000 Zeichen je Datei, 500.000 Quellenzeichen, 16 MiB curl-Puffer und 20 Minuten Transportzeit. |
| Sol-Übergabe | Die 2.000 Zeichen betreffen erst den sichtbaren Abschlussbericht. Valide längere Zusammenfassungen werden bereits verdichtet. Diese Grenze verursacht den vorherigen API-Abbruch nicht; keine zusätzliche geheime Sol-Begrenzung im Router gefunden. |

Ein größeres festes Tokenbudget allein löst das Problem nicht: Schon ältere
Erhöhungen sind im Router als unzureichend dokumentiert. Auch Prüfaufträge
können ihr Budget allein im Reasoning verbrauchen. Aufgaben deshalb auf eine
konkrete Funktion oder kleine Dateigruppe und wenige Abnahmekriterien begrenzen.
Bei zu großem Paket `blocked` mit genau dem nächsten kleineren Paket melden;
keine automatische Wiederholung oder Eskalation. Vollständig übernommene Arbeit
weiterverwenden; nur den offenen Rest delegieren.

Die Korrektur ist **optional** und verändert keine laufende Sitzung oder globale
Konfiguration. Bestehende Aufrufe behalten das vollständige Ersatzdateiformat.
Für kleine Änderungen innerhalb großer Dateien kann ein neuer Aufruf stattdessen
`--edit-format replacements` wählen. Pro Datei bleiben Pfad und ursprünglicher
SHA256 gebunden; `old_text` muss im Original genau einmal vorkommen. Höchstens
16 nicht überlappende Ersetzungen mit je maximal 12.000 Zeichen je Textseite;
resultierende Dateien behalten den bisherigen Deckel. Alle Änderungen werden
vor dem ersten Schreiben geprüft. Kein unscharfer Patch, kein Schreiben bei
Drift, doppeltem Pfad, falschem Format oder `blocked`/`failed` mit Änderungen.
Neue vollständige Module weiterhin in kleinere passende Module/Arbeitsschritte
zerlegen; exakte Ersetzungen reduzieren deren notwendige Neuausgabe nicht.

Beispiel für einen **zukünftigen**, ausdrücklich gewählten Entwicklungsauftrag:

```sh
node scripts/deepseek-cloud-router.js flash high write \
  --task-file /tmp/kleiner-auftrag.txt --file lib/helmut/example.js \
  --edit-format replacements --save-response /tmp/helmut-antwort-001.private.json
```

`--save-response` reserviert vor dem API-Aufruf eine neue Datei außerhalb aller
Git-Worktrees (0600, kein Überschreiben, keine Symlink-Zieldatei). Der Router
speichert die empfangene Antwort **vor** Status-/JSON-/Anwendungsprüfung samt
SHA256 des vollständigen Requests. Auch empfangene Teilantworten nach
Transportabbruch bleiben so erhalten. Keine Zugangsdaten oder Requestheader
werden gespeichert. Die Antwort kann Quellcode und Reasoning enthalten: privat
behalten, niemals in Git, Chat oder PR kopieren. Eine leere/teilweise Datei nach
Prozessabbruch ist ausdrücklich keine gültige Wiederaufnahme.

Nach manueller Sichtung kann eine **vollständige** gespeicherte Antwort mit
demselben Auftrag, Modell, Denkstufe, Format und identischen Quellen erneut durch
alle Prüfungen laufen, etwa nach einem zwischenzeitlich behobenen lokalen
Anwendungsfehler. Dafür im obigen Befehl `--save-response ...` durch
`--replay-response ...` ersetzen. Kein API-Schlüssel und kein Modellaufruf nötig.
Jede Requestabweichung stoppt; fremde Änderungen werden niemals zurückgesetzt.
Nach erfolgreicher Änderung passt die alte Ausgangsbindung nicht erneut.
Die sichtbare Quittung trägt `replayed: true`.
Der ausgewiesene Tokenverbrauch gehört dabei zur gespeicherten Originalantwort,
nicht zu einem neuen Aufruf. Unvollständige Antworten werden auch im Replay
abgelehnt. Deren vorhandene Textarbeit kann man lesen und für ein kleineres
Folgepaket nutzen; nicht erzeugter Code oder internes Provider-Reasoning lässt
sich nicht nachträglich rekonstruieren.

Offline geprüft über `scripts/lokal.js`: 30/30 Routergruppen, einschließlich
kompakter Änderungen an einer großen Datei, unveränderter Altaufrufe, eindeutiger
Originalstellen, Hash-/Auftrags-/Kontextdrift, privater Ablage, Transport- und
Antwortabbruch, Wiederaufnahme ohne Netz und ohne automatische Wiederholung.
Alle API-Antworten dieser Tests sind simuliert; keine kostenpflichtigen Modelltests.
Eine einzelne lesende Codeprüfung mit DeepSeek Flash High zu den neuen optionalen
Pfaden meldete keine blockierenden Sicherheitsfehler (keine Tests durch DeepSeek).
Ihre Hinweise zur bewussten Erhaltung von Fehlerantworten und zur weiterhin
notwendigen Syntax-/Integrationsprüfung sind oben berücksichtigt. Private
Originalantwort bleibt außerhalb von Git. Die zusätzliche Kennzeichnung
`replayed: true` und die zwei ergänzten Offlinegruppen wurden danach lokal geprüft.
Der laufende 500er Chat, seine Helfer, Dateien und Prozesse wurden nicht verändert.
Nur dieser eigene Worktree schreibt sequenziell; keine zusätzlichen Schreibhelfer.
Integration erfolgt später per eigenem PR; kein Merge oder Production-Deployment
in diesem Auftrag. Der gelesene CI-Prüfplan stuft die Routerdateien mangels
Bereichszuordnung als `full` ein (Standard-/Bereichs-/DB-Prüfung). Deshalb jetzt
nur eigener Commit, kein PR und kein Push, um keine zusätzlichen gemeinsamen
CI-/Preview-Ressourcen neben dem laufenden 500er Auftrag zu beanspruchen.
Die operativen Statusdateien und Agentenregeln bleiben für
den laufenden Nachweis unangetastet.
