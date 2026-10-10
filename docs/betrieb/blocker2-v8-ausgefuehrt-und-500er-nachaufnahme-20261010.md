# Blocker 2: V8-Ausführung und einmalige 500er-Nachaufnahme

Stand: 10.10.2026, finale unabhängige fachliche Entscheidung um 10:11:25 UTC. Die einmalige aktuelle Aufnahme erfasst **500 von 500**; **42 von 500** sind vollständig fachlich angenommen. **449 Profile** haben mindestens eine konkrete Originalbeleglücke, **114** ein fachliches Ereignisduplikat und **ein Profil** einen noch unentschiedenen engen Ereignisvergleich. Die Kategorien überlappen. **Blocker 2 bleibt offen.**

Das genau freigegebene V8-Paket ist ausgeführt und vollständig nativ nachkontrolliert. Fünf weitere gemeinsame Quellenursachen sind geschlossen, insgesamt zehn von 13. Drei echte Originalbeleggrenzen bleiben offen. Die neue Bilanz ist an den tatsächlichen [Run38036221630](https://github.com/ernisch/helmut-pilot/actions/runs/38036221630) gebunden. Die frühere Abnahme und deren Einzelbefunde gehören ausschließlich zum älteren [Run38030910691](https://github.com/ernisch/helmut-pilot/actions/runs/38030910691). Die [frühere Fachbilanz](blocker2-aktuelle-500er-fachbilanz-20261010.md) bleibt als historischer Beleg erhalten.

## Genau einmal ausgeführtes V8-Paket

Die neue ausdrückliche Betreiberfreigabe galt ausschließlich diesen unveränderten Bindungen:

| Bindung | SHA256 |
| --- | --- |
| V8-Kandidat | `6526c74689076a4b88f3a1495e0b6865962b33a82665223e14b798a7b4fbda91` |
| Ausgeführte Transaktions-SQL | `572b06a799867a7980aaf6ade2dba30e35071382020ccb44c51b4a90c34412fa` |
| Native Nachkontrollquittung | `6ac38a336c4785c59221fca3aeb497678e21ee7cc500dacd0cb71cbae9649350` |

Vor der Ausführung wurden alle gebundenen Vorherwerte und xmin, Schema-/Triggerbindungen, eingehende Referenzen, Runtime-Ruhe und sämtliche 52 Schutzbereiche frisch geprüft. Der unmittelbare native Vorherbeleg war beim Beginn des einzigen API-Versuchs 18,52 Sekunden alt. Die SQL und der Kandidat wurden unverändert ausgeführt; kein Teilpaket und kein weiterer MCP-Schreibversuch.

Die offizielle API lieferte für den einzigen Schreibversuch HTTP 201. Der eigenständige native Nachherbeleg bestätigt `EXACT_NATIVE_COMMITTED_POSTIMAGES_AND_FULL52_SCOPE`: genau 95 Updates an `public.knowledge_objects`, zwei Updates an `public.raw_documents` und vier exakte Löschungen an `public.ko_document_links`. Alle erwarteten vollständigen Nachherzeilen und Hashes passen. Die 49 übrigen Tabellen und die unberührten Teilmengen der drei Zieltabellen sind unverändert, einschließlich aller Profile. Transaktionszeit: `2026-10-10T07:52:37.2712+00:00`; Schreib-xmin: `543559`.

Die vorher auf allen 500 Eingaben bewiesenen gemeinsamen Inhaltsfehler lagen in 93 aktuell sichtbaren KO-Zielen innerhalb dieses 95er-Pakets. Alle 95 erwarteten tatsächlichen Nachherprojektionen, die 405 unberührten KO-Projektionen sowie die vollständigen Quellen- und vier entfernten Relationsbindungen wurden danach in jeder neuen Eingabe bestätigt. Kein alter bewiesener unkorrigierter Negativbefund ist noch exakt sichtbar. Das erfolgreiche Datenpaket ersetzt weder die offenen Originalbelege noch ein positives individuelles Gesamturteil.

Kein automatischer Rückweg wurde ausgeführt. Ein später notwendiger Rückweg ist an die tatsächlichen Nachherwerte zu binden und benötigt ein neues konkretes GO. Die einmalige Schreibfreigabe ist verbraucht.

## Fünf zusätzliche Quellenursachen geschlossen; aktuelle Übertragung

Für alle Fragen blieb das bereits definierte Mindestbelegziel unverändert. Eigene passende Überschrift, Teaser oder kurze Originalpassage wurden dort verwendet, wo sie die konkrete sichtbare Aussage tragen. Keine Stichprobe und kein breiter neuer Quellenaudit.

Die folgende Übertragung gilt für sämtliche tatsächlichen Eingaben des aktuellen Runs 38036221630. Alle tatsächlich betroffenen Profile und Stellen sind an die neuen vollständigen Versionsbindungen gebunden.

| Gemeinsame Ursache | Erfülltes Mindestziel | Aktueller Run: Profile / Stellen |
| --- | --- | ---: |
| `SOLINGEN_DEFERRAL` | Eigene passende Überschrift und Teaser tragen die Vertagung der Wirtschaftsentscheidungen im Ausschuss. | 87 / 368 |
| `RTL_SPECIAL_SUMMIT_REPORTED_TITLE_IDENTITY` | Eigene passende Überschrift und Teaser tragen den berichteten vertraulichen Sondergipfel; Artikelidentität ist gebunden. | 98 / 392 |
| `ZEIT_SIMPLER_BUILDING_RULE_COST_ARGUMENT` | Eigener passender Text trägt das Kostenargument für einfachere Baustandards. | 93 / 372 |
| `SPACE_FUNDING` | Passender eigener Text trägt die Forderung von Raumfahrtexperten im Bundestag nach stärkerer Finanzierung der bezeichneten Programme. | 79 / 316 |
| `SPAIN_FIRE_REPORT_VERSION` | Passender eigener Spanienbeleg ist an die tatsächlich angefragte 114er-Berichtsfassung gebunden. | 46 / 92 |

Originale: [Solinger Tageblatt](https://www.solinger-tageblatt.de/lokales/solingen/scheuren-ohne-anbindung-ausschuss-vertagt-entscheidungen-zur-wirtschaft-in-solingen-AAAOYZHQWZDZ7FSOO4JRGFCBGE.html), [RTL](https://www.rtl.de/news/bundesregierung-geheimer-sondergipfel-zu-rente-und-pflege-im-kanzleramt-id31335135.html), [ZEIT-Baukosten](https://www.zeit.de/wirtschaft/2026-07/wohnungsbau-baukosten-standard-preis-bundesregierung), [Table.Space](https://table.media/space/news/zivile-programme-forschungs-und-sicherheitsvorhaben-was-raumfahrt-experten-im-bundestag-fordern), [Deutschlandfunk, Fassung114](https://www.deutschlandfunk.de/waldbraende-bei-bordeaux-wieder-tausende-menschen-evakuiert-feuer-in-spanien-groesstenteils-unter-ko-114.html).

Jede tatsächliche betroffene Stelle ist individuell an Profil, Eingabe, Darstellung, Quelle, KO und Belegversion gebunden. In der neuen tatsächlichen Aufnahme erreichen die fünf Schließungen **323 unterschiedliche Profile**. **98 Profile** wurden aktuell zusätzlich aus der Union verbleibender Quellenlücken entfernt: **447→349**. Das ist Komponentenfortschritt; daraus folgt keine vollständige Profilannahme. Historisch erreichten die fünf Gruppen im älteren Run 38030910691 320 unterschiedliche Profile; 99 Profile wurden dort aus der Union entfernt: 447→348. SHA256 dieser historischen individuellen Transferquittung: `00c7e72957e071e1d268733258438c30ac5c6e998250bcc368cc57b013a818dd`.

Die bereits zuvor geschlossenen fünf Ursachen, darunter Stelle, wurden nicht neu geprüft. Gesamtstand: **10 von 13 geschlossen, drei offen**.

## Verbleibende externe Originalbeleggrenzen

| Gemeinsame Ursache | Fehlender Mindestbeleg |
| --- | --- |
| `ZEIT_BERLIN_HOUSING` | Die eigene erreichbare Überschrift beziehungsweise der Teaser nennt Berlin nicht und trägt die konkrete Berliner Mietenaussage nicht. URL-Slug und ein Bundesbeleg reichen dafür nicht. |
| `ZEIT_ISLAMISM` | Eine passende eigene kurze Passage für die erhaltene Aussage zur öffentlichen Stigmatisierungsdebatte fehlt. Die automatische Zusammenfassung ersetzt sie nicht. |
| `STERN_COURT_REPORT` | Kein unabhängig beschaffter passender eigener Gerichtsbericht. Der Quellenzugriff lieferte 402; eine passende eigene gecachte Überschrift fehlt. Zirkuläre Metadaten aus der Eingabe wurden als Schließungsbeleg verworfen. |

Für diese drei Fragen wurde kein positives Urteil erfunden. Ihr Mindestziel wurde weder verschärft noch abgesenkt. Weitere Production-Datenänderungen sind dafür nicht freigegeben.

## Neue vollständige Aufnahme und aktuelle individuelle Bilanz

[Run38036221630](https://github.com/ernisch/helmut-pilot/actions/runs/38036221630) wurde genau einmal nach V8-Nachkontrolle und Quellenentscheidung ausgeführt und im ersten Versuch erfolgreich abgeschlossen. Genau **500 Eingabeabrufe und zwei Identitätsprüfungen**, alle 500 inaktiven synthetischen Profile erfasst: 330 Bundestag, 120 Berlin und 50 Brandenburg. Keine weitere Production-Datenänderung, Profiländerung, Aktivierung oder kostenpflichtigen Helmut-Production-Modellaufrufe.

Workflow-Commit: `38d2ebc15dab27896dffabb3914c71f06e7cc538`. Gebundener tatsächlicher Production-Code: `236035d1c184e415234376e97b098a14f65dc06c`. Alle 28 nativen Workflow-Archive sind lokal vorhanden, zusammen 470.910.787 Bytes. Die Aufnahme ist kein transaktionaler Datenbanksnapshot und kein bezahlter 500er Funktionstest.

Alle **179.089 aktuellen Claimpositionen** sind vollständig mit ihren tatsächlichen Einzelprofilen und aktuellen Eingabe-, Darstellungs-, Quellen- und KO-Versionen gebunden. Die unabhängige Endentscheidung beurteilt sämtliche 500 Profile anhand aller acht Kriterien: Originalquelle und Kontext, Sachverhalt und berichteter Ereignisstand, Zeitbindung, Mandatsebene, Ereignisidentität und Mitglieder, notwendiges Profilszenario, tatsächliche Briefingeingabe und positive unabhängige Endabnahme.

| Kategorie | Aktuelle Profile |
| --- | ---: |
| Vollständig angenommen | 42 |
| Fehlender Beleg | 449 |
| Falsche Quelle | 0 |
| Falsche Ebene | 0 |
| Falsche Zeitbindung | 0 |
| Ereignisduplikat | 114 |
| Fachlich noch unentschieden | 1 |
| Leer | 0 |
| Unbrauchbar | 0 |
| Technisch fehlerhaft | 0 |
| Nicht erfasst | 0 |
| Inhaltlicher Widerspruch | 0 |

Die Fehlerkategorien überlappen; ihre Zahlen dürfen nicht addiert werden. **458 Profile sind noch nicht vollständig angenommen.** Ein fehlender Originalbeleg ist kein Beweis einer falschen Aussage oder Zeitbindung. Das endgültige Urteil verwendet konkrete tatsächliche Quellen-, Klausel- und Ereignislücken; nicht ausgefüllte historische Flags erzeugen keine Ablehnung.

SHA256 der vollständigen aktuellen Fachbilanz: `b700a74106be6bc8e5c4202fce3a00feb7ef7b853b134fb9b61e43ef0f343dd3`. Alle 500 finalen individuellen Urteile und ihre vollständigen Eingabebindungen liegen in der privaten Belegakte. Sie verändern die eingefrorene Eingabe- und Komponentenaufnahme nicht.

Die drei ursprünglichen offenen Originalfragen betreffen Berlin 286, Islamismus 9 und Stern 84 Profile; ihre Union ist **349**. **151 Profile enthalten keine dieser drei Lücken** und wurden deshalb nicht als falsche Quelle bezeichnet. Das hebt andere konkret sichtbare Beleg- oder Ereignislücken nicht auf.

Die vollständige tatsächliche Prüfung der **400 unterschiedlichen Kartenfassungen** mit allen **20.557 aktuellen Kartenpositionen** beurteilt gemeinsame Ereignisvarianten einmal und bindet sie danach an jedes tatsächlich betroffene Profil. Neben den 92 MEKO-Kartenpaaren, dem Ankara-Teilnahmepaar, dem doppelten Bundesrats-Billigungsmitglied und den drei GKV-Berichtspaaren sind die konkret passenden VW-Rückruf- und Litauen-Episoden, das gleiche jährliche BKA-Lagebild, die wiederholten Remagen-Teilmitglieder und derselbe jährliche Sozialabgabenentwurf originalgebunden beurteilt. Die überlappende aktuelle Union beträgt **114 Profile**. Ein allgemeines Haushaltsthema wurde anhand seiner unterschiedlichen berichteten Verfahrensakte ausdrücklich als getrennt beurteilt. Vollständige Gesetzgebungsfolgen werden nicht zu einem Bundesratsereignis zusammengelegt. Der spätere Bundestagsbeschluss im GKV-Verfahren bleibt vom Gerichtsbeschluss getrennt. Gemeinsame Akteure oder Themen allein beweisen keine Ereignisgleichheit.

Genau **ein enger Ereignisvergleich bleibt offen**: Der einmalige eigene Kreiszeitungszugriff trägt keine konkrete Verbindung des Hafenzubringer-Berichts zum gesondert berichteten Karin-Logemann-/Olaf-Lies-Schreiben. Die gleiche Partei, Straße oder der gleiche Tag reichen dafür nicht. Diese tatsächliche externe Grenze wird erhalten; kein Duplikat oder positives Identitätsurteil wird erfunden. Die vorangegangenen 09:42-Urteile bleiben unverändert gesichert. Die neue Ergänzung enthält 113 aktuelle Einzelurteile und 387 unveränderte historische Einzelreferenzen, zusammen sämtliche 500 tatsächlichen Profilbindungen.

Konkrete Originalbeleglücken außerhalb der drei ursprünglichen Fragen wurden ebenfalls auf sämtliche tatsächlichen Profile übertragen:

| Beleglücke | Aktuelle Profile / Stellen |
| --- | ---: |
| Behauptetes Publikationsjahr Städtetag / IG Metall | 92 / 54 Profile; überlappende Union 128 |
| Kleebank: zusätzliche berichtsweite Abwesenheit weiterer Maßnahmen/Folgen | 16 / 32 |
| Phoenix: zusätzlich behauptete Live-Eigenschaft | 136 / 272 |
| Griechenland: zusätzliche nicht belegte Abwesenheitsklausel | 115 / 230 |
| Diener: als abgeschlossen dargestellter Fraktionsbeitritt | 13 / 26 |
| IG Metall Unterelbe: passender eigener Artikel zum konkreten Titel | 63 / 252 |

Die beiden Jahreslücken sind fehlende Originalbelege, kein bewiesenes falsches Datum. Kleebanks Einweihung ist positiv belegt; die Zusatzklausel wird davon nicht automatisch getragen. Beim Diener-Bericht trägt die eigene Überschrift den berichteten Wechsel, während Teaser und verknüpfte Überschrift die Aufnahme noch als bevorstehend beschreiben. Nur der abgeschlossene Status bleibt offen; eine vollständige Audioaufnahme wurde nicht verlangt. Phoenix-Stream-Einbettung ist belegt, die zusätzliche Live-Eigenschaft bleibt offen. Andere regionale IG-Metall-Artikel mit gleichem Wortlaut ersetzen den konkreten Unterelbe-Artikel nicht.

Das zusätzlich einmalig beschaffte passende eigene [SZ-BKA-Original](https://www.sueddeutsche.de/politik/organisierte-kriminalitaet-deutschland-rekordschaden-li.3547405) trägt die konkret berichtete Verjüngung bereits in der Überschrift. Der eigene Publikationsheader von September 2026 und die kurze Vorjahrespassage binden das Lagebild an 2025; der vorhandene Deutschlandfunk-Beleg berichtet denselben jährlichen Stand. Damit sind sämtliche **101 tatsächlichen BKA-Profile mit 202 Summary- und 202 Titelvorkommen** positiv an dieses Mindestziel gebunden. Eine unabhängige tatsächliche Prüfung der **20 dadurch zusätzlich freigewordenen Profile und aller 7.188 Claimstellen** bestätigt den vollständigen Original-/Faktenumfang; mit den übrigen Teilprüfungen und der unabhängigen Acht-Kriterien-Entscheidung sind diese 20 vollständig angenommen. Der Bericht wird als berichtete Aussage belegt; eine zusätzliche statistische Weltprüfung wurde nicht verlangt. Der frühere BKA-Schreibplan ist damit fachlich überholt und bleibt ausschließlich als nicht ausgeführter historischer Entwurf erhalten. Der getrennt einmalig ergänzte eigene [SZ-Beitragsheader](https://www.sueddeutsche.de/politik/beitraege-rentenversicherung-krankenversicherung-deutschland-li.3551762) bindet den noch beschlusspflichtigen jährlichen Entwurf an 2027 und schließt dessen engen Ereignisvergleich.

Für die tatsächlich notwendigen verbleibenden Kerne wurden vorhandene Originale zuerst verwendet und nur passende eigene Überschriften, Teaser oder kurze Passagen ergänzt: Lechners Kurswechselforderung nach den Kommunalwahlen, die Transparenzkritik im Forschungsausschuss und der Uedemer Umkleiden-/Förderprogrammkern sind dadurch positiv belegt. Der Uedemer Originalbericht ist auf FuPa ausdrücklich RP/Michael Beenen zugeschrieben und passt in Inhalt und Publikationsdatum; für die zurückhaltende Lokalmedien-Aussage war kein technischer Crosslink zu einem historischen HTML-Dokument nötig. Der vorhandene Kleebank-Einweihungsbeleg wurde wiederverwendet. Kein breiter neuer Quellenlauf und keine Wiederholung der drei extern blockierten Fragen. Die begrenzten Originale sind [ZEIT/Lechner](https://www.zeit.de/news/2026-09/14/cdu-chef-lechner-fordert-kurswechsel-der-bundesregierung), [Table/Forschungsausschuss](https://table.media/research/analyse/forschungsausschuss-warum-die-opposition-die-regierungsarbeit-als-intransparent-kritisiert), [RP-Bericht auf FuPa/Uedem](https://www.fupa.net/news/umkleidekabinen-des-uedemer-sv-sollen-erneuert-werden-3195320), [openPR/Kleebank](https://www.openpr.de/news/740149/Bezirksbuergermeister-Kleebank-weiht-Baum-der-Erinnerung-ein.html) und [NDR/Diener](https://www.ndr.de/nachrichten/mecklenburg-vorpommern/ex-cdu-landtagsabgeordneter-thomas-diener-tritt-in-afd-fraktion-ein,audio-3322848.html). Eigene Überschrift und Teaser werden dabei mit ihren tatsächlichen Grenzen bewertet; die NDR-Verlinkung schließt die abgeschlossene Statusklausel nicht.

Die letzte fachliche Restprüfung beurteilt **55 Profile und alle 19.771 tatsächlichen Claimstellen** vollständig. **22 Profile** erfüllen alle erforderlichen Original-, Fakten- und Kontextkriterien und erhalten mit den anderen vollständigen Teilprüfungen die unabhängige Gesamtannahme. **33** enthalten eine der fünf konkreten zusätzlichen Klausel-/Artikelgrenzen. Insgesamt wurden **152.947 tatsächliche Stellen** an gemeinsame exakte Mindestentscheidungen gebunden. Quelle, Text, Rolle und vollständige KO59-/Source19-Version bleiben dabei erhalten; keine Stichprobe und kein pauschaler Metadaten-PASS.

Vorhandene positive fachliche Komponenten wurden zusätzlich tatsächlich übertragen: 69 bereits belegte Quellenvarianten auf 23.180 aktuellen Stellen, 36 Originalidentitätskomponenten auf 29.378 Stellen und 19 exakt wiedergegebene belegte Sätze auf 2.622 Stellen. Diese Komponenten können überlappen. Eine Originalidentität beweist nicht automatisch jede Aussage des Artikels; ein belegter Satz beweist nicht eine zusätzliche ungestützte Klausel. Bereits vorhandene positive Komponenten wurden nicht wegen generischer historischer `false`-Defaults verworfen.

Die unabhängige tatsächliche Rollenprüfung beurteilt alle 500 Profile mit ihren deklarierten Szenarien einzeln: **48 verschiedene Kontextformulierungen auf 52.287 aktuellen Stellen**, **20.557 Karten**, davon 20.483 `Ignorieren` und 74 `Beobachten`. Alle 42 zuvor ausdrücklich notwendigen individuellen Landes-Policy-Ziele sind tatsächlich vorhanden. Die tatsächlichen regionalen und thematischen Zusammenhänge, benannten Akteure, Bedingungen und vorgeschlagenen Handlungen wurden beurteilt. Positive Teilurteile bestätigen den begrenzten Mandats-, Akteurs- und Modalitätsumfang; eine Ausschussmitgliedschaft, exekutive Befugnis, Elternpflicht oder verpflichtende Tagesaktion wird daraus nicht erfunden. Für eine Hintergrund-/Ignorieren-Karte wurde keine zusätzliche persönliche Priorität verlangt. Die ruhige Tageslage aller 500 ist mit dem bestehenden Prüfvertrag vereinbar.

Die vollständige unabhängige Acht-Kriterien-Entscheidung ist abgeschlossen: **42/500 vollständig angenommen**, mit konkreten offenen Gründen für die übrigen Profile. Positive Einzelkomponenten wurden weder als automatisches Gesamturteil verwendet noch wegen generischer historischer `false`-Defaults verworfen. **Blocker 2 ist erst bei 500 vollständig fachlich angenommenen Profilen erfolgreich abgeschlossen.**

## PR, Deployment und Sicherung

[PR #888](https://github.com/ernisch/helmut-pilot/pull/888) wurde bei unverändertem ausdrücklich freigegebenem Kopf `b36a2e72e583192b9cfa72943e3de64d74d08f49` und grünen Pflichtprüfungen gemergt. Squash-Commit: `38d2ebc15dab27896dffabb3914c71f06e7cc538`. Der reguläre Doku-Deploy wurde gemäß dem Ignore-Vertrag bewusst übersprungen; es wurde kein neues Runtime-Deployment behauptet. Production bleibt am bestehenden READY-Deployment `dpl_2jEqjy2GGbpGWF2TD4L6kjZBjwba` und dessen Commit `236035d1c184e415234376e97b098a14f65dc06c` gebunden.

[PR #889](https://github.com/ernisch/helmut-pilot/pull/889), aktueller Kopf `867443456d6f477ed1e807794a7e4311dc8c4dd2`, bindet den überholten n-tv-MEKO-KO59-Pin an die genaue belegte V8-Nachherfassung und ergänzt ausschließlich die fachlich bewiesenen Ankara-, GKV-, VW-, Litauen-, BKA- und Sozialabgaben-Gruppen; zusammen sieben ganze Ereignisgruppen. Jede vollständige KO59- und Source19-Menge bleibt exakt gebunden; fehlende, zusätzliche, doppelte oder geänderte Quellen/KOs erhalten die ursprünglichen Einzelkarten. Sämtliche Mitgliedertexte und Quellenzuordnungen bleiben erhalten. Die unabhängigen gültigen Gruppen behindern einander nicht.

Die gezielten neuen Ereignisgruppen-Fallgruppen und erforderlichen Syntax-/Diffprüfungen sind bestanden. Die begrenzte Offline-Adapterprojektion erhält sämtliche 500 vorhandenen Eingabebindungen: **109 Profile mit Gruppierung**, **391 Ausgaben unverändert**. Die letzte Sozialabgaben-Ergänzung berechnet ausschließlich den einen tatsächlich betroffenen vorhandenen Rawbody neu und übernimmt die 499 unveränderten früheren Projektionen exakt. Die zuvor ergänzten zwei BKA-Paarprofile behalten ihren gebundenen Nachweis. Alle 500 Tagesköpfe bleiben quiet. Die beiden engen Bundesrats-/Remagen-Teilmitgliedsfälle werden im separat darauf gestapelten PR890 umgesetzt; die ganzen Verfahrensfolgen werden nicht zusammengeführt. Diese Codebereitschaft verändert keine aktuelle Production-Ausgabe und ersetzt keine vollständige Briefing-Regeneration oder fachliche Profilannahme. **PR889 ist nicht gemergt.** Die ausdrückliche Freigabe seines konkreten Kopfes bleibt erforderlich.

Beide Pflichtprüfungen am unveränderten aktuellen Kopf von PR889 sind terminal erfolgreich: `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`, [CI-Run38044743258](https://github.com/ernisch/helmut-pilot/actions/runs/38044743258). Die CI ordnet den Diff gezielt dem Briefing-Bereich zu; der erfolgreiche Browser-Gate-Status bezeichnet hier das erlaubte Überspringen eines nicht erforderlichen Browserlaufs. Die früheren Ankara-, GKV-, VW-/Litauen- und BKA-Köpfe samt ihren eigenen Quittungen bleiben historische Zwischenstände.

[PR #890](https://github.com/ernisch/helmut-pilot/pull/890), Kopf `8dfaf0759a59c2ce9dbe5a4e280d80b4487aa237`, baut auf dem genannten finalen PR889-Kopf auf. Er ergänzt ausschließlich die beiden exakt belegten Bundesrats-/Remagen-Teilmitgliedsverträge und erhält die übrigen Verfahrensmitglieder mit ihren vollständigen Texten und Quellen. Bestehende ganze Ereignisgruppen behalten ihren bisherigen Auswahlumfang. Fehlende oder doppelte sichtbare Item-Identitäten führen weiterhin zu den ursprünglichen Einzelkarten. Bei fehlender oder nicht arrayförmiger `items`-Struktur wird auch das gesonderte Gesamturteil strukturiert zurückgewiesen (`briefing-gesamtpruefung-veraltet`) statt eine Ausnahme auszulösen.

Die gezielten lokalen Scope- und Darstellungsprüfungen sowie sechs aktuelle Einzelprojektionen sind bestanden. Der ursprüngliche Zwischenkopf `23de3b77` scheiterte ausschließlich am 30.000-Zeichen-Limit des damaligen `CURRENT_STATE`; sein Fehlernachweis und die bereits erfolgreiche damalige Browserprüfung bleiben unverändert historisch gesichert. Der kleine Größen-/Strukturguardfix ist im genannten neuen Kopf enthalten. Die tatsächliche Desktop-/Mobile-Chromium-DOM-Prüfung und beide Pflichtchecks sind im [CI-Run38046725432](https://github.com/ernisch/helmut-pilot/actions/runs/38046725432) am genauen neuen Kopf erfolgreich abgeschlossen. Das schließt die Standard-Offlinesuite einschließlich Größenfall und die Bereichsregression ein. Die tatsächlichen terminalen Ergebnisse und der vollständige neue Browserlog werden über GitHub-Checks und die finale private gemeinsame PR-Akte gebunden.

Die inkrementelle technische Zusammensetzung erhält sämtliche 500 aktuellen Eingabebindungen: **114 Profile mit Gruppierung**, **386 ohne diese Gruppierung**. Genau sechs bereits erfasste Eingaben wurden lokal neu projiziert; 494 individuelle Referenzen aus dem finalen 109er Contribution-Stand bleiben erhalten. Die technische 114er-Union ist von den **42 vollständig fachlich angenommenen Profilen** getrennt. Es gab keine neue 500er-Aufnahme oder vollständige Wiederholung des Adapterlaufs. **PR890 ist nicht gemergt**; sein konkreter Kopf braucht eine ausdrückliche Freigabe und die gestapelte PR889-Abhängigkeit bleibt bestehen. Beide Code-PRs verändern bisher keine aktuelle Production-Ausgabe und keine fachliche Einzelbilanz.

Für **sechs weiter notwendige Datenkorrekturen** sind exakte private Transaktionspläne vollständig vorbereitet: zwei begrenzte Jahresklauseln und vier zusätzliche Phoenix-/Kleebank-/Diener-/Griechenland-Klauseln. Sie betreffen ausschließlich die jeweiligen Zusammenfassungsfelder und binden Tabellen und Datensätze, vollständige Vorher-/Nachherwerte, Originalbelege, Schutzbedingungen, Wirkung, Risiko, Nachkontrolle, Rückweg und Transaktionshash. Die aktuelle Vereinigung erreicht **259 sichtbare Profile und 852 Summary-Stellen**. Die ursprünglich sieben vorbereiteten Änderungen mit 301 sichtbaren Profilen und 1.054 Stellen bleiben historisch vollständig erhalten; der eine BKA-Entwurf ist durch den neuen eigenen Originalbeleg überholt und soll nicht ausgeführt werden. **Keine dieser zusätzlichen Korrekturen ist ausgeführt.** Sie schließen weder den extern unbelegten Unterelbe-Artikel noch die drei ursprünglichen externen Quellenfragen automatisch. Eine neue konkrete Production-Freigabe und frische native Vorherprüfung bleiben erforderlich; keine neue Migration oder Profiländerung.

Der frühere vollständige private Drive-Belegbestand ist gesichert und rückgelesen:28 Original-Workflow-ZIPs sowie die 669-Dateien-Belegakte und ihr separat freigegebener Wiederherstellungsindex. Diese frühere Akte belegt die damalige Aufnahme, nicht die später ausgeführte V8-Transaktion oder die neue Nachaufnahme. Neue native Quittungen und individuelle Transferbelege liegen privat außerhalb vonGit vor; ein neuer Drive-Upload ist bisher nicht erfolgt. Rohprofile, SQL-Zeilenwerte, Zugangsdaten, Schlüssel und private Beleginhalte gehören nicht in dieses öffentliche Dokument.

Das neue private Belegarchiv und der zugehörige Wiederherstellungsindex werden vorbereitet. Nach Einfrieren dieses Dokumentationskopfs folgt die vollständige lokale Wiederherstellung der neuen Native- und Fachbelege. Der abschließende private Index weist den tatsächlich danach erreichten Sicherungs- und Wiederherstellungsstand aus. Das ist keine Freigabe für einen neuen Upload. Zum Zeitpunkt dieses Dokumentationsstands sind ein neuer Server-Upload, vollständiges Server-Rücklesen oder ein neuer erfolgreicher Server-Wiederherstellungsnachweis nicht belegt.

Die aktuelle reine Dokumentationsvorbereitung verändert kein Produktverhalten. Keine Migration, neue Umgebungsvariable, Azure-Änderung, externe Nachricht oder Profilaktivierung. Weitere PRs werden vor einem Merge an ihrem konkreten Kopf ausdrücklich freigegeben; die Freigabe von PR888 deckt sie nicht ab.
