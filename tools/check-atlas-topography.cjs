/* Invariant checks for the exact-count, single-assignment visual map. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const {groups,partition,shape,direction}=require('../assets/atlas-directions.js');
const load=name=>JSON.parse(fs.readFileSync(path.join(root,'assets/atlas-2026',name+'.json')));
const cmpon=load('cmpon'),other=load('other'),rows=[...cmpon,...other];
const areas=partition(rows);
assert.equal(rows.length,2809);
assert.equal(areas.length,22);
assert.equal(areas.reduce((n,g)=>n+g.rows.length,0),rows.length);
assert.equal(new Set(areas.flatMap(g=>g.rows.map(r=>r.id))).size,rows.length);
assert.equal(areas.find(g=>g.id==='cmpon').rows.length,371);
assert(cmpon.every(r=>direction(r)==='cmpon'));
assert(other.every(r=>direction(r)!=='cmpon'));
assert.throws(()=>partition([{id:'unknown',section:'999.1'}]),/Unmapped/);
assert.throws(()=>partition([rows[0],rows[0]]),/Duplicate/);
function checkShape(n,aspect){
 const s=shape(n,aspect),keys=new Set(s.cells.map(p=>p.x+','+p.y));
 assert.equal(s.cells.length,n);assert.equal(keys.size,n);
 const seen=new Set(),pending=[s.cells[0]];
 while(pending.length){const p=pending.pop(),key=p.x+','+p.y;if(seen.has(key))continue;seen.add(key);for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const q={x:p.x+dx,y:p.y+dy},k=q.x+','+q.y;if(keys.has(k)&&!seen.has(k))pending.push(q)}}
 assert.equal(seen.size,n,'Disconnected shape at '+n);
 for(const p of s.cells)assert(p.x>=0&&p.x<s.width&&p.y>=0&&p.y<s.height);
 for(let y=0;y<s.height;y++){const xs=s.cells.filter(p=>p.y===y).map(p=>p.x);if(xs.length)assert.equal(Math.max(...xs)-Math.min(...xs)+1,xs.length,'Gap in shape');}
}
for(const g of areas)checkShape(g.rows.length,g.aspect);
// Exercise transitions around all row-width boundaries, including tiny areas.
for(let n=1;n<=400;n++)checkShape(n,1.35);
for(const src of ['c39','ftt571']){
 const counts={D:0,P:0,I:0,N:0};for(const r of rows){assert(r.maps[src]);counts[r.maps[src].status]++}
 assert.equal(Object.values(counts).reduce((a,b)=>a+b),2809);console.log(src,counts);
}
assert(groups.every(g=>areas.some(a=>a.id===g.id)));
console.log('PASS: 2,809 unique requirements; 22 complete, connected areas; ЦМПОН 371.');
