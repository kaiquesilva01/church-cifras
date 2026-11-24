import { reloadPage } from '../lib/reloadPage';

/**
 * Falha ao carregar o ministério: caixa de erro do design system com "Tentar de novo".
 * `missing`: o documento não existe; mensagem própria e sem retry (tentar de novo não resolve).
 */
export function MinistryLoadError({ missing = false }: { missing?: boolean }) {
  if (missing) {
    return (
      <div role="alert" className="error-box">
        <span>Ministério não encontrado.</span>
      </div>
    );
  }
  return (
    <div role="alert" className="error-box">
      <span>Não foi possível carregar o ministério. Tente de novo.</span>
      <button type="button" className="btn-primary" onClick={reloadPage}>
        Tentar de novo
      </button>
    </div>
  );
}
