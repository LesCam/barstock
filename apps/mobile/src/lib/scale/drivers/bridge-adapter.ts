import { Buffer } from "buffer";
import { Platform } from "react-native";
import type { Device, Subscription } from "react-native-ble-plx";
import type { ScaleDriver, ScaleReading } from "../scale-driver";
import { parseCommercialFrame } from "../frame-parsers";

const BRIDGE_SERVICE_UUID = "42530001-4272-4964-6765-000000000001";
const BRIDGE_FRAME_CHARACTERISTIC_UUID = "42530001-4272-4964-6765-000000000002";

const MAX_BUFFER_SIZE = 2048;

interface BridgeFrame {
  device_id: string;
  port: string;
  baud: number;
  frame: string;
  ts_ms: number;
}

export class BridgeAdapterDriver implements ScaleDriver {
  readonly type = "bridge" as const;
  readonly displayName = "Bridge Adapter";
  readonly canTare = false;
  readonly needsKeepalive = false;
  readonly requiresMtuNegotiation = true;

  private chunkBuffer = "";

  async canHandle(device: Device): Promise<number> {
    try {
      const services = await device.services();
      for (const service of services) {
        if (service.uuid.toLowerCase() === BRIDGE_SERVICE_UUID) {
          return 95;
        }
      }
    } catch {
      // Service discovery may fail
    }
    return 0;
  }

  async setup(device: Device): Promise<void> {
    // Android needs explicit MTU negotiation for JSON payloads
    // iOS auto-negotiates but the call is harmless
    if (Platform.OS === "android") {
      await device.requestMTU(512);
    }
  }

  async startMonitoring(
    device: Device,
    deviceId: string,
    emitReading: (reading: ScaleReading) => void,
    onError: () => void,
  ): Promise<Subscription> {
    this.chunkBuffer = "";

    // Find the service containing the bridge frame characteristic
    const services = await device.services();
    let serviceUUID: string | null = null;
    for (const service of services) {
      if (service.uuid.toLowerCase() === BRIDGE_SERVICE_UUID) {
        serviceUUID = service.uuid;
        break;
      }
    }

    if (!serviceUUID) {
      throw new Error("Could not find Bridge Adapter service");
    }

    return device.monitorCharacteristicForService(
      serviceUUID,
      BRIDGE_FRAME_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          onError();
          return;
        }
        if (!characteristic?.value) return;

        const chunk = Buffer.from(characteristic.value, "base64").toString("utf-8");
        this.chunkBuffer += chunk;

        // Safety: clear buffer if it grows too large without a delimiter
        if (this.chunkBuffer.length > MAX_BUFFER_SIZE) {
          this.chunkBuffer = "";
          return;
        }

        // Process complete newline-delimited JSON lines
        let newlineIdx: number;
        while ((newlineIdx = this.chunkBuffer.indexOf("\n")) !== -1) {
          const line = this.chunkBuffer.slice(0, newlineIdx).trim();
          this.chunkBuffer = this.chunkBuffer.slice(newlineIdx + 1);

          if (!line) continue;

          let bridgeFrame: BridgeFrame;
          try {
            bridgeFrame = JSON.parse(line);
          } catch {
            continue; // Skip malformed JSON
          }

          if (!bridgeFrame.frame) continue;

          const parsed = parseCommercialFrame(bridgeFrame.frame);
          if (!parsed) continue;

          emitReading({
            weightGrams: parsed.weightGrams,
            stable: parsed.stable,
            deviceId,
            deviceName: device.name || `Bridge ${bridgeFrame.device_id || ""}`.trim(),
            timestamp: new Date(),
          });
        }
      },
    );
  }

  async tare(_device: Device): Promise<void> {
    // Tare is on the physical scale, not the bridge
  }

  async keepaliveTick(_device: Device): Promise<void> {
    // USB-C powered, always-on — no keepalive needed
  }

  cleanup(): void {
    this.chunkBuffer = "";
  }
}
