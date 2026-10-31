# End500: Import des vorhandenen Auth-Beobachters

Die isolierte End500-Anwendung verwendet den vorhandenen `observeAuth`-Export
aus `synthetik-500-w15-full500-runtime.js`. Dieses Modul lädt beim Import auch
den öffentlichen Helfer `scripts/w15-github/mock500_bindings.js`. Der Helfer
gehört daher zum vorbereiteten öffentlichen Anwendungsverzeichnis, auch wenn
der End500-Pfad keine Mock500-Eingaben verwendet.

Die gezielte Prüfung muss die tatsächliche vorbereitete Anwendung einschließlich
Server, Forward-Modul, Runtime-Modul und Auth-Beobachter abdecken. Der reine
Import des Forward-Moduls beweist nicht, dass dessen später geladene Module
bereitstehen. Dafür sind weder Originaldaten noch Datenbankoperationen,
Profilaktivierungen oder ein vollständiger Testlauf erforderlich.

Die Bereitstellung verwendet den bestehenden festen Skriptkatalog und die
vorhandene Codequalifikation. Private Mock500-Dateien werden dadurch keine
End500-Voraussetzung. RAM-, Zeit-, Kosten-, Integritäts- und Freigabeverträge
bleiben unverändert. Der getrennte Kapazitätsdiagnosemodus begründet weiterhin
keine reguläre End500-, Mock500- oder Production-Abnahme.
