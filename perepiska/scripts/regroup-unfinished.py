#!/usr/bin/env python3
"""Give only unfinished lines a new reproducible batch plan after interrupted work.

Completed line inputs and their historical batch definitions remain unchanged.
Run only when the renderer has released render.lock.
"""
import argparse,fcntl,hashlib,json,time
from pathlib import Path

def digest(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--work-dir',type=Path,required=True);a=p.parse_args();w=a.work_dir
 lock=(w/'render.lock').open('a+')
 try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:raise SystemExit('Renderer still running; do not alter its inputs.')
 source=w/'voice-qwen.json';before=source.read_bytes();inputs=json.loads(before);cast=json.loads((w/'voice-cast.json').read_text());complete={}
 for file in (w/'records').glob('*.json'):
  if not file.is_file():raise RuntimeError('Remove temporary pause marker first: '+str(file))
  record=json.loads(file.read_text())
  if record.get('status')=='complete':complete[record['id']]=record
 version=len(inputs.get('replans',[]))+1;prefix=f'resume-{version}';changed=[];new_batches=[]
 by_speaker={}
 for id,item in inputs['lines'].items():
  if id in complete:continue
  profile=cast[item['speakerId']]
  reused=profile.get('reuseReferenceForSpeech',True) and id==profile['referenceSpeechId'] and item['synthesisText']==profile['reference']['text']
  if not reused:by_speaker.setdefault(item['speakerId'],[]).append(id)
 for speaker,ids in by_speaker.items():
  ids.sort(key=lambda id:(len(inputs['lines'][id]['synthesisText']),id))
  for start in range(0,len(ids),4):
   group=ids[start:start+4];batch_id=f'{prefix}-{speaker}-{start//4+1}';seed=int(digest((batch_id+'|'+('|'.join(group))).encode())[:8],16)
   assert batch_id not in inputs['batches']
   inputs['batches'][batch_id]={'ids':group,'seed':seed,'texts':[inputs['lines'][id]['synthesisText'] for id in group]}
   for id in group:inputs['lines'][id]['batchId']=batch_id;inputs['lines'][id]['seed']=seed;changed.append(id)
   new_batches.append(batch_id)
 old=json.loads(before)
 for id in complete:assert inputs['lines'][id]==old['lines'][id],id
 for key,batch in old['batches'].items():assert inputs['batches'][key]==batch,key
 inputs.setdefault('replans',[]).append({'id':prefix,'reason':'Process interrupted; regroup only uncommitted lines to avoid synthesizing already completed batch peers. Voice references and text unchanged.','previousInputSha256':digest(before),'createdAtUnix':time.time(),'completedIds':sorted(complete),'changedIds':changed,'newBatchIds':new_batches})
 archive=w/'input-history';archive.mkdir(exist_ok=True);(archive/f'before-{prefix}-{digest(before)[:12]}.json').write_bytes(before)
 temp=source.with_suffix('.json.tmp');temp.write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+'\n');temp.replace(source);(w/'ready.marker.json').unlink(missing_ok=True)
 print(json.dumps({'completePreserved':len(complete),'changedLines':len(changed),'newBatches':len(new_batches),'ids':new_batches},ensure_ascii=False))
if __name__=='__main__':main()
