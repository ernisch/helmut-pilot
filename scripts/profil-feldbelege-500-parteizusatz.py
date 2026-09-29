#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fail-closed-Pruefung von drei getrennten offiziellen Parteibelegen.

Die Bundestagsbiografien belegen die Identitaet, aber nicht die aktuelle Partei.
Darum werden genau Karoline Otte, Nicole Gohlke und Aaron Valent zusaetzlich an
aktuelle offizielle Partei-Seiten gebunden. Es wird ausschliesslich das Feld
``partei`` geschlossen; Fraktion, Funktionen, Themen und Mandat bleiben
unveraendert. Das Modul arbeitet rein lokal und gibt keine Importfreigabe.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
QUITTUNG = REPO_ROOT / "docs" / "betrieb" / "parteifelder-zusatz-3-20260928.json"
QUITTUNG_RESSOURCE = "docs/betrieb/parteifelder-zusatz-3-20260928.json"
QUELLEN = Path("/private/tmp/helmut-be-bb-start/zusatzquellen")

VERSION = 1
GESAMT = 3
HASH_64 = re.compile(r"^[0-9a-f]{64}$")

LINKEN_URL = "https://www.die-linke-bayern.de/parlamente/bundestag/kategorie/nicole-gohlke-mdb/oder/"
GRUENEN_URL = "https://gruene-niedersachsen.de/partei/parteirat/"

ERWARTUNG = {
    "bundestag-otte-karoline-1046442": {
        "person": "Karoline Otte",
        "partei": "Bündnis 90/Die Grünen",
        "profil": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/O/otte_karoline-1046442",
            "sha256": "14d5ff2fd186946d6209c6e900fa7b4516ad518e79b3f94298ebb446eb4ea1bb",
            "bytes": 276706,
            "datei": "bundestag-otte_karoline-1046442.html",
        },
        "quelle": {
            "url": GRUENEN_URL,
            "finalUrl": GRUENEN_URL,
            "datei": "gruene-nds-parteirat-20260928.html",
            "sha256": "e2ab40d352447107b3863ff32390bb8654f243d59fa88ee03b3e0b8c759be2fc",
            "bytes": 88694,
            "http": 200,
            "httpDate": "Mon, 28 Sep 2026 20:24:08 GMT",
        },
        "bindung": "gruene-parteirat",
    },
    "bundestag-gohlke-nicole-1044540": {
        "person": "Nicole Gohlke",
        "partei": "Die Linke",
        "profil": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/G/gohlke_nicole-1044540",
            "sha256": "fea0545ebb917a78b8e8ead376de23f78af903193b9068467aac91330725fa88",
            "bytes": 277409,
            "datei": "bundestag-gohlke_nicole-1044540.html",
        },
        "quelle": {
            "url": LINKEN_URL,
            "finalUrl": LINKEN_URL,
            "datei": "linke-bayern-bundestag-20260928.html",
            "sha256": "893edd59188b7e130b2fd8895f4ff6741a99b71bd401140124a710499942df67",
            "bytes": 111617,
            "http": 200,
            "httpDate": "Mon, 28 Sep 2026 20:23:37 GMT",
        },
        "bindung": "linke-landesgruppe",
        "href": "/parlamente/bundestag/nicole-gohlke/",
    },
    "bundestag-valent-aaron-1047844": {
        "person": "Aaron Valent",
        "partei": "Die Linke",
        "profil": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/V/valent_aaron-1047844",
            "sha256": "ccf67ae6be0c9fc9368c235b7ab9f21b571bf6e53ad87cbb3481f5c66e8ae0eb",
            "bytes": 277657,
            "datei": "bundestag-valent_aaron-1047844.html",
        },
        "quelle": {
            "url": LINKEN_URL,
            "finalUrl": LINKEN_URL,
            "datei": "linke-bayern-bundestag-20260928.html",
            "sha256": "893edd59188b7e130b2fd8895f4ff6741a99b71bd401140124a710499942df67",
            "bytes": 111617,
            "http": 200,
            "httpDate": "Mon, 28 Sep 2026 20:23:37 GMT",
        },
        "bindung": "linke-landesgruppe",
        "href": "/parlamente/bundestag/aaron-valent/",
    },
}


class ParteizusatzFehler(Exception):
    """Fail-closed-Abbruch der Zusatzbelegpruefung."""


def _norm(wert) -> str:
    text = re.sub(r"<[^>]*>", " ", str(wert or ""))
    return unicodedata.normalize("NFC", " ".join(text.replace("&nbsp;", " ").split()))


def _sha256(daten: bytes) -> str:
    return hashlib.sha256(daten).hexdigest()


def _pruefe_quelle(quelle: dict, erwartet: dict) -> str:
    for feld in ("url", "finalUrl", "datei", "sha256", "bytes", "http", "httpDate"):
        if quelle.get(feld) != erwartet[feld]:
            raise ParteizusatzFehler(f"Parteizusatz: Quelldrift bei {feld} ({erwartet['datei']}).")
    if not HASH_64.fullmatch(str(quelle.get("sha256", ""))):
        raise ParteizusatzFehler("Parteizusatz: ungueltiger Quellenhash.")
    pfad = QUELLEN / erwartet["datei"]
    try:
        daten = pfad.read_bytes()
    except FileNotFoundError as fehler:
        raise ParteizusatzFehler(f"Parteizusatz: Originalquelle fehlt: {pfad}") from fehler
    if len(daten) != erwartet["bytes"] or _sha256(daten) != erwartet["sha256"]:
        raise ParteizusatzFehler(f"Parteizusatz: Originalbytes weichen ab: {pfad}")
    return daten.decode("utf-8")


