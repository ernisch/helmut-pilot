# Entscheidungsvorlage — Erweiterung von 5 auf 10 und später 25 Mandate

**Stand:** 2026-08-24 · **Für:** den Gründer · **Sprache:** bewusst einfach gehalten.
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

## 2 · Was fehlt noch vor der Erweiterung auf zehn Mandate?

1. **Der siebentägige Nachweis des echten Warteschlangenbetriebs mit den fünf
   bestehenden Mandaten.** Er ist nicht abgeschlossen; heute läuft der Schattenmodus.
2. **Regionale Quellen für Berlin und Brandenburg.** Beide Landesmodule sind inaktiv,
   alle Landeswege gesperrt, die vorbereiteten Quellenlisten („Seeds") sind nicht
   eingespielt, und ob der Berlin-Schalter in Production überhaupt wirkt, ist
   unbewiesen. Ohne Landesquellen bekämen Landtagsabgeordnete eine leere Lage.
3. **Bytegenaue Bestätigung und Import der fünf empfohlenen Brandenburger Profile**
   (Steeven Bretz, Katja Poschmann, Niels Olaf Lüders, Jenny Meyer,
   Prof. Dr. Ulrike Liedtke) — die amtlichen Seiten konnten aus der Cloud-Umgebung
   nicht direkt abgerufen werden (Netzsperre); die Recherche liegt vor, die
   Bestätigung fehlt. Danach: Import und **je Mandat eine eigene Freigabe** zur
   Aktivierung.
4. **Anhebung des KI-Tagesdeckels** (siehe Fragen 4 und 5) — eine
   Betreiberänderung an den Vercel-Umgebungsvariablen.
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
2. **KI-Tagesdeckel für 25 Mandate** (Frage 5) einschließlich einer einmaligen,
   gesondert freizugebenden Erstbefüllung (rund 7 800 Aufrufe am ersten Tag).
3. **Alle 20 zusätzlichen Profile bytegenau bestätigt, importiert und einzeln
   freigegeben.** Das lokale Paket liegt vor, ist aber noch nicht amtlich bestätigt.
4. **Entscheidung über den Antrieb** (Frage 8): spätestens hier stellt sich die
   AWS-Frage, wenn der Ereignis-Antrieb gewünscht ist.
5. **Tägliche Lage für 25 Mandate im echten Betrieb belegt** (Frage 7).

## 4 · Warum reicht das aktuelle KI-Limit von 100 plus 30 nicht sicher?

- Die **einzige Rechenquelle des Projekts** (am 24.08. lokal neu ausgeführt) nennt als
  realistischen Tagesbedarf: **391 Aufrufe bei 5 Mandaten, 469 bei 10, 684 bei 25**.
  Selbst der heutige Bedarf liegt rechnerisch über dem Deckel; dass es heute trotzdem
  funktioniert, liegt daran, dass ruhige Tage weniger brauchen (gemessen am
  23./24.08.: 66 bzw. 29 von 100) und Übriges ehrlich liegen bleibt.
- Die verbindliche Restliste hält fest: **ab 25 Mandaten reicht 100 plus 30 auch im
  günstigsten Fall nicht.** Der Deckel würde dann nicht nur an Ereignistagen, sondern
  regelmäßig erreicht; übersprungene Arbeit würde zum Normalfall — jeden Tag bliebe
  ein Teil der Mandate ohne verstandene Lage.
- An einem **Ereignistag** (viel Nachrichtenlage) rechnet das Modell mit bis zu
  3 716 (10 Mandate) bzw. 5 376 (25 Mandate) nötigen Aufrufen. Ein Deckel von 130
  deckt davon nur einen Bruchteil — genau an dem Tag, an dem die Lage am wichtigsten
  ist.

## 5 · Welcher KI-Grenzwert wäre technisch sinnvoll, und welche Kosten werden erwartet?

Empfehlung der Rechenquelle (ausgelegt auf den Ereignistag plus 30 % Reserve):

| Mandate | empfohlener Tagesdeckel | Warnschwelle gelb/rot | Erstbefüllung (einmalig) |
|---|---|---|---|
| 10 | **4 900** | 3 430 / 4 410 | ~5 372 Aufrufe |
| 25 | **7 000** | 4 900 / 6 300 | ~7 840 Aufrufe |

Wer sparsamer starten will, kann den Deckel am realistischen Bedarf ausrichten
(rund 500 bei 10, rund 700–1 000 bei 25 Mandaten) und bewusst in Kauf nehmen, dass an
Ereignistagen Arbeit liegen bleibt — sichtbar verbucht, am Folgetag nachholbar.

**Erwartete Kosten** (berechnet aus dem Modell; die Preisbasis ist ein unbelegter
Schätzwert im Code, kein Anbieterpreis — als Größenordnung belastbar, nicht als
Rechnungsbetrag): 10 Mandate ≈ **1,11 USD/Tag ≈ 33 USD/Monat** (3,34 USD je
Mandat/Monat); 25 Mandate ≈ **1,64 USD/Tag ≈ 49 USD/Monat** (1,96 USD je
Mandat/Monat). Zum Vergleich: gemessen heute mit 5 Mandaten ~0,14 USD/Betriebstag —
die Modellwerte sind bewusst vorsichtig nach oben gerechnet. Das Lage-Narrativ allein
ist mit einer echten Messreihe belegt: ~0,033 USD je Morgen bei 25 Mandaten.

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

**Für den echten Ereignis-Antrieb: ja.** Der vorgesehene Standardweg ist ein
verwalteter Nachrichtendienst bei AWS (Warteschlange SQS, Fehler-Warteschlange,
Verschlüsselung KMS, Zugriffsrollen IAM, Verbraucher-Funktion Lambda, Region
Frankfurt). **Nichts davon existiert bisher**; die vollständige Vorlage liegt im
Repository (`infra/aws/helmut-auftrags-queue.yaml`). Die Kosten sind nutzungsabhängig
(Cent-Beträge je Million Anfragen plus Rechenzeit) — die Entscheidung darüber ist
ausdrücklich eine kostenpflichtige Gründerentscheidung. Ein eingebauter
Ausweichantrieb ohne AWS („Selbstweck") existiert, ist in Production aber bewusst
gesperrt und nur Notfall-/Entwicklungsweg. Unabhängig davon steht die separate
Kostenentscheidung **Supabase Pro** (echte Datenbank-Backups, OP-01) weiter aus — sie
gehört zur Verkaufsreife, nicht zur Skalierung.

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

---

**Empfohlene Reihenfolge (zusammengefasst):** ① 7-Tage-Nachweis mit 5 Mandaten →
② Landesquellen Berlin/Brandenburg bytegenau verifizieren und freigeben →
③ KI-Deckel für 10 Mandate anheben → ④ die fünf empfohlenen Brandenburger Profile
bytegenau bestätigen, importieren, einzeln aktivieren (= 10 Mandate) →
⑤ 7-Tage-Nachweis mit 10 Mandaten + Google-Messung → ⑥ AWS-Entscheidung →
⑦ restliche 15 Profile → 25 Mandate. Kein Schritt geschieht automatisch.
