export interface UpdateBannerProps {
  message?: string;
  onAccept: () => void;
}

export function UpdateBanner({
  message = 'O repertório foi alterado.',
  onAccept,
}: UpdateBannerProps) {
  return (
    <div role="status" className="notice update-banner">
      <span>{message}</span>
      <button type="button" className="btn" onClick={onAccept}>
        Atualizar
      </button>
    </div>
  );
}
