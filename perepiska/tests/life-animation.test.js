import test from 'node:test';
import assert from 'node:assert/strict';
import { createPose, stepPose, samplePose } from '../src/life/animation.js';

const idle = Object.freeze({ dir: 'right', moving: false, speedRatio: 0, walkCycle: 0 });
const walking = Object.freeze({ dir: 'right', moving: true, speedRatio: 1, walkCycle: .3 });
const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not near ${expected}`);

function advance(pose, actor, seconds, hz = 60, options) {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepPose(pose, actor, 1 / hz, options);
  return samplePose(pose, options);
}

test('a new character has its own neutral standing pose, not a raised walking leg', () => {
  const a = createPose(), b = createPose();
  assert.notStrictEqual(a, b);
  assert.equal(samplePose(a).frame, 8);
  assert.equal(samplePose(a).walking, false);
  advance(a, walking, .5);
  assert.equal(samplePose(b).frame, 8);
  assert.equal(samplePose(b).walking, false);
});

test('pause and invalid frame intervals freeze the complete presentation state', () => {
  const pose = createPose(2.4);
  advance(pose, walking, .5);
  const frozen = structuredClone(pose);
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) {
    assert.strictEqual(stepPose(pose, { ...idle, dir: 'left' }, dt), pose);
    assert.deepEqual(pose, frozen);
  }
});

test('sampling is repeatable and cannot advance clocks or mutate the actor', () => {
  const actor = Object.freeze({ ...walking, dir: 'left' });
  const pose = createPose(5.5);
  stepPose(pose, actor, 1 / 60);
  const frozen = structuredClone(pose), first = samplePose(pose);
  for (let i = 0; i < 10; i++) assert.deepEqual(samplePose(pose), first);
  assert.deepEqual(pose, frozen);
  assert.deepEqual(actor, { ...walking, dir: 'left' });
});

test('walk cycles wrap safely at both ends and never select an idle or missing frame', () => {
  const pose = createPose();
  advance(pose, walking, .5);
  for (const cycle of [-100.125, -1, -.0001, 0, .125, .999999, 1, 1.125, 100.99]) {
    stepPose(pose, { ...walking, walkCycle: cycle }, 1 / 60);
    const sample = samplePose(pose);
    assert.equal(sample.walking, true);
    assert.ok(Number.isInteger(sample.frame) && sample.frame >= 0 && sample.frame < 8);
  }
  stepPose(pose, { ...walking, walkCycle: .125 }, 1 / 60);
  const ordinary = samplePose(pose).frame;
  stepPose(pose, { ...walking, walkCycle: 10.125 }, 1 / 60);
  assert.equal(samplePose(pose).frame, ordinary);
});

test('starting and stopping blend locomotion and eventually settle on a standing frame', () => {
  const pose = createPose();
  stepPose(pose, walking, 1 / 60);
  assert.ok(pose.locomotion > 0 && pose.locomotion < 1);
  advance(pose, walking, .5);
  const beforeStop = pose.locomotion;
  stepPose(pose, idle, 1 / 60);
  assert.ok(pose.locomotion > 0 && pose.locomotion < beforeStop);
  assert.equal(samplePose(pose).walking, true);
  const settled = advance(pose, idle, 1);
  assert.equal(settled.walking, false);
  assert.ok(settled.frame >= 8 && settled.frame <= 11);
  assert.equal(settled.bob, 0);
});

test('reduced motion keeps essential gait and facing but removes decorative motion', () => {
  const options = { reducedMotion: true };
  const pose = createPose(5.5);
  stepPose(pose, idle, 1 / 60, options);
  assert.deepEqual(samplePose(pose, options), {
    frame: 8, flip: 1, scaleX: 1, scaleY: 1, bob: 0, lean: 0, walking: false,
  });
  advance(pose, { ...walking, dir: 'left' }, .5, 60, options);
  const sample = samplePose(pose, options);
  assert.equal(sample.walking, true);
  assert.ok(sample.frame >= 0 && sample.frame < 8);
  assert.equal(sample.flip, -1);
  for (const key of ['scaleX', 'scaleY']) assert.equal(sample[key], 1);
  for (const key of ['bob', 'lean']) assert.equal(sample[key], 0);
});

test('turning is staged, reaches the new facing, and can be cancelled before the flip', () => {
  const pose = createPose();
  stepPose(pose, { ...idle, dir: 'left' }, 1 / 120);
  const turning = samplePose(pose);
  assert.equal(turning.flip, 1);
  assert.ok(turning.scaleX > 0 && turning.scaleX < 1);
  const left = advance(pose, { ...idle, dir: 'left' }, 1);
  assert.equal(left.flip, -1);
  near(left.scaleX, 1);

  const cancelled = createPose();
  stepPose(cancelled, { ...idle, dir: 'left' }, 1 / 120);
  const right = advance(cancelled, idle, .5);
  assert.equal(right.flip, 1);
  near(right.scaleX, 1);
});

test('locomotion damping and idle clocks agree at 30, 60, and 120 Hz', () => {
  const poses = [30, 60, 120].map(hz => {
    const pose = createPose(.4);
    advance(pose, walking, .5, hz);
    advance(pose, idle, .5, hz);
    return pose;
  });
  for (const pose of poses.slice(1)) {
    near(pose.locomotion, poses[0].locomotion);
    near(pose.clock, poses[0].clock);
    near(pose.idleClock, poses[0].idleClock);
    near(samplePose(pose).scaleY, samplePose(poses[0]).scaleY);
    assert.equal(samplePose(pose).frame, samplePose(poses[0]).frame);
  }
});

test('a long resumed frame advances only one bounded animation step', () => {
  const long = createPose(1.3), bounded = createPose(1.3);
  stepPose(long, { ...walking, dir: 'left' }, 30);
  stepPose(bounded, { ...walking, dir: 'left' }, .1);
  assert.deepEqual(long, bounded);
});

test('idle expressions stay within their atlas row and blinking is brief', () => {
  const pose = createPose();
  const frames = new Set();
  let blinkSteps = 0;
  for (let i = 0; i < 580; i++) {
    stepPose(pose, idle, .01);
    const sample = samplePose(pose);
    assert.equal(sample.walking, false);
    assert.ok(Number.isInteger(sample.frame) && sample.frame >= 8 && sample.frame <= 11);
    frames.add(sample.frame);
    if (sample.frame === 10) blinkSteps++;
  }
  assert.deepEqual([...frames].sort((a, b) => a - b), [8, 9, 10, 11]);
  assert.ok(blinkSteps > 0 && blinkSteps < 30, 'blink must be shorter than .3 seconds in one idle cycle');
});
