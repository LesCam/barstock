/**
 * Bluetooth Scale Manager
 * Manages BLE connections to digital scales for bottle weighing.
 *
 * Uses react-native-ble-plx for BLE communication.
 * Supports scales that broadcast weight via BLE characteristic notifications.
 */

export interface ScaleReading {
  weightGrams: number;
  stable: boolean;
  deviceId: string;
  deviceName: string;
  timestamp: Date;
}

export type ScaleListener = (reading: ScaleReading) => void;

export class ScaleManager {
  private listeners: Set<ScaleListener> = new Set();
  private connectedDeviceId: string | null = null;

  /**
   * Scan for nearby BLE scales.
   * Returns list of discovered devices.
   */
  async scan(): Promise<Array<{ id: string; name: string }>> {
    // BleManager from react-native-ble-plx is imported dynamically
    // to avoid crashes on simulators without BLE support
    const { BleManager } = await import("react-native-ble-plx");
    const manager = new BleManager();

    return new Promise((resolve) => {
      const devices: Array<{ id: string; name: string }> = [];

      manager.startDeviceScan(null, null, (error, device) => {
        if (error) return;
        if (device?.name?.toLowerCase().includes("scale")) {
          devices.push({ id: device.id, name: device.name || "Unknown Scale" });
        }
      });

      setTimeout(() => {
        manager.stopDeviceScan();
        resolve(devices);
      }, 5000);
    });
  }

  /**
   * Connect to a specific scale device and start listening for weight readings.
   */
  async connect(deviceId: string): Promise<void> {
    const { BleManager } = await import("react-native-ble-plx");
    const manager = new BleManager();

    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    this.connectedDeviceId = deviceId;

    // Monitor weight characteristic — UUID varies by scale manufacturer
    // Common: 0x181D (Weight Scale Service), 0x2A9D (Weight Measurement)
    device.monitorCharacteristicForService(
      "0000181d-0000-1000-8000-00805f9b34fb",
      "00002a9d-0000-1000-8000-00805f9b34fb",
      (error, characteristic) => {
        if (error || !characteristic?.value) return;

        const buffer = Buffer.from(characteristic.value, "base64");
        const weightGrams = buffer.readUInt16LE(1) / 10;
        const stable = (buffer[0] & 0x01) === 0;

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

  /** Disconnect from current scale */
  async disconnect(): Promise<void> {
    if (!this.connectedDeviceId) return;
    const { BleManager } = await import("react-native-ble-plx");
    const manager = new BleManager();
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
