# Plan de implementación v11.1 — para ejecutar con Sonnet 5

**Objetivo**: cerrar los 3 pedidos del usuario sobre `GYMTRACKER-APP/` (v11) y dejar la app
instalable en Android **sin computadora**, vía Netlify Drop.

---

## Contexto — leer antes de tocar código

El usuario revisó un HTML que resultó ser el **tracker v9 original** (subido en un zip junto
al informe de 12 semanas). Ese v9 no tiene timer ni pasos. Las versiones del repo **sí los
tienen**:

| Función | v9 (zip usuario) | v10 `GYMTRACKER/index.html` | v11 `GYMTRACKER-APP/` |
|---|---|---|---|
| Timer de descanso + alarma | ✗ | ✓ | ✓ (chip SVG + Web Audio + notificación nativa) |
| Pasos manuales por día | ✗ | ✓ | ✓ (input + objetivo NEAT) |
| Persistencia del timer al minimizar/reiniciar | ✗ | ✗ | **✗ ← esto es lo único que falta de verdad** |

**Sobre el plan de entrenamiento** — el usuario confirmó que el plan vigente es el del zip
(`GYMTRACKER/material-usuario/plan-sesiones-v9-usuario.json`). Comparación ya hecha: es el
**mismo v9.1** que está embebido en la app (mismas 7 sesiones, mismos ejercicios y series).
Diferencias encontradas y su resolución:

- El zip trae pistas textuales de carga en `kg` («autoregula», «12–16», «peso corporal»)
  → E0 las incorpora al texto `tgt` donde falten.
- El zip NO trae `dur` ni `warmup` (la v9.1 del repo sí) → se conservan los del repo.
- El texto de la fase Q4 del zip menciona «back squat técnico», pero ninguna sesión del
  propio zip lo incluye (residuo de v8) → se conserva la redacción corregida del repo.

**Trabajo real a hacer**: E0 (reconciliar plan), E1 (timer persistente), E2 (pasos con
fecha editable), E3 (empaquetado para Netlify Drop). E4–E5 son verificación y entrega.

**Reglas generales**:
- Trabajar SOLO en `GYMTRACKER-APP/`. No tocar `GYMTRACKER/` (v10 en producción).
- El tracker se mantiene enfocado en **actividad física**: sesiones, peso, cintura, pasos.
  **NO** agregar módulos de nutrición, sueño ni kcal — eso vive en el informe de 12 semanas
  como documento aparte. Es un no-objetivo explícito del usuario.
- Rama: `claude/tracker-android-training-plan-pqe4kl`. Commit y push al terminar cada etapa.
- Después de cada etapa: `npm run check && npm test && npm run build` deben pasar.

---

## E0 — Reconciliación del plan con el material del usuario

1. Los materiales canónicos del usuario ya están versionados en
   `GYMTRACKER/material-usuario/` (informe 12 semanas + plan JSON). No moverlos.
2. En `GYMTRACKER-APP/src/plan/default.ts`, revisar ejercicio por ejercicio contra el JSON
   del usuario y completar los `tgt` a los que les falte la pista de carga textual:
   - S1 Pallof press → «banda o polea» (ya está)
   - S2 Step-up → «autoregula»; Farmer carry → «autoregula, pesado»; Dead bug → «peso corporal»
   - S4 Press inclinado → «autoregula»; Face pull → «polea liviana»; Suitcase → «autoregula»
   - S5 Goblet y KB swing → «12–16 kg»; Flexión → «banda si falta fuerza»; Remo → «autoregula»
   - S6 Goblet profundo → «12–16 kg»; Side plank → «peso corporal»
   - S7 Trineo → «ligero»; Acarreo → «autoregula»
   Regla: si el dato ya aparece en el `tgt`, no duplicar. No cambiar nombres, tipos ni series.
3. `npm test` sigue verde (validPlan no cambia).

**Aceptación**: cada ejercicio muestra en la app la misma guía de carga que el JSON del
usuario, sin alterar estructura del plan.

## E1 — Timer de descanso persistente (minimizar / reiniciar)

**Problema**: en `src/main.ts` el timer vive en memoria (`setInterval` que decrementa
`timerSecs`). Si el usuario minimiza (Android throttlea los intervals) o la app se
reinicia, el chip desaparece y la cuenta se pierde. La notificación nativa programada sí
sobrevive, pero la UI no.

**Diseño**: la verdad del timer es un **timestamp absoluto**, no un contador.

1. En `src/timerStore.ts` (nuevo, lógica pura y testeable):
   ```ts
   export interface TimerState { endsAt: number; total: number; }
   export function saveTimer(t: TimerState): void      // localStorage 'gt_timer'
   export function loadTimer(): TimerState | null      // null si no hay o inválido
   export function clearTimer(): void
   export function remainingSecs(t: TimerState, now?: number): number  // max(0, ceil((endsAt-now)/1000))
   ```
   localStorage (no RxDB): es estado efímero de UI, no debe replicarse a Firestore.

2. En `main.ts`:
   - `startRestTimer(secs)`: calcular `endsAt = Date.now() + secs*1000`, `saveTimer(...)`,
     y el tick pasa a **recalcular contra `Date.now()`** (`remainingSecs`) en vez de
     decrementar — así el throttling de background no desincroniza.
   - `stopTimer(...)`: además de lo actual, `clearTimer()`.
   - Nueva función `restoreTimer()`: si `loadTimer()` devuelve estado con
     `remainingSecs > 0` → rearmar chip e interval con el restante (sin reprogramar la
     notificación nativa: ya está programada). Si devuelve estado vencido → `clearTimer()`
     y, si venció hace <60 s, sonar alarma + toast «Descanso terminado» (el usuario volvió
     justo después de que venciera).
   - Llamar `restoreTimer()`: (a) al final de `init()`, y (b) en
     `document.addEventListener('visibilitychange', ...)` cuando pasa a `visible`.

