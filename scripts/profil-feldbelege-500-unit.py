"""Gezielte Gegenproben fuer die Parteiabbildung und die gepruefte Ergaenzungsquittung.

Nur lokal/offline. Prueft fail closed: Quelldrift, Fraktion-ist-keine-Partei,
offene-bleiben-offen sowie Duplikat/Fremdkennung/unerwarteter Status/Konflikt.
"""
import importlib.util
import json
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

# ── 7 · Gremien-Trennung: sonstige Gremien sind keine staendigen Ausschuesse ─────────────
WAHLAUSSCHUSS_URL = 'https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss'
BEIRAT = 'Parlamentarischer Beirat für nachhaltige Entwicklung und Zukunftsfragen'
BEIRAT_URL = 'https://www.bundestag.de/ausschuesse/weitere_gremien/pbnez'


def _bt_html(mitgliedschaften, bio='Mitgliedschaften und Ehrenämter: Mitglied der SPD'):
    ld = {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        'mainEntity': {'@type': 'Person', 'name': 'Erika Muster', 'memberOf': mitgliedschaften},
    }
    return ('<h1>Erika Muster</h1>'
            '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>'
            '<div class="m-biography__biography"><p>' + bio + '</p></div>')


def _bt_rolle(name, url, rolle):
    return {'@type': 'Role', 'memberOf': {'@type': 'Organization', 'name': name, 'url': url},
            'roleName': rolle}


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    bt_url = 'https://www.bundestag.de/abgeordnete/biografien/M/muster_erika-2'
    kennung = m._slug('bundestag', 'muster_erika-2')
    parteiquittung = {kennung: dict(
        kennung=kennung, status='belegt', partei='SPD', beleg='Mitglied der SPD',
        abschnitt='Biografie / Mitgliedschaften und Ehrenämter', quelle={})}
    bt_auswahl = dict(url=bt_url, text='Muster, Erika', fraktion='SPD',
                      amtlicheKennung='muster_erika-2', parlament='bundestag')

    def _bt_datensatz(mitgliedschaften, ausschuesse, stellvertretende=None, funktionen=None, dateiname='bt.html'):
        (root / dateiname).write_text(_bt_html(mitgliedschaften), encoding='utf-8')
        quelle = _quelle(root, dateiname, bt_url, 'muster_erika-2')
        profil = dict(vollname='Erika Muster', bundesland='Berlin', fraktion='SPD',
                      mandatsachsen=[dict(art='Wahlkreismandat', beleg='Wahlkreis 1: Berlin-Mitte, Berlin')],
                      regionsangaben=['Berlin-Mitte'], ausschuesse=list(ausschuesse),
                      stellvertretendeAusschuesse=list(stellvertretende or []),
                      funktionen=list(funktionen or []))
        extraktion = dict(profil=profil, quelle=quelle, offen=[], feldbelege={})
        quittung = {kennung: dict(parteiquittung[kennung], quelle=dict(url=bt_url, sha256=quelle['sha256']))}
        return m._baue_datensatz(_eingang(root, quelle, extraktion, quittung), bt_auswahl)

    # 7a · Ordentliche UND stellvertretende Mitgliedschaft in einem sonstigen Gremium:
    # Rolle bleibt in den Storage-Funktionen erhalten, der Ausschuss bleibt draussen.
    datensatz = _bt_datensatz(
        [_bt_rolle('Ausschuss für Gesundheit', 'https://www.bundestag.de/ausschuesse/gesundheit', 'Ordentliches Mitglied'),
         _bt_rolle('Wahlausschuss', WAHLAUSSCHUSS_URL, 'Ordentliches Mitglied'),
         _bt_rolle(BEIRAT, BEIRAT_URL, 'Stellvertretendes Mitglied')],
        ['Ausschuss für Gesundheit', 'Wahlausschuss'], [BEIRAT])
    assert datensatz['profil']['ausschuesse'] == ['Ausschuss für Gesundheit'], datensatz['profil']['ausschuesse']
    assert 'stellvertretendeAusschuesse' not in datensatz['profil'], 'sonstiges Gremium darf keine Stellvertretung bleiben'
    assert 'Wahlausschuss' not in datensatz['profil']['ausschuesse']
    assert sorted(datensatz['weitereGremien']) == sorted(['Wahlausschuss', BEIRAT]), datensatz['weitereGremien']
    rollen = set(datensatz['profil']['funktionen'])
    assert 'Ordentliches Mitglied: Wahlausschuss' in rollen, rollen
    assert f'Stellvertretendes Mitglied: {BEIRAT}' in rollen, rollen
    assert 'fachlicheAchse' not in datensatz['offeneFelder'], datensatz['offeneFelder']
    assert 'weitereGremien' in datensatz['offeneFelder']
    for beleg in datensatz['weitereGremienBeleg']:
        assert beleg['url'].startswith('https://www.bundestag.de/')
        assert beleg['rolle'] in ('Ordentliches Mitglied', 'Stellvertretendes Mitglied')

    # 7b · Unbekannter echter Ausschuss bleibt gesperrt (kein Umdrehen, keine Ausnahme).
    unbekannt = _bt_datensatz(
        [_bt_rolle('Ausschuss für Zauberei und Hexenwesen', 'https://www.bundestag.de/ausschuesse/zauberei', 'Ordentliches Mitglied')],
        ['Ausschuss für Zauberei und Hexenwesen'], dateiname='bt-unbekannt.html')
    assert unbekannt['profil']['ausschuesse'] == ['Ausschuss für Zauberei und Hexenwesen'], unbekannt['profil']['ausschuesse']
    assert unbekannt['weitereGremien'] == [] and unbekannt['weitereGremienBeleg'] == []
    assert 'fachlicheAchse' not in unbekannt['offeneFelder']

    # 7c · Ein sonstiges Gremium mit abweichender amtlicher URL (Quelldrift) sperrt den Lauf.
    _erwarte_fehler(lambda: _bt_datensatz(
        [_bt_rolle('Wahlausschuss', WAHLAUSSCHUSS_URL + '-fremd', 'Ordentliches Mitglied')],
        ['Wahlausschuss'], dateiname='bt-drift.html'),
        'Quelldrift der amtlichen JSON-LD-URL')

    # 7d · Leere fachliche Achse bleibt sichtbar offen (kein Themen- oder Rollenersatz).
    leer = _bt_datensatz(
        [_bt_rolle('Wahlausschuss', WAHLAUSSCHUSS_URL, 'Ordentliches Mitglied')],
        ['Wahlausschuss'], dateiname='bt-leer.html')
    assert 'ausschuesse' not in leer['profil'], 'sonstiges Gremium darf nicht als Ausschuss bleiben'
    assert 'fachlicheAchse' in leer['offeneFelder'], leer['offeneFelder']
    assert leer['profil']['funktionen'] == ['Ordentliches Mitglied: Wahlausschuss']

