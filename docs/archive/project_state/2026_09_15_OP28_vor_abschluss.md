# Vollständiger OP-28 Vorgänger vor PR415 Abschluss

#### OP-28 · Lesefehler-Klassifikation: `401`/`403` schlagen als Teilstring durch (Sprint F-PORT 2026-08-03; P3)

- **Status:** offen. Ursache belegt und reproduziert; Behebung der Production Logik nicht begonnen.
- **Befund:** `klassifiziereLesefehler` prüft `401`/`403` als Teilstring der gesamten
  Fehlerkette und vor spezifischeren Regeln für DNS, Verbindung und Timeout. Eine Portnummer
  wie `40123` oder eine ISO Millisekunde `.401Z` kann deshalb eine Netzstörung fälschlich
  als `auth` melden. Beleg: [`betrieb/befund-werkzeug-haertung-w1-w2.md`](betrieb/befund-werkzeug-haertung-w1-w2.md) §16.
- **Folge:** kein falsches Grün, aber eine falsche Ursache für die betriebliche Fehlersuche.
- **Fehlender Schritt:** Auth Erkennung später an echte Fehlertoken binden und per
  Mutationsprobe belegen. Dafür ist eine eigene Freigabe nötig, weil sich
  Production Telemetrieklassen ändern.
- **CI:** die belegte Port Flackerursache in `werkzeug-lesefehler-test.js` ist testseitig
  beseitigt. Das getrennte Restrisiko im Timeout Szenario bleibt offen.

