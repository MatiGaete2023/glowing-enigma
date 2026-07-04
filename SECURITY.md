# Seguridad — Quiniela Mundial 2026

## Modelo actual: "confianza entre amigos"

La app es un único `index.html` que corre 100% en el navegador y sincroniza con
Firestore **sin Firebase Authentication**. Por lo tanto:

- La protección de administrador (clave hasheada + guardas `requireAdmin` en cada
  función administrativa) es **disuasoria**, no seguridad fuerte. Evita el uso
  accidental y el abuso casual desde la consola, pero un usuario técnico decidido
  con el `FIREBASE_CONFIG` (que es público en el HTML) podría escribir en Firestore
  saltándose la UI.
- Los PIN de jugadores y la clave admin se guardan **hasheados** (no en texto
  plano) en el estado, en los respaldos y en la nube. El hash es de nivel "amigos"
  (ofusca; no resiste fuerza bruta de un PIN de 4 dígitos).

## Endurecimiento aplicado en la app

- `requireAdmin(...)` al inicio de toda función administrativa
  (`saveResult`, `toggleLock`, `changeAdminPass`, `setApiUrl`, `setAutoApi`,
  `fetchApiNow(manual)`, `importData`, descargas CSV, auditoría por jugador,
  boletín, recordatorios). Los intentos denegados quedan en auditoría (`ADMIN_DENIED`).
- PIN/clave admin hasheados; el PIN no se muestra al editar; los secretos se cifran
  **antes** de subir un respaldo importado a la nube.
- Identidad de sala en `meta.appId` / `meta.roomDoc`: el estado local de otra sala
  se descarta y `mergeDefaults` re-sella la identidad correcta (anti-mezcla).

## Reglas de Firestore (`firestore.rules`)

Versionadas en el repo. Limitan el acceso a `quiniela/main` y `quiniela/csm`,
bloquean cualquier otra ruta, imponen un tope de tamaño y exigen coherencia de
`meta.roomDoc`. **No** pueden distinguir admin de jugador (no hay Auth).

### Desplegar

```bash
npm i -g firebase-tools
firebase login
firebase use <tu-project-id>     # crea/edita .firebaserc
firebase deploy --only firestore:rules
```

(El repo no incluye `.firebaserc` para no fijar el project id; créalo con
`firebase use --add`.)

## Plan para seguridad REAL (si se requiere)

1. **Firebase Auth anónima** para cada cliente + un *custom claim* `admin` asignado
   por una Cloud Function protegida (o lista de UIDs admin).
2. Mover la escritura de `results`, `locks`, `config`, `apiApplied` a **Cloud
   Functions** (Callable) que verifiquen el rol admin en el servidor.
3. En `firestore.rules`, permitir que los jugadores solo modifiquen
   `competitors.<suId>.preds` y su podio, y que `results`/`locks`/`config` solo
   los escriba el rol admin.
4. Activar **App Check** para limitar el uso del proyecto a tu app.
