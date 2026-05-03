import { NativeModule, registerWebModule } from 'expo';

import type { DeckdBleNativeModule, PeripheralWriteEvent } from './DeckdBle.types';

class DeckdBleWeb extends NativeModule implements DeckdBleNativeModule {
  SERVICE_UUID = 'F000DE10-0000-4000-8000-00805F9B34FB';
  CHARACTERISTIC_UUID = 'F000DE11-0000-4000-8000-00805F9B34FB';

  async startAdvertising(_localName: string): Promise<string> {
    throw new Error('Deckd BLE peripheral host is not available on web.');
  }

  async stopAdvertising(): Promise<void> {}

  isAdvertising(): boolean {
    return false;
  }

  async notifySubscribers(_base64Payload: string): Promise<boolean> {
    return false;
  }

  addListener(
    _eventName: 'onPeripheralWrite',
    _listener: (event: PeripheralWriteEvent) => void,
  ): { remove(): void } {
    return { remove: () => {} };
  }
}

export default registerWebModule(DeckdBleWeb, 'DeckdBle');
