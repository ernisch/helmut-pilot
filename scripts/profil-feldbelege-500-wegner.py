#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fail-closed-Pruefung der einzelnen Wegner-Richtlinienquittung.

Nur die bestehende, amtlich belegte Rolle des Regierenden Buergermeisters von
Berlin und genau die Aufgabe "Richtlinien der Regierungspolitik" werden gebunden.
Das Modul arbeitet ausschliesslich offline.

Die Validierung verwendet die sicheren Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein zweiter Netz-/DB-Weg,
kein externer Parser, keine hartcodierte Laufzeit) und prueft die versionierte
Einzelfallquittung gegen

  * die bestehende Rollenquittung ``profilrollen-54-20260927.json`` und den
    kanonischen 500er-Abruf des bestehenden Profils (die Rolle bleibt unveraendert,
    es entsteht KEINE neue Rolle),
  * die lokale amtliche Senatsseite ``senat-berlin-aktuell.html`` (Person und Amt
    nur aus dem echten sichtbaren eigenen ``article.modul-teaser``; Bild-Alt-Texte,
    Kommentare, Navigation und Nachbarteaser sind kein Beleg),
  * die lokale amtliche Seite ``berlin-geschaeftsverteilung-20260927.html``: die
    Aufgabe stammt ausschliesslich aus dem eigenen geschlossenen H2-Abschnitt
    ``I. Zum Geschaeftsbereich des Regierenden Buergermeisters/...`` und genau dem
    ERSTEN eigenen Listenelement. Alle uebrigen Listenelemente dieses
    Geschaeftsbereichs sind ausdruecklich kein Thema.

Keine persoenliche politische Position, keine Koalitions-/Ressort-/Verwaltungs-
themen, keine neue Rolle, keine Partei-/Mandatsart-Aenderung.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WEGNER = REPO_ROOT / "docs" / "betrieb" / "wegner-richtlinien-1-20260928.json"
WEGNER_RESSOURCE = "docs/betrieb/wegner-richtlinien-1-20260928.json"

KENNUNG = "landtag-berlin-kai-wegner"
REGION = "Berlin"
PARLAMENT = "landtag-berlin"
PERSON = "Kai Wegner"
FUNKTION = "Regierender Bürgermeister von Berlin"
ROLLENZITAT = "Regierender Bürgermeister von Berlin"
ROLLENAUSSAGE = "Regierender Bürgermeister: Kai Wegner, CDU"
ABSCHNITT = (
    "I. Zum Geschäftsbereich des Regierenden Bürgermeisters/der Regierenden "
    "Bürgermeisterin gehören:"
)
AUFGABENABSATZ = (
    "Bestimmung und Fortentwicklung sowie Überwachung der Einhaltung der Richtlinien der "
    "Regierungspolitik; Strategiebildung, Planung und Konzeption in politischen Grundsatz-, "
    "ressortübergreifenden sowie gesamtstädtischen Angelegenheiten einschließlich Metropol- und "
    "Hauptstadtregion Berlin-Brandenburg und Großprojekte gemeinsam mit den Senatsverwaltungen; "
    "Koordinierung der Ressortpolitik;"
)
AUFGABENBINDUNG = "Regierender Bürgermeister von Berlin; Richtlinien der Regierungspolitik"
THEMEN = ["Richtlinien der Regierungspolitik"]
HINWEIS = (
    "Aufgabenbindung Berlin (amtlich abgeleitet): Regierender Bürgermeister von Berlin; "
    "Richtlinien der Regierungspolitik; keine persönliche politische Position"
)

PERSONENQUELLE = {
    "url": "https://www.berlin.de/rbmskzl/politik/senat/senatsmitglieder/",
    "finalUrl": "https://www.berlin.de/rbmskzl/politik/senat/senatsmitglieder/",
    "abgerufenAm": "2026-09-27T15:43:26.816304+00:00",
    "sha256": "d35a4e8878b1a9cf8474b2f7f9ea0332b08a9ed59e64f51f791c4d5394ae8bf6",
    "bytes": 59352,
    "datei": "senat-berlin-aktuell.html",
    "http": 200,
    "abrufStatus": "abgerufen",
}
QUELLE = {
    "url": "https://www.berlin.de/rbmskzl/politik/senat/geschaeftsverteilung/",
    "finalUrl": "https://www.berlin.de/rbmskzl/politik/senat/geschaeftsverteilung/",
    "abgerufenAm": "2026-09-27T20:47:21.720907+00:00",
    "sha256": "d729a2ebd65b3b379fc0420292b4993d6b903a33182980f4f44165e250bd2c5c",
    "bytes": 206915,
    "datei": "berlin-geschaeftsverteilung-20260927.html",
    "http": 200,
    "abrufStatus": "abgerufen",
}

