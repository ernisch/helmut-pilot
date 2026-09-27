#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die 6 Aufgabenachsen der 500er Feldbelege.

Roadmap §3: sechs der urspruenglich 54 offenen fachlichen Achsen werden ueber
amtlich belegte, personengebundene Aufgabenbereiche geschlossen. Dieses Modul
haelt den 2000-Zeilen-Assembler ``profil-feldbelege-500.py`` schlank: es prueft
ausschliesslich die versionierte, vom Orchestrator vorbereitete Quittung
``docs/betrieb/aufgabenachsen-6-20260927.json`` gegen die amtlichen Original-HTML
und die vorhandenen Belegquittungen und liefert einen normalisierten Index je
Kennung. Der Assembler wendet die belegten Themen und den getrennten
Herkunftshinweis nur an.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe), nichts wird
    erfinden: jedes Zitat muss woertlich in der Original-HTML stehen und im
    richtigen personengebundenen Aufgabenabschnitt liegen — nicht in Navigation,
    Skript oder Bildunterschrift; Kaisers Bildunterschrift belegt nur die Person,
  * ausschliesslich die 6 ausdruecklich benannten, aus der 54er Rollenquittung
    stammenden Kennungen; jede Kennung ist eine belegte Rolle der 54er Quittung,
    die Rollenquelle der kanonischen Person ist deckungsgleich mit der 54er
    Quittung und die Menge ist disjunkt zu den 19 Ressortprofilen,
  * Brand/Connemann/Pawlik: Name UND ausdrueckliche Beauftragtenaufgabe im
    zusammenhaengenden Zitat; Themen nur innerhalb dieser Aufgabe, NICHT aus der
    allgemeinen Ministeriumszugehoerigkeit (Connemann: Digitales ist keine
    Beauftragtenaufgabe). Pawlik wird nur die enge Konjunktions-Normalisierung
    zugestanden (Originalzitat bleibt unveraendert),
  * Kaiser: bereits belegte Amtsrolle der 54er Quittung plus amtliche
    Aufgaben-Seite dieser Amtsinhaberin mit einem ausdruecklichen Aufgabenabsatz;
    nur die dort belegten Themen, keine Themen aus blosser Bildunterschrift,
  * BMAS: Person -> explizit genannte Abteilungsnummern -> deren Aufgabenabschnitt.
    Die roemischen Nummern sind exakt (I ist nicht IV; VI a ist nicht VI b); eine
    Abteilungsnummer ist nur zulaessig, wenn die Personenzeile sie ausdruecklich
    nennt (Mast->II/III, Griese->IV/V), damit Mast nie ein Griese-Thema erhaelt,
  * getrennte echte Zitate bleiben getrennt: jedes Zitat wird einzeln geprueft,
    kein zusammengesetztes Scheinzitat.
