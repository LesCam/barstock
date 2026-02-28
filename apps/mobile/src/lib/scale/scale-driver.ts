import type { Device, Subscription } from "react-native-ble-plx";

export interface ScaleReading {
  weightGrams: number;
  stable: boolean;
  deviceId: string;
  deviceName: string;
  timestamp: Date;
}

export type ScaleType = "standard" | "skale2" | "bridge";

export interface ScaleDriver {
  readonly type: ScaleType;
  readonly displayName: string;
  readonly canTare: boolean;
  readonly needsKeepalive: boolean;
  readonly requiresMtuNegotiation: boolean;

  /** Return confidence 0-100; highest wins driver selection. */
  canHandle(device: Device): Promise<number>;

  /** One-time post-connect setup (send commands, request MTU). */
  setup(device: Device): Promise<void>;

  /** Start weight notifications. Returns BLE subscription for cleanup. */
  startMonitoring(
    device: Device,
    deviceId: string,
    emitReading: (reading: ScaleReading) => void,
    onError: () => void,
  ): Promise<Subscription>;

  /** Tare the scale. No-op if unsupported. */
  tare(device: Device): Promise<void>;

  /** Keepalive tick (called every 30s if needsKeepalive). No-op if unsupported. */
  keepaliveTick(device: Device): Promise<void>;

  /** Cleanup driver state (buffers, timers). Called on disconnect. */
  cleanup(): void;
}
