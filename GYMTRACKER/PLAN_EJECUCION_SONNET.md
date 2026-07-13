# Plan de ejecución · Tracker Gym v10 para Android (para Sonnet 4.6)

> **Cómo usar este documento:** es la spec completa para construir el tracker v10. Ejecutar las tareas en orden (T1→T8), marcando el checklist de aceptación al final. Los insumos están todos en esta carpeta. No inventar ejercicios ni cambiar el contenido del plan de entrenamiento: la fuente de verdad es `plan-sesiones-v9.1.json`.

## Insumos (en `GYMTRACKER/`)

| Archivo | Rol |
|---|---|
| `tracker-v9-baseline.html` | Código base actual. Se parte de aquí (copiar y modificar), NO reescribir desde cero: el layout, estilos y lógica de registro ya están validados en uso real. |
| `plan-sesiones-v9.1.json` | Plan de entrenamiento, fuente de verdad. Debe quedar **embebido como default** en el v10 y seguir siendo importable. |
| `REVISION_v9.md` | Auditoría con los bugs B1–B7 y mejoras M1–M9 que esta spec implementa. |
| `../QCSM/` (manifest.webmanifest, sw.js, pwa-icon.svg, head de index.html) | Patrón PWA ya probado del repo. Copiar la estructura, adaptar nombres/colores. |

## Entregables

```
GYMTRACKER/
  index.html            ← tracker v10 single-file (app completa)
  manifest.webmanifest  ← PWA
  sw.js                 ← service worker cache-first
  pwa-icon.svg          ← ícono (pesa/kettlebell simple, fondo #0E1620, acento #F2B33D)
```

`index.html` debe funcionar en dos modos sin cambios: (a) archivo suelto abierto en el navegador de Android (fallback MEM ya existente si no hay localStorage), y (b) hosteado (Netlify/Firebase Hosting como la quiniela) → instalable y offline.

## Tareas

### T1 · Base + PWA
1. Copiar `tracker-v9-baseline.html` → `index.html`.
2. Head estilo `QCSM/index.html`: `viewport-fit=cover`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` ("Gym Tracker"), `<link rel="manifest">`, `<link rel="icon">`. **Quitar `maximum-scale=1.0, user-scalable=no`** (B6/accesibilidad).
3. Registrar el SW solo si `location.protocol` es http/https (evitar error en file://):
   `if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js')`.
4. `manifest.webmanifest` calcado de `QCSM/` con: name "Tracker Regreso al Gimnasio", short_name "Gym Tracker", `background_color`/`theme_color` `#0E1620`, display standalone, ícono SVG `any maskable`.
5. `sw.js` calcado de `QCSM/sw.js` (network-first con fallback a cache): `CACHE_NAME='gym-tracker-v10-0-0'`, CORE_ASSETS `./`, `./index.html`, `./manifest.webmanifest`, `./pwa-icon.svg`.
6. **Fuentes (B4):** eliminar los `<link>` de Google Fonts y dejar stacks de sistema: `--disp` y `--body` → `system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`; `--mono` → `ui-monospace,'Roboto Mono',Menlo,monospace`. Cero requests externos.

### T2 · Fixes CSS/menores
1. **B1:** en `.lbtn.on[data-l="4"]` cambiar `var(--stop)` → `var(--bad)`.
2. **B7:** `hasData()` debe considerar también `rir`, `rest` y `rpe`.
3. **B7:** Q máx derivado del plan: `const QMAX = Math.max(...Object.keys(PHASES).map(Number))` y usarlo en `qUp`; recalcular al importar plan.
4. **B7:** al tocar un ítem del historial, toast "Viendo Q{n}" al cambiar de quincena.

### T3 · Integridad de datos (B2) — snapshot + migración
1. Al crear un registro en `openSession`, guardar snapshot por ejercicio: `r.exNames = sx.ex.map(e=>e.n)` y `r.planVer = planMeta?.version || 'embebido'`.
2. **Migración aditiva al iniciar** (patrón quiniela v2.0.0): recorrer `rg_records`; si un registro no tiene `exNames`, rellenarlo desde el `SESSIONS` activo (mejor esfuerzo, una sola vez) y marcar `migrated:true`. Nunca borrar datos; guardar solo si hubo cambios.
3. `exportCsv` debe iterar **el registro** (usar `r.exNames[ei]` como nombre; si el plan actual tiene más ejercicios que el registro, no pasa nada; si el registro tiene datos de un ejercicio que ya no existe en el plan, igual se exporta con su nombre snapshot).
4. `lastDoneFor`/carry-forward: emparejar por **nombre** (`exNames`), no por índice. Si no hay match por nombre, no arrastrar kg (usar `e.kg` del plan).

### T4 · Respaldo total (B3)
1. En Historial, agregar botones "⤓ Respaldo completo (JSON)" y "⤒ Restaurar respaldo".
2. Export: `{app:'gym-tracker', schema:1, fecha, meta, records, weights, plan}` → descarga `respaldo-gym-YYYY-MM-DD.json`.
3. Import: validar `app==='gym-tracker'` y `schema<=1`; **confirmar con `confirm()`** antes de sobrescribir; luego `save()` de todo y re-render. Mostrar cuántas sesiones/pesos se restauraron en el toast.

