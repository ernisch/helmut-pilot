# Einmaliger inaktiver B055 Abschluss

Stand 15.09.2026: PR407 live; ein Productionversuch beendet, erster Entwurf fachlich abgelehnt. Kein freigegebener Lage-Text.

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

## Belegter Productionversuch am 15.09.2026

[PR407](https://github.com/ernisch/helmut-pilot/pull/407) ist auf Main `6f3e16db0d29f63bc27ead34be66fa0651407fde` gemergt. Der gepruefte Baum `5738f9c601c7cc3746ad917847b94d4da98b50c3` stimmt mit lokalem Stand und PR Kopf ueberein. Pflichtlauf34931071813:385/385 Offline in726s,50/50 Browser,15/15 Kontoschutz und48/48 Z22. Lokal385/385 in615s. Vercel `dpl_4APCaznh3izVMfbn6LASSCc79af4` war READY, Production und Hauptalias auf exakt diesem Commit.

Der private Auftrag wurde bedingt einmal angelegt und inhaltlich exakt zurueckgelesen. [Workflow34932284403](https://github.com/ernisch/helmut-pilot/actions/runs/34932284403), Job104262835961, wurde genau einmal auf dem gebundenen Commit gestartet. Der verschluesselte Ergebnistransport wurde erfolgreich authentifiziert und entschluesselt.

| UTC | Belegter Schritt |
|---|---|
| 05:19:50.117 | Einzelprozess `nachlauf500-202609150055` gestartet |
| 05:19:59.636 | Dauerhafte Startquittung gespeichert |
| 05:20:13.436 | Fachurteil importiert, gespeichert und verwendbar |
| 05:20:37.264 | Erster Modellaufruf reserviert |
| 05:20:44.369 | Privater Pruefentwurf gespeichert, nicht auslieferbar |
| 05:20:44.558 | Prozess mit `einzellage-abgelehnt` beendet |

Die konkrete Ursache ist `ai-text-profile-reference`: Der zweite von drei Absaetzen gab `mandatsbezug.feld=schwerpunkt` und `wert=Testthema 15` an. Nummerierte Testthemen tragen keine fachliche Zustaendigkeit. Die bestehende Anweisung schliesst sie aus; der Validator hat die Modellantwort korrekt verworfen. Das ist kein Nachweis einer erfolgreichen unabhaengigen Inhaltspruefung. Diese zweite Modellstufe wurde gar nicht aufgerufen. Es gibt keinen freigegebenen Lage-Text und kein daraus erzeugtes Mandatsbriefing.

Native SQL Ruecklesung um05:21:44 und05:26:45 UTC zeigt genau einen Kostenbeleg fuer diesen Run:4304 Mikro USD, Status `abgerechnet`, Phase `entwurf`, zuvor212000 Mikro USD reserviert. Das sind0,004304 USD nach dem konservativen internen Tarif, keine Anbieterrechnung. Tagesbuch76807→81111 Mikro USD, globale Aufrufzahl11→12, manuelle Aufrufzahl0→1. Die Antwortliste `kostenBelege` war wegen der fruehen Ablehnung noch leer; fuer den Endbefund gilt die anschliessende Datenbankruecklesung.

Alle504 Profile,505 Identitaeten und Konten sind im vollstaendigen Hashvergleich mit dem Vorflug05:16:47 UTC unveraendert. Fuenf Profile aktiv,495 synthetische inaktiv, B055 inaktiv;0 aktive Sperren, Leases, verwaiste Jobs oder junge laufende Prozesse. Gespeichert wurden die Startquittung, `briefing-aussagen` und `lage-pruefentwurf`. Keine aktuelle Lage oder Mandatsbriefingzeile.

Der separat rueckgelesene Nutzungsbeleg `llm-1789449642372-5scbez` ordnet5703 Eingabe- und363 Ausgabetokens demselben Run zu:6066 Tokens,4076 ms, `gpt-5-mini`, geschaetzt0,002152 USD. Der konservative Kostenriegel rechnet fuer diese Tokens mit4304 Mikro USD. `success:true` in diesem Nutzungsbeleg bedeutet nur einen erfolgreichen Modelltransport; der Text ist weiterhin fachlich abgelehnt.

Der technische Einzelweg ist nachgewiesen, der fachliche Abschluss bleibt teilweise abgeschlossen. Die dauerhafte Startquittung bleibt bestehen. Kein Retry und kein weiterer Modellaufruf im vorliegenden Auftrag. Eine kuenftige Wiederholungsentscheidung muss den abgelehnten Entwurf und die Auswahl zulaessiger Mandatsfelder beruecksichtigen und einen neuen begrenzten Auftrag festlegen. Der ungenutzte zweite Schritt ist keine Erlaubnis fuer eine zweite Erzeugung. Der500er Nachweis bleibt offen.
