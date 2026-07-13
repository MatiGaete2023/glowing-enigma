# Configuración de Firebase para Gym Tracker v11

Esta guía detalla cómo obtener las credenciales de Firebase desde la consola existente y configurarlas en el código de v11. El proyecto Firebase ya existe en el repo (visible en `firebase.json`), así que solo necesitas activar Firestore y obtener el `firebaseConfig`.

## Paso 1: Acceder a la Consola de Firebase

1. Abre [https://console.firebase.google.com](https://console.firebase.google.com) en tu navegador
2. Si tienes múltiples proyectos, busca el proyecto asociado a este repo (mira el nombre en `firebase.json` o la carpeta `.firebase/`)
3. Haz clic en el proyecto para entrar a la consola principal

## Paso 2: Obtener el `firebaseConfig`

Este es el objeto de credenciales públicas que v11 necesita para conectarse a Firestore.

### Opción A: Desde la Configuración de la App (Recomendado)

1. En la consola de Firebase, haz clic en el ícono de engranaje ⚙️ **Configuración del proyecto** (arriba a la izquierda)
2. Ve a la pestaña **Apps** (o **Your apps**)
3. Si no hay una app web registrada, haz clic en **Agregar app** > **Web**
4. Dale un nombre (ej: `Gym Tracker v11`) y registra
5. Se te mostrará un bloque de código con el `firebaseConfig`. Cópialo completo:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### Opción B: Desde Firestore (si ya está creado)

1. Ve a **Firestore Database** en el menú izquierdo
2. Si Firestore aún no existe, crea una instancia (modo de prueba para desarrollo, después pasas a reglas de seguridad en Paso 3)
3. Una vez creada, ve a **Configuración del proyecto** (engranaje) > **Apps** y sigue el paso A

## Paso 3: Configurar Reglas de Seguridad de Firestore

Por defecto, el modo de prueba permite lectura/escritura sin restricción. **NO** lo dejes así en producción. Necesitas reglas que restrinjan por `uid` (autenticación anónima).

### Ir a las Reglas de Firestore

1. En la consola de Firebase, ve a **Firestore Database**
2. Haz clic en la pestaña **Reglas** (Rules)
3. Reemplaza todo el contenido con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Solo permite lectura/escritura del usuario autenticado en su propia colección (uid)
    match /users/{userId}/records/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/weights/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/waist/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/steps/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/plans/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/settings/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Haz clic en **Publicar** (Publish)

**Nota:** Las reglas anteriores usan la estructura `/users/{userId}/collectionName/` donde `userId` es el UID anónimo de Firebase. En el código de v11 (E3), la replicación RxDB⟷Firestore manejará automáticamente este prefijo.

## Paso 4: Habilitar Autenticación Anónima

1. Ve a **Autenticación** (Authentication) en el menú izquierdo
2. Haz clic en la pestaña **Método de acceso** (Sign-in method)
3. Si no ves **Anónimo** en la lista, haz clic en **Agregar método** > **Anónimo** y actívalo
4. Guarda

## Paso 5: Copiar el `firebaseConfig` al Código de v11

En `GYMTRACKER/index.html` (o en el archivo `config.ts` si lo creas en E1), busca la sección de inicialización de Firebase:

```javascript
// Busca o reemplaza esta sección:
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Pega el `firebaseConfig` que copiaste en Paso 2, reemplazando los valores de ejemplo.

## Paso 6: Verificación

Una vez que el código de v11 (fase E3) esté implementado y ejecutado:

1. Abre la app en el navegador o emulador Android
2. Realiza una sesión de entrenamiento (esto debería crear registros en `rg_records`)
3. En la consola de Firebase, ve a **Firestore Database**
4. Deberías ver documentos en `/users/{uid}/records/` con los datos que acabas de crear
5. Si importas un respaldo JSON en el onboarding, verás colecciones `weights`, `waist`, `steps`, `plans`, etc. pobladas

## Referencia: Estructura de Datos en Firestore

El código de v11 (E2 y E3) replicará automáticamente las siguientes colecciones desde RxDB a Firestore bajo `/users/{uid}/`:

- **records** — entrenamientos (mismo schema que `rg_records` en localStorage v10)
- **weights** — pesajes (mismo schema que `rg_weights` en localStorage v10)
- **waist** — circunferencia de cintura (nuevo en v11)
- **steps** — pasos diarios + NEAT (nuevo en v11)
- **plans** — versión del plan importado (metadata, no replicar sesiones individualmente)
- **settings** — preferencias del usuario (volumen sonido, zona de activación cardíaca, etc.)

No necesitas crear estas colecciones manualmente — RxDB las crea automáticamente cuando el código las usa.

## Solución de Problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| "Auth error: code=permission-denied" | Reglas de Firestore demasiado restrictivas o UID no coincide | Verifica que las reglas usen `request.auth.uid == userId` y que la ruta sea `/users/{uid}/colección/` |
| Datos no se sincronizan | Replicación RxDB no iniciada | En E3, verifica que `replicateFirestore()` se llama después de `initRxDb()` y autenticación anónima |
| Firestore no existe | Proyecto Firebase existe pero sin Firestore habilitada | Crea una instancia Firestore (Paso 2) |
| `firebaseConfig` indefinido | No pegaste el config en el código | Verifica que el `firebaseConfig` esté antes de `initializeApp(firebaseConfig)` |

## Notas para Sonnet 4.6

- El `firebaseConfig` contiene solo claves públicas (apiKey, projectId, etc.), no tokens secretos. Es seguro comitear en el repo.
- Las reglas de Firestore son la capa de seguridad real — la app solo puede escribir/leer datos propios (filtrados por `uid`).
- En desarrollo local, puedes usar el emulador Firebase (`firebase emulators:start`) para testing sin conectar a la consola en la nube (instrucciones en `firebase --help` o [documentación oficial](https://firebase.google.com/docs/emulator-suite)).
- Para producción (APK sideload), considera habilitar App Check (Firebase Console > Project Settings > App Check) para vincular la app firmada al proyecto y prevenir abuse.
