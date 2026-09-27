#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die 3 zusaetzlichen Fachzustaendigkeiten.

Roadmap §3: drei weitere, zuvor separat gepruefte Fachzustaendigkeiten werden
integriert (Breher Tierschutz, Krichbaum Europa, Kippels BMG-Abteilungen). Dieses
Modul haelt den grossen Assembler ``profil-feldbelege-500.py`` schlank: es prueft
ausschliesslich die versionierte, vom Orchestrator vorbereitete Quittung
``docs/betrieb/zusaetzliche-aufgaben-3-20260927.json`` gegen die amtlichen
Originaldateien, deren Metadaten/Quittungen und die kanonische 54er Rollenquittung
und liefert einen normalisierten Index je Kennung. Der Assembler wendet die
belegten Themen, den getrennten Herkunftshinweis und (nur Breher) die zusaetzliche
Funktionsrolle an.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer PDF-Parser, KEINE hartcodierte Laufzeit.
    Das manuell am amtlichen Original visuell abgenommene PDF-Fachurteil
    (Stand/Seite/Personenkasten/Abteilungstitel) ist bewusst eng im Validator
    fixiert und fuer synthetische Testfixtures injizierbar,
  * nur die drei kanonischen Kennungen (disjunkt zu den 19 Ressort-, 6 Aufgaben-
    und 2 beratenden Achsen, deckungsgleich mit der 54er Rollenquittung),
  * jede Kennung an den kanonischen Bundestags-Profilnamen + URL + Hash der 54er
    Rollenquittung gebunden; die amtliche Quelle an URL/finalUrl/Hash/Bytezahl/
    Abrufzeit/HTTP/Datei, bei BMG ueber die ``*.meta.json``-Metadaten,
  * Breher: die ausdrueckliche aktuelle ``seit``-Rolle aus dem geschlossenen
    Bundestags-Biografieblock (``m-biography__biography``) VOR der Redaktionsnotiz,
    nicht aus Navigation oder einer historischen ``bis``-Rolle; neue Funktionsrolle
    genau einmal, bestehende Rolle bleibt erhalten,
  * Krichbaum: die aktuelle AA-Seitenkopf-H1 (nicht die alte Sprecherrolle
    2022-2025); nur die ausdrueckliche Amtsbezeichnung als Thema,
  * Kippels: nur die vier amtlich belegten Abteilungen 1/4/5/6 des BMG mit ihren
    getrennten woertlichen Titeln; keine fremde Zustaendigkeit (Schenderlein L/Z/2/3);
    die aktuell hashgebundene BMG-Landingpage muss genau dieses amtliche PDF als
    Link tragen (aufgeloester href, kein globales URL-Textvorkommen),
  * nur die freigegebenen Kurzthemen/Hinweise; keine frei erweiterbaren Themen,
    keine persoenliche politische Position, keine Partei/Fraktion/Region/Ausschuesse
    veraendern.
