import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR,
  MAX_GAIN_DB,
  buildLoopBuffer,
  checkAgainstManifest,
  seamScore,
  validatePadFiles,
  validateSourceAudio,
  validateSourceNames,
  withGuardTail,
} from './loop.mjs';

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

const mp3s = names.map((n) => n.replace('.m4a', '.mp3'));

test('validateSourceNames accepts 12 DS mp3 files (including #)', () => {
  assert.deepEqual(validateSourceNames(mp3s), []);
  assert.deepEqual(validateSourceNames([...mp3s.slice(0, 11), 'DS12-B#.mp3']), []);
});

test('validateSourceNames rejects an empty set, a short set and strange names', () => {
  assert.ok(validateSourceNames([]).length > 0);
  assert.ok(validateSourceNames(mp3s.slice(1)).length > 0);
  assert.ok(validateSourceNames([...mp3s.slice(0, 11), 'x.mp3']).length > 0);
});

test('validateSourceAudio accepts a long enough audible source', () => {
  assert.deepEqual(validateSourceAudio(sine(24 * BAR), 'a.mp3', opts, 8 * BAR), []);
});

test('validateSourceAudio rejects a short source naming the file', () => {
  const errors = validateSourceAudio(sine(23 * BAR), 'DS01-C.mp3', opts, 8 * BAR);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DS01-C\.mp3/);
});

test('validateSourceAudio rejects empty and silent sources naming the file', () => {
  const silent = validateSourceAudio(new Float32Array(2 * 24 * BAR), 'DS02-D.mp3', opts, 8 * BAR);
  assert.equal(silent.length, 1);
  assert.match(silent[0], /DS02-D\.mp3/);
  assert.ok(validateSourceAudio(new Float32Array(0), 'e.mp3', opts, 8 * BAR).length > 0);
});

test('MAX_GAIN_DB is a sane bound', () => {
  assert.ok(MAX_GAIN_DB > 0 && MAX_GAIN_DB <= 40);
});

const manifest = {
  version: 'v1',
  files: {
    C: { file: 'DS04-C', introBars: 8 },
    'C#': { file: 'DS05-Cs', introBars: 7 },
    D: { file: 'DS06-D', introBars: 6 },
    'D#': { file: 'DS07-Ds', introBars: 5 },
    E: { file: 'DS08-E', introBars: 6 },
    F: { file: 'DS09-F', introBars: 7 },
    'F#': { file: 'DS10-Fs', introBars: 7 },
    G: { file: 'DS11-G', introBars: 4 },
    'G#': { file: 'DS12-Gs', introBars: 5 },
    A: { file: 'DS01-A', introBars: 4 },
    'A#': { file: 'DS02-As', introBars: 6 },
    B: { file: 'DS03-B', introBars: 7 },
  },
};
const reportFor = () =>
  Object.values(manifest.files).map(({ file, introBars }) => ({ file, introBars }));

test('checkAgainstManifest accepts a matching report', () => {
  assert.deepEqual(checkAgainstManifest(reportFor(), manifest), []);
});

test('checkAgainstManifest rejects a wrong DS-number pairing', () => {
  const notes = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  const wrong = notes.map((n, i) => ({
    file: `DS${String(i + 1).padStart(2, '0')}-${n}`,
    introBars: 4,
  }));
  assert.ok(checkAgainstManifest(wrong, manifest).length > 0);
});

test('checkAgainstManifest names the file with a different introBars', () => {
  const report = reportFor();
  report[0] = { ...report[0], introBars: 5 };
  const errors = checkAgainstManifest(report, manifest);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DS04-C/);
});

test('checkAgainstManifest rejects a missing file', () => {
  const errors = checkAgainstManifest(reportFor().slice(1), manifest);
  assert.ok(errors.some((e) => e.includes('DS04-C')));
});

test('checkAgainstManifest rejects a bad version', () => {
  for (const version of ['', 'x1', undefined, 1]) {
    assert.ok(checkAgainstManifest(reportFor(), { ...manifest, version }).length > 0);
  }
});

test('validatePadFiles rejects two files with the same note', () => {
  assert.ok(validatePadFiles([...names.slice(0, 11), 'DS13-C.m4a']).length > 0);
});

test('withGuardTail acrescenta a continuação natural do loop após o fim do buffer', () => {
  const guardFrames = 22050;
  const B = buildLoopBuffer(noise(total), intro, 'equalPower', opts);
  const G = withGuardTail(B, intro, guardFrames, opts.loopFrames);
  assert.equal(G.length, 2 * (intro + opts.loopFrames + guardFrames));
  assert.deepEqual(G.subarray(0, B.length), B);
  assert.deepEqual(G.subarray(B.length), B.subarray(2 * intro, 2 * (intro + guardFrames)));
});

test('withGuardTail com guarda zero devolve uma cópia idêntica', () => {
  const B = noise(intro + opts.loopFrames);
  const G = withGuardTail(B, intro, 0, opts.loopFrames);
  assert.deepEqual(G, B);
});

test('withGuardTail valida a guarda (0 a loopFrames, inteira)', () => {
  const B = noise(intro + opts.loopFrames);
  assert.throws(() => withGuardTail(B, intro, -1, opts.loopFrames), /guarda/);
  assert.throws(() => withGuardTail(B, intro, opts.loopFrames + 1, opts.loopFrames), /guarda/);
  assert.throws(() => withGuardTail(B, intro, 1.5, opts.loopFrames), /guarda/);
  assert.doesNotThrow(() => withGuardTail(B, intro, opts.loopFrames, opts.loopFrames));
});

test('withGuardTail rejeita buffer que não tem intro + loop quadros', () => {
  assert.throws(() => withGuardTail(noise(100), intro, 10, opts.loopFrames), /buffer/);
});
