#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kleines, getrenntes Pruefmodul fuer den einzelnen offenen Profilfall Julia Klöckner.

Roadmap §3: Der bislang einzeln offene Fachachsenfall
``bundestag-kloeckner-julia-1045434`` wird ueber ihre amtlich belegten
Bundestagspraesidentinnen-Aufgaben geschlossen. Dieses Modul haelt den grossen
Assembler ``profil-feldbelege-500.py`` schlank und verwendet die bestehenden
sicheren Quellen-/Personen-/HTML-Helfer des getrennten Moduls
``profil-feldbelege-500-zusatzaufgaben.py`` wieder (kein duplizierter 600-Zeilen-
Block, kein externer Parser, kein zweiter Netz-/DB-Weg). Es prueft ausschliesslich
die versionierte, vom Orchestrator vorbereitete Einzelfallquittung
``docs/betrieb/kloeckner-praesidentinnen-aufgaben-1-20260927.json`` gegen die
amtlichen Originaldateien, deren Metadaten/Quittungen und die kanonische 54er
Rollenquittung und liefert einen normalisierten Index je Kennung.

Harte Grenzen (fail closed):

  * nur lokal/offline (keine Netz-, DB- oder Modellzugriffe) und ausschliesslich
    Standardbibliothek; KEIN externer Parser, keine hartcodierte Laufzeit. Das eng
    fixierte Fachurteil ist injizierbar (``erwartung``),
  * nur die eine kanonische Kennung (disjunkt zu den 19 Ressort-, 6 Aufgaben-,
    2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3 Wahlausschuss- und
    1 Jarzombek-Achse),
  * kanonische 500er-Person ausschliesslich ueber Name + echte H1 + URL + Hash +
    Abrufzeit + Bytezahl + HTTP der unveraenderten amtlichen Bundestags-Detailseite
    UND den eigenen aktuellen Funktionstext der amtlichen Profilseite (genau ein
    geschlossener ``div.m-biography__function``). Die bestehende aktuelle Rolle
    stammt aus der bereits belegten 54er Rollenquittung (NICHT offen) und wird
    ausdruecklich erneut an ihre kanonische Quelle gebunden; die alte 54er
    Rollenquittung bleibt unveraendert,
  * Aufgaben AUSSCHLIESSLICH aus dem ZWEITEN eigenen Absatz des geschlossenen
    H2-Abschnitts "An der Spitze der Bundestagsverwaltung" der amtlichen
    Praesidiumsseite. Der erste Absatz, sonstige Praesidiums-/Aeltestenratsarbeit
    und angrenzende Abschnitte sind ausdruecklich keine Personenaufgaben; ein
    Absatz darf den eigenen Abschnitt nicht verlassen. Nur echte geschlossene
    HTML-Elemente zaehlen; Kommentare, Skripte, Vorlagen und Navigation sind kein
    Beleg, der ``--hidden``-Linkhilfetext ist keine Aufgabenprosa,
  * NUR die zwei freigegebenen Themen Bundestagsverwaltung und Parteienfinanzierung
    und der getrennte Herkunftshinweis; keine allgemeine Polizei-/Innenpolitik,
    keine persoenliche politische Position, keine Scheinausschuesse, keine
    Partei-/Mandatsartaenderung.
