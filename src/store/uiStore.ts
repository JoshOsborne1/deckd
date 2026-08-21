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
  /** Table sound effects (deal/flip/discard/pass/win). Default on, subtle. */
  soundEnabled: boolean;

  setViewMode: (mode: ViewMode) => void;
  /** Jump between shell surfaces without the physical setup/table morph. */
  jumpToViewMode: (mode: ViewMode) => void;
  openPass: (ctx: PassContext) => void;
  closePass: () => void;
  resetToHome: () => void;
  /** Toggle between 'rank' and 'suit' sort modes. */
  toggleHandSortMode: () => void;
  /** Mark the first-run hint as dismissed (persists across launches). */
  dismissFirstRunHint: () => void;
  /** Set the table-sound mute toggle (persists across launches). */
  setSoundEnabled: (v: boolean) => void;
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      viewMode: 'home',
      previousMode: null,
      passContext: null,
      handSortMode: 'rank',
      firstRunHintDismissed: false,
      soundEnabled: true,

      setViewMode: (mode) =>
        set((s) => ({
          viewMode: mode,
          previousMode: s.viewMode === mode ? s.previousMode : s.viewMode,
        })),

      jumpToViewMode: (mode) =>
        set({
          viewMode: mode,
          previousMode: null,
          passContext: null,
        }),

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

      setSoundEnabled: (v) => set({ soundEnabled: v }),
    }),
    {
      name: 'ui:view',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      partialize: (s) => ({
        viewMode: s.viewMode === 'pass' ? 'home' : s.viewMode,
        handSortMode: s.handSortMode,
        firstRunHintDismissed: s.firstRunHintDismissed,
        soundEnabled: s.soundEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        // One-time adoption: the sound toggle previously lived in the
        // profile store (`profile:local`). Adopt a muted preference so
        // existing users don't get sound forced back on.
        if (!state || state.soundEnabled !== true) return;
        try {
          const storage = createPlatformStorage();
          const raw = (storage.getItem as (k: string) => string | null)('profile:local');
          if (!raw) return;
          const old = JSON.parse(raw) as { state?: { soundEnabled?: unknown } };
          const adopted = old?.state?.soundEnabled;
          if (typeof adopted === 'boolean' && !adopted) {
            state.soundEnabled = false;
          }
        } catch {
          // Unreadable old storage — keep the default.
        }
      },
    },
  ),
);
