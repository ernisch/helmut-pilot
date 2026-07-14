"use strict";

// Helmut — Neue Quellenarchitektur · Seed: Herausgeber-Namensregister (Domain -> kanonisch).
//
// Reine Daten. Loest die im Ist-Zustand vorhandenen 713 Freitext-source_name-Varianten
// ("Deutschlandfunk Politik" vs "Deutschlandfunk") deterministisch auf EINEN kanonischen
// Herausgeber pro Domain auf (Auftrag §7.1: ein Herausgeber existiert nur einmal).
//
// Nur Domains mit nicht-selbsterklaerendem Namen oder verknuepfter Entitaet sind hier
// gepflegt. Fuer alle uebrigen (v. a. Leitmedien) uebernimmt catalog.normalizePublisherName
// den bereinigten Katalognamen. entity_id verknuepft den Herausgeber mit der zentralen
// Entitaetsschicht (seeds/entities.js), wo eine politische Entitaet dahintersteht.

// Domain -> { name, entity_id?, type }  (type = Herausgebertyp, siehe model.PUBLISHER_TYPES)
const DOMAIN_PUBLISHERS = {
  // Offizielle Bundes-Institutionen
  "bundestag.de": { name: "Deutscher Bundestag", entity_id: "parliament-bundestag", type: "parliament" },
  "dip.bundestag.de": { name: "Deutscher Bundestag", entity_id: "parliament-bundestag", type: "parliament" },
  "bundesrat.de": { name: "Bundesrat", entity_id: "parliament-bundesrat", type: "parliament" },
  "bundesregierung.de": { name: "Bundesregierung", entity_id: "government-bund", type: "government" },
  "bmas.de": { name: "Bundesministerium für Arbeit und Soziales", entity_id: "ministry-bmas", type: "ministry" },
  "bundesgesundheitsministerium.de": { name: "Bundesministerium für Gesundheit", entity_id: "ministry-bmg", type: "ministry" },
  "bmfsfj.de": { name: "Bundesministerium für Familie, Senioren, Frauen und Jugend", entity_id: "ministry-bmfsfj", type: "ministry" },
  "bundesfinanzministerium.de": { name: "Bundesministerium der Finanzen", entity_id: "ministry-bmf", type: "ministry" },
  "arbeitsagentur.de": { name: "Bundesagentur für Arbeit", entity_id: "authority-bundesagentur-arbeit", type: "authority" },
  "statistik.arbeitsagentur.de": { name: "Bundesagentur für Arbeit — Statistik", entity_id: "authority-bundesagentur-arbeit", type: "authority" },
  "destatis.de": { name: "Statistisches Bundesamt", entity_id: "statoffice-destatis", type: "statistical_office" },
  "deutsche-rentenversicherung.de": { name: "Deutsche Rentenversicherung", entity_id: "authority-drv", type: "authority" },
  "bundesrechnungshof.de": { name: "Bundesrechnungshof", entity_id: "authority-bundesrechnungshof", type: "authority" },
  "iab.de": { name: "Institut für Arbeitsmarkt- und Berufsforschung", type: "authority" },
  "minijob-zentrale.de": { name: "Minijob-Zentrale", type: "authority" },
  "zoll.de": { name: "Zoll — Finanzkontrolle Schwarzarbeit", type: "authority" },

  // Parteien / Fraktionen (Bund)
  "die-linke.de": { name: "Die Linke", entity_id: "party-linke", type: "party" },
  "dielinkebt.de": { name: "Die Linke im Bundestag", entity_id: "group-bt-linke", type: "parliamentary_group" },
  "linksfraktion.de": { name: "Die Linke im Bundestag", entity_id: "group-bt-linke", type: "parliamentary_group" },
  "spd.de": { name: "SPD", entity_id: "party-spd", type: "party" },
  "spdfraktion.de": { name: "SPD-Bundestagsfraktion", entity_id: "group-bt-spd", type: "parliamentary_group" },
  "cdu.de": { name: "CDU", entity_id: "party-cdu", type: "party" },
  "cducsu.de": { name: "CDU/CSU-Bundestagsfraktion", entity_id: "group-bt-cdu-csu", type: "parliamentary_group" },
  "gruene.de": { name: "Bündnis 90/Die Grünen", entity_id: "party-gruene", type: "party" },
  "gruene-bundestag.de": { name: "Fraktion Bündnis 90/Die Grünen", entity_id: "group-bt-gruene", type: "parliamentary_group" },
  "fdpbt.de": { name: "FDP-Bundestagsfraktion", entity_id: "group-bt-fdp", type: "parliamentary_group" },
  "afdbundestag.de": { name: "AfD-Bundestagsfraktion", entity_id: "group-bt-afd", type: "parliamentary_group" },

  // Gewerkschaften / Verbaende
  "dgb.de": { name: "Deutscher Gewerkschaftsbund", entity_id: "union-dgb", type: "union" },
  "gegenblende.dgb.de": { name: "DGB — Gegenblende", entity_id: "union-dgb", type: "union" },
  "verdi.de": { name: "ver.di", entity_id: "union-verdi", type: "union" },
  "igmetall.de": { name: "IG Metall", entity_id: "union-ig-metall", type: "union" },
  "vdk.de": { name: "Sozialverband VdK", entity_id: "association-vdk", type: "association" },
  "sovd.de": { name: "Sozialverband Deutschland", entity_id: "association-sovd", type: "association" },
  "der-paritaetische.de": { name: "Der Paritätische Gesamtverband", entity_id: "association-paritaetischer", type: "association" },
  "caritas.de": { name: "Deutscher Caritasverband", entity_id: "association-caritas", type: "association" },
  "diakonie.de": { name: "Diakonie Deutschland", entity_id: "association-diakonie", type: "association" },
  "arbeitgeber.de": { name: "Bundesvereinigung der Deutschen Arbeitgeberverbände", entity_id: "association-bda", type: "association" },
  "bdi.eu": { name: "Bundesverband der Deutschen Industrie", entity_id: "association-bdi", type: "association" },
  "zdh.de": { name: "Zentralverband des Deutschen Handwerks", entity_id: "association-zdh", type: "association" },
  "wsi.de": { name: "Wirtschafts- und Sozialwissenschaftliches Institut", type: "association" },
  "boeckler.de": { name: "Hans-Böckler-Stiftung", type: "association" },
  "deutscher-verein.de": { name: "Deutscher Verein für öffentliche und private Fürsorge", type: "association" },
  "bertelsmann-stiftung.de": { name: "Bertelsmann Stiftung", type: "association" },

  // Leitmedien / oeffentlich-rechtlich (Domain -> kanonischer Medienname)
  "tagesschau.de": { name: "Tagesschau", type: "media" },
  "deutschlandfunk.de": { name: "Deutschlandfunk", type: "media" },
  "spiegel.de": { name: "Der Spiegel", type: "media" },
  "zeit.de": { name: "ZEIT Online", type: "media" },
  "sueddeutsche.de": { name: "Süddeutsche Zeitung", type: "media" },
  "faz.net": { name: "Frankfurter Allgemeine Zeitung", type: "media" },
  "handelsblatt.com": { name: "Handelsblatt", type: "media" },
  "welt.de": { name: "WELT", type: "media" },
  "taz.de": { name: "taz", type: "media" },
  "rnd.de": { name: "RedaktionsNetzwerk Deutschland", type: "media" },
  "zdfheute.de": { name: "ZDFheute", type: "media" },
  "ard.de": { name: "ARD", type: "media" },
  "table.media": { name: "Table.Media", type: "media" },
  "rbb24.de": { name: "rbb24", type: "media" },
  "tagesspiegel.de": { name: "Der Tagesspiegel", type: "media" },

  // Aggregator
  "news.google.com": { name: "Google News (Aggregator/Suchweg)", type: "aggregator" }
};

module.exports = { DOMAIN_PUBLISHERS };
