# Kundenformular: Nachreview der Bestätigungen

**Beide Reviewpunkte korrigiert. 25 Prüfgruppen bestanden, darunter 21 echte HTTP-Requests.** Der vorherige 21er-JSON-Beleg bleibt unverändert; der aktuelle Nachweis steht getrennt im [Nachreview-JSON](kundenformular-nachreview-pruefbeleg-20261104.json) und [Log](kundenformular-nachreview-20261104.log).

- Eine gültig aussehende POST-ID reicht nicht mehr für ein bestätigtes Teilkonto. Vor `created` werden die vollständige erwartete Identität, Rolle, Status, `active:false`, gültige Referenz und das Fehlen unerwarteter Zugangs-/Passwortdaten geprüft. Eine schon in der frischen Vorprüfung bekannte Nutzer-ID wird ebenfalls verworfen. Unpassende 2xx-Antworten bleiben unklar, ohne Behauptung eines angelegten oder aktuell gesperrten Teilkontos.
- Nach früher korrekt bestätigtem POST nennen PATCH-Fehler weiterhin die bekannte Konto-ID. Die Meldung bleibt zum **aktuellen Konto-/Notizstand neutral**; sie behauptet keinen weiterhin gesperrten Zustand.
- Nach erfolgreichen Schreibantworten muss die frische Kundenantwort ausdrücklich `raw.active === false` bestätigen. Bei aktivem oder fehlendem Status bleibt das Formular gesperrt, die Konto-ID wird zur Prüfung genannt und es gibt keinen gesperrten Erfolgstoast.
- Die Erfolgsmeldung nennt die tatsächlich zurückgegebene Profilkennung ausdrücklich zur Prüfung. Eine automatisch vergebene Kennung bedeutet keine fehlende Zuordnung: Der vorhandene Server kann einen Namensslug vergeben, der bereits ein freies gespeichertes Profil benennt. Kein Kernfix wurde vorgenommen. Die Meldung behauptet lediglich korrekt, dass kein **neues** Profil angelegt wurde.

Neue gezielte Regressionen prüfen falsche POST-2xx mit aktivem Konto, fremder Identität und bekannter ID; keine beliebige Teilkonto-ID im Originalformular; falsche PATCH-2xx und neutrale Teilkontomeldung; sowie frische Kundenantworten mit `active:true` oder fehlendem Aktivstatus. Die vorhandenen A-Prüfungen wurden wegen dieser Korrekturen auf dem aktuellen Stand erneut ausgeführt. D1/D2-Gesamtsuiten wurden nicht gestartet.

Der HTTP-Teil verwendet weiterhin ausschließlich einen frischen lokalen Wegwerfklon von `feat/claude-backend-isolated`, Commit `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`, eigenen leeren Dateispeicher, echte Auth/CSRF und synthetische `example.invalid`-Konten. Nachweis: **0 Mailaufrufe, 0 Passworttokens, 0 Profil-Schreibversuche, 0 gespeicherte Profile, 0 Fetchversuche**. Testklon entfernt. Alle 25 Originaldateien bytegleich zum Manifest; geschützte Backend-/Kunden-UI-Dateien unverändert.

Nur die drei A-Quellen geändert; keine anderen Quellen und keine historischen Belege geändert:

| Datei | SHA256 |
|---|---|
| `verwaltung/original-actions.mjs` | `eb77b7218513d6d7b324e36b211f502b92043520eeaf71bbbe03888fa7c905a8` |
| `verwaltung/original-customer-form.mjs` | `8320ee4fd35b6dd19e3716c5ab92760e48533fedc7c9e097121c8dc4bbb3f1c9` |
| `scripts/kundenformular-test.js` | `c3b8c9d48fb01f374bbc6358d945e548b757733963b10c0a3467b19e2520cfdc` |
| Nachreview-JSON | `bc68f92f196ea985f8317b58479ab54ef435807ecabeff60d29d1f4978d4cfaf` |
| Nachreview-Log | `918b1c2513b3fda69c7e90d8533653bd7bf21df05996284849dee058180b52bb` |

Historischer 21er-JSON unverändert: `8c8ef418960d8bf1244ca00c930ef8afba2e05bb108219a43614398549d5ce93`. Frühere Quellenhashes im ersten Anschlussbericht beschreiben den damaligen Stand; die Tabelle oben ist der aktuelle Nachreviewstand.

Ausführung mit unveränderter expliziter kleiner Environment-Allowlist über `node scripts/lokal.js scripts/kundenformular-test.js`. Das Skript schreibt ab jetzt ausschließlich den neuen Nachreview-JSON. Keine Credentials, externen Zugriffe, Installation, Kosten, Production-Aktionen oder Änderungen am Backendkern.

Root integriert diese Dateien und prüft Paket-/Browserkomposition sowie seine geänderten Optionen-/Einleitungstexte. Der serverseitige automatische Namensslug und die nicht atomaren zwei Schreibschritte bleiben die bereits dokumentierten Vertragsgrenzen.
