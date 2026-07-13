# Verificación GYMTRACKER-APP v11.1

## Automática (reproducible)

```bash
cd GYMTRACKER-APP
npm run check    # typecheck estricto: sin errores
npm test         # 29 tests Vitest: todos pasan
npm run build    # producción: compila sin errores
npm run pack     # genera deploy/gymtracker-v11-dist.zip para Netlify Drop
```

## Smoke test end-to-end (Chromium + preview)

Flujo verificado contra `npm run preview` con navegador real:

| Paso | Resultado esperado | Estado |
|------|--------------------|:------:|
| Primera carga | Onboarding visible, 7 nodos de sesión en el track | ✓ |
| "Empezar de cero" | Onboarding se cierra y no reaparece tras recargar | ✓ |
| Abrir S1 | "Fuerza Base A", 6 bloques de ejercicio, 15 filas de serie, calentamiento | ✓ |
| "Iniciar sesión" | CTA pasa a "Finalizar sesión", hora de inicio autocompletada | ✓ |
| Registrar kg + marcar serie ✓ | Persiste en RxDB (commit por cambio) | ✓ |
| "Finalizar sesión" | Resumen visible: duración vs objetivo (55 min) y volumen | ✓ |
| Volver al panel | Nodo S1 marcado hecho, progreso 1/7 | ✓ |
| Recargar página | Datos persisten (IndexedDB), onboarding no reaparece | ✓ |
| Sin red a Firebase | La app funciona igual; estado de sync queda "Sin conexión" | ✓ |

### v11.1 — timer persistente y pasos con fecha

| Paso | Resultado esperado | Estado |
|------|--------------------|:------:|
| Iniciar timer de descanso (2 min) | Chip visible, `localStorage['gt_timer']` con `endsAt` guardado | ✓ |
| Esperar ~15 s reales y recargar la página | Chip sigue visible, tiempo restante correcto (no vuelve a 2:00) | ✓ |
| Cancelar el timer | `gt_timer` se borra de localStorage | ✓ |
| Recargar tras cancelar | El chip NO reaparece | ✓ |
| Simular timer vencido (`endsAt` en el pasado) + recargar | `gt_timer` se limpia solo, chip no visible | ✓ |
| Input de fecha junto al de pasos | Existe (`#stepsDate`), con valor por defecto "hoy" | ✓ |
| Guardar 8 200 pasos con fecha de ayer | Aparece en la lista con la fecha de ayer, no la de hoy | ✓ |
| Intentar guardar pasos con fecha futura | Se rechaza con toast "No se pueden cargar pasos de una fecha futura" | ✓ |

## Bugs corregidos en la revisión final

1. **Sesión nueva no iniciaba**: el registro se creaba solo en memoria y los handlers lo
   buscaban en la DB → ahora se persiste al abrir y los handlers usan la referencia viva
   (`currentRec`).
2. **Documentos RxDB inmutables**: `toJSON()` es de solo lectura; mutarlo lanzaba
   `TypeError` → todos los getters clonan con `structuredClone`.
3. **RxDB DB9 en producción**: `ignoreDuplicate: true` solo existe en dev-mode y rompía la
   creación de la base → eliminado; `initDb` ahora usa promesa única (sin carreras).
4. **Notificación fantasma**: cancelar el timer de descanso no cancelaba la notificación
   programada de Android → se cancela siempre al detener el timer.
5. **Onboarding infinito**: "Empezar de cero" no persistía → nuevo flag `onboardingDone`
   en ajustes.
6. **Fuentes 404**: los woff2 no existían → descargadas las variables (Space Grotesk,
   Inter, JetBrains Mono, 92 KB total) a `public/fonts/`; la app es 100 % offline.
7. **Registros importados con menos ejercicios que el plan**: se normaliza `sets` al abrir
   la sesión.
8. Arranque no bloqueado por red: `initFirebaseSync` ya no se espera con `await` en `init()`.
9. Limpieza: boilerplate de Vite eliminado (counter.ts, assets de demo), imports y
   variables muertas fuera, versión del plan visible en historial aunque esté vacío.

## v11.1 — cambios de esta revisión

1. **E0 — Plan reconciliado**: se incorporaron al `tgt` de cada ejercicio las pistas de
   carga textuales del JSON canónico del usuario (`autoregula`, `12–16 kg`, `peso
   corporal`, `polea liviana`, `ligero`) donde faltaban. Sin cambios de estructura.
2. **E1 — Timer de descanso persistente**: antes vivía como contador en memoria y se
   perdía al minimizar (Android throttlea `setInterval` en segundo plano) o recargar.
   Ahora `src/timerStore.ts` guarda un timestamp absoluto (`endsAt`) en localStorage; el
   tick recalcula el restante contra `Date.now()` en vez de decrementar, y `restoreTimer()`
   reconstruye el chip al iniciar la app y al volver de segundo plano
   (`visibilitychange`). Si el timer venció mientras la app estaba oculta hace menos de
   60 s, igual avisa con sonido y toast al volver.
3. **E2 — Pasos manuales con fecha editable**: nuevo selector de fecha junto al input de
   pasos (`#stepsDate`, por defecto hoy) para poder cargar días atrás. Rechaza fechas
   futuras. Health Connect sigue sin pisar nunca las entradas `source:'manual'`.
4. **E3 — Netlify Drop**: `npm run pack` genera `deploy/gymtracker-v11-dist.zip`
   (commiteado, 374 KB) listo para subir en `app.netlify.com/drop` desde el teléfono, sin
   computadora ni git conectado a CI. Ver `DEPLOY_NETLIFY_DROP.md`.

## Pendiente manual (requiere hardware)

- Banda HR BLE real (servicio 0x180D) en Android.
- Health Connect con plugin nativo instalado (ver ANDROID.md).
- Notificación de fin de descanso con la app **completamente cerrada** (Android mata el
  proceso): solo garantizada en el APK nativo vía `@capacitor/local-notifications`; como
  PWA el timer se reconstruye al reabrir pero no despierta la app por sí solo.
- Reglas de seguridad de Firestore publicadas para `gymtracker/{uid}/**` (ver
  ../GYMTRACKER/FIREBASE_SETUP.md).
