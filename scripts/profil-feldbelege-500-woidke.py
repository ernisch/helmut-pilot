#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fail-closed-Pruefung der einzelnen Woidke-Richtlinienquittung.

Nur die bestehende, amtlich belegte Rolle des brandenburgischen
Ministerpraesidenten und genau die Aufgabe "Richtlinien der Landespolitik"
werden gebunden. Das Modul arbeitet ausschliesslich offline.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WOIDKE = REPO_ROOT / "docs" / "betrieb" / "woidke-richtlinien-1-20260928.json"
WOIDKE_RESSOURCE = "docs/betrieb/woidke-richtlinien-1-20260928.json"

KENNUNG = "landtag-brandenburg-11263"
REGION = "Brandenburg"
PARLAMENT = "landtag-brandenburg"
PERSON = "Dr. Dietmar Woidke"
FUNKTION = "Ministerpräsident des Landes Brandenburg"
ROLLENZITAT = "Seit August 2013 Ministerpräsident des Landes Brandenburg"
ABSCHNITT = "Aufgaben und Organisation"
AUFGABENABSATZ = (
    "Der Ministerpräsident bestimmt die Richtlinien der Landespolitik und vertritt das Land nach außen. "
    "Zur Erfüllung seiner Aufgaben steht ihm die Staatskanzlei zur Verfügung, die vom Chef der "
    "Staatskanzlei geleitet wird. Die Staatskanzlei ist die Regierungszentrale der Landesregierung, "
    "sie steuert und koordiniert die Landespolitik. Sie entwickelt Strategien für zentrale Vorhaben "
    "der Landesregierung und ist verantwortlich für die Gesamtdarstellung gegenüber der Öffentlichkeit. "
    "Zur Staatskanzlei gehört die Vertretung des Landes beim Bund."
)
AUFGABENBINDUNG = "Ministerpräsident des Landes Brandenburg; Richtlinien der Landespolitik"
THEMEN = ["Richtlinien der Landespolitik"]
HINWEIS = (
    "Aufgabenbindung Brandenburg (amtlich abgeleitet): Ministerpräsident des Landes Brandenburg; "
    "Richtlinien der Landespolitik; keine persönliche politische Position"
)

PERSONENQUELLE = {
    "url": "https://www.landtag.brandenburg.de/de/woidke_dietmar_(dr.)/11263",
    "finalUrl": "https://www.landtag.brandenburg.de/de/woidke_dietmar_(dr.)/11263",
    "abgerufenAm": "2026-09-27T12:37:15.982412+00:00",
    "sha256": "86c879e54c79f873cffbf486c9ccc35ae6999b55a599046e79b371de2720fa36",
    "bytes": 97481,
    "datei": "landtag-brandenburg-11263.html",
    "http": 200,
    "abrufStatus": "abgerufen",
}
QUELLE = {
    "url": "https://brandenburg.de/cms/detail.php/bb1.c.481693.de",
    "finalUrl": "https://brandenburg.de/cms/detail.php/bb1.c.481693.de",
    "abgerufenAm": "2026-09-27T18:46:03.498807+00:00",
    "sha256": "0b1a81e7893e4ff45ccdd97e2e1b3498d2862a435550e18b750be8ef00991516",
    "bytes": 14578,
    "datei": "brandenburg-staatskanzlei-aufgaben-aktuell.html",
    "http": 200,
    "abrufStatus": "abgerufen",
}


def _lade_zusatzmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_woidke_hilfe", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()


class WoidkeFehler(Exception):
    """Fail-closed-Abbruch der Woidke-Pruefung."""


def _sichttext(teile) -> str:
    """Sichttext normalisieren, ohne Leerzeichen vor Satzzeichen aus Linkgrenzen."""
    return re.sub(r"\s+([.,;:!?])", r"\1", ZU._norm(" ".join(teile)))


def _unsichtbar(attrs) -> bool:
    attrs = dict(attrs)
    klassen = set(str(attrs.get("class") or "").split())
    stil = re.sub(r"\s+", "", str(attrs.get("style") or "").lower())
    return (
        "hidden" in attrs or "inert" in attrs or str(attrs.get("aria-hidden") or "").lower() == "true"
        or "hidden" in klassen or "d-none" in klassen or "display:none" in stil
        or "visibility:hidden" in stil
    )


