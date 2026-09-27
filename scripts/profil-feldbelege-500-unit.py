"""Gezielte Gegenproben fuer die bei der Abnahme korrigierte Parteiabbildung."""
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('assembler', Path(__file__).with_name('profil-feldbelege-500.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / 'profil.html').write_text('<h1>Erika Muster, SPD</h1>')
    url = 'https://www.parlament-berlin.de/Abgeordnete/erika-muster'
    quelle = dict(url=url, finalUrl=url, abgerufenAm='2026-09-27T14:00:00Z',
                  sha256=m._sha256(root / 'profil.html'), bytes=(root / 'profil.html').stat().st_size,
                  datei='profil.html', http=200, abrufStatus='abgerufen', amtlicheKennung='erika-muster')
    profil = dict(vollname='Erika Muster', bundesland='Berlin', partei='SPD',
                  fraktionslos=True, wahlkreis='Mitte, Wahlkreis 1', ausschuesse=['Haushaltsausschuss'])
    extraktion = dict(profil=profil, quelle=quelle, offen=[], feldbelege={})
    eingang = SimpleNamespace(detailseiten=root, abruf_by_url={url: quelle}, extraktion_by_url={url: extraktion})
    auswahl = dict(url=url, text='Muster, Erika', fraktion='fraktionslos',
                   amtlicheKennung='erika-muster', parlament='landtag-berlin')
    result = m._baue_datensatz(eingang, auswahl)
    assert result['profil']['partei'] == 'SPD'
    assert result['profil']['fraktionslos'] is True
    assert 'fraktion' not in result['profil']
    assert result['importfreigegeben'] is False
    profil['partei'] = 'CDU'
    try:
        m._baue_datensatz(eingang, auswahl)
    except m.AssemblerFehler:
        pass
    else:
        raise AssertionError('Abweichende Partei wurde nicht gesperrt')
    (root / 'profil.html').write_text('<h1>Erika Muster</h1><p>parteilos<br />Amt</p><h2>Lebenslauf</h2>')
    eingang.partei_by_url = {url: dict(sha256=quelle['sha256'], status='offen')}
    auswahl['parlament'] = 'landtag-brandenburg'
    assert m._parteinachweis(eingang, auswahl, extraktion)['status'] == 'parteilos'
print('PASS: Fraktionslosigkeit erhaelt belegte Partei; abweichender Parteienwert gesperrt.')
