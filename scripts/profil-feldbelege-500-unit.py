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


# ── 12 · Beratende Achsen der 2 geschlossenen Fachachsen (getrenntes Modul): fail closed ──
ba_spec = importlib.util.spec_from_file_location(
    'beratende', Path(__file__).with_name('profil-feldbelege-500-beratende.py'))
ba = importlib.util.module_from_spec(ba_spec)
ba_spec.loader.exec_module(ba)


def _erwarte_beratende_fehler(fn, was):
    try:
        fn()
    except ba.BeratendeachsenFehler:
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()

    def _ld_json(person, ausschuss, url, rolle='Beratendes Mitglied', enddate=None, name=None):
        rolle_dict = {
            '@type': 'Role',
            'memberOf': {'@type': 'Organization', 'name': ausschuss, 'url': url},
            'roleName': rolle,
            'startDate': '2025-03-25',
        }
        if enddate is not None:
            rolle_dict['endDate'] = enddate
        return {
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            'mainEntity': {
                '@type': 'Person',
                '@id': '#mdb',
                'name': name if name is not None else person,
                'memberOf': [rolle_dict],
            },
        }, rolle_dict

    def _profil(i, person, ausschuss, aurl, themen):
        ak = f'test_{i}-{3000 + i}'
        kennung = m._slug('bundestag', ak)
        url = f'https://www.bundestag.de/abgeordnete/biografien/T/{ak}'
        datei = f'bundestag-{ak}.html'
        ld, rolle = _ld_json(person, ausschuss, aurl)
        (detail / datei).write_text(
            f'<h1>{person}</h1><script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>',
            encoding='utf-8')
        quelle = dict(url=url, finalUrl=url, abgerufenAm='2026-09-27T13:02:11+00:00',
                      sha256=ba._sha256(detail / datei), bytes=(detail / datei).stat().st_size,
                      datei=datei, http=200, abrufStatus='abgerufen')
        abruf = dict(quelle, amtlicheKennung=ak, parlament='bundestag')
        hinweis = (f'Beratende Ausschussarbeit Bund (amtlich abgeleitet): {ausschuss}; '
                   'keine ordentliche oder stellvertretende Mitgliedschaft, keine persönliche politische Position')
        eintrag = dict(kennung=kennung, status='belegt', region='Bund', parlament='bundestag',
                       person=person, jsonLdPfad='ProfilePage.mainEntity.memberOf',
                       amtlicherAusschuss=ausschuss, amtlicherRollenbeleg=rolle,
                       originalrollen=[rolle], quelle=quelle, themen=list(themen),
                       ableitungsHinweis=hinweis,
                       bestehendeFunktionen=[f'Beratendes Mitglied: {ausschuss}'],
                       importfreigegeben=False)
        return kennung, abruf, eintrag

    AUSSCHUSS_A = 'Ausschuss für Landwirtschaft, Ernährung und Heimat'
    AUSSCHUSS_B = 'Haushaltsausschuss'
    URL_A = 'https://www.bundestag.de/ausschuesse/Landwirtschaft'
    URL_B = 'https://www.bundestag.de/ausschuesse/a08_haushalt'
    k_a, abruf_a, eintrag_a = _profil(1, 'Person Alpha', AUSSCHUSS_A, URL_A,
                                      ['Landwirtschaft', 'Ernährung', 'Heimat'])
    k_b, abruf_b, eintrag_b = _profil(2, 'Person Beta', AUSSCHUSS_B, URL_B, ['Haushalt'])
    kennung_zu_abruf = {k_a: abruf_a, k_b: abruf_b}
    profilrollen = {
        k_a: dict(status='offen', quelle=dict(url=abruf_a['url'], sha256=abruf_a['sha256'],
                                             abgerufenAm=abruf_a['abgerufenAm']), funktionen=[]),
        k_b: dict(status='offen', quelle=dict(url=abruf_b['url'], sha256=abruf_b['sha256'],
                                             abgerufenAm=abruf_b['abgerufenAm']), funktionen=[]),
    }
    originalbelege = [
        dict(kennung=k_a, quelle=eintrag_a['quelle'], amtlichesJsonLd=[eintrag_a['amtlicherRollenbeleg']],
             bestehendeFunktionen=eintrag_a['bestehendeFunktionen']),
        dict(kennung=k_b, quelle=eintrag_b['quelle'], amtlichesJsonLd=[eintrag_b['amtlicherRollenbeleg']],
             bestehendeFunktionen=eintrag_b['bestehendeFunktionen']),
    ]
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=2, Bund=2, Berlin=0, Brandenburg=0),
                             ergebnisse=[eintrag_a, eintrag_b])

    def _beratende_eingang(quittung, original=None, ressort=None, aufgaben=None):
        return SimpleNamespace(verzeichnis=root, detailseiten=detail, beratendeachsen=quittung,
                               beratende_originalbelege=originalbelege if original is None else original,
                               profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf,
                               ressortachsen_by_kennung={k: {} for k in (ressort or [])},
                               aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])})

    index = ba.pruefe_beratendeachsen(_beratende_eingang(gueltige_quittung))
    assert len(index) == 2, len(index)
    assert {v['themen'][0] for v in index.values()} == {'Landwirtschaft', 'Haushalt'}
    assert all(v['rolle'] == 'Beratendes Mitglied' for v in index.values())
    assert sum(len(v['themen']) for v in index.values()) == 4

    def _mit(mutation):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return ba.pruefe_beratendeachsen(_beratende_eingang(neu))

    # Fehlende Quittung (Datei fehlt) und falsche Bilanz.
    _echter_pfad = ba.BERATENDEACHSEN
    ba.BERATENDEACHSEN = root / 'fehlt.json'
    try:
        _erwarte_beratende_fehler(
            lambda: ba.pruefe_beratendeachsen(SimpleNamespace(verzeichnis=root, detailseiten=detail,
                                                              profilrollen_by_kennung=profilrollen,
                                                              kennung_zu_abruf=kennung_zu_abruf)),
            'fehlende Beratendequittung')
    finally:
        ba.BERATENDEACHSEN = _echter_pfad
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 1)), 'falsche Beratendebilanz')
    # Duplikat und Fremdkennung (nicht in den 500 Zielprofilen).
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'kennung', q['ergebnisse'][0]['kennung'])), 'doppelte Kennung')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-fremd-9999')), 'Fremdkennung')
    # Kennung ausserhalb der 54er Rollenquittung, Ressort- und Aufgabenachsen-Ueberschneidung.
    fremd_kennung = 'bundestag-nichtind54-7'
    kennung_zu_abruf[fremd_kennung] = dict(abruf_a, amtlicheKennung='test_9-3099', url='https://www.bundestag.de/abgeordnete/biografien/T/test_9-3099', datei='bundestag-test_9-3099.html')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', fremd_kennung)), 'Kennung ausserhalb der 54er Rollenquittung')
    kennung_zu_abruf.pop(fremd_kennung, None)
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(
        _beratende_eingang(gueltige_quittung, ressort=[k_a])), 'Kennung bereits Ressortachse')
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(
        _beratende_eingang(gueltige_quittung, aufgaben=[k_b])), 'Kennung bereits Aufgabenachse')
    # Quelldrift: URL, finalUrl, Hash, Bytezahl, Abrufzeit, Datei.
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Quell-URL-Drift')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'finalUrl', q['ergebnisse'][0]['quelle']['finalUrl'] + '-fremd')), 'finalUrl-Drift')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'sha256', '0' * 64)), 'Quellhash-Drift')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'bytes', 1)), 'Quell-Bytezahl-Drift')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'datei', 'fehlt.html')), 'fehlende Detailseite')
    # Vollstaendiger Quellenpakettausch der 2 Profilquellen (Kennungen bleiben).
    def _pakettausch(q):
        a, b = q['ergebnisse']
        for feld in ['quelle', 'amtlicherRollenbeleg', 'originalrollen', 'person', 'amtlicherAusschuss', 'themen', 'ableitungsHinweis']:
            a[feld], b[feld] = b[feld], a[feld]
    _erwarte_beratende_fehler(lambda: _mit(_pakettausch), 'vollstaendiger Quellenpakettausch der 2')
    # Reine Quellen-Tauschvariante (nur das quelle-Paket).
    def _nur_quelle_tauschen(q):
        a, b = q['ergebnisse']
        a['quelle'], b['quelle'] = b['quelle'], a['quelle']
    _erwarte_beratende_fehler(lambda: _mit(_nur_quelle_tauschen), 'Quellenpaket der 2 vertauscht')
    # H1/Person- und Person-URL-Tausch.
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'person', q['ergebnisse'][1]['person'])), 'H1-Personentausch')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'])), 'Personen-URL-Tausch')
    # Beratend -> ordentlich/stellvertretend, endDate, andere Role.
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['amtlicherRollenbeleg'].__setitem__(
        'roleName', 'Ordentliches Mitglied')), 'Beratend -> ordentlich (amtlicher Beleg)')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['amtlicherRollenbeleg'].__setitem__(
        'roleName', 'Stellvertretendes Mitglied')), 'Beratend -> stellvertretend (amtlicher Beleg)')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['amtlicherRollenbeleg'].__setitem__(
        'endDate', '2026-01-01')), 'abgelaufene Rolle (endDate im Beleg)')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['amtlicherRollenbeleg'].__setitem__(
        'startDate', '2000-01-01')), 'Rollenbeleg-Drift (startDate)')
    # Echte HTML-Role geaendert: ordentliche Rolle bzw. endDate sperren fail closed.
    eintrag_a_ordentlich = json.loads(json.dumps(eintrag_a))
    ld_o, rolle_o = _ld_json('Person Alpha', AUSSCHUSS_A, URL_A, rolle='Ordentliches Mitglied')
    (detail / eintrag_a['quelle']['datei']).write_text(
        f'<h1>Person Alpha</h1><script type="application/ld+json">{json.dumps(ld_o, ensure_ascii=False)}</script>',
        encoding='utf-8')
    neu_quelle = dict(eintrag_a['quelle'], sha256=ba._sha256(detail / eintrag_a['quelle']['datei']),
                      bytes=(detail / eintrag_a['quelle']['datei']).stat().st_size)
    abruf_a.update(dict(sha256=neu_quelle['sha256'], bytes=neu_quelle['bytes']))
    profilrollen[k_a]['quelle'] = dict(url=abruf_a['url'], sha256=abruf_a['sha256'], abgerufenAm=abruf_a['abgerufenAm'])
    eintrag_a_ordentlich['quelle'] = neu_quelle
    eintrag_a_ordentlich['amtlicherRollenbeleg'] = rolle_o
    eintrag_a_ordentlich['originalrollen'] = [rolle_o]
    q_ordentlich = dict(gueltige_quittung, ergebnisse=[eintrag_a_ordentlich, eintrag_b])
    original_ordentlich = [dict(originalbelege[0], quelle=neu_quelle, amtlichesJsonLd=[rolle_o]), originalbelege[1]]
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(
        _beratende_eingang(q_ordentlich, original=original_ordentlich)), 'echte ordentliche Rolle statt beratend')
    # endDate in der echten HTML-Rolle.
    ld_e, rolle_e = _ld_json('Person Alpha', AUSSCHUSS_A, URL_A, enddate='2026-01-01')
    (detail / eintrag_a['quelle']['datei']).write_text(
        f'<h1>Person Alpha</h1><script type="application/ld+json">{json.dumps(ld_e, ensure_ascii=False)}</script>',
        encoding='utf-8')
    neu_quelle_e = dict(eintrag_a['quelle'])
    neu_quelle_e['sha256'] = ba._sha256(detail / eintrag_a['quelle']['datei'])
    neu_quelle_e['bytes'] = (detail / eintrag_a['quelle']['datei']).stat().st_size
    abruf_a.update(dict(sha256=neu_quelle_e['sha256'], bytes=neu_quelle_e['bytes']))
    profilrollen[k_a]['quelle'] = dict(url=abruf_a['url'], sha256=abruf_a['sha256'], abgerufenAm=abruf_a['abgerufenAm'])
    eintrag_a_ende = json.loads(json.dumps(eintrag_a))
    eintrag_a_ende['quelle'] = neu_quelle_e
    eintrag_a_ende['amtlicherRollenbeleg'] = rolle_e
    eintrag_a_ende['originalrollen'] = [rolle_e]
    q_ende = dict(gueltige_quittung, ergebnisse=[eintrag_a_ende, eintrag_b])
    original_ende = [dict(originalbelege[0], quelle=neu_quelle_e, amtlichesJsonLd=[rolle_e]), originalbelege[1]]
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(
        _beratende_eingang(q_ende, original=original_ende)), 'echte Rolle mit endDate')
    # Original-HTML wiederherstellen (gueltig).
    ld_g, rolle_g = _ld_json('Person Alpha', AUSSCHUSS_A, URL_A)
    (detail / eintrag_a['quelle']['datei']).write_text(
        f'<h1>Person Alpha</h1><script type="application/ld+json">{json.dumps(ld_g, ensure_ascii=False)}</script>',
        encoding='utf-8')
    neu_quelle_g = dict(eintrag_a['quelle'])
    neu_quelle_g['sha256'] = ba._sha256(detail / eintrag_a['quelle']['datei'])
    neu_quelle_g['bytes'] = (detail / eintrag_a['quelle']['datei']).stat().st_size
    abruf_a.update(dict(sha256=neu_quelle_g['sha256'], bytes=neu_quelle_g['bytes']))
    profilrollen[k_a]['quelle'] = dict(url=abruf_a['url'], sha256=abruf_a['sha256'], abgerufenAm=abruf_a['abgerufenAm'])
    eintrag_a['quelle'] = neu_quelle_g
    eintrag_a['amtlicherRollenbeleg'] = rolle_g
    eintrag_a['originalrollen'] = [rolle_g]
    originalbelege[0] = dict(originalbelege[0], quelle=neu_quelle_g, amtlichesJsonLd=[rolle_g])
    gueltige_quittung = dict(gueltige_quittung, ergebnisse=[eintrag_a, eintrag_b])
    assert len(ba.pruefe_beratendeachsen(_beratende_eingang(gueltige_quittung))) == 2
    # Fremdthema, fehlender Hinweis, Importfreigabe, nicht genehmigter Ausschuss, H1-Mehrdeutigkeit.
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', ['Unbelegtes Fremdthema'])), 'fremdes Thema')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['themen'].append('Digitales')),
                              'zusaetzliches Fremdthema')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].pop('ableitungsHinweis')),
                              'fehlender Ableitungshinweis')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'ableitungsHinweis', 'Beratende Ausschussarbeit Bund: irgendwas; keine persoenliche Position')),
        'abweichender Ableitungshinweis')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'importfreigegeben', True)), 'Importfreigabe gesetzt')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'amtlicherAusschuss', 'Ausschuss für Digitales')), 'nicht genehmigter Ausschuss')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'bestehendeFunktionen', [])), 'bestehende beratende Funktion entfernt')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'jsonLdPfad', 'ProfilePage.mainEntity')), 'abweichender JSON-LD-Pfad')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'originalrollen', [])), 'fehlende Originalrollen')
    _erwarte_beratende_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'region', 'Berlin')), 'falsche Region')
    # Fremdes/abweichendes JSON-LD: zweite H1 bzw. zweiter ProfilePage-Block.
    detail_datei = eintrag_a['quelle']['datei']
    original_html = (detail / detail_datei).read_text(encoding='utf-8')

    def _mit_variierter_html(html_variante):
        (detail / detail_datei).write_text(html_variante, encoding='utf-8')
        neu = dict(eintrag_a['quelle'])
        neu['sha256'] = ba._sha256(detail / detail_datei)
        neu['bytes'] = (detail / detail_datei).stat().st_size
        abruf_a.update(dict(sha256=neu['sha256'], bytes=neu['bytes']))
        profilrollen[k_a]['quelle'] = dict(url=abruf_a['url'], sha256=neu['sha256'],
                                           abgerufenAm=abruf_a['abgerufenAm'])
        originalbelege[0] = dict(originalbelege[0], quelle=neu, amtlichesJsonLd=[rolle_g])
        variante = dict(gueltige_quittung, ergebnisse=[dict(eintrag_a, quelle=neu), eintrag_b])
        return variante

    q_h1 = _mit_variierter_html('<h1>Person Alpha</h1><h1>Fremd</h1>' + original_html)
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(_beratende_eingang(q_h1)), 'mehrdeutige H1')
    ld_x, rolle_x = _ld_json('Fremd Person', AUSSCHUSS_A, URL_A)
    q_ld = _mit_variierter_html(
        original_html + f'<script type="application/ld+json">{json.dumps(ld_x, ensure_ascii=False)}</script>')
    _erwarte_beratende_fehler(lambda: ba.pruefe_beratendeachsen(_beratende_eingang(q_ld)),
                              'zweiter ProfilePage-Block (fremdes JSON-LD)')
    (detail / detail_datei).write_text(original_html, encoding='utf-8')
    abruf_a.update(dict(sha256=eintrag_a['quelle']['sha256'], bytes=eintrag_a['quelle']['bytes']))
    profilrollen[k_a]['quelle'] = dict(url=abruf_a['url'], sha256=abruf_a['sha256'],
                                       abgerufenAm=abruf_a['abgerufenAm'])
    originalbelege[0] = dict(originalbelege[0], quelle=eintrag_a['quelle'], amtlichesJsonLd=[eintrag_a['amtlicherRollenbeleg']])
    # Gueltige Quittung nach allen Mutationen weiter akzeptiert.
    assert len(ba.pruefe_beratendeachsen(_beratende_eingang(gueltige_quittung))) == 2

    # Auch bei konsistent angepasster Quittung muss die Rollenpruefung selbst
    # fremde Personenkennungen und zeitlich ungueltige Rollen ablehnen.
    def _direkte_rollenvariante(mutieren):
        ld, rolle = _ld_json('Person Alpha', AUSSCHUSS_A, URL_A)
        mutieren(ld, rolle)
        e = dict(eintrag_a, amtlicherRollenbeleg=rolle, originalrollen=[rolle])
        dokument = '<h1>Person Alpha</h1><script type="application/ld+json">' + json.dumps(ld) + '</script>'
        return ba._pruefe_rollenbeleg(e, e['quelle'], dokument, k_a)

    _erwarte_beratende_fehler(lambda: _direkte_rollenvariante(
        lambda ld, r: ld['mainEntity'].__setitem__('@id', '#fremde-person')), 'fremde Fragmentkennung')
    _erwarte_beratende_fehler(lambda: _direkte_rollenvariante(
        lambda ld, r: ld['mainEntity'].__setitem__('url', eintrag_b['quelle']['url'])), 'fremde mainEntity.url')
    for start in ('2099-01-01', '2026-13-01', ''):
        _erwarte_beratende_fehler(lambda start=start: _direkte_rollenvariante(
            lambda ld, r: r.__setitem__('startDate', start)), 'zukuenftiger/ungueltiger Rollenbeginn')
    for ende in ('2026-01-01', '', None):
        _erwarte_beratende_fehler(lambda ende=ende: _direkte_rollenvariante(
            lambda ld, r: r.__setitem__('endDate', ende)), 'nicht freigegebenes endDate')
    assert _direkte_rollenvariante(lambda ld, r: r.__setitem__('startDate', '2026-09-27'))

print('PASS: Beratende Achsenquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/'
      'Kennung ausserhalb der 54er Rollenquittung/Ressort- und Aufgabenachsen-Ueberschneidung/'
      'Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei)/vollstaendiger Quellenpakettausch der 2/'
      'H1- und Personen-URL-Tausch/Beratend->ordentlich bzw. stellvertretend/endDate/andere Role/'
      'fremdes Thema/fehlender bzw. abweichender Herkunftshinweis/Importfreigabe/nicht genehmigter '
      'Ausschuss/fehlende bestehende beratende Funktion/abweichender JSON-LD-Pfad/fehlende Originalrollen/'
      'mehrdeutige H1/zweiter ProfilePage-Block sperren fail closed; die gueltige synthetische '
      '2er-Quittung (4 Kurzthemen, bestehende beratende Funktion) wird akzeptiert.')


