# Radio-Original: vorbereitete Vercel-Einzelprobe

**08.11.2026 · nur vorbereitet.** Kein Originalabruf, Modellaufruf, Deployment,
Merge oder Produktionswrite in diesem Vorbereitungsschritt. Codebasis ist der
beobachtete Production-Commit `4f8ee6722237c84a36fd9811acb2b9d46f7a72cb`,
Deployment `dpl_96evL9uGmW2oN3JULGL9Y1QL1yYe` im bestehenden Projekt
`nohut/helmut-pilot`. Die neue Codebindung wird aus dem finalen Git-Kopf in
`/workspace/helmut-radio-freigabeauftrag-20261108/auftrag.json` festgeschrieben.
Dieser Kopf ist **noch nicht bereitgestellt**. Pflichtchecks/Review des neuen
Kopfes sind keine Voraussetzung fuer das Schreiben dieser Vorlage, aber vor
einer Bereitstellungsfreigabe offenzulegen und abzuarbeiten.

## Belegter Anlass und geeigneter Einstieg

Der fehlgeschlagene Abruf vom08.11.,17:42UTC lief in **Codex**, Node mit
Umgebungsproxy-Unterstuetzung; der strenge Artikelabruf setzte `agent:false`
und verband sich **direkt** zur geprueften IPv4 `176.28.34.226:443`:
`ECONNREFUSED`, keine HTTP-Antwort. Das ist kein Vercel-Fehlernachweis.
Der damalige Inhaltslueckenbeleg und Anbieterzaehler belegen Codex-Wirkungen,
nicht den Ausfuehrungsort Vercel. Sie werden weder geloescht noch zurueckgesetzt.

Die vorhandenen Crawl-/Debug-/Workerwege starten Verarbeitung, speichern
Fachinhalte oder bearbeiten weitere Jobs. Sie sind ungeeignet. Der bestehende
POST-Einstieg `/api/cron/testnachweis-status?modus=provider-einzelprobe` ist
bereits vor Account-/Profilvorlauf isoliert. Sein bisheriger Controller ist
eine abgelaufene Modellprobe und wird **nicht** aufgerufen. Die minimale
Erweiterung delegiert genau die feste neue Nonce an den Radio-Controller,
bevor Modellkonfiguration, Kostenbuch oder Modellfunktion betreten werden.
Keine neue Route, kein neuer Querymodus und kein allgemeiner URL-Parameter.
Andere Nonces behalten den alten, abgelaufenen Autorisierungsvertrag.

## Exakter Auftrag

| Bindung | Wert |
|---|---|
| Originaladresse | `https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen` |
| Dokument | `rd-a14add4e7d7ff6e6e9a1c13fc553b024f030736bc664405e12bdf8a2bcbcf923` |
| Titel | Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover |
| Publikation im Bestand | `2026-11-06T11:11:24+00:00` |
| Bekannter Originalstand | `dateCreated=2026-11-06T12:11:24+01:00` |
| Globale Aufgabenkennung | `9bb8e647-b0cf-4774-9828-8f236eeeb59c` |
| Autorisierung endet | `2026-11-10T00:00:00.000Z`; keine automatische Verlaengerung |
| Umfang | hoechstens ein HTTPS-GET, null Redirects, null Wiederholungen |
| Dauer | 20.000ms Aufruffenster, einschliesslich Einmalmarke/Anbieterpruefung und DNS/TLS/Antwort; danach Abbruch |
| Antwortgrenze | maximal 1.048.576 akzeptierte Originalbytes; sofortiger Streamabbruch bei Ueberschreitung |

Der Betreiberaufruf kommt aus Codex ueber den vorhandenen Umgebungsproxy und
geprueftes HTTPS zur **unveraenderlichen Deploymentadresse**. Der Originalabruf
selbst laeuft anschliessend in der **Vercel Node Function `api/index.js`**,
ueber `crawler.fetchUrl(..., {artikelkontext:true})` und Node `https.get` mit
direkter Verbindung zur dort ermittelten, geprueften IPv4. Ausfuehrungsregion
und Node-Version werden beobachtet, nicht aus `regions:[fra1]` abgeleitet:
der vorhandene Cron-Beleg lief tatsaechlich in `iad1`, `nodejs24.x`.

