import './style.css';
import { DEFAULT_PLAN } from './plan/default.ts';
import type { Plan, Session, TrainingRecord, SetRow, WeightEntry, WaistEntry, StepsEntry, AppSettings } from './types.ts';
import { FIELDS, SESSION_ORDER } from './types.ts';
import {
  computeWeekDeltaByDate, computeNeatBaseline, validPlan,
  hasData, generateCsv, downloadBlob
} from './utils.ts';
import {
  initDb, getSettings, saveSettings,
  upsertRecord, upsertWeight, upsertWaist, upsertSteps,
  getAllRecords, getAllWeights, getAllWaist, getAllSteps,
  isDbEmpty, importLegacyBackupV1, importBackupV2, exportBackupV2
} from './db/database.ts';
import { initFirebaseSync, onSyncStatus } from './db/firebase.ts';
import { initAudioOnGesture, playTimerDone, playPip } from './audio.ts';
import { connectHR, disconnectHR, onHeartRate, isHRConnected, hrZoneClass, getCurrentPpm } from './health/heartRate.ts';
import { isHealthConnectAvailable, requestHealthConnectPermission, syncHealthConnect } from './health/healthConnect.ts';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

// ── Global state ────────────────────────────────────────────────────────────

let PLAN: Plan = DEFAULT_PLAN;
let currentQ = 1;
let activeKey: string | null = null;
let settings: AppSettings = { id: 'main', soundEnabled: true, hcEnabled: false, updatedAt: 0 };
let weightRange = 30; // days; 0 = all
let wakeLock: WakeLockSentinel | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerSecs = 0;
let timerTotal = 0;
let timerNotifId = 0;
let hrUnsubscribe: (() => void) | null = null;

// ── DOM helpers ──────────────────────────────────────────────────────────────

const $  = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const $$ = (sel: string, parent: ParentNode = document) => Array.from(parent.querySelectorAll(sel));

function showView(id: 'dash' | 'session' | 'hist' | 'settings'): void {
  $$('.view').forEach(v => v.classList.add('hide'));
  $(`#view${id.charAt(0).toUpperCase() + id.slice(1)}`).classList.remove('hide');
  const tabs = $<HTMLElement>('#tabs');
  if (id === 'session') { tabs.classList.remove('show'); tabs.classList.add('hide'); }
  else { tabs.classList.add('show'); tabs.classList.remove('hide'); }
  $$('.tab').forEach(t => (t as HTMLElement).classList.toggle('on', (t as HTMLElement).dataset.tab === (id === 'session' ? '' : id === 'hist' ? 'hist' : id === 'settings' ? 'settings' : 'dash')));
}