# Nur der amtliche Quellhost der beiden Zusatzquellen.
QUELLHOST = "berlin.de"
# Diese ausdruecklichen Nachbarthemen des Geschaeftsbereichs I duerfen NIE ein
# Thema werden (Verwaltung, Protokoll, Presse, Hauptstadtvertretung, Medien,
# Digitales, Wohnungsbau, Klima, Europa usw.).
VERBOTENE_THEMEN = (
    "Geschäftsbereiche des Senats",
    "Geschäftsverteilung",
    "Geschäftsordnung des Senats",
    "Ernennung und Entlassung",
    "Staatssekretärskonferenz",
    "Rat der Bürgermeister",
    "SIDOK",
    "Verkündung von Gesetzen",
    "Personalkommission",
    "Protokollangelegenheiten",
    "Ehrengrabstätten",
    "Emigranten-Besuchsprogramm",
    "Patenschaften",
    "Presseangelegenheiten",
    "Öffentlichkeitsarbeit",
    "Hauptstadtfinanzierungsvertrag",
    "Städteverbindungen",
    "städtische Diplomatie",
    "Vertretung Berlins beim Bund",
    "Bundesgesetzgebung",
    "Vermittlungsausschuss",
    "Auslandsdienstreisen",
    "Verhandlungen mit den Ländern",
    "Regionalpolitik",
    "Strategischer Gesamtrahmen",
    "Personalakten",
    "Bezirksbürgermeister",
    "Landespersonalausschuss",
    "IKT-Lenkungsrat",
    "Deutscher Städtetag",
    "Finanzplanung",
    "Medienangelegenheiten",
    "Rundfunkangelegenheiten",
    "Filmangelegenheiten",
    "Filmförderung",
    "Netzpolitik",
    "Medienbereich",
    "Standortmarketing",
    "Hauptstadtportal",
    "Smart-City",
    "Digitalstrategie",
    "CityLAB",
    "Industriepolitik",
    "Verwaltungspreis",
    "Wohnungsbau",
    "Wohnungsneubau",
    "Klimaschutz",
    "Europapolitik",
    "Europäische Union",
    "IT-Dienstleistungszentrum",
    "E-Government",
    "Digitalministerkonferenz",
    "Digitalpolitik",
    "Open Data",
    "GovTech",
    "Informationssicherheit",
    "Drehgenehmigungen",
    "Digitalisierung der Verwaltung",
    "Koalitionsvertrag",
)

# Die amtliche Senatsseite beschreibt auf einem Nachbarteaser die Richtlinien-
# Seite; dieser Teaser ist KEINE Aufgabenquelle und traegt deshalb kein Thema.
NACHBARTEASER_HINWEIS = "Die Richtlinien der Regierungspolitik sind die politischen Zielsetzungen"


def _lade_zusatzmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_wegner_hilfe", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()


class WegnerFehler(Exception):
    """Fail-closed-Abbruch der Wegner-Pruefung."""


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


