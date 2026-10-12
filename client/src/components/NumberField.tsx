import { useEffect, useState, type KeyboardEvent } from 'react';

interface NumberFieldProps {
  id: string;
  /** Accessible label (visually hidden; surrounding text gives visual context). */
  label: string;
  value: number;
  onCommit: (value: number) => void;
}

/**
 * Small integer input that commits on blur or Enter, so partially typed numbers are never sent.
 * @param props - Field props.
 * @returns The labeled input.
 */
export function NumberField({ id, label, value, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  /** Parses the text and commits it, or reverts when it is not an integer. */
  function commit(): void {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) {
      setText(String(value));
      return;
    }
    const next = Number(trimmed);
    if (next !== value) onCommit(next);
  }

  /**
   * Commits on Enter.
   * @param e - Keyboard event.
   */
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }

  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        className="num"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </>
  );
}
