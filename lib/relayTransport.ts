/**
 * Relay transport — WebSocket client for cloud lobbies.
 * Replaces the old BLE transport. Host = source of truth, guests send
 * intents, host broadcasts event batches. The server is a dumb pipe.
 */

import type { GameEvent } from '@engine/events';
import {
  parseRelayMessage,
  type RelayClientMessage,
  type RelayPlayerInfo,
  type RelayServerMessage,
} from '@lib/relayProtocol';

export type RelayRole = 'host' | 'guest';

/** Heartbeat interval and pong grace. A missed pong forces a reconnect. */
const HEARTBEAT_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 8000;
/** Max reconnect attempts before giving up (1s, 2s, 4s, 8s, 15s, 15s…). */
const MAX_RECONNECT_ATTEMPTS = 6;

export interface RelaySession {
  readonly role: RelayRole;
  readonly roomCode: string;
  readonly players: RelayPlayerInfo[];
  readonly status: 'connecting' | 'connected' | 'closed' | 'error';
  readonly lastError: string | null;

  /** Host: broadcast events to all guests. Guest: send intent to host. */
  sendEvents(events: GameEvent[]): Promise<void>;
  /** Guest: send an intent (join, ready, request_action) to host. */
  sendIntent(intent: string, payload: unknown): Promise<void>;
  /** Host: request a snapshot be sent to a specific guest (rejoin). */
  requestSnapshot(): Promise<void>;
  close(): void;
}

export interface RelayCallbacks {
  onOpen: (session: RelaySession) => void;
  onEventsReceived: (events: GameEvent[]) => void;
  onIntentReceived?: (intent: string, payload: unknown, fromClientId?: string) => void;
  onSnapshotRequested?: (fromClientId?: string) => void;
  onPlayersChanged: (players: RelayPlayerInfo[]) => void;
  onPlayerJoined?: (player: RelayPlayerInfo) => void;
  onPlayerLeft?: (player: RelayPlayerInfo) => void;
  onRoomClosed?: () => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

const DEFAULT_RELAY_URL = 'wss://relay.roxai.click/ws';

/** Local relay server for development (cd server && node index.js). */
const DEV_RELAY_URL = 'ws://127.0.0.1:8080';

/**
 * Resolve the relay WebSocket URL for the current build.
 * In __DEV__ we talk to the local server; production uses the cloud relay.
 */
export function getRelayUrl(): string {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? DEV_RELAY_URL : DEFAULT_RELAY_URL;
}

class RelayTransport implements RelaySession {
  readonly role: RelayRole;
  readonly roomCode: string;
  status: RelaySession['status'] = 'connecting';
  lastError: string | null = null;
  players: RelayPlayerInfo[] = [];

  private ws: WebSocket | null = null;
  private callbacks: RelayCallbacks;
  private clientId: string;
  private nickname: string;
  private masterToken?: string;
  private closedByUser = false;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private fatalError = false;

  constructor(opts: {
    role: RelayRole;
    roomCode: string;
    clientId: string;
    nickname: string;
    masterToken?: string;
    callbacks: RelayCallbacks;
    url?: string;
  }) {
    this.role = opts.role;
    this.roomCode = opts.roomCode;
    this.clientId = opts.clientId;
    this.nickname = opts.nickname;
    this.masterToken = opts.masterToken;
    this.callbacks = opts.callbacks;
    this.url = opts.url ?? getRelayUrl();
    this.connect(this.url);
  }

  private connect(url: string): void {
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.status = 'error';
      this.lastError = e instanceof Error ? e.message : String(e);
      this.callbacks.onError(new Error(this.lastError));
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      const msg: RelayClientMessage =
        this.role === 'host'
          ? {
              type: 'create_room',
              clientId: this.clientId,
              nickname: this.nickname,
              masterToken: this.masterToken,
              roomCode: this.roomCode,
            }
          : { type: 'join_room', roomCode: this.roomCode, clientId: this.clientId, nickname: this.nickname };
      this.send(msg);
    };

    this.ws.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : '';
      const msg = parseRelayMessage(raw);
      if (!msg) return;
      this.handleServerMessage(msg as RelayServerMessage);
    };

