import {
  getDrawerMotion,
  getSurfaceTransitionKind,
  isSurfaceTableTransition,
} from './surfaceMorph';

describe('surface morph transition contract', () => {
  it('maps hub and lobby entry into the table morph', () => {
    expect(getSurfaceTransitionKind('table', 'hub')).toBe('hub-table');
    expect(getSurfaceTransitionKind('table', 'lobby')).toBe('lobby-table');
  });

  it('does not classify unrelated surface changes as table morphs', () => {
    expect(getSurfaceTransitionKind('table', 'home')).toBe('idle');
    expect(isSurfaceTableTransition('idle')).toBe(false);
    expect(isSurfaceTableTransition('hub-table')).toBe(true);
  });

  it('uses a drawer slide for full motion and a fade for reduced motion', () => {
    expect(getDrawerMotion(false)).toEqual({ translateX: 32, opacity: 1 });
    expect(getDrawerMotion(true)).toEqual({ translateX: 0, opacity: 1 });
  });
});