# ── 11 · Berliner Mandatsartenquittung: PDF-Beleg + Profilblock, fail closed ─────────────
def _be_paket(root):
    """Synthetisches, quittungskonformes Quellenpaket (keine /private/tmp-Originale)."""
    detail = root / 'detailseiten'
    zusatz = root / 'zusatzquellen'
    detail.mkdir(parents=True, exist_ok=True)
    zusatz.mkdir(parents=True, exist_ok=True)

    (zusatz / 'handbuch.pdf').write_bytes(b'%PDF-1.4 synthetisches Pruef-PDF fuer die Gegenprobe\n')
    pdf_sha = m._sha256(zusatz / 'handbuch.pdf')
    pdf_bytes = (zusatz / 'handbuch.pdf').stat().st_size
    wahl_url = 'https://www.parlament-berlin.de/das-parlament/abgeordnete/suche-nach-wahlkreisen'
    (zusatz / 'wahlkreise.html').write_text(
        '<h2 class="t"><button> Wahlbezirk 10: Marzahn-Hellersdorf </button></h2>'
        '<div class="c"><h3 class="h">Wahlkreis 1:</h3><ul><li>'
        '<a href="/Abgeordnete/olga-gauks?groupStrategy=constituency">Gauks, Olga</a></li></ul>'
        '<h3 class="h">Bezirksliste:</h3><ul><li>'
        '<a href="/Abgeordnete/johannes-martin?groupStrategy=constituency">'
        'Martin, Johannes, CDU-Fraktion, Nachgerückt</a></li></ul></div>'
        '<h2 class="t"><button>Wahlbezirk 11: Lichtenberg</button></h2>'
        '<div class="c"><h3 class="h">Bezirksliste:</h3><ul><li>'
        '<a href="/Abgeordnete/johannes-martin?groupStrategy=constituency">'
        'Martin, Johannes, CDU-Fraktion, Nachgerückt</a></li></ul></div>',
        encoding='utf-8')
    wahl_sha = m._sha256(zusatz / 'wahlkreise.html')
    wahl_bytes = (zusatz / 'wahlkreise.html').stat().st_size

    personen = [
        dict(kennung='johannes-martin', name='Johannes Martin',
             datei='landtag-berlin-johannes-martin.html',
             url='https://www.parlament-berlin.de/Abgeordnete/johannes-martin?groupStrategy=nachnamen',
             block='Nachgerückt am 27.09.2025 für Christian Gräff', datum='2025-09-27',
             mandatsart='Bezirksliste', region='Berlin — Bezirksliste Marzahn-Hellersdorf',
             zitat='Martin, Johannes CDU nachgerückt am 27. September 2025 Marzahn-Hellersdorf, Bezirksliste',
             abschnitt=dict(oberabschnitt='Wahlbezirk 10: Marzahn-Hellersdorf', unterabschnitt='Bezirksliste:',
                            href='/Abgeordnete/johannes-martin?groupStrategy=constituency',
                            linkText='Martin, Johannes, CDU-Fraktion, Nachgerückt')),
        dict(kennung='benedikt-lux', name='Benedikt Lux',
             datei='landtag-berlin-benedikt-lux.html',
             url='https://www.parlament-berlin.de/Abgeordnete/benedikt-lux?groupStrategy=nachnamen',
             block='Nachgerückt am 14.05.2025 für Julia Schneider', datum='2025-05-14',
             mandatsart='Landesliste', region='Berlin — Landesliste',
             zitat='Lux, Benedikt Bündnis 90/Die Grünen nachgerückt am 14. Mai 2025 Landesliste',
             abschnitt=None),
    ]
    abruf = []
    for p in personen:
        (detail / p['datei']).write_text(
            f'<h1>{p["name"]}, TEST</h1><dl class="b-delegate-facts">'
            f'<dt class="delegate-facts-title">{p["block"]}</dt></dl>', encoding='utf-8')
        p['html_sha'] = m._sha256(detail / p['datei'])
        p['html_bytes'] = (detail / p['datei']).stat().st_size
        abruf.append(dict(url=p['url'], amtlicheKennung=p['kennung'], parlament='landtag-berlin',
                          sha256=p['html_sha'], bytes=p['html_bytes']))

    quelle = dict(url='https://www.parlament-berlin.de/media/download/5468',
                  finalUrl='https://www.parlament-berlin.de/media/download/5468',
                  datei='handbuch.pdf', abgerufenAm='2026-09-27T17:50:02.091789+00:00',
                  sha256=pdf_sha, bytes=pdf_bytes, stand='2025-10-08', seite=204,
                  pdfSeiteIndex=204, spalte='links', http=200)
    erwartung = dict(quelle=dict(quelle), belege={})
    for p in personen:
        eintrag = dict(kennung=f'landtag-berlin-{p["kennung"]}', amtlicheKennung=p['kennung'], profilUrl=p['url'],
                       profilDatei=p['datei'], profilSha256=p['html_sha'], profilBytes=p['html_bytes'],
                       vollname=p['name'], nachgeruecktAm=p['datum'], profilblockWortlaut=p['block'],
                       mandatsart=p['mandatsart'], regionHinweis=p['region'], seite=204, spalte='links',
                       zitat=p['zitat'])
        if p['abschnitt']:
            eintrag['aktuelleAbschnittsbindung'] = dict(p['abschnitt'], quelleUrl=wahl_url,
                                                        quelleDatei='wahlkreise.html', quelleSha256=wahl_sha,
                                                        quelleBytes=wahl_bytes, finalUrl=wahl_url,
                                                        abgerufenAm='2026-09-27T17:49:28.438246+00:00', http=200)
        erwartung['belege'][p['kennung']] = eintrag
    quittung = dict(vertragsformat='helmut-mandatsartenbeleg/1', quelle=dict(quelle),
                    belege=[dict(e) for e in erwartung['belege'].values()])
    return SimpleNamespace(detailseiten=detail, verzeichnis=root, abruf=abruf), erwartung, quittung, zusatz


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    eingang, erwartung, quittung, zusatz = _be_paket(root)

    # Quellmeta-JSON: PDF und Wahlkreissuche werden gegen die Quittung geprueft.
    (zusatz / 'handbuch.json').write_text(json.dumps(erwartung['quelle'], ensure_ascii=False), encoding='utf-8')
    abschnitt = erwartung['belege']['johannes-martin']['aktuelleAbschnittsbindung']
    (zusatz / 'wahlkreise.json').write_text(json.dumps(dict(
        url=abschnitt['quelleUrl'], finalUrl=abschnitt['quelleUrl'],
        abgerufenAm=abschnitt['abgerufenAm'], http=200, sha256=abschnitt['quelleSha256'],
        bytes=abschnitt['quelleBytes'], datei=abschnitt['quelleDatei']), ensure_ascii=False), encoding='utf-8')

    def _be_mit(mutieren=None, datei_aenderung=None):
        neu = json.loads(json.dumps(quittung))
        if mutieren:
            mutieren(neu)
        if datei_aenderung:
            datei_aenderung()
        pfad = root / 'be-quittung-aendern.json'
        pfad.write_text(json.dumps(neu, ensure_ascii=False), encoding='utf-8')
        return m._pruefe_mandatsarten_be(eingang, pfad, erwartung)

    # Gueltiges synthetisches Paket wird akzeptiert (2 Belege).
    pfad_gueltig = root / 'be-quittung.json'
    pfad_gueltig.write_text(json.dumps(quittung, ensure_ascii=False), encoding='utf-8')
    assert set(m._pruefe_mandatsarten_be(eingang, pfad_gueltig, erwartung)) == {'johannes-martin', 'benedikt-lux'}

    # Das eingecheckte Original muss exakt der genehmigten Validator-Konstante entsprechen.
    repo_quittung = json.loads((Path(m.__file__).resolve().parents[1]
                                / 'docs' / 'betrieb' / 'berlin-mandatsarten-20260927.json').read_text(encoding='utf-8'))
    for feld, wert in m.MANDATSARTEN_BE_ERWARTUNG['quelle'].items():
        assert repo_quittung['quelle'][feld] == wert, feld
    for amt, soll in m.MANDATSARTEN_BE_ERWARTUNG['belege'].items():
        ist = next(e for e in repo_quittung['belege'] if e['amtlicheKennung'] == amt)
        for feld, wert in soll.items():
            assert ist[feld] == wert, (amt, feld)

    # Negativfaelle: PDF-Beleg (Hash/Metadrift), Duplikat, Fremdperson/-URL/-Datum,
    # vertauschtes Ganzpaket, PDF-Stand/Seite/Spalte, Transkription und Mandatsart.
    _erwarte_fehler(lambda: _be_mit(lambda q: q['quelle'].__setitem__('sha256', '0' * 64)), 'PDF-Hashdrift Quittung')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['quelle'].__setitem__('stand', '2026-01-01')), 'PDF-Stand veraendert')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['quelle'].__setitem__('seite', 205)), 'PDF-Seite veraendert')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['quelle'].__setitem__('spalte', 'rechts')), 'PDF-Spalte veraendert')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'][0].__setitem__('zitat', 'Frei erfunden')), 'Transkription veraendert')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'][0].__setitem__('mandatsart', 'Direktmandat')), 'Mandatsart veraendert')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'].append(json.loads(json.dumps(q['belege'][0])))), 'doppelter Beleg')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'][0].__setitem__('vollname', 'Fremde Person')), 'Fremdperson')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'][0].__setitem__('profilUrl', q['belege'][1]['profilUrl'])), 'Fremd-URL')
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'][0].__setitem__('nachgeruecktAm', '2025-05-14')), 'falsches Datum')
    def _ganzpaket_tauschen(q):
        a, b = q['belege'][0], q['belege'][1]
        for feld in ('profilUrl', 'profilDatei', 'profilSha256', 'profilBytes', 'vollname',
                     'nachgeruecktAm', 'profilblockWortlaut', 'mandatsart', 'regionHinweis',
                     'zitat', 'aktuelleAbschnittsbindung'):
            links, rechts = a.get(feld), b.get(feld)
            if links is None and rechts is None:
                continue
            a[feld], b[feld] = rechts, links
    _erwarte_fehler(lambda: _be_mit(_ganzpaket_tauschen), 'vertauschtes Ganzpaket (Inhalt)')
    # Auch ein Tausch der beiden Originaldateien auf der Platte (Quellenpaket) sperrt.
    martin_datei = eingang.detailseiten / 'landtag-berlin-johannes-martin.html'
    lux_datei = eingang.detailseiten / 'landtag-berlin-benedikt-lux.html'
    martin_inhalt, lux_inhalt = martin_datei.read_bytes(), lux_datei.read_bytes()
    try:
        martin_datei.write_bytes(lux_inhalt)
        lux_datei.write_bytes(martin_inhalt)
        _erwarte_fehler(lambda: _be_mit(), 'vertauschtes Quellenpaket auf der Platte')
    finally:
        martin_datei.write_bytes(martin_inhalt)
        lux_datei.write_bytes(lux_inhalt)
    _erwarte_fehler(lambda: _be_mit(lambda q: q['belege'].append(dict(
        q['belege'][1], kennung='landtag-berlin-claudia-engelmann',
        amtlicheKennung='claudia-engelmann'))), 'Engelmann als Fremdkennung')

    # Quellmeta-JSON-Drift: nur der Metadaten-Hash weicht ab -> fail closed.
    meta = json.loads((zusatz / 'wahlkreise.json').read_text(encoding='utf-8'))
    (zusatz / 'wahlkreise.json').write_text(json.dumps(dict(meta, sha256='0' * 64), ensure_ascii=False), encoding='utf-8')
    _erwarte_fehler(lambda: _be_mit(), 'Quellmeta-Drift')
    (zusatz / 'wahlkreise.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')

    # Auch unveraenderte Originalbytes erlauben keine veraenderten Abrufmetadaten.
    for filename in ('handbuch.json', 'wahlkreise.json'):
        meta_path = zusatz / filename
        original_meta = json.loads(meta_path.read_text(encoding='utf-8'))
        for feld, falsch in (('finalUrl', 'https://example.org/fremd'),
                             ('abgerufenAm', '2025-01-01T00:00:00Z'), ('http', 404)):
            try:
                meta_path.write_text(json.dumps(dict(original_meta, **{feld: falsch})), encoding='utf-8')
                _erwarte_fehler(lambda: _be_mit(), f'{filename}: {feld}-Drift')
            finally:
                meta_path.write_text(json.dumps(original_meta, ensure_ascii=False), encoding='utf-8')

    # Martin-Abschnittsbindung: fehlender/verschobener H2, fehlender H3 -> fail closed,
    # obwohl derselbe Personlink an anderer Stelle im Dokument vorkommt (kein globales Wort).
    original_wahl = (zusatz / 'wahlkreise.html').read_text(encoding='utf-8')

    def _wahl(neu_text):
        (zusatz / 'wahlkreise.html').write_text(neu_text, encoding='utf-8')
        meta_neu = json.loads((zusatz / 'wahlkreise.json').read_text(encoding='utf-8'))
        (zusatz / 'wahlkreise.json').write_text(json.dumps(dict(
            meta_neu, sha256=m._sha256(zusatz / 'wahlkreise.html'),
            bytes=(zusatz / 'wahlkreise.html').stat().st_size), ensure_ascii=False), encoding='utf-8')
        neu = json.loads(json.dumps(quittung))
        a = neu['belege'][0]['aktuelleAbschnittsbindung']
        a['quelleSha256'] = m._sha256(zusatz / 'wahlkreise.html')
        a['quelleBytes'] = (zusatz / 'wahlkreise.html').stat().st_size
        erwartung['belege']['johannes-martin']['aktuelleAbschnittsbindung']['quelleSha256'] = a['quelleSha256']
        erwartung['belege']['johannes-martin']['aktuelleAbschnittsbindung']['quelleBytes'] = a['quelleBytes']
        pfad = root / 'be-quittung-wahl.json'
        pfad.write_text(json.dumps(neu, ensure_ascii=False), encoding='utf-8')
        return m._pruefe_mandatsarten_be(eingang, pfad, erwartung)

    try:
        _erwarte_fehler(lambda: _wahl(original_wahl.replace(
            '<h2 class="t"><button> Wahlbezirk 10: Marzahn-Hellersdorf </button></h2>', '')), 'fehlender H2')
        _erwarte_fehler(lambda: _wahl(original_wahl.replace(
            'Wahlbezirk 10: Marzahn-Hellersdorf', 'Wahlbezirk 11: Lichtenberg')), 'verschobener H2')
        _erwarte_fehler(lambda: _wahl(original_wahl.replace(
            '<h3 class="h">Bezirksliste:</h3>', '<h3 class="h">Wahlkreis 9:</h3>', 1)), 'fehlender H3')
    finally:
        (zusatz / 'wahlkreise.html').write_text(original_wahl, encoding='utf-8')
        meta_zurueck = json.loads((zusatz / 'wahlkreise.json').read_text(encoding='utf-8'))
        (zusatz / 'wahlkreise.json').write_text(json.dumps(dict(
            meta_zurueck, sha256=m._sha256(zusatz / 'wahlkreise.html'),
            bytes=(zusatz / 'wahlkreise.html').stat().st_size), ensure_ascii=False), encoding='utf-8')
        erwartung['belege']['johannes-martin']['aktuelleAbschnittsbindung']['quelleSha256'] = \
            m._sha256(zusatz / 'wahlkreise.html')
        erwartung['belege']['johannes-martin']['aktuelleAbschnittsbindung']['quelleBytes'] = \
            (zusatz / 'wahlkreise.html').stat().st_size

print('PASS: Berliner Mandatsartenquittung — PDF-Beleg an Stand/Seite 204/linke Spalte/URL/Hash/Bytezahl/'
      'Abruf und Quellmeta gebunden, woertliche Transkription, Profilblock-Person/-Datum/-Hash und exakte '
      'H2/H3/Personlink-Bindung (Martin, kein globales Wortvorkommen); PDF-Hash/Metadrift, PDF-Stand, Seite, '
      'Spalte, Transkription, Mandatsart, Duplikat, Fremdperson/-URL/-Datum, vertauschtes Ganzpaket, fehlender/'
      'verschobener H2 und fehlender H3 sowie Engelmann als Fremdkennung sperren fail closed; das gueltige '
      'synthetische 2er-Paket wird akzeptiert und die eingecheckte Quittung entspricht der Validator-Konstante.')


# ── 12 · Zusatzaufgabenquittung der 3 geschlossenen Fachzustaendigkeiten ───────────────────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das fixierte
# PDF-Fachurteil (Kippels) wird ueber den injizierbaren ``erwartung``-Parameter
# ersetzt; so bleiben die drei Faelle auch ohne die lokalen Originale lauffaehig.
zm_spec = importlib.util.spec_from_file_location(
    'zusa', Path(__file__).with_name('profil-feldbelege-500-zusatzaufgaben.py'))
zm = importlib.util.module_from_spec(zm_spec)
zm_spec.loader.exec_module(zm)


def _erwarte_zusatz_fehler(fn, was):
    try:
        fn()
    except zm.ZusatzaufgabenFehler:
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF = '2026-09-27T16:00:00+00:00'

    def _meta(datei, url, meta_name=None):
        pfad = zusatz / datei
        sha = zm._sha256(pfad)
        groesse = pfad.stat().st_size
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=sha, bytes=groesse,
                    datei=datei, http=200)
        (zusatz / (meta_name or f'{datei}.meta.json')).write_text(
            json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    # ── Breher: aktuelle 'seit'-Rolle im geschlossenen Biografieblock vor der Notiz ──
    K_B, K_K, K_P = 'bundestag-test-breher-1', 'bundestag-test-krichbaum-2', 'bundestag-test-kippels-3'
    person_b, person_k, person_p = 'Person Breher', 'Person Krichbaum', 'Person Kippels'
    breher_zitat = 'seit September 2025 Beauftragte der Bundesregierung für Testtierschutz.'
    breher_funktion = 'Beauftragte der Bundesregierung für Testtierschutz'
    breher_datei = f'{K_B}.html'
    (detail / breher_datei).write_text(
        f'<h1>{person_b}</h1><div class="m-biography__biography"><span>Person Breher, seit September 2025 '
        f'Beauftragte der Bundesregierung für Testtierschutz.</span><br/><span>[Anmerkung der Redaktion: Test]</span>'
        f'</div>', encoding='utf-8')
    breher_url = f'https://www.bundestag.de/abgeordnete/biografien/T/person-breher-test-breher-1'
    quelle_b = dict(url=breher_url, finalUrl=breher_url, abgerufenAm=ABRUF,
                    sha256=zm._sha256(detail / breher_datei), bytes=(detail / breher_datei).stat().st_size,
                    datei=breher_datei, http=200, abrufStatus='abgerufen', amtlicheKennung='test-breher-1')

    # ── Krichbaum: aktuelle AA-Seitenkopf-H1 (nicht die alte Sprecherrolle) ──
    krich_amt = 'Staatsminister für Testeuropa'
    krich_zitat = f'{krich_amt} {person_k}'
    krich_datei = f'{K_K}.html'
    (zusatz / krich_datei).write_text(
        f'<h1 class="is-aural">Willkommen</h1><h1 class="heading__title">{krich_zitat}</h1><p>Alte Sprecherrolle 2022-2025</p>', encoding='utf-8')
    krich_url = 'https://www.auswaertiges-amt.de/de/test-krichbaum'
    quelle_k = _meta(krich_datei, krich_url)

    # ── Kippels: manuell abgenommenes PDF-Urteil + amtlicher PDF-Link auf der Landingpage ──
    pdf_datei, landing_datei = 'test-organisationsplan.pdf', 'test-landing.html'
    (zusatz / pdf_datei).write_text('%PDF-1.4 synthetisches Testfixture', encoding='utf-8')
    pdf_url = 'https://www.bundesgesundheitsministerium.de/fileadmin/test/Organisationsplan.pdf'
    quelle_p = _meta(pdf_datei, pdf_url)
    landing_url = 'https://www.bundesgesundheitsministerium.de/ministerium/test-organisationsplan'
    (zusatz / landing_datei).write_text(
        f'<a href="/fileadmin/test/Organisationsplan.pdf">Deutsch</a>'
        f'<a href="/fileadmin/test/Organisationsplan_EN.pdf">Englisch</a>', encoding='utf-8')
    verlinkung_p = _meta(landing_datei, landing_url)

    kippels_abteilungen = {
        '1': 'Arzneimittel, Medizinprodukte',
        '4': 'Pflegeversicherung, Heilberufe',
        '5': 'Digitalisierung',
        '6': 'Gesundheitssicherheit, Internationales, Testeuropa',
    }
    kippels_themen = ['Arzneimittel', 'Medizinprodukte', 'Pflegeversicherung', 'Heilberufe',
                      'Digitalisierung', 'Gesundheitssicherheit', 'Internationales', 'Testeuropa']
    kippels_bindung = ('Parlamentarischer Staatssekretär im Bundesministerium für Testgesundheit; '
                       'Geschäftsbereich Abteilungen 1, 4, 5 und 6')
    erwartung = {
        K_B: dict(bindungsart='beauftragtenrolle', region='Bund', person=person_b,
                  funktion=breher_funktion, zitat=breher_zitat, abschnitt='Biografie', themen=['Testtierschutz']),
        K_K: dict(bindungsart='amtshinweis', region='Bund', person=person_k, amt=krich_amt,
                  zitat=krich_zitat, abschnitt='Aktueller Seitenkopf', themen=['Testeuropa']),
        K_P: dict(bindungsart='abteilungszustaendigkeit', region='Bund', person=person_p,
                  aufgabenbindung=kippels_bindung, stand='03. September 2026', seite=1,
                  personblock=['Parlamentarischer Staatssekretär', person_p, 'MdB',
                               'Geschäftsbereich: Abt. 1, 4, 5, 6'],
                  abteilungen=kippels_abteilungen, themen=kippels_themen,
                  quelle=quelle_p, aktuelleVerlinkung=verlinkung_p),
    }
    rollen_ref = {
        K_B: dict(url=breher_url, sha256=quelle_b['sha256'], abgerufenAm=ABRUF),
        K_K: dict(url=f'https://www.bundestag.de/abgeordnete/biografien/T/{K_K}', sha256='a' * 64, abgerufenAm=ABRUF),
        K_P: dict(url=f'https://www.bundestag.de/abgeordnete/biografien/T/{K_P}', sha256='b' * 64, abgerufenAm=ABRUF),
    }
    kennung_zu_abruf = {
        K_B: dict(quelle_b, parlament='bundestag'),
        K_K: dict(quelle_b, url=rollen_ref[K_K]['url'], sha256=rollen_ref[K_K]['sha256'],
                  datei=f'{K_K}.html', amtlicheKennung=K_K, abrufStatus='abgerufen', http=200,
                  parlament='bundestag'),
        K_P: dict(quelle_b, url=rollen_ref[K_P]['url'], sha256=rollen_ref[K_P]['sha256'],
                  datei=f'{K_P}.html', amtlicheKennung=K_P, abrufStatus='abgerufen', http=200,
                  parlament='bundestag'),
    }
    for key in (K_K, K_P):
        (detail / f'{key}.html').write_text(f'<h1>{erwartung[key]["person"]}</h1>', encoding='utf-8')
        kennung_zu_abruf[key]['sha256'] = zm._sha256(detail / f'{key}.html')
        rollen_ref[key]['sha256'] = kennung_zu_abruf[key]['sha256']
    profilrollen = {k: dict(status='belegt', quelle=dict(rollen_ref[k]),
                            funktionen=[dict(wortlaut='Parlamentarischer Staatssekretär Test')]) for k in erwartung}
    eintraege = [
        dict(kennung=K_B, region='Bund', parlament='bundestag', status='belegt',
             bindungsart='beauftragtenrolle', person=person_b, funktion=breher_funktion, zitat=breher_zitat,
             abschnitt='Biografie', themen=['Testtierschutz'], rollenquelle=dict(rollen_ref[K_B]), quelle=quelle_b,
             ableitungsHinweis=zm.HINWEIS_AMT.format(region='Bund', wert=breher_funktion), importfreigegeben=False),
        dict(kennung=K_K, region='Bund', parlament='bundestag', status='belegt', bindungsart='amtshinweis',
             person=person_k, amt=krich_amt, zitat=krich_zitat, abschnitt='Aktueller Seitenkopf',
             themen=['Testeuropa'], rollenquelle=dict(rollen_ref[K_K]), quelle=quelle_k,
             ableitungsHinweis=zm.HINWEIS_AMT.format(region='Bund', wert=krich_amt), importfreigegeben=False),
        dict(kennung=K_P, region='Bund', parlament='bundestag', status='belegt', bindungsart='abteilungszustaendigkeit',
             person=person_p, aufgabenbindung=kippels_bindung, stand='03. September 2026', seite=1,
             personblock=['Parlamentarischer Staatssekretär', person_p, 'MdB', 'Geschäftsbereich: Abt. 1, 4, 5, 6'],
             abteilungen=kippels_abteilungen, themen=kippels_themen, rollenquelle=dict(rollen_ref[K_P]),
             quelle=quelle_p, aktuelleVerlinkung=verlinkung_p,
             ableitungsHinweis=zm.HINWEIS_AUFGABE.format(region='Bund', wert=kippels_bindung), importfreigegeben=False),
    ]
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=3, Bund=3, Berlin=0, Brandenburg=0), ergebnisse=eintraege)
    original_breher = (detail / breher_datei).read_text(encoding='utf-8')

    def _setze_breher_html(html):
        """Schreibt den Breher-Block neu und haelt alle Hashbindungen konsistent."""
        (detail / breher_datei).write_text(html, encoding='utf-8')
        sha = zm._sha256(detail / breher_datei)
        groesse = (detail / breher_datei).stat().st_size
        quelle_b['sha256'], quelle_b['bytes'] = sha, groesse
        kennung_zu_abruf[K_B]['sha256'], kennung_zu_abruf[K_B]['bytes'] = sha, groesse
        rollen_ref[K_B]['sha256'] = sha
        profilrollen[K_B]['quelle']['sha256'] = sha
        eintraege[0]['rollenquelle']['sha256'] = sha
        return sha

    def _zusa_eingang(quittung, ressort=None, aufgaben=None, beratende=None):
        return SimpleNamespace(verzeichnis=root, detailseiten=detail, zusaetzlicheaufgaben=quittung,
                               profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf,
                               ressortachsen_by_kennung={k: {} for k in (ressort or [])},
                               aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])},
                               beratendeachsen_by_kennung={k: {} for k in (beratende or [])})

    index = zm.pruefe_zusatzaufgaben(_zusa_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 3
    assert sum(len(v['themen']) for v in index.values()) == 10
    assert index[K_B]['funktion'] == breher_funktion

    def _mit(mutation):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return zm.pruefe_zusatzaufgaben(_zusa_eingang(neu), erwartung=erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat, unbekannte Kennung.
    _echter_pfad = zm.ZUSATZAUFGABEN
    zm.ZUSATZAUFGABEN = root / 'fehlt.json'
    try:
        _erwarte_zusatz_fehler(lambda: zm.pruefe_zusatzaufgaben(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        zm.ZUSATZAUFGABEN = _echter_pfad
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 2)), 'falsche Bilanz')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'kennung', q['ergebnisse'][0]['kennung'])), 'doppelte Kennung')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-test-fremd-9')), 'unbekannte/Fremdkennung')
    # Disjunktion zu den 19/6/2-Achsen.
    _erwarte_zusatz_fehler(lambda: zm.pruefe_zusatzaufgaben(
        _zusa_eingang(gueltige_quittung, ressort=[K_B]), erwartung=erwartung), 'Kennung bereits Ressortachse')
    _erwarte_zusatz_fehler(lambda: zm.pruefe_zusatzaufgaben(
        _zusa_eingang(gueltige_quittung, aufgaben=[K_K]), erwartung=erwartung), 'Kennung bereits Aufgabenachse')
    _erwarte_zusatz_fehler(lambda: zm.pruefe_zusatzaufgaben(
        _zusa_eingang(gueltige_quittung, beratende=[K_P]), erwartung=erwartung), 'Kennung bereits beratende Achse')
    # Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei) und Metadatum-Drift.
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__(
        'url', q['ergebnisse'][1]['quelle']['url'] + '-fremd')), 'Quell-URL-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__(
        'finalUrl', 'https://www.auswaertiges-amt.de/x')), 'finalUrl-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__('sha256', '0' * 64)),
                           'Quellhash-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__('bytes', 1)),
                           'Quell-Bytezahl-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1]['quelle'].__setitem__('datei', 'fehlt.html')),
                           'fehlende Zusatzquelle')
    # Rollenquellen-Drift und kanonischer Personenname.
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__(
        'sha256', 'c' * 64)), 'Rollenquellen-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'person', 'Fremdperson')), 'Fremdperson')
    # Breher: Zitat ausserhalb des Biografieblocks, hinter der Redaktionsnotiz, keine 'seit'-Rolle,
    # Funktion nicht im Zitat, Themen-/Hinweisdrift.
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'zitat', 'Tierschutzbeauftragte seit September 2025')), 'Zitat ausserhalb des Blocks/fixierten Urteils')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', ['Testtierschutz', 'Fremdthema'])), 'Breher-Themendrift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'ableitungsHinweis', 'Amtszuständigkeit Bund: irgendwas')), 'Breher-Hinweisdrift')
    # Zitat erst HINTER der Redaktionsnotiz: kein geschlossener aktueller Beleg.
    try:
        _setze_breher_html(
            f'<h1>{person_b}</h1><div class="m-biography__biography">'
            f'<span>[Anmerkung der Redaktion: Test]</span><br/>'
            f'<span>Person Breher, {breher_zitat}</span></div>')
        _erwarte_zusatz_fehler(lambda: _mit(lambda q: None), 'Zitat hinter der Redaktionsnotiz')
    finally:
        _setze_breher_html(original_breher)
    # Auch konsistent neu gehashter Skript-/Navigations-/Vorlagentext ist kein Personenbeleg.
    try:
        for tag in ('script', 'style', 'template', 'noscript', 'nav'):
            _setze_breher_html(
                f'<h1>{person_b}</h1><div class="m-biography__biography">'
                f'<{tag}>{breher_zitat}</{tag}></div>')
            _erwarte_zusatz_fehler(lambda: _mit(lambda q: None), f'Breher nur in {tag}')
    finally:
        _setze_breher_html(original_breher)
    original_krich = (zusatz / krich_datei).read_text(encoding='utf-8')
    korrekter_kopf = f'<h1 class="heading__title">{krich_zitat}</h1>'
    falsche_koepfe = [
        f'<h1>Fremde Person</h1><h1>{krich_zitat}</h1>',
        f'<h1 class="heading__title">Fremde Person</h1>{korrekter_kopf}',
        f'<!-- {korrekter_kopf} -->',
        *[f'<{tag}>{korrekter_kopf}</{tag}>' for tag in ('script', 'template', 'noscript', 'nav')],
    ]
    try:
        for html in falsche_koepfe:
            (zusatz / krich_datei).write_text(html, encoding='utf-8')
            eintraege[1]['quelle'] = _meta(krich_datei, krich_url)
            _erwarte_zusatz_fehler(lambda: _mit(lambda q: None), 'Kein eindeutiger echter Inhaltskopf')
    finally:
        (zusatz / krich_datei).write_text(original_krich, encoding='utf-8')
        eintraege[1]['quelle'] = _meta(krich_datei, krich_url)
    # Krichbaum: Sprecherrolle statt aktueller H1, Amt-/Themendrift.
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'zitat', 'Sprecher für Testeuropa Person Krichbaum')), 'alte Sprecherrolle')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'amt', 'Staatssekretär für Testeuropa')), 'Krichbaum-Amtdrift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'themen', ['Testeuropa', 'Sprecher'])), 'Krichbaum-Themendrift')
    # Kippels: PDF-Stand/Seite/Personenkasten/Abteilung/Transkription, fremde Zustaendigkeit,
    # fehlender/falscher PDF-Link.
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][2].__setitem__('stand', '01. Januar 2026')),
                           'PDF-Stand-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][2].__setitem__('seite', 2)), 'PDF-Seiten-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][2]['abteilungen'].__setitem__(
        '4', 'Pflegeversicherung, fremde Zustaendigkeit')), 'Abteilungstitel-Drift')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][2].__setitem__(
        'abteilungen', dict(kippels_abteilungen, **{'2': 'Fremdabteilung', '3': 'Fremdabteilung'}))),
        'fremde Schenderlein-Abteilung')
    _erwarte_zusatz_fehler(lambda: _mit(lambda q: q['ergebnisse'][2].__setitem__(
        'themen', kippels_themen + ['Fremdthema'])), 'Kippels-Themendrift')
    # Landingpage ohne den amtlichen PDF-Link (nur englisches PDF / nur Text) sperrt fail closed.
    original_landing = (zusatz / landing_datei).read_text(encoding='utf-8')
    try:
        anker = '<a href="/fileadmin/test/Organisationsplan.pdf">Deutsch</a>'
        falsche_links = [
            '<a href="/fileadmin/test/Organisationsplan_EN.pdf">EN</a>',
            pdf_url, f'<!-- {anker} -->',
            *[f'<{tag}>{anker}</{tag}>' for tag in ('script', 'template', 'noscript')],
        ]
        for html in falsche_links:
            (zusatz / landing_datei).write_text(html, encoding='utf-8')
            neu_verlinkung = _meta(landing_datei, landing_url)
            erwartung[K_P]['aktuelleVerlinkung'] = neu_verlinkung
            eintraege[2]['aktuelleVerlinkung'] = neu_verlinkung
            _erwarte_zusatz_fehler(lambda: zm.pruefe_zusatzaufgaben(
                _zusa_eingang(dict(gueltige_quittung, ergebnisse=eintraege)), erwartung=erwartung),
                'Landingpage ohne echten amtlichen PDF-Link')
    finally:
        (zusatz / landing_datei).write_text(original_landing, encoding='utf-8')
        neu_meta = dict(verlinkung_p, sha256=zm._sha256(zusatz / landing_datei),
                        bytes=(zusatz / landing_datei).stat().st_size)
        (zusatz / f'{landing_datei}.meta.json').write_text(json.dumps(neu_meta, ensure_ascii=False), encoding='utf-8')
        erwartung[K_P]['aktuelleVerlinkung'] = neu_meta
        eintraege[2]['aktuelleVerlinkung'] = neu_meta
    # Ganzes Quellenpaket vertauscht (Kennungen bleiben, Quellen wandern) sperrt.
    def _tausch(neu):
        neu['ergebnisse'][0]['quelle'], neu['ergebnisse'][1]['quelle'] = \
            neu['ergebnisse'][1]['quelle'], neu['ergebnisse'][0]['quelle']
    _erwarte_zusatz_fehler(lambda: _mit(_tausch), 'vertauschtes Quellenpaket')
    # Das gueltige synthetische 3er-Paket wird akzeptiert.
    assert len(zm.pruefe_zusatzaufgaben(_zusa_eingang(gueltige_quittung), erwartung=erwartung)) == 3