function toast(msg: string, ms = 2500): void {
  const el = $<HTMLDivElement>('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ── Wake Lock ────────────────────────────────────────────────────────────────

async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen'); }
  catch { /* denied — ok */ }
}

function releaseWakeLock(): void {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ── Rest Timer ───────────────────────────────────────────────────────────────

function startRestTimer(secs: number): void {
  stopTimer();
  timerSecs = secs;
  timerTotal = secs;
  timerNotifId = Date.now() % 100000;
  const chip = $<HTMLElement>('#timerChip');
  chip.classList.remove('hide');
  updateTimerUI();

  if (Capacitor.isNativePlatform()) {
    LocalNotifications.schedule({
      notifications: [{
        id: timerNotifId,
        title: 'Descanso terminado',
        body: 'Hora de la siguiente serie',
        schedule: { at: new Date(Date.now() + secs * 1000) }
      }]
    }).catch(() => {});
  }

  timerInterval = setInterval(() => {
    timerSecs--;
    if (timerSecs <= 0) {
      stopTimer(true);
      return;
    }
    updateTimerUI();
  }, 1000);
}

function stopTimer(done = false): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const chip = $<HTMLElement>('#timerChip');
  chip.classList.add('hide');
  if (done) {
    if (settings.soundEnabled) playTimerDone();
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    if (Capacitor.isNativePlatform()) LocalNotifications.cancel({ notifications: [{ id: timerNotifId }] }).catch(() => {});
  }
}

function updateTimerUI(): void {
  const m = Math.floor(timerSecs / 60);
  const s = String(timerSecs % 60).padStart(2, '0');
  $<HTMLElement>('#timerDisplay').textContent = `${m}:${s}`;
  $<HTMLElement>('#timerRingText').textContent = `${m}:${s}`;
  const pct = timerTotal > 0 ? timerSecs / timerTotal : 0;
  const offset = 100 - pct * 100;
  const ring = $<SVGCircleElement>('#timerRingFill');
  ring.style.strokeDashoffset = String(offset);
  ring.style.stroke = timerSecs <= 10 ? 'var(--amber)' : 'var(--teal)';
}

// ── Dashboard ────────────────────────────────────────────────────────────────

async function renderDash(): Promise<void> {
  const phase = PLAN.phases.find(p => p.qs.includes(currentQ));
  const qLabel = `Q${currentQ}`;
  $<HTMLElement>('#qLabel').textContent = qLabel;
  $<HTMLElement>('#dashTitle').textContent = `Quincena ${currentQ}`;
  $<HTMLElement>('#dashSub').textContent = phase ? `${phase.name} · RIR ${phase.rir}` : '';
  $<HTMLElement>('#phaseName').textContent = phase ? `— ${phase.name} —` : '— sesiones de la quincena —';

  const sessions = PLAN.sessions;
  const track = $<HTMLElement>('#track');
  const allRecords = await getAllRecords();
  const qRecs = allRecords.filter(r => r.id.startsWith(`q${currentQ}_`));

  // Count done sessions this fortnight
  const doneKeys = new Set(qRecs.filter(r => r.done).map(r => r.id));
  const total = sessions.length;
  const done = SESSION_ORDER.filter(sk => doneKeys.has(`q${currentQ}_${sk}`)).length;

  $<HTMLElement>('#pCount').textContent = `${done}/${total}`;
  $<HTMLElement>('#pFill').style.width = `${total ? (done / total) * 100 : 0}%`;
  $<HTMLElement>('#stDone').innerHTML = `${done}<small>/${total}</small>`;

  // Build session track nodes
  track.innerHTML = '';
  for (const sk of SESSION_ORDER) {
    const s = sessions.find(sx => sx.id === sk);
    if (!s) continue;
    const rec = qRecs.find(r => r.id === `q${currentQ}_${sk}`);
    const isDone = rec?.done;
    const btn = document.createElement('button');
    btn.className = `snode${isDone ? ' done' : ''}`;
    btn.dataset.sk = sk;
    btn.innerHTML = `<span class="sn-label">${sk}</span><span class="sn-name">${s.name.split(' ')[0]}</span>`;
    btn.addEventListener('click', () => openSession(sk));
    track.appendChild(btn);
  }

  // Weight stats
  const weights = await getAllWeights();
  const lastW = weights.sort((a, b) => b.date.localeCompare(a.date))[0];
  $<HTMLElement>('#stWeight').innerHTML = lastW ? `${lastW.kg}<small>kg</small>` : `—<small>kg</small>`;
  await renderWeights(weights);

  // Steps
  const steps = await getAllSteps();
  await renderSteps(steps);
}

// ── Weight chart & list ──────────────────────────────────────────────────────

async function renderWeights(weights: WeightEntry[]): Promise<void> {
  const now = new Date();
  const filtered = weightRange === 0 ? weights : weights.filter(w => {
    const d = new Date(w.date);
    return (now.getTime() - d.getTime()) / 86400000 <= weightRange;
  });
  const sorted = filtered.sort((a, b) => a.date.localeCompare(b.date));

  // Sparkline
  const spark = $<SVGSVGElement>('#spark');
  spark.innerHTML = '';
  if (sorted.length > 1) {
    const vals = sorted.map(w => w.kg);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const range = mx - mn || 1;
    const dates = sorted.map(w => new Date(w.date).getTime());
    const tMin = dates[0], tMax = dates[dates.length - 1], tRange = tMax - tMin || 1;
    const pts = sorted.map((w, i) => {
      const x = ((dates[i] - tMin) / tRange) * 318 + 1;
      const y = 58 - ((w.kg - mn) / range) * 56;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'var(--teal)');
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-linejoin', 'round');
    spark.appendChild(poly);
    $<HTMLElement>('#sparkMinMax').textContent = `${mn.toFixed(1)} – ${mx.toFixed(1)} kg`;
  }

  // Trend
  const delta = computeWeekDeltaByDate(weights);
  const trendEl = $<HTMLElement>('#wTrend');
  if (delta !== null) {
    const sign = delta > 0 ? '+' : '';
    trendEl.textContent = `Tendencia: ${sign}${delta.toFixed(2)} kg/semana`;
    trendEl.className = `wtrend ${delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`;
  } else {
    trendEl.textContent = 'Tendencia: sin datos suficientes';
    trendEl.className = 'wtrend';
  }

  // Waist
  const waistList = await getAllWaist();
  const lastWaist = waistList.sort((a, b) => b.date.localeCompare(a.date))[0];
  $<HTMLElement>('#lastWaist').textContent = lastWaist ? `Cintura: ${lastWaist.cm} cm (${lastWaist.date})` : '';

  // List
  const wListEl = $<HTMLElement>('#wList');
  const recent = sorted.slice(-10).reverse();
  wListEl.innerHTML = recent.map(w =>
    `<div class="wrow"><span>${w.date}</span><span>${w.kg} kg</span></div>`
  ).join('');
}

// ── Steps / NEAT ─────────────────────────────────────────────────────────────

async function renderSteps(steps: StepsEntry[]): Promise<void> {
  const sorted = steps.sort((a, b) => a.date.localeCompare(b.date));
  const neat = computeNeatBaseline(steps);
  const target = neat?.target ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = steps.find(s => s.date === today);
  const todaySteps = todayEntry?.steps ?? 0;

  const targetEl = $<HTMLElement>('#stepTarget');
  if (!neat) {
    targetEl.textContent = 'Sem 1: mide tu baseline';
  } else {
    targetEl.textContent = `Objetivo: ${target.toLocaleString()} pasos/día`;
  }

  const bar = $<HTMLElement>('#stepBar');
  bar.style.width = target > 0 ? `${Math.min(100, (todaySteps / target) * 100)}%` : '0%';

  // HC banner
  const hcAvail = await isHealthConnectAvailable();
  const hcBanner = $<HTMLElement>('#hcBanner');
  if (hcAvail && settings.hcEnabled) hcBanner.classList.remove('hide');
  else hcBanner.classList.add('hide');

  const listEl = $<HTMLElement>('#stepList');
  const recent = sorted.slice(-7).reverse();
  listEl.innerHTML = recent.map(s => {
    const pct = target > 0 ? Math.min(100, Math.round((s.steps / target) * 100)) : 0;
    return `<div class="wrow"><span>${s.date}</span><span>${s.steps.toLocaleString()} <small>${pct}%</small></span></div>`;
  }).join('') || '<div class="muted empty-state">Sin registros de pasos aún</div>';
}

// ── Open Session ──────────────────────────────────────────────────────────────

async function openSession(sk: string): Promise<void> {
  const sx = PLAN.sessions.find(s => s.id === sk);
  if (!sx) return;

  activeKey = `q${currentQ}_${sk}`;
  const allRecs = await getAllRecords();
  let rec = allRecs.find(r => r.id === activeKey);

  if (!rec) {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    rec = {
      id: activeKey,
      date: now.toISOString().slice(0, 10),
      sessionId: sk,
      exNames: sx.ex.map(e => e.n),
      sets: sx.ex.map(e => Array.from({ length: e.sets ?? 3 }, () => ({} as SetRow))),
      lumbar: -1, done: false, tStart: '', tEnd: '', tDate: now.toISOString().slice(0, 10),
      notes: '', updatedAt: Date.now(), _deleted: false
    };
  }

  showView('session');
  $<HTMLElement>('#svTitle').textContent = sx.name;
  $<HTMLElement>('#svBadge').textContent = sx.id.toUpperCase();
  $<HTMLElement>('#svFocus').textContent = sx.focus ?? '';

  // Time fields
  $<HTMLInputElement>('#tStart').value = rec.tStart || '';
  $<HTMLInputElement>('#tEnd').value = rec.tEnd || '';
  $<HTMLInputElement>('#tDate').value = rec.tDate || new Date().toISOString().slice(0, 10);

  renderLumbar(rec);
  await buildExercises(sx, rec);

  $<HTMLTextAreaElement>('#svNotes').value = rec.notes || '';

  updateCta(rec);
  updateElapsed(rec);

  // HR buttons
  const hrConnectBtn = $<HTMLElement>('#hrConnectBtn');
  const hrDisconnectBtn = $<HTMLElement>('#hrDisconnectBtn');
  hrConnectBtn.classList.remove('hide');
  if (isHRConnected()) {
    hrConnectBtn.classList.add('hide');
    hrDisconnectBtn.classList.remove('hide');
  }

  acquireWakeLock();
}

// ── Build exercises ───────────────────────────────────────────────────────────

async function buildExercises(sx: Session, rec: TrainingRecord): Promise<void> {
  const allRecs = await getAllRecords();
  const exListEl = $<HTMLElement>('#exList');
  exListEl.innerHTML = '';

  // Warmup block
  if (sx.warmup) {
    const wdiv = document.createElement('div');
    wdiv.className = 'warmup-block';
    wdiv.innerHTML = `<div class="ex-label">Calentamiento</div><div class="warmup-text">${sx.warmup}</div>`;
    exListEl.appendChild(wdiv);
  }

  for (let ei = 0; ei < sx.ex.length; ei++) {
    const ex = sx.ex[ei];
    const exName = rec.exNames?.[ei] ?? ex.n;

    // Find last done record for this exercise by name
    const lastRec = allRecs
      .filter(r => r.id !== rec.id && r.exNames?.includes(exName) && r.done)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    let lastInfo = '';
    if (lastRec) {
      const lastEi = lastRec.exNames?.indexOf(exName) ?? -1;
      if (lastEi >= 0 && lastRec.sets?.[lastEi]) {
        const lastSets = lastRec.sets[lastEi].filter(s => s.kg || s.reps || s.min);
        if (lastSets.length > 0) {
          lastInfo = lastSets.map(s => {
            if (ex.t === 'cardio') return `${s.min ?? ''}min@${s.ppm ?? ''}ppm`;
            return `${s.kg ?? '?'}kg×${s.reps ?? '?'}`;
          }).join(', ');
          lastInfo = `Última vez: ${lastInfo}`;
        }
      }
    }

    const flds = FIELDS[ex.t] ?? ['kg', 'reps', 'rir', 'rest'];
    const setsArr: SetRow[] = rec.sets?.[ei] ?? Array.from({ length: ex.sets ?? 3 }, () => ({} as SetRow));
    while (rec.sets && rec.sets[ei] && rec.sets[ei].length < (ex.sets ?? 3)) {
      rec.sets[ei].push({} as SetRow);
    }

    const exDiv = document.createElement('div');
    exDiv.className = 'ex-block';
    exDiv.dataset.ei = String(ei);

    const tgtText = ex.tgt ? `<div class="ex-tgt">${ex.tgt}</div>` : '';
    const lastText = lastInfo ? `<div class="ex-last">${lastInfo}</div>` : '';
    const restBtn = ex.rest ? `<button class="rest-timer-btn" data-secs="${ex.rest}">⏱ ${Math.floor(ex.rest/60)}:${String(ex.rest%60).padStart(2,'0')}</button>` : '';

    exDiv.innerHTML = `
      <div class="ex-header">
        <div class="ex-name">${exName}</div>
        ${restBtn}
      </div>
      ${tgtText}
      ${lastText}
      <div class="set-rows" data-ei="${ei}"></div>
    `;

    const rowsWrap = exDiv.querySelector<HTMLElement>('.set-rows')!;
    renderRows(rowsWrap, rec, ei, flds);

    exDiv.querySelector('.rest-timer-btn')?.addEventListener('click', (e) => {
      const secs = parseInt((e.currentTarget as HTMLElement).dataset.secs ?? '90', 10);
      startRestTimer(secs);
      if (settings.soundEnabled) playPip();
    });

    exListEl.appendChild(exDiv);
  }
}

// ── Render set rows ───────────────────────────────────────────────────────────

function renderRows(wrap: HTMLElement, rec: TrainingRecord, ei: number, flds: string[]): void {
  wrap.innerHTML = '';
  const setsArr = rec.sets?.[ei] ?? [];
  for (let si = 0; si < setsArr.length; si++) {
    const row = setsArr[si];
    const rowDiv = document.createElement('div');
    rowDiv.className = `set-row${row.done ? ' done' : ''}`;
    rowDiv.dataset.si = String(si);

    let html = `<span class="si" title="Marcar hecha">${si + 1}</span>`;

    for (const f of flds) {
      const v = (row as Record<string, unknown>)[f];
      const label = f === 'kg' ? 'kg' : f === 'reps' ? 'reps' : f === 'rir' ? 'RIR' : f === 'rest' ? 's' :
                    f === 'ppm' ? 'ppm' : f === 'min' ? 'min' : f === 'dist' ? 'km' : f === 'vueltas' ? 'vlts' : f === 'rpe' ? 'RPE' : f;
      const type = (f === 'kg' || f === 'reps' || f === 'rir' || f === 'rest' || f === 'ppm' || f === 'min' || f === 'rpe' || f === 'vueltas') ? 'number' : 'text';
      const step = f === 'kg' ? '0.5' : '1';
      const mode = (f === 'kg') ? 'decimal' : 'numeric';
      html += `<label class="sf"><span class="sl">${label}</span><input class="sv" type="${type}" inputmode="${mode}" step="${step}" data-f="${f}" data-ei="${ei}" data-si="${si}" value="${v ?? ''}"></label>`;
    }

    // PPM suggestion from HR
    if (flds.includes('ppm') && isHRConnected()) {
      const age = settings.age ?? 35;
      const cls = hrZoneClass(0, age);
      html += `<button class="ppm-suggest" data-ei="${ei}" data-si="${si}" title="Usar PPM actual">❤</button>`;
    }

    html += `<button class="rm-set" data-ei="${ei}" data-si="${si}" title="Eliminar serie">✕</button>`;
    rowDiv.innerHTML = html;
    wrap.appendChild(rowDiv);

    // Toggle done on row number tap
    rowDiv.querySelector<HTMLElement>('.si')!.addEventListener('click', async () => {
      if (!rec.sets?.[ei]) return;
      rec.sets[ei][si].done = !rec.sets[ei][si].done;
      rowDiv.classList.toggle('done', !!rec.sets[ei][si].done);
      if (Capacitor.isNativePlatform() && rec.sets[ei][si].done) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      await commit(rec);
    });

    // Input changes
    rowDiv.querySelectorAll<HTMLInputElement>('.sv').forEach(inp => {
      inp.addEventListener('change', async () => {
        const f = inp.dataset.f!;
        const eiN = parseInt(inp.dataset.ei!);
        const siN = parseInt(inp.dataset.si!);
        if (!rec.sets?.[eiN]) return;
        const val = inp.value === '' ? undefined : (inp.type === 'number' ? parseFloat(inp.value) : inp.value);
        (rec.sets[eiN][siN] as Record<string, unknown>)[f] = val;
        await commit(rec);
      });
    });

    // PPM autofill
    rowDiv.querySelector<HTMLButtonElement>('.ppm-suggest')?.addEventListener('click', async () => {
      const ppm = getCurrentPpm();
      if (!ppm || !rec.sets?.[ei]) return;
      rec.sets[ei][si].ppm = ppm;
      const inp = rowDiv.querySelector<HTMLInputElement>('[data-f="ppm"]');
      if (inp) inp.value = String(ppm);
      await commit(rec);
    });

    // Remove set
    rowDiv.querySelector<HTMLButtonElement>('.rm-set')?.addEventListener('click', async () => {
      if (!rec.sets?.[ei]) return;
      rec.sets[ei].splice(si, 1);
      const sx = PLAN.sessions.find(s => s.id === rec.sessionId);
      const flds2 = sx ? (FIELDS[sx.ex[ei].t] ?? ['kg','reps','rir','rest']) : ['kg','reps','rir','rest'];
      renderRows(wrap, rec, ei, flds2);
      await commit(rec);
    });
  }

  // Add set button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-set-btn';
  addBtn.textContent = '+ serie';
  addBtn.addEventListener('click', async () => {
    if (!rec.sets?.[ei]) rec.sets = rec.sets ?? [];
    rec.sets[ei] = rec.sets[ei] ?? [];
    rec.sets[ei].push({} as SetRow);
    const sx = PLAN.sessions.find(s => s.id === rec.sessionId);
    const flds2 = sx ? (FIELDS[sx.ex[ei].t] ?? ['kg','reps','rir','rest']) : ['kg','reps','rir','rest'];
    renderRows(wrap, rec, ei, flds2);
    await commit(rec);
  });
  wrap.appendChild(addBtn);
}

// ── Commit record ─────────────────────────────────────────────────────────────

async function commit(rec: TrainingRecord): Promise<void> {
  rec.updatedAt = Date.now();
  await upsertRecord(rec);
}

// ── CTA button ────────────────────────────────────────────────────────────────

function updateCta(rec: TrainingRecord): void {
  const btn = $<HTMLButtonElement>('#ctaBtn');
  if (rec.done) {
    btn.textContent = 'Sesión completada ✓';
    btn.className = 'btn-done';
  } else if (rec.tStart) {
    btn.textContent = 'Finalizar sesión';
    btn.className = 'btn-finish';
  } else {
    btn.textContent = 'Iniciar sesión';
    btn.className = 'btn-start';
  }
}

// ── Elapsed ───────────────────────────────────────────────────────────────────

function updateElapsed(rec: TrainingRecord): void {
  const el = $<HTMLElement>('#elapsed');
  if (!rec.tStart || !rec.tDate) { el.textContent = ''; return; }
  const [sh, sm] = rec.tStart.split(':').map(Number);
  const baseDate = rec.tDate;
  const start = new Date(`${baseDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`);
  const end = rec.tEnd ? (() => {
    const [eh, em] = rec.tEnd.split(':').map(Number);
    return new Date(`${baseDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`);
  })() : new Date();
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  const sx = PLAN.sessions.find(s => s.id === rec.sessionId);
  const durObj = sx?.dur ? `Obj: ${sx.dur} min` : '';
  el.textContent = `${mins} min${durObj ? ` · ${durObj}` : ''}`;
}

// ── Lumbar ────────────────────────────────────────────────────────────────────

function renderLumbar(rec: TrainingRecord): void {
  const govEl = $<HTMLElement>('#lgov');
  $$('.lbtn').forEach(btn => {
    const lvl = parseInt((btn as HTMLElement).dataset.l ?? '0');
    (btn as HTMLElement).classList.toggle('on', rec.lumbar === lvl);
  });
  if (rec.lumbar === 0) govEl.textContent = '✓ Sin restricciones';
  else if (rec.lumbar === 2) govEl.textContent = '⚠ Modificar ejercicios lumbares';
  else if (rec.lumbar === 4) govEl.textContent = '⛔ Detener ejercicios de carga lumbar';
  else govEl.textContent = '';
}

// ── Session Summary ───────────────────────────────────────────────────────────

async function showSessionSummary(rec: TrainingRecord, sx: Session): Promise<void> {
  const summaryEl = $<HTMLElement>('#sessionSummary');
  summaryEl.classList.remove('hide');

  // Duration
  let durationText = '';
  if (rec.tStart && rec.tEnd && rec.tDate) {
    const [sh, sm] = rec.tStart.split(':').map(Number);
    const [eh, em] = rec.tEnd.split(':').map(Number);
    const startMs = new Date(`${rec.tDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`).getTime();
    const endMs = new Date(`${rec.tDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`).getTime();
    const mins = Math.round((endMs - startMs) / 60000);
    durationText = `Duración: ${mins} min${sx.dur ? ` (obj ${sx.dur} min)` : ''}`;
  }

  // Volume
  let totalVol = 0;
  const exDetails: string[] = [];

  const allRecs = await getAllRecords();

  for (let ei = 0; ei < (sx.ex.length); ei++) {
    const ex = sx.ex[ei];
    const exName = rec.exNames?.[ei] ?? ex.n;
    const sets = rec.sets?.[ei] ?? [];

    let vol = 0;
    for (const s of sets) {
      if (s.kg && s.reps) vol += s.kg * s.reps;
    }
    totalVol += vol;

    // Delta vs last
    const lastRec = allRecs
      .filter(r => r.id !== rec.id && r.exNames?.includes(exName) && r.done)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    let lastVol = 0;
    if (lastRec) {
      const lastEi = lastRec.exNames?.indexOf(exName) ?? -1;
      if (lastEi >= 0) {
        for (const s of (lastRec.sets?.[lastEi] ?? [])) {
          if (s.kg && s.reps) lastVol += s.kg * s.reps;
        }
      }
    }

    if (vol > 0 || lastVol > 0) {
      const delta = vol - lastVol;
      const sign = delta > 0 ? '+' : '';
      exDetails.push(`<div class="delta-row"><span>${exName}</span><span>${vol.toFixed(0)} kg·rep ${lastVol > 0 ? `<small class="${delta >= 0 ? 'up' : 'down'}">${sign}${delta.toFixed(0)}</small>` : ''}</span></div>`);
    }
  }

  summaryEl.innerHTML = `
    <div class="session-summary">
      <h3>Resumen de sesión</h3>
      ${durationText ? `<div class="summary-row">${durationText}</div>` : ''}
      <div class="summary-row">Volumen total: <strong>${totalVol.toFixed(0)} kg·rep</strong></div>
      ${exDetails.length > 0 ? `<div class="delta-section">${exDetails.join('')}</div>` : ''}
    </div>
  `;
}

// ── History ───────────────────────────────────────────────────────────────────

async function renderHist(): Promise<void> {
  const allRecs = await getAllRecords();
  const done = allRecs.filter(r => r.done).sort((a, b) => b.date.localeCompare(a.date));
  $<HTMLElement>('#histCount').textContent = `${done.length} sesiones completadas`;

  const listEl = $<HTMLElement>('#histList');
  if (done.length === 0) {
    listEl.innerHTML = '<div class="muted empty-state">Sin sesiones completadas aún</div>';
    return;
  }

  listEl.innerHTML = done.map(r => {
    const sx = PLAN.sessions.find(s => s.id === r.sessionId);
    const name = sx?.name ?? r.sessionId;
    return `<div class="hist-item" data-id="${r.id}">
      <div class="hi-name">${name}</div>
      <div class="hi-meta">${r.date} · ${r.id}</div>
    </div>`;
  }).join('');

  listEl.querySelectorAll<HTMLElement>('.hist-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id!;
      const parts = id.match(/^q(\d+)_(.+)$/);
      if (parts) {
        currentQ = parseInt(parts[1]);
        openSession(parts[2]);
      }
    });
  });

  const weights = await getAllWeights();
  const planVerEl = $<HTMLElement>('#planVer');
  planVerEl.textContent = `Plan: ${PLAN.meta.version} · ${PLAN.meta.name}`;
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function renderSettings(): Promise<void> {
  // Sound toggle
  const soundToggle = $<HTMLElement>('#soundToggle');
  soundToggle.classList.toggle('on', !!settings.soundEnabled);
  soundToggle.setAttribute('aria-checked', String(!!settings.soundEnabled));

  // HC toggle
  const hcToggle = $<HTMLElement>('#hcToggle');
  hcToggle.classList.toggle('on', !!settings.hcEnabled);
  hcToggle.setAttribute('aria-checked', String(!!settings.hcEnabled));

  // Age
  $<HTMLInputElement>('#ageInput').value = settings.age ? String(settings.age) : '';

  // BLE device
  $<HTMLElement>('#bleDeviceName').textContent = settings.bleDeviceName || 'Sin dispositivo guardado';

  // UID display
  const uid = (window as unknown as { __gymUid?: string }).__gymUid;
  $<HTMLElement>('#uidDisplay').textContent = uid ? `UID: ${uid}` : '';
}

