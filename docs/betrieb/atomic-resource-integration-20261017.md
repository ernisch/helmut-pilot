# Anbindung des atomaren Verbrauchsspeichers an den Ressourcenlauf

Lokale Entwicklung vom 17.10.2026. Kein neuer vollständiger 500er Lauf, keine
Profilaktivierung, kein GO-Verbrauch und keine Productionänderung.

Der [vorher qualifizierte Kandidat](llm-usage-atomic-local-20261017.md) ist jetzt
ausdrücklich zuschaltbar in den bestehenden Messablauf eingebunden. Der bisherige
Speichermodus bleibt Standard. Die eingefrorenen 26 Ablaufdateien und alle
historischen Aufträge bleiben unverändert. Nur neue abgeleitete Kopien erhalten
die in `connect-local500.render_templates` vollständig aufgezeichneten Änderungen.

## Tatsächliche Übergänge

1. Der vollständige Vorabcheck bindet den Kandidatendeskriptor, sämtliche
   Laufzeit-/SQL-Quelldateien und deren tatsächliche Containersichtbarkeit.
   Er prüft zusätzlich das echte unveränderte Eingangsschema rein lesend.
2. Erst im separat freizugebenden gemessenen Vorbereitungsschritt, nach dem
   bestehenden echten lokalen GO-/Aktivierungsablauf, übernimmt der Helfer
   einmal die Historie in der neuen eigenen Zieldatenbank. Vorher prüft er
   Datenbanknamen, Eingangsschema und Originalhash. Der übrige Kontostand wird
   einschließlich aller Bücher/Einträge gegen den rekonstruierten Stand verglichen.
   DDL, Bootstrap und Prüfung bleiben vollständig im gemessenen Abschnitt.
3. Dienste starten danach. Laufzeit, Root-Prüfung, Installation und bestehender
   U-/500er Ablauf erhalten denselben gebundenen Speichermodus. Der neue private
   Ablaufkontext verweist auf den tatsächlich erzeugten Bootstrapbeleg.
4. Native Leseprüfungen nutzen die echte Datenbankrekonstruktion mit unveränderter
   READ-ONLY-Transaktion. Physischer Hash und Generation werden getrennt erfasst.
   Ein schmaler lateraler Auswertungsrahmen verhindert wiederholte Rekonstruktion
   je Datenfeld; es gibt keine zusätzliche Tabelle, Cacheinfrastruktur oder
   materialisierte Kopie aller Konten-/Auftragszeilen.
5. Die native Katalogprüfung kontrolliert sechs Funktionskörper samt Signaturen,
   Rückgabetypen, Owner, Invoker/Definer, Suchpfad, Volatilität und Execute-Rechten;
   zusätzlich beide tatsächlichen generierten Hashausdrücke sowie die vier
   ALWAYS-Trigger mit Tabelle, Funktion, Ereignistyp und Bedingung.

Die Inhaltsbindung erfasst jetzt auch `llm-usage-atomic.js`, Konten-CAS, KI-Code
und den Speichermodus. Genau ein historischer Budget-Quellpin wurde auf den bereits
angenommenen Code aus Commit `07c009b2` aktualisiert. Die übrigen 66 strikten
Quellpins und der Workerpin bleiben erhalten. Neue Bindungen gelten ausschließlich
für neue Aufträge; keine Wiederverwendung bestehender Belege.

## Gezielte Abnahmebelege

| Umfang | Tatsächlich bestanden |
| --- | ---: |
| Neue Ableitungs-, Bindungs- und Katalognegativtests | 7 |
| Bestehender vollständiger Startvorabcheck | 15 |
| Lesedateivertrag und Prozessabschluss | 11 |
| Verbraucherschnittstellen | 6 |
| Inhaltsnachweise, frische Kontrollen und Wiederverwendung | 81 |

Zusammen 120 gezielte Offlineprüfungen. Dies ist kein 8000-Kontrollen-Nachweis
eines neuen vollständigen 500er Laufs.

Zusätzlich bestanden kleine neue, netzisolierte PostgreSQL/PostgREST-Prüfungen
ohne Profiltabelle: tatsächlicher Installations-/Übernahmehelfer, 5000 vollständig
erhaltene historische Einträge, tatsächlicher Storage-Leseweg, getrennte native
physische/logische Hashes, SELECT und WITH, sowie verweigerte Schreibversuche in
READ ONLY. Die Mehrfeldabfrage rekonstruiert die Historie nachweislich genau einmal.
Es entstehen 0 temporäre Dateien. Der letzte kleine Prüflauf hat 299.413.504 B
gemeinsamen Kernelpeak und vollständig beendete eigene Prozesse. Dieser Wert
belegt keine Ressourcen- oder Zeitgrenze des vollständigen 500er Ablaufs.