"""

from __future__ import annotations

import hashlib
import html as _html
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

REPO_ROOT = Path(__file__).resolve().parents[1]

ZUSATZAUFGABEN = REPO_ROOT / "docs" / "betrieb" / "zusaetzliche-aufgaben-3-20260927.json"
ZUSATZAUFGABEN_RESSOURCE = "docs/betrieb/zusaetzliche-aufgaben-3-20260927.json"

GESAMT = 3
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSARTEN = ("beauftragtenrolle", "amtshinweis", "abteilungszustaendigkeit")
QUELLHOSTS = {"bundestag.de", "auswaertiges-amt.de", "bundesgesundheitsministerium.de"}

# Getrennte Herkunftshinweise je Bindungsart: Amts-/Aufgabenbindung + Region +
# Ableitungskennzeichnung + ausdrueckliche Abgrenzung zu politischen Positionen.
HINWEIS_AMT = "Amtszuständigkeit {region} (amtlich abgeleitet): {wert}; keine persönliche politische Position"
HINWEIS_AUFGABE = "Aufgabenbindung {region} (amtlich abgeleitet): {wert}; keine persönliche politische Position"

# Nur diese amtlichen Namens-/Konjunktionsfuegeworte werden beim lexikalischen
# Abgleich ignoriert; das Originalzitat bleibt unveraendert wortgetreu.
VERBINDER = ("und", "für", "sowie", "zugleich")

REDAKTIONSNOTIZ = "[Anmerkung der Redaktion"
ABSCHNITT_BIOGRAFIE = "Biografie"
MARKER_BIOGRAFIE = "m-biography__biography"

# Bewusst eng fixiertes, manuell am Original visuell abgenommenes Fachurteil.
# Die BMG-Metadaten tragen die ``*.meta.json``-Dateien; die PDF-Anker werden ueber
# aufgeloeste hrefs verglichen (die Landingpage verlinkt relativ, nicht als Volltext).
ERWARTUNG = {
    "bundestag-breher-silvia-1043814": {
        "bindungsart": "beauftragtenrolle",
        "region": REGION,
        "person": "Silvia Breher",
        "funktion": "Beauftragte der Bundesregierung für Tierschutz",
        "zitat": "seit September 2025 Beauftragte der Bundesregierung für Tierschutz.",
        "abschnitt": ABSCHNITT_BIOGRAFIE,
        "themen": ["Tierschutz"],
    },
    "bundestag-krichbaum-gunther-1048828": {
        "bindungsart": "amtshinweis",
        "region": REGION,
        "person": "Gunther Krichbaum",
        "amt": "Staatsminister für Europa",
        "zitat": "Staatsminister für Europa Gunther Krichbaum",
        "abschnitt": "Aktueller Seitenkopf der Leitungsseite; nicht die historische Sprecherrolle 2022–2025",
        "themen": ["Europa"],
    },
    "bundestag-kippels-georg-1045390": {
        "bindungsart": "abteilungszustaendigkeit",
        "region": REGION,
        "person": "Dr. Georg Kippels",
        "aufgabenbindung": (
            "Parlamentarischer Staatssekretär im Bundesministerium für Gesundheit; "
            "Geschäftsbereich Abteilungen 1, 4, 5 und 6"
        ),
        "stand": "03. September 2026",
        "seite": 1,
        "personblock": [
            "Parlamentarischer Staatssekretär",
            "Dr. Georg Kippels",
            "MdB",
            "Geschäftsbereich: Abt. 1, 4, 5, 6",
        ],
        "abteilungen": {
            "1": "Arzneimittel, Medizinprodukte, Biotechnologie",
            "4": "Pflegeversicherung, Fachkräftesicherung, Recht der Heilberufe",
            "5": "Digitalisierung und Innovation",
            "6": "Gesundheitssicherheit, Resilienz; Internationales, Europa",
        },
        "themen": [
            "Arzneimittel",
            "Medizinprodukte",
            "Biotechnologie",
            "Pflegeversicherung",
            "Fachkräftesicherung",
            "Heilberufe",
            "Digitalisierung",
            "Innovation",
            "Gesundheitssicherheit",
            "Resilienz",
            "Internationales",
            "Europa",
        ],
        "quelle": {
            "url": "https://www.bundesgesundheitsministerium.de/fileadmin/Dateien/3_Downloads/O/Organisationsplan/Organisationsplan.pdf",
            "finalUrl": "https://www.bundesgesundheitsministerium.de/fileadmin/Dateien/3_Downloads/O/Organisationsplan/Organisationsplan.pdf",
            "abgerufenAm": "2026-09-27T17:34:50.488963+00:00",
            "sha256": "4b750443399db7330d45d4b3682476472a83771886a69ca4802ada9a2397f5bb",
            "bytes": 120987,
            "datei": "bmg-organisationsplan-20260903.pdf",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "aktuelleVerlinkung": {
            "url": "https://www.bundesgesundheitsministerium.de/ministerium/aufgaben-und-organisation/organisationsplan-organigramm",
            "finalUrl": "https://www.bundesgesundheitsministerium.de/ministerium/aufgaben-und-organisation/organisationsplan-organigramm",
            "abgerufenAm": "2026-09-27T17:34:53.916904+00:00",
            "sha256": "849ad8a813232bc5a5e09f3bbad0d9f36380934de7518506cde9729c2e931bcb",
            "bytes": 436679,
            "datei": "bmg-organisationsplan-landing-aktuell.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    },
}

# Nur die vier belegten BMG-Abteilungen sind zugelassen; jede andere (z. B. die
# fremde Schenderlein-Zustaendigkeit L/Z/2/3) bleibt gesperrt.
GENEHMIGTE_ABTEILUNGEN = ("1", "4", "5", "6")
ABTEILUNG_LINIE = re.compile(r"^Geschäftsbereich:\s*Abt\.\s*(.+)$")
SEIT_ROLLE = re.compile(r"^seit\s+\S+\s+\d{4}\b")


class ZusatzaufgabenFehler(Exception):
    """Fail-closed-Abbruch der zusaetzlichen Aufgabenpruefung."""


def _lies_json(pfad: Path):
    with Path(pfad).open(encoding="utf-8") as fh:
        return json.load(fh)


def _sha256(pfad: Path) -> str:
    h = hashlib.sha256()
    with Path(pfad).open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _text(fragment: str) -> str:
    ohne_tags = re.sub(r"<[^>]*>", " ", str(fragment or ""))
    return " ".join(_html.unescape(ohne_tags).split())


def _norm(wert: str) -> str:
    return unicodedata.normalize("NFC", " ".join(_text(str(wert or "")).split()))


def _tokens(wert: str):
    roh = unicodedata.normalize("NFC", _text(str(wert or ""))).lower()
    return re.findall(r"\w+", roh, flags=re.UNICODE)


def _enthaelt_in_reihenfolge(nadel: str, heu: str) -> bool:
    """Lexikalische, in Reihenfolge gepruefte Enthaltensein (ohne Verbinder).

    Keine Semantik, kein Fuzzy, kein Alias: alle Worttokens des Nadels muessen in
    Reihenfolge im Heu vorkommen; nur die amtlichen Verbinder werden beidseitig
    ignoriert.
    """
    nadel_tokens = [t for t in _tokens(nadel) if t not in VERBINDER]
    heu_tokens = _tokens(heu)
    if not nadel_tokens:
        return False
    position = 0
    for token in nadel_tokens:
        treffer = None
        for index in range(position, len(heu_tokens)):
            if heu_tokens[index] == token:
                treffer = index
                break
        if treffer is None:
            return False
        position = treffer + 1
    return True


def _quellenhost(url) -> str:
    treffer = re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://([^/?#]+)", str(url or ""))
    if not treffer:
        return ""
    return re.sub(r"^www\.", "", treffer.group(1).lower())


def _ueberschriften(dokument: str, tag: str) -> list:
    return [_norm(m) for m in re.findall(rf"<{tag}\b[^>]*>(.*?)</{tag}>", str(dokument or ""), re.S)]


class _SichtbaresHTML(HTMLParser):
    """Nur echte Inhaltselemente; Skripte, Vorlagen und Navigation sind kein Beleg."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.kopf = None
        self.koepfe = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        attrs = dict(attrs)
        if tag == "h1" and "heading__title" in attrs.get("class", "").split():
            if self.kopf is not None:
                raise ZusatzaufgabenFehler("Zusatzaufgabe: verschachtelte Inhaltsueberschrift.")
            self.kopf = []
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag == "h1" and self.kopf is not None:
            self.koepfe.append(_norm(" ".join(self.kopf)))
            self.kopf = None

    def handle_data(self, data):
        if not self.ausgelassen and self.kopf is not None:
            self.kopf.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument):
        parser = cls()
        parser.feed(dokument)
        parser.close()
        if parser.ausgelassen or parser.kopf is not None:
            raise ZusatzaufgabenFehler("Zusatzaufgabe: HTML-Belegabschnitt unvollstaendig.")
        return parser


