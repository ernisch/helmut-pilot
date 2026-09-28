#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer den einzelnen offenen Profilfall Friedrich Merz.

Roadmap §3: Der bislang einzeln offene Fachachsenfall
``bundestag-merz-friedrich-1046080`` wird ueber genau EINE eng belegte
Bundeskanzler-Aufgabe geschlossen. Dieses Modul haelt den grossen Assembler
``profil-feldbelege-500.py`` schlank und verwendet die bestehenden sicheren
Quellen-/Personen-/HTML-Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein duplizierter 600-Zeilen-
Block, kein externer Parser, kein zweiter Netz-/DB-Weg). Es prueft ausschliesslich
die versionierte, vom Orchestrator vorbereitete Einzelfallquittung
``docs/betrieb/merz-richtlinien-1-20260928.json`` gegen die amtlichen
Originaldateien, deren Metadaten/Quittungen und die kanonische 54er
Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer Parser, keine hartcodierte Laufzeit. Das eng
    fixierte Fachurteil ist injizierbar (``erwartung``),
  * nur die eine kanonische Kennung (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3 Wahlausschuss-, 1
    Jarzombek-, 1 Kloeckner- und 1 Rohde-Achse),
  * die bestehende Rolle NUR aus der belegten 54er Rollenquittung; es wird KEINE
    neue Rolle erfunden. Die kanonische Bundestags-Person wird trotzdem
    eigenstaendig neu gebunden: echte H1 und eigener aktueller Funktionstext
    (genau ein geschlossener, sichtbarer ``div.m-biography__function``) der
    unveraenderten amtlichen Profilseite,
  * die Person wird NUR aus dem echten sichtbaren eigenen Artikelkopf des
    amtlichen Bundesregierungs-Artikels abgeleitet (genau eine eigene
    ``header.bpa-article-header`` im Bereich ``#rs_reading_area_header`` mit
    eigener ``span.bpa-topline-title``). Bild-Alt-Texte, Bildunterschriften und
    JSON-LD sind ausdruecklich KEIN Beleg und werden nie gelesen,
  * die Aufgabe NUR aus dem geschlossenen H2-Abschnitt "Richtlinien-Kompetenz"
    des eigenen, innersten ``div.bpa-richtext`` im Artikelinhalt
    (``#rs_reading_area_content``): genau der Ziel-H2 und genau seine beiden
    eigenen Absaetze. Figuren/Bildunterschriften, Nachbar-H2-Abschnitte
    (Ressort-Prinzip, Regierungs-Koalition, ...), ``--hidden``/``hidden``/``inert``
    und fremde Textfragmente ausserhalb des Abschnitts sind kein Beleg,
  * die amtliche Zusatzquelle wird an URL/finalUrl/sha256/Bytezahl/Abrufzeit/
    HTTP/Datei (Original UND Metadatum) gebunden,
  * fachlich NUR das eine enge Aufgabenthema der Richtlinien-Kompetenz
    ("Richtlinien der Regierungspolitik", am Original woertlich als
    "Richtlinien-Kompetenz" belegt). Keine konkreten politischen Positionen,
    Koalitionsziele, Ressorts oder allgemeinen Ministeriumsthemen.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

MERZ = REPO_ROOT / "docs" / "betrieb" / "merz-richtlinien-1-20260928.json"
MERZ_RESSOURCE = "docs/betrieb/merz-richtlinien-1-20260928.json"

GESAMT = 1
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "richtlinienkompetenz"
QUELLHOSTS = {"bundestag.de", "bundesregierung.de"}

ARTIKELKOPF = "Friedrich Merz ist Bundes-Kanzler"
ARTIKELTITEL = "Aufgaben vom Bundes-Kanzler"
ABSCHNITT = "Richtlinien-Kompetenz"
ABSATZ_1 = (
    "Im Grund-Gesetz steht: Der Bundes-Kanzler hat die Richtlinien-Kompetenz. "
    "Richtlinien-Kompetenz bedeutet: Der Bundes-Kanzler bestimmt, was die Bundes-Regierung "
    "tun soll. Welche Probleme gelöst werden sollen. Welche Aufgaben erledigt werden sollen."
)
ABSATZ_2 = "Das Bundes-Kanzler bestimmt die Politik von der Bundes-Regierung."
FUNKTION = "Bundeskanzler"
FUNKTIONSTEXT = "Bundeskanzler"
THEMEN = ["Richtlinien der Regierungspolitik"]
AUFGABENBINDUNG = (
    "Bundeskanzler; Richtlinien-Kompetenz nach Grund-Gesetz "
    "(Der Bundes-Kanzler bestimmt die Richtlinien der Regierungspolitik, "
    "also was die Bundes-Regierung tun soll)"
)

# Diese ausdruecklichen Nachbar-Themen des Artikels duerfen NIE ein Thema werden
# (Ressorts, Koalitionsziele, allgemeine Regierungs-/Ministeriumsthemen).
VERBOTENE_THEMEN = (
    "ressort", "koalition", "vize-kanzler", "minister", "ministerium", "ministerien",
    "krieg", "geschäfts-ordnung", "verantwortung", "zustimmung", "regierungs-bildung",
    "regierungs-politik", "wahl", "gesetz", "präsident",
)


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_merz", pfad)
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
    "bundestag-merz-friedrich-1046080": {
        "region": REGION,
        "bindungsart": BINDUNGSART,
        "person": "Friedrich Merz",
        "funktion": FUNKTION,
        "funktionstext": FUNKTIONSTEXT,
        "artikelkopf": ARTIKELKOPF,
        "artikeltitel": ARTIKELTITEL,
        "abschnitt": ABSCHNITT,
        "absaetze": [ABSATZ_1, ABSATZ_2],
        "aufgabenbindung": AUFGABENBINDUNG,
        "themen": list(THEMEN),
        "personenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/M/merz_friedrich-1046080",
            "finalUrl": "https://www.bundestag.de/abgeordnete/biografien/M/merz_friedrich-1046080",
            "abgerufenAm": "2026-09-27T13:00:52.405228+00:00",
            "sha256": "533711ffb50fca94e2bc01a6f26761a7909741aa7cb91a705a895701071baaf7",
            "bytes": 274264,
            "datei": "bundestag-merz_friedrich-1046080.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "quelle": {
            "url": "https://www.bundesregierung.de/breg-de/leichte-sprache/leichte-sprache-aufgaben-vom-bundes-kanzler-2342922",
            "finalUrl": "https://www.bundesregierung.de/breg-de/leichte-sprache/leichte-sprache-aufgaben-vom-bundes-kanzler-2342922",
            "abgerufenAm": "2026-09-28T11:04:55+00:00",
            "sha256": "64fe7461d8ecd2aaa6f2374f707322220f0c40bb53afd31fdfb1029a962a9022",
            "bytes": 97984,
            "datei": "breg-leichte-sprache-aufgaben-bundeskanzler-2342922.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    }
}


class MerzFehler(Exception):
    """Fail-closed-Abbruch der Merz-Einzelfallpruefung."""


# ── Sichtbarkeit: verborgene/inerte Inhalte sind nie ein Beleg ────────────────────────────

def _unsichtbar(attrs: dict) -> bool:
    if "hidden" in attrs or "inert" in attrs:
        return True
    if str(attrs.get("aria-hidden") or "").lower() == "true":
        return True
    if "--hidden" in str(attrs.get("class") or "").split():
        return True
    stil = str(attrs.get("style") or "").replace(" ", "").lower()
    return "display:none" in stil or "visibility:hidden" in stil


class _Artikelkopf(HTMLParser):
    """Echter sichtbarer eigener Artikelkopf (Topline + Titel).

    Bindet die Person ausschliesslich an den sichtbaren Kopftext des eigenen
    Artikels (``header.bpa-article-header`` im Bereich ``#rs_reading_area_header``).
    Bild-Alt-Texte, Bildunterschriften und JSON-LD werden nicht gelesen.
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.versteckt = 0
        self.rahmen = []
        self.bereich = 0
        self.bereich_tiefe = None
        self.kopf = 0
        self.kopf_tiefe = None
        self.topline = None
        self.topline_tiefe = None
        self.titel = None
        self.titel_tiefe = None
        self.toplines = []
        self.titeltexte = []
        self.header_anzahl = 0
        self.bereich_anzahl = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in self.VOID:
            return
        attrs = dict(attrs)
        unsichtbar = _unsichtbar(attrs)
        tiefe = len(self.rahmen) + 1
        klassen = str(attrs.get("class") or "").split()
        if tag == "div" and attrs.get("id") == "rs_reading_area_header":
            self.bereich_anzahl += 1
            self.bereich = 1
            self.bereich_tiefe = tiefe
        if self.bereich:
            if tag == "header" and "bpa-article-header" in klassen:
                self.header_anzahl += 1
                self.kopf = 1
                self.kopf_tiefe = tiefe
            if self.kopf:
                if tag == "span" and "bpa-topline-title" in klassen:
                    self.topline = []
                    self.topline_tiefe = tiefe
                elif tag == "span" and "bpa-teaser-title-text-inner" in klassen:
                    self.titel = []
                    self.titel_tiefe = tiefe
        self.rahmen.append({"tag": tag, "unsichtbar": unsichtbar})
        if unsichtbar:
            self.versteckt += 1

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index]["tag"] == tag:
                position = index
                break
        if position is None:
            return
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index]["unsichtbar"]:
                self.versteckt -= 1
        del self.rahmen[position:]
        if tag == "span" and self.topline is not None and position + 1 == self.topline_tiefe:
            self.toplines.append(ZU._norm(" ".join(self.topline)))
            self.topline = None
        elif tag == "span" and self.titel is not None and position + 1 == self.titel_tiefe:
            self.titeltexte.append(ZU._norm(" ".join(self.titel)))
            self.titel = None
        elif tag == "header" and self.kopf and position + 1 == self.kopf_tiefe:
            self.kopf = 0
        elif tag == "div" and self.bereich and position + 1 == self.bereich_tiefe:
            self.bereich = 0
            self.kopf = 0

    def handle_data(self, data):
        if self.ausgelassen or self.versteckt:
            return
        if self.topline is not None:
            self.topline.append(_html.escape(data))
        if self.titel is not None:
            self.titel.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> tuple:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if (parser.ausgelassen or parser.rahmen or parser.versteckt or parser.topline is not None
                or parser.titel is not None):
            raise MerzFehler("Merz: HTML-Artikelkopf unvollstaendig (offene oder verborgene Elemente).")
        if parser.bereich_anzahl != 1 or parser.header_anzahl != 1:
            raise MerzFehler(
                "Merz: es gibt nicht genau einen geschlossenen eigenen Artikelkopf "
                "(#rs_reading_area_header > header.bpa-article-header)."
            )
        if len(parser.toplines) != 1 or len(parser.titeltexte) != 1:
            raise MerzFehler("Merz: Topline und Titel des eigenen Artikelkopfs fehlen oder sind mehrdeutig.")
        return parser.toplines[0], parser.titeltexte[0]


def _pruefe_artikelkopf(quelle_text: str, erwartet: dict, kennung: str) -> tuple:
    """Person und Amt NUR aus dem sichtbaren eigenen Artikelkopf des Originals."""
    topline, titel = _Artikelkopf.lese(quelle_text)
    if topline != ZU._norm(erwartet["artikelkopf"]):
        raise MerzFehler(f"Merz: Artikelkopf-Topline weicht vom fixierten Urteil ab ({kennung}).")
    if titel != ZU._norm(erwartet["artikeltitel"]):
        raise MerzFehler(f"Merz: Artikeltitel weicht vom fixierten Urteil ab ({kennung}).")
    if not ZU._enthaelt_in_reihenfolge(erwartet["person"], topline):
        raise MerzFehler(f"Merz: die Person steht nicht im sichtbaren Artikelkopf ({kennung}).")
    if not ZU._enthaelt_in_reihenfolge("Bundes-Kanzler", topline):
        raise MerzFehler(f"Merz: der Artikelkopf nennt nicht das Amt Bundes-Kanzler ({kennung}).")
    return topline, titel


class _Richtextabschnitte(HTMLParser):
    """Alle geschlossenen, innersten ``div.bpa-richtext``-Abschnitte des Artikelinhalts.

    Skripte, Vorlagen, Navigation und Figuren/Bildunterschriften sind kein Beleg; ein
    aeusserer Richtext-Block, der einen inneren ``bpa-richtext`` enthaelt, wird
    verworfen, damit nur der eigentliche Inhaltsblock zaehlt. Nur Abschnitte innerhalb
    von ``#rs_reading_area_content`` und nur echte sichtbare eigene Absaetze
    (direkte ``p``-Kinder des Inhaltsblocks) zaehlen.
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav", "figure"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}
    KOPF = re.compile(r"^h[1-6]$")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.versteckt = 0
        self.rahmen = []
        self.bloecke = []
        self.bereich = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in self.VOID:
            return
        attrs = dict(attrs)
        unsichtbar = _unsichtbar(attrs)
        klassen = str(attrs.get("class") or "").split()
        frame = {
            "tag": tag, "richtext": False, "verschachtelt": False, "im_bereich": self.bereich > 0,
            "id": attrs.get("id"), "unsichtbar": unsichtbar, "abschnitt": None, "abschnitte": [],
            "p_teile": None, "kopf_puffer": None, "kopf_versteckt": False,
        }
        if tag == "div" and attrs.get("id") == "rs_reading_area_content":
            self.bereich += 1
            frame["im_bereich"] = True
        if tag == "div" and "bpa-richtext" in klassen:
            frame["richtext"] = True
            if any(f["richtext"] for f in self.rahmen):
                for f in reversed(self.rahmen):
                    if f["richtext"]:
                        f["verschachtelt"] = True
                        break
        if self.rahmen:
            eltern = self.rahmen[-1]
            if eltern["richtext"] and eltern["im_bereich"]:
                if self.KOPF.match(tag):
                    frame["kopf_puffer"] = []
                    frame["kopf_versteckt"] = unsichtbar or self.versteckt > 0
                elif tag == "p" and eltern["abschnitt"] is not None:
                    frame["p_teile"] = []
        self.rahmen.append(frame)
        if unsichtbar:
            self.versteckt += 1

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index]["tag"] == tag:
                position = index
                break
        if position is None:
            return
        frame = self.rahmen[position]
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index]["unsichtbar"]:
                self.versteckt -= 1
        del self.rahmen[position:]
        eltern = self.rahmen[-1] if self.rahmen else None
        if frame["p_teile"] is not None:
            text = ZU._norm(" ".join(frame["p_teile"]))
            if text and eltern is not None and eltern["richtext"] and eltern["abschnitt"] is not None:
                eltern["abschnitt"]["absaetze"].append(text)
            frame["p_teile"] = None
        if frame["kopf_puffer"] is not None:
            kopf = ZU._norm(" ".join(frame["kopf_puffer"]))
            if eltern is not None and eltern["richtext"] and eltern["im_bereich"]:
                if eltern["abschnitt"] is not None:
                    eltern["abschnitte"].append(eltern["abschnitt"])
                eltern["abschnitt"] = {"kopf": kopf, "absaetze": [], "versteckt": frame["kopf_versteckt"]}
            frame["kopf_puffer"] = None
        if tag == "div" and frame["richtext"] and not frame["verschachtelt"] and frame["im_bereich"]:
            abschnitte = list(frame["abschnitte"])
            if frame["abschnitt"] is not None:
                abschnitte.append(frame["abschnitt"])
            self.bloecke.append(abschnitte)
        if tag == "div" and frame["id"] == "rs_reading_area_content":
            self.bereich -= 1

    def handle_data(self, data):
        if self.ausgelassen or self.versteckt:
            return
        for frame in reversed(self.rahmen):
            if frame["p_teile"] is not None:
                frame["p_teile"].append(_html.escape(data))
                return
            if frame["kopf_puffer"] is not None:
                frame["kopf_puffer"].append(_html.escape(data))
                return

    @classmethod
    def lese(cls, dokument, ziel: str) -> dict:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if (parser.ausgelassen or parser.rahmen or parser.versteckt or parser.bereich):
            raise MerzFehler("Merz: HTML-Richtext-Abschnitt unvollstaendig.")
        treffer = [
            abschnitt
            for bloecke in parser.bloecke
            for abschnitt in bloecke
            if abschnitt["kopf"] == ZU._norm(ziel) and not abschnitt["versteckt"]
        ]
        if len(treffer) != 1:
            raise MerzFehler(
                f"Merz: erwartet genau einen geschlossenen eigenen H2-Abschnitt {ziel!r}, "
                f"gefunden {len(treffer)}."
            )
        return treffer[0]


