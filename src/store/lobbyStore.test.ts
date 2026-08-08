/**
 * Lobby store — verifies the relay session wiring without a real socket.
 * The transport is exercised through its callback surface, which is what
 * the store reacts to. A real end-to-end relay test is a separate concern.
 */

import { useLobbyStore } from '@store/lobbyStore';
import type { RelaySession } from '@lib/relayTransport';
import type { RelayPlayerInfo } from '@lib/relayProtocol';

// Capture the callbacks the store registers so we can drive them like the
// transport would. createRelaySession returns a stub RelaySession whose
// role/roomCode we read back through the store.
let capturedCallbacks: {
  onOpen: (s: RelaySession) => void;
  onPlayersChanged: (p: RelayPlayerInfo[]) => void;
  onError: (e: Error) => void;
  onClose: () => void;
  onRoomClosed?: () => void;
  onEventsReceived?: (events: unknown[]) => void;
  onIntentReceived?: (intent: string, payload: unknown, fromClientId?: string) => void;
} | null = null;

jest.mock('@lib/relayTransport', () => ({
  createRelaySession: jest.fn((opts: {
    role: 'host' | 'guest';
    roomCode: string;
    callbacks: typeof capturedCallbacks;
  }) => {
    capturedCallbacks = opts.callbacks;
    return {
      role: opts.role,
      roomCode: opts.roomCode,
      status: 'connecting',
      lastError: null,
      players: [],
      sendEvents: jest.fn(),
      sendIntent: jest.fn(),
      requestSnapshot: jest.fn(),
      close: jest.fn(),
    } as RelaySession;
  }),
  getRelayUrl: jest.fn(() => 'ws://127.0.0.1:8080'),
}));

beforeEach(() => {
  useLobbyStore.setState({
    session: null,
    status: 'idle',
    roomCode: '',
    players: [],
    lastError: null,
    localClientId: '',
  });
  useLobbyStore.getState().registerGameSyncHandlers({});
  capturedCallbacks = null;
});

describe('lobbyStore', () => {
  it('hostLobby sets connecting status and a room code', () => {
    useLobbyStore.getState().hostLobby('Alice');
    const s = useLobbyStore.getState();
    expect(s.status).toBe('connecting');
    expect(s.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(s.session).not.toBeNull();
  });

  it('onOpen flips status to connected and captures room code', () => {
    useLobbyStore.getState().hostLobby('Alice');
    const fakeSession = {
      role: 'host' as const,
      roomCode: 'WXYZ23',
      status: 'connected' as const,
      lastError: null,
      players: [],
      sendEvents: jest.fn(),
      sendIntent: jest.fn(),
      requestSnapshot: jest.fn(),
      close: jest.fn(),
    } as RelaySession;
    capturedCallbacks!.onOpen(fakeSession);
    const s = useLobbyStore.getState();
    expect(s.status).toBe('connected');
    expect(s.roomCode).toBe('WXYZ23');
    expect(s.lastError).toBeNull();
  });

  it('onPlayersChanged updates the player roster', () => {
    useLobbyStore.getState().hostLobby('Alice');
    const roster: RelayPlayerInfo[] = [
      { clientId: 'c1', nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'c2', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ];
    capturedCallbacks!.onPlayersChanged(roster);
    expect(useLobbyStore.getState().players).toEqual(roster);
  });

  it('onError sets error status and message', () => {
    useLobbyStore.getState().hostLobby('Alice');
    capturedCallbacks!.onError(new Error('boom'));
    const s = useLobbyStore.getState();
    expect(s.status).toBe('error');
    expect(s.lastError).toBe('boom');
  });

  it('onClose resets session and players', () => {
    useLobbyStore.getState().hostLobby('Alice');
    capturedCallbacks!.onPlayersChanged([
      { clientId: 'c1', nickname: 'Alice', isHost: true, joinedAt: 1 },
    ]);
    capturedCallbacks!.onClose();
    const s = useLobbyStore.getState();
    expect(s.session).toBeNull();
    expect(s.status).toBe('closed');
    expect(s.players).toEqual([]);
  });

  it('joinLobby uppercases and trims the code', () => {
    useLobbyStore.getState().joinLobby('  wxyz23  ', 'Bob');
    const s = useLobbyStore.getState();
    expect(s.roomCode).toBe('WXYZ23');
    expect(s.status).toBe('connecting');
  });

  it('leaveLobby resets to idle', () => {
    useLobbyStore.getState().hostLobby('Alice');
    useLobbyStore.getState().leaveLobby();
    const s = useLobbyStore.getState();
    expect(s.session).toBeNull();
    expect(s.status).toBe('idle');
    expect(s.roomCode).toBe('');
    expect(s.players).toEqual([]);
  });

  it('hostLobby and joinLobby set localClientId', () => {
    useLobbyStore.getState().hostLobby('Alice');
    expect(useLobbyStore.getState().localClientId).toMatch(/^c-/);
    useLobbyStore.getState().joinLobby('WXYZ23', 'Bob');
    expect(useLobbyStore.getState().localClientId).toMatch(/^c-/);
  });

  it('registerGameSyncHandlers delegates onEventsReceived', () => {
    const received: unknown[][] = [];
    useLobbyStore.getState().registerGameSyncHandlers({
      onEventsReceived: (events) => received.push(events),
    });
    useLobbyStore.getState().hostLobby('Alice');
    capturedCallbacks!.onEventsReceived?.([{ type: 'session/start' } as unknown as never]);
    expect(received).toHaveLength(1);
  });

  it('registerGameSyncHandlers delegates onIntentReceived with fromClientId', () => {
    const intents: { intent: string; from?: string }[] = [];
    useLobbyStore.getState().registerGameSyncHandlers({
      onIntentReceived: (intent, _payload, fromClientId) =>
        intents.push({ intent, from: fromClientId }),
    });
    useLobbyStore.getState().hostLobby('Alice');
    capturedCallbacks!.onIntentReceived?.('request_snapshot', {}, 'guest-1');
    expect(intents).toEqual([{ intent: 'request_snapshot', from: 'guest-1' }]);
  });
});