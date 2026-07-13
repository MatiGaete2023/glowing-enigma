import { createRxDatabase, addRxPlugin, type RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import type {
  TrainingRecord, WeightEntry, WaistEntry, StepsEntry, AppSettings,
  LegacyBackupV1, BackupV2, Plan,
} from '../types.ts';

interface GymCollections {
  records: RxCollection;
  weights: RxCollection;
  waist: RxCollection;
  steps: RxCollection;
  settings: RxCollection;
}

addRxPlugin(RxDBQueryBuilderPlugin);

function today(): string { return new Date().toISOString().slice(0, 10); }

const recordSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 32 },
    date: { type: 'string' },
    sessionId: { type: 'string' },
    exNames: { type: 'array', items: { type: 'string' } },
    sets: { type: 'array', items: { type: 'array', items: { type: 'object' } } },
    lumbar: { type: 'number' },
    done: { type: 'boolean' },
    tStart: { type: 'string' },
    tEnd: { type: 'string' },
    tDate: { type: 'string' },
    notes: { type: 'string' },
    updatedAt: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'date', 'sessionId', 'updatedAt'],
} as const;

const weightSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 20 },
    date: { type: 'string' },
    kg: { type: 'number' },
    source: { type: 'string' },
    updatedAt: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'date', 'kg', 'updatedAt'],
} as const;

const waistSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 20 },
    date: { type: 'string' },
    cm: { type: 'number' },
    source: { type: 'string' },
    updatedAt: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'date', 'cm', 'updatedAt'],
} as const;

const stepsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 20 },
    date: { type: 'string' },
    steps: { type: 'number' },
    source: { type: 'string' },
    updatedAt: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'date', 'steps', 'updatedAt'],
} as const;

const settingsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 20 },
    soundEnabled: { type: 'boolean' },
    hcEnabled: { type: 'boolean' },
    onboardingDone: { type: 'boolean' },
    age: { type: 'number' },
    bleDeviceId: { type: 'string' },
    bleDeviceName: { type: 'string' },
    planJson: { type: 'string' },
    updatedAt: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'updatedAt'],
} as const;

type GymDb = Awaited<ReturnType<typeof createRxDatabase>> & GymCollections;

let _db: GymDb | null = null;
let _initPromise: Promise<void> | null = null;

async function doInit(): Promise<void> {
  const db = await createRxDatabase({
    name: 'gymtracker',
    storage: getRxStorageDexie(),
  });
  await db.addCollections({
    records: { schema: recordSchema },
    weights: { schema: weightSchema },
    waist: { schema: waistSchema },
    steps: { schema: stepsSchema },
    settings: { schema: settingsSchema },
  });
  _db = db as unknown as GymDb;
}

// Promesa única: initDb puede llamarse concurrentemente (main + firebase)
export function initDb(): Promise<void> {
  if (!_initPromise) _initPromise = doInit();
  return _initPromise;
}

async function getDb(): Promise<GymDb> {
  await initDb();
  return _db!;
}

export async function getRxDb(): Promise<GymDb> {
  return getDb();
}

// RxDB devuelve documentos inmutables; se clonan para poder mutarlos en la UI
function clone<T>(v: T): T {
  return structuredClone(v);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const doc = await db.settings.findOne('main').exec();
  if (doc) return clone(doc.toJSON() as AppSettings);
  const defaults: AppSettings = {
    id: 'main', soundEnabled: true, hcEnabled: false, updatedAt: Date.now(),
  };
  await db.settings.upsert(defaults);
  return defaults;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const current = await getSettings();
  await db.settings.upsert({ ...current, ...patch, id: 'main', updatedAt: Date.now() });
}

export async function upsertRecord(r: TrainingRecord): Promise<void> {
  const db = await getDb();
  await db.records.upsert({ ...r, updatedAt: Date.now() });
}

export async function upsertWeight(w: WeightEntry): Promise<void> {
  const db = await getDb();
  await db.weights.upsert({ ...w, id: `w_${w.date}`, updatedAt: Date.now() });
}

export async function upsertWaist(w: WaistEntry): Promise<void> {
  const db = await getDb();
  await db.waist.upsert({ ...w, id: `wa_${w.date}`, updatedAt: Date.now() });
}

export async function upsertSteps(s: StepsEntry): Promise<void> {
  const db = await getDb();
  await db.steps.upsert({ ...s, id: `st_${s.date}`, updatedAt: Date.now() });
}

export async function getAllRecords(): Promise<TrainingRecord[]> {
  const db = await getDb();
  const docs = await db.records.find().exec();
  return docs.map((d: { toJSON(): unknown }) => clone(d.toJSON() as TrainingRecord));
}

