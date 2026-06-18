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
