import type { Preset } from './presets';

export interface UserPreset {
  id: string;
  basedOn: string;
  name: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
}

export type UserPresetPatch = Partial<Pick<UserPreset, 'name' | 'summary'>>;

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
