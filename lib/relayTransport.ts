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
  onIntentReceived?: (intent: string, payload: unknown) => void;
  onSnapshotRequested?: () => void;
  onPlayersChanged: (players: RelayPlayerInfo[]) => void;
  onPlayerJoined?: (player: RelayPlayerInfo) => void;
  onPlayerLeft?: (player: RelayPlayerInfo) => void;
  onRoomClosed?: () => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

const DEFAULT_RELAY_URL = 'wss://relay.roxai.click/ws';

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
    this.connect(opts.url ?? DEFAULT_RELAY_URL);
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
      const msg: RelayClientMessage =
        this.role === 'host'
          ? { type: 'create_room', clientId: this.clientId, nickname: this.nickname, masterToken: this.masterToken }
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
      if (this.closedByUser) return;
      this.status = 'closed';
      this.callbacks.onClose();
    };
  }

  private handleServerMessage(msg: RelayServerMessage): void {
    switch (msg.type) {
      case 'room_created':
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
            this.callbacks.onIntentReceived?.(parsed.intent, parsed.payload);
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
        break;
      }
      case 'pong':
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
