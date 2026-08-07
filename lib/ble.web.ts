// Web platform stub — BLE is not available in browsers.
// Metro resolves this file instead of ble.ts on web builds.

import type { DeckdWireMessage } from '@lib/bleProtocol';

export const DECKD_SERVICE_UUID = 'F000DE10-0000-4000-8000-00805F9B34FB';
export const DECKD_CHARACTERISTIC_UUID = 'F000DE11-0000-4000-8000-00805F9B34FB';

export type BLEConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'advertising';

export interface BLECallbacks {
  onConnectionStateChange: (state: BLEConnectionState) => void;
  onError: (error: Error) => void;
  onDeviceFound?: (device: unknown) => void;
  onWireMessage?: (message: DeckdWireMessage) => void;
}

export class BLEService {
  setCallbacks(_callbacks: BLECallbacks): void {}
  addCallbacks(_callbacks: BLECallbacks): () => void {
    return () => {};
  }
  getConnectionState(): BLEConnectionState {
    return 'disconnected';
  }
  async startHostAdvertising(): Promise<string> {
    throw new Error('BLE host advertising is not available on web. Use a dev build on physical devices.');
  }
  async stopHostAdvertising(): Promise<void> {}
  async startScanningForHosts(): Promise<void> {}
  stopScanning(): void {}
  async connectToDevice(_device: unknown): Promise<void> {
    throw new Error('BLE device connections are not available on web.');
  }
  async sendRawJson(_json: string): Promise<void> {
    throw new Error('BLE writes are not available on web.');
  }
  async notifySubscribersJson(_json: string): Promise<boolean> {
    return false;
  }
  disconnect(): void {}
  destroy(): void {}
}

let bleServiceInstance: BLEService | null = null;

export function getBLEService(): BLEService {
  if (!bleServiceInstance) {
    bleServiceInstance = new BLEService();
  }
  return bleServiceInstance;
}

export function destroyBLEService(): void {
  bleServiceInstance = null;
}
