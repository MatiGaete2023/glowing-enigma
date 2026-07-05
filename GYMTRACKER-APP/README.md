# Gym Tracker v11 — Regreso al Gimnasio

App de seguimiento de entrenamiento (plan v9.1, 7 sesiones × 6 quincenas) construida con
**TypeScript + Vite + RxDB**, empaquetable como **PWA** o como **app Android nativa con Capacitor**.

Sucesora del tracker v10 (`../GYMTRACKER/`, single-file PWA). Los datos de v10 se importan
con su respaldo JSON (`schema: 1`) desde el onboarding o desde Historial → Restaurar respaldo.

## Arquitectura

| Capa | Tecnología |
|------|-----------|
| UI | Vanilla TS + CSS (misma identidad visual que v10) |
| Datos locales (fuente de verdad) | RxDB sobre IndexedDB (Dexie) |
| Sincronización | Replicación RxDB ↔ Firestore (`gymtracker/{uid}/…`), auth anónima |
| Nativo | Capacitor 6 (haptics, notificaciones locales, BLE, Health Connect) |
| Audio | Web Audio API (pips sintetizados, sin archivos) |

**Offline-first**: todo funciona sin red. Firestore es réplica, no requisito.

## Comandos

```bash
npm install        # dependencias
npm run dev        # desarrollo (http://localhost:5173)
npm run check      # typecheck estricto
npm test           # tests unitarios (Vitest)
npm run build      # producción → dist/
npm run preview    # sirve dist/ localmente
```

## Estructura

```
src/
  main.ts               orquestador UI (dashboard, sesión, historial, ajustes)
  types.ts              tipos + FIELDS por tipo de ejercicio + SESSION_ORDER
  utils.ts              lógica pura (Δ peso por fechas, NEAT, CSV, validación de plan)
  audio.ts              pips del timer (Web Audio)
  plan/default.ts       plan v9.1 embebido como default
  db/database.ts        RxDB: esquemas, upserts, import/export de respaldos
  db/firebase.ts        replicación Firestore + estado de sincronización
  health/heartRate.ts   banda HR por Bluetooth LE (servicio 0x180D)
  health/healthConnect.ts  pasos y peso desde Health Connect (no pisa datos manuales)
  machine/session.ts    máquina de estados de sesión (XState)
tests/utils.test.ts     19 tests de la lógica pura
public/
  fonts/                Space Grotesk, Inter, JetBrains Mono (woff2 locales, offline)
  manifest.webmanifest  PWA
  sw.js                 service worker cache-first
```

## Datos

- **Registros**: `q{N}_S{N}` con snapshot de nombres de ejercicio (`exNames`) para que
  reimportar un plan no corrompa historial ni CSV.
- **Respaldo v11** (`schema: 2`): exporta/importa todo (registros, peso, cintura, pasos, plan).
- **Respaldo v10** (`schema: 1`): importable para migrar desde la PWA anterior.
- **Aislamiento**: cada usuario anónimo de Firebase solo ve `gymtracker/{su uid}/`.

## Android

Ver [ANDROID.md](./ANDROID.md). Resumen: `npx cap init && npx cap add android && npm run build && npx cap sync`.

## Verificación

Ver [VERIFICACION.md](./VERIFICACION.md) para la checklist y el smoke test reproducible.
