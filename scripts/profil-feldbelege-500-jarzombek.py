#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer den einzelnen offenen Profilfall Thomas Jarzombek.

Roadmap §3: Der bislang einzeln offene Fachachsenfall
``bundestag-jarzombek-thomas-1045202`` wird ueber seine amtlich belegten BMDS-Abteilungen
geschlossen. Dieses Modul haelt den grossen Assembler ``profil-feldbelege-500.py`` schlank
und verwendet die bestehenden sicheren Quellen-/Personen-/HTML-Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein duplizierter 600-Zeilen-Block, kein
exterer Parser, kein zweiter Netz-/DB-Weg). Es prueft ausschliesslich die versionierte, vom
Orchestrator eng vorbereitete Einzelfallquittung
``docs/betrieb/jarzombek-bmds-abteilungen-1-20260927.json`` gegen die amtlichen
Originaldateien, deren Metadaten/Quittungen und die kanonische 54er Rollenquittung und liefert
einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer Parser, keine hartcodierte Laufzeit. Das eng fixierte
    Fachurteil ist injizierbar (``erwartung``),
  * nur die eine kanonische Kennung (disjunkt zu den 19 Ressort-, 6 Aufgaben-, 2 beratenden,
    3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor- und 3 Wahlausschuss-Achsen),
  * kanonische 500er-Person ausschliesslich ueber Name + H1 + URL + Hash + Abrufzeit + Bytezahl
    + HTTP der unveraenderten amtlichen Bundestags-Detailseite; die bestehende aktuelle
    PSts-Rolle stammt aus der bereits belegten 54er Rollenquittung (NICHT offen) und wird
    ausdruecklich erneut an ihre kanonische Quelle gebunden,
  * Abteilungen AUSSCHLIESSLICH ueber genau EINE geschlossene echte HTML-Karte ``article#c5755``
    des amtlichen BMDS-Organisationsauftritts: genau ein H2 mit genau einem Personenlink auf
    exakt die kanonische Personen-URL; die Karte darf ihren Abschnitt nicht verlassen, und
    Kommentare/Skript-/Template-/Navigationsbelege zaehlen nicht. Die Karte belegt NUR
    Jarzombek -> DS/DI/DW, NIE die Person aus dem Organigramm-JSON,
  * die Abteilungskennungen/-titel ausschliesslich aus dem amtlichen Organigramm-JSON
    (``excludePersonalData=true``): genau die drei echten, eindeutigen ``Abteilung``-Knoten
    DS/DI/DW mit exaktem ``altName``/Namen, Stand/Wahlversion ``2026-08-15``; fremde
    S/SB/L-Knoten sind gesperrt. Der echte aktuelle HTML-Link wird auf genau dieses
    JSON-Original gebunden,
  * beide amtlichen Quellen an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei jeweils
    Original UND ``*.meta.json`` gebunden. Nur ein neuer Host (``bmds.bund.de``) wird eng im
    eigenen Modul fuer genau diese zwei kanonischen Quellen freigegeben,
  * nur die vier freigegebenen Themen und der getrennte Herkunftshinweis; keine persoenliche
    politische Position, keine Scheinausschuesse, keine Partei-/Mandatsartaenderung.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import json as _json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[1]

JARZOMBEK = REPO_ROOT / "docs" / "betrieb" / "jarzombek-bmds-abteilungen-1-20260927.json"
JARZOMBEK_RESSOURCE = "docs/betrieb/jarzombek-bmds-abteilungen-1-20260927.json"

GESAMT = 1
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "abteilungszustaendigkeit"
QUELLHOST = "bmds.bund.de"
QUELLHOSTS = {"bundestag.de", QUELLHOST}

