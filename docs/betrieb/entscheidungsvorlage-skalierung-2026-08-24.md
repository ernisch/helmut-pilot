# Entscheidungsvorlage — Erweiterung von 5 auf 10 und später 25 Mandate

**Stand:** 2026-08-24, korrigiert im Verifikationssprint (Betriebsreihenfolge, KI-Budget-Evidenzen, Berliner Wahl) · **Für:** den Gründer · **Sprache:** bewusst einfach gehalten.
**Zahlenquellen:** `scripts/skalierungsmodell.js` (einzige Rechenquelle, lokal am 24.08.
für 5/10/25 Mandate ausgeführt),
[`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md)
(Stufenplan), [`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) §30.7
(Abnahme der fünf Mandate), [`../datenmotor-restliste.md`](../datenmotor-restliste.md)
(verbindliche offene Punkte, „OP-…" ist dort die laufende Nummer).

**Wichtige Begriffe kurz erklärt:**
- **Warteschlangenmotor:** der neue Verarbeitungskern, der alle Arbeit als einzelne
  Aufträge in eine Warteschlange legt und mit Quittungen abarbeitet.
- **Schattenmodus (`HELMUT_JOB_DISPATCH_MODE=shadow`):** der Motor läuft und
  arbeitet vollständig, aber der Antrieb ist noch der bisherige Zeitplan (Cron).
  Der „echte" Warteschlangenbetrieb (Ereignis-Antrieb über einen externen
  Nachrichtendienst) ist noch nicht eingeschaltet.
- **KI-Tagesdeckel:** höchstzulässige Zahl von KI-Aufrufen pro Tag. Heute wirksam:
  **100 plus 30 Reserve**. Ist er erreicht, wird liegen gelassene Arbeit ehrlich
  als „übersprungen wegen Budget" verbucht — sie geht nicht verloren, wird aber an
  diesem Tag nicht verstanden.

---

## 1 · Was ist bereits bewiesen?

- Der neue Warteschlangenmotor ist seit dem **23.08.2026, 19:47 türkischer Zeit
  (18:47 Berlin, 16:47 UTC)** in Production eingeschaltet und hat die Abnahme
  bestanden: **376 echte Abschlüsse** (117 im ersten Lauf, 259 über Nacht und Morgen),
  alle Zeilenbilanzen exakt.
