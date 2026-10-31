"""Private local attempt accounting around the existing dispatch POST, no retries.

The caller retains independently checked receipts. UNKNOWN reservations stay
consumed and block the chain; this module never infers a successful run or GO.
"""
import sys
sys.dont_write_bytecode = True
import fcntl
import json
import os
from pathlib import Path
import re
import uuid

SCHEMA = 'helmut-w15-functional-chain/1'
CONTRACT = 'helmut-w15-isolated-functional/1'
SHA = re.compile('[0-9a-f]{64}')
HEAD = re.compile('[0-9a-f]{40}')

def need(value):
    if not value: raise ValueError('FUNCTIONAL_CHAIN_REJECTED')

class Chain:
    def __init__(self, directory, chain_id):
        self.root = Path(directory)
        need(self.root.is_absolute() and '..' not in self.root.parts
             and str(uuid.UUID(chain_id)) == chain_id)
        self.root.mkdir(mode=0o700, parents=False, exist_ok=True)
        need(not self.root.is_symlink() and self.root.stat().st_uid == os.getuid()
             and self.root.stat().st_mode & 0o777 == 0o700)
        self.chain_id = chain_id

    def change(self, operation, *, persist=True):
        lock = os.open(self.root/'chain.lock', os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX)
            path = self.root/'CHAIN.SAFE.json'
            if path.exists():
                fd = os.open(path, os.O_RDONLY|os.O_NOFOLLOW)
                with os.fdopen(fd) as stream: record = json.load(stream)
            else:
                record = dict(schema=SCHEMA, chainId=self.chain_id, resourceContract=CONTRACT,
                    maxAttempts=3, maxStorageCents=15, attempts=[])
            need(record['schema'] == SCHEMA and record['chainId'] == self.chain_id
                 and record['resourceContract'] == CONTRACT and record['maxAttempts'] == 3
                 and record['maxStorageCents'] == 15)
            result = operation(record)
            if not persist: return result
            raw = json.dumps(record, sort_keys=True, separators=(',', ':')).encode()
            temp = self.root/('CHAIN-'+str(uuid.uuid4())+'.tmp')
            fd = os.open(temp, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream: stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            os.replace(temp, path)
            directory = os.open(self.root, os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try: os.fsync(directory)
            finally: os.close(directory)
            return result
        finally: os.close(lock)

    def reserve(self, stage, commit, nonce, binding_sha, review_sha, ci_sha, *, correction=None, _preview=False):
        need(type(_preview) is bool and stage in ('end500', 'mock500') and HEAD.fullmatch(commit)
             and str(uuid.UUID(nonce)) == nonce
             and all(type(x) is str and SHA.fullmatch(x) for x in (binding_sha, review_sha, ci_sha)))
        def operation(record):
            rows = record['attempts']; need(len(rows) < 3)
            need(all(row['nonce'] != nonce for row in rows))
            if rows:
                last = rows[-1]
                need(last['status'] in ('PASS', 'FAIL') and last['processesStopped'] is True)
                if last['status'] == 'FAIL':
                    need(not any(row['corrected'] for row in rows) and stage == last['stage']
                         and commit != last['commit'] and type(correction) is dict
                         and set(correction) == {'causeProofSHA256','targetedTestsSHA256'}
                         and all(type(x) is str and SHA.fullmatch(x) for x in correction.values()))
                else: need(stage == 'mock500' and last['stage'] == 'end500' and correction is None)
            else: need(stage == 'end500' and correction is None)
            if stage == 'mock500':
                need(any(row['stage']=='end500' and row['status']=='PASS'
                         and SHA.fullmatch(row['independentAcceptanceSHA256']) for row in rows))
            row = dict(index=len(rows)+1, stage=stage, commit=commit, nonce=nonce,
                bindingSHA256=binding_sha, reviewSHA256=review_sha, ciSHA256=ci_sha,
                corrected=correction is not None, correction=correction,
                reservedStorageCents=5, artifactCountMaximum=1, retentionDays=1,
                status='UNKNOWN', runId='UNKNOWN', processesStopped='UNKNOWN',
                independentAcceptanceSHA256='UNKNOWN')
            rows.append(row); return dict(row)
        return self.change(operation, persist=not _preview)

    def preview(self, *args, **kwargs):
        need("_preview" not in kwargs)
        return self.reserve(*args, **kwargs, _preview=True)

    def bind_run(self, nonce, run_id):
        need(type(run_id) is str and re.fullmatch('[1-9][0-9]{4,19}', run_id))
        def operation(record):
            row = record['attempts'][-1]
            need(row['nonce'] == nonce and row['runId'] == 'UNKNOWN' and row['status'] == 'UNKNOWN')
            need(not any(x['runId'] == run_id for x in record['attempts'][:-1]))
            row['runId'] = run_id
        return self.change(operation)

    def finish(self, nonce, status, receipt_sha, *, processes_stopped, independent_acceptance_sha):
        need(status in ('PASS','FAIL') and processes_stopped is True
             and SHA.fullmatch(receipt_sha) and SHA.fullmatch(independent_acceptance_sha))
        def operation(record):
            row = record['attempts'][-1]
            need(row['nonce'] == nonce and row['runId'] != 'UNKNOWN' and row['status'] == 'UNKNOWN')
            row.update(status=status, receiptSHA256=receipt_sha, processesStopped=True,
                independentAcceptanceSHA256=independent_acceptance_sha)
        return self.change(operation)
