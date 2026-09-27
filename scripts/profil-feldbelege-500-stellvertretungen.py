#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer die 76 belegten stellvertretenden
Brandenburger Ausschussmitgliedschaften (Roadmap §3, belegter Verlust).

Hintergrund: Alle 50 gespeicherten Brandenburger Personenseiten tragen keinen
eigenen Abschnitt fuer Stellvertretungen. Die amtlichen Fachausschussseiten
hingegen fuehren (13 von 14) eine eigene geschlossene Mitgliederspalte
"Stellvertretende Mitglieder". Dieses Modul prueft ausschliesslich die
versionierte, vom Orchestrator vorbereitete Ergaenzungsquittung
``docs/betrieb/brandenburg-stellvertretungen-76-20260927.json`` gegen die
amtlichen Originaldateien und liefert einen normalisierten Index je Kennung.

Es haelt den grossen Assembler ``profil-feldbelege-500.py`` schlank und
verwendet nur die bestehenden sicheren Quellen-/Metadaten-/HTML-Helfer des
getrennten Moduls ``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein
duplizierter Parser, kein externer Parser, keine Parserpakete, kein zweiter
Netz-/DB-Weg).

Fail closed (harte Grenzen):

  * nur lokal/offline, ausschliesslich Standardbibliothek, keine Netz-, DB- oder
    Modellzugriffe; das eng fixierte Fachurteil ist injizierbar (``erwartung``),
  * Original UND Metadaten sind an URL, finalUrl, HTTP, Abrufzeit, Hash, Bytes
    und Datei gebunden; Index (25220) und die vollstaendige Menge der 14
    verlinkten Ausschussseiten werden bilanziert,
  * der Index liefert seine Links ausschliesslich aus dem Inhaltsbereich unter
    der ECHTEN H1 "Fachausschuesse" (nicht aus Navigation oder Breadcrumb),
  * der Ausschussname stammt aus der ECHTEN eindeutigen H1 der Seite (der
    URL-Slug "landesentwicklung" wird NICHT zur Umbenennung genutzt),
  * die Stellvertretung ist exakt die eigene ``div`` mit den Klassen
    ``col-12 col-md-6 col-lg-12 col-xl-6 my-4 my-md-0`` als direktes Kind der
    ``div.row``; Vorsitz/stellvertretender Vorsitz zaehlen nicht,
  * pro Fraktionsueberschrift eine eigene direkt folgende ``ul.list-unstyled``
    mit eigenen ``li`` > ``a.profile``; es gibt KEINE Bindung aus Nachbarspalte,
    Navigation, Kommentaren, Skripten, Vorlagen oder Text nach einem
    geschlossenen Abschnitt, und eine fehlende Liste laesst die vorige Gruppe
    nicht ueber einen Abschnittswechsel fortleben,
  * der Personenlink ist exakt eine der 50 kanonischen Brandenburger
    Personen-URLs; fremde/andere Personen und AfD-Seiten erzeugen KEINE
    Kundenprofile,
  * Person, Profilhash, Name und Fraktion bzw. Fraktionslosigkeit werden
    separat an die kanonischen Detailseiten gebunden,
  * genau 76 eindeutige (Profil, Ausschuss)-Paare bei genau 35 Zielprofilen;
    der Unterausschuss 23893 ist der eigene belegte Nullfall ohne
    Stellvertretungsspalte, ohne implizite Fehlertoleranz fuer die anderen 13,
  * keine Aufwertung zu ordentlichem Sitz oder Vorsitz, keine erfundenen Themen,
    keine Partei-/Mandatsart-/Funktionsaenderung.
