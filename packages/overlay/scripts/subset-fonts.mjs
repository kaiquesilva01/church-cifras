// Generates fonts/*.ttf (what the app ships) from fonts/source/*.ttf (the full originals).
// Run with `npm run fonts:subset -w @cifras/overlay`; outputs are committed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import subsetFont from 'subset-font';
import { SUBSET_CHARSET } from './charset.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'fonts/source');
const outDir = resolve(root, 'fonts');

// The SIL OFL reserves the name "Liberation" (and Arimo/Tinos/Cousine): a modified version
// (a subset is one) must not use it. Roboto is Apache-2.0 and Roboto Mono declares no reserved
// name, so those keep their names.
const RENAMES = {
  'LiberationMono-Bold.ttf': { family: 'Cifras Mono', style: 'Bold' },
  'LiberationMono-Regular.ttf': { family: 'Cifras Mono', style: 'Regular' },
  'LiberationSans-Bold.ttf': { family: 'Cifras Sans', style: 'Bold' },
  'LiberationSans-Regular.ttf': { family: 'Cifras Sans', style: 'Regular' },
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function checksum(bytes) {
  const padded = Buffer.alloc((bytes.length + 3) & ~3);
  Buffer.from(bytes).copy(padded);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function encodeUtf16be(text) {
  const out = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i++) out.writeUInt16BE(text.charCodeAt(i), i * 2);
  return out;
}

// Replaces the sfnt `name` table with the given family/style names, keeping copyright (0),
// manufacturer, designer, description, vendor, license (11-14) records; drops the rest.
function renameFont(font, { family, style }) {
  const numTables = font.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    const tag = font.toString('latin1', at, at + 4);
    const offset = font.readUInt32BE(at + 8);
    const length = font.readUInt32BE(at + 12);
    tables.push({ tag, data: Buffer.from(font.subarray(offset, offset + length)) });
  }
  const nameTable = tables.find((t) => t.tag === 'name');
  const old = nameTable.data;
  const count = old.readUInt16BE(2);
  const stringOffset = old.readUInt16BE(4);
  const keep = new Set([0, 11, 12, 13, 14]);
  const records = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const rec = {
      platform: old.readUInt16BE(at),
      encoding: old.readUInt16BE(at + 2),
      language: old.readUInt16BE(at + 4),
      id: old.readUInt16BE(at + 6),
    };
    const length = old.readUInt16BE(at + 8);
    const offset = old.readUInt16BE(at + 10);
    if (!keep.has(rec.id)) continue;
    // records are only kept for the Windows platform (UTF-16BE), which is what pdf-lib/fontkit read
    if (rec.platform !== 3) continue;
    records.push({
      ...rec,
      data: old.subarray(stringOffset + offset, stringOffset + offset + length),
    });
  }
  const full = style === 'Regular' ? family : `${family} ${style}`;
  const postscript = `${family.replace(/ /g, '')}-${style}`;
  const fresh = [
    [1, family],
    [2, style],
    [3, `${postscript};subset`],
    [4, full],
    [6, postscript],
  ];
  for (const [id, text] of fresh) {
    records.push({ platform: 3, encoding: 1, language: 0x409, id, data: encodeUtf16be(text) });
  }
  records.sort((a, b) => a.platform - b.platform || a.id - b.id || a.language - b.language);

  const header = Buffer.alloc(6 + records.length * 12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(header.length, 4);
  let cursor = 0;
  records.forEach((rec, i) => {
    const at = 6 + i * 12;
    header.writeUInt16BE(rec.platform, at);
    header.writeUInt16BE(rec.encoding, at + 2);
    header.writeUInt16BE(rec.language, at + 4);
    header.writeUInt16BE(rec.id, at + 6);
    header.writeUInt16BE(rec.data.length, at + 8);
    header.writeUInt16BE(cursor, at + 10);
    cursor += rec.data.length;
  });
  nameTable.data = Buffer.concat([header, ...records.map((r) => r.data)]);

  return assemble(tables);
}

function assemble(tables) {
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = tables.length;
  const entrySelector = Math.floor(Math.log2(n));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12 + n * 16);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(n, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(n * 16 - searchRange, 10);
  const head = tables.find((t) => t.tag === 'head');
  head.data.writeUInt32BE(0, 8); // checkSumAdjustment is computed with the field zeroed
  let offset = header.length;
  const bodies = [];
  tables.forEach((table, i) => {
    const at = 12 + i * 16;
    header.write(table.tag, at, 'latin1');
    header.writeUInt32BE(checksum(table.data), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(table.data.length, at + 12);
    const padded = Buffer.alloc((table.data.length + 3) & ~3);
    table.data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  const whole = Buffer.concat([header, ...bodies]);
  const adjustment = (0xb1b0afba - checksum(whole)) >>> 0;
  const headOffset = header.readUInt32BE(12 + tables.indexOf(head) * 16 + 8);
  whole.writeUInt32BE(adjustment, headOffset + 8);
  return whole;
}

mkdirSync(outDir, { recursive: true });
const report = [];
for (const file of readdirSync(sourceDir)
  .filter((f) => f.endsWith('.ttf'))
  .sort()) {
  const source = readFileSync(resolve(sourceDir, file));
  let subset = Buffer.from(await subsetFont(source, SUBSET_CHARSET, { targetFormat: 'truetype' }));
  if (RENAMES[file]) subset = renameFont(subset, RENAMES[file]);
  writeFileSync(resolve(outDir, file), subset);
  report.push({
    file,
    source: source.length,
    subset: subset.length,
    sourceSha: sha256(source),
    subsetSha: sha256(subset),
  });
}
console.table(report.map(({ file, source, subset }) => ({ file, source, subset })));
console.log(JSON.stringify(report, null, 2));
