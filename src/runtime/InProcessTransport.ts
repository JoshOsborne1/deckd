/**
 * In-process transport (blueprint §7.2, Phase 2).
 *
 * Loopback transport for local sessions: no serialisation, no network, no
 * privacy boundary. Used by hot-seat, solo and personal-device hosting during
 * migration.
 */

import type { GameIntent } from '@engine/intents';
import type { GameEvent } from '@engine/events';
import type {
  SessionRuntime,
  CommitResult,
  IntentTranslator,
} from './SessionRuntime';
import type { RuntimeSnapshot } from './snapshot';

export interface TransportSender {
  sendIntent(intent: GameIntent, translate?: IntentTranslator): CommitResult;
}

export interface TransportReceiver {
  onEvents(events: GameEvent[]): void;
}

/**
 * Loopback transport: intents go straight to the local runtime, events come
 * straight back. No privacy filtering — the device is the authority.
 */
export class InProcessTransport implements TransportSender {
  private readonly runtime: SessionRuntime;
  private receiver: TransportReceiver | null = null;

  constructor(runtime: SessionRuntime) {
    this.runtime = runtime;
  }

  attach(receiver: TransportReceiver): void {
    this.receiver = receiver;
  }

  detach(receiver: TransportReceiver): void {
    if (this.receiver === receiver) this.receiver = null;
  }

  sendIntent(intent: GameIntent, translate?: IntentTranslator): CommitResult {
    const result = this.runtime.commit(intent, translate);
    if (result.ok && this.receiver) {
      this.receiver.onEvents(result.events);
    }
    return result;
  }

  snapshot(): RuntimeSnapshot {
    return this.runtime.snapshotEnvelope();
  }
}
