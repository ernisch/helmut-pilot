# Blocker 3: endgültige Eingabeabnahme und Kostenvertragsgrenze

Stand 11.10.2026; geprüftes `main` `e3eeaca1fc733c88b0b43075d0b25330001bbf64`.
**Blocker 2 ist abgeschlossen. Blocker 3 ist noch nicht abgenommen.** Die finale
fachliche Abnahme wird übernommen, nicht wiederholt. Keine Budget-, Reserve-,
Production-Konfigurations- oder Aufrufgrenzenänderung; kein bezahlter
Production-Modellaufruf. Ein rein lesender DeepSeek-Flash-High-Helfer prüfte
die Aufrufpfade; das ist getrennte Codex-Entwicklungsarbeit.

## 1. Ausschließlich final übernommene Aufnahme

[Finale Blocker-2-Abnahme](blocker2-abschluss-20261011.md):
[Run38102593796](https://github.com/ernisch/helmut-pilot/actions/runs/38102593796),
Workflow/Runtime `6cdaa1cd3cdf16b9e5d18cb9add267583a730292`, Deployment
`dpl_8xGYus2BL4TSy4cgrD18jZDBDHPv`, Berliner Tag 11.10.2026. **500/500
fachlich angenommen, 180397 Claims, 4000 positive Einzelurteile, 42 erhaltene
Pflichtbindungen.** Die Publikationsauswahl ist an
`274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04` gebunden.

Der vollständige finale [Bankindex](https://drive.google.com/file/d/1JvFIzUoYE7clh1Vff1pZbnOyzEplTnv2/view)
wurde nativ gelesen: 91451 Bytes, SHA256
`9f752c423967833367c0471b78be50e458b0334bde29768d52c1b055360461ad`.
Das [Abschluss-Kontrollbundle](https://drive.google.com/file/d/1LU9Dr6FhjrNQn_cA0bKcnYwAf8Nk0rgb/view)
wurde vollständig gelesen und gehasht: 8540 Bytes,
`edccedd369a0e76b890cc7313228b1f7c878a1e12b61094e995dfa6e74fd32a3`.
Die darin bytegenau erhaltene endgültige Root-Abnahme
`74175988639291cfb86d50e149c98f55f79df3288bb8f091335ef5c3ad32557c`
schließt auch das vorher im Index noch offene Upload-/Rücklesetor. Das alte
`overallBlocker2Complete:false` im vor diesem letzten Schritt erzeugten Index
ist kein aktuelles negatives Fachurteil.

Alle 28 nativen GitHub-Aufnahme-ZIPs des finalen Runs wurden wiederhergestellt:
ZIP-Größen und GitHub-Digests, RSA-/GCM-Kontext, 500 eindeutige Positionen,
Commit/Tag, HTTP200 und vollständige Originalkörperhashes geprüft. Der finale
Aufnahmemanifest meldet `phase:final`, `collectionCompleted:true`, 500 erfasst.
Seine damaligen Fachfreigaben bleiben unverändert; die spätere Root-Abnahme
ist die Fachautorität. Keine neue Aufnahme und keine erneute Fachprüfung.

Schlüssel, vollständige Originale, Tokenzeilen, Wiederherstellung und
Rechenprogramme liegen unter `/workspace/private/blocker3-20261011` außerhalb
von Git. Die bereits erfolgte vollständige Bankprüfung wird übernommen; B3
hat nicht erneut alle 36 Shards fachlich geprüft. Shard36 wurde zusätzlich
hash-/GCM-authentisiert gelesen, um die gebundenen Übergabeprotokolle zu übernehmen.
Frühere Aufnahmen und Zahlen vom 09.10. sind ausschließlich historische Belege.

## 2. Messwerte und tatsächliche D-Transportgrenze

Die native Quellenprojektion und Prompt-/Schemabauer wurden offline verwendet.
Die Artikeladressen entsprechen der übernommenen Eingabebindung; keine neuen
Quellen, Auszüge oder positiven Fachurteile wurden erzeugt. HTTP/fetch sind im
Messprogramm gesperrt. Gemessen wurde `o200k_base`, tiktoken0.12.0; vollständiger
Vokabularhash
`446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`.

| Größe der finalen 500 Eingaben | Summe | Minimum / Median / Maximum |
| --- | ---: | --- |
| Vollständige Aufnahme-HTTP-Körper, Bytes | 2263061779 | 4467209 / 4524171 / 4724561 |
| Fachlicher Eingabe-DTO, Bytes | 252962850 | 485770 / 505221,5 / 528512 |
| Fachlicher Eingabe-DTO, lokale Texttokens | 86655211 | 168111 / 173157 / 179181 |
| D-Prompt, Bytes | 6491692 | 12132 / 12888 / 13420 |
| D-Prompt plus Transportschema, lokale Tokens | 1757807 | 3229 / 3466 / 3661 |
| D-Request-JSON, Bytes | 7298282 | 13698 / 14489 / 15056 |
| D-Request-JSON, lokale Texttokens | 1826213 | 3358 / 3602 / 3801 |

**Diese D-Summe enthält 32 leere Quellenprojektionen.** Die 468 nichtleeren
Projektionen enthalten zusammen **1654411 Prompt-/Schematokens**. Der volle
fachliche DTO mit 86,66 Mio. Tokens ist nicht der D-Anbieterrequest und darf
nicht als dessen abgerechnete Tokenmenge verwendet werden. Ebenso ist die
Tokenisierung des HTTP-JSON nicht die Anbieterabrechnung: Feldnamen,
Schemaverpackung und unsichtbare Anbieterränder werden anders verarbeitet.
Eine Framingzugabe von256 ist eine Rechenannahme, keine belegte Obergrenze.

Die abgeschlossene Fachabnahme belegt 500 Briefing-Eingaben. Der direkte
Sender verwendet daraus zusätzlich `briefing-lagebindung.pruefe`,
`lage-quellenbeleg.baueEingabe` und `lage.buildLageBriefing`. Im unveränderten
14-Tage-Codefenster am gebundenen Aufnahmezeitpunkt ergeben folgende
Positionen keine D-Quellen:

`6,12,84,95,100,108,132,134,151,156,159,164,196,201,204,228,276,292,300,313,342,350,374,388,399,414,420,430,439,460,468,487`.

Die frische Projekt-Env-Inventur enthält keinen
`HELMUT_BRIEFING_RELEVANZ_TAGE`-Override. Das ist Projektkonfiguration, kein
zusätzlicher nativer Lauf auf dem Deployment. `lage.js` beendet eine leere
Quellenprojektion vor D mit `no-current-sources`; der Direktadapter verlangt
`available:true`. Alle32 Positionen ergeben auch ohne Safety-Filterung keine D-Quellen; dies
wurde mit dem nativen Quellenprojektor separat offline bestätigt. Ein größeres Budget ersetzt diesen
Input nicht. Die schon angenommene Fachmatrix bleibt unverändert gültig für
ihren erklärten Scope. B3 korrigiert keine Quellen, Auslassungen oder Zeitfilter
und erklärt B2 nicht wieder für offen.

**Verbleibende externe Übergabe:** 500 fachlich übernommene, zugleich nichtleere
und gültig an diesen direkten D-Sender gebundene Kontexte beziehungsweise ein
belegter zulässiger Übergabevertrag, der die obige Abweichung schließt. Für die
32 Positionen sind die Körper-/DTO-Hashes im privaten Tokenzeilenbeleg erhalten.
Erst diese Bindung ist eine Grundlage für den vollständigen finanzierbaren Lauf.
Private Messzeilen-SHA256:
`6c1845249d03f5af933da18c9e4ae8a2afa66c1ff8f77efdeeb593c160d0ddd4`.

## 3. Aufrufe und endgültig zulässiger Prüfmodus

| Pfad | Menge für den vollständigen Direktlauf | Verbindlichkeit |
| --- | ---: | --- |
| D: neuer Lageentwurf je Profil | 500 | Genau500 Sollpositionen; keine vorzeitigen Skips als Vollnachweis zählen |
| R: Quellen-/Mandats-/Paarprüfung je neuem D | 500 | Ein Request prüft alle2–4 Absätze und bis zu6 Absatzpaare gemeinsam |
| U: neue Understanding-Vorbereitung | 0 | Für den unverändert eingefrorenen übernommenen KO-Bestand: gewählte KOs vollständig verstanden; Direktcommand verlangt leere U-Liste |
| Morgen-/Mandatsansicht, Retention, Bilanz | 0 neue Production-Modellaufrufe | Modellfreie direkte Nachbereitung, drei Ergebnispositionen je Profil |
| Retries, Reparaturen, Büro, Embeddings, Backfill | 0 | Kein solcher Pfad Bestandteil dieses einzelnen Directcommands |

**1.000 geplante Production-Modellaufrufe, keine gestarteten.** U=0 ist aus dem
Direktpfad und vollständigem übernommenem KO-Zustand abgeleitet, kein neu
erfundener Blocker-2-Abnahmeeintrag. Diese0 gilt nicht für einen später veränderten
Quellen-/KO-Bestand. Vorzeitiger D-Abbruch beziehungsweise vor R verworfener
Entwurf reduziert tatsächliche Calls, erfüllt aber keinen vollständigen500er Lauf.

Für diesen Plan gilt der vorhandene Standard: D3000/low, R3000/low, jeweils
Outputcap **einschließlich Reasoning**, Attempt1. `ai.js`, `lage.js` und
Reviewreceipt unterstützen zusätzlich R6000/medium unter dem gebundenen
Prüfaufwandmodus; die `beforeReview`-Bedingung wird von `lage.js` gesetzt.
Die finale B2-Abnahme verlangt keine solche Erweiterung. Sie wird nicht
still eingerechnet oder als freigegeben behandelt. R besitzt keinen weiteren
bezahlen Request pro Absatzpaar.

Die gesonderte unabhängige Endprüfung bleibt erforderlich. Sie wiederholt den
Production-Lauf nicht. Ihr konkretes Verfahren ist vor dem Test festzulegen:
eine unabhängige Prüfinstanz kann ohne zusätzliche Production-Modellaufrufe
prüfen; ein zusätzlich beauftragtes bezahltes Prüfmodell braucht eine eigene
endliche Aufruf-/Kostenbilanz. Die1000 sind die vollständige Production-
Senderinventur dieses Directcommands, keine Behauptung, dass eine noch nicht
gewählte externe Prüfung kostenlos sei.

## 4. Kostenrechnung, Reserve und entscheidbare Grenzen

Frische native Kostenlesung **2026-10-11T07:35:29.983Z**:
Version4, Auftrag `autonom-bis500-20260926`, ab25.09.2026, Grenze20USD.
Native Auftragskosten1,614061USD + bereits enthaltener externer Anteil5,195303USD
= **6,809364USD**, native offene Auftragsreserve0. Ungeklärte zusätzliche private
Reserve **0,636000USD** bleibt vollständig gebunden: **7,445364USD**.
Kein Überlappungsbeleg, keine Freigabe, keine doppelte Addition des externen
Anteils. Finanz-JSON-MD5 `a9297ea47babf3c9903257df726c547f`, Authrevision476643.
Alle historischen15 offenen Reserven/3,176USD bleiben erhalten; diese globale
Historie ist kein zusätzlich noch einmal zu addierender vollständiger Auftrag.

Preisvertrag unverändert:0,50USD/Mio. Eingabetokens und4USD/Mio. Ausgabetokens.
Pro Call in Mikro-USD: `ceil(inputTokens/2 + 4*outputTokens)`, dann summieren.
Vor jedem Standardcall volle Reserve **0,212USD** für400000 Input/3000 Output;
R6000 hätte0,224USD. Reserve ist keine erwartete Rechnung.

Seien `c_i` die jeweiligen abgesicherten oberen Callkosten und `r_i` die
technischen Reserven. Der kleinste aus diesen Callobergrenzen ableitbare
benötigte Ablaufrahmen ist
`H=max(sum(c_i), max_i(sum(c_1..c_(i-1))+r_i))`.
Für einen isolierten neuen UTC-Tag mit ungeklärter privater Tageszuordnung:
**Tagesrahmen ≥ Tagesaltbestand +0,636USD+H**;
**Auftragsrahmen ≥7,445364USD+H**. Bei Überlappungsnachweis nur exakt belegte
Doppelpositionen entflechten, keine Reserven löschen. Altbestand frisch binden.

Die aktuellen Antworten und damit tatsächliche R-Eingaben existieren vor D
noch nicht. Der Reviewer nimmt die2–4 Absätze und nur ihre gewählten Quellen,
das Profil, Prüfregeln und Schema. Die gemessenen leeren R-Prompttemplates haben
2723–2728 Tokens, das R-Schema720; die gesamten verfügbaren Quellenprojektionen
haben1–359 JSON-Texttokens. Diese Teile sind keine vollständigen R-Anbieterinputs
und ihre Summe ist keine harte Tokenobergrenze. Der250-Wörter-Vertrag allein
begrenzt nicht die Zeichenlänge eines beliebigen Einzelworts.

Die Route führt272000 maximale Eingabetokens und400000 Kontext-/Reservetokens
als Metadaten. Im Budgetpfad fehlt eine entsprechende lokale vollständige
Anbieterinput-Tokenzählung vor Sendung. Die kleinste belastbare Budgetfreigabe
braucht deshalb zulässige500 D-Kontexte **und** eine gebundene, technisch
durchgesetzte D/R-Inputobergrenze einschließlich Anbieterverpackung. Ein frei
angenommener R-Wert5000 oder Framing256 ersetzt das nicht.

Das [maschinenlesbare Kostenblatt](blocker3-kostenblatt-20261011.json) erhält
Erwartungswert, minimale vollständige Kostenobergrenze und benötigte endgültige
Budgets ausdrücklich als `null`. Bereits entscheidbar:

- **6USD/Tag ist keine Vollgarantie:**1000 erlaubte3000er Outputcaps ergeben
  allein12USD; Eingangskosten, Reservevorlauf und private Bindung kommen hinzu.
- **20USD kumulativ ist keine Vollgarantie:** übrig12,554636USD. Schon die
  erlaubten12USD Output plus konservativ tarifierte D-Prompt-/Schematokens
  überschreiten diesen Rest; R und Reservevorlauf sind dann noch nicht enthalten.
- Die generische volle Input-/Output-Reservehülle wäre212USD (mit erweitertem
  R218USD). Das ist weder erwartete Ausgabe, gleichzeitig gebundene Reserve
  noch die kleinste aus gültigen tatsächlichen Inputs ableitbare Kostenobergrenze.
  Eine pauschale Budgeterhöhung auf diese Hülle wird nicht beantragt.

Nur zur Sensitivität, **keine freigabefähige500er Rechnung**: mit den finalen
500 Projektionen, angenommenem D-Framing256, R-Input5000 und je500 Outputtokens
ergibt sich4,193032USD, H4,400532USD, Tagesbedarf5,036532USD und kumulativ
11,845896USD. Bei je1000 Outputtokens bereits Tagesbedarf7,034532USD; bei
vollen3000er Caps und denselben Inputannahmen Tagesbedarf15,026532USD und
kumulativ21,835896USD. Alle Outputs schließen Reasoning ein. Diese Annahmen
sind keine B2-Endwerte und schließen die32 leeren Kontexte nicht.

## 5. Widerspruch20/7/6: tatsächlicher Weg und kleinster sauberer Fix

| Stelle | Akzeptierte Grenze | Tatsächliche Wirkung |
| --- | --- | --- |
| `testkosten-budget.js`, AuftragVersion4 | 20 kumulativ /6 pro UTC-Tag | Vor Start und jeder Geldreservierung im CAS wirksam; Altbestand zählt |
| `synthetik-500-vertrag.js` | 7 oder20 /6 | Profil-/Startvertrag akzeptiert20 |
| `synthetik-500-production-adapter.js` | gespeicherter20-Auftrag /6 | Liest/prüft Auftrag vor Installieren/Start/Unit/Sendung |
| `synthetik-500-kosten-intents.js`, `synthetik-500-kosten-plan.js` | weiterhin7 /6 in Inventurmetadaten | Kein zusätzlicher7-USD-Sendercheck; Admissionprojektion trägt dieses money-Objekt nicht weiter |
| `synthetik-500-kosten-admission.js` | Route, Request/Hash, Tickets | Übernimmt nicht selbst einen gemeinsamen7/20-Endkostenvertrag |
| `synthetik-500-nachweis.js` | strikt7 kumulativ /6 pro UTC-Tag | Kostenendcheck übernimmt20 aus dem Auftrag nicht |
| Dokumentierter01.10.-Auftrag/Roadmap | weiterhin7 /6 | Kein späteres Direktlauf-Kosten-GO dokumentiert |

Bei erfüllten anderen Starttoren wäre **am Sender20/6**, am Endvalidator
**7/6** wirksam. Heute verhindern außerdem fehlende Tagesbücher und der
beschriebene D-Inputabgleich einen vollständig belegten Start. Eine ehrliche
Endbilanz mit der erhaltenen7,445364USD-Bindung **scheitert zwangsläufig am
7-USD-Endkostencheck**, bereits ohne neue Calls. Weglassen der privaten Reserve
oder Rücksetzen des Auftrags ist kein zulässiger Ausweg.

Kleinster sauberer Änderungssatz nach belastbarer Dimensionierung und GO:
**ein geschlossener, versionierter Direktlauf-Vertrag**, der Auftrag/`abTag`,
vollständigen Altbestand/private Zusatzbindung, exakt500/1500, Calls/U/Prüfmodus,
Preis-/Input-/Outputobergrenzen, Planfenster, Lauf/Operation, Commit/Deployment
und Freigabeoriginal bindet. Derselbe Vertrag und Hash laufen durch Kostenplan,
Admission-Slot, Command, atomare Geldreservierung, Sender und Endvalidator;
fehlende Bindung oder Drift stoppt. Private Bindung auch im CAS zählen, bei
ungeklärtem Tag gegen Tagesrest. Legacy7-Verträge bleiben erhalten.

**Nur7→20 im Endvalidator reicht nicht:** Sender-/Planhashscope und private
CAS-Bindung blieben offen;20/6 trägt die zulässigen vollen Standardoutputs nicht
belastbar. Die historische20/6-Vorlage vom07.10. ist deshalb keine aktuelle
Empfehlung für den vollständigen Lauf. Weder diese noch eine größere Grenze
wurde hier angewendet. Das bisherige20-USD-Vorbereitungsoriginal ist kein500er GO.

## 6. Globaler Aufrufdeckel

Code-Fallback bleibt50. Die historischen2416/702/200-Befunde vom19./20.09.
bleiben in der [Vertragsprüfung](blocker3-kostenvertrag-pruefung-20261007.md).
**Frisch am11.10. rein lesend bestätigte Production-Projektwerte:**
`HELMUT_MAX_LLM_CALLS_PER_DAY=2416`, Understanding-Reserve702,
Vorrangreserve200, `HELMUT_LLM_BUDGET_FAIL_CLOSED=1`. Das ist eine neue
Projekt-Env-Lesung, kein nativer Beleg eines bezahlten Slots auf dem geplanten
Deployment/UTC-Tag. Fehlender Env-Rohwert aktiviert den50er Fallback;
Storagefehler-Fail-closed ist ein getrennter Schalter.

Für die geschlossenen synthetischen Mandatskennungen kein200-Abzug bei D/R:
**D/R-Deckel2416−702=1714**. U/geteilte Arbeit hätte
`max(min(2416,702),2416−200)=2216`. Bei U=0 und TagesvorverbrauchC muss
`C+1000≤1714` gelten, also **C≤714**. Kleinster Rohdeckel beiC=0 und
beibehaltener702er Reserve wäre **1702**, nicht1000.2416 braucht daher keine
Erhöhung, sofern die frischen Laufbedingungen diese Werte und C≤714 bestätigen.

Native Nurlesung **2026-10-11T07:35:35.834525+00:00**: heutige globale
Counterzeile fehlt, Leserprojektion0; Blob-Tagesusage0. Reservierungs-RPC
vorhanden, Definition-MD5 `030139181c5160d3a647636b52613f9e`.
Keine Reservierung/RPC-Ausführung getestet, kein Counter zurückgesetzt.
Der kumulative Auftragsleser meldet fehlende Tagesbücher07.–11.10.; Abwesenheit
ist kein bestätigtes Nullbuch. Später nur unter eigener Datenfreigabe auffüllen.
Nach Dollarreservierung folgt Calls-Reservierung, danach Providerschutz und
HTTPS. Ein später abgelehnter Aufruf kann einen bereits gebundenen Slot
verbraucht haben. Vor jedem Sendeschritt erneut C, Konkurrenz und Scope prüfen.

## 7. Zeitvertrag

Es gibt aus B2 keine gemessene D/R-Anbieterlatzenz und keine garantierte
Gesamtdauer des bezahlten direkten Laufs. Modellzeit bei1000 seriellen Calls:
5s →1h23m20s;10s →2h46m40s;15s →4h10m;20s →5h33m20s.
Das sind Szenarien, keine Messwerte; Guards, DB/CAS,500 Nachbereitungen und Retention,
Endbeleg und unabhängige Endprüfung kommen hinzu.

Der Providertransport deckelt vollständige Antwortlektüre auf20s. Das deckelt
nicht den ganzen Unitweg. Die CLI hat180s pro HTTP-Unit, bei500 Units zusammen
25h reine Fristen; das ist ebenfalls keine Vollabschlussgarantie und kein
zulässiges Ein-UTC-Tag-Testfenster. Der Intentsvertrag erlaubt maximal4h im
gleichen UTC-Tag.4h verlangt höchstens14,4s/Call einschließlich aller Verarbeitung;
mit10min Abschlussreserve13,8s/Call. Schon die erlaubte maximale Modellzeit
übersteigt4h um1h33m20s.

**Ein aktuelles konkretes zukünftiges Start-/Endfenster ist nicht freigegeben.**
Der abgenommene30s-Endwächter aus Blocker4 wird übernommen, nicht wiederholt.
Wächtertakt ist keine garantierte Dauer sämtlicher DB-Rückführungen. Ein
vollständiger Zeitvertrag benötigt endliche Budgets für den ganzen Unitweg,
Retention und Abschluss, anschließend ein dazu passendes konkretes Fenster.
Ein pauschales6h-Fenster ohne belegten Overhead würde diese Lücke nicht schließen.

## 8. Freigabegrenze und spätere Betreiber-Vorlage

Es wird **noch kein numerisch unvollständiges Budget-GO beantragt**. Zuerst die
externe gültige500er D-Übergabe schließen; anschließend Inputobergrenzen,
Reservevorlauf H und vollständiges Zeitfenster binden. Die technische
Fachabnahme aus B2 bleibt abgeschlossen. Die verbleibenden B3-Punkte sind
Senderübergabe, Geld-/Zeitdimensionierung und geschützte Vertragsfreigabe.

| Pflichtfeld für das spätere konkrete GO | Vorbereitet / noch notwendiger Wert |
| --- | --- |
| Änderung | Genau ein versionierter500er Kosten-/Zeitvertrag in Dokumentation, Plan/Admission/Command, atomarem Budgetcheck, Sender und Endvalidator; keine Historien-/Reservenlöschung |
| Umgebung | Helmut Production, Vercel-Projekt helmut-pilot/Team nohut und Supabase ddckuvvpcytqbyfmbvie; genaue geprüfte Commit-/Deployment-/Operation-/Runbindung einsetzen |
| Benötigte Grenze | Tagesaltbestand+0,636+H; kumulativ7,445364+H, frisch bestätigen; genau1000 Production-Calls/U0 im unveränderten Scope;2416er Rohdeckel beibehalten bei C≤714; vollständiges Zeitfenster noch einsetzen |
| Erwartete maximale Gesamtkosten | Erst nach gültiger500er Übergabe und abgesicherten D/R-Inputcaps numerisch einsetzen; Erwartung und harte Obergrenze getrennt.4,193032USD ist nur das erklärte Szenario |
| Risiko | Unterfinanzierung durch Output/Reasoning/R-Eingaben, falsche private Überlappung,32 nichtleere D-Kontexte fehlend, Zeit-/Daten-/Deploymentdrift; Pflichtstopps vor Sendung statt Teilnachweis als Erfolg |
| Rein lesende Nachkontrolle | Originalauftrag/Tagesbücher/alle offenen Bindungen, C und immutable Runtime-/Route-/Vertragshashes, Commit/Deployment,500 gültige Kontexte; nach Ausführung1500 Sollpositionen, alle1000 Callquittungen, Endkosten/Endzeit/0 aktiv lesen, unabhängige Endprüfung |
| Rückweg | Neue Direktlauf-Freigabe vor Sendung sperren/auslaufen lassen; bisherigen Konfigurationssnapshot wiederherstellen unter GO; bei angefallenem Geld weder alte kumulative Grenze unter Bestand zurücksetzen noch Belege/Reserven löschen; bestehender Profil-Rückweg und Wächter bleiben Pflicht |

Das spätere GO für Vertragsimplementierung/Production-Grenzen umfasst **keine
Profilaktivierung und keinen bezahlten500er Test**. Diese Wirkungen bleiben
gesondert freizugeben. Kostenvertrag erst abnehmen, wenn alle Stellen dieselbe
freigegebene Version tatsächlich verwenden und die Größen endgültig gebunden sind.

## 9. Endkostenbeleg und Stopps

Endbeleg nach Abschlusszeitpunkt: gemeinsamer Vertrag/Hash, Auftrag/`abTag`,
Lauf/Operation/Commit/Deployment, vollständige UTC-Tagesbücher, Baseline,
externer bereits enthaltener Anteil, private Zusatzbindung/Überlappungsbeleg,
alle1000 erwarteten D/R-Tickets mit Inputs, Outputs einschließlich Reasoning,
konservativem Tarif, nativer Rechnung und Reservierungs-/Abrechnungszustand;
fehlende Quittung oder unbekannter Verbrauch bleibt gebunden und verhindert
eine positive Kostenendprüfung. Alle1500 Ergebnispositionen, tatsächliche
Gesamtdauer, Endquittung/0 aktiv und unabhängiger Prüfentscheid dazugehören.

Stoppen vor Sendung bei fehlender500er D-Bindung, leeren D-Quellen, Quellen-/
Policy-/Input-/Vertrags-/Deploymentdrift, fehlenden Tagesbüchern, unklarer
Reserveposition, nicht gedecktem nächsten vollen Reservierungsbetrag, C>
erlaubtem Rest, fehlerhaftem RPC/Fail-closed, fehlender Providerroute oder
unzureichender Restzeit. Nach unbekanntem Providerverbrauch kein Retry,
keine Reservefreigabe und kein Neustart. Pflichtbindungen und historische
Kostenoriginale bleiben vollständig erhalten.

**Abnahme: offen.** Die vorliegende Arbeit ist eine finale Eingabeintegration
und vollständige unabhängige Vertragsbestandsanalyse. Sie ist kein freigegebener
finanzierter500er Lauf und keine Änderung eines technischen Budgetriegels.
