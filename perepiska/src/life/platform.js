// Platform boundary. Replace this adapter for native storage / storefront builds.
const KEY='perepiska.life.v2',PREF='perepiska.life.preferences.v2';
// Each tab retains the exact value it loaded or successfully wrote. A stale tab
// must reload (or explicitly acknowledge a reset/import) before saving again.
let lastObservedSave = null;
export const platform={
 lastSaveError: null,
 load(){
  let serialized;
  try {
   serialized = localStorage.getItem(KEY);
   lastObservedSave = serialized;
   this.lastSaveError = null;
  } catch {
   this.lastSaveError = 'storage';
   return null;
  }
  try { return JSON.parse(serialized || 'null'); } catch { return null; }
 },
 save(state){
  try {
   if (localStorage.getItem(KEY) !== lastObservedSave) {
    this.lastSaveError = 'conflict';
    return false;
   }
   const serialized = JSON.stringify(state);
   if (typeof serialized !== 'string') throw new TypeError('Save must be serializable');
   localStorage.setItem(KEY, serialized);
   lastObservedSave = serialized;
   this.lastSaveError = null;
   return true;
  } catch {
   this.lastSaveError = 'storage';
   return false;
  }
 },
 // Call only for an explicit import/reset whose replacement is intentional.
 acceptCurrentSave(){
  try {
   lastObservedSave = localStorage.getItem(KEY);
   this.lastSaveError = null;
   return true;
  } catch {
   this.lastSaveError = 'storage';
   return false;
  }
 },
 preferences(){try{return JSON.parse(localStorage.getItem(PREF)||'{}')}catch{return {}}},
 setPreferences(value){try{localStorage.setItem(PREF,JSON.stringify(value))}catch{}},
 export(state){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='perepiska-life-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},
 async offline(){if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch{ /* Initial preview has no service worker yet. */ }}}
};
