#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer den einzelnen offenen Profilfall Dennis Rohde.

Roadmap §3: Der bislang einzeln offene Fachachsenfall
``bundestag-rohde-dennis-1046814`` wird ueber seine amtlich belegte aktuelle
BMF-Aufgabe "Bundeshaushalt" geschlossen. Dieses Modul haelt den grossen
Assembler ``profil-feldbelege-500.py`` schlank und verwendet die bestehenden
sicheren Quellen-/Personen-Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein duplizierter
600-Zeilen-Block, kein externer Parser, kein zweiter Netz-/DB-Weg). Es prueft
ausschliesslich die versionierte, vom Orchestrator vorbereitete
Einzelfallquittung ``docs/betrieb/rohde-bundeshaushalt-1-20260927.json`` gegen
die amtlichen Originaldateien, deren Metadaten/Quittungen und die kanonische
54er Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer PDF-Parser und KEINE erfundene
    Textextraktionsquelle. Die PDF-Originalbytes werden nur ueber Hash, Bytezahl,
    Stand und Seite gebunden; das Fachurteil (Seite 1, genau Rohdes eigener
    Kasten) ist ein bewusst eng fixiertes, am gerenderten Original manuell
    abgenommenes Ergebnis. Es ist fuer synthetische Testfixtures vollstaendig
    injizierbar (``erwartung``),
  * nur die eine kanonische Kennung (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3 Wahlausschuss-,
    1 Jarzombek-, 1 Kloeckner- und 1 Stellvertretungsachse),
  * kanonische 500er-Person ausschliesslich ueber Name + echte H1 + URL + Hash +
    Abrufzeit + Bytezahl + HTTP der unveraenderten amtlichen Bundestags-Detailseite
    UND den eigenen aktuellen Funktionstext der amtlichen Profilseite (genau ein
    geschlossener ``div.m-biography__function``). Die bestehende aktuelle Rolle
    stammt aus der bereits belegten 54er Rollenquittung (NICHT offen) und wird
    ausdruecklich erneut an ihre kanonische Quelle gebunden; die alte 54er
    Rollenquittung bleibt unveraendert. Die MdB-Role des JSON-LD (startDate
    2025-03-25, kein endDate) ist KEINE PSts-Amtsrolle und belegt keinen
    Amtsbeginn,
  * das Thema stammt AUSSCHLIESSLICH aus Rohdes eigenem, klar umrandetem Kasten
    auf Seite 1 des amtlich von der Landingpage verlinkten BMF-Organisationsplans.
    Kein fremder Kasten (Schrodi Steuerpolitik, Kaiser Ostdeutschland), keine
    beamteten Staatssekretaere, keine Kanzleramtsfunktion, keine ganzen
    Abteilungen,
  * die amtliche Landingpage muss GENAU den verlinkten v=32-Organigramm-Link mit
    dem datierten Linktext tragen; ein blosses Textvorkommen oder die
    Suchtreffer-Fassung v=41 sind kein Beleg,
  * NUR das eine freigegebene Thema "Bundeshaushalt" und der getrennte
    Herkunftshinweis; keine persoenliche politische Position, keine
    Partei-/Mandatsartaenderung.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

REPO_ROOT = Path(__file__).resolve().parents[1]

ROHDE = REPO_ROOT / "docs" / "betrieb" / "rohde-bundeshaushalt-1-20260927.json"
ROHDE_RESSOURCE = "docs/betrieb/rohde-bundeshaushalt-1-20260927.json"

GESAMT = 1
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "amtsaufgabe"
QUELLHOST_PERSON = "bundestag.de"
QUELLHOST_BMF = "bundesfinanzministerium.de"

