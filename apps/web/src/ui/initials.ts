const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Up to two initials, without particles: "Casa de Oração" -> "CO". Counts characters, not UTF-16 units.
 * If only particles remain, uses the words themselves ("de" -> "D").
 */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const significant = words.filter((word) => !PARTICLES.has(word.toLocaleLowerCase('pt-BR')));
  return (significant.length > 0 ? significant : words)
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? '').toLocaleUpperCase('pt-BR'))
    .join('');
}
