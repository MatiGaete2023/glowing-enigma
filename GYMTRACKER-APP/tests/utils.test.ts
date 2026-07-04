import { describe, it, expect } from 'vitest';
import {
  computeWeekDeltaByDate, computeNeatBaseline, validPlan,
  hasData, generateCsv, today,
} from '../src/utils.ts';
import type { WeightEntry, StepsEntry, Plan, SetRow } from '../src/types.ts';
import { DEFAULT_PLAN } from '../src/plan/default.ts';

const w = (date: string, kg: number): WeightEntry =>
  ({ id: `w_${date}`, date, kg, source: 'manual', updatedAt: 0, _deleted: false });

const s = (date: string, steps: number): StepsEntry =>
  ({ id: `st_${date}`, date, steps, source: 'manual', updatedAt: 0, _deleted: false });

describe('today()', () => {
  it('returns a valid ISO date string', () => {
    const t = today();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(t).getFullYear()).toBeGreaterThanOrEqual(2025);
  });
});

describe('computeWeekDeltaByDate()', () => {
  it('returns null if fewer than 4 entries', () => {
    expect(computeWeekDeltaByDate([w('2026-06-01', 90)])).toBeNull();
  });

  it('returns null if not enough points in each window', () => {
    const entries = [
      w('2026-06-01', 90),
      w('2026-06-05', 89.5),
      w('2026-06-10', 89),
      w('2026-06-15', 88.5),
    ];
    // Only one point in the recent window — null
    expect(computeWeekDeltaByDate(entries)).toBeNull();
  });

  it('computes negative delta when losing weight', () => {
    const entries = [
      w('2026-06-01', 91), w('2026-06-02', 90.5),
      w('2026-06-09', 89.5), w('2026-06-10', 89),
    ];
    const delta = computeWeekDeltaByDate(entries);
    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
  });

  it('uses calendar dates not array indices', () => {
    // 3 old + 3 recent with big gap — should still split correctly by date
    const entries = [
      w('2026-05-01', 92), w('2026-05-02', 91.8), w('2026-05-03', 91.5),
      w('2026-06-10', 88), w('2026-06-11', 87.8), w('2026-06-12', 87.5),
    ];
    const delta = computeWeekDeltaByDate(entries);
    expect(delta).toBeNull(); // prev window (may-25 to jun-5) has no entries → null
  });
});

describe('computeNeatBaseline()', () => {
  it('returns null if fewer than 7 entries', () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      s(`2026-06-0${i + 1}`, 5000 + i * 100));
    expect(computeNeatBaseline(entries)).toBeNull();
  });

  it('computes baseline and target from first 7 days', () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      s(`2026-06-${String(i + 1).padStart(2, '0')}`, 5000));
    const result = computeNeatBaseline(entries);
    expect(result).not.toBeNull();
    expect(result!.baseline).toBe(5000);
    expect(result!.target).toBe(6800); // 5000+1750=6750, rounds to nearest 100 = 6800
  });

  it('caps target at 9500', () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      s(`2026-06-${String(i + 1).padStart(2, '0')}`, 9000));
    const result = computeNeatBaseline(entries);
    expect(result!.target).toBe(9500); // 9000+1750=10750, capped at 9500
  });
});

describe('hasData()', () => {
  it('returns false for empty sets', () => {
    expect(hasData([[{} as SetRow, {} as SetRow]])).toBe(false);
  });

  it('returns true if any set has kg', () => {
    expect(hasData([[{ kg: 80, reps: 10 }]])).toBe(true);
  });

  it('returns true if any set has min (cardio)', () => {
    expect(hasData([[{ min: 20 }]])).toBe(true);
  });
});

describe('validPlan()', () => {
  it('validates DEFAULT_PLAN as valid', () => {
    expect(validPlan(DEFAULT_PLAN)).toBe(true);
  });

  it('rejects null', () => {
    expect(validPlan(null)).toBe(false);
  });

  it('rejects plan missing sessions array', () => {
    expect(validPlan({ meta: {}, sessions: {}, phases: [] })).toBe(false);
  });

  it('rejects plan missing a session', () => {
    const p: Partial<Plan> = {
      meta: { version: 'v1', name: 'test' },
      sessions: DEFAULT_PLAN.sessions.filter(s => s.id !== 'S3'),
      phases: DEFAULT_PLAN.phases,
    };
    expect(validPlan(p)).toBe(false);
  });

  it('rejects plan with invalid exercise type', () => {
    const p = JSON.parse(JSON.stringify(DEFAULT_PLAN)) as Plan;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.sessions[0].ex[0] as any).t = 'invalid';
    expect(validPlan(p)).toBe(false);
  });
});

describe('generateCsv()', () => {
  it('returns header row even with no done records', () => {
    const csv = generateCsv([], DEFAULT_PLAN.sessions);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('quincena');
    expect(lines[0]).toContain('ejercicio');
    expect(lines).toHaveLength(1);
  });

  it('generates data rows for done records', () => {
    const record = {
      id: 'q1_S1',
      date: '2026-07-01',
      sessionId: 'S1',
      exNames: ['Prensa 45°', 'Press pecho máquina'],
      sets: [
        [{ kg: 110, reps: 8, rir: 3, done: true }],
        [{ kg: 48, reps: 8 }],
      ],
      lumbar: 0,
      done: true,
      tStart: '08:00',
      tEnd: '09:00',
      tDate: '2026-07-01',
      notes: 'Bien',
      updatedAt: Date.now(),
      _deleted: false,
    };

    const csv = generateCsv([record], DEFAULT_PLAN.sessions);
    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[1]).toContain('Prensa 45°');
    expect(lines[1]).toContain('110');
    expect(lines[1]).toContain('8');
  });

  it('escapes commas in notes', () => {
    const record = {
      id: 'q1_S1',
      date: '2026-07-01',
      sessionId: 'S1',
      exNames: ['Prensa 45°'],
      sets: [[{ kg: 110, reps: 8 }]],
      lumbar: 0,
      done: true,
      tStart: '08:00',
      tEnd: '09:00',
      tDate: '2026-07-01',
      notes: 'Bien, muy bien',
      updatedAt: Date.now(),
      _deleted: false,
    };

    const csv = generateCsv([record], DEFAULT_PLAN.sessions);
    expect(csv).toContain('"Bien, muy bien"');
  });
});
