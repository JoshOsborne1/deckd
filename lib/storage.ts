import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const inMemoryStorage = new Map<string, string>();

function createInMemoryStorage(): StateStorage {
  return {
    getItem: (name) => inMemoryStorage.get(name) ?? null,
    setItem: (name, value) => {
      inMemoryStorage.set(name, value);
    },
    removeItem: (name) => {
      inMemoryStorage.delete(name);
    },
  };
}

export function createPlatformStorage(): StateStorage {
  if (Platform.OS === 'web') {
    return {
      getItem: (name) => {
        try { return localStorage.getItem(name); } catch { return null; }
      },
      setItem: (name, value) => {
        try { localStorage.setItem(name, value); } catch {}
      },
      removeItem: (name) => {
        try { localStorage.removeItem(name); } catch {}
      },
    };
  }

  // Native (dev client / prebuild): MMKV.
  // Expo Go cannot load NitroModules, so gracefully fall back.
  try {
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
  } catch {
    return createInMemoryStorage();
  }
}
