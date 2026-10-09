# Blocker 2: Ereignisgruppierung und neue vollständige Nurleseaufnahme

Stand: 09.10.2026 UTC. Der autonome Betreiberauftrag gilt bis zum vollständigen fachlichen Abschluss, ohne erneute Einzel-GO-Fragen. Erfolg verlangt vollständige positive Einzelbelege für alle 500 synthetischen Profile. **Technischer Aufnahmeabschluss bestanden; fachliche Abnahme weiterhin 0/500.**

## Geprüfte Änderung und Production

[PR #877](https://github.com/ernisch/helmut-pilot/pull/877) gruppiert ausschließlich das quellen- und versionsgebundene Paar zum Haushaltsausschussbeschluss vom 08.07.2026 über vier MEKO-A-200-DEU-Fregatten mit Option. Beide bestehenden KO-, Quellen- und Reservierungsidentitäten bleiben erhalten. Karten und Empfehlungen tragen vollständige Ereignismitglieder; Tageskopfbindungen verhindern eine unzulässige Zusammenfassung. Versionsdrift schaltet die Gruppierung ab. Das ersetzt weder die Fakten-/Zeitprüfung der Quellen noch andere Resolverbelege.

Geprüfter finaler PR-Kopf `f1f5d8de992b3bad2b4e0d860d85b4b8486462b3`, Pflicht-CI [37870771900](https://github.com/ernisch/helmut-pilot/actions/runs/37870771900): beide Pflichtchecks erfolgreich, konservative Offline- und isolierte Datenbankprüfung ausgeführt. Der Browsercheck hat nach dem kanonischen Nicht-UI-Prüfplan übersprungen; kein ausgeführter Browsernachweis wird behauptet. Zwei reine Prüffehler wurden berichtigt: feste UTC-Mittagsuhr im Altvorgänger-Test und positive TCP-Bereitschaft des isolierten PostgreSQL statt dessen vorläufigem Unix-Initserver. Schutzschwellen und Production-Codepins blieben erhalten. Unabhängige kritische Codeprüfung und 500 historische Offline-Replays bestanden; die abschließenden Test-/CI-Deltas verändern die fünf geprüften Production-Codepins nicht.

Regulärer Merge `a7aa1fc2b2d23e2959d64677bcd14327f7b59215`; Mergebaum `5efb8b94d0bbc6be48a55c6ab9e0e562f052a24e` identisch zum geprüften Kopfbaum. Native READY-Prüfung bindet Alias `helmut-pilot.vercel.app` und Deployment `dpl_8Li6JzCXhXULXXEWkNL71wtDb9bC` an diesen Production-Commit. Keine Profilaktivierung und kein Funktionstest.

## Neue tatsächliche Aufnahme

Einmaliger [Run 37873722112](https://github.com/ernisch/helmut-pilot/actions/runs/37873722112), `main`, `workflow_dispatch`, Versuch 1, Workflow- und Production-Commit `a7aa1fc2`, Berliner Tag `2026-10-09`. Native Runmetadaten: erstellt 02:15:40 UTC, aktualisiert 02:34:24 UTC. Diese Zeitpunkte werden nicht als einzelne Request-/COMMIT-Zeiten ausgegeben.

500 Eingabe-GETs und zwei Identitäts-GETs; **500 erfasst, 0 leer/technisch/unbrauchbar/widersprüchlich/nicht erfasst**. Alle Profile inaktiv und vollständig fiktiv, Verteilung 330 Bundestag / 120 Berlin / 50 Brandenburg. Beginn- und Endidentität einschließlich Commit, Deployment und Runtime-Codehashes identisch. Die Identitätsprobe nutzt synthetische Resolverfixtures; sie ist kein Bedeutungsnachweis der tatsächlichen Nachrichten.

500 Positionsoriginale und 28 Manifeste authentisiert; alle vollständigen Body- und Eingabehashes verifiziert. Globaler Eingabebestand: 500 KO-Versionen und 875 Quellenversionen, in allen 500 Antworten identisch. Globaler KO-Hash `30712faff83b20ee80169761889c2402c665b7cf7e0699296aa5e74ba39f86e7`, Quellenkartenhash `b9e708795bad89fb4412c0e5c41b8281d2699fc7b13ce554f894f9a047efc946`. Tatsächlich sichtbar: **20.525 Karten, 398 unterschiedliche KO-Versionen und 91 Ereignisgruppen mit jeweils einem zusätzlich vollständig erhaltenen Mitglied**. Historische 348-KO-Auswahlen ersetzen diese neue Auswahl nicht. Historische Gesamtaufnahmen und neue Eingaben bleiben getrennt.

## Unveränderter Datenbestand und unabhängige Prüfung

Drei vollständige READ-ONLY-/Repeatable-Read-Vergleiche aller 52 geschützten Tabellen, lokal `jit=off`, Statementfrist 15 Sekunden / Lockfrist 2 Sekunden; SQL-SHA256 `cfd0986829e79848b53be2509b1bade5de5f34f767a4466a1da42c8e948c4c90`. Beobachtet 02:02:28.996966 UTC, 02:11:11.249318 UTC und unmittelbar nach Aufnahme 02:35:27.790047 UTC. Alle Vollzeilen-, xmin- und Zeilenzahlfingerprints untereinander und zur Nach-B-Basis identisch. Dies belegt drei Messpunkte, keine kontinuierliche Überwachung.

Ein unabhängiger Python-Verifier hat alle 28 ursprünglichen ZIPs mit eigener RSA-OAEP-SHA256-/AESGCM-/gzip-Implementierung wiederhergestellt, alle 500 Eingaben mit eigener JSON-Kanonisierung nachgerechnet und Profile, Tages-/Commitbindung, Manifeste, beide Identitäten und den vollständigen 52-Tabellen-Vergleich geprüft. Er verwendet weder den JavaScript-Transporthelfer noch historische Eingabeoriginale. Ergebnis **PASS, ausschließlich technische Beleg-/Aufnahmeprüfung**.

Private Integrationsbelege unter `/workspace/blocker2-autonomous-resolution-20261009/event500-37873722112`:

- `new500-exact-integration-private.json`, SHA256 `33c1785eca2b772b93821e5c1f0b7c3948cbb50d66f198c99aa660338ffe700b`.
- `independent-python-technical-closure-proof.json`, SHA256 `b16cf1e58ab092316ec630a4b687feda1855d10177f2d0c37a116c11512cfbef`.
- Postcapture-Vollvergleich `event500-postcapture52-native.json`, SHA256 `4eb550934a04269a0f59f26000d84907d4fe4764965fac86fc3355017830001a`.

## Dauerhaft gesicherte Originale

28 bytegleiche GitHub-Original-ZIPs, **473.212.066 Bytes**; native Ablauffristen 10.10.2026 von 02:16:00 bis 02:34:21 UTC. Alle zusätzlich im vorhandenen privaten Drive-Übergabebereich in einem eigenen Runordner gesichert. Ordner und Dateien per nativen Metadaten auf ausschließlich Eigentümerzugriff, Elternbindung und vollständige Größe geprüft. Anschließend alle 28 Dateien frisch über den Drive-Connector serverseitig heruntergeladen: sämtliche SHA256-Digests stimmen mit den ursprünglichen GitHub-Digests überein. Keine Klartextoriginale hochgeladen, vorhandener Empfängerschlüssel separat erhalten, kein Dateitransfer über das Betreibergerät. Privates Manifest enthält Datei-/Runbindungen und Wiederherstellungsanleitung; private Drive-IDs/-Links werden nicht veröffentlicht.

Wiederherstellungsbeleg `event500-Drive-fresh-restoration-byte-proof-private.json`, SHA256 `e39b29de7cd6de0ab4d6eab5d59f0d21935286d9df4b64d8de7bffed38fef2b1`. Drive hat kein festes Ablaufdatum; Verfügbarkeit und Zugriff hängen weiterhin vom Dienst und Eigentümerkonto ab.

## Fachlich offen und unmittelbar folgende Arbeit

**Kein Profil fachlich abgenommen.** Für 372 der 398 sichtbaren KO-Versionen liegt mindestens ein vollständiger öffentlicher Seitentext vor; 26 haben weiterhin keinen. Textverfügbarkeit ist weder Artikelidentität noch vollständige Artikeltiefe, Fakten-, Zeit-, Ebenen-, Resolver-, Notwendigkeits- oder Profilabnahme. Die vollständige notwendige Quellenauswahl und aktuelle Fensterbindung bleiben offen. Ein unabhängig bestätigter Tarifbindungs-KO verwechselt Katherina Reiche mit vermögenden Gruppen und mischt einen Februar-Bundesbericht mit einem April-Berlin-/Brandenburgbericht; er ist in 372 aktuellen Profileingaben sichtbar. Ein quellengebundener privater Pro-High-Korrekturentwurf liegt vor; Integrations- und unabhängige Scopeprüfung vor nativer Anwendung bleiben offen.

A4/B5 abgeschlossen, nicht wiederholen. C-Löschentwurf gesperrt; beide C-Identitäten bewahren. Übergabebranch ausdrücklich nicht mergen oder deployen. Diese Etappe enthält keine Production-Daten-/Profil-/Reservierungs-/Budgetänderung, bezahlten Helmut-Production-Modellaufrufe, Aktivierung, Funktionstest oder Rückweganwendung. Der begrenzte Captureauftrag ist verbraucht; ein sachlich erforderlicher nächster Lauf erhält eine neue genaue Bindung innerhalb des dauerhaften Betreiberauftrags. Keine automatische Wiederholung und keine Vermischung vollständiger historischer Aufnahmen.
