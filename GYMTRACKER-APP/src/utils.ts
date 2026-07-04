import type { Plan, SetRow, WeightEntry, StepsEntry, TrainingRecord } from './types.ts';
import { SESSION_ORDER, FIELDS } from './types.ts';

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validPlan(p: unknown): p is Plan {
  try {
    const plan = p as Plan;
    if (!plan || !Array.isArray(plan.sessions) || !Array.isArray(plan.phases)) return false;
    return SESSION_ORDER.every(k => {
      const s = plan.sessions.find(sx => sx.id === k);
      return s && s.name && Array.isArray(s.ex) && s.ex.every(e => e.n && FIELDS[e.t]);
    });
  } catch {
    return false;
  }
}

export function hasData(sets: SetRow[][]): boolean {
  return sets.some(rows =>
    rows.some(x => x.kg || x.reps || x.min || x.ppm || x.dist || x.vueltas || x.rir || x.rest || x.rpe)
  );
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

export function computeWeekDeltaByDate(wts: WeightEntry[]): number | null {
  if (wts.length < 4) return null;
  const sorted = [...wts].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const t7 = new Date(last); t7.setDate(last.getDate() - 7);
  const t14 = new Date(last); t14.setDate(last.getDate() - 14);
  const recent = sorted.filter(w => new Date(w.date) > t7).map(w => w.kg);
  const prev = sorted.filter(w => { const d = new Date(w.date); return d > t14 && d <= t7; }).map(w => w.kg);
  if (recent.length < 2 || prev.length < 2) return null;
  return mean(recent) - mean(prev);
}

export function computeNeatBaseline(steps: StepsEntry[]): { baseline: number; target: number } | null {
  const sorted = [...steps].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 7) return null;
  const baseline = Math.round(mean(sorted.slice(0, 7).map(s => s.steps)));
  const target = Math.min(Math.round((baseline + 1750) / 100) * 100, 9500);
  return { baseline, target };
}

export function generateCsv(records: TrainingRecord[], sessions: Plan['sessions']): string {
  const header = ['quincena','sesion','nombre','fecha','inicio','termino','ejercicio','serie','kg','reps','rir','desc_s','ppm','rpe','min','metros','vueltas','dolor_lumbar','notas'];
  const rows: string[][] = [header];

  for (const r of records) {
    if (!r.done && !hasData(r.sets ?? [])) continue;
    const parts = r.id.match(/^q(\d+)_(.+)$/);
    if (!parts) continue;
    const q = parts[1];
    const sk = parts[2];
    const sx = sessions.find(s => s.id === sk);
    if (!sx) continue;

    for (let ei = 0; ei < sx.ex.length; ei++) {
      const exName = r.exNames?.[ei] ?? sx.ex[ei].n;
      const sets = r.sets?.[ei] ?? [];
      sets.forEach((x, si) => {
        rows.push([
          q, sk, sx.name, r.date, r.tStart, r.tEnd, exName, String(si + 1),
          x.kg != null ? String(x.kg) : '',
          x.reps != null ? String(x.reps) : '',
          x.rir != null ? String(x.rir) : '',
          x.rest != null ? String(x.rest) : '',
          x.ppm != null ? String(x.ppm) : '',
          x.rpe != null ? String(x.rpe) : '',
          x.min != null ? String(x.min) : '',
          x.dist != null ? String(x.dist) : '',
          x.vueltas != null ? String(x.vueltas) : '',
          si === 0 ? (r.lumbar >= 0 ? String(r.lumbar) : '') : '',
          si === 0 ? (r.notes ?? '').replace(/\n/g, ' ') : '',
        ]);
      });
    }
  }

  return rows.map(row =>
    row.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
  ).join('\n');
}

export function downloadBlob(content: string, type: string, filename: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
