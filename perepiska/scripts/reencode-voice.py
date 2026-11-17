#!/usr/bin/env python3
"""Re-encode one verified original WAV without rerunning TTS or altering its seed."""
import argparse,fcntl,importlib.util,json,shutil,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--work-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--id',required=True);p.add_argument('--leading-silence-ms',type=int,required=True);a=p.parse_args();w=a.work_dir
lock=(w/'render.lock').open('a+')
try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('Renderer still running.')
spec=importlib.util.spec_from_file_location('qwen_renderer',w/'render-voices-qwen.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
inputs_path=w/'voice-qwen.json';inputs=json.loads(inputs_path.read_text());item=inputs['lines'][a.id];record_path=w/'records'/(a.id+'.json');record=json.loads(record_path.read_text());raw=w/'raw'/(a.id+'.wav');mp3=a.output/(a.id+'.mp3')
assert record['status']=='complete' and r.digest(raw)==record['rawSha256'] and r.digest(mp3)==record['sha256']
assert item['sourceText']==record['text'] and item['synthesisText']==record['synthesisText']
assert r.encoding_for(item)==record['generation']['encoding']
archive=w/'encoding-revisions'/a.id/record['sha256'][:16];archive.mkdir(parents=True,exist_ok=True)
for source in [record_path,mp3,inputs_path]:shutil.copyfile(source,archive/source.name)
(w/'ready.marker.json').unlink(missing_ok=True)
item['encodingOverrides']={'leadingSilenceKeepMs':a.leading_silence_ms};item['postprocessingNote']='Retain a short lead-in to preserve the initial consonant. Original synthesized WAV, text, model, reference and seed are unchanged.';encoding=r.encoding_for(item)
temp=mp3.with_name(mp3.name+'.tmp');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(raw),'-af',r.audio_filters(encoding),'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1','-f','mp3',str(temp)],check=True);temp.replace(mp3)
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(mp3)],text=True));duration=round(float(info['format']['duration']),3);previous_sha=record['sha256'];new_sha=r.digest(mp3)
record['generation']['encoding']=encoding;record['fingerprint']=r.canonical_hash(record['generation']);record['duration']=duration;record['sha256']=new_sha
record['runtimeEntry'].update(duration=duration,sha256=new_sha,bytes=mp3.stat().st_size,encodingOverrides=item['encodingOverrides'])
record.setdefault('encodingRevisions',[]).append({'previousMP3Sha256':previous_sha,'rawSha256Unchanged':record['rawSha256'],'encodingOverrides':item['encodingOverrides'],'reason':item['postprocessingNote'],'finishedAtUnix':time.time()})
assert r.digest(raw)==record['rawSha256'];r.write_json(inputs_path,inputs);r.write_json(record_path,record)
print(json.dumps({'id':a.id,'duration':duration,'sha256':new_sha,'rawSha256Unchanged':record['rawSha256'],'seedUnchanged':record['generation']['seed'],'encodingOverrides':item['encodingOverrides']},ensure_ascii=False))
