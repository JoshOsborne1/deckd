import Constants from 'expo-constants';
import { BleManager, Device, Characteristic, BleError } from 'react-native-ble-plx';
import { Platform } from 'react-native';
import {
  type DeckdWireMessage,
  type HandshakeMessage,
  DECKD_PROTOCOL_VERSION,
  encodeWireMessage,
  handshakeCompatible,
  parseWireMessage,
} from '@lib/bleProtocol';

export const DECKD_SERVICE_UUID = 'F000DE10-0000-4000-8000-00805F9B34FB';
export const DECKD_CHARACTERISTIC_UUID = 'F000DE11-0000-4000-8000-00805F9B34FB';

const HOST_SERVICE_PREFIX = 'Deckd-Host-';

const CONNECTION_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;
const DECKD_BLE_UNAVAILABLE_MESSAGE =
  'DeckdBle native module is unavailable in this runtime. Use a dev build (expo start --dev-client).';

type DeckdBleModule = {
  addListener: (event: 'onPeripheralWrite', handler: (event: { base64: string }) => void) => { remove: () => void };
  notifySubscribers: (base64: string) => Promise<boolean>;
  startAdvertising: (serviceName: string) => Promise<void>;
  stopAdvertising: () => Promise<void>;
};

function getDeckdBleModule(): DeckdBleModule | null {
  try {
    const mod = require('deckd-ble') as unknown;
    const candidate =
      typeof mod === 'object' && mod !== null && 'default' in mod
        ? (mod as { default?: unknown }).default
        : mod;
    if (
      candidate &&
      typeof candidate === 'object' &&
      'addListener' in candidate &&
      'notifySubscribers' in candidate &&
      'startAdvertising' in candidate &&
      'stopAdvertising' in candidate
    ) {
      return candidate as DeckdBleModule;
    }
    return null;
  } catch {
    return null;
  }
}

export type BLEConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'advertising';

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
  onDeviceFound?: (device: Device) => void;
  /** All parsed wire messages (handshake, ping, game_state). */
  onWireMessage?: (message: DeckdWireMessage) => void;
}

function appBuildString(): string {
  const v = Constants.expoConfig?.version ?? '0';
  const ios = Constants.expoConfig?.ios?.buildNumber;
  const android = Constants.expoConfig?.android?.versionCode;
  if (Platform.OS === 'ios' && ios) return `${v}(${ios})`;
  if (Platform.OS === 'android' && android != null) return `${v}(${android})`;
  return String(v);
}

export class BLEService {
  private manager: BleManager;
  private device: Device | null = null;
  private callbacks: BLECallbacks | null = null;
  private connectionState: BLEConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isHost = false;
  private hostServiceName: string | null = null;
  private hostWriteSubscription: { remove: () => void } | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  public setCallbacks(callbacks: BLECallbacks): void {
    this.callbacks = callbacks;
  }

