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

// Standard BLE Weight Scale Service (0x181D)
const STANDARD_WEIGHT_SERVICE_UUID = "0000181d-0000-1000-8000-00805f9b34fb";
const STANDARD_WEIGHT_CHARACTERISTIC_UUID = "00002a9d-0000-1000-8000-00805f9b34fb";

// Skale 2 custom UUIDs
const SKALE_WEIGHT_CHARACTERISTIC_UUID = "0000ef81-0000-1000-8000-00805f9b34fb";
const SKALE_COMMAND_CHARACTERISTIC_UUID = "0000ef80-0000-1000-8000-00805f9b34fb";
// Skale 2 commands
const SKALE_CMD_TARE = 0x10;
const SKALE_CMD_UNIT_GRAMS = 0x03;
const SKALE_CMD_DISPLAY_WEIGHT = 0xec;

// Standard BLE Battery Service
const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL_CHARACTERISTIC_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

const KEEPALIVE_INTERVAL_MS = 30_000;

type ScaleType = "standard" | "skale2";

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

export type DisconnectListener = () => void;

export class ScaleManager {
  private listeners: Set<ScaleListener> = new Set();
  private disconnectListeners: Set<DisconnectListener> = new Set();
  private connectedDeviceId: string | null = null;
  private connectedDevice: Device | null = null;
  private scaleType: ScaleType | null = null;
  private monitorSubscription: Subscription | null = null;
  private batterySubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private _batteryLevel: number | null = null;

  /**
   * Scan for nearby BLE scale devices (5 s).
   * Filters to only show devices that advertise the standard weight service
   * or have a name matching known scale brands.
   */
  async scan(): Promise<Array<{ id: string; name: string }>> {
    await requestBlePermissions();
    await waitForPoweredOn();

    const manager = getManager();
    const seen = new Map<string, { id: string; name: string }>();

    const knownScaleNames = ["skale", "scale", "acaia", "decent", "felicita", "brewista"];

    return new Promise((resolve) => {
      manager.startDeviceScan(null, null, (_error, device) => {
        if (!device) return;
        const name = device.name ?? device.localName;
        if (!name || seen.has(device.id)) return;

        // Check if device advertises the standard BLE weight service
        const services = (device.serviceUUIDs ?? []).map((s) => s.toLowerCase());
        const hasWeightService = services.includes(STANDARD_WEIGHT_SERVICE_UUID);

        // Check if name matches known scale brands
        const nameLower = name.toLowerCase();
        const hasScaleName = knownScaleNames.some((pattern) => nameLower.includes(pattern));

        if (hasWeightService || hasScaleName) {
          seen.set(device.id, { id: device.id, name });
        }
      });

      setTimeout(() => {
        manager.stopDeviceScan();
        resolve([...seen.values()]);
      }, 5000);
    });
  }

  /** Detect whether this is a Skale 2 or standard BLE weight scale. */
  private async detectScaleType(device: Device): Promise<ScaleType> {
    const services = await device.services();
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (char.uuid.toLowerCase() === SKALE_WEIGHT_CHARACTERISTIC_UUID) {
          return "skale2";
        }
      }
    }
    return "standard";
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
    this.scaleType = await this.detectScaleType(device);

    // Listen for unexpected disconnection
    this.disconnectSubscription = device.onDisconnected(() => {
      this.handleUnexpectedDisconnect();
    });

    if (this.scaleType === "skale2") {
      await this.sendSkaleCommand(device, SKALE_CMD_UNIT_GRAMS);
      this.monitorSkale2(device, deviceId);
      this.startKeepalive();
    } else {
      this.monitorStandard(device, deviceId);
    }

    // Attempt to read battery level (best-effort, non-blocking)
    this.monitorBattery(device).catch(() => {});
  }

  /** Handle unexpected BLE disconnection — clean up state and notify listeners. */
  private handleUnexpectedDisconnect(): void {
    this.stopKeepalive();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.batterySubscription?.remove();
    this.batterySubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.connectedDeviceId = null;
    this.connectedDevice = null;
    this.scaleType = null;
    this._batteryLevel = null;
    this.disconnectListeners.forEach((listener) => listener());
  }

  private async monitorSkale2(device: Device, deviceId: string): Promise<void> {
    // Find the service that contains the Skale weight characteristic
    const services = await device.services();
    let serviceUUID: string | null = null;
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (char.uuid.toLowerCase() === SKALE_WEIGHT_CHARACTERISTIC_UUID) {
          serviceUUID = service.uuid;
          break;
        }
      }
      if (serviceUUID) break;
    }

    if (!serviceUUID) {
      throw new Error("Could not find Skale 2 weight characteristic");
    }

    this.monitorSubscription = device.monitorCharacteristicForService(
      serviceUUID,
      SKALE_WEIGHT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          this.handleUnexpectedDisconnect();
          return;
        }
        if (!characteristic?.value) return;

        const buf = Buffer.from(characteristic.value, "base64");
        if (buf.length < 3) return;

        // Skale 2 format: byte 0 = flags, bytes 1-2 = weight as uint16 LE (tenths of grams)
        const raw = buf.readUInt16LE(1);
        const weightGrams = raw / 10.0;
        const stable = buf[0] === 0x00;

        const reading: ScaleReading = {
          weightGrams: Math.max(0, weightGrams),
          stable,
          deviceId,
          deviceName: device.name || "Skale 2",
          timestamp: new Date(),
        };

        this.listeners.forEach((listener) => listener(reading));
      }
    );
  }

  private monitorStandard(device: Device, deviceId: string): void {
    this.monitorSubscription = device.monitorCharacteristicForService(
      STANDARD_WEIGHT_SERVICE_UUID,
      STANDARD_WEIGHT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          this.handleUnexpectedDisconnect();
          return;
        }
        if (!characteristic?.value) return;

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

  /** Send a command byte to the Skale 2. */
  private async sendSkaleCommand(device: Device, command: number): Promise<void> {
    const data = Buffer.from([command]).toString("base64");
    const services = await device.services();
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (char.uuid.toLowerCase() === SKALE_COMMAND_CHARACTERISTIC_UUID) {
          await char.writeWithoutResponse(data);
          return;
        }
      }
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.connectedDevice && this.scaleType === "skale2") {
        this.sendSkaleCommand(this.connectedDevice, SKALE_CMD_DISPLAY_WEIGHT).catch(() => {});
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /** Tare (zero) the Skale 2. */
  async tare(): Promise<void> {
    if (this.connectedDevice && this.scaleType === "skale2") {
      await this.sendSkaleCommand(this.connectedDevice, SKALE_CMD_TARE);
    }
  }

  /** Disconnect from current scale. */
  async disconnect(): Promise<void> {
    if (!this.connectedDeviceId) return;

    this.stopKeepalive();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.batterySubscription?.remove();
    this.batterySubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;

    const manager = getManager();
    await manager.cancelDeviceConnection(this.connectedDeviceId);
    this.connectedDeviceId = null;
    this.connectedDevice = null;
    this.scaleType = null;
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

  get isConnected() {
    return this.connectedDeviceId !== null;
  }

  get currentScaleType() {
    return this.scaleType;
  }

  get batteryLevel(): number | null {
    return this._batteryLevel;
  }

  get deviceId(): string | null {
    return this.connectedDeviceId;
  }
}

export const scaleManager = new ScaleManager();
