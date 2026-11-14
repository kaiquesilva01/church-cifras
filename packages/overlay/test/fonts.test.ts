import { describe, expect, it } from 'vitest';
import { FONT_FILES, chooseFont } from '../src/fonts';

describe('chooseFont', () => {
  it('chooses substitute fonts by family and weight', () => {
    expect(chooseFont('Courier New Bold', true)).toBe('mono-bold');
    expect(chooseFont('Courier', false)).toBe('mono-regular');
    expect(chooseFont('Roboto Mono,Bold', true)).toBe('robotomono-bold');
    expect(chooseFont('RobotoMono-Regular', false)).toBe('robotomono-regular');
    expect(chooseFont('Roboto-Bold', true)).toBe('roboto-bold');
    expect(chooseFont('Arial-BoldMT', true)).toBe('sans-bold');
    expect(chooseFont('ArialMT', false)).toBe('sans-regular');
    expect(chooseFont('Helvetica', false)).toBe('sans-regular');
    expect(chooseFont('LiberationSans-Bold', true)).toBe('sans-bold');
    expect(chooseFont('Verdana-Bold', true)).toBe('sans-bold');
    expect(chooseFont('XYZ', false)).toBe('sans-regular');
    expect(chooseFont('XYZ', true)).toBe('sans-bold');
  });

  it('uses the regular variant when the run is not bold (key indicator in Arial regular)', () => {
    expect(chooseFont('Arial', false)).toBe('sans-regular');
    expect(chooseFont('Courier New', false)).toBe('mono-regular');
  });

  it('maps every font id to a ttf file', () => {
    expect(Object.values(FONT_FILES).sort()).toEqual(
      [
        'LiberationMono-Bold.ttf',
        'LiberationMono-Regular.ttf',
        'LiberationSans-Bold.ttf',
        'LiberationSans-Regular.ttf',
        'RobotoMono-Bold.ttf',
        'RobotoMono-Regular.ttf',
        'Roboto-Bold.ttf',
        'Roboto-Regular.ttf',
      ].sort(),
    );
  });
});
