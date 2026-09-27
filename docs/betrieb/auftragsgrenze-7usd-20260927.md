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

Zwei bestaetigte Flash-High-Laeufe: Budgetfix beendet; Entwurf fuer den
Bereichseinzelauftrag nach ueberschrittener Vier-Minuten-Vorgabe gestoppt
und nicht uebernommen. Konservativ bleiben beide vollen Rahmen von je200000
Mikro-USD gebunden. Externe Bindung4792289, Gesamtbindung5987592,
Rest bis7USD1012408 Mikro-USD. Keine abschliessende Anbieterrechnung.
Die tatsaechliche Helferlaufzeit ist keine harte technische Kostenbegrenzung;
vor weiterer Delegation ist die offene Abrechnung zu beruecksichtigen.

## Begrenzte Production-Aktion nach Deployment

- Umgebung: Supabase Production `ddckuvvpcytqbyfmbvie`, nur `helmut_store/main-auth`.
- Aenderung: bestehender Auftrag auf bekanntes Paar Version3/7000000 setzen,
  externe Helferbindung von4392289 auf4792289 erhoehen und CAS-Revision erneuern.
  Die Helferbindung wurde vor dem zweiten Helferstart gesondert gesetzt;
  die anschliessende Grenzumstellung erhielt4792289 unveraendert.
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

## Production verifiziert27.09.2026

[PR641](https://github.com/ernisch/helmut-pilot/pull/641), gepruefter Kopf
`465065f1fec7c9176af9eb6b0120b3bb23ff7105`, beide Pflichtpruefungen erfolgreich
[CI36302141827](https://github.com/ernisch/helmut-pilot/actions/runs/36302141827).
Merge `c6100303df81b34c113e4a17091a2b7394ce883e`; gleiches Production-Deployment
[dpl_4dc36Nkx2rQcZ9imqUvJ4VvLfRFy](https://vercel.com/nohut/helmut-pilot/4dc36Nkx2rQcZ9imqUvJ4VvLfRFy)
READY. Begrenzte Fehlerlogabfrage07:17:00–07:18:05UTC ohne Treffer;
daraus folgt kein fachlicher Funktionsnachweis.

Beide SQL-Aenderungen zuerst mit ROLLBACK vollstaendig durchlaufen, dann
identisch mit COMMIT. Gesperrte Auth-Zeile, exakter Ausgangsvollhash,
Betriebsruhe und unveraenderte restliche Auth-Struktur wurden geprueft.
Unabhaengige Ruecklesung07:18:32UTC:

- Auftrag Version3/7000000, externe Bindung4792289 Mikro-USD.
- Alle Tagesbuecher25.–27.09. strukturell identisch zur Vorlesung.
  Tagesriegel27.09. weiterhin6000000; keine offenen Reservierungen dieser Tage.
- Gesamt5987592, frei1012408 Mikro-USD. Lokale echte Kostenformel bestaetigt:
  3000er Entwurf plus6000er Review reservieren436000 Mikro-USD und passen.
  Dies war nur eine lokale Rechenprobe, keine Productionreservierung.
-500 Mandatsprofile,0 aktiv,501 Identitaeten; beide oben genannten Vollhashes
  unveraendert;0 offene Jobs,0 lebende Locks/Leases.
- Auth-Vollhash danach:
  `a467da5bd9301a14314d22b8b9d8da9ddc0dc4fea282e4d2b656a95f3d0fc4a1`.

Keine Aktivierung, kein500er Test, kein kostenpflichtiger fachlicher Modellaufruf.
Fuehrende Sitzung GPT-6 (genaue Variante/Denkstufe nicht auslesbar), zwei lokale
DeepSeek Flash High. Kein Pro- oder Astra-Helfer gestartet.
