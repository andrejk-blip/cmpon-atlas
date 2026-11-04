/* Shared route vocabulary. Contains no URLs, queries, identities or visitor content. */
export const ROUTES=[
 {
  "id": "cmpon-map",
  "label": "ЦМПОН · Карта требований",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-requirements",
  "label": "ЦМПОН · Список требований",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-cosmos",
  "label": "ЦМПОН · География требований",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-reverse",
  "label": "ЦМПОН · Сохранность ДТ 2.5",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-glossary",
  "label": "ЦМПОН · Термины и объекты",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-questions",
  "label": "ЦМПОН · Вопросы для решения",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-stats",
  "label": "ЦМПОН · Статистика сопоставлений",
  "scope": "cmpon"
 },
 {
  "id": "cmpon-methods",
  "label": "ЦМПОН · Источники и методика",
  "scope": "cmpon"
 },
 {
  "id": "all-map",
  "label": "Все направления · Карта требований",
  "scope": "all"
 },
 {
  "id": "all-requirements",
  "label": "Все направления · Список требований",
  "scope": "all"
 },
 {
  "id": "all-questions",
  "label": "Все направления · Вопросы для решения",
  "scope": "all"
 },
 {
  "id": "all-stats",
  "label": "Все направления · Статистика сопоставлений",
  "scope": "all"
 },
 {
  "id": "all-methods",
  "label": "Все направления · Источники и методика",
  "scope": "all"
 },
 {
  "id": "academy-home",
  "label": "Академия · Штаб",
  "scope": "academy"
 },
 {
  "id": "academy-practice",
  "label": "Академия · Тренировка",
  "scope": "academy"
 },
 {
  "id": "academy-exam",
  "label": "Академия · Экзамен",
  "scope": "academy"
 },
 {
  "id": "academy-editor",
  "label": "Академия · Редактор",
  "scope": "academy"
 },
 {
  "id": "game",
  "label": "Цитадель · вход в игру",
  "scope": "game"
 },
 {
  "id": "game-tournament",
  "label": "Цитадель · турнир",
  "scope": "game"
 },
 {
  "id": "map",
  "label": "Прежний атлас · Карта",
  "scope": "legacy"
 },
 {
  "id": "requirements",
  "label": "Прежний атлас · Требования",
  "scope": "legacy"
 },
 {
  "id": "reviews",
  "label": "Прежний атлас · Рецензирование",
  "scope": "legacy"
 },
 {
  "id": "cosmos",
  "label": "Прежний атлас · География",
  "scope": "legacy"
 },
 {
  "id": "changes",
  "label": "Прежний атлас · Редакции",
  "scope": "legacy"
 },
 {
  "id": "methods",
  "label": "Прежний атлас · Методика",
  "scope": "legacy"
 },
 {
  "id": "arcade",
  "label": "Игра (прежний вход)",
  "scope": "game"
 }
];
export const SCOPES={"all": "Весь сайт", "atlas": "Атлас целиком", "cmpon": "ЦМПОН", "directions": "Все направления ГИС ЦАП", "game": "Игра «Цитадель»", "academy": "Академия", "legacy": "Прежний атлас"};
export function routesForScope(scope='all'){
 if(scope==='all')return null;
 return ROUTES.filter(r=>scope==='atlas'?['cmpon','all','legacy'].includes(r.scope):r.scope===(scope==='directions'?'all':scope)).map(r=>r.id);
}
export function reportFilters(scope='all',route='all'){
 if(!Object.hasOwn(SCOPES,scope))throw new Error('Invalid scope');
 const allowed=routesForScope(scope);
 if(route!=='all'&&(!ROUTES.some(r=>r.id===route)||(allowed&&!allowed.includes(route))))throw new Error('Invalid page');
 return {scope,route};
}