print('PASS: Zusatzaufgabenquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender Achse/Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei)'
      '/Rollenguellen-Drift/Fremdperson sperren fail closed; Breher nur die aktuelle seit-Rolle im geschlossenen '
      'Biografieblock vor der Redaktionsnotiz (Themen-/Hinweisdrift), Krichbaum nur die aktuelle AA-Seitenkopf-H1 '
      '(keine Sprecherrolle, Amts-/Themendrift), Kippels nur das fixierte PDF-Urteil (Stand/Seite/Abteilungen/'
      'Themen, keine Schenderlein-Abteilung, Landingpage muss das amtliche PDF verlinken); das gueltige '
      'synthetische 3er-Paket (Fixture ohne /private/tmp) wird akzeptiert.')


# ── 13 · BMWSB-Aufgabenquittung der 2 personengebundenen Unterbereichsachsen ──────────────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das fixierte
# PDF-Fachurteil (Unterbereiche/Stand/Seite) wird ueber den injizierbaren
# ``erwartung``-Parameter ersetzt; so bleibt der Test auch ohne die lokalen
# Originale lauffaehig. Das Modul verwendet die sicheren Helfer des
# Zusatzaufgabenmoduls wieder (kein duplizierter 600-Zeilen-Block).
bm_spec = importlib.util.spec_from_file_location(
    'bmwsb', Path(__file__).with_name('profil-feldbelege-500-bmwsb.py'))
bm = importlib.util.module_from_spec(bm_spec)
bm_spec.loader.exec_module(bm)


def _erwarte_bmwsb_fehler(fn, was, meldung=None):
    try:
        fn()
    except bm.BmwsbFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF = '2026-09-27T19:30:00+00:00'

    def _meta(datei, url, meta_name=None):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=bm.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / (meta_name or f'{datei}.meta.json')).write_text(
            json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    K_A = 'bundestag-test-bartol-1'
    K_P = 'bundestag-test-poschmann-2'
    person_a, person_p = 'Person Bartol', 'Person Poschmann'

    pdf_datei, landing_datei = 'test-organigramm-v10.pdf', 'test-landing.html'
    (zusatz / pdf_datei).write_bytes(b'%PDF-1.4 synthetisches BMWSB-Testfixture\n')
    pdf_url = 'https://www.bmwsb.bund.de/SharedDocs/downloads/DE/test/organigramm_deutsch.pdf?__blob=publicationFile&v=10'
    quelle_pdf = _meta(pdf_datei, pdf_url)
    landing_url = 'https://www.bmwsb.bund.de/DE/ministerium/das-bmwsb/abteilungen-aufgaben/abteilungen-und-aufgaben.html?nn=42910'
    anker = (f'<a href="https://www.bmwsb.bund.de/SharedDocs/downloads/DE/test/'
             f'organigramm_deutsch.pdf?__blob=publicationFile&amp;v=10">Organigramm (PDF)</a>')
    (zusatz / landing_datei).write_text(f'<p>Organigramm</p>{anker}', encoding='utf-8')
    verlinkung = _meta(landing_datei, landing_url)

    unter_a = {'Z I 3': 'Haushalt, BfdH', 'W II': 'Wohneigentum, Mietrecht'}
    unter_p = {'Z II': 'Grundsatzangelegenheiten', 'W I': 'Wohngeld, Stadtentwicklungsprogramme'}
    bindung_a = ('Parlamentarischer Staatssekretär im Bundesministerium für Testwohnen; '
                 'Geschäftsbereiche Z I 3, W II')
    bindung_p = ('Parlamentarische Staatssekretärin im Bundesministerium für Testwohnen; '
                 'Geschäftsbereich Z II, W I')
    personblock_a = ['Parlamentarischer Staatssekretär', 'Geschäftsbereiche Z I 3, W II', person_a]
    personblock_p = ['Parlamentarische Staatssekretärin', 'Geschäftsbereich Z II, W I', person_p]
    erwartung = {
        K_A: dict(bindungsart='unterabteilungszustaendigkeit', region='Bund', person=person_a,
                  aufgabenbindung=bindung_a, stand='1. Juli 2026', seite=1, personblock=personblock_a,
                  unterabteilungen=unter_a, themen=['Haushalt', 'Wohneigentum', 'Mietrecht'],
                  quelle=quelle_pdf, aktuelleVerlinkung=verlinkung),
        K_P: dict(bindungsart='unterabteilungszustaendigkeit', region='Bund', person=person_p,
                  aufgabenbindung=bindung_p, stand='1. Juli 2026', seite=1, personblock=personblock_p,
                  unterabteilungen=unter_p, themen=['Wohngeld', 'Stadtentwicklungsprogramme'],
                  quelle=quelle_pdf, aktuelleVerlinkung=verlinkung),
    }
    rollen_ref = {
        K_A: dict(url='https://www.bundestag.de/abgeordnete/biografien/T/test-bartol-1',
                  sha256='a' * 64, abgerufenAm=ABRUF),
        K_P: dict(url='https://www.bundestag.de/abgeordnete/biografien/T/test-poschmann-2',
                  sha256='b' * 64, abgerufenAm=ABRUF),
    }
    kennung_zu_abruf = {}
    for kennung, person in ((K_A, person_a), (K_P, person_p)):
        (detail / f'{kennung}.html').write_text(f'<h1>{person}</h1>', encoding='utf-8')
        sha = bm.ZU._sha256(detail / f'{kennung}.html')
        rollen_ref[kennung]['sha256'] = sha
        kennung_zu_abruf[kennung] = dict(url=rollen_ref[kennung]['url'], sha256=sha,
                                         abgerufenAm=ABRUF, datei=f'{kennung}.html',
                                         amtlicheKennung=kennung, parlament='bundestag')
    profilrollen = {k: dict(status='belegt', quelle=dict(rollen_ref[k]),
                            funktionen=[dict(wortlaut='Parlamentarischer Staatssekretär Test')])
                    for k in erwartung}
    eintraege = [
        dict(kennung=K_A, region='Bund', parlament='bundestag', status='belegt',
             bindungsart='unterabteilungszustaendigkeit', person=person_a, aufgabenbindung=bindung_a,
             stand='1. Juli 2026', seite=1, personblock=list(personblock_a), unterabteilungen=dict(unter_a),
             themen=list(erwartung[K_A]['themen']), rollenquelle=dict(rollen_ref[K_A]), quelle=dict(quelle_pdf),
             aktuelleVerlinkung=dict(verlinkung),
             ableitungsHinweis=bm.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=bindung_a), importfreigegeben=False),
        dict(kennung=K_P, region='Bund', parlament='bundestag', status='belegt',
             bindungsart='unterabteilungszustaendigkeit', person=person_p, aufgabenbindung=bindung_p,
             stand='1. Juli 2026', seite=1, personblock=list(personblock_p), unterabteilungen=dict(unter_p),
             themen=list(erwartung[K_P]['themen']), rollenquelle=dict(rollen_ref[K_P]), quelle=dict(quelle_pdf),
             aktuelleVerlinkung=dict(verlinkung),
             ableitungsHinweis=bm.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=bindung_p), importfreigegeben=False),
    ]
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=2, Bund=2, Berlin=0, Brandenburg=0), ergebnisse=eintraege)

    def _bm_eingang(quittung, ressort=None, aufgaben=None, beratende=None, zusatz_kennungen=None):
        return SimpleNamespace(verzeichnis=root, detailseiten=detail, bmwsb=quittung,
                               profilrollen_by_kennung=profilrollen, kennung_zu_abruf=kennung_zu_abruf,
                               ressortachsen_by_kennung={k: {} for k in (ressort or [])},
                               aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])},
                               beratendeachsen_by_kennung={k: {} for k in (beratende or [])},
                               zusaetzlicheaufgaben_by_kennung={k: {} for k in (zusatz_kennungen or [])})

    index = bm.pruefe_bmwsb(_bm_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 2
    assert sum(len(v['themen']) for v in index.values()) == 5
    assert index[K_A]['aufgabenbindung'] == bindung_a
    assert index[K_A]['aktuelleVerlinkung'] == verlinkung

    def _mit(mutation, erwartung_override=None):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return bm.pruefe_bmwsb(_bm_eingang(neu), erwartung=erwartung_override or erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat, unbekannte Kennung.
    _echter_pfad = bm.BMWSB
    bm.BMWSB = root / 'fehlt.json'
    try:
        _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        bm.BMWSB = _echter_pfad
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 1)), 'falsche Bilanz')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][1].__setitem__(
        'kennung', q['ergebnisse'][0]['kennung'])), 'doppelte Kennung')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-test-fremd-9')), 'unbekannte/Fremdkennung')
    # Disjunktion zu den 19/6/2/3-Achsen.
    _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
        _bm_eingang(gueltige_quittung, ressort=[K_A]), erwartung=erwartung), 'Kennung bereits Ressortachse')
    _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
        _bm_eingang(gueltige_quittung, aufgaben=[K_P]), erwartung=erwartung), 'Kennung bereits Aufgabenachse')
    _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
        _bm_eingang(gueltige_quittung, beratende=[K_A]), erwartung=erwartung), 'Kennung bereits beratende Achse')
    _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
        _bm_eingang(gueltige_quittung, zusatz_kennungen=[K_P]), erwartung=erwartung),
        'Kennung bereits Zusatzaufgabenachse')
    # Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei) und Metadatum-Drift.
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Quell-URL-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'finalUrl', 'https://www.bmwsb.bund.de/x')), 'finalUrl-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('sha256', '0' * 64)),
                          'Quellhash-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('bytes', 1)),
                          'Quell-Bytezahl-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('datei', 'fehlt.pdf')),
                          'fehlende Zusatzquelle')
    # Rollenquellen-Drift, kanonischer Personenname, falsche H1, Rolle nicht belegt.
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__(
        'sha256', 'c' * 64)), 'Rollenquellen-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremdperson')),
                          'Fremdperson')
    original_h1 = (detail / f'{K_A}.html').read_text(encoding='utf-8')
    hashbindungen = [kennung_zu_abruf[K_A], rollen_ref[K_A],
                    profilrollen[K_A]['quelle'], eintraege[0]['rollenquelle']]
    original_hashes = [bindung['sha256'] for bindung in hashbindungen]
    try:
        (detail / f'{K_A}.html').write_text('<h1>Fremde Person</h1>', encoding='utf-8')
        # Konsistente Quellenhashes: der Personenabgleich selbst muss sperren.
        for bindung in hashbindungen:
            bindung['sha256'] = bm.ZU._sha256(detail / f'{K_A}.html')
        _erwarte_bmwsb_fehler(lambda: _mit(lambda q: None), 'falsche H1 bei konsistenten Hashes',
                              'Person passt nicht zur kanonischen Kennung')
    finally:
        (detail / f'{K_A}.html').write_text(original_h1, encoding='utf-8')
        for bindung, original_hash in zip(hashbindungen, original_hashes):
            bindung['sha256'] = original_hash
    profilrollen_offen = json.loads(json.dumps(profilrollen))
    profilrollen_offen[K_A]['status'] = 'offen'

    def _bm_eingang_offen(quittung):
        e = _bm_eingang(quittung)
        e.profilrollen_by_kennung = profilrollen_offen
        return e

    _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(_bm_eingang_offen(gueltige_quittung), erwartung=erwartung),
                          '54er-Rolle nicht belegt')
    # Fixiertes PDF-Fachurteil: Stand/Seite/Personenkasten/Unterbereiche/Themen/Hinweis.
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('stand', '01. Januar 2026')),
                          'PDF-Stand-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('seite', 2)), 'PDF-Seiten-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['personblock'].__setitem__(
        0, 'Fremdrolle')), 'Personenkasten-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['unterabteilungen'].__setitem__(
        'W II', 'fremder Titel')), 'Unterbereich-Titel-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', q['ergebnisse'][0]['themen'] + ['Fremdthema'])), 'Themen-Drift')
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'ableitungsHinweis', 'Aufgabenbindung Bund (amtlich abgeleitet): irgendwas')), 'Hinweisdrift')
    # Hochstufung auf ganze Abteilungen sperrt fail closed.
    _erwarte_bmwsb_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'unterabteilungen', {'Z': 'Haushalt', 'W': 'Wohnen'})), 'Hochstufung auf ganze Abteilungen')
    erwartung_grob = json.loads(json.dumps(erwartung))
    erwartung_grob[K_A]['unterabteilungen'] = {'Z': 'Haushalt, BfdH'}
    erwartung_grob[K_A]['personblock'] = ['Parlamentarischer Staatssekretär', 'Geschäftsbereiche Z', person_a]
    erwartung_grob[K_A]['aufgabenbindung'] = ('Parlamentarischer Staatssekretär im Bundesministerium für Testwohnen; '
                                              'Geschäftsbereiche Z')
    _erwarte_bmwsb_fehler(lambda: _mit(
        lambda q: (q['ergebnisse'][0].__setitem__('unterabteilungen', {'Z': 'Haushalt, BfdH'}),
                   q['ergebnisse'][0].__setitem__('personblock',
                                                  ['Parlamentarischer Staatssekretär', 'Geschäftsbereiche Z', person_a]),
                   q['ergebnisse'][0].__setitem__(
                       'aufgabenbindung',
                       'Parlamentarischer Staatssekretär im Bundesministerium für Testwohnen; Geschäftsbereiche Z'),
                   q['ergebnisse'][0].__setitem__(
                       'ableitungsHinweis',
                       bm.ZU.HINWEIS_AUFGABE.format(
                           region='Bund',
                           wert='Parlamentarischer Staatssekretär im Bundesministerium für Testwohnen; Geschäftsbereiche Z'))),
        erwartung_override=erwartung_grob), 'blosse Abteilung im Unterbereichsschluessel')
    # Thema muss im Titel des Unterbereichs stehen (Titel-Bindung).
    erwartung_titel = json.loads(json.dumps(erwartung))
    erwartung_titel[K_A]['themen'] = erwartung_titel[K_A]['themen'] + ['Fremdthema']
    _erwarte_bmwsb_fehler(lambda: _mit(
        lambda q: q['ergebnisse'][0].__setitem__('themen', erwartung_titel[K_A]['themen']),
        erwartung_override=erwartung_titel), 'Thema nicht im Unterbereichstitel')
    # Falscher/versteckter PDF-Link: nur Kommentar-/Skript-/Vorlagenanker, nur EN oder v6.
    original_landing = (zusatz / landing_datei).read_text(encoding='utf-8')
    try:
        falsche_links = [
            f'<!-- {anker} -->',
            *[f'<{tag}>{anker}</{tag}>' for tag in ('script', 'template', 'noscript')],
            anker.replace('.pdf?', '_EN.pdf?'),
            anker.replace('v=10', 'v=6'),
            pdf_url,  # nur Textvorkommen, kein echter href
        ]
        for html in falsche_links:
            (zusatz / landing_datei).write_text(html, encoding='utf-8')
            neu = _meta(landing_datei, landing_url)
            erwartung[K_A]['aktuelleVerlinkung'] = neu
            erwartung[K_P]['aktuelleVerlinkung'] = neu
            eintraege[0]['aktuelleVerlinkung'] = neu
            eintraege[1]['aktuelleVerlinkung'] = neu
            _erwarte_bmwsb_fehler(lambda: bm.pruefe_bmwsb(
                _bm_eingang(dict(gueltige_quittung, ergebnisse=eintraege)), erwartung=erwartung),
                'Landingpage ohne echten kanonischen v10-PDF-Link')
    finally:
        (zusatz / landing_datei).write_text(original_landing, encoding='utf-8')
        neu_verlinkung = _meta(landing_datei, landing_url)
        erwartung[K_A]['aktuelleVerlinkung'] = neu_verlinkung
        erwartung[K_P]['aktuelleVerlinkung'] = neu_verlinkung
        eintraege[0]['aktuelleVerlinkung'] = neu_verlinkung
        eintraege[1]['aktuelleVerlinkung'] = neu_verlinkung
    # Vertauschte Personennamen sperren.
    def _tausch(neu):
        neu['ergebnisse'][0]['person'], neu['ergebnisse'][1]['person'] = \
            neu['ergebnisse'][1]['person'], neu['ergebnisse'][0]['person']
    _erwarte_bmwsb_fehler(lambda: _mit(_tausch), 'vertauschtes Personenpaket')
    # Vollstaendige Aufgabenpakete tauschen, kanonische Personen und Rollenquellen
    # behalten. Auch die Namen im Personenkasten passen: Aufgabenbindung muss sperren.
    def _aufgaben_tausch(neu):
        a, p = neu['ergebnisse']
        for feld in ('aufgabenbindung', 'personblock', 'unterabteilungen', 'themen', 'ableitungsHinweis'):
            a[feld], p[feld] = p[feld], a[feld]
        a['personblock'] = [person_a if zeile == person_p else zeile for zeile in a['personblock']]
        p['personblock'] = [person_p if zeile == person_a else zeile for zeile in p['personblock']]
    _erwarte_bmwsb_fehler(lambda: _mit(_aufgaben_tausch), 'vertauschte Aufgaben bei richtigen Personen',
                          'weicht vom fixierten PDF-Urteil ab')
    # Das gueltige synthetische 2er-Paket wird akzeptiert.
    assert len(bm.pruefe_bmwsb(_bm_eingang(gueltige_quittung), erwartung=erwartung)) == 2

print('PASS: BMWSB-Aufgabenquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender/Zusatzaufgabenachse/Quelldrift (URL/finalUrl/Hash/'
      'Bytezahl/Abrufzeit/Datei)/Rollenguellen-Drift/Fremdperson/falsche H1/nicht belegte 54er-Rolle '
      'sperren fail closed; nur das fixierte PDF-Urteil (Stand/Seite/Personenkasten/Unterbereichstitel/'
      'Themen/Hinweis), keine Hochstufung auf ganze Abteilungen, Themen nur in den Unterbereichstiteln und '
      'die Landingpage muss den echten kanonischen v10-PDF-Link tragen (kein Kommentar-/Skript-/'
      'Vorlagenanker, kein EN/v6-Fremdlink und kein blosses Textvorkommen); ein vertauschtes Personenpaket '
      'wird gesperrt; das gueltige synthetische 2er-Paket (Fixture ohne /private/tmp) wird akzeptiert.')


# ── 14 · Amthor-Einzelfallquittung (ein zuvor offener Rollenfall) ──────────────────────────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das eng fixierte
# Fachurteil wird ueber den injizierbaren ``erwartung``-Parameter ersetzt; so bleibt der
# Test auch ohne die lokalen Originale lauffaehig. Das Modul verwendet die sicheren Helfer
# des Zusatzaufgabenmoduls wieder und bindet die zuvor offene 54er-Rolle SEPARAT neu (kein
# belegt-Pflichtvalidator, keine Lockerung der anderen Eintraege).
am_spec = importlib.util.spec_from_file_location(
    'amthor', Path(__file__).with_name('profil-feldbelege-500-amthor.py'))
am = importlib.util.module_from_spec(am_spec)
am_spec.loader.exec_module(am)


