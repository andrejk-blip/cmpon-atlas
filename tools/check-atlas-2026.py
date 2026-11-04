#!/usr/bin/env python3
"""Release checks for scope, traceability, directionality and semantic regressions."""
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = ROOT/'assets/atlas-2026'
def read(n): return json.loads((D/(n+'.json')).read_text())
meta, cmpon, other, reverse, ev, qs = [read(n) for n in ['meta','cmpon','other','reverse','evidence','questions']]
assert not meta['draft'], 'Draft data must not be deployed'
assert [len(cmpon),len(other),len(reverse)] == [371,2438,472]
assert sum(r['numbered'] for r in cmpon)==249
assert sum(r['numbered'] for r in other)==1269
assert len({r['id'] for r in cmpon+other+reverse})==3281
assert all(r['section'].startswith(('7.15','8.10')) for r in cmpon)
assert all(not r['section'].startswith(('7.15','8.10')) for r in other)
assert all(set(r['maps'])=={'c39','ftt571','dt25'} for r in cmpon)
assert all(set(r['maps'])=={'c39','ftt571'} for r in other)
assert all(set(r['maps'])=={'ftt2026'} for r in reverse)
ids = {r['id'] for r in cmpon+other+reverse}
concept_ids = {c['id'] for c in meta['concepts']}
assert len(concept_ids)==50 and len(meta['groups'])==8
totals = collections.Counter()
for r in cmpon+other+reverse:
    assert r['text'].strip() and r['key'] in ev
    assert ev[r['key']]['source']==r['source']
    quote_norm=lambda text:re.sub(r'\s+',' ',text).strip()
    # Manually inserted fractional DT IDs can share one DOCX paragraph.
    assert quote_norm(r['text']) in quote_norm(ev[r['key']]['text']), ('Altered base quote',r['id'])
    assert all(c in concept_ids for c in r.get('concepts', []))
    for src,m in r['maps'].items():
        totals[src]+=1
        assert m['reviewed'] is True and m['status'] in ['D','P','I','N'], (r['id'],src)
        assert m['confidence'] in ['Высокая','Средняя','Низкая']
        assert m['reason'].strip()
        assert isinstance(m.get('scopeDifference',''),str)
        if m['status']=='D': assert m['refs'] and not m['missing'].strip(), (r['id'],src,'D gap')
        else: assert m['missing'].strip(), (r['id'],src,'Missing gap')
        if m['status'] in ['D','P','I']: assert m['refs'], (r['id'],src,'Unsupported positive')
        for key in m['refs']:
            assert key in ev, (r['id'],src,key)
            assert ev[key]['source']==src, (r['id'],src,'Wrong source',key)
        for other_id in m.get('relatedIds',[]):
            assert other_id in ids, (r['id'],src,'Unknown related ID',other_id)
            if src=='dt25': assert other_id.startswith('ФТ-')
            if src=='ftt2026': assert other_id.startswith(('ФТТ-','НФ-'))
for q in qs:
    assert q['scope'] in ['cmpon','other'] and 2<=len(q['options'])<=4
    assert q['question'] and q['title'] and q['evidenceRefs']
    assert len({o['id'] for o in q['options']})==len(q['options'])
    for k in q['evidenceRefs']:
        assert k in ev, (q['id'],k)
        if q['scope']=='other': assert ev[k]['source']!='dt25', (q['id'],'DT outside CMPON')
    assert all(i in ids for i in q['requirementIds']), (q['id'],'Unknown requirement')
assert len({q['id'] for q in qs})==len(qs)

# A narrower new clause can be D while the complete source clause is P.
b = {r['id']:r for r in cmpon}; old={r['id']:r for r in reverse}
assert b['ФТТ-7.15.232']['maps']['dt25']['status']=='D'
assert old['ФТ-392']['maps']['ftt2026']['status']=='P'
assert b['ФТТ-7.15.213']['maps']['ftt571']['status']!='D', 'Mobile web does not prove full field app'
assert b['ФТТ-7.15.28']['maps']['dt25']['status']=='D', 'Family-cell function is retained'
assert b['ФТТ-7.15.28']['maps']['ftt571']['status']=='N'
assert b['ФТТ-7.15.16']['qualityFlags'], 'Truncated requirement must be visible'
assert all(m['status']!='D' for m in b['ФТТ-7.15.16']['maps'].values())
assert b['НФ-8.10.2.4.1-12']['maps']['ftt571']['status']=='P', 'Analytics formula is not a processing workflow'
assert b['ФТТ-7.15.126']['maps']['ftt571']['status']=='P'
assert 'FTT-P04606' in b['ФТТ-7.15.126']['maps']['ftt571']['refs']

# These sections cannot be inferred from style names alone in the source DOCX.
assert ev['C39-P00568']['section']=='5.7'
assert ev['C39-P00880']['section']=='5.15'
assert all(a['allOutlineLabelsMatchIndependentRender'] for a in meta['sourceNavigationAudit'])
for key,p in ev.items():
    if key.startswith('FTT-P') and 4956 <= int(key[-5:]) < 4987:
        assert 'А' in p['section']
    if key.startswith('FTT-P') and int(key[-5:]) >= 4987:
        assert 'Б' in p['section']

# Source filenames and hashes pin the exact compared editions.
assert len(meta['sourceDocs'])==4
assert all(len(d['sha256'])==64 for d in meta['sourceDocs'])
stats=read('statistics')
for name,rows in [('cmpon',cmpon),('other',other),('reverseDT',reverse)]:
    for src in rows[0]['maps']:
        assert stats['coverage'][name][src]==dict(collections.Counter(r['maps'][src]['status'] for r in rows))
assert stats['pending']==[]
print(json.dumps({'result':'PASS','requirements':len(cmpon)+len(other),'reverseDT':len(reverse),'assessments':sum(totals.values()),'evidence':len(ev),'questions':len(qs),'bySource':totals}, ensure_ascii=False, indent=2))
