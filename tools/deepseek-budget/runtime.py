#!/usr/bin/env python3
"""Local DeepSeek budget gate. No prompts, API keys or model reasoning in ledger."""
import argparse, contextlib, datetime as dt, gzip, http.server, json, math, os, secrets
import signal, sqlite3, ssl, subprocess, sys, threading, time, urllib.error, urllib.request, uuid
from pathlib import Path

ROOT = Path.home() / '.codex-deepseek'
CONFIG = ROOT / 'budget.json'
DB = ROOT / 'budget.sqlite3'
UPSTREAM = 'https://api.deepseek.com'
MILLION = 1000000
MAX_BODY = 32 * 1024 * 1024
STREAM_TIMEOUT_SECONDS = 7200
PEAK_EXIT_CODE = 79
PEAK_MESSAGE = ('UTC-Peak-Sperre: Montag-Freitag 01:00-04:00 und 06:00-10:00 UTC '
                '(Tuerkei 04:00-07:00 und 09:00-13:00) startet keine neue autonome '
                'Helmut-KI-Arbeit. Kein Provider-Versand; geplante Automationen '
                'starten erst im naechsten Off-Peak-Fenster wieder.')
MODES = {f'{family}-{access}{suffix}': (model, effort, sandbox)
         for family, model in [('flash', 'deepseek-flash'), ('pro', 'deepseek-v4-pro')]
         for access, sandbox in [('read', 'read-only'), ('write', 'workspace-write')]
         for suffix, effort in [('', 'high'), ('-max', 'max')]}
GUARD = '''Arbeite ausschliesslich am uebergebenen lokalen Auftrag. Keine Production-Aktionen,
Production-Datenaenderungen, Migrationen, Umgebungsvariablenaenderungen, Commits,
Pushes, Merges, PRs oder Production-Modelltests. Keine weiteren Agenten starten.
Keine Secrets lesen, kopieren oder veraendern. Keine Vercel-Aenderungen.
Respektiere Repository-Regeln. Fertige Aufgabe sofort beenden; Budget ist kein
Ausgabenziel. Budgetkontrolle und Providerkonfiguration niemals umgehen/aendern.'''


def utcnow(): return dt.datetime.now(dt.timezone.utc)
def day(now=None): return (now or utcnow()).date().isoformat()
def micro(usd): return math.ceil(float(usd) * MILLION - 1e-8)


def peak(now=None):
    # Single source of truth for the peak tariff windows and the autonomous work block:
    # Monday-Friday exactly [01:00,04:00) and [06:00,10:00) UTC; weekends are off-peak.
    n = now or utcnow()
    return n.weekday() < 5 and (1 <= n.hour < 4 or 6 <= n.hour < 10)


class BudgetError(Exception):
    def __init__(self, code, message):
        super().__init__(message); self.code = code


def exit_code(failure):
    if failure.code == 'peak_blocked': return PEAK_EXIT_CODE
    return 78 if failure.code == 'daily_go_required' else 1


def config(path=CONFIG):
    c = json.loads(Path(path).read_text())
    if c['version'] != 1 or c['timezone'] != 'UTC' or c['daily_limit_usd'] != 10 or c['max_retries'] != 1:
        raise ValueError('Ungueltige Budgetkonfiguration')
    if c['retry_multiplier'] != 2 or c['provider_max_output_tokens'] != 393216 or c['provider_context_tokens'] != 1048576:
        raise ValueError('Ungueltige Wiederholungs-/Providergrenze')
    if set(c['output_tokens']) != {'high', 'max'} or any(type(v) is not int or not 65536 <= v <= 393216 for v in c['output_tokens'].values()):
        raise ValueError('Ausgabetoken muessen grosszuegig und innerhalb der Providergrenze liegen')
    for model in ('deepseek-flash', 'deepseek-v4-pro'):
        p = c['peak_rates_usd_per_million'][model]
        if set(p) != {'input', 'cached', 'output'} or any(type(v) not in (int, float) or not math.isfinite(v) or v <= 0 for v in p.values()):
            raise ValueError('Ungueltiger Tarif')
    if c['budgets_usd'] != {'flash-high': 2, 'flash-max': 3, 'pro-high': 4, 'pro-max': 5}:
        raise ValueError('Richtwerte duerfen nicht still geaendert werden')
    return c


