# Helmut Pilot-Uebergabe fuer den Pilotmandanten

Stand: 23. Juni 2026

## Link

https://helmut-pilot.vercel.app

Pilot-Passwort: `<WIRD SICHER UEBERGEBEN — NIE IM REPO SPEICHERN>`

> Sicherheitshinweis (Audit 2026-07): Der fruehere Klartext-Zugangscode wurde aus
> dieser Datei entfernt. Er stand in der Git-Historie; PILOT_SECRET wurde am
> 2026-07-15 in Vercel rotiert (Redeploy erfolgt; Zugang via POST /api/pilot/unlock
> -> HTTP 200, Body {"ok":true} verifiziert) — der alte Code ist damit ungueltig.
> Offen bleibt nur die optionale Git-Historien-Bereinigung (Freigabepunkt FA-2, früher F2).
> Zugangsdaten werden nur noch ueber einen sicheren Kanal (Signal/persoenlich)
> uebergeben.

## Wofuer Helmut gedacht ist

Helmut ist kein News-Reader und kein Monitoring-Dashboard.

Helmut beantwortet morgens und im Tagesverlauf:

- Was steht aktuell an?
- Worauf solltest du reagieren?
- Welche Chance entsteht?
- Welches Risiko entsteht?
- Welcher Termin sollte vorbereitet werden?
- Welche Formulierung kannst du direkt nutzen?

## Empfohlener Pilot-Ablauf

1. Morgens Helmut oeffnen.
2. Unter `Heute` die wichtigste Entscheidung lesen.
3. Bei Bedarf `Empfehlung oeffnen`.
4. Fuer Kommunikation `Reaktion vorbereiten` nutzen.
5. Bei Arbeitsauftraegen `Buero` oeffnen und die Uebergabe kopieren.
6. Unter `Radar` pruefen, ob es neue namentliche Erwaehnungen gibt.
7. Unter `Profil` Mandatsprofil, Ausschuesse, Themen und Termine aktuell halten.

## Was der Pilotmandant testen sollte

- Versteht er in 30 Sekunden, was politisch ansteht?
- Sind die Empfehlungen konkret genug?
- Sind die Quellen belastbar und direkt oeffenbar?
- Sind die Formulierungen fuer Presse, LinkedIn, X oder Ausschuss nutzbar?
- Helfen die Terminvorbereitungen im Arbeitsalltag?
- Wuerde er Helmut mehrmals pro Tag oeffnen?

## Was aktuell funktioniert

- Persistenter Speicher ueber Supabase
- OpenAI fuer persoenliche Formulierungen
- Mehrmals taegliches Crawling ueber Vercel Cron
- Morgenbriefing und Tageslage
- Radar fuer namentliche Erwaehnungen
- Archiv alter Personenartikel
- Quellenbasis mit Direktlinks
- Buero-Uebergabe als kopierbare Arbeitsanweisung
- Mandatsprofil editierbar
- Release-Check fuer Pitch- und Betriebsstatus

## Betriebsstatus vor Uebergabe

Live-Check am 23. Juni 2026:

- Release-Status: Pitchbereit
- Score: 100/100
- Supabase: aktiv
- OpenAI: aktiv
- Crawl: 96 Quellen geprueft
- Briefing: 2 Entscheidungen
- Quellenlinks: 11/11 sichtbare Belege mit Direktlink
- Radar: 3 neue Personenartikel, 2 Archivartikel
- Referentenmodus: 100 Prozent

## Was noch bewusst nicht gebaut ist

- Kein vollstaendiges Multi-Account-System
- Keine native Push-Subscription auf Smartphone
- Keine Kalenderintegration
- Keine Rollenverwaltung fuer Buero, Referent, Presse usw.

Diese Punkte sind fuer den Pilot nicht zwingend. Sie werden wichtig, sobald mehrere Abgeordnete dauerhaft zahlen und eigene Accounts bekommen.

## Feedback-Fragen fuer den Pilotmandanten nach 7 bis 14 Tagen

1. Hast du Helmut morgens wirklich geoeffnet?
2. Was war einmal konkret nuetzlich?
3. Was war ueberfluessig?
4. Welche Empfehlung haettest du dir anders gewuenscht?
5. Waren die Quellen vertrauenswuerdig genug?
6. Haben die Formulierungen deinen Ton getroffen?
7. Wuerdest du dafuer monatlich zahlen?

