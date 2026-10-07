# Historische Realkohorten-Endwegvorbereitung

Wortgleich aus `docs/CURRENT_STATE.md` ausgelagert am 07.10.2026 zur Einhaltung
der Statusgroessengrenze. Absatz-SHA256 (UTF-8, ohne Zeilenumbruch):
`6b8d34e67d4b304f900d1bc7968a797e1c49eace9cef13eaaad07c17c7134f0c`. Kein aktueller Status; die neue
unabhaengige Endsteuerung steht im [Blocker-4-Dossier](../../betrieb/blocker4-endsteuerung-20261007.md).
Relative Links im folgenden Original beziehen sich auf die urspruengliche Datei.

```markdown
**Realkohorten-Vorbereitung (01.10.2026, ausschließlich offline):** Ein eigener [Vertrag](../lib/helmut/realkohorte-500-vertrag.js) bindet das kanonische Paket, genau dessen 500 IDs und 330/120/50, einen frischen 500/501/0-Snapshot, Kosten einschließlich Reservierungen (6 USD/Tag, 7 USD/Auftrag) und ein kurzes Startfenster. Der [Endgenerator](../scripts/realkohorte-500-endweg.js) erzeugt ausschließlich eine private 0600-Datei außerhalb des Repositorys; Transaktion, exakte Quittung und Bestands-CAS, Erhaltung aller Identitäten und nur Deaktivierung. Kollisionsfreie SQL-Dollarquote ist durch vier neue Gegenfälle abgesichert. **PR #760 belegt den manuellen Endweg mit 10/10 neuen Fällen auf echter isolierter PostgreSQL17:** voller Rückweg 500→0, Bestands-/Fremdprofil-Erhaltung, CAS-/Drift-Abweisung und atomarer Triggerrollback. Das ist kein Production-Endlauf; ein tatsächlich lebender automatischer Endwächter bleibt offen. Der alte synthetische null500-Vertrag bleibt unverändert. Der [Erwartungsgenerator](../scripts/realkohorte-500-erwartungen.js) legt 500 individuelle Voraberwartungen und 1500 **ausstehende** Bereichspositionen fest, mit getrennten Mengen- und Qualitätsbilanzen. Keine Nachrichtenauswertung oder Fachabnahme; frische Mandate/Quellen und das konkrete Nachrichtenzeitfenster fehlen noch. Neue gezielte Prüfungen: Vertrag 41/41, SQL-Kollision 4/4, Erwartungen 31/31; unabhängige kritische Prüfung akzeptiert ausschließlich die Offline-Vorbereitung. Beide neuen Schutzsuiten sind im Pflichtlauf. Kein Import, keine Aktivierung, kein 500er Test und keine SQL-Anwendung.
```
