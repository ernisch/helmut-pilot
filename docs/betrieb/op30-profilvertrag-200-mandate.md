# OP-30 — Importvertrag für Mandatsprofile (Grundlage der 200-Profile-Recherche)

**Stand:** 2026-08-09 · **Rolle:** kanonische Prosa zum Importvertrag.
Maschinenlesbar: [`../../schemas/mandatsprofil-import.schema.json`](../../schemas/mandatsprofil-import.schema.json) ·
Prüfer: [`../../lib/helmut/profil-import.js`](../../lib/helmut/profil-import.js) ·
Beispiel: [`../beispiele/mandatsprofile-beispiel.json`](../beispiele/mandatsprofile-beispiel.json) ·
Nachweis: `scripts/profil-import-test.js` (**58 PASS / 0 FAIL**, 2026-08-09).

> **Dieser Vertrag ist die exakte Grundlage für die spätere Recherche der 200 echten Profile.**
> Was hier nicht steht, muss nicht recherchiert werden. Was hier steht, muss vollständig sein —
> sonst produziert Helmut für dieses Mandat ein leeres Briefing statt einer Lage.
>
> **In diesem Sprint wurde keine einzige echte Person recherchiert und kein Production-Profil
> angelegt.** Die Beispieldatei ist vollständig synthetisch; jede ihrer URLs trägt den Marker
> `/SYNTHETISCH/` und wird vom Prüfer als „keine echte Quelle" gemeldet.

---

## 1 · Warum es diesen Vertrag gibt

Vor dem Sprint gab es keine verbindliche Antwort auf die Frage, **was genau ein Profil tragen
muss**. Die Folge wäre absehbar gewesen: 200 Profile recherchieren, importieren, und dann
feststellen, dass die Hälfte Felder trägt, die Helmut nie liest — und dass ein Drittel eine
Achse vermissen lässt, ohne die kein Matching greift.

Der Vertrag ist deshalb **nicht erfunden, sondern aus dem tatsächlich laufenden Code
abgeleitet**:

| Wo | Was es über das Profil entscheidet |
|---|---|
| `lib/helmut/profile-validation.js` `validateProfile` | ob ein Profil `vollstaendig`, `teilweise`, `nicht_bereit`, `fehlerhaft` oder `deaktiviert` ist |
| `lib/helmut/config.js` `parliamentTypeOf` | ob es als Bundestags- oder Landtagsmandat gilt |
| `lib/helmut/scheduler.js` `personNewsSource` | der **Vollname geht wörtlich** in die Nachrichtensuche (`"<Vollname>"`) |
| `lib/helmut/scheduler.js` `mandateNewsSources` | Partei, Fraktion, Ausschüsse, Themen, Wahlkreis, Bundesland, regionale Themen und Ministerien erzeugen je eine Quellenlinie |
| `lib/helmut/scheduler.js` `topProfileTopics` | es wirken die **ersten fünf** Themen |

`scripts/profil-import-test.js` prüft nicht nur den Vertrag, sondern führt jedes Beispielprofil
durch **genau diese Produktionsfunktionen** und verlangt den Zustand `vollstaendig`. Ein
Vertrag, der nur sich selbst prüft, wäre eine Wunschliste.

## 2 · Pflichtfelder (6)

Ohne diese sechs Felder wird ein Profil **nicht importiert** — kein Teilimport, keine stille
Korrektur.

| Feld | Was hinein gehört | Warum |
|---|---|---|
| `mandatsId` | Kleinbuchstaben, Ziffern, Bindestriche (`erika-beispiel`), 3–64 Zeichen | Sie ist der Mandantenschlüssel in **jeder** Query (`user_id=eq.…`) und Bestandteil jedes Idempotenzschlüssels der Arbeitswarteschlange. **Sie darf sich nie ändern.** |
| `vollname` | vollständiger Name, exakt wie im amtlichen Verzeichnis | Er geht **wörtlich** in die Personensuche. Ein falscher Name ist keine Kosmetik, sondern eine falsche Quelle. |
| `parlament` | `bundestag` · `landtag-berlin` · `landtag-brandenburg` | bestimmt Mandatsebene und zulässige Quellenpakete |
| `bundesland` | bei Landtagsmandaten zwingend das Land des Parlaments | die regionale Achse des Matchings |
| `aktiv` | **immer `false`** | siehe §6 |
| `offizielleQuellen` | mind. eine Quelle mit `art: "parlament-profil"` | Belegpflicht (CLAUDE.md §4.3) |

**Zusätzlich gilt — jeweils „eines von beiden", nie beides leer:**

| Bedingung | Erfüllt durch | Sonst |
|---|---|---|
| Parteizugehörigkeit | `partei` (in der Regel plus `fraktion`) | **oder** ausdrücklich `fraktionslos: true` |
| Region | `wahlkreis` | **oder** `listenmandat: true` **und** `regionHinweis` |
| Fachliche Achse | mind. ein `ausschuesse`-Eintrag | **oder** mind. ein `themen`-Eintrag |

Eine leere Angabe ist keine Aussage. Wer fraktionslos ist, sagt das — er lässt das Feld nicht weg.

## 3 · Optionale Felder (18)

