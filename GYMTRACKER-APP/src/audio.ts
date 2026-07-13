let _ctx: AudioContext | null = null;

export function initAudioOnGesture(): void {
  if (_ctx) return;
  document.addEventListener('touchstart', () => {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume();
  }, { once: true, passive: true });
  document.addEventListener('click', () => {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume();
  }, { once: true });
}

function pip(ctx: AudioContext, freq: number, start: number, dur: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env);
  env.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.setValueAtTime(gain, start + dur - 0.02);
  env.gain.linearRampToValueAtTime(0, start + dur);
  osc.start(start);
  osc.stop(start + dur);
}

export function playTimerDone(): void {
  if (!_ctx) return;
  const ctx = _ctx;
  if (ctx.state === 'suspended') { ctx.resume().then(() => playTimerDone()); return; }
  const now = ctx.currentTime;
  pip(ctx, 880, now + 0.0, 0.15, 0.35);
  pip(ctx, 880, now + 0.2, 0.15, 0.35);
  pip(ctx, 880, now + 0.4, 0.15, 0.35);
  pip(ctx, 1320, now + 0.65, 0.30, 0.5);
}

export function playPip(): void {
  if (!_ctx) return;
  const ctx = _ctx;
  if (ctx.state === 'suspended') return;
  pip(ctx, 660, ctx.currentTime, 0.08, 0.2);
}