## DNS, TLS und Zugriffsschutz

Der vorhandene `artikelkontext-abrufschutz.js` bleibt bytegleich. HTTPS und
exakter Originalhost/-pfad bleiben fest; keine Credentials, IP-Literale,
internen Ziele, Ports oder Fragmente. Alle DNS-Antworten muessen oeffentliche
IPv4-Adressen sein; die erste gepruefte Adresse wird dem Socket ohne erneute
Aufloesung uebergeben. `agent:false`, IPv4, kein Pool-Reuse und kein Redirect.
TLS-Kette und Originalhostname bleiben mit Node-Standardpruefung aktiv.
Die neue Beobachtung reicht DNS-Callbackwerte unveraendert weiter und zeichnet
gepruefte IP, TLS-Peer, SNI, TLS-Protokoll und HTTP-Status auf. Sie lockert
keinen Guard. Ohne Beobachter bleibt der bisherige Lookup-Aufrufer erhalten.

Konfigurierte Proxyvariablen, `--use-env-proxy` oder abgeschaltete
TLS-Pruefung in der **Function** stoppen vor Einmalmarke/Netz. Es wird kein Proxy
hinzugeschaltet und kein unbekannter Proxyvertrag vorausgesetzt. Der Codex-
Proxyvertrag fuer Originalhostfreigabe plus IP-Bindung bleibt unbelegt.
Default-TLS und der bestehende Proxy gelten dagegen fuer den getrennten
**Operatorweg zu Vercel**; dort ist kein gepinnter Originalabruf erforderlich.

Der vorhandene gehashte, noncegebundene Operation-Bearer wird wiederverwendet;
ein neuer privater Token liegt nur lokal mit Modus0600. Kein neues Vercel-
Secret. Methode, leere Anfrage, feste Query, Commit, Deployment-ID, Host und
20s-Zeitfenster werden vor der Einmalmarke geprueft. Ohne Autorisierung keine
Laufzeitdetails. Antwort `Cache-Control:no-store`, HTML nur im privaten
Operatorbeleg. Kein App-Oeffnen kann die Nonce/Autorisierung erzeugen.

## Spaeterer Ablauf zur Freigabe

1. Finalen Commit, Diff, fachlichen/Sicherheitsreview, Pflichtchecks und
   aktuellen Production-Vergleich pruefen. Ein anderer Production-Kopf
   macht diese Bereitstellungsvorlage neu pruefpflichtig; kein stiller Rebase.
2. **Neue Production-Bereitstellung erforderlich**, weil aktuell kein
   passender Original-Aufrufer installiert ist. Nur das bestehende Projekt,
   exakt der freigegebene Commit, keine neue Infrastruktur und kein Merge.
   Eine regulaere Production-Bereitstellung kann die App-Domains umstellen;
   diese Wirkung muss die spaetere Freigabe ausdruecklich umfassen.
   Keine isolierte Preview als Beweis fuer identische Production-Konfiguration
   ausgeben. Bestehende Crondefinitionen und Flags bleiben unveraendert;
   kein Cron wird manuell ausgeloest. Keine Annahme, dass `--skip-domain`
   auch Cron-/Projektwirkungen ausschliesst.
3. Bereitstellung ausschliesslich lesend auf READY, Git-SHA, Project/Team,
   Deployment-ID und unveraenderlichen Host binden. Vorige READY-Bereitstellung
   und Aliaszuordnung fuer den Rueckweg festhalten. Die ID/Adresse der neuen
   Bereitstellung existiert jetzt noch nicht und darf nicht erfunden werden.
4. Erst nach konkretem GO `freigabe.PRIVATE.json` lokal anlegen: exakte
   `taskId`, `codeCommit`, `deploymentId`, `immutableHost`,
   `approvedAction=production-deployment-and-one-radio-original-probe`.
   Das ist eine Dokumentation der erteilten Freigabe, kein Ersatz dafuer.
