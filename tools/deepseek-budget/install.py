#!/usr/bin/env python3
"""Install only with --install; no model call, no secrets read, reversible backups."""
import argparse, datetime as dt, hashlib, importlib.util, json, os, re, shutil, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('budget_runtime',HERE/'runtime.py')
R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)

RULE_BEGIN='# BEGIN HELMUT DEEPSEEK LAUNCHER RULE'
RULE_END='# END HELMUT DEEPSEEK LAUNCHER RULE'

def codex_launcher_rule(launcher):
    path=json.dumps(str(launcher),ensure_ascii=False)
    return (RULE_BEGIN+'\n'
      'prefix_rule(\n'
      f'    pattern=[{path}],\n'
      '    decision="allow",\n'
      '    justification="Der gebundene Helmut-DeepSeek-Launcher braucht ausserhalb der Sandbox Zugriff auf macOS Keychain, Netzwerk und sein lokales Kostenbuch.",\n'
      ')\n'+RULE_END+'\n')

def ensure_codex_launcher_rule(rule_file,launcher):
    """Append or refresh only Helmut's exact launcher rule; preserve all other rules."""
    text=rule_file.read_text() if rule_file.exists() else ''
    escaped=re.escape(json.dumps(str(launcher),ensure_ascii=False))
    existing=re.search(r'prefix_rule\(\s*pattern=\['+escaped+r'\][\s\S]*?decision="allow"[\s\S]*?\)',text)
    if existing and RULE_BEGIN not in text:
        return False
    block=codex_launcher_rule(launcher)
    marked=re.compile(re.escape(RULE_BEGIN)+r'[\s\S]*?'+re.escape(RULE_END)+r'\n?')
    new=marked.sub(block,text,count=1) if marked.search(text) else text.rstrip()+'\n'+block
    if new==text:return False
    rule_file.parent.mkdir(parents=True,exist_ok=True)
    temp=rule_file.with_name(rule_file.name+'.helmut-install-tmp')
    temp.write_text(new)
    if rule_file.exists():os.chmod(temp,rule_file.stat().st_mode & 0o777)
    else:os.chmod(temp,0o600)
    os.replace(temp,rule_file)
    return True

def history_seeds(root,c,now):
    totals=[]
    # Rollout directories use local dates. Include neighbours, filter UTC events.
    for offset in (-1,0,1):
        date=(now+dt.timedelta(days=offset)).strftime('%Y/%m/%d')
        for p in sorted((root/'sessions'/date).glob('*.jsonl')):
            model=None;previous={};amount=0
            for line in p.open():
                obj=json.loads(line);payload=obj.get('payload',{})
                if obj.get('type')=='turn_context':model=payload.get('model',model)
                if payload.get('type')!='token_count' or not payload.get('info'):continue
                current=payload['info'].get('total_token_usage')
                if not current:continue
                delta={k:current.get(k,0)-previous.get(k,0) for k in ('input_tokens','cached_input_tokens','output_tokens')}
                previous=current
                stamp=dt.datetime.fromisoformat(obj['timestamp'].replace('Z','+00:00'))
                if R.day(stamp)!=R.day(now) or not any(delta.values()):continue
                if model not in c['peak_rates_usd_per_million'] or any(v<0 for v in delta.values()):
                    raise RuntimeError('Historische Nutzung ist nicht eindeutig bilanzierbar: '+p.name)
                u={'input_tokens':delta['input_tokens'],'input_tokens_details':{'cached_tokens':delta['cached_input_tokens']},'output_tokens':delta['output_tokens']}
                amount+=R.cost(c,model,u,stamp)
            if amount:totals.append(('rollout:'+p.name+':'+R.day(now),R.day(now),amount))
    # Earlier one-off public-profile review from this task, outside Codex rollouts.
    receipt=HERE.parents[1]/'docs/betrieb/brandenburg-parteipruefung-20260927.json'
    if receipt.exists():
        r=json.loads(receipt.read_text())['modell'];stamp=dt.datetime.fromisoformat(r['startedAt'])
        if R.day(stamp)==R.day(now):
            u=r['usage'];usage={'input_tokens':u['prompt_tokens'],'input_tokens_details':{'cached_tokens':u.get('prompt_cache_hit_tokens',0)},'output_tokens':u['completion_tokens']}
            totals.append(('direct-flash:'+r['startedAt'],R.day(now),R.cost(c,r['model'],usage,stamp)))
    return totals

