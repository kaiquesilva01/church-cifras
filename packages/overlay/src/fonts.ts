export type FontId =
  | 'mono-bold'
  | 'mono-regular'
  | 'sans-bold'
  | 'sans-regular'
  | 'roboto-bold'
  | 'roboto-regular'
  | 'robotomono-bold'
  | 'robotomono-regular';

export type FontBytesLoader = (id: FontId) => Promise<Uint8Array>;

export const FONT_FILES: Record<FontId, string> = {
  'mono-bold': 'LiberationMono-Bold.ttf',
  'mono-regular': 'LiberationMono-Regular.ttf',
  'sans-bold': 'LiberationSans-Bold.ttf',
  'sans-regular': 'LiberationSans-Regular.ttf',
  'roboto-bold': 'Roboto-Bold.ttf',
  'roboto-regular': 'Roboto-Regular.ttf',
  'robotomono-bold': 'RobotoMono-Bold.ttf',
  'robotomono-regular': 'RobotoMono-Regular.ttf',
};

type Family = 'mono' | 'roboto' | 'robotomono' | 'sans';

// Order matters: Roboto Mono before Roboto. Anything unknown falls back to Liberation Sans.
function familyOf(fontName: string): Family {
  if (/roboto[\s_-]?mono/i.test(fontName)) return 'robotomono';
  if (/roboto/i.test(fontName)) return 'roboto';
  if (/courier/i.test(fontName)) return 'mono';
  return 'sans';
}

export function chooseFont(fontName: string, bold: boolean): FontId {
  return `${familyOf(fontName)}-${bold ? 'bold' : 'regular'}` as FontId;
}
