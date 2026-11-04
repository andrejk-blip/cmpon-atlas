#!/usr/bin/env python3
"""Assemble reviewed Atlas data. Retrieval candidates never supply a status.

Usage: python tools/build-atlas-2026.py --input-dir ../atlas_work [--draft]
Draft permits incomplete mappings for local UI work; release validation rejects U.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--input-dir', type=Path, required=True)
ap.add_argument('--draft', action='store_true')
args = ap.parse_args()
W = args.input_dir.resolve()
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/atlas-2026'
OUT.mkdir(parents=True, exist_ok=True)
VERSION = '2026.11.04.1'
SOURCES = {'c39': 'ФТ сервиса 39 · 17.01.2025', 'ftt571': 'ФТТ ГИС ЦАП 57.1 · 12.03.2026', 'dt25': 'Дополнительные требования 2.5 · 30.10.2026', 'ftt2026': 'ФТТ ГИС ЦАП · 02.11.2026'}

def read(name, default=None):
    p = W / (name + '.json')
    if not p.exists():
        if default is not None: return default
        raise FileNotFoundError(p)
    return json.loads(p.read_text())

def save(name, data):
    (OUT / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')

def norm(t):
    return re.sub(r'[^а-яa-z0-9]', '', t.lower().replace('ё', 'е'))

def unique(items): return list(dict.fromkeys(items))

def mapping_files(names):
    rows = [r for n in names for r in read(n, [])]
    ids = [r['id'] for r in rows]
    assert len(ids) == len(set(ids)), ('Duplicate mapping', names)
    return {r['id']: r for r in rows}

maps = {
    'c39': mapping_files(['mapping_c39_a', 'mapping_c39_b']),
    'ftt571': mapping_files(['mapping_ftt571_a', 'mapping_ftt571_b']),
    'dt25': mapping_files(['mapping_dt25']),
}
other_maps = {
    'c39': mapping_files(['other_mapping_c39_a', 'other_mapping_c39_tail', 'other_mapping_c39_b']),
    'ftt571': mapping_files(['other_mapping_ftt571_a', 'other_mapping_ftt571_b']),
}
for m in read('baseline_additions_mappings'):
    assert m['id'] not in maps[m['source']]
    maps[m['source']][m['id']] = m

# Explicit accepted corrections are separate from source analysts' files.
for c in read('accepted_corrections', []):
    if c.get('scope') == 'reverse': continue
    target = other_maps if c.get('scope') == 'other' else maps
    m = target[c['source']][c['id']]
    m.update(c['changes'])
    m['reviewNote'] = c['reviewNote']

corpus = {}
source_rows = {}
for src in SOURCES:
    source_rows[src] = read(src + '_paragraphs')
    for p in source_rows[src]:
        assert p['key'] not in corpus
        corpus[p['key']] = {**p, 'source': src}
for key, correction in read('source_text_corrections', {}).items():
    assert key in corpus
    corpus[key].update(correction)

# OOXML outline levels, inherited styles and rendered TOC control the labels.
# Keep original paragraph keys and requirement identifiers stable.
navigation = read('source_navigation_corrections')
for src in navigation['sources']:
    raw = (W/(src['source'] + '_paragraphs.json')).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == src['corpusSha256AtRead']
for change in navigation['ranges']:
    rows = source_rows[change['source']][change['rowStart']:change['rowEndExclusive']]
    assert len(rows) == change['keyCount']
    assert rows[0]['key'] == change['startKey'] and rows[-1]['key'] == change['endKey']
    for row in rows:
        corpus[row['key']].update(section=change['section'], sectionTitle=change['sectionTitle'])
    corpus[change['headingKey']].update(heading=True, label=change['headingLabel'])

base = sorted(read('baseline') + read('baseline_additions'), key=lambda r: r['p'])
other = read('other_requirements')
reverse = read('dt25_requirements')
revmap = mapping_files(['reverse_dt25'])
for c in read('accepted_corrections', []):
    if c.get('scope') == 'reverse':
        revmap[c['id']].update(c['changes'])
        revmap[c['id']]['reviewNote'] = c['reviewNote']
legacy = read('legacy_atlas_data')
concepts = [{k: c[k] for k in ['id', 'title', 'group']} for c in legacy['concepts']]
concept_group = {c['id']: c['group'] for c in concepts}
legacy_by_id = {r['id']: r for r in legacy['rows']}
legacy_by_text = {norm(r['text']): r for r in legacy['rows']}
dt_concepts = {}
for r in reverse:
    old = legacy_by_text.get(norm(r['text']))
    dt_concepts[r['id']] = old.get('concepts', []) if old else []
dt_by_key = {r['key']: r['id'] for r in reverse}

# These rules classify a topic only; they never alter evidence or coverage.
TOPICS = {
 'K01': r'защищенн.{0,25}контур|контур.{0,30}персональн|контур.{0,10}пдн',
 'K02': r'сдр.{0,45}(открыт|защищен)|част.{0,15}сдр',
 'K03': r'ерн.{0,30}(загруз|прием|передач)|загруз.{0,60}ерн|регистр.{0,30}населени',
 'K04': r'идентификатор.{0,20}(ерн|сдр)|обратн.{0,12}идентифик|истори.{0,30}сопоставлен',
 'K05': r'шлюз.{0,20}обезлич|сдр.{0,5}обработка',
 'K06': r'поименн|доступ.{0,90}ерн|ерн.{0,90}доступ',
 'K07': r'рол.{0,90}ерн|ерн.{0,90}рол|внешн.{0,20}аудит',
 'K08': r'личн.{0,15}кабинет|профил.{0,20}пользоват|регистраци.{0,25}пользоват',
 'K09': r'права.{0,20}(функци|объект)|роль.{0,10}объект|предметн.{0,20}ограничени|территориальн.{0,20}ограничени|права доступа',
 'K10': r'несовместим|самоутверждени|приоритет.{0,15}запрет|совмещени.{0,25}рол',
 'K11': r'отзыв.{0,15}(прав|доступ)|временн.{0,15}доступ|замещени|срок.{0,20}полномоч',
 'K12': r'техническ.{0,35}администр|администрирован.{0,40}содержим|администратор.{0,30}данн',
 'K13': r'нси|классификатор|справочник|переходн.{0,12}таблиц',
 'K14': r'гар|терсон(?!-мо)|адресн.{0,20}(хозяйств|баз|объект|реестр)',
 'K15': r'всте|терсон-мо|территориальн.{0,20}преобразован|адресн.{0,20}цикл',
 'K16': r'помещени|счетн.{0,10}участ|состав.{0,20}домохозяйств|сущност.{0,20}лиц',
 'K17': r'семейн.{0,10}ячейк|родственн.{0,12}связ',
 'K18': r'сшивк|приоритет.{0,15}источник|дубл.{0,25}(лиц|запис)|сопоставлен.{0,30}лиц',
 'K19': r'реестр.{0,15}вопрос|вопрос.{0,25}показател',
 'K20': r'переменн',
 'K21': r'экономическ.{0,15}описан|технологическ.{0,12}карт',
 'K22': r'конструктор|формуляр|динамическ.{0,15}блок|межанкетн|флк',
 'K23': r'сцеплен|самостоятельност.{0,20}обследован',
 'K24': r'предзаполн',
 'K25': r'согласи.{0,70}предзаполн|предзаполн.{0,70}согласи',
 'K26': r'канал.{0,20}сбор|мобильн|веб-приложен|веб-доступ|бумажн|епгу|мос\.ру',
 'K27': r'офлайн|автономн|синхронизаци.{0,30}(конфликт|устройств)|локальн.{0,20}хранени',
 'K28': r'временн.{0,20}персонал|обучени|резерв.{0,15}персонал|устройств|договорн',
 'K29': r'маршрут|интервьюер|переписчик|контакт.{0,20}(респондент|домохозяйств)|полев.{0,15}контрол',
 'K30': r'распознавани|ocr|голосов|реч.{0,10}текст',
 'K31': r'ии|интеллектуальн.{0,15}помощник|искусственн.{0,15}интеллект',
 'K32': r'выборк|ротаци|генеральн.{0,15}совокупност',
 'K33': r'весов|веса|весы|калибровк|распространени.{0,20}(итог|результат)|оценк.{0,15}точност',
 'K34': r'лпх|личн.{0,15}подсобн',
 'K35': r'административн.{0,15}данн|мэппинг|маппинг|сценари.{0,15}прием',
 'K36': r'акт.{0,20}(состоян|едн)|миграц|свидетельств|егр загс|медицинск',
 'K37': r'численност.{0,20}населен|демографическ.{0,20}показател',
 'K38': r'прогноз',
 'K39': r'аналитическ.{0,20}(запрос|таблиц)|нерегламент|визуальн.{0,20}запрос|детализаци|агрегирован',
 'K40': r'обезлич|конфиденциальност',
 'K41': r'три и менее|мал.{0,10}групп|разностн.{0,12}запрос|косвенн.{0,15}идентификац',
 'K42': r'публикац|витрин|машинн.{0,15}доступ|распространени.{0,20}информац',
 'K43': r'паспорт.{0,15}качеств|мониторинг|нагрузк',
 'K44': r'фпср|производственн.{0,15}план|календар|зависимост.{0,20}(работ|этап)',
 'K45': r'электронн.{0,15}подпис|согласовани|утвержден',
 'K46': r'происхождени|верси.{0,15}данн|истори.{0,20}(изменен|результат)|lineage',
 'K47': r'2002|2010|2014|2015|2020|архив.{0,15}(перепис|обследован)|накопленн.{0,15}массив',
 'K48': r'excel|эталонн.{0,15}сверк|перенос.{0,20}алгоритм|эталонн.{0,15}набор',
 'K49': r'карточк.{0,20}наблюден|бесшовн|параллельн.{0,20}механизм|дублирован',
 'K50': r'открыт.{0,10}контур.{0,80}общедоступ|общедоступ.{0,80}открыт.{0,10}контур',
}
# Token boundaries prevent abbreviations ГАР/ИИ being found inside longer words.
TOPICS['K14'] = r'\bгар\b|\bтерсон\b|адресн.{0,20}(хозяйств|баз|объект|реестр)'
TOPICS['K31'] = r'\bии\b|интеллектуальн.{0,15}помощник|искусственн.{0,15}интеллект'

notes = []
for p in sorted(W.glob('*notes.json')):
    if p.name.startswith('legacy'): continue
    d = json.loads(p.read_text())
    notes.append((p.stem, d))

quality = collections.defaultdict(list)
quality_refs = collections.defaultdict(list)
for _, d in notes:
    if isinstance(d, dict):
        for q in d.get('qualityFlags', []) + d.get('editorialFindings', []):
            if not isinstance(q,dict) or q.get('type')=='semantic_self_correction': continue
            targets = q.get('ids', [q['id']] if q.get('id') else [])
            if targets==['ФТ-239/240']: targets=['ФТ-239','ФТ-240']
            for target in targets:
                quality[target].append(q.get('text',q.get('finding',q.get('reason',''))))
                quality_refs[target] += q.get('refs',[]) + q.get('newRefs',[]) + ([q['key']] if q.get('key') else [])

pending = []
def attach(rows, sources, lookup):
    for r in rows:
        r['sourceKeys'] = r.get('sourceKeys') or [r['key']]
        r['maps'] = {}
        for src in sources:
            m = lookup[src].get(r['id'])
            if not m:
                pending.append([r['id'], src])
                m = {'status': 'U', 'confidence': 'Низкая', 'refs': [], 'reason': 'Проверка продолжается.', 'missing': '', 'reviewed': False}
            assert m['status'] in ['D', 'P', 'I', 'N', 'U'], m
            r['maps'][src] = {k: v for k, v in m.items() if k not in ['id', 'source']}
        r['qualityFlags'] = unique(quality[r['id']] + [str(f) for m in r['maps'].values() for f in m.get('qualityFlags', [])])
        r['qualityRefs'] = unique(quality_refs[r['id']])
        r['numbered'] = r.get('numbered', True)

attach(base, maps, maps)
attach(other, other_maps, other_maps)
attach(reverse, ['ftt2026'], {'ftt2026': revmap})
navigation_note = 'В исходном файле заголовок «Системные функциональные требования» не оформлен и не пронумерован. Показан родительский пункт 6.4.10 и фактический заголовок; редакционный ID сохранен. Номер 6.4.10.17 старого ФТТ новому документу не присваивается.'
for r in other:
    if r['id']=='НФ-9.4.2-14':
        # Word's w:noBreakHyphen is part of the visible source text.
        r['text']=corpus[r['key']]['text']
    if r['key'].startswith('NEW-P') and 1509 <= int(r['key'][-5:]) <= 1522:
        r['extractedSection'] = r['section']
        r['section'] = '6.4.10'
        r['sectionTitle'] = 'Системные функциональные требования (заголовок без номера)'
        r['sourceKeys'] = unique(['NEW-P01508'] + r['sourceKeys'])
        r['qualityFlags'].append(navigation_note)
    if r['id']=='НФ-6.2.1-03':
        r['qualityFlags'].append('Внутренняя ссылка 7.2.2 унаследована от старого ФТТ. В новой редакции зависимости НСИ описаны в 7.1.4, а 7.2.2 относится к гармонизации показателей. Предлагается исправить ссылку; исходная цитата сохранена.')
for key,p in corpus.items():
    if key.startswith('NEW-P') and 1508 <= int(key[-5:]) <= 1522:
        p['section'] = '6.4.10'
        p['sectionTitle'] = 'Системные функциональные требования (заголовок без номера)'
for r in base:
    r.update({'stage': 2, 'queue': 3 if r['section'].startswith('7.') else 4, 'scopeKind': 'queue'})
    cs, methods = set(), []
    for m in r['maps'].values():
        for lid in m.get('legacyIds', []):
            if lid in legacy_by_id:
                cs.update(legacy_by_id[lid].get('concepts', [])); methods.append('Проверенная связь с прежним атласом: ' + lid)
    dm = r['maps']['dt25']
    for did in unique(dm.get('relatedIds', []) + [dt_by_key[k] for k in dm.get('refs', []) if k in dt_by_key]):
        if dt_concepts.get(did):
            cs.update(dt_concepts[did]); methods.append('Сопоставленное ДТ с прежней тематической разметкой: ' + did)
    if not cs:
        t = (r['text'] + ' ' + r.get('continuation', '')).lower().replace('ё', 'е')
        cs = {cid for cid, pattern in TOPICS.items() if re.search(pattern, t)}
        if cs: methods.append('Тематическая разметка текста нового требования; не используется в оценке покрытия')
    overrides = read('topic_overrides', {})
    if r['id'] in overrides:
        cs.update(overrides[r['id']]); methods.append('Ручная тематическая разметка новой редакции')
    r['concepts'] = sorted(cs)
    r['groups'] = unique(concept_group[c] for c in r['concepts'])
    r['topicBasis'] = unique(methods)
for r in reverse:
    r['concepts'] = dt_concepts.get(r['id'], [])
    r['groups'] = unique(concept_group[c] for c in r['concepts'])

raw_questions = []
for fname, d in notes:
    qs = d if isinstance(d, list) else d.get('questions', [])
    for q in qs:
        if isinstance(q, dict) and q.get('question'):
            q = dict(q); q['_file'] = fname; raw_questions.append(q)
raw_questions += read('curated_questions', []) + read('glossary_question_cards', [])
questions = []
base_by_id = {r['id']: r for r in base + other + reverse}
for q in raw_questions:
    ids = q.get('requirementIds', q.get('baselineIds', q.get('ids', [])))
    if isinstance(ids, str): ids = [ids]
    ids = unique(ids + q.get('dtIds', []))
    refs = q.get('evidenceRefs', q.get('refs', []))
    refs = unique([base_by_id[i]['key'] for i in ids if i in base_by_id] + refs + [v['ref'] for k in ['quotes', 'newQuotes'] for v in q.get(k, []) if v.get('ref')])
    if not ids:
        ids = [r['id'] for r in base + reverse if r['key'] in refs]
    options = q.get('options', q.get('variants', []))
    normalized = []
    for i, o in enumerate(options):
        if isinstance(o, str): normalized.append({'id': str(i+1), 'label': o, 'impact': ''})
        else: normalized.append({'id': str(o.get('id', i+1)), 'label': o.get('label', o.get('text', '')), 'impact': ' '.join(unique([v for v in [o.get('impact', o.get('description', '')), o.get('consequence')] if v]))})
    assert 2 <= len(normalized) <= 4, ('Question options', q)
    title = q.get('title') or q['question']
    context = q.get('context') or q.get('issue') or q.get('impact') or q.get('reason') or q.get('evidence') or ''
    scope = q.get('scope', 'other' if q.get('_file', '').startswith('other_') else 'cmpon')
    item = {'id': q['id'], 'scope': scope, 'title': title, 'question': q['question'], 'context': context,
            'category': q.get('category', 'Качество формулировки' if q.get('kind')=='source_quality' else 'Уточнение требований'),
            'evidenceRefs': refs, 'requirementIds': ids, 'options': normalized}
    item['signature'] = hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    item.update(read('question_overrides', {}).get(item['id'], {}))
    item['signature'] = hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    questions.append(item)

# Curated merge plan retains every underlying citation and question lineage.
for merge in read('question_merges', []):
    selected_q = [q for q in questions if q['id'] in merge['ids']]
    if len(selected_q) < 2: continue
    keep = next(q for q in selected_q if q['id'] == merge.get('keep', merge['ids'][0]))
    keep['evidenceRefs'] = unique([k for q in selected_q for k in q['evidenceRefs']])
    keep['requirementIds'] = unique([k for q in selected_q for k in q['requirementIds']])
    keep['mergedFrom'] = [q['id'] for q in selected_q]
    keep.update(merge.get('changes', {}))
    keep['signature'] = hashlib.sha256(json.dumps(keep, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    questions = [q for q in questions if q not in selected_q or q is keep]

for q in questions:
    # The initial two quotes compare editions instead of repeating one edition.
    refs = q['evidenceRefs']
    firsts = [next((k for k in refs if corpus[k]['source']==src),None) for src in ['ftt2026','dt25','ftt571','c39']]
    q['evidenceRefs'] = unique([k for k in firsts if k] + refs)
    q['sections'] = unique('.'.join(base_by_id[i]['section'].split('.')[:2]) for i in q['requirementIds'] if i in base_by_id and base_by_id[i]['source']=='ftt2026')
    q['signature'] = hashlib.sha256(json.dumps(q,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:16]

used = set()
for r in base + other + reverse:
    used.update(r['sourceKeys'])
    used.update(r.get('qualityRefs',[]))
    for m in r['maps'].values(): used.update(m.get('refs', []))
for q in questions: used.update(q['evidenceRefs'])
glossary = read('glossary_crosscheck')['terms']
for term in glossary:
    for doc in term['documents']: used.update(doc['refs'])
missing_refs = sorted(used - corpus.keys())
assert not missing_refs, ('Missing source keys', missing_refs)
evidence = {k: {a: corpus[k].get(a, '') for a in ['key', 'source', 'section', 'sectionTitle', 'text', 'label']} for k in sorted(used)}

lands_text = (W/'geography_reference.js').read_text().split('const GEO_LANDS=',1)[1].split(';',1)[0]
# This is an established static array of unquoted keys, strings and coordinates.
lands_text = re.sub(r'([{,]\s*)(id|name|color|center|points):', r'\1"\2":', lands_text).replace("'", '"')
lands = json.loads(lands_text)
section_titles = {p['section']: p['sectionTitle'] for p in corpus.values() if p['source']=='ftt2026' and p.get('heading') and p.get('section')}
source_docs = [{**d, 'title': SOURCES[d['id']]} for d in read('source_manifest')]
meta = {'version': VERSION, 'draft': bool(pending), 'sourceDocs': source_docs, 'groups': legacy['groups'], 'concepts': concepts, 'glossary': glossary,
    'sourceNavigationAudit': [{'source':s['source'], 'outlineHeadingsChecked':s['outlineHeadingsChecked'], 'allOutlineLabelsMatchIndependentRender':s['allOutlineLabelsMatchIndependentRender']} for s in navigation['sources']],
    'otherRequirementIds': [r['id'] for r in other],
    'geoLands': lands, 'sectionTitles': section_titles,
    'auditSummary': 'Проверены 1 518 исходных идентификаторов ФТТ. В каталоге 371 требование ЦМПОН и 2 438 требований и обязательных условий остальных разделов. Контрольные показатели и описательный контекст учтены отдельно. Дата 02.11.2026 взята из наименования переданного файла и не подтверждает дату его утверждения.'}
stats = {'version': VERSION, 'counts': {'cmpon': len(base), 'other': len(other), 'reverseDT': len(reverse), 'questions': len(questions), 'evidence': len(evidence)}, 'coverage': {}, 'pending': pending}
for label, rows in [('cmpon',base),('other',other),('reverseDT',reverse)]:
    stats['coverage'][label] = {src: dict(collections.Counter(r['maps'][src]['status'] for r in rows)) for src in rows[0]['maps']}
assert len(base)==371 and len(other)==2438 and len(reverse)==472
assert len({r['id'] for r in base+other})==2809
assert sum(r['numbered'] for r in base+other)==1518
assert len({q['id'] for q in questions})==len(questions)
if not args.draft:
    assert not pending, ('Incomplete review', len(pending), pending[:10])
    assert all(m.get('reviewed') is True and m['status']!='U' for r in base+other+reverse for m in r['maps'].values()), 'Unreviewed assessment'
for name,d in [('meta',meta),('cmpon',base),('other',other),('reverse',reverse),('evidence',evidence),('questions',questions),('statistics',stats),('scope-audit',read('scope_audit'))]: save(name,d)
print(json.dumps({**stats,'pending': len(pending)}, ensure_ascii=False, indent=2))