class _Personenartikel(HTMLParser):
    """H3 und eigener sichtbarer Text des eigenen geschlossenen modul-teaser-Artikels."""

    AUSGELASSEN = {"script", "style", "template", "noscript", "nav", "figure"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.rahmen = []
        self.versteckt = 0
        self.artikel = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in self.VOID:
            return
        attrs = dict(attrs)
        klassen = set(str(attrs.get("class") or "").split())
        unsichtbar = _unsichtbar(attrs)
        block = None
        if tag == "article" and "modul-teaser" in klassen:
            block = {"h3": None, "p": []}
        aktiver = block or next((f["aktiver"] for f in reversed(self.rahmen) if f["aktiver"]), None)
        frame = {"tag": tag, "block": block, "aktiver": aktiver, "unsichtbar": unsichtbar,
                 "puffer": None, "art": None}
        if aktiver is not None:
            if tag == "h3" and "title" in klassen:
                frame["puffer"], frame["art"] = [], "h3"
            elif tag == "p" and "text" in klassen:
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
        block = frame["aktiver"] or next(
            (f["aktiver"] for f in reversed(self.rahmen[:position]) if f["aktiver"]), None)
        if frame["puffer"] is not None and block is not None and not frame["unsichtbar"]:
            wert = _sichttext(frame["puffer"])
            if frame["art"] == "h3":
                block["h3"] = wert
            else:
                block["p"].append(wert)
        if frame["block"] is not None:
            self.artikel.append(frame["block"])
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
    def lese(cls, dokument, person: str) -> dict:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if (parser.ausgelassen or parser.rahmen or parser.versteckt
                or any(f["puffer"] is not None for f in parser.rahmen)):
            raise WegnerFehler("Wegner: Personenmarkup unvollstaendig.")
        passend = [a for a in parser.artikel if a["h3"] == person]
        if len(passend) != 1:
            raise WegnerFehler("Wegner: eigener Personenartikel fehlt oder ist mehrdeutig.")
        return passend[0]


class _Geschaeftsbereich(HTMLParser):
    """H2 und direkte Listenelemente des eigenen sichtbaren modul-text_bild-Bereichs."""

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
        block = None
        if tag == "section" and "modul-text_bild" in klassen:
            block = {"h2": None, "li": []}
        aktiver = block or next((f["aktiver"] for f in reversed(self.rahmen) if f["aktiver"]), None)
        frame = {"tag": tag, "block": block, "aktiver": aktiver, "unsichtbar": unsichtbar,
                 "puffer": None, "art": None}
        if aktiver is not None:
            if tag == "h2" and "title" in klassen:
                frame["puffer"], frame["art"] = [], "h2"
            elif tag == "li":
                frame["puffer"], frame["art"] = [], "li"
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
        block = frame["aktiver"] or next(
            (f["aktiver"] for f in reversed(self.rahmen[:position]) if f["aktiver"]), None)
        if frame["puffer"] is not None and block is not None and not frame["unsichtbar"]:
            wert = _sichttext(frame["puffer"])
            if frame["art"] == "h2":
                block["h2"] = wert
            else:
                block["li"].append(wert)
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
    def lese(cls, dokument, abschnitt: str) -> dict:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if (parser.ausgelassen or parser.rahmen or parser.versteckt
                or any(f["puffer"] is not None for f in parser.rahmen)):
            raise WegnerFehler("Wegner: Geschaeftsbereichsmarkup unvollstaendig.")
        passend = [b for b in parser.bloecke if b["h2"] == abschnitt]
        if len(passend) != 1:
            raise WegnerFehler("Wegner: eigener Geschaeftsbereich fehlt oder ist mehrdeutig.")
        return passend[0]


def _binde_zusatzquelle(verzeichnis: Path, quelle: dict, erwartet: dict) -> str:
    """Bindet eine amtliche Zusatzquelle an Original UND Metadatum."""
    if quelle != erwartet:
        raise WegnerFehler("Wegner: Quellenmetadaten weichen vom fixierten Urteil ab.")
    dateiname = str(quelle.get("datei") or "")
    if not dateiname or Path(dateiname).name != dateiname:
        raise WegnerFehler("Wegner: ungueltiger Quellen-Dateiname.")
    pfad = Path(verzeichnis) / dateiname
    if not pfad.is_file():
        raise WegnerFehler(f"Wegner: Originaldatei fehlt: {dateiname}.")
    try:
        meta = ZU._meta_datei(dateiname, Path(verzeichnis), KENNUNG)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise WegnerFehler(str(fehler)) from fehler
    for feld in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(feld)) != str(quelle.get(feld)):
            raise WegnerFehler(f"Wegner: Quellenmetadatum {feld} weicht ab.")
    if "http" in meta and str(meta.get("http")) != str(quelle.get("http")):
        raise WegnerFehler("Wegner: Quellenmetadatum http weicht ab.")
    if quelle["url"] != quelle["finalUrl"] or quelle["http"] != 200 or quelle["abrufStatus"] != "abgerufen":
        raise WegnerFehler("Wegner: Abruf ist nicht kanonisch erfolgreich.")
    if ZU._quellenhost(quelle["url"]) != QUELLHOST:
        raise WegnerFehler("Wegner: unerwarteter Quellhost.")
    if ZU._sha256(pfad) != quelle["sha256"] or pfad.stat().st_size != quelle["bytes"]:
        raise WegnerFehler("Wegner: Original-Hash/Bytezahl weicht ab.")
    return pfad.read_text(encoding="utf-8", errors="replace")


