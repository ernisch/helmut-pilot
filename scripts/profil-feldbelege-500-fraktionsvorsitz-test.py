#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gezielte synthetische Gegenproben der Fraktionsvorsitz-Zweierquittung.

Nur offline (keine Netz-, DB- oder Modellzugriffe) und ohne die privaten
/private/tmp-Originale: der Validator ``profil-feldbelege-500-fraktionsvorsitz.py``
wird mit selbst erzeugten, strukturgleichen Personenseiten (H1 + JSON-LD
``ProfilePage.mainEntity`` mit ``@id`` ``#mdb``) und Fraktionsseiten
(``.bt-standard-content`` in ``article.bt-artikel``) gefahren. Negative Faelle
muessen fail closed abbrechen: falsche Person, vertauschte Quelle, andere Rolle,
verborgene/inert markierte Rolle, Abschnittsausbruch, Quellen-/Metadatendrift,
Personendrift, uebernommener 54er-Status, Themen, Parteiableitung und Bilanzfehler.

Aufruf:  python3 -B scripts/profil-feldbelege-500-fraktionsvorsitz-test.py
"""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
FV_SPEC = importlib.util.spec_from_file_location(
    "fv_test", HERE / "profil-feldbelege-500-fraktionsvorsitz.py"
)
fv = importlib.util.module_from_spec(FV_SPEC)
FV_SPEC.loader.exec_module(fv)

ABRUF = "2026-09-27T20:00:00+00:00"
BESCHREIBUNG = "Mitglied des 21. Deutschen Bundestages"
LINKHINWEIS = "(Interner Link)"


class Fall:
    """Ein synthetischer Fall mit Personenseite und Fraktionsseite."""

    def __init__(self, verzeichnis: Path, kennung: str, person: str, funktion: str,
                 abschnitt: str, zitat: str, fraktions_url: str):
        self.kennung = kennung
        self.person = person
        self.funktion = funktion
        self.abschnitt = abschnitt
        self.zitat = zitat
        self.fraktions_url = fraktions_url
        self.personen_url = f"https://www.bundestag.de/test/abgeordnete/{kennung}"
        self.personen_datei = f"{kennung}.html"
        self.fraktions_datei = f"{kennung}-fraktion.html"
        self.verzeichnis = verzeichnis
        self.detailseiten = verzeichnis / "detailseiten"
        self.zusatz = verzeichnis / "zusatzquellen"

    def personen_html(self, name: str | None = None) -> str:
        name = self.person if name is None else name
        seite = {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            "mainEntity": {
                "@type": "Person",
                "@id": "#mdb",
                "name": name,
                "description": BESCHREIBUNG,
            },
        }
        return (
            "<html><body><article class=\"bt-artikel\">"
            f"<h1>{name}</h1>"
            "<script type=\"application/ld+json\">"
            + json.dumps(seite, ensure_ascii=False)
            + "</script></article></body></html>"
        )

    @staticmethod
    def link(href: str, label: str) -> str:
        return (
            f"<a href=\"{href}\">"
            f"<span class='a-link__label'>{label}</span>"
            f"<span class='a-link__label --hidden'>{LINKHINWEIS}</span>"
            "</a>"
        )

    def fraktions_html(self, *, variante: str = "sichtbar") -> str:
        link = self.link(f"/test/abgeordnete/{self.kennung}", self.person)
        abschnitt = f"<h2>{self.abschnitt}</h2><p>{link}</p>"
        if variante == "fremdartikel":
            return ("<html><body><article class=\"bt-artikel\"></article>"
                    f"<div class=\"bt-standard-content\">{abschnitt}</div></body></html>")
        if variante == "verborgen":
            inner = f"<div hidden>{abschnitt}</div>"
        elif variante == "inert":
            inner = f"<template>{abschnitt}</template>"
        elif variante == "ausbruch":
            inner = (f"<h2>{self.abschnitt}</h2><p>Niemand.</p>"
                     f"<h2>Stellvertretende Fraktionsvorsitzende</h2><p>{link}</p>")
        else:
            inner = abschnitt
        return (
            "<html><body><article class=\"bt-artikel\"><div class=\"bt-artikel__article\">"
            f"<div class=\"bt-standard-content\">{inner}</div>"
            "</div></article></body></html>"
        )

    def schreibe_quelle(self, dokument: str) -> None:
        pfad = self.zusatz / self.fraktions_datei
        pfad.write_text(dokument, encoding="utf-8")
        self.quelle = {
            "url": self.fraktions_url,
            "finalUrl": self.fraktions_url,
            "abgerufenAm": ABRUF,
            "sha256": fv.ZU._sha256(pfad),
            "bytes": pfad.stat().st_size,
            "datei": self.fraktions_datei,
            "http": 200,
            "abrufStatus": "abgerufen",
        }
        (self.zusatz / f"{self.fraktions_datei}.meta.json").write_text(
            json.dumps({k: self.quelle[k] for k in
                        ("url", "finalUrl", "abgerufenAm", "sha256", "bytes", "datei")},
                       ensure_ascii=False),
            encoding="utf-8",
        )

    def erwartung(self) -> dict:
        personen_pfad = self.detailseiten / self.personen_datei
        return {
            "region": "Bund",
            "person": self.person,
            "funktion": self.funktion,
            "rolleAbschnitt": self.abschnitt,
            "rolleZitat": self.zitat,
            "rollenquelle": {
                "url": self.personen_url,
                "finalUrl": self.personen_url,
                "abgerufenAm": ABRUF,
                "sha256": fv.ZU._sha256(personen_pfad),
                "bytes": personen_pfad.stat().st_size,
                "datei": self.personen_datei,
                "http": 200,
                "abrufStatus": "abgerufen",
            },
            "quelle": dict(self.quelle),
        }

    def quittung_eintrag(self) -> dict:
        return {
            "kennung": self.kennung,
            "region": "Bund",
            "parlament": "bundestag",
            "status": "belegt",
            "person": self.person,
            "funktion": self.funktion,
            "rolleAbschnitt": self.abschnitt,
            "rolleZitat": self.zitat,
            "rollenquelle": dict(self.erwartung()["rollenquelle"]),
            "quelle": dict(self.quelle),
            "importfreigegeben": False,
        }


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "detailseiten").mkdir()
        (root / "zusatzquellen").mkdir()
        faelle = [
            Fall(root, "bundestag-test-hasselmann-1", "Britta Haßelmann",
                 "Fraktionsvorsitzende Bündnis 90/Die Grünen", "Fraktionsvorsitzende",
                 "Fraktionsvorsitzende Britta Haßelmann",
                 "https://www.bundestag.de/test/fraktionen/gruene"),
            Fall(root, "bundestag-test-miersch-2", "Dr. Matthias Miersch",
                 "Fraktionsvorsitzender SPD", "Fraktionsvorsitzender",
                 "Fraktionsvorsitzender Dr. Matthias Miersch",
                 "https://www.bundestag.de/test/fraktionen/spd"),
        ]
        for fall in faelle:
            (fall.detailseiten / fall.personen_datei).write_text(fall.personen_html(), encoding="utf-8")
            fall.schreibe_quelle(fall.fraktions_html())

        erwartung = {fall.kennung: fall.erwartung() for fall in faelle}
        profilrollen = {}
        kennung_zu_abruf = {}
        for fall in faelle:
            personen_pfad = fall.detailseiten / fall.personen_datei
            rollen_ref = {
                "url": fall.personen_url,
                "sha256": fv.ZU._sha256(personen_pfad),
                "abgerufenAm": ABRUF,
            }
            profilrollen[fall.kennung] = {"status": "offen", "funktionen": [], "quelle": dict(rollen_ref)}
            kennung_zu_abruf[fall.kennung] = {
                **rollen_ref,
                "finalUrl": fall.personen_url,
                "bytes": personen_pfad.stat().st_size,
                "datei": fall.personen_datei,
                "http": 200,
                "abrufStatus": "abgerufen",
                "parlament": "bundestag",
                "amtlicheKennung": fall.kennung,
            }

        def quittung(ergebnisse=None) -> dict:
            return {
                "version": 1,
                "datum": "2026-09-27",
                "status": "Test",
                "umfang": 2,
                "bilanz": {"gesamt": 2, "Bund": 2, "Berlin": 0, "Brandenburg": 0},
                "ergebnisse": [f.quittung_eintrag() for f in faelle] if ergebnisse is None else ergebnisse,
                "pruefung": "Test",
                "importfreigegeben": False,
            }

        def eingang(q: dict, rollen=None, abruf=None):
            return SimpleNamespace(
                verzeichnis=root,
                detailseiten=root / "detailseiten",
                fraktionsvorsitz=q,
                profilrollen_by_kennung=(profilrollen if rollen is None else rollen),
                kennung_zu_abruf=(kennung_zu_abruf if abruf is None else abruf),
            )

        def erwarte_fehler(fn, was, meldung=None):
            try:
                fn()
            except fv.FraktionsvorsitzFehler as fehler:
                if meldung is not None:
                    assert meldung in str(fehler), f"Falscher Sperrgrund fuer {was}: {fehler}"
                return
            raise AssertionError(f"Nicht gesperrt: {was}")

        # Positiver Ankerfall.
        index = fv.pruefe_fraktionsvorsitz(eingang(quittung()), erwartung=erwartung)
        assert len(index) == 2, index
        assert index[faelle[0].kennung]["funktion"] == faelle[0].funktion
        assert index[faelle[1].kennung]["funktion"] == faelle[1].funktion
        assert index[faelle[0].kennung]["quelle"]["url"] == faelle[0].fraktions_url
        print("PASS: gueltige Fraktionsvorsitz-Zweierquittung (2/2, sichtbarer kanonischer Biografielink)")

        # 1 · falsche Person.
        q = quittung()
        q["ergebnisse"][0]["person"] = "Falsche Person"
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "falsche Person", "falsche Person")
        print("PASS: falsche Person wird gesperrt")

        # 2 · vertauschte Quelle.
        q = quittung()
        q["ergebnisse"][0]["quelle"], q["ergebnisse"][1]["quelle"] = (
            q["ergebnisse"][1]["quelle"], q["ergebnisse"][0]["quelle"])
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "vertauschte Quelle", "Quelle weicht")
        print("PASS: vertauschte Quelle wird gesperrt")

        # 3 · andere Rolle.
        q = quittung()
        q["ergebnisse"][1]["funktion"] = "Stellvertretender Fraktionsvorsitzender"
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "andere Rolle", "andere/unerwartete Rolle")
        print("PASS: andere Rolle wird gesperrt")

        # 4 · verborgene Rolle (hidden).
        for fall in faelle:
            fall.schreibe_quelle(fall.fraktions_html(variante="verborgen"))
        erwartung_verborgen = {fall.kennung: fall.erwartung() for fall in faelle}
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung()), erwartung=erwartung_verborgen),
            "verborgene Rolle", "fehlt oder ist mehrdeutig")
        print("PASS: verborgene Rolle wird gesperrt")

        # 5 · inerte Rolle (template).
        for fall in faelle:
            fall.schreibe_quelle(fall.fraktions_html(variante="inert"))
        erwartung_inert = {fall.kennung: fall.erwartung() for fall in faelle}
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung()), erwartung=erwartung_inert),
            "inerte Rolle", "fehlt oder ist mehrdeutig")
        print("PASS: inert markierte Rolle wird gesperrt")

        # 6 · Abschnittsausbruch (Link unter fremder h2).
        for fall in faelle:
            fall.schreibe_quelle(fall.fraktions_html(variante="ausbruch"))
        erwartung_ausbruch = {fall.kennung: fall.erwartung() for fall in faelle}
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung()), erwartung=erwartung_ausbruch),
            "Abschnittsausbruch", "kanonischen #mdb-Biografielink")
        print("PASS: Abschnittsausbruch wird gesperrt")

        # 6b · der Rollenblock darf nicht neben einem leeren Artikel stehen.
        for fall in faelle:
            fall.schreibe_quelle(fall.fraktions_html(variante="fremdartikel"))
        erwartung_fremdartikel = {fall.kennung: fall.erwartung() for fall in faelle}
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung()), erwartung=erwartung_fremdartikel),
            "Rollenblock ausserhalb Artikel", "ausserhalb article.bt-artikel")
        print("PASS: Rollenblock ausserhalb des echten Artikels wird gesperrt")

        # Saubere Quellen wiederherstellen.
        for fall in faelle:
            fall.schreibe_quelle(fall.fraktions_html())
        erwartung = {fall.kennung: fall.erwartung() for fall in faelle}

        # 7 · Quellen-/Metadatendrift (Metadatumshahes weichen ab).
        meta = root / "zusatzquellen" / f"{faelle[0].fraktions_datei}.meta.json"
        daten = json.loads(meta.read_text(encoding="utf-8"))
        daten["sha256"] = "0" * 64
        meta.write_text(json.dumps(daten, ensure_ascii=False), encoding="utf-8")
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(quittung()), erwartung=erwartung),
                       "Metadatendrift", "Metadatum sha256 weicht ab")
        faelle[0].schreibe_quelle(faelle[0].fraktions_html())
        erwartung = {fall.kennung: fall.erwartung() for fall in faelle}
        print("PASS: Quellen-/Metadatendrift wird gesperrt")

        # 8 · Personendrift (lokaler Abruf passt nicht zur Quittung).
        abruf_drift = copy.deepcopy(kennung_zu_abruf)
        abruf_drift[faelle[1].kennung]["bytes"] += 1
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung(), abruf=abruf_drift), erwartung=erwartung),
            "Personendrift", "weicht vom lokalen Abruf ab")
        print("PASS: Personendrift wird gesperrt")

        # 9 · alter 54er-Status darf nicht uebernommen werden.
        rollen_belegt = {k: dict(v) for k, v in profilrollen.items()}
        rollen_belegt[faelle[0].kennung]["status"] = "belegt"
        erwarte_fehler(
            lambda: fv.pruefe_fraktionsvorsitz(
                eingang(quittung(), rollen=rollen_belegt), erwartung=erwartung),
            "uebernommener 54er-Status", "muss offen bleiben")
        print("PASS: uebernommener 54er-Status wird gesperrt")

        # 10 · Themen sind verboten.
        q = quittung()
        q["ergebnisse"][0]["themen"] = ["Fraktionsvorsitz"]
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "Themen", "unerlaubte Ergebnisfelder")
        print("PASS: Themen werden gesperrt")

        # 11 · Parteiableitung ist verboten.
        q = quittung()
        q["ergebnisse"][1]["partei"] = "SPD"
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "Parteiableitung", "unerlaubte Ergebnisfelder")
        print("PASS: Parteiableitung wird gesperrt")

        # 12 · doppelte Kennung.
        q = quittung()
        q["ergebnisse"][1]["kennung"] = q["ergebnisse"][0]["kennung"]
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "doppelte Kennung", "Kennungsmenge weicht")
        print("PASS: doppelte Kennung wird gesperrt")

        # 13 · falsche Bilanz.
        q = quittung()
        q["bilanz"]["Bund"] = 1
        erwarte_fehler(lambda: fv.pruefe_fraktionsvorsitz(eingang(q), erwartung=erwartung),
                       "falsche Bilanz", "unerwartete Bilanz")
        print("PASS: falsche Bilanz wird gesperrt")

    print("PASS: Fraktionsvorsitz-Zweierquittung — Negativfaelle falsche Person/vertauschte Quelle/"
          "andere Rolle/verborgen/inert/Abschnittsausbruch/Quellen- und Metadatendrift/Personendrift/"
          "54er-Uebernahme/Themen/Parteiableitung/Dublette/Bilanz gesperrt; positiver Ankerfall 2/2.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except fv.FraktionsvorsitzFehler as fehler:
        print(f"TEST-FEHLER: {fehler}")
        raise SystemExit(1)
