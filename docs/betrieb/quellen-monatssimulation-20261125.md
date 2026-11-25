# Quellen und Morgenbriefing über 30 simulierte Tage

Am 25.11.2026 lokal geprüft. Die Testuhr durchlief den 24.11. bis 23.12.2026 mit einem synthetischen Mandat, PostgreSQL 17.6 und PostgREST 12.2.3. Der Prüfstand arbeitete ohne externe Quellenabrufe und ohne bezahlte Modellaufrufe. Für die simulierte Verarbeitung galten 1 USD Modellbudget pro UTC-Tag, 30 USD insgesamt und höchstens 16 Originalreservierungen pro UTC-Tag.

## Ergebnis

| Prüfung | Beobachtung |
| --- | --- |
| Morgenbriefing um 07:30 Uhr Berlin | 30 von 30 im Produktleser abrufbar, alle mit DIP-Beleg |
| Vollständiges Morgenbriefing | 26 von 30 |
| Teilfassung nach simuliertem Bundestag-HTTP-503 | 4 von 30 |
| Wochenwechsel und Archiv | 5 erledigte Archivaufträge in 5 Fenstern |
| Rückstand und Wiederaufnahme | 96 ältere Aufträge erledigt, 4 ausgefallene Quellenvorgänge nachgeholt |
| Einzelprüfungen im Abschlussbericht | 68 geprüft, Szenario bestanden |

### Die vier Teilfassungen

| Simulierter Tag | Bis zur Morgenausgabe bestätigte fällige Quellen |
| --- | --- |
| 27.11. | 43 von 44 |
| 28.11. | 49 von 50 |
| 10.12. | 48 von 49 |
| 11.12. | 44 von 45 |

Am 29.11. und 12.12. waren die simulierten Morgenausgaben trotz jeweils 48 offenen Altaufträgen, davon 24 fällig, wieder vollständig.

## Testverlauf und Belege

- Der erste Versuch stoppte nach dem vollständig geprüften 09.12. an einer Abweichung der simulierten Datenbankuhr beim Speichern des Tagesstands. Der Fortsetzungslauf startete Worker und Datenbank neu, lud den bestätigten Auftragsstand des 09.12. und setzte die Prüfung am 10.12. fort.
- Der lokale Abschlussbericht trägt den Teststand `7deefaa0b442f17e2923477e3a8e6b59a80f6263`, die Lauf-ID `c8e856f7-7e6a-40da-897d-b8c3f1901cee` und die SHA-256-Prüfsumme `3ce7c337c635db826a651c160cda0eef13ef382496cf930537d2b97bec2bea77`. Die Eingaben des Worker-Images stimmen laut Git-Diff mit dem freigegebenen Worker `5c28a53c479232a627fbe58868873cd95d071559` überein.
- Separat auf GitHub ausgeführt wurde der Drei-Tage-Test mit 39/39, 51/52 und 44/44 bestätigten Abrufen. Der im simulierten Störungsfenster ausgefallene Plenarabruf wurde später am selben Tag nachgeholt. [Drei-Tage-Test](https://github.com/ernisch/helmut-pilot/actions/runs/45596100664)

Der Monatsbericht belegt die Verarbeitung der simulierten Ausfälle und den Wechsel zur Teilfassung. Reale Antwortzeiten und Verfügbarkeit der Quellen, tatsächliche Modellkosten und der vollständige reguläre Morgen auf Hetzner sind durch die Live-Laufbelege zu prüfen.