FUNKTION = "Parlamentarischer Staatssekretär für Finanzen"
AMT = "Parlamentarischer Staatssekretär beim Bundesminister der Finanzen"
AUFGABENBINDUNG = f"{AMT}; Unterstützung in Angelegenheiten des Bundeshaushalts"
THEMEN = ["Bundeshaushalt"]
PDF_STAND = "2026-08-03"
PDF_STAND_TEXT = "3. August 2026"
PDF_SEITE = 1
PDF_ROLLE = "Parlamentarischer Staatssekretär Dennis Rohde"
PDF_AUFGABE = (
    "Unterstützung des Ministers bei der Erfüllung seiner Regierungsaufgaben, "
    "insbesondere in Angelegenheiten des Bundeshaushalts"
)
PDF_POSITION = (
    "Oberste Amtsreihe, eigener Kasten unmittelbar rechts vom Minister, links von Staatsministerin Kaiser"
)
PDF_AUSSCHLUSS = (
    "Keine Geschäftsbereiche oder Abteilungen benachbarter beamteter Staatssekretäre übernehmen, "
    "keine Steuerpolitik aus Schrodis Kasten, keine Ostdeutschland-Zuständigkeit aus Kaisers Kasten."
)
PDF_METHODE = "Manuelle Sichtprüfung des gerenderten Originals, kein automatischer PDF-Parservertrag"
LANDING_LINKTEXT = "Organisationsplan des Bundesministeriums der Finanzen (Stand: 3. August 2026)"
PDF_HREF = "/Content/DE/Downloads/Ministerium/organigramm.pdf?__blob=publicationFile&v=32"
PDF_PFAD = "/Content/DE/Downloads/Ministerium/organigramm.pdf"
LANDING_URL = "https://www.bundesfinanzministerium.de/Web/DE/Ministerium/Abteilungen/abteilungen.html"

# Das MdB-JSON-LD der Personenseite traegt genau diese eine echte Role. Sie ist
# ausdruecklich KEINE PSts-Amtsrolle; aus ihr darf kein Amtsbeginn abgeleitet werden.
MDB_ROLLEN = [
    {
        "roleName": "Mitglied des Bundestages",
        "startDate": "2025-03-25",
        "endDate": None,
    }
]

# Nur das eine ausdrueckliche Thema ist freigegeben; diese Gegenproben duerfen NIE
# ein Thema werden (Nachbarkaesten, beamtete Staatssekretaere, ganze Abteilungen).
VERBOTENE_THEMEN = (
    "Steuerpolitik", "Ostdeutschland", "Steuern", "Zoll", "Finanzmarkt",
    "Europa", "Finanzpolitik", "Bund-Länder", "Verwaltung", "Abteilung",
)


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_rohde", pfad)
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
    "bundestag-rohde-dennis-1046814": {
        "region": REGION,
        "bindungsart": BINDUNGSART,
        "person": "Dennis Rohde",
        "funktion": FUNKTION,
        "funktionstext": FUNKTION,
        "amt": AMT,
        "aufgabenbindung": AUFGABENBINDUNG,
        "themen": list(THEMEN),
        "mdBRollen": [dict(rolle) for rolle in MDB_ROLLEN],
        "fachurteil": {
            "methode": PDF_METHODE,
            "seite": PDF_SEITE,
            "position": PDF_POSITION,
            "rolleWortlaut": PDF_ROLLE,
            "aufgabeWortlaut": PDF_AUFGABE,
            "ausschluss": PDF_AUSSCHLUSS,
        },
        "personenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/R/rohde_dennis-1046814",
            "finalUrl": "https://www.bundestag.de/abgeordnete/biografien/R/rohde_dennis-1046814",
            "abgerufenAm": "2026-09-27T13:02:10.017842+00:00",
            "sha256": "cb8e81edc22be280ea43c8df741db3dcd3c6ea03534c196c5bfeb6269c73b299",
            "bytes": 273624,
            "datei": "bundestag-rohde_dennis-1046814.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "quelle": {
            "url": "https://www.bundesfinanzministerium.de/Content/DE/Downloads/Ministerium/organigramm.pdf?__blob=publicationFile&v=32",
            "finalUrl": "https://www.bundesfinanzministerium.de/Content/DE/Downloads/Ministerium/organigramm.pdf?__blob=publicationFile&v=32",
            "abgerufenAm": "2026-09-27T21:59:46.922875+00:00",
            "sha256": "47d9e346b65ff73894888336d6ecafd2c4c6744de52342325783c90888108111",
            "bytes": 234311,
            "datei": "bmf-organigramm-v32-20260927.pdf",
            "http": 200,
            "abrufStatus": "abgerufen",
            "stand": PDF_STAND,
            "seite": PDF_SEITE,
        },
        "aktuelleVerlinkung": {
            "url": LANDING_URL,
            "finalUrl": LANDING_URL,
            "abgerufenAm": "2026-09-27T21:59:24.504965+00:00",
            "sha256": "f789cb3e8b3f55d09edda8d9aa235deb0d867e6b928c649bfab6c12b8d009a4a",
            "bytes": 190879,
            "datei": "bmf-abteilungen-20260927.html",
            "http": 200,
            "abrufStatus": "abgerufen",
            "linktext": LANDING_LINKTEXT,
            "href": PDF_HREF,
        },
        "rollenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/R/rohde_dennis-1046814",
            "sha256": "cb8e81edc22be280ea43c8df741db3dcd3c6ea03534c196c5bfeb6269c73b299",
            "abgerufenAm": "2026-09-27T13:02:10.017842+00:00",
        },
    }
}