# ── 8 · Mandatsartenquittung Brandenburg: Quelldrift und Fremdkennung fail closed ────────
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    roster = ('<table><tr><td><a href="/de/muster_erika/40777" class="profile">Muster, Erika </a></td>'
              '<td>WfB-Gruppe</td><td>Landesliste WfB-Gruppe, Platz 0</td></tr></table>')
    (root / 'roster.html').write_text(roster, encoding='utf-8')
    quittung = dict(
        quelle=dict(url='https://www.landtag.brandenburg.de/de/uebersicht/25777', datei='roster.html',
                    sha256=m._sha256(root / 'roster.html'), bytes=(root / 'roster.html').stat().st_size,
                    abgerufenAm='2026-09-27T14:33:29+00:00'),
        belege=[dict(amtlicheKennung='40777', profilPfad='/de/muster_erika/40777',
                     mandatsart='Landesliste', region='Brandenburg',
                     zeileWortlaut='Muster, Erika WfB-Gruppe Landesliste WfB-Gruppe, Platz 0')])
    quittung_pfad = root / 'quittung.json'
    quittung_pfad.write_text(json.dumps(quittung, ensure_ascii=False), encoding='utf-8')
    eingang = SimpleNamespace(verzeichnis=root, abruf=[
        dict(url='https://www.landtag.brandenburg.de/de/muster_erika/40777',
             amtlicheKennung='40777', parlament='landtag-brandenburg')])
    belege = m._pruefe_mandatsarten_bb(eingang, quittung_pfad)
    assert list(belege) == ['40777']
    assert belege['40777']['zeileWortlaut'].endswith('Platz 0')

    def _mit(quittung_aenderung, beleg_aenderung=None, datei_aenderung=None):
        neu = json.loads(json.dumps(quittung))
        if datei_aenderung:
            datei_aenderung(neu)
        if beleg_aenderung:
            beleg_aenderung(neu['belege'][0])
        if quittung_aenderung:
            quittung_aenderung(neu)
        pfad = root / 'quittung-aendern.json'
        pfad.write_text(json.dumps(neu, ensure_ascii=False), encoding='utf-8')
        return m._pruefe_mandatsarten_bb(eingang, pfad)

    _erwarte_fehler(lambda: _mit(lambda q: q['quelle'].__setitem__('sha256', '0' * 64)), 'Quelldrift sha256')
    _erwarte_fehler(lambda: _mit(None, lambda b: b.__setitem__('profilPfad', '/de/fremd/40777')), 'falscher Profillink')
    _erwarte_fehler(lambda: _mit(None, lambda b: b.__setitem__('amtlicheKennung', '99999')), 'Fremdkennung')

    # Hash/Groesse in der Quittung an die veraenderte Uebersicht anpassen, damit nur
    # das fehlende Wort "Landesliste" geprueft wird.
    (root / 'roster.html').write_text(roster.replace('Landesliste', 'Direktmandat'), encoding='utf-8')
    neu = json.loads(json.dumps(quittung))
    neu['quelle']['sha256'] = m._sha256(root / 'roster.html')
    neu['quelle']['bytes'] = (root / 'roster.html').stat().st_size
    neu['belege'][0]['zeileWortlaut'] = 'Muster, Erika WfB-Gruppe Direktmandat WfB-Gruppe, Platz 0'
    pfad = root / 'quittung-ohne-landesliste.json'
    pfad.write_text(json.dumps(neu, ensure_ascii=False), encoding='utf-8')
    _erwarte_fehler(lambda: m._pruefe_mandatsarten_bb(eingang, pfad), 'fehlendes Wort Landesliste')


