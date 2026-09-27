#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die 2 persoenlich belegten BMWSB-Aufgabenachsen.

Roadmap §3: zwei weitere, zuvor separat gepruefte personengebundene
Fachzustaendigkeiten des BMWSB werden integriert (Sören Bartol, Sabine Poschmann).
Dieses Modul haelt den grossen Assembler ``profil-feldbelege-500.py`` schlank und
verwendet die bestehenden sicheren Quellen-/Personen-/HTML-Helfer des getrennten
Moduls ``profil-feldbelege-500-zusatzaufgaben.py`` (kein duplizierter
600-Zeilen-Block). Es prueft ausschliesslich die versionierte, vom Orchestrator
vorbereitete Quittung ``docs/betrieb/bmwsb-aufgaben-2-20260927.json`` gegen die
amtlichen Originaldateien, deren Metadaten/Quittungen und die kanonische 54er
Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer PDF-Parser, KEINE hartcodierte Laufzeit. Das
    manuell am amtlichen Original visuell abgenommene PDF-Fachurteil (Stand, Seite,
    Personenkasten, Unterbereiche und Titel) ist bewusst eng im Validator fixiert
    und fuer synthetische Testfixtures injizierbar,
  * nur die zwei kanonischen Kennungen (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden und 3 Zusatzaufgabenachsen; deckungsgleich mit der 54er
    Rollenquittung),
  * jede Kennung an den kanonischen Bundestags-Profilnamen + URL + Hash der 54er
    Rollenquittung gebunden; die amtliche Quelle an die tatsaechlich verlinkte
    kanonische v10-Adresse des BMWSB-Organigramms und an URL/finalUrl/Hash/
    Bytezahl/Abrufzeit/HTTP/Datei; Original UND ``*.meta.json`` streng gebunden,
  * ausdruecklich KEINE Hochstufung auf ganze Abteilungen: nur die persoenlich
    zugewiesenen Unterbereiche (Bartol Z I 3/W II/S I/B I/B II, Poschmann
    Z II/W I/S II/S III), exakt fixiert; jede Aufweichung bricht ab,
  * die aktuell hashgebundene BMWSB-Landingpage muss genau dieses amtliche PDF als
    echten, aufgeloesten href tragen (kein Kommentar-/Skript-/Vorlagenanker und kein
    blosses Textvorkommen),
  * nur die freigegebenen Kurzthemen/Hinweise; keine frei erweiterbaren Themen,
    keine persoenliche politische Position, keine Partei/Fraktion/Region/Ausschuesse
    veraendern.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[1]

BMWSB = REPO_ROOT / "docs" / "betrieb" / "bmwsb-aufgaben-2-20260927.json"
BMWSB_RESSOURCE = "docs/betrieb/bmwsb-aufgaben-2-20260927.json"

GESAMT = 2
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "unterabteilungszustaendigkeit"
QUELLHOST = "bmwsb.bund.de"

# Nur die persoenlich belegten Unterbereiche sind zugelassen; eine blosse
# Abteilung ohne Unterbereich (Z/W/S/B) bleibt ausdruecklich gesperrt.
UNTERABTEILUNG_VERBOTEN = re.compile(r"^(Z|W|S|B|GI|G)$")
GESCHAEFTSBEREICH_LINIE = re.compile(r"^Geschäftsbereich(?:e)?\s+(.+)$")


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_helfer", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()

