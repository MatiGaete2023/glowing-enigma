# Plan de ejecución · Gym Tracker v11 "nativo" (para Sonnet 4.6)

> **Cómo usar este documento:** spec completa para evolucionar el tracker v10 (PWA single-file, ya operativa en `GYMTRACKER/`) a una **app Android nativa** (Capacitor) con base de datos reactiva, sincronización en la nube, Health Connect, pulsómetro Bluetooth y arquitectura TypeScript. Ejecutar las fases **E1→E10 en orden** — cada fase deja el proyecto funcionando y committeado. Las fases E1–E4 y E8–E9 se pueden verificar sin dispositivo; E5–E7 requieren un Android real.

## Alcance aprobado por el usuario

| Área | Integrar |
|---|---|
| Capa de datos | IndexedDB + Dexie (①) · RxDB con replicación (②) · Firebase (④) — **como un solo stack, ver §Arquitectura** |
| Empaquetado | Capacitor (②) |
| Salud | Health Connect API (①) · Pulsómetro Bluetooth BLE (②) |
| Arquitectura | TypeScript + Vite + Vitest (①) · XState para el ciclo de sesión (③) |
| Extra | **Alerta sonora al terminar el descanso** + mejoras visuales (§E9) |

## Decisiones de arquitectura (no re-litigar durante la ejecución)

1. **Un solo stack de datos, no tres.** RxDB con el *storage adapter* `rxdb/plugins/storage-dexie` (eso cubre ① IndexedDB+Dexie), y el plugin `rxdb/plugins/replication-firestore` contra el **proyecto Firebase que ya existe en este repo** (`firebase.json`, `firestore.rules` — el mismo de la quiniela; eso cubre ② y ④). No instalar Dexie suelto ni Supabase.
2. **Proyecto nuevo en `GYMTRACKER-APP/`** (Vite + TS + Capacitor). El v10 single-file de `GYMTRACKER/` **no se toca**: queda como versión "lite" web deployada en Netlify y como plan B. La app nativa madura en paralelo.
3. **Migración de datos = importar el respaldo JSON del v10.** La app Capacitor corre en otro origen que Netlify: el localStorage NO se traspasa solo. El v10 ya exporta "Respaldo completo (JSON)" (`{app:"gym-tracker",schema:1,...}`); v11 DEBE importar ese formato en su onboarding. Es el puente oficial de datos.
4. **Distribución por APK directo (sideload), no Play Store.** Usuario único. Esto evita todo el proceso de Play Console y las declaraciones de permisos de Health Connect para publicación. Documentar cómo generar el APK firmado con Android Studio.
5. **Auth Firebase anónima** con persistencia + posibilidad futura de vincular Google. Datos bajo `gymtracker/{uid}/...` en Firestore, reglas solo-dueño.
6. **Identidad visual del v10 se conserva** (dark, ámbar/teal/índigo, layout actual). v11 recupera las fuentes originales (Space Grotesk / Inter / JetBrains Mono) como **assets locales empaquetados** — sin CDN.

---

## Fases

### E1 · Scaffold TS + Vite + Vitest, port del v10
1. `npm create vite@latest GYMTRACKER-APP -- --template vanilla-ts` (mantener vanilla-ts: el DOM imperativo del v10 se porta casi 1:1; NO introducir React/Vue).
2. Estructura:
   ```
   GYMTRACKER-APP/src/
     main.ts            ← bootstrap
     plan/default.ts    ← plan v9.1 tipado (copiar de GYMTRACKER/plan-sesiones-v9.1.json)
     types.ts           ← Plan, Session, Exercise, Record, SetRow, Weight, Waist, Steps
     db/                ← (E2)
     machine/           ← (E4)
     health/            ← (E6, E7)
     ui/                ← dash.ts, session.ts, history.ts, timer.ts, charts.ts
     audio.ts           ← (E8)
     styles.css         ← CSS del v10 + fuentes locales @font-face
   public/fonts/        ← woff2 de Space Grotesk 500-700, Inter 400-600, JetBrains Mono 500-700
   ```
3. Portar TODO el comportamiento del v10 (`GYMTRACKER/index.html` es la referencia funcional): dashboard, sesiones, lumbar, historial, CSV, respaldo, peso/cintura/pasos, warmup, "últ:", dur objetivo. En esta fase puede seguir usando localStorage detrás de una interfaz `Storage` propia — E2 la reemplaza.
4. Vitest configurado con `happy-dom`. Tests mínimos de esta fase: `computeWeekDeltaByDate`, `validPlan`, `hasData`, generación de CSV con nombres snapshot, cálculo baseline/objetivo NEAT.
5. `npm run build` genera PWA estática (mantener `manifest.webmanifest` + SW — reusar los del v10 vía `vite-plugin-pwa` o copiado simple).

