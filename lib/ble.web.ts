// Web platform stub — BLE is not available in browsers.
// Metro resolves this file instead of ble.ts on web builds.

export const DECKD_SERVICE_UUID = 'F000DE10-0000-4000-8000-00805F9B34FB';
export const DECKD_CHARACTERISTIC_UUID = 'F000DE11-0000-4000-8000-00805F9B34FB';

export type BLEConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'advertising';

export interface GameStateMessage {
  type: 'game_state';
  data: unknown;
  timestamp: number;
  senderId: string;
}

export interface BLECallbacks {
  onConnectionStateChange: (state: BLEConnectionState) => void;
  onGameStateReceived: (message: GameStateMessage) => void;
  onError: (error: Error) => void;
  onDeviceFound?: (device: unknown) => void;
}

export class BLEService {
  setCallbacks(_callbacks: BLECallbacks): void {}
  getConnectionState(): BLEConnectionState { return 'disconnected'; }
  async startHostAdvertising(): Promise<string> {
    return 'web-stub';
  }
  async stopHostAdvertising(): Promise<void> {}
  async startScanningForHosts(): Promise<void> {}
  stopScanning(): void {}
  async connectToDevice(_device: unknown): Promise<void> {}
  async sendGameState(_state: unknown): Promise<void> {}
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
