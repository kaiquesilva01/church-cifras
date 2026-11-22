// Distintivo monocromático do aviso (a barra de status do Android usa só o alfa).
// Remove o fundo e pinta a chama de branco. Os dois furos (cabeça da nota e haste) viram máscara:
// ficam transparentes em vez de pintados na cor do fundo.
const BACKGROUND = /<rect[^>]*rx="112"[^>]*\/>/;
const HOLE = /<ellipse[^>]*\/>|<rect x="49"[^>]*\/>/g;
const DARK = /fill="#0A0B0D"/;

export function badgeSvg(svg) {
  const holes = svg.match(HOLE) ?? [];
  const transform = svg.match(/<g transform="([^"]+)">/)?.[1];
  const path = svg.match(/<path d="([^"]+)"/)?.[1];
  if (!BACKGROUND.test(svg) || holes.length !== 2 || !transform || !path) {
    throw new Error('badge: o ícone não tem o formato esperado (fundo, chama e dois furos)');
  }
  const cut = holes.map((hole) => hole.replace(DARK, 'fill="#000000"')).join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    '  <defs>',
    '    <mask id="furos" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">',
    '      <rect width="512" height="512" fill="#ffffff" />',
    `      <g transform="${transform}">${cut}</g>`,
    '    </mask>',
    '  </defs>',
    '  <g id="note" mask="url(#furos)">',
    `    <g transform="${transform}">`,
    `      <path d="${path}" fill="#ffffff" />`,
    '    </g>',
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}
