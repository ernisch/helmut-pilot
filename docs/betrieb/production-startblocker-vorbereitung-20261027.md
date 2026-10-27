# Production-Startblocker: begrenzte Vorbereitung vom 27.10.2026

**Entwicklung vorbereitet; keine Production-Anwendung oder Testfreigabe.**
Branch `codex/production-startblocker-prep-20261027`, Basis Main/Production
`fcc8d8e0078c5307d817c9156433c560d3d431b1`. Hetzner-Einrichtung, Leistungsprüfung
und dortige Arbeitsstände sind nicht Bestandteil dieser Änderung.

## Übernommene native Objekte

Die folgenden vorhandenen Vorschläge, ihre zwei Rohvorlagen, der Generator und
die nativen Pins wurden **bytegleich** aus PR915/Commit
`470d871a0d38afb3bc2aab4288537c70a382c80a` übernommen:

- `supabase/proposals/synthetik500_stored_command_install_guarded.sql`
- `supabase/proposals/synthetik500_stored_command_suspend_reader.sql`
- `supabase/proposals/synthetik500_stored_command_remove_if_empty.sql`
- `supabase/proposals/synthetik500_stored_command_binding.sql`
- `supabase/proposals/synthetik500_stored_command_binding_rollback.sql`
- `scripts/synthetik-500-release-sql.js`
- `lib/helmut/synthetik-500-stored-command-native-pins.json`

Der Guard installiert ausschließlich die bereits vorgesehenen drei Funktionen
`helmut_s500_command_immutable_row_v1`, `helmut_s500_command_no_truncate_v1`
und `helmut_s500_read_command_binding_v1` sowie die beiden ALWAYS-Schutztrigger.
Keine neue Produktfunktion, kein SECURITY-DEFINER-Ausbau, kein Ersetzen einer
Teilinstallation. Owner, Rolle, Tabelle, Rechte, inaktive Profile und fehlende
Proof-/Authorityzeilen bleiben Voraussetzungen. Der Quieszenzmarker ersetzt
keinen tatsächlichen externen Ruhebeleg bis nach COMMIT und Readback.

Der Generatorabgleich und unabhängige Byteprüfung übernehmen die frühere
SQL-Abnahme; ihre erfolgreichen Übergangstests wurden nicht erneut ausgeführt.
Die Roh-Rollbackvorlage ist kein erlaubter direkter Rückweg. Reader-Suspend
erhält Schutzobjekte und Historie. Vollständiges Entfernen scheitert an
vorhandener geschützter Historie; auch Suspend scheitert an Proof-/Authorityzeilen.

## Kostenvertrag: ausschließlich vorgeschlagene Zeitverlängerung

Der ursprüngliche EU-Vertrag und sein Hash
`78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f`
bleiben unverändert. Version5 endet weiterhin am25.10. mit höchstens47Büchern.
Eine neue **noch nicht freigegebene** Zusatzbindung `ORDER_RENEWAL` erweitert
ausschließlich diesen selben Auftrag bis **31.10.2026 UTC**:

| Bindung | Unveränderter bzw. vorgeschlagener Wert |
|---|---|
| Tageslimit |82,036000USD|
| Kumulativer Auftrag |88,845364USD einschließlich erhaltener Altbindung|
| Maximaler neuer500er-Verbrauch |81,400000USD für500D+500R/U0|
| Private ungeklärte Reserve |0,636000USD bleibt gebunden|
| Reserve je künftigem EU-Ticket |0,081400USD|
| Auftrag |dieselbe ID und Beginn25.09.; kein Kostenreset|
| Proposed Orderversion |6 mit zusätzlichem `orderRenewalHash`|
| Maximaler Zeitraum |37Auftragstage, einschließlich25.09.–31.10.|
| Maximale Buchkapazität |53 inklusive aller bestehenden Bücher seit09.09.|
| Zusatzhash |`a649603fa8f18c6a3db65aab09b67e15d6bda80befa20e5394bce7eeda1d6415`|

31.10. ist die äußere Grenze des bereits gebundenen Oktoberpreiszeitraums,
keine zugesagte Startzeit. Keine automatische Verlängerung in den November,
keine Preisannahme für einen neuen Monat und keine Geldlimiterhöhung.
Der konkrete Lauf braucht weiterhin aktuelle Management-/Preisbelege.

Die zusätzliche Bindung muss in Auftrag, Routeplan und Runtimevariable
`HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL` exakt übereinstimmen. Für einen erneuerten
Auftrag bleibt die gesamte Usagehistorie erhalten. Alte Versionen behalten
ihre eigenen Laufzeiten und Grenzen. Das Hinzufügen eines Feldes zu Version5
oder ein beliebiger Hash öffnet den alten Vertrag nicht.

