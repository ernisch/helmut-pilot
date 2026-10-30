"""Pinned existing Mock500 originals: GPG -> one gzip stream -> strict USTAR.

Library only. No network, secret discovery, admission authority or agent ownership.
The manifest is authenticated opaque provenance; its paths never select outputs.
Partial output remains private and is never returned after a failed reception.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tarfile
import threading
import zlib

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_mock_archive_receiver', HERE / 'receive.py')
R = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(R)
SPEC = importlib.util.spec_from_file_location('w15_mock_archive_recipient', HERE / 'verify_receiver_key.py')
V = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(V)
S = R.S
FINGERPRINT = V.FINGERPRINT
CIPHER = {'bytes': 17780398, 'sha256': 'f8447b6fdde4c2c4fa76a8322999bd844f0c4445ee6077b29e3d29f93359f414'}
MANIFEST = {'bytes': 6144, 'sha256': 'e07e4169abe3f41400900ff45e6f98d3dd18ee4ae5585f95e7fdcec98f960d7a'}
TOTAL = 217563454
# Immutable independent operator handoff. The missing historical Replacements pin
# is now supplied explicitly, never inferred from a filename or replacement data.
FILES = {
    'qualificationReport': ('ALL500_MOCK_BINDINGS_CHECK.SAFE.json', 13706128, 'd2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'),
    'qualifiedRows': ('QUALIFIED_ROWS.PRIVATE.json', 99566746, '22d4f73337178ec260c6d963f5539044f15e07d952aafc83e258cfdc4d267359'),
    'qualifiedFixtures': ('QUALIFIED_MOCK_FIXTURES.PRIVATE.json', 1895933, '548a5bd3e268be76a85ba8088c6993c0860b4f90659b47da1c76526cf486d9d1'),
    'qualifiedNative': ('QUALIFIED_NATIVE.PRIVATE.json', 53017, '986379885a2e7ea74de82d5075201183f8fc3837eec1f24c3ece4480561dee8b'),
    'qualifiedDerivations': ('QUALIFIED_DERIVATIONS.PRIVATE.json', 11391939, 'c19a56ea20ee4d05f8c6578b2bfe5af603fe89c0418df4fda7be085a1e19c261'),
    'currentReplacements': ('CURRENT_NATIVE_REPLACEMENTS.PRIVATE.json', 12969, '52ee2e82102434917d976ed248cdb772083d071be97e5465af4ae7b96368be29'),
    'package': ('ORIGINAL_PACKAGE.PRIVATE.json', 631359, '52b4a49c334a2d537f642cddf3f95d3eb6e6830e0f3b1b7280c8bd8fd3812f10'),
    'normalizedCurrentPolicy': ('NORMALIZED500_CURRENT_POLICY.PRIVATE.json', 89982254, '90e11a4228e2e568edf03c3feb9ea2c79e71449e68fdc6c563a3355f1fbaaa14'),
    'originalUPacket': ('ORIGINAL_U_PACKET.PRIVATE.json', 53018, '8d732cb88dc6df457b66682a45831e60b8ecdb28d92b35d4c1db4440991f2ed2'),
    'publicationPolicy': ('publication-policy.PRIVATE.json', 493, '274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'),
    'originalBuilderArchive': ('HELMUT_HANDOFF_20261016_MINIMAL.zip', 269598, 'c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15'),
}
PHASES = {'arguments', 'cipher', 'recipient', 'destination', 'decrypt', 'gzip', 'archive',
          'manifest', 'files', 'integrity', 'readback', 'cleanup'}
MAX_STATUS = 16384
MAX_COMPRESSED = 32 * 1024 * 1024


class ArchiveReceiveError(ValueError):
    def __init__(self, phase='arguments', *, process_stopped='UNKNOWN'):
        self.phase = phase if phase in PHASES else 'arguments'
        self.process_stopped = process_stopped
        super().__init__('MOCK500_ORIGINAL_ARCHIVE_REJECTED')


def need(value, phase):
    if not value: raise ArchiveReceiveError(phase)


def _pins():
    need(len(FILES) == 11 and sum(row[1] for row in FILES.values()) == TOTAL, 'arguments')
    result = {row[0]: {'bytes': row[1], 'sha256': row[2]} for row in FILES.values()}
    need(len(result) == 11 and 'MANIFEST.json' not in result, 'arguments')
    return {**result, 'MANIFEST.json': MANIFEST}


class GzipStream:
    """Bounded single-member gzip decoding, including CRC/trailer and source EOF."""
    def __init__(self, stream, maximum, guard):
        self.stream, self.maximum, self.guard = stream, maximum, guard
        self.decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        self.pending, self.buffer = b'', b''
        self.output = self.input = 0
        self.finished = False

    def read(self, size):
        need(type(size) is int and 0 < size <= S.CHUNK, 'gzip')
        while len(self.buffer) < size and not self.finished:
            self.guard()
            block = self.pending
            if not block:
                block = self.stream.read(S.CHUNK)
                self.input += len(block)
                need(self.input <= MAX_COMPRESSED and bool(block), 'gzip')
            try:
                out = self.decoder.decompress(block, min(S.CHUNK, self.maximum - self.output + 1))
            except zlib.error:
                raise ArchiveReceiveError('gzip') from None
            self.pending = self.decoder.unconsumed_tail
            self.output += len(out)
            need(self.output <= self.maximum, 'gzip')
            self.buffer += out
            if self.decoder.eof:
                need(not self.decoder.unused_data and not self.pending, 'gzip')
                self.guard()
                need(self.stream.read(1) == b'', 'gzip')
                self.finished = True
        result, self.buffer = self.buffer[:size], self.buffer[size:]
        self.guard()
        return result


def _extract(stream, root_fd, pins, guard):
    maximum = sum(512 + ((row['bytes'] + 511) // 512) * 512 for row in pins.values()) + 10240
    decoded = GzipStream(stream, maximum, guard)
    seen, total = set(), 0
    while True:
        header = decoded.read(512)
        need(len(header) == 512, 'archive')
        if header == b'\0' * 512:
            need(seen == set(pins), 'archive')
            tail = 512
            while block := decoded.read(S.CHUNK):
                need(not any(block), 'archive'); tail += len(block)
            need(1024 <= tail <= 10240 and tail % 512 == 0, 'archive')
            break
        # Parse only a physical USTAR header. tarfile iteration can silently
        # consume PAX/GNU pseudo-members, so it is deliberately not used here.
        need(header[257:265] == b'ustar\00000' and not any(header[345:500])
             and header[156:157] in (b'0', b'\0') and not any(header[157:257]), 'archive')
        try:
            member = tarfile.TarInfo.frombuf(header, 'utf-8', 'strict')
        except (tarfile.HeaderError, UnicodeError, ValueError):
            raise ArchiveReceiveError('archive') from None
        name = member.name
        need(name in pins and name not in seen and '/' not in name and '\\' not in name
             and header[:100] == name.encode('utf-8').ljust(100, b'\0')
             and member.size == pins[name]['bytes'], 'archive')
        seen.add(name)
        phase = 'manifest' if name == 'MANIFEST.json' else 'files'
        remaining = member.size
        def blocks():
            nonlocal remaining
            while remaining:
                guard(); block = decoded.read(min(S.CHUNK, remaining))
                need(bool(block), phase); remaining -= len(block); yield block
        need(R.write(root_fd, name, blocks()) == (pins[name]['bytes'], pins[name]['sha256']), phase)
        padding = (-member.size) % 512
        if padding:
            block = decoded.read(padding)
            need(len(block) == padding and not any(block), 'archive')
        if name != 'MANIFEST.json': total += member.size
    need(total == TOTAL, 'files')


def _status(raw):
    try: rows = raw.decode('ascii').splitlines()
    except UnicodeError: raise ArchiveReceiveError('integrity') from None
    keys = [row.split()[3] for row in rows if row.startswith('[GNUPG:] DECRYPTION_KEY ') and len(row.split()) == 5]
    need(keys == [FINGERPRINT] and rows.count('[GNUPG:] DECRYPTION_OKAY') == 1
         and rows.count('[GNUPG:] GOODMDC') == 1
         and not any(row.startswith(('[GNUPG:] BADMDC', '[GNUPG:] DECRYPTION_FAILED', '[GNUPG:] ERROR',
                                     '[GNUPG:] FAILURE', '[GNUPG:] NODATA')) for row in rows), 'integrity')


def receive(cipher, *, destination, private_home, passphrase_file, guard):
    """Return PRIVATE paths only after authenticated EOF and complete readback.

    The caller imported and checked the existing recipient and owns its agent.
    A failure retains its first phase even if terminating GPG also fails.
    """
    phase, failure, answer = 'arguments', None, None
    cipher_fd = home_fd = pass_fd = parent_fd = root_fd = status_fd = None
    process = timer = None
    stopped = 'UNKNOWN'
    try:
        need(callable(guard), phase); pins = _pins(); guard()
        phase = 'cipher'
        cipher_fd, cipher_before = R.private_open(cipher)
        need(cipher_before[2] == CIPHER['bytes'] and S._hash_fd(cipher_fd, guard) ==
             (CIPHER['bytes'], CIPHER['sha256']) and S._snapshot(os.fstat(cipher_fd)) == cipher_before, phase)
        os.lseek(cipher_fd, 0, os.SEEK_SET)
        phase = 'recipient'
        home_fd = S._directory(private_home, private=True)
        home_before = os.fstat(home_fd)
        pass_fd, pass_before = R.private_open(passphrase_file)
        need(0 < pass_before[2] <= 4096, phase)
        base = [arg for arg in S._gpg_base(private_home) if arg != '--no-autostart'] + ['--disable-dirmngr']
        listed = subprocess.run(base + ['--with-colons', '--fingerprint', '--list-keys'],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env=S._gpg_env(), timeout=30, close_fds=True)
        need(listed.returncode == 0, phase); V.primary(listed.stdout, 'pub')
        phase = 'destination'
        destination = S._absolute(destination)
        parent_fd = S._directory(os.path.dirname(destination), private=True)
        os.mkdir(os.path.basename(destination), 0o700, dir_fd=parent_fd)
        root_fd = os.open(os.path.basename(destination), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
        status_fd = os.open('GPG.PRIVATE.status', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root_fd)
        phase = 'decrypt'; guard()
        process = subprocess.Popen(base + ['--pinentry-mode', 'loopback', '--passphrase-fd', str(pass_fd),
            '--status-fd', str(status_fd), '--decrypt'], stdin=cipher_fd, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, pass_fds=(pass_fd, status_fd), env=S._gpg_env(), bufsize=0, close_fds=True)
        timer = threading.Timer(180, process.kill); timer.daemon = True; timer.start()
        phase = 'archive'
        _extract(process.stdout, root_fd, pins, guard)
        phase = 'integrity'
        need(process.wait(timeout=15) == 0, phase)
        stopped = 'PASS'
        os.fsync(status_fd); os.lseek(status_fd, 0, os.SEEK_SET)
        status = os.read(status_fd, MAX_STATUS + 1)
        need(0 < len(status) <= MAX_STATUS, phase); _status(status)
        need(S._snapshot(os.fstat(cipher_fd)) == cipher_before
             and S._snapshot(os.fstat(pass_fd)) == pass_before, phase)
        checked_home = S._directory(private_home, private=True)
        try:
            observed_home = os.fstat(checked_home)
            need((observed_home.st_dev, observed_home.st_ino) == (home_before.st_dev, home_before.st_ino), phase)
        finally: os.close(checked_home)
        phase = 'readback'
        for name, pin in pins.items():
            guard(); S._verify_file(root_fd, {'path': name, **pin}, guard=guard)
        os.fsync(root_fd); os.fsync(parent_fd)
        answer = {'asset_paths': {key: Path(destination) / row[0] for key, row in FILES.items()},
            'safe_receipt': {'status': 'PASS_MOCK500_ORIGINAL_ARCHIVE_BYTES_ONLY', 'verifiedFiles': 11,
                'verifiedBytes': TOTAL, 'cipherBytes': CIPHER['bytes'], 'cipherSHA256': CIPHER['sha256'],
                'manifestBytes': MANIFEST['bytes'], 'manifestSHA256': MANIFEST['sha256'],
                'recipientFingerprint': FINGERPRINT, 'gzipUSTARVerified': True,
                'allOriginalSizesAndHashesVerified': True, 'fullPrivateReadbackVerified': True,
                'gpgIntegrityVerified': True, 'gpgProcessStopped': 'PASS',
                'executionAuthority': False, 'testStarted': False, 'mock500Acceptance': False}}
    except BaseException as error:
        failure = error.phase if isinstance(error, ArchiveReceiveError) else phase
    finally:
        if timer is not None: timer.cancel()
        if process is not None:
            try:
                if process.poll() is None: process.kill()
                process.stdout.close()
                process.wait(timeout=15)
                stopped = 'PASS'
            except BaseException:
                stopped = 'UNKNOWN'; failure = failure or 'cleanup'
        for fd in (status_fd, root_fd, parent_fd, pass_fd, home_fd, cipher_fd):
            if fd is not None:
                try: os.close(fd)
                except OSError: failure = failure or 'cleanup'
    if failure is not None or answer is None:
        raise ArchiveReceiveError(failure or phase, process_stopped=stopped) from None
    return answer
