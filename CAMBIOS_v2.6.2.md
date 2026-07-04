# Cambios v2.6.2 — sobre los archivos de producción CSM (v2.6.1, PWA)

Base: ZIP `QCSM` subido por el admin (index.html + sw.js + manifest + icono). Ahora el repo
tiene **QCSM/** (sala `quiniela/csm`) y **QDEL44/** (gemelo, sala `quiniela/main`); solo
difieren en `ROOM_DOC`/`APP` (verificado con `tools/check_ab.py`).

## Bug P89 (Paraguay vs Francia mostraba RD Congo y "no se podía arreglar")
Dos causas, ambas corregidas en `resolveTeams`:
1. **La resolución automática "Ganador P74" ignoraba los cruces manuales de 32avos**: se
   calculaba con los equipos del calendario base, no con los que el admin ingresó. Ahora los
   overrides de r32 se aplican ANTES de resolver W/L de r16+ (si los cruces están bien
   cargados, P89 se corrige solo).
2. **El override manual del admin en r16+ se descartaba** cuando la fuente ya estaba resuelta
   (el comentario decía "SIEMPRE ganan" pero el código lo impedía). Ahora el override del
   admin siempre gana (los valores tipo placeholder "Ganador P74" no se aplican como override).
   → El admin puede escribir Paraguay / Francia en P89, Guardar, y queda fijo.

Extra: `midByMatchNum` ahora resuelve colisiones de número (tras renumerar con matchEdits)
prefiriendo el número asignado explícitamente por el admin.

## Mejoras aplicadas de la revisión anterior (aplicables a esta versión)
- **Rendimiento**: `audit()` ya no sube el array completo de logs (800) a Firestore en cada
  vista; los eventos importantes (LOGIN, PREDICTION_*, IMPORT, etc.) suben de inmediato y el
  resto como mucho cada 60 s.
- **Privacidad**: `importData` cifra PIN/clave (`hardenSecretsInPlace`) ANTES de escribir a la
  nube (antes subía texto plano momentáneamente).

## UX / gamificación
- **Inicio**: tarjeta "⏰ Tu próximo pendiente" con cuenta regresiva y CTA directo.
- **Pronósticos**: chips "Todos los abiertos / 🟡 Solo mis pendientes".

## Versionado
- `appVersion` 2.6.1 → **2.6.2** y caché del service worker `v2-6-1` → `v2-6-2`
  (imprescindible para que la PWA instalada descargue el index nuevo).

## Verificación (jsdom)
Reproducido el síntoma exacto (P89 = RD Congo con cruces revueltos) y confirmado: el auto usa
los cruces reales del admin, y el override manual gana (P89 = Paraguay vs Francia). Regresión
`earnedPtsFor` +5 intacta; `scoreAdjustments` (−4) sigue aplicando al total; los bloques UX
nuevos renderizan. `stateLooksSafe`/`cloudSnapshot`/reglas Firestore (anti-borrado) intactos.

## Deploy
1. `QCSM/` → quinelacsm.netlify.app (las 4 piezas: index.html, sw.js, manifest, icono).
2. `QDEL44/` → quineladel44.netlify.app (idem) — la base 2.6.2 aplica a ambas salas.
3. En P89: si sigue mostrando mal los equipos, escribirlos en el panel admin y Guardar (ahora queda).
