import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const inMemoryStorage = new Map<string, string>();
let persistenceDegraded = false;
let warned = false;

function markPersistenceDegraded(error?: unknown): void {
  persistenceDegraded = true;
  if (!warned && typeof __DEV__ !== 'undefined' && __DEV__) {
    warned = true;
    console.warn('[deckd] durable persistence unavailable; using in-memory storage', error);
  }
}

export function isPersistenceDegraded(): boolean {
  return persistenceDegraded;
}

function createInMemoryStorage(): StateStorage {
  return {
    getItem: (name) => inMemoryStorage.get(name) ?? null,
    setItem: (name, value) => { inMemoryStorage.set(name, value); },
    removeItem: (name) => { inMemoryStorage.delete(name); },
  };
}

export function createPlatformStorage(): StateStorage {
  if (Platform.OS === 'web') {
    return {
      getItem: (name) => {
        try { return localStorage.getItem(name); } catch (error) { markPersistenceDegraded(error); return null; }
      },
      setItem: (name, value) => {
        try { localStorage.setItem(name, value); } catch (error) { markPersistenceDegraded(error); }
      },
      removeItem: (name) => {
        try { localStorage.removeItem(name); } catch (error) { markPersistenceDegraded(error); }
      },
    };
  }

  // Expo Go cannot load NitroModules/MMKV. Native dev clients use MMKV.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as {
      createMMKV: (options: { id: string }) => {
        getString: (name: string) => string | undefined;
        set: (name: string, value: string) => void;
        remove: (name: string) => void;
      };
    };
    const mmkv = createMMKV({ id: 'deckd-store' });
    return {
      getItem: (name) => mmkv.getString(name) ?? null,
      setItem: (name, value) => mmkv.set(name, value),
      removeItem: (name) => mmkv.remove(name),
    };
  } catch (error) {
    markPersistenceDegraded(error);
    return createInMemoryStorage();
  }
}
