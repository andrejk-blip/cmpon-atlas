'use strict';const frame=document.getElementById('game'),report=document.getElementById('report');
window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.kind==='citadel-qa')report.textContent=JSON.stringify(event.data.report,null,2);});
function resizeTestViewport(){const width=document.getElementById('viewport').value;frame.style.width=width+'px';frame.style.height=width==='780'?'430px':width==='640'?'360px':'780px';}
document.getElementById('viewport').onchange=resizeTestViewport;
document.getElementById('start').onclick=async()=>{
 const config={freeze:document.getElementById('freeze').checked,mode:document.getElementById('mode').value,scene:document.getElementById('scene').value,accelerated:document.getElementById('accelerated').checked,manual:document.getElementById('manual').checked,holdQuestions:document.getElementById('questions').checked};
 resizeTestViewport();
 let html=await(await fetch('./entry-2.9.0.html',{cache:'no-store'})).text();
 const prelude='<base href="'+new URL('../',location.href).href+'"><script>window.AUDIT_QA='+JSON.stringify(config)+';<\/script><script src="./tests/browser-qa-isolation.js?build=193qa3"><\/script>';
 html=html.replace('<head>','<head>'+prelude).replace('</body>','<script defer src="./tests/helpers/campaign-inputs.js?build=260r3"><\/script><script defer src="./tests/helpers/convoy260-inputs.js?build=260r3"><\/script><script defer src="./tests/helpers/orbital260-inputs.js?build=260r3"><\/script><script defer src="./tests/helpers/base270-inputs.js?build=270r1"><\/script><script defer src="./tests/helpers/swarm270-inputs.js?build=270r1"><\/script><script defer src="./tests/audit290-browser-driver.js?build=290r1"><\/script></body>');frame.srcdoc=html;report.textContent='Загрузка проверяемой цепочки 2.9.0…';
};
for(const action of ['audio','pause'])document.getElementById(action).onclick=()=>frame.contentWindow.postMessage({kind:'citadel-qa-control',action},location.origin);
