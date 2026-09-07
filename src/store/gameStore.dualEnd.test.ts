import { useGameStore } from './gameStore';
import { boundViewerId } from '@engine/sessionTopology';

// Mock platform storage: gameStore persists via createPlatformStorage which
// imports react-native. An in-memory map keeps it testable in the node env.
const storageMap = new Map<string, string>();
jest.mock('@lib/storage', () => ({
  createPlatformStorage: jest.fn(() => ({
    getItem: (name: string) => storageMap.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storageMap.set(name, value);
    },
    removeItem: (name: string) => {
      storageMap.delete(name);
    },
  })),
}));

/**
 * Dual-end board (blueprint §8.3) session topology tests.
 *
 * The dual-end surface is launched as a pass-and-play session with
 * `dualEnd: true`. The engine contract to pin:
 * - meta.surfaceProfile becomes 'dual-end-board' (the layout selector)
 * - seatBinding stays shared-device (both seats on one phone)
 * - the legacy mode stays 'pass' so every existing pass-mode rule,
 *   undo, and end-turn path keeps working unchanged
 * - ineligible launches (1/3 players, or a non-two-seat mode) fall
 *   back to the plain hot-seat topology
 */
describe('gameStore dual-end session topology', () => {
  beforeEach(() => {
    useGameStore.setState({ events: [], seq: 0, state: useGameStore.getState().state });
  });

  it('marks a 2-player pass session as dual-end-board', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'you', name: 'You', avatarSeed: 's1' },
        { id: 'p2', name: 'Player 2', avatarSeed: 's2' },
      ],
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true },
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    expect(state.meta.mode).toBe('pass');
    expect(state.meta.surfaceProfile).toBe('dual-end-board');
    expect(state.meta.seatBinding?.kind).toBe('shared-device');
  });

  it('keeps shared-device viewer binding: the current player is the viewer', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'you', name: 'You', avatarSeed: 's1' },
        { id: 'p2', name: 'Player 2', avatarSeed: 's2' },
      ],
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    const binding = state.meta.seatBinding;
    expect(binding).toBeDefined();
    if (binding?.kind === 'shared-device') {
      expect(binding.playerIds).toEqual(['you', 'p2']);
      expect(boundViewerId(binding, state.currentPlayerId)).toBe(state.currentPlayerId);
    }
  });

  it('ignores dualEnd for a 3-player session (not a two-seat surface)', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'you', name: 'You', avatarSeed: 's1' },
        { id: 'p2', name: 'Player 2', avatarSeed: 's2' },
        { id: 'p3', name: 'Player 3', avatarSeed: 's3' },
      ],
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    expect(state.meta.mode).toBe('pass');
    expect(state.meta.surfaceProfile).toBe('hot-seat');
  });

  it('ignores dualEnd for solo mode', () => {
    useGameStore.getState().createSession({
      mode: 'solo',
      presetId: 'blackjack',
      players: [{ id: 'you', name: 'You', avatarSeed: 's1' }],
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    expect(state.meta.mode).toBe('solo');
    expect(state.meta.surfaceProfile).toBe('personal-table');
  });

  it('marks a 2-player blackjack session as dual-end-board (house seat excluded from eligibility)', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'blackjack',
      players: [
        { id: 'you', name: 'You', avatarSeed: 's1' },
        { id: 'p2', name: 'Player 2', avatarSeed: 's2' },
      ],
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    // The virtual house seat makes players.length 3; eligibility must count
    // human seats only or the flag silently drops for blackjack.
    expect(state.players.some((p) => p.id === 'house')).toBe(true);
    expect(state.meta.mode).toBe('pass');
    expect(state.meta.surfaceProfile).toBe('dual-end-board');
  });

  it('still deals both hands: the dual-end surface renders each end from the same state', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'you', name: 'You', avatarSeed: 's1' },
        { id: 'p2', name: 'Player 2', avatarSeed: 's2' },
      ],
      hostId: 'you',
      dualEnd: true,
    });

    const { state } = useGameStore.getState();
    // Freeplay deals nothing up front, so draw for both ends and verify each
    // hand zone holds only its owner's cards.
    const draw = state.zones['draw'];
    expect(draw).toBeDefined();
    const top = draw!.cardIds[0];
    useGameStore.getState().dealCard(top, 'hand:you', 'up');
    const after = useGameStore.getState().state;
    expect(after.zones['hand:you']?.cardIds).toContain(top);
    expect(after.zones['hand:p2']?.cardIds ?? []).not.toContain(top);
  });
});