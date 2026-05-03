/**
 * Transport abstraction — BLE is primary; optional network is supplementary.
 */

import type { GameEvent } from '@engine/events';

export type TransportKind = 'ble' | 'network' | 'none';

export interface GameTransport {
  readonly kind: TransportKind;
  /** Host sends one serialized event to connected peers (BLE: best-effort notify). */
  sendEvent(event: GameEvent): Promise<void>;
  close(): void;
}

export function createNullTransport(): GameTransport {
  return {
    kind: 'none',
    async sendEvent() {},
    close() {},
  };
}
