/* The illustrated atlas is a presentation of existing campaign progress.
 * Selection and motion preferences are transient: no progress, score or save writes. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_LIVING_MAP||!globalThis.CITADEL_CAMPAIGN)return;
 const C=CITADEL_CAMPAIGN,old={overlay:arcadeOverlayHTML,action:arcadeAction},views=new WeakMap();
 const ORIGINAL='./assets/citadel-document-atlas-v2.14.0.webp',PLATE='./assets/map2174/atlas-clean.webp';
 const REGIONS=Object.freeze([
  {id:'goal',label:'Цель',name:'Обсерватория цели',hint:'Телескоп ищет ориентир. Цель объясняет, какой результат нужен.',xy:[25,17]},
  {id:'scope',label:'Границы',name:'Крепость границ',hint:'Створки открывают проход. Границы определяют, что входит в работу.',xy:[70,17]},
  {id:'terms',label:'Термины',name:'Разговор об общем смысле',hint:'Аналитики обсуждают понятия. Одно слово должно означать одно и то же.',xy:[27,43]},
  {id:'links',label:'Связи',name:'Острова интеграций',hint:'Антенна принимает сигнал. Связи объединяют участников и системы.',xy:[72,44]},
  {id:'acceptance',label:'Приёмка',name:'Врата приёмки',hint:'Пакет поднимается к вратам. Приёмка подтверждает результат доказательствами.',xy:[50,73]}
 ]);
 const ids=new Set(REGIONS.map(x=>x.id)),escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const isOpen=e=>C.active(e)&&(C.state(e).modal?.type==='document'||!C.state(e).modal&&e.status==='campaignsummary');
 const state=e=>{
  const s=C.state(e),revision=(s.completed||[]).length;
  if(!views.has(e))views.set(e,{selected:ids.has(s.changed)?s.changed:'goal',motion:true,cue:0,revision,changed:s.changed});
  const v=views.get(e);
  if(v.revision!==revision||v.changed!==s.changed){v.revision=revision;v.changed=s.changed;v.selected=ids.has(s.changed)?s.changed:v.selected;v.cue=0;}
  return v;
 };
 const refresh=()=>{ARCADE.overlayToken='';updateArcadeOverlay();};
 let assets='idle',pending=0,attempt=0;
 const retained=[];
 function warm(){
  if(assets!=='idle'||typeof Image!=='function')return;
  assets='loading';pending=2;const current=++attempt;
  for(const src of [ORIGINAL,PLATE]){
   const image=new Image();retained.push(image);image.decoding='async';image.fetchPriority='high';
   image.onload=()=>{if(current!==attempt||assets==='error')return;if(--pending===0){assets='ready';if(isOpen(ARCADE.engine))refresh();}};
   image.onerror=()=>{if(current!==attempt)return;assets='error';if(isOpen(ARCADE.engine))refresh();};image.src=src;
  }
 }
 const shapes={
  telescope:'M397 216L405 207 412 206 442 188 453 190 461 199 459 209 431 228 424 235 419 251 412 253 410 233 404 232Z',
  womanBody:'M190 528L200 487 218 464 245 446 269 451 296 467 319 486 328 510 310 526 272 533 230 541Z',
  womanHead:'M220 449L220 430 226 416 220 407 231 389 247 384 269 380 283 373 305 378 319 390 319 406 329 419 321 424 324 433 316 446 300 457 290 471 267 472 250 460 233 457Z',
  womanArm:'M287 505L315 493 333 475 345 462 354 458 358 449 364 451 361 461 369 460 384 456 402 453 410 458 405 464 388 474 369 481 351 484 336 506 320 520Z',
  manBody:'M509 520L510 490 526 468 552 447 579 443 611 445 637 451 659 465 678 485 696 530 668 539 627 533 579 533 546 527Z',
  manHead:'M536 415L543 400 546 386 560 374 582 376 601 381 613 390 626 399 628 414 622 426 613 434 610 450 602 470 580 474 563 457 554 452 548 446 542 442 542 430 535 426Z',
  manHand:'M511 492L517 468 530 449 543 443 557 445 564 454 555 461 550 478 542 493 538 508 521 516Z',
  crystalTeal:'M333 367L345 345 377 322 412 325 441 331 456 350 449 379 439 398 413 413 390 412 358 437 368 409 347 400Z',
  crystalGold:'M402 388L415 364 447 350 475 346 507 352 536 378 524 409 498 426 508 460 475 439 448 442 421 426 410 411Z',
  dish:'M1303 349L1312 336 1339 326 1352 324 1364 330 1366 339 1358 350 1346 359 1332 364 1324 372 1315 367 1321 358 1310 359Z',
  papers:'M681 744L701 736 702 717 721 712 722 696 805 676 814 680 815 704 833 703 835 722 851 724 852 837 684 837Z',
  ship:'M1032 30L1065 27 1081 20 1102 18 1112 7 1117 20 1152 18 1163 6 1171 8 1174 19 1203 22 1238 29 1234 37 1201 43 1192 53 1181 60 1173 63 1168 46 1131 47 1105 41 1072 38 1040 38Z'
 };
 // Clipping the original illustration keeps the painted figures and their identity.
 // The restoration plate is visible only inside these object silhouettes.
 function art(v){
  const clip=Object.entries(shapes).map(([id,d])=>'<clipPath id="map2174-'+id+'"><path d="'+d+'"/></clipPath>').join('');
  const parts=(id,cls='')=>'<g class="map2174-part '+cls+'"><image href="'+ORIGINAL+'" width="1536" height="1024" clip-path="url(#map2174-'+id+')"/></g>';
  const group=(id,html)=>'<g class="map2174-region map2174-region-'+id+(v.selected===id?' is-selected':'')+(v.cue&&v.selected===id?' has-cue':'')+'">'+html+'</g>';
  const clearing=Object.values(shapes).map(d=>'<path d="'+d+'" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>').join('');
  return '<svg class="map2174-art" viewBox="0 0 1536 1024" aria-hidden="true" focusable="false"><defs>'+clip+'<mask id="map2174-cleared" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect width="1536" height="1024" fill="#000"/>'+clearing+'</mask><radialGradient id="map2174-gold"><stop stop-color="#fff7bf" stop-opacity=".7"/><stop offset="1" stop-color="#ffcf68" stop-opacity="0"/></radialGradient></defs>'+
   '<image href="'+ORIGINAL+'" width="1536" height="1024"/>'+
   '<image href="'+PLATE+'" width="1536" height="1024" mask="url(#map2174-cleared)"/>'+
   group('goal','<g class="map2174-goal-cue">'+parts('telescope','map2174-telescope')+'<g class="map2174-astrolabe"><path d="M378 53V185M317 119H438"/><circle cx="378" cy="119" r="38"/></g></g>')+
   group('scope','<ellipse class="map2174-gate-light" cx="1020" cy="267" rx="52" ry="57" fill="url(#map2174-gold)"/><g class="map2174-gate"><path class="map2174-door map2174-door-left" d="M1007 254Q1007 242 1020 238V288L1007 293Z"/><path class="map2174-door map2174-door-right" d="M1020 238Q1034 241 1036 252V290L1020 288Z"/></g><path class="map2174-border-signal" d="M870 226L909 187 973 166 1044 129 1159 129 1229 151 1285 189"/>')+
   group('terms','<g class="map2174-woman">'+parts('womanBody')+parts('womanHead','map2174-woman-head')+parts('womanArm','map2174-woman-arm')+'</g><g class="map2174-man">'+parts('manBody')+parts('manHead','map2174-man-head')+parts('manHand','map2174-man-hand')+'</g>'+parts('crystalTeal','map2174-crystal-teal')+parts('crystalGold','map2174-crystal-gold'))+
   group('links',parts('dish','map2174-dish')+'<g class="map2174-radio"><path d="M1360 320Q1391 340 1375 361"/><path d="M1377 307Q1425 338 1401 378"/></g><path class="map2174-link-signal" d="M907 405Q1008 384 1043 437T1315 377M1029 458Q1164 427 1296 506"/>')+
   group('acceptance',parts('papers','map2174-papers')+'<path class="map2174-approval" d="M723 771L747 795 792 747"/>')+
   '<g class="map2174-ship">'+parts('ship')+'<path class="map2174-thrust" d="M1102 42L1066 49M1182 51L1158 67"/></g>'+
   '</svg>';
 }
 function mapHTML(e){
  warm();const s=C.state(e),v=state(e),selected=REGIONS.find(x=>x.id===v.selected),ready=!!s.document[v.selected];
  const button=r=>'<button type="button" data-action="map2174-select" data-value="'+r.id+'" aria-pressed="'+(v.selected===r.id)+'" aria-controls="map2174-detail" class="map2174-select '+(s.document[r.id]?'is-built ':'')+(s.changed===r.id?'is-changed':'')+'"><span aria-hidden="true">'+(s.document[r.id]?'✓':'◇')+'</span>'+r.label+'</button>';
  const staticArt='<img class="map2174-static" src="'+ORIGINAL+'" width="1536" height="1024" decoding="async" alt="Раскрытая карта-книга: обсерватория, крепость, беседа аналитиков, острова связей и врата приёмки">';
  const assetNotice=assets==='loading'?'<span class="map2174-load" role="status">Оживают детали карты…</span>':assets==='error'?'<span class="map2174-load">Карта доступна без движения. <button type="button" data-action="map2174-retry">Повторить</button></span>':'';
  return '<div class="map2174-composition" data-motion="'+(v.motion?'on':'off')+'" data-selected="'+v.selected+'"><div class="document-atlas map2174-map" role="group" aria-label="Живая карта разделов документа">'+(assets==='ready'?art(v):staticArt)+assetNotice+'</div><nav class="map2174-regions" aria-label="Разделы карты">'+REGIONS.map(button).join('')+'</nav><div class="map2174-detail" id="map2174-detail" aria-live="polite"><div><strong>'+selected.name+'</strong><p>'+selected.hint+'</p><small>'+(ready?'✓ Раздел собран':'◇ Раздел предстоит собрать')+'</small></div><button type="button" class="map2174-motion" data-action="map2174-motion" aria-pressed="'+v.motion+'">Движение: '+(v.motion?'вкл':'выкл')+'</button></div></div>';
 }
 function enhance(html,e){
  if(!isOpen(e)||!html.includes('document-atlas'))return html;
  const start=html.indexOf('<div class="document-atlas"'),end=html.indexOf('<div class="chapter-stamps"',start);
  if(start<0||end<0)return html;
  return (html.slice(0,start)+mapHTML(e)+html.slice(end)).replace('xp-desk visual-document','xp-desk visual-document map2174-screen');
 }
 arcadeOverlayHTML=function(){return enhance(old.overlay.apply(this,arguments),ARCADE.engine);};
 arcadeAction=function(action,value){
  const e=ARCADE.engine;
  if(['map2174-select','map2174-motion','map2174-retry'].includes(action)&&isOpen(e)){
   const v=state(e);
   if(action==='map2174-select'&&ids.has(value)){v.selected=value;v.cue++;refresh();globalThis.document?.querySelector('.map2174-select[data-value="'+value+'"]')?.focus({preventScroll:true});}
   else if(action==='map2174-motion'){v.motion=!v.motion;refresh();globalThis.document?.querySelector('[data-action="map2174-motion"]')?.focus({preventScroll:true});}
   else if(action==='map2174-retry'&&assets==='error'){assets='idle';retained.length=0;refresh();}
   return true;
  }
  return old.action.apply(this,arguments);
 };
 globalThis.CITADEL_LIVING_MAP=Object.freeze({version:'2.17.4',regions:REGIONS,enhance,mapHTML,assetStatus:()=>assets});
})();
