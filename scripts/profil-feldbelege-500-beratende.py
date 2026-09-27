#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die 2 beratenden Ausschussachsen der 500er Feldbelege.

Roadmap §3: zwei der urspruenglich 54 offenen fachlichen Achsen werden ueber
amtlich belegte BERATENDE Ausschussrollen geschlossen. Dieses Modul haelt den
grossen Assembler ``profil-feldbelege-500.py`` schlank: es prueft ausschliesslich
die versionierte, vom Orchestrator vorbereitete Quittung
``docs/betrieb/beratende-achsen-2-20260927.json`` gegen die amtlichen
Original-HTML-Detailseiten und die vorhandenen Belegquittungen und liefert einen
normalisierten Index je Kennung. Der Assembler wendet die belegten Themen und den
getrennten Herkunftshinweis nur an.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe), nichts wird
    erfinden: Ausschuss und Rolle stammen aus dem amtlichen JSON-LD; kurze
    Themen und Herkunftshinweis sind ausdruecklich gekennzeichnete Ableitungen,
  * Bindung je Profil an kanonische Kennung + kanonische Quelle
    (URL/finalUrl/sha256/bytes/Abrufzeit/Datei) + Hash/Bytezahl des echten
    Originals + eindeutige H1 (Personenname) + die eine ProfilePage.mainEntity +
    die exakte Role in ``mainEntity.memberOf``,
  * nur die Rolle ``Beratendes Mitglied``, nicht abgelaufen (kein ``endDate``),
    nur ein genehmigter Ausschuss und dessen ausdrueckliche Kurzthemen; die
    Ableitung der Kurzthemen aus dem ausdruecklichen Ausschussnamen ist
    gekennzeichnet (z. B. ``Haushaltsausschuss`` -> ``Haushalt``) und wird als
    getrennter Hinweis in ``funktionen`` gefuehrt — NICHT als Ausschussfeld,
  * niemals ordentliche/stellvertretende Ausschussfelder befuellen; keine
    politische Position, keine Partei, keine Personenerfindung,
  * die Menge ist disjunkt zu den 19 Ressort- und 6 Aufgabenachsen und deckt
    genau 2 eindeutige Kennungen ab (keine Fremdkennung, kein Duplikat, kein
    Zusatzprofil, kein Pakettausch),
  * die 54er Amtsrollenquittung bleibt unveraendert 48 belegt / 6 offen: die
    beiden Kennungen sind dort ausdruecklich ``offen`` — das ist KEIN Fehler,
    weil die bestehende beratende Funktion bereits erhalten war.
