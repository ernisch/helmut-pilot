"""Fake pinned HTML/vendor bytes: no actual key, decryption or vendor retest."""
import base64
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('receiver_builder_test', Path(__file__).with_name('build_receiver_browser.py'))
B = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B)


def pin(raw): return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class BrowserBuilderChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.vendor = '/*! OpenPGP.js v6.3.2 LGPL fictional unchanged vendor */\nvar openpgp={};'
        cipher = b'c' * 569
        self.dcf = {**B.DCF, 'cipher_sha256': hashlib.sha256(cipher).hexdigest()}
        settings = {**self.dcf, 'cipher_base64': base64.b64encode(cipher).decode()}
        script = self.vendor + B.MARKER + '\nconst settings = ' + json.dumps(settings) + ';\n})();'
        style = 'body{color:black}'
        policy = "default-src 'none'; script-src '" + B.token(script) + "'; style-src '" + B.token(style) + "'"
        self.license = '<details>OpenPGP.js 6.3.2<pre>GNU LESSER GENERAL PUBLIC LICENSE</pre></details>'
        self.original = ('<meta http-equiv="Content-Security-Policy" content="' + html.escape(policy, quote=True) + '">'
                         '<style>' + style + '</style>' + self.license + '<script>' + script + '</script>').encode()
        self.wrapper = b'fake-encrypted-wrapper'
        self.source, self.cipher, self.output = self.root / 'original.html', self.root / 'wrapper.pgp', self.root / 'new.html'
        for file, raw in ((self.source, self.original), (self.cipher, self.wrapper)):
            file.write_bytes(raw); file.chmod(0o600)
        self.addCleanup(patch.stopall)
        patch.object(B, 'ORIGINAL', pin(self.original)).start()
        patch.object(B, 'WRAPPER', pin(self.wrapper)).start()
        patch.object(B, 'DCF', self.dcf).start()

    def test_vendor_and_license_unchanged_new_strict_csp_matches_actual_bytes(self):
        result = B.build(str(self.source), str(self.cipher), str(self.output))
        text = self.output.read_text()
        script = re.search(r'<script>([\s\S]*?)</script>', text)[1]
        style = re.search(r'<style>([\s\S]*?)</style>', text)[1]
        policy = html.unescape(re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', text)[1])
        self.assertTrue(script.startswith(self.vendor + '\n'))
        self.assertIn(self.license, text)
        for kind, value in (('script-src', script), ('style-src', style)):
            self.assertIn(kind + " '" + B.token(value) + "'", policy)
        for directive in ('default-src', 'connect-src', 'form-action', 'base-uri', 'object-src', 'frame-src', 'worker-src', 'img-src', 'media-src'):
            self.assertIn(directive + " 'none'", policy)
        self.assertNotIn('unsafe-inline', policy); self.assertIn('name="referrer" content="no-referrer"', text)
        self.assertNotIn('challenge_base64', text)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        self.assertLess(result['bytes'], 500000)
        self.assertEqual(self.source.read_bytes(), self.original)
        with self.assertRaises(FileExistsError): B.build(str(self.source), str(self.cipher), str(self.output))

    def test_wrong_pin_original_csp_or_dcf_metadata_refuses_output(self):
        self.cipher.write_bytes(b'wrong')
        with self.assertRaises(ValueError): B.build(str(self.source), str(self.cipher), str(self.output))
        self.assertFalse(self.output.exists())
        for changed in (self.original.replace(b'sha256-', b'broken-', 1), self.original.replace(b'6.3.2', b'6.3.1', 1)):
            with self.assertRaises(ValueError): B.original_parts(changed)

    def test_links_public_modes_and_output_overwrite_are_rejected(self):
        self.source.chmod(0o644)
        with self.assertRaises(ValueError): B.pinned_file(self.source, B.ORIGINAL)
        self.source.chmod(0o600)
        link = self.root / 'link.html'; link.symlink_to(self.source)
        with self.assertRaises(OSError): B.pinned_file(link, B.ORIGINAL)


if __name__ == '__main__': unittest.main()