def _pruefe_aufgabenabschnitt(quelle_text: str, erwartet: dict, kennung: str) -> list:
    """Nur der geschlossene H2-Abschnitt 'Richtlinien-Kompetenz' mit seinen eigenen Absaetzen."""
    abschnitt = _Richtextabschnitte.lese(quelle_text, erwartet["abschnitt"])
    if abschnitt["absaetze"] != [ZU._norm(a) for a in erwartet["absaetze"]]:
        raise MerzFehler(f"Merz: die eigenen Absaetze des H2-Abschnitts weichen ab ({kennung}).")
    return abschnitt["absaetze"]


def _pruefe_themen(erwartet: dict, absaetze: list, kennung: str) -> None:
    """Nur das eine enge Aufgabenthema; am Original woertlich als Richtlinien-Kompetenz belegt."""
    themen = erwartet["themen"]
    if len(themen) != 1 or themen != THEMEN:
        raise MerzFehler(f"Merz: genau das eine freigegebene Thema ist erlaubt ({kennung}).")
    thema = themen[0]
    for verboten in VERBOTENE_THEMEN:
        if verboten in thema.lower():
            raise MerzFehler(f"Merz: allgemeines/fremdes Thema {thema!r} ist gesperrt ({kennung}).")
    if "richtlinien" not in thema.lower():
        raise MerzFehler(f"Merz: das Thema muss die Richtlinien-Kompetenz benennen ({kennung}).")
    # Die Quelle traegt die Aufgabe woertlich als 'Richtlinien-Kompetenz'; genau dieser
    # amtliche Wortlaut muss im gebundenen Absatz stehen (keine freie Themenzuordnung).
    if not any("Richtlinien-Kompetenz" in absatz for absatz in absaetze):
        raise MerzFehler(f"Merz: der gebundene Absatz traegt nicht die woertliche Richtlinien-Kompetenz ({kennung}).")


