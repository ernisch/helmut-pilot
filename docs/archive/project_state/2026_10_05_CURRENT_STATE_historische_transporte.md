# Historische Transport- und Production-Befunde bis 05.10.2026

Diese beiden Abschnitte wurden wortgleich aus CURRENT_STATE.md ausgelagert. Sie bleiben historische Belege und erteilen keine aktuelle Freigabe.

- **Private V7/fix2 und neuer Native-Transport (02.10.):** Lokaler Stage/Forward/Rückweg
  mit136765Quell-/46143Kontrollzeilen, Runtime10/2, Journal41→44 akzeptiert
  (`6a8aa67a`/`1f85df23`); Wrapper6,236/5,014/13,056s, CPU6,130/4,910/12,900s
  im2CPU/2GiB-Clone. Source5/Geschäftskörper,17/20/2 und Vollfeldguards erhalten.
  Keine Native-Hardware-/MVCC-/Owner-/ACL-/Ganzphasenabnahme, Body-only-Zeit,
  harte17s-Reserve oder erfolgreiche SubTX-Leistung.
  Historische inerte3.113.000B-Textprobe scheiterte terminal nach802,388s:
  `Invalid or expired requestState` (`f932e3a0`/`533b5839`), Ursache/Schicht unbekannt.
  Neuer verlustfreier pgcrypto-Transport: genau eine Native-RO-Decoderprobe erfolgreich,
  **3.023.730 Originalbytes/SHA`1c4f3753`**, kleinere Argumente584292B,
  alle Guards positiv; unabhängige tatsächliche Abnahme`0c04c55b`.
  Original-App nicht ausgeführt; `current_query`-/Auditadapter und Native-Gesamtphase offen.
  Frühere3,85MB-Abweisung bleibt historische Evidenz; kein Retry der alten Proben.
  [Profil-/Snapshot-/Endwächterkapsel](betrieb/synthetik-500-profil-starttor-kapsel-20261002.md)
  bindet Historie privat, kopiert keine großen Archive und hält neun dynamische Tore rot.
  Aktuelle MainAuth/Audit42-Vollbindungen statt altem Importpreimage sind Pflicht.
  Profil-GO, Quellen, finanzierter Qualitätsplan und lebender Endwächter fehlen;
  0 Profilimporte/0 Aktivierungen/0 neue Modellaufrufe.

- **Frueher gesicherter Production-Befund (01.10.2026, 13:22 UTC):** PR #761 ist als `f5f775c326d4feafbfcbcc3d4ca18de1e94aba60` mit beiden Pflichtchecks gemergt; Ready-Deployment `dpl_rUjodyYwiz9EDGWZBXDcLV7WZAhp`, Region `fra1`. 500 Mandate / 501 Identitaeten / 0 aktiv / 0 unklare Aktivwerte, keine Runtime-Slots. Die neue reale Mischkohorte ist nicht importiert. Fuenf Realkohorten-Runtimefunktionen sind installiert und ihre Bodies/ACLs gebunden; Journalversion nach kontrolliertem Abgleich `20261001115020`. Diese Funktionen belegen keine synthetische 500er Startbereitschaft. Der historische null500-Vertrag bindet 495 alte Testprofile plus 5 Bestandsprofile und 4 USD und passt nicht unveraendert zum neuen Auftrag. Der Befund wurde fuer diese Dokumentation nicht erneut gemessen. Fehlender synthetischer Import-/Start-/End- und Nachweisweg bleibt offen; der Azure-Lesezugang ist inzwischen nachgewiesen.
