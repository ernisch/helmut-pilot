"""Offline private continuity encryption/decryption; no network or Production access."""
import base64
import hashlib
import json
import os
import pathlib
import sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

RECIPIENT = '8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7'
PART_BYTES = 16 * 1024 * 1024
def sha(path):
    with pathlib.Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def encode(source, private_key_file, destination):
    source, destination = pathlib.Path(source), pathlib.Path(destination)
    key = serialization.load_pem_private_key(pathlib.Path(private_key_file).read_bytes(), None)
    public = key.public_key()
    der = public.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    assert hashlib.sha256(der).hexdigest() == RECIPIENT
    meta = {'version': 1, 'purpose': 'blocker2-private-continuity-no-private-key',
            'recipient': RECIPIENT, 'cipher': 'AES-256-GCM/RSA-OAEP-SHA256',
            'sourceBytes': source.stat().st_size, 'sourceSHA256': sha(source)}
    aad = json.dumps(meta, sort_keys=True, separators=(',', ':')).encode()
    aes = os.urandom(32)
    nonce = os.urandom(12)
    wrapped = public.encrypt(aes, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    encryptor = Cipher(algorithms.AES(aes), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(aad)
    destination.mkdir(mode=0o700, exist_ok=False)
    parts, output, size = [], None, 0
    def append(data):
        nonlocal output, size
        while data:
            if output is None or size == PART_BYTES:
                if output:
                    output.close()
                p = destination / f'continuity-{len(parts) + 1:04}.cipher'
                output = p.open('xb'); os.chmod(p, 0o600)
                parts.append({'name': p.name}); size = 0
            chunk, data = data[:PART_BYTES - size], data[PART_BYTES - size:]
            output.write(chunk); size += len(chunk)
    with source.open('rb') as f:
        while True:
            raw = f.read(1024 * 1024)
            if not raw:
                break
            append(encryptor.update(raw))
    append(encryptor.finalize())
    if output:
        output.close()
    for p in parts:
        path = destination / p['name']; p.update(bytes=path.stat().st_size, sha256=sha(path))
    result = {'meta': meta, 'aadBase64': base64.b64encode(aad).decode(),
              'nonce': base64.b64encode(nonce).decode(), 'authenticationTag': base64.b64encode(encryptor.tag).decode(),
              'wrappedKey': base64.b64encode(wrapped).decode(), 'parts': parts}
    manifest = destination / 'ENCRYPTED_BUNDLE_MANIFEST.json'
    manifest.write_text(json.dumps(result, indent=2) + '\n'); os.chmod(manifest, 0o600)
    print(json.dumps({'encryptedParts': len(parts), 'manifestSHA256': sha(manifest), 'privateKeyUploaded': False}))

def decode(manifest_file, private_key_file, destination):
    manifest_file, destination = pathlib.Path(manifest_file), pathlib.Path(destination)
    m = json.loads(manifest_file.read_text())
    assert m['meta']['version'] == 1 and m['meta']['recipient'] == RECIPIENT
    key = serialization.load_pem_private_key(pathlib.Path(private_key_file).read_bytes(), None)
    der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    assert hashlib.sha256(der).hexdigest() == RECIPIENT
    aad = json.dumps(m['meta'], sort_keys=True, separators=(',', ':')).encode()
    assert aad == base64.b64decode(m['aadBase64'], validate=True)
    aes = key.decrypt(base64.b64decode(m['wrappedKey'], validate=True), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    decryptor = Cipher(algorithms.AES(aes), modes.GCM(base64.b64decode(m['nonce'], validate=True), base64.b64decode(m['authenticationTag'], validate=True))).decryptor()
    decryptor.authenticate_additional_data(aad)
    temporary = destination.with_name(destination.name + '.unverified')
    assert not temporary.exists() and not destination.exists()
    try:
        with temporary.open('xb') as out:
            os.chmod(temporary, 0o600)
            for index, row in enumerate(m['parts'], 1):
                assert row['name'] == f'continuity-{index:04}.cipher' and 0 < row['bytes'] <= PART_BYTES
                path = manifest_file.parent / row['name']
                assert path.is_file() and not path.is_symlink() and path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
                with path.open('rb') as f:
                    while True:
                        raw = f.read(1024 * 1024)
                        if not raw:
                            break
                        out.write(decryptor.update(raw))
            out.write(decryptor.finalize())
        assert temporary.stat().st_size == m['meta']['sourceBytes'] and sha(temporary) == m['meta']['sourceSHA256']
        temporary.rename(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

if __name__ == '__main__':
    try:
        command, source, key, destination = sys.argv[1:]
        {'encode': encode, 'decode': decode}[command](source, key, destination)
    except Exception:
        print('blocker2-handoff-bundle-stopped', file=sys.stderr)
        sys.exit(1)
