# Einmaliger lokaler Ressourcenlauf 19.10.2026

## Endstatus

**Endgültiger Speicherfehlschlag, kein Retry.** Kandidat `a2521b52a505`, Auftrag
`synthetik500-resources19-a2521b52a505`, Laufcode
`f5e2cd61464d439b12a556895ab66e1371a4097c`, Branch
`codex/auth-graph-read-20261018`. Der Laufcode und die nachträglichen Dokumente
sind lokal; aktuelle Remote-CI oder ein Deployment sind damit nicht belegt.

Das neue ausdrückliche Betreiber-GO wurde genau einmal genutzt. Unmittelbar
vorher alle 32 Voraussetzungen mit echter GO-Bindung in 16,714147221s bestanden.
Alle alten verbrauchten Marker blieben erhalten. Start 06:21:43,540451 UTC,
Abschluss nach sicherem Stopp 07:47:05,579654 UTC. Nur lokale Modell-Mocks,
500 synthetische Profile im isolierten Auftrag aktiv; keine Production-Aktion.

## Tatsächliche Messwerte

| Messgröße | Ergebnis | Grenze/Einordnung |
|---|---:|---|
| Gemeinsamer Kernel-Speicherpeak | 2.050.535.424 B | **über** 2.048.000.000 B |
| Überschreitung | 2.535.424 B | Kein ausreichender Reservewert für 500 ableitbar |
| Beobachtete erfolgreiche Profilantworten | 262 HTTP200, Indizes 0–261 | Keine vollständige 500er-Abnahme |
| Langsamster beobachteter HTTP-Aufruf | 57,003808488 s, Index 0 | Unter Unit60; Grenzfall 499 nicht erreicht |
| Vollständige Offline-Inhaltsprüfung | 8,649627115 s | Offline90 bestanden |
| Installation mit Original-U | 3,791581176 s | Originalbytes und Journal erhalten |
| Gemessene Vorbereitung / Assembly | 17,245260001 / 19,885421881 s | Keine Profiler |
| Gesamte gemessene Laufzeit bis Cleanup | 5.119,573807002 s | Kein vollständiger 500er-Abschluss |
| Gemeinsame CPU-Zeit | 5.705,311129 s | Alle eigenen Gruppen, kein Cloud-Preis daraus abgeleitet |
| Datenbank-Tempdateien kumuliert | 16.291.552.075 B / 4.547 Dateien | Nicht gleichzeitiger Speicher- oder Plattenpeak |
| WAL konservative Gesamtobergrenze | 251.658.240 B | Einschließlich Initdb/LSN-Padding und Shutdown |
| Datenbankantworten am App-Interface | 32.629.973.713 B empfangen | Lokaler Verkehr, kein bestätigtes Provider-Abrechnungsmaß |
| Gateway-HTTP-Anfragen | 43.264 | Vorhandene Teilzähler; vollständige Receiptabnahme fehlt |
| Graph-RPC | 9.434 Antworten / 32.186.935.854 Bodybytes | Gemessener Rückgabe-Hotspot |
| Log-Payloadbytes einschließlich Messbelegen | 73.297.222 B | Messbeobachter erzeugte 72.709.187 Antwortbytes |

Separat gemessene App-/DB-Peaks: 1.255.182.336 / 1.193.189.376 B. Diese
unabhängigen Peaks dürfen nicht als gleichzeitiger Gesamtpeak addiert werden.
Die eigenen Speichergruppen umfassen Root, Installation, U, Worker, Helfer,
Datenbank, Dateicaches und das letzte Prozessende. Alle abschließenden
`populated`-Werte sind null; keine OOM-Ereignisse. Der exakte Anteil einzelner
Speicherarten am gemeinsamen Peak wurde nicht aufgezeichnet.

## Sicherer Stopp und Abnahmegrenzen

Bei tatsächlicher Überschreitung wurde ausschließlich der exakt verifizierte
Sequence-Direktchild per `pidfd`/SIGTERM beendet. PID1 führte den vorhandenen
Fehlerpfad aus: Sequence −15, App 1, eigene Datenbank 0, Helfer ordentlich
beendet. Container, Daten, Belege und GO-Claim bleiben erhalten. Keine
automatische Wiederholung. Die unabhängige Codex-Prüfung verifizierte 302
Dateipins, darunter alle 202 aktuellen Quellen, neun Originale und 15 alte
Freigabemarker. Kein zusätzlicher DeepSeek-/Provideraufruf für diese Abnahme.

