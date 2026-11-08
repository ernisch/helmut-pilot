# Allgemeine Inhaltsversorgung – getrennter Folgeentwurf

Stand 08.11.2026. **Code vorbereitet, gezielt offline geprüft, nicht aktiviert.**
Abhängigkeit: [PR #1104](https://github.com/ernisch/helmut-pilot/pull/1104), exakt
Kopf `947add8d`. Dieser Entwurf liegt auf `codex/inhaltsversorgung-entwurf-20261108`
und ersetzt weder dessen Abnahme noch den produktiven Quellenlauf.

## 1. Abnahmevorlage zu PR1104

Main ist unverändert `915d15b6`, PR-Kopf `947add8d`, DRAFT/ungemergt.
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

`quellen-inhaltsversorgung.js` ist eine **inaktive Ausführungsschicht** ohne
Import aus Scheduler, Server, Cron oder App. Ein Exemplar ist für genau einen
bestehenden globalen Quellenlauf vorgesehen, nach der kanonischen Speicherung,
vor dem bisherigen endgültigen Titelfilter. Keine neue Infrastruktur.

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

Die spätere Integration muss dieses Exemplar **einmal unter der vorhandenen
globalen Lauf-/Sperrbindung** erzeugen. Je Mandat eine neue Instanz zu erzeugen
wäre falsch. Der Scheduler-Aufrufer ist in diesem Auftrag bewusst noch nicht
verdrahtet; eine Flag-Aktivierung allein reicht nicht zum Betrieb.

## 3. Zusammenhängender Originalkontext

`gewinneArtikelEinstieg` verwendet die vorhandenen begrenzten HTML-/JSON-LD-
Attribut-, Absatz- und Sichtbarkeitsleser. Zwei strukturelle Verträge:
eindeutiges Article-JSON-LD plus sichtbarer Artikelbereich oder eindeutige
Microdata-Artikelüberschrift/-datum/-body. Widersprüchliche zusätzliche
Metadaten, versteckte Absätze und gesperrte Metadaten scheitern.

Es werden die ersten bis zu **vier aufeinanderfolgenden ganzen Absätze**
übernommen, ohne Umformulieren oder Auswahl eines späteren bequemeren Absatzes.
Nur dieser neue Vertrag erlaubt **maximal 1.200 Zeichen**. Die alte generische
600-Zeichen-Grenze, der bisherige Bundestagsvertrag und `summary` mit 240 Zeichen
bleiben unverändert. Zu langer erster Absatz bleibt eine Lücke. Absatzliste und
Gesamtabsatzanzahl zeigen, ob der Artikel weitergeht; kein Vollständigkeitsclaim.

Die minimale neue Grenze wird an den Originalen begründet, nicht als Qualität
gewertet: DGB benötigt vier Absätze/1.166 Zeichen, um Arbeitgeberangebot,
IG-BAU-Forderung und Ende der Friedenspflicht gemeinsam zu erhalten. Radio
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

- Neue Suite **14/14**: DGB/Radio mit belegt relevanten Aussagen, knapper Titel
  über Paketweg, falsche Fundbindung, unpassendes Original, ausgeschlossener
  Gegenprofilbezug, 403 ohne Wiederholungsabruf, Kontingente über Batches,
  Deadline/Host-/Anbietergrenze, CAS-Konkurrenz, Publikationsdrift und HTTPS-
  Gegenproben. Zwei passende synthetische Mandate teilen denselben Beleg.
- **Echter `understandOneCluster`-Aufrufer**, bestehender CAS-/Budgetvertrag mit
  isolierten Speicher-/Modellattrappen: Originaltext und Canonicalherkunft werden
  in der tatsächlich an den Modell-Callback übergebenen Quelle exakt geprüft.
  Modellantwort ausdrücklich Attrappe, kein fachliches KI-Ergebnis behauptet.
- Betroffene bestehende Suiten: Artikelkontext **10**, Gewinnung **11**,
  Beschaffung **12**, Eingabebindung **10**, Anschluss **20** Gruppen bestanden.
  Kleiner Kernschutz **14/14** Suiten, Syntax und Diffprüfung bestanden.
  Erfolgreiche Parent-Suiten/CI wurden nicht pauschal wiederholt.

## 6. Spätere Aktivierungsvorlage – nicht ausgeführt

1. Voraussetzungen: PR1104 fachlich abnehmen; Endkopf-Checks ehrlich klären.
   Folgeentwurf separat reviewen/qualifizieren. Den beschriebenen Aufrufer im
   vorhandenen globalen Quellenlauf verbinden; Server-/App-Lesepfade bleiben
   ohne Beschaffer. Kein neuer Job und kein neuer aktiver Schalter aus diesem PR.
2. Erster konkret begrenzter Auftrag: **ein bestehender globaler Quellenlauf**,
   einmaliges Dienstexemplar, maximal 20 Kandidaten/3 unklare/2 neue
   Artikelversuche; exakte Hostfreigabe zunächst `www.dgb.de` und
   `www.radio-hannover.de`. Dieselben Regeln für alle tatsächlich aktiven
   geeigneten Profile, keine Cem-/Artikel-Sonderregel. Unpassende oder nicht
   gebundene Eingaben liefern nur Befunde. Lauf-ID/Deadline vorab festlegen.
3. Wirkung: nur neue globale Belegzeilen im vorhandenen `helmut_store`-
   Namensraum, keine Änderung von Originalzeilen, Wissensobjekten oder Profilen.
   Bei 20 Kandidaten maximal 28 REST-Belegzugriffe bei regulärem Verlauf,
   maximal zwei Original-HTTPS-Anfragen. Der vorhandene Artikelkontexttransport
   lehnt jeden Nicht-200-Status vor der allgemeinen Redirectbehandlung ab:
   keine Weiterleitung und keine verdeckte Retry-Schleife. Die Ein-MiB-/20-s-/
   DNS-/SSRF-/TLS-/Anbieterriegel bleiben wirksam.
4. Kosten: erste Beschaffungsabnahme **0 Modellaufrufe**, keine neue Ressource.
   Zusätzlicher Speicher-/Laufzeitverbrauch im Bestand. Eine spätere normale
   Analyse kann bis 600 zusätzliche Kontextzeichen gegenüber dem bisherigen
   generischen Absatzvertrag erhalten; tatsächliche Tokens/Kosten modellabhängig.
   Kein höheres Aufrufkontingent oder Budget daraus ableiten. Aktuelle
   Anbieterfreigaben und globale Wirkung der Anbietersteuerung vorab prüfen.
5. Nachkontrolle: Versuchszähler, tatsächliche HTTP-/REST-Anfragen und Lückengründe
   bilanzieren; gespeicherte Belege/hashgebundene Originalabsätze rücklesen;
   Cache-Wiederverwendung über mindestens zwei Mandate ohne weiteren Abruf
   belegen. Kontextübergabe erneut isoliert am echten Modell-Callback prüfen.
   Ein gefülltes Feld, ein langer Text oder ein erfolgreicher GET genügt nicht.
6. Rückweg: neuen Aufrufer deaktivieren/zurücknehmen; alten Kontextpfad weiter
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
erzwingt dessen Aufnahme in die begrenzte Promptauswahl. Allgemeine Laufzeit-
integration und produktive Wirkung sind noch nicht belegt.

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

**Genau nächster Schritt:** Den getrennten Folgeentwurf samt verbleibender
Endkopf-/Integrationsgrenzen fachlich reviewen; keine Aktivierung.
