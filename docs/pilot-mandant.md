# Pilotmandanten-Pilot

## Ziel

Helmut wird dem Pilotmandanten nicht als Dashboard gezeigt, sondern als digitaler politischer Stabschef.

Kernsatz:

> Helmut reduziert deine politische Morgenlage auf Entscheidungen, Kommunikation und Aufgaben.

## 3-Minuten-Demo

1. Morgenbriefing öffnen.
2. Thema des Tages zeigen.
3. Eine Empfehlung öffnen.
4. Quellenbasis zeigen.
5. Kommunikationsvorschlag generieren.
6. Aufgabe an Büro delegieren.

## Was der Pilotmandant sehen soll

- Was heute wichtig ist.
- Was ignoriert werden kann.
- Worauf du reagieren solltest.
- Welche Chance entsteht.
- Welches Risiko entsteht.
- Welche Formulierung du direkt nutzen kannst.
- Welche Aufgabe du delegieren kannst.
- Worauf die Empfehlung basiert.

## Pilot-Regel

Wenn Live-Quellen keine belastbare Entscheidungslage erzeugen, zeigt Helmut die kuratierte Demo-Lage.

Das ist Absicht: Helmut soll nicht Daten anzeigen, sondern Entscheidungen vorbereiten.

## Vor dem Termin prüfen

```bash
npm run build
curl http://localhost:3000/api/crawl/run
curl http://localhost:3000/api/briefing/run
npm run dev
```

App lokal:

```text
http://localhost:3000
```

## Optional für bessere Texte

```bash
OPENAI_API_KEY=dein_key OPENAI_MODEL=gpt-4.1 npm run dev
```

Ohne API-Key läuft Helmut regelbasiert weiter.

## Feedback-Fragen

1. War das Thema des Tages wirklich relevant?
2. War die empfohlene Handlung konkret genug?
3. War der Kommunikationsvorschlag nutzbar?
4. War die Quellenbasis ausreichend?
5. Würdest du das sieben Tage morgens testen?

## Entscheidung nach 7 Tagen

Fortsetzen, wenn mindestens drei Punkte zutreffen:

- Der Pilotmandant öffnet Helmut morgens freiwillig.
- Mindestens eine Empfehlung pro Tag ist politisch nutzbar.
- Mindestens ein Kommunikationsvorschlag spart echte Zeit.
- Das Büro kann Aufgaben daraus ableiten.
- Die Quellenbasis wirkt intern vertretbar.
