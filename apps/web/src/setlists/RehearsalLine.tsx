import { ClockIcon } from './icons';
import { describeRehearsal } from './rehearsal';

/** Linha do ensaio na tela do repertório e no cartão; nada se o repertório não tem hora. */
export function RehearsalLine({
  rehearsalAt,
  now,
  clock = false,
  muted = false,
}: {
  rehearsalAt?: Date;
  now: Date;
  clock?: boolean;
  muted?: boolean;
}) {
  if (!rehearsalAt) return null;
  const { text, past } = describeRehearsal(rehearsalAt, now);
  return (
    <p className={muted || past ? 'rehearsal-line is-muted' : 'rehearsal-line'}>
      {clock && <ClockIcon />}
      <span>{text}</span>
    </p>
  );
}
