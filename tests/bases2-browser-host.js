'use strict';
const frame=document.getElementById('game'),report=document.getElementById('report');
let latest=null;
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.kind!=='citadel-qa')return;latest=event.data.report;report.textContent=JSON.stringify(latest,null,2);});
document.getElementById('start').onclick=async()=>{
 const mode=document.getElementById('mode').value;
 const checkpoint=document.getElementById('checkpoint').value,manual=document.getElementById('manual').checked;
 let html=await(await fetch('./entry-2.0.0.html',{cache:'no-store'})).text();
 if(mode==='baseline')html=html.replaceAll('citadel-sfx-v1.9.3','citadel-sfx-v1.9.1').replaceAll('citadel-comic-v1.9.3','citadel-comic-v1.9.1').replace(/<script defer src="\.\/assets\/citadel-runtime[^<]+<\/script>/,'');
 const prelude='<base href="'+new URL('../',location.href).href+'"><script>window.CITADEL_QA_MODE='+JSON.stringify(mode)+';window.CITADEL_QA_CHECKPOINT='+JSON.stringify(checkpoint)+';window.CITADEL_QA_MANUAL='+manual+';window.CITADEL_QA_ACCELERATED='+document.getElementById('accelerated').checked+';<\/script><script src="./tests/browser-qa-isolation.js?build=193qa3"><\/script>';
 html=html.replace('<head>','<head>'+prelude).replace('</body>','<script defer src="./tests/helpers/campaign-inputs.js?build=193qa3"><\/script><script defer src="./tests/bases2-browser-driver.js?build=200qa1"><\/script></body>');
 frame.srcdoc=html;report.textContent='Загрузка реальной цепочки скриптов…';
};
document.getElementById('audio').onclick=()=>frame.contentWindow.postMessage({kind:'citadel-qa-control',action:'audio'},location.origin);
document.getElementById('pause').onclick=()=>frame.contentWindow.postMessage({kind:'citadel-qa-control',action:'pause'},location.origin);
document.getElementById('download').onclick=()=>{if(!latest)return;const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='citadel-browser-'+latest.mode+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
