import { useAuth } from '../auth/useAuth';

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'visitante';
  return (
    <section className="card">
      <h2>Olá, {firstName}</h2>
      <p className="muted">A busca de cifras chega em breve.</p>
    </section>
  );
}
