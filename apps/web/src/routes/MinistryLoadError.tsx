import { reloadPage } from '../lib/reloadPage';

/**
 * Erro de carregamento do acesso ou do ministério: caixa de erro do design system com "Tentar de novo".
 * `missing`: o documento do ministério não existe; mensagem própria e sem retry (tentar de novo não resolve).
 * `access`: a leitura do vínculo falhou ou o claim não acompanhou o vínculo (texto de acesso;
 * quem usa acrescenta o "Sair").
 */
export function MinistryLoadError({
  missing = false,
  access = false,
}: {
  missing?: boolean;
  access?: boolean;
}) {
  if (missing) {
    return (
      <div role="alert" className="error-box">
        <span>Ministério não encontrado.</span>
      </div>
    );
  }
  const text = access
    ? 'Não foi possível verificar o seu acesso. Tente de novo.'
    : 'Não foi possível carregar o ministério. Tente de novo.';
  return (
    <div role="alert" className="error-box">
      <span>{text}</span>
      <button type="button" className="btn-primary" onClick={reloadPage}>
        Tentar de novo
      </button>
    </div>
  );
}
