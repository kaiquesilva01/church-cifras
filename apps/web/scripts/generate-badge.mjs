// Gera public/icons/badge-96.png a partir do icon.svg: node scripts/generate-badge.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { badgeSvg } from './badge.mjs';

const dir = resolve(import.meta.dirname, '../public/icons');
const icon = await readFile(resolve(dir, 'icon.svg'), 'utf8');
const png = await sharp(Buffer.from(badgeSvg(icon)))
  .resize(96, 96)
  .png()
  .toBuffer();
await writeFile(resolve(dir, 'badge-96.png'), png);
console.log(`badge-96.png 96x96 ${png.length} bytes`);
