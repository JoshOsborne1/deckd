import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { builtinPresets, type Preset } from '@engine/index';
import { cloneBuiltinToUserPreset, type UserPreset, type UserPresetPatch } from '@engine/customPresets';
import { createPlatformStorage } from '@lib/storage';

interface PresetsPersistedState {
  defaultPresetId: string;
  presets: UserPreset[];
}

export interface PresetsStoreState extends PresetsPersistedState {
  setDefault: (id: string) => void;
  createFromBuiltin: (builtinId: string) => UserPreset;
  updatePreset: (id: string, patch: UserPresetPatch) => void;
  deletePreset: (id: string) => void;
}

const FALLBACK_PRESET_ID = 'freeplay';

function getBuiltinById(builtinId: string): Preset {
  return builtinPresets.find((preset) => preset.id === builtinId) ?? builtinPresets[0]!;
}

export const useUserPresetsStore = create<PresetsStoreState>()(
  persist(
    (set) => ({
      defaultPresetId: FALLBACK_PRESET_ID,
      presets: [],

      setDefault: (id) => set({ defaultPresetId: id || FALLBACK_PRESET_ID }),

      createFromBuiltin: (builtinId) => {
        const builtin = getBuiltinById(builtinId);
        const created = cloneBuiltinToUserPreset(builtin);
        set((state) => ({ presets: [created, ...state.presets] }));
        return created;
      },

      updatePreset: (id, patch) =>
        set((state) => ({
          presets: state.presets.map((preset) => {
            if (preset.id !== id) return preset;
            const nextName =
              typeof patch.name === 'string' && patch.name.trim().length > 0
                ? patch.name.trim()
                : preset.name;
            const nextSummary =
              typeof patch.summary === 'string' && patch.summary.trim().length > 0
                ? patch.summary.trim()
                : preset.summary;
            return {
              ...preset,
              name: nextName,
              summary: nextSummary,
              updatedAt: Date.now(),
            };
          }),
        })),

      deletePreset: (id) =>
        set((state) => {
          const remaining = state.presets.filter((preset) => preset.id !== id);
          const defaultPresetId =
            state.defaultPresetId === id ? FALLBACK_PRESET_ID : state.defaultPresetId;
          return {
            presets: remaining,
            defaultPresetId,
          };
        }),
    }),
    {
      name: 'presets:user-library',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      partialize: (state) => ({
        defaultPresetId: state.defaultPresetId,
        presets: state.presets,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        if (!state.defaultPresetId) {
          state.defaultPresetId = FALLBACK_PRESET_ID;
        }
        if (!Array.isArray(state.presets)) {
          state.presets = [];
        }
      },
    },
  ),
);
