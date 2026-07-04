# Fusión v2.6.2 — una sola fuente para ambas quinielas

Contexto: la quiniela del 44 (`Q44.zip`, producción real de `quiniela/main`) y la línea de
trabajo `QCSM/` habían **divergido**: cada una acumuló arreglos que la otra no tenía. Esta
actualización las fusiona en una única base compartida, usando **Q44 (producción real) como
fuente de verdad** y aplicando encima los arreglos que solo existían en `QCSM/`.

## Lo que tenía Q44 y le faltaba a QCSM (ya incorporado, sin tocar)
- **Guarda contra datos ficticios del dataset embebido**: el `window.WORLDCUP` embebido trae
  marcadores/goleadores de ejemplo. Q44 ya no los muestra nunca como si fueran reales —
  `wcScore()`, `buildScorers()` y la ficha de partido solo usan el **resultado oficial de la
  quiniela** (o eventos de API real). QCSM aún mostraba el dato ficticio como fallback.
- **Cierre de apuestas sin hora confirmada**: partidos con el centinela de hora (`23:59`)
  cierran a las **00:00 del día** (semántica original del proyecto). QCSM tenía una regresión
  que cerraba a las 23:59 (casi todo el día abierto).
- `stateBelongsHere()` en `importData`: rechaza importar un respaldo de otra sala.
- Limpieza: eliminada una definición duplicada/obsoleta de `openMatchSheet`.

## Lo que tenía QCSM y le faltaba a Q44 (portado en esta fusión)
- **Fix del bug reportado (P89 mostraba el equipo equivocado y "no se podía arreglar")**:
  - `resolveTeams` aplica los cruces manuales de 32avos **antes** de resolver "Ganador P74" en
    octavos+, para que el ganador se calcule con los equipos reales.
  - El override manual del admin en octavos+ **siempre gana** (antes se descartaba si la
    fuente ya estaba "resuelta", que era exactamente el caso que impedía corregir P89).
- `midByMatchNum`: si dos partidos comparten número (tras renumerar con `matchEdits`), se
  prioriza el que tiene el número asignado explícitamente por el admin.
- `hardenSecretsInPlace()` + `importData` cifra PIN/clave **antes** de escribir a la nube.
- `audit()`: throttle de sincronización de logs (eventos importantes al instante, el resto
  cada 60 s como máximo) — evita reescribir el array completo de logs en cada vista de página.
- UX: tarjeta **"⏰ Tu próximo pendiente"** en Inicio (cuenta regresiva + CTA directo) y chips
  **"Todos los abiertos / 🟡 Solo mis pendientes"** en Pronósticos.

## Versionado
`appVersion` y caché del service worker → **2.6.2** en ambas apps (necesario para que las PWA
instaladas bajen la versión nueva).

## Estructura del repo (a partir de ahora)
- `QDEL44/` → quineladel44.netlify.app (`ROOM_DOC='quiniela/main'`)
- `QCSM/` → quinelacsm.netlify.app (`ROOM_DOC='quiniela/csm'`)
- Ambas carpetas contienen `index.html`, `sw.js`, `manifest.webmanifest`, `pwa-icon.svg`.
- `tools/check_ab.py` verifica que **solo difieran** en `ROOM_DOC` y el bloque `APP` (nombre,
  color, tema por defecto). Ejecutar tras cualquier cambio futuro para evitar que ambas apps
  vuelvan a divergir.

## Verificación (jsdom)
Reproducido el síntoma exacto de P89 (RD Congo en vez de Paraguay/Francia) y confirmado
corregido en ambos archivos finales; guarda de datos ficticios intacta; `midByMatchNum` con
colisión de número; `hardenSecretsInPlace` hashea en memoria; throttle de auditoría clasifica
eventos correctamente; regresión `earnedPtsFor` +5 intacta; bloques de UX nuevos renderizan.

## Recomendación de flujo de trabajo
De ahora en más, cualquier arreglo debe aplicarse **una sola vez** y luego regenerarse la otra
carpeta con el mismo patrón de swap de identidad (o editar ambas y correr `check_ab.py`), para
que no vuelvan a divergir como ocurrió esta vez.
