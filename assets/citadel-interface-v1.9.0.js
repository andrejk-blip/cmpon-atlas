/* Citadel 1.9.0 — readable decision cards, including the frozen lab's final checks. */
(function () {
  'use strict';
  if (globalThis.CITADEL_INTERFACE?.version === '1.9.0' || typeof RequirementArcade !== 'function') return;
  const VERSION = '1.9.0';
  const reviewStates = new Set(['lesson', 'remark', 'finalcheck']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const originalOverlay = arcadeOverlayHTML;
  const originalUpdate = updateArcadeOverlay;
  function finalCase(e) {
    const index = Math.max(0, Math.min(2, Number(e?.board?.completed?.length) || 0));
    const q = typeof citadelFinalCase === 'function' ? citadelFinalCase(index) : FINALE_TRIALS[index];
    return {index, q};
  }
  function finalHTML(e) {
    const {index, q} = finalCase(e);
    if (!q) return originalOverlay();
    const answered = e.finale?.answer !== null && e.finale?.answer !== undefined;
    const correct = answered && e.finale.answer === q.correct;
    const heading = '<header class="mission-check-heading"><span>ПРОВЕРКА ПАКЕТА</span><b>'+(index+1)+' / 3 <i>· ПАУЗА</i></b></header>';
    const footer = '<small class="mission-check-footer">Учебная проверка. Реальные документы и их статусы не меняются.</small>';
    const prompt = '<div class="mission-check-prompt"><span class="mission-check-kicker">'+(answered ? 'РАЗБОР РЕШЕНИЯ' : 'ВЫБЕРИ ДЕЙСТВИЕ')+'</span><h3 id="mission-check-title">'+escape(q.title || 'Проверка готовности')+'</h3><p>'+escape(q.q || q.situation || '')+'</p></div>';
    if (answered) {
      return '<section class="review-card mission-check is-result '+(correct?'is-correct':'is-wrong')+'" role="dialog" aria-modal="true" aria-labelledby="mission-check-title">'+heading+prompt+
        '<div class="mission-check-feedback" role="status"><strong>'+(correct?'Проверка пройдена':'Нужно другое решение')+'</strong><p>'+escape(q.why || '')+'</p>'+
        (correct && q.outcome?.after ? '<p class="mission-check-outcome">'+escape(q.outcome.after)+'</p>' : '')+'</div>'+
        '<button type="button" class="mission-check-continue" data-action="finale-check-next">'+(correct?'Дальше по лабиринту':'Вернуться к вариантам')+' <span aria-hidden="true">→</span></button>'+footer+'</section>';
    }
    return '<section class="review-card mission-check" role="dialog" aria-modal="true" aria-labelledby="mission-check-title">'+heading+
      '<div class="mission-check-layout">'+prompt+'<div class="mission-check-options"><span class="mission-check-kicker">КАК ПОСТУПИШЬ?</span><div class="review-choices">'+
      q.choices.map((choice, i) => '<button type="button" data-action="finale-answer" data-value="'+i+'"><b aria-hidden="true">'+(i+1)+'</b><span>'+escape(choice)+'</span></button>').join('')+
      '</div></div></div>'+footer+'</section>';
  }
  arcadeOverlayHTML = function () {
    const e = ARCADE.engine;
    if (e?.status === 'finalcheck' && !(typeof CUP !== 'undefined' && CUP.panel)) return finalHTML(e);
    return originalOverlay.apply(this, arguments);
  };
  updateArcadeOverlay = function () {
    const result = originalUpdate.apply(this, arguments);
    const e = ARCADE.engine, overlay = document.getElementById('arcade-overlay');
    overlay?.classList.toggle('citadel-readable', reviewStates.has(e?.status) && !(typeof CUP !== 'undefined' && CUP.panel));
    return result;
  };
  globalThis.CITADEL_INTERFACE = Object.freeze({version: VERSION, finalHTML, finalCase});
}());
