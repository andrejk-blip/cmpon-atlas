#!/usr/bin/env python3
"""Assign an explicit new single-line generation seed without touching clean lines."""
from pathlib import Path
import argparse,json,hashlib,shutil
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--inputs',type=Path,required=True);p.add_argument('--work-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--ids',nargs='+',required=True);args=p.parse_args()
data=json.loads(args.inputs.read_text())
for id in args.ids:
 item=data['lines'][id];attempt=int(item.get('attempt',0))+1;previous={'batchId':item.get('batchId'),'seed':item['seed'],'attempt':attempt-1}
 archive=args.work_dir/'retakes'/id/f'attempt-{attempt-1}';archive.mkdir(parents=True,exist_ok=True)
 for path in [args.work_dir/'records'/(id+'.json'),args.work_dir/'raw'/(id+'.wav'),args.output/(id+'.mp3')]:
  if path.exists():shutil.copyfile(path,archive/path.name)
 item.setdefault('previousAttempts',[]).append(previous);seed=int(hashlib.sha256((id+':retry:'+str(attempt)).encode()).hexdigest()[:8],16);batch_id='retake-'+id+'-'+str(attempt)
 item['seed']=seed;item['attempt']=attempt;item['batchId']=batch_id
 data.setdefault('batches',{})[batch_id]={'ids':[id],'seed':seed,'texts':[item['synthesisText']]}
 print(id,'attempt',attempt,'seed',seed)
tmp=args.inputs.with_name(args.inputs.name+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(args.inputs)
(args.work_dir/'ready.marker.json').unlink(missing_ok=True)
