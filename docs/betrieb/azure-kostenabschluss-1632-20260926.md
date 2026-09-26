# Kostenabschluss des abgebrochenen Lage-Vergleichs

## Anbieterbeleg und Zuordnung

Am26.09.2026 um20:05UTC frisch gelesen: Azure-Ressource `helmut-resource`,
Deployment `gpt-5-mini`, Fenster16:28–16:38UTC. Genau ein `create-response`
mit HTTP200,4069 Eingabe- und3000 Ausgabetokens, Minute16:32UTC.
Der vollständige Helmut-Fensterabgleich enthält genau einen Nutzungsbeleg und
ein Ticket: `llm-1790440319637-9moa0o`,
`2c43a041-7e52-496b-8759-546184e13a83`, Run36255745418.
Das ist eine eindeutig abgegrenzte Aggregatzuordnung, keine wiederhergestellte
Modellantwort und keine Anbieterrechnung. Die Quittung
`lage-pruefaufwand-20260926-b` bleibt gestoppt und verbraucht.

Originalmetriken lokal: `/private/tmp/helmut-azure-1632-metrics-20260926-helmut-resource.json`,
SHA256 `4c4837dfe4ab33df5248a4875d0715727212c04bb4e2a994992bf304ce184fad`.
Statusbeleg: `/private/tmp/helmut-azure-1632-request-status-20260926-helmut-resource.json`,
SHA256 `15b3b7ff4c8de99172adc623e6aebd39c48692a6f381f9bafd8be8a22afcc1f8`.
Ausgelesen mit der [Azure Monitor Metrics API](https://learn.microsoft.com/en-us/rest/api/monitor/metrics/list?view=rest-monitor-2023-10-01).

## Begrenzte Änderung vor Ausführung

Autorisierung: [autonomer Betreiberauftrag](autonom-bis-500-starttor-20260926.md),
Roadmap3.4. Ausschließlich Production `helmut_store/main-auth`: obigen
Nutzungsbeleg mit tatsächlichen Tokenzahlen und dokumentierter Herkunft ergänzen,
Originalfelder erhalten. Den bestehenden konservativen Tarif0,50/4USD je Million
Tokens verwenden:0,0140345USD, auf14035 Mikro-USD aufgerundet. Nur dieses Ticket
abrechnen, Tagesverbrauch608261→622296 und normale Auth-Schreibversion erneuern.
Historische Reserve212000 bleibt im Ticket; Tages-/Gesamtgrenze bleiben6USD.

Wirkung: eine offene Reserve geklärt, ohne fachlichen Erfolg oder Wiederholung.
Risiko: falsche Zuordnung oder paralleles Überschreiben. Vorbedingungen:
exakter voller Auth-Hash, Zähler96,500 inaktive Profile mit unveränderten
Vollhashes, keine Jobs/Locks/Leases/laufenden Prozesse, exakter Quittungshash.
Atomare Zeilensperre und vollständiger Vergleich aller unbetroffenen Felder.
Nachkontrolle: unabhängige Rücklesung, kanonische Kostenprüfung und Profilhashes.
Rückweg: nur betroffene Teilfelder aus gesichertem Vorherzustand zurücknehmen,
bei unverändertem Nachherzustand; spätere Buchungen niemals überschreiben.
Keine Aktivierung, kein500er Test, kein Modellaufruf und keine Azure-Änderung.

Vorbereiteter SQL-Auftrag: `/private/tmp/helmut-kostenabschluss-1632.sql`,
standardmäßig reine Vorprüfung. Vorprüfung20:07:27UTC bestanden, einmalige
Ausführung20:07:38UTC, unabhängige Nachlesung20:07:55UTC erfolgreich.
Auth-SHA256 danach `adfc075301cb527b9586afc87ef587e67f4ea6ade80c48d2731810af63f29029`.
500 Profile/0 aktiv, beide vollständigen Profilhashes unverändert,0 Jobs/Locks/Leases.
Alle übrigen Tickets und Tagesbücher unabhängig mit dem gesicherten Vorzustand
verglichen: identisch. Kanonischer Kostenprüfer bestätigt0 offene Reservierungen
und ein freies Kostenstarttor. Dies ist keine500er Startfreigabe.

Konservative Gesamtbindung4,315213USD, Rest1,684787USD bis6USD.
Die zusätzliche0,35USD-Reserve des früher abgebrochenen lokalen Helfers bleibt
vollständig in der externen Bindung enthalten. Tagesverbrauch0,622296USD.
Die fachliche Lage-Prüfung, Themenversorgung und500er Startbereitschaft bleiben offen.

[PR628](https://github.com/ernisch/helmut-pilot/pull/628), Kopf`ded60d15`, nach
beiden grünen [Pflichtprüfungen](https://github.com/ernisch/helmut-pilot/actions/runs/36269116954)
gemergt als`2397f707`. Deployment`dpl_4h2VYUmNbMRyQGxd85HYCmiDZXHL` READY.
Unabhängige Nachlesung20:28:22UTC bestätigt500/0, beide Profilhashes gleich und
keine offene Reserve. Fehler-/Fatal-Protokolle20:27:45–20:28:23UTC ohne Treffer.
