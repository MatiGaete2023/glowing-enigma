# Quiniela Mundial 2026 — v8 (cambios)

Dos productos, **idénticos en lógica**, que solo difieren en el bloque `APP` / `ROOM_DOC`:

| Archivo | Sala (Firestore) | Tema por defecto | Acento | Título |
|---|---|---|---|---|
| `A_quineladel44_v8.html` | `quiniela/main` | Claro ☀️ | Rojo `#E63946` | **Quiniela del 44** |
| `B_quinelacsm_v8.html` | `quiniela/csm` | Oscuro 🌙 | Azul `#3B82F6` | **Quiniela CSM** |

> Despliegue: renombrar a `index.html` y arrastrar a la carpeta del sitio existente en Netlify (no crear sitio nuevo). Los datos viven en Firebase.

## Qué se arregló / mejoró

1. **Distinción visual entre apps.** Cada quiniela tiene título propio, tema por defecto distinto (una clara / otra oscura), color de acento y una franja de color bajo el header. Lo único que cambia entre archivos es el bloque `APP` al inicio del `<script>`.

2. **Apuestas que "no aparecían" (bug crítico).**
   - `setScore` ahora **lee ambos marcadores desde los inputs** y **deriva el ganador del propio marcador** si el usuario no tocó *Gana/Empate*. Antes, si escribías el marcador sin elegir ganador, no se guardaba nada.
   - `setPred` conserva un marcador escrito a medias al tocar *Gana*.
   - Al escribir el marcador ya **no se pierde el foco** en cada tecla (guardado silencioso + refresco diferido).
   - **Anti‑pérdida en la nube:** un snapshot remoto ya no pisa cambios locales aún sin subir, y se fuerza la subida al cerrar/ocultar la app (`beforeunload`/`pagehide`/`visibilitychange`).

3. **Actualización automática de resultados.**
   - El **marcador en vivo se actualiza solo** (~cada 75 s durante partidos) siempre que haya URL configurada, **sin depender** de "Oficialización automática".
   - Sondeo adaptativo + refresco al volver a la app (focus/visibilidad).
   - `autoApi` viene **activado por defecto** en instalaciones nuevas. *(En salas ya existentes, el admin debe verificar que el check "Oficialización automática" esté encendido.)*
   - Con la oficialización automática apagada, los finales se muestran como "🔴 Final · por confirmar" y el admin los confirma con **Actualizar resultados ahora**.

4. **Partidos fantasma "en vivo" de otro día.** Guardas de fecha (`plausibleLive`, `notFuture`) tanto al recibir datos de la API como al renderizar (`liveOf`): un marcador en vivo solo se muestra si es coherente con el calendario.

5. **Podio más fácil y visible.** Nuevo editor dedicado (`🏆 Editar podio`) accesible tocando el podio del panel o el botón del dashboard, con sus tres selectores y guardado directo.

6. **Alerta emergente** al entrar si el próximo partido jugable no tiene pronóstico o marcador (una vez por partido/sesión).

7. **Transparencia / auditoría.** Se registran ingresos de cada jugador y cambios de pronóstico/marcador (con fecha y hora). Nuevo botón admin **🕓 Descargar registro de actividad (CSV)**. Historial ampliado a 1000 entradas.

8. **Otros.** El calendario auto‑expande el día de hoy **y** el del próximo partido; las tendencias del grupo indican cuántos jugadores apostaron (evita porcentajes engañosos con pocas apuestas).

## Regresión
Las funciones núcleo de puntuación quedaron **byte a byte idénticas** a v7: `computeScores`, `earnedPtsFor`, `actualOutcome`, `winnerOf`, `lockInfo`, `matchStarted`, `officializeBatch`. Verificado además con pruebas funcionales (jsdom): acierto con marcador exacto = **+5**.

---

# v2.0.0 — Plataforma Integral (Centro de información del Mundial)

