# Offline Patrol Recording — Implementation Plan

## Overview
Allow guards to record patrols (start, track location, create logs, submit checkpoints) without internet. When connectivity returns, data syncs to the backend automatically.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    guard_dash.tsx                    │
│  toggleRecording()  createLog()  submitCheckpoint() │
│         │               │              │            │
│    ┌────▼───────────────▼──────────────▼────┐       │
│    │  online? → fetch() directly            │       │
│    │  offline? → enqueue to AsyncStorage    │       │
│    └────────────────┬───────────────────────┘       │
│                     │                               │
│                     ▼                               │
│             OfflineQueue service                     │
│        (app/services/offline.queue.ts)              │
│        ┌──────────────────────────────┐             │
│        │  queue: { id, type, body,   │             │
│        │          timestamp }[]      │             │
│        │  enqueue()  processQueue()  │             │
│        │  getQueueSize()             │             │
│        └──────────────────────────────┘             │
│                     │                               │
│                     ▼                               │
│            NetworkStatus hook                        │
│        (app/services/network.ts)                    │
│        ┌──────────────────────────────┐             │
│        │  @react-native-community/    │             │
│        │  netinfo                     │             │
│        │  isOnline → processQueue()  │             │
│        └──────────────────────────────┘             │
└─────────────────────────────────────────────────────┘
```

## Files to Create

### 1. `app/services/offline.queue.ts`
AsyncStorage-backed FIFO queue. Each item:
```ts
interface QueueItem {
  id: string;
  type: 'create_patrol' | 'end_patrol' | 'create_log' | 'checkpoint';
  endpoint: string;
  method: 'POST' | 'PATCH';
  headers: Record<string, string>;
  body: any;
  patrolId?: string;        // local temp ID for linking
  createdAt: number;
  retries: number;
}
```

API:
- `enqueue(item)` — push to queue
- `dequeue()` — pop first item
- `peek()` — view first item without removing
- `processQueue(token)` — iterate queue, replay each, remove on success
- `getQueueSize()` — return count
- `clearQueue()` — remove all

### 2. `app/services/network.ts`
Exports:
- `useNetworkStatus()` → `{ isOnline: boolean, isOffline: boolean }`
- `startNetworkMonitor(callback)` — subscribe to NetInfo changes
- `stopNetworkMonitor()` — unsubscribe

### 3. `app/services/patrol.id.store.ts`
Manages mapping between local (temp) patrol IDs and real server-side patrol IDs:
- `assignLocalPatrolId()` → returns UUID
- `mapLocalToServer(localId, serverId)`
- `getServerPatrolId(localId)` → server ID or null
- `clearPatrolIdMap()`

## Files to Modify

### 3. `guard_dash.tsx`

#### `toggleRecording()` — Start
- Generate a local temp patrol ID immediately (no server call)
- Persist to AsyncStorage with `{ patrolId: localId, startTime, locationData: [], pendingCreate: true }`
- Start local tracking right away
- If online: enqueue a `create_patral` operation with full body
- If offline: same — enqueue, it'll replay when connectivity returns

#### `toggleRecording()` — End
- Enqueue an `end_patrol` operation with the full PATCH body
- Stop tracking locally, clear UI state
- The queue will flush the end patrol after the create_patrol succeeds

#### `createLog()`
- If online: POST directly (existing behavior)
- If offline: save log entry to AsyncStorage queue with temp patrol ID
- Show success toast immediately (the user doesn't need to know it's queued)

#### `submitCheckpoint()`
- Currently just shows an Alert, sends nothing
- Change to: enqueue a `checkpoint` operation with area, note, timestamp, patrol ID

#### `flushBufferedCoordinatesToServer()` / `sendPeriodicLocationUpdate()`
- Add online check before sending
- If offline: skip silently (location data stays in the `locationData` state and `ongoingPatrolBackgroundPoints` buffer)
- Do NOT clear the buffer on failure — only clear on successful send

#### New: `processSyncQueue()`
- Called when network transitions from offline → online
- Reads queue, replays operations in order, removes successful ones
- Handles retry logic (max 3 retries per item)

#### New: `syncOnReconnect`
- Use `useEffect` with `isOnline` flag to trigger `processSyncQueue()` when coming online

## Dependencies to Add
- `@react-native-community/netinfo` — network detection

## Data Flow

```
App launch
  ↓
Check AsyncStorage for queued items
  ↓
If online → process queue
  ↓
Guard starts patrol offline
  ↓
Local patrol record created (temp ID)
  ↓
Guard moves, logs checkpoints, creates log entries → all queued locally
  ↓
Guard ends patrol → end patrol op queued
  ↓
Internet returns
  ↓
NetInfo fires callback
  ↓
Queue processor runs:
  1. Create patrol on server → get real patrolId, store mapping
  2. Replace temp IDs in subsequent operations with real patrolId
  3. Send location data
  4. Create logs
  5. Submit checkpoints
  6. Send end patrol
```