# ── 9 · Rollenquittung der 54 offenen Fachachsen: Wortlaut anhaengen, fail closed ───────
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    bt_url = 'https://www.bundestag.de/abgeordnete/biografien/M/muster_erika-9'
    bt_kennung = m._slug('bundestag', 'muster_erika-9')
    FUNKTION = 'Bundesministerin für Forschung, Technologie und Raumfahrt'
    html = (
        '<h1>Erika Muster</h1>'
        '<nav>Bundesministerin für Zauberei</nav>'
        '<div class="m-biography__biography"><p>Mitgliedschaften und Ehrenämter: Mitglied der SPD</p></div>'
        '<div class="m-biography__function"><div><p>' + FUNKTION + '</p></div></div>'
    )
    (detail / 'bt.html').write_text(html, encoding='utf-8')
    bt_abruf = dict(url=bt_url, amtlicheKennung='muster_erika-9', parlament='bundestag',
                    datei='bt.html', sha256=m._sha256(detail / 'bt.html'),
                    bytes=(detail / 'bt.html').stat().st_size)

    def _rollen_eintrag(**kw):
        funktion = dict(wortlaut=FUNKTION, zitat=FUNKTION, abschnitt='Funktion', zeitbeleg='ohne Datumsangabe')
        basis = dict(kennung=bt_kennung, status='belegt', funktionen=[funktion], begruendung='x',
                     quelle=dict(url=bt_url, sha256=bt_abruf['sha256'], abgerufenAm='2026-09-27T14:00:00+00:00'))
        basis.update(kw)
        return basis

    def _pruefe_eintrag(ergebnis=None, abruf=None, dokument=None):
        return m._pruefe_rolleneintrag(bt_kennung, ergebnis or _rollen_eintrag(),
                                       abruf or bt_abruf, dokument if dokument is not None else html)

    assert _pruefe_eintrag() == 'belegt'
    # Ein offener Eintrag ohne Rolle ist zulaessig, MIT Rolle nicht (Widerspruch).
    assert _pruefe_eintrag(_rollen_eintrag(status='offen', funktionen=[])) == 'offen'
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(status='offen')), 'offener Eintrag mit Rolle')
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(funktionen=[])), 'belegt ohne Rolle')
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(status='unklar')), 'unerwarteter Status')
    # Quelldrift: URL oder Hash weichen von der amtlichen Detailseite ab.
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(
        quelle=dict(url=bt_url + '-fremd', sha256=bt_abruf['sha256']))), 'abweichende Quell-URL')
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(
        quelle=dict(url=bt_url, sha256='0' * 64))), 'abweichender Quellhash')
    for quelle in (dict(url=bt_url + '-fremd', sha256=bt_abruf['sha256']),
                   dict(url=bt_url, sha256='0' * 64)):
        _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(
            status='offen', funktionen=[], quelle=quelle)), 'Quelldrift auch bei offenem Status')
    _erwarte_fehler(lambda: _pruefe_eintrag(dokument=
        '<div class="m-biography__function">Andere Rolle</div><footer>' + FUNKTION + '</footer>'),
        'Zitat im Footer nach geschlossenem Personenblock')
    _erwarte_fehler(lambda: _pruefe_eintrag(dokument=
        '<div class="m-biography__function">' + FUNKTION + '</div>'
        '<div class="m-biography__function">Andere Rolle</div>'), 'mehrdeutiger Personenblock')
    _erwarte_fehler(lambda: _pruefe_eintrag(dokument=
        '<div class="m-biography__function">' + FUNKTION), 'unvollstaendiger Personenblock')
    # Erfundener Wortlaut: nicht durch das Zitat gedeckt.
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(funktionen=[
        dict(wortlaut='Bundeskanzlerin', zitat=FUNKTION, abschnitt='Funktion')])), 'erfundener Wortlaut')
    # Zitat nur in der Navigation/ausserhalb des personengebundenen Abschnitts.
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(funktionen=[
        dict(wortlaut='Bundesministerin für Zauberei', zitat='Bundesministerin für Zauberei',
             abschnitt='Funktion')])), 'Zitat nur ausserhalb des Funktionsabschnitts')
    # Fehlender Abschnitt im Original und unbekannter Abschnitt sperren fail closed.
    _erwarte_fehler(lambda: _pruefe_eintrag(dokument='<h1>Erika Muster</h1><div class="m-biography__biography"></div>'),
                    'fehlender m-biography__function-Abschnitt')
    _erwarte_fehler(lambda: _pruefe_eintrag(_rollen_eintrag(funktionen=[
        dict(wortlaut=FUNKTION, zitat=FUNKTION, abschnitt='Navigation')])), 'unbekannter Abschnitt')

    # Synthetische, deckungsgleiche 54er-Quittung fuer die Mengenpruefung.
    def _synthetische_profilrollen(n_belegt=48, n_offen=6):
        datei = 'eintrag.html'
        (detail / datei).write_text(html, encoding='utf-8')
        sha = m._sha256(detail / datei)
        auswahl = []
        abruf_by_url = {}
        ergebnisse = []
        for i in range(n_belegt + n_offen):
            ak = f'test_{i}-{2000 + i}'
            url = f'https://www.bundestag.de/abgeordnete/biografien/T/test_{i}-{2000 + i}'
            abruf_by_url[url] = dict(url=url, amtlicheKennung=ak, parlament='bundestag',
                                     datei=datei, sha256=sha)
            auswahl.append(dict(url=url, parlament='bundestag', amtlicheKennung=ak))
            kennung = m._slug('bundestag', ak)
            if i < n_belegt:
                ergebnisse.append(_rollen_eintrag(
                    kennung=kennung, quelle=dict(url=url, sha256=sha)))
            else:
                ergebnisse.append(_rollen_eintrag(
                    kennung=kennung, status='offen', funktionen=[], quelle=dict(url=url, sha256=sha)))
        quittung = dict(version=1, bilanz=dict(gesamt=n_belegt + n_offen, rollenbelegt=n_belegt, offen=n_offen),
                        ergebnisse=ergebnisse)
        eingang = SimpleNamespace(detailseiten=detail, auswahl={'auswahl': auswahl}, abruf_by_url=abruf_by_url)
        return eingang, quittung

    eingang, quittung = _synthetische_profilrollen()
    index = m._pruefe_profilrollen(eingang, quittung)
    assert len(index) == 54, len(index)
    assert sum(1 for e in index.values() if e['status'] == 'belegt') == 48
    assert sum(1 for e in index.values() if e['status'] == 'offen') == 6

    # Fehlende Quittung, falsche Menge und falsche Bilanz sperren fail closed.
    _erwarte_fehler(lambda: m._pruefe_profilrollen(SimpleNamespace(), None), 'fehlende Quittung')
    _erwarte_fehler(lambda: m._pruefe_profilrollen(eingang, dict(quittung, ergebnisse=quittung['ergebnisse'][:53])),
                    'fehlende 54er-Quittung')
    _erwarte_fehler(lambda: m._pruefe_profilrollen(
        eingang, dict(quittung, bilanz=dict(gesamt=54, rollenbelegt=47, offen=7))), 'falsche Bilanz')
    # Doppelte Kennung und Fremdkennung ausserhalb der 500 Zielprofile.
    doppelt = [dict(e) for e in quittung['ergebnisse']]
    doppelt[1] = dict(doppelt[1], kennung=doppelt[0]['kennung'])
    _erwarte_fehler(lambda: m._pruefe_profilrollen(eingang, dict(quittung, ergebnisse=doppelt)), 'doppelte Kennung')
    fremd = [dict(e) for e in quittung['ergebnisse']]
    fremd[0] = dict(fremd[0], kennung='bundestag-fremd-9999')
    _erwarte_fehler(lambda: m._pruefe_profilrollen(eingang, dict(quittung, ergebnisse=fremd)), 'Fremdkennung')

    # 9a · Wortlaut wird dedupliziert an BESTEHENDE funktionen angehaengt; Gremienrolle bleibt.
    auswahl = dict(url=bt_url, text='Muster, Erika', fraktion='SPD',
                   amtlicheKennung='muster_erika-9', parlament='bundestag')
    bt_profil = dict(vollname='Erika Muster', bundesland='Berlin', fraktion='SPD',
                     mandatsachsen=[dict(art='Wahlkreismandat', beleg='Wahlkreis 1: Berlin-Mitte, Berlin')],
                     regionsangaben=['Berlin-Mitte'], ausschuesse=[],
                     funktionen=[dict(rolle='Ordentliches Mitglied', gremium='Wahlausschuss')])

    def _bt_rollen_datensatz(rollen_index):
        quelle = dict(bt_abruf, finalUrl=bt_url, abgerufenAm='2026-09-27T14:00:00Z', http=200, abrufStatus='abgerufen')
        extraktion = dict(profil=bt_profil, quelle=quelle, offen=[], feldbelege={})
        parteiquittung = {bt_kennung: dict(kennung=bt_kennung, status='belegt', partei='SPD',
                                           beleg='Mitglied der SPD',
                                           abschnitt='Biografie / Mitgliedschaften und Ehrenämter',
                                           quelle=dict(url=bt_url, sha256=quelle['sha256']))}
        e = SimpleNamespace(detailseiten=detail, abruf_by_url={bt_url: quelle},
                            extraktion_by_url={bt_url: extraktion}, ergaenzung_by_kennung=parteiquittung,
                            ergaenzung_verwendet=set(),
                            profilrollen_by_kennung=rollen_index, profilrollen_verwendet=set())
        return m._baue_datensatz(e, auswahl)

    datensatz = _bt_rollen_datensatz({bt_kennung: _rollen_eintrag()})
    funktionen = datensatz['profil']['funktionen']
    assert 'Ordentliches Mitglied: Wahlausschuss' in funktionen, funktionen
    assert funktionen.count(FUNKTION) == 1, funktionen
    assert datensatz['profilrollenQuittung']['funktionen'][0]['wortlaut'] == FUNKTION
    assert datensatz['profilrollenQuittung']['sha256'] == bt_abruf['sha256']
    assert datensatz['profil']['aktiv'] is False and datensatz['importfreigegeben'] is False
    # Ein bereits vorhandener gleicher String wird NICHT doppelt angehaengt (Deduplikation).
    zweimal = _bt_rollen_datensatz({bt_kennung: _rollen_eintrag(funktionen=[
        dict(wortlaut=FUNKTION, zitat=FUNKTION, abschnitt='Funktion'),
        dict(wortlaut=FUNKTION, zitat=FUNKTION, abschnitt='Funktion')])})
    assert zweimal['profil']['funktionen'].count(FUNKTION) == 1, zweimal['profil']['funktionen']


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