def _erwarte_am_fehler(fn, was, meldung=None):
    try:
        fn()
    except am.AmthorFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF = '2026-09-27T20:00:00+00:00'
    K = 'bundestag-test-amthor-1'
    person = 'Person Amthor'
    funktion = 'Staatsminister für Testkanzler-Zusammenarbeit beim Bundeskanzler'
    vor_strong, vor_text = '2025 bis 2026', 'Parlamentarischer Staatssekretär beim Bundesminister für Testdigitales'
    vorherige = f'{vor_strong} {vor_text}'
    rolle_strong = 'Seit 29. Juli 2026'
    rolle_zitat = f'{rolle_strong} {funktion}'
    aufgaben_h2 = 'Das sagte der Kanzler zu den neuen Personalien:'
    aufgaben_starke = 'Staatsminister für die Testkanzler-Beziehungen'
    aufgabenzitat = 'die Zusammenarbeit zwischen der Testregierung und den 16 Testlaendern koordinieren.'
    aufgabenbindung = (f'{funktion}; Koordination der Zusammenarbeit zwischen der Testregierung '
                       f'und den 16 Testlaendern')
    thema = 'Testkanzler-Beziehungen'

    def _meta(datei, url):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=am.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / f'{datei}.meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    rolle_datei = 'test-portrait.html'
    rolle_url = 'https://www.bundesregierung.de/breg-de/test/philipp-amthor-test'
    rolle_block = (f'<div class="bpa-richtext"><p><strong>{vor_strong}</strong><br/>{vor_text}</p>'
                   f'<p><strong>{rolle_strong}</strong><br/>{funktion}</p></div>')

    def _schreibe_rolle(dokument):
        (zusatz / rolle_datei).write_text(f'<h1 class="bpa-accessibility">{person}</h1>' + dokument, encoding='utf-8')
        return _meta(rolle_datei, rolle_url)

    quelle = _schreibe_rolle(
        f'<html><head><meta name="description" content="{rolle_zitat}"/></head><body>'
        f'<figure><figcaption><p>{person} ist {funktion}.</p></figcaption></figure>{rolle_block}</body></html>')
    aufgaben_datei = 'test-kabinett.html'
    aufgaben_url = 'https://www.bundesregierung.de/breg-de/test/kabinett-umbildung'
    aufgaben_liste = (f'<li><strong>Chefin des Testamtes</strong>: Mit Testperson wird das Testamt neu besetzt.</li>'
                      f'<li><strong>{aufgaben_starke}</strong>: {person} wird die {aufgabenzitat} '
                      f'Testdigitales bleibt eine Nebenbemerkung.</li>')

    def _schreibe_aufgaben(html):
        (zusatz / aufgaben_datei).write_text(
            '<div id="rs_reading_area_header"><header class="bpa-article-header">'
            '<ul><li class="bpa-collection-item">Freitag, 24. Juli 2026</li></ul></header></div>'
            '<div id="rs_reading_area_content">' + html + '</div>', encoding='utf-8')
        return _meta(aufgaben_datei, aufgaben_url)

    aufgabenquelle = _schreibe_aufgaben(
        f'<h2>{aufgaben_h2}</h2><ul class="rte--list">{aufgaben_liste}</ul>'
        f'<p>Freitag, 24. Juli 2026</p>')

    (detail / f'{K}.html').write_text(f'<h1>{person}</h1>', encoding='utf-8')
    rollen_ref = dict(url='https://www.bundestag.de/abgeordnete/biografien/T/test-amthor-1',
                      sha256=am.ZU._sha256(detail / f'{K}.html'), abgerufenAm=ABRUF)
    kennung_zu_abruf = {K: dict(url=rollen_ref['url'], sha256=rollen_ref['sha256'], abgerufenAm=ABRUF,
                                datei=f'{K}.html', amtlicheKennung=K, parlament='bundestag')}
    profilrollen = {K: dict(status='offen', funktionen=[], quelle=dict(rollen_ref))}
    erwartung = {
        K: dict(region='Bund', bindungsart='kanzleramt-aufgabe', person=person, funktion=funktion,
                amtsbeginn='29. Juli 2026', rolleZitat=rolle_zitat, vorherigeRolle=vorherige,
                rolleAbschnitt='Testabschnitt', aufgabenH2=aufgaben_h2, aufgabenStarke=aufgaben_starke,
                aufgabenzitat=aufgabenzitat, quellpublikationsdatum='2026-07-24',
                aufgabenbindung=aufgabenbindung, themen=[thema],
                quelle=dict(quelle), aufgabenquelle=dict(aufgabenquelle)),
    }
    eintraege = [dict(kennung=K, region='Bund', parlament='bundestag', status='belegt',
                      bindungsart='kanzleramt-aufgabe', person=person, funktion=funktion,
                      amtsbeginn='29. Juli 2026', rolleZitat=rolle_zitat, vorherigeRolle=vorherige,
                      rolleAbschnitt='Testabschnitt', aufgabenH2=aufgaben_h2, aufgabenStarke=aufgaben_starke,
                      aufgabenzitat=aufgabenzitat, quellpublikationsdatum='2026-07-24',
                      aufgabenbindung=aufgabenbindung, themen=[thema],
                      ableitungsHinweis=am.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung),
                      rollenquelle=dict(rollen_ref), quelle=dict(quelle), aufgabenquelle=dict(aufgabenquelle),
                      importfreigegeben=False)]
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=1, Bund=1, Berlin=0, Brandenburg=0),
                             ergebnisse=eintraege)

    def _am_eingang(quittung, profilrollen_override=None, **mengen):
        return SimpleNamespace(
            verzeichnis=root, detailseiten=detail, amthor=quittung,
            profilrollen_by_kennung=profilrollen_override or profilrollen,
            kennung_zu_abruf=kennung_zu_abruf,
            ressortachsen_by_kennung={k: {} for k in mengen.get('ressort', [])},
            aufgabenachsen_by_kennung={k: {} for k in mengen.get('aufgaben', [])},
            beratendeachsen_by_kennung={k: {} for k in mengen.get('beratende', [])},
            zusaetzlicheaufgaben_by_kennung={k: {} for k in mengen.get('zusatz', [])},
            bmwsb_by_kennung={k: {} for k in mengen.get('bmwsb', [])})

    index = am.pruefe_amthor(_am_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 1
    assert index[K]['themen'] == [thema]
    assert index[K]['funktion'] == funktion
    assert index[K]['aufgabenbindung'] == aufgabenbindung

    def _mit(mutation, erwartung_override=None, **mengen):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return am.pruefe_amthor(_am_eingang(neu, **mengen), erwartung=erwartung_override or erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat, unbekannte Kennung, Disjunktion.
    _echter_pfad = am.AMTHOR
    am.AMTHOR = root / 'fehlt.json'
    try:
        _erwarte_am_fehler(lambda: am.pruefe_amthor(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        am.AMTHOR = _echter_pfad
    _erwarte_am_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 0)), 'falsche Bilanz')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'].append(dict(q['ergebnisse'][0]))),
                       'doppelte Kennung')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-test-fremd-9')), 'unbekannte/Fremdkennung')
    for feld, was in (('ressort', 'Kennung bereits eine Ressortachse'),
                      ('aufgaben', 'Kennung bereits eine Aufgabenachse'),
                      ('beratende', 'Kennung bereits eine beratende Achse'),
                      ('zusatz', 'Kennung bereits eine Zusatzaufgabenachse'),
                      ('bmwsb', 'Kennung bereits eine BMWSB-Achse')):
        _erwarte_am_fehler(lambda feld=feld: am.pruefe_amthor(
            _am_eingang(gueltige_quittung, **{feld: [K]}), erwartung=erwartung), was)
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('importfreigegeben', True)),
                       'importfreigegeben true')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('status', 'offen')),
                       'unerwarteter Status')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('bindungsart', 'amtshinweis')),
                       'Bindungsart-Drift')
    # Der alte belegt-Pflichtvalidator darf Amthor NICHT uebernehmen: die 54er Rolle
    # muss historisch offen bleiben.
    profilrollen_belegt = json.loads(json.dumps(profilrollen))
    profilrollen_belegt[K]['status'] = 'belegt'
    _erwarte_am_fehler(lambda: am.pruefe_amthor(
        _am_eingang(gueltige_quittung, profilrollen_override=profilrollen_belegt), erwartung=erwartung),
        '54er-Rolle nicht mehr offen')
    # Fixiertes Urteil: Person/Rolle/Amtsbeginn/Thema/Hinweis/Aufgabenbindung.
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremdperson')),
                       'Fremdperson')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('funktion', 'Anderes Amt')),
                       'Rollenwortlaut-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('amtsbeginn', '1. Januar 2026')),
                       'Amtsbeginn-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('rolleZitat', 'Seit 2024 Amt')),
                       'Rollenzitat-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', [thema, 'Digitalisierung'])), 'Themen-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', ['Digitalisierung'])), 'fremdes Digitalthema')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'ableitungsHinweis', 'Aufgabenbindung Bund (amtlich abgeleitet): irgendwas')), 'Hinweisdrift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'aufgabenbindung', 'anderes')), 'Aufgabenbindungs-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'quellpublikationsdatum', '2026-09-27')), 'Publikationsdatums-Drift')
    # Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei) beider Zusatzquellen.
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Quell-URL-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'finalUrl', 'https://www.bundesregierung.de/x')), 'finalUrl-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('sha256', '0' * 64)),
                       'Quellhash-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('bytes', 1)),
                       'Quell-Bytezahl-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'datei', 'fehlt.html')), 'fehlende Zusatzquelle')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('http', 500)),
                       'HTTP-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['aufgabenquelle'].__setitem__(
        'sha256', '1' * 64)), 'Aufgabenquellen-Hash-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['aufgabenquelle'].__setitem__(
        'bytes', 2)), 'Aufgabenquellen-Bytezahl-Drift')
    _erwarte_am_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__(
        'sha256', 'c' * 64)), 'Rollenquellen-Drift')
    # Metadatum-Abweichung der Zusatzquelle.
    original_meta = json.loads((zusatz / f'{rolle_datei}.meta.json').read_text(encoding='utf-8'))
    meta_kaputt = dict(original_meta)
    meta_kaputt['url'] = rolle_url + '-meta-fremd'
    (zusatz / f'{rolle_datei}.meta.json').write_text(json.dumps(meta_kaputt, ensure_ascii=False), encoding='utf-8')
    _erwarte_am_fehler(lambda: _mit(lambda q: None), 'Metadatenabweichung', 'Metadatum url weicht ab')
    (zusatz / f'{rolle_datei}.meta.json').write_text(json.dumps(original_meta, ensure_ascii=False), encoding='utf-8')
    # Quellenpakete vertauscht.
    def _tausch(neu):
        neu['ergebnisse'][0]['quelle'], neu['ergebnisse'][0]['aufgabenquelle'] = \
            neu['ergebnisse'][0]['aufgabenquelle'], neu['ergebnisse'][0]['quelle']
    _erwarte_am_fehler(lambda: _mit(_tausch), 'vertauschte Quellenpakete', 'Quellenmetadaten weichen')
    # Zukunftsbeginn: der fixierte Amtsbeginn liegt nach der Abrufzeit.
    erwartung_zukunft = json.loads(json.dumps(erwartung))
    erwartung_zukunft[K]['amtsbeginn'] = '1. Dezember 2026'
    _erwarte_am_fehler(lambda: _mit(
        lambda q: q['ergebnisse'][0].__setitem__('amtsbeginn', '1. Dezember 2026'),
        erwartung_override=erwartung_zukunft), 'Zukunftsbeginn', 'liegt in der Zukunft')

    # Falsche Person trotz konsistenter Hashes sperrt der Personenabgleich selbst.
    original_detail = (detail / f'{K}.html').read_text(encoding='utf-8')
    bindungen = [kennung_zu_abruf[K], rollen_ref, profilrollen[K]['quelle'], eintraege[0]['rollenquelle']]
    original_hashes = [b['sha256'] for b in bindungen]
    try:
        (detail / f'{K}.html').write_text('<h1>Fremde Person</h1>', encoding='utf-8')
        for b in bindungen:
            b['sha256'] = am.ZU._sha256(detail / f'{K}.html')
        _erwarte_am_fehler(lambda: _mit(lambda q: None), 'falsche Person bei konsistenten Hashes',
                           'Person passt nicht zur kanonischen Kennung')
    finally:
        (detail / f'{K}.html').write_text(original_detail, encoding='utf-8')
        for b, h in zip(bindungen, original_hashes):
            b['sha256'] = h
    # Rolle nur in Metadaten/Bildunterschrift (kein echter geschlossener Lebenslauf-p).
    original_rolle = (zusatz / rolle_datei).read_text(encoding='utf-8')
    try:
        neu_quelle = _schreibe_rolle(
            f'<html><head><meta name="description" content="{rolle_zitat}"/></head><body>'
            f'<figure><figcaption><p>{person} ist {funktion}.</p></figcaption></figure>'
            f'<div class="bpa-richtext"><p>Amtliche Angaben ohne Rollenabsatz.</p></div></body></html>')
        erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
        _erwarte_am_fehler(lambda: _mit(lambda q: None), 'Rolle nur Metadaten/Bildunterschrift',
                           'genau einem geschlossenen div.bpa-richtext')
    finally:
        (zusatz / rolle_datei).write_text(original_rolle, encoding='utf-8')
        neu_quelle = _meta(rolle_datei, rolle_url)
        erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
    # Historisches PSts-Amt als angebliche aktuelle Rolle.
    erwartung_alt = json.loads(json.dumps(erwartung))
    original_rolle = (zusatz / rolle_datei).read_text(encoding='utf-8')
    try:
        neu_quelle = _schreibe_rolle(
            f'<div class="bpa-richtext"><p><strong>{vor_strong}</strong><br/>{vor_text}</p></div>')
        erwartung_alt[K]['quelle'] = dict(neu_quelle)
        erwartung_alt[K]['rolleZitat'] = vorherige
        _erwarte_am_fehler(lambda: _mit(
            lambda q: (q['ergebnisse'][0].__setitem__('quelle', dict(neu_quelle)),
                       q['ergebnisse'][0].__setitem__('rolleZitat', vorherige)),
            erwartung_override=erwartung_alt), 'historisches PSts-Amt als aktuell',
            "historische 'bis'-Rolle")
    finally:
        (zusatz / rolle_datei).write_text(original_rolle, encoding='utf-8')
        neu_quelle = _meta(rolle_datei, rolle_url)
        erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
    # Fremder li trotz passendem globalem Wortlaut (Wortlaut in einer anderen Liste).
    original_aufgaben = (zusatz / aufgaben_datei).read_text(encoding='utf-8')
    try:
        neu_aufgaben = _schreibe_aufgaben(
            f'<h2>{aufgaben_h2}</h2><ul class="rte--list">'
            f'<li><strong>Anderes Testamt</strong>: {person} ist {aufgaben_starke}.</li></ul>'
            f'<h2>Weitere Personalien:</h2><ul class="rte--list">'
            f'<li><strong>{aufgaben_starke}</strong>: {person} wird die {aufgabenzitat}</li></ul>'
            f'<p>Freitag, 24. Juli 2026</p>')
        erwartung[K]['aufgabenquelle'], eintraege[0]['aufgabenquelle'] = dict(neu_aufgaben), dict(neu_aufgaben)
        _erwarte_am_fehler(lambda: _mit(lambda q: None), 'fremder li trotz passendem globalen Wortlaut',
                           'nicht genau einen li')
    finally:
        (zusatz / aufgaben_datei).write_text(original_aufgaben, encoding='utf-8')
        neu_aufgaben = _meta(aufgaben_datei, aufgaben_url)
        erwartung[K]['aufgabenquelle'], eintraege[0]['aufgabenquelle'] = dict(neu_aufgaben), dict(neu_aufgaben)
    # Scheinbeleg in Kommentar/Skript/Vorlage ist kein Beleg.
    original_rolle = (zusatz / rolle_datei).read_text(encoding='utf-8')
    original_aufgaben = (zusatz / aufgaben_datei).read_text(encoding='utf-8')
    try:
        for schein in (f'<!-- {rolle_block} -->', f'<script>{rolle_block}</script>', f'<template>{rolle_block}</template>'):
            neu_quelle = _schreibe_rolle(f'<html><body>{schein}</body></html>')
            erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
            _erwarte_am_fehler(lambda: _mit(lambda q: None), f'Scheinbeleg Rolle ({schein[:11]})',
                               'genau einem geschlossenen div.bpa-richtext')
        # Rolle wiederherstellen, bevor der Aufgaben-Scheinbeleg geprueft wird.
        (zusatz / rolle_datei).write_text(original_rolle, encoding='utf-8')
        neu_quelle = _meta(rolle_datei, rolle_url)
        erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
        for schein in (f'<!-- {aufgaben_liste} -->', f'<script>{aufgaben_liste}</script>',
                       f'<template><ul class="rte--list">{aufgaben_liste}</ul></template>'):
            neu_aufgaben = _schreibe_aufgaben(f'<h2>{aufgaben_h2}</h2>{schein}<p>Freitag, 24. Juli 2026</p>')
            erwartung[K]['aufgabenquelle'], eintraege[0]['aufgabenquelle'] = dict(neu_aufgaben), dict(neu_aufgaben)
            _erwarte_am_fehler(lambda: _mit(lambda q: None), f'Scheinbeleg Aufgabe ({schein[:11]})',
                               'nicht genau einen li')
    finally:
        (zusatz / rolle_datei).write_text(original_rolle, encoding='utf-8')
        (zusatz / aufgaben_datei).write_text(original_aufgaben, encoding='utf-8')
        neu_quelle = _meta(rolle_datei, rolle_url)
        neu_aufgaben = _meta(aufgaben_datei, aufgaben_url)
        erwartung[K]['quelle'], eintraege[0]['quelle'] = dict(neu_quelle), dict(neu_quelle)
        erwartung[K]['aufgabenquelle'], eintraege[0]['aufgabenquelle'] = dict(neu_aufgaben), dict(neu_aufgaben)
    # Eigenpruefung: Gegenbelege auch mit konsistent neu gebundenen Hashes.
    def _quellgegenprobe(feld, dokument, grund, meldung=None):
        datei = rolle_datei if feld == 'quelle' else aufgaben_datei
        url = rolle_url if feld == 'quelle' else aufgaben_url
        original = (zusatz / datei).read_text(encoding='utf-8')
        try:
            (zusatz / datei).write_text(dokument, encoding='utf-8')
            neu = _meta(datei, url)
            erwartung[K][feld], eintraege[0][feld] = dict(neu), dict(neu)
            _erwarte_am_fehler(lambda: _mit(lambda q: None), grund, meldung)
        finally:
            (zusatz / datei).write_text(original, encoding='utf-8')
            neu = _meta(datei, url)
            erwartung[K][feld], eintraege[0][feld] = dict(neu), dict(neu)

    rolle_original = (zusatz / rolle_datei).read_text(encoding='utf-8')
    _quellgegenprobe('quelle', rolle_original.replace(
        f'<p><strong>{rolle_strong}</strong><br/>{funktion}</p>',
        f'<p>{rolle_strong}</p><p>{funktion}</p>'), 'Datum und Rolle in getrennten Absaetzen')
    _quellgegenprobe('quelle', rolle_original.replace(
        f'<h1 class="bpa-accessibility">{person}</h1>',
        '<h1 class="bpa-accessibility">Fremde Person</h1>'), 'falsche BReg-Person bei konsistenten Hashes')
    aufgaben_original = (zusatz / aufgaben_datei).read_text(encoding='utf-8')
    _quellgegenprobe('aufgabenquelle', aufgaben_original.replace(
        f'<h2>{aufgaben_h2}</h2>', f'<h2>{aufgaben_h2}</h2><h2>Andere Personalie</h2>'),
        'andere H2 vor passender Liste')
    _quellgegenprobe('aufgabenquelle', aufgaben_original.replace(
        f'<h2>{aufgaben_h2}</h2>', f'<h2>{aufgaben_h2}</h2><h2>{aufgaben_h2}</h2>'),
        'doppelte Personalien-H2')
    _quellgegenprobe('aufgabenquelle', aufgaben_original.replace(
        'id="rs_reading_area_content"', 'id="fremder-bereich"'), 'Liste ausserhalb des Artikelinhalts')
    _quellgegenprobe('aufgabenquelle', aufgaben_original.replace(
        '<li class="bpa-collection-item">Freitag, 24. Juli 2026</li>',
        '<li class="bpa-collection-item">Freitag, 25. Juli 2026</li>') +
        '<footer>Freitag, 24. Juli 2026</footer>', 'Datum nur in fremdem Absatz/Fusszeile')
    meta_path = zusatz / f'{rolle_datei}.meta.json'
    original_meta_text = meta_path.read_text(encoding='utf-8')
    try:
        meta = json.loads(original_meta_text)
        del meta['http']
        meta_path.write_text(json.dumps(meta), encoding='utf-8')
        _erwarte_am_fehler(lambda: _mit(lambda q: None), 'fehlender beobachteter HTTP-Status')
    finally:
        meta_path.write_text(original_meta_text, encoding='utf-8')
    # Das gueltige synthetische Paket wird akzeptiert.
    assert len(am.pruefe_amthor(_am_eingang(gueltige_quittung), erwartung=erwartung)) == 1

print('PASS: Amthor-Einzelfallquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender/Zusatzaufgaben-/BMWSB-Achse/importfreigegeben/'
      'Status/Bindungsart/Person/Rolle/Amtsbeginn/Rollenzitat/Themen/Fremdthema/Hinweis/'
      'Aufgabenbindung/Publikationsdatum/Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/'
      'Datei/Metadatum) und vertauschte Quellenpakete/Fremdperson bei konsistenten Hashes/'
      'Zukunftsbeginn/Rolle nur in Metadaten oder Bildunterschrift/historisches PSts-Amt/fremder li/'
      'Scheinbeleg in Kommentar, Skript oder Vorlage sperren fail closed; die 54er Rolle muss '
      'historisch offen bleiben; das gueltige synthetische Paket (Fixture ohne /private/tmp) wird '
      'akzeptiert.')


# ── 15 · Wahlausschuss-Aufgabenquittung (3 sonstige Gremien-Achsen) ────────────────────────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das eng fixierte
# Fachurteil wird ueber den injizierbaren ``erwartung``-Parameter ersetzt; das Modul
# verwendet die sicheren Helfer des Zusatzaufgabenmoduls wieder und bindet die aktuelle
# Wahlausschuss-Mitgliedschaft eigenstaendig aus genau EINEM ProfilePage.mainEntity neu.
wa_spec = importlib.util.spec_from_file_location(
    'wahlausschuss', Path(__file__).with_name('profil-feldbelege-500-wahlausschuss.py'))
wa = importlib.util.module_from_spec(wa_spec)
wa_spec.loader.exec_module(wa)


