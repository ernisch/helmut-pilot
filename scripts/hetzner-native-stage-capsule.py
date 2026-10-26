#!/usr/bin/env python3
"""Encode one short-lived private Drive stage capsule. Never fetch a URL.

Uses the reviewed PR950 recipient-validator snapshot through the pinned bundle
writer. No default action, private-key import, generation, upload or native run.
"""
import argparse
import base64
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import stat
import subprocess
import sys
import time
import types
import urllib.parse

WRITER_SHA256 = '4a65ec1d7a2796608352f76767e52ef813e0c363d42982e70fda1a89a0ae6082'
SCOPE_SHA256 = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
PLAN_SHA256 = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
ROOT950_SHA256 = 'ab941ccf07e78c5f1b91c35ff383d652af42f989cab7700a0ceadba77e846c92'
FLAG = '--encode-approved-stage-capsule-once'
HOST = 'sdmntprpolandcentral.oaiusercontent.com'
HOSTS = frozenset(('sdmntpritalynorth.oaiusercontent.com',
    'sdmntprnortheu.oaiusercontent.com', 'sdmntprpolandcentral.oaiusercontent.com',
    'sdmntprukwest.oaiusercontent.com'))
PART_BYTES, MAX_CIPHER_BYTES = 16 * 1024**2, 1024**3
MAX_PARTS, MAX_JSON, MAX_BASE64 = 64, 65536, 48 * 1024
MAX_ENCRYPTED = MAX_BASE64 // 4 * 3


class Stop(Exception):
    pass