5. Genau einmal `node --use-env-proxy /workspace/helmut-radio-freigabeauftrag-20261108/einzelaufruf.js --execute`.
   Der Aufrufer schreibt zuerst eine lokale `wx`-Startmarke. Er sendet nur
   einen leeren POST an die bestehende Vercel-Route; keine direkte Radio-
   Anfrage aus Codex, kein Redirect, kein Retry, 20s Clientfrist. Ohne
   `--execute` wird ausschliesslich die lokale Vorlage angezeigt.
6. Privaten Antwortbeleg plus vorhandenen Vercel-Requestlog lesen und an
   Commit, Deployment, `x-vercel-id`, beobachtete Region/Zeit binden. Einmalmarke
   in der unten gebundenen technischen Zeile sowie Anbieterwirkung gezielt ruecklesen.
   Anschliessend rein lokal mit dem vorhandenen Extraktor aus PR1106 pruefen:
   `node /workspace/helmut-inhaltsversorgung/scripts/lokal.js /workspace/helmut-radio-freigabeauftrag-20261108/inhalt-pruefen.js /workspace/helmut-radio-freigabeauftrag-20261108/ergebnis.json /workspace/helmut-inhaltsversorgung`.

## Erwartete Belege und ehrliche Auswertung

| Stufe | Erforderlicher Beleg | Was daraus nicht folgt |
|---|---|---|
| Transport | Vercel-Requestzuordnung; ein GET; gepruefte DNS-IP = TLS-Peer; Original-SNI; TLS authorized; HTTP-Status. Auch403/Redirect belegt eine HTTPS-Antwort, wird aber nicht als Artikel akzeptiert. | Kein Nachweis von Artikelinhalt oder allgemeiner Quellengesundheit. |
| Empfang | Vollstaendige200-HTML-Antwort, richtiger Typ/UTF8, unveraenderte Originalbytes <=1MiB, SHA256 und privates Base64; keine Navigation als Artikel behaupten. | HTTP200 und Bytezahl reichen nicht fuer Textqualitaet. |
| Artikelbindung | Vorhandene Strukturpruefung: kanonisches Ziel, sichtbarer Titel, Artikelbereich, Pubikationszeit und zusammenhaengende Originalabsaetze; Originaltext samt SHA und Fundstruktur. | Keine Produktionsverarbeitung und keine fachliche Vollstaendigkeit. |

Die lokale Altprobe hat Antwort-SHA256
`95a1bc4bffd737f011c9cd16e94a74ad4819ba4350f5bce6acad71b84e7b6547`.
Ihr gebundener Absatz hat727Zeichen und Text-SHA256
`f6adf5e237ceeb0cbd9db8ea76f8babc3f1e1b839d0ba9f841016bf7a2a5e462`.
Nachpruefbare Aussagen: Wohngeld fuer Rentner, moegliche Kuerzung ab2027,
Grundsicherung und bezahlbarer Wohnraum/Mieten. Das sind keine Aussagen zu
Pflege oder Wohnungsbau. Erwartung ist der erhaltene Aussagezusammenhang,
nicht die blosse Zeichenzahl. Ein veraenderter Originalstand wird separat
ausgewiesen; alter Hash ist Referenz, kein Beweis eines neuen Empfangs.

Die beobachtete HTTP-Canonical-Deklaration erlaubt weder HTTP-Abruf noch
Hostwechsel. Die vorhandene PR1106-Strukturpruefung akzeptiert diese
Schreibvariante nur bei identischem Host/Pfad/Query und gebundenem Titel,
Datum und Artikelbereich. Sie wird fuer die Probe **lokal** genutzt, ohne
die allgemeine Inhaltsversorgung oder eine Canonical-Lockerung auszurollen.
Ein Scheitern der Strukturpruefung bleibt eine offene Artikelbindung; die
Vorlage erfindet daraus weder fehlenden noch vorhandenen Artikeltext.

Bei Deadline, fehlender Antwort, unklarem INSERT oder unterbrochener
Operatorantwort bleibt das Ergebnis UNKNOWN/Luecke, ohne zweite Zustellung.
Nonce nie loeschen/zuruecksetzen. Vorhandene Radio-Cachezeile bleibt unveraendert.

