#!/usr/bin/env python3
"""Design sketches and measured audit profiles. Never infer human enjoyment from a bot."""
from pathlib import Path
from collections import Counter
import json, csv, re, hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parent.parent
Q=ROOT/'tests/qa-2.17.7'
Q.mkdir(parents=True,exist_ok=True)
read=lambda name:json.loads((Q/name).read_text())
run=read('release-combat-pursuit.json')
levels=run['levels']; chapters=[x['number'] for x in levels]
ids=[x['mission'] for x in levels]
assert chapters==list(range(1,16)), 'Expected the complete 15-chapter combat campaign'
colors=['#4d775e','#b85b36','#80637c','#9b7b37']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.edgecolor':'#aaa69f','axes.labelcolor':'#3d3a35','text.color':'#242420','xtick.color':'#55534c','ytick.color':'#55534c','savefig.facecolor':'#faf9f6','axes.facecolor':'#faf9f6','figure.facecolor':'#faf9f6'})

# Authored design proposal only: these numbers are not measured or calibrated.
interest=[7,6,7,8,7,7.5,8.2,9,7.7,8.4,8,8.4,9,9.2,10]
tension=[5,3,5,7,4,5,8,9,3,7,5,4,2,7,10]
target={'kind':'design_hypothesis','scale':'Illustrative 0-10, not empirical or a universal optimum','chapter_axis':'Ordinal chapters, not equal elapsed time','interest':interest,'tension':tension,'key_beats':{'4':'First climax','8':'Major midpoint climax','9':'Recovery','13':'Low combat pressure with a narrative reveal','15':'Final climax; an epilogue should release tension'}}
fig,ax=plt.subplots(figsize=(10.4,4.1));fig.subplots_adjust(left=.075,right=.98,bottom=.16,top=.80)
for vals,label,col,style in [(interest,'Интерес: проектная цель',colors[0],'-'),(tension,'Боевое напряжение: проектная цель',colors[1],'--')]:
 ax.plot(chapters,vals,lw=2.2,marker='o',ms=3.5,color=col,ls=style,label=label)
ax.set(xticks=chapters,yticks=[0,2,4,6,8,10],ylim=(0,10.7),xlabel='Глава кампании',ylabel='Условные единицы')
ax.grid(axis='y',alpha=.22);ax.legend(ncol=2,loc='lower left',frameon=False,fontsize=9)
for n,label in [(4,'Погоня'),(8,'Параллакс'),(13,'Раскрытие'),(15,'Финал')]:
 ax.annotate(label,(n,interest[n-1]),xytext=(-3,12),textcoords='offset points',ha='right' if n==15 else 'center',fontsize=9)
fig.suptitle('Растущие кульминации и передышки',x=.075,ha='left',fontsize=15)
fig.text(.075,.89,'Предложение для «Цитадели». Эмоции игроков не измерялись.',fontsize=10)
fig.savefig(Q/'target-pacing.png',dpi=190);plt.close(fig)

# A single recurring mechanic has a learning curve; different mechanics are not
# collapsed into one "player skill" quantity across the whole campaign.
encounters=list(range(1,9));skill=[2,2.6,3.3,4,4.6,5.4,6.1,6.8];challenge=[2.4,3.1,2.9,4.5,4.1,6,5.7,7.3]
flow={'kind':'conceptual_learning_sketch','unit':'one recurring mechanic, eight encounters; not campaign chapters','skill':skill,'challenge':challenge,'calibrated':False}
fig,ax=plt.subplots(figsize=(10.4,3.5));fig.subplots_adjust(left=.075,right=.98,bottom=.19,top=.80)
ax.plot(encounters,challenge,color=colors[1],marker='o',lw=2.2,label='Предъявляемый вызов')
ax.plot(encounters,skill,color=colors[0],marker='s',ls='--',lw=2,label='Освоенный навык: условный игрок')
ax.set(xticks=encounters,yticks=[0,2,4,6,8],ylim=(0,8),xlabel='Повторная встреча с одной механикой',ylabel='Условные единицы')
ax.grid(axis='y',alpha=.22);ax.legend(frameon=False,ncol=2,loc='lower right',fontsize=9)
fig.suptitle('Вызов растёт вслед за освоением',x=.075,ha='left',fontsize=15)
fig.text(.075,.88,'Схема принципа Flow. Разрыв между линиями не является измеренным порогом.',fontsize=10)
fig.savefig(Q/'challenge-learning.png',dpi=190);plt.close(fig)

