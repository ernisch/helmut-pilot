# Helmut Factory V1

Ein sehr kleiner, **vollständig manueller** Workflow für **genau eine Aufgabe zur Zeit**.
Keine Plattform, kein Agentensystem, kein Hintergrundprozess.

Die Factory hilft in vier Schritten:

1. Ein GitHub-Issue auswählen und einen sauberen **Arbeitsauftrag** erzeugen.
2. Die Aufgabe **manuell** mit Claude Code bearbeiten (die Factory startet Claude Code **nicht** selbst).
3. Das Ergebnis in einem **Abschlussbericht** dokumentieren.
4. Einen kompakten **Review-Auftrag** erzeugen.

Danach ist der Lauf zu Ende. Es wird **kein** nächstes Issue geladen.

---

## Voraussetzungen

- **Node.js** (bereits im Repository in Gebrauch).
- **GitHub CLI** (`gh`) – nur zum **Lesen** des Issues.
  - Installieren: <https://cli.github.com>
  - Einmalig anmelden: `gh auth login`
  - Ist `gh` nicht vorhanden, meldet die Factory das verständlich und bricht ab.

Es werden **keine** Zugangsdaten gespeichert, **keine** Modell-/API-Aufrufe gemacht
und **keine** Schreibaktionen auf GitHub ausgeführt.

---

## Ablauf mit konkreten Befehlen

Angenommen, du bearbeitest **Issue 42**.

### 1. Lauf starten

```bash
node tools/helmut-factory/factory.js start 42
```

Die Factory lädt (nur lesend) Titel, Beschreibung, Kommentare und erkennt direkt
verlinkte Dateien. Sie schreibt:

```
.factory-runs/issue-42/arbeitsauftrag.md
```

Diese Datei enthält: Issue-Ziel, erlaubten Umfang, verbotene Änderungen,
Abnahmekriterien und einen empfohlenen Claude-Code-Auftrag.

### 2. Aufgabe bearbeiten (manuell)

Öffne Claude Code **selbst** im Repository und übergib die Arbeitsdatei als Kontext.
Die Factory startet Claude Code bewusst nicht.

### 3. Lauf abschließen

```bash
node tools/helmut-factory/factory.js finish 42
```

Die Factory fragt nach Zusammenfassung, geänderten Dateien, Tests, offenen Risiken
und einem Commit-/Pull-Request-Link und schreibt:

```
.factory-runs/issue-42/abschlussbericht.md
```

### 4. Review-Auftrag erzeugen

```bash
node tools/helmut-factory/factory.js review 42
```

Aus Arbeitsauftrag und Abschlussbericht entsteht:

```
.factory-runs/issue-42/review-auftrag.md
```

Der Review-Auftrag prüft, ob das Issue erfüllt wurde, ob der Umfang eingehalten
wurde, ob Tests fehlen, ob unnötige Änderungen entstanden sind und ob ein Merge
empfohlen wird. Auch hier wird **kein** Modell automatisch ausgeführt.

---

## Dateien

| Datei | Zweck |
| --- | --- |
| `factory.js` | Das gesamte Script (Befehle `start`, `finish`, `review`). |
| `factory.config.json` | Repository-Name und Standard-Textbausteine. |
| `factory.test.js` | Minimale Tests (ohne Netzwerk / ohne `gh`). |
| `README.md` | Diese Anleitung. |

Alle Läufe liegen unter `.factory-runs/` (in `.gitignore`, wird **nicht** eingecheckt).

---

## Tests ausführen

```bash
node tools/helmut-factory/factory.test.js
```

Getestet werden: fehlende Issue-Nummer, nicht gefundenes Issue, erfolgreiche
Arbeitsdatei, erfolgreicher Review-Auftrag und dass `gh` **nur lesend** genutzt wird.

---

## Bewusst NICHT enthalten

Keine Heartbeats, keine Scheduler, keine Hintergrundprozesse, keine selbstständige
Auswahl weiterer Issues, keine Recovery-Schleifen, keine Datenbank, keine
Web-Oberfläche, keine neuen Agenten, keine automatischen Modell-/API-Aufrufe,
keine automatische Pull-Request-Erstellung, keine automatischen Merges, keine
Änderungen an Produktion. Genau **ein** Issue pro Lauf – danach Stopp.
