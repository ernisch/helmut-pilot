#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die drei sonstigen Gremien-Aufgabenachsen
des Wahlausschusses (Britta Haßelmann, Alexander Hoffmann, Dr. Matthias Miersch).

Roadmap §3: Drei bislang offene fachliche Achsen werden ueber die amtliche
Aufgabe des bereits belegten sonstigen Gremiums ``Wahlausschuss`` geschlossen.
Dieses Modul haelt den grossen Assembler ``profil-feldbelege-500.py`` schlank und
verwendet die bestehenden sicheren Quellen-/Personen-/HTML-Helfer des getrennten
Moduls ``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein duplizierter
Block, kein externer Parser). Es prueft ausschliesslich die versionierte, vom
Orchestrator eng vorbereitete Quittung
``docs/betrieb/wahlausschuss-drei-aufgaben-20260927.json`` gegen die amtlichen
Originaldateien, deren Metadaten/Quittungen und die kanonische 54er
Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer Parser, keine hartcodierte Laufzeit. Das
    eng fixierte Fachurteil ist injizierbar (``erwartung``),
  * nur die drei kanonischen Kennungen (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB- und 1 Amthor-Achse),
  * kanonische Person ausschliesslich ueber H1 + URL/Hash/Bytezahl/Abruf/HTTP der
    unveraenderten 54er Rollenquittung (Haßelmann/Miersch bleiben dort offen, das
    ist kein Blocker: die aktuelle Mitgliedschaft wird eigenstaendig neu gebunden),
  * aktuelle Mitgliedschaft ausschliesslich aus genau EINEM ProfilePage.mainEntity
    (Typ Person, ``#mdb``, Name, falls url vorhanden exakt die Quell-URL,
    ``description`` genau 'Mitglied des 21. Deutschen Bundestages') in genau EINER
    echten Role auf exakt Organization/Wahlausschuss/kanonischer Gremien-URL mit
    dem exakten ``roleName``, ``startDate`` <= Abrufzeit und OHNE ``endDate``,
  * enges Thema ausschliesslich aus dem geschlossenen aktuellen
    Gremienaufgabenabsatz unter ``#arbeit-und-aufgaben`` und
    ``.bt-standard-content``: genau ein eigener ``p`` mit vollstaendigem Wortlaut
    UND ausdruecklicher 21. Wahlperiode; Navigation/Template/fremde Absaetze sind
    kein Beleg,
  * beide amtlichen Quellen an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei
    jeweils Original UND ``*.meta.json`` gebunden.