- **Morgenlauf und Tageslage waren je für alle fünf Mandate erfolgreich** (5 von 5).
- Der unabhängige Kontrolllauf („Watchdog", ein täglicher Prüfjob auf GitHub) ist
  **grün**: keine doppelten Aufträge, keine verlorenen Aufträge, keine endgültigen
  Fehler, keine unbekannten Vorgänge, keine Lease- oder Fencing-Konflikte.
- **Lokal simuliert** (nicht in Production bewiesen): ein voller Tag mit 200 Mandaten
  geht rechnerisch auf; 25 Mandate im Morgenfenster mit knapp 90 % Zeitreserve.
- Der **Importvertrag für Mandatsprofile** ist testgesichert: ein Import kann nie ein
  Mandat scharf schalten (`aktiv: false` ist Pflicht, `aktiv: true` wird abgelehnt),
  und deaktivierte Profile erzeugen keine Last und keine Kosten.

**Wichtige Abgrenzung:** Der laufende **Schattenbetrieb beweist den Motor** mit fünf
Mandaten — er beweist **nicht den echten Ereignis-Antrieb** (Warteschlange als Auslöser).
Der Antrieb ist weiterhin der Zeitplan (Cron); der Ereignisweg war noch nie in Production
eingeschaltet.

## 2 · Was fehlt noch vor der Erweiterung auf zehn Mandate?

1. **Der siebentägige Nachweis des echten Warteschlangenbetriebs mit den fünf
   bestehenden Mandaten.** Er ist nicht begonnen; heute läuft der Schattenmodus.
   Der Nachweis der nächsten technischen Stufe verlangt verbindlich:
   1. `HELMUT_JOB_DISPATCH_MODE=queue` (Ereignis-Antrieb statt Zeitplan),
   2. `HELMUT_KLASSEN_GRENZEN=on` (verteilte Klassengrenzen),
   3. gesetztes Weckziel `HELMUT_WORKER_WAKE_URL`,
   4. sieben Tage lang Abfluss mindestens gleich Ankunft,
   5. keine verlorene und keine doppelte Arbeit,
   6. ältester offener Auftrag dauerhaft unter 24 Stunden.
   Der kanonische Production-Transport dafür ist laut Zielarchitektur **AWS SQS plus
   Lambda** — und diese AWS-Infrastruktur **existiert noch nicht**. Deshalb muss die
   **AWS-Entscheidung vor dem siebentägigen Nachweis fallen, nicht danach** (Frage 8).
   In diesem Sprint wird dazu nichts bereitgestellt und nichts freigegeben.
2. **Regionale Quellen für Berlin und Brandenburg.** Beide Landesmodule sind inaktiv,
   alle Landeswege gesperrt, die vorbereiteten Quellenlisten („Seeds") sind nicht
   eingespielt, und ob der Berlin-Schalter in Production überhaupt wirkt, ist
   unbewiesen. Ohne Landesquellen bekämen Landtagsabgeordnete eine leere Lage.
3. **Bytegenaue Bestätigung und Import der fünf empfohlenen Brandenburger Profile**
   (Steeven Bretz, Katja Poschmann, Niels-Olaf Lüders, Jenny Meyer,
   Prof. Dr. Ulrike Liedtke; Lüders amtlich mit Bindestrich) — die amtlichen Seiten konnten aus der Cloud-Umgebung
   nicht direkt abgerufen werden (Netzsperre); die Recherche liegt vor, die
   Bestätigung fehlt. Danach: Import und **je Mandat eine eigene Freigabe** zur
   Aktivierung.
4. **Eine KI-Deckel-Entscheidung** (Fragen 4 und 5) — derzeit ohne belastbare
   Zahlenempfehlung; eine Betreiberänderung an den Vercel-Umgebungsvariablen.
5. **Das Google-Risiko** (Frage 6): schon heute liefern 29 von 42 personenbezogenen
   Suchen dauerhaft nichts, weil die zentrale Google-Drosselung greift. Ab ungefähr
   zehn Mandaten ist das laut Restliste ein Blocker; mindestens braucht es die dort
   beschriebene Messung im echten Betrieb.
6. **Wiederholung des Betriebsnachweises „OP-25"** (ein standardisierter
   Mehrtagesnachweis, dass Planung, Sichtbarkeit und Bilanz zusammenpassen) nach
   jeder Architektur- oder Mandatsänderung.

## 3 · Was fehlt danach vor der Erweiterung auf 25 Mandate?

Alles aus Frage 2, dauerhaft nachgewiesen mit zehn Mandaten, und zusätzlich:

1. **Stufenplan Stufe 2** aus dem Kapazitätsbeleg: sieben Tage Beobachtung je Stufe,
   Abnahme erst nach drei Tagen in Folge „alle Mandate im Fenster, nichts doppelt,
   nichts verloren, Deckel nicht erreicht".
2. **KI-Deckel-Entscheidung für 25 Mandate** (Frage 5 — derzeit ohne belastbare
   Empfehlung) einschließlich einer einmaligen, gesondert freizugebenden
   Erstbefüllung (Modellwert ~7 840 Aufrufe am ersten Tag).
3. **Alle 20 zusätzlichen Profile bytegenau bestätigt, importiert und einzeln
   freigegeben.** Das lokale Paket liegt vor, ist aber noch nicht amtlich bestätigt.
4. **Tägliche Lage für 25 Mandate im echten Betrieb belegt** (Frage 7).
5. **Neubewertung der zehn Berliner Profile nach der Wahl am 20.09.2026** (Frage 11).

## 4 · Warum reicht das aktuelle KI-Limit von 100 plus 30 nicht sicher?

Weil **jede** vorhandene Evidenzlinie zeigt, dass der Deckel bei Wachstum entweder schon
im Normalfall oder spätestens am Ereignistag erreicht wird — die Linien widersprechen
sich nur darin, **wie früh**. Die verbindliche Restliste hält fest: **ab 25 Mandaten
reicht 100 plus 30 auch im günstigsten Fall nicht.** Erreicht der Deckel, bleibt Arbeit
sichtbar liegen („übersprungen wegen Budget") — an genau den Tagen, an denen die Lage am
wichtigsten wäre. Dass der Betrieb heute grün ist, liegt an ruhigen Tagen (gemessen
23./24.08.: 66 bzw. 29 von 100), nicht an ausreichender Reserve.

## 5 · Welcher KI-Grenzwert wäre technisch sinnvoll, und welche Kosten werden erwartet?

**Diese Frage ist derzeit NICHT belastbar beantwortbar.** Die früher hier genannten
Werte (4 900 für zehn, 7 000 für 25 Mandate) waren die Stresswert-Empfehlung **eines
einzelnen Modells** und werden nicht mehr als Empfehlung geführt. Die vorhandenen
Evidenzen widersprechen sich und werden deshalb getrennt ausgewiesen:

| Evidenzlinie | Aussage für ~25 Mandate | Quelle |
|---|---|---|
| **Gemessener Production-Verbrauch (5 Mandate)** | 62–77 Aufrufe/Tag gemessen (23.08.: 66/100; 24.08. Teiltag: 29/100); Kosten ~0,14 USD/Tag | Budgetquittungen; Kapazitätsmodell B3.1b |
| **Kapazitätsmodell (vorgangsgetrieben)** | 25 Mandate: ~204 Verstehensaufträge, **88–265 Aufrufe/Tag**; Deckel 130 trägt „nur im günstigen Fall". Die früher zitierte Spanne „~113–290" gehört zu dieser Evidenzfamilie (andere Parametrisierung) | `scripts/kapazitaetsmodell-test.js` §B3 |
| **Skalierungsmodell (quellengetrieben)** | 25 Mandate: **684 Aufrufe/Tag im Normalfall**, bis **5 376 am Ereignistag**, einmalige Erstbefüllung ~7 840 | `scripts/skalierungsmodell.js` |
| **Ältere Stufen-/Grundlagenrechnung** | Deckel 100 greift rechnerisch ab ~70 Mandaten; für 100 Mandate wurden Größenordnungen um ~150–500 Aufrufe/Tag genannt | `betrieb/skalierungsgrundlage-1000.md` · Kapazitätsmodell B3 (100er-Zeile: 151–458) |

**Warum die Zahlen nicht zusammenpassen:** Sie messen Verschiedenes. Das
Skalierungsmodell rechnet quellengetrieben (jedes eingehende Dokument wird noch am
selben Tag verstanden, plus Narrativ- und Büropfade) und ist bewusst pessimistisch. Das
Kapazitätsmodell rechnet vorgangsgetrieben (Verstehen entsteht je **neuem Vorgang**,
weitgehend unabhängig von der Mandatszahl, weil die Quellen stark geteilt sind). Die
Production-Messung zeigt ruhige Tage mit funktionierendem Budget-Gate. Keine der Linien
ist widerlegt; sie beantworten unterschiedliche Fragen mit unterschiedlichen Annahmen
(Dublettenanteil, Ereignislage, Anteil aktiver Mandate).

**Für eine spätere Entscheidung sind sechs Größen getrennt zu halten** (heute nur die
erste und die letzte gemessen):

1. **Erwarteter Normalverbrauch** — je nach Linie 88–265 oder ~684 Aufrufe/Tag bei 25.
2. **Erwarteter Belastungsfall** (Ereignistag) — bis ~5 376 bei 25 (Modellannahme).
3. **Technischer Sicherheitsdeckel** — die eigentliche Stellgröße; heute 100+30.
4. **Maximal mögliche Kosten bei voll ausgeschöpftem Deckel** — der Deckel ist zugleich
   die Kostenobergrenze; sie wächst genau mit dem gewählten Deckel.
5. **Einmalige Erstbefüllung** — eigener, gesondert freizugebender Tageslauf
   (~5 372 bei 10, ~7 840 bei 25 laut Skalierungsmodell).
6. **Tatsächlich gemessene Kosten** — ~0,14 USD/Betriebstag bei 5 Mandaten
   (Untergrenze, Preisbasis unbelegt); Lage-Narrativ als einzige echte Messreihe:
   ~0,033 USD je Morgen bei 25 Mandaten.

**Es wird hier bewusst keine neue Budgetempfehlung erfunden.** Die Budgetentscheidung
bleibt offen und braucht eine ausdrückliche Gründerfreigabe — sinnvollerweise nach den
ersten Messwochen des echten Warteschlangenbetriebs mit fünf Mandaten, die die
Modellannahmen gegen echte Zahlen stellen.

## 6 · Wie wird das Risiko zu vieler Google-Anfragen mit zehn Mandaten gemessen?

Heute laufen **146 von 163 Abrufwegen über Google News** — ein Klumpenrisiko: drosselt
Google, fällt fast alles gleichzeitig aus. Die Messung ist bereits eingebaut und wird
so abgelesen:

1. **Abruf-Telemetrie je Quelle** (`source_crawl_telemetry`): je Lauf, welche Quelle
   geliefert hat, welche gedrosselt war („circuit-open" = die eingebaute Sicherung hat
   den Google-Abruf vorsorglich geöffnet/angehalten).
2. **Lauf-Klassifikation in sieben Zuständen** (u. a. „gesund", „gedrosselt",
   „teilausfall") je Crawl-Lauf.
3. **Personensuchen-Quote:** wie viele der personenbezogenen Suchen tatsächlich
   liefern. Heutiger Stand: 29 von 42 lieferten im Messzeitraum nie — das ist die
   wichtigste Kennzahl, denn sie trifft die mandatsindividuelle Versorgung zuerst.
   Wiederholbare Auswertung:
   [`../quellenarchitektur/30-paket-inventur-production.md`](../quellenarchitektur/30-paket-inventur-production.md) §6.
4. **Härtungs-Beweis:** die eingebaute Google-Härtung (Abstände, Wiederholung mit
   Wartezeit, Sicherung) ist aktiv, aber noch nie unter echter Drosselung in
   Production bewiesen. Der erste echte Drosselfall mit 10 Mandaten ist zugleich der
   Beweislauf (Restliste OP-15).

Konkreter Messplan für 10 Mandate: dieselbe Inventur wöchentlich wiederholen und zwei
Zahlen verfolgen — Anteil liefernder Personensuchen (Ziel: steigt mit jeder
Direkt-RSS-Umstellung) und Zahl der „circuit-open"-Ereignisse je Tag (Ziel: kein
Dauerzustand).

## 7 · Wie wird die tägliche Lage für alle Mandate sichergestellt, obwohl der bisherige Lauf nur ungefähr zwei Mandate pro Tag schaffte?

- Die „zwei Mandate pro Tag" waren die Grenze des **alten Direktpfads**: ein einzelnes
  Zeitfenster von 300 Sekunden, das bei mehr Mandaten schlicht voll war.
- Der neue Motor löst genau das: Arbeit wird in **einzelne Aufträge** zerlegt und über
  **mehrere Zeitfenster und parallele Verarbeitung** abgearbeitet. Seit der
  Aktivierung liefert der Lagelauf **effektiv 5 von 5** aktiven Mandaten
  (Lauf täglich 08:45 türkischer Zeit / 07:45 Berlin / 05:45 UTC).
- Für 25 Mandate sieht der Stufenplan zusätzlich zwei bereits angelegte, heute inerte
  Nachlauffenster vor (09:10 und 09:22 türkischer Zeit / 08:10 und 08:22 Berlin /
  06:10 und 06:22 UTC). Simuliert: 25 von 25 im Fenster mit ~89 % Zeitreserve.
- **Kontrollgrenze im echten Betrieb:** kein Mandat ohne Morgenlage bis
  09:30 türkischer Zeit (08:30 Berlin, 06:30 UTC); sonst Stufe halten und Ursache
  klären. Das ist eine Simulations- und Nachweiszusage, kein Production-Beweis — der
  Beweis entsteht erst im 7-Tage-Fenster jeder Stufe.

## 8 · Braucht der echte Warteschlangenbetrieb zusätzliche kostenpflichtige Infrastruktur?

**Für den heutigen Schattenmodus: nein.** Er läuft vollständig auf der bestehenden
Infrastruktur (Vercel-Zeitpläne + Supabase).

**Für den echten Ereignis-Antrieb: ja.** Der **kanonische Production-Transport ist
laut Zielarchitektur AWS SQS plus Lambda** (Warteschlange SQS, Fehler-Warteschlange,
Verschlüsselung KMS, Zugriffsrollen IAM, Verbraucher-Funktion Lambda, Region
Frankfurt). **Nichts davon existiert bisher**; die vollständige Vorlage liegt im
Repository (`infra/aws/helmut-auftrags-queue.yaml`). Die Kosten sind nutzungsabhängig
(Cent-Beträge je Million Anfragen plus Rechenzeit) — die Entscheidung darüber ist
ausdrücklich eine kostenpflichtige Gründerentscheidung, und sie muss **vor** dem
siebentägigen Nachweis des echten Warteschlangenbetriebs fallen, weil dieser Nachweis
ohne den Transport nicht laufen kann (Frage 2). **In diesem Sprint wird dazu nichts
bereitgestellt und nichts freigegeben.** Ein eingebauter Ausweichantrieb ohne AWS
(„Selbstweck") existiert, ist in Production aber bewusst gesperrt und nur
Notfall-/Entwicklungsweg. Unabhängig davon steht die separate Kostenentscheidung
**Supabase Pro** (echte Datenbank-Backups, OP-01) weiter aus — sie gehört zur
Verkaufsreife, nicht zur Skalierung.

## 9 · Welche Production-Aktionen benötigen jeweils eine ausdrückliche Betreiberfreigabe?

Jede einzelne der folgenden Aktionen, jeweils gesondert:

1. Anhebung oder Änderung des KI-Tagesdeckels (Vercel-Umgebungsvariable).
2. Einspielen der Quellen-Seeds und jede Änderung am Quellenkatalog in Production.
3. Aktivierung der Landesmodule Berlin und/oder Brandenburg (Flag + Wege entsperren).
4. Import des Profilpakets in die Production-Datenbank.
5. Aktivierung **jedes einzelnen** Mandats (der Import aktiviert nie).
6. Anwendung jeder Migration (offen ist derzeit nur `20260720`).
7. Umschalten des Warteschlangenmodus (`shadow` → `queue`) und jede Cron-Änderung.
8. Anlegen der AWS-Ressourcen (kostenpflichtig) und alle zugehörigen Schlüssel.
9. Jeder Merge nach `main` (= automatisches Production-Deployment) und jedes Deployment.
10. Jeder kostenverursachende Lauf (Erstbefüllung, Backfill, Massen-Crawl).

## 10 · Wie sieht der sichere Rückweg aus?

Jede Stufe hat einen dokumentierten Ein-Schritt-Rückweg:

- **Motor:** Flag `HELMUT_SCALABLE_PIPELINE` löschen + erneutes Deployment desselben
  Stands — der bisherige Direktpfad übernimmt sofort (dokumentiert und im Notfallpfad
  belassen).
- **Ereignis-Antrieb:** `HELMUT_JOB_DISPATCH_MODE` zurück auf `shadow` (oder `off`) +
  Deployment. Die Warteschlange läuft leer, kein Auftrag geht verloren, der
  Cron-Antrieb trägt weiter.
- **Mandate:** jedes Profil einzeln deaktivierbar; ein deaktiviertes Profil wird vom
  Planer nicht eingeplant und erzeugt keine Last und keine Kosten.
- **KI-Deckel:** jederzeit absenkbar; das Budget ist fail-closed (im Zweifel wird
  nicht aufgerufen, nichts läuft unkontrolliert weiter).
- **Rückfallgrenzen** (Stufenplan §11): ein Mandat ohne Morgenlage, ein doppeltes
  Narrativ, Deckel erreicht oder Fenster über 280 Sekunden ⇒ Stufe zurück bzw. Flag
  aus — die Grenzwerte sind vorab festgelegt, nicht situativ.

## 11 · Betriebsrisiko: Wahl zum Abgeordnetenhaus von Berlin am 20. September 2026

Amtliche Quelle: https://www.berlin.de/wahlen/ (Landeswahlleitung Berlin).

1. **Die zehn Berliner Profile des Pakets gehören zur derzeitigen Wahlperiode**
   (19. Wahlperiode des Abgeordnetenhauses). Sie sind eine Momentaufnahme vor der Wahl.
2. **Nach der Wahl müssen je Person Mandat, Ausschüsse und Profilgültigkeit erneut
   geprüft werden:** Mandate können enden, Wahlkreise und Zuschnitte ändern sich,
   Ausschüsse werden in der neuen Wahlperiode neu gebildet und besetzt.
3. **Ein vor der Wahl vorbereitetes Berliner Profil darf nach der Wahl nicht ungeprüft
   aktiviert werden** — die Aktivierung braucht dann eine erneute bytegenaue Prüfung
   gegen die amtliche Seite der neuen Wahlperiode.
4. **Das beeinflusst die Terminplanung für den 25-Mandate-Nachweis:** Fällt der
   Nachweiszeitraum über den 20.09.2026, ist mit Mandats- und Ausschusswechseln
   mitten im Fenster zu rechnen. Entweder wird der Berliner Anteil vor der Wahl
   abgeschlossen, oder er wird bewusst erst nach der Konstituierung des neuen
   Abgeordnetenhauses aufgesetzt — beides ist eine Terminentscheidung des Gründers.

---

**Rechercheunterlage:** Das lokale, vollständig deaktivierte Importpaket der 20 Profile
liegt in `daten/mandatsprofile-berlin-brandenburg-2026-08-24.json`; der Prüfstand je
Profil steht in `daten/mandatsprofile-berlin-brandenburg-2026-08-24-pruefstand.md`.

**Empfohlene Reihenfolge (zusammengefasst):** ① **AWS-Entscheidung** (kanonischer
Transport für den Ereignis-Antrieb — Voraussetzung des Fünfernachweises) →
② **7-Tage-Nachweis des echten Warteschlangenbetriebs mit 5 Mandaten**
(`queue` + Klassengrenzen + Weckziel; Abfluss ≥ Ankunft, nichts verloren/doppelt,
ältester offener Auftrag < 24 h) → ③ Landesquellen Berlin/Brandenburg bytegenau
verifizieren und freigeben → ④ KI-Deckel-Entscheidung anhand echter Messwochen
(Frage 5 — offen, keine Empfehlung) → ⑤ die fünf empfohlenen Brandenburger Profile
importieren und einzeln aktivieren (= 10 Mandate; **vorsichtige Zwischenstufe als
Gründerentscheidung — sie ersetzt den technischen Fünfernachweis im echten
Queue-Betrieb nicht**) → ⑥ 7-Tage-Beobachtung mit 10 Mandaten + Google-Messung →
⑦ restliche 15 Profile unter Beachtung der Berliner Wahl (Frage 11) → 25 Mandate.
Kein Schritt geschieht automatisch; jeder ist einzeln freigabepflichtig.