**Aceptación E1:** `npm test` verde; `npm run build` + `npm run preview` reproduce el v10 completo con fuentes locales y sin requests externos.

### E2 · Capa de datos RxDB (Dexie storage)
1. `npm i rxdb rxjs`. Crear `src/db/database.ts` con `createRxDatabase({storage: getRxStorageDexie()})`.
2. Colecciones y schemas (todas con `updatedAt` y soft-delete `_deleted` para replicación):
   - `records` — pk `qN_SN` (misma clave del v10) + todos los campos actuales incl. `exNames`, `planVer`.
   - `weights` (pk `date`), `waist` (pk `date`), `steps` (pk `date`, campos `steps` y `source:'manual'|'health-connect'`).
   - `plans` (pk `version`) y `settings` (pk `id`: currentQ, sonido on/off, dispositivo BLE recordado, flags de onboarding).
3. La UI se suscribe a queries reactivas (`collection.find().$`) — reemplaza los `renderX()` manuales tras cada `save()`; el render se dispara por suscripción.
4. **Onboarding de migración:** primera pantalla si la DB está vacía → botón "Importar respaldo del tracker anterior" (acepta el JSON schema 1 del v10, mapea a las colecciones) o "Empezar de cero". También detectar claves `rg_*` en localStorage local (caso: build web servida desde el mismo origen del v10) y ofrecer migrarlas.
5. El respaldo completo (export/import JSON) se mantiene y ahora se genera desde RxDB (`schema:2`, retro-compatible: el import acepta schema 1 y 2).
6. Tests Vitest: crear DB en memoria (`storage-memory`), insertar/migrar respaldo v10 de fixture, verificar round-trip export→import.

**Aceptación E2:** app funciona 100 % sobre RxDB; importar un respaldo real del v10 restaura sesiones/pesos/pasos; tests de migración verdes.

### E3 · Replicación Firestore (Firebase existente)
1. `npm i firebase`. Config del proyecto Firebase del repo (pedir al usuario el `firebaseConfig` de la consola — NO inventarlo ni copiarlo de la quiniela sin confirmar que es el mismo proyecto).
2. Auth anónima (`signInAnonymously`, persistencia local). UI mínima en Ajustes: estado de sync (✓ sincronizado hace X min / offline / error) + uid abreviado.
3. `replicateFirestore()` por colección contra `gymtracker/{uid}/{collection}`; `live: true`, pull+push. Resolución de conflictos: last-write-wins por `updatedAt` (suficiente para un solo usuario multi-dispositivo).
4. **Ampliar `firestore.rules` (aditivo, sin tocar las reglas de la quiniela):**
   ```
   match /gymtracker/{uid}/{collection}/{doc} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```
   Deploy de reglas: `firebase deploy --only firestore:rules` (documentar; lo corre el usuario).
5. Modo sin red y modo "sync desactivado" en Ajustes deben funcionar igual que hoy (offline-first: RxDB es la verdad local, Firestore es réplica).

**Aceptación E3:** editar en el navegador del PC y ver el cambio en el celular (y viceversa) en <10 s con red; sin red la app opera normal y sincroniza al volver.

### E4 · Máquina de estados de sesión (XState v5)
1. `npm i xstate`. `src/machine/session.ts`: estados `idle → warmup? → active → done` con sub-estado paralelo `restTimer: {stopped, running(context: secsLeft), finished}`.
2. Eventos: `START`, `FINISH`, `REOPEN`, `TIMER_START(secs)`, `TIMER_TICK`, `TIMER_CANCEL`, `LUMBAR_SET(nivel)`. Guardas: `FINISH` exige `start` seteado; `LUMBAR_SET(>=4)` dispara acción `suggestStop` (mostrar el gobernador, no forzar).
3. Efectos como *actions/actors* de la máquina: wake lock (adquirir en `active`, liberar al salir), persistencia del status en RxDB, vibración+sonido en `restTimer.finished`.
4. Tests Vitest de la máquina pura (sin DOM): transiciones válidas/ inválidas, no se puede `FINISH` desde `idle`, timer llega a `finished` y auto-resetea.

**Aceptación E4:** el ciclo de sesión de la UI pasa por la máquina (nada muta `status` directamente); tests de transiciones verdes.