"""

from __future__ import annotations

import html as _html
import importlib.util as _importlib_util
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

KLOECKNER = REPO_ROOT / "docs" / "betrieb" / "kloeckner-praesidentinnen-aufgaben-1-20260927.json"
KLOECKNER_RESSOURCE = "docs/betrieb/kloeckner-praesidentinnen-aufgaben-1-20260927.json"

GESAMT = 1
REGION = "Bund"
STATUS = ("belegt",)
BINDUNGSART = "amtsaufgabe"
QUELLHOST = "bundestag.de"
QUELLHOSTS = {"bundestag.de"}

AUFGABENABSCHNITT = "An der Spitze der Bundestagsverwaltung"
FUNKTIONSBLOCK = "m-biography__function"
ERSTER_ABSATZ = (
    "Die Aufgaben des Bundestagspräsidenten gehen über die neutrale und unparteiische Leitung "
    "der Plenarsitzungen weit hinaus. Als Repräsentant des ganzen Hauses vertritt er den "
    "Bundestag auch nach außen. Er wird zu Staatsempfängen eingeladen, hält Reden bei wichtigen "
    "politischen und gesellschaftlichen Anlässen und wahrt die Würde des Bundestages und die "
    "Rechte seiner Mitglieder."
)
ZWEITER_ABSATZ = (
    "Der Präsident steht auch an der Spitze der Bundestagsverwaltung. Er ist der oberste "
    "Dienstherr der rund 3.000 Mitarbeiterinnen und Mitarbeiter des Bundestages und übt die "
    "Polizeigewalt und das Hausrecht in den Gebäuden des Parlaments aus. Zudem setzt der "
    "Präsident jährlich die Höhe der staatlichen Mittel zur Parteienfinanzierung fest. Das "
    "Parteiengesetz hat ihm diese Exekutivaufgabe übertragen."
)
# Nur die zwei ausdruecklichen Themen sind freigegeben; diese Gegenproben duerfen NIE
# ein Thema werden (allgemeine Polizei-/Innenpolitik, Praesidiums-/Aeltestenratsarbeit,
# angrenzende Absaetze und die erste Erklaerung).
VERBOTENE_THEMEN = (
    "Polizei", "Polizeigewalt", "Hausrecht", "Innenpolitik", "Innenminister",
    "Plenarsitzung", "Plenarsitzungen", "Ältestenrat", "Aeltestenrat", "Präsidium",
    "Praesidium", "Repräsentant", "Repraesentant", "Staatsempfang", "Staatsempfänge",
    "Würde", "Wuerde", "Reden",
)


def _lade_zusatzmodul():
    """Laedt das getrennte Zusatzaufgabenmodul als Helferbibliothek (ohne Bytecode)."""
    pfad = Path(__file__).with_name("profil-feldbelege-500-zusatzaufgaben.py")
    vorher = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    spec = _importlib_util.spec_from_file_location("profil_feldbelege_500_zusatzaufgaben_kloeckner", pfad)
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
    "bundestag-kloeckner-julia-1045434": {
        "region": REGION,
        "bindungsart": BINDUNGSART,
        "person": "Julia Klöckner",
        "funktion": "Bundestagspräsidentin",
        "funktionstext": "Bundestagspräsidentin",
        "abschnitt": AUFGABENABSCHNITT,
        "ersterAbsatz": ERSTER_ABSATZ,
        "absatz": ZWEITER_ABSATZ,
        "aufgabenbindung": (
            "Bundestagspräsidentin; Spitze der Bundestagsverwaltung und jährliche Festsetzung der "
            "staatlichen Mittel zur Parteienfinanzierung"
        ),
        "themen": ["Bundestagsverwaltung", "Parteienfinanzierung"],
        "personenquelle": {
            "url": "https://www.bundestag.de/abgeordnete/biografien/K/kloeckner_julia-1045434",
            "finalUrl": "https://www.bundestag.de/abgeordnete/biografien/K/kloeckner_julia-1045434",
            "abgerufenAm": "2026-09-27T13:00:37.494520+00:00",
            "sha256": "f89405b0fa87c453503b83a0e7d0f3e2b4a5e8a6df41c9544a4e9bd796f74329",
            "bytes": 283248,
            "datei": "bundestag-kloeckner_julia-1045434.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
        "quelle": {
            "url": "https://www.bundestag.de/parlament/praesidium/funktion_neu",
            "finalUrl": "https://www.bundestag.de/parlament/praesidium/funktion_neu",
            "abgerufenAm": "2026-09-27T20:42:16.429190+00:00",
            "sha256": "d63f72c87b88a2b7d174386fe33137d45280707e311d779ede39136627d7c9cd",
            "bytes": 257178,
            "datei": "praesidentin-aufgaben-20260927.html",
            "http": 200,
            "abrufStatus": "abgerufen",
        },
    }
}


class KloecknerFehler(Exception):
    """Fail-closed-Abbruch der Kloeckner-Einzelfallpruefung."""


# ── Sichere Quellenbinder (wiederverwendet; nur bundestag.de ist zulaessig) ───────────────

def _pruefe_aufgabenquelle(ergebnis: dict, zusatz: Path, kennung: str, feld: str) -> tuple:
    """Bindet die amtliche Aufgabenquelle an Metadatum UND echtes Original.

    Wie der Amthor-/Zusatzaufgaben-Quellenleser: URL/finalUrl/Abrufzeit/Hash/Bytezahl/
    Datei/HTTP muessen in Quittung und ``*.meta.json`` uebereinstimmen und das Original
    bytegenau treffen.
    """
    quelle = ergebnis.get(feld) or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(quelle.get(name) or "") == "":
            raise KloecknerFehler(f"Kloeckner: Quellenfeld {name} fehlt ({kennung}/{feld}).")
    datei_name = str(quelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise KloecknerFehler(f"Kloeckner: ungueltiger Dateiname ({kennung}/{feld}).")
    datei = zusatz / datei_name
    if not datei.is_file():
        raise KloecknerFehler(f"Kloeckner: Originaldatei fehlt: {datei_name!r} ({kennung}/{feld}).")
    try:
        meta = ZU._meta_datei(datei_name, zusatz, kennung)
    except ZU.ZusatzaufgabenFehler as fehler:
        raise KloecknerFehler(str(fehler)) from fehler
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(meta.get(name)) != str(quelle.get(name)):
            raise KloecknerFehler(f"Kloeckner: Metadatum {name} weicht ab ({kennung}/{feld}).")
    if str(meta.get("http")) != str(quelle.get("http")):
        raise KloecknerFehler(f"Kloeckner: Metadatum http weicht ab ({kennung}/{feld}).")
    if quelle.get("finalUrl") != quelle.get("url"):
        raise KloecknerFehler(f"Kloeckner: finalUrl weicht von der kanonischen URL ab ({kennung}/{feld}).")
    if quelle.get("http") != 200 or quelle.get("abrufStatus") != "abgerufen":
        raise KloecknerFehler(f"Kloeckner: Abruf nicht erfolgreich ({kennung}/{feld}).")
    if ZU._quellenhost(quelle.get("url")) != QUELLHOST:
        raise KloecknerFehler(
            f"Kloeckner: unerwarteter Quellhost {ZU._quellenhost(quelle.get('url'))!r} ({kennung}/{feld})."
        )
    if ZU._sha256(datei) != str(quelle.get("sha256")) or datei.stat().st_size != quelle.get("bytes"):
        raise KloecknerFehler(f"Kloeckner: Original-Hash/Bytezahl weicht ab ({kennung}/{feld}).")
    return quelle, datei.read_text(encoding="utf-8", errors="replace")


def _pruefe_personenquelle(ergebnis: dict, profilrollen: dict, kennung_zu_abruf: dict,
                           detailseiten: Path, kennung: str, erwartet: dict) -> tuple:
    """Bindet die kanonische Bundestags-Person separat neu (Original UND Abrufmetadatum).

    Die bestehende aktuelle Rolle stammt aus der belegten 54er Rollenquittung; die
    kanonische 500er-Person wird trotzdem eigenstaendig ueber die echte H1 und den
    eigenen aktuellen Funktionstext der amtlichen Profilseite neu gebunden. Die alte
    54er Rollenquittung bleibt unveraendert. Keine fachliche Achse entsteht daraus.
    """
    personenquelle = ergebnis.get("personenquelle") or {}
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei"):
        if str(personenquelle.get(name) or "") == "":
            raise KloecknerFehler(f"Kloeckner: Personenquellenfeld {name} fehlt ({kennung}).")
    datei_name = str(personenquelle.get("datei"))
    if Path(datei_name).name != datei_name:
        raise KloecknerFehler(f"Kloeckner: ungueltiger Personenquelldateiname ({kennung}).")
    datei = Path(detailseiten) / datei_name
    if not datei.is_file():
        raise KloecknerFehler(f"Kloeckner: amtliche Personenquelle fehlt ({kennung}).")
    if ZU._quellenhost(personenquelle.get("url")) != QUELLHOST:
        raise KloecknerFehler(f"Kloeckner: unerwarteter Personenquellen-Host ({kennung}).")
    if personenquelle.get("finalUrl") != personenquelle.get("url"):
        raise KloecknerFehler(f"Kloeckner: Personenquelle finalUrl weicht ab ({kennung}).")
    if personenquelle.get("http") != 200 or personenquelle.get("abrufStatus") != "abgerufen":
        raise KloecknerFehler(f"Kloeckner: Personenabruf nicht erfolgreich ({kennung}).")
    if ZU._sha256(datei) != str(personenquelle.get("sha256")) or datei.stat().st_size != personenquelle.get("bytes"):
        raise KloecknerFehler(f"Kloeckner: Personenquellen-Hash/Bytezahl weicht ab ({kennung}).")

    # Original UND Abrufmetadatum (die Detailseite traegt ihre Metadaten im Abruf-JSON).
    abruf = kennung_zu_abruf.get(kennung)
    if abruf is None:
        raise KloecknerFehler(f"Kloeckner: Kennung {kennung} gehoert nicht zu den 500 Zielprofilen.")
    if abruf.get("parlament") != "bundestag":
        raise KloecknerFehler(f"Kloeckner: Kennung {kennung} ist kein Bundestagsprofil.")
    for name in ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei", "http", "abrufStatus"):
        if str(abruf.get(name)) != str(personenquelle.get(name)):
            raise KloecknerFehler(f"Kloeckner: Abrufmetadatum {name} weicht ab ({kennung}).")

    # Die bestehende aktuelle Rolle stammt aus der belegten 54er Rollenquittung.
    rollen_eintrag = profilrollen.get(kennung)
    if rollen_eintrag is None:
        raise KloecknerFehler(f"Kloeckner: Kennung {kennung} ist keine der 54 Rollenfachachsen.")
    if str(rollen_eintrag.get("status")) != "belegt":
        raise KloecknerFehler(f"Kloeckner: die 54er Rolle zu {kennung} muss belegt sein.")
    rollen_ref = rollen_eintrag.get("quelle") or {}
    for name in ("url", "sha256", "abgerufenAm"):
        if str(rollen_ref.get(name)) != str(personenquelle.get(name)):
            raise KloecknerFehler(f"Kloeckner: 54er Rollenquelle weicht ab ({name}) ({kennung}).")
    wortlaute = [str(f.get("wortlaut") or "").strip() for f in (rollen_eintrag.get("funktionen") or [])]
    if erwartet["funktion"] not in wortlaute:
        raise KloecknerFehler(f"Kloeckner: der belegte 54er-Eintrag {kennung} traegt nicht die Rolle.")

    # Echte H1 und eigener aktueller Funktionstext aus dem unveraenderten Original.
    text = datei.read_text(encoding="utf-8", errors="replace")
    namen = _Personenname.lese(text)
    if len(namen) != 1 or namen[0] != ZU._norm(erwartet["person"]):
        raise KloecknerFehler(f"Kloeckner: Person passt nicht zur kanonischen Kennung ({kennung}).")
    funktionstext = _Funktionsblock.lese(text)
    if funktionstext != ZU._norm(erwartet["funktionstext"]):
        raise KloecknerFehler(f"Kloeckner: der eigene Funktionstext weicht vom fixierten Urteil ab ({kennung}).")
    return personenquelle, text


class _Personenname(HTMLParser):
    """Nur echte sichtbare H1, keine Namen in Kommentaren, Skripten oder Vorlagen."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blockiert = []
        self.kopf = None
        self.namen = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.blockiert.append(tag)
        if self.blockiert:
            return
        if tag == "h1":
            if self.kopf is not None:
                raise KloecknerFehler("Kloeckner: verschachtelte H1.")
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
    def lese(cls, dokument) -> list:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.blockiert or parser.kopf is not None:
            raise KloecknerFehler("Kloeckner: Personenmarkup unvollstaendig.")
        return parser.namen


