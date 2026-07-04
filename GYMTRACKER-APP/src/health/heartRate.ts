import { BleClient } from '@capacitor-community/bluetooth-le';
import { getSettings, saveSettings } from '../db/database.ts';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHARACTERISTIC = '00002a37-0000-1000-8000-00805f9b34fb';

let _connected = false;
let _deviceId: string | null = null;
let _currentPpm = 0;
const _ppmListeners: Array<(ppm: number) => void> = [];

export function onHeartRate(cb: (ppm: number) => void): () => void {
  _ppmListeners.push(cb);
  return () => {
    const i = _ppmListeners.indexOf(cb);
    if (i >= 0) _ppmListeners.splice(i, 1);
  };
}

function parseHR(value: DataView): number {
  const flags = value.getUint8(0);
  if (flags & 0x01) return value.getUint16(1, true);
  return value.getUint8(1);
}

function notifyPpm(ppm: number): void {
  _currentPpm = ppm;
  _ppmListeners.forEach(cb => cb(ppm));
}

export function getCurrentPpm(): number { return _currentPpm; }
export function isHRConnected(): boolean { return _connected; }

export async function connectHR(deviceId?: string): Promise<void> {
  await BleClient.initialize();

  if (!deviceId) {
    const settings = await getSettings();
    deviceId = settings.bleDeviceId;
  }

  if (deviceId) {
    try {
      await BleClient.connect(deviceId, () => { _connected = false; notifyPpm(0); });
      _deviceId = deviceId;
      _connected = true;
    } catch {
      deviceId = undefined;
    }
  }

  if (!deviceId) {
    const device = await BleClient.requestDevice({ services: [HR_SERVICE] });
    await BleClient.connect(device.deviceId, () => { _connected = false; notifyPpm(0); });
    _deviceId = device.deviceId;
    _connected = true;
    await saveSettings({ bleDeviceId: device.deviceId, bleDeviceName: device.name || '' });
  }

  await BleClient.startNotifications(_deviceId!, HR_SERVICE, HR_CHARACTERISTIC, value => {
    notifyPpm(parseHR(value));
  });
}

export async function disconnectHR(): Promise<void> {
  if (!_deviceId) return;
  try {
    await BleClient.stopNotifications(_deviceId, HR_SERVICE, HR_CHARACTERISTIC);
    await BleClient.disconnect(_deviceId);
  } catch { /* ignore */ }
  _connected = false;
  _deviceId = null;
  notifyPpm(0);
}

export function hrZoneClass(ppm: number, age: number): 'z2' | 'above' | '' {
  if (!ppm || !age) return '';
  const maxHR = 220 - age;
  const pct = ppm / maxHR;
  if (pct >= 0.6 && pct <= 0.7) return 'z2';
  if (pct > 0.7) return 'above';
  return '';
}