def _erwarte_wa_fehler(fn, was, meldung=None):
    try:
        fn()
    except wa.WahlausschussFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF = '2026-09-27T20:00:00+00:00'
    THEMA = 'Richter des Test-Verfassungsgerichts'
    GEMEIN = 'Wahlausschuss'
    GURL = 'https://www.bundestag.de/test/weitere_gremien/wahlausschuss'
    BESCHR = 'Mitglied des 21. Deutschen Bundestages'
    AUFBIND = 'Wahlausschuss; Vorschlag der vom Bundestag zu berufenden Testrichter'
    ABSATZ = (f'Die Testrichter des {THEMA.replace("Richter des ", "")} werden zur Hälfte von '
              f'Bundestag und Bundesrat gewählt. Die vom Bundestag zu berufenden {THEMA} werden auf '
              f'Vorschlag des Wahlausschusses gewählt. In der 21. Wahlperiode stellt die Testfraktion '
              f'einen Abgeordneten.')
    assert '21. Wahlperiode' in ABSATZ and THEMA in ABSATZ

    def _wa_meta(datei, url):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=wa.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / f'{datei}.meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    quelle_datei = 'test-wahlausschuss.html'
    quelle_url = 'https://www.bundestag.de/test/weitere_gremien/wahlausschuss'

    def _wa_standard(absatz=ABSATZ, umhuellung=None, ziel=True, zweiter_block=False):
        kern = f'<div><p><span>{absatz}</span></p></div>'
        if umhuellung:
            kern = umhuellung(kern)
        block = f'<div class="col-xs-12 col-sm-6 bt-standard-content">{kern}</div>'
        fremd = ('<div id="anderer-abschnitt" class="col-xs-12 col-sm-6 bt-standard-content">'
                 f'<p>{absatz}</p></div>')
        if ziel:
            panel = f'<div role="tabpanel" class="tab-pane active" id="arbeit-und-aufgaben"><div class="row">{block}</div></div>'
        else:
            panel = ('<div role="tabpanel" class="tab-pane" id="anderer-abschnitt">'
                     f'<div class="col-xs-12 col-sm-6 bt-standard-content"><p>Anderer Absatz.</p></div></div>')
        if zweiter_block:
            panel += fremd
        return f'<div class="tab-content">{panel}</div>'

    def _wa_quelle(dokument):
        (zusatz / quelle_datei).write_text(dokument, encoding='utf-8')
        return _wa_meta(quelle_datei, quelle_url)

    quelle = _wa_quelle(_wa_standard())
    gegen_datei = 'test-glossar.html'
    gegen_url = 'https://www.bundestag.de/test/services/glossar/wahlausschuss'
    (zusatz / gegen_datei).write_text('<p>Der Wahlausschuss schlägt die Testrichter vor.</p>', encoding='utf-8')
    gegen = _wa_meta(gegen_datei, gegen_url)

    KENNUNGEN = [
        ('bundestag-test-wahl-1', 'Person Eins', 'Ordentliches Mitglied', 'offen'),
        ('bundestag-test-wahl-2', 'Person Zwei', 'Ordentliches Mitglied', 'belegt'),
        ('bundestag-test-wahl-3', 'Person Drei', 'Stellvertretendes Mitglied', 'offen'),
    ]
    profilrollen = {}
    kennung_zu_abruf = {}
    personen_erwartung = {}

    def _wa_person(kennung, person, role, enddate=False, wp=BESCHR, desc_url=False):
        rolle = dict(type='Role', org_name=GEMEIN, org_url=GURL, role=role, start='2025-03-25')
        if enddate:
            rolle['end'] = '2026-01-01'
        person_json = {
            '@type': 'Person', '@id': '#mdb', 'name': person,
            'description': wp,
            'memberOf': [
                {'@type': 'Role',
                 'memberOf': {'@type': 'Organization', 'name': 'Deutscher Bundestag',
                              'url': 'https://www.bundestag.de'},
                 'roleName': 'Mitglied des Bundestages', 'startDate': '2025-03-25'},
                {'@type': 'Role',
                 'memberOf': {'@type': 'Organization', 'name': rolle['org_name'], 'url': rolle['org_url']},
                 'roleName': rolle['role'], 'startDate': rolle['start']},
            ],
        }
        if rolle.get('end'):
            person_json['memberOf'][1]['endDate'] = rolle['end']
        if desc_url:
            person_json['url'] = 'https://www.bundestag.de/fremde-url'
        seite = {'@context': 'https://schema.org', '@type': 'ProfilePage', 'mainEntity': person_json}
        return ('<h1>' + person + '</h1>'
                '<script type="application/ld+json">' + json.dumps(seite, ensure_ascii=False) + '</script>')

    def _wa_schreibe_detail(kennung, dokument):
        (detail / f'{kennung}.html').write_text(dokument, encoding='utf-8')

    for kennung, person, role, status in KENNUNGEN:
        _wa_schreibe_detail(kennung, _wa_person(kennung, person, role))
        pfad = detail / f'{kennung}.html'
        rollen_ref = dict(url=f'https://www.bundestag.de/test/abgeordnete/{kennung}',
                          sha256=wa.ZU._sha256(pfad), abgerufenAm=ABRUF)
        profilrollen[kennung] = dict(status=status, funktionen=[], quelle=dict(rollen_ref))
        kennung_zu_abruf[kennung] = dict(url=rollen_ref['url'], sha256=rollen_ref['sha256'], abgerufenAm=ABRUF,
                                        datei=f'{kennung}.html', bytes=pfad.stat().st_size,
                                        amtlicheKennung=kennung, parlament='bundestag',
                                        abrufStatus='abgerufen', http=200)
        personen_erwartung[kennung] = dict(region='Bund', person=person, roleName=role,
                                           startDate='2025-03-25', rollenquelle=dict(rollen_ref))

    erwartung = dict(themen=[THEMA], aufgabenbindung=AUFBIND, aufgabenAbsatz=ABSATZ,
                     beschreibung=BESCHR, gremium=GEMEIN, gremienUrl=GURL,
                     quelle=dict(quelle), gegenquelle=dict(gegen), personen=personen_erwartung)
    eintraege = []
    for kennung, person, role, _ in KENNUNGEN:
        eintraege.append(dict(kennung=kennung, region='Bund', parlament='bundestag', status='belegt',
                              person=person, gremium=GEMEIN, gremienUrl=GURL, roleName=role,
                              startDate='2025-03-25', rollenquelle=dict(personen_erwartung[kennung]['rollenquelle']),
                              importfreigegeben=False))
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=3, Bund=3, Berlin=0, Brandenburg=0),
                             themen=[THEMA], aufgabenbindung=AUFBIND, aufgabenAbsatz=ABSATZ,
                             beschreibung=BESCHR, gremium=GEMEIN, gremienUrl=GURL,
                             quelle=dict(quelle), gegenquelle=dict(gegen),
                             ergebnisse=eintraege, importfreigegeben=False)

    def _wa_eingang(quittung, profilrollen_override=None, **mengen):
        return SimpleNamespace(
            verzeichnis=root, detailseiten=detail, wahlausschuss=quittung,
            profilrollen_by_kennung=profilrollen_override or profilrollen,
            kennung_zu_abruf=kennung_zu_abruf,
            ressortachsen_by_kennung={k: {} for k in mengen.get('ressort', [])},
            aufgabenachsen_by_kennung={k: {} for k in mengen.get('aufgaben', [])},
            beratendeachsen_by_kennung={k: {} for k in mengen.get('beratende', [])},
            zusaetzlicheaufgaben_by_kennung={k: {} for k in mengen.get('zusatz', [])},
            bmwsb_by_kennung={k: {} for k in mengen.get('bmwsb', [])},
            amthor_by_kennung={k: {} for k in mengen.get('amthor', [])})

    index = wa.pruefe_wahlausschuss(_wa_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 3
    assert index['bundestag-test-wahl-1']['themen'] == [THEMA]
    assert index['bundestag-test-wahl-3']['roleName'] == 'Stellvertretendes Mitglied'
    assert index['bundestag-test-wahl-2']['ableitungsHinweis'].startswith('Aufgabenbindung Bund')

    def _wa_mit(mutation, erwartung_override=None, **mengen):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return wa.pruefe_wahlausschuss(_wa_eingang(neu, **mengen), erwartung=erwartung_override or erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat, Fremdkennung, Disjunktion.
    _echter_pfad = wa.WAHLAUSSCHUSS
    wa.WAHLAUSSCHUSS = root / 'fehlt.json'
    try:
        _erwarte_wa_fehler(lambda: wa.pruefe_wahlausschuss(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        wa.WAHLAUSSCHUSS = _echter_pfad
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['bilanz'].__setitem__('Bund', 0)), 'falsche Bilanz')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'].append(dict(q['ergebnisse'][0]))),
                       'doppelte Kennung')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'kennung', 'bundestag-test-fremd-9')), 'Fremdkennung')
    for feld, was in (('ressort', 'Kennung bereits eine Ressortachse'),
                      ('aufgaben', 'Kennung bereits eine Aufgabenachse'),
                      ('beratende', 'Kennung bereits eine beratende Achse'),
                      ('zusatz', 'Kennung bereits eine Zusatzaufgabenachse'),
                      ('bmwsb', 'Kennung bereits eine BMWSB-Achse'),
                      ('amthor', 'Kennung bereits eine Amthor-Einzelfallachse')):
        _erwarte_wa_fehler(lambda feld=feld: wa.pruefe_wahlausschuss(
            _wa_eingang(gueltige_quittung, **{feld: ['bundestag-test-wahl-1']}), erwartung=erwartung), was)
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('importfreigegeben', True)),
                       'importfreigegeben true')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('status', 'offen')),
                       'unerwarteter Status')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('region', 'Berlin')),
                       'Region-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('parlament', 'landtag-berlin')),
                       'Parlament-Drift')
    # Fixiertes Urteil: Person, Gremium, Gremien-URL, roleName, startDate, Thema, Hinweis.
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremdperson')),
                       'Fremdperson')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('gremium', 'Anderes Gremium')),
                       'fremdes Gremium')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'gremienUrl', 'https://www.bundestag.de/fremd')), 'fremde Gremien-URL')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__(
        'roleName', 'Stellvertretendes Mitglied')), 'falscher roleName')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['ergebnisse'][0].__setitem__('startDate', '2025-03-26')),
                       'startDate-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q.__setitem__('themen', [THEMA, 'Digitalisierung'])),
                       'Themen-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q.__setitem__('themen', ['Digitalisierung'])),
                       'fremdes Thema')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q.__setitem__('aufgabenbindung', 'anderes')),
                       'Aufgabenbindungs-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q.__setitem__('aufgabenAbsatz', 'Anderer Absatz.')),
                       'Aufgabenabsatz-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q.__setitem__('beschreibung', 'Mitglied des 20. Deutschen Bundestages')),
                       'wrongWP-Drift')
    # Quelldrift der Aufgabenquelle (URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/Datei).
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__('url', quelle_url + '-fremd')),
                       'Quell-URL-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__(
        'finalUrl', 'https://www.bundestag.de/x')), 'finalUrl-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__('sha256', '0' * 64)),
                       'Quellhash-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__('bytes', 1)), 'Bytezahl-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__('http', 500)), 'HTTP-Drift')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: q['quelle'].__setitem__('datei', 'fehlt.html')),
                       'fehlende Quelle')
    # Metadatum-Abweichung der Aufgabenquelle.
    original_meta = json.loads((zusatz / f'{quelle_datei}.meta.json').read_text(encoding='utf-8'))
    meta_kaputt = dict(original_meta)
    meta_kaputt['url'] = quelle_url + '-meta-fremd'
    (zusatz / f'{quelle_datei}.meta.json').write_text(json.dumps(meta_kaputt, ensure_ascii=False), encoding='utf-8')
    _erwarte_wa_fehler(lambda: _wa_mit(lambda q: None), 'Metadatenabweichung', 'Metadatum url weicht ab')
    (zusatz / f'{quelle_datei}.meta.json').write_text(json.dumps(original_meta, ensure_ascii=False), encoding='utf-8')
    # Fremdperson bei konsistent neu gebundenen Hashes/Bytes.
    def _pruefe_mit_detail(kennung, dokument, grund, meldung=None):
        original = (detail / f'{kennung}.html').read_text(encoding='utf-8')
        try:
            (detail / f'{kennung}.html').write_text(dokument, encoding='utf-8')
            pfad = detail / f'{kennung}.html'
            neu_sha = wa.ZU._sha256(pfad)
            neu_bytes = pfad.stat().st_size
            for eintrag in eintraege:
                if eintrag['kennung'] == kennung:
                    eintrag['rollenquelle']['sha256'] = neu_sha
            profilrollen[kennung]['quelle']['sha256'] = neu_sha
            kennung_zu_abruf[kennung]['sha256'] = neu_sha
            kennung_zu_abruf[kennung]['bytes'] = neu_bytes
            personen_erwartung[kennung]['rollenquelle']['sha256'] = neu_sha
            _erwarte_wa_fehler(lambda: _wa_mit(lambda q: None), grund, meldung)
        finally:
            (detail / f'{kennung}.html').write_text(original, encoding='utf-8')
            pfad = detail / f'{kennung}.html'
            alt_sha = wa.ZU._sha256(pfad)
            alt_bytes = pfad.stat().st_size
            for eintrag in eintraege:
                if eintrag['kennung'] == kennung:
                    eintrag['rollenquelle']['sha256'] = alt_sha
            profilrollen[kennung]['quelle']['sha256'] = alt_sha
            kennung_zu_abruf[kennung]['sha256'] = alt_sha
            kennung_zu_abruf[kennung]['bytes'] = alt_bytes
            personen_erwartung[kennung]['rollenquelle']['sha256'] = alt_sha

    K1, K2 = KENNUNGEN[0][0], KENNUNGEN[1][0]
    _pruefe_mit_detail(K1, '<h1>Fremde Person</h1>', 'fremdePerson bei konsistenten Hashes',
                       'Person passt nicht zur kanonischen Kennung')
    # Negativer Tausch bei konsistenten Hashes: vertauschte Personenpakete.
    original_k1 = (detail / f'{K1}.html').read_text(encoding='utf-8')
    original_k2 = (detail / f'{K2}.html').read_text(encoding='utf-8')
    try:
        (detail / f'{K1}.html').write_text(original_k2, encoding='utf-8')
        (detail / f'{K2}.html').write_text(original_k1, encoding='utf-8')
        for kennung in (K1, K2):
            pfad = detail / f'{kennung}.html'
            neu_sha = wa.ZU._sha256(pfad)
            neu_bytes = pfad.stat().st_size
            for eintrag in eintraege:
                if eintrag['kennung'] == kennung:
                    eintrag['rollenquelle']['sha256'] = neu_sha
            profilrollen[kennung]['quelle']['sha256'] = neu_sha
            kennung_zu_abruf[kennung]['sha256'] = neu_sha
            kennung_zu_abruf[kennung]['bytes'] = neu_bytes
            personen_erwartung[kennung]['rollenquelle']['sha256'] = neu_sha
        _erwarte_wa_fehler(lambda: _wa_mit(lambda q: None), 'vertauschte Personenpakete',
                           'Person passt nicht zur kanonischen Kennung')
    finally:
        (detail / f'{K1}.html').write_text(original_k1, encoding='utf-8')
        (detail / f'{K2}.html').write_text(original_k2, encoding='utf-8')
        for kennung in (K1, K2):
            pfad = detail / f'{kennung}.html'
            alt_sha = wa.ZU._sha256(pfad)
            alt_bytes = pfad.stat().st_size
            for eintrag in eintraege:
                if eintrag['kennung'] == kennung:
                    eintrag['rollenquelle']['sha256'] = alt_sha
            profilrollen[kennung]['quelle']['sha256'] = alt_sha
            kennung_zu_abruf[kennung]['sha256'] = alt_sha
            kennung_zu_abruf[kennung]['bytes'] = alt_bytes
            personen_erwartung[kennung]['rollenquelle']['sha256'] = alt_sha
    # endDate, Zukunft, fremde Gremien-URL, falscher roleName, wrongWP, doppelter ProfilePage.
    _pruefe_mit_detail(K1, _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2], enddate=True),
                       'endDate einer aktuellen Rolle', 'darf kein endDate tragen')
    zukunft = _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2]).replace('"startDate": "2025-03-25"}',
                                                                       '"startDate": "2026-12-01"}')
    _pruefe_mit_detail(K1, zukunft, 'Zukunftsbeginn', 'startDate liegt nach der Abrufzeit')
    _pruefe_mit_detail(K1, _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2], wp='Mitglied des 20. Deutschen Bundestages'),
                       'wrongWP', 'description ist nicht')
    fremd_url_person = _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2], desc_url=True)
    _pruefe_mit_detail(K1, fremd_url_person, 'mainEntity.url-Drift', 'weicht von der Quell-URL ab')
    doppelt = _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2]).replace(
        '<h1>', '<script type="application/ld+json">{"@type":"ProfilePage","mainEntity":{"@type":"Person","@id":"#mdb","name":"Person Eins","description":"Mitglied des 21. Deutschen Bundestages","memberOf":[]}}</script><h1>', 1)
    _pruefe_mit_detail(K1, doppelt, 'doppelter ProfilePage', 'genau EIN ProfilePage.mainEntity')
    # Fremdes Gremium / falsche Rolle direkt im JSON-LD (mit konsistenten Hashes).
    fremd_gremium = _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2]).replace(GURL, 'https://www.bundestag.de/fremd')
    _pruefe_mit_detail(K1, fremd_gremium, 'fremde Gremien-URL im JSON-LD', 'fremde Gremien-URL')
    falsche_rolle = _wa_person(K1, KENNUNGEN[0][1], 'Ordentliches Mitglied').replace(
        '"roleName": "Ordentliches Mitglied", "startDate": "2025-03-25"}',
        '"roleName": "Gast", "startDate": "2025-03-25"}')
    _pruefe_mit_detail(K1, falsche_rolle, 'falscher roleName im JSON-LD', 'falscher roleName')
    # Die Personenbindung akzeptiert nur echtes Markup, auch bei neu gebundenen Hashes.
    person_html = _wa_person(K1, KENNUNGEN[0][1], KENNUNGEN[0][2])
    h1, ld = person_html.split('<script', 1)
    ld = '<script' + ld
    for name, wrap in (
        ('Kommentar', lambda x: '<!--' + x + '-->'),
        ('Template', lambda x: '<template>' + x + '</template>'),
        ('Navigation', lambda x: '<nav>' + x + '</nav>'),
        ('Noscript', lambda x: '<noscript>' + x + '</noscript>'),
    ):
        _pruefe_mit_detail(K1, h1 + wrap(ld), 'ProfilePage nur in ' + name,
                           'genau EIN ProfilePage.mainEntity')
        _pruefe_mit_detail(K1, wrap(h1) + ld, 'H1 nur in ' + name,
                           'Person passt nicht zur kanonischen Kennung')
    for endwert in ('""', 'null'):
        ende = person_html.replace('"roleName": "Ordentliches Mitglied",',
                                  '"endDate": ' + endwert + ', "roleName": "Ordentliches Mitglied",')
        _pruefe_mit_detail(K1, ende, 'leeres/null endDate', 'darf kein endDate tragen')
    _pruefe_mit_detail(K1, person_html.replace('"@id": "#mdb",', '"@id": "#mdb", "url": null,'),
                       'explizit ungeklaerte Personen-URL', 'weicht von der Quell-URL ab')
    original_abruf = kennung_zu_abruf[K1]['abgerufenAm']
    try:
        kennung_zu_abruf[K1]['abgerufenAm'] = '2026-09-28T20:00:00+00:00'
        _erwarte_wa_fehler(lambda: _wa_mit(lambda q: None), 'Personenabrufzeit-Drift',
                           'Rollenquelle weicht vom Abruf ab')
    finally:
        kennung_zu_abruf[K1]['abgerufenAm'] = original_abruf
    # Scheinbelege: Zitat nur in Navigation/Template/fremdem Absatz.
    def _wa_quelle_gegenprobe(dokument, grund, meldung=None):
        original = (zusatz / quelle_datei).read_text(encoding='utf-8')
        try:
            neu = _wa_quelle(dokument)
            gueltige_quittung['quelle'] = dict(neu)
            erwartung['quelle'] = dict(neu)
            _erwarte_wa_fehler(lambda: _wa_mit(lambda q: None), grund, meldung)
        finally:
            (zusatz / quelle_datei).write_text(original, encoding='utf-8')
            neu = _wa_meta(quelle_datei, quelle_url)
            gueltige_quittung['quelle'] = dict(neu)
            erwartung['quelle'] = dict(neu)

    _wa_quelle_gegenprobe(_wa_standard(umhuellung=lambda kern: f'<nav>{kern}</nav>'),
                          'Zitat nur in Navigation', 'genau EINEN eigenen p')
    _wa_quelle_gegenprobe(f'<template>{_wa_standard()}</template>', 'Zitat nur im Template',
                          'fehlt/ist mehrdeutig')
    _wa_quelle_gegenprobe(_wa_standard(ziel=False, zweiter_block=True), 'Zitat nur in fremdem Absatz',
                          'fehlt/ist mehrdeutig')
    _wa_quelle_gegenprobe(_wa_standard(absatz=ABSATZ.replace('21. Wahlperiode', '20. Wahlperiode')),
                          'falsche Wahlperiode', 'stimmt nicht mit dem vollstaendigen Wortlaut')
    _wa_quelle_gegenprobe('<div id="arbeit-und-aufgaben"><div class="bt-standard-content">'
                          '<p></div></div>' + ABSATZ + '</p>',
                          'Absatztext ausserhalb des geschlossenen Abschnitts',
                          'Aufgabenabsatz verlaesst seinen Abschnitt')
    # Das gueltige synthetische Paket wird akzeptiert.
    assert len(wa.pruefe_wahlausschuss(_wa_eingang(gueltige_quittung), erwartung=erwartung)) == 3

print('PASS: Wahlausschuss-Aufgabenquittung — fehlende Quittung/falsche Bilanz/Duplikat/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender/Zusatzaufgaben-/BMWSB-/Amthor-Achse/importfreigegeben/'
      'Status/Region/Parlament/Person/fremdes Gremium/fremde Gremien-URL/roleName/startDate/Thema/'
      'Aufgabenbindung/Aufgabenabsatz/wrongWP/Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/Datei/'
      'Metadatum) und fremdePerson bei konsistenten Hashes/vertauschte Personenpakete/endDate/Zukunftsbeginn/'
      'doppelter ProfilePage/Zitat nur in Navigation, Template oder fremdem Absatz/falsche Wahlperiode '
      'sperren fail closed; die kontinuierliche Rolle wird rollengetreu gebunden; das gueltige synthetische '
      'Paket (Fixture ohne /private/tmp) wird akzeptiert.')


# ── 16 · Jarzombek-Abteilungsquittung (BMDS DS/DI/DW, ein zuvor offener Fachachsenfall) ────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das eng fixierte
# Fachurteil wird ueber den injizierbaren ``erwartung``-Parameter ersetzt; so bleibt der Test
# auch ohne die lokalen Originale lauffaehig. Das Modul verwendet die sicheren Helfer des
# Zusatzaufgabenmoduls wieder und bindet die Abteilungen ausschliesslich ueber eine echte
# geschlossene HTML-Karte article#c5755 und das amtliche Organigramm-JSON
# (excludePersonalData=true). Der neue Host bmds.bund.de ist nur im eigenen Modul fuer genau
# diese zwei kanonischen Quellen freigegeben.
jz_spec = importlib.util.spec_from_file_location(
    'jarzombek', Path(__file__).with_name('profil-feldbelege-500-jarzombek.py'))
jz = importlib.util.module_from_spec(jz_spec)
jz_spec.loader.exec_module(jz)


