/**
 * Transport abstraction — BLE is primary; optional network is supplementary.
 * Host owns authoritative event log. Guests replicate by folding events.
 */

import type { GameEvent } from '@engine/events';
import {
  type DeckdWireMessage,
  type EventBatchMessage,
  type GuestIntentMessage,
  type AckMessage,
  buildGuestIntent,
  buildAck,
  chunkEventBatch,
  encodeWireMessage,
} from '@lib/bleProtocol';
import { getBLEService, type BLEService, type BLECallbacks } from '@lib/ble';

export type TransportKind = 'ble' | 'network' | 'none';
export type TransportRole = 'host' | 'guest';

export interface GameTransport {
  readonly kind: TransportKind;
  readonly role: TransportRole;
  /** Host sends one or more events to connected peers. Guest sends intents to host. */
  sendEvents(events: GameEvent[]): Promise<void>;
  /** Guest sends an intent (join, ready, request_action) to host */
  sendIntent(intent: GuestIntentMessage['intent'], payload: unknown): Promise<void>;
  /** Request a snapshot from host (guest only) */
  requestSnapshot?(): Promise<void>;
  close(): void;
}

export type TransportCallbacks = {
  onEventsReceived: (events: GameEvent[]) => void;
  onIntentReceived?: (intent: GuestIntentMessage['intent'], payload: unknown) => void;
  onSnapshotReceived?: (snapshot: unknown, nextSeq: number) => void;
  onAckReceived?: (ackMid: string) => void;
  onError: (error: Error) => void;
};

function createNullTransport(): GameTransport {
  return {
    kind: 'none',
    role: 'guest',
    async sendEvents() {},
    async sendIntent() {},
    close() {},
  };
}

class BleTransport implements GameTransport {
  readonly kind: TransportKind = 'ble';
  readonly role: TransportRole;
  private ble: BLEService;
  private callbacks: TransportCallbacks;
  private sessionId: string;
  private pendingAcks = new Map<string, { resolve: () => void; timeout: ReturnType<typeof setTimeout> }>();
  private chunkBuffer = new Map<string, { chunks: string[]; total: number }>();
  private removeBleCallbacks: (() => void) | null = null;

  constructor(opts: {
    role: TransportRole;
    ble: BLEService;
    callbacks: TransportCallbacks;
    sessionId: string;
  }) {
    this.role = opts.role;
    this.ble = opts.ble;
    this.callbacks = opts.callbacks;
    this.sessionId = opts.sessionId;
    this.wireMessageHandler = this.wireMessageHandler.bind(this);

    const bleCallbacks: BLECallbacks = {
      onConnectionStateChange: () => {},
      onError: (err) => this.callbacks.onError(err),
      onWireMessage: this.wireMessageHandler,
    };
    this.removeBleCallbacks = this.ble.addCallbacks(bleCallbacks);
  }

  private wireMessageHandler(msg: DeckdWireMessage): void {
    switch (msg.type) {
      case 'event_batch': {
        this.handleEventBatch(msg);
        break;
      }
      case 'guest_intent': {
        if (this.role === 'host' && this.callbacks.onIntentReceived) {
          try {
            const payload = JSON.parse(msg.payload) as unknown;
            this.callbacks.onIntentReceived(msg.intent, payload);
          } catch {
            this.callbacks.onError(new Error('Failed to parse guest intent payload'));
          }
        }
        break;
      }
      case 'ack': {
        this.handleAck(msg);
        break;
      }
      case 'snapshot': {
        if (this.role === 'guest' && this.callbacks.onSnapshotReceived) {
          try {
            const snapshot = JSON.parse(msg.snapshot) as unknown;
            this.callbacks.onSnapshotReceived(snapshot, msg.nextSeq);
          } catch {
            this.callbacks.onError(new Error('Failed to parse snapshot'));
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private handleEventBatch(msg: EventBatchMessage): void {
    // Reassemble chunks if needed
    let eventsJson = msg.events;
    if (msg.totalChunks != null && msg.totalChunks > 1) {
      const bufferKey = `${msg.sessionId}-${msg.mid}`;
      const existing = this.chunkBuffer.get(bufferKey) ?? { chunks: [], total: msg.totalChunks };
      existing.chunks[msg.chunkIndex ?? 0] = msg.events;
      this.chunkBuffer.set(bufferKey, existing);
      if (existing.chunks.filter(Boolean).length < existing.total) {
        return; // Wait for more chunks
      }
      eventsJson = existing.chunks.join('');
      this.chunkBuffer.delete(bufferKey);
    }

    try {
      const events = JSON.parse(eventsJson) as GameEvent[];
      this.callbacks.onEventsReceived(events);
    } catch {
      this.callbacks.onError(new Error('Failed to parse event batch'));
      return;
    }

    // Send ACK if host requested it and we're a guest
    if (msg.ackPolicy === 'eager' && this.role === 'guest') {
      const ack = buildAck(msg.mid);
      this.ble.sendRawJson(encodeWireMessage(ack)).catch(() => {});
    }
  }

  private handleAck(msg: AckMessage): void {
    const pending = this.pendingAcks.get(msg.ackMid);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(msg.ackMid);
      pending.resolve();
    }
    this.callbacks.onAckReceived?.(msg.ackMid);
  }

  async sendEvents(events: GameEvent[]): Promise<void> {
    const eventsJson = JSON.stringify(events);
    const chunks = chunkEventBatch(this.sessionId, eventsJson, this.role === 'host' ? 'eager' : 'none');

    for (const chunk of chunks) {
      const wire = encodeWireMessage(chunk);
      if (this.role === 'host') {
        // Host notifies all subscribers
        await this.ble.notifySubscribersJson(wire);
      } else {
        // Guest writes to host characteristic
        await this.ble.sendRawJson(wire);
      }
    }
  }

  async sendIntent(intent: GuestIntentMessage['intent'], payload: unknown): Promise<void> {
    if (this.role !== 'guest') {
      throw new Error('Only guests can send intents');
    }
    const msg = buildGuestIntent({ intent, payload: JSON.stringify(payload) });
    await this.ble.sendRawJson(encodeWireMessage(msg));
  }

  close(): void {
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingAcks.clear();
    this.chunkBuffer.clear();
    this.removeBleCallbacks?.();
    this.removeBleCallbacks = null;
  }
}

export function createBleTransport(opts: {
  role: TransportRole;
  sessionId: string;
  callbacks: TransportCallbacks;
}): GameTransport {
  const ble = getBLEService();
  return new BleTransport({ role: opts.role, ble, callbacks: opts.callbacks, sessionId: opts.sessionId });
}

export { createNullTransport };
