import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, buildLoopBuffer, seamScore, validatePadFiles } from './loop.mjs';

const opts = { loopFrames: 16 * BAR, xfadeFrames: 2 * BAR };
const intro = 4 * BAR;
const total = 60 * BAR;

function sine(frames) {
  const pcm = new Float32Array(2 * frames);
  for (let i = 0; i < frames; i++) {
    const v = 0.5 * Math.sin((2 * Math.PI * 220 * i) / 44100);
    pcm[2 * i] = v;
    pcm[2 * i + 1] = v;
  }
  return pcm;
}

function noise(frames, seed = 12345) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pcm = new Float32Array(2 * frames);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (rnd() * 2 - 1) * 0.3;
  return pcm;
}

test('buildLoopBuffer returns introFrames + loopFrames frames', () => {
  const B = buildLoopBuffer(sine(total), intro, 'equalPower', opts);
  assert.equal(B.length, 2 * (intro + opts.loopFrames));
});

test('buildLoopBuffer leaves [0, len - X) identical to the original', () => {
  const src = sine(total);
  const B = buildLoopBuffer(src, intro, 'linear', opts);
  const untouched = 2 * (intro + opts.loopFrames - opts.xfadeFrames);
  assert.deepEqual(B.subarray(0, untouched), src.subarray(0, untouched));
});

test('wrap from the end of B back to B[introFrames] is continuous', () => {
  const len = intro + opts.loopFrames;
  for (const mode of ['equalPower', 'linear']) {
    const B = buildLoopBuffer(sine(total), intro, mode, opts);
    for (let c = 0; c < 2; c++) {
      assert.ok(Math.abs(B[2 * (len - 1) + c] - B[2 * intro + c]) < 0.05, mode);
    }
  }
});

test('equalPower keeps the crossfade zone within 1 dB of the body (uncorrelated noise)', () => {
  const B = buildLoopBuffer(noise(total), intro, 'equalPower', opts);
  assert.ok(seamScore(B, intro, opts) < 1);
});

test('seamScore flags the linear fade on uncorrelated noise', () => {
  const src = noise(total);
  const eq = seamScore(buildLoopBuffer(src, intro, 'equalPower', opts), intro, opts);
  const lin = seamScore(buildLoopBuffer(src, intro, 'linear', opts), intro, opts);
  assert.ok(lin > eq);
});

const names = [
  'DS01-C',
  'DS02-Cs',
  'DS03-D',
  'DS04-Ds',
  'DS05-E',
  'DS06-F',
  'DS07-Fs',
  'DS08-G',
  'DS09-Gs',
  'DS10-A',
  'DS11-As',
  'DS12-B',
].map((n) => `${n}.m4a`);

test('validatePadFiles accepts 12 valid unique names', () => {
  assert.deepEqual(validatePadFiles(names), []);
});

test('validatePadFiles rejects 11 names', () => {
  assert.ok(validatePadFiles(names.slice(1)).length > 0);
});

test('validatePadFiles rejects an unexpected name', () => {
  assert.ok(validatePadFiles([...names.slice(0, 11), 'x.m4a']).length > 0);
});

test('validatePadFiles rejects duplicates', () => {
  assert.ok(validatePadFiles([...names.slice(0, 11), names[0]]).length > 0);
});