    this.ws.onerror = () => {
      this.status = 'error';
      this.lastError = 'WebSocket error';
      this.callbacks.onError(new Error(this.lastError));
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (this.closedByUser) return;
      if (this.status === 'closed') return; // room_closed already handled
      this.scheduleReconnect();
    };
  }

  /**
   * Reconnect with exponential backoff. The same clientId is reused, so the
   * server can reclaim the seat/room during its grace window. On success the
   * guest re-requests a snapshot (bridge watches status transitions) and the
   * host resumes broadcasting.
   */
  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    if (this.fatalError || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.status = 'closed';
      this.lastError = this.fatalError ? this.lastError : 'Connection lost. Rejoin the lobby to continue.';
      this.callbacks.onClose();
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 15000);
    this.status = 'connecting';
    this.lastError = 'Connection lost. Reconnecting…';
    this.callbacks.onError(new Error(this.lastError));
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url);
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.pongTimeout = setTimeout(() => {
          // No pong in time — force close to trigger the reconnect path.
          this.ws?.close();
        }, PONG_TIMEOUT_MS);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleServerMessage(msg: RelayServerMessage): void {
    switch (msg.type) {
      case 'room_created': {
        // Server assigns the final room code; capture it for the host.
        (this as { roomCode: string }).roomCode = msg.roomCode;
        this.status = 'connected';
        this.players = msg.players;
        this.callbacks.onOpen(this);
        this.callbacks.onPlayersChanged(msg.players);
        break;
      }
      case 'room_joined': {
        this.status = 'connected';
        this.players = msg.players;
        this.callbacks.onOpen(this);
        this.callbacks.onPlayersChanged(msg.players);
        break;
      }
      case 'player_joined': {
        this.players = [...this.players, msg.player];
        this.callbacks.onPlayersChanged(this.players);
        this.callbacks.onPlayerJoined?.(msg.player);
        break;
      }
      case 'player_left': {
        this.players = this.players.filter((p) => p.clientId !== msg.clientId);
        this.callbacks.onPlayersChanged(this.players);
        const left = this.players.find((p) => p.clientId === msg.clientId);
        if (left) this.callbacks.onPlayerLeft?.(left);
        break;
      }
      case 'relay': {
        if (this.role === 'host') {
          // Guest -> host: parse as intent.
          try {
            const parsed = JSON.parse(msg.payload) as { intent: string; payload: unknown };
            this.callbacks.onIntentReceived?.(parsed.intent, parsed.payload, msg.from);
          } catch {
            this.callbacks.onError(new Error('Failed to parse guest intent'));
          }
        } else {
          // Host -> guest: parse as event batch.
          try {
            const events = JSON.parse(msg.payload) as GameEvent[];
            this.callbacks.onEventsReceived(events);
          } catch {
            this.callbacks.onError(new Error('Failed to parse event batch'));
          }
        }
        break;
      }
      case 'room_closed': {
        this.status = 'closed';
        this.callbacks.onRoomClosed?.();
        this.callbacks.onClose();
        break;
      }
      case 'error': {
        this.status = 'error';
        this.lastError = msg.message;
        this.callbacks.onError(new Error(msg.message));
        // Fatal protocol errors (room_not_found, room_full, master_required)
        // will never succeed on retry. Mark fatal so the close handler gives
        // up instead of reconnecting into the same error.
        if (msg.code === 'room_not_found' || msg.code === 'room_full' || msg.code === 'master_required') {
          this.fatalError = true;
        }
        this.ws?.close();
        break;
      }
      case 'pong':
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
        break;
    }
  }

  private send(msg: RelayClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async sendEvents(events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Only the host broadcasts events');
    }
    this.send({ type: 'relay', to: 'all', payload: JSON.stringify(events) });
  }

  async sendIntent(intent: string, payload: unknown): Promise<void> {
    if (this.role !== 'guest') {
      throw new Error('Only guests send intents');
    }
    this.send({ type: 'relay', to: 'host', payload: JSON.stringify({ intent, payload }) });
  }

  async requestSnapshot(): Promise<void> {
    if (this.role !== 'host') return;
    // Host pushes a snapshot to a rejoining guest via a relay message.
    this.send({ type: 'relay', to: 'all', payload: JSON.stringify({ type: 'snapshot_request' }) });
  }

  close(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.send({ type: 'leave_room' });
    this.ws?.close();
    this.status = 'closed';
  }
}

export function createRelaySession(opts: {
  role: RelayRole;
  roomCode: string;
  clientId: string;
  nickname: string;
  masterToken?: string;
  callbacks: RelayCallbacks;
  url?: string;
}): RelaySession {
  return new RelayTransport(opts);
}