## Inerte Korrektur der fehlenden Bücher

`scripts/synthetik-500-eu-renewal-sql.js` erzeugt ausschließlich die lokale
DO-Vorlage `supabase/proposals/synthetik500_eu_order_renewal_20261027.sql`.
Keine Datenbankverbindung, keine automatisch ausführbare Migration und kein
zusätzlicher persistenter RPC. Quelle ist der unveränderte15Oct-Initializer,
SHA256 `7c2baa861b045cda0c3480e93b179096408be539a4553f39546be21eeb9cefb4`.

Die Vorlage ist mit `request=null` absichtlich nicht anwendbar. Nach konkretem
GO sind genau neun Felder zu materialisieren: tatsächlicher UTC-Tag,
`observedAtUTC`, native Auth-/Main-/Profil-MD5, Zusatzhash und SHA256-Bindungen
an das echte Betreiber-GO, vollständige Infrastrukturkostendeckung und externe
Quieszenz. Hashform allein beweist weder Freigabe noch Deckung oder Ruhe.
Die vollständige Vorprüfung und die konkrete Quittung müssen unabhängig
angenommen sein. Nach sämtlichen Locks darf die Beobachtung höchstens60s alt sein.

Zulässiger Vorgänger ist genau Version5/37Bücher bis15.10./Kapazität37/
`runDayUTC=2026-10-14`. SHARE-/Storelocks, READ COMMITTED,3sLock-/15sStatement-
Grenzen und fester `search_path=pg_catalog` bleiben erhalten. Relationale und
Blob-Ruhe müssen eindeutig belegt sein; unbekannte Zustände stoppen.

Jeder fehlende Tag16.10. bis zum **tatsächlichen Anwendungstag** wird unter
denselben Locks gegen native globale Zähler und vollständige erhaltene Usage
geprüft. Nur nachweislich ungenutzte Tage dürfen als Nullbuch ergänzt werden.
Eine fehlende native Zählerzeile wird unter Lock festgestellt; eine vorhandene
NULL-/negative Zeile wird nie als0 behandelt. Kosten, Lücken oder widersprüchliche
Historie stoppen. Bestehende Bücher werden weder ersetzt noch normalisiert.

Erlaubte Änderung: ergänzte belegte Bücher, exakt notwendige Kapazität,
Auftragsversion6/Zusatzhash und neue Auth-CAS-Revision. Am27.10. wären49Bücher
notwendig, am31.10.53. Limits, externe Altbindung, private Reserve, Journal,
Slot, Quellen, Profile und `runDayUTC=14.10.` bleiben erhalten.
Damit wird **kein neuer Lauftag finanziell zum Senden freigegeben**.

Die DO ist ein einmaliger Übergang. **Erst nach Leistungsabnahme am konkreten
Lauftag anwenden.** Bei einem späteren Tageswechsel passen diese DO und die
vorherigen Lauf-/GO-Bindungen nicht erneut; keine alte Anwendung wiederholen.
Falls der tatsächliche Vorgänger inzwischen driftet oder31.10. überschritten
ist, bleibt der Vorschlag gesperrt und benötigt eine neue konkrete Vorbereitung.

## Finanzreader und Nachkontrolle

Der bestehende authentifizierte GET behält Bearer-, Host-, Commit-, Nonce-,
20minFenster-,60sRead-, Hash-/Drift- und komplette Budgetprüfungen.
Vorhandene Sperren werden als feste technische Codes ausgegeben:
`order-window-expired`, `current-daybook-missing`,
`daybook-capacity-exhausted`, `order-renewal-runtime-unbound`.
Keine Exceptiontexte, privaten Authdaten oder Secrets werden ausgegeben.
Die Antwort bleibt409; die Reparatur erklärt den Fehler und unterdrückt ihn nicht.

Nur vollständig angenommene echte Bücher erlauben später einen numerischen200-
Finanzbeleg. Auch dieser enthält weiterhin `actual500Ready:false` und
`paidTestGo:false`; die neue Version nennt zusätzlich ihren Zusatzhash.
Der echte Production409 vom27.10. wurde in diesem Entwicklungssprint nicht
durch weitere Production-Probeaufrufe wiederholt.

## Gezielte Validierung und Grenzen

- Neuer Verlängerungsvertrag:6 reine Gruppen bestanden; historische Hashes,
  Geldwerte, vollständige Historie sowie Route-/Auftrag-/Runtimeabgleich.
- Geänderter Finanzhandler:9Gruppen bestanden, einschließlich beobachteter
  Fehlerkombination und hypothetischer zulässiger Verlängerung ohne Testrecht.
