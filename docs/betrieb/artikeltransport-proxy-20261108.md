# Artikeltransport über Proxy: isolierter, unverbundener Entwurf

Stand08.11.2026. Folgearbeit innerhalb [PR1106](https://github.com/ernisch/helmut-pilot/pull/1106), abhängig von [PR1104](https://github.com/ernisch/helmut-pilot/pull/1104). **Kein produktiver Anschluss und kein neuer Originalversuch.** `HTTPS_PROXY` aktiviert diesen Entwurf nicht. Der aktuelle Kopf und seine Pflicht-CI stehen im PR; CI42484377060 gehört ausschließlich zum früheren Kopf894139a1. #1104 bleibt947add8d mit offener eigener Endkopf-CI.

## Befund und harte Grenze

Der zuvor ausdrücklich freigegebene Radio-Einzelversuch endete17:42UTC mit `ECONNREFUSED`, ohne HTTP-Antwort. Die atomar gespeicherte Lücke `abruf-fehlgeschlagen`, ein Anbieterverbrauch und die freigegebene globale Sperre wurden nativ nachgeprüft. Dieser abgeschlossene Versuch wird nicht wiederholt oder zurückgesetzt. Im jetzigen Auftrag keine produktive Daten-/Schalteränderung, kein Modellaufruf und kein Deployment.

Der strikte Crawler verwendet `agent:false`, geprüfte IPv4-Auflösung und direkte HTTPS-Verbindung. Node erzeugt dafür einen neuen Agent ohne die Proxykonfiguration des globalen Agenten. Die Cloudumgebung verlangt ihren geerbten Proxy. Das erklärt den unbrauchbaren Direktpfad in dieser Umgebung, beweist aber keine allgemeine Nichterreichbarkeit von Radio Hannover.

Ein gewöhnlicher Hostname-CONNECT würde den Zielhost durch den Proxy erneut auflösen lassen. Eine vorherige lokale DNS-Prüfung bindet diesen zweiten Wert nicht. Ein CONNECT zur geprüften IP erhält die IP-Bindung, benötigt zusätzlich einen **belegten Proxyvertrag, der die Freigabe des Originalhosts und diese IP-Authority gemeinsam durchsetzt**. Andernfalls könnte die Hostregel des Proxys verloren gehen. TLS-Identität allein ersetzt diese Freigabe nicht.

Rein lesende Metadaten des vorhandenen Cloudproxys am08.11.,18:23UTC: HTTP-Regelmodus`denylist`, TCP-Zugang`enabled:false`, keine TCP-Domains/IP-Bereiche. Diese Angaben weisen weder eine Freigabe für rohe TCP-Tunnel noch die erforderliche gemeinsame Host-/IP-Prüfung nach. Keine Policy geändert, kein Artikelziel kontaktiert. **Der konkrete Proxy ist für diesen Entwurf nicht qualifiziert.** Deshalb kein automatischer Runtime-Aufrufer; keine neue Infrastruktur und kein Ersatztransport.

## Ausgearbeiteter Kandidat

`lib/helmut/artikelkontext-proxy-entwurf.js` stellt einen separat prüfbaren Agententwurf bereit:

- Bestehenden `artikelHost`-/`artikelLookup`-Schutz wiederverwenden: HTTPS-Artikeladresse, keine Zugangsdaten/IP-URLs/internen Namen; alle DNS-Antworten öffentlich und IPv4. Genau eine Auflösung, danach numerische CONNECT-Authority derselben IP auf443.
- Geerbte `https_proxy`/`HTTPS_PROXY` und `no_proxy`/`NO_PROXY` berücksichtigen; Kleinbuchstaben gehen vor. Keine Änderung der Umgebung, keine eigene Proxyadresse, kein `HTTP_PROXY`-Ersatz für HTTPS. Unbekannte Verfahren/Ausnahmeregeln bleiben Fehler. Unterstützte NO_PROXY-Formen: exakter Host/Port, führender Punkt, `*.` und `*`; IP-Einträge betreffen die hier verbotenen IP-Artikel-URLs.
- Zum deklarierten HTTP(S)-Proxy verbinden; Proxy-Authentifizierung ausschließlich am CONNECT, nie als Artikelheader. Keine Proxy-URL oder Zugangsdaten im Fehlertext. HTTPS-Proxy mit aktiver Zertifikatsprüfung.
- Nur200 und einen leeren Tunnelvorspann akzeptieren. TLS im Tunnel mit ursprünglichem SNI-Host, aktiver Kettenprüfung und unverändertem Node-`checkServerIdentity` für den Originalhost. Keine neue Vertrauenswurzel. Kein Agent-/Verbindungsrecycling und kein weiterer Host/Port.
- Bestehendes Abbruchsignal umfasst DNS, CONNECT und TLS; laufende Ressourcen bei Abbruch zerstören. Kein Hostname-CONNECT-/Direkt-/Curl-Fallback und kein Retry. Bei einer späteren geprüften Einbindung bleiben vorhandene20s-/1MiB-/UTF8-/Status-/Kompressionsgrenzen des Crawler-Antwortlesers maßgeblich.

**Der Crawler enthält weiterhin `agent:false` und importiert den Entwurf nicht.** Die einzige Verbindung zum Entwurfsagenten liegt im Test-HTTPS-Client. Ein späterer Anschluss benötigt erst den belegten Proxyvertrag; ein allgemeiner Proxy-Schalter oder ein bloßes Freigabe-Bool würde dafür nicht genügen. Quelle, Artikelidentität, Pubikationsstand und Belegspeicher bleiben unverändert.

Vier feste Fehler des Kandidaten werden im vorhandenen Anbieterklassifikator als Transportfehler erkannt, damit eine Tunnel-/TLS-Verweigerung nicht als erfolgreicher Quellenzugang gemeldet würde. Bisherige HTTP-/Fachfehlerregeln bleiben erhalten; keine Anbieterzeile im jetzigen Auftrag geändert.

## Isolierte Nachweise

`node scripts/lokal.js -- node scripts/artikelkontext-proxy-test.js`: **12/12 Gruppen bestanden**. DNS, Proxy, TLS und Originalantwort vollständig injiziert;0 echte Quellen-/Modell-/Datenbankaufrufe. Geprüft: Ziel-/IP-Bindung, private/gemischte DNS-Antworten, Proxywahl/NO_PROXY, Authentifizierung ohne Artikelweitergabe, TLS-Identität/-Fehler, Abbruch in jeder Verbindungsphase, Host-/Port-/Wiederverwendungssperre sowie Proxy403 ohne Fallback.

Positiver Integrationstest: Entwurfsagent ausschließlich im Test-HTTPS-Client an den unveränderten echten Crawler angeschlossen → vorhandene Radio-HTML-Probe → echter Extraktor und Beleg-CAS → echter Understanding-Aufrufer mit abgefangener `requestUnderstanding`-Funktion. Der ganze727-Zeichen-Absatz einschließlich bedingter Kürzung ab2027 steht in der tatsächlichen abgefangenen Modelleingabe. Roh-Summary bleibt null. Anschließende Bestandslesung ohne erneuten Tunnel. Negativ: Proxy403 wird als gespeicherte Lücke erhalten und nicht neu angefragt; Anbietermeldung ist kein Erfolg.

Die erste neue Testfassung benannte die Promptoption falsch (`artikelkontext` statt bestehendem `artikelkontextVersuch`) und scheiterte vor diesem Nachweis. Erwartung berichtigt und zusätzlich tatsächlichen Modellaufrufer abgefangen; kein Produktfehler daraus umgedeutet. Der zuletzt bestandene Entwurf wurde ausdrücklich wieder vom Runtime-Crawler getrennt, als die Proxyvertragslücke feststand.

Gezielt mitgeprüft: **12/12** bestehende Abrufschutzgruppen, **55/55** Anbieter-Fachpfadassertions, **24/24** globale Inhaltsanschlussgruppen. Andere unveränderte Extraktor- und Fachbelege werden weiterverwendet. Keine lokale Gesamtsuite. Die Attrappen beweisen weder einen echten TLS-Handshake noch IP-CONNECT-Unterstützung oder Policywirkung des verwalteten Proxys. Kein Live-Kompatibilitäts-PASS und keine neue produktive Inhaltsversorgung behauptet.

## Workflowgrenze, spätere Wirkung und Rückweg

`shadow-pilot.yml` und `sprint9b-verify.yml` enthalten echte Quellenabrufe. Ihr früherer automatischer PR-Trigger ist entfernt; manuelle `workflow_dispatch`-Wege bleiben vollständig erhalten. Ein Crawler-PR ist keine Freigabe für zusätzliche Liveabrufe. Pflichtchecks und Prüfplan bleiben unverändert; fehlende Livebeobachtung wird nicht als erfolgreicher Check ersetzt. Vor jedem Push kumulative PR-Pfade gegen sämtliche Trigger und gesperrtes Branchdeployment prüfen.

Nach einem belegten Proxyvertrag wäre ein späterer Anschluss weiterhin ein begrenzter Beschaffungsauftrag unter bestehender Sperre/CAS/Anbietersteuerung: höchstens ein Artikel-GET je neuem Versuch, vorhandenen Beleg global wiederverwenden, keine App-Abrufe. Ein neuer Radio-Versuch ist **nicht freigegeben**; sein vorhandener Lückenstand darf dafür weder still gelöscht noch zurückgesetzt werden. Umfang, Kontingentwirkung und CAS-Rückweg eines eventuellen neuen Auftrags wären konkret vorzulegen.0 Modellkosten für die jetzigen isolierten Nachweise; keine Geldschätzung für spätere Infrastruktur-/Netz-/Modellnutzung.

Rückweg jetzt: unverbundenen Kandidaten entfernen; keine Produktionsdaten oder Schalter zurückzustellen. Nach einem späteren Anschluss dessen Aufrufer entfernen und neue Belege unbenutzt erhalten; historische Lücken, Verbrauch und Schutzstatus nicht manipulieren. DGB-Titelbindung,317 historische Google-Leerfelder und reguläre Laufqualifikation bleiben offen.

**Genau nächster Schritt:** Den verbindlichen Vertrag des vorhandenen Cloudproxys für gemeinsame Originalhost-Freigabe und IP-CONNECT-Bindung klären, bevor ein Runtime-Anschluss oder neuer Originalversuch vorbereitet wird.