# ── Quellenbinder (wiederverwendet; nur bundestag.de/bundesregierung.de zulaessig) ────────

def _pruefe_zusatzquelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str) -> tuple:
    """Bindet eine amtliche Zusatzquelle an Metadatum UND echtes Original."""
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise MerzFehler(f"Merz: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise MerzFehler(f"Merz: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise MerzFehler(f"Merz: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, kennung)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise MerzFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise MerzFehler(f"Merz: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if str(meta.get("http")) != str(quelle.get("http")):
        raise MerzFehler(f"Merz: Metadatum http weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise MerzFehler(f"Merz: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise MerzFehler(f"Merz: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if ZU._quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise MerzFehler(
            f"Merz: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise MerzFehler(f"Merz: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


class _Personenname(HTMLParser):
    """Nur echte sichtbare H1, keine Namen in Kommentaren, Skripten oder Vorlagen."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blockiert = []
        self.kopf = None
        self.namen = []
        self.versteckt = 0
        self.kopf_versteckt = False
        self.h1_versteckt = False

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.blockiert.append(tag)
        if self.blockiert:
            return
        if tag == "h1":
            if self.kopf is not None:
                raise MerzFehler("Merz: verschachtelte H1.")
            self.kopf = []
            self.h1_versteckt = _unsichtbar(dict(attrs))
            self.kopf_versteckt = self.h1_versteckt or self.versteckt > 0
            if self.h1_versteckt:
                self.versteckt += 1

    def handle_endtag(self, tag):
        if self.blockiert:
            if tag == self.blockiert[-1]:
                self.blockiert.pop()
            return
        if tag == "h1" and self.kopf is not None:
            self.namen.append("" if self.kopf_versteckt else ZU._norm(" ".join(self.kopf)))
            if self.h1_versteckt:
                self.versteckt -= 1
            self.kopf = None
            self.kopf_versteckt = False
            self.h1_versteckt = False

    def handle_data(self, data):
        if not self.blockiert and self.kopf is not None and not self.kopf_versteckt:
            self.kopf.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.blockiert or parser.kopf is not None:
            raise MerzFehler("Merz: Personenmarkup unvollstaendig.")
        return parser.namen


class _Funktionsblock(HTMLParser):
    """Genau EIN geschlossener, sichtbarer ``div.m-biography__function``-Block."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.versteckt = 0
        self.rahmen = []
        self.bloecke = []
        self.tiefe = 0
        self.block_position = None
        self.teile = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in self.VOID:
            return
        attrs = dict(attrs)
        unsichtbar = _unsichtbar(attrs)
        if tag == "div":
            if self.tiefe:
                self.tiefe += 1
            elif "m-biography__function" in str(attrs.get("class") or "").split():
                self.tiefe = 1
                self.block_position = len(self.rahmen)
                self.teile = []
        self.rahmen.append({"tag": tag, "unsichtbar": unsichtbar})
        if unsichtbar:
            self.versteckt += 1

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index]["tag"] == tag:
                position = index
                break
        if position is None:
            return
        if self.tiefe and position < self.block_position:
            raise MerzFehler("Merz: Funktionstext verlaesst seinen eigenen Abschnitt.")
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index]["unsichtbar"]:
                self.versteckt -= 1
        del self.rahmen[position:]
        if tag == "div" and self.tiefe:
            self.tiefe -= 1
            if not self.tiefe:
                self.block_position = None
                if self.versteckt:
                    raise MerzFehler("Merz: ungeschlossener Verborgener Bereich im Funktionstext.")
                self.bloecke.append(" ".join(self.teile))

    def handle_data(self, data):
        if self.tiefe and not self.ausgelassen and not self.versteckt:
            self.teile.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> str:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.tiefe or len(parser.bloecke) != 1:
            raise MerzFehler("Merz: Funktionstextblock fehlt, ist doppelt oder unvollstaendig.")
        return ZU._norm(parser.bloecke[0])


def _pruefe_personenquelle(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                           detailseiten: Path, kennung: str, erwartet: dict) -> tuple:
    """Bindet die kanonische Bundestags-Person und die BESTEHENDE Rolle separat neu.

    Es entsteht keine neue Rolle: die aktuelle Amtsrolle stammt aus der belegten 54er
    Rollenquittung. Die kanonische Person wird trotzdem eigenstaendig ueber ihre echte
    H1 und den eigenen aktuellen Funktionstext (genau ein geschlossener, sichtbarer
    ``div.m-biography__function``) der unveraenderten amtlichen Profilseite neu
    gebunden.
    """
    personenquelle = ergebnis.get("personenquelle") or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(personenquelle.get(name) or "") == "":
            raise MerzFehler(f"Merz: Personenquellenfeld {name} fehlt ({kennung}).")
    datei_name = str(personenquelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise MerzFehler(f"Merz: ungueltiger Personenquelldateiname ({kennung}).")
    datei = Path(detailseiten) / datei_name
    if not datei.is_file():
        raise MerzFehler(f"Merz: amtliche Personenquelle fehlt ({kennung}).")
    if ZU._quellenhost(personenquelle.get("url")) != "bundestag.de":
        raise MerzFehler(f"Merz: unerwarteter Personenquellen-Host ({kennung}).")
    if personenquelle.get("finalUrl") != personenquelle.get("url"):
        raise MerzFehler(f"Merz: Personenquelle finalUrl weicht ab ({kennung}).")
    if personenquelle.get("http") != 200 or personenquelle.get("abrufStatus") != "abgerufen":
        raise MerzFehler(f"Merz: Personenabruf nicht erfolgreich ({kennung}).")
    if ZU._sha256(datei) != str(personenquelle.get("sha256")) or datei.stat().st_size != personenquelle.get("bytes"):
        raise MerzFehler(f"Merz: Personenquellen-Hash/Bytezahl weicht ab ({kennung}).")

    # Original UND Abrufmetadatum (die Detailseite traegt ihre Metadaten im Abruf-JSON).
    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise MerzFehler(f"Merz: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != "bundestag":
        raise MerzFehler(f"Merz: Kennung {kennung} ist kein Bundestagsprofil.")
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http", "abrufStatus"):
        if str(abruf.get(name)) != str(personenquelle.get(name)):
            raise MerzFehler(f"Merz: Abrufmetadatum {name} weicht ab ({kennung}).")

    # Die bestehende aktuelle Rolle stammt aus der belegten 54er Rollenquittung.
    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise MerzFehler(f"Merz: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
    if str(rollen_eintrag.get("status")) != "belegt":
        raise MerzFehler(f"Merz: die 54er Rolle zu {kennung} muss belegt sein.")
    rollen_ref = rollen_eintrag.get("quelle") or {}
    for name in ("url", "sha256", "abgerufenAm"):
        if str(rollen_ref.get(name)) != str(personenquelle.get(name)):
            raise MerzFehler(f"Merz: 54er Rollenquelle weicht ab ({name}) ({kennung}).")
    wortlaute = [str(f.get("wortlaut") or "").strip() for f in (rollen_eintrag.get("funktionen") or [])]
    if erwartet["funktion"] not in wortlaute:
        raise MerzFehler(f"Merz: der belegte 54er-Eintrag {kennung} traegt nicht die Rolle.")

    # Echte H1 und eigener aktueller Funktionstext aus dem unveraenderten Original.
    text = datei.read_text(encoding="utf-8", errors="replace")
    namen = _Personenname.lese(text)
    if len(namen) != 1 or namen[0] != ZU._norm(erwartet["person"]):
        raise MerzFehler(f"Merz: Person passt nicht zur kanonischen Kennung ({kennung}).")
    funktionstext = _Funktionsblock.lese(text)
    if funktionstext != ZU._norm(erwartet["funktionstext"]):
        raise MerzFehler(f"Merz: der eigene Funktionstext weicht vom fixierten Urteil ab ({kennung}).")
    return personenquelle, text


def pruefe_merz(eingang, *, quittung=None, ressortachsen_kennungen=None,
                aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                zusatzaufgaben_kennungen=None, bmwsb_kennungen=None, amthor_kennungen=None,
                wahlausschuss_kennungen=None, jarzombek_kennungen=None, kloeckner_kennungen=None,
                rohde_kennungen=None, stellvertretungen_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Einzelfallquittung Merz (fail closed).

    Erzwungen wird: genau EINE kanonische Kennung, disjunkt zu den 19 Ressort-, 6
    Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3
    Wahlausschuss-, 1 Jarzombek-, 1 Kloeckner- und 1 Rohde-Achse; die kanonische
    500er-Person (echte H1 + eigener aktueller Funktionstext) und die BESTEHENDE
    aktuelle Rolle aus der belegten 54er Rollenquittung separat neu gebunden; die
    Person ausschliesslich aus dem sichtbaren eigenen Artikelkopf (nicht Bild/JSON-LD);
    die Aufgabe ausschliesslich aus dem geschlossenen H2-Abschnitt
    "Richtlinien-Kompetenz" des eigenen innersten ``div.bpa-richtext``; die amtliche
    Zusatzquelle an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei jeweils
    Original UND Metadatum gebunden; nur das eine enge Aufgabenthema. Jede
    Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "merz", None)
    if quittung is None:
        if not MERZ.is_file():
            raise MerzFehler(f"Merz-Quittung fehlt: {MERZ_RESSOURCE}.")
        quittung = ZU._lies_json(MERZ)
    if not isinstance(quittung, dict):
        raise MerzFehler(f"Merz-Quittung fehlt: {MERZ_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise MerzFehler(
            f"Merz-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise MerzFehler(f"Merz-Quittung: unerwartete Bilanz {bilanz!r}.")

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
    if amthor_kennungen is None:
        amthor_kennungen = set(getattr(eingang, "amthor_by_kennung", None) or {})
    if wahlausschuss_kennungen is None:
        wahlausschuss_kennungen = set(getattr(eingang, "wahlausschuss_by_kennung", None) or {})
    if jarzombek_kennungen is None:
        jarzombek_kennungen = set(getattr(eingang, "jarzombek_by_kennung", None) or {})
    if kloeckner_kennungen is None:
        kloeckner_kennungen = set(getattr(eingang, "kloeckner_by_kennung", None) or {})
    if rohde_kennungen is None:
        rohde_kennungen = set(getattr(eingang, "rohde_by_kennung", None) or {})
    if stellvertretungen_kennungen is None:
        stellvertretungen_kennungen = set(getattr(eingang, "stellvertretungen_by_kennung", None) or {})
    disjunkt = (
        ("Ressortachse", set(ressortachsen_kennungen)),
        ("Aufgabenachse", set(aufgabenachsen_kennungen)),
        ("beratende Achse", set(beratendeachsen_kennungen)),
        ("Zusatzaufgabenachse", set(zusatzaufgaben_kennungen)),
        ("BMWSB-Achse", set(bmwsb_kennungen)),
        ("Amthor-Achse", set(amthor_kennungen)),
        ("Wahlausschuss-Achse", set(wahlausschuss_kennungen)),
        ("Jarzombek-Achse", set(jarzombek_kennungen)),
        ("Kloeckner-Achse", set(kloeckner_kennungen)),
        ("Rohde-Achse", set(rohde_kennungen)),
        ("Stellvertretungsachse", set(stellvertretungen_kennungen)),
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise MerzFehler("Merz: Eintrag ohne Kennung.")
        if kennung in index:
            raise MerzFehler(f"Merz: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise MerzFehler(f"Merz: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise MerzFehler(f"Merz: Kennung {kennung} ist bereits eine {name}.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise MerzFehler(f"Merz: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise MerzFehler(f"Merz: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise MerzFehler(f"Merz: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise MerzFehler(f"Merz: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("bindungsart") or "").strip() != erwartet["bindungsart"]:
            raise MerzFehler(f"Merz: unerwartete Bindungsart ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise MerzFehler(f"Merz: Person weicht vom fixierten Urteil ab ({kennung}).")

        # Die bestehende Rolle (54er Quittung) und die kanonische Person separat neu gebunden.
        personenquelle, _personen_text = _pruefe_personenquelle(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet
        )
        if dict(personenquelle) != erwartet["personenquelle"]:
            raise MerzFehler(f"Merz: Personenquellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Amtliche Zusatzquelle strikt an das fixierte Urteil binden (Original UND Meta).
        quelle, quelle_text = _pruefe_zusatzquelle(ergebnis, zusatz, kennung, "quelle")
        if dict(quelle) != erwartet["quelle"]:
            raise MerzFehler(f"Merz: Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Person und Amt NUR aus dem sichtbaren eigenen Artikelkopf (nicht Bild/JSON-LD).
        for name in ("funktion", "funktionstext", "artikelkopf", "artikeltitel", "abschnitt",
                     "aufgabenbindung", "themen"):
            if ergebnis.get(name) != erwartet[name]:
                raise MerzFehler(f"Merz: Feld {name} weicht vom fixierten Urteil ab ({kennung}).")
        _pruefe_artikelkopf(quelle_text, erwartet, kennung)

        # Aufgabe NUR aus dem geschlossenen H2-Abschnitt des eigenen innersten Richtext.
        absaetze = _pruefe_aufgabenabschnitt(quelle_text, erwartet, kennung)
        if ergebnis.get("absaetze") != absaetze:
            raise MerzFehler(f"Merz: Aufgabenabsaetze weichen vom fixierten Urteil ab ({kennung}).")
        _pruefe_themen(erwartet, absaetze, kennung)
        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise MerzFehler(f"Merz: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": erwartet["bindungsart"],
            "person": person,
            "funktion": erwartet["funktion"],
            "funktionstext": erwartet["funktionstext"],
            "artikelkopf": erwartet["artikelkopf"],
            "artikeltitel": erwartet["artikeltitel"],
            "abschnitt": erwartet["abschnitt"],
            "absaetze": list(absaetze),
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "themen": list(erwartet["themen"]),
            "ableitungsHinweis": hinweis,
            "personenquelle": personenquelle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise MerzFehler(f"Merz-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