export async function getAllWeights(): Promise<WeightEntry[]> {
  const db = await getDb();
  const docs = await db.weights.find().exec();
  return docs.map((d: { toJSON(): unknown }) => clone(d.toJSON() as WeightEntry))
    .sort((a: WeightEntry, b: WeightEntry) => a.date.localeCompare(b.date));
}

export async function getAllWaist(): Promise<WaistEntry[]> {
  const db = await getDb();
  const docs = await db.waist.find().exec();
  return docs.map((d: { toJSON(): unknown }) => clone(d.toJSON() as WaistEntry))
    .sort((a: WaistEntry, b: WaistEntry) => a.date.localeCompare(b.date));
}

export async function getAllSteps(): Promise<StepsEntry[]> {
  const db = await getDb();
  const docs = await db.steps.find().exec();
  return docs.map((d: { toJSON(): unknown }) => clone(d.toJSON() as StepsEntry))
    .sort((a: StepsEntry, b: StepsEntry) => a.date.localeCompare(b.date));
}

export async function isDbEmpty(): Promise<boolean> {
  const db = await getDb();
  const count = await db.records.count().exec();
  return count === 0;
}

export async function importLegacyBackupV1(data: LegacyBackupV1): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  for (const [key, r] of Object.entries(data.records ?? {})) {
    const parts = key.match(/^q(\d+)_(.+)$/);
    const sessionId = parts ? parts[2] : key;

    const legacySets: Record<number, Array<Record<string, unknown>>> = (r.exercises as Record<number, Array<Record<string, unknown>>>) ?? {};
    const sets: TrainingRecord['sets'] = Object.values(legacySets).map(arr =>
      (arr ?? []).map(s => ({
        kg: typeof s.kg === 'number' ? s.kg : undefined,
        reps: typeof s.reps === 'number' ? s.reps : undefined,
        rir: typeof s.rir === 'number' ? s.rir : undefined,
        rest: typeof s.rest === 'number' ? s.rest : undefined,
        ppm: typeof s.ppm === 'number' ? s.ppm : undefined,
        min: typeof s.min === 'number' ? s.min : undefined,
        dist: typeof s.dist === 'number' ? s.dist : undefined,
        vueltas: typeof s.vueltas === 'number' ? s.vueltas : undefined,
        rpe: typeof s.rpe === 'number' ? s.rpe : undefined,
        done: typeof s.done === 'boolean' ? s.done : false,
      }))
    );

    await db.records.upsert({
      id: key,
      date: r.date ?? today(),
      sessionId,
      exNames: r.exNames ?? [],
      sets,
      lumbar: typeof r.lumbar === 'number' ? r.lumbar : -1,
      done: r.status === 'done' || r.done === true,
      tStart: r.start ?? '',
      tEnd: r.end ?? '',
      tDate: r.date ?? today(),
      notes: r.notes ?? '',
      updatedAt: now,
      _deleted: false,
    });
  }

  for (const w of data.weights ?? []) {
    await db.weights.upsert({ id: `w_${w.date}`, date: w.date, kg: w.kg, source: 'manual', updatedAt: now, _deleted: false });
  }
  for (const wa of data.waist ?? []) {
    await db.waist.upsert({ id: `wa_${wa.date}`, date: wa.date, cm: wa.cm, source: 'manual', updatedAt: now, _deleted: false });
  }
  for (const st of data.steps ?? []) {
    await db.steps.upsert({ id: `st_${st.date}`, date: st.date, steps: st.steps, source: 'manual', updatedAt: now, _deleted: false });
  }
}

export async function importBackupV2(data: BackupV2): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  for (const r of data.records ?? []) { await db.records.upsert({ ...r, updatedAt: now }); }
  for (const w of data.weights ?? []) { await db.weights.upsert({ ...w, updatedAt: now }); }
  for (const wa of data.waist ?? []) { await db.waist.upsert({ ...wa, updatedAt: now }); }
  for (const st of data.steps ?? []) { await db.steps.upsert({ ...st, updatedAt: now }); }
  if (data.settings) await saveSettings(data.settings);
}

export async function exportBackupV2(plan: Plan | null): Promise<BackupV2> {
  const [records, weights, waist, steps] = await Promise.all([
    getAllRecords(), getAllWeights(), getAllWaist(), getAllSteps(),
  ]);
  return {
    app: 'gym-tracker', schema: 2, fecha: today(),
    records, weights, waist, steps,
    plan: plan ?? undefined,
  };
}
