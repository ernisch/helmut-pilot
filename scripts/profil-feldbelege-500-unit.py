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

print('PASS: Fraktionslosigkeit erhaelt belegte Partei; abweichender Parteienwert gesperrt; '
      'Quelldrift/Fremdkennung/Duplikat/unerwarteter Status/Konflikt und offen-bleibt-offen gesperrt.')
print('PASS: sonstige Gremien rollengetreu aus den Ausschuessen geloest (Ordentlich/Stellvertretend '
      'bleiben in funktionen, nicht in committee); unbekannter Ausschuss bleibt gesperrt; '
      'JSON-LD-URL-Drift, falscher Brandenburger Profillink, Fremdkennung, Hashdrift und fehlendes '
      'Wort Landesliste sperren fail closed; leere Achse bleibt offen.')
print('PASS: Rollenquittung — Fremdkennung/Duplikat/fehlende 54er-Quittung/falsche Bilanz/Quelldrift/'
      'erfundener Wortlaut/Zitat ausserhalb des Abschnitts/offener Eintrag mit Rolle sperren fail closed; '
      'nur der freigegebene Wortlaut wird dedupliziert an bestehende funktionen angehaengt, Gremienrolle bleibt.')
