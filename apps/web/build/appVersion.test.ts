import { describe, expect, it } from 'vitest';
import { appVersionPlugin } from './appVersion';

describe('appVersionPlugin', () => {
  it('injeta <meta name="app-version"> com a versão no head do index.html', () => {
    const plugin = appVersionPlugin('abc');
    const transform = plugin.transformIndexHtml as () => unknown;
    expect(transform()).toEqual([
      { tag: 'meta', attrs: { name: 'app-version', content: 'abc' }, injectTo: 'head' },
    ]);
  });
});