def _personenblock(dokument: str, klasse: str) -> str:
    """Genau einen vollstaendig geschlossenen Personenblock lesen (kein Kreisimport).

    Eigene, kleine Kopie des strengen Abschnittslesers des Assemblers
    (``m-biography__biography``): genau ein geschlossener ``div``-Block, sonst fail
    closed. Kein Footer, keine Navigation, kein JSON-LD.
    """

    class Block(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.tiefe = 0
            self.bloecke = []
            self.teile = []
            self.ausgelassen = []

        def handle_starttag(self, tag, attrs):
            if tag in _SichtbaresHTML.AUSGELASSEN:
                self.ausgelassen.append(tag)
            if self.ausgelassen:
                return
            if tag == "div":
                if self.tiefe:
                    self.tiefe += 1
                elif klasse in dict(attrs).get("class", "").split():
                    self.tiefe = 1
                    self.teile = []

        def handle_endtag(self, tag):
            if self.ausgelassen:
                if tag == self.ausgelassen[-1]:
                    self.ausgelassen.pop()
                return
            if tag == "div" and self.tiefe:
                self.tiefe -= 1
                if not self.tiefe:
                    self.bloecke.append(" ".join(self.teile))

        def handle_data(self, data):
            if self.tiefe and not self.ausgelassen:
                self.teile.append(_html.escape(data))

    parser = Block()
    parser.feed(str(dokument or ""))
    parser.close()
    if parser.tiefe or parser.ausgelassen or len(parser.bloecke) != 1:
        raise ZusatzaufgabenFehler("Zusatzaufgabe: Biografieblock fehlt, ist doppelt oder unvollstaendig.")
    return _norm(parser.bloecke[0])


def _meta_datei(datei_name: str, zusatz: Path, kennung: str) -> dict:
    """Metadaten einer Zusatzquelle (``*.meta.json`` bevorzugt, sonst ``<stamm>.json``)."""
    primaer = zusatz / f"{datei_name}.meta.json"
    fallback = (zusatz / datei_name).with_suffix(".json")
    pfad = primaer if primaer.is_file() else fallback
    if not pfad.is_file():
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Metadaten fehlen zu {datei_name!r} ({kennung}).")
    return _lies_json(pfad)


def _pruefe_quelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str = "quelle") -> tuple:
    """Bindet eine amtliche Zusatzquelle an Metadatum und echtes Original."""
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    meta = _meta_datei(datei_name, zusatz, kennung)
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if _quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise ZusatzaufgabenFehler(
            f"Zusatzaufgabe: unerwarteter Quellhost {_quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if _sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


def _pruefe_rollenquelle(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                         detailseiten: Path, kennung: str, person_erwartet: str) -> dict:
    """Bindet die kanonische 54er Rolle + den kanonischen Bundestags-Profilnamen."""
    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} ist keine der 54 offenen Fachachsen.")
    if str(rollen_eintrag.get("status")) != "belegt":
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Rollenquittung zu {kennung} ist nicht belegt.")
    rollen_ref = rollen_eintrag.get("quelle") or {}
    rollen_quelle = ergebnis.get("rollenquelle") or {}
    if (
        rollen_quelle.get("url") != rollen_ref.get("url")
        or rollen_quelle.get("sha256") != rollen_ref.get("sha256")
        or rollen_quelle.get("abgerufenAm") != rollen_ref.get("abgerufenAm")
    ):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")
    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != "bundestag":
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} ist kein Bundestagsprofil.")
    if rollen_ref.get("url") != abruf.get("url") or rollen_ref.get("sha256") != abruf.get("sha256"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: 54er Rollenquelle weicht vom Abruf ab ({kennung}).")
    detail = Path(detailseiten) / str(abruf.get("datei") or "")
    if not detail.is_file() or _sha256(detail) != rollen_ref.get("sha256"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
    namen = _ueberschriften(detail.read_text(encoding="utf-8"), "h1")
    if len(namen) != 1 or namen[0] != _norm(person_erwartet):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Person passt nicht zur kanonischen Kennung ({kennung}).")
    return rollen_quelle


def _pruefe_breher(ergebnis: dict, erwartet: dict, detailseiten: Path, kennung_zu_abruf: dict,
                   kennung: str) -> dict:
    """Aktuelle 'seit'-Rolle aus dem geschlossenen Biografieblock, vor der Notiz."""
    abruf = kennung_zu_abruf[kennung]
    quelle = ergebnis.get("quelle") or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name)) != str(abruf.get(name)):
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Quellmetadatum {name} weicht vom Abruf ab ({kennung}).")
    if abruf.get("abrufStatus") != "abgerufen" or abruf.get("http") != 200:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Abruf nicht erfolgreich ({kennung}).")
    amtliche = str(abruf.get("amtlicheKennung") or "")
    if not amtliche or amtliche not in str(quelle.get("url")) or amtliche not in str(quelle.get("datei")):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: kanonische Kennung nicht in URL/Datei gebunden ({kennung}).")
    detail = Path(detailseiten) / str(quelle.get("datei"))
    if not detail.is_file() or _sha256(detail) != quelle.get("sha256") or detail.stat().st_size != quelle.get("bytes"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Original-Detailseite fehlt/weicht ab ({kennung}).")
    zitat = str(ergebnis.get("zitat") or "").strip()
    funktion = str(ergebnis.get("funktion") or "").strip()
    if str(ergebnis.get("abschnitt") or "").strip() != erwartet["abschnitt"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Abschnitt weicht ab ({kennung}).")
    if zitat != erwartet["zitat"] or funktion != erwartet["funktion"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Zitat/Funktion weichen vom fixierten Urteil ab ({kennung}).")
    if not SEIT_ROLLE.match(zitat) or re.search(r"\bbis\b", zitat, re.IGNORECASE):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Rolle ist keine ausdrueckliche 'seit'-Rolle ({kennung}).")
    if not _enthaelt_in_reihenfolge(funktion, zitat):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Funktion steht nicht wortgetreu im Zitat ({kennung}).")
    bereich = _personenblock(detail.read_text(encoding="utf-8"), MARKER_BIOGRAFIE)
    zitat_norm = _norm(zitat)
    if zitat_norm not in bereich:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Zitat steht nicht im geschlossenen Biografieblock ({kennung}).")
    notiz = bereich.find(REDAKTIONSNOTIZ)
    if notiz >= 0 and bereich.find(zitat_norm) > notiz:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Zitat steht nicht VOR der Redaktionsnotiz ({kennung}).")
    themen = ergebnis.get("themen")
    if themen != erwartet["themen"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Breher-Themen weichen vom freigegebenen Urteil ab ({kennung}).")
    for thema in themen:
        if not _enthaelt_in_reihenfolge(thema, funktion):
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Thema {thema!r} steht nicht in der Funktion ({kennung}).")
    return quelle


def _pruefe_krichbaum(ergebnis: dict, erwartet: dict, quell_text: str, kennung: str) -> None:
    """Aktuelle AA-Seitenkopf-H1 (nicht die alte Sprecherrolle)."""
    amt = str(ergebnis.get("amt") or "").strip()
    zitat = str(ergebnis.get("zitat") or "").strip()
    if amt != erwartet["amt"] or zitat != erwartet["zitat"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Amt/Zitat weichen vom fixierten Urteil ab ({kennung}).")
    if str(ergebnis.get("abschnitt") or "").strip() != erwartet["abschnitt"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Abschnitt weicht ab ({kennung}).")
    if "Sprecher" in zitat:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum darf nicht die alte Sprecherrolle sein ({kennung}).")
    person = str(ergebnis.get("person") or "").strip()
    if not _enthaelt_in_reihenfolge(person, zitat):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Person steht nicht im Zitat ({kennung}).")
    if not _enthaelt_in_reihenfolge(amt, zitat):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Amt steht nicht im Zitat ({kennung}).")
    if _SichtbaresHTML.lese(quell_text).koepfe != [_norm(zitat)]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Zitat ist keine eindeutige Seitenkopf-H1 ({kennung}).")
    themen = ergebnis.get("themen")
    if themen != erwartet["themen"]:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Krichbaum-Themen weichen vom freigegebenen Urteil ab ({kennung}).")
    for thema in themen:
        if not _enthaelt_in_reihenfolge(thema, amt):
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Thema {thema!r} steht nicht im Amt ({kennung}).")


def _pruefe_kippels(ergebnis: dict, erwartet: dict, zusatz: Path, quelle: dict, kennung: str) -> None:
    """Fixiertes, manuell abgenommenes PDF-Urteil + amtlicher PDF-Link auf der Landingpage."""
    for name in ("seite", "stand", "personblock", "abteilungen", "themen", "aufgabenbindung", "quelle",
                 "aktuelleVerlinkung"):
        if ergebnis.get(name) != erwartet[name]:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kippels-Feld {name} weicht vom fixierten PDF-Urteil ab ({kennung}).")
    person = str(ergebnis.get("person") or "").strip()
    personblock = erwartet["personblock"]
    if person not in personblock:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kippels-Person fehlt im fixierten Personenkasten ({kennung}).")
    zahlen = None
    for zeile in personblock:
        treffer = ABTEILUNG_LINIE.match(zeile)
        if treffer:
            zahlen = [t.strip() for t in re.split(r",|\bund\b", treffer.group(1)) if t.strip()]
    if zahlen != list(GENEHMIGTE_ABTEILUNGEN):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kippels-Abteilungszeile ist keine exakte 1,4,5,6-Angabe ({kennung}).")
    if set(erwartet["abteilungen"]) != set(GENEHMIGTE_ABTEILUNGEN):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kippels-Abteilungen sind nicht genau 1/4/5/6 ({kennung}).")
    if any(schl in erwartet["abteilungen"] for schl in ("L", "Z", "2", "3")):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: fremde Zustaendigkeit in den Kippels-Abteilungen ({kennung}).")
    titel = " ; ".join(erwartet["abteilungen"][nummer] for nummer in GENEHMIGTE_ABTEILUNGEN)
    for thema in erwartet["themen"]:
        if not _enthaelt_in_reihenfolge(thema, titel):
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kippels-Thema {thema!r} steht nicht in den Abteilungstiteln ({kennung}).")
    landing = ergebnis.get("aktuelleVerlinkung") or {}
    _landing_quelle, landing_text = _pruefe_quelle(ergebnis, zusatz, kennung, feld="aktuelleVerlinkung")
    ziel = str(quelle.get("url"))
    aufgeloest = set()
    for href in _SichtbaresHTML.lese(landing_text).links:
        aufgeloest.add(urljoin(str(landing.get("finalUrl") or landing.get("url")), _html.unescape(href)))
    if ziel not in aufgeloest:
        raise ZusatzaufgabenFehler(
            f"Zusatzaufgabe: die aktuelle Landingpage verlinkt das amtliche PDF nicht ({kennung})."
        )
    if urlsplit(ziel).path.endswith("Organisationsplan_EN.pdf"):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabe: verlinkt ist die englische, nicht die amtliche Fassung ({kennung}).")


def pruefe_zusatzaufgaben(eingang, *, quittung=None, ressortachsen_kennungen=None,
                          aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                          erwartung=None) -> dict:
    """Prueft die versionierte Quittung der 3 zusaetzlichen Fachzustaendigkeiten (fail closed).

    Erzwungen wird: exakt 3 eindeutige kanonische Kennungen, jede Kennung eine
    belegte Rolle der 54er Rollenquittung mit deckungsgleicher Rollenquelle und
    passendem kanonischen Bundestags-Profilnamen, disjunkt zu den 19 Ressort-, 6
    Aufgaben- und 2 beratenden Achsen, amtliche Quelle an
    URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/Datei gebunden (BMG ueber ``*.meta.json``),
    nur die freigegebenen Kurzthemen/Hinweise und das fixierte PDF-Urteil. Jede
    Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "zusaetzlicheaufgaben", None)
    if quittung is None:
        if not ZUSATZAUFGABEN.is_file():
            raise ZusatzaufgabenFehler(f"Zusatzaufgabenquittung fehlt: {ZUSATZAUFGABEN_RESSOURCE}.")
        quittung = _lies_json(ZUSATZAUFGABEN)
    if not isinstance(quittung, dict):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabenquittung fehlt: {ZUSATZAUFGABEN_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise ZusatzaufgabenFehler(
            f"Zusatzaufgabenquittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise ZusatzaufgabenFehler(f"Zusatzaufgabenquittung: unerwartete Bilanz {bilanz!r}.")

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
    ressort, aufgaben_achsen, beratende = (
        set(ressortachsen_kennungen), set(aufgabenachsen_kennungen), set(beratendeachsen_kennungen)
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise ZusatzaufgabenFehler("Zusatzaufgabe: Eintrag ohne Kennung.")
        if kennung in index:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        if kennung in ressort:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} ist bereits eine Ressortachse.")
        if kennung in aufgaben_achsen:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} ist bereits eine Aufgabenachse.")
        if kennung in beratende:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Kennung {kennung} ist bereits eine beratende Achse.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: importfreigegeben muss false sein ({kennung}).")
        bindungsart = str(ergebnis.get("bindungsart") or "").strip()
        if bindungsart != erwartet["bindungsart"]:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: unerwartete Bindungsart {bindungsart!r} ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Person weicht vom fixierten Urteil ab ({kennung}).")
        rollen_quelle = _pruefe_rollenquelle(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet["person"]
        )

        eintrag = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": bindungsart,
            "person": person,
            "themen": list(erwartet["themen"]),
            "rollenquelle": rollen_quelle,
        }
        if bindungsart == "beauftragtenrolle":
            funktion = str(ergebnis.get("funktion") or "").strip()
            hinweis = HINWEIS_AMT.format(region=erwartet["region"], wert=funktion)
            quelle = _pruefe_breher(ergebnis, erwartet, detailseiten, kennung_zu_abruf, kennung)
            eintrag.update({"funktion": funktion, "zitat": erwartet["zitat"], "abschnitt": erwartet["abschnitt"]})
        elif bindungsart == "amtshinweis":
            amt = str(ergebnis.get("amt") or "").strip()
            hinweis = HINWEIS_AMT.format(region=erwartet["region"], wert=amt)
            quelle, quell_text = _pruefe_quelle(ergebnis, zusatz, kennung)
            _pruefe_krichbaum(ergebnis, erwartet, quell_text, kennung)
            eintrag.update({"amt": amt, "zitat": erwartet["zitat"], "abschnitt": erwartet["abschnitt"]})
        else:  # abteilungszustaendigkeit
            hinweis = HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
            quelle, _pdf_text = _pruefe_quelle(ergebnis, zusatz, kennung)
            _pruefe_kippels(ergebnis, erwartet, zusatz, quelle, kennung)
            eintrag.update({
                "aufgabenbindung": erwartet["aufgabenbindung"],
                "stand": erwartet["stand"],
                "seite": erwartet["seite"],
                "abteilungen": {k: v for k, v in erwartet["abteilungen"].items()},
                "aktuelleVerlinkung": dict(ergebnis.get("aktuelleVerlinkung") or {}),
            })
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise ZusatzaufgabenFehler(f"Zusatzaufgabe: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")
        eintrag["ableitungsHinweis"] = hinweis
        eintrag["quelle"] = quelle
        index[kennung] = eintrag

    if len(index) != GESAMT:
        raise ZusatzaufgabenFehler(f"Zusatzaufgabenquittung: erwartet {GESAMT} eindeutige Kennungen, gefunden {len(index)}.")
    return index
