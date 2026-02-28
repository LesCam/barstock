/**
 * Bluetooth Scale Manager
 * Manages BLE connections to digital scales for bottle weighing.
 *
 * Uses react-native-ble-plx for BLE communication.
 * Supports scales via pluggable ScaleDriver strategy pattern:
 * - Standard BLE Weight Scale (0x181D)
 * - Skale 2 (custom protocol)
 * - Bridge Adapter (ESP32 JSON-over-BLE)
 */

import { Buffer } from "buffer";
import { Platform, PermissionsAndroid } from "react-native";
import { BleManager, type Device, type Subscription, State } from "react-native-ble-plx";
import { getLastConnectedDevice, setLastConnectedDevice } from "./scale-mappings";
import type { ScaleDriver } from "./scale-driver";
import { ALL_DRIVERS } from "./drivers";

// Re-export types for backward compatibility — consumers keep importing from here
export type { ScaleReading } from "./scale-driver";
export type { ScaleType } from "./scale-driver";

export type ScaleListener = (reading: import("./scale-driver").ScaleReading) => void;

// Standard BLE Battery Service (works for all devices including Bridge ESP32)
const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL_CHARACTERISTIC_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

// Bridge Adapter service UUID (for scan filtering)
const BRIDGE_SERVICE_UUID = "42530001-4272-4964-6765-000000000001";

const KEEPALIVE_INTERVAL_MS = 30_000;

let _manager: BleManager | null = null;

function getManager(): BleManager {
  if (!_manager) {
    _manager = new BleManager();
  }
  return _manager;
}

/** Wait until the BLE adapter is powered on (up to 3 s). */
function waitForPoweredOn(): Promise<void> {
  const manager = getManager();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.remove();
      reject(new Error("Bluetooth adapter did not power on in time"));
    }, 3_000);

    const sub = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        sub.remove();
        clearTimeout(timeout);
        resolve();
      }
    }, true);
  });
}

/** Request BLE permissions on Android (no-op on iOS). */
async function requestBlePermissions(): Promise<void> {
  if (Platform.OS !== "android") return;

  const apiLevel = Platform.Version;

  if (typeof apiLevel === "number" && apiLevel >= 31) {
    // Android 12+
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    const denied = Object.values(result).some(
      (v) => v !== PermissionsAndroid.RESULTS.GRANTED
    );
    if (denied) throw new Error("Bluetooth permissions denied");
  } else {
    // Android 11 and below — need location for BLE scanning
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Location permission denied (required for BLE on Android < 12)");
    }
  }
}

export type DisconnectListener = () => void;

export class ScaleManager {
  private listeners: Set<ScaleListener> = new Set();
  private disconnectListeners: Set<DisconnectListener> = new Set();
  private connectedDeviceId: string | null = null;
  private connectedDevice: Device | null = null;
  private activeDriver: ScaleDriver | null = null;
  private monitorSubscription: Subscription | null = null;
  private batterySubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private _batteryLevel: number | null = null;
  private _intentionalDisconnect = false;
  private _reconnecting = false;

  /**
   * Scan for nearby BLE scale devices (5 s).
   * Filters to only show devices that advertise known scale services
   * or have a name matching known scale brands.
   */
  async scan(): Promise<Array<{ id: string; name: string }>> {
    await requestBlePermissions();
    await waitForPoweredOn();

    const manager = getManager();
    const seen = new Map<string, { id: string; name: string }>();

    const knownScaleNames = [
      "skale", "scale", "acaia", "decent", "felicita", "brewista",
      "bridge", "barstock", "br-",
    ];

    return new Promise((resolve) => {
      manager.startDeviceScan(null, null, (_error, device) => {
        if (!device) return;
        const name = device.name ?? device.localName;
        if (!name || seen.has(device.id)) return;

        // Check if device advertises a known scale service
        const services = (device.serviceUUIDs ?? []).map((s) => s.toLowerCase());
        const hasKnownService =
          services.includes("0000181d-0000-1000-8000-00805f9b34fb") ||
          services.includes(BRIDGE_SERVICE_UUID);

        // Check if name matches known scale brands
        const nameLower = name.toLowerCase();
        const hasScaleName = knownScaleNames.some((pattern) => nameLower.includes(pattern));

        if (hasKnownService || hasScaleName) {
          seen.set(device.id, { id: device.id, name });
        }
      });

      setTimeout(() => {
        manager.stopDeviceScan();
        resolve([...seen.values()]);
      }, 5000);
    });
  }

  /** Select the best driver for a connected device based on confidence scoring. */
  private async selectDriver(device: Device): Promise<ScaleDriver> {
    let best: ScaleDriver | null = null;
    let bestScore = 0;
    for (const driver of ALL_DRIVERS) {
      const score = await driver.canHandle(device);
      if (score > bestScore) {
        bestScore = score;
        best = driver;
      }
    }
    if (!best) throw new Error("No compatible scale driver found");
    return best;
  }

