# Mobiler App-Start bei unvollstaendiger Uebertragung (11.11.2026)

## Nachmeldung vom Nutzer: Handyfehler weiter offen (19:18 UTC)

Der Nutzer meldet nach PR1147 weiterhin einen Haenger. Sein Screenshot zeigt
den nativen Android-Start mit H-Symbol und Appnamen, keine geladene
Helmut-Ladeansicht. Auf Nachfrage bleibt auch der direkte Aufruf der
Hauptadresse in Brave laut Nutzer schwarz. Damit ist der konkrete
Handyfehler nicht behoben; PR1147 behebt nur die zuvor reproduzierte
unvollstaendige Netzuebertragung. Eine defekte Installation oder ein Cachefehler
sind weiterhin Hypothesen, keine bestaetigten Ursachen.

Frische lesende Gegenprobe mit der ausgelieferten Version `22bad44c`:
oeffentliche Startseite und Manifest HTTP200 ohne Weiterleitung, Manifest
weiterhin `start_url:/`, `scope:/`, `display:standalone`. Mobiler Chromium
oeffnet die echte Productionseite bis zur sichtbaren Anmeldung; Splash
beendet, CSS/Client und anonyme Sitzungspruefung HTTP200, keine unbehandelten
JavaScriptfehler. Keine Anmeldung, Fachabfrage, Datenmutation oder Modellaufrufe.
Diese Cloudprobe reproduziert den konkreten Handyfehler nicht.

Die Runtime-Logabfrage fuer19:12:44–19:22:44UTC liefert keine Error-/Fatal-
Eintraege; auch die Pfadzaehlung ist leer. Daraus laesst sich weder ein
fehlerfreier Nutzerstart noch das Eintreffen seines Abrufs ableiten.
ADB, Android-Emulator und Zugriff auf den realen Brave-Prozess sind hier
nicht verfuegbar. Als naechste notwendige Geraeteprobe ist der direkte Aufruf
in einem neuen privaten Brave-Tab angefragt; Antwort noch offen. Dieser
Vergleich aendert oder loescht keine gespeicherten Daten. Keine weitere
Runtimeaenderung ohne engeren Fehlerbeleg.

## Befund und Korrektur

Die oeffentlichen Production-Dateien `client.js` und `sw.js` waren beim
Ausgangsbefund bytegleich zum aktuellen `main` auf `626c4f29`; die Runtime
lieferte die letzte wirksame Version `3d19f426`. Die anonyme Sitzungspruefung
antwortete HTTP200 mit `authenticated:false`. Der normale lokale
Browser-/Mobile-Smoke bestand mit 114 PASS / 0 FAIL.

Ein echter mobiler Chromium mit aktivem Service Worker reproduzierte dagegen
einen Start-Haenger, wenn der Server HTTP-Header und einen ersten HTML-Teil
sendet, danach aber keine weiteren Bytes. Nach 11 Sekunden lief der
Browser-Aufruf ins Testlimit, eine bedienbare Seite war noch nicht vorhanden.
Die bisherige 8-Sekunden-Grenze hatte schon beim Empfang der Header geendet.
Der Seiten-Watchdog kann vor dem Eintreffen der Seite nicht helfen.

Der Worker wartet nun innerhalb derselben bestehenden Frist auf den
vollstaendigen Antwortinhalt. Dazu liest er eine Antwortkopie; URL, Status,
Header und der originale lesbare Body bleiben erhalten. Haenger fuehren zur
bestehenden Wiederholungsansicht, unvollstaendige Assets gelangen nicht in den
Cache. Ein bereits vollstaendig gecachtes Asset bleibt sofort verfuegbar.

## Nachweise

- [PR1147](https://github.com/ernisch/helmut-pilot/pull/1147), Kopf
  `cc3da28a6e983876b8570a9ac46d269aeb7cd007`.
- Lokal ueber `scripts/lokal.js`: 10/10 gezielte Worker-Gruppen und
  14/14 Schnellkern-Suiten. Drei Kernschutztests konnten zuerst in der Sandbox
  keine lokalen Ports oeffnen; ausserhalb der Sandbox bestanden alle14.
- Echter Worker im mobilen Chromium: Haenger vor den Headern und im
  HTML-Inhalt enden nach der bestehenden8s-Frist mit der Wiederholungsansicht;
  der anschliessende Start per Knopfdruck funktioniert in beiden Faellen.
- Zusaetzliche echte App-Integration: zweimal mobiler Neustart mit aktivem
  Worker, originale CSS-/Clientdateien durch den Worker, Login sichtbar,
  Splash beendet, keine unbehandelten JavaScriptfehler. Nur fiktive abgemeldete
  Sitzung; kein Zugriff auf private Productioninhalte.
- [Pflicht-CI43075135625](https://github.com/ernisch/helmut-pilot/actions/runs/43075135625):
  beide Pflichtchecks SUCCESS auf dem exakten PR-Kopf; 14/14 Schnellkern- und
  12/12 UI-Bereichssuiten. Der Browsercheck umfasst beide Worker-Haengerfaelle.
  Die grosse Offline-/Datenbankpruefung wurde gemaess UI-Pruefplan bewusst
  nicht ausgefuehrt.

## Wirkung, Grenzen und Rueckweg

Nur Service Worker und bestehender Regressionstest geaendert. Vollstaendige
oeffentliche Startdateien werden vor der Weitergabe gelesen; deren Streaming
entfaellt und fuer die Startdateien entsteht zusaetzlicher Speicherbedarf.
Keine Daten-, Auth-, Budget-, Cron- oder Konfigurationsaenderung und keine
bezahlten Anbieteraufrufe. Die genaue Ursache und der native Start am
konkreten Nutzergeraet sind noch nicht bestaetigt. Die reproduzierte
Netzfehlerklasse ist browsergeprueft.

Rueckweg: gezielter Revert des Fixes mit regulaerem Deployment. Historische
Android-/Brave-Befunde bleiben unveraendert. Rollout nach gruenem CI: Merge
`e574a4cc3b0b6e17d561958d314dab9aa75bc556`, Vercel
`dpl_6S4aSNt4bQMeQtQbLPL1bTJAtQfn` READY, Production, Region Frankfurt.
Lesende Nachkontrolle11.11.,18:13:58UTC: Hauptadresse HTTP200,
HTML-Assetversion `e574a4cc`, anonyme Sitzungspruefung HTTP200, ausgelieferter
Worker bytegleich zum geprueften Stand (SHA256
`9af5ca27b9b0a6e4d61d3d057c392ee3203e69dfd33757472db86f6445a8aa28`).
Dies bestaetigt Auslieferung und oeffentliche Erreichbarkeit; keine
authentifizierte Production-Bedienabnahme oder native Geraeteabnahme.