class RohdeFehler(Exception):
    """Fail-closed-Abbruch der Rohde-Einzelfallpruefung."""


# ── Kleine, strenge HTML-Leser (nur echte geschlossene Elemente) ──────────────────────────

def _unsichtbar(attrs) -> bool:
    """Sichtbarkeit des Elements; ein unsichtbarer Vorfahr wird separat gezaehlt."""
    werte = dict(attrs)
    klassen = str(werte.get("class") or "").split()
    stil = re.sub(r"\s+", "", str(werte.get("style") or "")).lower()
    return (
        "hidden" in werte or "inert" in werte
        or str(werte.get("aria-hidden") or "").lower() == "true"
        or "hidden" in klassen or "--hidden" in klassen
        or "display:none" in stil or "visibility:hidden" in stil
    )

class _Personenname(HTMLParser):
    """Nur echte sichtbare H1, keine Namen in Kommentaren, Skripten oder Vorlagen."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blockiert = []
        self.rahmen = []
        self.versteckt = 0
        self.kopf = None
        self.kopf_sichtbar = False
        self.namen = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.blockiert.append(tag)
        if self.blockiert:
            return
        if tag in self.VOID:
            return
        versteckt = _unsichtbar(attrs)
        if tag == "h1":
            if self.kopf is not None:
                raise RohdeFehler("Rohde: verschachtelte H1.")
            self.kopf = []
            self.kopf_sichtbar = not (self.versteckt or versteckt)
        self.rahmen.append((tag, versteckt))
        if versteckt:
            self.versteckt += 1

    def handle_endtag(self, tag):
        if self.blockiert:
            if tag == self.blockiert[-1]:
                self.blockiert.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index][0] == tag:
                position = index
                break
        if position is None:
            return
        if tag == "h1" and self.kopf is not None:
            if self.kopf_sichtbar:
                self.namen.append(ZU._norm(" ".join(self.kopf)))
            self.kopf = None
            self.kopf_sichtbar = False
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index][1]:
                self.versteckt -= 1
        del self.rahmen[position:]

    def handle_data(self, data):
        if not self.blockiert and self.kopf is not None and not self.versteckt:
            self.kopf.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.blockiert or parser.kopf is not None or parser.rahmen or parser.versteckt:
            raise RohdeFehler("Rohde: Personenmarkup unvollstaendig.")
        return parser.namen


class _Funktionsblock(HTMLParser):
    """Genau EIN geschlossener ``div.m-biography__function``-Block (eigener Funktionstext)."""
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
        self.block_sichtbar = False
        self.teile = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag in self.VOID:
            return
        attrs = dict(attrs)
        versteckt = _unsichtbar(attrs.items())
        if tag == "div":
            if self.tiefe:
                self.tiefe += 1
            elif "m-biography__function" in attrs.get("class", "").split():
                self.tiefe = 1
                self.block_position = len(self.rahmen)
                self.block_sichtbar = not (self.versteckt or versteckt)
                self.teile = []
        self.rahmen.append((tag, versteckt))
        if versteckt:
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
            if self.rahmen[index][0] == tag:
                position = index
                break
        if position is None:
            return
        if self.tiefe and position < self.block_position:
            raise RohdeFehler("Rohde: Funktionstext verlaesst seinen eigenen Abschnitt.")
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index][1]:
                self.versteckt -= 1
        del self.rahmen[position:]
        if tag == "div" and self.tiefe:
            self.tiefe -= 1
            if not self.tiefe:
                self.block_position = None
                if self.block_sichtbar and not self.versteckt:
                    self.bloecke.append(" ".join(self.teile))
                else:
                    raise RohdeFehler("Rohde: Funktionstext ist unsichtbar oder unvollstaendig.")
                self.block_sichtbar = False

    def handle_data(self, data):
        if self.tiefe and not self.ausgelassen and not self.versteckt:
            self.teile.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> str:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.tiefe or len(parser.bloecke) != 1:
            raise RohdeFehler("Rohde: Funktionstextblock fehlt, ist doppelt oder unvollstaendig.")
        return ZU._norm(parser.bloecke[0])


class _AnkerLeser(HTMLParser):
    """Nur echte sichtbare Anker (href + eigener Text); Skripte/Vorlagen/Navigation zaehlen nicht."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.versteckt = 0
        self.rahmen = []
        self.tiefe = 0
        self.position = None
        self.href = None
        self.teile = []
        self.anker = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag in self.VOID:
            return
        attrs = dict(attrs)
        versteckt = _unsichtbar(attrs.items())
        if tag == "a":
            if self.tiefe:
                raise RohdeFehler("Rohde: verschachtelter Anker.")
            self.tiefe = 1
            self.position = len(self.rahmen)
            self.versteckt_anker = self.versteckt > 0 or versteckt
            self.href = attrs.get("href")
            self.teile = []
        self.rahmen.append((tag, versteckt))
        if versteckt:
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
            if self.rahmen[index][0] == tag:
                position = index
                break
        if position is None:
            return
        if self.tiefe and position < self.position:
            raise RohdeFehler("Rohde: Anker verlaesst seinen eigenen Bereich.")
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index][1]:
                self.versteckt -= 1
        del self.rahmen[position:]
        if tag == "a" and self.tiefe:
            self.tiefe = 0
            self.position = None
            if not self.versteckt and not self.versteckt_anker and self.href:
                self.anker.append((self.href, ZU._norm(" ".join(self.teile))))
            self.href = None
            self.teile = []

    def handle_data(self, data):
        if self.tiefe and not self.ausgelassen and not self.versteckt:
            self.teile.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.tiefe:
            raise RohdeFehler("Rohde: Anker-Markup unvollstaendig.")
        return parser.anker


