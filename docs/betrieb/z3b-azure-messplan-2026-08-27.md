# Z3b Azure Messplan vom 27.08.2026

## Stand

Der Messlaeufer ist lokal vorbereitet und offline geprueft. Der Vertragstest steht bei
**49 PASS und 0 FAIL**. Es wurde kein Azure Aufruf ausgefuehrt, kein Zugangsschluessel gelesen,
keine Kostenfreigabe verbraucht und weder Supabase noch Production beruehrt.

Diese Probe wiederholt weder Z2 noch Z3a. Sie misst ausschliesslich die dort noch fehlenden
echten Azure Werte: Laufzeit und den vom Anbieter gemeldeten Tokenverbrauch fuer drei bereits
vorhandene Helmut Arbeitsformen.

## Kleinste sinnvolle Messung

Die Messung besteht aus zwei getrennt freizugebenden Paketen. Das zweite Paket startet nie
automatisch nach dem ersten.

| Paket | Verstehen | Lage | Buero | Gesamt | Zweck |
|---|---:|---:|---:|---:|---|
| Vorprobe | 1 | 1 | 1 | 3 | Erreichbarkeit, Antwortform und erste echte Tokenwerte |
| Stichprobe | 7 | 7 | 7 | 21 | begrenzte Laufzeitverteilung nach gruener Vorprobe |
| Obergrenze beider Pakete | 8 | 8 | 8 | **24** | kein Lasttest des Anbieters |

Alle Aufrufe laufen nacheinander, mit Parallelitaet eins und ohne automatische Wiederholung.
Ein Fehler, eine Drosselung, eine Zeitueberschreitung, ein unvollstaendiger Status oder ein
fehlender `usage` Block beendet das jeweilige Paket sofort.

## Daten und Ausgabe

Die Prompts werden lokal aus kuenstlichen Vorgangs-, Lage- und Buerodaten gebaut. Sie verwenden
die echten Helmut Promptvertraege und Schemas, enthalten aber keine echten Mandate, Personen,
Quellen, Dokumente oder Production Inhalte. Quellenzugriffe sind technisch ausgeschaltet.

Jede Anfrage setzt `store: false`. Der Bericht enthaelt nur Summen und Verteilungen:

1. Laufzeit p50, p95, p99 und Maximum je Arbeitsform
2. Eingabe-, Ausgabe-, Cache- und Reasoning-Token
3. Promptgroesse im Verhaeltnis zu Eingabetoken
4. konservativ berechnete Kosten auf Basis der am Lauftag bestaetigten Preise

Nicht gespeichert oder ausgegeben werden Prompt, Modellantwort, Antwortkennung,
Anfragekennung, Zugangsschluessel oder der Azure Hostname. Vom Ziel erscheint nur ein kurzer
Fingerabdruck, damit ein Lauf demselben Ziel zugeordnet werden kann.

## Kostenriegel

Vor jedem Paket muessen der Azure Eingabe- und Ausgabepreis sowie eine knappe Preisquelle
ausdruecklich angegeben werden. Der Laeufer berechnet vor dem ersten Netzaufruf eine absichtlich
hohe Obergrenze aus dem vollstaendigen Request, dem JSON Schema, einem Anbieterpuffer und den
maximal moeglichen Ausgabetoken. Liegt diese Obergrenze ueber der freigegebenen Summe, startet
kein Aufruf.

Technisch akzeptiert das Werkzeug niemals ein Kostenlimit ueber **1 USD**. Ein kleineres Limit
wird fuer jedes Paket einzeln festgelegt. Die Zahlen im Offline Test sind reine Rechenwerte und
keine Behauptung ueber den Azure Vertrag. Der konkrete Azure Preis wird erst am Lauftag gegen
die fuer Konto, Region und Deployment gueltige Preisquelle bestaetigt.

## Preisgrundlage am 27.08.2026

Die offizielle Azure Preisseite nennt fuer `GPT-5-mini` derzeit unterschiedliche Preise je
Deploymentart. Alle Werte gelten pro eine Million Token und sind Listenpreise in USD:

| Deploymentart | Eingabe | Cache Eingabe | Ausgabe |
|---|---:|---:|---:|
| Global | 0,25 USD | 0,03 USD | 2,00 USD |
| Data Zone | 0,28 USD | 0,03 USD | 2,20 USD |

Quelle: [Azure OpenAI Service Pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)

Der bisherige Rechenwert von 0,25 USD fuer Eingabe und 2,00 USD fuer Ausgabe darf deshalb nur
verwendet werden, wenn im Azure Portal **Global** als Deploymentart bestaetigt wurde. Fuer eine
EU Data Zone gelten die hoeheren Data Zone Werte. Fuer ein regionales Deployment wird kein Preis
geraten. Dort muss vor der Vorprobe der im Azure Konto angezeigte aktuelle Preis eingetragen
werden. Ein kundenspezifischer Vertragspreis hat immer Vorrang vor dem Listenpreis.

