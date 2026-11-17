import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife, reduceLife} from '../src/life/engine.js';
import {getTutorialStep, normalizeTutorial, placeTutorialCard} from '../src/life/tutorial.js';
const awake = () => reduceLife(createLife(), {type:'WAKE'});
const withOutfit = () => reduceLife(reduceLife(awake(), {type:'ARRIVE', spotId:'wardrobe'}), {type:'OUTFIT', outfitId:'sage'});
const withReply = () => reduceLife(withOutfit(), {type:'CHAT', channelId:'team', choiceId:'ready'});
const packed = () => reduceLife(reduceLife(withReply(), {type:'ARRIVE', spotId:'bag'}), {type:'PACK'});
const id = (state, modalState = null, extra = {}) => getTutorialStep({state, modalState, ...extra})?.id;

test('tutorial begins after waking, derives outfit choice, and cannot advance story itself', () => {
  const sleeping = createLife(); assert.equal(id(sleeping), undefined);
  const state = awake(), copy = structuredClone(state);
  assert.equal(id(state), 'wardrobe');
  assert.equal(id(state, null, {moving:true}), 'walking');
  assert.equal(id(state, {type:'wardrobe'}), 'choose-outfit');
  assert.deepEqual(state, copy);
  assert.equal(id(withOutfit()), 'phone');
});

test('chat detours always lead back to Vera and only a real reply completes that stage', () => {
  const state = withOutfit();
  assert.equal(id(state, {type:'phone', tab:'shop'}), 'chats-tab');
  assert.equal(id(state, {type:'phone', thread:'friend'}), 'back-to-chats');
  assert.equal(id(state, {type:'phone', tab:'chats'}), 'open-vera');
  const read = reduceLife(state, {type:'READ_CHAT', channelId:'team'});
  assert.equal(id(read, {type:'phone', thread:'team'}), 'reply-vera');
  assert.equal(id(read), 'phone');
  assert.equal(id(reduceLife(read, {type:'CHAT', channelId:'team', choiceId:'question'})), 'bag');
});

test('packing follows chosen items in either order and stays on collection until PACK succeeds', () => {
  const state = withReply(), modal = {type:'pack'};
  assert.equal(id(state, modal), 'pack-tablet');
  assert.equal(id(state, modal, {packSelected:['id']}), 'pack-tablet');
  assert.equal(id(state, modal, {packSelected:['tablet']}), 'pack-id');
  assert.equal(id(state, modal, {packSelected:['tablet','id']}), 'pack-confirm');
  assert.equal(id(state), 'bag');
  assert.equal(id(packed()), 'leave');
});

test('resuming an older story skips finished tasks and meeting Vera completes onboarding', () => {
  const dressedPacked = reduceLife(reduceLife(withOutfit(), {type:'ARRIVE', spotId:'bag'}), {type:'PACK'});
  assert.equal(id(dressedPacked), 'phone');
  let state = reduceLife(reduceLife(packed(), {type:'ARRIVE', spotId:'door'}), {type:'LEAVE'});
  assert.equal(id(state), 'find-vera');
  assert.equal(id(state, {type:'meeting'}), 'meet-vera');
  state = reduceLife(reduceLife(state, {type:'ARRIVE', spotId:'mentor'}), {type:'MEET_TEAM'});
  assert.equal(id(state), 'finished');
  assert.equal(id(state, {type:'npc'}), 'finished');
});

test('menus and pauses suppress hints, but closing unrelated windows can resume the next task', () => {
  const state = withReply();
  for(const type of ['welcome','alarm','settings','help','conflict','ending','restart']) assert.equal(id(state,{type}),undefined);
  assert.equal(id(state,null,{paused:true}),undefined);
  assert.equal(id(state,{type:'profile'}),'return-to-day');
  assert.equal(id(state),'bag');
});

test('preferences reject corrupt values, retain skip, and remain independent of game schema', () => {
  for(const value of [null, {}, [], 'active', {version:1,status:'bogus'}, {version:2,status:'active'}]) assert.deepEqual(normalizeTutorial(value), {version:1,status:'pending'});
  for(const status of ['pending','active','skipped','done']) assert.deepEqual(normalizeTutorial({version:1,status}), {version:1,status});
});

test('coach card stays on screen without covering bottom controls across desktop and mobile', () => {
  for(const viewport of [{width:1363,height:936},{width:390,height:844},{width:320,height:568}]) {
    const target={x:viewport.width-90,y:viewport.height-70,width:70,height:50};
    const card=placeTutorialCard(target,viewport,{width:300,height:140});
    assert.ok(card.x>=12&&card.y>=12);
    assert.ok(card.x+card.width<=viewport.width-12);
    assert.ok(card.y+card.height<=viewport.height-12);
    assert.ok(card.y+card.height<=target.y || card.x+card.width<=target.x || card.x>=target.x+target.width || card.y>=target.y+target.height);
  }
});