# Strictly observable quantities from the existing continuous input-only run.
# "damage" is the sum of positive HP decreases after a simulation step. It is
# not a complete damage-event log, retry cost, subjective tension, or difficulty.
metrics=[]
counts=Counter(x['mission'] for x in run['cards'])
for x in levels:
 metrics.append({'chapter':x['number'],'mission':x['mission'],'active_seconds':x['activeSeconds'],'duration_seconds':x['duration'],'positive_hp_decrease':x['damage'],'hp_decrease_per_active_minute':round(x['damage']*60/x['activeSeconds'],3),'hp_decrease_steps':x['hitCount'],'rift_contacts':x['riftHits'],'reviews':counts[x['mission']]})
rates=[x['hp_decrease_per_active_minute'] for x in metrics]
fig,axes=plt.subplots(2,1,figsize=(10.4,5.5),sharex=True);fig.subplots_adjust(left=.09,right=.98,bottom=.12,top=.85,hspace=.35)
axes[0].plot(chapters,rates,color=colors[1],lw=2,marker='o',ms=4)
axes[0].set(ylabel='Снижение HP / мин',ylim=(0,max(rates)*1.22));axes[0].grid(axis='y',alpha=.22)
for n in [3,11,15]:axes[0].annotate(f'{rates[n-1]:.1f}'.replace('.',','),(n,rates[n-1]),xytext=(0,8),textcoords='offset points',ha='center',fontsize=10)
axes[1].bar(chapters,[x['rift_contacts'] for x in metrics],color=colors[2],width=.55)
axes[1].set(xticks=chapters,yticks=[0,1,2,3],ylim=(0,3.6),xlabel='Глава кампании',ylabel='Контакты с титаном')
axes[1].grid(axis='y',alpha=.18);axes[1].set_axisbelow(True)
fig.suptitle('Где пилот теряет здоровье в версии 2.17.7',x=.09,ha='left',fontsize=15)
fig.text(.09,.91,'Один боевой маршрут через погоню, seed 417147. Это не оценка эмоций игрока.',fontsize=10)
fig.savefig(Q/'measured-pressure.png',dpi=190);plt.close(fig)

# Exact configured debut/comic beats; a curated mechanic taxonomy is labelled.
living=(ROOT/'assets/citadel-living-v2.17.6.js').read_text()
cast=dict(re.findall(r"(\w+):'([^']+)'",re.search(r'const CAST=Object.freeze\(\{([^}]+)\}',living)[1]))
seen=set();debuts=[]
for i,mission in enumerate(ids,1):
 kind=cast.get(mission)
 if kind and kind not in seen:seen.add(kind);debuts.append({'chapter':i,'kind':kind})
collection=(ROOT/'assets/citadel-collection-v2.17.0.js').read_text()
comics=[]
for comic,mission in re.findall(r"\{id:'([^']+)',title:'[^']+',after:(null|'[^']+')",collection):
 if mission=='null':continue
 mission=mission.strip("'")
 if mission in ids:comics.append({'chapter':ids.index(mission)+1,'id':comic})