"""

from __future__ import annotations

import hashlib
import html as _html
import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

BERATENDEACHSEN = REPO_ROOT / "docs" / "betrieb" / "beratende-achsen-2-20260927.json"
BERATENDEACHSEN_RESSOURCE = "docs/betrieb/beratende-achsen-2-20260927.json"

GESAMT = 2
REGION = "Bund"
STATUS = ("belegt",)
ROLLE = "Beratendes Mitglied"
JSONLD_PFAD = "ProfilePage.mainEntity.memberOf"
QUELLHOST = "bundestag.de"

# Herkunftshinweis: beratende Ausschussarbeit + ausdrueckliche Abgrenzung zu
# ordentlicher/stellvertretender Mitgliedschaft und zu politischen Positionen.
HINWEIS_MUSTER = (
    "Beratende Ausschussarbeit Bund (amtlich abgeleitet): {ausschuss}; "
    "keine ordentliche oder stellvertretende Mitgliedschaft, keine persönliche politische Position"
)

# Genehmigte Ausschuesse mit ihren ausdruecklich kurzen, aus dem Ausschussnamen
# abgeleiteten Themen. Alles andere bleibt gesperrt.
GENEHMIGTE_AUSSCHUESSE = {
    "Ausschuss für Landwirtschaft, Ernährung und Heimat": {
        "url": "https://www.bundestag.de/ausschuesse/Landwirtschaft",
        "themen": ["Landwirtschaft", "Ernährung", "Heimat"],
    },
    "Haushaltsausschuss": {
        "url": "https://www.bundestag.de/ausschuesse/a08_haushalt",
        "themen": ["Haushalt"],
    },
}


class BeratendeachsenFehler(Exception):
    """Fail-closed-Abbruch der beratenden Achsenpruefung."""


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
    return unicodedata.normalize("NFC", " ".join(_text(wert).split()))


def _ueberschriften(dokument: str, tag: str) -> list:
    return [_norm(m) for m in re.findall(rf"<{tag}\b[^>]*>(.*?)</{tag}>", str(dokument or ""), re.S)]


def _quellenhost(url) -> str:
    treffer = re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://([^/?#]+)", str(url or ""))
    if not treffer:
        return ""
    return re.sub(r"^www\.", "", treffer.group(1).lower())


def _ld_json_bloecke(dokument: str) -> list:
    bloecke = []
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', str(dokument or ""), re.S):
        try:
            daten = json.loads(block)
        except json.JSONDecodeError:
            continue
        for eintrag in (daten if isinstance(daten, list) else [daten]):
            if isinstance(eintrag, dict):
                bloecke.append(eintrag)
    return bloecke


def _profilepage_mainentity(dokument: str) -> dict:
    """Die EINE amtliche ProfilePage.mainEntity (Person) — fail closed.

    Verlangt genau einen ProfilePage-Block mit genau einem mainEntity-Objekt
    und bindet die kanonische Personen-URL: traegt der mainEntity-Block ein
    ``url``, muss es der kanonischen Quell-URL entsprechen; fehlt es, wird ueber
    ``@id`` (Fragment ``#mdb``) gebunden. Ein fremder/abweichender mainEntity
    oder ein zweiter ProfilePage-Block sperrt den Datensatz.
    """
    seiten = [b for b in _ld_json_bloecke(dokument) if b.get("@type") == "ProfilePage"]
    if len(seiten) != 1:
        raise BeratendeachsenFehler("Beratende Achse: kein eindeutiger ProfilePage-JSON-LD-Block.")
    haupt = seiten[0].get("mainEntity")
    if not isinstance(haupt, dict) or haupt.get("@type") != "Person":
        raise BeratendeachsenFehler("Beratende Achse: ProfilePage.mainEntity ist keine Person.")
    return haupt


def _pruefe_quelle(ergebnis: dict, abruf: dict, detailseiten: Path, kennung: str) -> tuple:
    """Bindet die kanonische Quelle an Kennung, Abruf und echtes Original."""
    quelle = ergebnis.get("quelle") or {}
    for feld in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(feld) or "") == "":
            raise BeratendeachsenFehler(f"Beratende Achse: Quellenfeld {feld} fehlt ({kennung}).")
    for feld in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(feld)) != str(abruf.get(feld)):
            raise BeratendeachsenFehler(f"Beratende Achse: Quellmetadatum {feld} weicht vom Abruf ab ({kennung}).")
    if abruf.get("abrufStatus") != "abgerufen" or abruf.get("http") != 200:
        raise BeratendeachsenFehler(f"Beratende Achse: Abruf nicht erfolgreich ({kennung}).")
    if quelle.get("abrufStatus") != "abgerufen" or quelle.get("http") != 200:
        raise BeratendeachsenFehler(f"Beratende Achse: Quittungsabruf nicht erfolgreich ({kennung}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise BeratendeachsenFehler(f"Beratende Achse: finalUrl weicht von der kanonischen URL ab ({kennung}).")
    if _quellenhost(quelle.get("url")) != QUELLHOST:
        raise BeratendeachsenFehler(f"Beratende Achse: unerwarteter Quellhost {_quellenhost(quelle.get('url'))!r} ({kennung}).")
    # Kanonische Kennung <-> kanonische Quelle: die amtliche Kennung muss in URL
    # UND Dateiname stehen; ein Pakettausch zwischen zwei Kennungen sperrt so.
    amtliche = str(abruf.get("amtlicheKennung") or "")
    if not amtliche or amtliche not in str(quelle.get("url")) or amtliche not in str(quelle.get("datei")):
        raise BeratendeachsenFehler(f"Beratende Achse: kanonische Kennung nicht in URL/Datei gebunden ({kennung}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name or not datei_name.endswith(".html"):
        raise BeratendeachsenFehler(f"Beratende Achse: ungueltiger Detailseiten-Dateiname ({kennung}).")
    detail = Path(detailseiten) / datei_name
    if not detail.is_file():
        raise BeratendeachsenFehler(f"Beratende Achse: Original-Detailseite fehlt: {datei_name!r} ({kennung}).")
    if _sha256(detail) != str(quelle.get("sha256")):
        raise BeratendeachsenFehler(f"Beratende Achse: Original-Hash weicht ab ({kennung}).")
    if detail.stat().st_size != quelle.get("bytes") or detail.stat().st_size != abruf.get("bytes"):
        raise BeratendeachsenFehler(f"Beratende Achse: Original-Bytezahl weicht ab ({kennung}).")
    return quelle, detail.read_text(encoding="utf-8")


def _pruefe_rollenbeleg(ergebnis: dict, quelle: dict, dokument: str, kennung: str) -> dict:
    """Prueft H1, ProfilePage.mainEntity und die exakte beratende Role."""
    ausschuss = str(ergebnis.get("amtlicherAusschuss") or "").strip()
    if ausschuss not in GENEHMIGTE_AUSSCHUESSE:
        raise BeratendeachsenFehler(f"Beratende Achse: nicht genehmigter Ausschuss {ausschuss!r} ({kennung}).")

    h1 = _ueberschriften(dokument, "h1")
    if len(h1) != 1:
        raise BeratendeachsenFehler(f"Beratende Achse: H1 nicht eindeutig ({kennung}).")
    person = str(ergebnis.get("person") or "").strip()
    if not person or _norm(person) != h1[0]:
        raise BeratendeachsenFehler(f"Beratende Achse: H1-Personenname weicht ab ({kennung}).")

    haupt = _profilepage_mainentity(dokument)
    if _norm(haupt.get("name")) != _norm(person):
        raise BeratendeachsenFehler(f"Beratende Achse: mainEntity-Name weicht von H1 ab ({kennung}).")
    kanonische_url = str(quelle.get("url"))
    if "url" in haupt:
        if str(haupt.get("url")) != kanonische_url:
            raise BeratendeachsenFehler(f"Beratende Achse: mainEntity.url weicht von der kanonischen URL ab ({kennung}).")
    elif haupt.get("@id") != "#mdb":
        raise BeratendeachsenFehler(f"Beratende Achse: ProfilePage.mainEntity ohne URL/ID ({kennung}).")
    if "@id" in haupt and haupt["@id"] != "#mdb":
        raise BeratendeachsenFehler(f"Beratende Achse: fremde Personenkennung ({kennung}).")

    rollen = haupt.get("memberOf")
    if not isinstance(rollen, list):
        raise BeratendeachsenFehler(f"Beratende Achse: mainEntity.memberOf fehlt ({kennung}).")
    passend = [r for r in rollen if isinstance(r, dict)
               and isinstance(r.get("memberOf"), dict)
               and str(r["memberOf"].get("name") or "").strip() == ausschuss]
    if len(passend) != 1:
        raise BeratendeachsenFehler(f"Beratende Achse: nicht genau eine Role fuer den Ausschuss ({kennung}).")
    rolle = passend[0]
    if rolle.get("@type") != "Role":
        raise BeratendeachsenFehler(f"Beratende Achse: Ausschussrolle ist keine Role ({kennung}).")
    if str(rolle.get("roleName") or "").strip() != ROLLE:
        raise BeratendeachsenFehler(f"Beratende Achse: roleName ist nicht {ROLLE!r} ({kennung}).")
    if "endDate" in rolle:
        raise BeratendeachsenFehler(f"Beratende Achse: endDate ist nicht freigegeben ({kennung}).")
    try:
        start = str(rolle.get("startDate") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start):
            raise ValueError("startDate")
        beginn = date.fromisoformat(start)
        abrufdatum = datetime.fromisoformat(str(quelle["abgerufenAm"]).replace("Z", "+00:00")).date()
        if beginn > abrufdatum:
            raise ValueError("zukuenftiger Beginn")
    except (KeyError, ValueError, TypeError) as fehler:
        raise BeratendeachsenFehler(f"Beratende Achse: Rolle zum Abruf nicht zeitlich belegt ({kennung}).") from fehler
    organisation = rolle["memberOf"]
    if organisation.get("@type") != "Organization":
        raise BeratendeachsenFehler(f"Beratende Achse: Ausschuss ist keine Organization ({kennung}).")
    if str(organisation.get("url") or "").strip() != GENEHMIGTE_AUSSCHUESSE[ausschuss]["url"]:
        raise BeratendeachsenFehler(f"Beratende Achse: Ausschuss-URL weicht ab ({kennung}).")
    # Keine zweite beratende Rolle (kein zweiter Ausschuss) und keine
    # ordentliche/stellvertretende Umdeutung des genehmigten Ausschusses.
    weitere_beratende = [r for r in rollen if isinstance(r, dict)
                         and str(r.get("roleName") or "").strip() == ROLLE
                         and str(((r.get("memberOf") or {}).get("name")) or "").strip() != ausschuss]
    if weitere_beratende:
        raise BeratendeachsenFehler(f"Beratende Achse: zweite beratende Rolle/Fremdausschuss ({kennung}).")

    amtlicher_beleg = ergebnis.get("amtlicherRollenbeleg")
    if amtlicher_beleg != rolle:
        raise BeratendeachsenFehler(f"Beratende Achse: amtlicher Rollenbeleg weicht vom Original ab ({kennung}).")
    originalrollen = ergebnis.get("originalrollen")
    if not isinstance(originalrollen, list) or len(originalrollen) != 1 or originalrollen[0] != rolle:
        raise BeratendeachsenFehler(f"Beratende Achse: Originalrollen weichen vom Original ab ({kennung}).")
    if str(ergebnis.get("jsonLdPfad") or "") != JSONLD_PFAD:
        raise BeratendeachsenFehler(f"Beratende Achse: JSON-LD-Pfad weicht ab ({kennung}).")
    return rolle


def _pruefe_themen(ergebnis: dict, kennung: str) -> list:
    """Kurzthemen exakt aus dem genehmigten Ausschussnamen; Hinweis getrennt."""
    ausschuss = str(ergebnis.get("amtlicherAusschuss"))
    themen = ergebnis.get("themen")
    erwartet = GENEHMIGTE_AUSSCHUESSE[ausschuss]["themen"]
    if not isinstance(themen, list) or themen != erwartet:
        raise BeratendeachsenFehler(f"Beratende Achse: Themen weichen vom genehmigten Ausschuss ab ({kennung}).")
    if len(set(themen)) != len(themen):
        raise BeratendeachsenFehler(f"Beratende Achse: doppeltes Thema ({kennung}).")
    erwarteter_hinweis = HINWEIS_MUSTER.format(ausschuss=ausschuss)
    if ergebnis.get("ableitungsHinweis") != erwarteter_hinweis:
        raise BeratendeachsenFehler(f"Beratende Achse: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")
    bestehende = ergebnis.get("bestehendeFunktionen")
    if bestehende != [f"{ROLLE}: {ausschuss}"]:
        raise BeratendeachsenFehler(f"Beratende Achse: bestehende beratende Funktion weicht ab ({kennung}).")
    return list(themen)


def _lade_originalbelege(eingang) -> dict:
    """Nur ausdruecklich uebergebene Zusatzbelege; keine implizite /tmp-Abhaengigkeit."""
    roh = getattr(eingang, "beratende_originalbelege", None)
    if roh is None:
        return {}
    if isinstance(roh, dict):
        return {str(e.get("kennung")): e for e in roh.get("ergebnisse", []) if isinstance(e, dict)}
    if isinstance(roh, list):
        return {str(e.get("kennung")): e for e in roh if isinstance(e, dict) and e.get("kennung")}
    raise BeratendeachsenFehler("Beratende Achse: Originalrollen-Quittung hat ein unerwartetes Format.")


def pruefe_beratendeachsen(eingang, *, quittung=None,
                           ressortachsen_kennungen=None, aufgabenachsen_kennungen=None) -> dict:
    """Prueft die versionierte beratende Achsenquittung der 2 Achsen (fail closed).

    Erzwungen wird: exakt 2 eindeutige kanonische Kennungen, jede Kennung eine
    der 54er Rollenquittung (dort ausdruecklich ``offen`` zulaessig, weil die
    bestehende beratende Funktion bereits erhalten war), die Menge disjunkt zu
    den 19 Ressort- und 6 Aufgabenachsen, kanonische Quelle an
    URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei gebunden, echtes Original mit
    eindeutiger H1 und exakter Role ``Beratendes Mitglied`` ohne ``endDate`` im
    genehmigten Ausschuss sowie der getrennte Herkunftshinweis. Jede Abweichung
    bricht ab.
    """
    if quittung is None:
        quittung = getattr(eingang, "beratendeachsen", None)
    if quittung is None:
        if not BERATENDEACHSEN.is_file():
            raise BeratendeachsenFehler(f"Beratende Achsenquittung fehlt: {BERATENDEACHSEN_RESSOURCE}.")
        quittung = _lies_json(BERATENDEACHSEN)
    if not isinstance(quittung, dict):
        raise BeratendeachsenFehler(f"Beratende Achsenquittung fehlt: {BERATENDEACHSEN_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise BeratendeachsenFehler(
            f"Beratende Achsenquittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise BeratendeachsenFehler(f"Beratende Achsenquittung: unerwartete Bilanz {bilanz!r}.")

    profilrollen = getattr(eingang, "profilrollen_by_kennung", None) or {}
    kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}
    detailseiten = getattr(eingang, "detailseiten", None) or (Path(eingang.verzeichnis) / "detailseiten")
    if ressortachsen_kennungen is None:
        ressortachsen_kennungen = set(getattr(eingang, "ressortachsen_by_kennung", None) or {})
    if aufgabenachsen_kennungen is None:
        aufgabenachsen_kennungen = set(getattr(eingang, "aufgabenachsen_by_kennung", None) or {})
    ressort = set(ressortachsen_kennungen)
    aufgaben = set(aufgabenachsen_kennungen)
    originalbelege = _lade_originalbelege(eingang)

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise BeratendeachsenFehler("Beratende Achse: Eintrag ohne Kennung.")
        if kennung in index:
            raise BeratendeachsenFehler(f"Beratende Achse: doppelte Kennung {kennung}.")
        if kennung in ressort:
            raise BeratendeachsenFehler(f"Beratende Achse: Kennung {kennung} ist bereits eine Ressortachse.")
        if kennung in aufgaben:
            raise BeratendeachsenFehler(f"Beratende Achse: Kennung {kennung} ist bereits eine Aufgabenachse.")
        abruf = kennung_zu_abruf.get(kennung)
        if abruf is None:
            raise BeratendeachsenFehler(f"Beratende Achse: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen (Fremdkennung).")
        if abruf.get("parlament") != "bundestag":
            raise BeratendeachsenFehler(f"Beratende Achse: Kennung {kennung} ist kein Bundestagsprofil.")
        rollen_eintrag = profilrollen.get(kennung)
        if rollen_eintrag is None:
            raise BeratendeachsenFehler(f"Beratende Achse: Kennung {kennung} ist keine der 54 offenen Fachachsen.")
        if str(rollen_eintrag.get("status")) not in ("offen", "belegt"):
            raise BeratendeachsenFehler(f"Beratende Achse: unerwarteter 54er-Status {rollen_eintrag.get('status')!r} ({kennung}).")
        rollen_ref = rollen_eintrag.get("quelle") or {}
        if rollen_ref.get("url") != abruf.get("url") or rollen_ref.get("sha256") != abruf.get("sha256"):
            raise BeratendeachsenFehler(f"Beratende Achse: 54er-Rollenquelle weicht ab ({kennung}).")
        if str(ergebnis.get("region") or "").strip() != REGION:
            raise BeratendeachsenFehler(f"Beratende Achse: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise BeratendeachsenFehler(f"Beratende Achse: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise BeratendeachsenFehler(f"Beratende Achse: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise BeratendeachsenFehler(f"Beratende Achse: importfreigegeben muss false sein ({kennung}).")

        # Lokale Originalrollen-Quittung: deckungsgleich je Kennung, sonst
        # blockiert ein kompletter Quellenpakettausch zwischen zwei Kennungen.
        original = originalbelege.get(kennung)
        if original is not None:
            if (original.get("quelle") or {}) != (ergebnis.get("quelle") or {}):
                raise BeratendeachsenFehler(f"Beratende Achse: Quittungsquelle weicht von der Originalrollen-Quittung ab ({kennung}).")
            if original.get("bestehendeFunktionen") != ergebnis.get("bestehendeFunktionen"):
                raise BeratendeachsenFehler(f"Beratende Achse: bestehende Funktion weicht von der Originalrollen-Quittung ab ({kennung}).")

        quelle, dokument = _pruefe_quelle(ergebnis, abruf, detailseiten, kennung)
        rolle = _pruefe_rollenbeleg(ergebnis, quelle, dokument, kennung)
        if original is not None and original.get("amtlichesJsonLd") != [rolle]:
            raise BeratendeachsenFehler(f"Beratende Achse: Originalrollen weichen vom echten Original ab ({kennung}).")
        themen = _pruefe_themen(ergebnis, kennung)

        index[kennung] = {
            "kennung": kennung,
            "region": REGION,
            "parlament": "bundestag",
            "status": "belegt",
            "person": str(ergebnis.get("person")),
            "ausschuss": str(ergebnis.get("amtlicherAusschuss")),
            "rolle": ROLLE,
            "themen": themen,
            "ableitungsHinweis": ergebnis.get("ableitungsHinweis"),
            "bestehendeFunktionen": list(ergebnis.get("bestehendeFunktionen") or []),
            "rollenquelle": rollen_ref,
            "amtlicherRollenbeleg": rolle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise BeratendeachsenFehler(f"Beratende Achsenquittung: erwartet {GESAMT} eindeutige Kennungen, gefunden {len(index)}.")
    return index
