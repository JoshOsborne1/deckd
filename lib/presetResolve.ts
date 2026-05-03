import type { UserPreset } from '@engine/customPresets';
import { builtinPresets } from '@engine/index';

/**
 * Maps library default id (builtin or user-preset uuid) to an engine `presetId`
 * understood by `findPreset` (always a built-in id).
 */
export function resolvePresetForSession(defaultId: string, userPresets: UserPreset[]): string {
  if (builtinPresets.some((p) => p.id === defaultId)) {
    return defaultId;
  }
  const user = userPresets.find((p) => p.id === defaultId);
  return user?.basedOn ?? 'freeplay';
}
