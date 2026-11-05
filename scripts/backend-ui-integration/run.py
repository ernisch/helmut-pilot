"""Targeted joint UI/backend proof: disposable local store and loopback-only network."""
import argparse, base64, ctypes, errno, hashlib, json, os, pathlib, re, shutil, signal, socket, subprocess, sys, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parent.parent
NODE = shutil.which("node")
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot():
    names = subprocess.check_output(["git", "-C", str(SOURCE), "ls-files", "-z"]).decode().split("\0")
    return {f: digest(SOURCE / f) for f in names if f}
def process(pid):
    try:
        v = pathlib.Path('/proc', str(pid), 'stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'ppid': int(v[1]), 'start': v[19], 'state': v[0]}
    except (OSError, IndexError, ValueError): return None
def descendants():
    rows = {int(p.name): process(int(p.name)) for p in pathlib.Path('/proc').iterdir() if p.name.isdigit()}
    owned = {os.getpid()}
    while True:
        more = {pid for pid, v in rows.items() if v and v['ppid'] in owned} - owned
        if not more: break
        owned.update(more)
    return [rows[pid] for pid in owned if pid != os.getpid() and rows.get(pid)]
def cleanup():
    seen = descendants()
    for sig in [signal.SIGTERM, signal.SIGKILL]:
        for old in seen + descendants():
            current = process(old['pid'])
            if current and current['start'] == old['start'] and current['state'] != 'Z':
                try: os.kill(old['pid'], sig)
                except ProcessLookupError: pass
        time.sleep(.15)
    for _ in range(30):
        try:
            while os.waitpid(-1, os.WNOHANG)[0]: pass
        except ChildProcessError: pass
        if not descendants(): break
        time.sleep(.05)
    return {'seen': seen, 'remaining': descendants()}

assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--inside')
parser.add_argument('--views-only', action='store_true', help='Repeat only the two viewport checks after a visual-oracle change')
parser.add_argument('--cache-only', action='store_true', help='Only inspect a previously cached public UI upgrade')
parser.add_argument('--release', action='store_true', help='Only the final first-navigation cache upgrade and connected product paths')
args = parser.parse_args()
assert sum([args.views_only, args.cache_only, args.release]) <= 1
OUT = pathlib.Path(args.output).resolve()
if not args.inside:
    assert not OUT.exists(), 'Never overwrite a previous result'
    OUT.mkdir(parents=True)
    before = snapshot()
    for f in ['.env', '.env.local', '.helmut-data']:
        assert not (SOURCE / f).exists(), f
    runtime = OUT / 'runtime'
    runtime.mkdir()
    for f, sha in before.items():
        target = runtime / f
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE / f, target)
        assert digest(target) == sha
    (OUT / 'source-binding.json').write_text(json.dumps({'hashes': before, 'head': subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD']).decode().strip()}, indent=2))
    seeds = []
    legacy_ref = '76b75e371c7db69d7c9381071e23443182fc3607' if args.release else 'e054c0bb80fa4c330082bace3cfff6d9bb89a926'
    legacy_html = subprocess.check_output(['git', '-C', str(SOURCE), 'show', legacy_ref + ':index.html']).decode()
    if args.release:
        (OUT / 'legacy-sw.js').write_bytes(subprocess.check_output(['git', '-C', str(SOURCE), 'show', legacy_ref + ':sw.js']))
    for file, destination, mime in [('client.js', 'script', 'text/javascript'), ('styles.css', 'style', 'text/css')]:
        old = subprocess.check_output(['git', '-C', str(SOURCE), 'show', legacy_ref + ':' + file])
        html = legacy_html if args.release else (SOURCE / 'index.html').read_text()
        url = '/' + re.search(r'(?:src|href)="(' + re.escape(file) + r'[^\"]*)"', html).group(1)
        seeds.append({'file': file, 'url': url, 'destination': destination, 'mime': mime, 'base64': base64.b64encode(old).decode(), 'oldSha256': hashlib.sha256(old).hexdigest(), 'currentSha256': before[file]})
    (OUT / 'cache-upgrade-seed.json').write_text(json.dumps(seeds))
    for p in HERE.iterdir():
        if p.is_file(): shutil.copy2(p, OUT / p.name)
    browser_tmp = tempfile.mkdtemp(prefix='helmut-joint-')
    clean = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'Europe/Istanbul', 'TMPDIR': browser_tmp}
    code = None
    try:
        with (OUT / 'test.log').open('w') as log:
            child = subprocess.Popen(['unshare', '--user', '--map-root-user', '--net', sys.executable, '-I', str(HERE / 'run.py'), '--output', str(OUT), '--inside', os.readlink('/proc/self/ns/net')] + (['--views-only'] if args.views_only else []) + (['--cache-only'] if args.cache_only else []) + (['--release'] if args.release else []), cwd=SOURCE, env=clean, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try: code = child.wait(timeout=300)
            except subprocess.TimeoutExpired: code = 124
    finally:
        processes = cleanup()
        try:
            runtime_equal = all(digest(runtime / f) == sha for f, sha in before.items())
        except OSError:
            runtime_equal = False
        finally:
            shutil.rmtree(runtime)
            shutil.rmtree(browser_tmp)
        after = snapshot()
        (OUT / 'cleanup.json').write_text(json.dumps({'exit': code, 'sourceUnchanged': before == after, 'runtimeSourceUnchanged': runtime_equal, 'runtimeRemoved': not runtime.exists(), 'browserTempRemoved': not pathlib.Path(browser_tmp).exists(), 'processes': processes}, indent=2))
        assert before == after and runtime_equal and not processes['remaining']
    print((OUT / 'test.log').read_text()[-9000:])
    raise SystemExit(code if code is not None else 1)

assert os.readlink('/proc/self/ns/net') != args.inside
assert socket.if_nameindex() == [(1, 'lo')]
subprocess.run(['/usr/sbin/ip', 'link', 'set', 'lo', 'up'], check=True)
assert not pathlib.Path('/proc/net/route').read_text().splitlines()[1:]
for family, addr in [(socket.AF_INET, ('192.0.2.1', 443)), (socket.AF_INET6, ('2001:db8::1', 443))]:
    with socket.socket(family) as sock:
        sock.settimeout(1)
        assert sock.connect_ex(addr) in [errno.ENETUNREACH, errno.EADDRNOTAVAIL]
proof = {'parentNamespace': args.inside, 'testNamespace': os.readlink('/proc/self/ns/net'), 'interfaces': ['lo'], 'externalRoutes': 0, 'verifiedBeforeServer': True}
(OUT / 'network.json').write_text(json.dumps(proof, indent=2))
clean = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'Europe/Istanbul', 'TMPDIR': os.environ['TMPDIR'], 'HELMUT_JOINT_RUNTIME': str(OUT / 'runtime'), 'HELMUT_JOINT_OUTPUT': str(OUT), 'HELMUT_AUTH_MODE': 'accounts', 'HELMUT_STORAGE_BACKEND': 'local', 'HELMUT_STORE_CACHE_MS': '0', 'HELMUT_SOURCE_MODE': 'off', 'HELMUT_TESTLAUF_KOMMUNIKATION': 'gesperrt'}
if args.views_only: clean['HELMUT_JOINT_VIEWS_ONLY'] = '1'
if args.cache_only: clean['HELMUT_JOINT_CACHE_ONLY'] = '1'
code = 124
try:
    code = subprocess.run([NODE, str(OUT / 'runtime/scripts/lokal.js'), '--', NODE, str(HERE / ('release.cjs' if args.release else 'joint.cjs'))], cwd=OUT, env=clean, timeout=270).returncode
except subprocess.TimeoutExpired:
    (OUT / 'timeout.json').write_text(json.dumps({'scope': 'isolated-node', 'exit': code, 'seconds': 270}))
finally:
    (OUT / 'inner-cleanup.json').write_text(json.dumps(cleanup(), indent=2))
raise SystemExit(code)
