# Cambios v2.1 — Quiniela Mundial 2026

Base de trabajo: `A_quineladel44_SAFE.html` / `B_quinelacsm_SAFE.html` (los archivos desplegados,
con el fix de pérdida de datos y el sistema de respaldo en la nube). Solo difieren en `ROOM_DOC`
y el bloque `APP` (verificado con `tools/check_ab.py`).

## Resumen del incidente (ya resuelto en los SAFE, se conserva)
- `.set()` sin `{merge:true}` podía borrar todo el documento. Mitigado con `stateLooksSafe()`,
  `merge:true` en los 3 puntos vulnerables (incluido `importData`), reglas de Firestore que
  impiden vaciar `competitors`/`results` y bloquean el borrado del documento, y respaldos
  rotativos en `quiniela/<sala>_backup`.

## Lo nuevo en esta sesión

### 1. Eliminatorias: selección de "quién avanza" en empates (bug del admin)
El selector existía pero no aparecía: el guard de `renderAdminMatches` (`if activeElement dentro
del panel → no re-render`) abortaba el refresco justo después de guardar el empate provisional.
- Ahora los radios **quién avanza** están siempre en la fila (ocultos) y se **revelan en vivo**
  con `onKoScore()` al teclear un marcador empatado, **sin re-render** (no pierde foco).
- `saveResult` ya no guarda un resultado provisional: si el marcador está empatado y no se eligió
  avance, muestra el selector y avisa; al elegir y volver a Guardar, fija `winner`.
- Además, `saveResult` hace `blur()` antes de aplicar, para que el panel admin muestre de
  inmediato el resultado/avance guardado.

### 2. Centro "Mundial": ahora refleja los resultados reales
Las tablas de grupos, récords de equipos y estadios se calculaban **una sola vez desde el dataset
demo embebido**. Ahora:
- `wcEff(m)` toma el **resultado oficial de la quiniela** (`S.results`), igual que los cruces.
- `rebuildResultStats()` recalcula grupos/equipos/estadios desde `S.results` y se ejecuta al
  entrar a Mundial y al generar el boletín.
- `wcScoreCell` ya no muestra el marcador demo (solo resultado oficial / en vivo / hora).
- (Goleadores queda como "referencial" porque no hay datos reales de goleadores.)

### 3. Editor de partido (equipos + horario), incluso en partidos jugados
Nuevo botón **📅 Editar partido** en cada fila del panel admin → `openMatchEditor(mid)`:
- En eliminatorias: editar **Equipo 1 / Equipo 2** (se guarda como `customTeams`).
- En cualquier fase: editar **fecha y hora** (zona del torneo UTC‑4), guardado en
  `S.schedule` y aplicado a `MATCHES` vía `applyScheduleOverrides()` dentro de `resolveTeams()`
  (afecta cierre de apuestas, calendario, etc.). Botón **Revertir al original**.
- Funciona aunque el partido ya tenga resultado (no lo borra). Útil para horarios mal cargados
  o partidos "sobre" otros ya apostados.

### 4. Ajuste manual de puntos (sanciones) con registro y justificación
Sistema de sanciones/bonificaciones externas:
- Botón **⚖️** por jugador (tabla) → `adjustPoints()`: pide puntos (+/−) y **justificación
  obligatoria**; queda en `competitors.<id>.adjustments[]`, en el historial, en el feed y en la
  auditoría (`POINTS_ADJUST`).
- `computeScores` suma `adj` al total de forma **aditiva** (si no hay ajustes, `adj=0` y el total
  es idéntico → regresión preservada).
- El ajuste se muestra en la tabla (⚖️ ±N) y en la ficha de auditoría del jugador; cualquiera
  puede ver el detalle con `viewAdjustments()`.

## Verificación (jsdom)
- Las 4 funciones nuevas pasan tests dedicados.
- **Datos reales** (respaldo `2026-06-30_2.json`, 7 jugadores / 74 resultados): tabla coherente
  (Muela 169 · Artista 161 · …), Grupo A con resultados reales (México 9 pts), 16 cruces de
  32avos preservados, `m63` sin resultado (a cargar a mano).
- **Regresión**: `earnedPtsFor` marcador exacto = **+5**; `computeScores` sin ajustes da el mismo
  total que antes.

## Próximos pasos del incidente (recordatorio)
1. Desplegar `A_quineladel44_SAFE.html` y `B_quinelacsm_SAFE.html` (renombrar a `index.html`).
2. Publicar `firestore.rules` en Firebase Console.
3. Importar `Quiniela2026_Respaldo_2026-06-30_2.json` (⚙️ Más → admin → Importar JSON).
4. Cargar a mano el resultado de **m63** (Cabo Verde vs Arabia Saudí).
5. **☁️ Crear respaldo en la nube ahora** para establecer la línea base de los snapshots.
