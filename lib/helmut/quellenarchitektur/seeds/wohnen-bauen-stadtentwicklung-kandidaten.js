"use strict";

// Helmut — Quellenarchitektur · Pilot "wohnen-bauen-stadtentwicklung-bund":
// KANDIDATEN-Liste (Superset) offizieller Bund-Primaerquellen fuer die technische
// Verifikation. REINE DATEN — kein Netz, keine KI, kein Storage-Write.
//
// Herkunft der URLs: AUSSCHLIESSLICH reale WebSearch-Ergebnisse (Titel/Link/Snippet),
// dokumentiert im Rechercheprotokoll. KEINE aus Namensmustern abgeleiteten URLs.
// Die HTTP-Erreichbarkeit/Inhaltspassung wird NICHT hier behauptet, sondern durch den
// separaten CI-Lauf (scripts/wohnen-bauen-stadtentwicklung-verify.js auf einem Runner
// mit offenem Egress) real geprueft — die Sandbox blockt Egress (nur nicht_verifizierbar).
//
// `method` ist die DB-/Probe-Methode (rss|api|html|googlenews_search|structured_download).
// `aufnahme_absicht` ist die VOR-Verifikations-Absicht (pflichtkern|referenz|ablehnung_erwartet)
// — die ENDGUELTIGE Auswahl trifft die fachliche Bewertung NACH der echten CI-Verifikation.
//
// Scope: Bundesebene, Geography Deutschland. NICHT: Berlin/Brandenburg, Verbaende,
// Unternehmen, Medien, Google News. Bestand-Abgleich siehe `dubletten_hinweis`.