def need(value, code):
    if not value:
        raise Stop(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def hex_sha(value):
    return type(value) is str and re.fullmatch(r'[a-f0-9]{64}', value) is not None


def load_writer():
    path = Path(__file__).with_name('hetzner-native-source-bundle.py')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= 131072, 'WRITER_TYPE_OR_SIZE')
        chunks, total = [], 0
        while chunk := os.read(fd, 65536):
            total += len(chunk)
            need(total <= 131072, 'WRITER_TYPE_OR_SIZE')
            chunks.append(chunk)
        raw = b''.join(chunks)
        need(len(raw) <= 131072 and before == os.fstat(fd) == path.stat(follow_symlinks=False), 'WRITER_CHANGED')
    finally:
        os.close(fd)
    need(sha(raw) == WRITER_SHA256, 'WRITER_PIN')
    module = types.ModuleType('pinned_source_capsule_writer')
    module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def uri_expiry(url, created):
    need(type(url) is str and 0 < len(url) <= 4096 and url.isascii()
         and not any(ord(c) <= 32 or ord(c) == 127 or c == '\\' for c in url), 'URI_FORMAT')
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname
    need(url.startswith('https://') and parsed.scheme == 'https'
         and host in HOSTS and parsed.netloc in (host, host + ':443')
         and parsed.port in (None, 443) and parsed.username is None and parsed.password is None
         and not parsed.fragment
         and re.fullmatch(r'/files/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/raw', parsed.path),
         'URI_AUTHORITY_OR_PATH')
    pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    query = dict(pairs)
    need(len(query) == len(pairs) and query.get('sig') and query.get('se'), 'URI_SAS_FIELDS')
    value = query['se']
    need(re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z', value), 'URI_EXPIRY')
    expiry = int(datetime.datetime.fromisoformat(value[:-1] + '+00:00').timestamp())
    need(expiry - created >= 120, 'URI_LIFETIME')
    return expiry


def bundle_metadata(writer, path, expected_sha, fingerprint, response_sha):
    need(hex_sha(expected_sha) and Path(path).name == 'BUNDLE_RESULT.SAFE.json', 'BUNDLE_RECEIPT_PIN')
    parent, name = writer.parent_fd(path)
    try:
        for blocked in ('BUNDLE_RESULT.PENDING.SAFE.json', 'BUNDLE_FIRST_ERROR.PRIVATE.json', 'GPG_FIRST_ERROR.PRIVATE.json'):
            try:
                os.stat(blocked, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise Stop('BUNDLE_INCOMPLETE_OR_FAILED')
    finally:
        os.close(parent)
    raw = writer.read_noatime(path, 1024**2)
    need(sha(raw) == expected_sha, 'BUNDLE_RECEIPT_PIN')
    value = writer.json_unique(raw)
    need(value.get('schema') == 'helmut-source-encrypted-bundle-v1'
         and value.get('status') == 'ENCRYPTED_SCOPE_COMPLETE'
         and value.get('scope_sha256') == SCOPE_SHA256
         and value.get('recipient_fingerprint') == fingerprint
         and value.get('recipient_response_sha256') == response_sha
         and value.get('cipher') == 'AES256' and value.get('gpgCompression') == 'none'
         and value.get('archive') == 'tar+gzip'
         and type(value.get('matchedRegularFiles')) is int and value['matchedRegularFiles'] == 1767
         and type(value.get('matchedRegularBytes')) is int and value['matchedRegularBytes'] == 2865680705
         and type(value.get('matchedPythonMetadataEntries')) is int and value['matchedPythonMetadataEntries'] == 99
         and all(value.get(key) is False for key in ('transferPerformed', 'targetRestored', 'nativeStarted')),
         'BUNDLE_QUALIFICATION')
    need(hex_sha(value.get('cipherSHA256')) and hex_sha(value.get('compressedTarSHA256'))
         and type(value.get('cipherBytes')) is int and 0 < value['cipherBytes'] <= MAX_CIPHER_BYTES
         and type(value.get('compressedTarBytes')) is int and 0 < value['compressedTarBytes'] <= MAX_CIPHER_BYTES,
         'BUNDLE_SIZE_OR_HASH')
    parts = value.get('parts')
    need(type(parts) is list and 0 < len(parts) <= MAX_PARTS, 'BUNDLE_PART_COUNT')
    total = 0
    for index, part in enumerate(parts, 1):
        need(type(part) is dict and set(part) == {'name', 'bytes', 'sha256'}
             and part['name'] == 'SOURCE.tar.gz.gpg.part' + str(index).zfill(4)
             and type(part['bytes']) is int and 0 < part['bytes'] <= PART_BYTES
             and (index == len(parts) or part['bytes'] == PART_BYTES)
             and hex_sha(part['sha256']), 'BUNDLE_PART')
        total += part['bytes']
    need(total == value['cipherBytes'], 'BUNDLE_PART_TOTAL')
    return value


def capsule_value(bundle, uris, fingerprint, created):
    need(type(uris) is list and len(uris) == len(bundle['parts']), 'URI_COUNT')
    expiries, parts = [], []
    for index, (row, part) in enumerate(zip(uris, bundle['parts']), 1):
        need(type(row) is dict and set(row) == {'index', 'url'} and type(row['index']) is int
             and row['index'] == index, 'URI_INDEX')
        expiries.append(uri_expiry(row['url'], created))
        parts.append({'index': index, 'bytes': part['bytes'], 'sha256': part['sha256'], 'url': row['url']})
    return {'schema': 'helmut-private-drive-stage-capsule-v1', 'plan_sha256': PLAN_SHA256,
        'scope_sha256': SCOPE_SHA256, 'recipient_fingerprint': fingerprint,
        'case_id': secrets.token_hex(32), 'created_unix': created,
        'expires_unix': min(min(expiries), created + 300),
        'cipher_sha256': bundle['cipherSHA256'], 'cipher_bytes': bundle['cipherBytes'],
        'compressed_tar_sha256': bundle['compressedTarSHA256'],
        'compressed_tar_bytes': bundle['compressedTarBytes'], 'parts': parts}


def encrypt_capsule(writer, directory, output, fingerprint, public, raw):
    home = str(Path(output) / 'public-gpg-home')
    os.mkdir(home, 0o700)
    common = ['/usr/bin/gpg', '--no-options', '--batch', '--no-tty', '--no-autostart',
              '--homedir', home, '--no-default-keyring', '--no-auto-key-retrieve', '--auto-key-locate', 'clear']
    recipient_fd = writer.public_recipient_file(public, directory)
    process, selector = None, None
    encrypted, stderr_prefix, stderr_hash, stderr_bytes, sent = bytearray(), bytearray(), hashlib.sha256(), 0, 0
    code, completed = None, False
    try:
        process = subprocess.Popen([*common, '--rfc4880', '--force-mdc', '--trust-model', 'always',
            '--cipher-algo', 'AES256', '--compress-algo', 'ZLIB',
            '--recipient-file', '/proc/self/fd/' + str(recipient_fd),
            '--output', '-', '--encrypt'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=writer.ENV, start_new_session=True, close_fds=True, pass_fds=(recipient_fd,))
        copied_fd, recipient_fd = recipient_fd, None
        os.close(copied_fd)
        selector = selectors.DefaultSelector()
        for stream, event, kind in ((process.stdin, selectors.EVENT_WRITE, 'input'),
                                    (process.stdout, selectors.EVENT_READ, 'cipher'),
                                    (process.stderr, selectors.EVENT_READ, 'error')):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, event, kind)
        end = time.monotonic() + 30
        while selector.get_map():
            remaining = end - time.monotonic()
            need(remaining > 0, 'CAPSULE_GPG_TIMEOUT')
            events = selector.select(remaining)
            need(events, 'CAPSULE_GPG_TIMEOUT')
            for key, event in events:
                if key.data == 'input':
                    try:
                        count = os.write(key.fd, raw[sent:sent + 4096])
                    except BlockingIOError:
                        continue
                    need(count > 0, 'CAPSULE_GPG_INPUT')
                    sent += count
                    if sent == len(raw):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                else:
                    try:
                        chunk = os.read(key.fd, 4096)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fileobj)
                    elif key.data == 'cipher':
                        encrypted.extend(chunk)
                        need(len(encrypted) <= MAX_ENCRYPTED, 'CAPSULE_ENCRYPTED_SIZE')
                    else:
                        stderr_hash.update(chunk)
                        stderr_bytes += len(chunk)
                        stderr_prefix.extend(chunk[:max(0, 8192 - len(stderr_prefix))])
                        need(stderr_bytes <= 65536, 'CAPSULE_GPG_STDERR_BOUND')
        code = process.wait(timeout=max(.01, end - time.monotonic()))
        need(code == 0 and encrypted, 'CAPSULE_GPG_FAILED')
        completed = True
        return bytes(encrypted)
    except BaseException as error:
        # Even a hypothetical tool echo must not place signed URLs in diagnostics.
        clean = re.sub(rb'https?://[^\s]*', b'[REDACTED_URI]', bytes(stderr_prefix))
        clean = re.sub(rb'(?i)(?:sig|se)=[^\s]*', b'[REDACTED_SAS]', clean)
        try:
            writer.write_once(directory, 'CAPSULE_GPG_FIRST_ERROR.PRIVATE.json', {
                'status': 'FAIL_KEEP_PARTIALS_NO_RETRY', 'exceptionType': type(error).__name__,
                'code': str(error) if isinstance(error, Stop) else 'CAPSULE_GPG_FAILED',
                'errno': getattr(error, 'errno', None), 'returncode': code,
                'stderrBytesObserved': stderr_bytes, 'stderrSHA256': stderr_hash.hexdigest(),
                'stderrPrefixBase64': base64.b64encode(clean).decode('ascii')})
        except BaseException:
            pass
        if encrypted:
            try:
                write_raw(directory, 'STAGE_CAPSULE.PARTIAL.PRIVATE.pgp', bytes(encrypted))
            except BaseException:
                pass
        raise
    finally:
        if recipient_fd is not None:
            os.close(recipient_fd)
        if process is not None:
            try:
                if not completed:
                    writer.stop_process(process)
            finally:
                for stream in (process.stdin, process.stdout, process.stderr):
                    if stream is not None and not stream.closed:
                        stream.close()
        if selector is not None:
            selector.close()


def write_raw(directory, name, raw):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
    try:
        offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:])
            need(count > 0, 'CAPSULE_OUTPUT_SHORT_WRITE')
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(directory)


