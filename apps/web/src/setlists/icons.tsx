/** Ícones de linha do repertório (traço, herdam a cor do texto). Decorativos: o nome acessível fica no botão. */
const SVG_PROPS = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const;

export function CloseIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

/** Chevron pequeno ao lado do nome: sinaliza que o louvor abre a cifra. */
export function OpenChevronIcon() {
  return (
    <svg {...SVG_PROPS} width={12} height={12} strokeWidth={2.6}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Chevron de voltar, à esquerda do rótulo "Voltar". */
export function BackChevronIcon() {
  return (
    <svg {...SVG_PROPS} width={16} height={16} strokeWidth={2.4}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** Relógio da linha do ensaio: 14 px, herda a cor do texto. */
export function ClockIcon() {
  return (
    <svg {...SVG_PROPS} width={14} height={14} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