"""

from __future__ import annotations

import hashlib
import html as _html
import json
import re
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

AUFGABENACHSEN = REPO_ROOT / "docs" / "betrieb" / "aufgabenachsen-6-20260927.json"
AUFGABENACHSEN_RESSOURCE = "docs/betrieb/aufgabenachsen-6-20260927.json"

GESAMT = 6
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSARTEN = ("beauftragtenaufgabe", "abteilungszustaendigkeit")

# Nur amtliche Quellhosts der personengebundenen Aufgabenstellen.
QUELLHOSTS = {
    "bmbfsfj.bund.de",
    "bmds.bund.de",
    "integrationsbeauftragte.de",
    "ostbeauftragte.de",
    "bmas.de",
}

# Herkunftshinweis: konkrete Aufgabenbindung + Region + Ableitungskennzeichnung.
AUFGABEN_THEMA = "Aufgabenbindung {region} (amtlich abgeleitet): {bindung}"

# Nur diese amtlichen Namens-/Konjunktionsfuegeworte werden beim lexikalischen
# Abgleich ignoriert. Die Pawlik-Quelle sagt "zugleich", die Aufgabenbindung
# "sowie"; nur diese enge Normalisierung ist zugelassen, das Originalzitat bleibt
# unveraendert wortgetreu.
VERBINDER = ("und", "für", "sowie", "zugleich")

# Amtliche Beauftragtenaufgabe: die Bindung muss ein Beauftragtenamt tragen.
BEAUFTRAGTEN_WORT = re.compile(r"\bbeauftragte[rn]?\b", re.IGNORECASE)
ROMAN = re.compile(r"^(?:X|IX|VIII|VII|VI|V|IV|III|II|I)(?:\s*[ab])?$")

# Einzige enge lexikalische Normalisierung: die amtliche Schreibweise nennt das
# Amt "Beauftragter/Beauftragte" und der zusammenhaengende Satz flektiert es
# ("ist der Beauftragte"). Nur diese Wortformen werden aufeinander abgebildet;
# keine weitere Aufweichung.
_FLEXION = {"beauftragter": "beauftragte", "beauftragten": "beauftragte"}


class AufgabenachsenFehler(Exception):
    """Fail-closed-Abbruch der Aufgabenachsenpruefung."""


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
    ohne_tags = re.sub(r"<[^>]*>", " ", fragment)
    return " ".join(_html.unescape(ohne_tags).split())


def _norm(wert: str) -> str:
    return unicodedata.normalize("NFC", " ".join(_text(str(wert or "")).split()))


def _tokens(wert: str):
    roh = unicodedata.normalize("NFC", _text(str(wert or ""))).lower()
    return re.findall(r"\w+", roh, flags=re.UNICODE)


def _kanon(token: str) -> str:
    return _FLEXION.get(token, token)


def _enthaelt_in_reihenfolge(nadel: str, heu: str) -> bool:
    """Lexikalische, in Reihenfolge gepruefte Enthaltensein (ohne Verbinder).

    Keine Semantik, keine Fuzzy-/Alias-Erweiterung: alle Worttokens des Nadels
    muessen in Reihenfolge im Heu vorkommen; nur die amtlichen Verbinder
    (``und``/``für``/``sowie``/``zugleich``) werden beidseitig ignoriert.
    """
    nadel_tokens = [_kanon(t) for t in _tokens(nadel) if t not in VERBINDER]
    heu_tokens = [_kanon(t) for t in _tokens(heu)]
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


_BLOCK_TAGS = (
    "script",
    "style",
    "noscript",
    "template",
    "nav",
    "svg",
    "button",
    "figcaption",
    "figure",
    "picture",
    "iframe",
    "a",
    "meta",
    "link",
)


def _fliess_text(dokument: str) -> str:
    """Nur der sichtbare Fliesstext (ohne Navigation, Skript, Bildunterschrift).

    Entfernt Skript-/Stil-/Template-Bloecke, Navigation, Teilen-Schaltflaechen,
    Bildunterschriften/-container, Frames sowie Link- und Metatexte. Danach
    bleiben die sichtbaren Absaetze/ueberschriften uebrig; nur dort darf ein
    personengebundenes Aufgabenzitat herkommen.
    """
    ohne_kommentare = re.sub(r"(?is)<!--.*?-->", " ", str(dokument or ""))
    for tag in _BLOCK_TAGS:
        ohne_kommentare = re.sub(rf"(?is)<{tag}\b[^>]*>.*?</{tag}>", " ", ohne_kommentare)
    ohne_kommentare = re.sub(r"(?is)<(?:meta|link)\b[^>]*>", " ", ohne_kommentare)
    return _norm(ohne_kommentare)


def _ueberschriften(dokument: str, tag: str):
    return [_norm(m) for m in re.findall(rf"<{tag}\b[^>]*>(.*?)</{tag}>", str(dokument or ""), re.S)]


def _abteilungsliste(personbeleg: str):
    """Explizit in der Personenzeile genannte Abteilungsnummern als Tokens."""
    treffer = re.search(r"Abteilungen\b(.*)", _norm(personbeleg))
    if not treffer:
        return []
    rest = re.split(r"\.\s", treffer.group(1))[0]
    return [t.strip() for t in re.split(r",|\bund\b", rest) if t.strip()]


def _pruefe_zusatzquelle(ergebnis: dict, zusatz: Path, kennung: str) -> tuple:
    quelle = ergebnis.get("quelle") or {}
    datei_name = str(quelle.get("datei") or "").strip()
    if Path(datei_name).name != datei_name or not datei_name.endswith(".html"):
        raise AufgabenachsenFehler(f"Aufgabenachse: ungueltiger Zusatzquellen-Dateiname ({kennung}).")
    quelle_datei = zusatz / datei_name
    if not quelle_datei.is_file():
        raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquelle fehlt lokal: {datei_name!r}.")
    meta_pfad = quelle_datei.with_suffix(".json")
    if not meta_pfad.is_file():
        raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquellen-Metadaten fehlen: {meta_pfad.name!r}.")
    meta = _lies_json(meta_pfad)
    for feld in ("url", "finalUrl", "abgerufenAm", "sha256"):
        if str(meta.get(feld) or "") != str(quelle.get(feld) or ""):
            raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquellen-Metadatum {feld} weicht ab ({kennung}).")
    if str(meta.get("datei") or "") != datei_name:
        raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquellen-Dateiname weicht ab ({kennung}).")
    if _sha256(quelle_datei) != str(quelle.get("sha256") or ""):
        raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquellen-Hash weicht ab ({kennung}).")
    if (meta.get("bytes") != quelle_datei.stat().st_size
            or quelle.get("bytes") != quelle_datei.stat().st_size):
        raise AufgabenachsenFehler(f"Aufgabenachse: Zusatzquellen-Bytezahl weicht ab ({kennung}).")
    if _quellenhost(quelle.get("url")) not in QUELLHOSTS:
        raise AufgabenachsenFehler(f"Aufgabenachse: unerwarteter Quellhost {_quellenhost(quelle.get('url'))!r} ({kennung}).")
    return quelle, quelle_datei.read_text(encoding="utf-8")


def _pruefe_bindungsart(ergebnis: dict, kennung: str, quell_text: str, fliess: str):
    """Regeln je Bindungsart; liefert die normalisierte Themenliste."""
    bindungsart = str(ergebnis.get("bindungsart") or "").strip()
    if bindungsart not in BINDUNGSARTEN:
        raise AufgabenachsenFehler(f"Aufgabenachse: unerwartete Bindungsart {bindungsart!r} ({kennung}).")
    person = str(ergebnis.get("person") or "").strip()
    aufgabenbindung = str(ergebnis.get("aufgabenbindung") or "").strip()
    personbeleg = str(ergebnis.get("personbeleg") or "").strip()
    themen = ergebnis.get("themen")
    zitate = ergebnis.get("zitate")
    if not person or not aufgabenbindung or not personbeleg or not isinstance(themen, list) or not themen:
        raise AufgabenachsenFehler(f"Aufgabenachse: unvollstaendige Angaben (person/aufgabenbindung/themen) ({kennung}).")
    if not isinstance(zitate, list) or not zitate:
        raise AufgabenachsenFehler(f"Aufgabenachse: keine Zitate ({kennung}).")
    if len(set(themen)) != len(themen):
        raise AufgabenachsenFehler(f"Aufgabenachse: doppeltes Thema ({kennung}).")

    # Jedes Zitat einzeln woertlich (kein zusammengesetztes Scheinzitat).
    voll_text = _norm(quell_text)
    for zitat in zitate:
        if not str(zitat).strip() or _norm(zitat) not in voll_text:
            raise AufgabenachsenFehler(f"Aufgabenachse: Zitat nicht woertlich in der Zusatzquelle ({kennung}).")
    if _norm(personbeleg) not in {_norm(z) for z in zitate}:
        raise AufgabenachsenFehler(f"Aufgabenachse: Personbeleg ist kein geprueftes Zitat ({kennung}).")

    themenzitat = str(ergebnis.get("themenzitat") or "").strip()
    if themenzitat:
        if _norm(themenzitat) not in {_norm(z) for z in zitate}:
            raise AufgabenachsenFehler(f"Aufgabenachse: Themenzitat ist kein geprueftes Zitat ({kennung}).")
        if _norm(themenzitat) not in fliess:
            raise AufgabenachsenFehler(f"Aufgabenachse: Themenzitat steht nicht im Fliesstext (Navigation/Bildunterschrift) ({kennung}).")

    person_tokens = _tokens(person)
    if not person_tokens:
        raise AufgabenachsenFehler(f"Aufgabenachse: leerer Personenname ({kennung}).")
    if not _enthaelt_in_reihenfolge(person, personbeleg):
        raise AufgabenachsenFehler(f"Aufgabenachse: Person fehlt im Personenbeleg ({kennung}).")
    if ergebnis.get("personImZitat") is True and _norm(personbeleg) not in fliess:
        raise AufgabenachsenFehler(f"Aufgabenachse: Personenaufgabe fehlt im Fliesstext ({kennung}).")

    if bindungsart == "beauftragtenaufgabe":
        if not themenzitat:
            raise AufgabenachsenFehler(f"Aufgabenachse: Themenzitat fehlt ({kennung}).")
        if not BEAUFTRAGTEN_WORT.search(aufgabenbindung):
            raise AufgabenachsenFehler(f"Aufgabenachse: Aufgabenbindung traegt kein Beauftragtenamt ({kennung}).")
        person_im_zitat = ergebnis.get("personImZitat") is True
        if person_im_zitat:
            # Name UND ausdrueckliche Beauftragtenaufgabe zusammen im Zitat.
            if not _enthaelt_in_reihenfolge(person, personbeleg):
                raise AufgabenachsenFehler(f"Aufgabenachse: Person fehlt im Zitat ({kennung}).")
            if not _enthaelt_in_reihenfolge(aufgabenbindung, personbeleg):
                raise AufgabenachsenFehler(f"Aufgabenachse: Beauftragtenaufgabe fehlt im Zitat ({kennung}).")
            for thema in themen:
                if not _enthaelt_in_reihenfolge(thema, aufgabenbindung):
                    raise AufgabenachsenFehler(
                        f"Aufgabenachse: Thema {thema!r} liegt ausserhalb der Beauftragtenaufgabe "
                        f"(keine Ableitung aus blosser Ministeriumszugehoerigkeit) ({kennung})."
                    )
        else:
            # Amt-Seite einer belegten Amtsinhaberin: Personenbeleg + ausdruecklicher
            # Aufgabenabsatz; Themen nur aus dem Aufgabenabsatz, nie aus Bildunterschrift.
            if person not in _text(quell_text):
                raise AufgabenachsenFehler(f"Aufgabenachse: Personenbeleg fehlt in der Quelle ({kennung}).")
            absatz = str(ergebnis.get("aufgabenabsatz") or "").strip()
            if not absatz:
                raise AufgabenachsenFehler(f"Aufgabenachse: Aufgabenabsatz fehlt ({kennung}).")
            if absatz not in _ueberschriften(quell_text, "h2"):
                raise AufgabenachsenFehler(f"Aufgabenachse: Aufgabenabsatz {absatz!r} ist keine Ueberschrift ({kennung}).")
            themenabsatz = str(ergebnis.get("themenabsatz") or absatz)
            if _norm(themenabsatz) not in {_norm(z) for z in zitate}:
                raise AufgabenachsenFehler(f"Aufgabenachse: Aufgaben-Unterabschnitt ist nicht zitiert ({kennung}).")
            abschnitte = re.findall(r"(?is)<h2\b[^>]*>(.*?)</h2>(.*?)(?=<h2\b|$)", quell_text)
            passende_abschnitte = [inhalt for kopf, inhalt in abschnitte if _norm(kopf) == _norm(themenabsatz)]
            if len(passende_abschnitte) != 1 or _norm(themenzitat) not in _fliess_text(passende_abschnitte[0]):
                raise AufgabenachsenFehler(f"Aufgabenachse: Themenzitat steht nicht im Aufgabenabsatz ({kennung}).")
            for thema in themen:
                if not _enthaelt_in_reihenfolge(thema, themenzitat):
                    raise AufgabenachsenFehler(f"Aufgabenachse: Thema {thema!r} steht nicht im Aufgabenabsatz ({kennung}).")
        return list(themen)

    # abteilungszustaendigkeit (BMAS): Person -> Abteilungsnummern -> Aufgabenabschnitt.
    nummern = ergebnis.get("abteilungsnummern")
    if not isinstance(nummern, list) or not nummern:
        raise AufgabenachsenFehler(f"Aufgabenachse: Abteilungsnummern fehlen ({kennung}).")
    if len(set(nummern)) != len(nummern):
        raise AufgabenachsenFehler(f"Aufgabenachse: doppelte Abteilungsnummer ({kennung}).")
    if any(not isinstance(n, str) or not ROMAN.fullmatch(n) for n in nummern):
        raise AufgabenachsenFehler(f"Aufgabenachse: ungueltige Abteilungsnummer ({kennung}).")
    if aufgabenbindung != f"Zustaendigkeit laut BMAS-Organigramm: Abteilungen {' und '.join(nummern)} (belegte Teilmenge)":
        raise AufgabenachsenFehler(f"Aufgabenachse: Aufgabenbindung passt nicht zu den Abteilungen ({kennung}).")
    genannt = _abteilungsliste(personbeleg)
    for nummer in nummern:
        if nummer not in genannt:
            raise AufgabenachsenFehler(
                f"Aufgabenachse: Abteilung {nummer!r} ist in der Personenzeile nicht ausdruecklich "
                f"genannt (keine Vermischung Griese/Mast) ({kennung})."
            )
    abteilungszitate = ergebnis.get("abteilungszitate")
    if not isinstance(abteilungszitate, list) or len(abteilungszitate) != len(nummern):
        raise AufgabenachsenFehler(f"Aufgabenachse: Abteilungszitate fehlen ({kennung}).")
    bereiche = []
    for nummer in nummern:
        treffer = [
            _norm(z) for z in abteilungszitate
            if re.match(rf"^Abteilung\s+{re.escape(nummer)}\s+Aufgabenbereiche:", _norm(z))
        ]
        if len(treffer) != 1:
            raise AufgabenachsenFehler(f"Aufgabenachse: kein eindeutiger Aufgabenabschnitt zu Abteilung {nummer!r} ({kennung}).")
        if treffer[0] not in {_norm(z) for z in zitate}:
            raise AufgabenachsenFehler(f"Aufgabenachse: Abteilungszitat ist kein geprueftes Zitat ({kennung}).")
        if treffer[0] not in fliess:
            raise AufgabenachsenFehler(f"Aufgabenachse: Abteilungszitat steht nicht im Fliesstext ({kennung}).")
        bereiche.append(treffer[0].split("Aufgabenbereiche:", 1)[1].strip())
    gesamt_bereiche = " ; ".join(bereiche)
    for thema in themen:
        if not _enthaelt_in_reihenfolge(thema, gesamt_bereiche):
            raise AufgabenachsenFehler(
                f"Aufgabenachse: Thema {thema!r} steht nicht im Aufgabenabschnitt der genannten "
                f"Abteilungen ({', '.join(nummern)}) ({kennung})."
            )
    return list(themen)


def pruefe_aufgabenachsen(eingang, *, quittung=None, ressortachsen_kennungen=None) -> dict:
    """Prueft die versionierte Aufgabenquittung der 6 Achsen (fail closed).

    Erzwungen wird: exakt 6 eindeutige kanonische Kennungen, jede Kennung eine
    belegte Rolle der 54er Rollenquittung mit deckungsgleicher Rollenquelle, die
    Menge disjunkt zu den 19 Ressortachsen, amtliche Zusatzquelle an
    URL/Hash/Abrufzeit/Datei/Bytezahl gebunden, woertliche Zitate im richtigen
    personengebundenen Aufgabenabschnitt sowie der getrennte Herkunftshinweis.
    Jede Abweichung bricht ab.
    """
    if quittung is None:
        if not AUFGABENACHSEN.is_file():
            raise AufgabenachsenFehler(f"Aufgabenquittung fehlt: {AUFGABENACHSEN_RESSOURCE}.")
        quittung = _lies_json(AUFGABENACHSEN)
    if not isinstance(quittung, dict):
        raise AufgabenachsenFehler(f"Aufgabenquittung fehlt: {AUFGABENACHSEN_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise AufgabenachsenFehler(
            f"Aufgabenquittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (GESAMT, GESAMT, 0, 0):
        raise AufgabenachsenFehler(f"Aufgabenquittung: unerwartete Bilanz {bilanz!r}.")

    profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    ressort = set(ressortachsen_kennungen or ())
    zusatz = Path(eingang.verzeichnis) / "zusatzquellen"

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise AufgabenachsenFehler("Aufgabenachse: Eintrag ohne Kennung.")
        if kennung in index:
            raise AufgabenachsenFehler(f"Aufgabenachse: doppelte Kennung {kennung}.")
        if kennung in ressort:
            raise AufgabenachsenFehler(f"Aufgabenachse: Kennung {kennung} ist bereits eine Ressortachse.")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise AufgabenachsenFehler(f"Aufgabenachse: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen (Fremdkennung).")
        rollen_eintrag = profilrollen.get(kennung)
        if rollen_eintrag is None:
            raise AufgabenachsenFehler(f"Aufgabenachse: Kennung {kennung} ist keine der 54 offenen Fachachsen.")
        if str(rollen_eintrag.get("status")) != "belegt":
            raise AufgabenachsenFehler(f"Aufgabenachse: Rollenquittung zu {kennung} ist nicht belegt.")

        if str(ergebnis.get("region") or "").strip() != REGION or abruf.get("parlament") != "bundestag":
            raise AufgabenachsenFehler(f"Aufgabenachse: Region/Parlament inkonsistent ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise AufgabenachsenFehler(f"Aufgabenachse: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")

        # Rollenquelle muss die kanonische Person der 54er Quittung sein.
        rollen_quelle = ergebnis.get("rollenquelle") or {}
        rollen_ref = rollen_eintrag.get("quelle") or {}
        if (
            rollen_quelle.get("url") != rollen_ref.get("url")
            or rollen_quelle.get("sha256") != rollen_ref.get("sha256")
            or rollen_quelle.get("abgerufenAm") != rollen_ref.get("abgerufenAm")
        ):
            raise AufgabenachsenFehler(f"Aufgabenachse: Rollenquelle weicht von der 54er Quittung ab ({kennung}).")

        # Der Name im Aufgabenbeleg muss zur kanonischen amtlichen Profilseite
        # gehoeren. Eine korrekte Rollen-URL allein verhindert keinen Pakettausch.
        detail = Path(eingang.verzeichnis) / "detailseiten" / abruf["datei"]
        if not detail.is_file() or _sha256(detail) != rollen_ref.get("sha256"):
            raise AufgabenachsenFehler(f"Aufgabenachse: amtliche Personenquelle fehlt/weicht ab ({kennung}).")
        namen = _ueberschriften(detail.read_text(encoding="utf-8"), "h1")
        if len(namen) != 1 or _norm(ergebnis.get("person")) != namen[0]:
            raise AufgabenachsenFehler(f"Aufgabenachse: Person passt nicht zur kanonischen Kennung ({kennung}).")
        if ergebnis.get("bindungsart") == "beauftragtenaufgabe" and ergebnis.get("personImZitat") is not True:
            if not any(_norm(f.get("wortlaut")) == _norm(ergebnis.get("aufgabenbindung"))
                       for f in rollen_eintrag.get("funktionen", [])):
                raise AufgabenachsenFehler(f"Aufgabenachse: Amtsrolle traegt die Aufgabenbindung nicht ({kennung}).")

        quelle, quell_text = _pruefe_zusatzquelle(ergebnis, zusatz, kennung)
        fliess = _fliess_text(quell_text)

        themen = _pruefe_bindungsart(ergebnis, kennung, quell_text, fliess)
        aufgabenbindung = str(ergebnis.get("aufgabenbindung") or "").strip()
        erwarteter_hinweis = AUFGABEN_THEMA.format(region=REGION, bindung=aufgabenbindung) + "; keine persönliche politische Position"
        if ergebnis.get("ableitungsHinweis") != erwarteter_hinweis:
            raise AufgabenachsenFehler(f"Aufgabenachse: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise AufgabenachsenFehler(f"Aufgabenachse: importfreigegeben muss false sein ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": REGION,
            "parlament": abruf.get("parlament"),
            "status": "belegt",
            "bindungsart": ergebnis.get("bindungsart"),
            "person": ergebnis.get("person"),
            "aufgabenbindung": aufgabenbindung,
            "zitate": list(ergebnis.get("zitate") or []),
            "themen": list(themen),
            "ableitungsHinweis": erwarteter_hinweis,
            "rollenquelle": rollen_quelle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise AufgabenachsenFehler(f"Aufgabenquittung: erwartet {GESAMT} eindeutige Kennungen, gefunden {len(index)}.")
    return index
