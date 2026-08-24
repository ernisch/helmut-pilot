# Prüfstand — Importpaket Berlin/Brandenburg (bytegenau abgeglichen 2026-08-24)

**Prüfweg:** Vom Gründer freigegebene, rein lesende GitHub-Actions-Läufe
(`.github/workflows/profil-quellen-verifikation.yml`, Sicherheitsmuster `sprint9b-verify.yml`;
`permissions: contents: read`, keine Secrets, Host-Schranke auch für Redirects, TLS an, keine
Umgehung von Zugriffssperren). Abgerufen werden **ausschließlich die 20 amtlichen
`parlament-profil`-URLs des Pakets** — keine Zusatzquellen (das frühere Prüfmanifest wurde mit
Lauf 4 entfernt, Begründung unten; Obergrenze 30 Seiten je Lauf, technisch erzwungen).

## Strenge-Stufe 2 (dritter Lauf, gründerfreigegeben)

Die Erstfassung der Prüflogik war an mehreren Stellen zu großzügig. Seit der Strenge-Stufe 2 gilt:

1. **Fehlende Information ist keine Bestätigung.** Nennt die Profilseite keine Mandatsachse,
   ist das Ergebnis `nicht_eindeutig`. **Korrektur (Lauf 3/4):** Für **Raed Saleh** und
   **Jörg Stroedter** ist die Mandatsachse **auf der eigenen amtlichen Profilseite
   ausgewiesen** („gewählt über: Bezirksliste"; Saleh: Wahlbezirk Spandau, Stroedter:
   Wahlbezirk Reinickendorf) — Lauf 3 hat sie dort belegt (`mandatAchse`, Quelle
   `profilseite`). Die frühere Aussage, die Seiten nennten keine Achse, war ein
   Auswertungsfehler; die dafür hinterlegte Zusatzquelle der Landeswahlleiterin
   (`wahlen-berlin.de`) war doppelte Beweislogik und wurde mit Lauf 4 entfernt.
