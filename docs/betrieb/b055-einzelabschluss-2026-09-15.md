# Einmaliger inaktiver B055 Abschluss

Stand 15.09.2026: Implementierung und Offlinepruefung; noch kein Productionlauf.

Die ausdruecklich freigegebene Eingabeaufnahme34928052942 auf Productionf700c1d ist erfolgt. Die aktuelle private Fassung umfasst29 Karten/471 Textpfade/29 Quellen. Sie ersetzt fuer diesen Abschluss die vorherige31er Auswahl. Keine Vollartikelpruefung aller170 Kandidaten und keine500er Profilabnahme.

Der bisherige manuelle Textnachlauf verlangt500 aktive Profile. Die regulaere App Route kann die private Fachabnahme und den Einmalkostenvertrag nicht tragen. Der neue, authentifizierte POST `/api/cron/b055-einzelabschluss` verbindet deshalb den bestehenden Urteilsimport, Aussagenleser, Lagegenerator und Briefingspeicher fuer ausschliesslich das inaktive synthetische B055 Profil. Das bestehende500er Gate bleibt unveraendert.

## Auftrag und Schutz

Der Betreiber hinterlegt den privaten Auftrag einmal bedingt unter `helmut_store.id=b055-einzelabschluss-v1`. Er bindet das Fachurteil, den Profilkontext, den UTC und Berliner Tag, den exakten Productioncommit, Ablaufzeit und maximal zwei Modellaufrufe mit insgesamt424000 Mikro USD Reserve. Die manuelle GitHub Aktion transportiert nur Auftragshash, Commit, Bestaetigung und oeffentlichen Empfaengerschluessel. Azure Zugangsdaten bleiben in Production. Antworten einschliesslich negativer Fachbefunde werden mit eigenem Transportzweck verschluesselt.

Vor dem Schreiben muss der frische Produktionsursprung exakt zum geprueften Urteil passen. Alle504 Profilzeilen,505 Identitaeten und Konten werden gebunden;495 synthetische Profile bleiben inaktiv und nur die fuenf Originale aktiv. Sperren, Leases, Prozesskonkurrenz, Cronfenster, Kommunikation und der bestehende atomare4 USD Tagesriegel werden erneut geprueft.

Der dedizierte Writer legt eine einzige unveraenderliche Startzeile in `briefings` an. Ihre Kennung ist unabhaengig von Tag, Commit und Workflowlauf. `ignore-duplicates` und Ruecklesung verhindern Doppelstarts auch nach einem verlorenen HTTP Ergebnis. Eine vorhandene Startzeile wird weder geloescht noch ersetzt. Bestehende Fachurteile, Lage oder Mandatsbriefings stoppen den Lauf; der Einzelweg erlaubt keine Reparatur oder Neuerzeugung vorhandener Ergebnisse.

Der bestehende `nachlauf500-…` Run-ID-Vertrag wird ausschliesslich fuer Kosten- und Entwurfszuordnung wiederverwendet. Die Prozessquittung nennt Zielmenge1; jede Antwort weist `funktionsnachweis500:false` aus. Vor dem zweiten Modell muss der erste Kostenbeleg vollstaendig abgerechnet sein. Dritter Aufruf, unbekannter Ausgang, Profil- oder Eingabedrift stoppen. Kein automatischer Retry, keine Queueeinreihung, Aktivierung oder Kommunikation.

## Nachweis und Grenzen

20 isolierte Ablaufpruefungen decken erfolgreiche Zweischrittfolge, Profil- und Commitbindung, Ablauf, Ursprung, Konkurrenz, Kommunikation, Bestandsschutz, atomare Startkonflikte, verlorene Startantwort, Kostenluecke, Zeitbudget und dritten Modellaufruf ab. Vier Transportgruppen pruefen verschluesselte Antworten, genau einen POST und Timeout ohne Retry. Der kanonische Gesamtlauf und die CI Pflichtjobs sind vor Merge erforderlich.

Die technische Verbindung ersetzt keine fachliche Annahme eines Modelltexts. Ein abgelehnter Entwurf oder Modellreview bleibt abgelehnt. Der gespeicherte Text und die tatsächlichen Kostenbelege muessen nach dem freigegebenen Lauf separat rueckgelesen werden. Die Freigabe erlaubt hoechstens zwei Aufrufe bis0,424 USD innerhalb des Tagesdeckels; sie erlaubt keine500er Aktivierung oder Wiederholung eines begonnenen Einzelabschlusses.