// ── Wire events ───────────────────────────────────────────────────────────────

function wireEvents(): void {
  // Tab bar
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => {
      const tab = (t as HTMLElement).dataset.tab!;
      if (tab === 'dash') { renderDash(); showView('dash'); }
      else if (tab === 'hist') { renderHist(); showView('hist'); }
      else if (tab === 'settings') { renderSettings(); showView('settings'); }
    });
  });

  // Q nav
  $<HTMLButtonElement>('#qDown').addEventListener('click', () => {
    if (currentQ > 1) { currentQ--; renderDash(); }
  });
  $<HTMLButtonElement>('#qUp').addEventListener('click', () => {
    const maxQ = Math.max(...PLAN.phases.flatMap(p => p.qs));
    if (currentQ < maxQ) { currentQ++; renderDash(); }
  });

  // Chart range
  $$('.chart-range button').forEach(btn => {
    btn.addEventListener('click', async () => {
      weightRange = parseInt((btn as HTMLElement).dataset.range ?? '30');
      $$('.chart-range button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const weights = await getAllWeights();
      renderWeights(weights);
    });
  });

  // Weight save
  $<HTMLButtonElement>('#wSave').addEventListener('click', async () => {
    const v = parseFloat($<HTMLInputElement>('#wInput').value);
    if (isNaN(v)) return;
    const d = new Date().toISOString().slice(0, 10);
    await upsertWeight({ id: `w_${d}`, date: d, kg: v, source: 'manual', updatedAt: Date.now(), _deleted: false });
    $<HTMLInputElement>('#wInput').value = '';
    const weights = await getAllWeights();
    const lastW = weights.sort((a, b) => b.date.localeCompare(a.date))[0];
    $<HTMLElement>('#stWeight').innerHTML = lastW ? `${lastW.kg}<small>kg</small>` : `—<small>kg</small>`;
    await renderWeights(weights);
    toast('Peso guardado');
  });

  // Waist save
  $<HTMLButtonElement>('#waistSave').addEventListener('click', async () => {
    const v = parseFloat($<HTMLInputElement>('#waistInput').value);
    if (isNaN(v)) return;
    const d = new Date().toISOString().slice(0, 10);
    await upsertWaist({ id: `wa_${d}`, date: d, cm: v, source: 'manual', updatedAt: Date.now(), _deleted: false });
    $<HTMLInputElement>('#waistInput').value = '';
    const weights = await getAllWeights();
    await renderWeights(weights);
    toast('Cintura guardada');
  });

  // Steps save
  $<HTMLButtonElement>('#stepsSave').addEventListener('click', async () => {
    const v = parseInt($<HTMLInputElement>('#stepsInput').value);
    if (isNaN(v)) return;
    const d = new Date().toISOString().slice(0, 10);
    await upsertSteps({ id: `st_${d}`, date: d, steps: v, source: 'manual', updatedAt: Date.now(), _deleted: false });
    $<HTMLInputElement>('#stepsInput').value = '';
    const steps = await getAllSteps();
    await renderSteps(steps);
    toast('Pasos guardados');
  });

  // HC sync button
  $<HTMLButtonElement>('#hcSyncBtn').addEventListener('click', async () => {
    toast('Sincronizando Health Connect...');
    const r = await syncHealthConnect();
    toast(`HC: ${r.steps} pasos, ${r.weights} pesos`);
    const steps = await getAllSteps();
    await renderSteps(steps);
  });

  // Back from session
  $<HTMLButtonElement>('#svBack').addEventListener('click', () => {
    stopTimer();
    releaseWakeLock();
    if (hrUnsubscribe) { hrUnsubscribe(); hrUnsubscribe = null; }
    $<HTMLElement>('#sessionSummary').classList.add('hide');
    renderDash();
    showView('dash');
  });

  // CTA (start/finish session)
  $<HTMLButtonElement>('#ctaBtn').addEventListener('click', async () => {
    if (!activeKey) return;
    const allRecs = await getAllRecords();
    const rec = allRecs.find(r => r.id === activeKey);
    if (!rec) return;

    if (rec.done) {
      // Reopen
      rec.done = false;
      rec.tEnd = '';
      await commit(rec);
      updateCta(rec);
      $<HTMLElement>('#sessionSummary').classList.add('hide');
      return;
    }

    if (!rec.tStart) {
      // Start
      const now = new Date();
      rec.tStart = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      rec.tDate = now.toISOString().slice(0, 10);
      $<HTMLInputElement>('#tStart').value = rec.tStart;
      $<HTMLInputElement>('#tDate').value = rec.tDate;
      await commit(rec);
      updateCta(rec);
      return;
    }

    // Finish
    const now = new Date();
    rec.tEnd = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    $<HTMLInputElement>('#tEnd').value = rec.tEnd;
    rec.done = true;
    rec.notes = $<HTMLTextAreaElement>('#svNotes').value;
    await commit(rec);
    updateCta(rec);
    updateElapsed(rec);
    stopTimer();
    releaseWakeLock();
    const sx = PLAN.sessions.find(s => s.id === rec.sessionId)!;
    await showSessionSummary(rec, sx);
  });

  // Lumbar buttons
  $$('.lbtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!activeKey) return;
      const allRecs = await getAllRecords();
      const rec = allRecs.find(r => r.id === activeKey);
      if (!rec) return;
      const lvl = parseInt((btn as HTMLElement).dataset.l ?? '0');
      rec.lumbar = lvl;
      renderLumbar(rec);
      await commit(rec);
    });
  });

  // Time inputs
  ['tStart', 'tEnd', 'tDate'].forEach(id => {
    $<HTMLInputElement>(`#${id}`).addEventListener('change', async () => {
      if (!activeKey) return;
      const allRecs = await getAllRecords();
      const rec = allRecs.find(r => r.id === activeKey);
      if (!rec) return;
      (rec as unknown as Record<string, unknown>)[id === 'tDate' ? 'tDate' : id] = ($<HTMLInputElement>(`#${id}`)).value;
      updateElapsed(rec);
      await commit(rec);
    });
  });

  // Notes
  $<HTMLTextAreaElement>('#svNotes').addEventListener('change', async () => {
    if (!activeKey) return;
    const allRecs = await getAllRecords();
    const rec = allRecs.find(r => r.id === activeKey);
    if (!rec) return;
    rec.notes = $<HTMLTextAreaElement>('#svNotes').value;
    await commit(rec);
  });

  // Timer cancel
  $<HTMLButtonElement>('#timerCancelBtn').addEventListener('click', () => stopTimer());

  // HR connect/disconnect
  $<HTMLButtonElement>('#hrConnectBtn').addEventListener('click', async () => {
    try {
      await connectHR();
      $<HTMLElement>('#hrConnectBtn').classList.add('hide');
      $<HTMLElement>('#hrDisconnectBtn').classList.remove('hide');
      $<HTMLElement>('#hrChip').classList.remove('hide');
      const age = settings.age ?? 35;
      hrUnsubscribe = onHeartRate(ppm => {
        $<HTMLElement>('#hrPpm').textContent = String(ppm);
        const chip = $<HTMLElement>('#hrChip');
        chip.className = `hr-chip ${hrZoneClass(ppm, age)}`;
      });
      toast('HR conectado');
    } catch (e) {
      toast('Error al conectar HR');
    }
  });

  $<HTMLButtonElement>('#hrDisconnectBtn').addEventListener('click', async () => {
    await disconnectHR();
    if (hrUnsubscribe) { hrUnsubscribe(); hrUnsubscribe = null; }
    $<HTMLElement>('#hrConnectBtn').classList.remove('hide');
    $<HTMLElement>('#hrDisconnectBtn').classList.add('hide');
    $<HTMLElement>('#hrChip').classList.add('hide');
    toast('HR desconectado');
  });

  // Settings: sound toggle
  $<HTMLElement>('#soundToggle').addEventListener('click', async () => {
    settings.soundEnabled = !settings.soundEnabled;
    await saveSettings({ soundEnabled: settings.soundEnabled });
    $<HTMLElement>('#soundToggle').classList.toggle('on', !!settings.soundEnabled);
    $<HTMLElement>('#soundToggle').setAttribute('aria-checked', String(!!settings.soundEnabled));
  });

  // Settings: HC toggle
  $<HTMLElement>('#hcToggle').addEventListener('click', async () => {
    if (!settings.hcEnabled) {
      const granted = await requestHealthConnectPermission();
      if (!granted) { toast('Permisos HC denegados'); return; }
    }
    settings.hcEnabled = !settings.hcEnabled;
    await saveSettings({ hcEnabled: settings.hcEnabled });
    $<HTMLElement>('#hcToggle').classList.toggle('on', !!settings.hcEnabled);
    $<HTMLElement>('#hcToggle').setAttribute('aria-checked', String(!!settings.hcEnabled));
  });

  // Settings: age
  $<HTMLInputElement>('#ageInput').addEventListener('change', async () => {
    const v = parseInt($<HTMLInputElement>('#ageInput').value);
    if (!isNaN(v) && v > 0) {
      settings.age = v;
      await saveSettings({ age: v });
    }
  });

  // Settings: BLE forget
  $<HTMLButtonElement>('#bleForgetBtn').addEventListener('click', async () => {
    await disconnectHR();
    await saveSettings({ bleDeviceId: '', bleDeviceName: '' });
    settings.bleDeviceId = '';
    settings.bleDeviceName = '';
    $<HTMLElement>('#bleDeviceName').textContent = 'Sin dispositivo guardado';
    toast('Dispositivo olvidado');
  });

  // History: export CSV
  $<HTMLButtonElement>('#exportCsv').addEventListener('click', async () => {
    const allRecs = await getAllRecords();
    const csv = generateCsv(allRecs, PLAN.sessions);
    downloadBlob(csv, 'text/csv', `gymtracker-${new Date().toISOString().slice(0,10)}.csv`);
  });

  // History: import plan
  $<HTMLButtonElement>('#importPlanBtn').addEventListener('click', () => {
    $<HTMLInputElement>('#planFile').click();
  });
  $<HTMLInputElement>('#planFile').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!validPlan(data)) { toast('Plan inválido'); return; }
      PLAN = data as Plan;
      await saveSettings({ planJson: text });
      toast('Plan importado');
      renderDash();
    } catch { toast('Error al leer plan'); }
    (e.target as HTMLInputElement).value = '';
  });

  // History: export plan
  $<HTMLButtonElement>('#exportPlanBtn').addEventListener('click', () => {
    downloadBlob(JSON.stringify(PLAN, null, 2), 'application/json', `plan-${PLAN.meta.version}.json`);
  });

  // History: import backup
  $<HTMLButtonElement>('#importBackupBtn').addEventListener('click', () => {
    $<HTMLInputElement>('#backupFile').click();
  });
  $<HTMLInputElement>('#backupFile').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.schema === 1) {
        await importLegacyBackupV1(data);
        toast('Respaldo v10 importado');
      } else if (data.schema === 2) {
        await importBackupV2(data);
        toast('Respaldo v11 importado');
      } else {
        toast('Formato de respaldo desconocido');
        return;
      }
      renderDash();
    } catch { toast('Error al leer respaldo'); }
    (e.target as HTMLInputElement).value = '';
  });

  // History: export backup
  $<HTMLButtonElement>('#exportBackupBtn').addEventListener('click', async () => {
    const backup = await exportBackupV2(PLAN);
    downloadBlob(JSON.stringify(backup, null, 2), 'application/json', `gymtracker-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast('Respaldo exportado');
  });

  // Onboarding
  $<HTMLButtonElement>('#onbImportBtn').addEventListener('click', () => {
    $<HTMLInputElement>('#onbFile').click();
  });
  $<HTMLInputElement>('#onbFile').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.schema === 1) await importLegacyBackupV1(data);
      else if (data.schema === 2) await importBackupV2(data);
      else { toast('Formato desconocido'); return; }
      $<HTMLElement>('#onboarding').classList.add('hide');
      await renderDash();
      toast('Historial importado');
    } catch { toast('Error al importar'); }
  });
  $<HTMLButtonElement>('#onbFreshBtn').addEventListener('click', async () => {
    $<HTMLElement>('#onboarding').classList.add('hide');
    await renderDash();
  });

  // Firebase sync status
  onSyncStatus(status => {
    const badge = $<HTMLElement>('#syncBadge');
    const text = $<HTMLElement>('#syncStatusText');
    const labels: Record<string, string> = {
      idle: 'Inactivo', connecting: 'Conectando...', active: 'Activo',
      offline: 'Sin conexión', error: 'Error', disabled: 'Desactivado'
    };
    badge.textContent = labels[status] ?? status;
    badge.className = `sync-status ${status}`;
    text.textContent = status === 'active' ? 'Sincronizando con Firebase' :
      status === 'offline' ? 'Sin conexión — datos locales OK' :
      status === 'error' ? 'Error de sincronización' : 'Firebase';
  });
}

// ── Onboarding check ──────────────────────────────────────────────────────────

async function checkOnboarding(): Promise<void> {
  const empty = await isDbEmpty();
  if (empty) {
    $<HTMLElement>('#onboarding').classList.remove('hide');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  await initDb();
  settings = await getSettings();

  // Load saved plan if any
  if (settings.planJson) {
    try {
      const p = JSON.parse(settings.planJson);
      if (validPlan(p)) PLAN = p as Plan;
    } catch { /* use default */ }
  }

  initAudioOnGesture();
  await initFirebaseSync(true);

  wireEvents();
  await checkOnboarding();
  await renderDash();
  showView('dash');

  // HC auto-sync on native
  if (Capacitor.isNativePlatform() && settings.hcEnabled) {
    syncHealthConnect().then(async r => {
      if (r.steps > 0 || r.weights > 0) {
        const steps = await getAllSteps();
        await renderSteps(steps);
      }
    });
  }
}

init().catch(console.error);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