### E5 · Capacitor + Android
1. `npm i @capacitor/core @capacitor/cli @capacitor/android` (Capacitor 6+, última estable) · `npx cap init "Gym Tracker" cl.matias.gymtracker --web-dir dist` · `npx cap add android`.
2. Plugins base: `@capacitor/haptics` (reemplaza `navigator.vibrate` en nativo), `@capacitor/local-notifications` (E8), `@capacitor/splash-screen`, `@capacitor/app`.
3. Ícono adaptativo + splash generados con `@capacitor/assets` desde `pwa-icon.svg` (fondo `#0E1620`).
4. Safe areas: ya existe `viewport-fit=cover`; añadir `padding: env(safe-area-inset-*)` en `.top`, `.cta` y `.tabs` para edge-to-edge Android 15.
5. Documentar en `GYMTRACKER-APP/ANDROID.md`: abrir en Android Studio, generar APK firmado (keystore local del usuario), instalar por sideload; y el ciclo `npm run build && npx cap sync android`.

**Aceptación E5:** `npx cap sync` sin errores; APK debug instala y corre en dispositivo con datos, splash e ícono correctos; haptics funcionan.

### E6 · Health Connect (pasos y peso automáticos)
1. Plugin comunidad `capacitor-health-connect` (verificar en npm el más mantenido al momento de ejecutar; alternativa: `@kiwi-health/capacitor-health-connect`). Permisos: `READ_STEPS`, `READ_WEIGHT` en el manifest + flujo de consentimiento de Health Connect.
2. `src/health/healthConnect.ts`: al abrir la app (y con botón manual "↻"), leer pasos agregados por día de los últimos 14 días y último peso; upsert en RxDB con `source:'health-connect'`. **Regla de no-pisado:** un registro `source:'manual'` del mismo día no se sobreescribe.
3. UI: en el panel NEAT, banner "· pasos de hoy vía Health Connect" y ocultar el input manual cuando hay dato automático del día (con opción "corregir a mano"). Ajustes: activar/desactivar HC, estado del permiso.
4. Fallback limpio: en web/PWA o sin Health Connect instalado, el panel queda exactamente como en v10 (manual). Detección por `Capacitor.isNativePlatform()`.

**Aceptación E6:** en dispositivo con Health Connect, los pasos del teléfono aparecen solos y alimentan baseline/objetivo NEAT; el flujo manual sigue intacto en web.

### E7 · Pulsómetro Bluetooth (banda HR)
1. Plugin `@capacitor-community/bluetooth-le` (funciona en nativo y hace fallback a Web Bluetooth en Chrome — un solo código). Permisos Android: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (sin location si `neverForLocation`).
2. `src/health/heartRate.ts`: scan filtrado por **Heart Rate Service `0x180D`**, suscripción a la characteristic `0x2A37` (parsear el flag byte: uint8 vs uint16). Recordar el último dispositivo en `settings` y auto-reconectar.
3. UI en vista de sesión: chip "❤ 132 ppm" junto al elapsed, visible cuando hay banda conectada. Color por zona usando FC máx estimada (pedir edad una vez en Ajustes): **verde dentro de Z2 (60–70 % FCmáx), ámbar sobre Z2** — coherente con el plan: talk test manda, ppm es referencia.
4. Autollenado: al guardar una fila con campo `ppm` vacío durante conexión activa, ofrecer el promedio del último intervalo (botón "usar ❤", no automático silencioso).
5. Botón conectar/desconectar en la vista de sesión (solo sesiones con ejercicios `cardio`/`circuit`… y también fuerza: el campo ppm existe en todos).

**Aceptación E7:** con una banda HR real: conectar, ver ppm en vivo con color de zona, autollenar un campo ppm; reconexión al reabrir la app.

### E8 · Alerta sonora del descanso (+ notificación en background)
1. `src/audio.ts` con **Web Audio API, sin archivos de audio**: `AudioContext` + oscilador — 3 pips de 880 Hz/150 ms y un pip final de 1320 Hz/300 ms, ganancia con envolvente para no hacer clic. Crear/resumir el `AudioContext` en el primer gesto del usuario (requisito de autoplay).
2. Al llegar el timer a 0: sonido + haptics (`Haptics.vibrate` nativo / `navigator.vibrate` web) — ambos.
3. **App en background o pantalla apagada:** el `setInterval` se congela. Al iniciar el timer, programar `LocalNotifications.schedule({at: now+secs})` con sonido y texto "Descanso terminado — siguiente serie"; si el timer termina en foreground, cancelar la notificación programada. En web, fallback con Notification API si hay permiso.
4. Ajustes: toggle "Sonido del timer" (persistido en `settings`); el chip del timer muestra �otoggle rápido.

