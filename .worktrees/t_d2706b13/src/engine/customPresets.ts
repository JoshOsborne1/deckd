import type { Preset } from './presets';
import type { GamePresetManifest } from './manifest';

export interface UserPreset {
  id: string;
  basedOn: string;
  name: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  /** Real manifest if the user has customised beyond metadata */
  manifest?: GamePresetManifest;
}

export type UserPresetPatch = Partial<Pick<UserPreset, 'name' | 'summary'>> & {
  manifest?: GamePresetManifest;
};

export function makeUserPresetId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `user-${timestamp}-${random}`;
}

export function cloneBuiltinToUserPreset(
  builtin: Pick<Preset, 'id' | 'name' | 'summary'>,
): UserPreset {
  const now = Date.now();
  return {
    id: makeUserPresetId(),
    basedOn: builtin.id,
    name: `${builtin.name} (yours)`,
    summary: builtin.summary,
    createdAt: now,
    updatedAt: now,
  };
}

/** Convert a user preset into a manifest, falling back to the builtin it was based on */
export function resolveUserPresetManifest(
  userPreset: UserPreset,
  builtinPresets: Preset[],
): GamePresetManifest | undefined {
  if (userPreset.manifest) {
    return userPreset.manifest;
  }
  const builtin = builtinPresets.find((p) => p.id === userPreset.basedOn);
  if (!builtin) return undefined;
  // Return a minimal manifest derived from the builtin preset
  return {
    id: userPreset.id,
    name: userPreset.name,
    minPlayers: builtin.minPlayers ?? 1,
    maxPlayers: builtin.maxPlayers ?? 8,
    deckId: 'deck-standard-52',
    zones: [],
    setup: [],
    actions: [],
    ui: {
      opponentRing: false,
      deckPiles: true,
      communalZones: false,
      actionBar: 'contextual',
      handPosition: 'bottomFan',
    },
  };
}
