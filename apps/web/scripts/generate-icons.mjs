// Generates the PWA PNG icons from public/icons/icon.svg: node scripts/generate-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const dir = resolve(import.meta.dirname, '../public/icons');
const svg = await readFile(resolve(dir, 'icon.svg'), 'utf8');

// Maskable icons are cropped by the OS: full-bleed background, glyph inside the central 80% safe zone.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g id="note"', '<g id="note" transform="translate(51.2 51.2) scale(0.8)"');

const targets = [
  { file: 'icon-192.png', source: svg, size: 192 },
  { file: 'icon-512.png', source: svg, size: 512 },
  { file: 'icon-maskable-512.png', source: maskable, size: 512 },
];

for (const { file, source, size } of targets) {
  const png = await sharp(Buffer.from(source)).resize(size, size).png().toBuffer();
  await writeFile(resolve(dir, file), png);
  console.log(`${file} ${size}x${size} ${png.length} bytes`);
}
