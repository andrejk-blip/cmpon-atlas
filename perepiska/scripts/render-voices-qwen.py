#!/usr/bin/env python3
"""Offline build-time Qwen3 speech rendering with synthetic voice references.

No model, token or remote inference is shipped with the game. Every completed
line has an atomic checkpoint and can be resumed without regenerating it.
"""
from __future__ import annotations
import argparse,hashlib,json,os,re,resource,shutil,subprocess,time,atexit,fcntl,threading
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
PROVIDER='qwen3-tts-local'
GENERATION={'max_new_tokens':400,'do_sample':True,'top_p':0.9,'temperature':0.8,'non_streaming_mode':True}
ENCODING={'sampleRate':24000,'channels':1,'bitrate':128000,'targetLufs':-19,'truePeakLimitDb':-2,'pitchChanged':False,'tempoChanged':False}

def digest(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def text_hash(text):return hashlib.sha256(text.encode('utf-8')).hexdigest()
def canonical_hash(value):return text_hash(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')))
def write_json(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
def memory():
    r={'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
    for key,file in [('cgroupCurrent','/sys/fs/cgroup/memory.current'),('cgroupMax','/sys/fs/cgroup/memory.max')]:
        try:r[key]=Path(file).read_text().strip()
        except OSError:pass
    return r

def encoding_for(item):
    overrides=item.get('encodingOverrides',{})
    assert not set(overrides)-{'leadingSilenceKeepMs'}, 'Unsupported encoding override'
    if overrides:assert 0<=overrides['leadingSilenceKeepMs']<=250
    return {**ENCODING,**overrides}

def audio_filters(encoding):
    trim='silenceremove=start_periods=1:start_duration=0.015:start_threshold=-55dB'
    leading=trim
    if encoding.get('leadingSilenceKeepMs',0):leading+=f":start_silence={encoding['leadingSilenceKeepMs']/1000:.3f}"
    return f'{leading},areverse,{trim},areverse,afade=t=in:d=0.008,areverse,afade=t=in:d=0.012,areverse,adelay=35,apad=pad_dur=0.08,loudnorm=I=-19:TP=-2:LRA=11,aresample=24000'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model',type=Path,required=True,help='Pinned local Qwen Base directory with provenance.json')
    p.add_argument('--voice-design-model',type=Path,required=True,help='Pinned VoiceDesign metadata directory')
    p.add_argument('--catalog',type=Path,required=True,help='Exported SPEECH_LINES JSON')
    p.add_argument('--inputs',type=Path,required=True,help='scripts/voice-qwen.json')
    p.add_argument('--cast',type=Path,required=True,help='Voice cast JSON with reference provenance')
    p.add_argument('--references',type=Path,required=True,help='Directory of synthetic WAV references')
    p.add_argument('--output',type=Path,required=True,help='Staged runtime MP3/manifest directory')
    p.add_argument('--work-dir',type=Path,required=True,help='Checkpoints and original WAV output')
    p.add_argument('--threads',type=int,default=6)
    p.add_argument('--ids',nargs='*',help='Limit rendering to selected stable ids, preserving checkpoints')
    p.add_argument('--force',action='store_true',help='Rerender selected ids even when fingerprints match')
    args=p.parse_args()
    for exe in ('ffmpeg','ffprobe'):
        if shutil.which(exe) is None:raise RuntimeError('Missing executable '+exe)
    catalog=json.loads(args.catalog.read_text());inputs=json.loads(args.inputs.read_text());cast=json.loads(args.cast.read_text())
    lines=inputs['lines'];by_id={x['id']:x for x in catalog}
    assert len(by_id)==len(catalog) and set(by_id)==set(lines)
    for line in catalog:
        item=lines[line['id']];profile=cast[line['speakerId']]
        assert line['text']==item['sourceText'],line['id']
        assert line['speakerId']==item['speakerId']
        assert re.fullmatch(r'[a-zA-Z0-9._-]+',line['id'])
        assert item['referenceId']==profile['referenceId']
        assert item['referenceSha256']==profile['referenceSha256']
        reference_path=args.references/Path(profile['reference']['file']).name
        assert digest(reference_path)==profile['referenceSha256']
    selected=set(args.ids) if args.ids is not None else set(by_id)
    assert not selected-set(by_id)
    args.output.mkdir(parents=True,exist_ok=True)
    args.work_dir.mkdir(parents=True,exist_ok=True)
    run_lock=(args.work_dir/'render.lock').open('a+')
    try:fcntl.flock(run_lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('Another renderer holds render.lock; do not run a second model.')
    (args.work_dir/'ready.marker.json').unlink(missing_ok=True)
    run_state={'status':'running','stage':'preparing','pid':os.getpid(),'startedAtUnix':time.time(),'activeBatch':None}
    stop_heartbeat=threading.Event()
    def beat():
        while not stop_heartbeat.is_set():
            write_json(args.work_dir/'heartbeat.json',{**run_state,'updatedAtUnix':time.time(),'memory':memory()})
            stop_heartbeat.wait(5)
    heartbeat_thread=threading.Thread(target=beat,daemon=True);heartbeat_thread.start()
    def finish_heartbeat():
        stop_heartbeat.set();heartbeat_thread.join(timeout=2)
        if run_state['status']=='running':run_state['status']='stopped'
        write_json(args.work_dir/'heartbeat.json',{**run_state,'updatedAtUnix':time.time(),'memory':memory()})
    atexit.register(finish_heartbeat)
    raw_dir=args.work_dir/'raw';records_dir=args.work_dir/'records'
    raw_dir.mkdir(parents=True,exist_ok=True);records_dir.mkdir(parents=True,exist_ok=True)
    provenance=json.loads((args.model/'provenance.json').read_text())
    base_model={'id':provenance['id'],'revision':provenance['revision'],'sha256':digest(args.model/'model.safetensors'),'bytes':(args.model/'model.safetensors').stat().st_size}
    weight_entry=next(x for x in provenance['files'] if x['path']=='model.safetensors')
    assert base_model['sha256']==weight_entry['lfs']['oid']
    design_info=json.loads((args.voice_design_model/'model-provenance.json').read_text())
    design_model={'id':design_info['id'],'revision':design_info['sha'],'sha256':digest(args.voice_design_model/'model/model.safetensors'),'bytes':(args.voice_design_model/'model/model.safetensors').stat().st_size}
    import numpy as np,soundfile as sf,torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(args.threads);torch.set_num_interop_threads(1)
    model=None;prompt_cache={};audio_cache={};start=time.monotonic();finished={}
    def load_model():
        nonlocal model
        if model is None:
            run_state['stage']='loading'
            print('LOADING',base_model['id'],flush=True)
            model=Qwen3TTSModel.from_pretrained(str(args.model),device_map='cpu',dtype=torch.bfloat16,attn_implementation='sdpa')
            print('MODEL_LOADED',json.dumps(memory()),flush=True)
        return model
    # Commit every member of a completed batch consecutively; keep manifest order canonical.
    render_ids=[];seen=set()
    for authored in catalog:
        authored_id=authored['id'];item=lines[authored_id]
        group=inputs.get('batches',{}).get(item.get('batchId'),{'ids':[authored_id]})['ids']
        for id in group:
            # Historical batches retain old contexts; only current members determine order.
            if lines[id].get('batchId')!=item.get('batchId'):continue
            if id not in seen:render_ids.append(id);seen.add(id)
    assert set(render_ids)==set(by_id)
    for index,id in enumerate(render_ids,1):
        line=by_id[id];item=lines[id];profile=cast[line['speakerId']]
        reused=profile.get('reuseReferenceForSpeech',True) and id==profile['referenceSpeechId'] and item['synthesisText']==profile['reference']['text']
        used_model=design_model if reused else base_model
        batch=inputs.get('batches',{}).get(item.get('batchId'),{'ids':[id],'seed':item['seed']})
        line_generation=profile['reference']['generation'] if reused else {**GENERATION,'batchIds':batch['ids'],'batchSeed':batch['seed'],'batchTextsSha256':canonical_hash(batch.get('texts',[lines[x]['synthesisText'] for x in batch['ids']]))}
        line_encoding=encoding_for(item)
        recipe={'attempt':item.get('attempt',0),'model':used_model,'synthesisText':item['synthesisText'],'sourceText':item['sourceText'],'referenceSha256':profile['referenceSha256'],'seed':profile['reference']['seed'] if reused else item['seed'],'generation':line_generation,'encoding':line_encoding,'method':'synthetic-reference-original' if reused else 'synthetic-reference-conditioned'}
        fingerprint=canonical_hash(recipe);record_file=records_dir/(id+'.json');mp3=args.output/(id+'.mp3');raw=raw_dir/(id+'.wav')
        existing=json.loads(record_file.read_text()) if record_file.exists() else None
        valid=existing and existing.get('status')=='complete' and existing.get('fingerprint')==fingerprint and raw.exists() and mp3.exists() and digest(mp3)==existing['sha256'] and digest(raw)==existing['rawSha256']
        if valid and (not args.force or id not in selected):
            finished[id]=existing['runtimeEntry'];print('RESUME',index,len(catalog),id,flush=True);continue
        if id not in selected:continue
        # A file request pauses at a batch boundary after all generated peers commit.
        cache_key=(item.get('batchId',id),id)
        if (args.work_dir/'stop-after-batch.request').exists() and cache_key not in audio_cache:
            run_state.update(status='paused',stage='checkpoint-boundary',nextId=id)
            print('PAUSED_AT_CHECKPOINT',id,flush=True);break
        t=time.monotonic();print('RENDER',index,len(catalog),id,line['speakerId'],flush=True)
        if reused:
            shutil.copyfile(args.references/Path(profile['reference']['file']).name,raw)
            audio,sr=sf.read(raw,dtype='float32')
        else:
            engine=load_model();speaker=line['speakerId']
            if speaker not in prompt_cache:
                prompt_cache[speaker]=engine.create_voice_clone_prompt(ref_audio=str(args.references/Path(profile['reference']['file']).name),ref_text=profile['reference']['text'],x_vector_only_mode=False)
            if cache_key not in audio_cache:
                batch_ids=batch['ids'];batch_texts=batch.get('texts',[lines[x]['synthesisText'] for x in batch_ids])
                assert len(batch_ids)==len(batch_texts) and item['synthesisText']==batch_texts[batch_ids.index(id)]
                # One speaker per batch, fixed order and seed. Prompt tensors are cached once.
                assert all(by_id[x]['speakerId']==speaker for x in batch_ids)
                torch.manual_seed(batch['seed']);batch_started=time.monotonic()
                run_state.update(stage='synthesizing',activeBatch=item.get('batchId',id),batchIds=batch_ids,batchStartedAtUnix=time.time())
                print('BATCH',item.get('batchId',id),batch_ids,batch['seed'],flush=True)
                wavs,sr=engine.generate_voice_clone(text=batch_texts,language=['Russian']*len(batch_ids),voice_clone_prompt=prompt_cache[speaker]*len(batch_ids),**GENERATION)
                batch_elapsed=time.monotonic()-batch_started
                assert len(wavs)==len(batch_ids)
                for batch_id,wav in zip(batch_ids,wavs):audio_cache[(item.get('batchId',id),batch_id)]=(np.asarray(wav,dtype=np.float32),sr,batch_elapsed)
                run_state.update(stage='encoding',activeBatch=None)
                print('BATCH_DONE',batch_ids,round(batch_elapsed,2),json.dumps(memory()),flush=True)
            audio,sr,batch_elapsed=audio_cache.pop(cache_key)
            if not np.isfinite(audio).all() or len(audio)<sr*.2 or np.max(np.abs(audio))<.002:raise RuntimeError('Invalid audio '+id)
            if np.max(np.abs(audio))>.98:audio=audio*(.98/np.max(np.abs(audio)))
            temp=raw.with_name(raw.name+'.tmp');sf.write(temp,audio,sr,format='WAV',subtype='PCM_16');temp.replace(raw)
        if not np.isfinite(audio).all():raise RuntimeError('Non-finite audio '+id)
        # Trim only edge silence, keep all authored/inferred internal pauses.
        filters=audio_filters(line_encoding)
        temp_mp3=mp3.with_name(mp3.name+'.tmp')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(raw),'-af',filters,'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1','-f','mp3',str(temp_mp3)],check=True)
        temp_mp3.replace(mp3)
        info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(mp3)],text=True));duration=round(float(info['format']['duration']),3)
        if duration<.25 or mp3.stat().st_size<1000:raise RuntimeError('Empty MP3 '+id)
        entry={'url':f'assets/audio/voices/{id}.mp3','speakerId':line['speakerId'],'voice':profile['voice'],'duration':duration,'provider':PROVIDER,'license':'Apache-2.0','sha256':digest(mp3),'bytes':mp3.stat().st_size,'model':used_model['id'],'modelRevision':used_model['revision'],'referenceId':profile['referenceId'],'referenceSha256':profile['referenceSha256'],'textSha256':text_hash(line['text']),'renderInputSha256':text_hash(item['synthesisText'])}
        if item.get('encodingOverrides'):entry['encodingOverrides']=item['encodingOverrides']
        record={'status':'complete','id':id,'speakerId':line['speakerId'],'text':line['text'],'synthesisText':item['synthesisText'],'duration':duration,'rawDuration':len(audio)/sr,'sampleRate':sr,'sha256':entry['sha256'],'rawSha256':digest(raw),'fingerprint':fingerprint,'runtimeEntry':entry,'generation':recipe,'renderSeconds':round(time.monotonic()-t,3),'batchRenderSeconds':None if reused else round(batch_elapsed,3),'memory':memory()}
        write_json(record_file,record);finished[id]=entry
        write_json(args.work_dir/'progress.json',{'completed':len(finished),'total':len(catalog),'lastId':id,'elapsedSeconds':round(time.monotonic()-start,1),'memory':memory()})
        print('COMPLETE',len(finished),len(catalog),id,duration,record['renderSeconds'],json.dumps(memory()),flush=True)
    # Include validated unselected checkpoints, and retain canonical catalog order.
    finished={line['id']:finished[line['id']] for line in catalog if line['id'] in finished}
    meta={'version':2,'provider':PROVIDER,'license':'Apache-2.0','licenseUrl':'https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE','models':{'base':base_model,'voiceDesign':design_model},'runtime':f'python qwen-tts 0.1.1 / torch {torch.__version__} / transformers 4.57.3','dtype':'bfloat16','attention':'sdpa',**ENCODING,'profiles':cast,'renderInputPath':'scripts/voice-qwen.json','renderInputSha256':digest(args.inputs),'catalogSha256':digest(args.catalog),'generation':{**GENERATION,'batching':'fixed input batches, up to four similar-length lines of one speaker'},'voiceSource':'Original synthetic voices designed for fictional game characters; no external human voice samples','referencePolicy':'Only our own synthetic reference WAVs; original approved clips retained verbatim before loudness normalization','networkInference':False}
    write_json(args.output/'manifest.json',{**meta,'lines':finished})
    manifest_js='// Generated by scripts/render-voices-qwen.py. Do not edit by hand.\n'+'export const RECORDINGS = Object.freeze('+json.dumps(finished,ensure_ascii=False,indent=2)+');\n'+'export const RECORDING_META = Object.freeze('+json.dumps(meta,ensure_ascii=False,indent=2)+');\n'
    tmp=args.output/'manifest.js.tmp';tmp.write_text(manifest_js);tmp.replace(args.output/'manifest.js')
    if len(finished)==len(catalog):write_json(args.work_dir/'ready.marker.json',{'status':'complete','count':len(finished),'manifestSha256':digest(args.output/'manifest.json'),'inputSha256':digest(args.inputs),'finishedAtUnix':time.time()})
    if run_state['status']!='paused':run_state.update(status='complete' if len(finished)==len(catalog) else 'partial',stage='finished')
    run_state['completeRecords']=len(finished)
    print('FINISHED',len(finished),len(catalog),round(time.monotonic()-start,2),flush=True)
if __name__=='__main__':main()