2. **Mitgliedschaften zählen nur im Profilinhalt:** Brandenburg ausschließlich in den
   Abschnitten „Ordentliche/Stellvertretende Ausschuss- und Gremienmitgliedschaften";
   Navigation (BB: „Petitionsausschuss"/„Kommissionen" vor dem Abschnitt; Berlin:
   „Enquete-Kommission") und biografische Historik bestätigen nichts und verbergen nichts.
3. **Rollen streng getrennt:** ordentlich erwartet, aber nur stellvertretend geführt → rot;
   umgekehrt ebenso. Berlin weist keine Rollen aus → Einträge gelten als Mitgliedschaft mit
   unbestimmter Rolle; eine stellvertretende Behauptung wäre für Berlin unbelegbar (rot);
   im Paket wird keine Rolle erfunden.
4. **Jede Funktion und jeder behauptete Listenplatz** muss im aktuellen (nicht historischen)
   amtlichen Seitentext belegt sein — sonst rot. **Nicht amtlich belegte optionale Angaben
   wurden aus dem Paket entfernt statt behauptet** (siehe Revisionstabelle unten).
5. **Jede Mitgliedschaftszeile der Seite** muss einem Paketeintrag zuzuordnen sein — sonst rot.
6. Themen sind redaktionelle Einordnung und wurden auf das aus belegten Ausschüssen,
   Wahlkreisen und Funktionen Ableitbare zurückgeführt.

### Revision des Datenpakets in der Strenge-Stufe 2

- **Funktionen entfernt (amtlich nicht belegt):** Goiny (2 Sprecherrollen), Freymark (2),
  Jarasch (Fraktionsvorsitz — auf ihrer amtlichen Seite nicht ausgewiesen), Schmidberger (2),
  Schrader (3), Lüttmann (Fraktions- und Hauptausschussvorsitz — auf seiner Profilseite nicht
  ausgewiesen), Scheetz (2), Liedtke (Präsidentinnen-Funktion — auf der Profilseite nicht
  zweifelsfrei als aktuelle Zeile belegbar), Bretz (1), Augustin (2), Dorst (1), Meyer (2),
  Peschel (3).
- **Funktionen beibehalten, Wortlaut an die amtliche Seite angelehnt:** Stettner, Saleh
  („Fraktionsvorsitzender"), Stroedter (2), Graf, Schulze, Poschmann (stellv.
  Fraktionsvorsitz), Lüders (Fraktionsvorsitz + Präsidium).
- **Regionshinweise auf das Belegte reduziert:** BB-Listenprofile → „Brandenburg
  (Landesliste, Platz N)" (Platz je amtlicher Seite); Berliner Listenprofile → „Land Berlin
  (Landesliste)" bzw. für Saleh/Stroedter seit Lauf 4 „Land Berlin (Bezirksliste)"
  (seitenbelegt: „gewählt über: Bezirksliste"); unbelegte
  Bezirks-/Kandidaturwahlkreis- und Wohnort-Präzisierungen sowie Jaraschs
  Listenplatz-1-Angabe entfernt.
- **Themen** je Profil auf ableitbare Felder zurückgeführt.
- Ausschusslisten, Kennungen, Namen, `aktiv: false` und amtliche URLs blieben unverändert.

**Lauf 1 (Ist-Aufnahme):** Actions-Lauf Nr. 1, ID 32739268032, 24.08.2026 ≈**17:32 TR /
16:32 Berlin / 14:32 UTC** — https://github.com/ernisch/helmut-pilot/actions/runs/32739268032.
**Alle 20 amtlichen Seiten erreichbar (HTTP 200, keine Redirects).** Ergebnis: 8 bestätigt,
12 mit Abweichungen; zusätzlich deckte die manuelle Auswertung der Seitenzeilen fünf im
Erstlauf technisch nicht angemahnte fehlende Gremien auf (Jarasch, Schmidberger, Schrader,
Liedtke, Poschmann). **Alle Befunde wurden in das Paket eingearbeitet** (Spalte „Korrektur“).
**Lauf 2** nach den Korrekturen war grün (20/20), aber mit der später verschärften Logik
nicht ausreichend streng. **Lauf 3 (Strenge-Stufe 2)** bestätigte alle 10 Brandenburger
Profile vollständig (Rollen, Listenplätze, Funktionen) und wurde für alle 10 Berliner
Profile rot — **allein durch einen Auswertungsfehler**: die auf jeder Berliner Profilseite
stehenden drei Struktur-/Reiterüberschriften „Ausschüsse: Einladungen und Protokolle",
„Ausschüsse: Vorgänge" und „Mitgliedschaft in Ausschüssen" wurden fälschlich als
unzugeordnete Mitgliedschaften gemeldet; alle Paket-Mitgliedschaften selbst waren gefunden,
keine echte zusätzliche Mitgliedschaft fehlte. **Lauf 4** behebt genau das (die drei
Überschriften zählen als exakte Strukturzeilen), macht Fraktions- und Funktionsbelege
navigationsfest (Berlin: Fraktionskürzel in der Profilüberschrift; Brandenburg:
Stammdaten-/Mehrheitsregel statt Navigations-Nennung; Funktionen nur zeilenweise, nie aus
Navigations-/Präsidiumszeilen) und entfernt die Zusatzquellen-Beweislogik. **Der Lauf 4 ist
der maßgebliche Nachweis;** sein Ergebnis ist am Pull Request (Check
„Profil-Quellen-Verifikation") und in dessen Artefakten einsehbar.

**Dokumentierte Grenzen des Prüfwegs:**

1. `parlament-berlin.de` weist bei Ausschussmitgliedschaften **keine Rollen** aus
   (ordentlich/stellvertretend). Berliner Mitgliedschaften stehen daher im Feld `ausschuesse`;
   die Rolle ist amtlich unbestimmt und wird nicht behauptet.
2. **Korrigiert (Lauf 3/4):** Die früher hier dokumentierte Annahme, die Seiten von Saleh und
   Stroedter nennten keine Mandatsachse, war **falsch** — beide Profilseiten weisen
   „gewählt über: Bezirksliste" aus; die Achse ist seitenbelegt (kein `uneindeutig`).
3. `landtag.brandenburg.de` führt „Petitionsausschuss“/„Kommissionen“ als **Navigation** auf
   jeder Seite; eine echte Brandenburger Petitionsausschuss-Mitgliedschaft würde von der
   Außerhalb-Prüfung nicht gemeldet (der Positivabgleich eines Pakets, das sie führt, greift).
4. Biografie-**Historik** (Zeilen mit Jahreszahlen, kommunale Gremien) zählt nicht als aktuelle
   Mitgliedschaft.
5. **Falk Peschel:** Der Lauf-1-Bericht war für sein Profil nur teilweise lesbar (Log-Kappung).
   Belegt: Abruf 24.08.2026 17:32:48 TR / 16:32:48 Berlin / 14:32:48 UTC, HTTP 200, 95.786 Bytes,
   SHA256 `bce46fa40c4c2b28…`; amtlich NICHT (mehr) geführt: Hauptausschuss, stellv.
   Inneres/Kommunales, stellv. Haushalt/Finanzen, stellv. Europa. Der Auftrag warnt vor einer
   jüngeren Umbesetzung — bei einem amtlichen Widerspruch in Lauf 2 gilt **kein** grünes Ergebnis.
6. Die Berliner Profile gehören zur 19. Wahlperiode; **nach der Wahl zum Abgeordnetenhaus am
   20.09.2026** (amtlich: https://www.berlin.de/wahlen/) müssen Mandat, Ausschüsse und
   Profilgültigkeit erneut geprüft werden. Kein vor der Wahl vorbereitetes Profil wird danach
   ungeprüft aktiviert.

Import und Aktivierung bleiben freigabepflichtige Betreiberentscheidungen (`CLAUDE.md` §5);
alle 20 Profile tragen `aktiv: false`.

---

## Abrufprotokoll und Korrekturen je Profil (Lauf 1)

| Profil | HTTP | Abruf (TR) | SHA256 (Kurzform) | Lauf-1-Ergebnis | Korrektur |
|---|---|---|---|---|---|
| dirk-stettner | 200 | 24.08.26, 17:32:01 | `2a90f55c220a` | bestaetigt | Keine Korrektur nötig; Seite führt keine Ausschussmitgliedschaften. |
| christian-goiny | 200 | 24.08.26, 17:32:04 | `4880374d318f` | abweichung | Keine Korrektur nötig; alle vier Gremien amtlich geführt. |
| danny-freymark | 200 | 24.08.26, 17:32:07 | `fb1651c729d1` | abweichung | Ausschussname korrigiert: amtlich „Ausschuss für Umwelt- und Klimaschutz“. |
| raed-saleh | 200 | 24.08.26, 17:32:09 | `ba196306def3` | abweichung | Keine Datenkorrektur; keine Ausschüsse. Die Lauf-1-Aussage „Seite nennt keine Mandatsachse“ war ein Auswertungsfehler — die Seite weist „gewählt über: Bezirksliste“ aus (Lauf-3-belegt). |
| joerg-stroedter | 200 | 24.08.26, 17:32:12 | `4893ae8f9bce` | abweichung | Ausschussname korrigiert (amtlich „…Wirtschaft, Energie und Betriebe“); Funktion „Stellv. Fraktionsvorsitzender“ von der Seite übernommen. Die Lauf-1-Aussage „Seite nennt keine Mandatsachse“ war ein Auswertungsfehler — die Seite weist „gewählt über: Bezirksliste“ aus (Lauf-3-belegt). |
| bettina-jarasch | 200 | 24.08.26, 17:32:15 | `bfe2e218b659` | bestaetigt | Petitionsausschuss von der Seite ergänzt. |
| werner-sebastian-graf | 200 | 24.08.26, 17:32:17 | `a7959d622882` | bestaetigt | Keine Korrektur nötig; voller amtlicher Name bestätigt. |
| katrin-schmidberger | 200 | 24.08.26, 17:32:20 | `b03359bfcd4f` | bestaetigt | Zwei amtlich geführte Ausschüsse ergänzt (Verfassungs-/Rechtsangelegenheiten…, Umwelt- und Klimaschutz). |
| tobias-schulze | 200 | 24.08.26, 17:32:23 | `43bc468e2889` | bestaetigt | Keine Korrektur nötig. |
| niklas-schrader | 200 | 24.08.26, 17:32:25 | `dcebc9e09f47` | bestaetigt | Zwei amtlich geführte Gremien ergänzt (Ausschuss für Verfassungsschutz, 1. Untersuchungsausschuss („Neukölln II“)). |
| bjoern-luettmann | 200 | 24.08.26, 17:32:28 | `946d27d2feca` | abweichung | Mandatsachse korrigiert: amtlich „Landesliste SPD-Fraktion, Platz 7“ (kein Wahlkreis-Einzug); Corona-Enquete-Kommission ergänzt. |
| ludwig-scheetz | 200 | 24.08.26, 17:32:30 | `9809ac37260f` | abweichung | Inneres/Kommunales entfernt (amtlich nicht geführt); Sonderausschuss Lausitz und ÖPNV-Enquete-Kommission ergänzt. |
| ulrike-liedtke | 200 | 24.08.26, 17:32:32 | `7c39025242eb` | bestaetigt | Amtliche Schreibweise „Wahlkreis 03 (Ostprignitz-Ruppin I)“ übernommen; Hauptausschuss ergänzt. |
| katja-poschmann | 200 | 24.08.26, 17:32:34 | `656522a0c288` | bestaetigt | Untersuchungsausschuss 8/1 (UA OPR) ergänzt; „Landesliste Platz 8“ übernommen. |
| steeven-bretz | 200 | 24.08.26, 17:32:36 | `4f50a1326529` | abweichung | Hauptausschuss als ordentliche Mitgliedschaft; stellv. Wirtschaftsausschuss-Altangabe (2019–2024) entfernt; Listenplatz 5 amtlich geklärt. |
| kristy-augustin | 200 | 24.08.26, 17:32:39 | `10352e77fdcb` | abweichung | Rechts-/Digitalisierungsausschuss und UA 8/1 ergänzt; unbelegte stellv. Landwirtschafts-Angabe entfernt. |
| niels-olaf-lueders | 200 | 24.08.26, 17:32:42 | `f8807639992c` | abweichung | Rechts-/Digitalisierungsausschuss entfernt (amtlich nicht geführt); UA 8/1 und Parlamentarische Kontrollkommission ergänzt. |
| christian-dorst | 200 | 24.08.26, 17:32:43 | `ca2215cb42b3` | abweichung | Vier nicht amtlich geführte Angaben entfernt (Bürokratieabbau, Inneres/Kommunales, Bildung/Jugend/Sport, stellv. Rechtsausschuss); Corona-Enquete ergänzt; Listenplatz 12 übernommen. |
| jenny-meyer | 200 | 24.08.26, 17:32:45 | `ed12bdfbe9d7` | abweichung | Amtlicher Name „Ausschuss für Infrastruktur und Landesplanung“; beide Mitgliedschaften ordentlich; vier stellv. Altangaben entfernt. |
| falk-peschel | 200 | 24.08.26, 17:32:48 | `bce46fa40c4c` | abweichung (Bericht gekappt) | Hauptausschuss und drei stellv. Angaben entfernt (amtlich nicht (mehr) geführt — jüngere Umbesetzung); Bildung/Jugend/Sport und Sonderausschuss Lausitz bestätigt. Lauf-1-Bericht teilweise gekappt; Lauf 2 maßgeblich. |

Die SHA256-Werte, Redirect-Ketten, Inhaltstypen und Abrufdauern je Seite stehen vollständig im
JSON-Artefakt des jeweiligen Actions-Laufs (`profil-quellen-verifikation`, 30 Tage aufbewahrt)
und in dessen Job-Log zwischen den Markern `PQV-REPORT-BEGIN`/`PQV-REPORT-END`.
