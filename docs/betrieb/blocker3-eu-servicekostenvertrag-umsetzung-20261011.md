# Blocker 3: freigegebener EU-Servicekostenvertrag

Das ausdrückliche [Betreiber-GO](blocker3-eu-servicekostenvertrag-go-20261011.json) übernimmt den unveränderlichen [Vorschlag aus PR #901](blocker3-eu-servicekostenvertrag-20261012.md). Dieser Umsetzungsstand ersetzt dessen Aussagen „GO/Umsetzung offen“. Der ursprüngliche JSON-Vorschlag bleibt als historischer Freigabegegenstand erhalten.

Gemeinsamer Runtime-Vertrag: `78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f` in `synthetik-500-eu-service-contract.js`. Ausschließlich `gpt-5-mini-eu`, Modellversion2025-08-07, DataZoneStandard, Sweden Central; kontospezifischer Oktoberpreis0,275/2,20USD je1M Tokens. Genau500D+500R, U0, ein Versuch, seriell, unverändert3.000Outputtokens einschließlich Reasoning. Serviceinputdeckel272.000 einschließlich der verrechneten Schema-/Framinganteile; pro Call maximal0,081400USD, für den Lauf maximal81,400000USD. Der theoretische Service-Maximalverbrauch ist keine Zielausgabe oder Laufzeitprognose.

| Grenze | Exakter Vertrag |
|---|---:|
| UTC-Tagesriegel, inklusive private Reserve einmal |82,036000USD|
| Derselbe kumulative Auftrag, inklusive Altbindung einmal |88,845364USD|
| Höchste konservative Altbindung inklusive private Reserve |7,445364USD|
| Davon ungeklärte private Reserve |0,636000USD|
| Neue EU-Reserve, ausschließlich künftige Tickets |0,081400USD|
| Aktive Laufzeit / Endbeleg |9h /30min|

Alle vorhandenen Bücher, Alttickets, Reserven und Usage-Zeilen bleiben erhalten. Der bisherige5.000-Zeilen-Usage-Ring wird ausschließlich für den hashgebundenen EU-Auftrag nicht abgeschnitten; ein zukünftiger Archivierungs-/Vertragswechsel darf Belege ebenfalls nicht still entfernen. Zusätzlich erzeugte belegbar kostenfreie Nicht-Aufruf-Marker ersetzen keine der1.000 nativen Modellquittungen. Der Auftrag behält ID und25.09.-Beginn; sein technisches31-Tage-Fenster endet25.10. Keine automatische Tages-/Quellenverschiebung. Nur die neue Version nutzt die frisch nachgewiesene notwendige Buchkapazität, höchstens47. Fehlende Tage werden ausschließlich aus vollständigen frischen nativen Usage-/Zählerbelegen rekonstruiert; Unklarheit stoppt. Historische4/6/7/20-Verträge bleiben in ihren alten Versionen.

Der Rollout setzt `runDayUTC:null`: es gibt weiterhin kein Test-GO, keinen neu installierten Command und keine Journalwirkung. Deshalb bleibt jeder bezahlte EU-Sendeweg gesperrt. Beim getrennten Test-GO müssen genau ein zulässiger Lauftag, ein frischer vollständiger Plan und die dann exakt notwendige Kapazität gebunden werden. Dieser Rollout bindet keine Endsteuerung und aktiviert keine Profile.

Frisch gelesen: global2416, Understandingreserve702; effektiv1714 für synthetische D/R. Startzähler höchstens714; keine Veränderung dieser Grenzen. Codefallback50 bleibt unverändert. Die200Realprioritätsplätze werden nicht nochmals von1714 abgezogen.

Der9h-Vertrag umfasst20min Vorbereitung, höchstens500Einheiten zu60s und20min Puffer. Der vorhandene unabhängige SQL-Endwächter bleibt der Production-Fristweg; die zusätzliche manuelle GitHub-Beobachtung mit270min ist keine9h-Absicherung. Die neue SQL-Bindefunktion akzeptiert ausschließlich einen vorbereiteten EU-Runtime-Vertrag mit genau demselben Hash/Fenster. Alte Bindefunktionen bleiben4h. Kein Bindungsaufruf gehört zu diesem Rollout. Dauerhafte Einheiten-Deadlines sperren verspätetes Senden/Speichern/Fortsetzen; unbekannte Wirkung bleibt reserviert. Ein Datenbankausfall kann tatsächliche Endwirkung verzögern, der persistente30s-Endwächter bleibt zuständig. Eine vollständige erfolgreiche Ausgabe binnen9h wird nicht behauptet.

Der Endvalidator verlangt alle1.000 nativen, erfolgreichen Usage-Belege mit Ticket/Intent/Request/Owner/Plan/Deploymentbindung, exakt passende Kosten nach auf Mikro-USD aufgerundeter Oktoberformel, vollständige erhaltene Usage-/Buchhistorie und Zählerdelta1.000. Prognosen und lokale Tokenzahlen ersetzen keine nativen Belege. Sämtliche1.500 fachlichen Abnahmekriterien bleiben bestehen.

Lokale Prüfungen:6EU-Gruppen,26Geldgruppen,64Endvalidatorgruppen,12Runtimegruppen sowie bestehende Routenprüfungen grün. IsoliertesPG17 prüft Migration, NULL/Hash/4h/9h-Grenzen, Service-only-RPC, unveränderten alten Binder und native Statusbindung. Unabhängige Geldnachprüfung und gezielte Route-/Zeitprüfung sind positiv; aktuelle Pflichtchecks bleiben vor Merge nachzuweisen. Auch der SQL-Rückweg ist isoliert geprüft. Der EU-Datenbanknachweis hat einen eigenen verpflichtenden, netzlosen CI-Schritt; im Offline-Sammler wird er wie die übrigen echten Datenbanktests zugeordnet. Seine gebundenen Vorfunktionen stammen aus den öffentlichen Repository-Migrationen. Die bestehende Standardsuite behält alle169Tests. Der CI-Job erhält ein endliches35min-Fenster, ohne Pflichtschritte oder deren Einzelgrenzen zu entfernen.

Merge/Rollout erfolgen erst nach aktuellen grünen Pflichtchecks und erneuter vollständiger rein lesender Vorprüfung. Höherer/ungeklärter Tagesbestand, höhere Altbindung, aktive Profile/offene Endbindung, Versionsdrift oder Widerspruch stoppen. Nach Rollout werden READY-Commit, tatsächliche EU-Runtime, Geld-/Zählerkonfiguration, private Reserve, unveränderte Historie, native SQL-Versionen und0Aktive/0Command-/Journalmutation ausschließlich lesend gegengeprüft. [Maschinenlesbarer Stand](blocker3-eu-servicekostenvertrag-umsetzung-20261011.json). Blocker3 ist vor diesen tatsächlichen Nachweisen offen.

Rückweg: vorherigen unveränderlichen READY-Stand und gesicherte ENV-/finanzielle Preimages verwenden; nur bei nachgewiesen unverändertem Zustand und weiterhin0Aktiven. Niemals verbrauchte/reservierte Beträge, Usage oder historische Bücher entfernen. Der SQL-Rückweg verweigert jede vorhandene EU-Bindung und lässt historische Datensätze bestehen. Bei Drift stoppen und Betreiberentscheidung verlangen.
