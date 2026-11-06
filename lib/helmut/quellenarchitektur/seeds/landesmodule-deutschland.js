"use strict";

// Neutrale Landesversorgung: dieselben Pflicht-/Bedarfsklassen für alle 16 Länder.
// Reine Daten, kein Netz, keine Aktivierung und keine packages.js-Abhängigkeit.
// Kandidaten-URLs sind KEINE Feeds. Nur LANDESQUELLEN enthält Parser-Eingänge.
// Alle neuen Quellen bleiben inaktiv; eine technische Stichprobe ist keine Freigabe.
const { LANDESQUELLEN_PRUEFBELEGE } = require("./landesmodule-pruefbelege");

const REQUIRED_CLASSES = Object.freeze(["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung","landesregierung","staatskanzlei","ministerien","landesfraktionen","regionale_leitmedien","oer_landesberichterstattung"]);
const DEMAND_CLASSES = Object.freeze(["kommunales","fachquellen","akteurspositionen"]);

const LANDESMODULE = [
  {
    "code": "BW",
    "bundesland": "Baden-Württemberg",
    "slug": "baden-wuerttemberg",
    "key": "baden-wuerttemberg-basis",
    "geography_id": "geo-land-baden-wuerttemberg",
    "parliament_name": "Landtag Baden-Württemberg",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Baden-Württemberg","url":"https://www.landtag-bw.de/de/aktuelles","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag-bw.de/de/rss-feed-neue-drucksachen-509930","note":"RSS für neue Drucksachen; Plenar- und Ausschusstermine samt Tagesordnungen auf der amtlichen Seite"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Baden-Württemberg","url":"https://www.baden-wuerttemberg.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"SWR Aktuell BW","url":"https://www.swr.de/swraktuell/baden-wuerttemberg/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Stuttgarter Zeitung","url":"https://www.stuttgarter-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Badische Zeitung","url":"https://www.badische-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Baden-Württemberg","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "BY",
    "bundesland": "Bayern",
    "slug": "bayern",
    "key": "bayern-basis",
    "geography_id": "geo-land-bayern",
    "parliament_name": "Bayerischer Landtag",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Bayerischer Landtag","url":"https://www.bayern.landtag.de/parlament/dokumente/","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.bayern.landtag.de/parlament/dokumente/","note":"Amtliche Dokumentenseite verweist auf RSS und Abo für Drucksachen/Tagesordnungen"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Bayern","url":"https://www.bayern.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"BR24","url":"https://www.br.de/nachrichten/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Süddeutsche Zeitung Bayern","url":"https://www.sueddeutsche.de/bayern","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Augsburger Allgemeine","url":"https://www.augsburger-allgemeine.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Bayern","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "BE",
    "bundesland": "Berlin",
    "slug": "berlin",
    "key": "berlin-basis",
    "geography_id": "geo-land-berlin",
    "parliament_name": "Abgeordnetenhaus Berlin / PARDOK",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Abgeordnetenhaus Berlin / PARDOK","url":"https://pardok.parlament-berlin.de/portala/opendata.tt.html","role":"official_primary","state":"prepared","method":null,"documentation":"https://pardok.parlament-berlin.de/portala/opendata.tt.html","note":"Lesende API: Vorgänge, Aktivitäten sowie Drucksachen, Plenar- und Ausschussprotokolle; Schlüssel erforderlich"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Berlin","url":"https://www.berlin.de/presse/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"rbb24 Berlin","url":"https://www.rbb24.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Tagesspiegel Berlin","url":"https://www.tagesspiegel.de/berlin/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Berliner Morgenpost","url":"https://www.morgenpost.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Berlin","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "BB",
    "bundesland": "Brandenburg",
    "slug": "brandenburg",
    "key": "brandenburg-basis",
    "geography_id": "geo-land-brandenburg",
    "parliament_name": "Landtag Brandenburg",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Brandenburg","url":"https://www.landtag.brandenburg.de/de/rss-infodienste/12411","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag.brandenburg.de/de/rss-infodienste/12411","note":"RSS für Dokumente, Plenum, Ausschüsse, Gesetzentwürfe, Anfragen/Antworten und personalisierte Suchabos"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Brandenburg","url":"https://www.brandenburg.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"rbb24 Brandenburg","url":"https://www.rbb24.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Märkische Allgemeine","url":"https://www.maz-online.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Märkische Oderzeitung","url":"https://www.moz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Lausitzer Rundschau","url":"https://www.lr-online.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Brandenburg","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "HB",
    "bundesland": "Bremen",
    "slug": "bremen",
    "key": "bremen-basis",
    "geography_id": "geo-land-bremen",
    "parliament_name": "Bremische Bürgerschaft / PARiS",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Bremische Bürgerschaft / PARiS","url":"https://paris.bremische-buergerschaft.de/","role":"official_primary","state":"prepared","method":null,"documentation":"https://sd.bremische-buergerschaft.de/","note":"PARiS-Dokumentensuche und verlinktes Dokumenten-Abo; gesondertes Sitzungsdokumentensystem; kein offener API/RSS-Vertrag hier belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Bremen","url":"https://www.senatspressestelle.bremen.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"buten un binnen / Radio Bremen","url":"https://www.butenunbinnen.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Weser-Kurier","url":"https://www.weser-kurier.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Nordsee-Zeitung","url":"https://www.nordsee-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Bremen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "HH",
    "bundesland": "Hamburg",
    "slug": "hamburg",
    "key": "hamburg-basis",
    "geography_id": "geo-land-hamburg",
    "parliament_name": "Hamburgische Bürgerschaft",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Hamburgische Bürgerschaft","url":"https://www.hamburgische-buergerschaft.de/recherche-info/parlamentsdatenbank","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.hamburgische-buergerschaft.de/recherche-info/parlamentsdatenbank","note":"Offiziell dokumentierte Datenbank für Drucksachen, Plenar-/Ausschussprotokolle und Vorgänge; API/RSS nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Hamburg","url":"https://www.hamburg.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"NDR Hamburg","url":"https://www.ndr.de/nachrichten/hamburg/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Hamburger Abendblatt","url":"https://www.abendblatt.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Hamburger Morgenpost","url":"https://www.mopo.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Hamburg","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "HE",
    "bundesland": "Hessen",
    "slug": "hessen",
    "key": "hessen-basis",
    "geography_id": "geo-land-hessen",
    "parliament_name": "Hessischer Landtag",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Hessischer Landtag","url":"https://hessischer-landtag.de/parlamentsdatenbank","role":"official_primary","state":"prepared","method":null,"documentation":"https://hessischer-landtag.de/parlamentsdatenbank","note":"Datenbank für Vorgänge, Dokumente, Gesetze und Reden; E-Mail-Infodienst registrierungspflichtig; offener API/RSS-Vertrag nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Hessen","url":"https://www.hessen.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"hessenschau","url":"https://www.hessenschau.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Frankfurter Rundschau","url":"https://www.fr.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"HNA","url":"https://www.hna.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Hessen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "MV",
    "bundesland": "Mecklenburg-Vorpommern",
    "slug": "mecklenburg-vorpommern",
    "key": "mecklenburg-vorpommern-basis",
    "geography_id": "geo-land-mecklenburg-vorpommern",
    "parliament_name": "Landtag Mecklenburg-Vorpommern",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Mecklenburg-Vorpommern","url":"https://www.landtag-mv.de/services/parlamentsdokumente","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.dokumentation.landtag-mv.de/parldok/suche/","note":"Amtliche Parlamentsdatenbank und dokumentierter Dokumentenversand; aktuelle offene API/RSS-Schnittstelle hier nicht verifiziert"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Mecklenburg-Vorpommern","url":"https://www.regierung-mv.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"NDR Mecklenburg-Vorpommern","url":"https://www.ndr.de/nachrichten/mecklenburg-vorpommern/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Ostsee-Zeitung","url":"https://www.ostsee-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Nordkurier","url":"https://www.nordkurier.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Mecklenburg-Vorpommern","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "NI",
    "bundesland": "Niedersachsen",
    "slug": "niedersachsen",
    "key": "niedersachsen-basis",
    "geography_id": "geo-land-niedersachsen",
    "parliament_name": "Niedersächsischer Landtag",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Niedersächsischer Landtag","url":"https://www.landtag-niedersachsen.de/rss-feeds/","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag-niedersachsen.de/rss-feeds/","note":"RSS für Drucksachen, Plenar-/Ausschusstagesordnungen, Berichte, Niederschriften und Gesetzesmaterialien"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Niedersachsen","url":"https://www.niedersachsen.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"NDR Niedersachsen","url":"https://www.ndr.de/nachrichten/niedersachsen/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Hannoversche Allgemeine","url":"https://www.haz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Braunschweiger Zeitung","url":"https://www.braunschweiger-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Neue Osnabrücker Zeitung","url":"https://www.noz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Niedersachsen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "NW",
    "bundesland": "Nordrhein-Westfalen",
    "slug": "nordrhein-westfalen",
    "key": "nordrhein-westfalen-basis",
    "geography_id": "geo-land-nordrhein-westfalen",
    "parliament_name": "Landtag Nordrhein-Westfalen",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Nordrhein-Westfalen","url":"https://www.landtag.nrw.de/home/dokumente/dokumentensuche/parlamentsdokumente/parlamentsdatenbank-suche.html","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.archive.nrw.de/archiv-des-landtags-nrw/online-angebote","note":"Amtliche Archivbeschreibung belegt Parlamentsdatenbank und Einzelabruf; direkter Datenbankaufruf im Recherchetool nicht zugänglich; API/RSS offen"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Nordrhein-Westfalen","url":"https://www.land.nrw/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"WDR Aktuelle Stunde / Lokalzeit","url":"https://www1.wdr.de/nachrichten/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Rheinische Post","url":"https://rp-online.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Westdeutsche Allgemeine Zeitung","url":"https://www.waz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Nordrhein-Westfalen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "RP",
    "bundesland": "Rheinland-Pfalz",
    "slug": "rheinland-pfalz",
    "key": "rheinland-pfalz-basis",
    "geography_id": "geo-land-rheinland-pfalz",
    "parliament_name": "Landtag Rheinland-Pfalz / OPAL",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Rheinland-Pfalz / OPAL","url":"https://landtag-rlp.de/de/parlament/parlamentsdokumente/opal.htm","role":"official_primary","state":"prepared","method":null,"documentation":"https://opal.rlp.de/","note":"OPAL dokumentiert Drucksachen, Plenarprotokolle und neuere öffentliche Ausschussunterlagen als PDF; API/RSS nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Rheinland-Pfalz","url":"https://www.rlp.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"SWR Aktuell Rheinland-Pfalz","url":"https://www.swr.de/swraktuell/rheinland-pfalz/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Rhein-Zeitung","url":"https://www.rhein-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Die Rheinpfalz","url":"https://www.rheinpfalz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Rheinland-Pfalz","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "SL",
    "bundesland": "Saarland",
    "slug": "saarland",
    "key": "saarland-basis",
    "geography_id": "geo-land-saarland",
    "parliament_name": "Landtag des Saarlandes",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag des Saarlandes","url":"https://www.landtag-saar.de/dokumente/","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag-saar.de/dokumente/","note":"Offizielle Suchoberfläche für Drucksachen, Plenarprotokolle, Gesetze, Anhörungen und Vorgänge; API/RSS nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Saarland","url":"https://www.saarland.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"SR","url":"https://www.sr.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Saarbrücker Zeitung","url":"https://www.saarbruecker-zeitung.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Saarland","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "SN",
    "bundesland": "Sachsen",
    "slug": "sachsen",
    "key": "sachsen-basis",
    "geography_id": "geo-land-sachsen",
    "parliament_name": "Sächsischer Landtag / EDAS",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Sächsischer Landtag / EDAS","url":"https://redas.landtag.sachsen.de/redas/","role":"official_primary","state":"prepared","method":null,"documentation":"https://ts.landtag.sachsen.de/de/parlament/aufgaben/gesetze-9198.cshtml","note":"Offizielle Erläuterungsseite verweist auf EDAS; EDAS im Recherchetool ohne lesbare Ausgabe; API/RSS nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Sachsen","url":"https://www.sachsen.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"MDR Sachsen","url":"https://www.mdr.de/nachrichten/sachsen/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Sächsische Zeitung","url":"https://www.saechsische.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Leipziger Volkszeitung","url":"https://www.lvz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Freie Presse","url":"https://www.freiepresse.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Sachsen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "ST",
    "bundesland": "Sachsen-Anhalt",
    "slug": "sachsen-anhalt",
    "key": "sachsen-anhalt-basis",
    "geography_id": "geo-land-sachsen-anhalt",
    "parliament_name": "Landtag Sachsen-Anhalt / PADOKA",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Landtag Sachsen-Anhalt / PADOKA","url":"https://www.landtag.sachsen-anhalt.de/dokumente/neue-doku","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag.sachsen-anhalt.de/2018/dokumentensuche-nun-noch-leichter/","note":"PADOKA und Suchabos; RSS-Möglichkeit durch historischen amtlichen Hinweis belegt, aktuelle Schnittstelle nicht getestet; aktuelle RSS-Übersichtsseite liefert keine belastbare Feed-Dokumentation"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Sachsen-Anhalt","url":"https://www.sachsen-anhalt.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"MDR Sachsen-Anhalt","url":"https://www.mdr.de/nachrichten/sachsen-anhalt/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Mitteldeutsche Zeitung","url":"https://www.mz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Volksstimme","url":"https://www.volksstimme.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Sachsen-Anhalt","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "SH",
    "bundesland": "Schleswig-Holstein",
    "slug": "schleswig-holstein",
    "key": "schleswig-holstein-basis",
    "geography_id": "geo-land-schleswig-holstein",
    "parliament_name": "Schleswig-Holsteinischer Landtag / ParlaFeed",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Schleswig-Holsteinischer Landtag / ParlaFeed","url":"https://www.landtag.ltsh.de/aktuelles/parlafeed/","role":"official_primary","state":"prepared","method":null,"documentation":"https://www.landtag.ltsh.de/aktuelles/parlafeed/","note":"Offizielle RSS für Drucksachen, Anfragen/Antworten, Plenum und öffentliche Ausschussdokumente; getrennte Fraktionsfeeds"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Schleswig-Holstein","url":"https://www.schleswig-holstein.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"NDR Schleswig-Holstein","url":"https://www.ndr.de/nachrichten/schleswig-holstein/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Kieler Nachrichten","url":"https://www.kn-online.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"sh:z","url":"https://www.shz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Schleswig-Holstein","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  },
  {
    "code": "TH",
    "bundesland": "Thüringen",
    "slug": "thueringen",
    "key": "thueringen-basis",
    "geography_id": "geo-land-thueringen",
    "parliament_name": "Thüringer Landtag",
    "status": "prepared",
    "candidates": [
      {"classes":["landesparlament","plenum","ausschuesse","drucksachen","schriftliche_anfragen","gesetzgebung"],"name":"Thüringer Landtag","url":"https://suche.thueringer-landtag.de/","role":"official_primary","state":"prepared","method":null,"documentation":"https://parldok.thueringer-landtag.de/","note":"Offizielles Rechercheportal erschließt Parlamentsdokumentation und Beteiligungstransparenz; API/RSS nicht belegt"},
      {"classes":["landesregierung","staatskanzlei","ministerien"],"name":"Landesregierung / Senat Thüringen","url":"https://www.thueringen.de/","role":"official_primary","state":"prepared","method":null,"note":"Angebotskandidat; konkrete Ressortabdeckung und abrufbare Inhalte noch zu belegen."},
      {"classes":["oer_landesberichterstattung"],"name":"MDR Thüringen","url":"https://www.mdr.de/nachrichten/thueringen/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Thüringer Allgemeine","url":"https://www.thueringer-allgemeine.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Ostthüringer Zeitung","url":"https://www.otz.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["regionale_leitmedien"],"name":"Freies Wort","url":"https://www.insuedthueringen.de/","role":"journalistic","state":"prepared","method":null,"rights":"needs_review","note":"Auswahlkandidat; keine Feed-/Volltext- oder Nutzungsrechtsfreigabe."},
      {"classes":["landesfraktionen"],"name":"Fraktionen Thüringen","url":null,"role":"direct_interest","state":"unbesetzt","method":null,"note":"Je tatsächlich vertretener Fraktion gleichwertig anbinden; nicht aus historischen Namenslisten ableiten."},
      {"classes":["kommunales","fachquellen","akteurspositionen"],"name":"Mandatsbezogene Ergänzungen","url":null,"role":null,"state":"unbesetzt","method":null,"note":"Nach belegter Region, Fachzuständigkeit und Akteursbezug auswählen. Kein pauschaler landesweiter Crawlauftrag."}
    ]
  }
].map((land) => ({ ...land, source_prefix: land.code === "RP" ? "rlp" : land.code.toLowerCase(), required_classes: [...REQUIRED_CLASSES], demand_classes: [...DEMAND_CLASSES] }));

const VERIFIED_INPUTS = [
  {"code":"BW","key":"509930","name":"Neue Drucksachen","url":"https://www.landtag-bw.de/blueprint/servlet/service/rss/de/509930/feed.rss","classes":["drucksachen"],"method":"rss"},
  {"code":"BW","key":"509986","name":"Plenarprotokolle","url":"https://www.landtag-bw.de/blueprint/servlet/service/rss/de/509986/feed.rss","classes":["plenum"],"method":"rss"},
  {"code":"BW","key":"509988","name":"Pressemitteilungen","url":"https://www.landtag-bw.de/blueprint/servlet/service/rss/de/509988/feed.rss","classes":["landesparlament"],"method":"rss"},
  {"code":"BY","key":"gesetzentwuerfe","name":"Gesetzentwürfe","url":"https://www.bayern.landtag.de/webangebot3/views/rssfeed/rssfeed.xhtml?art=GESETZ&titel=Drucksachen+von+Gesetzentw%C3%BCrfen","classes":["gesetzgebung","drucksachen"],"method":"rss"},
  {"code":"BY","key":"antraege","name":"Anträge","url":"https://www.bayern.landtag.de/webangebot3/views/rssfeed/rssfeed.xhtml?art=ANTRAG_EUVORHABEN&titel=Drucksachen+von+Antr%C3%A4gen+und+Europaangelegenheiten","classes":["drucksachen"],"method":"rss"},
  {"code":"BY","key":"anfragen","name":"Schriftliche Anfragen","url":"https://www.bayern.landtag.de/webangebot3/views/rssfeed/rssfeed.xhtml?art=ANFRAGE&titel=Drucksachen+von+Anfragen","classes":["schriftliche_anfragen","drucksachen"],"method":"rss"},
  {"code":"BY","key":"plenarprotokolle","name":"Plenarprotokolle","url":"https://www.bayern.landtag.de/webangebot3/views/rssfeed/rssfeed.xhtml?protokoll=&titel=Plenarprotokolle","classes":["plenum"],"method":"rss"},
  {"code":"BE","key":"presse","name":"Pressemitteilungen","url":"https://www.parlament-berlin.de/rss/meldungen","classes":["landesparlament"],"method":"rss"},
  {"code":"BE","key":"anfragen","name":"Schriftliche Anfragen","url":"https://www.parlament-berlin.de/rss/anfragen","classes":["schriftliche_anfragen"],"method":"rss","limitations":"Feed enthält weiterhin Dokumente der WP19; nicht als ausschließlich WP20 kennzeichnen."},
  {"code":"BE","key":"pardok-wp20","name":"PARDOK, Wahlperiode 20","url":"https://www.parlament-berlin.de/opendata/pardok-wp20.xml","classes":["drucksachen","plenum","schriftliche_anfragen","gesetzgebung"],"method":"structured_download","wahlperiode":20,"pardokLand":"berlin","supersedesSourceId":"be-plenum","limitations":"Eigenständiger WP20-Pfad. WP19 bleibt historisch unverändert. 3/20 Stichproben waren Platzhalter; strukturierter Adapter bleibt separat freigabepflichtig."},
  {"code":"BB","key":"presse","name":"Pressemitteilungen","url":"https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_d","classes":["landesparlament"],"method":"rss"},
  {"code":"BB","key":"meldungen","name":"Aktuelle Meldungen","url":"https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_meldungen_d","classes":["landesparlament"],"method":"rss"},
  {"code":"BB","key":"gesetze","name":"Beschlossene Gesetze","url":"https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_beschlossene_gesetze_d","classes":["gesetzgebung"],"method":"rss"},
  {"code":"BB","key":"plenum","name":"Termine und Tagesordnungen des Plenums","url":"https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_termine_d&type=bb1.c.267951.de","classes":["plenum"],"method":"rss","dateSemantics":"event","limitations":"pubDate ist Terminzeit, kein Veröffentlichungsdatum; Ereignisadapter vor Freigabe prüfen."},
  {"code":"BB","key":"ausschuesse","name":"Termine und Tagesordnungen der Ausschüsse","url":"https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_termine_d&type=bb1.c.267952.de","classes":["ausschuesse"],"method":"rss","dateSemantics":"event","limitations":"pubDate ist Terminzeit, kein Veröffentlichungsdatum; Ereignisadapter vor Freigabe prüfen."},
  {"code":"NI","key":"presse","name":"Pressemitteilungen","url":"https://www.landtag-niedersachsen.de/rss/presse.xml","classes":["landesparlament"],"method":"rss"},
  {"code":"NI","key":"drucksachen","name":"Drucksachen","url":"https://www.landtag-niedersachsen.de/rss/drucksachen.xml","classes":["drucksachen"],"method":"rss"},
  {"code":"NI","key":"kurzberichte_plenum","name":"Kurzberichte des Plenums","url":"https://www.landtag-niedersachsen.de/rss/kurzberichte_plenum.xml","classes":["plenum"],"method":"rss"},
  {"code":"NI","key":"stenoberichte","name":"Stenografische Berichte","url":"https://www.landtag-niedersachsen.de/rss/stenoberichte.xml","classes":["plenum"],"method":"rss"},
  {"code":"NI","key":"tagesordnungen_plenarsitzungen","name":"Tagesordnungen des Plenums","url":"https://www.landtag-niedersachsen.de/rss/tagesordnungen_plenarsitzungen.xml","classes":["plenum"],"method":"rss"},
  {"code":"NI","key":"wochenuebersichten","name":"Wochenübersichten","url":"https://www.landtag-niedersachsen.de/rss/wochenuebersichten.xml","classes":["plenum","ausschuesse"],"method":"rss"},
  {"code":"NI","key":"kurzberichte_ausschuesse","name":"Kurzberichte der Ausschüsse","url":"https://www.landtag-niedersachsen.de/rss/kurzberichte_ausschuesse.xml","classes":["ausschuesse"],"method":"rss"},
  {"code":"NI","key":"niederschriften_ausschuesse","name":"Niederschriften der Ausschüsse","url":"https://www.landtag-niedersachsen.de/rss/niederschriften_ausschuesse.xml","classes":["ausschuesse"],"method":"rss"},
  {"code":"NI","key":"tagesordnungen_ausschuesse","name":"Tagesordnungen der Ausschüsse","url":"https://www.landtag-niedersachsen.de/rss/tagesordnungen_ausschuesse.xml","classes":["ausschuesse"],"method":"rss"},
  {"code":"NI","key":"gesetzesmaterialien","name":"Gesetzesmaterialien","url":"https://www.landtag-niedersachsen.de/rss/gesetzesmaterialien.xml","classes":["gesetzgebung"],"method":"rss"},
  {"code":"NW","key":"parlament","name":"Parlamentsmeldungen","url":"https://www.landtag.nrw.de/home/aktuelles/meldungen-und-berichte/rss-newsfeed/rss-feed/contentArea/meldungen-rss-feed.xml","classes":["landesparlament"],"method":"rss","limitations":"RSS-Datumsfeld ist kein Beleg für das Erstellungsdatum des verlinkten Dokuments."},
  {"code":"HE","key":"landwirtschaft-presse","name":"Pressemitteilungen Landwirtschaft","publisher":"Hessisches Ministerium für Landwirtschaft und Umwelt","url":"https://landwirtschaft.hessen.de/Presse-Feed/all","classes":["ministerien"],"method":"rss","type":"government","limitations":"Nur dieses Ressort; kein Nachweis vollständiger Ministerienabdeckung. TT.MM.JJJJ wird kalendergenau in ISO-Datum normalisiert."},
  {"code":"HE","key":"staatskanzlei-presse","name":"Pressemitteilungen Staatskanzlei","publisher":"Hessische Staatskanzlei","url":"https://staatskanzlei.hessen.de/Presse-Feed/all","classes":["staatskanzlei"],"method":"rss","type":"government"},
  {"code":"HE","key":"landesregierung-presse","name":"Pressemitteilungen Landesregierung","publisher":"Hessische Landesregierung","url":"https://hessen.de/Presse-Feed/all","classes":["landesregierung"],"method":"rss","type":"government","limitations":"Überschneidungen mit Staatskanzlei/Ressortfeed müssen bei späterer Aktivierung inhaltlich dedupliziert werden."},
  {"code":"SH","key":"regierung-presse","name":"Pressemitteilungen Landesregierung","publisher":"Landesregierung Schleswig-Holstein","url":"https://www.schleswig-holstein.de/DE/landesportal/service/RSS/RSS_PI_alle/RSSNewsfeed_PI_alle.xml","classes":["landesregierung","staatskanzlei","ministerien"],"method":"rss","type":"government","dateSemantics":"unavailable","limitations":"Feed liefert Titel und Originaladressen, aber KEIN Artikeldatum. Vor Produktfreigabe Datum aus Originalartikel belegen; kein Datum aus URL oder Abrufzeit erfinden."},
];

const LANDESQUELLEN = VERIFIED_INPUTS.map((input) => {
  const land = LANDESMODULE.find((entry) => entry.code === input.code);
  const receipt = LANDESQUELLEN_PRUEFBELEGE.find((entry) => entry.code === input.code && entry.key === input.key);
  const rss = input.method === "rss";
  return {
    id: land.source_prefix + (input.type === "government" ? "-regierung-" : "-landtag-") + input.key.replace(/_/g, "-"),
    name: (input.publisher || land.parliament_name) + " — " + input.name,
    type: input.type || "parliament", evidenceRole: "official_primary", url: input.url,
    crawlMethod: input.method, ...(rss ? { rssUrl: input.url, rssUrls: [input.url] } : {}),
    priority: 65, maxItems: 20, active: false, preparedOnly: true, lastCrawledAt: null,
    packageKeys: [land.key], regionalPaket: land.key, regionalKlasse: input.classes[0],
    covers: [...input.classes], landModule: land.slug, geographyId: land.geography_id,
    ...(input.wahlperiode ? { wahlperiode: input.wahlperiode, pardokLand: input.pardokLand, supersedesSourceId: input.supersedesSourceId } : {}),
    dateSemantics: input.dateSemantics || "publisher_date", limitations: input.limitations || null,
    publicationCadence: { status: "unknown", note: "Keine Veröffentlichungsfrequenz aus der Stichprobe abgeleitet." },
    sourceVerification: {
      status: receipt.result, checkedAt: receipt.checked_at, url: receipt.url,
      bodySha256: receipt.sha256, parser: receipt.parser,
      sampleItems: receipt.parsed, sampleDatedItems: receipt.dated,
      dateVerified: receipt.dated === receipt.parsed && receipt.parsed > 0,
      documentation: receipt.documentation, rights: "needs_review", activationApproved: false
    }
  };
});

// Jede Klasse bleibt separat sichtbar, auch wenn das Land noch keinen nutzbaren Adapter hat.
// RSS/Parserbeleg bedeutet nur vorbereitet; niemals "vollständig versorgt" oder "healthy".
for (const land of LANDESMODULE) {
  land.coverage = [...land.required_classes, ...land.demand_classes].map((klass) => {
    const sources = LANDESQUELLEN.filter((source) => source.landModule === land.slug && source.covers.includes(klass));
    const candidates = land.candidates.filter((candidate) => candidate.classes.includes(klass) && candidate.url);
    return {
      class: klass, state: sources.length ? "prepared_with_parser_receipt" : candidates.length ? "candidate_only" : "unbesetzt",
      source_ids: sources.map((source) => source.id), candidate_urls: candidates.map((candidate) => candidate.url)
    };
  });
}

function landesmodulByKey(value) {
  const key = String(value || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();
  return LANDESMODULE.find((land) => [land.key, land.slug, land.code.toLowerCase()].includes(key)) || null;
}

module.exports = { LANDESMODULE, LANDESQUELLEN, landesmodulByKey, REQUIRED_CLASSES, DEMAND_CLASSES };
