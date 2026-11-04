/* Each new-FTT requirement belongs to one area, using its outline section,
   never the potentially ambiguous requirement number. */
'use strict';
(function(root){
 const definitions=[
  ['cmpon','ЦМПОН','Обследования населения, разделы 7.15 и 8.10',['7.15','8.10'],1.35],
  ['collection','Сбор данных','Статистические и ведомственные данные',['4.4','5.1','6.6','7.3','8.5'],1.55],
  ['design','Проектирование','Проектирование статистических наблюдений',['5.2','6.5','6.9','7.4','8.3'],1.15],
  ['nsi','НСИ','Нормативная и справочная информация',['4.1','6.2','7.1','8.1'],1.4],
  ['indicators','Реестр показателей','Описание и ведение показателей',['4.2','6.3','7.2','8.2'],1.2],
  ['respondents','Респонденты и РОН','Реестр респондентов и объектов наблюдения',['4.3','6.4','7.7'],1.4],
  ['monitoring','Мониторинг производства','Мониторинг статистического производства',['7.5'],1.3],
  ['fpsr','ФПСР','Федеральный план статистических работ',['7.6'],1.5],
  ['administrative','Административное производство','Процессы административного производства',['7.8'],1.15],
  ['accounts','Пользователи и кабинеты','Профили, регистрация и личные кабинеты',['4.5','7.9','7.13'],1.35],
  ['storage','Хранение данных','Хранение и предоставление доступа к данным',['6.7','7.10','8.12'],1.5],
  ['approval','Согласование','Согласование и юридическая значимость',['6.8'],1.15],
  ['processing','Обработка и расчеты','Обработка, расчет итогов и портирование аудита',['7.11','8.6','8.9'],1.4],
  ['dissemination','Распространение','Распространение статистической информации',['7.12','8.7'],1.25],
  ['airfares','Данные об авиабилетах','Загрузка и предварительная обработка',['7.14'],1.6],
  ['national','Нацпроекты и госпрограммы','Показатели национальных проектов и государственных программ',['7.16'],1.5],
  ['support','Поддержка пользователей','Поддержка, сопровождение и внедрение',['8.8','9.5','9.6'],1.2],
  ['analytics','Нерегламентная аналитика','Нерегламентные аналитические запросы',['8.11'],1.35],
  ['security','Информационная безопасность','Требования к обеспечению ИБ',['9.4'],1.2],
  ['integration','Интеграции','Требования к взаимодействию с другими системами',['9.2'],1],
  ['architecture','Архитектура и общие условия','Границы сервиса, архитектура, общие функции',['1.9','3','6.1'],1.4],
  ['operation','Эксплуатационные требования','Интерфейс, состав работ, показатели, надежность и диагностика',['9.1','9.7','9.8','9.9','9.10','9.11','9.12'],1.2]
 ];
 const groups=definitions.map(([id,title,description,sections,aspect],i)=>({id,title,description,sections,aspect,index:i+1}));
 const bySection=new Map();
 for(const g of groups)for(const section of g.sections){
  if(bySection.has(section))throw new Error('Duplicate direction section: '+section);
  bySection.set(section,g.id);
 }
 const sectionRoot=row=>String(row.section).split('.').slice(0,2).join('.');
 const direction=row=>bySection.get(sectionRoot(row));
 function partition(rows){
  const result=groups.map(g=>({...g,rows:[]})),lookup=new Map(result.map(g=>[g.id,g]));
  const seen=new Set();
  for(const row of rows){
   const group=lookup.get(direction(row));
   if(!group)throw new Error('Unmapped section: '+row.section+' ('+row.id+')');
   if(seen.has(row.id))throw new Error('Duplicate requirement: '+row.id);
   seen.add(row.id);group.rows.push(row);
  }
  return result.filter(g=>g.rows.length);
 }
 // A convex, connected polyomino with exactly one cell per requirement.
 // Cell order follows the document; changing a filter never changes coordinates.
 function shape(n,aspect=1.35){
  if(!Number.isInteger(n)||n<1)return {width:0,height:0,cells:[],outline:''};
  const width=Math.max(2,Math.ceil(Math.sqrt(n*aspect/.76)));
  const height=Math.max(2,Math.ceil(n/(width*.72)));
  const candidates=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)candidates.push({x,y,score:((x-(width-1)/2)/width)**2+((y-(height-1)/2)/height)**2});
  const chosen=candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x).slice(0,n);
  const minX=Math.min(...chosen.map(p=>p.x)),minY=Math.min(...chosen.map(p=>p.y));
  const cells=chosen.map(p=>({x:p.x-minX,y:p.y-minY})).sort((a,b)=>a.y-b.y||a.x-b.x);
  const keys=new Set(cells.map(p=>p.x+','+p.y)),edge=[];
  for(const {x,y} of cells){
   if(!keys.has(x+','+(y-1)))edge.push(`M${x} ${y}h1`);
   if(!keys.has((x+1)+','+y))edge.push(`M${x+1} ${y}v1`);
   if(!keys.has(x+','+(y+1)))edge.push(`M${x+1} ${y+1}h-1`);
   if(!keys.has((x-1)+','+y))edge.push(`M${x} ${y+1}v-1`);
  }
  return {width:Math.max(...cells.map(p=>p.x))+1,height:Math.max(...cells.map(p=>p.y))+1,cells,outline:edge.join('')};
 }
 const api={groups,sectionRoot,direction,partition,shape};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AtlasDirections=api;
})(typeof window==='object'?window:globalThis);
