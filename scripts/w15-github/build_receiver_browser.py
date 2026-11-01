"""Build one NEW private offline HTML using the existing pinned vendor bytes."""
import argparse
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import re
import stat

ORIGINAL = {'bytes': 414252, 'sha256': '8b47e0a77621baf29c44271769f4a4bdd3f44933105007a4b08786391aee7bb3'}
WRAPPER = {'bytes': 3298, 'sha256': '753b8bdaad77d992ee21d0099dd43614ab367403c97ba1213d6206aa7b959714'}
DCF = {'cipher_sha256': '1d7c25d1041fdc91da2151f28cb15ca6d7944fc66107e7c236787c2fd62b77f5',
       'export_sha256': 'd671166bc1a8d387a85b07e1b63ce7aebf57d27458147321142cb3db9aa6f00d',
       'fingerprint': 'DCFD605ED28EEACA9B826105E769DE07A68BA8E4', 'openpgp_version': '6.3.2'}
MARKER = '\n\n\n(() => {'


def need(value):
    if not value: raise ValueError('OFFLINE_BROWSER_BUILD_REJECTED')


def directory(path):
    need(path.is_absolute() and str(path) != '/')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in str(path).split('/')[1:]:
            need(part not in ('', '.', '..'))
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        value = os.fstat(fd)
        need(value.st_uid == os.getuid() and stat.S_IMODE(value.st_mode) == 0o700)
        return fd
    except BaseException:
        os.close(fd); raise


def pinned_file(path, pin):
    parent = directory(path.parent)
    try: fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    finally: os.close(parent)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
             and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size == pin['bytes'])
        raw = os.read(fd, pin['bytes'] + 1)
        after = os.fstat(fd)
        need(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256']
             and (before.st_mtime_ns, before.st_ctime_ns) == (after.st_mtime_ns, after.st_ctime_ns))
        return raw
    finally: os.close(fd)


def token(text):
    return 'sha256-' + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()


def original_parts(raw):
    text = raw.decode('utf-8')
    scripts, styles = re.findall(r'<script>([\s\S]*?)</script>', text), re.findall(r'<style>([\s\S]*?)</style>', text)
    need(len(scripts) == len(styles) == 1 and scripts[0].count(MARKER) == 1)
    policy = html.unescape(re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', text)[1])
    need("script-src '" + token(scripts[0]) + "'" in policy and "style-src '" + token(styles[0]) + "'" in policy)
    vendor, old_app = scripts[0].split(MARKER)
    need(vendor.startswith('/*! OpenPGP.js v6.3.2') and 'LGPL' in vendor[:160])
    settings = json.loads(re.search(r'const settings = (\{[^\n]+\});', old_app)[1])
    need(all(settings.get(key) == value for key, value in DCF.items()))
    cipher = base64.b64decode(settings['cipher_base64'], validate=True)
    need(len(cipher) == 569 and hashlib.sha256(cipher).hexdigest() == DCF['cipher_sha256'])
    license_block = re.search(r'<details>[\s\S]*?</details>', text)[0]
    need('GNU LESSER GENERAL PUBLIC LICENSE' in license_block and '6.3.2' in license_block)
    return vendor, styles[0], license_block, settings['cipher_base64']


def build(original_file, wrapper_file, output_file):
    raw, wrapper = pinned_file(Path(original_file), ORIGINAL), pinned_file(Path(wrapper_file), WRAPPER)
    vendor, style, license_block, cipher = original_parts(raw)
    app = Path(__file__).with_name('receiver-browser.js').read_text()
    need(len(app.encode()) <= 20000 and '</script' not in app.lower())
    config = {'dcfCipherBase64': cipher, 'dcfCipherSHA256': DCF['cipher_sha256'], 'dcfExportSHA256': DCF['export_sha256'],
              'dcfFingerprint': DCF['fingerprint'], 'wrapperBase64': base64.b64encode(wrapper).decode(), 'wrapperSHA256': WRAPPER['sha256']}
    script = vendor + '\n' + app + '\nstartReceiverBrowser(' + json.dumps(config, separators=(',', ':')) + ');\n'
    policy = ("default-src 'none'; script-src '" + token(script) + "'; style-src '" + token(style) + "'; "
              "connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; "
              "worker-src 'none'; img-src 'none'; media-src 'none'")
    ui = '''<main><p><small>HELMUT · NUR LOKALER BESTEHENDER EMPFÄNGER</small></p><h1>Empfängerschlüssel sicher vorbereiten</h1>
<p>Internet kann ausgeschaltet bleiben. Diese Datei öffnet die bestehende verschlüsselte Sicherung ausschließlich im Browser. Sie lädt nichts hoch.</p>
<p>Nach erfolgreicher Prüfung erhältst du zwei private Textdateien für den geschützten GitHub-Schritt. Behandle sie wie Passwörter; nicht in Chat, E-Mail oder öffentliche Ablagen kopieren.</p>
<label for="passphrase">Separate Backup-Passphrase aus Bitwarden</label><input id="passphrase" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" disabled>
<button id="check" type="button" disabled>Bestehenden Empfänger lokal vorbereiten</button>
<section id="result" aria-live="polite"><p id="status">Lokalen Prüfer vorbereiten …</p>
<p><a id="key-download" class="download" hidden>1. Privaten Empfängerschlüssel speichern</a></p>
<p><a id="phrase-download" class="download" hidden>2. Private Empfängerpassphrase speichern</a></p>
<p><a id="report-download" class="download" hidden>SAFE-Prüfbeleg speichern</a></p></section>
<p><small>Nach dem Speichern Fenster schließen. Kein Originalarchiv, keine Datenbank und kein 500er-Lauf werden gestartet.</small></p></main>'''
    result = ('<!doctype html>\n<html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
              + html.escape(policy, quote=True) + '"><meta name="referrer" content="no-referrer">'
              '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Helmut · Empfänger offline vorbereiten</title><style>'
              + style + '</style></head><body>' + ui + license_block + '<script>' + script + '</script></body></html>\n').encode()
    need(len(result) < 500000)
    output = Path(output_file); parent = directory(output.parent)
    try:
        fd = os.open(output.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(result); stream.flush(); os.fsync(stream.fileno())
        os.fsync(parent)
    finally: os.close(parent)
    return {'status': 'PASS_NEW_PRIVATE_OFFLINE_BROWSER_BUILT_ONLY', 'bytes': len(result),
            'vendorUnchanged': True, 'originalsDecrypted': False, 'executionAuthority': False}


def main(argv=None):
    try:
        parser = argparse.ArgumentParser(allow_abbrev=False)
        parser.add_argument('--original-html', required=True); parser.add_argument('--wrapper-file', required=True)
        parser.add_argument('--output-html', required=True)
        args = parser.parse_args(argv)
        print(json.dumps(build(args.original_html, args.wrapper_file, args.output_html), separators=(',', ':')))
        return 0
    except Exception:
        print('{"status":"FAIL_PRIVATE_OFFLINE_BROWSER_BUILD","executionAuthority":false}')
        return 1


if __name__ == '__main__': raise SystemExit(main())
