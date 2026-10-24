import copy
import hashlib
import importlib.util
import json
from pathlib import Path

base=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/combined-auth-baseline-native-launcher')
raw=(base/'PREPARED.SAFE.json').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='7c32a0ced6e4cd0e50e9d5b716ea4a5d601dfb21204113b40cb832429a637266'
frozen=json.loads(raw)
spec=importlib.util.spec_from_file_location('combined_selection_guards',base/'common.py')
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
passed=[]
for mode,variant,arm in [('lifecycle-only',None,'NEW'),('control-cache','OLD','OLD'),('control-cache','NEW','NEW')]:
    result=c.selected_measurement(frozen,mode,variant)
    assert result['bodyVariant']==arm
    assert result['expectedRendererBodySHA256']==frozen['variantBodies'][arm]['renderer']
    assert result['expectedBodySHA256']==frozen['variantBodies'][arm]['graph']
    assert result['partsOverlayPin']==frozen['variantParts'][arm]
    assert result['authRPCCount']==(0 if mode=='lifecycle-only' else 27)
    passed.append('accept:'+mode+':'+str(variant))

def reject(name,change=None,mode='control-cache',variant='NEW'):
    fixture=copy.deepcopy(frozen)
    if change:change(fixture)
    try:c.selected_measurement(fixture,mode,variant)
    except (RuntimeError,KeyError):passed.append('reject:'+name)
    else:raise AssertionError('accepted '+name)

reject('full500-mode',mode='full500')
reject('lifecycle-OLD',mode='lifecycle-only',variant='OLD')
reject('comparison-without-arm',variant=None)
reject('wrong-scope',lambda j:j.update(comparisonScope='cache-only'))
reject('wrong-baseline-commit',lambda j:j.update(originalCommit='0'*40))
reject('lifecycle-body-OLD',lambda j:j.update(lifecycleBodyVariant='OLD'))
reject('mixed-old-graph',lambda j:j['variantBodies']['OLD'].update(graph=c.NEW_GRAPH))
reject('mixed-new-renderer',lambda j:j['variantBodies']['NEW'].update(renderer=c.OLD_RENDERER))
reject('historical-host-U',lambda j:next(p for p in j['hostOnlyInputPins'] if p['path']==str(c.CANONICAL_U)).update(sha256=j['variantSources']['OLD']['sha256']))
reject('historical-host-Parts',lambda j:next(p for p in j['hostOnlyInputPins'] if p['path']==str(c.CANONICAL_PARTS)).update(sha256=j['variantParts']['OLD']['sha256']))
reject('old-Parts-replaced-with-new',lambda j:j['variantParts'].update(OLD=copy.deepcopy(j['variantParts']['NEW'])))
reject('new-U-replaced-with-old',lambda j:j['variantSources'].update(NEW=copy.deepcopy(j['variantSources']['OLD'])))
reject('cross-arm-renderer-wrapper',lambda j:j['variantInstallations']['NEW'].update(renderer=copy.deepcopy(j['variantInstallations']['OLD']['renderer'])))
reject('cross-arm-graph-wrapper',lambda j:j['variantInstallations']['OLD'].update(graph=copy.deepcopy(j['variantInstallations']['NEW']['graph'])),variant='OLD')
reject('unbound-installation',lambda j:j['metadataAndCodeInputs'].remove(j['variantInstallations']['NEW']['renderer']))
reject('extra-arm',lambda j:j['variantSources'].update(EXTRA=copy.deepcopy(j['variantSources']['NEW'])))
reject('unbound-current-engine',lambda j:j['engineSourcePin'].update(sha256='0'*64))
print(json.dumps({'pass':True,'checks':len(passed),'results':passed,'subjectModule':'common.py selection guards only','nativeActions':0,'sqlActions':0,'originalPayloadReads':0,'runtimeBinaryReads':0,'modelCalls':0}))
