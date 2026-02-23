import { EventEmitter } from "events";

export interface ScanImportEvent {
  type: "barcode_scanned" | "item_added" | "item_removed";
  payload?: Record<string, unknown>;
}

class ScanImportEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  notifyScanSession(scanSessionId: string, event: ScanImportEvent) {
    this.emit(`scan:${scanSessionId}`, event);
  }
}

export const scanImportEmitter = new ScanImportEventEmitter();
