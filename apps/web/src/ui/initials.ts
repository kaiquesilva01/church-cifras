/** Up to two initials: "Gabriela Rocha" -> "GR". Counts characters, not UTF-16 units. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
    .join('');
}