**Aceptación E8:** en dispositivo: timer termina con pantalla apagada → llega notificación con sonido; en foreground → pips + vibración; toggle silencia solo el audio (vibración queda).

### E9 · Mejoras visuales y de diseño
1. **Fuentes originales de vuelta** (local): Space Grotesk (display), Inter (texto), JetBrains Mono (datos) vía `@font-face` + woff2 en `public/fonts/` con `font-display: swap`.
2. **Timer como anillo de progreso** (SVG `stroke-dashoffset`) alrededor del tiempo restante en el chip, teal→ámbar en los últimos 10 s.
3. **Check de serie hecha:** tap en el número de serie la marca ✓ y atenúa la fila (persistido como campo `done` en la fila) — feedback de avance dentro del ejercicio + haptic suave.
4. **Resumen al terminar sesión** (pantalla/toast expandido): duración vs objetivo, series completadas, volumen total (Σ kg×reps de filas `fuerza`) y deltas "▲ +2.5 kg en Prensa vs última vez" calculados contra `lastDoneRowsByName`.
5. **Gráfico de peso mejorado:** etiquetas min/max en el eje, selector 30d / 90d / todo, punto destacado del último registro. (Aplicar la skill `dataviz` del entorno al construirlo.)
6. **Targets táctiles ≥44 px** en botones pequeños (`.delset`, `.qsel button`, tabs) y `:focus-visible` consistente.
7. **Estados vacíos con guía** (sin sesiones, sin pesos, sin pasos): texto corto + flecha a la acción, en vez de paneles mudos.
8. **Transiciones de vista** sutiles (fade/slide 150 ms, `prefers-reduced-motion` respetado).
9. **Barra de estado Android** integrada: `StatusBar` overlay con fondo `#0E1620` (plugin `@capacitor/status-bar`).

**Aceptación E9:** revisión visual en dispositivo: fuentes correctas, anillo de timer, checks de serie, resumen post-sesión con volumen y deltas, gráfico con rangos.

### E10 · Verificación final y entrega
1. `npm test` completo (data layer, máquina, utilidades, migración) — todo verde.
2. `npm run build` sin warnings de tipos (`tsc --noEmit` en CI script `npm run check`).
3. Checklist manual en dispositivo (documentar resultados en `GYMTRACKER-APP/VERIFICACION.md`): importar respaldo v10 real → historial intacto; sesión completa con timer+sonido+wake lock; sync bidireccional PC↔celular; Health Connect pasos; banda HR si disponible; modo avión completo.
4. Actualizar `GYMTRACKER/REVISION_v9.md`… no — crear `GYMTRACKER-APP/README.md`: qué es, cómo se buildea, cómo se instala, cómo conviven v10 (Netlify) y v11 (APK), y que el respaldo JSON es el formato puente entre ambas.
5. Commit por fase + push a `claude/tracker-android-training-plan-pqe4kl`. **No crear PR** salvo pedido explícito.

---

## Restricciones globales

- **No tocar `GYMTRACKER/` (v10)** salvo el README nuevo si hace falta cruzar referencias. v10 sigue siendo la versión Netlify.
- **No cambiar el contenido del plan de entrenamiento** (v9.1 es fuente de verdad; en v11 vive tipado en `plan/default.ts` con los mismos datos).
- **Offline-first siempre:** ninguna función existente puede pasar a requerir red. Firestore/HC/BLE son capas opcionales que degradan limpio.
- **Privacidad:** datos de salud solo en el dispositivo + Firestore del propio uid; nada de analytics ni terceros.
- Español de Chile en toda la UI. Identidad visual v10.
- Al ejecutar, verificar versiones actuales de: Capacitor, RxDB (API de replicación Firestore), plugin Health Connect y bluetooth-le — usar las estables del momento y ajustar imports si cambiaron desde la redacción de este plan.

## Riesgos conocidos (para no descubrirlos a mitad de camino)

| Riesgo | Mitigación |
|---|---|
| Plugin Health Connect comunitario poco mantenido | Encapsular en `health/healthConnect.ts` con interfaz propia; si el plugin falla, la app degrada a manual sin tocar el resto |
| RxDB replication-firestore requiere índices/reglas específicas | Probar replicación con una colección (weights) antes de extender a las cinco |
| Notificación local con sonido varía por OEM (Xiaomi/Samsung matan background) | El caso principal (foreground con pantalla activa + wake lock) no depende de la notificación; la notificación es mejora, no única vía |
| Firestore gratis (Spark) tiene cuotas | Volumen de un usuario es ínfimo (<1 MB/mes); documentar igual |
| Migración de datos v10→v11 | Fixture de respaldo real en tests; nunca borrar el respaldo importado |