def _erwarte_jz_fehler(fn, was, meldung=None):
    try:
        fn()
    except jz.JarzombekFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF = '2026-09-27T20:13:00+00:00'
    K = 'bundestag-test-jarzombek-1'
    person = 'Person Jarzombek'
    amt = 'Parlamentarischer Staatssekretär'
    stand = '2026-08-15'
    themen = ['Deutschland-Stack', 'Digitale Infrastrukturen', 'Digitalpolitik', 'Wirtschaft']
    abteilungen = [
        dict(pfad='/organisations/0/organisations/1/organisations/2', id='org-1-7',
             typ='Abteilung', kennung='DS', name='Abteilung DS Deutschland-Stack'),
        dict(pfad='/organisations/0/organisations/1/organisations/3', id='org-1-8',
             typ='Abteilung', kennung='DI', name='Abteilung DI Digitale Infrastrukturen'),
        dict(pfad='/organisations/0/organisations/1/organisations/4', id='org-1-9',
             typ='Abteilung', kennung='DW', name='Abteilung DW Digitalpolitik und Wirtschaft'),
    ]
    aufgabenbindung = ('Parlamentarischer Staatssekretär im Test-BMDS; Abteilungen DS '
                       '(Deutschland-Stack), DI (Digitale Infrastrukturen), DW (Digitalpolitik und Wirtschaft)')
    personenlink = ('https://bmds.bund.de/ministerium/leitung/parlamentarische-staatssekretaere/'
                    'test-jarzombek')
    karten_text = f'{amt} {person} Abteilungen DS, DI, DW'

    def _meta(datei, url):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=jz.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / f'{datei}.meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    json_datei = 'test-organigramm.json'
    json_url = 'https://bmds.bund.de/fileadmin/BMDS/Dokumente/Test_Organigramm_15.08.2026.json'
    json_href = '/fileadmin/BMDS/Dokumente/Test_Organigramm_15.08.2026.json'
    html_datei = 'test-organisation.html'
    html_url = 'https://bmds.bund.de/ministerium/organisation'

    def _org_json(abt=None, stand_wert=None, exclude=True, person_obj=False):
        abt = abt if abt is not None else abteilungen
        kinder = [dict(id=a['id'], type='Abteilung', altName=a['kennung'], name=a['name']) for a in abt]
        if person_obj:
            kinder[0]['positions'] = [dict(positionType='Abteilungsleitung', person=dict(name='Fremdperson'))]
        return dict(
            export=dict(excludePersonalData=exclude),
            document=dict(version=stand_wert if stand_wert is not None else stand),
            organisations=[dict(organisations=[dict(), dict(organisations=[dict(), dict()] + kinder)])],
        )

    def _schreibe_json(dokument):
        (zusatz / json_datei).write_text(json.dumps(dokument, ensure_ascii=False), encoding='utf-8')
        return _meta(json_datei, json_url)

    def _karte_html(link=None, ueberschrift=amt, name=person, dept='Abteilungen DS, DI, DW',
                    json_verweis=True, huelle='', karte=None, artikel_id='c5755'):
        verweis = f'<a href="{json_href}">Organigramm (JSON)</a>' if json_verweis else ''
        karte = karte or (
            f'<article id="{artikel_id}"><div class="teaser-content">'
            f'<h2 class=" "><a href="{link or personenlink}" class="teaser-link stretched-link">'
            f'<span>{ueberschrift}</span></a></h2>'
            f'<p class="lead">{name}</p><p class="text-center">{dept}</p></div></article>'
        )
        return f'<html><body>{verweis}{huelle}{karte}</body></html>'

    def _schreibe_html(dokument):
        (zusatz / html_datei).write_text(dokument, encoding='utf-8')
        return _meta(html_datei, html_url)

    quelle = _schreibe_html(_karte_html())
    organigramm = _schreibe_json(_org_json())

    (detail / f'{K}.html').write_text(f'<h1>{person}</h1>', encoding='utf-8')
    rollen_ref = dict(url='https://www.bundestag.de/abgeordnete/biografien/T/test-jarzombek-1',
                      sha256=jz.ZU._sha256(detail / f'{K}.html'), abgerufenAm=ABRUF)
    kennung_zu_abruf = {K: dict(url=rollen_ref['url'], sha256=rollen_ref['sha256'], abgerufenAm=ABRUF,
                                bytes=(detail / f'{K}.html').stat().st_size, http=200, abrufStatus='abgerufen',
                                datei=f'{K}.html', amtlicheKennung=K, parlament='bundestag')}
    profilrollen = {K: dict(status='belegt', funktionen=[dict(wortlaut='Parlamentarischer Staatssekretär Test')],
                            quelle=dict(rollen_ref))}
    karte_erwartet = dict(id='c5755', text=karten_text, ueberschrift=amt, personenlink=personenlink)
    erwartung = {
        K: dict(region='Bund', bindungsart='abteilungszustaendigkeit', person=person,
                funktion='Parlamentarischer Staatssekretär Test', amt=amt, stand=stand,
                aufgabenbindung=aufgabenbindung, themen=list(themen),
                abteilungen=[dict(a) for a in abteilungen], karte=dict(karte_erwartet),
                quelle=dict(quelle), organigramm=dict(organigramm)),
    }
    eintraege = [dict(
        kennung=K, region='Bund', parlament='bundestag', status='belegt',
        bindungsart='abteilungszustaendigkeit', person=person, funktion='Parlamentarischer Staatssekretär Test',
        amt=amt, stand=stand, aufgabenbindung=aufgabenbindung, themen=list(themen),
        abteilungen=[dict(a) for a in abteilungen], karte=dict(karte_erwartet),
        ableitungsHinweis=jz.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung),
        rollenquelle=dict(rollen_ref), quelle=dict(quelle), organigramm=dict(organigramm), importfreigegeben=False,
    )]
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=1, Bund=1, Berlin=0, Brandenburg=0), ergebnisse=eintraege)

    def _jz_eingang(quittung, ressort=None, aufgaben=None, beratende=None, zusatz_kennungen=None,
                    bmwsb=None, amthor=None, wahlausschuss=None, rollen=None):
        return SimpleNamespace(
            verzeichnis=root, detailseiten=detail, jarzombek=quittung,
            profilrollen_by_kennung=rollen or profilrollen, kennung_zu_abruf=kennung_zu_abruf,
            ressortachsen_by_kennung={k: {} for k in (ressort or [])},
            aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])},
            beratendeachsen_by_kennung={k: {} for k in (beratende or [])},
            zusaetzlicheaufgaben_by_kennung={k: {} for k in (zusatz_kennungen or [])},
            bmwsb_by_kennung={k: {} for k in (bmwsb or [])},
            amthor_by_kennung={k: {} for k in (amthor or [])},
            wahlausschuss_by_kennung={k: {} for k in (wahlausschuss or [])})

    index = jz.pruefe_jarzombek(_jz_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 1
    assert index[K]['themen'] == themen
    assert [a['kennung'] for a in index[K]['abteilungen']] == ['DS', 'DI', 'DW']
    assert index[K]['karte'] == karte_erwartet
    assert index[K]['ableitungsHinweis'] == jz.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung)

    def _mit(mutation, erwartung_override=None):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return jz.pruefe_jarzombek(_jz_eingang(neu), erwartung=erwartung_override or erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat, unbekannte Kennung.
    echter_pfad = jz.JARZOMBEK
    jz.JARZOMBEK = root / 'fehlt.json'
    try:
        _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        jz.JARZOMBEK = echter_pfad
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 0)), 'falsche Bilanz')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('kennung', 'bundestag-fremd-9')),
                       'unbekannte/Fremdkennung')
    # Disjunktion zu den 19/6/2/3/2/1/3-Achsen.
    for feld in ('ressort', 'aufgaben', 'beratende'):
        _erwarte_jz_fehler(lambda f=feld: jz.pruefe_jarzombek(
            _jz_eingang(gueltige_quittung, **{f: [K]}), erwartung=erwartung), f'Kennung bereits {feld}')
    for feld in ('zusatz_kennungen', 'bmwsb', 'amthor', 'wahlausschuss'):
        _erwarte_jz_fehler(lambda f=feld: jz.pruefe_jarzombek(
            _jz_eingang(gueltige_quittung, **{f: [K]}), erwartung=erwartung), f'Kennung bereits {feld}')
    # Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei/HTTP), Metadatum-Drift.
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'url', q['ergebnisse'][0]['quelle']['url'] + '-fremd')), 'Quell-URL-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'finalUrl', 'https://bmds.bund.de/x')), 'finalUrl-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('sha256', '0' * 64)),
                       'Quellhash-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('bytes', 1)),
                       'Quell-Bytezahl-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(
        'abgerufenAm', '2026-09-27T00:00:00+00:00')), 'Abrufzeit-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('http', 404)),
                       'HTTP-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__('datei', 'fehlt.html')),
                       'fehlende Quelle')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['organigramm'].__setitem__('sha256', '0' * 64)),
                       'Organigramm-Hash-Drift')
    # Rollenquellen-Drift, fremde Person, falsche H1 bei konsistenten Hashes, nicht belegte 54er-Rolle.
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['rollenquelle'].__setitem__('sha256', 'c' * 64)),
                       'Rollenquellen-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', '')),
                       'fehlende Personenidentitaet', 'Person weicht')
    original_h1 = (detail / f'{K}.html').read_text(encoding='utf-8')
    hashbindungen = [kennung_zu_abruf[K], rollen_ref, profilrollen[K]['quelle'], eintraege[0]['rollenquelle']]
    original_hashes = [b['sha256'] for b in hashbindungen]
    try:
        (detail / f'{K}.html').write_text('<h1>Fremde Person</h1>', encoding='utf-8')
        for b in hashbindungen:
            b['sha256'] = jz.ZU._sha256(detail / f'{K}.html')
        kennung_zu_abruf[K]['bytes'] = (detail / f'{K}.html').stat().st_size
        _erwarte_jz_fehler(lambda: _mit(lambda q: None), 'falsche H1 bei konsistenten Hashes',
                           'Person passt nicht zur kanonischen Kennung')
    finally:
        (detail / f'{K}.html').write_text(original_h1, encoding='utf-8')
        for b, original_hash in zip(hashbindungen, original_hashes):
            b['sha256'] = original_hash
        kennung_zu_abruf[K]['bytes'] = (detail / f'{K}.html').stat().st_size
    for inert in (f'<!-- {original_h1} -->', f'<template>{original_h1}</template>',
                  f'<script type="text/plain">{original_h1}</script>'):
        try:
            (detail / f'{K}.html').write_text(inert, encoding='utf-8')
            for b in hashbindungen:
                b['sha256'] = jz.ZU._sha256(detail / f'{K}.html')
            kennung_zu_abruf[K]['bytes'] = (detail / f'{K}.html').stat().st_size
            _erwarte_jz_fehler(lambda: _mit(lambda q: None), 'inerte H1 bei konsistenten Hashes')
        finally:
            (detail / f'{K}.html').write_text(original_h1, encoding='utf-8')
            for b, original_hash in zip(hashbindungen, original_hashes):
                b['sha256'] = original_hash
            kennung_zu_abruf[K]['bytes'] = (detail / f'{K}.html').stat().st_size
    fremde_rolle = json.loads(json.dumps(profilrollen))
    fremde_rolle[K]['funktionen'][0]['wortlaut'] = 'Fremdes Amt'
    _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(
        _jz_eingang(gueltige_quittung, rollen=fremde_rolle), erwartung=erwartung), 'fremde belegte Rolle')
    alter_abruf = kennung_zu_abruf[K]['abgerufenAm']
    try:
        kennung_zu_abruf[K]['abgerufenAm'] = '2026-09-26T00:00:00+00:00'
        _erwarte_jz_fehler(lambda: _mit(lambda q: None), 'Personenabrufzeit abweichend')
    finally:
        kennung_zu_abruf[K]['abgerufenAm'] = alter_abruf
    rollen_offen = json.loads(json.dumps(profilrollen))
    rollen_offen[K]['status'] = 'offen'
    _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(
        _jz_eingang(gueltige_quittung, rollen=rollen_offen), erwartung=erwartung), '54er-Rolle nicht belegt')
    # Fixiertes Fachurteil: Stand/Themen/Amt/Hinweis/Abteilungen.
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('stand', '2026-08-16')),
                       'Stand-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'themen', q['ergebnisse'][0]['themen'] + ['Fremdthema'])), 'Themen-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('amt', 'Staatssekretär')),
                       'Amt-Drift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'ableitungsHinweis', 'Aufgabenbindung Bund (amtlich abgeleitet): irgendwas')), 'Hinweisdrift')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['abteilungen'][0].__setitem__(
        'name', 'Abteilung SB Staatsmodernisierung')), 'falscher Abteilungsname')
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['abteilungen'].__setitem__(
        0, dict(q['ergebnisse'][0]['abteilungen'][0], kennung='S'))), 'fremde Abteilung S')

    # HTML-Karte: nur echte geschlossene Elemente, genau eine Karte, Abschnitt nicht verlassen.
    html_gegenproben = [
        (f'<html><body><a href="{json_href}">Organigramm</a><section><article id="c5755">'
         f'<h2><a href="{personenlink}">{amt}</a></h2><p>{person}</p></section>'
         f'<p>Abteilungen DS, DI, DW</p></article></body></html>', 'Karte verlaesst umgebenden Abschnitt'),
        (_karte_html(link='https://bmds.bund.de/ministerium/leitung/parlamentarische-staatssekretaere/fremd'),
         'fremder H2-Personenlink'),
        (_karte_html(name='Fremdperson'), 'fremder Kartenname'),
        (_karte_html(dept='Abteilungen S, SB, L'), 'fremde Abteilungen in der Karte'),
        (f'<html><body><article id="c5755"><div class="teaser-content"><h2><a href="{personenlink}">'
         f'<span>{amt}</span></a></h2><p class="lead">{person}</p></div></article>'
         f'<p>Abteilungen DS, DI, DW</p></body></html>', 'Abteilungen ausserhalb der Karte'),
        (f'<html><body><a href="{json_href}">Organigramm</a><article id="c5755"><div class="teaser-content">'
         f'<h2><a href="{personenlink}"><span>{amt}</span></a></h2><p class="lead">{person}</p>'
         f'<p class="text-center">Abteilungen DS, DI, DW</p></div></article>'
         f'<article id="c5755"><div class="teaser-content"><h2><a href="{personenlink}">'
         f'<span>{amt}</span></a></h2><p class="lead">{person}</p></div></article></body></html>',
         'doppelte Karte'),
        (f'<html><body><a href="{json_href}">Organigramm</a><article id="c5755"><div class="teaser-content">'
         f'<!-- <h2><a href="{personenlink}"><span>{amt}</span></a></h2> -->'
         f'<p class="lead">{person}</p><p class="text-center">Abteilungen DS, DI, DW</p></div></article>'
         f'</body></html>', 'Karte nur als Kommentar'),
        (f'<html><body><article id="c5755"><div class="teaser-content"><h2><a href="{personenlink}">'
         f'<span>{amt}</span></a></h2><p class="lead">{person}</p>'
         f'<p class="text-center">Abteilungen DS, DI, DW</p></div></article></body></html>',
         'HTML verlinkt das Organigramm-JSON nicht'),
        (f'<html><body><a href="/fileadmin/BMDS/Dokumente/Andere.json">x</a>'
         f'<article id="c5755"><div class="teaser-content"><h2><a href="{personenlink}"><span>{amt}</span></a>'
         f'</h2><p class="lead">{person}</p><p class="text-center">Abteilungen DS, DI, DW</p></div></article>'
         f'</body></html>', 'HTML verlinkt ein fremdes JSON'),
    ]
    for dokument, was in html_gegenproben:
        neu_quelle = _schreibe_html(dokument)
        erwartung[K]['quelle'] = dict(neu_quelle)
        eintraege[0]['quelle'] = dict(neu_quelle)
        _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(
            _jz_eingang(dict(gueltige_quittung, ergebnisse=eintraege)), erwartung=erwartung), was)
    # Gueltige Karte wiederherstellen.
    quelle = _schreibe_html(_karte_html())
    erwartung[K]['quelle'] = dict(quelle)
    eintraege[0]['quelle'] = dict(quelle)
    # Verschachtelte article-Karte sperrt fail closed.
    _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(_jz_eingang(dict(
        gueltige_quittung, ergebnisse=[dict(eintraege[0], quelle=dict(_schreibe_html(
            f'<article id="c5755"><article id="c5755">{_karte_html()}</article></article>')))])),
        erwartung=erwartung), 'verschachtelte Karte')
    quelle = _schreibe_html(_karte_html())
    erwartung[K]['quelle'] = dict(quelle)
    eintraege[0]['quelle'] = dict(quelle)

    # Organigramm-JSON: excludePersonalData, Personenbindung, Stand, doppelte/fremde Knoten.
    json_gegenproben = [
        (_org_json(exclude=False), 'ohne excludePersonalData=true'),
        (_org_json(person_obj=True), 'JSON traegt eine Personenzuordnung'),
        (_org_json(stand_wert='2025-01-01'), 'falscher Stand'),
        (_org_json(abt=[abteilungen[0], abteilungen[0], abteilungen[2]]), 'doppelter/vertauschter Knoten'),
        (_org_json(abt=[abteilungen[0], abteilungen[1]]), 'zu wenige Abteilungsknoten'),
        (_org_json(abt=[dict(abteilungen[0], name='Abteilung S Service'), abteilungen[1], abteilungen[2]]),
         'falscher Abteilungsname'),
    ]
    for dokument, was in json_gegenproben:
        neu_org = _schreibe_json(dokument)
        erwartung[K]['organigramm'] = dict(neu_org)
        eintraege[0]['organigramm'] = dict(neu_org)
        _erwarte_jz_fehler(lambda: jz.pruefe_jarzombek(
            _jz_eingang(dict(gueltige_quittung, ergebnisse=eintraege)), erwartung=erwartung), was)
    organigramm = _schreibe_json(_org_json())
    erwartung[K]['organigramm'] = dict(organigramm)
    eintraege[0]['organigramm'] = dict(organigramm)

    # Vertauschtes/neu gebundenes Fremdpaket: konsistente Quellen, aber Abteilungen passen nicht.
    erwartung_fremd = json.loads(json.dumps(erwartung))
    erwartung_fremd[K]['abteilungen'][0]['name'] = 'Abteilung SB Staatsmodernisierung'
    _erwarte_jz_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['abteilungen'].__setitem__(
        0, dict(q['ergebnisse'][0]['abteilungen'][0], name='Abteilung SB Staatsmodernisierung',
                kennung='SB')), erwartung_override=erwartung_fremd), 'konsistent neu gebundenes Fremdpaket')
    # Das gueltige synthetische Paket wird akzeptiert.
    assert len(jz.pruefe_jarzombek(_jz_eingang(gueltige_quittung), erwartung=erwartung)) == 1

print('PASS: Jarzombek-Abteilungsquittung — fehlende Quittung/falsche Bilanz/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender/Zusatzaufgaben-/BMWSB-/Amthor-/Wahlausschuss-Achse/'
      'Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/HTTP/Datei)/Organigramm-Hash-Drift/'
      'Rollenquellen-Drift/fehlende Personenidentitaet/falsche H1 bei konsistenten Hashes/nicht belegte '
      '54er-Rolle/Stand-/Themen-/Amt-/Hinweis-/Abteilungsnamens-Drift/fremde S-Abteilung sperren fail '
      'closed; die Abteilungen stammen ausschliesslich aus genau EINER echten geschlossenen HTML-Karte '
      'article#c5755 (fremder H2-Personenlink/fremder Kartenname/fremde Abteilungen/Abteilungen ausserhalb '
      'der Karte/doppelte Karte/Karte nur als Kommentar/HTML verlinkt fremdes oder gar kein Organigramm-JSON/'
      'verschachtelte Karte sperren) und dem amtlichen Organigramm-JSON (ohne excludePersonalData=true/'
      'Personenzuordnung/falscher Stand/doppelte oder zu wenige Knoten/vertauschte Namen sperren); ein '
      'konsistent neu gebundenes Fremdpaket wird gesperrt; das gueltige synthetische Paket (Fixture ohne '
      '/private/tmp) wird akzeptiert.')


# ── 17 · Kloeckner-Aufgabenquittung (Bundestagspräsidentin, ein zuvor offener Fachachsenfall) ──
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das eng fixierte
# Fachurteil wird ueber den injizierbaren ``erwartung``-Parameter ersetzt; so bleibt der Test
# auch ohne die lokalen Originale lauffaehig. Das Modul verwendet die sicheren Helfer des
# Zusatzaufgabenmoduls wieder und bindet die kanonische Person separat (echte H1 + eigener
# aktueller Funktionstext div.m-biography__function) sowie die Aufgaben ausschliesslich aus
# dem ZWEITEN eigenen Absatz des geschlossenen H2-Abschnitts der amtlichen Praesidiumsseite.
kl_spec = importlib.util.spec_from_file_location(
    'kloeckner', Path(__file__).with_name('profil-feldbelege-500-kloeckner.py'))
kl = importlib.util.module_from_spec(kl_spec)
kl_spec.loader.exec_module(kl)


def _erwarte_kl_fehler(fn, was, meldung=None):
    try:
        fn()
    except kl.KloecknerFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    ABRUF_AUFGABE = '2026-09-27T20:42:16+00:00'
    ABRUF_PERSON = '2026-09-27T13:00:37+00:00'
    K = 'bundestag-test-kloeckner-1'
    person = 'Person Klöckner'
    funktion = 'Testpräsidentin'
    funktionstext = 'Testpräsidentin'
    abschnitt = 'An der Spitze der Testverwaltung'
    danach_abschnitt = 'Unterstützung durch Testgremien'
    erster_absatz = 'Die Aufgaben der Testpräsidentin reichen über die Testleitung hinaus.'
    zweiter_absatz = ('Die Testpräsidentin steht auch an der Spitze der Bundestagsverwaltung und setzt '
                      'die staatlichen Mittel zur Parteienfinanzierung fest.')
    themen = ['Bundestagsverwaltung', 'Parteienfinanzierung']
    aufgabenbindung = ('Testpräsidentin; Spitze der Bundestagsverwaltung und Festsetzung der Mittel zur '
                       'Parteienfinanzierung')
    person_url = 'https://www.bundestag.de/abgeordnete/biografien/T/test-kloeckner-1'
    aufgaben_url = 'https://www.bundestag.de/parlament/praesidium/test-funktion'
    person_datei = f'{K}.html'
    aufgaben_datei = 'test-praesidentin-aufgaben.html'
    absatz_link = ('Die Testpräsidentin steht auch an der Spitze der Bundestagsverwaltung und setzt die '
                   'staatlichen Mittel zur <a href="/x" class="a-link --inline">'
                   '<span class="a-link__label">Parteienfinanzierung</span>'
                   '<span class="a-link__label --hidden">(Interner Link)</span></a> fest.')

    def _meta(datei, url, abruf):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=abruf, sha256=kl.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / f'{datei}.meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    def _person_html(h1=person, funktion_wert=funktionstext, klassen='m-biography__function'):
        return (f'<html><body><h1>{h1}</h1>'
                f'<div class="{klassen}"><div><p>{funktion_wert}</p></div></div></body></html>')

    def _aufgaben_html(titel=abschnitt, erster=erster_absatz, absatz=absatz_link, danach=danach_abschnitt,
                       extra='', unvollstaendig=False):
        schluss = '' if unvollstaendig else '</p>'
        return (f'<html><body><h2>{titel}</h2><p>{erster}</p><p>{absatz}{schluss}{extra}'
                f'<h2>{danach}</h2><p>Kein Beleg.</p></body></html>')

    def _schreibe_person(dokument, abruf=ABRUF_PERSON):
        (detail / person_datei).write_text(dokument, encoding='utf-8')
        return dict(url=person_url, finalUrl=person_url, abgerufenAm=abruf,
                    sha256=kl.ZU._sha256(detail / person_datei),
                    bytes=(detail / person_datei).stat().st_size, datei=person_datei,
                    http=200, abrufStatus='abgerufen')

    def _schreibe_aufgaben(dokument, abruf=ABRUF_AUFGABE):
        (zusatz / aufgaben_datei).write_text(dokument, encoding='utf-8')
        return _meta(aufgaben_datei, aufgaben_url, abruf)

    personenquelle = _schreibe_person(_person_html())
    quelle = _schreibe_aufgaben(_aufgaben_html())
    rollen_ref = dict(url=person_url, sha256=personenquelle['sha256'], abgerufenAm=ABRUF_PERSON)
    kennung_zu_abruf = {K: dict(personenquelle, amtlicheKennung=K, parlament='bundestag')}
    profilrollen = {K: dict(status='belegt', funktionen=[dict(wortlaut=funktion)], quelle=dict(rollen_ref))}
    erwartung = {
        K: dict(region='Bund', bindungsart='amtsaufgabe', person=person, funktion=funktion,
                funktionstext=funktionstext, abschnitt=abschnitt, ersterAbsatz=erster_absatz,
                absatz=zweiter_absatz, aufgabenbindung=aufgabenbindung, themen=list(themen),
                personenquelle=dict(personenquelle), quelle=dict(quelle)),
    }
    eintrag = dict(
        kennung=K, region='Bund', parlament='bundestag', status='belegt', bindungsart='amtsaufgabe',
        person=person, funktion=funktion, funktionstext=funktionstext, abschnitt=abschnitt,
        ersterAbsatz=erster_absatz, absatz=zweiter_absatz, aufgabenbindung=aufgabenbindung,
        themen=list(themen), ableitungsHinweis=kl.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung),
        personenquelle=dict(personenquelle), quelle=dict(quelle), importfreigegeben=False,
    )
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=1, Bund=1, Berlin=0, Brandenburg=0), ergebnisse=[eintrag])

    def _kl_eingang(quittung, ressort=None, aufgaben=None, beratende=None, zusatz_kennungen=None,
                    bmwsb=None, amthor=None, wahlausschuss=None, jarzombek=None, rollen=None, abruf=None):
        return SimpleNamespace(
            verzeichnis=root, detailseiten=detail, kloeckner=quittung,
            profilrollen_by_kennung=rollen or profilrollen,
            kennung_zu_abruf=kennung_zu_abruf if abruf is None else abruf,
            ressortachsen_by_kennung={k: {} for k in (ressort or [])},
            aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])},
            beratendeachsen_by_kennung={k: {} for k in (beratende or [])},
            zusaetzlicheaufgaben_by_kennung={k: {} for k in (zusatz_kennungen or [])},
            bmwsb_by_kennung={k: {} for k in (bmwsb or [])},
            amthor_by_kennung={k: {} for k in (amthor or [])},
            wahlausschuss_by_kennung={k: {} for k in (wahlausschuss or [])},
            jarzombek_by_kennung={k: {} for k in (jarzombek or [])})

    index = kl.pruefe_kloeckner(_kl_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 1
    assert index[K]['themen'] == themen
    # Der --hidden-Linkhilfetext zaehlt NICHT als Aufgabenprosa (sonst waere der Absatz
    # nicht identisch mit dem fixierten zweiten Absatz).
    assert index[K]['absatz'] == zweiter_absatz
    assert '(Interner Link)' not in index[K]['absatz']
    assert index[K]['ableitungsHinweis'] == kl.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung)

    def _mit(mutation, erwartung_override=None):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return kl.pruefe_kloeckner(_kl_eingang(neu), erwartung=erwartung_override or erwartung)

    def _rebind_person(dokument, abruf=ABRUF_PERSON):
        pq = _schreibe_person(dokument, abruf)
        ref = dict(url=person_url, sha256=pq['sha256'], abgerufenAm=abruf)
        rollen = {K: dict(status='belegt', funktionen=[dict(wortlaut=funktion)], quelle=dict(ref))}
        abr = {K: dict(pq, amtlicheKennung=K, parlament='bundestag')}
        return pq, rollen, abr

    # Fehlende Quittung, falsche Bilanz, Duplikat/Fremdkennung.
    echter_pfad = kl.KLOECKNER
    kl.KLOECKNER = root / 'fehlt.json'
    try:
        _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        kl.KLOECKNER = echter_pfad
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 0)), 'falsche Bilanz')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('kennung', 'bundestag-fremd-9')),
                       'unbekannte/Fremdkennung')
    # Disjunktion zu allen bisherigen Achsen.
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, ressort=[K]), erwartung=erwartung), 'Kennung bereits Ressortachse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, aufgaben=[K]), erwartung=erwartung), 'Kennung bereits Aufgabenachse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, beratende=[K]), erwartung=erwartung), 'Kennung bereits beratende Achse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, zusatz_kennungen=[K]), erwartung=erwartung), 'Kennung bereits Zusatzaufgabenachse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, bmwsb=[K]), erwartung=erwartung), 'Kennung bereits BMWSB-Achse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, amthor=[K]), erwartung=erwartung), 'Kennung bereits Amthor-Achse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, wahlausschuss=[K]), erwartung=erwartung), 'Kennung bereits Wahlausschuss-Achse')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(
        _kl_eingang(gueltige_quittung, jarzombek=[K]), erwartung=erwartung), 'Kennung bereits Jarzombek-Achse')
    # Status/Region/Parlament/Bindungsart/Person/Importfreigabe.
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('status', 'offen')), 'unerwarteter Status')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('region', 'Berlin')), 'falsche Region')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('parlament', 'landtag-berlin')), 'falsches Parlament')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('bindungsart', 'abteilungszustaendigkeit')), 'falsche Bindungsart')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremde Person')), 'fremde Person')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('importfreigegeben', True)), 'Importfreigabe gesetzt')
    # Felddrift (Funktion/Funktionstext/Abschnitt/Absaetze/Aufgabenbindung/Themen/Hinweis).
    for feld, wert in (('funktion', 'Fremdrolle'), ('funktionstext', 'Fremdrolle'), ('abschnitt', 'Fremdabschnitt'),
                       ('ersterAbsatz', 'Fremdabsatz'), ('absatz', 'Fremdabsatz'),
                       ('aufgabenbindung', 'Fremde Aufgabenbindung'), ('themen', ['Fremdthema']),
                       ('ableitungsHinweis', 'Fremder Hinweis')):
        _erwarte_kl_fehler(lambda f=feld, w=wert: _mit(lambda q: q['ergebnisse'][0].__setitem__(f, w)), f'Feld {feld} Drift')
    # Nur die zwei freigegebenen Themen; allgemeine Polizei-/Innenpolitik ist gesperrt.
    _erwarte_kl_fehler(lambda: kl._pruefe_themen(
        dict(themen=['Polizeigewalt', 'Bundestagsverwaltung']),
        'Die Polizeigewalt und die Bundestagsverwaltung.', K), 'allgemeines/fremdes Thema gesperrt')
    _erwarte_kl_fehler(lambda: kl._pruefe_themen(
        dict(themen=['Parteienfinanzierung', 'Innenpolitik']),
        'Die Mittel zur Parteienfinanzierung in der Innenpolitik.', K), 'allgemeines/fremdes Thema gesperrt')
    # Quellen-/Metadatendrift (Aufgabenquelle).
    for feld, wert in (('url', 'https://www.bundestag.de/parlament/praesidium/fremd'),
                       ('finalUrl', 'https://www.bundestag.de/parlament/praesidium/fremd'),
                       ('sha256', '0' * 64), ('bytes', 1), ('abgerufenAm', '2026-01-01T00:00:00+00:00'),
                       ('datei', 'fremd.html')):
        _erwarte_kl_fehler(lambda f=feld, w=wert: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(f, w)),
                           f'Quelldrift {feld}')
    (zusatz / f'{aufgaben_datei}.meta.json').write_text(
        json.dumps(dict(quelle, sha256='0' * 64), ensure_ascii=False), encoding='utf-8')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(gueltige_quittung), erwartung=erwartung),
                       'Metadatum-Hash-Drift')
    quelle = _schreibe_aufgaben(_aufgaben_html())
    erwartung[K]['quelle'] = dict(quelle)
    eintrag['quelle'] = dict(quelle)
    # Personenquellen-/Rollenquellen-Drift.
    for feld, wert in (('url', 'https://www.bundestag.de/abgeordnete/biografien/T/fremd'),
                       ('sha256', '0' * 64), ('bytes', 1),
                       ('abgerufenAm', '2026-01-01T00:00:00+00:00'), ('datei', 'fremd.html')):
        _erwarte_kl_fehler(lambda f=feld, w=wert: _mit(lambda q: q['ergebnisse'][0]['personenquelle'].__setitem__(f, w)),
                           f'Personenquellen-Drift {feld}')
    _erwarte_kl_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__(
        'personenquelle', dict(quelle))), 'vertauschte Pakete')
    # Nicht belegte / wortlautlose 54er-Rolle.
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(
        gueltige_quittung, rollen={K: dict(status='offen', funktionen=[], quelle=dict(rollen_ref))}),
        erwartung=erwartung), 'nicht belegte 54er-Rolle')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(
        gueltige_quittung, rollen={K: dict(status='belegt', funktionen=[], quelle=dict(rollen_ref))}),
        erwartung=erwartung), '54er-Rolle ohne Wortlaut')
    # Konsistent neu gehashte Fremdperson/-funktion, fehlende/fremde H1.
    pq, rollen_neu, abruf_neu = _rebind_person(_person_html(funktion_wert='Fremdrolle'))
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(
        dict(gueltige_quittung, ergebnisse=[dict(eintrag, personenquelle=dict(pq))]), rollen=rollen_neu, abruf=abruf_neu),
        erwartung=erwartung), 'fremder Funktionstext bei konsistentem Hash')
    pq, rollen_neu, abruf_neu = _rebind_person('<html><body><div class="m-biography__function">'
                                               '<div><p>Testpräsidentin</p></div></div></body></html>')
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(
        dict(gueltige_quittung, ergebnisse=[dict(eintrag, personenquelle=dict(pq))]), rollen=rollen_neu, abruf=abruf_neu),
        erwartung=erwartung), 'fehlende H1')
    pq, rollen_neu, abruf_neu = _rebind_person(_person_html(h1='Fremde Person'))
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(
        dict(gueltige_quittung, ergebnisse=[dict(eintrag, personenquelle=dict(pq))]), rollen=rollen_neu, abruf=abruf_neu),
        erwartung=erwartung), 'fremde H1 bei konsistentem Hash')
    # Gueltige Person wiederherstellen (identischer Inhalt -> identischer Hash).
    personenquelle = _schreibe_person(_person_html())
    # Konsistent neu gehashter Fremdabsatz.
    fremd_quelle = _schreibe_aufgaben(_aufgaben_html(
        absatz='Die Testpräsidentin kümmert sich um Verteidigung und Landwirtschaft.'))
    _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(dict(
        gueltige_quittung, ergebnisse=[dict(eintrag, quelle=dict(fremd_quelle))])), erwartung=erwartung),
        'fremder Absatz bei konsistentem Hash')
    quelle = _schreibe_aufgaben(_aufgaben_html())
    erwartung[K]['quelle'] = dict(quelle)
    eintrag['quelle'] = dict(quelle)
    # Nur der ZWEITE eigene Absatz; erster Absatz, Abschnittsleck und ungeschlossener Absatz sperren.
    _erwarte_kl_fehler(lambda: kl._pruefe_aufgabenabschnitt(
        _aufgaben_html(erster=zweiter_absatz, absatz=erster_absatz), erwartung[K], K), 'erster Absatz als Aufgabe')
    _erwarte_kl_fehler(lambda: kl._Abschnittsleser.lese(_aufgaben_html(extra='<p>Extra</p>'), abschnitt),
                       'Abschnittsleck/zusaetzlicher Absatz')
    _erwarte_kl_fehler(lambda: kl._Abschnittsleser.lese(_aufgaben_html(unvollstaendig=True), abschnitt),
                       'ungeschlossener Absatz verlaesst den Abschnitt')
    _erwarte_kl_fehler(lambda: kl._Abschnittsleser.lese(
        _aufgaben_html() + f'<h2>{abschnitt}</h2><p>x</p>', abschnitt), 'doppelter H2-Abschnitt')
    # Der --hidden-Linkhilfetext zaehlt nicht als Aufgabenprosa.
    html_hidden = (f'<html><body><h2>{abschnitt}</h2><p>{erster_absatz}</p>'
                   f'<p>Der Text nennt die <a href="/x">'
                   f'<span class="a-link__label --hidden">Parteienfinanzierung</span></a>.</p>'
                   f'<h2>{danach_abschnitt}</h2></body></html>')
    assert 'Parteienfinanzierung' not in kl._Abschnittsleser.lese(html_hidden, abschnitt)[1]
    # Eigene Orchestrator-Gegenproben: Quellen samt Metadaten und erwartetem Hash
    # konsistent neu binden, damit tatsaechlich der Inhaltsparser sperren muss.
    for dokument, sperrgrund in [
        (f'<h3>{abschnitt}</h3><p>{erster_absatz}</p><p>{zweiter_absatz}</p>', 'geschlossenen H2-Abschnitt'),
        (f'<section><h2>{abschnitt}</h2><p>{erster_absatz}</p></section>'
         f'<section><p>{zweiter_absatz}</p></section>', 'zwei eigene Absaetze'),
        (f'<section><h2>{abschnitt}</h2><p>{erster_absatz}</p><p></section>'
         f'{zweiter_absatz}</p>', 'verlaesst den Abschnitt'),
        (f'<h2 class="--hidden">{abschnitt}</h2><p>{erster_absatz}</p><p>{zweiter_absatz}</p>',
         'geschlossenen H2-Abschnitt'),
        (_aufgaben_html(absatz='Fremde Aufgaben'), 'zweite eigene Absatz'),
    ]:
        neu_quelle = _schreibe_aufgaben(dokument)
        neu_erwartung = json.loads(json.dumps(erwartung))
        neu_erwartung[K]['quelle'] = dict(neu_quelle)
        _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(dict(
            gueltige_quittung, ergebnisse=[dict(eintrag, quelle=dict(neu_quelle))])),
            erwartung=neu_erwartung), 'konsistent neu gebundener Abschnittsfehler', sperrgrund)
    quelle = _schreibe_aufgaben(_aufgaben_html())
    for dokument, sperrgrund in [
        (f'<h1>{person}</h1><div><section><div class="m-biography__function"></section>'
         f'{funktionstext}</div>', 'Funktionstext verlaesst'),
        (f'<!-- <h1>{person}</h1> --><div class="m-biography__function">{funktionstext}</div>',
         'Person passt nicht'),
        (f'<h1>{person}</h1><template><div class="m-biography__function">'
         f'{funktionstext}</div></template>', 'Funktionstextblock fehlt'),
    ]:
        pq, rollen_neu, abruf_neu = _rebind_person(dokument)
        neu_erwartung = json.loads(json.dumps(erwartung))
        neu_erwartung[K]['personenquelle'] = dict(pq)
        _erwarte_kl_fehler(lambda: kl.pruefe_kloeckner(_kl_eingang(dict(
            gueltige_quittung, ergebnisse=[dict(eintrag, personenquelle=dict(pq))]),
            rollen=rollen_neu, abruf=abruf_neu), erwartung=neu_erwartung),
            'konsistent neu gebundener Personenblockfehler', sperrgrund)
    personenquelle = _schreibe_person(_person_html())
    # Das gueltige synthetische Paket wird akzeptiert.
    assert len(kl.pruefe_kloeckner(_kl_eingang(gueltige_quittung), erwartung=erwartung)) == 1

