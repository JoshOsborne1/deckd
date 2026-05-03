import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';

interface ProfilePersisted {
  nickname: string;
  avatarSeed: string;
  level: number;
  streak: number;
  hapticsEnabled: boolean;
  reduceMotionOverride: boolean;
  gamesPlayed: number;
  /** Optional LAN / relay multiplayer (supplementary to BLE). */
  networkMultiplayerEnabled: boolean;
}

export interface ProfileState {
  nickname: string;
  avatarSeed: string;
  level: number;
  streak: number;
  hapticsEnabled: boolean;
  reduceMotionOverride: boolean;
  gamesPlayed: number;
  networkMultiplayerEnabled: boolean;

  setNickname: (nickname: string) => void;
  setAvatarSeed: (seed: string) => void;
  setHapticsEnabled: (v: boolean) => void;
  setReduceMotionOverride: (v: boolean) => void;
  setNetworkMultiplayerEnabled: (v: boolean) => void;
  bumpGamesPlayed: () => void;
  bumpStreak: () => void;
  resetProfile: () => void;
}

function defaultSeed(): string {
  return `guest-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultProfileValues(): ProfilePersisted {
  return {
    nickname: 'You',
    avatarSeed: defaultSeed(),
    level: 1,
    streak: 0,
    hapticsEnabled: true,
    reduceMotionOverride: false,
    gamesPlayed: 0,
    networkMultiplayerEnabled: false,
  };
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...defaultProfileValues(),

      setNickname: (nickname) => set({ nickname: nickname.trim() || 'You' }),
      setAvatarSeed: (seed) => set({ avatarSeed: seed || defaultSeed() }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setReduceMotionOverride: (v) => set({ reduceMotionOverride: v }),
      setNetworkMultiplayerEnabled: (v) => set({ networkMultiplayerEnabled: v }),
      bumpGamesPlayed: () => set((s) => ({ gamesPlayed: s.gamesPlayed + 1 })),
      bumpStreak: () => set((s) => ({ streak: s.streak + 1 })),
      resetProfile: () => set(defaultProfileValues()),
    }),
    {
      name: 'profile:local',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 3,
      partialize: (s) => ({
        nickname: s.nickname,
        avatarSeed: s.avatarSeed,
        level: s.level,
        streak: s.streak,
        hapticsEnabled: s.hapticsEnabled,
        reduceMotionOverride: s.reduceMotionOverride,
        gamesPlayed: s.gamesPlayed,
        networkMultiplayerEnabled: s.networkMultiplayerEnabled,
      }),
      migrate: (persisted, version): ProfilePersisted => {
        const next = defaultProfileValues();
        if (!persisted || typeof persisted !== 'object') {
          return next;
        }

        const old = persisted as Partial<ProfilePersisted>;
        return {
          nickname: typeof old.nickname === 'string' && old.nickname.trim() ? old.nickname : next.nickname,
          avatarSeed: typeof old.avatarSeed === 'string' && old.avatarSeed ? old.avatarSeed : next.avatarSeed,
          level: typeof old.level === 'number' ? old.level : next.level,
          streak: typeof old.streak === 'number' ? old.streak : next.streak,
          hapticsEnabled:
            version >= 2 && typeof old.hapticsEnabled === 'boolean' ? old.hapticsEnabled : true,
          reduceMotionOverride:
            version >= 2 && typeof old.reduceMotionOverride === 'boolean'
              ? old.reduceMotionOverride
              : false,
          gamesPlayed: version >= 2 && typeof old.gamesPlayed === 'number' ? old.gamesPlayed : 0,
          networkMultiplayerEnabled:
            version >= 3 && typeof old.networkMultiplayerEnabled === 'boolean'
              ? old.networkMultiplayerEnabled
              : false,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        if (!state.nickname.trim()) {
          state.nickname = 'You';
        }
        if (!state.avatarSeed) {
          state.avatarSeed = defaultSeed();
        }
      },
    },
  ),
);
