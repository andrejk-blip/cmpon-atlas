/* DOM-visible test evidence only; no automatic gameplay or status grants. */
(function(){
  'use strict';
  setInterval(()=>parent.postMessage({kind:'launch231-report',memory:LAUNCH_QA_MEMORY(),report:{
    version:APP_RELEASE.version,scenario:LAUNCH_QA.scenario,width:innerWidth,
    state:ARCADE.engine?.status,elapsed:ARCADE.engine?.elapsed,shots:ARCADE.engine?.shots,
    seed:ARCADE.engine?.seed,score:ARCADE.engine?.score,attached:CUP.attached,
    localSaved:!!localStorage.getItem('cmpon.citadel.local.v1'),launch:CITADEL_LAUNCH.status(),
    runtime:globalThis.CITADEL_RUNTIME?.diagnostic?.(),errors:LAUNCH_QA_ERRORS.slice(-8)
  }},location.origin),1000);
})();
