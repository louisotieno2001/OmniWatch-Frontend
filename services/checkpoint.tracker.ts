import AsyncStorage from '@react-native-async-storage/async-storage';

const SCAN_HISTORY_KEY = 'checkpoint_scan_history';
const LATE_NOTIFIED_KEY = 'checkpoint_late_notified_at';

const COOLDOWN_MINUTES = 15;
const LATE_THRESHOLD_MINUTES = 30;
const MAX_HISTORY_SIZE = 500;
const HISTORY_PURCH_DAYS = 7;

interface ScanRecord {
  area: string;
  timestamp: number;
}

async function trimHistory(history: ScanRecord[]): ScanRecord[] {
  const cutoff = Date.now() - HISTORY_PURCH_DAYS * 86400000;
  const recent = history.filter((s) => s.timestamp >= cutoff);
  return recent.slice(-MAX_HISTORY_SIZE);
}

export async function recordScan(area: string): Promise<void> {
  try {
    const history = await getScanHistory();
    history.push({ area, timestamp: Date.now() });
    const trimmed = await trimHistory(history);
    await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('[CheckpointTracker] recordScan error:', error);
  }
}

export async function getScanHistory(): Promise<ScanRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getLastScanForArea(area: string): Promise<ScanRecord | null> {
  const history = await getScanHistory();
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].area === area) return history[i];
  }
  return null;
}

export async function getMinutesSinceLastScan(area: string): Promise<number | null> {
  const last = await getLastScanForArea(area);
  if (!last) return null;
  return (Date.now() - last.timestamp) / 60000;
}

export async function isOnCooldown(area: string): Promise<boolean> {
  const mins = await getMinutesSinceLastScan(area);
  if (mins === null) return false;
  return mins < COOLDOWN_MINUTES;
}

export async function getMinutesRemainingOnCooldown(area: string): Promise<number> {
  const mins = await getMinutesSinceLastScan(area);
  if (mins === null) return 0;
  return Math.max(0, Math.ceil(COOLDOWN_MINUTES - mins));
}

export async function getLastAnyScan(): Promise<ScanRecord | null> {
  const history = await getScanHistory();
  return history.length > 0 ? history[history.length - 1] : null;
}

export async function getMinutesSinceLastAnyScan(): Promise<number | null> {
  const last = await getLastAnyScan();
  if (!last) return null;
  return (Date.now() - last.timestamp) / 60000;
}

export async function isPastLateThreshold(): Promise<boolean> {
  const mins = await getMinutesSinceLastAnyScan();
  if (mins === null) return false;
  return mins >= LATE_THRESHOLD_MINUTES;
}

export async function getLateNotifiedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LATE_NOTIFIED_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function setLateNotified(): Promise<void> {
  await AsyncStorage.setItem(LATE_NOTIFIED_KEY, Date.now().toString());
}

export async function clearLateNotified(): Promise<void> {
  await AsyncStorage.removeItem(LATE_NOTIFIED_KEY);
}

export async function shouldNotifyLate(): Promise<boolean> {
  const pastThreshold = await isPastLateThreshold();
  if (!pastThreshold) {
    await clearLateNotified();
    return false;
  }

  const lastNotified = await getLateNotifiedAt();
  if (lastNotified && Date.now() - lastNotified < 60000 * LATE_THRESHOLD_MINUTES) {
    return false;
  }

  return true;
}
