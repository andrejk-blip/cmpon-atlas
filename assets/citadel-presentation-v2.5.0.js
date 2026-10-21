/* Shared cockpit, 2.5.0. Pure presentation: no simulation, storage, listeners,
 * animation loops or input wrappers. The existing delegated actions are used. */
(function () {
  'use strict';
  if (globalThis.CITADEL_PRESENTATION || typeof updateArcadeHUD !== 'function') return;
  const names = ['Орбита Цитадели', 'Палуба требований', 'Конвой · первый переход',
    'Погоня за ФЗ', 'Палуба согласования', 'Конвой · перехват', 'Рой уточнений',
    'Палуба интеграции', 'Конвой · блокада', 'Последняя орбита', 'Палуба выпуска',
    'Параллакс', 'Логово МРГ', 'МРГ · последний рубеж'];
  function level(e) {
    if (!e) return 1;
    if (e.finale) return ['mrg', 'upload', 'victory'].includes(e.finale.phase) ? 14 :
      ['maze', 'landing'].includes(e.finale.phase) ? 13 : 12;
    return Math.min(11, Math.max(1, (Number(e.stage) || 0) * 3 +
      (e.phase === 'escort' ? 3 : e.board ? 2 : 1)));
  }
  function model(e) {
    const number = level(e), status = e?.status === 'paused' ? e.resumeStatus : e?.status,
      inside = status === 'boarding' || !!e?.board && ['remark', 'finalcheck'].includes(status),
      convoy = e?.phase === 'escort', mrg = e?.finale?.phase === 'mrg', swarm = e?.phase === 'swarm',
      pulse = inside ? e?.board : e?.player,
      guideOn = inside ? !!e?.board?.guide : !!e?.autopilot;
    const guideName = convoy ? 'К строю' : mrg ? 'Помощь' : inside ? 'Проводник' : e?.phase === 'pursuit' ? 'Помощь в погоне' : 'Автокурс';
    const help = convoy
      ? 'Джойстик — манёвр. Цель — выбрать противника; наведите на него прицел и стреляйте. Прикрытие защищает конвой. К строю — вернуться в центр; корабль не ведётся за вас.'
      : mrg ? 'Джойстик в стороны — бег; вниз — спуск. Держите Прыжок для высокого прыжка. Щит убирает снаряды и ненадолго защищает. Сначала солдаты, затем открытое золотое ядро.'
      : inside ? 'Джойстик — движение и направление огня. Рывок помогает сменить позицию. Импульс отталкивает близких врагов. Проводник ведёт к терминалу только по вашей команде.'
      : swarm ? 'Джойстик — движение по арене. Стреляйте в строй и уклоняйтесь от пике. Импульс — в боевой панели справа; он помогает против близких снарядов.'
      : e?.phase === 'pursuit' ? 'Джойстик — манёвр. Держитесь рядом с ФЗ для передачи данных. Канал исчезает вне зоны связи. Стреляйте в перехватчиков и заранее входите в просветы.'
      : 'Джойстик — курс; Огонь — удерживать. Форсаж — ускорение; Импульс — защита вблизи. Автокурс включается кнопкой над полем; ручной манёвр временно перехватывает управление.';
    return {number, name: names[number - 1], active: ['playing', 'boarding'].includes(e?.status),
      convoy, mrg, inside, guideOn, guideName, guideVisible: !swarm && ['playing', 'boarding', 'paused'].includes(e?.status),
      pulseName: mrg ? 'ЩИТ' : convoy ? 'ПРИКРЫТИЕ' : 'ИМПУЛЬС',
      cooldown: Math.ceil(pulse?.pulseCooldown || 0), boostName: mrg ? 'ПРЫЖОК' : inside ? 'РЫВОК' : 'ФОРСАЖ', help};
  }
  const byId = id => document.getElementById(id);
  function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
  function refresh(e = ARCADE.engine) {
    if (!e) return;
    const m = model(e), screen = byId('arcade-screen'), layout = byId('arcade-layout');
    layout?.classList.add('citadel-unified');
    if (screen) screen.dataset.campaignLevel = String(m.number);
    text(byId('arcade-stage-label'), 'ЦИТАДЕЛЬ ЦСИИ');
    text(byId('citadel-objective-phase'), 'УРОВЕНЬ ' + String(m.number).padStart(2, '0') + ' / 14');
    text(byId('citadel-objective-title'), m.name);
    text(byId('arcade-mission-index'), 'УРОВЕНЬ ' + m.number + ' / 14');
    const primary = byId('citadel-primary');
    if (primary) {
      primary.hidden = !m.guideVisible;
      // A single toggle has the same meaning on keyboard, touch and desktop.
      primary.dataset.action = 'citadel-guidance';
      primary.disabled = !m.active;
      primary.setAttribute('aria-pressed', String(m.guideOn));
      const label = m.guideName + (m.convoy ? '' : m.guideOn ? ' · вкл.' : ' · выкл.');
      text(primary, label);
      primary.setAttribute('aria-label', m.convoy ? 'Вернуться к строю конвоя' : label);
    }
    const guide = byId('mobile-guide');
    if (guide) { text(guide, m.guideName + (m.convoy ? '' : m.guideOn ? ' включён' : ' выключен')); guide.hidden = !m.guideVisible; }
    text(byId('citadel-guidance'), 'G · ' + m.guideName + (m.convoy ? '' : m.guideOn ? ' включён' : ' выключен'));
    const actions = screen?.querySelector?.('.arcade-touch-actions');
    const button = actions?.querySelector?.('.desktop-touch-extra[data-action="arcade-pulse"]');
    if (button) {
      button.classList.add('citadel-touch-defense');
      button.hidden = m.convoy; // Convoy has its own target/cover pair.
      button.disabled = !m.active || m.cooldown > 0;
      text(button, m.pulseName + '\n' + (m.cooldown > 0 ? m.cooldown + ' с' : 'ГОТОВ'));
      button.setAttribute('aria-label', m.pulseName + (m.cooldown > 0 ? ': готов через ' + m.cooldown + ' секунд' : ': готов'));
    }
    text(byId('arcade-boost-touch'), m.boostName);
    const help = layout?.querySelector?.('.mobile-toolbox > p');
    text(help, 'Игра на паузе. ' + m.help);
    // Static descriptions stay in the pause panel. Live warnings, health,
    // target markers and progress stay in each mode's tactical canvas HUD.
    for (const el of layout?.querySelectorAll?.('.mobile-controls-help') || []) text(el, m.help);
    for (const el of byId('citadel-quickbar')?.querySelectorAll?.('[data-action="citadel-guidance"]') || []) text(el, 'G · ' + m.guideName);
  }
  const previous = updateArcadeHUD;
  updateArcadeHUD = function () { const result = previous.apply(this, arguments); refresh(); return result; };
  globalThis.CITADEL_PRESENTATION = Object.freeze({version: '2.5.0', level, model, refresh});
}());