const WBSB_KANDIDATEN = [
  // ---- BMWSB — Bundesministerium fuer Wohnen, Stadtentwicklung und Bauwesen ----
  {
    key: "bmwsb-presse", publisher: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen",
    domain: "bmwsb.bund.de", quellenrolle: "Pressemitteilungen-Liste des zuständigen Bundesministeriums",
    url: "https://www.bmwsb.bund.de/DE/tools-services/presse/pressemitteilungen/pressemitteilungen_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Primärquelle der Bau-/Wohnungs-/Stadtentwicklungspolitik des Bundes (Ressort BMWSB): amtliche Pressemitteilungen zu Gesetzentwürfen, Förderprogrammen, Ministerentscheidungen.",
    dubletten_hinweis: "keine (Bestand hat nur committee-bau-wohnen Google-News in bund-basis; kein BMWSB-Herausgeber)",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "bmwsb-rssfeed", publisher: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen",
    domain: "bmwsb.bund.de", quellenrolle: "RSS-Newsfeed-Übersicht (verweist auf die abonnierbaren Feed-Adressen)",
    url: "https://www.bmwsb.bund.de/DE/tools-services/rssfeed/rss.html",
    method: "rss", retrieval_type: "rss", update_character: "laufend",
    fachliche_begruendung: "Maschinenlesbarer Meldungsfeed des BMWSB — bevorzugter Abrufweg, falls die konkrete .xml-Feed-Adresse aufgelöst werden kann.",
    dubletten_hinweis: "inhaltliche Überschneidung mit bmwsb-presse möglich",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "bmwsb-meldungen", publisher: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen",
    domain: "bmwsb.bund.de", quellenrolle: "Aktuelle-Meldungen-Liste des Ministeriums",
    url: "https://www.bmwsb.bund.de/DE/ministerium/aktuelle-meldungen/aktuelle-meldungen_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Redaktionelle Meldungsrubrik des BMWSB (ergänzend zu Pressemitteilungen).",
    dubletten_hinweis: "teilweise Überschneidung mit bmwsb-presse",
    aufnahme_absicht: "referenz"
  },
  {
    key: "bmwsb-publikationen", publisher: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen",
    domain: "bmwsb.bund.de", quellenrolle: "Publikationen-Liste (Broschüren, Studien, Handlungsstrategien)",
    url: "https://www.bmwsb.bund.de/DE/tools-services/publikationen/publikationen_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Amtliche Publikationen/Strategien des Bundesbauministeriums (z. B. Wohnungsbau-Offensive, Stadtentwicklungsbericht).",
    dubletten_hinweis: "keine",
    aufnahme_absicht: "referenz"
  },
  {
    key: "bmwsb-foerderung-wohnen", publisher: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen",
    domain: "bmwsb.bund.de", quellenrolle: "Förderprogramme Wohnen (Wohnraumförderung, sozialer Wohnungsbau)",
    url: "https://www.bmwsb.bund.de/DE/wohnen/foerderprogramme-bmwsb/foerderprogramme-bmwsb_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Ressorteigene Übersicht der Wohnraumförderprogramme des Bundes (sozialer Wohnungsbau, Wohngeld, Neubauförderung).",
    dubletten_hinweis: "Überschneidung mit foerderdatenbank-bmwsb möglich",
    aufnahme_absicht: "referenz"
  },

  // ---- BBSR — Bundesinstitut fuer Bau-, Stadt- und Raumforschung ----
  // FACHREVIEW 2026-07-24: Erst-URLs lieferten 404. Runner-Verifikation (Run 30097099429):
  // /presse/presseinformationen + /veroeffentlichungen = HTTP 200 (verifiziert);
  // /Aktuell/aktuell.html = 404; RSS-Hub -> 404. -> Presseinformationen ist die Pflichtkern-URL.
  {
    key: "bbsr-presseinformationen", publisher: "Bundesinstitut für Bau-, Stadt- und Raumforschung",
    domain: "bbsr.bund.de", quellenrolle: "Presseinformationen des BBSR (aktuelle Forschungsergebnisse/Datenveröffentlichungen)",
    url: "https://www.bbsr.bund.de/BBSR/DE/presse/presseinformationen/_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Zentrale Ressortforschung Wohnungsmarkt/Stadtentwicklung/Raumbeobachtung — Frühindikator. Vom Auditor ausdrücklich vermisst (Fachreview §2). Runner 30097099429: HTTP 200.",
    dubletten_hinweis: "keine (thematische Nähe zu bbr-presse — gleiche Behördenfamilie, getrennte Rollen)",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "bbsr-veroeffentlichungen", publisher: "Bundesinstitut für Bau-, Stadt- und Raumforschung",
    domain: "bbsr.bund.de", quellenrolle: "Veröffentlichungen (fortlaufende Liste neu erschienener BBSR-Publikationen)",
    url: "https://www.bbsr.bund.de/BBSR/DE/veroeffentlichungen/_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Laufende Publikationsliste des BBSR. Runner 30097099429: HTTP 200 (verifizierte Alternative zu Presseinformationen).",
    dubletten_hinweis: "Überschneidung mit bbsr-presseinformationen möglich",
    aufnahme_absicht: "referenz"
  },
  {
    key: "bbsr-aktuell", publisher: "Bundesinstitut für Bau-, Stadt- und Raumforschung",
    domain: "bbsr.bund.de", quellenrolle: "Aktuelles/Meldungen-Überblick der Ressortforschung",
    url: "https://www.bbsr.bund.de/BBSR/DE/Aktuell/aktuell.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Aktuelle Meldungen der Ressortforschung — thematisch passend, aber Adresse instabil.",
    dubletten_hinweis: "Runner 30097099429: HTTP 404 (Groß-/Kleinschreibung/Umzug) -> NICHT aufgenommen; stattdessen bbsr-presseinformationen (200).",
    aufnahme_absicht: "ablehnung_erwartet"
  },
  {
    key: "bbsr-rss-hub", publisher: "Bundesinstitut für Bau-, Stadt- und Raumforschung",
    domain: "bbsr.bund.de", quellenrolle: "RSS-Newsfeed-Übersicht (GSB-Feed-Hub — konkrete .xml-Feed-URL am Runner aufzulösen)",
    url: "https://www.bbsr.bund.de/BBSR/DE/Service/RSS/rssnewsfeed_node.html",
    method: "rss", retrieval_type: "rss", update_character: "laufend",
    fachliche_begruendung: "Bevorzugte Zielmethode (RSS). GSB-Sites exponieren echte Feeds unter /SiteGlobals/Functions/RSSFeed/….",
    dubletten_hinweis: "Runner 30097099429: 404 (Redirect auf /service/rss/_node.html). Feed-URL/Case aus Produktions-Infra klären; Alternative IDW-Feed idw-online.de/de/institution957.",
    aufnahme_absicht: "referenz"
  },

  // ---- BBR — Bundesamt fuer Bauwesen und Raumordnung ----
  {
    key: "bbr-presse", publisher: "Bundesamt für Bauwesen und Raumordnung",
    domain: "bbr.bund.de", quellenrolle: "Pressemitteilungen-Liste des Bundesamtes",
    url: "https://www.bbr.bund.de/BBR/DE/presse/pressemitteilungen/pressemitteilungen_node_functional.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Amtliche Presseverlautbarungen des Bundesamtes für Bauwesen und Raumordnung (Bundesbau, Raumordnung).",
    dubletten_hinweis: "thematische Nähe zu BBSR (gleiche Behördenfamilie), aber eigener Herausgeber",
    aufnahme_absicht: "pflichtkern"
  },

  // ---- Destatis — Statistisches Bundesamt (Baukosten/Bautaetigkeit/Wohnungsmarkt) ----
  {
    key: "destatis-bautaetigkeit", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Tabellen-Übersicht Bautätigkeit (Baugenehmigungen/-fertigstellungen/Bauüberhang)",
    url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Bauen/Tabellen/_tabellen-innen-bautaetigkeit.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Amtliche Kernstatistik der Bautätigkeit — Frühindikator für Wohnungsbau-Zielerreichung und Baukonjunktur.",
    dubletten_hinweis: "Herausgeber Destatis existiert im Bestand (Publisher-Ebene); konkrete Tabellenliste neu",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "destatis-baugenehmigungen", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Tabellen Baugenehmigungen im Hochbau",
    url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Bauen/Tabellen/baugenehmigungen.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Baugenehmigungen als vorlaufender Indikator der Bautätigkeit.",
    dubletten_hinweis: "in destatis-bautaetigkeit-Übersicht enthalten (Konsolidierung prüfen)",
    aufnahme_absicht: "referenz"
  },
  {
    key: "destatis-baupreisindex", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Konjunkturindikatoren Preisindizes für Bauwerke (Baupreisindex)",
    url: "https://www.destatis.de/DE/Themen/Wirtschaft/Konjunkturindikatoren/Preise/bpr110.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Baukosten/Baupreisentwicklung — direkter Bezug zum Auftragsthema 'Baukosten'.",
    dubletten_hinweis: "Herausgeber Destatis im Bestand; konkrete URL neu",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "destatis-wohnen-mieten", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Tabellenliste Wohnen (Mieten/Nettokaltmiete, Wohnkosten, Wohnsituation)",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Tabellen/_tabellen.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Amtliche Wohnungsmarkt-/Mietdaten — Grundlage für die Bewertung mietpolitischer Entwicklungen.",
    dubletten_hinweis: "Herausgeber Destatis im Bestand; konkrete URL neu",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "destatis-wohnungsbestand", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Tabellenliste Wohnungsbestand im Zeitvergleich",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Tabellen/liste-wohnungsbestand.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Wohnungsbestand/Wohnfläche — struktureller Kontext für Wohnungsbaupolitik.",
    dubletten_hinweis: "Herausgeber Destatis im Bestand; konkrete URL neu",
    aufnahme_absicht: "referenz"
  },
  {
    key: "destatis-wohngeld", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "Tabellenliste Wohngeld-Statistik",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Soziales/Wohngeld/Tabellen/_tabellen.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Wohngeld-Statistik — direkter Bezug zu Wohnraumförderung/sozialer Absicherung des Wohnens.",
    dubletten_hinweis: "Herausgeber Destatis im Bestand; konkrete URL neu",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "destatis-genesis-api", publisher: "Statistisches Bundesamt",
    domain: "destatis.de", quellenrolle: "GENESIS-Online REST-API (maschinelle Abfrage ALLER Bau-/Wohn-Zeitreihen)",
    url: "https://www-genesis.destatis.de/genesisWS/rest/2020/",
    method: "api", retrieval_type: "api", update_character: "periodisch",
    fachliche_begruendung: "Strukturierter Superset der amtlichen Bau-/Wohnungs-Statistiken — empfohlenes Aktivierungs-Upgrade (ersetzt HTML-Tabellen-Scrapes). REST-Basis dokumentiert (Webservice-Doku v5.1).",
    dubletten_hinweis: "Runner 30097099429: Basis-GET -> HTTP 404 (Redirect auf genesis.destatis.de). Echte Nutzung = POST + Methode + kostenfreier Token -> eigene Anbindung (analog DIP), NICHT als keyfreier Pflichtkern-Weg.",
    aufnahme_absicht: "referenz"
  },
  {
    key: "gii-toc", publisher: "Bundesamt für Justiz — Gesetze im Internet",
    domain: "gesetze-im-internet.de", quellenrolle: "Norm-Inhaltsübersicht gii-toc.xml (maschinenlesbarer XML-Index aller geltenden Bundesnormen)",
    url: "https://www.gesetze-im-internet.de/gii-toc.xml",
    method: "structured_download", retrieval_type: "structured_xml", update_character: "laufend",
    fachliche_begruendung: "Dokumentierte, exakte XML-URL (DTD /dtd/1.0/gii-toc.dtd) — strukturierte Änderungserkennung an BauGB/BauNVO/GEG/WoFG. Empfohlenes Upgrade aus Produktions-Infra.",
    dubletten_hinweis: "Runner 30097099429: Timeout 12s (gesetze-im-internet.de systematisch aus GitHub-Runnern unerreichbar — ALLE gii-* Kandidaten). Nur aus Produktions-Infra verifizierbar; NICHT im Pflichtkern.",
    aufnahme_absicht: "referenz"
  },

  // ---- recht.bund.de — Bundesgesetzblatt (Verkuendungsplattform des Bundes) ----
  {
    key: "bgbl-teil1-liste", publisher: "Bundesamt für Justiz — Verkündungsplattform des Bundes",
    domain: "recht.bund.de", quellenrolle: "Bundesgesetzblatt Teil I — chronologische Verkündungsliste",
    url: "https://www.recht.bund.de/de/bundesgesetzblatt/bgbl-1/bgbl-1_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Amtliche Verkündung neuer Bundesgesetze/-verordnungen (seit 2023 ausschließlich hier) — Primärquelle für in Kraft getretene Baugesetzgebung.",
    dubletten_hinweis: "keine",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "bgbl-rss", publisher: "Bundesamt für Justiz — Verkündungsplattform des Bundes",
    domain: "recht.bund.de", quellenrolle: "RSS-Feed-Hub für neue Verkündungen (BGBl Teil I/II)",
    url: "https://www.recht.bund.de/de/serviceseiten/rss/rss_node.html",
    method: "rss", retrieval_type: "rss", update_character: "laufend",
    fachliche_begruendung: "Maschinenlesbarer Feed neuer Verkündungen — bevorzugter Abrufweg für Gesetzgebungs-Frühwarnung.",
    dubletten_hinweis: "keine",
    aufnahme_absicht: "pflichtkern"
  },

  // ---- gesetze-im-internet.de — Bundesamt fuer Justiz / BMJ ----
  {
    key: "gii-aktualitaetendienst", publisher: "Bundesamt für Justiz — Gesetze im Internet",
    domain: "gesetze-im-internet.de", quellenrolle: "Aktualitätendienst — Liste neu eingestellter/geänderter Vorschriften (BGBl I, 6 Monate)",
    url: "https://www.gesetze-im-internet.de/aktuDienst.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Laufende Liste neuer/geänderter Bundesnormen — erkennt Änderungen an BauGB/BauNVO/WoFG/GEG etc. ohne Einzelgesetz-Polling.",
    dubletten_hinweis: "thematische Nähe zu bgbl-teil1-liste (recht.bund.de), aber konsolidierte Normen-Sicht",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "gii-baugb", publisher: "Bundesamt für Justiz — Gesetze im Internet",
    domain: "gesetze-im-internet.de", quellenrolle: "Baugesetzbuch (BauGB) — Inhaltsverzeichnis/Volltext",
    url: "https://www.gesetze-im-internet.de/bbaug/",
    method: "html", retrieval_type: "html_liste", update_character: "statisch",
    fachliche_begruendung: "Zentrales Bau- und Planungsrecht des Bundes — Referenz-Primärtext (ändert sich nur bei Novellen).",
    dubletten_hinweis: "Änderungen laufen über gii-aktualitaetendienst/BGBl",
    aufnahme_absicht: "referenz"
  },
  {
    key: "gii-baunvo", publisher: "Bundesamt für Justiz — Gesetze im Internet",
    domain: "gesetze-im-internet.de", quellenrolle: "Baunutzungsverordnung (BauNVO) — Inhaltsverzeichnis/Volltext",
    url: "https://www.gesetze-im-internet.de/baunvo/",
    method: "html", retrieval_type: "html_liste", update_character: "statisch",
    fachliche_begruendung: "Verordnung über die bauliche Nutzung der Grundstücke — Referenz-Primärtext.",
    dubletten_hinweis: "Änderungen laufen über gii-aktualitaetendienst/BGBl",
    aufnahme_absicht: "referenz"
  },
  {
    key: "gii-geg", publisher: "Bundesamt für Justiz — Gesetze im Internet",
    domain: "gesetze-im-internet.de", quellenrolle: "Gebäudeenergiegesetz (GEG) — Inhaltsverzeichnis/Volltext",
    url: "https://www.gesetze-im-internet.de/geg/",
    method: "html", retrieval_type: "html_liste", update_character: "statisch",
    fachliche_begruendung: "Energetische Anforderungen an Gebäude (Bau/Sanierung) — Referenz-Primärtext.",
    dubletten_hinweis: "Änderungen laufen über gii-aktualitaetendienst/BGBl",
    aufnahme_absicht: "referenz"
  },

  // ---- Deutscher Bundestag — Fachausschuss ----
  {
    key: "bundestag-bauausschuss", publisher: "Deutscher Bundestag — Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen",
    domain: "bundestag.de", quellenrolle: "Ausschuss-Seite (Sitzungen, Tagesordnungen, Anhörungen)",
    url: "https://www.bundestag.de/bau",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Parlamentarischer Fachausschuss für Wohnen/Bau/Stadtentwicklung — Ort der Gesetzesberatung und Anhörungen.",
    dubletten_hinweis: "topische Überschneidung mit bestehendem committee-bau-wohnen (Google-News) in bund-basis; parlamentarische Vorgänge zusätzlich via bestehender DIP-API (rp-dip)",
    aufnahme_absicht: "referenz"
  },

  // ---- Staedtebaufoerderung — Bund-Laender-Portal ----
  {
    key: "staedtebaufoerderung-start", publisher: "Städtebauförderung (Bund-Länder-Programm, BMWSB/BBSR)",
    domain: "staedtebaufoerderung.info", quellenrolle: "Startseite/Aktuelles des offiziellen Städtebauförderungsportals",
    url: "https://www.staedtebaufoerderung.info/DE/Startseite/startseite_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "Offizielles Bund-Länder-Portal der Städtebauförderung — Programmneuigkeiten, Verwaltungsvereinbarungen, Mittelverteilung.",
    dubletten_hinweis: "Überschneidung mit BMWSB-Stadtentwicklungsseiten möglich",
    aufnahme_absicht: "pflichtkern"
  },
  {
    key: "staedtebaufoerderung-programme", publisher: "Städtebauförderung (Bund-Länder-Programm, BMWSB/BBSR)",
    domain: "staedtebaufoerderung.info", quellenrolle: "Programme/Förderung (Lebendige Zentren, Sozialer Zusammenhalt, Wachstum/Erneuerung)",
    url: "https://www.staedtebaufoerderung.info/DE/Programme/WachstumNachhaltigeErneuerung/Foerderung/foerderung_node.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Konkrete Programmbeschreibungen der Städtebauförderung.",
    dubletten_hinweis: "Überschneidung mit staedtebaufoerderung-start",
    aufnahme_absicht: "referenz"
  },

  // ---- Foerderdatenbank des Bundes ----
  {
    key: "foerderdatenbank-bmwsb", publisher: "Förderdatenbank des Bundes",
    domain: "foerderdatenbank.de", quellenrolle: "Liste der BMWSB-Förderprogramme des Bundes (Fördergeber-Sicht)",
    url: "https://www.foerderdatenbank.de/FDB/Content/DE/Foerdergeber/B/bmwsb-bundesministerium_wohnen_stadtentw_bau.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "Amtliche Förderdatenbank des Bundes, gefiltert auf den Fördergeber BMWSB — neutrale, vollständige Sicht der Bundes-Förderprogramme Bauen/Wohnen/Städtebau.",
    dubletten_hinweis: "Überschneidung mit bmwsb-foerderung-wohnen (Ministeriums-eigene Liste)",
    aufnahme_absicht: "pflichtkern"
  },

  // ---- Bewusst mitgeprueft, fachliche Ablehnung erwartet (ehrliche HTTP-Belege) ----
  {
    key: "kfw-foerderprodukte-bestand", publisher: "KfW",
    domain: "kfw.de", quellenrolle: "Förderprodukte Bestandsimmobilie (energetische Sanierung, BEG)",
    url: "https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestandsimmobilie/F%C3%B6rderprodukte/F%C3%B6rderprodukte-f%C3%BCr-Bestandsimmobilien.html",
    method: "html", retrieval_type: "html_liste", update_character: "periodisch",
    fachliche_begruendung: "KfW setzt Bundesförderprogramme um; die Produktseiten sind jedoch Umsetzungs-/Marketingebene, keine politische Primärquelle.",
    dubletten_hinweis: "Förderlandschaft neutraler und vollständiger via foerderdatenbank-bmwsb abgedeckt",
    aufnahme_absicht: "ablehnung_erwartet"
  },
  {
    key: "bima-presse", publisher: "Bundesanstalt für Immobilienaufgaben",
    domain: "bundesimmobilien.de", quellenrolle: "Pressemeldungen der BImA",
    url: "https://www.bundesimmobilien.de/presse-7870570ee805a7cf",
    method: "html", retrieval_type: "html_liste", update_character: "laufend",
    fachliche_begruendung: "BImA verwaltet Bundesliegenschaften und baut bezahlbaren Wohnraum auf Bundesland — operative Umsetzungsebene, keine bau-/wohnungspolitische Primärquelle; zudem fragile Hash-URLs.",
    dubletten_hinweis: "keine",
    aufnahme_absicht: "ablehnung_erwartet"
  }
];

module.exports = { WBSB_KANDIDATEN };
