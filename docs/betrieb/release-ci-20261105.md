# Releasekandidat: Uebernahme und Pflicht-CI (05.11.2026)

Ausgang: privater Kandidat `814c8b6309895ba31da173a972d1dc408b30e875`,
Tree `58b5fd1f418f92e7c1f7177ac2424e363a85b394`.
Frisch gelesenes und in der isolierten Kopie abgeglichenes `main`:
`76b75e371c7db69d7c9381071e23443182fc3607`; vollstaendig Vorfahr des Kandidaten.
Kein Zusammenfuehrungskonflikt. Originalbranches und Arbeitsbereiche unveraendert.

## Notwendiger Deploymentschutz

Neuer Branch im Originalrepository: `release/helmut-product-20261105`.
Vor dem ersten Push enthaelt `vercel.json` genau fuer diesen Branch
`git.deploymentEnabled["release/helmut-product-20261105"] = false`.
Alle bisherigen Regeln, Runtime, Designs, historischen Belege und CI bleiben erhalten.

Live am 05.11.2026 gelesen: einziges verbundenes Vercel-Projekt fuer
`ernisch/helmut-pilot` ist `helmut-pilot`, Team `nohut`;
`rootDirectory=null`, Git-Verbindung aktiv, Productionbranch `main`.
Die Rootkonfiguration ist damit massgeblich. Die
[Vercel-Dokumentation](https://vercel.com/docs/project-configuration/git-configuration)
bestaetigt, dass eine exakte Branchregel `false` automatische Git-Deployments
verhindert. Die alten Regeln allein deckten den neuen Branch nicht ab.
Kein Vercel-Projekt, Secret, Productionbranch oder laufendes Deployment wird geaendert.
Ein spaeterer main-Merge bleibt deploymentwirksam und benoetigt eigene Freigabe.

## Pruefvertrag

Vorhandene Belege aus [der lokalen Produktintegration](release-prep-20261105.md)
werden wiederverwendet: vier Gruppen, 202 echte lokale HTTP-Antworten;
22 archivierte SHA256-Belege und 13 kritische Runtime-Dateien erneut rein lesend
verifiziert. Zwei unabhaengige Lesereviews bestaetigen Integritaet und CI-Ausloeser.
Keine lokale Testwiederholung und kein neuer Mock100-/Mock500-Vollversuch.

Die bestehende `.github/workflows/ci.yml` prueft bei der PR den exakten
`pull_request.head.sha` in beiden Pflichtjobs:

- `Syntax + Offline-Suiten`
- `Browser-/Mobile-Smoke (Chromium)`

Der vorhandene fail-closed Pruefplan verlangt fuer diesen Runtime-/Konfigurationsdiff
Standard-, isolierte Datenbank- und Browserpruefungen. Die darin vorhandene kleine
Drei-Profil-Anschlussprobe ist kein erneuter Mock100. Der volle Mock100-Job bleibt
an seinen ausdruecklichen historischen `workflow_dispatch` gebunden.
Die zusaetzlichen PR-Pfadfilter einschliesslich DeepSeek treffen diesen Diff nicht.
Die beiden Pflichtjobs enthalten keine bezahlten Modellaufrufe oder Deployments.

Die Uebernahme ist als [PR #1053](https://github.com/ernisch/helmut-pilot/pull/1053)
offen. Der erste [CI-Lauf42080697282](https://github.com/ernisch/helmut-pilot/actions/runs/42080697282)
auf `d4247661e67d53549bdd1367748c559d4d01e324` brach im Browsercheck ab:
Der Test suchte das alte Lage-Karussell statt der vorhandenen Liste/Detailansicht.
Nur die betroffenen Testselektoren und der bereits geaenderte finale
Querformat-Hinweis werden angepasst. Fakten-, Quellen-, Bereichs- und
Eingabeschutzbehauptungen bleiben unveraendert; kein Produkt-/Designfix erforderlich.

Gezielte lokale Nachpruefung des bestehenden Browserjobs: beide Lagepfade auf
Desktop/Mobil bestanden; der erste lokale Lauf ergab71 PASS/3 FAIL. Davon war
ein Fehler die hier korrigierte alte Querformat-Texterwartung. Zwei weitere
Textabweichungen stammen von `navigator.onLine=false` im ausschliesslichen
Loopback-Netzraum: die App zeigt dort korrekt ihren Offlinezustand statt des
Online-503-Texts. Das wurde separat am echten Browser belegt; die 503-Assertion
wird nicht aufgeweicht. Keine Fachabfragen mit unbekannter Identitaet und
Erholung nach dem Fehler bestanden in beiden Viewports. Prosa19/19 bestanden.
Lokal: vorhandener System-Chromium/Playwright1.62.1, saubere Umgebung,
keine externen Routen, unveraendertes `scripts/lokal.js`, Teststore bereinigt.
Die endgueltige Browserabnahme erfolgt mit dem bestehenden gepinnten CI-Browser.

Verbindlicher Abschlussnachweis sind der exakte PR-Kopf und seine
beiden GitHub-Checkruns; die fruehere main-CI ersetzt sie nicht. Endergebnisse werden
in der PR und im Abschlussbericht belegt, ohne gruene CI durch einen reinen
nachtraeglichen Statuscommit erneut ungueltig zu machen.

## Grenze und Rueckweg

Kein main-Merge, Deployment, Productionzugriff, Profil-/Datenbankeingriff oder
neues Testsystem. Bei fehlendem Deploymentschutz vor jedem Push stoppen.
Bei CI-Fehlern nur den tatsaechlichen Fehler gezielt beheben.
Solange nicht gemergt, bleibt der Kandidat eine separat verwerfbare PR;
Production wurde durch diese Uebernahme nicht veraendert.

Nach bestandener Pflicht-CI bleibt genau die konkrete Mergeentscheidung offen.
Vor einem spaeteren Livegang muessen Kundenkreis, Datenschutz-/Vertragsfreigaben,
Kosten-/Kommunikationskonfiguration, Rueckweg und Nachkontrolle bestaetigt sein.
Diese lokale Vorbereitung behauptet keine neue Production- oder Betriebsfreigabe.