"""

from __future__ import annotations

import datetime as _dt
import html as _html
import importlib.util as _importlib_util
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

WAHLAUSSCHUSS = REPO_ROOT / "docs" / "betrieb" / "wahlausschuss-drei-aufgaben-20260927.json"
WAHLAUSSCHUSS_RESSOURCE = "docs/betrieb/wahlausschuss-drei-aufgaben-20260927.json"

GESAMT = 3
REGION = "Bund"
PARLAMENT = "bundestag"
STATUS = ("belegt",)
GREMIUM = "Wahlausschuss"
GREMIEN_URL = "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss"
BESCHREIBUNG = "Mitglied des 21. Deutschen Bundestages"
THEMA = "Richter des Bundesverfassungsgerichts"
AUFGABENBINDUNG = (
    "Wahlausschuss; Vorschlag der vom Bundestag zu berufenden Richter des "
    "Bundesverfassungsgerichts"
)
AUFGABENABSATZ = (
    "Die 16 Richter des Bundesverfassungsgerichts werden jeweils zur Hälfte von "
    "Bundestag und Bundesrat gewählt (§ 5 Absatz 1 Satz 1 "
    "Bundesverfassungsgerichtsgesetz, BVerfGG). Die vom Bundestag zu berufenden "
    "Richter werden auf Vorschlag des Wahlausschusses durch das Plenum gewählt "
    "(§ 6 Absatz 1 Satz 1 BVerfGG). Der Wahlausschuss für die Richter des "
    "Bundesverfassungsgerichts wird zu Beginn jeder Wahlperiode eingesetzt. Seine "
    "12 Mitglieder sind Abgeordnete der im Bundestag vertretenen Fraktionen und "
    "werden nach den Regeln der Verhältniswahl in den Wahlausschuss gewählt "
    "(§ 6 Absatz 2 BVerfGG). Die CDU/CSU-Fraktion stellt in der 21. Wahlperiode "
    "fünf Abgeordnete, die AfD-Fraktion drei, die SPD-Fraktion zwei, die "
    "Fraktionen Bündnis 90/Die Grünen und der Linken jeweils einen Abgeordneten."
)
WAHLPERIODE_MARKER = "21. Wahlperiode"

QUELLHOSTS = {"bundestag.de"}


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location(
        "profil_feldbelege_500_zusatzaufgaben_wahlausschuss", pfad
    )
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()

# Bewusst eng fixiertes, am Original abgenommenes Fachurteil. Fuer synthetische
# Testfixtures vollstaendig injizierbar (``erwartung``).
ERWARTUNG = {
    "themen": [THEMA],
    "aufgabenbindung": AUFGABENBINDUNG,
    "aufgabenAbsatz": AUFGABENABSATZ,
    "beschreibung": BESCHREIBUNG,
    "gremium": GREMIUM,
    "gremienUrl": GREMIEN_URL,
    "quelle": {
        "url": "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss",
        "finalUrl": "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss",
        "abgerufenAm": "2026-09-27T19:39:37.872399+00:00",
        "sha256": "8e131046ee994e186873d8bbec7f84f90fd58057158a9080b06911826db26ed8",
        "bytes": 270972,
        "datei": "wahlausschuss-aktuell.html",
        "http": 200,
        "abrufStatus": "abgerufen",
    },
    "gegenquelle": {
        "url": "https://www.bundestag.de/services/glossar/wahlaussch-245562",
        "finalUrl": "https://www.bundestag.de/services/glossar/wahlaussch-245562",
        "abgerufenAm": "2026-09-27T19:39:38.699822+00:00",
        "sha256": "efcd65df01e32b3853de8bf32b92f0cd9643864f119b0e2a4897c94395796e73",
        "bytes": 252836,
        "datei": "wahlausschuss-glossar.html",
        "http": 200,
        "abrufStatus": "abgerufen",
    },
    "personen": {
        "bundestag-hasselmann-britta-1044778": {
            "region": REGION,
            "person": "Britta Haßelmann",
            "roleName": "Ordentliches Mitglied",
            "startDate": "2025-03-25",
            "rollenquelle": {
                "url": "https://www.bundestag.de/abgeordnete/biografien/H/hasselmann_britta-1044778",
                "sha256": "0750ba10353c7db1b54d6bf3d7d35161d526ee8f96a5c3159398d4674e7cfbea",
                "abgerufenAm": "2026-09-27T12:59:36.772613+00:00",
            },
        },
        "bundestag-hoffmann-alexander-1048720": {
            "region": REGION,
            "person": "Alexander Hoffmann",
            "roleName": "Ordentliches Mitglied",
            "startDate": "2025-03-25",
            "rollenquelle": {
                "url": "https://www.bundestag.de/abgeordnete/biografien/H/hoffmann_alexander-1048720",
                "sha256": "3c9b5716794f7a13785bbfa3ab32792d916a6dc3698f17d49927d4fb74fbddb1",
                "abgerufenAm": "2026-09-27T13:00:30.701425+00:00",
            },
        },
        "bundestag-miersch-matthias-1046120": {
            "region": REGION,
            "person": "Dr. Matthias Miersch",
            "roleName": "Stellvertretendes Mitglied",
            "startDate": "2025-03-25",
            "rollenquelle": {
                "url": "https://www.bundestag.de/abgeordnete/biografien/M/miersch_matthias-1046120",
                "sha256": "1964d6f86f4c5ee9fdece19ece9483e17197c776db4c3e52f21b92d965d6b902",
                "abgerufenAm": "2026-09-27T13:02:01.522263+00:00",
            },
        },
    },
}


class WahlausschussFehler(Exception):
    """Fail-closed-Abbruch der Wahlausschuss-Aufgabenpruefung."""


# ── Sichere Original-/Metadatenbindung (wiederverwendet) ─────────────────────

def _pruefe_zusatzquelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str,
                         erwartet: dict) -> tuple:
    """Bindet eine amtliche Quelle an Metadatum und echtes Original.

    Verwendet den strengen Quellenleser des Zusatzaufgabenmoduls (URL/finalUrl/
    Abrufzeit/Hash/Bytezahl/Datei/HTTP/Original); nur der zulaessige Host wird eng
    auf den Bundestag festgelegt. Die Metadatendatei muss denselben HTTP-Status tragen.
    """
    try:
        quelle, text = ZU._pruefe_quelle(ergebnis, zusatz, kennung, feld)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise WahlausschussFehler(str(fehler)) from fehler
    if ZU._quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise WahlausschussFehler(
            f"Wahlausschuss: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if dict(quelle) != dict(erwartet):
        raise WahlausschussFehler(f"Wahlausschuss: Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}/{feld}).")
    return quelle, text


def _datum_iso(wert) -> _dt.date:
    try:
        return _dt.date.fromisoformat(str(wert))
    except ValueError as fehler:
        raise WahlausschussFehler(f"Wahlausschuss: ungueltiges ISO-Datum {wert!r}.") from fehler


# ── Amtliches ProfilePage-JSON-LD der Bundestags-Detailseite ─────────────────

class _PersonenMarkup(HTMLParser):
    """Nur echte H1 und JSON-LD; inerte Vorlagen/Kommentare sind keine Belege."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blockiert = []
        self.skript = None
        self.in_skript = False
        self.h1 = None
        self.namen = []
        self.bloecke = []

    def handle_starttag(self, tag, attrs):
        if tag in {"template", "noscript", "nav", "style"}:
            self.blockiert.append(tag)
        if self.blockiert:
            return
        if tag == "script":
            self.in_skript = True
            self.skript = [] if dict(attrs).get("type") == "application/ld+json" else None
        elif tag == "h1":
            if self.h1 is not None:
                raise WahlausschussFehler("Wahlausschuss: verschachtelte H1.")
            self.h1 = []

    def handle_endtag(self, tag):
        if self.blockiert:
            if tag == self.blockiert[-1]:
                self.blockiert.pop()
            return
        if tag == "script":
            if self.skript is not None:
                self.bloecke.append("".join(self.skript))
            self.skript = None
            self.in_skript = False
        elif tag == "h1" and self.h1 is not None:
            self.namen.append(ZU._norm(" ".join(self.h1)))
            self.h1 = None

    def handle_data(self, data):
        if not self.blockiert:
            if self.skript is not None:
                self.skript.append(data)
            elif self.h1 is not None and not self.in_skript:
                self.h1.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.blockiert or parser.in_skript or parser.h1 is not None:
            raise WahlausschussFehler("Wahlausschuss: Personenmarkup unvollstaendig.")
        return parser


