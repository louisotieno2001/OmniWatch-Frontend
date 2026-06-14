import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

type NetworkCallback = (isConnected: boolean) => void;

let listeners: Set<NetworkCallback> = new Set();
let currentState: boolean | null = null;
let unsubscribe: (() => void) | null = null;

function handleStateChange(state: { isConnected: boolean | null }) {
  const connected = state.isConnected ?? false;
  const wasOffline = currentState === false;
  currentState = connected;

  if (wasOffline && connected) {
    listeners.forEach((cb) => cb(true));
  }
}

function ensureMonitor() {
  if (!unsubscribe) {
    unsubscribe = NetInfo.addEventListener(handleStateChange);
    NetInfo.fetch().then((state) => {
      currentState = state.isConnected ?? false;
    });
  }
}

export function startNetworkMonitor(callback: NetworkCallback): () => void {
  ensureMonitor();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function stopNetworkMonitor(): void {
  listeners.clear();
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  } catch {
    return false;
  }
}

export function useNetworkStatus(): { isOnline: boolean; isOffline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    ensureMonitor();

    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    const remove = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    return () => {
      remove();
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