formats=[{'chapter':1,'label':'Полёт'},{'chapter':2,'label':'Палуба'},{'chapter':3,'label':'Конвой'},{'chapter':4,'label':'Погоня'},{'chapter':7,'label':'Рой'},{'chapter':8,'label':'Параллакс'},{'chapter':13,'label':'Резонатор'},{'chapter':15,'label':'МРГ'}]
cadence={'debut_source':'CAST in assets/citadel-living-v2.17.6.js','first_titan_types':debuts,'comic_source':'COMICS.after in assets/citadel-collection-v2.17.0.js','comics_after_chapter':comics,'major_formats':formats,'major_formats_kind':'Manual classification of distinct main mechanics, not an exhaustive count of novelty','reviews_by_chapter':[counts[x] for x in ids],'prologue_comic':True,'all_chapters_update_document':True}
fig,axes=plt.subplots(2,1,figsize=(10.4,4.4),sharex=True,gridspec_kw={'height_ratios':[1.5,1]});fig.subplots_adjust(left=.18,right=.98,bottom=.15,top=.79,hspace=.40)
for lane,events,marker,col in [(2,formats,'s',colors[0]),(1,debuts,'^',colors[1]),(0,comics,'D',colors[2])]:
 axes[0].hlines(lane,.6,15.4,color='#d0cdc5',lw=.7)
 axes[0].scatter([x['chapter'] for x in events],[lane]*len(events),s=56,marker=marker,color=col,zorder=3)
axes[0].set(yticks=[0,1,2],yticklabels=['Комикс после главы','Новый вид титана','Новый крупный формат'],ylim=(-.65,2.65),xlim=(.5,15.5));axes[0].spines['left'].set_visible(False);axes[0].spines['bottom'].set_visible(False)
axes[1].bar(chapters,cadence['reviews_by_chapter'],color=colors[3],width=.55)
axes[1].set(xticks=chapters,yticks=[0,1,2,3],ylim=(0,3.8),xlabel='Глава кампании',ylabel='Разборы, шт.')
for i,n in enumerate(cadence['reviews_by_chapter'],1):axes[1].text(i,n+.12,str(n),ha='center',fontsize=9)
fig.suptitle('Ритм открытий и сюжетных эпизодов',x=.07,ha='left',fontsize=15)
fig.text(.07,.88,'Расположение событий в текущей игре, без оценки их качества.',fontsize=10)
fig.savefig(Q/'novelty-payoff-cadence.png',dpi=190);plt.close(fig)

source_files=['release-combat-pursuit.json','contracts.json']
result={'analysis_revision':2,'date':'2026-11-07','game_version':'2.17.7','source_commit':'e5ac6e48f9dcd979681621d31f3865f5fe711b80','source_sha256':{f:hashlib.sha256((Q/f).read_bytes()).hexdigest() for f in source_files},'target_pacing':target,'learning_sketch':flow,'measured_pressure':metrics,'cadence':cadence,'not_measured':['human enjoyment','human engagement','player skill distribution','retry cost','abandonment or retention','reading time','time between all 28 reviews'],'measurement_cautions':['Positive HP decreases are a proxy; healing and reductions within the same step can offset each other.','Peak enemy count uses incompatible or stale phase-specific arrays; it is not used as a common threat curve.','The transition log captures 26 question-screen entries for 28 answers; exact review spacing cannot be reconstructed.','Zero damage on the fast resonator solve does not rule out the independently reproduced old low-health bug.'],'references':[{'title':'The AI Systems of Left 4 Dead','author':'Michael Booth / Valve','year':2009,'url':'https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf','pages':'78-80'},{'title':'Design Flow in Games','author':'Jenova Chen','url':'https://jenovachen.info/design-flow'},{'title':'GameFlow: a model for evaluating player enjoyment in games','author':'Penelope Sweetser, Peta Wyeth','year':2005,'url':'https://doi.org/10.1145/1077246.1077253'}]}
assert sum(cadence['reviews_by_chapter'])==28
assert [x['chapter'] for x in debuts]==[2,3,4,5,6]
assert [x['chapter'] for x in comics]==[2,4,7,8,13,15]
assert max(metrics,key=lambda x:x['hp_decrease_per_active_minute'])['chapter']==11
(Q/'curves-analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
with (Q/'pressure-metrics.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(metrics[0]));w.writeheader();w.writerows(metrics)
print('Curves: 2 labelled design sketches, 2 evidence figures, 15 metric rows.')