def rewrite_config(text):
    lines=text.splitlines();inside=False;found=False;result=[]
    for line in lines:
        if line == '# Runtime port is supplied by ~/bin/helmut-deepseek; direct unbudgeted starts fail closed.': continue
        if line.startswith('['):inside=line.strip()=='[model_providers.deepseek]'
        if inside and re.match(r'\s*base_url\s*=',line):
            result.append('# Runtime port is supplied by ~/bin/helmut-deepseek; direct unbudgeted starts fail closed.')
            line='base_url = "http://127.0.0.1:9"';found=True
        result.append(line)
    if not found:raise RuntimeError('Erwartete DeepSeek-Providerkonfiguration fehlt')
    return '\n'.join(result)+'\n'

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--install',action='store_true');args=ap.parse_args()
    root=Path.home()/'.codex-deepseek';launcher=Path.home()/'bin/helmut-deepseek';conf=root/'config.toml';rule_file=Path.home()/'.codex/rules/default.rules'
    c=R.config(HERE/'budget.json');now=R.utcnow()
    old_conf=conf.read_text();new_conf=rewrite_config(old_conf)
    targets=[str(launcher),str(conf),str(root/'budget.json'),str(root/'budget-runtime.py'),str(root/'budget.sqlite3'),str(rule_file)]
    if not args.install:
        seeds=history_seeds(root,c,now)
        print(json.dumps({'targets':targets,'day':R.day(now),'known_prior_micro_usd':sum(x[2] for x in seeds),'historical_receipts':len(seeds),'dry_run':True},ensure_ascii=False));return
    processes=subprocess.check_output(['ps','-axo','pid=,command='],text=True)
    active=[x.split()[0] for x in processes.splitlines() if re.search(r'codex exec\b.*\bdeepseek-(flash|v4-pro)\b',x)]
    if active:raise RuntimeError('Vor Installation laufende DeepSeek-Prozesse geordnet beenden: '+','.join(active))
    ledger=R.Ledger(root/'budget.sqlite3')
    with ledger.connect() as db:seeded=db.execute("select 1 from flags where key='history_initialized'").fetchone()
    if not seeded:
        seeds=history_seeds(root,c,now)
        for ident,date,amount in seeds:ledger.seed(ident,date,amount)
        with ledger.connect() as db:db.execute("insert into flags values ('history_initialized',?)",(now.isoformat(),))
    backup=root/'backups'/('budget-'+now.strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,mode=0o700)
    for p in [launcher,conf,root/'budget.json',root/'budget-runtime.py',rule_file]:
        if p.exists():shutil.copy2(p,backup/p.name)
    if (root/'budget.json').exists():c['day_approvals']=json.loads((root/'budget.json').read_text()).get('day_approvals',{})
    files={root/'budget.json':json.dumps(c,indent=2)+'\n',root/'budget-runtime.py':(HERE/'runtime.py').read_text(),conf:new_conf,
      launcher:'#!/bin/bash\nset -euo pipefail\nexec python3 "$HOME/.codex-deepseek/budget-runtime.py" "$@"\n'}
    for target,content in files.items():
        temp=target.with_name(target.name+'.budget-install-tmp');temp.write_text(content);os.chmod(temp,0o700 if target==launcher else 0o600);os.replace(temp,target)
    ensure_codex_launcher_rule(rule_file,launcher)
    print(json.dumps({'installed':True,'backup':str(backup),'targets':targets,'budget':ledger.snapshot(),
       'runtime_sha256':hashlib.sha256((root/'budget-runtime.py').read_bytes()).hexdigest()},ensure_ascii=False))
if __name__=='__main__':main()
