# Allgemeine Inhaltsversorgung – getrennter Folgeentwurf

Stand 08.11.2026. **Code vorbereitet, gezielt offline geprüft, nicht aktiviert.**
Abhängigkeit: [PR #1104](https://github.com/ernisch/helmut-pilot/pull/1104), exakt
Kopf `947add8d`. Dieser Entwurf liegt auf `codex/inhaltsversorgung-entwurf-20261108`
und ersetzt weder dessen Abnahme noch den produktiven Quellenlauf.

## 1. Abnahmevorlage zu PR1104

Bei Erstellung der Abnahmevorlage: Main `915d15b6`, PR-Kopf `947add8d`, DRAFT/ungemergt.
Der Review fand inzwischen Main `ec223b77` mit dem separaten Diagnosefix #1105
vor; Regeln unverändert, keine Übernahme in diesen abhängigen Entwurf.
Fachlicher Diff-Review im Hauptlauf: keine zusätzliche Korrektur für den dort
begrenzten Auftrag erforderlich. Titel-/Texttrennung, ganze Satzpräfixe,
RSS-Alternativen, Metadaten-Minimierung und Fundstellenherkunft nachvollzogen.
GitHub-Reviews und Reviewthreads sind leer: **kein unabhängiges Approval**.

[Pflicht-CI 42428840532](https://github.com/ernisch/helmut-pilot/actions/runs/42428840532)
ist abgeschlossen: `Syntax + Offline-Suiten` und
`Browser-/Mobile-Smoke (Chromium)` SUCCESS auf **`5bef1ff4`**. Browserausführung
bewusst vom vorhandenen Prüfplan übersprungen; kein neuer Browsernachweis.
Mock100-Sonderjob SKIP, kein neuer Vollversuch.

Der endgültige Dokumentationskopf `947add8d` unterscheidet sich nur in
`docs/CURRENT_STATE.md` und `docs/betrieb/quelleninhalt-20261108.md`.
Alle übrigen versionierten Dateien sind identisch. Zusätzlich geprüft:

| Baum | `5bef1ff4` und `947add8d` |
| --- | --- |
| `lib` | `0ce26f5f143ad186c931bdf24d15a234ce5e0fad` |
| `scripts` | `44dd9835ed7dc5e9d63dd2b9cfdc2fd384c3e99a` |

Damit werden die erfolgreichen Code-/Testnachweise weiterverwendet.
**Required Checks sind dem endgültigen Dokumentationskopf nicht direkt
zugeordnet.** Keine Statuskopie, kein künstliches SUCCESS, keine Behauptung
technischer Mergebereitschaft. Der bestehende Workflow würde ohne PR-Eventbasis
eine konservative Vollprüfung starten; diese wird nicht pauschal wiederholt.
PR-Beschreibung aktualisiert, zu PR1104 kein neuer Push/Run/Merge.

## 2. Verarbeitung im Folgeentwurf

`Fundstelle → vorläufiger Bezug → Original → bestätigter Beleg → fachliche Aufnahme → bestehendes Understanding`

`quellen-inhaltsversorgung-anschluss.js` verbindet die Versorgung **inaktiv**
mit `scheduler.runGlobaleErfassung`, nach dessen kanonischer Speicherung und
unter dessen bestehender globaler Sperre, vor Lazy-/Eager-Understanding.
Ausschließlich ein expliziter interner `inhaltsversorgung.vorbereitet === true`-
Auftrag erreicht diesen Zweig; kein bestehender Server-/Cron-/App-Aufrufer
setzt ihn. Ohne Auftrag keine zusätzlichen Leser oder Beschaffer. Keine neue
Infrastruktur und kein neuer Umgebungs- oder App-Schalter.

- Vorläufiger Bezug verwendet `lage-profilbezug.bewerte`, ohne ein zwingendes
  Handlungssignal im Titel. Eine knappe Überschrift bleibt über den vorhandenen
  Profil→Paket-Resolver und eine an die Dokument-ID gebundene Fundstelle prüfbar.
  Alte fehlende Wegkennungen werden nur bei eindeutiger tatsächlicher
  `retrieval_paths.legacy_source_id`-Zuordnung gelesen, nicht erraten.
- Ohne vorläufigen Bezug heißt der Zustand `nicht-ausgewaehlt`, nicht endgültig
  irrelevant. Höchstens **20 Kandidaten**, darunter höchstens **3 rein unklare**,
  höchstens **2 neue Artikelabrufversuche je Dienstexemplar/globalem Lauf**.
  Kontingente gelten über mehrere Batches. Rest wird mit Grund vertagt.
  Eingabe je Batch höchstens 200 Dokumente/100 Profile; keine stillen Restverluste.
- Der bestehende `beschaffeArtikelkontext` erhält nur die explizite Option
  `kontext: "einstieg"`. Eigener versionsgebundener Schlüsselnamensraum im
  bestehenden globalen CAS-Belegspeicher. Keine Schemaänderung, kein Volltext-
  Upsert, kein Rückschreiben in `raw_documents.summary`.
- Artikel-ID, Titel, Publikation, Quelle und Originalantwort-/Texthashes bleiben
  gebunden. Ein bestätigter globaler Beleg kann von mehreren passenden Mandaten
  gelesen werden. Bestätigter Bestand verbraucht keinen neuen Abrufplatz;
  konkurrierende Aufrufer erzeugen höchstens einen Abruf desselben Quellenstands.
  Dafür ist stets dieselbe kanonisch gespeicherte globale Dokumentzeile zu nutzen:
  Der bestehende Quellenhash bindet auch Abrufzeit und Herausgebermetadaten.
  Pro Weg neu zusammengesetzte Zeilen wären keine sichere Cache-Wiederverwendung.
- Erst der bestätigte Originaltext wird nochmals gegen die bestehenden
  Fach-/Regionalkriterien geprüft. Ein Titel, Herausgeber oder Partei allein
  reicht dann nicht. Nur `bereit` wird mit `artikelVersorgung` an den vorhandenen
  Understanding-CAS weitergegeben; Budget und Modellstart bleiben dessen Aufgabe.
- Keine Quelle wird bei App-Öffnung abgerufen. Fehlender, gesperrter, veralteter
  oder nicht gebundener Inhalt bleibt `luecke`; kein Fülltext und kein Ersatzartikel.

Der Anschluss erzeugt **ein Exemplar je globalem Lauf**, nicht je Mandat oder
Kontextstapel. Auch wiederbeobachtete bestehende Rohdokumente werden berücksichtigt,
wenn der Rohspiegel nichts Neues liefert. Höchstens 200 priorisierte Kennungen
werden kanonisch rückgelesen; Mehrbestand bleibt ausdrücklich vertagt. Titel,
URL, Herausgeber und Publikationsstand müssen mit der Beobachtung übereinstimmen;
die gespeicherte Abrufzeit bleibt für den Belegschlüssel maßgeblich. Die aktuelle
Quellensichtbarkeit darf durch die historische Primärquelle nicht wachsen.
Gebundene Fundstellen werden in höchstens zwei begrenzten Lesechunks abgefragt;
am API-Deckel von 1.000 Zeilen wird keine Vollständigkeit behauptet.

Vorhandener kanonischer Originaltext bleibt im bisherigen Textweg. Bereits
bestätigte generische/spezialisierte Kontextbelege werden zuerst ausschließlich
aus dem Bestand gelesen; ihre bisherigen begrenzten Absatzverträge gelten weiter.
Erst ein fehlender nutzbarer Bestandsbeleg führt zum neuen Einstiegsvertrag.
Der belegte Text erreicht die vorläufige Fachauswahl und den vorhandenen
Understanding-Prompt ohne Änderung der Rohzeile. Der Promptanschluss liest nur
gebundene Belege und verhindert weitere Abrufe je Stapel. Speicher-/Netzfristen,
Modell-CAS, Budget, Promptauswahl und Abschlussreserven bleiben wirksam.

## 3. Zusammenhängender Originalkontext

`gewinneArtikelEinstieg` verwendet die vorhandenen begrenzten HTML-/JSON-LD-
Attribut-, Absatz- und Sichtbarkeitsleser. Zwei strukturelle Verträge:
eindeutiges Article-JSON-LD plus sichtbarer Artikelbereich oder eindeutige
Microdata-Artikelüberschrift/-datum/-body. Widersprüchliche zusätzliche
Metadaten, versteckte Absätze und gesperrte Metadaten scheitern.

Es werden die ersten bis zu **vier aufeinanderfolgenden ganzen Absätze**
einschließlich des sichtbaren Zwischenkontexts übernommen, ohne Umformulieren
oder Auswahl eines späteren bequemeren Absatzes. Der überprüfbare v2-Beleg
enthält Absatzliste und `zwischenTexte`; beides ergibt exakt den Kontexttext.
Nur dieser neue Vertrag erlaubt **maximal 1.280 Zeichen**. Die alte generische
600-Zeichen-Grenze, der bisherige Bundestagsvertrag und `summary` mit 240 Zeichen
bleiben unverändert. Zu langer erster Absatz bleibt eine Lücke. Absatzliste und
Gesamtabsatzanzahl zeigen, ob der Artikel weitergeht; kein Vollständigkeitsclaim.

Die minimale neue Grenze wird an den Originalen begründet, nicht als Qualität
gewertet: DGB benötigt vier Absätze/1.166 Zeichen zuzüglich 90 Zeichen
Original-Zwischenkontext, insgesamt **1.256 Zeichen**, um Arbeitgeberangebot,
IG-BAU-Forderung und Ende der Friedenspflicht gemeinsam zu erhalten. Die alte
Entwurfsgrenze 1.200 hätte nach Erhalt dieses Kontexts den vierten Absatz
ausgeschlossen. Deshalb nur für diesen Vertrag 80 zusätzliche Zeichen. Radio
Hannovers eigener Absatz hat 727 Zeichen und enthält zusätzlich die
Konjunktive/Bedingungen sowie die Wohngeldforderung. Alte Grenzen verlieren
hier nachweislich relevante Aussagen. Es gibt keine selbst formulierte Kurzfassung.

## 4. Radio Hannovers Quellenbindung

Die vorhandene Originalantwort ist unter HTTPS gelesen, ihre einzige Canonical
deklariert HTTP. Der neue **Microdata-Einstiegsvertrag** erlaubt ausschließlich
diese Schemavarianz bei exakt gleichem Host, Pfad und Query, ohne Ports,
Zugangsdaten oder Fragment. Zusätzlich müssen eindeutiger Artikelbereich,
vollständiger Originaltitel und Artikeldatum zum unveränderten Quellenstand
passen. Transport/Belegziel bleiben HTTPS. Kein HTTP-Abruf und kein Domain-/
Pfadalias; der alte Metadatenextraktor bleibt bei seiner Ablehnung.

Das Original nennt `dateCreated`, nicht `datePublished`. Diese Herkunft bleibt
ausgewiesen. Sie muss hier mit der Feed-Publikationszeit übereinstimmen und
ersetzt sie nicht. Fremde Canonicals, andere Pfade/Queries, Zeitdrift, versteckte
Texte und widersprechende JSON-LD-Angaben bleiben gesperrt.

## 5. Gezielte Nachweise

Keine neuen Originalabrufe: verwendet werden die im vorigen Auftrag gesicherten
zwei HTML-Antworten und der DGB-RSS-Eintrag. Reduzierte Originalproben samt
[Hashmanifest](../../scripts/fixtures/inhaltsversorgung-20261108/manifest.json)
liegen im Repo. Die vorhandenen vollen Antworten wurden lokal bytegeprüft und
liefern exakt dieselben Kontexttexte; fehlen sie später, wird dieser Vergleich
ausdrücklich SKIP, nicht still behauptet.

- Neue Suite nach Reviewkorrektur **18/18**: DGB/Radio mit belegt relevanten Aussagen, knapper Titel
  über Paketweg, falsche Fundbindung, unpassendes Original, ausgeschlossener
  Gegenprofilbezug, 403 ohne Wiederholungsabruf, Kontingente über Batches,
  Deadline/Host-/Anbietergrenze, CAS-Konkurrenz, Publikationsdrift und HTTPS-
  Gegenproben. Zwei passende synthetische Mandate teilen denselben Beleg.
- **Echter `understandOneCluster`-Aufrufer**, bestehender CAS-/Budgetvertrag mit
  isolierten Speicher-/Modellattrappen: Originaltext und Canonicalherkunft werden
  in der tatsächlich an den Modell-Callback übergebenen Quelle exakt geprüft.
  Modellantwort ausdrücklich Attrappe, kein fachliches KI-Ergebnis behauptet.
- Artikelkontext **10**, Gewinnung **11** und Beschaffung **12** Gruppen nach
  Änderung der gemeinsamen Verträge gezielt erneut bestanden. Eingabebindung
  **10**, Anschluss **20** und Kernschutz **14/14** vom bisherigen Codekopf
  `b5648e23` werden als passende Vorbelege weiterverwendet; keine lokale
  Vollwiederholung. Endkopf/Ergebnis der neuen Pflicht-CI werden im PR nativ
  zugeordnet. Die erfolgreiche CI42458862751 gehört zum alten Kopf `b5648e23`.

## Fachlicher Review nach dem ersten Entwurf

Drei reine synthetische Gegenproben am Kopf `b5648e23` wurden fälschlich
angenommen: ein Rückzugshinweis als Vorspann, ein Warnsatz zwischen Absätzen
und eine zweite widersprechende Artikeladresse. Der damalige positive
14er-Nachweis deckte diese Fälle nicht ab.

Korrektur nur im neuen Kontextweg: sichtbarer Zwischenkontext wird unverändert
mitgenommen und gegen die vollständige Absatzfolge im JSON-LD geprüft. Vor
Beginn darf ausschließlich ein ausdrücklich gebundenes Datumsmetadatum oder
die exakt gebundene Artikelüberschrift liegen. Anderer Vorspann bleibt eine
Lücke. Alle gelieferten `url`-/`mainEntityOfPage`-Angaben müssen passen; eine
zusätzliche `dateCreated`-Angabe darf Microdata desselben Felds nicht widersprechen.
Eigener v2-Verfahrens-/Speichernamensraum vermeidet die Wiederverwendung eines
älteren Belegs mit fehlendem Zwischenkontext. Keine produktiven v1-Belege aus
diesem inaktiven Auftrag angelegt oder migriert.

Vier zusätzliche Prüfgruppen belegen Erhalt des Rückzugshinweises bis in den
echten Understanding-Callback, abweichende Vorspänne/Datumsabsätze, mehrere
Artikelidentitäten und widersprechende Erstellungsdaten. Ganze DGB- und
Radio-Originalproben bleiben positiv; ihre Quellbytes wurden nicht verändert.
Review durch denselben ausführenden Codex-Lauf, kein unabhängiges Approval.

## CI-Werkzeugbereitstellung nach dem Review

CI42465774925 auf `d0e47259` scheiterte in zwei Versuchen am unveränderten
PostgREST-Browserdownload (HTTP504). Im ersten Versuch war derselbe Download
zuvor bereits gelungen; im zweiten scheiterte er vor der Anschlussprobe.
Fehlende Quittung/Artefakt im zweiten Versuch sind Folgefehler. Keine nicht
abgeschlossenen Offline-/Bereichs-/Datenbankprüfungen als bestanden gewertet.

Der gezielte Verfügbarkeitscheck lieferte erneut HTTP504. Der offizielle
GitHub-Release-Assetzugang für **v12.2.3 linux-static-x64, Asset183261684**
lieferte dagegen 3.772.512 Bytes mit exakt dem vorhandenen Archiv-SHA256
`9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c`.
Auch der bestehende Binär-Pin
`870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617`
ist unverändert. Keine neue Version, Berechtigung oder Infrastruktur.

Die vorhandene Action nutzt diesen offiziellen Zugang mit
`Accept: application/octet-stream`. Der spätere CI-Schritt verwendet dieselbe
bereits geprüfte Binärdatei aus dem bestehenden W15-Schritt und prüft ihren
Hash nochmals. Kein zweiter Download desselben Werkzeugs im Job.
Isoliert am echten Shellschritt geprüft: korrekte Datei liefert Version12.2.3,
beschädigte oder fehlende Datei scheitert vor Ausführung. YAML-/Bash-Syntax
bestanden; Jobs, Schritte und Bedingungen im geparsten Workflow unverändert.
Der bestehende Prüfplan fordert wegen der CI-Dateiänderung konservativ auch
den Browserlauf. Keine lokale Wiederholung der unveränderten Fachsuiten.

Main ist inzwischen `b4863123`: seit `ec223b77` nur Diagnose-/Rolloutdokumente,
keine überschneidende CI-Korrektur gefunden. Neuer endgültiger Kopf und dessen
CI-Ergebnis stehen im PR; die vorherigen 504-Fehler bleiben dort nachvollziehbar.

### Begrenzter Downloadretry nach CI42474857864

Auf Anschlusskopf `412d64c5` scheiterte die Werkzeugbereitstellung zuerst mit
HTTP503 ([Job128713790899](https://github.com/ernisch/helmut-pilot/actions/runs/42474857864/job/128713790899)),
im einmaligen gezielten Jobretry mit HTTP504
([Job128714677862](https://github.com/ernisch/helmut-pilot/actions/runs/42474857864/job/128714677862)).
Fehlende Quittung/Artefakt sind Folgefehler. Offline-/Bereichs-/Datenbanksuiten
wurden nicht erreicht; tatsächlicher Browsercheck bestanden. Ein anschließender
lokaler Verfügbarkeitscheck hatte dieselben Bytes mit richtigem Archivhash
geliefert. Die entfernte Ursache der 5xx-Antworten ist damit nicht geklärt.

Die vorhandene Action erlaubt jetzt höchstens **einen Curl-Retry** bei den von
Curl als temporär behandelten Fehlern, darunter 503/504. Je Versuch 45s Gesamt-
und 15s Verbindungsfrist, 2s Wiederholungsabstand, 95s Retry-Zeitfenster. Kein
neuer Spiegel, Token, Cache, Werkzeug oder pauschaler Jobretry. Archiv-/Binärpin,
Hashprüfung vor Entpacken, Prüfschritte und Bedingungen bleiben unverändert.
Sind beide Versuche erfolglos oder stimmen die Bytes nicht, scheitert der Job.

`scripts/ci-postgrest-download-test.js` führt die tatsächlichen Download-/Hashzeilen
mit echtem Curl ausschließlich gegen Loopback und einen deklarierten Synthetikpin
aus: 503→200, 504→200, dauerhafte 503/504 nach exakt zwei Anfragen, 404 ohne Retry
und HTTP200 mit falschen Bytes ohne Hashfreigabe. **6/6 Gruppen bestanden.**
Die erste lokale Ausführung war durch `listen EPERM` der Sandbox blockiert;
die isolierte Ausführung mit erlaubtem Loopback-Server bestand. YAML-/Bash-/JS-
Syntax und Diffprüfung bestanden. Fachcode und Fachtests bytegleich zu `412d64c5`;
deren erfolgreiche gezielte Nachweise werden weiterverwendet. Neue Pflicht-CI
bleibt bis zu ihrem tatsächlichen Abschluss offen und wird im PR zugeordnet.

## 6. Spätere Aktivierungsvorlage – nicht ausgeführt

1. Voraussetzungen: PR1104 fachlich abnehmen; Endkopf-Checks ehrlich klären.
   Folgeentwurf samt inaktivem Scheduleranschluss separat reviewen/qualifizieren.
   Für einen späteren regulären Lauf den expliziten internen Auftrag erst nach
   konkreter Freigabe im bestehenden globalen Aufrufer setzen. Server-/App-
   Lesepfade bleiben ohne Beschaffer. Kein neuer Job oder aktiver Schalter.
2. Erster konkret begrenzter Auftrag: **einmal nur diese Beschaffungsstufe**
   unter der vorhandenen globalen Lauf-/Sperrbindung, auf bereits gespeicherten
   kanonischen Kandidaten. Kein vollständiger Quellen-/Verarbeitungslauf und
   keine Übergabe an nachfolgende Modellphasen. Einmaliges Dienstexemplar,
   maximal 20 Kandidaten/3 unklare/2 neue
   Artikelversuche; exakte Hostfreigabe zunächst `www.dgb.de` und
   `www.radio-hannover.de`. Dieselben Regeln für alle tatsächlich aktiven
   geeigneten Profile, keine Cem-/Artikel-Sonderregel. Unpassende oder nicht
   gebundene Eingaben liefern nur Befunde. Vorher die höchstens 20 kanonischen
   Dokument-IDs/Quellenhashes, Lauf-ID und Deadline konkret vorlegen; keine
   Fixture-ID als Produktionsbeleg ausgeben.
3. Wirkung: nur neue globale Belegzeilen im vorhandenen `helmut_store`-
   Namensraum, keine Änderung von Originalzeilen, Wissensobjekten oder Profilen.
   Im regulären Anschluss maximal 57 zusätzliche REST-Zugriffe für Dokumente,
   Katalog, Fundstellen und Belege: 2 + 5 + 2 Lesungen, bis 40 Bestandslesungen
   und bis 8 weitere Beleg-CAS-Schritte. Zusätzlich gelten die vorhandenen
   Kontrollzugriffe der Anbietersteuerung; 57 ist kein Gesamt-HTTP-Limit.
   Maximal zwei Original-HTTPS-Anfragen. Der vorhandene Artikelkontexttransport
   lehnt jeden Nicht-200-Status vor der allgemeinen Redirectbehandlung ab:
   keine Weiterleitung und keine verdeckte Retry-Schleife. Die Ein-MiB-/20-s-/
   DNS-/SSRF-/TLS-/Anbieterriegel bleiben wirksam.
4. Kosten: erste Beschaffungsabnahme **0 Modellaufrufe**, keine neue Ressource.
   Zusätzlicher Speicher-/Laufzeitverbrauch im Bestand. Eine spätere normale
   Analyse kann im reinen Textfeld bis 680 zusätzliche Zeichen gegenüber dem
   bisherigen generischen Absatzvertrag erhalten. Zusätzlich werden die
   Absatz-/Zwischenkontextlisten und Belegmetadaten serialisiert; die 680
   Zeichen sind **keine** Grenze des gesamten Promptzuwachses. Vor Aktivierung
   am tatsächlich serialisierten Prompt messen; Tokens/Kosten modellabhängig.
   Kein höheres Aufrufkontingent oder Budget daraus ableiten. Aktuelle
   Anbieterfreigaben und globale Wirkung der Anbietersteuerung vorab prüfen.
5. Nachkontrolle: Versuchszähler, tatsächliche HTTP-/REST-Anfragen und Lückengründe
   bilanzieren; gespeicherte Belege/hashgebundene Originalabsätze rücklesen;
   Cache-Wiederverwendung über mindestens zwei Mandate ohne weiteren Abruf
   belegen. Kontextübergabe erneut isoliert am echten Modell-Callback prüfen.
   Ein gefülltes Feld, ein langer Text oder ein erfolgreicher GET genügt nicht.
6. Rückweg: expliziten internen Auftrag entfernen; alten Kontextpfad weiter
   unverändert verwenden. Neue Belegzeilen bleiben getrennt und unbenutzt.
   Falls deren Rücknahme nötig wird: nur Manifest-Zielzeilen unter exaktem
   Nachherhash bedingt zurücknehmen; keine fremden späteren Änderungen löschen.

Aktuell erforderliche zusätzliche Einzelabrufe: **keine**. Für einen späteren
aktuellen Originalabgleich wären genau diese zwei HTTPS-Ziele vorzulegen, bevor
etwas abgerufen wird: [DGB](https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/)
und [Radio Hannover](https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen).

## 7. Offene Grenzen / sicherer Entwurfsstatus

Die 317 untersuchten Google-Leerfelder werden nicht nachgeladen oder als
relevant behauptet. Andere Seitenstrukturen, fehlende Publikationsbelege,
Paywalls, Sperren und Absätze über der Grenze bleiben offen. Historische
DGB-Zeilen mit nur `source_name="DGB"` belegen den gesamten langen Titelsuffix
nicht; der neue Leser rät kein Herausgeberalias. Der positive DGB-Beleg nutzt
die tatsächlich im Originalfeed vorhandene vollständige Herausgeberbezeichnung.
Keine automatische Wiederholung einer gespeicherten Lücke; erneuter Versuch
bei gleichem Stand braucht einen separat kontrollierten Auftrag. Der bestehende
Understanding-Vertrag erlaubt weiterhin nur einen Zusatzbeleg pro Cluster und
erzwingt dessen Aufnahme in die begrenzte Promptauswahl. Mehrere Zusatzbelege
oder ein Beleg außerhalb der zwölf ausgewählten Quellen werden ehrlich vertagt.
Pending-/Nachholarbeiter sind nicht neu angeschlossen. Der inaktive globale
Anschluss ist isoliert belegt; produktive Wirkung und reguläre Laufqualifikation
bleiben offen. Bestandsabsatzbelege sind kein Nachweis vollständigen Artikelkontexts.

Vor Push: geänderte Pfade gegen alle Live-Workflowtrigger abgleichen.
`vercel.json` sperrt exakt diesen Entwurfsbranch für Git-Deployments. Entwurfspush
ohne CI-Skip: Keiner der neuen Pfade trifft einen automatischen Live-Trigger.
Die unveränderte Pflicht-CI darf laufen; `vercel.json` erzwingt im bestehenden
Prüfplan konservativ die große isolierte Offline-/Datenbankprüfung. Keine
zusätzliche lokale Vollwiederholung, kein manuell gestarteter Verarbeitungslauf,
kein künstliches Grün und keine Behauptung eines noch ausstehenden Ergebnisses.
Der Entwurf bleibt DRAFT/ungemergt und ist damit nicht zur Ausrollung freigegeben.
PR-Basis bleibt der Branch von PR1104. Ein vorzeitiges Umhängen auf `main`
würde dessen Crawler-/Dedup-Pfade erneut in den PR-Diff aufnehmen und könnte
Live-Trigger auslösen. Nach einer späteren getrennt freigegebenen Integration
von PR1104 den gesamten Basis-/Kopf-Diff erneut gegen die Trigger prüfen.

## 8. Inaktiver Anschluss nach Betreiber-Go

17/17 neue Anschlussgruppen führen den echten globalen Controller mit isolierten
REST-, Quellen-, Speicher- und Modellattrappen aus. DGB/Radio aus den unveränderten
Originalproben erreichen den abgefangenen tatsächlichen Understanding-Prompt:
Angebot, Forderung, Friedenspflicht und die bedingte Aussage ab 2027 bleiben darin.
Zwei passende synthetische Mandate teilen einen DGB-Beleg; der Radio-Weg bleibt
auf die tatsächlich sichtbare Mandatsmenge begrenzt. Kein Beleg speichert Profil-IDs.

Belegt sind außerdem: gespeicherter Originaltext, bereits bekannter Rohspiegel,
knapper Titel mit Fundstellenbindung, fachfremder Text, 403/Metadaten ohne Artikel,
fehlende/abweichende kanonische Quelle, Leseausfall, Sperr-/Fristverweigerung,
200er-Lesepool, globale Abrufgrenze, deaktivierte/ausgeschlossene Gegenprofile,
Bestandsbeleg ohne Neuabruf, mehrere Zusatzbelege und die Zwölfer-Promptgrenze.
CAS-/Budgetverweigerung führt zu null Modellaufrufen und nicht zu einem vorgetäuscht
abgeschlossenen Datenstand; nur belegte Speicherergebnisse zählen als verstanden.

Erneut gezielt bestanden: Versorgungsbaustein 18/18, globale Controllerregression
194/194, Kontextbündelung 56/56, bisheriger Artikelkontextanschluss 20/20 und
Eingabebindung 10/10. Keine lokale Vollwiederholung. Die erfolgreiche CI42467307203
gehört ausschließlich zum vorherigen Kopf `84f7e8b1`; der neue Kopf braucht seine
eigenen Pflichtchecks. Ergebnis und nativer Laufbezug werden im PR nachgetragen.
Kein neuer Originalabruf, produktiver Lauf, Merge, Deployment oder Modellaufruf.

**Genau nächster Schritt nach bestandener Endkopf-CI:** Den begrenzten
Beschaffungsauftrag anhand dieser Vorlage konkret zur Freigabe vorlegen.