Die HTTP-Phasenereignisse werden vor den anschließenden Body-/Counterasserts
geschrieben. **262 HTTP200 sind deshalb keine Abnahme von 262 FinalACKs,
786 Ergebnispositionen oder 4.192 Sicherheitskontrollen.** Die finalen
RUNTIME_RESULT/SEQUENCE_RESULT fehlen nach dem Stopp. Alle 1.500 Positionen,
8.000 Kontrollen sowie vollständige Unit60/Auth30 bleiben unbewiesen.
Fehlende/leere/doppelte/fachlich unbrauchbare/technisch fehlerhafte Positionen
können nicht vollständig getrennt gezählt werden. Zwei HTTP-Endbelege fehlen;
die strikte Messabnahme weist das korrekt als Fehler aus. Beobachtete lokale
Mockaufrufe: 524; keine vollständige Runtime-Provider-Endabnahme.

Originalquellen und neun Originaldateien nach Abschluss unverändert;
Quellschreibzugriffe null. Fehlende Authority und ungültige Signatur wurden
in den vorhandenen Negativstufen vor Dispatch zurückgewiesen. Diese
Teilnachweise ersetzen die fehlende vollständige Sicherheitsabnahme nicht.

## Gesicherte Übergabe

Nur fünf notwendige SAFE-Berichte und das Manifest, insgesamt 109.774 B,
im bestehenden privaten Driveordner. Alle sechs Dateien vollständig
zurückgeladen und bytegleich/SHA256-verifiziert. Metadaten jeweils nur
Owner-Zugriff; keine Freigaberechte geändert. Keine vertraulichen Originale,
Schlüssel, Tokens, Rohlogs oder Betreiber-GO-Dateien übertragen.

- [Ergebnis und tatsächliche Grenzen](https://drive.google.com/file/d/1MRvavdSPi--gwNb8-StDSMtM-Mx58Svi/view)
- [Vollständige gemeinsame Kernel-/Ressourcenmessung](https://drive.google.com/file/d/1rhbSwMSA7oAMDeo1jUavHWA6C5U7jwXq/view)
- [Originalintegrität und Controllerabschluss](https://drive.google.com/file/d/1V93Zf1Qmdl25jI3kOpyEgeBF_V5DIbBN/view)
- [Sicherer kritischer Stopp](https://drive.google.com/file/d/13pIhnXtnjbu9b8kqYGvxx2zny1JpsnnO/view)
- [Unabhängige Abnahme](https://drive.google.com/file/d/1wfaR-D8tjCtFT1sBT6c00LF0myUi89LN/view)
- [SHA256-Manifest aller Berichte](https://drive.google.com/file/d/18bsZSWfbLw6BZXq_ckGp7X37uPCkd3bf/view)

Manifest-SHA256:
`7d520da327dd77f786274768257987baa24561e02871c71ce71ea7001b3f2922`.
Lokale Primärbelege: `wave42-day19-resource-binding` und
`wave20-resource-integration/attempt-a2521b52a505` im bestehenden geschützten
Evidenzbereich `/workspace/helmut-parallel-20261015`.

## Genau nächster Schritt

Kein weiterer vollständiger Lauf ist jetzt startbereit oder freigegeben.
Gezielt die vorhandene Graph-RPC-Materialisierung und wachsende Rückgabemenge
anhand der aktuellen Messung eingrenzen. Der kausale SQL-/Temp-/WAL-Anteil am
Speicherpeak ist noch unbewiesen. Keine allgemeine CPU-/SHA-/WAL-/Cacheanalyse
oder neue Messarchitektur. Jede Korrektur muss frische Berechtigungs-, Profil-,
Quellen-, Kosten-, Frist- und Notstoppprüfungen sowie atomare Bindungen
erhalten und vor einem neuen kandidatgebundenen GO klein abgenommen werden.

Infrastrukturkosten für 500 bleiben ohne vollständige Verbrauchsobergrenzen
offen; Teilmengen werden nicht hochgerechnet. Alle gelieferten Ownerkosten
und Spend-Cap-Daten gelten weiter und werden nicht erneut angefordert.
Production-Integration mit drei Funktionen/zwei Triggern, tatsächliche
Runtime-/Worker-/Bundle-/Schlüsselbelege und vollständige Wächterabdeckung
brauchen weiterhin den getrennten Integrationsplan und das konkrete GO.
Danach bleibt ein zusätzliches finales GO für 500 aktive Productionprofile
und bezahlte Modellaufrufe erforderlich. Aktuell keine Productionaktion.
