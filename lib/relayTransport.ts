/**
 * Relay transport — validated WebSocket client for cloud lobbies.
 * Host = source of truth; guests send intents and receive filtered events.
 */

import type { GameEvent } from '@engine/events';
import {
  encodeBatchAck,
  encodeEventBatch,
  hasSeqGap,
  parseBatchAck,
  parseEventBatchEnvelope,
  type BatchAckEnvelope,
} from '@lib/relayAck';
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
const ACK_TIMEOUT_MS = 2500;
const ACK_RETRIES = 3;

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
  private nextBatchSeq = 1;
  private readonly pendingAcks = new Map<string, {
    resolve: () => void;
    reject: (error: Error) => void;
    retries: number;
    timer: ReturnType<typeof setTimeout>;
    to: string;
    payload: string;
  }>();
  /** Highest event seq delivered to the guest (for gap detection). */
  private lastDeliveredSeq = 0;
  private gapResyncTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.flushPendingAcks();
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
        this.lastDeliveredSeq = 0; // Fresh session: reset the gap cursor.
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
          const ack = parseBatchAck(payload);
          if (ack) {
            this.handleBatchAck(ack);
            break;
          }
          if (!isRecord(payload) || typeof payload.intent !== 'string' || payload.intent.length > 64) {
            this.callbacks.onError(new Error('Invalid guest intent'));
            break;
          }
          this.callbacks.onIntentReceived?.(payload.intent, payload.payload, message.from);
        } else if (this.role === 'guest') {
          const batch = parseEventBatchEnvelope(payload);
          if (batch) {
            // Deliver + ACK, or re-request a snapshot if a seq gap means a
            // batch was lost and the guest's event chain has a hole.
            if (hasSeqGap(this.lastDeliveredSeq, batch.firstSeq)) {
              this.requestGapSnapshot();
              break;
            }
            if (batch.events.length > 0) this.lastDeliveredSeq = batch.lastSeq;
            this.send({ type: 'relay', to: message.from, payload: encodeBatchAck(batch.batchId, batch.lastSeq) });
            this.callbacks.onEventsReceived(batch.events);
          } else if (isGameEventBatch(payload)) {
            // Legacy raw event batch from an old host: deliver unchanged.
            if (payload.length > 0) this.lastDeliveredSeq = Math.max(...payload.map((e) => e.seq));
            this.callbacks.onEventsReceived(payload);
          } else {
            this.callbacks.onError(new Error('Invalid event batch'));
          }
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

  private ackKey(batchId: string): string {
    return `${this.clientId}:${batchId}`;
  }

  private handleBatchAck(ack: BatchAckEnvelope): void {
    const key = this.ackKey(ack.batchId);
    const pending = this.pendingAcks.get(key);
    if (!pending) return; // Duplicate or unknown ACK: nothing to settle.
    if (pending.timer) clearTimeout(pending.timer);
    this.pendingAcks.delete(key);
    pending.resolve();
  }

  private retryAck(batchId: string): void {
    const key = this.ackKey(batchId);
    const pending = this.pendingAcks.get(key);
    if (!pending) return;
    if (pending.retries >= ACK_RETRIES) {
      this.pendingAcks.delete(key);
      pending.reject(new Error(`Event batch ${batchId} was not acknowledged by the guest`));
      return;
    }
    // Re-send the same payload; the guest dedups by event id + batchId.
    pending.retries += 1;
    try {
      this.send({ type: 'relay', to: pending.to, payload: pending.payload });
    } catch (error) {
      this.pendingAcks.delete(key);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    pending.timer = setTimeout(() => this.retryAck(batchId), ACK_TIMEOUT_MS);
  }

  private flushPendingAcks(): void {
    for (const pending of this.pendingAcks.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('Relay disconnected before event batch was acknowledged'));
    }
    this.pendingAcks.clear();
  }

  private requestGapSnapshot(): void {
    if (this.gapResyncTimer) return; // Already scheduled.
    this.gapResyncTimer = setTimeout(() => {
      this.gapResyncTimer = null;
      void this.requestSnapshot();
    }, 500);
  }

  async sendEvents(events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') throw new Error('Only the host broadcasts events');
    if (!isGameEventBatch(events)) throw new Error('Invalid event batch');
    await this.sendEventBatchToAll(events);
  }

  async sendEventsTo(clientId: string, events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') throw new Error('Only the host sends events');
    if (!isGameEventBatch(events)) throw new Error('Invalid event batch');
    await this.sendEventBatchToTarget(clientId, events);
  }

  private async sendEventBatchToAll(events: GameEvent[]): Promise<void> {
    // Broadcast is the server's existing path: send once, relayed to every
    // guest. The ACK contract is per-guest, so we await per-guest ACKs.
    const guests = this.players.filter((p) => !p.isHost).map((p) => p.clientId);
    if (guests.length === 0) return;
    await Promise.all(guests.map((guestId) => this.sendEventBatchToTarget(guestId, events)));
  }

  private async sendEventBatchToTarget(clientId: string, events: GameEvent[]): Promise<void> {
    if (this.role !== 'host') throw new Error('Only the host sends events');
    const batchId = `B-${this.nextBatchSeq++}`;
    const payload = encodeEventBatch(batchId, events);
    this.send({ type: 'relay', to: clientId, payload });
    const key = this.ackKey(batchId);
    await new Promise<void>((resolve, reject) => {
      this.pendingAcks.set(key, {
        resolve,
        reject,
        retries: 0,
        timer: setTimeout(() => this.retryAck(batchId), ACK_TIMEOUT_MS),
        to: clientId,
        payload,
      });
    });
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
