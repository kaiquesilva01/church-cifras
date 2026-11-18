// Funções puras da produção dos loops do pad (sem I/O).
//
// Buffer B = orig[0 .. M+L-X)  ++  Z,  Z[i] = orig[M+L-X+i]*fout(i/X) + orig[M-X+i]*fin(i/X)
// (M = introFrames, L = loopFrames, X = xfadeFrames). Tocar B e voltar do fim para B[M] é
// contínuo: Z termina em orig[M], que é B[M]. O trecho [0, M+L-X) é idêntico ao original.
//
// Arquivo codificado = B ++ B[M .. M+G) (cauda de guarda de G quadros, a continuação natural do
// loop). loopEnd = (M+L)/SR fica estritamente dentro do buffer decodificado: o reamostrador do
// decodeAudioData (44,1 -> 48 kHz) e qualquer corte de fim feito pelo decodificador atingem só a
// cauda, nunca a emenda. O manifesto (loopStart/loopEnd) não muda.

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

export const GUARD_FRAMES = 22050; // 0,5 s

/**
 * B (intro + loop quadros, estéreo intercalado) seguido de B[M .. M+G): a cauda de guarda.
 * Devolve um buffer novo; B não é alterado.
 */
export function withGuardTail(B, introFrames, guardFrames, loopFrames) {
  if (!Number.isInteger(guardFrames) || guardFrames < 0 || guardFrames > loopFrames) {
    throw new Error(`guarda inválida: ${guardFrames} (esperado inteiro de 0 a ${loopFrames})`);
  }
  if (B.length !== 2 * (introFrames + loopFrames)) {
    throw new Error('buffer sem intro + loop quadros: não dá para anexar a guarda');
  }
  const out = new Float32Array(B.length + 2 * guardFrames);
  out.set(B, 0);
  out.set(B.subarray(2 * introFrames, 2 * (introFrames + guardFrames)), B.length);
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
  const notes = new Set();
  for (const name of names) {
    if (!PAD_NAME.test(name)) errors.push(`nome inválido: ${name}`);
    if (seen.has(name)) errors.push(`nome repetido: ${name}`);
    seen.add(name);
    const note = /-([A-G]s?)\.m4a$/.exec(name)?.[1];
    if (note !== undefined) {
      if (notes.has(note)) errors.push(`nota repetida (${note}): ${name}`);
      notes.add(note);
    }
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

/**
 * Confere o relatorio.json produzido (entradas { file, introBars }) com padManifest.json:
 * mesmos 12 arquivos, mesmo introBars por nota e versão no formato vN. Vazio = ok.
 */
export function checkAgainstManifest(report, manifest) {
  const errors = [];
  if (typeof manifest.version !== 'string' || !/^v\d+$/.test(manifest.version)) {
    errors.push(`versão inválida no manifesto: ${String(manifest.version)}`);
  }
  const produced = new Map();
  for (const { file, introBars } of report) {
    if (produced.has(file)) errors.push(`arquivo repetido no relatório: ${file}`);
    produced.set(file, introBars);
  }
  const expected = new Map();
  for (const { file, introBars } of Object.values(manifest.files)) expected.set(file, introBars);
  for (const [file, introBars] of expected) {
    if (!produced.has(file)) errors.push(`arquivo do manifesto ausente no relatório: ${file}`);
    else if (produced.get(file) !== introBars) {
      errors.push(
        `${file}: introBars ${produced.get(file)} no relatório, ${introBars} no manifesto`,
      );
    }
  }
  for (const file of produced.keys()) {
    if (!expected.has(file)) errors.push(`arquivo fora do manifesto: ${file}`);
  }
  return errors;
}

/** Linha impressa antes do envio: onde, qual versão e quantos arquivos. */
export function describeUploadTarget({ bucket, emulatorHost, version, count }) {
  const where = emulatorHost ? `emulador ${emulatorHost}` : 'PRODUÇÃO';
  return `Destino: bucket ${bucket} (${where}), versão ${version}, ${count} arquivos`;
}

/** Erro (ou null) quando algum destino já existe: os loops são imutáveis, então não se sobrescreve. */
export function existingObjectsError(existing, version) {
  if (existing.length === 0) return null;
  const next = `v${Number(/^v(\d+)$/.exec(version)?.[1] ?? 0) + 1}`;
  return [
    'Estes objetos já existem e não são sobrescritos (imutáveis, com cache de 1 ano):',
    ...existing.map((d) => `  ${d}`),
    `Para regenerar os loops suba a "version" em apps/web/src/pad/padManifest.json (${version} -> ${next}) e lance o app.`,
  ].join('\n');
}
