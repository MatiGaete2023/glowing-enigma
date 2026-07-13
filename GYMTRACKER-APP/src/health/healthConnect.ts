import { Capacitor } from '@capacitor/core';
import { upsertSteps, upsertWeight, getAllSteps, getAllWeights } from '../db/database.ts';
import { today } from '../utils.ts';

interface HCPlugin {
  checkAvailability(): Promise<{ available: boolean }>;
  requestPermission(opts: { permissions: string[] }): Promise<{ granted: string[] }>;
  readSteps(opts: { startDate: string; endDate: string }): Promise<{ steps: Array<{ date: string; count: number }> }>;
  readWeight(opts: { startDate: string; endDate: string }): Promise<{ weights: Array<{ date: string; value: number }> }>;
}

function getHCPlugin(): HCPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const plugins = (window as unknown as { Capacitor?: { Plugins?: { HealthConnect?: HCPlugin } } }).Capacitor;
    return plugins?.Plugins?.HealthConnect ?? null;
  } catch {
    return null;
  }
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  const plugin = getHCPlugin();
  if (!plugin) return false;
  try {
    const { available } = await plugin.checkAvailability();
    return available;
  } catch {
    return false;
  }
}

export async function requestHealthConnectPermission(): Promise<boolean> {
  const plugin = getHCPlugin();
  if (!plugin) return false;
  try {
    const { granted } = await plugin.requestPermission({ permissions: ['READ_STEPS', 'READ_WEIGHT'] });
    return granted.includes('READ_STEPS') || granted.includes('READ_WEIGHT');
  } catch {
    return false;
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function syncHealthConnect(): Promise<{ steps: number; weights: number }> {
  const plugin = getHCPlugin();
  if (!plugin) return { steps: 0, weights: 0 };

  const startDate = daysAgo(14);
  const endDate = today();
  let stepsSynced = 0;
  let weightsSynced = 0;

  try {
    const existingSteps = await getAllSteps();
    const manualDates = new Set(existingSteps.filter(s => s.source === 'manual').map(s => s.date));

    const { steps } = await plugin.readSteps({ startDate, endDate });
    for (const entry of steps) {
      if (manualDates.has(entry.date)) continue;
      await upsertSteps({ id: 'st_' + entry.date, date: entry.date, steps: entry.count, source: 'health-connect', updatedAt: Date.now(), _deleted: false });
      stepsSynced++;
    }
  } catch (e) {
    console.warn('HC steps sync failed:', e);
  }

  try {
    const existingWeights = await getAllWeights();
    const manualDates = new Set(existingWeights.filter(w => w.source === 'manual').map(w => w.date));

    const { weights } = await plugin.readWeight({ startDate, endDate });
    for (const entry of weights) {
      if (manualDates.has(entry.date)) continue;
      await upsertWeight({ id: 'w_' + entry.date, date: entry.date, kg: entry.value, source: 'health-connect', updatedAt: Date.now(), _deleted: false });
      weightsSynced++;
    }
  } catch (e) {
    console.warn('HC weight sync failed:', e);
  }

  return { steps: stepsSynced, weights: weightsSynced };
}