## Wirkung, Kosten und Rueckweg

Spaeter erlaubte technische Writes: **eine neue technische Einmalmarke**
in der vorhandenen Tabelle `helmut_store`, ID
`main-operator-radio-original-9bb8e647-b0cf-4774-9828-8f236eeeb59c`,
und normale Anbieterreserve/-meldung fuer genau diesen Abruf. Atomarer
INSERT mit `on_conflict=id`, `resolution=ignore-duplicates` und exakt
bestaetigter Rueckgabe; bei Duplikat oder unklarer Antwort kein Abruf.
Keine neue Tabelle/Migration. Der Auth-Schreibweg wird bewusst nicht genutzt,
weil dessen Normalisierung bestehende Listen kuerzen kann. Der
Anbieterschutz wird nur im lokalen Aufrufargument angefordert; keine
`process.env`-, Vercel- oder Feature-Flag-Aenderung, kein Ersatzzaehler.
Raw Documents, Findings, Artikelkontextcache, Profile, KOs und Briefings
werden weder geschrieben noch als Ergebnisquelle umgedeutet.

Keine Modellkosten. Eine vorhandene Vercel-Bereitstellung/Function bis20s,
hoechstens1MiB Originalantwort und maximal etwa1,4MiB Base64-Rueckgabe plus
kleine Metadaten; uebliche Build-/Function-/Transferabrechnung kann entstehen.
Keine neue Ressource, kein Tarifwechsel und kein dauerhaftes Abo.

Rueckweg nach Freigabe: gespeichertes vorheriges READY-Deployment wieder
zuweisen oder gezielter Code-Revert mit gesondertem GO; keine Fachdaten-
Ruecknahme. Einmalmarke/Anbieterbeleg als Audit erhalten. Vor Bereitstellung
ist kein produktiver Rueckweg erforderlich: der Entwurf ist inaktiv.

## Pruefstand und offene Luecken

Isoliert bestanden:8Radio-Auftragsgruppen mit atomarer technischer INSERT-Marke;13Abrufschutzgruppen einschliesslich
Beobachterfehler/Redirect;10bestehende Einzelprobenfaelle plus echte
Speicher-CAS-Konflikt-/Unbekannt-Gegenproben. Der erste CAS-Test wurde im
Codex-Sandbox-Netz durch Loopback-`EPERM` gestoppt; ausserhalb der Sandbox mit
demselben lokalen Netzschutz bestanden. Das ist kein Originaltransporttest.
Zusatzpruefung ausschliesslich mit vorhandener Radio-Originaldatei: richtige
727Zeichen/Referenzaussagen; reine Ueberschrift, fremde Canonical und Zeitdrift
abgewiesen; HTTP ohne Artikel und fehlender Transport bleiben unterscheidbar.
Kein bezahlter oder abgefangener Modelllauf in dieser Einzelprobe.

**Offen:** Vercel-Originaltransport und tatsaechlich neu empfangener
Radio-Artikel;317Google-Titelfaelle, DGB-Quellenbindung und allgemeine
Inhaltsversorgung. Der alte600Zeichen-Vertrag begrenzt den727Zeichen-Absatz;
die1280Zeichen-Einstiegsloesung und Originaltext→abgefangene Modelleingabe
sind nur PR1106-Entwurfsbelege. Keine neue Textgrenzenaenderung hier.
PR1106 `f7ade1ef` bleibt getrennt und abhaengig von **PR1104 `947add8d`**.
PR1104 hat weiterhin **keine eigenen Endcommit-Pflichtchecks**; die
erfolgreiche Code-CI42428840532 gilt dem frueheren Codebaum, nicht als
ausgefuehrter Nachweis auf947. Kein Merge eines dieser PRs.

**Genau ein naechster Schritt:** den gebundenen Entwurf samt offenem Review/
Pflichtcheckstand zur gesonderten Freigabe der erforderlichen Bereitstellung
und dieses einen Abrufs abnehmen; bis dahin nichts ausfuehren.