  public getConnectionState(): BLEConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: BLEConnectionState): void {
    this.connectionState = state;
    this.callbacks?.onConnectionStateChange(state);
  }

  private generateHostServiceName(): string {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${HOST_SERVICE_PREFIX}${randomSuffix}`;
  }

  private dispatchWire(msg: DeckdWireMessage): void {
    this.callbacks?.onWireMessage?.(msg);
    if (msg.type === 'game_state') {
      this.callbacks?.onGameStateReceived({
        type: 'game_state',
        data: msg.data,
        timestamp: msg.timestamp,
        senderId: msg.senderId,
      });
    }
  }

  private attachHostWriteListener(): void {
    const deckdBle = getDeckdBleModule();
    if (!deckdBle) {
      throw new Error(DECKD_BLE_UNAVAILABLE_MESSAGE);
    }
    this.hostWriteSubscription?.remove();
    this.hostWriteSubscription = deckdBle.addListener('onPeripheralWrite', (e) => {
      try {
        const json = this.base64Decode(e.base64);
        const msg = parseWireMessage(json);
        if (!msg) return;
        if (msg.type === 'handshake' && msg.role === 'guest') {
          if (!handshakeCompatible(msg.protocolVersion)) {
            this.callbacks?.onError(new Error('Incompatible protocol version from guest'));
            return;
          }
          void this.replyHostHandshake();
        }
        this.dispatchWire(msg);
      } catch (err) {
        this.callbacks?.onError(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private async replyHostHandshake(): Promise<void> {
    const deckdBle = getDeckdBleModule();
    if (!deckdBle) {
      throw new Error(DECKD_BLE_UNAVAILABLE_MESSAGE);
    }
    const reply: HandshakeMessage = {
      type: 'handshake',
      protocolVersion: DECKD_PROTOCOL_VERSION,
      role: 'host',
      appBuild: appBuildString(),
      clientId: this.hostServiceName ?? 'host',
    };
    const json = encodeWireMessage(reply);
    const b64 = this.base64Encode(json);
    await deckdBle.notifySubscribers(b64);
  }

  /**
   * Host: peripheral advertising + GATT; guest path still uses ble-plx central.
   */
  public async startHostAdvertising(): Promise<string> {
    this.isHost = true;
    this.hostServiceName = this.generateHostServiceName();

    try {
      this.setConnectionState('advertising');

      const state = await this.manager.state();
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth is not powered on. Current state: ${state}`);
      }

      if (Platform.OS === 'web') {
        throw new Error('BLE host advertising is not available on web.');
      }

      const deckdBle = getDeckdBleModule();
      if (!deckdBle) {
        throw new Error(DECKD_BLE_UNAVAILABLE_MESSAGE);
      }
      await deckdBle.startAdvertising(this.hostServiceName);
      this.attachHostWriteListener();
      return this.hostServiceName;
    } catch (error) {
      this.hostWriteSubscription?.remove();
      this.hostWriteSubscription = null;
      this.setConnectionState('disconnected');
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks?.onError(err);
      throw err;
    }
  }

  public async stopHostAdvertising(): Promise<void> {
    if (!this.isHost) return;
    this.hostWriteSubscription?.remove();
    this.hostWriteSubscription = null;
    try {
      if (Platform.OS !== 'web') {
        const deckdBle = getDeckdBleModule();
        if (deckdBle) {
          await deckdBle.stopAdvertising();
        }
      }
    } catch {
      /* ignore */
    }
    this.setConnectionState('disconnected');
    this.hostServiceName = null;
  }

  public async startScanningForHosts(): Promise<void> {
    this.isHost = false;

    try {
      this.setConnectionState('scanning');

      const state = await this.manager.state();
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth is not powered on. Current state: ${state}`);
      }

      this.manager.startDeviceScan(
        [DECKD_SERVICE_UUID],
        { allowDuplicates: false },
        (error: BleError | null, scannedDevice: Device | null) => {
          if (error) {
            this.callbacks?.onError(error);
            this.stopScanning();
            return;
          }

          const nameOk = scannedDevice?.localName?.startsWith(HOST_SERVICE_PREFIX) ?? false;
          if (nameOk || scannedDevice?.name?.startsWith(HOST_SERVICE_PREFIX)) {
            this.callbacks?.onDeviceFound?.(scannedDevice!);
          }
        },
      );
    } catch (error) {
      this.setConnectionState('disconnected');
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks?.onError(err);
      throw err;
    }
  }

  public stopScanning(): void {
    this.manager.stopDeviceScan();
    if (this.connectionState === 'scanning') {
      this.setConnectionState('disconnected');
    }
  }

  public async connectToDevice(targetDevice: Device): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return;
    }

    this.setConnectionState('connecting');

    try {
      const connectedDevice = await this.connectWithTimeout(targetDevice);
      this.device = connectedDevice;

      await this.discoverServices();

      await this.setupNotifications();

      this.reconnectAttempts = 0;
      this.setConnectionState('connected');

      await this.sendGuestHandshake();
    } catch (error) {
      await this.handleConnectionError(error, targetDevice);
    }
  }

  private async sendGuestHandshake(): Promise<void> {
    const msg: HandshakeMessage = {
      type: 'handshake',
      protocolVersion: DECKD_PROTOCOL_VERSION,
      role: 'guest',
      appBuild: appBuildString(),
      clientId: `guest-${Date.now().toString(36)}`,
    };
    await this.sendRawJson(encodeWireMessage(msg));
  }

  private async sendRawJson(json: string): Promise<void> {
    if (!this.device || this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }
    const base64Value = this.base64Encode(json);
    await this.device.writeCharacteristicWithResponseForService(
      DECKD_SERVICE_UUID,
      DECKD_CHARACTERISTIC_UUID,
      base64Value,
    );
  }

  private async connectWithTimeout(targetDevice: Device): Promise<Device> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      targetDevice
        .connect()
        .then((device) => {
          clearTimeout(timeoutId);
          resolve(device);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async discoverServices(): Promise<void> {
    if (!this.device) {
      throw new Error('No device connected');
    }

    await this.device.discoverAllServicesAndCharacteristics();
  }

  private async setupNotifications(): Promise<void> {
    if (!this.device) {
      throw new Error('No device connected');
    }

    this.device.monitorCharacteristicForService(
      DECKD_SERVICE_UUID,
      DECKD_CHARACTERISTIC_UUID,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error) {
          this.callbacks?.onError(error);
          return;
        }

        if (characteristic?.value) {
          try {
            const decodedValue = this.base64Decode(characteristic.value);
            const msg = parseWireMessage(decodedValue);
            if (msg) {
              if (msg.type === 'handshake' && msg.role === 'host' && !handshakeCompatible(msg.protocolVersion)) {
                this.callbacks?.onError(new Error('Incompatible protocol version from host'));
                return;
              }
              this.dispatchWire(msg);
            } else {
              const message: GameStateMessage = JSON.parse(decodedValue);
              this.callbacks?.onGameStateReceived(message);
            }
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            this.callbacks?.onError(e);
          }
        }
      },
    );
  }

  private async handleConnectionError(error: unknown, targetDevice: Device): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, this.reconnectAttempts - 1);

      this.callbacks?.onError(
        new Error(
          `Connection failed, retrying in ${backoffMs}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
        ),
      );

      this.reconnectTimeoutId = setTimeout(() => {
        this.connectToDevice(targetDevice).catch((e) => {
          this.callbacks?.onError(e instanceof Error ? e : new Error(String(e)));
        });
      }, backoffMs);
    } else {
      this.setConnectionState('disconnected');
      this.callbacks?.onError(err);
    }
  }

  public async sendGameState(gameState: unknown): Promise<void> {
    if (!this.device || this.connectionState !== 'connected') {
      throw new Error('Not connected to any device');
    }

    const message: DeckdWireMessage = {
      type: 'game_state',
      data: gameState,
      timestamp: Date.now(),
      senderId: this.hostServiceName || 'client',
    };

    const jsonString = encodeWireMessage(message);
    await this.sendRawJson(jsonString);
  }

  /** Host pushes a notify to subscribed centrals (e.g. after processing guest write). */
  public async notifySubscribersJson(json: string): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const deckdBle = getDeckdBleModule();
    if (!deckdBle) {
      return false;
    }
    return deckdBle.notifySubscribers(this.base64Encode(json));
  }

  public disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.device) {
      this.device.cancelConnection().catch(() => {});
      this.device = null;
    }

    this.reconnectAttempts = 0;
    this.setConnectionState('disconnected');
  }

  public destroy(): void {
    this.disconnect();
    this.stopScanning();
    void this.stopHostAdvertising();
    this.manager.destroy();
  }

  private base64Encode(str: string): string {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return btoa(str);
    }
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binString);
  }

  private base64Decode(str: string): string {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return atob(str);
    }
    const binString = atob(str);
    const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
}

let bleServiceInstance: BLEService | null = null;

export function getBLEService(): BLEService {
  if (!bleServiceInstance) {
    bleServiceInstance = new BLEService();
  }
  return bleServiceInstance;
}

export function destroyBLEService(): void {
  if (bleServiceInstance) {
    bleServiceInstance.destroy();
    bleServiceInstance = null;
  }
}
