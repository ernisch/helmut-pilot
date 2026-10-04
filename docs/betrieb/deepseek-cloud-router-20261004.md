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
