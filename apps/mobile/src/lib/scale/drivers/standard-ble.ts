import { Buffer } from "buffer";
import type { Device, Subscription } from "react-native-ble-plx";
import type { ScaleDriver, ScaleReading } from "../scale-driver";

const STANDARD_WEIGHT_SERVICE_UUID = "0000181d-0000-1000-8000-00805f9b34fb";
const STANDARD_WEIGHT_CHARACTERISTIC_UUID = "00002a9d-0000-1000-8000-00805f9b34fb";

export class StandardBleDriver implements ScaleDriver {
  readonly type = "standard" as const;
  readonly displayName = "Standard BLE Scale";
  readonly canTare = false;
  readonly needsKeepalive = false;
  readonly requiresMtuNegotiation = false;

  async canHandle(device: Device): Promise<number> {
    try {
      const services = await device.services();
      for (const service of services) {
        if (service.uuid.toLowerCase() === STANDARD_WEIGHT_SERVICE_UUID) {
          return 40;
        }
      }
    } catch {
      // Service discovery may fail
    }
    return 0;
  }

  async setup(_device: Device): Promise<void> {
    // No setup needed for standard BLE scales
  }

  async startMonitoring(
    device: Device,
    deviceId: string,
    emitReading: (reading: ScaleReading) => void,
    onError: () => void,
  ): Promise<Subscription> {
    return device.monitorCharacteristicForService(
      STANDARD_WEIGHT_SERVICE_UUID,
      STANDARD_WEIGHT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          onError();
          return;
        }
        if (!characteristic?.value) return;

        const buf = Buffer.from(characteristic.value, "base64");
        const weightGrams = buf.readUInt16LE(1) / 10;
        const stable = (buf[0] & 0x01) === 0;

        emitReading({
          weightGrams,
          stable,
          deviceId,
          deviceName: device.name || "Scale",
          timestamp: new Date(),
        });
      },
    );
  }

  async tare(_device: Device): Promise<void> {
    // Standard BLE scales don't support remote tare
  }

  async keepaliveTick(_device: Device): Promise<void> {
    // No keepalive needed
  }

  cleanup(): void {
    // No state to clean up
  }
}
