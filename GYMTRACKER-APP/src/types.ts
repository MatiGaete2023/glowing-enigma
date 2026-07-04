export type ExType = 'fuerza' | 'cardio' | 'mov' | 'carry' | 'circuit';

export interface Exercise {
  n: string;
  t: ExType;
  sets?: number;
  rest?: number;
  tgt?: string;
  kg?: number;
}

export interface Session {
  id: string;
  name: string;
  focus?: string;
  dur?: number;
  warmup?: string;
  ex: Exercise[];
}

export interface Phase {
  name: string;
  rir: string;
  qs: number[];
}

export interface Challenge {
  q: number;
  label: string;
  desc: string;
}

export interface PlanMeta {
  version: string;
  name: string;
  gobernadores?: string[];
}

export interface Plan {
  meta: PlanMeta;
  sessions: Session[];
  phases: Phase[];
  challenges?: Challenge[];
}

export interface SetRow {
  kg?: number;
  reps?: number;
  rir?: number;
  rest?: number;
  ppm?: number;
  min?: number;
  dist?: number;
  vueltas?: number;
  rpe?: number;
  done?: boolean;
}

export interface TrainingRecord {
  id: string;
  date: string;
  sessionId: string;
  exNames: string[];
  sets: SetRow[][];
  lumbar: number;
  done: boolean;
  tStart: string;
  tEnd: string;
  tDate: string;
  notes: string;
  updatedAt: number;
  _deleted: boolean;
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
  source: 'manual' | 'health-connect';
  updatedAt: number;
  _deleted: boolean;
}

export interface WaistEntry {
  id: string;
  date: string;
  cm: number;
  source: 'manual' | 'health-connect';
  updatedAt: number;
  _deleted: boolean;
}

export interface StepsEntry {
  id: string;
  date: string;
  steps: number;
  source: 'manual' | 'health-connect';
  updatedAt: number;
  _deleted: boolean;
}

export interface AppSettings {
  id: string;
  soundEnabled: boolean;
  hcEnabled: boolean;
  age?: number;
  bleDeviceId?: string;
  bleDeviceName?: string;
  planJson?: string;
  updatedAt: number;
  _deleted?: boolean;
}

export interface LegacyBackupV1 {
  app: 'gym-tracker';
  schema: 1;
  fecha: string;
  meta?: { currentQ?: number };
  records: Record<string, {
    date?: string;
    start?: string;
    end?: string;
    exercises?: Record<number, SetRow[]>;
    notes?: string;
    lumbar?: number | null;
    status?: string;
    exNames?: string[];
    planVer?: string;
    done?: boolean;
  }>;
  weights?: Array<{ date: string; kg: number }>;
  waist?: Array<{ date: string; cm: number }>;
  steps?: Array<{ date: string; steps: number }>;
}

export interface BackupV2 {
  app: 'gym-tracker';
  schema: 2;
  fecha: string;
  records: TrainingRecord[];
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  plan?: Plan;
  settings?: Partial<AppSettings>;
}

export const FIELDS: Record<ExType, string[]> = {
  fuerza: ['kg', 'reps', 'rir', 'rest'],
  cardio: ['min', 'ppm', 'rpe'],
  mov: ['min'],
  carry: ['kg', 'dist', 'ppm'],
  circuit: ['vueltas', 'reps', 'ppm', 'rpe'],
};

export const SESSION_ORDER = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const;
export type SessionKey = typeof SESSION_ORDER[number];