class _Funktionsblock(HTMLParser):
    """Genau EIN geschlossener ``div.m-biography__function``-Block (eigener Funktionstext)."""
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ausgelassen = []
        self.versteckt = 0
        self.rahmen = []
        self.bloecke = []
        self.tiefe = 0
        self.block_position = None
        self.teile = []

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag in self.VOID:
            return
        attrs = dict(attrs)
        versteckt = "--hidden" in attrs.get("class", "").split()
        if tag == "div":
            if self.tiefe:
                self.tiefe += 1
            elif "m-biography__function" in attrs.get("class", "").split():
                self.tiefe = 1
                self.block_position = len(self.rahmen)
                self.teile = []
        self.rahmen.append((tag, versteckt))
        if versteckt:
            self.versteckt += 1

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index][0] == tag:
                position = index
                break
        if position is None:
            return
        if self.tiefe and position < self.block_position:
            raise KloecknerFehler("Kloeckner: Funktionstext verlaesst seinen eigenen Abschnitt.")
        for index in range(len(self.rahmen) - 1, position - 1, -1):
            if self.rahmen[index][1]:
                self.versteckt -= 1
        del self.rahmen[position:]
        if tag == "div" and self.tiefe:
            self.tiefe -= 1
            if not self.tiefe:
                self.block_position = None
                if not self.versteckt:
                    self.bloecke.append(" ".join(self.teile))
                else:
                    raise KloecknerFehler("Kloeckner: ungeschlossener --hidden-Bereich im Funktionstext.")

    def handle_data(self, data):
        if self.tiefe and not self.ausgelassen and not self.versteckt:
            self.teile.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument) -> str:
        parser = cls()
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.rahmen or parser.tiefe or len(parser.bloecke) != 1:
            raise KloecknerFehler("Kloeckner: Funktionstextblock fehlt, ist doppelt oder unvollstaendig.")
        return ZU._norm(parser.bloecke[0])


