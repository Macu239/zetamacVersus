import type { GameMode, GameSettings, RangeSettings } from './types';

export const GAME_MODES: readonly GameMode[] = ['race', 'set'];
export const DURATION_PRESETS = [30, 60, 120, 300] as const;
export const MIN_DURATION_SEC = 10;
export const MAX_DURATION_SEC = 600;
export const MIN_OPERAND = 0;
export const MAX_OPERAND = 10000;

/** Zetamac's default settings. */
export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'race',
  durationSec: 120,
  addition: { enabled: true, aMin: 2, aMax: 100, bMin: 2, bMax: 100 },
  subtraction: { enabled: true },
  multiplication: { enabled: true, aMin: 2, aMax: 12, bMin: 2, bMax: 100 },
  division: { enabled: true },
};

/**
 * Deep-copies a settings object.
 * @param settings - Settings to copy.
 * @returns An independent copy.
 */
export function cloneSettings(settings: GameSettings): GameSettings {
  return {
    mode: settings.mode,
    durationSec: settings.durationSec,
    addition: { ...settings.addition },
    subtraction: { ...settings.subtraction },
    multiplication: { ...settings.multiplication },
    division: { ...settings.division },
  };
}

export type SettingsValidation = { ok: true; settings: GameSettings } | { ok: false; error: string };

class SettingsError extends Error {}

/**
 * Narrows an unknown value to a plain object.
 * @param value - Value to check.
 * @returns True when the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads an integer field and enforces bounds.
 * @param obj - Source object.
 * @param key - Field name.
 * @param label - Human-readable name for error messages.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns The integer value.
 */
function readInt(obj: Record<string, unknown>, key: string, label: string, min: number, max: number): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SettingsError(`${label} must be a whole number.`);
  }
  if (value < min || value > max) {
    throw new SettingsError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Reads an enabled flag from an operation block.
 * @param value - The operation block.
 * @param label - Operation name for error messages.
 * @returns The enabled flag.
 */
function readToggle(value: unknown, label: string): boolean {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    throw new SettingsError(`${label} settings are missing.`);
  }
  return value.enabled;
}

/**
 * Reads and validates an operation with operand ranges.
 * @param value - The operation block.
 * @param label - Operation name for error messages.
 * @returns A sanitized range settings object.
 */
function readRange(value: unknown, label: string): RangeSettings {
  const enabled = readToggle(value, label);
  const obj = value as Record<string, unknown>;
  const aMin = readInt(obj, 'aMin', `${label} first minimum`, MIN_OPERAND, MAX_OPERAND);
  const aMax = readInt(obj, 'aMax', `${label} first maximum`, MIN_OPERAND, MAX_OPERAND);
  const bMin = readInt(obj, 'bMin', `${label} second minimum`, MIN_OPERAND, MAX_OPERAND);
  const bMax = readInt(obj, 'bMax', `${label} second maximum`, MIN_OPERAND, MAX_OPERAND);
  if (aMin > aMax) throw new SettingsError(`${label}: first range minimum is larger than its maximum.`);
  if (bMin > bMax) throw new SettingsError(`${label}: second range minimum is larger than its maximum.`);
  return { enabled, aMin, aMax, bMin, bMax };
}

/**
 * Validates untrusted settings input and returns a sanitized copy.
 * @param input - Settings from a client or form.
 * @returns The sanitized settings, or an error message.
 */
export function validateSettings(input: unknown): SettingsValidation {
  try {
    if (!isRecord(input)) throw new SettingsError('Settings are missing.');
    const mode = input.mode;
    if (typeof mode !== 'string' || !(GAME_MODES as readonly string[]).includes(mode)) {
      throw new SettingsError('Choose a game mode.');
    }
    const durationSec = readInt(input, 'durationSec', 'Duration (seconds)', MIN_DURATION_SEC, MAX_DURATION_SEC);
    const addition = readRange(input.addition, 'Addition');
    const multiplication = readRange(input.multiplication, 'Multiplication');
    const subtraction = { enabled: readToggle(input.subtraction, 'Subtraction') };
    const division = { enabled: readToggle(input.division, 'Division') };

    if (!addition.enabled && !subtraction.enabled && !multiplication.enabled && !division.enabled) {
      throw new SettingsError('Enable at least one operation.');
    }
    if (division.enabled && multiplication.aMin < 1) {
      throw new SettingsError('Division uses the first multiplication range as the divisor, so it must start at 1 or higher.');
    }
    return { ok: true, settings: { mode: mode as GameMode, durationSec, addition, subtraction, multiplication, division } };
  } catch (err) {
    if (err instanceof SettingsError) return { ok: false, error: err.message };
    throw err;
  }
}
