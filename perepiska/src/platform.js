// Platform boundary. Replace this adapter for native storage / storefront builds.
const KEY='perepiska.save.v1',PREF='perepiska.preferences.v1';
export const platform={
 load(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}},
 save(state){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch{return false}},
 preferences(){try{return JSON.parse(localStorage.getItem(PREF)||'{}')}catch{return {}}},
 setPreferences(value){try{localStorage.setItem(PREF,JSON.stringify(value))}catch{}},
 export(state){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='perepiska-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},
 async offline(){if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch{ /* Initial preview has no service worker yet. */ }}}
};
