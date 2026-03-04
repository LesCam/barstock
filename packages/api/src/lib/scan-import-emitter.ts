import { EventEmitter } from "events";

export interface ScanImportEvent {
  type: "barcode_scanned" | "item_added" | "item_removed";
  payload?: Record<string, unknown>;
}

class ScanImportEventEmitter extends EventEmitter {
  /** Maps scanSessionId → owning businessId */
  private owners = new Map<string, string>();

  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  /** Register or verify ownership. Returns false if a different business already owns this session. */
  claimSession(scanSessionId: string, businessId: string): boolean {
    const existing = this.owners.get(scanSessionId);
    if (existing && existing !== businessId) return false;
    this.owners.set(scanSessionId, businessId);
    return true;
  }

  releaseSession(scanSessionId: string) {
    this.owners.delete(scanSessionId);
  }

  notifyScanSession(scanSessionId: string, event: ScanImportEvent) {
    this.emit(`scan:${scanSessionId}`, event);
  }
}

export const scanImportEmitter = new ScanImportEventEmitter();
