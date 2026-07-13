# Instalar Gym Tracker desde el teléfono (Netlify Drop)

Estos pasos se hacen **enteros desde el celular**, sin computadora ni comandos.

## 1. Descargar la app ya compilada

1. Abre `github.com/MatiGaete2023/glowing-enigma` en el navegador del teléfono.
2. Cambia a la rama **`claude/tracker-android-training-plan-pqe4kl`** (selector de ramas,
   arriba a la izquierda del listado de archivos).
3. Entra a la carpeta `GYMTRACKER-APP/deploy/`.
4. Abre `gymtracker-v11-dist.zip` → botón **Download** (o los tres puntos → Download).
   Se guarda en la carpeta de Descargas del teléfono.

## 2. Publicar en Netlify Drop

1. Ve a **https://app.netlify.com/drop**.
2. **Inicia sesión primero** (arriba a la derecha — cuenta gratis con Google, GitHub o
   email). Importante: los sitios subidos **sin** haber iniciado sesión se borran solos en
   ~1 hora; con sesión iniciada quedan permanentes.
3. Toca la zona grande que dice "Drag and drop your site output folder here" (o el enlace
   "browse to upload") y elige el archivo `gymtracker-v11-dist.zip` que descargaste.
4. Espera unos segundos — Netlify publica el sitio y muestra una URL parecida a
   `https://algo-al-azar.netlify.app`.
5. *(Opcional)* Para una URL más fácil de recordar: **Site settings** → **Change site
   name** → escribe algo como `mi-gym-tracker` → queda en
   `https://mi-gym-tracker.netlify.app`.

## 3. Instalar como app en el teléfono

1. Abre la URL de tu sitio en **Chrome** (Android).
2. Menú ⋮ (arriba a la derecha) → **"Instalar aplicación"** (o "Agregar a pantalla de
   inicio").
3. Listo — queda un ícono como cualquier otra app, abre en pantalla completa.

## 4. Primera vez: importar tu historial

Si vienes del tracker anterior (v10), en la primera apertura aparece la pantalla de
bienvenida: toca **"Importar respaldo anterior"** y elige el JSON de respaldo que hayas
exportado desde ahí. Si es tu primera vez, toca **"Empezar de cero"**.

## 5. Actualizar la app más adelante

Cuando haya una versión nueva:
1. Repite el paso 1 (descargar el zip actualizado de la misma carpeta del repo).
2. En Netlify, entra a tu sitio → pestaña **Deploys** → arrastra o sube el zip nuevo ahí.
3. La URL **no cambia** — la app instalada en tu teléfono se actualiza sola la próxima vez
   que la abras con conexión (gracias al service worker).

## Limitaciones de esta vía (PWA) frente al APK nativo

- **Sin notificación con la app cerrada**: el timer de descanso suena mientras la app está
  abierta o minimizada recientemente (se reconstruye solo al volver a abrirla), pero no si
  Android mató la app del todo. Para notificación garantizada en segundo plano se necesita
  el APK nativo — ver [ANDROID.md](./ANDROID.md).
- **Sin Health Connect ni banda de frecuencia cardíaca por Bluetooth**: esas integraciones
  requieren el empaquetado nativo con Capacitor.
- Todo lo demás (sesiones, timer, pasos, peso, cintura, historial, respaldo, sincronización
  con Firebase) funciona igual que en el APK.
