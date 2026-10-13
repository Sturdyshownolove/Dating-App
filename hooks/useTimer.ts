import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getRemainingSeconds, getTimerColor } from '@/utils/time';

interface UseTimerResult {
  remaining: number;
  formatted: string;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  percentage: number;
  color: string;
}

export const useTimer = (expiresAt: Date, totalDuration?: number): UseTimerResult => {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(expiresAt));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Denominator for `percentage`. Callers that know the real match duration
  // (TIERS[currentTier].duration) should pass it via `totalDuration` so the
  // bar reflects true elapsed-of-total. When omitted, fall back to whatever
  // `remaining` was on first mount captured in a ref — keeps the value
  // constant across re-renders (the prior `total = ... || ...remaining...`
  // formula reduced algebraically to `remaining`, so `percentage` was
  // always 1.0 and the progress bar never moved — flagged in
  // 06_Reports/tech_debt_2026-05-16#Timer progress always 100%).
  const fallbackTotalRef = useRef(remaining > 0 ? remaining : 1);
  const total = totalDuration && totalDuration > 0
    ? totalDuration
    : fallbackTotalRef.current;

  useEffect(() => {
    setRemaining(getRemainingSeconds(expiresAt));

    intervalRef.current = setInterval(() => {
      const r = getRemainingSeconds(expiresAt);
      setRemaining(r);
      if (r <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);

    // AppState sync: when the app comes back to the foreground, the JS
    // interval may have paused or drifted (iOS pauses JS timers when
    // backgrounded; on Android behaviour varies). Force-recompute
    // `remaining` from `expiresAt` so the display reflects elapsed
    // real-time, not the last in-process tick.
    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') setRemaining(getRemainingSeconds(expiresAt));
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [expiresAt]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return {
    remaining,
    formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    hours,
    minutes,
    seconds,
    isExpired: remaining <= 0,
    percentage: total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0,
    color: getTimerColor(remaining, total),
  };
};
