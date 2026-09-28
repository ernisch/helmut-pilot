#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die zwei zuletzt fehlenden aktuellen
Fraktionsvorsitz-Funktionsfelder (Britta Haßelmann, Dr. Matthias Miersch).

Roadmap §3: Im kanonischen Offline-Entwurf der exakt 500 Zielprofile fehlen
zuletzt zwei aktuelle Funktionsfelder. Dieses Modul haelt den grossen Assembler
``profil-feldbelege-500.py`` schlank und verwendet die sicheren Quellen-Helfer
des getrennten Moduls ``profil-feldbelege-500-zusatzaufgaben.py`` (kein
duplizierter Block, kein externer Parser). Es prueft ausschliesslich die
versionierte, eng vorbereitete Quittung
``docs/betrieb/fraktionsvorsitz-zwei-20260927.json`` gegen die amtlichen
Originaldateien, deren Metadaten, die unveraenderte 54er Rollenquittung und den
kanonischen lokalen Abruf und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; das eng fixierte Fachurteil ist injizierbar (``erwartung``),
  * nur die ZWEI kanonischen Kennungen; jede ist eine (weiterhin offene) Achse
    der unveraenderten 54er Rollenquittung und ein Bundestagszielprofil,
  * die kanonische Personenseite wird am lokalen Abrufmetadatensatz UND am echten
    Original gebunden: exakt eine echte H1 und exakt EIN ``ProfilePage.mainEntity``
    (Typ Person, ``@id`` ``#mdb``, Name, ``description`` 'Mitglied des 21. Deutschen
    Bundestages'; ``url`` nur absent oder exakt die kanonische URL),
  * die aktuelle Rolle steht ausschliesslich im geschlossenen sichtbaren Abschnitt
    ``.bt-standard-content`` einer echten ``article.bt-artikel``: exakt die erwartete
    h2 (Fraktionsvorsitzende/Fraktionsvorsitzender) mit eigenem ``p``; verborgene
    oder inerte Inhalte (``hidden``, ``aria-hidden``, ``display:none``,
    ``visibility:hidden``, ``--hidden``, ``template``, ``noscript``, ``nav``) und
    Abschnittsausbrueche (fremde h2, Link ausserhalb ``.bt-standard-content`` oder
    ausserhalb eines ``p``) sind kein Beleg,
  * genau EIN solcher sichtbarer Personenlink, aufgeloest exakt auf die kanonische
    ``#mdb``-Biografie-URL; der sichtbare Linktext ist exakt der Personenname,
  * beide Quellen an URL/finalUrl/Abrufzeit/sha256/Bytezahl/Datei gebunden
    (Original UND Metadatum); HTTP 200/``abgerufen`` sind fixiert,
  * KEINE Themen, KEINE aus der Fraktionsrolle abgeleitete Parteimitgliedschaft,
    keine persoenlichen Positionen, keine Amtsbeginn-Daten und keine weiteren
    Profilfelder; nur die erwarteten Felder sind zugelassen.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[1]

FRAKTIONSVORSITZ = REPO_ROOT / "docs" / "betrieb" / "fraktionsvorsitz-zwei-20260927.json"
FRAKTIONSVORSITZ_RESSOURCE = "docs/betrieb/fraktionsvorsitz-zwei-20260927.json"

GESAMT = 2
PARLAMENT = "bundestag"
REGION = "Bund"
STATUS = ("belegt",)
QUELLHOSTS = {"bundestag.de"}
BESCHREIBUNG = "Mitglied des 21. Deutschen Bundestages"
LINKHINWEIS = "(Interner Link)"

ERLAUBTE_QUITTUNGSFELDER = {
    "version", "datum", "status", "umfang", "bilanz", "ergebnisse", "pruefung", "importfreigegeben",
}
ERLAUBTE_ERGEBNISFELDER = {
    "kennung", "region", "parlament", "status", "person", "funktion", "rolleAbschnitt",
    "rolleZitat", "rollenquelle", "quelle", "importfreigegeben",
}


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location(
        "profil_feldbelege_500_zusatzaufgaben_fraktionsvorsitz", pfad
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
    "bundestag-hasselmann-britta-1044778": {
        "region": REGION,
        "person": "Britta Haßelmann",
        "funktion": "Fraktionsvorsitzende Bündnis 90/Die Grünen",
        "rolleAbschnitt": "Fraktionsvorsitzende",
        "rolleZitat": "Fraktionsvorsitzende Katharina Dröge (Interner Link) Britta Haßelmann",
        "rollenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/H/hasselmann_britta-1044778",
            "finalUrl": "https://www.bundestag.de/abgeordnete/biografien/H/hasselmann_britta-1044778",
            "abgerufenAm": "2026-09-27T12:59:36.772613+00:00",
            "sha256": "0750ba10353c7db1b54d6bf3d7d35161d526ee8f96a5c3159398d4674e7cfbea",
            "bytes": 275923,
            "datei": "bundestag-hasselmann_britta-1044778.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "quelle": {
            "url": "https://www.bundestag.de/parlament/fraktionen/gruene",
            "finalUrl": "https://www.bundestag.de/parlament/fraktionen/gruene",
            "abgerufenAm": "2026-09-27T15:43:25.103449+00:00",
            "sha256": "6e562c9046312d80948c8a7fc70701e799cea2a81fc219f547842d7ed2836b8e",
            "bytes": 255360,
            "datei": "fraktionsspitze-bt-gruene.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    },
    "bundestag-miersch-matthias-1046120": {
        "region": REGION,
        "person": "Dr. Matthias Miersch",
        "funktion": "Fraktionsvorsitzender SPD",
        "rolleAbschnitt": "Fraktionsvorsitzender",
        "rolleZitat": "Fraktionsvorsitzender Dr. Matthias Miersch",
        "rollenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/M/miersch_matthias-1046120",
            "finalUrl": "https://www.bundestag.de/abgeordnete/biografien/M/miersch_matthias-1046120",
            "abgerufenAm": "2026-09-27T13:02:01.522263+00:00",
            "sha256": "1964d6f86f4c5ee9fdece19ece9483e17197c776db4c3e52f21b92d965d6b902",
            "bytes": 279972,
            "datei": "bundestag-miersch_matthias-1046120.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "quelle": {
            "url": "https://www.bundestag.de/parlament/fraktionen/spd",
            "finalUrl": "https://www.bundestag.de/parlament/fraktionen/spd",
            "abgerufenAm": "2026-09-27T15:43:25.868125+00:00",
            "sha256": "024ace40b33c0f0f449d93363075cb4eeb032880581fb26e1c05dfd4526ecf57",
            "bytes": 255836,
            "datei": "fraktionsspitze-bt-spd.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    },
}


class FraktionsvorsitzFehler(Exception):
    """Fail-closed-Abbruch der Fraktionsvorsitz-Pruefung."""


# ── Amtliches Personenmarkup der Bundestags-Detailseite ──────────────────────

class _Personenmarkup(HTMLParser):
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
                raise FraktionsvorsitzFehler("Fraktionsvorsitz: verschachtelte H1.")
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
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: Personenmarkup unvollstaendig.")
        return parser


def _jsonld_profilepages(dokument: str) -> list:
    """Alle ``ProfilePage``-Eintraege der amtlichen JSON-LD-Bloecke."""
    seiten = []
    for block in _Personenmarkup.lese(dokument).bloecke:
        try:
            daten = json.loads(block)
        except json.JSONDecodeError:
            continue
        for eintrag in (daten if isinstance(daten, list) else [daten]):
            if isinstance(eintrag, dict) and eintrag.get("@type") == "ProfilePage":
                seiten.append(eintrag)
    return seiten


# ── Geschlossener sichtbarer Fraktionsabschnitt ──────────────────────────────

_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}


class _Fraktionsmarkup(HTMLParser):
    """Genau der sichtbare Personenlink im geschlossenen ``.bt-standard-content``.

    Verborgene oder inerte Inhalte (``hidden``, ``aria-hidden``, ``display:none``,
    ``visibility:hidden``, ``--hidden``, ``template``, ``noscript``, ``nav``) sind
    kein Beleg. Nur Links in einem ``p`` unter der jeweils aktuellen h2 zaehlen;
    damit ist ein Abschnittsausbruch ausgeschlossen.
    """

    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.stack = []
        self.skip = 0
        self.standard = 0
        self.standard_gesehen = 0
        self.artikel = 0
        self.artikel_gesehen = 0
        self.h2 = None
        self.aktueller_h2 = None
        self.h2_liste = []
        self.p = 0
        self.link = None
        self.links = []

    def _verborgen(self, attrs) -> bool:
        daten = dict(attrs)
        if "hidden" in daten:
            return True
        if str(daten.get("aria-hidden", "")).lower() == "true":
            return True
        stil = str(daten.get("style", "")).lower().replace(" ", "")
        if "display:none" in stil or "visibility:hidden" in stil:
            return True
        return any(token == "--hidden" or token.endswith("--hidden")
                   for token in str(daten.get("class", "")).split())

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen or tag in _VOID:
            return
        daten = dict(attrs)
        eintrag = {"tag": tag}
        self.stack.append(eintrag)
        if self.skip:
            eintrag["skip"] = True
            return
        if self._verborgen(attrs):
            eintrag["verborgen"] = True
            self.skip += 1
            return
        if tag == "article":
            if "bt-artikel" in str(daten.get("class", "")).split():
                self.artikel_gesehen += 1
                self.artikel = 1
                eintrag["article"] = True
            elif self.artikel:
                self.artikel += 1
                eintrag["article"] = True
        elif tag == "div":
            klassen = str(daten.get("class", "")).split()
            if "bt-standard-content" in klassen:
                if not self.artikel:
                    raise FraktionsvorsitzFehler(
                        "Fraktionsvorsitz: .bt-standard-content steht ausserhalb article.bt-artikel."
                    )
                if self.standard:
                    self.standard += 1
                else:
                    self.standard = 1
                    self.standard_gesehen += 1
                eintrag["div"] = True
            elif self.standard:
                self.standard += 1
                eintrag["div"] = True
        elif self.standard and tag == "h2":
            if self.h2 is not None:
                raise FraktionsvorsitzFehler("Fraktionsvorsitz: verschachtelte h2.")
            self.h2 = []
            eintrag["h2"] = True
        elif self.standard and tag == "p":
            self.p += 1
            eintrag["p"] = True
        elif self.standard and self.p and tag == "a" and daten.get("href"):
            if self.link is not None:
                raise FraktionsvorsitzFehler("Fraktionsvorsitz: verschachtelter Personenlink.")
            self.link = {"href": daten["href"], "label": [], "h2": self.aktueller_h2}
            eintrag["a"] = True

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in _VOID:
            return
        eintrag = None
        if self.stack and self.stack[-1]["tag"] == tag:
            eintrag = self.stack.pop()
        else:
            for index in range(len(self.stack) - 1, -1, -1):
                if self.stack[index]["tag"] == tag:
                    eintrag = self.stack.pop(index)
                    break
        if eintrag is None:
            return
        if eintrag.get("skip"):
            return
        if eintrag.get("verborgen"):
            self.skip -= 1
            return
        if eintrag.get("a") and self.link is not None:
            self.links.append({
                "href": self.link["href"],
                "label": ZU._norm(" ".join(self.link["label"])),
                "h2": self.link["h2"],
            })
            self.link = None
        elif eintrag.get("h2") and self.h2 is not None:
            self.aktueller_h2 = ZU._norm(" ".join(self.h2))
            self.h2_liste.append(self.aktueller_h2)
            self.h2 = None
        elif eintrag.get("p") and self.p:
            self.p -= 1
        elif eintrag.get("article") and self.artikel:
            self.artikel -= 1
        elif eintrag.get("div") and self.standard:
            self.standard -= 1

    def handle_data(self, data):
        if self.ausgelassen or self.skip:
            return
        if self.link is not None:
            self.link["label"].append(_html.escape(data))
        elif self.h2 is not None:
            self.h2.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if (parser.ausgelassen or parser.skip or parser.standard or parser.artikel
                or parser.h2 is not None or parser.p or parser.link is not None
                or parser.stack):
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: HTML-Abschnitt unvollstaendig.")
        if parser.standard_gesehen != 1:
            raise FraktionsvorsitzFehler(
                "Fraktionsvorsitz: .bt-standard-content fehlt oder ist mehrdeutig."
            )
        if parser.artikel_gesehen != 1:
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: article.bt-artikel fehlt oder ist nicht eindeutig.")
        return parser


# ── Quellenbindung ───────────────────────────────────────────────────────────

def _pruefe_fraktionsquelle(ergebnis: dict, zusatz: Path, kennung: str, erwartet: dict) -> tuple:
    """Bindet die amtliche Fraktionsseite an Metadatum und echtes Original."""
    quelle = ergebnis.get("quelle") or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http", "abrufStatus"):
        if str(quelle.get(name) or "") == "":
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Quellenfeld {name} fehlt ({kennung}).")
    if dict(quelle) != dict(erwartet["quelle"]):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Quelle weicht vom fixierten Urteil ab ({kennung}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: ungueltiger Dateiname ({kennung}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Originaldatei fehlt: {datei_name!r} ({kennung}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, kennung)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise FraktionsvorsitzFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Metadatum {name} weicht ab ({kennung}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: finalUrl weicht von der kanonischen URL ab ({kennung}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Abruf nicht erfolgreich ({kennung}).")
    if ZU._quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Original-Hash/Bytezahl weicht ab ({kennung}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


def _pruefe_personenseite(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                          detailseiten: Path, kennung: str, erwartet: dict) -> dict:
    """Bindet die kanonische Personenseite separat neu (54er Eintrag bleibt offen)."""
    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
    if str(rollen_eintrag.get("status")) != "offen":
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz: der alte 54er-Rollenvalidator darf nicht uebernommen werden, "
            f"Eintrag muss offen bleiben ({kennung})."
        )
    rollen_ref = rollen_eintrag.get("quelle") or {}
    rollen_quelle = ergebnis.get("rollenquelle") or {}
    if dict(rollen_quelle) != dict(erwartet["rollenquelle"]):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Rollenquelle weicht vom fixierten Urteil ab ({kennung}).")
    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != PARLAMENT:
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Kennung {kennung} ist kein Bundestagsprofil.")
    for feld in ("url", "sha256", "abgerufenAm"):
        if rollen_ref.get(feld) != abruf.get(feld):
            raise FraktionsvorsitzFehler(
                f"Fraktionsvorsitz: 54er Rollenquelle weicht vom Abruf ab ({kennung}/{feld})."
            )
        if rollen_quelle.get(feld) != rollen_ref.get(feld):
            raise FraktionsvorsitzFehler(
                f"Fraktionsvorsitz: Rollenquelle weicht von der 54er Quittung ab ({kennung}/{feld})."
            )
    for feld in ("url", "finalUrl", "sha256", "abgerufenAm", "bytes", "datei", "http", "abrufStatus"):
        if str(rollen_quelle.get(feld)) != str(abruf.get(feld)):
            raise FraktionsvorsitzFehler(
                f"Fraktionsvorsitz: Rollenquelle weicht vom lokalen Abruf ab ({kennung}/{feld})."
            )
    detail = Path(detailseiten) / str(abruf.get("datei") or "")
    if (not detail.is_file() or ZU._sha256(detail) != abruf.get("sha256")
            or detail.stat().st_size != abruf.get("bytes")):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
    text = detail.read_text(encoding="utf-8", errors="replace")
    namen = _Personenmarkup.lese(text).namen
    if len(namen) != 1 or namen[0] != ZU._norm(erwartet["person"]):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Person passt nicht zur kanonischen Kennung ({kennung}).")
    seiten = _jsonld_profilepages(text)
    if len(seiten) != 1:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz: erwartet genau EIN ProfilePage.mainEntity, gefunden {len(seiten)} ({kennung})."
        )
    haupt = seiten[0].get("mainEntity")
    if not isinstance(haupt, dict) or haupt.get("@type") != "Person":
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: ProfilePage.mainEntity ist keine Person ({kennung}).")
    if str(haupt.get("@id") or "").strip() != "#mdb":
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: ProfilePage.mainEntity traegt nicht #mdb ({kennung}).")
    if ZU._norm(haupt.get("name")) != ZU._norm(erwartet["person"]):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: mainEntity.name passt nicht ({kennung}).")
    if "url" in haupt and str(haupt.get("url")).strip() != str(rollen_quelle.get("url")):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: mainEntity.url weicht von der Quell-URL ab ({kennung}).")
    if ZU._norm(haupt.get("description")) != ZU._norm(BESCHREIBUNG):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: mainEntity.description ist nicht '{BESCHREIBUNG}' ({kennung}).")
    return rollen_quelle


def _pruefe_fraktionsabschnitt(text: str, erwartet: dict, kennung: str) -> None:
    """Genau der sichtbare Personenlink unter der erwarteten h2 im .bt-standard-content."""
    markup = _Fraktionsmarkup.lese(text)
    if markup.h2_liste.count(erwartet["rolleAbschnitt"]) != 1:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz: erwartete h2 {erwartet['rolleAbschnitt']!r} fehlt oder ist mehrdeutig ({kennung})."
        )
    kandidaten = [link for link in markup.links if link["h2"] == erwartet["rolleAbschnitt"]]
    passende = [
        link for link in kandidaten
        if urljoin(erwartet["quelle"]["url"], link["href"]) == erwartet["rollenquelle"]["url"]
    ]
    if len(passende) != 1:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz: erwartet genau EINEN kanonischen #mdb-Biografielink im Abschnitt, "
            f"gefunden {len(passende)} ({kennung})."
        )
    if passende[0]["label"] != ZU._norm(erwartet["person"]):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: sichtbarer Linktext ist nicht die Person ({kennung}).")
    sichtbar = erwartet["rolleAbschnitt"] + " " + " ".join(link["label"] for link in kandidaten)
    quote = erwartet["rolleZitat"].replace(LINKHINWEIS, "")
    if not ZU._enthaelt_in_reihenfolge(quote, sichtbar):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Rollenzitat ist nicht im Abschnitt gedeckt ({kennung}).")


def pruefe_fraktionsvorsitz(eingang, *, quittung=None, kennung_zu_abruf=None,
                            detailseiten=None, profilrollen=None, zusatz=None,
                            erwartung=None) -> dict:
    """Prueft die versionierte Zweier-Fraktionsvorsitzquittung (fail closed).

    Erzwungen wird: genau ZWEI kanonische Kennungen, jede eine (weiterhin offene)
    Achse der unveraenderten 54er Rollenquittung und ein Bundestagszielprofil; die
    kanonische Personenseite separat am lokalen Abrufmetadatensatz und am echten
    Original (H1 + ProfilePage.mainEntity #mdb); die aktuelle Rolle ausschliesslich
    im geschlossenen sichtbaren .bt-standard-content einer echten article.bt-artikel;
    genau EIN sichtbarer kanonischer Biografielink; beide Quellen an Metadatum und
    Original gebunden; KEINE Themen, keine Parteiableitung, keine Zusatzfelder.
    """
    fixiert = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "fraktionsvorsitz", None)
    if quittung is None:
        if not FRAKTIONSVORSITZ.is_file():
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz-Quittung fehlt: {FRAKTIONSVORSITZ_RESSOURCE}.")
        quittung = ZU._lies_json(FRAKTIONSVORSITZ)
    if not isinstance(quittung, dict):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz-Quittung fehlt: {FRAKTIONSVORSITZ_RESSOURCE}.")
    unbekannte = set(quittung) - ERLAUBTE_QUITTUNGSFELDER
    if unbekannte:
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz-Quittung: unerlaubte Felder {sorted(unbekannte)}.")
    if "themen" in quittung:
        raise FraktionsvorsitzFehler("Fraktionsvorsitz-Quittung: es duerfen keine Themen gesetzt werden.")
    if quittung.get("version") != 1:
        raise FraktionsvorsitzFehler("Fraktionsvorsitz-Quittung: unerwartete Version.")
    if quittung.get("umfang") != GESAMT:
        raise FraktionsvorsitzFehler("Fraktionsvorsitz-Quittung: unerwarteter Umfang.")
    if quittung.get("importfreigegeben") is not False:
        raise FraktionsvorsitzFehler("Fraktionsvorsitz-Quittung: importfreigegeben muss false sein.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise FraktionsvorsitzFehler(f"Fraktionsvorsitz-Quittung: unerwartete Bilanz {bilanz!r}.")
    if set(fixiert) != {str(e.get("kennung") or "").strip() for e in ergebnisse}:
        raise FraktionsvorsitzFehler("Fraktionsvorsitz-Quittung: Kennungsmenge weicht vom fixierten Urteil ab.")

    if profilrollen is None:
        profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    if kennung_zu_abruf is None:
        kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    if detailseiten is None:
        detailseiten = getattr(eingang, "detailseiten", None) or (Path(eingang.verzeichnis) / "detailseiten")
    if zusatz is None:
        zusatz = Path(eingang.verzeichnis) / "zusatzquellen"
    detailseiten = Path(detailseiten)
    zusatz = Path(zusatz)

    index = {}
    for ergebnis in ergebnisse:
        if not isinstance(ergebnis, dict):
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: Eintrag ist kein Objekt.")
        unbekannte_felder = set(ergebnis) - ERLAUBTE_ERGEBNISFELDER
        if unbekannte_felder:
            raise FraktionsvorsitzFehler(
                f"Fraktionsvorsitz: unerlaubte Ergebnisfelder {sorted(unbekannte_felder)}."
            )
        if "themen" in ergebnis or "partei" in ergebnis or "fraktion" in ergebnis:
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: keine Themen/Partei-/Fraktionsableitung erlaubt.")
        kennung = str(ergebnis.get("kennung") or "").strip()
        if not kennung:
            raise FraktionsvorsitzFehler("Fraktionsvorsitz: Eintrag ohne Kennung.")
        if kennung in index:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: doppelte Kennung {kennung}.")
        if kennung not in fixiert:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: unbekannte Kennung {kennung}.")
        erwartet = fixiert[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != PARLAMENT:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: unerwarteter Status ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("person") or "").strip() != erwartet["person"]:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: falsche Person ({kennung}).")
        if str(ergebnis.get("funktion") or "").strip() != erwartet["funktion"]:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: andere/unerwartete Rolle ({kennung}).")
        if str(ergebnis.get("rolleAbschnitt") or "").strip() != erwartet["rolleAbschnitt"]:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: falscher Rollenabschnitt ({kennung}).")
        if str(ergebnis.get("rolleZitat") or "").strip() != erwartet["rolleZitat"]:
            raise FraktionsvorsitzFehler(f"Fraktionsvorsitz: Rollenzitat weicht vom fixierten Urteil ab ({kennung}).")

        rollen_quelle = _pruefe_personenseite(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet
        )
        quelle, text = _pruefe_fraktionsquelle(ergebnis, zusatz, kennung, erwartet)
        _pruefe_fraktionsabschnitt(text, erwartet, kennung)
        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": PARLAMENT,
            "status": "belegt",
            "person": erwartet["person"],
            "funktion": erwartet["funktion"],
            "rolleAbschnitt": erwartet["rolleAbschnitt"],
            "rolleZitat": erwartet["rolleZitat"],
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise FraktionsvorsitzFehler(
            f"Fraktionsvorsitz-Quittung: erwartet {GESAMT} eindeutige Kennungen, gefunden {len(index)}."
        )
    return index
