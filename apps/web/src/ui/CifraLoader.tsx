/** Centered gold spinner shown while a cifra loads. The text is for screen readers only. */
export function CifraLoader() {
  return (
    <div role="status" className="cifra-loader">
      <span className="cifra-loader-ring" aria-hidden="true" />
      <span className="sr-only">Carregando cifra…</span>
    </div>
  );
}
