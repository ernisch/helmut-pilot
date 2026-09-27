# Auftragsgrenze7USD bei unveraendertem6USD-Tagesriegel

## Auftrag und Ausgangsbeleg

Ausdrueckliches Betreiber-GO27.09.2026:7USD insgesamt, weiterhin6USD taeglich.
Roadmap §3.4, notwendige Kostenabsicherung vor Fortsetzung der Versorgung.
Kein Budgetreset und keine Freigabe fuer Aktivierung oder500er Test.

Production06:57:22UTC: Auftrag `autonom-bis500-20260926`, Start25.09.,
Version2/6000000 Mikro-USD, externe Bindung4392289. Production-Tageskosten
25.09.433563,26.09.740570,27.09.21170 Mikro-USD; in diesen drei Tagen
keine offenen Reservierungen. Gesamtbindung5587592 Mikro-USD.
Historische Buecher vor dem Auftragsstart bleiben einschliesslich ihrer Reserven erhalten.

Ein bestaetigter Flash-High-Lauf fuer diesen lokalen Fix ist beendet.
Konservativ bleibt sein voller Rahmen200000 Mikro-USD zusaetzlich gebunden,
bis eine belastbare Abrechnung vorliegt. Neue externe Bindung4592289,
Gesamtbindung5787592, Rest bis7USD1212408 Mikro-USD. Kein Anbieterrechnungsbeleg.

## Begrenzte Production-Aktion nach Deployment

- Umgebung: Supabase Production `ddckuvvpcytqbyfmbvie`, nur `helmut_store/main-auth`.
- Aenderung: bestehender Auftrag auf bekanntes Paar Version3/7000000 setzen,
  externe Helferbindung von4392289 auf4592289 erhoehen und CAS-Revision erneuern.
- Wirkung: hoechstens7USD fuer denselben Gesamtauftrag; Tagesbuecher, Tagespolitik
  und6USD-Tagesriegel bleiben unveraendert. Bestehende Tickets werden nicht geloescht.
- Vorbedingungen: gepruefter Code nach gruener Pflicht-CI READY;500 inaktive Profile,
  501 Identitaeten, keine Jobs/Locks/Leases; exakter alter Auftrag und Auth-Vollhash.
- Risiko: eine falsche Version wuerde neue Modellaufrufe sperren. Die Umstellung
  sperrt die Auth-Zeile, vergleicht den vollstaendigen Rest und bricht bei Abweichung ab.
- Nachkontrolle: eigene Ruecklesung von Auftrag, allen Kostenbuechern, Profilvollhashes
  und Betriebsruhe; lokale Reservierungsprobe gegen die gelesene Kostenprojektion.
- Rueckweg: bei Fehler vor Commit gesamte Transaktion zurueckrollen. Nach Commit
  nur Version2/6000000 wiederherstellen, falls Gesamtbindung weiterhin<=6USD;
  sonst Modellstopp erhalten. Verbrauch und Reserven niemals fuer den Rueckweg senken.

Profilschutz06:59:19UTC: Mandatsvollhash
`4d1845ad49d3da71cb98b34ad5d9c5ac20ab7d07e46a3dc3496977fac1ee79af`,
Identitaetsvollhash
`f10056df9f3b580661f0d6d260b99495b530a46b6bf5cf68df500da2109943e6`.

## Lokale Abnahme

Version1/4USD strikt und Version2/6USD inklusive bleiben gueltig wie bisher.
Version3/7USD ist ein weiteres festes Paar, keine frei waehlbare Budgetzahl.
Gezielte Budgetpruefung: exakte Grenze, Ueberschreitung ohne Mutation,
ungueltige Paare, parallele Reservierungen gegen6USD Tageslimit und
Tageswechsel mit unveraenderten alten Reserven. Kein kostenpflichtiger Modelltest.

Technische Production-Umstellung und Deployment-Nachkontrolle noch ausstehend.
