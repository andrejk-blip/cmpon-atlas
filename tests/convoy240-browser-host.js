'use strict';const frame=document.getElementById('game'),report=document.getElementById('report');
window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.kind==='citadel-qa')report.textContent=JSON.stringify(event.data.report,null,2);});
document.getElementById('start').onclick=async()=>{
 let html=await(await fetch('./entry-2.4.0.html',{cache:'no-store'})).text();
 frame.style.width=document.getElementById('viewport').value+'px';frame.style.height=document.getElementById('viewport').value==='780'?'430px':'780px';
 const config={checkpoint:document.getElementById('checkpoint').value,accelerated:document.getElementById('accelerated').checked,manual:document.getElementById('manual').checked};
 const prelude='<base href="'+new URL('../',location.href).href+'"><script>window.CONVOY_QA='+JSON.stringify(config)+';<\/script><script src="./tests/browser-qa-isolation.js?build=193qa3"><\/script>';
 html=html.replace('<head>','<head>'+prelude).replace('</body>','<script defer src="./tests/helpers/convoy240-inputs.js"><\/script><script defer src="./tests/convoy240-browser-driver.js?build=240rc2"><\/script></body>');frame.srcdoc=html;report.textContent='Загрузка цепочки 2.4.0…';
};
for(const action of ['audio','pause'])document.getElementById(action).onclick=()=>frame.contentWindow.postMessage({kind:'citadel-qa-control',action},location.origin);