class _SichtbareH1(HTMLParser):
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav", "figure"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rahmen = []
        self.ausgelassen = []
        self.teile = None
        self.versteckt = 0
        self.treffer = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        unsichtbar = _unsichtbar(attrs)
        self.rahmen.append((tag, unsichtbar))
        if unsichtbar:
            self.versteckt += 1
        if tag == "h1":
            if self.teile is not None:
                raise WoidkeFehler("Woidke: verschachtelte H1.")
            self.teile = [] if not self.versteckt else None

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        position = next((i for i in range(len(self.rahmen) - 1, -1, -1)
                         if self.rahmen[i][0] == tag), None)
        if position is None:
            return
        if tag == "h1" and self.teile is not None:
            self.treffer.append(_sichttext(self.teile))
            self.teile = None
        for _, unsichtbar in self.rahmen[position:]:
            if unsichtbar:
                self.versteckt -= 1
        del self.rahmen[position:]

    def handle_data(self, data):
        if not self.ausgelassen and not self.versteckt and self.teile is not None:
            self.teile.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.versteckt or parser.teile is not None:
            raise WoidkeFehler("Woidke: Personenmarkup unvollstaendig.")
        return parser.treffer


class _Aufgabenbereich(HTMLParser):
    """H1 und direkte Absaetze des sichtbaren eigenen .columns-3-4-Bereichs."""

    AUSGELASSEN = {"script", "style", "template", "noscript", "nav", "aside", "figure"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.rahmen = []
        self.versteckt = 0
        self.bloecke = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in self.VOID:
            return
        attrs = dict(attrs)
        klassen = set(str(attrs.get("class") or "").split())
        unsichtbar = _unsichtbar(attrs)
        eltern = self.rahmen[-1] if self.rahmen else None
        block = None
        if tag == "div" and "columns-3-4" in klassen:
            vorfahren = [set(str(f["attrs"].get("class") or "").split()) for f in self.rahmen]
            if {"page-section", "page-content-section"} in vorfahren:
                block = {"h1": [], "p": []}
        aktiver = block or next((f["block"] for f in reversed(self.rahmen) if f["block"]), None)
        frame = {"tag": tag, "attrs": attrs, "unsichtbar": unsichtbar, "block": block,
                 "puffer": None, "art": None}
        if aktiver is not None and eltern is not None:
            if tag == "h1":
                frame["puffer"], frame["art"] = [], "h1"
            elif tag == "p" and (eltern["block"] is aktiver):
                frame["puffer"], frame["art"] = [], "p"
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
        position = next((i for i in range(len(self.rahmen) - 1, -1, -1)
                         if self.rahmen[i]["tag"] == tag), None)
        if position is None:
            return
        frame = self.rahmen[position]
        block = frame["block"] or next((f["block"] for f in reversed(self.rahmen[:position]) if f["block"]), None)
        if frame["puffer"] is not None and block is not None and not frame["unsichtbar"]:
            block[frame["art"]].append(_sichttext(frame["puffer"]))
        if frame["block"] is not None:
            self.bloecke.append(frame["block"])
        for f in self.rahmen[position:]:
            if f["unsichtbar"]:
                self.versteckt -= 1
        del self.rahmen[position:]

    def handle_data(self, data):
        if self.ausgelassen or self.versteckt:
            return
        for frame in reversed(self.rahmen):
            if frame["puffer"] is not None:
                frame["puffer"].append(_html.escape(data))
                return

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.versteckt:
            raise WoidkeFehler("Woidke: Aufgabenmarkup unvollstaendig.")
        passend = [b for b in parser.bloecke if b["h1"] == [ABSCHNITT]]
        if len(passend) != 1:
            raise WoidkeFehler("Woidke: eigener Aufgabenbereich fehlt oder ist mehrdeutig.")
        return passend[0]


def _binde_datei(verzeichnis: Path, quelle: dict, erwartet: dict, *, detail=False) -> str:
    if quelle != erwartet:
        raise WoidkeFehler("Woidke: Quellenmetadaten weichen vom fixierten Urteil ab.")
    dateiname = str(quelle.get("datei") or "")
    if not dateiname or Path(dateiname).name != dateiname:
        raise WoidkeFehler("Woidke: ungueltiger Quellen-Dateiname.")
    pfad = Path(verzeichnis) / dateiname
    if not pfad.is_file():
        raise WoidkeFehler(f"Woidke: Originaldatei fehlt: {dateiname}.")
    if ZU._sha256(pfad) != quelle["sha256"] or pfad.stat().st_size != quelle["bytes"]:
        raise WoidkeFehler("Woidke: Original-Hash/Bytezahl weicht ab.")
    if quelle["url"] != quelle["finalUrl"] or quelle["http"] != 200 or quelle["abrufStatus"] != "abgerufen":
        raise WoidkeFehler("Woidke: Abruf ist nicht kanonisch erfolgreich.")
    if ZU._quellenhost(quelle["url"]) not in ({"landtag.brandenburg.de"} if detail else {"brandenburg.de"}):
        raise WoidkeFehler("Woidke: unerwarteter Quellhost.")
    if not detail:
        try:
            meta = ZU._meta_datei(dateiname, Path(verzeichnis), KENNUNG)
        except ZU.ZusatzaufgabenFehler as fehler:
            raise WoidkeFehler(str(fehler)) from fehler
        for feld in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http"):
            if str(meta.get(feld)) != str(quelle.get(feld)):
                raise WoidkeFehler(f"Woidke: Quellenmetadatum {feld} weicht ab.")
    return pfad.read_text(encoding="utf-8", errors="replace")


def pruefe_woidke(eingang, *, quittung=None, andere_achsen=None) -> dict:
    if quittung is None:
        quittung = getattr(eingang, "woidke", None)
    if quittung is None:
        if not WOIDKE.is_file():
            raise WoidkeFehler(f"Woidke-Quittung fehlt: {WOIDKE_RESSOURCE}.")
        quittung = ZU._lies_json(WOIDKE)
    if not isinstance(quittung, dict) or len(quittung.get("ergebnisse") or []) != 1:
        raise WoidkeFehler("Woidke: genau ein Ergebnis ist erforderlich.")
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (1, 0, 0, 1):
        raise WoidkeFehler("Woidke: unerwartete Bilanz.")
    ergebnis = quittung["ergebnisse"][0]
    if ergebnis.get("kennung") != KENNUNG or KENNUNG in set(andere_achsen or ()):
        raise WoidkeFehler("Woidke: Fremdkennung oder bereits anderweitig geschlossene Achse.")
    erwartete_felder = {
        "region": REGION, "parlament": PARLAMENT, "status": "belegt",
        "bindungsart": "richtlinienkompetenz", "person": PERSON, "funktion": FUNKTION,
        "rollenzitat": ROLLENZITAT, "abschnitt": ABSCHNITT,
        "aufgabenabsatz": AUFGABENABSATZ, "aufgabenbindung": AUFGABENBINDUNG,
        "themen": THEMEN, "ableitungsHinweis": HINWEIS, "importfreigegeben": False,
    }
    for feld, wert in erwartete_felder.items():
        if ergebnis.get(feld) != wert:
            raise WoidkeFehler(f"Woidke: Feld {feld} weicht vom fixierten Urteil ab.")

    abruf = (getattr(eingang, "kennung_zu_abruf", None) or {}).get(KENNUNG)
    if abruf is None:
        raise WoidkeFehler("Woidke: kanonischer 500er-Abruf fehlt.")
    for feld in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http", "abrufStatus"):
        if abruf.get(feld) != PERSONENQUELLE.get(feld):
            raise WoidkeFehler(f"Woidke: kanonischer Personenabruf weicht ab ({feld}).")
    rollen = (getattr(eingang, "profilrollen_by_kennung", None) or {}).get(KENNUNG) or {}
    if rollen.get("status") != "belegt" or rollen.get("fachachseFreigegeben") is not False:
        raise WoidkeFehler("Woidke: bestehende 54er-Rolle ist nicht eng belegt.")
    if rollen.get("quelle") != {k: PERSONENQUELLE[k] for k in ("url", "sha256", "abgerufenAm")}:
        raise WoidkeFehler("Woidke: Rollenquelle weicht vom Personenabruf ab.")
    if not any(f.get("wortlaut") == FUNKTION and f.get("zitat") == ROLLENZITAT
               for f in (rollen.get("funktionen") or [])):
        raise WoidkeFehler("Woidke: bestehende Rolle/Zitat fehlt.")

    personen_text = _binde_datei(Path(eingang.detailseiten), ergebnis.get("personenquelle") or {}, PERSONENQUELLE, detail=True)
    if _SichtbareH1.lese(personen_text) != [PERSON]:
        raise WoidkeFehler("Woidke: Person passt nicht zur sichtbaren eigenen H1.")
    quelle_text = _binde_datei(Path(eingang.verzeichnis) / "zusatzquellen", ergebnis.get("quelle") or {}, QUELLE)
    bereich = _Aufgabenbereich.lese(quelle_text)
    if not bereich["p"] or bereich["p"][0] != AUFGABENABSATZ:
        raise WoidkeFehler("Woidke: erster eigener Aufgabenabsatz weicht ab.")
    if not bereich["p"][0].startswith("Der Ministerpräsident bestimmt die Richtlinien der Landespolitik"):
        raise WoidkeFehler("Woidke: Richtlinienkompetenz steht nicht am Beginn des gebundenen Absatzes.")

    return {KENNUNG: {
        "kennung": KENNUNG, "region": REGION, "parlament": PARLAMENT,
        "status": "belegt", "bindungsart": "richtlinienkompetenz", "person": PERSON,
        "funktion": FUNKTION, "rollenzitat": ROLLENZITAT, "abschnitt": ABSCHNITT,
        "aufgabenabsatz": AUFGABENABSATZ, "aufgabenbindung": AUFGABENBINDUNG,
        "themen": list(THEMEN), "ableitungsHinweis": HINWEIS,
        "personenquelle": dict(PERSONENQUELLE), "quelle": dict(QUELLE),
    }}
