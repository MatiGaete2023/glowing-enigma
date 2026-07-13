import { describe, it, expect, beforeEach } from 'vitest';
import { saveTimer, loadTimer, clearTimer, remainingSecs } from '../src/timerStore.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('remainingSecs()', () => {
  it('returns full duration when timer just started', () => {
    const now = 1000000;
    const t = { endsAt: now + 90000, total: 90 };
    expect(remainingSecs(t, now)).toBe(90);
  });

  it('returns 0 for an expired timer', () => {
    const now = 1000000;
    const t = { endsAt: now - 5000, total: 90 };
    expect(remainingSecs(t, now)).toBe(0);
  });

  it('returns 0 exactly at expiration', () => {
    const now = 1000000;
    const t = { endsAt: now, total: 90 };
    expect(remainingSecs(t, now)).toBe(0);
  });

  it('rounds up partial seconds', () => {
    const now = 1000000;
    const t = { endsAt: now + 1500, total: 90 };
    expect(remainingSecs(t, now)).toBe(2);
  });

  it('defaults to Date.now() when now is omitted', () => {
    const t = { endsAt: Date.now() + 5000, total: 90 };
    const r = remainingSecs(t);
    expect(r).toBeGreaterThanOrEqual(4);
    expect(r).toBeLessThanOrEqual(5);
  });
});

describe('saveTimer() / loadTimer() / clearTimer()', () => {
  it('round-trips a saved timer', () => {
    const t = { endsAt: 123456789, total: 120 };
    saveTimer(t);
    expect(loadTimer()).toEqual(t);
  });

  it('returns null when nothing is saved', () => {
    expect(loadTimer()).toBeNull();
  });

  it('clears the saved timer', () => {
    saveTimer({ endsAt: 123, total: 90 });
    clearTimer();
    expect(loadTimer()).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('gt_timer', '{not valid json');
    expect(loadTimer()).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    localStorage.setItem('gt_timer', JSON.stringify({ foo: 'bar' }));
    expect(loadTimer()).toBeNull();
  });
});
