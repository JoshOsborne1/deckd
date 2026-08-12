export type SurfaceMode = 'home' | 'hub' | 'table' | 'lobby' | 'pass';
export type SurfaceTransitionKind = 'idle' | 'hub-table' | 'lobby-table';

export function getSurfaceTransitionKind(
  mode: SurfaceMode,
  previousMode: SurfaceMode | null,
): SurfaceTransitionKind {
  if (mode === 'table' && previousMode === 'hub') return 'hub-table';
  if (mode === 'table' && previousMode === 'lobby') return 'lobby-table';
  return 'idle';
}

export function isSurfaceTableTransition(kind: SurfaceTransitionKind): boolean {
  return kind === 'hub-table' || kind === 'lobby-table';
}

export function getDrawerMotion(reduceMotion: boolean): { translateX: number; opacity: number } {
  return {
    translateX: reduceMotion ? 0 : 32,
    opacity: 1,
  };
}
