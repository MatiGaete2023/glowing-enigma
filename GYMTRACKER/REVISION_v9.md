# Revisión · Tracker "Regreso al gimnasio" v9 + Plan de sesiones v9

Fecha: 2026-07-04 · Insumos revisados: `trackerregresogimnasio.html`, `plansesionesv9.json` (×2, idénticos), `sesionesv9formatotracker.json` (schema viejo).

## 1. Veredicto general

- **El tracker v9 funciona** y su modelo de datos (localStorage, registros por quincena+sesión, import/export de plan) es sólido. Tiene **1 bug de CSS real, 2 fallas de integridad de datos y varias carencias para uso serio en Android** (no instalable, sin respaldo, sin timer, pantalla se apaga).
- **El plan de entrenamiento v9 está bien alineado con los objetivos de salud acordados** (pérdida de peso primero, AOS moderada sin tratar, lumbar gobernada). No requiere cambios de contenido, solo completarlo → **v9.1** (`plan-sesiones-v9.1.json` en esta carpeta).
- `sesionesv9formatotracker.json` usa un schema viejo (`id/label/dur/exercises`) que **no pasa el `validPlan()` del tracker**: se descarta como fuente; solo se rescató su campo `dur` por sesión.

## 2. Bugs del tracker (confirmados en el código)

| # | Severidad | Bug | Detalle |
|---|-----------|-----|---------|
| B1 | Media | `var(--stop)` no existe | `.lbtn.on[data-l="4"]` usa `--stop`, pero la variable definida es `--bad`. El botón lumbar **≥4 (parar)** queda sin borde rojo al activarse — justo el estado de seguridad más importante. |
| B2 | Alta | Registros acoplados al índice del ejercicio | `records` guarda series bajo el índice `ei` sin snapshot del nombre. Si se importa un plan con ejercicios distintos/reordenados: el **CSV exporta nombres equivocados** (`exportCsv` itera el plan actual, no el registro) y el **carry-forward de kg** (`lastDoneFor`) arrastra pesos al ejercicio incorrecto. |
| B3 | Alta | Sin respaldo total de datos | Solo se exporta CSV (lectura) y plan (sin registros). `rg_records`, `rg_weights` y `rg_meta` viven únicamente en localStorage: en Android se pierden al "borrar datos del sitio", cambiar de navegador o desinstalar. Falta **export/import JSON de respaldo completo**. |
| B4 | Media | Fuentes por CDN (Google Fonts) | Sin conexión no cargan. Para uso offline en Android hay que usar stack de sistema o cachearlas vía service worker. |
| B5 | Media | Tendencia de peso asume pesaje diario | El Δ/semana compara las últimas 7 **entradas** contra las 7 anteriores, no días calendario. Con pesajes esporádicos el gobernador "baja >0.7 kg/sem → +150 kcal" puede dispararse mal. Debe calcularse **por fechas**. |
| B6 | Media | No instalable / hostil en móvil | Sin manifest ni service worker (no se puede instalar como app ni funciona offline garantizado); `user-scalable=no` (accesibilidad); sin Wake Lock (la pantalla se apaga a mitad de serie); sin timer de descanso pese a registrar `desc s`. |
| B7 | Baja | Menores | `hasData()` ignora filas con solo RIR/RPE; tocar un ítem del historial cambia `currentQ` sin aviso; los botones Q± están limitados a 1–6 hardcodeado en vez de derivar de `PHASES`; el `PHASES` default del HTML menciona "back squat técnico" en fase 4, que el JSON v9 eliminó (drift entre HTML y JSON: el default embebido debe ser exactamente v9.1). |

## 3. Revisión del plan de entrenamiento v9

**Coherencia con el contexto clínico (se mantiene intacta):**
- AOS moderada no tratada (IAH 15.5/h, supino 33.4/h, carga hipóxica 36.4 %min/h): sin intervalos máximos, tope RPE 7–8, Z2 por talk test, entrenar mañana/mediodía. ✓
- Lumbar: gobernador 2/10 modificar · ≥4 parar, reintroducción graduada de bisagra (S6 con escalones goblet → trap-bar → RDL). ✓
- Pérdida de peso primaria: NEAT como piso diario, finishers Z2 binarios (<50 min), regla de +150 kcal si baja >0.7 kg/sem. ✓
- 7 sesiones × 6 quincenas, fases RIR 3–4 → 1–2, descargas en sem 6 y 12, retos por quincena y retest final. ✓

**Completado en v9.1** (sin tocar contenido de entrenamiento):
1. `dur` (minutos objetivo) por sesión: S1 55 · S2 50 · S3 45 · S4 55 · S5 45 · S6 50 · S7 45 — permite que el tracker compare transcurrido vs objetivo (hoy solo avisa a los 60 min fijos).
2. `warmup` por sesión (5 min estándar + aproximaciones específicas) — el plan no decía cómo entrar a cada sesión.
3. `kg: 12` inicial en KB swing (S2) para prellenar el input (el rango 12–16 ya estaba en el texto).
4. Un **único archivo fuente de verdad** (`plan-sesiones-v9.1.json`); se descartan el duplicado y el schema viejo.

v9.1 sigue siendo 100 % compatible con el tracker actual (`validPlan()` ignora los campos nuevos), así que **se puede importar hoy mismo** sin esperar el v10.

## 4. Mejoras propuestas para el tracker v10 (Android)

Detalladas con criterios de aceptación en `PLAN_EJECUCION_SONNET.md`:

1. **PWA instalable y offline-first** siguiendo el patrón ya probado del repo (`QCSM/`: `index.html` + `manifest.webmanifest` + `sw.js` + ícono SVG). Sigue funcionando como archivo suelto si no se hostea.
2. **Fixes B1–B7** (snapshot de nombre de ejercicio + migración de registros existentes, CSV desde el registro, respaldo/restauración JSON total, Δ peso por fechas, `--bad`, fuentes de sistema, zoom habilitado).
3. **Timer de descanso** con vibración (`navigator.vibrate`) al cumplirse el descanso objetivo.
4. **Wake Lock** durante sesión activa (pantalla encendida en el gimnasio).
5. **Referencia "última vez"** por ejercicio (kg×reps de la última sesión hecha) además del carry-forward.
6. **Registro NEAT (pasos diarios)** con baseline de semana 1 y objetivo +1500–2000 — el plan lo define como piso diario y hoy el tracker no lo captura.
7. **Registro de cintura** (junto al peso) — la fase 6 exige retest de peso/cintura y hoy no hay dónde anotarla.
8. **`dur` objetivo visible** en la sesión, con color de alerta al excederlo.
9. **Plan v9.1 embebido como default** — elimina el drift HTML↔JSON (B7).
