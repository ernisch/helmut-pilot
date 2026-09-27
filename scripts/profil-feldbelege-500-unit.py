"""Gezielte Gegenproben fuer die Parteiabbildung und die gepruefte Ergaenzungsquittung.

Nur lokal/offline. Prueft fail closed: Quelldrift, Fraktion-ist-keine-Partei,
offene-bleiben-offen sowie Duplikat/Fremdkennung/unerwarteter Status/Konflikt.
"""
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace

BUNDESTAG_NOURIPOUR = Path('/private/tmp/helmut-be-bb-start/detailseiten/bundestag-nouripour_omid-1046368.html')

spec = importlib.util.spec_from_file_location('assembler', Path(__file__).with_name('profil-feldbelege-500.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def _quelle(root, datei, url, kennung):
    pfad = root / datei
    return dict(url=url, finalUrl=url, abgerufenAm='2026-09-27T14:00:00Z',
                sha256=m._sha256(pfad), bytes=pfad.stat().st_size, datei=datei,
                http=200, abrufStatus='abgerufen', amtlicheKennung=kennung)


def _eingang(root, quelle, extraktion, ergaenzung=None):
    return SimpleNamespace(detailseiten=root, abruf_by_url={quelle['url']: quelle},
                           extraktion_by_url={quelle['url']: extraktion},
                           ergaenzung_by_kennung=ergaenzung or {}, ergaenzung_verwendet=set())


def _erwarte_fehler(fn, was):
    try:
        fn()
    except m.AssemblerFehler:
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)

    # 1 · Belegte Berliner h1-Partei bleibt bei Fraktionslosigkeit erhalten.
    (root / 'profil.html').write_text('<h1>Erika Muster, SPD</h1>')
    url = 'https://www.parlament-berlin.de/Abgeordnete/erika-muster'
    quelle = _quelle(root, 'profil.html', url, 'erika-muster')
    profil = dict(vollname='Erika Muster', bundesland='Berlin', partei='SPD',
                  fraktionslos=True, wahlkreis='Mitte, Wahlkreis 1', ausschuesse=['Haushaltsausschuss'])
    extraktion = dict(profil=profil, quelle=quelle, offen=[], feldbelege={})
    eingang = _eingang(root, quelle, extraktion)
    auswahl = dict(url=url, text='Muster, Erika', fraktion='fraktionslos',
                   amtlicheKennung='erika-muster', parlament='landtag-berlin')
    result = m._baue_datensatz(eingang, auswahl)
    assert result['profil']['partei'] == 'SPD'
    assert result['profil']['fraktionslos'] is True
    assert 'fraktion' not in result['profil']
    assert result['importfreigegeben'] is False
    profil['partei'] = 'CDU'
    _erwarte_fehler(lambda: m._baue_datensatz(eingang, auswahl), 'abweichende h1/Extraktion-Partei')

    # 2 · Brandenburg: ausdruecklich parteiloser Profilkopf wird erkannt.
    (root / 'bb.html').write_text('<h1>Erika Muster</h1><p>parteilos<br />Amt</p><h2>Lebenslauf</h2>')
    bb_quelle = _quelle(root, 'bb.html', 'https://www.landtag.brandenburg.de/de/abgeordnete/erika', 'erika')
    bb_profil = dict(vollname='Erika Muster', bundesland='Brandenburg', wahlkreis='Wahlkreis 1 (Test)')
    bb_extraktion = dict(profil=bb_profil, quelle=bb_quelle, offen=[], feldbelege={})
    bb_eingang = _eingang(root, bb_quelle, bb_extraktion)
    bb_eingang.partei_by_url = {bb_quelle['url']: dict(sha256=bb_quelle['sha256'], status='offen')}
    bb_auswahl = dict(url=bb_quelle['url'], text='Muster, Erika', fraktion='-',
                      amtlicheKennung='erika', parlament='landtag-brandenburg')
    assert m._parteinachweis(bb_eingang, bb_auswahl, bb_extraktion)['status'] == 'parteilos'

    # 3 · Fraktion ist keine Partei: Bundestag bleibt offen und ohne Quittung fail closed.
    (root / 'bt.html').write_text(
        '<h1>Erika Muster</h1>'
        '<p class="m-biography__introInfo"><strong>Bündnis 90/Die Grünen</strong></p>'
        '<p>Biografie ohne ausdrueckliche Parteiangabe.</p>')
    bt_quelle = _quelle(root, 'bt.html', 'https://www.bundestag.de/abgeordnete/biografien/M/muster_erika-1', 'muster_erika-1')
    bt_profil = dict(vollname='Erika Muster', bundesland='Berlin', fraktion='Bündnis 90/Die Grünen',
                     mandatsachsen=[dict(art='Wahlkreismandat', beleg='Wahlkreis 1: Berlin-Mitte, Berlin')],
                     regionsangaben=['Berlin-Mitte'])
    bt_extraktion = dict(profil=bt_profil, quelle=bt_quelle, offen=[], feldbelege={})
    bt_eingang = _eingang(root, bt_quelle, bt_extraktion)
    bt_auswahl = dict(url=bt_quelle['url'], text='Muster, Erika', fraktion='Bündnis 90/Die Grünen',
                      amtlicheKennung='muster_erika-1', parlament='bundestag')
    nachweis = m._parteinachweis(bt_eingang, bt_auswahl, bt_extraktion)
    assert nachweis['status'] == 'offen' and nachweis['partei'] is None, 'Fraktion wurde zur Partei umgedeutet'
    _erwarte_fehler(lambda: m._baue_datensatz(bt_eingang, bt_auswahl),
                    'Bundestag ohne Quittung muss fail closed bleiben (keine Ableitung aus Fraktion)')

    # 4 · Gueltige Quittung ergaenzt ein offenes Feld (URL+sha256 gebunden, Zitat woertlich).
    (root / 'erg.html').write_text(
        '<h1>Erika Muster</h1><p>Seit 2015 Mitglied der SPD. Ausschuss fuer Haushalt.</p>')
    erg_url = 'https://www.parlament-berlin.de/Abgeordnete/erika-muster-quittung'
    erg_quelle = _quelle(root, 'erg.html', erg_url, 'erika-muster')
    erg_profil = dict(vollname='Erika Muster', bundesland='Berlin', wahlkreis='Mitte, Wahlkreis 1',
                      ausschuesse=['Haushaltsausschuss'])
    erg_extraktion = dict(profil=erg_profil, quelle=erg_quelle, offen=[], feldbelege={})
    erg_auswahl = dict(url=erg_url, text='Muster, Erika', fraktion='-',
                       amtlicheKennung='erika-muster', parlament='landtag-berlin')
    erg_kennung = m._slug('landtag-berlin', 'erika-muster')
    ergebnis = dict(kennung=erg_kennung, status='belegt', partei='SPD',
                    beleg='Seit 2015 Mitglied der SPD.',
                    quelle=dict(url=erg_url, sha256=erg_quelle['sha256']))
    datensatz = m._baue_datensatz(_eingang(root, erg_quelle, erg_extraktion, {erg_kennung: ergebnis}), erg_auswahl)
    assert datensatz['parteiStatus'] == 'belegt' and datensatz['profil']['partei'] == 'SPD'
    assert 'partei' not in datensatz['offeneFelder']
    assert datensatz['parteiBeleg']['quelle']['sha256'] == erg_quelle['sha256']
    _erwarte_fehler(lambda: m._baue_datensatz(
        _eingang(root, erg_quelle, erg_extraktion,
                 {erg_kennung: dict(ergebnis, quelle=dict(url=erg_url, sha256='0' * 64))}), erg_auswahl),
        'Quelldrift sha256')
    _erwarte_fehler(lambda: m._baue_datensatz(
        _eingang(root, erg_quelle, erg_extraktion,
                 {erg_kennung: dict(ergebnis, quelle=dict(url=erg_url + '-fremd', sha256=erg_quelle['sha256']))}), erg_auswahl),
        'falsche Quell-URL')
    _erwarte_fehler(lambda: m._baue_datensatz(
        _eingang(root, erg_quelle, erg_extraktion,
                 {erg_kennung: dict(ergebnis, beleg='Voellig anderes Zitat.')}), erg_auswahl),
        'Zitat nicht in der Original-HTML')

    # 5 · Offen bleibt offen (nichts wird abgeleitet).
    offen_datensatz = m._baue_datensatz(
        _eingang(root, erg_quelle, erg_extraktion,
                 {erg_kennung: dict(ergebnis, status='offen', partei=None, beleg='')}), erg_auswahl)
    assert offen_datensatz['parteiStatus'] == 'offen'
    assert 'partei' not in offen_datensatz['profil'] and 'partei' in offen_datensatz['offeneFelder']

    # 6 · Indexpruefung: Duplikat/Fremdkennung/unerwarteter Status/Belegt-ohne-Wert.
    def _pruefe(ergebnisse):
        eingang = SimpleNamespace(
            parteifeldpruefung=dict(umfang=len(ergebnisse), ergebnisse=ergebnisse),
            auswahl={'auswahl': [erg_auswahl]},
            abruf_by_url={erg_url: {'amtlicheKennung': 'erika-muster'}})
        return m._pruefe_ergaenzung(eingang)
    _erwarte_fehler(lambda: _pruefe([ergebnis, dict(ergebnis)]), 'doppelte Kennung')
    _erwarte_fehler(lambda: _pruefe([dict(ergebnis, kennung='landtag-berlin-fremd')]), 'Fremdkennung')
    _erwarte_fehler(lambda: _pruefe([dict(ergebnis, status='unklar')]), 'unerwarteter Status')
    _erwarte_fehler(lambda: _pruefe([dict(ergebnis, partei='')]), 'belegt ohne Parteiwert')
    assert _pruefe([ergebnis]), 'gueltiger Fall muss passieren'

    # Kopf/Navigation/JSON-LD und ein anderer Biografieabsatz ersetzen nicht
    # den ausdruecklich benannten Mitgliedschaftsabschnitt.
    bio = '<div class="m-biography__biography"><p>Mitgliedschaften und Ehrenämter: Partei Test</p></div>'
    ausserhalb = '<nav>Partei Fremd</nav><script>"Partei Fremd"</script>' + bio
    _erwarte_fehler(lambda: m._pruefe_woertliches_zitat('bundestag', ausserhalb, 'Partei Fremd', 'test'),
                    'Zitat nur ausserhalb Biografie')
    m._pruefe_woertliches_zitat('bundestag', bio, 'Partei Test', 'test', 'Biografie / Mitgliedschaften und Ehrenämter')
    anderer_absatz = bio.replace('<p>Mitgliedschaften', '<p>Partei Fremd</p><p>Mitgliedschaften')
    _erwarte_fehler(lambda: m._pruefe_woertliches_zitat('bundestag', anderer_absatz, 'Partei Fremd', 'test',
                    'Biografie / Mitgliedschaften und Ehrenämter'), 'Zitat im falschen Biografieabsatz')
    _erwarte_fehler(lambda: m._baue_datensatz(
        _eingang(root, erg_quelle, erg_extraktion,
                 {erg_kennung: dict(ergebnis, status='parteilos', partei=None, beleg='parteilos')}), erg_auswahl),
        'parteilos ohne Quellenzitat')

if BUNDESTAG_NOURIPOUR.exists():
    html = BUNDESTAG_NOURIPOUR.read_text(encoding='utf-8')
    ohne_kopf = m.FRAKTIONSKOPF_MUSTER.sub(' ', html)
    assert 'Bündnis 90/Die Grünen' in m._zitat_normalisiert(ohne_kopf), \
        'Nouripour-Zitat fehlt ausserhalb des Fraktionskopfs'
    abschnitt = html.index('Mitgliedschaften und Ehrenämter')
    m._pruefe_woertliches_zitat('bundestag', html, 'Bündnis 90/Die Grünen', 'nouripour',
                              'Biografie / Mitgliedschaften und Ehrenämter')
    assert 'Bündnis 90/Die Grünen' in m._zitat_normalisiert(html[abschnitt:abschnitt + 1500]), \
        'Nouripour-Zitat steht nicht im Abschnitt Mitgliedschaften und Ehrenämter'
    _erwarte_fehler(lambda: m._pruefe_woertliches_zitat('bundestag', html, 'Nicht im Text vorhanden', 'n'),
                    'Nouripour-Zitat')
else:
    print('Hinweis: Nouripour-Original-HTML lokal nicht vorhanden, Abschnittspruefung uebersprungen.')

print('PASS: Fraktionslosigkeit erhaelt belegte Partei; abweichender Parteienwert gesperrt; '
      'Quelldrift/Fremdkennung/Duplikat/unerwarteter Status/Konflikt und offen-bleibt-offen gesperrt.')
