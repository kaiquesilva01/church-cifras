/** Erro ao carregar o documento do ministério: a pessoa tenta de novo sem sair do app. */
export function MinistryLoadError() {
  return (
    <div role="alert" className="status">
      <p className="error">Não foi possível carregar o ministério. Tente de novo.</p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        Tentar de novo
      </button>
    </div>
  );
}
