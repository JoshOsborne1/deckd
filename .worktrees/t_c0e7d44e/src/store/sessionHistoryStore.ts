import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';

export interface SessionHistoryEntry {
  at: number;
  sessionId: string;
  presetId: string;
  eventCount: number;
  playerCount: number;
}

const MAX_ENTRIES = 12;

interface SessionHistoryState {
  entries: SessionHistoryEntry[];
  /** Call when starting a new session while a previous one was active (e.g. Deal now from hub). */
  appendEndedSession: (input: Omit<SessionHistoryEntry, 'at'>) => void;
  clear: () => void;
}

export const useSessionHistoryStore = create<SessionHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      appendEndedSession: (input) =>
        set((s) => ({
          entries: [
            { ...input, at: Date.now() },
            ...s.entries.filter((e) => e.sessionId !== input.sessionId),
          ].slice(0, MAX_ENTRIES),
        })),

      clear: () => set({ entries: [] }),
    }),
    {
      name: 'session:history',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