  /**
   * Connect to a specific scale device and start listening for weight readings.
   */
  async connect(deviceId: string): Promise<void> {
    await waitForPoweredOn();

    const manager = getManager();
    const device: Device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    this.connectedDeviceId = deviceId;
    this.connectedDevice = device;
    this._intentionalDisconnect = false;

    // Select and initialize the appropriate driver
    this.activeDriver = await this.selectDriver(device);
    await this.activeDriver.setup(device);

    // Persist for auto-reconnect
    setLastConnectedDevice(deviceId).catch(() => {});

    // Listen for unexpected disconnection
    this.disconnectSubscription = device.onDisconnected(() => {
      this.handleUnexpectedDisconnect();
    });

    // Start weight monitoring via driver
    this.monitorSubscription = await this.activeDriver.startMonitoring(
      device,
      deviceId,
      (reading) => this.listeners.forEach((l) => l(reading)),
      () => this.handleUnexpectedDisconnect(),
    );

    if (this.activeDriver.needsKeepalive) {
      this.startKeepalive();
    }

    // Attempt to read battery level (best-effort, non-blocking)
    this.monitorBattery(device).catch(() => {});
  }

  /** Handle unexpected BLE disconnection — clean up state and attempt auto-reconnect. */
  private handleUnexpectedDisconnect(): void {
    this.stopKeepalive();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.batterySubscription?.remove();
    this.batterySubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.activeDriver?.cleanup();
    this.activeDriver = null;
    this.connectedDeviceId = null;
    this.connectedDevice = null;
    this._batteryLevel = null;

    if (this._intentionalDisconnect) {
      this._intentionalDisconnect = false;
      this.disconnectListeners.forEach((listener) => listener());
      return;
    }

    // Attempt auto-reconnect with exponential backoff (1s, 3s, 9s)
    this._reconnecting = true;
    this.disconnectListeners.forEach((listener) => listener());

    const delays = [1000, 3000, 9000];
    const tryReconnect = async (attempt: number): Promise<void> => {
      if (attempt >= delays.length || this._intentionalDisconnect) {
        this._reconnecting = false;
        return;
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
      if (this._intentionalDisconnect || this.connectedDeviceId) {
        this._reconnecting = false;
        return;
      }
      const success = await this.reconnectLast();
      if (!success) {
        await tryReconnect(attempt + 1);
      } else {
        this._reconnecting = false;
      }
    };
    tryReconnect(0).catch(() => { this._reconnecting = false; });
  }

  /** Attempt to read and monitor battery level via standard BLE Battery Service. */
  private async monitorBattery(device: Device): Promise<void> {
    try {
      const services = await device.services();
      let hasBatteryService = false;
      for (const service of services) {
        if (service.uuid.toLowerCase() === BATTERY_SERVICE_UUID) {
          hasBatteryService = true;
          break;
        }
      }
      if (!hasBatteryService) return;

      // Read initial value
      const char = await device.readCharacteristicForService(
        BATTERY_SERVICE_UUID,
        BATTERY_LEVEL_CHARACTERISTIC_UUID
      );
      if (char?.value) {
        const buf = Buffer.from(char.value, "base64");
        if (buf.length >= 1) {
          this._batteryLevel = buf[0];
        }
      }

      // Monitor for updates
      this.batterySubscription = device.monitorCharacteristicForService(
        BATTERY_SERVICE_UUID,
        BATTERY_LEVEL_CHARACTERISTIC_UUID,
        (_error, characteristic) => {
          if (!characteristic?.value) return;
          const buf = Buffer.from(characteristic.value, "base64");
          if (buf.length >= 1) {
            this._batteryLevel = buf[0];
          }
        }
      );
    } catch {
      // Battery service not available — that's fine
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.connectedDevice && this.activeDriver?.needsKeepalive) {
        this.activeDriver.keepaliveTick(this.connectedDevice).catch(() => {});
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /** Tare (zero) the scale if the active driver supports it. */
  async tare(): Promise<void> {
    if (this.connectedDevice && this.activeDriver?.canTare) {
      await this.activeDriver.tare(this.connectedDevice);
    }
  }

  /** Disconnect from current scale. */
  async disconnect(): Promise<void> {
    if (!this.connectedDeviceId) return;

    this._intentionalDisconnect = true;
    this.stopKeepalive();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.batterySubscription?.remove();
    this.batterySubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.activeDriver?.cleanup();
    this.activeDriver = null;

    const manager = getManager();
    await manager.cancelDeviceConnection(this.connectedDeviceId);
    this.connectedDeviceId = null;
    this.connectedDevice = null;
    this._batteryLevel = null;
  }

  onReading(listener: ScaleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /** Attempt to reconnect to the last successfully connected device. */
  async reconnectLast(): Promise<boolean> {
    try {
      const lastId = await getLastConnectedDevice();
      if (!lastId) return false;
      await this.connect(lastId);
      return true;
    } catch {
      return false;
    }
  }

  get isConnected() {
    return this.connectedDeviceId !== null;
  }

  get isReconnecting() {
    return this._reconnecting;
  }

  get currentScaleType() {
    return this.activeDriver?.type ?? null;
  }

  get batteryLevel(): number | null {
    return this._batteryLevel;
  }

  get deviceId(): string | null {
    return this.connectedDeviceId;
  }
}

export const scaleManager = new ScaleManager();
