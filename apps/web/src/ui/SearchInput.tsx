import { useRef, type ComponentProps } from 'react';

type InputProps = Omit<ComponentProps<'input'>, 'type' | 'className' | 'value' | 'onChange'>;

export interface SearchInputProps extends InputProps {
  value: string;
  /** Receives the new text, and '' when the clear button is pressed. */
  onChange: (value: string) => void;
}

/** Search field with a clear (×) button at the end, visible only while there is text. */
export function SearchInput({ value, onChange, ...rest }: SearchInputProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="search-field">
      <input
        {...rest}
        ref={input}
        type="search"
        className="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== '' && (
        <button
          type="button"
          className="search-clear"
          aria-label="Limpar busca"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
