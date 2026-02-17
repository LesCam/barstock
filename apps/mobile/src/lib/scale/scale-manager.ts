/**
 * Bluetooth Scale Manager
 * Manages BLE connections to digital scales for bottle weighing.
 *
 * Uses react-native-ble-plx for BLE communication.
 * Supports scales that broadcast weight via BLE characteristic notifications.
 */

import { Buffer } from "buffer";
import { Platform, PermissionsAndroid } from "react-native";
import { BleManager, type Device, type Subscription, State } from "react-native-ble-plx";

export interface ScaleReading {
  weightGrams: number;
  stable: boolean;
  deviceId: string;
  deviceName: string;
  timestamp: Date;
}

export type ScaleListener = (reading: ScaleReading) => void;

// Weight Scale Service (0x181D) and Weight Measurement characteristic (0x2A9D)
const WEIGHT_SERVICE_UUID = "0000181d-0000-1000-8000-00805f9b34fb";
const WEIGHT_CHARACTERISTIC_UUID = "00002a9d-0000-1000-8000-00805f9b34fb";

let _manager: BleManager | null = null;

function getManager(): BleManager {
  if (!_manager) {
    _manager = new BleManager();
  }
  return _manager;
}

/** Wait until the BLE adapter is powered on (up to 10 s). */
function waitForPoweredOn(): Promise<void> {
  const manager = getManager();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.remove();
      reject(new Error("Bluetooth adapter did not power on within 10 s"));
    }, 10_000);

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

export class ScaleManager {
  private listeners: Set<ScaleListener> = new Set();
  private connectedDeviceId: string | null = null;
  private monitorSubscription: Subscription | null = null;

  /**
   * Scan for nearby BLE devices (5 s).
   * Returns all named devices — the user picks their scale from the list.
   */
  async scan(): Promise<Array<{ id: string; name: string }>> {
    await requestBlePermissions();
    await waitForPoweredOn();

    const manager = getManager();
    const seen = new Map<string, { id: string; name: string }>();

    return new Promise((resolve) => {
      manager.startDeviceScan(null, null, (_error, device) => {
        if (!device) return;
        const name = device.name ?? device.localName;
        if (name && !seen.has(device.id)) {
          seen.set(device.id, { id: device.id, name });
        }
      });

      setTimeout(() => {
        manager.stopDeviceScan();
        resolve([...seen.values()]);
      }, 5000);
    });
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

    // Monitor weight characteristic
    this.monitorSubscription = device.monitorCharacteristicForService(
      WEIGHT_SERVICE_UUID,
      WEIGHT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;

        const buf = Buffer.from(characteristic.value, "base64");
        const weightGrams = buf.readUInt16LE(1) / 10;
        const stable = (buf[0] & 0x01) === 0;

        const reading: ScaleReading = {
          weightGrams,
          stable,
          deviceId,
          deviceName: device.name || "Scale",
          timestamp: new Date(),
        };

        this.listeners.forEach((listener) => listener(reading));
      }
    );
  }

  /** Disconnect from current scale. */
  async disconnect(): Promise<void> {
    if (!this.connectedDeviceId) return;

    this.monitorSubscription?.remove();
    this.monitorSubscription = null;

    const manager = getManager();
    await manager.cancelDeviceConnection(this.connectedDeviceId);
    this.connectedDeviceId = null;
  }

  onReading(listener: ScaleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isConnected() {
    return this.connectedDeviceId !== null;
  }
}

export const scaleManager = new ScaleManager();
