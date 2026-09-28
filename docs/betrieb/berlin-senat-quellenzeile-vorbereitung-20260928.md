# Berliner Senatsquellenzeile: gesperrte Vorbereitung

**Stand:** 28.09.2026. Dieser Schritt bereitet ausschließlich `public.retrieval_paths.id = 'rp-be-landesregierung'` in Helmut-Production auf den bereits ausgerollten, eng gebundenen Berliner Senatsabruf vor. Er ist keine Landesfreigabe, kein Live-Crawl und kein 500er Test. Die Betreiberfreigabe für notwendige Production-Vorarbeiten bis zum Starttor steht in `AGENTS.md` und `autonom-bis-500-starttor-20260926.md`; Aktivierung und eigentlicher 500er Test bleiben gesondert gesperrt.

**Ausgeführt und nachkontrolliert:** 28.09.2026, 10:50 UTC. Der Vergleichs-Write änderte genau die gebundene Zeile. Die Nurleseprüfung ergab `method=html`, `url=https://www.berlin.de/presse/`, `query=NULL`, `parser=berlin-senatsquellen-kette-v1`, weiterhin `status=needs_review` und `activation_mode=manual`. `updated_at=2026-09-28 10:50:10.349879+00`. Der Fingerabdruck aller übrigen Zeilenfelder blieb `3c63c52af9e2e43d20cd79f224f23efa`. Weiterhin 500 Mandatsprofile, 0 aktiv; keine error/fatal-Runtime-Logs im geprüften Fenster 10:45–10:50:32 UTC. Der ausgerollte relationale Plan sperrt manuelle Wege ausdrücklich; zudem greift bei null aktiven Landesmandaten das Landesgate. Ein produktiver Artikelabruf oder sichtbarer Landesnachweis ist damit nicht erbracht.

## Geprüfter Vorzustand und Wirkung

Die rein lesende SQL-Gegenprobe am 28.09. zeigte genau eine Zeile mit `publisher_id=publisher-berlin.de`, `legacy_source_id=be-landesregierung`, `method=googlenews_search`, Google-News-URL und identischer `query`, `parser=googlenews-batchexecute`, `status=needs_review`, `activation_mode=manual`, `updated_at=2026-07-14 06:53:45.465576+00`. Keine andere Quellenzeile gehört zu diesem Schritt.

Nur `method`, `url`, `query` und `parser` wurden auf den bereits lokal geprüften amtlichen Portalweg umgestellt: `html`, `https://www.berlin.de/presse/`, `NULL`, `berlin-senatsquellen-kette-v1`; `updated_at` wurde dabei automatisch fortgeschrieben. Die neue Parserkennung bezeichnet den eingefrorenen Standvertrag; der ausgerollte Dispatch wählt **allein** anhand der exakt geprüften Pfadidentität, Methode und URL. `status=needs_review` und `activation_mode=manual` blieben unverändert. Insbesondere wurden weder `HELMUT_LANDESMODULE` noch Profile, Cron, sonstige Abrufwege oder Qualitätsgrenzen geändert. Bei 0 aktiven Mandatsprofilen bleibt zusätzlich das Landesmandatsgate geschlossen. Eine später separate Freigabe darf diese Sperren erst nach erneuter Prüfung des aktuellen Gesamtzustands ändern.

**Risiko:** Eine falsche Quellenkonfiguration könnte bei einer späteren Freigabe den Abruf verhindern oder den falschen Weg öffnen. Deshalb binden die unten stehenden Bedingungen Identität und vollständigen Altzustand, die neue Zeile bleibt manuell gesperrt, und der Code akzeptiert nur den festen amtlichen Host und Portalpfad. Es entstehen durch diesen Schritt keine Modellkosten; die einzelne Datenbankänderung nutzt vorhandene Infrastruktur.

## Anwendung nur nach frischer Gegenprobe

Vor Ausführung die Zeile, die Zahl aktiver Mandatsprofile, `main`, offene PRs und parallele Schreibarbeit erneut lesen. Stimmt ein Wert nicht, **nicht** anwenden; insbesondere `updated_at` nicht blind anpassen. Eine Transaktion muss genau eine Zeile ändern oder vollständig abbrechen:

```sql
begin;
do $$
declare geaendert integer;
begin
  if (select count(*) from public.mandate_profiles) <> 500
     or (select count(*) from public.mandate_profiles where aktiv is true) <> 0 then
    raise exception 'berlin-senat-vorbereitung: Profilbestand abgewichen';
  end if;
  update public.retrieval_paths
     set method = 'html',
         url = 'https://www.berlin.de/presse/',
         query = null,
         parser = 'berlin-senatsquellen-kette-v1',
         updated_at = now()
   where id = 'rp-be-landesregierung'
     and publisher_id = 'publisher-berlin.de'
     and legacy_source_id = 'be-landesregierung'
     and method = 'googlenews_search'
     and url = 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de'
     and query = 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de'
     and parser = 'googlenews-batchexecute'
     and status = 'needs_review'
     and activation_mode = 'manual'
     and updated_at = '2026-07-14 06:53:45.465576+00'::timestamptz;
  get diagnostics geaendert = row_count;
  if geaendert <> 1 then
    raise exception 'berlin-senat-vorbereitung: Vorzustand abgewichen';
  end if;
end $$;
commit;
```

Danach **nur lesend** genau diese Zeile, `count(*)`/aktive Profile, den Berlin-Ausschlussgrund im relationalen Plan sowie relevante Fehlerlogs prüfen. Erfolg heißt: `method=html`, feste Portal-URL, `query=NULL`, Parserkennung wie oben; alle übrigen Zeilenfelder außer dem bewusst aktualisierten `updated_at` und die Profiltabelle unverändert; `manual`/`needs_review` weiterhin gesetzt; kein Berliner Abruf im Production-Plan. Ein späterer sichtbarer Artikel wird hier ausdrücklich **nicht** behauptet.

## Rückweg

Wenn die neue Zeile abweicht oder unerwartet wirkt, den unten stehenden Rückweg nach frischer Nurleseprüfung und mit allen erwarteten Neuwerten als Vergleich in einer Transaktion ausführen. Bei einer zwischenzeitlichen Änderung der Zeile zuerst den Zustand neu untersuchen. Exakt eine geänderte Zeile verlangen; sonst vollständig abbrechen:

```sql
begin;
do $$
declare geaendert integer;
begin
  update public.retrieval_paths
   set method = 'googlenews_search',
       url = 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de',
       query = 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de',
       parser = 'googlenews-batchexecute',
       updated_at = now()
 where id = 'rp-be-landesregierung'
   and publisher_id = 'publisher-berlin.de'
   and legacy_source_id = 'be-landesregierung'
   and method = 'html'
   and url = 'https://www.berlin.de/presse/'
   and query is null
   and parser = 'berlin-senatsquellen-kette-v1'
   and status = 'needs_review'
   and activation_mode = 'manual'
   and updated_at = '2026-09-28 10:50:10.349879+00'::timestamptz;
  get diagnostics geaendert = row_count;
  if geaendert <> 1 then
    raise exception 'berlin-senat-rueckweg: Zustand abgewichen';
  end if;
end $$;
commit;
```

Der Rückweg ist eine konkrete Notfallanweisung, **kein** automatisch auszuführender zweiter Write. Die künftige aktive Berliner Landesversorgung und ihre sichtbare Ausgabe bleiben separate Starttor-Nachweise.