def limit(c, date):
    approved = c.get('day_approvals', {}).get(date)
    if approved:
        if not approved.get('explicit_user_approval'):
            raise ValueError('Tageserhoehung braucht datierte ausdrueckliche Betreiberfreigabe')
        return micro(max(float(approved['usd']), c['daily_limit_usd']))
    return micro(c['daily_limit_usd'])


def rates(c, model, now=None, worst=False):
    p = c['peak_rates_usd_per_million'][model]
    n = now or utcnow()
    # Feiertage konservativ wie normale Wochentage; nie billiger schaetzen.
    factor = 1 if worst or peak(n) else 0.5
    return {k: v * factor for k, v in p.items()}


def cost(c, model, usage, now=None):
    i, o = usage['input_tokens'], usage['output_tokens']
    cached = usage.get('input_tokens_details', {}).get('cached_tokens', 0)
    if any(type(x) is not int or x < 0 for x in (i, o, cached)) or cached > i:
        raise ValueError('Unlesbare Verbrauchsquittung')
    p = rates(c, model, now)
    # USD/Mio.Tokens -> MikroUSD. Reasoning ist bereits in output_tokens enthalten.
    return math.ceil((i - cached) * p['input'] + cached * p['cached'] + o * p['output'])


class Ledger:
    def __init__(self, path=DB, read_only=False):
        self.path = str(path)
        self.read_only = read_only
        if read_only: return
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS requests(id TEXT, day TEXT, run TEXT,
              amount INTEGER NOT NULL CHECK(amount>=0), state TEXT NOT NULL,
              PRIMARY KEY(id,day));
            CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, ceiling INTEGER,
              retries INTEGER DEFAULT 0, reason TEXT);
            CREATE TABLE IF NOT EXISTS seeds(id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS flags(key TEXT PRIMARY KEY, value TEXT);
            ''')
        os.chmod(path, 0o600)

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(Path(self.path).resolve().as_uri() + "?mode=ro", uri=True, timeout=30, isolation_level=None) if self.read_only else sqlite3.connect(self.path, timeout=30, isolation_level=None)
        try: yield db
        finally: db.close()

    def new_run(self, ceiling):
        ident = str(uuid.uuid4())
        with self.connect() as db: db.execute('INSERT INTO runs VALUES (?,?,0,NULL)', (ident, ceiling))
        return ident

    def snapshot(self, date=None):
        date = date or day()
        with self.connect() as db:
            rows = db.execute('SELECT state,SUM(amount) FROM requests WHERE day=? GROUP BY state', (date,)).fetchall()
        return {'day': date, 'bound_micro_usd': sum(x[1] for x in rows), 'by_state': dict(rows)}

    def reserve(self, run, estimate, c, dates=None):
        dates = dates or [day(), day(utcnow() + dt.timedelta(days=1))]
        ident = str(uuid.uuid4())
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM flags WHERE key='frozen'").fetchone():
                db.rollback(); raise BudgetError('ledger_frozen', 'Kostenbuch ist wegen einer ungeklärten Abweichung gesperrt')
            ceiling = db.execute('SELECT ceiling FROM runs WHERE id=?', (run,)).fetchone()[0]
            # One request can be provisionally bound on two UTC dates; count once per run.
            used = db.execute('SELECT COALESCE(SUM(amount),0) FROM (SELECT MAX(amount) amount FROM requests WHERE run=? GROUP BY id)', (run,)).fetchone()[0]
            if used + estimate > ceiling:
                db.rollback(); raise BudgetError('run_budget', 'Aufrufbudget erreicht')
            for date in dates:
                used_day = db.execute('SELECT COALESCE(SUM(amount),0) FROM requests WHERE day=?', (date,)).fetchone()[0]
                if used_day + estimate > limit(c, date):
                    db.rollback()
                    raise BudgetError('daily_go_required', f'DeepSeek-Tagesbudget {limit(c,date)/MILLION:g} USD ({date}) reicht nicht (mit naechster Reservierung mindestens {(used_day+estimate)/MILLION:.6f} USD). Fuer ein hoeheres Tagesbudget ausdrueckliche Betreiberfreigabe anfordern; keine weitere kostenpflichtige Anfrage senden.')
            db.executemany('INSERT INTO requests VALUES (?,?,?,?,?)', [(ident, d, run, estimate, 'reserved') for d in dates])
            db.commit()
        return ident

    def settle(self, ident, amount, dates):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            rows = db.execute('SELECT day,amount FROM requests WHERE id=?', (ident,)).fetchall()
            if not rows or any(amount > r[1] for r in rows):
                db.execute("INSERT OR REPLACE INTO flags VALUES ('frozen','usage_over_reservation')"); db.commit(); raise BudgetError('usage_over_reservation', 'Verbrauch ueber Reservierung: Tarif/Tokenmodell pruefen; kein weiterer Lauf')
            if not set(dates).issubset({r[0] for r in rows}):
                db.execute("INSERT OR REPLACE INTO flags VALUES ('frozen','date_uncovered')"); db.commit(); raise BudgetError('date_uncovered', 'Nicht reservierter UTC-Tag; kein weiterer Lauf')
            for date, _ in rows:
                if date in dates: db.execute("UPDATE requests SET amount=?,state='spent' WHERE id=? AND day=?", (amount, ident, date))
                else: db.execute('DELETE FROM requests WHERE id=? AND day=?', (ident, date))
            db.commit()

    def release(self, ident):
        # Recalculate an unused reservation to zero and free it again.
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM requests WHERE id=?', (ident,))
            db.commit()

    def retry(self, run, c, reason):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            ceiling, retries = db.execute('SELECT ceiling,retries FROM runs WHERE id=?', (run,)).fetchone()
            if retries >= c['max_retries']:
                db.rollback(); return False
            db.execute('UPDATE runs SET ceiling=?,retries=retries+1,reason=? WHERE id=?',
                       (int(ceiling * c['retry_multiplier']), reason, run))
            db.commit()
        print(f'DeepSeek: einmalige Erweiterung wegen {reason}; neuer Laufdeckel {ceiling*c["retry_multiplier"]/MILLION:g} USD, Tagesdeckel bleibt wirksam.', file=sys.stderr, flush=True)
        return True

    def seed(self, ident, date, amount):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM seeds WHERE id=?', (ident,)).fetchone():
                db.execute('INSERT INTO seeds VALUES (?)', (ident,))
                db.execute('INSERT INTO requests VALUES (?,?,?,?,?)', (ident, date, 'historical', amount, 'historical'))
            db.commit()


def estimate(c, model, payload, output):
    p = rates(c, model, worst=True)
    # Entire serialized request incl. tools/instructions, plus protocol headroom.
    # Images/opaque state can expand: reserve full context for those requests.
    body = json.dumps(payload, ensure_ascii=False).encode()
    def opaque_input(value):
        if isinstance(value, dict):
            return value.get('type') in ('input_image', 'input_file', 'input_audio', 'input_video') or any(opaque_input(v) for v in value.values())
        return isinstance(value, list) and any(opaque_input(v) for v in value)
    opaque = opaque_input(payload.get('input')) or payload.get('previous_response_id')
    tokens = c['provider_context_tokens'] if opaque else min(c['provider_context_tokens'], len(body) + 8192)
    return math.ceil(tokens * p['input'] + output * p['output'])


class Gate:
    def __init__(self, c, ledger, mode, key, upstream=UPSTREAM):
        self.c, self.ledger, self.key, self.upstream = c, ledger, key, upstream
        self.model, self.effort, self.sandbox = MODES[mode]
        self.run = ledger.new_run(micro(c['budgets_usd'][('flash' if mode.startswith('flash') else 'pro') + '-' + self.effort]))
        self.token = secrets.token_urlsafe(32)
        self.failure = None
        self.output = c['output_tokens'][self.effort]
        self.lock = threading.Lock()

    def execute(self, payload, ping=lambda: None):
        if self.failure: raise self.failure
        if payload.get('model') != self.model:
            raise BudgetError('model_mismatch', 'Modellrouting darf nicht still wechseln')
        payload = dict(payload)
        payload['reasoning'] = {**payload.get('reasoning', {}), 'effort': self.effort}
        streaming = payload.get('stream', False)
        while True:
            payload['max_output_tokens'] = self.output
            now = utcnow()
            if peak(now):
                self.failure = BudgetError('peak_blocked', PEAK_MESSAGE)
                raise self.failure
            try:
                ident = self.ledger.reserve(self.run, estimate(self.c, self.model, payload, self.output), self.c,
                                            [day(now), day(now + dt.timedelta(days=1))])
            except BudgetError as e:
                if e.code == 'run_budget' and self.ledger.retry(self.run, self.c, 'Kostenlimit'):
                    continue  # Same pending request; completed tool work is never rerun.
                self.failure = e; raise
            if peak(utcnow()):
                # The clock moved into peak between reservation and send: free the
                # reservation and never contact the provider.
                self.ledger.release(ident)
                self.failure = BudgetError('peak_blocked', PEAK_MESSAGE)
                raise self.failure
            try:
                req = urllib.request.Request(self.upstream + '/responses', data=json.dumps(payload).encode(),
                    headers={'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})
                ctx = ssl.create_default_context(cafile='/etc/ssl/cert.pem' if Path('/etc/ssl/cert.pem').exists() else None)
                # Long High/Max reasoning responses can legitimately remain silent for
                # more than five minutes.  Keep the socket deadline aligned with the
                # explicit two-hour stream bound below and with Codex' idle timeout;
                # otherwise a local 300-second timeout leaves a real provider request
                # billed but only conservatively reserved in the ledger.
                with urllib.request.urlopen(req, context=ctx, timeout=STREAM_TIMEOUT_SECONDS) as response:
                    parts, terminal, size = [], None, 0
                    began = time.monotonic()
                    if streaming:
                        for line in response:
                            size += len(line)
                            if size > MAX_BODY or time.monotonic() - began > STREAM_TIMEOUT_SECONDS:
                                raise BudgetError('response_bound', 'Antwortgrenze erreicht; Reservierung bleibt gebunden')
                            parts.append(line); ping()
                            if line.startswith(b'data: '):
                                try: event = json.loads(line[6:])
                                except ValueError: continue
                                if event.get('type') in ('response.completed', 'response.incomplete', 'response.failed'):
                                    terminal = event['response']
                        body = b''.join(parts)
                    else:
                        body = response.read(MAX_BODY + 1)
                        if len(body) > MAX_BODY: raise BudgetError('response_bound', 'Antwort zu gross')
                        terminal = json.loads(body)
                if not terminal or not terminal.get('usage'):
                    raise BudgetError('usage_unknown', 'Keine eindeutige Verbrauchsquittung; Reservierung bleibt gebunden, kein automatischer Retry')
                end = utcnow()
                # Peak may change during generation: settle with the higher schedule.
                actual = max(cost(self.c, self.model, terminal['usage'], now), cost(self.c, self.model, terminal['usage'], end))
                dates = sorted(set([day(now), day(end)]))
                self.ledger.settle(ident, actual, dates)
                limited = terminal.get('status') == 'incomplete' and terminal.get('incomplete_details', {}).get('reason') == 'max_output_tokens'
                if limited and self.output < self.c['provider_max_output_tokens'] and self.ledger.retry(self.run, self.c, 'Tokenlimit'):
                    self.output = min(self.c['provider_max_output_tokens'], self.output * 2)
                    continue  # No partial output/tool calls have reached Codex.
                if limited:
                    raise BudgetError('token_limit_final', 'Tokenlimit nach einmaliger Erweiterung oder Providermaximum erreicht')
                return body, streaming
            except Exception as e:
                self.failure = e if isinstance(e, BudgetError) else BudgetError('upstream_unknown', f'Provider-/Transportfehler ({type(e).__name__}); ungeklaerte Kosten bleiben gebunden, kein automatischer Retry')
                raise self.failure


def server_for(gate):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_POST(self):
            if self.headers.get('Authorization') != 'Bearer ' + gate.token or self.path != '/responses':
                self.send_error(403); return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BODY: raise ValueError('Request size')
                raw = self.rfile.read(length)
                if self.headers.get('Content-Encoding') == 'gzip': raw = gzip.decompress(raw)
                if len(raw) > MAX_BODY: raise ValueError('Decoded request size')
                payload = json.loads(raw)
            except Exception:
                self.send_error(400); return
            stream = bool(payload.get('stream'))
            if stream:
                self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.end_headers()
            last_ping = [0]
            def ping():
                if stream and time.monotonic() - last_ping[0] > 5:
                    self.wfile.write(b': budget gate active\n\n'); self.wfile.flush(); last_ping[0] = time.monotonic()
            try:
                with gate.lock: body, _ = gate.execute(payload, ping)
                if not stream:
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(body); self.wfile.flush()
            except BudgetError as e:
                print(f'DeepSeek: {e}', file=sys.stderr, flush=True)
                if stream:
                    obj = {'type': 'response.failed', 'response': {'id': 'budget-gate', 'object': 'response', 'status': 'failed', 'error': {'code': e.code, 'message': str(e)}}}
                    try: self.wfile.write(('event: response.failed\ndata: ' + json.dumps(obj) + '\n\n').encode()); self.wfile.flush()
                    except OSError: pass
                else:
                    self.send_response(402); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({'error': {'code': e.code, 'message': str(e)}}).encode())
    return http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=[*MODES, 'status'])
    parser.add_argument('task', nargs='*')
    args = parser.parse_args()
    c = config(); ledger = Ledger(read_only=args.mode == "status")
    if args.mode == 'status':
        print(json.dumps({**ledger.snapshot(), 'daily_limit_micro_usd': limit(c, day()), 'config': str(CONFIG)}, ensure_ascii=False)); return 0
    if not args.task: parser.error('Aufgabe fehlt')
    key = subprocess.check_output(['security', 'find-generic-password', '-a', os.environ['USER'], '-s', 'helmut-deepseek-api-key', '-w'], stderr=subprocess.DEVNULL).decode().strip()
    gate = Gate(c, ledger, args.mode, key)
    server = server_for(gate)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    env = os.environ.copy(); env['CODEX_HOME'] = str(ROOT); env['DEEPSEEK_API_KEY'] = gate.token
    cmd = ['codex', 'exec', '-m', gate.model, '-c', 'model_reasoning_effort=' + json.dumps(gate.effort),
           '-c', 'model_providers.deepseek.base_url=' + json.dumps(f'http://127.0.0.1:{server.server_port}'),
           '-c', 'model_providers.deepseek.request_max_retries=0', '-c', 'model_providers.deepseek.stream_max_retries=0',
           '-c', f'model_providers.deepseek.stream_idle_timeout_ms={STREAM_TIMEOUT_SECONDS * 1000}',
           '--sandbox', gate.sandbox, GUARD + '\n\nAUFGABE:\n' + ' '.join(args.task)]
    print(f'DeepSeek {gate.model} {gate.effort}: Laufdeckel {c["budgets_usd"][("flash" if args.mode.startswith("flash") else "pro")+"-"+gate.effort]} USD, Tagesdeckel {limit(c,day())/MILLION:g} USD.', file=sys.stderr)
    try:
        result = subprocess.run(cmd, env=env)
    finally:
        server.shutdown(); server.server_close()
    print(json.dumps(ledger.snapshot()), file=sys.stderr)
    if gate.failure: return exit_code(gate.failure)
    return result.returncode


if __name__ == '__main__': sys.exit(main())