Reasoning Token werden von Azure als Ausgabetoken berechnet. Deshalb umfasst der technische
Ausgaberiegel sowohl sichtbare Ausgabe als auch Reasoning und Formatierung. Quelle:
[Azure OpenAI Reasoning Modelle](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)

Vor jeder kostenpflichtigen Vorprobe muessen daher genau diese vier Angaben rein lesend im
Azure Portal bestaetigt sein:

1. Deploymentname und tatsaechliches Modell `gpt-5-mini`
2. Deploymentart Global, EU Data Zone oder Regional
3. Ressourcenregion, voraussichtlich Sweden Central, aber nicht aus Altunterlagen uebernehmen
4. fuer das Konto gueltiger Eingabe-, Cache- und Ausgabepreis mit Datum und Quelle

Der Messlaeufer erzwingt diese Angaben jetzt technisch: Der separat im Portal gepruefte
Modelltyp muss exakt als `HELMUT_Z3B_AZURE_MODELL=gpt-5-mini` angegeben werden. Die
Deploymentart muss exakt `global`, `data-zone` oder `regional` lauten, die Region muss als
normalisierter Azure Regionsname wie `swedencentral` vorliegen und das Preisdatum muss dem UTC
Lauftag entsprechen. Der Wert `model` im v1 Request bleibt dagegen der Deploymentname und ist
kein eigener Beleg fuer den Modelltyp. Cache Token werden in der Kostenoberrechnung weiterhin
absichtlich zum vollen Eingabepreis gerechnet. Dadurch bleibt der Riegel konservativ, auch wenn
kein Cache Rabatt angesetzt wird.

Solange eine dieser Angaben fehlt, bleibt der Azure Netzlauf gesperrt. Die Pruefung der Angaben
veraendert das Deployment nicht und verursacht keine Modellaufrufe. Die Vorprobe selbst bleibt
eine separate Kostenfreigabe.

## Zielriegel

Der Laeufer akzeptiert nur eine exakt normalisierte Azure OpenAI Basisadresse der Form
`https://<ressource>.openai.azure.com`. Pfade, Parameter, Zugangsdaten in der URL, beliebige
Hosts und ein zweiter Schluesselname werden vor dem ersten Netzaufruf abgelehnt.

Er verwendet danach ausschliesslich `POST /openai/v1/responses` mit `api-key`, so wie es die
aktuelle Azure v1 Schnittstelle vorsieht. Supabase Kennungen und andere Providerkennungen duerfen
im Messprozess nicht sichtbar sein. Das Werkzeug besitzt keinen Datenbank- oder Importpfad.

Offizielle Schnittstellenbelege:

1. [Azure Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
2. [Azure Responses REST Referenz](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses)
3. [Azure v1 API Lebenszyklus](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)

## Was die 24 Aufrufe beweisen und was nicht

Die Probe liefert echte Laufzeit- und Tokenwerte fuer die drei Arbeitsformen auf dem gewaehlten
Deployment. Sie ist bewusst klein. Bei sieben Werten je Klasse sind p95 und p99 im Wesentlichen
der jeweils langsamste beobachtete Wert. Deshalb sind die Werte eine konservativ auszuwertende
Stichprobe, aber kein Anbieter-SLO und kein Beweis fuer 500 gleichzeitige Mandate.

Der notwendige KI Deckel entsteht erst aus der Verbindung von:

1. echten Tokenwerten dieser Azure Probe
2. bereits gemessener Auftragsmenge aus Z3a, ohne Z3a neu zu fahren
3. den bereits bis 500 gemessenen isolierten Supabase Plattformwerten
4. einer Sicherheitsreserve und dem siebentaegigen Beobachtungstor jeder Aktivierungsstufe

Eine Hochrechnung darf nicht als Lastnachweis ausgegeben werden. Die Stufen 10, 25, 50 und 100
bleiben eigene Aktivierungstore. 200 und 500 folgen nur nach gruenem 100er beziehungsweise
200er Tor.

## Noch gesperrt

1. Zugangsschluessel in die geschuetzte Laufzeit geben
2. Preis und Kostenlimit am Lauftag bestaetigen
3. die drei Aufrufe der Vorprobe ausfuehren
4. bei gruener Vorprobe die weiteren 21 Aufrufe getrennt freigeben

Jeder dieser Schritte benoetigt eine ausdrueckliche Freigabe. Der lokale Vorbereitungsstand
allein verursacht keine Kosten und veraendert weder Azure noch Supabase noch Production.
