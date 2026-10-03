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

Er startet einen separaten ephemeren `codex exec` Prozess mit einem eigenen
`CODEX_HOME`. Die Konfiguration der führenden Codex Sitzung wird nicht
verändert.

Der Provider ist `https://api.deepseek.com`. Unterstützte Routen sind
`deepseek-flash` und `deepseek-v4-pro` mit Denkstufe `high` oder `max`.

Der API Schlüssel wird ausschließlich aus `DEEPSEEK_API_KEY` gelesen. Der
Schlüssel steht weder im Repository noch in Kommandozeilenargumenten. OpenAI,
Supabase, Vercel, GitHub und andere Production Zugangsdaten werden nicht an den
DeepSeek Prozess weitergereicht.

Codex filtert Variablen mit `KEY`, `SECRET` und `TOKEN` zusätzlich aus der
Umgebung der vom Helfer gestarteten Shell Befehle. Shell Netzwerkzugriff ist
deaktiviert. DeepSeek darf keine Production Aktionen ausführen.

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
Abnahmekriterien und Schutzgrenzen. DeepSeek liest den benötigten Projektstand
selbst aus dem Workspace.

Die finale Rückgabe ist strukturiertes JSON und höchstens 2000 Zeichen lang.
Sie enthält nur Ergebnis, geänderte Dateien, tatsächlich ausgeführte Tests,
echte Risiken und genau einen nächsten Schritt.

Rohlogs, vollständige Diffs, lange Erklärungen und Projektgeschichte werden
nicht an Sol zurückgegeben. Sol öffnet Primärbelege nur bei Bedarf.

## Aktivierungstor

Der Router bleibt inaktiv, bis alle folgenden Punkte erfüllt sind.

1. `DEEPSEEK_API_KEY` ist als Codex Cloud Credential oder Environment Variable
   hinterlegt. Der Wert wird niemals im Chat oder Repository geteilt.
2. Der Codex Cloud Netzwerkzugang erlaubt `api.deepseek.com`.
3. Der Offline Routertest ist grün.
4. Ein einzelner rein lesender Flash High Cloud Test ist erfolgreich.
5. Die Rückgabe erfüllt den 2000 Zeichen Vertrag.
6. Erst danach werden die aktiven Arbeitsregeln und der aktuelle Status als
   aktiviert gemergt.

Änderungen an einer veröffentlichten Codex Cloud Umgebung gelten für neue Cloud
Aufgaben. Für den ersten Routertest deshalb eine neue Cloud Aufgabe nach der
Umgebungsänderung starten.

## Erster Cloud Test

Eine temporäre Auftragsdatei außerhalb des Repositorys enthält eine kleine rein
lesende Frage zum aktuellen Repository. Der Aufruf nutzt Flash High und
`read`. Es werden keine Dateien geändert, keine Production Systeme berührt und
keine weiteren Modelle automatisch gestartet.

Der erste bezahlte DeepSeek Aufruf benötigt vor Ausführung eine konkrete
Kostenfreigabe. Danach wird nur bei tatsächlichem Bedarf weitergeroutet.

## Rückweg

Solange der Router nicht aktiviert ist, genügt das Schließen des Router Pull
Requests.

Nach einer späteren Aktivierung wird der DeepSeek Start in `AGENTS.md`
deaktiviert und der Launcher per Folge Pull Request entfernt oder stillgelegt.
Production Daten, Profile und Helmut Runtime sind davon nicht betroffen.
