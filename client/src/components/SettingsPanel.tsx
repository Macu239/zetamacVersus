import { useState } from 'react';
import {
  DURATION_PRESETS,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  OPERATION_SYMBOLS,
  cloneSettings,
  validateSettings,
  type GameSettings,
  type RangeSettings,
} from '@zv/shared';
import { NumberField } from './NumberField';

interface SettingsPanelProps {
  settings: GameSettings;
  editable: boolean;
  onChange: (settings: GameSettings) => void;
}

type RangeKey = 'addition' | 'multiplication';

/**
 * Zetamac-style settings form. The host edits it; the guest sees the same form disabled, updated live.
 * @param props - Panel props.
 * @returns The settings form.
 */
export function SettingsPanel({ settings, editable, onChange }: SettingsPanelProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const isPreset = (DURATION_PRESETS as readonly number[]).includes(settings.durationSec);
  const showCustom = customOpen || !isPreset;

  /**
   * Applies a change locally, validates it and sends it when valid.
   * @param mutate - Function that edits a copy of the settings.
   */
  function apply(mutate: (draft: GameSettings) => void): void {
    const draft = cloneSettings(settings);
    mutate(draft);
    const result = validateSettings(draft);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setLocalError(null);
    onChange(result.settings);
  }

  /**
   * Renders "Range: ( a to b ) op ( c to d )" for an operation.
   * @param key - Which operation's ranges.
   * @returns The range row.
   */
  function rangeRow(key: RangeKey) {
    const r: RangeSettings = settings[key];
    const name = key === 'addition' ? 'Addition' : 'Multiplication';
    const sym = key === 'addition' ? OPERATION_SYMBOLS.add : OPERATION_SYMBOLS.mul;
    /**
     * Builds a commit handler for one bound.
     * @param field - Bound to update.
     * @returns Commit handler.
     */
    const set = (field: keyof Omit<RangeSettings, 'enabled'>) => (n: number) => apply((d) => { d[key][field] = n; });
    return (
      <div className="range indent">
        Range: (
        <NumberField id={`${key}-aMin`} label={`${name} first number minimum`} value={r.aMin} onCommit={set('aMin')} />
        to
        <NumberField id={`${key}-aMax`} label={`${name} first number maximum`} value={r.aMax} onCommit={set('aMax')} />
        ) {sym} (
        <NumberField id={`${key}-bMin`} label={`${name} second number minimum`} value={r.bMin} onCommit={set('bMin')} />
        to
        <NumberField id={`${key}-bMax`} label={`${name} second number maximum`} value={r.bMax} onCommit={set('bMax')} />
        )
      </div>
    );
  }

  /**
   * Handles the duration dropdown.
   * @param value - Selected option value.
   */
  function onDuration(value: string): void {
    if (value === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    apply((d) => { d.durationSec = Number(value); });
  }

  return (
    <fieldset className="settings" disabled={!editable}>
      <legend className="sr-only">Game settings</legend>
      {!editable && <p className="note">Only the host can change settings.</p>}

      <div className="op">
        <label>
          <input type="checkbox" checked={settings.addition.enabled} onChange={(e) => apply((d) => { d.addition.enabled = e.target.checked; })} />
          Addition
        </label>
        {rangeRow('addition')}
      </div>

      <div className="op">
        <label>
          <input type="checkbox" checked={settings.subtraction.enabled} onChange={(e) => apply((d) => { d.subtraction.enabled = e.target.checked; })} />
          Subtraction
        </label>
        <div className="indent">Addition problems in reverse.</div>
      </div>

      <div className="op">
        <label>
          <input type="checkbox" checked={settings.multiplication.enabled} onChange={(e) => apply((d) => { d.multiplication.enabled = e.target.checked; })} />
          Multiplication
        </label>
        {rangeRow('multiplication')}
      </div>

      <div className="op">
        <label>
          <input type="checkbox" checked={settings.division.enabled} onChange={(e) => apply((d) => { d.division.enabled = e.target.checked; })} />
          Division
        </label>
        <div className="indent">Multiplication problems in reverse.</div>
      </div>

      <div className="duration">
        <label htmlFor="duration">Duration:</label>
        <select id="duration" value={showCustom ? 'custom' : String(settings.durationSec)} onChange={(e) => onDuration(e.target.value)}>
          {DURATION_PRESETS.map((sec) => (
            <option key={sec} value={sec}>{sec} seconds</option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {showCustom && (
          <>
            <NumberField
              id="duration-custom"
              label={`Custom duration in seconds, ${MIN_DURATION_SEC} to ${MAX_DURATION_SEC}`}
              value={settings.durationSec}
              onCommit={(n) => apply((d) => { d.durationSec = n; })}
            />
            seconds ({MIN_DURATION_SEC} to {MAX_DURATION_SEC})
          </>
        )}
      </div>

      {localError && <p className="error" role="alert">{localError}</p>}
    </fieldset>
  );
}
