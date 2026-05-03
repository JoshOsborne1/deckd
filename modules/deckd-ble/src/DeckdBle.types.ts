import type { ViewProps } from 'react-native';

/** Optional WebView shell props (expo-module template) — unused by BLE flows. */
export type DeckdBleViewProps = ViewProps & {
  url: string;
  onLoad?: (event: { nativeEvent: { url: string } }) => void;
};

/** Native Deckd BLE peripheral (host) module — not available on web. */
export type PeripheralWriteEvent = {
  base64: string;
};

export type DeckdBleNativeModule = {
  readonly SERVICE_UUID: string;
  readonly CHARACTERISTIC_UUID: string;
  startAdvertising(localName: string): Promise<string>;
  stopAdvertising(): Promise<void>;
  isAdvertising(): boolean;
  notifySubscribers(base64Payload: string): Promise<boolean>;
  addListener(
    eventName: 'onPeripheralWrite',
    listener: (event: PeripheralWriteEvent) => void,
  ): { remove(): void };
};
