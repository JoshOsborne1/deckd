import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';

/**
 * ViewMode drives the single-surface morph pipeline on `app/index.tsx`.
 *   - home:  ambient stats, shop preview, hero CTA (non-game cosmetic chrome)
 *   - hub:   session setup (preset picker, players, host/join)
 *   - table: active freeplay session
 *   - lobby: BLE discovery & peer list (Phase 5)
 *   - pass:  full-screen privacy veil overlay
 */
export type ViewMode = 'home' | 'hub' | 'table' | 'lobby' | 'pass';

export interface PassContext {
  recipientId: string;
  recipientName: string;
  recipientSeed?: string;
}

export interface UiStoreState {
  viewMode: ViewMode;
  previousMode: ViewMode | null;
  passContext: PassContext | null;
  /** Hand sort mode for freeplay-family games (rank/suit toggle). */
  handSortMode: 'rank' | 'suit';
  /** Whether the first-run hint has been dismissed. Persisted so it only
   *  shows once across app launches. */
  firstRunHintDismissed: boolean;

  setViewMode: (mode: ViewMode) => void;
  openPass: (ctx: PassContext) => void;
  closePass: () => void;
  resetToHome: () => void;
  /** Toggle between 'rank' and 'suit' sort modes. */
  toggleHandSortMode: () => void;
  /** Mark the first-run hint as dismissed (persists across launches). */
  dismissFirstRunHint: () => void;
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      viewMode: 'home',
      previousMode: null,
      passContext: null,
      handSortMode: 'rank',
      firstRunHintDismissed: false,

      setViewMode: (mode) =>
        set((s) => ({
          viewMode: mode,
          previousMode: s.viewMode === mode ? s.previousMode : s.viewMode,
        })),

      openPass: (ctx) =>
        set((s) => ({
          viewMode: 'pass',
          previousMode: s.viewMode === 'pass' ? s.previousMode : s.viewMode,
          passContext: ctx,
        })),

      closePass: () =>
        set((s) => {
          const target =
            s.previousMode && s.previousMode !== 'pass' ? s.previousMode : 'table';
          return {
            viewMode: target,
            previousMode: 'pass',
            passContext: null,
          };
        }),

      resetToHome: () =>
        set({ viewMode: 'home', previousMode: null, passContext: null }),

      toggleHandSortMode: () =>
        set((s) => ({ handSortMode: s.handSortMode === 'rank' ? 'suit' : 'rank' })),

      dismissFirstRunHint: () => set({ firstRunHintDismissed: true }),
    }),
    {
      name: 'ui:view',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      partialize: (s) => ({
        viewMode: s.viewMode === 'pass' ? 'home' : s.viewMode,
        handSortMode: s.handSortMode,
        firstRunHintDismissed: s.firstRunHintDismissed,
      }),
    },
  ),
);
