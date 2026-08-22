/**
 * Relay transport — validated WebSocket client for cloud lobbies.
 * Host = source of truth; guests send intents and receive filtered events.
 */

import type { GameEvent } from '@engine/events';
import {
  envelope,
  isRelayServerMessage,
  parseRelayMessage,
  type RelayClientMessage,
  type RelayPlayerInfo,
  type RelayServerMessage,
} from '@lib/relayProtocol';

export type RelayRole = 'host' | 'guest';
const HEARTBEAT_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 6;
const MAX_EVENT_BATCH = 2048;

export interface RelaySession {
  readonly role: RelayRole;
  readonly roomCode: string;
  readonly players: RelayPlayerInfo[];
  readonly status: 'connecting' | 'connected' | 'closed' | 'error';
  readonly lastError: string | null;
  sendEvents(events: GameEvent[]): Promise<void>;
  sendEventsTo?(clientId: string, events: GameEvent[]): Promise<void>;
  sendIntent(intent: string, payload: unknown): Promise<void>;
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
const DEV_RELAY_URL = 'ws://127.0.0.1:8080';

export function getRelayUrl(): string {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? DEV_RELAY_URL : DEFAULT_RELAY_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGameEventBatch(value: unknown): value is GameEvent[] {
  return Array.isArray(value)
    && value.length <= MAX_EVENT_BATCH
    && value.every((item) => isRecord(item)
      && typeof item.type === 'string'
      && typeof item.id === 'string'
      && typeof item.actorId === 'string'
      && typeof item.seq === 'number'
      && Number.isInteger(item.seq));
}

class RelayTransport implements RelaySession {
  readonly role: RelayRole;
  roomCode: string;
  status: RelaySession['status'] = 'connecting';
  lastError: string | null = null;
  players: RelayPlayerInfo[] = [];

  private ws: WebSocket | null = null;
  private callbacks: RelayCallbacks;
  private clientId: string;
  private nickname: string;
  private masterToken?: string;
  private resumeToken: string | null = null;
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
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      const message: RelayClientMessage = this.role === 'host'
        ? {
            type: 'create_room',
            clientId: this.clientId,
            nickname: this.nickname,
            masterToken: this.masterToken,
            roomCode: this.roomCode || undefined,
            resumeToken: this.resumeToken ?? undefined,
          }
        : { type: 'join_room', roomCode: this.roomCode, clientId: this.clientId, nickname: this.nickname };
      try { this.send(message); } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
    };

    this.ws.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      const message = parseRelayMessage(raw);
      if (!message || !isRelayServerMessage(message)) {
        this.fail('Invalid relay message or protocol version');
        return;
      }
      this.handleServerMessage(message);
    };

    this.ws.onerror = () => this.fail('WebSocket error');
    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (this.closedByUser || this.status === 'closed') return;
      this.scheduleReconnect();
    };
  }

  private fail(message: string): void {
    this.status = 'error';
    this.lastError = message;
    this.callbacks.onError(new Error(message));
  }

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
    this.reconnectTimer = setTimeout(() => this.connect(this.url), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.pongTimeout) clearTimeout(this.pongTimeout);
      try {
        this.send({ type: 'ping' });
      } catch {
        this.ws.close();
        return;
      }
      this.pongTimeout = setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.heartbeatTimer = null;
    this.pongTimeout = null;
  }

  private handleServerMessage(message: RelayServerMessage): void {
    switch (message.type) {
      case 'room_created':
        this.roomCode = message.roomCode;
        this.resumeToken = message.resumeToken;
        this.status = 'connected';
        this.players = message.players;
        this.callbacks.onOpen(this);
        this.callbacks.onPlayersChanged(message.players);
        break;
      case 'room_joined':
        this.status = 'connected';
        this.players = message.players;
        this.callbacks.onOpen(this);
        this.callbacks.onPlayersChanged(message.players);
        break;
      case 'player_joined':
        this.players = this.players.some((p) => p.clientId === message.player.clientId)
          ? this.players.map((p) => p.clientId === message.player.clientId ? message.player : p)
          : [...this.players, message.player];
        this.callbacks.onPlayersChanged(this.players);
        this.callbacks.onPlayerJoined?.(message.player);
        break;
      case 'player_left': {
        const left = this.players.find((player) => player.clientId === message.clientId);
        this.players = this.players.filter((player) => player.clientId !== message.clientId);
        this.callbacks.onPlayersChanged(this.players);
        if (left) this.callbacks.onPlayerLeft?.(left);
        break;
      }
      case 'relay': {
        let payload: unknown;
        try { payload = JSON.parse(message.payload) as unknown; } catch { this.callbacks.onError(new Error('Invalid relay payload')); break; }
        if (this.role === 'host') {
          if (!isRecord(payload) || typeof payload.intent !== 'string' || payload.intent.length > 64) {
            this.callbacks.onError(new Error('Invalid guest intent'));
            break;
          }
          this.callbacks.onIntentReceived?.(payload.intent, payload.payload, message.from);
        } else if (isGameEventBatch(payload)) {
          this.callbacks.onEventsReceived(payload);
        } else {
          this.callbacks.onError(new Error('Invalid event batch'));
        }
        break;
      }
      case 'room_closed':
        this.status = 'closed';
        this.callbacks.onRoomClosed?.();
        this.callbacks.onClose();
        break;
      case 'error':
        this.status = 'error';
        this.lastError = message.message;
        this.callbacks.onError(new Error(message.message));
        if (['room_not_found', 'room_full', 'master_required', 'host_auth_unavailable', 'host_resume_required', 'version_mismatch', 'client_in_use'].includes(message.code)) {
          this.fatalError = true;
        }
        this.ws?.close();
        break;
      case 'pong':
        if (this.pongTimeout) clearTimeout(this.pongTimeout);
        this.pongTimeout = null;
        break;
    }
  }

  private send(message: RelayClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Relay socket is not open');
    const encoded = JSON.stringify(envelope(message));
    if (encoded.length > 256 * 1024) throw new Error('Relay message exceeds 256KB');
    this.ws.send(encoded);
  }

  async sendEvents(events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') throw new Error('Only the host broadcasts events');
    if (!isGameEventBatch(events)) throw new Error('Invalid event batch');
    this.send({ type: 'relay', to: 'all', payload: JSON.stringify(events) });
  }

  async sendEventsTo(clientId: string, events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') throw new Error('Only the host sends events');
    if (!isGameEventBatch(events)) throw new Error('Invalid event batch');
    this.send({ type: 'relay', to: clientId, payload: JSON.stringify(events) });
  }

  async sendIntent(intent: string, payload: unknown): Promise<void> {
    if (this.role !== 'guest') throw new Error('Only guests send intents');
    if (!/^[a-z0-9_:-]{1,64}$/i.test(intent)) throw new Error('Invalid intent');
    this.send({ type: 'relay', to: 'host', payload: JSON.stringify({ intent, payload }) });
  }

  async requestSnapshot(): Promise<void> {
    if (this.role !== 'guest') return;
    await this.sendIntent('request_snapshot', {});
  }

  close(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { this.send({ type: 'leave_room' }); } catch { /* already disconnected */ }
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
