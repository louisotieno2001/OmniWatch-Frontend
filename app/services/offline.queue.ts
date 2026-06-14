import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_sync_queue';
const PATROL_ID_MAP_KEY = 'patrol_id_temp_mapping';
const ONGOING_PATROL_STORAGE_KEY = 'ongoingPatrol';
const MAX_QUEUE_SIZE = 500;
const MAX_RETRIES = 5;

export interface QueueItem {
  id: string;
  type: 'create_patrol' | 'end_patrol' | 'create_log' | 'checkpoint' | 'location_update';
  endpoint: string;
  method: 'POST' | 'PATCH';
  body: any;
  localPatrolId?: string;
  createdAt: number;
  retries: number;
}

let processingLock = false;

export async function enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retries'>): Promise<boolean> {
  try {
    const queue = await getQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('[OfflineQueue] Queue full, dropping oldest item');
      queue.shift();
    }
    const newItem: QueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      retries: 0,
    };
    queue.push(newItem);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (error) {
    console.error('[OfflineQueue] enqueue error:', error);
    return false;
  }
}

export async function getQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('[OfflineQueue] getQueue error:', error);
    return [];
  }
}

export async function removeItem(id: string): Promise<void> {
  try {
    const queue = await getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OfflineQueue] removeItem error:', error);
  }
}

export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.error('[OfflineQueue] clearQueue error:', error);
  }
}

async function getPatrolIdMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(PATROL_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setPatrolIdMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(PATROL_ID_MAP_KEY, JSON.stringify(map));
}

function substitutePatrolIdInItem(item: QueueItem, map: Record<string, string>): QueueItem {
  if (!item.localPatrolId || !map[item.localPatrolId]) return item;

  const realId = map[item.localPatrolId];
  return {
    ...item,
    endpoint: item.endpoint.replace(item.localPatrolId, realId),
    body: {
      ...item.body,
      patrol_id: realId,
    },
  };
}

export async function processQueue(token: string, apiUrl: string): Promise<void> {
  if (processingLock) {
    return;
  }

  processingLock = true;

  try {
    const originalQueue = await getQueue();
    if (originalQueue.length === 0) return;

    const patrolIdMap = await getPatrolIdMap();
    const processed: string[] = [];
    const retryLater: QueueItem[] = [];
    let mapUpdated = false;
    let aborted = false;

    for (const rawItem of originalQueue) {
      if (aborted) {
        retryLater.push(rawItem);
        continue;
      }

      let item = substitutePatrolIdInItem(rawItem, patrolIdMap);

      try {
        const response = await fetch(`${apiUrl}${item.endpoint}`, {
          method: item.method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item.body),
        });

        if (response.ok) {
          processed.push(item.id);

          if (item.type === 'create_patrol' && item.localPatrolId) {
            const data = await response.json();
            const realPatrolId = data.data?.id || data.id;
            if (realPatrolId && realPatrolId !== item.localPatrolId) {
              patrolIdMap[item.localPatrolId] = realPatrolId;
              mapUpdated = true;

              try {
                const patrolRaw = await AsyncStorage.getItem(ONGOING_PATROL_STORAGE_KEY);
                if (patrolRaw) {
                  const patrolData = JSON.parse(patrolRaw);
                  if (patrolData.patrolId === item.localPatrolId) {
                    patrolData.patrolId = realPatrolId;
                    patrolData.pendingCreate = false;
                    await AsyncStorage.setItem(ONGOING_PATROL_STORAGE_KEY, JSON.stringify(patrolData));
                  }
                }
              } catch (e) {
                console.error('[OfflineQueue] Error updating ongoingPatrol storage:', e);
              }
            }
          }
          continue;
        }

        if (response.status === 401) {
          console.warn('[OfflineQueue] Token expired, aborting queue processing');
          aborted = true;
          retryLater.push(item);
          continue;
        }

        if (response.status >= 400 && response.status < 500) {
          console.warn(`[OfflineQueue] Client error ${response.status} for item ${item.id}, dropping`);
          processed.push(item.id);
          continue;
        }

        if (item.retries >= MAX_RETRIES) {
          console.warn(`[OfflineQueue] Item ${item.id} exceeded max retries, keeping in queue`);
          item.retries = MAX_RETRIES;
          retryLater.push(item);
          continue;
        }

        item.retries += 1;
        retryLater.push(item);
      } catch {
        if (item.retries >= MAX_RETRIES) {
          console.warn(`[OfflineQueue] Item ${item.id} exceeded max retries, keeping in queue`);
          item.retries = MAX_RETRIES;
          retryLater.push(item);
          continue;
        }
        item.retries += 1;
        retryLater.push(item);
      }
    }

    if (aborted) {
      // On abort, re-save the original queue untouched to avoid data loss
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(originalQueue));
      return;
    }

    if (mapUpdated) {
      await setPatrolIdMap(patrolIdMap);
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(retryLater));
  } finally {
    processingLock = false;
  }
}