print('PASS: Kloeckner-Aufgabenquittung — fehlende Quittung/falsche Bilanz/Fremdkennung/'
      'Disjunktion zu Ressort-/Aufgaben-/beratender/Zusatzaufgaben-/BMWSB-/Amthor-/Wahlausschuss-/'
      'Jarzombek-Achse/importfreigegeben/Status/Region/Parlament/Bindungsart/Person/fremder '
      'Funktionstext/fremde H1/fehlende Personenidentitaet bei konsistenten Hashes/Quelldrift '
      '(URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei)/Original-Metadaten-Drift/Personenquellen-Drift/'
      'vertauschte Pakete/nicht belegte oder wortlautlose 54er-Rolle/Themen-/Aufgabenbindungs-/'
      'Hinweis-Drift/fremder Absatz sperren fail closed; die Aufgaben stammen ausschliesslich aus dem '
      'ZWEITEN eigenen Absatz des geschlossenen H2-Abschnitts (der erste Absatz, zusaetzliche Absaetze '
      'und ein ungeschlossener Absatz sperren, nur echte geschlossene Elemente zaehlen, der '
      '--hidden-Linkhilfetext zaehlt nicht); das gueltige synthetische Paket (Fixture ohne /private/tmp) '
      'wird akzeptiert.')


# ── 18 · Stellvertretungsquittung Brandenburg (belegter Verlust, 76 bei 35) ──────────────
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Die festen Zaehlwerte
# (Quellen/Spalten/Profile/Mitgliedschaften/kanonische Personen) werden ueber den
# injizierbaren ``erwartung``-Parameter ersetzt; das Modul bindet Index, Quellen und
# Personen selbst und prueft fail closed (Index 25220, eigene geschlossene
# Stellvertretungsspalte, exakter kanonischer Personenlink, Person/Profilhash/Name/
# Fraktion separat an die Detailseiten, Unterausschuss als belegter Nullfall).
stv_spec = importlib.util.spec_from_file_location(
    'stellvertretungen', Path(__file__).with_name('profil-feldbelege-500-stellvertretungen.py'))
sv = importlib.util.module_from_spec(stv_spec)
stv_spec.loader.exec_module(sv)


