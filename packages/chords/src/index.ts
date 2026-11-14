export { KEY_OPTIONS, parseKey, prefersFlats, relativeMajorPc } from './keys';
export type { Key, KeyName } from './keys';
export { noteName, pitchClass } from './notes';
export { parseChord, semitonesBetween, transposeChord } from './chord';
export type { Chord } from './chord';
export {
  analyzeSegment,
  classifySegment,
  isLabel,
  mergeFragments,
  parseChordToken,
  segmentLine,
  tokenizeSegment,
} from './lines';
export type { ChordToken, SegmentAnalysis, TextLine, TextRun, Token } from './lines';
export { findKeyIndicator } from './keyIndicator';
export type { KeyIndicator } from './keyIndicator';
export { buildTransposePlan } from './plan';
export type { Measure, Replacement, SuspectSegment, TransposePlan } from './plan';
export { normalizeText, suggestMetadata } from './metadata';
export type { MetadataSuggestion } from './metadata';
