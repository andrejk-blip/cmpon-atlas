from pathlib import Path
import os,json,time,resource,hashlib
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import torch,soundfile as sf
from qwen_tts import Qwen3TTSModel
r=Path(__file__).parent;out=r/'comparison/batch2';out.mkdir(parents=True,exist_ok=True)
cat={x['id']:x for x in json.loads((r/'catalog.json').read_text())};cast=json.loads((r/'voice-cast.json').read_text())
ids=['chat.friend.bright.anna','chat.friend.calm.anna'];items=[cat[x] for x in ids]
torch.set_num_threads(6);torch.set_num_interop_threads(1)
m=Qwen3TTSModel.from_pretrained(str(r/'models/1.7B'),device_map='cpu',dtype=torch.bfloat16,attn_implementation='sdpa')
prompt=m.create_voice_clone_prompt(ref_audio=str(r/'references/anna.wav'),ref_text=cast['anna']['reference']['text'],x_vector_only_mode=False)[0]
seed=32117002;torch.manual_seed(seed);t=time.monotonic();print('GENERATE_BATCH',ids,flush=True)
wavs,sr=m.generate_voice_clone(text=[x['text'] for x in items],language=['Russian']*2,voice_clone_prompt=[prompt,prompt],non_streaming_mode=True,max_new_tokens=400,do_sample=True,top_p=.9,temperature=.8)
elapsed=time.monotonic()-t
for item,wav in zip(items,wavs):
 p=out/(item['id']+'.wav');sf.write(p,wav,sr,subtype='PCM_16')
 data={**item,'synthesisText':item['text'],'model':'Qwen/Qwen3-TTS-12Hz-1.7B-Base','referenceId':'anna-synthetic-01','referenceSha256':cast['anna']['referenceSha256'],'seed':seed,'batchIds':ids,'batchRenderSeconds':elapsed,'duration':len(wav)/sr,'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 (out/(item['id']+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
 print('RESULT',json.dumps(data,ensure_ascii=False),flush=True)
print('THROUGHPUT',sum(len(x)/sr for x in wavs)/elapsed,flush=True)
