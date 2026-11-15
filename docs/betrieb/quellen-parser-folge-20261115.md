# Quellenparser: nachgewiesene Folgekorrekturen

Stand 15.11.2026, 00:28 UTC. Betreiberauftrag: belegte Blocker autonom beheben,
bis zu 20 auftragsbezogene Merges nur bei Gruen. Keine zusaetzlichen bezahlten
Modelle, Datenresets oder geschuetzten Production-Aktionen.

Die bestehende BMG-Korrektur und der wiederhergestellte Lage-Leervertrag werden
in PR #1203 geprueft. Dieser Folgestand korrigiert vier weitere konkrete Ursachen:

- Amtliche hib-Feeds haengen exakt ` - Deutscher Bundestag` an den Titel an.
  Der Vergleich mit H1/og:title entfernt diesen bekannten Zusatz nur am hib-Pfad;
  Dokumentmetadaten bleiben unveraendert. Der vorhandene Volltextleser liefert am
  konkret geprueften Original drei ganze Absaetze/971 Zeichen.
- BMAS verwendet `BMAS - ` im og:title, `website` als Typ und eine eindeutige
  amtliche Einleitung mit Tagesdatum. Nur dieser Quellenpfad und die vollstaendige
  erste Einleitung werden gebunden, keine Zitate oder weiteren Aussagen.
- ZDF verwendet einen Mainbereich ohne articleBody. Nur sein erster ganzer Absatz
  wird bestaetigt, wenn er wortgleich der Article-Beschreibung entspricht. URLs,
  strukturierter Titel und og:title muessen passen. Der sichtbare Zeitpunkt stimmt
  exakt mit dem Feed ueberein; JSON-LD-Sekunden muessen in derselben Minute liegen.
  Drei exakt belegte reine Darstellungsstile sind zugelassen; versteckte, andere
  oder zusaetzliche Stile bleiben gesperrt. Kein Volltextversprechen.
- BMG-Presse hat vor dem eigentlichen Text ein gekennzeichnetes PDF-Downloadfeld.
  Genau der erste Absatz des ersten sichtbaren Text-Medien-Abschnitts wird gelesen;
  davor darf kein anderer Absatz ausserhalb des expliziten Downloadwidgets stehen.
  Die Provenienz nennt `html-content-p`, nicht einen angeblichen Artikelanfang.

Keine generelle Titelnaehe, kein URL-Raten, keine Uebernahme neuer Uhrzeiten,
kein Cache- oder Jobreset. Ein- und zweistellige gleiche sichtbare BMG-Tage bleiben
beide gueltig, damit vorhandene positive Belege nicht entwertet werden.

## Echte Originalnachweise

Die sechs Vorher-/Nachher-Nachweise stehen ohne Originaltexte im
[Manifest](quellen-parser-folge-20261115.json). Sie verwenden jeweils dieselben
hashgeprueften gespeicherten Originalbytes. Fuenf neue Folgefaelle und der bestehende
BMG-Nachweis sind positiv; das beweist keine Reparatur aller historischen Jobs.
Rohantworten nur lokal in `/tmp/helmut-versorgung-originalprobe-20261114/`.
Die neuen oeffentlichen GETs waren einzelne kostenfreie Originaldiagnosen.

Lokale Pruefung ueber `scripts/lokal.js`: bestehende Quellenlayoutsuite 25/25
Gruppen gruen; Bundestagssuite einschliesslich neuer Suffix-Gegenfaelle 17 Gruppen
gruen; bestehende generische Gewinnung 11 Gruppen gruen. Keine Modelle oder
Production-Zugriffe durch diese Tests. Syntax und Diffpruefung vor Push.

## Echte Grenzen

Der historische Quellenabschluss bleibt 5 erfolgreich/58 fehlgeschlagen/78
zurueckgestellt. 38 der 58 Fehler tragen ausdruecklich keinen bestaetigten
Originalartikel (NULL/NULL-Publisherverweis); ein Parser kann das nicht ersetzen.
Eine erneut gelesene Bundestags-Pressemitteilung funktioniert bereits ohne neuen
Fix. Ihr alter Negativbeleg beweist keinen weiterhin bestehenden Parserfehler.

Weitere gelesene Originale bleiben sicher gesperrt: Bei der Bundestagsanhoerung
ist 25.11. ein Ereignistermin statt Publikationstag; beim DLF-Original steht ein
anderer Zeitpunkt als im Feed; beim NDR stimmen H1/Article-Titel und Feedtitel
sowie Publikationszeit nicht ueberein. Keine dieser Angaben wird passend gemacht.
Ein Video ohne gebundenen Artikeltext wird nicht als gelesener Artikel ausgegeben.
Aus diesen verbleibenden Faellen folgt keine Freigabe fuer historische Datenkorrektur.

Die native mandatsbezogene Abdeckungsquittung meldet ausserdem vier Fehler,
111 Warnungen und 13 Konfigurationsabweichungen. Parserkorrekturen belegen keine
vollstaendige Pflichtquellenabdeckung. Alle erfolgreichen Job-Payloads und das
gespeicherte Briefing blieben bei der letzten lesenden Kontrolle unveraendert.

Naechster fachlicher Nachweis: den naechsten regulaeren Quellen-/Lage-/Morgenabschluss
lesend gegen die neuen Parser und die weiterhin offenen Quellenfaelle pruefen.
