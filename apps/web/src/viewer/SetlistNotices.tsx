import { Link } from 'react-router';
import { UpdateBanner } from '../setlists/UpdateBanner';
import { viewerUrl, type ViewerSetlist } from './useViewerSetlist';

/** Banner de mudanças, aviso de tom inexistente e lembrete do tom do repertório (acima da cifra). */
export function SetlistNotices({ setlist, songId }: { setlist: ViewerSetlist; songId: string }) {
  const { banner, missingKey, reminderKey, extraQuery } = setlist;
  return (
    <>
      {banner?.type === 'changes' && (
        <UpdateBanner message={banner.message} onAccept={banner.accept} />
      )}
      {banner?.type === 'removed' && (
        <div role="status" className="notice update-banner">
          <span>Este repertório foi removido.</span>
          <Link to="/?aba=repertorios">Ver repertórios</Link>
        </div>
      )}
      {missingKey && (
        <p role="status" className="notice">
          {`O tom ${missingKey.wanted} deste louvor não existe mais; abrimos o ${missingKey.opened}.`}
        </p>
      )}
      {reminderKey && (
        <p role="status" className="notice">
          {`Tom do repertório: ${reminderKey} · `}
          <Link to={viewerUrl(songId, reminderKey, extraQuery)} replace>
            {`Voltar ao ${reminderKey}`}
          </Link>
        </p>
      )}
    </>
  );
}
