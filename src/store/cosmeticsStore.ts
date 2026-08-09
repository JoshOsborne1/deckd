import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';
import {
  BUILTIN_CARD_BACKS,
  BUILTIN_TABLE_THEMES,
  findBackById,
  findTableThemeById,
  type RuntimeVisualConfig,
} from '@engine/visuals';

const DEFAULT_BACK_ID = 'back-brand';
const DEFAULT_TABLE_THEME_ID = 'theme-ivory';
const DEFAULT_DECK_ID = 'deck-standard-52';

export interface CosmeticsState extends RuntimeVisualConfig {
  ownedBackIds: string[];
  ownedTableThemeIds: string[];
  hasMasterPass: boolean;

  equipBack: (backId: string) => boolean;
  equipTableTheme: (themeId: string) => boolean;
  unlockBack: (backId: string) => void;
  unlockTableTheme: (themeId: string) => void;
  setMasterPass: (enabled: boolean) => void;
  resetCosmetics: () => void;
}

function defaultOwnedBacks(): string[] {
  return BUILTIN_CARD_BACKS.filter((b) => b.unlockedByDefault).map((b) => b.id);
}

function defaultOwnedThemes(): string[] {
  return BUILTIN_TABLE_THEMES.filter((t) => t.unlockedByDefault).map((t) => t.id);
}

function defaultCosmetics(): Pick<
  CosmeticsState,
  'equippedBackId' | 'equippedTableThemeId' | 'equippedDeckId' | 'ownedBackIds' | 'ownedTableThemeIds' | 'hasMasterPass'
> {
  return {
    equippedBackId: DEFAULT_BACK_ID,
    equippedTableThemeId: DEFAULT_TABLE_THEME_ID,
    equippedDeckId: DEFAULT_DECK_ID,
    ownedBackIds: defaultOwnedBacks(),
    ownedTableThemeIds: defaultOwnedThemes(),
    hasMasterPass: false,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export const useCosmeticsStore = create<CosmeticsState>()(
  persist(
    (set, get) => ({
      ...defaultCosmetics(),

      equipBack: (backId) => {
        if (!findBackById(backId) || !get().ownedBackIds.includes(backId)) return false;
        set({ equippedBackId: backId });
        return true;
      },
      equipTableTheme: (themeId) => {
        if (!findTableThemeById(themeId) || !get().ownedTableThemeIds.includes(themeId)) return false;
        set({ equippedTableThemeId: themeId });
        return true;
      },
      unlockBack: (backId) => {
        if (!findBackById(backId)) return;
        set((s) => ({ ownedBackIds: unique([...s.ownedBackIds, backId]) }));
      },
      unlockTableTheme: (themeId) => {
        if (!findTableThemeById(themeId)) return;
        set((s) => ({ ownedTableThemeIds: unique([...s.ownedTableThemeIds, themeId]) }));
      },
      setMasterPass: (enabled) => set({ hasMasterPass: enabled }),
      resetCosmetics: () => set(defaultCosmetics()),
    }),
    {
      name: 'cosmetics:runtime',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      partialize: (s) => ({
        equippedBackId: s.equippedBackId,
        equippedTableThemeId: s.equippedTableThemeId,
        equippedDeckId: s.equippedDeckId,
        ownedBackIds: s.ownedBackIds,
        ownedTableThemeIds: s.ownedTableThemeIds,
        hasMasterPass: s.hasMasterPass,
      }),
      migrate: (persisted): ReturnType<typeof defaultCosmetics> => {
        const next = defaultCosmetics();
        if (!persisted || typeof persisted !== 'object') return next;
        const old = persisted as Partial<ReturnType<typeof defaultCosmetics>>;
        const ownedBackIds = unique([...(old.ownedBackIds ?? []), ...defaultOwnedBacks()]);
        const ownedTableThemeIds = unique([...(old.ownedTableThemeIds ?? []), ...defaultOwnedThemes()]);
        const equippedBackId =
          old.equippedBackId && ownedBackIds.includes(old.equippedBackId) ? old.equippedBackId : DEFAULT_BACK_ID;
        const equippedTableThemeId =
          old.equippedTableThemeId && ownedTableThemeIds.includes(old.equippedTableThemeId)
            ? old.equippedTableThemeId
            : DEFAULT_TABLE_THEME_ID;
        return {
          equippedBackId,
          equippedTableThemeId,
          equippedDeckId: old.equippedDeckId ?? DEFAULT_DECK_ID,
          ownedBackIds,
          ownedTableThemeIds,
          hasMasterPass: old.hasMasterPass ?? false,
        };
      },
    },
  ),
);
