# Einmaliges Quellen-Abschlussfenster am 15. November 2026

## Auftrag und vorbereiteter Umfang

Erneuter Betreiberauftrag im selben Thread, 15.11. ab18:43UTC:
„Ich möchte bitte dass wir Weiterarbeiten. Du hast jede Freigabe.
Hauptsache wir werden heute fertig“.

Der zuvor bestätigte Tagesstand8/8Fenster/2400Sekunden sperrt die sofortige
Verarbeitung der vier reparierten Quellenaufträge. Die ausdrückliche erneute
Freigabe wird als genau ein begrenztes Abschlussfenster konkretisiert. Der
vorhandene Admin-, Reservierungs-, Worker- und Kostenpfad bleibt maßgeblich;
es entsteht kein zweiter Verarbeitungspfad und kein neuer technischer Zugang.

Die Codeänderung erlaubt ausschließlich am15.11.2026 ab18:43UTC nach
bestätigter normaler Fenster-Tagesgrenze eine zusätzliche atomare Reservierung:

- Eigener globaler Einmalschlüssel `quellenarbeit|quellenabschluss-v1`, Maximum1.
- Bestehender Fensterzähler steigt höchstens von8auf9, Sekunden von2400auf2700.
- Maximal300Sekunden, ein verteilter Worker, vorhandene Lease und Restzeitwachen.
- Originalkontingent bleibt16. Kein zusätzliches HTML-/Paywall-/Bot-Schutzrecht.
- Geldvertrag unverändert1USD jeUTC-Tag/30USDgesamt; keine alten Reserven ändern.
- Nur echter gültiger Adminauftrag mit bestehender Anmeldung und CSRF-Schutz.
  Cron erhält keinen Zusatztermin und kein Recht außerhalb des normalen Slots.
- UNKNOWN, verlorene Antworten und Teilreservierungen bleiben konservativ
  verbraucht. Kein Reset, keine Erstattung oder blinde Wiederholung.
- Am16.11. und vor dem genannten Freigabezeitpunkt keine neue Ausnahme;
  historische14.11.-Rechte und deren Originalgrenzen unverändert.

Der Code allein startet keine Verarbeitung. Der vorhandene Startknopf benötigt
technisch die echte Adminsitzung des Betreibers. Technischer Cron-/Service-Key
ersetzt sie ausdrücklich nicht; kein Auth-/CSRF-Bypass wird eingerichtet.

## Vorprüfung und Abnahmekriterien

Native Lesekontrolle18:48:09UTC: null laufende Jobs; Tagesbindung0,636184USD,
Gesamtbindung4,019218USD, acht offene Altreserven. Maximal0,363816USD zusätzlicher
Geldraum innerhalb des unveränderten Vertrages, nicht als Verbrauchszusage.

Vier betroffene Inhaltsaufträge stehen jeweils auf `wartend`, `attempts=0`,
Priorität80 und denselben vollständigen Zeilen-MD5 wie im [Altstandbeleg](quellen-altstaende-korrektur-20261115.md):

| Auftrag | Quelle |
| --- | --- |
| `2ca02a70-aada-4e5b-b6c0-36ba068e51aa` | DIP292306 |
| `e87719a6-46ed-4cca-bbd2-dabf7392507b` | DIP292309 |
| `b7ab8d16-abcf-41ae-8d3b-064c7ff85a78` | neue ZDF-Version |
| `1f22fa3a-f69e-4823-ba32-8a5b9fab5623` | neue BMAS-Version |

Für den konkreten Einzelstart dürfen diese vier unverarbeiteten Aufträge
vorwertgebunden Vorrang erhalten. Der native SQL-Claim sortiert Priorität
aufsteigend; fachlich höhere Priorität bedeutet daher kleineren Zahlenwert.
Keine erfolgreichen Jobs oder alten Fehlversuche wieder öffnen. Gegebenenfalls
genau zwei frische native RSS-Aufträge für die bereits freigegebenen Feeds
Destatis/iRights ergänzen, damit der produktive Quittungshook tatsächlich
gemessene Abrufe belegen kann. Tagesplan und seine alten Ergebnisse erhalten.
Diese Datenvorbereitung wird separat mit exakten Vorwerten und Rückweg geprüft;
sie ist durch diesen Code-Merge noch nicht ausgeführt.

Erfolgskriterien: echte persistierte Abschlüsse der vier Zielaufträge, echte
Production-Abrufquittungen beider Feeds, erhaltene Attribution und Alt-Erfolge,
unveränderte Kosten-/Originalgrenzen, ehrlicher verbleibender Abdeckungsstatus.
Ein HTTP200, Code-Merge oder reserviertes Zusatzfenster begründet keinen Erfolg.

## Prüfung und Rückweg

Vorhandene isolierte Prüfungen über `scripts/lokal.js`, ohne Provider-/
Productionzugriff:10/10Einmalfenstergruppen,8/8Echtlaufgruppen,21/21normale
Arbeitsfenstergruppen grün. Neue Gegenfälle prüfen insbesondere den fehlenden
Original-Zusatzanspruch, UTC-/GO-Bindung, Replay und verlorene Buchungsantwort.
Unabhängiges lesendes Review des vollständigen Zwei-Dateien-Diffs ohne P1/P2.
Bestehende9/9Routengruppen und16/16Adminstartgruppen einschließlich echter lokaler
HTTP-/Session-/CSRF-Grenzen ebenfalls grün.60/60Prüfplangruppen einschließlich
neuer strikter Abweisungsfälle grün. Der enge CI-Vertrag bindet beide Code-/
Testblobs, Basis19097b28, Belegcommit2cfdd2ab, PR/Branch und vollständigen übrigen
Baum. Unbekannte Runtime oder falscher Mainmerge stoppt, kein Mengenrückfall.
Keine Massen-/Last-/bezahlten Tests; beide Pflichtjobs bleiben am exakten Kopf.

Vor dem Start kann die kleine Codeausnahme durch einen regulären geprüften
Revert entfernt werden. Nach Start keine verbrauchten Zähler, Einmalbindung,
Jobfortschritte oder Ergebnisse zurücksetzen. Bei unbekanntem Ausgang zunächst
ausschließlich native Quittung und Kosten lesen. Keine erneute Startanforderung.
Die alte einmalige Morgenkontrolle bleibt als Rückfall bestehen und wird nur um
tatsächliche neue Ergebnisse ergänzt, ohne neuen Termin oder Selbst-Neuplanung.

EUR-Lex-WAF, ungeklärte Artikelrechte und echte Kunden-/Rechtsgesamtfreigabe
bleiben separate Blocker. Ein Zusatzfenster beseitigt sie nicht und erteilt keine
pauschale Quellenlizenz. Quellenversorgung bleibt bis zum Wirkungsnachweis partial.