def _pruefe_personenquelle(text: str) -> dict:
    """Person und Amt NUR aus dem echten sichtbaren eigenen modul-teaser-Artikel."""
    artikel = _Personenartikel.lese(text, PERSON)
    if artikel["h3"] != PERSON:
        raise WegnerFehler("Wegner: Person passt nicht zur sichtbaren eigenen H3.")
    zitate = [p for p in artikel["p"] if p.startswith(ROLLENAUSSAGE)]
    if len(zitate) != 1:
        raise WegnerFehler("Wegner: eigene sichtbare Amtsaussage fehlt oder ist mehrdeutig.")
    if not ZU._enthaelt_in_reihenfolge(PERSON, zitate[0]):
        raise WegnerFehler("Wegner: Person steht nicht in der Amtsaussage.")
    if not ZU._enthaelt_in_reihenfolge("Regierender Bürgermeister", zitate[0]):
        raise WegnerFehler("Wegner: Amt steht nicht in der Amtsaussage.")
    if not ZU._enthaelt_in_reihenfolge(FUNKTION, ROLLENZITAT):
        raise WegnerFehler("Wegner: fixierte Rolle weicht ab.")
    return artikel


def _pruefe_aufgabenbereich(text: str, erwartet_absatz: str) -> list:
    """Erstes eigenes Listenelement des eigenen geschlossenen H2-Abschnitts."""
    bereich = _Geschaeftsbereich.lese(text, ABSCHNITT)
    if not bereich["li"]:
        raise WegnerFehler("Wegner: eigener Geschaeftsbereich ohne eigene Listenelemente.")
    if bereich["li"][0] != erwartet_absatz:
        raise WegnerFehler("Wegner: erstes eigenes Listenelement weicht ab.")
    return bereich["li"]


def _pruefe_themen(themen, abschnitt_elemente) -> None:
    """Nur das eine enge Aufgabenthema; alle Nachbarthemen sind gesperrt."""
    if not isinstance(themen, list) or themen != THEMEN:
        raise WegnerFehler("Wegner: genau das eine freigegebene Thema ist erlaubt.")
    thema = str(themen[0])
    if "richtlinien der regierungspolitik" not in thema.lower():
        raise WegnerFehler("Wegner: das Thema muss die Richtlinien der Regierungspolitik benennen.")
    for verboten in VERBOTENE_THEMEN:
        if verboten.lower() in thema.lower():
            raise WegnerFehler(f"Wegner: Nachbarthema {verboten!r} ist als Thema gesperrt.")
    if not ZU._enthaelt_in_reihenfolge(thema, AUFGABENABSATZ):
        raise WegnerFehler("Wegner: das Thema steht nicht im gebundenen ersten Listenelement.")
    for andere in abschnitt_elemente[1:]:
        if thema.lower() in andere.lower():
            raise WegnerFehler("Wegner: das Thema stammt nicht ausschliesslich aus dem ersten Listenelement.")
    for andere in abschnitt_elemente[1:]:
        if andere == AUFGABENABSATZ:
            raise WegnerFehler("Wegner: gebundenes Listenelement ist nicht eindeutig.")