"""

from __future__ import annotations

import importlib.util as _importlib_util
import re
import sys
import unicodedata
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

STELLVERTRETUNGEN = REPO_ROOT / "docs" / "betrieb" / "brandenburg-stellvertretungen-76-20260927.json"
STELLVERTRETUNGEN_RESSOURCE = "docs/betrieb/brandenburg-stellvertretungen-76-20260927.json"

QUELLHOST = "landtag.brandenburg.de"
ROLLE = "Stellvertretendes Mitglied"
SPALTE = "Stellvertretende Mitglieder"
SPALTENKLASSEN = frozenset({"col-12", "col-md-6", "col-lg-12", "col-xl-6", "my-4", "my-md-0"})
INDEXH1 = "Fachausschüsse"


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location(
        "profil_feldbelege_500_zusatzaufgaben_stellvertretungen", pfad
    )
    try:
        modul = _importlib_util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return modul
    finally:
        sys.dont_write_bytecode = vorher


ZU = _lade_zusatzmodul()

# Bewusst eng fixiertes, am Original abgenommenes Fachurteil. Fuer synthetische
# Fixtures vollstaendig injizierbar (``erwartung``).
ERWARTUNG = {
    "index": {
        "url": "https://www.landtag.brandenburg.de/de/parlament/ausschuesse_gremien_europa/fachausschuesse/25220",
        "finalUrl": "https://www.landtag.brandenburg.de/de/parlament/ausschuesse_gremien_europa/fachausschuesse/25220",
        "http": 200,
        "abrufStatus": "abgerufen",
        "abgerufenAm": "2026-09-27T21:25:44.826825+00:00",
        "sha256": "e38a080df89fb5aa5f6819cdf30a0c84d1133402fb58c13035b4585c76949551",
        "bytes": 102254,
        "datei": "bb-fachausschuss-index-20260927.html",
    },
    "indexH1": INDEXH1,
    "quellen": 14,
    "mitSpalte": 13,
    "ohneSpalte": 1,
    "kanonischeProfile": 50,
    "gesamt": 76,
    "zielprofile": 35,
    # Der belegte Nullfall: der Unterausschuss traegt keine Stellvertretungsspalte.
    "nullquelle": "https://www.landtag.brandenburg.de/de/fachausschuss/"
                  "unterausschuss_des_ausschusses_fuer_haushaltskontrolle/23893",
}


class StellvertretungenFehler(Exception):
    """Fail-closed-Abbruch der Stellvertretungspruefung."""


# ── Kleiner, strenger HTML-Baum (nur echte Inhaltselemente zaehlen) ───────────────────────

_AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}


class _Knoten:
    __slots__ = ("tag", "attrs", "kinder", "eltern")

    def __init__(self, tag="", attrs=(), eltern=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.kinder = []
        self.eltern = eltern

    def klasse(self):
        return self.attrs.get("class", "").split()

    def text(self):
        teile = []
        for kind in self.kinder:
            if isinstance(kind, _Knoten):
                teile.append(kind.text())
            else:
                teile.append(str(kind))
        return " ".join(" ".join(teile).split())

    def walk(self):
        yield self
        for kind in self.kinder:
            if isinstance(kind, _Knoten):
                yield from kind.walk()


class _Baum(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.wurzel = _Knoten()
        self.stapel = [self.wurzel]

    def handle_starttag(self, tag, attrs):
        knoten = _Knoten(tag, attrs, self.stapel[-1])
        self.stapel[-1].kinder.append(knoten)
        if tag not in _VOID:
            self.stapel.append(knoten)

    def handle_endtag(self, tag):
        if tag in _VOID:
            return
        for index in range(len(self.stapel) - 1, 0, -1):
            if self.stapel[index].tag == tag:
                del self.stapel[index:]
                break

    def handle_data(self, data):
        self.stapel[-1].kinder.append(data)

    @classmethod
    def lese(cls, dokument) -> "_Knoten":
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if len(parser.stapel) != 1:
            raise StellvertretungenFehler("Stellvertretungen: unvollstaendiges Markup.")
        return parser.wurzel


def _sichtbar(knoten: _Knoten) -> bool:
    eltern = knoten
    while eltern is not None:
        attrs = eltern.attrs
        style = re.sub(r"\s+", "", attrs.get("style", "")).lower()
        if (eltern.tag in _AUSGELASSEN
                or "hidden" in attrs or "inert" in attrs
                or attrs.get("aria-hidden", "").lower() == "true"
                or re.search(r"(?:^|;)display:none(?:!important)?(?:;|$)", style)
                or re.search(r"(?:^|;)visibility:hidden(?:!important)?(?:;|$)", style)
                or {"hidden", "d-none", "--hidden"}.intersection(eltern.klasse())):
            return False
        eltern = eltern.eltern
    return True


def _t(knoten: _Knoten) -> str:
    if not isinstance(knoten, _Knoten):
        return ZU._norm(knoten)
    if not _sichtbar(knoten):
        return ""
    return ZU._norm(" ".join(_t(k) for k in knoten.kinder))


def _kanonisch(url) -> str:
    roh = str(url or "").strip()
    if not roh:
        return ""
    parsed = urllib.parse.urlsplit(roh)
    if parsed.query or parsed.fragment or "?" in roh or "#" in roh:
        raise StellvertretungenFehler("Stellvertretungen: URL mit fremder Query oder Fragment.")
    return roh


_FACHAUSSCHUSS_LINK = re.compile(r"^/de/fachausschuss/[a-z0-9_\-]+/\d+$")


def _hauptinhalt(baum):
    mains = [n for n in baum.walk() if n.tag == "main" and _sichtbar(n)]
    if len(mains) != 1:
        raise StellvertretungenFehler("Stellvertretungen: genau ein sichtbarer main-Inhalt erforderlich.")
    return mains[0]


def _index_inhalt(dokument, index_url: str):
    """Nur eigene teaser-grid-Karten unter der H1 im geschlossenen main."""
    baum = _Baum.lese(dokument)
    h1 = [n for n in baum.walk() if n.tag == "h1" and _sichtbar(n)]
    if len(h1) != 1:
        raise StellvertretungenFehler(f"Stellvertretungen: Index braucht genau eine echte H1, gefunden {len(h1)}.")
    main = _hauptinhalt(baum)
    if h1[0].eltern is not main:
        raise StellvertretungenFehler("Stellvertretungen: Index-H1 ausserhalb des eigenen main.")
    grids = [n for n in main.kinder if isinstance(n, _Knoten)
             and n.tag == "section" and "teaser-grid" in n.klasse() and _sichtbar(n)]
    if len(grids) != 1 or main.kinder.index(grids[0]) < main.kinder.index(h1[0]):
        raise StellvertretungenFehler("Stellvertretungen: genau ein eigener Index-Kartenbereich nach der H1 erforderlich.")
    titel, zuordnung = _t(h1[0]), {}
    for artikel in [n for n in grids[0].kinder if isinstance(n, _Knoten)]:
        links = [n for n in artikel.kinder if isinstance(n, _Knoten)]
        if (artikel.tag != "article" or not _sichtbar(artikel)
                or len(links) != 1 or links[0].tag != "a" or not _sichtbar(links[0])):
            raise StellvertretungenFehler("Stellvertretungen: ungueltige eigene Indexkarte.")
        link = links[0]
        href = (link.attrs.get("href") or "").strip()
        titel_nodes = [n for n in link.kinder if isinstance(n, _Knoten)
                       and n.tag == "h6" and _sichtbar(n)]
        if not _FACHAUSSCHUSS_LINK.fullmatch(href) or len(titel_nodes) != 1 or not _t(titel_nodes[0]):
            raise StellvertretungenFehler("Stellvertretungen: Indexkarte ohne exakten Link/eigenen h6-Namen.")
        voll = _kanonisch(urllib.parse.urljoin(index_url, href))
        if voll in zuordnung:
            raise StellvertretungenFehler("Stellvertretungen: doppelte Indexkarte.")
        zuordnung[voll] = _t(titel_nodes[0])
    if not zuordnung:
        raise StellvertretungenFehler("Stellvertretungen: Index liefert keine Fachausschusslinks.")
    return titel, zuordnung


def index_lesen(dokument, index_url: str):
    titel, zuordnung = _index_inhalt(dokument, index_url)
    return titel, list(zuordnung)


def _li_eintrag(li: _Knoten, gruppe: str, seite_url: str) -> dict:
    kinder = [k for k in li.kinder if isinstance(k, _Knoten)]
    if len(kinder) != 1 or kinder[0].tag != "a":
        raise StellvertretungenFehler("Stellvertretungen: li braucht genau einen eigenen a.profile-Link.")
    link = kinder[0]
    if "profile" not in link.klasse() or not _sichtbar(link):
        raise StellvertretungenFehler("Stellvertretungen: Personenlink ohne Klasse profile.")
    href = (link.attrs.get("href") or "").strip()
    if not href:
        raise StellvertretungenFehler("Stellvertretungen: Personenlink ohne href.")
    strongs = [n for n in link.walk() if n.tag == "strong" and _sichtbar(n)]
    orgs = [n for n in link.walk()
            if n.tag == "span" and _sichtbar(n) and "organization-name" in n.klasse()]
    if len(strongs) != 1 or len(orgs) != 1:
        raise StellvertretungenFehler("Stellvertretungen: Personenlink braucht genau einen STRONG-Namen und organization-name.")
    name = _t(strongs[0])
    organisation = _t(orgs[0])
    if not name or not organisation:
        raise StellvertretungenFehler("Stellvertretungen: leerer Name oder leere Organisation.")
    if organisation != f"({gruppe})":
        raise StellvertretungenFehler(
            f"Stellvertretungen: organization-name {organisation!r} passt nicht zur h6-Gruppe {gruppe!r}."
        )
    return {
        "name": name,
        "gruppe": gruppe,
        "organisation": organisation,
        "personenlink": _kanonisch(urllib.parse.urljoin(seite_url, href)),
    }


def _spalten_eintraege(spalte: _Knoten, seite_url: str) -> list:
    elemente = [k for k in spalte.kinder if isinstance(k, _Knoten)][1:]
    if not elemente or len(elemente) % 2:
        raise StellvertretungenFehler("Stellvertretungen: jede h6-Gruppe braucht unmittelbar eine eigene Liste.")
    eintraege = []
    for pos in range(0, len(elemente), 2):
        heading, liste = elemente[pos:pos + 2]
        if (heading.tag != "h6" or liste.tag != "ul"
                or not _sichtbar(heading) or not _sichtbar(liste)
                or "list-unstyled" not in liste.klasse() or not _t(heading)):
            raise StellvertretungenFehler("Stellvertretungen: Liste ohne unmittelbar vorausgehende h6-Gruppe.")
        kinder = [k for k in liste.kinder if isinstance(k, _Knoten)]
        if not kinder or any(k.tag != "li" or not _sichtbar(k) for k in kinder):
            raise StellvertretungenFehler("Stellvertretungen: Liste ohne eigene sichtbare li-Mitglieder.")
        for li in kinder:
            eintraege.append(_li_eintrag(li, _t(heading), seite_url))
    return eintraege


def ausschussseite_lesen(dokument, seite_url: str):
    """Echte H1 + die eigene geschlossene Stellvertretungsspalte (oder None).

    Liefert (ausschussname, spalte|None, eintraege). Die Spalte ist exakt die
    eigene ``div`` mit den geforderten Klassen als direktes Kind der ``div.row``;
    die ``h5`` muss ihr erstes Elementkind sein.
    """
    baum = _Baum.lese(dokument)
    h1 = [n for n in baum.walk() if n.tag == "h1" and _sichtbar(n)]
    if len(h1) != 1:
        raise StellvertretungenFehler(
            f"Stellvertretungen: Ausschussseite braucht genau eine echte H1, gefunden {len(h1)} ({seite_url})."
        )
    main = _hauptinhalt(baum)
    if h1[0].eltern is not main:
        raise StellvertretungenFehler("Stellvertretungen: Ausschuss-H1 ausserhalb des eigenen main.")
    ausschuss = _t(h1[0])
    if not ausschuss:
        raise StellvertretungenFehler(f"Stellvertretungen: leere Ausschuss-H1 ({seite_url}).")

    h5 = [n for n in baum.walk() if n.tag == "h5" and _sichtbar(n) and _t(n) == SPALTE]
    if len(h5) > 1:
        raise StellvertretungenFehler(
            f"Stellvertretungen: mehr als eine Stellvertretungsspalte ({seite_url})."
        )
    if not h5:
        return ausschuss, None, []
    spalte = h5[0].eltern
    if spalte is None or spalte.tag != "div":
        raise StellvertretungenFehler(f"Stellvertretungen: h5 ohne eigene div ({seite_url}).")
    if frozenset(spalte.klasse()) != SPALTENKLASSEN:
        raise StellvertretungenFehler(
            f"Stellvertretungen: Stellvertretungsspalte hat unerwartete Klassen {sorted(spalte.klasse())} ({seite_url})."
        )
    if (spalte.eltern is None or spalte.eltern.tag != "div"
            or "row" not in spalte.eltern.klasse()
            or spalte.eltern.eltern is not main):
        raise StellvertretungenFehler(
            f"Stellvertretungen: Stellvertretungsspalte ist kein direktes Kind einer div.row ({seite_url})."
        )
    elemente = [k for k in spalte.kinder if isinstance(k, _Knoten)]
    if not elemente or elemente[0] is not h5[0]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: h5 ist nicht das erste Elementkind der Spalte ({seite_url})."
        )
    return ausschuss, spalte, _spalten_eintraege(spalte, seite_url)


def personenseite_lesen(dokument: str):
    """Eindeutige echte H1 + die amtliche doc-subtitle (Fraktion/Fraktionslosigkeit)."""
    baum = _Baum.lese(dokument)
    h1 = [n for n in baum.walk() if n.tag == "h1" and _sichtbar(n)]
    if len(h1) != 1:
        raise StellvertretungenFehler(
            f"Stellvertretungen: Personenseite braucht genau eine echte H1, gefunden {len(h1)}."
        )
    main = _hauptinhalt(baum)
    eltern = h1[0]
    while eltern is not None and eltern is not main:
        eltern = eltern.eltern
    if eltern is not main:
        raise StellvertretungenFehler("Stellvertretungen: Personen-H1 ausserhalb des eigenen main.")
    subtitles = [
        n for n in baum.walk()
        if _sichtbar(n) and n.eltern is h1[0].eltern and n.attrs.get("role", "") == "doc-subtitle"
    ]
    if len(subtitles) != 1:
        raise StellvertretungenFehler(
            f"Stellvertretungen: Personenseite braucht genau eine doc-subtitle, gefunden {len(subtitles)}."
        )
    return _t(h1[0]), _t(subtitles[0])


def _pruefe_quelle(quittung_quelle: dict, zusatz: Path, ident: str) -> tuple:
    """Bindet eine amtliche Quelle an Metadaten UND echtes Original."""
    for name in ("url", "finalUrl", "http", "abrufStatus", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quittung_quelle.get(name) or "") == "":
            raise StellvertretungenFehler(f"Stellvertretungen: Quellenfeld {name} fehlt ({ident}).")
    datei_name = str(quittung_quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise StellvertretungenFehler(f"Stellvertretungen: ungueltiger Dateiname ({ident}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise StellvertretungenFehler(f"Stellvertretungen: Originaldatei fehlt: {datei_name!r} ({ident}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, ident)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise StellvertretungenFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "sha256", "bytes", "datei", "abgerufenAm"):
        if str(meta.get(name)) != str(quittung_quelle.get(name)):
            raise StellvertretungenFehler(f"Stellvertretungen: Metadatum {name} weicht ab ({ident}).")
    if str(meta.get("http")) != str(quittung_quelle.get("http")):
        raise StellvertretungenFehler(f"Stellvertretungen: Metadatum http weicht ab ({ident}).")
    if quittung_quelle.get("finalUrl") != quittung_quelle.get("url"):
        raise StellvertretungenFehler(f"Stellvertretungen: finalUrl weicht von der kanonischen URL ab ({ident}).")
    if quittung_quelle.get("http") != 200 or quittung_quelle.get("abrufStatus") != "abgerufen":
        raise StellvertretungenFehler(f"Stellvertretungen: Abruf nicht erfolgreich ({ident}).")
    if ZU._quellenhost(quittung_quelle.get("url")) != QUELLHOST:
        raise StellvertretungenFehler(
            f"Stellvertretungen: unerwarteter Quellhost {ZU._quellenhost(quittung_quelle.get('url'))!r} ({ident})."
        )
    if ZU._sha256(datei) != str(quittung_quelle.get("sha256")) or datei.stat().st_size != quittung_quelle.get("bytes"):
        raise StellvertretungenFehler(f"Stellvertretungen: Original-Hash/Bytezahl weicht ab ({ident}).")
    return quittung_quelle, datei.read_text(encoding="utf-8", errors="replace")


def _flach(ergebnisse: list) -> list:
    flach = []
    for ergebnis in ergebnisse:
        for mitgliedschaft in ergebnis.get("mitgliedschaften") or []:
            flach.append((ergebnis, mitgliedschaft))
    return flach


def pruefe_stellvertretungen(eingang, *, quittung=None, kennung_zu_abruf=None, erwartung=None) -> dict:
    """Prueft die versionierte Ergaenzungsquittung der Stellvertretungen (fail closed).

    Erzwungen wird: Index und vollstaendige Menge der 14 Quellen an
    URL/finalUrl/HTTP/Abrufzeit/Hash/Bytes/Datei (Original UND Metadaten); die
    echte H1 je Seite; die eigene geschlossene Stellvertretungsspalte als
    direktes Kind der row mit exakter Fuellung h5/h6/ul/li/a.profile; exakt 76
    eindeutige (Profil, Ausschuss)-Paare bei genau 35 Zielprofilen; und die
    separate Bindung von Person, Profilhash, Name und Fraktion bzw.
    Fraktionslosigkeit an die kanonischen Detailseiten. Nur die 50 kanonischen
    Brandenburger Personen-URLs bilden die Auswahlgrenze. Jede Abweichung bricht ab.
    """
    e = dict(ERWARTUNG)
    if erwartung:
        e.update(erwartung)

    if quittung is None:
        quittung = getattr(eingang, "stellvertretungen", None)
    if quittung is None:
        if not STELLVERTRETUNGEN.is_file():
            raise StellvertretungenFehler(f"Stellvertretungen: Quittung fehlt: {STELLVERTRETUNGEN_RESSOURCE}.")
        quittung = ZU._lies_json(STELLVERTRETUNGEN)
    if not isinstance(quittung, dict):
        raise StellvertretungenFehler(f"Stellvertretungen: Quittung fehlt: {STELLVERTRETUNGEN_RESSOURCE}.")

    zusatz = Path(getattr(eingang, "verzeichnis")) / "zusatzquellen"
    detailseiten = getattr(eingang, "detailseiten", None) or (Path(eingang.verzeichnis) / "detailseiten")
    if kennung_zu_abruf is None:
        kennung_zu_abruf = getattr(eingang, "kennung_zu_abruf", None) or {}

    # Kanonische 500er-Brandenburg-Personen = Auswahlgrenze (genau 50).
    kanonische = {}
    for kennung, abruf in kennung_zu_abruf.items():
        if abruf.get("parlament") != "landtag-brandenburg":
            continue
        kanonische[kennung] = abruf
    if len(kanonische) != e["kanonischeProfile"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet genau {e['kanonischeProfile']} kanonische Brandenburger "
            f"Zielprofile, gefunden {len(kanonische)}."
        )
    kanonische_urls = {_kanonisch(a.get("url")): k for k, a in kanonische.items()}
    if len(kanonische_urls) != e["kanonischeProfile"]:
        raise StellvertretungenFehler("Stellvertretungen: die kanonischen Personen-URLs sind nicht eindeutig.")

    # ── Index ─────────────────────────────────────────────────────────────────
    index_quittung = quittung.get("index")
    if not isinstance(index_quittung, dict):
        raise StellvertretungenFehler("Stellvertretungen: Quittung braucht den Indexabschnitt.")
    for name, wert in e["index"].items():
        if str(index_quittung.get(name)) != str(wert):
            raise StellvertretungenFehler(f"Stellvertretungen: Indexfeld {name} weicht vom fixierten Urteil ab.")
    index_quelle, index_text = _pruefe_quelle(index_quittung, zusatz, "index-25220")
    index_h1, index_namen = _index_inhalt(index_text, index_quelle["url"])
    index_links = list(index_namen)
    if index_h1 != e["indexH1"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: Index-H1 {index_h1!r} ist nicht {e['indexH1']!r}."
        )

    # ── Die vollstaendige Menge der 14 Quellen ────────────────────────────────
    quellen = quittung.get("quellen")
    if not isinstance(quellen, list) or len(quellen) != e["quellen"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['quellen']} Quellen, "
            f"gefunden {len(quellen) if isinstance(quellen, list) else 'n/a'}."
        )
    quittung_urls = [_kanonisch(q.get("url")) for q in quellen]
    if quittung_urls != index_links:
        raise StellvertretungenFehler(
            "Stellvertretungen: die Quellenliste der Quittung deckt sich nicht mit den "
            "Inhaltslinks des amtlichen Index (Reihenfolge und Menge)."
        )
    if len(set(quittung_urls)) != e["quellen"]:
        raise StellvertretungenFehler("Stellvertretungen: doppelte Quellen-URL.")

    spalten_gesamt = 0
    nullfaelle = []
    geparst = []  # (ausschuss, quelle, {name, gruppe, personenlink})
    quellen_index = {}
    for quelle in quellen:
        datei = str(quelle.get("datei"))
        _, text = _pruefe_quelle(quelle, zusatz, datei)
        ausschuss, spalte, eintraege = ausschussseite_lesen(text, quelle["url"])
        if index_namen.get(quelle["url"]) != ausschuss:
            raise StellvertretungenFehler("Stellvertretungen: Seiten-H1 passt nicht zum Ausschussnamen am Indexlink.")
        if str(quelle.get("h1") or "") != ausschuss:
            raise StellvertretungenFehler(
                f"Stellvertretungen: H1 {ausschuss!r} weicht von der Quittung ({quelle.get('h1')!r}) ab ({datei})."
            )
        erwartete_spalten = 1 if spalte is not None else 0
        if quelle.get("stellvertretendeSpalten") != erwartete_spalten:
            raise StellvertretungenFehler(
                f"Stellvertretungen: Spaltenzahl {erwartete_spalten} weicht von der Quittung ab ({datei})."
            )
        spalten_gesamt += erwartete_spalten
        if erwartete_spalten == 0:
            nullfaelle.append(_kanonisch(quelle["url"]))
        quellen_index[_kanonisch(quelle["url"])] = {
            "datei": datei,
            "url": quelle["url"],
            "finalUrl": quelle.get("finalUrl"),
            "http": quelle.get("http"),
            "abrufStatus": quelle.get("abrufStatus"),
            "abgerufenAm": quelle.get("abgerufenAm"),
            "sha256": quelle["sha256"],
            "bytes": quelle["bytes"],
            "h1": ausschuss,
        }
        for eintrag in eintraege:
            geparst.append((ausschuss, quelle, eintrag))

    if spalten_gesamt != e["mitSpalte"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['mitSpalte']} Seiten mit Stellvertretungsspalte, gefunden {spalten_gesamt}."
        )
    if len(nullfaelle) != e["ohneSpalte"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['ohneSpalte']} Nullfall, gefunden {len(nullfaelle)}."
        )
    if nullfaelle != [_kanonisch(e["nullquelle"])]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: der belegte Nullfall ist {sorted(nullfaelle)}, erwartet der Unterausschuss 23893."
        )

    # Nur die 50 kanonischen Brandenburger Personen-URLs bilden die Ausgrenze.
    ziel = []
    for ausschuss, quelle, eintrag in geparst:
        kennung = kanonische_urls.get(_kanonisch(eintrag["personenlink"]))
        if kennung is None:
            continue  # andere Personen auf amtlichen Seiten sind keine Kundenprofile
        ziel.append({
            "kennung": kennung,
            "person": eintrag["name"],
            "gruppe": eintrag["gruppe"],
            "ausschuss": ausschuss,
            "personenlink": _kanonisch(eintrag["personenlink"]),
            "quelleDatei": quelle["datei"],
            "quelleUrl": _kanonisch(quelle["url"]),
            "quelleSha256": quelle["sha256"],
        })
    if len(ziel) != e["gesamt"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['gesamt']} belegte Stellvertretungen, gefunden {len(ziel)}."
        )
    paare = {(x["kennung"], x["ausschuss"]) for x in ziel}
    if len(paare) != e["gesamt"]:
        raise StellvertretungenFehler("Stellvertretungen: doppelte (Profil, Ausschuss)-Paare.")
    profile_geparst = {x["kennung"] for x in ziel}
    if len(profile_geparst) != e["zielprofile"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['zielprofile']} Zielprofile, gefunden {len(profile_geparst)}."
        )

    # ── Quittung gegen die geparsten Originale ────────────────────────────────
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("zielprofile"), bilanz.get("quellen"),
            bilanz.get("mitStellvertretungsspalte"), bilanz.get("ohneStellvertretungsspalte"),
            bilanz.get("Brandenburg")) != (
            e["gesamt"], e["zielprofile"], e["quellen"], e["mitSpalte"], e["ohneSpalte"], e["gesamt"]):
        raise StellvertretungenFehler(f"Stellvertretungen: unerwartete Bilanz {bilanz!r}.")

    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != e["zielprofile"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['zielprofile']} Profilergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    flach = _flach(ergebnisse)
    if len(flach) != e["gesamt"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['gesamt']} Mitgliedschaften in der Quittung, gefunden {len(flach)}."
        )

    geparst_set = {(x["kennung"], x["ausschuss"], x["person"], x["gruppe"], x["personenlink"]) for x in ziel}
    quittung_set = set()
    gesehen = set()
    for ergebnis, mitgliedschaft in flach:
        kennung = str(ergebnis.get("kennung") or "").strip()
        if not kennung:
            raise StellvertretungenFehler("Stellvertretungen: Ergebnis ohne Kennung.")
        if ergebnis.get("parlament") != "landtag-brandenburg":
            raise StellvertretungenFehler(f"Stellvertretungen: unerwartetes Parlament ({kennung}).")
        if kennung not in kanonische:
            raise StellvertretungenFehler(f"Stellvertretungen: unbekannte/Fremdkennung {kennung}.")
        if str(mitgliedschaft.get("rolle") or "").strip() != ROLLE:
            raise StellvertretungenFehler(f"Stellvertretungen: unerwartete Rolle ({kennung}).")
        ausschuss = str(mitgliedschaft.get("ausschuss") or "").strip()
        person = str(ergebnis.get("person") or "").strip()
        gruppe = str(ergebnis.get("gruppe") or "").strip()
        link = _kanonisch(mitgliedschaft.get("personenlink"))
        schluessel = (kennung, ausschuss)
        if schluessel in gesehen:
            raise StellvertretungenFehler(f"Stellvertretungen: doppeltes Paar {schluessel}.")
        gesehen.add(schluessel)
        quittung_set.add((kennung, ausschuss, person, gruppe, link))
        quelle_meta = quellen_index.get(_kanonisch(mitgliedschaft.get("quelleUrl")))
        if quelle_meta is None or quelle_meta["sha256"] != mitgliedschaft.get("quelleSha256") \
                or quelle_meta["datei"] != mitgliedschaft.get("quelleDatei"):
            raise StellvertretungenFehler(f"Stellvertretungen: Quellenbindung der Mitgliedschaft weicht ab ({kennung}).")
        if quelle_meta["h1"] != ausschuss:
            raise StellvertretungenFehler(f"Stellvertretungen: Ausschuss passt nicht zur Quellen-H1 ({kennung}).")
    if quittung_set != geparst_set:
        fehlend = sorted(geparst_set - quittung_set)
        fremd = sorted(quittung_set - geparst_set)
        raise StellvertretungenFehler(
            f"Stellvertretungen: Quittung deckt die Originale nicht deckungsgleich ab "
            f"(fehlend: {fehlend[:3]}, nicht im Original: {fremd[:3]})."
        )

    # ── Person, Profilhash, Name und Fraktion/Fraktionslosigkeit separat binden ──
    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung") or "").strip()
        abruf = kanonische[kennung]
        personenquelle = ergebnis.get("personenquelle") or {}
        for name in ("url", "finalUrl", "http", "abrufStatus", "abgerufenAm", "sha256", "bytes", "datei"):
            if str(personenquelle.get(name)) != str(abruf.get(name)):
                raise StellvertretungenFehler(f"Stellvertretungen: Profilbindung {name} weicht ab ({kennung}).")
        if _kanonisch(personenquelle.get("url")) != _kanonisch(abruf.get("url")):
            raise StellvertretungenFehler(f"Stellvertretungen: Profil-URL weicht ab ({kennung}).")
        datei = Path(detailseiten) / str(abruf.get("datei"))
        if not datei.is_file():
            raise StellvertretungenFehler(f"Stellvertretungen: kanonische Detailseite fehlt ({kennung}).")
        if ZU._sha256(datei) != str(abruf.get("sha256")) or datei.stat().st_size != abruf.get("bytes"):
            raise StellvertretungenFehler(f"Stellvertretungen: Profilhash der Detailseite weicht ab ({kennung}).")
        h1_name, subtitle = personenseite_lesen(datei.read_text(encoding="utf-8", errors="replace"))
        if str(ergebnis.get("person") or "").strip() != h1_name:
            raise StellvertretungenFehler(f"Stellvertretungen: Name passt nicht zur kanonischen H1 ({kennung}).")
        if str(ergebnis.get("gruppe") or "").strip() != subtitle:
            raise StellvertretungenFehler(
                f"Stellvertretungen: Fraktion/Fraktionslosigkeit passt nicht zur Detailseite ({kennung})."
            )
        if not ergebnis.get("mitgliedschaften"):
            raise StellvertretungenFehler(f"Stellvertretungen: Ergebnis ohne Mitgliedschaft ({kennung}).")

        mitgliedschaften = []
        for mitgliedschaft in ergebnis["mitgliedschaften"]:
            quelle_meta = quellen_index[_kanonisch(mitgliedschaft["quelleUrl"])]
            mitgliedschaften.append({
                "ausschuss": mitgliedschaft["ausschuss"],
                "rolle": ROLLE,
                "personenlink": _kanonisch(mitgliedschaft["personenlink"]),
                "quelle": {
                    "datei": quelle_meta["datei"],
                    "url": quelle_meta["url"],
                    "finalUrl": quelle_meta["finalUrl"],
                    "http": quelle_meta["http"],
                    "abrufStatus": quelle_meta["abrufStatus"],
                    "abgerufenAm": quelle_meta["abgerufenAm"],
                    "sha256": quelle_meta["sha256"],
                    "bytes": quelle_meta["bytes"],
                },
            })
        mitgliedschaften.sort(key=lambda m: m["ausschuss"])
        index[kennung] = {
            "kennung": kennung,
            "person": ergebnis["person"],
            "gruppe": ergebnis["gruppe"],
            "personenquelle": {
                "datei": abruf.get("datei"),
                "url": abruf.get("url"),
                "finalUrl": abruf.get("finalUrl"),
                "http": abruf.get("http"),
                "abrufStatus": abruf.get("abrufStatus"),
                "abgerufenAm": abruf.get("abgerufenAm"),
                "sha256": abruf.get("sha256"),
                "bytes": abruf.get("bytes"),
            },
            "ausschuesse": mitgliedschaften,
        }

    if len(index) != e["zielprofile"]:
        raise StellvertretungenFehler(
            f"Stellvertretungen: erwartet {e['zielprofile']} eindeutige Kennungen, gefunden {len(index)}."
        )
    if sum(len(v["ausschuesse"]) for v in index.values()) != e["gesamt"]:
        raise StellvertretungenFehler("Stellvertretungen: Mitgliedschaften weichen von der Bilanz ab.")
    return index
