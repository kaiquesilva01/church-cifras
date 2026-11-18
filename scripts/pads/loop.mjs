// Funções puras da produção dos loops do pad (sem I/O).
//
// Buffer B = orig[0 .. M+L-X)  ++  Z,  Z[i] = orig[M+L-X+i]*fout(i/X) + orig[M-X+i]*fin(i/X)
// (M = introFrames, L = loopFrames, X = xfadeFrames). Tocar B e voltar do fim para B[M] é
// contínuo: Z termina em orig[M], que é B[M]. O trecho [0, M+L-X) é idêntico ao original.

export const SR = 44100;
export const BPM = 70;
export const BAR = (SR * 240) / BPM; // 151200 quadros por compasso a 70 BPM
export const LOOP_BARS = 16;
export const XFADE_BARS = 2;
export const INTRO_MIN_BARS = 4;
export const INTRO_MAX_BARS = 8;
export const TARGET_DB = -18;
export const PEAK = 0.891; // -1 dBFS
export const WINDOW = 2205; // 50 ms

export const fades = {
  equalPower: (t) => [Math.cos((t * Math.PI) / 2), Math.sin((t * Math.PI) / 2)],
  linear: (t) => [1 - t, t],
};

/** pcm: Float32Array estéreo intercalado. Devolve B com introFrames + loopFrames quadros. */
export function buildLoopBuffer(pcm, introFrames, mode, { loopFrames, xfadeFrames }) {
  const fade = fades[mode];
  if (!fade) throw new Error(`modo desconhecido: ${mode}`);
  const len = introFrames + loopFrames;
  if (pcm.length < 2 * len) throw new Error('áudio mais curto que intro + loop');
  const out = new Float32Array(2 * len);
  out.set(pcm.subarray(0, 2 * (len - xfadeFrames)), 0);
  for (let i = 0; i < xfadeFrames; i++) {
    const [fo, fi] = fade(i / xfadeFrames);
    for (let c = 0; c < 2; c++) {
      out[2 * (len - xfadeFrames + i) + c] =
        pcm[2 * (len - xfadeFrames + i) + c] * fo +
        pcm[2 * (introFrames - xfadeFrames + i) + c] * fi;
    }
  }
  return out;
}

export function rmsDb(a, start, frames) {
  let acc = 0;
  for (let i = start; i < start + frames; i++) acc += a[2 * i] ** 2 + a[2 * i + 1] ** 2;
  return 10 * Math.log10(acc / (2 * frames) + 1e-12);
}

/** Desvio máximo (dB) entre janelas de 50 ms da zona de emenda e o corpo estável. */
export function seamScore(B, introFrames, { loopFrames, xfadeFrames }) {
  const len = introFrames + loopFrames;
  const body = rmsDb(B, introFrames + xfadeFrames, WINDOW);
  let worst = 0;
  for (let z = len - xfadeFrames; z + WINDOW <= len; z += WINDOW) {
    worst = Math.max(worst, Math.abs(rmsDb(B, z, WINDOW) - body));
  }
  return worst;
}

const PAD_NAME = /^DS\d\d-[A-G]s?\.m4a$/;

/** Devolve a lista de erros (vazia = ok). */
export function validatePadFiles(names) {
  const errors = [];
  if (names.length !== 12) errors.push(`esperados 12 arquivos, encontrados ${names.length}`);
  const seen = new Set();
  for (const name of names) {
    if (!PAD_NAME.test(name)) errors.push(`nome inválido: ${name}`);
    if (seen.has(name)) errors.push(`nome repetido: ${name}`);
    seen.add(name);
  }
  return errors;
}

export const MIN_PEAK = 1e-3; // abaixo disso (-60 dBFS) a fonte é tratada como silenciosa
export const MAX_GAIN_DB = 40; // ganho de nivelamento acima disso indica fonte quase muda

const padId = (name) => name.replace(/\.mp3$/, '').replace('#', 's');

/** Erros do conjunto de MP3 de origem (vazio = ok): exatamente 12 DS??-<nota>.mp3 únicos. */
export function validateSourceNames(names) {
  return validatePadFiles(names.map((n) => `${padId(n)}.m4a`)).map((e) =>
    e.replace(/\.m4a$/, '.mp3'),
  );
}

/** Erros de um áudio decodificado: curto demais (< introMaxFrames + loop) ou silencioso. */
export function validateSourceAudio(pcm, name, { loopFrames }, introMaxFrames) {
  const errors = [];
  const needed = introMaxFrames + loopFrames;
  if (pcm.length / 2 < needed) {
    errors.push(`${name}: áudio com ${pcm.length / 2} quadros, mínimo ${needed}`);
  }
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak < MIN_PEAK) errors.push(`${name}: áudio silencioso ou vazio (pico ${peak})`);
  return errors;
}