# Bewusst eng fixiertes, manuell am Original visuell abgenommenes Fachurteil.
# Die Metadaten tragen die ``*.meta.json``-Dateien; die PDF-Anker werden ueber
# aufgeloeste hrefs verglichen (die Landingpage verlinkt relativ, nicht als Volltext).
ERWARTUNG = {
    "bundestag-bartol-soeren-1043546": {
        "bindungsart": BINDUNGSART,
        "region": REGION,
        "person": "Sören Bartol",
        "aufgabenbindung": (
            "Parlamentarischer Staatssekretär im Bundesministerium für Wohnen, "
            "Stadtentwicklung und Bauwesen; Geschäftsbereiche Z I 3, W II, S I, B I, B II"
        ),
        "stand": "1. Juli 2026",
        "seite": 1,
        "personblock": [
            "Parlamentarischer Staatssekretär",
            "Geschäftsbereiche Z I 3, W II, S I, B I, B II",
            "Sören Bartol",
        ],
        "unterabteilungen": {
            "Z I 3": "Haushalt, BfdH",
            "W II": "Wohnungspolitische Dialoge, Wohneigentum, Mietrecht und Wohnungslosigkeit",
            "S I": "Stadtentwicklungspolitik, Planungsrecht",
            "B I": "Baupolitik, Klimaschutz und Nachhaltigkeit, Bundesbau",
            "B II": "Wirtschaftliches Bauen, Bauwirtschaft",
        },
        "themen": [
            "Haushalt",
            "Wohneigentum",
            "Mietrecht",
            "Wohnungslosigkeit",
            "Stadtentwicklungspolitik",
            "Planungsrecht",
            "Baupolitik",
            "Klimaschutz",
            "Nachhaltigkeit",
            "Bundesbau",
            "Wirtschaftliches Bauen",
            "Bauwirtschaft",
        ],
        "quelle": {
            "url": "https://www.bmwsb.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/service/organigramm_deutsch.pdf?__blob=publicationFile&v=10",
            "finalUrl": "https://www.bmwsb.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/service/organigramm_deutsch.pdf?__blob=publicationFile&v=10",
            "abgerufenAm": "2026-09-27T19:03:21.520864+00:00",
            "sha256": "dffcb6fbc28eb04ad64db8bfba9c3031eeccc5e2b33705c0070299f3c06205b8",
            "bytes": 669957,
            "datei": "bmwsb-organigramm-v10-aktuell.pdf",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "aktuelleVerlinkung": {
            "url": "https://www.bmwsb.bund.de/DE/ministerium/das-bmwsb/abteilungen-aufgaben/abteilungen-und-aufgaben.html?nn=42910",
            "finalUrl": "https://www.bmwsb.bund.de/DE/ministerium/das-bmwsb/abteilungen-aufgaben/abteilungen-und-aufgaben.html?nn=42910",
            "abgerufenAm": "2026-09-27T19:02:11.947527+00:00",
            "sha256": "76e4bf7bd715e4bf33d4b1877ce406d7d7f4ffcce85f84eb9212c74607f4a6d5",
            "bytes": 180198,
            "datei": "bmwsb-organigramm-landing-aktuell.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    },
    "bundestag-poschmann-sabine-1046592": {
        "bindungsart": BINDUNGSART,
        "region": REGION,
        "person": "Sabine Poschmann",
        "aufgabenbindung": (
            "Parlamentarische Staatssekretärin im Bundesministerium für Wohnen, "
            "Stadtentwicklung und Bauwesen; Geschäftsbereich Z II, W I, S II, S III"
        ),
        "stand": "1. Juli 2026",
        "seite": 1,
        "personblock": [
            "Parlamentarische Staatssekretärin",
            "Geschäftsbereich Z II, W I, S II, S III",
            "Sabine Poschmann",
        ],
        "unterabteilungen": {
            "Z II": "Grundsatzangelegenheiten",
            "W I": "Sozialer Wohnungsbau, Wohngeld und Zukunft des Wohnens",
            "S II": "Stadtentwicklungsprogramme",
            "S III": "Raumordnung, Regionalpolitik, europäische und internationale Stadt- und Raumentwicklung",
        },
        "themen": [
            "Sozialer Wohnungsbau",
            "Wohngeld",
            "Zukunft des Wohnens",
            "Stadtentwicklungsprogramme",
            "Raumordnung",
            "Regionalpolitik",
        ],
        "quelle": {
            "url": "https://www.bmwsb.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/service/organigramm_deutsch.pdf?__blob=publicationFile&v=10",
            "finalUrl": "https://www.bmwsb.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/service/organigramm_deutsch.pdf?__blob=publicationFile&v=10",
            "abgerufenAm": "2026-09-27T19:03:21.520864+00:00",
            "sha256": "dffcb6fbc28eb04ad64db8bfba9c3031eeccc5e2b33705c0070299f3c06205b8",
            "bytes": 669957,
            "datei": "bmwsb-organigramm-v10-aktuell.pdf",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "aktuelleVerlinkung": {
            "url": "https://www.bmwsb.bund.de/DE/ministerium/das-bmwsb/abteilungen-aufgaben/abteilungen-und-aufgaben.html?nn=42910",
            "finalUrl": "https://www.bmwsb.bund.de/DE/ministerium/das-bmwsb/abteilungen-aufgaben/abteilungen-und-aufgaben.html?nn=42910",
            "abgerufenAm": "2026-09-27T19:02:11.947527+00:00",
            "sha256": "76e4bf7bd715e4bf33d4b1877ce406d7d7f4ffcce85f84eb9212c74607f4a6d5",
            "bytes": 180198,
            "datei": "bmwsb-organigramm-landing-aktuell.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    },
}


class BmwsbFehler(Exception):
    """Fail-closed-Abbruch der BMWSB-Aufgabenpruefung."""


def _pruefe_quelle(ergebnis, zusatz: Path, kennung: str, feld: str = "quelle") -> tuple:
    """Wie der Zusatzaufgaben-Quellenleser, aber fuer den amtlichen BMWSB-Host.

    Es wird ausschliesslich die zulaessige Hostliste des wiederverwendeten Helfers
    um ``bmwsb.bund.de`` erweitert; die uebrigen strikten Bindungen (URL/finalUrl/
    Abrufzeit/Hash/Bytezahl/Datei/HTTP/Original) bleiben unveraendert.
    """
    vorher = ZU.QUELLHOSTS
    ZU.QUELLHOSTS = set(vorher) | {QUELLHOST}
    try:
        try:
            return ZU._pruefe_quelle(ergebnis, zusatz, kennung, feld)
        except ZU.ZusatzaufgabenFehler as fehler:
            raise BmwsbFehler(str(fehler)) from fehler
    finally:
        ZU.QUELLHOSTS = vorher


def _pruefe_unterabteilungen(erwartet: dict, kennung: str) -> None:
    """Keine Hochstufung auf ganze Abteilungen; nur die zugewiesenen Unterbereiche."""
    unter = erwartet["unterabteilungen"]
    if not unter:
        raise BmwsbFehler(f"BMWSB: Unterbereiche fehlen ({kennung}).")
    for schluessel in unter:
        if UNTERABTEILUNG_VERBOTEN.match(str(schluessel).strip()):
            raise BmwsbFehler(f"BMWSB: blosse Abteilung statt Unterbereich {schluessel!r} ({kennung}).")
    # Die Aufzaehlung im Personenkasten muss genau diese Unterbereiche nennen.
    zeile = next((z for z in erwartet["personblock"] if GESCHAEFTSBEREICH_LINIE.match(z)), None)
    if zeile is None:
        raise BmwsbFehler(f"BMWSB: Geschaeftsbereichszeile fehlt im Personenkasten ({kennung}).")
    genannt = [t.strip() for t in re.split(r",\s*", GESCHAEFTSBEREICH_LINIE.match(zeile).group(1)) if t.strip()]
    if genannt != list(unter):
        raise BmwsbFehler(f"BMWSB: Unterbereiche weichen von der fixierten Zuordnung ab ({kennung}).")
    if not all(zu in erwartet["aufgabenbindung"] for zu in genannt):
        raise BmwsbFehler(f"BMWSB: Unterbereiche stehen nicht in der Aufgabenbindung ({kennung}).")


def _pruefe_landingpage(ergebnis: dict, erwartet: dict, zusatz: Path, quelle: dict, kennung: str) -> None:
    """Die aktuelle Landingpage muss das amtliche PDF als echten href verlinken."""
    verlinkung, landing_text = _pruefe_quelle(ergebnis, zusatz, kennung, feld="aktuelleVerlinkung")
    ziel = str(quelle.get("url"))
    basis = str(verlinkung.get("finalUrl") or verlinkung.get("url"))
    aufgeloest = set()
    try:
        links = ZU._SichtbaresHTML.lese(landing_text).links
    except ZU.ZusatzaufgabenFehler as fehler:
        raise BmwsbFehler(str(fehler)) from fehler
    for href in links:
        aufgeloest.add(urljoin(basis, _html.unescape(href)))
    if ziel not in aufgeloest:
        raise BmwsbFehler(
            f"BMWSB: die aktuelle Landingpage verlinkt das kanonische v10-PDF nicht ({kennung})."
        )


def pruefe_bmwsb(eingang, *, quittung=None, ressortachsen_kennungen=None,
                 aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                 zusatzaufgaben_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Quittung der 2 BMWSB-Aufgabenachsen (fail closed).

    Erzwungen wird: exakt 2 eindeutige kanonische Kennungen, jede Kennung eine
    belegte Rolle der 54er Rollenquittung mit deckungsgleicher Rollenquelle und
    passendem kanonischen Bundestags-Profilnamen, disjunkt zu den 19 Ressort-, 6
    Aufgaben-, 2 beratenden und 3 Zusatzaufgabenachsen, amtliche Quelle an die
    kanonische v10-Adresse und URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/Datei
    gebunden (Original UND ``*.meta.json``), nur die freigegebenen Kurzthemen und
    Unterbereiche und ein echter amtlicher PDF-Link auf der Landingpage. Jede
    Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "bmwsb", None)
    if quittung is None:
        if not BMWSB.is_file():
            raise BmwsbFehler(f"BMWSB-Quittung fehlt: {BMWSB_RESSOURCE}.")
        quittung = ZU._lies_json(BMWSB)
    if not isinstance(quittung, dict):
        raise BmwsbFehler(f"BMWSB-Quittung fehlt: {BMWSB_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise BmwsbFehler(
            f"BMWSB-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise BmwsbFehler(f"BMWSB-Quittung: unerwartete Bilanz {bilanz!r}.")

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
    ressort, aufgaben_achsen = set(ressortachsen_kennungen), set(aufgabenachsen_kennungen)
    beratende, zusatzachsen = set(beratendeachsen_kennungen), set(zusatzaufgaben_kennungen)

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise BmwsbFehler("BMWSB: Eintrag ohne Kennung.")
        if kennung in index:
            raise BmwsbFehler(f"BMWSB: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise BmwsbFehler(f"BMWSB: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        if kennung in ressort:
            raise BmwsbFehler(f"BMWSB: Kennung {kennung} ist bereits eine Ressortachse.")
        if kennung in aufgaben_achsen:
            raise BmwsbFehler(f"BMWSB: Kennung {kennung} ist bereits eine Aufgabenachse.")
        if kennung in beratende:
            raise BmwsbFehler(f"BMWSB: Kennung {kennung} ist bereits eine beratende Achse.")
        if kennung in zusatzachsen:
            raise BmwsbFehler(f"BMWSB: Kennung {kennung} ist bereits eine Zusatzaufgabenachse.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise BmwsbFehler(f"BMWSB: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise BmwsbFehler(f"BMWSB: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise BmwsbFehler(f"BMWSB: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise BmwsbFehler(f"BMWSB: importfreigegeben muss false sein ({kennung}).")
        bindungsart = str(ergebnis.get("bindungsart") or "").strip()
        if bindungsart != erwartet["bindungsart"]:
            raise BmwsbFehler(f"BMWSB: unerwartete Bindungsart {bindungsart!r} ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise BmwsbFehler(f"BMWSB: Person weicht vom fixierten Urteil ab ({kennung}).")
        try:
            rollen_quelle = ZU._pruefe_rollenquelle(
                ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet["person"]
            )
        except ZU.ZusatzaufgabenFehler as fehler:
            raise BmwsbFehler(str(fehler)) from fehler

        # Amtliche Quelle und Landingpage strikt an das fixierte v10-Urteil binden.
        quelle, _pdf_text = _pruefe_quelle(ergebnis, zusatz, kennung, "quelle")
        if dict(quelle) != erwartet["quelle"]:
            raise BmwsbFehler(f"BMWSB: Quellenmetadaten weichen vom fixierten v10-Urteil ab ({kennung}).")
        verlinkung, _landing_text = _pruefe_quelle(ergebnis, zusatz, kennung, feld="aktuelleVerlinkung")
        if dict(verlinkung) != erwartet["aktuelleVerlinkung"]:
            raise BmwsbFehler(f"BMWSB: Landingpage-Metadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Fixiertes, manuell abgenommenes PDF-Fachurteil (Stand/Seite/Personenkasten/
        # Unterbereiche/Themen/Aufgabenbindung). Rohe Quittungsfelder exakt gleich.
        for name in ("stand", "seite", "personblock", "unterabteilungen", "themen", "aufgabenbindung"):
            if ergebnis.get(name) != erwartet[name]:
                raise BmwsbFehler(f"BMWSB: Feld {name} weicht vom fixierten PDF-Urteil ab ({kennung}).")
        if erwartet["person"] not in erwartet["personblock"]:
            raise BmwsbFehler(f"BMWSB: Person fehlt im fixierten Personenkasten ({kennung}).")
        _pruefe_unterabteilungen(erwartet, kennung)
        titel = " ; ".join(erwartet["unterabteilungen"][schluessel] for schluessel in erwartet["unterabteilungen"])
        for thema in erwartet["themen"]:
            if not ZU._enthaelt_in_reihenfolge(thema, titel):
                raise BmwsbFehler(
                    f"BMWSB: Thema {thema!r} steht nicht in den Unterbereichstiteln ({kennung})."
                )
        _pruefe_landingpage(ergebnis, erwartet, zusatz, quelle, kennung)

        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise BmwsbFehler(f"BMWSB: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": bindungsart,
            "person": person,
            "themen": list(erwartet["themen"]),
            "rollenquelle": rollen_quelle,
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "stand": erwartet["stand"],
            "seite": erwartet["seite"],
            "unterabteilungen": dict(erwartet["unterabteilungen"]),
            "aktuelleVerlinkung": dict(erwartet["aktuelleVerlinkung"]),
            "ableitungsHinweis": hinweis,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise BmwsbFehler(f"BMWSB-Quittung: erwartet {GESAMT} eindeutige Kennungen, gefunden {len(index)}.")
    return index