def pruefe_wegner(eingang, *, quittung=None, andere_achsen=None) -> dict:
    if quittung is None:
        quittung = getattr(eingang, "wegner", None)
    if quittung is None:
        if not WEGNER.is_file():
            raise WegnerFehler(f"Wegner-Quittung fehlt: {WEGNER_RESSOURCE}.")
        quittung = ZU._lies_json(WEGNER)
    if not isinstance(quittung, dict) or len(quittung.get("ergebnisse") or []) != 1:
        raise WegnerFehler("Wegner: genau ein Ergebnis ist erforderlich.")
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (1, 0, 1, 0):
        raise WegnerFehler("Wegner: unerwartete Bilanz.")
    ergebnis = quittung["ergebnisse"][0]
    if ergebnis.get("kennung") != KENNUNG or KENNUNG in set(andere_achsen or ()):
        raise WegnerFehler("Wegner: Fremdkennung oder bereits anderweitig geschlossene Achse.")
    erwartete_felder = {
        "region": REGION, "parlament": PARLAMENT, "status": "belegt",
        "bindungsart": "richtlinienkompetenz", "person": PERSON, "funktion": FUNKTION,
        "rollenzitat": ROLLENZITAT, "abschnitt": ABSCHNITT,
        "aufgabenabsatz": AUFGABENABSATZ, "aufgabenbindung": AUFGABENBINDUNG,
        "themen": THEMEN, "ableitungsHinweis": HINWEIS, "importfreigegeben": False,
    }
    for feld, wert in erwartete_felder.items():
        if ergebnis.get(feld) != wert:
            raise WegnerFehler(f"Wegner: Feld {feld} weicht vom fixierten Urteil ab.")
    if HINWEIS != ZU.HINWEIS_AUFGABE.format(region=REGION, wert=AUFGABENBINDUNG):
        raise WegnerFehler("Wegner: Herkunftshinweis weicht vom freigegebenen Muster ab.")

    abruf = (getattr(eingang, "kennung_zu_abruf", None) or {}).get(KENNUNG)
    if abruf is None:
        raise WegnerFehler("Wegner: kanonischer 500er-Abruf fehlt.")
    if abruf.get("parlament") != PARLAMENT:
        raise WegnerFehler("Wegner: Abruf gehoert nicht zum Berliner Landtag.")
    rollen = (getattr(eingang, "profilrollen_by_kennung", None) or {}).get(KENNUNG) or {}
    if rollen.get("status") != "belegt" or rollen.get("fachachseFreigegeben") is not False:
        raise WegnerFehler("Wegner: bestehende 54er-Rolle ist nicht eng belegt.")
    rollen_ref = {k: rollen.get("quelle", {}).get(k) for k in ("url", "sha256", "abgerufenAm")}
    if rollen_ref != {
        "url": abruf.get("url"), "sha256": abruf.get("sha256"), "abgerufenAm": abruf.get("abgerufenAm")
    }:
        raise WegnerFehler("Wegner: Rollenquelle weicht vom kanonischen Abruf ab.")
    for feld in ("url", "sha256", "abgerufenAm"):
        if rollen_ref.get(feld) != abruf.get(feld):
            raise WegnerFehler(f"Wegner: 54er Rollenquelle weicht vom Abruf ab ({feld}).")
    rollenquelle = ergebnis.get("rollenquelle") or {}
    if dict(rollenquelle) != rollen_ref:
        raise WegnerFehler("Wegner: Quittungs-Rollenquelle weicht von der 54er Quittung ab.")
    if not any(f.get("wortlaut") == FUNKTION and f.get("zitat") == ROLLENZITAT
               for f in (rollen.get("funktionen") or [])):
        raise WegnerFehler("Wegner: bestehende Rolle/Zitat fehlt.")

    personen_text = _binde_zusatzquelle(
        Path(eingang.verzeichnis) / "zusatzquellen",
        ergebnis.get("personenquelle") or {},
        PERSONENQUELLE,
    )
    _pruefe_personenquelle(personen_text)
    if NACHBARTEASER_HINWEIS in AUFGABENABSATZ:
        raise WegnerFehler("Wegner: Nachbarteaser ist keine Aufgabenquelle.")

    quelle_text = _binde_zusatzquelle(
        Path(eingang.verzeichnis) / "zusatzquellen",
        ergebnis.get("quelle") or {},
        QUELLE,
    )
    elemente = _pruefe_aufgabenbereich(quelle_text, AUFGABENABSATZ)
    _pruefe_themen(ergebnis.get("themen"), elemente)

    return {KENNUNG: {
        "kennung": KENNUNG, "region": REGION, "parlament": PARLAMENT,
        "status": "belegt", "bindungsart": "richtlinienkompetenz", "person": PERSON,
        "funktion": FUNKTION, "rollenzitat": ROLLENZITAT, "abschnitt": ABSCHNITT,
        "aufgabenabsatz": AUFGABENABSATZ, "aufgabenbindung": AUFGABENBINDUNG,
        "themen": list(THEMEN), "ableitungsHinweis": HINWEIS,
        "rollenquelle": dict(rollen_ref),
        "personenquelle": dict(PERSONENQUELLE), "quelle": dict(QUELLE),
    }}