Evolución **aditiva** sobre v8 (cero pérdida de datos). Misma quiniela + centro de información del Mundial, estadísticas, búsqueda, favoritos, auditoría y panel admin avanzado, todo en el mismo `index.html`.

## Arquitectura
- **R3 — Datos embebidos:** `window.WORLDCUP = {matches, groups, teams, squads, stadiums, playoffs}` + mapas de nombres ES↔EN, inyectados en el HTML (191 KB). Sin red, sin archivos auxiliares.
- **Preprocesamiento único** al iniciar → `window.WORLDCUP_STATS` (`buildScheduleIndexes`, `buildTeamStats`, `buildGroupTables`, `buildStadiumStats`, `buildScorers`, `buildSquadStats`). Las pantallas solo consumen datos precalculados.
- **Migración** (`schemaVersion 2`): respaldo previo en localStorage, migración aditiva, validación de integridad y **rollback** automático si falla. Campos nuevos (`logs`, `favorites`, `meta`) saneados en `mergeDefaults`.

## Navegación
`Inicio · Pronósticos · Tabla · Bracket · Mundial · Más` (el bracket de la quiniela quedó en su propia pestaña; **Mundial** es el centro de información).

## Centro de información (pestaña Mundial)
Sub-pestañas: **Calendario** (Hoy/Mañana/7 días/Todos + filtros equipo/grupo), **Equipos** (ficha con plantel + estadísticas de plantel: edad promedio, más joven/veterano, conteo por posición, clubes, ligas), **Grupos** (tablas PJ/PG/PE/PP/GF/GC/DG/PTS), **Estadios** (capacidad, partidos, goles, promedio, coordenadas), **Estadísticas** (centro estadístico: más goles, menos recibidos, victorias, vallas invictas, goleadores, estadios, partidos con más goles/mayor diferencia), **Buscar** (equipos/jugadores/estadios/grupos, instantáneo) y **★ Favoritos** (acceso rápido).
- **Ficha de partido** enriquecida: grupo, fase, estadio, ciudad, capacidad, hora/zona, marcador + goleadores si está jugado (usa el resultado oficial de la quiniela si existe).

## Boletín WhatsApp (100% local)
Mantiene el contenido anterior y agrega: partidos del día, resultados recientes, próximos, líderes de grupo, goleadores y “Dato Mundial” (estadio más usado, partido con más goles, máximo goleador).

## Auditoría y panel admin
- Registro estructurado `S.logs` (usuario, evento, fecha/hora, página, dispositivo, navegador, versión, datos) para 20+ eventos (APP_OPEN/CLOSE, LOGIN/LOGOUT, PAGE_VIEW, MATCH/TEAM/GROUP/STADIUM/BRACKET/RANKING_VIEW, PREDICTION_CREATE/EDIT/DELETE, PODIUM_EDIT, USER_CREATE/EDIT, SETTINGS_EDIT, SYNC_START/END/FAIL, EXPORT, IMPORT, MIGRATION).
- **Panel de control** admin: usuarios (total/activos/inactivos), pronósticos (completos/incompletos), Mundial (jugados/pendientes/en vivo), sistema (versión/eventos/errores) + feed de actividad.
- Descargas CSV: reporte de apuestas, registro legible y **auditoría detallada**.

## Restricciones (“informar, nunca influir”)
Se eliminaron los indicadores de consenso/porcentajes de apuestas: “Tendencias del grupo” (%A/%B/%E) en la tarjeta en vivo, “⚡ N van por marcador exacto” y la sección de tendencias con % del boletín. Se conserva solo el conteo de **listos/pendientes** (actividad, no qué apostaron).

## Verificación (jsdom)
Builders correctos (goleador top: Messi 3; tablas de grupo; planteles), centro de info y fichas renderizan, auditoría registra eventos con dispositivo/navegador, boletín con secciones Mundial y **sin** porcentajes, favoritos, restricciones aplicadas. **Regresión de puntuación intacta: acierto + marcador exacto = +5.** Núcleo (`computeScores`/`earnedPtsFor`/`officializeBatch`) sin cambios.
