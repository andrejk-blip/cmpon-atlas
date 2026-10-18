/* Citadel 1.9.2: viewport-safe prologue, monochrome UI icons, low-FX convoy motion.
 * No changes to campaign rules, storage, analytics or access permissions.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_UI_FIXES) return;
  const VERSION = '1.9.2';
  const paths = {
    external: 'M7 17 17 7M7 7h10v10',
    play: 'm8 4 12 8-12 8Z',
    pause: 'M8 4v16M16 4v16',
    next: 'M4 12h16m-6-6 6 6-6 6',
    back: 'M20 12H4m6-6-6 6 6 6',
    down: 'M12 4v16m-6-6 6 6 6-6',
    up: 'M12 20V4m-6 6 6-6 6 6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    refresh: 'M20 11a8 8 0 1 0-2 7M20 4v7h-7',
    enter: 'M20 4v9H4m5-5-5 5 5 5',
    check: 'm5 12 4 4L20 5',
    close: 'm6 6 12 12M6 18 18 6',
    music: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1m11-2c0 4-6 4-6 1s6-4 6-1',
    sound: 'm3 9 5 0 5-5v16l-5-5H3ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
    expand: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
    trophy: 'M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8',
    gear: 'M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    target: 'M12 2v4m0 12v4M2 12h4m12 0h4M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0'
  };
  const glyphs = { '↗':'external','▶':'play','▷':'play','⏵':'play','⏸':'pause','Ⅱ':'pause',
    '→':'next','←':'back','↑':'up','↓':'down','☰':'menu','↻':'refresh','↺':'refresh','↵':'enter',
    '✓':'check','✔':'check','✕':'close','✖':'close','♫':'music','♪':'music','⛶':'expand','🏆':'trophy','⌖':'target','⚙':'gear','🔈':'sound' };
  const symbol = /[↗▶▷⏵⏸Ⅱ→←↑↓☰↻↺↵✓✔✕✖♫♪⛶⌖⚙]|\uD83C\uDFC6|\uD83D\uDD08/g;
  const controls = 'button,a,[role="button"],[aria-hidden="true"],.review-chip';
  function replaceText(node) {
    const parent = node.parentElement;
    if (!parent || !parent.closest(controls) || parent.closest('svg,script,style,textarea,pre,code,[contenteditable]')) return;
    const value = node.nodeValue;
    symbol.lastIndex = 0;
    if (!symbol.test(value)) return;
    symbol.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let from = 0, match;
    while ((match = symbol.exec(value))) {
      if (match.index > from) frag.appendChild(document.createTextNode(value.slice(from, match.index)));
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('class','citadel-ui-icon');svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',paths[glyphs[match[0]]]);svg.appendChild(path);frag.appendChild(svg);
      from = symbol.lastIndex;
      // Variation selectors and the combining strike belong to the replaced glyph.
      let muted=false;
      while (/^[\uFE0E\uFE0F\u0338]$/.test(value[from] || '')) {if(value[from]==='\u0338')muted=true;from++;}
      if(muted){const strike=document.createElementNS('http://www.w3.org/2000/svg','path');strike.setAttribute('d','M3 3 21 21');svg.appendChild(strike);}
      symbol.lastIndex = from;
    }
    if (from < value.length) frag.appendChild(document.createTextNode(value.slice(from)));
    parent.replaceChild(frag,node);
  }
  function clean(root) {
    if (root.nodeType === 3) { replaceText(root); return; }
    if (root.nodeType !== 1 || root.matches('svg,script,style,textarea,pre,code')) return;
    const walker = document.createTreeWalker(root,4), nodes=[];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceText);
  }
  // Inspect only changed nodes, not the entire page on every HUD update.
  if (document.body && typeof document.createTreeWalker === 'function') {
    clean(document.body);
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'characterData') replaceText(r.target);
          else for (const n of r.addedNodes) if (n.isConnected) clean(n);
        }
      });
      observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    }
  }
  function viewport() {
    const v = globalThis.visualViewport, el = document.documentElement;
    const height = v?.height || globalThis.innerHeight;
    if (!el?.style || !Number.isFinite(height)) return;
    el.style.setProperty('--citadel-visual-height',Math.round(height)+'px');
    el.style.setProperty('--citadel-visual-top',Math.round(v?.offsetTop || 0)+'px');
  }
  viewport();
  globalThis.addEventListener?.('resize',viewport,{passive:true});
  globalThis.visualViewport?.addEventListener?.('resize',viewport,{passive:true});
  globalThis.visualViewport?.addEventListener?.('scroll',viewport,{passive:true});
  if (typeof arcadeOverlayHTML === 'function') {
    const overlay = arcadeOverlayHTML;
    arcadeOverlayHTML = function () {
      const html = overlay.apply(this,arguments);
      if (!html.includes('class="citadel-prologue"')) return html;
      return html.replace('<h3 id="prologue-title">',
        '<div class="prologue-reading" tabindex="0" role="region" aria-label="Текст вступления"><h3 id="prologue-title">')
        .replace('<nav class="prologue-nav"','</div><nav class="prologue-nav"');
    };
    globalThis.addEventListener?.('keydown',event => {
      const panel = document.querySelector('#arcade-overlay.citadel-prologue-open .citadel-prologue');
      if (!panel) return;
      if (event.key === 'Tab') {
        const nodes=[...panel.querySelectorAll('button:not([disabled]),[tabindex="0"]')];
        const i=nodes.indexOf(document.activeElement);
        if (nodes.length && (i<0 || (event.shiftKey ? i===0 : i===nodes.length-1))) {
          event.preventDefault();nodes[event.shiftKey?nodes.length-1:0].focus();
        }
        event.stopImmediatePropagation();
        return;
      }
      if (event.target?.closest?.('.prologue-reading') &&
          ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) {
        // Allow native scrolling without moving the ship or changing comic pages.
        event.stopImmediatePropagation();
      }
    },true);
  }
  let convoyInstalled = false;
  if (typeof expeditionHyperScene === 'function') {
    const original = expeditionHyperScene;
    expeditionHyperScene = function (e,time,fx,hidePlayer) {
      const items = original.apply(this,arguments);
      if (fx || !e?.escort) return items;
      // The low-FX scene has the same 15 hoops and 20 streaks as before.
      // Move their geometry using saved simulation time; never force full FX.
      const t = Number.isFinite(e.escort.time) ? e.escort.time : 0;
      function moveZ(i,z) {
        const item=items[i]; if (!item?.model || !item.pos) return;
        item.pos=[item.pos[0],item.pos[1],z];item.model[14]=z;
      }
      let at=1;
      for(let i=0;i<15;i++) {
        const z=55-((t*115+i*45)%680);
        moveZ(at++,z);
        if(i%3===0){moveZ(at++,z);moveZ(at++,z);}
      }
      for(let i=0;i<20;i++)moveZ(at++,65-((t*(165+i%5*18)+i*47)%710));
      return items;
    };
    convoyInstalled=true;
  }
  globalThis.CITADEL_UI_FIXES=Object.freeze({version:VERSION,convoyInstalled,clean,viewport});
}());
