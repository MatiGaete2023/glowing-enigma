const KEY = 'gt_timer';

export interface TimerState {
  endsAt: number;
  total: number;
}

export function saveTimer(t: TimerState): void {
  localStorage.setItem(KEY, JSON.stringify(t));
}

export function loadTimer(): TimerState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.endsAt !== 'number' || typeof parsed?.total !== 'number') return null;
    return parsed as TimerState;
  } catch {
    return null;
  }
}

export function clearTimer(): void {
  localStorage.removeItem(KEY);
}

export function remainingSecs(t: TimerState, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}
