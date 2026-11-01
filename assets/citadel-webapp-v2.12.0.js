/* Dedicated entry shares the tested engine and local saves with the Atlas. */
(()=>{
 'use strict';
 if(!document.body.classList.contains('citadel-webapp'))return;
 const expand=()=>{if(STATE.view==='arcade'&&!ARCADE.expanded)arcadeAction('arcade-expand');};
 const mount=mountArcade;mountArcade=function(...args){const result=mount.apply(this,args);expand();return result;};
 const action=arcadeAction;arcadeAction=function(name,value){
  if(name==='arcade-expand'&&ARCADE.expanded)return true;
  if(name==='view'&&value!=='arcade')return true;
  return action.call(this,name,value);
 };
 expand();
})();
