import type { ScaleDriver } from "../scale-driver";
import { BridgeAdapterDriver } from "./bridge-adapter";
import { Skale2Driver } from "./skale2";
import { StandardBleDriver } from "./standard-ble";

export const ALL_DRIVERS: ScaleDriver[] = [
  new BridgeAdapterDriver(), // 95 - highest priority
  new Skale2Driver(), // 90
  new StandardBleDriver(), // 40 - fallback
];