GENEHMIGTE_ABTEILUNGEN = ("DS", "DI", "DW")
VERBOTENE_ABTEILUNGEN = ("S", "SB", "L")


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_jarzombek", pfad)
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
    "bundestag-jarzombek-thomas-1045202": {
        "region": REGION,
        "bindungsart": BINDUNGSART,
        "person": "Thomas Jarzombek",
        "funktion": "Parlamentarischer Staatssekretär für Digitales und Staatmodernisierung",
        "amt": "Parlamentarischer Staatssekretär",
        "stand": "2026-08-15",
        "aufgabenbindung": (
            "Parlamentarischer Staatssekretär im BMDS; Abteilungen DS (Deutschland-Stack), "
            "DI (Digitale Infrastrukturen), DW (Digitalpolitik und Wirtschaft)"
        ),
        "themen": ["Deutschland-Stack", "Digitale Infrastrukturen", "Digitalpolitik", "Wirtschaft"],
        "abteilungen": [
            {
                "pfad": "/organisations/0/organisations/1/organisations/2",
                "id": "org-1-7",
                "typ": "Abteilung",
                "kennung": "DS",
                "name": "Abteilung DS Deutschland-Stack",
            },
            {
                "pfad": "/organisations/0/organisations/1/organisations/3",
                "id": "org-1-8",
                "typ": "Abteilung",
                "kennung": "DI",
                "name": "Abteilung DI Digitale Infrastrukturen",
            },
            {
                "pfad": "/organisations/0/organisations/1/organisations/4",
                "id": "org-1-9",
                "typ": "Abteilung",
                "kennung": "DW",
                "name": "Abteilung DW Digitalpolitik und Wirtschaft",
            },
        ],
        "karte": {
            "id": "c5755",
            "text": "Parlamentarischer Staatssekretär Thomas Jarzombek Abteilungen DS, DI, DW",
            "ueberschrift": "Parlamentarischer Staatssekretär",
            "personenlink": (
                "https://bmds.bund.de/ministerium/leitung/parlamentarische-staatssekretaere/"
                "thomas-jarzombek"
            ),
        },
        "quelle": {
            "url": "https://bmds.bund.de/ministerium/organisation",
            "finalUrl": "https://bmds.bund.de/ministerium/organisation",
            "abgerufenAm": "2026-09-27T20:13:14.558043+00:00",
            "sha256": "8bd91026c73018b4b6a9af1f471d8d50f6b4a7cf34dbeb631c6617a23d71a61f",
            "bytes": 262071,
            "datei": "bmds-organisation-20260927.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "organigramm": {
            "url": "https://bmds.bund.de/fileadmin/BMDS/Dokumente/Organigramm_15.08.2026.json",
            "finalUrl": "https://bmds.bund.de/fileadmin/BMDS/Dokumente/Organigramm_15.08.2026.json",
            "abgerufenAm": "2026-09-27T20:13:16.079278+00:00",
            "sha256": "97a2b55f84e14b2fd2bad53749992dad07efbda393badbc1139c627bd1b6ed13",
            "bytes": 70916,
            "datei": "bmds-organigramm-20260927.json",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    }
}


class JarzombekFehler(Exception):
    """Fail-closed-Abbruch der Jarzombek-Einzelfallpruefung."""


# ── Sichere Helfer (wiederverwendet; nur der neue Host wird eng erweitert) ────────────────