def _jsonld_profilepages(dokument: str) -> list:
    """Alle ``ProfilePage``-Eintraege der amtlichen JSON-LD-Bloecke."""
    seiten = []
    for block in _PersonenMarkup.lese(dokument).bloecke:
        try:
            daten = json.loads(block)
        except json.JSONDecodeError:
            continue
        for eintrag in (daten if isinstance(daten, list) else [daten]):
            if isinstance(eintrag, dict) and eintrag.get("@type") == "ProfilePage":
                seiten.append(eintrag)
    return seiten


def _pruefe_mitgliedschaft(detail_text: str, fixiert: dict, person_erwartet: dict, kennung: str,
                           person: str, quell_url: str, abruf_tag: _dt.date) -> dict:
    """Aktuelle Wahlausschuss-Mitgliedschaft aus genau einem ProfilePage.mainEntity."""
    seiten = _jsonld_profilepages(detail_text)
    if len(seiten) != 1:
        raise WahlausschussFehler(
            f"Wahlausschuss: erwartet genau EIN ProfilePage.mainEntity, gefunden {len(seiten)} ({kennung})."
        )
    haupt = seiten[0].get("mainEntity")
    if not isinstance(haupt, dict) or haupt.get("@type") != "Person":
        raise WahlausschussFehler(f"Wahlausschuss: ProfilePage.mainEntity ist keine Person ({kennung}).")
    if str(haupt.get("@id") or "").strip() != "#mdb":
        raise WahlausschussFehler(f"Wahlausschuss: ProfilePage.mainEntity traegt nicht #mdb ({kennung}).")
    if ZU._norm(haupt.get("name")) != ZU._norm(person):
        raise WahlausschussFehler(f"Wahlausschuss: Person passt nicht zur kanonischen Kennung ({kennung}).")
    person_url = haupt.get("url")
    if "url" in haupt and str(person_url).strip() != str(quell_url):
        raise WahlausschussFehler(f"Wahlausschuss: mainEntity.url weicht von der Quell-URL ab ({kennung}).")
    if ZU._norm(haupt.get("description")) != ZU._norm(fixiert["beschreibung"]):
        raise WahlausschussFehler(
            f"Wahlausschuss: description ist nicht '{fixiert['beschreibung']}' ({kennung})."
        )

    rollen = []
    for mitglied in haupt.get("memberOf") or []:
        if not isinstance(mitglied, dict) or mitglied.get("@type") != "Role":
            continue
        organisation = mitglied.get("memberOf")
        if not isinstance(organisation, dict):
            continue
        if ZU._norm(organisation.get("name")) != ZU._norm(fixiert["gremium"]):
            continue
        rollen.append((organisation, mitglied))
    if len(rollen) != 1:
        raise WahlausschussFehler(
            f"Wahlausschuss: erwartet genau EINE echte Role zum Wahlausschuss, gefunden {len(rollen)} ({kennung})."
        )
    organisation, role = rollen[0]
    if organisation.get("@type") != "Organization":
        raise WahlausschussFehler(f"Wahlausschuss: Role.memberOf ist keine Organization ({kennung}).")
    if str(organisation.get("url") or "").strip() != str(fixiert["gremienUrl"]):
        raise WahlausschussFehler(f"Wahlausschuss: fremde Gremien-URL ({kennung}).")
    if ZU._norm(role.get("roleName")) != ZU._norm(person_erwartet["roleName"]):
        raise WahlausschussFehler(f"Wahlausschuss: falscher roleName ({kennung}).")
    if "endDate" in role:
        raise WahlausschussFehler(f"Wahlausschuss: eine aktuelle Rolle darf kein endDate tragen ({kennung}).")
    start = _datum_iso(role.get("startDate"))
    if start > abruf_tag:
        raise WahlausschussFehler(f"Wahlausschuss: startDate liegt nach der Abrufzeit ({kennung}).")
    if start != _datum_iso(person_erwartet["startDate"]):
        raise WahlausschussFehler(f"Wahlausschuss: startDate weicht vom fixierten Urteil ab ({kennung}).")
    return role


