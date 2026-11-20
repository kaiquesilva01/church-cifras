/** Faixa de identificação do site de teste (só aparece quando VITE_TEST_BANNER está definido). */
export function TestBanner({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div className="test-banner" role="status">
      {label}
    </div>
  );
}
