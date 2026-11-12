# Fehlendes Tagesbriefing: Diagnose und Reparatur, 12.11.2026

## Produktionsbefund vor der Reparatur

Rein lesende Aufnahme am12.11.,06:22–06:30UTC. Production953c1dfe,
Vercel dpl_4EEymRutzUa22MEq32GFJDFP719v READY. Der Quellenlauf03:00–03:04:29
hat69 neue Rohdokumente geholt, aber keinen neuen vollstaendigen Wissensstand
erzeugt. Juengster vollstaendiger Wissensstand09.11.,04:02:58UTC.
Lage05:00 lief auf altem Bestand; Morgenbriefing05:15 meldete
`morgenversorgung-unvollstaendig`. Ein heutiger Erstellungszeitpunkt belegt
keine heutigen Inhalte.

Erstes Fenster:1/8 und300/2400Sekunden reserviert. Sechs endgueltig gescheiterte
Verstehensjobs verhindern die automatische Fortsetzung. Heutiges Manifest
119/158 eingereiht; der gestrige Plan wurde zuvor vollstaendig abgeschlossen.
Die restlichen sieben Termine sind keine automatische Fehlerbehebung.

## Nachgewiesene Ursachen

1. In30 archivierten Quellen der ersten beiden fehlgeschlagenen Auftraege
   fehlt `content_hash`. Quellenkennung und unveraenderlicher Quellenhash
   sind korrekt. Der gebundene Leser erhaelt die NULL-Werte; Dedup entfernt
   alle30 Zeilen und die anschliessende Restbindung scheitert. Der Fix leitet
   ausschliesslich das technische Dedupfeld aus der bereits geprueften
   kanonischen Kennung ab. Gebundene Texte, Daten, Originale und Quellenhashes
   bleiben unveraendert; widerspruechliche vorhandene Hashes bleiben gesperrt.
2. Die fruehe Wache `restzeit-vor-quellenbindung` wurde als echter Fehlversuch
   behandelt. Jetzt wird der Job vor weiterer Quellenlesung/Beschaffung,
   Budgetreservierung und Modellstart vertagt. Der Worker gibt seinen
   unbegonnenen Stapelrest zurueck und beendet das Fenster ohne weitere Claims.
   Andere Fehler behalten ihren bisherigen Fehlerpfad.
3. Amtliche Bundestags-HIB-/Presseseiten liefern `og:url` und ein amtliches
   Tagesdatum statt der vom allgemeinen Leser verlangten Canonical-/JSON-LD-
   Struktur. Zwei echte oeffentliche HTML-Antworten reproduzieren die Ablehnung.
   Der spezielle Bundestagsleser wird fuer diese belegten Artikelwege und
   die vollstaendige Artikelgewinnung angeschlossen; Titel, Ziel und Datum
   bleiben gebunden, ein Leitabsatz wird nicht als Vollartikel bezeichnet.

Zwei weitere Metadatenwidersprueche in einem alten Quellenauftrag sind echte
Bindungsabweichungen: geaenderter Titelsuffix beziehungsweise geaenderte
Publikationsuhrzeit. Diese werden nicht durch Lockerung der Quellenpruefung
akzeptiert. Alle42 untersuchten Archivzeilen bleiben unveraendert erhalten.

## Grenzen und Nachlauf

Ein heutiges unvollstaendiges Morgenpaket kann im bestehenden Handler noch
heute durch einen vollstaendigen Nachlauf ersetzt werden. Das ist bereits im
vorhandenen CAS-/Paketnachweis getestet; kein neuer Zeitplan erforderlich.

Vorbefund Kosten: heute0,012071USD, keine heutigen offenen Geldreservierungen;
gebundener Gesamtbestand1,244553USD einschliesslich historischer Reserven.
Bestehender Vertrag1USD/UTC-Tag und30USD insgesamt, unveraendert.
Originalabrufe heute16/16; alle16 endeten ohne gelieferten Originalbeleg.
Parserkorrekturen setzen weder negative Cachebelege noch Kontingente zurueck.

Codebereitstellung und normale Merges/Deployments sind dauerhaft freigegeben.
Ein manueller Production-Nachlauf samt bezahlter Verarbeitung benoetigt laut
AGENTS.md eine gesonderte konkrete Freigabe. Vorgesehener Umfang nach READY:
nur das vorhandene eine aktive Profil, vorhandene noch freie Arbeitsfenster,
hoechstens sieben weitere Fenster/2100Sekunden Quellenarbeit am selben UTC-Tag,
danach bestehende Lage-/Morgenhandler; unveraenderte1USD/30USD-Gates.
Keine Profil-, Cron-, Budget-, Reserve- oder Secret-Aenderung, keine externen
Nachrichten, kein Zuruecksetzen gescheiterter Quellenversionen.
Vor jedem weiteren Fenster Abschluss und Erstfehler lesen; bei FAIL/UNKNOWN
stoppen statt blind wiederholen. Ein echter Zugriff ueber den angemeldeten
Adminstart bleibt Voraussetzung, kein Secret-Bypass dieses Endpunkts.

Nachkontrolle: neue vollstaendige Wissensobjekte, bestaetigte Projektion,
gespeichertes Tagespaket samt Quellenstand und echte App-Antwort lesen.
Ohne diese Belege bleibt die produktive Wiederherstellung offen.
Rueckweg des Codes: gezielter Revert der Reparatur; Originale, Kostenbuch,
Quellenversionen und bisherige Laufquittungen erhalten.

## Gezielte Pruefungen

Alle lokalen Tests ueber scripts/lokal.js ohne Production-Zugangsdaten.
Hash-/Restbindung24/24, Queue-Inhaltsversorgung29/29, Morgenpaket19/19,
Frischekopf26/26 und schneller Kernschutz14/14 bestanden. Der erste
Kernschutzversuch scheiterte in drei HTTP-Tests an Sandbox-EPERM fuer lokale
Ports; derselbe geschuetzte Lauf ausserhalb der Sandbox bestand vollstaendig.
Der private42-Zeilen-Replay erhaelt alle gebundenen Dokumente und Quellenhashes.
Unabhaengiger Review der Restzeitkorrektur ohne offenen Befund.
Parserabnahme:94 Gruppen in sieben vorhandenen Suiten bestanden. Beide echten
HTML-Fixtures werden vollstaendig gelesen; manipulierte Ziele, Titel, Tage,
versteckte Texte, Sperrmetadaten und widerspruechliche Artikeldeklarationen
bleiben gesperrt. Die beiden HTML-Fixtures enthalten nur oeffentlichen Kopf
und Artikelbereich. Keine Cacheversionsaenderung oder neue Abruffreigabe.
Finale Pflicht-CI und Production-Nachkontrolle folgen am
tatsaechlichen Endstand; hieraus wird noch kein produktiver Erfolg abgeleitet.
