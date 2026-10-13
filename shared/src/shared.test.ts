import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, cloneSettings, generateProblem, mulberry32, validateSettings, type GameSettings } from './index';

/**
 * Builds settings with only the given operations enabled.
 * @param ops - Which operations to enable.
 * @returns Settings based on Zetamac defaults.
 */
function only(ops: { add?: boolean; sub?: boolean; mul?: boolean; div?: boolean }): GameSettings {
  const s = cloneSettings(DEFAULT_SETTINGS);
  s.addition.enabled = !!ops.add;
  s.subtraction.enabled = !!ops.sub;
  s.multiplication.enabled = !!ops.mul;
  s.division.enabled = !!ops.div;
  return s;
}

describe('generateProblem', () => {
  const rng = mulberry32(42);

  it('keeps addition operands within range', () => {
    const s = only({ add: true });
    for (let i = 0; i < 500; i++) {
      const p = generateProblem(s, i, rng);
      const [a, b] = p.text.split(' + ').map(Number);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(100);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(100);
      expect(p.answer).toBe(a + b);
    }
  });

  it('never produces negative subtraction results', () => {
    const s = only({ sub: true });
    for (let i = 0; i < 500; i++) {
      const p = generateProblem(s, i, rng);
      expect(p.op).toBe('sub');
      expect(p.answer).toBeGreaterThanOrEqual(0);
      const [x, y] = p.text.split(' − ').map(Number);
      expect(x - y).toBe(p.answer);
    }
  });

  it('always produces whole-number division results', () => {
    const s = only({ div: true });
    for (let i = 0; i < 500; i++) {
      const p = generateProblem(s, i, rng);
      const [x, y] = p.text.split(' ÷ ').map(Number);
      expect(Number.isInteger(x / y)).toBe(true);
      expect(x / y).toBe(p.answer);
    }
  });

  it('keeps multiplication operands within range', () => {
    const s = only({ mul: true });
    for (let i = 0; i < 500; i++) {
      const p = generateProblem(s, i, rng);
      const [a, b] = p.text.split(' × ').map(Number);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(12);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(100);
      expect(p.answer).toBe(a * b);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateProblem(DEFAULT_SETTINGS, 1, mulberry32(7));
    const b = generateProblem(DEFAULT_SETTINGS, 1, mulberry32(7));
    expect(a).toEqual(b);
  });

  it('avoids repeating the previous problem when possible', () => {
    const s = only({ add: true });
    s.addition = { enabled: true, aMin: 1, aMax: 2, bMin: 1, bMax: 1 };
    for (let i = 0; i < 50; i++) {
      expect(generateProblem(s, i, rng, '1 + 1').text).toBe('2 + 1');
    }
  });
});

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it('rejects when no operation is enabled', () => {
    expect(validateSettings(only({})).ok).toBe(false);
  });

  it('rejects min greater than max', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.addition.aMin = 50;
    s.addition.aMax = 10;
    expect(validateSettings(s).ok).toBe(false);
  });

  it('rejects out-of-range durations and non-integers', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, durationSec: 5 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, durationSec: 601 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, durationSec: 30.5 }).ok).toBe(false);
  });

  it('rejects a zero divisor range when division is on', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.multiplication.aMin = 0;
    expect(validateSettings(s).ok).toBe(false);
    s.division.enabled = false;
    expect(validateSettings(s).ok).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(validateSettings(null).ok).toBe(false);
    expect(validateSettings({ durationSec: 60 }).ok).toBe(false);
    expect(validateSettings('hello').ok).toBe(false);
  });

  it('accepts both game modes and rejects anything else', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, mode: 'set' }).ok).toBe(true);
    expect(validateSettings({ ...DEFAULT_SETTINGS, mode: 'solo' }).ok).toBe(false);
    const { mode: _omit, ...noMode } = DEFAULT_SETTINGS;
    expect(validateSettings(noMode).ok).toBe(false);
  });

  it('strips unknown fields', () => {
    const res = validateSettings({ ...DEFAULT_SETTINGS, evil: true });
    expect(res.ok && 'evil' in res.settings).toBe(false);
  });
});
