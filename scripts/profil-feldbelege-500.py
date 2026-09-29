#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Offline-Assembler fuer docs/betrieb/500-profilfeldbelege-20260927.json.

Zweck (Roadmap §3, vorgeschalteter Schritt): aus der bereits vorab festgelegten
kanonischen 500-Namensauswahl, den oeffentlichen Abrufen der amtlichen
Detailseiten (330 Bundestag + 170 Landesparlamente Berlin/Brandenburg) und den
dazu vorhandenen ``*-extraktion.json`` einen reproduzierbaren, feldgenauen
Belegdatensatz fuer exakt 500 Zielprofile erzeugen.

Harte Grenzen dieses Werkzeugs:

  * ausschliesslich lokal/offline (keine Netzwerk-, DB- oder Modellzugriffe,
    kein Import, kein Commit). Der Python-Code nutzt nur die Standardbibliothek;
    fuer die EINE fachliche Frage "ist dieser Name ein staendiger Ausschuss?"
    wird der vorhandene Produktcode
    (``lib/helmut/profile-readiness.resolveBundestagsausschuss``) ueber den
    Node-Helfer ``scripts/profil-gremien-resolver.js`` befragt, statt die
    Sollmenge ein zweites Mal zu pflegen,
  * KEINE fachliche Freigabe: jeder Datensatz bleibt ``aktiv: false`` und
    ``importfreigegeben: false``; leere fachliche Achsen und ungeklaerte
    Parteizugehoerigkeiten bleiben sichtbar OFFEN (nichts wird "schoengerechnet"),
  * belegte sonstige Gremien (Beirat/Unterausschuss/Kommission/Kontrollgremium/
    Wahlausschuss/Rechnungspruefung) stehen nicht in den staendigen
    Ausschussfeldern: sie bleiben als ``weitereGremien`` UND rollengetreu in
    ``funktionen`` erhalten. Nur die explizite Liste mit amtlicher JSON-LD-URL
    und Original-Rolle wird herausgeloest; unbekannte echte Ausschuesse bleiben
    gesperrt (fail closed),
  * vier bislang offene Brandenburg-Mandatsarten sind ueber die versionierte
    lokale Quittung ``docs/betrieb/brandenburg-mandatsarten-20260927.json`` als
    Landesliste belegt (URL + Hash + Abrufzeit); uebernommen werden nur
    Mandatsart und Region — NICHT Listenbeschriftung oder Listenplatz,
  * fuer die 54 fachlich offenen Profile werden ueber die vom Orchestrator
    gepruefte Quittung ``docs/betrieb/profilrollen-43-20260928.json`` nur die
    freigegebenen ``wortlaut``-Strings dedupliziert an BESTEHENDE
    ``profil.funktionen`` angehaengt (48 belegt, 6 offen). Es entsteht kein
    ``regierungsrolle``-Schema und keine fachliche Achse; bestehende
    Gremienrollen bleiben erhalten,
  * fuer 19 dieser 54 Profile wird ueber die vom Orchestrator gepruefte
    Ressortquittung ``docs/betrieb/ressortachsen-19-20260927.json`` belegte
    Ressortthemen aus dem amtlich belegten aktuellen Ressort gesetzt und damit
    die fachliche Achse geschlossen (Importvertrag: Ausschuss ODER Thema). Zitat,
    Person, Ressort, Region/Parlament und die amtliche Zusatzquelle (URL + Hash +
    Abrufzeit + Datei) werden gegen die Original-HTML geprueft; die urspruenglich
    offenen Achsen bleiben ueber die disjunkte Vereinigung mit der 54er
    Rollenquittung deckungsgleich. Keine persoenliche Position, keine freie
    Themen-/Zitatzuordnung, keine Ableitung aus Kanzler-/Vorsitzrollen,
  * fuer 6 weitere dieser 54 Profile wird ueber die vom Orchestrator gepruefte
    Aufgabenquittung ``docs/betrieb/aufgabenachsen-6-20260927.json`` der
    ausdrueckliche Themenbegriff aus einem amtlich belegten personengebundenen
    Aufgabenbereich gesetzt und damit die fachliche Achse geschlossen (Importvertrag:
    Ausschuss ODER Thema). Die fail-closed-Pruefung liegt im getrennten Modul
    ``scripts/profil-feldbelege-500-aufgaben.py``; der Assembler wendet nur den
    geprueften Index an,
  * keine erfundenen Positionen, Themen, Rollen oder Biografien; uebernommen
    wird nur, was in der amtlichen Quelle belegt ist,
  * keine AfD-Zielprofile (die Auswahl ist bereits ohne AfD; zusaetzlich wird
    eine Zielgruppen-Gegenprobe gefahren).

Aufruf::

    python3 scripts/profil-feldbelege-500.py [--eingang DIR] [--ausgang DATEI]

``--eingang`` verweist auf das lokale Arbeitsverzeichnis mit den Abrufen,
Detailseiten und Extraktionen (Standard: /private/tmp/helmut-be-bb-start).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import html as _html
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import importlib.util as _importlib_util
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

STANDARD_EINGANG = Path("/private/tmp/helmut-be-bb-start")
DEFAULT_AUSGANG = REPO_ROOT / "docs" / "betrieb" / "500-profilfeldbelege-20260927.json"

NAMENSAUSWahl = REPO_ROOT / "docs" / "betrieb" / "500-namensauswahl-20260927.json"
BRANDENBURG_PARTEI = REPO_ROOT / "docs" / "betrieb" / "brandenburg-parteipruefung-20260927.json"
# Versionierte, von Sol gepruefte Ergaenzungsquittung zu den vorher offenen
# Parteifeldern (335 Ergebnisse: 261 belegt, 74 offen). Massgeblich sind die
# obersten geprueften Statusfelder; das Feld ``vorschlag`` bleibt reines Audit.
PARTEIFELDPRUEFUNG = REPO_ROOT / "docs" / "betrieb" / "parteifeldpruefung-335-20260927.json"
PARTEIFELDPRUEFUNG_RESSOURCE = "docs/betrieb/parteifeldpruefung-335-20260927.json"
ERGAENZUNG_STATUS = ("belegt", "parteilos", "offen")

# Versionierte lokale Quittung zum amtlichen Mandatsartenbeleg vierer
# Brandenburg-Profile (Landesliste). Nur Mandatsart "Landesliste" und die Region
# Brandenburg sind belegt — NICHT die irrefuehrende Listenbeschriftung
# (WfB-Gruppe/fraktionslos) und NICHT der Listenplatz 0.
MANDATSARTEN_BB = REPO_ROOT / "docs" / "betrieb" / "brandenburg-mandatsarten-20260927.json"
MANDATSARTEN_BB_RESSOURCE = "docs/betrieb/brandenburg-mandatsarten-20260927.json"
MANDATSARTEN_BB_REGION = "Brandenburg"

# Versionierte lokale Quittung zu zwei bislang offenen Berliner Mandatsarten
# (Johannes Martin Bezirksliste, Benedikt Lux Landesliste). Quelle ist das am
# Original visuell abgenommene amtliche Handbuch-PDF (Stand 8.10.2025, Seite 204,
# linke Nachruecker-Spalte). Es gibt KEINEN automatischen PDF-Parser-Nachweis:
# der genehmigte Beleg, die woertliche Transkription sowie Person/Datum/Mandatsart
# sind im Validator bewusst eng festgelegt; jede Abweichung (PDF-Stand, Seite,
# Spalte, Transkription, Mandatsart, Person, Datum, Hash) bricht fail closed ab.
MANDATSARTEN_BE = REPO_ROOT / "docs" / "betrieb" / "berlin-mandatsarten-20260927.json"
MANDATSARTEN_BE_RESSOURCE = "docs/betrieb/berlin-mandatsarten-20260927.json"
MANDATSARTEN_BE_ERWARTUNG = {
    "quelle": {
        "url": "https://www.parlament-berlin.de/media/download/5468",
        "finalUrl": "https://www.parlament-berlin.de/media/download/5468",
        "datei": "berlin-handbuch-5468-20251008.pdf",
        "abgerufenAm": "2026-09-27T17:50:02.091789+00:00",
        "sha256": "3ccd91c80803046da57c2a398c9307dfadf938189cd4db99d9c15f256cf486d8",
        "bytes": 6935446,
        "stand": "2025-10-08",
        "seite": 204,
        "pdfSeiteIndex": 204,
        "spalte": "links",
        "http": 200,
    },
    "belege": {
        "johannes-martin": {
            "kennung": "landtag-berlin-johannes-martin",
            "profilUrl": "https://www.parlament-berlin.de/Abgeordnete/johannes-martin?groupStrategy=nachnamen",
            "profilDatei": "landtag-berlin-johannes-martin.html",
            "profilSha256": "3d01e377b5fad72d67f6b19ba4365def26b61579655bb1b4f0c31113605a78b9",
            "profilBytes": 107064,
            "vollname": "Johannes Martin",
            "nachgeruecktAm": "2025-09-27",
            "profilblockWortlaut": "Nachgerückt am 27.09.2025 für Christian Gräff",
            "mandatsart": "Bezirksliste",
            "regionHinweis": "Berlin — Bezirksliste Marzahn-Hellersdorf",
            "seite": 204,
            "spalte": "links",
            "zitat": "Martin, Johannes CDU nachgerückt am 27. September 2025 Marzahn-Hellersdorf, Bezirksliste",
            "aktuelleAbschnittsbindung": {
                "quelleUrl": "https://www.parlament-berlin.de/das-parlament/abgeordnete/suche-nach-wahlkreisen",
                "quelleDatei": "berlin-wahlkreissuche-aktuell.html",
                "quelleSha256": "dae4db3c10a525f2842582885f7c8ca5eb5cfef85b96eeb07f116f7e084a33ae",
                "quelleBytes": 210373,
                "finalUrl": "https://www.parlament-berlin.de/das-parlament/abgeordnete/suche-nach-wahlkreisen",
                "abgerufenAm": "2026-09-27T17:49:28.438246+00:00",
                "http": 200,
                "oberabschnitt": "Wahlbezirk 10: Marzahn-Hellersdorf",
                "unterabschnitt": "Bezirksliste:",
                "href": "/Abgeordnete/johannes-martin?groupStrategy=constituency",
                "linkText": "Martin, Johannes, CDU-Fraktion, Nachgerückt",
            },
        },
        "benedikt-lux": {
            "kennung": "landtag-berlin-benedikt-lux",
            "profilUrl": "https://www.parlament-berlin.de/Abgeordnete/benedikt-lux?groupStrategy=nachnamen",
            "profilDatei": "landtag-berlin-benedikt-lux.html",
            "profilSha256": "4624c6df0fd0e76992766163a63ae91ead0cd2499b70f1a1b6aa8a3106b96302",
            "profilBytes": 107475,
            "vollname": "Benedikt Lux",
            "nachgeruecktAm": "2025-05-14",
            "profilblockWortlaut": "Nachgerückt am 14.05.2025 für Julia Schneider",
            "mandatsart": "Landesliste",
            "regionHinweis": "Berlin — Landesliste",
            "seite": 204,
            "spalte": "links",
            "zitat": "Lux, Benedikt Bündnis 90/Die Grünen nachgerückt am 14. Mai 2025 Landesliste",
            "aktuelleAbschnittsbindung": None,
        },
    },
}
MANDATSARTEN_BE_GESAMT = 2

# Versionierte, vom Orchestrator gepruefte Rollenquittung fuer die 54 fachlich
# noch offenen Profile (48 belegt, 6 offen). Nur die ausdruecklich freigegebenen
# ``wortlaut``-Strings werden an bestehende ``profil.funktionen`` dedupliziert
# ANGEHAENGT; bestehende Gremienrollen bleiben unveraendert. Es entsteht KEIN
# regierungsrolle-Schema und KEINE fachliche Achse. Jede Kennung ist an URL,
# Quellhash, erlaubten Status und ein woertliches Zitat im personengebundenen
# amtlichen Abschnitt gebunden. Abweichungen brechen fail closed ab.
PROFILROLLEN = REPO_ROOT / "docs" / "betrieb" / "profilrollen-43-20260928.json"
PROFILROLLEN_RESSOURCE = "docs/betrieb/profilrollen-43-20260928.json"
PROFILROLLEN_GESAMT = 41
PROFILROLLEN_BELEGT = 36
PROFILROLLEN_OFFEN = 5
PROFILROLLEN_STATUS = ("belegt", "offen")

# Versionierte, vom Orchestrator gepruefte Ressortquittung der 19 zuvor offenen
# Fachachsen (9 Bund / 4 Berlin / 6 Brandenburg). Nur fuer diese 19 Profile wird
# werden die ausdruecklichen Ressortbegriffe als Themen uebernommen, der
# Ableitungshinweis bleibt separat in funktionen erhalten; damit
# schliesst sich die fachliche Achse (Importvertrag: belegter Ausschuss ODER
# Thema). Keine persoenliche politische Position, keine freie Themen- oder
# Zitatzuordnung. Jede Kennung ist an die bestehende 54er Rollenquittung, die
# amtliche Zusatzquelle (URL + Hash + Abrufzeit + Datei) und ein
# zusammenhaengendes Person/Ressort-Zitat gebunden.
RESSORTAKSEN = REPO_ROOT / "docs" / "betrieb" / "ressortachsen-19-20260927.json"
RESSORTAKSEN_RESSOURCE = "docs/betrieb/ressortachsen-19-20260927.json"
RESSORTAKSEN_GESAMT = 19
RESSORTAKSEN_REGIONEN = {"Bund": 9, "Berlin": 4, "Brandenburg": 6}
RESSORTAKSEN_STATUS = ("belegt",)
# Region -> Parlament (konsistent zur kanonischen 500-Auswahl) und amtlicher Host
# der Zusatzquelle. Weicht Region, Parlament oder Quellhost ab, bricht der Lauf ab.
RESSORTAKSEN_REGION_PARLAMENT = {
    "Bund": "bundestag",
    "Berlin": "landtag-berlin",
    "Brandenburg": "landtag-brandenburg",
}
RESSORTAKSEN_QUELLHOST = {
    "Bund": "bundesregierung.de",
    "Berlin": "berlin.de",
    "Brandenburg": "brandenburg.de",
}
# Herkunftshinweis: Ressort + Region + Ableitungskennzeichnung.
RESSORTAKSEN_THEMA = "Ressortzuständigkeit {region} (amtlich abgeleitet): {ressort}"

def _ressort_themen(ressort):
    # Nur ausdrueckliche Aufzaehlungen trennen. Diese zwei verbundenen Begriffe
    # bleiben ungeteilt, damit z.B. Entwicklung kein beliebiges Fremdthema wird.
    if ressort == "wirtschaftliche Zusammenarbeit und Entwicklung":
        return [ressort]
    return re.split(r", |(?<!Land-) und ", ressort)
# Nur diese beiden amtlichen Namensfuegeworte werden beim lexikalischen
# Ressort/Zitat-Abgleich ignoriert (amtliche Langnamen fuegen "und"/"für" ein).
RESSORTAKSEN_VERBINDER = ("und", "für")
# Einzige erlaubte enge lexikalische Ausnahme: amtliche Langform "Innern" fuer
# die Kurzform "Inneres". Keine weitere Aufweichung, kein Fuzzy, kein Alias.
RESSORTAKSEN_LEXIK = {"inneres": "innern"}
# Amtliche Regierungs-/Ressortrollen tragen ein Ressort; reine Kanzler- oder
# Vorsitzrollen tun das nicht und duerfen KEIN Ressort ableiten.
RESSORTAKSEN_ROLLEN_VERBOTEN = ("kanzler", "vorsitz")

# Versionierte, vom Orchestrator gepruefte Aufgabenquittung der 6 weiteren
# Fachachsen (alle Bundestag): personengebundene Beauftragtenaufgaben
# (Brand/Connemann/Pawlik/Kaiser) und ausdrueckliche BMAS-Abteilungszustaendigkeit
# (Griese IV/V, Mast II/III). Die fail-closed-Validierung liegt bewusst in einem
# kleinen, getrennten Modul, damit dieser Assembler nicht weiter anwaechst; hier
# wird nur der gepruefte Index angewendet.
AUFGABENACHSEN = REPO_ROOT / "docs" / "betrieb" / "aufgabenachsen-6-20260927.json"
AUFGABENACHSEN_RESSOURCE = "docs/betrieb/aufgabenachsen-6-20260927.json"
AUFGABENACHSEN_GESAMT = 6


def _lade_aufgabenmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-aufgaben.py")
    # Kein Bytecode-Cache: der Assembler laeuft als reines Offline-Werkzeug und soll
    # beim Laden des getrennten Moduls keine __pycache__-Artefakte anlegen.
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_aufgaben", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


AUFGABENMODUL = _lade_aufgabenmodul()