class _JsonLdLeser(HTMLParser):
    """Liest NUR echte ``<script type="application/ld+json">``-Bloecke (kein PDF-Parser)."""
    AUSGELASSEN = {"style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.aktiv = False
        self.puffer = []
        self.bloecke = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag == "script":
            art = str(dict(attrs).get("type") or "").strip().lower()
            if art == "application/ld+json":
                self.aktiv = True
                self.puffer = []

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "script" and self.aktiv:
            self.bloecke.append("".join(self.puffer))
            self.aktiv = False
            self.puffer = []

    def handle_data(self, data):
        if self.aktiv:
            self.puffer.append(data)

    @classmethod
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.aktiv:
            raise RohdeFehler("Rohde: JSON-LD-Markup unvollstaendig.")
        return parser.bloecke


def _mdB_rollen(dokument: str, erwarteter_name: str) -> list:
    """Echte Role-Objekte aus genau einem ProfilePage.mainEntity (fail closed)."""
    gesehen = []
    for block in _JsonLdLeser.lese(dokument):
        try:
            daten = json.loads(block)
        except ValueError as fehler:
            raise RohdeFehler(f"Rohde: JSON-LD nicht lesbar: {fehler}") from fehler
        if not isinstance(daten, dict) or daten.get("@type") != "ProfilePage":
            continue
        gesehen.append(daten)
    if len(gesehen) != 1:
        raise RohdeFehler(f"Rohde: erwartet genau eine ProfilePage im JSON-LD, gefunden {len(gesehen)}.")
    person = (gesehen[0].get("mainEntity") or {})
    if person.get("@type") != "Person":
        raise RohdeFehler("Rohde: ProfilePage.mainEntity ist keine Person.")
    if person.get("@id") != "#mdb" or ZU._norm(person.get("name")) != ZU._norm(erwarteter_name):
        raise RohdeFehler("Rohde: ProfilePage.mainEntity ist nicht die kanonische Person.")
    if person.get("url") is not None:
        raise RohdeFehler("Rohde: unerwartete mainEntity.url ist kein Beleg dieser Quelle.")
    rollen = []
    for eintrag in person.get("memberOf") or []:
        if not isinstance(eintrag, dict) or eintrag.get("@type") != "Role":
            continue
        rollen.append({
            "roleName": str(eintrag.get("roleName") or "").strip(),
            "startDate": (str(eintrag.get("startDate")).strip() if eintrag.get("startDate") is not None else None),
            "endDate": (str(eintrag.get("endDate")).strip() if eintrag.get("endDate") is not None else None),
        })
    return rollen


# ── Quellenbinder ────────────────────────────────────────────────────────────────────────

def _meta_fuer_datei(datei_name: str, zusatz: Path, kennung: str, feld: str) -> dict:
    """Metadaten einer BMF-Zusatzquelle (alle drei Repo-Konventionen, fail closed).

    Die BMF-Ablage nutzt die stammbasierte Form ``<stamm>.meta.json`` (ohne
    Dateiendung); zur Sicherheit werden auch ``<datei>.meta.json`` und
    ``<stamm>.json`` akzeptiert. Genau ein Treffer ist Pflicht — mehrdeutige oder
    fehlende Metadaten sperren.
    """
    kandidaten = [
        zusatz / f"{datei_name}.meta.json",
        (zusatz / datei_name).with_suffix(".meta.json"),
        (zusatz / datei_name).with_suffix(".json"),
    ]
    treffer = [pfad for pfad in kandidaten if pfad.is_file()]
    if len(dict.fromkeys(treffer)) != 1:
        raise RohdeFehler(f"Rohde: Metadaten fehlen/mehrdeutig zu {datei_name!r} ({kennung}/{feld}).")
    return ZU._lies_json(treffer[0])


def _pruefe_bmf_quelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str) -> dict:
    """Bindet eine amtliche BMF-Quelle an Metadatum UND echtes Original-Bytes."""
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise RohdeFehler(f"Rohde: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise RohdeFehler(f"Rohde: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise RohdeFehler(f"Rohde: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    meta = _meta_fuer_datei(datei_name, zusatz, kennung, feld)
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise RohdeFehler(f"Rohde: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if str(meta.get("http")) != str(quelle.get("http")):
        raise RohdeFehler(f"Rohde: Metadatum http weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise RohdeFehler(f"Rohde: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise RohdeFehler(f"Rohde: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if ZU._quellenhost(quelle.get("url")) != QUELLHOST_BMF:
        raise RohdeFehler(
            f"Rohde: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise RohdeFehler(f"Rohde: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return dict(quelle)


def _organigramm_version(url, erwartete_url) -> str:
    """Die v-Parameter-Version einer Organigramm-Adresse relativ zur kanonischen Adresse."""
    teile = urlsplit(str(url or ""))
    kanonisch = urlsplit(str(erwartete_url or ""))
    if teile.path != kanonisch.path:
        return ""
    werte = parse_qs(teile.query)
    if werte.get("__blob") != ["publicationFile"]:
        return ""
    versionen = werte.get("v") or []
    return versionen[0] if len(versionen) == 1 else ""


def _pruefe_pdf_quelle(ergebnis: dict, erwartet: dict, zusatz: Path, kennung: str) -> dict:
    """Bindet den amtlich verlinkten v=32-Organisationsplan und das fixierte Fachurteil."""
    quelle = _pruefe_bmf_quelle(ergebnis, zusatz, kennung, "quelle")
    if dict(quelle) != dict(erwartet["quelle"]):
        raise RohdeFehler(f"Rohde: PDF-Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")
    kanonisch = erwartet["quelle"]["url"]
    if _organigramm_version(quelle.get("url"), kanonisch) != _organigramm_version(kanonisch, kanonisch):
        raise RohdeFehler(f"Rohde: die PDF-Adresse ist nicht die verlinkte v=32-Fassung ({kennung}).")
    if str(quelle.get("stand") or "") != erwartet["quelle"]["stand"] or quelle.get("seite") != PDF_SEITE:
        raise RohdeFehler(f"Rohde: PDF-Stand/Seite weichen vom fixierten Urteil ab ({kennung}).")
    fachurteil = ergebnis.get("fachurteil")
    if fachurteil != erwartet["fachurteil"]:
        raise RohdeFehler(f"Rohde: Fachurteil weicht vom fixierten Urteil ab ({kennung}).")
    if fachurteil.get("seite") != PDF_SEITE or not str(fachurteil.get("methode") or "").strip():
        raise RohdeFehler(f"Rohde: nur Seite 1 mit manueller Methode ist freigegeben ({kennung}).")
    rollenwortlaut = str(fachurteil.get("rolleWortlaut") or "")
    if not ZU._enthaelt_in_reihenfolge(erwartet["person"], rollenwortlaut):
        raise RohdeFehler(f"Rohde: der eigene Kasten traegt nicht den Personennamen ({kennung}).")
    if "Staatssekretär" not in rollenwortlaut:
        raise RohdeFehler(f"Rohde: der eigene Kasten traegt nicht die PSts-Rolle ({kennung}).")
    return quelle


def _pruefe_landingpage(ergebnis: dict, erwartet: dict, zusatz: Path, kennung: str) -> dict:
    """Die amtliche Landingpage muss genau den datierten v=32-Organigramm-Link tragen."""
    landing = _pruefe_bmf_quelle(ergebnis, zusatz, kennung, "aktuelleVerlinkung")
    if dict(landing) != dict(erwartet["aktuelleVerlinkung"]):
        raise RohdeFehler(f"Rohde: Landingpage-Metadaten weichen vom fixierten Urteil ab ({kennung}).")
    if _organigramm_version(landing.get("url"), erwartet["quelle"]["url"]) or (
        urlsplit(str(landing.get("url"))).path != urlsplit(str(erwartet["aktuelleVerlinkung"]["url"])).path
    ):
        raise RohdeFehler(f"Rohde: die Landingpage-Adresse weicht ab ({kennung}).")
    text = (zusatz / str(landing["datei"])).read_text(encoding="utf-8", errors="replace")
    ziel = str(erwartet["quelle"]["url"])
    kanonische_version = _organigramm_version(ziel, ziel)
    fremd = ziel.replace(f"v={kanonische_version}", "v=41") if kanonische_version else ziel
    treffer = []
    for href, ankertext in _AnkerLeser.lese(text):
        aufgeloest = urljoin(str(landing.get("finalUrl") or landing.get("url")), _html.unescape(href))
        if aufgeloest == ziel:
            treffer.append((_html.unescape(href), ankertext))
        if aufgeloest == fremd:
            raise RohdeFehler(f"Rohde: die Landingpage verlinkt die nicht massgebliche v=41-Fassung ({kennung}).")
    if len(treffer) != 1:
        raise RohdeFehler(f"Rohde: die Landingpage verlinkt das v=32-Organigramm nicht genau einmal ({kennung}).")
    href, ankertext = treffer[0]
    if _organigramm_version(urljoin(str(landing.get("finalUrl") or landing.get("url")), href), ziel) != kanonische_version:
        raise RohdeFehler(f"Rohde: der echte Link ist nicht die v=32-Fassung ({kennung}).")
    if ankertext != ZU._norm(erwartet["aktuelleVerlinkung"]["linktext"]):
        raise RohdeFehler(f"Rohde: der datierte Linktext weicht ab ({kennung}).")
    if str(landing.get("linktext") or "") != erwartet["aktuelleVerlinkung"]["linktext"]:
        raise RohdeFehler(f"Rohde: der fixierte Linktext weicht ab ({kennung}).")
    if str(landing.get("href") or "") != erwartet["aktuelleVerlinkung"]["href"]:
        raise RohdeFehler(f"Rohde: der fixierte href weicht ab ({kennung}).")
    return landing


def _pruefe_personenquelle(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                           detailseiten: Path, kennung: str, erwartet: dict) -> tuple:
    """Bindet die kanonische Bundestags-Person separat neu (Original UND Abrufmetadatum)."""
    personenquelle = ergebnis.get("personenquelle") or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(personenquelle.get(name) or "") == "":
            raise RohdeFehler(f"Rohde: Personenquellenfeld {name} fehlt ({kennung}).")
    datei_name = str(personenquelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise RohdeFehler(f"Rohde: ungueltiger Personenquelldateiname ({kennung}).")
    datei = Path(detailseiten) / datei_name
    if not datei.is_file():
        raise RohdeFehler(f"Rohde: amtliche Personenquelle fehlt ({kennung}).")
    if ZU._quellenhost(personenquelle.get("url")) != QUELLHOST_PERSON:
        raise RohdeFehler(f"Rohde: unerwarteter Personenquellen-Host ({kennung}).")
    if personenquelle.get("finalUrl") != personenquelle.get("url"):
        raise RohdeFehler(f"Rohde: Personenquelle finalUrl weicht ab ({kennung}).")
    if personenquelle.get("http") != 200 or personenquelle.get("abrufStatus") != "abgerufen":
        raise RohdeFehler(f"Rohde: Personenabruf nicht erfolgreich ({kennung}).")
    if ZU._sha256(datei) != str(personenquelle.get("sha256")) or datei.stat().st_size != personenquelle.get("bytes"):
        raise RohdeFehler(f"Rohde: Personenquellen-Hash/Bytezahl weicht ab ({kennung}).")
    if dict(personenquelle) != dict(erwartet["personenquelle"]):
        raise RohdeFehler(f"Rohde: Personenquellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise RohdeFehler(f"Rohde: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != "bundestag":
        raise RohdeFehler(f"Rohde: Kennung {kennung} ist kein Bundestagsprofil.")
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http", "abrufStatus"):
        if str(abruf.get(name)) != str(personenquelle.get(name)):
            raise RohdeFehler(f"Rohde: Abrufmetadatum {name} weicht ab ({kennung}).")

    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise RohdeFehler(f"Rohde: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
    if str(rollen_eintrag.get("status")) != "belegt":
        raise RohdeFehler(f"Rohde: die 54er Rolle zu {kennung} muss belegt sein.")
    rollen_ref = rollen_eintrag.get("quelle") or {}
    for name in ("url", "sha256", "abgerufenAm"):
        if str(rollen_ref.get(name)) != str(personenquelle.get(name)):
            raise RohdeFehler(f"Rohde: 54er Rollenquelle weicht ab ({name}) ({kennung}).")
    wortlaute = [str(f.get("wortlaut") or "").strip() for f in (rollen_eintrag.get("funktionen") or [])]
    if erwartet["funktion"] not in wortlaute:
        raise RohdeFehler(f"Rohde: der belegte 54er-Eintrag {kennung} traegt nicht die Rolle.")

    text = datei.read_text(encoding="utf-8", errors="replace")
    namen = _Personenname.lese(text)
    if len(namen) != 1 or namen[0] != ZU._norm(erwartet["person"]):
        raise RohdeFehler(f"Rohde: Person passt nicht zur kanonischen Kennung ({kennung}).")
    funktionstext = _Funktionsblock.lese(text)
    if funktionstext != ZU._norm(erwartet["funktionstext"]):
        raise RohdeFehler(f"Rohde: der eigene Funktionstext weicht vom fixierten Urteil ab ({kennung}).")
    # Die PSts-Funktion hat im eigenen Funktionsabschnitt KEINE Datumsangabe.
    if re.search(r"\b(seit|von|ab)\b|\b(19|20)\d{2}\b", funktionstext, re.IGNORECASE):
        raise RohdeFehler(f"Rohde: der eigene Funktionstext traegt unerwartet eine Amtszeit ({kennung}).")

    rollen = _mdB_rollen(text, erwartet["person"])
    if not rollen:
        raise RohdeFehler(f"Rohde: die Personenseite traegt keine echte MdB-Role ({kennung}).")
    for rolle in rollen:
        if ZU._norm(rolle["roleName"]) == ZU._norm(erwartet["funktion"]):
            raise RohdeFehler(f"Rohde: die PSts-Funktion darf keine JSON-LD-Amtsrolle sein ({kennung}).")
    if erwartet.get("mdBRollen") is not None and rollen != erwartet["mdBRollen"]:
        raise RohdeFehler(f"Rohde: die MdB-Role weicht vom fixierten Urteil ab ({kennung}).")
    return personenquelle, text


def _pruefe_themen(erwartet: dict, fachurteil: dict, kennung: str) -> None:
    themen = erwartet["themen"]
    if len(themen) != 1 or list(dict.fromkeys(themen)) != themen:
        raise RohdeFehler(f"Rohde: genau ein eindeutiges Thema ist freigegeben ({kennung}).")
    aufgabe = str(fachurteil.get("aufgabeWortlaut") or "")
    for thema in themen:
        # Woertliche Teilzeichenkette im gebundenen Kasten: das genehmigte Thema
        # "Bundeshaushalt" steht dort als Genitiv "Bundeshaushalts". Keine
        # Bedeutungs-/Fuzzy-Suche, nur echte Zeichengleichheit.
        if ZU._norm(thema) not in ZU._norm(aufgabe):
            raise RohdeFehler(f"Rohde: Thema {thema!r} steht nicht im gebundenen Kasten ({kennung}).")
        for verboten in VERBOTENE_THEMEN:
            if verboten.lower() in str(thema).lower():
                raise RohdeFehler(f"Rohde: fremdes/generalisiertes Thema {thema!r} ist gesperrt ({kennung}).")


def pruefe_rohde(eingang, *, quittung=None, ressortachsen_kennungen=None,
                 aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                 zusatzaufgaben_kennungen=None, bmwsb_kennungen=None, amthor_kennungen=None,
                 wahlausschuss_kennungen=None, jarzombek_kennungen=None, kloeckner_kennungen=None,
                 stellvertretungen_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Einzelfallquittung Dennis Rohde (fail closed).

    Erzwungen wird: genau EINE kanonische Kennung, disjunkt zu den 19 Ressort-, 6
    Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3
    Wahlausschuss-, 1 Jarzombek-, 1 Kloeckner- und 1 Stellvertretungsachse; die
    kanonische 500er-Person (Name + echte H1 + eigener aktueller Funktionstext
    ohne Datumsangabe + ProfilePage-JSON-LD-Gegenprobe) separat neu gebunden,
    waehrend die bestehende Rolle aus der belegten 54er Quittung stammt; das
    Thema ausschliesslich aus Rohdes eigenem, manuell abgenommenem Kasten der
    amtlich verlinkten v=32-Organisationsplan-PDF (nur Originalbytes ueber
    Hash/Bytezahl/Stand/Seite, KEIN PDF-Parser). Jede Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "rohde", None)
    if quittung is None:
        if not ROHDE.is_file():
            raise RohdeFehler(f"Rohde-Quittung fehlt: {ROHDE_RESSOURCE}.")
        quittung = ZU._lies_json(ROHDE)
    if not isinstance(quittung, dict):
        raise RohdeFehler(f"Rohde-Quittung fehlt: {ROHDE_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise RohdeFehler(
            f"Rohde-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise RohdeFehler(f"Rohde-Quittung: unerwartete Bilanz {bilanz!r}.")

    profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    detailseiten = getattr(eingang, "detailseiten", None) or (Path(eingang.verzeichnis) / "detailseiten")
    zusatz = Path(eingang.verzeichnis) / "zusatzquellen"
    def _kennungen(explizit, feld):
        if explizit is not None:
            return set(explizit)
        return set(getattr(eingang, feld, None) or {})

    disjunkt = (
        ("Ressortachse", _kennungen(ressortachsen_kennungen, "ressortachsen_by_kennung")),
        ("Aufgabenachse", _kennungen(aufgabenachsen_kennungen, "aufgabenachsen_by_kennung")),
        ("beratende Achse", _kennungen(beratendeachsen_kennungen, "beratendeachsen_by_kennung")),
        ("Zusatzaufgabenachse", _kennungen(zusatzaufgaben_kennungen, "zusaetzlicheaufgaben_by_kennung")),
        ("BMWSB-Achse", _kennungen(bmwsb_kennungen, "bmwsb_by_kennung")),
        ("Amthor-Achse", _kennungen(amthor_kennungen, "amthor_by_kennung")),
        ("Wahlausschuss-Achse", _kennungen(wahlausschuss_kennungen, "wahlausschuss_by_kennung")),
        ("Jarzombek-Achse", _kennungen(jarzombek_kennungen, "jarzombek_by_kennung")),
        ("Kloeckner-Achse", _kennungen(kloeckner_kennungen, "kloeckner_by_kennung")),
        ("Stellvertretungsachse", _kennungen(stellvertretungen_kennungen, "stellvertretungen_by_kennung")),
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise RohdeFehler("Rohde: Eintrag ohne Kennung.")
        if kennung in index:
            raise RohdeFehler(f"Rohde: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise RohdeFehler(f"Rohde: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise RohdeFehler(f"Rohde: Kennung {kennung} ist bereits eine {name}.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise RohdeFehler(f"Rohde: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise RohdeFehler(f"Rohde: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise RohdeFehler(f"Rohde: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise RohdeFehler(f"Rohde: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("bindungsart") or "").strip() != erwartet["bindungsart"]:
            raise RohdeFehler(f"Rohde: unerwartete Bindungsart ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise RohdeFehler(f"Rohde: Person weicht vom fixierten Urteil ab ({kennung}).")
        # Die PSts-Funktion hat im Original keine Amtszeit; kein Amtsbeginn/kein Ende.
        if ergebnis.get("amtsbeginn") not in (None, "") or ergebnis.get("amtsende") not in (None, ""):
            raise RohdeFehler(f"Rohde: die PSts-Funktion traegt keine Amtszeit ({kennung}).")

        personenquelle, _personen_text = _pruefe_personenquelle(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet
        )
        pdf_quelle = _pruefe_pdf_quelle(ergebnis, erwartet, zusatz, kennung)
        landing_quelle = _pruefe_landingpage(ergebnis, erwartet, zusatz, kennung)

        for name in ("funktion", "funktionstext", "amt", "aufgabenbindung"):
            if ergebnis.get(name) != erwartet[name]:
                raise RohdeFehler(f"Rohde: Feld {name} weicht vom fixierten Urteil ab ({kennung}).")
        if ergebnis.get("themen") != erwartet["themen"]:
            raise RohdeFehler(f"Rohde: Themen weichen vom fixierten Urteil ab ({kennung}).")
        _pruefe_themen(erwartet, erwartet["fachurteil"], kennung)
        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise RohdeFehler(f"Rohde: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": erwartet["bindungsart"],
            "person": person,
            "funktion": erwartet["funktion"],
            "funktionstext": erwartet["funktionstext"],
            "amt": erwartet["amt"],
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "themen": list(erwartet["themen"]),
            "ableitungsHinweis": hinweis,
            "fachurteil": dict(erwartet["fachurteil"]),
            "personenquelle": personenquelle,
            "quelle": pdf_quelle,
            "aktuelleVerlinkung": landing_quelle,
        }

    if len(index) != GESAMT:
        raise RohdeFehler(f"Rohde-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
