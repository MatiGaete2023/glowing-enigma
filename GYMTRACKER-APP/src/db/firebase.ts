import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { replicateFirestore } from 'rxdb/plugins/replication-firestore';
import { getRxDb } from './database.ts';

const firebaseConfig = {
  apiKey: 'AIzaSyDr57QqqiAAbP0t4-29adedeUSJnDvWyC0',
  authDomain: 'gym-tra-6dc6b.firebaseapp.com',
  projectId: 'gym-tra-6dc6b',
  storageBucket: 'gym-tra-6dc6b.firebasestorage.app',
  messagingSenderId: '524809884758',
  appId: '1:524809884758:web:01e7d67354e319c37157f7',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

export type SyncStatus = 'idle' | 'connecting' | 'active' | 'offline' | 'error' | 'disabled';

let _uid: string | null = null;
let _syncStatus: SyncStatus = 'idle';
let _lastSync: number | null = null;
const _statusListeners: Array<(status: SyncStatus) => void> = [];

export function onSyncStatus(cb: (status: SyncStatus) => void): () => void {
  _statusListeners.push(cb);
  cb(_syncStatus);
  return () => {
    const i = _statusListeners.indexOf(cb);
    if (i >= 0) _statusListeners.splice(i, 1);
  };
}

function setStatus(s: SyncStatus): void {
  _syncStatus = s;
  _statusListeners.forEach(cb => cb(s));
}

export async function initFirebaseSync(enabled: boolean): Promise<void> {
  if (!enabled) { setStatus('disabled'); return; }

  setStatus('connecting');

  try {
    await new Promise<void>((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, user => {
        if (user) { _uid = user.uid; unsub(); resolve(); }
      });
      signInAnonymously(auth).catch(err => { unsub(); reject(err); });
    });
  } catch (err) {
    console.warn('Firebase auth failed:', err);
    setStatus('offline');
    return;
  }

  if (!_uid) { setStatus('error'); return; }

  // Expose uid for settings display
  (window as unknown as Record<string, unknown>).__gymUid = _uid;

  const db = await getRxDb();
  const cols = ['records', 'weights', 'waist', 'steps', 'settings'] as const;

  for (const col of cols) {
    const rxCol = (db as unknown as Record<string, unknown>)[col];
    if (!rxCol) continue;

    try {
      const replication = replicateFirestore({
        replicationIdentifier: `gymtracker-${col}-${_uid}`,
        collection: rxCol as Parameters<typeof replicateFirestore>[0]['collection'],
        firestore: {
          projectId: firebaseConfig.projectId,
          database: firestore,
          collection: collection(firestore, `gymtracker/${_uid}/${col}`),
        },
        pull: {},
        push: {},
        live: true,
        deletedField: '_deleted',
      });

      replication.active$.subscribe(() => {
        setStatus('active');
        _lastSync = Date.now();
      });
      replication.error$.subscribe(err => {
        console.warn(`Replication error (${col}):`, err);
        setStatus('error');
      });
    } catch (err) {
      console.warn(`Replication setup failed (${col}):`, err);
    }
  }
}

export function getUid(): string | null { return _uid; }
