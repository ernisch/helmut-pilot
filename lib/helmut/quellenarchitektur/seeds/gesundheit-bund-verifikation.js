"use strict";

// Helmut — Quellenarchitektur · Quellenpaket GESUNDHEIT (Bund): Verifikations-Record.
//
// GROUND-TRUTH-RECORD in ZWEI GETRENNTEN EBENEN (Auftrag §5). Es werden bewusst NICHT
// vermischt: (1) fachlich/recherche-belegt und (2) technisch byte-genau geprüft.
//
//   EBENE 1 — RECHERCHE (belegt):   Domain existiert, erwartete Publikationsreihe existiert,
//     Feed-/API-Angebot ist auf der Herausgeber-Seite belegt. Quelle: WebSearch-Suchindex,
//     2026-07-24. Ergebnis je Kernquelle unten als `recherche`.
//   EBENE 2 — BYTE-GENAU (offen):   HTTP-Status, Redirect-Ziel, Content-Type, Feed-/XML-
//     Parsebarkeit, Paywall/Bot-Sperre, dauerhafte vs. sitzungsbezogene URL. Dies ist in
//     DIESER Sandbox NICHT durchführbar: der Egress-Proxy beantwortet JEDEN CONNECT mit 403
//     (Kontroll-Abruf example.com = 403, geprüft 2026-07-24). Byte-genaue Verifikation ist über
//     den etablierten offenen Egress-Runner (GitHub Actions, vgl. .github/workflows/sprint9b-verify.yml
//     + scripts/sprint9b-verify-abrufwege.js) nachzuholen und danach hier zu ergänzen.
//
// Ein einzelner 404/Timeout wäre "technisch noch nicht bestätigt", NICHT "fachlich ungeeignet"
// (Auftrag §5). Aktueller byte-Status ALLER Wege: "offen_sandbox_egress_gesperrt".

const VERIFIKATION_META = Object.freeze({
  datum: "2026-07-24",
  rechercheQuelle: "WebSearch-Suchindex (Sandbox-Egress fuer direkten Fetch gesperrt)",
  byteEbeneStatus: "offen",
  byteEbeneGrund: "Sandbox-Egress-Proxy blockt jeden CONNECT (example.com-Kontrolle = HTTP 403 am 2026-07-24).",
  byteEbeneMechanismus: "Offener Egress-Runner (GitHub Actions), Muster sprint9b-verify.yml / scripts/gesundheit-bund-verify.js.",
  kontrollabruf: { url: "https://example.com", http: 403, egressOffen: false }
});

// Schlüssel = legacy_source_id des Abrufwegs (seeds/gesundheit-bund-quellen.js).
// recherche.urteil: "belegt" | "belegt_mit_migrationsrisiko" | "teilbelegt".
// byte.urteil:      IMMER "offen" in dieser Sandbox (siehe VERIFIKATION_META).
const VERIFIKATION = Object.freeze({
  "gesbund-bmg-gesetzgebung": {
    recherche: { urteil: "belegt", beleg: "bundesgesundheitsministerium.de aktiv; RSS-Hub /service/rss-feed belegt; Gesetze/Verordnungen als eigene Rubrik." },
    byte: { urteil: "offen" }
  },
  "gesbund-bundesrat-gesundheit": {
    recherche: { urteil: "belegt", beleg: "bundesrat.de aktiv; Gesundheitsausschuss + Drucksachen/TOP belegt." },
    byte: { urteil: "offen" }
  },
  "gesbund-gba-beschluesse": {
    recherche: { urteil: "belegt", beleg: "g-ba.de Service-RSS mit konkreten Deep-Links: /beschluesse/letzte-aenderungen/?rss=1, /presse/.../letzte-aenderungen/?rss=1 (WebSearch bestätigt Feed-Struktur)." },
    byte: { urteil: "offen" }
  },
  "gesbund-rki-epidbull": {
    recherche: { urteil: "belegt_mit_migrationsrisiko", beleg: "rki.de aktiv; dedizierter Epidemiologisches-Bulletin-RSS im RKI-Feed-Hub belegt. ACHTUNG: Website 2024/25 migriert — alter Pfad Content/Infekt/EpidBull/epid_bull_node.html NICHT mehr gültig (leitet auf /DE/Aktuelles/Publikationen/...)." },
    byte: { urteil: "offen" }
  },
  "gesbund-destatis-genesis": {
    recherche: { urteil: "belegt", beleg: "destatis.de GENESIS-Online REST/Webservice-API belegt; Statistik 23611 (Gesundheitsausgabenrechnung) + Krankenhaus-Grunddaten/Kostennachweis als Statistischer Bericht (CSV) belegt. API benötigt Token." },
    byte: { urteil: "offen" }
  },
  "gesbund-gkv-spitzenverband": {
    recherche: { urteil: "teilbelegt", beleg: "gkv-spitzenverband.de Presse-/Statement-Seite belegt; E-Mail-Abo statt öffentlichem RSS-Deep-Link." },
    byte: { urteil: "offen" }
  },
  "gesbund-kbv-praxisnachrichten": {
    recherche: { urteil: "belegt", beleg: "kbv.de PraxisNachrichten (wöchentlich Do.) + Pressemitteilungen belegt." },
    byte: { urteil: "offen" }
  },
  "gesbund-dkg-positionen": {
    recherche: { urteil: "belegt", beleg: "dkgev.de Presse-Seite /dkg/presse/ belegt." },
    byte: { urteil: "offen" }
  },
  "gesbund-svr-gutachten": {
    recherche: { urteil: "teilbelegt", beleg: "svr-gesundheit.de aktiv; Gutachten-Reihe belegt, konkreter stabiler Download-Deep-Link/Feed offen." },
    byte: { urteil: "offen" }
  },
  "gesbund-bfarm-lieferengpaesse": {
    recherche: { urteil: "belegt", beleg: "bfarm.de Lieferengpass-Datenbank + RSS-Feed für den Bereich Lieferengpässe + Datenexport belegt; konkreter Feed-Deep-Link offen." },
    byte: { urteil: "offen" }
  },
  "gesbund-pei-sicherheit": {
    recherche: { urteil: "belegt", beleg: "pei.de Sicherheitsinformationen + Chargenprüfung + SiteGlobals-RSS belegt; konkreter Feed-Deep-Link offen." },
    byte: { urteil: "offen" }
  },
  "gesbund-iqwig-berichte": {
    recherche: { urteil: "belegt", beleg: "iqwig.de Berichte (Abschluss-/Vorbericht/Berichtsplan) + RSS/Atom belegt; konkreter Feed-Deep-Link offen." },
    byte: { urteil: "offen" }
  },
  "gesbund-baek-stellungnahmen": {
    recherche: { urteil: "belegt", beleg: "bundesaerztekammer.de Stellungnahmen zu Gesetzgebung/G-BA belegt." },
    byte: { urteil: "offen" }
  },
  "gesbund-pflegerat-stellungnahmen": {
    recherche: { urteil: "belegt", beleg: "deutscher-pflegerat.de Stellungnahmen/Positionspapiere belegt." },
    byte: { urteil: "offen" }
  }
});

module.exports = { VERIFIKATION, VERIFIKATION_META };
