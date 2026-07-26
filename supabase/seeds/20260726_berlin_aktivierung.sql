-- Helmut — Berlin-Aktivierung · STILLGELEGTE SAMMELDATEI (führt NICHTS aus)
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Diese Datei enthielt bis 2026-07-26 Block A, B1, Stufe 1 und Stufe 2 — Block B sogar in
-- EINER Transaktion. Wer sie am Stück ausführte, schaltete alle 4 Berliner Wege auf einmal
-- scharf, inklusive der beiden Google-News-Wege, die bewusst einen vollen Crawl-Zyklus
-- später kommen sollten (Befund V-1). Die Staffelung bestand nur aus einer Kommentarzeile.
--
-- Sie mutiert jetzt NICHTS und bricht ab. Die Ausführung läuft über 8 Einzeldateien:
--   1) 20260726_berlin_aktivierung_a_neutralisierung.sql
--   2) 20260726_berlin_aktivierung_b1_paketstatus.sql
--   3) 20260726_berlin_aktivierung_b2_stufe1.sql
--   4) 20260726_berlin_aktivierung_b2_stufe2.sql
--   5) 20260726_berlin_aktivierung_b2_stufe1_rollback.sql
--   6) 20260726_berlin_aktivierung_b2_stufe2_rollback.sql
--   7) 20260726_berlin_aktivierung_rollback.sql
--   8) 20260726_berlin_aktivierung_rollback_vollstaendig.sql

do $$
begin
  raise exception 'STILLGELEGT: diese Sammeldatei aktiviert nichts mehr (Befund V-1). Einzelschritte in der Reihenfolge %, %, %, % ausfuehren — Stufe 2 erst nach belegter Stufe 1.',
    '20260726_berlin_aktivierung_a_neutralisierung.sql', '20260726_berlin_aktivierung_b1_paketstatus.sql', '20260726_berlin_aktivierung_b2_stufe1.sql', '20260726_berlin_aktivierung_b2_stufe2.sql';
end $$;
