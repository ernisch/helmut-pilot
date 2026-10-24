# Unit60: erster Clientfehler bleibt unaufgeklaert; Diagnose gezielt ergaenzt

Stand25.10.2026, Europe/Istanbul. Basis PR940/0f643b50084c3b3b11fb0279ab0acef6c09bdcaa.
Kein neuer nativer Lauf. Der vorhandene Fall3ac693ac9265ff5635aabb75d8d1487e
bleibt FAIL und erhalten; sein GO ist verbraucht.

## Belegter Befund

Der gebundene Abschlussbericht hat SHA256
`8fe47fbbfead404a39f44273e5962a4e624c5c3e54354bc14673ca8ffc34b64e`.
Adapter65,166703510s, Phasen-Fehlercapture65,148351325s, Entry66,289254394s.
Diese verschachtelten Zeiten nicht addieren. Auth-Phasendauer5,794941129s
ist keine formale erfolgreiche Auth30-Abnahme.

Neun Kontrollen bis `send-R` sind belegt; dessen Ende liegt bei43,465360877s.
Die folgende Send-CAS endet bei44,683128s. Ein danach beginnender unveraenderter
19,9s-Transport kann schon rechnerisch nicht mehr innerhalb60s abschliessen:
fruehestens64,583128s, noch vor Abrechnung und den sieben fehlenden Kontrollen.
Dies ist eine bedingte Zeituntergrenze, kein nachtraeglicher Beleg der tatsaechlichen
zweiten Wartezeit oder eines erfolgreichen R-Abschlusses.

Die Usage-Operation7 beginnt nach etwa64,73s und endet nach11,775987ms ohne
`readOwnAwait`-/`writeOwnAwait`-Marker. Damit ist der Fehler vor dem markierten
Original-Lese-/Schreibabschnitt eingegrenzt; der konkrete geworfene Grund fehlt.
Es folgen weitere kurze State-Operationen und der Fehlerabschluss.
Die Trace-Endmarkierungen bedeuten jeweils nur settled, keinen ACK oder Erfolg.

Der terminale Clientfehler lautet `local-unit-diagnostic-stopped-or-unknown`,
sein Cause-Grund ist null. `logLlmUsage` kann einen urspruenglichen Writerfehler
in null umwandeln; weitere Kosten-, Lage- und Cleanupfehler koennen folgen.
Der spaetere Hostfehler `native-execution-host-actual-client-success-close`
und die anschliessende Worker-Unterbrechung identifizieren diese Erstursache nicht.
Fristverletzung und primaere Exception deshalb getrennt ausweisen.

## Vergleich mit76af am gleichen Messpunkt

| Nicht ueberlappender Abschnitt | 76af Sekunden | 3ac6 Sekunden |
| --- | ---: | ---: |
| Beginn bis Authbestaetigung | 6,202044293 | 5,794941129 |
| Danach bis send-D fertig | 6,208182433 | 6,086118051 |
| Danach bis D-accounted beginnt | 24,358921417 | 24,379544340 |
| Danach bis send-R fertig | 7,389460460 | 7,204757357 |
| Danach bis Fehlercapture | 21,658237154 | 21,682990448 |
| Summe bis Fehlercapture | 65,816845757 | 65,148351325 |

Adapter separat65,839926211→65,166703510s:0,673222701s kuerzer.
Beide9/16, keine FinalACK-/19er-Abnahme. Neun aktuelle Kontrollspannen zusammen
6,577771978s und die aeusseren Own-Write-Spannen8,575242490s liegen innerhalb
der Tabelle. Deren innere Read-/HTTP-/Write-Spannen nicht erneut addieren.
Keine dieser Teilzeiten allein beweist einen bestimmten vermeidbaren Engpass.

## Kleine Diagnosekorrektur

Nur der lokale Scope und Originalwriter beobachten den ersten nativen Fehler an
Writer-/Scope-await-Grenzen, bevor Catch oder Cleanup ihn verdecken koennen.
Der bestehende private exklusive Phasenbeleg erhaelt eine begrenzte Zusatzstruktur:
Beobachtungspunkt, Zeitpunkt, Kontrollanzahl, exakt erlaubte Gruende/Codes,
hoechstens vier Cause-Objekte und je drei erlaubte Quell-Basename/Zeilenangaben.
Accessor-Stacks werden nicht ausgefuehrt. Unbekannte eigene Data-Messages bis4096
UTF16-Einheiten erhalten nur einen SHA256 ueber UTF8; kein Rohtext oder privater
Pfad wird gespeichert. Ein Fingerprint kann spaeter mit Quellliteralen verglichen
werden; er beweist allein keine Ursache.

Zusatzstruktur maximal2048ASCII-Bytes; optionale Details am Ende werden zuerst
gekuerzt. Der bestehende8192-Byte-Phasenbelegdeckel bleibt unveraendert.
Alle urspruenglichen Fehler werden identisch weitergeworfen. Kein Retry, neue
Autoritaet, andere CAS-/ACK-Regel, gelockerte Frist oder geaenderte Wartezeit.
Die Beobachtung ist keine Garantie, jede ausserhalb dieser Grenzen auftretende
erste Exception zu erfassen, und kein erfolgreicher Laufnachweis.

Gezielt synthetisch:10Timing-/Forensikgruppen,43Originalwriterfaelle,
54Entry-VM-Negative bestanden. Syntax und Diffpruefung bestanden.
Ein erster VM-Versuch mit falscher Testannahme ueber Node24-Stack-Data war FAIL;
Testannahme korrigiert, alte Ausgabe erhalten. Kein echter Lauf daraus abgeleitet.

## Weiterhin offen

Kein Zeitgewinn durch diese Diagnosekorrektur behauptet. Drei Ergebnispositionen,
16Kontrollen, beide Abschlussruecklesungen, FinalACK und19er-Ende weiter unbewiesen.
Der fruehere Peak1373904896B bleibt ein numerischer Befund eines fehlgeschlagenen
Laufs, kein500MB- oder500er-Nachweis. Originalschutz439/439 aus dessen Endbeleg
wird uebernommen, nicht als frisch erneut ausgefuehrte Originalpruefung bezeichnet.

Der neue Diagnosestand ist nicht fuer echte Ausfuehrung qualifiziert. Vor einem
weiteren echten Versuch sind exakte neue Quellen-/Runtimebindungen, unabhaengige
Vorbereitung, frische10GiB-Plattenadmission, laufend8GiB Reserve und ein neues
ausdrueckliches GO erforderlich. Keine Loeschung oder Laufwiederholung in diesem
Auftrag. Originale, Fail-Arbeitskopien und alte Belege bleiben erhalten.
