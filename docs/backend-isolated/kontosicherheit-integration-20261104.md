# Gezielte Abnahme des tatsächlich integrierten Kontoschutzes

**PASS: 32/32 Prüfungen, 56 echte lokale HTTP-Requests und zwei gezielte Offline-CAS-Prüfungen.** Getestet wurden die tatsächlich integrierten Quellbytes aus `/workspace/helmut-claude-backend-isolated/lib/helmut/accounts.js`, SHA256 `608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703`.

Der Teststart erfolgte erst nach der ausdrücklichen Nachricht **INTEGRIERT**. Root hatte die beiden unveränderten D1-/D2-Patches bereits angewandt; HEAD war weiterhin `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be` auf `feat/claude-backend-isolated`. Dieser Harness hat keine Patchdatei gelesen oder angewandt und keine Rootdatei geschrieben.

## Was abgenommen wurde

- Unveränderter D1-Worker: neun gezielte Statusprüfgruppen mit echten Login-/Session-/CSRF-/Admin-HTTP-Pfaden. `deaktiviert` und `gekuendigt` lassen sich weder durch widersprüchliches noch einzelnes `active:true` aufheben. Reguläres Sperren entzieht Sitzung und Passwortlogin; bewusste Statusreaktivierung bleibt möglich.
- Unveränderter D2-Worker: sieben Szenarien mit 21 Prüfungen. Letzter anmeldbarer Admin bleibt bei Status-/Aktiv-/Rollenentzug erhalten; eingeladene oder gesperrte Ersatzkonten genügen nicht. Bestehende Löschsperren und legitime Übergabe bleiben bestehen. Zwei gleichzeitige Entzüge ergeben jeweils HTTP 200 + 409 und erhalten einen Admin.
- Zwei neue kleine CAS-Regressionen verwenden den tatsächlichen integrierten Accounts-/Storage-/CAS-Code mit deterministischem Transportersatz. Ein veralteter Schreiber kann keinen frisch gespeicherten Auth-Stand überschreiben. Bei einem gezielt eingeschobenen Peer-Rollenentzug wird der erste bedingte Schreibversuch abgewiesen; die echte Mutation liest erneut (`GET`, `PATCH`, `GET`) und verweigert danach den Verlust des letzten Admins mit 409.

Der historische D1-Worker nennt seinen erfolgreichen Statusmodus weiterhin `PASS_CANDIDATE_STATUS_REGRESSION`; die neue äußere Belegbindung weist ausdrücklich den **aktuellen integrierten Rootquellstand** nach. Seine Patch-Metadaten bleiben leer. Es wurde kein alter Kandidat rekonstruiert.

## Isolation und Grenzen

Pro HTTP-Szenario sowie für die beiden CAS-Fälle wurden frische lokale Wegwerfklone mit eigenen Git-Metadaten erzeugt. Jeder bekam ausschließlich die unverändert aus dem aktuellen Rootcheckout gelesenen `accounts.js`-Bytes. Alle neun beobachteten Laufzeitdateien wurden gegen den aktuellen Rootsnapshot verglichen; einzig `accounts.js` weicht erwartbar vom Basiscommit ab. Nach allen Prüfungen stimmen die Root-, eigenen Basis- und unveränderten Workerhashes weiterhin überein. Alle neun Laufzeitklone wurden entfernt.

Die HTTP-Fälle verwenden lokalen Dateispeicher und **eine Node-Instanz pro Fall**. Die beiden parallelen HTTP-Requests passieren echte Auth-/CSRF-/Rollenprüfung; eine Testbarriere synchronisiert sie unmittelbar vor der echten Kontomutation. Es ist kein verteilter Datenbank- oder Mehrprozessnachweis.

Die CAS-Fälle ersetzen ausschließlich den Transport durch eine deterministische Speicherabbildung. Innerhalb dieses eigenen Kindprozesses wird der vorhandene bedingte Speicherpfad mit einer lokalen Dummyadresse und einem synthetischen, unbrauchbaren Schlüsselplatzhalter ausgewählt. `fetch` ist vollständig ersetzt und verlangt exakt diese Dummyadresse. **Keine echte Datenbank, keine echten Credentials und keine Netzwerkanfrage.** Dies belegt die Wiederholungs-/Schutzlogik, keinen neuen Production-/Supabase-DB-Nachweis.

Alle Kindprozesse starten über vorhandenes `scripts/lokal.js` mit kleiner expliziter Environment-Allowlist, Quellenmodus aus und Kommunikationsriegel gesperrt. Keine Quellen-, Motor-, Profilaktivierungs-, Budget-, Modell-, Mail- oder Production-Aktion. Die HTTP-Worker melden null Profil-Schreibversuche, null gespeicherte Profile und null Fetchversuche. Keine Installation, kein Commit/Push/Merge/Deployment. Sicherheitsreview liegt getrennt beim bestehenden Reviewer.

## Dateien und Hashes

Neue Dateien ausschließlich unter `/workspace/helmut-kontosicherheit-integration-20261104`:

| Datei | SHA256 |
|---|---|
| [Harness](../../scripts/kontosicherheit-integration-test.js) | `8340b51ea574217d48c088c8f2fab47a81478354dc06aa8e52d492a3bbbb7b51` |
| [Maschinenbeleg](kontosicherheit-integration-pruefbeleg-20261104.json) | `23ccc7b67a61ab7f6c4b90528b3a53dc218aa6f5675744d5767ac4c300b490c9` |
| [Log](kontosicherheit-integration-20261104.log) | `1dbfbb50e310d05cf88a42e4aeb1c71d17396af321fd5166370b49f02ba24155` |

Unveränderte Worker werden wegen ihrer vorhandenen Pfadbindung ausschließlich lesend aus `/workspace/helmut-backend-sprint-b-20261104/scripts` ausgeführt:

- `sprint-d-kontoverwaltung-test.js`: `5eb0699c03616e0db8aec32c01197e456b853f98dbc5d137a37dedb3a04bd068`
- `sprint-d2-last-admin-test.js`: `0570d4fc80432ecf66cead592e64ddea39409cee1d7a5ad4bb576fc791e51a09`

Reproduktion nur im eigenen Integrationsbereich, mit der im Harness `fixedEnv()` angegebenen Allowlist: `node scripts/lokal.js scripts/kontosicherheit-integration-test.js`. Der Harness bindet Basiscommit, ursprüngliche Worker und den tatsächlichen integrierten Rootquellhash und stoppt bei Abweichung. Er besitzt keinen Patchanwendungsweg.
