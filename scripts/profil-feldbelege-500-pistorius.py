#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enge, getrennte Zusatzquittung fuer den EINEN offenen Partei-Beleg Boris Pistorius.

Roadmap §3: Nach der geprueften 335er Parteifeldquittung bleiben 74 Parteifelder
offen. Fuer genau EINEN Fall (``bundestag-pistorius-boris-1046550``) wird ein
eigener, offizieller Partei-Beleg aus dem aktuell gelisteten SPD-Parteivorstand
(``https://www.spd.de/ueber-uns``) gesondert neu gebunden. Dieses Modul haelt den
grossen Assembler ``profil-feldbelege-500.py`` schlank und prueft ausschliesslich
diese eine versionierte Zusatzquittung
(``docs/betrieb/pistorius-partei-1-20260928.json``) gegen die unveraenderte
Original-HTML. Die historische 335er Quittung bleibt als Audit byteidentisch und
Pistorius darin weiterhin offen.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEINE hartcodierte Laufzeit,
  * die kanonischen H2-/Abschnitts-/li-Fakten stehen als ``ERWARTUNG`` im Code,
    NICHT in der Quittung: eine konsistent neu gehashte Testfixture kann die
    Pruefung deshalb NICHT bestehen, wenn H2, Abschnitt, Sichtbarkeit, Liste oder
    exakter Name abweichen,
  * das Original wird zusaetzlich an URL, HTTP-Status, HTTP-Datum, Bytezahl und
    sha256 gebunden; fehlt es, bricht die Pruefung ab (kein stilles Ueberspringen),
  * versteckte/inerte Bereiche, Fremdabschnitte, ein falscher Name, eine andere
    H2, ein fehlendes li oder ein anderer Abschnitt als ``section#m236604``
    sperren den Lauf,
  * nur der eine kanonische Fall; kein Schluss aus der Fraktion, keine
    Umdeklarierung, keine Importfreigabe.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

PISTORIUS = REPO_ROOT / "docs" / "betrieb" / "pistorius-partei-1-20260928.json"
PISTORIUS_RESSOURCE = "docs/betrieb/pistorius-partei-1-20260928.json"
# Das privates Original liegt bewusst ausserhalb des Repositories.
PISTORIUS_QUELLE_STANDARD = Path("/private/tmp/helmut-spd-ueber-uns-20260928.html")

VERSION = 1
GESAMT = 1
HASH_64 = re.compile(r"^[0-9a-f]{64}$")

# Bewusst eng fixiertes, am Original abgenommenes Fachurteil. Fuer synthetische
# Testfixtures vollstaendig injizierbar (``erwartung``); die H2-, Abschnitts- und
# li-Fakten sind NICHT aus der Quittung ableitbar.
ERWARTUNG = {
    "kennung": "bundestag-pistorius-boris-1046550",
    "region": "Bund",
    "parlament": "bundestag",
    "status": "belegt",
    "partei": "SPD",
    "person": "Boris Pistorius",
    "h2": "Weitere Mitglieder im SPD-Parteivorstand",
    "abschnittId": "m236604",
    "liName": "Boris Pistorius",
    "bindung": (
        "amtlich gelisteter aktueller SPD-Parteivorstand; eigenstaendiges sichtbares "
        "li unter der H2 unmittelbar vor section#m236604"
    ),
    "quelle": {
        "url": "https://www.spd.de/ueber-uns",
        "finalUrl": "https://www.spd.de/ueber-uns",
        "datei": "helmut-spd-ueber-uns-20260928.html",
        "abgerufenAm": None,
        "sha256": "535e62d64e01152270b4a3687fd8cd56c8feb4c561150d6821b6ea97493670c8",
        "bytes": 106172,
        "http": 200,
        "httpDate": "Mon, 28 Sep 2026 08:15:31 GMT",
        "abrufStatus": "abgerufen",
    },
}


class PistoriusFehler(Exception):
    """Fail-closed-Abbruch der Pistorius-Partei-Belegpruefung."""


# ── Sichere Helfer (nur Standardbibliothek) ───────────────────────────────────────────────

def _lies_json(pfad: Path):
    with Path(pfad).open(encoding="utf-8") as fh:
        return json.load(fh)


def _sha256_bytes(daten: bytes) -> str:
    return hashlib.sha256(daten).hexdigest()


def _text(fragment) -> str:
    ohne_tags = re.sub(r"<[^>]*>", " ", str(fragment or ""))
    return " ".join(ohne_tags.replace("\u00a0", " ").split())


def _norm(wert) -> str:
    # HTMLParser entpackt ``&nbsp;`` zu U+00A0; ``str.split()`` behandelt es als
    # Whitespace, sodass H2 und li unabhaengig von der Kodierung exakt verglichen werden.
    return unicodedata.normalize("NFC", " ".join(_text(wert).split()))


TAG_TOKEN = re.compile(r"<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)>", re.S)
ATTR_TOKEN = re.compile(
    r"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+))?"
)

HIDDEN_TAGS = {"script", "style", "template", "noscript", "nav", "header", "footer", "aside"}
HIDDEN_KLASSEN = {"hidden", "sr-only", "visually-hidden", "d-none", "invisible", "is-hidden"}


def _attrs(rest: str):
    ergebnis = []
    for treffer in ATTR_TOKEN.finditer(rest or ""):
        name = treffer.group(1).lower()
        wert = treffer.group(2)
        if wert is None:
            wert = ""
        else:
            wert = wert.strip()
            if len(wert) >= 2 and wert[0] in "\"'" and wert[-1] == wert[0]:
                wert = wert[1:-1]
        ergebnis.append((name, wert))
    return ergebnis


def _ist_versteckt(tag: str, attrs) -> bool:
    if tag in HIDDEN_TAGS:
        return True
    werte = {name: wert for name, wert in attrs}
    if "hidden" in werte:
        return True
    if (werte.get("aria-hidden", "") or "").strip().lower() == "true":
        return True
    if "inert" in werte:
        return True
    klassen = set((werte.get("class", "") or "").replace("\t", " ").split())
    if klassen & HIDDEN_KLASSEN or any(k.endswith("--hidden") for k in klassen):
        return True
    stil = (werte.get("style", "") or "").replace(" ", "").lower()
    if "display:none" in stil or "visibility:hidden" in stil:
        return True
    return False


class _SichtbareListe(HTMLParser):
    """Sammelt die sichtbaren ``li``-Texte EINES Ausschnitts und markiert Verstecktes."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.versteckt_tiefe = 0
        self.hat_verstecktes = False
        self._li = []
        self.li_texte = []
        self.li_versteckt = []

    def handle_starttag(self, tag, attrs):
        versteckt = _ist_versteckt(tag, attrs)
        if versteckt:
            self.hat_verstecktes = True
            self.versteckt_tiefe += 1
        self.stack.append((tag, versteckt))
        if tag == "li":
            self._li.append({"teile": [], "versteckt": self.versteckt_tiefe > 0})

    def handle_endtag(self, tag):
        if tag == "li" and self._li:
            eintrag = self._li.pop()
            self.li_texte.append(_norm("".join(eintrag["teile"])))
            self.li_versteckt.append(eintrag["versteckt"])
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for _, versteckt in self.stack[i:]:
                    if versteckt:
                        self.versteckt_tiefe -= 1
                del self.stack[i:]
                break

    def handle_data(self, daten):
        for eintrag in self._li:
            eintrag["teile"].append(daten)


def _versteckt_offen(prefix: str) -> bool:
    """True, wenn am Ende des Prefix noch ein verstecktes/inerte Element offen ist."""
    pruefer = _SichtbareListe()
    pruefer.feed(prefix)
    pruefer.close()
    return pruefer.versteckt_tiefe > 0


def _abschnitt_inhalt(html: str, oeffner_treffer: re.Match) -> str:
    """Inhalt der zu ``oeffner_treffer`` gehoerenden ``<section>`` bis zum passenden Ende."""
    start = oeffner_treffer.end()
    tiefe = 1
    for treffer in TAG_TOKEN.finditer(html, start):
        if treffer.group(2).lower() != "section":
            continue
        if treffer.group(1) == "/":
            tiefe -= 1
            if tiefe == 0:
                return html[start:treffer.start()]
        else:
            tiefe += 1
    raise PistoriusFehler(
        "Pistorius: section#m236604 ist unvollstaendig (kein passendes </section>)."
    )


def _pruefe_struktur(html: str, erwartung: dict) -> None:
    """Bindet die H2, die unmittelbar folgende section#m236604 und deren eigene li-Liste.

    Alle Fakten stammen aus ``erwartung`` (fest im Code), nie aus der Quittung. Jede
    Abweichung — andere H2, verschobene/versteckte/fehlende Liste, Fremdabschnitt,
    fehlendes oder zusaetzliches Vorkommen des Namens — sperrt fail closed.
    """
    haupt = re.search(r'<main\b[^>]*\bid="main"[^>]*>', html)
    if not haupt:
        raise PistoriusFehler("Pistorius: Hauptinhalt <main id=\"main\"> fehlt.")

    h2_treffer = []
    for treffer in re.finditer(r"<h2\b([^>]*)>(.*?)</h2>", html, re.S):
        if _norm(treffer.group(2)) == erwartung["h2"]:
            h2_treffer.append(treffer)
    if len(h2_treffer) != 1:
        raise PistoriusFehler(
            f"Pistorius: H2 {erwartung['h2']!r} muss genau einmal vorkommen "
            f"(gefunden: {len(h2_treffer)})."
        )
    h2 = h2_treffer[0]
    if _ist_versteckt("h2", _attrs(h2.group(1))) or _versteckt_offen(html[:h2.start()]):
        raise PistoriusFehler("Pistorius: die Abschnitts-H2 ist versteckt oder inert.")
    if h2.start() <= haupt.start():
        raise PistoriusFehler("Pistorius: die Abschnitts-H2 liegt nicht im Hauptinhalt.")

    # Die H2 geht UNMITTELBAR vor section#m236604 (nur optionaler Headline-Wrapper).
    abschnitt = re.compile(r"\s*(?:</div>\s*)?<section\b([^>]*)>")
    treffer = abschnitt.match(html, h2.end())
    if not treffer:
        raise PistoriusFehler(
            "Pistorius: der H2 folgt nicht unmittelbar section#m236604."
        )
    ids = {name: wert for name, wert in _attrs(treffer.group(1))}
    if ids.get("id") != erwartung["abschnittId"]:
        raise PistoriusFehler(
            f"Pistorius: erwarteter Abschnitt #{erwartung['abschnittId']} fehlt "
            f"(gefunden: {ids.get('id')!r})."
        )
    if _ist_versteckt("section", _attrs(treffer.group(1))):
        raise PistoriusFehler("Pistorius: section#m236604 ist versteckt oder inert.")

    inhalt = _abschnitt_inhalt(html, treffer)
    liste = _SichtbareListe()
    liste.feed(inhalt)
    liste.close()
    if liste.hat_verstecktes:
        raise PistoriusFehler("Pistorius: die eigene Liste enthaelt versteckte/inerte Elemente.")
    if any(liste.li_versteckt):
        raise PistoriusFehler("Pistorius: ein Listeneintrag ist versteckt oder inert.")
    namen = [text for text in liste.li_texte if text == erwartung["liName"]]
    if len(namen) != 1:
        raise PistoriusFehler(
            f"Pistorius: genau ein sichtbares li {erwartung['liName']!r} erwartet "
            f"(gefunden: {len(namen)})."
        )

    # Kein Fremdabschnitt/zusaetzliches Vorkommen des Namens irgendwo sonst.
    if html.count(erwartung["liName"]) != 1:
        raise PistoriusFehler(
            "Pistorius: der Name kommt ausserhalb der eigenen sichtbaren Liste vor."
        )
    abschnitt_ende = treffer.end() + len(inhalt) + len("</section>")
    haupt_ende = html.find("</main>", haupt.end())
    if haupt_ende == -1 or abschnitt_ende > haupt_ende:
        raise PistoriusFehler("Pistorius: der Abschnitt liegt nicht vollstaendig im Hauptinhalt.")


def _pruefe_quittung(quittung: dict, erwartung: dict) -> dict:
    """Prueft die versionierte Zusatzquittung intern (ohne Original)."""
    if not isinstance(quittung, dict) or not quittung:
        raise PistoriusFehler(f"Pistorius: Zusatzquittung fehlt: {PISTORIUS_RESSOURCE}.")
    if quittung.get("version") != VERSION:
        raise PistoriusFehler("Pistorius: unerwartete Quittungsversion.")
    if quittung.get("umfang") != GESAMT:
        raise PistoriusFehler("Pistorius: umfang muss genau 1 sein.")
    bilanz = quittung.get("bilanz") or {}
    if bilanz != {"gesamt": 1, "Bund": 1, "Berlin": 0, "Brandenburg": 0}:
        raise PistoriusFehler(f"Pistorius: unerwartete Bilanz {bilanz!r}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise PistoriusFehler("Pistorius: genau ein Ergebnis erwartet.")
    eintrag = ergebnisse[0]
    for feld in ("kennung", "region", "parlament", "status", "partei", "person",
                 "abschnittId", "liName"):
        if str(eintrag.get(feld) or "") != str(erwartung[feld]):
            raise PistoriusFehler(
                f"Pistorius: Feld {feld!r} weicht vom fixierten Urteil ab "
                f"({eintrag.get(feld)!r})."
            )
    if _norm(eintrag.get("abschnittH2")) != erwartung["h2"]:
        raise PistoriusFehler("Pistorius: die gebundene H2 weicht ab.")
    if eintrag.get("importfreigegeben") is not False:
        raise PistoriusFehler("Pistorius: keine Importfreigabe zulaessig.")
    quelle = eintrag.get("quelle") or {}
    soll = erwartung["quelle"]
    for feld, wert in soll.items():
        if quelle.get(feld) != wert:
            raise PistoriusFehler(
                f"Pistorius: Quellenfeld {feld!r} weicht ab ({quelle.get(feld)!r})."
            )
    if not HASH_64.match(str(quelle.get("sha256") or "")):
        raise PistoriusFehler("Pistorius: Quellhash ist kein sha256-Hexwert.")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise PistoriusFehler("Pistorius: finalUrl weicht von der kanonischen URL ab.")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise PistoriusFehler("Pistorius: Abruf war nicht erfolgreich (HTTP 200).")
    return eintrag


def _pruefe_original(daten: bytes, erwartung: dict, kennung: str) -> str:
    """Bindet die echten Originalbytes an Bytezahl und sha256 und liefert den Text."""
    soll = erwartung["quelle"]
    if len(daten) != soll["bytes"]:
        raise PistoriusFehler(
            f"Pistorius: Original-Bytezahl weicht ab ({len(daten)} != {soll['bytes']}, {kennung})."
        )
    if _sha256_bytes(daten) != soll["sha256"]:
        raise PistoriusFehler(f"Pistorius: Original-Hash weicht ab ({kennung}).")
    try:
        return daten.decode("utf-8")
    except UnicodeDecodeError as fehler:
        raise PistoriusFehler(f"Pistorius: Original ist kein gueltiges UTF-8 ({kennung}).") from fehler


def pruefe_pistorius(eingang=None, quittung=None, kennung_zu_abruf=None, original_bytes=None,
                     original_pfad=None, erwartung: dict | None = None) -> dict:
    """Prueft die enge Zusatzquittung und liefert einen normalisierten Index je Kennung.

    Die Quittung, die 500er Kennungszuordnung und das Original sind sowohl als
    direkte Parameter als auch ueber ein ``eingang``-Objekt (``pistorius``,
    ``kennung_zu_abruf``, ``pistorius_original``, ``pistorius_original_pfad``)
    uebergebbar; das Original kann als echte Bytes (synthetische Fixtures) oder als
    Pfad (Standard ``PISTORIUS_QUELLE_STANDARD``) vorliegen.
    """
    fix = dict(ERWARTUNG)
    if erwartung:
        fix.update({k: v for k, v in erwartung.items() if k != "quelle"})
        if "quelle" in erwartung:
            quelle_fix = dict(ERWARTUNG["quelle"])
            quelle_fix.update(erwartung["quelle"])
            fix["quelle"] = quelle_fix

    if quittung is None:
        quittung = getattr(eingang, "pistorius", None)
    if kennung_zu_abruf is None:
        kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    eintrag = _pruefe_quittung(quittung, fix)
    kennung = str(eintrag["kennung"])
    if kennung not in kennung_zu_abruf:
        raise PistoriusFehler(f"Pistorius: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    abruf = kennung_zu_abruf[kennung]
    if str(abruf.get("parlament") or "") != "bundestag":
        raise PistoriusFehler(f"Pistorius: Kennung {kennung} ist kein Bundestagsprofil.")

    if original_bytes is None:
        original_bytes = getattr(eingang, "pistorius_original", None)
    if original_pfad is None:
        original_pfad = getattr(eingang, "pistorius_original_pfad", None)
    original = original_bytes
    if original is None:
        pfad = original_pfad or PISTORIUS_QUELLE_STANDARD
        pfad = Path(pfad)
        if not pfad.is_file():
            raise PistoriusFehler(
                f"Pistorius: gebundenes Original fehlt ({pfad}); kein Beleg ohne Originalbytes."
            )
        original = pfad.read_bytes()
    if isinstance(original, str):
        original = original.encode("utf-8")

    html = _pruefe_original(bytes(original), fix, kennung)
    _pruefe_struktur(html, fix)

    quelle = dict(eintrag["quelle"])
    return {
        kennung: {
            "kennung": kennung,
            "region": eintrag["region"],
            "parlament": eintrag["parlament"],
            "status": eintrag["status"],
            "partei": eintrag["partei"],
            "person": eintrag["person"],
            "beleg": eintrag.get("beleg", fix["liName"]),
            "grund": eintrag.get("grund", ""),
            "abschnitt": eintrag["abschnittH2"],
            "abschnittId": eintrag["abschnittId"],
            "liName": eintrag["liName"],
            "bindung": eintrag.get("bindung", fix["bindung"]),
            "pruefung": eintrag.get("pruefung", ""),
            "quelle": quelle,
        }
    }


if __name__ == "__main__":  # pragma: no cover - reine lokale Selbstprobe
    import argparse
    import sys
    from types import SimpleNamespace

    parser = argparse.ArgumentParser(description="Pistorius-Partei-Beleg validieren")
    parser.add_argument("--quittung", type=Path, default=PISTORIUS)
    parser.add_argument("--original", type=Path, default=PISTORIUS_QUELLE_STANDARD)
    args = parser.parse_args()
    try:
        index = pruefe_pistorius(
            SimpleNamespace(
                pistorius=_lies_json(args.quittung),
                kennung_zu_abruf={
                    ERWARTUNG["kennung"]: {"parlament": "bundestag", "amtlicheKennung": "pistorius_boris-1046550"}
                },
                pistorius_original_pfad=args.original,
            )
        )
    except PistoriusFehler as fehler:
        print(f"PISTORIUS-FEHLER: {fehler}", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps({k: v["partei"] for k, v in index.items()}, ensure_ascii=False))