class _Abschnittsleser(HTMLParser):
    """Die eigenen Absaetze genau des geschlossenen H2-Abschnitts (fail closed).

    Nur echte geschlossene HTML-Elemente zaehlen; Kommentare, Skripte, Vorlagen und
    Navigation sind kein Beleg, ``--hidden``-Linkhilfetexte zaehlen nicht als
    Aufgabenprosa. Der gesuchte H2 muss genau einmal vorkommen; der Abschnitt endet
    an der naechsten Ueberschrift, und ein eigener Absatz darf den Abschnitt nicht
    verlassen (kein ungeschlossener/ueberlappender Absatz).
    """
    AUSGELASSEN = {"script", "style", "template", "noscript", "nav"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr"}
    KOPF = re.compile(r"^h[1-6]$")

    def __init__(self, ziel: str):
        super().__init__(convert_charrefs=True)
        self.ziel = ZU._norm(ziel)
        self.ausgelassen = []
        self.rahmen = []
        self.versteckt = 0
        self.kopf_tag = None
        self.kopf_versteckt = False
        self.kopf = None
        self.gesehen = 0
        self.im_abschnitt = False
        self.abschnitt_tiefe = None
        self.absatz = None
        self.absaetze = []

    def _beende_abschnitt(self):
        if self.absatz is not None:
            raise KloecknerFehler("Kloeckner: eigener Absatz verlaesst den Abschnitt.")
        self.im_abschnitt = False

    def handle_starttag(self, tag, attrs):
        if tag in self.AUSGELASSEN:
            self.ausgelassen.append(tag)
        if self.ausgelassen:
            return
        if tag in self.VOID:
            return
        attrs = dict(attrs)
        versteckt = "--hidden" in attrs.get("class", "").split()
        if self.KOPF.match(tag):
            if self.im_abschnitt:
                self._beende_abschnitt()
            self.kopf_tag = tag
            self.kopf_versteckt = self.versteckt > 0 or versteckt
            self.kopf = []
        self.rahmen.append((tag, versteckt))
        if versteckt:
            self.versteckt += 1
        if self.im_abschnitt and tag == "p":
            if len(self.rahmen) != self.abschnitt_tiefe + 1:
                raise KloecknerFehler("Kloeckner: Absatz ist kein eigenes Kind des Aufgabenabschnitts.")
            if self.absatz is not None:
                raise KloecknerFehler("Kloeckner: verschachtelter eigener Absatz im Abschnitt.")
            self.absatz = []

    def handle_endtag(self, tag):
        if self.ausgelassen:
            if tag == self.ausgelassen[-1]:
                self.ausgelassen.pop()
            return
        if tag in self.VOID:
            return
        position = None
        for index in range(len(self.rahmen) - 1, -1, -1):
            if self.rahmen[index][0] == tag:
                position = index
                break
        if position is not None:
            if self.im_abschnitt and position < self.abschnitt_tiefe:
                self._beende_abschnitt()
            for index in range(len(self.rahmen) - 1, position - 1, -1):
                if self.rahmen[index][1]:
                    self.versteckt -= 1
            del self.rahmen[position:]
        if tag == self.kopf_tag and self.kopf is not None:
            text = ZU._norm(" ".join(self.kopf))
            self.kopf = None
            self.kopf_tag = None
            if tag == "h2" and text == self.ziel and not self.kopf_versteckt:
                self.gesehen += 1
                self.im_abschnitt = True
                self.abschnitt_tiefe = len(self.rahmen)
        if self.im_abschnitt and tag == "p" and self.absatz is not None:
            if self.versteckt:
                raise KloecknerFehler("Kloeckner: ungeschlossener --hidden-Bereich im Absatz.")
            self.absaetze.append(ZU._norm(" ".join(self.absatz)))
            self.absatz = None

    def handle_data(self, data):
        if self.ausgelassen:
            return
        if self.kopf is not None:
            self.kopf.append(_html.escape(data))
        if self.im_abschnitt and self.absatz is not None and not self.versteckt:
            self.absatz.append(_html.escape(data))

    @classmethod
    def lese(cls, dokument, ziel: str) -> list:
        parser = cls(ziel)
        parser.feed(str(dokument or ""))
        parser.close()
        if parser.ausgelassen or parser.absatz is not None or parser.versteckt:
            raise KloecknerFehler("Kloeckner: Aufgabenabschnitt unvollstaendig.")
        if parser.gesehen != 1:
            raise KloecknerFehler(
                f"Kloeckner: erwartet genau einen geschlossenen H2-Abschnitt {ziel!r}, "
                f"gefunden {parser.gesehen}."
            )
        if len(parser.absaetze) != 2:
            raise KloecknerFehler(
                f"Kloeckner: der Abschnitt braucht genau zwei eigene Absaetze, "
                f"gefunden {len(parser.absaetze)}."
            )
        return parser.absaetze


def _pruefe_aufgabenabschnitt(quelle_text: str, erwartet: dict, kennung: str) -> str:
    """Der ZWEITE eigene Absatz des geschlossenen H2-Abschnitts belegt die Aufgaben."""
    absaetze = _Abschnittsleser.lese(quelle_text, erwartet["abschnitt"])
    if absaetze[0] != ZU._norm(erwartet["ersterAbsatz"]):
        raise KloecknerFehler(f"Kloeckner: der erste eigene Absatz weicht vom fixierten Urteil ab ({kennung}).")
    absatz = absaetze[1]
    if absatz != ZU._norm(erwartet["absatz"]):
        raise KloecknerFehler(f"Kloeckner: der zweite eigene Absatz weicht vom fixierten Urteil ab ({kennung}).")
    return absatz


def _pruefe_themen(erwartet: dict, absatz: str, kennung: str) -> None:
    themen = erwartet["themen"]
    if len(themen) != 2 or list(dict.fromkeys(themen)) != themen:
        raise KloecknerFehler(f"Kloeckner: genau zwei eindeutige Themen sind freigegeben ({kennung}).")
    for thema in themen:
        if not ZU._enthaelt_in_reihenfolge(thema, absatz):
            raise KloecknerFehler(f"Kloeckner: Thema {thema!r} steht nicht im gebundenen Absatz ({kennung}).")
    for thema in themen:
        for verboten in VERBOTENE_THEMEN:
            if verboten.lower() in str(thema).lower():
                raise KloecknerFehler(
                    f"Kloeckner: allgemeines/fremdes Thema {thema!r} ist gesperrt ({kennung})."
                )


def pruefe_kloeckner(eingang, *, quittung=None, ressortachsen_kennungen=None,
                     aufgabenachsen_kennungen=None, beratendeachsen_kennungen=None,
                     zusatzaufgaben_kennungen=None, bmwsb_kennungen=None,
                     amthor_kennungen=None, wahlausschuss_kennungen=None,
                     jarzombek_kennungen=None, erwartung=None) -> dict:
    """Prueft die versionierte Einzelfallquittung Kloeckner (fail closed).

    Erzwungen wird: genau EINE kanonische Kennung, disjunkt zu den 19 Ressort-, 6
    Aufgaben-, 2 beratenden, 3 Zusatzaufgaben-, 2 BMWSB-, 1 Amthor-, 3
    Wahlausschuss- und 1 Jarzombek-Achse; die kanonische 500er-Person (Name + echte
    H1 + URL + Hash + Abrufzeit + Bytezahl + HTTP) UND der eigene aktuelle
    Funktionstext der amtlichen Profilseite separat neu gebunden, waehrend die
    bestehende aktuelle Rolle aus der belegten 54er Quittung stammt; die Aufgaben
    ausschliesslich aus dem ZWEITEN eigenen Absatz des geschlossenen H2-Abschnitts
    "An der Spitze der Bundestagsverwaltung" (der erste Absatz und angrenzende
    Abschnitte sind keine Personenaufgaben, der --hidden-Linkhilfetext zaehlt
    nicht); die amtliche Aufgabenquelle an URL/finalUrl/sha256/Bytezahl/Abrufzeit/
    HTTP/Datei jeweils Original UND Metadatum gebunden. Jede Abweichung bricht ab.
    """
    aufgaben = erwartung or ERWARTUNG
    if quittung is None:
        quittung = getattr(eingang, "kloeckner", None)
    if quittung is None:
        if not KLOECKNER.is_file():
            raise KloecknerFehler(f"Kloeckner-Quittung fehlt: {KLOECKNER_RESSOURCE}.")
        quittung = ZU._lies_json(KLOECKNER)
    if not isinstance(quittung, dict):
        raise KloecknerFehler(f"Kloeckner-Quittung fehlt: {KLOECKNER_RESSOURCE}.")
    ergebnisse = quittung.get("ergebnisse")
    if not isinstance(ergebnisse, list) or len(ergebnisse) != GESAMT:
        raise KloecknerFehler(
            f"Kloeckner-Quittung: erwartet {GESAMT} Ergebnisse, "
            f"gefunden {len(ergebnisse) if isinstance(ergebnisse, list) else 'n/a'}."
        )
    bilanz = quittung.get("bilanz") or {}
    if (bilanz.get("gesamt"), bilanz.get("Bund"), bilanz.get("Berlin"), bilanz.get("Brandenburg")) != (
        GESAMT, GESAMT, 0, 0
    ):
        raise KloecknerFehler(f"Kloeckner-Quittung: unerwartete Bilanz {bilanz!r}.")

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
    if jarzombek_kennungen is None:
        jarzombek_kennungen = set(getattr(eingang, "jarzombek_by_kennung", None) or {})
    disjunkt = (
        ("Ressortachse", set(ressortachsen_kennungen)),
        ("Aufgabenachse", set(aufgabenachsen_kennungen)),
        ("beratende Achse", set(beratendeachsen_kennungen)),
        ("Zusatzaufgabenachse", set(zusatzaufgaben_kennungen)),
        ("BMWSB-Achse", set(bmwsb_kennungen)),
        ("Amthor-Achse", set(amthor_kennungen)),
        ("Wahlausschuss-Achse", set(wahlausschuss_kennungen)),
        ("Jarzombek-Achse", set(jarzombek_kennungen)),
    )

    index = {}
    for ergebnis in ergebnisse:
        kennung = str(ergebnis.get("kennung", "")).strip()
        if not kennung:
            raise KloecknerFehler("Kloeckner: Eintrag ohne Kennung.")
        if kennung in index:
            raise KloecknerFehler(f"Kloeckner: doppelte Kennung {kennung}.")
        if kennung not in aufgaben:
            raise KloecknerFehler(f"Kloeckner: unbekannte Kennung {kennung} (kein fixiertes Urteil).")
        for name, menge in disjunkt:
            if kennung in menge:
                raise KloecknerFehler(f"Kloeckner: Kennung {kennung} ist bereits eine {name}.")
        erwartet = aufgaben[kennung]
        if str(ergebnis.get("region") or "").strip() != erwartet["region"]:
            raise KloecknerFehler(f"Kloeckner: unerwartete Region ({kennung}).")
        if str(ergebnis.get("parlament") or "").strip() != "bundestag":
            raise KloecknerFehler(f"Kloeckner: unerwartetes Parlament ({kennung}).")
        if str(ergebnis.get("status") or "").strip() not in STATUS:
            raise KloecknerFehler(f"Kloeckner: unerwarteter Status {ergebnis.get('status')!r} ({kennung}).")
        if ergebnis.get("importfreigegeben") is not False:
            raise KloecknerFehler(f"Kloeckner: importfreigegeben muss false sein ({kennung}).")
        if str(ergebnis.get("bindungsart") or "").strip() != erwartet["bindungsart"]:
            raise KloecknerFehler(f"Kloeckner: unerwartete Bindungsart ({kennung}).")
        person = str(ergebnis.get("person") or "").strip()
        if person != erwartet["person"]:
            raise KloecknerFehler(f"Kloeckner: Person weicht vom fixierten Urteil ab ({kennung}).")

        # Kanonische 500er-Person + eigene aktuelle Funktion separat neu gebunden.
        personenquelle, _personen_text = _pruefe_personenquelle(
            ergebnis, profilrollen, kennung_zu_abruf, detailseiten, kennung, erwartet
        )
        if dict(personenquelle) != erwartet["personenquelle"]:
            raise KloecknerFehler(f"Kloeckner: Personenquellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Amtliche Aufgabenquelle strikt an das fixierte Urteil binden (Original UND Meta).
        quelle, quelle_text = _pruefe_aufgabenquelle(ergebnis, zusatz, kennung, "quelle")
        if dict(quelle) != erwartet["quelle"]:
            raise KloecknerFehler(f"Kloeckner: Quellenmetadaten weichen vom fixierten Urteil ab ({kennung}).")

        # Der ZWEITE eigene Absatz des geschlossenen H2-Abschnitts belegt die Aufgaben.
        for name in ("funktion", "funktionstext", "abschnitt", "ersterAbsatz", "absatz", "aufgabenbindung"):
            if ergebnis.get(name) != erwartet[name]:
                raise KloecknerFehler(f"Kloeckner: Feld {name} weicht vom fixierten Urteil ab ({kennung}).")
        absatz = _pruefe_aufgabenabschnitt(quelle_text, erwartet, kennung)
        if ergebnis.get("absatz") != absatz:
            raise KloecknerFehler(f"Kloeckner: Aufgabenabsatz weicht vom fixierten Urteil ab ({kennung}).")
        if ZU._norm(erwartet["ersterAbsatz"]) in absatz:
            raise KloecknerFehler(f"Kloeckner: die erste Erklaerung darf keine Personenaufgabe sein ({kennung}).")

        # Nur die zwei freigegebenen Themen und der getrennte Herkunftshinweis.
        if ergebnis.get("themen") != erwartet["themen"]:
            raise KloecknerFehler(f"Kloeckner: Themen weichen vom fixierten Urteil ab ({kennung}).")
        _pruefe_themen(erwartet, absatz, kennung)
        hinweis = ZU.HINWEIS_AUFGABE.format(region=erwartet["region"], wert=erwartet["aufgabenbindung"])
        if ergebnis.get("ableitungsHinweis") != hinweis:
            raise KloecknerFehler(f"Kloeckner: Herkunftshinweis weicht vom freigegebenen Muster ab ({kennung}).")

        index[kennung] = {
            "kennung": kennung,
            "region": erwartet["region"],
            "parlament": "bundestag",
            "status": "belegt",
            "bindungsart": erwartet["bindungsart"],
            "person": person,
            "funktion": erwartet["funktion"],
            "funktionstext": erwartet["funktionstext"],
            "abschnitt": erwartet["abschnitt"],
            "ersterAbsatz": erwartet["ersterAbsatz"],
            "absatz": absatz,
            "aufgabenbindung": erwartet["aufgabenbindung"],
            "themen": list(erwartet["themen"]),
            "ableitungsHinweis": hinweis,
            "personenquelle": personenquelle,
            "quelle": quelle,
        }

    if len(index) != GESAMT:
        raise KloecknerFehler(f"Kloeckner-Quittung: erwartet {GESAMT} eindeutige Kennung, gefunden {len(index)}.")
    return index
