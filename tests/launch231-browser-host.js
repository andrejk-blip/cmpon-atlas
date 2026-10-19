'use strict';
const frame=document.getElementById('game'), report=document.getElementById('report');
let memory=[];
window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.data?.kind!=='launch231-report')return;
  report.textContent=JSON.stringify(event.data.report,null,2);memory=event.data.memory;
});
async function openGame(restore){
  if(!restore)memory=[];
  const scenario=document.getElementById('scenario').value;
  let html=await(await fetch('./entry-2.3.1.html',{cache:'no-store'})).text();
  const prelude='<base href="'+new URL('../',location.href).href+'"><script>window.LAUNCH_QA='+JSON.stringify({scenario,memory}).replace(/</g,'\\u003c')+';<\/script><script src="./tests/launch231-browser-isolation.js"><\/script>';
  html=html.replace('<head>','<head>'+prelude).replace('</body>','<script defer src="./tests/launch231-browser-driver.js?build=231r2"><\/script></body>');
  frame.srcdoc=html;report.textContent='Загрузка тестовой игры…';
}
document.getElementById('start').onclick=()=>openGame(false);
document.getElementById('reload').onclick=()=>openGame(true);
