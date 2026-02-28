import { Buffer } from "buffer";
import type { Characteristic, Device, Subscription } from "react-native-ble-plx";
import type { ScaleDriver, ScaleReading } from "../scale-driver";

const SKALE_WEIGHT_CHARACTERISTIC_UUID = "0000ef81-0000-1000-8000-00805f9b34fb";
const SKALE_COMMAND_CHARACTERISTIC_UUID = "0000ef80-0000-1000-8000-00805f9b34fb";

const CMD_TARE = 0x10;
const CMD_UNIT_GRAMS = 0x03;
const CMD_DISPLAY_WEIGHT = 0xec;
const CMD_LED_ON = 0xed;

export class Skale2Driver implements ScaleDriver {
  readonly type = "skale2" as const;
  readonly displayName = "Skale 2";
  readonly canTare = true;
  readonly needsKeepalive = true;
  readonly requiresMtuNegotiation = false;

  private cachedCommandChar: Characteristic | null = null;

  async canHandle(device: Device): Promise<number> {
    try {
      const services = await device.services();
      for (const service of services) {
        const chars = await service.characteristics();
        for (const char of chars) {
          if (char.uuid.toLowerCase() === SKALE_WEIGHT_CHARACTERISTIC_UUID) {
            return 90;
          }
        }
      }
    } catch {
      // Service discovery may fail
    }
    return 0;
  }

  async setup(device: Device): Promise<void> {
    await this.sendCommand(device, CMD_UNIT_GRAMS);
    await this.sendCommand(device, CMD_LED_ON);
  }

  async startMonitoring(
    device: Device,
    deviceId: string,
    emitReading: (reading: ScaleReading) => void,
    onError: () => void,
  ): Promise<Subscription> {
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

    return device.monitorCharacteristicForService(
      serviceUUID,
      SKALE_WEIGHT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          onError();
          return;
        }
        if (!characteristic?.value) return;

        const buf = Buffer.from(characteristic.value, "base64");
        if (buf.length < 3) return;

        // Skale 2 format: byte 0 = flags, bytes 1-2 = weight as uint16 LE (tenths of grams)
        const raw = buf.readUInt16LE(1);
        const weightGrams = raw / 10.0;
        const stable = buf[0] === 0x00;

        emitReading({
          weightGrams: Math.max(0, weightGrams),
          stable,
          deviceId,
          deviceName: device.name || "Skale 2",
          timestamp: new Date(),
        });
      },
    );
  }

  async tare(device: Device): Promise<void> {
    await this.sendCommand(device, CMD_TARE);
  }

  async keepaliveTick(device: Device): Promise<void> {
    await this.sendCommand(device, CMD_DISPLAY_WEIGHT);
  }

  cleanup(): void {
    this.cachedCommandChar = null;
  }

  private async findCommandChar(device: Device): Promise<Characteristic> {
    if (this.cachedCommandChar) return this.cachedCommandChar;

    const services = await device.services();
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (char.uuid.toLowerCase() === SKALE_COMMAND_CHARACTERISTIC_UUID) {
          this.cachedCommandChar = char;
          return char;
        }
      }
    }
    throw new Error("Could not find Skale 2 command characteristic");
  }

  private async sendCommand(device: Device, command: number): Promise<void> {
    const char = await this.findCommandChar(device);
    const data = Buffer.from([command]).toString("base64");
    await char.writeWithoutResponse(data);
  }
}
