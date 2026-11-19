/**
 * Caminho para voltar depois do login (`location.state.from`, passado por `RequireAuth`).
 * Só aceita caminho interno: começa com `/`, não é `//` nem `/\` (URL externa disfarçada) e não é
 * a própria tela de login. Qualquer outra coisa vai para a home.
 */
export function returnPathFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/')) return '/';
  if (from.startsWith('//') || from.startsWith('/\\')) return '/';
  if (from === '/login' || from.startsWith('/login?') || from.startsWith('/login#')) return '/';
  return from;
}