Ein SQL-Operatorvorrangfehler im neuen Übernahmehelfer wurde im kleinen Test
gefunden und korrigiert. Der fehlgeschlagene kleine Fall wurde nicht fortgesetzt;
seine Belege bleiben erhalten. Kein vollständiger Versuch und kein GO betroffen.

Der reale eingefrorene korrigierte Eingang wurde rein lesend geprüft: 5000
eindeutige historische IDs, 0 relationale Altzeilen/ID-Kollisionen und kompatibles
unverändertes Schema. Das ist keine neue Ausführungserlaubnis.

Die zusätzliche Eindeutigkeits-/Kollisionsvorprüfung wurde nach dem letzten
kleinen Installationsfall ergänzt. Ihre tatsächliche SQL-Abfrage wurde am
eingefrorenen Eingang rein lesend geprüft; die passenden Negativfälle gehören
zu den sieben neuen Offlineprüfungen. Es wird keine spätere vollständige
Ausführung dieses gesamten Endstands behauptet.

DeepSeek Flash High hat die abgegrenzte Weitergabe an die fünf Verbraucher
ohne konkrete Anbindungslücke geprüft. Sein Gesamtstatus bleibt wegen offener
Startbedingungen `blocked`. Zwei begrenzte DeepSeek-Pro-High-Aufträge lieferten
wegen des festen Ausgabetokenlimits keine abgeschlossene Abnahme. Nach diesem
belegten Hindernis hat ein unabhängiger Sol-Prüfer (`gpt-6.1-sol`, Sehr hoch)
das verbleibende native Integrationsdelta rein lesend angenommen. Er führte
keine Tests aus. Die bestehende DeepSeek-Pro-Abnahme des unveränderten
Speicherkerns aus dem vorherigen Sprint bleibt davon getrennt.

Die atomare Zusicherung gilt für den Bootstrap-RPC. Schemainstallation,
Bootstrap und anschließende Nachprüfung sind getrennte Transaktionen. Bei
Fehler endet die neue isolierte Kopie ohne Erfolgsquittung; eine automatische
Fortsetzung oder Wiederholung ist damit nicht freigegeben.

## Verbleibende tatsächliche Startblocker

- Der bisherige V4-Slot ist verbraucht. Es wurde kein neuer Autorisierungsslot
  aktiviert und kein GO-Dokument erzeugt. Ein neuer konkreter Fall mit neuer
  unabhängiger Gesamtinventarabnahme bleibt erforderlich.
- Das bisher angenommene Tagesfenster für den 17.10. ist abgelaufen. Für den
  18.10. weist der originale Finanzcheck im unveränderten Eingang das fehlende
  historische Buch vom 17.10. zurück. Auch das aktuelle Buch des 18.10. existiert
  dort noch nicht. Keine historische Korrektur oder neue Tagesbindung angewendet.
- Es fehlen rund 7,1 GB der vorgeschriebenen freien Plattenreserve. Maßgeblich
  bleibt die frische Ablesung vor einem Lauf. Ein kleiner bestehender
  Loop-Control-Test hat inzwischen das ungebundene Gerät `loop11` nachgewiesen;
  es wurde kein Datenträger zugeordnet, formatiert oder gemountet. Die tatsächliche
  atomare Zuordnung im neuen Lauf bleibt erforderlich. Geschützte Originale,
  beanspruchte Fälle, alte Belege und fremde Ressourcen wurden nicht gelöscht
  oder umgehängt.
- Unit60, Auth30, Offline90, 500 Abschlüsse/1500 Positionen und der vollständige
  gemeinsame Speicher unter 2.048.000.000 B bleiben mit diesem Kandidaten offen.
  Die frühere Reserve von 1,049644 s ist keine Abnahme dieses Kandidaten.

Eine rein lesende Machbarkeitsprüfung für ein mögliches Fenster am 18.10.
ergab bei allen 500 bestehenden Eingaben denselben vorhandenen Tagesanlass
und stabile Darstellung. Sie erzeugt keine neuen Eingaben, Fachurteile oder
Tagesabnahme und ersetzt den fehlenden Buchnachweis nicht.

Vor einer GO-Anfrage müssen diese technischen Bindungen und alle 32 bestehenden
Startbedingungen mit dem neuen Fall nachgewiesen sein. Fehlendes Betreiber-GO
bleibt davon getrennt. Kein Merge, Deployment, Productioneingriff, Budgeteingriff
oder bezahlter Productionmodellaufruf ist aus diesem Dokument freigegeben.