# ── 10 · Ressortquittung der 19 geschlossenen Fachachsen: fail closed ────────────────────
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    detail = root / 'detailseiten'
    detail.mkdir()
    REGIONEN = [('Bund', 'bundestag', 'bundesregierung.de', 9),
                ('Berlin', 'landtag-berlin', 'berlin.de', 4),
                ('Brandenburg', 'landtag-brandenburg', 'brandenburg.de', 6)]

    quittung_eintraege = []
    profilrollen = {}
    kennung_zu_abruf = {}
    for region, parlament, host, anzahl in REGIONEN:
        datei = f'{region.lower()}-quelle.html'
        quelle_url = f'https://www.{host}/ressort-{region.lower()}'
        zeilen = []
        for i in range(anzahl):
            zeilen.append((f'Person {region} {i}', f'Testressort {region} {i}',
                           f'Minister für Testressort {region} {i}',
                           f'Person {region} {i} Minister für Testressort {region} {i}'))
        (zusatz / datei).write_text('<p>' + ' '.join(z[3] for z in zeilen) + '</p>', encoding='utf-8')
        sha = m._sha256(zusatz / datei)
        (zusatz / datei.replace('.html', '.json')).write_text(json.dumps(dict(
            url=quelle_url, finalUrl=quelle_url, abgerufenAm='2026-09-27T15:43:00+00:00',
            sha256=sha, bytes=(zusatz / datei).stat().st_size, datei=datei), ensure_ascii=False), encoding='utf-8')
        for i, (name, ressort, amtsrolle, zitat) in enumerate(zeilen):
            kennung = m._slug(parlament, f'{region.lower()}-{i}')
            detail_datei = f'{region.lower()}-{i}.html'
            (detail / detail_datei).write_text(f'<h1>{name}</h1>', encoding='utf-8')
            rollen_url = f'https://www.{host}/person-{region.lower()}-{i}'
            rollen_sha = m._sha256(detail / detail_datei)
            kennung_zu_abruf[kennung] = dict(parlament=parlament, datei=detail_datei, url=rollen_url)
            profilrollen[kennung] = dict(status='belegt', quelle=dict(url=rollen_url, sha256=rollen_sha),
                                         funktionen=[dict(wortlaut=amtsrolle)])
            quittung_eintraege.append(dict(
                kennung=kennung, region=region, status='belegt', amtsrolle=amtsrolle,
                rollenquelle=dict(url=rollen_url, sha256=rollen_sha, abgerufenAm='2026-09-27T12:59:00+00:00'),
                quelle=dict(url=quelle_url, finalUrl=quelle_url, abgerufenAm='2026-09-27T15:43:00+00:00',
                            sha256=sha, bytes=(zusatz / datei).stat().st_size, datei=datei),
                zitat=zitat, ressort=ressort,
                themen=[ressort],
                ableitungsHinweis=f'Ressortzuständigkeit {region} (amtlich abgeleitet): {ressort}; keine persönliche politische Position',
                importfreigegeben=False))
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=19, Bund=9, Berlin=4, Brandenburg=6),
                             ergebnisse=quittung_eintraege)

    def _ressort_eingang(quittung):
        return SimpleNamespace(verzeichnis=root, detailseiten=detail, ressortachsen=quittung,
                               profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf)

    def _mit(mutation):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return _ressort_eingang(neu)

    def _pruefe_mit(mutation):
        return m._pruefe_ressortachsen(_mit(mutation))

    index = m._pruefe_ressortachsen(_ressort_eingang(gueltige_quittung))
    assert len(index) == 19, len(index)
    assert sum(1 for e in index.values() if e['region'] == 'Bund') == 9
    assert sum(1 for e in index.values() if e['region'] == 'Brandenburg') == 6
    assert len(kennung_zu_abruf) == 19

    # Fehlende Quittung.
    _erwarte_fehler(lambda: m._pruefe_ressortachsen(SimpleNamespace(
        verzeichnis=root, detailseiten=detail, ressortachsen=None,
        profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf)), 'fehlende Ressortquittung')
    # Falsche Bilanz.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['bilanz'].__setitem__('Bund', 8)), 'falsche Ressortbilanz')
    # Doppelte Kennung.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][1].__setitem__(
        'kennung', q['ergebnisse'][0]['kennung'])), 'doppelte Kennung')
    # Fremdkennung ausserhalb der 500 Zielprofile.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-fremd-9999')), 'Fremdkennung (nicht in den 500 Zielprofilen)')
    # Kennung in den 500 Zielprofilen, aber nicht in der 54er Rollenquittung.
    kennung_zu_abruf['bundestag-nichtrolle-1'] = dict(parlament='bundestag', datei='bund-0.html',
                                                      url='https://www.bundesregierung.de/nichtrolle')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__('kennung', 'bundestag-nichtrolle-1')),
                    'Kennung ausserhalb der 54er Rollenquittung')
    kennung_zu_abruf.pop('bundestag-nichtrolle-1', None)
    # Quelldrift: Hash, URL, fehlende Datei.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('sha256', '0' * 64)),
                    'Zusatzquellen-Hashdrift')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Zusatzquellen-URL-Drift')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('datei', 'fehlt.html')),
                    'fehlende Zusatzquelle')
    # Rollenquelle muss zur 54er Quittung passen.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__(
        'url', q['ergebnisse'][0]['rollenquelle']['url'] + '-fremd')), 'Rollenquellen-Drift')
    # Region/Parlament inkonsistent (erster Berlin-Eintrag als Bund deklariert).
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][9].__setitem__('region', 'Bund')),
                    'Region/Parlament inkonsistent')
    # Zitat: nicht in der Quelle, fremde Person, erfundenes Ressort.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__('zitat', 'Voellig anderes Zitat')),
                    'Zitat nicht woertlich in der Quelle')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'zitat', q['ergebnisse'][1]['zitat'])), 'fremdes Person/Zitat')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__('ressort', 'Erfundenes Ressort')),
                    'Ressort nicht im Zitat')
    # Erfundener/abweichender Themenwortlaut.
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', ['Ressortzuständigkeit Bund (amtlich abgeleitet): Etwas anderes'])), 'erfundenes Thema')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', ['Ressortzuständigkeit Bund: Testressort Bund 0'])), 'Themenmuster unvollstaendig')
    # Kanzler-/Vorsitzrolle traegt kein Ressort (Rolle steht in der 54er Quittung).
    def _kanzler(neu):
        eintrag = neu['ergebnisse'][0]
        eintrag['amtsrolle'] = 'Bundeskanzler'
        profilrollen[eintrag['kennung']]['funktionen'] = [dict(wortlaut='Bundeskanzler')]
    _erwarte_fehler(lambda: _pruefe_mit(_kanzler), 'Kanzlerrolle')
    profilrollen[quittung_eintraege[0]['kennung']]['funktionen'] = [dict(wortlaut=quittung_eintraege[0]['amtsrolle'])]

    def _vorsitz(neu):
        eintrag = neu['ergebnisse'][1]
        eintrag['amtsrolle'] = 'Vorsitzender des Ausschusses fuer Testressort'
        profilrollen[eintrag['kennung']]['funktionen'] = [dict(wortlaut='Vorsitzender des Ausschusses fuer Testressort')]
    _erwarte_fehler(lambda: _pruefe_mit(_vorsitz), 'Vorsitzrolle')
    profilrollen[quittung_eintraege[1]['kennung']]['funktionen'] = [dict(wortlaut=quittung_eintraege[1]['amtsrolle'])]

    # Ein zusammenhaengendes Mehrpersonen-Zitat darf kein fremdes Ressort liefern.
    def _fremdes_ressort(neu):
        e, fremd = neu['ergebnisse'][:2]
        e['zitat'] += ' ' + fremd['zitat']
        e['ressort'] = fremd['ressort']
        e['themen'] = fremd['themen']
        e['ableitungsHinweis'] = fremd['ableitungsHinweis']
    _erwarte_fehler(lambda: _pruefe_mit(_fremdes_ressort), 'fremdes Ressort aus Mehrpersonen-Zitat')
    _erwarte_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].pop('ableitungsHinweis')), 'fehlende Ableitungskennzeichnung')
    assert m._ressort_themen('Forschung, Technologie und Raumfahrt') == ['Forschung', 'Technologie', 'Raumfahrt']
    assert m._ressort_themen('wirtschaftliche Zusammenarbeit und Entwicklung') == ['wirtschaftliche Zusammenarbeit und Entwicklung']
    assert m._ressort_themen('Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz') == ['Land- und Ernährungswirtschaft', 'Umwelt', 'Verbraucherschutz']

    # Gueltige Quittung nach allen Mutationen weiter akzeptiert.
    assert len(m._pruefe_ressortachsen(_ressort_eingang(gueltige_quittung))) == 19