def _pruefe_aufgabenachsen(eingang) -> dict:
    """Prueft die versionierte Aufgabenquittung ueber das getrennte Modul."""
    try:
        index = AUFGABENMODUL.pruefe_aufgabenachsen(
            eingang,
            quittung=getattr(eingang, "aufgabenachsen", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
        )
    except AUFGABENMODUL.AufgabenachsenFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.aufgabenachsen_by_kennung = index
    eingang.aufgabenachsen_verwendet = set()
    return index


# Versionierte, vom Orchestrator gepruefte Quittung der 2 BERATENDEN
# Ausschussachsen (beide Bundestag: Knodel Landwirtschaft/Ernaehrung/Heimat,
# Seidler Haushalt). Die fail-closed-Validierung liegt bewusst im getrennten
# Modul ``profil-feldbelege-500-beratende.py``; hier wird nur der gepruefte Index
# angewendet. Die beratende Rolle bleibt eine beratende Funktion, es entsteht
# KEINE ordentliche/stellvertretende Ausschussmitgliedschaft und keine politische
# Position. Die 54er Amtsrollenquittung bleibt unveraendert 48 belegt / 6 offen
# (diese 2 sind dort ausdruecklich offen — kein Fehler).
BERATENDEACHSEN = REPO_ROOT / "docs" / "betrieb" / "beratende-achsen-2-20260927.json"
BERATENDEACHSEN_RESSOURCE = "docs/betrieb/beratende-achsen-2-20260927.json"
BERATENDEACHSEN_GESAMT = 2


def _lade_beratendemodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-beratende.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_beratende", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


BERATENDEMODUL = _lade_beratendemodul()


def _pruefe_beratendeachsen(eingang) -> dict:
    """Prueft die versionierte beratende Achsenquittung ueber das getrennte Modul."""
    try:
        index = BERATENDEMODUL.pruefe_beratendeachsen(
            eingang,
            quittung=getattr(eingang, "beratendeachsen", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
        )
    except BERATENDEMODUL.BeratendeachsenFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.beratendeachsen_by_kennung = index
    eingang.beratendeachsen_verwendet = set()
    return index


# Versionierte, vom Orchestrator gepruefte Quittung der 3 ZUSAETZLICHEN
# Fachzustaendigkeiten (alle Bundestag: Breher Tierschutz, Krichbaum Europa,
# Kippels BMG-Abteilungen 1/4/5/6). Die fail-closed-Validierung liegt bewusst im
# getrennten Modul ``profil-feldbelege-500-zusatzaufgaben.py``; hier wird nur der
# gepruefte Index angewendet. Bestehende Rollen, Partei, Mandatsart, Gremien und
# alle anderen Felder bleiben unveraendert; nur Breher erhaelt genau eine neue
# Funktionsrolle, alle drei den getrennten Ableitungshinweis. Keine persoenliche
# politische Position, keine freie Themen-/Zitatzuordnung.
ZUSATZAUFGABEN = REPO_ROOT / "docs" / "betrieb" / "zusaetzliche-aufgaben-3-20260927.json"
ZUSATZAUFGABEN_RESSOURCE = "docs/betrieb/zusaetzliche-aufgaben-3-20260927.json"
ZUSATZAUFGABEN_GESAMT = 3


def _lade_zusatzaufgabenmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZUSATZAUFGABENMODUL = _lade_zusatzaufgabenmodul()


def _pruefe_zusatzaufgaben(eingang) -> dict:
    """Prueft die versionierte Zusatzaufgabenquittung ueber das getrennte Modul."""
    try:
        index = ZUSATZAUFGABENMODUL.pruefe_zusatzaufgaben(
            eingang,
            quittung=getattr(eingang, "zusaetzlicheaufgaben", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
        )
    except ZUSATZAUFGABENMODUL.ZusatzaufgabenFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.zusaetzlicheaufgaben_by_kennung = index
    eingang.zusaetzlicheaufgaben_verwendet = set()
    return index


# Versionierte, vom Orchestrator gepruefte Quittung der 2 personengebundenen
# BMWSB-Aufgabenachsen (beide Bundestag: Sören Bartol Z I 3/W II/S I/B I/B II,
# Sabine Poschmann Z II/W I/S II/S III). Die fail-closed-Validierung liegt bewusst
# im getrennten Modul ``profil-feldbelege-500-bmwsb.py`` (das die sicheren Helfer
# des Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index
# angewendet. Bestehende Rollen, Partei, Mandatsart, Gremien und alle anderen
# Felder bleiben unveraendert; es entstehen nur die freigegebenen Kurzthemen und
# der getrennte Herkunftshinweis. Keine Hochstufung auf ganze Abteilungen, keine
# persoenliche politische Position, keine freie Themen-/Zitatzuordnung.
BMWSB = REPO_ROOT / "docs" / "betrieb" / "bmwsb-aufgaben-2-20260927.json"
BMWSB_RESSOURCE = "docs/betrieb/bmwsb-aufgaben-2-20260927.json"
BMWSB_GESAMT = 2


def _lade_bmwsbmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-bmwsb.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_bmwsb", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


BMWSBMODUL = _lade_bmwsbmodul()


def _pruefe_bmwsb(eingang) -> dict:
    """Prueft die versionierte BMWSB-Aufgabenquittung ueber das getrennte Modul."""
    try:
        index = BMWSBMODUL.pruefe_bmwsb(
            eingang,
            quittung=getattr(eingang, "bmwsb", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
        )
    except BMWSBMODUL.BmwsbFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.bmwsb_by_kennung = index
    eingang.bmwsb_verwendet = set()
    return index


# Versionierte, vom Orchestrator gepruefte EINZELFALLQUITTUNG des zuvor einzeln
# offenen Rollenfalls Philipp Amthor (Bundestag). Die fail-closed-Validierung liegt
# im getrennten Modul ``profil-feldbelege-500-amthor.py`` (das die sicheren Helfer
# des Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index
# angewendet. Der alte Rollenvalidator mit Pflichtstatus ``belegt`` wird bewusst
# NICHT verwendet: der 54er-Eintrag bleibt historisch offen, die kanonische
# Bundestags-Person wird separat neu gebunden. Es entstehen nur die freigegebene
# aktuelle Funktionsrolle, das eine Thema und der getrennte Herkunftshinweis;
# bestehende Felder (Partei, Mandatsart, Gremien) bleiben unveraendert.
AMTHOR = REPO_ROOT / "docs" / "betrieb" / "amthor-aktuelles-amt-1-20260927.json"
AMTHOR_RESSOURCE = "docs/betrieb/amthor-aktuelles-amt-1-20260927.json"
AMTHOR_GESAMT = 1


def _lade_amthormodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-amthor.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_amthor", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


AMTHORMODUL = _lade_amthormodul()


def _pruefe_amthor(eingang) -> dict:
    """Prueft die versionierte Amthor-Einzelfallquittung ueber das getrennte Modul."""
    try:
        index = AMTHORMODUL.pruefe_amthor(
            eingang,
            quittung=getattr(eingang, "amthor", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
        )
    except AMTHORMODUL.AmthorFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.amthor_by_kennung = index
    eingang.amthor_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte AUFGABENQUITTUNG der drei sonstigen
# Gremien-Aufgabenachsen des Wahlausschusses (Britta Haßelmann, Alexander Hoffmann,
# Dr. Matthias Miersch). Die fail-closed-Validierung liegt im getrennten Modul
# ``profil-feldbelege-500-wahlausschuss.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index
# angewendet. Die aktuelle Mitgliedschaft wird eigenstaendig aus genau EINEM
# ProfilePage.mainEntity in genau EINER echten Role zum Wahlausschuss neu gebunden;
# der alte Rollenvalidator mit Pflichtstatus ``belegt`` wird NICHT verwendet
# (Haßelmann/Miersch bleiben dort offen, das ist kein Blocker). Es entstehen nur
# das enge amtliche Thema und der getrennte Herkunftshinweis; das sonstige Gremium,
# die bestehenden ordentlichen/stellvertretenden Funktionen, Partei und Mandatsart
# bleiben unveraendert.
WAHLAUSSCHUSS = REPO_ROOT / "docs" / "betrieb" / "wahlausschuss-drei-aufgaben-20260927.json"
WAHLAUSSCHUSS_RESSOURCE = "docs/betrieb/wahlausschuss-drei-aufgaben-20260927.json"
WAHLAUSSCHUSS_GESAMT = 3


def _lade_wahlausschussmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-wahlausschuss.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_wahlausschuss", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


WAHLAUSSCHUSSMODUL = _lade_wahlausschussmodul()


def _pruefe_wahlausschuss(eingang) -> dict:
    """Prueft die versionierte Wahlausschuss-Aufgabenquittung ueber das getrennte Modul."""
    try:
        index = WAHLAUSSCHUSSMODUL.pruefe_wahlausschuss(
            eingang,
            quittung=getattr(eingang, "wahlausschuss", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
            amthor_kennungen=set(getattr(eingang, "amthor_by_kennung", None) or {}),
        )
    except WAHLAUSSCHUSSMODUL.WahlausschussFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.wahlausschuss_by_kennung = index
    eingang.wahlausschuss_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng geprueffte ZWEIERQUITTUNG der zuletzt fehlenden
# aktuellen Fraktionsvorsitz-Funktionsfelder (Britta Haßelmann, Dr. Matthias Miersch).
# Die fail-closed-Validierung liegt im getrennten Modul
# ``profil-feldbelege-500-fraktionsvorsitz.py`` (das die sicheren Quellen-Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index angewendet.
# Die kanonische Personenseite wird separat am lokalen Abruf und am echten Original
# gebunden (H1 + ProfilePage.mainEntity @id #mdb); die aktuelle Rolle steht im
# geschlossenen sichtbaren .bt-standard-content der amtlichen Fraktionsseite mit genau
# EINEM kanonischen Biografielink. Es entsteht NUR das Funktionsfeld plus offizielle
# Fraktionsquelle: KEINE Themen, keine Parteiableitung, keine Amtsbeginn-Daten, keine
# weiteren Profilfelder, keine fachliche Achse. Die 54er Eintraege bleiben offen.
FRAKTIONSVORSITZ = REPO_ROOT / "docs" / "betrieb" / "fraktionsvorsitz-zwei-20260927.json"
FRAKTIONSVORSITZ_RESSOURCE = "docs/betrieb/fraktionsvorsitz-zwei-20260927.json"
FRAKTIONSVORSITZ_GESAMT = 2


def _lade_fraktionsvorsitzmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-fraktionsvorsitz.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_fraktionsvorsitz", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


FRAKTIONSVORSITZMODUL = _lade_fraktionsvorsitzmodul()


def _pruefe_fraktionsvorsitz(eingang) -> dict:
    """Prueft die versionierte Zweier-Fraktionsvorsitzquittung ueber das getrennte Modul."""
    try:
        index = FRAKTIONSVORSITZMODUL.pruefe_fraktionsvorsitz(
            eingang,
            quittung=getattr(eingang, "fraktionsvorsitz", None),
        )
    except FRAKTIONSVORSITZMODUL.FraktionsvorsitzFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.fraktionsvorsitz_by_kennung = index
    eingang.fraktionsvorsitz_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte EINZELFALLQUITTUNG des zuvor offenen
# Fachachsenfalls Thomas Jarzombek (Bundestag). Die fail-closed-Validierung liegt im
# getrennten Modul ``profil-feldbelege-500-jarzombek.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index angewendet.
# Die bestehende aktuelle PSts-Rolle stammt aus der 54er Rollenquittung (belegt) und
# bleibt unveraendert; die BMDS-Abteilungen DS/DI/DW werden ausschliesslich ueber genau
# eine echte geschlossene HTML-Karte article#c5755 samt kanonischem H2-Personenlink und
# das amtliche Organigramm-JSON (excludePersonalData=true, Stand 2026-08-15) gebunden. Es
# entstehen nur die vier freigegebenen Themen, der getrennte Herkunftshinweis und die
# amtliche Quelle; keine persoenliche Position, keine Scheinausschuesse, keine
# Partei-/Mandatsartaenderung. Der neue Host bmds.bund.de ist eng im eigenen Modul fuer
# genau die zwei kanonischen Quellen freigegeben.
JARZOMBEK = REPO_ROOT / "docs" / "betrieb" / "jarzombek-bmds-abteilungen-1-20260927.json"
JARZOMBEK_RESSOURCE = "docs/betrieb/jarzombek-bmds-abteilungen-1-20260927.json"
JARZOMBEK_GESAMT = 1


def _lade_jarzombekmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-jarzombek.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_jarzombek", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


JARZOMBEKMODUL = _lade_jarzombekmodul()


def _pruefe_jarzombek(eingang) -> dict:
    """Prueft die versionierte Jarzombek-Einzelfallquittung ueber das getrennte Modul."""
    try:
        index = JARZOMBEKMODUL.pruefe_jarzombek(
            eingang,
            quittung=getattr(eingang, "jarzombek", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
            amthor_kennungen=set(getattr(eingang, "amthor_by_kennung", None) or {}),
            wahlausschuss_kennungen=set(getattr(eingang, "wahlausschuss_by_kennung", None) or {}),
        )
    except JARZOMBEKMODUL.JarzombekFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.jarzombek_by_kennung = index
    eingang.jarzombek_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte EINZELFALLQUITTUNG des zuvor offenen
# Fachachsenfalls Julia Klöckner (Bundestag). Die fail-closed-Validierung liegt im
# getrennten Modul ``profil-feldbelege-500-kloeckner.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index angewendet.
# Die bestehende aktuelle Rolle stammt aus der 54er Rollenquittung (belegt) und bleibt
# unveraendert; ihre kanonische Bundestags-Person wird separat neu gebunden (echte H1 +
# eigener aktueller Funktionstext div.m-biography__function). Die Aufgaben stammen
# ausschliesslich aus dem ZWEITEN eigenen Absatz des geschlossenen H2-Abschnitts "An der
# Spitze der Bundestagsverwaltung" der amtlichen Praesidiumsseite; der erste Absatz,
# sonstige Praesidiums-/Aeltestenratsarbeit, angrenzende Abschnitte und der
# --hidden-Linkhilfetext sind keine Personenaufgaben. Es entstehen nur die zwei
# freigegebenen Themen (Bundestagsverwaltung, Parteienfinanzierung), der getrennte
# Herkunftshinweis und die amtliche Quelle; keine allgemeine Polizei-/Innenpolitik,
# keine persoenliche politische Position, keine Scheinausschuesse, keine
# Partei-/Mandatsartaenderung.
KLOECKNER = REPO_ROOT / "docs" / "betrieb" / "kloeckner-praesidentinnen-aufgaben-1-20260927.json"
KLOECKNER_RESSOURCE = "docs/betrieb/kloeckner-praesidentinnen-aufgaben-1-20260927.json"
KLOECKNER_GESAMT = 1


def _lade_kloecknermodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-kloeckner.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_kloeckner", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


KLOECKNERMODUL = _lade_kloecknermodul()


def _pruefe_kloeckner(eingang) -> dict:
    """Prueft die versionierte Kloeckner-Einzelfallquittung ueber das getrennte Modul."""
    try:
        index = KLOECKNERMODUL.pruefe_kloeckner(
            eingang,
            quittung=getattr(eingang, "kloeckner", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
            amthor_kennungen=set(getattr(eingang, "amthor_by_kennung", None) or {}),
            wahlausschuss_kennungen=set(getattr(eingang, "wahlausschuss_by_kennung", None) or {}),
            jarzombek_kennungen=set(getattr(eingang, "jarzombek_by_kennung", None) or {}),
        )
    except KLOECKNERMODUL.KloecknerFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.kloeckner_by_kennung = index
    eingang.kloeckner_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte Einzelfallquittung fuer den zuvor
# offenen Fachachsenfall Dennis Rohde (BMF-Aufgabe Bundeshaushalt). Die
# fail-closed-Validierung liegt im getrennten Modul
# ``profil-feldbelege-500-rohde.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der geprueffte Index
# angewendet. Das Thema stammt ausschliesslich aus Rohdes eigenem Kasten auf
# Seite 1 des amtlich von der Landingpage verlinkten v=32-Organisationsplans
# (Originalbytes nur ueber Hash/Bytezahl/Stand/Seite, KEIN PDF-Parser).
ROHDE = REPO_ROOT / "docs" / "betrieb" / "rohde-bundeshaushalt-1-20260927.json"
ROHDE_RESSOURCE = "docs/betrieb/rohde-bundeshaushalt-1-20260927.json"


def _lade_rohdemodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-rohde.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_rohde", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ROHDEMODUL = _lade_rohdemodul()


def _pruefe_rohde(eingang) -> dict:
    """Prueft die versionierte Rohde-Einzelfallquittung ueber das getrennte Modul."""
    try:
        index = ROHDEMODUL.pruefe_rohde(
            eingang,
            quittung=getattr(eingang, "rohde", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
            amthor_kennungen=set(getattr(eingang, "amthor_by_kennung", None) or {}),
            wahlausschuss_kennungen=set(getattr(eingang, "wahlausschuss_by_kennung", None) or {}),
            jarzombek_kennungen=set(getattr(eingang, "jarzombek_by_kennung", None) or {}),
            kloeckner_kennungen=set(getattr(eingang, "kloeckner_by_kennung", None) or {}),
        )
    except ROHDEMODUL.RohdeFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.rohde_by_kennung = index
    eingang.rohde_verwendet = set()
    return index


# Versionierte, vom Orchestrator geprueffte Ergaenzungsquittung fuer den belegten
# Verlust stellvertretender Brandenburger Ausschussmitgliedschaften. Die
# fail-closed-Validierung liegt im getrennten Modul
# ``profil-feldbelege-500-stellvertretungen.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der geprueffte Index
# angewendet. 76 Stellvertretungen bei 35 der 50 kanonischen Landtagsprofile,
# ausschliesslich aus dem amtlichen Fachausschussindex 25220 und seinen 14
# verlinkten Ausschussseiten. Nur die eigene geschlossene Stellvertretungsspalte
# zaehlt; ordentliche Ausschuesse, Partei, Fraktion, Funktionen, Themen und
# Mandatsart bleiben unveraendert, keine Aufwertung zu ordentlichem Sitz/Vorsitz.
STELLVERTRETUNGEN = REPO_ROOT / "docs" / "betrieb" / "brandenburg-stellvertretungen-76-20260927.json"
STELLVERTRETUNGEN_RESSOURCE = "docs/betrieb/brandenburg-stellvertretungen-76-20260927.json"


def _lade_stellvertretungenmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-stellvertretungen.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_stellvertretungen", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


STELLVERTRETUNGENMODUL = _lade_stellvertretungenmodul()


def _pruefe_stellvertretungen(eingang) -> dict:
    """Prueft die versionierte Stellvertretungsquittung ueber das getrennte Modul."""
    try:
        index = STELLVERTRETUNGENMODUL.pruefe_stellvertretungen(
            eingang,
            quittung=getattr(eingang, "stellvertretungen", None),
            kennung_zu_abruf=getattr(eingang, "kennung_zu_abruf", None) or {},
        )
    except STELLVERTRETUNGENMODUL.StellvertretungenFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.stellvertretungen_by_kennung = index
    eingang.stellvertretungen_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte ZUSATZQUITTUNG des EINEN bislang
# offenen Bundestags-Parteibelegs Boris Pistorius. Die fail-closed-Validierung
# liegt im getrennten Modul ``profil-feldbelege-500-pistorius.py``; hier wird nur
# der gepruefte Index angewendet. Uebernommen wird AUSSCHLIESSLICH der Parteiwert
# SPD aus der getrennten offiziellen Quelle https://www.spd.de/ueber-uns (H2,
# section#m236604 und exakter li-Name im Modul fixiert). Die historische 335er
# Parteifeldquittung bleibt byteidentisch und Pistorius darin offen; Fraktion,
# Funktionen, Themen, Mandat und alle anderen Felder bleiben unveraendert, kein
# Schluss aus der Fraktion, keine Importfreigabe.
PISTORIUS = REPO_ROOT / "docs" / "betrieb" / "pistorius-partei-1-20260928.json"
PISTORIUS_RESSOURCE = "docs/betrieb/pistorius-partei-1-20260928.json"
PISTORIUS_GESAMT = 1


def _lade_pistoriusmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-pistorius.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_pistorius", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


PISTORIUSMODUL = _lade_pistoriusmodul()


def _pruefe_pistorius(eingang) -> dict:
    """Prueft die versionierte Pistorius-Parteizusatzquittung ueber das getrennte Modul."""
    try:
        index = PISTORIUSMODUL.pruefe_pistorius(
            eingang,
            quittung=getattr(eingang, "pistorius", None),
            kennung_zu_abruf=getattr(eingang, "kennung_zu_abruf", None) or {},
            original_bytes=getattr(eingang, "pistorius_original", None),
            original_pfad=getattr(eingang, "pistorius_original_pfad", None),
        )
    except PISTORIUSMODUL.PistoriusFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.pistorius_by_kennung = index
    eingang.pistorius_verwendet = set()
    return index


# Drei getrennte offizielle Partei-Belege fuer die nach dem sicheren Ersatz
# verbliebenen offenen Bundestagsfaelle. Das Modul bindet jede Partei-Quelle
# zusaetzlich an das kanonische Bundestagsprofil; es aendert nur ``partei``.
PARTEIZUSATZ = REPO_ROOT / "docs" / "betrieb" / "parteifelder-zusatz-3-20260928.json"
PARTEIZUSATZ_RESSOURCE = "docs/betrieb/parteifelder-zusatz-3-20260928.json"
PARTEIZUSATZ_GESAMT = 3


def _lade_parteizusatzmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-parteizusatz.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_parteizusatz", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


PARTEIZUSATZMODUL = _lade_parteizusatzmodul()


def _pruefe_parteizusatz(eingang) -> dict:
    try:
        index = PARTEIZUSATZMODUL.pruefe_parteizusatz(
            eingang,
            quittung=getattr(eingang, "parteizusatz", None),
            kennung_zu_abruf=getattr(eingang, "kennung_zu_abruf", None) or {},
        )
    except PARTEIZUSATZMODUL.ParteizusatzFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.parteizusatz_by_kennung = index
    eingang.parteizusatz_verwendet = set()
    return index


# Versionierte, vom Orchestrator eng gepruefte Einzelfallquittung fuer den zuvor
# offenen Fachachsenfall Friedrich Merz (Bundeskanzler, Richtlinien der
# Regierungspolitik). Die fail-closed-Validierung liegt im getrennten Modul
# ``profil-feldbelege-500-merz.py`` (das die sicheren Helfer des
# Zusatzaufgabenmoduls wiederverwendet); hier wird nur der gepruefte Index
# angewendet. Es entsteht KEINE neue Rolle; die bestehende Rolle Bundeskanzler
# stammt unveraendert aus der 54er Rollenquittung. Person und Amt sind nur ueber
# den echten sichtbaren eigenen Artikelkopf der amtlichen Bundesregierungsseite
# belegt (nicht Bild/JSON-LD); die Aufgabe nur ueber den geschlossenen
# H2-Abschnitt "Richtlinien-Kompetenz" des eigenen innersten div.bpa-richtext.
MERZ = REPO_ROOT / "docs" / "betrieb" / "merz-richtlinien-1-20260928.json"
MERZ_RESSOURCE = "docs/betrieb/merz-richtlinien-1-20260928.json"


def _lade_merzmodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-merz.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_merz", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


MERZMODUL = _lade_merzmodul()


def _pruefe_merz(eingang) -> dict:
    """Prueft die versionierte Merz-Einzelfallquittung ueber das getrennte Modul."""
    try:
        index = MERZMODUL.pruefe_merz(
            eingang,
            quittung=getattr(eingang, "merz", None),
            ressortachsen_kennungen=set(getattr(eingang, "ressortachsen_by_kennung", None) or {}),
            aufgabenachsen_kennungen=set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {}),
            beratendeachsen_kennungen=set(getattr(eingang, "beratendeachsen_by_kennung", None) or {}),
            zusatzaufgaben_kennungen=set(getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}),
            bmwsb_kennungen=set(getattr(eingang, "bmwsb_by_kennung", None) or {}),
            amthor_kennungen=set(getattr(eingang, "amthor_by_kennung", None) or {}),
            wahlausschuss_kennungen=set(getattr(eingang, "wahlausschuss_by_kennung", None) or {}),
            jarzombek_kennungen=set(getattr(eingang, "jarzombek_by_kennung", None) or {}),
            kloeckner_kennungen=set(getattr(eingang, "kloeckner_by_kennung", None) or {}),
            rohde_kennungen=set(getattr(eingang, "rohde_by_kennung", None) or {}),
            stellvertretungen_kennungen=set(getattr(eingang, "stellvertretungen_by_kennung", None) or {}),
        )
    except MERZMODUL.MerzFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.merz_by_kennung = index
    eingang.merz_verwendet = set()
    return index


# Enger Einzelfall fuer die bestehende Woidke-Rolle: genau die amtlich belegte
# Richtlinienkompetenz des brandenburgischen Ministerpraesidenten. Die getrennte
# fail-closed-Pruefung bindet Rollenquittung, Profil-H1 und Staatskanzlei-Original.
WOIDKE = REPO_ROOT / "docs" / "betrieb" / "woidke-richtlinien-1-20260928.json"
WOIDKE_RESSOURCE = "docs/betrieb/woidke-richtlinien-1-20260928.json"


def _lade_woidkemodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-woidke.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_woidke", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


WOIDKEMODUL = _lade_woidkemodul()


def _pruefe_woidke(eingang) -> dict:
    andere_achsen = set()
    for name in (
        "ressortachsen_by_kennung", "aufgabenachsen_by_kennung", "beratendeachsen_by_kennung",
        "zusaetzlicheaufgaben_by_kennung", "bmwsb_by_kennung", "amthor_by_kennung",
        "wahlausschuss_by_kennung", "jarzombek_by_kennung", "kloeckner_by_kennung",
        "rohde_by_kennung", "merz_by_kennung", "stellvertretungen_by_kennung",
    ):
        andere_achsen.update(getattr(eingang, name, None) or {})
    try:
        index = WOIDKEMODUL.pruefe_woidke(
            eingang, quittung=getattr(eingang, "woidke", None), andere_achsen=andere_achsen
        )
    except WOIDKEMODUL.WoidkeFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.woidke_by_kennung = index
    eingang.woidke_verwendet = set()
    return index


# Enger Einzelfall fuer die bestehende Berliner Wegner-Rolle: genau die amtlich
# belegte Richtlinienkompetenz des Regierenden Buergermeisters von Berlin. Die
# getrennte fail-closed-Pruefung bindet Rollenquittung, amtliche Senatsseite
# (Person/Amt) und den ersten Listeneintrag des eigenen Geschaeftsbereichs I.
WEGNER = REPO_ROOT / "docs" / "betrieb" / "wegner-richtlinien-1-20260928.json"
WEGNER_RESSOURCE = "docs/betrieb/wegner-richtlinien-1-20260928.json"


def _lade_wegnermodul():
    pfad = Path(__file__).with_name("profil-feldbelege-500-wegner.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_wegner", pfad)
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


WEGNERMODUL = _lade_wegnermodul()


def _pruefe_wegner(eingang) -> dict:
    andere_achsen = set()
    for name in (
        "ressortachsen_by_kennung", "aufgabenachsen_by_kennung", "beratendeachsen_by_kennung",
        "zusaetzlicheaufgaben_by_kennung", "bmwsb_by_kennung", "amthor_by_kennung",
        "wahlausschuss_by_kennung", "jarzombek_by_kennung", "kloeckner_by_kennung",
        "rohde_by_kennung", "merz_by_kennung", "woidke_by_kennung",
        "stellvertretungen_by_kennung",
    ):
        andere_achsen.update(getattr(eingang, name, None) or {})
    try:
        index = WEGNERMODUL.pruefe_wegner(
            eingang, quittung=getattr(eingang, "wegner", None), andere_achsen=andere_achsen
        )
    except WEGNERMODUL.WegnerFehler as fehler:
        raise AssemblerFehler(str(fehler)) from fehler
    eingang.wegner_by_kennung = index
    eingang.wegner_verwendet = set()
    return index


ZUSATZQUELLEN = "zusatzquellen"

ABRUF_BUNDESTAG = "bundestagsprofile-330-abruf.json"
ABRUF_LANDESPARLAMENTE = "landesprofile-170-abruf.json"
EXTRAKTION_BUNDESTAG = "bundestagsprofile-330-extraktion.json"
EXTRAKTION_LANDESPARLAMENTE = "landesprofile-170-extraktion.json"
DETAILSEITEN = "detailseiten"

# Explizite, amtlich belegte Liste der "sonstigen Gremien" des Bundestages.
# Schluessel ist der Name aus dem amtlichen JSON-LD (ProfilePage.mainEntity.memberOf),
# Wert die amtliche URL desselben Objekts. Genau diese Gremien werden aus den
# staendigen Ausschuessen herausgeloest und als ``weitereGremien`` + rollengetreue
# ``funktionen`` weitergereicht. Alles andere bleibt unangetastet: ein unbekannter
# echter Ausschuss bleibt weiter gesperrt (fail closed), er wird NICHT umgedeutet.
SONSTIGE_GREMIEN = {
    "Parlamentarischer Beirat für nachhaltige Entwicklung und Zukunftsfragen":
        "https://www.bundestag.de/ausschuesse/weitere_gremien/pbnez",
    "Wahlausschuss":
        "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss",
    "Enquete-Kommission „Corona“":
        "https://www.bundestag.de/ausschuesse/weitere_gremien/ee01",
    "Gremium gemäß Artikel 13 Absatz 6 des Grundgesetzes":
        "https://www.bundestag.de/ausschuesse/weitere_gremien/gremium-artikel13",
    "Parlamentarisches Kontrollgremium (PKGr)":
        "https://www.bundestag.de/ausschuesse/weitere_gremien/parlamentarisches-kontrollgremium",
    "Unterausschuss Internationale Ordnung, Vereinte Nationen und internationale Organisationen":
        "https://www.bundestag.de/ausschuesse/a03_auswaertiges/ua_vn",
    "Unterausschuss Krisenprävention, strategische Vorausschau, Stabilisierung und Friedensförderung":
        "https://www.bundestag.de/ausschuesse/a03_auswaertiges/ua_kvsf",
    "Unterausschuss Rüstungs- und Proliferationskontrolle, Nichtverbreitung und internationale Abrüstung":
        "https://www.bundestag.de/ausschuesse/a03_auswaertiges/ua_rna",
    "Unterausschuss Europarecht":
        "https://www.bundestag.de/ausschuesse/recht-verbraucherschutz/europarecht",
    "Unterausschuss Auswärtige Kultur- und Bildungspolitik":
        "https://www.bundestag.de/ausschuesse/a03_auswaertiges/ua_kb",
    "Rechnungsprüfungsausschuss":
        "https://www.bundestag.de/ausschuesse/a08_haushalt/a08_rpa",
    "Bundesfinanzierungsgremium":
        "https://www.bundestag.de/ausschuesse/a08_haushalt/bundesfinanzierungsgremium",
    "Vertrauensgremium":
        "https://www.bundestag.de/ausschuesse/a08_haushalt/vertrauensgremium",
    "Kinderkommission - Kommission zur Wahrnehmung der Belange der Kinder":
        "https://www.bundestag.de/ausschuesse/a13_Bildung-Familie-Senioren-Frauen-und-Jugend/kiko",
    "Unterausschuss zu Fragen der Europäischen Union":
        "https://www.bundestag.de/ausschuesse/a08_haushalt/a08_eu",
}

GREMIEN_RESOLVER = REPO_ROOT / "scripts" / "profil-gremien-resolver.js"

# Erwartete Verteilung der ersten Nachweisetappe (Bundestag/Berlin/Brandenburg).
ERWARTETE_VERTEILUNG = {"bundestag": 330, "landtag-berlin": 120, "landtag-brandenburg": 50}
VERTRAGSVERSION = "helmut-mandatsprofil/1"

# Der am 27.09. aus der Namensauswahl entfernte, wegen AfD-Parteieintritt ohne
# Parteiaustrittsbeleg ausgeschlossene Abgeordnete. Diese Kennung/URL darf in der Zielauswahl nicht auftauchen.
GESPERRT_AMTLICHE_KENNUNG = "schmidt_jan-1047146"
GESPERRT_VOLLNAME = "Schmidt, Jan Wenzel"


class AssemblerFehler(RuntimeError):
    """Bricht den Lauf bei einem belegten Widerspruch ab (fail closed)."""


def _lies_json(pfad: Path):
    with pfad.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _text(fragment: str) -> str:
    ohne_tags = re.sub(r"<[^>]*>", " ", fragment)
    return " ".join(_html.unescape(ohne_tags).split())


def _h1_ueberschriften(dokument: str):
    return [_text(m) for m in re.findall(r"<h1\b[^>]*>(.*?)</h1>", dokument, re.S)]


def _sha256(pfad: Path) -> str:
    h = hashlib.sha256()
    with pfad.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _slug(parlament: str, amtliche_kennung: str) -> str:
    """Stabile Mandatskennung aus Parlament + amtlicher Kennung.

    Regeln identisch zum Importvertrag (``lib/helmut/profil-import.js``):
    Kleinbuchstaben, Ziffern und einzelne Bindestriche, 3 bis 64 Zeichen.
    """
    roh = f"{parlament}-{amtliche_kennung}"
    ascii_form = unicodedata.normalize("NFKD", roh).encode("ascii", "ignore").decode("ascii")
    kleingeschrieben = ascii_form.lower()
    ersetzt = re.sub(r"[^a-z0-9]+", "-", kleingeschrieben).strip("-")
    return re.sub(r"-+", "-", ersetzt)


def _bundesland_aus_liste(beleg: str):
    treffer = re.search(r"Landesliste:\s*(.+)$", beleg)
    return treffer.group(1).strip() if treffer else None


def _bundesland_aus_wahlkreismandat(beleg: str):
    treffer = re.search(r"Wahlkreis\s*\d+:\s*(.+)$", beleg)
    if not treffer:
        return None
    return treffer.group(1).rsplit(", ", 1)[-1].strip()


def _normalisiere_liste(werte):
    ergebnis = []
    for wert in werte or []:
        w = str(wert).strip()
        if w and w not in ergebnis:
            ergebnis.append(w)
    return ergebnis


# ── Amtliches JSON-LD der Bundestags-Detailseite ─────────────────────────────
def _jsonld_member_rollen(detail_html: str) -> list:
    """Mitgliedschaftsrollen aus dem amtlichen ProfilePage-JSON-LD.

    Rueckgabe je Eintrag: ``{"gremium": Name, "url": amtliche URL, "rolle": roleName}``.
    Nur Rollen mit Organisation-Objekt werden uebernommen; die reine
    Bundestagsmitgliedschaft bleibt enthalten und wird vom Aufrufer nicht als
    Gremium behandelt.
    """
    rollen = []
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', detail_html, re.S):
        try:
            daten = json.loads(block)
        except json.JSONDecodeError:
            continue
        for eintrag in (daten if isinstance(daten, list) else [daten]):
            if not isinstance(eintrag, dict):
                continue
            haupt = eintrag.get("mainEntity")
            if not isinstance(haupt, dict):
                continue
            for mitglied in haupt.get("memberOf") or []:
                if not isinstance(mitglied, dict) or mitglied.get("@type") != "Role":
                    continue
                organisation = mitglied.get("memberOf")
                if not isinstance(organisation, dict):
                    continue
                name = str(organisation.get("name") or "").strip()
                if not name:
                    continue
                rollen.append({
                    "gremium": name,
                    "url": str(organisation.get("url") or "").strip(),
                    "rolle": str(mitglied.get("roleName") or "").strip(),
                })
    return rollen


# Zwischenspeicher der Resolver-Antworten (eine Sollmenge, kein zweiter Katalog).
_RESOLVER_CACHE: dict = {}


def _rufe_gremien_resolver(namen):
    """Befragt den vorhandenen Ausschuss-Resolver ueber den Node-Helfer.

    Im Python-Code wird die Sollmenge der staendigen Ausschuesse bewusst nicht
    nachgebildet: es gilt ausschliesslich ``lib/helmut/profile-readiness.js``
    (``resolveBundestagsausschuss``). Fehlt Node oder schlaegt der Aufruf fehl,
    bricht der Lauf fail closed ab.
    """
    node = shutil.which("node")
    if not node:
        raise AssemblerFehler("Node fehlt — der vorhandene Ausschuss-Resolver kann nicht befragt werden.")
    lauf = subprocess.run(
        [node, str(GREMIEN_RESOLVER)],
        input=json.dumps({"gremien": list(namen)}, ensure_ascii=False),
        capture_output=True,
        text=True,
        check=False,
    )
    if lauf.returncode != 0:
        raise AssemblerFehler(f"Ausschuss-Resolver fehlgeschlagen: {lauf.stderr.strip()[:300]}")
    try:
        ergebnis = json.loads(lauf.stdout)
    except json.JSONDecodeError as fehler:
        raise AssemblerFehler(f"Ausschuss-Resolver lieferte kein gueltiges JSON: {fehler}")
    if not isinstance(ergebnis, dict):
        raise AssemblerFehler("Ausschuss-Resolver lieferte ein unerwartetes Format.")
    return ergebnis


def _loese_gremien(namen):
    """Klassifiziert Gremiennamen ueber den vorhandenen Resolver (mit Zwischenspeicher)."""
    gesucht = list(dict.fromkeys(namen))
    offen = [n for n in gesucht if n not in _RESOLVER_CACHE]
    if offen:
        _RESOLVER_CACHE.update(_rufe_gremien_resolver(offen))
    return {n: _RESOLVER_CACHE[n] for n in gesucht if n in _RESOLVER_CACHE}


def _pruefe_gremienliste() -> None:
    """Die explizite Gremienliste muss amtlich belegt und mit dem Resolver widerspruchsfrei sein."""
    ohne_url = sorted(n for n, u in SONSTIGE_GREMIEN.items() if not str(u).startswith("https://"))
    if ohne_url:
        raise AssemblerFehler(f"Sonstige Gremien ohne amtliche https-URL: {ohne_url}")
    ergebnis = _loese_gremien(sorted(SONSTIGE_GREMIEN))
    kollision = sorted(n for n, e in ergebnis.items() if e.get("staendig"))
    if kollision:
        raise AssemblerFehler(
            f"Explizite Gremienliste kollidiert mit dem Ausschuss-Resolver: {kollision}"
        )


def _trenne_sonstige_gremien(detail_html: str, ordentliche: list, stellvertretende: list):
    """Loest belegte sonstige Gremien aus den staendigen Ausschusslisten heraus.

    Fail closed:

    * Ein Name, den der vorhandene Resolver als staendigen Ausschuss aufloest,
      bleibt unveraendert in den Ausschusslisten.
    * Ein Name der expliziten Gremienliste wird nur herausgeloest, wenn das
      amtliche JSON-LD der Original-HTML denselben Namen mit derselben amtlichen
      URL und genau der passenden Mitgliedschaftsrolle traegt.
    * Jeder andere Name bleibt unangetastet in den Ausschusslisten; ein
      unbekannter echter Ausschuss bleibt damit weiter gesperrt.

    Rueckgabe: (ordentliche, stellvertretende, weitereGremien, funktionen, belege)
    """
    kandidaten = [n for n in list(ordentliche) + list(stellvertretende) if n in SONSTIGE_GREMIEN]
    resolver = _loese_gremien(kandidaten)
    rollen = _jsonld_member_rollen(detail_html)
    behalten_ordentlich = []
    behalten_stellvertretend = []
    weitere = []
    funktionen = []
    belege = []
    for feld, werte, behalten, erwartete_rolle in (
        ("ausschuesse", ordentliche, behalten_ordentlich, "Ordentliches Mitglied"),
        ("stellvertretendeAusschuesse", stellvertretende, behalten_stellvertretend, "Stellvertretendes Mitglied"),
    ):
        for wert in werte:
            if wert not in SONSTIGE_GREMIEN:
                behalten.append(wert)
                continue
            if resolver.get(wert, {}).get("staendig"):
                raise AssemblerFehler(
                    f"Gremienliste widerspricht dem Resolver: {wert!r} ist als staendiger Ausschuss aufloesbar."
                )
            url = SONSTIGE_GREMIEN[wert]
            rolle = next(
                (r["rolle"] for r in rollen
                 if r["gremium"] == wert and r["url"] == url and r["rolle"] == erwartete_rolle),
                None,
            )
            if rolle is None:
                raise AssemblerFehler(
                    f"Amtlicher JSON-LD-Beleg fuer sonstiges Gremium fehlt oder weicht ab: {wert!r} ({feld})."
                )
            if wert not in weitere:
                weitere.append(wert)
            eintrag = f"{rolle}: {wert}"
            if eintrag not in funktionen:
                funktionen.append(eintrag)
            belege.append({"gremium": wert, "rolle": rolle, "url": url, "feld": feld})
    return behalten_ordentlich, behalten_stellvertretend, weitere, funktionen, belege


def _pruefe_mandatsarten_bb(eingang, quittung_pfad: Path = MANDATSARTEN_BB) -> dict:
    """Prueft die versionierte Mandatsartenquittung gegen die amtliche Original-HTML.

    Nur die ausdruecklich belegten Profillinks werden uebernommen; die Angabe
    "Landesliste" wird woertlich in der Zeile der amtlichen Uebersicht geprueft.
    Quelldrift (Hash/Groesse, fehlender oder falscher Profillink, fehlendes Wort
    "Landesliste") und eine Fremdkennung ausserhalb der 500 Zielprofile brechen
    den Lauf fail closed ab.
    """
    quittung = _lies_json(quittung_pfad)
    quelle = quittung.get("quelle") or {}
    datei = eingang.verzeichnis / str(quelle.get("datei") or "")
    if not datei.exists():
        raise AssemblerFehler(f"Mandatsartenquelle fehlt lokal: {datei}")
    if _sha256(datei) != quelle.get("sha256") or datei.stat().st_size != quelle.get("bytes"):
        raise AssemblerFehler("Mandatsartenquelle weicht von der versionierten Quittung ab (Hash/Groesse).")
    html = datei.read_text(encoding="utf-8")
    abruf_by_kennung = {
        str(a["amtlicheKennung"]): a
        for a in eingang.abruf
        if a.get("parlament") == "landtag-brandenburg"
    }
    belege = {}
    for eintrag in quittung.get("belege") or []:
        kennung = str(eintrag.get("amtlicheKennung") or "").strip()
        pfad = str(eintrag.get("profilPfad") or "").strip()
        if not kennung or not pfad.endswith(f"/{kennung}"):
            raise AssemblerFehler(f"Mandatsartenquittung: ungueltiger Profillink zu {kennung!r}.")
        abruf = abruf_by_kennung.get(kennung)
        if abruf is None:
            raise AssemblerFehler(f"Mandatsartenquittung: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
        if not str(abruf.get("url", "")).endswith(pfad):
            raise AssemblerFehler(f"Mandatsartenquittung: Profillink weicht von der amtlichen URL ab ({kennung}).")
        zeilen = [
            zeile for zeile in re.findall(r"<tr\b[^>]*>.*?</tr>", html, re.S)
            if f'href="{pfad}"' in zeile and 'class="profile"' in zeile
        ]
        if len(zeilen) != 1:
            raise AssemblerFehler(f"Mandatsartenquelle: Profillink {pfad} nicht eindeutig belegt.")
        zeile_wortlaut = _text(zeilen[0])
        if "Landesliste" not in zeile_wortlaut:
            raise AssemblerFehler(f"Mandatsartenquelle: Wort 'Landesliste' fehlt fuer {kennung}.")
        erwartete_zeile = str(eintrag.get("zeileWortlaut") or "").strip()
        if not erwartete_zeile or zeile_wortlaut != erwartete_zeile:
            raise AssemblerFehler(
                f"Mandatsartenquelle: Zeile weicht von der versionierten Quittung ab ({kennung})."
            )
        belege[kennung] = {
            "datei": MANDATSARTEN_BB_RESSOURCE,
            "url": quelle.get("url"),
            "abgerufenAm": quelle.get("abgerufenAm"),
            "sha256": quelle.get("sha256"),
            "profilPfad": pfad,
            "zeileWortlaut": zeile_wortlaut,
        }
    if not belege:
        raise AssemblerFehler("Mandatsartenquittung enthaelt keinen Beleg.")
    return belege


# ── Versionierte Berliner Mandatsartenquittung (fail closed, kein PDF-Parser) ─
def _be_h2_abschnitte(dokument: str):
    """Zerlegt die aktuelle Wahlkreissuche in (H2-Text, Restabschnitt)-Paare."""
    teile = re.split(r"(<h2\b[^>]*>.*?</h2>)", dokument, flags=re.S)
    abschnitte = []
    for i in range(1, len(teile), 2):
        rest = teile[i + 1] if i + 1 < len(teile) else ""
        abschnitte.append((_text(teile[i]), rest))
    return abschnitte


def _be_abschnittsanker(dokument: str, bindung: dict) -> str:
    """Exakter, abschnittsgebundener Personlink — niemals ein globales Wortvorkommen.

    Fail closed: fehlender/doppelter H2-Abschnitt, fehlender/doppelter H3-Unterabschnitt
    oder ein nicht genau einmal vorhandener Personlink im Unterabschnitt sperren den Lauf.
    """
    oberabschnitt = str(bindung.get("oberabschnitt") or "").strip()
    unterabschnitt = str(bindung.get("unterabschnitt") or "").strip()
    href = str(bindung.get("href") or "").strip()
    if not oberabschnitt or not unterabschnitt or not href:
        raise AssemblerFehler("Berliner Mandatsartenquittung: unvollstaendige Abschnittsbindung.")
    rest_liste = [rest for text, rest in _be_h2_abschnitte(dokument) if text == oberabschnitt]
    if len(rest_liste) != 1:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung: H2-Abschnitt {oberabschnitt!r} nicht eindeutig belegt."
        )
    h3_teile = re.split(r"(<h3\b[^>]*>.*?</h3>)", rest_liste[0], flags=re.S)
    unter_rest = None
    for i in range(1, len(h3_teile), 2):
        if _text(h3_teile[i]) == unterabschnitt:
            if unter_rest is not None:
                raise AssemblerFehler(
                    f"Berliner Mandatsartenquittung: H3-Unterabschnitt {unterabschnitt!r} ist doppelt."
                )
            unter_rest = h3_teile[i + 1] if i + 1 < len(h3_teile) else ""
    if unter_rest is None:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung: H3-Unterabschnitt {unterabschnitt!r} fehlt im H2-Abschnitt."
        )
    anker = [
        _text(m.group(2))
        for m in re.finditer(r'<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>', unter_rest, re.S)
        if m.group(1) == href
    ]
    if len(anker) != 1:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung: Personlink {href!r} nicht genau einmal im Abschnitt belegt."
        )
    return anker[0]


def _be_profilblock(detail_html: str) -> str:
    treffer = re.search(r'<dl\b[^>]*class="b-delegate-facts"[^>]*>(.*?)</dl>', detail_html, re.S)
    if not treffer:
        raise AssemblerFehler("Berliner Mandatsartenquittung: kein gebundener Profilblock (b-delegate-facts).")
    return _text(treffer.group(1))


def _be_nachrueckdatum(wortlaut: str) -> str:
    treffer = re.search(r"Nachgerückt am (\d{2})\.(\d{2})\.(\d{4})", wortlaut)
    if not treffer:
        raise AssemblerFehler("Berliner Mandatsartenquittung: kein Nachrueckdatum im Profilblock.")
    return f"{treffer.group(3)}-{treffer.group(2)}-{treffer.group(1)}"


def _be_zusatzquelle(eingang, erwartet: dict, bezeichnung: str) -> dict:
    """Prueft eine lokale Zusatzquelle (PDF/Wahlkreissuche) gegen Quittung UND Metadaten-JSON."""
    datei_name = str(erwartet.get("datei") or erwartet.get("quelleDatei") or "").strip()
    if not datei_name or Path(datei_name).name != datei_name:
        raise AssemblerFehler(f"Berliner Mandatsartenquittung: ungueltiger Dateiname ({bezeichnung}).")
    pfad = eingang.verzeichnis / ZUSATZQUELLEN / datei_name
    if not pfad.is_file():
        raise AssemblerFehler(f"Berliner Mandatsartenquittung: Zusatzquelle fehlt lokal: {datei_name!r}.")
    sha = erwartet.get("sha256") or erwartet.get("quelleSha256")
    groesse = erwartet.get("bytes") or erwartet.get("quelleBytes")
    if _sha256(pfad) != sha or pfad.stat().st_size != groesse:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung: Zusatzquelle weicht von der versionierten Quittung ab ({datei_name})."
        )
    meta_pfad = pfad.with_suffix(".json")
    if not meta_pfad.is_file():
        raise AssemblerFehler(f"Berliner Mandatsartenquittung: Quellmeta JSON fehlt: {meta_pfad.name!r}.")
    meta = _lies_json(meta_pfad)
    for feld, wert in (
        ("url", erwartet.get("url") or erwartet.get("quelleUrl")),
        ("finalUrl", erwartet.get("finalUrl")),
        ("abgerufenAm", erwartet.get("abgerufenAm")),
        ("http", erwartet.get("http")),
        ("sha256", sha),
        ("bytes", groesse),
        ("datei", datei_name),
    ):
        if wert is None:
            continue
        if feld == "bytes":
            if int(meta.get("bytes") or -1) != int(wert):
                raise AssemblerFehler(f"Berliner Mandatsartenquittung: Quellmeta {feld} weicht ab ({datei_name}).")
        elif str(meta.get(feld) or "") != str(wert):
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Quellmeta {feld} weicht ab ({datei_name}).")
    return {"datei": datei_name, "sha256": sha, "bytes": groesse, "meta": meta}


def _pruefe_mandatsarten_be(eingang, quittung_pfad: Path = MANDATSARTEN_BE, erwartung: dict = None) -> dict:
    """Prueft die versionierte Berliner Mandatsartenquittung fail closed.

    Bindet das am Original visuell abgenommene Handbuch-PDF an URL/Hash/Bytezahl/Abruf,
    Stand, Seite 204 und linke Spalte, prueft die woertliche Transkription sowie Person,
    exaktes Nachrueckdatum und Profilhash am gebundenen aktuellen Profilblock und — fuer
    Martin — den exakten H2/H3/Personlink-Abschnitt der aktuellen Wahlkreissuche. Nur die
    zwei genehmigten Personen sind zulaessig; Duplikate, Fremdperson, falsches Datum,
    vertauschtes Paket, Quelldrift und ein bereits geschlossenes Mandat sperren.
    """
    erwartung = MANDATSARTEN_BE_ERWARTUNG if erwartung is None else erwartung
    quittung = _lies_json(quittung_pfad)
    quelle = quittung.get("quelle") or {}
    for feld, wert in erwartung["quelle"].items():
        if quelle.get(feld) != wert:
            raise AssemblerFehler(
                f"Berliner Mandatsartenquittung: PDF-/Quittungsfeld {feld!r} weicht vom genehmigten "
                "Fachurteil ab (Stand/Seite/Spalte/Beleg)."
            )
    _be_zusatzquelle(eingang, erwartung["quelle"], "Handbuch-PDF")

    genehmigt = erwartung["belege"]
    abruf_by_kennung = {
        str(a.get("amtlicheKennung")): a
        for a in eingang.abruf
        if a.get("parlament") == "landtag-berlin"
    }
    belege = {}
    for eintrag in quittung.get("belege") or []:
        kennung = str(eintrag.get("amtlicheKennung") or "").strip()
        if not kennung or kennung not in genehmigt:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Fremdkennung {kennung!r}.")
        if kennung in belege:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: doppelte Kennung {kennung!r}.")
        soll = genehmigt[kennung]
        for feld, wert in soll.items():
            if eintrag.get(feld) != wert:
                raise AssemblerFehler(
                    f"Berliner Mandatsartenquittung: Feld {feld!r} weicht vom genehmigten Fachurteil ab ({kennung})."
                )
        abruf = abruf_by_kennung.get(kennung)
        if abruf is None or abruf.get("url") != eintrag["profilUrl"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Fremdperson/-URL bei {kennung}.")
        if abruf.get("sha256") != eintrag["profilSha256"] or abruf.get("bytes") != eintrag["profilBytes"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Profilquellhash weicht ab ({kennung}).")
        profil_datei = eingang.detailseiten / eintrag["profilDatei"]
        if not profil_datei.is_file():
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Profilquelle fehlt lokal ({kennung}).")
        if _sha256(profil_datei) != eintrag["profilSha256"] or profil_datei.stat().st_size != eintrag["profilBytes"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Profilquelle weicht von der Quittung ab ({kennung}).")
        detail_html = profil_datei.read_text(encoding="utf-8")
        h1_liste = _h1_ueberschriften(detail_html)
        if len(h1_liste) != 1:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: keine eindeutige h1 ({kennung}).")
        amtlicher_name = h1_liste[0].rsplit(", ", 1)[0] if ", " in h1_liste[0] else h1_liste[0]
        if amtlicher_name != eintrag["vollname"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Fremdperson im Profil ({kennung}).")
        block = _be_profilblock(detail_html)
        if block != eintrag["profilblockWortlaut"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Profilblock weicht ab ({kennung}).")
        if _be_nachrueckdatum(block) != eintrag["nachgeruecktAm"]:
            raise AssemblerFehler(f"Berliner Mandatsartenquittung: Nachrueckdatum weicht ab ({kennung}).")

        abschnitt = eintrag.get("aktuelleAbschnittsbindung")
        if abschnitt:
            _be_zusatzquelle(eingang, abschnitt, f"Wahlkreissuche {kennung}")
            wahlkreis_datei = (eingang.verzeichnis / ZUSATZQUELLEN / abschnitt["quelleDatei"]).read_text(encoding="utf-8")
            link_text = _be_abschnittsanker(wahlkreis_datei, abschnitt)
            if link_text != abschnitt["linkText"]:
                raise AssemblerFehler(
                    f"Berliner Mandatsartenquittung: Personlink-Text weicht ab ({kennung})."
                )
        belege[kennung] = {
            "kennung": eintrag["kennung"],
            "amtlicheKennung": kennung,
            "profilUrl": eintrag["profilUrl"],
            "profilSha256": eintrag["profilSha256"],
            "profilBytes": eintrag["profilBytes"],
            "vollname": eintrag["vollname"],
            "nachgeruecktAm": eintrag["nachgeruecktAm"],
            "profilblockWortlaut": block,
            "mandatsart": eintrag["mandatsart"],
            "regionHinweis": eintrag["regionHinweis"],
            "seite": eintrag["seite"],
            "spalte": eintrag["spalte"],
            "zitat": eintrag["zitat"],
            "url": quelle.get("url"),
            "sha256": quelle.get("sha256"),
            "abgerufenAm": quelle.get("abgerufenAm"),
            "quellstand": quelle["stand"],
            "pdfSeiteIndex": quelle["pdfSeiteIndex"],
            "aktuelleAbschnittsbindung": abschnitt,
        }
    if set(belege) != set(genehmigt) or len(belege) != MANDATSARTEN_BE_GESAMT:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung: erwartet genau die {MANDATSARTEN_BE_GESAMT} genehmigten Personen."
        )
    return belege


# ── Versionierte Rollenquittung der 54 fachlich offenen Profile (fail closed) ─
def _rollen_div(detail_html: str, klasse: str) -> str:
    """Genau einen vollstaendig geschlossenen Personenblock lesen, nie den Footer."""
    class Block(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.tiefe = 0
            self.bloecke = []
            self.teile = []

        def handle_starttag(self, tag, attrs):
            if tag == "div":
                if self.tiefe:
                    self.tiefe += 1
                elif klasse in dict(attrs).get("class", "").split():
                    self.tiefe = 1
                    self.teile = []

        def handle_endtag(self, tag):
            if tag == "div" and self.tiefe:
                self.tiefe -= 1
                if not self.tiefe:
                    self.bloecke.append(" ".join(self.teile))

        def handle_data(self, data):
            if self.tiefe:
                self.teile.append(_html.escape(data))

    parser = Block()
    parser.feed(detail_html)
    parser.close()
    if parser.tiefe or len(parser.bloecke) != 1:
        raise AssemblerFehler(f"Profilrollen: Personenblock {klasse!r} fehlt, ist doppelt oder unvollstaendig.")
    return parser.bloecke[0]


def _rollen_abschnitt(parlament: str, detail_html: str, abschnitt: str) -> str:
    """Personengebundener HTML-Abschnitt fuer den Wortlaut-/Zitatbeleg.

    Bundestag: ``Funktion`` ausschliesslich aus dem eigenen
    ``m-biography__function``-Block, ``Biografie`` ausschliesslich aus dem
    eigenen ``m-biography__biography``-Block. Navigation, Intro-/Fraktionskopf
    und JSON-LD gelten NICHT als Beleg. Landesprofile werden auf den jeweils
    vorhandenen personengebundenen Abschnitt begrenzt (Berlin: Profilkopf,
    Biografie oder Verhaltensregeln-Abschnitt; Brandenburg: Politische
    Laufbahn). Ist der Abschnitt nicht eindeutig auffindbar, bricht der Lauf
    fail closed ab.
    """
    if parlament == "bundestag":
        marker = {
            "Funktion": "m-biography__function",
            "Biografie": "m-biography__biography",
        }.get(abschnitt)
        if marker is None:
            raise AssemblerFehler(f"Profilrollen: unbekannter Bundestagsabschnitt {abschnitt!r}.")
        return _rollen_div(detail_html, marker)
    if parlament == "landtag-berlin":
        if abschnitt.startswith("Profilkopf"):
            start = detail_html.find('class="b-text-image')
            ende = detail_html.find("</dl>", start)
            if start < 0 or ende < 0:
                raise AssemblerFehler("Profilrollen: Berliner Profilkopf nicht eindeutig auffindbar.")
            return detail_html[start:ende]
        if abschnitt.startswith("Biografie"):
            kopf = detail_html.find('class="b-text-image')
            kopf_ende = detail_html.find("</dl>", kopf)
            start = detail_html.find('class="b-text', kopf_ende)
            ende = detail_html.find("<section", start)
            if kopf_ende < 0 or start < 0 or ende < 0:
                raise AssemblerFehler("Profilrollen: Berliner Biografieabschnitt nicht eindeutig auffindbar.")
            return detail_html[start:ende]
        if abschnitt.startswith("Angaben zu den Verhaltensregeln"):
            start = detail_html.find("Angaben zu den Verhaltensregeln")
            ende = detail_html.find("</section>", start)
            if start < 0 or ende < 0:
                raise AssemblerFehler("Profilrollen: Verhaltensregeln-Abschnitt nicht eindeutig auffindbar.")
            return detail_html[start:ende]
        raise AssemblerFehler(f"Profilrollen: unbekannter Berliner Abschnitt {abschnitt!r}.")
    if parlament == "landtag-brandenburg":
        if abschnitt == "Politische Laufbahn":
            start = detail_html.find("Politische Laufbahn")
            if start < 0:
                raise AssemblerFehler("Profilrollen: Abschnitt 'Politische Laufbahn' fehlt.")
            naechster = detail_html.find("<h2", start + len("Politische Laufbahn"))
            if naechster < 0:
                raise AssemblerFehler("Profilrollen: Ende der politischen Laufbahn fehlt.")
            return detail_html[start:naechster]
        raise AssemblerFehler(f"Profilrollen: unbekannter Brandenburger Abschnitt {abschnitt!r}.")
    raise AssemblerFehler(f"Profilrollen: unbekanntes Parlament {parlament!r}.")


def _pruefe_rolleneintrag(kennung: str, ergebnis: dict, abruf: dict, detail_html: str) -> str:
    """Prueft einen einzelnen Rolleneintrag gegen die amtliche Original-HTML.

    Fail closed bei unerwartetem Status, offenem Eintrag mit Rolle, belegtem
    Eintrag ohne Rolle, Quelldrift (URL/Hash), fehlendem Abschnitt, erfundenem
    Wortlaut (``wortlaut`` nicht durch das ``zitat`` gedeckt) und einem Zitat,
    das nicht woertlich im personengebundenen amtlichen Abschnitt steht.
    Rueckgabe: der validierte Status (``belegt``/``offen``).
    """
    status = ergebnis.get("status")
    if status not in PROFILROLLEN_STATUS:
        raise AssemblerFehler(f"Profilrollenquittung: unerwarteter Status {status!r} bei {kennung}.")
    funktionen = ergebnis.get("funktionen")
    if not isinstance(funktionen, list):
        raise AssemblerFehler(f"Profilrollenquittung: funktionen fehlt bei {kennung}.")
    quelle = ergebnis.get("quelle") or {}
    if quelle.get("url") != abruf["url"]:
        raise AssemblerFehler(f"Profilrollenquittung: abweichende Quell-URL bei {kennung}.")
    if quelle.get("sha256") != abruf["sha256"]:
        raise AssemblerFehler(f"Profilrollenquittung: abweichender Quellhash bei {kennung}.")
    if status == "offen":
        # Ein offener Eintrag darf KEINE Rolle tragen — sonst waere der Status
        # widerspruechlich (offen, aber doch eine Rolle).
        if funktionen:
            raise AssemblerFehler(f"Profilrollenquittung: offener Eintrag mit Rolle bei {kennung}.")
        return status
    if not funktionen:
        raise AssemblerFehler(f"Profilrollenquittung: Status belegt ohne Rolle bei {kennung}.")
    for funktion in funktionen:
        wortlaut = str(funktion.get("wortlaut") or "").strip()
        zitat = str(funktion.get("zitat") or "").strip()
        abschnitt = str(funktion.get("abschnitt") or "").strip()
        if not wortlaut or not zitat or not abschnitt:
            raise AssemblerFehler(
                f"Profilrollenquittung: unvollstaendige Rolle (wortlaut/zitat/abschnitt) bei {kennung}."
            )
        if _zitat_normalisiert(wortlaut) not in _zitat_normalisiert(zitat):
            raise AssemblerFehler(
                f"Profilrollenquittung: Wortlaut nicht durch das Zitat gedeckt (erfunden) bei {kennung}."
            )
        bereich = _text(_rollen_abschnitt(abruf["parlament"], detail_html, abschnitt))
        if _zitat_normalisiert(zitat) not in _zitat_normalisiert(bereich):
            raise AssemblerFehler(
                f"Profilrollenquittung: Zitat nicht woertlich im Abschnitt {abschnitt!r} belegt ({kennung})."
            )
    return status


def _pruefe_profilrollen(eingang, quittung=None) -> dict:
    """Prueft die versionierte Rollenquittung und indexiert sie je Kennung.

    Nur die dort freigegebenen ``wortlaut``-Strings werden spaeter an bestehende
    ``profil.funktionen`` dedupliziert ANGEHAENGT. Fail closed bei fehlender
    Quittung, falscher Bilanz, fehlender/doppelter Kennung, Fremdkennung
    ausserhalb der 500 Zielprofile und jedem ungueltigen Einzeleintrag
    (siehe ``_pruefe_rolleneintrag``).
    """
    quittung = getattr(eingang, "profilrollen", None) if quittung is None else quittung
    if not isinstance(quittung, dict):
        raise AssemblerFehler(f"Profilrollenquittung fehlt: {PROFILROLLEN_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != PROFILROLLEN_GESAMT:
        raise AssemblerFehler(
            f"Profilrollenquittung: erwartet {PROFILROLLEN_GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("rollenbelegt"), bilanz.get("offen")) != (
        PROFILROLLEN_GESAMT, PROFILROLLEN_BELEGT, PROFILROLLEN_OFFEN
    ):
        raise AssemblerFehler(f"Profilrollenquittung: unerwartete Bilanz {bilanz!r}.")

    kennung_zu_abruf = {}
    for eintrag in eingang.auswahl["auswahl"]:
        abruf = eingang.abruf_by_url[eintrag["url"]]
        kennung_zu_abruf[_slug(eintrag["parlament"], abruf["amtlicheKennung"])] = abruf
    if len(kennung_zu_abruf) != len(eingang.auswahl["auswahl"]):
        raise AssemblerFehler("Kanonische Kennungen der 500 Zielprofile sind nicht eindeutig.")
    eingang.kennung_zu_abruf = kennung_zu_abruf

    index = {}
    belegt = 0
    offen = 0
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise AssemblerFehler("Profilrollenquittung: Eintrag ohne Kennung.")
        if kennung in index:
            raise AssemblerFehler(f"Profilrollenquittung: doppelte Kennung {kennung}.")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise AssemblerFehler(
                f"Profilrollenquittung: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen."
            )
        detail_html = (eingang.detailseiten / abruf["datei"]).read_text(encoding="utf-8")
        status = _pruefe_rolleneintrag(kennung, ergebnis, abruf, detail_html)
        if status == "offen":
            offen += 1
        else:
            belegt += 1
        index[kennung] = ergebnis
    if (belegt, offen) != (PROFILROLLEN_BELEGT, PROFILROLLEN_OFFEN):
        raise AssemblerFehler(
            f"Profilrollenquittung: erwartet {PROFILROLLEN_BELEGT} belegt / {PROFILROLLEN_OFFEN} offen, "
            f"gefunden {belegt} / {offen}."
        )
    eingang.profilrollen_by_kennung = index
    eingang.profilrollen_verwendet = set()
    return index


# ── Versionierte Ressortquittung der 19 geschlossenen Fachachsen (fail closed) ─
def _ressort_tokens(wert: str) -> list:
    """Lexikalische Tokens eines Ressort-/Zitattextes (klein, ohne Interpunktion)."""
    roh = unicodedata.normalize("NFC", _text(wert)).lower()
    return re.findall(r"\w+", roh, flags=re.UNICODE)


def _ressort_in_zitat(ressort: str, zitat: str) -> bool:
    """Prueft lexikalisch, dass das Ressort im Zitat steht (keine Semantik).

    Erlaubt ist ausschliesslich: (a) die beiden amtlichen Namensfuegeworte
    ``und``/``für`` muessen im Zitat nicht an derselben Stelle stehen (amtliche
    Langnamen fuegen sie ein), und (b) die eine enge lexikalische Ausnahme
    ``Inneres`` (Kurzform) <-> ``Innern`` (amtliche Langform). Alle uebrigen
    Ressortwoerter muessen in Reihenfolge woertlich im Zitat vorkommen; keine
    Alias-, Kuerzel- oder Fuzzy-Erweiterung.
    """
    ressort_tokens = [t for t in _ressort_tokens(ressort) if t not in RESSORTAKSEN_VERBINDER]
    zitat_tokens = _ressort_tokens(zitat)
    if not ressort_tokens:
        return False
    position = 0
    for token in ressort_tokens:
        varianten = {token}
        if token in RESSORTAKSEN_LEXIK:
            varianten.add(RESSORTAKSEN_LEXIK[token])
        treffer = None
        for index in range(position, len(zitat_tokens)):
            if zitat_tokens[index] in varianten:
                treffer = index
                break
        if treffer is None:
            return False
        position = treffer + 1
    return True


def _quellenhost(url) -> str:
    """Hostname einer URL ohne fuehrendes ``www.`` (leer bei ungueltiger URL)."""
    treffer = re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://([^/?#]+)", str(url or ""))
    if not treffer:
        return ""
    return re.sub(r"^www\.", "", treffer.group(1).lower())


def _pruefe_ressortachsen(eingang) -> dict:
    """Prueft die versionierte Ressortquittung der 19 Fachachsen (fail closed).

    Erzwungen wird: exakt 19 eindeutige kanonische Kennungen (9 Bund / 4 Berlin /
    6 Brandenburg), jede Kennung eine der 54 belegten Rollenquittungsprofile mit
    passender bestehender Amtsrolle, Rollenquelle deckungsgleich mit der 54er
    Quittung, Status ``belegt``, Region/Parlament konsistent, amtliche
    Zusatzquelle an URL/Hash/Abrufzeit/Datei gebunden, ein zusammenhaengendes
    woertliches Zitat mit Person UND Ressort, ausdrueckliche Ressortbegriffe sowie ein separater Ableitungshinweis. Jede Abweichung (Quelldrift,
    fremde/unbekannte Kennung, Doppelung, fehlende Quittung, erfundenes Thema,
    Kanzler-/Vorsitzrolle, Fehlen einer Zusatzquelle) bricht den Lauf ab.
    """
    quittung = getattr(eingang, "ressortachsen", None)
    if not isinstance(quittung, dict):
        raise AssemblerFehler(f"Ressortquittung fehlt: {RESSORTAKSEN_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != RESSORTAKSEN_GESAMT:
        raise AssemblerFehler(
            f"Ressortquittung: erwartet {RESSORTAKSEN_GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (
        bilanz.get("gesamt"),
        bilanz.get("Bund"),
        bilanz.get("Berlin"),
        bilanz.get("Brandenburg"),
    ) != (
        RESSORTAKSEN_GESAMT,
        RESSORTAKSEN_REGIONEN["Bund"],
        RESSORTAKSEN_REGIONEN["Berlin"],
        RESSORTAKSEN_REGIONEN["Brandenburg"],
    ):
        raise AssemblerFehler(f"Ressortquittung: unerwartete Bilanz {bilanz!r}.")

    profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None)
    if not kennung_zu_abruf:
        kennung_zu_abruf = {
            _slug(eintrag["parlament"], eingang.abruf_by_url[eintrag["url"]]["amtlicheKennung"]): eingang.abruf_by_url[eintrag["url"]]
            for eintrag in eingang.auswahl["auswahl"]
        }
    zusatz = eingang.verzeichnis / ZUSATZQUELLEN

    index = {}
    region_zaehler = {"Bund": 0, "Berlin": 0, "Brandenburg": 0}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise AssemblerFehler("Ressortquittung: Eintrag ohne Kennung.")
        if kennung in index:
            raise AssemblerFehler(f"Ressortquittung: doppelte Kennung {kennung}.")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise AssemblerFehler(f"Ressortquittung: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
        rollen_eintrag = profilrollen.get(kennung)
        if rollen_eintrag is None:
            raise AssemblerFehler(f"Ressortquittung: Kennung {kennung} ist keine der 54 offenen Fachachsen.")
        if str(rollen_eintrag.get("status")) != "belegt":
            raise AssemblerFehler(f"Ressortquittung: Rollenquittung zu {kennung} ist nicht belegt.")

        region = str(ergebnis.get("region") or "").strip()
        if region not in RESSORTAKSEN_REGIONEN:
            raise AssemblerFehler(f"Ressortquittung: unbekannte Region {region!r} bei {kennung}.")
        if RESSORTAKSEN_REGION_PARLAMENT[region] != abruf.get("parlament"):
            raise AssemblerFehler(
                f"Ressortquittung: Region {region!r} passt nicht zum Parlament "
                f"{abruf.get('parlament')!r} ({kennung})."
            )
        status = str(ergebnis.get("status") or "").strip()
        if status not in RESSORTAKSEN_STATUS:
            raise AssemblerFehler(f"Ressortquittung: unerwarteter Status {status!r} bei {kennung}.")

        # Rollenquelle muss zur bestehenden 54er Rollenquittung passen.
        rollen_quelle = ergebnis.get("rollenquelle") or {}
        rollen_ref = rollen_eintrag.get("quelle") or {}
        if rollen_quelle.get("url") != rollen_ref.get("url") or rollen_quelle.get("sha256") != rollen_ref.get("sha256"):
            raise AssemblerFehler(f"Ressortquittung: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")

        # Amtsrolle muss eine bestehende belegte Rolle sein, ein echtes Ressort
        # tragen und darf kein Kanzler-/Vorsitzamt sein.
        amtsrolle = str(ergebnis.get("amtsrolle") or "").strip()
        wortlaute = {str(f.get("wortlaut") or "").strip() for f in (rollen_eintrag.get("funktionen") or [])}
        if not amtsrolle or amtsrolle not in wortlaute:
            raise AssemblerFehler(f"Ressortquittung: Amtsrolle {amtsrolle!r} ist keine belegte Rolle bei {kennung}.")
        rolle_norm = amtsrolle.lower()
        if any(verboten in rolle_norm for verboten in RESSORTAKSEN_ROLLEN_VERBOTEN):
            raise AssemblerFehler(f"Ressortquittung: Kanzler-/Vorsitzrolle traegt kein Ressort ({kennung}).")
        if not re.search(r"\b(?:bundesminister(?:in)?|minister(?:in)?|senator(?:in)?)\s+(?:für|der|des)\b", rolle_norm):
            raise AssemblerFehler(f"Ressortquittung: Amtsrolle {amtsrolle!r} traegt kein Ressort ({kennung}).")

        # Amtliche Zusatzquelle: URL/Hash/Abrufzeit/Datei gegen Datei UND Metadaten.
        quelle = ergebnis.get("quelle") or {}
        datei_name = str(quelle.get("datei") or "").strip()
        if Path(datei_name).name != datei_name or not datei_name.endswith(".html"):
            raise AssemblerFehler(f"Ressortquittung: ungueltiger Zusatzquellen-Dateiname ({kennung}).")
        quelle_datei = zusatz / datei_name
        if not datei_name or not quelle_datei.is_file():
            raise AssemblerFehler(f"Ressortquittung: Zusatzquelle fehlt lokal: {datei_name!r}.")
        meta_pfad = quelle_datei.with_suffix(".json")
        if not meta_pfad.is_file():
            raise AssemblerFehler(f"Ressortquittung: Zusatzquellen-Metadaten fehlen: {meta_pfad.name!r}.")
        meta = _lies_json(meta_pfad)
        for feld in ("url", "finalUrl", "abgerufenAm", "sha256"):
            if str(meta.get(feld) or "") != str(quelle.get(feld) or ""):
                raise AssemblerFehler(f"Ressortquittung: Zusatzquellen-Metadatum {feld} weicht ab ({kennung}).")
        if str(meta.get("datei") or "") != datei_name:
            raise AssemblerFehler(f"Ressortquittung: Zusatzquellen-Dateiname weicht ab ({kennung}).")
        if _sha256(quelle_datei) != str(quelle.get("sha256") or ""):
            raise AssemblerFehler(f"Ressortquittung: Zusatzquellen-Hash weicht ab ({kennung}).")
        if int(meta.get("bytes") or -1) != quelle_datei.stat().st_size:
            raise AssemblerFehler(f"Ressortquittung: Zusatzquellen-Bytezahl weicht ab ({kennung}).")
        if _quellenhost(quelle.get("url")) != RESSORTAKSEN_QUELLHOST[region]:
            raise AssemblerFehler(
                f"Ressortquittung: unerwarteter Quellhost {_quellenhost(quelle.get('url'))!r} "
                f"fuer Region {region} ({kennung})."
            )

        # Zusammenhaengendes Zitat: woertlich in der Quelle UND zugleich Person/Ressort.
        zitat = str(ergebnis.get("zitat") or "").strip()
        quell_text = _text(quelle_datei.read_text(encoding="utf-8"))
        if not zitat or _zitat_normalisiert(zitat) not in _zitat_normalisiert(quell_text):
            raise AssemblerFehler(f"Ressortquittung: Zitat nicht woertlich in der Zusatzquelle ({kennung}).")
        detail_html = (eingang.detailseiten / abruf["datei"]).read_text(encoding="utf-8")
        h1_liste = _h1_ueberschriften(detail_html)
        if len(h1_liste) != 1:
            raise AssemblerFehler(f"Ressortquittung: keine eindeutige h1 fuer {kennung}.")
        amtlicher_name = h1_liste[0].rsplit(", ", 1)[0] if abruf.get("parlament") == "landtag-berlin" and ", " in h1_liste[0] else h1_liste[0]
        if _zitat_normalisiert(amtlicher_name) not in _zitat_normalisiert(zitat):
            raise AssemblerFehler(f"Ressortquittung: Person {amtlicher_name!r} fehlt im Zitat ({kennung}).")
        ressort = str(ergebnis.get("ressort") or "").strip()
        if not ressort or not _ressort_in_zitat(ressort, zitat) or not _ressort_in_zitat(ressort, amtsrolle):
            raise AssemblerFehler(f"Ressortquittung: Ressort {ressort!r} steht nicht im Zitat ({kennung}).")

        # Ressortbegriffe und getrennter Herkunftshinweis, keine neuen Themen.
        erwarteter_hinweis = RESSORTAKSEN_THEMA.format(region=region, ressort=ressort) + "; keine persönliche politische Position"
        themen = ergebnis.get("themen")
        if themen != _ressort_themen(ressort) or ergebnis.get("ableitungsHinweis") != erwarteter_hinweis:
            raise AssemblerFehler(
                f"Ressortquittung: Themenwortlaut weicht vom freigegebenen Muster ab ({kennung})."
            )

        region_zaehler[region] += 1
        index[kennung] = {
            "kennung": kennung,
            "region": region,
            "parlament": abruf.get("parlament"),
            "status": status,
            "amtsrolle": amtsrolle,
            "ressort": ressort,
            "zitat": zitat,
            "themen": list(themen),
            "ableitungsHinweis": erwarteter_hinweis,
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
        }

    if region_zaehler != RESSORTAKSEN_REGIONEN:
        raise AssemblerFehler(f"Ressortquittung: unerwartete Regionenbilanz {region_zaehler!r}.")
    eingang.ressortachsen_by_kennung = index
    eingang.ressortachsen_verwendet = set()
    return index


# ── Eingang laden und binden ──────────────────────────────────────────────────
class Eingang:
    def __init__(self, verzeichnis: Path):
        self.verzeichnis = verzeichnis
        self.detailseiten = verzeichnis / DETAILSEITEN
        self.auswahl = _lies_json(NAMENSAUSWahl)
        self.brandenburg_partei = _lies_json(BRANDENBURG_PARTEI)
        self.parteifeldpruefung = _lies_json(PARTEIFELDPRUEFUNG)
        try:
            self.profilrollen = _lies_json(PROFILROLLEN)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Profilrollenquittung fehlt: {PROFILROLLEN_RESSOURCE}") from fehler
        try:
            self.ressortachsen = _lies_json(RESSORTAKSEN)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Ressortquittung fehlt: {RESSORTAKSEN_RESSOURCE}") from fehler
        try:
            self.aufgabenachsen = _lies_json(AUFGABENACHSEN)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Aufgabenquittung fehlt: {AUFGABENACHSEN_RESSOURCE}") from fehler
        try:
            self.beratendeachsen = _lies_json(BERATENDEACHSEN)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Beratende Achsenquittung fehlt: {BERATENDEACHSEN_RESSOURCE}") from fehler
        try:
            self.amthor = _lies_json(AMTHOR)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Amthor-Einzelfallquittung fehlt: {AMTHOR_RESSOURCE}") from fehler
        try:
            self.wahlausschuss = _lies_json(WAHLAUSSCHUSS)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Wahlausschuss-Aufgabenquittung fehlt: {WAHLAUSSCHUSS_RESSOURCE}") from fehler
        try:
            self.fraktionsvorsitz = _lies_json(FRAKTIONSVORSITZ)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Fraktionsvorsitz-Zweierquittung fehlt: {FRAKTIONSVORSITZ_RESSOURCE}") from fehler
        try:
            self.jarzombek = _lies_json(JARZOMBEK)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Jarzombek-Einzelfallquittung fehlt: {JARZOMBEK_RESSOURCE}") from fehler
        try:
            self.kloeckner = _lies_json(KLOECKNER)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Kloeckner-Einzelfallquittung fehlt: {KLOECKNER_RESSOURCE}") from fehler
        try:
            self.rohde = _lies_json(ROHDE)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Rohde-Einzelfallquittung fehlt: {ROHDE_RESSOURCE}") from fehler
        try:
            self.pistorius = _lies_json(PISTORIUS)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Pistorius-Parteizusatzquittung fehlt: {PISTORIUS_RESSOURCE}") from fehler
        try:
            self.parteizusatz = _lies_json(PARTEIZUSATZ)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Parteizusatzquittung fehlt: {PARTEIZUSATZ_RESSOURCE}") from fehler
        try:
            self.merz = _lies_json(MERZ)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Merz-Einzelfallquittung fehlt: {MERZ_RESSOURCE}") from fehler
        try:
            self.woidke = _lies_json(WOIDKE)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Woidke-Einzelfallquittung fehlt: {WOIDKE_RESSOURCE}") from fehler
        try:
            self.wegner = _lies_json(WEGNER)
        except FileNotFoundError as fehler:
            raise AssemblerFehler(f"Wegner-Einzelfallquittung fehlt: {WEGNER_RESSOURCE}") from fehler
        self.abruf = _lies_json(verzeichnis / ABRUF_BUNDESTAG) + _lies_json(
            verzeichnis / ABRUF_LANDESPARLAMENTE
        )
        self.extraktion = _lies_json(verzeichnis / EXTRAKTION_BUNDESTAG) + _lies_json(
            verzeichnis / EXTRAKTION_LANDESPARLAMENTE
        )
        self.auswahl_by_url = {eintrag["url"]: eintrag for eintrag in self.auswahl["auswahl"]}
        self.abruf_by_url = {eintrag["url"]: eintrag for eintrag in self.abruf}
        self.extraktion_by_url = {eintrag["quelle"]["url"]: eintrag for eintrag in self.extraktion}
        self.partei_by_url = {eintrag["url"]: eintrag for eintrag in self.brandenburg_partei["ergebnisse"]}
        # Versionierte Mandatsartenquittung fuer vier Brandenburg-Profile; wird von
        # ``assembliere`` gegen die amtliche Original-HTML geprueft und gesetzt.
        self.mandatsarten_bb = {}
        self.mandatsarten_verwendet = set()
        # Versionierte Berliner Mandatsartenquittung (zwei Profile); wird von
        # ``assembliere`` gegen PDF-Beleg, Profilblock und Wahlkreissuche geprueft.
        self.mandatsarten_be = {}
        self.mandatsarten_be_verwendet = set()


def _pruefe_eingangsbindung(eingang: Eingang) -> dict:
    """Validiert alle 500 URLs/Quellhashes gegen die Originaldatei und quittiert."""
    auswahl = eingang.auswahl["auswahl"]
    befund = {
        "auswahlGesamt": len(auswahl),
        "auswahlNachParlament": {},
        "abrufeGesamt": len(eingang.abruf),
        "extraktionenGesamt": len(eingang.extraktion),
        "hashPruefungBestanden": 0,
        "hashPruefungFehler": [],
        "nichtInAuswahl": [],
        "ohneAbruf": [],
    }
    for eintrag in auswahl:
        parlament = eintrag["parlament"]
        befund["auswahlNachParlament"][parlament] = befund["auswahlNachParlament"].get(parlament, 0) + 1
    if befund["auswahlNachParlament"] != ERWARTETE_VERTEILUNG:
        raise AssemblerFehler(
            f"Unerwartete Verteilung in der Namensauswahl: {befund['auswahlNachParlament']!r}"
        )
    if len(auswahl) != 500:
        raise AssemblerFehler(f"Namensauswahl enthaelt {len(auswahl)} statt 500 Eintraege.")
    if len(eingang.abruf_by_url) != len(eingang.abruf):
        raise AssemblerFehler("Die Abrufe enthalten doppelte URLs.")
    if len(eingang.extraktion_by_url) != len(eingang.extraktion):
        raise AssemblerFehler("Die Extraktionen enthalten doppelte Quell-URLs.")

    # Keine nicht ausgewaehlten Kandidaten und keine fehlenden Abrufe.
    for url in eingang.abruf_by_url:
        if url not in eingang.auswahl_by_url:
            befund["nichtInAuswahl"].append(url)
    for eintrag in auswahl:
        if eintrag["url"] not in eingang.abruf_by_url:
            befund["ohneAbruf"].append(eintrag["url"])
    if befund["nichtInAuswahl"] or befund["ohneAbruf"]:
        raise AssemblerFehler(
            "Abrufe und Namensauswahl passen nicht deckungsgleich zusammen "
            f"(nicht in Auswahl: {len(befund['nichtInAuswahl'])}, ohne Abruf: {len(befund['ohneAbruf'])})."
        )

    # Quellhash jeder Detailseite gegen die gespeicherte Originaldatei.
    for eintrag in auswahl:
        abruf = eingang.abruf_by_url[eintrag["url"]]
        if abruf.get("abrufStatus") != "abgerufen" or abruf.get("http") != 200:
            raise AssemblerFehler(
                f"Abruf fuer {eintrag['url']} nicht erfolgreich ({abruf.get('abrufStatus')}/{abruf.get('http')})."
            )
        datei = eingang.detailseiten / abruf["datei"]
        if not datei.exists():
            raise AssemblerFehler(f"Originaldatei fehlt: {datei}")
        ist = _sha256(datei)
        groesse = datei.stat().st_size
        if ist != abruf.get("sha256") or groesse != abruf.get("bytes"):
            befund["hashPruefungFehler"].append(
                {"datei": abruf["datei"], "erwartet": abruf.get("sha256"), "ist": ist}
            )
            continue
        extraktion = eingang.extraktion_by_url.get(eintrag["url"])
        if not extraktion or extraktion.get("quelle", {}).get("sha256") != ist:
            befund["hashPruefungFehler"].append(
                {"datei": abruf["datei"], "erwartet": ist, "ist": (extraktion or {}).get("quelle", {}).get("sha256")}
            )
            continue
        befund["hashPruefungBestanden"] += 1
    if befund["hashPruefungFehler"]:
        raise AssemblerFehler(
            f"{len(befund['hashPruefungFehler'])} Hashpruefungen gegen die Originaldatei fehlgeschlagen."
        )
    return befund


def _parteinachweis(eingang: Eingang, eintrag: dict, extraktion: dict) -> dict:
    """Amtlich belegtes Parteifeld je Parlament — oder sichtbar OFFEN."""
    parlament = eintrag["parlament"]
    if parlament == "landtag-brandenburg":
        quelle = eingang.partei_by_url.get(eintrag["url"])
        if quelle is None:
            return {
                "status": "offen",
                "partei": None,
                "beleg": "",
                "grund": "kein Parteipruefungseintrag zur URL vorhanden",
                "herkunft": "docs/betrieb/brandenburg-parteipruefung-20260927.json",
            }
        if quelle.get("sha256") != extraktion["quelle"]["sha256"]:
            raise AssemblerFehler(
                f"Parteipruefung und Abruf haben unterschiedliche Quellhashes fuer {eintrag['url']}."
            )
        if quelle.get("status") == "offen":
            abruf = eingang.abruf_by_url[eintrag["url"]]
            original = (eingang.detailseiten / abruf["datei"]).read_text(encoding="utf-8")
            kopf = re.search(r"<h1\b[^>]*>.*?</h1>(.*?)<h2\b", original, re.S)
            if kopf and re.search(r"<p>\s*parteilos\s*<br\s*/?>", kopf.group(1), re.I):
                return {"status": "parteilos", "partei": None, "beleg": "parteilos",
                        "grund": "ausdrueckliche aktuelle Angabe im amtlichen Profilkopf",
                        "herkunft": "detailseiten-HTML zwischen h1 und erstem h2; p beginnt mit parteilos"}
        if quelle.get("status") == "belegt" and quelle.get("partei"):
            wert = str(quelle["partei"]).strip()
            # "parteilos" ist kein Parteiname, sondern ein belegter Status ohne Partei.
            if wert.lower() in ("parteilos", "parteilos/fraktionslos"):
                return {
                    "status": "parteilos",
                    "partei": None,
                    "parteilos": True,
                    "beleg": quelle.get("beleg", ""),
                    "grund": quelle.get("grund", ""),
                    "herkunft": "docs/betrieb/brandenburg-parteipruefung-20260927.json (URL UND identischer Quellhash)",
                }
            return {
                "status": "belegt",
                "partei": wert,
                "beleg": quelle.get("beleg", ""),
                "grund": quelle.get("grund", ""),
                "herkunft": "docs/betrieb/brandenburg-parteipruefung-20260927.json (URL UND identischer Quellhash)",
            }
        return {
            "status": "offen",
            "partei": None,
            "beleg": quelle.get("beleg", ""),
            "grund": quelle.get("grund", "keine Belegzeile vorhanden"),
            "herkunft": "docs/betrieb/brandenburg-parteipruefung-20260927.json (URL UND identischer Quellhash)",
        }
    if parlament == "landtag-berlin":
        partei = extraktion["profil"].get("partei")
        if partei:
            return {
                "status": "belegt",
                "partei": partei,
                "beleg": "h1 der amtlichen Landtagsseite fuehrt Namen und Partei",
                "grund": "amtliche h1-Parteiangabe",
                "herkunft": "detailseiten-HTML (h1), amtliches Verzeichnis",
            }
        return {
            "status": "offen",
            "partei": None,
            "beleg": "",
            "grund": "h1 fuehrt keine Partei",
            "herkunft": "detailseiten-HTML (h1), amtliches Verzeichnis",
        }
    if parlament == "bundestag":
        # Bewusste Nicht-Ableitung: PoliticalParty-/Fraktion-Objekte auf
        # bundestag.de beschreiben die Fraktion, nicht zwingend die Partei.
        return {
            "status": "offen",
            "partei": None,
            "beleg": "",
            "grund": "PoliticalParty/Fraktion beschreibt nur die Fraktion; nicht in Partei umgedeutet",
            "herkunft": "bewusst NICHT abgeleitet: Bundestags-Fraktion ist keine Partei; kein Partei-String gesetzt",
        }
    raise AssemblerFehler(f"Unbekanntes Parlament: {parlament}")


# ── Versionierte Ergaenzungsquittung der Parteifeldpruefung (fail closed) ─────
# Der Absatz ``m-biography__introInfo`` ist der Fraktionskopf der
# Bundestagsseite. Er nennt die Fraktion und darf nicht als Parteibeleg gelten.
FRAKTIONSKOPF_MUSTER = re.compile(
    r'<p\b[^>]*class="[^"]*m-biography__introInfo[^"]*"[^>]*>.*?</p>', re.S
)


def _zitat_normalisiert(wert: str) -> str:
    ohne_tags = _text(wert)
    return unicodedata.normalize("NFC", " ".join(ohne_tags.split()))


def _pruefe_ergaenzung(eingang: "Eingang") -> dict:
    """Prueft die versionierte Parteifeldquittung und indexiert sie je Kennung.

    Fail closed bei fehlender Kennung, doppelter Kennung, Kennung ausserhalb der
    500 Zielprofile, unerwartetem Status und leerem/degeneriertem Belegtext.
    """
    quelle = eingang.parteifeldpruefung
    ergebnisse = quelle.get("ergebnisse") if isinstance(quelle, dict) else None
    if not isinstance(ergebnisse, list) or not ergebnisse:
        raise AssemblerFehler("Parteifeldpruefung enthaelt keine Ergebnisliste.")
    if quelle.get("umfang") != len(ergebnisse):
        raise AssemblerFehler("Parteifeldpruefung: umfang passt nicht zur Ergebniszahl.")
    kennungen_500 = {
        _slug(eintrag["parlament"], eingang.abruf_by_url[eintrag["url"]]["amtlicheKennung"]): eintrag
        for eintrag in eingang.auswahl["auswahl"]
    }
    if len(kennungen_500) != len(eingang.auswahl["auswahl"]):
        raise AssemblerFehler("Kanonische Kennungen der 500 Zielprofile sind nicht eindeutig.")
    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise AssemblerFehler("Parteifeldpruefung: Eintrag ohne Kennung.")
        if kennung in index:
            raise AssemblerFehler(f"Parteifeldpruefung: doppelte Kennung {kennung}.")
        if kennung not in kennungen_500:
            raise AssemblerFehler(
                f"Parteifeldpruefung: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen."
            )
        status = ergebnis.get("status")
        if status not in ERGAENZUNG_STATUS:
            raise AssemblerFehler(f"Parteifeldpruefung: unerwarteter Status {status!r} bei {kennung}.")
        partei = str(ergebnis.get("partei") or "").strip()
        if status == "belegt" and not partei:
            raise AssemblerFehler(f"Parteifeldpruefung: Status belegt ohne Parteiwert bei {kennung}.")
        if status == "parteilos" and partei:
            raise AssemblerFehler(f"Parteifeldpruefung: Status parteilos mit Parteiwert bei {kennung}.")
        if status in ("belegt", "parteilos") and not _zitat_normalisiert(ergebnis.get("beleg") or ""):
            raise AssemblerFehler(f"Parteifeldpruefung: Status belegt ohne Belegzitat bei {kennung}.")
        index[kennung] = ergebnis
    eingang.ergaenzung_by_kennung = index
    eingang.ergaenzung_verwendet = set()
    return index


def _pruefe_woertliches_zitat(parlament: str, detail_html: str, zitat: str, kennung: str,
                             abschnitt: str = "") -> None:
    """Belegt das kurze Zitat woertlich in der amtlichen Original-HTML.

    Bundestagsbelege muessen innerhalb des Biografieblocks stehen. Navigation,
    Fraktionskopf und JSON-LD gelten nicht als Mitgliedschaftsnachweis.
    """
    zitat_norm = _zitat_normalisiert(zitat)
    if not zitat_norm:
        raise AssemblerFehler(f"Parteifeldpruefung: leeres Zitat bei {kennung}.")
    quelle = detail_html
    if parlament == "bundestag":
        bio = re.search(r'<div\b[^>]*class="m-biography__biography"[^>]*>(.*?)</div>', detail_html, re.S)
        if not bio:
            raise AssemblerFehler(
                f"Parteifeldpruefung: Biografieblock fehlt ({kennung})."
            )
        quelle = bio.group(1)
        if abschnitt == "Biografie / Mitgliedschaften und Ehrenämter":
            absatz = re.search(r'<p\b[^>]*>\s*Mitgliedschaften und Ehrenämter:(.*?)</p>', quelle, re.S)
            if not absatz:
                raise AssemblerFehler(f"Parteifeldpruefung: Mitgliedschaftsabschnitt fehlt ({kennung}).")
            quelle = absatz.group(1)
    if zitat_norm not in _zitat_normalisiert(quelle):
        raise AssemblerFehler(
            f"Parteifeldpruefung: woertliches Zitat nicht in der amtlichen HTML belegt ({kennung})."
        )


def _ergaenzung_partnachweis(eingang: "Eingang", parlament: str, abruf: dict, detail_html: str,
                             kennung: str, nachweis: dict) -> dict:
    """Ergaenzt ein bislang OFFENES Parteifeld aus der geprueften Quittung.

    Nur ``belegt`` oder ``parteilos`` wird explizit uebernommen; ``offen`` bleibt
    offen. Quelle wird je Kennung an URL UND sha256 gebunden. Fehlende Kennung,
    abweichende URL/Hash, unerwarteter Status und Konflikt brechen den Lauf ab.
    """
    ergebnis = eingang.ergaenzung_by_kennung.get(kennung)
    if ergebnis is None:
        if nachweis["status"] == "offen":
            raise AssemblerFehler(
                f"Parteifeldpruefung: keine gepruefte Ergaenzung fuer offenes Parteifeld {kennung}."
            )
        return nachweis
    eingang.ergaenzung_verwendet.add(kennung)
    status = ergebnis["status"]
    if nachweis["status"] != "offen":
        raise AssemblerFehler(
            f"Parteifeldpruefung: Konflikt bei {kennung} — bereits {nachweis['status']}, "
            f"Quittung behauptet {status}."
        )
    quittung = ergebnis.get("quelle") or {}
    if quittung.get("url") != abruf["url"]:
        raise AssemblerFehler(f"Parteifeldpruefung: abweichende Quell-URL bei {kennung}.")
    if quittung.get("sha256") != abruf["sha256"]:
        raise AssemblerFehler(f"Parteifeldpruefung: abweichender Quellhash bei {kennung}.")
    herkunft = (
        f"{PARTEIFELDPRUEFUNG_RESSOURCE} (gepruefte Ergaenzung; URL UND identischer "
        f"Quellhash {quittung['sha256']})"
    )
    if status == "offen":
        # Offen bleibt offen — nichts wird abgeleitet oder "schoengerechnet".
        return nachweis
    _pruefe_woertliches_zitat(parlament, detail_html, ergebnis.get("beleg", ""), kennung,
                             ergebnis.get("abschnitt", ""))
    if status == "parteilos":
        if not re.search(r"\bparteilos\b", ergebnis.get("beleg", ""), re.I):
            raise AssemblerFehler(f"Parteifeldpruefung: parteilos nicht ausdruecklich belegt ({kennung}).")
        return {
            "status": "parteilos",
            "partei": None,
            "parteilos": True,
            "beleg": ergebnis.get("beleg", ""),
            "grund": ergebnis.get("grund", ""),
            "abschnitt": ergebnis.get("abschnitt"),
            "pruefung": ergebnis.get("pruefung"),
            "quittung": quittung,
            "herkunft": herkunft,
        }
    return {
        "status": "belegt",
        "partei": str(ergebnis["partei"]).strip(),
        "beleg": ergebnis.get("beleg", ""),
        "grund": ergebnis.get("grund", ""),
        "abschnitt": ergebnis.get("abschnitt"),
        "pruefung": ergebnis.get("pruefung"),
        "quittung": quittung,
        "herkunft": herkunft,
    }


def _bundestags_region(profil_roh: dict):
    """Ermittelt Mandatsart und Region eines Bundestagsprofils aus der Mandatsachse."""
    achsen = profil_roh.get("mandatsachsen", [])
    direkt = [a for a in achsen if a.get("art") == "Wahlkreismandat"]
    listen = [a for a in achsen if a.get("art") == "Gewählt über Landesliste"]
    kandidaturen = [a for a in achsen if a.get("art") == "Wahlkreiskandidatur"]
    regionsangaben = profil_roh.get("regionsangaben") or []
    if direkt:
        bundesland = _bundesland_aus_wahlkreismandat(direkt[0].get("beleg", ""))
        wahlkreis = regionsangaben[0] if regionsangaben else None
        return {
            "art": "direkt",
            "bundesland": bundesland,
            "wahlkreis": wahlkreis,
            "listeBeleg": [a.get("beleg") for a in listen],
            "kandidaturen": [a.get("beleg") for a in kandidaturen],
            "offen": None if (bundesland and wahlkreis) else "Bundesland/Wahlkreis nicht vollstaendig aus Mandatsachse ableitbar",
        }
    if listen:
        bundesland = _bundesland_aus_liste(listen[0].get("beleg", ""))
        return {
            "art": "liste",
            "bundesland": bundesland,
            "wahlkreis": None,
            "listeBeleg": [a.get("beleg") for a in listen],
            "kandidaturen": [a.get("beleg") for a in kandidaturen],
            "offen": None if bundesland else "Bundesland nicht aus Landesliste ableitbar",
        }
    return {
        "art": "offen",
        "bundesland": None,
        "wahlkreis": None,
        "listeBeleg": [],
        "kandidaturen": [a.get("beleg") for a in kandidaturen],
        "offen": "Weder Wahlkreismandat noch Landesliste belegt",
    }


def _funktionen_als_strings(funktionen) -> list:
    ergebnis = []
    for eintrag in funktionen or []:
        rolle = str(eintrag.get("rolle", "")).strip()
        gremium = str(eintrag.get("gremium", "")).strip()
        if not rolle and not gremium:
            continue
        wert = f"{rolle}: {gremium}" if rolle and gremium else (rolle or gremium)
        if wert not in ergebnis:
            ergebnis.append(wert)
    return ergebnis


def _roher_mandatsbeleg(parlament: str, detail_html: str):
    """Amtliche Rohangabe zur Mandatsart aus dem Profilkopf — ohne Biografie-Inhalte.

    Berlin: die Faktenliste ``dl.b-delegate-facts`` (gewaehlt/nachgerueckt ueber ...).
    Brandenburg: nur der Mandatsabsatz im Profilkopf (Direktkandidat/Landesliste);
    der biografische Absatz wird bewusst NICHT uebernommen.
    """
    if parlament == "landtag-berlin":
        dl = re.search(r'<dl\b[^>]*class="b-delegate-facts"[^>]*>(.*?)</dl>', detail_html, re.S)
        fakten = {
            _text(a).rstrip(":"): _text(b)
            for a, b in re.findall(r"<dt\b[^>]*>(.*?)</dt>\s*<dd\b[^>]*>(.*?)</dd>", dl.group(1) if dl else "", re.S)
        }
        fakten = {k: v for k, v in fakten.items() if k and v}
        return fakten
    if parlament == "landtag-brandenburg":
        for absatz in re.findall(r"<p\b[^>]*>(.*?)</p>", detail_html, re.S):
            satz = _text(absatz)
            if re.search(r"(gewählt|nachgerückt)\s+als\s+", satz) or re.match(r"Landesliste\b", satz):
                return satz
    return None


def _landtag_mandat(parlament: str, profil_roh: dict, roh_beleg):
    """Mandatsart/Region eines Landtagsprofils aus belegten Angaben.

    Bevorzugt die bereits extrahierte Angabe. Fehlt sie, wird ausschliesslich eine
    im amtlichen Profilkopf woertlich belegte Aussage ergaenzt. Ist keine explizite
    Aussage vorhanden, bleibt die Mandatsart OFFEN — es wird nichts erfunden.
    """
    if profil_roh.get("wahlkreis"):
        return {"art": "direkt", "wahlkreis": profil_roh["wahlkreis"], "listenmandat": False,
                "regionHinweis": None, "offen": None, "quelle": "extraktion"}
    if profil_roh.get("listenmandat"):
        return {"art": "liste", "wahlkreis": None, "listenmandat": True,
                "regionHinweis": profil_roh.get("regionHinweis"), "offen": None, "quelle": "extraktion"}

    if parlament == "landtag-berlin":
        fakten = roh_beleg if isinstance(roh_beleg, dict) else {}
        methode = fakten.get("gewählt über") or fakten.get("nachgerückt über")
        bezirk = fakten.get("Wahlbezirk")
        nummer = fakten.get("Wahlkreis")
        zusatz = "; ".join(f"{k}: {v}" for k, v in fakten.items()) or "keine Mandatsangabe im Profilkopf"
        if methode == "Direktwahl" and nummer:
            wahlkreis = f"{bezirk}, Wahlkreis {nummer}" if bezirk else f"Wahlkreis {nummer}"
            hinweis = None if bezirk else "Wahlbezirk im Profilkopf nicht benannt"
            return {"art": "direkt", "wahlkreis": wahlkreis, "listenmandat": False,
                    "regionHinweis": None, "offen": hinweis, "quelle": "profilkopf", "beleg": zusatz}
        if methode in ("Landesliste", "Bezirksliste"):
            return {"art": "liste", "wahlkreis": None, "listenmandat": True,
                    "regionHinweis": bezirk or f"Berlin — {methode}", "offen": None,
                    "quelle": "profilkopf", "beleg": zusatz}
        grunde = "Direktwahl ohne belegte Wahlkreisnummer" if methode == "Direktwahl" else "keine eindeutige Mandatsangabe"
        return {"art": "offen", "wahlkreis": None, "listenmandat": False, "regionHinweis": None,
                "offen": f"Mandatsart bleibt offen ({grunde}); amtlicher Profilkopf belegt: {zusatz}",
                "quelle": "profilkopf"}

    if parlament == "landtag-brandenburg":
        satz = roh_beleg if isinstance(roh_beleg, str) else ""
        treffer = re.search(r"gewählt als Direktkandidat(?:in)? im (Wahlkreis\s*\d+\s*\([^)]*\))", satz)
        if treffer:
            return {"art": "direkt", "wahlkreis": treffer.group(1).strip(), "listenmandat": False,
                    "regionHinweis": None, "offen": None, "quelle": "profilkopf", "beleg": satz}
        liste = re.search(r"^(Landesliste[^;]*)", satz)
        if liste:
            return {"art": "liste", "wahlkreis": None, "listenmandat": True,
                    "regionHinweis": f"Brandenburg — {liste.group(1).strip()}", "offen": None,
                    "quelle": "profilkopf", "beleg": satz}
        return {"art": "offen", "wahlkreis": None, "listenmandat": False, "regionHinweis": None,
                "offen": "Mandatsart bleibt offen; amtlicher Profilkopf enthaelt keine Mandatsangabe",
                "quelle": "profilkopf"}

    raise AssemblerFehler(f"Unbekanntes Parlament: {parlament}")


def _baue_datensatz(eingang: Eingang, eintrag: dict) -> dict:
    parlament = eintrag["parlament"]
    abruf = eingang.abruf_by_url[eintrag["url"]]
    extraktion = eingang.extraktion_by_url[eintrag["url"]]
    profil_roh = dict(extraktion["profil"])

    detail_html = (eingang.detailseiten / abruf["datei"]).read_text(encoding="utf-8")
    h1_liste = _h1_ueberschriften(detail_html)
    if len(h1_liste) != 1:
        raise AssemblerFehler(f"Keine eindeutige h1 fuer {eintrag['url']}")
    h1 = h1_liste[0]
    if parlament == "landtag-berlin":
        name = h1.rsplit(", ", 1)[0] if ", " in h1 else h1
    else:
        name = h1
    if name != profil_roh.get("vollname"):
        raise AssemblerFehler(
            f"h1-Name weicht von der Extraktion ab: {eintrag['url']} ({name!r} != {profil_roh.get('vollname')!r})"
        )

    if parlament == "landtag-berlin" and profil_roh.get("partei"):
        if ", " not in h1 or h1.rsplit(", ", 1)[1] != profil_roh["partei"]:
            raise AssemblerFehler("Extrahierte Partei stimmt nicht mit amtlicher h1 ueberein")

    mandatsId = _slug(parlament, abruf["amtlicheKennung"])
    mandatsart_belegt = _roher_mandatsbeleg(parlament, detail_html) if parlament != "bundestag" else None

    # Region/Mandatsart nach amtlicher Achse — nie aus einer blossen Kandidatur.
    if parlament == "bundestag":
        region = _bundestags_region(profil_roh)
        bundesland = region["bundesland"]
        landtag_mandat = None
    else:
        region = None
        bundesland = profil_roh.get("bundesland")
        landtag_mandat = _landtag_mandat(parlament, profil_roh, mandatsart_belegt)
    if not bundesland:
        raise AssemblerFehler(f"Kein belegtes Bundesland fuer {eintrag['url']} — nicht auf NULL normalisieren.")

    # Versionierte Mandatsartenquittung: nur die ausdruecklich belegte Landesliste
    # eines bislang offenen Brandenburg-Mandats. Keine Partei-/Listenplatz-Ableitung
    # aus der irrefuehrenden Listenbeschriftung.
    mandatsart_quittung = None
    if parlament == "landtag-brandenburg":
        quittung = (getattr(eingang, "mandatsarten_bb", None) or {}).get(str(abruf["amtlicheKennung"]))
        if quittung is not None:
            if landtag_mandat is None or landtag_mandat["art"] != "offen":
                raise AssemblerFehler(
                    f"Mandatsartenquittung fuer {abruf['amtlicheKennung']} hat kein offenes Mandatsartenfeld."
                )
            landtag_mandat = {
                "art": "liste",
                "wahlkreis": None,
                "listenmandat": True,
                "regionHinweis": f"{MANDATSARTEN_BB_REGION} — Landesliste",
                "offen": None,
                "quelle": "mandatsartenquittung",
                "beleg": quittung["zeileWortlaut"],
            }
            mandatsart_quittung = quittung
            verwendet = getattr(eingang, "mandatsarten_verwendet", None)
            if verwendet is not None:
                verwendet.add(str(abruf["amtlicheKennung"]))

    # Versionierte Berliner Mandatsartenquittung: nur die ausdruecklich belegte
    # Bezirks-/Landesliste eines bislang offenen Berliner Mandats. Keine Partei-,
    # Funktions- oder Themenableitung; ein bereits geschlossenes Mandat wird nicht
    # ueberschrieben.
    mandatsart_quittung_be = None
    if parlament == "landtag-berlin":
        quittung = (getattr(eingang, "mandatsarten_be", None) or {}).get(str(abruf["amtlicheKennung"]))
        if quittung is not None:
            if landtag_mandat is None or landtag_mandat["art"] != "offen":
                raise AssemblerFehler(
                    f"Berliner Mandatsartenquittung fuer {abruf['amtlicheKennung']} hat kein offenes "
                    "Mandatsartenfeld (bereits geschlossenes Mandat wird nicht ueberschrieben)."
                )
            landtag_mandat = {
                "art": "liste",
                "wahlkreis": None,
                "listenmandat": True,
                "regionHinweis": quittung["regionHinweis"],
                "offen": None,
                "quelle": "mandatsartenquittung-be",
                "beleg": quittung["zitat"],
            }
            mandatsart_quittung_be = quittung
            verwendet = getattr(eingang, "mandatsarten_be_verwendet", None)
            if verwendet is not None:
                verwendet.add(str(abruf["amtlicheKennung"]))

    parteinachweis = _parteinachweis(eingang, eintrag, extraktion)
    parteinachweis = _ergaenzung_partnachweis(
        eingang, parlament, abruf, detail_html, mandatsId, parteinachweis
    )

    # Drei eng gebundene offizielle Partei-Zusatzbelege. Sie duerfen nur ein
    # nach der allgemeinen Quittung weiterhin offenes Parteifeld schliessen.
    parteizusatz_eintrag = (getattr(eingang, "parteizusatz_by_kennung", None) or {}).get(mandatsId)
    parteizusatz_beleg = None
    if parteizusatz_eintrag is not None:
        verwendet = getattr(eingang, "parteizusatz_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        if parteinachweis["status"] != "offen":
            raise AssemblerFehler(
                f"Parteizusatzquittung: {mandatsId} ist bereits {parteinachweis['status']}; "
                "ein offenes Parteifeld wird erwartet."
            )
        quelle = parteizusatz_eintrag["quelle"]
        parteinachweis = {
            "status": "belegt",
            "partei": parteizusatz_eintrag["partei"],
            "beleg": parteizusatz_eintrag["beleg"],
            "grund": parteizusatz_eintrag["grund"],
            "herkunft": (
                f"{PARTEIZUSATZ_RESSOURCE} (enge Zusatzquittung; getrennte offizielle "
                f"Partei-Quelle {quelle['url']}, SHA256 {quelle['sha256']})"
            ),
            "quittung": {"url": quelle["url"], "sha256": quelle["sha256"]},
            "quittungDatei": PARTEIZUSATZ_RESSOURCE,
        }
        parteizusatz_beleg = {
            "datei": PARTEIZUSATZ_RESSOURCE,
            "kennung": parteizusatz_eintrag["kennung"],
            "region": parteizusatz_eintrag["region"],
            "parlament": parteizusatz_eintrag["parlament"],
            "status": parteizusatz_eintrag["status"],
            "partei": parteizusatz_eintrag["partei"],
            "person": parteizusatz_eintrag["person"],
            "bindung": parteizusatz_eintrag["bindung"],
            "beleg": parteizusatz_eintrag["beleg"],
            "grund": parteizusatz_eintrag["grund"],
            "profilQuelle": dict(parteizusatz_eintrag["profilQuelle"]),
            "quelle": dict(quelle),
            "importfreigegeben": False,
        }

    # Versionierte Pistorius-Parteizusatzquittung: NUR fuer den einen kanonischen
    # Fall wird ein bislang OFFENES Parteifeld aus der getrennten offiziellen
    # SPD-Quelle belegt. Die historische 335er Quittung bleibt unveraendert offen;
    # Fraktion, Funktionen, Themen, Mandat und alle anderen Felder bleiben gleich.
    pistorius_eintrag = (getattr(eingang, "pistorius_by_kennung", None) or {}).get(mandatsId)
    pistorius_beleg = None
    if pistorius_eintrag is not None:
        verwendet = getattr(eingang, "pistorius_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        if parteinachweis["status"] != "offen":
            raise AssemblerFehler(
                f"Pistorius-Parteizusatzquittung: {mandatsId} ist bereits "
                f"{parteinachweis['status']}; ein offenes Parteifeld wird erwartet."
            )
        pistorius_quelle = pistorius_eintrag["quelle"]
        parteinachweis = {
            "status": "belegt",
            "partei": pistorius_eintrag["partei"],
            "beleg": pistorius_eintrag["beleg"],
            "grund": pistorius_eintrag["grund"],
            "abschnitt": pistorius_eintrag["abschnitt"],
            "pruefung": pistorius_eintrag["pruefung"],
            "herkunft": (
                f"{PISTORIUS_RESSOURCE} (enge Zusatzquittung; getrennte offizielle "
                f"Partei-Quelle {pistorius_quelle['url']}, SHA256 {pistorius_quelle['sha256']})"
            ),
            "quittung": {"url": pistorius_quelle["url"], "sha256": pistorius_quelle["sha256"]},
            "quittungDatei": PISTORIUS_RESSOURCE,
        }
        pistorius_beleg = {
            "datei": PISTORIUS_RESSOURCE,
            "kennung": pistorius_eintrag["kennung"],
            "region": pistorius_eintrag["region"],
            "parlament": pistorius_eintrag["parlament"],
            "status": pistorius_eintrag["status"],
            "partei": pistorius_eintrag["partei"],
            "person": pistorius_eintrag["person"],
            "abschnittH2": pistorius_eintrag["abschnitt"],
            "abschnittId": pistorius_eintrag["abschnittId"],
            "liName": pistorius_eintrag["liName"],
            "bindung": pistorius_eintrag["bindung"],
            "beleg": pistorius_eintrag["beleg"],
            "grund": pistorius_eintrag["grund"],
            "quelle": {
                "url": pistorius_quelle["url"],
                "finalUrl": pistorius_quelle["finalUrl"],
                "datei": pistorius_quelle["datei"],
                "abgerufenAm": pistorius_quelle["abgerufenAm"],
                "sha256": pistorius_quelle["sha256"],
                "bytes": pistorius_quelle["bytes"],
                "http": pistorius_quelle["http"],
                "httpDate": pistorius_quelle["httpDate"],
            },
            "importfreigegeben": False,
        }

    fraktion = profil_roh.get("fraktion")
    fraktionslos = bool(profil_roh.get("fraktionslos")) or (fraktion or "").strip().lower() == "fraktionslos"

    # ── profil: Normalisierung in das Format von prof-import.js ────────────────
    profil = {"mandatsId": mandatsId, "vollname": name, "parlament": parlament, "bundesland": bundesland}
    if fraktionslos:
        profil["fraktionslos"] = True
    elif fraktion:
        profil["fraktion"] = fraktion
    if parteinachweis["status"] == "belegt":
        profil["partei"] = parteinachweis["partei"]
    if parlament == "bundestag":
        if region["art"] == "direkt":
            profil["wahlkreis"] = region["wahlkreis"]
        elif region["art"] == "liste":
            profil["listenmandat"] = True
            profil["regionHinweis"] = f"Landesliste {bundesland}"
    else:
        if landtag_mandat["art"] == "direkt":
            profil["wahlkreis"] = landtag_mandat["wahlkreis"]
        elif landtag_mandat["art"] == "liste":
            profil["listenmandat"] = True
            profil["regionHinweis"] = landtag_mandat["regionHinweis"]
        # sonst: Mandatsart bleibt OFFEN (kein Schoenschreiben)

    ordentliche = _normalisiere_liste(profil_roh.get("ausschuesse"))
    stellvertretende = _normalisiere_liste(profil_roh.get("stellvertretendeAusschuesse"))
    weitere_gremien = _normalisiere_liste(extraktion.get("weitereGremien"))
    weitere_gremien_beleg = []
    zusatz_funktionen = []
    if parlament == "bundestag":
        # Belegte sonstige Gremien (Beirat/Unterausschuss/Kommission/Kontrollgremium/
        # Wahlausschuss/Rechnungspruefung) gehoeren nicht in die staendigen
        # Ausschuesse; sie werden als weitereGremien UND rollengetreue funktionen
        # weitergereicht. Unbekannte echte Ausschuesse bleiben unveraendert gesperrt.
        ordentliche, stellvertretende, zusaetzliche, zusatz_funktionen, weitere_gremien_beleg = (
            _trenne_sonstige_gremien(detail_html, ordentliche, stellvertretende)
        )
        for gremium in zusaetzliche:
            if gremium not in weitere_gremien:
                weitere_gremien.append(gremium)
    # Versionierte Stellvertretungsquittung: nur die amtlich belegten
    # stellvertretenden Brandenburger Ausschussmitgliedschaften werden ergaenzt.
    # Sie tragen die fachliche Achse, bleiben aber strikt von ordentlichen
    # Ausschuessen getrennt (keine Aufwertung zu ordentlichem Sitz/Vorsitz).
    stellvertretungen_eintrag = (getattr(eingang, "stellvertretungen_by_kennung", None) or {}).get(mandatsId)
    stellvertretungen_quellen = []
    if stellvertretungen_eintrag is not None:
        verwendet = getattr(eingang, "stellvertretungen_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        for mitgliedschaft in stellvertretungen_eintrag["ausschuesse"]:
            if mitgliedschaft["ausschuss"] not in stellvertretende:
                stellvertretende.append(mitgliedschaft["ausschuss"])
            if mitgliedschaft["quelle"] not in stellvertretungen_quellen:
                stellvertretungen_quellen.append(mitgliedschaft["quelle"])
    if ordentliche and stellvertretende:
        kollision = sorted(set(ordentliche) & set(stellvertretende))
        if kollision:
            raise AssemblerFehler(
                f"Stellvertretung kollidiert mit ordentlichem Ausschuss ({mandatsId}): {kollision}."
            )
    if ordentliche:
        profil["ausschuesse"] = ordentliche
    if stellvertretende:
        profil["stellvertretendeAusschuesse"] = stellvertretende
    funktionen = _funktionen_als_strings(profil_roh.get("funktionen"))
    for eintrag_funktion in zusatz_funktionen:
        if eintrag_funktion not in funktionen:
            funktionen.append(eintrag_funktion)

    # Versionierte Rollenquittung: nur die ausdruecklich freigegebenen
    # ``wortlaut``-Strings an BESTEHENDE funktionen dedupliziert anhaengen.
    # Bestehende Gremienrollen bleiben unveraendert; es entsteht kein neues
    # Schema und keine fachliche Achse.
    rollen_quittung = None
    rollen_beleg = None
    rollen_eintrag = (getattr(eingang, "profilrollen_by_kennung", None) or {}).get(mandatsId)
    if rollen_eintrag is not None:
        verwendet = getattr(eingang, "profilrollen_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        rollen_quittung = rollen_eintrag.get("quelle") or {}
        rollen_beleg = {
            "datei": PROFILROLLEN_RESSOURCE,
            "url": rollen_quittung.get("url"),
            "sha256": rollen_quittung.get("sha256"),
            "abgerufenAm": rollen_quittung.get("abgerufenAm"),
            "status": rollen_eintrag.get("status"),
            "begruendung": rollen_eintrag.get("begruendung"),
            "funktionen": [],
        }
        for funktion in rollen_eintrag.get("funktionen") or []:
            wortlaut = str(funktion.get("wortlaut") or "").strip()
            if not wortlaut:
                continue
            if wortlaut not in funktionen:
                funktionen.append(wortlaut)
            rollen_beleg["funktionen"].append({
                "wortlaut": wortlaut,
                "zitat": funktion.get("zitat"),
                "abschnitt": funktion.get("abschnitt"),
                "zeitbeleg": funktion.get("zeitbeleg"),
            })
    if funktionen:
        profil["funktionen"] = funktionen
    profil["aktiv"] = False
    profil["offizielleQuellen"] = [
        {
            "art": "parlament-profil",
            "url": abruf["url"],
            "abgerufenAm": abruf["abgerufenAm"],
            "sha256": abruf["sha256"],
        }
    ]
    if pistorius_beleg is not None:
        # Getrennte offizielle Partei-Quelle. Sie steht bewusst NICHT als
        # ``parlament-profil`` und aendert damit die amtliche Parlamentsbelegpflicht
        # nicht; die Partei selbst bleibt am Fraktionskopf vorbei neu gebunden.
        profil["offizielleQuellen"].append({
            "art": "partei-profil",
            "url": pistorius_beleg["quelle"]["url"],
            "abgerufenAm": pistorius_beleg["quelle"]["abgerufenAm"],
            "sha256": pistorius_beleg["quelle"]["sha256"],
        })
    if parteizusatz_beleg is not None:
        profil["offizielleQuellen"].append({
            "art": "partei-profil",
            "url": parteizusatz_beleg["quelle"]["url"],
            "abgerufenAm": parteizusatz_beleg["quelle"]["abgerufenAm"],
            "sha256": parteizusatz_beleg["quelle"]["sha256"],
        })

    # Versionierte Stellvertretungsquittung: die amtliche Quelle jeder ergaenzten
    # stellvertretenden Ausschussmitgliedschaft wird an profil.offizielleQuellen
    # angefuegt; alle anderen Felder bleiben unveraendert.
    stellvertretungen_beleg = None
    if stellvertretungen_eintrag is not None:
        for quelle in stellvertretungen_quellen:
            profil["offizielleQuellen"].append({
                "art": "stellvertretende-ausschussmitgliedschaft",
                "url": quelle["url"],
                "abgerufenAm": quelle.get("abgerufenAm"),
                "sha256": quelle["sha256"],
            })
        stellvertretungen_beleg = {
            "datei": STELLVERTRETUNGEN_RESSOURCE,
            "kennung": stellvertretungen_eintrag["kennung"],
            "person": stellvertretungen_eintrag["person"],
            "gruppe": stellvertretungen_eintrag["gruppe"],
            "personenquelle": {
                "datei": stellvertretungen_eintrag["personenquelle"].get("datei"),
                "url": stellvertretungen_eintrag["personenquelle"].get("url"),
                "finalUrl": stellvertretungen_eintrag["personenquelle"].get("finalUrl"),
                "abgerufenAm": stellvertretungen_eintrag["personenquelle"].get("abgerufenAm"),
                "sha256": stellvertretungen_eintrag["personenquelle"].get("sha256"),
                "bytes": stellvertretungen_eintrag["personenquelle"].get("bytes"),
            },
            "mitgliedschaften": [
                {
                    "ausschuss": mitgliedschaft["ausschuss"],
                    "rolle": mitgliedschaft["rolle"],
                    "personenlink": mitgliedschaft["personenlink"],
                    "quelle": {
                        "datei": mitgliedschaft["quelle"].get("datei"),
                        "url": mitgliedschaft["quelle"].get("url"),
                        "finalUrl": mitgliedschaft["quelle"].get("finalUrl"),
                        "abgerufenAm": mitgliedschaft["quelle"].get("abgerufenAm"),
                        "sha256": mitgliedschaft["quelle"].get("sha256"),
                        "bytes": mitgliedschaft["quelle"].get("bytes"),
                    },
                }
                for mitgliedschaft in stellvertretungen_eintrag["ausschuesse"]
            ],
        }

    # Versionierte Ressortquittung: fuer die 19 freigegebenen Fachachsen wird aus
    # dem amtlich belegten aktuellen Ressort die ausdruecklichen Ressortbegriffe als Themen gesetzt und
    # damit die fachliche Achse geschlossen (Ausschuss ODER Thema). Keine
    # persoenliche Position, keine freie Themen-/Zitatzuordnung; bestehende
    # Amtsrollen, Partei, Mandatsart, Gremien und alle anderen Felder bleiben
    # unveraendert; funktionen erhaelt nur den Ableitungshinweis. Die Zusatzquelle steht in
    # ``profil.offizielleQuellen`` und im Belegabschnitt ``ressortachsenQuittung``.
    ressort_eintrag = (getattr(eingang, "ressortachsen_by_kennung", None) or {}).get(mandatsId)
    ressort_beleg = None
    achsen_geschlossen = ressort_eintrag is not None
    if ressort_eintrag is not None:
        verwendet = getattr(eingang, "ressortachsen_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        ressort_quelle = ressort_eintrag["quelle"]
        profil["themen"] = list(ressort_eintrag["themen"])
        hinweis = ressort_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "ressort-zustaendigkeit",
            "url": ressort_quelle["url"],
            "abgerufenAm": ressort_quelle["abgerufenAm"],
            "sha256": ressort_quelle["sha256"],
        })
        ressort_beleg = {
            "datei": RESSORTAKSEN_RESSOURCE,
            "kennung": ressort_eintrag["kennung"],
            "region": ressort_eintrag["region"],
            "ressort": ressort_eintrag["ressort"],
            "amtsrolle": ressort_eintrag["amtsrolle"],
            "zitat": ressort_eintrag["zitat"],
            "rollenquelle": {
                "url": ressort_eintrag["rollenquelle"].get("url"),
                "sha256": ressort_eintrag["rollenquelle"].get("sha256"),
            },
            "quelle": {
                "datei": ressort_quelle.get("datei"),
                "url": ressort_quelle.get("url"),
                "finalUrl": ressort_quelle.get("finalUrl"),
                "abgerufenAm": ressort_quelle.get("abgerufenAm"),
                "sha256": ressort_quelle.get("sha256"),
                "bytes": ressort_quelle.get("bytes"),
            },
            "themen": list(ressort_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }

    # Versionierte Aufgabenquittung: fuer die 6 freigegebenen Fachachsen wird aus
    # dem amtlich belegten personengebundenen Aufgabenbereich (Beauftragtenaufgabe
    # bzw. explizite BMAS-Abteilungszustaendigkeit) der ausdrueckliche Themenbegriff
    # gesetzt und damit die fachliche Achse geschlossen (Ausschuss ODER Thema).
    # Getrennt von den 19 Ressortachsen; keine persoenliche Position, keine freie
    # Themen-/Zitatzuordnung, bestehende Amtsrollen, Partei, Mandatsart, Gremien und
    # alle anderen Felder bleiben unveraendert; funktionen erhaelt nur den
    # Ableitungshinweis. Die Zusatzquelle steht in ``profil.offizielleQuellen`` und im
    # Belegabschnitt ``aufgabenachsenQuittung``.
    aufgaben_eintrag = (getattr(eingang, "aufgabenachsen_by_kennung", None) or {}).get(mandatsId)
    aufgaben_beleg = None
    if aufgaben_eintrag is not None:
        verwendet = getattr(eingang, "aufgabenachsen_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        aufgaben_quelle = aufgaben_eintrag["quelle"]
        profil["themen"] = list(aufgaben_eintrag["themen"])
        hinweis = aufgaben_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "aufgaben-zustaendigkeit",
            "url": aufgaben_quelle["url"],
            "abgerufenAm": aufgaben_quelle["abgerufenAm"],
            "sha256": aufgaben_quelle["sha256"],
        })
        aufgaben_beleg = {
            "datei": AUFGABENACHSEN_RESSOURCE,
            "kennung": aufgaben_eintrag["kennung"],
            "region": aufgaben_eintrag["region"],
            "bindungsart": aufgaben_eintrag["bindungsart"],
            "person": aufgaben_eintrag["person"],
            "aufgabenbindung": aufgaben_eintrag["aufgabenbindung"],
            "zitate": list(aufgaben_eintrag["zitate"]),
            "rollenquelle": {
                "url": aufgaben_eintrag["rollenquelle"].get("url"),
                "sha256": aufgaben_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": aufgaben_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": aufgaben_quelle.get("datei"),
                "url": aufgaben_quelle.get("url"),
                "finalUrl": aufgaben_quelle.get("finalUrl"),
                "abgerufenAm": aufgaben_quelle.get("abgerufenAm"),
                "sha256": aufgaben_quelle.get("sha256"),
                "bytes": aufgaben_quelle.get("bytes"),
            },
            "themen": list(aufgaben_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte beratende Achsenquittung: fuer die 2 freigegebenen beratenden
    # Ausschussachsen (Knodel Landwirtschaft/Ernaehrung/Heimat, Seidler Haushalt)
    # werden die ausdruecklichen Kurzthemen gesetzt und damit die fachliche Achse
    # geschlossen (Ausschuss ODER Thema). Die BERATENDE Funktion bleibt unveraendert
    # erhalten; es entsteht KEINE ordentliche/stellvertretende Ausschussmitgliedschaft
    # und keine politische Position. Bestehende Amtsrollen, Partei, Mandatsart,
    # Gremien und alle anderen Felder bleiben unveraendert; funktionen erhaelt nur
    # den getrennten Ableitungshinweis. Die Quittung bindet dieselbe amtliche
    # Profilquelle (URL + sha256 + Bytezahl) wie das Profil selbst.
    beratende_eintrag = (getattr(eingang, "beratendeachsen_by_kennung", None) or {}).get(mandatsId)
    beratende_beleg = None
    if beratende_eintrag is not None:
        verwendet = getattr(eingang, "beratendeachsen_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        beratende_quelle = beratende_eintrag["quelle"]
        profil["themen"] = list(beratende_eintrag["themen"])
        hinweis = beratende_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        # Die bestehende beratende Funktion war bereits belegt und MUSS erhalten
        # bleiben — die Achse schliesst nur ueber die Themen, nicht ueber eine
        # neue Ausschussmitgliedschaft.
        for bestehend in beratende_eintrag["bestehendeFunktionen"]:
            if bestehend not in profil["funktionen"]:
                raise AssemblerFehler(
                    f"Beratende Achse setzt eine bereits belegte Funktion voraus, die fehlt: {bestehend!r} ({mandatsId})."
                )
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "beratende-ausschussarbeit",
            "url": beratende_quelle["url"],
            "abgerufenAm": beratende_quelle["abgerufenAm"],
            "sha256": beratende_quelle["sha256"],
        })
        beratende_beleg = {
            "datei": BERATENDEACHSEN_RESSOURCE,
            "kennung": beratende_eintrag["kennung"],
            "region": beratende_eintrag["region"],
            "person": beratende_eintrag["person"],
            "ausschuss": beratende_eintrag["ausschuss"],
            "rolle": beratende_eintrag["rolle"],
            "amtlicherRollenbeleg": beratende_eintrag["amtlicherRollenbeleg"],
            "bestehendeFunktionen": list(beratende_eintrag["bestehendeFunktionen"]),
            "rollenquelle": {
                "url": beratende_eintrag["rollenquelle"].get("url"),
                "sha256": beratende_eintrag["rollenquelle"].get("sha256"),
            },
            "quelle": {
                "datei": beratende_quelle.get("datei"),
                "url": beratende_quelle.get("url"),
                "finalUrl": beratende_quelle.get("finalUrl"),
                "abgerufenAm": beratende_quelle.get("abgerufenAm"),
                "sha256": beratende_quelle.get("sha256"),
                "bytes": beratende_quelle.get("bytes"),
            },
            "themen": list(beratende_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Zusatzaufgabenquittung: fuer die 3 freigegebenen Fachzustaendigkeiten
    # (Breher Tierschutz, Krichbaum Europa, Kippels BMG-Abteilungen 1/4/5/6) werden die
    # ausdruecklichen Kurzthemen gesetzt und damit die fachliche Achse geschlossen
    # (Ausschuss ODER Thema). Nur Breher erhaelt genau EINE neue Funktionsrolle
    # (dedupliziert); bestehende Rollen bleiben erhalten. Bestehende Amtsrollen, Partei,
    # Mandatsart, Gremien und alle anderen Felder bleiben unveraendert; funktionen erhaelt
    # den getrennten Ableitungshinweis. Keine persoenliche Position, keine freie
    # Themen-/Zitatzuordnung. Die amtliche Zusatzquelle steht in ``profil.offizielleQuellen``
    # und im Belegabschnitt ``zusaetzlicheaufgabenQuittung``.
    zusatz_eintrag = (getattr(eingang, "zusaetzlicheaufgaben_by_kennung", None) or {}).get(mandatsId)
    zusatz_beleg = None
    if zusatz_eintrag is not None:
        verwendet = getattr(eingang, "zusaetzlicheaufgaben_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        zusatz_quelle = zusatz_eintrag["quelle"]
        profil["themen"] = list(zusatz_eintrag["themen"])
        hinweis = zusatz_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        neue_funktion = zusatz_eintrag.get("funktion")
        if neue_funktion and neue_funktion not in profil["funktionen"]:
            profil["funktionen"].append(neue_funktion)
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "zusaetzliche-aufgaben-zustaendigkeit",
            "url": zusatz_quelle["url"],
            "abgerufenAm": zusatz_quelle["abgerufenAm"],
            "sha256": zusatz_quelle["sha256"],
        })
        zusatz_beleg = {
            "datei": ZUSATZAUFGABEN_RESSOURCE,
            "kennung": zusatz_eintrag["kennung"],
            "region": zusatz_eintrag["region"],
            "bindungsart": zusatz_eintrag["bindungsart"],
            "person": zusatz_eintrag["person"],
            "funktion": zusatz_eintrag.get("funktion"),
            "amt": zusatz_eintrag.get("amt"),
            "aufgabenbindung": zusatz_eintrag.get("aufgabenbindung"),
            "stand": zusatz_eintrag.get("stand"),
            "seite": zusatz_eintrag.get("seite"),
            "abteilungen": zusatz_eintrag.get("abteilungen"),
            "zitat": zusatz_eintrag.get("zitat"),
            "abschnitt": zusatz_eintrag.get("abschnitt"),
            "rollenquelle": {
                "url": zusatz_eintrag["rollenquelle"].get("url"),
                "sha256": zusatz_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": zusatz_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": zusatz_quelle.get("datei"),
                "url": zusatz_quelle.get("url"),
                "finalUrl": zusatz_quelle.get("finalUrl"),
                "abgerufenAm": zusatz_quelle.get("abgerufenAm"),
                "sha256": zusatz_quelle.get("sha256"),
                "bytes": zusatz_quelle.get("bytes"),
            },
            "themen": list(zusatz_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        if zusatz_eintrag.get("aktuelleVerlinkung"):
            zusatz_beleg["aktuelleVerlinkung"] = dict(zusatz_eintrag["aktuelleVerlinkung"])
        achsen_geschlossen = True

    # Versionierte BMWSB-Aufgabenquittung: fuer die 2 freigegebenen personengebundenen
    # BMWSB-Aufgabenachsen (Sören Bartol Z I 3/W II/S I/B I/B II, Sabine Poschmann
    # Z II/W I/S II/S III) werden die ausdruecklichen Kurzthemen gesetzt und damit die
    # fachliche Achse geschlossen (Ausschuss ODER Thema). Bestehende Amtsrollen, Partei,
    # Mandatsart, Gremien und alle anderen Felder bleiben unveraendert; funktionen erhaelt
    # den getrennten Ableitungshinweis. Keine Hochstufung auf ganze Abteilungen, keine
    # persoenliche Position, keine freie Themen-/Zitatzuordnung. Die amtliche BMWSB-Quelle
    # steht in ``profil.offizielleQuellen`` und im Belegabschnitt ``bmwsbQuittung``.
    bmwsb_eintrag = (getattr(eingang, "bmwsb_by_kennung", None) or {}).get(mandatsId)
    bmwsb_beleg = None
    if bmwsb_eintrag is not None:
        verwendet = getattr(eingang, "bmwsb_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        bmwsb_quelle = bmwsb_eintrag["quelle"]
        profil["themen"] = list(bmwsb_eintrag["themen"])
        hinweis = bmwsb_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "bmwsb-aufgaben-zustaendigkeit",
            "url": bmwsb_quelle["url"],
            "abgerufenAm": bmwsb_quelle["abgerufenAm"],
            "sha256": bmwsb_quelle["sha256"],
        })
        bmwsb_beleg = {
            "datei": BMWSB_RESSOURCE,
            "kennung": bmwsb_eintrag["kennung"],
            "region": bmwsb_eintrag["region"],
            "bindungsart": bmwsb_eintrag["bindungsart"],
            "person": bmwsb_eintrag["person"],
            "aufgabenbindung": bmwsb_eintrag.get("aufgabenbindung"),
            "stand": bmwsb_eintrag.get("stand"),
            "seite": bmwsb_eintrag.get("seite"),
            "unterabteilungen": bmwsb_eintrag.get("unterabteilungen"),
            "rollenquelle": {
                "url": bmwsb_eintrag["rollenquelle"].get("url"),
                "sha256": bmwsb_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": bmwsb_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": bmwsb_quelle.get("datei"),
                "url": bmwsb_quelle.get("url"),
                "finalUrl": bmwsb_quelle.get("finalUrl"),
                "abgerufenAm": bmwsb_quelle.get("abgerufenAm"),
                "sha256": bmwsb_quelle.get("sha256"),
                "bytes": bmwsb_quelle.get("bytes"),
            },
            "themen": list(bmwsb_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        if bmwsb_eintrag.get("aktuelleVerlinkung"):
            bmwsb_beleg["aktuelleVerlinkung"] = dict(bmwsb_eintrag["aktuelleVerlinkung"])
        achsen_geschlossen = True

    # Versionierte Amthor-Einzelfallquittung: fuer den zuvor einzeln offenen
    # Rollenfall Philipp Amthor wird die freigegebene aktuelle Funktionsrolle
    # (Staatsminister fuer Bund-Laender-Zusammenarbeit beim Bundeskanzler, seit
    # 29. Juli 2026) genau einmal an bestehende funktionen angehaengt, das eine
    # amtlich abgeleitete Thema gesetzt und damit die fachliche Achse geschlossen
    # (Ausschuss ODER Thema). Bestehende Felder (Partei, Mandatsart, Gremien)
    # bleiben unveraendert; der getrennte Herkunftshinweis steht in funktionen.
    # Kein Digitalamt als aktuell, kein weiteres Ministerportfolio, keine
    # persoenliche Position, keine freie Themen-/Zitatzuordnung. Die amtliche
    # Zusatzquelle steht in ``profil.offizielleQuellen`` und im Belegabschnitt
    # ``amthorQuittung``.
    amthor_eintrag = (getattr(eingang, "amthor_by_kennung", None) or {}).get(mandatsId)
    amthor_beleg = None
    if amthor_eintrag is not None:
        verwendet = getattr(eingang, "amthor_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        amthor_quelle = amthor_eintrag["quelle"]
        profil["themen"] = list(amthor_eintrag["themen"])
        hinweis = amthor_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        neue_funktion = amthor_eintrag.get("funktion")
        if neue_funktion and neue_funktion not in profil["funktionen"]:
            profil["funktionen"].append(neue_funktion)
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "kanzleramt-aufgabe",
            "url": amthor_quelle["url"],
            "abgerufenAm": amthor_quelle["abgerufenAm"],
            "sha256": amthor_quelle["sha256"],
        })
        amthor_beleg = {
            "datei": AMTHOR_RESSOURCE,
            "kennung": amthor_eintrag["kennung"],
            "region": amthor_eintrag["region"],
            "bindungsart": amthor_eintrag["bindungsart"],
            "person": amthor_eintrag["person"],
            "funktion": amthor_eintrag["funktion"],
            "amtsbeginn": amthor_eintrag["amtsbeginn"],
            "rolleZitat": amthor_eintrag["rolleZitat"],
            "vorherigeRolle": amthor_eintrag["vorherigeRolle"],
            "rolleAbschnitt": amthor_eintrag["rolleAbschnitt"],
            "aufgabenH2": amthor_eintrag["aufgabenH2"],
            "aufgabenStarke": amthor_eintrag["aufgabenStarke"],
            "aufgabenzitat": amthor_eintrag["aufgabenzitat"],
            "quellpublikationsdatum": amthor_eintrag["quellpublikationsdatum"],
            "aufgabenbindung": amthor_eintrag["aufgabenbindung"],
            "rollenquelle": {
                "url": amthor_eintrag["rollenquelle"].get("url"),
                "sha256": amthor_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": amthor_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": amthor_quelle.get("datei"),
                "url": amthor_quelle.get("url"),
                "finalUrl": amthor_quelle.get("finalUrl"),
                "abgerufenAm": amthor_quelle.get("abgerufenAm"),
                "sha256": amthor_quelle.get("sha256"),
                "bytes": amthor_quelle.get("bytes"),
            },
            "aufgabenquelle": {
                "datei": amthor_eintrag["aufgabenquelle"].get("datei"),
                "url": amthor_eintrag["aufgabenquelle"].get("url"),
                "finalUrl": amthor_eintrag["aufgabenquelle"].get("finalUrl"),
                "abgerufenAm": amthor_eintrag["aufgabenquelle"].get("abgerufenAm"),
                "sha256": amthor_eintrag["aufgabenquelle"].get("sha256"),
                "bytes": amthor_eintrag["aufgabenquelle"].get("bytes"),
            },
            "themen": list(amthor_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Wahlausschuss-Aufgabenquittung: fuer die drei sonstigen
    # Gremien-Aufgabenachsen des Wahlausschusses (Haßelmann/Hoffmann/Miersch) wird
    # das enge amtlich abgeleitete Thema gesetzt (getrennter Herkunftshinweis in
    # funktionen) und damit die fachliche Achse geschlossen. Das belegte sonstige
    # Gremium (Wahlausschuss) und die bestehenden ordentlichen/stellvertretenden
    # Funktionen bleiben unveraendert; es wird NIE als regulaerer Ausschuss
    # zurueckgeschrieben, keine Umdeklarierung, keine Partei-/Mandatsartaenderung,
    # keine persoenliche politische Position. Die aktuelle Mitgliedschaft wird
    # eigenstaendig ueber ProfilePage.mainEntity.memberOf neu gebunden.
    wahlausschuss_eintrag = (getattr(eingang, "wahlausschuss_by_kennung", None) or {}).get(mandatsId)
    wahlausschuss_beleg = None
    if wahlausschuss_eintrag is not None:
        verwendet = getattr(eingang, "wahlausschuss_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        wahlausschuss_quelle = wahlausschuss_eintrag["quelle"]
        profil["themen"] = list(wahlausschuss_eintrag["themen"])
        hinweis = wahlausschuss_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "gremium-aufgabe",
            "url": wahlausschuss_quelle["url"],
            "abgerufenAm": wahlausschuss_quelle["abgerufenAm"],
            "sha256": wahlausschuss_quelle["sha256"],
        })
        wahlausschuss_beleg = {
            "datei": WAHLAUSSCHUSS_RESSOURCE,
            "kennung": wahlausschuss_eintrag["kennung"],
            "region": wahlausschuss_eintrag["region"],
            "person": wahlausschuss_eintrag["person"],
            "gremium": wahlausschuss_eintrag["gremium"],
            "gremienUrl": wahlausschuss_eintrag["gremienUrl"],
            "roleName": wahlausschuss_eintrag["roleName"],
            "startDate": wahlausschuss_eintrag["startDate"],
            "aufgabenbindung": wahlausschuss_eintrag["aufgabenbindung"],
            "rollenquelle": {
                "url": wahlausschuss_eintrag["rollenquelle"].get("url"),
                "sha256": wahlausschuss_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": wahlausschuss_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": wahlausschuss_quelle.get("datei"),
                "url": wahlausschuss_quelle.get("url"),
                "finalUrl": wahlausschuss_quelle.get("finalUrl"),
                "abgerufenAm": wahlausschuss_quelle.get("abgerufenAm"),
                "sha256": wahlausschuss_quelle.get("sha256"),
                "bytes": wahlausschuss_quelle.get("bytes"),
            },
            "themen": list(wahlausschuss_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Fraktionsvorsitz-Zweierquittung: fuer die zuletzt fehlenden beiden
    # aktuellen Funktionsfelder (Britta Haßelmann, Dr. Matthias Miersch) wird NUR die
    # freigegebene aktuelle Funktionsrolle dedupliziert an bestehende funktionen
    # angehaengt und die amtliche Fraktionsseite als offizielle Quelle (art
    # fraktion-profil) gefuehrt. Es entstehen KEINE Themen, keine aus der
    # Fraktionsrolle abgeleitete Parteimitgliedschaft, keine persoenlichen Positionen
    # und keine Amtsbeginn-Daten; die fachliche Achse bleibt unveraendert offen.
    fraktionsvorsitz_eintrag = (getattr(eingang, "fraktionsvorsitz_by_kennung", None) or {}).get(mandatsId)
    fraktionsvorsitz_beleg = None
    if fraktionsvorsitz_eintrag is not None:
        verwendet = getattr(eingang, "fraktionsvorsitz_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        fraktionsvorsitz_quelle = fraktionsvorsitz_eintrag["quelle"]
        profil.setdefault("funktionen", [])
        neue_funktion = fraktionsvorsitz_eintrag["funktion"]
        if neue_funktion not in profil["funktionen"]:
            profil["funktionen"].append(neue_funktion)
        profil["offizielleQuellen"].append({
            "art": "fraktion-profil",
            "url": fraktionsvorsitz_quelle["url"],
            "abgerufenAm": fraktionsvorsitz_quelle["abgerufenAm"],
            "sha256": fraktionsvorsitz_quelle["sha256"],
        })
        fraktionsvorsitz_beleg = {
            "datei": FRAKTIONSVORSITZ_RESSOURCE,
            "kennung": fraktionsvorsitz_eintrag["kennung"],
            "region": fraktionsvorsitz_eintrag["region"],
            "person": fraktionsvorsitz_eintrag["person"],
            "funktion": fraktionsvorsitz_eintrag["funktion"],
            "rolleAbschnitt": fraktionsvorsitz_eintrag["rolleAbschnitt"],
            "rolleZitat": fraktionsvorsitz_eintrag["rolleZitat"],
            "rollenquelle": {
                "datei": fraktionsvorsitz_eintrag["rollenquelle"].get("datei"),
                "url": fraktionsvorsitz_eintrag["rollenquelle"].get("url"),
                "finalUrl": fraktionsvorsitz_eintrag["rollenquelle"].get("finalUrl"),
                "abgerufenAm": fraktionsvorsitz_eintrag["rollenquelle"].get("abgerufenAm"),
                "sha256": fraktionsvorsitz_eintrag["rollenquelle"].get("sha256"),
                "bytes": fraktionsvorsitz_eintrag["rollenquelle"].get("bytes"),
                "http": fraktionsvorsitz_eintrag["rollenquelle"].get("http"),
                "abrufStatus": fraktionsvorsitz_eintrag["rollenquelle"].get("abrufStatus"),
            },
            "quelle": {
                "datei": fraktionsvorsitz_quelle.get("datei"),
                "url": fraktionsvorsitz_quelle.get("url"),
                "finalUrl": fraktionsvorsitz_quelle.get("finalUrl"),
                "abgerufenAm": fraktionsvorsitz_quelle.get("abgerufenAm"),
                "sha256": fraktionsvorsitz_quelle.get("sha256"),
                "bytes": fraktionsvorsitz_quelle.get("bytes"),
                "http": fraktionsvorsitz_quelle.get("http"),
                "abrufStatus": fraktionsvorsitz_quelle.get("abrufStatus"),
            },
        }

    # Versionierte Jarzombek-Einzelfallquittung: fuer den zuvor offenen Fachachsenfall
    # Thomas Jarzombek entstehen ausschliesslich die vier amtlich abgeleiteten Themen
    # (BMDS-Abteilungen DS/DI/DW), der getrennte Herkunftshinweis und die amtliche
    # BMDS-Quelle. Die bestehende aktuelle PSts-Rolle aus der 54er Rollenquittung und
    # alle bestehenden offiziellen Quellen bleiben unveraendert erhalten; es entsteht
    # KEINE neue Funktionsrolle, kein Scheinausschuss und keine Partei-/Mandatsartaenderung.
    # Die Abteilungen stammen aus genau EINER echten geschlossenen HTML-Karte
    # article#c5755 und dem amtlichen Organigramm-JSON.
    jarzombek_eintrag = (getattr(eingang, "jarzombek_by_kennung", None) or {}).get(mandatsId)
    jarzombek_beleg = None
    if jarzombek_eintrag is not None:
        verwendet = getattr(eingang, "jarzombek_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        jarzombek_quelle = jarzombek_eintrag["quelle"]
        profil["themen"] = list(jarzombek_eintrag["themen"])
        hinweis = jarzombek_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "bmds-abteilungszustaendigkeit",
            "url": jarzombek_quelle["url"],
            "abgerufenAm": jarzombek_quelle["abgerufenAm"],
            "sha256": jarzombek_quelle["sha256"],
        })
        jarzombek_beleg = {
            "datei": JARZOMBEK_RESSOURCE,
            "kennung": jarzombek_eintrag["kennung"],
            "region": jarzombek_eintrag["region"],
            "bindungsart": jarzombek_eintrag["bindungsart"],
            "person": jarzombek_eintrag["person"],
            "funktion": jarzombek_eintrag["funktion"],
            "amt": jarzombek_eintrag["amt"],
            "stand": jarzombek_eintrag["stand"],
            "aufgabenbindung": jarzombek_eintrag["aufgabenbindung"],
            "abteilungen": [dict(k) for k in jarzombek_eintrag["abteilungen"]],
            "karte": dict(jarzombek_eintrag["karte"]),
            "rollenquelle": {
                "url": jarzombek_eintrag["rollenquelle"].get("url"),
                "sha256": jarzombek_eintrag["rollenquelle"].get("sha256"),
                "abgerufenAm": jarzombek_eintrag["rollenquelle"].get("abgerufenAm"),
            },
            "quelle": {
                "datei": jarzombek_quelle.get("datei"),
                "url": jarzombek_quelle.get("url"),
                "finalUrl": jarzombek_quelle.get("finalUrl"),
                "abgerufenAm": jarzombek_quelle.get("abgerufenAm"),
                "sha256": jarzombek_quelle.get("sha256"),
                "bytes": jarzombek_quelle.get("bytes"),
            },
            "organigramm": {
                "datei": jarzombek_eintrag["organigramm"].get("datei"),
                "url": jarzombek_eintrag["organigramm"].get("url"),
                "finalUrl": jarzombek_eintrag["organigramm"].get("finalUrl"),
                "abgerufenAm": jarzombek_eintrag["organigramm"].get("abgerufenAm"),
                "sha256": jarzombek_eintrag["organigramm"].get("sha256"),
                "bytes": jarzombek_eintrag["organigramm"].get("bytes"),
            },
            "themen": list(jarzombek_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Kloeckner-Einzelfallquittung: fuer den zuvor offenen Fachachsenfall
    # Julia Klöckner entstehen ausschliesslich die zwei amtlich abgeleiteten Themen
    # (Bundestagsverwaltung, Parteienfinanzierung), der getrennte Herkunftshinweis und die
    # amtliche Praesidiums-Quelle. Die bestehende aktuelle Rolle aus der 54er
    # Rollenquittung und alle bestehenden offiziellen Quellen bleiben unveraendert
    # erhalten; es entsteht KEINE neue Funktionsrolle, kein Scheinausschuss und keine
    # Partei-/Mandatsartaenderung. Die Aufgaben stammen aus genau dem ZWEITEN eigenen
    # Absatz des geschlossenen H2-Abschnitts "An der Spitze der Bundestagsverwaltung".
    kloeckner_eintrag = (getattr(eingang, "kloeckner_by_kennung", None) or {}).get(mandatsId)
    kloeckner_beleg = None
    if kloeckner_eintrag is not None:
        verwendet = getattr(eingang, "kloeckner_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        kloeckner_quelle = kloeckner_eintrag["quelle"]
        profil["themen"] = list(kloeckner_eintrag["themen"])
        hinweis = kloeckner_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "praesidentinnen-aufgabe",
            "url": kloeckner_quelle["url"],
            "abgerufenAm": kloeckner_quelle["abgerufenAm"],
            "sha256": kloeckner_quelle["sha256"],
        })
        kloeckner_beleg = {
            "datei": KLOECKNER_RESSOURCE,
            "kennung": kloeckner_eintrag["kennung"],
            "region": kloeckner_eintrag["region"],
            "bindungsart": kloeckner_eintrag["bindungsart"],
            "person": kloeckner_eintrag["person"],
            "funktion": kloeckner_eintrag["funktion"],
            "funktionstext": kloeckner_eintrag["funktionstext"],
            "abschnitt": kloeckner_eintrag["abschnitt"],
            "ersterAbsatz": kloeckner_eintrag["ersterAbsatz"],
            "absatz": kloeckner_eintrag["absatz"],
            "aufgabenbindung": kloeckner_eintrag["aufgabenbindung"],
            "personenquelle": {
                "datei": kloeckner_eintrag["personenquelle"].get("datei"),
                "url": kloeckner_eintrag["personenquelle"].get("url"),
                "finalUrl": kloeckner_eintrag["personenquelle"].get("finalUrl"),
                "abgerufenAm": kloeckner_eintrag["personenquelle"].get("abgerufenAm"),
                "sha256": kloeckner_eintrag["personenquelle"].get("sha256"),
                "bytes": kloeckner_eintrag["personenquelle"].get("bytes"),
            },
            "quelle": {
                "datei": kloeckner_quelle.get("datei"),
                "url": kloeckner_quelle.get("url"),
                "finalUrl": kloeckner_quelle.get("finalUrl"),
                "abgerufenAm": kloeckner_quelle.get("abgerufenAm"),
                "sha256": kloeckner_quelle.get("sha256"),
                "bytes": kloeckner_quelle.get("bytes"),
            },
            "themen": list(kloeckner_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Rohde-Einzelfallquittung: fuer den zuvor offenen Fachachsenfall
    # Dennis Rohde entstehen ausschliesslich das eine amtlich abgeleitete Thema
    # (Bundeshaushalt), der getrennte Herkunftshinweis und die amtliche
    # BMF-Organisationsplan-Quelle. Die bestehende aktuelle PSts-Rolle aus der
    # 54er Rollenquittung und alle bestehenden offiziellen Quellen bleiben
    # unveraendert erhalten; es entsteht KEINE neue Funktionsrolle, kein
    # Scheinausschuss und keine Partei-/Mandatsartaenderung. Das Thema stammt
    # ausschliesslich aus Rohdes eigenem Kasten auf Seite 1 des amtlich von der
    # Landingpage verlinkten v=32-Organisationsplans (Originalbytes nur ueber
    # Hash/Bytezahl/Stand/Seite, KEIN PDF-Parser).
    rohde_eintrag = (getattr(eingang, "rohde_by_kennung", None) or {}).get(mandatsId)
    rohde_beleg = None
    if rohde_eintrag is not None:
        verwendet = getattr(eingang, "rohde_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        rohde_quelle = rohde_eintrag["quelle"]
        rohde_verlinkung = rohde_eintrag["aktuelleVerlinkung"]
        profil["themen"] = list(rohde_eintrag["themen"])
        hinweis = rohde_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "bmf-aufgabenbindung",
            "url": rohde_quelle["url"],
            "abgerufenAm": rohde_quelle["abgerufenAm"],
            "sha256": rohde_quelle["sha256"],
        })
        rohde_beleg = {
            "datei": ROHDE_RESSOURCE,
            "kennung": rohde_eintrag["kennung"],
            "region": rohde_eintrag["region"],
            "bindungsart": rohde_eintrag["bindungsart"],
            "person": rohde_eintrag["person"],
            "funktion": rohde_eintrag["funktion"],
            "funktionstext": rohde_eintrag["funktionstext"],
            "amt": rohde_eintrag["amt"],
            "aufgabenbindung": rohde_eintrag["aufgabenbindung"],
            "fachurteil": dict(rohde_eintrag["fachurteil"]),
            "personenquelle": {
                "datei": rohde_eintrag["personenquelle"].get("datei"),
                "url": rohde_eintrag["personenquelle"].get("url"),
                "finalUrl": rohde_eintrag["personenquelle"].get("finalUrl"),
                "abgerufenAm": rohde_eintrag["personenquelle"].get("abgerufenAm"),
                "sha256": rohde_eintrag["personenquelle"].get("sha256"),
                "bytes": rohde_eintrag["personenquelle"].get("bytes"),
            },
            "quelle": {
                "datei": rohde_quelle.get("datei"),
                "url": rohde_quelle.get("url"),
                "finalUrl": rohde_quelle.get("finalUrl"),
                "abgerufenAm": rohde_quelle.get("abgerufenAm"),
                "sha256": rohde_quelle.get("sha256"),
                "bytes": rohde_quelle.get("bytes"),
                "stand": rohde_quelle.get("stand"),
                "seite": rohde_quelle.get("seite"),
            },
            "aktuelleVerlinkung": {
                "datei": rohde_verlinkung.get("datei"),
                "url": rohde_verlinkung.get("url"),
                "finalUrl": rohde_verlinkung.get("finalUrl"),
                "abgerufenAm": rohde_verlinkung.get("abgerufenAm"),
                "sha256": rohde_verlinkung.get("sha256"),
                "bytes": rohde_verlinkung.get("bytes"),
                "linktext": rohde_verlinkung.get("linktext"),
                "href": rohde_verlinkung.get("href"),
            },
            "themen": list(rohde_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Versionierte Merz-Einzelfallquittung: fuer den zuvor offenen Fachachsenfall
    # Friedrich Merz entstehen ausschliesslich das eine amtlich abgeleitete Thema
    # "Richtlinien der Regierungspolitik" (am Original woertlich als
    # Richtlinien-Kompetenz belegt), der getrennte Herkunftshinweis und die amtliche
    # Bundesregierungs-Quelle. Die bestehende aktuelle Rolle Bundeskanzler aus der
    # 54er Rollenquittung und alle bestehenden offiziellen Quellen bleiben
    # unveraendert erhalten; es entsteht KEINE neue Funktionsrolle, kein
    # Scheinausschuss und keine Partei-/Mandatsartaenderung. Person und Amt stammen
    # nur aus dem echten sichtbaren eigenen Artikelkopf (nicht Bild/JSON-LD), die
    # Aufgabe nur aus dem geschlossenen H2-Abschnitt "Richtlinien-Kompetenz" des
    # eigenen innersten div.bpa-richtext. Keine konkreten politischen Positionen,
    # Koalitionsziele, Ressorts oder allgemeinen Ministeriumsthemen.
    merz_eintrag = (getattr(eingang, "merz_by_kennung", None) or {}).get(mandatsId)
    merz_beleg = None
    if merz_eintrag is not None:
        verwendet = getattr(eingang, "merz_verwendet", None)
        if verwendet is not None:
            verwendet.add(mandatsId)
        merz_quelle = merz_eintrag["quelle"]
        profil["themen"] = list(merz_eintrag["themen"])
        hinweis = merz_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "kanzler-richtlinienkompetenz",
            "url": merz_quelle["url"],
            "abgerufenAm": merz_quelle["abgerufenAm"],
            "sha256": merz_quelle["sha256"],
        })
        merz_beleg = {
            "datei": MERZ_RESSOURCE,
            "kennung": merz_eintrag["kennung"],
            "region": merz_eintrag["region"],
            "bindungsart": merz_eintrag["bindungsart"],
            "person": merz_eintrag["person"],
            "funktion": merz_eintrag["funktion"],
            "funktionstext": merz_eintrag["funktionstext"],
            "artikelkopf": merz_eintrag["artikelkopf"],
            "artikeltitel": merz_eintrag["artikeltitel"],
            "abschnitt": merz_eintrag["abschnitt"],
            "absaetze": list(merz_eintrag["absaetze"]),
            "aufgabenbindung": merz_eintrag["aufgabenbindung"],
            "personenquelle": {
                "datei": merz_eintrag["personenquelle"].get("datei"),
                "url": merz_eintrag["personenquelle"].get("url"),
                "finalUrl": merz_eintrag["personenquelle"].get("finalUrl"),
                "abgerufenAm": merz_eintrag["personenquelle"].get("abgerufenAm"),
                "sha256": merz_eintrag["personenquelle"].get("sha256"),
                "bytes": merz_eintrag["personenquelle"].get("bytes"),
                "http": merz_eintrag["personenquelle"].get("http"),
                "abrufStatus": merz_eintrag["personenquelle"].get("abrufStatus"),
            },
            "quelle": {
                "datei": merz_quelle.get("datei"),
                "url": merz_quelle.get("url"),
                "finalUrl": merz_quelle.get("finalUrl"),
                "abgerufenAm": merz_quelle.get("abgerufenAm"),
                "sha256": merz_quelle.get("sha256"),
                "bytes": merz_quelle.get("bytes"),
                "http": merz_quelle.get("http"),
                "abrufStatus": merz_quelle.get("abrufStatus"),
            },
            "themen": list(merz_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Woidke: genau die amtlich belegte Richtlinienkompetenz des bereits als
    # Ministerpraesident belegten Profils. Keine neue Rolle und keine weiteren
    # Themen aus den nachfolgenden Staatskanzlei-Abschnitten.
    woidke_eintrag = (getattr(eingang, "woidke_by_kennung", None) or {}).get(mandatsId)
    woidke_beleg = None
    if woidke_eintrag is not None:
        eingang.woidke_verwendet.add(mandatsId)
        woidke_quelle = woidke_eintrag["quelle"]
        profil["themen"] = list(woidke_eintrag["themen"])
        hinweis = woidke_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "ministerpraesident-richtlinienkompetenz",
            "url": woidke_quelle["url"],
            "abgerufenAm": woidke_quelle["abgerufenAm"],
            "sha256": woidke_quelle["sha256"],
        })
        woidke_beleg = {
            "datei": WOIDKE_RESSOURCE,
            "kennung": woidke_eintrag["kennung"],
            "region": woidke_eintrag["region"],
            "bindungsart": woidke_eintrag["bindungsart"],
            "person": woidke_eintrag["person"],
            "funktion": woidke_eintrag["funktion"],
            "rollenzitat": woidke_eintrag["rollenzitat"],
            "abschnitt": woidke_eintrag["abschnitt"],
            "aufgabenabsatz": woidke_eintrag["aufgabenabsatz"],
            "aufgabenbindung": woidke_eintrag["aufgabenbindung"],
            "personenquelle": dict(woidke_eintrag["personenquelle"]),
            "quelle": dict(woidke_quelle),
            "themen": list(woidke_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # Wegner: genau die amtlich belegte Richtlinienkompetenz des bereits als
    # Regierender Buergermeister belegten Berliner Profils. Keine neue Rolle und
    # keine weiteren Themen aus den uebrigen Listenelementen des Geschaeftsbereichs I.
    wegner_eintrag = (getattr(eingang, "wegner_by_kennung", None) or {}).get(mandatsId)
    wegner_beleg = None
    if wegner_eintrag is not None:
        eingang.wegner_verwendet.add(mandatsId)
        wegner_quelle = wegner_eintrag["quelle"]
        profil["themen"] = list(wegner_eintrag["themen"])
        hinweis = wegner_eintrag["ableitungsHinweis"]
        profil.setdefault("funktionen", [])
        if hinweis not in profil["funktionen"]:
            profil["funktionen"].append(hinweis)
        profil["offizielleQuellen"].append({
            "art": "regierender-buergermeister-richtlinienkompetenz",
            "url": wegner_quelle["url"],
            "abgerufenAm": wegner_quelle["abgerufenAm"],
            "sha256": wegner_quelle["sha256"],
        })
        wegner_beleg = {
            "datei": WEGNER_RESSOURCE,
            "kennung": wegner_eintrag["kennung"],
            "region": wegner_eintrag["region"],
            "bindungsart": wegner_eintrag["bindungsart"],
            "person": wegner_eintrag["person"],
            "funktion": wegner_eintrag["funktion"],
            "rollenzitat": wegner_eintrag["rollenzitat"],
            "abschnitt": wegner_eintrag["abschnitt"],
            "aufgabenabsatz": wegner_eintrag["aufgabenabsatz"],
            "aufgabenbindung": wegner_eintrag["aufgabenbindung"],
            "rollenquelle": dict(wegner_eintrag["rollenquelle"]),
            "personenquelle": dict(wegner_eintrag["personenquelle"]),
            "quelle": dict(wegner_quelle),
            "themen": list(wegner_eintrag["themen"]),
            "ableitungsHinweis": hinweis,
        }
        achsen_geschlossen = True

    # ── Feldbelege (Herkunft je Feld) ─────────────────────────────────────────
    feldbelege = dict(extraktion.get("feldbelege", {}))
    feldbelege["mandatsId"] = "Parlament + amtlicheKennung, in das ID-Muster von lib/helmut/profil-import.js normalisiert"
    if ressort_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Ressortquittung {RESSORTAKSEN_RESSOURCE}: gepruefte "
            f"Ressortbegriffe mit Herkunft aus Region {ressort_beleg['region']} + Ableitungskennzeichnung + "
            f"amtlichem Ressort; Ressort im zusammenhaengenden woertlichen Zitat belegt "
            f"(URL + sha256 + Abrufzeit + Datei der amtlichen Quelle gebunden)"
        )
    elif aufgaben_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Aufgabenquittung {AUFGABENACHSEN_RESSOURCE}: gepruefte "
            f"Aufgabenbegriffe mit Herkunft aus {aufgaben_beleg['bindungsart']} der kanonischen Person "
            f"{aufgaben_beleg['person']} + Ableitungskennzeichnung; Themen nur im personengebundenen "
            f"amtlichen Aufgabenabschnitt belegt (URL + sha256 + Abrufzeit + Datei der amtlichen Quelle gebunden)"
        )
    elif beratende_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte beratende Achsenquittung {BERATENDEACHSEN_RESSOURCE}: "
            f"Kurzthemen aus dem ausdruecklichen Ausschussnamen {beratende_beleg['ausschuss']} "
            f"(amtlich abgeleitet) + Ableitungskennzeichnung; die beratende Rolle "
            f"({beratende_beleg['rolle']}) bleibt in funktionen, KEINE ordentliche/stellvertretende "
            f"Ausschussmitgliedschaft (URL + sha256 + Bytezahl + Abrufzeit der amtlichen Profilquelle gebunden)"
        )
    elif zusatz_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Zusatzaufgabenquittung {ZUSATZAUFGABEN_RESSOURCE}: "
            f"belegte Kurzthemen aus {zusatz_beleg['bindungsart']} der kanonischen Person "
            f"{zusatz_beleg['person']} (amtlich abgeleitet) + Ableitungskennzeichnung; "
            f"bestehende Rollen bleiben erhalten, keine persoenliche politische Position "
            f"(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + Datei der amtlichen Quelle gebunden)"
        )
    elif bmwsb_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte BMWSB-Aufgabenquittung {BMWSB_RESSOURCE}: belegte "
            f"Kurzthemen aus {bmwsb_beleg['bindungsart']} der kanonischen Person "
            f"{bmwsb_beleg['person']} (amtlich abgeleitet), nur die persoenlich zugewiesenen "
            f"Unterbereiche, keine Hochstufung auf ganze Abteilungen und keine persoenliche "
            f"politische Position; bestehende Rollen bleiben erhalten "
            f"(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + Datei des amtlichen v10-Organs "
            f"und der aktuellen Landingpage gebunden)"
        )
    elif amthor_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Amthor-Einzelfallquittung {AMTHOR_RESSOURCE}: das eine "
            f"amtlich abgeleitete Thema aus genau einem echten li mit strong "
            f"{amthor_beleg['aufgabenStarke']!r} und {amthor_beleg['person']!r} unter der Personalien-h2 "
            f"(Ankuendigung vom {amthor_beleg['quellpublikationsdatum']}); die aktuelle Funktionsrolle "
            f"stammt ausschliesslich aus dem geschlossenen eigenen div.bpa-richtext-Lebenslauf-p "
            f"({amthor_beleg['amtsbeginn']}) und nicht aus Meta/Bildunterschrift; kein Digitalamt als "
            f"aktuell, keine persoenliche politische Position, keine freie Themen-/Zitatzuordnung "
            f"(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + Datei beider Zusatzquellen, Original UND "
            f"Metadaten, gebunden)"
        )
    elif wahlausschuss_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Wahlausschuss-Aufgabenquittung {WAHLAUSSCHUSS_RESSOURCE}: das enge "
            f"amtlich abgeleitete Thema aus dem geschlossenen aktuellen Gremienaufgabenabsatz unter "
            f"#arbeit-und-aufgaben und .bt-standard-content (genau ein eigener p mit vollstaendigem Wortlaut "
            f"und 21. Wahlperiode); die aktuelle Mitgliedschaft stammt aus genau EINEM ProfilePage.mainEntity "
            f"in genau EINER echten Role zum Wahlausschuss (exakter roleName, startDate <= Abrufzeit, kein "
            f"endDate); das sonstige Gremium und die bestehenden Funktionen bleiben unveraendert, keine "
            f"Umdeklarierung, keine persoenliche politische Position (URL + finalUrl + sha256 + Bytezahl + "
            f"Abrufzeit + HTTP + Datei beider Quellen, Original UND Metadaten, gebunden)"
        )
    elif jarzombek_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Jarzombek-Abteilungsquittung {JARZOMBEK_RESSOURCE}: die vier "
            f"amtlich abgeleiteten Themen stammen aus genau EINER echten geschlossenen HTML-Karte "
            f"article#{jarzombek_beleg['karte']['id']} des amtlichen BMDS-Organisationsauftritts "
            f"(H2-Personenlink auf die kanonische Personen-URL) und den drei eindeutigen echten "
            f"Abteilungsknoten DS/DI/DW des amtlichen Organigramm-JSON (Stand {jarzombek_beleg['stand']}, "
            f"excludePersonalData=true); das JSON belegt NUR Abteilungskennungen/-titel, NICHT die Person; "
            f"nur die vier freigegebenen Themen, keine Schemata/Fremdabteilungen, keine persoenliche "
            f"politische Position (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei beider "
            f"Quellen, Original UND Metadaten, gebunden)"
        )
    elif kloeckner_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Kloeckner-Aufgabenquittung {KLOECKNER_RESSOURCE}: die zwei "
            f"amtlich abgeleiteten Themen (Bundestagsverwaltung, Parteienfinanzierung) stammen aus genau "
            f"dem ZWEITEN eigenen Absatz des geschlossenen H2-Abschnitts "
            f"{kloeckner_beleg['abschnitt']!r} der amtlichen Praesidiumsseite; der erste Absatz, sonstige "
            f"Praesidiums-/Aeltestenratsarbeit, angrenzende Abschnitte und der --hidden-Linkhilfetext sind "
            f"keine Personenaufgaben, keine allgemeine Polizei-/Innenpolitik, keine persoenliche politische "
            f"Position (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei der amtlichen Quelle, "
            f"Original UND Metadaten, gebunden)"
        )
    elif rohde_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Rohde-Einzelfallquittung {ROHDE_RESSOURCE}: das eine amtlich "
            f"abgeleitete Thema (Bundeshaushalt) stammt ausschliesslich aus Rohdes eigenem, klar umrandetem "
            f"Kasten auf Seite 1 des amtlich von der Landingpage verlinkten v=32-BMF-Organisationsplans "
            f"(Stand {rohde_beleg['quelle']['stand']}); die Originalbytes werden NUR ueber URL + finalUrl + "
            f"sha256 + Bytezahl + Abrufzeit + HTTP + Datei (Original UND Metadaten) gebunden, es gibt KEINEN "
            f"automatischen PDF-Parser und keine erfundene Textextraktionsquelle; keine Nachbarkaesten "
            f"(Schrodi Steuerpolitik, Kaiser Ostdeutschland), keine beamteten Staatssekretaere, keine ganzen "
            f"Abteilungen, keine Kanzleramtsfunktion, keine persoenliche politische Position"
        )
    elif merz_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Merz-Einzelfallquittung {MERZ_RESSOURCE}: das eine amtlich "
            f"abgeleitete Thema (Richtlinien der Regierungspolitik, am Original woertlich als "
            f"Richtlinien-Kompetenz belegt) stammt ausschliesslich aus dem geschlossenen H2-Abschnitt "
            f"{merz_beleg['abschnitt']!r} des eigenen innersten div.bpa-richtext im Artikelinhalt "
            f"(#rs_reading_area_content); Figuren/Bildunterschriften, die Nachbar-H2-Abschnitte "
            f"(Regierungs-Bildung, Ressort-Prinzip, Regierungs-Verantwortung, Regierungs-Koalition, "
            f"Vize-Kanzler, Zustimmung zur Regierungs-Politik) und verborgene/inerte Inhalte sind kein "
            f"Beleg; die Person und das Amt Bundes-Kanzler stammen ausschliesslich aus dem echten "
            f"sichtbaren eigenen Artikelkopf (header.bpa-article-header; nicht Bild-Alt, nicht "
            f"Bildunterschrift, nicht JSON-LD); keine konkreten politischen Positionen, Koalitionsziele, "
            f"Ressorts oder allgemeinen Ministeriumsthemen (URL + finalUrl + sha256 + Bytezahl + Abrufzeit "
            f"+ HTTP + Datei der amtlichen Quelle, Original UND Metadaten, gebunden)"
        )
    elif woidke_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Woidke-Einzelfallquittung {WOIDKE_RESSOURCE}: genau das "
            f"amtlich abgeleitete Thema Richtlinien der Landespolitik aus dem ersten direkten, sichtbaren "
            f"Absatz des eigenen Inhaltsbereichs {woidke_beleg['abschnitt']!r}; nachfolgende Staatskanzlei-, "
            "Ressort-, Koalitions- und Nachrichtenthemen sind kein Beleg (URL + finalUrl + sha256 + "
            "Bytezahl + Abrufzeit + HTTP + Datei, Original UND Metadaten, gebunden)"
        )
    elif wegner_beleg is not None:
        feldbelege["themen"] = (
            f"vom Orchestrator gepruefte Wegner-Einzelfallquittung {WEGNER_RESSOURCE}: genau das "
            f"amtlich abgeleitete Thema Richtlinien der Regierungspolitik aus dem ersten eigenen "
            f"Listenelement des eigenen H2-Geschaeftsbereichs {wegner_beleg['abschnitt']!r}; alle "
            "uebrigen Listenelemente dieses Geschaeftsbereichs (Geschaeftsverteilung, Protokoll, Presse, "
            "Hauptstadtvertretung, Medien, Digitales, Wohnungsbau, Klimaschutz, Europa usw.) sind kein "
            "Beleg (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei, Original UND Metadaten, "
            "gebunden)"
        )
    feldbelege["bundesland"] = (
        "amtliche Mandatsachse der Bundestagsseite (ProfilePage.hasPart/Wahlkreissuche bzw. Landesliste)"
        if parlament == "bundestag"
        else "Landtagsmandat des jeweiligen Parlaments"
    )
    feldbelege["partei"] = parteinachweis["herkunft"]
    if parteinachweis["status"] == "parteilos":
        feldbelege["parteiStatus"] = f"amtlich belegt parteilos, NICHT als Parteiname uebernommen: {parteinachweis['beleg']}"
    elif parteinachweis["status"] == "belegt":
        feldbelege["parteiWert"] = parteinachweis["beleg"]
    if parteinachweis.get("quittung"):
        feldbelege["parteiQuelle"] = (
            f"{parteinachweis.get('quittungDatei', PARTEIFELDPRUEFUNG_RESSOURCE)}: "
            f"{parteinachweis['quittung']['url']} "
            f"sha256 {parteinachweis['quittung']['sha256']}"
        )
    if landtag_mandat and landtag_mandat.get("quelle") == "profilkopf" and landtag_mandat["art"] != "offen":
        feldbelege["region"] = (
            f"amtlicher Profilkopf (HTML), ausdrueckliche Angabe: {landtag_mandat.get('beleg', '')}"
        )
    if mandatsart_quittung is not None:
        feldbelege["region"] = (
            f"versionierte lokale Mandatsartenquittung {MANDATSARTEN_BB_RESSOURCE} "
            f"(amtliche Uebersicht, URL UND sha256 gebunden); nur Mandatsart Landesliste "
            f"und Region Brandenburg uebernommen — NICHT die Listenbeschriftung und NICHT der Listenplatz"
        )
    if mandatsart_quittung_be is not None:
        feldbelege["region"] = (
            f"versionierte lokale Berliner Mandatsartenquittung {MANDATSARTEN_BE_RESSOURCE} "
            f"(amtliches Handbuch-PDF Stand 8.10.2025, Seite 204 linke Spalte, URL UND sha256 UND "
            f"Bytezahl UND Abrufzeit gebunden, woertliche Transkription); nur Mandatsart und Region "
            f"uebernommen — NICHT Partei/Fraktion des historischen Einzugs und kein Direktwahlkreis"
        )
    if rollen_beleg and rollen_beleg["funktionen"]:
        feldbelege["funktionen"] = (
            f"vom Orchestrator gepruefte Rollenquittung {PROFILROLLEN_RESSOURCE} "
            f"(amtlicher Abschnitt, URL UND sha256 gebunden, Zitat woertlich); nur der freigegebene "
            f"Wortlaut wurde an bestehende funktionen angefuegt — keine eigene fachliche Achse"
        )
        if profil_roh.get("funktionen") or zusatz_funktionen:
            feldbelege["funktionen"] += (
                "; zusaetzlich memberOf-Rollen der Bundestagsseite bzw. Mitgliedschaften in belegten "
                "sonstigen Gremien rollengetreu als Funktion erhalten"
            )
    elif profil.get("funktionen"):
        feldbelege["funktionen"] = (
            "memberOf-Rollen der Bundestagsseite, roh als belegte Strings; beratende Rollen sind keine "
            "ordentliche Mitgliedschaft; Mitgliedschaften in belegten sonstigen Gremien bleiben "
            "rollengetreu als Funktion erhalten"
        )
    if weitere_gremien_beleg:
        feldbelege["weitereGremien"] = (
            "amtliches JSON-LD (ProfilePage.mainEntity.memberOf) mit Original-Rolle UND Original-URL; "
            "ausdruecklich NICHT als staendiger Ausschuss der laufenden Wahlperiode gefuehrt"
        )

    if ressort_beleg is not None:
        feldbelege["funktionen"] += "; zusaetzlich gekennzeichneter Ableitungshinweis zu den Ressortthemen (keine persoenliche Position)"
    if aufgaben_beleg is not None:
        if "funktionen" not in feldbelege:
            feldbelege["funktionen"] = (
                "bestehende belegte Funktionen bleiben unveraendert; kein regierungsrolle-Schema"
            )
        feldbelege["funktionen"] += (
            "; zusaetzlich gekennzeichneter Ableitungshinweis zur amtlichen Aufgabenbindung "
            "(konkrete Aufgabenbindung, keine persoenliche Position)"
        )
    if beratende_beleg is not None:
        if "funktionen" not in feldbelege:
            feldbelege["funktionen"] = (
                "bestehende belegte Funktionen bleiben unveraendert; kein regierungsrolle-Schema"
            )
        feldbelege["funktionen"] += (
            "; zusaetzlich gekennzeichneter Ableitungshinweis zur beratenden Ausschussarbeit "
            "(keine ordentliche/stellvertretende Mitgliedschaft, keine persoenliche Position)"
        )
    if amthor_beleg is not None:
        feldbelege["funktionen"] = (
            f"vom Orchestrator gepruefte Amthor-Einzelfallquittung {AMTHOR_RESSOURCE}: die freigegebene "
            f"aktuelle Funktionsrolle {amthor_beleg['funktion']!r} wurde genau einmal an bestehende "
            f"funktionen angehaengt; der historische 54er-Eintrag bleibt unveraendert offen (KEINE "
            f"Rolllockerung, separate Neubindung). Zusaetzlich der getrennte Herkunftshinweis zur amtlichen "
            f"Aufgabenbindung; keine persoenliche politische Position, kein Digitalamt als aktuell "
            f"(URL + sha256 + Abrufzeit + Datei beider Zusatzquellen, Original UND Metadaten, gebunden)"
        )
    if wahlausschuss_beleg is not None:
        feldbelege["funktionen"] = (
            f"vom Orchestrator gepruefte Wahlausschuss-Aufgabenquittung {WAHLAUSSCHUSS_RESSOURCE}: das "
            f"sonstige Gremium {wahlausschuss_beleg['gremium']!r} und die bestehenden ordentlichen/"
            f"stellvertretenden Funktionen bleiben unveraendert erhalten (NIE als regulaerer Ausschuss); "
            f"zusaetzlich nur der getrennte Herkunftshinweis zur amtlichen Aufgabenbindung; die aktuelle "
            f"Mitgliedschaft ({wahlausschuss_beleg['roleName']}) stammt aus genau EINER echten Role in "
            f"ProfilePage.mainEntity.memberOf, keine persoenliche politische Position "
            f"(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei beider Quellen, Original UND "
            f"Metadaten, gebunden)"
        )
    if jarzombek_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Jarzombek-Abteilungsquittung {JARZOMBEK_RESSOURCE}: die "
            f"bestehende aktuelle PSts-Rolle aus der 54er Rollenquittung und alle bestehenden Funktionen "
            f"bleiben unveraendert erhalten (KEINE neue Funktionsrolle, kein Scheinausschuss); zusaetzlich "
            f"nur der getrennte Herkunftshinweis zur amtlichen BMDS-Abteilungsbindung, keine persoenliche "
            f"politische Position (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei beider "
            f"Quellen, Original UND Metadaten, gebunden)"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz
    if kloeckner_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Kloeckner-Aufgabenquittung {KLOECKNER_RESSOURCE}: die "
            f"bestehende aktuelle Rolle aus der 54er Rollenquittung und alle bestehenden Funktionen "
            f"bleiben unveraendert erhalten (KEINE neue Funktionsrolle, kein Scheinausschuss); die "
            f"kanonische Bundestags-Person wird separat ueber ihre echte H1 und den eigenen aktuellen "
            f"Funktionstext (div.m-biography__function) neu gebunden; zusaetzlich nur der getrennte "
            f"Herkunftshinweis zur amtlichen Praesidentinnen-Aufgabenbindung aus dem zweiten eigenen "
            f"Absatz des geschlossenen H2-Abschnitts {kloeckner_beleg['abschnitt']!r}, keine allgemeine "
            f"Polizei-/Innenpolitik, keine persoenliche politische Position "
            f"(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei der amtlichen Quelle, "
            f"Original UND Metadaten, gebunden)"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz

    if rohde_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Rohde-Einzelfallquittung {ROHDE_RESSOURCE}: die bestehende "
            f"aktuelle PSts-Rolle aus der 54er Rollenquittung und alle bestehenden Funktionen bleiben "
            f"unveraendert erhalten (KEINE neue Funktionsrolle, kein Scheinausschuss); die PSts-Funktion hat "
            f"im eigenen Funktionsabschnitt KEINE Datumsangabe, ein Amtsbeginn wird nicht (auch nicht aus "
            f"der MdB-Role 2025-03-25) abgeleitet; die kanonische Bundestags-Person wird separat ueber ihre "
            f"echte H1 und den eigenen aktuellen Funktionstext (div.m-biography__function) neu gebunden; "
            f"zusaetzlich nur der getrennte Herkunftshinweis zur amtlichen BMF-Aufgabenbindung "
            f"(Bundeshaushalt) aus Rohdes eigenem Kasten auf Seite 1 des verlinkten v=32-Organisationsplans, "
            f"keine persoenliche politische Position (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP "
            f"+ Datei der amtlichen Quelle, Original UND Metadaten, gebunden)"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz

    if merz_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Merz-Einzelfallquittung {MERZ_RESSOURCE}: die bestehende aktuelle "
            f"Rolle Bundeskanzler aus der 54er Rollenquittung und alle bestehenden Funktionen bleiben "
            f"unveraendert erhalten (KEINE neue Funktionsrolle, kein Scheinausschuss); die kanonische "
            f"Bundestags-Person wird separat ueber ihre echte H1 und den eigenen aktuellen Funktionstext "
            f"(div.m-biography__function) neu gebunden; zusaetzlich nur der getrennte Herkunftshinweis zur "
            f"amtlichen Richtlinien-Kompetenz des Bundeskanzlers aus dem geschlossenen H2-Abschnitt "
            f"{merz_beleg['abschnitt']!r} des eigenen innersten div.bpa-richtext, keine konkreten "
            f"politischen Positionen, keine Koalitionsziele, keine Ressorts oder allgemeinen "
            f"Ministeriumsthemen (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei der "
            f"amtlichen Quelle, Original UND Metadaten, gebunden)"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz

    if woidke_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Woidke-Einzelfallquittung {WOIDKE_RESSOURCE}: die bestehende "
            "Rolle Ministerpraesident des Landes Brandenburg aus der 54er Rollenquittung bleibt "
            "unveraendert (KEINE neue Funktionsrolle); zusaetzlich nur der getrennte Herkunftshinweis "
            "zur amtlichen Richtlinienkompetenz, keine persoenliche politische Position"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz

    if wegner_beleg is not None:
        vorher = feldbelege.get("funktionen")
        zusatz = (
            f"vom Orchestrator gepruefte Wegner-Einzelfallquittung {WEGNER_RESSOURCE}: die bestehende "
            "Rolle Regierender Buergermeister von Berlin aus der 54er Rollenquittung bleibt unveraendert "
            "(KEINE neue Funktionsrolle); Person/Amt nur aus dem sichtbaren eigenen Artikel der amtlichen "
            "Berliner Senatsseite, zusaetzlich nur der getrennte Herkunftshinweis zur amtlichen "
            "Richtlinienkompetenz, keine persoenliche politische Position"
        )
        feldbelege["funktionen"] = f"{vorher}; {zusatz}" if vorher else zusatz

    if stellvertretungen_beleg is not None:
        feldbelege["stellvertretendeAusschuesse"] = (
            f"vom Orchestrator gepruefte Stellvertretungsquittung {STELLVERTRETUNGEN_RESSOURCE}: "
            f"nur die amtlich belegten stellvertretenden Brandenburger Ausschussmitgliedschaften aus der "
            f"eigenen geschlossenen Stellvertretungsspalte (h5 {STELLVERTRETUNGENMODUL.SPALTE!r}; exakte "
            f"Klassen col-12 col-md-6 col-lg-12 col-xl-6 my-4 my-md-0 als direktes Kind der row; "
            f"h6-Fraktionsueberschrift mit unmittelbar folgender eigener ul/li/a.profile; exakter "
            f"kanonischer Personenlink, STRONG-Name und organization-name); Person, Profilhash, Name und "
            f"Fraktion bzw. Fraktionslosigkeit sind separat an die kanonischen Detailseiten gebunden. "
            f"Ordentliche Ausschuesse, Partei, Fraktion, Funktionen, Themen und Mandatsart bleiben "
            f"unveraendert, keine Aufwertung zu ordentlichem Sitz/Vorsitz, keine erfundenen Themen "
            f"(URL + finalUrl + HTTP + Abrufzeit + sha256 + Bytezahl + Datei, Original UND Metadaten, gebunden)"
        )

    # ── Offene Punkte explizit zusammentragen ─────────────────────────────────
    offene_punkte = []
    offene_felder = []

    def _merke(feld, punkt):
        if punkt not in offene_punkte:
            offene_punkte.append(punkt)
        if feld and feld not in offene_felder:
            offene_felder.append(feld)

    rohe_offene = [str(x).strip() for x in extraktion.get("offen", []) if str(x).strip()]

    def _merke_feld(feld, fallback_punkt):
        # Nur ergaenzen, wenn zu diesem Feld nicht schon ein Rohpunkt gesetzt ist.
        if feld not in offene_felder:
            _merke(feld, fallback_punkt)

    if parlament == "bundestag":
        if parteinachweis["status"] == "offen":
            _merke("partei", "Parteimitgliedschaft in der amtlichen Biografie nicht belegt; NICHT aus der Fraktion abgeleitet")
    elif parlament == "landtag-berlin":
        if parteinachweis["status"] == "offen":
            _merke("partei", "Parteizugehoerigkeit nicht amtlich belegt (h1 ohne Parteiangabe)")
    elif parlament == "landtag-brandenburg":
        if parteinachweis["status"] == "offen":
            _merke("partei", f"Parteizugehoerigkeit nicht belegt: {parteinachweis['grund']}")

    roh_zu_feld = {
        "Keine Ausschusszuordnung extrahiert; fachliche Achse offen, keine Themen erfunden": "fachlicheAchse",
        "Detaillierter beruflicher Regionsbezug noch zu recherchieren": "regionbezug",
    }
    for punkt in rohe_offene:
        # Generische, inzwischen geklaerte Punkte nicht als offen wiederholen.
        if punkt in ("Partei separat zu belegen; nicht aus Fraktion abgeleitet", "Parteimitgliedschaft separat belegen"):
            continue  # durch den konkreten Parteipunkt oben abgedeckt
        if punkt == "Vollstaendige fachliche Einzelpruefung und Importabbildung":
            continue  # pauschal; die konkreten offenen Felder stehen einzeln oben
        if punkt.startswith("Mandatsart/Wahlkreis nicht"):
            # Ein alter Extraktionsrest ist kein offener Punkt mehr, wenn die Mandatsart
            # inzwischen aus einer ausdruecklichen amtlichen Angabe abgeleitet ist.
            if landtag_mandat is not None:
                continue
            if region is not None and region["art"] != "offen":
                continue
            _merke("mandatsart", punkt)
            continue
        feld = roh_zu_feld.get(punkt)
        # Ein alter roher Extraktionspunkt "fachliche Achse offen" ist kein offener
        # Punkt mehr, wenn die Achse ueber ein amtlich belegtes Ressort oder eine
        # amtlich belegte stellvertretende Ausschussmitgliedschaft geschlossen
        # wurde. Der Rohpunkt bleibt als historischer ``extraktionOffen`` erhalten.
        if feld == "fachlicheAchse" and (achsen_geschlossen or stellvertretungen_eintrag is not None):
            continue
        _merke(feld, punkt)

    # Die fachliche Achse ist erst dann offen, wenn WEDER eine ordentliche NOCH eine
    # stellvertretende belegte Ausschusszuordnung vorliegt (Import-/Validierungsvertrag
    # in lib/helmut: beide Mitgliedschaftsarten tragen die Achse, bleiben aber getrennt).
    if not ordentliche and not stellvertretende and not achsen_geschlossen:
        _merke_feld("fachlicheAchse", "Keine ordentliche oder stellvertretende Ausschusszuordnung belegt; fachliche Achse offen, keine Themen erfunden")
    if parlament == "bundestag" and region["art"] == "offen":
        _merke_feld("mandatsart", region["offen"])
    if parlament == "bundestag" and region.get("offen") and region["art"] != "offen":
        _merke_feld("mandatsart", region["offen"])
    if mandatsart_belegt:
        feldbelege["mandatsartBelegt"] = "amtlicher Profilkopf (HTML); unveraendert uebernommen, nicht gedeutet"
    if mandatsart_quittung is not None:
        feldbelege["mandatsartQuelle"] = (
            f"{MANDATSARTEN_BB_RESSOURCE}: {mandatsart_quittung['url']} "
            f"sha256 {mandatsart_quittung['sha256']}"
        )
    if mandatsart_quittung_be is not None:
        feldbelege["mandatsartQuelle"] = (
            f"{MANDATSARTEN_BE_RESSOURCE}: Seite 204 linke Spalte, {mandatsart_quittung_be['url']} "
            f"sha256 {mandatsart_quittung_be['sha256']}; woertlich: {mandatsart_quittung_be['zitat']}"
        )
    if landtag_mandat and landtag_mandat["art"] == "offen":
        _merke("mandatsart", landtag_mandat["offen"])
    if landtag_mandat and landtag_mandat.get("offen"):
        _merke("wahlbezirk" if landtag_mandat["art"] == "direkt" else "mandatsart", landtag_mandat["offen"])
    if parlament == "bundestag" and region["kandidaturen"]:
        feldbelege["wahlkreiskandidatur"] = "belegte Wahlkreiskandidatur; ausdruecklich KEIN Direktmandat"
    if weitere_gremien:
        _merke("weitereGremien", "Weitere belegte Gremien sind nicht als ordentliche Ausschussmitgliedschaft zugeordnet")

    parteibeleg = {
        "partei": parteinachweis.get("partei"),
        "beleg": parteinachweis.get("beleg", ""),
        "grund": parteinachweis.get("grund", ""),
        "herkunft": parteinachweis["herkunft"],
    }
    if parteinachweis.get("quittung"):
        parteibeleg["abschnitt"] = parteinachweis.get("abschnitt")
        parteibeleg["pruefung"] = parteinachweis.get("pruefung")
        parteibeleg["quelle"] = {
            "datei": parteinachweis.get("quittungDatei", PARTEIFELDPRUEFUNG_RESSOURCE),
            "url": parteinachweis["quittung"]["url"],
            "sha256": parteinachweis["quittung"]["sha256"],
        }

    datensatz = {
        "kanonischeKennung": mandatsId,
        "amtlicheKennung": abruf["amtlicheKennung"],
        "parlament": parlament,
        "quelle": {
            "url": abruf["url"],
            "finalUrl": abruf.get("finalUrl"),
            "abgerufenAm": abruf["abgerufenAm"],
            "sha256": abruf["sha256"],
            "bytes": abruf["bytes"],
            "datei": abruf["datei"],
            "http": abruf["http"],
            "abrufStatus": abruf["abrufStatus"],
        },
        "namensauswahl": {
            "url": eintrag["url"],
            "text": eintrag["text"],
            "fraktion": eintrag["fraktion"],
            "amtlicheKennung": eintrag["amtlicheKennung"],
            "parlament": eintrag["parlament"],
        },
        "profil": profil,
        "mandatsnachweis": profil_roh,
        "mandatsartBelegt": mandatsart_belegt,
        "parteiStatus": parteinachweis["status"],
        "parteiBeleg": parteibeleg,
        "feldbelege": feldbelege,
        "weitereGremien": weitere_gremien,
        "weitereGremienBeleg": weitere_gremien_beleg,
        "h1Abgleich": True,
        "extraktionOffen": rohe_offene,
        "offenePunkte": offene_punkte,
        "offeneFelder": offene_felder,
        "importfreigegeben": False,
        "aktiv": False,
    }
    if mandatsart_quittung is not None:
        datensatz["mandatsartQuittung"] = mandatsart_quittung
    if pistorius_beleg is not None:
        datensatz["parteiQuittung"] = pistorius_beleg
    if parteizusatz_beleg is not None:
        datensatz["parteiZusatzQuittung"] = parteizusatz_beleg
    if mandatsart_quittung_be is not None:
        datensatz["mandatsartQuittungBe"] = mandatsart_quittung_be
    if rollen_beleg is not None:
        datensatz["profilrollenQuittung"] = rollen_beleg
    if ressort_beleg is not None:
        datensatz["ressortachsenQuittung"] = ressort_beleg
    if aufgaben_beleg is not None:
        datensatz["aufgabenachsenQuittung"] = aufgaben_beleg
    if beratende_beleg is not None:
        datensatz["beratendeachsenQuittung"] = beratende_beleg
    if zusatz_beleg is not None:
        datensatz["zusaetzlicheaufgabenQuittung"] = zusatz_beleg
    if bmwsb_beleg is not None:
        datensatz["bmwsbQuittung"] = bmwsb_beleg
    if amthor_beleg is not None:
        datensatz["amthorQuittung"] = amthor_beleg
    if wahlausschuss_beleg is not None:
        datensatz["wahlausschussQuittung"] = wahlausschuss_beleg
    if fraktionsvorsitz_beleg is not None:
        datensatz["fraktionsvorsitzQuittung"] = fraktionsvorsitz_beleg
    if jarzombek_beleg is not None:
        datensatz["jarzombekQuittung"] = jarzombek_beleg
    if kloeckner_beleg is not None:
        datensatz["kloecknerQuittung"] = kloeckner_beleg
    if rohde_beleg is not None:
        datensatz["rohdeQuittung"] = rohde_beleg
    if merz_beleg is not None:
        datensatz["merzQuittung"] = merz_beleg
    if woidke_beleg is not None:
        datensatz["woidkeQuittung"] = woidke_beleg
    if wegner_beleg is not None:
        datensatz["wegnerQuittung"] = wegner_beleg
    if stellvertretungen_beleg is not None:
        datensatz["stellvertretungenQuittung"] = stellvertretungen_beleg
    if "status" in extraktion:
        datensatz["extraktionsstatus"] = extraktion["status"]
    return datensatz


def assembliere(eingang: Eingang) -> dict:
    _pruefe_gremienliste()
    bindung = _pruefe_eingangsbindung(eingang)
    ergaenzung = _pruefe_ergaenzung(eingang)
    eingang.mandatsarten_bb = _pruefe_mandatsarten_bb(eingang)
    eingang.mandatsarten_verwendet = set()
    eingang.mandatsarten_be = _pruefe_mandatsarten_be(eingang)
    eingang.mandatsarten_be_verwendet = set()
    profilrollen = _pruefe_profilrollen(eingang)
    ressortachsen = _pruefe_ressortachsen(eingang)
    aufgabenachsen = _pruefe_aufgabenachsen(eingang)
    beratendeachsen = _pruefe_beratendeachsen(eingang)
    zusatzaufgaben = _pruefe_zusatzaufgaben(eingang)
    bmwsb = _pruefe_bmwsb(eingang)
    amthor = _pruefe_amthor(eingang)
    wahlausschuss = _pruefe_wahlausschuss(eingang)
    fraktionsvorsitz = _pruefe_fraktionsvorsitz(eingang)
    jarzombek = _pruefe_jarzombek(eingang)
    kloeckner = _pruefe_kloeckner(eingang)
    rohde = _pruefe_rohde(eingang)
    stellvertretungen = _pruefe_stellvertretungen(eingang)
    pistorius = _pruefe_pistorius(eingang)
    parteizusatz = _pruefe_parteizusatz(eingang)
    merz = _pruefe_merz(eingang)
    woidke = _pruefe_woidke(eingang)
    wegner = _pruefe_wegner(eingang)
    datensaetze = [_baue_datensatz(eingang, eintrag) for eintrag in eingang.auswahl["auswahl"]]

    # Die gepruefte Quittung muss die offenen Parteifelder DECKUNGSGLEICH abbilden:
    # kein Eintrag darf ungenutzt bleiben (Konflikt/Fremdkennung/Quelldrift), und
    # kein offenes Parteifeld darf ohne gepruefte Ergaenzung bleiben.
    ungenutzt = set(ergaenzung) - eingang.ergaenzung_verwendet
    if ungenutzt:
        raise AssemblerFehler(
            f"Parteifeldpruefung nicht deckungsgleich verwendet: {len(ungenutzt)} Eintraege ohne "
            f"offenes Parteifeld (z. B. {sorted(ungenutzt)[:3]})."
        )
    if eingang.pistorius_verwendet != set(pistorius):
        raise AssemblerFehler(
            "Pistorius-Parteizusatzquittung nicht deckungsgleich verwendet "
            f"(verwendet={sorted(eingang.pistorius_verwendet)}, erwartet={sorted(pistorius)})."
        )
    if eingang.parteizusatz_verwendet != set(parteizusatz):
        raise AssemblerFehler(
            "Parteizusatzquittung nicht deckungsgleich verwendet "
            f"(verwendet={sorted(eingang.parteizusatz_verwendet)}, erwartet={sorted(parteizusatz)})."
        )

    # Auch die Mandatsartenquittung muss deckungsgleich verwendet werden: kein Beleg
    # ohne offenes Mandatsartenfeld und kein belegter Fall ohne Quittung.
    ungenutzte_mandate = set(eingang.mandatsarten_bb) - eingang.mandatsarten_verwendet
    if ungenutzte_mandate:
        raise AssemblerFehler(
            f"Mandatsartenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_mandate)}."
        )

    # Auch die Berliner Mandatsartenquittung muss deckungsgleich verwendet werden:
    # kein Beleg ohne offenes Mandatsartenfeld und kein belegter Fall ohne Quittung.
    ungenutzte_mandate_be = set(eingang.mandatsarten_be) - eingang.mandatsarten_be_verwendet
    if ungenutzte_mandate_be:
        raise AssemblerFehler(
            f"Berliner Mandatsartenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_mandate_be)}."
        )

    # Die 54er Rollenquittung muss die urspruenglich offenen Fachachsen weiter
    # DECKUNGSGLEICH abdecken: die 19 aus der geprueften Ressortquittung
    # geschlossenen Achsen und die verbleibend offenen ergeben disjunkt genau die
    # 54er Quittungsmenge. Keine Abschwaechung auf Teilmenge/Zahl allein.
    ungenutzte_rollen = set(profilrollen) - eingang.profilrollen_verwendet
    if ungenutzte_rollen:
        raise AssemblerFehler(
            f"Profilrollenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_rollen)}."
        )
    ungenutzte_ressorten = set(ressortachsen) - eingang.ressortachsen_verwendet
    if ungenutzte_ressorten:
        raise AssemblerFehler(
            f"Ressortquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_ressorten)}."
        )
    ungenutzte_aufgaben = set(aufgabenachsen) - eingang.aufgabenachsen_verwendet
    if ungenutzte_aufgaben:
        raise AssemblerFehler(
            f"Aufgabenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_aufgaben)}."
        )
    ungenutzte_beratende = set(beratendeachsen) - eingang.beratendeachsen_verwendet
    if ungenutzte_beratende:
        raise AssemblerFehler(
            f"Beratende Achsenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_beratende)}."
        )
    ungenutzte_zusatz = set(zusatzaufgaben) - eingang.zusaetzlicheaufgaben_verwendet
    if ungenutzte_zusatz:
        raise AssemblerFehler(
            f"Zusatzaufgabenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_zusatz)}."
        )
    ungenutzte_bmwsb = set(bmwsb) - eingang.bmwsb_verwendet
    if ungenutzte_bmwsb:
        raise AssemblerFehler(
            f"BMWSB-Aufgabenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_bmwsb)}."
        )
    ungenutzte_amthor = set(amthor) - eingang.amthor_verwendet
    if ungenutzte_amthor:
        raise AssemblerFehler(
            f"Amthor-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_amthor)}."
        )
    ungenutzte_wahlausschuss = set(wahlausschuss) - eingang.wahlausschuss_verwendet
    if ungenutzte_wahlausschuss:
        raise AssemblerFehler(
            f"Wahlausschuss-Aufgabenquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_wahlausschuss)}."
        )
    ungenutzte_fraktionsvorsitz = set(fraktionsvorsitz) - eingang.fraktionsvorsitz_verwendet
    if ungenutzte_fraktionsvorsitz:
        raise AssemblerFehler(
            f"Fraktionsvorsitz-Zweierquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_fraktionsvorsitz)}."
        )
    ungenutzte_jarzombek = set(jarzombek) - eingang.jarzombek_verwendet
    if ungenutzte_jarzombek:
        raise AssemblerFehler(
            f"Jarzombek-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_jarzombek)}."
        )
    ungenutzte_kloeckner = set(kloeckner) - eingang.kloeckner_verwendet
    if ungenutzte_kloeckner:
        raise AssemblerFehler(
            f"Kloeckner-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_kloeckner)}."
        )
    ungenutzte_rohde = set(rohde) - eingang.rohde_verwendet
    if ungenutzte_rohde:
        raise AssemblerFehler(
            f"Rohde-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_rohde)}."
        )
    ungenutzte_merz = set(merz) - eingang.merz_verwendet
    if ungenutzte_merz:
        raise AssemblerFehler(
            f"Merz-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_merz)}."
        )
    ungenutzte_woidke = set(woidke) - eingang.woidke_verwendet
    if ungenutzte_woidke:
        raise AssemblerFehler(
            f"Woidke-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_woidke)}."
        )
    ungenutzte_wegner = set(wegner) - eingang.wegner_verwendet
    if ungenutzte_wegner:
        raise AssemblerFehler(
            f"Wegner-Einzelfallquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_wegner)}."
        )
    ungenutzte_stellvertretungen = set(stellvertretungen) - eingang.stellvertretungen_verwendet
    if ungenutzte_stellvertretungen:
        raise AssemblerFehler(
            f"Stellvertretungsquittung nicht deckungsgleich verwendet: {sorted(ungenutzte_stellvertretungen)}."
        )
    ressort_geschlossen = set(eingang.ressortachsen_verwendet)
    if ressort_geschlossen != set(ressortachsen):
        raise AssemblerFehler(
            f"Ressortquittung deckt nicht genau ihre 19 Kennungen ab: "
            f"{sorted(set(ressortachsen) ^ ressort_geschlossen)}."
        )
    aufgaben_geschlossen = set(eingang.aufgabenachsen_verwendet)
    if aufgaben_geschlossen != set(aufgabenachsen):
        raise AssemblerFehler(
            f"Aufgabenquittung deckt nicht genau ihre 6 Kennungen ab: "
            f"{sorted(set(aufgabenachsen) ^ aufgaben_geschlossen)}."
        )
    beratende_geschlossen = set(eingang.beratendeachsen_verwendet)
    if beratende_geschlossen != set(beratendeachsen):
        raise AssemblerFehler(
            f"Beratende Achsenquittung deckt nicht genau ihre 2 Kennungen ab: "
            f"{sorted(set(beratendeachsen) ^ beratende_geschlossen)}."
        )
    zusatz_geschlossen = set(eingang.zusaetzlicheaufgaben_verwendet)
    if zusatz_geschlossen != set(zusatzaufgaben):
        raise AssemblerFehler(
            f"Zusatzaufgabenquittung deckt nicht genau ihre 3 Kennungen ab: "
            f"{sorted(set(zusatzaufgaben) ^ zusatz_geschlossen)}."
        )
    bmwsb_geschlossen = set(eingang.bmwsb_verwendet)
    if bmwsb_geschlossen != set(bmwsb):
        raise AssemblerFehler(
            f"BMWSB-Aufgabenquittung deckt nicht genau ihre 2 Kennungen ab: "
            f"{sorted(set(bmwsb) ^ bmwsb_geschlossen)}."
        )
    amthor_geschlossen = set(eingang.amthor_verwendet)
    if amthor_geschlossen != set(amthor):
        raise AssemblerFehler(
            f"Amthor-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(amthor) ^ amthor_geschlossen)}."
        )
    wahlausschuss_geschlossen = set(eingang.wahlausschuss_verwendet)
    if wahlausschuss_geschlossen != set(wahlausschuss):
        raise AssemblerFehler(
            f"Wahlausschuss-Aufgabenquittung deckt nicht genau ihre 3 Kennungen ab: "
            f"{sorted(set(wahlausschuss) ^ wahlausschuss_geschlossen)}."
        )
    fraktionsvorsitz_geschlossen = set(eingang.fraktionsvorsitz_verwendet)
    if fraktionsvorsitz_geschlossen != set(fraktionsvorsitz):
        raise AssemblerFehler(
            f"Fraktionsvorsitz-Zweierquittung deckt nicht genau ihre 2 Kennungen ab: "
            f"{sorted(set(fraktionsvorsitz) ^ fraktionsvorsitz_geschlossen)}."
        )
    jarzombek_geschlossen = set(eingang.jarzombek_verwendet)
    if jarzombek_geschlossen != set(jarzombek):
        raise AssemblerFehler(
            f"Jarzombek-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(jarzombek) ^ jarzombek_geschlossen)}."
        )
    kloeckner_geschlossen = set(eingang.kloeckner_verwendet)
    if kloeckner_geschlossen != set(kloeckner):
        raise AssemblerFehler(
            f"Kloeckner-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(kloeckner) ^ kloeckner_geschlossen)}."
        )
    rohde_geschlossen = set(eingang.rohde_verwendet)
    if rohde_geschlossen != set(rohde):
        raise AssemblerFehler(
            f"Rohde-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(rohde) ^ rohde_geschlossen)}."
        )
    merz_geschlossen = set(eingang.merz_verwendet)
    if merz_geschlossen != set(merz):
        raise AssemblerFehler(
            f"Merz-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(merz) ^ merz_geschlossen)}."
        )
    woidke_geschlossen = set(eingang.woidke_verwendet)
    if woidke_geschlossen != set(woidke):
        raise AssemblerFehler(
            "Woidke-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(woidke) ^ woidke_geschlossen)}."
        )
    wegner_geschlossen = set(eingang.wegner_verwendet)
    if wegner_geschlossen != set(wegner):
        raise AssemblerFehler(
            "Wegner-Einzelfallquittung deckt nicht genau ihre eine Kennung ab: "
            f"{sorted(set(wegner) ^ wegner_geschlossen)}."
        )
    if ressort_geschlossen & aufgaben_geschlossen:
        raise AssemblerFehler(
            "Ressort- und Aufgabenachse gleichzeitig belegt: "
            f"{sorted(ressort_geschlossen & aufgaben_geschlossen)}."
        )
    if beratende_geschlossen & ressort_geschlossen:
        raise AssemblerFehler(
            "Ressort- und beratende Achse gleichzeitig belegt: "
            f"{sorted(beratende_geschlossen & ressort_geschlossen)}."
        )
    if beratende_geschlossen & aufgaben_geschlossen:
        raise AssemblerFehler(
            "Aufgaben- und beratende Achse gleichzeitig belegt: "
            f"{sorted(beratende_geschlossen & aufgaben_geschlossen)}."
        )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
    ):
        if zusatz_geschlossen & andere:
            raise AssemblerFehler(
                f"Zusatzaufgaben- und {name}achse gleichzeitig belegt: "
                f"{sorted(zusatz_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
    ):
        if bmwsb_geschlossen & andere:
            raise AssemblerFehler(
                f"BMWSB-Aufgaben- und {name}achse gleichzeitig belegt: "
                f"{sorted(bmwsb_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
    ):
        if amthor_geschlossen & andere:
            raise AssemblerFehler(
                f"Amthor-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(amthor_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
    ):
        if wahlausschuss_geschlossen & andere:
            raise AssemblerFehler(
                f"Wahlausschuss-Aufgaben- und {name}achse gleichzeitig belegt: "
                f"{sorted(wahlausschuss_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
    ):
        if jarzombek_geschlossen & andere:
            raise AssemblerFehler(
                f"Jarzombek-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(jarzombek_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
        (jarzombek_geschlossen, "Jarzombek-Einzelfall"),
    ):
        if kloeckner_geschlossen & andere:
            raise AssemblerFehler(
                f"Kloeckner-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(kloeckner_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
        (jarzombek_geschlossen, "Jarzombek-Einzelfall"),
        (kloeckner_geschlossen, "Kloeckner-Einzelfall"),
    ):
        if rohde_geschlossen & andere:
            raise AssemblerFehler(
                f"Rohde-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(rohde_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
        (jarzombek_geschlossen, "Jarzombek-Einzelfall"),
        (kloeckner_geschlossen, "Kloeckner-Einzelfall"),
        (rohde_geschlossen, "Rohde-Einzelfall"),
        (wegner_geschlossen, "Wegner-Einzelfall"),
    ):
        if merz_geschlossen & andere:
            raise AssemblerFehler(
                f"Merz-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(merz_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
        (jarzombek_geschlossen, "Jarzombek-Einzelfall"),
        (kloeckner_geschlossen, "Kloeckner-Einzelfall"),
        (rohde_geschlossen, "Rohde-Einzelfall"),
        (merz_geschlossen, "Merz-Einzelfall"),
        (wegner_geschlossen, "Wegner-Einzelfall"),
    ):
        if woidke_geschlossen & andere:
            raise AssemblerFehler(
                f"Woidke-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(woidke_geschlossen & andere)}."
            )
    for andere, name in (
        (ressort_geschlossen, "Ressort"),
        (aufgaben_geschlossen, "Aufgaben"),
        (beratende_geschlossen, "Beratende"),
        (zusatz_geschlossen, "Zusatzaufgaben"),
        (bmwsb_geschlossen, "BMWSB-Aufgaben"),
        (amthor_geschlossen, "Amthor-Einzelfall"),
        (wahlausschuss_geschlossen, "Wahlausschuss-Aufgaben"),
        (jarzombek_geschlossen, "Jarzombek-Einzelfall"),
        (kloeckner_geschlossen, "Kloeckner-Einzelfall"),
        (rohde_geschlossen, "Rohde-Einzelfall"),
        (merz_geschlossen, "Merz-Einzelfall"),
        (woidke_geschlossen, "Woidke-Einzelfall"),
    ):
        if wegner_geschlossen & andere:
            raise AssemblerFehler(
                f"Wegner-Einzelfall- und {name}achse gleichzeitig belegt: "
                f"{sorted(wegner_geschlossen & andere)}."
            )
    geschlossene_achsen = (ressort_geschlossen | aufgaben_geschlossen
                           | beratende_geschlossen | zusatz_geschlossen | bmwsb_geschlossen
                           | amthor_geschlossen | wahlausschuss_geschlossen | jarzombek_geschlossen
                           | kloeckner_geschlossen | rohde_geschlossen | merz_geschlossen
                           | woidke_geschlossen | wegner_geschlossen)
    # Die Stellvertretungsquittung schliesst die fachliche Achse ueber eine belegte
    # stellvertretende (nicht ordentliche) Ausschussmitgliedschaft. Nur Profile,
    # deren Achse zuvor in der 54er Rollenquittung offen war, gehoeren in die
    # Deckungsgleichheit der 54 Achsen (Skopec); die uebrigen 34 waren bereits
    # ueber ordentliche Ausschuesse geschlossen.
    stellvertretungen_achsen = (
        {d["kanonischeKennung"] for d in datensaetze if d.get("stellvertretungenQuittung")}
        & set(profilrollen)
    )
    if not geschlossene_achsen <= set(profilrollen):
        raise AssemblerFehler(
            "Geschlossene Achsen enthalten Kennungen ausserhalb der 54er Rollenquittung: "
            f"{sorted(geschlossene_achsen - set(profilrollen))}."
        )
    offene_achsen = {d["kanonischeKennung"] for d in datensaetze if "fachlicheAchse" in d["offeneFelder"]}
    if geschlossene_achsen & offene_achsen:
        raise AssemblerFehler(
            f"Fachachse gleichzeitig offen und geschlossen: {sorted(geschlossene_achsen & offene_achsen)}."
        )
    if stellvertretungen_achsen & geschlossene_achsen:
        raise AssemblerFehler(
            "Stellvertretungs- und Themenachse gleichzeitig belegt: "
            f"{sorted(stellvertretungen_achsen & geschlossene_achsen)}."
        )
    if stellvertretungen_achsen & offene_achsen:
        raise AssemblerFehler(
            f"Stellvertretungsachse bleibt offen: {sorted(stellvertretungen_achsen & offene_achsen)}."
        )
    vereinigung = offene_achsen | geschlossene_achsen | stellvertretungen_achsen
    if vereinigung != set(profilrollen):
        fehlend = sorted(set(profilrollen) - vereinigung)
        fremd = sorted(vereinigung - set(profilrollen))
        raise AssemblerFehler(
            "Rollenquittung deckt die urspruenglich offenen Fachachsen nicht deckungsgleich ab "
            f"(ohne Abdeckung: {fehlend[:5]}, nicht in der Quittung: {fremd[:5]})."
        )

    # Genau die geschlossenen Achsen (19 Ressort + 6 Aufgaben + 2 beratende) tragen
    # amtlich abgeleitete Themen, ihre fachliche Achse ist geschlossen; kein anderes
    # Profil erhaelt erfundene Themen.
    mit_themen = {d["kanonischeKennung"] for d in datensaetze if d["profil"].get("themen")}
    if mit_themen != geschlossene_achsen:
        raise AssemblerFehler(
            f"Themen duerfen nur aus der Ressort-/Aufgabenquittung stammen: {sorted(mit_themen ^ geschlossene_achsen)}."
        )
    for datensatz in datensaetze:
        if (datensatz.get("ressortachsenQuittung") or datensatz.get("aufgabenachsenQuittung")
                or datensatz.get("beratendeachsenQuittung") or datensatz.get("zusaetzlicheaufgabenQuittung")
                or datensatz.get("bmwsbQuittung") or datensatz.get("amthorQuittung")
                or datensatz.get("wahlausschussQuittung") or datensatz.get("jarzombekQuittung")
                or datensatz.get("kloecknerQuittung") or datensatz.get("rohdeQuittung")
                or datensatz.get("merzQuittung") or datensatz.get("woidkeQuittung")
                or datensatz.get("wegnerQuittung")
                or datensatz.get("stellvertretungenQuittung")):
            if "fachlicheAchse" in datensatz["offeneFelder"]:
                raise AssemblerFehler(
                    f"Geschlossene Fachachse bleibt offen: {datensatz['kanonischeKennung']}."
                )
            if datensatz["profil"]["aktiv"] is not False or datensatz["importfreigegeben"] is not False:
                raise AssemblerFehler(
                    f"Profil mit geschlossener Achse darf nicht aktiv/importfreigegeben sein: {datensatz['kanonischeKennung']}."
                )

    # Belegte sonstige Gremien duerfen NICHT in den Ausschussfeldern stehen: gegenprobe
    # ueber alle Datensaetze (fail closed, falls die Trennung je umgangen wird).
    for datensatz in datensaetze:
        for feld in ("ausschuesse", "stellvertretendeAusschuesse"):
            for wert in datensatz["profil"].get(feld) or []:
                if wert in SONSTIGE_GREMIEN:
                    raise AssemblerFehler(f"Belegtes sonstiges Gremium in {feld}: {wert!r}.")

    # ── Gesamtprueifungen (fail closed) ───────────────────────────────────────
    kennungen = [d["kanonischeKennung"] for d in datensaetze]
    urls = [d["quelle"]["url"] for d in datensaetze]
    hashes = [d["quelle"]["sha256"] for d in datensaetze]
    namen = [d["profil"]["vollname"] for d in datensaetze]
    if len(set(kennungen)) != 500 or len(set(urls)) != 500 or len(set(hashes)) != 500:
        raise AssemblerFehler("Kennungen, URLs oder Quellhashes sind nicht eindeutig.")
    if len(set(namen)) != 500:
        raise AssemblerFehler("Doppelte Vollnamen in der Zielauswahl.")
    if any(GESPERRT_AMTLICHE_KENNUNG in d["quelle"]["url"] for d in datensaetze):
        raise AssemblerFehler("Gesperrte amtliche Kennung ist in der Zielauswahl.")
    if any(d["profil"]["vollname"] == GESPERRT_VOLLNAME for d in datensaetze):
        raise AssemblerFehler("Gesperrter Vollname ist in der Zielauswahl.")
    if not all(d["profil"]["aktiv"] is False and d["importfreigegeben"] is False for d in datensaetze):
        raise AssemblerFehler("Mindestens ein Datensatz ist aktiv oder importfreigegeben.")

    nach_parlament = {}
    for datensatz in datensaetze:
        nach_parlament[datensatz["parlament"]] = nach_parlament.get(datensatz["parlament"], 0) + 1
    if nach_parlament != ERWARTETE_VERTEILUNG:
        raise AssemblerFehler(f"Falsche Verteilung: {nach_parlament!r}")

    offene_felder = {}
    for datensatz in datensaetze:
        for feld in datensatz["offeneFelder"]:
            offene_felder[feld] = offene_felder.get(feld, 0) + 1
    partei_belegt = sum(1 for d in datensaetze if d["parteiStatus"] == "belegt")
    partei_parteilos = sum(1 for d in datensaetze if d["parteiStatus"] == "parteilos")
    partei_offen = sum(1 for d in datensaetze if "partei" in d["offeneFelder"])
    mandatsart_offen = sum(1 for d in datensaetze if "mandatsart" in d["offeneFelder"])
    achse_offen = sum(1 for d in datensaetze if "fachlicheAchse" in d["offeneFelder"])
    if partei_belegt + partei_parteilos + partei_offen != len(datensaetze):
        raise AssemblerFehler("Parteibilanz deckt nicht alle 500 Datensaetze ab.")
    if (partei_belegt, partei_parteilos, partei_offen) != (498, 2, 0):
        raise AssemblerFehler(
            "Parteibilanz weicht von der geprueften Quittung ab "
            f"(belegt={partei_belegt}, parteilos={partei_parteilos}, offen={partei_offen})."
        )
    pistorius_belegt = sum(1 for d in datensaetze if d.get("parteiQuittung"))
    if pistorius_belegt != PISTORIUS_GESAMT:
        raise AssemblerFehler(
            f"Pistorius-Parteizusatzquittung deckt {pistorius_belegt} Datensaetze ab "
            f"(erwartet {PISTORIUS_GESAMT})."
        )
    parteizusatz_belegt = sum(1 for d in datensaetze if d.get("parteiZusatzQuittung"))
    if parteizusatz_belegt != PARTEIZUSATZ_GESAMT:
        raise AssemblerFehler(
            f"Parteizusatzquittung deckt {parteizusatz_belegt} Datensaetze ab "
            f"(erwartet {PARTEIZUSATZ_GESAMT})."
        )
    ergaenzung_belegt = sum(1 for e in ergaenzung.values() if e["status"] == "belegt")
    ergaenzung_parteilos = sum(1 for e in ergaenzung.values() if e["status"] == "parteilos")
    ergaenzung_offen = sum(1 for e in ergaenzung.values() if e["status"] == "offen")
    rollen_belegt = sum(1 for e in profilrollen.values() if e["status"] == "belegt")
    rollen_offen = sum(1 for e in profilrollen.values() if e["status"] == "offen")
    rollen_vergeben = sum(
        len(d["profilrollenQuittung"]["funktionen"]) for d in datensaetze if d.get("profilrollenQuittung")
    )

    return {
        "status": (
            "Offline-Feldbelege fuer exakt 500 Zielprofile (Bundestag/Berlin/Brandenburg); "
            "technische Zusammenstellung, KEINE fachliche Freigabe und kein Importmanifest"
        ),
        "erstelltAm": None,  # vom Aufrufer gesetzt
        "vertragsformat": VERTRAGSVERSION,
        "grundlage": {
            "namensauswahl": "docs/betrieb/500-namensauswahl-20260927.json",
            "abrufBundestag": f"{ABRUF_BUNDESTAG} (330 Profile, Bundestagsverzeichnis)",
            "abrufLandesparlamente": f"{ABRUF_LANDESPARLAMENTE} (120 Berlin + 50 Brandenburg)",
            "detailseiten": f"{DETAILSEITEN}/ (amtliche Original-HTML je Abruf)",
            "extraktionen": f"{EXTRAKTION_BUNDESTAG}, {EXTRAKTION_LANDESPARLAMENTE}",
            "brandenburgParteipruefung": "docs/betrieb/brandenburg-parteipruefung-20260927.json",
            "parteifeldpruefung": (
                f"{PARTEIFELDPRUEFUNG_RESSOURCE} (335 gepruefte Parteifelder: "
                f"{ergaenzung_belegt} belegt, {ergaenzung_offen} offen)"
            ),
            "pistoriusParteibeleg": (
                f"{PISTORIUS_RESSOURCE} (enge Zusatzquittung; EIN bislang offener "
                "Bundestags-Parteibeleg aus der getrennten offiziellen Quelle "
                "https://www.spd.de/ueber-uns; H2, section#m236604 und exakter li-Name "
                "im Validator code-seitig fixiert; die 335er Quittung bleibt unveraendert offen)"
            ),
            "merzQuittung": (
                f"{MERZ_RESSOURCE} (vom Orchestrator eng geprueft; EIN zuvor offener Fachachsenfall: "
                "Bundeskanzler Friedrich Merz, Thema Richtlinien der Regierungspolitik, am Original "
                "woertlich als Richtlinien-Kompetenz belegt. KEINE neue Rolle; die bestehende 54er-Rolle "
                "Bundeskanzler bleibt erhalten und wird eigenstaendig ueber echte H1 + eigenen "
                "Funktionstext (div.m-biography__function) der amtlichen Bundestagsseite neu gebunden. "
                "Person/Amt nur aus dem echten sichtbaren eigenen Artikelkopf der amtlichen "
                "Bundesregierungsseite (nicht Bild/JSON-LD); Aufgabe nur aus dem geschlossenen "
                "H2-Abschnitt Richtlinien-Kompetenz des eigenen innersten div.bpa-richtext; URL + finalUrl "
                "+ sha256 + Bytezahl + Abrufzeit + HTTP + Datei, Original UND Metadaten, gebunden)"
            ),
            "woidkeQuittung": (
                f"{WOIDKE_RESSOURCE} (vom Orchestrator eng geprueft; EIN zuvor offener "
                "Brandenburger Fachachsenfall: Dr. Dietmar Woidke, bestehende Rolle "
                "Ministerpraesident des Landes Brandenburg und genau das Thema Richtlinien der "
                "Landespolitik. Person nur ueber die sichtbare H1 der kanonischen Landtagsseite; "
                "Aufgabe nur ueber den ersten direkten sichtbaren Absatz des eigenen Inhaltsbereichs "
                "Aufgaben und Organisation; weitere Staatskanzlei-Inhalte bleiben ausgeschlossen; "
                "URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei gebunden)"
            ),
            "wegnerQuittung": (
                f"{WEGNER_RESSOURCE} (vom Orchestrator eng geprueft; EIN zuvor offener Berliner "
                "Fachachsenfall: Kai Wegner, bestehende Rolle Regierender Buergermeister von Berlin "
                "und genau das Thema Richtlinien der Regierungspolitik. Rolle und Rollenquelle "
                "stammen unveraendert aus der 54er Rollenquittung; Person/Amt nur ueber den sichtbaren "
                "eigenen Artikel der amtlichen Berliner Senatsseite; Aufgabe nur ueber das erste eigene "
                "Listenelement des eigenen H2-Geschaeftsbereichs I der amtlichen Geschaeftsverteilung; "
                "alle uebrigen Listenelemente bleiben ausgeschlossen; URL + finalUrl + sha256 + "
                "Bytezahl + Abrufzeit + HTTP + Datei (Original UND Metadaten) gebunden)"
            ),
            "mandatsartenquittung": (
                f"{MANDATSARTEN_BB_RESSOURCE} (amtliche Brandenburger Uebersicht; Landesliste fuer "
                f"{len(eingang.mandatsarten_bb)} Profile, URL + sha256 + Abrufzeit gebunden)"
            ),
            "mandatsartenquittungBerlin": (
                f"{MANDATSARTEN_BE_RESSOURCE} (amtliches Handbuch-PDF Stand 8.10.2025, Seite 204 linke "
                f"Spalte; Bezirks-/Landesliste fuer {len(eingang.mandatsarten_be)} Profile, URL + sha256 + "
                "Bytezahl + Abrufzeit gebunden, woertliche Transkription; kein automatischer PDF-Parser-Nachweis)"
            ),
            "profilrollenQuittung": (
                f"{PROFILROLLEN_RESSOURCE} (vom Orchestrator geprueft; 37 Rollen fuer die fortgeschriebene "
                "Profile an bestehende funktionen angehaengt, 6 bleiben offen; URL + sha256 + woertliches "
                "Zitat im personengebundenen Abschnitt gebunden)"
            ),
            "fraktionsvorsitzQuittung": (
                f"{FRAKTIONSVORSITZ_RESSOURCE} (vom Orchestrator eng geprueft; die ZWEI zuletzt fehlenden "
                "aktuellen Fraktionsvorsitz-Funktionsfelder Britta Haßelmann und Dr. Matthias Miersch; "
                "kanonische Personenseite separat am lokalen Abruf und am echten Original mit H1 + "
                "ProfilePage.mainEntity '@id' #mdb gebunden, aktuelle Rolle nur im geschlossenen sichtbaren "
                ".bt-standard-content der amtlichen Fraktionsseite mit genau EINEM kanonischen Biografielink; "
                "URL + finalUrl + Abrufzeit + sha256 + Bytezahl + Datei beider Quellen, Original UND Metadaten; "
                "HTTP 200/abgerufen fixiert; KEINE Themen, keine Parteiableitung, keine weiteren Profilfelder)"
            ),
            "ressortquittung": (
                f"{RESSORTAKSEN_RESSOURCE} (vom Orchestrator geprueft; 19 zuvor offene Fachachsen aus "
                "amtlich belegtem aktuellem Ressort geschlossen: "
                f"{RESSORTAKSEN_REGIONEN['Bund']} Bund / {RESSORTAKSEN_REGIONEN['Berlin']} Berlin / "
                f"{RESSORTAKSEN_REGIONEN['Brandenburg']} Brandenburg; URL + sha256 + Abrufzeit + Datei "
                "der amtlichen Zusatzquelle und zusammenhaengendes Person/Ressort-Zitat gebunden)"
            ),
            "aufgabenquittung": (
                f"{AUFGABENACHSEN_RESSOURCE} (vom Orchestrator geprueft; 6 weitere zuvor offene "
                "Fachachsen aus amtlich belegten personengebundenen Aufgabenbereichen geschlossen: "
                "Beauftragtenaufgaben (Brand/Connemann/Pawlik/Kaiser) und explizite BMAS-"
                "Abteilungszustaendigkeit (Griese IV/V, Mast II/III); Validierung im getrennten Modul "
                "scripts/profil-feldbelege-500-aufgaben.py; URL + sha256 + Abrufzeit + Datei + Bytezahl "
                "der amtlichen Zusatzquelle und woertliche Zitate im personengebundenen Aufgabenabschnitt "
                "gebunden)"
            ),
            "beratendeachsenquittung": (
                f"{BERATENDEACHSEN_RESSOURCE} (vom Orchestrator geprueft; 2 weitere zuvor offene "
                "Fachachsen aus amtlich belegten BERATENDEN Ausschussrollen geschlossen: Knodel "
                "Landwirtschaft/Ernaehrung/Heimat, Seidler Haushalt; Validierung im getrennten Modul "
                "scripts/profil-feldbelege-500-beratende.py; kanonische Quelle an URL + finalUrl + "
                "sha256 + Bytezahl + Abrufzeit + Datei gebunden, echtes Original mit eindeutiger H1 und "
                "exakter Role 'Beratendes Mitglied' ohne endDate in ProfilePage.mainEntity.memberOf; "
                "die bestehende beratende Funktion bleibt erhalten, keine ordentliche/stellvertretende "
                "Ausschussmitgliedschaft)"
            ),
            "sonstigeGremien": (
                f"explizite Liste mit {len(SONSTIGE_GREMIEN)} amtlich belegten sonstigen Gremien des "
                "Bundestages (JSON-LD memberOf mit Original-Rolle und Original-URL); Sollmenge der "
                "staendigen Ausschuesse unveraendert aus lib/helmut/profile-readiness.resolveBundestagsausschuss"
            ),
            "stellvertretungenQuittung": (
                f"{STELLVERTRETUNGEN_RESSOURCE} (vom Orchestrator geprueft; belegter Verlust "
                "stellvertretender Brandenburger Ausschussmitgliedschaften: 76 bislang fehlende "
                "Stellvertretungen bei 35 der 50 kanonischen Landtagsprofile aus dem amtlichen "
                "Fachausschussindex 25220 und seinen 14 verlinkten Ausschussseiten; Validierung im "
                "getrennten Modul scripts/profil-feldbelege-500-stellvertretungen.py; echte H1, eigene "
                "geschlossene Stellvertretungsspalte, exakter kanonischer Personenlink; Person/Profilhash/"
                "Name/Fraktion bzw. Fraktionslosigkeit separat an die kanonischen Detailseiten gebunden)"
            ),
            "eingangsverzeichnis": str(eingang.verzeichnis),
            "hinweis": (
                "Detailseiten, Abrufe und Extraktionen sind lokale Arbeitsdateien ausserhalb des "
                "Repos; die Belegdatei bindet sie ueber URL und Quellhash."
            ),
        },
        "regeln": [
            "Nur die vorab festgelegte kanonische 500-Namensauswahl; keine nicht ausgewaehlten Kandidaten und keine alten 200er-Daten.",
            "Jede URL und jeder Quellhash wurde gegen die gespeicherte Original-HTML geprueft; Extraktion und Abruf muessen denselben Hash tragen.",
            "Brandenburg-Parteifelder stammen aus der Parteipruefung, uebernommen nur bei gleicher URL UND identischem Quellhash (46 belegt / 4 offen).",
            "Berlin-Parteifelder stammen aus der amtlichen h1 der Landtagsseite.",
            "Bundestags-Partei wird NICHT aus PoliticalParty/Fraktion abgeleitet; ohne gepruefte Quittung bleibt sie offen.",
            (
                "Bislang offene Parteifelder werden ausschliesslich aus der geprueften "
                f"Ergaenzungsquittung {PARTEIFELDPRUEFUNG_RESSOURCE} ergaenzt; nur status=belegt/parteilos "
                "wird uebernommen, status=offen bleibt offen. Jede Kennung ist an URL UND sha256 gebunden, "
                "das Belegzitat muss woertlich (Bundestag ausserhalb des Fraktionskopfs) in der amtlichen HTML stehen."
            ),
            "DIREKT nur bei belegtem Wahlkreismandat; eine Wahlkreiskandidatur ist kein Direktmandat.",
            "Landesliste wird als listenmandat + regionHinweis gefuehrt.",
            "Gremienrollen sind ordentlich/stellvertretend getrennt; beratende Rollen sind keine ordentliche Mitgliedschaft.",
            (
                "Belegte sonstige Gremien des Bundestages (Beirat, Unterausschuss, Kommission, "
                "Kontrollgremium, Wahlausschuss, Rechnungspruefung) werden NICHT als staendige Ausschuesse "
                "gefuehrt: sie stehen als weitereGremien UND rollengetreu in funktionen. Nur die explizite "
                "Liste mit amtlicher JSON-LD-URL wird herausgeloest; unbekannte echte Ausschuesse bleiben gesperrt."
            ),
            (
                "Vier bislang offene Brandenburg-Mandatsarten sind ueber die versionierte lokale Quittung "
                f"{MANDATSARTEN_BB_RESSOURCE} als Landesliste belegt (URL + Hash + Abrufzeit). Uebernommen "
                "werden NUR Mandatsart Landesliste und Region Brandenburg, NICHT Listenbeschriftung oder Listenplatz."
            ),
            (
                "Zwei bislang offene Berliner Mandatsarten sind ueber die versionierte lokale Quittung "
                f"{MANDATSARTEN_BE_RESSOURCE} als Bezirksliste (Johannes Martin, Marzahn-Hellersdorf) und "
                "Landesliste (Benedikt Lux) belegt. Quelle ist das am Original visuell abgenommene amtliche "
                "Handbuch-PDF (Stand 8.10.2025, Seite 204 linke Spalte) samt woertlicher Transkription; "
                "URL + sha256 + Bytezahl + Abrufzeit und die Quellmeta-JSON sind gebunden, es gibt KEINEN "
                "automatischen PDF-Parser-Nachweis. Person, exaktes Nachrueckdatum und Profilhash werden am "
                "gebundenen aktuellen Profilblock geprueft; Martin zusaetzlich am exakten H2/H3/Personlink "
                "der aktuellen Wahlkreissuche. Nur Mandatsart und Region werden uebernommen; ein Direktmandat "
                "des Vorgaengers und die Partei/Fraktion des historischen Einzugs werden nie uebernommen. "
                "Der zuvor letzte offene Fall Claudia Engelmann wurde durch Steffen Zillich derselben "
                "Fraktionsgruppe ersetzt; dessen Landesliste steht direkt im amtlichen Profilkopf."
            ),
            (
                "Fuer die nach dem belegbaren Profilersatz verbleibenden 43 Rollenprofile werden ueber die "
                "vom Orchestrator gepruefte "
                f"Rollenquittung {PROFILROLLEN_RESSOURCE} ausschliesslich die freigegebenen wortlaut-Strings "
                "dedupliziert an BESTEHENDE funktionen angehaengt (37 belegt, 6 offen). Es entsteht KEIN "
                "regierungsrolle-Schema und KEINE fachliche Achse; bestehende Gremienrollen bleiben erhalten. "
                "Jede Kennung ist an URL, Quellhash, erlaubten Status und ein woertliches Zitat im "
                "personengebundenen amtlichen Abschnitt gebunden (Bundestag Funktion nur m-biography__function, "
                "Biografie nur eigener Biografiebereich; keine Navigation als Beleg)."
            ),
            (
                "Die ZWEI zuletzt fehlenden aktuellen Fraktionsvorsitz-Funktionsfelder (Britta Haßelmann, "
                f"Dr. Matthias Miersch) werden ueber die vom Orchestrator eng gepruefte Quittung "
                f"{FRAKTIONSVORSITZ_RESSOURCE} dedupliziert an bestehende funktionen angehaengt und die "
                "amtliche Fraktionsseite als offizielle Quelle (art fraktion-profil) gefuehrt. Die "
                "Validierung laeuft im getrennten Modul scripts/profil-feldbelege-500-fraktionsvorsitz.py: "
                "die kanonische Personenseite wird SEPARAT am lokalen Abruf und am echten Original (genau "
                "eine H1 und genau EIN ProfilePage.mainEntity Typ Person mit '@id' #mdb, Name und "
                "description 'Mitglied des 21. Deutschen Bundestages') gebunden, der alte 54er Eintrag bleibt "
                "offen. Die aktuelle Rolle steht ausschliesslich im geschlossenen sichtbaren "
                ".bt-standard-content einer echten article.bt-artikel unter der exakten h2 "
                "Fraktionsvorsitzende/Fraktionsvorsitzender mit eigenem p; genau EIN sichtbarer "
                "Personenlink muss exakt auf die kanonische #mdb-Biografie-URL zeigen. Verborgene/inerte "
                "Inhalte und Abschnittsausbrueche sind kein Beleg. Beide Quellen sind an URL/finalUrl/"
                "Abrufzeit/sha256/Bytezahl/Datei gebunden (Original UND Metadaten), HTTP 200/abgerufen "
                "fixiert. Es entstehen KEINE Themen, keine aus der Fraktionsrolle abgeleitete "
                "Parteimitgliedschaft, keine persoenlichen Positionen, keine Amtsbeginn-Daten und KEINE "
                "fachliche Achse; alle uebrigen Profilfelder bleiben unveraendert."
            ),
            (
                "Fuer 19 dieser 54 Profile wird ueber die vom Orchestrator gepruefte Ressortquittung "
                f"{RESSORTAKSEN_RESSOURCE} die ausdruecklichen Ressortbegriffe als Themen gesetzt "
                "mit getrenntem Ableitungshinweis in funktionen und damit die fachliche "
                "Achse geschlossen. Nur die Regionen Bund/Berlin/Brandenburg sind erlaubt; jede Kennung ist "
                "eine bereits belegte Rolle der 54er Quittung, an deren Rollenquelle, an die amtliche "
                "Zusatzquelle (URL + sha256 + Abrufzeit + Datei) und an ein zusammenhaengendes woertliches "
                "Person/Ressort-Zitat gebunden. Keine persoenliche politische Position, keine erfundenen "
                "Themen, keine Ableitung aus Kanzler-/Vorsitzrollen; die disjunkte Vereinigung der 19 "
                "geschlossenen mit den 35 verbleibend offenen Achsen ergibt weiter genau die 54er "
                "Rollenquittung."
            ),
            (
                "Fuer 6 weitere dieser 54 Profile wird ueber die vom Orchestrator gepruefte Aufgabenquittung "
                f"{AUFGABENACHSEN_RESSOURCE} der ausdrueckliche Themenbegriff aus einem amtlich belegten "
                "personengebundenen Aufgabenbereich gesetzt (getrennter Herkunftshinweis in funktionen) und "
                "damit die fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-aufgaben.py: Brand/Connemann/Pawlik nur Name UND ausdrueckliche "
                "Beauftragtenaufgabe, Themen nur innerhalb dieser Aufgabe (Connemann: Digitales ist keine "
                "Beauftragtenaufgabe); Kaiser ueber die belegte Amtsrolle und den ausdruecklichen "
                "Aufgabenabsatz; BMAS Person -> explizit genannte Abteilungsnummern -> deren Aufgabenabschnitt "
                "(Griese IV/V, Mast II/III; Mast erhaelt nie ein Griese-Thema). Jede Kennung ist eine bereits "
                "belegte Rolle der 54er Quittung, an deren Rollenquelle, an die amtliche Zusatzquelle "
                "(URL + sha256 + Abrufzeit + Datei + Bytezahl) und an woertliche Zitate im richtigen "
                "personengebundenen Aufgabenabschnitt gebunden. Keine persoenliche politische Position, keine "
                "erfundenen Themen; die disjunkte Vereinigung der 19 Ressort- mit den 6 Aufgabenachsen und "
                "den 29 verbleibend offenen ergibt weiter genau die 54er Rollenquittung."
            ),
            (
                "Fuer 2 weitere dieser 54 Profile wird ueber die vom Orchestrator gepruefte beratende "
                f"Achsenquittung {BERATENDEACHSEN_RESSOURCE} die ausdrueckliche beratende Ausschussarbeit "
                "mit ihren Kurzthemen gesetzt (getrennter Ableitungshinweis in funktionen) und damit die "
                "fachliche Achse geschlossen. Die bestehende beratende Funktion bleibt erhalten; es entsteht "
                "NIE eine ordentliche/stellvertretende Ausschussmitgliedschaft und keine politische Position. "
                "Nur die zwei genehmigten Ausschuesse (Ausschuss fuer Landwirtschaft, Ernaehrung und Heimat; "
                "Haushaltsausschuss) sind erlaubt; jede Kennung ist an die kanonische Quelle "
                "(URL + finalUrl + sha256 + Bytezahl + Abrufzeit + Datei), an das echte Original mit "
                "eindeutiger H1 und an die exakte Role 'Beratendes Mitglied' ohne endDate in "
                "ProfilePage.mainEntity.memberOf gebunden. Die disjunkte Vereinigung der 19 Ressort-, 6 "
                "Aufgaben- und 2 beratenden Achsen mit den 27 verbleibend offenen ergibt weiter genau die "
                "54er Rollenquittung; diese 2 bleiben dort ausdruecklich offen (die beratende Funktion war "
                "bereits belegt, das ist KEIN Fehler)."
            ),
            (
                "Fuer 3 weitere dieser 54 Profile wird ueber die vom Orchestrator gepruefte "
                f"Zusatzaufgabenquittung {ZUSATZAUFGABEN_RESSOURCE} die ausdrueckliche amtliche "
                "Fachzustaendigkeit gesetzt (getrennter Ableitungshinweis in funktionen) und damit "
                "die fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-zusatzaufgaben.py: Breher nur die aktuelle 'seit'-Rolle "
                "'Beauftragte der Bundesregierung fuer Tierschutz' aus dem geschlossenen Biografieblock "
                "vor der Redaktionsnotiz (neue Funktionsrolle genau einmal, bestehende PSts-Rolle bleibt); "
                "Krichbaum nur die aktuelle AA-Seitenkopf-H1 'Staatsminister fuer Europa' (nicht die alte "
                "Sprecherrolle 2022-2025); Kippels das manuell am amtlichen BMG-Organisationsplan visuell "
                "abgenommene PDF-Fachurteil (Stand 03. September 2026, Seite 1, Personenkasten Abt. 1/4/5/6, "
                "getrennte woertliche Abteilungstitel, 12 Kurzthemen; kein externer PDF-Parser). Jede Kennung "
                "ist an die kanonische 54er Rolle und den kanonischen Bundestags-Profilnamen/URL/Hash gebunden "
                "und disjunkt zu den 19 Ressort-, 6 Aufgaben- und 2 beratenden Achsen. Die disjunkte Vereinigung "
                "mit den 2 BMWSB- und den 22 verbleibend offenen Achsen ergibt weiter genau die 54er Rollenquittung."
            ),
            (
                "Fuer 2 weitere dieser 54 Profile wird ueber die vom Orchestrator gepruefte "
                f"BMWSB-Aufgabenquittung {BMWSB_RESSOURCE} die ausdrueckliche personengebundene "
                "BMWSB-Aufgabenzustaendigkeit gesetzt (getrennter Ableitungshinweis in funktionen) und damit "
                "die fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-bmwsb.py, das die sicheren Helfer des Zusatzaufgabenmoduls "
                "wiederverwendet: nur die persoenlich zugewiesenen Unterbereiche (Bartol Z I 3/W II/S I/B I/B II, "
                "Poschmann Z II/W I/S II/S III) und deren woertliche Titel aus dem manuell am amtlichen "
                "BMWSB-Organigramm (Stand 1. Juli 2026, Seite 1) visuell abgenommenen PDF-Fachurteil, KEINE "
                "Hochstufung auf ganze Abteilungen und kein externer PDF-Parser. Die kanonische Quelle ist die "
                "tatsaechlich verlinkte v10-Adresse (URL + finalUrl + sha256 + Bytezahl + Abrufzeit + Datei, "
                "Original UND *.meta.json gebunden); die aktuelle Landingpage muss genau dieses PDF als echten "
                "aufgeloesten href tragen (kein Kommentar-/Skript-/Vorlagenanker und kein Textvorkommen). Jede "
                "Kennung ist an die kanonische 54er Rolle und den kanonischen Bundestags-Profilnamen/URL/Hash "
                "gebunden und disjunkt zu den 19 Ressort-, 6 Aufgaben-, 2 beratenden und 3 Zusatzaufgabenachsen. "
                "Die disjunkte Vereinigung mit den damals 22 verbleibend offenen Achsen ergab weiter genau die "
                "54er Rollenquittung."
            ),
            (
                "Fuer den einzeln offenen Rollenfall Philipp Amthor wird ueber die vom Orchestrator gepruefte "
                f"Einzelfallquittung {AMTHOR_RESSOURCE} die freigegebene aktuelle Funktionsrolle "
                "'Staatsminister fuer Bund-Laender-Zusammenarbeit beim Bundeskanzler' (seit 29. Juli 2026) genau "
                "einmal an bestehende funktionen angehaengt und das eine amtlich abgeleitete Thema "
                "'Bund-Laender-Beziehungen' gesetzt (getrennter Herkunftshinweis in funktionen); damit ist die "
                "fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-amthor.py, das die sicheren Helfer des Zusatzaufgabenmoduls "
                "wiederverwendet: die aktuelle Rolle stammt ausschliesslich aus dem geschlossenen eigenen "
                "div.bpa-richtext-Lebenslauf-p der Bundesregierungs-Personenseite (nicht Meta/Bildunterschrift), "
                "der vorige PSts-Digitalabsatz (2025 bis 2026) bleibt ausdruecklich historisch, das Thema "
                "ausschliesslich aus genau einem echten li mit strong 'Staatsminister fuer die "
                "Bund-Laender-Beziehungen' und 'Philipp Amthor' unter der Personalien-h2 der Ankuendigung "
                "(24. Juli 2026; die Ankuendigung belegt den Amtsantritt NICHT). Der 54er-Eintrag bleibt "
                "historisch offen (separate Neubindung, KEINE Lockerung des alten Rollenvalidators); Partei, "
                "Mandatsart und Gremien bleiben unveraendert. Jede Kennung ist an den kanonischen "
                "Bundestags-Profilnamen/URL/Hash der 54er Quittung und beide Zusatzquellen (URL + finalUrl + "
                "sha256 + Bytezahl + Abrufzeit + HTTP + Datei, Original UND Metadaten) gebunden und disjunkt zu "
                "den 19 Ressort-, 6 Aufgaben-, 2 beratenden, 3 Zusatzaufgaben- und 2 BMWSB-Achsen. Kein "
                "Digitalamt als aktuell, keine persoenliche Position; damals blieben 21 Achsen offen."
            ),
            (
                "Fuer 3 weitere dieser 54 Profile wird ueber die vom Orchestrator eng gepruefte "
                f"Wahlausschuss-Aufgabenquittung {WAHLAUSSCHUSS_RESSOURCE} das enge amtlich abgeleitete "
                "Thema 'Richter des Bundesverfassungsgerichts' gesetzt (getrennter Herkunftshinweis in "
                "funktionen) und damit die fachliche Achse geschlossen. Die Validierung laeuft im getrennten "
                "Modul scripts/profil-feldbelege-500-wahlausschuss.py, das die sicheren Helfer des "
                "Zusatzaufgabenmoduls wiederverwendet: die kanonische Person (H1/URL/Hash/Bytezahl/Abruf/HTTP) "
                "stammt aus der unveraenderten 54er Rollenquittung; die aktuelle Mitgliedschaft wird "
                "eigenstaendig aus genau EINEM ProfilePage.mainEntity (Typ Person, '@id' #mdb, Name, falls "
                "url vorhanden exakt die Quell-URL, description 'Mitglied des 21. Deutschen Bundestages') in "
                "genau EINER echten Role auf exakt Organization/Wahlausschuss/kanonische Gremien-URL mit dem "
                "exakten roleName, startDate <= Abrufzeit und OHNE endDate geprueft. Das enge Thema stammt "
                "ausschliesslich aus dem geschlossenen aktuellen Gremienaufgabenabsatz unter "
                "#arbeit-und-aufgaben und .bt-standard-content (genau ein eigener p mit vollstaendigem "
                "Wortlaut und 21. Wahlperiode); Navigation, Template und fremde Absaetze sind kein Beleg. Das "
                "sonstige Gremium und die bestehenden ordentlichen/stellvertretenden Funktionen bleiben "
                "unveraendert, es wird NIE als regulaerer Ausschuss zurueckgeschrieben (PR660 bleibt richtig), "
                "keine Umdeklarierung, keine Fraktionsvorsitz-/Parteifeld-/Mandatsartaenderung, keine "
                "persoenliche politische Position. Die 54er Rollenquittung und alle bisherigen Quittungen "
                "bleiben unveraendert (Haßelmann/Miersch bleiben dort offen, kein Blocker dieser "
                "eigenstaendigen Mitgliedschaftsquelle). Jede Kennung ist disjunkt zu den 19 Ressort-, 6 "
                "Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB- und 1 Amthor-Achse; die disjunkte "
                "Vereinigung ergibt weiter genau die 54er Rollenquittung, es bleiben 18 Achsen offen."
            ),
            (
                "Fuer den einzeln offenen Fachachsenfall Dennis Rohde wird ueber die vom Orchestrator eng "
                f"gepruefte Einzelfallquittung {ROHDE_RESSOURCE} das eine amtlich abgeleitete Thema "
                "'Bundeshaushalt' gesetzt (getrennter Herkunftshinweis in funktionen) und damit die fachliche "
                "Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-rohde.py, das die sicheren Helfer des Zusatzaufgabenmoduls "
                "wiederverwendet: die bestehende Amtsfunktion 'Parlamentarischer Staatssekretaer fuer Finanzen' "
                "aus der belegten 54er Rollenquittung bleibt unveraendert und traegt im eigenen "
                "Funktionsabschnitt KEINE Datumsangabe, ein Amtsbeginn wird nicht (auch nicht aus der "
                "MdB-Role 2025-03-25 des JSON-LD) abgeleitet; die kanonische Person wird separat ueber echte "
                "H1, eigenen aktuellen Funktionstext (div.m-biography__function) und die JSON-LD-Gegenprobe "
                "(genau eine echte Role 'Mitglied des Bundestages' ohne endDate) neu gebunden. Das Thema "
                "stammt ausschliesslich aus Rohdes eigenem, klar umrandetem Kasten auf Seite 1 des amtlich "
                "von der Landingpage verlinkten v=32-Organisationsplans (Stand 3. August 2026); die "
                "PDF-Originalbytes werden NUR ueber URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + "
                "Datei (Original UND Metadaten) gebunden, es gibt KEINEN automatischen PDF-Parser und keine "
                "erfundene Textextraktionsquelle. Die Landingpage muss genau diesen v=32-Link mit dem "
                "datierten Linktext tragen; die Suchtreffer-Fassung v=41 ist kein Beleg. Keine "
                "Nachbarkaesten (Schrodi Steuerpolitik, Kaiser Ostdeutschland), keine beamteten "
                "Staatssekretaere, keine ganzen Abteilungen, keine Kanzleramtsfunktion, keine persoenliche "
                "politische Position. Die Kennung ist disjunkt zu den 19 Ressort-, 6 Aufgaben-, 2 beratenden, "
                "3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3 Wahlausschuss-, 1 Jarzombek- und 1 "
                "Kloeckner-Achse; die disjunkte Vereinigung ergibt weiter genau die 54er Rollenquittung, es "
                "bleiben 14 Achsen offen."
            ),
            (
                "Fuer den einzeln offenen Fachachsenfall Friedrich Merz wird ueber die vom Orchestrator eng "
                f"gepruefte Einzelfallquittung {MERZ_RESSOURCE} das eine amtlich abgeleitete Thema "
                "'Richtlinien der Regierungspolitik' gesetzt (getrennter Herkunftshinweis in funktionen) und "
                "damit die fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-merz.py, das die sicheren Helfer des Zusatzaufgabenmoduls "
                "wiederverwendet: es entsteht KEINE neue Rolle; die bestehende aktuelle Rolle Bundeskanzler "
                "stammt unveraendert aus der belegten 54er Rollenquittung und wird trotzdem eigenstaendig neu "
                "gebunden (echte H1 und eigener aktueller Funktionstext div.m-biography__function der "
                "amtlichen Bundestags-Detailseite). Person und Amt stammen ausschliesslich aus dem echten "
                "sichtbaren eigenen Artikelkopf der amtlichen Bundesregierungsseite (genau eine "
                "header.bpa-article-header im Bereich #rs_reading_area_header, Topline 'Friedrich Merz ist "
                "Bundes-Kanzler'); Bild-Alt-Texte, Bildunterschriften und das BreadcrumbList-JSON-LD sind "
                "ausdruecklich KEIN Beleg. Das Thema stammt ausschliesslich aus dem geschlossenen "
                "H2-Abschnitt 'Richtlinien-Kompetenz' des eigenen innersten div.bpa-richtext im Artikelinhalt "
                "(#rs_reading_area_content): genau der Ziel-H2 und genau seine beiden eigenen Absaetze; "
                "Figuren/Bildunterschriften, die Nachbar-H2-Abschnitte (Regierungs-Bildung, Ressort-Prinzip, "
                "Regierungs-Verantwortung, Regierungs-Koalition, Vize-Kanzler, Zustimmung zur "
                "Regierungs-Politik) und verborgene/inerte Inhalte sind kein Beleg. Das Original traegt die "
                "Aufgabe woertlich als 'Richtlinien-Kompetenz'; der enge Themenbegriff 'Richtlinien der "
                "Regierungspolitik' ist die amtliche Bezeichnung derselben Aufgabe, keine freie "
                "Themenzuordnung. Keine konkreten politischen Positionen, Koalitionsziele, Ressorts oder "
                "allgemeinen Ministeriumsthemen; die amtliche Quelle wird an URL + finalUrl + sha256 + "
                "Bytezahl + Abrufzeit + HTTP + Datei (Original UND Metadaten) gebunden. Die Kennung ist "
                "disjunkt zu den 19 Ressort-, 6 Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 "
                "Amthor-, 3 Wahlausschuss-, 1 Jarzombek-, 1 Kloeckner- und 1 Rohde-Achse; die disjunkte "
                "Vereinigung ergibt weiter genau die 54er Rollenquittung. Nach den getrennten nachfolgenden "
                "Woidke- und Wegner-Einzelfaellen waren 11 Achsen offen; der belegbare Ersatz dieser "
                "elf Profile schliesst die aktuelle technische Fachachsenbilanz auf 0."
            ),
            (
                "Der belegte Verlust stellvertretender Brandenburger Ausschussmitgliedschaften wird "
                f"ueber die vom Orchestrator geprueffte Ergaenzungsquittung {STELLVERTRETUNGEN_RESSOURCE} "
                "behoben: 76 bislang fehlende Stellvertretungen bei 35 der 50 kanonischen Landtagsprofile "
                "werden ausschliesslich aus der eigenen geschlossenen Stellvertretungsspalte der 13 von 14 "
                "amtlichen Fachausschussseiten ergaenzt (Index 25220; Unterausschuss 23893 ist der belegte "
                "Nullfall ohne Spalte). Nur die 50 kanonischen Brandenburger Personen-URLs bilden die "
                "Auswahlgrenze; andere Personen auf den amtlichen Seiten sind keine Kundenprofile, es "
                "entstehen keine AfD-Profile. Ordentliche Ausschuesse, Partei, Fraktion, Funktionen, Themen "
                "und Mandatsart bleiben unveraendert, keine Aufwertung zu ordentlichem Sitz oder Vorsitz, "
                "keine erfundenen Themen. Die belegte Stellvertretung traegt die fachliche Achse und "
                "schliesst genau die eine zuvor offene Achse (Oliver Skopec); die uebrigen 34 Profile "
                "werden nur vollstaendiger. Index und vollstaendige Menge der 14 Quellen sind an "
                "URL/finalUrl/HTTP/Abrufzeit/Hash/Bytes/Datei (Original UND Metadaten) gebunden."
            ),
            (
                "Fuer den einzeln offenen Fachachsenfall Kai Wegner wird ueber die vom Orchestrator eng "
                f"gepruefte Einzelfallquittung {WEGNER_RESSOURCE} das eine amtlich abgeleitete Thema "
                "'Richtlinien der Regierungspolitik' gesetzt (getrennter Herkunftshinweis in funktionen) "
                "und damit die fachliche Achse geschlossen. Die Validierung laeuft im getrennten Modul "
                "scripts/profil-feldbelege-500-wegner.py, das die sicheren Helfer des Zusatzaufgabenmoduls "
                "wiederverwendet: es entsteht KEINE neue Rolle; die bestehende aktuelle Rolle Regierender "
                "Buergermeister von Berlin stammt unveraendert aus der belegten 54er Rollenquittung und "
                "bleibt samt Rollenquelle an den kanonischen 500er-Abruf gebunden. Person und Amt stammen "
                "ausschliesslich aus dem echten sichtbaren eigenen article.modul-teaser der amtlichen "
                "Berliner Senatsseite (eigene H3 'Kai Wegner' und eigene Amtsaussage 'Regierender "
                "Buergermeister: Kai Wegner, CDU'); Bild-Alt-Texte, Kommentare, Navigation und die "
                "Nachbarteaser (u. a. die Richtlinien-Seite und der Koalitionsvertrag) sind ausdruecklich "
                "KEIN Beleg. Das Thema stammt ausschliesslich aus dem geschlossenen H2-Abschnitt "
                "'I. Zum Geschaeftsbereich des Regierenden Buergermeisters/der Regierenden "
                "Buergermeisterin gehoeren:' und genau seinem ERSTEN eigenen Listenelement "
                "(Bestimmung und Fortentwicklung sowie Ueberwachung der Einhaltung der Richtlinien der "
                "Regierungspolitik); alle uebrigen 50 Listenelemente dieses Geschaeftsbereichs "
                "(Geschaeftsverteilung, Protokoll, Presse, Hauptstadtvertretung, Medien, Digitales, "
                "Wohnungsbau, Klimaschutz, Europa usw.) sind kein Beleg und werden ueber eine Sperrliste "
                "sowie den quellenseitigen Ausschluss ausdruecklich abgewiesen. Keine persoenliche "
                "politische Position, keine Koalitions-/Ressort-/Verwaltungsthemen; beide amtlichen "
                "Zusatzquellen werden an URL + finalUrl + sha256 + Bytezahl + Abrufzeit + HTTP + Datei "
                "(Original UND Metadaten) gebunden. Die Kennung ist disjunkt zu den 19 Ressort-, 6 "
                "Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3 Wahlausschuss-, 1 "
                "Jarzombek-, 1 Kloeckner-, 1 Rohde-, 1 Merz-, 1 Woidke- und 1 Stellvertretungsachse; die "
                "damalige disjunkte Vereinigung ergab die 54er Rollenquittung mit 11 offenen Achsen. "
                "Diese elf Profile sind jetzt durch gleichgruppige, amtlich voll belegte Ersatzprofile "
                "ersetzt; aktuell bleiben 0 Fachachsen offen."
            ),
            "Leere fachliche Achsen und ungeklaerte Parteizugehoerigkeiten bleiben sichtbar OFFEN.",
            "Alle 500 Datensaetze sind aktiv=false und importfreigegeben=false; technisches OK ist keine fachliche Freigabe.",
        ],
        "bilanz": {
            "gesamt": len(datensaetze),
            "nachParlament": nach_parlament,
            "eindeutigeKennungen": len(set(kennungen)),
            "eindeutigeUrls": len(set(urls)),
            "eindeutigeQuellhashes": len(set(hashes)),
            "hashPruefungBestanden": bindung["hashPruefungBestanden"],
            "aktivFalse": sum(1 for d in datensaetze if d["profil"]["aktiv"] is False),
            "importfreigegebenFalse": sum(1 for d in datensaetze if d["importfreigegeben"] is False),
            "parteiBelegt": partei_belegt,
            "parteiParteilos": partei_parteilos,
            "parteiOffen": partei_offen,
            "parteifeldpruefung": {
                "datei": PARTEIFELDPRUEFUNG_RESSOURCE,
                "geprueftGesamt": len(ergaenzung),
                "belegt": ergaenzung_belegt,
                "parteilos": ergaenzung_parteilos,
                "offen": ergaenzung_offen,
                "deckungsgleichVerwendet": len(eingang.ergaenzung_verwendet),
            },
            "pistoriusQuittung": {
                "datei": PISTORIUS_RESSOURCE,
                "geprueftGesamt": len(pistorius),
                "nachRegion": {"Bund": len(pistorius)},
                "belegt": pistorius_belegt,
                "verwendet": len(eingang.pistorius_verwendet),
            },
            "parteizusatzQuittung": {
                "datei": PARTEIZUSATZ_RESSOURCE,
                "geprueftGesamt": len(parteizusatz),
                "nachRegion": {"Bund": len(parteizusatz)},
                "belegt": parteizusatz_belegt,
                "verwendet": len(eingang.parteizusatz_verwendet),
            },
            "mandatsartOffen": mandatsart_offen,
            "fachlicheAchseOffen": achse_offen,
            "sonstigeGremien": {
                "expliziteListe": len(SONSTIGE_GREMIEN),
                "profileMitWeiterenGremien": sum(1 for d in datensaetze if d["weitereGremienBeleg"]),
                "mitgliedschaften": sum(len(d["weitereGremienBeleg"]) for d in datensaetze),
            },
            "mandatsartenquittung": {
                "datei": MANDATSARTEN_BB_RESSOURCE,
                "belege": len(eingang.mandatsarten_bb),
                "verwendet": len(eingang.mandatsarten_verwendet),
            },
            "mandatsartenquittungBerlin": {
                "datei": MANDATSARTEN_BE_RESSOURCE,
                "belege": len(eingang.mandatsarten_be),
                "verwendet": len(eingang.mandatsarten_be_verwendet),
            },
            "profilrollenQuittung": {
                "datei": PROFILROLLEN_RESSOURCE,
                "geprueftGesamt": len(profilrollen),
                "belegt": rollen_belegt,
                "offen": rollen_offen,
                "rollenVergeben": rollen_vergeben,
                "deckungsgleichVerwendet": len(eingang.profilrollen_verwendet),
            },
            "ressortachsenQuittung": {
                "datei": RESSORTAKSEN_RESSOURCE,
                "geprueftGesamt": len(ressortachsen),
                "nachRegion": dict(RESSORTAKSEN_REGIONEN),
                "themenGesetzt": sum(1 for d in datensaetze if d.get("ressortachsenQuittung")),
                "deckungsgleichVerwendet": len(eingang.ressortachsen_verwendet),
                "geschlosseneAchsen": len(ressort_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "aufgabenachsenQuittung": {
                "datei": AUFGABENACHSEN_RESSOURCE,
                "geprueftGesamt": len(aufgabenachsen),
                "nachRegion": {"Bund": len(aufgabenachsen)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("aufgabenachsenQuittung")),
                "deckungsgleichVerwendet": len(eingang.aufgabenachsen_verwendet),
                "geschlosseneAchsen": len(aufgaben_geschlossen),
            },
            "beratendeachsenQuittung": {
                "datei": BERATENDEACHSEN_RESSOURCE,
                "geprueftGesamt": len(beratendeachsen),
                "nachRegion": {"Bund": len(beratendeachsen)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("beratendeachsenQuittung")),
                "deckungsgleichVerwendet": len(eingang.beratendeachsen_verwendet),
                "geschlosseneAchsen": len(beratende_geschlossen),
            },
            "zusaetzlicheaufgabenQuittung": {
                "datei": ZUSATZAUFGABEN_RESSOURCE,
                "geprueftGesamt": len(zusatzaufgaben),
                "nachRegion": {"Bund": len(zusatzaufgaben)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("zusaetzlicheaufgabenQuittung")),
                "deckungsgleichVerwendet": len(eingang.zusaetzlicheaufgaben_verwendet),
                "geschlosseneAchsen": len(zusatz_geschlossen),
            },
            "bmwsbQuittung": {
                "datei": BMWSB_RESSOURCE,
                "geprueftGesamt": len(bmwsb),
                "nachRegion": {"Bund": len(bmwsb)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("bmwsbQuittung")),
                "deckungsgleichVerwendet": len(eingang.bmwsb_verwendet),
                "geschlosseneAchsen": len(bmwsb_geschlossen),
            },
            "amthorQuittung": {
                "datei": AMTHOR_RESSOURCE,
                "geprueftGesamt": len(amthor),
                "nachRegion": {"Bund": len(amthor)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("amthorQuittung")),
                "deckungsgleichVerwendet": len(eingang.amthor_verwendet),
                "geschlosseneAchsen": len(amthor_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "wahlausschussQuittung": {
                "datei": WAHLAUSSCHUSS_RESSOURCE,
                "geprueftGesamt": len(wahlausschuss),
                "nachRegion": {"Bund": len(wahlausschuss)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("wahlausschussQuittung")),
                "deckungsgleichVerwendet": len(eingang.wahlausschuss_verwendet),
                "geschlosseneAchsen": len(wahlausschuss_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "fraktionsvorsitzQuittung": {
                "datei": FRAKTIONSVORSITZ_RESSOURCE,
                "geprueftGesamt": len(fraktionsvorsitz),
                "nachRegion": {"Bund": len(fraktionsvorsitz)},
                "funktionenGesetzt": sum(1 for d in datensaetze if d.get("fraktionsvorsitzQuittung")),
                "themenGesetzt": 0,
                "deckungsgleichVerwendet": len(eingang.fraktionsvorsitz_verwendet),
                "geschlosseneAchsen": 0,
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "jarzombekQuittung": {
                "datei": JARZOMBEK_RESSOURCE,
                "geprueftGesamt": len(jarzombek),
                "nachRegion": {"Bund": len(jarzombek)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("jarzombekQuittung")),
                "deckungsgleichVerwendet": len(eingang.jarzombek_verwendet),
                "geschlosseneAchsen": len(jarzombek_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "kloecknerQuittung": {
                "datei": KLOECKNER_RESSOURCE,
                "geprueftGesamt": len(kloeckner),
                "nachRegion": {"Bund": len(kloeckner)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("kloecknerQuittung")),
                "deckungsgleichVerwendet": len(eingang.kloeckner_verwendet),
                "geschlosseneAchsen": len(kloeckner_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "rohdeQuittung": {
                "datei": ROHDE_RESSOURCE,
                "geprueftGesamt": len(rohde),
                "nachRegion": {"Bund": len(rohde)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("rohdeQuittung")),
                "deckungsgleichVerwendet": len(eingang.rohde_verwendet),
                "geschlosseneAchsen": len(rohde_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "merzQuittung": {
                "datei": MERZ_RESSOURCE,
                "geprueftGesamt": len(merz),
                "nachRegion": {"Bund": len(merz)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("merzQuittung")),
                "deckungsgleichVerwendet": len(eingang.merz_verwendet),
                "geschlosseneAchsen": len(merz_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "woidkeQuittung": {
                "datei": WOIDKE_RESSOURCE,
                "geprueftGesamt": len(woidke),
                "nachRegion": {"Brandenburg": len(woidke)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("woidkeQuittung")),
                "deckungsgleichVerwendet": len(eingang.woidke_verwendet),
                "geschlosseneAchsen": len(woidke_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "wegnerQuittung": {
                "datei": WEGNER_RESSOURCE,
                "geprueftGesamt": len(wegner),
                "nachRegion": {"Berlin": len(wegner)},
                "themenGesetzt": sum(1 for d in datensaetze if d.get("wegnerQuittung")),
                "deckungsgleichVerwendet": len(eingang.wegner_verwendet),
                "geschlosseneAchsen": len(wegner_geschlossen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "stellvertretungenQuittung": {
                "datei": STELLVERTRETUNGEN_RESSOURCE,
                "geprueftGesamt": len(stellvertretungen),
                "zielprofile": len(stellvertretungen),
                "mitgliedschaften": sum(len(v["ausschuesse"]) for v in stellvertretungen.values()),
                "quellen": STELLVERTRETUNGENMODUL.ERWARTUNG["quellen"],
                "deckungsgleichVerwendet": len(eingang.stellvertretungen_verwendet),
                "geschlosseneAchsen": len(stellvertretungen_achsen),
                "verbleibendOffeneAchsen": len(offene_achsen),
            },
            "offeneFelder": offene_felder,
        },
        "datensaetze": datensaetze,
    }


def _standard_erstellt_am() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "+00:00")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--eingang", type=Path, default=STANDARD_EINGANG, help="Verzeichnis mit Abrufen/Detailseiten/Extraktionen")
    parser.add_argument("--ausgang", type=Path, default=DEFAULT_AUSGANG, help="Zieldatei des Beleg-JSON")
    parser.add_argument("--erstellt-am", default=None, help="ISO-Zeitstempel fuer erstelltAm (Standard: jetzt, UTC)")
    args = parser.parse_args(argv)

    ergebnis = assembliere(Eingang(args.eingang))
    ergebnis["erstelltAm"] = args.erstellt_am or _standard_erstellt_am()
    args.ausgang.parent.mkdir(parents=True, exist_ok=True)
    with args.ausgang.open("w", encoding="utf-8") as fh:
        json.dump(ergebnis, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    bilanz = ergebnis["bilanz"]
    print(json.dumps({
        "ausgang": str(args.ausgang),
        "gesamt": bilanz["gesamt"],
        "nachParlament": bilanz["nachParlament"],
        "hashPruefungBestanden": bilanz["hashPruefungBestanden"],
        "parteiBelegt": bilanz["parteiBelegt"],
        "parteiOffen": bilanz["parteiOffen"],
        "fachlicheAchseOffen": bilanz["fachlicheAchseOffen"],
        "mandatsartOffen": bilanz["mandatsartOffen"],
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssemblerFehler as fehler:
        print(f"ASSEMBLER-FEHLER: {fehler}", file=sys.stderr)
        raise SystemExit(2)