# ── Geschlossener aktueller Gremienaufgabenabsatz ────────────────────────────

class _Aufgabenabsatz(HTMLParser):
    """Genau der eigene ``p`` im ``.bt-standard-content`` des Tabs #arbeit-und-aufgaben.

    Skripte, Vorlagen, Navigation und Kommentare sind kein Beleg. Der Abschnitt
    wird nur ueber das echte ``div`` mit ``id="arbeit-und-aufgaben"`` betreten.
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.ziel_tiefe = 0
        self.ziel_gesehen = 0
        self.standard_tiefe = 0
        self.standard_gesehen = 0
        self.absatz = None
        self.absaetze = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        attrs = dict(attrs)
        if tag == "div":
            klassen = attrs.get("class", "").split()
            if attrs.get("id") == "arbeit-und-aufgaben":
                self.ziel_gesehen += 1
                self.ziel_tiefe = 1
            elif self.ziel_tiefe:
                self.ziel_tiefe += 1
            if self.ziel_tiefe and "bt-standard-content" in klassen:
                if self.standard_tiefe:
                    self.standard_tiefe += 1
                else:
                    self.standard_tiefe = 1
                    self.standard_gesehen += 1
            elif self.ziel_tiefe and self.standard_tiefe:
                self.standard_tiefe += 1
        elif tag == "p" and self.standard_tiefe:
            if self.absatz is not None:
                raise WahlausschussFehler("Wahlausschuss: verschachtelter Aufgabenabsatz.")
            self.absatz = []

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "p" and self.absatz is not None:
            self.absaetze.append(ZU._norm(" ".join(self.absatz)))
            self.absatz = None
        elif tag == "div":
            if self.absatz is not None and (self.standard_tiefe == 1 or self.ziel_tiefe == 1):
                raise WahlausschussFehler("Wahlausschuss: Aufgabenabsatz verlaesst seinen Abschnitt.")
            if self.standard_tiefe:
                self.standard_tiefe -= 1
            if self.ziel_tiefe:
                self.ziel_tiefe -= 1

    def handle_data(self, data):
        if not self.ausgelassen and self.absatz is not None:
            self.absatz.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> str:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.ziel_tiefe or parser.standard_tiefe or parser.absatz is not None:
            raise WahlausschussFehler("Wahlausschuss: HTML-Aufgabenabschnitt unvollstaendig.")
        if parser.ziel_gesehen != 1 or parser.standard_gesehen != 1:
            raise WahlausschussFehler(
                "Wahlausschuss: Tab #arbeit-und-aufgaben oder .bt-standard-content fehlt/ist mehrdeutig."
            )
        if len(parser.absaetze) != 1:
            raise WahlausschussFehler(
                f"Wahlausschuss: erwartet genau EINEN eigenen p, gefunden {len(parser.absaetze)}."
            )
        return parser.absaetze[0]


def _pruefe_aufgabenabsatz(text: str, erwartet: dict, kennung: str) -> str:
    """Genau ein eigener p mit vollstaendigem Wortlaut UND 21. Wahlperiode."""
    soll = ZU._norm(erwartet["aufgabenAbsatz"])
    ist = _Aufgabenabsatz.lese(text)
    if ist != soll:
        raise WahlausschussFehler(
            f"Wahlausschuss: der Aufgabenabsatz stimmt nicht mit dem vollstaendigen Wortlaut ueberein ({kennung})."
        )
    if WAHLPERIODE_MARKER not in soll or WAHLPERIODE_MARKER not in ist:
        raise WahlausschussFehler(f"Wahlausschuss: der Aufgabenabsatz traegt nicht die 21. Wahlperiode ({kennung}).")
    if ZU._norm(erwartet["themen"][0]) not in ist:
        raise WahlausschussFehler(f"Wahlausschuss: das enge Thema steht nicht im Aufgabenabsatz ({kennung}).")
    return ist


def pruefe_wahlausschuss(eingang, *, quittung=None, ressortachsen_kennungen=None,
                         aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                         zusatzaufgaben_kennungen=None, bmwsb_kennungen=None,
                         amthor_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Wahlausschuss-Aufgabenquittung (fail closed).

    Erzwungen wird: genau DREI kanonische Kennungen, disjunkt zu den 19 Ressort-,
    6 Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB- und 1 Amthor-Achse; die
    kanonische Person (H1/URL/Hash/Bytezahl/Abruf/HTTP) aus der unveraenderten 54er
    Rollenquittung; die aktuelle Wahlausschuss-Mitgliedschaft ausschliesslich aus
    genau EINEM ProfilePage.mainEntity in genau EINER echten Role (exakter roleName,
    startDate <= Abruf, kein endDate); das enge Thema ausschliesslich aus dem
    geschlossenen aktuellen Gremienaufgabenabsatz; beide Quellen an Metadatum und
    Original gebunden. Jede Abweichung bricht ab.
    """
    fixiert = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "wahlausschuss", None)
    if quittung is None:
        if not WAHLAUSSCHUSS.is_file():
            raise WahlausschussFehler(f"Wahlausschuss-Quittung fehlt: {WAHLAUSSCHUSS_RESSOURCE}.")
        quittung = ZU._lies_json(WAHLAUSSCHUSS)
    if not isinstance(quittung, dict):
        raise WahlausschussFehler(f"Wahlausschuss-Quittung fehlt: {WAHLAUSSCHUSS_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise WahlausschussFehler(
            f"Wahlausschuss-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise WahlausschussFehler(f"Wahlausschuss-Quittung: unerwartete Bilanz {bilanz!r}.")
    for feld in ("themen", "aufgabenbindung", "aufgabenAbsatz", "gremium", "gremienUrl", "beschreibung"):
        if quittung.get(feld) != fixiert[feld]:
            raise WahlausschussFehler(f"Wahlausschuss-Quittung: Feld {feld} weicht vom fixierten Urteil ab.")
    if quittung.get("importfreigegeben") is not False:
        raise WahlausschussFehler("Wahlausschuss-Quittung: importfreigegeben muss false sein.")
    for name in ("quelle", "gegenquelle"):
        if dict(quittung.get(name) or {}) != dict(fixiert[name]):
            raise WahlausschussFehler(f"Wahlausschuss-Quittung: {name} weicht vom fixierten Urteil ab.")

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
    disjunkt = (
        ("Ressortachse", set(ressortachsen_kennungen)),
        ("Aufgabenachse", set(aufgabenachsen_kennungen)),
        ("beratende Achse", set(beratendeachsen_kennungen)),
        ("Zusatzaufgabenachse", set(zusatzaufgaben_kennungen)),
        ("BMWSB-Achse", set(bmwsb_kennungen)),
        ("Amthor-Einzelfallachse", set(amthor_kennungen)),
    )

    # Beide amtlichen Quellen strikt an das fixierte Urteil binden.
    quelle, quelle_text = _pruefe_zusatzquelle(quittung, zusatz, "wahlausschuss", "quelle", fixiert["quelle"])
    _gegenquelle, _gegen_text = _pruefe_zusatzquelle(
        quittung, zusatz, "wahlausschuss", "gegenquelle", fixiert["gegenquelle"]
    )
    _pruefe_aufgabenabsatz(quelle_text, fixiert, "wahlausschuss")

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise WahlausschussFehler("Wahlausschuss: Eintrag ohne Kennung.")
        if kennung in index:
            raise WahlausschussFehler(f"Wahlausschuss: doppelte Kennung {kennung}.")
        if kennung not in fixiert["personen"]:
            raise WahlausschussFehler(f"Wahlausschuss: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise WahlausschussFehler(f"Wahlausschuss: Kennung {kennung} ist bereits eine {name}.")
        erwartet = fixiert["personen"][kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise WahlausschussFehler(f"Wahlausschuss: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != PARLAMENT:
            raise WahlausschussFehler(f"Wahlausschuss: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise WahlausschussFehler(f"Wahlausschuss: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise WahlausschussFehler(f"Wahlausschuss: importfreigegeben muss false sein ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise WahlausschussFehler(f"Wahlausschuss: Person weicht vom fixierten Urteil ab ({kennung}).")
        if str(ergebnis.get("gremium") or "").strip() != fixiert["gremium"]:
            raise WahlausschussFehler(f"Wahlausschuss: fremdes Gremium ({kennung}).")
        if str(ergebnis.get("gremienUrl") or "").strip() != fixiert["gremienUrl"]:
            raise WahlausschussFehler(f"Wahlausschuss: fremde Gremien-URL ({kennung}).")
        if str(ergebnis.get("roleName") or "").strip() != erwartet["roleName"]:
            raise WahlausschussFehler(f"Wahlausschuss: falscher/umgedeuteter roleName ({kennung}).")
        if str(ergebnis.get("startDate") or "").strip() != erwartet["startDate"]:
            raise WahlausschussFehler(f"Wahlausschuss: startDate weicht vom fixierten Urteil ab ({kennung}).")

        # Kanonische Person: SEPARATE Neubindung ueber die unveraenderte 54er Quittung.
        rollen_eintrag = profilrollen.get(kennung)
        if rollen_eintrag is None:
            raise WahlausschussFehler(f"Wahlausschuss: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
        rollen_ref = rollen_eintrag.get("quelle") or {}
        rollen_quelle = ergebnis.get("rollenquelle") or {}
        if (
            rollen_quelle.get("url") != rollen_ref.get("url")
            or rollen_quelle.get("sha256") != rollen_ref.get("sha256")
            or rollen_quelle.get("abgerufenAm") != rollen_ref.get("abgerufenAm")
        ):
            raise WahlausschussFehler(f"Wahlausschuss: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")
        if dict(rollen_quelle) != dict(erwartet["rollenquelle"]):
            raise WahlausschussFehler(f"Wahlausschuss: Rollenquelle weicht vom fixierten Urteil ab ({kennung}).")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise WahlausschussFehler(f"Wahlausschuss: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
        if abruf.get("parlament") != PARLAMENT:
            raise WahlausschussFehler(f"Wahlausschuss: Kennung {kennung} ist kein Bundestagsprofil.")
        if any(rollen_ref.get(feld) != abruf.get(feld) for feld in ("url", "sha256", "abgerufenAm")):
            raise WahlausschussFehler(f"Wahlausschuss: 54er Rollenquelle weicht vom Abruf ab ({kennung}).")
        if (abruf.get("abrufStatus") != "abgerufen" or abruf.get("http") != 200
                or abruf.get("bytes") is None):
            raise WahlausschussFehler(f"Wahlausschuss: Abruf der Personenquelle nicht erfolgreich ({kennung}).")
        detail = Path(detailseiten) / str(abruf.get("datei") or "")
        if (not detail.is_file() or ZU._sha256(detail) != rollen_ref.get("sha256")
                or detail.stat().st_size != abruf.get("bytes")):
            raise WahlausschussFehler(f"Wahlausschuss: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
        detail_text = detail.read_text(encoding="utf-8", errors="replace")
        namen = _PersonenMarkup.lese(detail_text).namen
        if len(namen) != 1 or namen[0] != ZU._norm(person):
            raise WahlausschussFehler(f"Wahlausschuss: Person passt nicht zur kanonischen Kennung ({kennung}).")
        abruf_tag = _dt.date.fromisoformat(str(abruf.get("abgerufenAm"))[:10])
        _pruefe_mitgliedschaft(detail_text, fixiert, erwartet, kennung, person, abruf.get("url"), abruf_tag)

        themen = fixiert["themen"]
        if len(themen) != 1:
            raise WahlausschussFehler(f"Wahlausschuss: genau ein freigegebenes Thema ({kennung}).")
        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=fixiert["aufgabenbindung"])
        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": PARLAMENT,
            "status": "belegt",
            "person": person,
            "gremium": fixiert["gremium"],
            "gremienUrl": fixiert["gremienUrl"],
            "roleName": erwartet["roleName"],
            "startDate": erwartet["startDate"],
            "themen": list(themen),
            "aufgabenbindung": fixiert["aufgabenbindung"],
            "ableitungsHinweis": hinweis,
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise WahlausschussFehler(f"Wahlausschuss-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