print('PASS: Fraktionslosigkeit erhaelt belegte Partei; abweichender Parteienwert gesperrt; '
      'Quelldrift/Fremdkennung/Duplikat/unerwarteter Status/Konflikt und offen-bleibt-offen gesperrt.')
print('PASS: sonstige Gremien rollengetreu aus den Ausschuessen geloest (Ordentlich/Stellvertretend '
      'bleiben in funktionen, nicht in committee); unbekannter Ausschuss bleibt gesperrt; '
      'JSON-LD-URL-Drift, falscher Brandenburger Profillink, Fremdkennung, Hashdrift und fehlendes '
      'Wort Landesliste sperren fail closed; leere Achse bleibt offen.')
print('PASS: Rollenquittung — Fremdkennung/Duplikat/fehlende 54er-Quittung/falsche Bilanz/Quelldrift/'
      'erfundener Wortlaut/Zitat ausserhalb des Abschnitts/offener Eintrag mit Rolle sperren fail closed; '
      'nur der freigegebene Wortlaut wird dedupliziert an bestehende funktionen angehaengt, Gremienrolle bleibt.')
print('PASS: Ressortquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/Kennung ausserhalb '
      'der 54er Rollenquittung/Quelldrift (Hash/URL/Datei)/Rollenquellen-Drift/Region-Parlament-Konflikt/'
      'Zitat nicht in der Quelle/fremdes Person-Zitat/Ressort nicht im Zitat/erfundenes Themenmuster und '
      'Kanzler-/Vorsitzrolle sperren fail closed; die gueltige 19er-Quittung wird unveraendert akzeptiert.')


