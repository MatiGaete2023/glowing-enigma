import { createMachine } from 'xstate';

// Session state machine — types only, actual UI state managed in main.ts
export const sessionMachine = createMachine({
  id: 'session',
  context: {
    sessionKey: null as string | null,
    startTime: null as string | null,
    lumbar: -1,
    timerSecs: 0,
    timerRunning: false,
  },
  initial: 'idle',
  states: {
    idle: { on: { OPEN: 'viewing' } },
    viewing: { on: { START: 'active', CLOSE: 'idle' } },
    active: { on: { FINISH: 'done', CLOSE: 'idle' } },
    done: { on: { REOPEN: 'active', CLOSE: 'idle' } },
  },
});

export type SessionMachine = typeof sessionMachine;
