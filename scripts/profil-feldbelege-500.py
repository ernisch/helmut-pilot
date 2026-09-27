#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Offline-Assembler fuer docs/betrieb/500-profilfeldbelege-20260927.json.

Zweck (Roadmap §3, vorgeschalteter Schritt): aus der bereits vorab festgelegten
kanonischen 500-Namensauswahl, den oeffentlichen Abrufen der amtlichen
Detailseiten (330 Bundestag + 170 Landesparlamente Berlin/Brandenburg) und den
dazu vorhandenen ``*-extraktion.json`` einen reproduzierbaren, feldgenauen
Belegdatensatz fuer exakt 500 Zielprofile erzeugen.

Harte Grenzen dieses Werkzeugs:

  * ausschliesslich lokal/offline und nur mit der Python-Standardbibliothek
    (keine Netzwerk-, DB- oder Modellzugriffe, kein Import, kein Commit),
  * KEINE fachliche Freigabe: jeder Datensatz bleibt ``aktiv: false`` und
    ``importfreigegeben: false``; leere fachliche Achsen und ungeklaerte
    Parteizugehoerigkeiten bleiben sichtbar OFFEN (nichts wird "schoengerechnet"),
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
import sys
import unicodedata
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

ABRUF_BUNDESTAG = "bundestagsprofile-330-abruf.json"
ABRUF_LANDESPARLAMENTE = "landesprofile-170-abruf.json"
EXTRAKTION_BUNDESTAG = "bundestagsprofile-330-extraktion.json"
EXTRAKTION_LANDESPARLAMENTE = "landesprofile-170-extraktion.json"
DETAILSEITEN = "detailseiten"

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


# ── Eingang laden und binden ──────────────────────────────────────────────────
class Eingang:
    def __init__(self, verzeichnis: Path):
        self.verzeichnis = verzeichnis
        self.detailseiten = verzeichnis / DETAILSEITEN
        self.auswahl = _lies_json(NAMENSAUSWahl)
        self.brandenburg_partei = _lies_json(BRANDENBURG_PARTEI)
        self.parteifeldpruefung = _lies_json(PARTEIFELDPRUEFUNG)
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

    parteinachweis = _parteinachweis(eingang, eintrag, extraktion)
    parteinachweis = _ergaenzung_partnachweis(
        eingang, parlament, abruf, detail_html, mandatsId, parteinachweis
    )
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
    if ordentliche:
        profil["ausschuesse"] = ordentliche
    if stellvertretende:
        profil["stellvertretendeAusschuesse"] = stellvertretende
    funktionen = _funktionen_als_strings(profil_roh.get("funktionen"))
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

    # ── Feldbelege (Herkunft je Feld) ─────────────────────────────────────────
    feldbelege = dict(extraktion.get("feldbelege", {}))
    feldbelege["mandatsId"] = "Parlament + amtlicheKennung, in das ID-Muster von lib/helmut/profil-import.js normalisiert"
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
            f"{PARTEIFELDPRUEFUNG_RESSOURCE}: {parteinachweis['quittung']['url']} "
            f"sha256 {parteinachweis['quittung']['sha256']}"
        )
    if landtag_mandat and landtag_mandat.get("quelle") == "profilkopf" and landtag_mandat["art"] != "offen":
        feldbelege["region"] = (
            f"amtlicher Profilkopf (HTML), ausdrueckliche Angabe: {landtag_mandat.get('beleg', '')}"
        )
    if profil.get("funktionen"):
        feldbelege["funktionen"] = "memberOf-Rollen der Bundestagsseite, roh als belegte Strings; beratende Rollen sind keine ordentliche Mitgliedschaft"

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
        _merke(roh_zu_feld.get(punkt), punkt)

    # Die fachliche Achse ist erst dann offen, wenn WEDER eine ordentliche NOCH eine
    # stellvertretende belegte Ausschusszuordnung vorliegt (Import-/Validierungsvertrag
    # in lib/helmut: beide Mitgliedschaftsarten tragen die Achse, bleiben aber getrennt).
    if not ordentliche and not stellvertretende:
        _merke_feld("fachlicheAchse", "Keine ordentliche oder stellvertretende Ausschusszuordnung belegt; fachliche Achse offen, keine Themen erfunden")
    if parlament == "bundestag" and region["art"] == "offen":
        _merke_feld("mandatsart", region["offen"])
    if parlament == "bundestag" and region.get("offen") and region["art"] != "offen":
        _merke_feld("mandatsart", region["offen"])
    if mandatsart_belegt:
        feldbelege["mandatsartBelegt"] = "amtlicher Profilkopf (HTML); unveraendert uebernommen, nicht gedeutet"
    if landtag_mandat and landtag_mandat["art"] == "offen":
        _merke("mandatsart", landtag_mandat["offen"])
    if landtag_mandat and landtag_mandat.get("offen"):
        _merke("wahlbezirk" if landtag_mandat["art"] == "direkt" else "mandatsart", landtag_mandat["offen"])
    if parlament == "bundestag" and region["kandidaturen"]:
        feldbelege["wahlkreiskandidatur"] = "belegte Wahlkreiskandidatur; ausdruecklich KEIN Direktmandat"
    weitere_gremien = _normalisiere_liste(extraktion.get("weitereGremien"))
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
            "datei": PARTEIFELDPRUEFUNG_RESSOURCE,
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
        "h1Abgleich": True,
        "extraktionOffen": rohe_offene,
        "offenePunkte": offene_punkte,
        "offeneFelder": offene_felder,
        "importfreigegeben": False,
        "aktiv": False,
    }
    if "status" in extraktion:
        datensatz["extraktionsstatus"] = extraktion["status"]
    return datensatz


def assembliere(eingang: Eingang) -> dict:
    bindung = _pruefe_eingangsbindung(eingang)
    ergaenzung = _pruefe_ergaenzung(eingang)
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
    if (partei_belegt, partei_parteilos, partei_offen) != (424, 2, 74):
        raise AssemblerFehler(
            "Parteibilanz weicht von der geprueften Quittung ab "
            f"(belegt={partei_belegt}, parteilos={partei_parteilos}, offen={partei_offen})."
        )
    ergaenzung_belegt = sum(1 for e in ergaenzung.values() if e["status"] == "belegt")
    ergaenzung_parteilos = sum(1 for e in ergaenzung.values() if e["status"] == "parteilos")
    ergaenzung_offen = sum(1 for e in ergaenzung.values() if e["status"] == "offen")

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
            "mandatsartOffen": mandatsart_offen,
            "fachlicheAchseOffen": achse_offen,
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
