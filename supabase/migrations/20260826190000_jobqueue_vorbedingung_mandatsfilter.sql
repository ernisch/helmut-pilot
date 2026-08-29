-- Helmut — Vorbedingungszaehlung bekommt einen Mandatsfilter (Befund Z22, 2026-08-26)
-- ==============================================================================================
-- WARUM: `public.helmut_jobs_offen(p_fenster, p_typen)` zaehlt offene Auftraege ueber
-- AKTUALITAETSFENSTER und TYP — ohne jeden Mandatsbezug. Die Reihenfolgezusage
--   Abruf -> Verstehen -> Projektion -> Briefing
-- wurde damit UEBER ALLE MANDATE HINWEG erzwungen, obwohl nur ein Teil davon mandats-
-- uebergreifend gilt. Gemessen im Realistiknachweis Z3a (PR #272, Belegdatei
-- `docs/betrieb/z3-realistiknachweis-2026-08-26.md` §7/§10.5): ein einziges Mandat mit einem
-- dauerhaft nicht antwortenden persoenlichen Abrufweg verlaengerte den langsamsten Slot um
-- +93 % (5 Mandate) bzw. +9 % (100 Mandate) — bei voellig gesunden Fremdmandaten.
--
-- WELCHE REIHENFOLGE WIRKLICH GLOBAL IST — und welche nicht:
--
--   * GETEILTE Abrufe (`source_fetch` mit `tenant_id is null`) speisen ALLE Mandate
--     (`source-demand.js`: „GETEILTE Arbeit gehoert KEINEM Mandat"). Auf sie muss jedes
--     Mandat warten. BLEIBT GLOBAL.
--   * `document_understanding` traegt bauartbedingt IMMER `tenant_id is null`
--     (`scalable-pipeline.js`: „Ein Vorgang gehoert keinem Mandanten, auch dann nicht, wenn
--     ihn eine persoenliche Suche gefunden hat"). BLEIBT GLOBAL.
--   * PERSOENLICHE Abrufe (`source_fetch` mit `tenant_id = <mandat>`) sind die Namenssuche
--     GENAU EINES Mandats. Fuer ein Fremdmandat sind sie keine Vorbedingung.
--   * `mandate_projection` traegt immer ein Mandat und ist Vorbedingung des Briefings
--     DESSELBEN Mandats. Das Briefing von Mandat B hat mit der Projektion von Mandat A
--     nichts zu tun.
--
-- Die letzten beiden Punkte sind der Fehler. Er ist nicht fachlich gewollt, sondern
-- historisch: die Funktion entstand fuer die Fenster- und Typdimension, als Helmut faktisch
-- einen Mandanten hatte. Die Mandatsdimension hat gefehlt.
--
-- WAS DIESE MIGRATION TUT: sie ersetzt die zweistellige Funktion durch eine dreistellige mit
-- `p_mandat text default null`.
--   * `p_mandat` ist null oder nach dem Trimmen leer -> zaehlt wie bisher ueber ALLE
--     Mandate. Verhaltensgleich und auch an der SQL-Grenze fail closed.
--     Genau das ist der Rueckfall fuer Aufrufer ohne verwertbare Mandatskennung — mehr
--     warten ist immer die sichere Seite, nie weniger (fail closed).
--   * `p_mandat` gesetzt  -> zaehlt GLOBALE Arbeit PLUS die Arbeit GENAU DIESES Mandats.
--     Fremde mandatsgebundene Arbeit zaehlt nicht mehr mit. GLOBAL heisst dabei: die Zeile
--     traegt keinen brauchbaren Mandatsbezug — `tenant_id` ist null, leer oder besteht nur
--     aus Leerzeichen. Auch hier gilt fail closed in dieselbe Richtung: eine unbrauchbare
--     Kennung fuehrt zu MEHR Warten (die Zeile gilt fuer alle), nie zu weniger.
-- Der Vorgabewert haelt Altaufrufer mit zwei Argumenten lauffaehig; deshalb wird die
-- zweistellige Fassung im selben Transaktionsblock entfernt (sonst waere ein Aufruf mit
-- zwei Argumenten zwischen beiden Fassungen mehrdeutig: „function is not unique").
--
-- WAS SIE NICHT TUT: sie aendert NICHTS an der Zaehlmenge selbst. `offen` bleibt
-- `wartend + laeuft`; endgueltig gescheiterte Auftraege zaehlen weiterhin bewusst NICHT als
-- offen (sonst wartete ein Briefing ewig auf einen Abruf, den Google nie beantwortet).
-- Wiederholte, geleaste und zurueckgestellte Auftraege zaehlen unveraendert mit.
--
-- KEIN NEUER INDEX. `helmut_jobs_fenster_typ_idx (freshness_window, job_type, status)` traegt
-- die Abfrage weiterhin; `tenant_id` ist ein Nachvergleich auf der bereits eingegrenzten
-- Treffermenge. Lokal an PostgreSQL 17.6 gegengeprueft
-- (`scripts/vorbedingung-mandatsfilter-datenbank-test.js`).
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Idempotent (drop + create or replace).
-- DSGVO: liest ausschliesslich Zaehlstaende der eigenen Warteschlangentabelle — keine
-- Inhalte, keine personenbezogenen Daten. `tenant_id` ist eine Mandatskennung, kein Name.
-- Rollback: rollback_20260826190000_jobqueue_vorbedingung_mandatsfilter.sql
-- Voraussetzung: 20260808_jobqueue_abhaengigkeiten.sql ist eingespielt.

begin;

-- Die zweistellige Fassung muss weichen, damit der Aufruf mit zwei Argumenten eindeutig
-- bleibt. Sie kommt unten als Vorgabewert-Aufruf der dreistelligen Fassung zurueck.
drop function if exists public.helmut_jobs_offen(text[], text[]);

create or replace function public.helmut_jobs_offen(
  p_fenster text[] default null,
  p_typen   text[] default null,
  p_mandat  text   default null
)
returns table(
  offen            bigint,
  wartend          bigint,
  laufend          bigint,
  fehlgeschlagen   bigint,
  erledigt         bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where j.status in ('wartend','laeuft'))  as offen,
    count(*) filter (where j.status = 'wartend')              as wartend,
    count(*) filter (where j.status = 'laeuft')               as laufend,
    count(*) filter (where j.status = 'fehlgeschlagen')       as fehlgeschlagen,
    count(*) filter (where j.status = 'erledigt')             as erledigt
    from public.helmut_jobs j
   where (p_fenster is null or j.freshness_window = any(p_fenster))
     and (p_typen   is null or j.job_type = any(p_typen))
     -- MANDATSFILTER. Ohne `p_mandat` bleibt alles wie bisher. Mit `p_mandat` zaehlt
     -- globale Arbeit (kein Mandatsbezug) UND die Arbeit dieses einen Mandats.
     -- Eine Zeile OHNE brauchbaren Mandatsbezug ist systemweite Arbeit — sie wird KEINEM
     -- Mandat zugerechnet und gilt deshalb fuer alle.
     --
     -- LEERE KENNUNG AUF DER ZEILENSEITE (Korrektur 2026-08-28): `tenant_id` ist `text`
     -- ohne NOT-NULL und ohne Pruefbedingung (`20260808_scalable_job_queue.sql` Z. 111) —
     -- eine Zeile mit '' oder nur Leerzeichen ist also moeglich. Die Vorfassung pruefte nur
     -- `j.tenant_id is null` und HAT SIE DAMIT AUSGESCHLOSSEN: ein Mandat haette auf eine
     -- solche Zeile NICHT mehr gewartet, obwohl ihr Mandatsbezug unbrauchbar ist. Das ist
     -- die falsche Richtung — weniger warten ist nie die sichere Seite. Die Attrappe
     -- (`scripts/fixtures/jobqueue-speicher-treiber.js`) zaehlte sie bereits global; genau
     -- diese Abweichung zwischen SQL und Attrappe schliesst die Korrektur.
     --
     -- Auf BEIDEN Seiten wird getrimmt. Das kann nur MEHR Zeilen treffen als der frueher
     -- ungetrimmte Vergleich (jede vorher passende Zeile passt weiterhin) — fail closed.
     --
     -- WELCHE ZEICHEN GETRIMMT WERDEN, STEHT HIER AUSDRUECKLICH. `btrim(x)` mit EINEM
     -- Argument entfernt in PostgreSQL ausschliesslich das Leerzeichen U+0020 —
     -- `String.prototype.trim()` in der Attrappe entfernt dagegen JEDEN Weissraum. Ohne
     -- diese ausgeschriebene Zeichenmenge waeren die beiden Seiten bei einer `tenant_id`
     -- aus z. B. einem Tabulator wieder uneins: die Attrappe zaehlte global, SQL gar nicht
     -- — und SQL laege damit erneut auf der unsicheren Seite. Die Menge ist deshalb auf
     -- beiden Seiten dieselbe und wird auf beiden Seiten ausgeschrieben.
     and (
       nullif(btrim(p_mandat, E' \t\n\r\f\v'), '') is null
       or nullif(btrim(j.tenant_id, E' \t\n\r\f\v'), '') is null
       or btrim(j.tenant_id, E' \t\n\r\f\v') = btrim(p_mandat, E' \t\n\r\f\v')
     );
$$;

comment on function public.helmut_jobs_offen(text[], text[], text) is
  'OP-30/Z22: zaehlt offene/erledigte/fehlgeschlagene Auftraege ueber eine LISTE von Aktualitaetsfenstern, eine Typliste und OPTIONAL ein Mandat. Nur lesend. Ohne p_mandat oder mit einer nach dem Trimmen leeren Kennung verhaltensgleich zur zweistelligen Vorfassung (zaehlt alle Mandate). Mit p_mandat zaehlt sie globale Arbeit plus die Arbeit dieses Mandats — fremde mandatsgebundene Arbeit blockiert damit kein anderes Mandat mehr (Befund Z22). Global ist jede Zeile ohne brauchbaren Mandatsbezug: tenant_id null, leer oder nur Leerzeichen. Beide Seiten werden getrimmt; eine unbrauchbare Kennung fuehrt immer zu MEHR Warten, nie zu weniger (fail closed).';

-- Kein Browserzugriff (identische Zusage wie die Basistabelle und die Vorfassung).
revoke all on function public.helmut_jobs_offen(text[], text[], text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_offen(text[], text[], text) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select * from public.helmut_jobs_offen(array['2026-08-26T00Z'], array['source_fetch']);
--   select * from public.helmut_jobs_offen(array['2026-08-26T00Z'], array['source_fetch'], 'mandat-a');
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'helmut_jobs_offen';   -- erwartet: 1
