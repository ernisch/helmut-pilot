# Frische5: begrenzter Fuenfer-Quellenauftrag (vorbereitet, nicht ausgefuehrt)

Roadmap3.1/3.3, autonomer [Betreiberauftrag](autonom-bis-500-starttor-20260926.md).
Fuenf neue an den Originalseiten gepruefte DLF-Artikel stehen als frische Eingabe
bereit; dieser Auftrag importiert nichts, ruft kein Modell und erzeugt keine
Production-Wirkung.

## Gesicherte neue Eingabe

Originalzeit und RSS-Zeitpunkt sind je Artikel zeitpunktgleich; kanonische
Adresse und Kennung kollidieren nicht mit dem Production-Bestand. Jede der
fuenf Quellenzeilen traegt genau einen eigenen Originalbeleg und bildet einen
Einzelcluster (5 Quellen, 5 Einzelcluster). Vollstaendiges Original-HTML,
Einzelgruende und volle Eingabe bleiben privat unter `/private/tmp`; nichts
davon liegt im Repository.

* Eingabehash (Payload): `64302058e779c571e895b97832c7ed2aa9ead1d618b868bc07497ea830441b12`.
* ID-Hash: `ec7424653949de4e3230be44a9e84e8e529c948ee92d3b6ac54974f25bf0527d`.
* Inhalt: `fc845bc31a1e80a07d35a6d4d2df8fbf83629a91f24f68d11a5ccb37c96a1f53`.
* Belege: `747368d75bf4bcb090e5c3fbf4f1d02ff0022f7020caea8e5929043d7c53d7a4`.
* Quellenkontext-Codebasis: `654fd8ea72f31260ffce6a104e071b237dd61ebf`.

Der Importpayload entsteht lokal aus der echten globalen Dedup-Logik
(`dedup-global.planDedupWrites`) und genau der Raw-Document-Abbildung des
Produktionspfads (`storage.persistRawDocumentsDeduped`). Zeiten, Titel, Inhalt
und die Quellenbeleg-Bindung bleiben unveraendert; kein Rohbeleg liegt im
Repository.

## Vorab festgelegter Umfang und Rueckweg

Production: genau5 neue Rohdokumente und5 Fundstellen plus gebundene
Eingabeablage `quellen-frische5-20260926-a`. Import atomar; vor/nachher
vollstaendige Hashes des fremden Bestands.500 Mandate/501 Identitaeten, alle500
inaktiv; keine Jobs, Sperren, Leases oder konkurrierenden Laeufe. Kollisionen,
verwendete Quittung, fremde Triggerwirkung oder abweichende Eingabe stoppen.
Keine Migration, Cron-/Umgebungsaenderung, Profilwirkung oder Kommunikation.

Danach zuerst Nurleseplan, dann eigener Auftrag
`verstehen-frische5-20260926-a`: maximal5 Modellaufrufe,0,25USD,7Minuten, keine
zusaechlichen Artikelabrufe. Nur gpt-5-mini ueber den bestehenden
Produktpfad, kein Retry. Der erste nicht bestaetigte Einzelausgang stoppt; kein
alter `unknown`-Vorgang wird wiederaufgenommen. Alle5 Ergebnispositionen muessen
anschliessend vollstaendig bilanziert werden.

Der gesicherte Rueckweg ist ausschliesslich vor Verarbeitung zulaessig: exakt die
unveraenderten, unverknuepften5 Quellen/Fundstellen und die eigene
Eingabeablage entfernen, uebrigen Bestand hashgleich lassen. Nach Verarbeitung
Belege erhalten; keine Loeschung oder Ruecksetzung verbrauchter Quittungen.
Unklaren Ausgang nur nachlesen und nicht wiederholen.

Kosten: nach55 Helfersessions konservativ gebundene4,744061USD (22:41UTC). Der technische
Tagesriegel und die kumulative Auftragsgrenze von je6USD gelten unveraendert;
der neue Runner kopiert keine alte4USD-Konstante und erhoeht kein Limit. Der
Laufkennungsbezug `verstehen5-<GITHUB_RUN_ID>` brauchte eine additive,
limitenneutrale Aufnahme in die bestehende Kennungsliste
(`testkosten-budget.MANUELLE_RUN_ID`); ohne sie waere der Kostenleser des
Auftrags nicht bindbar. Keine Anbieterrechnung, keine Freigabe fuer Aktivierung
oder500er Test.

## Lokale Abnahme

`scripts/verstehen-frische5-test.js`:10 Schutzpruefgruppen ohne private Dateien
und mit privatem kanonischem Payload4 zusaetzliche Gruppen bestanden
(14/14). Enthalten sind die5er-Grenzen, fakeVersorgung/Quittung, Cache-Reuse,
die Einzelunknown-Sperre, der positive Payload-Hash, die Einzelclusterbindung
und die Pruefung des unveraenderten Original-HTML je Beleg. Kein
Modellaufruf, kein Netzwerk, kein Storage-Write.

Import-SQL `c9990e73043d1f71037eb959d0400c8157aa07409e72187851a9e98ecb2f168f`;
Rueckweg `7c7271e44232c7e4a2d49aa24f0a613a81404122a8f9c781d4cba29794517c3c`.
Beide nur lokal geprueft. Noch kein Import und kein Verstehenslauf ausgefuehrt.

Die neue Suite wird durch die bestehende Verstehen-Bereichsauswahl automatisch
zugeordnet. Keine Erweiterung der allgemeinen Standardmenge. Die additive
Laufkennung wurde eigenstaendig geprueft; beide6USD-Grenzen unveraendert.
