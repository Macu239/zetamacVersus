import { useEffect, useState } from 'react';

/**
 * Re-renders on an interval and returns the current time.
 * @param intervalMs - Tick interval.
 * @param active - When false, stops ticking.
 * @returns Date.now() as of the last tick.
 */
export function useNow(intervalMs = 100, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}
