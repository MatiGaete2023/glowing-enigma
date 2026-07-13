# Empaquetado Android (Capacitor)

Requisitos: **Node 18+**, **Java 17+ (JDK)** y **Android SDK** (con Android Studio o solo
las command-line tools). Todo esto se hace en una computadora, no en el teléfono.

## Opción A — APK nativo con Capacitor

```bash
cd GYMTRACKER-APP
npm install

# 1. Inicializar Capacitor (una sola vez)
npx cap init "Gym Tracker" "cl.gymtracker" --web-dir=dist

# 2. Agregar la plataforma Android (una sola vez)
npx cap add android

# 3. Compilar la web y copiarla al proyecto Android (cada vez que cambies código)
npm run build
npx cap sync android

# 4a. Con Android Studio
npx cap open android      # Run ▶ en emulador o teléfono conectado por USB

# 4b. Sin Android Studio (solo SDK + gradle)
cd android && ./gradlew assembleDebug
# APK en: android/app/build/outputs/apk/debug/app-debug.apk
```

Instala el APK copiándolo al teléfono (activar "Orígenes desconocidos") o con
`adb install app-debug.apk`.

### Permisos que pedirá la app

| Permiso | Para qué |
|---------|----------|
| Notificaciones | Aviso de fin de descanso con la app en segundo plano |
| Bluetooth / dispositivos cercanos | Banda de frecuencia cardíaca (BLE) |
| Health Connect (READ_STEPS, READ_WEIGHT) | Importar pasos y peso automáticos |

### Nota sobre Health Connect

`src/health/healthConnect.ts` espera un plugin Capacitor llamado `HealthConnect` con
`checkAvailability / requestPermission / readSteps / readWeight`. Instala un plugin
compatible (p. ej. `capacitor-health-connect`) y ajusta el mapeo si sus métodos difieren.
Si el plugin no está, la app lo detecta y oculta la función — nada se rompe.

## Opción B — PWA (sin computadora potente, sin SDK)

La app ya es una PWA instalable. Hostea `dist/` en cualquier estático (Netlify, igual que
la quiniela) y en el teléfono: Chrome → menú ⋮ → **"Instalar aplicación"**.

Limitaciones de la PWA frente al APK: sin notificaciones locales programadas con la app
cerrada, sin Health Connect, y el BLE depende de Web Bluetooth (Chrome Android sí lo trae).

## Migrar datos desde v10

1. En el tracker v10: Historial → **Respaldo completo** (descarga JSON `schema: 1`).
2. En v11, primera apertura: **"Importar respaldo anterior"** y elegir ese archivo.
   (También disponible después en Historial → Restaurar respaldo.)