# ── 11 · Aufgabenquittung der 6 geschlossenen Fachachsen (getrenntes Modul): fail closed ──
am_spec = importlib.util.spec_from_file_location(
    'aufgaben', Path(__file__).with_name('profil-feldbelege-500-aufgaben.py'))
am = importlib.util.module_from_spec(am_spec)
am_spec.loader.exec_module(am)


def _erwarte_aufgaben_fehler(fn, was):
    try:
        fn()
    except am.AufgabenachsenFehler:
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()

    def _quelle(schluessel, host, datei, html):
        (zusatz / datei).write_text(html, encoding='utf-8')
        url = f'https://www.{host}/test-{schluessel}-quelle'
        sha = am._sha256(zusatz / datei)
        bytes_ = (zusatz / datei).stat().st_size
        (zusatz / datei.replace('.html', '.json')).write_text(json.dumps(dict(
            url=url, finalUrl=url, abgerufenAm='2026-09-27T16:34:00+00:00', sha256=sha,
            bytes=bytes_, datei=datei), ensure_ascii=False), encoding='utf-8')
        return dict(url=url, finalUrl=url, abgerufenAm='2026-09-27T16:34:00+00:00',
                    sha256=sha, bytes=bytes_, datei=datei)

    # Quelle A: personengebundene Beauftragtenaufgabe (Name UND Aufgabe im Zitat).
    zitat_a = 'Person A ist der Beauftragte der Bundesregierung gegen Testantiziganismus.'
    quelle_a = _quelle('a', 'bmbfsfj.bund.de', 'a.html', f'<p>{zitat_a}</p>')
    # Quelle B: Ministeriumsrolle traegt einen Fremdbereich, Beauftragtenaufgabe den Mittelstand.
    zitat_b = ('Person B Parlamentarische Staatssekretärin beim Bundesminister für Fremdbereich '
               'sowie Beauftragte der Bundesregierung für Testmittelstand')
    quelle_b = _quelle('b', 'bmds.bund.de', 'b.html', f'<p>{zitat_b}</p>')
    # Quelle C: Amts-Seite mit ausdruecklichem Aufgabenabsatz; Person nur in der Bildunterschrift.
    zitat_c_kopf = 'Aufgaben der Testbeauftragten'
    zitat_c_person = 'Person C Testbeauftragte'
    zitat_c_ziel = 'Unsere Ziele sind gleichwertige Testverhältnisse.'
    c_html = (f'<h2>{zitat_c_kopf}</h2><p>{zitat_c_ziel}</p>'
              f'<figcaption>{zitat_c_person}</figcaption>')
    quelle_c = _quelle('c', 'ostbeauftragte.de', 'c.html', c_html)
    # Nur Bildunterschrift/Navigation traegt den Zielsatz (Negativfall).
    c_nav_html = (f'<h2>{zitat_c_kopf}</h2><nav>{zitat_c_ziel}</nav>'
                  f'<figcaption>{zitat_c_person}</figcaption>')
    quelle_c_nav = _quelle('c-nav', 'ostbeauftragte.de', 'c-nav.html', c_nav_html)
    # Quelle D/E: gemeinsame BMAS-Seite (Person -> Abteilungsnummer -> Aufgabenabschnitt).
    zitat_d_person = ('Person D, Parlamentarische Staatssekretärin Unterstützung der Ministerin '
                      'insbesondere im Bereich der Abteilungen G, IV , V und VI b, Haushalts- und '
                      'Rechnungsprüfungsausschuss')
    zitat_e_person = ('Person E, Parlamentarische Staatssekretärin Unterstützung der Ministerin '
                      'insbesondere im Bereich der Abteilungen D , I , II , III , VI a und Gruppe EF')
    zitat_d4 = 'Abteilung IV Aufgabenbereiche: Sozialversicherungstest, Alterssicherungstest'
    zitat_d5 = 'Abteilung V Aufgabenbereiche: Teilhabetest, Sozialhilfetest'
    zitat_e2 = 'Abteilung II Aufgabenbereiche: Arbeitsmarktpolitiktest, Grundsicherungstest'
    zitat_e3 = 'Abteilung III Aufgabenbereiche: Arbeitsrechttest, Arbeitsschutztest'
    d_html = '<p>' + '</p><p>'.join([zitat_d_person, zitat_e_person, zitat_d4, zitat_d5, zitat_e2, zitat_e3]) + '</p>'
    quelle_d = _quelle('d', 'bmas.de', 'd.html', d_html)
    # Quelle F: zwei Beauftragtenaufgaben mit amtlicher Konjunktion 'zugleich'/'sowie'.
    zitat_f = ('Person F Beauftragte der Bundesregierung für Migrationstest zugleich Beauftragte '
               'der Bundesregierung für Antirassismustest')
    quelle_f = _quelle('f', 'integrationsbeauftragte.de', 'f.html', f'<p>{zitat_f}</p>')

    def _bindung(host, kennung):
        rollen_url = f'https://www.bundestag.de/abgeordnete/biografien/{kennung}'
        rollen_sha = ('a' * 64)
        return rollen_url, rollen_sha

    eintraege = []
    profilrollen = {}
    kennung_zu_abruf = {}
    for kennung, host, quelle, extra in [
        ('bundestag-test-a-1', 'bmbfsfj.bund.de', quelle_a, dict(
            bindungsart='beauftragtenaufgabe', person='Person A', personImZitat=True,
            aufgabenbindung='Beauftragter der Bundesregierung gegen Testantiziganismus',
            personbeleg=zitat_a, themenzitat=zitat_a, zitate=[zitat_a], themen=['Testantiziganismus'])),
        ('bundestag-test-b-1', 'bmds.bund.de', quelle_b, dict(
            bindungsart='beauftragtenaufgabe', person='Person B', personImZitat=True,
            aufgabenbindung='Beauftragte der Bundesregierung für Testmittelstand',
            personbeleg=zitat_b, themenzitat=zitat_b, zitate=[zitat_b], themen=['Testmittelstand'])),
        ('bundestag-test-c-1', 'ostbeauftragte.de', quelle_c, dict(
            bindungsart='beauftragtenaufgabe', person='Person C', personImZitat=False,
            aufgabenabsatz=zitat_c_kopf,
            aufgabenbindung='Beauftragte der Bundesregierung für Testost',
            personbeleg=zitat_c_person, themenzitat=zitat_c_ziel,
            zitate=[zitat_c_kopf, zitat_c_person, zitat_c_ziel], themen=['gleichwertige Testverhältnisse'])),
        ('bundestag-test-d-1', 'bmas.de', quelle_d, dict(
            bindungsart='abteilungszustaendigkeit', person='Person D', personImZitat=True,
            aufgabenbindung='Zustaendigkeit laut BMAS-Organigramm: Abteilungen IV und V (belegte Teilmenge)',
            personbeleg=zitat_d_person, abteilungsnummern=['IV', 'V'],
            abteilungszitate=[zitat_d4, zitat_d5],
            zitate=[zitat_d_person, zitat_d4, zitat_d5],
            themen=['Sozialversicherungstest', 'Alterssicherungstest', 'Teilhabetest', 'Sozialhilfetest'])),
        ('bundestag-test-e-1', 'bmas.de', quelle_d, dict(
            bindungsart='abteilungszustaendigkeit', person='Person E', personImZitat=True,
            aufgabenbindung='Zustaendigkeit laut BMAS-Organigramm: Abteilungen II und III (belegte Teilmenge)',
            personbeleg=zitat_e_person, abteilungsnummern=['II', 'III'],
            abteilungszitate=[zitat_e2, zitat_e3],
            zitate=[zitat_e_person, zitat_e2, zitat_e3],
            themen=['Arbeitsmarktpolitiktest', 'Arbeitsrechttest', 'Arbeitsschutztest'])),
        ('bundestag-test-f-1', 'integrationsbeauftragte.de', quelle_f, dict(
            bindungsart='beauftragtenaufgabe', person='Person F', personImZitat=True,
            aufgabenbindung=('Beauftragte der Bundesregierung für Migrationstest sowie Beauftragte '
                             'der Bundesregierung für Antirassismustest'),
            personbeleg=zitat_f, themenzitat=zitat_f, zitate=[zitat_f],
            themen=['Migrationstest', 'Antirassismustest'])),
    ]:
        rollen_url, rollen_sha = _bindung(host, kennung)
        detail_datei = f'{kennung}.html'
        (root / 'detailseiten').mkdir(exist_ok=True)
        detail = root / 'detailseiten' / detail_datei
        detail.write_text(f'<h1>{extra["person"]}</h1>', encoding='utf-8')
        rollen_sha = am._sha256(detail)
        kennung_zu_abruf[kennung] = dict(parlament='bundestag', datei=detail_datei, url=rollen_url)
        profilrollen[kennung] = dict(status='belegt', quelle=dict(
            url=rollen_url, sha256=rollen_sha, abgerufenAm='2026-09-27T13:00:00+00:00'),
            funktionen=[dict(wortlaut=extra['aufgabenbindung'] if extra.get('personImZitat') is False else 'Parlamentarische Staatssekretärin Test')])
        eintraege.append(dict(
            kennung=kennung, region='Bund', status='belegt', rollenquelle=dict(
                url=rollen_url, sha256=rollen_sha, abgerufenAm='2026-09-27T13:00:00+00:00'),
            quelle=quelle,
            ableitungsHinweis=f'Aufgabenbindung Bund (amtlich abgeleitet): {extra["aufgabenbindung"]}; keine persönliche politische Position',
            importfreigegeben=False, **extra))

    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=6, Bund=6, Berlin=0, Brandenburg=0),
                             ergebnisse=eintraege)

    def _aufgaben_eingang(quittung):
        return SimpleNamespace(verzeichnis=root, aufgabenachsen=quittung,
                               profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf)

    def _pruefe_mit(mutation, ressort=None):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return am.pruefe_aufgabenachsen(_aufgaben_eingang(neu), quittung=neu,
                                        ressortachsen_kennungen=ressort or set())

    index = am.pruefe_aufgabenachsen(_aufgaben_eingang(gueltige_quittung), quittung=gueltige_quittung)
    assert len(index) == 6 and all(e['region'] == 'Bund' for e in index.values())
    assert sum(len(e['themen']) for e in index.values()) == 12

    # Fehlende Quittung.
    _echter_pfad = am.AUFGABENACHSEN
    am.AUFGABENACHSEN = root / 'fehlt.json'
    try:
        _erwarte_aufgaben_fehler(lambda: am.pruefe_aufgabenachsen(_aufgaben_eingang(None)), 'fehlende Aufgabenquittung')
    finally:
        am.AUFGABENACHSEN = _echter_pfad
    # Falsche Bilanz.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['bilanz'].__setitem__('Bund', 5)), 'falsche Aufgabenbilanz')
    # Duplikat.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][1].__setitem__(
        'kennung', q['ergebnisse'][0]['kennung'])), 'doppelte Kennung')
    # Fremdkennung (nicht in den 500 Zielprofilen).
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-fremd-9')), 'Fremdkennung')
    # Kennung bereits Ressortachse.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: None, ressort={'bundestag-test-a-1'}), 'Kennung bereits Ressortachse')
    # Quellhash-Drift.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('sha256', '0' * 64)), 'Quelldrift Hash')
    # Quell-URL-Drift.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Quelldrift URL')
    # Unerwarteter Quellhost.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', 'https://www.example.org/fremd')), 'unerwarteter Quellhost')
    # Fehlende Datei.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('datei', 'fehlt.html')), 'fehlende Zusatzquelle')
    # Rollenquellen-Drift (andere kanonische Person).
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__(
        'sha256', 'b' * 64)), 'Rollenquellen-Drift')
    # Zitat nicht woertlich.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'zitate', [q['ergebnisse'][0]['zitate'][0] + ' Erfundenes.'])), 'Zitat nicht woertlich')
    # Person fehlt im Zitat.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremder Name')), 'Person fehlt im Zitat')
    # Ministeriumszugehoerigkeit allein (Connemann-Muster): Fremdbereich als Thema.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][1].__setitem__('themen', ['Fremdbereich'])), 'Ministeriumszugehoerigkeit allein')
    # Fremdes Thema.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][2].__setitem__('themen', ['Unbelegtes Fremdthema'])), 'fremdes Thema')
    # Kaiser: Thema nur in Bildunterschrift/Navigation.
    def _nur_bildunterschrift(q):
        q['ergebnisse'][2]['quelle'] = dict(quelle_c_nav)
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(_nur_bildunterschrift), 'Thema nur in Navigation/Bildunterschrift')
    # Kaiser: Personenbeleg fehlt in der Quelle.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][2].__setitem__('person', 'Fremde Person')), 'Personenbeleg fehlt')
    # BMAS: Abteilungsnummer nicht in der Personenzeile (Mast-Griese-Tausch).
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][4].__setitem__(
        'abteilungsnummern', ['IV', 'V'])), 'Abteilung nicht in der Personenzeile (Mast-Griese-Tausch)')
    # BMAS: Mast erhaelt ein Griese-Thema.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][4].__setitem__(
        'themen', ['Sozialversicherungstest'])), 'Mast erhaelt Griese-Thema')
    # BMAS: zusammengesetztes Scheinzitat.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][3].__setitem__(
        'zitate', [zitat_d_person, zitat_d4 + ' ' + zitat_d5])), 'zusammengesetztes Scheinzitat')
    # Fehlender Herkunftshinweis.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].pop('ableitungsHinweis')), 'fehlender Herkunftshinweis')
    # Importfreigabe gesetzt.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].__setitem__('importfreigegeben', True)), 'Importfreigabe gesetzt')
    # Pawlik-Muster: Originalzitat 'zugleich' gegen 'sowie' getauscht.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][5].__setitem__(
        'zitate', [zitat_f.replace('zugleich', 'sowie')])), 'Originalzitat Konjunktion getauscht')

    # Zusaetzliche Orchestrator-Gegenproben: ganze Pakete und Personenzitate.
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('bytes', 1)), 'falsche Quittungs-Bytezahl')
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][3].__setitem__('person', 'Fremde Person')), 'BMAS falsche Person')
    def _pakete_tauschen(q):
        a, b = q['ergebnisse'][3:5]
        for feld in ['kennung', 'rollenquelle']:
            a[feld], b[feld] = b[feld], a[feld]
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(_pakete_tauschen), 'komplette Mast/Griese-Pakete vertauscht')
    def _personzitat_tauschen(q):
        e = q['ergebnisse'][3]
        e['personbeleg'] = zitat_e_person
        e['zitate'][0] = zitat_e_person
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(_personzitat_tauschen), 'BMAS fremdes Personenzitat')
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][0].pop('themenzitat')), 'fehlendes Themenzitat')
    def _fremde_amtsbindung(q):
        e = q['ergebnisse'][2]
        e['aufgabenbindung'] = 'Beauftragte der Bundesregierung fuer etwas Anderes'
        e['ableitungsHinweis'] = f'Aufgabenbindung Bund (amtlich abgeleitet): {e["aufgabenbindung"]}; keine persönliche politische Position'
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(_fremde_amtsbindung), 'Amtsrolle traegt Aufgabenbindung nicht')
    ausserhalb = _quelle('c-anderer-absatz', 'ostbeauftragte.de', 'c-anderer-absatz.html',
        f'<h2>{zitat_c_kopf}</h2><p>Andere Aufgaben.</p><h2>Anderes Amt</h2><p>{zitat_c_ziel}</p><figcaption>{zitat_c_person}</figcaption>')
    _erwarte_aufgaben_fehler(lambda: _pruefe_mit(lambda q: q['ergebnisse'][2].__setitem__('quelle', ausserhalb)), 'Themenzitat im falschen Aufgabenabschnitt')
    assert 'IV' not in am._abteilungsliste('Person: Abteilungen I und VI a')
    assert 'VI b' not in am._abteilungsliste('Person: Abteilungen I und VI a')

    # Gueltige Quittung nach allen Mutationen weiter akzeptiert.
    assert len(am.pruefe_aufgabenachsen(_aufgaben_eingang(gueltige_quittung), quittung=gueltige_quittung)) == 6


print('PASS: Aufgabenquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/Ressortachsen-'
      'Ueberschneidung/Quelldrift (Hash/URL/Host/Datei)/Rollenquellen-Drift/Zitat nicht woertlich/'
      'fehlende Person/Ministeriumszugehoerigkeit allein/fremdes Thema/Thema nur in Navigation oder '
      'Bildunterschrift/Abteilung nicht in der Personenzeile (Mast-Griese-Tausch)/Mast erhaelt Griese-Thema/'
      'zusammengesetztes Scheinzitat/fehlender Herkunftshinweis/Importfreigabe/Originalzitat-Konjunktion '
      'sperren fail closed; die gueltige synthetische 6er-Quittung wird akzeptiert.')