### T5 · Peso por fechas (B5) + cintura (M7)
1. Reescribir el cálculo de tendencia: media de los registros de los **últimos 7 días calendario** vs los **7 días previos** (por `date`, no por índice). Mostrar Δ solo si cada ventana tiene ≥3 registros; si no, indicar cuántos faltan. La alerta ">0.7 kg/sem → +150 kcal" usa este Δ por fechas.
2. Sparkline: eje X proporcional a la fecha (días), no al índice.
3. Junto al peso, input opcional de **cintura (cm)** → `rg_waist` `[{date,cm}]`, misma UX de guardado; mostrar última medición y Δ vs anterior. Va en el mismo panel "Peso de hoy" (renombrar a "Peso y cintura").

### T6 · NEAT / pasos diarios (M6)
1. Nuevo panel en dashboard "Pasos (NEAT)": input numérico + guardar → `rg_steps` `[{date,steps}]` (upsert por fecha, como peso).
2. Lógica según `meta.neat` del plan: los primeros 7 registros calculan el **baseline** (media); luego mostrar objetivo = `baseline+1750` (redondeado a 100, tope 9500) y media móvil 7 días vs objetivo con color ok/warn.
3. Mini-lista de últimos 7 registros (mismo estilo `wlist`).

### T7 · Experiencia en sesión (M3, M4, M5, M8)
1. **Timer de descanso:** en cada bloque de ejercicio tipo `fuerza`, botón "⏲ descanso" que inicia cuenta regresiva (default 90 s, tomando el valor de la columna `rest` de la fila si existe). Al llegar a 0: `navigator.vibrate?.([200,100,200])` + toast. Un solo timer activo; visible como chip flotante sobre el CTA.
2. **Wake Lock:** al `startSession` pedir `navigator.wakeLock?.request('screen')`; re-adquirir en `visibilitychange`; liberar en `finishSession`/al salir de la vista. Silencioso si la API no existe.
3. **"Última vez":** bajo el `ex-target` de cada ejercicio, línea `últ: 82.5 kg × 8,8,7 (2026-06-28)` construida desde `lastDoneFor` por nombre (T3.4). Si no hay historial, no mostrar nada.
4. **Duración objetivo (dur):** en la `timebar`, mostrar `⏱ 23 / 55 min`; pasar a `--warn` al superar `dur` y a `--bad` al superar 60. Si la sesión no tiene `dur`, mantener el umbral 60 actual.
5. **Warmup:** si la sesión tiene `warmup`, mostrarlo como línea colapsable arriba de la lista de ejercicios (estilo `.muted`, ícono 🔥). No es un ejercicio, no se registra.

### T8 · Plan embebido v9.1 (M9)
1. Reemplazar los objetos `SESSIONS`, `PHASES` y `CHALLENGES` embebidos por el contenido **exacto** de `plan-sesiones-v9.1.json` (incluye `dur`, `warmup`, `kg` en KB swing). `planVer` default: "v9.1 (default)".
2. `validPlan()` se mantiene igual (los campos nuevos son opcionales); import/export de plan siguen funcionando.

## Restricciones

- **No cambiar** el contenido de entrenamiento (ejercicios, series, kg, textos de fases/retos) — solo lo que dice T8.
- **No romper datos existentes**: mismas claves `rg_meta`, `rg_records`, `rg_weights`, `rg_plan`; migración solo aditiva (T3.2). Un usuario con datos v9 en localStorage debe abrir v10 y ver todo su historial intacto.
- Sin dependencias externas (ni CDN, ni fetch). Todo inline salvo manifest/sw/ícono.
- Español de Chile, tono y estilo visual actuales (dark, ámbar/teal/índigo).
- Mantener el fallback `MEM` para contextos sin localStorage.

## Criterios de aceptación (checklist)

- [ ] `index.html` abre como archivo suelto sin errores de consola y sin requests de red.
- [ ] Hosteado, Chrome Android ofrece "Instalar app"; con avión activado la app abre y opera (SW).
- [ ] Botón lumbar ≥4 activo muestra borde/fondo rojo (B1).
- [ ] Importar un plan con ejercicios reordenados NO corrompe CSV ni carry-forward (B2: verificar exportando CSV de un registro viejo tras importar plan alterado).
- [ ] Respaldo JSON exporta y restaura registros+pesos+pasos+cintura+plan en un dispositivo "limpio" (B3).
- [ ] Δ peso/sem calculado por fechas; con 3 pesajes/semana el valor es razonable (B5).
- [ ] Timer de descanso vibra al terminar; wake lock activo durante sesión (en device real o al menos sin errores donde la API falta).
- [ ] "Última vez" aparece tras completar una sesión y reabrir la misma sesión en la quincena siguiente.
- [ ] Panel de pasos calcula baseline con 7 registros y luego muestra objetivo +1750.
- [ ] Registros v9 preexistentes en localStorage sobreviven la migración y aparecen en historial.
- [ ] `dur` y `warmup` de v9.1 visibles en cada sesión.

## Verificación

1. **Estática:** `node -e "JSON.parse(require('fs').readFileSync('GYMTRACKER/plan-sesiones-v9.1.json','utf8'))"` y lint mental del HTML (sin `--stop`, sin `fonts.googleapis`).
2. **jsdom** (patrón `tools/check_ab.py` del repo, pero en node): cargar `index.html`, simular `localStorage`, verificar: renderDash pinta 7 nodos; abrir S1, iniciar sesión, ingresar una serie, terminar → registro `done` con `exNames`; exportCsv genera filas con nombres del snapshot; migración de un registro fabricado sin `exNames`.
3. **Manual en Android** (usuario): instalar desde el hosting, correr una sesión real, probar timer/vibración/wake lock y respaldo.
4. Commit + push a `claude/tracker-android-training-plan-pqe4kl`. No crear PR salvo pedido explícito.