def _pruefe_gruene(html: str) -> None:
    titel = re.search(r"<title>(.*?)</title>", html, re.S)
    if not titel or _norm(titel.group(1)) != "Parteirat - Grüne Niedersachsen":
        raise ParteizusatzFehler("Parteizusatz: unerwarteter Titel der Grünen-Parteiratseite.")
    abschnitt = re.search(r'<div class="entry-content accordion">(.*?)</div>', html, re.S)
    if not abschnitt:
        raise ParteizusatzFehler("Parteizusatz: sichtbarer Parteirat-Abschnitt fehlt.")
    inhalt = abschnitt.group(1)
    if _norm("Der derzeitige Parteirat besteht aus folgenden Mitgliedern:") not in _norm(inhalt):
        raise ParteizusatzFehler("Parteizusatz: aktuelle Parteirat-Kennzeichnung fehlt.")
    if len(re.findall(r"\bKaroline Otte MdB\b", _norm(inhalt))) != 1:
        raise ParteizusatzFehler("Parteizusatz: Karoline Otte steht nicht genau einmal im Parteirat.")


def _pruefe_linke(html: str, personen: list[dict]) -> None:
    abschnitt = re.search(r'<section\s+id="c65738"[^>]*>(.*?)</section>', html, re.S)
    if not abschnitt:
        raise ParteizusatzFehler("Parteizusatz: Linke-Landesgruppenabschnitt fehlt.")
    inhalt = abschnitt.group(1)
    if len(re.findall(r"<h2\b[^>]*>\s*Die Landesgruppe Bayern\s*</h2>", inhalt, re.S)) != 1:
        raise ParteizusatzFehler("Parteizusatz: Linke-Landesgruppen-H2 fehlt oder ist doppelt.")
    if "Dem 21. deutschen Budestag gehören sieben Abgeordnete Der Linken Bayern an." not in _norm(inhalt):
        raise ParteizusatzFehler("Parteizusatz: aktuelle Parteiaussage der Landesgruppe fehlt.")
    for eintrag in personen:
        muster = rf'<a\b[^>]*href="{re.escape(eintrag["href"])}"[^>]*>(.*?)</a>'
        treffer = re.findall(muster, inhalt, re.S)
        anchor_text = (
            unicodedata.normalize("NFC", " ".join(re.sub(r"<[^>]*>", "", treffer[0]).split()))
            if len(treffer) == 1 else ""
        )
        if len(treffer) != 1 or anchor_text != eintrag["person"]:
            raise ParteizusatzFehler(
                f"Parteizusatz: {eintrag['person']} ist nicht eindeutig in der Landesgruppe gebunden."
            )


def pruefe_parteizusatz(eingang, quittung=None, kennung_zu_abruf=None) -> dict:
    """Prueft Quittung, kanonische Profile und beide offiziellen Partei-Seiten."""
    if quittung is None:
        with QUITTUNG.open(encoding="utf-8") as fh:
            quittung = json.load(fh)
    if quittung.get("vertragsformat") != "helmut-parteizusatz/1" or quittung.get("version") != VERSION:
        raise ParteizusatzFehler("Parteizusatz: falsches Vertragsformat oder falsche Version.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT or quittung.get("umfang") != GESAMT:
        raise ParteizusatzFehler("Parteizusatz: genau drei Ergebnisse erwartet.")
    if quittung.get("bilanz") != {"gesamt": 3, "Bund": 3, "Berlin": 0, "Brandenburg": 0}:
        raise ParteizusatzFehler("Parteizusatz: unerwartete Bilanz.")

    abrufe = kennung_zu_abruf or {}
    index = {}
    quelltexte = {}
    for eintrag in ergebnisse:
        kennung = eintrag.get("kennung")
        erwartet = ERWARTUNG.get(kennung)
        if erwartet is None or kennung in index:
            raise ParteizusatzFehler(f"Parteizusatz: fremde oder doppelte Kennung {kennung!r}.")
        for feld, wert in {
            "region": "Bund", "parlament": "bundestag", "status": "belegt",
            "person": erwartet["person"], "partei": erwartet["partei"],
            "importfreigegeben": False,
        }.items():
            if eintrag.get(feld) != wert:
                raise ParteizusatzFehler(f"Parteizusatz: {feld} weicht bei {kennung} ab.")
        if eintrag.get("profilQuelle") != erwartet["profil"]:
            raise ParteizusatzFehler(f"Parteizusatz: Profilbindung weicht bei {kennung} ab.")
        abruf = abrufe.get(kennung)
        if abruf is None:
            raise ParteizusatzFehler(f"Parteizusatz: kanonischer Abruf fehlt bei {kennung}.")
        for feld in ("url", "sha256", "bytes", "datei"):
            if abruf.get(feld) != erwartet["profil"][feld]:
                raise ParteizusatzFehler(f"Parteizusatz: kanonischer Profil-{feld} driftet bei {kennung}.")
        if _norm(abruf.get("text")) != _norm(", ".join(erwartet["person"].split()[::-1])):
            raise ParteizusatzFehler(f"Parteizusatz: kanonischer Profilname driftet bei {kennung}.")
        quelltexte.setdefault(erwartet["quelle"]["datei"], _pruefe_quelle(eintrag.get("quelle") or {}, erwartet["quelle"]))
        index[kennung] = eintrag

    if set(index) != set(ERWARTUNG):
        raise ParteizusatzFehler("Parteizusatz: Quittung deckt nicht genau die drei erwarteten Kennungen ab.")
    _pruefe_gruene(quelltexte["gruene-nds-parteirat-20260928.html"])
    _pruefe_linke(
        quelltexte["linke-bayern-bundestag-20260928.html"],
        [dict(ERWARTUNG[k], **{"kennung": k}) for k in ERWARTUNG if ERWARTUNG[k]["bindung"] == "linke-landesgruppe"],
    )
    return index
