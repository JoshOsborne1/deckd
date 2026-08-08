/**
 * Lobby store — cloud relay session state for multiplayer lobbies.
 *
 * Non-persisted: a relay session is transient. The store owns a single
 * RelaySession and mirrors its connection state + player roster. Hosting
 * requires a Deckd Master pass (enforced by the UI); guests join free.
 *
 * Game sync (event broadcast) is wired through a handler registry: the
 * multiplayer bridge registers handlers via registerGameSyncHandlers, and
 * the transport callbacks (onEventsReceived / onIntentReceived /
 * onSnapshotRequested) delegate to them. This keeps lobbyStore free of
 * gameStore imports — the bridge imports both stores.
 */

import { create } from 'zustand';

import {
  createRelaySession,
  type RelayCallbacks,
  type RelaySession,
} from '@lib/relayTransport';
import { makeRoomCode, type RelayPlayerInfo } from '@lib/relayProtocol';
import type { GameSyncHandlers } from '@store/syncLogic';

export type LobbyStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

export interface LobbyState {
  session: RelaySession | null;
  status: LobbyStatus;
  roomCode: string;
  players: RelayPlayerInfo[];
  lastError: string | null;
  /** This client's relay clientId (set on host/join). Guests use it as viewerId. */
  localClientId: string;

  /** Host: open a new relay room. Pass masterToken only when the server enforces it. */
  hostLobby: (nickname: string, masterToken?: string) => void;
  /** Guest: join an existing room with a code. */
  joinLobby: (roomCode: string, nickname: string) => void;
  /** Leave / close the current session and reset to idle. */
  leaveLobby: () => void;
  /** Register game-sync handlers (called by the multiplayer bridge). */
  registerGameSyncHandlers: (handlers: GameSyncHandlers) => void;
}

/** Singleton handler registry — the transport callbacks delegate here. */
let gameSyncHandlers: GameSyncHandlers = {};

function makeClientId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

function buildCallbacks(set: (partial: Partial<LobbyState>) => void): RelayCallbacks {
  return {
    onOpen: (session) => {
      set({
        session,
        status: 'connected',
        roomCode: session.roomCode,
        lastError: null,
      });
    },
    // Delegate game event/intent/snapshot to the registered bridge handlers.
    onEventsReceived: (events) => {
      gameSyncHandlers.onEventsReceived?.(events);
    },
    onIntentReceived: (intent, payload, fromClientId) => {
      gameSyncHandlers.onIntentReceived?.(intent, payload, fromClientId);
    },
    onPlayersChanged: (players) => {
      set({ players });
    },
    onRoomClosed: () => {
      set({
        session: null,
        status: 'closed',
        players: [],
      });
    },
    onError: (error) => {
      set({ status: 'error', lastError: error.message });
    },
    onClose: () => {
      set({
        session: null,
        status: 'closed',
        players: [],
      });
    },
  };
}

export const useLobbyStore = create<LobbyState>()((set, get) => ({
  session: null,
  status: 'idle',
  roomCode: '',
  players: [],
  lastError: null,
  localClientId: '',

  hostLobby: (nickname, masterToken) => {
    // Tear down any existing session before opening a new one.
    get().session?.close();

    const roomCode = makeRoomCode();
    const clientId = makeClientId();

    set({
      session: null,
      status: 'connecting',
      roomCode,
      players: [],
      lastError: null,
      localClientId: clientId,
    });

    const session = createRelaySession({
      role: 'host',
      roomCode,
      clientId,
      nickname: nickname || 'Host',
      masterToken,
      callbacks: buildCallbacks(set),
    });

    set({ session });
  },

  joinLobby: (roomCode, nickname) => {
    get().session?.close();

    const code = roomCode.trim().toUpperCase();
    const clientId = makeClientId();

    set({
      session: null,
      status: 'connecting',
      roomCode: code,
      players: [],
      lastError: null,
      localClientId: clientId,
    });

    const session = createRelaySession({
      role: 'guest',
      roomCode: code,
      clientId,
      nickname: nickname || 'Guest',
      callbacks: buildCallbacks(set),
    });

    set({ session });
  },

  leaveLobby: () => {
    get().session?.close();
    set({
      session: null,
      status: 'idle',
      roomCode: '',
      players: [],
      lastError: null,
      localClientId: '',
    });
  },

  registerGameSyncHandlers: (handlers) => {
    gameSyncHandlers = handlers;
  },
}));