`namensvarianten` · `fraktion` · `partei` · `fraktionslos` · `wahlkreis` · `listenmandat` ·
`regionHinweis` · `ausschuesse` · `stellvertretendeAusschuesse` · `themen` ·
`berichterstatterThemen` · `funktionen` · `regierungsrolle` · `regionaleThemen` ·
`relevanteMinisterien` · `kiBudgetTaeglichCent` · `kiBudgetMonatlichCent` · `notiz`

(Einige davon sind über die Bedingungen in §2 faktisch Pflicht — der Vertrag verlangt sie aber
nicht einzeln, sondern als Alternative.)

**Ein unbekanntes Feld ist ein Fehler, kein Extra.** Es bedeutet fast immer, dass jemand etwas
recherchiert hat, das Helmut nie liest.

## 4 · Belegpflicht: welche Quelle zählt

| Parlament | Amtlicher Host | Was **nicht** zählt |
|---|---|---|
| `bundestag` | `bundestag.de` | — |
| `landtag-berlin` | `parlament-berlin.de` | — |
| `landtag-brandenburg` | `landtag.brandenburg.de` | — |

Zusätzlich abgelehnt, jeweils mit eigener Fehlermeldung:

- **Suchseiten** (`news.google.com`, `?q=…`) — eine Suche ist kein Beleg.
- **kein `https`**.
- **Fraktions- oder Parteiseiten als `parlament-profil`** — das ist Selbstauskunft. Dafür gibt
  es `fraktion-profil` und `partei-profil`; sie sind optional und ersetzen den amtlichen
  Nachweis nicht.

## 5 · Dublettenprüfung über drei Achsen

Jede fängt eine andere Art Fehler:

| Achse | Fängt | Warum die anderen es nicht fangen |
|---|---|---|
| gleiche `mandatsId` | zwei Zeilen meinen denselben Mandanten | technisch fatal, aber offensichtlich |
| gleicher `vollname` | dieselbe Person zweimal recherchiert | fachlich fatal |
| gleiche amtliche Profilseite | zwei **verschiedene** Kennungen mit **verschiedenen** Namen zeigen auf dieselbe Person | genau diesen Fall sehen die ersten beiden Prüfungen nicht — belegt in `profil-import-test.js` 5.4 |

## 6 · Regel für den deaktivierten Import — verbindlich

> **Ein Import aktiviert niemals ein Mandat.**

- Jedes importierte Profil trägt `aktiv: false`. Die Abbildung nach Helmut setzt
  `profileActive: false` **unabhängig vom Eingang**.
- Ein Datensatz mit `aktiv: true` wird **abgelehnt**, nicht stillschweigend korrigiert. Eine
  stille Korrektur wäre eine Absichtserklärung; eine Ablehnung ist eine Sperre.
- Das Aktivieren ist eine **getrennte, freigabepflichtige Betreiberentscheidung**
  (CLAUDE.md §5) und läuft über den bestehenden Weg, nicht über den Import.
- Der Prüfer weist in jeder Zusammenfassung ausdrücklich aus, ob **alle** Profile deaktiviert
  sind (`alleAktivFalse`).

Ein deaktiviertes Profil wird vom Scheduler nicht eingeplant — seit der Korrektur B4 des
Abschlussreviews über das verbindliche Projektprädikat `profile-validation.isDisabled`.
200 importierte, deaktivierte Profile erzeugen also **keine Last und keine Kosten**.

## 7 · Vorgehen für die spätere Recherche

1. Je Mandat die **amtliche Profilseite** öffnen und von dort abschreiben — nicht aus Wikipedia,
   nicht aus einer Fraktionsseite.
2. `mandatsId` aus dem Vollnamen bilden (Kleinbuchstaben, Bindestriche, keine Umlaute:
   `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`). Bei Namensgleichheit einen unterscheidenden Zusatz
   anhängen — die Kennung ist danach unveränderlich.
3. Ausschüsse in **amtlicher Bezeichnung** übernehmen.
4. Themen: die **fünf wichtigsten zuerst** — nur sie wirken auf die Quellen.
5. `aktiv: false` setzen. Immer.
6. Datei prüfen, **bevor** jemand sie anfasst:
   ```
   node -e 'const i=require("./lib/helmut/profil-import");
     console.log(i.berichte(i.pruefeImport(require("./meine-datei.json"))))'
   ```
   Der Bericht nennt je Fehler die Stelle **und** was zu tun ist.
7. Erst wenn `ERGEBNIS: importierbar` steht, ist die Recherche fertig.

## 8 · Was dieser Vertrag ausdrücklich **nicht** leistet

- Er **legt nichts an**. Das Anlegen von Mandanten bleibt `lib/helmut/provisioning.js` und damit
  eine bewusste Betreiberhandlung.
- Er prüft **keine Erreichbarkeit** der Quellen-URLs (das wäre ein Netzzugriff und gehört nicht
  in eine Offline-Prüfung).
- Er prüft **nicht die Richtigkeit** der Angaben — nur ihre Form, ihre Vollständigkeit und ihre
  Belegbarkeit. Ob eine Person wirklich in diesem Ausschuss sitzt, entscheidet die amtliche
  Quelle, nicht der Validator.
