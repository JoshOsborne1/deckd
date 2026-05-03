import { create } from 'zustand';
import { getBLEService, type BLEConnectionState } from '@lib/ble';

export interface DiscoveredDeviceRow {
  id: string;
  label: string;
}

interface BleStoreState {
  connectionState: BLEConnectionState;
  devices: DiscoveredDeviceRow[];
  lastError: string | null;
  /** Idempotent — wires singleton BLE callbacks into this store. */
  attach: () => void;
  startScan: () => Promise<void>;
  stopScan: () => void;
  clearError: () => void;
}

let attached = false;

export const useBleStore = create<BleStoreState>((set, get) => ({
  connectionState: 'disconnected',
  devices: [],
  lastError: null,

  attach: () => {
    if (attached) return;
    attached = true;
    const ble = getBLEService();
    ble.setCallbacks({
      onConnectionStateChange: (s) => set({ connectionState: s }),
      onGameStateReceived: () => {},
      onError: (e) => set({ lastError: e.message }),
      onDeviceFound: (device: { id: string; name: string | null; localName: string | null }) => {
        const label = device.localName ?? device.name ?? device.id;
        set((state) => {
          if (state.devices.some((d) => d.id === device.id)) return state;
          return { devices: [...state.devices, { id: device.id, label }] };
        });
      },
    });
  },

  startScan: async () => {
    set({ lastError: null, devices: [] });
    try {
      await getBLEService().startScanningForHosts();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ lastError: msg });
      throw e;
    }
  },

  stopScan: () => {
    getBLEService().stopScanning();
  },

  clearError: () => set({ lastError: null }),
}));