3. **Tests** (`tests/timer.test.ts`): `remainingSecs` con timer futuro/vencido/exacto;
   round-trip save/load/clear con localStorage de happy-dom; `loadTimer` con JSON corrupto
   devuelve null.

**Aceptación**: iniciar timer de 90 s → recargar la página a los ~10 s → el chip reaparece
con ~80 s y termina sonando la alarma. Cancelarlo → recargar → no reaparece.

## E2 — Pasos manuales por día (con fecha editable)

**Problema**: el input de pasos existe pero siempre escribe en la fecha de HOY. El usuario
quiere ingresar pasos manualmente **por día** (p. ej. cargar ayer que se le olvidó).

1. En `index.html`, junto al input de pasos, añadir `<input type="date" id="stepsDate">`
   (mismo estilo que los inputs existentes, default hoy).
2. En `main.ts`, `#stepsSave`: usar la fecha del selector (validar que no sea futura;
   si es futura → toast y abortar). Tras guardar, resetear el selector a hoy.
3. La entrada manual mantiene `source: 'manual'` → Health Connect nunca la pisa
   (ya implementado en `healthConnect.ts`, solo verificar).
4. Mismo patrón opcional para peso y cintura SOLO si sale gratis (mismo helper); si
   complica, dejarlo para después — pasos es lo pedido.

**Aceptación**: guardar 7 500 pasos con fecha de ayer → aparece en la lista con esa fecha,
cuenta para el baseline NEAT, y el objetivo/porcentaje se recalculan.

## E3 — Entrega por Netlify Drop (instalación sin computadora)

**Objetivo**: que el usuario, SOLO con su teléfono, pueda publicar la app y instalarla.

1. Ajustes de build:
   - Verificar `vite.config.ts` con `base: '/'` (Drop sirve en la raíz del subdominio).
   - `npm run build` limpio.
2. Crear el paquete arrastrable/subible:
   ```bash
   cd GYMTRACKER-APP && npm run build
   mkdir -p deploy && rm -f deploy/gymtracker-v11-dist.zip
   (cd dist && zip -r ../deploy/gymtracker-v11-dist.zip .)
   ```
   - Añadir script npm `"pack": "npm run build && ..."` que haga lo anterior.
   - **Commitear el zip** en `GYMTRACKER-APP/deploy/` (≈300 KB, aceptable): es lo que
     permite el flujo 100 % teléfono — descargarlo desde GitHub y subirlo a Drop.
3. Crear `GYMTRACKER-APP/DEPLOY_NETLIFY_DROP.md` con las instrucciones para el usuario,
   TODAS ejecutables desde el teléfono:
   1. Entrar a `github.com/MatiGaete2023/glowing-enigma` → rama
      `claude/tracker-android-training-plan-pqe4kl` → `GYMTRACKER-APP/deploy/` →
      descargar `gymtracker-v11-dist.zip`.
   2. Ir a **https://app.netlify.com/drop**. **Iniciar sesión primero** (cuenta gratis;
      los sitios subidos sin cuenta se borran en ~1 hora).
   3. Tocar la zona de subida ("browse to upload") y elegir el zip descargado.
   4. Netlify publica y muestra la URL (`https://algo.netlify.app`). Opcional: cambiar el
      nombre en Site settings → Change site name.
   5. Abrir esa URL en Chrome del teléfono → menú ⋮ → **«Instalar aplicación»**.
   6. Actualizaciones futuras: repetir con el zip nuevo en **el mismo sitio** (Deploys →
      arrastrar/subir), la URL no cambia.
   - Nota en el doc: como PWA no hay notificación con la app cerrada; la alarma del timer
     suena con la app abierta o al volver (E1). Para notificaciones en background está el
     APK (ver ANDROID.md).
4. Verificar que `sw.js` y `manifest.webmanifest` quedaron dentro del zip (raíz).

**Aceptación**: el zip existe en el repo, contiene `index.html`, `manifest.webmanifest`,
`sw.js`, `fonts/` y `assets/` en la raíz, y el doc DEPLOY_NETLIFY_DROP.md está completo.

## E4 — Verificación

1. `npm run check` — sin errores.
2. `npm test` — todos los tests (los 19 existentes + los nuevos de timer).
3. `npm run build` — sin errores.
4. Smoke test con Chromium (`/opt/pw-browsers/chromium` + playwright-core, patrón usado en
   VERIFICACION.md) contra `npm run preview`:
   - Flujo de sesión completo sigue funcionando (abrir → iniciar → serie → finalizar).
   - **Nuevo**: iniciar timer → `page.reload()` → chip visible con restante correcto.
   - **Nuevo**: guardar pasos con fecha de ayer → aparece en la lista.
5. Actualizar `VERIFICACION.md` con los resultados nuevos.

## E5 — Entrega

1. Commit por etapa (mensajes descriptivos en español) y push a
   `claude/tracker-android-training-plan-pqe4kl` (`git push -u origin <rama>`, retry con
   backoff si falla la red).
2. Mensaje final al usuario: qué se hizo + los 6 pasos de Drop resumidos + recordatorio de
   que el respaldo v10 se importa en el onboarding.

---

## Fuera de alcance (NO hacer)

- Módulos de nutrición, kcal, sueño o apnea en el tracker (viven en el informe 12sem).
- Tocar `GYMTRACKER/` (v10) o la carpeta `QCSM/`.
- Cambiar el plan de entrenamiento (sigue v9.1 embebido; el informe 12sem no altera las 7
  sesiones).
- CI/CD de Netlify conectado a git (el usuario eligió explícitamente el flujo Drop).
