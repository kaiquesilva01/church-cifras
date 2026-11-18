// Produz os loops do pad a partir dos MP3 de origem.
// Uso: node scripts/pads/produce.mjs --src <dir> --out <dir>   (ffmpeg via $FFMPEG ou PATH)
// Gera <out>/loops/<arquivo>.m4a, <out>/teste-3x/<arquivo>-3x.m4a e <out>/relatorio.json.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  BAR,
  BPM,
  INTRO_MAX_BARS,
  INTRO_MIN_BARS,
  LOOP_BARS,
  MAX_GAIN_DB,
  PEAK,
  SR,
  TARGET_DB,
  XFADE_BARS,
  buildLoopBuffer,
  rmsDb,
  seamScore,
  validateSourceAudio,
  validateSourceNames,
} from './loop.mjs';

const { values } = parseArgs({ options: { src: { type: 'string' }, out: { type: 'string' } } });
if (!values.src || !values.out) {
  console.error('Uso: node scripts/pads/produce.mjs --src <dir> --out <dir>');
  process.exit(1);
}
const { src: srcDir, out: outDir } = values;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const opts = { loopFrames: LOOP_BARS * BAR, xfadeFrames: XFADE_BARS * BAR };

function run(args, input) {
  const r = spawnSync(ffmpeg, args, { input, maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}

function decode(file) {
  const out = run(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-']);
  const copy = new Uint8Array(out.length);
  copy.set(out);
  return new Float32Array(copy.buffer, 0, copy.length / 4);
}

function encode(pcm, dest) {
  run(
    ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-'].concat([
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      dest,
    ]),
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const secs = (frames) => +(frames / SR).toFixed(2);

const files = readdirSync(srcDir)
  .filter((n) => /^DS\d\d-.+\.mp3$/.test(n))
  .sort();
const nameErrors = validateSourceNames(files);
if (nameErrors.length > 0) fail(`origem inválida em ${srcDir}:\n${nameErrors.join('\n')}`);

// Primeira passada: valida todos os áudios antes de escrever qualquer saída.
const audioErrors = [];
for (const name of files) {
  const pcm = decode(`${srcDir}/${name}`);
  audioErrors.push(...validateSourceAudio(pcm, name, opts, INTRO_MAX_BARS * BAR));
}
if (audioErrors.length > 0) fail(audioErrors.join('\n'));

mkdirSync(`${outDir}/loops`, { recursive: true });
mkdirSync(`${outDir}/teste-3x`, { recursive: true });
const report = [];

for (const name of files) {
  const pcm = decode(`${srcDir}/${name}`);
  let best = null;
  for (let bars = INTRO_MIN_BARS; bars <= INTRO_MAX_BARS; bars++) {
    for (const mode of ['equalPower', 'linear']) {
      const B = buildLoopBuffer(pcm, bars * BAR, mode, opts);
      const score = seamScore(B, bars * BAR, opts);
      if (!best || score < best.score) best = { bars, mode, score, B };
    }
  }
  const { B, bars } = best;
  const M = bars * BAR;
  const len = M + opts.loopFrames;

  let peak = 0;
  for (let i = 0; i < B.length; i++) peak = Math.max(peak, Math.abs(B[i]));
  // Só o trecho estável, para o crescendo da intro manter a forma natural.
  const bodyDb = rmsDb(B, M + opts.xfadeFrames, opts.loopFrames - 2 * opts.xfadeFrames);
  const gain = Math.min(10 ** ((TARGET_DB - bodyDb) / 20), PEAK / peak);
  if (20 * Math.log10(gain) > MAX_GAIN_DB) {
    fail(
      `${name}: ganho de nivelamento de ${(20 * Math.log10(gain)).toFixed(1)} dB excede ${MAX_GAIN_DB} dB`,
    );
  }
  for (let i = 0; i < B.length; i++) B[i] *= gain;

  const id = name.replace(/\.mp3$/, '').replace('#', 's');
  encode(B, `${outDir}/loops/${id}.m4a`);

  // Arquivo de teste = o que o app toca: intro uma vez, depois a região do loop 3 vezes.
  const loopRegion = B.subarray(2 * M, 2 * len);
  const three = new Float32Array(2 * (len + 2 * opts.loopFrames));
  three.set(B, 0);
  three.set(loopRegion, 2 * len);
  three.set(loopRegion, 2 * (len + opts.loopFrames));
  encode(three, `${outDir}/teste-3x/${id}-3x.m4a`);

  report.push({
    file: id,
    introBars: bars,
    loopStartSec: secs(M),
    loopEndSec: secs(len),
    bufferSec: secs(len),
    mode: best.mode,
    seamDevDb: +best.score.toFixed(2),
    gainDb: +(20 * Math.log10(gain)).toFixed(1),
    seamsInTestAtSec: [secs(len), secs(len + opts.loopFrames)],
  });
  console.log(JSON.stringify(report.at(-1)));
}

writeFileSync(
  `${outDir}/relatorio.json`,
  JSON.stringify({ loopBars: LOOP_BARS, crossfadeBars: XFADE_BARS, bpm: BPM, report }, null, 2),
);
