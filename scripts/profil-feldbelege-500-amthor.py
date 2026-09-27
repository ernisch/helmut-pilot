#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer den einzelnen offenen Profilfall Philipp Amthor.

Roadmap §3: Der bislang einzeln offene Rollenfall ``bundestag-amthor-philipp-1043428``
wird gesondert neu gebunden. Dieses Modul haelt den grossen Assembler
``profil-feldbelege-500.py`` schlank und verwendet die bestehenden sicheren
Quellen-/Personen-/HTML-Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` (kein duplizierter 600-Zeilen-Block,
kein externer Parser). Es prueft ausschliesslich die versionierte, vom
Orchestrator vorbereitete Einzelfallquittung
``docs/betrieb/amthor-aktuelles-amt-1-20260927.json`` gegen die amtlichen
Originaldateien, deren Metadaten/Quittungen und die kanonische 54er
Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEINE hartcodierte Laufzeit, kein externer Parser. Das
    eng fixierte Fachurteil ist injizierbar (``erwartung``),
  * der alte Rollenvalidator mit Pflichtstatus ``belegt`` darf Amthor NICHT
    uebernehmen: sein 54er-Eintrag ist historisch ``offen``. Die kanonische
    Bundestags-Person wird daher separat neu gebunden (Name + URL + Hash) und die
    54er Quittung bleibt unveraendert 48 belegt / 6 offen,
  * nur die eine kanonische Kennung (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben- und 2 BMWSB-Achsen),
  * aktuelle Rolle NUR aus dem geschlossenen eigenen ``div.bpa-richtext``-Lebenslauf
    der Bundesregierungs-Personenseite: eigener p-Absatz mit ``Seit 29. Juli 2026``
    UND ``Staatsminister fuer Bund-Laender-Zusammenarbeit beim Bundeskanzler``;
    Meta/Bildunterschrift allein sind KEIN Beleg, der vorige PSts-Absatz
    (2025 bis 2026, Digitales) bleibt ausdruecklich historisch,
  * Aufgabenthema NUR aus genau EINEM echten ``li`` mit ``strong``
    ``Staatsminister fuer die Bund-Laender-Beziehungen`` unter der h2
    ``Das sagte der Kanzler zu den neuen Personalien:``; die Ankuendigung vom
    24. Juli 2026 belegt den Amtsantritt NICHT, kein Digitalamt als aktuell,
    keine persoenliche politische Position, keine fremden Personalien,
  * beide Zusatzquellen an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei
    jeweils Original UND Metadatum gebunden.
"""

from __future__ import annotations

import datetime as _dt
import html as _html
import importlib.util as _importlib_util
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

AMTHOR = REPO_ROOT / "docs" / "betrieb" / "amthor-aktuelles-amt-1-20260927.json"
AMTHOR_RESSOURCE = "docs/betrieb/amthor-aktuelles-amt-1-20260927.json"

GESAMT = 1
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "kanzleramt-aufgabe"
QUELLHOST = "bundesregierung.de"
QUELLHOSTS = {"bundestag.de", QUELLHOST}

MONATE = {
    "januar": 1, "februar": 2, "maerz": 3, "märz": 3, "april": 4, "mai": 5,
    "juni": 6, "juli": 7, "august": 8, "september": 9, "oktober": 10,
    "november": 11, "dezember": 12,
}
DATUM_DE = re.compile(r"^\d{1,2}\.\s+([A-Za-zÄÖÜäöü]+)\s+\d{4}$")


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_amthor", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()

# Bewusst eng fixiertes, am Original manuell abgenommenes Fachurteil. Es ist fuer
# synthetische Testfixtures vollstaendig injizierbar (``erwartung``).
ERWARTUNG = {
    "bundestag-amthor-philipp-1043428": {
        "region": REGION,
        "bindungsart": BINDUNGSART,
        "person": "Philipp Amthor",
        "funktion": "Staatsminister für Bund-Länder-Zusammenarbeit beim Bundeskanzler",
        "amtsbeginn": "29. Juli 2026",
        "rolleZitat": "Seit 29. Juli 2026 Staatsminister für Bund-Länder-Zusammenarbeit beim Bundeskanzler",
        "vorherigeRolle": (
            "2025 bis 2026 Parlamentarischer Staatssekretär beim Bundesminister für "
            "Digitales und Staatsmodernisierung"
        ),
        "rolleAbschnitt": (
            "Geschlossener eigener div.bpa-richtext-Lebenslauf der Bundesregierungs-Personenseite; "
            "eigener p-Absatz, ausdruecklich nicht Meta/Bildunterschrift"
        ),
        "aufgabenH2": "Das sagte der Kanzler zu den neuen Personalien:",
        "aufgabenStarke": "Staatsminister für die Bund-Länder-Beziehungen",
        "aufgabenzitat": (
            "die politische Zusammenarbeit und den Informationsfluss zwischen der "
            "Bundesregierung und den 16 Landesregierungen koordinieren."
        ),
        "quellpublikationsdatum": "2026-07-24",
        "aufgabenbindung": (
            "Staatsminister für Bund-Länder-Zusammenarbeit beim Bundeskanzler; Koordination der "
            "politischen Zusammenarbeit und des Informationsflusses zwischen der Bundesregierung "
            "und den 16 Landesregierungen"
        ),
        "themen": ["Bund-Länder-Beziehungen"],
        "quelle": {
            "url": "https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/philipp-amthor-2448320",
            "finalUrl": "https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/philipp-amthor-2448320",
            "abgerufenAm": "2026-09-27T20:02:21.668104+00:00",
            "sha256": "75bcb78966c83ab6c23d725a08e2418f1fc384c6c9c1c7de594f5274d0faf91e",
            "bytes": 128940,
            "datei": "amthor-breg-http-neubindung.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "aufgabenquelle": {
            "url": "https://www.bundesregierung.de/breg-de/suche/merz-veraenderungen-im-kabinett--2448244",
            "finalUrl": "https://www.bundesregierung.de/breg-de/suche/merz-veraenderungen-im-kabinett--2448244",
            "abgerufenAm": "2026-09-27T18:42:39.203471+00:00",
            "sha256": "be03d07df8b134c9d612f634c74cadaec7d5f754a8dd0b2ce67ac65bab2fa20c",
            "bytes": 136311,
            "datei": "amthor-aufgaben-kabinett-20260724.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    }
}


class AmthorFehler(Exception):
    """Fail-closed-Abbruch der Amthor-Einzelfallpruefung."""


# ── Sichere Helfer (wiederverwendet, nur der zulaessige Host wird erweitert) ───────────────

def _pruefe_zusatzquelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str) -> tuple:
    """Bindet eine amtliche Zusatzquelle an Metadatum und echtes Original.

    Wie der Zusatzaufgaben-Quellenleser, aber fuer den Bundesregierungs-Host. Die
    strengen Bindungen (URL/finalUrl/Abrufzeit/Hash/Bytezahl/Datei/HTTP/Original)
    bleiben unveraendert; die Metadatendatei muss auch den beobachteten HTTP-Status tragen.
    """
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise AmthorFehler(f"Amthor: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise AmthorFehler(f"Amthor: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise AmthorFehler(f"Amthor: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, kennung)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise AmthorFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise AmthorFehler(f"Amthor: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if str(meta.get("http")) != str(quelle.get("http")):
        raise AmthorFehler(f"Amthor: Metadatum http weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise AmthorFehler(f"Amthor: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise AmthorFehler(f"Amthor: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if ZU._quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise AmthorFehler(
            f"Amthor: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise AmthorFehler(f"Amthor: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


def _datum_de(wert: str) -> _dt.date:
    """Strenges deutsches Datum (Tag. Monat Jahr) — keine Ableitung aus Abrufzeiten."""
    text = ZU._norm(wert)
    treffer = re.match(r"^(\d{1,2})\.\s+([A-Za-zÄÖÜäöü]+)\s+(\d{4})$", text)
    if not treffer:
        raise AmthorFehler(f"Amthor: ungueltiges deutsches Datum {wert!r}.")
    monat = MONATE.get(treffer.group(2).lower())
    if monat is None:
        raise AmthorFehler(f"Amthor: unbekannter Monat in {wert!r}.")
    return _dt.date(int(treffer.group(3)), monat, int(treffer.group(1)))


class _Richtextbloecke(HTMLParser):
    """Alle geschlossenen, innersten ``div.bpa-richtext``-Bloecke eines Dokuments.

    Skripte, Vorlagen, Navigation und Bildunterschriften sind kein Beleg; ein
    aeusserer Block, der einen inneren ``bpa-richtext`` enthaelt, wird verworfen,
    damit nur der eigentliche Lebenslaufabschnitt zaehlt.
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav", "figcaption"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.rahmen = []
        self.bloecke = []
        self.absatz = None
        self.h1 = None
        self.namen = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag == "h1" and "bpa-accessibility" in dict(attrs).get("class", "").split():
            self.h1 = []
        if tag == "p" and self.rahmen:
            if self.absatz is not None:
                raise AmthorFehler("Amthor: verschachtelter Lebenslaufabsatz.")
            self.absatz = []
        if tag == "div":
            klassen = dict(attrs).get("class", "").split()
            richtext = "bpa-richtext" in klassen
            if richtext and any(f["richtext"] for f in self.rahmen):
                for f in reversed(self.rahmen):
                    if f["richtext"]:
                        f["verschachtelt"] = True
                        break
            self.rahmen.append({"richtext": richtext, "verschachtelt": False, "teile": [], "absaetze": []})

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "h1" and self.h1 is not None:
            self.namen.append(ZU._norm(" ".join(self.h1)))
            self.h1 = None
        if tag == "p" and self.absatz is not None:
            if self.rahmen:
                self.rahmen[-1]["absaetze"].append(ZU._norm(" ".join(self.absatz)))
            self.absatz = None
        if tag == "div" and self.rahmen:
            rahmen = self.rahmen.pop()
            if rahmen["richtext"] and not rahmen["verschachtelt"]:
                self.bloecke.append(rahmen["absaetze"])
            if self.rahmen:
                self.rahmen[-1]["teile"].extend(rahmen["teile"])
                self.rahmen[-1]["absaetze"].extend(rahmen["absaetze"])

    def handle_data(self, data):
        if not self.ausgelassen:
            if self.h1 is not None:
                self.h1.append(_html.escape(data))
            if self.absatz is not None:
                self.absatz.append(_html.escape(data))
        if self.rahmen and not self.ausgelassen:
            self.rahmen[-1]["teile"].append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.absatz is not None or parser.h1 is not None:
            raise AmthorFehler("Amthor: HTML-Belegabschnitt unvollstaendig.")
        return list(parser.bloecke), parser.namen


class _Publikationsdatum(HTMLParser):
    """Nur geschlossene Datums-li im eigenen Artikelkopf; keine Fusszeile."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen, self.divs, self.teile, self.datumswerte = [], [], None, []
        self.header = 0
        self.anzahl = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        attrs = dict(attrs)
        if tag == "div":
            ziel = attrs.get("id") == "rs_reading_area_header"
            self.divs.append(ziel)
            self.anzahl += int(ziel)
        if tag == "header" and any(self.divs) and "bpa-article-header" in attrs.get("class", "").split():
            self.header += 1
        if tag == "li" and self.header and "bpa-collection-item" in attrs.get("class", "").split():
            self.teile = []

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "li" and self.teile is not None:
            self.datumswerte.append(ZU._norm(" ".join(self.teile)))
            self.teile = None
        if tag == "header":
            self.header = 0
        if tag == "div" and self.divs:
            if self.divs.pop():
                self.header = 0

    def handle_data(self, data):
        if self.teile is not None and not self.ausgelassen:
            self.teile.append(_html.escape(data))

    @classmethod
    def pruefe(cls, text):
        parser = cls()
        parser.feed(text)
        parser.close()
        if (parser.anzahl != 1 or parser.divs or parser.ausgelassen or
                parser.teile is not None or parser.datumswerte.count("Freitag, 24. Juli 2026") != 1):
            raise AmthorFehler("Amthor: Ankuendigungsdatum im eigenen Artikelkopf fehlt/ist mehrdeutig.")


def _pruefe_rolle(text: str, erwartet: dict, kennung: str) -> str:
    """Aktuelle Rolle NUR aus dem geschlossenen eigenen bpa-richtext-Lebenslauf."""
    bloecke, namen = _Richtextbloecke.lese(text)
    zitat = ZU._norm(erwartet["rolleZitat"])
    treffer = [block for block in bloecke if block.count(zitat) == 1]
    if len(treffer) != 1:
        raise AmthorFehler(
            f"Amthor: die aktuelle Rolle steht nicht in genau einem geschlossenen "
            f"div.bpa-richtext-Lebenslauf ({kennung})."
        )
    block = treffer[0]
    if ZU._norm(erwartet["vorherigeRolle"]) not in block:
        raise AmthorFehler(
            f"Amthor: der vorige PSts-Absatz (2025 bis 2026, historisch) fehlt im Lebenslauf ({kennung})."
        )
    if re.search(r"\bbis\b", zitat, re.IGNORECASE):
        raise AmthorFehler(f"Amthor: die aktuelle Rolle darf keine historische 'bis'-Rolle sein ({kennung}).")
    if not zitat.startswith("Seit "):
        raise AmthorFehler(f"Amthor: die aktuelle Rolle braucht einen ausdruecklichen 'Seit'-Beginn ({kennung}).")
    if namen != [ZU._norm(erwartet["person"])]:
        raise AmthorFehler(f"Amthor: Bundesregierungs-Personenueberschrift weicht ab ({kennung}).")
    return block


class _Personalienliste(HTMLParser):
    """Liest genau die echten ``li`` der Liste unter der Personalien-h2."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self, ziel_h2: str):
        super().__init__(convert_charrefs=True)
        self.ziel_h2 = ZU._norm(ziel_h2)
        self.ausgelassen = []
        self.kopf = None
        self.h2_gesehen = 0
        self.divs = []
        self.inhalt_anzahl = 0
        self.abschnitt = False
        self.ziel_liste = False
        self.ul = 0
        self.li = 0
        self.kopf_teile = []
        self.li_text = []
        self.li_strong = None
        self.li_strongs = []
        self.eintraege = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag == "div":
            ziel = dict(attrs).get("id") == "rs_reading_area_content"
            self.divs.append(ziel)
            self.inhalt_anzahl += int(ziel)
        if not any(self.divs):
            return
        if re.fullmatch(r"h[1-6]", tag):
            self.abschnitt = False
        if tag == "h2":
            self.kopf = []
            self.kopf_teile = []
        elif tag == "ul" and self.abschnitt and not self.ul:
            self.ul = 1
            self.ziel_liste = True
        elif tag == "ul" and self.ul:
            self.ul += 1
        elif tag == "li" and self.ul:
            self.li += 1
            if self.li == 1:
                self.li_text, self.li_strong, self.li_strongs = [], None, []
        elif tag == "strong" and self.li:
            self.li_strong = []

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "div" and self.divs:
            ziel = self.divs.pop()
            if ziel:
                self.abschnitt = False
        if tag == "h2" and self.kopf is not None:
            if ZU._norm(" ".join(self.kopf)) == self.ziel_h2:
                self.h2_gesehen += 1
                self.abschnitt = True
            self.kopf = None
        elif tag == "ul" and self.ul:
            self.ul -= 1
            if not self.ul and self.ziel_liste:
                self.abschnitt = False
                self.ziel_liste = False
        elif tag == "li" and self.li:
            self.li -= 1
            if not self.li:
                self.eintraege.append({
                    "text": ZU._norm(" ".join(self.li_text)),
                    "strongs": [ZU._norm(s) for s in self.li_strongs],
                })
        elif tag == "strong" and self.li_strong is not None:
            self.li_strongs.append("".join(self.li_strong))
            self.li_strong = None

    def handle_data(self, data):
        if self.ausgelassen:
            return
        if self.kopf is not None:
            self.kopf.append(_html.escape(data))
        if self.li:
            self.li_text.append(_html.escape(data))
            if self.li_strong is not None:
                self.li_strong.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument, ziel_h2: str) -> list:
        parser = cls(ziel_h2)
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.kopf is not None or parser.ul or parser.li:
            raise AmthorFehler("Amthor: HTML-Personalienabschnitt unvollstaendig.")
        if parser.h2_gesehen != 1 or parser.inhalt_anzahl != 1:
            raise AmthorFehler("Amthor: Personalien-h2 oder Artikelinhalt fehlt/ist mehrdeutig.")
        return parser.eintraege


def _pruefe_aufgabe(text: str, erwartet: dict, kennung: str) -> dict:
    """Genau EIN echter li mit dem starken Amtsnamen und Philipp Amthor."""
    eintraege = _Personalienliste.lese(text, erwartet["aufgabenH2"])
    starke = ZU._norm(erwartet["aufgabenStarke"])
    person = ZU._norm(erwartet["person"])
    treffer = [e for e in eintraege if starke in e["strongs"] and person in e["text"]]
    if len(treffer) != 1:
        raise AmthorFehler(
            f"Amthor: es gibt nicht genau einen li mit strong {starke!r} und {erwartet['person']!r} ({kennung})."
        )
    eintrag = treffer[0]
    if eintrag["strongs"] != [starke]:
        raise AmthorFehler(f"Amthor: der li traegt nicht genau den ausdruecklichen starken Amtsnamen ({kennung}).")
    if not ZU._enthaelt_in_reihenfolge(erwartet["aufgabenzitat"], eintrag["text"]):
        raise AmthorFehler(f"Amthor: das Aufgabenzitat steht nicht woertlich in diesem li ({kennung}).")
    andere = [e for e in eintraege if person in e["text"] and e is not eintrag]
    if andere:
        raise AmthorFehler(f"Amthor: es gibt weitere Personalien-li mit Philipp Amthor ({kennung}).")
    return eintrag


def pruefe_amthor(eingang, *, quittung=None, ressortachsen_kennungen=None,
                  aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                  zusatzaufgaben_kennungen=None, bmwsb_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Einzelfallquittung Amthor (fail closed).

    Erzwungen wird: genau EINE kanonische Kennung, disjunkt zu den 19 Ressort-, 6
    Aufgaben-, 2 beratenden, 3 Zusatzaufgaben- und 2 BMWSB-Achsen; die kanonische
    Bundestags-Person (Name + URL + Hash) separat neu gebunden, waehrend der
    54er-Eintrag historisch offen bleibt; die aktuelle Rolle ausschliesslich aus
    dem geschlossenen eigenen ``div.bpa-richtext``-Lebenslauf-p; das Aufgabenthema
    ausschliesslich aus genau einem echten ``li`` unter der Personalien-h2; beide
    Zusatzquellen an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei jeweils
    Original UND Metadatum gebunden. Jede Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "amthor", None)
    if quittung is None:
        if not AMTHOR.is_file():
            raise AmthorFehler(f"Amthor-Quittung fehlt: {AMTHOR_RESSOURCE}.")
        quittung = ZU._lies_json(AMTHOR)
    if not isinstance(quittung, dict):
        raise AmthorFehler(f"Amthor-Quittung fehlt: {AMTHOR_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise AmthorFehler(
            f"Amthor-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise AmthorFehler(f"Amthor-Quittung: unerwartete Bilanz {bilanz!r}.")

    profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    detailseiten = getattr(eingang, "detailseiten", None) or (Path(eingang.verzeichnis) / "detailseiten")
    zusatz = Path(eingang.verzeichnis) / "zusatzquellen"
    if ressortachsen_kennungen is None:
        ressortachsen_kennungen = set(getattr(eingang, "ressortachsen_by_kennung", None) or {})
    if aufgabenachsen_kennungen is None:
        aufgabenachsen_kennungen = set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {})
    if beratendeachsen_kennungen is None:
        beratendeachsen_kennungen = set(getattr(eingang, "beratendeachsen_by_kennung", None) or {})
    if zusatzaufgaben_kennungen is None:
        zusatzaufgaben_kennungen = set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {})
    if bmwsb_kennungen is None:
        bmwsb_kennungen = set(getattr(eingang, "bmwsb_by_kennung", None) or {})
    disjunkt = (
        ("Ressortachse", set(ressortachsen_kennungen)),
        ("Aufgabenachse", set(aufgabenachsen_kennungen)),
        ("beratende Achse", set(beratendeachsen_kennungen)),
        ("Zusatzaufgabenachse", set(zusatzaufgaben_kennungen)),
        ("BMWSB-Achse", set(bmwsb_kennungen)),
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise AmthorFehler("Amthor: Eintrag ohne Kennung.")
        if kennung in index:
            raise AmthorFehler(f"Amthor: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise AmthorFehler(f"Amthor: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise AmthorFehler(f"Amthor: Kennung {kennung} ist bereits eine {name}.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise AmthorFehler(f"Amthor: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise AmthorFehler(f"Amthor: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise AmthorFehler(f"Amthor: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise AmthorFehler(f"Amthor: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("bindungsart") or "").strip() != erwartet["bindungsart"]:
            raise AmthorFehler(f"Amthor: unerwartete Bindungsart ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise AmthorFehler(f"Amthor: Person weicht vom fixierten Urteil ab ({kennung}).")

        # Kanonische Person: SEPARATE Neubindung der zuvor offenen 54er Rolle
        # (NICHT der belegt-Pflichtvalidator) plus echter Bundestags-Detailseite.
        rollen_eintrag = profilrollen.get(kennung)
        if rollen_eintrag is None:
            raise AmthorFehler(f"Amthor: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
        if str(rollen_eintrag.get("status")) != "offen":
            raise AmthorFehler(f"Amthor: die 54er Quittung zu {kennung} muss historisch offen bleiben.")
        if list(rollen_eintrag.get("funktionen") or []):
            raise AmthorFehler(f"Amthor: der offene 54er-Eintrag {kennung} darf keine Rolle tragen.")
        rollen_ref = rollen_eintrag.get("quelle") or {}
        rollen_quelle = ergebnis.get("rollenquelle") or {}
        if (
            rollen_quelle.get("url") != rollen_ref.get("url")
            or rollen_quelle.get("sha256") != rollen_ref.get("sha256")
            or rollen_quelle.get("abgerufenAm") != rollen_ref.get("abgerufenAm")
        ):
            raise AmthorFehler(f"Amthor: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise AmthorFehler(f"Amthor: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
        if abruf.get("parlament") != "bundestag":
            raise AmthorFehler(f"Amthor: Kennung {kennung} ist kein Bundestagsprofil.")
        if rollen_ref.get("url") != abruf.get("url") or rollen_ref.get("sha256") != abruf.get("sha256"):
            raise AmthorFehler(f"Amthor: 54er Rollenquelle weicht vom Abruf ab ({kennung}).")
        detail = Path(detailseiten) / str(abruf.get("datei") or "")
        if not detail.is_file() or ZU._sha256(detail) != rollen_ref.get("sha256"):
            raise AmthorFehler(f"Amthor: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
        namen = ZU._ueberschriften(detail.read_text(encoding="utf-8"), "h1")
        if len(namen) != 1 or namen[0] != ZU._norm(person):
            raise AmthorFehler(f"Amthor: Person passt nicht zur kanonischen Kennung ({kennung}).")

        # Amtliche Zusatzquellen strikt an das fixierte Urteil binden.
        quelle, quelle_text = _pruefe_zusatzquelle(ergebnis, zusatz, kennung, "quelle")
        if dict(quelle) != erwartet["quelle"]:
            raise AmthorFehler(f"Amthor: Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")
        aufgabenquelle, aufgaben_text = _pruefe_zusatzquelle(ergebnis, zusatz, kennung, "aufgabenquelle")
        if dict(aufgabenquelle) != erwartet["aufgabenquelle"]:
            raise AmthorFehler(f"Amthor: Aufgabenquellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Aktuelle Rolle ausschliesslich aus dem geschlossenen eigenen Lebenslauf-p.
        for name in ("funktion", "amtsbeginn", "rolleZitat", "vorherigeRolle", "rolleAbschnitt",
                     "aufgabenH2", "aufgabenStarke", "aufgabenzitat", "quellpublikationsdatum",
                     "aufgabenbindung", "themen"):
            if ergebnis.get(name) != erwartet[name]:
                raise AmthorFehler(f"Amthor: Feld {name} weicht vom fixierten Urteil ab ({kennung}).")
        _pruefe_rolle(quelle_text, erwartet, kennung)
        if "seit" not in str(erwartet["rolleZitat"]).lower():
            raise AmthorFehler(f"Amthor: fixiertes Rollenzitat braucht einen 'Seit'-Beginn ({kennung}).")
        beginn = _datum_de(erwartet["amtsbeginn"])
        abruf_tag = _dt.date.fromisoformat(str(quelle.get("abgerufenAm"))[:10])
        if beginn > abruf_tag:
            raise AmthorFehler(f"Amthor: Amtsbeginn {erwartet['amtsbeginn']!r} liegt in der Zukunft ({kennung}).")
        if str(erwartet["amtsbeginn"]) == str(quelle.get("abgerufenAm"))[:10]:
            raise AmthorFehler(f"Amthor: Amtsbeginn darf nicht aus dem Abrufdatum stammen ({kennung}).")

        # Aufgabe: genau ein echter li; die Ankuendigung belegt den Amtsantritt NICHT.
        eintrag = _pruefe_aufgabe(aufgaben_text, erwartet, kennung)
        _Publikationsdatum.pruefe(aufgaben_text)
        if beginn == _dt.date.fromisoformat(str(erwartet["quellpublikationsdatum"])):
            raise AmthorFehler(f"Amthor: die Ankuendigung darf den Amtsantritt nicht allein belegen ({kennung}).")
        if ZU._norm(erwartet["rolleZitat"]) in ZU._norm(aufgaben_text):
            raise AmthorFehler(f"Amthor: die Ankuendigung darf das aktuelle Rollenzitat nicht tragen ({kennung}).")
        for wert in (erwartet["funktion"], erwartet["aufgabenbindung"]):
            if "digital" in str(wert).lower():
                raise AmthorFehler(f"Amthor: kein Digitalamt als aktuell ({kennung}).")

        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise AmthorFehler(f"Amthor: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")
        themen = erwartet["themen"]
        if len(themen) != 1 or any("digital" in str(t).lower() for t in themen):
            raise AmthorFehler(f"Amthor: genau ein freigegebenes Thema ohne Digitalbezug ({kennung}).")
        if not ZU._enthaelt_in_reihenfolge(themen[0], eintrag["text"]):
            raise AmthorFehler(f"Amthor: Thema {themen[0]!r} steht nicht im gebundenen li ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": erwartet["bindungsart"],
            "person": person,
            "funktion": erwartet["funktion"],
            "amtsbeginn": erwartet["amtsbeginn"],
            "rolleZitat": erwartet["rolleZitat"],
            "vorherigeRolle": erwartet["vorherigeRolle"],
            "rolleAbschnitt": erwartet["rolleAbschnitt"],
            "aufgabenH2": erwartet["aufgabenH2"],
            "aufgabenStarke": erwartet["aufgabenStarke"],
            "aufgabenzitat": erwartet["aufgabenzitat"],
            "quellpublikationsdatum": erwartet["quellpublikationsdatum"],
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "themen": list(themen),
            "ableitungsHinweis": hinweis,
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
            "aufgabenquelle": aufgabenquelle,
        }

    if len(index) != GESAMT:
        raise AmthorFehler(f"Amthor-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