def _erwarte_stv_fehler(fn, was, meldung=None):
    try:
        fn()
    except sv.StellvertretungenFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    HOST = 'https://www.landtag.brandenburg.de'
    ABRUF = '2026-09-27T21:26:00+00:00'
    K1 = 'landtag-brandenburg-11111'
    K2 = 'landtag-brandenburg-22222'
    P1 = 'Anna Beispiel'
    P2 = 'Bernd Muster'
    P1URL = f'{HOST}/de/beispiel_anna/11111'
    P2URL = f'{HOST}/de/muster_bernd/22222'
    FREMD_URL = f'{HOST}/de/fremd_person/99999'
    INDEX_URL = f'{HOST}/de/parlament/ausschuesse_gremien_europa/fachausschuesse/25220'
    A_URL = f'{HOST}/de/fachausschuss/test_a/90001'
    B_URL = f'{HOST}/de/fachausschuss/test_b/90002'
    C_URL = f'{HOST}/de/fachausschuss/unterausschuss_des_ausschusses_fuer_haushaltskontrolle/23893'
    INDEX_DATEI = 'stv-index.html'
    ADATEI, BDATEI, CDATEI = 'stv-a.html', 'stv-b.html', 'stv-c.html'
    PDATEI = {K1: 'landtag-brandenburg-11111.html', K2: 'landtag-brandenburg-22222.html'}

    def _li(name, url, gruppe):
        return (f'<li><a href="{url}" class="profile"><strong>{name}</strong> '
                f'<span class="organization-name">({gruppe})</span></a></li>')

    def _spalte(segmente):
        return ('<div class="col-12 col-md-6 col-lg-12 col-xl-6 my-4 my-md-0">'
                '<h5 class="my-3">Stellvertretende Mitglieder</h5>' + ''.join(segmente) + '</div>')

    def _ausschuss_html(h1, spalten):
        return f'<html><body><main><h1>{h1}</h1><div class="row">{"".join(spalten)}</div></main></body></html>'

    def _person_html(h1, subtitle):
        return f'<html><body><main><h1>{h1}</h1><p role="doc-subtitle">{subtitle}</p></main></body></html>'

    def _index_html(links):
        inner = ''.join(f'<article><a href="{u}"><h6>{h}</h6></a></article>' for u, h in links)
        return f'<html><body><main><h1>Fachausschüsse</h1><section class="teaser-grid">{inner}</section></main></body></html>'

    def _meta(datei, url):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=sv.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / f'{datei}.meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    def _person_abruf(kennung, url, datei):
        pfad = detail / datei
        return dict(url=url, finalUrl=url, abgerufenAm=ABRUF, sha256=sv.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200, abrufStatus='abgerufen',
                    amtlicheKennung=kennung.rsplit('-', 1)[-1], parlament='landtag-brandenburg')

    def _standard():
        (zusatz / INDEX_DATEI).write_text(
            _index_html([('/de/fachausschuss/test_a/90001', 'Testausschuss A'),
                         ('/de/fachausschuss/test_b/90002', 'Testausschuss B'),
                         ('/de/fachausschuss/unterausschuss_des_ausschusses_fuer_haushaltskontrolle/23893', 'Unterausschuss des Ausschusses für Haushaltskontrolle')]),
            encoding='utf-8')
        (zusatz / ADATEI).write_text(_ausschuss_html('Testausschuss A', [_spalte([
            '<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
            + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion')
            + _li('Fremde Person', '/de/fremd_person/99999', 'SPD-Fraktion') + '</ul>',
            '<h6>CDU-Fraktion</h6><ul class="list-unstyled">'
            + _li(P2, '/de/muster_bernd/22222', 'CDU-Fraktion') + '</ul>',
        ])]), encoding='utf-8')
        (zusatz / BDATEI).write_text(_ausschuss_html('Testausschuss B', [_spalte([
            '<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
            + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + '</ul>',
        ])]), encoding='utf-8')
        (zusatz / CDATEI).write_text(
            _ausschuss_html('Unterausschuss des Ausschusses für Haushaltskontrolle', []), encoding='utf-8')
        (detail / PDATEI[K1]).write_text(_person_html(P1, 'SPD-Fraktion'), encoding='utf-8')
        (detail / PDATEI[K2]).write_text(_person_html(P2, 'CDU-Fraktion'), encoding='utf-8')

    kanon = {sv._kanonisch(P1URL): K1, sv._kanonisch(P2URL): K2}
    _standard()
    personen = {K1: _person_abruf(K1, P1URL, PDATEI[K1]), K2: _person_abruf(K2, P2URL, PDATEI[K2])}
    kennung_zu_abruf = dict(personen)

    def _baue_quittung():
        index_meta = _meta(INDEX_DATEI, INDEX_URL)
        _, links = sv.index_lesen((zusatz / INDEX_DATEI).read_text(encoding='utf-8'), INDEX_URL)
        quellen, ziel = [], []
        for datei, url in ((ADATEI, A_URL), (BDATEI, B_URL), (CDATEI, C_URL)):
            quelle = _meta(datei, url)
            ausschuss, spalte, eintraege = sv.ausschussseite_lesen(
                (zusatz / datei).read_text(encoding='utf-8'), url)
            quellen.append(dict(quelle, h1=ausschuss, stellvertretendeSpalten=(1 if spalte is not None else 0)))
            for eintrag in eintraege:
                kennung = kanon.get(sv._kanonisch(eintrag['personenlink']))
                if kennung is None:
                    continue
                ziel.append(dict(kennung=kennung, person=eintrag['name'], gruppe=eintrag['gruppe'],
                                 ausschuss=ausschuss, personenlink=sv._kanonisch(eintrag['personenlink']),
                                 quelleUrl=sv._kanonisch(url), quelleDatei=datei, quelleSha256=quelle['sha256']))
        gruppen = {}
        for eintrag in ziel:
            gruppe = gruppen.setdefault(eintrag['kennung'], {'person': eintrag['person'],
                                                             'gruppe': eintrag['gruppe'], 'm': []})
            gruppe['m'].append(eintrag)
        ergebnisse = []
        for kennung in sorted(gruppen):
            gruppe = gruppen[kennung]
            person = personen[kennung]
            ergebnisse.append(dict(
                kennung=kennung, amtlicheKennung=person['amtlicheKennung'], parlament='landtag-brandenburg',
                person=gruppe['person'], gruppe=gruppe['gruppe'],
                personenquelle={n: person[n] for n in ('url', 'finalUrl', 'http', 'abrufStatus',
                                                       'abgerufenAm', 'sha256', 'bytes', 'datei')},
                mitgliedschaften=sorted([
                    dict(ausschuss=m['ausschuss'], rolle=sv.ROLLE, personenlink=m['personenlink'],
                         quelleUrl=m['quelleUrl'], quelleDatei=m['quelleDatei'], quelleSha256=m['quelleSha256'])
                    for m in gruppe['m']], key=lambda m: m['ausschuss'])))
        return dict(
            status='synthetisch', index=index_meta, quellen=quellen,
            bilanz=dict(gesamt=len(ziel), zielprofile=len(gruppen), quellen=len(quellen),
                        mitStellvertretungsspalte=sum(q['stellvertretendeSpalten'] for q in quellen),
                        ohneStellvertretungsspalte=sum(1 for q in quellen if q['stellvertretendeSpalten'] == 0),
                        Brandenburg=len(ziel)),
            ergebnisse=ergebnisse), index_meta, links

    def _eingang(quittung, kzu=None):
        return SimpleNamespace(verzeichnis=root, detailseiten=detail,
                               kennung_zu_abruf=kzu if kzu is not None else kennung_zu_abruf,
                               stellvertretungen=quittung)

    gueltige_quittung, index_meta, index_links = _baue_quittung()
    assert index_links == [sv._kanonisch(A_URL), sv._kanonisch(B_URL), sv._kanonisch(C_URL)]
    ERW = {'index': {n: index_meta[n] for n in ('url', 'finalUrl', 'http', 'abrufStatus',
                                                'abgerufenAm', 'sha256', 'bytes', 'datei')},
           'indexH1': 'Fachausschüsse', 'quellen': 3, 'mitSpalte': 2, 'ohneSpalte': 1,
           'kanonischeProfile': 2, 'gesamt': 3, 'zielprofile': 2, 'nullquelle': C_URL}

    index = sv.pruefe_stellvertretungen(_eingang(gueltige_quittung), erwartung=ERW)
    assert set(index) == {K1, K2}
    assert len(index[K1]['ausschuesse']) == 2 and len(index[K2]['ausschuesse']) == 1
    assert index[K1]['gruppe'] == 'SPD-Fraktion' and index[K2]['gruppe'] == 'CDU-Fraktion'
    assert [m['ausschuss'] for m in index[K1]['ausschuesse']] == ['Testausschuss A', 'Testausschuss B']
    assert all(m['rolle'] == sv.ROLLE for m in index[K1]['ausschuesse'])

    def _mit(mutation, quittung=None):
        neu = json.loads(json.dumps(quittung or gueltige_quittung))
        mutation(neu)
        return sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW)

    # Fehlende Quittung (Datei fehlt).
    echter_pfad = sv.STELLVERTRETUNGEN
    sv.STELLVERTRETUNGEN = root / 'fehlt.json'
    try:
        _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, kennung_zu_abruf=kennung_zu_abruf),
            erwartung=ERW), 'fehlende Quittung')
    finally:
        sv.STELLVERTRETUNGEN = echter_pfad
    # Falsche Bilanz, Fremdkennung/unerwartetes Parlament, falsche Rolle.
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('gesamt', 0)), 'falsche Bilanz')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('kennung', 'landtag-brandenburg-99999')),
                        'unbekannte/Fremdkennung')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('parlament', 'bundestag')),
                        'unexpected parliament')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['mitgliedschaften'][0].__setitem__(
        'rolle', 'Ordentliches Mitglied')), 'falsche Rolle')
    # Falscher Ausschuss, vertauschte Gruppe, fremder Name/Link.
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['mitgliedschaften'][0].__setitem__(
        'ausschuss', 'Falscher Ausschuss')), 'falscher Ausschuss')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('gruppe', 'CDU-Fraktion')),
                        'vertauschte Gruppe')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremde Person')),
                        'fremder Name')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['mitgliedschaften'][0].__setitem__(
        'personenlink', FREMD_URL)), 'fremder Link')
    # Quellen-/Personen-/Metadaten-Drift und vertauschte Quellenpakete (konsistent gehasht).
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['mitgliedschaften'][0].__setitem__(
        'quelleSha256', '0' * 64)), 'Quelldrift der Mitgliedschaft')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['personenquelle'].__setitem__(
        'sha256', '0' * 64)), 'Personenquellen-Drift')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q['ergebnisse'][0]['personenquelle'].__setitem__(
        'url', P2URL)), 'Personenquellen-URL-Drift')
    _erwarte_stv_fehler(lambda: _mit(lambda q: q.__setitem__('quellen', [q['quellen'][1], q['quellen'][0], q['quellen'][2]])),
                        'vertauschte Quellenpakete')
    gueltige_quittung, index_meta, index_links = _baue_quittung()
    (zusatz / f'{ADATEI}.meta.json').write_text(
        json.dumps(dict(_meta(ADATEI, A_URL), sha256='0' * 64), ensure_ascii=False), encoding='utf-8')
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(
        _eingang(gueltige_quittung), erwartung=ERW), 'Metadatum-Hash-Drift')

    def _frisch():
        """Stellt den synthetischen Standardstand wieder her und baut die Quittung neu."""
        global personen, kennung_zu_abruf
        _standard()
        personen = {K1: _person_abruf(K1, P1URL, PDATEI[K1]), K2: _person_abruf(K2, P2URL, PDATEI[K2])}
        kennung_zu_abruf = dict(personen)
        quittung, _, _ = _baue_quittung()
        return quittung

    def _rebind_quelle(quittung, datei, url, html):
        """Schreibt eine Quelle konsistent neu (Datei + Metadaten + Quittungshash)."""
        (zusatz / datei).write_text(html, encoding='utf-8')
        neu = json.loads(json.dumps(quittung))
        quelle_neu = _meta(datei, url)
        for quelle in neu['quellen']:
            if sv._kanonisch(quelle['url']) == sv._kanonisch(url):
                quelle.update(quelle_neu)
                break
        for ergebnis in neu['ergebnisse']:
            for mitgliedschaft in ergebnis['mitgliedschaften']:
                if mitgliedschaft['quelleUrl'] == url:
                    mitgliedschaft['quelleSha256'] = quelle_neu['sha256']
        return neu

    def _rebind_person(quittung, kennung, html):
        """Schreibt eine Personenseite konsistent neu (Datei + Abruf + Quittungshash)."""
        (detail / PDATEI[kennung]).write_text(html, encoding='utf-8')
        neu_abruf = _person_abruf(kennung, personen[kennung]['url'], PDATEI[kennung])
        neu = json.loads(json.dumps(quittung))
        for ergebnis in neu['ergebnisse']:
            if ergebnis['kennung'] == kennung:
                ergebnis['personenquelle'] = {
                    n: neu_abruf[n] for n in ('url', 'finalUrl', 'http', 'abrufStatus',
                                              'abgerufenAm', 'sha256', 'bytes', 'datei')}
                break
        kzu = dict(kennung_zu_abruf)
        kzu[kennung] = neu_abruf
        return neu, kzu

    # Inerte Inhalte: die amtliche Spalte liegt nur in einer Vorlage -> keine echte
    # Spalte; die konsistent neu gehashte Quittung haelt ihren alten Anspruch -> Sperre.
    neu = _rebind_quelle(_frisch(), ADATEI, A_URL, _ausschuss_html('Testausschuss A', [
        '<template>' + _spalte(['<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
                                + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + '</ul>']) + '</template>',
        _spalte(['<h6>CDU-Fraktion</h6><ul class="list-unstyled">'
                 + _li(P2, '/de/muster_bernd/22222', 'CDU-Fraktion') + '</ul>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'inerte Vorlage als Spalte', 'erwartet 3 belegte Stellvertretungen')
    # Echte H1 nur im Kommentar -> keine echte H1.
    neu = _rebind_quelle(_frisch(), BDATEI, B_URL,
                         '<html><body><!-- <h1>Testausschuss B</h1> --><p>Kein Beleg.</p></main></body></html>')
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'inerte H1 im Kommentar', 'genau eine echte H1')
    # Abschnittsausbruch: ul nicht unmittelbar nach h6 (dazwischen ein eigenes Element).
    neu = _rebind_quelle(_frisch(), BDATEI, B_URL, _ausschuss_html('Testausschuss B', [_spalte([
        '<h6>SPD-Fraktion</h6><p>Dazwischen</p><ul class="list-unstyled">'
        + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + '</ul>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'Abschnittsausbruch', 'jede h6-Gruppe braucht')
    # Doppelte Spalte.
    neu = _rebind_quelle(_frisch(), BDATEI, B_URL, _ausschuss_html('Testausschuss B', [
        _spalte(['<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
                 + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + '</ul>']),
        _spalte(['<h6>CDU-Fraktion</h6><ul class="list-unstyled">'
                 + _li(P2, '/de/muster_bernd/22222', 'CDU-Fraktion') + '</ul>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'doppelte Spalte', 'mehr als eine Stellvertretungsspalte')
    # Seite ohne Mitgliedschaftsliste: h5 vorhanden, aber keine eigene ul.
    neu = _rebind_quelle(_frisch(), BDATEI, B_URL,
                         _ausschuss_html('Testausschuss B', [_spalte(['<h6>SPD-Fraktion</h6>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'Seite ohne Mitgliedschaftsliste', 'jede h6-Gruppe braucht')
    # Doppelte Person im Original -> doppeltes (Profil, Ausschuss)-Paar.
    neu = _rebind_quelle(_frisch(), ADATEI, A_URL, _ausschuss_html('Testausschuss A', [_spalte([
        '<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
        + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion')
        + '</ul>',
        '<h6>CDU-Fraktion</h6><ul class="list-unstyled">'
        + _li(P2, '/de/muster_bernd/22222', 'CDU-Fraktion') + '</ul>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'doppelte Person/Paar', 'erwartet 3 belegte Stellvertretungen')
    # Nullfall: der Unterausschuss bekommt eine Spalte -> kein belegter Nullfall mehr.
    neu = _rebind_quelle(_frisch(), CDATEI, C_URL, _ausschuss_html(
        'Unterausschuss des Ausschusses für Haushaltskontrolle', [_spalte([
            '<h6>SPD-Fraktion</h6><ul class="list-unstyled">'
            + _li(P1, '/de/beispiel_anna/11111', 'SPD-Fraktion') + '</ul>'])]))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'kein belegter Nullfall', 'Spaltenzahl 1 weicht von der Quittung ab')
    # Konsistent neu gebundene Personenseite mit fremder H1 (Hash + Abruf angepasst).
    neu, kzu = _rebind_person(_frisch(), K1, _person_html('Fremde Person', 'SPD-Fraktion'))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu, kzu=kzu), erwartung=ERW),
                        'fremde H1 bei konsistentem Hash', 'Name passt nicht zur kanonischen H1')
    # Konsistent neu gebundene Personenseite mit fremder Fraktion (doc-subtitle).
    neu, kzu = _rebind_person(_frisch(), K1, _person_html(P1, 'CDU-Fraktion'))
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu, kzu=kzu), erwartung=ERW),
                        'fremde Fraktion bei konsistentem Hash', 'Fraktion/Fraktionslosigkeit passt nicht')
    # Orchestrator-Gegenproben: alle Hashes/Metadaten UND Mitgliedschaftsbelege
    # werden konsistent neu gebunden; nur die Inhaltsregel darf die Probe sperren.
    for was, mutation, grund in [
        ('versteckte H1', lambda h: h.replace('<h1>', '<h1 hidden>'), 'genau eine echte H1'),
        ('inerter H1-Text', lambda h: h.replace('>Testausschuss B</h1>', '><template>Testausschuss B</template></h1>'), 'leere Ausschuss-H1'),
        ('versteckte Spalte', lambda h: h.replace('<div class="col-12', '<div hidden class="col-12'), 'Spaltenzahl 0'),
        ('inerte Spalte', lambda h: h.replace('<div class="col-12', '<div inert class="col-12'), 'Spaltenzahl 0'),
        ('unsichtbare Spalte', lambda h: h.replace('<div class="col-12', '<div style="display: none" class="col-12'), 'Spaltenzahl 0'),
        ('versteckte Gruppe', lambda h: h.replace('<h6>', '<h6 aria-hidden="true">'), 'unmittelbar vorausgehende h6'),
        ('versteckte Person', lambda h: h.replace('<li>', '<li hidden>'), 'sichtbare li-Mitglieder'),
        ('inerter Name', lambda h: h.replace('>Anna Beispiel</strong>', '><template>Anna Beispiel</template></strong>'), 'leerer Name'),
        ('fremde Linkquery', lambda h: h.replace('/de/beispiel_anna/11111', '/de/beispiel_anna/11111?person=22222'), 'URL mit fremder Query'),
        ('fremdes Linkfragment', lambda h: h.replace('/de/beispiel_anna/11111', '/de/beispiel_anna/11111#fremd'), 'URL mit fremder Query'),
        ('falsche Listenart', lambda h: h.replace('class="list-unstyled"', 'class="navigation"'), 'unmittelbar vorausgehende h6'),
        ('Spalte ausserhalb main', lambda h: h.replace('<div class="row">', '</main><div class="row">').replace('</div></main>', '</div>'), 'kein direktes Kind'),
    ]:
        basis = _frisch()
        original = (zusatz / BDATEI).read_text(encoding='utf-8')
        neu = _rebind_quelle(basis, BDATEI, B_URL, mutation(original))
        _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW), was, grund)

    basis = _frisch()
    person_html = _person_html(P1, 'SPD-Fraktion').replace('<p role=', '<p hidden role=')
    neu, kzu = _rebind_person(basis, K1, person_html)
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu, kzu=kzu), erwartung=ERW),
                        'versteckte Fraktion', 'genau eine doc-subtitle')

    # Indexkarten in footer/ausserhalb main sind kein Inhaltsbeleg, selbst mit
    # konsistent geaendertem Original und ausdruecklich neu gebundener Erwartung.
    for was, mutation, grund in [
        ('Index ausserhalb main', lambda h: h.replace('<section class="teaser-grid">', '</main><section class="teaser-grid">').replace('</section></main>', '</section>'), 'eigener Index-Kartenbereich'),
        ('Index in Vorlage', lambda h: h.replace('<section class="teaser-grid">', '<template><section class="teaser-grid">').replace('</section>', '</section></template>'), 'eigener Index-Kartenbereich'),
        ('versteckter Indexname', lambda h: h.replace('<h6>', '<h6 hidden>', 1), 'eigenen h6-Namen'),
        ('falscher Ausschussname am Indexlink', lambda h: h.replace('Testausschuss A', 'Fremdausschuss'), 'Seiten-H1 passt nicht zum Ausschussnamen'),
    ]:
        neu = _frisch()
        original = (zusatz / INDEX_DATEI).read_text(encoding='utf-8')
        (zusatz / INDEX_DATEI).write_text(mutation(original), encoding='utf-8')
        neu['index'] = _meta(INDEX_DATEI, INDEX_URL)
        erwartung = dict(ERW, index=dict(neu['index']))
        _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=erwartung), was, grund)

    # Komplett vertauschte Ausschussseiten samt passenden neuen Quittungen und
    # Personenpaaren: der unveraenderte amtliche Index bindet URL an Ausschussnamen.
    _frisch()
    html_a, html_b = ((zusatz / datei).read_text(encoding='utf-8') for datei in (ADATEI, BDATEI))
    (zusatz / ADATEI).write_text(html_b, encoding='utf-8')
    (zusatz / BDATEI).write_text(html_a, encoding='utf-8')
    neu, _, _ = _baue_quittung()
    _erwarte_stv_fehler(lambda: sv.pruefe_stellvertretungen(_eingang(neu), erwartung=ERW),
                        'vollstaendig vertauschte Quellenpakete', 'Seiten-H1 passt nicht zum Ausschussnamen')

    # Gueltiges synthetisches Paket wiederhergestellt und akzeptiert.
    gueltige_quittung = _frisch()
    ERW['index'] = {n: index_meta[n] for n in ('url', 'finalUrl', 'http', 'abrufStatus',
                                               'abgerufenAm', 'sha256', 'bytes', 'datei')}
    index = sv.pruefe_stellvertretungen(_eingang(gueltige_quittung), erwartung=ERW)
    assert len(index) == 2 and sum(len(v['ausschuesse']) for v in index.values()) == 3
    assert index[K1]['gruppe'] == 'SPD-Fraktion' and index[K2]['gruppe'] == 'CDU-Fraktion'

print('PASS: Stellvertretungsquittung — fehlende Quittung/falsche Bilanz/Fremdkennung/unerwartetes '
      'Parlament/falsche Rolle/falscher Ausschuss/vertauschte Gruppe/fremder Name/fremder Link/'
      'Quellen- und Personenquellen-Drift/Metadatum-Drift/vertauschte Quellenpakete (konsistent '
      'gehasht)/inerte Vorlagen und Kommentar-H1/Abschnittsausbruch (ul nicht nach h6)/doppelte '
      'Spalte/doppelte Person/fehlende Mitgliedschaftsliste/fehlender Nullfall/konsistent neu '
      'gebundene fremde H1 und Fraktion sowie versteckte/inerte Belege, fremde URL-Parameter, '
      'Index-Ausbruch und vertauschte Quellseiten sperren fail closed; das gueltige synthetische Paket '
      '(Fixture ohne /private/tmp) wird akzeptiert.')


# ── 19 · Rohde-Einzelfallquittung (BMF-Aufgabe Bundeshaushalt, ein zuvor offener Fachachsenfall) ──
# Synthetische, deckungsgleiche Fixtures OHNE /private/tmp-Originale. Das eng fixierte
# Fachurteil wird ueber den injizierbaren ``erwartung``-Parameter ersetzt; so bleibt der
# Test auch ohne die lokalen Originale lauffaehig. Das Modul bindet die kanonische Person
# ueber echte H1 + eigenen Funktionstext (ohne Amtszeit) + JSON-LD-Gegenprobe, das Thema
# ausschliesslich aus Rohdes eigenem Kasten (Originalbytes nur ueber Hash/Bytezahl/Stand/
# Seite, KEIN PDF-Parser) und die amtliche Landingpage ueber den datierten v=32-Link.
ro_spec = importlib.util.spec_from_file_location(
    'rohde', Path(__file__).with_name('profil-feldbelege-500-rohde.py'))
ro = importlib.util.module_from_spec(ro_spec)
ro_spec.loader.exec_module(ro)


def _erwarte_ro_fehler(fn, was, meldung=None):
    try:
        fn()
    except ro.RohdeFehler as fehler:
        if meldung is not None:
            assert meldung in str(fehler), f"Falscher Sperrgrund: {fehler}"
        return
    raise AssertionError(f'Nicht gesperrt: {was}')


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    detail = root / 'detailseiten'
    detail.mkdir()
    zusatz = root / 'zusatzquellen'
    zusatz.mkdir()
    HOST_BMF = 'https://www.bundesfinanzministerium.de'
    ABRUF_PERSON = '2026-09-27T13:02:10+00:00'
    ABRUF_PDF = '2026-09-27T21:59:46+00:00'
    ABRUF_LAND = '2026-09-27T21:59:24+00:00'
    K = 'bundestag-test-rohde-1'
    person = 'Testperson Rohde'
    funktion = 'Teststaatssekretaer'
    amt = 'Parlamentarischer Staatssekretär beim Testministerium'
    aufgabenbindung = f'{amt}; Unterstützung in Angelegenheiten des Testhaushalts'
    thema = 'Testhaushalt'
    rolle_wortlaut = 'Parlamentarischer Staatssekretär Testperson Rohde'
    aufgabe_wortlaut = ('Unterstützung des Ministers bei der Erfüllung seiner Regierungsaufgaben, '
                        'insbesondere in Angelegenheiten des Testhaushalts')
    stand = '2026-08-03'
    person_url = 'https://www.bundestag.de/abgeordnete/biografien/T/test-rohde-1'
    person_datei = f'{K}.html'
    pdf_datei = 'test-organigramm.pdf'
    land_datei = 'test-abteilungen.html'
    pdf_url = f'{HOST_BMF}/Content/DE/Downloads/Ministerium/testorganigramm.pdf?__blob=publicationFile&v=32'
    land_url = f'{HOST_BMF}/Web/DE/Testministerium/abteilungen.html'
    pdf_href = '/Content/DE/Downloads/Ministerium/testorganigramm.pdf?__blob=publicationFile&v=32'
    linktext = 'Testorganisationsplan (Stand: 3. August 2026)'

    def _meta(datei, url, abruf):
        pfad = zusatz / datei
        meta = dict(url=url, finalUrl=url, abgerufenAm=abruf, sha256=ro.ZU._sha256(pfad),
                    bytes=pfad.stat().st_size, datei=datei, http=200)
        (zusatz / datei).with_suffix('.meta.json').write_text(
            json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return dict(meta, abrufStatus='abgerufen')

    def _person_html(h1=person, funktion_wert=funktion, rollen=None, script=True):
        rollen = rollen if rollen is not None else [
            {"@type": "Role", "roleName": "Mitglied des Bundestages", "startDate": "2025-03-25"}]
        jsonld = json.dumps({
            "@context": "https://schema.org", "@type": "ProfilePage",
            "mainEntity": {"@type": "Person", "@id": "#mdb", "name": person, "memberOf": rollen},
        }, ensure_ascii=False)
        h1_markup = f'<h1>{h1}</h1>' if h1 is not None else ''
        funktion_markup = (f'<div class="m-biography__function"><div><p>{funktion_wert}</p></div></div>'
                           if funktion_wert is not None else '')
        script_markup = (f'<script type="application/ld+json">{jsonld}</script>' if script else '')
        return f'<html><body>{h1_markup}{funktion_markup}{script_markup}</body></html>'

    def _landing_html(href=pdf_href, text=linktext, als_text=False, version=None):
        ziel = href
        if version is not None:
            ziel = href.replace('v=32', f'v={version}')
        if als_text:
            return f'<html><body><p>{_html_escape(ziel)} {text}</p></body></html>'
        return (f'<html><body><a href="{_html_escape(ziel)}" class="bmf-linkButton">'
                f'{text}</a></body></html>')

    def _html_escape(wert):
        return str(wert).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def _schreibe_person(dokument, abruf=ABRUF_PERSON):
        (detail / person_datei).write_text(dokument, encoding='utf-8')
        return dict(url=person_url, finalUrl=person_url, abgerufenAm=abruf,
                    sha256=ro.ZU._sha256(detail / person_datei),
                    bytes=(detail / person_datei).stat().st_size, datei=person_datei,
                    http=200, abrufStatus='abgerufen')

    def _schreibe_pdf(inhalt=b'%PDF-1.4 test', abruf=ABRUF_PDF):
        (zusatz / pdf_datei).write_bytes(inhalt)
        return dict(_meta(pdf_datei, pdf_url, abruf), stand=stand, seite=1)

    def _schreibe_landing(dokument, abruf=ABRUF_LAND):
        (zusatz / land_datei).write_text(dokument, encoding='utf-8')
        return dict(_meta(land_datei, land_url, abruf), linktext=linktext, href=pdf_href)

    def _fachurteil():
        return dict(methode='Manuelle Sichtprüfung des gerenderten Originals, kein automatischer PDF-Parservertrag',
                    seite=1, position='Oberste Amtsreihe, eigener Testkasten',
                    rolleWortlaut=rolle_wortlaut, aufgabeWortlaut=aufgabe_wortlaut,
                    ausschluss='Keine Nachbarkaesten (Steuerpolitik, Ostdeutschland), keine ganzen Abteilungen.')

    personenquelle = _schreibe_person(_person_html())
    pdf_quelle = _schreibe_pdf()
    land_quelle = _schreibe_landing(_landing_html())
    rollen_ref = dict(url=person_url, sha256=personenquelle['sha256'], abgerufenAm=ABRUF_PERSON)
    kennung_zu_abruf = {K: dict(personenquelle, amtlicheKennung=K, parlament='bundestag')}
    profilrollen = {K: dict(status='belegt', funktionen=[dict(wortlaut=funktion)], quelle=dict(rollen_ref))}
    mdB_rollen = [dict(roleName='Mitglied des Bundestages', startDate='2025-03-25', endDate=None)]
    erwartung = {
        K: dict(region='Bund', bindungsart='amtsaufgabe', person=person, funktion=funktion,
                funktionstext=funktion, amt=amt, aufgabenbindung=aufgabenbindung, themen=[thema],
                mdBRollen=[dict(rolle) for rolle in mdB_rollen], fachurteil=_fachurteil(),
                personenquelle=dict(personenquelle), quelle=dict(pdf_quelle),
                aktuelleVerlinkung=dict(land_quelle), rollenquelle=dict(rollen_ref)),
    }
    eintrag = dict(
        kennung=K, region='Bund', parlament='bundestag', status='belegt', bindungsart='amtsaufgabe',
        person=person, funktion=funktion, funktionstext=funktion, amt=amt,
        aufgabenbindung=aufgabenbindung, themen=[thema],
        ableitungsHinweis=ro.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung),
        amtsbeginn=None, amtsende=None, fachurteil=_fachurteil(),
        personenquelle=dict(personenquelle), quelle=dict(pdf_quelle),
        aktuelleVerlinkung=dict(land_quelle), rollenquelle=dict(rollen_ref), importfreigegeben=False,
    )
    gueltige_quittung = dict(version=1, bilanz=dict(gesamt=1, Bund=1, Berlin=0, Brandenburg=0),
                             ergebnisse=[eintrag])

    def _ro_eingang(quittung, rollen=None, abruf=None, ressort=None, aufgaben=None, beratende=None,
                    zusatz_kennungen=None, bmwsb=None, amthor=None, wahlausschuss=None, jarzombek=None,
                    kloeckner=None, stellvertretungen=None):
        return SimpleNamespace(
            verzeichnis=root, detailseiten=detail, rohde=quittung,
            profilrollen_by_kennung=rollen or profilrollen,
            kennung_zu_abruf=kennung_zu_abruf if abruf is None else abruf,
            ressortachsen_by_kennung={k: {} for k in (ressort or [])},
            aufgabenachsen_by_kennung={k: {} for k in (aufgaben or [])},
            beratendeachsen_by_kennung={k: {} for k in (beratende or [])},
            zusaetzlicheaufgaben_by_kennung={k: {} for k in (zusatz_kennungen or [])},
            bmwsb_by_kennung={k: {} for k in (bmwsb or [])},
            amthor_by_kennung={k: {} for k in (amthor or [])},
            wahlausschuss_by_kennung={k: {} for k in (wahlausschuss or [])},
            jarzombek_by_kennung={k: {} for k in (jarzombek or [])},
            kloeckner_by_kennung={k: {} for k in (kloeckner or [])},
            stellvertretungen_by_kennung={k: {} for k in (stellvertretungen or [])})

    index = ro.pruefe_rohde(_ro_eingang(gueltige_quittung), erwartung=erwartung)
    assert len(index) == 1
    assert index[K]['themen'] == [thema]
    assert index[K]['ableitungsHinweis'] == ro.ZU.HINWEIS_AUFGABE.format(region='Bund', wert=aufgabenbindung)
    assert index[K]['funktionstext'] == funktion

    def _mit(mutation, erwartung_override=None):
        neu = json.loads(json.dumps(gueltige_quittung))
        mutation(neu)
        return ro.pruefe_rohde(_ro_eingang(neu), erwartung=erwartung_override or erwartung)

    # Fehlende Quittung, falsche Bilanz, Duplikat/Fremdkennung.
    echter_pfad = ro.ROHDE
    ro.ROHDE = root / 'fehlt.json'
    try:
        _erwarte_ro_fehler(lambda: ro.pruefe_rohde(
            SimpleNamespace(verzeichnis=root, detailseiten=detail, profilrollen_by_kennung=profilrollen,
                            kennung_zu_abruf=kennung_zu_abruf), erwartung=erwartung), 'fehlende Quittung')
    finally:
        ro.ROHDE = echter_pfad
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['bilanz'].__setitem__('Bund', 0)), 'falsche Bilanz')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('kennung', 'bundestag-fremd-9')),
                       'unbekannte/Fremdkennung')
    # Disjunktion zu allen bisherigen Achsen.
    for feld in ('ressort', 'aufgaben', 'beratende', 'zusatz_kennungen', 'bmwsb', 'amthor',
                 'wahlausschuss', 'jarzombek', 'kloeckner', 'stellvertretungen'):
        _erwarte_ro_fehler(lambda f=feld: ro.pruefe_rohde(
            _ro_eingang(gueltige_quittung, **{f: [K]}), erwartung=erwartung), f'Kennung bereits {feld}-Achse')
    # Status/Region/Parlament/Bindungsart/Person/Importfreigabe/Amtszeit.
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('status', 'offen')), 'unerwarteter Status')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('region', 'Berlin')), 'falsche Region')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('parlament', 'landtag-berlin')), 'falsches Parlament')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('bindungsart', 'ressort')), 'falsche Bindungsart')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('person', 'Fremde Person')), 'fremde Person')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('importfreigegeben', True)), 'Importfreigabe gesetzt')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('amtsbeginn', '2025-03-25')),
                       'falscher PSts-Amtsbeginn aus der MdB-Role')
    _erwarte_ro_fehler(lambda: _mit(lambda q: q['ergebnisse'][0].__setitem__('amtsende', '2026-09-27')),
                       'falsches PSts-Amtsende')
    # Felddrift (Funktion/Funktionstext/Amt/Aufgabenbindung/Themen/Hinweis/Fachurteil).
    for feld, wert in (('funktion', 'Fremdrolle'), ('funktionstext', 'Fremdrolle'), ('amt', 'Fremdamt'),
                       ('aufgabenbindung', 'Fremde Aufgabenbindung'), ('themen', ['Fremdthema']),
                       ('ableitungsHinweis', 'Fremder Hinweis'), ('fachurteil', {'seite': 1})):
        _erwarte_ro_fehler(lambda f=feld, w=wert: _mit(lambda q: q['ergebnisse'][0].__setitem__(f, w)), f'Feld {feld} Drift')
    # Nur das eine freigegebene Thema; Nachbarkaesten und Generalisierungen sind gesperrt.
    _erwarte_ro_fehler(lambda: ro._pruefe_themen(
        dict(themen=['Steuerpolitik']), dict(aufgabeWortlaut='Steuerpolitik fuer alle.'), K),
        'Steuerpolitik aus Schrodis Kasten gesperrt')
    _erwarte_ro_fehler(lambda: ro._pruefe_themen(
        dict(themen=['Ostdeutschland']), dict(aufgabeWortlaut='Ostdeutschland foerdern.'), K),
        'Ostdeutschland aus Kaisers Kasten gesperrt')
    _erwarte_ro_fehler(lambda: ro._pruefe_themen(
        dict(themen=['Finanzpolitik']), dict(aufgabeWortlaut='Insbesondere Finanzpolitik.'), K),
        'generalisiertes Fremdthema gesperrt')
    # Quellen-/Metadatendrift (PDF).
    for feld, wert in (('url', f'{HOST_BMF}/Content/DE/Downloads/Ministerium/fremd.pdf?__blob=publicationFile&v=32'),
                       ('finalUrl', f'{HOST_BMF}/Content/DE/Downloads/Ministerium/fremd.pdf?__blob=publicationFile&v=32'),
                       ('sha256', '0' * 64), ('bytes', 1), ('abgerufenAm', '2026-01-01T00:00:00+00:00'),
                       ('datei', 'fremd.pdf'), ('stand', '2026-01-01'), ('seite', 2)):
        _erwarte_ro_fehler(lambda f=feld, w=wert: _mit(lambda q: q['ergebnisse'][0]['quelle'].__setitem__(f, w)),
                           f'PDF-Quelldrift {feld}')
    # Die Suchtreffer-Fassung v=41 ist nicht die verlinkte v=32-Adresse.
    echter_pdf = ro.ERWARTUNG['bundestag-rohde-dennis-1046814']['quelle']['url']
    assert ro._organigramm_version(echter_pdf, echter_pdf) == '32'
    assert ro._organigramm_version(echter_pdf.replace('v=32', 'v=41'), echter_pdf) == '41'
    _erwarte_ro_fehler(lambda: _mit(lambda q: (
        q['ergebnisse'][0]['quelle'].__setitem__('url', pdf_url.replace('v=32', 'v=41')),
        q['ergebnisse'][0]['quelle'].__setitem__('finalUrl', pdf_url.replace('v=32', 'v=41')))),
        'nicht massgebliche v=41-Adresse')
    # Landingpage: falsche Linkversion, falscher Stand/Linktext, nur Textvorkommen.
    for dokument, grund in (
        (_landing_html(version=41), 'v=41'),
        (_landing_html(text='Testorganisationsplan (Stand: 1. Januar 2020)'), 'datierte Linktext'),
        (_landing_html(als_text=True), 'verlinkt'),
        (_landing_html().replace('<a ', '<a hidden '), 'unsichtbarer Organigramm-Link'),
        (_landing_html().replace('<a ', '<a inert '), 'inerter Organigramm-Link'),
    ):
        neu_land = _schreibe_landing(dokument)
        neu_erwartung = json.loads(json.dumps(erwartung))
        neu_erwartung[K]['aktuelleVerlinkung'] = dict(neu_land)
        _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(dict(
            gueltige_quittung, ergebnisse=[dict(eintrag, aktuelleVerlinkung=dict(neu_land))])),
            erwartung=neu_erwartung), f'Landingpage {grund} gesperrt')
    _schreibe_landing(_landing_html())
    # PDF-Hash-/Metadrift gegen die fixierte Erwartung.
    fremd_pdf = _schreibe_pdf(b'%PDF-1.4 fremd')
    _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(dict(
        gueltige_quittung, ergebnisse=[dict(eintrag, quelle=dict(fremd_pdf))])), erwartung=erwartung),
        'konsistent neu gehashtes Fremd-PDF')
    _schreibe_pdf()
    # Vertauschte Quellenpakete: die PDF-Metadaten auf die Landingpage (und umgekehrt).
    _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(dict(
        gueltige_quittung, ergebnisse=[dict(eintrag, quelle=dict(land_quelle))])), erwartung=erwartung),
        'vertauschte Quellenpakete (PDF<->Landingpage)')
    # Inerte Personen-/Funktionsbelege und fremde Person/Rolle bei konsistenten Hashes.
    for dokument, was in (
        (_person_html(h1=None), 'Person ohne H1'),
        (_person_html(funktion_wert=None), 'Person ohne eigenen Funktionstext'),
        (_person_html(funktion_wert='Fremdrolle'), 'fremder Funktionstext bei konsistentem Hash'),
        (_person_html(h1='Fremde Person'), 'fremde H1 bei konsistentem Hash'),
        (_person_html().replace('<h1>', '<h1 hidden>'), 'unsichtbare H1 bei konsistentem Hash'),
        (_person_html().replace('<h1>', '<h1 style="display:none">'), 'per Stil unsichtbare H1'),
        (_person_html().replace('<body>', '<body><main inert>').replace('</body>', '</main></body>'),
         'inerter Vorfahr der Personenbelege'),
        (_person_html().replace('class="m-biography__function"',
                                'class="m-biography__function" hidden'), 'unsichtbarer Funktionstext'),
        (_person_html().replace('class="m-biography__function"',
                                'class="m-biography__function" aria-hidden="true"'),
         'aria-versteckter Funktionstext'),
        (_person_html().replace('"name": "Testperson Rohde"', '"name": "Fremde Person"'),
         'fremde JSON-LD-Person trotz korrekter H1'),
        (_person_html().replace('"@id": "#mdb"', '"@id": "#fremd"'),
         'fremde JSON-LD-Personenkennung'),
        (_person_html(rollen=[{"@type": "Role", "roleName": funktion, "startDate": "2025-03-25"}]),
         'PSts-Funktion darf keine JSON-LD-Amtsrolle mit Datum sein'),
    ):
        pq = _schreibe_person(dokument)
        rollen = {K: dict(status='belegt', funktionen=[dict(wortlaut=funktion)],
                          quelle=dict(url=person_url, sha256=pq['sha256'], abgerufenAm=ABRUF_PERSON))}
        abr = {K: dict(pq, amtlicheKennung=K, parlament='bundestag')}
        neu_erwartung = json.loads(json.dumps(erwartung))
        neu_erwartung[K]['personenquelle'] = dict(pq)
        _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(dict(
            gueltige_quittung, ergebnisse=[dict(eintrag, personenquelle=dict(pq))]),
            rollen=rollen, abruf=abr), erwartung=neu_erwartung), was)
    _schreibe_person(_person_html())
    # Vollstaendig vertauschte Quellen (PDF-Metadatum traegt den Landingpage-Hash) sperren.
    _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(dict(
        gueltige_quittung, ergebnisse=[dict(eintrag, quelle=dict(pdf_quelle, sha256=land_quelle['sha256']))])),
        erwartung=erwartung), 'PDF-Metadatum mit Landingpage-Hash')
    # Ungueltige/fehlende 54er-Rolle.
    _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(
        gueltige_quittung, rollen={K: dict(status='offen', funktionen=[], quelle=dict(rollen_ref))}),
        erwartung=erwartung), 'nicht belegte 54er-Rolle')
    _erwarte_ro_fehler(lambda: ro.pruefe_rohde(_ro_eingang(
        gueltige_quittung, rollen={K: dict(status='belegt', funktionen=[], quelle=dict(rollen_ref))}),
        erwartung=erwartung), '54er-Rolle ohne Wortlaut')
    # Das gueltige synthetische Paket wird akzeptiert.
    assert len(ro.pruefe_rohde(_ro_eingang(gueltige_quittung), erwartung=erwartung)) == 1

print('PASS: Rohde-Einzelfallquittung — fehlende Quittung/falsche Bilanz/Fremdkennung/Disjunktion zu '
      'Ressort-/Aufgaben-/beratender-/Zusatzaufgaben-/BMWSB-/Amthor-/Wahlausschuss-/Jarzombek-/'
      'Kloeckner-/Stellvertretungs-Achse/Status/Region/Parlament/Bindungsart/Person/Importfreigabe/'
      'falscher PSts-Amtsbeginn oder endDate/Felddrift (Funktion/Funktionstext/Amt/Aufgabenbindung/'
      'Themen/Hinweis/Fachurteil)/PDF-Quelldrift (URL/finalUrl/Hash/Bytezahl/Abrufzeit/Datei/Stand/'
      'Seite)/nicht massgebliche v=41-Fassung/Landingpage-Linkversion/-Stand/-Textvorkommen ohne Anker/'
      'konsistent neu gehashtes Fremd-PDF/vertauschte Quellenpakete/inerte Personen- und Funktionsbelege/'
      'fremde H1 oder fremder Funktionstext bei konsistenten Hashes/PSts-Rolle mit Datum im JSON-LD/'
      'nicht belegte oder wortlautlose 54er-Rolle/Nachbarkaesten Steuerpolitik und Ostdeutschland sowie '
      'generalisierte Fremdthemen sperren fail closed; das gueltige synthetische Paket (Fixture ohne '
      '/private/tmp) wird akzeptiert.')