- Betroffene Regressionen:26Budgetgruppen,6EU-Vertragsgruppen,
  39Datumsfälle/9Gruppen und16Adaptergruppen bestanden. Ausschließlich
  synthetische Daten; keine echte Leistungs-/Productionabnahme.
- Neue Datumsgrenzen28./31.10. positiv, alter Vertrag und November negativ;
  der ursprüngliche11.10.-Quelltag bleibt erhalten.
- Die neue DO wird gezielt im netzlosen, digestgebundenen PostgreSQL17.6
  geprüft:20/20Gruppen bestanden. Ergebnis und aktuelle Dateipins:
  [maschinenlesbarer Nachweis](production-startblocker-nachweis-20261027.json).
- Der erste neue SQL-Versuch fand eine mehrdeutige JSONB-Operatorbindung;
  die gesamte Transaktion rollte zurück. Klammerung korrigiert. Danach
  positive/negative Gegenfälle; kein unbekannter Ausgang als Erfolg gewertet.
- Unabhängige reine Quellenprüfung bestätigte die7bytegleichen Übernahmen
  und fand zusätzliche NULL-/Zeit-/Blobkanten, die vor Abschluss korrigiert wurden.
  Das ist keine neue Production-Abnahme.

Die neue PG-Prüfung wird im vorhandenen netzlosen EU-CI-Container ausgeführt;
kein neuer Dienst oder Hetzner-Workflow. Vor Anwendung bleiben sämtliche
Pflichtchecks auf dem tatsächlichen Integrationskopf erforderlich. Keine
bestandenen B1–B4-/bezahlten/nativeLeistungs-/500erAbnahmen wurden wiederholt.

## Konkrete spätere Freigabegrenzen und Reihenfolge

1. Nach Leistungsabnahme den tatsächlich einzuliefernden Motor-/Runtimekopf,
   das gebaute Bundle, Worker-/Signierpfade und alle aktuellen Pflichtchecks
   zusammenbinden. Die übernommenen SQL-Objekte ersetzen diese Releaseannahme nicht.
2. Separates konkretes **Integrations-GO**: geprüften Kopf regulär ausrollen,
   passende Runtime-Zusatzbindung setzen, unveränderten inaktiven Zustand und
   vollständige Quieszenz halten; die3/2Objekte mit dem Guard installieren.
   Keine Aktivierung, kein Command und kein Modellaufruf gehören dazu.
3. **Finanz-GO für genau den aktuellen Lauftag**: vollständige aktuelle
   Infrastrukturdeckung und nativen Istzustand an die materialisierte DO binden;
   nach3/15sGrenzen genau einmal anwenden und ausschließlich lesend rückprüfen.
   Die verlängerungsfähigen neuen Writer müssen vorher ausgerollt und alte
   Writer ausgeschlossen sein; alte Writer kennen Version6 nicht.
4. Nach Wirkung alle alten Bücher/Reserven/Usage/Originale, nur erlaubtes
   Authdelta,0aktiveProfile, tatsächliche Funktionen/ACL/Trigger und den lebenden
   Endwächter bestätigen. Neuen FinanzGET nur an das richtige Deployment binden.
5. Danach erst frische32Startbedingungen, tatsächlichen Lauftag/Command/Sollplan,
   aktuelle Quellen-/Tagesanlässe und9h+30minEndbindung schließen. Gesondertes
   **Aktivierungs-/Production-Test-GO** für500gleichzeitig aktive synthetische
   Profile,1500Positionen/12000Kriterien und höchstens1000D/R-Aufrufe bleibt Pflicht.

Vor der finanziellen Adoption ist der reine Code-Rückrollout möglich, solange
der gesicherte Zustand unverändert und inaktiv ist. **Nach Adoption kein
Rückrollout auf alte Authwriter:** deren Historienerhaltung kennt Version6 nicht.
Stattdessen Sender gesperrt halten, alle Bücher/Revisionen erhalten und einen
vorwärtskompatiblen Rückweg konkret freigeben. Niemals alte Authdaten zurückspielen,
Reservierungen freigeben oder Journal/Once-Belege löschen, um ein Tor zu öffnen.

Noch nicht erledigt: reale Production-Anwendung, aktueller erfolgreicher
Finanzbeleg, vollständige numerische Infrastrukturdeckung, tatsächliche
Leistungs-/Speicher-/Releaseannahme und finales500erGO. Vorlagen und Code sind
keine dieser Freigaben. Unmittelbar nächster sicherheitskritischer
Integrationsschritt: **Sehr hoch**, weil Datenbankschutz und historische
Kostenbindung gemeinsam angenommen werden müssen.