def _pruefe_bmds_quelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str) -> tuple:
    """Bindet eine amtliche BMDS-Quelle an Metadatum und echtes Original.

    Wie der Amthor-/Zusatzaufgaben-Quellenleser, aber fuer den BMDS-Host. Die strengen
    Bindungen (URL/finalUrl/Abrufzeit/Hash/Bytezahl/Datei/HTTP/Original) bleiben unveraendert;
    die Metadatendatei muss auch den beobachteten HTTP-Status tragen.
    """
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise JarzombekFehler(f"Jarzombek: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise JarzombekFehler(f"Jarzombek: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise JarzombekFehler(f"Jarzombek: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, kennung)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise JarzombekFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise JarzombekFehler(f"Jarzombek: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if str(meta.get("http")) != str(quelle.get("http")):
        raise JarzombekFehler(f"Jarzombek: Metadatum http weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise JarzombekFehler(f"Jarzombek: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise JarzombekFehler(f"Jarzombek: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if ZU._quellenhost(quelle.get("url")) != QUELLHOST:
        raise JarzombekFehler(
            f"Jarzombek: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise JarzombekFehler(f"Jarzombek: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


def _pruefe_rollenquelle(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                         detailseiten: Path, kennung: str, person_erwartet: str) -> dict:
    """Bindet die bereits belegte kanonische 54er-Rolle + den kanonischen Bundestags-Namen.

    Anders als Amthor (historisch offen) ist der Jarzombek-Eintrag der 54er Quittung
    ausdruecklich ``belegt`` und traegt den freigegebenen PSts-Wortlaut. Die kanonische
    500er-Person wird trotzdem eigenstaendig ueber H1 + URL + Hash + Bytezahl + HTTP neu
    gebunden; keine fachliche Achse entsteht daraus.
    """
    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise JarzombekFehler(f"Jarzombek: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
    if str(rollen_eintrag.get("status")) != "belegt":
        raise JarzombekFehler(f"Jarzombek: die 54er Rolle zu {kennung} muss belegt sein.")
    if ergebnis.get("funktion") not in [f.get("wortlaut") for f in rollen_eintrag.get("funktionen") or []]:
        raise JarzombekFehler(f"Jarzombek: der belegte 54er-Eintrag {kennung} braucht eine Rolle.")
    rollen_ref = rollen_eintrag.get("quelle") or {}
    rollen_quelle = ergebnis.get("rollenquelle") or {}
    if (
        rollen_quelle.get("url") != rollen_ref.get("url")
        or rollen_quelle.get("sha256") != rollen_ref.get("sha256")
        or rollen_quelle.get("abgerufenAm") != rollen_ref.get("abgerufenAm")
    ):
        raise JarzombekFehler(f"Jarzombek: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")
    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise JarzombekFehler(f"Jarzombek: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != "bundestag":
        raise JarzombekFehler(f"Jarzombek: Kennung {kennung} ist kein Bundestagsprofil.")
    if rollen_ref.get("url") != abruf.get("url") or rollen_ref.get("sha256") != abruf.get("sha256"):
        raise JarzombekFehler(f"Jarzombek: 54er Rollenquelle weicht vom Abruf ab ({kennung}).")
    if ZU._quellenhost(rollen_ref.get("url")) != "bundestag.de":
        raise JarzombekFehler(f"Jarzombek: unerwarteter Rollenquellen-Host ({kennung}).")
    if abruf.get("abrufStatus") != "abgerufen" or abruf.get("http") != 200:
        raise JarzombekFehler(f"Jarzombek: kanonischer Personenabruf nicht erfolgreich ({kennung}).")
    detail = Path(detailseiten) / str(abruf.get("datei") or "")
    if not detail.is_file() or ZU._sha256(detail) != rollen_ref.get("sha256"):
        raise JarzombekFehler(f"Jarzombek: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
    if detail.stat().st_size != abruf.get("bytes"):
        raise JarzombekFehler(f"Jarzombek: kanonische Personenzeilen-Bytezahl weicht ab ({kennung}).")
    if rollen_ref.get("abgerufenAm") != abruf.get("abgerufenAm"):
        raise JarzombekFehler(f"Jarzombek: Personenabrufzeit weicht ab ({kennung}).")
    namen = _Personenname.lese(detail.read_text(encoding="utf-8"))
    if len(namen) != 1 or namen[0] != ZU._norm(person_erwartet):
        raise JarzombekFehler(f"Jarzombek: Person passt nicht zur kanonischen Kennung ({kennung}).")
    return rollen_quelle


class _Personenname(HTMLParser):
    """Nur echte sichtbare H1, keine Namen in Kommentaren oder Vorlagen."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blockiert = []
        self.kopf = None
        self.namen = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "template", "noscript", "nav"}:
            self.blockiert.append(tag)
        if not self.blockiert and tag == "h1":
            if self.kopf is not None:
                raise JarzombekFehler("Jarzombek: verschachtelte H1.")
            self.kopf = []

    def handle_endtag(self, tag):
        if self.blockiert:
            if tag == self.blockiert[-1]:
                self.blockiert.pop()
            return
        if tag == "h1" and self.kopf is not None:
            self.namen.append(ZU._norm(" ".join(self.kopf)))
            self.kopf = None

    def handle_data(self, data):
        if not self.blockiert and self.kopf is not None:
            self.kopf.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(dokument)
        parser.close()
        if parser.blockiert or parser.kopf is not None:
            raise JarzombekFehler("Jarzombek: Personenmarkup unvollstaendig.")
        return parser.namen


class _Kartenleser(HTMLParser):
    """Genau EIN geschlossener ``article``-Block mit der gesuchten id.

    Skripte, Vorlagen, Navigation und Kommentare sind kein Beleg. Verschachtelte
    ``article``-Bloecke werden verworfen (fail closed); die Karte darf ihren Abschnitt
    nicht verlassen. Erfasst werden der sichtbare Kartentext, alle echten ``a``-Links der
    Karte und die H2-Personenlinks (href + Wortlaut).
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self, ziel_id: str):
        super().__init__(convert_charrefs=True)
        self.ziel_id = ziel_id
        self.ausgelassen = []
        self.rahmen = []
        self.elemente = []
        self.karten = []
        self.h2_tiefe = 0
        self.a_tiefe = 0
        self.h2_teile = []
        self.a_teile = []
        self.a_href = None
        self.h2_links = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        attrs = dict(attrs)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.elemente.append(tag)
        if tag == "article":
            if self.rahmen:
                raise JarzombekFehler("Jarzombek: verschachtelte HTML-Karte.")
            self.rahmen.append({"id": attrs.get("id"), "text": [], "links": [], "h2s": []})
            return
        if not self.rahmen:
            return
        if tag == "h2":
            self.h2_tiefe += 1
            if self.h2_tiefe == 1:
                self.h2_teile = []
                self.h2_links = []
        elif tag == "a":
            self.rahmen[-1]["links"].append(attrs.get("href"))
            if self.h2_tiefe:
                self.a_tiefe += 1
                if self.a_tiefe == 1:
                    self.a_teile = []
                    self.a_href = attrs.get("href")

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.elemente:
            position = len(self.elemente) - 1 - self.elemente[::-1].index(tag)
            if self.rahmen and tag != "article" and position < self.elemente.index("article"):
                raise JarzombekFehler("Jarzombek: HTML-Karte verlaesst ihren Abschnitt.")
            del self.elemente[position:]
        if tag == "article" and (self.h2_tiefe or self.a_tiefe):
            raise JarzombekFehler("Jarzombek: ungeschlossener H2-Personenlink.")
        if tag == "a" and self.a_tiefe:
            self.a_tiefe -= 1
            if self.a_tiefe == 0:
                self.h2_links.append((self.a_href, ZU._norm(" ".join(self.a_teile))))
                self.a_teile = []
                self.a_href = None
        elif tag == "h2" and self.h2_tiefe:
            self.h2_tiefe -= 1
            if self.h2_tiefe == 0:
                self.rahmen[-1]["h2s"].append({"links": list(self.h2_links),
                                               "text": ZU._norm(" ".join(self.h2_teile))})
        elif tag == "article" and self.rahmen:
            rahmen = self.rahmen.pop()
            if rahmen["id"] == self.ziel_id:
                self.karten.append(rahmen)

    def handle_data(self, data):
        if self.ausgelassen or not self.rahmen:
            return
        wert = _html.escape(data)
        self.rahmen[-1]["text"].append(wert)
        if self.h2_tiefe:
            self.h2_teile.append(wert)
        if self.a_tiefe:
            self.a_teile.append(wert)

    @classmethod
    def lese(cls, dokument, ziel_id: str) -> dict:
        parser = cls(ziel_id)
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.h2_tiefe or parser.a_tiefe:
            raise JarzombekFehler("Jarzombek: HTML-Karte unvollstaendig.")
        if len(parser.karten) != 1:
            raise JarzombekFehler(
                f"Jarzombek: erwartet genau eine HTML-Karte article#{ziel_id}, "
                f"gefunden {len(parser.karten)}."
            )
        return parser.karten[0]


def _pruefe_karte(quelle_text: str, quelle: dict, erwartet: dict, kennung: str) -> dict:
    """Die echte HTML-Karte article#c5755 belegt NUR Jarzombek -> DS/DI/DW."""
    karte_erwartet = erwartet["karte"]
    karte = _Kartenleser.lese(quelle_text, karte_erwartet["id"])
    text = ZU._norm(" ".join(karte["text"]))
    if text != ZU._norm(karte_erwartet["text"]):
        raise JarzombekFehler(f"Jarzombek: Kartentext weicht vom fixierten Urteil ab ({kennung}).")
    if ZU._norm(erwartet["person"]) not in text:
        raise JarzombekFehler(f"Jarzombek: die HTML-Karte traegt nicht die erwartete Person ({kennung}).")
    if len(karte["links"]) != 1:
        raise JarzombekFehler(f"Jarzombek: die HTML-Karte muss genau einen echten Link tragen ({kennung}).")
    if len(karte["h2s"]) != 1 or len(karte["h2s"][0]["links"]) != 1:
        raise JarzombekFehler(f"Jarzombek: die HTML-Karte braucht genau einen H2-Personenlink ({kennung}).")
    href, ueberschrift = karte["h2s"][0]["links"][0]
    basis = str(quelle.get("finalUrl") or quelle.get("url"))
    if urljoin(basis, _html.unescape(str(href or ""))) != karte_erwartet["personenlink"]:
        raise JarzombekFehler(f"Jarzombek: H2-Personenlink weicht von der kanonischen URL ab ({kennung}).")
    if ueberschrift != ZU._norm(karte_erwartet["ueberschrift"]):
        raise JarzombekFehler(f"Jarzombek: H2-Ueberschrift weicht vom fixierten Urteil ab ({kennung}).")
    return {"id": karte_erwartet["id"], "text": text, "ueberschrift": ueberschrift,
            "personenlink": karte_erwartet["personenlink"]}


def _abteilungen_aus_json(organigramm_text: str, erwartet: dict, kennung: str) -> list:
    """Eindeutige echte ``Abteilung``-Knoten DS/DI/DW aus dem amtlichen Organigramm-JSON."""
    try:
        daten = _json.loads(organigramm_text)
    except ValueError as fehler:
        raise JarzombekFehler(f"Jarzombek: Organigramm-JSON unlesbar ({kennung}).") from fehler
    if not isinstance(daten, dict):
        raise JarzombekFehler(f"Jarzombek: Organigramm-JSON ohne Objektwurzel ({kennung}).")
    export = daten.get("export") or {}
    if export.get("excludePersonalData") is not True:
        raise JarzombekFehler(
            f"Jarzombek: Organigramm-JSON muss mit excludePersonalData=true exportiert sein ({kennung})."
        )
    dokument = daten.get("document") or {}
    if str(dokument.get("version") or "") != str(erwartet["stand"]):
        raise JarzombekFehler(f"Jarzombek: Organigramm-Stand/Version weicht ab ({kennung}).")
    if document_personen(daten):
        raise JarzombekFehler(
            f"Jarzombek: das Organigramm-JSON darf keine Personenzuordnung tragen ({kennung})."
        )
    knoten = []

    def _gehe_liste(liste, pfad):
        for index, kind in enumerate(liste or []):
            _gehe(kind, f"{pfad}/{index}")

    def _gehe(element, pfad):
        if not isinstance(element, dict):
            return
        if element.get("type") == "Abteilung" and str(element.get("altName") or "") in GENEHMIGTE_ABTEILUNGEN:
            knoten.append({
                "pfad": pfad,
                "id": element.get("id"),
                "typ": "Abteilung",
                "kennung": str(element.get("altName")),
                "name": str(element.get("name") or ""),
            })
        _gehe_liste(element.get("organisations"), f"{pfad}/organisations")

    _gehe_liste(daten.get("organisations"), "/organisations")
    if len(knoten) != len(GENEHMIGTE_ABTEILUNGEN):
        raise JarzombekFehler(
            f"Jarzombek: erwartet genau {len(GENEHMIGTE_ABTEILUNGEN)} Abteilungsknoten DS/DI/DW, "
            f"gefunden {len(knoten)} ({kennung})."
        )
    if sorted(k["kennung"] for k in knoten) != sorted(GENEHMIGTE_ABTEILUNGEN):
        raise JarzombekFehler(f"Jarzombek: unerwartete Abteilungskennungen ({kennung}).")
    for feld in ("pfad", "id"):
        werte = [k[feld] for k in knoten]
        if len(set(werte)) != len(werte) or any(not str(w) for w in werte):
            raise JarzombekFehler(f"Jarzombek: doppelte/leere Abteilungen ({feld}) ({kennung}).")
    for k in knoten:
        if k["kennung"] in VERBOTENE_ABTEILUNGEN:
            raise JarzombekFehler(f"Jarzombek: fremder Abteilungsknoten {k['kennung']!r} ({kennung}).")
        if k["kennung"] not in str(k["name"]):
            raise JarzombekFehler(f"Jarzombek: falscher Abteilungsname ({kennung}).")
    sortiert = sorted(knoten, key=lambda k: GENEHMIGTE_ABTEILUNGEN.index(k["kennung"]))
    if sortiert != erwartet["abteilungen"]:
        raise JarzombekFehler(f"Jarzombek: Abteilungsknoten weichen vom fixierten Urteil ab ({kennung}).")
    return sortiert


def document_personen(daten) -> bool:
    """Wahr, sobald irgendein echtes Person-Objekt im Organigramm-JSON gebunden ist."""
    treffer = []

    def _gehe(element):
        if isinstance(element, dict):
            person = element.get("person")
            if isinstance(person, dict) and person:
                treffer.append(person)
            for wert in element.values():
                _gehe(wert)
        elif isinstance(element, list):
            for wert in element:
                _gehe(wert)

    _gehe(daten)
    return bool(treffer)


def _pruefe_organigramm_link(quelle_text: str, quelle: dict, organigramm: dict, kennung: str) -> None:
    """Der echte aktuelle HTML-Link muss auf genau dieses JSON-Original zeigen."""

    class _Linkleser(HTMLParser):
        AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.ausgelassen = []
            self.hrefs = []

        def handle_starttag(self, tag, attrs):
            if tag in self.AUSGELASSEN:
                self.ausgelassen.append(tag)
            if self.ausgelassen:
                return
            if tag == "a":
                href = dict(attrs).get("href")
                if href:
                    self.hrefs.append(href)

        def handle_endtag(self, tag):
            if self.ausgelassen and tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()

    parser = _Linkleser()
    parser.feed(str(quelle_text or ""))
    parser.close()
    basis = str(quelle.get("finalUrl") or quelle.get("url"))
    aufgeloest = {urljoin(basis, _html.unescape(href)) for href in parser.hrefs}
    ziel = str(organigramm.get("url"))
    if ziel not in aufgeloest:
        raise JarzombekFehler(
            f"Jarzombek: der aktuelle HTML-Auftritt verlinkt das amtliche Organigramm-JSON nicht ({kennung})."
        )


def _pruefe_themen(erwartet: dict, kennung: str) -> None:
    themen = erwartet["themen"]
    if len(themen) != 4 or list(dict.fromkeys(themen)) != themen:
        raise JarzombekFehler(f"Jarzombek: genau vier eindeutige Themen sind freigegeben ({kennung}).")
    namen = " ; ".join(k["name"] for k in erwartet["abteilungen"])
    for thema in themen:
        if not ZU._enthaelt_in_reihenfolge(thema, namen):
            raise JarzombekFehler(f"Jarzombek: Thema {thema!r} steht nicht in den Abteilungstiteln ({kennung}).")


def pruefe_jarzombek(eingang, *, quittung=None, ressortachsen_kennungen=None,
                     aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                     zusatzaufgaben_kennungen=None, bmwsb_kennungen=None,
                     amthor_kennungen=None, wahlausschuss_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Einzelfallquittung Jarzombek (fail closed).

    Erzwungen wird: genau EINE kanonische Kennung, disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor- und 3 Wahlausschuss-Achsen; die
    kanonische 500er-Person (Name + H1 + URL + Hash + Abrufzeit + Bytezahl + HTTP) separat
    gebunden, waehrend die bestehende aktuelle PSts-Rolle aus der belegten 54er Quittung
    stammt; die Abteilungen ausschliesslich aus genau einer echten geschlossenen HTML-Karte
    article#c5755 und dem amtlichen Organigramm-JSON mit excludePersonalData=true; beide
    amtlichen BMDS-Quellen an URL/finalUrl/sha256/Bytezahl/Abrufzeit/HTTP/Datei jeweils
    Original UND Metadatum gebunden. Jede Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "jarzombek", None)
    if quittung is None:
        if not JARZOMBEK.is_file():
            raise JarzombekFehler(f"Jarzombek-Quittung fehlt: {JARZOMBEK_RESSOURCE}.")
        quittung = ZU._lies_json(JARZOMBEK)
    if not isinstance(quittung, dict):
        raise JarzombekFehler(f"Jarzombek-Quittung fehlt: {JARZOMBEK_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise JarzombekFehler(
            f"Jarzombek-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise JarzombekFehler(f"Jarzombek-Quittung: unerwartete Bilanz {bilanz!r}.")

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
    disjunkt = (
        ("Ressortachse", set(ressortachsen_kennungen)),
        ("Aufgabenachse", set(aufgabenachsen_kennungen)),
        ("beratende Achse", set(beratendeachsen_kennungen)),
        ("Zusatzaufgabenachse", set(zusatzaufgaben_kennungen)),
        ("BMWSB-Achse", set(bmwsb_kennungen)),
        ("Amthor-Achse", set(amthor_kennungen)),
        ("Wahlausschuss-Achse", set(wahlausschuss_kennungen)),
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise JarzombekFehler("Jarzombek: Eintrag ohne Kennung.")
        if kennung in index:
            raise JarzombekFehler(f"Jarzombek: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise JarzombekFehler(f"Jarzombek: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise JarzombekFehler(f"Jarzombek: Kennung {kennung} ist bereits eine {name}.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise JarzombekFehler(f"Jarzombek: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise JarzombekFehler(f"Jarzombek: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise JarzombekFehler(f"Jarzombek: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise JarzombekFehler(f"Jarzombek: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("bindungsart") or "").strip() != erwartet["bindungsart"]:
            raise JarzombekFehler(f"Jarzombek: unerwartete Bindungsart ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise JarzombekFehler(f"Jarzombek: Person weicht vom fixierten Urteil ab ({kennung}).")

        # Kanonische 500er-Person + bereits belegte 54er-Rolle separat neu gebunden.
        rollen_quelle = _pruefe_rollenquelle(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet["person"]
        )

        # Beide amtlichen BMDS-Quellen strikt an das fixierte Urteil binden (Original UND Meta).
        quelle, quelle_text = _pruefe_bmds_quelle(ergebnis, zusatz, kennung, "quelle")
        if dict(quelle) != erwartet["quelle"]:
            raise JarzombekFehler(f"Jarzombek: Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")
        organigramm, organigramm_text = _pruefe_bmds_quelle(ergebnis, zusatz, kennung, "organigramm")
        if dict(organigramm) != erwartet["organigramm"]:
            raise JarzombekFehler(f"Jarzombek: Organigramm-Metadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Die echte HTML-Karte belegt NUR Jarzombek -> DS/DI/DW; der echte HTML-Link zeigt
        # auf genau dieses JSON-Original.
        karte = _pruefe_karte(quelle_text, quelle, erwartet, kennung)
        if dict(ergebnis.get("karte") or {}) != dict(karte):
            raise JarzombekFehler(f"Jarzombek: Karteneintrag weicht vom fixierten Urteil ab ({kennung}).")
        _pruefe_organigramm_link(quelle_text, quelle, organigramm, kennung)
        abteilungen = _abteilungen_aus_json(organigramm_text, erwartet, kennung)
        if ergebnis.get("abteilungen") != erwartet["abteilungen"]:
            raise JarzombekFehler(f"Jarzombek: Abteilungen weichen vom fixierten Urteil ab ({kennung}).")

        # Nur die freigegebenen Themen und der getrennte Herkunftshinweis.
        for name in ("funktion", "amt", "stand", "aufgabenbindung", "themen"):
            if ergebnis.get(name) != erwartet[name]:
                raise JarzombekFehler(f"Jarzombek: Feld {name} weicht vom fixierten Urteil ab ({kennung}).")
        _pruefe_themen(erwartet, kennung)
        if any(str(k["kennung"]) in VERBOTENE_ABTEILUNGEN for k in abteilungen):
            raise JarzombekFehler(f"Jarzombek: fremde Abteilung in den gebundenen Knoten ({kennung}).")
        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise JarzombekFehler(f"Jarzombek: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": erwartet["bindungsart"],
            "person": person,
            "funktion": erwartet["funktion"],
            "amt": erwartet["amt"],
            "stand": erwartet["stand"],
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "abteilungen": [dict(k) for k in abteilungen],
            "karte": dict(karte),
            "themen": list(erwartet["themen"]),
            "ableitungsHinweis": hinweis,
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
            "organigramm": organigramm,
        }

    if len(index) != GESAMT:
        raise JarzombekFehler(f"Jarzombek-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
