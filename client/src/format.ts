/**
 * Formats a countdown in m:ss.
 * @param ms - Milliseconds remaining.
 * @returns Formatted clock string.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats a solve time in seconds with two decimals.
 * @param ms - Milliseconds, or null when there is no data.
 * @returns Formatted string.
 */
export function formatSolve(ms: number | null): string {
  return ms === null ? '--' : `${(ms / 1000).toFixed(2)} s`;
}
