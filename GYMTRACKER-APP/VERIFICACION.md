# Verificación GYMTRACKER-APP v11

## Automática (reproducible)

```bash
cd GYMTRACKER-APP
npm run check    # typecheck estricto: sin errores
npm test         # 19 tests Vitest: todos pasan
npm run build    # producción: compila sin errores
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

## Pendiente manual (requiere hardware)

- Banda HR BLE real (servicio 0x180D) en Android.
- Health Connect con plugin nativo instalado (ver ANDROID.md).
- Notificación de fin de descanso con la app en segundo plano (APK).
- Reglas de seguridad de Firestore publicadas para `gymtracker/{uid}/**` (ver
  ../GYMTRACKER/FIREBASE_SETUP.md).
