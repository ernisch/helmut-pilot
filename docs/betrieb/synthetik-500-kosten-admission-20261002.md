# Inaktive zentrale Admissionvorbereitung

Die [Vertragsnaht](../../lib/helmut/synthetik-500-kosten-admission.js) und die
Anbindung an `ai.requestOpenAI` / `testkosten-budget.reserviere` sind Codevorbereitung.
Sie installieren keinen Planslot, aktivieren keine Profile, schreiben keine Flags,
erhoehen kein Budget und starten keinen Anbieter- oder 500er Lauf. Es gibt keinen
Planinstallierer und keinen Aktivierungsendpunkt. `wholeEnforcement=false` bleibt
ausdruecklich bestehen; die vorbereitete Inventur ist kein aktiver Admissionplan.

Ein kuenftig separat und konkret gebundener Auth-Slot `synthetik500KostenAdmission`
muesste einen unveraenderlichen Plan samt Planhash und eine getrennte Verbrauchskarte
enthalten. Der Plan bindet Laufkennung `nachlauf500-<5..20 Ziffern>`, eigenstaendige
`synthetik500-…`-Operation, Productioncommit, Runtime-Manifesthash und hoechstens
vier Stunden innerhalb desselben UTC-Tags. Er enthaelt eine endliche Liste mit
einem Versuch je Position. Die Formatgrenze5000 ist keine Aufrufzuteilung oder GO.
Kennungen und Hashes muessen primitive Strings sein; doppelte Profil-/Phasen- oder
Vorgangspositionen, ungueltige Typen, Fremdlauf und Versionsdrift stoppen.

D bindet synthetische Profilkennung, deklarierte64er Kontextversion und den
kanonischen Hash des tatsaechlichen Providerpayloads. U bindet Vorgangskennung,
den originalen40er Hash aus dem bestehenden Verstehensvertrag und getrennt
denselben64er Payloadhash. Die beiden Verstehenspfade reichen ihre wirkliche
Vertragseingabe nun an den Defaultadapter weiter. Ein40er Vertragshash ist weder
ein64er Requesthash noch ein Volltextversionsbeleg. Der zentrale Sender berechnet
seinen Hash aus genau dem JSON-Payload, den er sendet, einschliesslich Modell,
Input, Ausgabelimit, Denkstufe und Schema; er speichert keine Prompts im Geldticket.
Vor HTTP prueft er Hash, Fenster und Commit erneut. Providerkonto/Route und Preise
werden dadurch noch nicht unabhaengig oder authentifiziert nachgewiesen.

Die Intentpruefung steht innerhalb des vorhandenen Auth-Store-CAS. Erst nach allen
Tages-/Auftragsgeldpruefungen wird der Intent zusammen mit `t.calls[id]` verbraucht.
Ein Budgetstopp verbraucht keine Position. Ticket und Verbrauchskarte sind
gegenseitig gebunden; das Entfernen eines Verbrauchsmarkers reaktiviert kein
vorhandenes Ticket. Bestaetigte CAS-Konflikte behandelt ausschliesslich der
bestehende Auth-Schreiber. Bei unklarem Schreibausgang wird kein HTTP gesendet und
kein Versuch wiederholt. Ein Nicht-Sendebeleg kann die bestehende Geldreserve
abrechnen; er setzt den verbrauchten Intent nicht zurueck.

Bei fehlendem Planslot bleibt der gesunde bisherige Callpfad erhalten. Neu ist die
rein lesende Slotpruefung auch bei ausgeschaltetem Dollar-Kostenriegel: ein
vorhandener Plan oder nicht bestaetigbarer Lesestand stoppt dann vor HTTP.
Der engere Fehlerfall ist beabsichtigt; ein Lesefehler beweist keine Planabwesenheit.
Nur diese neue inaktive Pruefung benutzt den opt-in-strengen Authleser. Er stoppt
bei beschaedigtem/ungueltigem lokalem JSON, anderen lokalen Lesefehlern und einer
ausdruecklichen Supabasekonfiguration ohne URL oder Servicerecht. Ein bestaetigtes
lokales `ENOENT` beziehungsweise eine fehlende Supabasezeile bleibt eine bekannte
Storeabwesenheit. Andere Authleser behalten ihren bisherigen Fallback unveraendert.
Die spaetere Installation oder Entfernung eines Plans benoetigt weiterhin einen
konkreten Freigabe- und Ruhebeleg. Ein paralleles Einsetzen eines Plans nach einer
frueheren Abwesenheitslesung ist durch diese Vorbereitung nicht endabgenommen.

R bleibt **immer gesperrt**, auch mit formal richtiger endlicher D-Abhaengigkeit
oder einem vom Aufrufer behaupteten Receipt. Die echte D-Quittung und der daraus
gebildete exakte Reviewinput sind noch nicht sicher angebunden. Pending-Hashes
`null` sind deshalb keine gueltige Reviewfreigabe. Der regulaere3000er Modus und
der vorhandene ausdrueckliche6000er Reviewmodus werden nicht abgesenkt.

Weitere offene Tore: ein tatsaechlicher synthetischer500er Executor, die vollstaendige
endliche U-Liste aus echten Dokument-/Vorgangsversionen, der getrennte Ausschluss
oder eine eigene endliche Aufnahme des Embedding-HTTP-Pfads, frische Konfiguration,
vollstaendiger Snapshot und Endwaechter sowie Geld-/Aktivierungs-/Test-GO.
Profil-Fixtures und1500 Sollpositionen bestimmen die U-Liste nicht.
Der bisherige Textnachlauf verlangt495 aktive alte Testprofile und passt nicht
unveraendert zur neuen vollstaendig synthetischen Kohorte. Die6USD/UTC-Tag und
7USD kumulativ einschliesslich offener Reserven bleiben unveraendert.

Die neue [gezielte Suite](../../scripts/synthetik-500-kosten-admission-test.js)
prueft den echten Geldreservecode mit einer isolierten Speicherfixture und den
zentralen AI-Einstieg mit einem HTTPS-Stub: Doppelaufnahme, Fremdlauf, Drift,
Budgetablehnung, unklaren CAS, fehlenden Planslot, inaktiven Kostenriegel,
Nicht-Sende-Verbrauchsschutz sowie U-Metadaten beider Verstehenspfade.
Vier zusaetzliche gezielte Faelle verwenden den echten strengen Authleser fuer
lokale JSON-/Dateifehler, fehlende Supabasekonfiguration sowie den gesunden oder
bestaetigt fehlenden lokalen Store. `--strict-read-only` fuehrt nur diese Faelle aus.
Sie fuehrt keine alten Suiten, Datenbank oder Anbieter auf und erteilt keine
Production-Endabnahme. Registrierung im Pflichtlauf erfolgt bei Zusammenfuehrung.
