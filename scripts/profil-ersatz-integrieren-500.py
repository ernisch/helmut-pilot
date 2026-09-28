#!/usr/bin/env python3
"""Integriert die am 28.09.2026 amtlich geprueften 500er-Ersatzprofile offline.

Das Werkzeug ersetzt genau zwoelf vorab bestimmte, nur an schwer auffindbaren
Feldbelegen blockierte Profile durch reale aktuelle Abgeordnete derselben
Parlaments-/Fraktionsgruppe. Es schreibt keine Production-Daten, aktiviert
nichts und setzt keine Importfreigabe. Alle Originalseiten muessen bereits im
lokalen Cache liegen; URL, Bytezahl und SHA-256 werden neu gebunden.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import runpy
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EINGANG = Path("/private/tmp/helmut-be-bb-start")
AUSWAHL = ROOT / "docs/betrieb/500-namensauswahl-20260927.json"
PARTEIEN = ROOT / "docs/betrieb/parteifeldpruefung-335-20260927.json"
ROLLEN_ALT = ROOT / "docs/betrieb/profilrollen-54-20260927.json"
ROLLEN_NEU = ROOT / "docs/betrieb/profilrollen-43-20260928.json"
BERICHT = ROOT / "docs/betrieb/500-ersatzprofile-20260928.json"


ERSATZ = [
    ("bundestag", "Bündnis 90/Die Grünen", "droege_katharina-1044100", "paus_lisa-1046498",
     "Bündnis 90/Die Grünen", "Seit 1995 Mitglied bei Bündnis 90/Grünen",
     "andauernde Mitgliedschaft seit 1995"),
    ("bundestag", "CDU/CSU", "englhardt_kopf_martina-1044208", "rachel_thomas-1046652",
     "CDU", "Seit 2012 CDU Kreisvorsitzender im Kreis Düren", "aktuelles Parteiamt seit 2012"),
    ("bundestag", "CDU/CSU", "frei_thorsten-1044370", "radomski_kerstin-1046660",
     "CDU", "Seit 1998 Mitglied der CDU Deutschlands", "andauernde Mitgliedschaft seit 1998"),
    ("bundestag", "CDU/CSU", "gueler_serap-1044642", "radwan_alexander-1049086",
     "CSU", "seit 2014 Kreisvorsitzender der CSU Miesbach", "aktuelles Parteiamt seit 2014"),
    ("bundestag", "CDU/CSU", "hahn_florian-1044694", "reddig_pascal-1046704",
     "CDU", "Seit 2011 Mitglied der CDU und der Jungen Union", "andauernde Mitgliedschaft seit 2011"),
    ("bundestag", "CDU/CSU", "hauer_matthias-1044780", "rehbaum_henning-1049104",
     "CDU", "Mitglied der CDU seit 1998", "andauernde Mitgliedschaft seit 1998"),
    ("bundestag", "CDU/CSU", "hirte_christian-1045006", "reichel_markus-1046714",
     "CDU", "Vorsitzender des Landesfachausschusses Wohlstand der CDU Sachsen",
     "gegenwaertiges Parteiamt ohne Befristung"),
    ("bundestag", "CDU/CSU", "lange_ulrich-1048862", "roettgen_norbert-1049138",
     "CDU", "seit 2021 Mitglied des Präsidium der CDU Deutschlands",
     "aktuelles Parteiamt seit 2021"),
    ("bundestag", "CDU/CSU", "launert_silke-1045740", "rohwer_lars-1046822",
     "CDU", "seit 2021 Landesvorsitzender des Evangelischen Arbeitskreises (EAK) der CDU Sachsen",
     "aktuelles Parteiamt seit 2021"),
    ("bundestag", "CDU/CSU", "ludwig_daniela-1045886", "rothenberger_johannes-1049136",
     "CDU", "Mitglied der Christlich Demokratischen Union Deutschlands",
     "ausdrueckliche gegenwaertige Mitgliedschaft"),
    ("bundestag", "SPD", "kofler_baerbel-1045482", "ruetzel_bernd-1046916",
     "SPD", "seit 2010 Vorsitzender SPD-Unterbezirk Main-Spessart/Miltenberg",
     "aktuelles Parteiamt seit 2010"),
    ("landtag-berlin", "Die Linke Fraktion", "claudia-engelmann", "steffen-zillich",
     "LINKE", None, "Partei im amtlichen Profil-H1; Landesliste in der Faktenliste"),
]


def lies(pfad: Path):
    return json.loads(pfad.read_text(encoding="utf-8"))


def schreibe(pfad: Path, wert) -> None:
    pfad.write_text(json.dumps(wert, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(pfad: Path) -> str:
    return hashlib.sha256(pfad.read_bytes()).hexdigest()


def slug(parlament: str, kennung: str) -> str:
    import re
    import unicodedata
    roh = unicodedata.normalize("NFKD", f"{parlament}-{kennung}").encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", roh.lower()).strip("-"))


def kennung(url: str) -> str:
    return url.rstrip("/").split("/")[-1].split("?")[0]


def dateiname(parlament: str, amtliche_kennung: str) -> str:
    praefix = "bundestag" if parlament == "bundestag" else "landtag-berlin"
    return f"{praefix}-{amtliche_kennung}.html"


def roster_index(parlament: str):
    pfad = EINGANG / ("bt-kandidaten.json" if parlament == "bundestag" else "be-kandidaten.json")
    return {kennung(e["url"]): e for e in lies(pfad)}


def neuer_abruf(parlament: str, eintrag: dict) -> dict:
    datei = dateiname(parlament, eintrag["amtlicheKennung"])
    pfad = EINGANG / "detailseiten" / datei
    if not pfad.is_file():
        raise RuntimeError(f"Amtliche Originalseite fehlt: {pfad}")
    zeit = dt.datetime.fromtimestamp(pfad.stat().st_mtime, dt.timezone.utc).isoformat()
    return {
        **eintrag,
        "abgerufenAm": zeit,
        "abrufStatus": "abgerufen",
        "http": 200,
        "finalUrl": eintrag["url"],
        "datei": datei,
        "bytes": pfad.stat().st_size,
        "sha256": sha256(pfad),
    }


def ersetze_je_kennung(liste: list[dict], neue: dict[str, dict], alte_zu_neuen: dict[str, str], feld) -> list[dict]:
    vorhandene = {feld(e) for e in liste}
    ergebnis = []
    for eintrag in liste:
        alt = feld(eintrag)
        if alt in alte_zu_neuen:
            neu = alte_zu_neuen[alt]
            if neu not in vorhandene:
                ergebnis.append(neue[neu])
            continue
        ergebnis.append(eintrag)
    for neu in alte_zu_neuen.values():
        if neu not in {feld(e) for e in ergebnis}:
            raise RuntimeError(f"Ersatz nicht integriert: {neu}")
    return ergebnis


def main() -> int:
    bt_roster = roster_index("bundestag")
    be_roster = roster_index("landtag-berlin")
    neue_auswahl: dict[str, dict] = {}
    alt_zu_neu: dict[str, str] = {}
    gruppen = {}
    for parlament, fraktion, alt, neu, *_ in ERSATZ:
        roster = bt_roster if parlament == "bundestag" else be_roster
        basis = roster[neu]
        if basis["fraktion"] != fraktion:
            raise RuntimeError(f"Gruppendrift bei {neu}: {basis['fraktion']} != {fraktion}")
        neue_auswahl[neu] = {**basis, "amtlicheKennung": neu, "parlament": parlament}
        alt_zu_neu[alt] = neu
        gruppen[(parlament, fraktion)] = gruppen.get((parlament, fraktion), 0) + 1

    auswahl = lies(AUSWAHL)
    vorher = {e["amtlicheKennung"]: e for e in auswahl["auswahl"]}
    if all(alt in vorher for alt in alt_zu_neu):
        entfernt = [vorher[alt] for alt in alt_zu_neu]
        auswahl["auswahl"] = ersetze_je_kennung(
            auswahl["auswahl"], neue_auswahl, alt_zu_neu, lambda e: e["amtlicheKennung"]
        )
        if not any(k.get("art") == "belegbarer Profilersatz 2026-09-28" for k in auswahl["korrekturen"]):
            auswahl["korrekturen"].append({
                "art": "belegbarer Profilersatz 2026-09-28",
                "am": "2026-09-28",
                "grund": (
                    "Zwoelf ausschliesslich an schwer auffindbaren amtlichen Feldbelegen blockierte "
                    "Profile durch reale aktuelle Abgeordnete derselben Parlaments-/Fraktionsgruppe "
                    "ersetzt; Auswahl vor Nachrichtenauswertung, keine personenbezogenen Pflichtplaetze."
                ),
                "entfernt": entfernt,
                "hinzu": [neue_auswahl[neu] for neu in alt_zu_neu.values()],
                "uebersprungeneKandidaten": [
                    {"amtlicheKennung": "rainer_alois-1046668", "grund": "kein aktueller Bundestagsausschuss"},
                    {"amtlicheKennung": "roewekamp_thomas-1046878", "grund": "keine eindeutige aktuelle Parteimitgliedschaft im amtlichen Profil"},
                    {"amtlicheKennung": "otte_karoline-1046442", "grund": "keine eindeutige aktuelle Parteimitgliedschaft im amtlichen Profil"},
                    {"amtlicheKennung": "regina-kittler", "grund": "keine eindeutige Mandatsart im amtlichen Profil"},
                ],
            })
        auswahl["status"] = "Kanonische reale 500er-Namensauswahl; kein Importmanifest, keine Aktivierung"
        schreibe(AUSWAHL, auswahl)
    elif not all(neu in vorher for neu in alt_zu_neu.values()):
        raise RuntimeError("Namensauswahl ist weder im Vorher- noch im erwarteten Nachherzustand.")

    abrufe_neu = {neu: neuer_abruf(parlament, neue_auswahl[neu]) for parlament, _, _, neu, *_ in ERSATZ}
    for datei, parlament in (("bundestagsprofile-330-abruf.json", "bundestag"),
                             ("landesprofile-170-abruf.json", "landtag-berlin")):
        pfad = EINGANG / datei
        mapping = {alt: neu for p, _, alt, neu, *_ in ERSATZ if p == parlament}
        daten = ersetze_je_kennung(lies(pfad), abrufe_neu, mapping, lambda e: e["amtlicheKennung"])
        schreibe(pfad, daten)

    subprocess.run(["python3", str(EINGANG / "extract-bund.py")], check=True)
    land_modul = runpy.run_path(str(EINGANG / "extract-land.py"))
    land_abrufe = lies(EINGANG / "landesprofile-170-abruf.json")
    land_extraktion = [land_modul["extract"](r) for r in land_abrufe]
    schreibe(EINGANG / "landesprofile-170-extraktion.json", land_extraktion)

    parteien = lies(PARTEIEN)
    partei_mapping = {slug(p, alt): slug(p, neu) for p, _, alt, neu, *_ in ERSATZ if p == "bundestag"}
    neue_parteien = {}
    for parlament, _, _, neu, partei, beleg, grund in ERSATZ:
        if parlament != "bundestag":
            continue
        q = abrufe_neu[neu]
        k = slug(parlament, neu)
        neue_parteien[k] = {
            "kennung": k,
            "status": "belegt",
            "partei": partei,
            "beleg": beleg,
            "abschnitt": "Biografie",
            "grund": grund,
            "vorschlag": {"kennung": k, "status": "belegt", "partei": partei,
                           "beleg": beleg, "abschnitt": "Biografie", "grund": grund},
            "pruefung": "Sol: Identitaet/URL/Hash und woertlicher Beleg abgeglichen; Aussage auf aktuelle Mitgliedschaft/Parteiamt geprueft.",
            "quelle": q,
        }
    parteien["ergebnisse"] = ersetze_je_kennung(
        parteien["ergebnisse"], neue_parteien, partei_mapping, lambda e: e["kennung"]
    )
    parteien["umfang"] = len(parteien["ergebnisse"])
    if parteien["umfang"] != 335:
        raise RuntimeError(f"Parteiquittung hat {parteien['umfang']} statt 335 Eintraege.")
    schreibe(PARTEIEN, parteien)

    rollen = lies(ROLLEN_ALT)
    entfernte_rollen = set(partei_mapping)
    rollen["ergebnisse"] = [e for e in rollen["ergebnisse"] if e["kennung"] not in entfernte_rollen]
    belegt = sum(e["status"] == "belegt" for e in rollen["ergebnisse"])
    offen = sum(e["status"] == "offen" for e in rollen["ergebnisse"])
    if (len(rollen["ergebnisse"]), belegt, offen) != (43, 37, 6):
        raise RuntimeError(f"Unerwartete Rollenbilanz: {len(rollen['ergebnisse'])}/{belegt}/{offen}")
    rollen["datum"] = "2026-09-28"
    rollen["zweck"] = (
        "Fortgeschriebene Rollenquittung fuer 43 weiterhin relevante Profile nach dem belegbaren "
        "Ersatz von elf Bundestagsprofilen; keine Import- oder Aktivierungsfreigabe."
    )
    rollen["bilanz"] = {"gesamt": 43, "rollenbelegt": 37, "offen": 6}
    rollen["pruefung"]["modell"] = "DeepSeek Flash High, schreibend; anschliessende Sol-Pruefung"
    schreibe(ROLLEN_NEU, rollen)

    auswahl_nachher = lies(AUSWAHL)["auswahl"]
    counts = {}
    for e in auswahl_nachher:
        counts[e["parlament"]] = counts.get(e["parlament"], 0) + 1
    if len(auswahl_nachher) != 500 or counts != {"bundestag": 330, "landtag-berlin": 120, "landtag-brandenburg": 50}:
        raise RuntimeError(f"Kohortenbilanz verletzt: {len(auswahl_nachher)} / {counts}")
    if any("afd" in str(e.get("fraktion", "")).lower() for e in auswahl_nachher):
        raise RuntimeError("AfD-Fraktion in Zielauswahl gefunden.")

    bericht = {
        "status": "Zwoelf Ersatzprofile offline integriert; kein Import, keine Aktivierung, kein 500er Test",
        "erstelltAm": "2026-09-28",
        "regel": "Nur reale aktuelle Abgeordnete derselben vorgesehenen Parlaments-/Fraktionsgruppe; nichts geraten.",
        "ersetzungen": [
            {"parlament": p, "fraktion": f, "entfernt": alt, "hinzu": neu,
             "partei": partei, "parteibeleg": beleg, "parteibelegGrund": grund,
             "quelle": {k: abrufe_neu[neu][k] for k in ("url", "sha256", "bytes", "abgerufenAm")}}
            for p, f, alt, neu, partei, beleg, grund in ERSATZ
        ],
        "uebersprungen": lies(AUSWAHL)["korrekturen"][-1]["uebersprungeneKandidaten"],
        "bilanz": {"gesamt": 500, "nachParlament": counts, "ersetzt": 12,
                    "afdProfile": 0, "aktiv": 0, "importfreigegeben": 0},
    }
    schreibe(BERICHT, bericht)
    print(json.dumps(bericht["bilanz"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
