import { emptyState } from '@engine/state';
import type { GameState } from '@engine/types';
import { resolveTableSession } from '../../components/table/useTableSession';

jest.mock('@store/lobbyStore', () => ({ useLobbyStore: jest.fn() }));

function publicTableState(): GameState {
  return {
    ...emptyState(),
    meta: {
      id: 'session',
      createdAt: 1,
      rngSeed: '',
      mode: 'online-host',
      hostId: 'host',
      surfaceProfile: 'public-table',
      seatBinding: { kind: 'table-only' },
    },
    players: [{ id: 'host', name: 'Host', seat: 0, avatarSeed: 'host' }],
    currentPlayerId: 'host',
    phase: 'playing',
  };
}

describe('resolveTableSession', () => {
  test('a table-only surface never falls back to the host private viewer', () => {
    const context = resolveTableSession(publicTableState(), 'connected');

    expect(context.viewerId).toBeNull();
    expect(context.hostPlayerId).toBe('host');
  });
});