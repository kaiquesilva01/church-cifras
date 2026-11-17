import type { KeyName } from '@cifras/chords';
import { Dialog } from '../viewer/Dialog';

export interface KeyPickerProps {
  /** Tons salvos da música. */
  keys: KeyName[];
  current: KeyName;
  onPick: (key: KeyName) => void;
  onClose: () => void;
}

export function KeyPicker({ keys, current, onPick, onClose }: KeyPickerProps) {
  return (
    <Dialog titleId="key-picker-title" onClose={onClose}>
      <h2 id="key-picker-title" className="dialog-title">
        Tom
      </h2>
      <div className="chips">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className="chip"
            aria-pressed={key === current}
            onClick={() => onPick(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Dialog>
  );
}