def publish(directory):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(directory, b'CAPSULE_RECEIPT.PENDING.SAFE.json', directory, b'CAPSULE_RECEIPT.SAFE.json', 1):
        raise OSError(ctypes.get_errno(), 'capsule-receipt-publication')


def encode_capsule(bundle_path, bundle_sha, response_path, response_sha, public_path, uris_path, output,
                   encryptor=encrypt_capsule, recipient_validator=None):
    writer, directory, phase = load_writer(), None, 'fresh-output'
    try:
        directory = writer.fresh_output(output)
        writer.write_once(directory, 'CAPSULE_ATTEMPT.SAFE.json', {'schema': 'helmut-stage-capsule-attempt-v1', 'scope_sha256': SCOPE_SHA256})
        phase = 'recipient'
        response_raw = writer.read_noatime(response_path, 256 * 1024)
        need(hex_sha(response_sha) and sha(response_raw) == response_sha, 'RECIPIENT_RESPONSE_PIN')
        response = writer.json_unique(response_raw)
        need(response['plan_sha256'] == PLAN_SHA256 and response['payload_sha256'] == ROOT950_SHA256
             and response['operation'] == 'recipient', 'ROOT950_RECIPIENT_BINDING')
        fingerprint, public = (recipient_validator or writer.validate_recipient_inputs)(response_path, response_sha, public_path)
        need(type(fingerprint) is str and re.fullmatch(r'[A-F0-9]{40}', fingerprint), 'RECIPIENT_FINGERPRINT')
        phase = 'bundle'
        bundle = bundle_metadata(writer, bundle_path, bundle_sha, fingerprint, response_sha)
        phase = 'uri-metadata'
        uris = writer.json_unique(writer.read_noatime(uris_path, MAX_JSON))
        created = int(time.time())
        value = capsule_value(bundle, uris, fingerprint, created)
        raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')
        need(len(raw) <= MAX_JSON, 'CAPSULE_JSON_SIZE')
        phase = 'encrypt'
        encrypted = encryptor(writer, directory, output, fingerprint, public, raw)
        encoded = base64.b64encode(encrypted)
        need(0 < len(encrypted) <= MAX_ENCRYPTED and len(encoded) <= MAX_BASE64, 'CAPSULE_ENCRYPTED_SIZE')
        phase = 'output'
        write_raw(directory, 'STAGE_CAPSULE.PRIVATE.b64', encoded)
        receipt = {'schema': 'helmut-stage-capsule-encoding-receipt-v1', 'status': 'ENCODED_NOT_SUBMITTED',
            'capsuleBase64SHA256': sha(encoded), 'capsuleBase64Bytes': len(encoded),
            'encryptedSHA256': sha(encrypted), 'encryptedBytes': len(encrypted),
            'bundleResultSHA256': bundle_sha, 'scope_sha256': SCOPE_SHA256,
            'recipient_fingerprint': fingerprint, 'case_id': value['case_id'],
            'created_unix': created, 'expires_unix': value['expires_unix'], 'parts': len(value['parts']),
            'cipher': 'AES256', 'integrity': 'RFC4880_MDC', 'compression': 'ZLIB',
            'urlsFetched': 0, 'submitted': False, 'nativeStarted': False}
        writer.write_once(directory, 'CAPSULE_RECEIPT.PENDING.SAFE.json', receipt)
        publish(directory)
        return receipt
    except BaseException as error:
        if directory is not None:
            try:
                writer.write_once(directory, 'CAPSULE_FIRST_ERROR.PRIVATE.json', {
                    'status': 'FAIL_KEEP_PARTIALS_NO_RETRY', 'phase': phase,
                    'code': str(error) if isinstance(error, Stop) else 'CAPSULE_FAILED',
                    'exceptionType': type(error).__name__, 'errno': getattr(error, 'errno', None)})
            except BaseException:
                pass
        raise
    finally:
        if directory is not None:
            try:
                os.close(directory)
            except OSError:
                pass


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] != FLAG:
        print('stage-capsule: NOT_EXECUTED_EXPLICIT_ONCE_FLAG_REQUIRED')
        return 2
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('bundle-result', 'bundle-result-sha256', 'recipient-response', 'recipient-response-sha256',
                 'recipient-public-key', 'part-uris', 'output'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(argv[1:])
    try:
        result = encode_capsule(args.bundle_result, args.bundle_result_sha256, args.recipient_response,
            args.recipient_response_sha256, args.recipient_public_key, args.part_uris, args.output)
        print('stage-capsule: ENCODED_NOT_SUBMITTED ' + result['capsuleBase64SHA256'])
        return 0
    except BaseException:
        print('stage-capsule: FAILED_KEEP_PARTIALS_NO_RETRY', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
